#!/usr/bin/env python3
"""Encrypt private/ into docs/vault/ so the public repo only ever holds scrambled bytes.

    python3 -I scripts/lock.py

Reads   private/content.json, private/media.json, private/media/*, private/gate.txt
Writes  docs/vault/gate.json  (public: the question + how to try the keys)
        docs/vault/k-*.bin    the master key, wrapped once per accepted answer
        docs/vault/index.bin  content + media table
        docs/vault/<id>.bin   each photo / the video

The master key is kept in private/vault-key.hex and file ids/IVs are derived from it, so
re-locking after a text edit only changes the files that actually changed (small git diffs).
Must stay in sync with docs/js/vault.js.
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRIVATE = os.path.join(ROOT, "private")
VAULT = os.path.join(ROOT, "docs", "vault")
ITERATIONS = 250_000
KEY_PREFIX = "VAULT-KEY:"
TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".mp3": "audio/mpeg"}


def openssl():
    # The /usr/local copy on this Mac is Intel-only; prefer Homebrew's arm64 build.
    for path in ("/opt/homebrew/bin/openssl", shutil.which("openssl")):
        if path and os.access(path, os.X_OK):
            return path
    sys.exit("openssl not found")


OPENSSL = openssl()


def normalize(s):
    """Must match normalize() in docs/js/vault.js."""
    s = unicodedata.normalize("NFKC", s).lower()
    s = "".join(ch for ch in s if ch.isalnum())
    return re.sub(r"(.)\1+", r"\1", s)


def read_gate():
    question, answers, raw = "", [], []
    with open(os.path.join(PRIVATE, "gate.txt"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("question:"):
                question = line.split(":", 1)[1].strip()
            elif line.startswith("answer:"):
                typed = line.split(":", 1)[1].strip()
                a = normalize(typed)
                if a and a not in answers:
                    answers.append(a)
                    raw.append(typed.lower())
    if not answers:
        sys.exit("private/gate.txt has no answer: lines")
    if "(write" in question or any("(write" in r for r in raw):
        sys.exit("private/gate.txt still has the placeholder text; write the real question and answer")
    if any(len(a) < 4 for a in answers):
        sys.exit("each answer needs at least 4 letters, so nobody can find it by trying combinations")
    return question, answers, raw


def master_key(answers):
    """The key that encrypts everything. A fresh one is made whenever the accepted answers change:
    once published, an old wrapped key stays in git history forever and must never open newer versions."""
    key_path = os.path.join(PRIVATE, "vault-key.hex")
    stamp_path = os.path.join(PRIVATE, "vault-answers.sha256")
    stamp = hashlib.sha256("\n".join(sorted(answers)).encode()).hexdigest()
    old = open(stamp_path).read().strip() if os.path.exists(stamp_path) else None
    if not os.path.exists(key_path) or old != stamp:
        with open(key_path, "w") as f:
            f.write(secrets.token_hex(32))
        with open(stamp_path, "w") as f:
            f.write(stamp)
        if old is not None:
            print("answers changed: made a new master key, so every vault file changes this time")
    with open(key_path) as f:
        return bytes.fromhex(f.read().strip())


def aes_cbc(key, iv, data):
    out = subprocess.run(
        [OPENSSL, "enc", "-aes-256-cbc", "-nosalt", "-K", key.hex(), "-iv", iv.hex()],
        input=data, capture_output=True, check=True,
    )
    return out.stdout


def seal(key, data):
    """16-byte IV + AES-256-CBC. The IV is an HMAC of the content: unchanged files re-encrypt identically."""
    iv = hmac.new(key, b"iv:" + data, hashlib.sha256).digest()[:16]
    return iv + aes_cbc(key, iv, data)


def wrap(key, answer):
    """OpenSSL 'Salted__' format with PBKDF2-SHA256; vault.js unwraps it with Web Crypto."""
    out = subprocess.run(
        [OPENSSL, "enc", "-aes-256-cbc", "-salt", "-pbkdf2", "-iter", str(ITERATIONS), "-md", "sha256", "-pass", "env:VAULT_PASS"],
        input=(KEY_PREFIX + key.hex()).encode(), capture_output=True, check=True,
        env={**os.environ, "VAULT_PASS": answer},
    )
    return out.stdout


def media_refs(node, found):
    if isinstance(node, dict):
        for v in node.values():
            media_refs(v, found)
    elif isinstance(node, list):
        for v in node:
            media_refs(v, found)
    elif isinstance(node, str) and os.path.splitext(node)[1].lower() in TYPES:
        found.append(node)
    return found


def drafts(node, path="content"):
    out = []
    if isinstance(node, dict):
        if node.get("draft"):
            out.append(path)
        for k, v in node.items():
            out += drafts(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            out += drafts(v, f"{path}[{i}]")
    return out


TEXT_EXT = {".html", ".css", ".js", ".json", ".txt", ".md", ".py", ".sh", ".yml", ".yaml", ""}


def publishable_files():
    """Exactly what git would publish: tracked files plus untracked ones that aren't ignored."""
    out = subprocess.run(["git", "-C", ROOT, "ls-files", "--cached", "--others", "--exclude-standard"],
                         capture_output=True, text=True, check=True).stdout
    return [line for line in out.splitlines() if line and os.path.isfile(os.path.join(ROOT, line))]


def leak_check(sentinels, words):
    """Nothing personal may be readable in what gets published: no plain media, no private data files,
    no answers, no copy from content.json, no name or place from private/leak-words.txt."""
    problems = []
    if subprocess.run(["git", "-C", ROOT, "check-ignore", "-q", "private/content.json"]).returncode != 0:
        problems.append("private/ is not ignored by git")
    patterns = [(w, re.compile(r"\b" + re.escape(w) + r"\b")) for w in words]
    for rel in publishable_files():
        ext = os.path.splitext(rel)[1].lower()
        if rel.startswith("private/"):
            problems.append(f"private file would be published: {rel}")
        if ext in TYPES or (rel.startswith("docs/") and ext == ".json" and rel != "docs/vault/gate.json"):
            problems.append(f"plain media/data file would be published: {rel}")
        if ext not in TEXT_EXT:
            continue
        with open(os.path.join(ROOT, rel), encoding="utf-8", errors="ignore") as f:
            text = f.read().lower()
        for s in sentinels:
            if s in text:
                problems.append(f"{rel} contains private text: {s[:40]!r}")
        for w, pat in patterns:
            if pat.search(text):
                problems.append(f"{rel} mentions {w!r}")
    return problems


def unwrap(path, answer):
    out = subprocess.run(
        [OPENSSL, "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", str(ITERATIONS), "-md", "sha256",
         "-pass", "env:VAULT_PASS", "-in", path],
        capture_output=True, env={**os.environ, "VAULT_PASS": answer},
    )
    return out.stdout.decode(errors="ignore") if out.returncode == 0 else None


def self_test(key, answers, keys, bundle):
    """Open the vault the way the page does, with every accepted answer (never printing one),
    and make sure a wrong answer stays locked out."""
    for answer, name in zip(answers, keys):
        if unwrap(os.path.join(VAULT, name), answer) != KEY_PREFIX + key.hex():
            sys.exit(f"SELF-TEST FAILED: {name} doesn't open with its answer")
        if unwrap(os.path.join(VAULT, name), answer + "x") == KEY_PREFIX + key.hex():
            sys.exit(f"SELF-TEST FAILED: {name} opens with a wrong answer")
    with open(os.path.join(VAULT, "index.bin"), "rb") as f:
        raw = f.read()
    plain = subprocess.run([OPENSSL, "enc", "-d", "-aes-256-cbc", "-nosalt", "-K", key.hex(), "-iv", raw[:16].hex()],
                           input=raw[16:], capture_output=True, check=True).stdout
    if plain != bundle:
        sys.exit("SELF-TEST FAILED: index.bin doesn't decrypt back to the content")
    print(f"self-test: {len(answers)} answer(s) open the vault, a wrong one doesn't")


def main():
    with open(os.path.join(PRIVATE, "content.json"), encoding="utf-8") as f:
        content = json.load(f)
    with open(os.path.join(PRIVATE, "media.json"), encoding="utf-8") as f:
        dims = json.load(f)
    question, answers, raw_answers = read_gate()
    if any(a in normalize(question) for a in answers):
        sys.exit("the gate question gives away an answer; reword private/gate.txt")
    remote = subprocess.run(["git", "-C", ROOT, "remote", "get-url", "origin"], capture_output=True, text=True).stdout
    for a in answers:
        if a in normalize(remote):
            sys.exit(f"the answer '{a}' is part of the repo address ({remote.strip()}), so anyone who sees the "
                     "link could guess it. Pick a different answer in private/gate.txt (or rename the repo).")
    key = master_key(answers)

    os.makedirs(VAULT, exist_ok=True)
    for name in os.listdir(VAULT):
        if name.endswith(".bin") or name == "gate.json":
            os.remove(os.path.join(VAULT, name))

    table = {}
    for name in sorted(set(media_refs(content, []))):
        path = os.path.join(PRIVATE, "media", name)
        if not os.path.exists(path):
            sys.exit(f"content.json uses {name}, but private/media/{name} doesn't exist")
        file_id = hmac.new(key, b"id:" + name.encode(), hashlib.sha256).hexdigest()[:16]
        with open(path, "rb") as f:
            blob = seal(key, f.read())
        with open(os.path.join(VAULT, f"{file_id}.bin"), "wb") as f:
            f.write(blob)
        table[name] = {"id": file_id, "type": TYPES[os.path.splitext(name)[1].lower()], "size": dims.get(name)}

    bundle = json.dumps({"content": content, "media": table}, ensure_ascii=False, separators=(",", ":")).encode()
    with open(os.path.join(VAULT, "index.bin"), "wb") as f:
        f.write(seal(key, bundle))

    keys = []
    for i, answer in enumerate(answers):
        name = f"k-{i}.bin"
        with open(os.path.join(VAULT, name), "wb") as f:
            f.write(wrap(key, answer))
        keys.append(name)
    with open(os.path.join(VAULT, "gate.json"), "w", encoding="utf-8") as f:
        json.dump({"question": question, "iterations": ITERATIONS, "keys": keys}, f, ensure_ascii=False, indent=2)
    self_test(key, answers, keys, bundle)

    # Long-ish strings from the content are good canaries for "did any of this leak into public files?"
    sentinels = set()
    for s in re.findall(r'"([^"]{24,})"', json.dumps(content, ensure_ascii=False)):
        sentinels.add(s.lower()[:60])
    words = set(raw_answers)
    words_file = os.path.join(PRIVATE, "leak-words.txt")
    if os.path.exists(words_file):
        with open(words_file, encoding="utf-8") as f:
            words |= {w.strip().lower() for w in f if w.strip() and not w.startswith("#")}
    problems = leak_check(sentinels, sorted(words))
    if problems:
        print("\n".join(problems))
        sys.exit("LEAK CHECK FAILED: fix the above before committing")

    total = sum(os.path.getsize(os.path.join(VAULT, n)) for n in os.listdir(VAULT))
    print(f"locked {len(table)} media files + content → docs/vault ({total / 1e6:.1f} MB), {len(keys)} accepted answer(s)")
    left = drafts(content)
    if left:
        print(f"note: {len(left)} section(s) still marked draft: " + ", ".join(p.removeprefix('content.') for p in left))


if __name__ == "__main__":
    main()

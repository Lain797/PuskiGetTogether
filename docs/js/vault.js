// Everything personal is encrypted in vault/. Her answer to the gate question is the key.
//
// Layout written by scripts/lock.py:
//   vault/gate.json      public: the question, PBKDF2 iterations, and the wrapped-key files
//   vault/k-*.bin        the master key, wrapped once per accepted answer
//                        (OpenSSL "Salted__" format: PBKDF2-SHA256 → AES-256-CBC key + IV)
//   vault/index.bin      the bundle: content.json + media table, encrypted with the master key
//   vault/<id>.bin       each photo/video: 16-byte IV followed by AES-256-CBC ciphertext

const enc = new TextEncoder();
const dec = new TextDecoder();
const KEY_PREFIX = "VAULT-KEY:";

// Must match normalize() in scripts/lock.py.
export function normalize(s) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .replace(/(.)\1+/gu, "$1");
}

export async function loadGate() {
  const res = await fetch("vault/gate.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("vault missing");
  return res.json();
}

async function fetchBytes(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`fetch ${path}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function unwrapMasterKey(file, pass, iterations) {
  const raw = await fetchBytes(`vault/${file}`);
  const salt = raw.slice(8, 16); // after the 8-byte "Salted__" magic
  const body = raw.slice(16);
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, 384),
  );
  const kek = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-CBC", false, ["decrypt"]);
  const plain = dec.decode(await crypto.subtle.decrypt({ name: "AES-CBC", iv: bits.slice(32, 48) }, kek, body));
  if (!plain.startsWith(KEY_PREFIX)) throw new Error("wrong answer");
  const hex = plain.slice(KEY_PREFIX.length).trim();
  const bytes = new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
  return crypto.subtle.importKey("raw", bytes, "AES-CBC", false, ["decrypt"]);
}

async function decryptFile(key, id) {
  const raw = await fetchBytes(`vault/${id}.bin`);
  return crypto.subtle.decrypt({ name: "AES-CBC", iv: raw.slice(0, 16) }, key, raw.slice(16));
}

// Resolves to a media source ({ content, dims(name), url(name) }) or throws if the answer is wrong.
export async function unlock(answer, gate) {
  const pass = normalize(answer);
  if (!pass) throw new Error("wrong answer");
  let key = null;
  for (const file of gate.keys) {
    try {
      key = await unwrapMasterKey(file, pass, gate.iterations);
      break;
    } catch {
      // not this one; try the next accepted answer
    }
  }
  if (!key) throw new Error("wrong answer");

  const bundle = JSON.parse(dec.decode(await decryptFile(key, "index")));
  const cache = new Map();
  return {
    content: bundle.content,
    dims: (name) => bundle.media[name]?.size,
    url(name) {
      if (!cache.has(name)) {
        const m = bundle.media[name];
        if (!m) return Promise.reject(new Error(`unknown media ${name}`));
        cache.set(name, decryptFile(key, m.id).then((buf) => URL.createObjectURL(new Blob([buf], { type: m.type }))));
      }
      return cache.get(name);
    },
  };
}

// Local editing: read private/ directly (only ever reachable from a localhost server).
export async function devSource() {
  const [content, media] = await Promise.all([
    fetch("../private/content.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("../private/media.json", { cache: "no-cache" }).then((r) => r.json()),
  ]);
  return {
    content,
    dims: (name) => media[name],
    url: (name) => Promise.resolve(`../private/media/${name}`),
  };
}

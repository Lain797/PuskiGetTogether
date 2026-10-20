// Everything she can touch: lazy photos, reveals, lightbox, the café stop-motion, the dolls,
// the reasons deck, the video, counters, and holding the button to tie the thread.

const DAY = 86400000;
const daysSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(`${iso}T00:00:00`).getTime()) / DAY));

function load(m, src) {
  src.url(m.dataset.media).then((url) => {
    if (m.tagName === "VIDEO") {
      m.src = url;
      m.dispatchEvent(new Event("media-ready"));
    } else {
      m.addEventListener("load", () => m.classList.add("is-loaded"), { once: true });
      m.src = url;
    }
  }, (err) => console.error(err));
}

// Photos decrypt a screen or two before they're needed. A swipe strip clips its own items,
// so the strip is watched as a whole and loads everything in it at once.
function lazyMedia(root, src) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const group = e.target.matches("[data-media]") ? [e.target] : e.target.querySelectorAll("[data-media]");
        group.forEach((m) => load(m, src));
      }
    },
    { rootMargin: "1400px 0px" },
  );
  root.querySelectorAll(".strip").forEach((s) => io.observe(s));
  root.querySelectorAll("[data-media]").forEach((m) => { if (!m.closest(".strip")) io.observe(m); });
}

// A sweep rather than an IntersectionObserver: a fast fling can carry a block from below the
// screen to above it between two frames, and it must still be visible when she scrolls back.
function reveals(root) {
  let pending = [...root.querySelectorAll(".reveal, .mirror")];
  let queued = false;
  const sweep = () => {
    queued = false;
    const line = window.innerHeight * 0.9;
    pending = pending.filter((n) => {
      if (n.getBoundingClientRect().top > line) return true;
      n.classList.add("is-in");
      n.querySelectorAll("[data-days-since]").forEach((c) => countTo(c, daysSince(c.dataset.daysSince)));
      n.querySelectorAll("[data-count]").forEach((c) => countTo(c, Number(c.dataset.count)));
      return false;
    });
    if (!pending.length) window.removeEventListener("scroll", onScroll);
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(sweep); } };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  requestAnimationFrame(sweep);
  root.querySelectorAll("[data-day-of]").forEach((n) => { n.textContent = daysSince(n.dataset.dayOf) + 1; });
}

function countTo(n, target) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 1800);
    n.textContent = Math.round(target * (1 - (1 - k) ** 3)).toLocaleString("en-US");
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function lightbox(root) {
  const box = document.getElementById("lightbox");
  const big = box.querySelector(".lightbox__img");
  const cap = box.querySelector(".lightbox__cap");
  const close = () => { box.hidden = true; big.removeAttribute("src"); };
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".polaroid__img, .mirror__frame");
    if (!btn || btn.closest(".dolls")) return;
    const im = btn.querySelector("img");
    if (!im?.src) return;
    big.src = im.src;
    cap.textContent = btn.dataset.caption || "";
    box.hidden = false;
    box.querySelector(".lightbox__close").focus();
  });
  box.addEventListener("click", (e) => { if (e.target !== big) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden) close(); });
}

function stopMotion(root, reduced) {
  for (const sm of root.querySelectorAll(".stopmo")) {
    const frames = [...sm.querySelectorAll(".stopmo__frames img")];
    const dots = [...sm.querySelectorAll(".stopmo__dots i")];
    const cap = sm.querySelector(".stopmo__cap");
    let current = 0;
    const show = (i) => {
      if (i === current) return;
      current = i;
      frames.forEach((f, k) => f.classList.toggle("on", k === i));
      dots.forEach((d, k) => d.classList.toggle("on", k === i));
      cap.textContent = sm.dataset[`cap${i}`] || "";
    };
    frames.forEach((f, i) => { sm.dataset[`cap${i}`] = f.dataset.caption || ""; });
    if (reduced) {
      sm.addEventListener("click", () => show((current + 1) % frames.length));
      continue;
    }
    let ticking = false;
    const update = () => {
      ticking = false;
      const r = sm.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = total > 0 ? Math.min(0.999, Math.max(0, -r.top / total)) : 0;
      show(Math.floor(p * frames.length));
    };
    window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  }
}

function dolls(root) {
  root.querySelectorAll(".dolls .polaroid").forEach((p) => {
    p.addEventListener("click", () => {
      p.classList.remove("hop");
      void p.offsetWidth;
      p.classList.add("hop");
    });
    p.addEventListener("animationend", () => p.classList.remove("hop"));
  });
}

function video(root) {
  root.querySelectorAll(".tv").forEach((tv) => {
    const v = tv.querySelector("video");
    const btn = tv.querySelector(".tv__sound");
    let inView = false;
    const sync = () => { if (inView && v.src) v.play().catch(() => {}); else v.pause(); };
    v.addEventListener("media-ready", sync);
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); }, { threshold: 0.4 }).observe(v);
    const toggle = () => {
      v.muted = !v.muted;
      btn.textContent = v.muted ? "sound off" : "sound on";
      if (!v.muted) v.play().catch(() => {});
    };
    v.addEventListener("click", toggle);
    btn.addEventListener("click", toggle);
  });
}

function deck(root) {
  const d = root.querySelector(".deck");
  if (!d) return;
  const items = JSON.parse(d.dataset.items || "[]");
  d.removeAttribute("data-items");
  const count = root.querySelector(".deck__count");
  let order = items.map((_, i) => i);
  let seen = 1;

  const card = (i, depth) => {
    const c = document.createElement("div");
    c.className = "card";
    c.dataset.depth = depth;
    c.setAttribute("role", "listitem");
    const no = document.createElement("span");
    no.className = "card__no";
    no.textContent = `No. ${String(i + 1).padStart(2, "0")}`;
    const t = document.createElement("p");
    t.className = "card__text";
    t.textContent = items[i].replace(/^\[DRAFT\]\s*/, "");
    c.append(no, t);
    return c;
  };

  const render = () => {
    d.replaceChildren(...order.slice(0, 3).map((i, depth) => card(i, depth)).reverse());
    count.textContent = `${Math.min(seen, items.length)} / ${items.length}`;
    bindTop();
  };

  const next = (dir = 1) => {
    const top = d.querySelector('[data-depth="0"]');
    if (!top || top.classList.contains("is-gone")) return;
    top.style.transform = `translateX(${dir * 130}%) rotate(${dir * 16}deg)`;
    top.classList.add("is-gone");
    setTimeout(() => {
      order.push(order.shift());
      seen++;
      render();
    }, 320);
  };

  function bindTop() {
    const top = d.querySelector('[data-depth="0"]');
    if (!top) return;
    let x0 = null, dx = 0, moved = false;
    top.addEventListener("pointerdown", (e) => {
      x0 = e.clientX; dx = 0; moved = false;
      top.setPointerCapture(e.pointerId);
      top.classList.add("is-dragging");
    });
    top.addEventListener("pointermove", (e) => {
      if (x0 == null) return;
      dx = e.clientX - x0;
      if (Math.abs(dx) > 6) moved = true;
      top.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    });
    const end = () => {
      if (x0 == null) return;
      x0 = null;
      top.classList.remove("is-dragging");
      if (!moved) next(1);
      else if (Math.abs(dx) > 80) next(Math.sign(dx));
      else top.style.transform = "";
    };
    top.addEventListener("pointerup", end);
    top.addEventListener("pointercancel", end);
    top.tabIndex = 0;
    top.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") { e.preventDefault(); next(1); } });
  }

  root.querySelector(".deck__shuffle")?.addEventListener("click", () => {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    seen = 1;
    render();
  });
  render();
}

function holdToTie(root, story, onTied) {
  const btn = root.querySelector(".hold__btn");
  if (!btn) return;
  const ring = btn.querySelector(".hold__ring");
  const label = root.querySelector(".hold__label");
  const idle = label.textContent;
  const holdingText = "keep holding…";
  const C = 289;
  const NEED = 1700;
  let p = 0, holding = false, last = 0, raf = 0, done = false;

  const frame = (t) => {
    const dt = t - (last || t);
    last = t;
    p = holding ? Math.min(1, p + dt / NEED) : Math.max(0, p - dt / 600);
    ring.style.strokeDashoffset = C * (1 - p);
    if (p >= 1 && !done) return tie();
    raf = p > 0 || holding ? requestAnimationFrame(frame) : 0;
  };
  const start = (e) => {
    if (done) return;
    e?.preventDefault();
    holding = true;
    btn.classList.add("is-holding");
    label.textContent = holdingText;
    last = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    holding = false;
    btn.classList.remove("is-holding");
    if (!done) label.textContent = idle;
  };
  function tie() {
    done = true;
    raf = 0;
    holding = false;
    story.classList.add("is-tied");
    navigator.vibrate?.(40);
    hearts();
    onTied?.();
  }

  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointerleave", stop);
  btn.addEventListener("pointercancel", stop);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  btn.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) start(e); });
  btn.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") stop(); });
}

function hearts() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = document.createElement("div");
  box.className = "hearts";
  for (let i = 0; i < 26; i++) {
    const h = document.createElement("i");
    h.textContent = "♥";
    h.style.left = `${Math.random() * 100}%`;
    h.style.fontSize = `${12 + Math.random() * 22}px`;
    h.style.setProperty("--d", `${3 + Math.random() * 2.5}s`);
    h.style.setProperty("--x", `${(Math.random() - 0.5) * 120}px`);
    h.style.setProperty("--rot", `${(Math.random() - 0.5) * 70}deg`);
    h.style.animationDelay = `${1.2 + Math.random() * 1.4}s`;
    box.append(h);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 9000);
}

export function initInteractions(story, src, { reduced, onTied }) {
  // Captions for the stop-motion frames come from content, keyed by frame order.
  const frames = Object.values(src.content).find((sec) => sec?.hug)?.hug?.frames || [];
  story.querySelectorAll(".stopmo__frames img").forEach((im, i) => { im.dataset.caption = frames[i]?.caption || ""; });

  lazyMedia(story, src);
  reveals(story);
  lightbox(story);
  stopMotion(story, reduced);
  dolls(story);
  story.addEventListener("click", (e) => {
    const st = e.target.closest(".sticker");
    if (!st) return;
    st.classList.remove("pop");
    void st.getBoundingClientRect();
    st.classList.add("pop");
  });
  video(story);
  deck(story);
  holdToTie(story, story, onTied);
  story.querySelector(".foot__top")?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }));

  // knot art length for the draw-in
  const loop = story.querySelector(".knot__loop");
  if (loop) loop.style.setProperty("--len", Math.ceil(loop.getTotalLength()));
}

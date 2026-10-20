// The red thread: one SVG path through every [data-thread] anchor, sewn down the page as she scrolls.
// It frays and breaks at the hard part, comes back loose, and is tied for real at the knot.

const NS = "http://www.w3.org/2000/svg";
const SAMPLE_STEP = 10;
const DRAW_LINE = 0.62; // the thread's tip follows this fraction of the viewport height

function node(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// Layout position inside the story, ignoring reveal transforms (offsetTop doesn't see them).
function posIn(el, root) {
  let x = 0, y = 0, n = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function catmullRom(p) {
  const f = (v) => v.toFixed(1);
  let d = `M${f(p[0].x)},${f(p[0].y)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

export function createThread(story, svg, { reduced = false } = {}) {
  const segs = []; // { el:[shadow, main], len, lens, xs, ys, maxY, drawn, fibers, fiberAt }
  let tip = null;
  let raf = 0;
  let width = 0;

  function anchors() {
    const W = story.clientWidth;
    const gL = Math.max(10, Math.min(W * 0.035, 34));
    const gR = W - gL;
    const runs = [[]];
    for (const el of story.querySelectorAll("[data-thread]")) {
      const t = el.dataset.thread;
      // Sticky blocks (the desktop prose column) move with the scroll, so they can't hold the thread.
      if (!t || getComputedStyle(el).position === "sticky") continue;
      const r = posIn(el, story);
      const run = runs[runs.length - 1];
      if (t === "photo") {
        if (r.h) run.push({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      } else if (t === "left" || t === "right") {
        if (!r.h) continue;
        const x = t === "left" ? Math.max(gL, r.x - 22) : Math.min(gR, r.x + r.w + 22);
        run.push({ x, y: r.y + 8 }, { x, y: r.y + r.h - 8, rail: true });
      } else if (t === "break") {
        run.push({ x: r.x + r.w * 0.38, y: r.y + r.h * 0.45 });
        runs.push([]);
      } else if (t === "resume") {
        run.push({ x: r.x + r.w * 0.62, y: r.y });
      } else if (t === "end") {
        run.push({ x: r.x, y: r.y - 26 }, { x: r.x, y: r.y + 2, rail: true });
      }
    }
    return runs.filter((r) => r.length > 1).map((r) => meander(r, gL, gR, W));
  }

  // Long straight stretches get a lazy sideways wander so it reads as thread, not a line.
  function meander(pts, gL, gR, W) {
    const out = [pts[0]];
    let side = 1;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dy = b.y - a.y;
      if (!b.rail && dy > 560) {
        const n = Math.floor(dy / 560);
        for (let k = 1; k <= n; k++) {
          const t = k / (n + 1);
          const x = Math.min(gR, Math.max(gL, a.x + (b.x - a.x) * t + side * W * 0.17));
          out.push({ x, y: a.y + dy * t });
          side = -side;
        }
      }
      out.push(b);
    }
    return out;
  }

  function fibers(seg, atEnd) {
    const i = atEnd ? seg.xs.length - 1 : 0;
    const j = atEnd ? Math.max(0, i - 3) : Math.min(seg.xs.length - 1, 3);
    let dx = seg.xs[i] - seg.xs[j], dy = seg.ys[i] - seg.ys[j];
    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;
    const nx = -dy, ny = dx, ex = seg.xs[i], ey = seg.ys[i];
    return [-1.3, -0.45, 0.4, 1.25].map((s, k) => {
      const len = 13 + k * 3.5;
      const d = `M${ex},${ey} Q${ex + dx * len * 0.6 + nx * s * 5},${ey + dy * len * 0.6 + ny * s * 5} ${ex + dx * len + nx * s * 13},${ey + dy * len + ny * s * 13}`;
      return node("path", { class: "thread__fiber", d });
    });
  }

  function rebuild() {
    width = story.clientWidth;
    const H = story.scrollHeight;
    svg.setAttribute("width", width);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${width} ${H}`);
    const prev = segs.map((s) => s.drawn);
    svg.replaceChildren();
    segs.length = 0;

    anchors().forEach((pts, idx) => {
      const g = node("g", { class: idx === 0 ? "thread__tight" : "thread__loose" });
      const d = catmullRom(pts);
      const shadow = node("path", { class: "thread__shadow", d });
      const main = node("path", { class: "thread__main", d });
      g.append(shadow, main);
      svg.append(g);
      const len = main.getTotalLength();
      const lens = [], xs = [], ys = [], maxY = [];
      let my = -Infinity;
      for (let l = 0; l <= len; l += SAMPLE_STEP) {
        const p = main.getPointAtLength(l);
        lens.push(l); xs.push(p.x); ys.push(p.y);
        my = Math.max(my, p.y); maxY.push(my);
      }
      const seg = { el: [shadow, main], len, lens, xs, ys, maxY, drawn: prev[idx] ?? 0 };
      for (const p of seg.el) p.style.strokeDasharray = `${len} ${len}`;
      // The first run frays at its end (the break); the second run starts frayed.
      seg.fibers = fibers(seg, idx === 0);
      seg.fiberAtEnd = idx === 0;
      svg.append(...seg.fibers);
      segs.push(seg);
    });
    // A single run means nothing is broken (e.g. content without a hard part): no fibers.
    if (segs.length === 1) segs[0].fibers.forEach((f) => f.remove());

    // the needle is a little heart
    tip = node("path", { class: "thread__tip", d: "M0 5C-5.5 1-8-2-8-5c0-2.4 1.8-4.2 4-4.2 1.7 0 3.1 1 4 2.4.9-1.4 2.3-2.4 4-2.4 2.2 0 4 1.8 4 4.2 0 3-2.5 6-8 10z" });
    svg.append(tip);
    paint(true);
  }

  function lengthAtY(seg, y) {
    const { maxY, lens } = seg;
    if (y <= maxY[0]) return 0;
    let lo = 0, hi = maxY.length - 1;
    if (y >= maxY[hi]) return seg.len;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (maxY[mid] <= y) lo = mid; else hi = mid;
    }
    const span = maxY[hi] - maxY[lo] || 1;
    return lens[lo] + ((y - maxY[lo]) / span) * (lens[hi] - lens[lo]);
  }

  function pointAt(seg, l) {
    const i = Math.min(seg.xs.length - 1, Math.round(l / SAMPLE_STEP));
    return [seg.xs[i], seg.ys[i]];
  }

  function paint(jump = false) {
    const y = window.scrollY + window.innerHeight * DRAW_LINE - (story.getBoundingClientRect().top + window.scrollY);
    let moving = false;
    let tipSeg = null;
    for (const seg of segs) {
      const target = reduced ? seg.len : lengthAtY(seg, y);
      if (jump || reduced) seg.drawn = target;
      else {
        const diff = target - seg.drawn;
        seg.drawn = Math.abs(diff) < 0.6 ? target : seg.drawn + diff * 0.14;
        if (seg.drawn !== target) moving = true;
      }
      const off = seg.len - seg.drawn;
      for (const p of seg.el) p.style.strokeDashoffset = off;
      const fibersOn = seg.fiberAtEnd ? seg.drawn >= seg.len - 4 : seg.drawn > 2;
      if (segs.length > 1) seg.fibers.forEach((f) => f.classList.toggle("is-on", fibersOn));
      if (seg.drawn > 1 && seg.drawn < seg.len - 1) tipSeg = seg;
    }
    if (tip) {
      if (tipSeg && !reduced) {
        const [x, ty] = pointAt(tipSeg, tipSeg.drawn);
        tip.setAttribute("transform", `translate(${x.toFixed(1)} ${ty.toFixed(1)})`);
        tip.style.opacity = 1;
      } else tip.style.opacity = 0;
    }
    return moving;
  }

  function loop() {
    raf = 0;
    if (paint()) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  let t = 0;
  const schedule = () => { clearTimeout(t); t = setTimeout(rebuild, 180); };

  window.addEventListener("scroll", kick, { passive: true });
  window.addEventListener("resize", () => { if (story.clientWidth !== width) schedule(); });
  new ResizeObserver(schedule).observe(story.querySelector("#sections"));
  document.fonts?.ready.then(schedule);

  rebuild();
  return { rebuild, kick };
}

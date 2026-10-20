// Builds every section from content.json. No personal text lives in this file.
// data-thread marks where the red thread passes: "left"/"right" skirt a block, "photo" goes behind
// it, "break" frays it, "resume" picks it up again, "end" is where it waits to be tied.

function el(tag, cls, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "style") n.style.cssText = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid);
  return n;
}

// "[like this]" in the copy is a note to fill in, rendered highlighted.
function rich(str = "") {
  const frag = document.createDocumentFragment();
  for (const part of String(str).split(/(\[[^\]]+\])/)) {
    if (!part) continue;
    frag.append(/^\[.*\]$/.test(part) ? el("span", "todo", {}, part.slice(1, -1)) : part);
  }
  return frag;
}

const paras = (list = []) => list.map((t) => el("p", "", {}, rich(t)));
const draftNote = (s) => (s?.draft ? el("p", "draft-note", {}, "draft · your real words go here") : null);

// Small deterministic tilt so the scrapbook looks the same on every visit.
let tiltSeed = 7;
function tilt(max = 3.2) {
  tiltSeed = (tiltSeed * 9301 + 49297) % 233280;
  return ((tiltSeed / 233280) * 2 - 1) * max;
}

function img(src, name, cls = "media-img") {
  const d = src.dims(name);
  return el("img", cls, {
    alt: "",
    "data-media": name,
    width: d?.[0],
    height: d?.[1],
    style: d ? `aspect-ratio:${d[0]} / ${d[1]}` : null,
    decoding: "async",
  });
}

function polaroid(src, p, { cls = "", thread = "photo", tape = true, r = tilt() } = {}) {
  const d = src.dims(p.src);
  const wide = d && d[0] > d[1] * 1.15;
  return el(
    "figure",
    `polaroid reveal ${tape ? "polaroid--tape" : ""} ${wide ? "polaroid--wide" : ""} ${cls}`,
    { style: `--r:${r.toFixed(2)}deg`, "data-thread": thread },
    el("button", "polaroid__img", { type: "button", "aria-label": `Open photo: ${p.caption || ""}`, "data-caption": p.caption || "" }, img(src, p.src)),
    p.caption ? el("figcaption", "", {}, rich(p.caption)) : null,
  );
}

function head(s, { thread = "left", cls = "" } = {}) {
  return el(
    "header",
    `reveal ${cls}`,
    { "data-thread": thread },
    draftNote(s),
    el("p", "kicker", {}, s.kicker || "", s.when ? el("span", "", {}, ` · ${s.when}`) : null),
    el("h2", "display", {}, rich(s.title)),
  );
}

// Real messages, shown the way they looked: ["date", label] or ["me"|"her", time, text].
function texts(lines, side = "left") {
  if (!lines?.length) return null;
  return el(
    "div",
    "texts",
    { "data-thread": side },
    lines.map(([who, a, b]) =>
      who === "date"
        ? el("p", "texts__date reveal", {}, a)
        : el("div", `bubble bubble--${who} reveal`, {}, el("p", "", {}, b), el("time", "", {}, a)),
    ),
  );
}

function opening(c, dates) {
  return el(
    "section",
    "sec sec--opening",
    { id: "opening" },
    el(
      "div",
      "wrap opening",
      { "data-thread": "left" },
      draftNote(c),
      el("p", "opening__hi reveal", {}, c.hi),
      el("h1", "display reveal", {}, c.title, c.titleEm ? [" ", el("em", "", {}, c.titleEm)] : null),
      el("div", "prose reveal", {}, paras(c.lede)),
      c.dedication
        ? el("div", "dedication reveal", {}, el("p", "dedication__title", {}, c.dedication.title), paras(c.dedication.text))
        : null,
      el(
        "div",
        "counter reveal",
        {},
        el("span", "counter__n", { "data-days-since": dates.met }, "0"),
        el("span", "counter__label", {}, c.counterLabel),
      ),
      el("p", "scroll-hint", {}, c.hint),
    ),
  );
}

function chapter(src, c, flip) {
  return el(
    "section",
    `sec chapter ${flip ? "chapter--flip" : ""}`,
    { id: c.id },
    el(
      "div",
      "wrap",
      {},
      head(c),
      el(
        "div",
        "chapter__body",
        {},
        el("div", "prose reveal", { "data-thread": "left" }, paras(c.text)),
        c.photos?.length ? el("div", "pile", {}, c.photos.map((p) => polaroid(src, p, { cls: p.hero ? "polaroid--hero" : "" }))) : null,
      ),
      texts(c.texts),
    ),
  );
}

function prologue(c) {
  return el(
    "section",
    "sec",
    { id: c.id },
    el("div", "wrap wrap--narrow", {}, head(c), el("div", "prose reveal", { style: "margin-top:24px", "data-thread": "left" }, paras(c.text)), texts(c.texts)),
  );
}

function distance(c) {
  return el(
    "section",
    "sec",
    { id: c.id },
    el(
      "div",
      "wrap",
      {},
      head(c, { thread: "right" }),
      el("div", "prose reveal", { style: "margin-top:24px", "data-thread": "right" }, paras(c.text)),
      el(
        "div",
        "stubs",
        { "data-thread": "left" },
        c.groups.map((g) =>
          el("div", "stubs__group", {}, el("p", "stubs__label reveal", {}, g.label), el("ul", "", {}, g.items.map((t) => el("li", "stub reveal", { style: `--r:${tilt(2.2).toFixed(2)}deg` }, rich(t))))),
        ),
      ),
    ),
  );
}

// Cities placed by latitude/longitude on a plain equirectangular grid; each trip is an arc of thread.
function map(c) {
  const pts = Object.values(c.cities);
  const lat = pts.map((p) => p[0]), lon = pts.map((p) => p[1]);
  const [la0, la1, lo0, lo1] = [Math.min(...lat), Math.max(...lat), Math.min(...lon), Math.max(...lon)];
  const k = Math.cos(((la0 + la1) / 2) * (Math.PI / 180));
  // The box takes the shape of the geography, so nothing is squeezed into a corner.
  const pad = 56, inner = 600 - 2 * pad, sc = inner / ((lo1 - lo0) * k);
  const W = 600, H = Math.round((la1 - la0) * sc + 2 * pad);
  const xy = (name) => { const [a, b] = c.cities[name]; return [pad + (b - lo0) * k * sc, pad + (la1 - a) * sc]; };
  const s = svg("svg", { class: "map__svg", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": c.title });
  c.trips.forEach((t, i) => {
    let d = "";
    for (let j = 0; j < t.route.length - 1; j++) {
      const [x1, y1] = xy(t.route[j]), [x2, y2] = xy(t.route[j + 1]);
      const bend = (i % 2 ? 1 : -1) * (0.16 + i * 0.05);
      const mx = (x1 + x2) / 2 - (y2 - y1) * bend, my = (y1 + y2) / 2 + (x2 - x1) * bend;
      d += `${j ? "" : `M${x1.toFixed(1)},${y1.toFixed(1)}`} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
    }
    s.append(svg("path", { class: "map__trip", d, pathLength: 1, style: `--i:${i}` }));
  });
  for (const name of Object.keys(c.cities)) {
    const [x, y] = xy(name);
    s.append(svg("circle", { class: "map__dot", cx: x.toFixed(1), cy: y.toFixed(1), r: 5 }));
    const side = c.cities[name][2] || "e";
    const [dx, dy, anchor] = { e: [10, 6, "start"], w: [-10, 6, "end"], n: [0, -12, "middle"], s: [0, 24, "middle"] }[side];
    const t = svg("text", { class: "map__label", x: (x + dx).toFixed(1), y: (y + dy).toFixed(1), "text-anchor": anchor });
    t.textContent = name;
    s.append(t);
  }
  return el(
    "section",
    "sec",
    { id: c.id },
    el(
      "div",
      "wrap",
      {},
      head(c),
      el("div", "prose reveal", { style: "margin-top:24px", "data-thread": "left" }, paras(c.text)),
      el("figure", "map reveal", { "data-thread": "photo" }, s),
      el("ol", "map__legend", { "data-thread": "left" }, c.trips.map((t, i) => el("li", "reveal", { style: `--i:${i}` }, el("b", "", {}, t.when), " ", t.what))),
    ),
  );
}

function numbers(c) {
  return el(
    "section",
    "sec",
    { id: c.id },
    el(
      "div",
      "wrap",
      {},
      head(c, { thread: "right" }),
      el(
        "div",
        "stats",
        { "data-thread": "left" },
        c.stats.map((st) =>
          el(
            "div",
            "stat reveal",
            {},
            el("span", "stat__n", { "data-count": st.n }, "0"),
            el("span", "stat__label", {}, st.label),
            st.sub ? el("span", "stat__sub", {}, st.sub) : null,
          ),
        ),
      ),
    ),
  );
}

function someday(c) {
  return el(
    "section",
    "sec",
    { id: c.id },
    el(
      "div",
      "wrap wrap--narrow",
      {},
      head(c, { thread: "right" }),
      el("ul", "someday", { "data-thread": "left" }, c.items.map((t) => el("li", "reveal", {}, rich(t)))),
    ),
  );
}

function winter(src, c) {
  const frames = c.hug.frames;
  return el(
    "section",
    "sec sec--winter",
    { id: c.id, "data-snow": "" },
    el(
      "div",
      "wrap",
      {},
      head(c),
      el("div", "prose reveal", { style: "margin-top:28px", "data-thread": "left" }, paras(c.text)),
      el("div", "winter__hero", {}, polaroid(src, c.hero, { r: -1.2 })),
      el("div", "pile", { style: "margin-top:48px" }, c.photos.map((p) => polaroid(src, p))),
      el(
        "div",
        "stopmo",
        { "data-thread": "left" },
        el(
          "div",
          "stopmo__sticky",
          {},
          el("p", "stopmo__lead", {}, rich(c.hug.lead)),
          el(
            "figure",
            "polaroid polaroid--tape",
            { style: "--r:1deg" },
            el("div", "stopmo__frames", {}, frames.map((f, i) => img(src, f.src, i === 0 ? "on" : ""))),
            el("figcaption", "stopmo__cap", {}, rich(frames[0].caption)),
          ),
          el("div", "stopmo__dots", {}, frames.map((_, i) => el("i", i === 0 ? "on" : ""))),
        ),
      ),
      el("div", "winter__duo", {}, polaroid(src, c.arch), polaroid(src, c.me)),
    ),
  );
}

function ink(src, c) {
  return el(
    "section",
    "sec",
    { id: c.id },
    el(
      "div",
      "wrap wrap--narrow",
      {},
      head(c),
      el("div", "prose reveal", { style: "margin-top:24px", "data-thread": "left" }, paras(c.text)),
      el("p", "ink__word reveal", { "aria-hidden": "true" }, c.word),
      el("div", "duo", {}, c.photos.map((p) => polaroid(src, p))),
      texts(c.texts),
    ),
  );
}

function dolls(src, c) {
  return el(
    "section",
    "sec dolls",
    { id: c.id },
    el(
      "div",
      "wrap wrap--narrow",
      {},
      head(c, { thread: "right" }),
      el("div", "prose reveal", { style: "margin-top:24px", "data-thread": "right" }, paras(c.text)),
      el("div", "duo", {}, c.photos.map((p) => polaroid(src, p))),
    ),
  );
}

function trips(src, list) {
  return el(
    "section",
    "sec",
    { id: "trips" },
    el(
      "div",
      "wrap",
      {},
      list.map((t, i) =>
        el(
          "div",
          "trip",
          { id: t.id },
          head(t, { thread: i % 2 ? "right" : "left" }),
          el("div", "prose reveal", { style: "margin-top:24px", "data-thread": i % 2 ? "right" : "left" }, paras(t.text)),
          el("div", "strip", { "data-thread": "photo" }, t.photos.map((p) => polaroid(src, p, { thread: null }))),
          t.photos.length > 2 ? el("p", "strip__hint", {}, "swipe") : null,
        ),
      ),
    ),
  );
}

function mirrors(src, c) {
  const n = c.photos.length;
  return el(
    "section",
    "sec",
    { id: c.id },
    el(
      "div",
      "wrap",
      {},
      head(c, { thread: "right" }),
      el("div", "prose reveal", { style: "margin-top:24px", "data-thread": "right" }, paras(c.text)),
      el(
        "div",
        "mirrors",
        {},
        c.photos.map((p, i) =>
          el(
            "figure",
            "mirror reveal",
            { "data-thread": i === 0 || i === n - 1 || i === Math.floor(n / 2) ? "photo" : null },
            el(
              "button",
              "mirror__frame",
              { type: "button", "aria-label": `Open photo: ${p.caption || ""}`, "data-caption": p.caption || "" },
              el("span", "mirror__glass", {}, img(src, p.src)),
            ),
            el("figcaption", "", {}, rich(p.caption)),
          ),
        ),
      ),
    ),
  );
}

function outtakes(src, c) {
  return el(
    "section",
    "sec",
    { id: c.id },
    el(
      "div",
      "wrap",
      {},
      head(c),
      el("div", "prose reveal", { style: "margin-top:24px", "data-thread": "left" }, paras(c.text)),
      c.video
        ? el(
            "figure",
            "tv reveal",
            { "data-thread": "photo" },
            el(
              "div",
              "tv__screen",
              {},
              el("video", "", { "data-media": c.video.src, muted: true, loop: true, playsinline: true, preload: "none" }),
              el("button", "tv__sound", { type: "button" }, "sound off"),
            ),
            el("figcaption", "", {}, rich(c.video.caption)),
          )
        : null,
      el("div", "scatter", {}, c.photos.map((p, i) => polaroid(src, p, { tape: i % 2 === 0, thread: i === c.photos.length - 1 ? "photo" : null }))),
    ),
  );
}

function hard(c) {
  return el(
    "section",
    "sec sec--hard",
    { id: c.id },
    el(
      "div",
      "wrap wrap--narrow",
      {},
      draftNote(c),
      el("p", "kicker reveal", { "data-thread": "left" }, c.kicker),
      el("div", "hard__intro reveal", {}, paras(c.intro)),
      el("div", "break-mark", { "data-thread": "break" }),
      c.apologies.map((a, i) =>
        el(
          "article",
          "sorry",
          {},
          c.apologies.length > 1 ? el("p", "sorry__n reveal", {}, `${String(i + 1).padStart(2, "0")} / ${String(c.apologies.length).padStart(2, "0")}`) : null,
          el("p", "sorry__did reveal", {}, rich(a.did)),
          el("p", "sorry__felt reveal", {}, rich(a.felt)),
          a.why ? el("div", "sorry__why reveal", {}, paras(a.why)) : null,
          el("p", "sorry__now reveal", {}, el("b", "", {}, "Now: "), rich(a.now)),
        ),
      ),
      c.thanks
        ? el(
            "div",
            "thanks",
            { "data-thread": "left" },
            el("p", "thanks__title reveal", {}, c.thanks.title),
            el("ul", "", {}, c.thanks.items.map((t) => el("li", "reveal", {}, rich(t)))),
          )
        : null,
      el("div", "hard__outro reveal", {}, paras(c.outro)),
    ),
  );
}

function reasons(c) {
  return el(
    "section",
    "sec",
    { id: c.id },
    el(
      "div",
      "wrap wrap--narrow",
      {},
      el("div", "", { "data-thread": "resume" }),
      head(c),
      el(
        "div",
        "deck-wrap reveal",
        { "data-thread": "photo" },
        el("div", "deck", { role: "list", "aria-label": c.title, "data-items": JSON.stringify(c.items) }),
        el(
          "div",
          "deck__bar",
          {},
          el("span", "deck__count", { "aria-live": "polite" }),
          el("button", "deck__btn deck__shuffle", { type: "button" }, "shuffle"),
        ),
        el("p", "deck__hint", {}, c.hint),
      ),
    ),
  );
}

function promises(c) {
  return el(
    "section",
    "sec",
    { id: c.id },
    el(
      "div",
      "wrap wrap--narrow",
      {},
      head(c, { thread: "right" }),
      el(
        "ol",
        "promises",
        { "data-thread": "left" },
        c.items.map((it) => {
          const { t, by } = typeof it === "string" ? { t: it } : it;
          return el("li", "reveal", {}, rich(t), by ? el("span", "promises__by", {}, by) : null);
        }),
      ),
    ),
  );
}

// One stroke: down into a heart, round it, then a little knot and a loose tail.
const KNOT_PATH =
  "M120 2 C120 24 120 40 120 62 C120 30 76 18 62 54 C50 88 92 122 120 160 C148 122 190 88 178 54 C164 18 120 30 120 62 " +
  "C112 92 130 128 120 162 C114 178 96 184 102 198 C108 212 132 206 126 190 C120 176 106 194 116 214 C122 228 112 240 118 256";

function knot(src, c, dates) {
  return el(
    "section",
    "sec sec--knot",
    { id: c.id },
    el(
      "div",
      "wrap wrap--narrow",
      {},
      draftNote(c),
      c.intro ? el("p", "knot__intro reveal", {}, rich(c.intro)) : null,
      texts(c.texts),
      el("div", "knot__lead reveal", {}, paras(c.lead)),
      el(
        "div",
        "knot__stage",
        { style: "position:relative" },
        el("span", "knot__end", { "data-thread": "end" }),
        svgKnot(),
        el(
          "div",
          "hold",
          { style: "position:absolute;left:0;right:0;top:38%;transform:translateY(-50%)" },
          el(
            "button",
            "hold__btn",
            { type: "button", "aria-label": c.hold },
            svgRing(),
            el("span", "hold__heart", { "aria-hidden": "true" }, "♥"),
          ),
          el("p", "hold__label", {}, c.hold),
        ),
      ),
      el(
        "div",
        "knot__after",
        {},
        polaroid(src, c.photo, { thread: null }),
        el("p", "knot__ch", {}, c.after),
        el("p", "knot__day", {}, `${c.dayLabel} `, el("span", "", { "data-day-of": dates.back }, "1"), "."),
        el("p", "knot__sign", {}, rich(c.signoff)),
      ),
    ),
  );
}

// Little die-cut stickers (original drawings), placed in each section's padding so they never cover text.
const STICKER_ART = {
  bunny:
    '<path d="M24 34c-6-10-7-26-1-28s9 13 9 24M40 34c1-11 3-26 9-24s5 18-1 28" fill="#fff" stroke="#3a2230" stroke-width="2.4"/>' +
    '<path d="M26 30c-3-8-3-18 0-19s5 9 5 17M38 28c0-8 2-18 5-17s3 11 0 19" fill="#ffb6cb"/>' +
    '<ellipse cx="32" cy="44" rx="19" ry="16" fill="#fff" stroke="#3a2230" stroke-width="2.4"/>' +
    '<circle cx="25" cy="42" r="2.2" fill="#3a2230"/><circle cx="39" cy="42" r="2.2" fill="#3a2230"/>' +
    '<ellipse cx="20" cy="48" rx="3.4" ry="2" fill="#ff9fbd"/><ellipse cx="44" cy="48" rx="3.4" ry="2" fill="#ff9fbd"/>' +
    '<path d="M29.5 47.5q2.5 2.5 5 0" fill="none" stroke="#3a2230" stroke-width="1.8" stroke-linecap="round"/>',
  heart:
    '<path d="M32 54C17 43 8 34 8 23c0-7 5-12 11.5-12 5 0 9.5 3 12.5 7.5C35 14 39.5 11 44.5 11 51 11 56 16 56 23c0 11-9 20-24 31z" fill="#ff5f8f" stroke="#3a2230" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<path d="M17 21c1-4 4-6 7-6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
  hearts:
    '<path d="M24 42C14 35 8 29 8 22c0-4.5 3.3-8 7.5-8 3.3 0 6.3 2 8.5 5 2.2-3 5.2-5 8.5-5 4.2 0 7.5 3.5 7.5 8 0 7-6 13-16 20z" fill="#ff8fb3" stroke="#3a2230" stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M44 56c-7-5-11-9-11-14 0-3 2.3-5.5 5.2-5.5 2.3 0 4.3 1.3 5.8 3.4 1.5-2.1 3.5-3.4 5.8-3.4 2.9 0 5.2 2.5 5.2 5.5 0 5-4 9-11 14z" fill="#ff4f86" stroke="#3a2230" stroke-width="2.2" stroke-linejoin="round"/>',
  sparkle:
    '<path d="M32 6c2 14 6 20 20 26-14 6-18 12-20 26-2-14-6-20-20-26 14-6 18-12 20-26z" fill="#ffd36b" stroke="#3a2230" stroke-width="2.4" stroke-linejoin="round"/>',
  candy:
    '<path d="M18 32l-10-8v16zM46 32l10-8v16z" fill="#ff8fb3" stroke="#3a2230" stroke-width="2.2" stroke-linejoin="round"/>' +
    '<circle cx="32" cy="32" r="14" fill="#7ed6a6" stroke="#3a2230" stroke-width="2.4"/>' +
    '<path d="M24 26c4 3 12 3 16 0M23 34c5 3 13 3 18 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
  letter:
    '<rect x="9" y="17" width="46" height="32" rx="4" fill="#fff" stroke="#3a2230" stroke-width="2.4"/>' +
    '<path d="M10 19l22 16 22-16" fill="none" stroke="#3a2230" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<path d="M32 44c-5-3.5-8-6.5-8-10 0-2.2 1.7-4 3.8-4 1.7 0 3.2 1 4.2 2.6 1-1.6 2.5-2.6 4.2-2.6 2.1 0 3.8 1.8 3.8 4 0 3.5-3 6.5-8 10z" fill="#ff5f8f"/>',
};
function sticker(spec) {
  if (!spec) return null;
  const [name, where] = spec;
  const s = svg("svg", { class: `sticker sticker--${where}`, viewBox: "0 0 64 64", "aria-hidden": "true", style: `--r:${tilt(12).toFixed(1)}deg` });
  s.innerHTML = STICKER_ART[name];
  return s;
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
function svgKnot() {
  const s = svg("svg", { class: "knot__art", viewBox: "0 0 240 260", "aria-hidden": "true" });
  s.append(svg("path", { class: "knot__loop", d: KNOT_PATH }));
  return s;
}
function svgRing() {
  const s = svg("svg", { viewBox: "0 0 104 104", "aria-hidden": "true" });
  s.append(svg("circle", { class: "hold__track", cx: 52, cy: 52, r: 46 }), svg("circle", { class: "hold__ring", cx: 52, cy: 52, r: 46 }));
  return s;
}

export function renderStory(root, src) {
  const c = src.content;
  const chapters = Object.fromEntries((c.chapters || []).map((ch) => [ch.id, ch]));
  let flip = false;
  const build = {
    opening: () => opening(c.opening, c.dates),
    prologue: () => prologue(c.prologue),
    distance: () => distance(c.distance),
    winter: () => winter(src, c.winter),
    ink: () => ink(src, c.ink),
    dolls: () => dolls(src, c.dolls),
    trips: () => trips(src, c.trips),
    map: () => map(c.map),
    numbers: () => numbers(c.numbers),
    mirrors: () => mirrors(src, c.mirrors),
    outtakes: () => outtakes(src, c.outtakes),
    hard: () => hard(c.hard),
    reasons: () => reasons(c.reasons),
    promises: () => promises(c.promises),
    someday: () => someday(c.someday),
    knot: () => knot(src, c.knot, c.dates),
  };
  for (const id of c.order) {
    let sec = null;
    if (chapters[id]) {
      sec = chapter(src, chapters[id], flip);
      flip = !flip;
    } else if (build[id] && c[id]) sec = build[id]();
    else console.warn(`unknown section in order: ${id}`);
    if (!sec) continue;
    const st = sticker(c.stickers?.[id]);
    if (st) sec.prepend(st);
    root.append(sec);
  }
  root.append(
    el("footer", "foot", {}, "made by hand, for one person only", el("br"), el("button", "foot__top", { type: "button" }, "read it again ↑")),
  );
}

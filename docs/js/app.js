import { loadGate, unlock, devSource } from "./vault.js";
import { renderStory } from "./render.js";
import { createThread } from "./thread.js";
import { createSnow } from "./snow.js";
import { initInteractions } from "./interact.js";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const dev = isLocal && new URLSearchParams(location.search).has("dev");

const gate = document.getElementById("gate");
const story = document.getElementById("story");

const WRONG = [
  "nope. you know this one.",
  "hmm. are you sure you're you?",
  "close your eyes and hear me say it.",
  "that's not it, but I love that you tried.",
  "one more time, slower.",
];

function start(src) {
  renderStory(document.getElementById("sections"), src);
  story.hidden = false;
  window.scrollTo(0, 0);
  const thread = createThread(story, document.getElementById("thread"), { reduced });
  initInteractions(story, src, { reduced, onTied: () => thread.kick() });
  if (!reduced) createSnow(document.getElementById("snow"), [...story.querySelectorAll("[data-snow]")]);
}

async function boot() {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  if (dev) {
    gate.remove();
    start(await devSource());
    return;
  }

  document.body.classList.add("is-locked");
  const form = document.getElementById("gate-form");
  const input = document.getElementById("gate-input");
  const msg = document.getElementById("gate-msg");
  const row = form.querySelector(".gate__row");
  const btn = form.querySelector("button");

  let g;
  try {
    g = await loadGate();
  } catch {
    msg.textContent = "nothing here yet…";
    form.hidden = true;
    return;
  }
  if (g.question) document.getElementById("gate-q").textContent = g.question;

  let tries = 0;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    btn.disabled = true;
    msg.textContent = "";
    try {
      const src = await unlock(input.value, g);
      input.blur();
      start(src);
      gate.classList.add("is-opening", "is-open");
      setTimeout(() => {
        gate.remove();
        document.body.classList.remove("is-locked");
      }, reduced ? 50 : 2100);
    } catch {
      msg.textContent = WRONG[tries++ % WRONG.length];
      row.classList.remove("is-wrong");
      void row.offsetWidth;
      row.classList.add("is-wrong");
      btn.disabled = false;
      input.select();
    }
  });
  if (matchMedia("(hover: hover)").matches) input.focus();
}

boot();

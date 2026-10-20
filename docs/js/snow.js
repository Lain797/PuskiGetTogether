// Soft snowfall over the winter section, running only while that section is on screen.

export function createSnow(canvas, sections) {
  const ctx = canvas.getContext("2d");
  let flakes = [];
  let raf = 0;
  let visible = 0;
  let w = 0, h = 0, dpr = 1;

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(170, Math.round((w * h) / 8000));
    flakes = Array.from({ length: count }, () => flake(true));
  }

  function flake(anywhere) {
    const r = 0.7 + Math.random() ** 2 * 2.6;
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -10,
      r,
      vy: 0.25 + r * 0.32,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.004 + Math.random() * 0.012,
      a: 0.35 + Math.random() * 0.5,
    };
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);
    for (const f of flakes) {
      f.sway += f.swaySpeed;
      f.y += f.vy;
      f.x += Math.sin(f.sway) * 0.35;
      if (f.y > h + 10) Object.assign(f, flake(false));
      ctx.globalAlpha = f.a;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) visible += e.isIntersecting ? 1 : -1;
      visible = Math.max(0, visible);
      canvas.classList.toggle("is-on", visible > 0);
      if (visible && !raf) raf = requestAnimationFrame(frame);
      if (!visible && raf) {
        // let the fade-out finish before freezing
        setTimeout(() => { if (!visible) { cancelAnimationFrame(raf); raf = 0; } }, 1500);
      }
    },
    { rootMargin: "-25% 0px -25% 0px" },
  );

  size();
  window.addEventListener("resize", () => { if (window.innerWidth !== w) size(); });
  sections.forEach((s) => io.observe(s));
}

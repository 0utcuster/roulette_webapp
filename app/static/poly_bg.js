(function () {
  const canvas = document.getElementById("polyBgCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const items = [];
  const palette = [
    "rgba(132, 208, 255, 0.42)",
    "rgba(191, 151, 255, 0.4)",
    "rgba(255, 199, 132, 0.38)",
    "rgba(173, 226, 255, 0.36)",
  ];

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function buildPolygon(size) {
    const sides = Math.floor(rand(3, 6.99));
    const points = [];
    const jitter = rand(0.08, 0.2);
    for (let i = 0; i < sides; i += 1) {
      const a = (i / sides) * Math.PI * 2;
      const r = size * rand(1 - jitter, 1 + jitter);
      points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return points;
  }

  function fillItems() {
    items.length = 0;
    const count = prefersReducedMotion ? 10 : 18;
    for (let i = 0; i < count; i += 1) {
      const size = rand(14, 44);
      items.push({
        x: rand(-120, canvas.width + 120),
        y: rand(-140, canvas.height + 140),
        z: rand(0.55, 1.2),
        speedY: rand(0.12, 0.36),
        speedX: rand(-0.06, 0.06),
        rot: rand(0, Math.PI * 2),
        rotSpeed: rand(-0.0028, 0.0028),
        shape: buildPolygon(size),
        stroke: palette[i % palette.length],
      });
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fillItems();
  }

  function drawBackground() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "rgba(42, 70, 126, 0.2)");
    grad.addColorStop(0.52, "rgba(29, 31, 72, 0.18)");
    grad.addColorStop(1, "rgba(72, 42, 98, 0.2)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  function render() {
    const speedMul = prefersReducedMotion ? 0.4 : 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    drawBackground();

    for (const item of items) {
      item.y -= item.speedY * speedMul * item.z;
      item.x += item.speedX * speedMul * item.z;
      item.rot += item.rotSpeed * speedMul;

      if (item.y < -180) {
        item.y = h + 180;
        item.x = rand(-120, w + 120);
      }
      if (item.x < -220) item.x = w + 220;
      if (item.x > w + 220) item.x = -220;

      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rot);
      ctx.lineWidth = 1.25 * item.z;
      ctx.strokeStyle = item.stroke;
      ctx.shadowBlur = 20 * item.z;
      ctx.shadowColor = item.stroke;
      ctx.fillStyle = "rgba(255,255,255,0.02)";

      ctx.beginPath();
      for (let i = 0; i < item.shape.length; i += 1) {
        const p = item.shape[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    requestAnimationFrame(render);
  }

  resize();
  window.addEventListener("resize", resize, { passive: true });
  requestAnimationFrame(render);
})();

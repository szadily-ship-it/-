/* analog camera: fisheye displacement, grain, HUD clock, channel static */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function generateDisplacement(size) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const cx = (size - 1) / 2;
    const cy = (size - 1) / 2;
    const maxR = Math.min(cx, cy);
    const k = 0.72;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = (x - cx) / maxR;
        const ny = (y - cy) / maxR;
        const r = Math.sqrt(nx * nx + ny * ny);
        const srcR = r < 1e-6 ? 0 : r * (1 + k * r * r);
        const scale = r < 1e-6 ? 1 : srcR / r;
        const sx = nx * scale * maxR + cx;
        const sy = ny * scale * maxR + cy;
        const i = (y * size + x) * 4;
        d[i]     = clamp(128 + ((sx - x) / maxR) * 127, 0, 255);
        d[i + 1] = clamp(128 + ((sy - y) / maxR) * 127, 0, 255);
        d[i + 2] = 128;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }

  function installFisheye() {
    const fe = document.getElementById("fisheyeMap");
    if (!fe) return;
    try {
      const url = generateDisplacement(512);
      fe.setAttribute("href", url);
      fe.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
      const world = document.getElementById("world");
      if (world && !world.classList.contains("flat")) world.classList.add("warped");
    } catch (e) { /* overlays still sell the lens */ }
  }

  function grainLoop() {
    const canvas = document.getElementById("grain");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const tile = document.createElement("canvas");
    tile.width = 160;
    tile.height = 160;
    const tctx = tile.getContext("2d");
    const img = tctx.createImageData(160, 160);

    function noiseTile() {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = Math.random() * 255;
        d[i] = d[i + 1] = d[i + 2] = n;
        d[i + 3] = 255;
      }
      tctx.putImageData(img, 0, 0);
    }

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    let last = 0;
    function frame(t) {
      if (t - last > 70) {
        noiseTile();
        const ox = -Math.random() * 160;
        const oy = -Math.random() * 160;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const pat = ctx.createPattern(tile, "repeat");
        ctx.save();
        ctx.translate(ox, oy);
        ctx.fillStyle = pat;
        ctx.fillRect(-ox, -oy, canvas.width + 160, canvas.height + 160);
        ctx.restore();
        last = t;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function drawFisheyeGrid() {
    const canvas = document.getElementById("grid");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function render() {
      const w = canvas.width = window.innerWidth;
      const h = canvas.height = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.5;
      const cy = h * 0.48;
      const k = 0.55;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;

      function distort(x, y) {
        const nx = (x - cx) / (w * 0.5);
        const ny = (y - cy) / (h * 0.5);
        const r = Math.sqrt(nx * nx + ny * ny) || 0.0001;
        const f = 1 / (1 + k * r * r);
        return [cx + nx * f * w * 0.5, cy + ny * f * h * 0.5];
      }

      const cols = 14;
      const rows = 10;
      for (let i = 0; i <= cols; i++) {
        ctx.beginPath();
        for (let j = 0; j <= 40; j++) {
          const x = (i / cols) * w;
          const y = (j / 40) * h;
          const [dx, dy] = distort(x, y);
          if (j === 0) ctx.moveTo(dx, dy); else ctx.lineTo(dx, dy);
        }
        ctx.stroke();
      }
      for (let j = 0; j <= rows; j++) {
        ctx.beginPath();
        for (let i = 0; i <= 50; i++) {
          const x = (i / 50) * w;
          const y = (j / rows) * h;
          const [dx, dy] = distort(x, y);
          if (i === 0) ctx.moveTo(dx, dy); else ctx.lineTo(dx, dy);
        }
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(w, h) * 0.42, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.stroke();
    }
    render();
    window.addEventListener("resize", render);
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function clock() {
    const rec = document.getElementById("recTime");
    const clockEl = document.getElementById("clock");
    const frameEl = document.getElementById("frameNo");
    const start = Date.now();
    function tick() {
      const now = new Date();
      if (clockEl) {
        clockEl.textContent =
          now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) +
          "  " + pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());
      }
      if (rec) {
        const s = Math.floor((Date.now() - start) / 1000);
        rec.textContent = pad(Math.floor(s / 3600)) + ":" + pad(Math.floor((s % 3600) / 60)) + ":" + pad(s % 60);
      }
      if (frameEl) {
        frameEl.textContent = "F " + String((Date.now() / 40) | 0).padStart(7, "0");
      }
    }
    tick();
    setInterval(tick, 250);
  }

  function flicker() {
    const screen = document.querySelector(".screen");
    setInterval(() => {
      if (Math.random() > 0.18) return;
      screen && screen.classList.add("flicker");
      setTimeout(() => screen && screen.classList.remove("flicker"), 140);
    }, 1400);
  }

  let staticCanvas;
  function ensureStatic() {
    const el = document.querySelector(".static-flash");
    if (!el) return null;
    if (!staticCanvas) {
      staticCanvas = document.createElement("canvas");
      el.appendChild(staticCanvas);
      const ctx = staticCanvas.getContext("2d");
      function paint() {
        staticCanvas.width = window.innerWidth;
        staticCanvas.height = window.innerHeight;
        const id = ctx.createImageData(staticCanvas.width, staticCanvas.height);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
          const n = Math.random() * 255;
          d[i] = d[i + 1] = d[i + 2] = n;
          d[i + 3] = 255;
        }
        ctx.putImageData(id, 0, 0);
      }
      paint();
    }
    return el;
  }

  window.CAM = {
    staticBurst(ms) {
      const el = ensureStatic();
      if (!el) return;
      el.classList.add("on");
      const screen = document.querySelector(".screen");
      screen && screen.classList.add("shake");
      setTimeout(() => {
        el.classList.remove("on");
        screen && screen.classList.remove("shake");
      }, ms || 160);
    },
    toggleFisheye() {
      const world = document.getElementById("world");
      const btn = document.getElementById("fisheyeBtn");
      if (!world) return;
      const on = world.classList.toggle("flat");
      if (!on) world.classList.add("warped");
      else world.classList.remove("warped");
      if (btn) btn.textContent = on ? "FISHEYE OFF" : "FISHEYE ON";
    },
    boot(done) {
      const boot = document.getElementById("boot");
      setTimeout(() => {
        if (boot) boot.classList.add("hide");
        window.CAM.staticBurst(220);
        setTimeout(() => { if (boot) boot.style.display = "none"; done && done(); }, 480);
      }, 2300);
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    installFisheye();
    grainLoop();
    drawFisheyeGrid();
    clock();
    flicker();
    ensureStatic();
  });
})();

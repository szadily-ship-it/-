/* ОБЪЕКТИВ-07 · аналоговая камера: fisheye, зерно, HUD-часы, статика */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* —— карта смещения для feDisplacementMap (настоящий «рыбий глаз») —— */
  function generateDisplacement(size, k) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const cx = (size - 1) / 2;
    const cy = (size - 1) / 2;
    const maxR = Math.min(cx, cy);
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
        d[i] = clamp(128 + ((sx - x) / maxR) * 127, 0, 255);
        d[i + 1] = clamp(128 + ((sy - y) / maxR) * 127, 0, 255);
        d[i + 2] = 128;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }

  /* —— зерно —— */
  function grainLoop() {
    const canvas = $("#grain");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const tile = document.createElement("canvas");
    tile.width = tile.height = 160;
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

  /* —— искажённая сетка поверх кадра —— */
  function drawFisheyeGrid() {
    const canvas = $("#grid-canvas");
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

      const cols = 14, rows = 10;
      for (let i = 0; i <= cols; i++) {
        ctx.beginPath();
        for (let j = 0; j <= 40; j++) {
          const p = distort((i / cols) * w, (j / 40) * h);
          if (j === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
        }
        ctx.stroke();
      }
      for (let j = 0; j <= rows; j++) {
        ctx.beginPath();
        for (let i = 0; i <= 50; i++) {
          const p = distort((i / 50) * w, (j / rows) * h);
          if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
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

  /* —— HUD часы —— */
  function clock() {
    const rec = $("#recTime");
    const clockEl = $("#clock");
    const frameEl = $("#frameNo");
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
      if (frameEl) frameEl.textContent = "F " + String((Date.now() / 40) | 0).padStart(7, "0");
    }
    tick();
    setInterval(tick, 250);
  }

  function flicker() {
    const screen = $(".screen");
    if (!screen) return;
    setInterval(() => {
      if (Math.random() > 0.18) return;
      screen.classList.add("flicker");
      setTimeout(() => screen.classList.remove("flicker"), 140);
    }, 1400);
  }

  let staticCanvas;
  function ensureStatic() {
    const el = $(".static-flash");
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

  /* —— объектив —— */
  const isChromium = /Chrome|Chromium/.test(navigator.userAgent);

  function applyLens(cfg) {
    const world = $("#world");
    const disp = $("#fisheyeDisp");
    const strength = clamp(parseInt(cfg.fisheye_strength, 10) || 78, 0, 200);
    if (disp) disp.setAttribute("scale", String(strength));
    if (!world) return;

    document.body.classList.remove("lens-css");
    if (!cfg.fisheye) {
      world.classList.remove("warped");
      world.classList.add("flat");
    } else if (cfg.lens_mode === "css") {
      world.classList.remove("warped", "flat");
      document.body.classList.add("lens-css");
    } else {
      world.classList.remove("flat");
      world.classList.add("warped");
      // WebKit-сборки не всегда применяют SVG-фильтр к HTML — тогда
      // цилиндрический изгин через CSS добивает эффект объектива.
      if (cfg.lens_mode === "auto" && !isChromium) {
        document.body.classList.add("lens-bend");
      }
    }
    const btn = $("#fisheyeBtn");
    if (btn) btn.textContent = cfg.fisheye ? "FISHEYE ON" : "FISHEYE OFF";
  }

  function applyConfig(cfg) {
    document.body.classList.toggle("no-scanlines", !cfg.scanlines);
    document.body.classList.toggle("no-grain", !cfg.grain);
    document.documentElement.style.setProperty("--ico", (cfg.icon_size || 56) + "px");
    applyLens(cfg);
  }

  window.CAM = {
    staticBurst(ms) {
      const el = ensureStatic();
      if (!el) return;
      el.classList.add("on");
      const screen = $(".screen");
      screen && screen.classList.add("shake");
      setTimeout(() => {
        el.classList.remove("on");
        screen && screen.classList.remove("shake");
      }, ms || 160);
    },
    toggleFisheye() {
      const world = $("#world");
      if (!world) return false;
      const off = world.classList.toggle("flat");
      if (off) world.classList.remove("warped");
      else world.classList.add("warped");
      const btn = $("#fisheyeBtn");
      if (btn) btn.textContent = off ? "FISHEYE OFF" : "FISHEYE ON";
      return !off;
    },
    osd(text, ms) {
      const el = $("#osd");
      if (!el) return;
      el.textContent = text;
      el.classList.add("show");
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove("show"), ms || 1500);
    },
    applyConfig,
    boot(done) {
      const boot = $("#boot");
      setTimeout(() => {
        if (boot) boot.classList.add("hide");
        window.CAM.staticBurst(220);
        setTimeout(() => {
          if (boot) boot.style.display = "none";
          done && done();
        }, 480);
      }, 2200);
    },
    bendCards() {
      // лёгкий цилиндрический изгиб карточек (fallback-объектив)
      const grid = $("#grid");
      if (!grid) return;
      const cards = grid.querySelectorAll(".app");
      const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length);
      cards.forEach((el, i) => {
        const c = i % cols;
        const off = (c - (cols - 1) / 2) / Math.max(1, (cols - 1) / 2);
        el.style.transform = "rotateY(" + (-off * 3.4).toFixed(2) + "deg)";
      });
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    grainLoop();
    drawFisheyeGrid();
    clock();
    flicker();
    ensureStatic();
    const fe = $("#fisheyeMap");
    if (fe) {
      try {
        const url = generateDisplacement(512, 0.72);
        fe.setAttribute("href", url);
        fe.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
      } catch (e) { /* оверлеи всё равно продают объектив */ }
    }
  });
})();

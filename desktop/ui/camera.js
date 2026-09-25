/* ОБЪЕКТИВ-07 · DASHBOARD — аналоговая камера: зерно, HUD-часы, статика */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);

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

  /* —— ровная сетка монитора —— */
  function drawGrid() {
    const canvas = $("#grid-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function render() {
      const w = canvas.width = window.innerWidth;
      const h = canvas.height = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;

      const cols = 14, rows = 10;
      for (let i = 0; i <= cols; i++) {
        ctx.beginPath();
        for (let j = 0; j <= 40; j++) {
          const x = (i / cols) * w;
          const y = (j / 40) * h;
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (let j = 0; j <= rows; j++) {
        ctx.beginPath();
        for (let i = 0; i <= 50; i++) {
          const x = (i / 50) * w;
          const y = (j / rows) * h;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
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

  function applyConfig(cfg) {
    document.body.classList.toggle("no-scanlines", !cfg.scanlines);
    document.body.classList.toggle("no-grain", !cfg.grain);
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
  };

  document.addEventListener("DOMContentLoaded", () => {
    grainLoop();
    drawGrid();
    clock();
    flicker();
    ensureStatic();
  });
})();

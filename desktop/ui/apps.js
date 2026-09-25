/* ОБЪЕКТИВ-07 · DASHBOARD — каналы, ярлыки, запуск приложений */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);

  const FALLBACK_DEMO = [
    { id: "firefox.desktop", name: "FIREFOX", comment: "Веб-обозреватель", exec: "firefox",
      icon: "", channel: "ИНТЕРНЕТ", terminal: false, actions: [] },
    { id: "kitty.desktop", name: "KITTY", comment: "Эмулятор терминала", exec: "kitty",
      icon: "", channel: "ТЕРМИНАЛ", terminal: true, actions: [] },
    { id: "nvim.desktop", name: "NEOVIM", comment: "Текстовый редактор", exec: "nvim",
      icon: "", channel: "РАЗРАБОТКА", terminal: true, actions: [] },
    { id: "gimp.desktop", name: "GIMP", comment: "Растровый редактор", exec: "gimp",
      icon: "", channel: "ГРАФИКА", terminal: false, actions: [] },
    { id: "mpv.desktop", name: "MPV", comment: "Видеоплеер", exec: "mpv",
      icon: "", channel: "МЕДИА", terminal: false, actions: [] },
  ];

  const UI_DEFAULTS = {
    fisheye: true, fisheye_strength: 78, lens_mode: "auto", columns: "auto",
    icon_size: 56, show_exec: true, terminal: "kitty", opacity: 1, fullscreen: true,
    margin: 0, layer: "top", keyboard_focus: true, favorites: [], scanlines: true,
    grain: true, flicker: true, hide_on_launch: false, categories: null, clock24: true,
  };

  const state = {
    payload: null,
    cfg: {},
    channel: "ALL",
    q: "",
    sel: 0,
    view: [],
  };

  /* —— мост в Python: WebKit messageHandlers, иначе HTTP /api —— */
  const HTTP_BRIDGE = /^https?:$/.test(location.protocol);

  function bridge(msg) {
    const text = typeof msg === "string" ? msg : JSON.stringify(msg);
    try {
      const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.objektiv;
      if (h && h.postMessage) {
        h.postMessage(text);
        return true;
      }
    } catch (e) { /* не WebKit — пробуем HTTP */ }
    if (HTTP_BRIDGE && window.fetch) {
      fetch("/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      }).then((r) => r.json()).then((data) => {
        window.OBJEKTIV && window.OBJEKTIV.reply(data);
      }).catch(() => {});
      return true;
    }
    return false;
  }

  function isFav(id) {
    return (state.cfg.favorites || []).indexOf(id) !== -1;
  }

  function apps() { return (state.payload && state.payload.apps) || []; }

  function visible() {
    const q = state.q.trim().toLowerCase();
    const terms = q ? q.split(/\s+/) : [];
    return apps().filter((a) => {
      if (state.channel === "FAV") {
        if (!isFav(a.id)) return false;
      } else if (state.channel !== "ALL" && String(a.channel).toUpperCase() !== state.channel) {
        return false;
      }
      if (!terms.length) return true;
      const hay = [a.name, a.comment, a.keywords, a.channel, a.exec,
                   (a.categories || []).join(" ")].join(" ").toLowerCase();
      return terms.every((t) => hay.indexOf(t) !== -1);
    });
  }

  /* —— отрисовка —— */
  function renderChannels() {
    const nav = $("#channels");
    if (!nav) return;
    const list = (state.payload && state.payload.channels) || [];
    let html = '<div class="ch-label">КАНАЛЫ</div>';
    list.forEach((c, i) => {
      const num = i < 10 ? String(i) : "·";
      const active = c.id === state.channel ? " active" : "";
      html +=
        '<button class="ch' + active + '" data-ch="' + esc(c.id) + '" type="button">' +
          '<span class="num">' + num + "</span>" +
          '<span class="nm">' + esc(c.name) + "</span>" +
          '<span class="cnt">' + c.count + "</span>" +
        "</button>";
    });
    nav.innerHTML = html;
    nav.querySelectorAll(".ch").forEach((b) => {
      b.addEventListener("click", () => {
        state.channel = b.getAttribute("data-ch");
        state.sel = 0;
        render();
      });
    });
  }

  function renderStats() {
    const box = $("#stats");
    if (!box) return;
    const total = apps().length;
    const chans = ((state.payload && state.payload.channels) || []).length - 1;
    const favs = apps().filter((a) => isFav(a.id)).length;
    const items = [
      [String(total).padStart(3, "0"), "приложений"],
      [String(chans).padStart(2, "0"), "каналов"],
      [String(favs).padStart(2, "0"), "избранное"],
      [state.payload ? state.payload.host : "-", "узел"],
    ];
    box.innerHTML = items.map(([v, k]) =>
      '<div class="stat"><b>' + esc(v) + "</b><span>" + esc(k) + "</span></div>").join("");
  }

  function renderGrid() {
    const grid = $("#grid");
    const empty = $("#empty");
    if (!grid) return;
    state.view = visible();
    const cfg = state.cfg;
    let html = "";
    state.view.forEach((a, i) => {
      const sel = i === state.sel ? " sel" : "";
      const fav = isFav(a.id) ? " fav" : "";
      const ico = a.icon
        ? '<img src="' + esc(a.icon) + '" alt="" />'
        : '<span class="fallback">' + esc(a.name.slice(0, 2)) + "</span>";
      const term = a.terminal ? '<span class="term">T</span>' : "";
      const acts = (a.actions || []).map((ac) =>
        '<button type="button" data-act="' + esc(ac.id) + '" data-app="' + esc(a.id) + '">' +
        esc(ac.name) + "</button>").join("");
      html +=
        '<div class="app' + sel + fav + '" data-id="' + esc(a.id) + '" role="button" tabindex="-1">' +
          '<span class="ico">' + ico + "</span>" +
          "<span>" +
            "<h3>" + esc(a.name) + term + "</h3>" +
            (a.comment ? "<p>" + esc(a.comment) + "</p>" : "") +
            (cfg.show_exec ? '<span class="exec">' + esc(a.exec) + "</span>" : "") +
            (acts ? '<span class="acts">' + acts + "</span>" : "") +
          "</span>" +
          '<span class="run">↵</span>' +
        "</div>";
    });
    grid.innerHTML = html;
    if (empty) empty.hidden = state.view.length > 0;

    const chTitle = $("#chTitle");
    const chCount = $("#chCount");
    const cur = ((state.payload && state.payload.channels) || [])
      .find((c) => c.id === state.channel);
    if (chTitle) chTitle.textContent = cur ? cur.name : "ВСЕ КАНАЛЫ";
    if (chCount) chCount.textContent = String(state.view.length).padStart(3, "0") + " / " + String(apps().length).padStart(3, "0");

    grid.querySelectorAll(".app").forEach((el) => {
      el.addEventListener("click", (ev) => {
        const id = el.getAttribute("data-id");
        const actBtn = ev.target.closest("button[data-act]");
        if (actBtn) {
          ev.stopPropagation();
          const app = apps().find((a) => a.id === actBtn.getAttribute("data-app"));
          const action = (app.actions || []).find((x) => x.id === actBtn.getAttribute("data-act"));
          if (app && action) launch(app, action);
          return;
        }
        state.sel = state.view.findIndex((a) => a.id === id);
        const app = state.view[state.sel];
        if (app) launch(app);
      });
      el.addEventListener("dblclick", () => { /* запуск уже по одному клику */ });
    });
    bend();
  }

  function bend() {
    const grid = $("#grid");
    if (!grid || !document.body.classList.contains("lens-bend")) return;
    const cards = grid.querySelectorAll(".app");
    const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length);
    cards.forEach((el, i) => {
      const c = i % cols;
      const off = (c - (cols - 1) / 2) / Math.max(1, (cols - 1) / 2);
      el.style.transform = "rotateY(" + (-off * 3.4).toFixed(2) + "deg)";
    });
  }

  function render() {
    renderChannels();
    renderStats();
    renderGrid();
    const help = $("#scanHelp");
    if (help) {
      help.textContent =
        "/ — поиск · ↑↓←→ — выбор · ↵ — запуск · S — избранное · F — объектив · R — перескан · H — помощь";
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* —— действия —— */
  function move(delta) {
    const n = state.view.length;
    if (!n) return;
    state.sel = (state.sel + delta + n) % n;
    renderGrid();
    const el = $("#grid .app.sel");
    el && el.scrollIntoView({ block: "nearest" });
  }

  function moveVertical(delta) {
    const grid = $("#grid");
    if (!grid) return;
    const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length);
    move(delta * cols);
  }

  function launch(app, action) {
    if (!app) return;
    const target = action ? Object.assign({}, app, { exec: action.exec, name: action.name }) : app;
    bridge({ cmd: "launch", app: target });
    window.CAM && window.CAM.staticBurst(180);
    window.CAM && window.CAM.osd("ЗАПУСК · " + (action ? action.name : app.name));
  }

  function toggleFav() {
    const app = state.view[state.sel];
    if (!app) return;
    bridge({ cmd: "favorite", id: app.id });
    window.CAM && window.CAM.osd(isFav(app.id) ? "УБРАНО · " + app.name : "ИЗБРАННОЕ · " + app.name);
  }

  function toggleFisheye() {
    const on = window.CAM ? window.CAM.toggleFisheye() : true;
    bridge({ cmd: "config", patch: { fisheye: !!on } });
    window.CAM && window.CAM.osd(on ? "ОБЪЕКТИВ · ВКЛ" : "ОБЪЕКТИВ · ВЫКЛ");
  }

  function rescan() {
    bridge({ cmd: "rescan" });
    window.CAM && window.CAM.osd("ПЕРЕСКАН …");
  }

  function toggleHelp(force) {
    const h = $("#help");
    if (!h) return;
    const show = force !== undefined ? force : !h.classList.contains("show");
    h.classList.toggle("show", show);
  }

  function setChannelByIndex(i) {
    const list = (state.payload && state.payload.channels) || [];
    if (list[i]) {
      state.channel = list[i].id;
      state.sel = 0;
      render();
    }
  }

  /* —— клавиатура —— */
  function onKey(ev) {
    const tag = (ev.target && ev.target.tagName) || "";
    const typing = tag === "INPUT" || tag === "TEXTAREA";

    if (ev.key === "/" && !typing) {
      ev.preventDefault();
      const q = $("#q");
      q && q.focus();
      return;
    }
    if (ev.key === "Escape") {
      const h = $("#help");
      if (h && h.classList.contains("show")) { toggleHelp(false); return; }
      if (typing) { $("#q").blur(); return; }
      if (state.q) { $("#q").value = ""; state.q = ""; state.sel = 0; render(); return; }
      return;
    }
    if (ev.key === "Enter") {
      const app = state.view[state.sel];
      if (app) { ev.preventDefault(); launch(app); }
      return;
    }
    if (typing) return;

    switch (ev.key) {
      case "ArrowDown": ev.preventDefault(); moveVertical(1); break;
      case "ArrowUp": ev.preventDefault(); moveVertical(-1); break;
      case "ArrowRight": ev.preventDefault(); move(1); break;
      case "ArrowLeft": ev.preventDefault(); move(-1); break;
      case "Home": ev.preventDefault(); state.sel = 0; renderGrid(); break;
      case "End": ev.preventDefault(); state.sel = Math.max(0, state.view.length - 1); renderGrid(); break;
      case "PageDown": ev.preventDefault(); moveVertical(3); break;
      case "PageUp": ev.preventDefault(); moveVertical(-3); break;
      default: break;
    }

    const k = ev.key.toLowerCase();
    if (k === "f") { ev.preventDefault(); toggleFisheye(); }
    else if (k === "r") { ev.preventDefault(); rescan(); }
    else if (k === "h") { ev.preventDefault(); toggleHelp(); }
    else if (k === "s") { ev.preventDefault(); toggleFav(); }
    else if (/^[0-9]$/.test(ev.key)) { ev.preventDefault(); setChannelByIndex(Number(ev.key)); }
  }

  /* —— загрузка данных —— */
  function boot(payload) {
    state.payload = payload;
    state.cfg = Object.assign({}, UI_DEFAULTS, payload.config || {});
    state.channel = "ALL";
    state.sel = 0;
    if (window.CAM && window.CAM.applyConfig) window.CAM.applyConfig(state.cfg);
    const sub = $("#subtitle");
    if (sub && payload.subtitle) sub.textContent = payload.subtitle;
    const meta = $("#hostMeta");
    if (meta) meta.textContent = "CAM-07 · " + (payload.host || "-") + " · " + (payload.desktop || "-");
    const hud = $("#hostHud");
    if (hud) hud.textContent = "OBJ-07 · APPS " + String(payload.count).padStart(3, "0");
    render();
    window.CAM && window.CAM.boot();
  }

  window.OBJEKTIV = {
    handshake(payload) { boot(payload || window.OBJEKTIV_PAYLOAD); },
    apply(payload) {
      state.payload = payload;
      state.cfg = Object.assign({}, UI_DEFAULTS, payload.config || state.cfg);
      if (state.sel >= visible().length) state.sel = 0;
      render();
    },
    reply(msg) {
      if (!msg) return;
      if (msg.cmd === "launch") {
        window.CAM && window.CAM.osd(msg.ok ? "ГОТОВО · " + msg.info : "ОШИБКА · " + msg.info, 2200);
      }
    },
  };

  document.addEventListener("DOMContentLoaded", () => {
    const q = $("#q");
    if (q) {
      q.addEventListener("input", () => {
        state.q = q.value;
        state.sel = 0;
        renderGrid();
      });
    }
    const clr = $("#qClear");
    if (clr) clr.addEventListener("click", () => {
      if (q) q.value = "";
      state.q = "";
      state.sel = 0;
      renderGrid();
      q && q.focus();
    });
    const fb = $("#fisheyeBtn");
    if (fb) fb.addEventListener("click", toggleFisheye);
    const hc = $("#helpClose");
    if (hc) hc.addEventListener("click", () => toggleHelp(false));
    document.addEventListener("keydown", onKey);

    // payload.js (сгенерирован objektiv.py) → handshake из Python → демо
    if (window.OBJEKTIV_PAYLOAD) {
      boot(window.OBJEKTIV_PAYLOAD);
    } else {
      setTimeout(() => {
        if (state.payload) return;
        boot({
          app: "ОБЪЕКТИВ-07", subtitle: "APP DASHBOARD", version: "07.1",
          host: "preview", desktop: "browser", kernel: "-",
          config: Object.assign({}, UI_DEFAULTS),
          channels: [
            { id: "ALL", name: "ВСЕ КАНАЛЫ", count: FALLBACK_DEMO.length },
            { id: "ИНТЕРНЕТ", name: "ИНТЕРНЕТ", count: 1 },
            { id: "ТЕРМИНАЛ", name: "ТЕРМИНАЛ", count: 1 },
            { id: "РАЗРАБОТКА", name: "РАЗРАБОТКА", count: 1 },
            { id: "ГРАФИКА", name: "ГРАФИКА", count: 1 },
            { id: "МЕДИА", name: "МЕДИА", count: 1 },
          ],
          apps: FALLBACK_DEMO, favorites: [], generated: "-", count: FALLBACK_DEMO.length,
        });
      }, 500);
    }
    window.addEventListener("resize", bend);
  });
})();

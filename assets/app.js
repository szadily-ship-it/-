/* ОБЪЕКТИВ-07 UI */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  let channel = "scan";
  let filterQ = "";

  function detect(raw) {
    const q = (raw || "").trim();
    if (!q) return { type: null, q };
    if (/^https?:\/\//i.test(q)) return { type: "url", q };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)) return { type: "email", q };
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(q)) return { type: "ip", q };
    const digits = q.replace(/[^\d+]/g, "");
    if (/^\+?\d{10,15}$/.test(digits) && digits.replace(/\D/g, "").length >= 10) {
      return { type: "phone", q, digits: digits.replace(/\D/g, "") };
    }
    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(q) && !q.includes(" ")) return { type: "domain", q };
    if (/^[a-zA-Z0-9._-]{2,32}$/.test(q) && !q.includes(" ")) return { type: "username", q };
    return { type: "name", q };
  }

  function fill(url, q, extra) {
    const raw = extra && extra.raw != null ? extra.raw : q;
    const domain = extra && extra.domain || (q.includes("@") ? q.split("@")[1] : q);
    return url
      .replaceAll("{q}", encodeURIComponent(q))
      .replaceAll("{raw}", encodeURIComponent(raw).replace(/%40/g, "@"))
      .replaceAll("{domain}", encodeURIComponent(domain));
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toolsFor(ch, q) {
    const all = window.OSINT.tools;
    let list = ch === "scan"
      ? all.filter((t) => /OSINT Framework|Bellingcat|Epieos|Shodan|Wayback|Яндекс.Картинки|Rusprofile|TGStat|WhatsMyName|Have I Been Pwned|crt\.sh|Публичная/.test(t.name))
      : all.filter((t) => t.cats.includes(ch));
    if (q) {
      const n = q.toLowerCase();
      list = window.OSINT.tools.filter((t) => {
        const hay = (t.name + " " + t.desc + " " + (t.tags || "") + " " + t.cats.join(" ")).toLowerCase();
        return hay.includes(n);
      });
    }
    return list;
  }

  function renderChannels() {
    const box = $("#channels");
    box.innerHTML = '<div class="ch-label">INPUTS</div>' + window.OSINT.channels.map((c) => `
      <button class="ch ${c.id === channel ? "active" : ""}" data-id="${c.id}">
        <span class="num">CH-${c.ch}</span>
        <span class="nm">${c.name}</span>
        <span class="hint">${c.hint}</span>
      </button>
    `).join("");
    $$(".ch", box).forEach((b) => b.addEventListener("click", () => switchChannel(b.dataset.id)));
  }

  function switchChannel(id) {
    if (id === channel && id !== "scan") {
      /* still flash */
    }
    window.CAM && window.CAM.staticBurst(140);
    setTimeout(() => {
      channel = id;
      filterQ = "";
      const inp = $("#filterInput");
      if (inp) inp.value = "";
      render();
    }, 120);
  }

  function card(t) {
    const tag = (t.cats[0] || "src").toUpperCase();
    return `
      <a class="card" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">
        <span class="tag">${esc(tag)}</span>
        <span class="go">OPEN ↗</span>
        <h3>${esc(t.name)}</h3>
        <p>${esc(t.desc)}</p>
      </a>
    `;
  }

  function renderScanner() {
    return `
      <div class="scan-box">
        <div class="scan-row">
          <input id="scanInput" placeholder="ник / email / телефон / домен / IP / URL / ФИО" autocomplete="off" spellcheck="false" />
          <button type="button" id="scanBtn">SCAN</button>
        </div>
        <div class="scan-help">пассивный захват цели · откроет набор источников в новых вкладках · ничего не отправляется на этот узел</div>
        <div id="scanOut"></div>
      </div>
      <div class="stat-row">
        <div class="stat"><b>${window.OSINT.tools.length}</b><span>источников</span></div>
        <div class="stat"><b>${window.OSINT.channels.length}</b><span>каналов</span></div>
        <div class="stat"><b>${window.OSINT.dorks.length}</b><span>dorks</span></div>
        <div class="stat"><b>NTSC</b><span>fisheye 1.7mm</span></div>
      </div>
    `;
  }

  function renderPlaybook(kind, q, extra) {
    const pb = window.OSINT.playbooks[kind] || [];
    const labels = {
      username: "USERNAME",
      email: "EMAIL",
      phone: "PHONE",
      domain: "DOMAIN",
      ip: "IPv4",
      url: "URL",
      name: "NAME"
    };
    return `
      <span class="type-pill">TARGET · ${labels[kind] || kind}</span>
      <div class="playbook">
        ${pb.map((p) => {
          let href = fill(p.url, q, extra);
          return `<a class="play-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(p.name)}<small>захват</small></a>`;
        }).join("")}
      </div>
    `;
  }

  function bindScanner() {
    const run = () => {
      const raw = ($("#scanInput") && $("#scanInput").value) || "";
      const det = detect(raw);
      const out = $("#scanOut");
      if (!out) return;
      if (!det.type) { out.innerHTML = ""; return; }
      const extra = {};
      if (det.type === "phone") extra.raw = det.digits;
      if (det.type === "email") extra.domain = det.q.split("@")[1];
      if (det.type === "username") extra.raw = det.q.replace(/^@/, "");
      out.innerHTML = renderPlaybook(det.type, det.q.replace(/^@/, ""), extra);
    };
    const btn = $("#scanBtn");
    const inp = $("#scanInput");
    if (btn) btn.addEventListener("click", run);
    if (inp) inp.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  }

  function renderCheats() {
    const dorks = window.OSINT.dorks.map((d) => `
      <div class="dork">
        <div class="dt">${esc(d.title)} — ${esc(d.desc)}</div>
        <code>${esc(d.q)}</code>
        <button class="copy" data-copy="${esc(d.q)}">COPY</button>
      </div>
    `).join("");
    const notes = window.OSINT.cheats.map((c) => `
      <div class="cheat"><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p></div>
    `).join("");
    return `<div class="cheat"><h3>DORKS · подставь {d} домен, {n} имя, {p} телефон, {u} url</h3></div>${dorks}${notes}`;
  }

  function render() {
    const ch = window.OSINT.channels.find((c) => c.id === channel) || window.OSINT.channels[0];
    const feed = $("#feed");
    const list = toolsFor(channel, filterQ);
    let html = `
      <div class="feed-head">
        <div>▶ FEED &nbsp; <strong>CH-${ch.ch} ${ch.name}</strong></div>
        <div>${String(channel === "cheats" ? window.OSINT.cheats.length + window.OSINT.dorks.length : list.length).padStart(3, "0")} SOURCE(S)</div>
      </div>
    `;
    if (channel !== "cheats") {
      html += `<div class="filter-bar"><input id="filterInput" placeholder="фильтр по каналу…" value="${esc(filterQ)}" /></div>`;
    }
    if (channel === "scan" && !filterQ) html += renderScanner();
    if (channel === "cheats" && !filterQ) html += renderCheats();
    else {
      html += list.length
        ? `<div class="grid">${list.map(card).join("")}</div>`
        : `<div class="empty">NO SIGNAL · нет совпадений</div>`;
    }
    html += `<p class="disclaimer">Архив открытых источников. Только законные исследования: журналистика, безопасность своей инфраструктуры, поиск себя. Нет взлома, нет обхода чужих аккаунтов, нет покупки доступов. Ссылки ведут на чужие сервисы — проверяй TOS.</p>`;
    feed.innerHTML = html;
    renderChannels();
    bindScanner();
    const fi = $("#filterInput");
    if (fi) {
      fi.addEventListener("input", () => {
        filterQ = fi.value;
        const keep = fi.selectionStart;
        render();
        const again = $("#filterInput");
        if (again) { again.focus(); again.setSelectionRange(keep, keep); }
      });
    }
    $$(".copy").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "OK"; }
      catch { b.textContent = "—"; }
      setTimeout(() => { b.textContent = "COPY"; }, 900);
    }));
  }

  function bindKeys() {
    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (e.key === "/" && tag !== "INPUT") {
        e.preventDefault();
        const a = $("#scanInput") || $("#filterInput");
        a && a.focus();
      }
      if (e.key === "f" && tag !== "INPUT") {
        window.CAM && window.CAM.toggleFisheye();
      }
      if ((e.key === "h" || e.key === "?") && tag !== "INPUT") {
        $("#help").classList.toggle("show");
      }
      if (e.key === "Escape") {
        $("#help").classList.remove("show");
        $("#nosignal").classList.remove("show");
      }
      if (e.key === "n" && tag !== "INPUT") {
        $("#nosignal").classList.toggle("show");
      }
      if (/^[0-9]$/.test(e.key) && tag !== "INPUT") {
        const idx = Number(e.key);
        const ch = window.OSINT.channels[idx];
        if (ch) switchChannel(ch.id);
      }
    });
    const fb = $("#fisheyeBtn");
    if (fb) fb.addEventListener("click", () => window.CAM.toggleFisheye());
    const hb = $("#helpClose");
    if (hb) hb.addEventListener("click", () => $("#help").classList.remove("show"));
  }

  document.addEventListener("DOMContentLoaded", () => {
    render();
    bindKeys();
    window.CAM.boot(() => {
      const s = $("#scanInput");
      s && s.focus();
    });
  });
})();

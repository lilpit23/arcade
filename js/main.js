// Home page: tabs, game/hack/project grids with search, filter and sort.
(function () {
  const S = window.SITE;
  const $ = (sel) => document.querySelector(sel);

  document.title = S.name;
  $("#site-name").textContent = S.name;
  $("#site-tagline").textContent = S.tagline;

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch { return null; }
  }

  async function loadJSON(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(url + " " + r.status);
    return r.json();
  }

  const byName = (a, b) => a.title.localeCompare(b.title);
  const byDate = (a, b) => String(b.added || "").localeCompare(String(a.added || ""));

  function matches(item, q) {
    if (!q) return true;
    const hay = [item.title, item.description, item.type, item.base, ...(item.tags || [])]
      .join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  }

  function thumb(item, extra = "") {
    const img = item.thumb
      ? `<img src="${esc(item.thumb)}" alt="" loading="lazy" onerror="this.remove()">`
      : "";
    return `<div class="thumb" style="--accent:${esc(item.color || "#ff2e88")}">
      <span class="glyph">${esc(item.glyph || item.title.slice(0, 3).toUpperCase())}</span>
      ${img}
      <span class="badge">${esc(item.type || item.system || "")}</span>
      ${extra}
    </div>`;
  }

  function renderChips(el, items, state, onChange) {
    const counts = {};
    items.forEach((i) => (counts[i.type] = (counts[i.type] || 0) + 1));
    const types = ["all", ...Object.keys(counts).sort()];
    el.innerHTML = types.map((t) =>
      `<button type="button" class="chip${state.type === t ? " active" : ""}" data-type="${esc(t)}">
        ${esc(t)}<span class="n">${t === "all" ? items.length : counts[t]}</span></button>`).join("");
    el.onclick = (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      state.type = b.dataset.type;
      onChange();
    };
  }

  // ---------- tabs ----------
  function showTab() {
    const tab = (location.hash || "#games").slice(1);
    const valid = ["games", "hacks", "projects"].includes(tab) ? tab : "games";
    document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== valid));
    document.querySelectorAll(".tab").forEach((t) =>
      t.setAttribute("aria-selected", String(t.dataset.tab === valid)));
  }
  window.addEventListener("hashchange", showTab);
  showTab();

  // ---------- CRT toggle ----------
  if (store("arcade.nocrt") === "1") document.body.classList.add("no-crt");
  $("#crt-toggle").onclick = () => {
    const off = document.body.classList.toggle("no-crt");
    store("arcade.nocrt", off ? "1" : "0");
  };

  // ---------- games ----------
  const gameState = { type: "all", q: "", sort: store("arcade.sort") || "plays-desc", plays: {} };
  let games = [];

  function renderGames() {
    renderChips($("#game-types"), games, gameState, renderGames);
    const recent = window.Counter.recent();
    const plays = gameState.plays;
    const list = games
      .filter((g) => gameState.type === "all" || g.type === gameState.type)
      .filter((g) => matches(g, gameState.q));

    const sorters = {
      "plays-desc": (a, b) => (plays[b.id] || 0) - (plays[a.id] || 0) || byName(a, b),
      "plays-asc": (a, b) => (plays[a.id] || 0) - (plays[b.id] || 0) || byName(a, b),
      recent: (a, b) => (recent[b.id] || 0) - (recent[a.id] || 0) || byName(a, b),
      newest: (a, b) => byDate(a, b) || byName(a, b),
      az: byName,
      za: (a, b) => byName(b, a),
    };
    list.sort(sorters[gameState.sort] || byName);

    $("#game-grid").innerHTML = list.length ? list.map((g) => {
      const href = g.direct ? g.path : `play.html?id=${encodeURIComponent(g.id)}`;
      const n = plays[g.id] || 0;
      return `<article class="card" style="--accent:${esc(g.color)}">
        ${thumb(g, `<span class="plays">&#9654; ${n.toLocaleString()} ${n === 1 ? "PLAY" : "PLAYS"}</span>`)}
        <div class="card-body">
          <h3 class="card-title">${esc(g.title)}</h3>
          <p class="card-desc">${esc(g.description)}</p>
          <div class="meta">&#127918; ${esc(g.controls || "")}</div>
          <div class="tags">${(g.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>
          <div class="btn-row">
            <a class="btn" href="${esc(href)}">PLAY</a>
            ${g.source ? `<a class="btn ghost" href="${esc(g.source)}" target="_blank" rel="noopener">SOURCE</a>` : ""}
          </div>
        </div>
      </article>`;
    }).join("") : `<div class="empty">NO GAMES FOUND<br>TRY ANOTHER SEARCH</div>`;
  }

  $("#game-sort").value = gameState.sort;
  $("#game-sort").onchange = (e) => { gameState.sort = e.target.value; store("arcade.sort", gameState.sort); renderGames(); };
  $("#game-search").oninput = (e) => { gameState.q = e.target.value.trim(); renderGames(); };

  loadJSON("data/games.json").then(async (data) => {
    games = data;
    renderGames(); // draw immediately, fill in counts when they arrive
    gameState.plays = await window.Counter.getAll(games.map((g) => g.id));
    $("#counter-note").textContent = window.Counter.mode === "global"
      ? "Play counts are shared by all players."
      : "Play counts are from this device only.";
    renderGames();
  }).catch((e) => {
    $("#game-grid").innerHTML = `<div class="empty">COULD NOT LOAD GAMES<br>${esc(e.message)}</div>`;
  });

  // ---------- ROM hacks ----------
  const hackState = { q: "", sort: "az" };
  let hacks = [];

  function renderHacks() {
    const list = hacks.filter((h) => matches(h, hackState.q));
    const sorters = {
      az: byName,
      za: (a, b) => byName(b, a),
      base: (a, b) => a.base.localeCompare(b.base) || byName(a, b),
    };
    list.sort(sorters[hackState.sort]);
    $("#hack-grid").innerHTML = list.length ? list.map((h) => `
      <article class="card" style="--accent:#e74c3c">
        ${thumb({ ...h, glyph: h.system.toUpperCase(), color: "#c0392b", type: h.system })}
        <div class="card-body">
          <h3 class="card-title">${esc(h.title)}</h3>
          <p class="card-desc">${esc(h.description)}</p>
          <div class="meta">Base ROM: ${esc(h.base)}<br>Patch type: ${esc(h.patch)}</div>
          <div class="btn-row">
            <a class="btn" href="emulator.html?hack=${encodeURIComponent(h.id)}">PATCH &amp; PLAY</a>
            <a class="btn ghost" href="https://duckduckgo.com/?q=${encodeURIComponent(h.search)}" target="_blank" rel="noopener">GET PATCH</a>
          </div>
        </div>
      </article>`).join("") : `<div class="empty">NO HACKS FOUND</div>`;
  }
  $("#hack-sort").onchange = (e) => { hackState.sort = e.target.value; renderHacks(); };
  $("#hack-search").oninput = (e) => { hackState.q = e.target.value.trim(); renderHacks(); };
  loadJSON("data/hacks.json").then((d) => { hacks = d; renderHacks(); }).catch(() => {});

  // ---------- projects ----------
  const projState = { type: "all", q: "", sort: "newest" };
  let projects = [];

  function renderProjects() {
    renderChips($("#project-types"), projects, projState, renderProjects);
    const list = projects
      .filter((p) => projState.type === "all" || p.type === projState.type)
      .filter((p) => matches(p, projState.q));
    const sorters = { newest: (a, b) => byDate(a, b) || byName(a, b), az: byName, za: (a, b) => byName(b, a) };
    list.sort(sorters[projState.sort]);
    $("#project-grid").innerHTML = list.length ? list.map((p) => `
      <article class="card" style="--accent:${esc(p.color)}">
        ${thumb(p)}
        <div class="card-body">
          <h3 class="card-title">${esc(p.title)}</h3>
          <p class="card-desc">${esc(p.description)}</p>
          <div class="tags">${(p.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>
          <div class="btn-row">
            ${p.link ? `<a class="btn alt" href="${esc(p.link)}">OPEN</a>` : ""}
            ${p.repo ? `<a class="btn ghost" href="${esc(p.repo)}" target="_blank" rel="noopener">CODE</a>` : ""}
          </div>
        </div>
      </article>`).join("") : `<div class="empty">NO PROJECTS YET</div>`;
  }
  $("#project-sort").onchange = (e) => { projState.sort = e.target.value; renderProjects(); };
  $("#project-search").oninput = (e) => { projState.q = e.target.value.trim(); renderProjects(); };
  loadJSON("data/projects.json").then((d) => { projects = d; renderProjects(); }).catch(() => {});
})();

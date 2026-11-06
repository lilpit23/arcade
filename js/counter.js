// Play counter: global via Abacus, with a per-device localStorage fallback.
(function () {
  const S = window.SITE;
  const LOCAL_KEY = "arcade.plays";
  const RECENT_KEY = "arcade.recent";

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage blocked */ }
  }
  // Abacus keys must be simple
  const safeKey = (id) => String(id).toLowerCase().replace(/[^a-z0-9_-]/g, "-");

  async function fetchJSON(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (r.status === 404) return { value: 0 };
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  const Counter = {
    // "global" when the shared counter answered, "local" otherwise
    mode: S.counter === "abacus" ? "global" : "local",

    async getAll(ids) {
      const local = readJSON(LOCAL_KEY, {});
      if (this.mode === "global") {
        try {
          const vals = await Promise.all(ids.map((id) =>
            fetchJSON(`${S.counterBase}/get/${S.counterNamespace}/${safeKey(id)}`)
              .then((j) => Number(j.value) || 0)));
          const out = {};
          ids.forEach((id, i) => (out[id] = vals[i]));
          return out;
        } catch (e) {
          console.warn("Global counter unavailable, using local counts", e);
          this.mode = "local";
        }
      }
      const out = {};
      ids.forEach((id) => (out[id] = local[id] || 0));
      return out;
    },

    async hit(id) {
      // always track locally (also powers "recently played")
      const local = readJSON(LOCAL_KEY, {});
      local[id] = (local[id] || 0) + 1;
      writeJSON(LOCAL_KEY, local);
      const recent = readJSON(RECENT_KEY, {});
      recent[id] = Date.now();
      writeJSON(RECENT_KEY, recent);

      if (S.counter === "abacus") {
        try {
          const j = await fetchJSON(`${S.counterBase}/hit/${S.counterNamespace}/${safeKey(id)}`);
          return Number(j.value) || local[id];
        } catch (e) { console.warn("Global counter hit failed", e); }
      }
      return local[id];
    },

    recent() { return readJSON(RECENT_KEY, {}); },
  };

  window.Counter = Counter;
})();

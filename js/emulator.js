// Emulator page: load the player's own ROM, optionally patch it, then boot EmulatorJS.
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const EXT_CORE = {
    gba: "gba", gb: "gb", gbc: "gb", nes: "nes", fds: "nes",
    sfc: "snes", smc: "snes", n64: "n64", z64: "n64", v64: "n64", nds: "nds",
    md: "segaMD", gen: "segaMD", smd: "segaMD", sms: "segaMS", gg: "segaGG",
    cue: "psx", pbp: "psx", chd: "psx",
  };

  let rom = null;      // { name, bytes }
  let patch = null;    // { name, bytes }
  let output = null;   // Uint8Array ready to play
  let hack = null;

  const status = (msg, kind = "") => { const el = $("#status"); el.className = "status " + kind; el.innerHTML = msg; };
  const ext = (name) => (name.split(".").pop() || "").toLowerCase();
  const baseName = (name) => name.replace(/\.[^.]+$/, "");

  // Preselected ROM hack (?hack=id)
  const hackId = new URLSearchParams(location.search).get("hack");
  if (hackId) {
    fetch("data/hacks.json").then((r) => r.json()).then((list) => {
      hack = list.find((h) => h.id === hackId);
      if (!hack) return;
      $("#system").value = hack.system;
      $("#hack-banner").hidden = false;
      $("#hack-banner").innerHTML = `<h2>PATCHING: ${esc(hack.title)}</h2>
        <p>You need: <strong>${esc(hack.base)}</strong> ROM (step 1) and the official ${esc(hack.patch)} patch (step 2).</p>
        <p class="meta">Don't have the patch? <a href="https://duckduckgo.com/?q=${encodeURIComponent(hack.search)}" target="_blank" rel="noopener">Find the official release</a>.</p>`;
    }).catch(() => {});
  }

  function wireDrop(dropId, inputId, onFile) {
    const drop = $(dropId), input = $(inputId);
    input.addEventListener("change", () => input.files[0] && onFile(input.files[0]));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault(); drop.classList.remove("drag");
      if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
    });
  }

  async function readFile(file) { return new Uint8Array(await file.arrayBuffer()); }

  wireDrop("#rom-drop", "#rom-file", async (file) => {
    rom = { name: file.name, bytes: await readFile(file) };
    $("#rom-name").textContent = `${file.name} (${(file.size / 1048576).toFixed(1)} MB)`;
    if (!$("#system").value || !hack) {
      const core = EXT_CORE[ext(file.name)];
      if (core) $("#system").value = core;
    }
    prepare();
  });

  wireDrop("#patch-drop", "#patch-file", async (file) => {
    patch = { name: file.name, bytes: await readFile(file) };
    $("#patch-name").textContent = file.name;
    prepare();
  });

  function prepare() {
    output = null;
    $("#start").disabled = true;
    $("#download").disabled = true;
    if (!rom) { status(patch ? "Now pick your base ROM in step 1." : ""); return; }

    if (!patch) {
      output = rom.bytes;
      status("ROM ready. Press START.", "ok");
    } else {
      if (["zip", "7z"].includes(ext(rom.name))) {
        status("Unzip your ROM first. Patches need the raw ROM file (.gba, .sfc, ...).", "err");
        return;
      }
      try {
        const res = window.RomPatcher.apply(rom.bytes, patch.bytes);
        output = res.data;
        $("#download").disabled = false;
        status(res.warnings.length
          ? "&#9888; " + res.warnings.map(esc).join("<br>&#9888; ") + "<br>You can still try START."
          : "Patched successfully! Press START.", res.warnings.length ? "warn" : "ok");
      } catch (e) {
        status("Patch failed: " + esc(e.message), "err");
        return;
      }
    }
    $("#start").disabled = false;
  }

  $("#system").addEventListener("change", () => rom && prepare());

  $("#download").onclick = () => {
    if (!output) return;
    const name = `${baseName(patch ? patch.name : rom.name)}.${ext(rom.name)}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([output]));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  $("#start").onclick = () => {
    const core = $("#system").value || EXT_CORE[ext(rom.name)];
    if (!core) { status("Couldn't detect the system. Pick it from the SYSTEM list.", "err"); return; }

    const gameName = patch ? baseName(patch.name) : baseName(rom.name);

    window.EJS_player = "#game";
    window.EJS_core = core;
    window.EJS_gameName = gameName; // used to name save files
    window.EJS_gameUrl = URL.createObjectURL(new Blob([output]));
    window.EJS_pathtodata = window.SITE.emulatorDataPath;
    window.EJS_startOnLoaded = true;
    window.EJS_color = "#ff2e88";

    $("#setup").hidden = true;
    $("#screen").hidden = false;
    $("#after").hidden = false;

    const s = document.createElement("script");
    s.src = window.SITE.emulatorDataPath + "loader.js";
    s.onerror = () => {
      $("#game").innerHTML = `<div class="empty">COULDN'T LOAD THE EMULATOR<br>CHECK YOUR CONNECTION, OR THE NETWORK MAY BLOCK cdn.emulatorjs.org</div>`;
    };
    document.body.appendChild(s);
    window.Counter.hit("emulator");
  };
})();

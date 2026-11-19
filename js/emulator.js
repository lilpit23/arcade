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
  let manualPatchSelection = 0;

  const status = (msg, kind = "") => { const el = $("#status"); el.className = "status " + kind; el.innerHTML = msg; };
  const ext = (name) => (name.split(".").pop() || "").toLowerCase();
  const baseName = (name) => name.replace(/\.[^.]+$/, "");

  // Preselected ROM hack (?hack=id)
  const params = new URLSearchParams(location.search);
  const titles = new Map([
    ["ALGE", "The Legacy of Goku"],
    ["ALFE", "The Legacy of Goku II"],
    ["BG3E", "Buu’s Fury"],
  ]);
  const gameCode = params.get("game");
  const title = titles.get(gameCode);
  if (title) {
    document.title = title + " | " + window.SITE.name;
    $(".player-title").textContent = title;
    $(".player-bar a").href = "full-games.html";
    $("#after a").href = "full-games.html";
    $("#after a").textContent = "return to Full Games";
    $("#rom-file").accept = ".gba";
    $("#system").value = "gba";
    $("#system").parentElement.hidden = true;
    $("#patch-drop").closest(".panel").hidden = true;
    $("#download").hidden = true;
    $("#setup .meta").textContent = "Select the USA cartridge file for " + title + ".";
    $("#start").closest(".panel").querySelector(".step-num").textContent = "STEP 2 · PLAY";
  }
  const hackId = title ? null : params.get("hack");
  let patchState = hackId ? "loading" : "";
  if (hackId) {
    fetch("data/hacks.json").then((r) => r.json()).then(async (list) => {
      hack = list.find((h) => h.id === hackId);
      if (!hack) {
        if (!manualPatchSelection) {
          patchState = "";
          prepare();
        }
        return;
      }
      $("#system").value = hack.system;
      const releaseUrl = hack.releaseUrl || `https://duckduckgo.com/?q=${encodeURIComponent(hack.search)}`;
      $("#hack-banner").hidden = false;
      $("#hack-banner").innerHTML = `<h2>PATCHING: ${esc(hack.title)}</h2>
        <p>You need: <strong>${esc(hack.base)}</strong> ROM (step 1). ${hack.patchUrl
          ? "The arcade loads the official patch for you."
          : `Add the official${hack.patch ? " " + esc(hack.patch) : ""} patch in step 2.`}</p>
        <p class="meta"><a href="${esc(releaseUrl)}" target="_blank" rel="noopener">${hack.releaseUrl ? "Official release" : "Find the official release"}</a></p>`;
      if (manualPatchSelection) return;
      if (!hack.patchUrl) {
        patchState = "";
        prepare();
        return;
      }
      prepare();
      const response = await fetch(hack.patchUrl, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (manualPatchSelection) return;
      setPatch(`${hack.id}${hack.patch}`, bytes, true);
    }).catch(() => {
      if (manualPatchSelection) return;
      patchState = "failed";
      prepare();
    });
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

  let romSelection = 0;
  wireDrop("#rom-drop", "#rom-file", async (file) => {
    const selection = ++romSelection;
    rom = null;
    prepare();
    let bytes;
    try { bytes = await readFile(file); }
    catch {
      if (selection === romSelection) status("Couldn’t read the game file. Choose it again.", "err");
      return;
    }
    if (selection !== romSelection) return;
    if (title && (bytes.length !== 8388608 || String.fromCharCode(...bytes.subarray(172, 176)) !== gameCode)) {
      $("#rom-name").textContent = file.name;
      status("Choose the USA .gba file for " + esc(title) + ".", "err");
      return;
    }
    rom = { name: file.name, bytes };
    $("#rom-name").textContent = `${file.name} (${(file.size / 1048576).toFixed(1)} MB)`;
    if (!title && (!$("#system").value || !hack)) {
      const core = EXT_CORE[ext(file.name)];
      if (core) $("#system").value = core;
    }
    prepare();
  });

  wireDrop("#patch-drop", "#patch-file", async (file) => {
    const selection = ++manualPatchSelection;
    patchState = "loading";
    prepare();
    try {
      const bytes = await readFile(file);
      if (selection === manualPatchSelection) setPatch(file.name, bytes);
    } catch {
      if (selection !== manualPatchSelection) return;
      patchState = "failed";
      prepare();
    }
  });

  function setPatch(name, bytes, automatic = false) {
    patch = { name, bytes, automatic };
    patchState = "";
    $("#patch-name").textContent = name;
    prepare();
  }

  function prepare() {
    output = null;
    $("#start").disabled = true;
    $("#download").disabled = true;
    if (patchState === "loading") { status("Loading patch information…"); return; }
    if (patchState === "failed") { status("Couldn’t load the patch. Add a patch file in step 2 or reload to retry.", "err"); return; }
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
        if (patch.automatic && res.warnings.length) {
          status("Patch failed: " + res.warnings.map(esc).join("<br>"), "err");
          return;
        }
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

    const gameName = title || (patch ? baseName(patch.name) : baseName(rom.name));

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

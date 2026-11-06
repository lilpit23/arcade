// Game player: loads one game from data/games.json into an iframe and counts the play.
(async function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const id = new URLSearchParams(location.search).get("id");

  let games = [];
  try { games = await (await fetch("data/games.json", { cache: "no-cache" })).json(); } catch {}
  const game = games.find((g) => g.id === id);

  if (!game) {
    $("#title").textContent = "GAME NOT FOUND";
    $("#screen").innerHTML = `<div class="empty">NO GAME WITH ID "${esc(id)}"</div>`;
    return;
  }
  if (game.direct) { location.replace(game.path); return; }

  document.title = `${game.title} | ${window.SITE.name}`;
  $("#title").textContent = game.title;

  const frame = document.createElement("iframe");
  frame.src = game.path;
  frame.title = game.title;
  frame.allow = "fullscreen; autoplay; gamepad";
  frame.allowFullscreen = true;
  $("#screen").appendChild(frame);
  frame.addEventListener("load", () => { try { frame.contentWindow.focus(); } catch {} });

  $("#reload").onclick = () => { frame.src = game.path; };
  $("#fullscreen").onclick = () => {
    const el = frame;
    (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
  };

  $("#info").hidden = false;
  $("#info").innerHTML = `
    <h2>HOW TO PLAY</h2>
    <p>${esc(game.description)}</p>
    <p><strong>Controls:</strong> ${esc(game.controls || "See in game")}</p>
    <p class="meta">License: ${esc(game.license || "?")}${game.source
      ? ` &middot; <a href="${esc(game.source)}" target="_blank" rel="noopener">Source code</a>` : ""}</p>`;

  window.Counter.hit(game.id);
})();

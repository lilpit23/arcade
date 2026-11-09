# LILPIT ARCADE

A retro-styled game site for GitHub Pages. It has open-source browser games, a bring-your-own-ROM emulator with a built-in ROM hack patcher, and a section for your own projects.

## Put it online
1. Push this repo to GitHub.
2. Go to **Settings → Pages**, set **Source** to "Deploy from a branch", and pick `main` and `/ (root)`.
3. After a minute it's live at `https://<username>.github.io/<repo>/`.
   If you name the repo `<username>.github.io`, it's served at `https://<username>.github.io/`.

## Settings
Edit `js/config.js` to change the site name, tagline and play counter:
- `counter: "abacus"` gives global play counts shared by every visitor, through the free [Abacus](https://abacus.jasoncameron.dev) API. If that API is down or blocked, the site falls back to counting on each device.
- `counter: "local"` counts plays per device only.

## Add a game
1. Put the game's files in `games/<game-id>/`. It needs an `index.html`.
2. Add an entry to `data/games.json`:
```json
{
  "id": "my-game",
  "title": "My Game",
  "type": "arcade",
  "description": "One line about the game.",
  "path": "games/my-game/index.html",
  "thumb": "thumbs/my-game.png",
  "glyph": "MG",
  "color": "#ff2e88",
  "controls": "Arrow keys",
  "tags": ["fun"],
  "license": "MIT",
  "source": "https://github.com/someone/my-game",
  "added": "2026-11-06"
}
```
`type` becomes a filter button automatically, so new types like `"shooter"` just work. `thumb` is optional. Without it, the card shows `glyph` on a `color` background.

## Add a project
1. Put a static site in `projects/<name>/`, or just link to something hosted elsewhere.
2. Add an entry to `data/projects.json` with `title`, `type`, `description`, `link`, and optionally `repo`, `tags`, `glyph`, `color` and `added`.

## ROM hacks
`data/hacks.json` lists hacks shown on the ROM HACKS tab. The site never hosts ROMs or patches. Players load their own base ROM and the official patch on `emulator.html`, and the patch is applied in the browser (`js/patcher.js` supports IPS, UPS and BPS). Don't commit ROM files or patched ROMs to this repo.

## Limits
GitHub Pages allows files up to 100 MB and about 1 GB per site.

## Credits
| Game | License | Source |
|---|---|---|
| 2048 | MIT | https://github.com/gabrielecirulli/2048 |
| Hextris | GPL-3.0 | https://github.com/Hextris/hextris |
| Clumsy Bird | GPL-3.0 | https://github.com/ellisonleao/clumsy-bird |
| A Dark Room | MPL-2.0 | https://github.com/doublespeakgames/adarkroom |
| HexGL | MIT | https://github.com/BKcore/HexGL |
| EmulatorJS (loaded from CDN) | GPL-3.0 | https://github.com/EmulatorJS/EmulatorJS |

Each game folder keeps its original license file.

## Added fan projects

These existing browser projects run locally through the arcade player, with no build step or external game server. Each folder includes its upstream license and commit in `UPSTREAM.md`.

| Game | Upstream license | Source |
|---|---|---|
| Infinite Mario | Unlicense | https://github.com/robertkleffner/mariohtml5 |
| Pacman Canvas | CC0-1.0 | https://github.com/platzhersh/pacman-canvas |
| JavaScript Tetris | MIT | https://github.com/jakesgordon/javascript-tetris |

Integration notes: Infinite Mario uses native startup instead of loading jQuery from a CDN; upstream background music is disabled. Pacman Canvas has upstream analytics, ads, obsolete app cache, and the PHP leaderboard UI disabled for static hosting; game audio and map files are local. Tetris is copied unchanged. These are unofficial fan projects. Upstream software licenses do not grant rights to third-party game names or artwork.

For local development, run `python3 -m http.server 8000 --bind 127.0.0.1` from the repository root.

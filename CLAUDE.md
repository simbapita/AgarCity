# CLAUDE.md — AgarCity

Top-down multiplayer urban-life browser game (Phaser 3 + Socket.io + Node/SQLite)
with a **Terraria-style reskin** (wooden UI, day/night, lighting, weather).

## Run
- `npm install && npm start` → http://localhost:3000 (override with `PORT=…`).
- No build step: client is plain ES5-style vanilla JS served statically from `client/`.
- Do NOT run `npm audit fix --force` (breaks deps).

## Architecture
- **Client** (`client/js/`): Phaser scenes + self-contained singleton "systems".
  - `config.js` `CFG` is the shared contract (tiles, zones, day/night constants). Load order in `index.html` matters — `config.js` first.
  - `PreloadScene` builds textures/anims → `GameScene` runs the top-down loop.
  - Systems are global singletons (`DayNight`, `Lighting`, `Particles`, `JobSystem`, `Minimap`, `Chat`, `UI`, `SC`); access via `window.X` with `if (window.X)` guards.
- **Server** (`server/`): `index.js` (socket wiring) → `gameState.js` (presence/position relay, scoreboards), `jobs.js` (job sessions + 500ms tick), `lobby.js`, `db.js` (better-sqlite3, auto-created).

## Invariants — do NOT break
- **It is a TOP-DOWN game.** No gravity (`arcade.gravity.y = 0`), no tile digging/placing, no side-scroller mechanics. Movement is 4-directional with `_canWalk` tile checks against `CFG.WALKABLE`.
- Keep the core loop intact: lobby/solo entry, character + specialization select, jobs, food/health survival, tokens/XP, minimap, scoreboard, chat, save codes (`localStorage 'agarcity_save'`).
- World is `70×70 @ TILE=32`. City layout is deterministic in `city.js` — change `drawTile` visuals freely, but keep tile TYPES and walkability stable (minimap + collision read them).
- Server is authoritative for position (anti-cheat speed clamp) and stats (jobs/food). Clients never trust each other.
- HTML element IDs and CSS class names in `index.html` are referenced by `ui.js`/`JobSystem.js`/`GameScene.js` — don't rename without updating both sides.

## Atmosphere (the reskin) — keep it cosmetic
- `DayNight`: full-screen MULTIPLY tint rect (depth 900, scrollFactor 0). Exposes `getSkyLight()/isNight()/getPhase()`. Cycle = `CFG.DAY_LENGTH_MS` / `CFG.DAY_FRACTION`. Local clock (not server-synced).
- `Lighting`: ADD warm radial glow canvas (depth 905) on player + landmarks, strength ∝ night. Fed each frame from `GameScene` with `{camera, skyLight, sources, player}`.
- `Particles`: ambient motes, footstep puffs, auto rain. Top-down API only (`init/footstep/setWeather/isRaining/update`).
- These overlays live INSIDE the Phaser canvas (z-index 0); DOM UI/HUD (z-index ≥10) stays at full brightness — preserve this layering.

## Git
- Active branch: `claude/agarcity-repo-push-yewlnt` (PR #1). Push there only.
- Pushes go through the GitHub MCP tools (git CLI auth is unavailable in this env).
- Validate JS with `node --check <file>` before pushing.

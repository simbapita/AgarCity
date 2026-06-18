# CLAUDE.md — AgarCity

Top-down multiplayer urban-life browser game (Phaser 3 + Socket.io + Node/SQLite)
with a **Terraria-style reskin** (wooden UI, day/night, lighting, weather).

## Run
- `npm install && npm start` → http://localhost:3000 (override with `PORT=…`).
- No build step: client is plain ES5-style vanilla JS served statically from `client/`.
- Do NOT run `npm audit fix --force` (breaks deps).
- Validate JS before pushing: `node --check client/js/systems/Audio.js` (or any file).

## File Map

```
agarcity/
├── client/
│   ├── index.html               ← Single page; all script tags here (order matters)
│   ├── audio/                   ← OGG sound files (stub silences; synth fallback built in)
│   ├── assets/chars/            ← 15 character sprite sheets (PNG, 8×3 grid, magenta BG)
│   └── js/
│       ├── config.js            ← CFG (tiles, zones, chars, specs) — load FIRST
│       ├── main.js              ← Phaser game bootstrap
│       ├── city.js              ← Deterministic 70×70 tile map generator
│       ├── socket-client.js     ← SC singleton (wraps socket.io events)
│       ├── ui.js                ← DOM HUD logic (tokens, health, food bars)
│       ├── scenes/
│       │   ├── PreloadScene.js  ← Textures, anims, city map build
│       │   └── GameScene.js     ← Main game loop (715 lines)
│       └── systems/             ← Optional global singletons (all IIFE pattern)
│           ├── Audio.js         ← Web Audio API (438 lines) — added in audio PR
│           ├── DayNight.js      ← MULTIPLY tint overlay, day/night cycle
│           ├── Lighting.js      ← ADD warm radial glow canvas
│           ├── Particles.js     ← Footstep puffs, ambient motes, rain
│           ├── JobSystem.js     ← Job zones, QTE mini-game, food stores (300 lines)
│           ├── Minimap.js       ← Canvas minimap in corner
│           └── Chat.js          ← In-game chat overlay
└── server/
    ├── index.js                 ← Socket.io wiring
    ├── gameState.js             ← Presence/position relay, scoreboards
    ├── jobs.js                  ← Job sessions + 500ms tick
    ├── lobby.js                 ← Lobby/room management
    └── db.js                    ← better-sqlite3, auto-created on first run
```

## Architecture

- **Client** (`client/js/`): Phaser scenes + self-contained singleton systems.
  - `config.js` `CFG` is the shared contract (tiles, zones, day/night constants). Load order in `index.html` matters — `config.js` first, then systems, then scenes.
  - `PreloadScene` builds textures/anims → `GameScene` runs the top-down loop.
  - Systems are global singletons (`Audio`, `DayNight`, `Lighting`, `Particles`, `JobSystem`, `Minimap`, `Chat`, `UI`, `SC`); always access via `if (window.X) X.method()` guards.
- **Server** (`server/`): `index.js` (socket wiring) → `gameState.js` (presence/position relay, scoreboards), `jobs.js` (job sessions + 500ms tick), `lobby.js`, `db.js` (better-sqlite3, auto-created).

## Invariants — do NOT break

- **TOP-DOWN game.** No gravity (`arcade.gravity.y = 0`), no tile digging/placing, no side-scroller mechanics. Movement is 4-directional with `_canWalk` tile checks against `CFG.WALKABLE`.
- Keep the core loop intact: lobby/solo entry, character + specialization select, jobs, food/health survival, tokens/XP, minimap, scoreboard, chat, save codes (`localStorage 'agarcity_save'`).
- World is `70×70 @ TILE=32`. City layout is deterministic in `city.js` — change `drawTile` visuals freely, but keep tile TYPES and walkability stable (minimap + collision read them).
- Server is authoritative for position (anti-cheat speed clamp) and stats (jobs/food). Clients never trust each other.
- HTML element IDs and CSS class names in `index.html` are referenced by `ui.js`/`JobSystem.js`/`GameScene.js` — don't rename without updating both sides.

## Characters & Specializations

**15 playable characters** (cosmetic skins only — index matches `CFG.CHAR_FILES` / `CFG.CHARS`):

| # | Name | Accent |
|---|------|--------|
| 0 | Knight | silver-grey |
| 1 | Barbarian | orange |
| 2 | Dwarf | brown |
| 3 | White Knight | gold |
| 4 | Shadow Knight | grey-blue |
| 5 | Wizard | blue |
| 6 | Female Archer | green |
| 7 | Assassin | dark grey (`#566573`) |
| 8 | Cleric | red |
| 9 | Priestess | white |
| 10 | Soldier | light grey |
| 11 | Blacksmith | orange |
| 12 | Farmer | blue |
| 13 | Merchant | teal |
| 14 | Maid | silver |

Sprites: `client/assets/chars/<name>.png` — 8-column × 3-row grid, magenta `#FF00FF` chroma-key background.

**6 specializations** (affect job zone eligibility):
`TECH` · `MEDICAL` · `FOOD_SERVICE` · `TRADES` · `BUSINESS` · `ARTS`

## Atmosphere Systems — keep changes cosmetic

- `DayNight`: full-screen MULTIPLY tint rect (depth 900, scrollFactor 0). Exposes `getSkyLight()/isNight()/getPhase()`. Cycle = `CFG.DAY_LENGTH_MS` / `CFG.DAY_FRACTION`. Local clock (not server-synced).
- `Lighting`: ADD warm radial glow canvas (depth 905) on player + landmarks, strength ∝ night. Fed each frame from `GameScene` with `{camera, skyLight, sources, player}`.
- `Particles`: ambient motes, footstep puffs, auto rain. Top-down API only (`init/footstep/setWeather/isRaining/update`).
- These overlays live INSIDE the Phaser canvas (z-index 0); DOM UI/HUD (z-index ≥10) stays at full brightness — preserve this layering.

## Audio System (`Audio.js`)

Full 5-phase Web Audio API singleton added to the project. No external library needed.

**Mixer graph:**
```
AudioContext.destination
  └── masterGain
        ├── bgmGain    ← looping BGM (crossfade on day/dusk/night transitions)
        ├── ambiGain   ← looping ambient (city hum / rain)
        ├── sfxGain    ← pooled one-shot effects (8-slot pool)
        └── uiGain     ← UI hover/click (never ducked)
```

**Public API:**
```js
Audio.init()                    // call once from GameScene.create()
Audio.update(dt)                // call every frame from GameScene.update()
Audio.playSFX(name, opts)       // opts: { volume, pitchVariance, priority }
Audio.playBGM(name)             // crossfade in over 2s
Audio.stopBGM()                 // crossfade out
Audio.setMasterVolume(0..1)
Audio.setBGMVolume(0..1)
Audio.setSFXVolume(0..1)
Audio.setAmbienceVolume(0..1)
Audio.setUIVolume(0..1)
```

**Sound files** live in `client/audio/` (OGG format). If a file is missing, `Audio.js` synthesizes a procedural fallback via Web Audio API (`_synthBuffer`) — so the game always has sound even without assets.

**Synth fallback types:** `tone` (sine wave) · `noise` (white noise + LFO) · `click` (decaying sine + noise) · `arp` (4-note arpeggio) · `chord` (3-frequency sum).

**BGM tracks auto-switch** based on `DayNight.getPhase()`: day → `bgm_day.ogg`, dusk/dawn → `bgm_dusk.ogg`, night → `bgm_night.ogg`.

**Ducking:** high-priority SFX (e.g. `sfx_car_hit.ogg`) drops BGM/ambi to 25% for 300ms then restores smoothly.

**UI auto-wiring:** `MutationObserver` attaches hover/click sounds to all buttons automatically (including dynamically created ones like char-select cards).

**Settings panel:** 🔊 button in HUD opens `#audio-settings` with 5 range sliders; values persist to `localStorage 'agarcity_audio'`.

**SFX hook locations:**
- Footsteps → `GameScene._footTimer` block (surface-aware via `_getSurface`)
- Car hit → `GameScene._updateCars` collision block
- NPC greet → `GameScene._updateNPCs` wave-state entry
- Job complete → `JobSystem` `job_complete` socket handler
- QTE success/fail → `JobSystem` `qte_result` handler
- Food bought → `JobSystem` `food_bought` handler

## QTE Mini-Game

Jobs include a Quick Time Event mini-game (added before audio PR):
- Server sends `qte_prompt` with a target key; client shows a prompt overlay.
- Player must press the key within the time window.
- `qte_result` event carries `{ success }` — triggers success/fail sounds + visual feedback.
- Logic lives in `JobSystem.js` and `server/jobs.js`.

## Git

- Active branch: `claude/agarcity-repo-push-yewlnt` (PR #1). Push there only.
- Pushes go through the **GitHub MCP tools** (`mcp__github__push_files`, `mcp__github__create_or_update_file`) — git CLI auth is unavailable in this env.
- Validate JS with `node --check <file>` before pushing.
- `localStorage` keys in use: `'agarcity_save'` (player save), `'agarcity_audio'` (volume settings).

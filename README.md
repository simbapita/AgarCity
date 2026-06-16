# TerraCity

A Terraria-style multiplayer 2D side-scroller built with Phaser 3, Socket.io, and Node.js.
Dig, build, and survive in a procedurally generated world with day/night, lighting, weather, and friends.

## Features
- **Procedural side-scrolling world** — rolling surface, dirt & stone layers, winding caves, ore/gem veins, trees, plus desert & snow biomes, all generated deterministically from a seed
- **Dig & build** — left-click to mine any block (tools, hardness & drops), right-click to place from your hotbar
- **Wooden hotbar inventory** — collect what you mine; 10 slots, select with 1-0 keys or the mouse wheel
- **Gravity platforming** — run, jump (with coyote-time + jump-buffer), and variable jump height
- **Day/night cycle** — a smooth sky that shifts through dawn → day → dusk → night, with an arcing sun, moon, and stars
- **Dynamic lighting** — the world is dark underground and at night; skylight, torches, and the player cast soft light that spills into caves
- **Particles & weather** — mining debris, footstep/jump/land puffs, drifting ambient dust, and rolling rain storms
- **Night slimes** — bouncing enemies spawn after dark; stomp them or run — they hit back
- **Solo or multiplayer** — play instantly solo, or share a 6-character world code; everyone explores the *same* world with synced block edits and live positions
- **In-game chat** — talk to other players in your world (press Enter)
- **Save codes** — your name & character are restored with a 12-character save code

## Getting Started
```bash
npm install
npm start
```
Then open `http://localhost:3000`.

## How to Play
- **A / D** or **← / →** — move
- **W / Space / ↑** — jump
- **Shift** — run
- **Left-click** (hold) — mine the highlighted block
- **Right-click** — place the selected block
- **1-0** or **mouse wheel** — select a hotbar slot
- **Enter** — chat
- Mine dirt, wood and stone to gather blocks; dig down for copper, iron, gold and gems
- Place **torches** to light up caves — it gets *dark* down there and at night
- Keep an eye on your **hearts**: slimes and long falls hurt; health slowly regenerates

## Tech Stack
- **Client:** Phaser 3 (arcade physics + tilemaps), Socket.io client, vanilla JS
- **Server:** Node.js, Express, Socket.io, better-sqlite3
- **World sync:** the server stores only the seed + block edits; every client generates the identical world locally

## Project Structure
```
client/
  index.html
  js/
    config.js          # Tiles, physics, world constants (shared contract)
    world.js           # Procedural world generator (seed -> terrain)
    socket-client.js   # Socket.io wrapper
    ui.js              # Start / lobby / character-select screens + HUD (hearts)
    main.js            # Phaser bootstrap (gravity on)
    systems/
      DayNight.js      # Sky gradient, sun/moon/stars, skylight value
      Lighting.js      # Tile light propagation + darkness overlay
      Particles.js     # Mining debris, dust, weather (rain)
      Inventory.js     # Wooden hotbar
      Chat.js          # In-game world chat
    scenes/
      PreloadScene.js  # Generates the tileset, player & enemy textures
      GameScene.js     # Movement, mining/placing, multiplayer, enemies
server/
  index.js     # Express + Socket.io entry point
  lobby.js     # Lobby / world-code management
  world.js     # Per-world seed + authoritative block edits
  gameState.js # Player presence & position relay
  db.js        # SQLite connection
  schema.sql   # Database schema
```

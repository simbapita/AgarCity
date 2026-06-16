# AgarCity

A multiplayer urban life browser game built with Phaser 3, Socket.io, and Node.js —
with a **Terraria-style look and feel**: a living day/night cycle, torch-lit nights,
weather, and a hand-crafted wooden UI.

## Features
- **Solo or multiplayer** — play instantly solo, or create/join a lobby with a 6-character code
- **Day/night cycle** — the whole city smoothly shifts through dawn → day → dusk → night
- **Atmospheric lighting** — at night the streets darken and a warm torch glow follows you, while lit buildings and job zones stay aglow
- **Particles & weather** — drifting ambient motes, footstep dust, and rolling rain storms
- **Wooden / parchment UI** — carved-plank panels, parchment inputs, and a wooden HUD with a live day/night indicator
- **Animated pixel characters** — 15 characters, each with idle / walk / run / work animations
- **Character customization** — 15 character skins and 6 career specializations
- **Job system** — 3-tier career progression (e.g. Dishwasher → Server → Head Chef)
- **Token economy** — earn tokens by working, spend them on food
- **Health & food survival** — food drains as you move; stay fed to regenerate health
- **Live minimap** — overview of the city, job zones, food stores, and players (toggle with M)
- **In-game chat** — talk to other players in your lobby (press Enter)
- **Scoreboard** — hold Tab to see the token/XP ranking for everyone in your game
- **Persistent progress** — save code restores your tokens, XP, and job tier
- **Procedural city map** — zone-based layout with parks, roads, shops, and districts, drawn in earthy pixel art

## Getting Started

```bash
npm install
npm start
```

Then open `http://localhost:3000` in your browser.

## How to Play
- **WASD / Arrows** — move around the city
- **Shift** — run (faster, but drains food quicker)
- **E** — interact with job zones and food stores
- **Enter** — open chat
- **Tab** (hold) — show the scoreboard
- **M** — toggle the minimap
- **Esc** — cancel an in-progress job
- Walk into a colored zone circle matching your specialization and press E to work
- Earn XP to unlock higher-tier jobs with better pay
- Keep your food bar up — buy food at orange store circles before your health drops

## Tech Stack
- **Client:** Phaser 3, Socket.io client, vanilla JS
- **Server:** Node.js, Express, Socket.io, better-sqlite3
- **Database:** SQLite (auto-created on first run)

## Project Structure
```
client/          # Frontend (served as static files)
  index.html
  assets/
    chars/         # 15 character sprite strips (knight.png, …) — 14 frames each
  js/
    config.js        # Game constants and zone definitions
    city.js          # Procedural city map generator
    ui.js            # Lobby/HUD screen manager
    socket-client.js # Socket.io wrapper
    scenes/
      PreloadScene.js  # Asset loading, spritesheet slicing, animations
      GameScene.js     # Main game loop
    systems/
      DayNight.js      # Day/night cycle + ambient scene tint
      Lighting.js      # Night-time torch glow (player + landmarks)
      Particles.js     # Ambient motes, footstep dust, rain weather
      JobSystem.js     # Job/food store interaction
      Minimap.js       # City overview minimap
      Chat.js          # In-game lobby chat
server/          # Backend
  index.js       # Express + Socket.io entry point
  lobby.js       # Lobby creation and management
  gameState.js   # Player movement and state
  jobs.js        # Job sessions and tick system
  db.js          # SQLite connection
  schema.sql     # Database schema
```

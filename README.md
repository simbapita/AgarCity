# AgarCity

A multiplayer urban life browser game built with Phaser 3, Socket.io, and Node.js.

## Features
- **Multiplayer lobbies** — create or join a game with a 6-character code
- **Character customization** — 8 color skins and 6 career specializations
- **Job system** — 3-tier career progression (e.g. Dishwasher → Server → Head Chef)
- **Token economy** — earn tokens by working, spend them on food
- **Persistent progress** — save code restores your tokens, XP, and job tier
- **Procedural city map** — zone-based layout with parks, roads, shops, and districts

## Getting Started

```bash
npm install
npm start
```

Then open `http://localhost:3000` in your browser.

## How to Play
- **WASD** — move around the city
- **E** — interact with job zones and food stores
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
  js/
    config.js        # Game constants and zone definitions
    city.js          # Procedural city map generator
    ui.js            # Lobby/HUD screen manager
    socket-client.js # Socket.io wrapper
    scenes/
      PreloadScene.js  # Asset generation
      GameScene.js     # Main game loop
    systems/
      JobSystem.js     # Job/food store interaction
server/          # Backend
  index.js       # Express + Socket.io entry point
  lobby.js       # Lobby creation and management
  gameState.js   # Player movement and state
  jobs.js        # Job sessions and tick system
  db.js          # SQLite connection
  schema.sql     # Database schema
```

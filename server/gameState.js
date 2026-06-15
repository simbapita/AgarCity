const { stmts } = require('./db');
const { getLobbyBySocket } = require('./lobby');

// Safe spawn point on a sidewalk tile at a road intersection
const SAFE_SPAWN_X = 336;
const SAFE_SPAWN_Y = 336;

// Map<lobbyCode, Map<playerId, PlayerState>>
const gameStates = new Map();

function getState(lobbyCode) {
  if (!gameStates.has(lobbyCode)) gameStates.set(lobbyCode, new Map());
  return gameStates.get(lobbyCode);
}

function initPlayer(lobbyCode, playerId, data) {
  const state = getState(lobbyCode);

  // Idempotent: if the player already has live state (e.g. player_ready fired
  // twice), keep their current position/stats rather than teleporting to spawn.
  const existing = state.get(playerId);
  if (existing) {
    if (data.characterId !== undefined) existing.characterId = data.characterId;
    if (data.specialization) existing.specialization = data.specialization;
    if (data.username) existing.username = data.username;
    return existing;
  }

  const db = stmts.findById.get(playerId);

  const ps = {
    playerId,
    username: data.username || db?.username || 'Unknown',
    characterId: data.characterId ?? db?.character_id ?? 0,
    specialization: data.specialization || db?.specialization || 'NONE',
    x: _safeSpawn(db?.spawn_x, SAFE_SPAWN_X),
    y: _safeSpawn(db?.spawn_y, SAFE_SPAWN_Y),
    direction: 'down',
    moving: false,
    running: false,
    working: false,
    tokens: db?.tokens ?? 100,
    health: db?.health ?? 100,
    food: db?.food ?? 100,
    jobXp: db?.job_xp ?? 0,
    jobTier: db?.job_tier ?? 0,
    lastUpdate: Date.now(),
  };

  state.set(playerId, ps);
  return ps;
}

function handlePlayerReady(socket, data, io) {
  const result = getLobbyBySocket(socket.id);
  if (!result || !result.lobby) return;
  const { lobby, playerId } = result;

  const ps = initPlayer(lobby.code, playerId, data);

  if (data.characterId !== undefined || data.specialization) {
    stmts.updateProgress.run({
      id: playerId,
      specialization: data.specialization || 'NONE',
      jobXp: ps.jobXp,
      jobTier: ps.jobTier,
      characterId: data.characterId ?? 0,
      outfit: '{}',
    });
  }

  const state = getState(lobby.code);
  const others = [];
  state.forEach((other, pid) => { if (pid !== playerId) others.push(other); });

  socket.emit('game_state_init', { self: ps, others });
  socket.to(lobby.code).emit('player_joined_game', ps);
}

function handlePlayerMove(socket, data, io) {
  const result = getLobbyBySocket(socket.id);
  if (!result || !result.lobby) return;
  const { lobby, playerId } = result;

  const state = gameStates.get(lobby.code);   // non-creating read
  if (!state) return;
  const ps = state.get(playerId);
  if (!ps) return;

  const now = Date.now();
  const dt = Math.max((now - ps.lastUpdate) / 1000, 0.001);
  const dx = data.x - ps.x;
  const dy = data.y - ps.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Must exceed client running speed (160 * 1.6 = 256) plus latency headroom.
  const MAX_SPEED = 320;

  if (dist > MAX_SPEED * dt + 24) {
    ps.lastUpdate = now;   // reset so the next dt is measured from the correction
    socket.emit('position_correction', { x: ps.x, y: ps.y });
    return;
  }

  ps.x = data.x;
  ps.y = data.y;
  ps.direction = data.direction || 'down';
  ps.moving = data.moving || false;
  ps.running = data.running || false;
  ps.working = data.working || false;
  ps.lastUpdate = now;

  socket.to(lobby.code).emit('player_moved', {
    playerId,
    x: ps.x,
    y: ps.y,
    direction: ps.direction,
    moving: ps.moving,
    running: ps.running,
    working: ps.working,
  });
}

function handleDisconnect(socket, lobbyCode, playerId, io) {
  if (!lobbyCode) return;
  const state = gameStates.get(lobbyCode);
  if (!state) return;

  const ps = state.get(playerId);
  if (ps) {
    stmts.updateStats.run({ id: playerId, tokens: Math.floor(ps.tokens), health: ps.health, food: ps.food });
    stmts.updateSpawn.run({ id: playerId, x: ps.x, y: ps.y });
    state.delete(playerId);
  }

  if (state.size === 0) gameStates.delete(lobbyCode);
  io.to(lobbyCode).emit('player_left_game', { playerId });
}

// Merge authoritative stat changes (from jobs/food) into the live in-memory
// state so they aren't lost when handleDisconnect persists in-memory values.
function applyServerStats(playerId, fields) {
  for (const state of gameStates.values()) {
    const ps = state.get(playerId);
    if (ps) {
      Object.assign(ps, fields);
      return true;
    }
  }
  return false;
}

// Broadcast a per-lobby scoreboard (ranked by tokens) to each active lobby.
function broadcastScoreboards(io) {
  gameStates.forEach((state, lobbyCode) => {
    if (state.size === 0) return;
    const rows = [];
    state.forEach((ps) => {
      rows.push({
        username: ps.username,
        characterId: ps.characterId,
        tokens: Math.floor(ps.tokens || 0),
        jobXp: ps.jobXp || 0,
        jobTier: ps.jobTier || 0,
      });
    });
    rows.sort((a, b) => b.tokens - a.tokens);
    io.to(lobbyCode).emit('scoreboard', { players: rows });
  });
}

// Validate spawn coordinate — reject the old broken default (1120)
// which lands inside a building. Fall back to a safe sidewalk tile.
function _safeSpawn(dbVal, safeVal) {
  if (dbVal == null) return safeVal;
  if (dbVal === 1120) return safeVal;
  return dbVal;
}

module.exports = {
  handlePlayerReady,
  handlePlayerMove,
  handleDisconnect,
  applyServerStats,
  broadcastScoreboards,
};

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

  const state = getState(lobby.code);
  const ps = state.get(playerId);
  if (!ps) return;

  const now = Date.now();
  const dt = Math.max((now - ps.lastUpdate) / 1000, 0.001);
  const dx = data.x - ps.x;
  const dy = data.y - ps.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const MAX_SPEED = 220;

  if (dist > MAX_SPEED * dt + 16) {
    socket.emit('position_correction', { x: ps.x, y: ps.y });
    return;
  }

  ps.x = data.x;
  ps.y = data.y;
  ps.direction = data.direction || 'down';
  ps.moving = data.moving || false;
  ps.lastUpdate = now;

  socket.to(lobby.code).emit('player_moved', {
    playerId,
    x: ps.x,
    y: ps.y,
    direction: ps.direction,
    moving: ps.moving,
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

// Validate spawn coordinate — reject the old broken default (1120)
// which lands inside a building. Fall back to a safe sidewalk tile.
function _safeSpawn(dbVal, safeVal) {
  if (dbVal == null) return safeVal;
  // The old default was 1120, which is inside a non-walkable building
  if (dbVal === 1120) return safeVal;
  return dbVal;
}

module.exports = { handlePlayerReady, handlePlayerMove, handleDisconnect };

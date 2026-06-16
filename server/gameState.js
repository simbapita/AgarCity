// ============================================================================
//  Player state for the side-scroller. The server is authoritative for
//  presence/identity and relays positions + block edits; terrain itself lives
//  in world.js (seed + edits) and is generated client-side.
// ============================================================================
const { stmts } = require('./db');
const { getLobbyBySocket } = require('./lobby');
const { getWorld, serializeEdits } = require('./world');

// Map<lobbyCode, Map<playerId, PlayerState>>
const gameStates = new Map();

function getState(code) {
  if (!gameStates.has(code)) gameStates.set(code, new Map());
  return gameStates.get(code);
}

function initPlayer(code, playerId, data) {
  const state = getState(code);
  const existing = state.get(playerId);
  if (existing) {
    if (data.characterId !== undefined) existing.characterId = data.characterId;
    if (data.username) existing.username = data.username;
    return existing;
  }
  const db = stmts.findById.get(playerId);
  const ps = {
    playerId,
    username: data.username || (db && db.username) || 'Player',
    characterId: data.characterId != null ? data.characterId : (db && db.character_id) || 0,
    x: null, y: null,           // unknown until the client reports its spawn
    facing: 1, moving: false, jumping: false,
    health: 100,
    spawned: false,
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

  // persist chosen character (best-effort)
  try {
    stmts.updateProgress.run({
      id: playerId, specialization: 'NONE', jobXp: 0, jobTier: 0,
      characterId: ps.characterId, outfit: '{}',
    });
  } catch (e) { /* non-fatal */ }

  const world = getWorld(lobby.code);

  // only include players who already have a real position
  const others = [];
  getState(lobby.code).forEach((o, pid) => {
    if (pid !== playerId && o.spawned) others.push(_pub(o));
  });

  socket.emit('game_state_init', {
    self: { playerId, username: ps.username, characterId: ps.characterId, health: ps.health },
    others,
    seed: world.seed,
    edits: serializeEdits(lobby.code),
    dayStart: world.dayStart,
  });
}

function handlePlayerMove(socket, data, io) {
  const result = getLobbyBySocket(socket.id);
  if (!result || !result.lobby) return;
  const { lobby, playerId } = result;

  const state = gameStates.get(lobby.code);
  if (!state) return;
  const ps = state.get(playerId);
  if (!ps) return;

  const x = +data.x, y = +data.y;
  if (!isFinite(x) || !isFinite(y)) return;

  const firstSpawn = !ps.spawned;
  ps.x = x; ps.y = y;
  ps.facing = data.facing === -1 ? -1 : 1;
  ps.moving = !!data.moving;
  ps.jumping = !!data.jumping;
  ps.lastUpdate = Date.now();

  if (firstSpawn) {
    ps.spawned = true;
    socket.to(lobby.code).emit('player_joined_game', _pub(ps));
  } else {
    socket.to(lobby.code).emit('player_moved', {
      playerId, x: ps.x, y: ps.y, facing: ps.facing,
      moving: ps.moving, jumping: ps.jumping, characterId: ps.characterId,
    });
  }
}

function handleDisconnect(socket, lobbyCode, playerId, io) {
  if (!lobbyCode) return;
  const state = gameStates.get(lobbyCode);
  if (!state) return;
  if (state.has(playerId)) {
    try { stmts.updateStats.run({ id: playerId, tokens: 100, health: 100, food: 100 }); } catch (e) {}
    state.delete(playerId);
  }
  if (state.size === 0) gameStates.delete(lobbyCode);
  io.to(lobbyCode).emit('player_left_game', { playerId });
}

function _pub(ps) {
  return {
    playerId: ps.playerId, username: ps.username, characterId: ps.characterId,
    x: ps.x, y: ps.y, facing: ps.facing, moving: ps.moving, jumping: ps.jumping,
  };
}

module.exports = { handlePlayerReady, handlePlayerMove, handleDisconnect };

const { v4: uuidv4 } = require('uuid');
const { stmts } = require('./db');

const lobbies = new Map();
const socketToPlayer = new Map();
const playerToSocket = new Map();

function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (lobbies.has(code));
  return code;
}

function generateSaveCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function createOrLoadPlayer(saveCode, username) {
  if (saveCode && saveCode.length === 12) {
    const existing = stmts.findBySaveCode.get(saveCode.toUpperCase());
    if (existing) return existing;
  }
  const id = uuidv4();
  const newCode = generateSaveCode();
  stmts.create.run({ id, saveCode: newCode, username, characterId: 0, specialization: 'NONE', tokens: 100 });
  return stmts.findById.get(id);
}

function serializePlayer(p) {
  return {
    id: p.id,
    username: p.username,
    characterId: p.character_id,
    specialization: p.specialization,
    tokens: p.tokens,
    health: p.health,
    food: p.food,
    jobXp: p.job_xp,
    jobTier: p.job_tier,
    houseLevel: p.house_level,
    spawnX: p.spawn_x,
    spawnY: p.spawn_y,
  };
}

function createLobby(socket, data, io) {
  const { username, saveCode, soloMode = false } = data;
  const player = createOrLoadPlayer(saveCode, username);
  const code = generateLobbyCode();

  lobbies.set(code, {
    code,
    hostId: player.id,
    soloMode,
    started: false,
    players: [],
    minToStart: soloMode ? 1 : 2,
  });

  // Emit lobby_created BEFORE _addToLobby so the client sets isHost=true
  // before the lobby_updated broadcast arrives.
  socket.emit('lobby_created', {
    code,
    saveCode: player.save_code,
    player: serializePlayer(player),
    soloMode,
  });

  _addToLobby(socket, lobbies.get(code), player, io);
}

function joinLobby(socket, data, io) {
  const { code, username, saveCode } = data;
  const lobby = lobbies.get(code.toUpperCase().trim());

  if (!lobby) {
    socket.emit('error', { message: 'Lobby not found. Check the code and try again.' });
    return;
  }

  const player = createOrLoadPlayer(saveCode, username);
  _addToLobby(socket, lobby, player, io);

  socket.emit('lobby_joined', {
    code: lobby.code,
    saveCode: player.save_code,
    player: serializePlayer(player),
  });
}

function _addToLobby(socket, lobby, player, io) {
  const prevInfo = socketToPlayer.get(socket.id);
  if (prevInfo && prevInfo.lobbyCode !== lobby.code) leaveLobby(socket, io);

  socketToPlayer.set(socket.id, { playerId: player.id, lobbyCode: lobby.code });
  playerToSocket.set(player.id, socket.id);

  if (!lobby.players.find(p => p.id === player.id)) {
    lobby.players.push({ id: player.id, username: player.username, characterId: player.character_id, ready: false });
  }

  socket.join(lobby.code);
  _broadcastLobby(lobby, io);
}

function _broadcastLobby(lobby, io) {
  const canStart = lobby.players.length >= lobby.minToStart;
  io.to(lobby.code).emit('lobby_updated', {
    players: lobby.players,
    code: lobby.code,
    started: lobby.started,
    soloMode: lobby.soloMode,
    minToStart: lobby.minToStart,
    canStart,
  });
}

function startGame(socket, io) {
  const info = socketToPlayer.get(socket.id);
  if (!info) return;
  const lobby = lobbies.get(info.lobbyCode);
  if (!lobby) return;

  if (lobby.hostId !== info.playerId) {
    socket.emit('error', { message: 'Only the host can start the game.' });
    return;
  }
  if (lobby.players.length < lobby.minToStart) {
    socket.emit('error', { message: `Need at least ${lobby.minToStart} players to start.` });
    return;
  }

  lobby.started = true;
  io.to(lobby.code).emit('game_start', { players: lobby.players });
}

function leaveLobby(socket, io) {
  const info = socketToPlayer.get(socket.id);
  if (!info) return;
  const { playerId, lobbyCode } = info;
  const lobby = lobbies.get(lobbyCode);

  if (lobby) {
    lobby.players = lobby.players.filter(p => p.id !== playerId);
    socket.leave(lobbyCode);
    if (lobby.players.length === 0) {
      lobbies.delete(lobbyCode);
    } else {
      _broadcastLobby(lobby, io);
    }
  }

  socketToPlayer.delete(socket.id);
  playerToSocket.delete(playerId);
}

function getLobbyBySocket(socketId) {
  const info = socketToPlayer.get(socketId);
  if (!info) return null;
  return { lobby: lobbies.get(info.lobbyCode), playerId: info.playerId };
}

module.exports = { createLobby, joinLobby, leaveLobby, startGame, getLobbyBySocket, socketToPlayer, playerToSocket };

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { createLobby, joinLobby, leaveLobby, startGame, getLobbyBySocket, socketToPlayer } = require('./lobby');
const { handlePlayerReady, handlePlayerMove, handleDisconnect } = require('./gameState');
const { setBlock } = require('./world');
const { stmts } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '../client')));
app.get('/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  socket.on('create_lobby', (data) => {
    try { createLobby(socket, data, io); }
    catch (e) { console.error('create_lobby:', e); socket.emit('error', { message: 'Failed to create world.' }); }
  });

  socket.on('join_lobby', (data) => {
    try { joinLobby(socket, data, io); }
    catch (e) { console.error('join_lobby:', e); socket.emit('error', { message: 'Failed to join world.' }); }
  });

  socket.on('start_game', () => {
    try { startGame(socket, io); }
    catch (e) { console.error('start_game:', e); socket.emit('error', { message: 'Failed to start.' }); }
  });

  socket.on('player_ready', (data) => {
    try { handlePlayerReady(socket, data, io); }
    catch (e) { console.error('player_ready:', e); }
  });

  socket.on('player_move', (data) => { handlePlayerMove(socket, data, io); });

  socket.on('block_set', (data) => {
    try {
      const result = getLobbyBySocket(socket.id);
      if (!result || !result.lobby) return;
      const idx = data && (data.index | 0);
      const type = data && (data.type | 0);
      if (idx == null || idx < 0) return;
      if (setBlock(result.lobby.code, idx, type)) {
        socket.to(result.lobby.code).emit('block_set', { index: idx, type });
      }
    } catch (e) { console.error('block_set:', e); }
  });

  socket.on('chat_message', (data) => {
    try {
      const result = getLobbyBySocket(socket.id);
      if (!result || !result.lobby) return;
      let text = (data && data.text ? String(data.text) : '').slice(0, 120).trim();
      if (!text) return;
      const db = stmts.findById.get(result.playerId);
      const username = (db && db.username) ? db.username : 'Player';
      socket.to(result.lobby.code).emit('chat_message', { username, text });
      socket.emit('chat_message', { username, text, self: true });
    } catch (e) { console.error('chat_message:', e); }
  });

  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`);
    const info = socketToPlayer.get(socket.id);
    if (info) {
      handleDisconnect(socket, info.lobbyCode, info.playerId, io);
      leaveLobby(socket, io);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`TerraCity running on http://localhost:${PORT}`));

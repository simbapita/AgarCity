const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { createLobby, joinLobby, leaveLobby, startGame, getLobbyBySocket, socketToPlayer, playerToSocket } = require('./lobby');
const { handlePlayerReady, handlePlayerMove, handleDisconnect, broadcastScoreboards } = require('./gameState');
const { startJob, cancelJob, buyFood, tickJobs, respondQte } = require('./jobs');

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
    catch (e) { console.error('create_lobby:', e); socket.emit('error', { message: 'Failed to create lobby.' }); }
  });

  socket.on('join_lobby', (data) => {
    try { joinLobby(socket, data, io); }
    catch (e) { console.error('join_lobby:', e); socket.emit('error', { message: 'Failed to join lobby.' }); }
  });

  socket.on('start_game', () => {
    try { startGame(socket, io); }
    catch (e) { console.error('start_game:', e); socket.emit('error', { message: 'Failed to start game.' }); }
  });

  socket.on('player_ready', (data) => {
    try { handlePlayerReady(socket, data, io); }
    catch (e) { console.error('player_ready:', e); }
  });

  socket.on('player_move', (data) => {
    handlePlayerMove(socket, data, io);
  });

  socket.on('start_job', (data) => {
    try { startJob(socket, data, io); }
    catch (e) { console.error('start_job:', e); }
  });

  socket.on('cancel_job', () => {
    try { cancelJob(socket); }
    catch (e) { console.error('cancel_job:', e); }
  });

  socket.on('buy_food', (data) => {
    try { buyFood(socket, data); }
    catch (e) { console.error('buy_food:', e); }
  });

  socket.on('qte_respond', (data) => {
    try { respondQte(socket, data); }
    catch (e) { console.error('qte_respond:', e); }
  });

  socket.on('chat_message', (data) => {
    try {
      const result = getLobbyBySocket(socket.id);
      if (!result || !result.lobby) return;
      let text = (data && data.text ? String(data.text) : '').slice(0, 120).trim();
      if (!text) return;
      const db = stmts.findById.get(result.playerId);
      const username = (db && db.username) ? db.username : 'Player';
      // Broadcast to everyone in the lobby; flag the sender's own copy.
      socket.to(result.lobby.code).emit('chat_message', { username, text });
      socket.emit('chat_message', { username, text, self: true });
    } catch (e) { console.error('chat_message:', e); }
  });

  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`);
    const info = socketToPlayer.get(socket.id);
    if (info) {
      cancelJob(socket);
      handleDisconnect(socket, info.lobbyCode, info.playerId, io);
      leaveLobby(socket, io);
    }
  });
});

// Job completion ticker — runs every 500ms
setInterval(() => {
  try { tickJobs(io, playerToSocket); }
  catch (e) { console.error('tickJobs:', e); }
}, 500);

// Scoreboard broadcast — runs every 2s
setInterval(() => {
  try { broadcastScoreboards(io); }
  catch (e) { console.error('broadcastScoreboards:', e); }
}, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`AgarCity running on http://localhost:${PORT}`));

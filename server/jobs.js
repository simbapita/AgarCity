const { stmts } = require('./db');
const { getLobbyBySocket, socketToPlayer } = require('./lobby');
const { applyServerStats } = require('./gameState');

const TIERS = {
  TECH:         [
    { tier:0, name:'IT Support',      xpReq:0,   dur:60,  tok:15, xp:5  },
    { tier:1, name:'Developer',       xpReq:50,  dur:90,  tok:35, xp:12 },
    { tier:2, name:'Lead Engineer',   xpReq:200, dur:120, tok:70, xp:25 },
  ],
  MEDICAL:      [
    { tier:0, name:'Hospital Orderly',xpReq:0,   dur:60,  tok:12, xp:5  },
    { tier:1, name:'Nurse',           xpReq:50,  dur:90,  tok:30, xp:12 },
    { tier:2, name:'Doctor',          xpReq:200, dur:120, tok:75, xp:28 },
  ],
  FOOD_SERVICE: [
    { tier:0, name:'Dishwasher',      xpReq:0,   dur:45,  tok:10, xp:4  },
    { tier:1, name:'Restaurant Server',xpReq:40, dur:60,  tok:25, xp:10 },
    { tier:2, name:'Head Chef',       xpReq:150, dur:90,  tok:55, xp:20 },
  ],
  TRADES:       [
    { tier:0, name:'Construction Laborer',xpReq:0,  dur:45,  tok:10, xp:4  },
    { tier:1, name:'Apprentice',          xpReq:40, dur:75,  tok:28, xp:11 },
    { tier:2, name:'Master Tradesperson', xpReq:160,dur:100, tok:60, xp:22 },
  ],
  BUSINESS:     [
    { tier:0, name:'Bank Clerk',      xpReq:0,   dur:60,  tok:12, xp:5  },
    { tier:1, name:'Analyst',         xpReq:50,  dur:90,  tok:32, xp:13 },
    { tier:2, name:'Executive',       xpReq:200, dur:120, tok:80, xp:30 },
  ],
  ARTS:         [
    { tier:0, name:'Gallery Intern',  xpReq:0,   dur:50,  tok:8,  xp:4  },
    { tier:1, name:'Artist',          xpReq:35,  dur:70,  tok:22, xp:10 },
    { tier:2, name:'Art Director',    xpReq:130, dur:100, tok:50, xp:20 },
  ],
  ANY:          [
    { tier:0, name:'Shop Assistant',  xpReq:0,   dur:45,  tok:8,  xp:3  },
  ],
};

// Active job sessions: Map<playerId, session>
const sessions = new Map();

function getBestJob(spec, xp) {
  const tiers = TIERS[spec];
  if (!tiers) return null;
  let job = tiers[0];
  for (const t of tiers) { if (xp >= t.xpReq) job = t; }
  return job;
}

function startJob(socket, data, io) {
  const result = getLobbyBySocket(socket.id);
  if (!result || !result.lobby) return;
  const { playerId } = result;

  if (sessions.has(playerId)) {
    socket.emit('error', { message: 'You are already working!' });
    return;
  }

  const db = stmts.findById.get(playerId);
  if (!db) return;

  const zoneSpec = data.zoneSpec || 'ANY';
  const playerSpec = db.specialization || 'NONE';

  if (zoneSpec !== 'ANY' && playerSpec !== zoneSpec) {
    socket.emit('error', { message: `This job needs ${zoneSpec} specialization.` });
    return;
  }

  const job = zoneSpec === 'ANY'
    ? TIERS.ANY[0]
    : getBestJob(zoneSpec, db.job_xp || 0);

  if (!job) { socket.emit('error', { message: 'No job available.' }); return; }

  sessions.set(playerId, {
    playerId,
    spec: zoneSpec,
    job,
    zoneId: data.zoneId,
    startTime: Date.now(),
    durationMs: job.dur * 1000,
  });

  socket.emit('job_started', {
    name: job.name,
    duration: job.dur,
    tokensReward: job.tok,
    xpReward: job.xp,
  });
}

function cancelJob(socket) {
  const result = getLobbyBySocket(socket.id);
  if (!result) return;
  sessions.delete(result.playerId);
  socket.emit('job_cancelled');
}

function buyFood(socket, data) {
  const result = getLobbyBySocket(socket.id);
  if (!result) return;
  const { playerId } = result;

  const db = stmts.findById.get(playerId);
  if (!db) return;

  const cost = data.cost || 5;
  const restore = data.restore || 30;
  if (db.tokens < cost) {
    socket.emit('error', { message: `Need ${cost} tokens to buy food.` });
    return;
  }

  const newTokens = db.tokens - cost;
  const newFood = Math.min(100, (db.food || 100) + restore);
  stmts.updateStats.run({ id: playerId, tokens: newTokens, health: db.health, food: newFood });
  applyServerStats(playerId, { tokens: newTokens, food: newFood });
  socket.emit('food_bought', { tokens: newTokens, food: newFood, cost, restored: restore });
}

// Called every 500ms from server/index.js
function tickJobs(io, playerToSocket) {
  const now = Date.now();
  sessions.forEach((s, playerId) => {
    if (now - s.startTime < s.durationMs) return;

    // Job complete
    sessions.delete(playerId);
    const db = stmts.findById.get(playerId);
    if (!db) return;

    const newXp = (db.job_xp || 0) + s.job.xp;
    const newTokens = (db.tokens || 0) + s.job.tok;

    // Determine new tier
    const tiers = TIERS[s.spec] || TIERS.ANY;
    let newTier = 0;
    for (const t of tiers) { if (newXp >= t.xpReq) newTier = t.tier; }

    stmts.updateProgress.run({
      id: playerId,
      specialization: db.specialization,
      jobXp: newXp,
      jobTier: newTier,
      characterId: db.character_id,
      outfit: db.outfit || '{}',
    });
    stmts.updateStats.run({ id: playerId, tokens: newTokens, health: db.health, food: db.food });
    applyServerStats(playerId, { tokens: newTokens, jobXp: newXp, jobTier: newTier });

    const socketId = playerToSocket.get(playerId);
    if (socketId) {
      io.to(socketId).emit('job_complete', {
        tokensEarned: s.job.tok,
        xpEarned: s.job.xp,
        newTokens,
        newXp,
        newTier,
        tierUp: newTier > db.job_tier,
        jobName: s.job.name,
      });
    }
  });
}

module.exports = { startJob, cancelJob, buyFood, tickJobs, sessions, TIERS };

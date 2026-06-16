// ============================================================================
//  Per-lobby world authority. The server never generates terrain — it only
//  holds the seed (so all clients build the same world) plus the running set
//  of block edits, and a shared day/night start time.
// ============================================================================
const WORLD_W = 300;
const WORLD_H = 170;
const MAX_INDEX = WORLD_W * WORLD_H;

// Map<lobbyCode, { seed, edits: Map<index,type>, dayStart }>
const worlds = new Map();

function getWorld(code) {
  if (!worlds.has(code)) {
    let seed = (Math.floor(Math.random() * 2147483646) + 1) | 0;
    if (seed === 0) seed = 1;
    worlds.set(code, { seed, edits: new Map(), dayStart: Date.now() });
  }
  return worlds.get(code);
}

function setBlock(code, index, type) {
  if (index < 0 || index >= MAX_INDEX) return false;
  const w = getWorld(code);
  w.edits.set(index, type | 0);   // air (0) is stored too, so digs persist
  return true;
}

function serializeEdits(code) {
  const w = getWorld(code);
  const arr = [];
  w.edits.forEach((type, index) => arr.push([index, type]));
  return arr;
}

function clearWorld(code) { worlds.delete(code); }

module.exports = { getWorld, setBlock, serializeEdits, clearWorld, WORLD_W, WORLD_H, MAX_INDEX };

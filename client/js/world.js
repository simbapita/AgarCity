// ============================================================================
//  World generator — deterministic Terraria-style terrain from a numeric seed.
//  Returns { tiles: number[H][W], surface: Int16Array, spawn:{x,y} }.
//  Both server and clients derive the SAME world from the same seed, so only
//  the seed (plus later block edits) needs to travel over the network.
// ============================================================================
function generateWorld(seed) {
  var T = CFG.T;
  var W = CFG.WORLD_W, H = CFG.WORLD_H;

  var rngState = (seed >>> 0) || 1;
  function rng() {
    rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
    var t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // --- smooth 1D value noise for the surface heightmap ---
  function smoothNoise1D(scale, octaves) {
    var grid = {};
    function rnd(i) {
      if (grid[i] === undefined) {
        var s = (Math.imul(i + 1, 374761393) ^ (seed << 1)) >>> 0;
        s = Math.imul(s ^ (s >>> 13), 1274126177) >>> 0;
        grid[i] = (s >>> 0) / 4294967296;
      }
      return grid[i];
    }
    return function (x) {
      var total = 0, amp = 1, freq = 1 / scale, max = 0;
      for (var o = 0; o < octaves; o++) {
        var xx = x * freq;
        var x0 = Math.floor(xx), f = xx - x0;
        var u = f * f * (3 - 2 * f);
        var v = rnd(x0) * (1 - u) + rnd(x0 + 1) * u;
        total += v * amp; max += amp;
        amp *= 0.5; freq *= 2;
      }
      return total / max;
    };
  }

  // --- 2D value noise for caves / ore fields ---
  function noise2D(px, py, salt) {
    var xi = Math.floor(px), yi = Math.floor(py);
    var xf = px - xi, yf = py - yi;
    function h(ax, ay) {
      var n = (Math.imul(ax, 73856093) ^ Math.imul(ay, 19349663) ^ Math.imul(salt, 83492791) ^ seed) >>> 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
      return (n >>> 0) / 4294967296;
    }
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = h(xi, yi) * (1 - u) + h(xi + 1, yi) * u;
    var b = h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u;
    return a * (1 - v) + b * v;
  }

  // --- allocate world as AIR ---
  var tiles = new Array(H);
  for (var y = 0; y < H; y++) tiles[y] = new Array(W).fill(T.AIR);

  // --- biome bands: a desert and a snow region placed deterministically ---
  var desertStart = Math.floor(W * (0.10 + rng() * 0.10));
  var desertEnd   = desertStart + Math.floor(W * 0.12);
  var snowStart   = Math.floor(W * (0.70 + rng() * 0.12));
  var snowEnd     = Math.min(W - 4, snowStart + Math.floor(W * 0.14));
  function biomeAt(x) {
    if (x >= desertStart && x <= desertEnd) return 'desert';
    if (x >= snowStart && x <= snowEnd) return 'snow';
    return 'normal';
  }

  // --- surface heightmap ---
  var baseRow = Math.floor(H * 0.30);     // ~row 51
  var hill = smoothNoise1D(34, 4);
  var fine = smoothNoise1D(9, 2);
  var surface = new Int16Array(W);
  for (var x = 0; x < W; x++) {
    var amp = 20;
    var hRow = baseRow + Math.floor((hill(x) - 0.5) * 2 * amp + (fine(x) - 0.5) * 6);
    if (biomeAt(x) === 'desert') hRow += 2;      // dunes sit a touch lower & flatter
    if (hRow < 8) hRow = 8;
    if (hRow > H - 30) hRow = H - 30;
    surface[x] = hRow;
  }
  // light smoothing so neighbouring columns don't jump
  for (var pass = 0; pass < 2; pass++) {
    for (var x = 1; x < W - 1; x++) {
      surface[x] = Math.round((surface[x - 1] + surface[x] * 2 + surface[x + 1]) / 4);
    }
  }

  var stoneDepth = 5;   // tiles of dirt before stone begins
  var bedrockRows = 3;

  // --- fill columns ---
  for (var x = 0; x < W; x++) {
    var s = surface[x];
    var biome = biomeAt(x);
    for (var y = s; y < H; y++) {
      var depth = y - s;
      var tile;
      if (y >= H - bedrockRows) {
        tile = T.BEDROCK;
      } else if (depth === 0) {
        tile = biome === 'desert' ? T.SAND : biome === 'snow' ? T.SNOW : T.GRASS;
      } else if (depth < stoneDepth + Math.floor(noise2D(x * 0.2, 0, 7) * 3)) {
        if (biome === 'desert') tile = T.SAND;
        else if (biome === 'snow' && depth < 2) tile = T.SNOW;
        else tile = (noise2D(x * 0.3, y * 0.3, 11) > 0.78) ? T.CLAY : T.DIRT;
      } else {
        tile = T.STONE;
      }
      tiles[y][x] = tile;
    }
  }

  // --- carve caves (only in the dirt/stone region) ---
  for (var x = 0; x < W; x++) {
    var s2 = surface[x];
    for (var y = s2 + 4; y < H - bedrockRows; y++) {
      var depth2 = y - s2;
      var n = noise2D(x * 0.09, y * 0.09, 23);
      var n2 = noise2D(x * 0.22, y * 0.22, 41);
      var caveThresh = 0.70 - Math.min(0.14, depth2 * 0.0016); // a bit more open with depth
      if (n > caveThresh && n2 > 0.45) {
        tiles[y][x] = T.AIR;
      }
    }
  }

  // --- ore / gem veins ---
  function vein(type, count, minDepthFrac, maxDepthFrac, size) {
    for (var i = 0; i < count; i++) {
      var cx = Math.floor(rng() * W);
      var s3 = surface[cx];
      var yMin = s3 + Math.floor((H - s3) * minDepthFrac);
      var yMax = s3 + Math.floor((H - s3) * maxDepthFrac);
      var cy = yMin + Math.floor(rng() * Math.max(1, yMax - yMin));
      var px = cx, py = cy;
      for (var k = 0; k < size; k++) {
        if (py > surface[Math.max(0, Math.min(W - 1, px))] + 3 && py < H - bedrockRows &&
            px >= 0 && px < W && tiles[py][px] === T.STONE) {
          tiles[py][px] = type;
        }
        px += (rng() < 0.5 ? -1 : 1) * (rng() < 0.6 ? 1 : 0);
        py += (rng() < 0.5 ? -1 : 1) * (rng() < 0.6 ? 1 : 0);
        px = Math.max(0, Math.min(W - 1, px));
        py = Math.max(0, Math.min(H - 1, py));
      }
    }
  }
  vein(T.COPPER, Math.floor(W * 0.26), 0.10, 0.55, 6);
  vein(T.IRON,   Math.floor(W * 0.20), 0.25, 0.75, 6);
  vein(T.GOLD,   Math.floor(W * 0.12), 0.45, 0.90, 5);
  vein(T.GEM,    Math.floor(W * 0.06), 0.65, 0.96, 4);

  // --- surface trees (normal + snow biomes) ---
  var lastTree = -5;
  for (var x = 3; x < W - 3; x++) {
    var biome2 = biomeAt(x);
    if (biome2 === 'desert') continue;
    if (x - lastTree < 4) continue;
    if (rng() > 0.22) continue;
    var s4 = surface[x];
    if (tiles[s4][x] !== T.GRASS && tiles[s4][x] !== T.SNOW) continue;
    var trunkH = 4 + Math.floor(rng() * 4);
    var topY = s4 - trunkH;
    if (topY < 4) continue;
    // trunk
    for (var ty = s4 - 1; ty >= topY; ty--) tiles[ty][x] = T.WOOD;
    // canopy (leaf blob)
    var r = 2 + Math.floor(rng() * 2);
    for (var ly = topY - r; ly <= topY + 1; ly++) {
      for (var lx = x - r; lx <= x + r; lx++) {
        if (lx < 0 || lx >= W || ly < 0) continue;
        var dd = (lx - x) * (lx - x) + (ly - topY) * (ly - topY) * 1.4;
        if (dd <= (r + 0.6) * (r + 0.6) && tiles[ly][lx] === T.AIR) {
          tiles[ly][lx] = T.LEAVES;
        }
      }
    }
    lastTree = x;
  }

  // --- spawn: centre column, on the surface, with a cleared pocket ---
  var spawnTx = Math.floor(W / 2);
  var spawnTy = surface[spawnTx];
  for (var cy2 = spawnTy - 4; cy2 < spawnTy; cy2++) {
    for (var cx2 = spawnTx - 2; cx2 <= spawnTx + 2; cx2++) {
      if (cy2 >= 0 && cx2 >= 0 && cx2 < W) tiles[cy2][cx2] = T.AIR;
    }
  }
  // guarantee solid footing under spawn
  if (!CFG.isSolid(tiles[spawnTy][spawnTx])) tiles[spawnTy][spawnTx] = T.GRASS;

  return {
    tiles: tiles,
    surface: surface,
    spawn: { x: (spawnTx + 0.5) * CFG.TILE, y: (spawnTy - 2) * CFG.TILE },
  };
}

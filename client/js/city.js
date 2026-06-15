// City map generator — returns {map: number[][], canvas: HTMLCanvasElement}
function generateCity() {
  var T = CFG.T;
  var W = CFG.WORLD_W, H = CFG.WORLD_H;
  var TILE = CFG.TILE;

  // Road grid: roads at these column/row indices (2 tiles wide each)
  var ROAD_COLS = new Set([8,9, 24,25, 40,41, 56,57]);
  var ROAD_ROWS = new Set([8,9, 24,25, 40,41, 56,57]);
  var SW_COLS   = new Set([7,10, 23,26, 39,42, 55,58]);
  var SW_ROWS   = new Set([7,10, 23,26, 39,42, 55,58]);

  // Start with all building tiles
  var map = [];
  for (var y = 0; y < H; y++) {
    map[y] = new Array(W).fill(T.BUILDING);
  }

  // Roads and sidewalks
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (ROAD_COLS.has(x) || ROAD_ROWS.has(y)) {
        map[y][x] = T.ROAD;
      } else if (SW_COLS.has(x) || SW_ROWS.has(y)) {
        map[y][x] = T.SIDEWALK;
      }
    }
  }

  // Define block bounds (between roads/sidewalks)
  // 5 block regions per axis: [0-6], [11-22], [27-38], [43-54], [59-69]
  var RANGES = [[0,6],[11,22],[27,38],[43,54],[59,69]];

  // Zone types for each [col][row] block
  var ZONES = [
    ['PARK',    'RESIDENTIAL','CONSTRUCTION','RESIDENTIAL','PARK'    ],
    ['TECH',    'SHOPPING',   'ARTS',        'PARK',       'MEDICAL' ],
    ['PARK',    'TOWN_SQ',    'BUSINESS',    'SHOPPING',   'PARK'    ],
    ['MEDICAL', 'FOOD',       'RESIDENTIAL', 'TECH',       'TRADES'  ],
    ['PARK',    'RESIDENTIAL','TRADES',      'FOOD',       'PARK'    ],
  ];

  for (var bc = 0; bc < 5; bc++) {
    for (var br = 0; br < 5; br++) {
      fillBlock(map, RANGES[bc], RANGES[br], ZONES[bc][br], T);
    }
  }

  // Draw onto canvas
  var canvas = document.createElement('canvas');
  canvas.width  = W * TILE;
  canvas.height = H * TILE;
  var ctx = canvas.getContext('2d');

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      drawTile(ctx, x, y, map[y][x], TILE);
    }
  }

  return { map: map, canvas: canvas };
}

function fillBlock(map, xRange, yRange, zone, T) {
  var x0 = xRange[0], x1 = xRange[1];
  var y0 = yRange[0], y1 = yRange[1];

  if (zone === 'PARK') {
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var isEdge = (x===x0||x===x1||y===y0||y===y1);
        map[y][x] = isEdge ? T.TREE : T.GRASS;
      }
    }
    // central path cross
    var mx = Math.floor((x0+x1)/2), my = Math.floor((y0+y1)/2);
    for (var x = x0; x <= x1; x++) map[my][x] = T.PARK_PATH;
    for (var y = y0; y <= y1; y++) map[y][mx] = T.PARK_PATH;
    return;
  }

  if (zone === 'TOWN_SQ') {
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        map[y][x] = T.PARK_PATH;
      }
    }
    // fountain / feature in center
    var mx = Math.floor((x0+x1)/2), my = Math.floor((y0+y1)/2);
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (my+dy >= y0 && my+dy <= y1 && mx+dx >= x0 && mx+dx <= x1)
          map[my+dy][mx+dx] = T.BUILDING;
      }
    }
    return;
  }

  // Zone → job tile type mapping
  var JOB_MAP = {
    TECH: T.JOB_TECH, MEDICAL: T.JOB_MEDICAL, FOOD: T.JOB_FOOD,
    TRADES: T.JOB_TRADES, BUSINESS: T.JOB_BUSINESS, ARTS: T.JOB_ARTS,
    SHOPPING: T.SHOP, RESIDENTIAL: T.HOUSE, CONSTRUCTION: T.JOB_TRADES,
  };
  var tileType = JOB_MAP[zone] || T.BUILDING;
  var w = x1 - x0 + 1, h = y1 - y0 + 1;

  // Fill with sidewalk first (walkable interior paths)
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      map[y][x] = T.SIDEWALK;
    }
  }

  // Place 2 or 3 building rectangles inside
  var bldgs = makeBuildingRects(x0, y0, w, h);
  for (var i = 0; i < bldgs.length; i++) {
    var b = bldgs[i];
    for (var y = b.y; y < b.y+b.h; y++) {
      for (var x = b.x; x < b.x+b.w; x++) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1)
          map[y][x] = tileType;
      }
    }
  }

  // Scatter a couple of trees on sidewalk areas
  var rng = mulberry32(x0*31 + y0*17);
  for (var i = 0; i < 3; i++) {
    var tx = x0 + Math.floor(rng() * w);
    var ty = y0 + Math.floor(rng() * h);
    if (map[ty][tx] === T.SIDEWALK) map[ty][tx] = T.TREE;
  }
}

function makeBuildingRects(x0, y0, w, h) {
  // Deterministic layout: 2 buildings per block, with gap between them
  var rects = [];
  var bw = Math.floor(w * 0.45), bh = Math.floor(h * 0.45);
  var gap = 1;
  // top-left building
  rects.push({ x: x0+1,         y: y0+1,         w: bw, h: bh });
  // bottom-right building
  rects.push({ x: x0+w-bw-1,   y: y0+h-bh-1,   w: bw, h: bh });
  return rects;
}

// Simple deterministic PRNG (mulberry32)
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function drawTile(ctx, tx, ty, type, TILE) {
  var px = tx * TILE, py = ty * TILE;
  var colors = CFG.TILE_COLORS;
  var color = colors[type] || '#000';

  ctx.fillStyle = color;
  ctx.fillRect(px, py, TILE, TILE);

  // Tile-specific details
  if (type === CFG.T.ROAD) {
    // road markings
    ctx.fillStyle = '#555566';
    ctx.fillRect(px, py, TILE, TILE);
    // lane dashes (only on horizontal roads — simplified: just a subtle line)
    ctx.fillStyle = '#4a4a5a';
    ctx.fillRect(px+1, py+1, TILE-2, TILE-2);

  } else if (type === CFG.T.SIDEWALK) {
    ctx.fillStyle = '#6e6e7e';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#5a5a6a';
    ctx.fillRect(px+1, py+1, TILE-2, TILE-2);

  } else if (type === CFG.T.TREE) {
    // grass bg
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(px, py, TILE, TILE);
    // trunk
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(px+14, py+18, 4, 10);
    // canopy
    ctx.fillStyle = '#1a5e1a';
    ctx.beginPath();
    ctx.arc(px+TILE/2, py+12, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#228b22';
    ctx.beginPath();
    ctx.arc(px+TILE/2, py+10, 8, 0, Math.PI*2);
    ctx.fill();

  } else if (type >= 3) {
    // building-like tile: add windows
    ctx.fillStyle = color;
    ctx.fillRect(px, py, TILE, TILE);
    // darker border
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(px, py, TILE, 2);
    ctx.fillRect(px, py, 2, TILE);
    // windows
    ctx.fillStyle = 'rgba(255,255,180,0.5)';
    var winSize = 4;
    var wins = [[4,4],[4,16],[18,4],[18,16]];
    for (var i = 0; i < wins.length; i++) {
      ctx.fillRect(px+wins[i][0], py+wins[i][1], winSize, winSize);
    }

  } else if (type === CFG.T.GRASS) {
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(px, py, TILE, TILE);
    // texture dots
    ctx.fillStyle = '#275222';
    ctx.fillRect(px+5, py+8, 2, 2);
    ctx.fillRect(px+20, py+4, 2, 2);
    ctx.fillRect(px+12, py+20, 2, 2);

  } else if (type === CFG.T.PARK_PATH) {
    ctx.fillStyle = '#4a7a44';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#3d6e37';
    ctx.fillRect(px+1, py+1, TILE-2, TILE-2);
  }

  // Grid line (subtle)
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.strokeRect(px, py, TILE, TILE);
}

// ============================================================================
//  TerraCity — Terraria-style side-scroller config (shared contract)
//  Everything global lives on window.CFG.
// ============================================================================
var CFG = {
  // --- World / tile geometry ---
  TILE: 16,          // pixel size of one tile
  WORLD_W: 300,      // world width  in tiles  (300 * 16 = 4800 px)
  WORLD_H: 170,      // world height in tiles  (170 * 16 = 2720 px)

  // --- Physics (arcade, px / s) ---
  GRAVITY: 1100,
  MOVE_SPEED: 150,
  RUN_MULTIPLIER: 1.7,
  JUMP_VELOCITY: 400,     // gives ~3.5 tile jump
  MAX_FALL: 900,
  COYOTE_MS: 90,          // grace window to still jump after leaving ground
  JUMP_BUFFER_MS: 120,    // press-jump-early buffer

  // --- Interaction ---
  REACH: 5,               // mine/place radius in tiles
  PLAYER_W: 12,           // collision body size (px)
  PLAYER_H: 22,

  // --- Day / night ---
  DAY_LENGTH_MS: 300000,  // 5 min full cycle (day + night)
  DAY_FRACTION: 0.62,     // portion of the cycle that is daytime

  // ==========================================================================
  //  TILE TYPES — value doubles as the tileset frame index (0 = AIR, unused)
  // ==========================================================================
  T: {
    AIR:    0,
    DIRT:   1,
    GRASS:  2,
    STONE:  3,
    WOOD:   4,
    LEAVES: 5,
    SAND:   6,
    COPPER: 7,
    IRON:   8,
    GOLD:   9,
    GEM:    10,
    TORCH:  11,
    PLANK:  12,
    BEDROCK:13,
    CLAY:   14,
    SNOW:   15,
  },
  TILE_COUNT: 16,        // number of tileset frames (includes frame 0)

  // Per-tile base color (used for tileset gen, particles, drops, minimap).
  TILE_COLORS: {
    1:  '#7a4a28',  // dirt
    2:  '#5fa342',  // grass top  (body is dirt brown)
    3:  '#6f6f7e',  // stone
    4:  '#7c5128',  // wood
    5:  '#3f8f37',  // leaves
    6:  '#d9c38a',  // sand
    7:  '#b06f3a',  // copper ore
    8:  '#c9b89a',  // iron ore
    9:  '#e8c437',  // gold ore
    10: '#46d3e0',  // gem (diamond)
    11: '#ffb347',  // torch
    12: '#a9743f',  // plank
    13: '#2a2a33',  // bedrock
    14: '#9a5b4a',  // clay
    15: '#e9f2f7',  // snow
  },

  // Mining hardness — seconds-ish multiplier (Infinity = unbreakable).
  HARDNESS: {
    1: 0.35, 2: 0.35, 3: 0.85, 4: 0.55, 5: 0.20, 6: 0.40,
    7: 1.10, 8: 1.30, 9: 1.50, 10: 1.80, 11: 0.10, 12: 0.55,
    13: Infinity, 14: 0.55, 15: 0.30,
  },

  // What a broken tile drops into the inventory (defaults to itself).
  DROPS: {
    2: 1,   // grass -> dirt
  },

  // Light emitters: tileType -> light radius (in tiles).
  EMITTERS: {
    11: 7,    // torch
    10: 2.5,  // gem glows faintly
  },

  // Tiles you can walk through (non-solid).
  NON_SOLID: [0, 11],

  // Hotbar contents the player starts with: [tileType, count].
  START_INVENTORY: [
    [11, 30],  // torches
    [1, 40],   // dirt
    [4, 20],   // wood
  ],

  // Placeable block types (appear/stack in hotbar; ores are loot only).
  PLACEABLE: [1, 3, 4, 5, 6, 11, 12, 15],

  // --- Character skins: name + clothing accent color (procedural player) ---
  CHARS: [
    { name: 'Adventurer', accent: '#3b7dd8', hair: '#5a3a22' },
    { name: 'Ranger',     accent: '#2e8b57', hair: '#2a1c12' },
    { name: 'Miner',      accent: '#c0392b', hair: '#1a1a1a' },
    { name: 'Mage',       accent: '#8e44ad', hair: '#d9d2c5' },
    { name: 'Knight',     accent: '#7f8c9b', hair: '#caa84a' },
    { name: 'Druid',      accent: '#16a085', hair: '#6b8e23' },
    { name: 'Rogue',      accent: '#566573', hair: '#3a2a1a' },
    { name: 'Pioneer',    accent: '#d68910', hair: '#4a2f1a' },
  ],

  // Helpers ------------------------------------------------------------------
  isSolid: function(t) { return t !== 0 && t !== 11; },
  worldPxW: function() { return this.WORLD_W * this.TILE; },
  worldPxH: function() { return this.WORLD_H * this.TILE; },
};

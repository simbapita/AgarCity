var CFG = {
  TILE: 32,
  WORLD_W: 70,
  WORLD_H: 70,
  SPEED: 160,

  DRAIN: {
    FOOD_WALK: 0.12,
    FOOD_IDLE: 0.03,
    HEALTH_EMPTY: 0.07,
  },

  CHARS: [
    { name: 'Knight',     body: '#a6b2c1', outline: '#7f8c8d' },
    { name: 'Barbarian',  body: '#d35400', outline: '#a04000' },
    { name: 'Dwarf',      body: '#8e44ad', outline: '#6c3483' },
    { name: 'Paladin',    body: '#f1c40f', outline: '#f39c12' },
    { name: 'Commander',  body: '#2c3e50', outline: '#1a252f' },
    { name: 'Wizard',     body: '#2980b9', outline: '#1f618d' },
    { name: 'Ranger',     body: '#27ae60', outline: '#1e8449' },
    { name: 'Assassin',   body: '#34495e', outline: '#2c3e50' },
    { name: 'Cleric',     body: '#c0392b', outline: '#922b21' },
    { name: 'Priestess',  body: '#ecf0f1', outline: '#bdc3c7' },
    { name: 'Soldier',    body: '#7f8c8d', outline: '#5d6d7e' },
    { name: 'Blacksmith', body: '#e67e22', outline: '#d35400' },
    { name: 'Farmer',     body: '#f39c12', outline: '#b7950b' },
    { name: 'Merchant',   body: '#16a085', outline: '#117a65' },
    { name: 'Maid',       body: '#1abc9c', outline: '#16a085' },
  ],

  // Calibrated sprite sheet coordinate metadata
  SHEET: {
    offsetX: 50,
    offsetY: 35,
    cellW: 100,
    cellH: 145,
    spacingX: 95,
    spacingY: 28,
    chromaColor: '#b0b5b8',
    chromaTol: 50
  },

  SPECS: [
    { id: 'TECH',         name: 'Technology',   icon: '💻', color: '#3498db' },
    { id: 'MEDICAL',      name: 'Medical',       icon: '🏥', color: '#e74c3c' },
    { id: 'FOOD_SERVICE', name: 'Food Service',  icon: '🍕', color: '#f39c12' },
    { id: 'TRADES',       name: 'Trades',        icon: '🔨', color: '#95a5a6' },
    { id: 'BUSINESS',     name: 'Business',      icon: '💼', color: '#2ecc71' },
    { id: 'ARTS',         name: 'Arts',          icon: '🎨', color: '#9b59b6' },
  ],

  // Tile IDs
  T: {
    ROAD: 0, SIDEWALK: 1, GRASS: 2, BUILDING: 3,
    TREE: 4, PARK_PATH: 5,
    JOB_TECH: 6, JOB_MEDICAL: 7, JOB_FOOD: 8,
    JOB_TRADES: 9, JOB_BUSINESS: 10, JOB_ARTS: 11,
    HOUSE: 12, SHOP: 13,
  },

  WALKABLE: new Set([0, 1, 2, 5]),

  // Colors for drawing tiles
  TILE_COLORS: {
    0:  '#3a3a4a',  // road
    1:  '#6e6e7e',  // sidewalk
    2:  '#2d5a27',  // grass
    3:  '#1a1a2e',  // building (dark)
    4:  '#1a3d1a',  // tree (darker green)
    5:  '#4a7a44',  // park path
    6:  '#1a237e',  // tech building
    7:  '#b71c1c',  // medical building
    8:  '#e65100',  // food building
    9:  '#4e342e',  // trades building
    10: '#1b5e20',  // business building
    11: '#4a148c',  // arts building
    12: '#5d4037',  // house
    13: '#00695c',  // shop
  },

  JOB_ZONES: [
    { id:'business1', spec:'BUSINESS',     label:'Bank Office',       x:1040, y:1040, radius:90, duration:60, reward:12, xp:5 },
    { id:'arts1',     spec:'ARTS',         label:'Art Gallery',       x:528,  y:1040, radius:90, duration:50, reward:8,  xp:4 },
    { id:'tech1',     spec:'TECH',         label:'Tech Office',       x:528,  y:528,  radius:90, duration:60, reward:15, xp:5 },
    { id:'food1',     spec:'FOOD_SERVICE', label:'Restaurant Row',    x:1552, y:528,  radius:90, duration:45, reward:10, xp:4 },
    { id:'medical1',  spec:'MEDICAL',      label:'City Hospital',     x:1552, y:96,   radius:90, duration:60, reward:12, xp:5 },
    { id:'trades1',   spec:'TRADES',       label:'Construction Site', x:96,   y:1040, radius:90, duration:45, reward:10, xp:4 },
    { id:'shop1',     spec:'ANY',          label:'General Store',     x:1040, y:528,  radius:90, duration:45, reward:8,  xp:3 },
  ],

  FOOD_STORES: [
    { id:'store1', name:'Corner Store', x:900,  y:800,  radius:70, cost:5, restore:30 },
    { id:'store2', name:'Food Cart',    x:660,  y:1040, radius:70, cost:3, restore:20 },
    { id:'store3', name:'Diner',        x:1380, y:800,  radius:70, cost:8, restore:50 },
    { id:'store4', name:'Mini Mart',    x:1040, y:1280, radius:70, cost:5, restore:30 },
  ],
};

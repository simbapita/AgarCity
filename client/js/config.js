var CFG = {
  TILE: 32,
  WORLD_W: 70,
  WORLD_H: 70,
  SPEED: 160,
  RUN_MULTIPLIER: 1.6,

  DRAIN: {
    FOOD_RUN:     0.22,
    FOOD_WALK:    0.12,
    FOOD_IDLE:    0.03,
    HEALTH_EMPTY: 0.07,
  },

  // Filename order must match CHARS index (0-14)
  CHAR_FILES: [
    'knight', 'barbarian', 'dwarf', 'paladin', 'commander',
    'wizard', 'ranger', 'assassin', 'cleric', 'priestess',
    'soldier', 'blacksmith', 'farmer', 'merchant', 'maid'
  ],

  CHARS: [
    { name: 'Knight'     },
    { name: 'Barbarian'  },
    { name: 'Dwarf'      },
    { name: 'Paladin'    },
    { name: 'Commander'  },
    { name: 'Wizard'     },
    { name: 'Ranger'     },
    { name: 'Assassin'   },
    { name: 'Cleric'     },
    { name: 'Priestess'  },
    { name: 'Soldier'    },
    { name: 'Blacksmith' },
    { name: 'Farmer'     },
    { name: 'Merchant'   },
    { name: 'Maid'       },
  ],

  SPECS: [
    { id: 'TECH',         name: 'Technology',   icon: '💻', color: '#3498db' },
    { id: 'MEDICAL',      name: 'Medical',       icon: '🏥', color: '#e74c3c' },
    { id: 'FOOD_SERVICE', name: 'Food Service',  icon: '🍕', color: '#f39c12' },
    { id: 'TRADES',       name: 'Trades',        icon: '🔨', color: '#95a5a6' },
    { id: 'BUSINESS',     name: 'Business',      icon: '💼', color: '#2ecc71' },
    { id: 'ARTS',         name: 'Arts',          icon: '🎨', color: '#9b59b6' },
  ],

  T: {
    ROAD: 0, SIDEWALK: 1, GRASS: 2, BUILDING: 3,
    TREE: 4, PARK_PATH: 5,
    JOB_TECH: 6, JOB_MEDICAL: 7, JOB_FOOD: 8,
    JOB_TRADES: 9, JOB_BUSINESS: 10, JOB_ARTS: 11,
    HOUSE: 12, SHOP: 13,
  },

  WALKABLE: new Set([0, 1, 2, 5]),

  TILE_COLORS: {
    0:  '#3a3a4a',
    1:  '#6e6e7e',
    2:  '#2d5a27',
    3:  '#1a1a2e',
    4:  '#1a3d1a',
    5:  '#4a7a44',
    6:  '#1a237e',
    7:  '#b71c1c',
    8:  '#e65100',
    9:  '#4e342e',
    10: '#1b5e20',
    11: '#4a148c',
    12: '#5d4037',
    13: '#00695c',
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

// ============================================================================
//  PreloadScene — builds every texture procedurally (no external art needed):
//  the block tileset, the side-view player sheets, and the slime enemy.
// ============================================================================
var PreloadScene = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function () { Phaser.Scene.call(this, { key: 'PreloadScene' }); },

  preload: function () {
    // Everything is generated procedurally in create(); nothing to load.
    var cx = this.scale.width / 2, cy = this.scale.height / 2;
    this.add.rectangle(cx, cy, 320, 8, 0x111111).setStrokeStyle(1, 0x5a3a1a);
    this.add.rectangle(cx - 158, cy, 316, 6, 0xffb347).setOrigin(0, 0.5);
    this.add.text(cx, cy - 26, 'TERRACITY', {
      fontFamily: "'Press Start 2P'", fontSize: '20px', color: '#ffd27f',
    }).setOrigin(0.5);
    this.add.text(cx, cy + 24, 'generating world...', {
      fontFamily: "'Press Start 2P'", fontSize: '8px', color: '#c9a86a',
    }).setOrigin(0.5);
  },

  create: function () {
    this._buildTileset();
    this._buildPlayers();
    this._buildSlime();
    this._buildDrop();
    this.scene.start('GameScene');
  },

  // --- block tileset: one TILE-wide frame per tile type, frame 0 = AIR -------
  _buildTileset: function () {
    var TILE = CFG.TILE, N = CFG.TILE_COUNT, T = CFG.T;
    var cv = document.createElement('canvas');
    cv.width = TILE * N; cv.height = TILE;
    var c = cv.getContext('2d');

    for (var t = 1; t < N; t++) {
      var ox = t * TILE;
      var base = CFG.TILE_COLORS[t] || '#888';
      this._drawTile(c, ox, TILE, t, base, T);
    }
    this.textures.addCanvas('blocks', cv);
  },

  _drawTile: function (c, ox, S, t, base, T) {
    function rnd(seed) { var x = Math.sin(seed * 97.13) * 43758.5; return x - Math.floor(x); }
    function speck(color, n, salt) {
      c.fillStyle = color;
      for (var i = 0; i < n; i++) {
        var px = ox + Math.floor(rnd(i + salt) * S);
        var py = Math.floor(rnd(i * 1.7 + salt) * S);
        c.fillRect(px, py, 1, 1);
      }
    }
    c.fillStyle = base; c.fillRect(ox, 0, S, S);

    if (t === T.GRASS) {
      c.fillStyle = '#7a4a28'; c.fillRect(ox, 5, S, S - 5);
      c.fillStyle = '#5fa342'; c.fillRect(ox, 0, S, 5);
      c.fillStyle = '#74c156';
      c.fillRect(ox + 2, 0, 1, 2); c.fillRect(ox + 7, 0, 1, 3); c.fillRect(ox + 12, 0, 1, 2);
      speck('#6a3f22', 10, 5);
    } else if (t === T.DIRT) {
      speck('#6a3f22', 14, 1); speck('#8a5a34', 8, 9);
    } else if (t === T.STONE) {
      speck('#5a5a68', 12, 3); speck('#84848f', 6, 7);
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.beginPath();
      c.moveTo(ox + 3, 3); c.lineTo(ox + 8, 7); c.lineTo(ox + 6, 12); c.stroke();
    } else if (t === T.WOOD) {
      c.fillStyle = '#653f1d'; c.fillRect(ox + 3, 0, 1, S); c.fillRect(ox + 9, 0, 1, S); c.fillRect(ox + 13, 0, 1, S);
      c.fillStyle = '#8a5a2c'; c.fillRect(ox + 6, 0, 1, S);
    } else if (t === T.LEAVES) {
      speck('#2f7a2a', 16, 2); speck('#56b048', 12, 8);
    } else if (t === T.SAND) {
      speck('#c9b074', 14, 4); speck('#efe0b0', 8, 6);
    } else if (t === T.COPPER || t === T.IRON || t === T.GOLD || t === T.GEM) {
      c.fillStyle = '#6f6f7e'; c.fillRect(ox, 0, S, S);
      speck('#5a5a68', 8, 3);
      var oreCol = CFG.TILE_COLORS[t];
      c.fillStyle = oreCol;
      var spots = [[4, 4], [9, 6], [6, 11], [11, 10], [3, 9]];
      for (var i = 0; i < spots.length; i++) c.fillRect(ox + spots[i][0], spots[i][1], 2, 2);
    } else if (t === T.TORCH) {
      c.clearRect(ox, 0, S, S);
      c.fillStyle = '#5a3a1a'; c.fillRect(ox + 7, 6, 2, 9);   // stick
      c.fillStyle = '#ff8c1a'; c.fillRect(ox + 6, 2, 4, 5);    // flame outer
      c.fillStyle = '#ffe169'; c.fillRect(ox + 7, 1, 2, 4);    // flame core
    } else if (t === T.PLANK) {
      c.fillStyle = '#8a5e30'; c.fillRect(ox, 4, S, 1); c.fillRect(ox, 10, S, 1);
      c.fillStyle = '#7a4f28'; c.fillRect(ox + 8, 0, 1, 4); c.fillRect(ox + 4, 5, 1, 5);
    } else if (t === T.BEDROCK) {
      speck('#15151c', 14, 5); speck('#41414f', 6, 2);
    } else if (t === T.CLAY) {
      speck('#874d3e', 8, 4);
    } else if (t === T.SNOW) {
      speck('#cfe0ec', 10, 3); speck('#ffffff', 6, 9);
    }
    // subtle bevel for depth
    c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(ox, 0, S, 1);
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(ox, S - 1, S, 1);
  },

  // --- procedural side-view player, one spritesheet per character skin ------
  // Frames: 0 idle, 1-4 walk, 5 jump.
  _buildPlayers: function () {
    var FW = 24, FH = 32, FRAMES = 6;
    for (var ci = 0; ci < CFG.CHARS.length; ci++) {
      var ch = CFG.CHARS[ci];
      var cv = document.createElement('canvas');
      cv.width = FW * FRAMES; cv.height = FH;
      var c = cv.getContext('2d');
      for (var f = 0; f < FRAMES; f++) this._drawPlayerFrame(c, f * FW, FW, FH, f, ch);
      this.textures.addSpriteSheet('player_' + ci, cv, { frameWidth: FW, frameHeight: FH });
    }
    // Animations are global to the anim manager; create once using player_0 dims.
    for (var i = 0; i < CFG.CHARS.length; i++) {
      var k = 'player_' + i;
      this.anims.create({ key: k + '_idle', frames: [{ key: k, frame: 0 }], frameRate: 1, repeat: -1 });
      this.anims.create({ key: k + '_walk', frames: this.anims.generateFrameNumbers(k, { start: 1, end: 4 }), frameRate: 10, repeat: -1 });
      this.anims.create({ key: k + '_jump', frames: [{ key: k, frame: 5 }], frameRate: 1, repeat: -1 });
    }
  },

  _drawPlayerFrame: function (c, ox, FW, FH, f, ch) {
    var skin = '#e8b88f', skinShade = '#caa074', pants = '#3a3550';
    var cx = ox + FW / 2;
    var bob = (f >= 1 && f <= 4) ? (f % 2 === 0 ? 1 : 0) : 0;   // walk bob
    var top = 4 + bob;

    // legs
    c.fillStyle = pants;
    if (f === 5) {                       // jump: legs tucked
      c.fillRect(cx - 5, top + 18, 4, 7); c.fillRect(cx + 1, top + 16, 4, 7);
    } else if (f >= 1 && f <= 4) {       // walk: swing
      var sw = (f === 1) ? 4 : (f === 2) ? 1 : (f === 3) ? -4 : 1;
      c.fillRect(cx - 5, top + 18, 4, 7 + sw); c.fillRect(cx + 1, top + 18, 4, 7 - sw);
    } else {                             // idle
      c.fillRect(cx - 5, top + 18, 4, 8); c.fillRect(cx + 1, top + 18, 4, 8);
    }
    // boots
    c.fillStyle = '#2a2030';
    c.fillRect(cx - 6, top + 24, 5, 2); c.fillRect(cx + 1, top + 24, 5, 2);

    // torso (shirt)
    c.fillStyle = ch.accent;
    c.fillRect(cx - 5, top + 9, 10, 10);
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(cx - 5, top + 9, 10, 2);

    // front arm
    c.fillStyle = ch.accent;
    var armY = (f >= 1 && f <= 4 && f % 2 === 0) ? top + 11 : top + 10;
    c.fillRect(cx + 3, armY, 3, 8);
    c.fillStyle = skin; c.fillRect(cx + 3, armY + 8, 3, 2);

    // head
    c.fillStyle = skin; c.fillRect(cx - 4, top, 8, 9);
    c.fillStyle = skinShade; c.fillRect(cx - 4, top + 7, 8, 2);
    // hair
    c.fillStyle = ch.hair; c.fillRect(cx - 5, top - 1, 10, 3); c.fillRect(cx - 5, top, 2, 5);
    // eye (faces right)
    c.fillStyle = '#222'; c.fillRect(cx + 1, top + 3, 2, 2);
  },

  _buildSlime: function () {
    var cv = document.createElement('canvas'); cv.width = 24; cv.height = 18;
    var c = cv.getContext('2d');
    c.fillStyle = 'rgba(70,200,120,0.85)';
    c.beginPath(); c.moveTo(2, 17); c.quadraticCurveTo(2, 3, 12, 3);
    c.quadraticCurveTo(22, 3, 22, 17); c.closePath(); c.fill();
    c.fillStyle = 'rgba(120,240,160,0.6)'; c.fillRect(5, 7, 4, 3);
    c.fillStyle = '#0a3a1a'; c.fillRect(8, 9, 3, 3); c.fillRect(14, 9, 3, 3);  // eyes
    this.textures.addCanvas('slime', cv);
  },

  _buildDrop: function () {
    // tiny generic sparkle used for floating item pickups (tinted per type)
    var cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
    var c = cv.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(1, 1, 6, 6);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(1, 1, 6, 1); c.fillRect(1, 6, 6, 1);
    this.textures.addCanvas('drop', cv);
  },
});

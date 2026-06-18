var PreloadScene = new Phaser.Class({
  Extends: Phaser.Scene,

  initialize: function() {
    Phaser.Scene.call(this, { key: 'PreloadScene' });
  },

  preload: function() {
    var self = this;
    var bar  = self.add.rectangle(400, 300, 400, 12, 0xffd700);
    var fill = self.add.rectangle(200, 300, 0, 10, 0xffffff);
    self.load.on('progress', function(v) { fill.width = 400 * v; fill.x = 200 + fill.width / 2; });

    // Track which strips fail to load so we can substitute a placeholder.
    self._failed = {};
    self.load.on('loaderror', function(file) {
      if (file && file.key && file.key.indexOf('charraw_') === 0) {
        self._failed[file.key] = true;
      }
    });

    // Load each character strip as a plain image; chroma-key happens in create()
    CFG.CHAR_FILES.forEach(function(name, i) {
      self.load.image('charraw_' + i, 'assets/chars/' + name + '.png');
    });
  },

  create: function() {
    var self = this;

    var result = generateCity();
    self.textures.addCanvas('city', result.canvas);
    self.registry.set('cityMap', result.map);

    // --- Character spritesheets ---
    // Two supported layouts (auto-detected from image dimensions):
    //
    //   8-col x 3-row grid (h > w/4):  e.g. 2816x1536 -> 352x512 per frame (24 frames)
    //     row 0 (frames  0- 7): idle / walk
    //     row 1 (frames  8-15): run / active
    //     row 2 (frames 16-23): work / attack
    //
    //   14-frame horizontal strip (h <= w/4): legacy fallback
    //     [0-1] idle, [2-5] walk, [6-9] run, [10-13] work
    //
    // Background: solid magenta #FF00FF (chroma-keyed out below)

    CFG.CHAR_FILES.forEach(function(name, i) {
      var raw = self._failed['charraw_' + i] ? null : self.textures.get('charraw_' + i).getSourceImage();
      var w   = raw ? (raw.naturalWidth  || raw.width)  : 0;
      var h   = raw ? (raw.naturalHeight || raw.height) : 0;

      // Detect layout from aspect ratio: tall image = 8x3 grid, wide = 14-frame strip.
      var COLS = (w > 0 && h > w / 4) ? 8 : 14;
      var ROWS = (COLS === 8) ? 3 : 1;

      var canvas, frameW, frameH;

      if (raw && w > 0 && h > 0) {
        canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(raw, 0, 0);

        // Chroma-key magenta (#FF00FF): R high, G low, B high
        var imgData = ctx.getImageData(0, 0, w, h);
        var px = imgData.data;
        for (var j = 0; j < px.length; j += 4) {
          if (px[j] > 180 && px[j+1] < 80 && px[j+2] > 180) px[j+3] = 0;
        }
        ctx.putImageData(imgData, 0, 0);

        frameW = Math.floor(w / COLS);
        frameH = Math.floor(h / ROWS);
      } else {
        // Fallback placeholder so the game still runs without art.
        var ph = self._makePlaceholderStrip(i, COLS, ROWS);
        canvas = ph.canvas;
        frameW = ph.frameW;
        frameH = ph.frameH;
      }

      // Register as Phaser spritesheet
      self.textures.addSpriteSheet('char_' + i, canvas, { frameWidth: frameW, frameHeight: frameH });

      // Register all four animations; frame ranges depend on detected layout
      var k = 'char_' + i;
      if (COLS === 8) {
        self.anims.create({ key: k + '_idle', frames: self.anims.generateFrameNumbers(k, { start: 0,  end: 1  }), frameRate: 3,  repeat: -1 });
        self.anims.create({ key: k + '_walk', frames: self.anims.generateFrameNumbers(k, { start: 0,  end: 7  }), frameRate: 8,  repeat: -1 });
        self.anims.create({ key: k + '_run',  frames: self.anims.generateFrameNumbers(k, { start: 8,  end: 15 }), frameRate: 12, repeat: -1 });
        self.anims.create({ key: k + '_work', frames: self.anims.generateFrameNumbers(k, { start: 16, end: 23 }), frameRate: 6,  repeat: -1 });
      } else {
        self.anims.create({ key: k + '_idle', frames: self.anims.generateFrameNumbers(k, { start: 0,  end: 1  }), frameRate: 3,  repeat: -1 });
        self.anims.create({ key: k + '_walk', frames: self.anims.generateFrameNumbers(k, { start: 2,  end: 5  }), frameRate: 8,  repeat: -1 });
        self.anims.create({ key: k + '_run',  frames: self.anims.generateFrameNumbers(k, { start: 6,  end: 9  }), frameRate: 12, repeat: -1 });
        self.anims.create({ key: k + '_work', frames: self.anims.generateFrameNumbers(k, { start: 10, end: 13 }), frameRate: 6,  repeat: -1 });
      }

      // Avatar headshot from frame 0 (idle pose) for character select / lobby
      var avCanvas = document.createElement('canvas');
      avCanvas.width  = 60;
      avCanvas.height = 60;
      var avCtx = avCanvas.getContext('2d');
      var sx = Math.floor(frameW * 0.16), sy = Math.floor(frameH * 0.02);
      var sw = Math.floor(frameW * 0.68), sh = Math.floor(frameH * 0.46);
      avCtx.imageSmoothingEnabled = false;
      avCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, 60, 60);
      self.textures.addCanvas('avatar_' + i, avCanvas);
    });

    // NPC pedestrian texture
    var ng = self.make.graphics({ x: 0, y: 0, add: false });
    ng.fillStyle(0x888888, 1);
    ng.fillCircle(12, 12, 10);
    ng.lineStyle(2, 0x555555, 1);
    ng.strokeCircle(12, 12, 10);
    ng.generateTexture('npc', 24, 24);
    ng.destroy();

    // --- Citizen NPC spritesheets + animations ---
    // 4 muted civilian variants, drawn as simple pixel-art silhouettes that read
    // distinctly from the player characters. Each is a raw 256x48 canvas = 8 frames
    // of 32x48: [0-1] idle bob, [2-5] walk leg-swing, [6-7] wave (one arm raised).
    var citizenColors = ['#7f8c8d', '#95a5a6', '#bdc3c7', '#a0826d'];
    for (var ci2 = 0; ci2 < citizenColors.length; ci2++) {
      var citCanvas = document.createElement('canvas');
      citCanvas.width  = 256;
      citCanvas.height = 48;
      var cc = citCanvas.getContext('2d');
      var fill = citizenColors[ci2];

      for (var fr = 0; fr < 8; fr++) {
        var ox2 = fr * 32;
        var cx2 = ox2 + 16;           // horizontal center of this frame
        var bob = (fr < 2) ? (fr === 0 ? 0 : 2) : 0;  // idle breathing bob (frames 0-1)

        // Walk leg-swing offset (frames 2-5 alternate), idle/wave use a slight stance
        var swing;
        if (fr >= 2 && fr <= 5) {
          swing = (fr % 2 === 0) ? 4 : -4;
        } else {
          swing = 0;
        }

        cc.fillStyle   = fill;
        cc.strokeStyle = 'rgba(0,0,0,0.45)';
        cc.lineWidth   = 1;

        // Legs: two 4x14 rects, swung apart for the walk cycle
        cc.fillRect(cx2 - 6, 30 + bob, 4, 14 + swing);
        cc.strokeRect(cx2 - 6, 30 + bob, 4, 14 + swing);
        cc.fillRect(cx2 + 2, 30 + bob, 4, 14 - swing);
        cc.strokeRect(cx2 + 2, 30 + bob, 4, 14 - swing);

        // Torso: 10x16 rect below the head
        cc.fillRect(cx2 - 5, 14 + bob, 10, 16);
        cc.strokeRect(cx2 - 5, 14 + bob, 10, 16);

        // Arms: two 3x10 rects either side of the torso
        if (fr >= 6) {
          // Wave frames: left arm hangs, right arm raised ~45 degrees
          cc.fillRect(cx2 - 8, 16 + bob, 3, 10);
          cc.strokeRect(cx2 - 8, 16 + bob, 3, 10);
          cc.save();
          cc.translate(cx2 + 6, 16 + bob);
          cc.rotate(-Math.PI / 4);   // raise one arm to ~45 degrees
          cc.fillRect(0, -3, 3, 10);
          cc.strokeRect(0, -3, 3, 10);
          cc.restore();
        } else {
          cc.fillRect(cx2 - 8, 16 + bob, 3, 10);
          cc.strokeRect(cx2 - 8, 16 + bob, 3, 10);
          cc.fillRect(cx2 + 5, 16 + bob, 3, 10);
          cc.strokeRect(cx2 + 5, 16 + bob, 3, 10);
        }

        // Head: filled circle, radius ~6, top-center
        cc.beginPath();
        cc.arc(cx2, 8 + bob, 6, 0, Math.PI * 2);
        cc.fill();
        cc.stroke();
      }

      self.textures.addSpriteSheet('citizen_' + ci2, citCanvas, { frameWidth: 32, frameHeight: 48 });
      self.anims.create({ key: 'citizen_' + ci2 + '_idle', frames: self.anims.generateFrameNumbers('citizen_' + ci2, { start: 0, end: 1 }), frameRate: 3, repeat: -1 });
      self.anims.create({ key: 'citizen_' + ci2 + '_walk', frames: self.anims.generateFrameNumbers('citizen_' + ci2, { start: 2, end: 5 }), frameRate: 8, repeat: -1 });
      self.anims.create({ key: 'citizen_' + ci2 + '_wave', frames: self.anims.generateFrameNumbers('citizen_' + ci2, { start: 6, end: 7 }), frameRate: 4, repeat: 0 });
    }

    // --- Exhaust smoke particle (radial gradient needs raw canvas) ---
    var smokeCanvas = document.createElement('canvas');
    smokeCanvas.width = 6; smokeCanvas.height = 6;
    var sctx = smokeCanvas.getContext('2d');
    var grad = sctx.createRadialGradient(3, 3, 0, 3, 3, 3);
    grad.addColorStop(0, 'rgba(180,180,180,0.6)');
    grad.addColorStop(1, 'rgba(100,100,100,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 6, 6);
    self.textures.addCanvas('smoke_puff', smokeCanvas);

    // Car textures (48x26): rounded body + darker cabin, windshields, head/taillights
    var cg = self.make.graphics({ x: 0, y: 0, add: false });
    [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6].forEach(function(col, ci) {
      // Darker shade of the body color for the roof/cabin (each channel * ~0.6)
      var dr = Math.floor(((col >> 16) & 0xff) * 0.6);
      var dg = Math.floor(((col >> 8)  & 0xff) * 0.6);
      var db = Math.floor((col & 0xff) * 0.6);
      var darker = (dr << 16) | (dg << 8) | db;

      // 1. Body
      cg.fillStyle(col, 1);
      cg.fillRoundedRect(0, 4, 48, 18, 4);
      // 2. Roof / cabin (darker shade)
      cg.fillStyle(darker, 1);
      cg.fillRoundedRect(10, 2, 22, 10, 3);
      // 3. Windshields
      cg.fillStyle(0x34495e, 1);
      cg.fillRect(12, 4, 8, 8);
      cg.fillRect(28, 4, 8, 8);
      // 4. Headlights (front = right)
      cg.fillStyle(0xffd700, 1);
      cg.fillRect(44, 8, 3, 3);
      cg.fillRect(44, 15, 3, 3);
      // 5. Taillights (rear = left)
      cg.fillStyle(0xe74c3c, 1);
      cg.fillRect(1, 8, 3, 3);
      cg.fillRect(1, 15, 3, 3);

      cg.generateTexture('car_' + ci, 48, 26);
      cg.clear();
    });

    // Wheel dot (8x8): dark circle with a thin lighter spoke across the center
    cg.fillStyle(0x222222, 1);
    cg.fillCircle(4, 4, 3);
    cg.lineStyle(1, 0x555555, 1);
    cg.lineBetween(1, 4, 7, 4);
    cg.generateTexture('wheel_dot', 8, 8);

    cg.destroy();

    self.scene.start('GameScene');
  },

  // Build a simple animated placeholder grid used when a character art file
  // is missing, so the game remains fully playable without assets.
  _makePlaceholderStrip: function(charIdx, cols, rows) {
    var frameW = 64, frameH = 96;
    var accent = (CFG.CHARS[charIdx] && CFG.CHARS[charIdx].accent) || '#ffd700';
    var cv = document.createElement('canvas');
    cv.width  = frameW * cols;
    cv.height = frameH * rows;
    var c = cv.getContext('2d');
    var totalFrames = cols * rows;

    for (var f = 0; f < totalFrames; f++) {
      var col = f % cols;
      var row = Math.floor(f / cols);
      var ox = col * frameW;
      var oy = row * frameH;
      var bob = Math.abs(Math.sin(f * 0.9)) * 4;
      var cx = ox + frameW / 2;
      // body
      c.fillStyle = accent;
      c.fillRect(cx - 9, oy + 34 + bob, 18, 30);
      // head
      c.beginPath();
      c.arc(cx, oy + 26 + bob, 11, 0, Math.PI * 2);
      c.fill();
      // legs (swing on even/odd frames)
      var swing = (f % 2 === 0) ? 4 : -4;
      c.fillRect(cx - 8, oy + 64 + bob, 6, 20 + swing);
      c.fillRect(cx + 2, oy + 64 + bob, 6, 20 - swing);
      // outline
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.lineWidth = 2;
      c.strokeRect(cx - 9, oy + 34 + bob, 18, 30);
    }
    return { canvas: cv, frameW: frameW, frameH: frameH };
  },
});

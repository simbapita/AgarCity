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
    // Each file: 896x96px horizontal strip, 14 frames of 64x96px
    //   [0-1]  idle   3 fps
    //   [2-5]  walk   8 fps
    //   [6-9]  run   12 fps
    //  [10-13] work   6 fps
    // Background: solid magenta #FF00FF (chroma-keyed out below)

    var FRAMES = 14; // idle(2) + walk(4) + run(4) + work(4)

    CFG.CHAR_FILES.forEach(function(name, i) {
      var raw = self._failed['charraw_' + i] ? null : self.textures.get('charraw_' + i).getSourceImage();
      var w   = raw ? (raw.naturalWidth  || raw.width)  : 0;
      var h   = raw ? (raw.naturalHeight || raw.height) : 0;

      var canvas, frameW, frameH;

      // Need a strip at least FRAMES px wide to slice; otherwise use a placeholder.
      if (raw && w >= FRAMES && h > 0) {
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

        // Frame size derived from the actual image so non-896x96 strips still work.
        frameW = Math.floor(w / FRAMES);
        frameH = h;
      } else {
        // Fallback placeholder so the game still runs without art.
        var ph = self._makePlaceholderStrip(i, FRAMES);
        canvas = ph.canvas;
        frameW = ph.frameW;
        frameH = ph.frameH;
      }

      // Register as Phaser spritesheet
      self.textures.addSpriteSheet('char_' + i, canvas, { frameWidth: frameW, frameHeight: frameH });

      // Register all four animations
      var k = 'char_' + i;
      self.anims.create({ key: k + '_idle', frames: self.anims.generateFrameNumbers(k, { start: 0,  end: 1  }), frameRate: 3,  repeat: -1 });
      self.anims.create({ key: k + '_walk', frames: self.anims.generateFrameNumbers(k, { start: 2,  end: 5  }), frameRate: 8,  repeat: -1 });
      self.anims.create({ key: k + '_run',  frames: self.anims.generateFrameNumbers(k, { start: 6,  end: 9  }), frameRate: 12, repeat: -1 });
      self.anims.create({ key: k + '_work', frames: self.anims.generateFrameNumbers(k, { start: 10, end: 13 }), frameRate: 6,  repeat: -1 });

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

    // Car textures
    var cg = self.make.graphics({ x: 0, y: 0, add: false });
    [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6].forEach(function(col, ci) {
      cg.fillStyle(col, 1);
      cg.fillRoundedRect(0, 0, 40, 22, 4);
      cg.fillStyle(0x34495e, 1);
      cg.fillRect(6, 4, 10, 14);
      cg.fillRect(22, 4, 12, 14);
      cg.generateTexture('car_' + ci, 40, 22);
      cg.clear();
    });
    cg.destroy();

    self.scene.start('GameScene');
  },

  // Build a simple animated placeholder strip (14 frames) used when a
  // character's art file is missing, so the game remains fully playable.
  _makePlaceholderStrip: function(charIdx, frames) {
    var frameW = 64, frameH = 96;
    var accent = (CFG.CHARS[charIdx] && CFG.CHARS[charIdx].accent) || '#ffd700';
    var cv = document.createElement('canvas');
    cv.width  = frameW * frames;
    cv.height = frameH;
    var c = cv.getContext('2d');

    for (var f = 0; f < frames; f++) {
      var ox = f * frameW;
      // Animate a little vertical bob + leg swing per frame
      var bob = Math.abs(Math.sin(f * 0.9)) * 4;
      var cx = ox + frameW / 2;
      // body
      c.fillStyle = accent;
      c.fillRect(cx - 9, 34 + bob, 18, 30);
      // head
      c.beginPath();
      c.arc(cx, 26 + bob, 11, 0, Math.PI * 2);
      c.fill();
      // legs (swing on even/odd frames)
      var swing = (f % 2 === 0) ? 4 : -4;
      c.fillRect(cx - 8, 64 + bob, 6, 20 + swing);
      c.fillRect(cx + 2, 64 + bob, 6, 20 - swing);
      // outline accent
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.lineWidth = 2;
      c.strokeRect(cx - 9, 34 + bob, 18, 30);
    }
    return { canvas: cv, frameW: frameW, frameH: frameH };
  },
});

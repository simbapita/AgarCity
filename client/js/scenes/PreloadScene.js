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

    CFG.CHAR_FILES.forEach(function(name, i) {
      var raw = self.textures.get('charraw_' + i).getSourceImage();
      var w   = raw.naturalWidth  || raw.width;
      var h   = raw.naturalHeight || raw.height;

      // Draw to canvas and remove magenta background
      var canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(raw, 0, 0);

      var imgData = ctx.getImageData(0, 0, w, h);
      var px = imgData.data;
      for (var j = 0; j < px.length; j += 4) {
        // Magenta: R high, G low, B high
        if (px[j] > 180 && px[j+1] < 80 && px[j+2] > 180) {
          px[j+3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Register as Phaser spritesheet
      self.textures.addSpriteSheet('char_' + i, canvas, { frameWidth: 64, frameHeight: 96 });

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
      // Frame 0 occupies x=0..63, y=0..95 on the strip.
      // Crop centre-upper area (face + upper torso)
      avCtx.drawImage(canvas, 4, 0, 56, 64, 0, 0, 60, 60);
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
});

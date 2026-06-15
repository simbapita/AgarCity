var PreloadScene = new Phaser.Class({
  Extends: Phaser.Scene,

  initialize: function() {
    Phaser.Scene.call(this, { key: 'PreloadScene' });
  },

  preload: function() {
    // All assets generated programmatically — nothing to fetch
    var bar = this.add.rectangle(400, 300, 400, 12, 0xffd700);
    var fill = this.add.rectangle(200, 300, 0, 10, 0xffffff);
    this.load.on('progress', function(v) { fill.width = 400 * v; fill.x = 200 + fill.width/2; });

    // Load characters master sprite sheet
    this.load.image('characters_sheet', 'assets/characters.png');
  },

  create: function() {
    var self = this;

    // Generate city and store canvas as Phaser texture
    var result = generateCity();
    self.textures.addCanvas('city', result.canvas);
    self.registry.set('cityMap', result.map);

    // Slice and chroma-key the character sprite sheet
    var img = self.textures.get('characters_sheet').getSourceImage();
    var cfg = CFG.SHEET;
    var targetRgb = { r: 176, g: 181, b: 184 }; // #b0b5b8

    CFG.CHARS.forEach(function(ch, i) {
      var row = Math.floor(i / 5);
      var col = i % 5;
      var x = cfg.offsetX + col * (cfg.cellW + cfg.spacingX);
      var y = cfg.offsetY + row * (cfg.cellH + cfg.spacingY);

      // 1. Full character cropped canvas
      var canvas = document.createElement('canvas');
      canvas.width = cfg.cellW;
      canvas.height = cfg.cellH;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, x, y, cfg.cellW, cfg.cellH, 0, 0, cfg.cellW, cfg.cellH);

      // Chroma-key transparency for full character
      var imgData = ctx.getImageData(0, 0, cfg.cellW, cfg.cellH);
      var pixels = imgData.data;
      for (var j = 0; j < pixels.length; j += 4) {
        var pr = pixels[j];
        var pg = pixels[j+1];
        var pb = pixels[j+2];
        
        var dist = Math.sqrt(
          Math.pow(pr - targetRgb.r, 2) +
          Math.pow(pg - targetRgb.g, 2) +
          Math.pow(pb - targetRgb.b, 2)
        );
        
        if (dist < cfg.chromaTol) {
          pixels[j+3] = 0; // Transparent
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Register character texture with Phaser
      self.textures.addCanvas('player_' + i, canvas);

      // 2. Avatar headshot cropped canvas (for UI/lobby)
      var avCanvas = document.createElement('canvas');
      avCanvas.width = 50;
      avCanvas.height = 50;
      var avCtx = avCanvas.getContext('2d');
      
      // Crop upper body area (x: 20-80, y: 10-70 of full 100x145 character canvas)
      avCtx.drawImage(canvas, 20, 10, 60, 60, 0, 0, 50, 50);

      // Register avatar texture
      self.textures.addCanvas('avatar_' + i, avCanvas);
    });

    // NPC pedestrian texture
    var ng = self.make.graphics({ x:0, y:0, add:false });
    ng.fillStyle(0x888888, 1);
    ng.fillCircle(12, 12, 10);
    ng.lineStyle(2, 0x555555, 1);
    ng.strokeCircle(12, 12, 10);
    ng.generateTexture('npc', 24, 24);
    ng.destroy();

    // Car texture (simple rectangle)
    var cg = self.make.graphics({ x:0, y:0, add:false });
    var carColors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6];
    carColors.forEach(function(col, ci) {
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

function hexToNum(hex) {
  return parseInt(hex.replace('#',''), 16);
}

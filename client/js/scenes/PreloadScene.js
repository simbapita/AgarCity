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

    // Slice and chroma-key the character sprite sheet.
    // Auto-divide evenly into 5 columns × 3 rows — works regardless of exact image size.
    var img = self.textures.get('characters_sheet').getSourceImage();
    var imgW = img.naturalWidth  || img.width;
    var imgH = img.naturalHeight || img.height;
    var colW = Math.floor(imgW / 5);
    var rowH = Math.floor(imgH / 3);
    var chromaTol = CFG.SHEET.chromaTol;

    CFG.CHARS.forEach(function(ch, i) {
      var row = Math.floor(i / 5);
      var col = i % 5;
      var sx = col * colW;
      var sy = row * rowH;

      // 1. Full character canvas (used in-game)
      var canvas = document.createElement('canvas');
      canvas.width  = colW;
      canvas.height = rowH;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, colW, rowH, 0, 0, colW, rowH);

      // Chroma-key: remove background gray (#b0b5b8, tolerance chromaTol)
      var imgData = ctx.getImageData(0, 0, colW, rowH);
      var pixels  = imgData.data;
      for (var j = 0; j < pixels.length; j += 4) {
        var dr = pixels[j]   - 176;
        var dg = pixels[j+1] - 181;
        var db = pixels[j+2] - 184;
        if (Math.sqrt(dr*dr + dg*dg + db*db) < chromaTol) {
          pixels[j+3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      self.textures.addCanvas('player_' + i, canvas);

      // 2. Avatar headshot (used in character select & lobby)
      // Crop upper-center ~50% of cell height where the face/head lives
      var avCanvas = document.createElement('canvas');
      avCanvas.width  = 60;
      avCanvas.height = 60;
      var avCtx  = avCanvas.getContext('2d');
      var cropX  = Math.floor(colW * 0.10);
      var cropY  = Math.floor(rowH * 0.02);
      var cropW  = Math.floor(colW * 0.80);
      var cropH  = Math.floor(rowH * 0.52);
      avCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, 60, 60);
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

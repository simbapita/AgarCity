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
  },

  create: function() {
    var self = this;

    // Generate city and store canvas as Phaser texture
    var result = generateCity();
    self.textures.addCanvas('city', result.canvas);
    self.registry.set('cityMap', result.map);

    // Create player sprite textures for each character
    CFG.CHARS.forEach(function(ch, i) {
      var g = self.make.graphics({ x: 0, y: 0, add: false });
      g.lineStyle(3, hexToNum(ch.outline), 1);
      g.fillStyle(hexToNum(ch.body), 1);
      g.fillCircle(16, 16, 13);
      g.strokeCircle(16, 16, 13);
      // direction dot
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(16, 7, 4);
      g.generateTexture('player_' + i, 32, 32);
      g.destroy();
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

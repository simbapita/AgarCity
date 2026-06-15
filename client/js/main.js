// Phaser game init — runs on page load in background
(function() {
  var W = CFG.WORLD_W * CFG.TILE;  // 70*32 = 2240
  var H = CFG.WORLD_H * CFG.TILE;  // 70*32 = 2240

  var config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-canvas',
    backgroundColor: '#0a0a14',
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 0 }, debug: false },
    },
    scene: [PreloadScene, GameScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };

  var game = new Phaser.Game(config);
  window._phaserGame = game;

  // Connect socket
  SC.connect();
  UI.init();
})();

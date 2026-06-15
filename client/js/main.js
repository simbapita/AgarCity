// Phaser bootstrap — runs on page load, game world starts after login.
(function () {
  var config = {
    type: Phaser.AUTO,
    parent: 'game-canvas',
    backgroundColor: '#1a1a2e',
    pixelArt: true,
    roundPixels: true,
    input: { keyboard: { target: window } },
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: CFG.GRAVITY }, debug: false },
    },
    scene: [PreloadScene, GameScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: window.innerWidth,
      height: window.innerHeight,
    },
  };

  window._phaserGame = new Phaser.Game(config);
  SC.connect();
  UI.init();
})();

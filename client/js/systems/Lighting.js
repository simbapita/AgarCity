// Lighting system (top-down) — Terraria-style torch glow for AgarCity.
// DayNight darkens the whole scene at night with a MULTIPLY overlay; this system
// paints warm light back in with an ADDITIVE overlay: a soft glow follows the
// player (their "torch"), and every lit landmark (job zones, food stores) glows
// too. The glow only matters when it's dark, so its strength scales with how
// far past dusk we are.
//
// Public API:
//   Lighting.init(scene)
//   Lighting.update(opts)  opts = { camera, skyLight, sources, player }
//                            sources = [{ x, y, radius }] in WORLD coords
//                            player  = { x, y } in WORLD coords
//   Lighting.resize(w, h)
var Lighting = (function() {
  var PLAYER_RADIUS = 150;     // px glow radius around the player
  var PLAYER_STRENGTH = 1.0;   // peak alpha of the player's glow
  var SOURCE_STRENGTH = 0.9;   // peak alpha of landmark glows
  var WARM = [255, 226, 168];  // glow colour (warm torch light)

  var _scene = null;
  var _canvas = null;
  var _ctx = null;
  var _image = null;
  var _w = 0, _h = 0;

  function _build(w, h) {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    _w = w; _h = h;

    if (_scene.textures.exists('torchlight')) {
      if (_image) { _image.destroy(); _image = null; }
      _scene.textures.remove('torchlight');
    }
    _canvas = document.createElement('canvas');
    _canvas.width = w; _canvas.height = h;
    _ctx = _canvas.getContext('2d');

    _scene.textures.addCanvas('torchlight', _canvas);
    _image = _scene.add.image(0, 0, 'torchlight').setOrigin(0);
    _image.setScrollFactor(0);
    _image.setDepth(905);                 // above the DayNight darken overlay
    _image.setBlendMode(Phaser.BlendModes.ADD);
  }

  function init(scene) {
    _scene = scene;
    var cam = scene.cameras.main;
    _build(cam.width, cam.height);
  }

  function resize(w, h) { if (_scene) _build(w, h); }

  // Paint one radial glow centred at screen (sx,sy).
  function _glow(sx, sy, radius, strength, nightAmt) {
    var a = strength * nightAmt;
    if (a <= 0.01) return;
    var g = _ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
    var c = WARM[0] + ',' + WARM[1] + ',' + WARM[2];
    g.addColorStop(0,    'rgba(' + c + ',' + a + ')');
    g.addColorStop(0.55, 'rgba(' + c + ',' + (a * 0.45) + ')');
    g.addColorStop(1,    'rgba(' + c + ',0)');
    _ctx.fillStyle = g;
    _ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
  }

  function update(opts) {
    if (!_scene || !_ctx || !opts) return;
    var cam = opts.camera;
    if (!cam) return;

    _ctx.clearRect(0, 0, _w, _h);

    // Only glow once it's getting dark; full strength deep at night.
    var skyLight = (typeof opts.skyLight === 'number') ? opts.skyLight : 1;
    var nightAmt = 1 - skyLight;
    nightAmt = nightAmt < 0 ? 0 : (nightAmt > 1 ? 1 : nightAmt);
    // Ease in so dusk doesn't suddenly light up.
    nightAmt = nightAmt * nightAmt * (3 - 2 * nightAmt);

    if (nightAmt > 0.01) {
      _ctx.globalCompositeOperation = 'lighter';

      // Landmark glows (buildings/zones stay lit through the night).
      var src = opts.sources || [];
      for (var i = 0; i < src.length; i++) {
        var s = src[i];
        var sx = s.x - cam.scrollX, sy = s.y - cam.scrollY;
        var r = (s.radius || 90) * 1.4;
        if (sx < -r || sy < -r || sx > _w + r || sy > _h + r) continue;
        _glow(sx, sy, r, SOURCE_STRENGTH, nightAmt);
      }

      // The player's own torch (drawn last so it's brightest).
      if (opts.player) {
        var px = opts.player.x - cam.scrollX, py = opts.player.y - cam.scrollY;
        _glow(px, py, PLAYER_RADIUS, PLAYER_STRENGTH, nightAmt);
      }

      _ctx.globalCompositeOperation = 'source-over';
    }

    if (_scene.textures.exists('torchlight')) {
      _scene.textures.get('torchlight').refresh();
    }
  }

  return { init: init, update: update, resize: resize };
})();

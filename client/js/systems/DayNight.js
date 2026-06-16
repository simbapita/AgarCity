// DayNight system (top-down) — Terraria-style day/night cycle for AgarCity.
// There's no sky in a top-down view, so instead of a gradient we tint the whole
// scene with a full-screen MULTIPLY overlay whose colour + strength shift across
// the day: bright & warm at noon, orange at dusk, deep blue at night. Drives a
// smooth skyLight value (0..1) that the Lighting system uses to decide how much
// the player's torch glow matters.
//
// Public API:
//   DayNight.init(scene, opts)   opts = { startTime: <epoch ms, optional> }
//   DayNight.update(time, delta)
//   DayNight.getSkyLight()  -> number 0..1   (1 = noon, ~0.08 = midnight)
//   DayNight.isNight()      -> boolean
//   DayNight.getPhase()     -> 'day' | 'dusk' | 'night' | 'dawn'
var DayNight = (function() {
  // --- Tunables -------------------------------------------------------------
  var NIGHT_LIGHT = 0.08;      // skyLight at deep midnight
  var DAY_LIGHT = 1.00;        // skyLight at high noon
  var NIGHT_THRESHOLD = 0.35;  // isNight() / phase boundary on skyLight
  var TWILIGHT_BAND = 0.12;    // cycle-fraction over which dawn/dusk ramps run
  var MAX_DARK_ALPHA = 0.72;   // strongest the night tint ever gets

  // Ambient tint colours [r,g,b] by mood (used by the MULTIPLY overlay).
  var TINT_NOON  = [255, 251, 240];  // barely-there warm white
  var TINT_NIGHT = [44, 58, 116];    // deep moonlit blue
  var TINT_DUSK  = [255, 142, 78];   // warm horizon orange

  // --- State ----------------------------------------------------------------
  var _scene = null;
  var _startTime = 0;
  var _p = 0;
  var _skyLight = 1;
  var _phase = 'day';
  var _w = 0, _h = 0;
  var _overlay = null;   // full-screen Phaser.GameObjects.Rectangle (MULTIPLY)
  var _ready = false;

  // --- Math helpers ---------------------------------------------------------
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function lerpColor(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }
  function rgbToInt(c) {
    return ((c[0] & 255) << 16) | ((c[1] & 255) << 8) | (c[2] & 255);
  }

  // --- Cycle math -----------------------------------------------------------
  function computeProgress() {
    var len = CFG.DAY_LENGTH_MS || 300000;
    var dt = Date.now() - _startTime;
    var p = (dt % len) / len;
    if (p < 0) p += 1;
    return p;
  }

  // Map cycle progress -> skyLight (0..1) with smooth dawn & dusk ramps.
  function computeSkyLight(p) {
    var dayFrac = CFG.DAY_FRACTION || 0.6;
    var band = Math.min(TWILIGHT_BAND, dayFrac * 0.5, (1 - dayFrac) * 0.5);
    var light;
    if (p < dayFrac) {
      var rise = smoothstep(p / band);
      var set = smoothstep((dayFrac - p) / band);
      var t = Math.min(rise, set);
      var noon = 0.5 - 0.5 * Math.cos((p / dayFrac) * Math.PI);
      var dayShape = Math.min(t, 0.7 + 0.3 * noon);
      light = lerp(NIGHT_LIGHT, DAY_LIGHT, dayShape);
    } else {
      var into = (p - dayFrac);
      var toDawn = (1 - p);
      var fall = smoothstep(into / band);
      var climb = smoothstep(toDawn / band);
      var darkness = Math.min(fall, climb);
      light = lerp(DAY_LIGHT, NIGHT_LIGHT, darkness);
    }
    return clamp01(light);
  }

  function computePhase(p, skyLight) {
    var dayFrac = CFG.DAY_FRACTION || 0.6;
    var band = Math.min(TWILIGHT_BAND, dayFrac * 0.5, (1 - dayFrac) * 0.5);
    var nearSunrise = (p < band) || (p > 1 - band);
    var nearSunset = Math.abs(p - dayFrac) < band;
    if (skyLight >= NIGHT_THRESHOLD && skyLight < 0.78) {
      if (nearSunset) return 'dusk';
      if (nearSunrise) return 'dawn';
    }
    if (skyLight < NIGHT_THRESHOLD) return 'night';
    return 'day';
  }

  // Pick the ambient tint colour + overlay alpha for the current moment.
  function ambient(p, skyLight) {
    var dayFrac = CFG.DAY_FRACTION || 0.6;
    var band = Math.min(TWILIGHT_BAND, dayFrac * 0.5, (1 - dayFrac) * 0.5);

    // Base colour leans from night-blue toward warm-white as light rises.
    var col = lerpColor(TINT_NIGHT, TINT_NOON, smoothstep(skyLight));

    // Warmth peaks right at the horizons (sunrise & sunset).
    var distSunset = Math.abs(p - dayFrac);
    var distSunrise = Math.min(p, 1 - p);
    var warmth = clamp01(1 - Math.min(distSunset, distSunrise) / (band * 1.5));
    if (warmth > 0) col = lerpColor(col, TINT_DUSK, warmth * 0.7);

    // Darkness grows as light falls; multiply overlay alpha follows it.
    var darkness = 1 - skyLight;
    var alpha = smoothstep(darkness) * MAX_DARK_ALPHA;

    return { color: rgbToInt(col), alpha: alpha };
  }

  // --- Layout ---------------------------------------------------------------
  function readViewport() {
    var cam = _scene.cameras && _scene.cameras.main;
    _w = (cam && cam.width) || (_scene.scale && _scene.scale.width) || 800;
    _h = (cam && cam.height) || (_scene.scale && _scene.scale.height) || 600;
  }

  function layout() {
    if (!_overlay) return;
    _overlay.setPosition(0, 0);
    _overlay.setSize(_w, _h);
  }

  function onResize() { readViewport(); layout(); }

  // --- Public API -----------------------------------------------------------
  function init(scene, opts) {
    _scene = scene;
    opts = opts || {};
    _startTime = (typeof opts.startTime === 'number') ? opts.startTime : Date.now();
    readViewport();

    _overlay = _scene.add.rectangle(0, 0, _w, _h, 0xffffff, 1).setOrigin(0, 0);
    _overlay.setScrollFactor(0);
    _overlay.setDepth(900);
    _overlay.setBlendMode(Phaser.BlendModes.MULTIPLY);

    if (_scene.scale && _scene.scale.on) _scene.scale.on('resize', onResize);

    _p = computeProgress();
    _skyLight = computeSkyLight(_p);
    _phase = computePhase(_p, _skyLight);
    apply();
    _ready = true;
  }

  function apply() {
    if (!_overlay) return;
    var a = ambient(_p, _skyLight);
    _overlay.setFillStyle(a.color, 1);
    _overlay.setAlpha(a.alpha);
  }

  function update() {
    if (!_ready) return;
    _p = computeProgress();
    _skyLight = computeSkyLight(_p);
    _phase = computePhase(_p, _skyLight);
    apply();
  }

  function getSkyLight() { return _skyLight; }
  function isNight() { return _skyLight < NIGHT_THRESHOLD; }
  function getPhase() { return _phase; }

  return {
    init: init,
    update: update,
    getSkyLight: getSkyLight,
    isNight: isNight,
    getPhase: getPhase,
    getProgress: function() { return _p; }
  };
})();

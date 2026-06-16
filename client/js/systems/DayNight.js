// DayNight system — Terraria-style day/night cycle.
// Self-contained: builds a recoloring sky gradient, an arcing sun & moon, and a
// twinkling star field. Drives a smooth skyLight value (0..1) consumed by the
// Lighting system. No external image files — all visuals are procedural.
//
// Public API:
//   DayNight.init(scene, opts)   opts = { startTime: <epoch ms, optional> }
//   DayNight.update(time, delta)
//   DayNight.getSkyLight()  -> number 0..1
//   DayNight.isNight()      -> boolean
//   DayNight.getPhase()     -> 'day' | 'dusk' | 'night' | 'dawn'
var DayNight = (function() {
  // --- Tunables -------------------------------------------------------------
  var NIGHT_LIGHT = 0.10;     // skyLight at deep midnight
  var DAY_LIGHT = 1.00;       // skyLight at high noon
  var NIGHT_THRESHOLD = 0.35; // isNight() / phase boundary on skyLight
  var TWILIGHT_BAND = 0.12;   // p-distance over which dawn/dusk ramps run
  var SKY_REDRAW_MS = 250;    // throttle for regenerating the gradient texture
  var COLOR_EPS = 6;          // min per-channel color delta to force a redraw
  var STAR_COUNT = 140;
  var GRADIENT_STEPS = 24;    // vertical bands rendered into the gradient canvas

  // --- Palettes (top-of-sky / bottom-of-sky) by mood -----------------------
  // Each entry is [r, g, b]. We interpolate between moods using skyLight and
  // the warmth of the current twilight to land on the final two stops.
  var SKY_NOON_TOP = [76, 161, 235], SKY_NOON_BOT = [164, 214, 247];
  var SKY_NIGHT_TOP = [8, 10, 28], SKY_NIGHT_BOT = [22, 26, 58];
  var SKY_DUSK_TOP = [60, 38, 92], SKY_DUSK_BOT = [240, 138, 86]; // warm horizon

  // --- State ----------------------------------------------------------------
  var _scene = null;
  var _startTime = 0;
  var _p = 0;                 // cycle progress 0..1
  var _skyLight = 1;
  var _phase = 'day';

  var _w = 0, _h = 0;         // current viewport size in px

  var _skyImg = null;         // Phaser.GameObjects.Image (gradient)
  var _skyTexKey = 'daynight-sky';
  var _skyCanvasTex = null;   // Phaser CanvasTexture backing the sky
  var _lastSkyDrawMs = -1e9;
  var _lastTop = [-1, -1, -1];
  var _lastBot = [-1, -1, -1];

  var _bodies = null;         // Graphics for sun + moon discs
  var _stars = null;          // Graphics for the star field
  var _starList = [];         // [{ x, y, r, base }] in normalized 0..1 coords

  var _ready = false;

  // --- Small math helpers ---------------------------------------------------
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function smoothstep(t) {
    t = clamp01(t);
    return t * t * (3 - 2 * t);
  }

  function lerpColor(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }

  function colorFar(a, b) {
    return Math.abs(a[0] - b[0]) >= COLOR_EPS ||
           Math.abs(a[1] - b[1]) >= COLOR_EPS ||
           Math.abs(a[2] - b[2]) >= COLOR_EPS;
  }

  function rgbToInt(c) {
    return ((c[0] & 255) << 16) | ((c[1] & 255) << 8) | (c[2] & 255);
  }

  function rgbCss(c) {
    return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  }

  // --- Cycle math -----------------------------------------------------------
  // Returns cycle progress 0..1. 0 = dawn start, dayFrac = dusk start.
  function computeProgress() {
    var len = CFG.DAY_LENGTH_MS || 300000;
    var dt = Date.now() - _startTime;
    var p = (dt % len) / len;
    if (p < 0) p += 1; // guard against a future startTime
    return p;
  }

  // Map cycle progress -> skyLight (0..1) with smooth dawn & dusk ramps.
  // Day occupies [0, dayFrac); the sun peaks mid-day and the ramps live in the
  // TWILIGHT_BAND around sunrise (p=0) and sunset (p=dayFrac).
  function computeSkyLight(p) {
    var dayFrac = CFG.DAY_FRACTION || 0.62;
    var band = Math.min(TWILIGHT_BAND, dayFrac * 0.5, (1 - dayFrac) * 0.5);
    var light;

    if (p < dayFrac) {
      // Daytime. Ease up from sunrise, hold bright, ease down toward sunset.
      var rise = smoothstep(p / band);                 // 0..1 over sunrise band
      var set = smoothstep((dayFrac - p) / band);      // 0..1 toward sunset
      var t = Math.min(rise, set);                     // dark at both edges
      // Cosine bulge across the day for a natural noon peak on top of the ramp.
      var noon = 0.5 - 0.5 * Math.cos((p / dayFrac) * Math.PI); // 0..1..0
      var dayShape = Math.min(t, 0.65 + 0.35 * noon);
      light = lerp(NIGHT_LIGHT, DAY_LIGHT, dayShape);
    } else {
      // Nighttime. Ease down after dusk, hold dark, ease up toward dawn.
      var nLen = 1 - dayFrac;
      var into = (p - dayFrac);                         // time since dusk
      var toDawn = (1 - p);                             // time until next dawn
      var fall = smoothstep(into / band);               // 1 = fully into night
      var climb = smoothstep(toDawn / band);            // 1 = still deep night
      var darkness = Math.min(fall, climb);             // 1 deep, 0 at edges
      // Gentle midnight dip so it is darkest in the middle of the night.
      var mid = 0.5 - 0.5 * Math.cos((into / nLen) * 2 * Math.PI); // 0 at ends
      var nightShape = darkness * (1 - 0.25 * mid);
      light = lerp(DAY_LIGHT, NIGHT_LIGHT, nightShape);
      // Keep continuity: clamp so we never exceed the daytime floor.
      if (light > DAY_LIGHT) light = DAY_LIGHT;
    }
    return clamp01(light);
  }

  function computePhase(p, skyLight) {
    var dayFrac = CFG.DAY_FRACTION || 0.62;
    var band = Math.min(TWILIGHT_BAND, dayFrac * 0.5, (1 - dayFrac) * 0.5);
    // Twilight windows straddle sunrise (p~0/1) and sunset (p~dayFrac).
    var nearSunrise = (p < band) || (p > 1 - band);
    var nearSunset = Math.abs(p - dayFrac) < band;
    if (skyLight >= NIGHT_THRESHOLD && skyLight < 0.75) {
      if (nearSunset) return 'dusk';
      if (nearSunrise) return 'dawn';
    }
    if (skyLight < NIGHT_THRESHOLD) return 'night';
    return 'day';
  }

  // --- Sky gradient ---------------------------------------------------------
  // Choose the two gradient stops for the current sky mood.
  function skyStops(p, skyLight) {
    var dayFrac = CFG.DAY_FRACTION || 0.62;
    var band = Math.min(TWILIGHT_BAND, dayFrac * 0.5, (1 - dayFrac) * 0.5);
    // Warmth peaks right at the horizons (sunrise & sunset), 0 otherwise.
    var distSunset = Math.abs(p - dayFrac);
    var distSunrise = Math.min(p, 1 - p);
    var warmRaw = 1 - Math.min(distSunset, distSunrise) / (band * 1.4);
    var warmth = clamp01(warmRaw);

    var top, bot;
    if (skyLight >= 0.5) {
      // Lean from night-ish toward noon as light rises through the upper half.
      var dT = smoothstep((skyLight - 0.5) / 0.5);
      top = lerpColor(SKY_NIGHT_TOP, SKY_NOON_TOP, dT);
      bot = lerpColor(SKY_NIGHT_BOT, SKY_NOON_BOT, dT);
    } else {
      // Lower half stays night-leaning.
      var dN = smoothstep(skyLight / 0.5);
      top = lerpColor(SKY_NIGHT_TOP, SKY_NOON_TOP, dN * 0.5);
      bot = lerpColor(SKY_NIGHT_BOT, SKY_NOON_BOT, dN * 0.5);
    }
    // Blend in the warm twilight palette near the horizons.
    if (warmth > 0) {
      var wT = warmth * (1 - Math.abs(skyLight - NIGHT_THRESHOLD)); // strongest mid-transition
      wT = clamp01(wT);
      top = lerpColor(top, SKY_DUSK_TOP, wT * 0.8);
      bot = lerpColor(bot, SKY_DUSK_BOT, wT);
    }
    return { top: top, bot: bot };
  }

  // Paint the vertical gradient onto the backing canvas texture.
  function drawSky(top, bot) {
    if (!_skyCanvasTex) return;
    var ctx = _skyCanvasTex.getContext();
    var cw = _skyCanvasTex.width, ch = _skyCanvasTex.height;
    // Band fill keeps the texture small while looking like a smooth gradient.
    var bandH = Math.ceil(ch / GRADIENT_STEPS);
    for (var i = 0; i < GRADIENT_STEPS; i++) {
      var t = GRADIENT_STEPS > 1 ? i / (GRADIENT_STEPS - 1) : 0;
      var c = lerpColor(top, bot, t);
      ctx.fillStyle = rgbCss(c);
      ctx.fillRect(0, i * bandH, cw, bandH + 1);
    }
    _skyCanvasTex.refresh();
    _lastTop = [top[0], top[1], top[2]];
    _lastBot = [bot[0], bot[1], bot[2]];
  }

  function ensureSkyTexture() {
    // (Re)create the canvas texture at a low resolution; the Image is scaled to
    // fill the screen, so the gradient stays crisp vertically and cheap to draw.
    var texW = 8;
    var texH = 256;
    if (_scene.textures.exists(_skyTexKey)) {
      _skyCanvasTex = _scene.textures.get(_skyTexKey);
    } else {
      _skyCanvasTex = _scene.textures.createCanvas(_skyTexKey, texW, texH);
    }
  }

  // --- Sun, moon, stars -----------------------------------------------------
  function buildStars() {
    _starList = [];
    for (var i = 0; i < STAR_COUNT; i++) {
      _starList.push({
        x: Math.random(),               // normalized 0..1 across width
        y: Math.random() * 0.7,         // upper 70% of the sky
        r: 0.5 + Math.random() * 1.4,   // radius px
        base: 0.4 + Math.random() * 0.6, // peak alpha at full night
        tw: Math.random() * Math.PI * 2  // twinkle phase
      });
    }
  }

  // Position of the active celestial body along its horizon-to-horizon arc.
  // segT 0..1 maps left horizon -> apex -> right horizon. Returns {x, y, r}.
  function celestialPos(segT) {
    var marginX = 0;
    var spanX = _w;
    var x = marginX + spanX * clamp01(segT);
    // Arc: parabola peaking at center, dipping below the top margin at edges.
    var apex = _h * 0.12;        // highest point (small y)
    var horizon = _h * 0.78;     // lowest point near horizon
    var arc = 4 * (segT - 0.5) * (segT - 0.5); // 0 at center, 1 at edges
    var y = lerp(apex, horizon, arc);
    return { x: x, y: y };
  }

  function drawBodies(p, skyLight) {
    if (!_bodies) return;
    _bodies.clear();
    var dayFrac = CFG.DAY_FRACTION || 0.62;
    var radius = Math.max(14, Math.min(_w, _h) * 0.035);

    if (p < dayFrac) {
      // Sun: travels left->right across the daytime segment.
      var sunT = p / dayFrac;
      var sp = celestialPos(sunT);
      var sunAlpha = clamp01((skyLight - 0.15) / 0.4);
      drawGlowDisc(sp.x, sp.y, radius, 0xfff2b0, 0xffd23f, sunAlpha);
    } else {
      // Moon: travels left->right across the nighttime segment.
      var moonT = (p - dayFrac) / (1 - dayFrac);
      var mp = celestialPos(moonT);
      var moonAlpha = clamp01((NIGHT_THRESHOLD + 0.15 - skyLight) / 0.4);
      drawGlowDisc(mp.x, mp.y, radius * 0.85, 0xfdfcf0, 0xd8e0ff, moonAlpha);
    }
  }

  // A disc with a soft halo, approximated by stacked translucent circles.
  function drawGlowDisc(x, y, r, coreColor, glowColor, alpha) {
    if (alpha <= 0.001) return;
    var rings = 4;
    for (var i = rings; i >= 1; i--) {
      var rr = r * (1 + i * 0.6);
      _bodies.fillStyle(glowColor, alpha * 0.10);
      _bodies.fillCircle(x, y, rr);
    }
    _bodies.fillStyle(glowColor, alpha * 0.5);
    _bodies.fillCircle(x, y, r * 1.25);
    _bodies.fillStyle(coreColor, alpha);
    _bodies.fillCircle(x, y, r);
  }

  function drawStars(time, skyLight) {
    if (!_stars) return;
    _stars.clear();
    var nightAmt = clamp01(1 - skyLight); // bright at night, gone by day
    nightAmt = smoothstep(nightAmt);
    if (nightAmt <= 0.01) return;
    var t = (time || 0) * 0.002;
    for (var i = 0; i < _starList.length; i++) {
      var s = _starList[i];
      var twinkle = 0.7 + 0.3 * Math.sin(t + s.tw);
      var a = s.base * nightAmt * twinkle;
      if (a <= 0.01) continue;
      _stars.fillStyle(0xffffff, clamp01(a));
      _stars.fillCircle(s.x * _w, s.y * _h, s.r);
    }
  }

  // --- Layout / resize ------------------------------------------------------
  function readViewport() {
    var cam = _scene.cameras && _scene.cameras.main;
    if (cam) {
      _w = cam.width;
      _h = cam.height;
    } else if (_scene.scale) {
      _w = _scene.scale.width;
      _h = _scene.scale.height;
    }
    if (!_w) _w = 800;
    if (!_h) _h = 600;
  }

  function layoutSky() {
    if (!_skyImg) return;
    // Stretch the small gradient texture to fully cover the viewport.
    _skyImg.setPosition(0, 0);
    _skyImg.setOrigin(0, 0);
    _skyImg.setDisplaySize(_w, _h);
  }

  function onResize() {
    readViewport();
    layoutSky();
    // Force a sky redraw + body/star reposition next frame.
    _lastTop = [-1, -1, -1];
    _lastBot = [-1, -1, -1];
    _lastSkyDrawMs = -1e9;
  }

  // --- Public API -----------------------------------------------------------
  function init(scene, opts) {
    _scene = scene;
    opts = opts || {};
    _startTime = (typeof opts.startTime === 'number') ? opts.startTime : Date.now();

    readViewport();

    // Sky gradient image (behind everything).
    ensureSkyTexture();
    _skyImg = _scene.add.image(0, 0, _skyTexKey);
    _skyImg.setOrigin(0, 0);
    _skyImg.setScrollFactor(0);
    _skyImg.setDepth(-1000);
    layoutSky();

    // Stars (between sky and celestial bodies).
    _stars = _scene.add.graphics();
    _stars.setScrollFactor(0);
    _stars.setDepth(-995);
    buildStars();

    // Sun & moon.
    _bodies = _scene.add.graphics();
    _bodies.setScrollFactor(0);
    _bodies.setDepth(-990);

    // Resize handling.
    if (_scene.scale && _scene.scale.on) {
      _scene.scale.on('resize', onResize);
    }

    // Prime values + initial draw.
    _p = computeProgress();
    _skyLight = computeSkyLight(_p);
    _phase = computePhase(_p, _skyLight);
    var stops = skyStops(_p, _skyLight);
    drawSky(stops.top, stops.bot);
    drawBodies(_p, _skyLight);
    drawStars(0, _skyLight);

    _ready = true;
  }

  function update(time, delta) {
    if (!_ready) return;
    _p = computeProgress();
    _skyLight = computeSkyLight(_p);
    _phase = computePhase(_p, _skyLight);

    // Sky: throttle the (relatively pricey) gradient regeneration.
    var now = (typeof time === 'number') ? time : Date.now();
    var stops = skyStops(_p, _skyLight);
    if (now - _lastSkyDrawMs >= SKY_REDRAW_MS ||
        colorFar(stops.top, _lastTop) || colorFar(stops.bot, _lastBot)) {
      drawSky(stops.top, stops.bot);
      _lastSkyDrawMs = now;
    }

    // Celestial bodies + stars move/fade every frame (cheap vector draws).
    drawBodies(_p, _skyLight);
    drawStars(now, _skyLight);
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
    // Exposed for any consumer that wants the raw cycle progress (read-only).
    getProgress: function() { return _p; }
  };
})();

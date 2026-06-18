// Particles system (top-down) — Terraria-style weather + ambience for AgarCity.
// Procedural textures only (no external images). Drives drifting ambient motes
// and rolling rain storms relative to the camera, plus little footstep dust
// puffs. Weather auto-toggles on a timer; setWeather() can force it.
//
// Public API:
//   Particles.init(scene)
//   Particles.footstep(worldX, worldY)
//   Particles.setWeather(kind)   // 'rain' | 'none'
//   Particles.isRaining()
//   Particles.update(time, delta, camera)
var Particles = (function() {
  var DEPTH_DUST = 40;
  var DEPTH_FX   = 45;
  var DEPTH_RAIN = 120;        // above the world, below the lighting/HUD

  var DUST_COUNT   = 30;
  var RAIN_PER_SEC = 360;
  var RAIN_MAX     = 1000;

  var _scene = null;
  var _ready = false;

  var _dust = null, _puff = null, _rain = null, _splash = null;
  var _motes = [];

  var _raining = false;
  var _rainAccum = 0, _splashAccum = 0;
  var _nextWeatherFlip = 0;

  function _makeTextures() {
    if (_scene.textures.exists('pdot')) return;
    var g = _scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 4, 4);
    g.generateTexture('pdot', 4, 4); g.destroy();

    var g2 = _scene.make.graphics({ x: 0, y: 0, add: false });
    g2.fillStyle(0xffffff, 1); g2.fillRect(0, 0, 2, 2);
    g2.generateTexture('ppixel', 2, 2); g2.destroy();

    var gr = _scene.make.graphics({ x: 0, y: 0, add: false });
    gr.fillStyle(0xffffff, 1); gr.fillRect(0, 0, 2, 12);
    gr.generateTexture('praindrop', 2, 12); gr.destroy();
  }

  function _makeEmitters() {
    // Ambient floating motes (pollen / dust). Hand-placed pool, manual emit.
    _dust = _scene.add.particles(0, 0, 'ppixel', {
      lifespan: 9000, speed: 0, scale: { min: 0.6, max: 1.6 },
      alpha: { start: 0, end: 0 }, frequency: -1, quantity: 0,
      tint: 0xfff4d0, blendMode: 'NORMAL'
    });
    _dust.setDepth(DEPTH_DUST);
    _dust.setScrollFactor(1);

    // Footstep dust puffs.
    _puff = _scene.add.particles(0, 0, 'pdot', {
      lifespan: { min: 240, max: 460 }, speed: { min: 6, max: 30 },
      angle: { min: 0, max: 360 }, scale: { start: 0.9, end: 0 },
      alpha: { start: 0.45, end: 0 }, tint: 0xcdb89a,
      frequency: -1, quantity: 0
    });
    _puff.setDepth(DEPTH_FX);

    // Rain: tall streaks falling fast with a touch of wind.
    _rain = _scene.add.particles(0, 0, 'praindrop', {
      lifespan: 1100, speedX: { min: -60, max: -20 }, speedY: { min: 620, max: 820 },
      scaleX: 1, scaleY: { min: 0.8, max: 1.3 }, alpha: { start: 0.5, end: 0.0 },
      tint: 0xaecbff, frequency: -1, quantity: 0
    });
    _rain.setDepth(DEPTH_RAIN);

    // Faint splashes where rain "lands".
    _splash = _scene.add.particles(0, 0, 'ppixel', {
      lifespan: { min: 150, max: 280 }, speedX: { min: -30, max: 30 },
      speedY: { min: -90, max: -30 }, scale: { start: 1.0, end: 0 },
      alpha: { start: 0.35, end: 0 }, tint: 0xc7dcff,
      frequency: -1, quantity: 0
    });
    _splash.setDepth(DEPTH_RAIN);
  }

  function _seedDust() {
    _motes.length = 0;
    for (var i = 0; i < DUST_COUNT; i++) {
      var p = _dust.emitParticleAt(0, 0, 1);
      if (!p) continue;
      p.lifeCurrent = p.life = 1e12;
      p.alpha = 0.10 + Math.random() * 0.16;
      p.scaleX = p.scaleY = 0.6 + Math.random() * 1.0;
      _motes.push({
        p: p, vx: (Math.random() * 2 - 1) * 7, vy: (Math.random() * 2 - 1) * 5, seeded: false
      });
    }
  }

  function init(scene) {
    if (!scene) return;
    _scene = scene;
    _makeTextures();
    _makeEmitters();
    _seedDust();
    _raining = false;
    _nextWeatherFlip = 0;
    _ready = true;
  }

  function footstep(worldX, worldY) {
    if (!_ready) return;
    _puff.explode(Phaser.Math.Between(1, 3), worldX, worldY);
  }

  function setWeather(kind) {
    if (!_ready) return;
    _raining = (kind === 'rain');
    if (!_raining) { _rainAccum = 0; _splashAccum = 0; }
  }

  function isRaining() { return !!_raining; }

  function _autoWeather(time) {
    if (_nextWeatherFlip === 0) {
      _nextWeatherFlip = time + Phaser.Math.Between(90000, 180000);
      return;
    }
    if (time < _nextWeatherFlip) return;
    if (_raining) {
      _raining = false; _rainAccum = 0; _splashAccum = 0;
      _nextWeatherFlip = time + Phaser.Math.Between(120000, 300000);
    } else {
      _raining = true;
      _nextWeatherFlip = time + Phaser.Math.Between(30000, 70000);
    }
  }

  function _updateDust(delta, camera) {
    if (!camera) return;
    var dt = delta / 1000;
    var left = camera.scrollX, top = camera.scrollY;
    var w = camera.width / (camera.zoom || 1), h = camera.height / (camera.zoom || 1);
    for (var i = 0; i < _motes.length; i++) {
      var m = _motes[i], p = m.p;
      if (!p) continue;
      if (!m.seeded) { p.x = left + Math.random() * w; p.y = top + Math.random() * h; m.seeded = true; }
      p.x += m.vx * dt; p.y += m.vy * dt;
      if (p.x < left) p.x = left + w; else if (p.x > left + w) p.x = left;
      if (p.y < top) p.y = top + h; else if (p.y > top + h) p.y = top;
      p.lifeCurrent = p.life = 1e12;
    }
  }

  function _updateRain(delta, camera) {
    if (!camera || !_raining) return;
    var w = camera.width / (camera.zoom || 1);
    var left = camera.scrollX, top = camera.scrollY;

    _rainAccum += RAIN_PER_SEC * (delta / 1000);
    var toSpawn = Math.floor(_rainAccum); _rainAccum -= toSpawn;
    var headroom = RAIN_MAX - _rain.alive;
    if (toSpawn > headroom) toSpawn = headroom > 0 ? headroom : 0;
    for (var i = 0; i < toSpawn; i++) {
      var x = left - 60 + Math.random() * (w + 120);
      var y = top - 20 - Math.random() * 30;
      _rain.emitParticleAt(x, y, 1);
    }

    _splashAccum += (RAIN_PER_SEC * 0.1) * (delta / 1000);
    var splashes = Math.floor(_splashAccum); _splashAccum -= splashes;
    if (splashes > 6) splashes = 6;
    var bottom = top + (camera.height / (camera.zoom || 1));
    for (var j = 0; j < splashes; j++) {
      var sx = left + Math.random() * w;
      var sy = bottom - Math.random() * 24;
      _splash.emitParticleAt(sx, sy, 1);
    }
  }

  function update(time, delta, camera) {
    if (!_ready) return;
    if (!camera && _scene && _scene.cameras) camera = _scene.cameras.main;
    if (typeof delta !== 'number' || delta < 0) delta = 16;
    if (delta > 100) delta = 100;
    _autoWeather(time || 0);
    _updateDust(delta, camera);
    _updateRain(delta, camera);
  }

  return {
    init: init, footstep: footstep, setWeather: setWeather,
    isRaining: isRaining, update: update
  };
})();

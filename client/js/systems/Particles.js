// Particles system — Terraria-style procedural particles + weather for Phaser 3.60.
// Self-contained: generates all textures procedurally (no external images), creates
// a handful of reusable emitters, and drives ambient dust + rain relative to the
// camera each frame. Weather also auto-toggles on its own; setWeather() can force it.
//
// Public API (called by the game scene):
//   Particles.init(scene)
//   Particles.mineHit(worldX, worldY, colorInt)
//   Particles.blockBreak(worldX, worldY, colorInt)
//   Particles.footstep(worldX, worldY, colorInt)
//   Particles.jump(worldX, worldY)
//   Particles.land(worldX, worldY)
//   Particles.setWeather(kind)   // 'rain' | 'none'
//   Particles.isRaining()
//   Particles.update(time, delta, camera)
var Particles = (function() {
  // --- Depth layering (world is below 50, lighting overlay is 900, HUD is DOM) ---
  var DEPTH_DUST = 50;
  var DEPTH_FX   = 110;   // mine/break/footstep bursts, above world
  var DEPTH_RAIN = 120;

  // --- Tunables ---
  var DUST_COUNT   = 26;     // number of ambient floating motes
  var RAIN_PER_SEC = 320;    // streaks spawned per second while raining
  var RAIN_MAX     = 900;    // hard cap on simultaneous active rain particles

  var _scene  = null;
  var _ready  = false;

  // Emitters (Phaser 3.60 GameObjects returned by scene.add.particles).
  var _dust   = null;        // ambient dust manager (we hand-place each mote)
  var _spark  = null;        // mine-hit sparks
  var _debris = null;        // block-break debris (has gravity)
  var _puff   = null;        // footstep / jump / land dust puffs
  var _rain   = null;        // rain streaks
  var _splash = null;        // faint ground splashes for rain (optional nicety)

  // Ambient dust bookkeeping: we manually emit + reposition a fixed pool of motes
  // so they always drift within the current camera view.
  var _motes = [];           // array of {p: particle, vx, vy}

  // Weather state.
  var _raining   = false;
  var _rainAccum = 0;        // fractional rain-spawn accumulator (particles owed)
  var _splashAccum = 0;

  // Auto-weather scheduler (ms). Picks the next event time, then flips state.
  var _nextWeatherFlip = 0;
  var _weatherForced   = false;  // true once setWeather() called externally

  // ---------------------------------------------------------------------------
  //  Texture generation (procedural — no external image dependencies)
  // ---------------------------------------------------------------------------
  function _makeTextures() {
    // Skip if already generated (init is idempotent).
    if (_scene.textures.exists('pdot')) return;

    // 4x4 white square — the workhorse, tinted per-call for dust/sparks/debris/puffs.
    var g = _scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture('pdot', 4, 4);
    g.destroy();

    // 2x2 white square — finer motes/sparks.
    var g2 = _scene.make.graphics({ x: 0, y: 0, add: false });
    g2.fillStyle(0xffffff, 1);
    g2.fillRect(0, 0, 2, 2);
    g2.generateTexture('ppixel', 2, 2);
    g2.destroy();

    // Raindrop streak — a tall thin vertical bar, soft blue-white. Tinted at use.
    var gr = _scene.make.graphics({ x: 0, y: 0, add: false });
    gr.fillStyle(0xffffff, 1);
    gr.fillRect(0, 0, 2, 12);
    gr.generateTexture('praindrop', 2, 12);
    gr.destroy();

    // Leaf — a tiny diamond, used as a soft mote/debris flake.
    var gl = _scene.make.graphics({ x: 0, y: 0, add: false });
    gl.fillStyle(0xffffff, 1);
    gl.beginPath();
    gl.moveTo(3, 0);
    gl.lineTo(6, 3);
    gl.lineTo(3, 6);
    gl.lineTo(0, 3);
    gl.closePath();
    gl.fillPath();
    gl.generateTexture('pleaf', 6, 6);
    gl.destroy();
  }

  // ---------------------------------------------------------------------------
  //  Emitter setup
  // ---------------------------------------------------------------------------
  function _makeEmitters() {
    // Ambient dust: we do NOT auto-emit; init() seeds a fixed pool and update()
    // recycles/repositions them. frequency -1 means "manual emit only".
    _dust = _scene.add.particles(0, 0, 'ppixel', {
      lifespan: 9000,
      speed: 0,
      scale: { min: 0.6, max: 1.6 },
      alpha: { start: 0, end: 0 },   // alpha is driven manually per mote
      frequency: -1,
      quantity: 0,
      tint: 0xfff4d0,
      blendMode: 'NORMAL'
    });
    _dust.setDepth(DEPTH_DUST);

    // Mine-hit sparks: short, fast, fade quickly. Manual bursts via explode().
    _spark = _scene.add.particles(0, 0, 'ppixel', {
      lifespan: { min: 180, max: 360 },
      speed: { min: 40, max: 130 },
      angle: { min: 0, max: 360 },
      gravityY: 300,
      scale: { start: 1.4, end: 0 },
      alpha: { start: 1, end: 0 },
      frequency: -1,
      quantity: 0
    });
    _spark.setDepth(DEPTH_FX);

    // Block-break debris: chunky squares with gravity so they fall and tumble.
    _debris = _scene.add.particles(0, 0, 'pdot', {
      lifespan: { min: 500, max: 1000 },
      speed: { min: 50, max: 180 },
      angle: { min: 200, max: 340 },   // bias upward/outward
      gravityY: 700,
      scale: { start: 1.5, end: 0.6 },
      alpha: { start: 1, end: 0.2 },
      rotate: { min: 0, max: 360 },
      frequency: -1,
      quantity: 0
    });
    _debris.setDepth(DEPTH_FX);

    // Dust puffs: footstep / jump / land. Soft, low, brief, slight upward drift.
    _puff = _scene.add.particles(0, 0, 'pdot', {
      lifespan: { min: 260, max: 520 },
      speed: { min: 8, max: 45 },
      angle: { min: 200, max: 340 },
      gravityY: -20,
      scale: { start: 1.2, end: 0 },
      alpha: { start: 0.55, end: 0 },
      tint: 0xcdb89a,        // default dust tan; recolored per-call via setParticleTint
      frequency: -1,
      quantity: 0
    });
    _puff.setDepth(DEPTH_FX);

    // Rain: tall streaks falling fast with slight wind. Manual per-frame emit.
    _rain = _scene.add.particles(0, 0, 'praindrop', {
      lifespan: 1400,
      speedX: { min: -70, max: -30 },   // wind blows left
      speedY: { min: 600, max: 800 },
      scaleX: 1,
      scaleY: { min: 0.8, max: 1.3 },
      alpha: { start: 0.5, end: 0.0 },
      tint: 0xaecbff,
      frequency: -1,
      quantity: 0
    });
    _rain.setDepth(DEPTH_RAIN);

    // Rain splashes: faint quick flicks where drops "land" (purely cosmetic).
    _splash = _scene.add.particles(0, 0, 'ppixel', {
      lifespan: { min: 160, max: 300 },
      speedX: { min: -40, max: 40 },
      speedY: { min: -120, max: -40 },
      gravityY: 500,
      scale: { start: 1.1, end: 0 },
      alpha: { start: 0.4, end: 0 },
      tint: 0xc7dcff,
      frequency: -1,
      quantity: 0
    });
    _splash.setDepth(DEPTH_RAIN);
  }

  // ---------------------------------------------------------------------------
  //  Ambient dust seeding — create a fixed pool of long-lived motes.
  // ---------------------------------------------------------------------------
  function _seedDust() {
    _motes.length = 0;
    for (var i = 0; i < DUST_COUNT; i++) {
      // emitParticleAt returns the spawned Particle in 3.60.
      var p = _dust.emitParticleAt(0, 0, 1);
      if (!p) continue;
      // Make each mote effectively immortal; we recycle position/alpha ourselves.
      p.lifeCurrent = p.life = 1e12;
      p.alpha = 0.12 + Math.random() * 0.18;
      p.scaleX = p.scaleY = 0.6 + Math.random() * 1.0;
      _motes.push({
        p: p,
        vx: (Math.random() * 2 - 1) * 6,   // gentle horizontal drift (px/s)
        vy: (Math.random() * 2 - 1) * 4,   // gentle vertical drift
        seeded: false
      });
    }
  }

  // ---------------------------------------------------------------------------
  //  Public: init
  // ---------------------------------------------------------------------------
  function init(scene) {
    if (!scene) return;
    _scene = scene;
    _makeTextures();
    _makeEmitters();
    _seedDust();
    _raining = false;
    _weatherForced = false;
    // First auto-weather check a few minutes out.
    _nextWeatherFlip = 0; // set lazily on first update() once we have a clock
    _ready = true;
  }

  // ---------------------------------------------------------------------------
  //  Public: one-shot bursts
  // ---------------------------------------------------------------------------
  function mineHit(worldX, worldY, colorInt) {
    if (!_ready) return;
    var tint = (typeof colorInt === 'number') ? colorInt : 0xffe08a;
    _spark.setParticleTint(tint);
    _spark.explode(Phaser.Math.Between(3, 6), worldX, worldY);
  }

  function blockBreak(worldX, worldY, colorInt) {
    if (!_ready) return;
    var tint = (typeof colorInt === 'number') ? colorInt : 0xb08040;
    _debris.setParticleTint(tint);
    _debris.explode(Phaser.Math.Between(10, 14), worldX, worldY);
    // A few brighter sparks on top for a satisfying pop.
    _spark.setParticleTint(0xffffff);
    _spark.explode(Phaser.Math.Between(3, 5), worldX, worldY);
  }

  function footstep(worldX, worldY, colorInt) {
    if (!_ready) return;
    var tint = (typeof colorInt === 'number') ? colorInt : 0xb9a07e;
    _puff.setParticleTint(tint);
    _puff.explode(Phaser.Math.Between(2, 4), worldX, worldY);
  }

  function jump(worldX, worldY) {
    if (!_ready) return;
    _puff.setParticleTint(0xddd0b4);
    _puff.explode(Phaser.Math.Between(4, 7), worldX, worldY);
  }

  function land(worldX, worldY) {
    if (!_ready) return;
    _puff.setParticleTint(0xddd0b4);
    // Wider, lower puff for a heavier "thud" feel.
    _puff.explode(Phaser.Math.Between(6, 10), worldX, worldY);
  }

  // ---------------------------------------------------------------------------
  //  Public: weather control
  // ---------------------------------------------------------------------------
  function setWeather(kind) {
    if (!_ready) return;
    var wantRain = (kind === 'rain');
    _weatherForced = true;
    _raining = wantRain;
    if (!wantRain) {
      _rainAccum = 0;
      _splashAccum = 0;
    }
  }

  function isRaining() {
    return !!_raining;
  }

  // ---------------------------------------------------------------------------
  //  Auto-weather scheduler — start rain for 30-70s every few minutes, then clear.
  // ---------------------------------------------------------------------------
  function _autoWeather(time) {
    // Don't fight an externally-forced state for one cycle, but still keep the
    // scheduler alive so natural weather resumes later.
    if (_nextWeatherFlip === 0) {
      // First scheduling: wait a couple minutes before the first natural rain.
      _nextWeatherFlip = time + Phaser.Math.Between(120000, 240000);
      return;
    }
    if (time < _nextWeatherFlip) return;

    if (_raining) {
      // End the storm, then wait a few minutes before the next one.
      _raining = false;
      _rainAccum = 0;
      _splashAccum = 0;
      _nextWeatherFlip = time + Phaser.Math.Between(150000, 360000);
    } else {
      // Start a storm lasting 30-70s.
      _raining = true;
      _nextWeatherFlip = time + Phaser.Math.Between(30000, 70000);
    }
    // A natural flip overrides any prior forced state.
    _weatherForced = false;
  }

  // ---------------------------------------------------------------------------
  //  Ambient dust drift — keep motes wrapping within the camera viewport.
  // ---------------------------------------------------------------------------
  function _updateDust(delta, camera) {
    if (!camera) return;
    var dt = delta / 1000;
    var left = camera.scrollX;
    var top = camera.scrollY;
    var w = camera.width / (camera.zoom || 1);
    var h = camera.height / (camera.zoom || 1);

    for (var i = 0; i < _motes.length; i++) {
      var m = _motes[i];
      var p = m.p;
      if (!p) continue;

      // Seed initial position randomly across the first visible viewport.
      if (!m.seeded) {
        p.x = left + Math.random() * w;
        p.y = top + Math.random() * h;
        m.seeded = true;
      }

      p.x += m.vx * dt;
      p.y += m.vy * dt;

      // Wrap around the moving viewport so dust always surrounds the player.
      if (p.x < left)      p.x = left + w;
      else if (p.x > left + w) p.x = left;
      if (p.y < top)       p.y = top + h;
      else if (p.y > top + h)  p.y = top;

      // Keep them alive forever (counter the manager decrementing life).
      p.lifeCurrent = p.life = 1e12;
    }
  }

  // ---------------------------------------------------------------------------
  //  Rain driver — spawn streaks above the camera spanning its width.
  // ---------------------------------------------------------------------------
  function _updateRain(delta, camera) {
    if (!camera) return;
    if (!_raining) return;

    var w = camera.width / (camera.zoom || 1);
    var left = camera.scrollX;
    var top = camera.scrollY;

    // Accumulate fractional spawns so the rate is frame-rate independent.
    _rainAccum += RAIN_PER_SEC * (delta / 1000);
    var toSpawn = Math.floor(_rainAccum);
    _rainAccum -= toSpawn;

    // Respect the active-particle cap for performance.
    var headroom = RAIN_MAX - _rain.alive;
    if (toSpawn > headroom) toSpawn = headroom > 0 ? headroom : 0;

    for (var i = 0; i < toSpawn; i++) {
      // Spawn a bit wider than the view so wind-blown drops still cover edges,
      // starting just above the camera top.
      var x = left - 60 + Math.random() * (w + 120);
      var y = top - 20 - Math.random() * 30;
      _rain.emitParticleAt(x, y, 1);
    }

    // Faint ground splashes scattered across the visible bottom (cosmetic).
    _splashAccum += (RAIN_PER_SEC * 0.12) * (delta / 1000);
    var splashes = Math.floor(_splashAccum);
    _splashAccum -= splashes;
    if (splashes > 6) splashes = 6;
    var bottom = top + (camera.height / (camera.zoom || 1));
    for (var j = 0; j < splashes; j++) {
      var sx = left + Math.random() * w;
      var sy = bottom - Math.random() * 24;
      _splash.emitParticleAt(sx, sy, 1);
    }
  }

  // ---------------------------------------------------------------------------
  //  Public: per-frame update
  // ---------------------------------------------------------------------------
  function update(time, delta, camera) {
    if (!_ready) return;
    if (!camera && _scene && _scene.cameras) camera = _scene.cameras.main;
    if (typeof delta !== 'number' || delta < 0) delta = 16;
    if (delta > 100) delta = 100; // clamp huge frame gaps (tab refocus etc.)

    _autoWeather(time || 0);
    _updateDust(delta, camera);
    _updateRain(delta, camera);
  }

  return {
    init: init,
    mineHit: mineHit,
    blockBreak: blockBreak,
    footstep: footstep,
    jump: jump,
    land: land,
    setWeather: setWeather,
    isRaining: isRaining,
    update: update
  };
})();

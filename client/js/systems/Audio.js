// Audio system — Web Audio API singleton (ES5 IIFE, no dependencies)
// Phases: 1 Foundation · 2 BGM/Ambience · 3 Gameplay SFX · 4 UI · 5 Mixing/Ducking
var Audio = (function() {
  'use strict';

  // ─── Private state ──────────────────────────────────────────────────────────

  var _ctx        = null;
  var _masterGain = null;
  var _bgmGain    = null;
  var _ambiGain   = null;
  var _sfxGain    = null;
  var _uiGain     = null;

  // Volume levels (0..1), persisted to localStorage
  var _masterVol = 1.0;
  var _bgmVol    = 0.6;
  var _ambiVol   = 0.4;
  var _sfxVol    = 0.8;
  var _uiVol     = 0.7;

  // Buffer cache: filename → AudioBuffer (null = load failed, don't retry)
  var _buffers = {};
  var _pending = {};   // filename → Promise, deduplicates concurrent fetches

  // BGM crossfade: two slots for the outgoing and incoming track
  var _bgmSlot    = null;   // { source, gain } currently active
  var _bgmCurrent = null;   // filename of playing track (guard against repeat calls)
  var _bgmPhase   = null;   // last DayNight phase seen (drives auto-switching)

  // Ambience layer
  var _ambiSlot    = null;
  var _ambiCurrent = null;

  // SFX object pool — Phase 1 requirement
  var POOL_SIZE = 8;
  var _pool = [];

  // Ducking constants — Phase 5
  var DUCK_DIP     = 0.25;   // BGM/ambi drop to 25% of normal during duck
  var DUCK_HOLD_MS = 300;
  var CROSSFADE_S  = 2.0;
  var _duckTimer   = null;

  // UI listener state
  var _uiObserver = null;
  var _unlocked   = false;
  var _ready      = false;

  // ─── Phase 1: Build the gain graph ─────────────────────────────────────────

  function _buildGraph() {
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = _masterVol;
    _masterGain.connect(_ctx.destination);

    _bgmGain  = _ctx.createGain(); _bgmGain.gain.value  = _bgmVol;
    _ambiGain = _ctx.createGain(); _ambiGain.gain.value = _ambiVol;
    _sfxGain  = _ctx.createGain(); _sfxGain.gain.value  = _sfxVol;
    _uiGain   = _ctx.createGain(); _uiGain.gain.value   = _uiVol;

    _bgmGain.connect(_masterGain);
    _ambiGain.connect(_masterGain);
    _sfxGain.connect(_masterGain);
    _uiGain.connect(_masterGain);

    for (var i = 0; i < POOL_SIZE; i++) {
      _pool.push({ source: null, startedAt: 0, inUse: false });
    }
  }

  // ─── Buffer loading (cached, graceful on missing files) ────────────────────

  function _getBuffer(name) {
    if (name in _buffers) return Promise.resolve(_buffers[name]);
    if (_pending[name])  return _pending[name];

    _pending[name] = fetch('/audio/' + name)
      .then(function(r) {
        if (!r.ok) throw new Error(r.status);
        return r.arrayBuffer();
      })
      .then(function(ab) { return _ctx.decodeAudioData(ab); })
      .then(function(buf) {
        _buffers[name] = buf;
        delete _pending[name];
        return buf;
      })
      .catch(function(e) {
        console.warn('[Audio] ' + name + ' not loaded (' + e.message + ')');
        _buffers[name] = null;   // cache failure so we never retry
        delete _pending[name];
        return null;
      });

    return _pending[name];
  }

  // ─── Phase 1: SFX object pool ──────────────────────────────────────────────

  function _playSFXBuffer(buf, opts) {
    if (!buf || !_ctx) return;
    opts = opts || {};

    // Grab a free slot, or steal the oldest running one
    var slot = null;
    var oldestTime = Infinity;
    var oldestSlot = null;
    for (var i = 0; i < _pool.length; i++) {
      var s = _pool[i];
      if (!s.inUse) { slot = s; break; }
      if (s.startedAt < oldestTime) { oldestTime = s.startedAt; oldestSlot = s; }
    }
    if (!slot) {
      if (oldestSlot && oldestSlot.source) { try { oldestSlot.source.stop(); } catch(e) {} }
      if (oldestSlot) oldestSlot.inUse = false;
      slot = oldestSlot;
    }
    if (!slot) return;

    var src = _ctx.createBufferSource();
    src.buffer = buf;
    // Phase 3: pitch randomization prevents auditory fatigue on repetitive sounds
    src.playbackRate.value = 1.0 + (Math.random() - 0.5) * (opts.pitchVariance || 0);

    var vol = _ctx.createGain();
    vol.gain.value = (opts.volume !== undefined) ? opts.volume : 1.0;
    src.connect(vol);
    vol.connect(_sfxGain);

    slot.source    = src;
    slot.startedAt = _ctx.currentTime;
    slot.inUse     = true;
    src.onended = (function(sl) { return function() { sl.inUse = false; sl.source = null; }; })(slot);
    src.start();

    // Phase 5: high-priority SFX ducks BGM/ambience
    if (opts.priority === 'high') _duck();
  }

  // ─── Phase 5: Audio ducking ─────────────────────────────────────────────────

  function _duck() {
    if (!_ctx) return;
    var t = _ctx.currentTime;
    _bgmGain.gain.cancelScheduledValues(t);
    _ambiGain.gain.cancelScheduledValues(t);
    _bgmGain.gain.setTargetAtTime(_bgmVol * DUCK_DIP,   t, 0.05);
    _ambiGain.gain.setTargetAtTime(_ambiVol * DUCK_DIP,  t, 0.05);
    clearTimeout(_duckTimer);
    _duckTimer = setTimeout(_unduck, DUCK_HOLD_MS);
  }

  function _unduck() {
    if (!_ctx) return;
    var t = _ctx.currentTime;
    _bgmGain.gain.setTargetAtTime(_bgmVol,  t, 0.4);
    _ambiGain.gain.setTargetAtTime(_ambiVol, t, 0.4);
  }

  // ─── Phase 2: Looping sources with crossfade ────────────────────────────────

  function _startLoop(buf, busGain) {
    var src = _ctx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;
    var localGain = _ctx.createGain();
    localGain.gain.setValueAtTime(0, _ctx.currentTime);
    localGain.gain.linearRampToValueAtTime(1.0, _ctx.currentTime + CROSSFADE_S);
    src.connect(localGain);
    localGain.connect(busGain);
    src.start();
    return { source: src, gain: localGain };
  }

  function _fadeOutLoop(slot) {
    if (!slot || !_ctx) return;
    var src = slot.source;
    slot.gain.gain.setTargetAtTime(0, _ctx.currentTime, CROSSFADE_S / 3);
    setTimeout(function() { try { src.stop(); } catch(e) {} }, CROSSFADE_S * 1000 + 50);
  }

  // ─── Phase 4: UI hover/click sounds ────────────────────────────────────────

  function _playUIBuf(name) {
    if (!_ctx || !_unlocked) return;
    _getBuffer(name).then(function(buf) {
      if (!buf) return;
      var src = _ctx.createBufferSource();
      src.buffer = buf;
      src.connect(_uiGain);
      src.start();
    });
  }

  function _wireEl(el) {
    if (el._audioWired) return;
    el._audioWired = true;
    // Phase 4: UI audio is on uiGain (separate from game audio — never ducked)
    el.addEventListener('mouseenter', function() { _playUIBuf('ui_hover.ogg'); });
    el.addEventListener('click',      function() { _playUIBuf('ui_click.ogg'); });
  }

  function _attachUIListeners() {
    document.querySelectorAll('button, [role="button"]').forEach(_wireEl);
    if (_uiObserver) return;
    // MutationObserver catches dynamically-added buttons (char select, lobby list)
    _uiObserver = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(n) {
          if (!n.querySelectorAll) return;
          n.querySelectorAll('button').forEach(_wireEl);
          if (n.tagName === 'BUTTON') _wireEl(n);
        });
      });
    });
    _uiObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Phase 5: Settings persistence ─────────────────────────────────────────

  function _loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem('agarcity_audio') || '{}');
      if (p.master !== undefined) _masterVol = +p.master;
      if (p.bgm    !== undefined) _bgmVol    = +p.bgm;
      if (p.sfx    !== undefined) _sfxVol    = +p.sfx;
      if (p.ui     !== undefined) _uiVol     = +p.ui;
      if (p.ambi   !== undefined) _ambiVol   = +p.ambi;
    } catch(e) {}
  }

  function _savePrefs() {
    try {
      localStorage.setItem('agarcity_audio', JSON.stringify({
        master: _masterVol, bgm: _bgmVol, sfx: _sfxVol, ui: _uiVol, ambi: _ambiVol
      }));
    } catch(e) {}
  }

  // ─── AudioContext unlock (browser autoplay policy) ──────────────────────────

  function _unlock() {
    if (_unlocked) return;
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) {
      console.warn('[Audio] Web Audio API unavailable:', e);
      return;
    }
    _loadPrefs();
    _buildGraph();
    _unlocked = true;
    if (_ctx.state === 'suspended') _ctx.resume();
    _attachUIListeners();
    document.removeEventListener('click',   _unlock, true);
    document.removeEventListener('keydown', _unlock, true);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  // Phase 1: called from GameScene.create()
  function init() {
    _ready = true;
    document.addEventListener('click',   _unlock, true);
    document.addEventListener('keydown', _unlock, true);
  }

  // Phase 2: called every frame from GameScene.update()
  function update(dt) {
    if (!_unlocked) return;

    // BGM: auto-switch track when day/night phase changes
    if (window.DayNight) {
      var phase = DayNight.getPhase();
      if (phase !== _bgmPhase) {
        _bgmPhase = phase;
        var track = (phase === 'night') ? 'bgm_night.ogg'
                  : (phase === 'dusk' || phase === 'dawn') ? 'bgm_dusk.ogg'
                  : 'bgm_day.ogg';
        playBGM(track);
      }
    }

    // Ambience: switch between rain and city ambience in sync with Particles weather
    if (window.Particles) {
      var ambi = Particles.isRaining() ? 'ambi_rain.ogg' : 'ambi_city.ogg';
      if (ambi !== _ambiCurrent) _playAmbience(ambi);
    }
  }

  // Phase 3: one-shot SFX from the object pool
  function playSFX(name, opts) {
    if (!_unlocked) return;
    _getBuffer(name).then(function(buf) { _playSFXBuffer(buf, opts); });
  }

  // Phase 2: looping BGM with crossfade
  function playBGM(name) {
    if (!_unlocked || name === _bgmCurrent) return;
    _bgmCurrent = name;
    _getBuffer(name).then(function(buf) {
      if (!buf) return;
      _fadeOutLoop(_bgmSlot);
      _bgmSlot = _startLoop(buf, _bgmGain);
    });
  }

  function stopBGM() {
    _fadeOutLoop(_bgmSlot);
    _bgmSlot = null;
    _bgmCurrent = null;
  }

  // Phase 2: independent ambient layer
  function _playAmbience(name) {
    if (!_unlocked) return;
    _ambiCurrent = name;
    _getBuffer(name).then(function(buf) {
      if (!buf) return;
      _fadeOutLoop(_ambiSlot);
      _ambiSlot = _startLoop(buf, _ambiGain);
    });
  }

  // Phase 4: UI one-shots (time-scale-independent — routed through uiGain only)
  function playUI(name) { _playUIBuf(name); }

  // Phase 5: volume setters — link these to player settings sliders
  function setMasterVolume(v) {
    _masterVol = Math.max(0, Math.min(1, +v));
    if (_ctx) _masterGain.gain.setTargetAtTime(_masterVol, _ctx.currentTime, 0.02);
    _savePrefs();
  }
  function setBGMVolume(v) {
    _bgmVol = Math.max(0, Math.min(1, +v));
    if (_ctx) _bgmGain.gain.setTargetAtTime(_bgmVol, _ctx.currentTime, 0.02);
    _savePrefs();
  }
  function setSFXVolume(v) {
    _sfxVol = Math.max(0, Math.min(1, +v));
    if (_ctx) _sfxGain.gain.setTargetAtTime(_sfxVol, _ctx.currentTime, 0.02);
    _savePrefs();
  }
  function setUIVolume(v) {
    _uiVol = Math.max(0, Math.min(1, +v));
    if (_ctx) _uiGain.gain.setTargetAtTime(_uiVol, _ctx.currentTime, 0.02);
    _savePrefs();
  }
  function setAmbienceVolume(v) {
    _ambiVol = Math.max(0, Math.min(1, +v));
    if (_ctx) _ambiGain.gain.setTargetAtTime(_ambiVol, _ctx.currentTime, 0.02);
    _savePrefs();
  }

  return {
    init: init, update: update,
    playSFX: playSFX, playBGM: playBGM, stopBGM: stopBGM, playUI: playUI,
    setMasterVolume: setMasterVolume, setBGMVolume: setBGMVolume,
    setSFXVolume: setSFXVolume, setUIVolume: setUIVolume, setAmbienceVolume: setAmbienceVolume,
  };
})();

// Job and food store interaction system
var JobSystem = (function() {
  var _activeJob = null;
  var _onUpdate = null;
  var _qteActive   = false;
  var _qteKey      = null;
  var _qteStart    = 0;
  var _qteWindowMs = 1500;
  var _qteRafId    = null;

  function init(onUpdate) {
    _onUpdate = onUpdate;

    SC.on('job_started', function(d) {
      _activeJob = { startTime: Date.now(), duration: d.duration, name: d.name,
                     tokensReward: d.tokensReward, xpReward: d.xpReward };
      _showProgress(d);
    });

    SC.on('job_complete', function(d) {
      _cancelQteAnimation();
      _hideQteOverlay();
      _activeJob = null;
      _hideProgress();
      _showReward(d);
      if (_onUpdate) _onUpdate({ type: 'job_complete', data: d });
    });

    SC.on('job_cancelled', function() {
      _cancelQteAnimation();
      _hideQteOverlay();
      _activeJob = null;
      _hideProgress();
      _hidePrompt();
    });

    SC.on('food_bought', function(d) {
      if (_onUpdate) _onUpdate({ type: 'food_bought', data: d });
    });

    SC.on('qte_prompt', function(d) {
      _startQte(d.key, d.windowMs || 1500);
    });

    SC.on('qte_result', function(d) {
      _cancelQteAnimation();
      if (d.outcome === 'success') {
        _showQteFeedback('✓', '#8fd46a');
        _flashBonus();
      } else {
        _showQteFeedback('✗', '#e74c3c');
      }
    });

    document.addEventListener('keydown', _handleQteKey);
  }

  // Called every frame from GameScene.update — returns the nearby zone or null
  function update(px, py, eJustPressed, playerSpec) {
    if (_activeJob) {
      // Update progress bar
      var elapsed = (Date.now() - _activeJob.startTime) / 1000;
      var pct = Math.min(100, (elapsed / _activeJob.duration) * 100);
      var fillEl = document.getElementById('job-progress-fill');
      if (fillEl) fillEl.style.width = pct + '%';
      var timeEl = document.getElementById('job-time-left');
      if (timeEl) timeEl.textContent = Math.max(0, Math.ceil(_activeJob.duration - elapsed)) + 's';
      return null;
    }

    // Check job zones
    var zones = CFG.JOB_ZONES || [];
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      var dx = px - z.x, dy = py - z.y;
      if (Math.sqrt(dx*dx + dy*dy) <= z.radius) {
        var eligible = z.spec === 'ANY' || z.spec === playerSpec;
        _showJobPrompt(z, eligible);
        if (eJustPressed && eligible) {
          SC.emit('start_job', { zoneId: z.id, zoneSpec: z.spec });
        } else if (eJustPressed && !eligible) {
          _flashError('Needs ' + z.spec + ' specialization');
        }
        return z;
      }
    }

    // Check food stores
    var stores = CFG.FOOD_STORES || [];
    for (var i = 0; i < stores.length; i++) {
      var s = stores[i];
      var dx = px - s.x, dy = py - s.y;
      if (Math.sqrt(dx*dx + dy*dy) <= s.radius) {
        _showFoodPrompt(s);
        if (eJustPressed) {
          SC.emit('buy_food', { cost: s.cost, restore: s.restore });
        }
        return s;
      }
    }

    _hidePrompt();
    return null;
  }

  function _showJobPrompt(zone, eligible) {
    var el = document.getElementById('interaction-prompt');
    if (!el) return;
    var specCol = _specColor(zone.spec);
    el.innerHTML =
      '<div class="ip-key">E</div>' +
      '<div class="ip-text">' +
        '<div class="ip-label" style="color:' + specCol + '">' + zone.label + '</div>' +
        '<div class="ip-rewards">' +
          (eligible ? '' : '<span style="color:#e74c3c">⚠ ' + zone.spec + ' only · </span>') +
          '+' + zone.reward + ' 💰 &nbsp; +' + zone.xp + ' XP &nbsp; ⏱ ' + zone.duration + 's' +
        '</div>' +
      '</div>';
    el.style.display = 'flex';
    el.style.opacity = eligible ? '1' : '0.6';
  }

  function _showFoodPrompt(store) {
    var el = document.getElementById('interaction-prompt');
    if (!el) return;
    el.innerHTML =
      '<div class="ip-key">E</div>' +
      '<div class="ip-text">' +
        '<div class="ip-label" style="color:#f39c12">' + store.name + '</div>' +
        '<div class="ip-rewards">-' + store.cost + ' 💰 &nbsp; 🍎 +' + store.restore + ' food</div>' +
      '</div>';
    el.style.display = 'flex';
    el.style.opacity = '1';
  }

  function _hidePrompt() {
    var el = document.getElementById('interaction-prompt');
    if (el) el.style.display = 'none';
  }

  function _showProgress(d) {
    _hidePrompt();
    var el = document.getElementById('job-progress-overlay');
    if (!el) return;
    document.getElementById('job-progress-name').textContent = d.name;
    document.getElementById('job-progress-fill').style.width = '0%';
    document.getElementById('job-time-left').textContent = d.duration + 's';
    el.style.display = 'flex';
  }

  function _hideProgress() {
    var el = document.getElementById('job-progress-overlay');
    if (el) el.style.display = 'none';
  }

  function _showReward(d) {
    var el = document.getElementById('reward-popup');
    if (!el) return;
    var tierUp = d.tierUp ? ' <span style="color:#ffd700">⬆ TIER UP!</span>' : '';
    el.innerHTML = '💰 +' + d.tokensEarned + ' tokens &nbsp; ⭐ +' + d.xpEarned + ' XP' + tierUp;
    el.style.display = 'block';
    el.style.animation = 'none';
    void el.offsetWidth; // reflow
    el.style.animation = 'rewardPop 3s ease forwards';
  }

  function _flashError(msg) {
    var el = document.getElementById('reward-popup');
    if (!el) return;
    el.innerHTML = '⚠ ' + msg;
    el.style.color = '#e74c3c';
    el.style.display = 'block';
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'rewardPop 2s ease forwards';
    setTimeout(function() { el.style.color = '#ffd700'; }, 2500);
  }

  function _specColor(spec) {
    var map = { TECH:'#3498db', MEDICAL:'#e74c3c', FOOD_SERVICE:'#f39c12',
                TRADES:'#95a5a6', BUSINESS:'#2ecc71', ARTS:'#9b59b6', ANY:'#ffd700' };
    return map[spec] || '#fff';
  }

  function isWorking() { return _activeJob !== null; }

  function _startQte(key, windowMs) {
    _qteActive   = true;
    _qteKey      = key;
    _qteStart    = Date.now();
    _qteWindowMs = windowMs;

    var overlay  = document.getElementById('qte-overlay');
    var keyLabel = document.getElementById('qte-key-label');
    if (!overlay) return;
    overlay.style.display = 'flex';

    var displayMap = { UP: '▲', DOWN: '▼', LEFT: '◄', RIGHT: '►' };
    if (keyLabel) keyLabel.textContent = displayMap[key] || key;

    _animateRing();
  }

  function _animateRing() {
    var canvas = document.getElementById('qte-ring-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var cx = W / 2, cy = H / 2, radius = 50;

    function draw() {
      var elapsed = Date.now() - _qteStart;
      var t = Math.max(0, 1 - elapsed / _qteWindowMs);

      ctx.clearRect(0, 0, W, H);

      // Background ring
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#2a1a0c';
      ctx.lineWidth = 8;
      ctx.stroke();

      // Shrinking progress arc (green to red as time runs out)
      if (t > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
        var r = Math.floor(255 * (1 - t));
        var g = Math.floor(180 * t);
        ctx.strokeStyle = 'rgb(' + r + ',' + g + ',50)';
        ctx.lineWidth = 8;
        ctx.stroke();
      }

      if (_qteActive && elapsed < _qteWindowMs) {
        _qteRafId = requestAnimationFrame(draw);
      } else {
        _cancelQteAnimation();
        _hideQteOverlay();
      }
    }

    _qteRafId = requestAnimationFrame(draw);
  }

  function _cancelQteAnimation() {
    _qteActive = false;
    _qteKey    = null;
    if (_qteRafId) { cancelAnimationFrame(_qteRafId); _qteRafId = null; }
  }

  function _hideQteOverlay() {
    var el = document.getElementById('qte-overlay');
    if (el) el.style.display = 'none';
  }

  function _handleQteKey(e) {
    if (!_qteActive) return;

    var keyMap = {
      'ArrowUp': 'UP', 'ArrowDown': 'DOWN', 'ArrowLeft': 'LEFT', 'ArrowRight': 'RIGHT',
      'w': 'UP', 's': 'DOWN', 'a': 'LEFT', 'd': 'RIGHT',
      'W': 'UP', 'S': 'DOWN', 'A': 'LEFT', 'D': 'RIGHT',
    };
    var normalized = keyMap[e.key];
    if (!normalized) return;

    e.preventDefault();
    e.stopPropagation();
    _cancelQteAnimation();
    _hideQteOverlay();
    SC.emit('qte_respond', { key: normalized });
  }

  function _showQteFeedback(symbol, color) {
    var el = document.getElementById('qte-feedback');
    if (!el) return;
    el.textContent = symbol;
    el.style.color = color;
    el.style.display = 'block';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function() { el.style.display = 'none'; }, 800);
  }

  function _flashBonus() {
    var el = document.getElementById('qte-bonus-popup');
    if (!el) return;
    el.textContent = '+10% Token Bonus!';
    el.style.display = 'block';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function() { el.style.display = 'none'; }, 2000);
  }

  return { init: init, update: update, isWorking: isWorking };
})();

// Job and food store interaction system
var JobSystem = (function() {
  var _activeJob = null;
  var _onUpdate = null;

  function init(onUpdate) {
    _onUpdate = onUpdate;

    SC.on('job_started', function(d) {
      _activeJob = { startTime: Date.now(), duration: d.duration, name: d.name,
                     tokensReward: d.tokensReward, xpReward: d.xpReward };
      _showProgress(d);
    });

    SC.on('job_complete', function(d) {
      _activeJob = null;
      _hideProgress();
      _showReward(d);
      if (_onUpdate) _onUpdate({ type: 'job_complete', data: d });
    });

    SC.on('job_cancelled', function() {
      _activeJob = null;
      _hideProgress();
      _hidePrompt();
    });

    SC.on('food_bought', function(d) {
      if (_onUpdate) _onUpdate({ type: 'food_bought', data: d });
    });
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

  return { init: init, update: update, isWorking: isWorking };
})();

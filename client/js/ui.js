// Screen and UI manager
var UI = (function() {
  var currentScreen = 'start';
  var myInfo = null;  // { playerId, saveCode, player, lobbyCode }
  var selectedChar = 0;
  var selectedSpec = 'TECH';
  var isHost = false;

  // Avatar rendering from the new per-character sprite strips
  // (assets/chars/<name>.png — 14 frames, magenta #FF00FF background).
  // We lazily load each strip, chroma-key frame 0, cache it, and draw the
  // head region as a headshot. Caches keyed by character index.
  var _stripImg = {};        // charIdx -> Image
  var _stripFrame0 = {};     // charIdx -> offscreen canvas (frame 0, transparent bg)

  function _getFrame0(charIdx, cb) {
    if (_stripFrame0[charIdx]) { cb(_stripFrame0[charIdx]); return; }

    var img = _stripImg[charIdx];
    if (!img) {
      img = new Image();
      img.src = '/assets/chars/' + (CFG.CHAR_FILES[charIdx] || 'knight') + '.png';
      _stripImg[charIdx] = img;
    }
    if (!img.complete || img.naturalWidth === 0) {
      img.addEventListener('load', function() { _getFrame0(charIdx, cb); }, { once: true });
      img.addEventListener('error', function() { /* strip missing — skip */ }, { once: true });
      return;
    }

    // Detect layout: 8-col x 3-row grid (h > w/4) or 14-frame horizontal strip.
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var COLS = (ih > iw / 4) ? 8 : 14;
    var fw = Math.floor(iw / COLS);
    var fh = (COLS === 8) ? Math.floor(ih / 3) : ih;

    // Extract only frame 0 (top-left cell) into an offscreen canvas.
    var off = document.createElement('canvas');
    off.width = fw;
    off.height = fh;
    var octx = off.getContext('2d');
    octx.drawImage(img, 0, 0, fw, fh, 0, 0, fw, fh);

    // Chroma-key magenta (#FF00FF): R high, G low, B high
    var d = octx.getImageData(0, 0, fw, fh);
    var p = d.data;
    for (var i = 0; i < p.length; i += 4) {
      if (p[i] > 180 && p[i+1] < 80 && p[i+2] > 180) p[i+3] = 0;
    }
    octx.putImageData(d, 0, 0);

    _stripFrame0[charIdx] = off;
    cb(off);
  }

  function drawAvatarOnCanvas(canvas, charIdx) {
    _getFrame0(charIdx, function(frame) {
      canvas.width = canvas.width;  // clear
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Square crop: 10% margin on each side, yields a portrait of head + upper body.
      // Empirically matches character bounds (knight: x 35-287, y 52-511 in 352x512 frame).
      var fw = frame.width, fh = frame.height;
      var sx = Math.floor(fw * 0.10);
      var sy = Math.floor(fh * 0.10);
      var sw = Math.floor(fw * 0.72);
      ctx.drawImage(frame, sx, sy, sw, sw, 0, 0, canvas.width, canvas.height);
    });
  }

  function show(screen) {
    ['start','lobby','charselect','game'].forEach(function(s) {
      var el = document.getElementById('screen-' + s);
      if (el) el.style.display = (s === screen) ? 'flex' : 'none';
    });
    currentScreen = screen;

    if (screen === 'game') {
      document.getElementById('hud').style.display = 'flex';
      // Focus the Phaser canvas so keyboard input (WASD/arrows) works
      setTimeout(function() {
        var canvas = document.querySelector('#game-canvas canvas');
        if (canvas) {
          canvas.setAttribute('tabindex', '0');
          canvas.focus();
        }
      }, 100);
    } else {
      document.getElementById('hud').style.display = 'none';
    }
  }

  function showError(msg) {
    var el = document.getElementById('error-msg');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    setTimeout(function() { if (el) el.style.display = 'none'; }, 4000);
  }

  function _getName() {
    return document.getElementById('input-name').value.trim();
  }

  function _getSaveCode() {
    return document.getElementById('input-savecode').value.trim() || null;
  }

  function init() {
    // Solo play
    document.getElementById('btn-solo').addEventListener('click', function() {
      var name = _getName();
      if (!name) { showError('Enter your name first.'); return; }
      SC.emit('create_lobby', { username: name, saveCode: _getSaveCode(), soloMode: true });
    });

    // Create multiplayer lobby
    document.getElementById('btn-create').addEventListener('click', function() {
      var name = _getName();
      if (!name) { showError('Enter your name first.'); return; }
      SC.emit('create_lobby', { username: name, saveCode: _getSaveCode(), soloMode: false });
    });

    // Join existing lobby
    document.getElementById('btn-join').addEventListener('click', function() {
      var name = _getName();
      var code = document.getElementById('input-lobbycode').value.trim();
      if (!name) { showError('Enter your name first.'); return; }
      if (!code) { showError('Enter a lobby code.'); return; }
      SC.emit('join_lobby', { username: name, saveCode: _getSaveCode(), code: code });
    });

    // Auto-fill from localStorage
    var saved = localStorage.getItem('agarcity_save');
    if (saved) {
      try {
        var data = JSON.parse(saved);
        if (data.saveCode) document.getElementById('input-savecode').value = data.saveCode;
        if (data.username) document.getElementById('input-name').value = data.username;
      } catch(e) {}
    }

    // Lobby screen
    document.getElementById('btn-start-game').addEventListener('click', function() {
      SC.emit('start_game');
    });

    document.getElementById('btn-copy-code').addEventListener('click', function() {
      var code = document.getElementById('lobby-code').textContent;
      navigator.clipboard.writeText(code).then(function() {
        document.getElementById('btn-copy-code').textContent = 'Copied!';
        setTimeout(function() {
          document.getElementById('btn-copy-code').textContent = 'Copy Code';
        }, 1500);
      });
    });

    // Char select
    buildCharSelect();

    document.getElementById('btn-enter-game').addEventListener('click', function() {
      // GameScene._doStart emits player_ready once the scene is ready —
      // don't emit here too (avoids double-init / teleport on the server).
      show('game');
      if (window.startPhaserGame) {
        window.startPhaserGame({
          characterId: selectedChar,
          specialization: selectedSpec,
          player: myInfo && myInfo.player,
        });
      }
    });

    // Socket events
    SC.on('error', function(d) { showError(d.message || 'Something went wrong.'); });

    SC.on('lobby_created', function(d) {
      myInfo = { playerId: d.player.id, saveCode: d.saveCode, player: d.player, lobbyCode: d.code };
      isHost = true;
      saveToBrowser(d.saveCode, d.player.username);
      showSaveCode(d.saveCode);
      // Solo mode: skip the lobby entirely and go straight to character select.
      if (d.soloMode) {
        SC.emit('start_game');
        return;
      }
      updateLobbyScreen(d);
      show('lobby');
    });

    SC.on('lobby_joined', function(d) {
      myInfo = { playerId: d.player.id, saveCode: d.saveCode, player: d.player, lobbyCode: d.code };
      isHost = false;
      saveToBrowser(d.saveCode, d.player.username);
      showSaveCode(d.saveCode);
      updateLobbyScreen(d);
      show('lobby');
    });

    SC.on('lobby_updated', function(d) {
      updateLobbyPlayers(d);
      var btn = document.getElementById('btn-start-game');
      if (btn) {
        btn.disabled = !d.canStart || !isHost;
        btn.textContent = isHost
          ? (d.canStart ? 'Start Game!' : 'Waiting for players...')
          : 'Waiting for host...';
      }
    });

    SC.on('game_start', function(d) {
      show('charselect');
    });

    // Click anywhere on game area to re-focus canvas for keyboard input
    document.getElementById('game-canvas').addEventListener('click', function() {
      var canvas = document.querySelector('#game-canvas canvas');
      if (canvas && currentScreen === 'game') {
        canvas.setAttribute('tabindex', '0');
        canvas.focus();
      }
    });
  }

  function saveToBrowser(saveCode, username) {
    localStorage.setItem('agarcity_save', JSON.stringify({ saveCode: saveCode, username: username }));
  }

  function showSaveCode(code) {
    var el = document.getElementById('your-save-code');
    if (el) el.textContent = code;
    var box = document.getElementById('save-code-banner');
    if (box) { box.style.display = 'flex'; setTimeout(function() { box.style.display = 'none'; }, 8000); }
  }

  function updateLobbyScreen(d) {
    var codeEl = document.getElementById('lobby-code');
    if (codeEl) codeEl.textContent = d.code || (myInfo && myInfo.lobbyCode) || '';
    updateLobbyPlayers(d);
  }

  function updateLobbyPlayers(d) {
    var el = document.getElementById('lobby-players');
    if (!el || !d.players) return;
    el.innerHTML = d.players.map(function(p) {
      var charId = p.characterId || 0;
      var ch = CFG.CHARS[charId] || CFG.CHARS[0];
      var accent = ch.accent || '#ffd700';
      return '<div class="lobby-player">' +
        '<canvas class="lobby-avatar" width="40" height="40" data-idx="' + charId + '" style="border-radius:4px; border:2px solid ' + accent + '; background:rgba(255,255,255,0.05); width:40px; height:40px; image-rendering:pixelated;"></canvas>' +
        '<span>' + escHtml(p.username) + '</span>' +
        '</div>';
    }).join('');

    // Draw all player avatars
    el.querySelectorAll('.lobby-avatar').forEach(function(canvas) {
      var charIdx = parseInt(canvas.dataset.idx, 10);
      drawAvatarOnCanvas(canvas, charIdx);
    });

    var count = document.getElementById('player-count');
    if (count) count.textContent = d.players.length + ' / 8 players';

    var waitMsg = document.getElementById('wait-msg');
    if (waitMsg) {
      if (d.canStart) {
        waitMsg.textContent = isHost ? 'Ready to start!' : 'Waiting for host to start...';
        waitMsg.className = 'wait-msg ready';
      } else {
        var need = d.minToStart - d.players.length;
        waitMsg.textContent = 'Waiting for ' + need + ' more player' + (need !== 1 ? 's' : '') + '...';
        waitMsg.className = 'wait-msg waiting';
      }
    }
  }

  function buildCharSelect() {
    var charGrid = document.getElementById('char-grid');
    if (charGrid) {
      charGrid.innerHTML = CFG.CHARS.map(function(c, i) {
        return '<div class="char-option ' + (i===0?'selected':'') + '" data-idx="' + i + '">' +
          '<div class="char-avatar"><canvas class="char-select-avatar" width="50" height="50" data-idx="' + i + '" style="width:50px; height:50px; image-rendering:pixelated;"></canvas></div>' +
          '<div class="char-name">' + c.name + '</div>' +
          '</div>';
      }).join('');

      // Draw all character selection options
      charGrid.querySelectorAll('.char-select-avatar').forEach(function(canvas) {
        var charIdx = parseInt(canvas.dataset.idx, 10);
        drawAvatarOnCanvas(canvas, charIdx);
      });

      charGrid.addEventListener('click', function(e) {
        var opt = e.target.closest('.char-option');
        if (!opt) return;
        selectedChar = parseInt(opt.dataset.idx, 10);
        charGrid.querySelectorAll('.char-option').forEach(function(el) { el.classList.remove('selected'); });
        opt.classList.add('selected');
      });
    }

    var specGrid = document.getElementById('spec-grid');
    if (specGrid) {
      specGrid.innerHTML = CFG.SPECS.map(function(s, i) {
        return '<div class="spec-option ' + (i===0?'selected':'') + '" data-id="' + s.id + '">' +
          '<div class="spec-icon">' + s.icon + '</div>' +
          '<div class="spec-name">' + s.name + '</div>' +
          '</div>';
      }).join('');

      specGrid.addEventListener('click', function(e) {
        var opt = e.target.closest('.spec-option');
        if (!opt) return;
        selectedSpec = opt.dataset.id;
        specGrid.querySelectorAll('.spec-option').forEach(function(el) { el.classList.remove('selected'); });
        opt.classList.add('selected');
      });
    }
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function updateHUD(data) {
    var hBar  = document.getElementById('bar-health');
    var fBar  = document.getElementById('bar-food');
    var tokEl = document.getElementById('hud-tokens');
    var xpEl  = document.getElementById('hud-xp');
    var spEl  = document.getElementById('hud-spec');

    if (hBar) {
      hBar.style.width = Math.max(0, Math.min(100, data.health)) + '%';
      hBar.style.background = data.health > 50 ? '#2ecc71' : data.health > 25 ? '#f39c12' : '#e74c3c';
    }
    if (fBar) {
      fBar.style.width = Math.max(0, Math.min(100, data.food)) + '%';
      fBar.style.background = data.food > 50 ? '#f39c12' : data.food > 25 ? '#e67e22' : '#c0392b';
    }
    if (tokEl) tokEl.textContent = Math.floor(data.tokens || 0);
    if (xpEl)  xpEl.textContent  = data.jobXp || 0;
    if (spEl && data.specialization && data.specialization !== 'NONE') {
      var spec = CFG.SPECS.find(function(s) { return s.id === data.specialization; });
      spEl.textContent = spec ? (spec.icon + ' ' + spec.name) : data.specialization;
    }

    // Day/night phase indicator
    var phaseEl = document.getElementById('hud-phase');
    if (phaseEl && window.DayNight) {
      var PHASE_ICON = { day: '☀️', dusk: '🌇', night: '🌙', dawn: '🌅' };
      var ph = DayNight.getPhase();
      phaseEl.textContent = (PHASE_ICON[ph] || '☀️') + ' ' + ph.charAt(0).toUpperCase() + ph.slice(1);
    }
  }

  function getMyInfo() { return myInfo; }

  return { init: init, show: show, showError: showError, updateHUD: updateHUD, getMyInfo: getMyInfo };
})();

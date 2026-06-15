// ============================================================================
//  UI — start / lobby / character-select screens + in-game HUD (hearts, depth,
//  day phase). The hotbar is owned by Inventory.js; chat by Chat.js.
// ============================================================================
var UI = (function () {
  var currentScreen = 'start';
  var myInfo = null;
  var selectedChar = 0;
  var isHost = false;

  // pixel heart mask (7x6)
  var HEART = [
    [0,1,1,0,1,1,0],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [0,1,1,1,1,1,0],
    [0,0,1,1,1,0,0],
    [0,0,0,1,0,0,0],
  ];

  // ---- character preview (mirrors PreloadScene player look) ----------------
  function drawCharPreview(canvas, charIdx) {
    var ch = CFG.CHARS[charIdx] || CFG.CHARS[0];
    var c = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;
    var s = Math.floor(Math.min(W, H) / 36);
    var cx = Math.floor(W / 2), top = Math.floor(H * 0.18);
    function px(x, y, w, h, col) { c.fillStyle = col; c.fillRect(cx + x * s, top + y * s, w * s, h * s); }
    // legs
    px(-2, 18, 2, 8, '#3a3550'); px(0, 18, 2, 8, '#3a3550');
    px(-3, 25, 3, 2, '#2a2030'); px(0, 25, 3, 2, '#2a2030');
    // torso
    px(-3, 9, 6, 10, ch.accent);
    // arm
    px(2, 10, 2, 8, ch.accent);
    // head
    px(-2, 0, 5, 9, '#e8b88f');
    // hair
    px(-3, -1, 6, 3, ch.hair); px(-3, 0, 1, 4, ch.hair);
    // eye
    px(1, 3, 1, 1, '#222');
  }

  function _drawHearts(health) {
    var cv = document.getElementById('hearts');
    if (!cv) return;
    var c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    var scale = 2, hw = 7, hh = 6, gap = 2;
    for (var i = 0; i < 5; i++) {
      var frac = Math.max(0, Math.min(1, (health - i * 20) / 20));
      var ox = i * (hw * scale + gap);
      for (var y = 0; y < hh; y++) {
        for (var x = 0; x < hw; x++) {
          if (!HEART[y][x]) continue;
          var lit = ((x + 0.5) / hw) <= frac;
          c.fillStyle = lit ? '#e23b3b' : '#4a2024';
          c.fillRect(ox + x * scale, y * scale, scale, scale);
          if (lit && y < 2) { c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(ox + x * scale, y * scale, scale, 1); }
        }
      }
    }
  }

  function show(screen) {
    ['start', 'lobby', 'charselect'].forEach(function (s) {
      var el = document.getElementById('screen-' + s);
      if (el) el.style.display = (s === screen) ? 'flex' : 'none';
    });
    currentScreen = screen;
    var inGame = (screen === 'game');
    document.getElementById('hud').style.display = inGame ? 'flex' : 'none';
    var hb = document.getElementById('hotbar'); if (hb) hb.style.display = inGame ? 'flex' : 'none';
    var hl = document.getElementById('hb-label'); if (hl) hl.style.display = inGame ? 'block' : 'none';
    if (inGame) {
      setTimeout(function () {
        var canvas = document.querySelector('#game-canvas canvas');
        if (canvas) { canvas.setAttribute('tabindex', '0'); canvas.focus(); }
      }, 100);
    }
  }

  function showError(msg) {
    var el = document.getElementById('error-msg');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    setTimeout(function () { if (el) el.style.display = 'none'; }, 4000);
  }

  function _name() { return document.getElementById('input-name').value.trim(); }
  function _save() { return document.getElementById('input-savecode').value.trim() || null; }

  function init() {
    document.getElementById('btn-solo').addEventListener('click', function () {
      if (!_name()) return showError('Enter your name first.');
      SC.emit('create_lobby', { username: _name(), saveCode: _save(), soloMode: true });
    });
    document.getElementById('btn-create').addEventListener('click', function () {
      if (!_name()) return showError('Enter your name first.');
      SC.emit('create_lobby', { username: _name(), saveCode: _save(), soloMode: false });
    });
    document.getElementById('btn-join').addEventListener('click', function () {
      var code = document.getElementById('input-lobbycode').value.trim();
      if (!_name()) return showError('Enter your name first.');
      if (!code) return showError('Enter a world code.');
      SC.emit('join_lobby', { username: _name(), saveCode: _save(), code: code });
    });

    var saved = localStorage.getItem('terracity_save');
    if (saved) { try { var d = JSON.parse(saved); if (d.saveCode) document.getElementById('input-savecode').value = d.saveCode; if (d.username) document.getElementById('input-name').value = d.username; } catch (e) {} }

    document.getElementById('btn-start-game').addEventListener('click', function () { SC.emit('start_game'); });
    document.getElementById('btn-copy-code').addEventListener('click', function () {
      var code = document.getElementById('lobby-code').textContent;
      navigator.clipboard.writeText(code).then(function () {
        var b = document.getElementById('btn-copy-code'); b.textContent = 'Copied!';
        setTimeout(function () { b.textContent = 'Copy Code'; }, 1500);
      });
    });

    _buildCharSelect();
    document.getElementById('btn-enter-game').addEventListener('click', function () {
      show('game');
      if (window.startPhaserGame) window.startPhaserGame({ characterId: selectedChar, player: myInfo && myInfo.player });
    });

    SC.on('error', function (d) { showError(d.message || 'Something went wrong.'); });
    SC.on('lobby_created', function (d) {
      myInfo = { playerId: d.player.id, saveCode: d.saveCode, player: d.player, lobbyCode: d.code };
      isHost = true; _saveBrowser(d.saveCode, d.player.username); _showSave(d.saveCode);
      if (d.soloMode) { SC.emit('start_game'); return; }
      _updateLobby(d); show('lobby');
    });
    SC.on('lobby_joined', function (d) {
      myInfo = { playerId: d.player.id, saveCode: d.saveCode, player: d.player, lobbyCode: d.code };
      isHost = false; _saveBrowser(d.saveCode, d.player.username); _showSave(d.saveCode);
      _updateLobby(d); show('lobby');
    });
    SC.on('lobby_updated', function (d) {
      _updatePlayers(d);
      var btn = document.getElementById('btn-start-game');
      if (btn) {
        btn.disabled = !d.canStart || !isHost;
        btn.textContent = isHost ? (d.canStart ? 'Start World!' : 'Waiting for players...') : 'Waiting for host...';
      }
    });
    SC.on('game_start', function () { show('charselect'); });

    document.getElementById('game-canvas').addEventListener('click', function () {
      var canvas = document.querySelector('#game-canvas canvas');
      if (canvas && currentScreen === 'game') { canvas.setAttribute('tabindex', '0'); canvas.focus(); }
    });
  }

  function _saveBrowser(code, user) { localStorage.setItem('terracity_save', JSON.stringify({ saveCode: code, username: user })); }
  function _showSave(code) {
    var el = document.getElementById('your-save-code'); if (el) el.textContent = code;
    var box = document.getElementById('save-code-banner');
    if (box) { box.style.display = 'flex'; setTimeout(function () { box.style.display = 'none'; }, 8000); }
  }
  function _updateLobby(d) {
    var c = document.getElementById('lobby-code'); if (c) c.textContent = d.code || (myInfo && myInfo.lobbyCode) || '';
    _updatePlayers(d);
  }
  function _updatePlayers(d) {
    var el = document.getElementById('lobby-players');
    if (!el || !d.players) return;
    el.innerHTML = d.players.map(function (p) {
      return '<div class="lobby-player"><canvas class="lobby-av" width="32" height="32" data-idx="' + (p.characterId || 0) + '"></canvas><span>' + _esc(p.username) + '</span></div>';
    }).join('');
    el.querySelectorAll('.lobby-av').forEach(function (cv) { drawCharPreview(cv, parseInt(cv.dataset.idx, 10)); });
    var cnt = document.getElementById('player-count'); if (cnt) cnt.textContent = d.players.length + ' / 8 players';
    var w = document.getElementById('wait-msg');
    if (w) {
      if (d.canStart) { w.textContent = isHost ? 'Ready to start!' : 'Waiting for host...'; w.className = 'wait-msg ready'; }
      else { var need = d.minToStart - d.players.length; w.textContent = 'Waiting for ' + need + ' more...'; w.className = 'wait-msg waiting'; }
    }
  }

  function _buildCharSelect() {
    var grid = document.getElementById('char-grid');
    if (!grid) return;
    grid.innerHTML = CFG.CHARS.map(function (c, i) {
      return '<div class="char-option ' + (i === 0 ? 'selected' : '') + '" data-idx="' + i + '">' +
        '<canvas class="cs-av" width="56" height="56" data-idx="' + i + '"></canvas>' +
        '<div class="char-name">' + c.name + '</div></div>';
    }).join('');
    grid.querySelectorAll('.cs-av').forEach(function (cv) { drawCharPreview(cv, parseInt(cv.dataset.idx, 10)); });
    grid.addEventListener('click', function (e) {
      var opt = e.target.closest('.char-option'); if (!opt) return;
      selectedChar = parseInt(opt.dataset.idx, 10);
      grid.querySelectorAll('.char-option').forEach(function (el) { el.classList.remove('selected'); });
      opt.classList.add('selected');
    });
  }

  function _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var PHASE_ICON = { day: '☀️', dusk: '🌇', night: '🌙', dawn: '🌅' };
  function updateHUD(data) {
    if (data.health != null) _drawHearts(data.health);
    var dep = document.getElementById('hud-depth'); if (dep && data.depth != null) dep.textContent = data.depth > 0 ? ('Depth ' + data.depth) : 'Surface';
    var ph = document.getElementById('hud-phase'); if (ph && data.phase) ph.textContent = PHASE_ICON[data.phase] || '☀️';
  }

  function getMyInfo() { return myInfo; }

  return { init: init, show: show, showError: showError, updateHUD: updateHUD, getMyInfo: getMyInfo };
})();

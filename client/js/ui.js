// Screen and UI manager
var UI = (function() {
  var currentScreen = 'start';
  var myInfo = null;  // { playerId, saveCode, player, lobbyCode }
  var selectedChar = 0;
  var selectedSpec = 'TECH';
  var isHost = false;

  function show(screen) {
    ['start','lobby','charselect','game'].forEach(function(s) {
      var el = document.getElementById('screen-' + s);
      if (el) el.style.display = (s === screen) ? 'flex' : 'none';
    });
    currentScreen = screen;

    if (screen === 'game') {
      document.getElementById('hud').style.display = 'flex';
    } else {
      document.getElementById('hud').style.display = 'none';
    }
  }

  function showError(msg) {
    var el = document.getElementById('error-msg');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    setTimeout(function() { if (el) el.style.display = 'none'; }, 4000);
  }

  function init() {
    // Start screen
    document.getElementById('btn-create').addEventListener('click', function() {
      var name = document.getElementById('input-name').value.trim();
      if (!name) { showError('Enter your name first.'); return; }
      var saveCode = document.getElementById('input-savecode').value.trim();
      var soloMode = document.getElementById('chk-solo') && document.getElementById('chk-solo').checked;
      SC.emit('create_lobby', { username: name, saveCode: saveCode || null, soloMode: false });
    });

    document.getElementById('btn-join').addEventListener('click', function() {
      var name = document.getElementById('input-name').value.trim();
      var code = document.getElementById('input-lobbycode').value.trim();
      if (!name) { showError('Enter your name first.'); return; }
      if (!code) { showError('Enter a lobby code.'); return; }
      var saveCode = document.getElementById('input-savecode').value.trim();
      SC.emit('join_lobby', { username: name, saveCode: saveCode || null, code: code });
    });

    // Auto-fill save code from localStorage
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

    // Char select screen
    buildCharSelect();

    document.getElementById('btn-enter-game').addEventListener('click', function() {
      SC.emit('player_ready', {
        characterId: selectedChar,
        specialization: selectedSpec,
        username: myInfo && myInfo.player ? myInfo.player.username : '',
      });
      show('game');

      // Trigger Phaser game start
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
    if (codeEl) codeEl.textContent = d.code || (d.player && myInfo && myInfo.lobbyCode) || '';
    updateLobbyPlayers(d);
  }

  function updateLobbyPlayers(d) {
    var el = document.getElementById('lobby-players');
    if (!el || !d.players) return;
    el.innerHTML = d.players.map(function(p) {
      return '<div class="lobby-player">' +
        '<span class="player-dot" style="background:' + (CFG.CHARS[p.characterId || 0] || CFG.CHARS[0]).body + '"></span>' +
        '<span>' + escHtml(p.username) + '</span>' +
        '</div>';
    }).join('');

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
    // Character grid
    var charGrid = document.getElementById('char-grid');
    if (charGrid) {
      charGrid.innerHTML = CFG.CHARS.map(function(c, i) {
        return '<div class="char-option ' + (i===0?'selected':'') + '" data-idx="' + i + '">' +
          '<div class="char-avatar" style="background:' + c.body + ';border-color:' + c.outline + '"></div>' +
          '<div class="char-name">' + c.name + '</div>' +
          '</div>';
      }).join('');

      charGrid.addEventListener('click', function(e) {
        var opt = e.target.closest('.char-option');
        if (!opt) return;
        selectedChar = parseInt(opt.dataset.idx, 10);
        charGrid.querySelectorAll('.char-option').forEach(function(el) { el.classList.remove('selected'); });
        opt.classList.add('selected');
      });
    }

    // Specialization grid
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
  }

  function getMyInfo() { return myInfo; }

  return { init: init, show: show, showError: showError, updateHUD: updateHUD, getMyInfo: getMyInfo };
})();

// Screen and UI manager
var UI = (function() {
  var currentScreen = 'start';
  var myInfo = null;  // { playerId, saveCode, player, lobbyCode }
  var selectedChar = 0;
  var selectedSpec = 'TECH';
  var isHost = false;

  var charactersSheetImg = new Image();
  charactersSheetImg.src = '/assets/characters.png';

  function drawAvatarOnCanvas(canvas, charIdx) {
    if (!charactersSheetImg.complete) {
      charactersSheetImg.addEventListener('load', function() { drawAvatarOnCanvas(canvas, charIdx); }, { once: true });
      return;
    }

    var cfg = CFG.SHEET;
    var targetRgb = { r: 176, g: 181, b: 184 }; // #b0b5b8
    var row = Math.floor(charIdx / 5);
    var col = charIdx % 5;
    var x = cfg.offsetX + col * (cfg.cellW + cfg.spacingX);
    var y = cfg.offsetY + row * (cfg.cellH + cfg.spacingY);

    var offCanvas = document.createElement('canvas');
    offCanvas.width = cfg.cellW;
    offCanvas.height = cfg.cellH;
    var offCtx = offCanvas.getContext('2d');
    offCtx.drawImage(charactersSheetImg, x, y, cfg.cellW, cfg.cellH, 0, 0, cfg.cellW, cfg.cellH);

    var imgData = offCtx.getImageData(0, 0, cfg.cellW, cfg.cellH);
    var pixels = imgData.data;
    for (var j = 0; j < pixels.length; j += 4) {
      var pr = pixels[j];
      var pg = pixels[j+1];
      var pb = pixels[j+2];
      var dist = Math.sqrt(
        Math.pow(pr - targetRgb.r, 2) +
        Math.pow(pg - targetRgb.g, 2) +
        Math.pow(pb - targetRgb.b, 2)
      );
      if (dist < cfg.chromaTol) {
        pixels[j+3] = 0;
      }
    }
    offCtx.putImageData(imgData, 0, 0);

    canvas.width = canvas.clientWidth || 40;
    canvas.height = canvas.clientHeight || 40;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Crop upper-body headshot region: x:20-80, y:10-70 of full 100x145 canvas
    ctx.drawImage(offCanvas, 20, 10, 60, 60, 0, 0, canvas.width, canvas.height);
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
      SC.emit('player_ready', {
        characterId: selectedChar,
        specialization: selectedSpec,
        username: myInfo && myInfo.player ? myInfo.player.username : '',
      });
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
      return '<div class="lobby-player">' +
        '<canvas class="lobby-avatar" width="40" height="40" data-idx="' + charId + '" style="border-radius:4px; border:2px solid ' + ch.outline + '; background:rgba(255,255,255,0.05); width:40px; height:40px; image-rendering:pixelated;"></canvas>' +
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
  }

  function getMyInfo() { return myInfo; }

  return { init: init, show: show, showError: showError, updateHUD: updateHUD, getMyInfo: getMyInfo };
})();

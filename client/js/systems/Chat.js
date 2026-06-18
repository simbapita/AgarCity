// In-game chat system — self-contained DOM + socket wiring.
// Public API: init, isOpen, open, close, addMessage
var Chat = (function() {
  var _open = false;        // true while the input box is open/focused
  var _logEl = null;        // message log container (bottom-left)
  var _inputEl = null;      // text input below the log
  var _wired = false;       // guard against double init

  var MAX_MESSAGES = 8;     // keep only the last N lines in the DOM
  var FONT = "'Press Start 2P', monospace";
  var GOLD = '#ffd700';

  // Escape HTML so usernames/messages can't inject markup into innerHTML.
  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Build the chat DOM (message log + input) and attach it to document.body.
  function _buildDom() {
    // Message log — bottom-left, non-interactive overlay.
    _logEl = document.createElement('div');
    _logEl.id = 'chat-log';
    _logEl.style.cssText = [
      'position:fixed',
      'bottom:90px',
      'left:16px',
      'z-index:56',
      'width:320px',
      'max-height:160px',
      'overflow:hidden',
      'pointer-events:none',
      'display:flex',
      'flex-direction:column',
      'justify-content:flex-end',
      'font-family:' + FONT
    ].join(';');
    document.body.appendChild(_logEl);

    // Text input — hidden by default, sits just below the log.
    _inputEl = document.createElement('input');
    _inputEl.id = 'chat-input';
    _inputEl.type = 'text';
    _inputEl.maxLength = 120;
    _inputEl.placeholder = 'Say something...';
    _inputEl.autocomplete = 'off';
    _inputEl.style.cssText = [
      'position:fixed',
      'bottom:60px',
      'left:16px',
      'width:320px',
      'z-index:57',
      'display:none',
      'box-sizing:border-box',
      'padding:8px',
      'font-family:' + FONT,
      'font-size:9px',
      'color:#fff',
      'background:#111122',
      'border:2px solid #0a0a14',
      'outline:none'
    ].join(';');
    document.body.appendChild(_inputEl);

    // Gold border on focus, plain on blur.
    _inputEl.addEventListener('focus', function() {
      _inputEl.style.borderColor = GOLD;
    });
    _inputEl.addEventListener('blur', function() {
      _inputEl.style.borderColor = '#0a0a14';
    });

    // Keydown on the input itself: handle send/cancel and stop the event from
    // bubbling to Phaser's global keyboard handlers while typing.
    _inputEl.addEventListener('keydown', function(e) {
      // Prevent Phaser / window handlers from reacting to typing.
      e.stopPropagation();

      if (e.key === 'Enter') {
        e.preventDefault();
        _send();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
  }

  // Read the input, emit if non-empty, clear, then close.
  function _send() {
    var value = _inputEl.value.trim();
    if (value.length > 0) {
      SC.emit('chat_message', { text: value });
    }
    _inputEl.value = '';
    close();
  }

  // Global Enter-to-open handler. Attached on window with capture so it runs
  // before Phaser's own keyboard handling.
  function _onGlobalKeydown(e) {
    if (e.key !== 'Enter') return;
    if (_open) return; // input's own handler deals with the open state

    // Only available in-game: the HUD is shown only while playing.
    var hud = document.getElementById('hud');
    if (!hud || hud.style.display === 'none') return;

    // Don't hijack Enter while the user is typing in some other text field.
    var active = document.activeElement;
    if (active && active !== _inputEl && active.tagName === 'INPUT') return;

    e.preventDefault();
    e.stopPropagation();
    open();
  }

  // Wire up DOM + socket listener. Safe to call once.
  function init() {
    if (_wired) return;
    _wired = true;

    _buildDom();

    // Listen for incoming chat broadcasts from the server.
    SC.on('chat_message', function(data) {
      if (!data) return;
      addMessage(data.username, data.text, data.self);
    });

    // Capture phase so we see Enter before Phaser's global handlers.
    window.addEventListener('keydown', _onGlobalKeydown, true);
  }

  // Show the input and give it focus.
  function open() {
    if (!_inputEl) return;
    _open = true;
    _inputEl.style.display = 'block';
    _inputEl.focus();
  }

  // Hide the input, drop focus, and hand focus back to the game canvas.
  function close() {
    _open = false;
    if (_inputEl) {
      _inputEl.style.display = 'none';
      _inputEl.blur();
    }
    var canvas = document.querySelector('#game-canvas canvas');
    if (canvas && canvas.focus) canvas.focus();
  }

  // True while the chat input is open — GameScene uses this to skip movement.
  function isOpen() {
    return _open;
  }

  // Append a chat line to the log and trim to the last MAX_MESSAGES.
  function addMessage(username, text, isSelf) {
    if (!_logEl) return;

    var line = document.createElement('div');
    line.style.cssText = [
      'margin:2px 0',
      'padding:3px 5px',
      'font-size:8px',
      'line-height:1.4',
      'color:#fff',
      'background:rgba(10,10,20,0.6)',
      'word-wrap:break-word',
      'overflow-wrap:break-word'
    ].join(';');

    // Self messages use a slightly lighter gold so you can spot your own lines.
    var nameColor = isSelf ? '#fff1a8' : GOLD;
    var safeName = escHtml(username || 'anon');
    var safeText = escHtml(text);
    line.innerHTML =
      '<span style="color:' + nameColor + '">' + safeName + ':</span> ' +
      '<span>' + safeText + '</span>';

    _logEl.appendChild(line);

    // Trim oldest lines so only the most recent MAX_MESSAGES remain (newest last).
    while (_logEl.childNodes.length > MAX_MESSAGES) {
      _logEl.removeChild(_logEl.firstChild);
    }
  }

  return {
    init: init,
    isOpen: isOpen,
    open: open,
    close: close,
    addMessage: addMessage
  };
})();

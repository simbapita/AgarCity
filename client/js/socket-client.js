// Socket.io client wrapper — exposes window.SC
var SC = (function () {
  var socket = null;
  var handlers = {};

  function on(event, fn) { handlers[event] = fn; }
  function emit(event, data) { if (socket) socket.emit(event, data); }

  function connect() {
    socket = io();
    var events = [
      'connect', 'disconnect', 'error',
      'lobby_created', 'lobby_joined', 'lobby_updated', 'game_start',
      'game_state_init', 'player_joined_game', 'player_left_game', 'player_moved',
      'block_set', 'chat_message',
    ];
    events.forEach(function (ev) {
      socket.on(ev, function (data) { if (handlers[ev]) handlers[ev](data); });
    });
  }

  return { connect: connect, on: on, emit: emit };
})();

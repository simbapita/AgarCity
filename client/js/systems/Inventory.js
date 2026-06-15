// ============================================================================
//  Inventory — Terraria-style wooden hotbar (10 slots). DOM-based so it layers
//  cleanly over the Phaser canvas. Public API:
//    init, getSelected, add, remove, select, scroll, isPlaceable
// ============================================================================
var Inventory = (function () {
  var SLOTS = 10;
  var _slots = [];          // each: { type, count } | null
  var _sel = 0;
  var _bar = null;
  var _label = null;
  var _built = false;

  var NAMES = {
    1: 'Dirt', 2: 'Grass', 3: 'Stone', 4: 'Wood', 5: 'Leaves', 6: 'Sand',
    7: 'Copper', 8: 'Iron', 9: 'Gold', 10: 'Gem', 11: 'Torch', 12: 'Plank',
    13: 'Bedrock', 14: 'Clay', 15: 'Snow',
  };

  function isPlaceable(type) { return CFG.PLACEABLE.indexOf(type) >= 0; }

  function _build() {
    _bar = document.createElement('div');
    _bar.id = 'hotbar';
    for (var i = 0; i < SLOTS; i++) {
      var slot = document.createElement('div');
      slot.className = 'hb-slot';
      slot.dataset.idx = i;
      var num = document.createElement('span');
      num.className = 'hb-num';
      num.textContent = (i === 9) ? '0' : (i + 1);
      var cv = document.createElement('canvas');
      cv.width = 32; cv.height = 32; cv.className = 'hb-icon';
      var cnt = document.createElement('span');
      cnt.className = 'hb-count';
      slot.appendChild(num); slot.appendChild(cv); slot.appendChild(cnt);
      (function (idx) { slot.addEventListener('mousedown', function (e) { e.preventDefault(); select(idx); }); })(i);
      _bar.appendChild(slot);
    }
    document.body.appendChild(_bar);

    _label = document.createElement('div');
    _label.id = 'hb-label';
    document.body.appendChild(_label);
    _built = true;
  }

  function init() {
    if (!_built) _build();
    for (var i = 0; i < SLOTS; i++) _slots[i] = null;
    var start = CFG.START_INVENTORY || [];
    for (var s = 0; s < start.length && s < SLOTS; s++) {
      _slots[s] = { type: start[s][0], count: start[s][1] };
    }
    _sel = 0;
    _render();
  }

  function _drawIcon(cv, type) {
    var c = cv.getContext('2d');
    c.clearRect(0, 0, 32, 32);
    if (!type) return;
    var base = CFG.TILE_COLORS[type] || '#888';
    if (type === CFG.T.TORCH) {
      c.fillStyle = '#5a3a1a'; c.fillRect(15, 14, 3, 14);
      c.fillStyle = '#ff8c1a'; c.fillRect(12, 6, 8, 10);
      c.fillStyle = '#ffe169'; c.fillRect(14, 4, 4, 8);
      return;
    }
    c.fillStyle = base; c.fillRect(4, 4, 24, 24);
    if (type === CFG.T.GRASS) { c.fillStyle = '#7a4a28'; c.fillRect(4, 12, 24, 16); c.fillStyle = '#5fa342'; c.fillRect(4, 4, 24, 8); }
    // speckle for texture
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(7, 9, 2, 2); c.fillRect(18, 14, 2, 2); c.fillRect(12, 20, 2, 2);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(4, 4, 24, 2);
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.strokeRect(4, 4, 24, 24);
  }

  function _render() {
    if (!_bar) return;
    var slotEls = _bar.querySelectorAll('.hb-slot');
    for (var i = 0; i < slotEls.length; i++) {
      var el = slotEls[i];
      el.classList.toggle('selected', i === _sel);
      var data = _slots[i];
      var cv = el.querySelector('.hb-icon');
      var cnt = el.querySelector('.hb-count');
      _drawIcon(cv, data ? data.type : 0);
      cnt.textContent = (data && data.count > 1) ? data.count : '';
    }
    var sel = _slots[_sel];
    if (_label) _label.textContent = sel ? (NAMES[sel.type] || ('#' + sel.type)) : '';
  }

  function getSelected() { return _slots[_sel]; }

  function add(type, count) {
    count = count || 1;
    for (var i = 0; i < SLOTS; i++) {
      if (_slots[i] && _slots[i].type === type) { _slots[i].count += count; _render(); return true; }
    }
    for (var j = 0; j < SLOTS; j++) {
      if (!_slots[j]) { _slots[j] = { type: type, count: count }; _render(); return true; }
    }
    return false; // inventory full
  }

  function remove(type, count) {
    count = count || 1;
    var slot = _slots[_sel];
    if (slot && slot.type === type) {
      slot.count -= count;
      if (slot.count <= 0) _slots[_sel] = null;
      _render();
      return true;
    }
    for (var i = 0; i < SLOTS; i++) {
      if (_slots[i] && _slots[i].type === type) {
        _slots[i].count -= count;
        if (_slots[i].count <= 0) _slots[i] = null;
        _render();
        return true;
      }
    }
    return false;
  }

  function select(i) { if (i >= 0 && i < SLOTS) { _sel = i; _render(); } }
  function scroll(dir) { _sel = (_sel + dir + SLOTS) % SLOTS; _render(); }

  return {
    init: init, getSelected: getSelected, add: add, remove: remove,
    select: select, scroll: scroll, isPlaceable: isPlaceable,
  };
})();

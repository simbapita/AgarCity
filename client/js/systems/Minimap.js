// Minimap system — renders a small overview of the city in the bottom-right corner.
// Self-contained: builds its own DOM, pre-renders the static world once, and
// draws moving players each frame. Toggle with the public API (bound to "M" elsewhere).
var Minimap = (function() {
  var SIZE = 180;        // visible minimap canvas size in px (square)
  var LABEL_H = 12;      // vertical space reserved for the "MAP (M)" label

  var _container = null; // fixed-position wrapper appended to body
  var _canvas = null;    // visible canvas we redraw each frame
  var _ctx = null;       // its 2d context
  var _bgCanvas = null;  // offscreen canvas holding the static world (cached)
  var _scale = 1;        // minimap px per world tile
  var _ready = false;

  // World pixel dimensions, derived from CFG.
  function _worldPxW() { return CFG.WORLD_W * CFG.TILE; }
  function _worldPxH() { return CFG.WORLD_H * CFG.TILE; }

  // Spec id -> hex color for job zones.
  function _specColor(spec) {
    var map = { TECH:'#3498db', MEDICAL:'#e74c3c', FOOD_SERVICE:'#f39c12',
                TRADES:'#95a5a6', BUSINESS:'#2ecc71', ARTS:'#9b59b6', ANY:'#ffd700' };
    return map[spec] || '#fff';
  }

  // Convert a world pixel coordinate to a minimap pixel coordinate.
  function _mmX(worldX) { return worldX / _worldPxW() * SIZE; }
  function _mmY(worldY) { return worldY / _worldPxH() * SIZE; }

  // Build the DOM (container + label + canvas) and append to body.
  function _buildDom() {
    _container = document.createElement('div');
    _container.id = 'minimap-container';
    _container.style.position = 'fixed';
    _container.style.bottom = '16px';
    _container.style.right = '16px';
    _container.style.zIndex = '55';
    _container.style.pointerEvents = 'none';
    _container.style.userSelect = 'none';

    var label = document.createElement('div');
    label.textContent = 'MAP (M)';
    label.style.fontSize = '7px';
    label.style.color = '#b89b6e';
    label.style.fontFamily = "'Press Start 2P', monospace";
    label.style.marginBottom = '3px';
    label.style.textAlign = 'left';
    label.style.lineHeight = LABEL_H + 'px';

    _canvas = document.createElement('canvas');
    _canvas.width = SIZE;
    _canvas.height = SIZE;
    _canvas.style.width = SIZE + 'px';
    _canvas.style.height = SIZE + 'px';
    _canvas.style.display = 'block';
    _canvas.style.border = '3px solid #7a542e';
    _canvas.style.borderRadius = '4px';
    _canvas.style.background = 'rgba(26, 18, 10, 0.8)';
    _canvas.style.boxShadow = '0 0 0 2px #2a1a0c';
    _canvas.style.imageRendering = 'pixelated';

    _container.appendChild(label);
    _container.appendChild(_canvas);
    document.body.appendChild(_container);

    _ctx = _canvas.getContext('2d');
    _ctx.imageSmoothingEnabled = false;
  }

  // Pre-render the static world (tiles, job zones, food stores) into _bgCanvas.
  function _renderStatic(cityMap) {
    _bgCanvas = document.createElement('canvas');
    _bgCanvas.width = SIZE;
    _bgCanvas.height = SIZE;
    var bctx = _bgCanvas.getContext('2d');
    bctx.imageSmoothingEnabled = false;

    // Scale factor: minimap pixels per world tile.
    _scale = SIZE / CFG.WORLD_W;

    // Fill a base color so any gaps read as background.
    bctx.fillStyle = 'rgba(10, 10, 20, 0.9)';
    bctx.fillRect(0, 0, SIZE, SIZE);

    // Draw each tile as a scaled rect using its configured color.
    var colors = CFG.TILE_COLORS || {};
    for (var y = 0; y < cityMap.length; y++) {
      var row = cityMap[y];
      if (!row) continue;
      for (var x = 0; x < row.length; x++) {
        var col = colors[row[x]];
        if (!col) continue;
        bctx.fillStyle = col;
        // +1 px on size avoids hairline seams between scaled tiles.
        bctx.fillRect(x * _scale, y * _scale, _scale + 1, _scale + 1);
      }
    }

    // Job zones: small filled circles in their spec color, semi-transparent.
    var zones = CFG.JOB_ZONES || [];
    bctx.globalAlpha = 0.5;
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      bctx.fillStyle = _specColor(z.spec);
      bctx.beginPath();
      bctx.arc(_mmX(z.x), _mmY(z.y), 3, 0, Math.PI * 2);
      bctx.fill();
    }

    // Food stores: small orange circles.
    var stores = CFG.FOOD_STORES || [];
    bctx.fillStyle = '#f39c12';
    for (var j = 0; j < stores.length; j++) {
      var s = stores[j];
      bctx.beginPath();
      bctx.arc(_mmX(s.x), _mmY(s.y), 2.5, 0, Math.PI * 2);
      bctx.fill();
    }
    bctx.globalAlpha = 1;
  }

  // Public: build everything from the city map. Safe to call with falsy map.
  function init(cityMap) {
    if (!cityMap || !cityMap.length) return;
    if (!_container) _buildDom();
    _renderStatic(cityMap);
    _ready = true;
    show();
    // Draw an initial frame so the map is populated before the first update.
    update(null, []);
  }

  // Public: redraw moving entities on top of the cached background.
  function update(self, remotes) {
    if (!_ready || !_ctx) return;
    remotes = remotes || [];

    // Clear and blit the cached static world.
    _ctx.clearRect(0, 0, SIZE, SIZE);
    if (_bgCanvas) _ctx.drawImage(_bgCanvas, 0, 0);

    // Remote players: small white dots.
    _ctx.fillStyle = '#ffffff';
    for (var i = 0; i < remotes.length; i++) {
      var r = remotes[i];
      if (!r) continue;
      _ctx.beginPath();
      _ctx.arc(_mmX(r.x), _mmY(r.y), 2, 0, Math.PI * 2);
      _ctx.fill();
    }

    // Local player: larger gold dot with a thin dark outline.
    if (self) {
      var sx = _mmX(self.x), sy = _mmY(self.y);
      _ctx.beginPath();
      _ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      _ctx.fillStyle = '#ffd700';
      _ctx.fill();
      _ctx.lineWidth = 1;
      _ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      _ctx.stroke();
    }
  }

  // Public: visibility controls. Default state after init is visible.
  function show() {
    if (_container) _container.style.display = 'block';
  }

  function hide() {
    if (_container) _container.style.display = 'none';
  }

  function toggle() {
    if (!_container) return;
    var hidden = _container.style.display === 'none';
    if (hidden) show(); else hide();
  }

  return {
    init: init,
    update: update,
    toggle: toggle,
    show: show,
    hide: hide
  };
})();

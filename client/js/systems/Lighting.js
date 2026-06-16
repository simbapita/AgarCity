// Lighting system — Terraria-style soft tile lighting.
// The world is dark; light comes from open sky (skylight), torches, and the
// player. We compute a low-resolution (one cell per tile) light grid for the
// visible viewport, smooth it so light spills softly into caves, then draw it
// as a black darkness overlay scaled up over the screen with bilinear
// smoothing for gentle gradients.
var Lighting = (function() {
  var TILE = (typeof CFG !== 'undefined' && CFG.TILE) ? CFG.TILE : 16;

  // Tuning knobs.
  var SOLID_ATTEN   = 0.45;   // skylight multiplier per solid tile descended
  var SMOOTH_PASSES = 2;      // relaxation passes for soft spill
  var SMOOTH_SPILL  = 0.82;   // how much light bleeds to dark neighbours
  var TORCH_STRENGTH = 0.95;  // warm point-light peak brightness
  var PLAYER_RADIUS  = 3.5;   // guaranteed soft light around the player
  var PLAYER_STRENGTH = 0.9;  // its peak brightness
  var MAX_DARK = 0.97;        // cap so unlit tiles are never pure pitch black

  var _scene = null;

  // Small offscreen canvas: one pixel per visible tile. This is where the raw
  // light grid is rasterised before being scaled up.
  var _smallCanvas = null;
  var _smallCtx = null;
  var _smallW = 0;            // current small-canvas size (in tiles/pixels)
  var _smallH = 0;

  // Display canvas: screen-sized, registered with Phaser as 'lightmap' and
  // shown via _image. We blit the small canvas onto this, scaled up.
  var _dispCanvas = null;
  var _dispCtx = null;
  var _image = null;          // the full-screen overlay GameObject

  // Reusable light grid (Float32Array), grown as the viewport changes.
  var _light = null;
  var _cols = 0;
  var _rows = 0;

  var _frame = 0;             // frame counter for throttling the recompute

  // Ensure the small canvas is at least cols x rows pixels.
  function _ensureSmall(cols, rows) {
    if (!_smallCanvas) {
      _smallCanvas = document.createElement('canvas');
      _smallCtx = _smallCanvas.getContext('2d');
    }
    if (cols > _smallW || rows > _smallH) {
      _smallW = Math.max(cols, _smallW);
      _smallH = Math.max(rows, _smallH);
      _smallCanvas.width = _smallW;
      _smallCanvas.height = _smallH;
    }
  }

  // Ensure the light grid array is big enough for cols x rows.
  function _ensureGrid(cols, rows) {
    if (!_light || cols * rows > _light.length) {
      _light = new Float32Array(cols * rows);
    }
  }

  // (Re)build the screen-sized display canvas + Phaser texture/image.
  function _buildDisplay(w, h) {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));

    // Drop any prior texture so addCanvas can re-register the key cleanly.
    if (_scene && _scene.textures && _scene.textures.exists('lightmap')) {
      if (_image) { _image.destroy(); _image = null; }
      _scene.textures.remove('lightmap');
    }

    _dispCanvas = document.createElement('canvas');
    _dispCanvas.width = w;
    _dispCanvas.height = h;
    _dispCtx = _dispCanvas.getContext('2d');

    _scene.textures.addCanvas('lightmap', _dispCanvas);

    _image = _scene.add.image(0, 0, 'lightmap');
    _image.setOrigin(0);
    _image.setScrollFactor(0);
    _image.setDepth(900);
  }

  // Public: set up the overlay against a Phaser scene.
  function init(scene) {
    _scene = scene;
    var cam = scene.cameras.main;
    _buildDisplay(cam.width, cam.height);
  }

  // Public: rebuild the display canvas/texture for a new screen size.
  function resize(w, h) {
    if (!_scene) return;
    _buildDisplay(w, h);
  }

  // Compute the light grid for the visible window. getTile(tx,ty) -> tile type.
  function _computeLight(startTx, startTy, cols, rows, skyLight, getTile,
                         emitters, playerTile) {
    var L = _light;
    var i, x, y, idx;

    // 1. Reset.
    for (i = 0; i < cols * rows; i++) L[i] = 0;

    // 2. Skylight. For each column, walk down from the top of the world so the
    //    attenuation state above the visible window carries correctly into it.
    for (x = 0; x < cols; x++) {
      var tx = startTx + x;
      var atten = skyLight;     // current sky brightness as we descend
      var hitSolid = false;     // have we passed the first solid tile yet?

      // Walk every world row from 0 down to the bottom of the visible window,
      // but only write into the grid once we're inside it.
      var bottomTy = startTy + rows - 1;
      for (var wy = 0; wy <= bottomTy; wy++) {
        var type = getTile(tx, wy);
        var solid = (typeof CFG !== 'undefined' && CFG.isSolid)
          ? CFG.isSolid(type) : (type !== 0);

        if (!hitSolid) {
          if (solid) {
            // First solid tile: still lit by sky, then attenuation begins.
            hitSolid = true;
            // This tile keeps full sky on its face; start fading below it.
          }
        }

        // Decide the value at this world row.
        var val;
        if (!hitSolid) {
          val = atten;          // open air sees full current skyLight
        } else {
          val = atten;          // first solid tile shown at current atten,
        }

        // Write into the grid if this world row falls in the visible window.
        if (wy >= startTy && wy <= bottomTy) {
          idx = (wy - startTy) * cols + x;
          if (val > L[idx]) L[idx] = val;
        }

        // Attenuate for the NEXT row down once we've hit solid ground.
        if (hitSolid && solid) {
          atten *= SOLID_ATTEN;
        }
      }
    }

    // 3. Point lights (emitters + the player).
    function _addLight(ptx, pty, radius, strength) {
      if (radius <= 0) return;
      var r = radius;
      var minX = Math.floor(ptx - r), maxX = Math.ceil(ptx + r);
      var minY = Math.floor(pty - r), maxY = Math.ceil(pty + r);
      for (var gy = minY; gy <= maxY; gy++) {
        var ly = gy - startTy;
        if (ly < 0 || ly >= rows) continue;
        for (var gx = minX; gx <= maxX; gx++) {
          var lx = gx - startTx;
          if (lx < 0 || lx >= cols) continue;
          var dx = gx - ptx, dy = gy - pty;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var fall = 1 - dist / r;
          if (fall <= 0) continue;
          var add = fall * strength;
          var k = ly * cols + lx;
          var v = L[k] + add;
          L[k] = v > 1 ? 1 : v;
        }
      }
    }

    if (emitters && emitters.length) {
      for (i = 0; i < emitters.length; i++) {
        var e = emitters[i];
        if (!e) continue;
        _addLight(e.tx, e.ty, e.radius, TORCH_STRENGTH);
      }
    }
    if (playerTile) {
      _addLight(playerTile.tx, playerTile.ty, PLAYER_RADIUS, PLAYER_STRENGTH);
    }

    // 4. Smoothing — each cell takes max(itself, brightest neighbour * spill)
    //    so light bleeds softly around corners and into caves.
    for (var pass = 0; pass < SMOOTH_PASSES; pass++) {
      for (y = 0; y < rows; y++) {
        for (x = 0; x < cols; x++) {
          idx = y * cols + x;
          var best = L[idx];
          if (x > 0)        { var l = L[idx - 1];    if (l > best) best = l; }
          if (x < cols - 1) { var rr = L[idx + 1];   if (rr > best) best = rr; }
          if (y > 0)        { var u = L[idx - cols]; if (u > best) best = u; }
          if (y < rows - 1) { var d = L[idx + cols]; if (d > best) best = d; }
          var spilled = best * SMOOTH_SPILL;
          if (spilled > L[idx]) {
            L[idx] = spilled > 1 ? 1 : spilled;
          }
        }
      }
    }
  }

  // Rasterise the light grid into the small canvas (one pixel per tile).
  function _drawSmall(cols, rows) {
    var ctx = _smallCtx;
    // Clear only the region we'll use.
    ctx.clearRect(0, 0, cols, rows);
    var L = _light;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var lit = L[y * cols + x];
        if (lit > 1) lit = 1; else if (lit < 0) lit = 0;
        var dark = 1 - lit;
        if (dark > MAX_DARK) dark = MAX_DARK;
        if (dark <= 0) continue;   // fully lit cell: leave transparent
        ctx.fillStyle = 'rgba(0,0,0,' + dark + ')';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // Public: recompute (throttled) and redraw the overlay every frame.
  function update(opts) {
    if (!_scene || !opts) return;
    var cam = opts.camera;
    if (!cam) return;

    var scrollX = cam.scrollX;
    var scrollY = cam.scrollY;
    var camW = cam.width;
    var camH = cam.height;

    // 1. Visible tile window (with a 1-tile margin all round).
    var startTx = Math.floor(scrollX / TILE) - 1;
    var startTy = Math.floor(scrollY / TILE) - 1;
    var cols = Math.ceil(camW / TILE) + 3;
    var rows = Math.ceil(camH / TILE) + 3;

    _ensureGrid(cols, rows);
    _ensureSmall(cols, rows);
    _cols = cols;
    _rows = rows;

    // Throttle the expensive recompute to every 2nd frame; on skipped frames
    // we keep the last grid (small canvas already holds it) and only realign.
    _frame++;
    var recompute = (_frame % 2) === 0;

    if (recompute) {
      var skyLight = (typeof opts.skyLight === 'number') ? opts.skyLight : 1;
      if (skyLight < 0) skyLight = 0; else if (skyLight > 1) skyLight = 1;
      var getTile = opts.getTile || function() { return 0; };
      _computeLight(startTx, startTy, cols, rows, skyLight, getTile,
                    opts.emitters, opts.playerTile);
      _drawSmall(cols, rows);
    }

    // 2. Blit the small canvas onto the display canvas, scaled up, offset by
    //    the sub-tile scroll remainder so it tracks the world precisely.
    var ctx = _dispCtx;
    if (!ctx) return;
    ctx.clearRect(0, 0, _dispCanvas.width, _dispCanvas.height);
    ctx.imageSmoothingEnabled = true;

    var dx = -(scrollX - startTx * TILE);
    var dy = -(scrollY - startTy * TILE);
    var dw = cols * TILE;
    var dh = rows * TILE;

    // Source is the top-left cols x rows region of the (possibly larger) small
    // canvas; draw it scaled to cover the viewport plus margins.
    ctx.drawImage(_smallCanvas, 0, 0, cols, rows, dx, dy, dw, dh);

    if (_scene.textures.exists('lightmap')) {
      _scene.textures.get('lightmap').refresh();
    }
  }

  return {
    init: init,
    update: update,
    resize: resize
  };
})();

// ============================================================================
//  GameScene — the Terraria-style side-scroller: gravity/jump movement,
//  tilemap collision, mining & placing, lighting/day-night/particles,
//  multiplayer sync, and night-time slimes.
// ============================================================================
var GameScene = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function () {
    Phaser.Scene.call(this, { key: 'GameScene' });
    this._ready = false;
    this._pendingStart = null;
    this._tiles = null;
    this._layer = null;
    this._W = CFG.WORLD_W;
    this._H = CFG.WORLD_H;
    this._player = null;
    this._charId = 0;
    this._playerData = null;
    this._remote = {};
    this._slimes = [];
    this._seed = 1;
    this._lastGround = 0;
    this._jumpBuffer = -9999;
    this._facing = 1;
    this._mineTx = -1; this._mineTy = -1; this._mineProg = 0;
    this._footTimer = 0;
    this._hurtCd = 0;
    this._regenTimer = 0;
    this._sendTimer = 0;
    this._slimeTimer = 0;
    this._dnReady = false;
  },

  create: function () {
    var self = this;
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.cameras.main.setBounds(0, 0, CFG.worldPxW(), CFG.worldPxH());
    this.physics.world.setBounds(0, 0, CFG.worldPxW(), CFG.worldPxH());
    this.input.mouse.disableContextMenu();

    // input
    this._cursors = this.input.keyboard.createCursorKeys();
    this._wasd = this.input.keyboard.addKeys({ up: 'W', left: 'A', down: 'S', right: 'D' });
    this._jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this._shift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this._num = [];
    var numCodes = ['ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','ZERO'];
    for (var n = 0; n < numCodes.length; n++) this._num.push(this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[numCodes[n]]));
    this.input.on('wheel', function (p, o, dx, dy) {
      if (window.Inventory) Inventory.scroll(dy > 0 ? 1 : -1);
    });

    // systems that don't need the world yet (DayNight is inited in _onInit,
    // once we know the shared day-start time from the server)
    if (window.Lighting) Lighting.init(this);
    if (window.Particles) Particles.init(this);
    if (window.Chat) Chat.init();
    if (window.Inventory) Inventory.init();

    // selection / crack overlay (above the lighting overlay so it's visible)
    this._sel = this.add.graphics().setDepth(950);

    this.scale.on('resize', function (gs) {
      if (window.Lighting) Lighting.resize(gs.width, gs.height);
      if (window.DayNight && self._dnReady) DayNight.update(0, 0);
    });

    // --- socket handlers ---
    SC.on('game_state_init', function (d) { self._onInit(d); });
    SC.on('player_joined_game', function (ps) { self._addRemote(ps); });
    SC.on('player_left_game', function (d) { self._removeRemote(d.playerId); });
    SC.on('player_moved', function (d) { self._onRemoteMove(d); });
    SC.on('block_set', function (d) { self._applyBlock(d.index % self._W, Math.floor(d.index / self._W), d.type, true); });

    if (this._pendingStart) { this._doStart(this._pendingStart); this._pendingStart = null; }
    window.startPhaserGame = function (data) { self._doStart(data); };
  },

  _doStart: function (data) {
    this._charId = data.characterId || 0;
    this._playerData = data.player || {};
    SC.emit('player_ready', {
      characterId: this._charId,
      username: (this._playerData && this._playerData.username) || 'Player',
    });
  },

  // --- world init when the server sends our seed + state -------------------
  _onInit: function (d) {
    if (this._ready) return;
    this._seed = d.seed || 1;
    if (window.DayNight) { DayNight.init(this, { startTime: d.dayStart || Date.now() }); this._dnReady = true; }

    var world = generateWorld(this._seed);
    this._tiles = world.tiles;

    var map = this.make.tilemap({ tileWidth: CFG.TILE, tileHeight: CFG.TILE, width: this._W, height: this._H });
    var tileset = map.addTilesetImage('blocks', 'blocks', CFG.TILE, CFG.TILE, 0, 0);
    var layer = map.createBlankLayer('world', tileset, 0, 0).setDepth(10);
    for (var y = 0; y < this._H; y++) {
      var row = this._tiles[y];
      for (var x = 0; x < this._W; x++) {
        if (row[x] !== CFG.T.AIR) layer.putTileAt(row[x], x, y);
      }
    }
    var solids = [];
    for (var t = 1; t < CFG.TILE_COUNT; t++) if (CFG.isSolid(t)) solids.push(t);
    layer.setCollision(solids, true);
    this._map = map; this._layer = layer;

    // apply edits made before we joined
    if (d.edits && d.edits.length) {
      for (var i = 0; i < d.edits.length; i++) {
        var e = d.edits[i];
        this._applyBlock(e[0] % this._W, Math.floor(e[0] / this._W), e[1], true);
      }
    }

    if (d.self.x == null) { d.self.x = world.spawn.x; d.self.y = world.spawn.y; }
    this._spawnSelf(d.self);
    this._ready = true;

    var pend = this._pendingRemotes || []; this._pendingRemotes = [];
    for (var pi = 0; pi < pend.length; pi++) this._addRemote(pend[pi]);
    if (d.others) for (var k = 0; k < d.others.length; k++) this._addRemote(d.others[k]);
  },

  _spawnSelf: function (ps) {
    var sprite = this.physics.add.sprite(ps.x, ps.y, 'player_' + (ps.characterId || 0), 0).setDepth(20);
    sprite.body.setSize(CFG.PLAYER_W, CFG.PLAYER_H).setOffset((24 - CFG.PLAYER_W) / 2, 32 - CFG.PLAYER_H);
    sprite.body.setMaxVelocity(600, CFG.MAX_FALL);
    sprite.setCollideWorldBounds(true);
    this.physics.add.collider(sprite, this._layer);
    var nameText = this.add.text(ps.x, ps.y - 24, ps.username || 'You', {
      fontFamily: "'Press Start 2P'", fontSize: '7px', color: '#fff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(21);
    this._player = { sprite: sprite, nameText: nameText, data: ps };
    if (ps.health == null) ps.health = 100;
    this.cameras.main.startFollow(sprite, true, 0.12, 0.12);
    this._updateHUD();
  },

  // --- remote players ------------------------------------------------------
  _addRemote: function (ps) {
    if (!ps || this._remote[ps.playerId] || !this._ready) {
      if (ps && !this._ready) { this._pendingRemotes = this._pendingRemotes || []; this._pendingRemotes.push(ps); }
      return;
    }
    var sprite = this.add.sprite(ps.x, ps.y, 'player_' + (ps.characterId || 0), 0).setDepth(19).setAlpha(0.92);
    var nameText = this.add.text(ps.x, ps.y - 24, ps.username || 'Player', {
      fontFamily: "'Press Start 2P'", fontSize: '7px', color: '#ffe', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(21);
    this._remote[ps.playerId] = { sprite: sprite, nameText: nameText, data: ps, tx: ps.x, ty: ps.y };
  },
  _removeRemote: function (id) {
    var r = this._remote[id];
    if (!r) return;
    r.sprite.destroy(); r.nameText.destroy();
    delete this._remote[id];
  },
  _onRemoteMove: function (d) {
    var r = this._remote[d.playerId];
    if (!r) return;
    r.tx = d.x; r.ty = d.y;
    r.data.facing = d.facing; r.data.moving = d.moving; r.data.jumping = d.jumping;
  },

  // ========================================================================
  //  MAIN LOOP
  // ========================================================================
  update: function (time, delta) {
    var dt = Math.min(delta, 50) / 1000;
    if (window.DayNight && this._dnReady) DayNight.update(time, delta);
    if (!this._ready || !this._player) return;

    var chatOpen = !!(window.Chat && Chat.isOpen());
    this._updatePlayer(dt, time, chatOpen);
    this._updateInteraction(time, chatOpen);
    this._updateRemotes(dt);
    this._updateSlimes(dt, time);
    this._updateStatus(dt);

    if (!chatOpen) this._handleHotbarKeys();

    // atmosphere
    if (window.Particles) Particles.update(time, delta, this.cameras.main);
    if (window.Lighting) this._updateLighting();

    // network throttle
    this._sendTimer += delta;
    if (this._sendTimer >= 80) {
      this._sendTimer = 0;
      var sp = this._player.sprite;
      SC.emit('player_move', {
        x: Math.round(sp.x), y: Math.round(sp.y),
        facing: this._facing, moving: this._moving, jumping: !this._onGround,
      });
    }
  },

  _updatePlayer: function (dt, time, chatOpen) {
    var sp = this._player.sprite, body = sp.body;
    var left = false, right = false, jump = false;
    if (!chatOpen) {
      left = this._cursors.left.isDown || this._wasd.left.isDown;
      right = this._cursors.right.isDown || this._wasd.right.isDown;
      jump = this._cursors.up.isDown || this._wasd.up.isDown || this._jumpKey.isDown;
    }
    var run = this._shift.isDown && !chatOpen;
    var speed = CFG.MOVE_SPEED * (run ? CFG.RUN_MULTIPLIER : 1);

    if (left && !right) { body.setVelocityX(-speed); this._facing = -1; this._moving = true; }
    else if (right && !left) { body.setVelocityX(speed); this._facing = 1; this._moving = true; }
    else { body.setVelocityX(0); this._moving = false; }

    this._onGround = body.blocked.down || body.onFloor();
    if (this._onGround) this._lastGround = time;
    if (jump && !this._jumpHeld) this._jumpBuffer = time;
    this._jumpHeld = jump;

    var canCoyote = (time - this._lastGround) <= CFG.COYOTE_MS;
    var buffered = (time - this._jumpBuffer) <= CFG.JUMP_BUFFER_MS;
    if (buffered && canCoyote && body.velocity.y >= -10) {
      body.setVelocityY(-CFG.JUMP_VELOCITY);
      this._jumpBuffer = -9999; this._lastGround = -9999;
      if (window.Particles) Particles.jump(sp.x, sp.y + 16);
    }
    // variable jump height: release early -> cut upward velocity
    if (!jump && body.velocity.y < -120) body.setVelocityY(body.velocity.y * 0.55);

    // landing puff
    if (this._onGround && this._wasFalling && body.velocity.y >= -1) {
      if (window.Particles) Particles.land(sp.x, sp.y + 16);
    }
    this._wasFalling = body.velocity.y > 120;

    // footsteps
    if (this._moving && this._onGround) {
      this._footTimer += dt;
      if (this._footTimer > 0.28) {
        this._footTimer = 0;
        if (window.Particles) Particles.footstep(sp.x, sp.y + 16, 0x9a7a4a);
      }
    }

    // animation + facing
    sp.flipX = this._facing < 0;
    var k = 'player_' + this._charId;
    var want = !this._onGround ? k + '_jump' : (this._moving ? k + '_walk' : k + '_idle');
    if (!sp.anims.isPlaying || sp.anims.getName() !== want) sp.anims.play(want, true);

    this._player.nameText.x = sp.x;
    this._player.nameText.y = sp.y - 24;
  },

  // --- mining & placing ----------------------------------------------------
  _updateInteraction: function (time, chatOpen) {
    var cam = this.cameras.main;
    var p = this.input.activePointer;
    var wx = p.x + cam.scrollX, wy = p.y + cam.scrollY;
    var tx = Math.floor(wx / CFG.TILE), ty = Math.floor(wy / CFG.TILE);
    var sp = this._player.sprite;
    var ptx = Math.floor(sp.x / CFG.TILE), pty = Math.floor(sp.y / CFG.TILE);
    var inReach = Math.abs(tx - ptx) <= CFG.REACH && Math.abs(ty - pty) <= CFG.REACH;

    this._sel.clear();
    if (chatOpen || tx < 0 || ty < 0 || tx >= this._W || ty >= this._H) { this._mineTx = -1; return; }

    var hudHover = p.y < 56 || p.y > cam.height - 70; // ignore the HUD strip & hotbar
    var type = this._tiles[ty][tx];

    // selection box
    this._sel.lineStyle(1.5, inReach ? 0xffffff : 0x884444, inReach ? 0.85 : 0.4);
    this._sel.strokeRect(tx * CFG.TILE, ty * CFG.TILE, CFG.TILE, CFG.TILE);

    if (!inReach || hudHover) { this._mineTx = -1; this._mineProg = 0; return; }

    // MINE (left button)
    if (p.leftButtonDown() && (CFG.isSolid(type) || type === CFG.T.TORCH)) {
      if (CFG.HARDNESS[type] === Infinity) return;
      if (tx !== this._mineTx || ty !== this._mineTy) { this._mineTx = tx; this._mineTy = ty; this._mineProg = 0; }
      this._mineProg += this.game.loop.delta / 1000;
      var hard = CFG.HARDNESS[type] || 0.5;
      if (window.Particles && Math.random() < 0.5) Particles.mineHit(tx * CFG.TILE + 8, ty * CFG.TILE + 8, this._tileColorInt(type));
      // crack overlay
      var prog = Math.min(1, this._mineProg / hard);
      this._sel.fillStyle(0x000000, 0.25 * prog);
      this._sel.fillRect(tx * CFG.TILE, ty * CFG.TILE, CFG.TILE, CFG.TILE);
      if (this._mineProg >= hard) {
        this._breakTile(tx, ty, type);
        this._mineTx = -1; this._mineProg = 0;
      }
    } else {
      this._mineTx = -1; this._mineProg = 0;
    }

    // PLACE (right button)
    if (p.rightButtonDown() && type === CFG.T.AIR && window.Inventory) {
      var sel = Inventory.getSelected();
      if (sel && sel.count > 0 && Inventory.isPlaceable(sel.type) && this._canPlace(tx, ty, sel.type)) {
        this._placeTile(tx, ty, sel.type);
      }
    }
  },

  _canPlace: function (tx, ty, type) {
    // can't place a solid block where the player stands
    if (CFG.isSolid(type)) {
      var sp = this._player.sprite, b = sp.body;
      var bx0 = Math.floor(b.left / CFG.TILE), bx1 = Math.floor(b.right / CFG.TILE);
      var by0 = Math.floor(b.top / CFG.TILE), by1 = Math.floor(b.bottom / CFG.TILE);
      if (tx >= bx0 && tx <= bx1 && ty >= by0 && ty <= by1) return false;
    }
    // must touch an existing solid/torch neighbour (so blocks attach)
    var n = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < n.length; i++) {
      var ax = tx + n[i][0], ay = ty + n[i][1];
      if (ax < 0 || ay < 0 || ax >= this._W || ay >= this._H) continue;
      if (this._tiles[ay][ax] !== CFG.T.AIR) return true;
    }
    return false;
  },

  _breakTile: function (tx, ty, type) {
    var drop = CFG.DROPS[type] != null ? CFG.DROPS[type] : type;
    if (window.Inventory && type !== CFG.T.LEAVES) Inventory.add(drop, 1);
    if (window.Inventory && type === CFG.T.LEAVES && Math.random() < 0.25) Inventory.add(CFG.T.WOOD, 1);
    if (window.Particles) Particles.blockBreak(tx * CFG.TILE + 8, ty * CFG.TILE + 8, this._tileColorInt(type));
    this._applyBlock(tx, ty, CFG.T.AIR, false);
    this._updateHUD();
  },

  _placeTile: function (tx, ty, type) {
    Inventory.remove(type, 1);
    this._applyBlock(tx, ty, type, false);
    if (window.Particles) Particles.mineHit(tx * CFG.TILE + 8, ty * CFG.TILE + 8, this._tileColorInt(type));
    this._updateHUD();
  },

  // shared block mutation (network = true means do NOT re-broadcast)
  _applyBlock: function (tx, ty, type, network) {
    if (tx < 0 || ty < 0 || tx >= this._W || ty >= this._H || !this._tiles) return;
    this._tiles[ty][tx] = type;
    if (this._layer) {
      if (type === CFG.T.AIR) this._layer.removeTileAt(tx, ty);
      else this._layer.putTileAt(type, tx, ty);
    }
    if (!network) SC.emit('block_set', { index: ty * this._W + tx, type: type });
  },

  _handleHotbarKeys: function () {
    if (!window.Inventory) return;
    for (var i = 0; i < this._num.length; i++) {
      if (Phaser.Input.Keyboard.JustDown(this._num[i])) Inventory.select(i);
    }
  },

  // --- remote interpolation ------------------------------------------------
  _updateRemotes: function (dt) {
    for (var id in this._remote) {
      var r = this._remote[id];
      r.sprite.x += (r.tx - r.sprite.x) * 0.2;
      r.sprite.y += (r.ty - r.sprite.y) * 0.2;
      r.sprite.flipX = r.data.facing < 0;
      r.nameText.x = r.sprite.x; r.nameText.y = r.sprite.y - 24;
      var k = 'player_' + (r.data.characterId || 0);
      var want = r.data.jumping ? k + '_jump' : (r.data.moving ? k + '_walk' : k + '_idle');
      if (r.sprite.anims.getName() !== want) r.sprite.anims.play(want, true);
    }
  },

  // --- night slimes --------------------------------------------------------
  _updateSlimes: function (dt, time) {
    var night = window.DayNight && DayNight.isNight();
    this._slimeTimer += dt;
    if (night && this._slimes.length < 6 && this._slimeTimer > 2.5) {
      this._slimeTimer = 0;
      this._spawnSlime();
    }
    var sp = this._player.sprite;
    for (var i = this._slimes.length - 1; i >= 0; i--) {
      var s = this._slimes[i];
      if (!s.sprite.active) { this._slimes.splice(i, 1); continue; }
      // despawn far away or in daylight
      if ((!night) || Math.abs(s.sprite.x - sp.x) > 900) {
        s.sprite.destroy(); this._slimes.splice(i, 1); continue;
      }
      var onFloor = s.sprite.body.blocked.down;
      if (onFloor && time > s.nextHop) {
        s.nextHop = time + 700 + Math.random() * 600;
        var dir = sp.x < s.sprite.x ? -1 : 1;
        s.sprite.body.setVelocityX(dir * 60);
        s.sprite.body.setVelocityY(-220);
      }
      // contact damage
      if (this._hurtCd <= 0 && Phaser.Math.Distance.Between(s.sprite.x, s.sprite.y, sp.x, sp.y) < 18) {
        // stomp kill if player is descending from above
        if (sp.body.velocity.y > 60 && sp.y < s.sprite.y - 6) {
          s.sprite.destroy(); this._slimes.splice(i, 1);
          sp.body.setVelocityY(-260);
        } else {
          this._damage(12);
          this._hurtCd = 1.0;
          sp.body.setVelocityX(this._facing * -160);
          sp.body.setVelocityY(-180);
        }
      }
    }
  },

  _spawnSlime: function () {
    var sp = this._player.sprite;
    var side = Math.random() < 0.5 ? -1 : 1;
    var tx = Math.floor(sp.x / CFG.TILE) + side * (10 + Math.floor(Math.random() * 6));
    if (tx < 1 || tx >= this._W - 1) return;
    // drop from the sky above the surface column
    var ty = 2;
    while (ty < this._H && this._tiles[ty][tx] === CFG.T.AIR) ty++;
    var slime = this.physics.add.sprite(tx * CFG.TILE + 8, (ty - 3) * CFG.TILE, 'slime').setDepth(18);
    slime.body.setSize(20, 14).setOffset(2, 4);
    slime.body.setMaxVelocity(120, CFG.MAX_FALL);
    this.physics.add.collider(slime, this._layer);
    this._slimes.push({ sprite: slime, nextHop: 0 });
  },

  // --- health / status -----------------------------------------------------
  _updateStatus: function (dt) {
    var ps = this._player.data;
    if (this._hurtCd > 0) this._hurtCd -= dt;
    // slow regen
    if (ps.health < 100) {
      this._regenTimer += dt;
      if (this._regenTimer > 1.5) { this._regenTimer = 0; ps.health = Math.min(100, ps.health + 2); this._updateHUD(); }
    }
    // fall out of world safety
    if (this._player.sprite.y > CFG.worldPxH() + 40) this._respawn();
  },

  _damage: function (n) {
    var ps = this._player.data;
    ps.health = Math.max(0, ps.health - n);
    this.cameras.main.shake(120, 0.006);
    this._updateHUD();
    if (ps.health <= 0) this._respawn();
  },

  _respawn: function () {
    var world = generateWorld(this._seed);
    var sp = this._player.sprite;
    sp.setPosition(world.spawn.x, world.spawn.y);
    sp.body.setVelocity(0, 0);
    this._player.data.health = 100;
    this.cameras.main.flash(200, 120, 0, 0);
    this._updateHUD();
  },

  // --- lighting feed -------------------------------------------------------
  _updateLighting: function () {
    var cam = this.cameras.main, self = this;
    var startTx = Math.floor(cam.scrollX / CFG.TILE) - 1;
    var startTy = Math.floor(cam.scrollY / CFG.TILE) - 1;
    var cols = Math.ceil(cam.width / CFG.TILE) + 3;
    var rows = Math.ceil(cam.height / CFG.TILE) + 3;
    var emitters = [];
    for (var y = startTy; y < startTy + rows; y++) {
      if (y < 0 || y >= this._H) continue;
      for (var x = startTx; x < startTx + cols; x++) {
        if (x < 0 || x >= this._W) continue;
        var t = this._tiles[y][x];
        if (CFG.EMITTERS[t]) emitters.push({ tx: x, ty: y, radius: CFG.EMITTERS[t] });
      }
    }
    var sp = this._player.sprite;
    Lighting.update({
      camera: cam,
      skyLight: window.DayNight ? DayNight.getSkyLight() : 1,
      getTile: function (tx, ty) {
        if (ty < 0) return CFG.T.AIR;
        if (ty >= self._H || tx < 0 || tx >= self._W) return CFG.T.STONE;
        return self._tiles[ty][tx];
      },
      emitters: emitters,
      playerTile: { tx: Math.floor(sp.x / CFG.TILE), ty: Math.floor(sp.y / CFG.TILE) },
    });
  },

  _tileColorInt: function (type) {
    var hex = CFG.TILE_COLORS[type] || '#888888';
    return parseInt(hex.slice(1), 16);
  },

  _updateHUD: function () {
    if (window.UI) UI.updateHUD({
      health: this._player.data.health,
      depth: Math.max(0, Math.floor((this._player.sprite.y / CFG.TILE) - 50)),
      phase: window.DayNight ? DayNight.getPhase() : 'day',
    });
  },
});

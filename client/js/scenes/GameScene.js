var GameScene = new Phaser.Class({
  Extends: Phaser.Scene,

  initialize: function() {
    Phaser.Scene.call(this, { key: 'GameScene' });
    this._ready = false;
    this._pendingStart = null;
    this._remotePlayers = {};
    this._myPlayer = null;
    this._cursors = null;
    this._wasd = null;
    this._eKey = null;
    this._moveTimer = 0;
    this._cityMap = null;
    this._npcs = [];
    this._cars = [];
    this._spec = 'NONE';
  },

  create: function() {
    var self = this;
    var W = CFG.WORLD_W * CFG.TILE;
    var H = CFG.WORLD_H * CFG.TILE;

    self._cityMap = self.registry.get('cityMap');

    self.add.image(W/2, H/2, 'city');

    self.physics.world.setBounds(0, 0, W, H);
    self.cameras.main.setBounds(0, 0, W, H);

    // Input
    self._cursors = self.input.keyboard.createCursorKeys();
    self._wasd = self.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    self._eKey = self.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    // Zone labels on the map
    self._drawZoneLabels();

    // Food store markers
    self._drawFoodStoreMarkers();

    // NPCs + cars
    self._spawnNPCs();
    self._spawnCars();

    // Init job system
    JobSystem.init(function(event) {
      if (!self._myPlayer) return;
      var ps = self._myPlayer.data;
      if (event.type === 'job_complete') {
        ps.tokens = event.data.newTokens;
        ps.jobXp  = event.data.newXp;
        ps.jobTier = event.data.newTier;
        self._updateHUD(ps);
      } else if (event.type === 'food_bought') {
        ps.tokens = event.data.tokens;
        ps.food   = event.data.food;
        self._updateHUD(ps);
      }
    });

    // Socket events
    SC.on('game_state_init', function(d) {
      self._initSelf(d.self);
      d.others.forEach(function(ps) { self._addRemotePlayer(ps); });
      self._ready = true;
    });

    SC.on('player_joined_game', function(ps) { self._addRemotePlayer(ps); });
    SC.on('player_left_game',   function(d)  { self._removeRemotePlayer(d.playerId); });
    SC.on('player_moved',       function(d)  { self._updateRemotePlayer(d); });
    SC.on('position_correction',function(d)  {
      if (self._myPlayer) { self._myPlayer.sprite.x = d.x; self._myPlayer.sprite.y = d.y; }
    });

    if (self._pendingStart) {
      self._doStart(self._pendingStart);
      self._pendingStart = null;
    }

    window.startPhaserGame = function(data) { self._doStart(data); };
  },

  _doStart: function(data) {
    var self = this;
    self._charId = data.characterId || 0;
    self._spec   = data.specialization || 'TECH';
    self._playerData = data.player || {};

    SC.emit('player_ready', {
      characterId:    self._charId,
      specialization: self._spec,
      username: self._playerData.username || 'Player',
    });
  },

  _initSelf: function(ps) {
    var self = this;
    if (self._myPlayer) {
      self._myPlayer.sprite.destroy();
      self._myPlayer.nameText.destroy();
    }

    var sprite = self.physics.add.image(ps.x, ps.y, 'player_' + ps.characterId);
    sprite.setCollideWorldBounds(true).setDepth(10);
    sprite.setDisplaySize(36, 52.2);

    var nameText = self.add.text(ps.x, ps.y - 32, ps.username, {
      fontSize: '9px', fontFamily: "'Press Start 2P'",
      color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(11);

    self._myPlayer = { sprite: sprite, nameText: nameText, data: ps };
    self._spec = ps.specialization || 'NONE';
    self.cameras.main.startFollow(sprite, true, 0.1, 0.1);
    self._updateHUD(ps);
  },

  _addRemotePlayer: function(ps) {
    var self = this;
    if (self._remotePlayers[ps.playerId]) return;
    var sprite = self.add.image(ps.x, ps.y, 'player_' + ps.characterId).setDepth(9).setAlpha(0.85);
    sprite.setDisplaySize(36, 52.2);
    var nameText = self.add.text(ps.x, ps.y - 32, ps.username, {
      fontSize: '9px', fontFamily: "'Press Start 2P'",
      color: '#dddddd', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);
    self._remotePlayers[ps.playerId] = { sprite: sprite, nameText: nameText, data: ps };
  },

  _removeRemotePlayer: function(playerId) {
    var rp = this._remotePlayers[playerId];
    if (!rp) return;
    rp.sprite.destroy();
    rp.nameText.destroy();
    delete this._remotePlayers[playerId];
  },

  _updateRemotePlayer: function(d) {
    var rp = this._remotePlayers[d.playerId];
    if (!rp) return;
    rp.data.targetX = d.x;
    rp.data.targetY = d.y;
    rp.data.direction = d.direction;
    rp.data.moving = d.moving;
  },

  update: function(time, delta) {
    var self = this;
    var dt = delta / 1000;

    self._updateNPCs(dt);
    self._updateCars(dt);

    if (!self._myPlayer) return;

    var sp = self._myPlayer.sprite;
    var vx = 0, vy = 0;
    var cur = self._cursors, wasd = self._wasd;

    if (cur.left.isDown  || wasd.left.isDown)  vx = -CFG.SPEED;
    if (cur.right.isDown || wasd.right.isDown) vx =  CFG.SPEED;
    if (cur.up.isDown    || wasd.up.isDown)    vy = -CFG.SPEED;
    if (cur.down.isDown  || wasd.down.isDown)  vy =  CFG.SPEED;

    // Stop movement while working
    if (JobSystem.isWorking()) { vx = 0; vy = 0; }

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    var moving = vx !== 0 || vy !== 0;
    var direction = self._myPlayer.data.direction || 'down';
    if (vy < 0) direction = 'up';
    else if (vy > 0) direction = 'down';
    else if (vx < 0) direction = 'left';
    else if (vx > 0) direction = 'right';

    var nx = sp.x + vx * dt;
    var ny = sp.y + vy * dt;
    if (self._canWalk(nx, sp.y)) sp.x = nx;
    if (self._canWalk(sp.x, ny)) sp.y = ny;

    // Apply custom player walk/idle animations
    self._animateSprite(sp, moving, direction, time);

    self._myPlayer.nameText.x = sp.x;
    self._myPlayer.nameText.y = sp.y - 32;

    // Stat drain
    var ps = self._myPlayer.data;
    if (moving) ps.food = Math.max(0, ps.food - CFG.DRAIN.FOOD_WALK * dt);
    else        ps.food = Math.max(0, ps.food - CFG.DRAIN.FOOD_IDLE  * dt);
    if (ps.food <= 0) ps.health = Math.max(0, ps.health - CFG.DRAIN.HEALTH_EMPTY * dt);
    self._updateHUD(ps);

    // Job / food interaction
    var eJustPressed = Phaser.Input.Keyboard.JustDown(self._eKey);
    JobSystem.update(sp.x, sp.y, eJustPressed, self._spec);

    // Remote player lerp and animation
    Object.keys(self._remotePlayers).forEach(function(pid) {
      var rp = self._remotePlayers[pid];
      if (rp.data.targetX !== undefined) {
        rp.sprite.x += (rp.data.targetX - rp.sprite.x) * 0.18;
        rp.sprite.y += (rp.data.targetY - rp.sprite.y) * 0.18;
        rp.nameText.x = rp.sprite.x;
        rp.nameText.y = rp.sprite.y - 32;

        self._animateSprite(rp.sprite, rp.data.moving, rp.data.direction, time);
      }
    });

    // Send position at ~15fps
    self._moveTimer += delta;
    if (self._moveTimer >= 67) {
      self._moveTimer = 0;
      SC.emit('player_move', { x: sp.x, y: sp.y, direction: direction, moving: moving });
    }
  },

  _canWalk: function(x, y) {
    var TILE = CFG.TILE, map = this._cityMap;
    if (!map) return true;
    var half = 10;
    var pts = [[x-half,y-half],[x+half,y-half],[x-half,y+half],[x+half,y+half]];
    for (var i = 0; i < pts.length; i++) {
      var tx = Math.floor(pts[i][0]/TILE), ty = Math.floor(pts[i][1]/TILE);
      if (tx<0||ty<0||tx>=CFG.WORLD_W||ty>=CFG.WORLD_H) return false;
      if (!CFG.WALKABLE.has(map[ty][tx])) return false;
    }
    return true;
  },

  _updateHUD: function(ps) {
    if (window.UI) UI.updateHUD(ps);
  },

  _drawZoneLabels: function() {
    var self = this;
    var zones = CFG.JOB_ZONES || [];
    var specColors = { TECH:'#3498db', MEDICAL:'#e74c3c', FOOD_SERVICE:'#f39c12',
                       TRADES:'#95a5a6', BUSINESS:'#2ecc71', ARTS:'#9b59b6', ANY:'#ffd700' };

    zones.forEach(function(z) {
      var col = specColors[z.spec] || '#fff';
      // Glow circle on map
      var g = self.add.graphics().setDepth(2);
      g.lineStyle(2, parseInt(col.replace('#',''), 16), 0.5);
      g.strokeCircle(z.x, z.y, z.radius);
      g.fillStyle(parseInt(col.replace('#',''), 16), 0.08);
      g.fillCircle(z.x, z.y, z.radius);

      // Label text
      self.add.text(z.x, z.y - z.radius - 8, z.label, {
        fontSize: '8px', fontFamily: "'Press Start 2P'",
        color: col, stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(3);
    });
  },

  _drawFoodStoreMarkers: function() {
    var self = this;
    var stores = CFG.FOOD_STORES || [];
    stores.forEach(function(s) {
      var g = self.add.graphics().setDepth(2);
      g.lineStyle(2, 0xf39c12, 0.5);
      g.strokeCircle(s.x, s.y, s.radius);
      g.fillStyle(0xf39c12, 0.08);
      g.fillCircle(s.x, s.y, s.radius);

      self.add.text(s.x, s.y - s.radius - 8, '🍎 ' + s.name, {
        fontSize: '7px', fontFamily: "'Press Start 2P'",
        color: '#f39c12', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(3);
    });
  },

  _spawnNPCs: function() {
    var self = this;
    var routes = [
      [{x:320,y:230},{x:700,y:230},{x:700,y:242},{x:320,y:242}],
      [{x:900,y:780},{x:1300,y:780},{x:1300,y:792},{x:900,y:792}],
      [{x:400,y:826},{x:800,y:826},{x:800,y:838},{x:400,y:838}],
      [{x:200,y:1290},{x:600,y:1290},{x:600,y:1302},{x:200,y:1302}],
      [{x:1100,y:270},{x:1500,y:270},{x:1500,y:282},{x:1100,y:282}],
    ];
    routes.forEach(function(route, ri) {
      var npc = {
        sprite: self.add.image(route[0].x, route[0].y, 'npc').setDepth(8).setAlpha(0.75),
        route: route, waypointIdx: 0, speed: 38 + ri * 6,
      };
      self._npcs.push(npc);
    });
  },

  _updateNPCs: function(dt) {
    this._npcs.forEach(function(npc) {
      var target = npc.route[npc.waypointIdx];
      var dx = target.x - npc.sprite.x, dy = target.y - npc.sprite.y;
      var dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 2) { npc.waypointIdx = (npc.waypointIdx+1) % npc.route.length; return; }
      npc.sprite.x += (dx/dist) * npc.speed * dt;
      npc.sprite.y += (dy/dist) * npc.speed * dt;
    });
  },

  _spawnCars: function() {
    var self = this;
    var W = CFG.WORLD_W * CFG.TILE;
    [{x:200,y:272,vx:60,ci:0},{x:1200,y:288,vx:-50,ci:1},{x:100,y:800,vx:70,ci:2},
     {x:700,y:816,vx:-45,ci:3},{x:400,y:1312,vx:55,ci:4}].forEach(function(def) {
      var sprite = self.add.image(def.x, def.y, 'car_'+def.ci).setDepth(7);
      if (def.vx < 0) sprite.flipX = true;
      self._cars.push({ sprite: sprite, vx: def.vx, maxX: W });
    });
  },

  _updateCars: function(dt) {
    var W = CFG.WORLD_W * CFG.TILE;
    this._cars.forEach(function(car) {
      car.sprite.x += car.vx * dt;
      if (car.vx > 0 && car.sprite.x > W+50) car.sprite.x = -50;
      if (car.vx < 0 && car.sprite.x < -50)  car.sprite.x = W+50;
    });
  },

  _animateSprite: function(sprite, moving, direction, time) {
    sprite.angle = 0;
    
    if (direction === 'left') {
      sprite.flipX = true;
    } else if (direction === 'right') {
      sprite.flipX = false;
    }

    var scaleX = 1.0;
    var scaleY = 1.0;
    var originY = 0.5;

    if (moving) {
      var bobTime = time * 0.015;
      var bobY = Math.abs(Math.sin(bobTime)) * -6; // Up to 6 pixels of vertical lift
      var squish = Math.sin(bobTime) * 0.06;
      scaleY = 1.0 - Math.abs(squish);
      scaleX = 1.0 + Math.abs(squish) * 0.5;
      originY = 0.5 - (bobY / 52.2); // Offset texture origin vertically
    } else {
      var breatheTime = time * 0.003;
      var breathing = Math.sin(breatheTime) * 0.02;
      scaleY = 1.0 + breathing;
      scaleX = 1.0 - breathing * 0.5;
      originY = 0.5;
    }

    sprite.setDisplaySize(36 * scaleX, 52.2 * scaleY);
    sprite.setOrigin(0.5, originY);
  },
});

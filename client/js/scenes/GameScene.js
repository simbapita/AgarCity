var GameScene = new Phaser.Class({
  Extends: Phaser.Scene,

  initialize: function() {
    Phaser.Scene.call(this, { key: 'GameScene' });
    this._ready          = false;
    this._pendingStart   = null;
    this._remotePlayers  = {};
    this._myPlayer       = null;
    this._cursors        = null;
    this._wasd           = null;
    this._eKey           = null;
    this._shiftKey       = null;
    this._moveTimer      = 0;
    this._minimapTimer   = 0;
    this._cityMap        = null;
    this._npcs           = [];
    this._cars           = [];
    this._spec           = 'NONE';
    this._mKey           = null;
    this._escKey         = null;
    this._tabKey         = null;
    this._scoreboard     = [];
    this._scoreVisible   = false;
    this._carHitCooldown = 0;
    this._knockbackVel = { x: 0, y: 0 };
  },

  create: function() {
    var self = this;
    var W = CFG.WORLD_W * CFG.TILE;
    var H = CFG.WORLD_H * CFG.TILE;

    self._cityMap = self.registry.get('cityMap');
    self.add.image(W / 2, H / 2, 'city');

    self.physics.world.setBounds(0, 0, W, H);
    self.cameras.main.setBounds(0, 0, W, H);

    self._cursors = self.input.keyboard.createCursorKeys();
    self._wasd = self.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    self._eKey     = self.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    self._shiftKey = self.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    self._mKey     = self.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    self._escKey   = self.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    self._tabKey   = self.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    self.input.keyboard.addCapture('TAB');

    self._drawZoneLabels();
    self._drawFoodStoreMarkers();
    self._spawnNPCs();
    self._spawnCars();

    if (window.Minimap) { Minimap.init(self._cityMap); Minimap.hide(); }
    if (window.Chat)    Chat.init();

    self._lightSources = []
      .concat((CFG.JOB_ZONES  || []).map(function(z) { return { x: z.x, y: z.y, radius: z.radius || 90 }; }))
      .concat((CFG.FOOD_STORES || []).map(function(s) { return { x: s.x, y: s.y, radius: s.radius || 70 }; }));
    if (window.DayNight)  DayNight.init(self, {});
    if (window.Lighting)  Lighting.init(self);
    if (window.Particles) Particles.init(self);
    if (window.Audio)     Audio.init();
    self._footTimer = 0;

    self.scale.on('resize', function(gs) {
      if (window.Lighting) Lighting.resize(gs.width, gs.height);
    });

    SC.on('scoreboard', function(d) {
      self._scoreboard = (d && d.players) || [];
      if (self._scoreVisible) self._renderScoreboard();
    });

    JobSystem.init(function(event) {
      if (!self._myPlayer) return;
      var ps = self._myPlayer.data;
      if (event.type === 'job_complete') {
        ps.tokens  = event.data.newTokens;
        ps.jobXp   = event.data.newXp;
        ps.jobTier = event.data.newTier;
        self._updateHUD(ps);
      } else if (event.type === 'food_bought') {
        ps.tokens = event.data.tokens;
        ps.food   = event.data.food;
        self._updateHUD(ps);
      }
    });

    SC.on('game_state_init', function(d) {
      self._initSelf(d.self);
      d.others.forEach(function(ps) { self._addRemotePlayer(ps); });
      self._ready = true;
    });

    SC.on('player_joined_game',  function(ps) { self._addRemotePlayer(ps); });
    SC.on('player_left_game',    function(d)  { self._removeRemotePlayer(d.playerId); });
    SC.on('player_moved',        function(d)  { self._updateRemotePlayer(d); });
    SC.on('position_correction', function(d)  {
      if (self._myPlayer) {
        self._myPlayer.sprite.x = d.x;
        self._myPlayer.sprite.y = d.y;
      }
    });

    if (self._pendingStart) {
      self._doStart(self._pendingStart);
      self._pendingStart = null;
    }

    window.startPhaserGame = function(data) { self._doStart(data); };
  },

  _doStart: function(data) {
    var self = this;
    self._charId     = data.characterId || 0;
    self._spec       = data.specialization || 'TECH';
    self._playerData = data.player || {};
    SC.emit('player_ready', {
      characterId:    self._charId,
      specialization: self._spec,
      username:       self._playerData.username || 'Player',
    });
  },

  _initSelf: function(ps) {
    var self = this;
    if (self._myPlayer) {
      self._myPlayer.sprite.destroy();
      self._myPlayer.nameText.destroy();
    }

    var charId = ps.characterId || 0;
    var sprite = self.physics.add.sprite(ps.x, ps.y, 'char_' + charId, 0);
    sprite.setCollideWorldBounds(true).setDepth(10);
    sprite.setOrigin(0.5, 0.5);
    sprite.setDisplaySize(48, 72);
    sprite.anims.play('char_' + charId + '_idle', true);

    var nameText = self.add.text(ps.x, ps.y - 42, ps.username, {
      fontSize: '9px', fontFamily: "'Press Start 2P'",
      color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(11);

    self._myPlayer = { sprite: sprite, nameText: nameText, data: ps };
    self._spec = ps.specialization || 'NONE';
    self.cameras.main.startFollow(sprite, true, 0.1, 0.1);
    if (window.Minimap) Minimap.show();
    self._updateHUD(ps);
  },

  _addRemotePlayer: function(ps) {
    var self = this;
    if (self._remotePlayers[ps.playerId]) return;
    var charId = ps.characterId || 0;
    var sprite = self.add.sprite(ps.x, ps.y, 'char_' + charId, 0)
      .setDepth(9).setAlpha(0.85)
      .setOrigin(0.5, 0.5)
      .setDisplaySize(48, 72);
    sprite.anims.play('char_' + charId + '_idle', true);
    var nameText = self.add.text(ps.x, ps.y - 42, ps.username, {
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
    rp.data.targetX   = d.x;
    rp.data.targetY   = d.y;
    rp.data.direction = d.direction;
    rp.data.moving    = d.moving;
    rp.data.running   = d.running;
    rp.data.working   = d.working;
  },

  update: function(time, delta) {
    var self = this;
    var dt   = delta / 1000;

    self._updateNPCs(dt);
    self._updateCars(dt);

    if (window.DayNight)  DayNight.update(time, delta);
    if (window.Particles) Particles.update(time, delta, self.cameras.main);
    if (window.Audio)     Audio.update(delta / 1000);
    if (window.Lighting) {
      Lighting.update({
        camera:   self.cameras.main,
        skyLight: window.DayNight ? DayNight.getSkyLight() : 1,
        sources:  self._lightSources,
        player:   self._myPlayer ? { x: self._myPlayer.sprite.x, y: self._myPlayer.sprite.y } : null,
      });
    }

    if (!self._myPlayer) return;

    var sp      = self._myPlayer.sprite;
    var ps      = self._myPlayer.data;
    var cur     = self._cursors;
    var wasd    = self._wasd;
    var chatOpen = !!(window.Chat && Chat.isOpen());
    var running = self._shiftKey.isDown && !chatOpen;
    var working = JobSystem.isWorking();

    if (!chatOpen) {
      if (Phaser.Input.Keyboard.JustDown(self._mKey) && window.Minimap) Minimap.toggle();

      var tabDown = self._tabKey.isDown;
      if (tabDown && !self._scoreVisible) { self._scoreVisible = true; self._renderScoreboard(); }
      else if (!tabDown && self._scoreVisible) { self._scoreVisible = false; self._hideScoreboard(); }

      if (working && Phaser.Input.Keyboard.JustDown(self._escKey)) {
        SC.emit('cancel_job');
      }
    }

    var vx = 0, vy = 0;
    if (!working && !chatOpen) {
      if (cur.left.isDown  || wasd.left.isDown)  vx = -1;
      if (cur.right.isDown || wasd.right.isDown) vx =  1;
      if (cur.up.isDown    || wasd.up.isDown)    vy = -1;
      if (cur.down.isDown  || wasd.down.isDown)  vy =  1;
    }

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    var moving = vx !== 0 || vy !== 0;
    var speed  = (moving && running) ? CFG.SPEED * CFG.RUN_MULTIPLIER : CFG.SPEED;

    var direction = ps.direction || 'down';
    if      (vy < 0) direction = 'up';
    else if (vy > 0) direction = 'down';
    else if (vx < 0) direction = 'left';
    else if (vx > 0) direction = 'right';

    var kx = self._knockbackVel.x;
    var ky = self._knockbackVel.y;

    var nx = sp.x + (vx * speed + kx) * dt;
    var ny = sp.y + (vy * speed + ky) * dt;
    if (self._canWalk(nx, sp.y)) sp.x = nx;
    if (self._canWalk(sp.x, ny)) sp.y = ny;

    self._knockbackVel.x *= 0.90;
    self._knockbackVel.y *= 0.90;
    if (Math.abs(self._knockbackVel.x) < 5) self._knockbackVel.x = 0;
    if (Math.abs(self._knockbackVel.y) < 5) self._knockbackVel.y = 0;

    ps.direction = direction;
    ps.moving    = moving;
    ps.running   = moving && running;
    ps.working   = working;

    var animState;
    if      (working)           animState = 'work';
    else if (moving && running) animState = 'run';
    else if (moving)            animState = 'walk';
    else                        animState = 'idle';

    self._updateAnim(sp, ps.characterId || 0, animState, direction);

    self._myPlayer.nameText.x = sp.x;
    self._myPlayer.nameText.y = sp.y - 42;

    if (moving) {
      self._footTimer += dt;
      var stepInterval = ps.running ? 0.18 : 0.30;
      if (self._footTimer >= stepInterval) {
        self._footTimer = 0;
        if (window.Particles) Particles.footstep(sp.x, sp.y + 28);
        if (window.Audio) Audio.playSFX('sfx_footstep_' + self._getSurface(sp.x, sp.y) + '.ogg', { pitchVariance: 0.08 });
      }
    } else {
      self._footTimer = 0.3;
    }

    if (moving && running) {
      ps.food = Math.max(0, ps.food - CFG.DRAIN.FOOD_RUN  * dt);
    } else if (moving) {
      ps.food = Math.max(0, ps.food - CFG.DRAIN.FOOD_WALK * dt);
    } else {
      ps.food = Math.max(0, ps.food - CFG.DRAIN.FOOD_IDLE * dt);
    }
    if (ps.food <= 0) {
      ps.health = Math.max(0, ps.health - CFG.DRAIN.HEALTH_EMPTY * dt);
    } else if (ps.food > CFG.FOOD_REGEN_THRESHOLD && ps.health < 100) {
      ps.health = Math.min(100, ps.health + CFG.HEALTH_REGEN * dt);
    }
    self._updateHUD(ps);

    var eJustPressed = !chatOpen && Phaser.Input.Keyboard.JustDown(self._eKey);
    JobSystem.update(sp.x, sp.y, eJustPressed, self._spec);

    Object.keys(self._remotePlayers).forEach(function(pid) {
      var rp = self._remotePlayers[pid];
      if (rp.data.targetX === undefined) return;
      rp.sprite.x += (rp.data.targetX - rp.sprite.x) * 0.18;
      rp.sprite.y += (rp.data.targetY - rp.sprite.y) * 0.18;
      rp.nameText.x = rp.sprite.x;
      rp.nameText.y = rp.sprite.y - 42;
      var rpState;
      if      (rp.data.working)                    rpState = 'work';
      else if (rp.data.moving && rp.data.running)  rpState = 'run';
      else if (rp.data.moving)                     rpState = 'walk';
      else                                          rpState = 'idle';
      self._updateAnim(rp.sprite, rp.data.characterId || 0, rpState, rp.data.direction || 'down');
    });

    self._minimapTimer += delta;
    if (window.Minimap && self._minimapTimer >= 100) {
      self._minimapTimer = 0;
      var remotePts = [];
      Object.keys(self._remotePlayers).forEach(function(pid) {
        var r = self._remotePlayers[pid];
        remotePts.push({ x: r.sprite.x, y: r.sprite.y });
      });
      Minimap.update({ x: sp.x, y: sp.y }, remotePts);
    }

    self._moveTimer += delta;
    if (self._moveTimer >= 67) {
      self._moveTimer = 0;
      SC.emit('player_move', {
        x:         sp.x,
        y:         sp.y,
        direction: direction,
        moving:    moving,
        running:   ps.running,
        working:   working,
      });
    }
  },

  _renderScoreboard: function() {
    var el = document.getElementById('scoreboard');
    if (!el) return;
    var rows = this._scoreboard || [];
    var html = '<div class="sb-title">🏆 SCOREBOARD</div>';
    if (!rows.length) {
      html += '<div class="sb-empty">No data yet…</div>';
    } else {
      html += '<table class="sb-table"><tr><th>#</th><th>Player</th><th>💰</th><th>⭐ XP</th></tr>';
      rows.forEach(function(r, i) {
        html += '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td>' + String(r.username).replace(/[<>&]/g, '') + '</td>' +
          '<td>' + r.tokens + '</td>' +
          '<td>' + r.jobXp + '</td>' +
          '</tr>';
      });
      html += '</table>';
    }
    el.innerHTML = html;
    el.style.display = 'block';
  },

  _hideScoreboard: function() {
    var el = document.getElementById('scoreboard');
    if (el) el.style.display = 'none';
  },

  _updateAnim: function(sprite, charId, state, direction) {
    if      (direction === 'left')  sprite.flipX = true;
    else if (direction === 'right') sprite.flipX = false;
    sprite.anims.play('char_' + charId + '_' + state, true);
  },

  _getSurface: function(x, y) {
    var map = this._cityMap;
    if (!map) return 'stone';
    var tx = Math.floor(x / CFG.TILE);
    var ty = Math.floor(y / CFG.TILE);
    var tile = map[ty] && map[ty][tx];
    if (tile === CFG.T.ROAD)      return 'road';
    if (tile === CFG.T.GRASS)     return 'grass';
    if (tile === CFG.T.PARK_PATH) return 'gravel';
    return 'stone';
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
      var g = self.add.graphics().setDepth(2);
      g.lineStyle(2, parseInt(col.replace('#',''), 16), 0.5);
      g.strokeCircle(z.x, z.y, z.radius);
      g.fillStyle(parseInt(col.replace('#',''), 16), 0.08);
      g.fillCircle(z.x, z.y, z.radius);
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
    var NPC_SAFE_TILES = new Set([CFG.T.SIDEWALK, CFG.T.GRASS, CFG.T.PARK_PATH]);
    self._npcSafeTiles = NPC_SAFE_TILES;

    var pool = [];
    for (var ty = 0; ty < CFG.WORLD_H; ty++) {
      var row = self._cityMap[ty];
      if (!row) continue;
      for (var tx = 0; tx < CFG.WORLD_W; tx++) {
        if (NPC_SAFE_TILES.has(row[tx])) pool.push({ tx: tx, ty: ty });
      }
    }

    var count = Math.min(20, pool.length);
    for (var n = 0; n < count; n++) {
      var idx = Math.floor(Math.random() * pool.length);
      var cell = pool.splice(idx, 1)[0];
      var px = cell.tx * CFG.TILE + CFG.TILE / 2;
      var py = cell.ty * CFG.TILE + CFG.TILE / 2;
      var citizenId = Math.floor(Math.random() * 4);
      var sprite = self.add.sprite(px, py, 'citizen_' + citizenId, 0);
      sprite.setDepth(8).setOrigin(0.5, 0.5).setDisplaySize(32, 48);
      sprite.anims.play('citizen_' + citizenId + '_idle', true);
      self._npcs.push({
        sprite: sprite,
        citizenId: citizenId,
        state: 'idle',
        speed: 30 + Math.random() * 25,
        targetX: null,
        targetY: null,
        pauseTimer: 1 + Math.random() * 3,
        greetCooldown: 0,
        bubbleText: null,
        bubbleTimer: 0
      });
    }
  },

  _updateNPCs: function(dt) {
    var self = this;
    var NPC_SAFE_TILES = self._npcSafeTiles;

    self._npcs.forEach(function(npc) {
      if (npc.greetCooldown > 0) npc.greetCooldown = Math.max(0, npc.greetCooldown - dt);

      if (npc.bubbleText) {
        npc.bubbleTimer -= dt;
        if (npc.bubbleTimer <= 0) {
          npc.bubbleText.destroy();
          npc.bubbleText = null;
        } else {
          npc.bubbleText.x = npc.sprite.x;
          npc.bubbleText.y = npc.sprite.y - 36;
        }
      }

      var key = 'citizen_' + npc.citizenId;

      if (npc.state === 'idle') {
        npc.sprite.anims.play(key + '_idle', true);
        npc.pauseTimer -= dt;
        if (npc.pauseTimer <= 0) {
          var curTx = Math.floor(npc.sprite.x / CFG.TILE);
          var curTy = Math.floor(npc.sprite.y / CFG.TILE);
          var found = false;
          for (var a = 0; a < 5; a++) {
            var tx = curTx + Math.floor(Math.random() * 17) - 8;
            var ty = curTy + Math.floor(Math.random() * 17) - 8;
            if (tx < 0 || tx >= CFG.WORLD_W || ty < 0 || ty >= CFG.WORLD_H) continue;
            if (self._cityMap[ty] && NPC_SAFE_TILES.has(self._cityMap[ty][tx])) {
              npc.targetX = tx * CFG.TILE + CFG.TILE / 2;
              npc.targetY = ty * CFG.TILE + CFG.TILE / 2;
              npc.state = 'walking';
              found = true;
              break;
            }
          }
          if (!found) npc.pauseTimer = 2 + Math.random() * 2;
        }
      } else if (npc.state === 'walking') {
        npc.sprite.anims.play(key + '_walk', true);
        npc.sprite.flipX = (npc.targetX < npc.sprite.x);
        var dx = npc.targetX - npc.sprite.x;
        var dy = npc.targetY - npc.sprite.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 3) {
          npc.sprite.x = npc.targetX;
          npc.sprite.y = npc.targetY;
          npc.pauseTimer = 1 + Math.random() * 3;
          npc.state = 'idle';
        } else {
          npc.sprite.x += (dx / dist) * npc.speed * dt;
          npc.sprite.y += (dy / dist) * npc.speed * dt;
        }
      } else if (npc.state === 'waving') {
        npc.sprite.anims.play(key + '_wave', true);
        if (npc.bubbleTimer <= 0) {
          npc.state = 'idle';
          npc.pauseTimer = 2;
        }
      }

      if (self._myPlayer && npc.state !== 'waving' && npc.greetCooldown <= 0) {
        var pdx = npc.sprite.x - self._myPlayer.sprite.x;
        var pdy = npc.sprite.y - self._myPlayer.sprite.y;
        if (Math.sqrt(pdx * pdx + pdy * pdy) < 60) {
          if (npc.bubbleText) { npc.bubbleText.destroy(); npc.bubbleText = null; }
          npc.state = 'waving';
          npc.greetCooldown = 15;
          if (window.Audio) Audio.playSFX('sfx_npc_greet.ogg', { volume: 0.5, pitchVariance: 0.15 });
          var greetings = ["Nice day today!", "Welcome to the city!",
            "I hear the Chef job pays well!", "Have you visited the park?",
            "Watch out for traffic!", "The Tech Office is hiring!",
            "Don't forget to eat!", "Great weather for a walk!",
            "The Art Gallery has new exhibits!", "Stay safe out there!"];
          var greeting = greetings[Math.floor(Math.random() * greetings.length)];
          npc.bubbleText = self.add.text(npc.sprite.x, npc.sprite.y - 36, greeting, {
            fontSize: '7px',
            fontFamily: "'Press Start 2P'",
            color: '#fff',
            backgroundColor: 'rgba(0,0,0,0.8)',
            padding: { x: 6, y: 4 },
            stroke: '#ffd700',
            strokeThickness: 1
          }).setOrigin(0.5, 1).setDepth(12);
          npc.bubbleTimer = 3;
        }
      }
    });
  },

  _spawnCars: function() {
    var self = this;
    [{x:200,y:272,vx:60,ci:0},{x:1200,y:288,vx:-50,ci:1},{x:100,y:800,vx:70,ci:2},
     {x:700,y:816,vx:-45,ci:3},{x:400,y:1312,vx:55,ci:4}].forEach(function(def) {
      var container = self.add.container(def.x, def.y);
      container.setDepth(7);

      var body = self.add.image(0, 0, 'car_' + def.ci);
      body.setOrigin(0.5, 0.5);
      if (def.vx < 0) body.flipX = true;
      container.add(body);

      var frontWheelX = def.vx > 0 ? 14 : -14;
      var rearWheelX  = def.vx > 0 ? -14 : 14;
      var w1 = self.add.image(rearWheelX, 10, 'wheel_dot');
      var w2 = self.add.image(frontWheelX, 10, 'wheel_dot');
      container.add(w1);
      container.add(w2);

      var exhaustOffsetX = def.vx > 0 ? -24 : 24;
      var emitter = self.add.particles(def.x + exhaustOffsetX, def.y + 4, 'smoke_puff', {
        speed: { min: 5, max: 20 },
        scale: { start: 0.8, end: 0.2 },
        alpha: { start: 0.5, end: 0 },
        lifespan: 600,
        frequency: 200,
        maxParticles: 8,
        blendMode: 'NORMAL'
      });
      emitter.setDepth(6);
      emitter.startFollow(container, exhaustOffsetX, 4);

      self._cars.push({
        container: container,
        body: body,
        vx: def.vx,
        effectiveVx: def.vx,
        baseY: def.y,
        wheels: [w1, w2],
        braking: false,
        emitter: emitter
      });
    });
  },

  _updateCars: function(dt) {
    var self = this;
    var W = CFG.WORLD_W * CFG.TILE;
    self._carBobT = (self._carBobT || 0) + dt;

    self._cars.forEach(function(car) {
      car.braking = false;
      var ahead = car.vx > 0 ? 1 : -1;
      if (self._myPlayer && self._carHitCooldown <= 0) {
        var pdx = self._myPlayer.sprite.x - car.container.x;
        var pdy = self._myPlayer.sprite.y - car.container.y;
        if (pdx * ahead > 0 && Math.abs(pdx) < 80 && Math.abs(pdy) < 20) car.braking = true;
      }
      for (var j = 0; j < self._cars.length; j++) {
        var other = self._cars[j];
        if (other === car) continue;
        var cdx = other.container.x - car.container.x;
        var cdy = other.container.y - car.container.y;
        if (cdx * ahead > 0 && Math.abs(cdx) < 80 && Math.abs(cdy) < 20) car.braking = true;
      }

      if (car.braking) {
        car.effectiveVx *= 0.92;
        if (Math.abs(car.effectiveVx) < 1) car.effectiveVx = 0;
      } else {
        car.effectiveVx += (car.vx - car.effectiveVx) * 0.05;
      }
      car.container.x += car.effectiveVx * dt;

      car.container.y = car.baseY + Math.sin(self._carBobT * 4) * 1.5;

      car.wheels[0].rotation += car.effectiveVx * dt * 0.05;
      car.wheels[1].rotation += car.effectiveVx * dt * 0.05;

      if (car.effectiveVx > 0 && car.container.x > W + 60) { car.container.x = -60; car.effectiveVx = car.vx; }
      if (car.effectiveVx < 0 && car.container.x < -60)    { car.container.x = W + 60; car.effectiveVx = car.vx; }

      if (self._myPlayer && self._carHitCooldown <= 0 && Math.abs(car.effectiveVx) > 15) {
        var ps = self._myPlayer.data;
        var sp = self._myPlayer.sprite;
        var hitDx = sp.x - car.container.x;
        var hitDy = sp.y - car.container.y;
        if (Math.abs(hitDx) < 30 && Math.abs(hitDy) < 18) {
          ps.health = Math.max(0, ps.health - 10);
          var knockDir = car.vx > 0 ? 1 : -1;
          self._knockbackVel.x = knockDir * 500;
          self._knockbackVel.y = -180;
          self._carHitCooldown = 1.5;
          sp.setTint(0xff0000);
          self.time.delayedCall(300, function() { sp.clearTint(); });
          self._updateHUD(ps);
          if (window.Audio) Audio.playSFX('sfx_car_hit.ogg', { priority: 'high' });
        }
      }
    });

    if (self._carHitCooldown > 0) self._carHitCooldown -= dt;
  },
});

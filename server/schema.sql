CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  save_code TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  character_id INTEGER DEFAULT 0,
  specialization TEXT DEFAULT 'NONE',
  tokens INTEGER DEFAULT 100,
  health REAL DEFAULT 100.0,
  food REAL DEFAULT 100.0,
  job_xp INTEGER DEFAULT 0,
  job_tier INTEGER DEFAULT 0,
  house_level INTEGER DEFAULT 1,
  house_furniture TEXT DEFAULT '[]',
  outfit TEXT DEFAULT '{}',
  spawn_x REAL DEFAULT 1120,
  spawn_y REAL DEFAULT 1120,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  specialization TEXT NOT NULL,
  completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  tokens_earned INTEGER DEFAULT 0,
  xp_earned INTEGER DEFAULT 0,
  FOREIGN KEY (player_id) REFERENCES players(id)
);

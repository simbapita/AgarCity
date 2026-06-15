const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/game.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

const stmts = {
  create: db.prepare(`
    INSERT INTO players (id, save_code, username, character_id, specialization, tokens)
    VALUES (@id, @saveCode, @username, @characterId, @specialization, @tokens)
  `),
  findBySaveCode: db.prepare('SELECT * FROM players WHERE save_code = ?'),
  findById: db.prepare('SELECT * FROM players WHERE id = ?'),
  updateStats: db.prepare(`
    UPDATE players SET tokens=@tokens, health=@health, food=@food,
    last_seen=CURRENT_TIMESTAMP WHERE id=@id
  `),
  updateProgress: db.prepare(`
    UPDATE players SET specialization=@specialization, job_xp=@jobXp,
    job_tier=@jobTier, character_id=@characterId, outfit=@outfit,
    last_seen=CURRENT_TIMESTAMP WHERE id=@id
  `),
  updateSpawn: db.prepare('UPDATE players SET spawn_x=@x, spawn_y=@y WHERE id=@id'),
};

module.exports = { db, stmts };

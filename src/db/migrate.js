'use strict';

if (require.main === module) {
  const { loadEnv } = require('../load-env');
  loadEnv();
}

const { getDb } = require('../database');

function migrate() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id      INTEGER PRIMARY KEY,
      name    TEXT,
      username TEXT UNIQUE,
      email   TEXT,
      phone   TEXT,
      website TEXT,
      address TEXT,
      company TEXT
    );

    CREATE TABLE IF NOT EXISTS posts (
      id      INTEGER PRIMARY KEY,
      userId  INTEGER,
      title   TEXT,
      body    TEXT,
      FOREIGN KEY(userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id      INTEGER PRIMARY KEY,
      postId  INTEGER,
      name    TEXT,
      email   TEXT,
      body    TEXT,
      FOREIGN KEY(postId) REFERENCES posts(id)
    );

    CREATE TABLE IF NOT EXISTS albums (
      id     INTEGER PRIMARY KEY,
      userId INTEGER,
      title  TEXT,
      FOREIGN KEY(userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS photos (
      id           INTEGER PRIMARY KEY,
      albumId      INTEGER,
      title        TEXT,
      url          TEXT,
      thumbnailUrl TEXT,
      FOREIGN KEY(albumId) REFERENCES albums(id)
    );

    CREATE TABLE IF NOT EXISTS todos (
      id        INTEGER PRIMARY KEY,
      userId    INTEGER,
      title     TEXT,
      completed INTEGER DEFAULT 0,
      FOREIGN KEY(userId) REFERENCES users(id)
    );
  `);
}

if (require.main === module) {
  try {
    migrate();
    console.log('[DB] Migration complete.');
  } catch (err) {
    console.error('[DB] Migration failed:', err.message);
    process.exit(1);
  }
}

module.exports = { migrate };

'use strict';

/* v8 ignore next 3 */
if (require.main === module) {
  const { loadEnv } = require('../load-env');
  loadEnv();
}
const { getWrappedDb } = require('../database');

function migrate() {
  console.log('[Migrate] Start migrating...');

  try {
    const db = getWrappedDb();
    db.exec(`
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

    console.log('[Migrate] Migration complete.');
  } catch (error) {
    console.error('[Migrate] Migration failed:', error.message);
    throw error;
  }
}

/* v8 ignore next 3 */
if (require.main === module) {
  migrate();
}

module.exports = { migrate };

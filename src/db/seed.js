'use strict';

/* v8 ignore next 3 */
if (require.main === module) {
  const { loadEnv } = require('../config/load-env');
  loadEnv();
}

const { getWrappedDb } = require('.');
const { migrate } = require('./migrate');

const BASE = process.env.SEED_API_BASE_URL || 'https://jsonplaceholder.typicode.com';

/* v8 ignore start */
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
/* v8 ignore stop */

async function seed({ database = getWrappedDb(), fetch: fetchFn = fetchJSON, runMigrate = true } = {}) {
  if (runMigrate) migrate();
  const db = database;
  const row = db.prepare('SELECT COUNT(*) as rowCount FROM users').get();
  if (row.rowCount > 0) {
    console.log('[DB] Already seeded, skipping.');
    return;
  }

  const t0 = Date.now();
  db.exec('BEGIN');

  try {
    console.log('  [fetch] GET /users');
    const t1 = Date.now();
    const users = await fetchFn(`${BASE}/users`);
    const insertUser = db.prepare(`INSERT INTO users (id,name,username,email,phone,website,address,company) VALUES (?,?,?,?,?,?,?,?)`);
    for (const user of users) {
      insertUser.run(user.id, user.name, user.username, user.email, user.phone, user.website, JSON.stringify(user.address), JSON.stringify(user.company));
    }
    console.log(`  [done] users: ${users.length} rows in ${Date.now() - t1}ms`);

    console.log('  [fetch] GET /posts');
    const t2 = Date.now();
    const posts = await fetchFn(`${BASE}/posts`);
    const insertPost = db.prepare(`INSERT INTO posts (id,userId,title,body) VALUES (?,?,?,?)`);
    for (const post of posts) {
      insertPost.run(post.id, post.userId, post.title, post.body);
    }
    console.log(`  [done] posts: ${posts.length} rows in ${Date.now() - t2}ms`);

    console.log('  [fetch] GET /comments');
    const t3 = Date.now();
    const comments = await fetchFn(`${BASE}/comments`);
    const insertComment = db.prepare(`INSERT INTO comments (id,postId,name,email,body) VALUES (?,?,?,?,?)`);
    for (const comment of comments) {
      insertComment.run(comment.id, comment.postId, comment.name, comment.email, comment.body);
    }
    console.log(`  [done] comments: ${comments.length} rows in ${Date.now() - t3}ms`);

    console.log('  [fetch] GET /albums');
    const t4 = Date.now();
    const albums = await fetchFn(`${BASE}/albums`);
    const insertAlbum = db.prepare(`INSERT INTO albums (id,userId,title) VALUES (?,?,?)`);
    for (const album of albums) {
      insertAlbum.run(album.id, album.userId, album.title);
    }
    console.log(`  [done] albums: ${albums.length} rows in ${Date.now() - t4}ms`);

    console.log('  [fetch] GET /photos');
    const t5 = Date.now();
    const photos = await fetchFn(`${BASE}/photos`);
    const insertPhoto = db.prepare(`INSERT INTO photos (id,albumId,title,url,thumbnailUrl) VALUES (?,?,?,?,?)`);
    for (const photo of photos) {
      insertPhoto.run(photo.id, photo.albumId, photo.title, photo.url, photo.thumbnailUrl);
    }
    console.log(`  [done] photos: ${photos.length} rows in ${Date.now() - t5}ms`);

    console.log('  [fetch] GET /todos');
    const t6 = Date.now();
    const todos = await fetchFn(`${BASE}/todos`);
    const insertTodo = db.prepare(`INSERT INTO todos (id,userId,title,completed) VALUES (?,?,?,?)`);
    for (const todo of todos) {
      insertTodo.run(todo.id, todo.userId, todo.title, todo.completed ? 1 : 0);
    }
    console.log(`  [done] todos: ${todos.length} rows in ${Date.now() - t6}ms`);

    db.exec('COMMIT');
    console.log(`[DB] Seeding done in ${Date.now() - t0}ms`);
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('[DB] Seeding failed:', error.message);
    throw error;
  }
}

/* v8 ignore next 5 */
if (require.main === module) {
  seed().then(() => process.exit(0)).catch((error) => {
    console.error('[DB] Seeding failed:', error.message);
    process.exit(1);
  });
}

module.exports = { seed };

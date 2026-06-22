'use strict';

const { DatabaseSync } = require('node:sqlite');
const { dbPath } = require('./config');

let db;

function getDb() {
  if (!db) {
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('PRAGMA foreign_keys=ON');
  }
  return db;
}

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

function seed() {
  const d = getDb();
  const count = d.prepare('SELECT COUNT(*) as c FROM users').get();
  if (count.c > 0) return;

  console.log('[DB] Seeding initial data…');

  const users = [
    { id: 1, name: 'Leanne Graham', username: 'Bret', email: 'Sincere@april.biz', phone: '1-770-736-8031 x56442', website: 'hildegard.org', address: JSON.stringify({ street: 'Kulas Light', suite: 'Apt. 556', city: 'Gwenborough', zipcode: '92998-3874', geo: { lat: '-37.3159', lng: '81.1496' } }), company: JSON.stringify({ name: 'Romaguera-Crona', catchPhrase: 'Multi-layered client-server neural-net', bs: 'harness real-time e-markets' }) },
    { id: 2, name: 'Ervin Howell', username: 'Antonette', email: 'Shanna@melissa.tv', phone: '010-692-6593 x09125', website: 'anastasia.net', address: JSON.stringify({ street: 'Victor Plains', suite: 'Suite 879', city: 'Wisokyburgh', zipcode: '90566-7771', geo: { lat: '-43.9509', lng: '-34.7618' } }), company: JSON.stringify({ name: 'Deckow-Crist', catchPhrase: 'Proactive didactic contingency', bs: 'synergize scalable supply-chains' }) },
    { id: 3, name: 'Clementine Bauch', username: 'Samantha', email: 'Nathan@yesenia.net', phone: '1-463-123-4447', website: 'ramiro.info', address: JSON.stringify({ street: 'Douglas Extension', suite: 'Suite 847', city: 'McKenziehaven', zipcode: '59590-4157', geo: { lat: '-68.6102', lng: '-47.0653' } }), company: JSON.stringify({ name: 'Romaguera-Jacobson', catchPhrase: 'Face to face bifurcated interface', bs: 'e-enable strategic applications' }) },
    { id: 4, name: 'Patricia Lebsack', username: 'Karianne', email: 'Julianne.OConner@kory.org', phone: '493-170-9623 x156', website: 'kale.biz', address: JSON.stringify({ street: 'Hoeger Mall', suite: 'Apt. 692', city: 'South Elvis', zipcode: '53919-4257', geo: { lat: '29.4572', lng: '-164.2990' } }), company: JSON.stringify({ name: 'Robel-Corkery', catchPhrase: 'Multi-tiered zero tolerance productivity', bs: 'transition cutting-edge web services' }) },
    { id: 5, name: 'Chelsey Dietrich', username: 'Kamren', email: 'Lucio_Hettinger@annie.ca', phone: '(254)954-1289', website: 'demarco.info', address: JSON.stringify({ street: 'Skiles Walks', suite: 'Suite 351', city: 'Roscoeview', zipcode: '33263', geo: { lat: '-31.8129', lng: '62.5342' } }), company: JSON.stringify({ name: 'Keebler LLC', catchPhrase: 'User-centric fault-tolerant solution', bs: 'revolutionize end-to-end systems' }) },
  ];

  const insertUser = d.prepare(`INSERT INTO users (id,name,username,email,phone,website,address,company) VALUES (?,?,?,?,?,?,?,?)`);
  for (const u of users) {
    insertUser.run(u.id, u.name, u.username, u.email, u.phone, u.website, u.address, u.company);
  }

  const insertPost = d.prepare(`INSERT INTO posts (id,userId,title,body) VALUES (?,?,?,?)`);
  const titles = ['sunt aut facere repellat provident', 'qui est esse', 'ea molestias quasi exercitationem', 'eum et est occaecati', 'nesciunt quas odio', 'dolorem eum magni eos aperiam', 'magnam facilis autem', 'dolorem dolore est ipsam', 'nesciunt iure omnis dolorem', 'optio molestias id quia eum'];
  const bodies = ['quia et suscipit\nsuscipit recusandae consequuntur', 'est rerum tempore vitae\nsequi sint nihil reprehenderit dolor', 'et iusto sed quo iure\nvoluptatem occaecati omnis eligendi', 'ullam et saepe reiciendis voluptatem adipisci\nsit amet autem assumenda', 'repudiandae veniam quaerat sunt sed\nalias aut fugiat sit autem', 'ut aspernatur corporis harum nihil quis', 'eveniet quod temporibus', 'in ut explicabo rerum consectetur aut', 'eum accusamus quia doloribus', 'voluptas blanditiis repellat itaque'];
  let postId = 1;
  for (let u = 1; u <= 5; u++) {
    for (let i = 0; i < 10; i++, postId++) {
      insertPost.run(postId, u, titles[i], bodies[i]);
    }
  }

  const insertComment = d.prepare(`INSERT INTO comments (id,postId,name,email,body) VALUES (?,?,?,?,?)`);
  let commentId = 1;
  for (let p = 1; p <= 50; p++) {
    for (let i = 0; i < 5; i++, commentId++) {
      insertComment.run(commentId, p, `Comment ${i + 1} on post ${p}`, `commenter${commentId}@example.com`, `Great post! Comment body ${commentId}.`);
    }
  }

  const insertAlbum = d.prepare(`INSERT INTO albums (id,userId,title) VALUES (?,?,?)`);
  const albumTitles = ['quidem molestiae enim', 'sunt qui excepturi placeat culpa', 'omnis laborum odio', 'non esse culpa molestiae omnis sed optio', 'eaque aut omnis a', 'natus impedit quibusdam illo est', 'quibusdam autem aliquid et et quia', 'cum voluptatibus rerum architecto harum nihil', 'quisquam choro et aut officiis'];
  let albumId = 1;
  for (let u = 1; u <= 5; u++) {
    for (let i = 0; i < 2; i++, albumId++) {
      insertAlbum.run(albumId, u, albumTitles[(albumId - 1) % albumTitles.length]);
    }
  }

  const insertPhoto = d.prepare(`INSERT INTO photos (id,albumId,title,url,thumbnailUrl) VALUES (?,?,?,?,?)`);
  let photoId = 1;
  for (let a = 1; a <= 10; a++) {
    for (let i = 0; i < 5; i++, photoId++) {
      insertPhoto.run(photoId, a, `Photo ${photoId}`, `https://via.placeholder.com/600/${photoId}`, `https://via.placeholder.com/150/${photoId}`);
    }
  }

  const insertTodo = d.prepare(`INSERT INTO todos (id,userId,title,completed) VALUES (?,?,?,?)`);
  const todoTitles = ['delectus aut autem', 'quis ut nam facilis et officia qui', 'fugiat veniam minus', 'et porro tempora'];
  let todoId = 1;
  for (let u = 1; u <= 5; u++) {
    for (let i = 0; i < 4; i++, todoId++) {
      insertTodo.run(todoId, u, todoTitles[i], todoId % 2 === 0 ? 1 : 0);
    }
  }

  console.log('[DB] Seeding done.');
}

function parseRow(table, row) {
  if (!row) return null;
  const r = { ...row };
  if ('address' in r && typeof r.address === 'string') {
    try { r.address = JSON.parse(r.address); } catch (_) { }
  }
  if ('company' in r && typeof r.company === 'string') {
    try { r.company = JSON.parse(r.company); } catch (_) { }
  }
  if ('completed' in r) {
    r.completed = Boolean(r.completed);
  }
  return r;
}

const TABLES = ['users', 'posts', 'comments', 'albums', 'photos', 'todos'];

const FILTER_COLS = {
  users: ['id', 'name', 'username', 'email', 'phone', 'website'],
  posts: ['id', 'userId', 'title'],
  comments: ['id', 'postId', 'name', 'email'],
  albums: ['id', 'userId', 'title'],
  photos: ['id', 'albumId', 'title', 'url', 'thumbnailUrl'],
  todos: ['id', 'userId', 'title', 'completed'],
};

function buildWhere(table, query) {
  const cols = FILTER_COLS[table] || [];
  const clauses = [];
  const values = [];

  for (const [k, v] of Object.entries(query)) {
    if (cols.includes(k)) {
      clauses.push(`${k} = ?`);
      values.push(k === 'completed' ? (v === 'true' ? 1 : 0) : v);
    }
  }
  return {
    where: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '',
    values,
  };
}

function listAll(table, query = {}) {
  const d = getDb();
  const { where, values } = buildWhere(table, query);
  const rows = d.prepare(`SELECT * FROM ${table}${where}`).all(...values);
  return rows.map((r) => parseRow(table, r));
}

function getOne(table, id) {
  const d = getDb();
  const row = d.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  return parseRow(table, row);
}

function insertOne(table, data) {
  const d = getDb();
  const cols = Object.keys(data);
  const placeholders = cols.map(() => '?').join(',');
  const vals = cols.map((c) => {
    if (typeof data[c] === 'object' && data[c] !== null) return JSON.stringify(data[c]);
    if (typeof data[c] === 'boolean') return data[c] ? 1 : 0;
    return data[c];
  });
  const result = d.prepare(
    `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`
  ).run(...vals);
  return getOne(table, result.lastInsertRowid);
}

function updateOne(table, id, data, replace = false) {
  const d = getDb();
  const existing = getOne(table, id);
  if (!existing) return null;
  const merged = replace ? { ...data, id } : { ...existing, ...data, id };
  const cols = Object.keys(merged).filter((c) => c !== 'id');
  const setClauses = cols.map((c) => `${c} = ?`).join(', ');
  const vals = cols.map((c) => {
    if (typeof merged[c] === 'object' && merged[c] !== null) return JSON.stringify(merged[c]);
    if (typeof merged[c] === 'boolean') return merged[c] ? 1 : 0;
    return merged[c] ?? null;
  });
  d.prepare(`UPDATE ${table} SET ${setClauses} WHERE id = ?`).run(...vals, id);
  return getOne(table, id);
}

function deleteOne(table, id) {
  const d = getDb();
  const existing = getOne(table, id);
  if (!existing) return null;
  d.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return existing;
}

function nextId(table) {
  const d = getDb();
  const row = d.prepare(`SELECT MAX(id) as m FROM ${table}`).get();
  return (row.m || 0) + 1;
}

module.exports = { migrate, seed, listAll, getOne, insertOne, updateOne, deleteOne, nextId, TABLES };

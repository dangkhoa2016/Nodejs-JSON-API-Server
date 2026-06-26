'use strict';

const { DatabaseSync } = require('node:sqlite');
const { dbPath, dbDebugSql } = require('../config');
const { wrapDb } = require('./sql-logger');

let db;
let wrappedDb;

function getDb() {
  if (!db) {
    const raw = new DatabaseSync(dbPath);
    raw.exec('PRAGMA journal_mode=WAL');
    raw.exec('PRAGMA foreign_keys=ON');
    db = raw;
  }
  return db;
}

function getWrappedDb() {
  if (!dbDebugSql) return getDb();
  if (!wrappedDb) wrappedDb = wrapDb(getDb());
  return wrappedDb;
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
  const d = getWrappedDb();
  const { where, values } = buildWhere(table, query);
  const rows = d.prepare(`SELECT * FROM ${table}${where}`).all(...values);
  return rows.map((r) => parseRow(table, r));
}

function getOne(table, id) {
  const d = getWrappedDb();
  const row = d.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  return parseRow(table, row);
}

function insertOne(table, data) {
  const d = getWrappedDb();
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
  const d = getWrappedDb();
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
  const d = getWrappedDb();
  const existing = getOne(table, id);
  if (!existing) return null;
  d.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return existing;
}

function nextId(table) {
  const d = getWrappedDb();
  const row = d.prepare(`SELECT MAX(id) as m FROM ${table}`).get();
  return (row.m || 0) + 1;
}

module.exports = { getDb, getWrappedDb, listAll, getOne, insertOne, updateOne, deleteOne, nextId, TABLES };

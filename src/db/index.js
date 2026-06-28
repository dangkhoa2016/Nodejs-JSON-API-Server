'use strict';

const { DatabaseSync } = require('node:sqlite');
const { dbPath, dbDebugSql, defaultPageSize } = require('../config');
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

const TABLES = ['users', 'posts', 'comments', 'albums', 'photos', 'todos', 'settings'];

const FILTER_COLS = {
  users: ['id', 'name', 'username', 'email', 'phone', 'website'],
  posts: ['id', 'userId', 'title'],
  comments: ['id', 'postId', 'name', 'email'],
  albums: ['id', 'userId', 'title'],
  photos: ['id', 'albumId', 'title', 'url', 'thumbnailUrl'],
  todos: ['id', 'userId', 'title', 'completed'],
  settings: ['id', 'key', 'value', 'description'],
};

const SEARCH_COLS = {
  users: ['name', 'username', 'email'],
  posts: ['title', 'body'],
  comments: ['name', 'email', 'body'],
  albums: ['title'],
  photos: ['title'],
  todos: ['title'],
  settings: ['key', 'value', 'description'],
};

function buildWhere(table, query = {}) {
  const filters = {};
  let page, limit, start, end, sort, order, search;

  for (const [k, v] of Object.entries(query)) {
    switch (k) {
      case '_page': page = parseInt(v, 10); break;
      case '_limit': limit = parseInt(v, 10); break;
      case '_start': start = parseInt(v, 10); break;
      case '_end': end = parseInt(v, 10); break;
      case '_sort': sort = v; break;
      case '_order': order = v; break;
      case 'q': search = v; break;
      default: filters[k] = v; break;
    }
  }

  const cols = FILTER_COLS[table] || [];
  const clauses = [];
  const values = [];

  for (const [k, v] of Object.entries(filters)) {
    const isKnownCol = cols.includes(k);
    if (isKnownCol) {
      clauses.push(`${k} = ?`);
      values.push(k === 'completed' ? (v === 'true' ? 1 : 0) : v);
    }
  }

  const searchCols = SEARCH_COLS[table] || [];
  if (search && searchCols.length > 0) {
    const escaped = search.replace(/[%_\\]/g, '\\$&');
    const searchClauses = searchCols.map((c) => `${c} LIKE ? ESCAPE '\\'`);
    const likeVal = `%${escaped}%`;
    clauses.push(`(${searchClauses.join(' OR ')})`);
    for (const _ of searchCols) values.push(likeVal);
  }

  const hasClauses = clauses.length > 0;
  let sql = `SELECT * FROM ${table}`;
  if (hasClauses) {
    sql += ' WHERE ' + clauses.join(' AND ');
  }

  const allCols = [...new Set([...cols, ...searchCols])];
  const safeSort = sort && allCols.includes(sort) ? sort : null;
  if (safeSort) {
    const dir = order && ['asc', 'desc'].includes(order.toLowerCase()) ? order.toUpperCase() : 'ASC';
    sql += ` ORDER BY "${safeSort}" ${dir}`;
  }
  const hasPage = page !== undefined;
  const hasLimit = limit !== undefined;
  if (start !== undefined) {
    const lim = end !== undefined ? end - start : -1;
    sql += ` LIMIT ${lim} OFFSET ${start}`;
  } else if (hasPage || hasLimit) {
    const p = hasPage ? page : 1;
    const lim = hasLimit ? limit : defaultPageSize;
    sql += ` LIMIT ${lim} OFFSET ${(p - 1) * lim}`;
  }

  return { sql, values };
}

function listAll(table, query = {}) {
  const d = getWrappedDb();
  const { sql, values } = buildWhere(table, query);
  const rows = d.prepare(sql).all(...values);
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
  const m = row.m ?? 0;
  return m + 1;
}

module.exports = { getDb, getWrappedDb, buildWhere, listAll, getOne, insertOne, updateOne, deleteOne, nextId, TABLES };

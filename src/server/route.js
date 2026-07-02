'use strict';

const { port, maxBodySize, adminKey, sensitiveKeys, rateLimitEnabled, rateLimitMax, rateLimitWindowMs, rateLimitWindowSec } = require('../config');
const argon2 = require('argon2');
const db = require('../db');
const { seed } = require('../db/seed');
const { SETTING_DEFS } = require('../db/seed-settings');

module.exports = function createRouter(rateLimiter, faviconIco, faviconPng, redis) {
  function json(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'X-Powered-By': 'json-api-server/1.0',
    });
    res.end(body);
  }

  function notFound(res, msg = 'Not Found') {
    json(res, 404, { error: msg });
  }

  function badRequest(res, msg = 'Bad Request') {
    json(res, 400, { error: msg });
  }

  const BODY_TOO_LARGE = Symbol('BODY_TOO_LARGE');

  function readBody(req, res) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > maxBodySize) {
          json(res, 413, { error: 'Request body too large', message: `Body exceeds ${maxBodySize} bytes limit` });
          req.destroy();
          reject(BODY_TOO_LARGE);
        }
      });
      req.on('end', () => {
        try {
          let parsed = body ? JSON.parse(body) : {};
          if (parsed === null) parsed = {};
          resolve(parsed);
        } catch (_) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  async function readBodySafe(req, res) {
    try {
      return await readBody(req, res);
    } catch (e) {
      if (e !== BODY_TOO_LARGE) badRequest(res, 'Invalid JSON body');
    }
    return null;
  }

  function parseRoute(pathname) {
    const parts = pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts[0] !== 'api') return null;
    parts.shift();

    const [table, rawId, sub] = parts;
    const id = rawId ? parseInt(rawId, 10) : null;

    if (!db.TABLES.includes(table)) return null;
    if (rawId && isNaN(id)) return { invalidId: true };

    return { table, id, sub };
  }

  const NESTED = {
    users: { posts: 'userId', albums: 'userId', todos: 'userId' },
    posts: { comments: 'postId' },
    albums: { photos: 'albumId' },
  };

  async function handleGET(req, res, route, query) {
    const { table, id, sub } = route;

    for (const param of ['_page', '_limit', '_start', '_end']) {
      if (query[param] !== undefined) {
        if (query[param] === '') {
          delete query[param];
        } else {
          const val = Number(query[param]);
          if (!Number.isInteger(val) || val < 0) {
            return badRequest(res, `Invalid ${param}: must be a non-negative integer`);
          }
          if ((param === '_page' || param === '_limit') && val < 1) {
            return badRequest(res, `Invalid ${param}: must be a positive integer`);
          }
        }
      }
    }

    if (id !== null && sub) {
      const parentExists = db.getOne(table, id);
      if (!parentExists) return notFound(res);

      const fkMap = NESTED[table] || {};
      if (!fkMap[sub]) return notFound(res, `No nested route '${sub}' under '${table}'`);

      const results = db.listAll(sub, { [fkMap[sub]]: String(id), ...query });
      return json(res, 200, results);
    }

    if (id !== null) {
      const row = db.getOne(table, id);
      return row ? json(res, 200, row) : notFound(res);
    }

    const rows = db.listAll(table, query);
    json(res, 200, rows);
  }

  async function handlePOST(req, res, route) {
    const { table } = route;
    const body = await readBodySafe(req, res);
    if (body === null) return;

    if (!body.id) body.id = db.nextId(table);

    try {
      const created = db.insertOne(table, body);
      json(res, 201, created);
    } catch (e) {
      badRequest(res, e.message);
    }
  }

  async function handlePUT(req, res, route) {
    const { table, id } = route;
    if (id === null) return badRequest(res, 'PUT requires an id');

    const body = await readBodySafe(req, res);
    if (body === null) return;

    const updated = db.updateOne(table, id, body, true);
    updated ? json(res, 200, updated) : notFound(res);
  }

  async function handlePATCH(req, res, route) {
    const { table, id } = route;
    if (id === null) return badRequest(res, 'PATCH requires an id');

    const body = await readBodySafe(req, res);
    if (body === null) return;

    const updated = db.updateOne(table, id, body, false);
    updated ? json(res, 200, updated) : notFound(res);
  }

  function handleDELETE(_req, res, route) {
    const { table, id } = route;
    if (id === null) return badRequest(res, 'DELETE requires an id');

    const deleted = db.deleteOne(table, id);
    deleted ? json(res, 200, {}) : notFound(res);
  }

  function handleHealth(res) {
    json(res, 200, {
      status: 'ok',
      redis: redis.connected ? 'connected' : 'disconnected',
      tables: db.TABLES,
      rateLimit: {
        enabled: rateLimitEnabled,
        max: rateLimitMax,
        windowMs: rateLimitWindowMs,
      },
    });
  }

  const authCache = new Map();
  const AUTH_CACHE_TTL_MS = 5_000;

  function getCachedAuth(token) {
    const entry = authCache.get(token);
    if (entry && Date.now() - entry.ts < AUTH_CACHE_TTL_MS) {
      return entry.valid;
    }
    authCache.delete(token);
    return undefined;
  }

  function setCachedAuth(token, valid) {
    if (authCache.size > 1000) {
      const cutoff = Date.now() - AUTH_CACHE_TTL_MS;
      for (const [key, entry] of authCache) {
        if (entry.ts < cutoff) authCache.delete(key);
      }
    }
    authCache.set(token, { valid, ts: Date.now() });
  }

  function resetAuthCache() {
    authCache.clear();
  }

  async function checkAdminAuth(req) {
    if (!adminKey) return false;
    const auth = req.headers['authorization'] || '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match) return false;
    const token = match[1];
    const cached = getCachedAuth(token);
    if (cached !== undefined) return cached;
    try {
      const d = db.getWrappedDb();
      const row = d.prepare('SELECT value FROM settings WHERE key = ?').get('ADMIN_KEY');
      if (!row) return false;
      const valid = await argon2.verify(row.value, token);
      setCachedAuth(token, valid);
      return valid;
    } catch {
      setCachedAuth(token, false);
      return false;
    }
  }

  async function handleAdmin(req, res, pathname, method) {
    if (!(await checkAdminAuth(req))) {
      return json(res, 401, { error: 'Unauthorized' });
    }

    if (pathname === '/api/admin/settings' && method === 'GET') {
      const rows = db.listAll('settings').map((r) => sensitiveKeys.includes(r.key) ? { ...r, value: '***' } : r);
      return json(res, 200, rows);
    }

    const settingsMatch = pathname.match(/^\/api\/admin\/settings\/(.+)$/);
    if (settingsMatch && method === 'PATCH') {
      return await handleAdminPatchSetting(req, res, settingsMatch[1]);
    }

    if (pathname === '/api/admin/reset-database' && method === 'POST') {
      return await handleAdminResetDatabase(req, res);
    }

    return notFound(res, `Unknown admin route: ${pathname}`);
  }

  async function handleAdminPatchSetting(req, res, settingKey) {
    const body = await readBodySafe(req, res);
    if (body === null) return;

    if (body.value === undefined) {
      return badRequest(res, 'Missing "value" in request body');
    }
    if (body.value === null || typeof body.value === 'object') {
      return badRequest(res, 'Setting value must be a string or number');
    }

    const d = db.getWrappedDb();
    const existing = d.prepare('SELECT * FROM settings WHERE key = ?').get(settingKey);

    if (!existing) {
      const def = SETTING_DEFS.find(s => s.key === settingKey);
      /* v8 ignore next */ if (!def) return notFound(res, `Setting '${settingKey}' not found`);
      const valToStore = settingKey === 'ADMIN_KEY' ? await argon2.hash(body.value) : body.value;
      d.prepare(`INSERT INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, datetime('now'))`).run(settingKey, valToStore, def.description);
      const created = d.prepare('SELECT * FROM settings WHERE key = ?').get(settingKey);
      return json(res, 201, created);
    }

    const valToStore = settingKey === 'ADMIN_KEY' ? await argon2.hash(body.value) : body.value;
    d.prepare(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?`).run(valToStore, settingKey);
    const updated = d.prepare('SELECT * FROM settings WHERE key = ?').get(settingKey);
    json(res, 200, updated);
  }

  let resetLock = Promise.resolve();
  const RESET_LOCK_TIMEOUT_MS = 30_000;

  async function withResetLock(fn) {
    let release;
    let timer;
    const prev = resetLock;
    resetLock = new Promise((resolve) => { release = resolve; });
    await prev;
    timer = setTimeout(release, RESET_LOCK_TIMEOUT_MS);
    try {
      return await fn();
    } finally {
      clearTimeout(timer);
      release();
    }
  }

  async function handleAdminResetDatabase(req, res) {
    const body = await readBodySafe(req, res);
    if (body === null) return;
    if (body.confirm !== true) {
      return badRequest(res, 'Reset requires confirm: true in request body');
    }
    await withResetLock(async () => {
      const d = db.getWrappedDb();
      d.exec('BEGIN');
      try {
        const deleteOrder = ['photos', 'comments', 'albums', 'posts', 'todos', 'users'];
        for (const table of deleteOrder) {
          d.prepare(`DELETE FROM ${table}`).run();
        }
        if (d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'").get()) {
          d.exec('DELETE FROM sqlite_sequence');
        }
        const fetchFn = async (url) => {
          const response = await globalThis.fetch(url);
          return response.json();
        };
        await seed({ database: d, fetch: fetchFn, runMigrate: false, skipTransaction: true });
        d.exec('COMMIT');
        json(res, 200, { message: 'Database reset and re-seeded successfully' });
      } catch (error) {
        d.exec('ROLLBACK');
        throw error;
      }
    });
  }

  async function requestHandler(req, res) {
    const parsed = new URL(req.url, 'http://localhost');
    const pathname = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname;
    const query = Object.fromEntries(parsed.searchParams);
    const method = req.method.toUpperCase();

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      return res.end();
    }

    if (pathname === '/health' || pathname === '/api/health') {
      return handleHealth(res);
    }

    if (pathname === '/' || pathname === '/api') {
      return json(res, 200, {
        message: 'Nodejs JSON API Server — JSONPlaceholder-compatible REST API',
        version: '1.0.0',
        endpoints: db.TABLES.map((t) => `/api/${t}`),
        docs: 'GET /health for server status',
      });
    }

    if (pathname === '/favicon.ico') {
      res.writeHead(200, { 'Content-Type': 'image/x-icon' });
      return res.end(faviconIco);
    }

    if (pathname === '/favicon.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(faviconPng);
    }

    await new Promise((resolve) => {
      rateLimiter(req, res, resolve);
    });
    if (res.writableEnded) return;

    if (pathname.startsWith('/api/admin/')) {
      try {
        return await handleAdmin(req, res, pathname, method);
      } catch (err) {
        console.error('[Error]', err);
        return json(res, 500, { error: 'Internal Server Error', message: err.message });
      }
    }

    const route = parseRoute(pathname);
    /* v8 ignore next */ if (!route) return notFound(res, `Unknown route: ${pathname}`);
    /* v8 ignore next */ if (route.invalidId) return badRequest(res, 'Invalid ID format');

    try {
      switch (method) {
        case 'GET': return await handleGET(req, res, route, query);
        case 'POST': return await handlePOST(req, res, route);
        case 'PUT': return await handlePUT(req, res, route);
        case 'PATCH': return await handlePATCH(req, res, route);
        case 'DELETE': return handleDELETE(req, res, route);
        default:
          return json(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      console.error('[Error]', err);
      json(res, 500, { error: 'Internal Server Error', message: err.message });
    }
  }

  return { requestHandler, resetAuthCache };
};

'use strict';

const http = require('http');

const { port, redisOpts, rateLimitMax, rateLimitEnabled,
  rateLimitWindowMs, rateLimitWindowSec, maxBodySize } = require('../config');
const RedisClient = require('../redis');
const { createRateLimiter } = require('../middleware/rate-limiter');
const db = require('../db');

const redis = new RedisClient(redisOpts);

const rateLimiter = createRateLimiter(redis);

(async () => {
  try {
    await redis.connect();
    await redis.ping();
    console.log('[Redis] Connected ✓');
  } catch (e) {
    /* v8 ignore next */
    console.warn('[Redis] Unavailable — rate limiting falls back to in-memory:', e.message);
  }
  startServer();
})();

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2);
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
        /* v8 ignore next 2 — defensive: JSON.parse can return null */
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
  /* v8 ignore next */
  if (parts[0] === 'api') parts.shift();

  const [table, rawId, sub] = parts;
  const id = rawId ? parseInt(rawId, 10) : null;

  if (!db.TABLES.includes(table)) return null;
  /* v8 ignore next */
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

    /* v8 ignore next */
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
    /* v8 ignore next */
    redis: redis.connected ? 'connected' : 'disconnected',
    tables: db.TABLES,
    rateLimit: {
      enabled: rateLimitEnabled,
      max: rateLimitMax,
      windowMs: rateLimitWindowMs,
    },
  });
}

async function requestHandler(req, res) {
  const parsed = new URL(req.url, 'http://localhost');
  const pathname = parsed.pathname;
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
      message: 'json-api-server — JSONPlaceholder-compatible REST API',
      version: '1.0.0',
      endpoints: db.TABLES.map((t) => `/api/${t}`),
      docs: 'GET /health for server status',
    });
  }

  await new Promise((resolve) => {
    rateLimiter(req, res, resolve);
  });
  /* v8 ignore next */
  if (res.writableEnded) return;

  const route = parseRoute(pathname);
  if (!route) return notFound(res, `Unknown route: ${pathname}`);
  if (route.invalidId) return badRequest(res, 'Invalid ID format');

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

const server = http.createServer(requestHandler);

function printLog() {
  const rlText = `  Rate limit: ${rateLimitMax} req / ${rateLimitWindowSec}s (${redis.connected ? 'Redis' : 'Memory'})`.padEnd(50);
  console.log(`
╔══════════════════════════════════════════════════╗
║         nodejs-json-api-server v1.0.0            ║
╠══════════════════════════════════════════════════╣
║  http://localhost:${port}${' '.repeat(31 - String(port).length)}║
║                                                  ║
║  Endpoints:                                      ║
║    GET    /api/users                             ║
║    GET    /api/users/:id                         ║
║    GET    /api/users/:id/posts                   ║
║    GET    /api/posts                             ║
║    GET    /api/posts/:id                         ║
║    GET    /api/posts/:id/comments                ║
║    GET    /api/comments                          ║
║    GET    /api/albums                            ║
║    GET    /api/albums/:id/photos                 ║
║    GET    /api/photos                            ║
║    GET    /api/todos                             ║
║    POST/PUT/PATCH/DELETE on any resource         ║
║    GET    /health                                ║
║                                                  ║
║${rlText}║
╚══════════════════════════════════════════════════╝
      `.trim());
}

function startServer() {
  if (process.env.START_SERVER !== 'false') { // for testing
    server.listen(port, printLog);
  }
}

/* v8 ignore start */
function closeServer() {
  return new Promise((resolve) => {
    server.close(resolve);
  });
}
async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down gracefully...`);
  await closeServer();
  try { await redis.quit(); } catch { /* ignore */ }
  process.exit(0);
}
if (process.listenerCount('SIGINT') === 0) {
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/* v8 ignore stop */
module.exports = { server, requestHandler, printLog, closeServer };

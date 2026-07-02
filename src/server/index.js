'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { port, redisOpts, rateLimitEnabled, rateLimitMax, rateLimitWindowMs, rateLimitWindowSec } = require('../config');
const RedisClient = require('../redis');
const { createRateLimiter } = require('../middleware/rate-limiter');
const createRouter = require('./route');

const redis = new RedisClient(redisOpts);

const rateLimiter = createRateLimiter(redis, { enabled: rateLimitEnabled, max: rateLimitMax, windowMs: rateLimitWindowMs });

const faviconIco = fs.readFileSync(path.join(__dirname, '..', 'public', 'favicon.ico'));
const faviconPng = fs.readFileSync(path.join(__dirname, '..', 'public', 'favicon.png'));

const { requestHandler, resetAuthCache } = createRouter(rateLimiter, faviconIco, faviconPng, redis);

const server = http.createServer(requestHandler);

(async () => {
  try {
    await redis.connect();
    await redis.ping();
    console.log('[Redis] Connected ✓');
  } catch (e) {
    console.warn('[Redis] Unavailable — rate limiting falls back to in-memory:', e.message);
  }
  startServer();
})();

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
  if (process.env.START_SERVER !== 'false') {
    server.listen(port, printLog);
  }
}

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

module.exports = { server, requestHandler, printLog, closeServer, resetAuthCache };

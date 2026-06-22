'use strict';

const {
  rateLimitWindowMs: WINDOW_MS,
  rateLimitMax: MAX_REQ,
  rateLimitEnabled: ENABLED,
  rateLimitWindowSec: WINDOW_SEC,
} = require('./config');

const memStore = new Map();

function memFallback(ip) {
  const now = Date.now();
  let entry = memStore.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    memStore.set(ip, entry);
  }
  entry.count++;
  const remaining = Math.max(0, MAX_REQ - entry.count);
  const reset = Math.ceil((entry.resetAt - now) / 1000);
  return { count: entry.count, remaining, reset, limited: entry.count > MAX_REQ };
}

async function checkRedis(redis, ip) {
  const key = `rl:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_SEC);
  }
  const ttl = await redis.ttl(key);
  const remaining = Math.max(0, MAX_REQ - count);
  return { count, remaining, reset: ttl, limited: count > MAX_REQ };
}

function createRateLimiter(redis) {
  if (!ENABLED) {
    return async (_req, _res, next) => next();
  }

  return async function rateLimiter(req, res, next) {
    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown';

    let info;
    let usingRedis = false;

    if (redis && redis.connected) {
      try {
        info = await checkRedis(redis, ip);
        usingRedis = true;
      } catch (_) {
        info = memFallback(ip);
      }
    } else {
      info = memFallback(ip);
    }

    res.setHeader('X-RateLimit-Limit', MAX_REQ);
    res.setHeader('X-RateLimit-Remaining', info.remaining);
    res.setHeader('X-RateLimit-Reset', info.reset);
    res.setHeader('X-RateLimit-Store', usingRedis ? 'redis' : 'memory');

    if (info.limited) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': WINDOW_SEC });
      res.end(JSON.stringify({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Max ${MAX_REQ} requests per ${WINDOW_SEC}s window.`,
        retryAfter: info.reset,
      }));
      return;
    }

    next();
  };
}

module.exports = { createRateLimiter };

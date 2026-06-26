'use strict';

const memStore = new Map();

function memFallback(ip, max, windowMs) {
  const now = Date.now();
  let entry = memStore.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    memStore.set(ip, entry);
  }
  entry.count++;
  const remaining = Math.max(0, max - entry.count);
  const reset = Math.ceil((entry.resetAt - now) / 1000);
  return { count: entry.count, remaining, reset, limited: entry.count > max };
}

async function checkRedis(redis, ip, max, windowSec) {
  const key = `rl:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSec);
  }
  const ttl = await redis.ttl(key);
  const remaining = Math.max(0, max - count);
  return { count, remaining, reset: ttl, limited: count > max };
}

function createRateLimiter(redis) {
  const config = require('../config');
  const { rateLimitEnabled: enabled, rateLimitMax: max, rateLimitWindowMs: windowMs, rateLimitWindowSec: windowSec } = config;

  if (!enabled) {
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
        info = await checkRedis(redis, ip, max, windowSec);
        usingRedis = true;
      } catch (_) {
        info = memFallback(ip, max, windowMs);
      }
    } else {
      info = memFallback(ip, max, windowMs);
    }

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', info.remaining);
    res.setHeader('X-RateLimit-Reset', info.reset);
    res.setHeader('X-RateLimit-Store', usingRedis ? 'redis' : 'memory');

    if (info.limited) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': windowSec });
      res.end(JSON.stringify({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Max ${max} requests per ${windowSec}s window.`,
        retryAfter: info.reset,
      }));
      return;
    }

    next();
  };
}

module.exports = { createRateLimiter };

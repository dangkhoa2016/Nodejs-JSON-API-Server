'use strict';

const DEFAULT_WINDOW_MS = 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const BLOCK_DURATIONS_SEC = [300, 1200, 3600]; // seconds (5m, 20m, 1h)
const BLOCK_TRACKING_KEY_PREFIX = 'rl:block:';
const MAX_MEM_ENTRIES = 10000;

// Circuit breaker for Redis
const circuitBreaker = {
  isOpen: false,
  failureCount: 0,
  lastFailure: 0,
  resetTimeout: 30000 // 30 seconds
};

// Trusted proxies for secure IP extraction (supports CIDR)
const TRUSTED_PROXIES = ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

// Request cost multiplier (GET=1, POST=2, DELETE=3)
const REQUEST_COST = {
  GET: 1,
  HEAD: 1,
  POST: 2,
  PUT: 2,
  PATCH: 2,
  DELETE: 3
};

function cidrToRegex(cidr) {
  const [ip, bits] = cidr.split('/');
  /* v8 ignore next */
  const maskBits = bits ? parseInt(bits, 10) : 32;
  const mask = ~(2 ** (32 - maskBits) - 1);
  const ipParts = ip.split('.').map(Number);
  const networkInt = (ipParts[0] << 24 | ipParts[1] << 16 | ipParts[2] << 8 | ipParts[3]) & mask;
  return (testIp) => {
    const testParts = testIp.split('.').map(Number);
    const testInt = testParts[0] << 24 | testParts[1] << 16 | testParts[2] << 8 | testParts[3];
    return (testInt & mask) === networkInt;
  };
}

// Check if an IP is in a trusted CIDR range
function isTrustedProxy(ip) {
  if (!ip || ip === 'unknown') return false;

  return TRUSTED_PROXIES.some(cidr => {
    try {
      if (!cidr.includes('/')) {
        return ip === cidr;
      }
      const matcher = cidrToRegex(cidr);
      return matcher(ip);
    } catch { /* v8 ignore next */
      return false;
    }
  });
}

// Lua script for atomic rate limiting operations
const RATE_LIMIT_LUA_SCRIPT = `
local countKey = KEYS[1]
local blockKey = KEYS[2]
local maxRequests = tonumber(ARGV[1])
local windowSec = tonumber(ARGV[2])
local blockDurations = {${BLOCK_DURATIONS_SEC.join(',')}}

-- Increment request count
local count = redis.call('INCR', countKey)

-- Set expiry for countKey if this is the first request in the window
if count == 1 then
  redis.call('EXPIRE', countKey, windowSec)
end

-- Check if rate limit is exceeded
if count > maxRequests then
  -- Increment violation count
  local violationCount = redis.call('INCR', blockKey)

  -- Determine block duration (escalating)
  local idx = math.min(violationCount - 1, #blockDurations - 1)
  local blockSec = blockDurations[idx + 1]

  -- Set expiry for blockKey
  redis.call('EXPIRE', blockKey, blockSec)

  -- Return rate limit info (limited = true)
  return {count, 0, blockSec, blockSec, 1}
else
  -- Get TTL for countKey
  local ttl = redis.call('TTL', countKey)
  if ttl < 0 then
    ttl = windowSec
  end

  -- Return rate limit info (limited = false)
  return {count, math.max(0, maxRequests - count), ttl, 0, 0}
end`;

function createInMemoryStore() {
  const mem = new Map();
  // simple LRU helper
  function touch(key) {
    const v = mem.get(key);
    if (!v) return;
    mem.delete(key);
    mem.set(key, v);
  }
  function ensureLimit() {
    while (mem.size > MAX_MEM_ENTRIES) {
      const firstKey = mem.keys().next().value;
      mem.delete(firstKey);
    }
  }
  return {
    get: (k) => {
      touch(k);
      return mem.get(k);
    },
    set: (k, v) => {
      mem.set(k, v);
      ensureLimit();
    },
    delete: (k) => mem.delete(k),
    entries: () => mem.entries(),
    size: () => mem.size
  };
}

const memStore = createInMemoryStore();

function triggerCleanup() {
  const now = Date.now();
  for (const [ip, entry] of memStore.entries()) {
    if (entry.resetAt <= now) memStore.delete(ip);
  }
}

/* v8 ignore start */
setInterval(() => {
  triggerCleanup();
}, CLEANUP_INTERVAL_MS);
/* v8 ignore stop */

function memFallback(ip, max, windowMs) {
  const now = Date.now();
  let entry = memStore.get(ip) || null;

  if (!entry || entry.resetAt <= now) {
    // new window or expired
    const prevViolation = entry ? (entry.violationCount || 0) : 0;
    entry = {
      count: 0,
      resetAt: now + windowMs,
      violationCount: prevViolation
    };
  }

  entry.count = (entry.count || 0) + 1;

  // if exceeded, increment violationCount and set block expiry
  let limited = false;
  let resetSeconds;
  if (entry.count > max) {
    entry.violationCount = (entry.violationCount || 0) + 1;
    const idx = Math.min(entry.violationCount - 1, BLOCK_DURATIONS_SEC.length - 1);
    const blockSec = BLOCK_DURATIONS_SEC[idx];
    // set reset to now + blockSec
    entry.resetAt = now + blockSec * 1000;
    limited = true;
    resetSeconds = Math.ceil(blockSec);
  } else {
    resetSeconds = Math.ceil((entry.resetAt - now) / 1000);
  }

  memStore.set(ip, entry);

  return {
    count: entry.count,
    remaining: Math.max(0, max - entry.count),
    reset: Math.floor((entry.resetAt) / 1000), // epoch seconds
    retryAfter: limited ? resetSeconds : 0,
    limited,
    violationCount: entry.violationCount
  };
}

// Normalize IP address (IPv4-mapped IPv6, lowercase, etc.)
function normalizeIp(ip) {
  if (!ip || ip === 'unknown') return 'unknown';

  // Handle IPv6-mapped IPv4 addresses (::ffff:192.168.1.1)
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7); // Convert to IPv4
  }

  // Lowercase for consistency
  return ip.toLowerCase();
}

// Secure IP extraction with proxy awareness
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'] || '';
  const ips = xff.split(',').map(ip => normalizeIp(ip.trim())).filter(ip => ip && ip !== 'unknown');

  // If request comes from a trusted proxy, use the first IP in XFF
  if (isTrustedProxy(normalizeIp(req.socket.remoteAddress))) {
    return ips[0] || normalizeIp(req.socket.remoteAddress);
  }
  // Otherwise, use the direct connection IP
  /* v8 ignore next */
  return normalizeIp(req.socket.remoteAddress) || 'unknown';
}

// Request cost multiplier (GET=1, POST=2, DELETE=3)
function getRequestCost(req) {
  return REQUEST_COST[req.method] || 1;
}

async function checkRedis(redis, ip, max, windowSec, retryDelayMs = null) {
  // Circuit breaker check
  if (circuitBreaker.isOpen) {
    if (Date.now() - circuitBreaker.lastFailure > circuitBreaker.resetTimeout) {
      circuitBreaker.isOpen = false;
      circuitBreaker.failureCount = 0;
    } else {
      throw new Error('Circuit breaker open - Redis unavailable');
    }
  }

  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      const countKey = `rl:${ip}`;
      const blockKey = `${BLOCK_TRACKING_KEY_PREFIX}${ip}`;

      // Execute Lua script for atomic operations
      const result = await redis.eval(
        RATE_LIMIT_LUA_SCRIPT,
        2, // Number of keys
        countKey,
        blockKey,
        max,
        windowSec
      );

      // Reset failure count on success
      circuitBreaker.failureCount = 0;

      // Parse the result (Lua returns a table with 1-based array indices)
      return {
        count: result[0],
        remaining: result[1],
        reset: result[2],
        retryAfter: result[3],
        limited: result[4]
      };
    } catch (err) {
      retries++;
      circuitBreaker.failureCount++;
      circuitBreaker.lastFailure = Date.now();
      if (circuitBreaker.failureCount >= 3) {
        circuitBreaker.isOpen = true;
      }
      if (retries >= maxRetries) {
        throw new Error('Max retries exceeded');
      }
      // Exponential backoff for retries - use provided delay or default
      /* v8 ignore next */
      const delay = retryDelayMs !== null ? retryDelayMs : 100 * Math.pow(2, retries);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function isExemptRoute(path, exemptRoutes = ['/health', '/status', '/favicon.ico']) {
  return exemptRoutes.includes(path);
}

function createRateLimiter(redis, options = {}) {
  const {
    enabled = true,
    max = 100,
    windowMs = DEFAULT_WINDOW_MS,
    exemptRoutes = ['/health', '/status', '/favicon.ico'],
    logger = console,
    retryDelayMs = null
  } = options;

  const windowSec = Math.floor(windowMs / 1000);

  /* v8 ignore next */
  if (!enabled) return async (_req, _res, next) => next();

  return async function rateLimiter(req, res, next) {
    const path = req.url ? req.url.split('?')[0] : (req.path || '/');
    if (isExemptRoute(path, exemptRoutes)) return next();

    const ip = getClientIp(req);
    const cost = getRequestCost(req);
    const effectiveMax = Math.max(1, Math.floor(max / cost)); // Adjust max based on request cost
    if (!ip || ip === 'unknown') {
      logger.warn('Invalid IP detected', { ip, path });
      return next();
    }

    let info;
    let usingRedis = false;
    try {
      if (redis && redis.connected) {
        info = await checkRedis(redis, ip, effectiveMax, windowSec, retryDelayMs);
        usingRedis = true;
      } else {
        info = memFallback(ip, effectiveMax, windowMs);
      }
    } catch (err) {
      logger.error('Redis error, falling back to memory', err.message);
      info = memFallback(ip, effectiveMax, windowMs);
    }

    // Standard headers
    res.setHeader('X-RateLimit-Limit', String(effectiveMax));
    res.setHeader('X-RateLimit-Remaining', String(info.remaining));
    res.setHeader('X-RateLimit-Reset', String(info.reset)); // epoch seconds
    res.setHeader('X-RateLimit-Store', usingRedis ? 'redis' : 'memory');

    if (info.limited) {
      logger.warn('Rate limit exceeded', { ip, path, retryAfter: info.retryAfter });
      res.setHeader('Retry-After', String(info.retryAfter));
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Max ${max} requests per ${windowSec}s window.`,
        retryAfter: info.retryAfter
      }));
      return;
    }

    next();
  };
}

module.exports = {
  createRateLimiter,
  memFallback,
  checkRedis,
  getClientIp,
  isTrustedProxy,
  getRequestCost,
  getCircuitBreaker: () => circuitBreaker,
  resetCircuitBreaker: () => {
    circuitBreaker.isOpen = false;
    circuitBreaker.failureCount = 0;
    circuitBreaker.lastFailure = 0;
  },
  getMemStore: () => memStore,
  resetMemStore: () => memStore.entries().forEach(([k]) => memStore.delete(k)),
  triggerCleanup
};

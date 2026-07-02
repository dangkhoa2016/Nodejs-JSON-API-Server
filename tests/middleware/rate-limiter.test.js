import { describe, it, expect, vi } from 'vitest'


describe('Rate Limiter Middleware', () => {
  let createRateLimiter;
  let memFallback;
  let checkRedis;
  let getClientIp;
  let isTrustedProxy;
  let getRequestCost;
  let getCircuitBreaker;
  let resetCircuitBreaker;
  let resetMemStore;

  beforeEach(() => {
    const rateLimiter = require('../../src/middleware/rate-limiter');
    createRateLimiter = rateLimiter.createRateLimiter;
    memFallback = rateLimiter.memFallback;
    checkRedis = rateLimiter.checkRedis;
    getClientIp = rateLimiter.getClientIp;
    isTrustedProxy = rateLimiter.isTrustedProxy;
    getRequestCost = rateLimiter.getRequestCost;
    getCircuitBreaker = rateLimiter.getCircuitBreaker;
    resetCircuitBreaker = rateLimiter.resetCircuitBreaker;
    resetMemStore = rateLimiter.resetMemStore;
    resetCircuitBreaker();
    resetMemStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createRateLimiter', () => {
    it('should return next() when rate limiting is disabled', async () => {
      const rateLimiter = createRateLimiter(null, { enabled: false });
      const next = vi.fn();
      await rateLimiter({}, {}, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should skip rate limiting for exempt routes', async () => {
      const rateLimiter = createRateLimiter(null, { exemptRoutes: ['/health'] });
      const next = vi.fn();
      await rateLimiter({ path: '/health' }, {}, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should use effectiveMax for POST requests', async () => {
      const rateLimiter = createRateLimiter(null, { max: 100 });
      const res = { setHeader: vi.fn() };
      const req = { path: '/test', method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      await rateLimiter(req, res, () => {});
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '50');
    });

    it('should handle invalid IP', async () => {
      const loggerStub = { warn: vi.fn(), error: vi.fn() };
      const rateLimiter = createRateLimiter(null, { logger: loggerStub });
      const res = { setHeader: vi.fn() };
      const req = { path: '/test', headers: {}, socket: { remoteAddress: null } };
      await rateLimiter(req, res, () => {});
      expect(loggerStub.warn).toHaveBeenCalledTimes(1);
    });

    it('should fall back to memory store when Redis errors', async () => {
      const redisStub = { connected: true, eval: vi.fn().mockRejectedValue(new Error('Redis error')) };
      const loggerStub = { warn: vi.fn(), error: vi.fn() };
      const rateLimiter = createRateLimiter(redisStub, { logger: loggerStub, retryDelayMs: 1 });
      const res = { setHeader: vi.fn() };
      const req = { path: '/test', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      await rateLimiter(req, res, () => {});
      expect(loggerStub.error).toHaveBeenCalledTimes(1);
    });

    it('should return 429 when rate limit exceeded in memory after Redis fails', async () => {
      const redisStub = { connected: true, eval: vi.fn().mockRejectedValue(new Error('Redis error')) };
      const rateLimiter = createRateLimiter(redisStub, { max: 1, retryDelayMs: 1 });
      const res = { setHeader: vi.fn(), writeHead: vi.fn().mockReturnThis(), end: vi.fn() };
      const req1 = { path: '/test', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      await rateLimiter(req1, res, () => {});
      const res2 = { setHeader: vi.fn(), writeHead: vi.fn().mockReturnThis(), end: vi.fn() };
      const req2 = { path: '/test', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      await rateLimiter(req2, res2, () => {});
      expect(res2.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
      expect(res2.end).toHaveBeenCalledTimes(1);
    });

    it('should set correct headers when rate limited after Redis fails', async () => {
      const redisStub = { connected: true, eval: vi.fn().mockRejectedValue(new Error('Redis error')) };
      const rateLimiter = createRateLimiter(redisStub, { max: 1, retryDelayMs: 1 });
      const res = { setHeader: vi.fn(), writeHead: vi.fn().mockReturnThis(), end: vi.fn() };
      const req1 = { path: '/test', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      await rateLimiter(req1, res, () => {});
      const res2 = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
      const req2 = { path: '/test', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      await rateLimiter(req2, res2, () => {});
      expect(res2.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '1');
      expect(res2.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    });

    it('should set X-RateLimit-Store header to redis when using Redis', async () => {
      const redisStub = { connected: true, eval: vi.fn().mockResolvedValue([1, 99, 60, 0, false]) };
      const rateLimiter = createRateLimiter(redisStub);
      const res = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
      const req = { path: '/test', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      await rateLimiter(req, res, () => {});
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Store', 'redis');
    });

    it('should call next() when not rate limited (Redis)', async () => {
      const redisStub = { connected: true, eval: vi.fn().mockResolvedValue([1, 99, 60, 0, false]) };
      const rateLimiter = createRateLimiter(redisStub);
      const res = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
      const req = { path: '/test', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      const next = vi.fn();
      await rateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should use DELETE request cost of 3x', async () => {
      const rateLimiter = createRateLimiter(null, { max: 30 });
      const res = { setHeader: vi.fn() };
      const req = { path: '/test', method: 'DELETE', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      await rateLimiter(req, res, () => {});
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
    });

    it('should use PATCH request cost of 2x', async () => {
      const rateLimiter = createRateLimiter(null, { max: 100 });
      const res = { setHeader: vi.fn() };
      const req = { path: '/test', method: 'PATCH', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      await rateLimiter(req, res, () => {});
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '50');
    });

    it('should expose updateConfig method', () => {
      const rateLimiter = createRateLimiter(null, { max: 100 });
      expect(typeof rateLimiter.updateConfig).toBe('function');
    });

    it('updateConfig should disable rate limiting at runtime', async () => {
      const rateLimiter = createRateLimiter(null, { max: 1 });
      const res = { setHeader: vi.fn(), writeHead: vi.fn().mockReturnThis(), end: vi.fn() };
      const req = { path: '/test', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      await rateLimiter(req, res, () => {});
      res.setHeader.mockClear();

      const next = vi.fn();
      const res2 = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
      const req2 = { path: '/test', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      rateLimiter.updateConfig({ enabled: false });
      await rateLimiter(req2, res2, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('updateConfig should change rate limit max at runtime', async () => {
      const rateLimiter = createRateLimiter(null, { max: 100 });
      const req = { path: '/test', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      const res = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
      await rateLimiter(req, res, () => {});
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');

      rateLimiter.updateConfig({ max: 1 });
      res.setHeader.mockClear();
      const res2 = { setHeader: vi.fn(), writeHead: vi.fn().mockReturnThis(), end: vi.fn() };
      const req2 = { path: '/test', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
      await rateLimiter(req2, res2, () => {});
      expect(res2.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
    });
  });

  describe('memFallback', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should reset count on new window', () => {
      const info1 = memFallback('127.0.0.1', 10, 60000);
      expect(info1.count).toBe(1);
      vi.advanceTimersByTime(61000);
      const info2 = memFallback('127.0.0.1', 10, 60000);
      expect(info2.count).toBe(1);
    });

    it('should increase count within window', () => {
      const info1 = memFallback('127.0.0.1', 10, 60000);
      expect(info1.count).toBe(1);
      const info2 = memFallback('127.0.0.1', 10, 60000);
      expect(info2.count).toBe(2);
    });

    it('should set limited=true when rate limit exceeded', () => {
      const info1 = memFallback('127.0.0.1', 1, 60000);
      expect(info1.limited).toBe(false);
      const info2 = memFallback('127.0.0.1', 1, 60000);
      expect(info2.limited).toBe(true);
    });

    it('should track remaining requests correctly', () => {
      const info1 = memFallback('127.0.0.1', 10, 60000);
      expect(info1.remaining).toBe(9);
      const info2 = memFallback('127.0.0.1', 10, 60000);
      expect(info2.remaining).toBe(8);
    });

    it('should increment violationCount on each violation within block', () => {
      const info1 = memFallback('127.0.0.1', 1, 60000);
      expect(info1.violationCount).toBe(0);
      const info2 = memFallback('127.0.0.1', 1, 60000);
      expect(info2.violationCount).toBe(1);
      const info3 = memFallback('127.0.0.1', 1, 60000);
      expect(info3.violationCount).toBe(2);
    });

    it('should carry over violationCount when window expires but block continues', () => {
      const info1 = memFallback('127.0.0.1', 1, 60000);
      const info2 = memFallback('127.0.0.1', 1, 60000);
      expect(info2.violationCount).toBe(1);
      vi.advanceTimersByTime(301000);
      const info3 = memFallback('127.0.0.1', 1, 60000);
      expect(info3.violationCount).toBe(1);
    });

    it('should use correct retryAfter values for escalation within block', () => {
      const info1 = memFallback('127.0.0.1', 1, 60000);
      expect(info1.retryAfter).toBe(0);
      const info2 = memFallback('127.0.0.1', 1, 60000);
      expect(info2.retryAfter).toBe(300);
      const info3 = memFallback('127.0.0.1', 1, 60000);
      expect(info3.retryAfter).toBe(1200);
    });
  });

  describe('checkRedis', () => {
    it('should return correct info when not rate limited', async () => {
      const redisStub = { eval: vi.fn().mockResolvedValue([50, 50, 60, 0, false]) };
      const info = await checkRedis(redisStub, '127.0.0.1', 100, 60);
      expect(info.count).toBe(50);
      expect(info.limited).toBe(false);
    });

    it('should return correct info when rate limited', async () => {
      const redisStub = { eval: vi.fn().mockResolvedValue([101, 0, 300, 300, true]) };
      const info = await checkRedis(redisStub, '127.0.0.1', 100, 60);
      expect(info.limited).toBe(true);
      expect(info.retryAfter).toBe(300);
    });

    it('should throw when circuit breaker is open', async () => {
      const cb = getCircuitBreaker();
      cb.isOpen = true;
      cb.lastFailure = Date.now();
      const redisStub = { eval: vi.fn() };
      await expect(checkRedis(redisStub, '127.0.0.1', 100, 60)).rejects.toThrow(/Circuit breaker open/);
    });

    it('should reset circuit breaker after timeout', async () => {
      const cb = getCircuitBreaker();
      cb.isOpen = true;
      cb.lastFailure = Date.now() - 60000;
      cb.failureCount = 5;
      const redisStub = { eval: vi.fn().mockResolvedValue([1, 99, 60, 0, false]) };
      const info = await checkRedis(redisStub, '127.0.0.1', 100, 60);
      expect(cb.isOpen).toBe(false);
      expect(cb.failureCount).toBe(0);
    });

    it('should reset failure count on success', async () => {
      const cb = getCircuitBreaker();
      cb.failureCount = 2;
      const redisStub = { eval: vi.fn().mockResolvedValue([1, 99, 60, 0, false]) };
      await checkRedis(redisStub, '127.0.0.1', 100, 60);
      expect(cb.failureCount).toBe(0);
    });

    it('should throw after max retries', async () => {
      const redisStub = { eval: vi.fn().mockRejectedValue(new Error('Permanent error')) };
      await expect(
        checkRedis(redisStub, '127.0.0.1', 100, 60, 1)
      ).rejects.toThrow(/Max retries exceeded/);
    });

    it('should use exponential backoff when retryDelayMs is not provided', async () => {
      const redisStub = { eval: vi.fn().mockRejectedValue(new Error('err')) };
      await expect(
        checkRedis(redisStub, '127.0.0.1', 100, 60, 2)
      ).rejects.toThrow(/Max retries exceeded/);
    })

    it('should open circuit breaker after 3 failures', async () => {
      const redisStub = {
        eval: vi.fn()
          .mockRejectedValueOnce(new Error('err1'))
          .mockRejectedValueOnce(new Error('err2'))
          .mockRejectedValueOnce(new Error('err3'))
          .mockRejectedValue(new Error('default err'))
      };
      try {
        await checkRedis(redisStub, '127.0.0.1', 100, 60, 1);
      } catch (e) {
      }
      const cb = getCircuitBreaker();
      expect(cb.isOpen).toBe(true);
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from X-Forwarded-For with trusted proxy', () => {
      const req = {
        headers: { 'x-forwarded-for': '10.0.1.5, 192.168.1.1' },
        socket: { remoteAddress: '127.0.0.1' }
      };
      const ip = getClientIp(req);
      expect(ip).toBe('10.0.1.5');
    });

    it('should use remoteAddress when not from trusted proxy', () => {
      const req = {
        headers: { 'x-forwarded-for': '192.168.1.1' },
        socket: { remoteAddress: '203.0.113.1' }
      };
      const ip = getClientIp(req);
      expect(ip).toBe('203.0.113.1');
    });

    it('should handle IPv6-mapped IPv4', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '::ffff:192.168.1.1' }
      };
      const ip = getClientIp(req);
      expect(ip).toBe('192.168.1.1');
    });

    it('should handle IPv6 addresses', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '2001:db8::1' }
      };
      const ip = getClientIp(req);
      expect(ip).toBe('2001:db8::1');
    });

    it('should handle invalid IPs', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: null }
      };
      const ip = getClientIp(req);
      expect(ip).toBe('unknown');
    });

    it('should handle missing X-Forwarded-For header', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' }
      };
      const ip = getClientIp(req);
      expect(ip).toBe('127.0.0.1');
    });

    it('should lowercase IPv6 addresses', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '2001:DB8::1' }
      };
      const ip = getClientIp(req);
      expect(ip).toBe('2001:db8::1');
    });

    it('should return first IP from X-Forwarded-For when multiple IPs', () => {
      const req = {
        headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12' },
        socket: { remoteAddress: '127.0.0.1' }
      };
      const ip = getClientIp(req);
      expect(ip).toBe('1.2.3.4');
    });
  });

  describe('isTrustedProxy', () => {
    it('should match localhost', () => {
      expect(isTrustedProxy('127.0.0.1')).toBe(true);
    });

    it('should match IPv6 localhost', () => {
      expect(isTrustedProxy('::1')).toBe(true);
    });

    it('should match 10.0.0.0/8 range', () => {
      expect(isTrustedProxy('10.0.0.5')).toBe(true);
      expect(isTrustedProxy('10.255.255.255')).toBe(true);
    });

    it('should match 172.16.0.0/12 range', () => {
      expect(isTrustedProxy('172.16.0.1')).toBe(true);
      expect(isTrustedProxy('172.31.255.255')).toBe(true);
    });

    it('should match 192.168.0.0/16 range', () => {
      expect(isTrustedProxy('192.168.1.1')).toBe(true);
    });

    it('should not match IPs outside trusted ranges', () => {
      expect(isTrustedProxy('8.8.8.8')).toBe(false);
      expect(isTrustedProxy('172.15.0.1')).toBe(false);
    });

    it('should handle invalid inputs', () => {
      expect(isTrustedProxy(null)).toBe(false);
      expect(isTrustedProxy('unknown')).toBe(false);
      expect(isTrustedProxy('')).toBe(false);
    });
  });

  describe('getRequestCost', () => {
    it('should return 1 for GET', () => {
      expect(getRequestCost({ method: 'GET' })).toBe(1);
    });

    it('should return 1 for HEAD', () => {
      expect(getRequestCost({ method: 'HEAD' })).toBe(1);
    });

    it('should return 2 for POST', () => {
      expect(getRequestCost({ method: 'POST' })).toBe(2);
    });

    it('should return 2 for PUT', () => {
      expect(getRequestCost({ method: 'PUT' })).toBe(2);
    });

    it('should return 2 for PATCH', () => {
      expect(getRequestCost({ method: 'PATCH' })).toBe(2);
    });

    it('should return 3 for DELETE', () => {
      expect(getRequestCost({ method: 'DELETE' })).toBe(3);
    });

    it('should return 1 for unknown methods', () => {
      expect(getRequestCost({ method: 'UNKNOWN' })).toBe(1);
      expect(getRequestCost({ method: 'OPTIONS' })).toBe(1);
    });
  });

  describe('memStore internal operations', () => {
    it('should export getMemStore', () => {
      const rateLimiter = require('../../src/middleware/rate-limiter');
      const memStore = rateLimiter.getMemStore();
      expect(typeof memStore.get).toBe('function');
      expect(typeof memStore.set).toBe('function');
      expect(typeof memStore.delete).toBe('function');
      expect(typeof memStore.entries).toBe('function');
      expect(typeof memStore.size).toBe('function');
    });

    it('should track size correctly via size() method', () => {
      const rateLimiter = require('../../src/middleware/rate-limiter');
      rateLimiter.resetMemStore();
      const memStore = rateLimiter.getMemStore();
      expect(memStore.size()).toBe(0);
      memStore.set('192.168.1.1', { count: 1, resetAt: Date.now() + 60000 });
      expect(memStore.size()).toBe(1);
      memStore.set('192.168.1.2', { count: 2, resetAt: Date.now() + 60000 });
      expect(memStore.size()).toBe(2);
      memStore.delete('192.168.1.1');
      expect(memStore.size()).toBe(1);
    });

    it('should handle entries iteration', () => {
      const rateLimiter = require('../../src/middleware/rate-limiter');
      rateLimiter.resetMemStore();
      const memStore = rateLimiter.getMemStore();
      memStore.set('192.168.1.1', { count: 1, resetAt: Date.now() + 60000 });
      memStore.set('192.168.1.2', { count: 2, resetAt: Date.now() + 60000 });
      let entriesCount = 0;
      for (const entry of memStore.entries()) {
        entriesCount++;
      }
      expect(entriesCount).toBe(2);
    });

    it('should use LRU behavior on get', () => {
      const rateLimiter = require('../../src/middleware/rate-limiter');
      rateLimiter.resetMemStore();
      const memStore = rateLimiter.getMemStore();
      memStore.set('key1', { count: 1, resetAt: Date.now() + 60000 });
      memStore.set('key2', { count: 2, resetAt: Date.now() + 60000 });
      memStore.get('key1');
      memStore.set('key3', { count: 3, resetAt: Date.now() + 60000 });
      memStore.get('key1');
    });

    it('should trigger LRU eviction when exceeding max entries', () => {
      const rateLimiter = require('../../src/middleware/rate-limiter');
      rateLimiter.resetMemStore();
      const memStore = rateLimiter.getMemStore();
      for (let i = 0; i < 10001; i++) {
        memStore.set(`ip${i}`, { count: i, resetAt: Date.now() + 60000 });
      }
      expect(memStore.size()).toBeLessThanOrEqual(10000);
    });

    it('should cleanup expired entries via triggerCleanup', () => {
      const rateLimiter = require('../../src/middleware/rate-limiter');
      rateLimiter.resetMemStore();
      const memStore = rateLimiter.getMemStore();
      memStore.set('192.168.1.1', { count: 1, resetAt: Date.now() - 1000 });
      memStore.set('192.168.1.2', { count: 2, resetAt: Date.now() + 60000 });
      expect(memStore.size()).toBe(2);
      rateLimiter.triggerCleanup();
      expect(memStore.size()).toBe(1);
    });
  });
});

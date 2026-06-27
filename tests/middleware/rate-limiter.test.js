import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'
import { save, restore, setEnv } from '../helpers/coverage'

const _require = createRequire(import.meta.url)
function clearCjs(...keys) {
  for (const key of keys) {
    const resolved = _require.resolve(key)
    if (_require.cache[resolved]) delete _require.cache[resolved]
  }
}

describe('rate-limiter.js', () => {
  function freshLimiter(redis, envOverrides = {}) {
    clearCjs('../../src/middleware/rate-limiter.js', '../../src/config/index.js')
    Object.entries(envOverrides).forEach(([k, v]) => { process.env[k] = v })
    return _require('../../src/middleware/rate-limiter.js').createRateLimiter(redis)
  }

  it('rate limits via in-memory store and blocks at limit', async () => {
    const s = save('RATE_LIMIT_ENABLED', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS')
    const limiter = freshLimiter(null, { RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_MS: '60000' })

    const mkRes = () => ({ setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() })
    const mkReq = (ip) => ({ headers: {}, socket: { remoteAddress: ip } })

    let c1 = false; await limiter(mkReq('1.2.3.4'), mkRes(), () => { c1 = true })
    expect(c1).toBe(true)
    const r2 = mkRes()
    let c2 = false; await limiter(mkReq('1.2.3.4'), r2, () => { c2 = true })
    expect(c2).toBe(true)
    const r3 = mkRes()
    let c3 = false
    await limiter(mkReq('1.2.3.4'), r3, () => { c3 = true })
    expect(c3).toBe(false)
    expect(r3.writeHead).toHaveBeenCalledWith(429, expect.any(Object))
    expect(r3.end).toHaveBeenCalled()
    restore(s)
  })

  it('parses x-forwarded-for header', async () => {
    const s = save('RATE_LIMIT_ENABLED')
    const limiter = freshLimiter(null, { RATE_LIMIT_ENABLED: 'true' })
    const req = { headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' }, socket: { remoteAddress: '::1' } }
    const res = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() }
    let called = false
    await limiter(req, res, () => { called = true })
    expect(called).toBe(true)
    restore(s)
  })

  it('handles missing remoteAddress with unknown fallback', async () => {
    const s = save('RATE_LIMIT_ENABLED')
    const limiter = freshLimiter(null, { RATE_LIMIT_ENABLED: 'true' })
    const req = { headers: {}, socket: {} }
    const res = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() }
    let called = false
    await limiter(req, res, () => { called = true })
    expect(called).toBe(true)
    restore(s)
  })

  it('returns early when rate limiting is disabled', async () => {
    const s = save('RATE_LIMIT_ENABLED')
    const limiter = freshLimiter(null, { RATE_LIMIT_ENABLED: 'false' })
    let called = false
    await limiter({ headers: {}, socket: {} }, { setHeader: vi.fn() }, () => { called = true })
    expect(called).toBe(true)
    restore(s)
  })

  it('covers redis store, redis failure fallback, and limit response', async () => {
    const s = save('RATE_LIMIT_ENABLED', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS')
    const redis = {
      connected: true,
      incr: vi.fn(),
      expire: vi.fn(),
      ttl: vi.fn(),
    }
    const limiter = freshLimiter(redis, { RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_MS: '60000' })
    const mkReq = (ip) => ({ headers: {}, socket: { remoteAddress: ip } })
    const mkRes = () => ({ setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() })

    redis.incr.mockResolvedValueOnce(1)
    redis.ttl.mockResolvedValueOnce(60)
    let called = false
    await limiter(mkReq('5.5.5.5'), mkRes(), () => { called = true })
    expect(called).toBe(true)
    expect(redis.expire).toHaveBeenCalled()

    redis.incr.mockResolvedValueOnce(3)
    redis.ttl.mockResolvedValueOnce(57)
    const limitedRes = mkRes()
    let limitedCalled = false
    await limiter(mkReq('5.5.5.5'), limitedRes, () => { limitedCalled = true })
    expect(limitedCalled).toBe(false)
    expect(limitedRes.writeHead).toHaveBeenCalledWith(429, expect.any(Object))
    expect(limitedRes.end).toHaveBeenCalled()

    redis.incr.mockRejectedValueOnce(new Error('down'))
    const fallbackRes = mkRes()
    let fallbackCalled = false
    await limiter(mkReq('6.6.6.6'), fallbackRes, () => { fallbackCalled = true })
    expect(fallbackCalled).toBe(true)
    restore(s)
  })

  it('resets memory store entry after window expires', async () => {
    const s = save('RATE_LIMIT_ENABLED', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS')
    setEnv({ RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_MAX: '2', 'RATE_LIMIT_WINDOW_MS': '60000' })
    clearCjs('../../src/middleware/rate-limiter.js', '../../src/config/index.js')
    const limiter = _require('../../src/middleware/rate-limiter.js').createRateLimiter(null)
    const req = { headers: {}, socket: { remoteAddress: '7.7.7.7' } }
    const res1 = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() }
    const res2 = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() }
    vi.useFakeTimers()
    vi.setSystemTime(0)
    let first = false
    await limiter(req, res1, () => { first = true })
    expect(first).toBe(true)
    vi.setSystemTime(70000)
    let second = false
    await limiter(req, res2, () => { second = true })
    expect(second).toBe(true)
    vi.useRealTimers()
    restore(s)
  })
})

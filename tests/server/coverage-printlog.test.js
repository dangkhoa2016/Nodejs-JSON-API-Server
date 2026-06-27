import { createRequire } from 'module'
import { describe, it, expect, vi } from 'vitest'
import { save, restore } from '../helpers/coverage'

const _require = createRequire(import.meta.url)
function clearCjs(...keys) {
  for (const key of keys) {
    const resolved = _require.resolve(key)
    if (_require.cache[resolved]) delete _require.cache[resolved]
  }
}

function mkReq(url, method, rawBody) {
  const req = {
    url, method, headers: {}, socket: { remoteAddress: '::1' },
    destroy: () => {},
    on: (evt, cb) => { if (evt === 'end') queueMicrotask(() => cb()) },
  }
  if (rawBody) {
    req.headers = { 'content-type': 'text/plain' }
    req.on = (evt, cb) => {
      if (evt === 'data') { queueMicrotask(() => cb(rawBody)) }
      if (evt === 'end') { queueMicrotask(() => cb()) }
      if (evt === 'error') { /* no-op */ }
      return req
    }
  }
  return req
}

function mkRes() {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn(), writableEnded: false }
}

describe('server.js ESM coverage', () => {
  it('covers additional handler code paths', async () => {
    const s = save(
      'PORT', 'START_SERVER', 'DB_PATH', 'RATE_LIMIT_ENABLED',
      'REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB',
      'REDIS_PASSWORD', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS', 'DEBUG_SQL',
    )
    process.env.PORT = '3198'
    process.env.START_SERVER = 'false'
    process.env.DB_PATH = ':memory:'
    process.env.RATE_LIMIT_ENABLED = 'false'

    vi.resetModules()
    const mod = await import('../../src/server/index.js')

    let res

    res = mkRes()
    await mod.requestHandler(mkReq('/api/posts/1', 'PUT', 'not-json'), res)
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.anything())

    res = mkRes()
    await mod.requestHandler(mkReq('/api/posts/1', 'PATCH', 'not-json'), res)
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.anything())

    restore(s)
  })

  it('rejects body exceeding maxBodySize with 413', async () => {
    const s = save(
      'PORT', 'START_SERVER', 'DB_PATH', 'RATE_LIMIT_ENABLED',
      'REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB',
      'REDIS_PASSWORD', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS', 'DEBUG_SQL',
      'MAX_BODY_SIZE',
    )
    process.env.PORT = '3197'
    process.env.START_SERVER = 'false'
    process.env.DB_PATH = ':memory:'
    process.env.RATE_LIMIT_ENABLED = 'false'
    process.env.MAX_BODY_SIZE = '100'

    clearCjs('../../src/config/index.js', '../../src/config/load-env.js')
    vi.resetModules()
    const mod = await import('../../src/server/index.js')

    const res1 = mkRes()
    await mod.requestHandler(mkReq('/api/posts', 'POST', 'x'.repeat(200)), res1)
    expect(res1.writeHead).toHaveBeenCalledWith(413, expect.anything())

    const res2 = mkRes()
    await mod.requestHandler(mkReq('/api/posts/1', 'PUT', 'x'.repeat(200)), res2)
    expect(res2.writeHead).toHaveBeenCalledWith(413, expect.anything())

    const res3 = mkRes()
    await mod.requestHandler(mkReq('/api/posts/1', 'PATCH', 'x'.repeat(200)), res3)
    expect(res3.writeHead).toHaveBeenCalledWith(413, expect.anything())

    restore(s)
  })

  it('covers printLog, startServer, and 500 catch', async () => {
    const s = save(
      'PORT', 'START_SERVER', 'DB_PATH', 'RATE_LIMIT_ENABLED',
      'REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB',
      'REDIS_PASSWORD', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS', 'DEBUG_SQL',
    )
    process.env.PORT = '0'
    process.env.START_SERVER = 'true'
    process.env.DB_PATH = ':memory:'
    process.env.RATE_LIMIT_ENABLED = 'false'

    clearCjs('../../src/config/index.js', '../../src/config/load-env.js')
    vi.resetModules()
    const mod = await import('../../src/server/index.js')

    await new Promise((r) => {
      if (mod.server.listening) return r()
      mod.server.once('listening', r)
    })
    expect(mod.server.listening).toBe(true)

    const res = mkRes()
    await mod.requestHandler(mkReq('/api/users', 'GET'), res)
    expect(res.writeHead).toHaveBeenCalledWith(500, expect.anything())

    await new Promise((r) => mod.server.close(r))
    restore(s)
  })
})

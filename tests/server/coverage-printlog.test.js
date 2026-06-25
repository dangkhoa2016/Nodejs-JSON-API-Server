import { describe, it, expect, vi } from 'vitest'
import { save, restore } from '../helpers/coverage'

function mkReq(url, method, rawBody) {
  const req = {
    url, method, headers: {}, socket: { remoteAddress: '::1' },
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

    vi.resetModules()
    const mod = await import('../../src/server.js')

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

  it('covers additional handler code paths', async () => {
    const s = save(
      'PORT', 'START_SERVER', 'DB_PATH', 'RATE_LIMIT_ENABLED',
      'REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB',
      'REDIS_PASSWORD', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS', 'DEBUG_SQL',
    )
    process.env.PORT = '3199'
    process.env.START_SERVER = 'false'
    process.env.DB_PATH = ':memory:'
    process.env.RATE_LIMIT_ENABLED = 'false'

    vi.resetModules()
    const mod = await import('../../src/server.js')

    let res

    // PUT with invalid JSON body → readBody catch at line 126
    res = mkRes()
    await mod.requestHandler(mkReq('/api/posts/1', 'PUT', 'not-json'), res)
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.anything())

    // PATCH with invalid JSON body → readBody catch at line 138
    res = mkRes()
    await mod.requestHandler(mkReq('/api/posts/1', 'PATCH', 'not-json'), res)
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.anything())

    restore(s)
  })
})

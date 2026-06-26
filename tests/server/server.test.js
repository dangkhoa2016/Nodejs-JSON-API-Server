import { describe, it, expect, vi, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { createRequire } from 'module'
import { save, restore, setEnv, configMockFactory } from '../helpers/coverage'

const tmpDir = mkdtempSync(path.join(tmpdir(), 'cov-srv-'))
const _require = createRequire(import.meta.url)
function clearCjs(...keys) {
  for (const key of keys) {
    const resolved = _require.resolve(key)
    if (_require.cache[resolved]) delete _require.cache[resolved]
  }
}

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

vi.mock('../../src/load-env.js', () => ({ loadEnv: () => {} }))
vi.mock('../../src/config.js', () => configMockFactory())

describe('server.js', () => {
  it('handles 500 when db throws', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: path.join(tmpDir, 'srv1.db') })
    const mockDb = {
      getDb: () => ({ prepare: () => ({ all: () => [], get: () => null, run: () => {} }), exec: () => {} }),
      getWrappedDb: () => ({ prepare: () => ({ all: () => [], get: () => null, run: () => {} }), exec: () => {} }),
      listAll: () => { throw new Error('boom') },
      getOne: () => null,
      insertOne: () => { throw new Error('duplicate') },
      updateOne: () => null,
      deleteOne: () => null,
      nextId: () => 1,
      TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos'],
    }
    clearCjs('../../src/server.js', '../../src/database.js', '../../src/rate-limiter.js')
    const resolvedDb = _require.resolve('../../src/database.js')
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server.js')

      const mkReq = (url, method, body) => ({
        url, method, headers: {}, socket: { remoteAddress: '::1' },
        on: (evt, cb) => {
          if (evt === 'data' && body) cb(body)
          if (evt === 'end') queueMicrotask(() => cb())
        },
      })
      const mkRes = () => ({ writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn(), writableEnded: false })

      const res1 = mkRes()
      await requestHandler(mkReq('/api/users', 'GET'), res1)
      expect(res1.writeHead).toHaveBeenCalledWith(500, expect.anything())

      const res2 = mkRes()
      await requestHandler(mkReq('/api/users', 'POST', '{"name":"X"}'), res2)
      expect(res2.writeHead).toHaveBeenCalledWith(400, expect.anything())

      const res3 = mkRes()
      await requestHandler(mkReq('/api/users/1', 'PUT', 'bad-json'), res3)
      expect(res3.writeHead).toHaveBeenCalledWith(400, expect.anything())

      const res4 = mkRes()
      await requestHandler(mkReq('/api/users/1', 'PATCH', 'bad-json'), res4)
      expect(res4.writeHead).toHaveBeenCalledWith(400, expect.anything())

      const res5 = mkRes()
      await requestHandler(mkReq('/api/users', 'POST', ''), res5)
      expect(res5.writeHead).toHaveBeenCalledWith(400, expect.anything())
    } finally {
      delete _require.cache[resolvedDb]
    }
    restore(s)
  })

  it('covers listen block', async () => {
    const s = save('PORT', 'REDIS_URL')
    setEnv({ PORT: '0', REDIS_URL: '' })
    delete process.env.START_SERVER
    vi.resetModules()
    const mod = await import('../../src/server.js')
    const onError = (err) => { throw err }
    mod.server.on('error', onError)
    await new Promise((resolve) => {
      if (mod.server.listening) return resolve()
      mod.server.on('listening', resolve)
    })
    expect(mod.server.listening).toBe(true)
    await new Promise((r) => mod.server.close(r))
    restore(s)
  })

  it('covers Redis in banner', async () => {
    const s = save('START_SERVER', 'REDIS_URL', 'DB_PATH')
    setEnv({ START_SERVER: 'false', REDIS_URL: '', DB_PATH: path.join(tmpDir, 'srv-redis-banner.db') })

    const mockDb = {
      getDb: () => ({ prepare: () => ({ all: () => [], get: () => null, run: () => {} }), exec: () => {} }),
      getWrappedDb: () => ({ prepare: () => ({ all: () => [], get: () => null, run: () => {} }), exec: () => {} }),
      listAll: () => [],
      getOne: () => null,
      insertOne: () => null,
      updateOne: () => null,
      deleteOne: () => null,
      nextId: () => 1,
      TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos'],
    }

    const resolvedRedis = _require.resolve('../../src/redis.js')
    const resolvedDb = _require.resolve('../../src/database.js')

    const mockClient = {
      connect: vi.fn().mockResolvedValue(),
      ping: vi.fn().mockResolvedValue(),
      connected: true,
      quit: vi.fn().mockResolvedValue(),
      send: vi.fn().mockResolvedValue(),
    }
    const mockRedisClass = function() { return mockClient }

    const origRedisCache = _require.cache[resolvedRedis]
    const origDbCache = _require.cache[resolvedDb]
    _require.cache[resolvedRedis] = {
      exports: mockRedisClass,
      id: resolvedRedis, filename: resolvedRedis, loaded: true,
    }
    _require.cache[resolvedDb] = {
      exports: mockDb,
      id: resolvedDb, filename: resolvedDb, loaded: true,
    }

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      clearCjs('../../src/server.js', '../../src/rate-limiter.js')
      vi.resetModules()
      const { printLog } = await import('../../src/server.js')
      printLog()
      expect(logSpy.mock.calls.some(c => String(c[0]).includes('Redis'))).toBe(true)
    } finally {
      logSpy.mockRestore()
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      clearCjs('../../src/server.js', '../../src/rate-limiter.js')
    }
    restore(s)
  })

  it('covers Memory in banner', async () => {
    const s = save('START_SERVER', 'REDIS_URL', 'REDIS_PORT')
    setEnv({ START_SERVER: 'false', REDIS_URL: '', REDIS_PORT: '1' })
    vi.resetModules()
    const { printLog } = await import('../../src/server.js')
    printLog()
    restore(s)
  })

  it('covers Redis connected path in IIFE', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: path.join(tmpDir, 'srv-redis.db') })

    const mockDb = {
      getDb: () => ({ prepare: () => ({ all: () => [], get: () => null, run: () => {} }), exec: () => {} }),
      getWrappedDb: () => ({ prepare: () => ({ all: () => [], get: () => null, run: () => {} }), exec: () => {} }),
      listAll: () => [],
      getOne: () => null,
      insertOne: () => null,
      updateOne: () => null,
      deleteOne: () => null,
      nextId: () => 1,
      TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos'],
    }

    const resolvedRedis = _require.resolve('../../src/redis.js')
    const resolvedDb = _require.resolve('../../src/database.js')

    const mockClient = {
      connect: vi.fn().mockResolvedValue(),
      ping: vi.fn().mockResolvedValue(),
      connected: true,
      quit: vi.fn().mockResolvedValue(),
      send: vi.fn().mockResolvedValue(),
    }
    const mockRedisClass = function() { return mockClient }

    const origRedisCache = _require.cache[resolvedRedis]
    const origDbCache = _require.cache[resolvedDb]
    _require.cache[resolvedRedis] = {
      exports: mockRedisClass,
      id: resolvedRedis, filename: resolvedRedis, loaded: true,
    }
    _require.cache[resolvedDb] = {
      exports: mockDb,
      id: resolvedDb, filename: resolvedDb, loaded: true,
    }

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      clearCjs('../../src/server.js', '../../src/rate-limiter.js')
      vi.resetModules()
      await import('../../src/server.js')
      expect(logSpy).toHaveBeenCalledWith('[Redis] Connected ✓')
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      clearCjs('../../src/server.js', '../../src/rate-limiter.js')
    }
    restore(s)
  })
})

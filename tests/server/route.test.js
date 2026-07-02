import { describe, it, expect, vi, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { createRequire } from 'module'
import { save, restore, setEnv, configMockFactory } from '../helpers/coverage'
import { mkDb, mkRedis, mkReq, mkRes } from '../helpers/mock-factory'

const tmpDir = mkdtempSync(path.join(tmpdir(), 'cov-rt-'))
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

vi.mock('../../src/config/load-env.js', () => ({ loadEnv: () => {} }))
vi.mock('../../src/config/index.js', () => configMockFactory())

describe('route.js', () => {
  it('serves favicon.ico and favicon.png', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '' })
    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/middleware/rate-limiter.js')
    vi.resetModules()
    const { requestHandler } = await import('../../src/server/index.js')

    const resIco = mkRes()
    await requestHandler(mkReq('/favicon.ico'), resIco)
    expect(resIco.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'image/x-icon' }))

    const resPng = mkRes()
    await requestHandler(mkReq('/favicon.png'), resPng)
    expect(resPng.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'image/png' }))

    restore(s)
  })

  it('handles JSON body "null" by converting to empty object', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: ':memory:' })
    const mockDb = mkDb({ insertOne: vi.fn((table, body) => ({ id: 1, ...body })) })
    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res = mkRes()
      await requestHandler(mkReq('/api/users', 'POST', {}, 'null'), res)
      expect(res.writeHead).toHaveBeenCalledWith(201, expect.anything())
      const body = JSON.parse(res.end.mock.calls[0][0])
      expect(body).toEqual({ id: 1 })
    } finally {
      delete _require.cache[resolvedDb]
    }
    restore(s)
  })

  it('returns 401 for admin routes when ADMIN_KEY is not configured', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH', 'ADMIN_KEY')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: ':memory:', ADMIN_KEY: '' })
    const mockDb = mkDb()
    const resolvedConfig = _require.resolve('../../src/config/index.js')
    const origConfigCache = _require.cache[resolvedConfig]
    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js', '../../src/config/index.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer any-key' }), res)
      expect(res.writeHead).toHaveBeenCalledWith(401, expect.anything())
    } finally {
      delete _require.cache[resolvedDb]
      if (origConfigCache) _require.cache[resolvedConfig] = origConfigCache
      else delete _require.cache[resolvedConfig]
    }
    restore(s)
  })

  it('returns 401 when settings row is missing for ADMIN_KEY', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH', 'ADMIN_KEY')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: ':memory:', ADMIN_KEY: 'secret' })

    const argon2 = _require('argon2')
    const verifySpy = vi.spyOn(argon2, 'verify').mockResolvedValue(true)

    const mockDb = mkDb({
      getWrappedDb: () => ({
        prepare: (sql) => {
          if (sql.includes('SELECT value FROM settings')) return { get: () => null }
          return { all: () => [], get: () => null, run: () => {} }
        },
        exec: () => {},
      }),
      TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos', 'settings'],
    })

    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const { mockRedisClass } = mkRedis()
    const origDbCache = _require.cache[resolvedDb]
    const origRedisCache = _require.cache[resolvedRedis]
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    _require.cache[resolvedRedis] = { exports: mockRedisClass, id: resolvedRedis, filename: resolvedRedis, loaded: true }

    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer secret' }), res)
      expect(res.writeHead).toHaveBeenCalledWith(401, expect.anything())
      expect(verifySpy).not.toHaveBeenCalled()
    } finally {
      verifySpy.mockRestore()
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
    }
    restore(s)
  })

  it('cleans up auth cache when it exceeds 1000 entries', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH', 'ADMIN_KEY')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: ':memory:', ADMIN_KEY: 'secret', RATE_LIMIT_ENABLED: 'false' })

    const argon2 = _require('argon2')
    const origVerify = argon2.verify
    const origHash = argon2.hash
    argon2.verify = vi.fn().mockResolvedValue(true)
    argon2.hash = vi.fn().mockResolvedValue('$argon2id$hash')

    const settingsTable = [
      { key: 'ADMIN_KEY', value: '$argon2id$hash', description: 'Admin key', updated_at: '2025-01-01' },
    ]
    const mockDb = mkDb({
      getWrappedDb: () => ({
        prepare: (sql) => {
          if (sql.includes('SELECT value FROM settings')) return { get: () => settingsTable[0] }
          return { all: () => settingsTable, get: () => null, run: () => {} }
        },
        exec: () => {},
      }),
      listAll: () => settingsTable,
      TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos', 'settings'],
    })

    const resolvedConfig = _require.resolve('../../src/config/index.js')
    const origConfigCache = _require.cache[resolvedConfig]
    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js', '../../src/config/index.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const { mockRedisClass } = mkRedis()
    const origDbCache = _require.cache[resolvedDb]
    const origRedisCache = _require.cache[resolvedRedis]
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    _require.cache[resolvedRedis] = { exports: mockRedisClass, id: resolvedRedis, filename: resolvedRedis, loaded: true }

    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const promises = []
      for (let i = 0; i < 1002; i++) {
        const res = mkRes()
        const req = mkReq('/api/admin/settings', 'GET', { authorization: `Bearer token-${i}` })
        promises.push(requestHandler(req, res).then(() => {
          expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything())
        }))
      }
      await Promise.all(promises)
    } finally {
      argon2.verify = origVerify
      argon2.hash = origHash
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      if (origConfigCache) _require.cache[resolvedConfig] = origConfigCache
      else delete _require.cache[resolvedConfig]
    }
    restore(s)
  })

  it('covers auth cache cleanup deleting expired entries', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH', 'ADMIN_KEY')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: ':memory:', ADMIN_KEY: 'secret', RATE_LIMIT_ENABLED: 'false' })

    let fakeNow = 0
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeNow)

    const argon2 = _require('argon2')
    const origVerify = argon2.verify
    const origHash = argon2.hash
    argon2.verify = vi.fn().mockResolvedValue(true)
    argon2.hash = vi.fn().mockResolvedValue('$argon2id$hash')

    const settingsTable = [
      { key: 'ADMIN_KEY', value: '$argon2id$hash', description: 'Admin key', updated_at: '2025-01-01' },
    ]
    const mockDb = mkDb({
      getWrappedDb: () => ({
        prepare: (sql) => {
          if (sql.includes('SELECT value FROM settings')) return { get: () => settingsTable[0] }
          return { all: () => settingsTable, get: () => null, run: () => {} }
        },
        exec: () => {},
      }),
      listAll: () => settingsTable,
      TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos', 'settings'],
    })

    const resolvedConfig = _require.resolve('../../src/config/index.js')
    const origConfigCache = _require.cache[resolvedConfig]
    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js', '../../src/config/index.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const { mockRedisClass } = mkRedis()
    const origDbCache = _require.cache[resolvedDb]
    const origRedisCache = _require.cache[resolvedRedis]
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    _require.cache[resolvedRedis] = { exports: mockRedisClass, id: resolvedRedis, filename: resolvedRedis, loaded: true }

    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      fakeNow = 0
      for (let i = 0; i < 1001; i++) {
        const res = mkRes()
        await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: `Bearer token-${i}` }), res)
        expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything())
      }

      fakeNow = 6000
      const resLast = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer token-final' }), resLast)
      expect(resLast.writeHead).toHaveBeenCalledWith(200, expect.anything())
    } finally {
      dateNowSpy.mockRestore()
      argon2.verify = origVerify
      argon2.hash = origHash
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      if (origConfigCache) _require.cache[resolvedConfig] = origConfigCache
      else delete _require.cache[resolvedConfig]
    }
    restore(s)
  })

  it('covers sqlite_sequence cleanup in reset-database', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH', 'ADMIN_KEY')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: ':memory:', ADMIN_KEY: 'secret' })

    const argon2 = _require('argon2')
    const origVerify = argon2.verify
    const origHash = argon2.hash
    argon2.verify = vi.fn().mockResolvedValue(true)
    argon2.hash = vi.fn().mockResolvedValue('$argon2id$mockhash')

    let execCalls = []
    const wrappedDb = {
      prepare: (sql) => {
        if (sql.includes('SELECT value FROM settings')) return { get: () => ({ value: '$argon2id$mockhash' }) }
        if (sql.includes('sqlite_sequence')) return { get: () => ({ name: 'sqlite_sequence' }) }
        return { all: () => [], get: () => null, run: () => {} }
      },
      exec: vi.fn((sql) => { execCalls.push(sql) }),
    }
    const mockDb = mkDb({
      getWrappedDb: () => wrappedDb,
      listAll: () => [{ key: 'foo', value: 'bar' }],
      TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos', 'settings'],
    })

    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const resolvedSeed = _require.resolve('../../src/db/seed.js')
    const { mockRedisClass } = mkRedis()
    const origDbCache = _require.cache[resolvedDb]
    const origRedisCache = _require.cache[resolvedRedis]
    const origSeedCache = _require.cache[resolvedSeed]
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    _require.cache[resolvedRedis] = { exports: mockRedisClass, id: resolvedRedis, filename: resolvedRedis, loaded: true }
    _require.cache[resolvedSeed] = { exports: { seed: vi.fn().mockResolvedValue() }, id: resolvedSeed, filename: resolvedSeed, loaded: true }

    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res = mkRes()
      await requestHandler(mkReq('/api/admin/reset-database', 'POST', { authorization: 'Bearer secret' }, JSON.stringify({ confirm: true })), res)
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything())
      expect(execCalls).toContain('DELETE FROM sqlite_sequence')
    } finally {
      argon2.verify = origVerify
      argon2.hash = origHash
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      if (origSeedCache) _require.cache[resolvedSeed] = origSeedCache
      else delete _require.cache[resolvedSeed]
    }
    restore(s)
  })

  it('returns 404 for routes without /api prefix', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: ':memory:' })
    const mockDb = mkDb()
    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res = mkRes()
      await requestHandler(mkReq('/users', 'GET'), res)
      expect(res.writeHead).toHaveBeenCalledWith(404, expect.anything())

      const resSlash = mkRes()
      await requestHandler(mkReq('/users/', 'GET'), resSlash)
      expect(resSlash.writeHead).toHaveBeenCalledWith(404, expect.anything())
    } finally {
      delete _require.cache[resolvedDb]
    }
    restore(s)
  })

  it('covers redis connected in health endpoint', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '' })
    const { mockRedisClass } = mkRedis({ connected: true })
    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/redis/index.js', '../../src/middleware/rate-limiter.js')
    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const origRedisCache = _require.cache[resolvedRedis]
    _require.cache[resolvedRedis] = { exports: mockRedisClass, id: resolvedRedis, filename: resolvedRedis, loaded: true }
    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res = mkRes()
      await requestHandler(mkReq('/health'), res)
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything())
      const body = JSON.parse(res.end.mock.calls[0][0])
      expect(body.redis).toBe('connected')
    } finally {
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
    }
    restore(s)
  })

  it('covers resetAuthCache export', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '' })
    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/middleware/rate-limiter.js')
    vi.resetModules()
    const { requestHandler, resetAuthCache } = await import('../../src/server/index.js')

    expect(typeof resetAuthCache).toBe('function')
    expect(() => resetAuthCache()).not.toThrow()
    restore(s)
  })

  it('covers PATCH setting with unknown key', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH', 'ADMIN_KEY')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: ':memory:', ADMIN_KEY: 'secret', RATE_LIMIT_ENABLED: 'false' })

    const argon2 = _require('argon2')
    const origVerify = argon2.verify
    const origHash = argon2.hash
    argon2.verify = vi.fn().mockResolvedValue(true)
    argon2.hash = vi.fn().mockResolvedValue('$argon2id$hash')

    const settingsTable = [
      { key: 'ADMIN_KEY', value: '$argon2id$hash', description: 'Admin key', updated_at: '2025-01-01' },
    ]
    const mockDb = mkDb({
      getWrappedDb: () => ({
        prepare: (sql) => {
          if (sql.includes('SELECT value FROM settings')) return { get: () => settingsTable[0] }
          return { all: () => settingsTable, get: () => null, run: () => {} }
        },
        exec: () => {},
      }),
      listAll: () => settingsTable,
      TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos', 'settings'],
    })

    const resolvedConfig = _require.resolve('../../src/config/index.js')
    const origConfigCache = _require.cache[resolvedConfig]
    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js', '../../src/config/index.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const { mockRedisClass } = mkRedis()
    const origDbCache = _require.cache[resolvedDb]
    const origRedisCache = _require.cache[resolvedRedis]
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    _require.cache[resolvedRedis] = { exports: mockRedisClass, id: resolvedRedis, filename: resolvedRedis, loaded: true }

    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res = mkRes()
      await requestHandler(mkReq('/api/admin/settings/nonExistentKey', 'PATCH', { authorization: 'Bearer secret' }, JSON.stringify({ value: 'new-value' })), res)
      expect(res.writeHead).toHaveBeenCalledWith(404, expect.anything())
    } finally {
      argon2.verify = origVerify
      argon2.hash = origHash
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      if (origConfigCache) _require.cache[resolvedConfig] = origConfigCache
      else delete _require.cache[resolvedConfig]
    }
    restore(s)
  })

  it('covers invalid ID format in URL', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: ':memory:' })
    const mockDb = mkDb()
    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res = mkRes()
      await requestHandler(mkReq('/api/users/abc', 'GET'), res)
      expect(res.writeHead).toHaveBeenCalledWith(400, expect.anything())
    } finally {
      delete _require.cache[resolvedDb]
    }
    restore(s)
  })

  it('covers unknown route not in TABLES', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: ':memory:' })
    const mockDb = mkDb({ TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos'] })
    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res = mkRes()
      await requestHandler(mkReq('/api/extras', 'GET'), res)
      expect(res.writeHead).toHaveBeenCalledWith(404, expect.anything())
    } finally {
      delete _require.cache[resolvedDb]
    }
    restore(s)
  })

  it('covers remaining route.js branches together', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH', 'ADMIN_KEY')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: ':memory:', ADMIN_KEY: 'secret' })

    const argon2 = _require('argon2')
    const origVerify = argon2.verify
    const origHash = argon2.hash
    argon2.verify = vi.fn().mockResolvedValue(true)
    argon2.hash = vi.fn().mockResolvedValue('$argon2id$hash')

    const settingsTable = [
      { key: 'ADMIN_KEY', value: '$argon2id$hash', description: 'Admin key', updated_at: '2025-01-01' },
    ]
    const mockDb = mkDb({
      getWrappedDb: () => ({
        prepare: (sql) => {
          if (sql.includes('SELECT value FROM settings')) return { get: () => settingsTable[0] }
          return { all: () => settingsTable, get: () => null, run: () => {} }
        },
        exec: () => {},
      }),
      listAll: () => settingsTable,
      getOne: () => ({ id: 1, name: 'Alice' }),
      TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos', 'settings'],
    })

    clearCjs('../../src/server/index.js', '../../src/server/route.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const { mockRedisClass } = mkRedis()
    const origDbCache = _require.cache[resolvedDb]
    const origRedisCache = _require.cache[resolvedRedis]
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    _require.cache[resolvedRedis] = { exports: mockRedisClass, id: resolvedRedis, filename: resolvedRedis, loaded: true }

    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res1 = mkRes()
      await requestHandler(mkReq('/api/admin/settings/nonExistentKey', 'PATCH', { authorization: 'Bearer secret' }, JSON.stringify({ value: 'x' })), res1)
      expect(res1.writeHead).toHaveBeenCalledWith(404, expect.anything())

      const res2 = mkRes()
      await requestHandler(mkReq('/api/extras', 'GET'), res2)
      expect(res2.writeHead).toHaveBeenCalledWith(404, expect.anything())

      const res3 = mkRes()
      await requestHandler(mkReq('/api/users/abc', 'GET'), res3)
      expect(res3.writeHead).toHaveBeenCalledWith(400, expect.anything())

      const res4 = mkRes()
      res4.writableEnded = true
      await requestHandler(mkReq('/api/users', 'GET'), res4)
      expect(res4.writeHead).not.toHaveBeenCalled()

      const res5 = mkRes()
      await requestHandler(mkReq('/api/users', 'GET'), res5)
      expect(res5.writeHead).toHaveBeenCalledWith(200, expect.anything())

      const res6 = mkRes()
      await requestHandler(mkReq('/api/users/1', 'GET'), res6)
      expect(res6.writeHead).toHaveBeenCalledWith(200, expect.anything())

      const res7 = mkRes()
      await requestHandler(mkReq('/api/admin/settings/DEFAULT_PAGE_SIZE', 'PATCH', { authorization: 'Bearer secret' }, JSON.stringify({ value: 20 })), res7)
      expect(res7.writeHead).toHaveBeenCalledWith(201, expect.anything())
    } finally {
      argon2.verify = origVerify
      argon2.hash = origHash
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
    }
    restore(s)
  })
})

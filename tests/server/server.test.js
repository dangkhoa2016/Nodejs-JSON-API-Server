import { describe, it, expect, vi, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { createRequire } from 'module'
import { save, restore, setEnv, configMockFactory } from '../helpers/coverage'
import { mkDb, mkRedis, mkReq, mkRes } from '../helpers/mock-factory'

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

vi.mock('../../src/config/load-env.js', () => ({ loadEnv: () => {} }))
vi.mock('../../src/config/index.js', () => configMockFactory())

describe('server.js', () => {
  it('handles 500 when db throws', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: path.join(tmpDir, 'srv1.db') })
    const mockDb = mkDb({
      listAll: () => { throw new Error('boom') },
      insertOne: () => { throw new Error('duplicate') },
    })
    clearCjs('../../src/server/index.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res1 = mkRes()
      await requestHandler(mkReq('/api/users', 'GET'), res1)
      expect(res1.writeHead).toHaveBeenCalledWith(500, expect.anything())

      const res2 = mkRes()
      await requestHandler(mkReq('/api/users', 'POST', {}, '{"name":"X"}'), res2)
      expect(res2.writeHead).toHaveBeenCalledWith(400, expect.anything())

      const res3 = mkRes()
      await requestHandler(mkReq('/api/users/1', 'PUT', {}, 'bad-json'), res3)
      expect(res3.writeHead).toHaveBeenCalledWith(400, expect.anything())

      const res4 = mkRes()
      await requestHandler(mkReq('/api/users/1', 'PATCH', {}, 'bad-json'), res4)
      expect(res4.writeHead).toHaveBeenCalledWith(400, expect.anything())

      const res5 = mkRes()
      await requestHandler(mkReq('/api/users', 'POST', {}, ''), res5)
      expect(res5.writeHead).toHaveBeenCalledWith(400, expect.anything())
    } finally {
      delete _require.cache[resolvedDb]
    }
    restore(s)
  })

  it('rejects invalid pagination params with 400', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: path.join(tmpDir, 'srv-pag.db') })
    const mockDb = mkDb()
    clearCjs('../../src/server/index.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const badParams = ['_page=abc', '_limit=-1', '_start=NaN', '_end=1.5']
      for (const param of badParams) {
        const res = mkRes()
        await requestHandler(mkReq(`/api/users?${param}`), res)
        expect(res.writeHead).toHaveBeenCalledWith(400, expect.anything())
      }

      const goodRes = mkRes()
      await requestHandler(mkReq('/api/users?_page=1&_limit=5'), goodRes)
      expect(goodRes.writeHead).toHaveBeenCalledWith(200, expect.anything())
    } finally {
      delete _require.cache[resolvedDb]
    }
    restore(s)
  })

  it('returns 400 for non-numeric ID in route', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: path.join(tmpDir, 'srv-id.db') })
    const mockDb = mkDb()
    clearCjs('../../src/server/index.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    try {
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res = mkRes()
      await requestHandler(mkReq('/api/users/abc'), res)
      expect(res.writeHead).toHaveBeenCalledWith(400, expect.anything())
      const body = JSON.parse(res.end.mock.calls[0][0])
      expect(body.error).toBe('Invalid ID format')
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
    const mod = await import('../../src/server/index.js')
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

    const mockDb = mkDb()

    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')

    const { mockRedisClass } = mkRedis({ connected: true })

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
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
      vi.resetModules()
      const { printLog } = await import('../../src/server/index.js')
      printLog()
      expect(logSpy.mock.calls.some(c => String(c[0]).includes('Redis'))).toBe(true)
    } finally {
      logSpy.mockRestore()
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
    }
    restore(s)
  })

  it('covers Memory in banner', async () => {
    const s = save('START_SERVER', 'REDIS_URL', 'REDIS_PORT')
    setEnv({ START_SERVER: 'false', REDIS_URL: '', REDIS_PORT: '1' })
    vi.resetModules()
    const { printLog } = await import('../../src/server/index.js')
    printLog()
    restore(s)
  })

  it('covers admin routes', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH', 'ADMIN_KEY', 'MAX_BODY_SIZE')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: path.join(tmpDir, 'srv-admin.db'), ADMIN_KEY: 'secret', MAX_BODY_SIZE: '100' })

    const argon2Mock = _require('argon2')
    argon2Mock.verify = vi.fn().mockImplementation((hash, pwd) => Promise.resolve(pwd === 'secret'))
    argon2Mock.hash = vi.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$mockedhash')

    const settingsTable = [
      { key: 'ADMIN_KEY', value: '$argon2id$v=19$m=65536,t=3,p=4$mockedhash', description: 'Admin key', updated_at: '2025-01-01' },
      { key: 'NODE_ENV', value: 'development', description: 'Environment', updated_at: '2025-01-01' },
      { key: 'REDIS_PASSWORD', value: 'mockpassword', description: 'Redis password', updated_at: '2025-01-01' },
    ]

    const mockDb = mkDb({
      getWrappedDb: () => ({
        prepare: (sql) => {
          if (sql.includes('SELECT value FROM settings')) {
            return { get: () => settingsTable[0] }
          }
          if (sql.includes('SELECT * FROM settings WHERE key')) {
            return { get: (key) => settingsTable.find(s => s.key === key) || null }
          }
          if (sql.includes('UPDATE settings SET')) {
            return { run: () => { settingsTable[0].value = 'updated' } }
          }
          return { all: () => settingsTable, get: () => null, run: () => {} }
        },
        exec: () => {},
      }),
      listAll: () => settingsTable,
      TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos', 'settings'],
    })

    const resolvedDb = _require.resolve('../../src/db/index.js')
    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const resolvedSeed = _require.resolve('../../src/db/seed.js')
    const { mockRedisClass } = mkRedis()

    const origDbCache = _require.cache[resolvedDb]
    const origRedisCache = _require.cache[resolvedRedis]
    const origSeedCache = _require.cache[resolvedSeed]
    const origArgon2Verify = argon2Mock.verify
    const origArgon2Hash = argon2Mock.hash
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    _require.cache[resolvedRedis] = { exports: mockRedisClass, id: resolvedRedis, filename: resolvedRedis, loaded: true }
    _require.cache[resolvedSeed] = {
      exports: { seed: vi.fn().mockResolvedValue() },
      id: resolvedSeed, filename: resolvedSeed, loaded: true,
    }

    try {
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js', '../../src/config/index.js', '../../src/config/load-env.js')
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res0 = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET'), res0)
      expect(res0.writeHead).toHaveBeenCalledWith(401, expect.anything())

      const res1 = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer wrong' }), res1)
      expect(res1.writeHead).toHaveBeenCalledWith(401, expect.anything())

      settingsTable[0].value = '$argon2id$v=19$m=65536,t=3,p=4$mockedhash'
      const res2 = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer secret' }), res2)
      expect(res2.writeHead).toHaveBeenCalledWith(200, expect.anything())
      const body2 = JSON.parse(res2.end.mock.calls[0][0])
      expect(body2.find(r => r.key === 'REDIS_PASSWORD').value).toBe('***')
      expect(body2.find(r => r.key === 'ADMIN_KEY').value).toBe('***')

      const res3 = mkRes()
      await requestHandler(mkReq('/api/admin/settings/NODE_ENV', 'PATCH', { authorization: 'Bearer secret' }, JSON.stringify({ value: 'production' })), res3)
      expect(res3.writeHead).toHaveBeenCalledWith(200, expect.anything())

      const res4 = mkRes()
      await requestHandler(mkReq('/api/admin/settings/NONEXISTENT', 'PATCH', { authorization: 'Bearer secret' }, JSON.stringify({ value: 'x' })), res4)
      expect(res4.writeHead).toHaveBeenCalledWith(404, expect.anything())

      // PATCH a whitelisted setting not yet in DB → 201 Created
      const resCreate = mkRes()
      await requestHandler(mkReq('/api/admin/settings/DEFAULT_PAGE_SIZE', 'PATCH', { authorization: 'Bearer secret' }, JSON.stringify({ value: 20 })), resCreate)
      expect(resCreate.writeHead).toHaveBeenCalledWith(201, expect.anything())

      // PATCH ADMIN_KEY when not yet in DB → INSERT + hash path
      const origAdminRow = settingsTable.shift()
      const resCreateAdmin = mkRes()
      await requestHandler(mkReq('/api/admin/settings/ADMIN_KEY', 'PATCH', { authorization: 'Bearer secret' }, JSON.stringify({ value: 'new-secret' })), resCreateAdmin)
      expect(resCreateAdmin.writeHead).toHaveBeenCalledWith(201, expect.anything())
      settingsTable.unshift(origAdminRow)

      const res5 = mkRes()
      await requestHandler(mkReq('/api/admin/settings/ADMIN_KEY', 'PATCH', { authorization: 'Bearer secret' }, JSON.stringify({ value: 'newadmin' })), res5)
      expect(res5.writeHead).toHaveBeenCalledWith(200, expect.anything())

      const res6 = mkRes()
      await requestHandler(mkReq('/api/admin/settings/NODE_ENV', 'PATCH', { authorization: 'Bearer secret' }, '{invalid'), res6)
      expect(res6.writeHead).toHaveBeenCalledWith(400, expect.anything())

      const res7 = mkRes()
      await requestHandler(mkReq('/api/admin/settings/NODE_ENV', 'PATCH', { authorization: 'Bearer secret' }, JSON.stringify({})), res7)
      expect(res7.writeHead).toHaveBeenCalledWith(400, expect.anything())

      const res8 = mkRes()
      await requestHandler(mkReq('/api/admin/unknown', 'GET', { authorization: 'Bearer secret' }), res8)
      expect(res8.writeHead).toHaveBeenCalledWith(404, expect.anything())

      const res9 = mkRes()
      await requestHandler(mkReq('/api/admin/settings/NODE_ENV', 'PATCH', { authorization: 'Bearer secret' }, JSON.stringify({ value: null })), res9)
      expect(res9.writeHead).toHaveBeenCalledWith(400, expect.anything())

      const resReset = mkRes()
      await requestHandler(mkReq('/api/admin/reset-database', 'POST', { authorization: 'Bearer secret' }, JSON.stringify({ confirm: true })), resReset)
      expect(resReset.writeHead).toHaveBeenCalledWith(200, expect.anything())

      const resResetNoConfirm = mkRes()
      await requestHandler(mkReq('/api/admin/reset-database', 'POST', { authorization: 'Bearer secret' }), resResetNoConfirm)
      expect(resResetNoConfirm.writeHead).toHaveBeenCalledWith(400, expect.anything())

      // malformed JSON body → readBodySafe returns null → early return from handleAdminResetDatabase
      const resMalformed = mkRes()
      await requestHandler(mkReq('/api/admin/reset-database', 'POST', { authorization: 'Bearer secret' }, 'not json'), resMalformed)
      expect(resMalformed.writeHead).toHaveBeenCalledWith(400, expect.anything())

      argon2Mock.verify = vi.fn().mockRejectedValue(new Error('verify fail'))
      const resThrow = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer uncached' }), resThrow)
      expect(resThrow.writeHead).toHaveBeenCalledWith(401, expect.anything())

      // oversized body on admin PATCH → 413
      argon2Mock.verify = vi.fn().mockImplementation((hash, pwd) => Promise.resolve(pwd === 'secret'))
      const resBulk = mkRes()
      await requestHandler(mkReq('/api/admin/settings/NODE_ENV', 'PATCH', { authorization: 'Bearer secret' }, 'x'.repeat(200)), resBulk)
      expect(resBulk.writeHead).toHaveBeenCalledWith(413, expect.anything())
    } finally {
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      if (origSeedCache) _require.cache[resolvedSeed] = origSeedCache
      else delete _require.cache[resolvedSeed]
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
    }
    restore(s)
  })

  it('covers Redis connected path in IIFE', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: path.join(tmpDir, 'srv-redis.db') })

    const mockDb = mkDb()

    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')

    const { mockRedisClass } = mkRedis({ connected: true })

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
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
      vi.resetModules()
      await import('../../src/server/index.js')
      expect(logSpy).toHaveBeenCalledWith('[Redis] Connected ✓')
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
    }
    restore(s)
  })

  it('covers graceful shutdown on SIGINT/SIGTERM', async () => {
    const s = save('PORT', 'REDIS_URL')
    setEnv({ PORT: '0', REDIS_URL: '' })
    delete process.env.START_SERVER

    const oldSigint = process.listeners('SIGINT')
    const oldSigterm = process.listeners('SIGTERM')
    process.removeAllListeners('SIGINT')
    process.removeAllListeners('SIGTERM')

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})

    clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js', '../../src/redis/index.js')
    vi.resetModules()

    const { mockClient, mockRedisClass } = mkRedis()
    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const origRedisCache = _require.cache[resolvedRedis]
    _require.cache[resolvedRedis] = {
      exports: mockRedisClass,
      id: resolvedRedis, filename: resolvedRedis, loaded: true,
    }

    try {
      const mod = await import('../../src/server/index.js')

      await new Promise((resolve) => {
        if (mod.server.listening) return resolve()
        mod.server.on('listening', resolve)
      })

      process.emit('SIGINT')
      await new Promise(r => setTimeout(r, 50))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('SIGINT'))
      expect(mod.server.listening).toBe(false)

      logSpy.mockClear()

      process.emit('SIGTERM')
      await new Promise(r => setTimeout(r, 50))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('SIGTERM'))
      expect(mod.server.listening).toBe(false)
    } finally {
      logSpy.mockRestore()
      exitSpy.mockRestore()
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
      for (const fn of oldSigint) process.on('SIGINT', fn)
      for (const fn of oldSigterm) process.on('SIGTERM', fn)
    }
    restore(s)
  })

  it('caches argon2 verification results to avoid repeated calls', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH', 'ADMIN_KEY')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: path.join(tmpDir, 'srv-cache.db'), ADMIN_KEY: 'secret' })

    const argon2 = _require('argon2')
    const verifySpy = vi.spyOn(argon2, 'verify').mockImplementation((hash, pwd) => Promise.resolve(pwd === 'secret'))

    const settingsTable = [
      { key: 'ADMIN_KEY', value: '$argon2id$v=19$m=65536,t=3,p=4$mockedhash', description: 'Admin key', updated_at: '2025-01-01' },
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

    const resolvedDb = _require.resolve('../../src/db/index.js')
    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const { mockRedisClass } = mkRedis()
    const origDbCache = _require.cache[resolvedDb]
    const origRedisCache = _require.cache[resolvedRedis]
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    _require.cache[resolvedRedis] = { exports: mockRedisClass, id: resolvedRedis, filename: resolvedRedis, loaded: true }

    try {
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res1 = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer secret' }), res1)
      expect(res1.writeHead).toHaveBeenCalledWith(200, expect.anything())
      const firstCalls = verifySpy.mock.calls.length

      const res2 = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer secret' }), res2)
      expect(res2.writeHead).toHaveBeenCalledWith(200, expect.anything())
      expect(verifySpy.mock.calls.length).toBe(firstCalls)

      const res3 = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer wrong' }), res3)
      expect(res3.writeHead).toHaveBeenCalledWith(401, expect.anything())
      expect(verifySpy.mock.calls.length).toBe(firstCalls + 1)

      const res4 = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer wrong' }), res4)
      expect(res4.writeHead).toHaveBeenCalledWith(401, expect.anything())
      expect(verifySpy.mock.calls.length).toBe(firstCalls + 1)
    } finally {
      verifySpy.mockRestore()
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
    }
    restore(s)
  })

  it('returns 500 when admin handler throws unexpectedly', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH', 'ADMIN_KEY')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: path.join(tmpDir, 'srv-admin-500.db'), ADMIN_KEY: 'secret' })

    const arModule = _require('argon2')
    const origArVerify = arModule.verify
    const origArHash = arModule.hash
    arModule.verify = vi.fn().mockResolvedValue(true)
    arModule.hash = vi.fn().mockResolvedValue('$argon2id$mockhash')

    const mockDbThrows = mkDb({
      getWrappedDb: () => ({
        prepare: (sql) => {
          if (sql.includes('SELECT value FROM settings')) return { get: () => ({ value: '$argon2id$mockhash' }) }
          return { all: () => [], get: () => null, run: () => {} }
        },
        exec: () => {},
      }),
      listAll: () => { throw new Error('unexpected db error') },
      TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos', 'settings'],
    })

    const resolvedDb = _require.resolve('../../src/db/index.js')
    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const resolvedSeed = _require.resolve('../../src/db/seed.js')
    const { mockRedisClass } = mkRedis()

    const origDbCache = _require.cache[resolvedDb]
    const origRedisCache = _require.cache[resolvedRedis]
    const origSeedCache = _require.cache[resolvedSeed]
    _require.cache[resolvedDb] = { exports: mockDbThrows, id: resolvedDb, filename: resolvedDb, loaded: true }
    _require.cache[resolvedRedis] = { exports: mockRedisClass, id: resolvedRedis, filename: resolvedRedis, loaded: true }
    _require.cache[resolvedSeed] = { exports: { seed: vi.fn().mockResolvedValue() }, id: resolvedSeed, filename: resolvedSeed, loaded: true }

    try {
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer secret' }), res)
      expect(res.writeHead).toHaveBeenCalledWith(500, expect.anything())
    } finally {
      arModule.verify = origArVerify
      arModule.hash = origArHash
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      if (origSeedCache) _require.cache[resolvedSeed] = origSeedCache
      else delete _require.cache[resolvedSeed]
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
    }
    restore(s)
  })

  it('returns 500 when reset-database seed fails', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH', 'ADMIN_KEY')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: path.join(tmpDir, 'srv-reset-fail.db'), ADMIN_KEY: 'secret' })

    const argon2 = _require('argon2')
    const origVerify = argon2.verify
    const origHash = argon2.hash
    argon2.verify = vi.fn().mockResolvedValue(true)
    argon2.hash = vi.fn().mockResolvedValue('$argon2id$mockhash')

    const wrappedDb = {
      prepare: (sql) => {
        if (sql.includes('SELECT value FROM settings')) return { get: () => ({ value: '$argon2id$mockhash' }) }
        return { all: () => [], get: () => null, run: () => {} }
      },
      exec: vi.fn(),
    }
    const mockDbSeedFail = mkDb({
      getWrappedDb: () => wrappedDb,
      listAll: () => [{ key: 'foo', value: 'bar' }],
      TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos', 'settings'],
    })

    const resolvedDb = _require.resolve('../../src/db/index.js')
    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const resolvedSeed = _require.resolve('../../src/db/seed.js')
    const { mockRedisClass } = mkRedis()

    const origDbCache = _require.cache[resolvedDb]
    const origRedisCache = _require.cache[resolvedRedis]
    const origSeedCache = _require.cache[resolvedSeed]
    _require.cache[resolvedDb] = { exports: mockDbSeedFail, id: resolvedDb, filename: resolvedDb, loaded: true }
    _require.cache[resolvedRedis] = { exports: mockRedisClass, id: resolvedRedis, filename: resolvedRedis, loaded: true }
    _require.cache[resolvedSeed] = { exports: { seed: vi.fn().mockRejectedValue(new Error('seed fail')) }, id: resolvedSeed, filename: resolvedSeed, loaded: true }

    try {
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res = mkRes()
      await requestHandler(mkReq('/api/admin/reset-database', 'POST', { authorization: 'Bearer secret', 'content-type': 'application/json' }, JSON.stringify({ confirm: true })), res)
      expect(res.writeHead).toHaveBeenCalledWith(500, expect.anything())
      expect(mockDbSeedFail.getWrappedDb().exec).toHaveBeenCalledWith('ROLLBACK')
    } finally {
      argon2.verify = origVerify
      argon2.hash = origHash
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      delete _require.cache[resolvedSeed]
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
    }
    restore(s)
  })

  it('caches argon2 errors so repeated failures skip verify', async () => {
    const s = save('START_SERVER', 'PORT', 'REDIS_URL', 'DB_PATH', 'ADMIN_KEY')
    setEnv({ START_SERVER: 'false', PORT: '0', REDIS_URL: '', DB_PATH: path.join(tmpDir, 'srv-cache-err.db'), ADMIN_KEY: 'secret' })

    const argon2 = _require('argon2')
    const verifySpy = vi.spyOn(argon2, 'verify').mockImplementation((hash, pwd) => {
      if (pwd === 'throw') throw new Error('argon2 crash')
      return Promise.resolve(pwd === 'secret')
    })

    const settingsTable = [
      { key: 'ADMIN_KEY', value: '$argon2id$v=19$m=65536,t=3,p=4$mockedhash', description: 'Admin key', updated_at: '2025-01-01' },
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

    const resolvedDb = _require.resolve('../../src/db/index.js')
    const resolvedRedis = _require.resolve('../../src/redis/index.js')
    const { mockRedisClass } = mkRedis()

    const origDbCache = _require.cache[resolvedDb]
    const origRedisCache = _require.cache[resolvedRedis]
    _require.cache[resolvedDb] = { exports: mockDb, id: resolvedDb, filename: resolvedDb, loaded: true }
    _require.cache[resolvedRedis] = { exports: mockRedisClass, id: resolvedRedis, filename: resolvedRedis, loaded: true }

    try {
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
      vi.resetModules()
      const { requestHandler } = await import('../../src/server/index.js')

      const res1 = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer throw' }), res1)
      expect(res1.writeHead).toHaveBeenCalledWith(401, expect.anything())
      expect(verifySpy).toHaveBeenCalledTimes(1)

      const res2 = mkRes()
      await requestHandler(mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer throw' }), res2)
      expect(res2.writeHead).toHaveBeenCalledWith(401, expect.anything())
      expect(verifySpy).toHaveBeenCalledTimes(1)
    } finally {
      verifySpy.mockRestore()
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      if (origRedisCache) _require.cache[resolvedRedis] = origRedisCache
      else delete _require.cache[resolvedRedis]
      clearCjs('../../src/server/index.js', '../../src/middleware/rate-limiter.js')
    }
    restore(s)
  })
})

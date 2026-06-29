import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { save, restore, createClearCjs } from '../helpers/coverage'

const _require = createRequire(import.meta.url)
const clearCjs = createClearCjs(import.meta.url)

function mockLoadEnv() {
  clearCjs('../../src/config/index.js', '../../src/config/load-env.js')
  const loadEnvResolved = _require.resolve('../../src/config/load-env.js')
  _require.cache[loadEnvResolved] = { exports: { loadEnv: () => {} } }
}

describe('config.js', () => {
  it('covers branches in the real config module via CJS require', () => {
    const s = save('PORT', 'DB_PATH', 'REDIS_URL', 'RATE_LIMIT_ENABLED', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB', 'REDIS_PASSWORD', 'DEBUG_SQL', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS', 'MAX_BODY_SIZE', 'ADMIN_KEY')
    process.env.PORT = '5000'
    process.env.REDIS_URL = 'redis://custom:6379'
    process.env.RATE_LIMIT_ENABLED = 'false'
    process.env.DB_PATH = '/custom/data.db'
    process.env.DEBUG_SQL = 'true'
    process.env.MAX_BODY_SIZE = '2097152'
    process.env.ADMIN_KEY = 'your-test-secret-admin-key'
    clearCjs('../../src/config/index.js', '../../src/config/load-env.js')
    const mod = _require('../../src/config/index.js')
    expect(mod.port).toBe(5000)
    expect(mod.redisOpts).toEqual({ url: 'redis://custom:6379' })
    expect(mod.rateLimitEnabled).toBe(false)
    expect(mod.dbDebugSql).toBe(true)
    expect(mod.dbPath).toBe('/custom/data.db')
    expect(mod.maxBodySize).toBe(2097152)
    expect(mod.adminKey).toBe('your-test-secret-admin-key')
    expect(mod.defaultPageSize).toBe(10)
    restore(s)
  })

  it('covers rate limit enabled default and maxBodySize fallback via CJS', () => {
    const s = save('RATE_LIMIT_ENABLED', 'MAX_BODY_SIZE')
    delete process.env.RATE_LIMIT_ENABLED
    delete process.env.MAX_BODY_SIZE
    mockLoadEnv()
    const mod = _require('../../src/config/index.js')
    expect(mod.rateLimitEnabled).toBe(true)
    expect(mod.maxBodySize).toBe(1048576)
    restore(s)
  })

  it('uses defaults when PORT is empty string', () => {
    const s = save('PORT', 'DB_PATH', 'REDIS_URL', 'RATE_LIMIT_ENABLED', 'MAX_BODY_SIZE')
    process.env.PORT = ''
    process.env.DB_PATH = ''
    process.env.REDIS_URL = ''
    process.env.RATE_LIMIT_ENABLED = ''
    mockLoadEnv()
    const mod = _require('../../src/config/index.js')
    expect(mod.port).toBe(3000)
    expect(mod.dbPath).toContain('storage/data.db')
    expect(mod.redisOpts.host).toBe('127.0.0.1')
    expect(mod.rateLimitEnabled).toBe(true)
    restore(s)
  })

  it('covers mock fallback branches when env vars are deleted', () => {
    const s = save('PORT', 'DB_PATH', 'REDIS_URL', 'RATE_LIMIT_ENABLED', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB', 'REDIS_PASSWORD', 'DEBUG_SQL', 'MAX_BODY_SIZE')
    delete process.env.PORT
    delete process.env.DB_PATH
    delete process.env.REDIS_URL
    delete process.env.RATE_LIMIT_ENABLED
    delete process.env.RATE_LIMIT_MAX
    delete process.env.RATE_LIMIT_WINDOW_MS
    delete process.env.REDIS_HOST
    delete process.env.REDIS_PORT
    delete process.env.REDIS_DB
    delete process.env.REDIS_PASSWORD
    delete process.env.DEBUG_SQL
    delete process.env.MAX_BODY_SIZE
    mockLoadEnv()
    const mod = _require('../../src/config/index.js')
    expect(mod.port).toBe(3000)
    expect(mod.rateLimitEnabled).toBe(true)
    expect(mod.rateLimitMax).toBe(100)
    expect(mod.rateLimitWindowMs).toBe(60000)
    expect(mod.rateLimitWindowSec).toBe(60)
    expect(mod.dbDebugSql).toBe(false)
    expect(mod.redisOpts.host).toBe('127.0.0.1')
    expect(mod.redisOpts.port).toBe(6379)
    expect(mod.redisOpts.db).toBe(0)
    expect(mod.maxBodySize).toBe(1048576)
    restore(s)
  })

  it('uses REDIS_URL when set', () => {
    const s = save('REDIS_URL')
    process.env.REDIS_URL = 'redis://u:p@h:6380/2'
    mockLoadEnv()
    const mod = _require('../../src/config/index.js')
    expect(mod.redisOpts.url).toBe('redis://u:p@h:6380/2')
    restore(s)
  })

  it('uses explicit config values when set', () => {
    const s = save('PORT', 'DB_PATH', 'REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB', 'REDIS_PASSWORD', 'RATE_LIMIT_ENABLED', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS', 'MAX_BODY_SIZE')
    process.env.PORT = '4000'
    process.env.DB_PATH = '/tmp/config.db'
    process.env.REDIS_URL = ''
    process.env.REDIS_HOST = 'redis.local'
    process.env.REDIS_PORT = '6380'
    process.env.REDIS_DB = '2'
    process.env.REDIS_PASSWORD = 'secret'
    process.env.RATE_LIMIT_ENABLED = 'false'
    process.env.RATE_LIMIT_MAX = '7'
    process.env.RATE_LIMIT_WINDOW_MS = '15000'
    mockLoadEnv()
    const mod = _require('../../src/config/index.js')
    expect(mod.port).toBe(4000)
    expect(mod.dbPath).toBe('/tmp/config.db')
    expect(mod.redisOpts).toEqual({ host: 'redis.local', port: 6380, db: 2, password: 'secret' })
    expect(mod.rateLimitEnabled).toBe(false)
    expect(mod.rateLimitMax).toBe(7)
    expect(mod.rateLimitWindowMs).toBe(15000)
    expect(mod.rateLimitWindowSec).toBe(15)
    restore(s)
  })

  it('falls back to default maxBodySize when env var is not a valid integer', () => {
    const s = save('MAX_BODY_SIZE')
    process.env.MAX_BODY_SIZE = 'abc'
    mockLoadEnv()
    const mod = _require('../../src/config/index.js')
    expect(mod.maxBodySize).toBe(1048576)
    restore(s)
  })

  it('falls back to default maxBodySize when env var is less than 1', () => {
    const s = save('MAX_BODY_SIZE')
    process.env.MAX_BODY_SIZE = '0'
    mockLoadEnv()
    const mod = _require('../../src/config/index.js')
    expect(mod.maxBodySize).toBe(1048576)
    restore(s)
  })

  it('defaults adminKey to empty string when ADMIN_KEY is not set', () => {
    const s = save('ADMIN_KEY')
    process.env.ADMIN_KEY = ''
    mockLoadEnv()
    const mod = _require('../../src/config/index.js')
    expect(mod.adminKey).toBe('')
    restore(s)
  })
})

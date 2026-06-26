import { describe, it, expect, vi, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { createRequire } from 'module'
import { save, restore, setEnv, configMockFactory } from '../helpers/coverage'

const tmpDir = mkdtempSync(path.join(tmpdir(), 'cov-config-'))
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

describe('config.js', () => {
  it('uses defaults when PORT is empty string', async () => {
    const s = save('PORT', 'DB_PATH', 'REDIS_URL', 'RATE_LIMIT_ENABLED')
    setEnv({ PORT: '', DB_PATH: '', REDIS_URL: '', RATE_LIMIT_ENABLED: '' })
    vi.resetModules()
    const mod = await import('../../src/config/index.js')
    expect(mod.port).toBe(3000)
    expect(mod.dbPath).toContain('storage/data.db')
    expect(mod.redisOpts.host).toBe('127.0.0.1')
    expect(mod.rateLimitEnabled).toBe(true)
    restore(s)
  })

  it('covers mock fallback branches when env vars are deleted', async () => {
    const s = save('PORT', 'DB_PATH', 'REDIS_URL', 'RATE_LIMIT_ENABLED', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB', 'REDIS_PASSWORD', 'DEBUG_SQL')
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
    vi.resetModules()
    const mod = await import('../../src/config/index.js')
    expect(mod.port).toBe(3000)
    expect(mod.rateLimitEnabled).toBe(true)
    expect(mod.rateLimitMax).toBe(100)
    expect(mod.rateLimitWindowMs).toBe(60000)
    expect(mod.rateLimitWindowSec).toBe(60)
    expect(mod.dbDebugSql).toBe(false)
    expect(mod.redisOpts.host).toBe('127.0.0.1')
    expect(mod.redisOpts.port).toBe(6379)
    expect(mod.redisOpts.db).toBe(0)
    restore(s)
  })

  it('uses REDIS_URL when set', async () => {
    const s = save('REDIS_URL')
    process.env.REDIS_URL = 'redis://u:p@h:6380/2'
    vi.resetModules()
    const mod = await import('../../src/config/index.js')
    expect(mod.redisOpts.url).toBe('redis://u:p@h:6380/2')
    restore(s)
  })

  it('uses explicit config values when set', async () => {
    const s = save('PORT', 'DB_PATH', 'REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB', 'REDIS_PASSWORD', 'RATE_LIMIT_ENABLED', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS')
    setEnv({
      PORT: '4000',
      DB_PATH: path.join(tmpDir, 'config.db'),
      REDIS_URL: '',
      REDIS_HOST: 'redis.local',
      REDIS_PORT: '6380',
      REDIS_DB: '2',
      REDIS_PASSWORD: 'secret',
      RATE_LIMIT_ENABLED: 'false',
      RATE_LIMIT_MAX: '7',
      RATE_LIMIT_WINDOW_MS: '15000',
    })
    vi.resetModules()
    const mod = await import('../../src/config/index.js')
    expect(mod.port).toBe(4000)
    expect(mod.dbPath).toBe(path.join(tmpDir, 'config.db'))
    expect(mod.redisOpts).toEqual({ host: 'redis.local', port: 6380, db: 2, password: 'secret' })
    expect(mod.rateLimitEnabled).toBe(false)
    expect(mod.rateLimitMax).toBe(7)
    expect(mod.rateLimitWindowMs).toBe(15000)
    expect(mod.rateLimitWindowSec).toBe(15)
    restore(s)
  })

  it('covers branches in the real config module via CJS require', () => {
    const s = save('PORT', 'DB_PATH', 'REDIS_URL', 'RATE_LIMIT_ENABLED', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB', 'REDIS_PASSWORD', 'DEBUG_SQL', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS')
    process.env.PORT = '5000'
    process.env.REDIS_URL = 'redis://custom:6379'
    process.env.RATE_LIMIT_ENABLED = 'false'
    process.env.DB_PATH = '/custom/data.db'
    process.env.DEBUG_SQL = 'true'
    clearCjs('../../src/config/index.js', '../../src/config/load-env.js')
    const mod = _require('../../src/config/index.js')
    expect(mod.port).toBe(5000)
    expect(mod.redisOpts).toEqual({ url: 'redis://custom:6379' })
    expect(mod.rateLimitEnabled).toBe(false)
    expect(mod.dbDebugSql).toBe(true)
    expect(mod.dbPath).toBe('/custom/data.db')
    restore(s)
  })

  it('covers PORT default and rate limit enabled branches via CJS', () => {
    const s = save('PORT', 'RATE_LIMIT_ENABLED', 'REDIS_URL', 'DB_PATH', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB', 'REDIS_PASSWORD', 'DEBUG_SQL', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS')
    delete process.env.PORT
    delete process.env.RATE_LIMIT_ENABLED
    clearCjs('../../src/config/index.js', '../../src/config/load-env.js')
    const mod = _require('../../src/config/index.js')
    expect(mod.port).toBe(3000)
    expect(mod.rateLimitEnabled).toBe(true)
    restore(s)
  })
})

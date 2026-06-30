import { describe, it, expect, vi, afterAll, afterEach } from 'vitest'
import { createRequire } from 'module'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createClearCjs } from './helpers/coverage'

const _require = createRequire(import.meta.url)
const clearCjs = createClearCjs(import.meta.url)
const tmpDir = mkdtempSync(join(tmpdir(), 'ss-cov-'))

afterEach(() => {
  clearCjs('../src/db/seed-settings.js', '../src/db/index.js', '../src/db/migrate.js', '../src/config/index.js')
})

afterAll(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('seed-settings.js', () => {
  it('hashes ADMIN_KEY with argon2 when seeding', { timeout: 10000 }, async () => {
    const origAdminKey = process.env.ADMIN_KEY
    process.env.ADMIN_KEY = 'my-secret-admin-key'

    const dbPath = join(tmpDir, 'argon2-hash-test.db')
    const origDbPath = process.env.DB_PATH
    process.env.DB_PATH = dbPath

    clearCjs()
    const seedSettings = _require('../src/db/seed-settings.js').seedSettings
    await seedSettings()

    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(dbPath)
    const row = db.prepare("SELECT value FROM settings WHERE key = 'ADMIN_KEY'").get()
    db.close()

    expect(row.value).toMatch(/^\$argon2/)

    const argon2 = _require('argon2')
    const valid = await argon2.verify(row.value, 'my-secret-admin-key')
    expect(valid).toBe(true)

    if (origAdminKey !== undefined) process.env.ADMIN_KEY = origAdminKey
    else delete process.env.ADMIN_KEY
    if (origDbPath) process.env.DB_PATH = origDbPath
    else delete process.env.DB_PATH
  })
  it('calls migrate and seeds env vars when runMigrate is true', async () => {
    const dbPath = join(tmpDir, 'seed-settings.db')
    const origDbPath = process.env.DB_PATH
    process.env.DB_PATH = dbPath

    const seedSettings = _require('../src/db/seed-settings.js').seedSettings
    const count = await seedSettings()

    expect(count).toBeTypeOf('number')
    expect(count).toBeGreaterThan(0)

    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(dbPath)
    const row = db.prepare('SELECT COUNT(*) as c FROM settings').get()
    expect(row.c).toBe(count)
    db.close()

    const count2 = await seedSettings()
    expect(count2).toBe(0)

    if (origDbPath) process.env.DB_PATH = origDbPath
    else delete process.env.DB_PATH
  })

  it('end-to-end: admin auth works with real argon2 and real DB (no mock)', { timeout: 15000 }, async () => {
    const origAdminKey = process.env.ADMIN_KEY
    const origDbPath = process.env.DB_PATH
    const origStartServer = process.env.START_SERVER
    const secret = 'my-e2e-secret-key'
    const dbPath = join(tmpDir, 'e2e-admin-auth.db')
    process.env.ADMIN_KEY = secret
    process.env.DB_PATH = dbPath
    process.env.START_SERVER = 'false'

  clearCjs('../src/db/seed-settings.js', '../src/db/index.js', '../src/db/migrate.js', '../src/config/index.js', '../src/server/index.js')
    const { seedSettings } = _require('../src/db/seed-settings.js')
    await seedSettings()

    clearCjs('../src/db/seed-settings.js', '../src/db/index.js', '../src/db/migrate.js', '../src/config/index.js')
    vi.resetModules()
    const { requestHandler } = await import('../src/server/index.js')

    const mkReq = (url, method, headers) => ({ url, method, headers, socket: { remoteAddress: '::1' }, on: () => {} })
    const mkRes = () => ({ writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn(), writableEnded: false })

    const res = mkRes()
    const req = mkReq('/api/admin/settings', 'GET', { authorization: `Bearer ${secret}` })
    await requestHandler(req, res)

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything())
    const body = JSON.parse(res.end.mock.calls[0][0])
    expect(Array.isArray(body)).toBe(true)
    expect(body.find(r => r.key === 'ADMIN_KEY').value).toBe('***')

    const res2 = mkRes()
    const req2 = mkReq('/api/admin/settings', 'GET', { authorization: 'Bearer wrong-key' })
    await requestHandler(req2, res2)
    expect(res2.writeHead).toHaveBeenCalledWith(401, expect.anything())

    if (origAdminKey !== undefined) process.env.ADMIN_KEY = origAdminKey
    else delete process.env.ADMIN_KEY
    if (origDbPath) process.env.DB_PATH = origDbPath
    else delete process.env.DB_PATH
    if (origStartServer !== undefined) process.env.START_SERVER = origStartServer
    else delete process.env.START_SERVER
  })

  it('skips migrate when runMigrate is false', async () => {
    const origAdminKey = process.env.ADMIN_KEY
    const mockDb = {
      prepare: () => ({ run: vi.fn(), get: vi.fn().mockReturnValue({ rowCount: 0 }) }),
      exec: vi.fn(),
    }

    const seedSettings = _require('../src/db/seed-settings.js').seedSettings
    const result = await seedSettings({ database: mockDb, runMigrate: false })

    expect(result).toBeTypeOf('number')

    if (origAdminKey !== undefined) process.env.ADMIN_KEY = origAdminKey
    else delete process.env.ADMIN_KEY
  })
})

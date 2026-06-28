import { describe, it, expect, vi, afterAll } from 'vitest'
import { createRequire } from 'module'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const _require = createRequire(import.meta.url)
const tmpDir = mkdtempSync(join(tmpdir(), 'ss-cov-'))

afterAll(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('seed-settings.js', () => {
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

  it('skips migrate when runMigrate is false', async () => {
    const origAdminKey = process.env.ADMIN_KEY
    process.env.ADMIN_KEY = 'test-key'

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

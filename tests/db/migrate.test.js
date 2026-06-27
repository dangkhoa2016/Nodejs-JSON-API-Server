import { describe, it, expect, vi, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { createRequire } from 'module'
import { save, restore, configMockFactory } from '../helpers/coverage'

const tmpDir = mkdtempSync(path.join(tmpdir(), 'cov-migrate-'))
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

vi.mock('../../src/config/index.js', () => configMockFactory())

describe('migrate.js', () => {
  it('runs migration without error', () => {
    const s = save('DB_PATH')
    process.env.DB_PATH = path.join(tmpDir, 'migrate.db')
    clearCjs('../../src/db/migrate.js', '../../src/db/index.js', '../../src/config/index.js')
    const { migrate } = _require('../../src/db/migrate.js')
    expect(() => migrate()).not.toThrow()
    restore(s)
  })

  it('handles migration failure', () => {
    clearCjs('../../src/db/migrate.js', '../../src/db/index.js', '../../src/config/index.js')
    const resolvedDb = _require.resolve('../../src/db/index.js')
    const origDbCache = _require.cache[resolvedDb]
    _require.cache[resolvedDb] = {
      exports: { getWrappedDb: () => { throw new Error('boom') } },
      id: resolvedDb, filename: resolvedDb, loaded: true,
    }
    try {
      clearCjs('../../src/db/migrate.js')
      const { migrate } = _require('../../src/db/migrate.js')
      expect(() => migrate()).toThrow('boom')
    } finally {
      if (origDbCache) _require.cache[resolvedDb] = origDbCache
      else delete _require.cache[resolvedDb]
      clearCjs('../../src/db/migrate.js')
    }
  })
})

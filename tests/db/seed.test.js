import { describe, it, expect, vi, afterAll, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { EventEmitter } from 'events'
import { Buffer } from 'buffer'
import { createRequire } from 'module'
import { save, restore, configMockFactory } from '../helpers/coverage'

const tmpDir = mkdtempSync(path.join(tmpdir(), 'cov-seed-'))
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

describe('seed.js', () => {
  afterEach(() => {
    clearCjs('../../src/db/seed.js', '../../src/db/migrate.js', '../../src/database.js', '../../src/config.js')
  })

  it('imports and migrate runs, seed returns early when DB has data', async () => {
    const seedDbPath = path.join(tmpDir, 'seed.db')
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(seedDbPath)
    db.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)')
    db.prepare('INSERT INTO users (id, name) VALUES (1, ?)').run('Test')
    db.close()
    const s = save('DB_PATH')
    process.env.DB_PATH = seedDbPath
    vi.resetModules()
    const { seed } = await import('../../src/db/seed.js')
    await expect(seed()).resolves.toBeUndefined()
    restore(s)
  })

  it('covers seed fetch parse error via promise rejection', async () => {
    const db = {
      exec: vi.fn(),
      prepare: () => ({
        get: () => ({ rowCount: 0 }),
        run: vi.fn(),
      }),
    }
    const fetchFn = () => Promise.reject(new SyntaxError('Unexpected end of JSON input'))
    const { seed } = await import('../../src/db/seed.js')
    await expect(seed({ database: db, fetch: fetchFn, runMigrate: false })).rejects.toThrow()
  })

  it('covers seed fetch parse error via event stream', async () => {
    const db = {
      exec: vi.fn(),
      prepare: () => ({
        get: () => ({ rowCount: 0 }),
        run: vi.fn(),
      }),
    }
    const { seed } = await import('../../src/db/seed.js')
    const fetch = async (url) => {
      const response = new EventEmitter()
      queueMicrotask(() => {
        response.emit('data', Buffer.from('{bad'))
        response.emit('end')
      })
      return response
    }
    await expect(seed({ database: db, fetch, runMigrate: false })).rejects.toThrow()
  })

  it('covers seed https error', async () => {
    const db = {
      exec: vi.fn(),
      prepare: () => ({
        get: () => ({ rowCount: 0 }),
        run: vi.fn(),
      }),
    }
    const fetchFn = () => Promise.reject(new Error('boom'))
    const { seed } = await import('../../src/db/seed.js')
    await expect(seed({ database: db, fetch: fetchFn, runMigrate: false })).rejects.toThrow('boom')
  })

  it('covers full seed insert path', async () => {
    const runs = []
    const db = {
      exec: vi.fn(),
      prepare: () => ({
        get: () => ({ rowCount: 0 }),
        run: (...args) => runs.push(args),
      }),
    }
    const payload = {
      users: [{ id: 1, name: 'A', username: 'a', email: 'a@example.com', phone: '1', website: 'w', address: { city: 'Hanoi' }, company: { name: 'ACME' } }],
      posts: [{ id: 1, userId: 1, title: 'P', body: 'Body' }],
      comments: [{ id: 1, postId: 1, name: 'C', email: 'c@example.com', body: 'Comment' }],
      albums: [{ id: 1, userId: 1, title: 'Album' }],
      photos: [{ id: 1, albumId: 1, title: 'Photo', url: 'u', thumbnailUrl: 't' }],
      todos: [{ id: 1, userId: 1, title: 'Todo', completed: true }, { id: 2, userId: 1, title: 'Todo2', completed: false }],
    }
    const { seed } = await import('../../src/db/seed.js')
    const fetch = async (url) => {
      const name = new URL(url).pathname.slice(1)
      return payload[name]
    }
    await seed({ database: db, fetch, runMigrate: false })
    expect(runs).toHaveLength(7)
    expect(runs[0][6]).toBe('{"city":"Hanoi"}')
    expect(runs[0][7]).toBe('{"name":"ACME"}')
    expect(runs[6][3]).toBe(0)
  })
})

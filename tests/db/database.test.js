import { describe, it, expect, vi, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { createRequire } from 'module'
import { save, restore, setEnv, configMockFactory } from '../helpers/coverage'

const tmpDir = mkdtempSync(path.join(tmpdir(), 'cov-db-'))
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

describe('database.js', () => {
  it('covers getWrappedDb with DEBUG_SQL enabled', async () => {
    const s = save('DEBUG_SQL', 'DB_PATH')
    setEnv({ DEBUG_SQL: 'true', DB_PATH: path.join(tmpDir, 'db1.db') })
    vi.resetModules()
    const mod = await import('../../src/db/index.js')
    const w = mod.getWrappedDb()
    expect(w).toBeDefined()
    const w2 = mod.getWrappedDb()
    expect(w2).toBe(w)
    restore(s)
  })

  it('covers getDb when db is already initialized', async () => {
    const s = save('DB_PATH')
    process.env.DB_PATH = path.join(tmpDir, 'db2.db')
    vi.resetModules()
    const mod = await import('../../src/db/index.js')
    const first = mod.getDb()
    const second = mod.getDb()
    expect(first).toBe(second)
    restore(s)
  })

  it('covers getWrappedDb without DEBUG_SQL', async () => {
    const s = save('DEBUG_SQL', 'DB_PATH')
    setEnv({ DEBUG_SQL: 'false', DB_PATH: path.join(tmpDir, 'db3.db') })
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    vi.resetModules()
    const mod = await import('../../src/db/index.js')
    expect(mod.getWrappedDb()).toBe(mod.getDb())
    restore(s)
  })

  it('covers parseRow, buildWhere, listAll, and getOne', async () => {
    const dbPath = path.join(tmpDir, 'db-crud.db')
    const s = save('DB_PATH', 'DEBUG_SQL')
    setEnv({ DB_PATH: dbPath, DEBUG_SQL: 'true' })
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    vi.resetModules()
    const mod = await import('../../src/db/index.js')
    const db = mod.getDb()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        username TEXT,
        email TEXT,
        phone TEXT,
        website TEXT,
        address TEXT,
        company TEXT
      );
      CREATE TABLE todos (
        id INTEGER PRIMARY KEY,
        userId INTEGER,
        title TEXT,
        completed INTEGER
      );
    `)
    db.prepare(`
      INSERT INTO users (id, name, username, email, phone, website, address, company)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, 'Alice', 'alice', 'alice@example.com', '123', 'example.com', '{"street":"1"}', '{"name":"ACME"}')
    db.prepare(`
      INSERT INTO users (id, name, username, email, phone, website, address, company)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(2, 'Bob', 'bob', 'bob@example.com', '456', 'bob.example.com', 'not-json', '{bad')
    db.prepare('INSERT INTO todos (id, userId, title, completed) VALUES (?, ?, ?, ?)').run(1, 1, 'Done', 1)
    db.prepare('INSERT INTO todos (id, userId, title, completed) VALUES (?, ?, ?, ?)').run(2, 1, 'Todo', 0)

    const users = mod.listAll('users', { name: 'Alice', ignored: 'value' })
    expect(users).toHaveLength(1)
    expect(users[0].address).toEqual({ street: '1' })
    expect(users[0].company).toEqual({ name: 'ACME' })
    expect(users[0].completed).toBeUndefined()

    const done = mod.listAll('todos', { completed: 'true', ignored: 'value' })
    expect(done).toHaveLength(1)
    expect(done[0].completed).toBe(true)
    const pending = mod.listAll('todos', { completed: 'false' })
    expect(pending).toHaveLength(1)
    expect(pending[0].completed).toBe(false)
    expect(mod.getOne('users', 999)).toBeNull()
    restore(s)
  })

  it('covers insertOne, updateOne, deleteOne, and nextId', async () => {
    const dbPath = path.join(tmpDir, 'db-write.db')
    const s = save('DB_PATH', 'DEBUG_SQL')
    setEnv({ DB_PATH: dbPath, DEBUG_SQL: 'false' })
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    vi.resetModules()
    const mod = await import('../../src/db/index.js')
    const db = mod.getDb()
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        username TEXT,
        email TEXT,
        phone TEXT,
        website TEXT,
        address TEXT,
        company TEXT
      );
      CREATE TABLE todos (
        id INTEGER PRIMARY KEY,
        userId INTEGER,
        title TEXT,
        completed INTEGER
      );
    `)

    expect(mod.nextId('users')).toBe(1)
    const inserted = mod.insertOne('users', {
      id: 5,
      name: 'Carol',
      username: 'carol',
      email: 'carol@example.com',
      phone: '789',
      website: 'carol.example.com',
      address: { city: 'Hanoi' },
      company: { name: 'XYZ' },
    })
    expect(inserted.address).toEqual({ city: 'Hanoi' })
    expect(inserted.company).toEqual({ name: 'XYZ' })
    expect(mod.nextId('users')).toBe(6)

    mod.insertOne('todos', { id: 1, userId: 1, title: 'Initial', completed: true })
    expect(mod.updateOne('users', 999, { name: 'Missing' }, false)).toBeNull()
    const replaced = mod.updateOne('users', 5, {
      name: 'Carol Updated',
      address: { city: 'Danang' },
      company: null,
    }, true)
    expect(replaced.id).toBe(5)
    expect(replaced.name).toBe('Carol Updated')
    expect(replaced.company).toBeNull()
    expect(replaced.username).toBe('carol')

    const patchedTodo = mod.updateOne('todos', 1, { completed: false, title: 'Patched' }, false)
    expect(patchedTodo.completed).toBe(false)
    expect(patchedTodo.userId).toBe(1)
    expect(mod.deleteOne('todos', 999)).toBeNull()
    expect(mod.deleteOne('todos', 1).id).toBe(1)
    restore(s)
  })
})

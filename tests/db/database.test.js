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

vi.mock('../../src/config/index.js', () => configMockFactory())

describe('database.js', () => {
  it('covers getWrappedDb with DEBUG_SQL enabled', () => {
    const s = save('DEBUG_SQL', 'DB_PATH')
    setEnv({ DEBUG_SQL: 'true', DB_PATH: path.join(tmpDir, 'db1.db') })
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    const mod = _require('../../src/db/index.js')
    const w = mod.getWrappedDb()
    expect(w).toBeDefined()
    const w2 = mod.getWrappedDb()
    expect(w2).toBe(w)
    restore(s)
  })

  it('covers getDb when db is already initialized', () => {
    const s = save('DB_PATH')
    process.env.DB_PATH = path.join(tmpDir, 'db2.db')
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    const mod = _require('../../src/db/index.js')
    const first = mod.getDb()
    const second = mod.getDb()
    expect(first).toBe(second)
    restore(s)
  })

  it('covers getWrappedDb without DEBUG_SQL', () => {
    const s = save('DEBUG_SQL', 'DB_PATH')
    setEnv({ DEBUG_SQL: 'false', DB_PATH: path.join(tmpDir, 'db3.db') })
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    const mod = _require('../../src/db/index.js')
    expect(mod.getWrappedDb()).toBe(mod.getDb())
    restore(s)
  })

  it('covers parseRow, buildWhere, listAll, and getOne', () => {
    const dbPath = path.join(tmpDir, 'db-crud.db')
    const s = save('DB_PATH', 'DEBUG_SQL')
    setEnv({ DB_PATH: dbPath, DEBUG_SQL: 'true' })
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    const mod = _require('../../src/db/index.js')
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

    const startEnd = mod.listAll('users', { _start: '0', _end: '2' })
    expect(startEnd).toHaveLength(2)
    expect(startEnd[0].id).toBe(1)
    expect(startEnd[1].id).toBe(2)

    const pageLimit = mod.listAll('users', { _page: '1', _limit: '1' })
    expect(pageLimit).toHaveLength(1)
    expect(pageLimit[0].id).toBe(1)

    db.exec('CREATE TABLE extras (id INTEGER PRIMARY KEY, label TEXT)')
    db.prepare('INSERT INTO extras (id, label) VALUES (?, ?)').run(1, 'Hello')
    const unknown = mod.listAll('extras', { label: 'Hello' })
    expect(unknown).toHaveLength(1)
    expect(unknown[0].id).toBe(1)

    const searchIgnored = mod.listAll('extras', { q: 'Hello' })
    expect(searchIgnored).toHaveLength(1)

    restore(s)
  })

  it('covers insertOne, updateOne, deleteOne, and nextId', () => {
    const dbPath = path.join(tmpDir, 'db-write.db')
    const s = save('DB_PATH', 'DEBUG_SQL')
    setEnv({ DB_PATH: dbPath, DEBUG_SQL: 'false' })
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    const mod = _require('../../src/db/index.js')
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
    mod.insertOne('todos', { id: 2, userId: 1, title: 'Another', completed: false })
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

  it('covers listAll params via direct require for V8 coverage accuracy', () => {
    const dbPath = path.join(tmpDir, 'db-params.db')
    const s = save('DB_PATH', 'DEBUG_SQL')
    process.env.DB_PATH = dbPath
    process.env.DEBUG_SQL = 'false'
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    const mod = _require('../../src/db/index.js')
    const db = mod.getDb()
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, username TEXT, phone TEXT, website TEXT)')
    db.prepare('INSERT INTO users (id, name, email, username, phone, website) VALUES (?, ?, ?, ?, ?, ?)').run(1, 'Alice', 'alice@test.com', 'alice', '123', 'alice.dev')
    db.prepare('INSERT INTO users (id, name, email, username, phone, website) VALUES (?, ?, ?, ?, ?, ?)').run(2, 'Bob', 'bob@test.com', 'bob', '456', 'bob.dev')
    db.prepare('INSERT INTO users (id, name, email, username, phone, website) VALUES (?, ?, ?, ?, ?, ?)').run(3, 'Charlie', 'charlie@test.com', 'charlie', '789', 'charlie.dev')
    db.exec('CREATE TABLE todos (id INTEGER PRIMARY KEY, userId INTEGER, title TEXT, completed INTEGER)')
    db.prepare('INSERT INTO todos (id, userId, title, completed) VALUES (?, ?, ?, ?)').run(1, 1, 'Done', 1)
    db.prepare('INSERT INTO todos (id, userId, title, completed) VALUES (?, ?, ?, ?)').run(2, 1, 'Todo', 0)
    db.exec('CREATE TABLE extras (id INTEGER PRIMARY KEY, label TEXT)')
    db.prepare('INSERT INTO extras (id, label) VALUES (?, ?)').run(1, 'Hello')

    expect(mod.listAll('users', { name: 'Alice', ignored: 'value' })).toHaveLength(1)
    expect(mod.listAll('users', { _start: '0', _end: '2' })).toHaveLength(2)
    expect(mod.listAll('users', { _start: '0' })).toHaveLength(3)
    expect(mod.listAll('users', { _page: '1', _limit: '2' })).toHaveLength(2)
    expect(mod.listAll('users', { _page: '1' })).toHaveLength(3)
    expect(mod.listAll('users', { _limit: '2' })).toHaveLength(2)
    expect(mod.listAll('users', { _sort: 'name', _order: 'desc' })).toHaveLength(3)
    expect(mod.listAll('users', { _sort: 'name', _order: 'asc' })).toHaveLength(3)
    expect(mod.listAll('users', { _sort: 'name' })).toHaveLength(3)
    expect(mod.listAll('users', { _sort: 'nonexistent' })).toHaveLength(3)
    expect(mod.listAll('users', { q: 'Alice' })).toHaveLength(1)
    expect(mod.listAll('todos', { completed: 'true' })).toHaveLength(1)
    expect(mod.listAll('todos', { completed: 'false' })).toHaveLength(1)
    expect(mod.listAll('extras', { label: 'Hello' })).toHaveLength(1)
    expect(mod.listAll('extras', { q: 'Hello' })).toHaveLength(1)

    restore(s)
  })

  it('escapes LIKE wildcards to prevent SQL injection', () => {
    const dbPath = path.join(tmpDir, 'db-like.db')
    const s = save('DB_PATH', 'DEBUG_SQL')
    setEnv({ DB_PATH: dbPath, DEBUG_SQL: 'true' })
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    const mod = _require('../../src/db/index.js')
    const db = mod.getDb()
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, username TEXT, email TEXT)')
    db.prepare('INSERT INTO users (id, name, username, email) VALUES (?, ?, ?, ?)').run(1, 'task_99%_done', 'userA', 'a@b.com')
    db.prepare('INSERT INTO users (id, name, username, email) VALUES (?, ?, ?, ?)').run(2, 'normal_task', 'userB', 'c@d.com')
    db.prepare('INSERT INTO users (id, name, username, email) VALUES (?, ?, ?, ?)').run(3, 'plain', 'userC', 'e@f.com')

    const literalPercent = mod.listAll('users', { q: '99%' })
    expect(literalPercent).toHaveLength(1)
    expect(literalPercent[0].name).toBe('task_99%_done')

    const literalUs = mod.listAll('users', { q: 'task_' })
    expect(literalUs).toHaveLength(1)
    expect(literalUs[0].name).toBe('task_99%_done')

    const normalSearch = mod.listAll('users', { q: 'normal' })
    expect(normalSearch).toHaveLength(1)
    expect(normalSearch[0].name).toBe('normal_task')

    restore(s)
  })

  it('rejects invalid ORDER BY values and quotes identifiers', () => {
    const dbPath = path.join(tmpDir, 'db-sort.db')
    const s = save('DB_PATH', 'DEBUG_SQL')
    setEnv({ DB_PATH: dbPath, DEBUG_SQL: 'false' })
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    const mod = _require('../../src/db/index.js')
    const db = mod.getDb()
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)')
    db.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)').run(1, 'Charlie', 'c@t.com')
    db.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)').run(2, 'Alice', 'a@t.com')
    db.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)').run(3, 'Bob', 'b@t.com')

    const injection = mod.listAll('users', { _sort: 'name; DROP TABLE users--', _order: 'asc' })
    expect(injection).toHaveLength(3)

    const sorted = mod.listAll('users', { _sort: 'name', _order: 'asc' })
    expect(sorted[0].name).toBe('Alice')
    expect(sorted[1].name).toBe('Bob')
    expect(sorted[2].name).toBe('Charlie')

    const desc = mod.listAll('users', { _sort: 'name', _order: 'desc' })
    expect(desc[0].name).toBe('Charlie')
    expect(desc[2].name).toBe('Alice')

    restore(s)
  })

  it('covers search via q parameter', () => {
    const dbPath = path.join(tmpDir, 'db-search.db')
    const s = save('DB_PATH', 'DEBUG_SQL')
    setEnv({ DB_PATH: dbPath, DEBUG_SQL: 'true' })
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    const mod = _require('../../src/db/index.js')
    const db = mod.getDb()
    db.exec('CREATE TABLE todos (id INTEGER PRIMARY KEY, userId INTEGER, title TEXT, completed INTEGER)')
    db.prepare('INSERT INTO todos (id, userId, title, completed) VALUES (?, ?, ?, ?)').run(1, 1, 'Buy milk', 0)
    db.prepare('INSERT INTO todos (id, userId, title, completed) VALUES (?, ?, ?, ?)').run(2, 2, 'Buy eggs', 0)
    db.prepare('INSERT INTO todos (id, userId, title, completed) VALUES (?, ?, ?, ?)').run(3, 1, 'Wash car', 1)

    const results = mod.listAll('todos', { q: 'Buy', _sort: 'id', _order: 'asc' })
    expect(results).toHaveLength(2)

    const noResults = mod.listAll('todos', { q: 'Nonexistent' })
    expect(noResults).toHaveLength(0)

    restore(s)
  })

  it('buildWhere parses query params into SQL and values', () => {
    const dbPath = path.join(tmpDir, 'db-buildwhere.db')
    const s = save('DB_PATH', 'DEBUG_SQL')
    setEnv({ DB_PATH: dbPath, DEBUG_SQL: 'false' })
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    const mod = _require('../../src/db/index.js')

    const res1 = mod.buildWhere('users', { name: 'Alice', _page: '1', _limit: '10' })
    expect(res1.sql).toMatch(/WHERE name = \?/)
    expect(res1.sql).toMatch(/LIMIT 10 OFFSET 0/)
    expect(res1.values).toEqual(['Alice'])

    const res2 = mod.buildWhere('todos', { completed: 'true' })
    expect(res2.values).toEqual([1])
    expect(res2.sql).toMatch(/WHERE completed = \?/)

    const res3 = mod.buildWhere('users', { q: 'test', _sort: 'name', _order: 'desc' })
    expect(res3.sql).toContain('LIKE')
    expect(res3.sql).toContain('ORDER BY')
    expect(res3.sql).toContain('DESC')

    const res4 = mod.buildWhere('users', {})
    expect(res4.sql).toBe('SELECT * FROM users')
    expect(res4.values).toEqual([])

    const res5 = mod.buildWhere('users', { _start: '0', _end: '5' })
    expect(res5.sql).toMatch(/LIMIT 5 OFFSET 0/)

    const res6 = mod.buildWhere('nonexistent', { q: 'test' })
    expect(res6.values).toEqual([])

    restore(s)
  })

  it('covers cascade delete — deleting a user removes related todos', () => {
    const dbPath = path.join(tmpDir, 'db-cascade.db')
    const s = save('DB_PATH', 'DEBUG_SQL')
    setEnv({ DB_PATH: dbPath, DEBUG_SQL: 'false' })
    clearCjs('../../src/db/index.js', '../../src/config/index.js')
    const mod = _require('../../src/db/index.js')
    const db = mod.getDb()
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE todos (id INTEGER PRIMARY KEY, userId INTEGER, title TEXT);
      CREATE TABLE posts (id INTEGER PRIMARY KEY, userId INTEGER, title TEXT);
      CREATE TABLE albums (id INTEGER PRIMARY KEY, userId INTEGER, title TEXT);
    `)
    db.prepare('INSERT INTO users (id, name) VALUES (1, \'Alice\')').run()
    db.prepare('INSERT INTO todos (id, userId, title) VALUES (?, ?, ?)').run(1, 1, 'Todo 1')
    db.prepare('INSERT INTO todos (id, userId, title) VALUES (?, ?, ?)').run(2, 1, 'Todo 2')
    db.prepare('INSERT INTO posts (id, userId, title) VALUES (?, ?, ?)').run(1, 1, 'Post 1')

    expect(mod.listAll('todos')).toHaveLength(2)
    expect(mod.listAll('posts')).toHaveLength(1)

    const deleted = mod.deleteOne('users', 1)
    expect(deleted.id).toBe(1)
    expect(deleted.name).toBe('Alice')

    expect(mod.listAll('todos')).toHaveLength(0)
    expect(mod.listAll('posts')).toHaveLength(0)
    expect(mod.getOne('users', 1)).toBeNull()

    restore(s)
  })
})

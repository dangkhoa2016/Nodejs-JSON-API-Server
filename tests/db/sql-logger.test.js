import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('sql-logger.js', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns non-special properties on wrapped stmt', async () => {
    const { wrapStmt } = await import('../../src/db/sql-logger.js')
    const stmt = { run: () => {}, customProp: 42 }
    const wrapped = wrapStmt(stmt, 'SELECT 1')
    expect(wrapped.customProp).toBe(42)
  })

  it('returns non-special properties on wrapped db', async () => {
    const { wrapDb } = await import('../../src/db/sql-logger.js')
    const db = { exec: () => {}, prepare: () => ({}), name: 'testdb' }
    const wrapped = wrapDb(db)
    expect(wrapped.name).toBe('testdb')
  })

  it('wraps exec and logs SQL', async () => {
    const { wrapDb } = await import('../../src/db/sql-logger.js')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rawExec = vi.fn()
    const db = { exec: rawExec, prepare: () => ({}) }
    const wrapped = wrapDb(db)
    wrapped.exec('SELECT 1')
    expect(spy).toHaveBeenCalledWith('[SQL]', 'SELECT 1')
    expect(rawExec).toHaveBeenCalledWith('SELECT 1')
    spy.mockRestore()
  })

  it('wraps prepare and returns wrapped stmt', async () => {
    const { wrapDb } = await import('../../src/db/sql-logger.js')
    const rawRun = vi.fn()
    const db = { exec: () => {}, prepare: () => ({ run: rawRun }) }
    const wrapped = wrapDb(db)
    const stmt = wrapped.prepare('INSERT INTO t VALUES (?)')
    expect(typeof stmt.run).toBe('function')
  })

  it('wrapped stmt logs SQL on run/get/all', async () => {
    const { wrapStmt } = await import('../../src/db/sql-logger.js')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rawRun = vi.fn()
    const stmt = { run: rawRun }
    const wrapped = wrapStmt(stmt, 'INSERT 1')
    wrapped.run('a', 'b')
    expect(spy).toHaveBeenCalledWith('[SQL]', 'INSERT 1', '["a","b"]')
    wrapped.run()
    expect(spy).toHaveBeenCalledWith('[SQL]', 'INSERT 1', '')
    spy.mockRestore()
  })
})

import { describe, it, expect, vi, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { createRequire } from 'module'
import net from 'net'

const tmpDir = mkdtempSync(path.join(tmpdir(), 'cov-redis-'))
const _require = createRequire(import.meta.url)

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve))
}

describe('redis.js', () => {
  it('encodes RESP commands', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    expect(c._encode('PING')).toBe('*1\r\n$4\r\nPING\r\n')
    expect(c._encode('SET', 'k', 'v')).toBe('*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$1\r\nv\r\n')
  })

  it('parses all RESP types', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    const p = (b) => c._parse(Buffer.from(b))

    expect(p('+OK\r\n').value).toEqual(Buffer.from('OK'))
    const e = p('-ERR x\r\n')
    expect(e.isError).toBe(true); expect(e.value.message).toBe('ERR x')
    expect(p(':42\r\n').value).toBe(42)
    expect(p('$-1\r\n').value).toBeNull()
    expect(p('$5\r\nhello\r\n').value).toEqual(Buffer.from('hello'))
    const a = p('*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n')
    expect(a.value.length).toBe(2)
    expect(a.value[0]).toEqual(Buffer.from('foo'))
    expect(a.value[1]).toEqual(Buffer.from('bar'))
    expect(p('*-1\r\n').value).toBeNull()
    expect(c._parse(Buffer.alloc(0))).toBeNull()
    expect(c._parse(Buffer.from('$5\r\nhel'))).toBeNull()
  })

  it('throws on unknown RESP type', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    expect(() => c._parse(Buffer.from('!x\r\n'))).toThrow('Unknown RESP type')
  })

  it('connect returns early when already connected or connecting', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    c.connected = true
    await expect(c.connect()).resolves.toBeUndefined()
    c.connected = false; c._connecting = true
    await expect(c.connect()).resolves.toBeUndefined()
  })

  it('parses URL in constructor', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ url: 'redis://:secret@myhost:6380/3' })
    expect(c.host).toBe('myhost')
    expect(c.port).toBe(6380)
    expect(c.password).toBe('secret')
    expect(c.db).toBe(3)
  })

  it('send and _onData process responses', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    c.socket = { write: vi.fn() }
    const p = c.send('PING')
    expect(c.queue.length).toBe(1)
    c._onData(Buffer.from('+PONG\r\n'))
    await expect(p).resolves.toEqual(Buffer.from('PONG'))
  })

  it('rejects on error response', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    c.socket = { write: vi.fn() }
    const p = c.send('PING')
    c._onData(Buffer.from('-ERR bad\r\n'))
    await expect(p).rejects.toThrow('ERR bad')
  })

  it('handles partial data across multiple _onData calls', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    c.socket = { write: vi.fn() }
    const p = c.send('GET', 'key')
    c._onData(Buffer.from('$'))
    c._onData(Buffer.from('3\r\nval\r\n'))
    await expect(p).resolves.toEqual(Buffer.from('val'))
  })

  it('quit resolves immediately when socket is null', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    await expect(c.quit()).resolves.toBeUndefined()
  })

  it('quit sends QUIT and destroys socket', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    const write = vi.fn()
    const destroy = vi.fn()
    c.socket = { write, destroy }
    await expect(c.quit()).resolves.toBeUndefined()
    expect(write).toHaveBeenCalledWith(expect.stringContaining('QUIT'))
    expect(destroy).toHaveBeenCalled()
  })

  it('connect handler with auth and select via TCP', async () => {
    const server = net.createServer(s => {
      s.on('data', d => {
        if (d.includes('AUTH')) s.write(Buffer.from('+OK\r\n'))
        else if (d.includes('SELECT')) s.write(Buffer.from('+OK\r\n'))
      })
    })
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    const { port } = server.address()
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port, password: 's', db: 1 })
    await expect(c.connect()).resolves.toBeUndefined()
    expect(c.connected).toBe(true)
    server.close()
  })

  it('connect handler without auth/select via TCP', async () => {
    const server = net.createServer(s => {
      s.on('data', () => s.write(Buffer.from('+OK\r\n')))
    })
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    const { port } = server.address()
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port })
    await expect(c.connect()).resolves.toBeUndefined()
    expect(c.connected).toBe(true)
    server.close()
  })

  it('uses default constructor options', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient()
    expect(c.host).toBe('127.0.0.1')
    expect(c.port).toBe(6379)
    expect(c.db).toBe(0)
    expect(c.password).toBeUndefined()
  })

  it('parses URL without port and without password', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ url: 'redis://myhost/3' })
    expect(c.host).toBe('myhost')
    expect(c.port).toBe(6379)
    expect(c.password).toBeUndefined()
    expect(c.db).toBe(3)
  })

  it('handles _parse offset and array null branches', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    expect(c._parse(Buffer.from('x'), 1)).toBeNull()
    expect(c._parse(Buffer.from('*-1\r\n')).value).toBeNull()
  })

  it('parses URL with empty hostname, using default host', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ url: 'redis:///3' })
    expect(c.host).toBe('127.0.0.1')
    expect(c.db).toBe(3)
  })

  it('parses URL with non-numeric path, keeping default db', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ url: 'redis://host/db' })
    expect(c.host).toBe('host')
    expect(c.db).toBe(0)
  })

  it('handles incomplete array data in _parse', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    expect(c._parse(Buffer.from('*2\r\n$3\r\nfoo'))).toBeNull()
  })

  it('covers _onData when no response is complete', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    c.socket = { write: vi.fn() }
    c.send('PING')
    c._onData(Buffer.from('+'))
    expect(c.queue.length).toBe(1)
  })

  it('handles write error in send()', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    c.socket = { write: vi.fn(() => { throw new Error('write error') }) }
    await expect(c.send('PING')).rejects.toThrow('write error')
    expect(c.queue.length).toBe(0)
  })

  it('covers redis helper methods', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    c.socket = { write: vi.fn() }
    c.ping()
    c.auth('s')
    c.get('k')
    c.set('k', 'v', 'EX', 1)
    c.setex('k', 1, 'v')
    c.incr('k')
    c.expire('k', 1)
    c.del('a', 'b')
    c.ttl('k')
    c.eval('return 1', 0)
    expect(c.socket.write).toHaveBeenCalledTimes(10)
  })

  it('connect handler with auth failure via TCP', async () => {
    const server = net.createServer(s => {
      s.on('data', d => {
        if (d.includes('AUTH')) s.write(Buffer.from('-ERR invalid password\r\n'))
      })
    })
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    const { port } = server.address()
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port, password: 's' })
    await expect(c.connect()).rejects.toThrow('ERR invalid password')
    expect(c.connected).toBe(false)
    server.close()
  })

  it('connect error handler rejects queued commands via TCP', async () => {
    const server = net.createServer(() => {})
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    const { port } = server.address()
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port })
    c.connect().catch(() => {})
    await new Promise(r => setTimeout(r, 20))
    c.socket.destroy(new Error('ECONNRESET'))
    const p = c.send('PING')
    await expect(p).rejects.toThrow()
    server.close()
  })
})

describe('redis.js connect handlers', () => {
  it('covers connect error handler rejecting queued commands', async () => {
    const server = net.createServer((socket) => {
      socket.on('data', () => socket.destroy(new Error('ECONNRESET')))
      socket.on('error', () => {})
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port })
    await c.connect()
    const p = c.send('PING')
    c.socket.destroy(new Error('ECONNRESET'))
    await expect(p).rejects.toThrow()
    expect(c.connected).toBe(false)
    expect(c._connecting).toBe(false)
    c.socket.destroy(new Error('ECONNRESET'))
    await closeServer(server)
  })

  it('covers connect handler with auth and select', async () => {
    const server = net.createServer((socket) => {
      socket.on('data', (data) => {
        if (data.includes('AUTH')) socket.write(Buffer.from('+OK\r\n'))
        if (data.includes('SELECT')) socket.write(Buffer.from('+OK\r\n'))
      })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port, password: 's', db: 1 })
    await expect(c.connect()).resolves.toBeUndefined()
    expect(c.connected).toBe(true)
    c.socket.destroy(new Error('ECONNRESET'))
    await closeServer(server)
  })

  it('covers connect handler without auth/select', async () => {
    const server = net.createServer(() => {})
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port })
    await expect(c.connect()).resolves.toBeUndefined()
    expect(c.connected).toBe(true)
    c.socket.destroy(new Error('ECONNRESET'))
    await closeServer(server)
  })

  it('covers connect handler with auth failure', async () => {
    const server = net.createServer((socket) => {
      socket.on('data', () => socket.write(Buffer.from('-ERR invalid password\r\n')))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port, password: 's' })
    await expect(c.connect()).rejects.toThrow('ERR invalid password')
    expect(c.connected).toBe(false)
    c.socket.destroy(new Error('ECONNRESET'))
    await closeServer(server)
  })

  it('reconnect updates host and port and reconnects', async () => {
    let connections = 0
    const server = net.createServer((socket) => {
      connections++
      socket.on('data', () => socket.write(Buffer.from('+OK\r\n')))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port })

    await c.connect()
    expect(c.connected).toBe(true)
    expect(connections).toBe(1)

    await c.reconnect({ host: '127.0.0.1', port })
    expect(c.connected).toBe(true)
    expect(connections).toBe(2)
    expect(c.host).toBe('127.0.0.1')
    expect(c.port).toBe(port)
    c.socket.destroy()
    await closeServer(server)
  })

  it('reconnect with url re-parses all fields', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: 'oldhost', port: 6379 })
    c.socket = { write: vi.fn(), destroy: vi.fn() }
    c.queue.push({ reject: vi.fn() })

    const connectSpy = vi.spyOn(c, 'connect').mockResolvedValue()
    await c.reconnect({ url: 'redis://:newpass@newhost:6380/3' })
    expect(c.host).toBe('newhost')
    expect(c.port).toBe(6380)
    expect(c.password).toBe('newpass')
    expect(c.db).toBe(3)
    expect(c.connected).toBe(false)
    expect(c.queue.length).toBe(0)
    expect(connectSpy).toHaveBeenCalled()
    connectSpy.mockRestore()
  })

  it('reconnect rejects pending queue items', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    c.socket = { write: vi.fn(), destroy: vi.fn() }
    const rejectFn = vi.fn()
    c.queue.push({ resolve: vi.fn(), reject: rejectFn })
    c.queue.push({ resolve: vi.fn(), reject: vi.fn() })

    const connectSpy = vi.spyOn(c, 'connect').mockResolvedValue()
    await c.reconnect({ host: '127.0.0.1', port: 6379 })
    expect(rejectFn).toHaveBeenCalledWith(expect.objectContaining({ message: 'Reconnecting' }))
    expect(c.queue.length).toBe(0)
    connectSpy.mockRestore()
  })

  it('reconnect with minimal URL covers default fallbacks', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: 'oldhost', port: 9999, password: 'oldpw', db: 99 })
    c.socket = { write: vi.fn(), destroy: vi.fn() }
    const connectSpy = vi.spyOn(c, 'connect').mockResolvedValue()
    await c.reconnect({ url: 'redis:///0' })
    expect(c.host).toBe('127.0.0.1')
    expect(c.port).toBe(6379)
    expect(c.password).toBeUndefined()
    expect(c.db).toBe(0)
    connectSpy.mockRestore()
  })

  it('reconnect with all individual options sets all fields', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379 })
    c.socket = { write: vi.fn(), destroy: vi.fn() }
    const connectSpy = vi.spyOn(c, 'connect').mockResolvedValue()
    await c.reconnect({ host: 'newhost', port: 6380, db: 3, password: 'secret' })
    expect(c.host).toBe('newhost')
    expect(c.port).toBe(6380)
    expect(c.db).toBe(3)
    expect(c.password).toBe('secret')
    connectSpy.mockRestore()
  })

  it('reconnect with empty options preserves existing values', async () => {
    const RedisClient = _require('../../src/redis/index.js')
    const c = new RedisClient({ host: '127.0.0.1', port: 6379, db: 1, password: 'pw' })
    c.socket = { write: vi.fn(), destroy: vi.fn() }
    const connectSpy = vi.spyOn(c, 'connect').mockResolvedValue()
    await c.reconnect({})
    expect(c.host).toBe('127.0.0.1')
    expect(c.port).toBe(6379)
    expect(c.db).toBe(1)
    expect(c.password).toBe('pw')
    connectSpy.mockRestore()
  })
})

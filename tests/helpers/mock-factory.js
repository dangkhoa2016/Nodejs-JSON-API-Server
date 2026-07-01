import { vi } from 'vitest'

export function mkDb(overrides = {}) {
  const mock = {
    getDb: () => ({ prepare: () => ({ all: () => [], get: () => null, run: () => {} }), exec: () => {} }),
    getWrappedDb: () => ({ prepare: () => ({ all: () => [], get: () => null, run: () => {} }), exec: () => {} }),
    listAll: () => [],
    getOne: () => null,
    insertOne: () => null,
    updateOne: () => null,
    deleteOne: () => null,
    nextId: () => 1,
    TABLES: ['users', 'posts', 'comments', 'albums', 'photos', 'todos'],
  }
  return { ...mock, ...overrides }
}

export function mkRedis(overrides = {}) {
  const mockClient = {
    connect: vi.fn().mockResolvedValue(),
    ping: vi.fn().mockResolvedValue(),
    connected: false,
    quit: vi.fn().mockResolvedValue(),
    send: vi.fn().mockResolvedValue(),
    ...overrides,
  }
  const mockRedisClass = function () { return mockClient }
  return { mockClient, mockRedisClass }
}

export function mkReq(url = '/', method = 'GET', headers = {}, body) {
  return {
    url,
    method,
    headers: { ...headers },
    socket: { remoteAddress: '::1' },
    destroy() {},
    on(evt, cb) {
      if (evt === 'data' && body !== undefined) cb(body)
      if (evt === 'end') queueMicrotask(() => cb())
    },
  }
}

export function mkRes() {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn(), writableEnded: false }
}

export function mkSettingsTable(entries) {
  if (entries) return entries
  return [
    { key: 'ADMIN_KEY', value: '$argon2id$v=19$m=65536,t=3,p=4$mockedhash', description: 'Admin key', updated_at: '2025-01-01' },
    { key: 'NODE_ENV', value: 'development', description: 'Environment', updated_at: '2025-01-01' },
    { key: 'REDIS_PASSWORD', value: 'mockpassword', description: 'Redis password', updated_at: '2025-01-01' },
  ]
}

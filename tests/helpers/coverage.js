import { vi } from 'vitest'
import { createRequire } from 'module'

export function createClearCjs(importMetaUrl) {
  const _require = createRequire(importMetaUrl)
  return (...keys) => {
    for (const key of keys) {
      const resolved = _require.resolve(key)
      if (_require.cache[resolved]) delete _require.cache[resolved]
    }
  }
}

export function save(...keys) {
  const saved = {}
  for (const k of keys) saved[k] = process.env[k]
  return saved
}

export function restore(saved) {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

export function setEnv(overrides) {
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v
}

export function configMockFactory() {
  const METHODS = ['port', 'dbPath', 'dbDebugSql', 'redisOpts', 'rateLimitEnabled', 'rateLimitMax', 'rateLimitWindowMs', 'rateLimitWindowSec', 'adminKey', 'maxBodySize', 'defaultPageSize', 'sensitiveKeys']
  const cfg = {
    getPort: () => parseInt(process.env.PORT || '3000', 10),
    getDbPath: () => process.env.DB_PATH || process.cwd() + '/storage/data.db',
    getDbDebugSql: () => (process.env.DEBUG_SQL || 'false') === 'true',
    getRedisOpts: () => {
      const url = process.env.REDIS_URL
      return url ? { url } : {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        db: parseInt(process.env.REDIS_DB || '0', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      }
    },
    getRateLimitEnabled: () => (process.env.RATE_LIMIT_ENABLED || 'true') !== 'false',
    getRateLimitMax: () => parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    getRateLimitWindowMs: () => parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    getRateLimitWindowSec: () => Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10) / 1000),
    getAdminKey: () => process.env.ADMIN_KEY || '',
    getMaxBodySize: () => {
      const raw = parseInt(process.env.MAX_BODY_SIZE || '1048576', 10)
      return isNaN(raw) || raw < 1 ? 1048576 : raw
    },
    getDefaultPageSize: () => parseInt(process.env.DEFAULT_PAGE_SIZE || '10', 10),
    getSensitiveKeys: () => ['REDIS_PASSWORD', 'ADMIN_KEY'],
  }
  const getMethod = (prop) => cfg['get' + prop[0].toUpperCase() + prop.slice(1)]
  return new Proxy(cfg, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive || prop === 'then') return
      const fn = getMethod(prop)
      return fn ? fn() : undefined
    },
    has(target, prop) {
      return METHODS.includes(prop) || cfg['get' + prop[0].toUpperCase() + prop.slice(1)] !== undefined
    },
    ownKeys() { return METHODS },
    getOwnPropertyDescriptor(target, prop) {
      if (METHODS.includes(prop)) return { enumerable: true, configurable: true }
    },
  })
}

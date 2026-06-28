'use strict';

const SETTING_DEFS = [
  { key: 'NODE_ENV', description: 'Application environment (development, test, production)' },
  { key: 'PORT', description: 'HTTP server port number' },
  { key: 'DB_PATH', description: 'SQLite database file path' },
  { key: 'DEBUG_SQL', description: 'Enable SQL query logging to stderr' },
  { key: 'REDIS_HOST', description: 'Redis server hostname' },
  { key: 'REDIS_PORT', description: 'Redis server port' },
  { key: 'REDIS_DB', description: 'Redis database index' },
  { key: 'REDIS_URL', description: 'Full Redis connection URL (overrides host/port/db/password)' },
  { key: 'REDIS_PASSWORD', description: 'Redis server password' },
  { key: 'RATE_LIMIT_ENABLED', description: 'Enable rate limiting middleware' },
  { key: 'RATE_LIMIT_MAX', description: 'Maximum requests per rate-limit window' },
  { key: 'RATE_LIMIT_WINDOW_MS', description: 'Rate-limit window duration in milliseconds' },
  { key: 'DEFAULT_PAGE_SIZE', description: 'Default number of items per page in paginated responses' },
  { key: 'ADMIN_KEY', description: 'Admin authentication key (argon2-hashed on PATCH)' },
];

module.exports = { SETTING_DEFS };

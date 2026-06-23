'use strict';

const path = require('path');

require('./load-env');

const PORT = parseInt(process.env.PORT || '3000', 10);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'storage', 'data.db');

const REDIS_URL = process.env.REDIS_URL || null;
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

const redisOpts = REDIS_URL
  ? { url: REDIS_URL }
  : { host: REDIS_HOST, port: REDIS_PORT, db: REDIS_DB, password: REDIS_PASSWORD };

const DEBUG_SQL_STR = process.env.DEBUG_SQL || 'false';
const DEBUG_SQL = DEBUG_SQL_STR === 'true';

const RATE_LIMIT_ENABLED_STR = process.env.RATE_LIMIT_ENABLED || 'true';
const RATE_LIMIT_ENABLED = RATE_LIMIT_ENABLED_STR !== 'false';
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_WINDOW_SEC = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

const DEFAULT_MAX_BODY_SIZE = 1048576;
const parsedMaxBodySize = parseInt(process.env.MAX_BODY_SIZE || String(DEFAULT_MAX_BODY_SIZE), 10);
const MAX_BODY_SIZE = isNaN(parsedMaxBodySize) || parsedMaxBodySize < 1 ? DEFAULT_MAX_BODY_SIZE : parsedMaxBodySize;

module.exports = {
  port: PORT,
  dbPath: DB_PATH,
  dbDebugSql: DEBUG_SQL,
  redisOpts,
  rateLimitEnabled: RATE_LIMIT_ENABLED,
  rateLimitMax: RATE_LIMIT_MAX,
  rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
  rateLimitWindowSec: RATE_LIMIT_WINDOW_SEC,
  maxBodySize: MAX_BODY_SIZE,
};

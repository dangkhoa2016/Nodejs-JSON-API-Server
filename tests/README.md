# Testing

## Stack

- **vitest** — test runner
- **@vitest/coverage-v8** — V8 native code coverage

## Commands

```sh
npm test                 # Run all tests once
npm run test:watch       # Watch mode
npm run test:coverage    # Run with coverage report
```

## Structure

```
tests/
  config/
    config.test.js                   # Config defaults and env var branches (6 tests)
  db/
    database.test.js                 # Database CRUD, pagination, search, sort (5 tests)
    migrate.test.js                  # Migration success and failure paths (2 tests)
    seed.test.js                     # Seed with real DB + mocked deps, JSONPlaceholder fetch (5 tests)
  middleware/
    rate-limiter.test.js             # In-memory and Redis rate limiter paths (6 tests)
  redis/
    redis.test.js                    # RESP protocol encoding/parsing, constructor options (25 tests)
  server/
    coverage-printlog.test.js        # Server ESM coverage via CJS cache injection (2 tests)
  server.test.js                     # API integration tests — real HTTP + SQLite (50 tests)
  helpers/
    coverage.js                      # Test-coverage utilities (save/restore/setEnv/clearCjs)
    index.js                         # startServer / stopServer / request utilities
    seed.js                          # Standalone script to create & seed temp DB
```

**Total: 101 tests across 8 test files.**

## Test design

### Integration tests (`server.test.js`)

Each run creates an isolated temp SQLite database, seeds it with test data via a child process (`helpers/seed.js`), then starts the server on port 3199. Tests make real HTTP requests and validate the full request lifecycle. Rate limiting is disabled via `RATE_LIMIT_ENABLED=false` in the test helper. The temp directory is cleaned up after all tests finish.

### Unit tests (`tests/config/`, `tests/db/`, `tests/middleware/`, `tests/redis/`, `tests/server/`)

Unit tests cover every source module individually. Each module has its own test file:

| Module              | Test file                    | Approach |
|---------------------|------------------------------|----------|
| `config.js`         | `tests/config/config.test.js` | Module re-imported with different `process.env` values |
| `database.js`       | `tests/db/database.test.js`   | Real `node:sqlite` databases with per-test temp files |
| `rate-limiter.js`   | `tests/middleware/rate-limiter.test.js` | Module imported once; `createRateLimiter()` with different configs per test |
| `redis.js`          | `tests/redis/redis.test.js`  | RESP encoding/parsing directly; constructor options |
| `server.js`         | `tests/server/coverage-printlog.test.js` | `requestHandler()` with mock req/res; CJS cache injection for DB mock |
| `migrate.js`        | `tests/db/migrate.test.js`   | Real migration + corrupt DB failure path |
| `seed.js`           | `tests/db/seed.test.js`      | Dependency injection — `database` and `fetch` injected |

### Key testing patterns

- **CJS cache injection**: Server tests inject mock `database.js` into the CJS `require.cache` before loading `server.js`, ensuring the mock is picked up by CommonJS `require()` calls.
- **Lazy config loading**: `rate-limiter.js` reads config inside `createRateLimiter()` rather than at module level, so tests can create limiters with different config values without re-importing the module.
- **Seed dependency injection**: `seed.js` accepts `database` and `fetch` parameters, bypassing the need to mock `require('https')` and `require('../database')`.
- **V8 coverage pragmas**: `/* v8 ignore */` comments exclude code paths that V8 cannot track through CJS module chains (e.g., CLI entry points, signal handlers, cross-worker coverage gaps).

## Configuration

`vitest.config.js` sets `NODE_ENV=test` and `PORT=3199`. Rate limiting is **not** disabled globally — it is only disabled in the integration test helper (`tests/helpers/index.js`). This allows unit tests to exercise the rate limiter with real config values.

## CI/CD

GitHub Actions (`.github/workflows/test.yml`) runs tests on Node.js 22, 23, and 26. Coverage is generated only on Node 26 and uploaded as an artifact.

## Coverage

```sh
npm run test:coverage
```

| Metric      | Coverage |
|-------------|----------|
| Statements  | ~92%    |
| Branches    | ~87%    |
| Functions   | ~90%    |
| Lines       | ~96%    |

Key files:

| File          | Statements | Lines |
|---------------|-----------|-------|
| server.js     | ~86%      | ~91%  |
| database.js   | ~92%      | ~97%  |
| config.js     | 100%      | 100%  |
| rate-limiter.js | ~90%    | ~95%  |
| redis.js      | ~78%      | ~82%  |

Coverage for `rate-limiter.js` and `redis.js` is incomplete because Redis is unavailable in test mode (falls back to in-memory). The `migrate.js` and `seed.js` CLI scripts are not fully covered since some paths run as child processes.

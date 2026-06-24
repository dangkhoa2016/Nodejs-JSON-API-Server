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
  server.test.js         # API integration tests (49 tests)
  helpers/
    index.js             # startServer / stopServer / request utilities
    seed.js              # Standalone script to create & seed temp DB
```

**Total: 49 tests across 1 test file.**

## Test design

Each test run creates an isolated temp SQLite database, runs the schema + seed data, then starts the server on port 3199. The temp directory is cleaned up after all tests finish. Rate limiting is disabled during tests.

## CI/CD

GitHub Actions (`.github/workflows/test.yml`) runs tests on Node.js 22, 23, and 26. Coverage is generated only on Node 26 and uploaded as an artifact.

## Coverage

```sh
npm run test:coverage
```

Key files covered:

| File        | Statements | Lines |
|-------------|-----------|-------|
| server.js   | ~86%      | ~91%  |
| database.js | ~92%      | ~97%  |
| config.js   | 100%      | 100%  |

Coverage is low for `rate-limiter.js` and `redis.js` because rate limiting is disabled and Redis is unavailable in test mode. The `migrate.js` and `seed.js` CLI scripts are excluded as they run as child processes.

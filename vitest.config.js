import { defineConfig } from 'vitest/config'

process.env.NODE_ENV = 'test';
process.env.PORT = '3199';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js', 'tests/**/*.spec.js'],
    exclude: ['tests/helpers/**'],
    globals: true,
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.js'],
    },
  },
})

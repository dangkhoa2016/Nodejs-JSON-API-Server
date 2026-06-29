import { defineConfig } from 'vitest/config'

process.env.NODE_ENV = 'test';
process.env.PORT = '3199';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.js'],
    },
  },
})

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { createRequire } from 'module'
import { save, restore, setEnv } from '../helpers/coverage'

const tmpDir = mkdtempSync(path.join(tmpdir(), 'loadenv-'))
const _require = createRequire(import.meta.url)
function clearCjs(...keys) {
  for (const key of keys) {
    const resolved = _require.resolve(key)
    if (_require.cache[resolved]) delete _require.cache[resolved]
  }
}

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('load-env.js', () => {
  it('loads multiple env files in chain', async () => {
    const s = save('NODE_ENV', 'MY_VAR', 'OTHER_VAR')
    setEnv({ NODE_ENV: 'development' })
    delete process.env.MY_VAR
    delete process.env.OTHER_VAR
    clearCjs('../../src/config/load-env.js', 'dotenv')
    vi.resetModules()

    const dotenv = _require('dotenv')
    const configSpy = vi.spyOn(dotenv, 'config').mockReturnValue({ parsed: {} })

    try {
      const { loadEnv } = await import('../../src/config/load-env.js')
      loadEnv()

      expect(configSpy).toHaveBeenCalledTimes(3)
      const calls = configSpy.mock.calls.map(c => c[0].path)
      expect(calls[0]).toContain('.env')
      expect(calls[1]).toContain('.env.dev')
      expect(calls[2]).toContain('.env.development')
    } finally {
      configSpy.mockRestore()
    }
    restore(s)
  })

  it('applies override: false so process.env wins', async () => {
    const s = save('NODE_ENV')
    setEnv({ NODE_ENV: 'development' })
    clearCjs('../../src/config/load-env.js', 'dotenv')
    vi.resetModules()

    const dotenv = _require('dotenv')
    const configSpy = vi.spyOn(dotenv, 'config').mockReturnValue({ parsed: {} })

    try {
      const { loadEnv } = await import('../../src/config/load-env.js')
      loadEnv()

      expect(configSpy).toHaveBeenCalled()
      for (const call of configSpy.mock.calls) {
        expect(call[0]).toHaveProperty('override', false)
      }
    } finally {
      configSpy.mockRestore()
    }
    restore(s)
  })

  it('skips loading in production', async () => {
    const s = save('NODE_ENV')
    setEnv({ NODE_ENV: 'production' })
    clearCjs('../../src/config/load-env.js', 'dotenv')
    vi.resetModules()

    const dotenv = _require('dotenv')
    const configSpy = vi.spyOn(dotenv, 'config')

    try {
      const { loadEnv } = await import('../../src/config/load-env.js')
      loadEnv()
      expect(configSpy).not.toHaveBeenCalled()
    } finally {
      configSpy.mockRestore()
    }
    restore(s)
  })

  it('skips missing env files without error', async () => {
    const s = save('NODE_ENV')
    setEnv({ NODE_ENV: 'development' })
    clearCjs('../../src/config/load-env.js', 'dotenv')
    vi.resetModules()

    const dotenv = _require('dotenv')
    const configSpy = vi.spyOn(dotenv, 'config').mockImplementation((opts) => {
      if (opts.path.includes('.env.dev')) return { error: { code: 'ENOENT' } }
      return { parsed: {} }
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const { loadEnv } = await import('../../src/config/load-env.js')
      loadEnv()
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      configSpy.mockRestore()
      errorSpy.mockRestore()
    }
    restore(s)
  })

  it('logs other dotenv errors', async () => {
    const s = save('NODE_ENV')
    setEnv({ NODE_ENV: 'development' })
    clearCjs('../../src/config/load-env.js', 'dotenv')
    vi.resetModules()

    const dotenv = _require('dotenv')
    const configSpy = vi.spyOn(dotenv, 'config').mockImplementation((opts) => {
      if (opts.path.endsWith('.env')) return { error: new Error('bad syntax') }
      return { parsed: {} }
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const { loadEnv } = await import('../../src/config/load-env.js')
      loadEnv()
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[dotenv]'), expect.stringContaining('bad syntax'))
    } finally {
      configSpy.mockRestore()
      errorSpy.mockRestore()
    }
    restore(s)
  })

  it('falls back to development when NODE_ENV is unset', async () => {
    const s = save('NODE_ENV')
    delete process.env.NODE_ENV
    clearCjs('../../src/config/load-env.js', 'dotenv')
    vi.resetModules()

    const dotenv = _require('dotenv')
    const configSpy = vi.spyOn(dotenv, 'config').mockReturnValue({ parsed: {} })

    try {
      const { loadEnv } = await import('../../src/config/load-env.js')
      loadEnv()

      expect(configSpy).toHaveBeenCalledTimes(3)
      const calls = configSpy.mock.calls.map(c => c[0].path)
      expect(calls[0]).toContain('.env')
      expect(calls[1]).toContain('.env.dev')
      expect(calls[2]).toContain('.env.development')
    } finally {
      configSpy.mockRestore()
    }
    restore(s)
  })

  it('falls back to development env map for unknown NODE_ENV values', async () => {
    const s = save('NODE_ENV')
    setEnv({ NODE_ENV: 'staging' })
    clearCjs('../../src/config/load-env.js', 'dotenv')
    vi.resetModules()

    const dotenv = _require('dotenv')
    const configSpy = vi.spyOn(dotenv, 'config').mockReturnValue({ parsed: {} })

    try {
      const { loadEnv } = await import('../../src/config/load-env.js')
      loadEnv()

      expect(configSpy).toHaveBeenCalledTimes(3)
      const calls = configSpy.mock.calls.map(c => c[0].path)
      expect(calls[0]).toContain('.env')
      expect(calls[1]).toContain('.env.dev')
      expect(calls[2]).toContain('.env.development')
    } finally {
      configSpy.mockRestore()
    }
    restore(s)
  })
})

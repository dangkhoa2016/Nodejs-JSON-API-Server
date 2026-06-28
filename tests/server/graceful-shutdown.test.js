import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '../..')
const PORT = '30993'

function seedDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tests/helpers/seed.js'], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d })
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(stderr || `Seed exited with code ${code}`)),
    )
    child.on('error', reject)
  })
}

describe('Graceful shutdown', () => {
  let tmpDir, dbPath

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'graceful-shutdown-'))
    dbPath = join(tmpDir, 'test.db')
    await seedDatabase(dbPath)
  }, 15000)

  afterAll(() => {
    if (tmpDir) {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  it('exits cleanly on SIGINT', async () => {
    const binPath = join(PROJECT_ROOT, 'bin/start.js')

    const child = spawn(process.execPath, [binPath], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        START_SERVER: 'true',
        PORT,
        REDIS_URL: '',
        DB_PATH: dbPath,
        RATE_LIMIT_ENABLED: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    })

    let output = ''
    child.stdout.on('data', (d) => { output += d.toString() })

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 10000)
      const check = () => {
        if (output.includes(`http://localhost:${PORT}`)) {
          clearTimeout(timeout)
          resolve()
        }
      }
      child.stdout.on('data', check)
      child.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    child.kill('SIGINT')

    const code = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 5000)
      child.on('exit', (code) => {
        clearTimeout(timeout)
        resolve(code)
      })
    })

    expect(code).toBe(0)
  }, 20000)
})

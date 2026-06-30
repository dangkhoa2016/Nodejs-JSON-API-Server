import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const PORT = 3199;

let serverInstance = null;
let tmpDir = null;

export function getBaseUrl() {
  return `http://127.0.0.1:${PORT}`;
}

export async function startServer() {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'json-api-test-'));
  const dbPath = path.join(tmpDir, 'test.db');

  process.env.DB_PATH = dbPath;
  process.env.START_SERVER = 'false';
  process.env.REDIS_URL = '';
  process.env.RATE_LIMIT_ENABLED = 'false';

  // Clear CJS caches so config is re-evaluated with current env vars
  const { createRequire } = await import('module');
  const _require = createRequire(import.meta.url);
  for (const key of ['../../src/server/index.js', '../../src/config/index.js', '../../src/config/load-env.js', '../../src/db/index.js', '../../src/middleware/rate-limiter.js']) {
    const resolved = _require.resolve(key);
    if (_require.cache[resolved]) delete _require.cache[resolved];
  }

  const serverModule = await import('../../src/server/index.js');
  serverInstance = serverModule.server;

  await new Promise((resolve, reject) => {
    const child = spawn('node', ['tests/helpers/seed.js'], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('exit', (code) => {
      code === 0 ? resolve() : reject(new Error(stderr || `Seed exited with code ${code}`));
    });
    child.on('error', reject);
  });

  return new Promise((resolve) => {
    serverInstance.listen(PORT, resolve);
  });
}

export function stopServer() {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
  if (tmpDir) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

export function request(pathname, options = {}) {
  const { method = 'GET', body = null, rawBody = null, headers = {} } = options;
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path: pathname,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (rawBody != null) req.write(rawBody);
    else if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

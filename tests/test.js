const http = require('http');

const PORT = process.env.PORT || 3000;

require('../bin/start');

function request(path, method = 'GET', body = null) {
  return new Promise((res, rej) => {
    const opts = { host: '127.0.0.1', port: PORT, path, method, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: JSON.parse(d) }));
    });
    req.on('error', rej);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:' + PORT + '/health', resolve);
        req.on('error', reject);
        req.end();
      });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error('Server did not start within 6s');
}

beforeAll(async () => {
  await waitForServer();
});

it('GET /api/users returns list of users', async () => {
  const r = await request('/api/users');
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body)).toBe(true);
});

it('GET /api/users/1 returns a user', async () => {
  const r = await request('/api/users/1');
  expect(r.status).toBe(200);
  expect(r.body.name).toBeTruthy();
});

it('GET /api/users/1/posts returns posts', async () => {
  const r = await request('/api/users/1/posts');
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body)).toBe(true);
});

it('GET /api/posts/1/comments returns comments', async () => {
  const r = await request('/api/posts/1/comments');
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body)).toBe(true);
});

it('GET /api/todos filters by query params', async () => {
  const r = await request('/api/todos?userId=1&completed=false');
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body)).toBe(true);
});

it('POST /api/posts creates a new post', async () => {
  const r = await request('/api/posts', 'POST', { userId: 1, title: 'Test post', body: 'Hello world' });
  expect(r.status).toBe(201);
  expect(r.body.id).toBeTruthy();
});

it('PATCH /api/posts/:id updates a post', async () => {
  const r = await request('/api/posts', 'POST', { userId: 1, title: 'Test post', body: 'Hello world' });
  const newId = r.body.id;
  const r2 = await request('/api/posts/' + newId, 'PATCH', { title: 'Updated title' });
  expect(r2.status).toBe(200);
  expect(r2.body.title).toBe('Updated title');
});

it('DELETE /api/posts/:id deletes a post', async () => {
  const r = await request('/api/posts', 'POST', { userId: 1, title: 'Test post', body: 'Hello world' });
  const newId = r.body.id;
  const r2 = await request('/api/posts/' + newId, 'DELETE');
  expect(r2.status).toBe(200);
});

it('returns rate limit headers when enabled', async () => {
  const r = await request('/api/users');
  expect(r.status).toBe(200);
});

it('GET /api/users/9999 returns 404', async () => {
  const r = await request('/api/users/9999');
  expect(r.status).toBe(404);
});

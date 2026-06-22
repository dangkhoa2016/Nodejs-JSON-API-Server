const http = require('http');

const PORT = process.env.PORT || 3000;

// Start server in-process
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

async function test() {
  await waitForServer();
  let r;

  r = await request('/api/users');
  console.log('GET /api/users:', r.status, 'count:', r.body.length);

  r = await request('/api/users/1');
  console.log('GET /api/users/1:', r.status, 'name:', r.body.name);

  r = await request('/api/users/1/posts');
  console.log('GET /api/users/1/posts:', r.status, 'count:', r.body.length);

  r = await request('/api/posts/1/comments');
  console.log('GET /api/posts/1/comments:', r.status, 'count:', r.body.length);

  r = await request('/api/todos?userId=1&completed=false');
  console.log('GET /api/todos?userId=1&completed=false:', r.status, 'count:', r.body.length);

  r = await request('/api/posts', 'POST', { userId: 1, title: 'Test post', body: 'Hello world' });
  console.log('POST /api/posts:', r.status, 'id:', r.body.id, 'title:', r.body.title);
  const newId = r.body.id;

  r = await request('/api/posts/' + newId, 'PATCH', { title: 'Updated title' });
  console.log('PATCH /api/posts/' + newId + ':', r.status, 'title:', r.body.title);

  r = await request('/api/posts/' + newId, 'DELETE');
  console.log('DELETE /api/posts/' + newId + ':', r.status);

  // Rate limit headers
  r = await request('/api/users');
  console.log('Rate limit headers:', {
    limit: r.headers['x-ratelimit-limit'],
    remaining: r.headers['x-ratelimit-remaining'],
    store: r.headers['x-ratelimit-store'],
  });

  // 404 test
  r = await request('/api/users/9999');
  console.log('GET /api/users/9999:', r.status, r.body.error);
}

test().catch(err => { console.error(err); process.exit(1); });

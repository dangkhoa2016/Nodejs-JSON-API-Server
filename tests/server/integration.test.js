import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { startServer, stopServer, request } from '../helpers';

beforeAll(async () => {
  await startServer();
}, 20000);

afterAll(() => {
  stopServer();
});

describe('Health & Root', () => {
  it('GET /health returns 200 with server status', async () => {
    const res = await request('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.tables).toEqual(
      expect.arrayContaining(['users', 'posts', 'comments', 'albums', 'photos', 'todos']),
    );
    expect(res.body.rateLimit).toBeDefined();
    expect(res.body.rateLimit.enabled).toBe(false);
  });

  it('GET /api/health works as alias', async () => {
    const res = await request('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET / returns API info', async () => {
    const res = await request('/');
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('json-api-server');
    expect(res.body.version).toBe('1.0.0');
    expect(res.body.endpoints).toBeInstanceOf(Array);
  });

  it('GET /api works as alias', async () => {
    const res = await request('/api');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('1.0.0');
  });
});

describe('CORS', () => {
  it('OPTIONS returns 204 with CORS headers', async () => {
    const res = await request('/api/users', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('List resources', () => {
  it('GET /api/users returns all users', async () => {
    const res = await request('/api/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0]).toHaveProperty('name');
  });

  it('GET /api/posts returns all posts', async () => {
    const res = await request('/api/posts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);
  });

  it('GET /api/comments returns all comments', async () => {
    const res = await request('/api/comments');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });

  it('GET /api/albums returns all albums', async () => {
    const res = await request('/api/albums');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });

  it('GET /api/photos returns all photos', async () => {
    const res = await request('/api/photos');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('GET /api/todos returns all todos', async () => {
    const res = await request('/api/todos');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });
});

describe('Get single resource', () => {
  it('GET /api/users/1 returns the user', async () => {
    const res = await request('/api/users/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.name).toBe('Alice Johnson');
    expect(res.body.username).toBe('alice');
    expect(res.body.email).toBe('alice@example.com');
    expect(typeof res.body.address).toBe('object');
    expect(typeof res.body.company).toBe('object');
  });

  it('GET /api/users/2 returns another user', async () => {
    const res = await request('/api/users/2');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Bob Smith');
  });

  it('GET /api/posts/1 returns fields correctly', async () => {
    const res = await request('/api/posts/1');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(1);
    expect(res.body.title).toBe('First Post');
  });

  it('GET /api/todos/1 returns completed as boolean', async () => {
    const res = await request('/api/todos/1');
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(false);
  });

  it('GET /api/todos/2 returns completed as boolean (true)', async () => {
    const res = await request('/api/todos/2');
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });
});

describe('404 handling', () => {
  it('GET /api/users/9999 returns 404', async () => {
    const res = await request('/api/users/9999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('GET /api/unknown returns 404', async () => {
    const res = await request('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Unknown route');
  });
});

describe('400 handling', () => {
  it('GET /api/users/abc returns 400 for invalid ID format', async () => {
    const res = await request('/api/users/abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid ID format');
  });
});

describe('Filtering', () => {
  it('GET /api/todos?userId=1 filters by userId', async () => {
    const res = await request('/api/todos?userId=1');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    res.body.forEach((t) => expect(t.userId).toBe(1));
  });

  it('GET /api/todos?userId=1&completed=false supports multiple filters', async () => {
    const res = await request('/api/todos?userId=1&completed=false');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe('Buy groceries');
    expect(res.body[0].completed).toBe(false);
  });

  it('GET /api/todos?completed=true returns only completed', async () => {
    const res = await request('/api/todos?completed=true');
    expect(res.status).toBe(200);
    expect(res.body.every((t) => t.completed === true)).toBe(true);
  });

  it('GET /api/posts?userId=2 filters by user', async () => {
    const res = await request('/api/posts?userId=2');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe('Bobs Post');
  });
});

describe('Nested routes', () => {
  it('GET /api/users/1/posts returns user posts', async () => {
    const res = await request('/api/users/1/posts');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    res.body.forEach((p) => expect(p.userId).toBe(1));
  });

  it('GET /api/users/2/posts returns other user posts', async () => {
    const res = await request('/api/users/2/posts');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('GET /api/posts/1/comments returns post comments', async () => {
    const res = await request('/api/posts/1/comments');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    res.body.forEach((c) => expect(c.postId).toBe(1));
  });

  it('GET /api/posts/2/comments returns other post comments', async () => {
    const res = await request('/api/posts/2/comments');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('GET /api/users/1/albums returns user albums', async () => {
    const res = await request('/api/users/1/albums');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    res.body.forEach((a) => expect(a.userId).toBe(1));
  });

  it('GET /api/users/1/todos returns user todos', async () => {
    const res = await request('/api/users/1/todos');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('GET /api/albums/1/photos returns album photos', async () => {
    const res = await request('/api/albums/1/photos');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    res.body.forEach((p) => expect(p.albumId).toBe(1));
  });

  it('GET /api/users/9999/posts returns 404 when parent not found', async () => {
    const res = await request('/api/users/9999/posts');
    expect(res.status).toBe(404);
  });

  it('GET /api/users/1/unknown returns 404 for unknown nested route', async () => {
    const res = await request('/api/users/1/unknown');
    expect(res.status).toBe(404);
  });
});

describe('POST — Create', () => {
  let createdId;

  it('POST /api/posts creates a new post', async () => {
    const res = await request('/api/posts', {
      method: 'POST',
      body: { userId: 1, title: 'New Post', body: 'Created via test' },
    });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('New Post');
    expect(res.body.userId).toBe(1);
    expect(res.body.id).toBeGreaterThan(0);
    createdId = res.body.id;
  });

  it('Created post is retrievable via GET', async () => {
    const res = await request('/api/posts/' + createdId);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New Post');
  });

  it('POST with explicit id creates with that id', async () => {
    const res = await request('/api/posts', {
      method: 'POST',
      body: { id: 100, userId: 2, title: 'Custom ID', body: 'Body' },
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(100);
  });

  it('POST with invalid JSON body returns 400', async () => {
    const res = await request('/api/posts', {
      method: 'POST',
      rawBody: 'not-json',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON body');
  });
});

describe('PATCH — Partial update', () => {
  it('PATCH /api/posts/1 updates title only', async () => {
    const res = await request('/api/posts/1', {
      method: 'PATCH',
      body: { title: 'Patched Title' },
    });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Patched Title');
    expect(res.body.body).toBe('This is the body of the first post');
  });

  it('PATCH without id returns 400', async () => {
    const res = await request('/api/posts', { method: 'PATCH', body: {} });
    expect(res.status).toBe(400);
  });

  it('PATCH non-existent returns 404', async () => {
    const res = await request('/api/posts/9999', { method: 'PATCH', body: {} });
    expect(res.status).toBe(404);
  });
});

describe('PUT — Full replacement', () => {
  it('PUT /api/posts/2 replaces the resource', async () => {
    const res = await request('/api/posts/2', {
      method: 'PUT',
      body: { userId: 2, title: 'Replaced', body: 'Completely new content' },
    });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Replaced');
    expect(res.body.body).toBe('Completely new content');
    expect(res.body.userId).toBe(2);
  });

  it('PUT without id returns 400', async () => {
    const res = await request('/api/posts', { method: 'PUT', body: {} });
    expect(res.status).toBe(400);
  });

  it('PUT non-existent returns 404', async () => {
    const res = await request('/api/posts/9999', { method: 'PUT', body: {} });
    expect(res.status).toBe(404);
  });
});

describe('DELETE', () => {
  let deleteId;

  it('DELETE /api/posts/3 deletes the resource', async () => {
    const res = await request('/api/posts/3', { method: 'DELETE' });
    expect(res.status).toBe(200);
  });

  it('Deleted resource returns 404', async () => {
    const res = await request('/api/posts/3');
    expect(res.status).toBe(404);
  });

  it('DELETE without id returns 400', async () => {
    const res = await request('/api/posts', { method: 'DELETE' });
    expect(res.status).toBe(400);
  });

  it('DELETE non-existent returns 404', async () => {
    const res = await request('/api/posts/9999', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('Method not allowed', () => {
  it('TRACE returns 405', async () => {
    const res = await request('/api/users', { method: 'TRACE' });
    expect(res.status).toBe(405);
    expect(res.body.error).toContain('TRACE');
  });
});

describe('Response headers', () => {
  it('Includes CORS headers on GET', async () => {
    const res = await request('/api/users');
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['x-powered-by']).toContain('json-api-server');
  });

  it('Rate limiting is disabled — no rate limit headers', async () => {
    const res = await request('/api/users');
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });
});

describe('CORS headers on error responses', () => {
  it('404 response includes CORS headers', async () => {
    const res = await request('/api/users/9999');
    expect(res.status).toBe(404);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('Pagination', () => {
  it('GET /api/posts?_page=1&_limit=2 returns first page', async () => {
    const res = await request('/api/posts?_page=1&_limit=2');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].id).toBe(1);
    expect(res.body[1].id).toBe(2);
  });

  it('GET /api/posts?_page=2&_limit=2 returns second page', async () => {
    const res = await request('/api/posts?_page=2&_limit=2');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].id).toBe(4);
    expect(res.body[1].id).toBe(100);
  });

  it('GET /api/posts?_start=1&_end=3 returns sliced results', async () => {
    const res = await request('/api/posts?_start=1&_end=3');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].id).toBe(2);
    expect(res.body[1].id).toBe(4);
  });

  it('GET /api/todos?_start=1 returns all from offset', async () => {
    const res = await request('/api/todos?_start=1');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('GET /api/posts?_limit=1 limits results', async () => {
    const res = await request('/api/posts?_limit=1');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('GET /api/posts?_page=0 returns 400', async () => {
    const res = await request('/api/posts?_page=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid _page: must be a positive integer');
  });

  it('GET /api/posts?_page=-1 returns 400', async () => {
    const res = await request('/api/posts?_page=-1');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid _page: must be a non-negative integer');
  });

  it('GET /api/posts?_limit=0 returns 400', async () => {
    const res = await request('/api/posts?_limit=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid _limit: must be a positive integer');
  });

  it('GET /api/posts?_page=&_limit=1 handles empty string by deleting param', async () => {
    const res = await request('/api/posts?_page=&_limit=1');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});

describe('Search', () => {
  it('GET /api/posts?q=first searches body content', async () => {
    const res = await request('/api/posts?q=first');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe('Patched Title');
  });

  it('GET /api/todos?q=groceries finds matching todos', async () => {
    const res = await request('/api/todos?q=groceries');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe('Buy groceries');
  });

  it('GET /api/posts?q=Post&userId=1 combines search and filter', async () => {
    const res = await request('/api/posts?q=Post&userId=1');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    res.body.forEach((p) => {
      expect(p.userId).toBe(1);
    });
  });

  it('GET /api/posts?q=nonexistent returns empty array', async () => {
    const res = await request('/api/posts?q=nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });
});

describe('Sorting', () => {
  it('GET /api/posts?_sort=title&_order=asc sorts ascending', async () => {
    const res = await request('/api/posts?_sort=title&_order=asc');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4);
    expect(res.body[0].title).toBe('Custom ID');
    expect(res.body[1].title).toBe('New Post');
    expect(res.body[2].title).toBe('Patched Title');
    expect(res.body[3].title).toBe('Replaced');
  });

  it('GET /api/posts?_sort=title&_order=desc sorts descending', async () => {
    const res = await request('/api/posts?_sort=title&_order=desc');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4);
    expect(res.body[0].title).toBe('Replaced');
    expect(res.body[1].title).toBe('Patched Title');
    expect(res.body[2].title).toBe('New Post');
    expect(res.body[3].title).toBe('Custom ID');
  });

  it('GET /api/posts?_sort=title defaults to asc', async () => {
    const res = await request('/api/posts?_sort=title');
    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe('Custom ID');
    expect(res.body[1].title).toBe('New Post');
  });

  it('GET /api/posts?_sort=id&_order=desc&_limit=2 combines sort with pagination', async () => {
    const res = await request('/api/posts?_sort=id&_order=desc&_limit=2');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].id).toBe(100);
    expect(res.body[1].id).toBe(4);
  });
});

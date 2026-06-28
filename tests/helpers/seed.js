'use strict';

const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH;
if (!dbPath) {
  console.error('DB_PATH env var required');
  process.exit(1);
}

const { migrate } = require('../../src/db/migrate');
migrate();

const db = new DatabaseSync(dbPath);

(async () => {
  const { seedSettings } = require('../../src/db/seed-settings');
  await seedSettings({ database: db, runMigrate: false });
})().then(() => db.close()).catch(() => {});

const addr1 = JSON.stringify({ street: '123 Main St', city: 'New York', zipcode: '10001', geo: { lat: '40.7128', lng: '-74.0060' } });
const comp1 = JSON.stringify({ name: 'Tech Corp', catchPhrase: 'Innovate the future' });
db.prepare('INSERT INTO users (id,name,username,email,phone,website,address,company) VALUES (1,?,?,?,?,?,?,?)')
  .run('Alice Johnson','alice','alice@example.com','555-0100','alice.dev', addr1, comp1);

const addr2 = JSON.stringify({ street: '456 Oak Ave', city: 'Los Angeles', zipcode: '90001', geo: { lat: '34.0522', lng: '-118.2437' } });
const comp2 = JSON.stringify({ name: 'Biz Inc', catchPhrase: 'Synergy works' });
db.prepare('INSERT INTO users (id,name,username,email,phone,website,address,company) VALUES (2,?,?,?,?,?,?,?)')
  .run('Bob Smith','bob','bob@example.com','555-0200','bob.biz', addr2, comp2);

db.prepare('INSERT INTO posts (id,userId,title,body) VALUES (1,1,?,?)').run('First Post','This is the body of the first post');
db.prepare('INSERT INTO posts (id,userId,title,body) VALUES (2,1,?,?)').run('Second Post','Body of second post');
db.prepare('INSERT INTO posts (id,userId,title,body) VALUES (3,2,?,?)').run('Bobs Post','Content from Bob');

db.prepare('INSERT INTO comments (id,postId,name,email,body) VALUES (1,1,?,?,?)').run('Commenter One','c1@test.com','Great post!');
db.prepare('INSERT INTO comments (id,postId,name,email,body) VALUES (2,1,?,?,?)').run('Commenter Two','c2@test.com','Nice work');
db.prepare('INSERT INTO comments (id,postId,name,email,body) VALUES (3,2,?,?,?)').run('Commenter Three','c3@test.com','Interesting');

db.prepare('INSERT INTO albums (id,userId,title) VALUES (1,1,?)').run("Alice's Photos");
db.prepare('INSERT INTO albums (id,userId,title) VALUES (2,1,?)').run('Vacation');
db.prepare('INSERT INTO albums (id,userId,title) VALUES (3,2,?)').run("Bob's Album");

db.prepare('INSERT INTO photos (id,albumId,title,url,thumbnailUrl) VALUES (1,1,?,?,?)')
  .run('Photo One','https://example.com/1.jpg','https://example.com/thumb1.jpg');
db.prepare('INSERT INTO photos (id,albumId,title,url,thumbnailUrl) VALUES (2,1,?,?,?)')
  .run('Photo Two','https://example.com/2.jpg','https://example.com/thumb2.jpg');

db.prepare('INSERT INTO todos (id,userId,title,completed) VALUES (1,1,?,?)').run('Buy groceries', 0);
db.prepare('INSERT INTO todos (id,userId,title,completed) VALUES (2,1,?,?)').run('Write tests', 1);
db.prepare('INSERT INTO todos (id,userId,title,completed) VALUES (3,2,?,?)').run('Learn vitest', 0);

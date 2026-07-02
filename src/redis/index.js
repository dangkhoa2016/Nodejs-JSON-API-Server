'use strict';

const net = require('net');

class RedisClient {
  constructor({ url, host = '127.0.0.1', port = 6379, db = 0, password } = {}) {
    if (url) {
      const parsed = new URL(url);
      host = parsed.hostname || host;
      port = parsed.port ? parseInt(parsed.port, 10) : port;
      if (parsed.password) password = parsed.password;
      const dbMatch = parsed.pathname.match(/^\/(\d+)$/);
      if (dbMatch) db = parseInt(dbMatch[1], 10);
    }
    this.host = host;
    this.port = port;
    this.db = db;
    this.password = password;
    this.socket = null;
    this.connected = false;
    this.queue = [];
    this.buffer = '';
    this._connecting = false;
  }

  _encode(...args) {
    let cmd = `*${args.length}\r\n`;
    for (const arg of args) {
      const s = String(arg);
      cmd += `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
    }
    return cmd;
  }

  _parse(buf, offset = 0) {
    if (offset >= buf.length) return null;
    const type = buf[offset];

    const lineEnd = buf.indexOf('\r\n', offset);
    if (lineEnd === -1) return null;
    const line = buf.slice(offset + 1, lineEnd);

    switch (type) {
      case 43: {
        return { value: line, consumed: lineEnd + 2 };
      }
      case 45: {
        const err = new Error(line);
        return { value: err, consumed: lineEnd + 2, isError: true };
      }
      case 58: {
        return { value: parseInt(line, 10), consumed: lineEnd + 2 };
      }
      case 36: {
        const len = parseInt(line, 10);
        if (len === -1) return { value: null, consumed: lineEnd + 2 };
        const dataStart = lineEnd + 2;
        const dataEnd = dataStart + len;
        if (buf.length < dataEnd + 2) return null;
        return { value: buf.slice(dataStart, dataEnd), consumed: dataEnd + 2 };
      }
      case 42: {
        const count = parseInt(line, 10);
        if (count === -1) return { value: null, consumed: lineEnd + 2 };
        const arr = [];
        let pos = lineEnd + 2;
        for (let i = 0; i < count; i++) {
          const item = this._parse(buf, pos);
          if (!item) return null;
          arr.push(item.value);
          pos = item.consumed;
        }
        return { value: arr, consumed: pos };
      }
      default:
        throw new Error(`Unknown RESP type: ${String.fromCharCode(type)}`);
    }
  }

  _onData(data) {
    this._rawBuf = this._rawBuf
      ? Buffer.concat([this._rawBuf, data])
      : Buffer.from(data);

    let offset = 0;
    while (this.queue.length > 0) {
      const result = this._parse(this._rawBuf, offset);
      if (!result) break;
      offset = result.consumed;
      const { resolve, reject } = this.queue.shift();
      if (result.isError) {
        reject(result.value);
      } else {
        resolve(result.value);
      }
    }
    if (offset > 0) {
      this._rawBuf = this._rawBuf.slice(offset);
    }
  }

  connect() {
    if (this.connected || this._connecting) return Promise.resolve();
    this._connecting = true;

    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host: this.host, port: this.port });
      this._rawBuf = null;

      this.socket.on('data', (d) => this._onData(d));
      this.socket.on('error', (err) => {
        this.connected = false;
        this._connecting = false;
        reject(err);
        while (this.queue.length) {
          this.queue.shift().reject(err);
        }
      });
      this.socket.on('close', () => {
        this.connected = false;
        this._connecting = false;
      });
      this.socket.on('connect', async () => {
        this.connected = true;
        this._connecting = false;
        try {
          if (this.password) {
            await this.send('AUTH', this.password);
          }
          if (this.db !== 0) {
            await this.send('SELECT', this.db);
          }
          resolve();
        } catch (err) {
          this.connected = false;
          reject(err);
        }
      });
    });
  }

  send(...args) {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      try {
        this.socket.write(this._encode(...args));
      } catch (err) {
        this.queue.shift();
        reject(err);
      }
    });
  }

  ping() { return this.send('PING'); }
  auth(password) { return this.send('AUTH', password); }
  get(key) { return this.send('GET', key); }
  set(key, value, ...opts) { return this.send('SET', key, value, ...opts); }
  setex(key, seconds, value) { return this.send('SETEX', key, seconds, value); }
  incr(key) { return this.send('INCR', key); }
  expire(key, seconds) { return this.send('EXPIRE', key, seconds); }
  del(...keys) { return this.send('DEL', ...keys); }
  ttl(key) { return this.send('TTL', key); }
  eval(script, numKeys, ...args) { return this.send('EVAL', script, numKeys, ...args); }

  quit() {
    if (!this.socket) return Promise.resolve();
    try {
      this.socket.write(this._encode('QUIT'));
    } catch { /* ignore */ }
    this.socket.destroy();
    return Promise.resolve();
  }

  reconnect(options) {
    this.quit();
    for (const item of this.queue) {
      item.reject(new Error('Reconnecting'));
    }
    this.connected = false;
    this._connecting = false;
    this.queue = [];
    this.buffer = '';
    this._rawBuf = null;
    this.socket = null;
    if (options.url) {
      const parsed = new URL(options.url);
      this.host = parsed.hostname || '127.0.0.1';
      this.port = parsed.port ? parseInt(parsed.port, 10) : 6379;
      this.password = parsed.password || undefined;
      const dbMatch = parsed.pathname.match(/^\/(\d+)$/);
      this.db = dbMatch ? parseInt(dbMatch[1], 10) : 0;
    } else {
      if (options.host !== undefined) this.host = options.host;
      if (options.port !== undefined) this.port = options.port;
      if (options.db !== undefined) this.db = options.db;
      if (options.password !== undefined) this.password = options.password;
    }
    return this.connect();
  }
}

module.exports = RedisClient;

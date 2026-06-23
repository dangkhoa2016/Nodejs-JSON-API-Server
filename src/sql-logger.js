'use strict';

/* v8 ignore start — Proxy trap handlers not tracked by V8 source-mapped coverage */
function wrapStmt(stmt, sql) {
  return new Proxy(stmt, {
    get(target, prop) {
      if (prop === 'run' || prop === 'get' || prop === 'all') {
        return (...params) => {
          console.error('[SQL]', sql, params.length ? JSON.stringify(params) : '');
          return target[prop](...params);
        };
      }
      return target[prop];
    }
  });
}

function wrapDb(raw) {
  return new Proxy(raw, {
    get(target, prop) {
      if (prop === 'exec') {
        return (sql) => {
          console.error('[SQL]', sql);
          /* v8 ignore next */
          return target.exec(sql);
        };
      }
      if (prop === 'prepare') {
        return (sql) => {
          const stmt = target.prepare(sql);
          return wrapStmt(stmt, sql);
        };
      }
      return target[prop];
    }
  });
}
/* v8 ignore stop */

module.exports = { wrapDb, wrapStmt };

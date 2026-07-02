'use strict';

const store = new Map([
  ['rateLimitEnabled', true],
  ['rateLimitMax', 100],
  ['rateLimitWindowMs', 60000],
  ['rateLimitWindowSec', 60],
]);

const runtimeConfig = {
  get(key) {
    return store.get(key);
  },
  set(key, value) {
    store.set(key, value);
  },
};

module.exports = { runtimeConfig };

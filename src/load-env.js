'use strict';

const path = require('path');

function loadEnv() {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();

  if (env === 'production') return;

  const envFileMap = {
    development: ['.env', '.env.dev', '.env.development'],
    'production-local': ['.env.prod', '.env.production'],
    test: ['.env.test'],
  };

  const envFiles = envFileMap[env] || envFileMap.development;
  const rootDir = path.join(__dirname, '..');

  for (const file of envFiles) {
    const fullPath = path.join(rootDir, file);
    const { error } = require('dotenv').config({ path: fullPath, override: false });
    if (error) {
      if (error.code === 'ENOENT') continue;
      console.error(`[dotenv] Error loading ${file}:`, error.message);
    }
  }
}

module.exports = { loadEnv };

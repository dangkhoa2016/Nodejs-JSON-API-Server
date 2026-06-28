'use strict';

const { getWrappedDb } = require('./index');
const { migrate } = require('./migrate');
const { SETTING_DEFS } = require('../config/setting-defs');

async function seedSettings({ database = getWrappedDb(), runMigrate = true } = {}) {
  if (runMigrate) migrate();
  const db = database;

  const row = db.prepare('SELECT COUNT(*) as rowCount FROM settings').get();
  if (row.rowCount > 0) {
    console.log('[Settings] Already seeded, skipping.');
    return 0;
  }

  const now = new Date().toISOString();
  const upsert = db.prepare(
    `INSERT INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );

  let count = 0;
  for (const def of SETTING_DEFS) {
    const val = process.env[def.key];
    if (val !== undefined) {
      upsert.run(def.key, val, def.description, now);
      count++;
    } else {
      upsert.run(def.key, '', def.description, now);
      count++;
    }
  }

  return logResult(count);
}

function logResult(count) {
  console.log(`[Seed] Seeded ${count} settings from environment.`);
  return count;
}

/* v8 ignore next 8 */
if (require.main === module) {
  const { loadEnv } = require('../config/load-env');
  loadEnv();
  seedSettings({ runMigrate: false }).then(() => process.exit(0)).catch((error) => {
    console.error('[Seed] Settings seeding failed:', error.message);
    process.exit(1);
  });
}

module.exports = { seedSettings, SETTING_DEFS };

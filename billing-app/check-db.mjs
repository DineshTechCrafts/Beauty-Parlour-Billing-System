import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'data', 'billing.db');
console.log('DB path:', dbPath);

const db = new Database(dbPath);

console.log('\n=== tables ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
for (const t of tables) {
  const count = db.prepare(`SELECT COUNT(*) as n FROM ${t.name}`).get();
  console.log(`  ${t.name}: ${count.n} rows`);
}

console.log('\n=== counters ===');
try {
  db.prepare('SELECT * FROM counters').all().forEach(r => console.log(`  ${r.key} = ${r.value}`));
} catch(e) { console.log('  (no counters table)'); }

console.log('\n=== customers ===');
try {
  db.prepare('SELECT * FROM customers').all().forEach(r => console.log(' ', JSON.stringify(r)));
} catch(e) { console.log('  (no customers table)'); }

console.log('\n=== receipt_items (last 5) ===');
try {
  db.prepare('SELECT * FROM receipt_items ORDER BY rowid DESC LIMIT 5').all().forEach(r => console.log(' ', JSON.stringify(r)));
} catch(e) { console.log('  (no receipt_items table)'); }

db.close();

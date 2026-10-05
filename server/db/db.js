import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// node:sqlite ships with Node 22.5+ (no flag needed from 22.13). Fail with a
// readable message on older versions instead of a cryptic module error.
let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  console.error(`This app needs Node.js 22.13 or newer (it uses the built-in node:sqlite module). You are running ${process.version}.`);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));

// DB_PATH=':memory:' is used by the tests so they never touch real data.
const dbPath = process.env.DB_PATH || join(here, 'jobtracker.db');

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));

export const STATUSES = ['wishlist', 'applied', 'interview', 'offer', 'rejected'];

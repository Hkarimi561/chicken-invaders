// Applies db/schema.sql to the database in DATABASE_URL. Safe to run repeatedly.
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Put your Supabase connection string in .env.local (see .env.example).');
  process.exit(1);
}
const local = /localhost|127\.0\.0\.1/.test(url);
const pool = new Pool({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
const sql = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
try {
  await pool.query(sql);
  console.log('Database schema is up to date.');
} catch (e) {
  console.error('Migration failed:', (e as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

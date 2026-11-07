import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.resolve(__dirname, '../../../../database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dbDir, 'clubroom.sqlite');
console.log(`[Database] Connecting to SQLite storage at: ${dbPath}`);

export const db = new DatabaseSync(dbPath);

// Run migrations / schema initialization
const schemaPath = path.join(__dirname, 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schemaSql);
  console.log('[Database] Schema verified and initialized successfully');
}

export function queryOne<T = any>(sql: string, params: (string | number | boolean | null)[] = []): T | null {
  const stmt = db.prepare(sql);
  const result = stmt.get(...params);
  return (result as T) || null;
}

export function queryAll<T = any>(sql: string, params: (string | number | boolean | null)[] = []): T[] {
  const stmt = db.prepare(sql);
  const results = stmt.all(...params);
  return (results as T[]) || [];
}

export function execute(sql: string, params: (string | number | boolean | null)[] = []) {
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}


import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = process.env.PLANFAST_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "planfast.db");

declare global {
  var __planfastDb: DatabaseSync | undefined;
  var __planfastMigration: number | undefined;
}
/** Bump when migrate() gains a step — the dev server keeps the DB handle across hot reloads, so a cached handle must re-run new migrations. */
const MIGRATION_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  thumbnail TEXT, starred INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
  prd TEXT NOT NULL, settings TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, parent_id TEXT,
  "order" INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'writing', data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_project ON items(project_id);
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, parent_id TEXT, "order" INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', linked_spec_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS flows (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, request TEXT NOT NULL DEFAULT '',
  nodes TEXT NOT NULL DEFAULT '[]', edges TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wireframes (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, flow_id TEXT, name TEXT NOT NULL, device TEXT NOT NULL,
  request TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wireframe_pages (
  id TEXT PRIMARY KEY, wireframe_id TEXT NOT NULL, "order" INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL,
  source_node_id TEXT, html TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
  mentions TEXT NOT NULL DEFAULT '[]', attachments TEXT NOT NULL DEFAULT '[]', proposals TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, perspectives TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_items (
  id TEXT PRIMARY KEY, review_id TEXT NOT NULL, project_id TEXT NOT NULL, perspective TEXT NOT NULL,
  severity TEXT NOT NULL, target TEXT NOT NULL, target_label TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
  held_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, project_id TEXT, text TEXT NOT NULL, rationale TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'undecided', applied INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, auto INTEGER NOT NULL DEFAULT 0,
  snapshot TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project_id, created_at);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, target TEXT NOT NULL, x REAL, y REAL, body TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, expires_at TEXT, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
`;

export function getDb(): DatabaseSync {
  if (globalThis.__planfastDb) {
    if (globalThis.__planfastMigration !== MIGRATION_VERSION) { migrate(globalThis.__planfastDb); globalThis.__planfastMigration = MIGRATION_VERSION; }
    return globalThis.__planfastDb;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  migrate(db);
  globalThis.__planfastMigration = MIGRATION_VERSION;
  globalThis.__planfastDb = db;
  return db;
}

/** Additive column migrations (tables are created with IF NOT EXISTS, so new columns need ALTER TABLE). */
function migrate(db: DatabaseSync) {
  const ensureColumn = (table: string, column: string, ddl: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  };
  ensureColumn("messages", "status", "TEXT NOT NULL DEFAULT 'done'");
  ensureColumn("items", "ai_proposed", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("flows", "frames", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("pages", "meta", "TEXT NOT NULL DEFAULT '{}'");
}

// ---- helpers ---------------------------------------------------------------
export type Row = Record<string, unknown>;

export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...(params as never[])) as T[];
}
export function get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...(params as never[])) as T | undefined;
}
export function run(sql: string, ...params: unknown[]) {
  return getDb().prepare(sql).run(...(params as never[]));
}
export function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function j<T>(s: unknown, fallback: T): T {
  if (typeof s !== "string") return fallback;
  try {
    const parsed = JSON.parse(s) as T;
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}
export const bool = (v: unknown) => v === 1 || v === true;

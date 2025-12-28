import path from "path";
import Database from "better-sqlite3";

export function initDb(rootDir) {
  const dbPath = path.join(rootDir, "data", "soul.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = DELETE");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    create table if not exists utterances (
      id integer primary key autoincrement,
      store_id text not null,
      store_name text not null,
      type text not null,
      text text not null,
      conversation_id text,
      ts_ms integer not null
    );
  `);
  return db;
}

export function insertUtterance(db, row) {
  const stmt = db.prepare(`
    insert into utterances
      (store_id, store_name, type, text, conversation_id, ts_ms)
    values
      (@store_id, @store_name, @type, @text, @conversation_id, @ts_ms)
  `);
  stmt.run(row);
}

export function listRecent(db, limit = 20) {
  const stmt = db.prepare(`
    select id, store_name, type, text, conversation_id, ts_ms
    from utterances
    order by id desc
    limit ?
  `);
  return stmt.all(limit);
}

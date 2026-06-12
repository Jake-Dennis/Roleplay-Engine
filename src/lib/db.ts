import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { APP_CONFIG } from "./config";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = APP_CONFIG.dataDir;
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "global.db");
  db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma("journal_mode = WAL");
  db.pragma("wal_autocheckpoint = 1000"); // checkpoint after 1000 WAL pages
  db.pragma("foreign_keys = ON");
  db.pragma("cache_size = -64000"); // 64MB cache
  db.pragma("busy_timeout = 5000"); // Wait 5s for WAL lock contention

  return db;
}

export function checkpointDb(): void {
  if (db) {
    db.pragma("wal_checkpoint(TRUNCATE)");
  }
}

export function closeDb(): void {
  if (db) {
    checkpointDb();
    db.close();
    db = null;
  }
}

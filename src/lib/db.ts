import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { APP_CONFIG } from "./config";

let db: Database.Database | null = null;
let vecLoaded = false;

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

  // Load sqlite-vec extension
  try {
    loadVecExtension(db);
    vecLoaded = true;
  } catch {
    vecLoaded = false;
    // sqlite-vec not available — vector search will fall back to keyword-only
  }

  return db;
}

function loadVecExtension(database: Database.Database) {
  // Try to find vec0.dll from sqlite-vec-windows-x64 package
  const nodeModules = path.join(process.cwd(), "node_modules");
  const candidates = [
    path.join(nodeModules, "sqlite-vec-windows-x64", "vec0.dll"),
    path.join(nodeModules, "sqlite-vec-darwin-x64", "vec0.dylib"),
    path.join(nodeModules, "sqlite-vec-darwin-arm64", "vec0.dylib"),
    path.join(nodeModules, "sqlite-vec-linux-x64", "vec0.so"),
    path.join(nodeModules, "sqlite-vec-linux-arm64", "vec0.so"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      database.loadExtension(candidate);
      return;
    }
  }

  throw new Error("sqlite-vec extension not available");
}

export function isVecAvailable(): boolean {
  return vecLoaded;
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
    vecLoaded = false;
  }
}

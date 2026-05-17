/**
 * Migration: Add last_idle_t column to users table
 *
 * Tracks the highest idle tier processed for each user to prevent
 * duplicate job queuing during idle-time processing.
 */

import Database from "better-sqlite3";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const dbPath = path.join(DATA_DIR, "global.db");

function main() {
  console.log("Running migration: add last_idle_t to users...");

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  try {
    db.exec(`ALTER TABLE users ADD COLUMN last_idle_t INTEGER DEFAULT 0`);
    console.log("  Added last_idle_t to users");
  } catch (e: any) {
    if (e.message.includes("duplicate column")) {
      console.log("  last_idle_t already exists in users, skipping");
    } else {
      throw e;
    }
  }

  console.log("Migration complete.");
  db.close();
}

main();

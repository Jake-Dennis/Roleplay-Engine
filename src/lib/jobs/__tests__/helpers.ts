/**
 * Job Test Helpers
 *
 * Provides test utilities specific to job handlers:
 *  - In-memory database with full schema
 *  - Test user/universe creation
 *  - Job queue helper (insert a job directly for testing handlers)
 */

import Database from "better-sqlite3";
import crypto from "crypto";
import {
  createTestDb,
  createTestUser,
  createTestUniverse,
  createTestSession,
} from "@/lib/__tests__/helpers";

export { createTestDb, createTestUser, createTestUniverse, createTestSession };

/**
 * Insert a test job directly into the queue for handler testing.
 * Returns the job id.
 */
export function insertTestJob(
  db: Database.Database,
  overrides: {
    userId?: string;
    type?: string;
    priority?: string;
    payload?: Record<string, unknown>;
  } = {}
): { id: string; userId: string } {
  const id = crypto.randomUUID();
  const userId = overrides.userId || createTestUser(db);
  const type = overrides.type || "test_job";
  const payload = JSON.stringify(overrides.payload || {});

  db.prepare(
    `INSERT INTO job_queue (id, user_id, type, priority, status, payload)
     VALUES (?, ?, ?, ?, 'queued', ?)`
  ).run(id, userId, type, overrides.priority || "low", payload);

  return { id, userId };
}

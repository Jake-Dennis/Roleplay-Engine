/**
 * Backfill Relationship Markdown Files
 *
 * One-time script to create markdown files for all existing relationships
 * in the database. Run with: npx tsx scripts/backfill-relationship-files.ts
 *
 * Creates directory-per-relationship structure:
 *   data/<user_id>/relationships/<source>_<target>/
 *   ├── relationship.md
 *   └── history.md
 */

import { getDb } from "../src/lib/db";
import { writeRelationshipFiles, getAllRelationshipDirs } from "../src/lib/relationship-markdown";

const db = getDb();

// Get all relationships from DB
const relationships = db.prepare(
  "SELECT * FROM relationships"
).all() as Array<{
  id: string;
  user_id: string;
  universe_id: string | null;
  source_entity_id: string | null;
  target_entity_id: string | null;
  source_entity: string;
  target_entity: string;
  emotional_state: string | null;
  shared_history: string | null;
  relationship_stage: string | null;
  decay_rates: string | null;
  updated_at: string | null;
  created_at: string | null;
}>;

console.log(`Found ${relationships.length} relationships in database`);

let created = 0;
const skipped = 0;
let errors = 0;

for (const rel of relationships) {
  try {
    writeRelationshipFiles(rel);
    created++;
    console.log(`  ✓ ${rel.user_id}: ${rel.source_entity} ↔ ${rel.target_entity}`);
  } catch (err) {
    errors++;
    console.log(`  ✗ ${rel.user_id}: ${rel.source_entity} ↔ ${rel.target_entity} — ${err}`);
  }
}

// Count existing directories
const userIds = [...new Set(relationships.map((r) => r.user_id))];
let totalDirs = 0;
for (const userId of userIds) {
  const dirs = getAllRelationshipDirs(userId);
  totalDirs += dirs.length;
}

console.log(`\nResults:`);
console.log(`  Created: ${created}`);
console.log(`  Errors: ${errors}`);
console.log(`  Total relationship directories: ${totalDirs}`);

const D = require('better-sqlite3');
const db = new D('./data/global.db');

const userId = "8aec6985-e41f-494c-ba65-99648ee80d4b";
const sessionId = "068b82ae-ed39-46e2-a768-c1c52c8267e2";

// Simulate exactly what the handler does after processRelationshipAnalysis
console.log("Fetching relationships for user...");
const allRels = db.prepare("SELECT id, emotional_state, relationship_stage FROM relationships WHERE user_id = ?").all(userId);
console.log("Found:", allRels.length, "relationships");

// Test each SQL statement that the handler runs
for (const rel of allRels) {
  console.log("Testing evolution query for:", rel.id);
  try {
    const evo = db.prepare("SELECT emotional_state, relationship_stage FROM relationship_evolution WHERE relationship_id = ? ORDER BY recorded_at DESC LIMIT 1").get(rel.id);
    console.log("  evolution OK");
  } catch(e) {
    console.log("  ERROR:", e.message);
  }

  // Test recordEvolution
  try {
    const uuid = require('crypto').randomUUID();
    db.prepare("INSERT INTO relationship_evolution (id, relationship_id, user_id, emotional_state, relationship_stage, trigger_event, recorded_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))").run(uuid, rel.id, userId, rel.emotional_state, rel.relationship_stage, "test");
    console.log("  recordEvolution OK");
    // Clean up
    db.prepare("DELETE FROM relationship_evolution WHERE id = ?").run(uuid);
  } catch(e) {
    console.log("  recordEvolution ERROR:", e.message);
  }

  // Test recordAnchor
  try {
    const uuid = require('crypto').randomUUID();
    db.prepare("INSERT INTO narrative_anchors (id, relationship_id, user_id, anchor_type, description, emotional_impact) VALUES (?, ?, ?, ?, ?, ?)").run(uuid, rel.id, userId, "test", "test desc", "test impact");
    console.log("  recordAnchor OK");
    db.prepare("DELETE FROM narrative_anchors WHERE id = ?").run(uuid);
  } catch(e) {
    console.log("  recordAnchor ERROR:", e.message);
  }
}

console.log("All tests done");
db.close();

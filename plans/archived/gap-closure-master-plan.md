# Roleplay-Engine: Gap Closure Master Plan

## Overview

Comprehensive plan to close all gaps between the implementation plan (`plans/active/roleplay-engine-implementation.md`) and the actual codebase. Organized by priority: High (core functionality), Medium (planned features), Low (architecture/structure).

**Total items: 23** across 5 work streams.

---

## Work Stream A: Message & Conversation Integrity (High Priority)

### A1. `parent_message_id` Conversation Branching

**Plan Section:** 5.11
**Problem:** Edit/regenerate never set `parent_message_id`, so conversation forks are invisible.

#### Implementation

**1. Update edit handler** (`src/app/api/sessions/[id]/messages/[messageId]/route.ts` PUT):
```typescript
// After soft-deleting subsequent messages, set parent_message_id on the new message
const newMsg = db.prepare(
  `INSERT INTO messages (id, session_id, sender_id, content, timestamp, parent_message_id)
   VALUES (?, ?, NULL, ?, CURRENT_TIMESTAMP, ?)`
).run(newId, sessionId, aiResponse, messageId); // messageId = the edited message
```

**2. Update regenerate handler** (`src/app/api/sessions/[id]/messages/[messageId]/regenerate/route.ts`):
```typescript
// Same pattern — new message gets parent_message_id = original message id
```

**3. Update message query** to follow the active branch:
```sql
-- Instead of: WHERE session_id = ? AND is_deleted = 0 ORDER BY timestamp
-- Use recursive CTE to follow parent_message_id chain:
WITH RECURSIVE active_branch AS (
  -- Find the latest message (tip of conversation)
  SELECT * FROM messages WHERE session_id = ? AND is_deleted = 0 ORDER BY timestamp DESC LIMIT 1
  UNION ALL
  -- Walk backwards via parent_message_id
  SELECT m.* FROM messages m
  INNER JOIN active_branch ab ON m.id = ab.parent_message_id
)
SELECT * FROM active_branch ORDER BY timestamp ASC;
```

**4. UI: Show branch indicator** on messages that have siblings:
```tsx
{message.parent_message_id && (
  <span className="text-xxs text-text-muted">branched from earlier message</span>
)}
```

**Files to modify:**
- `src/app/api/sessions/[id]/messages/[messageId]/route.ts`
- `src/app/api/sessions/[id]/messages/[messageId]/regenerate/route.ts`
- `src/app/api/sessions/[id]/messages/route.ts` (GET query)
- `src/app/(app)/session/[id]/page.tsx` (branch indicator)

---

### A2. TTS Cache Cleanup on Message Delete

**Plan Section:** 5.11
**Problem:** Deleted messages leave orphaned TTS cache entries.

#### Implementation

**1. Add cleanup to delete handler** (`src/app/api/sessions/[id]/messages/[messageId]/route.ts` DELETE):
```typescript
// After soft-deleting messages, clean up TTS cache
const deletedIds = result.changes > 0 ? deletedMessageIds : [];
if (deletedIds.length > 0) {
  // Get text content of deleted messages to compute hashes
  const deletedMessages = db.prepare(
    "SELECT id, content FROM messages WHERE id IN (deleted_ids)"
  ).all(...deletedIds);

  for (const msg of deletedMessages) {
    const textHash = crypto.createHash('sha256').update(msg.content).digest('hex');
    db.prepare("DELETE FROM tts_cache WHERE user_id = ? AND text_hash = ?")
      .run(userId, textHash);
  }
}
```

**2. Same cleanup in edit and regenerate handlers.**

**Files to modify:**
- `src/app/api/sessions/[id]/messages/[messageId]/route.ts` (DELETE + PUT)
- `src/app/api/sessions/[id]/messages/[messageId]/regenerate/route.ts`

---

### A3. Edit History API + UI

**Plan Section:** 5.8
**Problem:** `message_edits` table exists but no way to view history.

#### Implementation

**1. Create API endpoint** (`src/app/api/sessions/[id]/messages/[messageId]/edits/route.ts`):
```typescript
// GET — returns edit history for a message
export async function GET(request: NextRequest, { params }: { params: { id: string; messageId: string } }) {
  // Auth check...
  const edits = db.prepare(
    "SELECT * FROM message_edits WHERE message_id = ? ORDER BY edited_at DESC"
  ).all(messageId);
  return NextResponse.json({ edits });
}
```

**2. Create UI component** (`src/components/chat/edit-history.tsx`):
```tsx
interface EditHistoryProps {
  messageId: string;
  sessionId: string;
}

export function EditHistory({ messageId, sessionId }: EditHistoryProps) {
  const [edits, setEdits] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      fetch(`/api/sessions/${sessionId}/messages/${messageId}/edits`)
        .then(res => res.json())
        .then(data => setEdits(data.edits || []));
    }
  }, [open, messageId, sessionId]);

  if (!open) return <button onClick={() => setOpen(true)}>📝 History</button>;

  return (
    <div className="rounded-lg border border-border-default bg-bg-elevated p-3">
      <h4 className="text-xs font-medium text-text-primary mb-2">Edit History</h4>
      {edits.map((edit, i) => (
        <div key={i} className="text-xs text-text-secondary mb-2">
          <span className="text-text-muted">{new Date(edit.edited_at).toLocaleString()}</span>
          <details className="mt-1">
            <summary className="cursor-pointer text-text-muted">View changes</summary>
            <pre className="mt-1 bg-bg-raised p-2 rounded text-xxs overflow-x-auto">
              <span className="text-error">- {edit.old_content}</span>
              {"\n"}
              <span className="text-success">+ {edit.new_content}</span>
            </pre>
          </details>
        </div>
      ))}
    </div>
  );
}
```

**3. Add "History" button to message action bar** (only when edits exist):
```tsx
{message.edit_count > 0 && (
  <button onClick={() => setShowEditHistory(true)}>📝</button>
)}
```

**Files to create:**
- `src/app/api/sessions/[id]/messages/[messageId]/edits/route.ts`
- `src/components/chat/edit-history.tsx`

**Files to modify:**
- `src/app/(app)/session/[id]/page.tsx` (add history button)

---

### A4. Lore Entry Edit History

**Plan Section:** 5.8
**Problem:** Lore files overwrite without recording changes.

#### Implementation

**1. Create `lore_edits` table** (add to `scripts/init-db.js`):
```sql
CREATE TABLE IF NOT EXISTS lore_edits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,       -- location, npc, event, relationship
  entity_id TEXT NOT NULL,
  old_content TEXT,
  new_content TEXT,
  edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  edit_summary TEXT               -- optional user note about the change
);

CREATE INDEX IF NOT EXISTS idx_lore_edits_entity ON lore_edits(entity_type, entity_id);
```

**2. Update lore-files PUT handler** to record edits:
```typescript
// Before overwriting, read existing content
let oldContent = null;
if (fs.existsSync(filePath)) {
  oldContent = fs.readFileSync(filePath, 'utf-8');
}

// Write new content
fs.writeFileSync(filePath, content, 'utf-8');

// Record edit if content changed
if (oldContent && oldContent !== content) {
  db.prepare(
    "INSERT INTO lore_edits (id, user_id, entity_type, entity_id, old_content, new_content)"
  ).run(crypto.randomUUID(), decoded.sub, entityType, entityId, oldContent, content);
}
```

**3. Create lore edits API** (`src/app/api/lore-edits/route.ts`):
```typescript
// GET ?entityType=locations&entityId=xxx
export async function GET(request: NextRequest) {
  // Auth check...
  const entityType = searchParams.get('entityType');
  const entityId = searchParams.get('entityId');

  const edits = db.prepare(
    "SELECT id, old_content, new_content, edited_at, edit_summary FROM lore_edits WHERE user_id = ? AND entity_type = ? AND entity_id = ? ORDER BY edited_at DESC"
  ).all(decoded.sub, entityType, entityId);

  return NextResponse.json({ edits });
}
```

**4. Add edit history tab to lore editor** (`src/app/(app)/lore/[id]/edit/page.tsx`):
```tsx
// Add a "History" tab alongside Editor/Preview
{activeTab === 'history' && (
  <div className="space-y-2">
    {edits.map((edit) => (
      <details key={edit.id} className="rounded-lg bg-bg-raised p-3">
        <summary className="text-xs text-text-muted cursor-pointer">
          {new Date(edit.edited_at).toLocaleString()}
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-3 text-xxs">
          <div>
            <span className="text-error">Before:</span>
            <pre className="bg-bg-elevated p-2 rounded mt-1 whitespace-pre-wrap">{edit.old_content}</pre>
          </div>
          <div>
            <span className="text-success">After:</span>
            <pre className="bg-bg-elevated p-2 rounded mt-1 whitespace-pre-wrap">{edit.new_content}</pre>
          </div>
        </div>
      </details>
    ))}
  </div>
)}
```

**Files to create:**
- `src/app/api/lore-edits/route.ts`
- Migration in `scripts/init-db.js`

**Files to modify:**
- `src/app/api/lore-files/route.ts`
- `src/app/(app)/lore/[id]/edit/page.tsx`

---

## Work Stream B: Idle Enrichment Job Handlers (High Priority)

### B1. `refine_relationship_summary` Handler

**Plan Section:** 5.5, 5.7
**Problem:** Job type exists but handler falls through to "Unknown job type".

#### Implementation

**1. Add handler to `src/lib/job-processor.ts`:**
```typescript
case "refine_relationship_summary": {
  const userId = jobPayload.userId;
  const db = getDb();

  // Get all relationships for user
  const relationships = db.prepare(
    "SELECT id, source_entity, target_entity, emotional_state, shared_history FROM relationships WHERE user_id = ?"
  ).all(userId);

  for (const rel of relationships) {
    const emotions = rel.emotional_state ? JSON.parse(rel.emotional_state) : {};
    const history = rel.shared_history ? JSON.parse(rel.shared_history) : [];

    // Generate emotional summary via Ollama
    const prompt = `Summarize the relationship between ${rel.source_entity} and ${rel.target_entity}.
Emotional state: ${JSON.stringify(emotions)}
Shared history: ${history.slice(-3).map((h: any) => h.summary).join('; ')}

Write a 2-3 sentence narrative summary of their current relationship dynamic.`;

    const summary = await generateText(prompt, { userId });

    // Update relationship with refined summary
    db.prepare(
      "UPDATE relationships SET shared_history = ? WHERE id = ?"
    ).run(JSON.stringify([...history, { type: 'summary', summary, at: new Date().toISOString() }]), rel.id);
  }

  return { success: true, processed: relationships.length };
}
```

---

### B2. `enrich_npc` Handler

**Plan Section:** 5.7
**Problem:** Job queued but never executed.

#### Implementation

**1. Add handler to `src/lib/job-processor.ts`:**
```typescript
case "enrich_npc": {
  const userId = jobPayload.userId;
  const db = getDb();

  // Get NPCs in active scenes or with high importance
  const npcs = db.prepare(`
    SELECT n.id, n.name, n.file_path, n.importance
    FROM npcs n
    WHERE n.user_id = ? AND n.importance IN ('high', 'critical')
    ORDER BY n.importance DESC
    LIMIT 3
  `).all(userId);

  for (const npc of npcs) {
    // Read existing lore file
    const filePath = path.join(APP_CONFIG.dataDir, userId, 'npcs', path.basename(npc.file_path));
    if (!fs.existsSync(filePath)) continue;

    const existingContent = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(existingContent);

    // Generate enrichment
    const prompt = `Expand on the NPC "${npc.name}". Current lore:\n${body.slice(0, 1000)}\n\nAdd 2-3 new details about their personality, habits, or hidden motivations. Do not contradict existing facts. Return only the new content as markdown.`;

    const enrichment = await generateText(prompt, { userId });

    // Append enrichment to lore file
    const newContent = existingContent + `\n\n## Recent Observations\n${enrichment}`;
    fs.writeFileSync(filePath, newContent, 'utf-8');

    // Create validation record
    db.prepare(
      "INSERT INTO lore_validations (id, user_id, entity_type, entity_id, state, generated_by) VALUES (?, ?, 'npc', ?, 'generated_unverified', 'enrich_npc')"
    ).run(crypto.randomUUID(), userId, npc.id);
  }

  return { success: true, processed: npcs.length };
}
```

---

### B3. `expand_rumors` Handler

**Plan Section:** 5.7
**Problem:** Job queued but never executed.

#### Implementation

**1. Add handler to `src/lib/job-processor.ts`:**
```typescript
case "expand_rumors": {
  const userId = jobPayload.userId;
  const db = getDb();

  // Get recent events that could spawn rumors
  const recentEvents = db.prepare(`
    SELECT id, title, event_type, outcome, occurred_at
    FROM events
    WHERE user_id = ? AND occurred_at > datetime('now', '-7 days')
    ORDER BY occurred_at DESC
    LIMIT 5
  `).all(userId);

  for (const event of recentEvents) {
    // Check if rumor already exists for this event
    const existingRumor = db.prepare(
      "SELECT id FROM narrative_memories WHERE user_id = ? AND type = 'rumor' AND content LIKE ?"
    ).get(userId, `%${event.title}%`);

    if (existingRumor) continue;

    // Generate rumor
    const prompt = `Based on this event: "${event.title}" (${event.event_type}, outcome: ${event.outcome || 'unknown'}), generate 1-2 rumors that might spread among NPCs. Rumors should be plausible but potentially inaccurate. Return as bullet points.`;

    const rumors = await generateText(prompt, { userId });

    // Store as narrative memory with type 'rumor'
    db.prepare(
      "INSERT INTO narrative_memories (id, user_id, session_id, type, content, importance, related_entities) VALUES (?, ?, NULL, 'rumor', ?, ?, ?)"
    ).run(
      crypto.randomUUID(),
      userId,
      rumors,
      JSON.stringify({ emotional: 'low', local: 'medium', canonical: 'low', recency: 'high' }),
      JSON.stringify([event.id])
    );
  }

  return { success: true, processed: recentEvents.length };
}
```

---

### B4. `archival_processing` Handler

**Plan Section:** 5.7
**Problem:** Job queued but never executed.

#### Implementation

**1. Add handler to `src/lib/job-processor.ts`:**
```typescript
case "archival_processing": {
  const userId = jobPayload.userId;
  const db = getDb();

  // Find low-importance memories (composite score <= 4)
  const lowImportanceMemories = db.prepare(`
    SELECT id, content, importance, created_at
    FROM narrative_memories
    WHERE user_id = ? AND importance IS NOT NULL
  `).all(userId);

  let archived = 0;
  for (const memory of lowImportanceMemories) {
    const imp = JSON.parse(memory.importance);
    const score = (imp.emotional || 1) + (imp.local || 1) + (imp.canonical || 1) + (imp.recency || 1);

    if (score <= 4) {
      // Create archival summary
      const prompt = `Summarize this narrative memory in one sentence: "${memory.content.slice(0, 200)}"`;
      const summary = await generateText(prompt, { userId });

      // Update memory with archival marker
      db.prepare(
        "UPDATE narrative_memories SET content = ?, importance = ? WHERE id = ?"
      ).run(`[ARCHIVED] ${summary}`, JSON.stringify({ emotional: 'low', local: 'low', canonical: 'low', recency: 'low' }), memory.id);

      archived++;
    }
  }

  return { success: true, archived };
}
```

---

## Work Stream C: Scene State & Contradiction (Medium Priority)

### C1. Scene State Completeness

**Plan Section:** 5.1
**Problem:** Only `location`, `goal`, `tone` fields work. Missing `active_npcs`, `active_threads`, `scene_summary`.

#### Implementation

**1. Update scene API** (`src/app/api/sessions/[id]/scene/route.ts` PUT):
```typescript
// Accept all 6 fields
const { location, goal, tone, activeNpcs, activeThreads, sceneSummary } = body;

db.prepare(`
  UPDATE scene_states SET
    active_location_id = COALESCE(?, active_location_id),
    current_goal = COALESCE(?, current_goal),
    emotional_tone = COALESCE(?, emotional_tone),
    active_npcs = COALESCE(?, active_npcs),
    active_threads = COALESCE(?, active_threads),
    scene_summary = COALESCE(?, scene_summary),
    updated_at = CURRENT_TIMESTAMP
  WHERE session_id = ?
`).run(
  location || null,
  goal || null,
  tone || null,
  activeNpcs ? JSON.stringify(activeNpcs) : null,
  activeThreads ? JSON.stringify(activeThreads) : null,
  sceneSummary || null,
  sessionId
);
```

**2. Update session page UI** to show all fields:
```tsx
// Scene state panel
<div className="rounded-xl border border-border-default bg-bg-elevated p-4">
  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Scene State</h3>
  <div className="grid grid-cols-2 gap-3 text-xs">
    <div>
      <span className="text-text-muted">Location:</span>
      <span className="text-text-primary ml-1">{sceneState.location || 'Unknown'}</span>
    </div>
    <div>
      <span className="text-text-muted">Goal:</span>
      <span className="text-text-primary ml-1">{sceneState.goal || 'None'}</span>
    </div>
    <div>
      <span className="text-text-muted">Tone:</span>
      <span className="text-text-primary ml-1 capitalize">{sceneState.tone || 'Neutral'}</span>
    </div>
  </div>

  {/* Active NPCs */}
  {sceneState.activeNpcs?.length > 0 && (
    <div className="mt-3">
      <span className="text-text-muted text-xxs">Active NPCs:</span>
      <div className="flex flex-wrap gap-1 mt-1">
        {sceneState.activeNpcs.map((npc: string) => (
          <span key={npc} className="rounded-full bg-accent/10 px-2 py-0.5 text-xxs text-accent">{npc}</span>
        ))}
      </div>
    </div>
  )}

  {/* Active Threads */}
  {sceneState.activeThreads?.length > 0 && (
    <div className="mt-2">
      <span className="text-text-muted text-xxs">Active Threads:</span>
      <div className="flex flex-wrap gap-1 mt-1">
        {sceneState.activeThreads.map((t: string) => (
          <span key={t} className="rounded-full bg-warning/10 px-2 py-0.5 text-xxs text-warning">⚑ {t}</span>
        ))}
      </div>
    </div>
  )}

  {/* Scene Summary */}
  {sceneState.sceneSummary && (
    <p className="mt-3 text-xs text-text-secondary italic">{sceneState.sceneSummary}</p>
  )}
</div>
```

**Files to modify:**
- `src/app/api/sessions/[id]/scene/route.ts`
- `src/app/(app)/session/[id]/page.tsx`

---

### C2. Scene State Auto-Lifecycle

**Plan Section:** 5.1
**Problem:** Scene state only created via explicit PUT, not on session start.

#### Implementation

**1. Auto-create scene state when session is created** (`src/app/api/sessions/route.ts` POST):
```typescript
// After creating session, initialize scene state
db.prepare(
  "INSERT INTO scene_states (id, session_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
).run(crypto.randomUUID(), sessionId);
```

**2. Auto-create when session detail is first accessed** (fallback):
```typescript
// In GET /api/sessions/:id
let sceneState = db.prepare("SELECT * FROM scene_states WHERE session_id = ?").get(sessionId);
if (!sceneState) {
  db.prepare("INSERT INTO scene_states (id, session_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
    .run(crypto.randomUUID(), sessionId);
  sceneState = db.prepare("SELECT * FROM scene_states WHERE session_id = ?").get(sessionId);
}
```

---

### C3. Automated Rule-Based Contradiction Detection

**Plan Section:** 5.2
**Problem:** Only LLM-based checking exists. No rule-based detection.

#### Implementation

**1. Create `src/lib/contradiction-detector.ts`:**
```typescript
import { getDb } from "./db";

export interface ContradictionRule {
  id: string;
  name: string;
  check: (entity: any, canon: any[]) => Contradiction | null;
}

export interface Contradiction {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  conflictingEntity: string;
}

export const CONTRADICTION_RULES: ContradictionRule[] = [
  {
    id: 'alive_dead',
    name: 'Alive/Dead Conflict',
    check: (entity, canon) => {
      // If entity is marked dead in canon but alive elsewhere
      const isDeadInCanon = canon.some(c => c.type === 'death' && c.target === entity.name);
      const isAliveInLore = entity.status === 'alive';
      if (isDeadInCanon && isAliveInLore) {
        return {
          type: 'alive_dead',
          severity: 'critical',
          description: `${entity.name} is marked as dead in canon but alive in current lore`,
          conflictingEntity: entity.name,
        };
      }
      return null;
    },
  },
  {
    id: 'temporal_impossibility',
    name: 'Temporal Impossibility',
    check: (entity, canon) => {
      // If event occurred before timeline start
      const timelineStart = canon.find(c => c.type === 'timeline_start');
      if (timelineStart && entity.occurred_at && entity.occurred_at < timelineStart.date) {
        return {
          type: 'temporal',
          severity: 'high',
          description: `Event "${entity.title}" occurred before timeline start (${timelineStart.date})`,
          conflictingEntity: entity.title,
        };
      }
      return null;
    },
  },
  {
    id: 'location_conflict',
    name: 'Location Conflict',
    check: (entity, canon) => {
      // If entity is in two places at once
      const locations = canon.filter(c => c.type === 'location' && c.entity === entity.name);
      if (locations.length > 1) {
        const uniqueLocations = [...new Set(locations.map(l => l.location))];
        if (uniqueLocations.length > 1) {
          return {
            type: 'location',
            severity: 'medium',
            description: `${entity.name} appears in multiple locations simultaneously: ${uniqueLocations.join(', ')}`,
            conflictingEntity: entity.name,
          };
        }
      }
      return null;
    },
  },
];

export function detectContradictions(entityType: string, entityId: string, userId: string): Contradiction[] {
  const db = getDb();

  // Get entity data
  const entity = db.prepare(
    `SELECT * FROM ${entityType}s WHERE id = ? AND user_id = ?`
  ).get(entityId, userId);

  if (!entity) return [];

  // Get immutable canon entries
  const canon = db.prepare(
    "SELECT * FROM lore_validations WHERE user_id = ? AND state = 'validated' AND entity_type = ?"
  ).all(userId, entityType);

  const contradictions: Contradiction[] = [];

  for (const rule of CONTRADICTION_RULES) {
    const result = rule.check(entity, canon);
    if (result) {
      contradictions.push(result);

      // Create validation record
      db.prepare(
        "INSERT INTO lore_validations (id, user_id, entity_type, entity_id, state, validation_notes) VALUES (?, ?, ?, ?, 'under_review', ?)"
      ).run(crypto.randomUUID(), userId, entityType, entityId, result.description);
    }
  }

  return contradictions;
}
```

**2. Integrate into lore expansion** (`src/lib/lore-expansion.ts`):
```typescript
import { detectContradictions } from "./contradiction-detector";

// After generating lore, run rule-based checks
const contradictions = detectContradictions(entityType, entityId, userId);
if (contradictions.length > 0) {
  // Flag for review
  db.prepare(
    "UPDATE lore_validations SET state = 'under_review' WHERE entity_type = ? AND entity_id = ?"
  ).run(entityType, entityId);
}
```

**Files to create:**
- `src/lib/contradiction-detector.ts`

**Files to modify:**
- `src/lib/lore-expansion.ts`

---

## Work Stream D: Canon, Decay, Intent, SSE (Medium Priority)

### D1. 5-Tier Canon System Alignment

**Plan Section:** 5.3
**Problem:** Code uses `canon/fanon/draft/deprecated` instead of plan's 5 tiers.

#### Implementation

**1. Update canon_status values** across the codebase:
```typescript
// New canon tiers
export const CANON_TIERS = [
  { value: 'immutable_canon', label: 'Immutable Canon', locked: true },
  { value: 'soft_canon', label: 'Soft Canon', locked: false },
  { value: 'generated_lore', label: 'Generated Lore', locked: false },
  { value: 'session_lore', label: 'Session Lore', locked: false },
  { value: 'rumor', label: 'Rumor', locked: false },
] as const;
```

**2. Update lore editor canon selector** (`src/app/(app)/lore/[id]/edit/page.tsx`):
```tsx
<select value={loreFile.frontmatter.canon_status || 'generated_lore'} onChange={(e) => updateFrontmatter('canon_status', e.target.value)}>
  {CANON_TIERS.map(tier => (
    <option key={tier.value} value={tier.value} disabled={tier.locked && loreFile.frontmatter.canon_status !== tier.value}>
      {tier.label} {tier.locked ? '(locked)' : ''}
    </option>
  ))}
</select>
```

**3. Update canon page** (`src/app/(app)/canon/page.tsx`) to use new tiers.

**4. Add migration** for existing data:
```sql
UPDATE npcs SET canon_status = 'immutable_canon' WHERE canon_status = 'canon';
UPDATE npcs SET canon_status = 'generated_lore' WHERE canon_status = 'generated';
UPDATE npcs SET canon_status = 'session_lore' WHERE canon_status = 'fanon';
```

---

### D2. Immutable Canon Read-Only Enforcement

**Plan Section:** 5.3
**Problem:** No read-only enforcement for immutable canon entries.

#### Implementation

**1. Add check to lore-files PUT handler:**
```typescript
// Before allowing edit, check canon_status
const existing = db.prepare(
  "SELECT canon_status FROM npcs WHERE id = ? AND user_id = ?"
).get(entityId, decoded.sub);

if (existing?.canon_status === 'immutable_canon') {
  return NextResponse.json({ error: "Cannot edit immutable canon entries" }, { status: 403 });
}
```

**2. Add visual indicator in lore editor:**
```tsx
{loreFile.frontmatter.canon_status === 'immutable_canon' && (
  <div className="flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
    <Lock className="h-3.5 w-3.5" />
    This entry is immutable canon and cannot be edited
  </div>
)}
```

---

### D3. Decay Indicator UI + Adjustable Rates

**Plan Section:** 5.5
**Problem:** No decay visualization or user-adjustable rates.

#### Implementation

**1. Create decay indicator component** (`src/components/relationship/decay-indicator.tsx`):
```tsx
interface DecayIndicatorProps {
  emotions: Record<string, number>;
  lastInteraction: string;
  decayRates: Record<string, string>;
}

export function DecayIndicator({ emotions, lastInteraction, decayRates }: DecayIndicatorProps) {
  const daysSinceInteraction = Math.floor((Date.now() - new Date(lastInteraction).getTime()) / 86400000);

  const halfLives: Record<string, number> = {
    low: 30,
    very_low: 60,
    medium: 14,
    high: 7,
  };

  return (
    <div className="rounded-lg border border-border-default bg-bg-elevated p-3">
      <h4 className="text-xs font-medium text-text-primary mb-2">Decay Status</h4>
      <p className="text-xxs text-text-muted mb-2">{daysSinceInteraction} days since last interaction</p>
      {Object.entries(emotions).map(([emotion, value]) => {
        const rate = decayRates[emotion] || 'low';
        const halfLife = halfLives[rate] || 30;
        const decayedValue = value * Math.pow(0.5, daysSinceInteraction / halfLife);
        const decayPercent = ((value - decayedValue) / value) * 100;

        return (
          <div key={emotion} className="flex items-center gap-2 text-xs mb-1">
            <span className="text-text-muted w-20 capitalize">{emotion}</span>
            <div className="flex-1 h-1.5 bg-bg-raised rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${decayPercent > 50 ? 'bg-error' : decayPercent > 25 ? 'bg-warning' : 'bg-success'}`}
                style={{ width: `${(decayedValue / value) * 100}%` }}
              />
            </div>
            <span className="text-xxs text-text-muted w-12">{decayPercent.toFixed(0)}% decayed</span>
          </div>
        );
      })}
    </div>
  );
}
```

**2. Add decay rates editor to relationships page.**

---

### D4. Semantic Embedding Fallback for Intent

**Plan Section:** 5.6
**Problem:** Only keyword matching works. No semantic fallback.

#### Implementation

**1. Update `src/lib/intent-analyzer.ts`:**
```typescript
import { generateEmbedding } from "./ollama";

const INTENT_PROTOTYPES = {
  exploration: "explore the area, look around, search, investigate the ruins",
  combat: "attack, fight, defend, strike, battle, draw weapon",
  social: "talk to, ask, convince, persuade, greet, negotiate",
  investigation: "find clues, who did this, what happened, search for evidence",
  rest: "rest, sleep, camp, wait, take a break",
  travel: "go to, head toward, journey, travel to, move to",
  ritual: "cast spell, perform ritual, pray, use magic, channel",
};

let prototypeEmbeddings: Record<string, number[]> = {};

async function getPrototypeEmbeddings(): Promise<Record<string, number[]>> {
  if (Object.keys(prototypeEmbeddings).length === 0) {
    for (const [intent, text] of Object.entries(INTENT_PROTOTYPES)) {
      prototypeEmbeddings[intent] = await generateEmbedding(text);
    }
  }
  return prototypeEmbeddings;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

export async function classifyIntent(input: string): Promise<IntentResult> {
  // Fast path: keyword matching
  const keywordResult = classifyByKeywords(input);
  if (keywordResult.confidence > 0.7) return keywordResult;

  // Fallback: semantic embedding comparison
  try {
    const prototypes = await getPrototypeEmbeddings();
    const inputEmbedding = await generateEmbedding(input);

    let bestIntent = 'social';
    let bestScore = 0;

    for (const [intent, prototypeEmbedding] of Object.entries(prototypes)) {
      const score = cosineSimilarity(inputEmbedding, prototypeEmbedding);
      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }

    return {
      intent: bestIntent,
      confidence: bestScore,
      method: 'semantic',
    };
  } catch {
    return keywordResult; // Fall back to keyword if embedding fails
  }
}
```

---

### D5. SSE Events: scene_update, thread_update, job_complete

**Plan Section:** 5.10
**Problem:** These event types are not emitted.

#### Implementation

**1. Add to `src/lib/event-bus.ts`:**
```typescript
// Scene update event
export function emitSceneUpdate(sessionId: string, sceneState: any) {
  eventBus.emit(sessionId, 'scene_update', {
    location: sceneState.active_location_id,
    goal: sceneState.current_goal,
    tone: sceneState.emotional_tone,
    active_npcs: sceneState.active_npcs ? JSON.parse(sceneState.active_npcs) : [],
    active_threads: sceneState.active_threads ? JSON.parse(sceneState.active_threads) : [],
    scene_summary: sceneState.scene_summary,
  });
}

// Thread update event
export function emitThreadUpdate(sessionId: string, thread: any) {
  eventBus.emit(sessionId, 'thread_update', {
    id: thread.id,
    title: thread.title,
    status: thread.status,
    escalation_level: thread.escalation_level,
  });
}

// Job complete event
export function emitJobComplete(sessionId: string, job: any) {
  eventBus.emit(sessionId, 'job_complete', {
    type: job.type,
    status: job.status,
    processed_at: job.processed_at,
  });
}
```

**2. Call these from respective handlers:**
- Scene PUT → `emitSceneUpdate()`
- Narrative threads API → `emitThreadUpdate()`
- Job processor → `emitJobComplete()`

---

### D6. Max 50 Concurrent SSE Connections

**Plan Section:** 5.10
**Problem:** No connection limit.

#### Implementation

**1. Add limit to stream route** (`src/app/api/sessions/[id]/stream/route.ts`):
```typescript
const MAX_CONNECTIONS = 50;

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  // ... auth checks ...

  const connectionCount = eventBus.getConnectionCount(sessionId);
  if (connectionCount >= MAX_CONNECTIONS) {
    return NextResponse.json(
      { error: 'Maximum connections reached for this session' },
      { status: 503 }
    );
  }

  // ... rest of SSE setup ...
}
```

---

### D7. TTS Endpoints: Voice Refresh, Combine, Cache Stats, Cache Clear

**Plan Section:** 6
**Problem:** These endpoints don't exist.

#### Implementation

**1. Voice refresh** (`src/app/api/tts/voices/refresh/route.ts`):
```typescript
export async function POST() {
  const voices = await discoverVoices(); // existing function in tts.ts
  return NextResponse.json({ success: true, voices });
}
```

**2. Voice combine** (`src/app/api/tts/voices/combine/route.ts`):
```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { voiceSpec } = body; // e.g., "af_bella(2)+af_sky(1)"

  const response = await fetch(`${TTS_CONFIG.baseUrl}/v1/audio/voices/combine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(voiceSpec),
  });

  const audioBuffer = await response.arrayBuffer();
  return new NextResponse(audioBuffer, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
}
```

**3. Cache stats** (`src/app/api/tts/cache/stats/route.ts`):
```typescript
export async function GET(request: NextRequest) {
  // Auth check...
  const stats = db.prepare(`
    SELECT COUNT(*) as totalEntries,
           SUM(duration_ms) as totalDurationMs,
           SUM(use_count) as totalUses,
           MIN(created_at) as oldestEntry,
           MAX(last_used) as lastUsed
    FROM tts_cache WHERE user_id = ?
  `).get(decoded.sub);

  // Get disk size
  const cacheDir = path.join(APP_CONFIG.dataDir, decoded.sub, 'tts_cache');
  let diskSize = 0;
  let fileCount = 0;
  if (fs.existsSync(cacheDir)) {
    const files = fs.readdirSync(cacheDir);
    fileCount = files.length;
    for (const file of files) {
      diskSize += fs.statSync(path.join(cacheDir, file)).size;
    }
  }

  return NextResponse.json({
    stats: {
      ...stats,
      diskSize,
      diskSizeFormatted: formatBytes(diskSize),
      fileCount,
    },
  });
}
```

**4. Cache clear** (`src/app/api/tts/cache/clear/route.ts`):
```typescript
export async function DELETE(request: NextRequest) {
  // Auth check...
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'clear';

  const cacheDir = path.join(APP_CONFIG.dataDir, decoded.sub, 'tts_cache');

  switch (action) {
    case 'expired':
      // Delete entries older than cacheMaxAge
      const cutoff = new Date(Date.now() - TTS_CONFIG.cacheMaxAge * 1000).toISOString();
      const expired = db.prepare("SELECT audio_path FROM tts_cache WHERE user_id = ? AND created_at < ?").all(decoded.sub, cutoff);
      for (const entry of expired) {
        if (entry.audio_path && fs.existsSync(entry.audio_path)) fs.unlinkSync(entry.audio_path);
      }
      db.prepare("DELETE FROM tts_cache WHERE user_id = ? AND created_at < ?").run(decoded.sub, cutoff);
      break;

    case 'unused':
      // Delete entries never used
      const unused = db.prepare("SELECT audio_path FROM tts_cache WHERE user_id = ? AND use_count = 0").all(decoded.sub);
      for (const entry of unused) {
        if (entry.audio_path && fs.existsSync(entry.audio_path)) fs.unlinkSync(entry.audio_path);
      }
      db.prepare("DELETE FROM tts_cache WHERE user_id = ? AND use_count = 0").run(decoded.sub);
      break;

    case 'clear':
      // Delete everything
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      db.prepare("DELETE FROM tts_cache WHERE user_id = ?").run(decoded.sub);
      break;
  }

  return NextResponse.json({ success: true });
}
```

---

## Work Stream E: Architecture & Structure (Low Priority)

### E1. Component Library Extraction

**Plan Section:** 12
**Problem:** Everything is inline in pages. No reusable components.

#### Implementation Strategy

**Phase 1: Extract chat components**
1. `src/components/chat/message-item.tsx` — from session page inline code
2. `src/components/chat/message-input.tsx` — input + send button
3. `src/components/chat/message-actions.tsx` — TTS/Copy/Edit/Regen/Delete buttons
4. `src/components/chat/chat-window.tsx` — message list + input

**Phase 2: Extract layout components**
1. `src/components/layout/app-header.tsx` — header bar
2. `src/components/layout/app-sidebar.tsx` — navigation sidebar
3. `src/components/layout/app-footer.tsx` — status bar

**Phase 3: Extract UI primitives**
1. `src/components/ui/button.tsx`
2. `src/components/ui/input.tsx`
3. `src/components/ui/card.tsx`
4. `src/components/ui/badge.tsx`
5. `src/components/ui/modal.tsx`

**Phase 4: Extract domain components**
1. `src/components/lore/lore-card.tsx`
2. `src/components/lore/backlink-panel.tsx`
3. `src/components/relationship/decay-indicator.tsx`
4. `src/components/narrative/thread-tracker.tsx`

**Approach:** Extract one component at a time, verify tests pass, commit. No big-bang refactor.

---

### E2. Client Hooks

**Plan Section:** 12
**Problem:** No reusable hooks.

#### Implementation

**1. `src/hooks/use-auth.ts`:**
```typescript
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => { setUser(data.user); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, []);

  const login = async (username: string, password: string) => { /* ... */ };
  const logout = async () => { /* ... */ };

  return { user, loading, login, logout };
}
```

**2. `src/hooks/use-session.ts`:**
```typescript
export function useSession(sessionId: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/sessions/${sessionId}`)
      .then(res => res.json())
      .then(data => {
        setSession(data.session);
        setMessages(data.messages || []);
        setLoading(false);
      });
  }, [sessionId]);

  const sendMessage = async (content: string) => { /* ... */ };
  const regenerate = async (messageId: string) => { /* ... */ };

  return { session, messages, loading, sendMessage, regenerate };
}
```

**3. `src/hooks/use-tts.ts`:**
```typescript
export function useTTS() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);

  const play = async (text: string, voice?: string) => { /* ... */ };
  const stop = () => { currentAudio?.pause(); setIsPlaying(false); };

  return { isPlaying, play, stop };
}
```

---

### E3. Missing Lib Modules

**Plan Section:** 12
**Problem:** Logic scattered across files instead of dedicated modules.

#### Implementation

**1. `src/lib/importance.ts` — composite scoring:**
```typescript
export function calculateImportanceScore(axes: { emotional: number; local: number; canonical: number; recency: number }): number {
  return (axes.emotional * 0.35) + (axes.local * 0.25) + (axes.canonical * 0.20) + (axes.recency * 0.20);
}

export function importanceToNumber(level: string): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[level] || 1;
}

export function getArchivalAction(score: number): 'archive' | 'low_priority' | 'normal' | 'always_include' {
  if (score <= 4) return 'archive';
  if (score <= 8) return 'low_priority';
  if (score <= 12) return 'normal';
  return 'always_include';
}
```

**2. `src/lib/prompt-builder.ts` — centralized prompt assembly:**
```typescript
export interface PromptContext {
  sceneState?: any;
  retrievedContext?: any;
  intent?: any;
  canonRules?: any;
  relationshipContext?: any;
}

export function buildPrompt(context: PromptContext): string {
  let prompt = '';

  if (context.sceneState) {
    prompt += `## Current Scene\nLocation: ${context.sceneState.location}\nGoal: ${context.sceneState.goal}\nTone: ${context.sceneState.tone}\n\n`;
  }

  if (context.canonRules) {
    prompt += `## Canon Rules (MUST NOT CONTRADICT)\n${context.canonRules}\n\n`;
  }

  if (context.intent) {
    prompt += `## Player Intent: ${context.intent.intent}\n${context.intent.description}\n\n`;
  }

  if (context.relationshipContext) {
    prompt += `## Relationship Context\n${context.relationshipContext}\n\n`;
  }

  if (context.retrievedContext) {
    prompt += `## Relevant Lore\n${context.retrievedContext}\n\n`;
  }

  return prompt;
}
```

---

## Execution Order

### Phase 1: High Priority (Week 1)
1. A1: `parent_message_id` branching
2. A2: TTS cache cleanup
3. A3: Edit history API + UI
4. A4: Lore entry edit history
5. B1-B4: All 4 idle enrichment job handlers

### Phase 2: Medium Priority (Week 2)
6. C1: Scene state completeness
7. C2: Scene state auto-lifecycle
8. C3: Rule-based contradiction detection
9. D1: 5-tier canon alignment
10. D2: Immutable canon read-only
11. D3: Decay indicator UI
12. D4: Semantic intent fallback
13. D5: SSE events (scene/thread/job)
14. D6: SSE connection limit
15. D7: TTS endpoints (refresh/combine/cache)

### Phase 3: Low Priority (Week 3)
16. E1: Component library extraction (incremental)
17. E2: Client hooks
18. E3: Missing lib modules

---

## Test Strategy

Each item gets tests added to `scripts/test-phase7.js` (or a new `scripts/test-phase9.js` if file gets too large). Target: **400+ total tests** after all phases complete.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `parent_message_id` breaks existing message queries | Medium | Add fallback: if no parent_message_id set, use timestamp ordering |
| Lore edit history grows large | Medium | Add pagination to edits API, cap at 50 entries per entity |
| Contradiction rules produce false positives | High | Start with conservative rules, add user override |
| Component extraction breaks pages | Medium | Extract one component at a time, run full test suite after each |
| Semantic intent fallback adds latency | Low | Cache prototype embeddings, timeout after 2s |

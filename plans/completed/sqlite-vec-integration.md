# Plan: sqlite-vec Integration

## Goal
Enable semantic similarity search using `sqlite-vec` for embeddings-based retrieval of messages, lore, NPCs, and memories — replacing keyword-only retrieval.

## Graph Analysis
- **Affected Systems**: Embedding storage, retrieval pipeline, database schema, search queries
- **Dependency Chain**: `lib/embeddings.ts` → `lib/retrieval.ts` → `lib/ollama.ts` (bge-m3 embeddings) → `data/*.db`
- **Centrality**: HIGH — core retrieval pipeline, affects all context assembly

## Affected Files
| File | Change |
|------|--------|
| `package.json` | Add `sqlite-vec` dependency |
| `src/lib/db.ts` | Initialize sqlite-vec extension |
| `src/lib/embeddings.ts` | Store vectors in vec0 virtual table |
| `src/lib/retrieval.ts` | Add vector similarity search |
| `scripts/init-db.ts` | Create vec0 tables |
| `scripts/migrate-sqlite-vec.ts` | New migration script |

## Database Changes
```sql
-- Create vec0 virtual tables for each entity type
CREATE VIRTUAL TABLE vec_messages USING vec0(
  embedding float[1024],  -- bge-m3 dimension
  metadata TEXT
);

CREATE VIRTUAL TABLE vec_lore USING vec0(
  embedding float[1024],
  metadata TEXT
);

CREATE VIRTUAL TABLE vec_npcs USING vec0(
  embedding float[1024],
  metadata TEXT
);

CREATE VIRTUAL TABLE vec_memories USING vec0(
  embedding float[1024],
  metadata TEXT
);
```

## Risks
- **HIGH**: Native extension requires compilation — may need prebuilt binaries for Windows
- **HIGH**: Existing embeddings must be migrated into vec0 tables
- **MEDIUM**: Retrieval pipeline fallback if vec not available
- **MEDIUM**: bge-m3 produces 1024-dim vectors — verify dimension matches

## Execution Phases

### Phase 1: Installation + Setup
1. Install `sqlite-vec` npm package
2. Verify native extension loads on Windows (may need `better-sqlite3` rebuild)
3. Add vec initialization to `db.ts`
4. Create vec0 tables in `init-db.ts`

### Phase 2: Embedding Storage
1. Update `generateAndStoreEmbedding()` to write to vec0 table
2. Store metadata (entity_id, entity_type, universe_id) in vec0 metadata column
3. Create migration to backfill existing embeddings from `embeddings` table into vec0

### Phase 3: Vector Search
1. Add `vectorSearch(query, entityType, universeId, limit)` function
2. Generate query embedding via bge-m3
3. Query vec0 with KNN: `SELECT * FROM vec_messages WHERE embedding MATCH ? AND k = ?`
4. Filter results by universe_id from metadata

### Phase 4: Retrieval Pipeline Integration
1. Update `getRetrievedContext()` to use vector search as primary retrieval
2. Keep keyword search as fallback if vec unavailable
3. Combine vector results with importance scoring for final ranking
4. Test retrieval quality with sample queries

## Validation
- Generate embeddings for test lore/NPCs/messages
- Query with semantic similarity, verify relevant results returned
- Compare vector search results vs keyword-only results
- Verify universe scoping works (no cross-universe leakage)
- Test fallback when vec extension fails to load

## Rollback
- Revert retrieval to keyword-only mode
- Remove vec0 tables (or leave dormant)
- Keep embeddings in original table as backup

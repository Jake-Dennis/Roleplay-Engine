# Learnings

## 2026-05-28: Added 	hread_id to 5 timeline_entries INSERT statements

Added 	hread_id column to auto-generated timeline entry INSERT statements across 5 files that were missing it:

| File | entry_type | thread_id value |
|------|-----------|----------------|
| src/app/api/sessions/[id]/messages/route.ts | session_start | NULL |
| src/app/api/sessions/[id]/route.ts | session_end | NULL |
| src/lib/jobs/wiki-handler.ts | wiki_event | NULL |
| src/lib/jobs/thread-analysis-handler.ts | 	hread_resolved | existing.id (the resolved thread's DB id) |
| src/lib/scene-extraction.ts | phase_change | NULL |

The 	imeline/route.ts already had 	hread_id in its column list (with era column too) — not modified.

All 6 INSERT statements now consistently include 	hread_id in both column list and VALUES clause. 	hread_id is nullable TEXT — NULL means "not associated with any thread".

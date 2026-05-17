# Plan: Job Queue Progress Bars

## Goal
Add real-time progress indicators to the Jobs page showing job execution status with visual progress bars.

## Graph Analysis
- **Affected Systems**: Job queue API, jobs page UI, SSE events
- **Dependency Chain**: `api/jobs/route.ts` → `jobs/page.tsx` → `event-bus.ts`
- **Centrality**: LOW — isolated to jobs subsystem

## Affected Files
| File | Change |
|------|--------|
| `src/app/(app)/jobs/page.tsx` | Add progress bars + SSE listener |
| `src/app/api/jobs/stream/route.ts` | New SSE endpoint for job events |
| `src/lib/job-processor.ts` | Add `updateJobProgress`, emit progress in handlers |
| `src/lib/event-bus.ts` | Add `JOB_PROGRESS` event type |
| `src/app/api/sessions/[id]/stream/route.ts` | Subscribe to `JOB_PROGRESS` |
| `scripts/init-db.ts` | Add `progress` + `progress_message` columns |
| `src/components/jobs/job-progress.tsx` | New component |

## Database Changes
```sql
-- Add progress column to job_queue
ALTER TABLE job_queue ADD COLUMN progress REAL DEFAULT 0;
ALTER TABLE job_queue ADD COLUMN progress_message TEXT;
```

## Risks
- **LOW**: New columns, default values ensure backward compatibility
- **LOW**: Progress updates are additive, don't affect job execution
- **LOW**: SSE already supports `job_complete` event, add `job_progress` event

## Execution Phases

### Phase 1: Database + API
1. Add `progress` (REAL) and `progress_message` (TEXT) columns to `job_queue`
2. Update `GET /api/jobs` to return progress fields
3. Add `job_progress` SSE event type to event bus

### Phase 2: Job Processor Updates
1. Update job handlers to emit progress updates:
   - `summarize_message`: 0% → 50% (generating) → 100% (saved)
   - `generate_embedding`: 0% → 80% (generating) → 100% (stored)
   - `relationship_analysis`: 0% → 30% → 60% → 100%
   - Long-running jobs: emit progress every 25%
2. Update `job_queue` table with progress values

### Phase 3: Progress Bar Component
1. Create `JobProgress` component:
   - Horizontal progress bar with percentage
   - Color coding: queued (gray), running (blue), completed (green), failed (red)
   - Progress message text (e.g., "Generating embedding...")
   - Animated bar fill using 30fps render loop

### Phase 4: Jobs Page Integration
1. Add progress column to jobs table
2. Show progress bar for running jobs
3. Auto-refresh via SSE `job_progress` events
4. Show estimated time remaining for long jobs

## Validation
- Queue a job, verify progress bar appears
- Watch job execute, verify progress updates in real-time
- Complete job, verify bar turns green and shows 100%
- Failed job, verify bar turns red with error message

## Rollback
- Remove progress columns from job_queue
- Revert jobs page to status-only display

## Status: COMPLETED
- [x] Phase 1: Database schema + `updateJobProgress()` + SSE event type
- [x] Phase 2: All 11 job handlers emit progress updates (25% intervals)
- [x] Phase 3: `JobProgress` component with 30fps animated bar
- [x] Phase 4: Progress bars in job cards + expanded details + SSE streaming
- [x] Validation: Build passes clean, TypeScript compiles with zero errors

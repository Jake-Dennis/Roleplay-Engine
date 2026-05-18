# Track Specification: Phase 8 Stabilization

## Overview
Stabilize and verify completion of all Phase 8 features that have been implemented but may have uncommitted changes, integration gaps, or missing tests.

## Scope
This track covers five Phase 8 sub-features:
- **8A**: 30fps Render Loop
- **8B**: Automatic Idle Detection
- **8C**: Narrative Threads UI
- **8D**: Timeline Management
- **8E**: Markdown Lore Editor

## Success Criteria
1. All Phase 8 features are functionally complete and integrated
2. No uncommitted changes remain in Phase 8-related files
3. TypeScript compilation passes with zero errors
4. ESLint passes with zero errors
5. Build succeeds (`npm run build`)
6. All existing tests pass
7. No runtime errors in development mode

## Out of Scope
- Phase 9 features (relationship markdown storage, embedding contradiction detection)
- New feature development beyond Phase 8
- Major refactoring of existing code
- Performance optimization beyond the 30fps render loop

## Constraints
- Must follow existing codebase patterns (Next.js App Router, TypeScript strict, Tailwind CSS 4)
- No suppression of TypeScript errors
- Must preserve existing functionality (auth, sessions, relationships, events, etc.)

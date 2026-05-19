# Draft: Codebase Cleanup & Improvement Plan

## Scope
Four parallel workstreams:
1. Dead code cleanup
2. Error boundaries
3. Wiki UX improvements
4. Build size optimization

## Research Agents Launched
- **bg_bf23b8a2**: Dead code sweep (unused imports, dead functions, orphaned types)
- **bg_3f1d3aad**: Error boundary audit (current coverage, gaps, placement points)
- **bg_3532f806**: Wiki UX audit (current features, missing features, available data)
- **bg_f1ddef2d**: Build size audit (dependencies, client components, bundle analysis)

## Dependencies
- Dead code cleanup should be done first (reduces codebase before other work)
- Error boundaries are independent
- Wiki UX is independent
- Build optimization should be last (after all other changes)

## Open Questions
- Priority order between the four workstreams
- Whether to do all four in one plan or split

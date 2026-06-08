# Draft: UI Page Component Splitting

## Requirements (confirmed)
- Split all UI pages into components, excluding trivially small redirect stubs
- Follow the existing feature-based pattern (`src/components/{feature}/`)
- For the session page: extract remaining inline JSX (it already has 14 components)

## Pages to Refactor (ranked by priority)

### Tier 1: Critical (>400 lines, mostly inline)
1. `session/[id]/page.tsx` — 1012 lines, already 14 components, extract ~200 remaining inline JSX
2. `jobs/page.tsx` — 647 lines, mostly inline, 3 component imports
3. `personas/page.tsx` — 570 lines, NO component imports, all inline
4. `admin/jobs/page.tsx` — 548 lines, near-duplicate of jobs page
5. `relationships/page.tsx` — 449 lines, 9 components but remaining inline JSX
6. `admin/contradictions/page.tsx` — 420 lines, 3 components
7. `groups/[id]/page.tsx` — 408 lines, all inline
8. `voice-combiner/page.tsx` — 376 lines, NO component imports

### Tier 2: Moderate (250-400 lines)
9. `wiki/[...slug]/page.tsx` — 357 lines, already 6 components
10. `universe/page.tsx` — 305 lines
11. `admin/entities/page.tsx` — 299 lines
12. `timeline/[id]/page.tsx` — 278 lines
13. `narrative-threads/page.tsx` — 275 lines
14. `narrative-threads/[id]/page.tsx` — 274 lines
15. `settings/user/page.tsx` — 271 lines
16. `universe/[id]/page.tsx` — 266 lines
17. `settings/groups/page.tsx` — 243 lines

### Tier 3: Smaller pages (150-250 lines)
18-30. Various pages under 250 lines but still have extraction opportunities

### Skip (redirect stubs)
- canon (5 lines), characters (5 lines), events (5 lines), validations (4 lines), root page (2 lines)

## Technical Approach
- Feature-based extraction: `src/components/{feature}/ComponentName.tsx`
- Follow patterns from npcs/page.tsx (cleanest example)
- Keep pages as thin orchestrators: state management + imports, minimal JSX
- Extract logical UI groups: lists, forms, cards, filters, headers, metadata panels

## Key Opportunities
- **jobs/** and **admin/jobs/** share identical patterns — extract shared components
- **settings/** pages share same layout pattern (mx-auto max-w-lg space-y-8)
- **groups/** pages could share components across list/detail/new views
- **narrative-threads/** and **timeline/** have similar list+detail patterns
- Multiple pages use ConfirmationDialog already; consistent pattern to follow

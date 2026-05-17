# Plan: Color Palette Alignment

## Goal
Align the application's color palette with the spec: `#0a0a0a` background, `#4a9eff` accent, and all derived tokens.

## Graph Analysis
- **Affected Systems**: Tailwind theme config, all UI components, CSS variables
- **Dependency Chain**: `src/app/globals.css` → Tailwind `@theme` → all components
- **Centrality**: HIGH — touches every visual element in the app

## Affected Files
| File | Change |
|------|--------|
| `src/app/globals.css` | Update `@theme` color tokens |
| All components | No changes needed — they use Tailwind tokens |

## Risks
- **LOW**: Purely cosmetic change, no logic affected
- **MEDIUM**: Visual regression — need to verify contrast ratios remain accessible
- **LOW**: Components using hardcoded colors (if any) need manual update

## Execution Phases

### Phase 1: Update Theme Tokens
- [x] Update `--color-bg-base`: `#000000` → `#0a0a0a`
- [x] Update `--color-bg-elevated`: `#111111` → `#141414`
- [x] Update `--color-bg-raised`: `#1a1a1a` → `#1e1e1e`
- [x] Update `--color-bg-highlight`: `#222222` → `#282828`
- [x] Update `--color-border-strong`: `#333333` → `#3a3a3a`
- [x] Update `--color-text-primary`: `#f5f5f5` → `#e8e8e8`
- [x] Update `--color-text-secondary`: `#999999` → `#a0a0a0`
- [x] Update `--color-text-accent`: `#818cf8` → `#6db3f8`
- [x] Update `--color-accent`: `#6366f1` → `#4a9eff`
- [x] Update `--color-accent-hover`: `#818cf8` → `#6db3f8`
- [x] Update `--color-accent-muted`: `#6366f120` → `#4a9eff20`
- [x] Update `--color-accent-subtle`: `#6366f108` → `#4a9eff08`
- [x] Update `--color-border-accent`: `#6366f1` → `#4a9eff`

### Phase 2: Audit Hardcoded Colors
- [x] Replace `#6366f1` in `graph/page.tsx` (location node color)
- [x] Replace `#6366f1` in `graph/page.tsx` (legend badge)
- [x] Replace `#6366f1` in `relationship-graph.tsx` (TYPE_COLORS)
- [x] Replace `#6366f1` in `relationship-graph.tsx` (edge stroke)
- [x] Verified remaining hardcoded colors are intentional semantic/data viz colors

### Phase 3: Visual Verification
1. Run dev server, check all pages for visual consistency
2. Verify contrast ratios meet WCAG AA (4.5:1 for text)
3. Check accent color visibility on dark backgrounds

## Validation
- All pages render with `#0a0a0a` background
- Accent color is `#4a9eff` (blue) instead of `#6366f1` (indigo)
- No hardcoded colors remain in components
- Contrast ratios pass accessibility checks

## Rollback
- Revert `globals.css` theme tokens to previous values

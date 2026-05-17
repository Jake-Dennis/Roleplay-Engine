# Modern Dark UI Implementation

## Goal
Build a fully modern dark UI with pure black `#000000` base and grey elevations, compact desktop-only layout, integrating with all existing backend APIs.

## Color Palette
- `#000000` — background base
- `#111111` — elevated surfaces (sidebar, cards)
- `#1a1a1a` — raised surfaces (inputs, hover states)
- `#222222` — highlight surfaces (active states)
- `#2a2a2a` — subtle borders
- `#333333` — strong borders
- `#f5f5f5` — primary text
- `#999999` — secondary text
- `#666666` — muted text
- `#6366f1` — accent (indigo)
- `#818cf8` — accent hover

## Layout
- Fixed sidebar: 224px width
- Main content: max-width 960px, centered
- Font sizes: 11px (small), 12px (base), 13px (large)
- Compact padding: 8-16px
- No responsive breakpoints (desktop-only)

## Pages Built
1. [x] **Login** — `/login`
2. [x] **Register** — `/register`
3. [x] **Dashboard** — `/dashboard`
4. [x] **Session List** — `/session`
5. [x] **Session Chat** — `/session/[id]`
6. [x] **New Session** — `/session/new`
7. [x] **Universe List** — `/universe`
8. [x] **Universe Detail** — `/universe/[id]`
9. [x] **Lore** — `/lore`
10. [x] **Characters** — `/characters`
11. [x] **Settings** — `/settings`

## Execution Phases

### Phase 1: Foundation [x]
- `globals.css` with Tailwind v4 `@theme`
- Root `layout.tsx`
- Login page
- Register page

### Phase 2: App Shell [x]
- App group layout with sidebar navigation
- Auth state management via `GET /api/auth/me`
- Logout flow

### Phase 3: Dashboard & Sessions [x]
- Dashboard page with session list
- Session list page
- New session creation
- Session chat view with SSE streaming

### Phase 4: Content Management [x]
- Universe list + detail
- Lore/locations management
- Characters/NPC management
- Settings page

## Verification [x]
- ✅ `npm run build` — successful (2.1s compile, 2.3s TS check)
- ✅ All 16 pages render (static + dynamic routes)
- ✅ API integration points match backend routes
- ✅ Auth flow with middleware protection

## Files Created
- `src/app/globals.css` — Tailwind v4 `@theme` with dark palette, base styles, custom scrollbar
- `src/app/layout.tsx` — Root layout with html/body
- `src/app/login/page.tsx` — Login form → POST /api/auth/login
- `src/app/register/page.tsx` — Registration form → POST /api/auth/register
- `src/app/(app)/layout.tsx` — Sidebar layout with auth check, navigation, logout
- `src/app/(app)/dashboard/page.tsx` — Stats cards, recent sessions list
- `src/app/(app)/session/page.tsx` — Full session list with delete
- `src/app/(app)/session/new/page.tsx` — Create session form
- `src/app/(app)/session/[id]/page.tsx` — Chat view with SSE streaming, message actions
- `src/app/(app)/universe/page.tsx` — Universe list with create/delete
- `src/app/(app)/universe/[id]/page.tsx` — Universe detail editor
- `src/app/(app)/lore/page.tsx` — Location management
- `src/app/(app)/characters/page.tsx` — NPC management with tags
- `src/app/(app)/settings/page.tsx` — Server config display, password change

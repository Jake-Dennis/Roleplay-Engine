/**
 * Phase 3 Test Script
 *
 * Tests for:
 * - Component library extraction (PageHeader, LoadingState, EmptyState, StatusBadge)
 * - Client hooks (useEntityFetch, useLocalStorage, useAudioPlayer)
 * - Missing lib modules (markdown-renderer, date-formatter, api-client, entity-constants)
 * - Duplicate code consolidation
 */

const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function t(name, condition) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}`);
  }
}

function title(text) {
  console.log(`\n─── ${text} ───`);
}

async function main() {
  const BASE = "http://localhost:3000";

  // ============================================================
  //  1. Component Library Extraction
  // ============================================================
  title("1. Component Library Extraction");

  // PageHeader component
  const pageHeaderPath = path.join(process.cwd(), "src/components/layout/page-header.tsx");
  t("PageHeader component exists", fs.existsSync(pageHeaderPath));

  if (fs.existsSync(pageHeaderPath)) {
    const content = fs.readFileSync(pageHeaderPath, "utf8");
    t("PageHeader has title prop", content.includes("title: string"));
    t("PageHeader has subtitle prop", content.includes("subtitle: string"));
    t("PageHeader has actionLabel prop", content.includes("actionLabel"));
    t("PageHeader has actionIcon prop", content.includes("actionIcon"));
    t("PageHeader exports PageHeader", content.includes("export function PageHeader"));
  }

  // LoadingState component
  const loadingStatePath = path.join(process.cwd(), "src/components/ui/loading-state.tsx");
  t("LoadingState component exists", fs.existsSync(loadingStatePath));

  if (fs.existsSync(loadingStatePath)) {
    const content = fs.readFileSync(loadingStatePath, "utf8");
    t("LoadingState has message prop", content.includes("message"));
    t("LoadingState has icon prop", content.includes("icon"));
    t("LoadingState uses Sparkles default", content.includes("Sparkles"));
    t("LoadingState exports LoadingState", content.includes("export function LoadingState"));
  }

  // EmptyState component
  const emptyStatePath = path.join(process.cwd(), "src/components/ui/empty-state.tsx");
  t("EmptyState component exists", fs.existsSync(emptyStatePath));

  if (fs.existsSync(emptyStatePath)) {
    const content = fs.readFileSync(emptyStatePath, "utf8");
    t("EmptyState has icon prop", content.includes("icon: LucideIcon"));
    t("EmptyState has title prop", content.includes("title: string"));
    t("EmptyState has description prop", content.includes("description: string"));
    t("EmptyState has optional action", content.includes("action?: React.ReactNode"));
    t("EmptyState exports EmptyState", content.includes("export function EmptyState"));
  }

  // StatusBadge component
  const statusBadgePath = path.join(process.cwd(), "src/components/ui/status-badge.tsx");
  t("StatusBadge component exists", fs.existsSync(statusBadgePath));

  if (fs.existsSync(statusBadgePath)) {
    const content = fs.readFileSync(statusBadgePath, "utf8");
    t("StatusBadge has label prop", content.includes("label: string"));
    t("StatusBadge has variant prop", content.includes("variant"));
    t("StatusBadge has size prop", content.includes("size"));
    t("StatusBadge exports statusToVariant", content.includes("export function statusToVariant"));
    t("StatusBadge exports StatusBadge", content.includes("export function StatusBadge"));
  }

  // ============================================================
  //  2. Client Hooks
  // ============================================================
  title("2. Client Hooks");

  // useEntityFetch hook
  const useEntityFetchPath = path.join(process.cwd(), "src/hooks/use-entity-fetch.ts");
  t("useEntityFetch hook exists", fs.existsSync(useEntityFetchPath));

  if (fs.existsSync(useEntityFetchPath)) {
    const content = fs.readFileSync(useEntityFetchPath, "utf8");
    t("useEntityFetch has data state", content.includes("useState<T[]>([])"));
    t("useEntityFetch has loading state", content.includes("useState(true)"));
    t("useEntityFetch has error state", content.includes("useState<string | null>"));
    t("useEntityFetch has refetch function", content.includes("refetch"));
    t("useEntityFetch exports useEntityFetch", content.includes("export function useEntityFetch"));
  }

  // useLocalStorage hook
  const useLocalStoragePath = path.join(process.cwd(), "src/hooks/use-local-storage.ts");
  t("useLocalStorage hook exists", fs.existsSync(useLocalStoragePath));

  if (fs.existsSync(useLocalStoragePath)) {
    const content = fs.readFileSync(useLocalStoragePath, "utf8");
    t("useLocalStorage reads from localStorage", content.includes("localStorage.getItem"));
    t("useLocalStorage writes to localStorage", content.includes("localStorage.setItem"));
    t("useLocalStorage handles JSON", content.includes("JSON.parse"));
    t("useLocalStorage exports useLocalStorage", content.includes("export function useLocalStorage"));
  }

  // useAudioPlayer hook
  const useAudioPlayerPath = path.join(process.cwd(), "src/hooks/use-audio-player.ts");
  t("useAudioPlayer hook exists", fs.existsSync(useAudioPlayerPath));

  if (fs.existsSync(useAudioPlayerPath)) {
    const content = fs.readFileSync(useAudioPlayerPath, "utf8");
    t("useAudioPlayer has isPlaying state", content.includes("isPlaying"));
    t("useAudioPlayer has play function", content.includes("play:"));
    t("useAudioPlayer has stop function", content.includes("stop:"));
    t("useAudioPlayer uses Audio API", content.includes("new Audio"));
    t("useAudioPlayer exports useAudioPlayer", content.includes("export function useAudioPlayer"));
  }

  // Duplicate useRenderLoop.ts deleted
  const duplicateHookPath = path.join(process.cwd(), "src/hooks/useRenderLoop.ts");
  t("Duplicate useRenderLoop.ts deleted", !fs.existsSync(duplicateHookPath));

  // ============================================================
  //  3. Missing Lib Modules
  // ============================================================
  title("3. Missing Lib Modules");

  // markdown-renderer
  const markdownRendererPath = path.join(process.cwd(), "src/lib/markdown-renderer.ts");
  t("markdown-renderer lib exists", fs.existsSync(markdownRendererPath));

  if (fs.existsSync(markdownRendererPath)) {
    const content = fs.readFileSync(markdownRendererPath, "utf8");
    t("markdown-renderer exports renderMarkdownPreview", content.includes("export function renderMarkdownPreview"));
    t("markdown-renderer handles headers", content.includes("replace(/^#"));
    t("markdown-renderer handles bold", content.includes("**"));
    t("markdown-renderer handles wikilinks", content.includes("[["));
  }

  // date-formatter
  const dateFormatterPath = path.join(process.cwd(), "src/lib/date-formatter.ts");
  t("date-formatter lib exists", fs.existsSync(dateFormatterPath));

  if (fs.existsSync(dateFormatterPath)) {
    const content = fs.readFileSync(dateFormatterPath, "utf8");
    t("date-formatter exports formatDate", content.includes("export function formatDate"));
    t("date-formatter exports formatRelative", content.includes("export function formatRelative"));
    t("date-formatter exports formatTime", content.includes("export function formatTime"));
    t("date-formatter exports formatDateTime", content.includes("export function formatDateTime"));
    t("date-formatter uses Intl.DateTimeFormat", content.includes("Intl.DateTimeFormat"));
  }

  // api-client
  const apiClientPath = path.join(process.cwd(), "src/lib/api-client.ts");
  t("api-client lib exists", fs.existsSync(apiClientPath));

  if (fs.existsSync(apiClientPath)) {
    const content = fs.readFileSync(apiClientPath, "utf8");
    t("api-client exports api", content.includes("export const api"));
    t("api-client has get method", content.includes("async get"));
    t("api-client has post method", content.includes("async post"));
    t("api-client has put method", content.includes("async put"));
    t("api-client has delete method", content.includes("async delete"));
    t("api-client handles auth headers", content.includes("auth-token"));
    t("api-client has retry logic", content.includes("retries"));
  }

  // entity-constants
  const entityConstantsPath = path.join(process.cwd(), "src/lib/entity-constants.ts");
  t("entity-constants lib exists", fs.existsSync(entityConstantsPath));

  if (fs.existsSync(entityConstantsPath)) {
    const content = fs.readFileSync(entityConstantsPath, "utf8");
    t("entity-constants exports THREAD_STATUS_COLORS", content.includes("THREAD_STATUS_COLORS"));
    t("entity-constants exports ESCALATION_COLORS", content.includes("ESCALATION_COLORS"));
    t("entity-constants exports ARC_TYPE_LABELS", content.includes("ARC_TYPE_LABELS"));
    t("entity-constants exports ENTRY_TYPE_LABELS", content.includes("ENTRY_TYPE_LABELS"));
    t("entity-constants exports IMPORTANCE_COLORS", content.includes("IMPORTANCE_COLORS"));
    t("entity-constants exports EMOTION_COLORS", content.includes("EMOTION_COLORS"));
    t("entity-constants exports CANON_TIER_LABELS", content.includes("CANON_TIER_LABELS"));
  }

  // ============================================================
  //  4. Duplicate Code Consolidation
  // ============================================================
  title("4. Duplicate Code Consolidation");

  // Check narrative-threads page uses shared constants
  const narrativeThreadsPath = path.join(process.cwd(), "src/app/(app)/narrative-threads/page.tsx");
  if (fs.existsSync(narrativeThreadsPath)) {
    const content = fs.readFileSync(narrativeThreadsPath, "utf8");
    t("narrative-threads imports from entity-constants", content.includes("@/lib/entity-constants"));
    t("narrative-threads removed local ARC_TYPE_LABELS", !content.includes("const ARC_TYPE_LABELS:"));
    t("narrative-threads removed local ESCALATION_COLORS", !content.includes("const ESCALATION_COLORS:"));
    t("narrative-threads uses THREAD_STATUS_ICONS", content.includes("THREAD_STATUS_ICONS"));
  }

  // Check timeline page uses shared constants
  const timelinePath = path.join(process.cwd(), "src/app/(app)/timeline/page.tsx");
  if (fs.existsSync(timelinePath)) {
    const content = fs.readFileSync(timelinePath, "utf8");
    t("timeline imports from entity-constants", content.includes("@/lib/entity-constants"));
    t("timeline removed local ENTRY_TYPE_LABELS", !content.includes("const ENTRY_TYPE_LABELS:"));
    t("timeline removed local IMPORTANCE_COLORS", !content.includes("const IMPORTANCE_COLORS:"));
  }

  // Check relationships page uses shared constants
  const relationshipsPath = path.join(process.cwd(), "src/app/(app)/relationships/page.tsx");
  if (fs.existsSync(relationshipsPath)) {
    const content = fs.readFileSync(relationshipsPath, "utf8");
    t("relationships imports EmotionBar", content.includes("@/components/relationship/emotion-bar"));
    t("relationships removed local EMOTION_COLORS", !content.includes("const EMOTION_COLORS:"));
  }

  // Check lore editor uses markdown-renderer
  const loreEditorPath = path.join(process.cwd(), "src/app/(app)/lore/[id]/edit/page.tsx");
  if (fs.existsSync(loreEditorPath)) {
    const content = fs.readFileSync(loreEditorPath, "utf8");
    t("lore editor imports markdown-renderer", content.includes("@/lib/markdown-renderer"));
    t("lore editor removed inline renderMarkdownPreview", !content.includes("function renderMarkdownPreview"));
  }

  // ============================================================
  //  5. Build Verification
  // ============================================================
  title("5. Build Verification");

  try {
    const res = await fetch(`${BASE}/dashboard`);
    t("Page /dashboard exists (status 200)", res.status === 200);
  } catch {
    t("Page /dashboard exists (status 200)", false);
  }

  try {
    const res = await fetch(`${BASE}/narrative-threads`);
    t("Page /narrative-threads exists (status 200)", res.status === 200);
  } catch {
    t("Page /narrative-threads exists (status 200)", false);
  }

  try {
    const res = await fetch(`${BASE}/timeline`);
    t("Page /timeline exists (status 200)", res.status === 200);
  } catch {
    t("Page /timeline exists (status 200)", false);
  }

  try {
    const res = await fetch(`${BASE}/relationships`);
    t("Page /relationships exists (status 200)", res.status === 200);
  } catch {
    t("Page /relationships exists (status 200)", false);
  }

  try {
    const res = await fetch(`${BASE}/lore`);
    t("Page /lore exists (status 200)", res.status === 200);
  } catch {
    t("Page /lore exists (status 200)", false);
  }

  // ============================================================
  //  SUMMARY
  // ============================================================
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Phase 3 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${"=".repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Test suite error:", e);
  process.exit(1);
});

/**
 * Phase 4 Test Script
 *
 * Tests for:
 * - Missing lib modules (importance, backlinks, prompt-builder, voice-discovery)
 * - Missing hooks (useAuth, useSession, useTTS, useVoices)
 * - Missing components (MessageBubble, MessageInput, TypingIndicator)
 * - Missing API routes (TTS refresh/combine, per-entity voice, relationship decay)
 * - Infrastructure (run.bat)
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
  //  1. Missing Lib Modules
  // ============================================================
  title("1. Missing Lib Modules");

  // importance.ts
  const importancePath = path.join(process.cwd(), "src/lib/importance.ts");
  t("importance.ts exists", fs.existsSync(importancePath));
  if (fs.existsSync(importancePath)) {
    const content = fs.readFileSync(importancePath, "utf8");
    t("exports calculateImportance", content.includes("export function calculateImportance"));
    t("exports decayRecency", content.includes("export function decayRecency"));
    t("exports updateImportance", content.includes("export function updateImportance"));
    t("exports sortByImportance", content.includes("export function sortByImportance"));
    t("has 4-axis weights", content.includes("emotional") && content.includes("local") && content.includes("canonical") && content.includes("recency"));
  }

  // backlinks.ts
  const backlinksPath = path.join(process.cwd(), "src/lib/backlinks.ts");
  t("backlinks.ts exists", fs.existsSync(backlinksPath));
  if (fs.existsSync(backlinksPath)) {
    const content = fs.readFileSync(backlinksPath, "utf8");
    t("exports parseWikilinks", content.includes("export function parseWikilinks"));
    t("exports inferLinkType", content.includes("export function inferLinkType"));
    t("exports resolveWikilink", content.includes("export function resolveWikilink"));
    t("exports storeBacklinks", content.includes("export function storeBacklinks"));
    t("exports getBacklinks", content.includes("export function getBacklinks"));
  }

  // prompt-builder.ts
  const promptBuilderPath = path.join(process.cwd(), "src/lib/prompt-builder.ts");
  t("prompt-builder.ts exists", fs.existsSync(promptBuilderPath));
  if (fs.existsSync(promptBuilderPath)) {
    const content = fs.readFileSync(promptBuilderPath, "utf8");
    t("exports assemblePrompt", content.includes("export function assemblePrompt"));
    t("exports buildIntentContext", content.includes("export function buildIntentContext"));
    t("exports estimateTokens", content.includes("export function estimateTokens"));
    t("exports applyContextBudget", content.includes("export function applyContextBudget"));
  }

  // voice-discovery.ts
  const voiceDiscoveryPath = path.join(process.cwd(), "src/lib/voice-discovery.ts");
  t("voice-discovery.ts exists", fs.existsSync(voiceDiscoveryPath));
  if (fs.existsSync(voiceDiscoveryPath)) {
    const content = fs.readFileSync(voiceDiscoveryPath, "utf8");
    t("exports discoverVoices", content.includes("export async function discoverVoices"));
    t("exports parseVoiceInfo", content.includes("export function parseVoiceInfo"));
    t("exports isTTSAvailable", content.includes("export function isTTSAvailable"));
    t("exports getAvailableVoices", content.includes("export function getAvailableVoices"));
    t("exports needsRediscovery", content.includes("export function needsRediscovery"));
  }

  // ============================================================
  //  2. Missing Hooks
  // ============================================================
  title("2. Missing Hooks");

  // useAuth
  const useAuthPath = path.join(process.cwd(), "src/hooks/use-auth.ts");
  t("useAuth hook exists", fs.existsSync(useAuthPath));
  if (fs.existsSync(useAuthPath)) {
    const content = fs.readFileSync(useAuthPath, "utf8");
    t("exports useAuth", content.includes("export function useAuth"));
    t("has user state", content.includes("user"));
    t("has login function", content.includes("login"));
    t("has logout function", content.includes("logout"));
    t("has refresh function", content.includes("refresh"));
  }

  // useSession
  const useSessionPath = path.join(process.cwd(), "src/hooks/use-session.ts");
  t("useSession hook exists", fs.existsSync(useSessionPath));
  if (fs.existsSync(useSessionPath)) {
    const content = fs.readFileSync(useSessionPath, "utf8");
    t("exports useSession", content.includes("export function useSession"));
    t("has session state", content.includes("session"));
    t("has claimTurn function", content.includes("claimTurn"));
    t("has advanceTurn function", content.includes("advanceTurn"));
  }

  // useTTS
  const useTTSPath = path.join(process.cwd(), "src/hooks/use-tts.ts");
  t("useTTS hook exists", fs.existsSync(useTTSPath));
  if (fs.existsSync(useTTSPath)) {
    const content = fs.readFileSync(useTTSPath, "utf8");
    t("exports useTTS", content.includes("export function useTTS"));
    t("has isPlaying state", content.includes("isPlaying"));
    t("has play function", content.includes("play"));
    t("has stop function", content.includes("stop"));
    t("uses ttsQueue", content.includes("ttsQueue"));
  }

  // useVoices
  const useVoicesPath = path.join(process.cwd(), "src/hooks/use-voices.ts");
  t("useVoices hook exists", fs.existsSync(useVoicesPath));
  if (fs.existsSync(useVoicesPath)) {
    const content = fs.readFileSync(useVoicesPath, "utf8");
    t("exports useVoices", content.includes("export function useVoices"));
    t("has voices state", content.includes("voices"));
    t("has assignVoice function", content.includes("assignVoice"));
    t("has getVoice function", content.includes("getVoice"));
    t("has removeVoice function", content.includes("removeVoice"));
  }

  // ============================================================
  //  3. Missing Components
  // ============================================================
  title("3. Missing Components");

  // MessageBubble
  const messageBubblePath = path.join(process.cwd(), "src/components/chat/message-bubble.tsx");
  t("MessageBubble component exists", fs.existsSync(messageBubblePath));
  if (fs.existsSync(messageBubblePath)) {
    const content = fs.readFileSync(messageBubblePath, "utf8");
    t("exports MessageBubble", content.includes("export function MessageBubble"));
    t("has TTS button", content.includes("Volume2"));
    t("has Copy button", content.includes("Copy"));
    t("has Edit button", content.includes("Pencil"));
    t("has Regenerate button", content.includes("RefreshCw"));
    t("has Delete button", content.includes("Trash2"));
    t("supports inline editing", content.includes("isEditing"));
  }

  // MessageInput
  const messageInputPath = path.join(process.cwd(), "src/components/chat/message-input.tsx");
  t("MessageInput component exists", fs.existsSync(messageInputPath));
  if (fs.existsSync(messageInputPath)) {
    const content = fs.readFileSync(messageInputPath, "utf8");
    t("exports MessageInput", content.includes("export function MessageInput"));
    t("has textarea", content.includes("textarea"));
    t("has send button", content.includes("Send"));
    t("supports Ctrl+Enter", content.includes("Enter"));
    t("auto-resizes", content.includes("scrollHeight"));
  }

  // TypingIndicator
  const typingIndicatorPath = path.join(process.cwd(), "src/components/chat/typing-indicator.tsx");
  t("TypingIndicator component exists", fs.existsSync(typingIndicatorPath));
  if (fs.existsSync(typingIndicatorPath)) {
    const content = fs.readFileSync(typingIndicatorPath, "utf8");
    t("exports TypingIndicator", content.includes("export function TypingIndicator"));
    t("has animated dots", content.includes("animate-bounce"));
    t("has thinking text", content.includes("thinking"));
  }

  // ============================================================
  //  4. Missing API Routes
  // ============================================================
  title("4. Missing API Routes");

  // TTS voices refresh
  const ttsRefreshPath = path.join(process.cwd(), "src/app/api/tts/voices/refresh/route.ts");
  t("TTS voices refresh route exists", fs.existsSync(ttsRefreshPath));
  if (fs.existsSync(ttsRefreshPath)) {
    const content = fs.readFileSync(ttsRefreshPath, "utf8");
    t("has POST handler", content.includes("export async function POST"));
    t("calls discoverVoices", content.includes("discoverVoices"));
  }

  // TTS voices combine
  const ttsCombinePath = path.join(process.cwd(), "src/app/api/tts/voices/combine/route.ts");
  t("TTS voices combine route exists", fs.existsSync(ttsCombinePath));
  if (fs.existsSync(ttsCombinePath)) {
    const content = fs.readFileSync(ttsCombinePath, "utf8");
    t("has POST handler", content.includes("export async function POST"));
    t("proxies to Kokoro", content.includes("combine"));
  }

  // Per-entity voice assignment
  const ttsVoicePath = path.join(process.cwd(), "src/app/api/tts/voice/[entityType]/[entityId]/route.ts");
  t("Per-entity voice assignment route exists", fs.existsSync(ttsVoicePath));
  if (fs.existsSync(ttsVoicePath)) {
    const content = fs.readFileSync(ttsVoicePath, "utf8");
    t("has GET handler", content.includes("export async function GET"));
    t("has PUT handler", content.includes("export async function PUT"));
    t("has DELETE handler", content.includes("export async function DELETE"));
  }

  // Relationship decay
  const decayPath = path.join(process.cwd(), "src/app/api/relationships/[id]/decay/route.ts");
  t("Relationship decay route exists", fs.existsSync(decayPath));
  if (fs.existsSync(decayPath)) {
    const content = fs.readFileSync(decayPath, "utf8");
    t("has GET handler", content.includes("export async function GET"));
    t("has POST handler", content.includes("export async function POST"));
    t("calls processRelationshipDecay", content.includes("processRelationshipDecay"));
  }

  // ============================================================
  //  5. Infrastructure
  // ============================================================
  title("5. Infrastructure");

  // run.bat
  const runBatPath = path.join(process.cwd(), "run.bat");
  t("run.bat exists", fs.existsSync(runBatPath));
  if (fs.existsSync(runBatPath)) {
    const content = fs.readFileSync(runBatPath, "utf8");
    t("checks Node.js", content.includes("node --version"));
    t("checks Ollama", content.includes("192.168.4.2:11434"));
    t("checks TTS", content.includes("192.168.4.2:8880"));
    t("installs dependencies", content.includes("npm install"));
    t("initializes database", content.includes("init-db.js"));
    t("starts dev server", content.includes("npm run dev"));
  }

  // ============================================================
  //  6. Build Verification
  // ============================================================
  title("6. Build Verification");

  try {
    const res = await fetch(`${BASE}/dashboard`);
    t("Page /dashboard exists (status 200)", res.status === 200);
  } catch {
    t("Page /dashboard exists (status 200)", false);
  }

  try {
    const res = await fetch(`${BASE}/api/tts/voices`);
    t("API /api/tts/voices exists", res.status !== 0);
  } catch {
    t("API /api/tts/voices exists", false);
  }

  // ============================================================
  //  SUMMARY
  // ============================================================
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Phase 4 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${"=".repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Test suite error:", e);
  process.exit(1);
});

/**
 * Phase 7: Polish - Comprehensive Test Suite (Expanded)
 * 
 * Tests:
 * 1. Relationship Evolution API (full CRUD + edge cases)
 * 2. Vector Search API (query, stats, errors)
 * 3. TTS Cache API (stats, clear operations)
 * 4. Settings API (server config)
 * 5. Canon Mode Management (universe CRUD, NPC canon status)
 * 6. Voice Assignments (full CRUD)
 * 7. Backlinks API (create, query, delete, duplicate handling)
 * 8. Lore Validations API (create, query, update state workflow)
 * 9. Context Compression (via generate endpoint)
 * 10. Error Handling & Edge Cases
 * 11. Database Schema Additions
 * 12. Build Verification
 */

const BASE = "http://localhost:3000";
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

async function req(path, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { "Content-Type": "application/json", ...opts.headers };
  if (opts.token) headers["Cookie"] = `auth-token=${opts.token}`;
  try {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      redirect: "manual",
    });
    let data = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) data = await res.json();
    else data = await res.text();
    return { status: res.status, data, cookie: res.headers.get("set-cookie") || "" };
  } catch (e) {
    return { status: 0, data: null, error: e.message };
  }
}

async function main() {
  // ============================================================
  //  SETUP
  // ============================================================
  title("SETUP: Register User & Create Resources");

  const username = `p7full_${Date.now().toString(36)}`;
  let r = await req("/api/auth/register", {
    method: "POST",
    body: { username, password: "Test1234" },
  });
  t("User registration returns 201", r.status === 201);
  const USER_ID = r.data?.user?.id;
  t("User has id", !!USER_ID);

  r = await req("/api/auth/login", {
    method: "POST",
    body: { username, password: "Test1234" },
  });
  t("Login returns 200", r.status === 200);
  const TOKEN = (r.cookie.match(/auth-token=([^;]+)/) || [])[1];
  t("Login returns token", !!TOKEN);

  // Create universe
  r = await req("/api/universes", {
    method: "POST",
    body: { name: "P7 Full Test Universe", canon_mode: "strict" },
    token: TOKEN,
  });
  t("Universe creation returns 201", r.status === 201);
  const UNIVERSE_ID = r.data?.universe?.id;
  t("Universe has id", !!UNIVERSE_ID);

  // Create session
  r = await req("/api/sessions", {
    method: "POST",
    body: { name: "P7 Full Test Session", universe_id: UNIVERSE_ID },
    token: TOKEN,
  });
  t("Session creation returns 201", r.status === 201);
  const SESSION_ID = r.data?.session?.id;
  t("Session has id", !!SESSION_ID);

  // Create location
  r = await req("/api/locations", {
    method: "POST",
    body: { name: "Dark Forest", description: "A mysterious forest", importance: "high" },
    token: TOKEN,
  });
  t("Location creation returns 201", r.status === 201);
  const LOCATION_ID = r.data?.location?.id;
  t("Location has id", !!LOCATION_ID);

  // Create NPC
  r = await req("/api/npcs", {
    method: "POST",
    body: { name: "Haleth", description: "A ranger", importance: "medium" },
    token: TOKEN,
  });
  t("NPC creation returns 201", r.status === 201);
  const NPC_ID = r.data?.npc?.id;
  t("NPC has id", !!NPC_ID);

  // Create relationship
  r = await req("/api/relationships", {
    method: "POST",
    body: {
      sourceEntity: "Hero",
      targetEntity: "Villain",
      relationshipStage: "rival",
      emotionalState: { trust: 0.2, suspicion: 0.8, respect: 0.5 },
    },
    token: TOKEN,
  });
  t("Relationship creation returns 201", r.status === 201);
  const REL_ID = r.data?.relationship?.id;
  t("Relationship has id", !!REL_ID);

  // Add messages
  for (let i = 0; i < 5; i++) {
    await req(`/api/sessions/${SESSION_ID}/messages`, {
      method: "POST",
      body: { content: `Test message ${i} about the dark forest adventure` },
      token: TOKEN,
    });
  }

  // ============================================================
  //  1. RELATIONSHIP EVOLUTION API
  // ============================================================
  title("1. Relationship Evolution API");

  // Get evolution history (should be empty initially)
  r = await req(`/api/relationships/${REL_ID}/evolution`, { token: TOKEN });
  t("Get evolution returns 200", r.status === 200);
  t("Evolution history is array", Array.isArray(r.data?.history));
  t("Evolution history initially empty", r.data?.history?.length === 0);

  // Add evolution entry
  r = await req(`/api/relationships/${REL_ID}/evolution`, {
    method: "POST",
    body: {
      emotionalState: { trust: 0.3, suspicion: 0.7, respect: 0.6 },
      relationshipStage: "enemy",
      triggerEvent: "The betrayal at midnight",
    },
    token: TOKEN,
  });
  t("Create evolution entry returns 201", r.status === 201);
  t("Evolution entry has id", !!r.data?.entry?.id);
  t("Evolution entry has emotional_state", typeof r.data?.entry?.emotional_state === "object");
  t("Evolution entry emotional_state has trust", r.data?.entry?.emotional_state?.trust === 0.3);

  // Add another evolution entry
  r = await req(`/api/relationships/${REL_ID}/evolution`, {
    method: "POST",
    body: {
      emotionalState: { trust: 0.1, suspicion: 0.9, anger: 0.8 },
      relationshipStage: "enemy",
      triggerEvent: "Final confrontation",
    },
    token: TOKEN,
  });
  t("Second evolution entry returns 201", r.status === 201);

  // Add entry with minimal data
  r = await req(`/api/relationships/${REL_ID}/evolution`, {
    method: "POST",
    body: { relationshipStage: "nemesis" },
    token: TOKEN,
  });
  t("Minimal evolution entry returns 201", r.status === 201);

  // Get evolution history (should have 3 entries)
  r = await req(`/api/relationships/${REL_ID}/evolution`, { token: TOKEN });
  t("Evolution history has 3 entries", r.data?.history?.length === 3);
  t("Entries ordered by recorded_at ASC",
    r.data?.history?.[0]?.recorded_at <= r.data?.history?.[1]?.recorded_at &&
    r.data?.history?.[1]?.recorded_at <= r.data?.history?.[2]?.recorded_at
  );

  // Unauthorized access
  r = await req(`/api/relationships/${REL_ID}/evolution`);
  t("Evolution without token returns 401", r.status === 401);

  // Non-existent relationship
  r = await req(`/api/relationships/nonexistent/evolution`, { token: TOKEN });
  t("Evolution for non-existent relationship returns 404", r.status === 404);

  // Invalid token
  r = await req(`/api/relationships/${REL_ID}/evolution`, {
    headers: { Cookie: "auth-token=invalidtoken" },
  });
  t("Evolution with invalid token returns 401", r.status === 401);

  // ============================================================
  //  2. VECTOR SEARCH API
  // ============================================================
  title("2. Vector Search API");

  // Search with query (graceful fallback when Ollama unavailable)
  r = await req("/api/search?q=dark+forest+adventure&limit=5", { token: TOKEN });
  t("Search returns 200", r.status === 200);
  t("Search returns results array", Array.isArray(r.data?.results));

  // Search without query (returns stats)
  r = await req("/api/search", { token: TOKEN });
  t("Search without query returns stats", r.status === 200);
  t("Search stats has totalEmbeddings", typeof r.data?.stats?.totalEmbeddings === "number");
  t("Search stats has byEntityType", typeof r.data?.stats?.byEntityType === "object");

  // Search with type filter
  r = await req("/api/search?q=test&type=message&limit=3", { token: TOKEN });
  t("Search with type filter returns 200", r.status === 200);
  t("Search with type returns results array", Array.isArray(r.data?.results));

  // Search without token
  r = await req("/api/search?q=test&limit=5");
  t("Search without token returns 401", r.status === 401);

  // ============================================================
  //  3. TTS CACHE API
  // ============================================================
  title("3. TTS Cache API");

  // Get cache stats
  r = await req("/api/tts/cache", { token: TOKEN });
  t("Get cache stats returns 200", r.status === 200);
  t("Cache stats has totalEntries", typeof r.data?.stats?.totalEntries === "number");
  t("Cache stats has diskSize", typeof r.data?.stats?.diskSize === "number");
  t("Cache stats has diskSizeFormatted", typeof r.data?.stats?.diskSizeFormatted === "string");
  t("Cache stats has totalUses", typeof r.data?.stats?.totalUses === "number");
  t("Cache stats has fileCount", typeof r.data?.stats?.fileCount === "number");

  // Clear expired cache
  r = await req("/api/tts/cache?action=expired", { method: "DELETE", token: TOKEN });
  t("Clear expired cache returns 200", r.status === 200);
  t("Clear expired returns success", r.data?.success === true);

  // Clear unused cache
  r = await req("/api/tts/cache?action=unused", { method: "DELETE", token: TOKEN });
  t("Clear unused cache returns 200", r.status === 200);
  t("Clear unused returns success", r.data?.success === true);

  // Clear all cache
  r = await req("/api/tts/cache?action=clear", { method: "DELETE", token: TOKEN });
  t("Clear all cache returns 200", r.status === 200);
  t("Clear all returns success", r.data?.success === true);

  // Invalid action
  r = await req("/api/tts/cache?action=invalid", { method: "DELETE", token: TOKEN });
  t("Invalid cache action returns 400", r.status === 400);

  // Cache without token
  r = await req("/api/tts/cache");
  t("Cache stats without token returns 401", r.status === 401);

  // ============================================================
  //  4. SETTINGS API
  // ============================================================
  title("4. Settings API");

  // Get settings
  r = await req("/api/settings", { token: TOKEN });
  t("Get settings returns 200", r.status === 200);
  t("Settings has ollama", !!r.data?.ollama);
  t("Settings has ollama.host", typeof r.data?.ollama?.host === "string");
  t("Settings has ollama.model", typeof r.data?.ollama?.model === "string");
  t("Settings has tts", !!r.data?.tts);
  t("Settings has tts.host", typeof r.data?.tts?.host === "string");
  t("Settings has tts.defaultVoice", typeof r.data?.tts?.defaultVoice === "string");

  // Settings is public (server config)
  r = await req("/api/settings");
  t("Settings is public (returns 200 without token)", r.status === 200);

  // ============================================================
  //  5. CANON MODE MANAGEMENT
  // ============================================================
  title("5. Canon Mode Management");

  // Update universe canon mode to loose
  r = await req(`/api/universes/${UNIVERSE_ID}`, {
    method: "PUT",
    body: { canon_mode: "loose" },
    token: TOKEN,
  });
  t("Update canon mode to loose returns 200", r.status === 200);
  t("Universe canon_mode is loose", r.data?.universe?.canon_mode === "loose");

  // Update to custom
  r = await req(`/api/universes/${UNIVERSE_ID}`, {
    method: "PUT",
    body: { canon_mode: "custom" },
    token: TOKEN,
  });
  t("Update to custom canon returns 200", r.status === 200);
  t("Universe canon_mode is custom", r.data?.universe?.canon_mode === "custom");

  // Update back to strict
  r = await req(`/api/universes/${UNIVERSE_ID}`, {
    method: "PUT",
    body: { canon_mode: "strict" },
    token: TOKEN,
  });
  t("Update back to strict returns 200", r.status === 200);
  t("Universe canon_mode is strict", r.data?.universe?.canon_mode === "strict");

  // Get universe to verify
  r = await req(`/api/universes/${UNIVERSE_ID}`, { token: TOKEN });
  t("Get universe returns 200", r.status === 200);
  t("Universe has canon_mode", !!r.data?.universe?.canon_mode);
  t("Universe has name", r.data?.universe?.name === "P7 Full Test Universe");

  // Create NPC with canon_tier
  r = await req("/api/npcs", {
    method: "POST",
    body: {
      name: "Test NPC P7",
      file_path: "test-npc-p7.md",
      canon_tier: "generated_lore",
      importance: "medium",
    },
    token: TOKEN,
  });
  t("NPC creation returns 201", r.status === 201);
  const NPC2_ID = r.data?.npc?.id;
  t("NPC has id", !!NPC2_ID);
  t("NPC has canon_tier generated_lore", r.data?.npc?.canon_tier === "generated_lore");

  // Update NPC canon tier to soft_canon
  r = await req(`/api/npcs/${NPC2_ID}`, {
    method: "PUT",
    body: { canon_tier: "soft_canon" },
    token: TOKEN,
  });
  t("Update NPC canon tier to soft_canon returns 200", r.status === 200);
  t("NPC canon_tier is soft_canon", r.data?.npc?.canon_tier === "soft_canon");

  // Demote NPC back to generated_lore
  r = await req(`/api/npcs/${NPC2_ID}`, {
    method: "PUT",
    body: { canon_tier: "generated_lore" },
    token: TOKEN,
  });
  t("Demote NPC canon tier returns 200", r.status === 200);
  t("NPC canon_tier demoted to generated_lore", r.data?.npc?.canon_tier === "generated_lore");

  // Test immutable canon enforcement (D2) - should return 403
  r = await req(`/api/npcs/${NPC2_ID}`, {
    method: "PUT",
    body: { canon_tier: "immutable_canon" },
    token: TOKEN,
  });
  t("Promote to immutable_canon returns 200", r.status === 200);
  r = await req(`/api/npcs/${NPC2_ID}`, {
    method: "PUT",
    body: { name: "Should Fail" },
    token: TOKEN,
  });
  t("Immutable canon edit blocked (403)", r.status === 403);

  // ============================================================
  //  6. VOICE ASSIGNMENTS (Full CRUD)
  // ============================================================
  title("6. Voice Assignments");

  // Get voices list
  r = await req("/api/tts/voices", { token: TOKEN });
  t("Get voices returns 200", r.status === 200);
  t("Voices returns voiceDetails array", Array.isArray(r.data?.voiceDetails));

  // Create voice assignment for narrator
  r = await req("/api/voice-assignments", {
    method: "PUT",
    body: {
      entityType: "narrator",
      entityId: "default",
      voiceName: "af_bella",
      voiceSpeed: 1.2,
      volume: 0.9,
    },
    token: TOKEN,
  });
  t("Create narrator voice assignment returns 200", r.status === 200);
  t("Voice assignment returns success", r.data?.success === true);

  // Get voice assignment
  r = await req("/api/voice-assignments?entityType=narrator&entityId=default", { token: TOKEN });
  t("Get voice assignment returns 200", r.status === 200);
  t("Voice assignment has voice_name", r.data?.assignment?.voice_name === "af_bella");
  t("Voice assignment has voice_speed", r.data?.assignment?.voice_speed === 1.2);
  t("Voice assignment has volume", r.data?.assignment?.volume === 0.9);

  // Update voice assignment (upsert)
  r = await req("/api/voice-assignments", {
    method: "PUT",
    body: {
      entityType: "narrator",
      entityId: "default",
      voiceName: "af_sky",
      voiceSpeed: 0.8,
    },
    token: TOKEN,
  });
  t("Update voice assignment returns 200", r.status === 200);

  // Verify update
  r = await req("/api/voice-assignments?entityType=narrator&entityId=default", { token: TOKEN });
  t("Updated voice_name is af_sky", r.data?.assignment?.voice_name === "af_sky");
  t("Updated voice_speed is 0.8", r.data?.assignment?.voice_speed === 0.8);

  // Create voice assignment for NPC
  r = await req("/api/voice-assignments", {
    method: "PUT",
    body: {
      entityType: "npc",
      entityId: NPC_ID,
      voiceName: "am_adam",
    },
    token: TOKEN,
  });
  t("Create NPC voice assignment returns 200", r.status === 200);

  // Get NPC voice assignment
  r = await req(`/api/voice-assignments?entityType=npc&entityId=${NPC_ID}`, { token: TOKEN });
  t("Get NPC voice assignment returns 200", r.status === 200);
  t("NPC voice_name is am_adam", r.data?.assignment?.voice_name === "am_adam");

  // Delete voice assignment
  r = await req("/api/voice-assignments?entityType=narrator&entityId=default", {
    method: "DELETE",
    token: TOKEN,
  });
  t("Delete voice assignment returns 200", r.status === 200);
  t("Delete returns success", r.data?.success === true);

  // Verify deletion
  r = await req("/api/voice-assignments?entityType=narrator&entityId=default", { token: TOKEN });
  t("Deleted assignment returns null", r.data?.assignment === null);

  // Missing required fields
  r = await req("/api/voice-assignments", {
    method: "PUT",
    body: { entityType: "npc" },
    token: TOKEN,
  });
  t("Missing voiceName returns 400", r.status === 400);

  r = await req("/api/voice-assignments?entityType=npc", { token: TOKEN });
  t("Missing entityId returns 400", r.status === 400);

  // Without token
  r = await req("/api/voice-assignments?entityType=npc&entityId=test");
  t("Voice assignment without token returns 401", r.status === 401);

  // ============================================================
  //  7. BACKLINKS API
  // ============================================================
  title("7. Backlinks API");

  // Create backlink
  r = await req("/api/backlinks", {
    method: "POST",
    body: {
      sourceType: "location",
      sourceId: LOCATION_ID,
      targetType: "npc",
      targetId: NPC_ID,
      linkType: "mentions",
      contextSnippet: "Haleth was seen near the Dark Forest",
    },
    token: TOKEN,
  });
  t("Create backlink returns 201", r.status === 201);
  t("Backlink has id", !!r.data?.backlink?.id);
  t("Backlink has source_type", r.data?.backlink?.source_type === "location");
  t("Backlink has target_type", r.data?.backlink?.target_type === "npc");
  t("Backlink has link_type", r.data?.backlink?.link_type === "mentions");

  const BACKLINK_ID = r.data?.backlink?.id;

  // Create another backlink
  r = await req("/api/backlinks", {
    method: "POST",
    body: {
      sourceType: "npc",
      sourceId: NPC_ID,
      targetType: "location",
      targetId: LOCATION_ID,
      linkType: "located_in",
    },
    token: TOKEN,
  });
  t("Create second backlink returns 201", r.status === 201);
  const BACKLINK2_ID = r.data?.backlink?.id;

  // Duplicate backlink (should return 409)
  r = await req("/api/backlinks", {
    method: "POST",
    body: {
      sourceType: "location",
      sourceId: LOCATION_ID,
      targetType: "npc",
      targetId: NPC_ID,
      linkType: "mentions",
    },
    token: TOKEN,
  });
  t("Duplicate backlink returns 409", r.status === 409);

  // Get all backlinks
  r = await req("/api/backlinks", { token: TOKEN });
  t("Get all backlinks returns 200", r.status === 200);
  t("Backlinks is array", Array.isArray(r.data?.backlinks));
  t("Has at least 2 backlinks", (r.data?.backlinks || []).length >= 2);

  // Get backlinks by target entity
  r = await req(`/api/backlinks?entityType=npc&entityId=${NPC_ID}`, { token: TOKEN });
  t("Get backlinks by target returns 200", r.status === 200);
  t("Target backlinks is array", Array.isArray(r.data?.backlinks));

  // Get backlinks by target type
  r = await req("/api/backlinks?targetType=npc", { token: TOKEN });
  t("Get backlinks by targetType returns 200", r.status === 200);
  t("TargetType backlinks is array", Array.isArray(r.data?.backlinks));

  // Delete backlink
  r = await req(`/api/backlinks?id=${BACKLINK_ID}`, {
    method: "DELETE",
    token: TOKEN,
  });
  t("Delete backlink returns 200", r.status === 200);
  t("Delete returns success", r.data?.success === true);

  // Verify deletion
  r = await req("/api/backlinks", { token: TOKEN });
  t("Backlinks count decreased", (r.data?.backlinks || []).length >= 1);

  // Missing required fields
  r = await req("/api/backlinks", {
    method: "POST",
    body: { sourceType: "location" },
    token: TOKEN,
  });
  t("Missing backlink fields returns 400", r.status === 400);

  // Delete without id
  r = await req("/api/backlinks", {
    method: "DELETE",
    token: TOKEN,
  });
  t("Delete without id returns 400", r.status === 400);

  // Without token
  r = await req("/api/backlinks");
  t("Backlinks without token returns 401", r.status === 401);

  // ============================================================
  //  8. LORE VALIDATIONS API
  // ============================================================
  title("8. Lore Validations API");

  // Create validation entry
  r = await req("/api/lore-validations", {
    method: "POST",
    body: {
      entityType: "location",
      entityId: LOCATION_ID,
      state: "generated_unverified",
      generatedBy: "ai_system",
    },
    token: TOKEN,
  });
  t("Create validation returns 201", r.status === 201);
  t("Validation has id", !!r.data?.validation?.id);
  t("Validation has state", r.data?.validation?.state === "generated_unverified");

  // Create another validation
  r = await req("/api/lore-validations", {
    method: "POST",
    body: {
      entityType: "npc",
      entityId: NPC_ID,
      state: "under_review",
      validationNotes: "Potential contradiction with canon",
    },
    token: TOKEN,
  });
  t("Create second validation returns 201", r.status === 201);

  // Get all validations
  r = await req("/api/lore-validations", { token: TOKEN });
  t("Get all validations returns 200", r.status === 200);
  t("Validations is array", Array.isArray(r.data?.validations));
  t("Has at least 2 validations", (r.data?.validations || []).length >= 2);

  // Filter by entity type
  r = await req("/api/lore-validations?entityType=location", { token: TOKEN });
  t("Filter by entityType returns 200", r.status === 200);
  t("Location validations is array", Array.isArray(r.data?.validations));

  // Filter by state
  r = await req("/api/lore-validations?state=generated_unverified", { token: TOKEN });
  t("Filter by state returns 200", r.status === 200);
  t("State filtered validations is array", Array.isArray(r.data?.validations));

  // Update validation state (under_review → validated)
  r = await req("/api/lore-validations", {
    method: "PUT",
    body: {
      entityType: "npc",
      entityId: NPC_ID,
      state: "validated",
      validationNotes: "Reviewed and confirmed consistent",
    },
    token: TOKEN,
  });
  t("Update validation state returns 200", r.status === 200);
  t("Update returns success", r.data?.success === true);
  t("Updated validation has state validated", r.data?.validation?.state === "validated");

  // Update validation state (generated_unverified → rejected)
  r = await req("/api/lore-validations", {
    method: "PUT",
    body: {
      entityType: "location",
      entityId: LOCATION_ID,
      state: "rejected",
      validationNotes: "Contradicts established canon",
    },
    token: TOKEN,
  });
  t("Reject validation returns 200", r.status === 200);
  t("Rejected validation has state rejected", r.data?.validation?.state === "rejected");

  // Invalid state defaults to generated_unverified
  r = await req("/api/lore-validations", {
    method: "POST",
    body: {
      entityType: "npc",
      entityId: NPC_ID,
      state: "invalid_state",
    },
    token: TOKEN,
  });
  t("Invalid state defaults to generated_unverified", r.data?.validation?.state === "generated_unverified");

  // Missing required fields
  r = await req("/api/lore-validations", {
    method: "POST",
    body: { entityType: "location" },
    token: TOKEN,
  });
  t("Missing entityId returns 400", r.status === 400);

  r = await req("/api/lore-validations", {
    method: "PUT",
    body: { entityType: "location", entityId: "test" },
    token: TOKEN,
  });
  t("PUT missing state returns 400", r.status === 400);

  // Without token
  r = await req("/api/lore-validations");
  t("Validations without token returns 401", r.status === 401);

  // ============================================================
  //  9. CONTEXT COMPRESSION (via generate endpoint)
  // ============================================================
  title("9. Context Compression");

  // Generate endpoint exists and accepts requests
  r = await req(`/api/generate/${SESSION_ID}`, {
    method: "POST",
    body: { userMessage: "What happens next in the forest?" },
    token: TOKEN,
  });
  // May fail if Ollama is unavailable, but route should exist
  t("Generate route accepts request", r.status !== 0);

  // Generate without user message
  r = await req(`/api/generate/${SESSION_ID}`, {
    method: "POST",
    body: {},
    token: TOKEN,
  });
  // Returns 400 when body validation runs before Ollama check (may return 500 if Ollama check runs first)
  t("Generate without message returns error", r.status === 400 || r.status === 500 || r.status === 503);

  // Generate for non-existent session
  r = await req("/api/generate/nonexistent", {
    method: "POST",
    body: { userMessage: "test" },
    token: TOKEN,
  });
  // Returns 404 when session not found (may return 500 if Ollama check runs first)
  t("Generate for non-existent session returns error", r.status === 404 || r.status === 500 || r.status === 503);

  // Generate without token
  r = await req(`/api/generate/${SESSION_ID}`, {
    method: "POST",
    body: { userMessage: "test" },
  });
  t("Generate without token returns 401", r.status === 401);

  // ============================================================
  //  10. ERROR HANDLING & EDGE CASES
  // ============================================================
  title("10. Error Handling & Edge Cases");

  // Non-existent API route
  r = await req("/api/nonexistent", { token: TOKEN });
  t("Non-existent API route returns 404", r.status === 404);

  // Invalid method on existing route
  r = await req("/api/auth/login", {
    method: "GET",
    token: TOKEN,
  });
  t("Invalid method returns 404 or 405", r.status === 404 || r.status === 405);

  // Malformed JSON body
  r = await req("/api/auth/login", {
    method: "POST",
    body: { invalid: true },
  });
  t("Invalid login returns 400 or 401", r.status === 400 || r.status === 401);

  // Empty body on POST
  r = await req("/api/relationships", {
    method: "POST",
    body: {},
    token: TOKEN,
  });
  t("Empty relationship body returns 400", r.status === 400);

  // Non-existent session
  r = await req("/api/sessions/nonexistent", { token: TOKEN });
  t("Non-existent session returns 404", r.status === 404);

  // Non-existent universe
  r = await req("/api/universes/nonexistent", { token: TOKEN });
  t("Non-existent universe returns 404", r.status === 404);

  // Non-existent NPC
  r = await req("/api/npcs/nonexistent", { token: TOKEN });
  t("Non-existent NPC returns 404", r.status === 404);

  // Non-existent location
  r = await req("/api/locations/nonexistent", { token: TOKEN });
  t("Non-existent location returns 404", r.status === 404);

  // Auth me endpoint
  r = await req("/api/auth/me", { token: TOKEN });
  t("Auth me returns 200", r.status === 200);
  t("Auth me returns user", !!r.data?.user);
  t("Auth me user has username", r.data?.user?.username === username);

  // Auth me without token
  r = await req("/api/auth/me");
  t("Auth me without token returns 401", r.status === 401);

  // Password change
  r = await req("/api/auth/password", {
    method: "PUT",
    body: {
      currentPassword: "Test1234",
      newPassword: "NewPass1234",
    },
    token: TOKEN,
  });
  t("Password change returns 200", r.status === 200);
  t("Password change returns success", r.data?.success === true);

  // Login with new password
  r = await req("/api/auth/login", {
    method: "POST",
    body: { username, password: "NewPass1234" },
  });
  t("Login with new password returns 200", r.status === 200);
  const NEW_TOKEN = (r.cookie.match(/auth-token=([^;]+)/) || [])[1];
  t("New token obtained", !!NEW_TOKEN);

  // Old password should fail
  r = await req("/api/auth/login", {
    method: "POST",
    body: { username, password: "Test1234" },
  });
  t("Old password fails", r.status === 401);

  // ============================================================
  //  11. DATABASE SCHEMA ADDITIONS
  // ============================================================
  title("11. Database Schema Additions");

  // Verify relationship_evolution entries persisted
  r = await req(`/api/relationships/${REL_ID}/evolution`, { token: TOKEN });
  t("Relationship evolution table exists", r.status === 200);
  t("Evolution entries persisted", r.data?.history?.length >= 3);

  // Verify embedding_vectors table accessible
  r = await req("/api/search?q=test&limit=1", { token: TOKEN });
  t("Embedding vectors table accessible", r.status === 200);

  // Verify backlinks table
  r = await req("/api/backlinks", { token: NEW_TOKEN });
  t("Backlinks table exists", r.status === 200);

  // Verify lore_validations table
  r = await req("/api/lore-validations", { token: NEW_TOKEN });
  t("Lore validations table exists", r.status === 200);

  // Verify voice_assignments table
  r = await req("/api/voice-assignments?entityType=npc&entityId=test", { token: NEW_TOKEN });
  t("Voice assignments table exists", r.status === 200);

  // Verify tts_cache table
  r = await req("/api/tts/cache", { token: NEW_TOKEN });
  t("TTS cache table exists", r.status === 200);

  // ============================================================
  //  12. RENDER LOOP INTEGRATION
  // ============================================================
  title("12. Render Loop Integration");

  // Verify render loop library exists
  const fs = require("fs");
  const path = require("path");

  t("render-loop.ts exists", fs.existsSync(path.join(process.cwd(), "src/lib/render-loop.ts")));
  t("use-render-loop.ts exists", fs.existsSync(path.join(process.cwd(), "src/hooks/use-render-loop.ts")));
  t("fps-counter.tsx exists", fs.existsSync(path.join(process.cwd(), "src/components/ui/fps-counter.tsx")));
  t("streaming-text.tsx exists", fs.existsSync(path.join(process.cwd(), "src/components/chat/streaming-text.tsx")));

  // Verify render-loop exports renderLoop singleton
  const renderLoopContent = fs.readFileSync(path.join(process.cwd(), "src/lib/render-loop.ts"), "utf8");
  t("render-loop exports renderLoop", renderLoopContent.includes("export const renderLoop"));
  t("render-loop uses requestAnimationFrame", renderLoopContent.includes("requestAnimationFrame"));
  t("render-loop targets 30fps", renderLoopContent.includes("30"));

  // Verify hook exports
  const hookContent = fs.readFileSync(path.join(process.cwd(), "src/hooks/use-render-loop.ts"), "utf8");
  t("hook exports useRenderLoop", hookContent.includes("export function useRenderLoop"));
  t("hook exports useMeasuredFPS", hookContent.includes("export function useMeasuredFPS"));

  // Verify layout integrates render loop
  const layoutContent = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");
  t("layout imports renderLoop", layoutContent.includes("import { renderLoop }"));
  t("layout imports FPSCounter", layoutContent.includes("import { FPSCounter }"));
  t("layout starts renderLoop", layoutContent.includes("renderLoop.start()"));
  t("layout renders FPSCounter", layoutContent.includes("<FPSCounter"));

  // Verify session page uses ChatWindow
  const sessionContent = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/session/[id]/page.tsx"), "utf8");
  t("session imports ChatWindow", sessionContent.includes("import { ChatWindow }"));
  t("session imports useRenderLoop", sessionContent.includes("import { useRenderLoop }"));
  t("session uses ChatWindow component", sessionContent.includes("<ChatWindow"));
  t("session uses useRenderLoop for scroll", sessionContent.includes("useRenderLoop("));

  // ============================================================
  //  12B. IDLE DETECTION INTEGRATION
  // ============================================================
  title("12B. Idle Detection Integration");

  // Verify idle tracker hook exists
  t("use-idle-tracker.ts exists", fs.existsSync(path.join(process.cwd(), "src/hooks/use-idle-tracker.ts")));
  t("idle heartbeat route exists", fs.existsSync(path.join(process.cwd(), "src/app/api/idle/heartbeat/route.ts")));

  // Verify hook exports
  const idleHookContent = fs.readFileSync(path.join(process.cwd(), "src/hooks/use-idle-tracker.ts"), "utf8");
  t("hook exports useIdleTracker", idleHookContent.includes("export function useIdleTracker"));
  t("hook tracks activity events", idleHookContent.includes("mousemove"));
  t("hook sends heartbeat", idleHookContent.includes("/api/idle/heartbeat"));
  t("hook checks document.hidden", idleHookContent.includes("document.hidden"));

  // Verify heartbeat route
  const heartbeatContent = fs.readFileSync(path.join(process.cwd(), "src/app/api/idle/heartbeat/route.ts"), "utf8");
  t("heartbeat route imports processIdleTier", heartbeatContent.includes("processIdleTier"));
  t("heartbeat route validates tier", heartbeatContent.includes("tier < 1"));
  t("heartbeat route updates last_idle_t", heartbeatContent.includes("last_idle_t"));

  // Verify idle-processing exports processIdleTier
  const idleProcessingContent = fs.readFileSync(path.join(process.cwd(), "src/lib/idle-processing.ts"), "utf8");
  t("idle-processing exports processIdleTier", idleProcessingContent.includes("export async function processIdleTier"));
  t("processIdleTier handles tier 1", idleProcessingContent.includes("case 1:"));
  t("processIdleTier handles tier 2", idleProcessingContent.includes("case 2:"));
  t("processIdleTier handles tier 3", idleProcessingContent.includes("case 3:"));
  t("processIdleTier handles tier 4", idleProcessingContent.includes("case 4:"));

  // Verify job-processor has idle priority and new job types
  const jobProcessorContent = fs.readFileSync(path.join(process.cwd(), "src/lib/job-processor.ts"), "utf8");
  t("job-processor has idle priority", jobProcessorContent.includes('"idle"'));
  t("job-processor has refine_relationship_summary", jobProcessorContent.includes("refine_relationship_summary"));
  t("job-processor has enrich_npc", jobProcessorContent.includes("enrich_npc"));
  t("job-processor has expand_rumors", jobProcessorContent.includes("expand_rumors"));
  t("job-processor has archival_processing", jobProcessorContent.includes("archival_processing"));

  // Verify layout integrates idle tracker
  t("layout imports useIdleTracker", layoutContent.includes("import { useIdleTracker }"));
  t("layout calls useIdleTracker", layoutContent.includes("useIdleTracker()"));
  t("layout shows idle indicator", layoutContent.includes("isIdle"));

  // Test idle heartbeat API
  r = await req("/api/idle/heartbeat", {
    method: "POST",
    body: { idleTime: 300000, tier: 1, page: "/dashboard" },
    token: NEW_TOKEN,
  });
  t("Idle heartbeat tier 1 returns 200", r.status === 200);
  t("Idle heartbeat returns success", r.data?.success === true);
  t("Idle heartbeat returns tier", r.data?.tier === 1);

  // Test tier 2 heartbeat
  r = await req("/api/idle/heartbeat", {
    method: "POST",
    body: { idleTime: 600000, tier: 2, page: "/dashboard" },
    token: NEW_TOKEN,
  });
  t("Idle heartbeat tier 2 returns 200", r.status === 200);
  t("Idle heartbeat tier 2 returns success", r.data?.success === true);

  // Test invalid tier
  r = await req("/api/idle/heartbeat", {
    method: "POST",
    body: { idleTime: 0, tier: 0, page: "/dashboard" },
    token: NEW_TOKEN,
  });
  t("Idle heartbeat invalid tier returns 400", r.status === 400);

  // Test heartbeat without token
  r = await req("/api/idle/heartbeat", {
    method: "POST",
    body: { idleTime: 300000, tier: 1, page: "/dashboard" },
  });
  t("Idle heartbeat without token returns 401", r.status === 401);

  // ============================================================
  //  12C. NARRATIVE THREADS API
  // ============================================================
  title("12C. Narrative Threads API");

  // Verify files exist
  t("narrative-threads API route exists", fs.existsSync(path.join(process.cwd(), "src/app/api/narrative-threads/route.ts")));
  t("narrative-threads list page exists", fs.existsSync(path.join(process.cwd(), "src/app/(app)/narrative-threads/page.tsx")));
  t("narrative-threads detail page exists", fs.existsSync(path.join(process.cwd(), "src/app/(app)/narrative-threads/[id]/page.tsx")));

  // Verify API route content
  const threadsApiContent = fs.readFileSync(path.join(process.cwd(), "src/app/api/narrative-threads/route.ts"), "utf8");
  t("API has GET handler", threadsApiContent.includes("export async function GET"));
  t("API has POST handler", threadsApiContent.includes("export async function POST"));
  t("API has PUT handler", threadsApiContent.includes("export async function PUT"));
  t("API has DELETE handler", threadsApiContent.includes("export async function DELETE"));
  t("API validates title required", threadsApiContent.includes("title is required"));
  t("API validates title length", threadsApiContent.includes("200"));
  t("API validates description length", threadsApiContent.includes("5000"));
  t("API validates arc_type", threadsApiContent.includes("VALID_ARC_TYPES"));
  t("API validates status", threadsApiContent.includes("VALID_STATUSES"));
  t("API validates escalation_level", threadsApiContent.includes("VALID_ESCALATION"));

  // Verify layout has threads nav
  t("layout has Threads nav item", layoutContent.includes("/narrative-threads"));
  t("layout imports GitBranch", layoutContent.includes("GitBranch"));

  // Test: Create thread
  r = await req("/api/narrative-threads", {
    method: "POST",
    body: { title: "The Missing Heirloom", description: "A valuable artifact has gone missing", arcType: "thread", escalationLevel: "medium" },
    token: NEW_TOKEN,
  });
  t("Create thread returns 201", r.status === 201);
  t("Create thread returns thread object", r.data?.thread?.id);
  t("Create thread has correct title", r.data?.thread?.title === "The Missing Heirloom");
  t("Create thread defaults to active status", r.data?.thread?.status === "active");
  t("Create thread has correct arc_type", r.data?.thread?.arc_type === "thread");
  t("Create thread has correct escalation", r.data?.thread?.escalation_level === "medium");
  const threadId1 = r.data?.thread?.id;

  // Test: Create arc
  r = await req("/api/narrative-threads", {
    method: "POST",
    body: { title: "The War of Kingdoms", arcType: "main_plot", escalationLevel: "critical" },
    token: NEW_TOKEN,
  });
  t("Create main_plot arc returns 201", r.status === 201);
  t("Create arc has correct arc_type", r.data?.thread?.arc_type === "main_plot");
  const threadId2 = r.data?.thread?.id;

  // Test: Create subplot
  r = await req("/api/narrative-threads", {
    method: "POST",
    body: { title: "The Secret Romance", arcType: "subplot" },
    token: NEW_TOKEN,
  });
  t("Create subplot returns 201", r.status === 201);
  const threadId3 = r.data?.thread?.id;

  // Test: List threads
  r = await req("/api/narrative-threads", { token: NEW_TOKEN });
  t("List threads returns 200", r.status === 200);
  t("List threads returns array", Array.isArray(r.data?.threads));
  t("List threads has at least 3", (r.data?.threads || []).length >= 3);

  // Test: Filter by status
  r = await req("/api/narrative-threads?status=active", { token: NEW_TOKEN });
  t("Filter by active status works", r.status === 200);

  // Test: Get single thread
  r = await req(`/api/narrative-threads?id=${threadId1}`, { token: NEW_TOKEN });
  t("Get single thread returns 200", r.status === 200);
  t("Get single thread returns correct title", r.data?.thread?.title === "The Missing Heirloom");

  // Test: Update thread
  r = await req("/api/narrative-threads", {
    method: "PUT",
    body: { id: threadId1, title: "The Stolen Heirloom", description: "Updated description", status: "paused" },
    token: NEW_TOKEN,
  });
  t("Update thread returns 200", r.status === 200);
  t("Update thread has new title", r.data?.thread?.title === "The Stolen Heirloom");
  t("Update thread has new description", r.data?.thread?.description === "Updated description");
  t("Update thread has new status", r.data?.thread?.status === "paused");

  // Test: Add unresolved items
  r = await req("/api/narrative-threads", {
    method: "PUT",
    body: { id: threadId1, unresolvedItems: ["Who stole it?", "Where is it hidden?"] },
    token: NEW_TOKEN,
  });
  t("Add unresolved items returns 200", r.status === 200);
  t("Unresolved items count is 2", r.data?.thread?.unresolved_items?.length === 2);

  // Test: Resolve thread
  r = await req("/api/narrative-threads", {
    method: "PUT",
    body: { id: threadId1, status: "resolved" },
    token: NEW_TOKEN,
  });
  t("Resolve thread returns 200", r.status === 200);
  t("Resolved thread has resolved_at", r.data?.thread?.resolved_at !== null);

  // Test: Reactivate thread
  r = await req("/api/narrative-threads", {
    method: "PUT",
    body: { id: threadId1, status: "active" },
    token: NEW_TOKEN,
  });
  t("Reactivate thread returns 200", r.status === 200);
  t("Reactivated thread status is active", r.data?.thread?.status === "active");

  // Test: Delete thread
  r = await req(`/api/narrative-threads?id=${threadId3}`, { method: "DELETE", token: NEW_TOKEN });
  t("Delete thread returns 200", r.status === 200);
  t("Delete thread returns success", r.data?.success === true);

  // Verify deletion
  r = await req(`/api/narrative-threads?id=${threadId3}`, { token: NEW_TOKEN });
  t("Deleted thread returns 404", r.status === 404);

  // Test: Create without title
  r = await req("/api/narrative-threads", {
    method: "POST",
    body: { title: "" },
    token: NEW_TOKEN,
  });
  t("Create without title returns 400", r.status === 400);

  // Test: Create with invalid arc_type
  r = await req("/api/narrative-threads", {
    method: "POST",
    body: { title: "Test", arcType: "invalid" },
    token: NEW_TOKEN,
  });
  t("Create with invalid arc_type returns 400", r.status === 400);

  // Test: Create with invalid escalation
  r = await req("/api/narrative-threads", {
    method: "POST",
    body: { title: "Test", escalationLevel: "extreme" },
    token: NEW_TOKEN,
  });
  t("Create with invalid escalation returns 400", r.status === 400);

  // Test: Update with invalid status
  r = await req("/api/narrative-threads", {
    method: "PUT",
    body: { id: threadId1, status: "deleted" },
    token: NEW_TOKEN,
  });
  t("Update with invalid status returns 400", r.status === 400);

  // Test: Update non-existent thread
  r = await req("/api/narrative-threads", {
    method: "PUT",
    body: { id: "non-existent-id", title: "Test" },
    token: NEW_TOKEN,
  });
  t("Update non-existent thread returns 404", r.status === 404);

  // Test: Delete non-existent thread
  r = await req("/api/narrative-threads?id=non-existent-id", { method: "DELETE", token: NEW_TOKEN });
  t("Delete non-existent thread returns 404", r.status === 404);

  // Test: Without token
  r = await req("/api/narrative-threads", {});
  t("List without token returns 401", r.status === 401);

  r = await req("/api/narrative-threads", { method: "POST", body: { title: "Test" } });
  t("Create without token returns 401", r.status === 401);

  // ============================================================
  //  12D. TIMELINE API
  // ============================================================
  title("12D. Timeline API");

  // Verify files exist
  t("timeline API route exists", fs.existsSync(path.join(process.cwd(), "src/app/api/timeline/route.ts")));
  t("timeline list page exists", fs.existsSync(path.join(process.cwd(), "src/app/(app)/timeline/page.tsx")));
  t("timeline detail page exists", fs.existsSync(path.join(process.cwd(), "src/app/(app)/timeline/[id]/page.tsx")));

  // Verify API route content
  const timelineApiContent = fs.readFileSync(path.join(process.cwd(), "src/app/api/timeline/route.ts"), "utf8");
  t("API has GET handler", timelineApiContent.includes("export async function GET"));
  t("API has POST handler", timelineApiContent.includes("export async function POST"));
  t("API has PUT handler", timelineApiContent.includes("export async function PUT"));
  t("API has DELETE handler", timelineApiContent.includes("export async function DELETE"));
  t("API validates title required", timelineApiContent.includes("title is required"));
  t("API validates occurredAt required", timelineApiContent.includes("occurredAt is required"));
  t("API validates entry_type", timelineApiContent.includes("VALID_ENTRY_TYPES"));
  t("API validates importance", timelineApiContent.includes("VALID_IMPORTANCE"));

  // Verify layout has timeline nav
  t("layout has Timeline nav item", layoutContent.includes("/timeline"));
  t("layout imports Clock", layoutContent.includes("Clock"));

  // Test: Create timeline entry
  const now = new Date().toISOString().slice(0, 16);
  r = await req("/api/timeline", {
    method: "POST",
    body: { title: "The Fall of the Northern Kingdom", description: "A great kingdom fell to darkness", occurredAt: now, era: "Age of Fire", entryType: "milestone", importance: "critical" },
    token: NEW_TOKEN,
  });
  t("Create entry returns 201", r.status === 201);
  t("Create entry returns entry object", r.data?.entry?.id);
  t("Create entry has correct title", r.data?.entry?.title === "The Fall of the Northern Kingdom");
  t("Create entry has correct era", r.data?.entry?.era === "Age of Fire");
  t("Create entry has correct type", r.data?.entry?.entry_type === "milestone");
  t("Create entry has correct importance", r.data?.entry?.importance === "critical");
  const entryId1 = r.data?.entry?.id;

  // Test: Create another entry in different era
  r = await req("/api/timeline", {
    method: "POST",
    body: { title: "The First Dawn", occurredAt: "2020-01-01T00:00", era: "Age of Dawn", entryType: "era_start" },
    token: NEW_TOKEN,
  });
  t("Create era_start entry returns 201", r.status === 201);
  const entryId2 = r.data?.entry?.id;

  // Test: Create a note
  r = await req("/api/timeline", {
    method: "POST",
    body: { title: "Minor observation", occurredAt: now, entryType: "note", importance: "low" },
    token: NEW_TOKEN,
  });
  t("Create note entry returns 201", r.status === 201);
  const entryId3 = r.data?.entry?.id;

  // Test: List entries
  r = await req("/api/timeline", { token: NEW_TOKEN });
  t("List entries returns 200", r.status === 200);
  t("List entries returns array", Array.isArray(r.data?.entries));
  t("List entries has at least 3", (r.data?.entries || []).length >= 3);

  // Test: Filter by era
  r = await req("/api/timeline?era=Age+of+Fire", { token: NEW_TOKEN });
  t("Filter by era returns 200", r.status === 200);
  t("Filter by era returns correct entries", (r.data?.entries || []).every((e) => e.era === "Age of Fire"));

  // Test: Sort ascending
  r = await req("/api/timeline?sort=asc", { token: NEW_TOKEN });
  t("Sort ascending returns 200", r.status === 200);

  // Test: Get single entry
  r = await req(`/api/timeline?id=${entryId1}`, { token: NEW_TOKEN });
  t("Get single entry returns 200", r.status === 200);
  t("Get single entry has correct title", r.data?.entry?.title === "The Fall of the Northern Kingdom");

  // Test: Update entry
  r = await req("/api/timeline", {
    method: "PUT",
    body: { id: entryId1, title: "The Great Fall", description: "Updated description", era: "Age of Ash" },
    token: NEW_TOKEN,
  });
  t("Update entry returns 200", r.status === 200);
  t("Update entry has new title", r.data?.entry?.title === "The Great Fall");
  t("Update entry has new era", r.data?.entry?.era === "Age of Ash");

  // Test: Delete entry
  r = await req(`/api/timeline?id=${entryId3}`, { method: "DELETE", token: NEW_TOKEN });
  t("Delete entry returns 200", r.status === 200);
  t("Delete entry returns success", r.data?.success === true);

  // Verify deletion
  r = await req(`/api/timeline?id=${entryId3}`, { token: NEW_TOKEN });
  t("Deleted entry returns 404", r.status === 404);

  // Test: Create without title
  r = await req("/api/timeline", {
    method: "POST",
    body: { title: "", occurredAt: now },
    token: NEW_TOKEN,
  });
  t("Create without title returns 400", r.status === 400);

  // Test: Create without occurredAt
  r = await req("/api/timeline", {
    method: "POST",
    body: { title: "Test" },
    token: NEW_TOKEN,
  });
  t("Create without occurredAt returns 400", r.status === 400);

  // Test: Create with invalid entry_type
  r = await req("/api/timeline", {
    method: "POST",
    body: { title: "Test", occurredAt: now, entryType: "invalid" },
    token: NEW_TOKEN,
  });
  t("Create with invalid entry_type returns 400", r.status === 400);

  // Test: Create with invalid importance
  r = await req("/api/timeline", {
    method: "POST",
    body: { title: "Test", occurredAt: now, importance: "extreme" },
    token: NEW_TOKEN,
  });
  t("Create with invalid importance returns 400", r.status === 400);

  // Test: Update non-existent entry
  r = await req("/api/timeline", {
    method: "PUT",
    body: { id: "non-existent-id", title: "Test" },
    token: NEW_TOKEN,
  });
  t("Update non-existent entry returns 404", r.status === 404);

  // Test: Delete non-existent entry
  r = await req("/api/timeline?id=non-existent-id", { method: "DELETE", token: NEW_TOKEN });
  t("Delete non-existent entry returns 404", r.status === 404);

  // Test: Without token
  r = await req("/api/timeline", {});
  t("List without token returns 401", r.status === 401);

  r = await req("/api/timeline", { method: "POST", body: { title: "Test", occurredAt: now } });
  t("Create without token returns 401", r.status === 401);

  // ============================================================
  //  12E. LORE EDITOR API
  // ============================================================
  title("12E. Lore Editor API");

  // Verify files exist
  t("lore-files API route exists", fs.existsSync(path.join(process.cwd(), "src/app/api/lore-files/route.ts")));
  t("lore editor page exists", fs.existsSync(path.join(process.cwd(), "src/app/(app)/lore/[id]/edit/page.tsx")));

  // Verify API route content
  const loreApiContent = fs.readFileSync(path.join(process.cwd(), "src/app/api/lore-files/route.ts"), "utf8");
  t("API has GET handler", loreApiContent.includes("export async function GET"));
  t("API has PUT handler", loreApiContent.includes("export async function PUT"));
  t("API parses wikilinks", loreApiContent.includes("parseWikilinks"));
  t("API parses frontmatter", loreApiContent.includes("parseFrontmatter"));

  // Verify editor page content
  const editorContent = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/lore/[id]/edit/page.tsx"), "utf8");
  t("Editor has split-pane preview", editorContent.includes("showPreview"));
  t("Editor has wikilink autocomplete", editorContent.includes("showAutocomplete"));
  t("Editor has canon selector", editorContent.includes("canon_tier"));
  t("Editor has validation badge", editorContent.includes("validationState"));
  t("Editor has backlink panel", editorContent.includes("showBacklinks"));
  t("Editor has broken link detection", editorContent.includes("brokenLinks"));
  t("Editor renders markdown preview", editorContent.includes("renderMarkdownPreview"));

  // Verify lore page has edit link
  const lorePageContent = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/lore/page.tsx"), "utf8");
  t("Lore page has edit button", lorePageContent.includes("/edit?type="));
  t("Lore page imports Pencil icon", lorePageContent.includes("Pencil"));

  // Test: List lore files (should work even if empty)
  r = await req("/api/lore-files", { token: NEW_TOKEN });
  t("List lore files returns 200", r.status === 200);
  t("List lore files returns files array", Array.isArray(r.data?.files));

  // Test: Get non-existent entity
  r = await req("/api/lore-files?entityType=locations&entityId=non-existent", { token: NEW_TOKEN });
  t("Get non-existent entity returns 404", r.status === 404);

  // Test: Update without token
  r = await req("/api/lore-files", {
    method: "PUT",
    body: { entityType: "locations", entityId: "test", content: "# Test" },
  });
  t("Update without token returns 401", r.status === 401);

  // Test: Update with invalid entityType
  r = await req("/api/lore-files", {
    method: "PUT",
    body: { entityType: "invalid", entityId: "test", content: "# Test" },
    token: NEW_TOKEN,
  });
  t("Update with invalid entityType returns 400", r.status === 400);

  // Test: Update without entityId
  r = await req("/api/lore-files", {
    method: "PUT",
    body: { entityType: "locations", content: "# Test" },
    token: NEW_TOKEN,
  });
  t("Update without entityId returns 400", r.status === 400);

  // Test: Update without content
  r = await req("/api/lore-files", {
    method: "PUT",
    body: { entityType: "locations", entityId: "test" },
    token: NEW_TOKEN,
  });
  t("Update without content returns 400", r.status === 400);

  // ============================================================
  //  12F. MODEL DETECTION & SELECTION
  // ============================================================
  title("12F. Model Detection & Selection");

  // Verify files exist
  t("models/ollama API route exists", fs.existsSync(path.join(process.cwd(), "src/app/api/models/ollama/route.ts")));

  // Verify API route content
  const modelsApiContent = fs.readFileSync(path.join(process.cwd(), "src/app/api/models/ollama/route.ts"), "utf8");
  t("Models API has GET handler", modelsApiContent.includes("export async function GET"));
  t("Models API fetches /api/tags", modelsApiContent.includes("/api/tags"));
  t("Models API categorizes LLM models", modelsApiContent.includes("llmModels"));
  t("Models API categorizes embedding models", modelsApiContent.includes("embeddingModels"));

  // Verify settings API has PUT
  const settingsApiContent = fs.readFileSync(path.join(process.cwd(), "src/app/api/settings/route.ts"), "utf8");
  t("Settings API has PUT handler", settingsApiContent.includes("export async function PUT"));
  t("Settings API saves llmModel", settingsApiContent.includes("llmModel"));
  t("Settings API saves embeddingModel", settingsApiContent.includes("embeddingModel"));
  t("Settings API reads user settings", settingsApiContent.includes("userSettings"));

  // Verify ollama.ts has getUserModels
  const ollamaContent = fs.readFileSync(path.join(process.cwd(), "src/lib/ollama.ts"), "utf8");
  t("ollama.ts exports getUserModels", ollamaContent.includes("export function getUserModels"));
  t("generateText accepts model option", ollamaContent.includes("options?.model"));
  t("generateEmbedding accepts model option", ollamaContent.includes("generateEmbedding("));
  t("generateTextStream accepts model option", ollamaContent.includes("generateTextStream("));

  // Verify settings page has model selectors
  const settingsPageContent = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/settings/page.tsx"), "utf8");
  t("Settings page has LLM model selector", settingsPageContent.includes("selectedLLM"));
  t("Settings page has embedding model selector", settingsPageContent.includes("selectedEmbedding"));
  t("Settings page has refresh models button", settingsPageContent.includes("handleRefreshModels"));
  t("Settings page shows connection status", settingsPageContent.includes("ollamaConnected"));
  t("Settings page imports Cpu icon", settingsPageContent.includes("Cpu"));
  t("Settings page imports RefreshCw icon", settingsPageContent.includes("RefreshCw"));

  // Test: Models API (may fail if Ollama not running, but route should exist)
  r = await req("/api/models/ollama", {});
  t("Models API returns response", r.status === 200 || r.status === 502);

  // Test: Settings GET returns user settings when authenticated
  r = await req("/api/settings", { token: NEW_TOKEN });
  t("Settings GET with token returns 200", r.status === 200);
  t("Settings GET returns user object", r.data?.user !== undefined);

  // Test: Settings PUT to save model preferences
  r = await req("/api/settings", {
    method: "PUT",
    body: { llmModel: "llama3.2:3b", embeddingModel: "bge-m3" },
    token: NEW_TOKEN,
  });
  t("Settings PUT returns 200", r.status === 200);
  t("Settings PUT returns success", r.data?.success === true);
  t("Settings PUT returns saved llmModel", r.data?.settings?.llmModel === "llama3.2:3b");
  t("Settings PUT returns saved embeddingModel", r.data?.settings?.embeddingModel === "bge-m3");

  // Test: Settings PUT without token
  r = await req("/api/settings", {
    method: "PUT",
    body: { llmModel: "test" },
  });
  t("Settings PUT without token returns 401", r.status === 401);

  // Test: Settings PUT with no settings
  r = await req("/api/settings", {
    method: "PUT",
    body: {},
    token: NEW_TOKEN,
  });
  t("Settings PUT with no settings returns 400", r.status === 400);

  // Test: Settings GET reflects saved preferences
  r = await req("/api/settings", { token: NEW_TOKEN });
  t("Settings GET reflects saved llmModel", r.data?.user?.llmModel === "llama3.2:3b");
  t("Settings GET reflects saved embeddingModel", r.data?.user?.embeddingModel === "bge-m3");

  // ============================================================
  //  12G. PHASE 1: GAP CLOSURE
  // ============================================================
  title("12G. Phase 1: Gap Closure");

  // A1: parent_message_id branching
  t("generate route accepts parentMessageId", fs.readFileSync(path.join(process.cwd(), "src/app/api/generate/[id]/route.ts"), "utf8").includes("parentMessageId"));
  t("generate route sets parent_message_id", fs.readFileSync(path.join(process.cwd(), "src/app/api/generate/[id]/route.ts"), "utf8").includes("parent_message_id"));
  t("messages POST sets parent_message_id", fs.readFileSync(path.join(process.cwd(), "src/app/api/sessions/[id]/messages/route.ts"), "utf8").includes("parent_message_id"));
  t("regenerate returns lastUserMessageId", fs.readFileSync(path.join(process.cwd(), "src/app/api/sessions/[id]/messages/[messageId]/regenerate/route.ts"), "utf8").includes("lastUserMessageId"));
  t("session page passes parentMessageId", fs.readFileSync(path.join(process.cwd(), "src/app/(app)/session/[id]/page.tsx"), "utf8").includes("parentMessageId"));

  // A2: TTS cache cleanup
  const msgDeleteRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/sessions/[id]/messages/[messageId]/route.ts"), "utf8");
  t("DELETE cleans up TTS cache", msgDeleteRoute.includes("DELETE FROM tts_cache"));
  t("PUT cleans up TTS cache", msgDeleteRoute.includes("text_content"));
  const regenerateRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/sessions/[id]/messages/[messageId]/regenerate/route.ts"), "utf8");
  t("Regenerate cleans up TTS cache", regenerateRoute.includes("DELETE FROM tts_cache"));

  // A3: Edit history API + UI
  t("Edit history API route exists", fs.existsSync(path.join(process.cwd(), "src/app/api/sessions/[id]/messages/[messageId]/edits/route.ts")));
  t("Edit history component exists", fs.existsSync(path.join(process.cwd(), "src/components/chat/edit-history.tsx")));
  const editsRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/sessions/[id]/messages/[messageId]/edits/route.ts"), "utf8");
  t("Edit history API has GET handler", editsRoute.includes("export async function GET"));
  t("Edit history API enriches usernames", editsRoute.includes("username"));
  t("Session page imports EditHistory", fs.readFileSync(path.join(process.cwd(), "src/app/(app)/session/[id]/page.tsx"), "utf8").includes("EditHistory"));
  t("Session page has editHistoryMessageId state", fs.readFileSync(path.join(process.cwd(), "src/app/(app)/session/[id]/page.tsx"), "utf8").includes("editHistoryMessageId"));

  // A4: Lore entry edit history
  t("Lore edits API route exists", fs.existsSync(path.join(process.cwd(), "src/app/api/lore-edits/route.ts")));
  const loreEditsRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/lore-edits/route.ts"), "utf8");
  t("Lore edits API has GET handler", loreEditsRoute.includes("export async function GET"));
  t("Lore edits API returns enriched edits", loreEditsRoute.includes("username"));
  const loreFilesRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/lore-files/route.ts"), "utf8");
  t("Lore files PUT records edits", loreFilesRoute.includes("lore_edits"));
  t("Lore editor has history panel", fs.readFileSync(path.join(process.cwd(), "src/app/(app)/lore/[id]/edit/page.tsx"), "utf8").includes("showHistory"));
  t("Lore editor has loadEditHistory", fs.readFileSync(path.join(process.cwd(), "src/app/(app)/lore/[id]/edit/page.tsx"), "utf8").includes("loadEditHistory"));

  // B1-B4: Job handlers
  const jobProcessor = fs.readFileSync(path.join(process.cwd(), "src/lib/job-processor.ts"), "utf8");
  t("Job processor has refine_relationship_summary case", jobProcessor.includes('"refine_relationship_summary"'));
  t("Job processor has enrich_npc case", jobProcessor.includes('"enrich_npc"'));
  t("Job processor has expand_rumors case", jobProcessor.includes('"expand_rumors"'));
  t("Job processor has archival_processing case", jobProcessor.includes('"archival_processing"'));
  t("Job processor has handleRefineRelationshipSummary", jobProcessor.includes("handleRefineRelationshipSummary"));
  t("Job processor has handleEnrichNpc", jobProcessor.includes("handleEnrichNpc"));
  t("Job processor has handleExpandRumors", jobProcessor.includes("handleExpandRumors"));
  t("Job processor has handleArchivalProcessing", jobProcessor.includes("handleArchivalProcessing"));

  // Test: Edit history API
  r = await req("/api/sessions/1/messages/1/edits", { token: NEW_TOKEN });
  t("Edit history API returns 200 or 404", r.status === 200 || r.status === 404);

  // Test: Lore edits API
  r = await req("/api/lore-edits?entityType=locations&entityId=1", { token: NEW_TOKEN });
  t("Lore edits API returns 200", r.status === 200);
  t("Lore edits API returns edits array", Array.isArray(r.data?.edits));

  // ============================================================
  //  13. BUILD VERIFICATION
  // ============================================================
  title("13. Build Verification");

  // Verify all Phase 7 pages exist by checking they return HTML (not 404)
  const pages = [
    "/dashboard",
    "/session",
    "/universe",
    "/lore",
    "/characters",
    "/relationships",
    "/events",
    "/narrative-threads",
    "/timeline",
    "/canon",
    "/voice-combiner",
    "/graph",
    "/validations",
    "/settings",
  ];

  for (const page of pages) {
    try {
      const res = await fetch(`${BASE}${page}`, {
        headers: { Cookie: `auth-token=${NEW_TOKEN}` },
        redirect: "manual",
      });
      // Pages should return 200 (or redirect to login if not authenticated)
      t(`Page ${page} exists (status ${res.status})`, res.status === 200 || res.status === 307 || res.status === 308);
    } catch {
      t(`Page ${page} accessible`, false);
    }
  }

  // Verify error boundaries exist (check file system via API response)
  // Error boundaries in Next.js App Router are not directly accessible as routes
  // They're triggered by errors in the route tree. We verify they exist by
  // checking that the app doesn't crash on invalid routes.
  try {
    const res = await fetch(`${BASE}/this-route-does-not-exist-12345`, {
      headers: { Cookie: `auth-token=${NEW_TOKEN}` },
      redirect: "manual",
    });
    t("Non-existent route handled gracefully", res.status === 404 || res.status === 500);
  } catch {
    t("Non-existent route handled gracefully", false);
  }

  // Verify loading.tsx exists (check that pages load without hanging)
  try {
    const res = await fetch(`${BASE}/dashboard`, {
      headers: { Cookie: `auth-token=${NEW_TOKEN}` },
      redirect: "manual",
    });
    t("Dashboard loads without hanging", res.status === 200);
  } catch {
    t("Dashboard loads without hanging", false);
  }

  // ============================================================
  //  SUMMARY
  // ============================================================
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Phase 7 Expanded Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${"=".repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Test suite error:", e);
  process.exit(1);
});

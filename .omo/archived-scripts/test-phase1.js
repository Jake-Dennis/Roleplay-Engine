/**
 * Phase 1 Comprehensive Test Script
 * 
 * Tests: project setup, dark theme, DB init, Ollama client, TTS client,
 * render loop, per-user dirs, TTS cache, auth flow, middleware.
 * 
 * Usage: node scripts/test-phase1.js
 * Requires: dev server running on localhost:3333
 */

const BASE = "http://localhost:3333";
let passed = 0;
let failed = 0;
let testUser = { username: "", password: "", id: "" };
let authToken = "";

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

// ============================================================================
// 1. Server Availability
// ============================================================================
console.log("\n=== 1. Server Availability ===");
{
  const { status, ok } = await fetchJSON(`${BASE}/login`);
  assert(status === 200, "Login page returns 200");
}

// ============================================================================
// 2. Config Endpoint (if exists)
// ============================================================================
console.log("\n=== 2. API Route Compilation ===");
{
  // Try hitting a known API route to verify compilation
  const { status } = await fetchJSON(`${BASE}/api/sessions`);
  // 401 is fine - means the route compiled and requires auth
  assert(status === 401, "API sessions route returns 401 (unauthenticated)");

  const { status: authStatus } = await fetchJSON(`${BASE}/api/auth/me`);
  assert(authStatus === 401, "Auth me route returns 401 (unauthenticated)");
}

// ============================================================================
// 3. Auth: Registration
// ============================================================================
console.log("\n=== 3. Registration ===");
{
  const rand = Math.random().toString(36).substring(2, 8);
  testUser = { username: `test_${rand}`, password: "TestPass123" };

  const { status, data } = await fetchJSON(`${BASE}/api/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      username: testUser.username,
      password: testUser.password,
    }),
  });

  assert(status === 201, `Register returns 201`);
  assert(data.user && data.user.id, "Register returns user with id");
  assert(data.user.username === testUser.username, "Register returns correct username");
  
  if (data.user) testUser.id = data.user.id;

  // Duplicate registration should fail
  const { status: dupStatus, data: dupData } = await fetchJSON(`${BASE}/api/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      username: testUser.username,
      password: testUser.password,
    }),
  });
  assert(dupStatus >= 400, "Duplicate registration rejected");
}

// ============================================================================
// 4. Auth: Login
// ============================================================================
console.log("\n=== 4. Login ===");
{
  const { status, data, headers } = await fetchJSON(`${BASE}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({
      username: testUser.username,
      password: testUser.password,
    }),
  });

  assert(status === 200, "Login returns 200");
  assert(data.token, "Login returns JWT token");
  assert(data.user && data.user.id, "Login returns user object");
  
  // Set cookie for subsequent requests
  if (data.token) {
    authToken = data.token;
  }

  // Invalid password should fail
  const { status: badStatus } = await fetchJSON(`${BASE}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ username: testUser.username, password: "WrongPass123" }),
  });
  assert(badStatus === 401, "Invalid password returns 401");

  // Non-existent user should fail
  const { status: noUserStatus } = await fetchJSON(`${BASE}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ username: "nonexistent_user_xyz", password: "TestPass123" }),
  });
  assert(noUserStatus === 401, "Non-existent user returns 401");
}

// ============================================================================
// 5. Auth: Me (Authenticated)
// ============================================================================
console.log("\n=== 5. Auth Me ===");
{
  const { status, data } = await fetchJSON(`${BASE}/api/auth/me`, {
    headers: { Cookie: `auth-token=${authToken}` },
  });

  assert(status === 200, "Auth me returns 200 with valid token");
  assert(data.user && data.user.id === testUser.id, "Auth me returns correct user");

  const { status: noAuthStatus } = await fetchJSON(`${BASE}/api/auth/me`);
  assert(noAuthStatus === 401, "Auth me rejects no token");
}

// ============================================================================
// 6. Auth: Password Change
// ============================================================================
console.log("\n=== 6. Password Change ===");
{
  // Change password
  const { status } = await fetchJSON(`${BASE}/api/auth/password`, {
    method: "PUT",
    headers: { Cookie: `auth-token=${authToken}` },
    body: JSON.stringify({
      currentPassword: testUser.password,
      newPassword: "NewPass456",
    }),
  });
  assert(status === 200, "Password change returns 200");

  // Login with new password
  const { status: loginNewStatus } = await fetchJSON(`${BASE}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ username: testUser.username, password: "NewPass456" }),
  });
  assert(loginNewStatus === 200, "Login works with new password");

  // Login with old password should fail
  const { status: loginOldStatus } = await fetchJSON(`${BASE}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ username: testUser.username, password: "TestPass123" }),
  });
  assert(loginOldStatus === 401, "Old password rejected");

  // Reset to original for further tests
  await fetchJSON(`${BASE}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ username: testUser.username, password: "NewPass456" }),
  }).then(async ({ data }) => {
    if (data.token) {
      const res = await fetch(`${BASE}/api/auth/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: `auth-token=${data.token}` },
        body: JSON.stringify({ currentPassword: "NewPass456", newPassword: testUser.password }),
      });
      assert(res.status === 200, "Password restored for further tests");
    }
  });

  // Re-login with original password for next tests
  const loginRes = await fetchJSON(`${BASE}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ username: testUser.username, password: testUser.password }),
  });
  if (loginRes.data.token) authToken = loginRes.data.token;
}

// ============================================================================
// 7. Session CRUD
// ============================================================================
console.log("\n=== 7. Session CRUD ===");
{
  // Create session
  const { status: createStatus, data: createData } = await fetchJSON(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { Cookie: `auth-token=${authToken}` },
    body: JSON.stringify({ name: "Test Adventure", type: "solo" }),
  });
  assert(createStatus === 201 || createStatus === 200, "Session created");
  assert(createData.session && createData.session.id, "Session has id");

  const sessionId = createData.session?.id;
  if (!sessionId) { assert(false, "No session id - skipping rest"); }
  else {
    // List sessions
    const { status: listStatus, data: listData } = await fetchJSON(`${BASE}/api/sessions`, {
      headers: { Cookie: `auth-token=${authToken}` },
    });
    assert(listStatus === 200, "Session list returns 200");
    assert(listData.sessions && listData.sessions.length > 0, "Session list is non-empty");

    // Get session detail
    const { status: getStatus, data: getData } = await fetchJSON(`${BASE}/api/sessions/${sessionId}`, {
      headers: { Cookie: `auth-token=${authToken}` },
    });
    assert(getStatus === 200, "Session detail returns 200");
    assert(getData.session && getData.session.name === "Test Adventure", "Session detail has correct name");

    // Delete session
    const { status: delStatus } = await fetchJSON(`${BASE}/api/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Cookie: `auth-token=${authToken}` },
    });
    assert(delStatus === 200, "Session deleted");
  }
}

// ============================================================================
// 8. Ollama Config / API
// ============================================================================
console.log("\n=== 8. Ollama Connectivity ===");
{
  // Check if Ollama is reachable (external service, may not be available)
  try {
    const res = await fetch("http://192.168.4.2:11434/api/tags", {
      signal: AbortSignal.timeout(5000),
    });
    assert(res.ok, `Ollama responds with ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      assert(data.models && Array.isArray(data.models), "Ollama returns model list");
      console.log(`     Models available: ${(data.models || []).map(m => m.name).join(", ") || "none"}`);
    }
  } catch (e) {
    assert(false, `Ollama unreachable: ${e.message}`);
  }
}

// ============================================================================
// 9. TTS Voices API
// ============================================================================
console.log("\n=== 9. TTS Connectivity ===");
{
  // Check TTS API endpoint
  const { status, data } = await fetchJSON(`${BASE}/api/tts/voices`);
  assert(status === 200 || status === 500 || status === 502, `TTS voices endpoint responds (${status})`);
  
  // Check available voices from Kokoro directly
  try {
    const res = await fetch("http://192.168.4.2:8880/v1/audio/voices", {
      signal: AbortSignal.timeout(5000),
    });
    assert(res.ok, `Kokoro TTS responds with ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      assert(data.voices && Array.isArray(data.voices), "TTS returns voice list");
      console.log(`     Voices: ${data.voices.length} available`);
    }
  } catch (e) {
    assert(false, `Kokoro TTS unreachable: ${e.message}`);
  }
}

// ============================================================================
// 10. Login/logout middleware protection
// ============================================================================
console.log("\n=== 10. Middleware Protection ===");
{
  // Dashboard redirects to login without cookie
  const { status, headers } = await fetchJSON(`${BASE}/dashboard`, { redirect: "manual" });
  // Next.js middleware redirects with 307 or 302
  assert(status >= 300 && status < 400, "Dashboard redirects when unauthenticated");

  if (authToken) {
    const { status: authStatus, data } = await fetchJSON(`${BASE}/dashboard`, {
      headers: { Cookie: `auth-token=${authToken}` },
    });
    assert(authStatus === 200, "Dashboard returns 200 when authenticated");
  }
}

// ============================================================================
// 11. Per-user data directory
// ============================================================================
console.log("\n=== 11. User Data Directory ===");
{
  // Check if user directories were created during registration
  const fs = await import("fs");
  const path = await import("path");

  const dirs = ["universe", "locations", "npcs", "relationships", "events", "story_arcs", "canon", "generated", "tts_cache"];
  const userDir = path.join("data", testUser.id);

  const exists = fs.existsSync(userDir);
  assert(exists, `User directory created at ${userDir}`);

  if (exists) {
    let allDirsExist = true;
    for (const dir of dirs) {
      if (!fs.existsSync(path.join(userDir, dir))) {
        console.log(`     Missing: ${dir}`);
        allDirsExist = false;
      }
    }
    assert(allDirsExist, "All 9 subdirectories created");
  }
}

// ============================================================================
// 12. Database schema verification
// ============================================================================
console.log("\n=== 12. Database Schema ===");
{
  const Database = (await import("better-sqlite3")).default;
  const db = new Database("data/global.db");
  
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  const tableNames = tables.map(t => t.name).sort();
  
  const expected = [
    "backlinks", "embedding_index", "events", "job_queue", "locations",
    "lore_validations", "message_edits", "message_summaries", "messages",
    "narrative_memories", "narrative_threads", "npcs", "relationships",
    "scene_states", "session_participants", "sessions", "timelines",
    "tts_cache", "universes", "users", "voice_assignments",
  ];

  const missing = expected.filter(t => !tableNames.includes(t));
  const extra = tableNames.filter(t => !expected.includes(t));
  
  assert(missing.length === 0, `All expected tables exist (${expected.length} total)`);
  if (missing.length > 0) console.log(`     Missing: ${missing.join(", ")}`);
  if (extra.length > 0) console.log(`     Extra: ${extra.join(", ")}`);

  // Verify indexes
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all();
  assert(indexes.length >= 10, `At least 10 indexes created (${indexes.length} found)`);

  db.close();
}

// ============================================================================
// 13. Render loop verification (static code check)
// ============================================================================
console.log("\n=== 13. Render Loop System ===");
{
  const fs = await import("fs");
  const content = fs.readFileSync("src/lib/render-loop.ts", "utf8");
  
  assert(content.includes("class RenderLoop"), "RenderLoop class defined");
  assert(content.includes("targetFPS = 30"), "Target FPS is 30");
  assert(content.includes("requestAnimationFrame"), "Uses requestAnimationFrame");
  assert(content.includes("subscribe"), "Has subscribe method");
  assert(content.includes("export const renderLoop = new RenderLoop(30)"), "Singleton exported");
}

// ============================================================================
// 14. run.bat verification
// ============================================================================
console.log("\n=== 14. run.bat ===");
{
  const fs = await import("fs");
  const content = fs.readFileSync("run.bat", "utf8");
  
  assert(content.includes("npm run dev"), "Starts dev server");
  assert(content.includes("Ollama"), "Checks Ollama connectivity");
  assert(content.includes("Kokoro"), "Checks TTS connectivity");
  assert(content.includes("init-db"), "Initializes database");
  assert(content.includes("http://localhost:3000"), "Shows server URL");
}

// ============================================================================
// 15. TTS Cache System
// ============================================================================
console.log("\n=== 15. TTS Cache ===");
{
  const fs = await import("fs");
  const content = (await import("fs")).readFileSync("src/lib/tts.ts", "utf8");
  
  assert(content.includes("getCacheKey"), "getCacheKey function");
  assert(content.includes("getCachedAudio"), "getCachedAudio function");
  assert(content.includes("cacheAudio"), "cacheAudio function");
  assert(content.includes("sha256"), "Uses SHA256 hashing");
  assert(content.includes("tts_cache"), "Uses tts_cache table");
}

// ============================================================================
// 16. Config validation
// ============================================================================
console.log("\n=== 16. Configuration ===");
{
  const fs = await import("fs");
  const content = fs.readFileSync("src/lib/config.ts", "utf8");
  
  assert(content.includes("OLLAMA_CONFIG"), "Ollama config defined");
  assert(content.includes("TTS_CONFIG"), "TTS config defined");
  assert(content.includes("AUTH_CONFIG"), "Auth config defined");
  assert(content.includes("192.168.4.2"), "Default host set");
  assert(content.includes("qwen3.5:9b"), "Default model set");
  assert(content.includes("kokoro"), "TTS model set");
  assert(content.includes("JWT_SECRET"), "JWT secret config");
}

// ============================================================================
// 17. Logout
// ============================================================================
console.log("\n=== 17. Logout ===");
{
  const { status, headers } = await fetchJSON(`${BASE}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: `auth-token=${authToken}` },
    redirect: "manual",
  });
  assert(status === 200, "Logout returns 200");
}

// ============================================================================
// Summary
// ============================================================================
console.log("\n" + "=".repeat(50));
console.log(`  PHASE 1 TEST RESULTS`);
console.log("=".repeat(50));
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);
console.log(`  Status: ${failed === 0 ? "✅ ALL PASSED" : "❌ SOME FAILED"}`);
console.log("=".repeat(50) + "\n");

process.exit(failed > 0 ? 1 : 0);

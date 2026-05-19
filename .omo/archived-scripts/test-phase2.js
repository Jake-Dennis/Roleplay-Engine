/**
 * Phase 2 (Authentication) — Comprehensive Edge-to-Edge Test
 *
 * Tests: registration, login, JWT, middleware, password change, logout, persistence
 *
 * Usage: node scripts/test-phase2.js
 * Requires: dev server on localhost:3333
 */

const BASE = "http://localhost:3333";
let ok = 0, fail = 0;
const t = (label, cond, detail) => {
  if (cond) { ok++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
};

async function req(url, opts = {}) {
  const res = await fetch(BASE + url, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    redirect: "manual",
    ...opts,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  const cookie = res.headers.get("set-cookie") || "";
  const token = (cookie.match(/auth-token=([^;]+)/) || [])[1];
  return { status: res.status, ok: res.ok, data, cookie, token, headers: res.headers };
}

console.log("\n" + "=".repeat(60));
console.log("  PHASE 2: AUTHENTICATION — COMPREHENSIVE TEST");
console.log("=".repeat(60) + "\n");

// ---------------------------------------------------------------------------
// 1. REGISTRATION
// ---------------------------------------------------------------------------
console.log("─── 1. REGISTRATION ───");

// 1a. Valid registration
const rand = Math.random().toString(36).slice(2, 8);
const USER = { username: `auth_${rand}`, password: "ValidPass1" };
const r1 = await req("/api/auth/register", {
  method: "POST",
  body: JSON.stringify(USER),
});
t("1a. Valid registration returns 201", r1.status === 201);
t("1a. Returns success: true", r1.data?.success === true);
t("1a. Returns user.id", !!r1.data?.user?.id);
t("1a. Returns correct username", r1.data?.user?.username === USER.username);

// 1b. Missing username
const r1b = await req("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ password: "ValidPass1" }),
});
t("1b. Missing username returns 400", r1b.status === 400);
t("1b. Error message", r1b.data?.error?.includes("required"));

// 1c. Missing password
const r1c = await req("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ username: "newuser1" }),
});
t("1c. Missing password returns 400", r1c.status === 400);

// 1d. Empty fields
const r1d = await req("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ username: "", password: "" }),
});
t("1d. Empty credentials returns 400", r1d.status === 400);

// 1e. Username too short (< 3 chars)
const r1e = await req("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ username: "ab", password: "ValidPass1" }),
});
t("1e. Short username (< 3) returns 400", r1e.status === 400);
t("1e. Specific error message", r1e.data?.error?.includes("3-20"));

// 1f. Username too long (> 20 chars)
const r1f = await req("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ username: "a".repeat(21), password: "ValidPass1" }),
});
t("1f. Long username (> 20) returns 400", r1f.status === 400);

// 1g. Username with invalid chars
const r1g = await req("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ username: "user name!", password: "ValidPass1" }),
});
t("1g. Invalid chars returns 400", r1g.status === 400);
t("1g. Error mentions letters/numbers/underscores", r1g.data?.error?.includes("letters"));

// 1h. Password too short (< 8 chars)
const r1h = await req("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ username: "user_ok1", password: "Ab1" }),
});
t("1h. Short password (< 8) returns 400", r1h.status === 400);

// 1i. Password without letter
const r1i = await req("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ username: "user_ok2", password: "12345678" }),
});
t("1i. Password without letter returns 400", r1i.status === 400);

// 1j. Password without number
const r1j = await req("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ username: "user_ok3", password: "abcdefgh" }),
});
t("1j. Password without number returns 400", r1j.status === 400);

// 1k. Duplicate username
const r1k = await req("/api/auth/register", {
  method: "POST",
  body: JSON.stringify(USER),
});
t("1k. Duplicate username returns 409", r1k.status === 409);
t("1k. Error message", r1k.data?.error?.includes("already exists"));

// 1l. Case-insensitive duplicate
const r1l = await req("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ username: USER.username.toUpperCase(), password: "ValidPass1" }),
});
t("1l. Case-insensitive duplicate returns 409", r1l.status === 409);

// ---------------------------------------------------------------------------
// 2. LOGIN
// ---------------------------------------------------------------------------
console.log("\n─── 2. LOGIN ───");

// 2a. Valid login
const r2 = await req("/api/auth/login", {
  method: "POST",
  body: JSON.stringify(USER),
});
t("2a. Valid login returns 200", r2.status === 200);
t("2a. Returns success: true", r2.data?.success === true);
t("2a. Returns user object", !!r2.data?.user?.id);
t("2a. Sets auth-token cookie", r2.cookie.includes("auth-token="));
t("2a. Cookie is HttpOnly", r2.cookie.includes("HttpOnly"));
t("2a. Cookie has max-age/expires", r2.cookie.includes("Max-Age=") || r2.cookie.includes("Expires="));
t("2a. Cookie path is /", r2.cookie.includes("Path=/"));

// 2b. Missing credentials
const r2b = await req("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({}),
});
t("2b. Missing credentials returns 400", r2b.status === 400);

// 2c. Wrong password
const r2c = await req("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ username: USER.username, password: "WrongPass1" }),
});
t("2c. Wrong password returns 401", r2c.status === 401);
t("2c. Error message", r2c.data?.error?.includes("Invalid"));

// 2d. Non-existent user
const r2d = await req("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ username: "nonexistent_user_xx", password: "ValidPass1" }),
});
t("2d. Non-existent user returns 401", r2d.status === 401);

// 2e. Case-insensitive username login
const r2e = await req("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ username: USER.username.toUpperCase(), password: USER.password }),
});
t("2e. Case-insensitive login works", r2e.status === 200);

// 2f. Empty string fields
const r2f = await req("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ username: "", password: "" }),
});
t("2f. Empty credentials returns 400", r2f.status === 400);

// ---------------------------------------------------------------------------
// 3. AUTH ME
// ---------------------------------------------------------------------------
console.log("\n─── 3. AUTH ME ───");

// 3a. With valid token
const TOKEN = r2.token;
const r3 = await req("/api/auth/me", { headers: { Cookie: `auth-token=${TOKEN}` } });
t("3a. Auth me with token returns 200", r3.status === 200);
t("3a. Returns user object", !!r3.data?.user);
t("3a. Returns correct user id", r3.data?.user?.id === r2.data?.user?.id);
t("3a. Returns username", r3.data?.user?.username === USER.username);

// 3b. Without any token
const r3b = await req("/api/auth/me");
t("3b. Auth me without token returns 401", r3b.status === 401);

// 3c. With tampered token (invalid JWT)
const r3c = await req("/api/auth/me", { headers: { Cookie: "auth-token=this.is.not.a.valid.jwt" } });
t("3c. Tampered token returns 401", r3c.status === 401);

// 3d. With empty cookie value
const r3d = await req("/api/auth/me", { headers: { Cookie: "auth-token=" } });
t("3d. Empty cookie value returns 401", r3d.status === 401);

// 3e. With wrong-format token
const r3e = await req("/api/auth/me", { headers: { Cookie: "auth-token=invalid" } });
t("3e. Malformed token returns 401", r3e.status === 401);

// ---------------------------------------------------------------------------
// 4. PASSWORD CHANGE
// ---------------------------------------------------------------------------
console.log("\n─── 4. PASSWORD CHANGE ───");

// 4a. Valid password change
const r4 = await req("/api/auth/password", {
  method: "PUT",
  headers: { Cookie: `auth-token=${TOKEN}` },
  body: JSON.stringify({ currentPassword: USER.password, newPassword: "NewValid1" }),
});
t("4a. Valid password change returns 200", r4.status === 200);
t("4a. Returns success: true", r4.data?.success === true);

// 4b. Login with old password should fail
const r4b = await req("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ username: USER.username, password: USER.password }),
});
t("4b. Old password rejected", r4b.status === 401);

// 4c. Login with new password should work
const r4c = await req("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ username: USER.username, password: "NewValid1" }),
});
t("4c. New password accepted", r4c.status === 200);
const NEW_TOKEN = r4c.token;

// 4d. Wrong current password
const r4d = await req("/api/auth/password", {
  method: "PUT",
  headers: { Cookie: `auth-token=${NEW_TOKEN}` },
  body: JSON.stringify({ currentPassword: "WrongCurr1", newPassword: "Another1" }),
});
t("4d. Wrong current password returns 400", r4d.status === 400);

// 4e. Weak new password
const r4e = await req("/api/auth/password", {
  method: "PUT",
  headers: { Cookie: `auth-token=${NEW_TOKEN}` },
  body: JSON.stringify({ currentPassword: "NewValid1", newPassword: "weak" }),
});
t("4e. Weak new password returns 400", r4e.status === 400);

// 4f. Missing fields
const r4f = await req("/api/auth/password", {
  method: "PUT",
  headers: { Cookie: `auth-token=${NEW_TOKEN}` },
  body: JSON.stringify({}),
});
t("4f. Missing fields returns 400", r4f.status === 400);

// 4g. Without auth token
const r4g = await req("/api/auth/password", {
  method: "PUT",
  body: JSON.stringify({ currentPassword: "NewValid1", newPassword: "Another1" }),
});
t("4g. Password change without auth returns 401", r4g.status === 401);

// 4h. Restore original password for further tests
await req("/api/auth/password", {
  method: "PUT",
  headers: { Cookie: `auth-token=${NEW_TOKEN}` },
  body: JSON.stringify({ currentPassword: "NewValid1", newPassword: USER.password }),
});

// Get fresh token with original password
const r4h = await req("/api/auth/login", {
  method: "POST",
  body: JSON.stringify(USER),
});
const FRESH_TOKEN = r4h.token;

// ---------------------------------------------------------------------------
// 5. LOGOUT
// ---------------------------------------------------------------------------
console.log("\n─── 5. LOGOUT ───");

// 5a. Logout returns 200
const r5 = await req("/api/auth/logout", {
  method: "POST",
  headers: { Cookie: `auth-token=${FRESH_TOKEN}` },
});
t("5a. Logout returns 200", r5.status === 200);
t("5a. Clears cookie (maxAge=0)", r5.cookie.includes("Max-Age=0") || r5.cookie.includes("expires=Thu, 01 Jan 1970"));

// 5b. Auth me after logout
const r5b = await req("/api/auth/me");
t("5b. Auth me after logout returns 401", r5b.status === 401);

// 5c. Logout without token (should still succeed)
const r5c = await req("/api/auth/logout", { method: "POST" });
t("5c. Logout without token returns 200", r5c.status === 200);

// ---------------------------------------------------------------------------
// 6. MIDDLEWARE
// ---------------------------------------------------------------------------
console.log("\n─── 6. MIDDLEWARE ───");

// Login again for middleware tests
const loginAgain = await req("/api/auth/login", {
  method: "POST",
  body: JSON.stringify(USER),
});
const MID_TOKEN = loginAgain.token;

// 6a. Protected pages redirect without auth
const protectedPages = ["/dashboard", "/session", "/universe", "/lore", "/characters", "/settings"];
for (const page of protectedPages) {
  const r = await req(page);
  t(`6a. ${page} redirects without auth`, r.status >= 300 && r.status < 400);
}

// 6b. Protected pages work with auth
for (const page of protectedPages) {
  const r = await req(page, { headers: { Cookie: `auth-token=${MID_TOKEN}` } });
  t(`6b. ${page} loads with auth`, r.status === 200);
}

// 6c. Public pages accessible without auth
const publicPages = ["/login", "/register"];
for (const page of publicPages) {
  const r = await req(page);
  t(`6c. ${page} accessible without auth`, r.status === 200);
}

// 6d. Login/register redirect to dashboard if already authenticated
for (const page of publicPages) {
  const r = await req(page, { headers: { Cookie: `auth-token=${MID_TOKEN}` } });
  t(`6d. ${page} redirects to dashboard when authed`, r.status >= 300 && r.status < 400);
}

// 6e. Protected API routes return 401 without auth
const apiRoutes = ["/api/sessions", "/api/universes", "/api/locations", "/api/voice-assignments"];
for (const route of apiRoutes) {
  const r = await req(route);
  t(`6e. ${route} returns 401 without auth`, r.status === 401);
}

// 6f. Expired token treatment (test with a clearly expired JWT)
// We can't easily test real expiry without waiting, but we can test invalid
const r6f = await req("/api/auth/me", {
  headers: { Cookie: "auth-token=eyJhbGciOiJIUzI1NiJ9.dGVzdA.abc" },
});
t("6f. Invalid JWT rejected", r6f.status === 401);

// ---------------------------------------------------------------------------
// 7. SESSION PERSISTENCE
// ---------------------------------------------------------------------------
console.log("\n─── 7. SESSION PERSISTENCE ───");

// 7a. Token works across multiple requests
const requests = [1, 2, 3, 4, 5];
for (const i of requests) {
  const r = await req("/api/auth/me", { headers: { Cookie: `auth-token=${MID_TOKEN}` } });
  t(`7a. Auth me request #${i} works`, r.status === 200);
}

// 7b. Token survives browser close (no session cookie)
t("7b. Cookie has explicit Max-Age (not session-only)", r2.cookie.includes("Max-Age="));

// ---------------------------------------------------------------------------
// 8. AUTH LIBRARY UNIT CHECKS (static code analysis)
// ---------------------------------------------------------------------------
console.log("\n─── 8. AUTH LIBRARY CHECKS ───");

import("fs").then(fs => {
  const configSrc = fs.readFileSync("src/lib/config.ts", "utf8");
  t("8a. jwtExpiry is 86400", configSrc.includes("jwtExpiry: 86400"));

  const loginSrc = fs.readFileSync("src/app/api/auth/login/route.ts", "utf8");
  t("8b. Login sets 24h max-age", loginSrc.includes("maxAge: 60 * 60 * 24"));

  const authSrc = fs.readFileSync("src/lib/auth.ts", "utf8");
  t("8c. Has validateUsername function", authSrc.includes("validateUsername"));
  t("8d. Has validatePassword function", authSrc.includes("validatePassword"));
  t("8e. Has createUser function", authSrc.includes("createUser"));
  t("8f. Has authenticateUser function", authSrc.includes("authenticateUser"));
  t("8g. Has generateToken function", authSrc.includes("generateToken"));
  t("8h. Has verifyToken function", authSrc.includes("verifyToken"));
  t("8i. Has changePassword function", authSrc.includes("changePassword"));
  t("8j. Has initializeUserDataDirectory", authSrc.includes("initializeUserDataDirectory"));
  t("8k. Username pattern validation", authSrc.includes("usernamePattern"));
  t("8l. Has bcrypt rounds config", authSrc.includes("bcryptRounds"));
  
  // SUMMARY
  console.log("\n" + "=".repeat(60));
  console.log(`  RESULTS: ${ok} passed, ${fail} failed, ${ok+fail} total`);
  console.log(`  STATUS: ${fail === 0 ? "✅ ALL PASSED" : "❌ " + fail + " FAILURES"}`);
  console.log("=".repeat(60) + "\n");

  process.exit(fail > 0 ? 1 : 0);
});

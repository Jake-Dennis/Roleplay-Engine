/**
 * API Integration Tests: Auth Routes
 *
 * Tests the full request/response cycle for auth endpoints:
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 *
 * Strategy:
 *   - Mock @/lib/db with an in-memory SQLite database so real auth functions
 *     (createUser, authenticateUser, etc.) can execute against test data.
 *   - Mock @/lib/config to provide deterministic AUTH_CONFIG values.
 *   - Mock @/lib/rate-limiter to always allow requests.
 *   - Mock @/lib/with-auth for the /me route (authenticated / unauthenticated).
 *   - Mock @/lib/auth-token for the /logout route.
 *   - Keep @/lib/auth real — it uses the mocked db & config.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { NextRequest, NextResponse } from "next/server";
import { Database } from "bun:sqlite";
import crypto from "crypto";

// ===========================================================================
// Mutable mock state — reassigned in beforeEach / individual tests.
// ===========================================================================

let mockDb: Database;
let tempDataDir = "";

/** Controls what withAuth() returns — reassign per test. */
let _mockWithAuthResult: unknown = { auth: { userId: "test-user-id", decoded: { sub: "test-user-id", jti: "mock-jti", exp: 9999999999, iat: 1000000000, username: "testuser", pwd_changed_at: null } } };

/** Controls what getAuthToken() returns — reassign per test. */
let _mockAuthToken: string | undefined = "mock-auth-token";

// ===========================================================================
// Module mocks — MUST appear before any imports under test.
// ===========================================================================

mock.module("@/lib/config", () => ({
  AUTH_CONFIG: {
    jwtSecret: "test-secret-key-that-is-at-least-32-chars-long-for-hs256",
    jwtExpiry: 86400,
    bcryptRounds: 4,
    usernameMinLength: 3,
    usernameMaxLength: 20,
    usernamePattern: /^[a-zA-Z0-9_\-@.!#$%^&*()+=]+$/,
    passwordMinLength: 8,
  },
  APP_CONFIG: {
    dataDir: "",
    port: 3000,
  },
  OLLAMA_CONFIG: {},
  TTS_CONFIG: {},
  TIME: {
    ONE_SECOND: 1000,
    ONE_MINUTE: 60000,
    ONE_HOUR: 3600000,
    ONE_DAY: 86400000,
    THREE_DAYS: 259200000,
    SEVEN_DAYS: 604800000,
    THIRTY_DAYS: 2592000000,
    NINETY_DAYS: 7776000000,
  },
  CONTENT_LIMITS: {},
  TIMEOUTS: {},
  IDLE_TIERS: {},
  MEMORY_CONFIG: {},
  EVENT_BUS_CONFIG: {},
  JOB_CONFIG: {},
  PROMPT_BUDGET: {},
}));

mock.module("@/lib/db", () => ({
  getDb: () => mockDb,
}));

mock.module("@/lib/rate-limiter", () => ({
  checkRateLimit: () => ({ allowed: true }),
  createRateLimitResponse: () => NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }),
  cleanupExpiredEntries: () => {},
  getClientIp: () => "127.0.0.1",
}));

mock.module("@/lib/auth-token", () => ({
  getAuthToken: () => _mockAuthToken,
}));

mock.module("@/lib/with-auth", () => ({
  withAuth: () => _mockWithAuthResult,
}));

mock.module("@/lib/group-migrations", () => ({
  ensureGroupSupport: () => {},
  isGroupMember: () => true,
}));

mock.module("@/lib/with-error-handler", () => ({
  withErrorHandler: (handler: (...args: unknown[]) => Promise<Response>) => handler,
}));

mock.module("@/lib/error-response", () => ({
  requireJson: (request: Request) => {
    const contentType = request.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw NextResponse.json(
        { error: "Unsupported Media Type. Content-Type must be application/json" },
        { status: 415 }
      );
    }
  },
  notFoundError: (resource: string) =>
    NextResponse.json({ error: `${resource} not found` }, { status: 404 }),
  badRequestError: (message: string) =>
    NextResponse.json({ error: message }, { status: 400 }),
  forbiddenError: () =>
    NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  unauthorizedError: () =>
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  serverError: () =>
    NextResponse.json({ error: "Internal server error" }, { status: 500 }),
  errorResponse: (message: string, status: number) =>
    NextResponse.json({ error: message }, { status }),
}));

mock.module("@/lib/logger", () => ({
  getCorrelationId: () => undefined,
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

// ===========================================================================
// Import route handlers AFTER mocks are registered
// ===========================================================================

const registerRoute = await import("../auth/register/route");
const loginRoute = await import("../auth/login/route");
const logoutRoute = await import("../auth/logout/route");
const meRoute = await import("../auth/me/route");

// ===========================================================================
// Test database factory
// ===========================================================================

function createAuthDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      settings TEXT DEFAULT '{}',
      password_changed_at DATETIME,
      last_active_group_id TEXT,
      last_active_session_id TEXT,
      last_active_universe_id TEXT
    );

    CREATE TABLE IF NOT EXISTS token_denylist (
      token_id TEXT PRIMARY KEY,
      expires_at DATETIME NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_denylist_expires ON token_denylist(expires_at);
  `);

  return db;
}

// ===========================================================================
// Helper: create a NextRequest with JSON body and auth cookie
// ===========================================================================

function createJsonRequest(
  url: string,
  method: string,
  body: Record<string, unknown>,
  options?: { cookie?: boolean }
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options?.cookie) {
    headers["Cookie"] = "auth-token=mock-auth-token";
  }
  return new NextRequest(url, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

// ===========================================================================
// Setup / teardown
// ===========================================================================

beforeEach(() => {
  mockDb = createAuthDb();
  _mockWithAuthResult = { auth: { userId: "test-user-id", decoded: { sub: "test-user-id", jti: "mock-jti", exp: 9999999999, iat: 1000000000, username: "testuser", pwd_changed_at: null } } };
  _mockAuthToken = "mock-auth-token";
});

afterEach(() => {
  if (mockDb && mockDb.open) {
    mockDb.close();
  }
});

// ===========================================================================
// POST /api/auth/register
// ===========================================================================

describe("POST /api/auth/register", () => {
  it("creates a user and returns 201 with user object", async () => {
    const req = createJsonRequest(
      "http://localhost/api/auth/register",
      "POST",
      { username: "NewUser", password: "Password1" }
    );

    const res = await registerRoute.POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user).toBeDefined();
    expect(body.user.username).toBe("NewUser");
    expect(body.user.id).toBeTruthy();
  });

  it("returns 400 when username is missing", async () => {
    const req = createJsonRequest(
      "http://localhost/api/auth/register",
      "POST",
      { password: "Password1" }
    );

    const res = await registerRoute.POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Username and password are required");
  });

  it("returns 400 when password is missing", async () => {
    const req = createJsonRequest(
      "http://localhost/api/auth/register",
      "POST",
      { username: "NewUser" }
    );

    const res = await registerRoute.POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Username and password are required");
  });

  it("returns 400 when username is too short", async () => {
    const req = createJsonRequest(
      "http://localhost/api/auth/register",
      "POST",
      { username: "ab", password: "Password1" }
    );

    const res = await registerRoute.POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Username must be");
  });

  it("returns 400 when password fails validation", async () => {
    const req = createJsonRequest(
      "http://localhost/api/auth/register",
      "POST",
      { username: "ValidUser", password: "short" }
    );

    const res = await registerRoute.POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Password must be at least");
  });

  it("returns 409 when username already exists", async () => {
    // First registration should succeed
    const req1 = createJsonRequest(
      "http://localhost/api/auth/register",
      "POST",
      { username: "ExistingUser", password: "Password1" }
    );
    const res1 = await registerRoute.POST(req1);
    expect(res1.status).toBe(201);

    // Second registration with same username should fail
    const req2 = createJsonRequest(
      "http://localhost/api/auth/register",
      "POST",
      { username: "ExistingUser", password: "OtherPass1" }
    );
    const res2 = await registerRoute.POST(req2);
    expect(res2.status).toBe(409);

    const body2 = await res2.json();
    expect(body2.error).toContain("already exists");
  });
});

// ===========================================================================
// POST /api/auth/login
// ===========================================================================

describe("POST /api/auth/login", () => {
  async function createTestUser(): Promise<void> {
    const req = createJsonRequest(
      "http://localhost/api/auth/register",
      "POST",
      { username: "LoginUser", password: "TestPass1" }
    );
    const res = await registerRoute.POST(req);
    expect(res.status).toBe(201);
  }

  it("returns 200 with user and cookie for valid credentials", async () => {
    await createTestUser();

    const req = createJsonRequest(
      "http://localhost/api/auth/login",
      "POST",
      { username: "LoginUser", password: "TestPass1" }
    );

    const res = await loginRoute.POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user).toBeDefined();
    expect(body.user.username).toBe("LoginUser");
    expect(body.user.id).toBeTruthy();

    // Should set auth-token cookie
    const cookies = res.headers.getSetCookie();
    const authCookie = cookies.find((c) => c.startsWith("auth-token="));
    expect(authCookie).toBeDefined();
    expect(authCookie).toContain("HttpOnly");
    expect(authCookie).toContain("Secure");
    expect(authCookie.toLowerCase()).toContain("samesite=strict");
  });

  it("returns 401 for wrong password", async () => {
    await createTestUser();

    const req = createJsonRequest(
      "http://localhost/api/auth/login",
      "POST",
      { username: "LoginUser", password: "WrongPass1" }
    );

    const res = await loginRoute.POST(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Invalid username or password");
  });

  it("returns 401 for non-existent user", async () => {
    const req = createJsonRequest(
      "http://localhost/api/auth/login",
      "POST",
      { username: "NoSuchUser", password: "TestPass1" }
    );

    const res = await loginRoute.POST(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Invalid username or password");
  });

  it("returns 400 when username is missing", async () => {
    const req = createJsonRequest(
      "http://localhost/api/auth/login",
      "POST",
      { password: "TestPass1" }
    );

    const res = await loginRoute.POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Username and password are required");
  });
});

// ===========================================================================
// POST /api/auth/logout
// ===========================================================================

describe("POST /api/auth/logout", () => {
  it("returns 200 with cleared cookie", async () => {
    const req = createJsonRequest(
      "http://localhost/api/auth/logout",
      "POST",
      {},
      { cookie: true }
    );

    const res = await logoutRoute.POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    // Cookie should be cleared (maxAge=0)
    const cookies = res.headers.getSetCookie();
    const authCookie = cookies.find((c) => c.startsWith("auth-token="));
    expect(authCookie).toBeDefined();
    expect(authCookie).toContain("Max-Age=0");
  });

  it("succeeds gracefully without auth token", async () => {
    _mockAuthToken = undefined;

    const req = createJsonRequest(
      "http://localhost/api/auth/logout",
      "POST",
      {}
    );

    const res = await logoutRoute.POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 200 and clears cookie when token verification fails", async () => {
    // Mock verifyToken to throw by providing a token that will fail
    // The real verifyToken will fail because the mock DB has no denylist table
    const req = createJsonRequest(
      "http://localhost/api/auth/logout",
      "POST",
      {},
      { cookie: true }
    );

    const res = await logoutRoute.POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    // Cookie should still be cleared even if verification failed
    const cookies = res.headers.getSetCookie();
    const authCookie = cookies.find((c) => c.startsWith("auth-token="));
    expect(authCookie).toContain("Max-Age=0");
  });
});

// ===========================================================================
// GET /api/auth/me
// ===========================================================================

describe("GET /api/auth/me", () => {
  async function setupAuthenticatedUser(): Promise<string> {
    const req = createJsonRequest(
      "http://localhost/api/auth/register",
      "POST",
      { username: "MeUser", password: "TestPass1" }
    );
    const res = await registerRoute.POST(req);
    const body = await res.json();
    return body.user.id;
  }

  it("returns 200 with user data when authenticated", async () => {
    const userId = await setupAuthenticatedUser();

    // Override withAuth to return the actual userId
    _mockWithAuthResult = {
      auth: {
        userId,
        decoded: { sub: userId, jti: "mock-jti", exp: 9999999999, iat: 1000000000, username: "MeUser", pwd_changed_at: null },
      },
    };

    const req = new NextRequest("http://localhost/api/auth/me", {
      headers: { Cookie: "auth-token=mock-token" },
    });

    const res = await meRoute.GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe(userId);
    expect(body.user.username).toBe("MeUser");
    expect(body.user.createdAt).toBeTruthy();
    expect(body.activeState).toBeDefined();
  });

  it("returns 401 when not authenticated", async () => {
    // Make withAuth return error
    const errorRes = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    _mockWithAuthResult = { error: errorRes };

    const req = new NextRequest("http://localhost/api/auth/me");

    const res = await meRoute.GET(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when user does not exist in database", async () => {
    // withAuth returns a valid userId, but no user exists with that ID
    const nonexistentId = crypto.randomUUID();
    _mockWithAuthResult = {
      auth: {
        userId: nonexistentId,
        decoded: { sub: nonexistentId, jti: "mock-jti", exp: 9999999999, iat: 1000000000, username: "ghost", pwd_changed_at: null },
      },
    };

    const req = new NextRequest("http://localhost/api/auth/me", {
      headers: { Cookie: "auth-token=mock-token" },
    });

    const res = await meRoute.GET(req);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toContain("User not found");
  });
});

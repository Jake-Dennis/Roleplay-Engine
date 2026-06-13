/**
 * API Integration Tests: Sessions Routes
 *
 * Tests the full request/response cycle for session endpoints:
 *   GET  /api/sessions
 *   POST /api/sessions
 *   GET  /api/sessions/[id]
 *
 * Strategy:
 *   - Mock @/lib/db with an in-memory SQLite database containing test data.
 *   - Mock @/lib/with-auth to bypass JWT verification.
 *   - Mock @/lib/rate-limiter to always allow requests.
 *   - Mock wiki modules to avoid filesystem operations.
 *   - Import actual route handlers and test with NextRequest.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { NextRequest, NextResponse } from "next/server";
import { Database } from "bun:sqlite";
import crypto from "crypto";

// ===========================================================================
// Mutable mock state
// ===========================================================================

let mockDb: Database;
let _userId: string;

/** Controls what withAuth() returns — reassign per test. */
let _mockWithAuthResult: unknown;

// ===========================================================================
// Module mocks — MUST appear before any imports under test.
// ===========================================================================

mock.module("@/lib/db", () => ({
  getDb: () => mockDb,
}));

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
  APP_CONFIG: { dataDir: "", port: 3000 },
  OLLAMA_CONFIG: {},
  TTS_CONFIG: {},
  TIME: { ONE_SECOND: 1000, ONE_MINUTE: 60000, ONE_HOUR: 3600000, ONE_DAY: 86400000 },
  CONTENT_LIMITS: {},
  TIMEOUTS: {},
  IDLE_TIERS: {},
  MEMORY_CONFIG: {},
  EVENT_BUS_CONFIG: {},
  JOB_CONFIG: {},
  PROMPT_BUDGET: {},
}));

mock.module("@/lib/rate-limiter", () => ({
  checkRateLimit: () => ({ allowed: true }),
  createRateLimitResponse: () => NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }),
  cleanupExpiredEntries: () => {},
  getClientIp: () => "127.0.0.1",
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

// Mock wiki modules to avoid filesystem operations
mock.module("@/lib/wiki/wiki-root", () => ({
  getWikiRoot: () => "/tmp/test-wiki-root",
}));

mock.module("@/lib/wiki/file-io", () => ({
  writeWikiPage: () => {},
  listWikiPages: () => [],
  deleteWikiPage: () => {},
  readWikiPage: () => ({ content: "", frontmatter: {} }),
  sanitizeWikiFilename: (name: string) => name,
  ConflictError: class extends Error {
    existingLastModified: string;
    constructor(message: string, existingLastModified: string) {
      super(message);
      this.name = "ConflictError";
      this.existingLastModified = existingLastModified;
    }
  },
  WikiFrontmatter: class {},
}));

mock.module("@/lib/wiki/index-generator", () => ({
  generateIndex: () => {},
}));

mock.module("@/lib/job-processor", () => ({
  queueJob: () => {},
  processJobsByType: () => {},
  processUserJobs: () => {},
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
  serverError: () =>
    NextResponse.json({ error: "Internal server error" }, { status: 500 }),
  errorResponse: (message: string, status: number) =>
    NextResponse.json({ error: message }, { status }),
}));

mock.module("@/lib/logger", () => ({
  getCorrelationId: () => undefined,
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

// ===========================================================================
// Import route handlers AFTER mocks are registered
// ===========================================================================

const sessionsListRoute = await import("../sessions/route");
const sessionsDetailRoute = await import("../sessions/[id]/route");

// ===========================================================================
// Test database factory
// ===========================================================================

function createSessionsDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      settings TEXT DEFAULT '{}',
      password_changed_at DATETIME
    );

    CREATE TABLE universes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      universe_id TEXT REFERENCES universes(id),
      timeline_id TEXT,
      status TEXT DEFAULT 'active',
      type TEXT DEFAULT 'solo',
      group_id TEXT,
      persona_id TEXT,
      narrative_phase TEXT DEFAULT 'setup',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );

    CREATE TABLE session_participants (
      session_id TEXT NOT NULL REFERENCES sessions(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT DEFAULT 'player',
      character_name TEXT,
      entity_id TEXT REFERENCES entity_registry(id),
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, user_id)
    );

    CREATE TABLE scene_states (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      active_location_id TEXT,
      current_goal TEXT,
      emotional_tone TEXT,
      active_npcs TEXT,
      active_npc_ids TEXT,
      active_threads TEXT,
      scene_summary TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      sender_id TEXT,
      content TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      parent_message_id TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      persona_id TEXT,
      speaking_as TEXT
    );

    CREATE TABLE session_config (
      session_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (session_id, key)
    );
  `);

  return db;
}

// ===========================================================================
// Helpers
// ===========================================================================

function createJsonRequest(
  url: string,
  method: string,
  body?: Record<string, unknown>
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function insertTestUser(db: Database): string {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
  ).run(id, `user_${id.slice(0, 8)}`, "hash");
  return id;
}

function insertTestUniverse(db: Database, userId: string): string {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO universes (id, user_id, name, description) VALUES (?, ?, ?, ?)"
  ).run(id, userId, "Test Universe", "Description");
  return id;
}

function insertTestSession(
  db: Database,
  userId: string,
  universeId: string,
  overrides?: Partial<{ name: string; status: string }>
): string {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO sessions (id, owner_id, name, universe_id, status, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
  ).run(id, userId, overrides?.name || "Test Session", universeId, overrides?.status || "active");
  return id;
}

// ===========================================================================
// Setup / teardown
// ===========================================================================

beforeEach(() => {
  mockDb = createSessionsDb();
  _userId = insertTestUser(mockDb);
  _mockWithAuthResult = {
    auth: {
      userId: _userId,
      decoded: { sub: _userId, jti: "mock-jti", exp: 9999999999, iat: 1000000000, username: "testuser", pwd_changed_at: null },
    },
  };
});

afterEach(() => {
  if (mockDb && mockDb.open) {
    mockDb.close();
  }
});

// ===========================================================================
// GET /api/sessions
// ===========================================================================

describe("GET /api/sessions", () => {
  it("returns empty list when user has no sessions", async () => {
    const req = new NextRequest("http://localhost/api/sessions");
    const res = await sessionsListRoute.GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.sessions).toBeDefined();
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(body.sessions).toHaveLength(0);
  });

  it("returns user's sessions as a camelized array", async () => {
    const universeId = insertTestUniverse(mockDb, _userId);
    insertTestSession(mockDb, _userId, universeId, { name: "Session Alpha" });
    insertTestSession(mockDb, _userId, universeId, { name: "Session Beta" });

    const req = new NextRequest("http://localhost/api/sessions");
    const res = await sessionsListRoute.GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.sessions).toHaveLength(2);

    // Verify camelCase keys
    const names = body.sessions.map((s: Record<string, unknown>) => s.name).sort();
    expect(names).toEqual(["Session Alpha", "Session Beta"]);

    // Verify camelCase mapping (owner_id -> ownerId)
    expect(body.sessions[0].ownerId).toBe(_userId);
  });

  it("filters by personal scope", async () => {
    const universeId = insertTestUniverse(mockDb, _userId);
    insertTestSession(mockDb, _userId, universeId, { name: "Personal Session" });

    const req = new NextRequest("http://localhost/api/sessions?scope=personal");
    const res = await sessionsListRoute.GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].name).toBe("Personal Session");
  });

  it("returns 401 when not authenticated", async () => {
    _mockWithAuthResult = {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };

    const req = new NextRequest("http://localhost/api/sessions");
    const res = await sessionsListRoute.GET(req);
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/sessions
// ===========================================================================

describe("POST /api/sessions", () => {
  it("creates a session and returns 201 with the created session", async () => {
    const universeId = insertTestUniverse(mockDb, _userId);

    const req = createJsonRequest("http://localhost/api/sessions", "POST", {
      name: "New Session",
      universe_id: universeId,
    });

    const res = await sessionsListRoute.POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.session).toBeDefined();
    expect(body.session.name).toBe("New Session");
    expect(body.session.universeId).toBe(universeId);
    expect(body.session.ownerId).toBe(_userId);
    expect(body.session.status).toBe("active");
  });

  it("returns 400 when session name is missing", async () => {
    const universeId = insertTestUniverse(mockDb, _userId);

    const req = createJsonRequest("http://localhost/api/sessions", "POST", {
      universe_id: universeId,
    });

    const res = await sessionsListRoute.POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Session name is required");
  });

  it("returns 400 when universe_id is missing", async () => {
    const req = createJsonRequest("http://localhost/api/sessions", "POST", {
      name: "No Universe Session",
    });

    const res = await sessionsListRoute.POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("universe_id is required");
  });

  it("creates a session with optional fields (type, timeline_id)", async () => {
    const universeId = insertTestUniverse(mockDb, _userId);

    const req = createJsonRequest("http://localhost/api/sessions", "POST", {
      name: "Group Session",
      universe_id: universeId,
      type: "group",
      timeline_id: "timeline-1",
    });

    const res = await sessionsListRoute.POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.session.type).toBe("group");
    // timelineId should be present since we set it
    // (camelized from timeline_id)
    expect(body.session.timelineId).toBe("timeline-1");
  });

  it("returns 401 when not authenticated", async () => {
    _mockWithAuthResult = {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };

    const req = createJsonRequest("http://localhost/api/sessions", "POST", {
      name: "Unauthenticated Session",
      universe_id: crypto.randomUUID(),
    });

    const res = await sessionsListRoute.POST(req);
    expect(res.status).toBe(401);
  });

  it("adds creator as a participant and creates scene_state", async () => {
    const universeId = insertTestUniverse(mockDb, _userId);

    const req = createJsonRequest("http://localhost/api/sessions", "POST", {
      name: "Session With Participants",
      universe_id: universeId,
    });

    const res = await sessionsListRoute.POST(req);
    expect(res.status).toBe(201);

    // Read response body first
    const body = await res.json();
    const sessionId = body.session.id;

    // Verify participant was added
    const parts = mockDb.prepare(
      "SELECT * FROM session_participants WHERE session_id = ?"
    ).all(sessionId) as Array<Record<string, unknown>>;
    expect(parts).toHaveLength(1);
    expect(parts[0].user_id).toBe(_userId);
    expect(parts[0].role).toBe("player");

    // Verify scene_state was created
    const sceneState = mockDb.prepare(
      "SELECT * FROM scene_states WHERE session_id = ?"
    ).get(sessionId);
    expect(sceneState).toBeDefined();
  });
});

// ===========================================================================
// GET /api/sessions/[id]
// ===========================================================================

describe("GET /api/sessions/[id]", () => {
  it("returns session details with messages, participants, and scene state", async () => {
    const universeId = insertTestUniverse(mockDb, _userId);
    const sessionId = insertTestSession(mockDb, _userId, universeId, { name: "Detailed Session" });

    // Add participant
    mockDb.prepare(
      "INSERT INTO session_participants (session_id, user_id, role) VALUES (?, ?, ?)"
    ).run(sessionId, _userId, "player");

    // Add scene state
    mockDb.prepare(
      "INSERT INTO scene_states (id, session_id, active_location_id, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
    ).run(crypto.randomUUID(), sessionId, "location-1");

    // Add a message
    const messageId = crypto.randomUUID();
    mockDb.prepare(
      "INSERT INTO messages (id, session_id, sender_id, content) VALUES (?, ?, ?, ?)"
    ).run(messageId, sessionId, _userId, "Hello world!");

    const req = new NextRequest(`http://localhost/api/sessions/${sessionId}`);
    const res = await sessionsDetailRoute.GET(req, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.session).toBeDefined();
    expect(body.session.name).toBe("Detailed Session");
    expect(body.session.ownerId).toBe(_userId);
    expect(body.messages).toBeDefined();
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages).toHaveLength(1);
    expect(body.participants).toBeDefined();
    expect(body.participants).toHaveLength(1);
    expect(body.sceneState).toBeDefined();
    // sceneState uses snake_case keys (not camelized)
    expect(body.sceneState.active_location_id).toBe("location-1");
    expect(body.turnConfig).toBeDefined();
    expect(body.isOwner).toBe(true);
  });

  it("returns 400 for invalid UUID format", async () => {
    const req = new NextRequest("http://localhost/api/sessions/not-a-uuid");
    const res = await sessionsDetailRoute.GET(req, {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Invalid ID format");
  });

  it("returns 404 for non-existent session", async () => {
    const fakeId = crypto.randomUUID();
    const req = new NextRequest(`http://localhost/api/sessions/${fakeId}`);
    const res = await sessionsDetailRoute.GET(req, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toContain("Session not found");
  });

  it("returns 401 when not authenticated", async () => {
    _mockWithAuthResult = {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };

    const req = new NextRequest("http://localhost/api/sessions/some-id");
    const res = await sessionsDetailRoute.GET(req, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(res.status).toBe(401);
  });
});

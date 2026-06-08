/**
 * API Integration Tests: Generate Route
 *
 * Tests the primary generation endpoint:
 *   POST /api/generate/[id] — triggers LLM narrative generation
 *
 * Strategy:
 *   - Mock @/lib/db with an in-memory SQLite database with test session data.
 *   - Mock @/lib/with-auth to bypass JWT verification.
 *   - Mock @/lib/rate-limiter to always allow requests.
 *   - Mock @/lib/ollama to provide fake generation chunks.
 *   - Mock @/lib/retrieval to return a simple context.
 *   - Mock event-bus, job-processor, prompts, and other side-effect modules.
 *   - Import the actual route handler and test with NextRequest.
 *   - Read the SSE stream response to verify content.
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
let _sessionId: string;
let _universeId: string;

let _mockWithAuthResult: unknown;

/** Track chunks emitted by the mock generateTextStream */
let _emittedChunks: string[] = [];

/** Choices to return from mock generateText */
let _mockChoices: string[] = ["Explore the cave", "Follow the river", "Climb the cliff", "Return to camp"];

// ===========================================================================
// Module mocks
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
  EVENT_BUS_CONFIG: { MAX_HISTORY: 100, MAX_CONNECTIONS: 50 },
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
}));

mock.module("@/lib/ollama", () => ({
  generateTextStream: async (
    _prompt: string,
    onChunk: (chunk: string) => void
  ) => {
    for (const chunk of _emittedChunks) {
      onChunk(chunk);
    }
  },
  generateText: async (_prompt: string) => {
    return JSON.stringify({ options: _mockChoices });
  },
  getUserModels: () => ({
    llmModel: "test-model",
    embeddingModel: "test-embedding",
  }),
  getActivePersonaContext: () => null,
  buildPersonaPrompt: (_persona: unknown, baseSystemPrompt: string) => baseSystemPrompt,
  validateLlmOutput: (output: string) => output,
}));

mock.module("@/lib/retrieval", () => ({
  getRetrievedContext: async () => ({
    scene: {
      location: null,
      goal: null,
      tone: null,
      currentIntent: null,
      activeNpcs: [],
      activeThreads: [],
    },
    lore: {
      entries: [],
      nearbyPages: [],
    },
    relationships: {
      entries: [],
    },
    recentMessages: {
      messages: [],
      messageCount: 0,
    },
    canonContext: null,
    intent: {
      type: "exploration",
      description: "Exploring the world",
    },
    memories: { entries: [] },
    narrativeThreads: [],
    messageSummaries: [],
    activeEntities: [],
  }),
  assemblePromptWithBudget: () => "Mock assembled prompt for testing",
  RetrievedContext: class {},
}));

mock.module("@/lib/prompt-builder", () => ({
  assemblePromptWithBudget: () => "Mock assembled prompt for testing",
}));

mock.module("@/lib/event-bus", () => ({
  eventBus: {
    emit: () => {},
    on: () => () => {},
    registerController: () => {},
    unregisterController: () => {},
  },
  SessionEvents: {
    GENERATION_STARTED: "generation:started",
    GENERATION_DONE: "generation:done",
  },
}));

mock.module("@/lib/job-processor", () => ({
  queueJob: () => {},
  processJobsByType: async () => {},
  processUserJobs: async () => {},
}));

mock.module("@/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

mock.module("@/lib/prompts", () => ({
  PROMPTS: {
    generateChoices: (_userMsg: string, _aiResponse: string) =>
      `Generate 4 choices as JSON. Output ONLY valid JSON: {"options": ["a","b","c","d"]}`,
  },
}));

mock.module("@/lib/ollama-busy", () => ({
  markOllamaBusy: () => {},
  markOllamaIdle: () => {},
  isOllamaBusy: () => false,
}));

mock.module("@/lib/validation", () => ({
  validateLength: (value: string, max: number, field: string) => {
    if (typeof value !== "string") return null;
    if (value.length > max) return `${field} must be ${max} characters or less`;
    return null;
  },
}));

// ===========================================================================
// Import route handler AFTER mocks
// ===========================================================================

const generateRoute = await import("../generate/[id]/route");

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

function setupTestData(): void {
  mockDb = new Database(":memory:");
  mockDb.run("PRAGMA foreign_keys = ON");

  mockDb.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      settings TEXT DEFAULT '{}',
      password_changed_at DATETIME,
      canon_mode TEXT
    );

    CREATE TABLE universes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      canon_mode TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      universe_id TEXT REFERENCES universes(id),
      status TEXT DEFAULT 'active',
      type TEXT DEFAULT 'solo',
      persona_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );

    CREATE TABLE session_participants (
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'player',
      character_name TEXT,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, user_id)
    );

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      sender_id TEXT,
      content TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      parent_message_id TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE scene_states (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      current_intent TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE personas (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      personality TEXT,
      writing_style TEXT,
      scenario TEXT,
      first_mes TEXT,
      mes_example TEXT,
      creator_notes TEXT,
      system_prompt TEXT,
      post_history_instructions TEXT,
      tags TEXT,
      llm_model TEXT,
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE npcs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      universe_id TEXT REFERENCES universes(id),
      name TEXT NOT NULL,
      description TEXT,
      personality_traits TEXT,
      is_canon INTEGER DEFAULT 0
    );

    CREATE TABLE session_config (
      session_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (session_id, key)
    );

    CREATE TABLE job_queue (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      priority TEXT DEFAULT 'low',
      status TEXT DEFAULT 'queued',
      payload TEXT DEFAULT '{}',
      progress REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create test user
  _userId = crypto.randomUUID();
  mockDb.prepare(
    "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
  ).run(_userId, "genuser", "hash");

  // Create test universe
  _universeId = crypto.randomUUID();
  mockDb.prepare(
    "INSERT INTO universes (id, user_id, name, description) VALUES (?, ?, ?, ?)"
  ).run(_universeId, _userId, "Gen Universe", "For generation tests");

  // Create test session
  _sessionId = crypto.randomUUID();
  mockDb.prepare(
    "INSERT INTO sessions (id, owner_id, name, universe_id, status) VALUES (?, ?, ?, ?, ?)"
  ).run(_sessionId, _userId, "Gen Session", _universeId, "active");

  // Add participant
  mockDb.prepare(
    "INSERT INTO session_participants (session_id, user_id, role) VALUES (?, ?, ?)"
  ).run(_sessionId, _userId, "player");

  // Add scene state
  mockDb.prepare(
    "INSERT INTO scene_states (id, session_id, current_intent, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
  ).run(crypto.randomUUID(), _sessionId, null);
}

beforeEach(() => {
  setupTestData();
  _mockWithAuthResult = {
    auth: {
      userId: _userId,
      decoded: { sub: _userId, jti: "mock-jti", exp: 9999999999, iat: 1000000000, username: "genuser", pwd_changed_at: null },
    },
  };
  _emittedChunks = ["The dark forest ", "stretches before you, ", "its ancient trees ", "whispering secrets."];
  _mockChoices = ["Explore the cave", "Follow the river", "Climb the cliff", "Return to camp"];
});

afterEach(() => {
  if (mockDb && mockDb.open) {
    mockDb.close();
  }
});

// ===========================================================================
// POST /api/generate/[id]
// ===========================================================================

describe("POST /api/generate/[id]", () => {
  it("returns a streaming SSE response with chunks, done signal, and choices", async () => {
    const req = createJsonRequest(
      `http://localhost/api/generate/${_sessionId}`,
      "POST",
      { userMessage: "I look around the dark forest." }
    );

    const res = await generateRoute.POST(req, {
      params: Promise.resolve({ id: _sessionId }),
    });

    // Should be a streaming response
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");

    // Read the full stream
    const streamText = await res.text();
    const lines = streamText.trim().split("\n").filter(Boolean);

    // Should have chunk lines, a done line, and a choices line
    expect(lines.length).toBeGreaterThanOrEqual(6); // 4 chunks + done + choices

    // Verify chunks are JSON lines with "chunk" key
    const chunkLines = lines.filter((l) => l.includes('"chunk"'));
    expect(chunkLines.length).toBe(4);

    // Verify all emitted chunks are present
    const allChunks = lines
      .filter((l) => l.includes('"chunk"'))
      .map((l) => JSON.parse(l).chunk)
      .join("");
    expect(allChunks).toBe("The dark forest stretches before you, its ancient trees whispering secrets.");

    // Verify done signal
    const doneLine = lines.find((l) => l.includes('"done"'));
    expect(doneLine).toBeDefined();
    const doneObj = JSON.parse(doneLine!);
    expect(doneObj.done).toBe(true);
    expect(doneObj.messageId).toBeTruthy();
    expect(doneObj.intent).toBeDefined();

    // Verify choices
    const choicesLine = lines.find((l) => l.includes('"choices"'));
    expect(choicesLine).toBeDefined();
    const choicesObj = JSON.parse(choicesLine!);
    expect(choicesObj.choices).toEqual(_mockChoices);
  });

  it("returns 400 when userMessage is missing", async () => {
    const req = createJsonRequest(
      `http://localhost/api/generate/${_sessionId}`,
      "POST",
      {}
    );

    const res = await generateRoute.POST(req, {
      params: Promise.resolve({ id: _sessionId }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("userMessage is required");
  });

  it("returns 400 when userMessage exceeds 10000 characters", async () => {
    const req = createJsonRequest(
      `http://localhost/api/generate/${_sessionId}`,
      "POST",
      { userMessage: "X".repeat(10001) }
    );

    const res = await generateRoute.POST(req, {
      params: Promise.resolve({ id: _sessionId }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("userMessage must be");
  });

  it("returns 404 when session does not exist", async () => {
    const fakeId = crypto.randomUUID();
    const req = createJsonRequest(
      `http://localhost/api/generate/${fakeId}`,
      "POST",
      { userMessage: "Hello?" }
    );

    const res = await generateRoute.POST(req, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toContain("Session not found");
  });

  it("returns 404 when user is not a participant of the session", async () => {
    // Create another user who is NOT a participant
    const otherUserId = crypto.randomUUID();
    mockDb.prepare(
      "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
    ).run(otherUserId, "otheruser", "hash");

    _mockWithAuthResult = {
      auth: {
        userId: otherUserId,
        decoded: { sub: otherUserId, jti: "other-jti", exp: 9999999999, iat: 1000000000, username: "otheruser", pwd_changed_at: null },
      },
    };

    const req = createJsonRequest(
      `http://localhost/api/generate/${_sessionId}`,
      "POST",
      { userMessage: "Can I join?" }
    );

    const res = await generateRoute.POST(req, {
      params: Promise.resolve({ id: _sessionId }),
    });
    // Session exists but user is not owner or participant
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toContain("Session not found");
  });

  it("returns 401 when not authenticated", async () => {
    _mockWithAuthResult = {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };

    const req = createJsonRequest(
      `http://localhost/api/generate/${_sessionId}`,
      "POST",
      { userMessage: "Hello?" }
    );

    const res = await generateRoute.POST(req, {
      params: Promise.resolve({ id: _sessionId }),
    });
    expect(res.status).toBe(401);
  });

  it("creates an AI message placeholder in the database", async () => {
    const req = createJsonRequest(
      `http://localhost/api/generate/${_sessionId}`,
      "POST",
      { userMessage: "Who goes there?" }
    );

    const res = await generateRoute.POST(req, {
      params: Promise.resolve({ id: _sessionId }),
    });
    expect(res.status).toBe(200);

    // Read the stream to let it complete
    const streamText = await res.text();

    // Extract messageId from the done signal
    const lines = streamText.trim().split("\n").filter(Boolean);
    const doneLine = lines.find((l) => l.includes('"done"'));
    const doneObj = JSON.parse(doneLine!);
    const messageId = doneObj.messageId;

    // Verify the placeholder message was created in DB
    const message = mockDb.prepare(
      "SELECT * FROM messages WHERE id = ?"
    ).get(messageId) as Record<string, unknown> | undefined;
    expect(message).toBeDefined();
    expect(message!.session_id).toBe(_sessionId);
    expect(message!.sender_id).toBeNull(); // AI messages have null sender_id

    // After streaming, content should be updated with the full response
    expect(message!.content).toBe("The dark forest stretches before you, its ancient trees whispering secrets.");
  });
});

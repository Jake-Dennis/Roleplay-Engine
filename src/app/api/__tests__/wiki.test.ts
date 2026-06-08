/**
 * API Integration Tests: Wiki Routes
 *
 * Tests the full request/response cycle for wiki endpoints:
 *   GET  /api/wiki — list pages
 *   POST /api/wiki — create a wiki page
 *   GET  /api/wiki/[...slug] — get a wiki page
 *
 * Strategy:
 *   - Mock @/lib/db with an in-memory SQLite database.
 *   - Mock @/lib/with-auth to bypass JWT verification.
 *   - Mock @/lib/rate-limiter to always allow requests.
 *   - Mock most wiki filesystem modules to avoid real I/O.
 *   - Use real fs with temporary directories for actual filesystem tests.
 *   - Import actual route handlers and test with NextRequest.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { NextRequest, NextResponse } from "next/server";
import { Database } from "bun:sqlite";
import crypto from "crypto";

import fs from "fs";
import os from "os";
import path from "path";


// ===========================================================================
// Mutable mock state
// ===========================================================================

let mockDb: Database;
let _userId: string;

let _mockWithAuthResult: unknown;

/** In-memory "filesystem" for wiki pages */
const wikiStore = new Map<string, { content: string; frontmatter: Record<string, unknown> }>();

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
  serverError: () =>
    NextResponse.json({ error: "Internal server error" }, { status: 500 }),
  errorResponse: (message: string, status: number) =>
    NextResponse.json({ error: message }, { status }),
}));

mock.module("@/lib/logger", () => ({
  getCorrelationId: () => undefined,
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

// ---------------------------------------------------------------------------
// Wiki filesystem mocks
// ---------------------------------------------------------------------------

/** Track which paths exist for isPathWithinRoot */
let _wikiRoot = "/wiki";

mock.module("@/lib/wiki/wiki-root", () => ({
  getWikiRoot: (userId: string, universeId?: string) => {
    return _wikiRoot;
  },
}));

mock.module("@/lib/wiki/path-guard", () => ({
  isPathWithinRoot: (fullPath: string, root: string) => {
    // Normalize separators for cross-platform compatibility
    const normFull = fullPath.replace(/\\/g, "/");
    const normRoot = root.replace(/\\/g, "/");
    return normFull.startsWith(normRoot);
  },
}));

mock.module("@/lib/wiki/file-io", () => ({
  WikiFrontmatter: class {},
  ConflictError: class extends Error {
    existingLastModified: string;
    constructor(message: string, existingLastModified: string) {
      super(message);
      this.name = "ConflictError";
      this.existingLastModified = existingLastModified;
    }
  },
  readWikiPage: (fullPath: string) => {
    const normalized = fullPath.replace(/\\/g, "/");
    const entry = wikiStore.get(normalized);
    if (!entry) {
      const err = new Error("ENOENT: no such file");
      (err as NodeJS.ErrnoException).code = "ENOENT";
      throw err;
    }
    return {
      path: normalized,
      content: entry.content,
      frontmatter: entry.frontmatter,
    };
  },
  writeWikiPage: (fullPath: string, content: string, frontmatter: Record<string, unknown>) => {
    const normalized = fullPath.replace(/\\/g, "/");
    wikiStore.set(normalized, { content, frontmatter });
  },
  deleteWikiPage: (fullPath: string) => {
    const normalized = fullPath.replace(/\\/g, "/");
    wikiStore.delete(normalized);
  },
  listWikiPages: (root: string) => {
    const normalizedRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
    const pages: Array<{ path: string; content: string; frontmatter: Record<string, unknown> }> = [];
    for (const [filePath, entry] of wikiStore) {
      if (filePath.startsWith(normalizedRoot)) {
        pages.push({
          path: filePath,
          content: entry.content,
          frontmatter: { ...entry.frontmatter },
        });
      }
    }
    return pages;
  },
  sanitizeWikiFilename: (name: string) => {
    // Match the real sanitizeWikiFilename's behavior
    let safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "");
    safe = safe.replace(/\s+/g, "_");
    safe = safe.substring(0, 100);
    safe = safe.replace(/[.\s]+$/, "");
    safe = safe.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
    if (!safe) safe = `page_${Date.now()}`;
    return `${safe}.md`;
  },
}));

mock.module("@/lib/wiki/index-generator", () => ({
  generateIndex: () => {},
}));

mock.module("@/lib/wiki/orphans", () => ({
  findOrphans: () => [],
  getOrphanSuggestions: () => new Map(),
}));

mock.module("@/lib/wiki/wikilinks", () => ({
  parseWikilinks: () => [],
  resolveWikilink: () => null,
}));

mock.module("@/lib/wiki/revisions", () => ({
  saveRevision: () => {},
}));

mock.module("@/lib/wiki/history", () => ({
  recordVersion: () => {},
  createSnapshotFile: () => "",
  getNextVersionNumber: () => 1,
}));

// ===========================================================================
// Import route handlers AFTER mocks
// ===========================================================================

const wikiListRoute = await import("../wiki/route");
const wikiSlugRoute = await import("../wiki/[...slug]/route");

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

beforeEach(() => {
  mockDb = new Database(":memory:");
  mockDb.run("PRAGMA foreign_keys = ON");
  _userId = crypto.randomUUID();
  wikiStore.clear();
  _wikiRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-test-"));
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
  // Clean up temp wiki root
  if (_wikiRoot && _wikiRoot.startsWith(os.tmpdir())) {
    try { fs.rmSync(_wikiRoot, { recursive: true, force: true }); } catch {}
  }
});

// ===========================================================================
// GET /api/wiki
// ===========================================================================

describe("GET /api/wiki", () => {
  it("returns empty pages list when wiki root does not exist", async () => {
    const req = new NextRequest("http://localhost/api/wiki?universe_id=test-univ");
    const res = await wikiListRoute.GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.pages).toBeDefined();
    expect(Array.isArray(body.pages)).toBe(true);
    expect(body.pages).toHaveLength(0);
    expect(body.orphanPaths).toBeDefined();
    expect(body.orphanSuggestions).toBeDefined();
  });

  it("returns wiki pages when root exists and pages are present", async () => {
    // The wiki root is a real temp directory created in beforeEach
    const wikiRoot = _wikiRoot;
    // Create entity/location subdirectories on real fs so existsSync passes
    fs.mkdirSync(path.join(wikiRoot, "entities"), { recursive: true });
    fs.mkdirSync(path.join(wikiRoot, "locations"), { recursive: true });

    wikiStore.set(`${wikiRoot}/entities/haleth.md`.replace(/\\/g, "/"), {
      content: "# Haleth\nA brave warrior.",
      frontmatter: { title: "Haleth", type: "entity", status: "draft", universe: "test-univ" },
    });
    wikiStore.set(`${wikiRoot}/locations/forest.md`.replace(/\\/g, "/"), {
      content: "# Dark Forest\nA spooky place.",
      frontmatter: { title: "Dark Forest", type: "location", status: "draft", universe: "test-univ" },
    });

    const req = new NextRequest("http://localhost/api/wiki?universe_id=test-univ");
    const res = await wikiListRoute.GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.pages).toHaveLength(2);
  });

  it("returns 401 when not authenticated", async () => {
    _mockWithAuthResult = {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };

    const req = new NextRequest("http://localhost/api/wiki?universe_id=test");
    const res = await wikiListRoute.GET(req);
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/wiki
// ===========================================================================

describe("POST /api/wiki", () => {
  it("creates a wiki page and returns 200 with the sanitized path", async () => {
    const req = createJsonRequest("http://localhost/api/wiki", "POST", {
      path: "entities/Haleth",
      content: "# Haleth\nContent here.",
      frontmatter: { title: "Haleth", type: "entity", status: "draft" },
      universeId: "test-univ",
    });

    const res = await wikiListRoute.POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    // SanitizeWikiFilename adds .md and lowercases
    expect(body.path).toBe("entities/haleth.md");
  });

  it("creates a wiki page with auto-generated filename", async () => {
    const req = createJsonRequest("http://localhost/api/wiki", "POST", {
      path: "concepts/my concept",
      content: "# My Concept\nDetails.",
      frontmatter: { title: "My Concept", type: "concept", status: "draft" },
      universeId: "test-univ",
    });

    const res = await wikiListRoute.POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    // Sanitized: spaces replaced with underscores, .md appended
    expect(body.path).toBe("concepts/my_concept.md");
  });

  it("returns 400 when path is missing", async () => {
    const req = createJsonRequest("http://localhost/api/wiki", "POST", {
      content: "# No Path",
      frontmatter: { title: "No Path" },
    });

    const res = await wikiListRoute.POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("path, content, and frontmatter are required");
  });

  it("returns 400 when content is missing", async () => {
    const req = createJsonRequest("http://localhost/api/wiki", "POST", {
      path: "test.md",
      frontmatter: { title: "Test" },
    });

    const res = await wikiListRoute.POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when frontmatter is missing", async () => {
    const req = createJsonRequest("http://localhost/api/wiki", "POST", {
      path: "test.md",
      content: "# Test",
    });

    const res = await wikiListRoute.POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for path traversal attempts", async () => {
    const req = createJsonRequest("http://localhost/api/wiki", "POST", {
      path: "../../etc/passwd",
      content: "# Hack",
      frontmatter: { title: "Hack", type: "concept", status: "draft" },
    });

    const res = await wikiListRoute.POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("path traversal");
  });

  it("returns 401 when not authenticated", async () => {
    _mockWithAuthResult = {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };

    const req = createJsonRequest("http://localhost/api/wiki", "POST", {
      path: "test.md",
      content: "# Test",
      frontmatter: { title: "Test", type: "concept", status: "draft" },
    });

    const res = await wikiListRoute.POST(req);
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// GET /api/wiki/[...slug]
// ===========================================================================

describe("GET /api/wiki/[...slug]", () => {
  it("returns a wiki page by slug", async () => {
    // Seed a page into the store via the POST handler
    // Use a path without .md extension as sanitizeWikiFilename appends it
    const createReq = createJsonRequest("http://localhost/api/wiki", "POST", {
      path: "lore/ancient-history",
      content: "# Ancient History\nThe old world.",
      frontmatter: { title: "Ancient History", type: "lore", status: "draft", universe: "test-univ" },
      universeId: "test-univ",
    });
    const createRes = await wikiListRoute.POST(createReq);
    expect(createRes.status).toBe(200);

    // Now fetch it via slug
    const getReq = new NextRequest("http://localhost/api/wiki/lore/ancient-history?universe_id=test-univ");
    const res = await wikiSlugRoute.GET(getReq, {
      params: Promise.resolve({ slug: ["lore", "ancient-history"] }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.page).toBeDefined();
    expect(body.page.path).toBe("lore/ancient-history.md");
    expect(body.page.content).toContain("Ancient History");
    expect(body.page.frontmatter.title).toBe("Ancient History");
    expect(body.page.frontmatter.type).toBe("lore");
  });

  it("returns page when slug does not include .md extension", async () => {
    // Seed via POST (path without .md extension, sanitize will add it)
    const createReq = createJsonRequest("http://localhost/api/wiki", "POST", {
      path: "entities/hero",
      content: "# The Hero\nBrave.",
      frontmatter: { title: "The Hero", type: "entity", status: "draft", universe: "test-univ" },
      universeId: "test-univ",
    });
    await wikiListRoute.POST(createReq);

    // Fetch without .md extension
    const getReq = new NextRequest("http://localhost/api/wiki/entities/hero?universe_id=test-univ");
    const res = await wikiSlugRoute.GET(getReq, {
      params: Promise.resolve({ slug: ["entities", "hero"] }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.page).toBeDefined();
    expect(body.page.content).toContain("Brave");
  });

  it("returns 404 when wiki page does not exist", async () => {
    const req = new NextRequest("http://localhost/api/wiki/nonexistent/page?universe_id=test-univ");
    const res = await wikiSlugRoute.GET(req, {
      params: Promise.resolve({ slug: ["nonexistent", "page"] }),
    });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toContain("Wiki page not found");
  });

  it("returns allPages, backlinks, embeds, and orphanPaths alongside the page", async () => {
    // Seed two pages
    const createReq1 = createJsonRequest("http://localhost/api/wiki", "POST", {
      path: "entities/hero",
      content: "# Hero\nMain character.",
      frontmatter: { title: "Hero", type: "entity", status: "draft", universe: "test-univ" },
      universeId: "test-univ",
    });
    await wikiListRoute.POST(createReq1);

    const createReq2 = createJsonRequest("http://localhost/api/wiki", "POST", {
      path: "locations/castle",
      content: "# Castle\nThe hero's home.",
      frontmatter: { title: "Castle", type: "location", status: "draft", universe: "test-univ" },
      universeId: "test-univ",
    });
    await wikiListRoute.POST(createReq2);

    const req = new NextRequest("http://localhost/api/wiki/entities/hero?universe_id=test-univ");
    const res = await wikiSlugRoute.GET(req, {
      params: Promise.resolve({ slug: ["entities", "hero"] }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.allPages).toBeDefined();
    expect(Array.isArray(body.allPages)).toBe(true);
    expect(body.allPages.length).toBeGreaterThanOrEqual(2);
    expect(body.backlinks).toBeDefined();
    expect(body.orphanPaths).toBeDefined();
    expect(body.embeds).toBeDefined();
  });

  it("returns 401 when not authenticated", async () => {
    _mockWithAuthResult = {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };

    const req = new NextRequest("http://localhost/api/wiki/some-page");
    const res = await wikiSlugRoute.GET(req, {
      params: Promise.resolve({ slug: ["some-page"] }),
    });
    expect(res.status).toBe(401);
  });
});

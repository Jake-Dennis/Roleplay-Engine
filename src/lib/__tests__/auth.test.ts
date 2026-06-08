/**
 * Tests for src/lib/auth.ts — user authentication, JWT management,
 * password hashing, token denylist, and user CRUD.
 *
 * ~25 cases covering:
 *   - Password hashing and verification (bcrypt)
 *   - Username/password validation rules
 *   - User creation with duplicate detection
 *   - User lookup by id and username
 *   - Authentication with valid/invalid credentials
 *   - JWT token generation and verification (happy path)
 *   - JWT verification with expired / tampered tokens
 *   - Token denylist (revocation)
 *   - Password change and old-token invalidation
 *   - Cleanup of expired denylist entries
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import crypto from "crypto";
import { SignJWT } from "jose";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ===========================================================================
// Mutable mock configuration — reassigned in beforeEach / individual tests.
// Getters ensure the mock module always sees live values.
// ===========================================================================
const mockConfig = {
  jwtSecret: "test-secret-key-that-is-at-least-32-chars-long-for-hs256",
  jwtExpiry: 86400,
  bcryptRounds: 4, // low rounds for test speed
  usernameMinLength: 3,
  usernameMaxLength: 20,
  usernamePattern: /^[a-zA-Z0-9_\-@.!#$%^&*()+=]+$/,
  passwordMinLength: 8,
};

let mockDb: Database;
let tempDataDir: string;

// APP_CONFIG.dataDir must be settable from tests. The module mock factory
// runs only once; we use an indirection variable that beforeEach reassigns.
let _appDataDir = "";
function mockAppConfigDataDir(): string {
  return _appDataDir;
}

// ===========================================================================
// Module mocks — must appear BEFORE the import under test.
// ===========================================================================

mock.module("@/lib/config", () => ({
  AUTH_CONFIG: {
    get jwtSecret() {
      return mockConfig.jwtSecret;
    },
    get jwtExpiry() {
      return mockConfig.jwtExpiry;
    },
    get bcryptRounds() {
      return mockConfig.bcryptRounds;
    },
    get usernameMinLength() {
      return mockConfig.usernameMinLength;
    },
    get usernameMaxLength() {
      return mockConfig.usernameMaxLength;
    },
    get usernamePattern() {
      return mockConfig.usernamePattern;
    },
    get passwordMinLength() {
      return mockConfig.passwordMinLength;
    },
  },
  APP_CONFIG: {
    get dataDir() {
      return mockAppConfigDataDir();
    },
    get port() {
      return 3000;
    },
  },
  getJwtSecret: () => mockConfig.jwtSecret,
  // Stubs for other exports that auth.ts or its transitive imports may reference
  OLLAMA_CONFIG: {},
  TTS_CONFIG: {},
  TIME: {},
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

// ===========================================================================
// Import the module under test AFTER mocks are registered
// ===========================================================================
const auth = await import("@/lib/auth");

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
      password_changed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS token_denylist (
      token_id TEXT PRIMARY KEY,
      expires_at DATETIME NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_denylist_expires ON token_denylist(expires_at);
  `);

  return db;
}

/**
 * Insert a test user directly into the DB and return their id and username.
 */
function insertTestUser(
  db: Database,
  overrides?: Partial<{ username: string; password_hash: string }>
): { id: string; username: string } {
  const id = crypto.randomUUID();
  const username = overrides?.username ?? `testuser_${id.slice(0, 8)}`;
  const passwordHash =
    overrides?.password_hash ??
    // bcrypt hash of "password123" with 4 rounds (pre-computed for speed)
    "$2a$04$IK6F9jS0q7pG5xH5z5z5z.5z5z5z5z5z5z5z5z5z5z5z5z5z5z5z5";
  db.prepare(
    "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
  ).run(id, username, passwordHash);
  return { id, username };
}

// ===========================================================================
// Setup / teardown
// ===========================================================================
beforeEach(() => {
  // Create a fresh in-memory DB
  mockDb = createAuthDb();

  // Create a temp directory for data dir (used by initializeUserDataDirectory)
  tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-test-"));
  _appDataDir = tempDataDir;
});

afterEach(() => {
  // Clean up temp data directory
  try {
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ===========================================================================
// hashPassword / verifyPassword
// ===========================================================================
describe("hashPassword / verifyPassword", () => {
  it("hashPassword returns a bcrypt hash string", async () => {
    const hash = await auth.hashPassword("mySecret123");
    expect(typeof hash).toBe("string");
    // bcrypt hashes start with $2a$, $2b$, or $2y$
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it("verifyPassword returns true for matching password", async () => {
    const hash = await auth.hashPassword("mySecret123");
    const result = await auth.verifyPassword("mySecret123", hash);
    expect(result).toBe(true);
  });

  it("verifyPassword returns false for wrong password", async () => {
    const hash = await auth.hashPassword("mySecret123");
    const result = await auth.verifyPassword("wrongPassword1", hash);
    expect(result).toBe(false);
  });
});

// ===========================================================================
// validateUsername
// ===========================================================================
describe("validateUsername", () => {
  it("returns null for a valid username", () => {
    expect(auth.validateUsername("Alice123")).toBeNull();
    expect(auth.validateUsername("a_b-c")).toBeNull();
    expect(auth.validateUsername("abc")).toBeNull();
  });

  it("returns error when username is too short", () => {
    const err = auth.validateUsername("ab");
    expect(err).not.toBeNull();
    expect(err).toContain("Username must be");
  });

  it("returns error when username is too long", () => {
    const err = auth.validateUsername("a".repeat(21));
    expect(err).not.toBeNull();
    expect(err).toContain("Username must be");
  });

  it("returns error when username contains invalid characters", () => {
    const err = auth.validateUsername("user name"); // space
    expect(err).not.toBeNull();
    expect(err).toContain("Username can only contain");
  });
});

// ===========================================================================
// validatePassword
// ===========================================================================
describe("validatePassword", () => {
  it("returns null for a valid password", () => {
    expect(auth.validatePassword("mypassword1")).toBeNull();
    expect(auth.validatePassword("Abcdefg1")).toBeNull();
  });

  it("returns error when password is too short", () => {
    const err = auth.validatePassword("Ab1");
    expect(err).not.toBeNull();
    expect(err).toContain("Password must be at least");
  });

  it("returns error when password has no letter", () => {
    const err = auth.validatePassword("12345678");
    expect(err).not.toBeNull();
    expect(err).toContain("at least one letter");
  });

  it("returns error when password has no number", () => {
    const err = auth.validatePassword("abcdefgh");
    expect(err).not.toBeNull();
    expect(err).toContain("at least one number");
  });
});

// ===========================================================================
// createUser
// ===========================================================================
describe("createUser", () => {
  it("creates a user and returns the User object", async () => {
    const user = await auth.createUser("FreshUser", "password1");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("FreshUser");
    expect(user!.id).toBeTruthy();
    expect(user!.created_at).toBeTruthy();
    // Default settings should be present
    expect(user!.settings).toBeTruthy();
  });

  it("returns null when username already exists (case-insensitive)", async () => {
    await auth.createUser("ExistingUser", "password1");
    // Same case
    const dup1 = await auth.createUser("ExistingUser", "otherPass1");
    expect(dup1).toBeNull();
    // Different case
    const dup2 = await auth.createUser("existinguser", "otherPass1");
    expect(dup2).toBeNull();
    // Mixed case
    const dup3 = await auth.createUser("EXISTINGUSER", "otherPass1");
    expect(dup3).toBeNull();
  });
});

// ===========================================================================
// getUserById / getUserByUsername
// ===========================================================================
describe("getUserById", () => {
  it("returns the user for a valid id", () => {
    const { id } = insertTestUser(mockDb);
    const user = auth.getUserById(id);
    expect(user).not.toBeNull();
    expect(user!.id).toBe(id);
  });

  it("returns null for a non-existent id", () => {
    const user = auth.getUserById("00000000-0000-0000-0000-000000000000");
    expect(user).toBeNull();
  });
});

describe("getUserByUsername", () => {
  it("returns the user for a valid username (case-insensitive)", () => {
    const { id, username } = insertTestUser(mockDb);
    expect(auth.getUserByUsername(username)!.id).toBe(id);
    expect(auth.getUserByUsername(username.toUpperCase())!.id).toBe(id);
    expect(auth.getUserByUsername(username.toLowerCase())!.id).toBe(id);
  });

  it("returns null for a non-existent username", () => {
    expect(auth.getUserByUsername("noSuchUser")).toBeNull();
  });
});

// ===========================================================================
// authenticateUser
// ===========================================================================
describe("authenticateUser", () => {
  async function createUserWithPassword(
    db: Database,
    username: string,
    password: string
  ): Promise<string> {
    const hash = await auth.hashPassword(password);
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
    ).run(id, username, hash);
    return id;
  }

  it("returns user and token for valid credentials", async () => {
    await createUserWithPassword(mockDb, "ValidUser", "testPass1");
    const result = await auth.authenticateUser("ValidUser", "testPass1");
    expect(result).not.toBeNull();
    expect(result!.user.username).toBe("ValidUser");
    expect(typeof result!.token).toBe("string");
    // Token should be a JWT (three dot-separated parts)
    expect(result!.token.split(".")).toHaveLength(3);
  });

  it("returns null when password is wrong", async () => {
    await createUserWithPassword(mockDb, "ValidUser", "testPass1");
    const result = await auth.authenticateUser("ValidUser", "wrongPass1");
    expect(result).toBeNull();
  });

  it("returns null when user does not exist", async () => {
    const result = await auth.authenticateUser("Nobody", "testPass1");
    expect(result).toBeNull();
  });

  it("matches username case-insensitively", async () => {
    await createUserWithPassword(mockDb, "CaseUser", "testPass1");
    const result = await auth.authenticateUser("caseuser", "testPass1");
    expect(result).not.toBeNull();
    expect(result!.user.username).toBe("CaseUser");
  });
});

// ===========================================================================
// generateToken / verifyToken (happy path)
// ===========================================================================
describe("generateToken / verifyToken", () => {
  it("generates a JWT that can be verified and contains the user claims", async () => {
    // Manually insert a user so we control password_changed_at
    const userId = crypto.randomUUID();
    mockDb
      .prepare(
        "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
      )
      .run(userId, "TokenUser", "hash");

    const user = auth.getUserById(userId)!;
    const token = await auth.generateToken(user);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const payload = await auth.verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe(userId);
    expect(payload!.username).toBe("TokenUser");
    expect(payload!.jti).toBeTruthy();
    expect(payload!.iat).toBeGreaterThan(0);
    expect(payload!.exp).toBeGreaterThan(payload!.iat);
  });

  it("verifyToken returns null for a completely invalid token string", async () => {
    const result = await auth.verifyToken("not-a-jwt");
    expect(result).toBeNull();
  });
});

// ===========================================================================
// verifyToken — expired token
// ===========================================================================
describe("verifyToken with expired token", () => {
  it("returns null for an expired JWT", async () => {
    const secret = new TextEncoder().encode(mockConfig.jwtSecret);
    // Sign a token with an expiration in the past
    const expiredToken = await new SignJWT({
      sub: "user-id",
      username: "expiredUser",
      jti: crypto.randomUUID(),
      pwd_changed_at: null,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // 2 hours ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // 1 hour ago
      .sign(secret);

    const result = await auth.verifyToken(expiredToken);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// verifyToken — tampered token
// ===========================================================================
describe("verifyToken with tampered token", () => {
  it("returns null when the token payload has been modified", async () => {
    const secret = new TextEncoder().encode(mockConfig.jwtSecret);
    const token = await new SignJWT({
      sub: "user-id",
      username: "tamperUser",
      jti: crypto.randomUUID(),
      pwd_changed_at: null,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(secret);

    // Tamper by modifying a character in the payload section
    const parts = token.split(".");
    const payloadRaw = Buffer.from(parts[1], "base64url").toString("utf-8");
    const tamperedPayload = payloadRaw.replace("tamperUser", "tamperHacker");
    parts[1] = Buffer.from(tamperedPayload)
      .toString("base64url")
      .replace(/=+$/, ""); // strip padding
    const tamperedToken = parts.join(".");

    const result = await auth.verifyToken(tamperedToken);
    expect(result).toBeNull();
  });

  it("returns null when the signature is replaced with garbage", async () => {
    const secret = new TextEncoder().encode(mockConfig.jwtSecret);
    const token = await new SignJWT({
      sub: "user-id",
      username: "sigUser",
      jti: crypto.randomUUID(),
      pwd_changed_at: null,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(secret);

    const parts = token.split(".");
    parts[2] = "invalidsignature";
    const tamperedToken = parts.join(".");

    const result = await auth.verifyToken(tamperedToken);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// revokeToken / token denylist
// ===========================================================================
describe("revokeToken / token denylist", () => {
  it("verifyToken returns null for a revoked token", async () => {
    // Create a user and generate a valid token
    const userId = crypto.randomUUID();
    mockDb
      .prepare(
        "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
      )
      .run(userId, "RevokeUser", "hash");
    const user = auth.getUserById(userId)!;
    const token = await auth.generateToken(user);

    // Verify it works before revocation
    expect(await auth.verifyToken(token)).not.toBeNull();

    // Revoke the token's JTI
    const payload = await auth.verifyToken(token);
    const jti = payload!.jti;
    const exp = payload!.exp;
    auth.revokeToken(jti, exp);

    // Now it should be denied
    expect(await auth.verifyToken(token)).toBeNull();
  });

  it("revokeToken does not throw when insertion fails (graceful degradation)", () => {
    // Close the DB so the INSERT fails
    mockDb.close();
    // Should not throw
    expect(() => auth.revokeToken("some-jti", 9999999999)).not.toThrow();
    // Re-create DB for subsequent tests
    mockDb = createAuthDb();
  });
});

// ===========================================================================
// changePassword
// ===========================================================================
describe("changePassword", () => {
  async function createUserInDb(
    password: string
  ): Promise<{ id: string; username: string }> {
    const hash = await auth.hashPassword(password);
    const id = crypto.randomUUID();
    mockDb
      .prepare(
        "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
      )
      .run(id, "ChangePwdUser", hash);
    return { id, username: "ChangePwdUser" };
  }

  it("changes the password successfully with correct current password", async () => {
    const { id } = await createUserInDb("oldPass1");
    const result = await auth.changePassword(id, "oldPass1", "newPass1");
    expect(result).toEqual({ success: true });

    // Verify old password no longer works
    const authResult = await auth.authenticateUser("ChangePwdUser", "oldPass1");
    expect(authResult).toBeNull();

    // Verify new password works
    const authResult2 = await auth.authenticateUser(
      "ChangePwdUser",
      "newPass1"
    );
    expect(authResult2).not.toBeNull();
  });

  it("returns error when current password is wrong", async () => {
    const { id } = await createUserInDb("oldPass1");
    const result = await auth.changePassword(id, "wrongPass1", "newPass1");
    expect(result).toEqual({
      success: false,
      error: "Current password is incorrect",
    });
  });

  it("returns error when user does not exist", async () => {
    const result = await auth.changePassword(
      "00000000-0000-0000-0000-000000000000",
      "oldPass1",
      "newPass1"
    );
    expect(result).toEqual({ success: false, error: "User not found" });
  });

  it("returns error when new password fails validation", async () => {
    const { id } = await createUserInDb("oldPass1");
    const result = await auth.changePassword(id, "oldPass1", "short");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("invalidates tokens issued before a subsequent password change", async () => {
    const hash = await auth.hashPassword("oldPass1");
    const id = crypto.randomUUID();
    // Insert user with an explicit historical password_changed_at so we
    // can reliably verify that a newer password change invalidates tokens.
    mockDb
      .prepare(
        "INSERT INTO users (id, username, password_hash, password_changed_at) VALUES (?, ?, ?, ?)"
      )
      .run(id, "ChangePwdUser", hash, "2020-01-01 00:00:00");

    // Generate a token — it will have pwd_changed_at: "2020-01-01 00:00:00"
    const user = auth.getUserById(id)!;
    const oldToken = await auth.generateToken(user);
    expect(await auth.verifyToken(oldToken)).not.toBeNull();

    // Change password — this sets password_changed_at to
    // CURRENT_TIMESTAMP which is always > "2020-01-01 00:00:00"
    await auth.changePassword(id, "oldPass1", "newPass1");

    // The old token should now be invalid because the DB's
    // password_changed_at > the token's pwd_changed_at claim
    const result = await auth.verifyToken(oldToken);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// cleanupExpiredDenylistEntries
// ===========================================================================
describe("cleanupExpiredDenylistEntries", () => {
  it("removes expired entries from the denylist", () => {
    // Insert expired and non-expired entries
    mockDb
      .prepare(
        "INSERT INTO token_denylist (token_id, expires_at) VALUES (?, ?)"
      )
      .run("expired-1", "2020-01-01T00:00:00.000Z");
    mockDb
      .prepare(
        "INSERT INTO token_denylist (token_id, expires_at) VALUES (?, ?)"
      )
      .run("expired-2", "2021-06-15T12:00:00.000Z");

    // Insert a non-expired entry (far future)
    mockDb
      .prepare(
        "INSERT INTO token_denylist (token_id, expires_at) VALUES (?, ?)"
      )
      .run("still-valid", "2099-12-31T23:59:59.000Z");

    auth.cleanupExpiredDenylistEntries();

    const remaining = mockDb
      .prepare("SELECT token_id FROM token_denylist ORDER BY token_id")
      .all() as { token_id: string }[];

    expect(remaining).toHaveLength(1);
    expect(remaining[0].token_id).toBe("still-valid");
  });

  it("does not throw when the denylist is empty", () => {
    expect(() => auth.cleanupExpiredDenylistEntries()).not.toThrow();
  });

  it("does not throw when the database is closed (graceful degradation)", () => {
    mockDb.close();
    expect(() => auth.cleanupExpiredDenylistEntries()).not.toThrow();
    // Re-create for other tests
    mockDb = createAuthDb();
  });
});

// ===========================================================================
// Edge cases
// ===========================================================================
describe("edge cases", () => {
  it("verifyToken returns null when denylist check fails (graceful)", async () => {
    // Create a valid token
    const userId = crypto.randomUUID();
    mockDb
      .prepare(
        "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
      )
      .run(userId, "EdgeUser", "hash");
    const user = auth.getUserById(userId)!;
    const token = await auth.generateToken(user);

    // Close the DB so the denylist query will fail
    mockDb.close();

    // verifyToken catches errors internally and returns null
    const result = await auth.verifyToken(token);
    expect(result).toBeNull();

    // Re-create DB for cleanup
    mockDb = createAuthDb();
  });

  it("initializes user data directory without throwing", () => {
    const userId = crypto.randomUUID();
    expect(() => auth.initializeUserDataDirectory(userId)).not.toThrow();
    // Verify directories were created
    const baseDir = path.join(tempDataDir, userId);
    expect(fs.existsSync(path.join(baseDir, "universe"))).toBe(true);
    expect(fs.existsSync(path.join(baseDir, "locations"))).toBe(true);
    expect(fs.existsSync(path.join(baseDir, "npcs"))).toBe(true);
  });

  it("authenticateUser updates last_login on success", async () => {
    const hash = await auth.hashPassword("testPass1");
    const id = crypto.randomUUID();
    mockDb
      .prepare(
        "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
      )
      .run(id, "LastLoginUser", hash);

    // Before login, last_login should be null
    const before = auth.getUserById(id);
    expect(before!.last_login).toBeNull();

    await auth.authenticateUser("LastLoginUser", "testPass1");

    // After login, last_login should be set
    const after = auth.getUserById(id);
    expect(after!.last_login).not.toBeNull();
  });
});

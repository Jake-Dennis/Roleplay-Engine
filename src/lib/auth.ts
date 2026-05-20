import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import fs from "fs";
import path from "path";
import { AUTH_CONFIG, APP_CONFIG } from "./config";
import { getDb } from "./db";

export interface User {
  id: string;
  username: string;
  created_at: string;
  last_login: string | null;
  settings: string;
  password_changed_at: string | null;
}

export interface AuthToken {
  sub: string;
  username: string;
  jti: string;
  iat: number;
  exp: number;
  pwd_changed_at: string | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, AUTH_CONFIG.bcryptRounds);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function generateToken(user: User): Promise<string> {
  const secret = new TextEncoder().encode(AUTH_CONFIG.jwtSecret);
  const iat = Math.floor(Date.now() / 1000);
  const jti = crypto.randomUUID();
  return new SignJWT({
    sub: user.id,
    username: user.username,
    jti,
    pwd_changed_at: user.password_changed_at ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(iat)
    .setExpirationTime(iat + AUTH_CONFIG.jwtExpiry)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<AuthToken | null> {
  try {
    const secret = new TextEncoder().encode(AUTH_CONFIG.jwtSecret);
    const { payload } = await jwtVerify(token, secret);
    const authPayload = payload as unknown as AuthToken;

    // Check if token is in the denylist (revoked)
    if (authPayload.jti) {
      const db = getDb();
      const denied = db
        .prepare("SELECT 1 FROM token_denylist WHERE token_id = ?")
        .get(authPayload.jti);
      if (denied) return null;
    }

    // Check if token was issued before the user's last password change
    if (authPayload.pwd_changed_at) {
      const db = getDb();
      const row = db
        .prepare("SELECT password_changed_at FROM users WHERE id = ?")
        .get(authPayload.sub) as { password_changed_at: string | null } | undefined;

      if (row && row.password_changed_at && row.password_changed_at > authPayload.pwd_changed_at) {
        return null; // Token issued before password change
      }
    }

    return authPayload;
  } catch {
    return null;
  }
}

export function validateUsername(username: string): string | null {
  if (
    username.length < AUTH_CONFIG.usernameMinLength ||
    username.length > AUTH_CONFIG.usernameMaxLength
  ) {
    return `Username must be ${AUTH_CONFIG.usernameMinLength}-${AUTH_CONFIG.usernameMaxLength} characters`;
  }
  if (!AUTH_CONFIG.usernamePattern.test(username)) {
    return "Username can only contain letters, numbers, underscores, and symbols (@.!#$%^&*()+=)";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < AUTH_CONFIG.passwordMinLength) {
    return `Password must be at least ${AUTH_CONFIG.passwordMinLength} characters`;
  }
  if (!/[a-zA-Z]/.test(password)) {
    return "Password must contain at least one letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
}

export function initializeUserDataDirectory(userId: string): void {
  const baseDir = path.join(APP_CONFIG.dataDir, userId);
  const dirs = [
    "universe",
    "locations",
    "npcs",
    "relationships",
    "events",
    "story_arcs",
    "canon",
    "generated",
    "tts_cache",
  ];

  for (const dir of dirs) {
    const dirPath = path.join(baseDir, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

export async function createUser(
  username: string,
  password: string
): Promise<User | null> {
  const db = getDb();

  // Check if username already exists (case-insensitive)
  const existing = db
    .prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)")
    .get(username);

  if (existing) return null;

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  db.prepare(
    "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
  ).run(id, username, passwordHash);

  // Create user data directories
  initializeUserDataDirectory(id);

  return getUserById(id);
}

export async function authenticateUser(
  username: string,
  password: string
): Promise<{ user: User; token: string } | null> {
  const db = getDb();

  const row = db
    .prepare(
      "SELECT id, username, password_hash, created_at, last_login, settings, password_changed_at FROM users WHERE LOWER(username) = LOWER(?)"
    )
    .get(username) as
    | {
        id: string;
        username: string;
        password_hash: string;
        created_at: string;
        last_login: string | null;
        settings: string;
        password_changed_at: string | null;
      }
      | undefined;

  if (!row) return null;

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return null;

  // Update last login
  db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").run(
    row.id
  );

  const user: User = {
    id: row.id,
    username: row.username,
    created_at: row.created_at,
    last_login: row.last_login,
    settings: row.settings,
    password_changed_at: row.password_changed_at,
  };

  const token = await generateToken(user);

  return { user, token };
}

export function getUserById(id: string): User | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, username, created_at, last_login, settings, password_changed_at FROM users WHERE id = ?"
    )
    .get(id) as
    | {
        id: string;
        username: string;
        created_at: string;
        last_login: string | null;
        settings: string;
        password_changed_at: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    created_at: row.created_at,
    last_login: row.last_login,
    settings: row.settings,
    password_changed_at: row.password_changed_at,
  };
}

export function getUserByUsername(username: string): User | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, username, created_at, last_login, settings, password_changed_at FROM users WHERE LOWER(username) = LOWER(?)"
    )
    .get(username) as
    | {
        id: string;
        username: string;
        created_at: string;
        last_login: string | null;
        settings: string;
        password_changed_at: string | null;
      }
      | undefined;

  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    created_at: row.created_at,
    last_login: row.last_login,
    settings: row.settings,
    password_changed_at: row.password_changed_at,
  };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  // Get current password hash
  const row = db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(userId) as { password_hash: string } | undefined;

  if (!row) {
    return { success: false, error: "User not found" };
  }

  // Verify current password
  const valid = await verifyPassword(currentPassword, row.password_hash);
  if (!valid) {
    return { success: false, error: "Current password is incorrect" };
  }

  // Validate new password
  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return { success: false, error: passwordError };
  }

  // Hash and update new password
  const newHash = await hashPassword(newPassword);
  db.prepare(
    "UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(newHash, userId);

  return { success: true };
}

/**
 * Revoke a token by adding its JTI to the denylist.
 * Graceful degradation — does not throw if the write fails.
 */
export function revokeToken(tokenId: string, expiresAt: number): void {
  try {
    const db = getDb();
    const expiresStr = new Date(expiresAt * 1000).toISOString();
    db.prepare(
      "INSERT OR IGNORE INTO token_denylist (token_id, expires_at) VALUES (?, ?)"
    ).run(tokenId, expiresStr);
  } catch {
    // Graceful degradation — logout still succeeds
  }
}

/**
 * Remove expired entries from the token denylist.
 * Safe to call opportunistically (e.g., during idle processing or on startup).
 */
export function cleanupExpiredDenylistEntries(): void {
  try {
    const db = getDb();
    db.prepare(
      "DELETE FROM token_denylist WHERE expires_at < datetime('now')"
    ).run();
  } catch {
    // Non-fatal — cleanup will run next time
  }
}

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
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
}

export interface AuthToken {
  sub: string;
  username: string;
  iat: number;
  exp: number;
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

export function generateToken(user: User): string {
  return jwt.sign(
    { sub: user.id, username: user.username },
    AUTH_CONFIG.jwtSecret,
    { expiresIn: AUTH_CONFIG.jwtExpiry }
  );
}

export function verifyToken(token: string): AuthToken | null {
  try {
    return jwt.verify(token, AUTH_CONFIG.jwtSecret) as AuthToken;
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
    return "Username can only contain letters, numbers, and underscores";
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
    .get(username.toLowerCase());

  if (existing) return null;

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  db.prepare(
    "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
  ).run(id, username.toLowerCase(), passwordHash);

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
      "SELECT id, username, password_hash, created_at, last_login, settings FROM users WHERE LOWER(username) = LOWER(?)"
    )
    .get(username.toLowerCase()) as
    | {
        id: string;
        username: string;
        password_hash: string;
        created_at: string;
        last_login: string | null;
        settings: string;
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
  };

  const token = generateToken(user);

  return { user, token };
}

export function getUserById(id: string): User | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, username, created_at, last_login, settings FROM users WHERE id = ?"
    )
    .get(id) as
    | {
        id: string;
        username: string;
        created_at: string;
        last_login: string | null;
        settings: string;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    created_at: row.created_at,
    last_login: row.last_login,
    settings: row.settings,
  };
}

export function getUserByUsername(username: string): User | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, username, created_at, last_login, settings FROM users WHERE LOWER(username) = LOWER(?)"
    )
    .get(username.toLowerCase()) as
    | {
        id: string;
        username: string;
        created_at: string;
        last_login: string | null;
        settings: string;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    created_at: row.created_at,
    last_login: row.last_login,
    settings: row.settings,
  };
}

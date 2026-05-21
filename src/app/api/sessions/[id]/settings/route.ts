import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { eventBus, SessionEvents } from "@/lib/event-bus";
import type { DbDatabase } from "@/lib/types";
import { getAuthToken } from '@/lib/auth-token';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

// Ensure session_settings table exists
function ensureTable(db: DbDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS session_settings (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (session_id, key)
  )`);
}

interface SessionSettings {
  llmModel: string | null;
  embeddingModel: string | null;
  temperature: number | null;
  topP: number | null;
  numCtx: number | null;
  systemPrompt: string | null;
  maxResponseLength: number | null;
}

const DEFAULT_SETTINGS: SessionSettings = {
  llmModel: null,
  embeddingModel: null,
  temperature: null,
  topP: null,
  numCtx: null,
  systemPrompt: null,
  maxResponseLength: null,
};

function getSettings(db: DbDatabase, sessionId: string): SessionSettings {
  ensureTable(db);

  const keys = [
    "llm_model", "embedding_model", "temperature", "top_p",
    "num_ctx", "system_prompt", "max_response_length",
  ];

  const rows = db.prepare(
    "SELECT key, value FROM session_settings WHERE session_id = ? AND key IN (".concat(
      keys.map(() => "?").join(","),
      ")"
    )
  ).all(sessionId, ...keys) as { key: string; value: string }[];

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  return {
    llmModel: map.llm_model || null,
    embeddingModel: map.embedding_model || null,
    temperature: map.temperature ? parseFloat(map.temperature) : null,
    topP: map.top_p ? parseFloat(map.top_p) : null,
    numCtx: map.num_ctx ? parseInt(map.num_ctx, 10) : null,
    systemPrompt: map.system_prompt || null,
    maxResponseLength: map.max_response_length ? parseInt(map.max_response_length, 10) : null,
  };
}

export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_read:${ip}`, "session_read");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: sessionId } = await params;
const db = getDb();
ensureTable(db);

// Verify access
const session = db.prepare(
  "SELECT id FROM sessions WHERE id = ? AND (owner_id = ? OR id IN (SELECT session_id FROM session_participants WHERE user_id = ?))"
).get(sessionId, decoded.sub, decoded.sub);

if (!session) {
  return NextResponse.json({ error: "Session not found" }, { status: 404 });
}

return NextResponse.json(getSettings(db, sessionId)); });

export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const token = getAuthToken(request);
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const decoded = await verifyToken(token);
if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`session_write:${ip}`, "session_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: sessionId } = await params;
const db = getDb();
ensureTable(db);

// Verify ownership (only owner can change settings)
const session = db.prepare(
  "SELECT id FROM sessions WHERE id = ? AND owner_id = ?"
).get(sessionId, decoded.sub);

if (!session) {
  return NextResponse.json({ error: "Session not found or not owner" }, { status: 404 });
}

  requireJson(request);
  const body = await request.json();
const settings: Partial<SessionSettings> = {};

if (body.llmModel !== undefined) settings.llmModel = body.llmModel;
if (body.embeddingModel !== undefined) settings.embeddingModel = body.embeddingModel;
if (body.temperature !== undefined) {
    if (typeof body.temperature !== "number" || body.temperature < 0 || body.temperature > 2) {
      return NextResponse.json({ error: "temperature must be between 0 and 2" }, { status: 400 });
    }
    settings.temperature = body.temperature;
  }
  if (body.topP !== undefined) {
    if (typeof body.topP !== "number" || body.topP < 0 || body.topP > 1) {
      return NextResponse.json({ error: "topP must be between 0 and 1" }, { status: 400 });
    }
    settings.topP = body.topP;
  }
  if (body.numCtx !== undefined) {
    if (typeof body.numCtx !== "number" || body.numCtx < 512 || body.numCtx > 131072) {
      return NextResponse.json({ error: "numCtx must be between 512 and 131072" }, { status: 400 });
    }
    settings.numCtx = body.numCtx;
  }
if (body.systemPrompt !== undefined) settings.systemPrompt = body.systemPrompt;
if (body.maxResponseLength !== undefined) settings.maxResponseLength = body.maxResponseLength;

const upsert = db.prepare(
  "INSERT OR REPLACE INTO session_settings (session_id, key, value) VALUES (?, ?, ?)"
);

const tx = db.transaction((updates: [string, string][]) => {
  for (const [key, value] of updates) {
    upsert.run(sessionId, key, value);
  }
});

const updates: [string, string][] = [];
if (settings.llmModel !== undefined) updates.push(["llm_model", settings.llmModel || ""]);
if (settings.embeddingModel !== undefined) updates.push(["embedding_model", settings.embeddingModel || ""]);
if (settings.temperature !== undefined) updates.push(["temperature", settings.temperature?.toString() || ""]);
if (settings.topP !== undefined) updates.push(["top_p", settings.topP?.toString() || ""]);
if (settings.numCtx !== undefined) updates.push(["num_ctx", settings.numCtx?.toString() || ""]);
if (settings.systemPrompt !== undefined) updates.push(["system_prompt", settings.systemPrompt || ""]);
if (settings.maxResponseLength !== undefined) updates.push(["max_response_length", settings.maxResponseLength?.toString() || ""]);

if (updates.length > 0) {
  tx(updates);
}

const result = getSettings(db, sessionId);
eventBus.emit(`${SessionEvents.SESSION_UPDATED}:${sessionId}`, { settings: result });

return NextResponse.json({ success: true, settings: result }); });

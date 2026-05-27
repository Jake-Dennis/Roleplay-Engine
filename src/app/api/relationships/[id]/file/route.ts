import { withErrorHandler } from '@/lib/with-error-handler';
import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { withAuth } from '@/lib/with-auth';
import { getDb } from "@/lib/db";
import {
  getRelationshipFilePath,
  getHistoryFilePath,
  readRelationshipFiles,
  syncRelationshipToFilesystem,
} from "@/lib/relationship-markdown";
import { ensureGroupSupport } from "@/lib/group-migrations";
import fs from "fs";
import { hasRelationshipAccess } from '@/lib/relationship-access';
import type { RelationshipRowWithGroup } from '@/lib/relationship-types';
import { checkRateLimit, createRateLimitResponse, getClientIp } from '@/lib/rate-limiter';

function getFileOwnerId(entity: RelationshipRowWithGroup, fallbackUserId: string): string {
  if (entity.group_id && entity.group_owner_id) return entity.group_owner_id;
  return fallbackUserId;
}

/**
 * Reads the markdown relationship and history files for a relationship.
 *
 * @param request - The incoming Next.js request object
 * @param params - Route parameters containing `{ id }` — the relationship UUID
 * @returns NextResponse with `{ relationship, history, filePath, historyPath }` — file contents and paths
 * @throws 401 - If authentication fails
 * @throws 404 - If the relationship is not found or user lacks access
 * @throws 429 - If rate limit exceeded
 * @throws 500 - If markdown file generation fails on first sync
 */
export const GET = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`relationship_read:${ip}`, "api");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: relId } = await params;
const db = getDb();
ensureGroupSupport(db);

// Get relationship from DB
const rel = hasRelationshipAccess(db, relId, userId);
if (!rel) {
  return NextResponse.json({ error: "Relationship not found" }, { status: 404 });
}

// Use group owner's directory for group-owned relationships
const fileOwnerId = getFileOwnerId(rel, userId);

// Try to read markdown files
const files = readRelationshipFiles(fileOwnerId, rel.source_entity, rel.target_entity);

if (!files) {
  // Files don't exist yet — sync from DB
  syncRelationshipToFilesystem(relId);
  const retry = readRelationshipFiles(fileOwnerId, rel.source_entity, rel.target_entity);
  if (!retry) {
    return NextResponse.json({ error: "Failed to generate markdown files" }, { status: 500 });
  }
  return NextResponse.json({
    relationship: retry.relationship,
    history: retry.history,
    filePath: getRelationshipFilePath(fileOwnerId, rel.source_entity, rel.target_entity),
    historyPath: getHistoryFilePath(fileOwnerId, rel.source_entity, rel.target_entity),
  });
}

return NextResponse.json({
  relationship: files.relationship,
  history: files.history,
  filePath: getRelationshipFilePath(fileOwnerId, rel.source_entity, rel.target_entity),
  historyPath: getHistoryFilePath(fileOwnerId, rel.source_entity, rel.target_entity),
}); });

/**
 * Updates relationship markdown files and syncs changes back to the database.
 *
 * @param request - The incoming Next.js request object with JSON body: `{ notes?, relationship_stage?, emotional_state?, shared_history? }`
 * @param params - Route parameters containing `{ id }` — the relationship UUID
 * @returns NextResponse with `{ success: true, relationship?, history? }`
 * @throws 400 - If request body is not valid JSON
 * @throws 401 - If authentication fails
 * @throws 404 - If the relationship is not found or user lacks access
 * @throws 429 - If rate limit exceeded
 */
export const PUT = withErrorHandler(async (request: NextRequest,
{ params }: { params: Promise<{ id: string }> }) => { const authResult = await withAuth(request);
if ('error' in authResult) return authResult.error;
const { userId } = authResult.auth;

const ip = getClientIp(request);
const rateLimit = checkRateLimit(`relationship_write:${ip}`, "relationship_write");
if (!rateLimit.allowed) return createRateLimitResponse(rateLimit.retryAfter!);

const { id: relId } = await params;
const db = getDb();
ensureGroupSupport(db);

// Get relationship from DB
const rel = hasRelationshipAccess(db, relId, userId);
if (!rel) {
  return NextResponse.json({ error: "Relationship not found" }, { status: 404 });
}

  requireJson(request);
  const body = await request.json();
const { notes, relationship_stage, emotional_state, shared_history } = body;

// Update DB fields that were edited
const updates: string[] = [];
const values: unknown[] = [];

if (relationship_stage !== undefined) {
  updates.push("relationship_stage = ?");
  values.push(relationship_stage);
}

if (emotional_state !== undefined) {
  updates.push("emotional_state = ?");
  values.push(JSON.stringify(emotional_state));
}

if (shared_history !== undefined) {
  updates.push("shared_history = ?");
  values.push(JSON.stringify(shared_history));
}

if (updates.length > 0) {
  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(relId);

  db.prepare(
    `UPDATE relationships SET ${updates.join(", ")} WHERE id = ?`
  ).run(...values);
}

// Use group owner's directory for group-owned relationships
const fileOwnerId = getFileOwnerId(rel, userId);

// Sync DB to markdown files (preserves user-edited notes in the file)
syncRelationshipToFilesystem(relId);

// If notes were provided, append them to the markdown file directly
if (notes !== undefined) {
  const filePath = getRelationshipFilePath(fileOwnerId, rel.source_entity, rel.target_entity);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, "utf-8");
    // Replace the notes section
    const notesRegex = /## Notes\n\n[\s\S]*$/;
    if (notesRegex.test(content)) {
      content = content.replace(notesRegex, `## Notes\n\n${notes}\n`);
    } else {
      content += `\n## Notes\n\n${notes}\n`;
    }
    fs.writeFileSync(filePath, content, "utf-8");
  }
}

// Return updated files
const files = readRelationshipFiles(fileOwnerId, rel.source_entity, rel.target_entity);

return NextResponse.json({
  success: true,
  relationship: files?.relationship,
  history: files?.history,
}); });

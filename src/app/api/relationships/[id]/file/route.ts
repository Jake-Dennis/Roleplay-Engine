import { NextRequest, NextResponse } from "next/server";
import { requireJson } from "@/lib/error-response";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  getRelationshipFilePath,
  getHistoryFilePath,
  readRelationshipFiles,
  parseRelationshipMarkdown,
  syncRelationshipToFilesystem,
} from "@/lib/relationship-markdown";
import { ensureGroupSupport } from "@/lib/group-migrations";
import fs from "fs";
import type { DbResult } from "@/lib/types";
import { getAuthToken } from '@/lib/auth-token';
import { hasRelationshipAccess } from '@/lib/relationship-access';
import type { RelationshipRowWithGroup } from '@/lib/relationship-types';

function getFileOwnerId(entity: RelationshipRowWithGroup, fallbackUserId: string): string {
  if (entity.group_id && entity.group_owner_id) return entity.group_owner_id;
  return fallbackUserId;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: relId } = await params;
  const db = getDb();
  ensureGroupSupport(db);

  // Get relationship from DB
  const rel = hasRelationshipAccess(db, relId, decoded.sub);
  if (!rel) {
    return NextResponse.json({ error: "Relationship not found" }, { status: 404 });
  }

  // Use group owner's directory for group-owned relationships
  const fileOwnerId = getFileOwnerId(rel, decoded.sub);

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
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { id: relId } = await params;
  const db = getDb();
  ensureGroupSupport(db);

  // Get relationship from DB
  const rel = hasRelationshipAccess(db, relId, decoded.sub);
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
  const fileOwnerId = getFileOwnerId(rel, decoded.sub);

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
  });
}

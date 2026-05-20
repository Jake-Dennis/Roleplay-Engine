import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import fs from "fs";
import path from "path";
import { APP_CONFIG } from "@/lib/config";
import { generateSpeech } from "@/lib/tts";
import crypto from "crypto";
import { getAuthToken } from '@/lib/auth-token';

export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const db = getDb();
  const url = new URL(request.url);

  // Get cache stats
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as totalEntries,
      COALESCE(SUM(duration_ms), 0) as totalDurationMs,
      COALESCE(SUM(use_count), 0) as totalUses,
      MIN(created_at) as oldestEntry,
      MAX(last_used) as lastUsed
    FROM tts_cache
    WHERE user_id = ?
  `).get(decoded.sub) as {
    totalEntries: number;
    totalDurationMs: number;
    totalUses: number;
    oldestEntry: string | null;
    lastUsed: string | null;
  } | undefined;

  // Get cache size on disk
  const cacheDir = path.join(APP_CONFIG.dataDir, decoded.sub, "tts_cache");
  let diskSize = 0;
  let fileCount = 0;

  if (fs.existsSync(cacheDir)) {
    const files = fs.readdirSync(cacheDir);
    fileCount = files.length;
    for (const file of files) {
      const filePath = path.join(cacheDir, file);
      try {
        diskSize += fs.statSync(filePath).size;
      } catch {
        // Skip files that can't be read
      }
    }
  }

  // Get recent entries with cursor pagination
  const cursor = url.searchParams.get("cursor");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20;

  let recentQuery = `
    SELECT id, text_content, voice_name, audio_format, duration_ms, use_count, created_at, last_used
    FROM tts_cache
    WHERE user_id = ?
  `;
  const recentParams: unknown[] = [decoded.sub];

  if (cursor) {
    const cursorRow = db.prepare(
      "SELECT last_used FROM tts_cache WHERE id = ? AND user_id = ?"
    ).get(cursor, decoded.sub) as { last_used: string | null } | undefined;

    if (cursorRow) {
      // Handle NULL last_used: use COALESCE for consistent ordering
      recentQuery += " AND (COALESCE(last_used, '1970-01-01'), id) < (?, ?)";
      recentParams.push(cursorRow.last_used || "1970-01-01", cursor);
    }
  }

  recentQuery += " ORDER BY COALESCE(last_used, '1970-01-01') DESC, id DESC LIMIT ?";
  recentParams.push(limit + 1);

  const recentRows = recentQuery
    ? db.prepare(recentQuery).all(...recentParams) as {
        id: string;
        text_content: string | null;
        voice_name: string;
        audio_format: string;
        duration_ms: number | null;
        use_count: number;
        created_at: string;
        last_used: string | null;
      }[]
    : [];

  let nextCursor: string | null = null;
  let recentEntries = recentRows;
  if (recentRows.length > limit) {
    nextCursor = recentRows[limit].id;
    recentEntries = recentRows.slice(0, limit);
  }

  return NextResponse.json({
    stats: {
      totalEntries: stats?.totalEntries || 0,
      totalDurationMs: stats?.totalDurationMs || 0,
      totalUses: stats?.totalUses || 0,
      oldestEntry: stats?.oldestEntry,
      lastUsed: stats?.lastUsed,
      diskSize,
      diskSizeFormatted: formatBytes(diskSize),
      fileCount,
    },
    recentEntries,
    nextCursor,
  });
}

export async function DELETE(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  const db = getDb();

  if (action === "clear") {
    // Clear all cache entries for user
    const entries = db.prepare(
      "SELECT audio_path FROM tts_cache WHERE user_id = ?"
    ).all(decoded.sub) as { audio_path: string | null }[];

    // Delete audio files
    for (const entry of entries) {
      if (entry.audio_path) {
        const fullPath = path.join(APP_CONFIG.dataDir, decoded.sub, entry.audio_path);
        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        } catch {
          // Skip files that can't be deleted
        }
      }
    }

    // Delete database entries
    const result = db.prepare(
      "DELETE FROM tts_cache WHERE user_id = ?"
    ).run(decoded.sub);

    return NextResponse.json({ success: true, deletedCount: result.changes });
  }

  if (action === "expired") {
    // Clear entries older than 7 days
    const result = db.prepare(
      "DELETE FROM tts_cache WHERE user_id = ? AND created_at < datetime('now', '-7 days')"
    ).run(decoded.sub);

    return NextResponse.json({ success: true, deletedCount: result.changes });
  }

  if (action === "unused") {
    // Clear entries never used
    const result = db.prepare(
      "DELETE FROM tts_cache WHERE user_id = ? AND use_count = 0"
    ).run(decoded.sub);

    return NextResponse.json({ success: true, deletedCount: result.changes });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decoded = await verifyToken(token);
  if (!decoded) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { action } = body;

  const db = getDb();

  if (action === "refresh") {
    // D7: Refresh a specific TTS cache entry
    const { cacheId } = body;
    if (!cacheId) return NextResponse.json({ error: "cacheId required" }, { status: 400 });

    const entry = db.prepare(
      "SELECT * FROM tts_cache WHERE id = ? AND user_id = ?"
    ).get(cacheId, decoded.sub) as {
      id: string;
      text_content: string | null;
      voice_name: string;
      audio_path: string | null;
      audio_format: string;
    } | undefined;

    if (!entry || !entry.text_content) {
      return NextResponse.json({ error: "Cache entry not found" }, { status: 404 });
    }

    // Delete old audio file
    if (entry.audio_path) {
      const oldPath = path.join(APP_CONFIG.dataDir, decoded.sub, entry.audio_path);
      try {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch { /* ignore */ }
    }

    // Generate new TTS
    const audioBuffer = await generateSpeech(
      entry.text_content,
      entry.voice_name,
      entry.audio_format
    );

    // Save new audio file
    const newFileName = `${crypto.randomUUID()}.${entry.audio_format}`;
    const cacheDir = path.join(APP_CONFIG.dataDir, decoded.sub, "tts_cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const newFilePath = path.join(cacheDir, newFileName);
    fs.writeFileSync(newFilePath, audioBuffer);

    // Update cache entry
    db.prepare(
      "UPDATE tts_cache SET audio_path = ?, last_used = CURRENT_TIMESTAMP, use_count = use_count + 1 WHERE id = ?"
    ).run(`tts_cache/${newFileName}`, cacheId);

    return NextResponse.json({ success: true, audioPath: `tts_cache/${newFileName}` });
  }

  if (action === "combine") {
    // D7: Combine multiple TTS cache entries into one
    const { cacheIds, outputName } = body;
    if (!cacheIds || !Array.isArray(cacheIds) || cacheIds.length === 0) {
      return NextResponse.json({ error: "cacheIds array required" }, { status: 400 });
    }

    // Get all entries
    const placeholders = cacheIds.map(() => "?").join(",");
    const entries = db.prepare(
      `SELECT * FROM tts_cache WHERE id IN (${placeholders}) AND user_id = ?`
    ).all(...cacheIds, decoded.sub) as {
      id: string;
      text_content: string | null;
      voice_name: string;
      audio_path: string | null;
      audio_format: string;
      duration_ms: number | null;
    }[];

    if (entries.length === 0) {
      return NextResponse.json({ error: "No valid cache entries found" }, { status: 404 });
    }

    // Combine audio files (simple concatenation for MP3)
    const combinedBuffer = Buffer.concat(
      entries
        .filter((e) => e.audio_path)
        .map((e) => {
          const fullPath = path.join(APP_CONFIG.dataDir, decoded.sub, e.audio_path!);
          return fs.existsSync(fullPath) ? fs.readFileSync(fullPath) : Buffer.alloc(0);
        })
    );

    if (combinedBuffer.length === 0) {
      return NextResponse.json({ error: "No audio data to combine" }, { status: 400 });
    }

    // Save combined file
    const combinedName = outputName || `combined_${Date.now()}`;
    const combinedFileName = `${combinedName}.mp3`;
    const cacheDir = path.join(APP_CONFIG.dataDir, decoded.sub, "tts_cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const combinedFilePath = path.join(cacheDir, combinedFileName);
    fs.writeFileSync(combinedFilePath, combinedBuffer);

    // Create new cache entry for combined file
    const combinedId = crypto.randomUUID();
    const totalDuration = entries.reduce((sum, e) => sum + (e.duration_ms || 0), 0);
    const combinedText = entries.map((e) => e.text_content).filter(Boolean).join(" ");

    db.prepare(
      "INSERT INTO tts_cache (id, user_id, text_hash, voice_name, text_content, audio_format, audio_path, duration_ms, created_at, last_used, use_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)"
    ).run(
      combinedId,
      decoded.sub,
      crypto.createHash("md5").update(combinedText || "").digest("hex"),
      entries[0].voice_name,
      combinedText,
      "mp3",
      `tts_cache/${combinedFileName}`,
      totalDuration
    );

    return NextResponse.json({
      success: true,
      combinedId,
      durationMs: totalDuration,
      entryCount: entries.length,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

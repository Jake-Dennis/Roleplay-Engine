import { TTS_CONFIG } from "./config";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDb } from "./db";

export interface TTSGenerateRequest {
  model: string;
  input: string;
  voice: string;
  response_format?: string;
  speed?: number;
}

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender: string;
}

let availableVoices: string[] = [];
let ttsAvailable = false;

export async function checkTTSConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${TTS_CONFIG.baseUrl}/v1/audio/voices`, {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json();
      availableVoices = data.voices || [];
      ttsAvailable = true;
      return true;
    }

    ttsAvailable = false;
    return false;
  } catch {
    ttsAvailable = false;
    return false;
  }
}

export function isTTSAvailable(): boolean {
  return ttsAvailable;
}

export function getAvailableVoices(): string[] {
  return availableVoices;
}

export function parseVoiceInfo(voiceId: string): {
  language: string;
  gender: string;
} {
  const prefix = voiceId.substring(0, 2).toLowerCase();
  const genderChar = voiceId.charAt(2).toLowerCase();

  const languageMap: Record<string, string> = {
    af: "American English",
    am: "American English",
    bf: "British English",
    bm: "British English",
    ef: "Spanish",
    ff: "French",
    if: "Italian",
    pf: "Portuguese",
    hf: "Hindi",
    jf: "Japanese",
    zf: "Chinese",
  };

  return {
    language: languageMap[prefix] || "Unknown",
    gender: genderChar === "f" ? "Female" : genderChar === "m" ? "Male" : "Unknown",
  };
}

export async function generateSpeech(
  text: string,
  voice: string,
  format: string = TTS_CONFIG.defaultFormat,
  speed: number = TTS_CONFIG.defaultSpeed
): Promise<Buffer> {
  const requestBody: TTSGenerateRequest = {
    model: TTS_CONFIG.model,
    input: text,
    voice,
    response_format: format,
    speed,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= TTS_CONFIG.retryAttempts; attempt++) {
    try {
      const response = await fetch(`${TTS_CONFIG.baseUrl}/v1/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(TTS_CONFIG.timeout),
      });

      if (!response.ok) {
        throw new Error(`TTS responded with ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      ttsAvailable = true;
      return buffer;
    } catch (error) {
      lastError = error as Error;
      ttsAvailable = false;

      if (attempt < TTS_CONFIG.retryAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, TTS_CONFIG.retryDelay * attempt)
        );
      }
    }
  }

  throw lastError || new Error("TTS generation failed");
}

export async function combineVoices(
  voiceSpec: string
): Promise<Buffer> {
  const response = await fetch(
    `${TTS_CONFIG.baseUrl}/v1/audio/voices/combine`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(voiceSpec),
      signal: AbortSignal.timeout(TTS_CONFIG.timeout),
    }
  );

  if (!response.ok) {
    throw new Error(`Voice combine responded with ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export function getCacheKey(
  text: string,
  voice: string,
  speed: number,
  format: string
): string {
  const input = `${text}|${voice}|${speed}|${format}`;
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function getCachedAudio(
  userId: string,
  text: string,
  voice: string,
  speed: number,
  format: string
): { buffer: Buffer; duration: number } | null {
  if (!TTS_CONFIG.cacheEnabled) return null;

  const db = getDb();
  const hash = getCacheKey(text, voice, speed, format);

  const row = db
    .prepare(
      "SELECT audio_path, duration_ms FROM tts_cache WHERE user_id = ? AND text_hash = ?"
    )
    .get(userId, hash) as
    | { audio_path: string; duration_ms: number }
    | undefined;

  if (!row || !fs.existsSync(row.audio_path)) return null;

  // Update last_used and use_count
  db.prepare(
    "UPDATE tts_cache SET last_used = CURRENT_TIMESTAMP, use_count = use_count + 1 WHERE user_id = ? AND text_hash = ?"
  ).run(userId, hash);

  return {
    buffer: fs.readFileSync(row.audio_path),
    duration: row.duration_ms,
  };
}

export function cacheAudio(
  userId: string,
  text: string,
  voice: string,
  speed: number,
  format: string,
  audio: Buffer
): void {
  if (!TTS_CONFIG.cacheEnabled) return;

  const cacheDir = path.join("data", userId, "tts_cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const hash = getCacheKey(text, voice, speed, format);
  const filePath = path.join(cacheDir, `${hash}.${format}`);

  fs.writeFileSync(filePath, audio);

  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO tts_cache (id, user_id, text_hash, voice_name, text_content, audio_format, audio_path, duration_ms, created_at, last_used, use_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`
  ).run(
    crypto.randomUUID(),
    userId,
    hash,
    voice,
    text,
    format,
    filePath,
    null // duration unknown until played
  );
}

import { TTS_CONFIG } from "./config";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDb } from "./db";
import { discoverVoices } from "./voice-discovery";

export { TTS_CONFIG };
export {
  isTTSAvailable,
  getAvailableVoices,
  parseVoiceInfo,
  discoverVoices,
  getVoiceById,
  getVoicesByLanguage,
  getVoicesByGender,
  getLastDiscovery,
  needsRediscovery,
} from "./voice-discovery";
export type { VoiceInfo } from "./voice-discovery";

export interface TTSGenerateRequest {
  model: string;
  input: string;
  voice: string;
  response_format?: string;
  speed?: number;
}

export async function checkTTSConnection(ttsUrl?: string): Promise<boolean> {
  const voices = await discoverVoices(ttsUrl);
  return voices.length > 0;
}

export async function generateSpeech(
  text: string,
  voice: string,
  format: string = TTS_CONFIG.defaultFormat,
  speed: number = TTS_CONFIG.defaultSpeed,
  ttsUrl?: string
): Promise<Buffer> {
  const baseUrl = ttsUrl ? (ttsUrl.startsWith("http") ? ttsUrl : `http://${ttsUrl}`) : TTS_CONFIG.baseUrl;
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
      const response = await fetch(`${baseUrl}/v1/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(TTS_CONFIG.timeout),
      });

      if (!response.ok) {
        throw new Error(`TTS responded with ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer;
    } catch (err: unknown) {
      lastError = err as Error;

      if (attempt < TTS_CONFIG.retryAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, TTS_CONFIG.retryDelay * attempt)
        );
      }
    }
  }

  throw lastError || new Error("TTS generation failed");
}

/**
 * Generate speech with streaming support.
 * Returns a ReadableStream of audio chunks.
 */
export async function generateSpeechStream(
  text: string,
  voice: string,
  format: string = TTS_CONFIG.defaultFormat,
  speed: number = TTS_CONFIG.defaultSpeed,
  ttsUrl?: string
): Promise<ReadableStream<Uint8Array>> {
  const baseUrl = ttsUrl ? (ttsUrl.startsWith("http") ? ttsUrl : `http://${ttsUrl}`) : TTS_CONFIG.baseUrl;
  const requestBody: TTSGenerateRequest = {
    model: TTS_CONFIG.model,
    input: text,
    voice,
    response_format: format,
    speed,
  };

  const response = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...requestBody, stream: true }),
    signal: AbortSignal.timeout(TTS_CONFIG.timeout),
  });

  if (!response.ok) {
    throw new Error(`TTS responded with ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        controller.close();
      }
    },
  });
}

export async function combineVoices(
  voiceSpec: string,
  ttsUrl?: string
): Promise<Buffer> {
  const baseUrl = ttsUrl ? (ttsUrl.startsWith("http") ? ttsUrl : `http://${ttsUrl}`) : TTS_CONFIG.baseUrl;
  const response = await fetch(
    `${baseUrl}/v1/audio/voices/combine`,
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

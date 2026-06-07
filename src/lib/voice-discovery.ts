/**
 * Voice Discovery
 *
 * Auto-discovers available TTS voices from Kokoro server.
 * Parses voice IDs to infer metadata (language, gender).
 * Supports re-discovery and caching.
 */

import { TTS_CONFIG, TIMEOUTS, TIME } from "./config";

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender: string;
  region: string;
}

let availableVoices: VoiceInfo[] = [];
let ttsAvailable = false;
let lastDiscovery: number | null = null;

/**
 * Language prefix mapping
 */
const LANGUAGE_MAP: Record<string, string> = {
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

/**
 * Parse voice ID to extract metadata
 */
export function parseVoiceInfo(voiceId: string): VoiceInfo {
  const prefix = voiceId.substring(0, 2).toLowerCase();
  const genderChar = voiceId.charAt(2).toLowerCase();

  return {
    id: voiceId,
    name: voiceId,
    language: LANGUAGE_MAP[prefix] || "Unknown",
    gender: genderChar === "f" ? "Female" : genderChar === "m" ? "Male" : "Unknown",
    region: LANGUAGE_MAP[prefix] || "Unknown",
  };
}

/**
 * Discover available voices from Kokoro server
 */
export async function discoverVoices(ttsUrl?: string): Promise<VoiceInfo[]> {
  const baseUrl = ttsUrl ? (ttsUrl.startsWith("http") ? ttsUrl : `http://${ttsUrl}`) : TTS_CONFIG.baseUrl;
  try {
    const response = await fetch(`${baseUrl}/v1/audio/voices`, {
      signal: AbortSignal.timeout(TIMEOUTS.VOICE_DISCOVERY),
    });

    if (response.ok) {
      const data = await response.json();
      const voiceIds: string[] = data.voices || [];
      availableVoices = voiceIds.map((id) => parseVoiceInfo(id));
      ttsAvailable = true;
      lastDiscovery = Date.now();
      return availableVoices;
    }

    ttsAvailable = false;
    return [];
  } catch {
    ttsAvailable = false;
    return [];
  }
}

/**
 * Check if TTS is available (with optional cached result)
 */
export function isTTSAvailable(): boolean {
  return ttsAvailable;
}

/**
 * Get cached list of available voices
 */
export function getAvailableVoices(): VoiceInfo[] {
  return availableVoices;
}

/**
 * Get voice by ID
 */
export function getVoiceById(id: string): VoiceInfo | undefined {
  return availableVoices.find((v) => v.id === id);
}

/**
 * Filter voices by language
 */
export function getVoicesByLanguage(language: string): VoiceInfo[] {
  return availableVoices.filter(
    (v) => v.language.toLowerCase() === language.toLowerCase()
  );
}

/**
 * Filter voices by gender
 */
export function getVoicesByGender(gender: string): VoiceInfo[] {
  return availableVoices.filter(
    (v) => v.gender.toLowerCase() === gender.toLowerCase()
  );
}

/**
 * Get last discovery timestamp
 */
export function getLastDiscovery(): number | null {
  return lastDiscovery;
}

/**
 * Check if voices need re-discovery (older than 1 hour)
 */
export function needsRediscovery(): boolean {
  if (!lastDiscovery) return true;
  return Date.now() - lastDiscovery > TIME.ONE_HOUR; // 1 hour
}

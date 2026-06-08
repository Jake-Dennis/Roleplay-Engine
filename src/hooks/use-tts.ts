/**
 * @deprecated This file is not currently imported by any source module.
 * Kept for reference. Will be removed in a future cleanup pass once
 * all consumers are verified.
 * @reason TTS playback hook was never integrated into the TTS components.
 * TTS functionality is handled via lower-level components (tts-controls,
 * voice-picker) that use direct API calls rather than this hook.
 */

/**
 * useTTS Hook
 *
 * Manages TTS playback state, queue, and settings.
 * Integrates with ttsQueue for non-blocking audio generation.
 *
 * Usage:
 *   const { isPlaying, play, stop, setSpeed, setVolume } = useTTS();
 */

import { useState, useRef, useCallback } from "react";
import { ttsQueue } from "@/lib/tts-queue";

interface UseTTSResult {
  isPlaying: boolean;
  currentMessageId: string | null;
  speed: number;
  volume: number;
  play: (messageId: string, text: string, voice?: string) => Promise<void>;
  stop: () => void;
  setSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
}

export function useTTS(): UseTTSResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [speed, setSpeedState] = useState(1.0);
  const [volume, setVolumeState] = useState(0.8);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    setCurrentMessageId(null);
  }, []);

  const play = useCallback(async (messageId: string, text: string, voice?: string) => {
    // Stop any currently playing audio
    stop();

    try {
      const result = await ttsQueue.generate({ text, voice, speed });

      const audio = new Audio(result.url);
      audio.volume = volume;
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentMessageId(null);
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setCurrentMessageId(null);
      };

      await audio.play();
      setIsPlaying(true);
      setCurrentMessageId(messageId);
    } catch {
      setIsPlaying(false);
      setCurrentMessageId(null);
    }
  }, [stop, speed, volume]);

  const setSpeed = useCallback((newSpeed: number) => {
    setSpeedState(Math.max(0.5, Math.min(2.0, newSpeed)));
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    setVolumeState(Math.max(0, Math.min(1, newVolume)));
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  }, []);

  return {
    isPlaying,
    currentMessageId,
    speed,
    volume,
    play,
    stop,
    setSpeed,
    setVolume,
  };
}

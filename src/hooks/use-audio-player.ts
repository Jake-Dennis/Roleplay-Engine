/**
 * useAudioPlayer Hook
 *
 * Audio playback with play/stop/lifecycle management.
 * Used in session page (TTS for messages) and voice-combiner (TTS preview).
 *
 * Usage:
 *   const { isPlaying, duration, play, stop } = useAudioPlayer();
 *   play(audioUrl, { onEnd: () => console.log("done") });
 */

import { useState, useRef, useCallback } from "react";

interface UseAudioPlayerResult {
  isPlaying: boolean;
  duration: number | null;
  play: (url: string, options?: AudioPlayerOptions) => void;
  stop: () => void;
}

interface AudioPlayerOptions {
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

export function useAudioPlayer(): UseAudioPlayerResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlaying(false);
    setDuration(null);
  }, []);

  const play = useCallback((url: string, options?: AudioPlayerOptions) => {
    // Stop any currently playing audio
    stop();

    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onended = () => {
      setIsPlaying(false);
      setDuration(null);
      options?.onEnd?.();
    };

    audio.onerror = () => {
      setIsPlaying(false);
      setDuration(null);
      options?.onError?.(new Error("Audio playback failed"));
    };

    audio.onloadedmetadata = () => {
      setDuration(Math.round(audio.duration * 1000));
    };

    audio.play().catch((e) => {
      setIsPlaying(false);
      options?.onError?.(e);
    });

    setIsPlaying(true);
  }, [stop]);

  return { isPlaying, duration, play, stop };
}

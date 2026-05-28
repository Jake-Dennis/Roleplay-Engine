"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface TTSPlaybackRenderProps {
  ttsPlayingId: string | null;
  handleTtsPlay: (messageId: string, content: string) => Promise<void>;
}

interface TTSPlaybackProps {
  children: (props: TTSPlaybackRenderProps) => React.ReactNode;
}

export function TTSPlayback({ children }: TTSPlaybackProps) {
  const [ttsPlayingId, setTtsPlayingId] = useState<string | null>(null);
  const [defaultVoice, setDefaultVoice] = useState("af_heart");
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsBlobUrlRef = useRef<string | null>(null);
  const ttsPlayingIdRef = useRef<string | null>(null);

  // Keep ref in sync with state for use inside handleTtsPlay without recreating it
  useEffect(() => {
    ttsPlayingIdRef.current = ttsPlayingId;
  }, [ttsPlayingId]);

  // Load narrator voice assignment for TTS default
  useEffect(() => {
    fetch("/api/voice-assignments?entityType=narrator&entityId=default")
      .then((res) => res.json())
      .then((data) => {
        if (data.assignment?.voice_name) {
          setDefaultVoice(data.assignment.voice_name);
        }
      })
      .catch(() => { /* use fallback default */ });
  }, []);

  // Cleanup TTS audio on unmount
  useEffect(() => {
    return () => {
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      if (ttsBlobUrlRef.current) {
        URL.revokeObjectURL(ttsBlobUrlRef.current);
        ttsBlobUrlRef.current = null;
      }
    };
  }, []);

  const handleTtsPlay = useCallback(async (messageId: string, content: string) => {
    if (ttsPlayingIdRef.current === messageId) {
      // Stop
      ttsAudioRef.current?.pause();
      ttsAudioRef.current = null;
      if (ttsBlobUrlRef.current) {
        URL.revokeObjectURL(ttsBlobUrlRef.current);
        ttsBlobUrlRef.current = null;
      }
      setTtsPlayingId(null);
      return;
    }

    try {
      // Try streaming first
      const streamRes = await fetch(`/api/tts/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, voice: defaultVoice }),
      });

      if (streamRes.ok && streamRes.body) {
        // Streaming response - use MediaSource for chunked playback
        const mediaSource = new MediaSource();
        const audio = new Audio();

        ttsAudioRef.current = audio;

        mediaSource.addEventListener("sourceopen", async () => {
          const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
          const reader = streamRes.body!.getReader();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              while (sourceBuffer.updating) {
                await new Promise((r) => setTimeout(r, 10));
              }
              sourceBuffer.appendBuffer(value);
            }
            mediaSource.endOfStream();
          } catch {
            // Stream error
          }
        });

        audio.src = URL.createObjectURL(mediaSource);
        setTtsPlayingId(messageId);

        audio.onended = () => {
          setTtsPlayingId(null);
        };

        audio.onerror = () => {
          setTtsPlayingId(null);
        };

        await audio.play();
        return;
      }

      // Fallback to non-streaming
      const res = await fetch(`/api/tts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, voice: defaultVoice }),
      });

      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Clean up previous audio
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
      }
      if (ttsBlobUrlRef.current) {
        URL.revokeObjectURL(ttsBlobUrlRef.current);
      }

      const audio = new Audio(url);
      ttsAudioRef.current = audio;
      ttsBlobUrlRef.current = url;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        ttsBlobUrlRef.current = null;
        setTtsPlayingId(null);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        ttsBlobUrlRef.current = null;
        setTtsPlayingId(null);
      };

      setTtsPlayingId(messageId);
      await audio.play();
    } catch {
      setTtsPlayingId(null);
    }
  }, [defaultVoice]);

  return children({ ttsPlayingId, handleTtsPlay });
}

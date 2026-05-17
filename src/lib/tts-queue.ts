/**
 * Client-side TTS queue for non-blocking audio generation.
 * Queues TTS requests and processes them sequentially.
 * Includes caching to avoid re-generating recently played audio.
 */

export interface TtsRequest {
  text: string;
  voice?: string;
  speed?: number;
}

export interface TtsResult {
  url: string;
  durationMs: number;
}

type TtsCallback = (result: TtsResult) => void;
type TtsErrorCallback = (error: Error) => void;

class TtsQueue {
  private queue: { request: TtsRequest; resolve: TtsCallback; reject: TtsErrorCallback }[] = [];
  private processing = false;
  private cache = new Map<string, string>(); // text_hash -> blob URL
  private cacheSize = 20;

  /**
   * Queue a TTS generation request
   */
  async generate(request: TtsRequest): Promise<TtsResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.processNext();
    });
  }

  /**
   * Process the next item in the queue
   */
  private async processNext() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const item = this.queue.shift()!;

    try {
      // Check cache first
      const cacheKey = `${item.request.voice || "af_bella"}:${item.request.text}`;
      const cached = this.cache.get(cacheKey);

      if (cached) {
        item.resolve({ url: cached, durationMs: 0 });
        this.processing = false;
        this.processNext();
        return;
      }

      // Generate TTS
      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: item.request.text,
          voice: item.request.voice || "af_bella",
          speed: item.request.speed || 1.0,
        }),
      });

      if (!res.ok) {
        throw new Error(`TTS generation failed: ${res.statusText}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Add to cache, evict oldest if needed
      if (this.cache.size >= this.cacheSize) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          const oldUrl = this.cache.get(firstKey);
          if (oldUrl) URL.revokeObjectURL(oldUrl);
          this.cache.delete(firstKey);
        }
      }
      this.cache.set(cacheKey, url);

      item.resolve({ url, durationMs: 0 });
    } catch (error) {
      item.reject(error instanceof Error ? error : new Error("TTS generation failed"));
    } finally {
      this.processing = false;
      this.processNext();
    }
  }

  /**
   * Clear the queue and cancel pending requests
   */
  clear() {
    this.queue = [];
  }

  /**
   * Get the number of pending requests
   */
  get pending(): number {
    return this.queue.length;
  }
}

// Singleton
export const ttsQueue = new TtsQueue();

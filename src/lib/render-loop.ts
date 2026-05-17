"use client";

class RenderLoop {
  private targetFPS: number;
  private interval: number;
  private lastFrame: number;
  private callbacks: ((delta: number) => void)[];
  private running: boolean;
  private rafId: number | null;

  constructor(targetFPS = 30) {
    this.targetFPS = targetFPS;
    this.interval = 1000 / targetFPS;
    this.lastFrame = 0;
    this.callbacks = [];
    this.running = false;
    this.rafId = null;
  }

  start() {
    this.running = true;
    this.lastFrame = performance.now();
    this.tick();
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = () => {
    if (!this.running) return;

    const now = performance.now();
    const delta = now - this.lastFrame;

    if (delta >= this.interval) {
      this.lastFrame = now - (delta % this.interval);

      for (const cb of this.callbacks) {
        cb(delta);
      }
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  subscribe(callback: (delta: number) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  get isRunning(): boolean {
    return this.running;
  }

  get fps(): number {
    return this.targetFPS;
  }
}

export const renderLoop = new RenderLoop(30);

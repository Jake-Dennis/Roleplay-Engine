/**
 * Simple in-process event bus for SSE notifications.
 * API routes emit events, SSE streams consume them.
 *
 * Supports event IDs for Last-Event-ID reconnection.
 * Tracks event history in-memory (last 100 events per session).
 */

import type { DbRow } from '@/lib/types';

type EventHandler<T = unknown> = (data: T) => void;

interface StoredEvent {
  id: number;
  name: string;
  data: unknown;
}

class EventBus {
  private handlers = new Map<string, Set<EventHandler<unknown>>>();
  private counter = 0;
  // Store recent events per session for reconnection
  private eventHistory = new Map<string, StoredEvent[]>();
  private readonly MAX_HISTORY = 100;
  // Track active connections per session
  private connectionCount = new Map<string, number>();
  // D6: Max concurrent connections per session
  private readonly MAX_CONNECTIONS = 50;
  // Track active SSE stream controllers for graceful shutdown
  private activeControllers = new Set<ReadableStreamDefaultController>();
  // Periodic cleanup interval for abandoned session data
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start periodic cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    // Prevent the interval from keeping the process alive
    if (typeof this.cleanupInterval === "object" && "unref" in this.cleanupInterval) {
      (this.cleanupInterval as { unref: () => void }).unref();
    }
  }

  /**
   * Subscribe to an event type
   * Returns an unsubscribe function
   */
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler<unknown>);

    return () => {
      this.handlers.get(event)?.delete(handler as EventHandler<unknown>);
    };
  }

  /**
   * Emit an event to all subscribers with an auto-incrementing ID
   */
  emit<T = unknown>(event: string, data: T): number {
    const id = ++this.counter;
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler({ ...data, _eventId: id, _eventName: event });
        } catch {
          // Silently handle subscriber errors
        }
      }
    }

    // Store in event history for reconnection
    // Extract session ID from event name (format: "type:sessionId")
    const parts = event.split(":");
    const sessionId = parts.length >= 2 ? parts.slice(1).join(":") : null;
    if (sessionId) {
      if (!this.eventHistory.has(sessionId)) {
        this.eventHistory.set(sessionId, []);
      }
      const history = this.eventHistory.get(sessionId)!;
      history.push({ id, name: event, data });
      // Trim to max history
      if (history.length > this.MAX_HISTORY) {
        history.splice(0, history.length - this.MAX_HISTORY);
      }
    }

    return id;
  }

  /**
   * Get events since a given event ID for a session
   */
  getEventsSince(sessionId: string, lastEventId: number): StoredEvent[] {
    const history = this.eventHistory.get(sessionId);
    if (!history) return [];
    return history.filter((e) => e.id > lastEventId);
  }

  /**
   * Track connection count for a session
   * Returns -1 if max connections exceeded
   */
  addConnection(sessionId: string): number {
    const count = (this.connectionCount.get(sessionId) || 0) + 1;
    // D6: Enforce max 50 concurrent connections
    if (count > this.MAX_CONNECTIONS) {
      return -1;
    }
    this.connectionCount.set(sessionId, count);
    return count;
  }

  /**
   * Check if a new connection can be added
   */
  canConnect(sessionId: string): boolean {
    return (this.connectionCount.get(sessionId) || 0) < this.MAX_CONNECTIONS;
  }

  /**
   * Get max connections limit
   */
  getMaxConnections(): number {
    return this.MAX_CONNECTIONS;
  }

  removeConnection(sessionId: string): number {
    const count = Math.max(0, (this.connectionCount.get(sessionId) || 1) - 1);
    if (count === 0) {
      this.connectionCount.delete(sessionId);
    } else {
      this.connectionCount.set(sessionId, count);
    }
    return count;
  }

  getConnectionCount(sessionId: string): number {
    return this.connectionCount.get(sessionId) || 0;
  }

  /**
   * Get the current event counter (for SSE id: fields)
   */
  getCurrentEventId(): number {
    return this.counter;
  }

  /**
   * Remove all handlers for an event
   */
  removeAll(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Register a ReadableStream controller for tracking.
   * Used by SSE routes so shutdown can close all active streams.
   */
  registerController(controller: ReadableStreamDefaultController): void {
    this.activeControllers.add(controller);
  }

  /**
   * Unregister a ReadableStream controller.
   * Call when an SSE connection closes normally.
   */
  unregisterController(controller: ReadableStreamDefaultController): void {
    this.activeControllers.delete(controller);
  }

  /**
   * Remove stale entries from eventHistory and connectionCount
   * for sessions that have no active connections.
   */
  cleanup(): void {
    const activeSessions = new Set(this.connectionCount.keys());

    // Clean eventHistory: remove sessions with no active connections
    for (const sessionId of this.eventHistory.keys()) {
      if (!activeSessions.has(sessionId)) {
        this.eventHistory.delete(sessionId);
      }
    }

    // Clean connectionCount: remove sessions with zero connections
    // (shouldn't happen normally since removeConnection deletes at 0,
    // but guards against abnormal disconnects)
    for (const [sessionId, count] of this.connectionCount.entries()) {
      if (count <= 0) {
        this.connectionCount.delete(sessionId);
      }
    }
  }

  /**
   * Drain all active SSE streams and clear all handlers.
   * Closes every tracked controller, then removes all event subscriptions.
   * Returns the number of streams that were closed.
   */
  drainAll(): number {
    const count = this.activeControllers.size;
    for (const controller of this.activeControllers) {
      try {
        controller.close();
      } catch {
        // Controller may already be closed
      }
    }
    this.activeControllers.clear();
    this.handlers.clear();

    // Stop the periodic cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clean up all session data
    this.eventHistory.clear();
    this.connectionCount.clear();

    return count;
  }
}

// Singleton
export const eventBus = new EventBus();

// Event types
export const SessionEvents = {
  MESSAGE_CREATED: "message:created",
  MESSAGE_UPDATED: "message:updated",
  MESSAGE_DELETED: "message:deleted",
  GENERATION_STARTED: "generation:started",
  GENERATION_DONE: "generation:done",
  TTS_QUEUED: "tts:queued",
  TTS_COMPLETED: "tts:completed",
  PARTICIPANT_JOINED: "participant:joined",
  PARTICIPANT_LEFT: "participant:left",
  PARTICIPANT_KICKED: "participant:kicked",
  PARTICIPANT_INVITED: "participant:invited",
  PARTICIPANT_ROLE_CHANGED: "participant:role_changed",
  TURN_UPDATED: "turn:updated",
  // D5: New SSE events
  SCENE_UPDATED: "scene:updated",
  THREAD_UPDATED: "thread:updated",
  JOB_COMPLETED: "job:completed",
  JOB_PROGRESS: "job:progress",
  SESSION_UPDATED: "session:updated",
  // Wiki page events
  WIKI_PAGE_CREATED: "wiki:page_created",
  WIKI_PAGE_UPDATED: "wiki:page_updated",
} as const;

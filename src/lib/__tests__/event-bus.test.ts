import { describe, it, expect, beforeEach } from "bun:test";
import { eventBus } from "../event-bus";

beforeEach(() => {
  // Drain all state between tests: clears handlers, controllers,
  // event history, connection counts, and stops the cleanup interval.
  // This prevents cross-test contamination on the singleton.
  eventBus.drainAll();
});

describe("on() / emit() — basic subscription and emission", () => {
  it("calls the handler when an event is emitted", () => {
    const calls: unknown[] = [];
    eventBus.on("test:event", (data) => calls.push(data));
    eventBus.emit("test:event", { msg: "hello" });
    expect(calls).toHaveLength(1);
  });

  it("delivers the payload with _eventId and _eventName added", () => {
    let received: unknown = null;
    eventBus.on("test:event", (data) => { received = data; });
    const id = eventBus.emit("test:event", { key: "value" });

    expect(received).toEqual({
      key: "value",
      _eventId: id,
      _eventName: "test:event",
    });
  });

  it("returns an auto-incrementing event ID from emit()", () => {
    const id1 = eventBus.emit("test:event", { n: 1 });
    const id2 = eventBus.emit("test:event", { n: 2 });
    const id3 = eventBus.emit("test:event", { n: 3 });
    expect(id2).toBe(id1 + 1);
    expect(id3).toBe(id2 + 1);
  });
});

describe("multiple subscribers for the same event", () => {
  it("all subscribers receive the event", () => {
    const received1: unknown[] = [];
    const received2: unknown[] = [];
    const received3: unknown[] = [];

    eventBus.on("multi:event", (data) => received1.push(data));
    eventBus.on("multi:event", (data) => received2.push(data));
    eventBus.on("multi:event", (data) => received3.push(data));

    eventBus.emit("multi:event", { n: 1 });
    eventBus.emit("multi:event", { n: 2 });

    expect(received1).toHaveLength(2);
    expect(received2).toHaveLength(2);
    expect(received3).toHaveLength(2);
  });
});

describe("off() — unsubscribe removes listener", () => {
  it("unsubscribed handler is no longer called", () => {
    const calls: unknown[] = [];
    const unsubscribe = eventBus.on("unsub:test", (data) => calls.push(data));

    eventBus.emit("unsub:test", { n: 1 });
    expect(calls).toHaveLength(1);

    unsubscribe();
    eventBus.emit("unsub:test", { n: 2 });
    expect(calls).toHaveLength(1); // Still 1, handler was removed
  });

  it("unsubscribing one handler does not affect other handlers", () => {
    const callsA: unknown[] = [];
    const callsB: unknown[] = [];

    const unsubA = eventBus.on("unsub:multi", (data) => callsA.push(data));
    eventBus.on("unsub:multi", (data) => callsB.push(data));

    eventBus.emit("unsub:multi", { n: 1 });
    expect(callsA).toHaveLength(1);
    expect(callsB).toHaveLength(1);

    unsubA();
    eventBus.emit("unsub:multi", { n: 2 });

    expect(callsA).toHaveLength(1); // Not called again
    expect(callsB).toHaveLength(2); // Still receives
  });

  it("calling unsubscribe multiple times is safe", () => {
    const calls: unknown[] = [];
    const unsubscribe = eventBus.on("safe:unsub", (data) => calls.push(data));

    unsubscribe();
    unsubscribe();
    unsubscribe(); // Should not throw

    eventBus.emit("safe:unsub", { n: 1 });
    expect(calls).toHaveLength(0);
  });
});

describe("history replay — getEventsSince()", () => {
  it("stores events with session-scoped event names", () => {
    // Event names with ":" are treated as session-scoped:
    // "type:sessionId" → history stored under "sessionId"
    eventBus.emit("message:sess001", { text: "Hello" });
    eventBus.emit("message:sess001", { text: "World" });

    const history = eventBus.getEventsSince("sess001", 0);
    expect(history).toHaveLength(2);
    expect(history[0].name).toBe("message:sess001");
    expect(history[0].data).toEqual({ text: "Hello" });
  });

  it("returns only events after the given lastEventId", () => {
    const id1 = eventBus.emit("chat:sess002", { m: "first" });
    const id2 = eventBus.emit("chat:sess002", { m: "second" });
    eventBus.emit("chat:sess002", { m: "third" });

    // Get events after id1 (should get id2 and id3)
    const afterFirst = eventBus.getEventsSince("sess002", id1);
    expect(afterFirst).toHaveLength(2);
    expect(afterFirst[0].id).toBe(id2);
    expect(afterFirst[1].id).toBe(id1 + 2);

    // Get events after id2 (should get only id3)
    const afterSecond = eventBus.getEventsSince("sess002", id2);
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].id).toBe(id2 + 1);
  });

  it("returns empty array for unknown session", () => {
    expect(eventBus.getEventsSince("nonexistent", 0)).toEqual([]);
  });

  it("returns empty array when lastEventId matches the latest event", () => {
    const id = eventBus.emit("chat:sess003", { m: "only" });
    expect(eventBus.getEventsSince("sess003", id)).toEqual([]);
  });

  it("does not store events without a session-scoped name", () => {
    // Event name without ":" — no session ID extracted, no history stored
    eventBus.emit("global-event", { n: 1 });
    eventBus.emit("also-global", { n: 2 });

    // Should have no history for any session
    expect(eventBus.getEventsSince("", 0)).toEqual([]);
  });
});

describe("controller registration — registerController / unregisterController", () => {
  it("registers a controller", () => {
    // Create a mock that resembles ReadableStreamDefaultController
    const controller = {
      close: () => {},
      desiredSize: 1,
      enqueue: () => {},
      error: () => {},
    } as unknown as ReadableStreamDefaultController;

    eventBus.registerController(controller);
    // No direct getter for activeControllers, but drainAll returns count
    // We'll verify indirectly via drainAll
    expect(eventBus.drainAll()).toBe(1); // One controller was registered
  });

  it("unregisterController removes a controller", () => {
    const c1 = { close: () => {} } as unknown as ReadableStreamDefaultController;
    const c2 = { close: () => {} } as unknown as ReadableStreamDefaultController;

    eventBus.registerController(c1);
    eventBus.registerController(c2);
    eventBus.unregisterController(c1);

    expect(eventBus.drainAll()).toBe(1); // Only c2 remains
  });

  it("unregistering a non-registered controller is safe", () => {
    const c = { close: () => {} } as unknown as ReadableStreamDefaultController;
    // Should not throw
    eventBus.unregisterController(c);
  });
});

describe("error isolation — one listener error doesn't break others", () => {
  it("other handlers still run when one throws", () => {
    const calls: string[] = [];
    eventBus.on("err:test", () => {
      throw new Error("First handler failed");
    });
    eventBus.on("err:test", () => {
      calls.push("second");
    });
    eventBus.on("err:test", () => {
      calls.push("third");
    });

    eventBus.emit("err:test", { n: 1 });

    expect(calls).toEqual(["second", "third"]);
  });

  it("all handlers run even if all throw", () => {
    const calls: string[] = [];
    eventBus.on("err:all", () => {
      calls.push("a");
      throw new Error("A");
    });
    eventBus.on("err:all", () => {
      calls.push("b");
      throw new Error("B");
    });

    // Should not throw
    expect(() => eventBus.emit("err:all", {})).not.toThrow();
    expect(calls).toEqual(["a", "b"]);
  });
});

describe("empty emit — no subscribers", () => {
  it("does not throw when emitting to a non-existent event", () => {
    expect(() => eventBus.emit("ghost:event", {})).not.toThrow();
  });

  it("does not throw when emitting to an event with no handlers", () => {
    eventBus.on("lonely:event", () => {});
    eventBus.off?.("lonely:event"); // N/A — use returned unsubscribe
    // Just emit with no handlers
    expect(() => eventBus.emit("lonely:event", {})).not.toThrow();
  });
});

describe("multiple event types on the same bus", () => {
  it("handlers only receive events for their subscribed type", () => {
    const typeA: unknown[] = [];
    const typeB: unknown[] = [];

    eventBus.on("type:a", (data) => typeA.push(data));
    eventBus.on("type:b", (data) => typeB.push(data));

    eventBus.emit("type:a", { letter: "A" });
    eventBus.emit("type:b", { letter: "B" });
    eventBus.emit("type:a", { letter: "A2" });

    expect(typeA).toHaveLength(2);
    expect(typeB).toHaveLength(1);
  });

  it("events of different types share a global sequential counter", () => {
    // The event ID counter is global, not per-event-type
    const idA1 = eventBus.emit("counter:a", {});
    const idB1 = eventBus.emit("counter:b", {});
    const idA2 = eventBus.emit("counter:a", {});

    // IDs are sequential, never repeated, regardless of event type
    expect(idB1).toBe(idA1 + 1);
    expect(idA2).toBe(idA1 + 2);
    // Counter started somewhere > 0 because previous tests emitted
    expect(idA1).toBeGreaterThan(0);
  });
});

describe("removeAll() — removing handlers", () => {
  it("removeAll with an event name removes only that event's handlers", () => {
    const callsKeep: unknown[] = [];
    const callsRemove: unknown[] = [];

    eventBus.on("keep:event", (data) => callsKeep.push(data));
    eventBus.on("remove:event", (data) => callsRemove.push(data));

    eventBus.removeAll("remove:event");

    eventBus.emit("keep:event", { n: 1 });
    eventBus.emit("remove:event", { n: 2 });

    expect(callsKeep).toHaveLength(1);
    expect(callsRemove).toHaveLength(0);
  });

  it("removeAll() without argument removes all handlers", () => {
    const callsA: unknown[] = [];
    const callsB: unknown[] = [];

    eventBus.on("all:a", (data) => callsA.push(data));
    eventBus.on("all:b", (data) => callsB.push(data));

    eventBus.removeAll();

    eventBus.emit("all:a", {});
    eventBus.emit("all:b", {});

    expect(callsA).toHaveLength(0);
    expect(callsB).toHaveLength(0);
  });
});

describe("drainAll() — full reset", () => {
  it("returns the count of active controllers", () => {
    const c1 = { close: () => {} } as unknown as ReadableStreamDefaultController;
    const c2 = { close: () => {} } as unknown as ReadableStreamDefaultController;

    eventBus.registerController(c1);
    eventBus.registerController(c2);

    expect(eventBus.drainAll()).toBe(2);
  });

  it("completely resets all state for a fresh start", () => {
    // Set up some state
    eventBus.emit("chat:sessX", { m: "hello" });
    eventBus.on("some:event", () => {});
    eventBus.addConnection("sessX");

    // Drain
    eventBus.drainAll();

    // After drain, handlers are cleared (subscription gone)
    const calls: unknown[] = [];
    eventBus.on("fresh:event", (data) => calls.push(data));
    eventBus.emit("fresh:event", { ok: true });
    // The old 'some:event' listener was removed; only our new one fires
    expect(calls).toHaveLength(1);

    // Event history and connections are cleared
    expect(eventBus.getEventsSince("sessX", 0)).toEqual([]);
    expect(eventBus.getConnectionCount("sessX")).toBe(0);

    // The counter does NOT reset (global uniqueness guarantee)
    // but we can verify it still increments
    const id = eventBus.emit("post:drain", {});
    expect(id).toBeGreaterThan(0);
  });

  it("can be called multiple times safely", () => {
    expect(eventBus.drainAll()).toBe(0);
    expect(eventBus.drainAll()).toBe(0);
    expect(eventBus.drainAll()).toBe(0);
  });
});

describe("connection management", () => {
  it("addConnection increments the connection count", () => {
    expect(eventBus.addConnection("sessC1")).toBe(1);
    expect(eventBus.addConnection("sessC1")).toBe(2);
    expect(eventBus.getConnectionCount("sessC1")).toBe(2);
  });

  it("removeConnection decrements the connection count", () => {
    eventBus.addConnection("sessC2");
    eventBus.addConnection("sessC2");
    eventBus.addConnection("sessC2");

    expect(eventBus.removeConnection("sessC2")).toBe(2);
    expect(eventBus.removeConnection("sessC2")).toBe(1);
    expect(eventBus.removeConnection("sessC2")).toBe(0);
    // Removed from map (get returns 0)
    expect(eventBus.getConnectionCount("sessC2")).toBe(0);
  });

  it("canConnect respects the max connections limit", () => {
    const max = eventBus.getMaxConnections();
    // Fill up to max
    for (let i = 0; i < max; i++) {
      eventBus.addConnection("sessC3");
    }
    expect(eventBus.canConnect("sessC3")).toBe(false);

    // addConnection returns -1 when limit exceeded
    expect(eventBus.addConnection("sessC3")).toBe(-1);

    // After removing one, can connect again
    eventBus.removeConnection("sessC3");
    expect(eventBus.canConnect("sessC3")).toBe(true);
  });

  it("removeConnection on empty session returns 0 and doesn't error", () => {
    expect(eventBus.removeConnection("nonexistent")).toBe(0);
  });
});

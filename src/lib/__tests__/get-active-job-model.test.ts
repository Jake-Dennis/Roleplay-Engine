/**
 * Tests for getActiveJobModel — the resolver that picks which model jobs
 * (summarization, wiki enrichment, NPC evolution, etc.) should use.
 *
 * 3 cases:
 *  - toggle OFF → returns chat model
 *  - toggle ON + model set → returns job model
 *  - toggle ON + model null → returns chat model (defensive)
 *
 * The function is a thin wrapper over getServerConfig() + getUserModels(),
 * both of which read the live SQLite DB (which bun:test cannot open via
 * better-sqlite3). We exercise the function end-to-end by mocking just
 * the two leaf dependencies and asserting the resolver's branching
 * behavior. This catches regressions in the conditional logic without
 * requiring a live DB.
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";

// ===========================================================================
// Mutable mock state — reassigned in beforeEach / individual tests.
// ===========================================================================
let mockUseJobsModel = false;
let mockJobModel: string | null = null;
let mockChatModel = "chat-model:7b";

// ===========================================================================
// Module mocks — must appear BEFORE the import under test.
// ===========================================================================
mock.module("@/lib/server-config", () => ({
  getServerConfig: () => ({
    ollama: {
      host: "localhost",
      port: 11434,
      baseUrl: "http://localhost:11434",
      model: "qwen3.5:9b",
      embeddingModel: "bge-m3",
      thinkingMode: false,
      useCustomSampling: false,
      useJobsModel: mockUseJobsModel,
      jobModel: mockJobModel,
    },
    tts: {} as Record<string, unknown>,
    modelDefaults: {},
  }),
  // Stubs so the file imports cleanly; not used by the function under test.
  updateServerConfig: () => {},
  ResolvedServerConfig: class {},
  ModelSettings: class {},
  ModelDefaultsMap: {} as Record<string, unknown>,
  ServerConfigUpdate: {} as Record<string, unknown>,
}));

// Mock @/lib/ollama so importing it does not pull in the real DB-backed
// getUserModels / getDb. We re-export the real getActiveJobModel and a
// stub getUserModels that reads our mutable mock state.
const realOllama = await import("../ollama");
const stubGetUserModels = (_userId: string) => ({
  llmModel: mockChatModel,
  embeddingModel: "bge-m3",
});

mock.module("../ollama", () => ({
  ...realOllama,
  getUserModels: stubGetUserModels,
}));

// Import after mocks are registered.
const { getActiveJobModel } = await import("../ollama");

// ===========================================================================
// Tests
// ===========================================================================
describe("getActiveJobModel", () => {
  beforeEach(() => {
    mockUseJobsModel = false;
    mockJobModel = null;
    mockChatModel = "chat-model:7b";
  });

  it("exports the function", () => {
    expect(typeof getActiveJobModel).toBe("function");
  });

  it("returns the chat model when the jobs-model toggle is off", () => {
    mockUseJobsModel = false;
    mockJobModel = "should-be-ignored:1b";
    expect(getActiveJobModel("user-A")).toBe("chat-model:7b");
  });

  it("returns the configured job model when toggle is on and a model is set", () => {
    mockUseJobsModel = true;
    mockJobModel = "llama3.2:3b";
    expect(getActiveJobModel("user-B")).toBe("llama3.2:3b");
  });

  it("falls back to the chat model when toggle is on but no model is set", () => {
    mockUseJobsModel = true;
    mockJobModel = null;
    expect(getActiveJobModel("user-C")).toBe("chat-model:7b");
  });

  it("ignores the job model and uses chat when toggle flips off", () => {
    // User had it on, then turned it off — the stale jobModel should
    // not be returned.
    mockUseJobsModel = false;
    mockJobModel = "stale-llama3.2:3b";
    mockChatModel = "qwen3:32b";
    expect(getActiveJobModel("user-D")).toBe("qwen3:32b");
  });
});

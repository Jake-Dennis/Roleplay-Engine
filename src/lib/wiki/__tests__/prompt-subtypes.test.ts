import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { buildSubtypePromptSection, buildCompactSubtypeList } from "../prompt-subtypes";
import { getTypeRegistry, clearTypeRegistryCache } from "../type-registry";
import { writeWikiConfigV2 } from "../config-migration";
import { DEFAULT_TYPE_DEFS, DEFAULT_SUBTYPE_FOLDERS } from "../config-types";
import fs from "fs";
import path from "path";
import os from "os";

describe("prompt-subtypes", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-prompt-test-"));
    clearTypeRegistryCache();
  });

  afterEach(() => {
    clearTypeRegistryCache();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("buildSubtypePromptSection", () => {
    it("returns prompt with entity and concept subtypes", () => {
      const registry = getTypeRegistry(tmpDir);
      const prompt = buildSubtypePromptSection(registry);

      expect(prompt).toContain("For each entity, pick a subtype from: character, location, item, faction, organization, creature");
      expect(prompt).toContain("For each concept, pick a subtype from: theme, rule, mechanic, lore, event, tradition");
    });

    it("includes custom entity subtypes from registry", () => {
      const config = {
        version: 2,
        folderOrder: ["entities", "concepts"],
        types: {
          entity: { ...DEFAULT_TYPE_DEFS.entity, subtypes: ["character", "location", "companion"] },
          concept: DEFAULT_TYPE_DEFS.concept,
          source: DEFAULT_TYPE_DEFS.source,
          synthesis: DEFAULT_TYPE_DEFS.synthesis,
        },
        subtypeFolders: {
          ...DEFAULT_SUBTYPE_FOLDERS,
          companion: "entities/companions",
        },
      };
      writeWikiConfigV2(tmpDir, config);
      const registry = getTypeRegistry(tmpDir);

      const prompt = buildSubtypePromptSection(registry);
      expect(prompt).toContain("companion");
      expect(prompt).toContain("character, location, companion");
    });

    it("includes custom types with subtypes", () => {
      const config = {
        version: 2,
        folderOrder: ["entities", "concepts", "vehicles"],
        types: {
          entity: DEFAULT_TYPE_DEFS.entity,
          concept: DEFAULT_TYPE_DEFS.concept,
          source: DEFAULT_TYPE_DEFS.source,
          synthesis: DEFAULT_TYPE_DEFS.synthesis,
          vehicle: { icon: "truck", folder: "vehicles", subtypes: ["car", "spaceship"] },
        },
        subtypeFolders: {
          ...DEFAULT_SUBTYPE_FOLDERS,
          car: "vehicles/cars",
          spaceship: "vehicles/spaceships",
        },
      };
      writeWikiConfigV2(tmpDir, config);
      const registry = getTypeRegistry(tmpDir);

      const prompt = buildSubtypePromptSection(registry);
      expect(prompt).toContain("For each vehicle, pick a subtype from: car, spaceship");
    });

    it("handles empty subtypes gracefully", () => {
      const config = {
        version: 2,
        folderOrder: ["entities", "concepts"],
        types: {
          entity: { ...DEFAULT_TYPE_DEFS.entity, subtypes: [] },
          concept: { ...DEFAULT_TYPE_DEFS.concept, subtypes: [] },
          source: DEFAULT_TYPE_DEFS.source,
          synthesis: DEFAULT_TYPE_DEFS.synthesis,
        },
        subtypeFolders: {},
      };
      writeWikiConfigV2(tmpDir, config);
      const registry = getTypeRegistry(tmpDir);

      const prompt = buildSubtypePromptSection(registry);
      expect(prompt).toBe(""); // empty string when no subtypes
    });
  });

  describe("buildCompactSubtypeList", () => {
    it("returns compact format with type: subtypes", () => {
      const registry = getTypeRegistry(tmpDir);
      const compact = buildCompactSubtypeList(registry);

      expect(compact).toContain("entity: character, location, item, faction, organization, creature");
      expect(compact).toContain("concept: theme, rule, mechanic, lore, event, tradition");
    });

    it("includes custom types", () => {
      const config = {
        version: 2,
        folderOrder: ["entities", "concepts", "vehicles"],
        types: {
          entity: DEFAULT_TYPE_DEFS.entity,
          concept: DEFAULT_TYPE_DEFS.concept,
          source: DEFAULT_TYPE_DEFS.source,
          synthesis: DEFAULT_TYPE_DEFS.synthesis,
          vehicle: { icon: "truck", folder: "vehicles", subtypes: ["car", "spaceship"] },
        },
        subtypeFolders: {
          ...DEFAULT_SUBTYPE_FOLDERS,
          car: "vehicles/cars",
          spaceship: "vehicles/spaceships",
        },
      };
      writeWikiConfigV2(tmpDir, config);
      const registry = getTypeRegistry(tmpDir);

      const compact = buildCompactSubtypeList(registry);
      expect(compact).toContain("vehicle: car, spaceship");
    });
  });
});
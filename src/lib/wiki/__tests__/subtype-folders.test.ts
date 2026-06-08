import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { folderForSubtype, folderForType, folderForPage, subtypeFromFolder } from "../subtype-folders";
import { getTypeRegistry, clearTypeRegistryCache } from "../type-registry";
import { writeWikiConfigV2 } from "../config-migration";
import { DEFAULT_TYPE_DEFS, DEFAULT_SUBTYPE_FOLDERS, type WikiConfigV2 } from "../config-types";
import fs from "fs";
import path from "path";
import os from "os";

describe("subtype-folders", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-subtype-test-"));
    clearTypeRegistryCache();
  });

  afterEach(() => {
    clearTypeRegistryCache();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  const registry = () => getTypeRegistry(tmpDir);

  describe("folderForSubtype", () => {
    it("returns mapped folder for known subtype", () => {
      expect(folderForSubtype("character", registry())).toBe("entities/characters");
      expect(folderForSubtype("location", registry())).toBe("entities/locations");
      expect(folderForSubtype("item", registry())).toBe("entities/items");
      expect(folderForSubtype("event", registry())).toBe("concepts/events");
      expect(folderForSubtype("lore", registry())).toBe("concepts/lore");
    });

    it("falls back to derived folder for unmapped but known subtype", () => {
      // Add a subtype not in subtypeFolders map but in types
      const config: WikiConfigV2 = {
        version: 2,
        folderOrder: ["entities", "concepts"],
        types: {
          entity: { ...DEFAULT_TYPE_DEFS.entity, subtypes: ["character", "location", "vehicle"] },
          concept: DEFAULT_TYPE_DEFS.concept,
          source: DEFAULT_TYPE_DEFS.source,
          synthesis: DEFAULT_TYPE_DEFS.synthesis,
        },
        subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
      };
      writeWikiConfigV2(tmpDir, config);
      const reg = registry();

      // vehicle not in subtypeFolders but in entity.subtypes
      expect(folderForSubtype("vehicle", reg)).toBe("entities/vehicles");
    });

    it("falls back to fallbackFolder for unknown subtype", () => {
      expect(folderForSubtype("unknown", registry())).toBe("entities");
    });
  });

  describe("folderForType", () => {
    it("returns base folder for known types", () => {
      expect(folderForType("entity", registry())).toBe("entities");
      expect(folderForType("concept", registry())).toBe("concepts");
      expect(folderForType("source", registry())).toBe("sources");
      expect(folderForType("synthesis", registry())).toBe("synthesis");
    });

    it("returns fallback for unknown type", () => {
      expect(folderForType("unknown", registry())).toBe("entities");
    });
  });

  describe("folderForPage", () => {
    it("uses subtype when present", () => {
      const fm = { type: "entity", subtype: "character" };
      expect(folderForPage(fm, registry())).toBe("entities/characters");
    });

    it("uses type when no subtype", () => {
      const fm = { type: "concept", subtype: "" };
      expect(folderForPage(fm, registry())).toBe("concepts");
    });

    it("falls back when neither type nor subtype", () => {
      const fm = {};
      expect(folderForPage(fm, registry())).toBe("entities");
    });

    it("handles string subtype", () => {
      const fm = { type: "entity", subtype: "location" };
      expect(folderForPage(fm, registry())).toBe("entities/locations");
    });
  });

  describe("subtypeFromFolder", () => {
    it("returns subtype for exact folder match", () => {
      expect(subtypeFromFolder("entities/characters", registry())).toBe("character");
      expect(subtypeFromFolder("concepts/events", registry())).toBe("event");
    });

    it("handles trailing slash", () => {
      expect(subtypeFromFolder("entities/characters/", registry())).toBe("character");
    });

    it("returns null for unknown folder", () => {
      expect(subtypeFromFolder("entities/unknown", registry())).toBeNull();
      expect(subtypeFromFolder("concepts/unknown", registry())).toBeNull();
    });
  });
});
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getTypeRegistry, clearTypeRegistryCache, refreshTypeRegistry } from "../type-registry";
import { writeWikiConfigV2 } from "../config-migration";
import { DEFAULT_TYPE_DEFS, DEFAULT_SUBTYPE_FOLDERS, type WikiConfigV2 } from "../config-types";
import fs from "fs";
import path from "path";
import os from "os";

describe("type-registry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-registry-test-"));
    clearTypeRegistryCache();
  });

  afterEach(() => {
    clearTypeRegistryCache();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("getTypeRegistry", () => {
    it("returns normalized registry with types, subtypeFolders, fallbackFolder", () => {
      const registry = getTypeRegistry(tmpDir);

      expect(registry).toHaveProperty("types");
      expect(registry).toHaveProperty("subtypeFolders");
      expect(registry).toHaveProperty("fallbackFolder");
      expect(registry.types).toEqual(DEFAULT_TYPE_DEFS);
      expect(registry.subtypeFolders).toEqual(DEFAULT_SUBTYPE_FOLDERS);
      expect(registry.fallbackFolder).toBe("entities");
    });

    it("includes custom subtypes from config", () => {
      // Write a custom v2 config
      const config: WikiConfigV2 = {
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
      expect(registry.types.entity.subtypes).toContain("companion");
      expect(registry.subtypeFolders.companion).toBe("entities/companions");
    });

    it("returns defaults when config file does not exist", () => {
      const registry = getTypeRegistry(tmpDir);
      expect(registry.types).toEqual(DEFAULT_TYPE_DEFS);
    });

    it("caches per wikiRoot", () => {
      const registry1 = getTypeRegistry(tmpDir);
      const registry2 = getTypeRegistry(tmpDir);
      expect(registry1).toBe(registry2); // same reference due to cache
    });

    it("returns different registries for different wikiRoots", () => {
      const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-registry-test2-"));
      try {
        const registry1 = getTypeRegistry(tmpDir);
        const registry2 = getTypeRegistry(tmpDir2);
        expect(registry1).not.toBe(registry2);
      } finally {
        fs.rmSync(tmpDir2, { recursive: true, force: true });
      }
    });
  });

  describe("clearTypeRegistryCache", () => {
    it("clears cache for specific wikiRoot", () => {
      const registry1 = getTypeRegistry(tmpDir);
      clearTypeRegistryCache(tmpDir);
      const registry2 = getTypeRegistry(tmpDir);
      expect(registry1).not.toBe(registry2);
    });

    it("clears all cache when called without argument", () => {
      getTypeRegistry(tmpDir);
      const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-registry-test2-"));
      getTypeRegistry(tmpDir2);
      clearTypeRegistryCache();
      const registry1 = getTypeRegistry(tmpDir);
      const registry2 = getTypeRegistry(tmpDir2);
      fs.rmSync(tmpDir2, { recursive: true, force: true });
      // After clear, new calls should work
      expect(registry1).toBeDefined();
      expect(registry2).toBeDefined();
    });
  });

  describe("refreshTypeRegistry", () => {
    it("invalidates cache and re-reads config", () => {
      const registry1 = getTypeRegistry(tmpDir);

      // Write new config
      const config: WikiConfigV2 = {
        version: 2,
        folderOrder: ["entities", "concepts"],
        types: {
          entity: { ...DEFAULT_TYPE_DEFS.entity, subtypes: ["character", "new-subtype"] },
          concept: DEFAULT_TYPE_DEFS.concept,
          source: DEFAULT_TYPE_DEFS.source,
          synthesis: DEFAULT_TYPE_DEFS.synthesis,
        },
        subtypeFolders: {
          ...DEFAULT_SUBTYPE_FOLDERS,
          "new-subtype": "entities/new-subtype",
        },
      };
      writeWikiConfigV2(tmpDir, config);

      // Refresh should pick up new config
      const registry2 = refreshTypeRegistry(tmpDir);
      expect(registry2.types.entity.subtypes).toContain("new-subtype");
      expect(registry2.subtypeFolders["new-subtype"]).toBe("entities/new-subtype");
      expect(registry1).not.toBe(registry2);
    });
  });
});
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { migrateConfigV1toV2, readAndMigrateConfig, writeWikiConfigV2 } from "../config-migration";
import { DEFAULT_TYPE_DEFS, DEFAULT_SUBTYPE_FOLDERS, type WikiConfigV2 } from "../config-types";
import fs from "fs";
import path from "path";
import os from "os";

describe("config-migration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-config-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("migrateConfigV1toV2", () => {
    it("upgrades v1 config (only folderOrder) to v2 with defaults", () => {
      const v1Config = { folderOrder: ["entities", "concepts", "custom"] };
      const v2 = migrateConfigV1toV2(v1Config);

      expect(v2.version).toBe(2);
      expect(v2.folderOrder).toEqual(["entities", "concepts", "custom"]);
      expect(v2.types).toEqual(DEFAULT_TYPE_DEFS);
      expect(v2.subtypeFolders).toEqual(DEFAULT_SUBTYPE_FOLDERS);
    });

    it("returns v2 config unchanged (idempotent)", () => {
      const v2Config: WikiConfigV2 = {
        version: 2 as const,
        folderOrder: ["entities", "concepts"],
        types: DEFAULT_TYPE_DEFS,
        subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
      };
      const result = migrateConfigV1toV2(v2Config);
      expect(result).toBe(v2Config); // same reference
    });

    it("handles missing folderOrder gracefully", () => {
      const v1Config: Record<string, unknown> = {};
      const v2 = migrateConfigV1toV2(v1Config as any);
      expect(v2.version).toBe(2);
      expect(v2.folderOrder).toEqual([]);
      expect(v2.types).toEqual(DEFAULT_TYPE_DEFS);
      expect(v2.subtypeFolders).toEqual(DEFAULT_SUBTYPE_FOLDERS);
    });

    it("preserves custom folderOrder from v1", () => {
      const v1Config = { folderOrder: ["my-custom", "entities", "concepts"] };
      const v2 = migrateConfigV1toV2(v1Config);
      expect(v2.folderOrder).toEqual(["my-custom", "entities", "concepts"]);
    });
  });

  describe("readAndMigrateConfig", () => {
    it("returns defaults when config file does not exist", () => {
      const v2 = readAndMigrateConfig(tmpDir);
      expect(v2.version).toBe(2);
      expect(v2.types).toEqual(DEFAULT_TYPE_DEFS);
      expect(v2.subtypeFolders).toEqual(DEFAULT_SUBTYPE_FOLDERS);
    });

    it("migrates v1 config file to v2 and persists", () => {
      const configPath = path.join(tmpDir, ".wiki-config.json");
      fs.writeFileSync(configPath, JSON.stringify({ folderOrder: ["entities", "concepts"] }), "utf-8");

      const v2 = readAndMigrateConfig(tmpDir);
      expect(v2.version).toBe(2);
      expect(v2.folderOrder).toEqual(["entities", "concepts"]);

      // Verify it was persisted
      const persisted = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(persisted.version).toBe(2);
      expect(persisted.types).toEqual(DEFAULT_TYPE_DEFS);
    });

    it("does not re-migrate if already v2", () => {
      const configPath = path.join(tmpDir, ".wiki-config.json");
      const v2Config = {
        version: 2,
        folderOrder: ["entities", "concepts"],
        types: DEFAULT_TYPE_DEFS,
        subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
      };
      fs.writeFileSync(configPath, JSON.stringify(v2Config), "utf-8");

      const v2 = readAndMigrateConfig(tmpDir);
      expect(v2.version).toBe(2);
    });

    it("handles malformed JSON gracefully", () => {
      const configPath = path.join(tmpDir, ".wiki-config.json");
      fs.writeFileSync(configPath, "{ not valid json }", "utf-8");

      const v2 = readAndMigrateConfig(tmpDir);
      expect(v2.version).toBe(2);
      expect(v2.types).toEqual(DEFAULT_TYPE_DEFS);
    });
  });

  describe("writeWikiConfigV2", () => {
    it("creates config file atomically", () => {
      const configPath = path.join(tmpDir, ".wiki-config.json");
      const config: WikiConfigV2 = {
        version: 2,
        folderOrder: ["entities", "concepts"],
        types: DEFAULT_TYPE_DEFS,
        subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
      };
      writeWikiConfigV2(tmpDir, config);

      expect(fs.existsSync(configPath)).toBe(true);
      const persisted = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(persisted.version).toBe(2);
      expect(persisted.folderOrder).toEqual(["entities", "concepts"]);
    });

    it("creates directory if missing", () => {
      const newDir = path.join(tmpDir, "new-wiki");
      const config: WikiConfigV2 = {
        version: 2,
        folderOrder: [],
        types: DEFAULT_TYPE_DEFS,
        subtypeFolders: DEFAULT_SUBTYPE_FOLDERS,
      };
      writeWikiConfigV2(newDir, config);

      expect(fs.existsSync(path.join(newDir, ".wiki-config.json"))).toBe(true);
    });
  });
});
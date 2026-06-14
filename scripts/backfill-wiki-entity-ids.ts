/**
 * Backfill Missing entity_id on Wiki Pages
 *
 * Scans all wiki .md files and assigns entity_registry entries to any
 * page that's missing an entity_id in its frontmatter.
 *
 * Folder → entity type mapping:
 *   characters/ → npc (default; users can change via wiki editor)
 *   locations/  → location
 *   items/      → item
 *   factions/   → faction
 *
 * Usage: npx tsx scripts/backfill-wiki-entity-ids.ts
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const dbPath = path.join(DATA_DIR, "global.db");

const FOLDER_TYPE: Record<string, string> = {
  characters: "npc",
  locations: "location",
  items: "item",
  factions: "faction",
  events: "event",
};

function main() {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  console.log("=== Backfill: Wiki entity_id ===");

  let total = 0;
  let updated = 0;

  // Scan all wiki directories
  const userDirs = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^[0-9a-f-]+$/.test(d.name));

  for (const userDir of userDirs) {
    const userId = userDir.name;
    const wikiBase = path.join(DATA_DIR, userId, "wiki");

    if (!fs.existsSync(wikiBase)) continue;

    const universeDirs = fs.readdirSync(wikiBase, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const universeDir of universeDirs) {
      const universeId = universeDir.name;
      const entitiesDir = path.join(wikiBase, universeId, "entities");

      if (!fs.existsSync(entitiesDir)) continue;

      function processFiles(dirPath: string, entityType: string, label: string): void {
        if (!fs.existsSync(dirPath)) return;
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith(".md"));
        for (const file of files) {
          total++;
          const filePath = path.join(dirPath, file);
          let content = fs.readFileSync(filePath, "utf-8");

          if (/entity_id:\s*/.test(content)) continue;

          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (!fmMatch) continue;

          const fmBlock = fmMatch[1];
          const titleMatch = fmBlock.match(/^title:\s*"?([^"\n]+)"?$/m);
          const title = titleMatch ? titleMatch[1].trim() : file.replace(".md", "");

          const entityId = `${entityType}:${crypto.randomUUID()}`;
          try {
            db.prepare(
              "INSERT OR IGNORE INTO entity_registry (id, entity_type, display_name, user_id, universe_id) VALUES (?, ?, ?, ?, ?)"
            ).run(entityId, entityType, title, userId, universeId);
          } catch (err) {
            console.warn(`  Failed to register ${title} (${entityId}): ${err}`);
            continue;
          }

          const newFmBlock = fmBlock + `\nentity_id: "${entityId}"`;
          content = content.replace(fmMatch[0], `---\n${newFmBlock}\n---`);
          fs.writeFileSync(filePath, content, "utf-8");
          updated++;
          console.log(`  ${label}/${file} → ${entityId}`);
        }
      }

      // Scan entities/ subfolders (characters, locations, items, factions)
      for (const [folder, entityType] of Object.entries(FOLDER_TYPE)) {
        processFiles(path.join(entitiesDir, folder), entityType, folder);
      }

      // Scan concepts/events/ for event pages
      const conceptsDir = path.join(wikiBase, universeId, "concepts");
      processFiles(path.join(conceptsDir, "events"), "event", "events/concepts");
    }
  }

  db.close();
  console.log(`\nDone: ${updated}/${total} wiki pages updated with entity_id`);
}

main();

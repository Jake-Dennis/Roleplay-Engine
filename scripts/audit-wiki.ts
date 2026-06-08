/**
 * Full Wiki Audit Script
 *
 * Scans all user/universe wiki roots and reports on:
 *  1. Page inventory per universe
 *  2. Frontmatter completeness (title, type, status, subtype)
 *  3. Folder correctness (type folder vs frontmatter type)
 *  4. Subtype folder correctness
 *  5. Bad status values
 *  6. Wiki config health
 *  7. Merge candidates (same title in same universe)
 *  8. Superseded_by chain health
 *  9. Orphan pages (no inbound wikilinks)
 * 10. Cross-universe wikilink reporting
 * 11. Page size statistics (total, average, largest, smallest)
 * 12. Tag-based subtype inference
 * 13. --fix mode for auto-resolving common issues
 *
 * Usage:
 *   npx tsx scripts/audit-wiki.ts              # Full audit (read-only)
 *   npx tsx scripts/audit-wiki.ts --fix        # Auto-resolve issues
 *   npx tsx scripts/audit-wiki.ts --fix --dry-run  # Preview fixes only
 *   npx tsx scripts/audit-wiki.ts --help       # Show usage
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(__dirname, "..", "data");

// ── Argument parsing ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const FLAG_FIX = args.includes("--fix");
const FLAG_DRY_RUN = args.includes("--dry-run");
const FLAG_HELP = args.includes("--help");

if (FLAG_HELP) {
  console.log(`
  Wiki Audit Script — scans all wiki roots and reports health.

  Usage:
    npx tsx scripts/audit-wiki.ts              # Read-only audit
    npx tsx scripts/audit-wiki.ts --fix        # Auto-resolve issues
    npx tsx scripts/audit-wiki.ts --fix --dry-run  # Preview fixes

  Options:
    --fix       Auto-resolve TYPE_MISMATCH, NO_FRONTMATTER, and
                MISSING_WIKI_CONFIG issues
    --dry-run   Show what --fix would change without writing (implies --fix)
    --help      Show this help message
`);
  process.exit(0);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Parse YAML frontmatter from a wiki markdown file (simple parser, no deps). */
function parseFrontmatter(filePath: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    if (!content.startsWith("---")) return null;
    const end = content.indexOf("---", 3);
    if (end === -1) return null;
    const yaml = content.slice(3, end);
    const fm: Record<string, unknown> = {};
    for (const line of yaml.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^(\w+):\s*(.*)$/);
      if (!match) continue;
      let val: unknown = match[2].trim();
      // Remove surrounding quotes
      if (typeof val === "string" && val.startsWith('"') && val.endsWith('"'))
        val = val.slice(1, -1);
      if (typeof val === "string" && val.startsWith("'") && val.endsWith("'"))
        val = val.slice(1, -1);
      // Parse YAML lists like [a, b, c]
      if (typeof val === "string" && val.startsWith("[") && val.endsWith("]")) {
        val = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter((s) => s.length > 0);
      }
      fm[match[1]] = val;
    }
    return fm;
  } catch {
    return null;
  }
}

/**
 * Serialize frontmatter back to YAML string (simple serializer, no deps).
 * Matches the key ordering convention used in the project.
 */
function serializeFrontmatter(fm: Record<string, unknown>): string {
  const lines: string[] = [];
  // Order keys conventionally
  const order = ["title", "type", "status", "subtype", "universe", "tags", "created", "updated"];
  const seen = new Set<string>();
  for (const key of order) {
    if (key in fm) {
      lines.push(`${key}: ${formatYamlValue(fm[key])}`);
      seen.add(key);
    }
  }
  for (const [key, val] of Object.entries(fm)) {
    if (!seen.has(key)) {
      lines.push(`${key}: ${formatYamlValue(val)}`);
    }
  }
  return lines.join("\n") + "\n";
}

function formatYamlValue(val: unknown): string {
  if (Array.isArray(val)) {
    return "[" + val.map((v) => `"${String(v)}"`).join(", ") + "]";
  }
  if (typeof val === "string") {
    // Quote if it contains special chars
    if (val.includes(":") || val.includes("#") || val.includes("[") || val.includes("{")) {
      return `"${val}"`;
    }
    return val;
  }
  return String(val);
}

/**
 * Normalize type names to a canonical form so that singular/plural pairs match.
 * E.g. "concept" and "concepts" both normalize to "concepts".
 */
const TYPE_ALIASES: Record<string, string> = {
  concept: "concepts",
  concepts: "concepts",
  entity: "entities",
  entities: "entities",
  event: "events",
  events: "events",
  location: "locations",
  locations: "locations",
  character: "characters",
  characters: "characters",
  item: "items",
  items: "items",
  lore: "lores",
  lores: "lores",
};

/** Inverse mapping: plural folder name -> singular type name */
const FOLDER_TO_TYPE: Record<string, string> = {
  concepts: "concept",
  entities: "entity",
  events: "event",
  locations: "location",
  characters: "character",
  items: "item",
  lores: "lore",
  sources: "source",
  synthesis: "synthesis",
};

function normalizeType(t: string): string {
  return TYPE_ALIASES[t] ?? t;
}

function folderToType(folder: string): string {
  return FOLDER_TO_TYPE[folder] ?? folder;
}

/** Simple pluralization for subtype folder names. */
function pluralizeSubtype(subtype: string): string {
  const special: Record<string, string> = {
    lore: "lore",
    synthesis: "synthesis",
    mechanics: "mechanics",
  };
  if (special[subtype]) return special[subtype];
  if (subtype.endsWith("y"))
    return subtype.slice(0, -1) + "ies";
  if (subtype.endsWith("s"))
    return subtype + "es";
  return subtype + "s";
}

/** Known type tags that can imply a frontmatter subtype. */
const TAG_TO_SUBTYPE: Record<string, string> = {
  location: "location",
  event: "event",
  concept: "concept",
  entity: "entity",
  character: "character",
  item: "item",
  lore: "lore",
};

interface WikiPage {
  path: string;
  relPath: string;
  fileName: string;
  parts: string[];
  depth: number;
  typeFolder: string;
  subtypeFolder: string | null;
  isTwoLevel: boolean;
  frontmatter: Record<string, unknown> | null;
  size: number;
  content: string;
}

interface AuditIssue {
  universeId: string;
  severity: "error" | "warn" | "info";
  category: string;
  message: string;
}

interface UniverseAudit {
  universeId: string;
  hasConfig: boolean;
  pages: WikiPage[];
  pageCount: number;
  issues: AuditIssue[];
}

interface UserAudit {
  userId: string;
  universes: UniverseAudit[];
}

// ── Fix tracking ────────────────────────────────────────────────────────────

interface FixAction {
  description: string;
  apply: () => void;
}

const fixActions: FixAction[] = [];

function recordFix(description: string, apply: () => void): void {
  fixActions.push({ description, apply });
}

function applyFixes(): void {
  if (fixActions.length === 0) {
    console.log("  No fixes to apply.");
    return;
  }
  if (FLAG_DRY_RUN) {
    console.log();
    console.log(`  [DRY RUN] Would apply ${fixActions.length} fix(es):`);
    for (const action of fixActions) {
      console.log(`    - ${action.description}`);
    }
    console.log();
    console.log("  (Run without --dry-run to apply these changes)");
  } else {
    console.log();
    console.log(`  Applying ${fixActions.length} fix(es)...`);
    for (const action of fixActions) {
      action.apply();
    }
    console.log("  Done.");
  }
}

// ── Default wiki config template ────────────────────────────────────────────

function createDefaultWikiConfig(): Record<string, unknown> {
  return {
    version: 2,
    folderOrder: ["entities", "concepts", "sources", "synthesis", "_review"],
    types: {
      entity: {
        icon: "user",
        folder: "entities",
        subtypes: ["character", "location", "item", "faction", "organization", "creature"],
      },
      concept: {
        icon: "book-open",
        folder: "concepts",
        subtypes: ["theme", "rule", "mechanic", "lore", "event", "tradition"],
      },
      source: {
        icon: "file-text",
        folder: "sources",
        subtypes: [],
      },
      synthesis: {
        icon: "sparkles",
        folder: "synthesis",
        subtypes: [],
      },
    },
    subtypeFolders: {
      character: "entities/characters",
      location: "entities/locations",
      item: "entities/items",
      faction: "entities/factions",
      organization: "entities/organizations",
      creature: "entities/creatures",
      theme: "concepts/themes",
      rule: "concepts/rules",
      mechanic: "concepts/mechanics",
      lore: "concepts/lore",
      event: "concepts/events",
      tradition: "concepts/traditions",
    },
  };
}

// ── Scan ───────────────────────────────────────────────────────────────────

const users: UserAudit[] = [];

// Track cross-universe link data across all universes
interface CrossUniverseLink {
  sourcePage: string;
  targetUniverse: string;
  targetPage: string;
}
const allCrossUniverseLinks: CrossUniverseLink[] = [];

const userDirs = fs
  .readdirSync(DATA_DIR, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      !d.name.startsWith("_backup") &&
      fs.existsSync(path.join(DATA_DIR, d.name, "wiki"))
  );

for (const userDir of userDirs) {
  const userId = userDir.name;
  const wikiBase = path.join(DATA_DIR, userId, "wiki");
  const userAudit: UserAudit = { userId, universes: [] };

  const universeDirs = fs
    .readdirSync(wikiBase, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."));

  for (const uniDir of universeDirs) {
    const universeId = uniDir.name;
    const uniPath = path.join(wikiBase, universeId);
    const hasConfig = fs.existsSync(path.join(uniPath, ".wiki-config.json"));
    const pages: WikiPage[] = [];
    const issues: AuditIssue[] = [];

    const addIssue = (
      severity: "error" | "warn" | "info",
      category: string,
      message: string
    ) => {
      issues.push({ universeId, severity, category, message });
    };

    // Collect all .md files recursively
    function collectMd(dir: string, baseDir: string): void {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          collectMd(fullPath, baseDir);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          if (entry.name === "index.md" || entry.name === "log.md") continue;

          const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
          const parts = relPath.split("/");
          const depth = parts.length;
          const typeFolder = parts[0];
          const subtypeFolder = depth >= 3 ? parts[1] : null;
          const fileName = parts[parts.length - 1];
          const isTwoLevel = depth >= 3;
          const content = fs.readFileSync(fullPath, "utf-8");
          const fm = parseFrontmatter(fullPath);

          pages.push({
            path: fullPath,
            relPath,
            fileName,
            parts,
            depth,
            typeFolder,
            subtypeFolder,
            isTwoLevel,
            frontmatter: fm,
            size: fs.statSync(fullPath).size,
            content,
          });
        }
      }
    }

    collectMd(uniPath, uniPath);

    // ── Cross-universe wikilink scan ─────────────────────────────────────
    for (const p of pages) {
      // Match [[SomeUniverse::PageName]] or [[SomeUniverse::Page Name|alias]]
      const xLinkRegex = /\[\[([^\[\]]+?)::([^\[\]|]+)(?:\|[^\[\]]+)?\]\]/g;
      let match: RegExpExecArray | null;
      while ((match = xLinkRegex.exec(p.content)) !== null) {
        const targetUniverse = match[1].trim();
        const targetPage = match[2].trim();
        allCrossUniverseLinks.push({
          sourcePage: `${universeId}:${p.relPath}`,
          targetUniverse,
          targetPage,
        });
      }
    }

    // ── Checks ──────────────────────────────────────────────────────────

    // 1. Wiki config check
    if (!hasConfig) {
      addIssue("warn", "config", "Missing .wiki-config.json");
    }

    // 2. Per-page checks
    for (const p of pages) {
      const fm = p.frontmatter;

      if (!fm) {
        addIssue("error", "frontmatter", `NO_FRONTMATTER: ${p.relPath}`);

        // --fix: add minimal frontmatter
        if (FLAG_FIX) {
          const inferredType = folderToType(p.typeFolder);
          recordFix(
            `Add minimal frontmatter to ${p.relPath} (type: ${inferredType})`,
            () => {
              const newFm = `---\ntype: ${inferredType}\n---\n`;
              const content = fs.readFileSync(p.path, "utf-8");
              fs.writeFileSync(p.path, newFm + content, "utf-8");
            }
          );
        }
        continue;
      }

      const title = String(fm.title ?? "");
      const type = String(fm.type ?? "");
      const status = String(fm.status ?? "");
      const subtype = String(fm.subtype ?? "");

      // Title
      if (!title || title.trim() === "") {
        addIssue("error", "frontmatter", `MISSING_TITLE: ${p.relPath}`);
      }

      // Type
      if (!type || type.trim() === "") {
        addIssue("error", "frontmatter", `MISSING_TYPE: ${p.relPath}`);
      } else if (
        normalizeType(type) !== normalizeType(p.typeFolder) &&
        !/^[a-f0-9\-]{36}$/.test(p.typeFolder)
      ) {
        // Skip UUID-named folders (sub-universes)
        addIssue(
          "warn",
          "folder",
          `TYPE_MISMATCH: ${p.relPath} — frontmatter type is "${type}" but folder is "${p.typeFolder}"`
        );

        // --fix: update frontmatter type to match folder
        if (FLAG_FIX) {
          const correctType = folderToType(p.typeFolder);
          recordFix(
            `Fix TYPE_MISMATCH in ${p.relPath}: change type from "${fm.type}" to "${correctType}"`,
            () => {
              const content = fs.readFileSync(p.path, "utf-8");
              const end = content.indexOf("---", 3);
              const before = content.slice(0, end);
              const after = content.slice(end);
              // Replace the type line in frontmatter
              const updated = before.replace(
                /^type:\s*.+$/m,
                `type: ${correctType}`
              );
              fs.writeFileSync(p.path, updated + after, "utf-8");
            }
          );
        }
      }

      // Status
      const validStatuses = [
        "draft",
        "reviewed",
        "locked",
        "rejected",
        "dormant",
      ];
      if (!status || status.trim() === "") {
        addIssue("error", "frontmatter", `MISSING_STATUS: ${p.relPath}`);
      } else if (!validStatuses.includes(status)) {
        addIssue(
          "error",
          "frontmatter",
          `BAD_STATUS: ${p.relPath} — status "${status}" is not valid`
        );
      }

      // Subtype
      if (p.isTwoLevel && p.subtypeFolder) {
        // Page is in a subtype subfolder — should have subtype in frontmatter
        if (!subtype || subtype.trim() === "") {
          addIssue(
            "warn",
            "frontmatter",
            `MISSING_SUBTYPE: ${p.relPath} — in folder "${p.subtypeFolder}" but no subtype in frontmatter`
          );
        } else {
          // Check it's in the right subtype folder
          const expectedFolder = pluralizeSubtype(subtype);
          if (p.subtypeFolder !== expectedFolder) {
            addIssue(
              "warn",
              "folder",
              `WRONG_SUBTYPE_FOLDER: ${p.relPath} — subtype "${subtype}" expects folder "${expectedFolder}" but is in "${p.subtypeFolder}"`
            );
          }
        }
      }

      // ── Tag-based subtype inference ────────────────────────────────────
      if (fm && fm.tags && Array.isArray(fm.tags) && (!subtype || subtype.trim() === "")) {
        const tags = fm.tags as string[];
        for (const tag of tags) {
          const inferredSubtype = TAG_TO_SUBTYPE[tag];
          if (inferredSubtype) {
            addIssue(
              "info",
              "subtype-inference",
              `INFERRED_SUBTYPE: ${p.relPath} — tag "${tag}" suggests subtype "${inferredSubtype}"`
            );

            // --fix: add the inferred subtype
            if (FLAG_FIX) {
              recordFix(
                `Add subtype "${inferredSubtype}" to ${p.relPath} (inferred from tag "${tag}")`,
                () => {
                  const content = fs.readFileSync(p.path, "utf-8");
                  const end = content.indexOf("---", 3);
                  const before = content.slice(0, end);
                  const after = content.slice(end);
                  // Add subtype line before the closing ---
                  const updated = before.replace(/---\s*$/, `subtype: ${inferredSubtype}\n---`);
                  fs.writeFileSync(p.path, updated + after, "utf-8");
                }
              );
            }
            break; // Only infer one subtype per page
          }
        }
      }
    }

    // 3. Merge candidates (same title in same universe)
    const titleMap = new Map<string, string[]>();
    for (const p of pages) {
      const fm = p.frontmatter;
      if (fm && fm.title) {
        const key = String(fm.title ?? "").toLowerCase().trim();
        if (!titleMap.has(key)) titleMap.set(key, []);
        titleMap.get(key)!.push(p.relPath);
      }
    }
    for (const [title, paths] of titleMap) {
      if (paths.length > 1) {
        addIssue(
          "warn",
          "merge",
          `MERGE_CANDIDATE: "${title}" appears in ${paths.length} pages: ${paths.join(", ")}`
        );
      }
    }

    // 4. Orphan pages (no inbound wikilinks from other pages)
    for (const p of pages) {
      if (p.fileName === "index.md") continue;
      const pageName = p.fileName.replace(/\.md$/, "");
      const title = String(p.frontmatter?.title ?? pageName);

      // Skip about.md (expected orphan for sub-universes)
      if (pageName === "about") continue;
      // Skip event pages (event_ prefix — auto-generated, expected to be standalone)
      if (pageName.startsWith("event_")) continue;

      let linked = false;
      for (const other of pages) {
        if (other.path === p.path) continue;
        if (
          other.content.includes(`[[${pageName}`) ||
          other.content.includes(`[[${title}`)
        ) {
          linked = true;
          break;
        }
      }
      if (!linked) {
        addIssue(
          "info",
          "orphan",
          `ORPHAN: ${p.relPath} — no inbound wikilinks`
        );
      }
    }

    // 5. Superseded_by chain health
    for (const p of pages) {
      const fm = p.frontmatter;
      if (fm && fm.superseded_by && typeof fm.superseded_by === "string") {
        const target = fm.superseded_by as string;
        const targetExists = pages.some(
          (other) =>
            other.relPath === target ||
            other.relPath === target.replace(/^\.\//, "")
        );
        if (!targetExists) {
          addIssue(
            "error",
            "superseded",
            `BROKEN_SUPERSEDED_BY: ${p.relPath} — points to "${target}" which doesn't exist`
          );
        }
        if (fm.status !== "dormant") {
          addIssue(
            "warn",
            "superseded",
            `SUPERSEDED_NOT_DORMANT: ${p.relPath} — has superseded_by but status is "${fm.status}"`
          );
        }
      }
    }

    // 6. Pages directly in wiki root (not in a type folder)
    for (const p of pages) {
      if (p.depth === 1 && p.fileName.endsWith(".md")) {
        addIssue(
          "info",
          "structure",
          `ROOT_LEVEL_PAGE: ${p.relPath} — page is directly in wiki root, not in a type folder`
        );
      }
    }

    // 7. Wiki config fix
    if (!hasConfig && FLAG_FIX) {
      recordFix(
        `Create .wiki-config.json in universe "${universeId}"`,
        () => {
          const configPath = path.join(uniPath, ".wiki-config.json");
          fs.writeFileSync(
            configPath,
            JSON.stringify(createDefaultWikiConfig(), null, 2) + "\n",
            "utf-8"
          );
        }
      );
    }

    // ── Page size statistics ─────────────────────────────────────────────
    if (pages.length > 0) {
      const sizes = pages.map((p) => p.size);
      const totalSize = sizes.reduce((a, b) => a + b, 0);
      const avgSize = Math.round(totalSize / sizes.length);
      const maxSize = Math.max(...sizes);
      const minSize = Math.min(...sizes);
      const largestPage = pages.find((p) => p.size === maxSize);
      const smallestPage = pages.find((p) => p.size === minSize);

      addIssue(
        "info",
        "size-stats",
        `TOTAL_SIZE: ${formatBytes(totalSize)} (${sizes.length} pages)`
      );
      addIssue(
        "info",
        "size-stats",
        `AVG_SIZE: ${formatBytes(avgSize)}`
      );
      if (largestPage) {
        addIssue(
          "info",
          "size-stats",
          `LARGEST_PAGE: ${largestPage.relPath} (${formatBytes(maxSize)})`
        );
      }
      if (smallestPage) {
        addIssue(
          "info",
          "size-stats",
          `SMALLEST_PAGE: ${smallestPage.relPath} (${formatBytes(minSize)})`
        );
      }
    }

    userAudit.universes.push({
      universeId,
      hasConfig,
      pages,
      pageCount: pages.length,
      issues,
    });
  }

  users.push(userAudit);
}

// ── Apply fixes (if --fix was specified) ────────────────────────────────────

if (FLAG_FIX) {
  applyFixes();
}

// ── Report ─────────────────────────────────────────────────────────────────

const totalPages = users.reduce(
  (sum, u) => sum + u.universes.reduce((s, uni) => s + uni.pageCount, 0),
  0
);
const totalIssues = users.reduce(
  (sum, u) => sum + u.universes.reduce((s, uni) => s + uni.issues.length, 0),
  0
);
const totalUsers = users.length;
const totalUniverses = users.reduce(
  (sum, u) => sum + u.universes.length,
  0
);

console.log("=".repeat(80));
console.log("  WIKI AUDIT REPORT —", new Date().toISOString().slice(0, 19));
if (FLAG_FIX) {
  console.log(`  Mode:       ${FLAG_DRY_RUN ? "DRY RUN (preview only)" : "FIX (applying changes)"}`);
}
console.log("=".repeat(80));
console.log();
console.log(`  Users:      ${totalUsers}`);
console.log(`  Universes:  ${totalUniverses}`);
console.log(`  Pages:      ${totalPages}`);
console.log(`  Issues:     ${totalIssues}`);
console.log();

for (const user of users) {
  console.log("-".repeat(80));
  console.log(`  USER: ${user.userId}`);
  console.log("-".repeat(80));

  for (const uni of user.universes) {
    console.log();
    console.log(`  Universe: ${uni.universeId}`);
    console.log(`  Config:   ${uni.hasConfig ? "OK" : "MISSING"}`);
    console.log(`  Pages:    ${uni.pageCount}`);
    console.log(`  Issues:   ${uni.issues.length}`);

    // ── Page size statistics in universe summary ─────────────────────────
    if (uni.pages.length > 0) {
      const sizes = uni.pages.map((p) => p.size);
      const totalSize = sizes.reduce((a, b) => a + b, 0);
      const avgSize = Math.round(totalSize / sizes.length);
      console.log(`  Total size:  ${formatBytes(totalSize)}`);
      console.log(`  Avg size:    ${formatBytes(avgSize)}`);
      const maxSize = Math.max(...sizes);
      const minSize = Math.min(...sizes);
      const largestPage = uni.pages.find((p) => p.size === maxSize);
      const smallestPage = uni.pages.find((p) => p.size === minSize);
      if (largestPage) console.log(`  Largest:     ${formatBytes(maxSize)} — ${largestPage.relPath}`);
      if (smallestPage) console.log(`  Smallest:    ${formatBytes(minSize)} — ${smallestPage.relPath}`);
    }

    if (uni.pageCount > 0) {
      console.log();
      console.log("  Pages:");
      for (const p of uni.pages) {
        const status = (p.frontmatter?.status as string) ?? "?";
        const title = (p.frontmatter?.title as string) ?? "?";
        const icon =
          status === "dormant"
            ? "Z"
            : status === "reviewed"
              ? "R"
              : status === "locked"
                ? "L"
                : status === "rejected"
                  ? "X"
                  : "D";
        console.log(`    [${icon}] ${p.relPath}`);
      }
    }

    if (uni.issues.length > 0) {
      console.log();
      console.log("  Issues:");
      // Group by category
      const grouped: Record<string, AuditIssue[]> = {};
      for (const issue of uni.issues) {
        if (!grouped[issue.category]) grouped[issue.category] = [];
        grouped[issue.category].push(issue);
      }
      for (const [cat, catIssues] of Object.entries(grouped)) {
        console.log(`    ${cat.toUpperCase()}:`);
        for (const issue of catIssues) {
          const sev = issue.severity === "error" ? "!" : issue.severity === "warn" ? "~" : "i";
          console.log(`      [${sev}] ${issue.message}`);
        }
      }
    }
    console.log();
  }
}

// ── Cross-universe wikilink summary ─────────────────────────────────────────

if (allCrossUniverseLinks.length > 0) {
  console.log("-".repeat(80));
  console.log("  CROSS-UNIVERSE WIKILINKS");
  console.log("-".repeat(80));
  console.log();
  console.log(`  Total cross-universe links: ${allCrossUniverseLinks.length}`);
  console.log();

  // Per-target-universe counts
  const perUniverse = new Map<string, number>();
  for (const link of allCrossUniverseLinks) {
    perUniverse.set(link.targetUniverse, (perUniverse.get(link.targetUniverse) ?? 0) + 1);
  }
  console.log("  Links per target universe:");
  for (const [uniName, count] of [...perUniverse.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${uniName}: ${count}`);
  }
  console.log();

  // Per-target-page breakdown (show top 10)
  console.log("  Source pages with cross-universe links:");
  const perSource = new Map<string, number>();
  for (const link of allCrossUniverseLinks) {
    perSource.set(link.sourcePage, (perSource.get(link.sourcePage) ?? 0) + 1);
  }
  const sortedSources = [...perSource.entries()].sort((a, b) => b[1] - a[1]);
  const topSources = sortedSources.slice(0, 10);
  for (const [src, count] of topSources) {
    console.log(`    ${formatLinkSource(src)}: ${count} link(s)`);
  }
  if (sortedSources.length > 10) {
    console.log(`    ... and ${sortedSources.length - 10} more source pages`);
  }
  console.log();
}

// ── Global size summary ────────────────────────────────────────────────────

const allPagesFlat = users.flatMap((u) => u.universes.flatMap((uni) => uni.pages));
if (allPagesFlat.length > 0) {
  const allSizes = allPagesFlat.map((p) => p.size);
  const grandTotalSize = allSizes.reduce((a, b) => a + b, 0);
  const grandAvgSize = Math.round(grandTotalSize / allSizes.length);
  const grandMaxSize = Math.max(...allSizes);
  const grandMinSize = Math.min(...allSizes);
  const largestGlobalPage = allPagesFlat.find((p) => p.size === grandMaxSize);
  const smallestGlobalPage = allPagesFlat.find((p) => p.size === grandMinSize);

  console.log("=".repeat(80));
  console.log("  GLOBAL SIZE STATISTICS");
  console.log("=".repeat(80));
  console.log();
  console.log(`  Total wiki data:   ${formatBytes(grandTotalSize)}`);
  console.log(`  Average page size: ${formatBytes(grandAvgSize)}`);
  if (largestGlobalPage) {
    console.log(`  Largest page:      ${formatBytes(grandMaxSize)} — ${largestGlobalPage.relPath}`);
  }
  if (smallestGlobalPage) {
    console.log(`  Smallest page:     ${formatBytes(grandMinSize)} — ${smallestGlobalPage.relPath}`);
  }
  console.log();
}

console.log("=".repeat(80));
console.log("  AUDIT COMPLETE");
console.log("=".repeat(80));

// ── Utilities ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLinkSource(source: string): string {
  // source is formatted as "universeId:path"
  const colonIdx = source.indexOf(":");
  if (colonIdx === -1) return source;
  const universe = source.slice(0, colonIdx);
  const pagePath = source.slice(colonIdx + 1);
  // Truncate long universe IDs
  const shortUni = universe.length > 8 ? universe.slice(0, 8) + "…" : universe;
  return `${shortUni}::${pagePath}`;
}

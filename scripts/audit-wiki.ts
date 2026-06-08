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
 *
 * Usage: npx tsx scripts/audit-wiki.ts
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(__dirname, "..", "data");

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

// ── Scan ───────────────────────────────────────────────────────────────────

const users: UserAudit[] = [];

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
        type !== p.typeFolder &&
        !/^[a-f0-9\-]{36}$/.test(p.typeFolder)
      ) {
        // Skip UUID-named folders (sub-universes)
        addIssue(
          "warn",
          "folder",
          `TYPE_MISMATCH: ${p.relPath} — frontmatter type is "${type}" but folder is "${p.typeFolder}"`
        );
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
      // Group by severity
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

console.log("=".repeat(80));
console.log("  AUDIT COMPLETE");
console.log("=".repeat(80));

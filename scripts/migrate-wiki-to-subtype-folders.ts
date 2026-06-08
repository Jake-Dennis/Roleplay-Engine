#!/usr/bin/env node
/**
 * Migration: Migrate Wiki Pages from Flat Folders to Subtype Subfolders
 *
 * Scans all wiki pages in entities/ and concepts/ folders and moves them
 * into the appropriate subtype subfolder (e.g., entities/characters/,
 * concepts/events/) based on their frontmatter `subtype` field.
 *
 * After moving files, rewrites wikilinks in all wiki .md files to reflect
 * the new folder structure.
 *
 * Usage:
 *   npx tsx scripts/migrate-wiki-to-subtype-folders.ts --help
 *   npx tsx scripts/migrate-wiki-to-subtype-folders.ts --dry-run          (default)
 *   npx tsx scripts/migrate-wiki-to-subtype-folders.ts --apply
 *   npx tsx scripts/migrate-wiki-to-subtype-folders.ts --backup
 *   npx tsx scripts/migrate-wiki-to-subtype-folders.ts --user <userId>
 *   npx tsx scripts/migrate-wiki-to-subtype-folders.ts --universe <universeId>
 *
 * Options:
 *   --dry-run             Show what would be done without making changes (default)
 *   --apply               Execute the migration
 *   --backup              Backup data/ before applying (implies --apply)
 *   --user <userId>       Only migrate a specific user
 *   --universe <universeId>  Only migrate a specific universe
 *   --help                Show this help
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import fg from "fast-glob";

import { getTypeRegistry } from "../src/lib/wiki/type-registry";
import type { TypeRegistry } from "../src/lib/wiki/type-registry";
import { folderForPage } from "../src/lib/wiki/subtype-folders";
import { rewriteLinksForPageMove } from "../src/lib/wiki/wikilinks";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");

/** Directories to skip when scanning for link rewriting. */
const SKIP_DIRS = new Set(["_review", "_archive", "conflicts", "node_modules"]);

/** Glob patterns to discover wiki page files in entities/concepts folders. */
const WIKI_FILE_PATTERNS = [
  "data/*/wiki/{entities,concepts}/**/*.md",
  "data/*/wiki/*/{entities,concepts}/**/*.md",
];

/** Known top-level wiki folder names (for wiki root detection). */
const ROOT_WIKI_FOLDERS = new Set([
  "entities",
  "concepts",
  "sources",
  "synthesis",
  "_review",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CliOptions {
  dryRun: boolean;
  apply: boolean;
  backup: boolean;
  userId?: string;
  universeId?: string;
}

interface MovePlan {
  /** Absolute source path. */
  sourcePath: string;
  /** Absolute destination path. */
  destPath: string;
  /** Relative path from wiki root to the file's directory (e.g., "entities"). */
  oldFolder: string;
  /** Relative path from wiki root to the target directory (e.g., "entities/characters"). */
  newFolder: string;
  /** Wiki root for this file. */
  wikiRoot: string;
  /** The page title from frontmatter. */
  pageTitle: string;
  /** Filename stem (without .md extension) for link rewriting. */
  filenameNoExt: string;
  /** Whether the file was actually moved (vs. already in correct location). */
  needsMove: boolean;
}

interface LinkRewriteEntry {
  oldFolder: string;
  newFolder: string;
  pageTitle: string;
  filenameNoExt: string;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
Usage: migrate [options]

Migrates wiki pages from flat folders (e.g., entities/) to subtype subfolders
(e.g., entities/characters/) based on the page's frontmatter \`subtype\` field.

Options:
  --dry-run             Show what would be done without making changes (default)
  --apply               Execute the migration
  --backup              Backup data/ before applying (implies --apply)
  --user <userId>       Only migrate a specific user
  --universe <universeId>  Only migrate a specific universe
  --help                Show this help
  `.trim());
}

// ---------------------------------------------------------------------------
// Argument Parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: true, apply: false, backup: false };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case "--help":
        printHelp();
        process.exit(0);
      case "--dry-run":
        options.dryRun = true;
        options.apply = false;
        break;
      case "--apply":
        options.apply = true;
        options.dryRun = false;
        break;
      case "--backup":
        options.backup = true;
        options.apply = true;
        options.dryRun = false;
        break;
      case "--user":
        options.userId = argv[++i];
        if (!options.userId) {
          console.error("Error: --user requires a userId argument");
          process.exit(1);
        }
        break;
      case "--universe":
        options.universeId = argv[++i];
        if (!options.universeId) {
          console.error("Error: --universe requires a universeId argument");
          process.exit(1);
        }
        break;
      default:
        if (arg.startsWith("--")) {
          console.error(`Error: Unknown option "${arg}"`);
          printHelp();
          process.exit(1);
        }
        break;
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Wiki Root Detection
// ---------------------------------------------------------------------------

/**
 * Find the wiki root directory for a given file path.
 *
 * Walks up from the file looking for a .wiki-config.json.
 * For unconfigured wikis, falls back to heuristic: if the first directory
 * after `wiki/` is one of the known root folders (entities, concepts, etc.),
 * the wiki root is `data/{userId}/wiki/`. Otherwise, the first directory
 * after `wiki/` is treated as a universe scope.
 */
function findWikiRoot(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const wikiIdx = normalizedPath.indexOf("/wiki/");
  if (wikiIdx === -1) {
    throw new Error(`Not a wiki path (no /wiki/ segment): ${filePath}`);
  }

  // Check the parent of the file first, then walk up
  let dir = path.dirname(normalizedPath);
  const rootPrefix = normalizedPath.slice(0, wikiIdx + 6); // includes trailing /

  // Walk up until we find .wiki-config.json or hit the wiki root
  while (dir.startsWith(rootPrefix)) {
    if (fs.existsSync(path.join(dir, ".wiki-config.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // No config found: use heuristic based on path structure
  const afterWiki = normalizedPath.slice(wikiIdx + 6); // everything after "wiki/"
  const firstSegment = afterWiki.split("/")[0];

  if (firstSegment && ROOT_WIKI_FOLDERS.has(firstSegment)) {
    // Root wiki scope: data/{userId}/wiki
    return normalizedPath.slice(0, wikiIdx + 5); // strip trailing / from wiki/
  }

  // Universe scope: data/{userId}/wiki/{universeId}
  const wikiWithSlash = normalizedPath.slice(0, wikiIdx + 6);
  return wikiWithSlash + firstSegment;
}

/**
 * Get the relative path of a file from its wiki root.
 */
function relativeToWikiRoot(filePath: string, wikiRoot: string): string {
  const rel = path.relative(wikiRoot, filePath).replace(/\\/g, "/");
  return rel;
}

/**
 * Get the folder path relative to wiki root (dirname of the relative path).
 */
function folderRelativeToWikiRoot(filePath: string, wikiRoot: string): string {
  const rel = relativeToWikiRoot(filePath, wikiRoot);
  return path.dirname(rel).replace(/\\/g, "/");
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

function backupDataDir(): string | null {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(DATA_DIR, `_backup_${timestamp}`);

  console.log(`\nBacking up data/ to ${backupDir} ...`);

  try {
    // Simple recursive copy using fs operations
    copyRecursiveSync(DATA_DIR, backupDir, new Set([backupDir]));
    console.log("Backup complete.\n");
    return backupDir;
  } catch (err) {
    console.error(`Backup failed: ${err}`);
    return null;
  }
}

function copyRecursiveSync(
  src: string,
  dest: string,
  exclude: Set<string>,
): void {
  if (exclude.has(src)) return;

  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      copyRecursiveSync(srcPath, destPath, exclude);
    }
  } else if (stats.isFile()) {
    fs.copyFileSync(src, dest);
  }
}

// ---------------------------------------------------------------------------
// File Discovery
// ---------------------------------------------------------------------------

interface DiscoveredFile {
  /** Absolute path to the markdown file. */
  path: string;
  /** The wiki root directory for this file. */
  wikiRoot: string;
  /** Relative path from wiki root (forward slashes). */
  relativePath: string;
  /** The entity/concept folder (e.g., "entities" or "concepts"). */
  typeFolder: string;
}

/**
 * Discover all wiki page files in entities/ and concepts/ folders.
 * Skips hidden dirs and system dirs. Optionally filters by user and universe.
 */
function discoverFiles(options: CliOptions): DiscoveredFile[] {
  const files: DiscoveredFile[] = [];

  for (const pattern of WIKI_FILE_PATTERNS) {
    const matches = fg.sync(pattern, {
      cwd: process.cwd(),
      absolute: true,
      onlyFiles: true,
    });

    for (const absPath of matches) {
      const normalizedPath = absPath.replace(/\\/g, "/");

      // Skip files in hidden/system directories
      if (isInSkippedDir(normalizedPath)) continue;

      // Determine wiki root
      let wikiRoot: string;
      try {
        wikiRoot = findWikiRoot(normalizedPath);
      } catch {
        // Skip files that can't be mapped to a wiki root
        continue;
      }

      const relPath = relativeToWikiRoot(normalizedPath, wikiRoot);

      // Determine type folder (first segment: entities or concepts)
      const firstSegment = relPath.split("/")[0];
      if (firstSegment !== "entities" && firstSegment !== "concepts") continue;

      // Filter by user if specified
      if (options.userId) {
        const userMatch = normalizedPath.match(
          /\/data\/([^/]+)\/wiki\//,
        );
        if (userMatch && userMatch[1] !== options.userId) continue;
      }

      // Filter by universe if specified
      if (options.universeId) {
        // Universe scope: data/{userId}/wiki/{universeId}/...
        const afterWiki = normalizedPath.split("/wiki/")[1] || "";
        const maybeUniverse = afterWiki.split("/")[0];
        // Only skip if this file is actually in a universe scope
        // and the universe doesn't match. Root-scope files have no
        // universe, so they always match when no universe filter is active.
        if (maybeUniverse && !ROOT_WIKI_FOLDERS.has(maybeUniverse)) {
          // This file is in a universe scope — check the ID
          if (maybeUniverse !== options.universeId) continue;
        }
        // If it's a root-scope file and --universe is specified,
        // we skip it (root scope has no universe)
        if (
          firstSegment === maybeUniverse &&
          ROOT_WIKI_FOLDERS.has(firstSegment)
        ) {
          continue;
        }
      }

      files.push({
        path: normalizedPath,
        wikiRoot,
        relativePath: relPath,
        typeFolder: firstSegment,
      });
    }
  }

  return files;
}

/**
 * Check if a file path contains a skipped directory segment.
 */
function isInSkippedDir(filePath: string): boolean {
  const parts = filePath.replace(/\\/g, "/").split("/");
  for (const part of parts) {
    if (part.startsWith(".")) return true;
    if (SKIP_DIRS.has(part)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Link Rewriting (post-move)
// ---------------------------------------------------------------------------

/**
 * Rewrite wikilinks in a single file for a batch of page moves.
 *
 * Applies rewriteLinksForPageMove for each moved page. If the content
 * changes, writes the file back.
 *
 * @returns Number of links rewritten in this file, or 0.
 */
function rewriteLinksInFile(
  filePath: string,
  moveEntries: LinkRewriteEntry[],
): number {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return 0;
  }

  let updatedContent = content;
  let totalRewrites = 0;

  for (const entry of moveEntries) {
    const rewritten = rewriteLinksForPageMove(
      updatedContent,
      entry.oldFolder,
      entry.newFolder,
      entry.pageTitle,
      entry.filenameNoExt,
    );
    if (rewritten !== updatedContent) {
      totalRewrites++;
      updatedContent = rewritten;
    }
  }

  if (totalRewrites > 0 && updatedContent !== content) {
    try {
      fs.writeFileSync(filePath, updatedContent, "utf-8");
    } catch (err) {
      console.error(`  ✗ Failed to write updated links to ${filePath}: ${err}`);
      return 0;
    }
  }

  return totalRewrites;
}

// ---------------------------------------------------------------------------
// Main Migration Logic
// ---------------------------------------------------------------------------

function main(): void {
  const options = parseArgs(process.argv);

  console.log("Wiki Page → Subtype Folder Migration");
  console.log("=====================================");
  if (options.dryRun) console.log("Mode: DRY RUN (no changes will be made)\n");
  else if (options.backup) console.log("Mode: APPLY with backup\n");
  else console.log("Mode: APPLY\n");

  // Step 1: Discover all candidate files
  const discoveredFiles = discoverFiles(options);
  console.log(
    `Discovered ${discoveredFiles.length} wiki page(s) in entities/concepts folders.\n`,
  );

  if (discoveredFiles.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  // Step 2: Build move plan for each file
  const movePlans: MovePlan[] = [];
  let errors = 0;

  for (const file of discoveredFiles) {
    try {
      const plan = buildMovePlan(file, options);
      if (plan) movePlans.push(plan);
    } catch (err) {
      errors++;
      console.error(
        `  ✗ Error processing ${path.basename(file.path)}: ${err}`,
      );
    }
  }

  const movesNeeded = movePlans.filter((m) => m.needsMove).length;
  const alreadyCorrect = movePlans.length - movesNeeded;

  if (movesNeeded === 0) {
    console.log(
      `All ${movePlans.length} file(s) are already in their correct subtype folders.`,
    );
    if (errors > 0) {
      console.log(`Errors: ${errors}`);
    }
    return;
  }

  if (options.dryRun) {
    printDryRunSummary(movePlans, alreadyCorrect, errors);
    return;
  }

  // Step 3: Backup if requested
  if (options.backup) {
    const backupPath = backupDataDir();
    if (!backupPath) {
      console.error("Backup failed. Aborting migration.");
      process.exit(1);
    }
  }

  // Step 4: Execute moves
  const moveErrors = executeMoves(movePlans);
  errors += moveErrors;

  const actualMoves = movePlans.filter((m) => m.needsMove).length - moveErrors;

  // Step 5: Rewrite links in all wiki files
  const linkRewriteEntries: LinkRewriteEntry[] = movePlans
    .filter((m) => m.needsMove)
    .map((m) => ({
      oldFolder: m.oldFolder,
      newFolder: m.newFolder,
      pageTitle: m.pageTitle,
      filenameNoExt: m.filenameNoExt,
    }));

  let linkRewrites = 0;
  let filesWithRewrites = 0;
  if (linkRewriteEntries.length > 0) {
    const allWikiFiles = collectAllWikiFiles();
    for (const wikiFile of allWikiFiles) {
      const count = rewriteLinksInFile(wikiFile, linkRewriteEntries);
      if (count > 0) {
        linkRewrites += count;
        filesWithRewrites++;
      }
    }
  }

  // Step 6: Print summary
  printSummary(
    movePlans,
    actualMoves,
    linkRewrites,
    filesWithRewrites,
    errors,
  );
}

/**
 * Build a move plan for a single discovered file.
 * Returns null if the file cannot be processed.
 */
function buildMovePlan(
  file: DiscoveredFile,
  options: CliOptions,
): MovePlan | null {
  // Read frontmatter
  const raw = fs.readFileSync(file.path, "utf-8");
  const parsed = matter(raw);
  const frontmatter = parsed.data as Record<string, unknown>;

  // Get type registry for this wiki root
  const registry = getTypeRegistry(file.wikiRoot);

  // Compute the correct folder
  const targetFolder = folderForPage(frontmatter, registry);

  // Determine current folder
  const currentFolder = folderRelativeToWikiRoot(file.path, file.wikiRoot);

  // Filename info
  const filename = path.basename(file.path);
  const filenameNoExt = filename.replace(/\.md$/i, "");
  const pageTitle =
    typeof frontmatter.title === "string" ? frontmatter.title : filenameNoExt;

  const destDir = path.join(file.wikiRoot, targetFolder);
  const destPath = path.join(destDir, filename);

  const needsMove = currentFolder !== targetFolder;

  return {
    sourcePath: file.path,
    destPath,
    oldFolder: currentFolder,
    newFolder: targetFolder,
    wikiRoot: file.wikiRoot,
    pageTitle,
    filenameNoExt,
    needsMove,
  };
}

/**
 * Execute all planned file moves.
 * Returns the number of errors encountered.
 */
function executeMoves(plans: MovePlan[]): number {
  let errors = 0;

  for (const plan of plans) {
    if (!plan.needsMove) continue;

    try {
      // Create target directory if needed
      const destDir = path.dirname(plan.destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Read the full content (with frontmatter) to preserve it verbatim
      const content = fs.readFileSync(plan.sourcePath, "utf-8");

      // Write to new location
      fs.writeFileSync(plan.destPath, content, "utf-8");

      // Remove old file
      fs.unlinkSync(plan.sourcePath);

      console.log(
        `  ✓ Moved ${path.basename(plan.sourcePath)} → ${plan.newFolder}/`,
      );
    } catch (err) {
      errors++;
      console.error(
        `  ✗ Failed to move ${path.basename(plan.sourcePath)}: ${err}`,
      );
    }
  }

  return errors;
}

/**
 * Collect all wiki .md files across all user wiki directories for link rewriting.
 */
function collectAllWikiFiles(): string[] {
  const allFiles: string[] = [];

  if (!fs.existsSync(DATA_DIR)) return allFiles;

  const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("_backup")) continue;

    const wikiDir = path.join(DATA_DIR, entry.name, "wiki");
    if (!fs.existsSync(wikiDir)) continue;

    collectMdFiles(wikiDir, allFiles);
  }

  return allFiles;
}

/**
 * Recursively collect .md files from a directory, skipping system dirs.
 */
function collectMdFiles(dir: string, files: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectMdFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

/**
 * Group move plans by their target folder for display.
 */
function groupByTargetFolder(plans: MovePlan[]): Map<string, MovePlan[]> {
  const groups = new Map<string, MovePlan[]>();

  // Only include plans that actually need moving
  const applicable = plans.filter((p) => p.needsMove);

  // Sort by old folder for stable output
  applicable.sort((a, b) => a.oldFolder.localeCompare(b.oldFolder));

  for (const plan of applicable) {
    const key = plan.newFolder;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(plan);
  }

  return groups;
}

function printDryRunSummary(
  plans: MovePlan[],
  alreadyCorrect: number,
  errors: number,
): void {
  const groups = groupByTargetFolder(plans);
  const totalToMove = Array.from(groups.values()).reduce(
    (sum, g) => sum + g.length,
    0,
  );

  console.log("\nDRY RUN SUMMARY");
  console.log("================");
  console.log(`Files to move:  ${totalToMove}`);
  console.log(`Already correct: ${alreadyCorrect}`);
  console.log(`Errors:         ${errors}\n`);

  for (const [targetFolder, folderPlans] of groups) {
    console.log(`  ${targetFolder}/`);
    for (const plan of folderPlans) {
      console.log(
        `    - ${path.basename(plan.sourcePath)}  (was ${plan.oldFolder}/)`,
      );
    }
  }

  console.log(
    `\nRun with --apply to execute these ${totalToMove} move(s).`,
  );
}

function printSummary(
  plans: MovePlan[],
  actualMoves: number,
  linkRewrites: number,
  filesWithRewrites: number,
  errors: number,
): void {
  const groups = groupByTargetFolder(plans);

  console.log("\nMigration Summary");
  console.log("=================");
  console.log(`Files moved:     ${actualMoves}`);

  for (const [targetFolder, folderPlans] of groups) {
    if (folderPlans.length === 0) continue;
    console.log(`  ${targetFolder}/`);
    for (const plan of folderPlans) {
      // Only show files that were actually moved
      if (!plan.needsMove) continue;
      const sourceDir = path
        .dirname(
          path.relative(plan.wikiRoot, plan.sourcePath).replace(/\\/g, "/"),
        )
        .replace(/^\.$/, "");
      const sourceLabel =
        sourceDir && sourceDir !== "."
          ? `(was ${sourceDir}/)`
          : "(was root/)";
      console.log(`    - ${path.basename(plan.sourcePath)}  ${sourceLabel}`);
    }
  }

  console.log(`Links updated:   ${linkRewrites} in ${filesWithRewrites} files`);
  console.log(`Errors:          ${errors}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main();

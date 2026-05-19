/**
 * Wiki Performance Benchmark
 *
 * Run: npx tsx scripts/benchmark-wiki.ts
 *
 * Creates 100 test wiki pages, benchmarks core operations,
 * prints results with pass/fail against targets, then cleans up.
 */

import fs from "fs";
import path from "path";
import os from "os";
import {
  readWikiPage,
  writeWikiPage,
  listWikiPages,
  deleteWikiPage,
  type WikiFrontmatter,
} from "../src/lib/wiki/file-io";
import {
  parseWikilinks,
  resolveWikilink,
  buildLinkGraph,
} from "../src/lib/wiki/wikilinks";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const NUM_PAGES = 100;
const NUM_RUNS = 10;
const FOLDERS = ["entities", "concepts", "sources", "synthesis"] as const;

const TARGETS = {
  readWikiPage: 200,       // ms — page render
  writeWikiPage: 200,      // ms — page write
  listWikiPages: 1000,     // ms — graph load (scan all folders)
  buildLinkGraph: 1000,    // ms — build full graph
  parseWikilinks: 100,     // ms — parse content with 20 wikilinks
  resolveWikilink: 100,    // ms — resolve a link from 100 pages
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempWikiRoot(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-bench-"));
  for (const folder of FOLDERS) {
    fs.mkdirSync(path.join(tmp, folder), { recursive: true });
  }
  return tmp;
}

function cleanupWikiRoot(root: string) {
  fs.rmSync(root, { recursive: true, force: true });
}

function generateContent(title: string, linkCount: number): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`This is the body content for ${title}.`);
  lines.push("");

  // Add wikilinks
  for (let i = 0; i < linkCount; i++) {
    const targetNum = ((i * 7 + 3) % NUM_PAGES) + 1;
    lines.push(`See also [[Test Page ${targetNum}]].`);
  }

  lines.push("");
  lines.push("More content here with some detail to simulate real pages.");
  return lines.join("\n");
}

function generateFrontmatter(index: number): WikiFrontmatter {
  const folderIndex = index % FOLDERS.length;
  const types: WikiFrontmatter["type"][] = ["entity", "concept", "source", "synthesis"];
  const statuses: WikiFrontmatter["status"][] = ["draft", "reviewed", "locked"];

  return {
    title: `Test Page ${index + 1}`,
    type: types[folderIndex],
    status: statuses[index % statuses.length],
    universe: `universe-${index % 3}`,
    tags: [`tag-${index % 5}`, `benchmark`],
  };
}

function benchmark<T>(label: string, fn: () => T, runs: number): { avg: number; min: number; max: number; results: number[] } {
  const results: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = Date.now();
    fn();
    const elapsed = Date.now() - start;
    results.push(elapsed);
  }
  const avg = results.reduce((a, b) => a + b, 0) / results.length;
  const min = Math.min(...results);
  const max = Math.max(...results);
  return { avg, min, max, results };
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 100) return `${ms.toFixed(1)}ms`;
  return `${ms.toFixed(0)}ms`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(70));
  console.log("  WIKI PERFORMANCE BENCHMARK");
  console.log("=".repeat(70));
  console.log(`Pages: ${NUM_PAGES} | Runs per op: ${NUM_RUNS} | Temp dir: ${os.tmpdir()}`);
  console.log("");

  const wikiRoot = createTempWikiRoot();
  const createdPaths: string[] = [];

  try {
    // -----------------------------------------------------------------------
    // Phase 1: Create test pages
    // -----------------------------------------------------------------------
    console.log("Phase 1: Creating test pages...");
    const createStart = Date.now();

    for (let i = 0; i < NUM_PAGES; i++) {
      const folderIndex = i % FOLDERS.length;
      const folder = FOLDERS[folderIndex];
      const filename = `test_page_${String(i + 1).padStart(3, "0")}.md`;
      const filePath = path.join(wikiRoot, folder, filename);

      const content = generateContent(`Test Page ${i + 1}`, 20);
      const frontmatter = generateFrontmatter(i);

      writeWikiPage(filePath, content, frontmatter);
      createdPaths.push(filePath);
    }

    const createTime = Date.now() - createStart;
    console.log(`  Created ${NUM_PAGES} pages in ${formatMs(createTime)}`);
    console.log("");

    // -----------------------------------------------------------------------
    // Phase 2: Benchmark operations
    // -----------------------------------------------------------------------
    console.log("Phase 2: Running benchmarks...");
    console.log("");

    const results: Array<{
      operation: string;
      avg: number;
      min: number;
      max: number;
      target: number;
      pass: boolean;
    }> = [];

    // --- readWikiPage ---
    const samplePath = createdPaths[0];
    const readResult = benchmark("readWikiPage", () => {
      readWikiPage(samplePath);
    }, NUM_RUNS);
    results.push({
      operation: "readWikiPage",
      avg: readResult.avg,
      min: readResult.min,
      max: readResult.max,
      target: TARGETS.readWikiPage,
      pass: readResult.avg <= TARGETS.readWikiPage,
    });
    console.log(`  readWikiPage:     avg=${formatMs(readResult.avg)}  min=${formatMs(readResult.min)}  max=${formatMs(readResult.max)}`);

    // --- writeWikiPage ---
    const writePath = path.join(wikiRoot, "entities", "bench_write_test.md");
    const writeResult = benchmark("writeWikiPage", () => {
      writeWikiPage(writePath, "Benchmark write content", {
        title: "Bench Write Test",
        type: "entity",
        status: "draft",
      });
      // Clean up for next iteration
      if (fs.existsSync(writePath)) fs.unlinkSync(writePath);
    }, NUM_RUNS);
    results.push({
      operation: "writeWikiPage",
      avg: writeResult.avg,
      min: writeResult.min,
      max: writeResult.max,
      target: TARGETS.writeWikiPage,
      pass: writeResult.avg <= TARGETS.writeWikiPage,
    });
    console.log(`  writeWikiPage:    avg=${formatMs(writeResult.avg)}  min=${formatMs(writeResult.min)}  max=${formatMs(writeResult.max)}`);

    // --- listWikiPages ---
    const listResult = benchmark("listWikiPages", () => {
      listWikiPages(wikiRoot);
    }, NUM_RUNS);
    results.push({
      operation: "listWikiPages",
      avg: listResult.avg,
      min: listResult.min,
      max: listResult.max,
      target: TARGETS.listWikiPages,
      pass: listResult.avg <= TARGETS.listWikiPages,
    });
    console.log(`  listWikiPages:    avg=${formatMs(listResult.avg)}  min=${formatMs(listResult.min)}  max=${formatMs(listResult.max)}`);

    // --- buildLinkGraph ---
    const pages = listWikiPages(wikiRoot);
    const graphResult = benchmark("buildLinkGraph", () => {
      buildLinkGraph(pages);
    }, NUM_RUNS);
    results.push({
      operation: "buildLinkGraph",
      avg: graphResult.avg,
      min: graphResult.min,
      max: graphResult.max,
      target: TARGETS.buildLinkGraph,
      pass: graphResult.avg <= TARGETS.buildLinkGraph,
    });
    console.log(`  buildLinkGraph:   avg=${formatMs(graphResult.avg)}  min=${formatMs(graphResult.min)}  max=${formatMs(graphResult.max)}`);

    // --- parseWikilinks ---
    const sampleContent = generateContent("Parse Test", 20);
    const parseResult = benchmark("parseWikilinks", () => {
      parseWikilinks(sampleContent);
    }, NUM_RUNS);
    results.push({
      operation: "parseWikilinks",
      avg: parseResult.avg,
      min: parseResult.min,
      max: parseResult.max,
      target: TARGETS.parseWikilinks,
      pass: parseResult.avg <= TARGETS.parseWikilinks,
    });
    console.log(`  parseWikilinks:   avg=${formatMs(parseResult.avg)}  min=${formatMs(parseResult.min)}  max=${formatMs(parseResult.max)}`);

    // --- resolveWikilink ---
    const resolveName = "Test Page 50";
    const resolveResult = benchmark("resolveWikilink", () => {
      resolveWikilink(resolveName, pages, "universe-0");
    }, NUM_RUNS);
    results.push({
      operation: "resolveWikilink",
      avg: resolveResult.avg,
      min: resolveResult.min,
      max: resolveResult.max,
      target: TARGETS.resolveWikilink,
      pass: resolveResult.avg <= TARGETS.resolveWikilink,
    });
    console.log(`  resolveWikilink:  avg=${formatMs(resolveResult.avg)}  min=${formatMs(resolveResult.min)}  max=${formatMs(resolveResult.max)}`);

    // -----------------------------------------------------------------------
    // Phase 3: Print results table
    // -----------------------------------------------------------------------
    console.log("");
    console.log("=".repeat(70));
    console.log("  RESULTS");
    console.log("=".repeat(70));
    console.log("");

    const header =
      `| Operation          | Avg      | Min      | Max      | Target   | Status |`;
    const separator =
      `|--------------------|----------|----------|----------|----------|--------|`;

    console.log(header);
    console.log(separator);

    for (const r of results) {
      const status = r.pass ? "PASS" : "FAIL";
      const statusIcon = r.pass ? "✅" : "❌";
      const row =
        `| ${r.operation.padEnd(18)} | ${formatMs(r.avg).padStart(8)} | ${formatMs(r.min).padStart(8)} | ${formatMs(r.max).padStart(8)} | ${formatMs(r.target).padStart(8)} | ${statusIcon} ${status} |`;
      console.log(row);
    }

    console.log(separator);

    const passCount = results.filter((r) => r.pass).length;
    const failCount = results.filter((r) => !r.pass).length;
    console.log(`\n  ${passCount}/${results.length} operations passed`);

    if (failCount > 0) {
      console.log("\n  Failed operations:");
      for (const r of results.filter((r) => !r.pass)) {
        console.log(`    - ${r.operation}: avg ${formatMs(r.avg)} > target ${formatMs(r.target)}`);
      }
    }

    console.log("");
    console.log("=".repeat(70));

    // -----------------------------------------------------------------------
    // Phase 4: Cleanup
    // -----------------------------------------------------------------------
    console.log("\nPhase 3: Cleaning up test pages...");
    cleanupWikiRoot(wikiRoot);
    console.log("  Done. All test pages removed.");

  } catch (err) {
    // Always cleanup on error
    console.error("\nBenchmark failed:", err);
    try {
      cleanupWikiRoot(wikiRoot);
      console.log("Cleanup completed despite error.");
    } catch {
      // ignore cleanup errors
    }
    process.exit(1);
  }
}

main();

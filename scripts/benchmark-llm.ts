#!/usr/bin/env npx ts-node
/**
 * LLM Hardware Benchmark CLI
 * Usage: npx ts-node scripts/benchmark-llm.ts [options]
 *
 * Tests max context window, max predict tokens, and finds the best
 * num_ctx × num_predict combination for your hardware.
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { BenchmarkConfig } from "../src/lib/benchmark/types";
import { runBenchmarkBackground } from "../src/lib/benchmark/orchestrator";
import { getModelMeta } from "../src/lib/ollama-meta";
import { OLLAMA_CONFIG } from "../src/lib/config";
import * as fs from "fs";

const args = process.argv.slice(2);
const flags: Record<string, string | boolean> = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith("--")) {
    const key = arg.slice(2);
    if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
      flags[key] = args[++i];
    } else {
      flags[key] = true;
    }
  } else if (arg.startsWith("-")) {
    const key = arg.slice(1);
    if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
      flags[key] = args[++i];
    } else {
      flags[key] = true;
    }
  }
}

function printHelp() {
  console.log(`
LLM Hardware Benchmark CLI (Simplified)
Usage: npx ts-node scripts/benchmark-llm.ts [options]

Tests max context window, max predict tokens, and finds the best
num_ctx × num_predict combination.

Options:
  -m, --model <name>           Model to benchmark (default: ${OLLAMA_CONFIG.model})
  -H, --host <url>             Ollama host (default: ${OLLAMA_CONFIG.baseUrl})
  -q, --quick                  Quick mode (fewer tests, ~60s)
      --context-sizes <list>   Comma-separated context sizes (default: 1024,4096,16384,32768,65536)
      --max-predict <n>        Max predict tokens to test (default: 32768)
      --json                   Output machine-readable JSON
      --save <path>            Save report to file (default: ./benchmark-report.json)
      --meta-only              Only fetch model metadata
  -h, --help                   Show this help
`);
}

if (flags.help || flags.h) {
  printHelp();
  process.exit(0);
}

async function main() {
  const ollamaHost = (flags.host as string) || OLLAMA_CONFIG.baseUrl;
  const model = (flags.model as string) || OLLAMA_CONFIG.model;
  const quickMode = flags.quick === true || flags.q === true;
  const jsonOutput = flags.json === true;
  const savePath = (flags.save as string) || "./benchmark-report.json";
  const maxPredict = parseInt(flags["max-predict"] as string) || 32768;

  let testContextSizes = [1024, 4096, 16384, 32768, 65536];
  if (quickMode) {
    testContextSizes = [1024, 4096, 16384];
  }
  if (flags["context-sizes"]) {
    testContextSizes = (flags["context-sizes"] as string).split(",").map(s => parseInt(s.trim()));
  }

  // Meta-only mode
  if (flags["meta-only"]) {
    if (!jsonOutput) console.log(`Fetching metadata for ${model}...\n`);
    const meta = await getModelMeta(model, ollamaHost);
    if (jsonOutput) {
      console.log(JSON.stringify(meta, null, 2));
    } else {
      console.log("=== Model Metadata ===");
      console.log(`Name: ${meta.name}`);
      console.log(`Context Window: ${meta.contextWindow.toLocaleString()}`);
      console.log(`Parameters: ${(meta.parameterCount / 1e9).toFixed(1)}B`);
      console.log(`Quantization: ${meta.quantization || "unknown"}`);
      console.log(`Family: ${meta.family || "unknown"}`);
      console.log(`Size: ${(meta.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`);
    }
    return;
  }

  // Full benchmark
  if (!jsonOutput) {
    console.log(`Starting benchmark for ${model}...`);
    console.log(`Host: ${ollamaHost}`);
    console.log(`Quick mode: ${quickMode}`);
    console.log(`Context sizes: ${testContextSizes.join(", ")}`);
    console.log("");
  }

  const benchmarkConfig: BenchmarkConfig = {
    model,
    ollamaHost,
    testContextSizes,
    quickMode,
    maxPredictTokens: maxPredict,
  };

  try {
    const report = await runBenchmarkBackground(benchmarkConfig, "cli-benchmark", (progress) => {
      if (!jsonOutput) {
        const bar = "█".repeat(Math.floor(progress.progress / 5)) + "░".repeat(20 - Math.floor(progress.progress / 5));
        process.stdout.write(`\r[${bar}] ${progress.progress.toString().padStart(3)}% - ${progress.message}                    `);
      }
    });

    if (!jsonOutput) {
      console.log("\n\n=== BENCHMARK COMPLETE ===");
      console.log(`Recommended numCtx:  ${report.recommendedNumCtx.toLocaleString()}`);
      console.log(`Recommended numPredict: ${report.recommendedNumPredict.toLocaleString()}`);
      console.log(``);
      console.log(`Max Context (at 256 predict): ${report.contextTest.maxContextFound.toLocaleString()}`);
      if (report.contextTest.oomSize) {
        console.log(`  OOM at ${report.contextTest.oomSize.toLocaleString()}`);
      }
      console.log(``);
      console.log(`Max Predict (at 2K context): ${report.predictTest.maxPredictFound.toLocaleString()}`);
      if (report.predictTest.oomSize) {
        console.log(`  OOM at ${report.predictTest.oomSize.toLocaleString()}`);
      }
      console.log(``);
      console.log(`Combinations (ctx × max predict):`);
      for (const c of report.combinations) {
        const ok = c.success ? "OK" : "FAIL";
        console.log(`  ${c.contextSize.toLocaleString()} ctx → ${c.maxNumPredict.toLocaleString()} predict [${ok}]`);
      }
      console.log(``);
      if (report.warnings.length) {
        console.log(`Warnings: ${report.warnings.join("; ")}`);
      }
    }

    // Save report
    fs.writeFileSync(savePath, JSON.stringify(report, null, 2));
    if (!jsonOutput) console.log(`Report saved to ${savePath}`);

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error("\nBenchmark failed:", error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

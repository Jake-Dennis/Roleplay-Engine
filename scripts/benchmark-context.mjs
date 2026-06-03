#!/usr/bin/env node
/**
 * Context Window Benchmark Tool
 *
 * Finds the maximum usable context window for any model on the current Ollama host.
 * Uses exponential search + binary search to find the precise boundary in ~15-20 rounds.
 *
 * Usage:
 *   node scripts/benchmark-context.mjs qwen3.5:9b
 *   node scripts/benchmark-context.mjs qwen3.5:9b --host 192.168.4.2 --port 11434
 *   node scripts/benchmark-context.mjs qwen3.5:9b --min 32768 --max 262144 --precision 1024
 *   node scripts/benchmark-context.mjs qwen3.5:9b --save   # write result to data/global.db
 *
 * Algorithm:
 *   1. Exponential search: start at --min, double until failure or --max
 *   2. Binary search: narrow down between last working and first failing
 *   3. Confirmation: at the boundary, run a ~50k-token stress test
 *
 * Output:
 *   - Max context that loads and generates successfully
 *   - Whether it passes a full prompt-eval stress test at that level
 *   - (with --save) INSERT row into benchmark_results table
 */

import Database from 'better-sqlite3';

const OLLAMA_HOST = process.env.OLLAMA_HOST || "192.168.4.2";
const OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || "11434", 10);
const BASE_URL = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`;

// ── Parse args ──────────────────────────────────────────────
const args = process.argv.slice(2);
const MODEL = args.find(a => !a.startsWith('--')) || 'qwen3.5:9b';
const HOST = parseArg('--host') || OLLAMA_HOST;
const PORT = parseInt(parseArg('--port') || String(OLLAMA_PORT), 10);
const MIN_CTX = parseInt(parseArg('--min') || '4096', 10);
const MAX_CTX = parseInt(parseArg('--max') || '262144', 10);
const PRECISION = parseInt(parseArg('--precision') || '1024', 10);
const TIMEOUT_SEC = parseInt(parseArg('--timeout') || '120', 10);
const SAVE = args.includes('--save');
const DB_PATH = parseArg('--db') || 'data/global.db';
const INFLIGHT_ID = parseInt(parseArg('--inflight-id') || '0', 10) || null;
const URL = `http://${HOST}:${PORT}`;

function parseArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

// ── Helpers ─────────────────────────────────────────────────

function makeShortPrompt(tokens) {
  // Build ~tokens tokens of filler text — short enough for fast transmission
  const sentence = "The ancient forest stretched beneath the moonlight. ";
  // ~6 tokens per sentence
  const count = Math.ceil(tokens / 6);
  let text = "";
  for (let i = 0; i < count; i++) text += sentence;
  return text + "\n\nSay OK.";
}

// Weighted padding for stress test (varied content to test actual comprehension)
function makeDensePrompt(tokens) {
  const paragraphs = [
    "The ancient forest of Eldwood stretched for hundreds of miles beneath the pale silver moonlight. Towering oaks and ancient elms created a dense canopy that filtered the starlight into a soft ethereal glow. ",
    "Deep within the forest, a crumbling stone pathway wound between moss-covered ruins. These remnants of a forgotten civilization held secrets that no living soul remembered. The stones hummed with residual magic, pulsing gently like a sleeping heartbeat.",
    "A cool breeze carried the scent of night-blooming jasmine and damp earth through the clearing. Fireflies danced in lazy spirals, their light reflecting off the surface of a small pond that had formed in the crater of an ancient meteor impact.",
    "The old wizard's tower stood at the forest's heart, its spire piercing the canopy. Centuries of weather had worn its granite surface smooth, but the windows still glowed with an inner light. Runes carved above the doorway shifted and rearranged themselves continuously.",
    "Strange creatures moved in the underbrush — small luminescent beings that fed on moonlight and dew. They were shy but curious, often leaving small offerings of polished stones or crystallized tree sap at the base of the tower door.",
    "Time moved differently in Eldwood. Hours could pass in what felt like minutes, or a single moment could stretch into an eternity. The forest had its own will, its own sense of purpose, and it chose when to let travelers pass through.",
    "Beneath the roots of the oldest oak, a network of caverns held paintings from the first people who had inhabited this land. The images told stories of great battles, of love and loss, of bargains struck with forces beyond mortal understanding.",
    "A path of glowing mushrooms lined the way to the Whispering Glade, where the veil between worlds was thin. On certain nights, one could hear the voices of those who had passed beyond, carried on the wind like fragments of forgotten songs.",
    "The crystal formations in the eastern caves pulsed with a rhythm that matched the beating of a human heart. Miners who spent too long near them reported vivid dreams of flying through star-studded skies above an endless ocean.",
    "Every seven years, the forest held its Great Bloom. Every flower in Eldwood opened simultaneously, releasing spores that created spectacular auroras visible for hundreds of miles. The phenomenon drew scholars and mages from across the realm.",
    "At the forest's edge, where civilization met wilderness, stood a small inn called The Sleeping Fox. Travelers shared tales of what they had seen within Eldwood's borders, each story more fantastical than the last, yet somehow all of them true.",
  ];
  // ~100 tokens per paragraph + padding
  const count = Math.ceil(tokens / 100);
  let text = "";
  for (let i = 0; i < count; i++) text += paragraphs[i % paragraphs.length] + "\n\n";
  return text;
}

async function ollamaGenerate(model, prompt, numCtx, timeoutSec) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);

  try {
    const resp = await fetch(`${URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { num_ctx: numCtx, temperature: 0.1 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const text = await resp.text();

    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
    }

    const data = JSON.parse(text);

    if (data.eval_count !== undefined) {
      const tps = data.eval_count / (data.eval_duration / 1e9);
      return {
        ok: true,
        promptTokens: data.prompt_eval_count,
        generatedTokens: data.eval_count,
        tokensPerSec: tps.toFixed(1),
        totalMs: ((data.load_duration + data.prompt_eval_duration + data.eval_duration) / 1e6).toFixed(0),
        response: data.response || "",
      };
    }

    return { ok: true, promptTokens: "?", generatedTokens: "?", tokensPerSec: "?" };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: err.message };
  }
}

async function unloadModel() {
  try {
    await ollamaGenerate("llama3.2:1b", "x", 2048, 10);
  } catch {}
  // Small delay so Ollama releases VRAM
  await new Promise(r => setTimeout(r, 2000));
}

// ── Test round ──────────────────────────────────────────────

async function testContext(model, ctxSize, dense) {
  const prompt = dense ? makeDensePrompt(Math.min(ctxSize - 1000, 80000)) : makeShortPrompt(200);
  const result = await ollamaGenerate(model, prompt, ctxSize, TIMEOUT_SEC);

  if (result.ok) {
    return { status: "pass", ...result };
  }

  // Check if it's a VRAM/HTTP failure vs a content failure
  const fatal = result.error.includes("000") ||
                result.error.includes("ECONNRESET") ||
                result.error.includes("abort") ||
                result.error.includes("timeout") ||
                result.error.includes("500");
  return { status: fatal ? "fail" : "weak", error: result.error };
}

// Test a specific num_predict at a given num_ctx. Returns the gen speed
// the model sustained while trying to produce `predict` tokens.
// Uses a "continue the story" prompt so the model won't hit a stop token
// after a few words and short-circuit the test.
function makeContinuePrompt() {
  return "Continue this story without stopping or using a conclusion. " +
    "Write at least several thousand words. Do NOT use any stop tokens, " +
    "do NOT write 'The End', and do NOT use phrases like 'to be continued'. " +
    "Just keep narrating the next scene in vivid detail, with dialogue, " +
    "sensory description, and character interiority. Keep going:\n\n" +
    "The lighthouse keeper, Mara, climbed the spiral staircase for what " +
    "she knew would be the last time. The storm had been building for " +
    "three days, and tonight it would finally break. Each step groaned " +
    "beneath her boots, the iron rungs slick with sea spray. As she " +
    "reached the top, she saw the horizon — a wall of black so dense " +
    "it seemed to swallow the stars themselves. ";
}

async function testOutputLength(model, ctxSize, predict, timeoutSec = TIMEOUT_SEC) {
  const prompt = makeContinuePrompt();
  const controller = new AbortController();
  const timer = timeoutSec > 0 ? setTimeout(() => controller.abort(), timeoutSec * 1000) : null;
  try {
    const resp = await fetch(`${URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { num_ctx: ctxSize, num_predict: predict, temperature: 0.1 },
      }),
      signal: controller.signal,
    });
    if (timer) clearTimeout(timer);
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
    const data = await resp.json();
    if (data.eval_count === undefined) return { ok: false, error: "no eval_count" };
    const tps = data.eval_count / (data.eval_duration / 1e9);
    return {
      ok: true,
      generatedTokens: data.eval_count,
      tokensPerSec: tps.toFixed(1),
      hitCap: data.eval_count >= predict - 1,    // got the full num_predict back
      response: data.response || "",
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    return { ok: false, error: err.message };
  }
}

// ── Needle-in-a-haystack (NIH) attention test ──────────────
// Plant a unique fact at different positions in a long context and
// check if the model can recall it. This tests actual attention,
// not just whether the context loads.

const NIH_NEEDLE = "The secret access code for Project Starlight is: BLUE-OCEAN-7421. Memorize this code — you will be asked for it shortly.";
const NIH_QUERY = "What is the secret access code for Project Starlight? Answer with just the code, nothing else.";

function makeHaystackWithNeedle(targetTokens, positionPct, needle) {
  // Build the base haystack (varied paragraphs)
  const baseHaystack = makeDensePrompt(targetTokens);
  // Find the character position to insert the needle
  const insertPos = Math.floor(baseHaystack.length * positionPct);
  // Snap to the nearest paragraph boundary so the inserted sentence flows naturally
  const afterBreak = baseHaystack.indexOf("\n\n", insertPos);
  const beforeBreak = baseHaystack.lastIndexOf("\n\n", insertPos);
  let safePos = insertPos;
  if (afterBreak > 0 && (afterBreak - insertPos < (insertPos - beforeBreak))) {
    safePos = afterBreak + 2;
  } else if (beforeBreak > 0) {
    safePos = beforeBreak + 2;
  }
  return baseHaystack.slice(0, safePos) + needle + "\n\n" + baseHaystack.slice(safePos);
}

async function testNih(model, ctxSize, positionPct, timeoutSec = 120) {
  // Reserve ~200 tokens for the query + response
  const haystackTokens = Math.max(1024, ctxSize - 200);
  const haystack = makeHaystackWithNeedle(haystackTokens, positionPct, NIH_NEEDLE);
  const fullPrompt = haystack + "\n\n" + NIH_QUERY;
  const result = await ollamaGenerate(model, fullPrompt, ctxSize, timeoutSec);
  if (!result.ok) {
    return { ok: false, error: result.error, position: positionPct };
  }
  // The needle has a specific 13-char code (BLUE-OCEAN-7421) that's
  // extremely unlikely to appear in the model's training data or the
  // haystack — substring match is a reliable signal of attention.
  const needleCode = "BLUE-OCEAN-7421";
  const passed = result.response.includes(needleCode);
  return {
    ok: true,
    position: positionPct,
    passed,
    response: (result.response || "").slice(0, 200),
    generatedTokens: result.generatedTokens,
    tokensPerSec: result.tokensPerSec,
  };
}

// ── Main benchmark ──────────────────────────────────────────

// Persist a snapshot of progress to the in-flight row so the UI can poll it
// and show round-by-round results as they happen. Falls back to a no-op
// when no in-flight id was provided (e.g. manual CLI runs).
let _db = null;
function db() {
  if (!_db && INFLIGHT_ID) {
    try { _db = new Database(DB_PATH); } catch (e) { _db = null; }
  }
  return _db;
}
function snapshotProgress({ results, nihResults, low, practicalMax, lastGoodPromptTokens, stressPassed, stress, recommendedPredict, finalState = false }) {
  if (!INFLIGHT_ID) return;
  const conn = db();
  if (!conn) return;
  try {
    const roundData = results.map(r => ({
      ctx: r.ctx, p: r.phase, predict: r.predict ?? null,
      ok: r.status === "pass" ? 1 : 0,
      pt: r.promptTokens ?? null,
      gt: r.generatedTokens ?? null,
      e: r.status !== "pass" ? (r.error || "").slice(0, 60) : null,
    }));
    const allRounds = roundData;
    if (finalState) {
      conn.prepare(`
        UPDATE benchmark_results SET
          max_ctx_load = ?,
          max_ctx_stress = ?,
          stress_passed = ?,
          prompt_tokens = ?,
          host = ?,
          rounds_json = ?,
          recommended_num_predict = ?,
          nih_results = ?
        WHERE id = ?
      `).run(
        low,
        practicalMax,
        stressPassed ? 1 : 0,
        stressPassed ? (stress.promptTokens ?? null) : (lastGoodPromptTokens ?? null),
        `${HOST}:${PORT}`,
        JSON.stringify(allRounds),
        recommendedPredict,
        nihResults && nihResults.length > 0 ? JSON.stringify(nihResults) : null,
        INFLIGHT_ID,
      );
    } else {
      conn.prepare("UPDATE benchmark_results SET rounds_json = ? WHERE id = ?")
        .run(JSON.stringify(allRounds), INFLIGHT_ID);
    }
  } catch (e) {
    // Non-fatal — don't let DB write errors break the benchmark
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║        Context Window Benchmark Tool                ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  Model:      ${MODEL.padEnd(37)}║`);
  console.log(`║  Host:       ${HOST}:${PORT}`.padEnd(49) + "║");
  console.log(`║  Range:      ${MIN_CTX.toLocaleString()} → ${MAX_CTX.toLocaleString()}`.padEnd(49) + "║");
  console.log(`║  Precision:  ${PRECISION.toLocaleString()} tokens`.padEnd(49) + "║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ── Phase 1: Unload any running model ──
  console.log("▶  Phase 1: Unloading current model...");
  await unloadModel();
  console.log("   Done.\n");

  // ── Phase 2: Load model at minimum context (warmup) ──
  console.log(`▶  Phase 2: Loading ${MODEL} at ${MIN_CTX.toLocaleString()} context...`);
  const warmup = await testContext(MODEL, MIN_CTX, false);
  if (warmup.status !== "pass") {
    console.log(`   ❌ Model failed to load at minimum context: ${warmup.error}`);
    process.exit(1);
  }
  console.log(`   ✅ Loaded.\n`);

  // ── Phase 3: Exponential search ──
  console.log("▶  Phase 3: Exponential search (doubling)...");
  let low = MIN_CTX;
  let high = MIN_CTX;
  const results = [];
  const nihResults = [];   // populated in Phase 8
  let lastGoodPromptTokens = null;
  let practicalMax = MAX_CTX;
  let stressPassed = false;
  let stress = { status: "fail", promptTokens: null };
  let recommendedPredict = 4096;
  let firstOverMax = true;  // track first time we hit/exceed MAX_CTX

  while (high <= MAX_CTX) {
    process.stdout.write(`   Testing ${high.toLocaleString()}... `);
    const r = await testContext(MODEL, high, false);
    results.push({ ctx: high, phase: "exponential", ...r });
    snapshotProgress({ results, low, practicalMax: high, lastGoodPromptTokens, stressPassed: false });

    if (r.status === "pass") {
      console.log(`✅ ${r.generatedTokens}t generated`);
      lastGoodPromptTokens = r.promptTokens;
      low = high;
      if (high >= MAX_CTX) {
        // Reached max without failure — stop here, no need to keep retesting
        high = MAX_CTX + PRECISION;
        firstOverMax = false;
        break;
      }
      high = Math.min(high * 2, MAX_CTX);
    } else {
      console.log(`❌ ${r.error.slice(0, 60)}`);
      break;
    }
  }

  if (firstOverMax && high > MAX_CTX && results.every(r => r.status === "pass")) {
    console.log(`\n   ✅ Model handles MAX_CTX (${MAX_CTX.toLocaleString()}) without failure!\n`);
    low = MAX_CTX;
    high = MAX_CTX + PRECISION;
  }

  // ── Phase 4: Binary search ──
  if (high > low && high - low > PRECISION) {
    console.log(`\n▶  Phase 4: Binary search between ${low.toLocaleString()} and ${high.toLocaleString()} (precision: ${PRECISION.toLocaleString()})...`);

    while (high - low > PRECISION) {
      const mid = Math.floor((low + high) / 2);
      process.stdout.write(`   Testing ${mid.toLocaleString()}... `);
      const r = await testContext(MODEL, mid, false);
      results.push({ ctx: mid, phase: "binary", ...r });

      if (r.status === "pass") {
        console.log(`✅ ${r.generatedTokens}t generated`);
        lastGoodPromptTokens = r.promptTokens;
        low = mid;
      } else {
        console.log(`❌ ${(r.error || '').slice(0, 60)}`);
        high = mid;
      }
    snapshotProgress({ results, low, practicalMax: high, lastGoodPromptTokens, stressPassed: false });
    }
  }

  // ── Phase 5: Stress test at boundary ──
  console.log(`\n▶  Phase 5: Stress test at ${low.toLocaleString()} with ~60k prompt...`);
  stress = await testContext(MODEL, low, true);
  results.push({ ctx: low, phase: "stress", ...stress });
  if (stress.status === "pass") {
    console.log(`   ✅ Passed! ${stress.promptTokens} prompt tokens, ${stress.generatedTokens} gen`);
    lastGoodPromptTokens = stress.promptTokens;
  } else {
    console.log(`   ⚠️  Loads but fails under actual context pressure: ${stress.error.slice(0, 100)}`);
  }

  // Estimate practical max
  practicalMax = stress.status === "pass" ? low : low - PRECISION;
  stressPassed = stress.status === "pass";
  snapshotProgress({ results, low, practicalMax, lastGoodPromptTokens, stressPassed, stress, recommendedPredict });

  // ── Phase 6: Max output length (num_predict) ──
  // Tests at the model's actual max context so output isn't capped
  // by a small window. No timeouts — user prefers accuracy over speed.
  // Each level tests whether the model produces its full token count.
  const testCtx = Math.max(practicalMax, MIN_CTX);
  const predictLevels = [4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576];
  const maxTimeout = 0; // no timeout — let each test run as long as it needs
  console.log(`\n▶  Phase 6: Max output (num_predict) at ${testCtx.toLocaleString()} context (no timeouts)...`);
  for (const predict of predictLevels) {
    // Skip predict levels that exceed the context window
    if (predict >= testCtx) {
      console.log(`   ⏭️  Skipping num_predict=${predict.toLocaleString()} (exceeds ${testCtx.toLocaleString()} context)`);
      break;
    }
    process.stdout.write(`   Testing num_predict=${predict.toLocaleString()}... `);
    const r = await testOutputLength(MODEL, testCtx, predict, maxTimeout);
    results.push({ ctx: testCtx, phase: "output", predict, ...r, status: r.ok ? "pass" : "fail" });
    if (r.ok) {
      const capNote = r.hitCap ? "" : " (stopped early)";
      console.log(`✅ ${r.generatedTokens}t${capNote}`);
      if (r.hitCap) recommendedPredict = predict;
    } else {
      console.log(`❌ ${r.error.slice(0, 60)}`);
    }
    snapshotProgress({ results, low, practicalMax, lastGoodPromptTokens, stressPassed, stress, recommendedPredict });
  }

  // ── Phase 7: Needle-in-a-haystack (attention test) ──
  // Tests whether the model actually ATTENDS to content at different positions
  // in a long context, not just whether the context loads. A model can "process"
  // 256K tokens and still completely ignore the middle 50%.
  if (stressPassed) {
    const positions = [0.0, 0.25, 0.5, 0.75, 0.9];
    console.log(`\n▶  Phase 7: Needle-in-haystack at ${practicalMax.toLocaleString()} context...`);
    for (const pos of positions) {
      process.stdout.write(`   Needle at ${(pos * 100).toFixed(0).padStart(2)}%... `);
      const r = await testNih(MODEL, practicalMax, pos, 180);
      if (r.ok) {
        nihResults.push({ position: pos, passed: r.passed, response: r.response, generatedTokens: r.generatedTokens });
        console.log(r.passed ? `✅ Recalled` : `❌ Missed: "${r.response.slice(0, 60).replace(/\n/g, " ")}"`);
      } else {
        nihResults.push({ position: pos, passed: false, error: r.error });
        console.log(`❌ ${r.error.slice(0, 60)}`);
      }
      snapshotProgress({ results, low, practicalMax, lastGoodPromptTokens, stressPassed, stress, recommendedPredict, nihResults });
    }
    const passed = nihResults.filter(r => r.passed).length;
    console.log(`   Summary: ${passed}/${nihResults.length} positions recalled the needle`);
  }

  // ── Summary ──
  console.log("\n" + "═".repeat(60));
  console.log("  BENCHMARK RESULTS");
  console.log("═".repeat(60));
  console.log(`  Model:               ${MODEL}`);
  console.log(`  Loads OK up to:      ${low.toLocaleString()} context`);
  console.log(`  Stress test:         ${stressPassed ? "✅ Passed" : "⚠️  Failed"} @ ${practicalMax.toLocaleString()}`);
  console.log(`  Max num_predict:     ${recommendedPredict.toLocaleString()} tokens`);
  if (nihResults.length > 0) {
    const passed = nihResults.filter(r => r.passed).length;
    const heatmap = nihResults.map(r => `${(r.position * 100).toFixed(0)}%:${r.passed ? "✅" : "❌"}`).join("  ");
    console.log(`  NIH attention:       ${passed}/${nihResults.length} positions`);
    console.log(`                      ${heatmap}`);
  }
  console.log(`  Host:                ${HOST}:${PORT}`);

  console.log("\n  Round-by-round:");
  for (const r of results) {
    const icon = r.status === "pass" ? "✅" : "❌";
    const detail = r.phase === "output"
      ? `num_predict=${r.predict} → ${r.generatedTokens}t`
      : r.status === "pass" ? `${r.generatedTokens}t generated` : r.error?.slice(0, 40) || "fail";
    const label = r.phase === "output" ? `predict ${r.predict}` : r.ctx.toLocaleString();
    console.log(`    ${icon} ${label.padStart(20)}  ${detail}`);
  }
  console.log("═".repeat(60));

  // ── Recommendation ──
  console.log(`\n  💡 Recommended profile:`);
  console.log(`     num_ctx     = ${practicalMax.toLocaleString()}`);
  console.log(`     num_predict = ${recommendedPredict.toLocaleString()}`);

  // ── Persist to DB ──
  if (SAVE) {
    if (INFLIGHT_ID) {
      // Update the in-flight row with final state — same row becomes the result
      snapshotProgress({ results, low, practicalMax, lastGoodPromptTokens, stressPassed, stress, recommendedPredict, finalState: true });
      console.log(`   💾 Updated in-flight row (id=${INFLIGHT_ID}) to final state`);
    } else {
      // Manual CLI run (no in-flight row) — insert a new row
      try {
        const conn = new Database(DB_PATH);
        // Ensure new columns exist
        try { conn.prepare("ALTER TABLE benchmark_results ADD COLUMN recommended_num_predict INTEGER").run(); } catch {}
        const roundData = results.map(r => ({
          ctx: r.ctx,
          p: r.phase,
          predict: r.predict ?? null,
          ok: r.status === "pass" ? 1 : 0,
          pt: r.promptTokens ?? null,
          gt: r.generatedTokens ?? null,
          e: r.status !== "pass" ? (r.error || "").slice(0, 60) : null,
        }));
        const allRounds = roundData;
        const result = conn.prepare(`
          INSERT INTO benchmark_results
            (model, max_ctx_load, max_ctx_stress, stress_passed, prompt_tokens, host, rounds_json, recommended_num_predict, nih_results)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          MODEL,
          low,
          practicalMax,
          stressPassed ? 1 : 0,
          stressPassed ? (stress.promptTokens ?? null) : (lastGoodPromptTokens ?? null),
          `${HOST}:${PORT}`,
          JSON.stringify(allRounds),
          recommendedPredict,
          nihResults && nihResults.length > 0 ? JSON.stringify(nihResults) : null,
        );
        conn.close();
        console.log(`   💾 Saved to ${DB_PATH} (id=${result.lastInsertRowid})`);
      } catch (err) {
        console.error(`   ❌ Failed to save: ${err.message}`);
      }
    }
  }
  if (_db) { try { _db.close(); } catch {} }
}

main().catch(console.error);

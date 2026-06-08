// Quick benchmark with fastest model
async function testModel(model, ctx, prompt, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { num_ctx: ctx, temperature: 0.1 },
      }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (data.error) return { success: false, error: data.error.substring(0, 100), duration: Date.now() - start };
    return {
      success: true,
      response: data.response,
      tokens: data.eval_count || 0,
      evalDuration: data.eval_duration || 0,
      promptEvalDuration: data.prompt_eval_duration || 0,
      duration: Date.now() - start,
    };
  } catch (e) {
    return { success: false, error: e.message, duration: Date.now() - start };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const model = "qwen3.5:0.8b"; // Fastest available
  console.log(`=== Benchmark: ${model} ===\n`);

  // 1. Basic test (1K context, short prompt)
  console.log("1. Basic 1K test...");
  const r1 = await testModel(model, 1024, "Say 'hello' and stop.", 60000);
  if (r1.success) {
    const tps = r1.tokens / (r1.evalDuration / 1e9);
    console.log(`   ${tps.toFixed(2)} tok/s (${r1.tokens} tokens, ${r1.duration}ms total)`);
    console.log(`   Response: ${r1.response?.substring(0, 80).replace(/\n/g, ' ')}`);
  } else {
    console.log(`   FAIL: ${r1.error}`);
  }
  console.log("");

  // 2. Context window test (binary search)
  console.log("2. Context window test...");
  const sizes = [2048, 8192, 16384, 32768, 65536, 131072];
  let maxWorking = 0;
  for (const size of sizes) {
    process.stdout.write(`   ${size.toLocaleString()}... `);
    const filler = "word ".repeat(Math.floor(size / 2));
    const result = await testModel(model, size, filler, 60000);
    if (result.success) {
      console.log(`OK (${result.duration}ms)`);
      maxWorking = size;
    } else {
      console.log(`FAIL (${result.error.substring(0, 60)})`);
      break;
    }
  }
  console.log(`   Max working: ${maxWorking.toLocaleString()}\n`);

  // 3. Throughput at different contexts
  console.log("3. Throughput by context size...");
  for (const ctx of [1024, 4096, 16384, 32768, 65536]) {
    if (ctx > maxWorking && maxWorking > 0) {
      console.log(`   ${ctx.toLocaleString()} ctx: SKIPPED`);
      continue;
    }
    const filler = "Lorem ipsum dolor sit amet consectetur. ".repeat(Math.floor(ctx / 8));
    process.stdout.write(`   ${ctx.toLocaleString()} ctx... `);
    const result = await testModel(model, ctx, filler + " Write one sentence.", 60000);
    if (result.success && result.evalDuration > 0) {
      const tps = result.tokens / (result.evalDuration / 1e9);
      const firstTokenMs = result.promptEvalDuration / 1e6;
      console.log(`${tps.toFixed(2)} tok/s (${result.tokens} out, ${firstTokenMs.toFixed(0)}ms first token)`);
    } else {
      console.log(`FAIL: ${result.error}`);
    }
  }
  console.log("");

  // 4. Memory: needle in haystack
  if (maxWorking >= 8192) {
    console.log("4. Needle in haystack (50% depth)...");
    const needle = "The code is ALPHA-7749-BLUE.";
    const haystack = "The sun rose over the mountains. ".repeat(Math.floor(maxWorking / 10));
    const mid = Math.floor(haystack.length / 2);
    const contextText = haystack.slice(0, mid) + " " + needle + " " + haystack.slice(mid);
    const prompt = contextText + "\n\nQuestion: What is the code? Answer in 5 words.";

    const result = await testModel(model, maxWorking, prompt, 60000);
    if (result.success) {
      const upper = result.response?.toUpperCase() || "";
      const hasNeedle = upper.includes("ALPHA") || upper.includes("7749") || upper.includes("BLUE");
      console.log(`   ${hasNeedle ? "✓ FOUND" : "✗ MISSED"} (${result.duration}ms)`);
      console.log(`   Response: ${result.response?.substring(0, 150).replace(/\n/g, ' ')}`);
    } else {
      console.log(`   FAIL: ${result.error}`);
    }
  } else {
    console.log("4. Needle test: SKIPPED (context too small)");
  }

  console.log("\n=== COMPLETE ===");
}

main().catch(e => { console.error("Error:", e); process.exit(1); });
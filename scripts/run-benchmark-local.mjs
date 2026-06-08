// Test with localhost (the working Ollama)
const host = 'localhost';
const port = '11434';
const baseUrl = `http://${host}:${port}`;
const model = 'qwen3.5:4b';

console.log(`Benchmark target: ${baseUrl}`);
console.log(`Model: ${model}\n`);

async function fetchJSON(path, body, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function testGenerate(prompt, ctx, timeoutMs) {
  const start = Date.now();
  try {
    const data = await fetchJSON('/api/generate', {
      model,
      prompt,
      stream: false,
      options: { num_ctx: ctx, temperature: 0.1 },
    }, timeoutMs);
    if (data.error) return { success: false, error: data.error, duration: Date.now() - start };
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
  }
}

async function main() {
  console.log('1. Basic generation (1K context)...');
  const r1 = await testGenerate("Say 'test'", 1024, 120000);
  if (r1.success) {
    const tps = r1.tokens / (r1.evalDuration / 1e9);
    console.log(`   ${tps.toFixed(2)} tok/s (${r1.tokens} tokens, ${r1.duration}ms)`);
    console.log(`   Response: ${r1.response?.substring(0, 60).replace(/\n/g, ' ')}`);
  } else {
    console.log(`   FAIL: ${r1.error}`);
  }
  console.log('');

  console.log('2. Context window test (binary search)...');
  const sizes = [2048, 4096, 8192, 16384, 32768];
  let maxWorking = 0;
  for (const size of sizes) {
    const filler = "word ".repeat(Math.floor(size / 2));
    process.stdout.write(`   ${size.toString().padStart(6)}... `);
    const result = await testGenerate(filler, size, 120000);
    if (result.success) {
      console.log(`OK (${result.duration}ms)`);
      maxWorking = size;
    } else {
      console.log(`FAIL`);
      break;
    }
  }
  console.log(`   Max working: ${maxWorking.toLocaleString()}\n`);

  console.log('3. Throughput tests...');
  for (const ctx of [1024, 4096, 8192, 16384, 32768]) {
    if (ctx > maxWorking && maxWorking > 0) {
      console.log(`   ${ctx.toString().padStart(6)} ctx: SKIPPED`);
      continue;
    }
    const filler = "Lorem ipsum dolor sit amet. ".repeat(Math.floor(ctx / 8));
    process.stdout.write(`   ${ctx.toString().padStart(6)} ctx... `);
    const result = await testGenerate(filler + " Write one sentence.", ctx, 90000);
    if (result.success && result.evalDuration > 0) {
      const tps = result.tokens / (result.evalDuration / 1e9);
      const firstMs = result.promptEvalDuration / 1e6;
      console.log(`${tps.toFixed(2).padStart(7)} tok/s (${result.tokens} out, ${firstMs.toFixed(0).padStart(5)}ms first)`);
    } else {
      console.log(`FAIL: ${result.error?.substring(0, 50)}`);
    }
  }
  console.log('');

  if (maxWorking >= 4096) {
    console.log('4. Memory retention (needle at 50%)...');
    const needle = "The code is ALPHA-7749-BLUE.";
    const haystack = "The sun rose over the mountains. ".repeat(Math.floor(maxWorking / 8));
    const mid = Math.floor(haystack.length / 2);
    const contextText = haystack.slice(0, mid) + " " + needle + " " + haystack.slice(mid);
    const prompt = contextText + "\n\nWhat is the code?";

    const result = await testGenerate(prompt, maxWorking, 120000);
    if (result.success) {
      const resp = result.response?.toUpperCase() || "";
      const found = resp.includes("ALPHA") && (resp.includes("7749") || resp.includes("BLUE"));
      console.log(`   ${found ? '✓ FOUND' : '✗ MISSED'} (${result.duration}ms)`);
      console.log(`   Response: ${result.response?.substring(0, 200).replace(/\n/g, ' ')}`);
    } else {
      console.log(`   FAIL`);
    }
  }

  console.log('\n=== COMPLETE ===');
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
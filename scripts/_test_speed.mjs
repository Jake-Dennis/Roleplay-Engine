// Test with a smaller/faster model
async function testGenerate(prompt, ctx, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: prompt.model,
        prompt: prompt.text,
        stream: false,
        options: { num_ctx: ctx, temperature: 0.1 },
      }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (data.error) return { success: false, error: data.error.substring(0, 100) };
    return {
      success: true,
      response: data.response,
      tokens: data.eval_count,
      evalDuration: data.eval_duration,
      duration: Date.now() - start,
    };
  } catch (e) {
    return { success: false, error: e.message, duration: Date.now() - start };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log("Testing different models for speed...\n");
  const models = [
    "qwen3.5:0.8b",
    "qwen3.5:4b",
    "gemma3:4b",
  ];

  for (const model of models) {
    process.stdout.write(`${model}... `);
    const result = await testGenerate(
      { model, text: "Say 'ok'" },
      1024,
      120000
    );
    if (result.success) {
      const tokPerSec = result.tokens / (result.evalDuration / 1e9);
      console.log(`${tokPerSec.toFixed(2)} tok/s (${result.duration}ms, ${result.tokens} tokens)`);
    } else {
      console.log(`FAIL - ${result.error}`);
    }
  }
}

main().catch(e => { console.error("Error:", e); process.exit(1); });
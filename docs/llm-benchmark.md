# LLM Hardware Benchmark & Auto-Tune

## Overview
Automatically detect your hardware (GPU VRAM, RAM, CPU), measure your model's actual context window limit, token throughput, and roleplay memory retention — then auto-configure optimal `numCtx` settings.

## Quick Start
1. Open Settings → Ollama → click "Run Benchmark"
2. Or from CLI: `npm run benchmark -- --model qwen3.5:4b --quick`
3. Wait 1-5 minutes (quick mode ~60s, full ~5min)
4. Review results and click "Apply Auto-tune"

## What It Measures

### 1. Hardware Detection
- GPU VRAM (NVIDIA via nvidia-smi)
- System RAM
- CPU cores/threads
- Running Ollama models

### 2. Context Window Test (Binary Search)
- Tests increasing `num_ctx` until OOM
- Finds maximum working context within ±10%
- Reports: max context, tested sizes, OOM boundary

### 3. Token Throughput
- Generation tokens/sec at 1K/4K/16K/32K/64K/128K contexts
- Embedding tokens/sec
- First token latency

### 4. Memory Retention (Roleplay-Specific)
- **Needle-in-haystack**: Retrieve injected fact at 25%/50%/75% depth
- **Multi-turn consistency**: Entity/fact consistency over 10 turns
- **Summarization fidelity**: Key fact preservation at 10:1 compression

## Understanding Results

### Overall Score (0-100)
Weighted: Context (20%) + Throughput (30%) + Memory (50%)

### Recommended numCtx
Calculated from:
- VRAM limit (model params + KV cache, 80% safety margin)
- Benchmark ceiling (max working context)
- Model default × 4 cap

### Applying Auto-tune
Click "Apply" in Settings → Ollama to set the recommended `numCtx`

## CLI Usage
```bash
# Quick benchmark
npm run benchmark -- --model qwen3.5:4b --quick

# Full benchmark with custom contexts
npm run benchmark -- --model llama3:70b --context-sizes 1024,4096,16384,32768,65536,131072

# Hardware detection only
npm run benchmark -- --detect-only

# Model metadata only
npm run benchmark -- --meta-only --model qwen3.5:4b

# JSON output for CI
npm run benchmark -- --model qwen3.5:4b --json > report.json
```

## Interpreting Scores
| Score | Meaning |
|-------|---------|
| 80-100 | Excellent — model handles roleplay well at recommended context |
| 60-79 | Good — minor memory drift at long contexts |
| 40-59 | Fair — consider smaller context or more VRAM |
| <40 | Poor — model struggles with context retention |

## Troubleshooting
- **OOM on first test**: Model too large for GPU — use smaller model or CPU offload
- **Low throughput**: Check GPU utilization, Ollama not using GPU
- **Memory scores low**: Model may not suit long-context roleplay
- **Benchmark hangs**: Increase timeout, check Ollama logs

## Advanced
- Reports saved to `data/{userId}/benchmarks/`
- API: POST/GET `/api/benchmark`, GET/DELETE `/api/benchmark/[jobId]`
- Programmatic: import `runBenchmark` from `@/lib/benchmark/orchestrator`
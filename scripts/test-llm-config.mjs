// Test which Ollama the benchmark connects to
import http from 'http';

const host = process.env.OLLAMA_HOST || '192.168.4.2';
const port = process.env.OLLAMA_PORT || '11434';

console.log(`OLLAMA_HOST env: ${process.env.OLLAMA_HOST || '(not set, defaults to 192.168.4.2)'}`);
console.log(`OLLAMA_PORT env: ${process.env.OLLAMA_PORT || '(not set, defaults to 11434)'}`);
console.log(`Benchmark will connect to: http://${host}:${port}`);
console.log('');

// Test connection
const url = `http://${host}:${port}/api/tags`;
const start = Date.now();

http.get(url, { timeout: 10000 }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const duration = Date.now() - start;
    try {
      const parsed = JSON.parse(data);
      const models = parsed.models || [];
      console.log(`✓ Connected in ${duration}ms`);
      console.log(`✓ ${models.length} models available:`);
      for (const m of models.slice(0, 10)) {
        const params = m.details?.parameter_size || '?';
        const ctx = m.details?.context_length || '?';
        const quant = m.details?.quantization_level || '?';
        console.log(`   - ${m.name} (${params}, ctx=${ctx}, ${quant})`);
      }
      if (models.length > 10) console.log(`   ... and ${models.length - 10} more`);
    } catch (e) {
      console.log(`✗ Invalid response: ${data.substring(0, 200)}`);
    }
  });
}).on('error', (e) => {
  console.log(`✗ Connection failed: ${e.message}`);
}).on('timeout', () => {
  console.log(`✗ Timeout after 10s`);
  process.exit(1);
});
// tools/test_ollama.js
// Run: node tools/test_ollama.js
// Tests that Ollama is running and the codellama model is available.

const http = require('http');

const OLLAMA_HOST = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.MODEL || 'codellama';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      })
      .on('error', reject);
  });
}

function httpPost(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 11434,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log('\n🔍 LLM Eval SDET — Ollama Connectivity Test\n');
  console.log(`  Ollama URL : ${OLLAMA_HOST}`);
  console.log(`  Model      : ${MODEL}\n`);

  // 1. Ping Ollama
  try {
    const ping = await httpGet(OLLAMA_HOST);
    console.log('✅ [1/3] Ollama is reachable');
  } catch (err) {
    console.error('❌ [1/3] Ollama is NOT reachable:', err.message);
    console.error('   → Make sure Ollama is running: `ollama serve`');
    process.exit(1);
  }

  // 2. List models
  try {
    const { body } = await httpGet(`${OLLAMA_HOST}/api/tags`);
    const models = (body.models || []).map((m) => m.name);
    console.log(`✅ [2/3] Available models: ${models.join(', ') || '(none)'}`);
    if (!models.includes(MODEL) && !models.some((m) => m.startsWith(MODEL))) {
      console.warn(`⚠️  Model "${MODEL}" not found. Pull it with: ollama pull ${MODEL}`);
    }
  } catch (err) {
    console.error('❌ [2/3] Failed to list models:', err.message);
  }

  // 3. Quick inference test
  console.log(`\n⏳ [3/3] Running quick inference with ${MODEL}...`);
  const testCode = `driver.findElement(By.id("username")).sendKeys("admin");`;
  try {
    const start = Date.now();
    const { body } = await httpPost(`${OLLAMA_HOST}/api/generate`, {
      model: MODEL,
      prompt: `Convert this Selenium Java line to Playwright TypeScript (one line only, no explanation):\n${testCode}`,
      stream: false,
      options: { temperature: 0.1, num_predict: 100 },
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ [3/3] Inference OK (${elapsed}s)`);
    console.log(`\n   Input  : ${testCode}`);
    console.log(`   Output : ${(body.response || '').trim()}\n`);
  } catch (err) {
    console.error('❌ [3/3] Inference failed:', err.message);
  }

  console.log('🎉 All checks complete!\n');
}

runTests().catch(console.error);

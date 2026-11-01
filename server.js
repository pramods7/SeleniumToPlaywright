const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const response = await axios.get(OLLAMA_URL, { timeout: 5000 });
    res.json({ status: 'ok', ollama: 'connected', message: String(response.data) });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      ollama: 'unreachable',
      message: error.message,
      hint: `Make sure Ollama is running at ${OLLAMA_URL}`,
    });
  }
});

// ─── List Available Ollama Models ────────────────────────────────────────────
app.get('/api/models', async (req, res) => {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    const models = (response.data.models || []).map((m) => m.name);
    res.json({ models });
  } catch (error) {
    res.status(503).json({ error: 'Unable to fetch models', message: error.message });
  }
});

// ─── Convert Selenium Java → Playwright TypeScript ───────────────────────────
app.post('/api/convert', async (req, res) => {
  const { inputCode, model, language } = req.body;

  if (!inputCode || !inputCode.trim()) {
    return res.status(400).json({ error: 'inputCode is required and cannot be empty.' });
  }

  const targetModel = model || 'codellama';
  const targetLang = language || 'typescript'; // typescript | javascript | python

  const langMap = {
    typescript: 'Playwright TypeScript',
    javascript: 'Playwright JavaScript',
    python: 'Playwright Python',
  };
  const targetDescription = langMap[targetLang] || 'Playwright TypeScript';

  const systemPrompt = `You are an expert QA automation engineer specializing in migrating legacy Selenium WebDriver tests to modern Playwright. Your task is to convert the provided Selenium Java code into clean, idiomatic ${targetDescription}.

Rules:
1. Translate ALL driver.findElement() calls to page.locator() or appropriate Playwright locators.
2. Replace implicit/explicit waits with Playwright's built-in auto-waiting. Remove all Thread.sleep().
3. Convert TestNG @Test, @BeforeMethod, @AfterMethod annotations to Playwright test() hooks.
4. Replace Selenium assertions (assertEquals, assertTrue) with Playwright expect() assertions.
5. Remove WebDriver imports; use Playwright imports instead.
6. Handle file uploads, alerts, iframes, and shadow DOM with Playwright equivalents.
7. Add meaningful comments explaining non-obvious migration decisions.
8. Output ONLY the converted code — no explanations, no markdown fences, no extra text.`;

  const userPrompt = `Convert this Selenium Java code to ${targetDescription}:\n\n${inputCode}`;

  try {
    const ollamaResponse = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: targetModel,
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 4096,
        },
      },
      { timeout: 300000 }
    );

    const convertedCode = (ollamaResponse.data.response || '').trim();

    res.json({
      success: true,
      convertedCode,
      model: targetModel,
      language: targetLang,
      stats: {
        inputLines: inputCode.split('\n').length,
        outputLines: convertedCode.split('\n').length,
        processingTime: ollamaResponse.data.total_duration
          ? `${(ollamaResponse.data.total_duration / 1e9).toFixed(2)}s`
          : 'N/A',
      },
    });
  } catch (error) {
    console.error('[Convert Error]', error.message);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Ollama is not running.',
        hint: `Start Ollama and ensure it is accessible at ${OLLAMA_URL}`,
      });
    }

    res.status(500).json({ error: 'Conversion failed', message: error.message });
  }
});

// ─── Explain Code (bonus endpoint) ───────────────────────────────────────────
app.post('/api/explain', async (req, res) => {
  const { code, model } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required.' });

  const targetModel = model || 'codellama';
  const prompt = `Explain the following Selenium Java test code clearly and concisely. Focus on what it tests, how it works, and any potential issues:\n\n${code}`;

  try {
    const ollamaResponse = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      { model: targetModel, prompt, stream: false, options: { temperature: 0.3 } },
      { timeout: 120000 }
    );
    res.json({ success: true, explanation: (ollamaResponse.data.response || '').trim() });
  } catch (error) {
    res.status(500).json({ error: 'Explanation failed', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 LLM Eval SDET Server running on http://localhost:${PORT}`);
  console.log(`🤖 Ollama endpoint: ${OLLAMA_URL}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health        - Check Ollama connectivity`);
  console.log(`  GET  /api/models    - List available Ollama models`);
  console.log(`  POST /api/convert   - Convert Selenium Java → Playwright`);
  console.log(`  POST /api/explain   - Explain Selenium test code\n`);
});

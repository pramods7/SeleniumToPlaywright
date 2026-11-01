import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap, CheckCircle, XCircle, Copy, Download, Trash2, RefreshCw,
  Code2, Cpu, Globe, AlertTriangle, ChevronDown, Play,
  BookOpen, Layers, BarChart3, ArrowRight,
} from 'lucide-react';
import './App.css';

// ─── Types ───────────────────────────────────────────────────────────────────
interface OllamaStatus {
  status: 'checking' | 'ok' | 'error';
  message?: string;
}

interface ConversionStats {
  inputLines: number;
  outputLines: number;
  processingTime: string;
}

interface ConversionResult {
  convertedCode: string;
  model: string;
  language: string;
  stats: ConversionStats;
}

type Language = 'typescript' | 'javascript' | 'python';

const SAMPLE_SELENIUM_CODE = `import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;
import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

public class LoginTest {
    private WebDriver driver;

    @BeforeMethod
    public void setUp() {
        System.setProperty("webdriver.chrome.driver", "/path/to/chromedriver");
        driver = new ChromeDriver();
        driver.manage().window().maximize();
        driver.get("https://example.com/login");
    }

    @Test
    public void testSuccessfulLogin() throws InterruptedException {
        WebElement username = driver.findElement(By.id("username"));
        username.clear();
        username.sendKeys("admin@example.com");

        WebElement password = driver.findElement(By.name("password"));
        password.sendKeys("securePassword123");

        Thread.sleep(1000);

        WebElement loginBtn = driver.findElement(By.xpath("//button[@type='submit']"));
        loginBtn.click();

        Thread.sleep(2000);

        WebElement dashboard = driver.findElement(By.cssSelector(".dashboard-header"));
        assertTrue(dashboard.isDisplayed(), "Dashboard should be visible");
        assertEquals(driver.getTitle(), "Dashboard - Example App");
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }
}`;

const LANG_OPTIONS: { value: Language; label: string; ext: string }[] = [
  { value: 'typescript', label: 'TypeScript', ext: 'ts' },
  { value: 'javascript', label: 'JavaScript', ext: 'js' },
  { value: 'python',     label: 'Python',     ext: 'py' },
];

const API_BASE = '';  // Vite proxy handles /api → localhost:3001

// ─── App Component ────────────────────────────────────────────────────────────
export default function App() {
  const [inputCode, setInputCode]       = useState(SAMPLE_SELENIUM_CODE);
  const [outputCode, setOutputCode]     = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanation, setExplanation]   = useState('');
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({ status: 'checking' });
  const [models, setModels]             = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('codellama');
  const [selectedLang, setSelectedLang] = useState<Language>('typescript');
  const [result, setResult]             = useState<ConversionResult | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);
  const [activeTab, setActiveTab]       = useState<'convert' | 'explain'>('convert');
  const abortRef = useRef<AbortController | null>(null);

  // ─── Check Ollama Health ──────────────────────────────────────────────────
  const checkHealth = useCallback(async () => {
    setOllamaStatus({ status: 'checking' });
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (data.status === 'ok') {
        setOllamaStatus({ status: 'ok' });
      } else {
        setOllamaStatus({ status: 'error', message: data.message || 'Ollama unreachable' });
      }
    } catch {
      setOllamaStatus({ status: 'error', message: 'Server unreachable. Is the backend running?' });
    }
  }, []);

  // ─── Fetch Available Models ───────────────────────────────────────────────
  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/models`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        if (data.models?.length) {
          setModels(data.models);
          if (!data.models.includes(selectedModel)) setSelectedModel(data.models[0]);
        }
      }
    } catch {
      // silently fail — user can type model name manually
    }
  }, [selectedModel]);

  useEffect(() => {
    checkHealth();
    fetchModels();
  }, [checkHealth, fetchModels]);

  // ─── Convert ─────────────────────────────────────────────────────────────
  const handleConvert = async () => {
    if (!inputCode.trim()) return;
    setIsConverting(true);
    setError(null);
    setOutputCode('');
    setResult(null);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${API_BASE}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputCode, model: selectedModel, language: selectedLang }),
        signal: abortRef.current.signal,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || `Server error ${res.status}`);
      }

      setOutputCode(data.convertedCode);
      setResult(data);
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message || 'Conversion failed');
    } finally {
      setIsConverting(false);
    }
  };

  // ─── Explain ─────────────────────────────────────────────────────────────
  const handleExplain = async () => {
    if (!inputCode.trim()) return;
    setIsExplaining(true);
    setExplanation('');
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inputCode, model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Explanation failed');
      setExplanation(data.explanation);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsExplaining(false);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const handleCopy = () => {
    navigator.clipboard.writeText(outputCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const langInfo = LANG_OPTIONS.find(l => l.value === selectedLang)!;
    const blob = new Blob([outputCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `converted_test.${langInfo.ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsConverting(false);
  };

  // ─── Status UI helpers ────────────────────────────────────────────────────
  const statusBadge = () => {
    switch (ollamaStatus.status) {
      case 'checking': return (
        <span className="badge badge-warning">
          <span className="spinner spinner-sm" /> Checking…
        </span>
      );
      case 'ok': return (
        <span className="badge badge-success">
          <span className="pulse-dot pulse-dot-green" /> Ollama Connected
        </span>
      );
      case 'error': return (
        <span className="badge badge-error" data-tooltip={ollamaStatus.message}>
          <span className="pulse-dot pulse-dot-red" /> Ollama Offline
        </span>
      );
    }
  };

  const langInfo = LANG_OPTIONS.find(l => l.value === selectedLang)!;

  return (
    <div className="app-layout">
      {/* ─── Header ────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <div className="brand-icon">
              <Zap size={22} />
            </div>
            <div>
              <h1 className="brand-title">LLM Eval SDET</h1>
              <p className="brand-subtitle">Selenium → Playwright AI Converter</p>
            </div>
          </div>

          <div className="header-controls">
            {statusBadge()}
            <button className="btn btn-ghost btn-sm btn-icon" onClick={checkHealth} data-tooltip="Refresh Ollama status">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ─── Hero Strip ────────────────────────────────────────────────── */}
      <div className="hero-strip animate-fade-in-up">
        <div className="hero-content">
          <div className="hero-badge">
            <Cpu size={12} />
            100% Local · Privacy-First · No API Keys
          </div>
          <h2 className="hero-title">
            Migrate Legacy Tests <span className="gradient-text">Instantly</span>
          </h2>
          <p className="hero-desc">
            Paste your Selenium Java code and let a local LLM (Ollama + CodeLlama) convert it to
            Playwright — entirely on your machine. Your code never leaves your network.
          </p>
        </div>

        <div className="hero-stats stagger-children">
          {[
            { icon: <Code2 size={18} />, label: 'Selenium Java', desc: 'Input format' },
            { icon: <ArrowRight size={18} />, label: 'Local LLM', desc: 'Ollama + CodeLlama' },
            { icon: <Globe size={18} />, label: 'Playwright', desc: 'TS · JS · Python' },
          ].map((item, i) => (
            <div key={i} className="hero-stat glass-card animate-fade-in-up">
              <div className="hero-stat-icon">{item.icon}</div>
              <div>
                <div className="hero-stat-label">{item.label}</div>
                <div className="hero-stat-desc">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Main Tool Area ────────────────────────────────────────────── */}
      <main className="tool-area">
        {/* Controls Bar */}
        <div className="controls-bar glass-card">
          <div className="controls-left">
            <div className="control-group">
              <label className="control-label">
                <Cpu size={12} /> Model
              </label>
              {models.length > 0 ? (
                <select
                  className="select"
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  id="model-select"
                >
                  {models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="select"
                  style={{ paddingRight: 12 }}
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  placeholder="e.g. codellama"
                  id="model-input"
                />
              )}
            </div>

            <div className="control-group">
              <label className="control-label">
                <Code2 size={12} /> Target Language
              </label>
              <div className="lang-tabs">
                {LANG_OPTIONS.map(lang => (
                  <button
                    key={lang.value}
                    className={`lang-tab ${selectedLang === lang.value ? 'active' : ''}`}
                    onClick={() => setSelectedLang(lang.value)}
                    id={`lang-${lang.value}`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="controls-right">
            <div className="tab-switcher">
              <button
                className={`tab-btn ${activeTab === 'convert' ? 'active' : ''}`}
                onClick={() => setActiveTab('convert')}
                id="tab-convert"
              >
                <Layers size={13} /> Convert
              </button>
              <button
                className={`tab-btn ${activeTab === 'explain' ? 'active' : ''}`}
                onClick={() => setActiveTab('explain')}
                id="tab-explain"
              >
                <BookOpen size={13} /> Explain
              </button>
            </div>
          </div>
        </div>

        {/* Editor Panels */}
        <div className="editors-row">
          {/* ── Input Panel ── */}
          <div className="editor-panel glass-card">
            <div className="editor-header">
              <div className="editor-label">
                <span className="lang-dot java" />
                <span>Selenium Java — Input</span>
              </div>
              <div className="editor-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setInputCode(SAMPLE_SELENIUM_CODE)}
                  id="load-sample-btn"
                >
                  Load Sample
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => { setInputCode(''); setOutputCode(''); setResult(null); setError(null); setExplanation(''); }}
                  data-tooltip="Clear all"
                  id="clear-btn"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <div className="editor-body">
              <textarea
                className="code-area"
                value={inputCode}
                onChange={e => setInputCode(e.target.value)}
                placeholder="// Paste your Selenium Java test code here..."
                spellCheck={false}
                id="input-code"
              />
            </div>
            <div className="editor-footer">
              <span className="editor-meta">{inputCode.split('\n').length} lines</span>
            </div>
          </div>

          {/* ── Middle Actions ── */}
          <div className="middle-actions">
            {activeTab === 'convert' ? (
              isConverting ? (
                <button className="btn btn-danger" onClick={handleCancel} id="cancel-btn">
                  <XCircle size={15} /> Cancel
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-lg convert-btn"
                  onClick={handleConvert}
                  disabled={!inputCode.trim() || ollamaStatus.status !== 'ok'}
                  id="convert-btn"
                >
                  {isConverting
                    ? <><span className="spinner spinner-sm" /> Converting…</>
                    : <><Play size={15} /> Convert</>
                  }
                </button>
              )
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleExplain}
                disabled={!inputCode.trim() || isExplaining || ollamaStatus.status !== 'ok'}
                id="explain-btn"
              >
                {isExplaining
                  ? <><span className="spinner spinner-sm" /> Explaining…</>
                  : <><BookOpen size={14} /> Explain</>
                }
              </button>
            )}

            {ollamaStatus.status !== 'ok' && (
              <div className="offline-hint">
                <AlertTriangle size={12} />
                <span>Ollama offline</span>
              </div>
            )}

            {isConverting && (
              <div className="converting-indicator">
                <div className="spinner" />
                <span>Processing…</span>
              </div>
            )}
          </div>

          {/* ── Output Panel ── */}
          <div className="editor-panel glass-card">
            <div className="editor-header">
              <div className="editor-label">
                <span className={`lang-dot ${selectedLang}`} />
                <span>Playwright {langInfo.label} — Output</span>
              </div>
              {outputCode && (
                <div className="editor-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleCopy}
                    id="copy-btn"
                  >
                    {copied ? <><CheckCircle size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleDownload}
                    id="download-btn"
                  >
                    <Download size={12} /> Download
                  </button>
                </div>
              )}
            </div>

            <div className="editor-body">
              {activeTab === 'convert' ? (
                outputCode ? (
                  <pre className="code-output"><code>{outputCode}</code></pre>
                ) : error ? (
                  <div className="output-placeholder error">
                    <XCircle size={32} />
                    <p className="placeholder-title">Conversion Failed</p>
                    <p className="placeholder-msg">{error}</p>
                  </div>
                ) : isConverting ? (
                  <div className="output-placeholder">
                    <div className="spinner spinner-lg" />
                    <p className="placeholder-title">Converting with {selectedModel}…</p>
                    <p className="placeholder-msg">This may take 20–120 seconds on first run.</p>
                  </div>
                ) : (
                  <div className="output-placeholder">
                    <Code2 size={40} />
                    <p className="placeholder-title">Converted code will appear here</p>
                    <p className="placeholder-msg">
                      Click <strong>Convert</strong> to start the AI conversion.
                    </p>
                  </div>
                )
              ) : (
                explanation ? (
                  <div className="explanation-output">
                    <pre className="explanation-text">{explanation}</pre>
                  </div>
                ) : isExplaining ? (
                  <div className="output-placeholder">
                    <div className="spinner spinner-lg" />
                    <p className="placeholder-title">Analyzing code…</p>
                  </div>
                ) : (
                  <div className="output-placeholder">
                    <BookOpen size={40} />
                    <p className="placeholder-title">Code explanation will appear here</p>
                    <p className="placeholder-msg">Click <strong>Explain</strong> to analyze your Selenium code.</p>
                  </div>
                )
              )}
            </div>

            {outputCode && result && (
              <div className="editor-footer stats-footer">
                <div className="stat-chip">
                  <BarChart3 size={11} />
                  <span>{result.stats.inputLines} → {result.stats.outputLines} lines</span>
                </div>
                <div className="stat-chip">
                  <Cpu size={11} />
                  <span>{result.model}</span>
                </div>
                <div className="stat-chip">
                  <Zap size={11} />
                  <span>{result.stats.processingTime}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Tips Section ──────────────────────────────────────────────── */}
        <div className="tips-section glass-card animate-fade-in-up stagger-children">
          <div className="tips-header">
            <ChevronDown size={14} />
            <span>Conversion Reference</span>
          </div>
          <div className="tips-grid">
            {[
              { from: 'driver.findElement(By.id("x"))', to: 'page.locator("#x")', color: 'purple' },
              { from: 'driver.findElement(By.xpath("..."))', to: 'page.locator("xpath=...")', color: 'cyan' },
              { from: 'Thread.sleep(2000)', to: 'await page.waitForTimeout(2000)', color: 'green' },
              { from: 'element.sendKeys("text")', to: 'await locator.fill("text")', color: 'purple' },
              { from: 'element.click()', to: 'await locator.click()', color: 'cyan' },
              { from: '@BeforeMethod setUp()', to: 'test.beforeEach(async ({ page }) => {...})', color: 'green' },
            ].map((tip, i) => (
              <div key={i} className={`tip-item tip-${tip.color}`}>
                <code className="tip-from">{tip.from}</code>
                <ArrowRight size={10} className="tip-arrow" />
                <code className="tip-to">{tip.to}</code>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ─── Footer ────────────────────────────────────────────────────── */}
      <footer className="app-footer">
        <p>
          Built with ❤️ for the <strong>AITesterBlueprint</strong> series ·{' '}
          <a href="https://github.com/PramodDutta/AITesterBlueprint" target="_blank" rel="noreferrer">
            GitHub
          </a>
          {' · '}
          Powered by <a href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a>
        </p>
      </footer>
    </div>
  );
}

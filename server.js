const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

app.get('/', (req, res) => {
  res.render('index');
});

// Render resume HTML for live preview
app.post('/preview', (req, res) => {
  const data = req.body;
  res.render('resume', { data, isPdf: false });
});

// Debug: see raw data received + rendered HTML
app.post('/debug-pdf', (req, res) => {
  const data = req.body;
  console.log('[DEBUG] Received data keys:', Object.keys(data));
  console.log('[DEBUG] fullName:', data.fullName);
  console.log('[DEBUG] experience count:', data.experience ? data.experience.length : 'none');
  res.render('resume', { data, isPdf: true });
});

// Generate ATS-optimized PDF
app.post('/generate-pdf', async (req, res) => {
  // Accept both JSON (curl/old fetch) and form-encoded (new form-submit approach)
  let data = req.body;
  if (req.is('application/x-www-form-urlencoded') && req.body.jsonData) {
    try { data = JSON.parse(req.body.jsonData); } catch (e) { data = {}; }
  }
  console.log('[PDF] Generating for:', data.fullName || '(no name)');

  let browser;
  try {
    // Render HTML from EJS template
    const html = await renderView(res.app, 'resume', { data, isPdf: true });
    console.log('[PDF] HTML rendered, length:', html.length);

    browser = await puppeteer.launch({
      headless: true,  // use classic headless for maximum Windows compatibility
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        '--disable-background-networking',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });

    // Load HTML — use domcontentloaded to avoid network-idle blocking
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    // Give CSS a moment to apply (important for font metrics)
    await new Promise(r => setTimeout(r, 500));

    // Puppeteer v21 returns Uint8Array — convert to Node Buffer so res.send() works correctly
    const pdfBuffer = Buffer.from(await page.pdf({
      format: 'A4',
      printBackground: false,
      margin: { top: '16mm', bottom: '16mm', left: '16mm', right: '16mm' },
    }));

    console.log('[PDF] Generated, bytes:', pdfBuffer.length);

    const name = (data.fullName || 'Resume').replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}_Resume.pdf"`);
    res.send(pdfBuffer);

  } catch (err) {
    console.error('[PDF] Error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

// Helper: promisify res.app.render
function renderView(app, view, locals) {
  return new Promise((resolve, reject) => {
    app.render(view, locals, (err, html) => {
      if (err) reject(err);
      else resolve(html);
    });
  });
}

app.listen(PORT, () => {
  console.log(`\n  Resume Maker running at http://localhost:${PORT}`);
  console.log(`  Debug HTML:  POST http://localhost:${PORT}/debug-pdf\n`);
});

// V4 quotation-finalization Phase 2B — A4 PDF acceptance contract.
//
// Verifies the FINAL DELIVERABLE (real PDF) meets the printable-A4 contract:
//   - PDF page count matches expected
//   - each MediaBox = 595.28 × 841.89 pt (A4 portrait)
//   - each page background rendered (not blank)
//   - fonts + images loaded before the PDF snapshot
//   - deterministic page break between pages
//
// Uses playwright's page.pdf() — the same code path the Print/PDF button
// exercises in the browser.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');

import { existsSync as _exists } from 'node:fs';
const CHROME_CANDIDATES = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].filter(Boolean);
const CHROME_PATH = CHROME_CANDIDATES.find(p => _exists(p)) || undefined; // undefined → playwright's bundled browser
const FIXTURE_URL = pathToFileURL('tests/pdf-a4-fixture.html').href;
// 2026-09-07: repo-relative output (was a machine-specific absolute path).
const OUT_DIR = new URL('./_pdf_out/', import.meta.url).pathname;
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const PDF_PATH = `${OUT_DIR}/quotation-a4-contract.pdf`;

// A4 portrait in PDF points: 210mm/25.4 * 72 = 595.276, 297mm/25.4 * 72 = 841.890
const A4_WIDTH_PT  = 595.276;
const A4_HEIGHT_PT = 841.890;
const PT_TOL = 1.5; // ~0.5mm tolerance

let browser;
let pdfBytes;

before(async () => {
  browser = await chromium.launch({
    executablePath: CHROME_PATH,
    args: ['--disable-web-security', '--allow-file-access-from-files', '--no-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(FIXTURE_URL, { waitUntil: 'networkidle' });
  // Wait for the fixture's ready signal (fonts + images loaded).
  await page.waitForFunction(() => window.__quotationReady === true, null, { timeout: 15000 });
  pdfBytes = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    preferCSSPageSize: true,
  });
  writeFileSync(PDF_PATH, pdfBytes);
  await browser.close();
});

after(async () => { if (browser && browser.isConnected()) await browser.close(); });

test('PDF file was generated and is non-trivial in size', () => {
  assert.ok(existsSync(PDF_PATH), 'PDF file must exist on disk');
  assert.ok(pdfBytes && pdfBytes.length > 4096, `PDF must be > 4KB (got ${pdfBytes.length})`);
});

test('PDF is a valid PDF document', async () => {
  const doc = await PDFDocument.load(pdfBytes);
  assert.ok(doc, 'pdf-lib must parse the generated PDF');
  assert.ok(doc.getPageCount() >= 1, 'PDF must have at least one page');
});

test('PDF page count matches the fixture (Pages 1 + 2 + 3 = 3 pages)', async () => {
  const doc = await PDFDocument.load(pdfBytes);
  // Fixture renders Pages 1, 2 and 3. Contract: each .page → one PDF page.
  assert.equal(doc.getPageCount(), 3,
    'Expected exactly 3 PDF pages for the Page 1 + 2 + 3 fixture; other counts indicate broken page-break contract.');
});

test('every PDF page is A4 portrait — MediaBox = 595.28 × 841.89 pt', async () => {
  const doc = await PDFDocument.load(pdfBytes);
  for (let i = 0; i < doc.getPageCount(); i++) {
    const p = doc.getPage(i);
    const { width, height } = p.getSize();
    assert.ok(Math.abs(width  - A4_WIDTH_PT)  <= PT_TOL,
      `Page ${i+1} width ${width.toFixed(2)}pt must equal A4 ${A4_WIDTH_PT}pt (±${PT_TOL})`);
    assert.ok(Math.abs(height - A4_HEIGHT_PT) <= PT_TOL,
      `Page ${i+1} height ${height.toFixed(2)}pt must equal A4 ${A4_HEIGHT_PT}pt (±${PT_TOL})`);
    assert.ok(height > width, `Page ${i+1} must be portrait (height > width)`);
  }
});

test('PDF pages carry printable background graphics (not blank)', async () => {
  // Content-detection heuristic: a blank multi-page PDF is < 20 KB total; a
  // PDF carrying hero photos + backgrounds is far larger. The Page 1 hero,
  // Page 2 Onam artwork, Page 3 image-only page ensure substantial byte
  // count when backgrounds render.
  assert.ok(pdfBytes.length > 60 * 1024,
    `PDF must carry printable backgrounds — expected > 60 KB, got ${pdfBytes.length} bytes.`);
  const doc = await PDFDocument.load(pdfBytes);
  assert.ok(doc.getPageCount() >= 1, 'PDF must have at least one page');
});

test('PDF file title reflects the fixture (metadata sanity)', async () => {
  const doc = await PDFDocument.load(pdfBytes);
  const title = doc.getTitle() || '';
  // Chrome-headless embeds document.title as the PDF Title — sanity check.
  assert.ok(title.length === 0 || /Flarize|Quotation|PDF|A4/i.test(title),
    `PDF title should be empty or reference the fixture; got: ${JSON.stringify(title)}`);
});

test('PAGE_A4_CONTRACT_STYLES is exported and enforces the physical layer', () => {
  const SRC = readFileSync('public/lib/quotationDocument.js', 'utf8');
  assert.ok(SRC.includes('export const PAGE_A4_CONTRACT_STYLES'),
    'PAGE_A4_CONTRACT_STYLES must be exported for reuse across all pages');
  assert.ok(/@page\s*\{\s*size:\s*A4 portrait/.test(SRC),
    '@page rule must declare A4 portrait');
  assert.ok(/\.page\s*\{[^}]*width:\s*210mm/.test(SRC),
    '.page must be 210mm wide');
  assert.ok(/\.page\s*\{[^}]*height:\s*297mm/.test(SRC),
    '.page must be 297mm tall');
  // After the multi-page pagination fix: .q-canvas is A4-sized in layout and
  // .q-inner carries the 1000×1414 design canvas with the transform-scale.
  assert.ok(/\.q-canvas\s*\{[^}]*width:\s*210mm[^}]*height:\s*297mm/.test(SRC),
    'Shared .q-canvas layout box must be A4-sized (210mm × 297mm) so Chrome print pagination does not clip transformed content');
  assert.ok(/\.q-inner\s*\{[^}]*width:\s*1000px[^}]*height:\s*1414px/.test(SRC),
    'Shared .q-inner must carry the 1000×1414 design canvas');
  // 2026-09-10: Chrome 136 (the server-side PDF renderer) ignores `zoom: calc(210mm/1000px)`
  // and clipped the canvas; the ratio is now the numeric constant 210mm ÷ 1000px
  // = 793.70px ÷ 1000px = 0.79374 (1 CSS px = 1/96 in). Either spelling is accepted.
  const zoomMatch = SRC.replace(/\/\*[\s\S]*?\*\//g, '').match(/\.q-inner\s*\{[^}]*zoom:\s*([^;}]+)/);
  assert.ok(zoomMatch, '.q-inner must CSS-zoom the design canvas into A4 — `transform:scale` clips at multi-page pagination');
  const zoom = zoomMatch[1].trim();
  const numeric = Number(zoom);
  assert.ok(/^calc\(210mm\s*\/\s*1000px\)$/.test(zoom) || (Number.isFinite(numeric) && Math.abs(numeric - (210 / 25.4 * 96) / 1000) < 0.0005),
    `.q-inner zoom must equal 210mm / 1000px (0.79374), got ${zoom}`);
});

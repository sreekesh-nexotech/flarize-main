import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
/**
 * RENDERER / PDF VERIFICATION — takes the latest ISSUED quotation, renders it
 * through the pin-enforced HTTP renderer (approved v1 bundle, integrity-checked),
 * prints it to A4 PDF with Playwright (the same page.pdf path the Print/PDF
 * button uses) and proves the render is reproducible (byte-identical HTML on two
 * calls). Requires at least one ISSUED quotation and an admin login.
 *
 *   E2E_BASE=http://127.0.0.1:4800 E2E_ADMIN_PW=<pw> node tests/e2e/render-pdf-verify.mjs
 */
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4800';
const ADMIN_PW = process.env.E2E_ADMIN_PW || 'TestAdmin2026!';
const OUT = process.env.SHOT_DIR || new URL('./_shots/', import.meta.url).pathname;
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
import { mkdirSync } from 'node:fs'; mkdirSync(OUT, { recursive: true });
const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: ADMIN_PW }) });
const { token } = await login.json();
const list = await (await fetch(BASE + '/api/quotation/quotations', { headers: { Authorization: 'Bearer ' + token } })).json();
const qs = (list.quotations || list || []).filter(q => q.status === 'ISSUED');
const q = qs[qs.length - 1];
const r = await fetch(`${BASE}/api/quotation/quotations/${q.quotationId}/rendered-html`, { headers: { Authorization: 'Bearer ' + token } });
const body = await r.json();
const html = body.html || body.renderedHtml || body.document?.html;
console.log('rendered-html', r.status, 'keys', Object.keys(body).join(','), 'html bytes', html?.length, 'pin', JSON.stringify(body.rendererPinning || body.pinning || {}).slice(0, 160));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
writeFileSync(`${OUT}/quotation-${q.quotationId}.pdf`, pdf);
await page.screenshot({ path: `${OUT}/quotation-page1.png`, fullPage: false });
await browser.close();
const { PDFDocument } = await import('pdf-lib');
const doc = await PDFDocument.load(pdf);
console.log('PDF bytes', pdf.length, 'pages', doc.getPageCount(), 'header', pdf.subarray(0, 5).toString());
// reproducibility: render twice, compare HTML byte-equality
const r2 = await fetch(`${BASE}/api/quotation/quotations/${q.quotationId}/rendered-html`, { headers: { Authorization: 'Bearer ' + token } });
const b2 = await r2.json(); const html2 = b2.html || b2.renderedHtml || b2.document?.html;
console.log('reproducible render (byte-identical HTML across two calls):', html === html2);
process.exit(html === html2 && pdf.subarray(0, 4).toString() === '%PDF' ? 0 : 1);

// P0 UAT blockers — 2026-09-13 regression guards.
//  * static cache policy: code files re-validate, binary assets are immutable
//  * quotation-document.html: no external font CDN; image-ready gate cannot hang
//  * nav.js: global 401 handling present
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('server.js: code files are no-cache, only /assets/ is long-lived', () => {
  const src = readFileSync('server.js', 'utf8');
  assert.ok(src.includes("const CODE_EXT = new Set(['.html', '.js', '.css', '.json', '.map'])"), 'code-extension set');
  assert.ok(src.includes("'Cache-Control': 'no-cache, must-revalidate, max-age=0'"), 'no-cache for code files');
  assert.ok(src.includes("'public, max-age=31536000, immutable'"), 'immutable for /assets/');
  assert.ok(src.includes("res.writeHead(304, headers)"), 'ETag 304 path');
  assert.ok(!/cacheHeader = ext === '\.html' \? .* : 'max-age=31536000'/.test(src), 'old 1-year-for-everything rule is gone');
});

test('quotation-document.html: no Google Fonts, image gate resolves for finished images', () => {
  const html = readFileSync('public/quotation-document.html', 'utf8');
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html), 'no external font CDN');
  assert.ok(html.includes('if (img.complete) return Promise.resolve();'), 'img.complete alone marks the image done');
  assert.ok(!html.includes('img.complete && img.naturalWidth > 0'), 'old hanging check removed');
});

test('server-quotation.js: PDF route reports the page error instead of a bare 501', () => {
  const src = readFileSync('server-quotation.js', 'utf8');
  assert.ok(src.includes("page.on('pageerror'"), 'captures script errors');
  assert.ok(src.includes('Quotation page did not become ready'), 'ready timeout surfaced as PDF_PAGE_ERROR');
});

test('nav.js: one global 401 → login handler, exempt under automation', () => {
  const src = readFileSync('public/lib/nav.js', 'utf8');
  assert.ok(src.includes('window.__flarizeFetchWrapped'), 'fetch wrapper installed once');
  assert.ok(src.includes("location.replace('/login.html?next='"), 'redirects with ?next');
  assert.ok(src.includes('navigator.webdriver'), 'headless PDF / e2e exempt');
  assert.ok(src.includes("fetch('/api/auth/session'"), 'validates cached identity on load');
});

test('login.html: honours same-origin ?next only', () => {
  const html = readFileSync('public/login.html', 'utf8');
  assert.ok(html.includes('function nextPath()'), 'nextPath helper');
  assert.ok(html.includes("PROJECT_HEAD: '/pack-config.html'"), 'Project Head lands on kW Packs');
});

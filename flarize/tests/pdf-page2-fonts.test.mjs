// V4 quotation-finalization Phase 2B — Page 2 vendored font contract.
//
// Verifies:
//   - the 18 approved WOFF2 font files are vendored under
//     public/assets/quotation/fonts/
//   - PAGE_TWO_STYLES declares 24 @font-face rules (3 subsets × 3 weights
//     for Noto Sans Malayalam + 3 subsets × 5 weights for Poppins) all
//     pointing to those local files
//   - none of Page 2's font declarations reach out to a remote host
//   - Page 1's font stack is not touched by the Page 2 font vendoring

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';

const RENDERER_SRC = readFileSync('public/lib/quotationDocument.js', 'utf8');
const PAGE_TWO_STYLES = (() => {
  const m = RENDERER_SRC.match(/export const PAGE_TWO_STYLES\s*=\s*`([\s\S]*?)`;/);
  return m ? m[1] : '';
})();
const PAGE_ONE_STYLES = (() => {
  const m = RENDERER_SRC.match(/export const PAGE_ONE_STYLES\s*=\s*`([\s\S]*?)`;/);
  return m ? m[1] : '';
})();

const FONT_DIR = 'public/assets/quotation/fonts';

test('vendored font directory exists', () => {
  assert.ok(existsSync(FONT_DIR), `${FONT_DIR}/ must exist`);
});

test('vendored font directory carries the 20 expected .woff2 files (Noto Sans Malayalam + Poppins subsets)', () => {
  const files = readdirSync(FONT_DIR).filter(f => f.endsWith('.woff2'));
  // 18 approved-template subsets + 2 added 2026-09-13 (P1): Noto Sans Malayalam
  // Regular 400 and Medium 500 for Malayalam body text on pages 3/9/10/11.
  assert.equal(files.length, 20,
    `Expected 20 .woff2 files (18 approved-template subsets + noto-sans-malayalam-400/500 for P1 body text). Found: ${files.length}`);
  for (const f of files) {
    const size = statSync(`${FONT_DIR}/${f}`).size;
    assert.ok(size > 4000, `${f} must be a real woff2 (>4KB); got ${size} bytes`);
  }
});

test('PAGE_TWO_STYLES declares Noto Sans Malayalam and Poppins @font-face rules', () => {
  assert.ok(PAGE_TWO_STYLES.length > 0, 'PAGE_TWO_STYLES must be readable');
  const faces = PAGE_TWO_STYLES.match(/@font-face\s*\{[^}]*\}/g) || [];
  assert.equal(faces.length, 24,
    `Expected 24 @font-face rules on Page 2 (9 Noto Sans Malayalam + 15 Poppins). Found: ${faces.length}`);
  // Every rule must reference a local file — no remote host.
  for (const f of faces) {
    const urlMatch = f.match(/url\(\s*"([^"]+)"/);
    assert.ok(urlMatch, `@font-face rule must carry a url(): ${f.slice(0, 80)}...`);
    const url = urlMatch[1];
    assert.ok(url.startsWith('assets/quotation/fonts/') && url.endsWith('.woff2'),
      `Vendored @font-face url must start with assets/quotation/fonts/ and end with .woff2 — got: ${url}`);
  }
  // Family coverage
  const families = new Set();
  for (const f of faces) {
    const fam = f.match(/font-family:\s*'?([^;'"\n]+)'?/);
    if (fam) families.add(fam[1].trim());
  }
  assert.ok(families.has('Noto Sans Malayalam'), 'Noto Sans Malayalam must be declared');
  assert.ok(families.has('Poppins'), 'Poppins must be declared');
});

test('Page 2 does not depend on remote Google Fonts', () => {
  // No CSS url() pointing to fonts.gstatic / googleapis inside PAGE_TWO_STYLES.
  assert.equal(/fonts\.gstatic\.com/.test(PAGE_TWO_STYLES), false,
    'PAGE_TWO_STYLES must not reference fonts.gstatic.com');
  assert.equal(/fonts\.googleapis\.com/.test(PAGE_TWO_STYLES), false,
    'PAGE_TWO_STYLES must not reference fonts.googleapis.com');
});

test('Page 1 font architecture is not disturbed by Page 2 font vendoring', () => {
  // PAGE_ONE_STYLES uses the Poppins/system stack via body inheritance; it
  // must not itself declare @font-face rules (those live only in Page 2).
  assert.ok(PAGE_ONE_STYLES.length > 0, 'PAGE_ONE_STYLES must be readable');
  const facesOnPage1 = PAGE_ONE_STYLES.match(/@font-face/g) || [];
  assert.equal(facesOnPage1.length, 0,
    'PAGE_ONE_STYLES must not declare @font-face rules; vendored fonts are Page-2-scoped');
});

test('PAGE_TWO_STYLES retains its px-based approved geometry (no accidental font-refactor drift)', () => {
  // Sanity check that the geometry we already validated survives the font work.
  assert.ok(/\.q2-headline-ml\s*\{[^}]*font-size:\s*40px/.test(PAGE_TWO_STYLES),
    'ML headline must remain 40px (approved value)');
  assert.ok(/\.q2-benefit-band-value\s*\{[^}]*font-size:\s*46px/.test(PAGE_TWO_STYLES),
    'Benefit band value must remain 46px');
  assert.ok(/\.q2-mahabali\s*\{[^}]*width:\s*190px/.test(PAGE_TWO_STYLES),
    'Mahabali must remain 190px wide');
  assert.ok(/\.q2-cta-qr-img\s*\{[^}]*width:\s*66px/.test(PAGE_TWO_STYLES),
    'QR must remain 66px wide');
  assert.ok(/\.q2-more-benefits\s*\{[^}]*display:\s*flex/.test(PAGE_TWO_STYLES),
    '.q2-more-benefits must use flex-column with gap for divider→offers spacing parity');
});

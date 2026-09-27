// CANONICAL DOCUMENT DISPATCH TESTS
//
// Proves the customer quotation document assembles exactly the approved 12-page
// sequence, uses the correct (detailed) renderers, and excludes pages that
// should not appear (FAQ, Mounting & Safety).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const RENDERER_SRC = readFileSync('public/lib/quotationDocument.js', 'utf8');
const DOC_HTML = readFileSync('public/quotation-document.html', 'utf8');

// ---------------------------------------------------------------------------
// 1. Canonical 12-page assembly — all pages wired
// ---------------------------------------------------------------------------
test('canonical page 1: renderPage1 (cover + proposal)', () => {
  assert.ok(DOC_HTML.includes('renderPage1(payload)'), 'renderPage1 called in assembly');
});
test('canonical page 2: renderPage2 (campaign)', () => {
  assert.ok(DOC_HTML.includes('renderPage2(payload)'), 'renderPage2 called in assembly');
});
test('canonical page 3: renderPage3 (generation)', () => {
  // Must use renderPage3 directly, NOT renderPage2Generation wrapper
  assert.ok(DOC_HTML.includes('renderPage3(payload)'), 'renderPage3 called directly');
  assert.ok(!DOC_HTML.includes('renderPage2Generation(payload)'), 'renderPage2Generation wrapper not used');
});
test('canonical page 4: renderPage4 (why flarize)', () => {
  assert.ok(DOC_HTML.includes('renderPage4(payload)'), 'renderPage4 called');
});
test('canonical page 5: renderPage5 (three-option pricing)', () => {
  assert.ok(DOC_HTML.includes('renderPage5(payload)'), 'renderPage5 called directly');
  // Must NOT use renderPage3Pricing wrapper
  assert.ok(!DOC_HTML.includes('renderPage3Pricing(payload)'), 'renderPage3Pricing wrapper not used');
  // Inclusion matrix NOT wired as separate page (would cause 13 physical pages)
  assert.ok(!DOC_HTML.includes('renderInclusionPage'), 'inclusion matrix not a separate page');
});
test('canonical page 6: renderPage6Testimonials (testimonials)', () => {
  assert.ok(DOC_HTML.includes('renderPage6Testimonials(payload)'), 'testimonials renderer called');
});
test('canonical page 7: renderPage7 (tech specs)', () => {
  assert.ok(DOC_HTML.includes('renderPage7(payload)'), 'renderPage7 called');
});
test('canonical page 8: renderPage8 DETAILED (savings + payment)', () => {
  assert.ok(DOC_HTML.includes('renderPage8(payload)'), 'renderPage8 detailed called');
  // Must NOT use simplified renderPage6Savings
  assert.ok(!DOC_HTML.includes('renderPage6Savings'), 'simplified savings renderer excluded');
});
test('canonical page 9: renderPage9Timeline (timeline)', () => {
  assert.ok(DOC_HTML.includes('renderPage9Timeline(payload)'), 'timeline renderer called');
});
test('canonical page 10: renderPage10Terms (T&C 1/2)', () => {
  assert.ok(DOC_HTML.includes('renderPage10Terms(payload)'), 'T&C page 1 called');
});
test('canonical page 11: renderPage11Terms (T&C 2/2)', () => {
  assert.ok(DOC_HTML.includes('renderPage11Terms(payload)'), 'T&C page 2 called');
});
test('canonical page 12: renderPage12 DETAILED (investment)', () => {
  assert.ok(DOC_HTML.includes('renderPage12(payload)'), 'renderPage12 detailed called');
  // Must NOT use simplified renderPage13Investment
  assert.ok(!DOC_HTML.includes('renderPage13Investment'), 'simplified investment renderer excluded');
});

// ---------------------------------------------------------------------------
// 2. Excluded pages — must NOT appear in assembly
// ---------------------------------------------------------------------------
test('no FAQ page in document', () => {
  assert.ok(!DOC_HTML.includes('renderPage10Faq'), 'FAQ renderer not wired');
});
test('no Mounting & Safety page in document', () => {
  assert.ok(!DOC_HTML.includes('renderPage8Mounting'), 'Mounting & Safety renderer not wired');
});

// ---------------------------------------------------------------------------
// 3. Renderer data-document-order correctness
// ---------------------------------------------------------------------------
test('renderPage4 has data-document-order="4"', () => {
  assert.ok(RENDERER_SRC.includes('data-document-order="4"'), 'order 4 in renderer');
});
test('renderPage6Testimonials has data-document-order="6"', () => {
  // The renamed function must carry order 6
  const match = RENDERER_SRC.match(/renderPage6Testimonials.*?data-document-order="(\d+)"/s);
  assert.ok(match, 'renderPage6Testimonials found');
  assert.equal(match[1], '6', 'order is 6');
});
test('renderPage10Terms has data-document-order="10"', () => {
  const match = RENDERER_SRC.match(/renderPage10Terms.*?data-document-order="(\d+)"/s);
  assert.ok(match, 'renderPage10Terms found');
  assert.equal(match[1], '10', 'order is 10');
});
test('renderPage11Terms has data-document-order="11"', () => {
  const idx = RENDERER_SRC.indexOf('renderPage11Terms');
  assert.ok(idx > -1, 'renderPage11Terms found');
  const after = RENDERER_SRC.slice(idx, idx + 300);
  assert.ok(after.includes('data-document-order="11"'), 'order is 11');
});

// ---------------------------------------------------------------------------
// 4. Detailed renderers exist and are the ones wired
// ---------------------------------------------------------------------------
test('renderPage8 is the detailed savings renderer (PAGE_EIGHT section)', () => {
  // Verify it contains the detailed savings content (chart, payment schedule)
  const p8idx = RENDERER_SRC.indexOf('export function renderPage8(');
  assert.ok(p8idx > -1, 'detailed renderPage8 exported');
  const p8block = RENDERER_SRC.slice(p8idx, p8idx + 2000);
  assert.ok(p8block.includes('PAGE_EIGHT'), 'uses PAGE_EIGHT section');
});
test('renderPage12 is the detailed investment renderer (PAGE_TWELVE section)', () => {
  const p12idx = RENDERER_SRC.indexOf('export function renderPage12(');
  assert.ok(p12idx > -1, 'detailed renderPage12 exported');
  const p12block = RENDERER_SRC.slice(p12idx, p12idx + 2000);
  assert.ok(p12block.includes('PAGE_TWELVE'), 'uses PAGE_TWELVE section');
});

// ---------------------------------------------------------------------------
// 5. Campaign renderer wired (conditional on CMS content)
// ---------------------------------------------------------------------------
test('campaign renderer (renderPage2) is imported and called', () => {
  assert.ok(DOC_HTML.includes('renderPage2'), 'renderPage2 imported');
  assert.ok(DOC_HTML.includes('PAGE_TWO_STYLES'), 'PAGE_TWO_STYLES imported');
  assert.ok(DOC_HTML.includes('blockedFieldsPage2'), 'blockedFieldsPage2 imported');
});

// ---------------------------------------------------------------------------
// 6. Backward-compatible aliases still exported
// ---------------------------------------------------------------------------
test('renderPage5Testimonials alias still exported', () => {
  assert.ok(RENDERER_SRC.includes('renderPage5Testimonials'), 'backward compat alias present');
});
test('renderPage3Pricing wrapper still exported', () => {
  assert.ok(RENDERER_SRC.includes('export function renderPage3Pricing'), 'renderPage3Pricing still exists');
});
test('renderPage2Generation wrapper still exported', () => {
  assert.ok(RENDERER_SRC.includes('export function renderPage2Generation'), 'renderPage2Generation still exists');
});

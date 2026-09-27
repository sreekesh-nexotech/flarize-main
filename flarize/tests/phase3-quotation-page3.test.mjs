// PART H — PAGE 3 GENERATION & APPLIANCE USAGE TESTS.
//
// V4 quotation-finalization Phase 2B — F1 hybrid architecture:
//   the whole approved q-page-03.jpg is the visual base; only the
//   genuinely dynamic regions carry live overlays. The 8-row appliance
//   table + 13.1 total + "Your Life" columns are STATIC APPROVED CONTENT
//   baked into the JPEG and are NOT rebuilt in the renderer.
//
// This suite covers the finalized behavior only; the exhaustive
// dynamic-binding + no-hardcode + fail-safe checks live in
// tests/quotation-page3-phase2b.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import * as D from '../public/lib/quotationDocument.js';

const RENDERER_SRC = readFileSync('public/lib/quotationDocument.js', 'utf8');

// A tiny payload that populates every Page 3 overlay.
function payloadWith({ ep = {}, company = {} } = {}) {
  return {
    energyProfile: {
      available: true, source: 'ENERGY_ENGINE', status: 'COMPLETE',
      value: {
        dailyGenerationLow: 18, dailyGenerationHigh: 22,
        monthlyKsebValueLow: 5500, monthlyKsebValueHigh: 6600,
        homeUsesUnitsPerDay: 13, surplusExportedLow: 4, surplusExportedHigh: 8,
        ...ep,
      },
    },
    company: {
      available: true, source: 'COMPANY_MASTER',
      value: {
        address: 'Thannikakal, Thumpoly PO', city: 'Alappuzha', pincode: '688008',
        website: 'www.flarize.com', email: 'sales@flarize.com', phone: '+91 9995 073 579',
        ...company,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// F1 hybrid architecture
// ---------------------------------------------------------------------------

test('Page 3 renders as the shared .q-canvas container with the approved full-page JPEG', () => {
  const html = D.renderPage3(payloadWith());
  assert.ok(html.includes('data-page-section="GENERATION_AND_APPLIANCE_USAGE"'));
  assert.ok(html.includes('data-document-order="3"'));
  assert.ok(html.includes('class="q-canvas"'));
  assert.ok(html.includes('assets/quotation/q-page-03.jpg'));
});

test('approved q-page-03.jpg is vendored under public/assets/quotation/', () => {
  assert.ok(existsSync('public/assets/quotation/q-page-03.jpg'),
    'the approved Page 3 artwork must ship as q-page-03.jpg');
  assert.equal(D.PAGE_THREE_ASSETS.fullArtwork, 'assets/quotation/q-page-03.jpg');
});

test('only the 6 dynamic overlays are emitted (L1, L2, L5, L6, L7, L8)', () => {
  const html = D.renderPage3(payloadWith());
  for (const cls of ['q3-ov-l1','q3-ov-l2','q3-ov-l5','q3-ov-l6','q3-ov-l7','q3-ov-l8']) {
    assert.ok(html.includes(cls), `overlay ${cls} present`);
  }
  // L3 appliance table + L4 total are baked into the JPEG — no overlay.
  assert.equal(html.includes('q3-ov-l3'), false);
  assert.equal(html.includes('q3-ov-l4'), false);
});

test('renderer does NOT rebuild the appliance table (it is baked into the JPEG)', () => {
  const html = D.renderPage3(payloadWith());
  assert.equal(/<table\b/.test(html), false, 'no <table> in Page 3 renderer output');
  assert.equal(/q3-app-name|q3-app-hrs|q3-app-units/.test(html), false,
    'legacy appliance-table cell classes must not appear');
});

test('renderer does NOT rebuild the Your Life comparison (it is baked into the JPEG)', () => {
  const html = D.renderPage3(payloadWith());
  for (const s of ['Your Life Now', 'Your Life with Solar', 'Limiting AC Usage',
                    'Comfort Without Guilt', 'Electricity Anxiety']) {
    assert.equal(html.includes(s), false,
      `"${s}" must not appear in renderer output — baked into approved artwork`);
  }
});

test('L1 daily generation range and L5 card value reflect payload', () => {
  const html = D.renderPage3(payloadWith({
    ep: { dailyGenerationLow: 33, dailyGenerationHigh: 41 },
  }));
  assert.ok(html.includes('33–41 units'));
  assert.ok(html.includes('>33–41<'));
});

test('L2 monthly KSEB value formats with Indian digit grouping and en-dash', () => {
  const html = D.renderPage3(payloadWith({
    ep: { monthlyKsebValueLow: 11000, monthlyKsebValueHigh: 13200 },
  }));
  assert.ok(html.includes('₹11,000–13,200'));
});

test('L6 home-uses and L7 surplus card values bind to payload', () => {
  const html = D.renderPage3(payloadWith({
    ep: { homeUsesUnitsPerDay: 26, surplusExportedLow: 12, surplusExportedHigh: 18 },
  }));
  assert.ok(html.includes('>~26<'));
  assert.ok(html.includes('>12–18<'));
});

test('L8 footer contact strip binds to company profile', () => {
  const html = D.renderPage3(payloadWith({
    company: { address: 'X Road', city: 'Kochi', pincode: '682001',
               website: 'www.example.co', email: 'x@example.co', phone: '+91 90000 00000' },
  }));
  assert.ok(html.includes('X Road'));
  assert.ok(html.includes('Kochi'));
  assert.ok(html.includes('682001'));
  assert.ok(html.includes('www.example.co'));
  assert.ok(html.includes('x@example.co'));
  assert.ok(html.includes('+91 90000 00000'));
});

test('blocked-field report names ENERGY_LOAD_CALCULATION_ENGINE when energy missing', () => {
  const blocked = D.blockedFieldsPage3({});
  const labels = blocked.map(b => b.label);
  for (const l of ['Daily Solar Generation','Monthly Value at KSEB Rate','Your Home Uses','Surplus Exported']) {
    assert.ok(labels.includes(l), `${l} must be reported blocked`);
  }
  for (const b of blocked) assert.ok(b.dependency, `${b.label} names its dependency`);
});

test('customer-facing output never shows "Not available" or internal dependency names on Page 3', () => {
  const html = D.renderPage3({});
  assert.equal(html.includes('Not available'), false,
    'Per PAGE-3-2 decision C, Page 3 must never emit "Not available" — energy data is a prerequisite');
  for (const s of ['ENERGY_LOAD_CALCULATION_ENGINE','COMPANY_MASTER','CUSTOMER_RECORD',
                    'FINANCE_ENGINE','SAVINGS_ENGINE','LOCKED_BOM_SNAPSHOT']) {
    assert.equal(html.includes(s), false, `${s} must not leak into customer HTML`);
  }
});

test('Page 3 renderer does NOT calculate anything (pure copy)', () => {
  const p3Start = RENDERER_SRC.indexOf('PAGE_THREE = Object.freeze');
  const p3End   = RENDERER_SRC.indexOf('PAGE_FIVE = Object.freeze');
  const p3Code  = RENDERER_SRC.slice(p3Start, p3End);
  const code    = p3Code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/\bMath\.(round|ceil|floor|abs)\b/.test(code), false,
    'no Math rounding in Page 3 renderer');
});

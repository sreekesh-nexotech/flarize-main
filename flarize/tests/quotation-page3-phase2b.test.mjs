// PAGE 3 — approved image-only + F1 hybrid overlays.
//
// V4 quotation-finalization Phase 2B. Verifies:
//   - approved q-page-03.jpg is vendored + referenced verbatim
//   - the whole page is rendered inside the shared .q-canvas contract
//   - 6 live overlays exist (L1 daily-gen, L2 monthly-KSEB, L5 solar-gen
//     card, L6 home-uses card, L7 surplus-exported card, L8 footer)
//   - the appliance table (L3) + total daily usage (L4) + the two Life
//     comparison columns are NOT overlaid — they are static approved
//     artwork baked into the JPEG
//   - overlays vary with payload
//   - blocked-field reporting for missing energy / company profile
//   - no internal provenance / hardcoded dynamic values in output
//   - no hardcoded ₹5,500 / 6,600 / 18-22 / 13 / 4-8 numeric literals in
//     the renderer code (all copies flow from payload)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import * as D from '../public/lib/quotationDocument.js';

const RENDERER_SRC = readFileSync('public/lib/quotationDocument.js', 'utf8');

function payloadWith({ ep = null, company = null } = {}) {
  return {
    energyProfile: ep && {
      available: true, source: 'ENERGY_ENGINE', status: 'COMPLETE',
      value: {
        dailyGenerationLow: ep.dailyGenerationLow ?? 18,
        dailyGenerationHigh: ep.dailyGenerationHigh ?? 22,
        monthlyKsebValueLow: ep.monthlyKsebValueLow ?? 5500,
        monthlyKsebValueHigh: ep.monthlyKsebValueHigh ?? 6600,
        homeUsesUnitsPerDay: ep.homeUsesUnitsPerDay ?? 13,
        surplusExportedLow: ep.surplusExportedLow ?? 4,
        surplusExportedHigh: ep.surplusExportedHigh ?? 8,
      },
    },
    company: company && {
      available: true, source: 'COMPANY_MASTER',
      value: {
        address: 'Thannikakal, Thumpoly PO', city: 'Alappuzha', pincode: '688008',
        website: 'www.flarize.com', email: 'sales@flarize.com', phone: '+91 9995 073 579',
        ...company,
      },
    },
  };
}

test('A1 — approved artwork vendored and referenced verbatim', () => {
  assert.ok(existsSync('public/assets/quotation/q-page-03.jpg'), 'q-page-03.jpg must ship');
  assert.equal(D.PAGE_THREE_ASSETS.fullArtwork, 'assets/quotation/q-page-03.jpg');
  const html = D.renderPage3(payloadWith({ ep: {}, company: {} }));
  assert.ok(html.includes('assets/quotation/q-page-03.jpg'),
    'renderPage3 must reference the vendored full-page artwork');
});

test('A2 — page-section metadata and shared .q-canvas container are present', () => {
  const html = D.renderPage3(payloadWith({ ep: {}, company: {} }));
  assert.ok(html.includes('data-page-section="GENERATION_AND_APPLIANCE_USAGE"'));
  assert.ok(html.includes('data-document-order="3"'));
  assert.ok(html.includes('class="q-canvas"'), 'must render inside the shared .q-canvas design contract');
});

test('A3 — 6 live overlays are present (L1, L2, L5, L6, L7, L8) — L3/L4 NOT overlaid', () => {
  const html = D.renderPage3(payloadWith({ ep: {}, company: {} }));
  for (const cls of ['q3-ov-l1','q3-ov-l2','q3-ov-l5','q3-ov-l6','q3-ov-l7','q3-ov-l8']) {
    assert.ok(html.includes(cls), `overlay ${cls} must render`);
  }
  // Appliance table (L3) and totalDailyUsage (L4) MUST NOT appear as overlays.
  assert.equal(html.includes('q3-ov-l3'), false, 'appliance table is static approved artwork; no overlay');
  assert.equal(html.includes('q3-ov-l4'), false, 'total daily usage is static approved artwork; no overlay');
  // And no per-appliance <tr> should be built by the renderer.
  assert.equal(/<td[^>]*class="q3-app-name"/.test(html), false,
    'renderer must not build appliance-table cells; the table is baked into the JPEG');
});

test('B1 — L1 daily generation range binds to payload', () => {
  const html = D.renderPage3(payloadWith({ ep: { dailyGenerationLow: 21, dailyGenerationHigh: 27 }, company: {} }));
  assert.ok(html.includes('21–27 units'), 'L1 overlay must reflect payload');
});

test('B2 — L2 monthly KSEB value formats as ₹low-high with Indian digit grouping', () => {
  const html = D.renderPage3(payloadWith({ ep: { monthlyKsebValueLow: 11000, monthlyKsebValueHigh: 13200 }, company: {} }));
  assert.ok(html.includes('₹11,000–13,200'), 'L2 must format with en-dash + comma grouping');
});

test('B3 — L5, L6, L7 card values reflect payload', () => {
  const html = D.renderPage3(payloadWith({
    ep: { dailyGenerationLow: 40, dailyGenerationHigh: 48, homeUsesUnitsPerDay: 26, surplusExportedLow: 12, surplusExportedHigh: 18 },
    company: {},
  }));
  assert.ok(html.includes('>40–48<'), 'L5 solar-gen card');
  assert.ok(html.includes('>~26<'), 'L6 home uses card');
  assert.ok(html.includes('>12–18<'), 'L7 surplus card');
});

test('B4 — L8 footer contact strip binds to company profile', () => {
  const html = D.renderPage3(payloadWith({
    ep: {},
    company: { address: 'Test Road', city: 'Kochi', pincode: '682001',
               website: 'www.example.co', email: 'hello@example.co', phone: '+91 90000 12345' },
  }));
  assert.ok(html.includes('Test Road'));
  assert.ok(html.includes('Kochi'));
  assert.ok(html.includes('682001'));
  assert.ok(html.includes('www.example.co'));
  assert.ok(html.includes('hello@example.co'));
  assert.ok(html.includes('+91 90000 12345'));
});

test('C1 — blocked-field report names ENERGY_LOAD_CALCULATION_ENGINE when energy missing', () => {
  const blocked = D.blockedFieldsPage3({});
  const labels = blocked.map(b => b.label);
  for (const l of ['Daily Solar Generation','Monthly Value at KSEB Rate','Your Home Uses','Surplus Exported']) {
    assert.ok(labels.includes(l), `${l} must be reported blocked`);
  }
  for (const b of blocked) assert.ok(b.dependency, `${b.label} must name its dependency`);
});

test('C2 — blocked-field report names COMPANY_MASTER when company missing', () => {
  const blocked = D.blockedFieldsPage3(payloadWith({ ep: {}, company: null }));
  const labels = blocked.map(b => b.label);
  for (const l of ['Footer Address','Footer Website','Footer Email','Footer Phone']) {
    assert.ok(labels.includes(l), `${l} must be reported blocked`);
  }
});

test('D1 — renderer emits no internal provenance / dependency names to customer HTML', () => {
  const html = D.renderPage3({});
  for (const s of ['ENERGY_LOAD_CALCULATION_ENGINE','COMPANY_MASTER','CUSTOMER_RECORD',
                    'FINANCE_ENGINE','SAVINGS_ENGINE','LOCKED_BOM_SNAPSHOT']) {
    assert.equal(html.includes(s), false, `${s} must not leak into customer HTML`);
  }
  assert.equal(html.includes('Not available'), false,
    'Per PAGE-3-2 decision C, Page 3 must not show "Not available" on customer output');
});

test('D2 — renderer code has no hardcoded dynamic values (18-22, 5,500, 6,600, ~13, 4-8, 13.1)', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Scoped to the Page 3 section — extract PAGE_THREE_ASSETS through PAGE_THREE_STYLES.
  const p3Start = code.indexOf('PAGE_THREE = Object.freeze');
  const p3End = code.indexOf('PAGE_THREE_STYLES = `') + 4000; // include styles too
  const p3Code = code.slice(p3Start, p3End);
  for (const v of ["'18–22'", '"18–22"', "'5,500'", "'6,600'", "'13.1'",
                    "'4–8'", '"~13"', "'~13'"]) {
    assert.equal(p3Code.includes(v), false, `Page 3 code must not hardcode ${v}`);
  }
});

test('D3 — approved static content (appliance table + Life columns + typo) is NOT rebuilt in renderer', () => {
  const code = RENDERER_SRC.slice(RENDERER_SRC.indexOf('PAGE_THREE = Object.freeze'),
                                   RENDERER_SRC.indexOf('PAGE_FIVE = Object.freeze'));
  // Verify the renderer does NOT contain the appliance names / life copy /
  // typo — they belong to the JPEG only.
  const staticStrings = ['Lights + Fans', 'Refrigerator', 'Induction Stove', 'Air Conditioner',
                          'EV Charging', 'Total Daily Usage', 'Your Life Now', 'Your Life with Solar',
                          'Limiting AC Usage', 'Comfort Without Guilt', 'uniits'];
  for (const s of staticStrings) {
    assert.equal(code.includes(s), false,
      `Renderer must not contain "${s}" — it is baked into q-page-03.jpg as approved artwork`);
  }
});

test('E1 — fail-safe when payload is empty: overlays render with masks but no fabricated text', () => {
  const html = D.renderPage3({});
  // Overlay divs still present (mask baked sample values).
  for (const cls of ['q3-ov-l1','q3-ov-l2','q3-ov-l5','q3-ov-l6','q3-ov-l7','q3-ov-l8']) {
    assert.ok(html.includes(cls), `${cls} must still render as mask`);
  }
  // No hardcoded fallback numbers in output.
  for (const v of ['18–22','5,500','6,600','13.1','4–8']) {
    assert.equal(html.includes(v), false, `no fallback ${v} in customer output`);
  }
});

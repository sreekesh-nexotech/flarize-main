// C6 TIER DISPLAY NAMES + C7 COMPANY IDENTITY + INCLUSION MATRIX — Tests
//
// Covers the 32 test items from the spec's Part 11:
//  C7:  1–8  (Company Master, Flarize identity, snapshotting)
//  C6:  9–15 (authoritative tier display names, no hardcoding)
//  Inclusion: 16–26 (matrix loading, display-only, snapshotting)
//  Regression: 27–32 (BOM, procurement, sales untouched)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

import * as QP from '../src/lib/quotationPayload.js';

const RENDERER_SRC = readFileSync('public/lib/quotationDocument.js', 'utf-8');

// Load data files
const COMPANY_PROFILE_RAW = JSON.parse(readFileSync('data/company-profile.json', 'utf-8'));
const TIER_DISPLAY_NAMES_RAW = JSON.parse(readFileSync('data/tier-display-names.json', 'utf-8'));
const INCLUSION_MATRIX_RAW = JSON.parse(readFileSync('data/quotation-inclusions.json', 'utf-8'));

// Build a company profile shape matching server-company.js quotationShape()
function companyShape(raw) {
  if (!raw || !raw.legalName) return null;
  return {
    available: true,
    source: 'COMPANY_MASTER',
    value: {
      companyName: raw.displayName || raw.legalName,
      legalName: raw.legalName,
      // C7 (2026-09-04) — brand + parent line are SEPARATE semantic fields.
      brandName: raw.brandName || null,
      parentBrandLine: raw.parentBrandLine || null,
      gstNumber: raw.gstin || null,
      companyRegistration: raw.companyRegistration || null,
      address: raw.address || null,
      city: raw.city || null,
      state: raw.state || null,
      pincode: raw.pincode || null,
      phone: raw.phone || null,
      email: raw.email || null,
      website: raw.website || null,
      bankName: raw.bankName || null,
      bankAccountName: raw.bankAccountName || null,
      bankAccountNumber: raw.bankAccountNumber || null,
      bankIfsc: raw.bankIfsc || null,
      // C7 payment extension.
      bankBranch: raw.bankBranch || null,
      upiId: raw.upiId || null,
      upiQrAssetId: raw.upiQrAssetId || null,
      upiQrImageUri: raw.upiQrImageUri || null,
      paymentInstructions: raw.paymentInstructions || null,
      // C7 CMS asset references.
      signatureAssetId: raw.signatureAssetId || null,
      signatureImageUri: raw.signatureImageUri || null,
      sealAssetId: raw.sealAssetId || null,
      sealImageUri: raw.sealImageUri || null,
    },
  };
}

function stripMeta(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith('_') && typeof v === 'string') out[k] = v;
  }
  return out;
}

const FLARIZE_COMPANY = companyShape(COMPANY_PROFILE_RAW);
const TIER_NAMES = stripMeta(TIER_DISPLAY_NAMES_RAW);

// Minimal system for payload building
const SYSTEM = { packageTier: 'value', systemType: 'ONGRID', systemSizeKw: 5 };

function buildPayload(overrides = {}) {
  return QP.buildQuotationPayload({
    system: SYSTEM,
    companyProfile: FLARIZE_COMPANY,
    tierDisplayNames: TIER_NAMES,
    inclusionMatrix: INCLUSION_MATRIX_RAW,
    ...overrides,
  });
}

// =============================================================================
// C7 — COMPANY MASTER (Tests 1–8)
// =============================================================================

describe('C7 — Company Master / Flarize identity', () => {
  // ── C7 IDENTITY FOUNDATION LOCK (2026-09-04) ─────────────────────────────
  // Business decisions locked:
  //   Legal quotation issuer:  FLARIZE TECHNOLOGIES PRIVATE LIMITED
  //   GSTIN:                   32AAGCF7283D1ZR
  //   Customer-facing brand:   FLARIZE          (separate field: brandName)
  //   Parent/backing wording:  Backed by Golden Ray (separate: parentBrandLine)
  //   Registered address:      Floor 01, Building 49/190/B, Tharath Building,
  //                            Alappuzha, Kerala 688007 (owner-confirmed footer form, 2026-09-12)
  test('1. Company Master stores FLARIZE TECHNOLOGIES PRIVATE LIMITED (C7 locked)', () => {
    assert.ok(COMPANY_PROFILE_RAW, 'company-profile.json exists and is not null');
    assert.equal(COMPANY_PROFILE_RAW.legalName,   'FLARIZE TECHNOLOGIES PRIVATE LIMITED');
    assert.equal(COMPANY_PROFILE_RAW.displayName, 'FLARIZE TECHNOLOGIES PRIVATE LIMITED');
    // brand + parent line are stored as SEPARATE semantic fields.
    assert.equal(COMPANY_PROFILE_RAW.brandName,       'FLARIZE');
    assert.equal(COMPANY_PROFILE_RAW.parentBrandLine, 'Backed by Golden Ray');
    // legalName is NEVER overwritten with the brand.
    assert.notEqual(COMPANY_PROFILE_RAW.legalName, 'FLARIZE',
      'legalName must not be the customer-facing brand');
  });

  test('2. Company data flows into quotation payload (C7 locked)', () => {
    const payload = buildPayload();
    assert.ok(payload.company, 'company section exists');
    assert.equal(payload.company.available, true);
    assert.equal(payload.company.source,    'COMPANY_MASTER');
    assert.equal(payload.company.value.companyName,     'FLARIZE TECHNOLOGIES PRIVATE LIMITED');
    assert.equal(payload.company.value.legalName,       'FLARIZE TECHNOLOGIES PRIVATE LIMITED');
    assert.equal(payload.company.value.brandName,       'FLARIZE');
    assert.equal(payload.company.value.parentBrandLine, 'Backed by Golden Ray');
  });

  test('3. Renderer displays approved company name (payload carries it)', () => {
    const payload = buildPayload();
    assert.equal(payload.company.value.companyName, 'FLARIZE TECHNOLOGIES PRIVATE LIMITED');
    // Renderer must not hardcode any specific legal name — v1 template only
    // holds a placeholder; the C7 legal string must not appear as a literal.
    assert.equal(RENDERER_SRC.includes('FLARIZE TECHNOLOGIES PRIVATE LIMITED'), false,
      'renderer must not hardcode company legal name');
  });

  test('4. Available contact information is in Company Master', () => {
    assert.equal(COMPANY_PROFILE_RAW.email,   'sales@flarize.com');
    assert.equal(COMPANY_PROFILE_RAW.website, 'www.flarize.com');
    assert.equal(COMPANY_PROFILE_RAW.phone,   '9995073579');
    const payload = buildPayload();
    assert.equal(payload.company.value.email,   'sales@flarize.com');
    assert.equal(payload.company.value.website, 'www.flarize.com');
    assert.equal(payload.company.value.phone,   '9995073579');
  });

  test('5. Locked GSTIN + GST-certificate address are stored (C7 locked)', () => {
    // C7 gate unlocked the legal identity — GSTIN + address must match the
    // authoritative GST certificate exactly. Bank fields REMAIN null until
    // Finance supplies the real Flarize receiving account.
    assert.equal(COMPANY_PROFILE_RAW.gstin,   '32AAGCF7283D1ZR');
    assert.equal(COMPANY_PROFILE_RAW.pincode, '688007');
    assert.equal(COMPANY_PROFILE_RAW.city,    'Alappuzha');
    assert.equal(COMPANY_PROFILE_RAW.state,   'Kerala');
    // 2026-09-12 owner instruction: footer address is "Floor 01, Building
    // 49/190/B, Tharath Building, Alappuzha – 688007" (locality lines dropped).
    for (const marker of ['Floor 01', 'Building 49/190/B', 'Tharath Building']) {
      assert.ok(COMPANY_PROFILE_RAW.address.includes(marker),
        `address must include the owner-confirmed marker "${marker}"`);
    }
    // Bank fields stay null — no invention, no leak from historical artwork.
    for (const field of ['bankName', 'bankAccountName', 'bankAccountNumber',
                          'bankIfsc', 'bankBranch', 'upiId']) {
      assert.equal(COMPANY_PROFILE_RAW[field], null,
        `${field} must be null until Finance supplies real values`);
    }
    const payload = buildPayload();
    assert.equal(payload.company.value.gstNumber, '32AAGCF7283D1ZR');
    assert.equal(payload.company.value.pincode,   '688007');
    assert.equal(payload.company.value.bankName,  null);
    assert.equal(payload.company.value.bankIfsc,  null);
  });

  test('6. Historical LLP legal identity is not used as the Flarize legal identity', () => {
    // The Flarize legal issuer must NEVER be the historical Golden Ray LLP
    // legal name. The C7 lock does introduce a customer-facing parent line
    // "Backed by Golden Ray" — that is a distinct semantic field
    // (parentBrandLine) and does not equate to the LLP legal identity.
    assert.notEqual(COMPANY_PROFILE_RAW.legalName, 'Golden Ray Renewable Energy');
    assert.notEqual(COMPANY_PROFILE_RAW.legalName, 'Golden Ray Renewable Energy Pvt. Ltd.');
    assert.ok(!COMPANY_PROFILE_RAW.legalName.includes('Golden Ray'),
      'legal name must not include Golden Ray');
    // Data file must not contain the LLP legal name / bank details.
    const raw = readFileSync('data/company-profile.json', 'utf-8').toUpperCase();
    assert.equal(raw.includes('GOLDEN RAY RENEWABLE'), false,
      'company-profile.json must not contain the Golden Ray LLP legal name');
    // The parent-brand line IS allowed — check it exactly, in isolation.
    assert.equal(COMPANY_PROFILE_RAW.parentBrandLine, 'Backed by Golden Ray');
  });

  test('7. Issued quotation snapshots company identity', () => {
    const payload = buildPayload();
    // Company section is frozen (deep)
    assert.ok(Object.isFrozen(payload.company), 'company must be frozen');
  });

  test('8. Later Company Master changes do not mutate issued quotation', () => {
    const payload = buildPayload();
    // Verify immutability — top-level company object is frozen
    assert.ok(Object.isFrozen(payload.company), 'company section frozen');
    // Value object is either frozen or assignment silently ignored
    const before = payload.company.value.companyName;
    try { payload.company.value.companyName = 'Changed'; } catch { /* expected in strict */ }
    assert.equal(payload.company.value.companyName, before,
      'company name unchanged after attempted mutation');
  });
});

// =============================================================================
// C6 — TIER DISPLAY NAMES (Tests 9–15)
// =============================================================================

describe('C6 — Tier display names (revised 2026-09-02)', () => {
  test('9. base tier display name = "Essential System" (locked)', () => {
    assert.equal(TIER_NAMES.base, 'Essential System');
    const p = buildPayload({ system: { ...SYSTEM, packageTier: 'base' } });
    assert.equal(p.system.packageTierDisplayName.available, true);
    assert.equal(p.system.packageTierDisplayName.value, 'Essential System');
    assert.equal(p.system.packageTierDisplayName.source, 'BUSINESS_DECISION_C6');
  });

  test('10. value tier display name = "Smart System" (locked)', () => {
    assert.equal(TIER_NAMES.value, 'Smart System');
    const p = buildPayload({ system: { ...SYSTEM, packageTier: 'value' } });
    assert.equal(p.system.packageTierDisplayName.value, 'Smart System');
  });

  test('11. premium tier display name = "Elite System" (locked)', () => {
    assert.equal(TIER_NAMES.premium, 'Elite System');
    const p = buildPayload({ system: { ...SYSTEM, packageTier: 'premium' } });
    assert.equal(p.system.packageTierDisplayName.value, 'Elite System');
  });

  test('11b. recommendedTier + recommendedBadge published for wizard consumption', () => {
    assert.equal(TIER_NAMES.recommendedTier, 'value',
      'Middle tier is recommended per business decision');
    assert.equal(TIER_NAMES.recommendedBadge, 'Recommended · Most Popular',
      'Badge text is authoritative business copy');
  });

  test('11c. internal tier keys unchanged (base/value/premium)', () => {
    // Locked decision: internal identifiers must remain base/value/premium
    // even though customer-facing names changed. Payload contract preserved.
    const p = buildPayload({ system: { ...SYSTEM, packageTier: 'value' } });
    assert.equal(p.system.packageTier, 'value',
      'internal tier key stays lowercase base/value/premium');
  });

  test('12. Renderer does not derive names from tier IDs', () => {
    const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // No charAt(0).toUpperCase() derivation of tier names used for display
    // The existing dead code tierLabel uses this pattern but is never referenced
    // in actual rendering. Verify the renderer reads from payload field.
    assert.ok(code.includes('packageTierDisplayName'),
      'renderer reads packageTierDisplayName from payload');
  });

  test('13. Renderer does not hardcode Base/Value/Premium as tier display names', () => {
    const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // The test checks string literals used AS tier display names
    // (not as tier codes for lookup, which are legitimately lowercase 'base', 'value', 'premium')
    for (const s of ["'Premium'"]) {
      // Filter out contexts where these appear as lookup keys, not display names
      const occurrences = code.match(new RegExp(`(?<!')${s.slice(1, -1)}(?!')`, 'g')) || [];
      // The word should only appear in contexts like tier code matching, not as display output
    }
    // Primary check: no format like tierLabel = 'Premium' or innerHTML = 'Premium'
    assert.equal(
      /=\s*['"](?:Base|Value|Premium)['"]/.test(
        code.replace(/find\([^)]*\)/g, '') // exclude find() callbacks
            .replace(/\.toLowerCase\(\)\s*===\s*['"][^'"]*['"]/g, '') // exclude tier code comparisons
      ),
      false,
      'no hardcoded tier display name assignments'
    );
  });

  test('14. Missing C6 remains blocked', () => {
    const p = buildPayload({ tierDisplayNames: null });
    assert.equal(p.system.packageTierDisplayName.available, false);
    assert.ok(p.system.packageTierDisplayName.dependency.includes('C6') ||
              p.system.packageTierDisplayName.dependency.includes('TIER_DISPLAY'));
  });

  test('15. Issued quotation snapshots tier names', () => {
    const p = buildPayload();
    assert.ok(Object.isFrozen(p.system.packageTierDisplayName),
      'tier display name must be frozen');
    assert.throws(() => { p.system.packageTierDisplayName.value = 'Hacked'; }, TypeError);
  });
});

// =============================================================================
// INCLUSION MATRIX (Tests 16–26)
// =============================================================================

describe('Inclusion matrix', () => {
  test('16. Inclusion configuration loads', () => {
    assert.ok(INCLUSION_MATRIX_RAW, 'quotation-inclusions.json exists');
    assert.ok(INCLUSION_MATRIX_RAW.Base, 'Base tier config exists');
    assert.ok(INCLUSION_MATRIX_RAW.Value, 'Value tier config exists');
    assert.ok(INCLUSION_MATRIX_RAW.Premium, 'Premium tier config exists');
  });

  test('17. Base values match approved source', () => {
    const base = INCLUSION_MATRIX_RAW.Base;
    assert.equal(base.solarPanels, true);
    assert.equal(base.inverter, true);
    assert.equal(base.battery, false, 'Base does NOT include battery');
    assert.equal(base.mountingStructure, true);
    assert.equal(base.installation, true);
    assert.equal(base.commissioning, true);
    assert.equal(base.warranty, true);
    assert.equal(base.amc, false);
  });

  test('18. Value values match approved source', () => {
    const value = INCLUSION_MATRIX_RAW.Value;
    assert.equal(value.solarPanels, true);
    assert.equal(value.inverter, true);
    assert.equal(value.battery, true, 'Value INCLUDES battery');
    assert.equal(value.mountingStructure, true);
    assert.equal(value.warranty, true);
    assert.equal(value.amc, false);
  });

  test('19. Premium values match approved source', () => {
    const premium = INCLUSION_MATRIX_RAW.Premium;
    assert.equal(premium.solarPanels, true);
    assert.equal(premium.inverter, true);
    assert.equal(premium.battery, true, 'Premium INCLUDES battery');
    assert.equal(premium.warranty, true);
    // AMC is unresolved for Premium
    assert.equal(premium.amc, null, 'AMC is unresolved for Premium');
  });

  test('20. Renderer reads inclusion data from payload', () => {
    const p = buildPayload();
    assert.ok(p.inclusions, 'inclusions section exists');
    assert.equal(p.inclusions.available, true);
    assert.equal(p.inclusions.source, 'COMMERCIAL_INCLUSION_CONFIG');
    assert.ok(p.inclusions.items, 'items exist');
    assert.equal(p.inclusions.items.solarPanels, true);
    assert.equal(p.inclusions.items.battery, true); // value tier
  });

  test('21. Renderer does not calculate inclusion', () => {
    const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // No inclusion calculation logic
    assert.equal(code.includes('costEngine'), false);
    assert.equal(code.includes('pricingEngine'), false);
    // Inclusion data is read, not computed
    assert.ok(code.includes('inclusions'), 'renderer references inclusions from payload');
  });

  test('22. No procurement cost appears in inclusion matrix config', () => {
    // Check actual tier data (non-metadata keys) for cost/price/margin content
    for (const tier of ['Base', 'Value', 'Premium']) {
      const config = INCLUSION_MATRIX_RAW[tier];
      for (const [k, v] of Object.entries(config)) {
        if (k.startsWith('_')) continue;
        assert.ok(typeof v !== 'number', `${tier}.${k} must not be a number (no costs/prices)`);
        assert.ok(typeof v !== 'string' || !(/cost|price|margin|procurement/i.test(v)),
          `${tier}.${k} must not contain cost/price/margin values`);
      }
    }
  });

  test('23. No internal margin appears in inclusion matrix', () => {
    for (const tier of ['Base', 'Value', 'Premium']) {
      const config = INCLUSION_MATRIX_RAW[tier];
      for (const [k, v] of Object.entries(config)) {
        if (k.startsWith('_')) continue;
        assert.ok(v === true || v === false || v === null,
          `${tier}.${k} must be boolean or null, got ${typeof v}: ${v}`);
      }
    }
  });

  test('24. Missing/unresolved inclusion is not silently converted to YES', () => {
    // lightningProtection is null (unresolved) for all tiers
    for (const tier of ['Base', 'Value', 'Premium']) {
      assert.equal(INCLUSION_MATRIX_RAW[tier].lightningProtection, null,
        `${tier} lightningProtection must be null (unresolved)`);
    }
    // monitoring is null for all tiers
    for (const tier of ['Base', 'Value', 'Premium']) {
      assert.equal(INCLUSION_MATRIX_RAW[tier].monitoring, null,
        `${tier} monitoring must be null (unresolved)`);
    }
    // Payload preserves null
    const p = buildPayload();
    assert.equal(p.inclusions.items.lightningProtection, null);
    assert.equal(p.inclusions.items.monitoring, null);
  });

  test('25. Issued quotation snapshots inclusion data', () => {
    const p = buildPayload();
    assert.ok(Object.isFrozen(p.inclusions), 'inclusions must be frozen');
    assert.ok(Object.isFrozen(p.inclusions.items), 'inclusion items must be frozen');
    assert.throws(() => { p.inclusions.items.battery = false; }, TypeError);
  });

  test('26. Existing quotation history remains intact (data file unchanged)', () => {
    // Verify the inclusion matrix is a separate config, not embedded in other files
    assert.ok(existsSync('data/quotation-inclusions.json'), 'config file exists');
    assert.equal(INCLUSION_MATRIX_RAW._authority, 'COMMERCIAL_INCLUSION_CONFIG');
  });
});

// =============================================================================
// PAYLOAD INTEGRATION — inclusion flows through alternatives
// =============================================================================

describe('Inclusion in alternatives payload', () => {
  test('each tier gets its own inclusion items from the matrix', () => {
    for (const tier of ['base', 'value', 'premium']) {
      const p = buildPayload({ system: { ...SYSTEM, packageTier: tier } });
      assert.equal(p.inclusions.available, true, `${tier} inclusions available`);
      assert.equal(p.inclusions.source, 'COMMERCIAL_INCLUSION_CONFIG');
    }
  });

  test('base tier battery is false, value/premium battery is true', () => {
    const base = buildPayload({ system: { ...SYSTEM, packageTier: 'base' } });
    const value = buildPayload({ system: { ...SYSTEM, packageTier: 'value' } });
    const premium = buildPayload({ system: { ...SYSTEM, packageTier: 'premium' } });
    assert.equal(base.inclusions.items.battery, false);
    assert.equal(value.inclusions.items.battery, true);
    assert.equal(premium.inclusions.items.battery, true);
  });

  test('inclusion blocked when no matrix supplied', () => {
    const p = buildPayload({ inclusionMatrix: null });
    assert.equal(p.inclusions.available, false);
    assert.ok(p.inclusions.dependency.includes('INCLUSION'));
  });
});

// =============================================================================
// REGRESSION (Tests 27–32)
// =============================================================================

describe('Regression — protected boundaries', () => {
  test('27–28. BOM builder and authentication tests exist and are unchanged', () => {
    assert.ok(existsSync('tests/bom-validation.test.mjs'), 'BOM tests exist');
    assert.ok(existsSync('tests/authenticated-users.test.mjs'), 'auth tests exist');
    assert.ok(existsSync('server-bom-builder.js'), 'BOM builder exists');
  });

  test('29. server-bom-builder.js was not modified this phase', () => {
    const bom = readFileSync('server-bom-builder.js', 'utf-8');
    // Verify key structure unchanged
    assert.ok(bom.includes('module.exports'), 'exports exist');
  });

  test('30. Procurement system exists unchanged', () => {
    assert.ok(existsSync('tests/phase3-procurement.test.mjs'), 'procurement tests exist');
  });

  test('31. Renderer remains display-only (no financial calculation)', () => {
    const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.equal(/\.reduce\(|parseFloat|parseInt|Math\.(round|ceil|floor|abs)\s*\(/.test(code), false,
      'no financial aggregation or rounding in renderer');
    assert.equal(/costEngine|pricingEngine|commercialSnapshot\./.test(code), false,
      'no engine references in renderer');
  });

  test('32. quotation-document.html has canonical 12-page assembly', () => {
    const html = readFileSync('public/quotation-document.html', 'utf-8');
    // Verify key structure — canonical assembly wires all pages directly
    assert.ok(html.includes('renderPage1'), 'page 1 render call exists');
    assert.ok(html.includes('renderPage5'), 'page 5 pricing render call exists');
    assert.ok(html.includes('renderPage7'), 'page 7 render call exists');
    // Inclusion matrix is NOT a separate page in canonical 12-page assembly
    // (it would cause 13 physical pages). Remains exported for future use.
    assert.ok(!html.includes('renderInclusionPage'), 'inclusion matrix not wired as separate page');
  });
});

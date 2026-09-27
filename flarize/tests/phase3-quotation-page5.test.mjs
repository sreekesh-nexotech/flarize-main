// PART H — CUSTOMER QUOTATION DOCUMENT, HYBRID STEP 3: PAGE 5.
//
// PAGE 5 = THREE-OPTION COMMERCIAL PRICING (document order 5,
// forensic report §PAGE 5).
//
// This suite proves the Page 5 renderer:
// 1. Preserves the three-option column structure
// 2. Uses quotation payload data — never artwork example values
// 3. Shows blocked treatment for missing values/options
// 4. Performs no calculation, no catalog, no engine import
// 5. No subsidy in commercial output
// 6. Two payloads → two different outputs, no leakage
// 7. Leaves Page 1 and Page 7 untouched
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as D from '../public/lib/quotationDocument.js';
import { ROLES } from '../src/lib/bomRoles.js';
import { createProjectBomSnapshot } from '../src/lib/bomSnapshot.js';
import { createCommercialSnapshot } from '../src/lib/commercialSnapshot.js';
import { COST_STATUS } from '../src/lib/costEngine.js';
import { PRICING_STATUS } from '../src/lib/pricingEngine.js';
import * as QP from '../src/lib/quotationPayload.js';

const RENDERER_SRC = readFileSync('public/lib/quotationDocument.js', 'utf8');
const PAGE_SRC = readFileSync('public/quotation-document.html', 'utf8');

const AT = '2026-08-26T00:00:00Z';

// ---------------------------------------------------------------------------
// Artwork example values that must NEVER appear in shipped code
// ---------------------------------------------------------------------------
const ARTWORK_PRICES = [
  '3,38,000', '2,68,000', '1,98,000', '2,60,000', '1,90,000', '1,20,000',
];
const ARTWORK_TIER_NAMES = ['Premium System', 'Smart System', 'Basic System'];
const ARTWORK_EMI = ['3,200', '2,500', '1,800'];

// ---------------------------------------------------------------------------
// Payload A — 5 kW system, VALUE tier
// ---------------------------------------------------------------------------
const CUSTOMER_A = {
  customerId: 'C-P5A', customerName: 'Page5 Alpha',
  address: '10 Alpha Lane', pincode: '600001', phone: '9111111111',
  district: 'Alpha District', state: 'Kerala',
  currentBillAmount: 4000, currentBillCycle: 'monthly',
};
const SYSTEM_A = { systemType: 'ONGRID', systemSizeKw: 5, phase: 'SINGLE', packageTier: 'VALUE', roofType: 'FLAT' };
const QUOTE_A = {
  quotationNumber: 'FLZ-P5-0001', quotationVersion: 1, quotationDate: '2026-08-26',
  validUntil: '2026-09-10', proposalBy: 'Alpha Sales', status: 'DRAFT',
};
const COMPONENT_ATTRS_A = {
  'pan-5a': { brand: 'AlphaPanel', model: 'AP-550', technology: 'N-Type TOPCon', moduleWatt: 550, warranty: '25 Year' },
  'inv-5a': { brand: 'AlphaInverter', model: 'AI-5K', technology: 'String Inverter', specification: 'String Inverter', phase: 'Single Phase', capacity: '5 kW', warranty: '10 Years' },
  'str-5a': { brand: 'AlphaStruct', specification: 'GI Flat Roof' },
  'acdb-5a': { brand: 'AlphaACDB', specification: 'MCB SPD' },
  'dcdb-5a': { brand: 'AlphaDCDB', specification: 'MCB 1P' },
  'dc-5a': { brand: 'AlphaDC', crossSection: '4' },
  'ac-5a': { brand: 'AlphaAC', crossSection: '4' },
  'earth-5a': { brand: 'AlphaEarth', specification: '8 SWG (15m)' },
};

function bomSnapshotA() {
  return createProjectBomSnapshot({
    projectId: 'PRJ-5A', lockedBy: 'ph1', lockedAt: AT, dataVersion: 'catalog.7', engineeringStatus: 'VALID',
    bomLines: [
      { componentId: 'pan-5a', role: ROLES.PANEL, quantity: 9 },
      { componentId: 'inv-5a', role: ROLES.INVERTER, quantity: 1 },
      { componentId: 'str-5a', role: ROLES.STRUCTURE, quantity: 1 },
      { componentId: 'acdb-5a', role: ROLES.ACDB, quantity: 1 },
      { componentId: 'dcdb-5a', role: ROLES.DCDB, quantity: 1 },
      { componentId: 'dc-5a', role: ROLES.DC_CABLE, quantity: 30 },
      { componentId: 'ac-5a', role: ROLES.AC_CABLE, quantity: 20 },
      { componentId: 'earth-5a', role: ROLES.EARTHING, quantity: 1 },
    ],
  });
}

function commercialSnapshotA() {
  return createCommercialSnapshot({
    snapshotId: 'CS-5A', issuedBy: 'ph1', issuedAt: AT,
    costResult: {
      status: COST_STATUS.COMPLETE, projectId: 'PRJ-5A', bomSnapshotId: 'BOM-5A',
      catalogVersion: 'catalog.7', procurementPriceVersion: 'pp.3', landedCostVersion: 'lc.2',
      projectRateCardVersion: 'rc.4', costConfigVersion: 'cc.5', costEngineVersion: 'costEngine.1',
      materialLandedCost: 195000, structureCost: 14000, installationCost: 16000, siteSurveyCost: 600,
      engineeringDesignCost: 2500, transportationCost: 2200, serviceAmcCost: 3500,
      miscellaneousCost: 2300, officeExpenseAllocation: 5000, specialProjectWorksCost: 0,
      directProjectCost: 230000, totalActualProjectCost: 241100, traces: [],
    },
    pricingResult: {
      status: PRICING_STATUS.COMPLETE, marginVersion: 'margin.2', gstVersion: 'gst.1',
      pricingEngineVersion: 'pricingEngine.1', marginType: 'GROSS_MARGIN',
      targetGrossMargin: 0.18, sellingPriceBeforeGST: 294024, grossProfit: 52924,
      gstRatePct: 8.9, gstAmount: 26168, sellingPriceIncludingGST: 320192,
      extras: [], extrasIncludingGST: 0, customerTotalIncludingGST: 320192, customerSideExpenses: [],
    },
  });
}


// 2026-09-09 — columns follow the approved artwork order Elite (premium) · Smart
// (value, centre) · Essential (base). The single payload fills ITS tier's column;
// the other two columns are blocked. Payload A/B are VALUE / PREMIUM tier.
const COL = { premium: 0, value: 1, base: 2 };
const ownCol = (payload) => COL[String(payload?.system?.packageTier || 'value').toLowerCase()] ?? 1;
const A_COL = 1; // payload A = VALUE tier → centre column
const OTHER_COLS = [0, 2];

function payloadA() {
  return QP.buildQuotationPayload({
    quotation: QUOTE_A, customer: CUSTOMER_A, system: SYSTEM_A,
    engineering: { status: 'VALID', blocked: [], warnings: [] },
    bomSnapshot: bomSnapshotA(), commercialSnapshot: commercialSnapshotA(),
    componentAttributes: COMPONENT_ATTRS_A,
    subsidyTreatment: QP.SUBSIDY_TREATMENT.NOT_QUOTED,
    capabilities: [], variant: 'FULL',
  });
}

// ---------------------------------------------------------------------------
// Payload B — 10 kW system, PREMIUM tier, different prices
// ---------------------------------------------------------------------------
const CUSTOMER_B = {
  customerId: 'C-P5B', customerName: 'Page5 Beta',
  address: '20 Beta Blvd', pincode: '700001', phone: '9222222222',
  district: 'Beta District', state: 'Tamil Nadu',
  currentBillAmount: 8500, currentBillCycle: 'bi monthly',
};
const SYSTEM_B = { systemType: 'ONGRID', systemSizeKw: 10, phase: 'THREE', packageTier: 'PREMIUM', roofType: 'SHEET' };
const QUOTE_B = {
  quotationNumber: 'FLZ-P5-0002', quotationVersion: 1, quotationDate: '2026-08-26',
  validUntil: '2026-09-15', proposalBy: 'Beta Sales', status: 'DRAFT',
};
const COMPONENT_ATTRS_B = {
  'pan-5b': { brand: 'BetaPanel', model: 'BP-600', technology: 'HJT', moduleWatt: 600, warranty: '30 Year' },
  'inv-5b': { brand: 'BetaInverter', model: 'BI-10K', technology: 'Hybrid', specification: 'Hybrid', phase: 'Three Phase', capacity: '10 kW', warranty: '15 Years' },
  'str-5b': { brand: 'BetaStruct', specification: 'Al Sheet' },
  'acdb-5b': { brand: 'BetaACDB', specification: 'MCB 3P SPD' },
  'dcdb-5b': { brand: 'BetaDCDB', specification: 'MCB 3P' },
  'dc-5b': { brand: 'BetaDC', crossSection: '6' },
  'ac-5b': { brand: 'BetaAC', crossSection: '6' },
  'earth-5b': { brand: 'BetaEarth', specification: '6 SWG (25m)' },
};

function bomSnapshotB() {
  return createProjectBomSnapshot({
    projectId: 'PRJ-5B', lockedBy: 'ph1', lockedAt: AT, dataVersion: 'catalog.7', engineeringStatus: 'VALID',
    bomLines: [
      { componentId: 'pan-5b', role: ROLES.PANEL, quantity: 17 },
      { componentId: 'inv-5b', role: ROLES.INVERTER, quantity: 1 },
      { componentId: 'str-5b', role: ROLES.STRUCTURE, quantity: 1 },
      { componentId: 'acdb-5b', role: ROLES.ACDB, quantity: 1 },
      { componentId: 'dcdb-5b', role: ROLES.DCDB, quantity: 1 },
      { componentId: 'dc-5b', role: ROLES.DC_CABLE, quantity: 40 },
      { componentId: 'ac-5b', role: ROLES.AC_CABLE, quantity: 25 },
      { componentId: 'earth-5b', role: ROLES.EARTHING, quantity: 1 },
    ],
  });
}

function commercialSnapshotB() {
  return createCommercialSnapshot({
    snapshotId: 'CS-5B', issuedBy: 'ph1', issuedAt: AT,
    costResult: {
      status: COST_STATUS.COMPLETE, projectId: 'PRJ-5B', bomSnapshotId: 'BOM-5B',
      catalogVersion: 'catalog.7', procurementPriceVersion: 'pp.3', landedCostVersion: 'lc.2',
      projectRateCardVersion: 'rc.4', costConfigVersion: 'cc.5', costEngineVersion: 'costEngine.1',
      materialLandedCost: 400000, structureCost: 25000, installationCost: 35000, siteSurveyCost: 600,
      engineeringDesignCost: 6000, transportationCost: 5000, serviceAmcCost: 7000,
      miscellaneousCost: 5000, officeExpenseAllocation: 12000, specialProjectWorksCost: 0,
      directProjectCost: 480000, totalActualProjectCost: 495600, traces: [],
    },
    pricingResult: {
      status: PRICING_STATUS.COMPLETE, marginVersion: 'margin.2', gstVersion: 'gst.1',
      pricingEngineVersion: 'pricingEngine.1', marginType: 'GROSS_MARGIN',
      targetGrossMargin: 0.20, sellingPriceBeforeGST: 619500, grossProfit: 123900,
      gstRatePct: 8.9, gstAmount: 55136, sellingPriceIncludingGST: 674636,
      extras: [], extrasIncludingGST: 0, customerTotalIncludingGST: 674636, customerSideExpenses: [],
    },
  });
}

function payloadB() {
  return QP.buildQuotationPayload({
    quotation: QUOTE_B, customer: CUSTOMER_B, system: SYSTEM_B,
    engineering: { status: 'VALID', blocked: [], warnings: [] },
    bomSnapshot: bomSnapshotB(), commercialSnapshot: commercialSnapshotB(),
    componentAttributes: COMPONENT_ATTRS_B,
    subsidyTreatment: QP.SUBSIDY_TREATMENT.NOT_QUOTED,
    capabilities: [], variant: 'FULL',
  });
}

// Empty payload — no BOM, no commercial
function emptyPayload() {
  return QP.buildQuotationPayload({
    quotation: QUOTE_A, customer: CUSTOMER_A, system: SYSTEM_A,
    engineering: null, bomSnapshot: null, commercialSnapshot: null,
    componentAttributes: {}, subsidyTreatment: null, capabilities: [],
  });
}

// ===========================================================================
// 1. Page 5 renderer exists
// ===========================================================================

test('Page 5 renderer exists and is exported', () => {
  assert.equal(typeof D.renderPage5, 'function');
  assert.equal(typeof D.PAGE_FIVE_STYLES, 'string');
  assert.equal(typeof D.pricingOptionFields, 'function');
  assert.equal(typeof D.blockedFieldsPage5, 'function');
  assert.ok(D.PAGE_FIVE);
  assert.equal(D.PAGE_FIVE.sectionName, 'THREE_OPTION_PRICING');
  assert.equal(D.PAGE_FIVE.documentOrder, 5);
});

// ===========================================================================
// 2. Preserves the three-option structure
// ===========================================================================

// 2026-09-09 (approved template v1): a tier whose approved package is not in
// the payload is NOT printed as an empty "Not available" column — only the
// quoted tiers get a card. A single payload → one card (its own column index);
// a payload with base + premium alternatives → three cards in Elite · Smart ·
// Essential order.
test('Page 5 always renders the three approved columns — single payload → its card plus two "Not available" cards in place', () => {
  const html = D.renderPage5(payloadA());
  assert.equal((html.match(/data-option-index="/g) || []).length, 3, 'three option cards (approved placement)');
  assert.ok(html.includes(`data-option-index="${A_COL}"`), 'centre (Smart) column index');
  assert.ok(html.includes('q5-grid-3'), 'grid sized for three cards');
  assert.equal((html.match(/q5-card-na/g) || []).length, 2, 'the two unquoted tiers keep their place as "Not available" cards');
  assert.ok(html.includes('Three Options. One Smart Choice.'), 'approved heading verbatim');
  assert.equal(/₹[\d,]+/.test(html.split('q5-card-na')[1]?.split('</div>\n    </div>')[0] || ''), false, 'a placeholder card carries no figure');
});

test('Page 5 renders three cards when base and premium alternatives are supplied', () => {
  const base = payloadA();
  const alt = (tier) => ({ tier, payload: QP.buildQuotationPayload({
    quotation: QUOTE_A, customer: CUSTOMER_A, system: { ...SYSTEM_A, packageTier: tier },
    engineering: { status: 'VALID', blocked: [], warnings: [] },
    bomSnapshot: bomSnapshotA(), commercialSnapshot: commercialSnapshotA(),
    componentAttributes: COMPONENT_ATTRS_A, subsidyTreatment: QP.SUBSIDY_TREATMENT.NOT_QUOTED,
    capabilities: [], variant: 'FULL',
  }) });
  const html = D.renderPage5({ ...base, alternatives: [alt('base'), alt('premium')] });
  assert.equal((html.match(/data-option-index="/g) || []).length, 3, 'three option cards');
  const order = [...html.matchAll(/data-tier="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['premium', 'value', 'base'], 'Elite · Smart · Essential order');
});

test('pricingOptionFields returns exactly 3 options', () => {
  const opts = D.pricingOptionFields(payloadA());
  assert.equal(opts.length, 3);
});

// ===========================================================================
// 3. Option 1 values come from payload
// ===========================================================================

test('the payload tier column (Smart · centre) is available and has payload values', () => {
  const opts = D.pricingOptionFields(payloadA());
  const opt0 = opts[A_COL];
  assert.equal(opt0.available, true, 'option 0 available');
  assert.equal(opt0.blocked, false, 'option 0 not blocked');
  assert.ok(opt0.priceBeforeGST.available, 'price before GST available');
  assert.ok(opt0.gst.available, 'GST available');
  assert.ok(opt0.totalAmount.available, 'total amount available');
});

// ===========================================================================
// 4. Option 2 values come from payload (blocked — no alternative options)
// ===========================================================================

test('the Elite column is blocked with ALTERNATIVE_QUOTATION_OPTIONS (no premium option supplied)', () => {
  const opts = D.pricingOptionFields(payloadA());
  const opt1 = opts[OTHER_COLS[0]];
  assert.equal(opt1.available, false);
  assert.equal(opt1.blocked, true);
  assert.equal(opt1.blockedDependency, 'ALTERNATIVE_QUOTATION_OPTIONS');
});

// ===========================================================================
// 5. Option 3 values come from payload (blocked — no alternative options)
// ===========================================================================

test('the Essential column is blocked with ALTERNATIVE_QUOTATION_OPTIONS (no base option supplied)', () => {
  const opts = D.pricingOptionFields(payloadA());
  const opt2 = opts[OTHER_COLS[1]];
  assert.equal(opt2.available, false);
  assert.equal(opt2.blocked, true);
  assert.equal(opt2.blockedDependency, 'ALTERNATIVE_QUOTATION_OPTIONS');
});

// ===========================================================================
// 6. System size comes from payload
// ===========================================================================

test('system size comes from payload', () => {
  const opts = D.pricingOptionFields(payloadA());
  assert.ok(opts[A_COL].systemSize.available);
  assert.ok(opts[A_COL].systemSize.value.includes('5 kW'));
  const htmlA = D.renderPage5(payloadA());
  assert.ok(htmlA.includes('5 kW'));
  const htmlB = D.renderPage5(payloadB());
  assert.ok(htmlB.includes('10 kW'));
});

// ===========================================================================
// 7. Tier/package identity from approved payload
// ===========================================================================

test('tier display name uses blocked treatment (C6 pending)', () => {
  const opts = D.pricingOptionFields(payloadA());
  assert.equal(opts[A_COL].tierName.available, false, 'C6 is pending — tier blocked');
  assert.equal(opts[A_COL].tierName.dependency, 'DECISION_C6_TIER_DISPLAY_NAMES');
});

// ===========================================================================
// 8. Price Before GST from payload
// ===========================================================================

test('Price Before GST comes from payload (field carried; the approved card prints the total)', () => {
  const opts = D.pricingOptionFields(payloadA());
  assert.ok(opts[A_COL].priceBeforeGST.available);
  assert.ok(opts[A_COL].priceBeforeGST.value.includes('2,94,024'), 'Payload A price before GST');
  const htmlA = D.renderPage5(payloadA());
  assert.ok(htmlA.includes('Total System Cost'));
  assert.ok(htmlA.includes('₹3,20,192'), 'card prints the customer total');
});

// ===========================================================================
// 9. GST from payload
// ===========================================================================

test('GST comes from payload', () => {
  const opts = D.pricingOptionFields(payloadA());
  assert.ok(opts[A_COL].gst.available);
  assert.ok(opts[A_COL].gst.value.includes('26,168'), 'Payload A GST');
  // The approved card shows the customer total only; the GST breakdown lives on page 7.
  const htmlA = D.renderPage5(payloadA());
  assert.ok(htmlA.includes('₹3,20,192'));
});

// ===========================================================================
// 10. TOTAL AMOUNT from payload
// ===========================================================================

test('TOTAL AMOUNT comes from payload', () => {
  const opts = D.pricingOptionFields(payloadA());
  assert.ok(opts[A_COL].totalAmount.available);
  assert.ok(opts[A_COL].totalAmount.value.includes('3,20,192'), 'Payload A total');
  const htmlA = D.renderPage5(payloadA());
  assert.ok(htmlA.includes('₹3,20,192'));
});

// ===========================================================================
// 11. No subsidy in commercial output
// ===========================================================================

test('no subsidy appears in Page 5 output', () => {
  const html = D.renderPage5(payloadA());
  assert.equal(html.includes('Subsidy'), false, 'no Subsidy');
  assert.equal(html.includes('subsidy'), false, 'no subsidy');
  assert.equal(html.includes('Surya'), false, 'no Surya Ghar');
});

// ===========================================================================
// 12. No "After Subsidy" appears
// ===========================================================================

test('no "After Subsidy" in Page 5', () => {
  const html = D.renderPage5(payloadA());
  assert.equal(html.includes('After Subsidy'), false);
});

// ===========================================================================
// 13. No PM Surya Ghar subsidy language
// ===========================================================================

test('no PM Surya Ghar language in Page 5', () => {
  const html = D.renderPage5(payloadA());
  assert.equal(html.includes('PM Surya'), false);
  assert.equal(html.includes('Surya Ghar'), false);
  assert.equal(html.includes('MNRE'), false);
});

// ===========================================================================
// 14. No renderer calculation
// ===========================================================================

test('no calculation in pricingOptionFields — pure display', () => {
  const fnStart = RENDERER_SRC.indexOf('function buildOptionFields');
  assert.ok(fnStart > -1, 'buildOptionFields function exists');
  let depth = 0; let i = RENDERER_SRC.indexOf('{', fnStart);
  for (; i < RENDERER_SRC.length; i++) {
    if (RENDERER_SRC[i] === '{') depth++;
    if (RENDERER_SRC[i] === '}') { depth--; if (depth === 0) break; }
  }
  const fnBody = RENDERER_SRC.slice(fnStart, i + 1);
  assert.equal(/[+\-*/]\s*(?:cust|pricing|gst|total|price|selling)/i.test(fnBody), false, 'no arithmetic on values');
});

// ===========================================================================
// 15. No Math.* calculation
// ===========================================================================

test('no Math-based calculation in renderer', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/Math\.(round|floor|ceil|abs)\s*\(/i.test(code), false);
});

// ===========================================================================
// 16. No arithmetic on commercial values
// ===========================================================================

test('no subtraction or addition of commercial values', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/sellingPrice\s*[-+]|gstAmount\s*[-+]|customerTotal\s*[-+]/i.test(code), false);
  assert.equal(/[-+]\s*sellingPrice|[-+]\s*gstAmount|[-+]\s*customerTotal/i.test(code), false);
});

// ===========================================================================
// 17. No catalog import
// ===========================================================================

test('renderer imports nothing — no catalog', () => {
  const imports = [...RENDERER_SRC.matchAll(/^import[^;]*?from\s+'([^']+)'/gm)].map(m => m[1]);
  assert.deepEqual(imports, [], 'zero imports');
});

// ===========================================================================
// 18. No pricing engine import
// ===========================================================================

test('no pricing engine reference in renderer', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(code.includes('pricingEngine'), false);
});

// ===========================================================================
// 19. No cost engine import
// ===========================================================================

test('no cost engine reference in renderer', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(code.includes('costEngine'), false);
});

// ===========================================================================
// 20. No engineering engine import
// ===========================================================================

test('no engineering engine reference in renderer', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of ['engineeringChecker', 'quotationPayload', 'quotationWorkspace', 'rbac']) {
    assert.equal(code.includes(f), false, `must not reference ${f}`);
  }
});

// ===========================================================================
// 21. Missing price is explicitly blocked, never ₹0
// ===========================================================================

test('missing price is blocked, not ₹0', () => {
  const opts = D.pricingOptionFields(emptyPayload());
  assert.equal(opts[0].priceBeforeGST.available, false);
  assert.ok(opts[0].priceBeforeGST.dependency);
  const html = D.renderPage5(emptyPayload());
  assert.equal(html.includes('₹0'), false);
});

// ===========================================================================
// 22. Missing GST is explicitly blocked, never ₹0
// ===========================================================================

test('missing GST is blocked, not ₹0', () => {
  const opts = D.pricingOptionFields(emptyPayload());
  assert.equal(opts[0].gst.available, false);
  assert.ok(opts[0].gst.dependency);
});

// ===========================================================================
// 23. Missing total is explicitly blocked, never ₹0
// ===========================================================================

test('missing total is blocked, not ₹0', () => {
  const opts = D.pricingOptionFields(emptyPayload());
  assert.equal(opts[0].totalAmount.available, false);
  assert.ok(opts[0].totalAmount.dependency);
});

// ===========================================================================
// 24. Missing tier display name does not invent one
// ===========================================================================

test('missing tier display name does not invent one', () => {
  const html = D.renderPage5(payloadA());
  for (const n of ARTWORK_TIER_NAMES) {
    assert.equal(html.includes(n), false, `artwork tier name "${n}" must not appear`);
  }
  // Internal tier code should NOT be used as display name
  assert.equal(html.includes('>VALUE<'), false, 'internal tier code not displayed');
  assert.equal(html.includes('>PREMIUM<'), false, 'internal tier code not displayed');
});

// ===========================================================================
// 25. C7 identity is not invented
// ===========================================================================

test('C7 company identity not invented', () => {
  for (const src of [RENDERER_SRC, PAGE_SRC]) {
    for (const s of ['GSTIN', 'Golden Ray Renewable', 'Pvt Ltd', 'Private Limited']) {
      assert.equal(src.includes(s), false, `${s} must not be in renderer or shell`);
    }
  }
});

// ===========================================================================
// 26. Internal cost/margin absent
// ===========================================================================

test('no internal cost or margin in Page 5', () => {
  const html = D.renderPage5(payloadA());
  for (const k of ['materialLandedCost', 'totalActualProjectCost', 'targetGrossMargin',
    'grossProfit', 'marginType', 'GROSS_MARGIN', 'directProjectCost']) {
    assert.equal(html.includes(k), false, `${k} must not appear`);
  }
});

// ===========================================================================
// 27. No artwork example values leak
// ===========================================================================

test('artwork example prices do not leak into Page 5', () => {
  const html = D.renderPage5(payloadA());
  for (const p of ARTWORK_PRICES) {
    assert.equal(html.includes(p), false, `artwork price ${p} must not appear`);
  }
});

test('artwork tier names do not leak into Page 5', () => {
  const html = D.renderPage5(payloadA());
  for (const n of ARTWORK_TIER_NAMES) {
    assert.equal(html.includes(n), false, `artwork tier "${n}" must not appear`);
  }
});

// ===========================================================================
// 28. Two payloads produce different outputs
// ===========================================================================

test('two different payloads produce different Page 5', () => {
  const htmlA = D.renderPage5(payloadA());
  const htmlB = D.renderPage5(payloadB());
  assert.notEqual(htmlA, htmlB);
  // Payload A total
  assert.ok(htmlA.includes('₹3,20,192'));
  // Payload B total
  assert.ok(htmlB.includes('₹6,74,636'));
});

// ===========================================================================
// 29. No cross-customer leakage
// ===========================================================================

test('no cross-customer leakage between payloads', () => {
  const htmlA = D.renderPage5(payloadA());
  const htmlB = D.renderPage5(payloadB());
  // A values not in B
  assert.equal(htmlB.includes('₹2,94,024'), false, 'A price not in B');
  assert.equal(htmlB.includes('AlphaPanel'), false, 'A panel not in B');
  // B values not in A
  assert.equal(htmlA.includes('₹6,19,500'), false, 'B price not in A');
  assert.equal(htmlA.includes('BetaPanel'), false, 'B panel not in A');
});

// ===========================================================================
// 30. Page 1 tests remain green (structural check)
// ===========================================================================

test('Page 1 still renders and exports are intact', () => {
  assert.equal(typeof D.renderPage1, 'function');
  assert.equal(typeof D.PAGE_ONE_STYLES, 'string');
  const page1 = D.renderPage1(payloadA());
  assert.ok(page1.includes('COVER_AND_PROPOSAL_DETAILS'));
  assert.ok(page1.includes('Page5 Alpha'));
  assert.equal(page1.includes('THREE_OPTION_PRICING'), false);
});

// ===========================================================================
// 31. Page 7 tests remain green (structural check)
// ===========================================================================

test('Page 7 still renders and exports are intact', () => {
  assert.equal(typeof D.renderPage7, 'function');
  assert.equal(typeof D.PAGE_SEVEN_STYLES, 'string');
  const page7 = D.renderPage7(payloadA());
  assert.ok(page7.includes('TECHNICAL_SPECIFICATIONS'));
  assert.equal(page7.includes('THREE_OPTION_PRICING'), false);
});

// ===========================================================================
// 32. Internal quotation workspace UI does not appear
// ===========================================================================

test('no internal workspace UI in Page 5', () => {
  const html = D.renderPage5(payloadA());
  for (const s of ['Generation gate', 'Engineering verdict', 'RBAC', 'Acting role',
    'internalWithheld', 'snapshot', 'BOM-5A', 'CS-5A', 'COST_VIEW']) {
    assert.equal(html.includes(s), false, `${s} must not appear`);
  }
});

// ===========================================================================
// Additional: panel and inverter from payload
// ===========================================================================

test('panel brand comes from payload', () => {
  const opts = D.pricingOptionFields(payloadA());
  assert.ok(opts[A_COL].panelBrand.available);
  assert.ok(opts[A_COL].panelBrand.value.includes('AlphaPanel'));
});

test('inverter brand comes from payload', () => {
  const opts = D.pricingOptionFields(payloadA());
  assert.ok(opts[A_COL].inverterBrand.available);
  assert.ok(opts[A_COL].inverterBrand.value.includes('AlphaInverter'));
  // Brands are printed on page 7 (technical specifications), not on the approved page-5 card.
});

// ===========================================================================
// Page 5 is a single A4 section with expected structure
// ===========================================================================

test('Page 5 renders as a single A4 page section', () => {
  const html = D.renderPage5(payloadA());
  assert.equal((html.match(/<section class="page/g) || []).length, 1);
  assert.ok(html.includes('data-page-section="THREE_OPTION_PRICING"'));
  assert.ok(html.includes('data-document-order="5"'));
});

test('Page 5 HTML is well formed', () => {
  const html = D.renderPage5(payloadA());
  assert.equal((html.match(/<section/g) || []).length, (html.match(/<\/section>/g) || []).length);
  assert.equal((html.match(/<div/g) || []).length, (html.match(/<\/div>/g) || []).length);
  assert.equal(/<script|onerror=|onload=/i.test(html), false, 'no script');
  assert.equal(html.includes('undefined'), false, 'no "undefined"');
  assert.equal(html.includes('null'), false, 'no "null"');
});

test('Page 5 is deterministic', () => {
  assert.equal(D.renderPage5(payloadA()), D.renderPage5(payloadA()));
});

test('no clock or randomness in renderer', () => {
  assert.equal(/Date\.now|new Date\b|Math\.random/.test(RENDERER_SRC), false);
});

test('document shell imports Page 5', () => {
  // Page 5 (Three-Option Pricing) is imported directly as renderPage5
  assert.ok(PAGE_SRC.includes('renderPage5'), 'pricing renderer present');
  assert.ok(PAGE_SRC.includes('PAGE_FIVE_STYLES'));
  assert.ok(PAGE_SRC.includes('blockedFieldsPage5'));
});

test('C13 page numbering not invented', () => {
  assert.equal(D.PAGE_FIVE.pageNumberDecision, 'C13_PENDING');
  const html = D.renderPage5(payloadA());
  assert.equal(/Page \s?\d+\s?(of|\/)/i.test(html), false, 'no page numbering');
});

test('blocked option cards render blocked treatment, not blank, with the dependency named at the JS level only', () => {
  const html = D.renderPage5(payloadA());
  assert.ok(html.includes('q-blocked'), 'blocked options rendered with the blocked treatment');
  assert.equal(html.includes('ALTERNATIVE_QUOTATION_OPTIONS'), false, 'internal dependency name must not reach the customer-facing HTML');

  const opts = D.pricingOptionFields(payloadA());
  assert.ok(opts.some(o => o.blockedDependency === 'ALTERNATIVE_QUOTATION_OPTIONS'), 'blocked dependency named at the JS level');
});

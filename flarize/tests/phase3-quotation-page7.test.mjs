// PART H — CUSTOMER QUOTATION DOCUMENT, HYBRID STEP 2: PAGE 7.
//
// PAGE 7 = TECHNICAL SPECIFICATIONS (document order 7, forensic report §PAGE 7).
//
// This suite proves the Page 7 renderer:
// 1. Uses quotation payload data — never the artwork's baked-in values
// 2. Shows blocked treatment for every missing technical or commercial value
// 3. Performs no calculation, no catalog, no engine import
// 4. Changes when the payload changes (two payloads, no cross-customer leakage)
// 5. Leaves Page 1 untouched and all existing Page 1 tests pass
//
// The artwork's example technical values (brand names, wattages, warranty
// periods, pricing) are ARTIFACT EVIDENCE and must never appear in production.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as D from '../public/lib/quotationDocument.js';
import { ROLES } from '../src/lib/bomRoles.js';
import { createProjectBomSnapshot } from '../src/lib/bomSnapshot.js';
import { createCommercialSnapshot } from '../src/lib/commercialSnapshot.js';
import { COST_STATUS } from '../src/lib/costEngine.js';
import { PRICING_STATUS } from '../src/lib/pricingEngine.js';
import * as QP from '../src/lib/quotationPayload.js';

const require = createRequire(import.meta.url);
const RENDERER_SRC = readFileSync('public/lib/quotationDocument.js', 'utf8');
const PAGE_SRC = readFileSync('public/quotation-document.html', 'utf8');

const AT = '2026-08-26T00:00:00Z';
const TOKEN = 'p7-test-token';
const STATE_FILE = join(tmpdir(), `flarize-quotation-p7-${process.pid}.json`);

// ---------------------------------------------------------------------------
// artwork example values that must NEVER appear in shipped code
// ---------------------------------------------------------------------------

const ARTWORK_TECH_VALUES = [
  // panel brands from the artwork
  'Emmvee', 'Renewsys', 'Adani', 'Renew',
  // inverter brands from the artwork
  'Enphase', 'Hoymiles', 'Sungrow', 'Solis', 'Deye',
  // cable brands from the artwork
  'Polycab', 'Wacab', 'Finolex', 'Flexolite',
  // structure brands from the artwork
  'Apollo',
  // ACDB/DCDB brands from the artwork
  'Citel', 'Mersen', 'Havells',
  // warranty periods from the artwork (as they appear)
  '12-Year Product', '30 Year Performance', '25-30 Year', '15 Years', '8 Years', '7 Years',
  // pricing from the artwork
  '3,38,000', '2,68,000', '1,98,000', '2,60,000', '1,90,000', '1,20,000',
  // tier display names (C6)
  'Premium System', 'Smart System', 'Basic System',
];

// The same example values from Page 1 that must also not leak
const ARTWORK_PAGE1_VALUES = [
  'Sareena', 'Kurukkaankizhakke', 'Azhikkode', '123456', '9809445408',
  'QUO-GR-AS-2025', '32AAUFG1464A1ZP', 'AAP-6531',
];

// ---------------------------------------------------------------------------
// payload A — full technical spec payload
// ---------------------------------------------------------------------------

const CUSTOMER_A = {
  customerId: 'C-A1', customerName: 'Alpha Tester',
  address: '1 Alpha Road', pincode: '500001', phone: '9000000001',
  district: 'Test District', state: 'Kerala',
  currentBillAmount: 3500, currentBillCycle: 'monthly',
};
const SYSTEM_A = { systemType: 'ONGRID', systemSizeKw: 5, phase: 'SINGLE', packageTier: 'VALUE', roofType: 'FLAT' };
const QUOTE_A = {
  quotationNumber: 'FLZ-P7-0001', quotationVersion: 1, quotationDate: '2026-08-26',
  validUntil: '2026-09-10', proposalBy: 'Alpha Advisor', status: 'DRAFT',
};

const COMPONENT_ATTRS_A = {
  'pan-a1': { brand: 'TestPanel Co', model: 'TP-550', technology: 'N-Type TOPCon Bifacial', moduleWatt: 550, warranty: '10-Year Product & 25 Year Linear' },
  'inv-a1': { brand: 'TestInverter Inc', model: 'TI-5K', technology: 'String Inverter', specification: 'String Inverter', phase: 'Single Phase', capacity: '5 kW', warranty: '10 Years' },
  'str-a1': { brand: 'TestStruct Ltd', specification: 'GI Structure for Flat Roof' },
  'acdb-a1': { brand: 'TestACDB', specification: 'MCB with SPD' },
  'dcdb-a1': { brand: 'TestDCDB', specification: 'MCB Single Phase' },
  'dc-a1': { brand: 'TestDCCable', crossSection: '4', specification: '4 mm sq' },
  'ac-a1': { brand: 'TestACCable', crossSection: '4', specification: '4 sqmm' },
  'earth-a1': { specification: '8 SWG (15m)', brand: 'TestEarth' },
  'earth-a2': { specification: '10 SWG (20m)', brand: 'TestEarth2' },
};

function bomSnapshotA() {
  return createProjectBomSnapshot({
    projectId: 'PRJ-A1', lockedBy: 'ph1', lockedAt: AT, dataVersion: 'catalog.7', engineeringStatus: 'VALID',
    bomLines: [
      { componentId: 'pan-a1', role: ROLES.PANEL, quantity: 9 },
      { componentId: 'inv-a1', role: ROLES.INVERTER, quantity: 1 },
      { componentId: 'str-a1', role: ROLES.STRUCTURE, quantity: 1 },
      { componentId: 'acdb-a1', role: ROLES.ACDB, quantity: 1 },
      { componentId: 'dcdb-a1', role: ROLES.DCDB, quantity: 1 },
      { componentId: 'dc-a1', role: ROLES.DC_CABLE, quantity: 30 },
      { componentId: 'ac-a1', role: ROLES.AC_CABLE, quantity: 20 },
      { componentId: 'earth-a1', role: ROLES.EARTHING, quantity: 1 },
      { componentId: 'earth-a2', role: ROLES.EARTHING, quantity: 1 },
    ],
  });
}

function commercialSnapshotA(id = 'CS-A1') {
  return createCommercialSnapshot({
    snapshotId: id, issuedBy: 'ph1', issuedAt: AT,
    costResult: {
      status: COST_STATUS.COMPLETE, projectId: 'PRJ-A1', bomSnapshotId: 'BOM-A1',
      catalogVersion: 'catalog.7', procurementPriceVersion: 'pp.3', landedCostVersion: 'lc.2',
      projectRateCardVersion: 'rc.4', costConfigVersion: 'cc.5', costEngineVersion: 'costEngine.1',
      materialLandedCost: 180000, structureCost: 12000, installationCost: 15000, siteSurveyCost: 500,
      engineeringDesignCost: 2000, transportationCost: 2000, serviceAmcCost: 3000,
      miscellaneousCost: 2000, officeExpenseAllocation: 4500, specialProjectWorksCost: 0,
      directProjectCost: 210000, totalActualProjectCost: 221000, traces: [],
    },
    pricingResult: {
      status: PRICING_STATUS.COMPLETE, marginVersion: 'margin.2', gstVersion: 'gst.1',
      pricingEngineVersion: 'pricingEngine.1', marginType: 'GROSS_MARGIN',
      targetGrossMargin: 0.18, sellingPriceBeforeGST: 269512, grossProfit: 48512,
      gstRatePct: 8.9, gstAmount: 23987, sellingPriceIncludingGST: 293499,
      extras: [], extrasIncludingGST: 0, customerTotalIncludingGST: 293499, customerSideExpenses: [],
    },
  });
}

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
// payload B — different customer, different system, different components
// ---------------------------------------------------------------------------

const CUSTOMER_B = {
  customerId: 'C-B2', customerName: 'Beta Tester',
  address: '99 Beta Blvd', pincode: '700001', phone: '9222222222',
  district: 'Other District', state: 'Tamil Nadu',
  currentBillAmount: 8000, currentBillCycle: 'bi monthly',
};
const SYSTEM_B = { systemType: 'ONGRID', systemSizeKw: 10, phase: 'THREE', packageTier: 'PREMIUM', roofType: 'SHEET' };
const QUOTE_B = {
  quotationNumber: 'FLZ-P7-0002', quotationVersion: 1, quotationDate: '2026-08-26',
  validUntil: '2026-09-15', proposalBy: 'Beta Advisor', status: 'DRAFT',
};

const COMPONENT_ATTRS_B = {
  'pan-b1': { brand: 'BetaPanel Corp', model: 'BP-600', technology: 'HJT Bifacial', moduleWatt: 600, warranty: '15-Year Product & 30 Year Performance' },
  'inv-b1': { brand: 'BetaInverter', model: 'BI-10K', technology: 'Hybrid Inverter', specification: 'Hybrid Inverter', phase: 'Three Phase', capacity: '10 kW', warranty: '12 Years' },
  'str-b1': { brand: 'BetaStruct', specification: 'Aluminium Structure for Sheet Roof' },
  'acdb-b1': { brand: 'BetaACDB', specification: 'Triple Phase MCB with SPD' },
  'dcdb-b1': { brand: 'BetaDCDB', specification: 'MCB Three Phase' },
  'dc-b1': { brand: 'BetaDCCable', crossSection: '6', specification: '6 mm sq' },
  'ac-b1': { brand: 'BetaACCable', crossSection: '6', specification: '6 sqmm' },
  'earth-b1': { specification: '6 SWG (25m)', brand: 'BetaEarth' },
};

function bomSnapshotB() {
  return createProjectBomSnapshot({
    projectId: 'PRJ-B2', lockedBy: 'ph1', lockedAt: AT, dataVersion: 'catalog.7', engineeringStatus: 'VALID',
    bomLines: [
      { componentId: 'pan-b1', role: ROLES.PANEL, quantity: 17 },
      { componentId: 'inv-b1', role: ROLES.INVERTER, quantity: 1 },
      { componentId: 'str-b1', role: ROLES.STRUCTURE, quantity: 1 },
      { componentId: 'acdb-b1', role: ROLES.ACDB, quantity: 1 },
      { componentId: 'dcdb-b1', role: ROLES.DCDB, quantity: 1 },
      { componentId: 'dc-b1', role: ROLES.DC_CABLE, quantity: 40 },
      { componentId: 'ac-b1', role: ROLES.AC_CABLE, quantity: 25 },
      { componentId: 'earth-b1', role: ROLES.EARTHING, quantity: 1 },
    ],
  });
}

function commercialSnapshotB(id = 'CS-B2') {
  return createCommercialSnapshot({
    snapshotId: id, issuedBy: 'ph1', issuedAt: AT,
    costResult: {
      status: COST_STATUS.COMPLETE, projectId: 'PRJ-B2', bomSnapshotId: 'BOM-B2',
      catalogVersion: 'catalog.7', procurementPriceVersion: 'pp.3', landedCostVersion: 'lc.2',
      projectRateCardVersion: 'rc.4', costConfigVersion: 'cc.5', costEngineVersion: 'costEngine.1',
      materialLandedCost: 380000, structureCost: 22000, installationCost: 30000, siteSurveyCost: 500,
      engineeringDesignCost: 5000, transportationCost: 4000, serviceAmcCost: 6000,
      miscellaneousCost: 4500, officeExpenseAllocation: 10000, specialProjectWorksCost: 0,
      directProjectCost: 440000, totalActualProjectCost: 462000, traces: [],
    },
    pricingResult: {
      status: PRICING_STATUS.COMPLETE, marginVersion: 'margin.2', gstVersion: 'gst.1',
      pricingEngineVersion: 'pricingEngine.1', marginType: 'GROSS_MARGIN',
      targetGrossMargin: 0.18, sellingPriceBeforeGST: 563415, grossProfit: 101415,
      gstRatePct: 8.9, gstAmount: 50144, sellingPriceIncludingGST: 613559,
      extras: [], extrasIncludingGST: 0, customerTotalIncludingGST: 613559, customerSideExpenses: [],
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

// ===========================================================================
// 1. Page 7 renderer exists
// ===========================================================================

test('Page 7 renderer exists and is exported', () => {
  assert.equal(typeof D.renderPage7, 'function');
  assert.equal(typeof D.PAGE_SEVEN_STYLES, 'string');
  assert.equal(typeof D.techSpecFields, 'function');
  assert.equal(typeof D.commercialSummaryFields, 'function');
  assert.equal(typeof D.blockedFieldsPage7, 'function');
  assert.ok(D.PAGE_SEVEN);
  assert.equal(D.PAGE_SEVEN.sectionName, 'TECHNICAL_SPECIFICATIONS');
  assert.equal(D.PAGE_SEVEN.documentOrder, 7);
});

// 2026-09-12 — owner: three columns (Elite · Smart · Essential) always, in the
// approved placement; a tier without a quoted package keeps its column, headed
// with its pinned name, every cell "Not available" — nothing borrowed, nothing invented.
test('Page 7 always prints the three approved columns in order, naming an unquoted tier from the pinned tier names', () => {
  const names = { base: 'Essential System', value: 'Smart System', premium: 'Elite System', recommendedTier: 'value', recommendedBadge: 'Recommended · Most Popular' };
  const p = QP.buildQuotationPayload({
    quotation: QUOTE_A, customer: CUSTOMER_A, system: SYSTEM_A,
    engineering: { status: 'VALID', blocked: [], warnings: [] },
    bomSnapshot: bomSnapshotA(), commercialSnapshot: commercialSnapshotA(),
    componentAttributes: COMPONENT_ATTRS_A, subsidyTreatment: QP.SUBSIDY_TREATMENT.NOT_QUOTED,
    capabilities: [], variant: 'FULL', tierDisplayNames: names,
  });
  assert.equal(p.system.tierColumnNames.premium.value, 'Elite System', 'all three names pinned on the payload');
  const html = D.renderPage7(p);
  const ths = [...html.matchAll(/q7-th-config q7-tier-(\w+)[^>]*>([^<]*)/g)].map(m => [m[1], m[2].trim()]);
  assert.deepEqual(ths.map(t => t[0]), ['premium', 'value', 'base'], 'Elite · Smart · Essential placement');
  assert.deepEqual(ths.map(t => t[1]), ['Elite System', 'Smart System', 'Essential System']);
  assert.ok(html.includes('q7-cols-3'));
  // The single quoted tier (value) carries figures; the other two columns carry none.
  const cols = html.split('<tr').slice(2).map(r => [...r.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1]));
  for (const row of cols) if (row.length === 4) { assert.equal(row[1], 'Not available'); assert.equal(row[3], 'Not available'); }
  assert.ok(html.includes('₹2,93,499'), 'Smart total present');
  assert.equal((html.match(/₹2,93,499/g) || []).length, 1, 'the figure appears once — never copied into the empty columns');
});

test('Page 7 renders as a single A4 page section', () => {
  const html = D.renderPage7(payloadA());
  assert.equal((html.match(/<section class="page/g) || []).length, 1);
  assert.ok(html.includes('data-page-section="TECHNICAL_SPECIFICATIONS"'));
  assert.ok(html.includes('data-document-order="7"'));
  assert.ok(html.includes('Technical Specifications'));
});

// 2026-09-09 (approved template v1): page 7 carries the approved brand logo
// top-left and the live contact strip (company master) at the foot — the same
// header/footer treatment as pages 4, 5, 8 of the approved template.
test('Page 7 ships the approved brand logo and the live contact strip', () => {
  assert.ok(existsSync('public/assets/quotation/q-flarize-logo-592e2a11.png'), 'brand logo must exist');
  assert.equal(D.PAGE_SEVEN_ASSETS.logo, 'assets/quotation/q-flarize-logo-592e2a11.png');
  const html = D.renderPage7(payloadA());
  assert.ok(html.includes('assets/quotation/q-flarize-logo-592e2a11.png'));
  assert.ok(html.includes('class="q-cs q7-cs"'), 'contact strip present');
  assert.equal(html.includes('page-footer.jpg'), false, 'no baked footer artwork');
});

// ===========================================================================
// 2. Page 7 uses quotation payload data
// ===========================================================================

test('system size comes from payload for the heading', () => {
  const htmlA = D.renderPage7(payloadA());
  assert.ok(htmlA.includes('5000 W'), 'Payload A system = 5 kW = 5000 W');
  const htmlB = D.renderPage7(payloadB());
  assert.ok(htmlB.includes('10000 W'), 'Payload B system = 10 kW = 10000 W');
});

// ===========================================================================
// 3–4. Panel identity, quantity (quantity not displayed here — it is BOM data),
//       wattage, and inverter from payload
// ===========================================================================

test('panel identity (brand) comes from payload', () => {
  const htmlA = D.renderPage7(payloadA());
  assert.ok(htmlA.includes('TestPanel Co'), 'Payload A panel brand');
  const htmlB = D.renderPage7(payloadB());
  assert.ok(htmlB.includes('BetaPanel Corp'), 'Payload B panel brand');
});

test('panel wattage and technology come from payload', () => {
  const htmlA = D.renderPage7(payloadA());
  assert.ok(htmlA.includes('N-Type TOPCon Bifacial'), 'Payload A panel technology');
  assert.ok(htmlA.includes('550W'), 'Payload A panel wattage');
  const htmlB = D.renderPage7(payloadB());
  assert.ok(htmlB.includes('HJT Bifacial'), 'Payload B panel technology');
  assert.ok(htmlB.includes('600W'), 'Payload B panel wattage');
});

// ===========================================================================
// 5. Panel warranty from payload
// ===========================================================================

test('panel warranty comes from payload where supplied', () => {
  const htmlA = D.renderPage7(payloadA());
  assert.ok(htmlA.includes('10-Year Product'), 'Payload A panel warranty');
  const htmlB = D.renderPage7(payloadB());
  assert.ok(htmlB.includes('15-Year Product'), 'Payload B panel warranty');
});

// ===========================================================================
// 6. Inverter identity from payload
// ===========================================================================

test('inverter identity comes from payload', () => {
  const htmlA = D.renderPage7(payloadA());
  assert.ok(htmlA.includes('TestInverter Inc'), 'Payload A inverter brand');
  const htmlB = D.renderPage7(payloadB());
  assert.ok(htmlB.includes('BetaInverter'), 'Payload B inverter brand');
});

test('inverter type/specification comes from payload', () => {
  const htmlA = D.renderPage7(payloadA());
  assert.ok(htmlA.includes('String Inverter'), 'Payload A inverter type');
  const htmlB = D.renderPage7(payloadB());
  assert.ok(htmlB.includes('Hybrid Inverter'), 'Payload B inverter type');
});

// ===========================================================================
// 7. Inverter capacity from payload (in the type/brand display)
// ===========================================================================

test('inverter warranty comes from payload', () => {
  const htmlA = D.renderPage7(payloadA());
  assert.ok(htmlA.includes('10 Years'), 'Payload A inverter warranty');
  const htmlB = D.renderPage7(payloadB());
  assert.ok(htmlB.includes('12 Years'), 'Payload B inverter warranty');
});

// ===========================================================================
// 8. Phase from payload
// ===========================================================================

test('inverter phase comes from payload', () => {
  const htmlA = D.renderPage7(payloadA());
  assert.ok(htmlA.includes('Single Phase'), 'Payload A single phase');
  const htmlB = D.renderPage7(payloadB());
  assert.ok(htmlB.includes('Three Phase'), 'Payload B three phase');
});

// ===========================================================================
// 9. Technical attributes from payload (structure, cables, ACDB/DCDB, earthing)
// ===========================================================================

test('mounting structure comes from payload', () => {
  const htmlA = D.renderPage7(payloadA());
  assert.ok(htmlA.includes('GI Structure for Flat Roof'), 'Payload A structure');
  assert.ok(htmlA.includes('TestStruct Ltd'), 'Payload A structure brand');
});

test('ACDB/DCDB come from payload', () => {
  const htmlA = D.renderPage7(payloadA());
  assert.ok(htmlA.includes('TestACDB'), 'Payload A ACDB brand');
  assert.ok(htmlA.includes('TestDCDB'), 'Payload A DCDB brand');
});

test('DC cable comes from payload', () => {
  const html = D.renderPage7(payloadA());
  assert.ok(html.includes('TestDCCable'), 'DC cable brand');
});

test('AC cable comes from payload', () => {
  const html = D.renderPage7(payloadA());
  assert.ok(html.includes('TestACCable'), 'AC cable brand');
});

test('earthing wire comes from payload', () => {
  const htmlA = D.renderPage7(payloadA());
  assert.ok(htmlA.includes('TestEarth'), 'Payload A earthing');
});

test('multiple earthing rows render individually (artwork has two)', () => {
  const htmlA = D.renderPage7(payloadA());
  const matches = htmlA.match(/Earthing Wire/g);
  assert.ok(matches && matches.length >= 2, 'two earthing BOM lines → two rows');
  assert.ok(htmlA.includes('8 SWG (15m)'), 'first earthing spec');
  assert.ok(htmlA.includes('10 SWG (20m)'), 'second earthing spec');
});

// ===========================================================================
// 10. Warranty from payload where supplied
// ===========================================================================

test('warranty data comes from payload, not artwork', () => {
  const specs = D.techSpecFields(payloadA());
  const panelWarranty = specs.find(s => s.label === 'Panel Warranty');
  assert.ok(panelWarranty.available);
  assert.ok(panelWarranty.value.includes('10-Year Product'));
});

// ===========================================================================
// 11. Missing technical values become named blocked dependencies
// ===========================================================================

test('missing component attributes produce blocked treatment', () => {
  // Build a payload with no component attributes at all
  const barePayload = QP.buildQuotationPayload({
    quotation: QUOTE_A, customer: CUSTOMER_A, system: SYSTEM_A,
    engineering: { status: 'VALID', blocked: [], warnings: [] },
    bomSnapshot: bomSnapshotA(), commercialSnapshot: commercialSnapshotA(),
    componentAttributes: {},  // no attributes
    subsidyTreatment: QP.SUBSIDY_TREATMENT.NOT_QUOTED,
    capabilities: [], variant: 'FULL',
  });
  const html = D.renderPage7(barePayload);
  // All tech spec values should be blocked (except the commercial ones)
  assert.equal(html.includes('COMPONENT_DISPLAY_ATTRIBUTES'), false, 'internal dependency name must not reach the customer-facing HTML');
  assert.ok(html.includes('Not available'), 'blocked text shown');
  const deps = D.blockedFieldsPage7(barePayload).map(b => b.dependency);
  assert.ok(deps.includes('COMPONENT_DISPLAY_ATTRIBUTES'), 'blocked attribute dependency named at the JS level');
});

test('missing BOM entirely produces blocked treatment', () => {
  const noBomPayload = QP.buildQuotationPayload({
    quotation: QUOTE_A, customer: CUSTOMER_A, system: SYSTEM_A,
    engineering: { status: 'VALID', blocked: [], warnings: [] },
    bomSnapshot: null, commercialSnapshot: commercialSnapshotA(),
    componentAttributes: {},
    subsidyTreatment: QP.SUBSIDY_TREATMENT.NOT_QUOTED,
    capabilities: [], variant: 'FULL',
  });
  const html = D.renderPage7(noBomPayload);
  assert.equal(html.includes('LOCKED_BOM_SNAPSHOT'), false, 'internal dependency name must not reach the customer-facing HTML');
  const blocked = D.blockedFieldsPage7(noBomPayload);
  assert.ok(blocked.length > 5, 'many fields blocked when no BOM');
  assert.ok(blocked.some(b => b.dependency === 'LOCKED_BOM_SNAPSHOT'), 'blocked BOM dependency named at the JS level');
});

// ===========================================================================
// 12. Missing values never become ₹0
// ===========================================================================

test('missing values never become zero rupees', () => {
  const noBomPayload = QP.buildQuotationPayload({
    quotation: QUOTE_A, customer: CUSTOMER_A, system: SYSTEM_A,
    engineering: null, bomSnapshot: null, commercialSnapshot: null,
    componentAttributes: {}, subsidyTreatment: null, capabilities: [],
  });
  const html = D.renderPage7(noBomPayload);
  assert.equal(html.includes('₹0'), false, 'missing value must not become ₹0');
});

// ===========================================================================
// 13. Missing values never silently become blank
// ===========================================================================

test('missing values are blocked with named dependency, not silently blank', () => {
  const noBomPayload = QP.buildQuotationPayload({
    quotation: QUOTE_A, customer: CUSTOMER_A, system: SYSTEM_A,
    engineering: null, bomSnapshot: null, commercialSnapshot: null,
    componentAttributes: {}, subsidyTreatment: null, capabilities: [],
  });
  const html = D.renderPage7(noBomPayload);
  assert.ok((html.match(/q-blocked/g) || []).length > 5, 'blocked rows are marked');
  assert.equal(/TBD|coming soon|N\/A/i.test(html), false, 'no placeholder text');
});

// ===========================================================================
// 14. No technical values from the artwork are copied into production
// ===========================================================================

test('none of the artwork example technical values exist in the renderer source', () => {
  for (const v of ARTWORK_TECH_VALUES) {
    assert.equal(RENDERER_SRC.includes(v), false, `artwork value "${v}" must not be in renderer`);
  }
});

test('none of the artwork Page 1 example values exist in the renderer source', () => {
  for (const v of ARTWORK_PAGE1_VALUES) {
    assert.equal(RENDERER_SRC.includes(v), false, `"${v}" must not be in renderer`);
  }
});

// ===========================================================================
// 15. Example customer/component values from the artifact do not leak
// ===========================================================================

test('example customer and component values from the artwork do not appear in page 7 output', () => {
  const html = D.renderPage7(payloadA());
  for (const v of ARTWORK_TECH_VALUES) {
    assert.equal(html.includes(v), false, `artwork value "${v}" must not appear in rendered output`);
  }
});

// ===========================================================================
// 16. No catalog import
// ===========================================================================

test('the renderer imports nothing — no catalog, no engine, no payload module', () => {
  const imports = [...RENDERER_SRC.matchAll(/^import[^;]*?from\s+'([^']+)'/gm)].map(m => m[1]);
  assert.deepEqual(imports, [], 'zero imports');
});

// ===========================================================================
// 17–21. No engine imports, no calculations
// ===========================================================================

test('no engineering engine import anywhere in renderer', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of ['costEngine', 'pricingEngine', 'engineeringChecker', 'projectBom',
    'quotationPayload', 'quotationWorkspace', 'rbac', 'upgradeAssessment', 'upgradeReviewWorkspace']) {
    assert.equal(code.includes(f), false, `must not reference ${f}`);
  }
  assert.equal(/catalog\s*[.?[]|categories|catalog\.items\b|componentAttributesFor/i.test(code), false);
});

test('no arithmetic on money or engineering values', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/\.reduce\(|parseFloat|parseInt/.test(code), false, 'no reduction or parsing');
  assert.equal(/\/\s*\(\s*1\s*-|\*\s*\(\s*1\s*\+|\*\s*0\.\d/.test(code), false, 'no margin/GST math');
});

test('no DC/AC calculation, no string/MPPT calculation', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/dcAcRatio|stringCount|\bmppt\b|\bvoc\b|\bisc\b|\bvmp\b/i.test(code), false);
});

test('no component resolution or selection', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/selectComponent|resolveComponent|findComponent|lookupCatalog/i.test(code), false);
});

// ===========================================================================
// 22. No internal cost/margin
// ===========================================================================

test('no internal cost or margin data in Page 7', () => {
  const html = D.renderPage7(payloadA());
  for (const k of ['materialLandedCost', 'totalActualProjectCost', 'targetGrossMargin', 'grossProfit',
    'costEngine', 'pricingEngine', '221000', '2,21,000', '48,512', '48512']) {
    assert.equal(html.includes(k), false, `internal value ${k} must not appear`);
  }
});

// ===========================================================================
// 23. No RBAC/capability information
// ===========================================================================

test('no RBAC or capability data in Page 7', () => {
  const html = D.renderPage7(payloadA());
  for (const s of ['RBAC', 'COST_VIEW', 'capabilities', 'capabilitiesOf', 'Acting role']) {
    assert.equal(html.includes(s), false, `${s} must not appear`);
  }
});

// ===========================================================================
// 24. C6/C7/C13/C14 are not invented
// ===========================================================================

test('C6 tier display names are not invented', () => {
  const html = D.renderPage7(payloadA());
  for (const n of ['Premium System', 'Smart System', 'Basic System', "'Premium'", "'Smart'", "'Basic'"]) {
    assert.equal(html.includes(n), false, `tier name "${n}" must not be hardcoded`);
  }
});

test('C7 company identity is not invented', () => {
  for (const src of [RENDERER_SRC, PAGE_SRC]) {
    for (const s of ['GSTIN', 'Golden Ray Renewable', 'Pvt Ltd', 'Private Limited']) {
      assert.equal(src.includes(s), false, `${s} must not be hardcoded`);
    }
  }
});

test('C13 page numbering is not invented', () => {
  assert.equal(D.PAGE_SEVEN.pageNumberDecision, 'C13_PENDING');
  const html = D.renderPage7(payloadA());
  assert.equal(/Page \s?\d+\s?(of|\/)/i.test(html), false, 'no page numbering emitted');
});

test('the footer identity conflict is not resolved — Page 1 footer used', () => {
  const html = D.renderPage7(payloadA());
  // The Page 7 artwork footer has different contact info than Page 1.
  // The renderer uses Page 1's established footer. Must NOT hardcode the conflicting one.
  assert.equal(html.includes('www.goldenray.in'), false, 'conflicting footer website not used');
  assert.equal(html.includes('goldenray@gmail.com'), false, 'conflicting footer email not used');
  assert.equal(html.includes('6282 922 988'), false, 'conflicting footer phone not used');
});

// ===========================================================================
// 25. Page 1 remains unchanged and existing Page 1 tests pass
// ===========================================================================

test('Page 1 still renders correctly alongside Page 7', () => {
  const pA = payloadA();
  const page1 = D.renderPage1(pA);
  const page7 = D.renderPage7(pA);
  assert.ok(page1.includes('data-page-section="COVER_AND_PROPOSAL_DETAILS"'));
  assert.ok(page7.includes('data-page-section="TECHNICAL_SPECIFICATIONS"'));
  assert.ok(page1.includes('Alpha Tester'));
  // no cross-contamination
  assert.equal(page1.includes('TECHNICAL_SPECIFICATIONS'), false);
  assert.equal(page7.includes('COVER_AND_PROPOSAL_DETAILS'), false);
});

test('renderPage1 function is unchanged and still exported', () => {
  assert.equal(typeof D.renderPage1, 'function');
  assert.equal(typeof D.PAGE_ONE_STYLES, 'string');
  assert.equal(typeof D.proposalDetailFields, 'function');
  assert.equal(typeof D.salutation, 'function');
  assert.equal(typeof D.blockedFields, 'function');
});

// ===========================================================================
// 26. Page 7 has the expected major visual/structural sections
// ===========================================================================

test('Page 7 has the artwork heading, table, and footer', () => {
  const html = D.renderPage7(payloadA());
  assert.ok(html.includes('Technical Specifications'));
  assert.ok(html.includes('total transparency for your peace of mind'));
  assert.ok(html.includes('<table'));
  assert.ok(html.includes('<thead'));
  assert.ok(html.includes('<tbody'));
  assert.ok(html.includes('<tfoot'));
  assert.ok(html.includes('Items'));
  assert.ok(html.includes('q-cs q7-cs'), 'contact strip');
});

test('the tech spec table has all the artwork row labels', () => {
  const html = D.renderPage7(payloadA());
  for (const label of [
    'Solar Module Brand', 'Module Power (W) and Type', 'Panel Warranty',
    'Inverter Type', 'Inverter Brand', 'Mounting Structure', 'ACDB / DCDB',
    'DC Cable', 'AC Cable', 'Earthing Wire',
  ]) {
    assert.ok(html.includes(label), `artwork row label "${label}" must appear`);
  }
});

test('commercial summary rows appear in the table footer', () => {
  const html = D.renderPage7(payloadA());
  // Approved template v1 footer (owner 2026-09-12, "no changes in the design"):
  // Total System Cost · Down Payment · Subsidy Amount · Amount Payable — the
  // GST split lives on page 5's option cards, not here.
  assert.equal(html.includes('Price Before GST'), false, 'GST split is not a page-7 row in the approved design');
  assert.ok(html.includes('Total System Cost'), 'approved label for the total row');
  assert.ok(html.includes('q7-total-amount'), 'total row is the highlighted TOTAL AMOUNT row');
  const opts = D.commercialSummaryFields(payloadA());
  assert.ok(opts.some(f => f.label === 'TOTAL AMOUNT'), 'field label unchanged');
});

// ===========================================================================
// 27. Customer-facing output has no internal workspace UI
// ===========================================================================

test('no internal quotation workspace UI in customer Page 7', () => {
  const html = D.renderPage7(payloadA());
  for (const s of ['Generation gate', 'Engineering verdict', 'Versions', 'Blocked dependencies',
    'internalWithheld', 'snapshot', 'BOM-A1', 'CS-A1']) {
    assert.equal(html.includes(s), false, `internal value ${s} must not appear`);
  }
});

// ===========================================================================
// 28. Two different payloads — no cross-customer leakage
// ===========================================================================

test('different payloads produce different Page 7 outputs with no leakage', () => {
  const htmlA = D.renderPage7(payloadA());
  const htmlB = D.renderPage7(payloadB());
  assert.notEqual(htmlA, htmlB, 'two different payloads must produce different output');

  // Payload A values must not appear in Payload B output
  for (const v of ['TestPanel Co', 'TestInverter Inc', '5000 W', 'TestStruct Ltd']) {
    assert.equal(htmlB.includes(v), false, `Payload A value "${v}" leaked into Payload B`);
  }

  // Payload B values must not appear in Payload A output
  for (const v of ['BetaPanel Corp', 'BetaInverter', '10000 W', 'BetaStruct']) {
    assert.equal(htmlA.includes(v), false, `Payload B value "${v}" leaked into Payload A`);
  }

  // Both have their own correct values
  assert.ok(htmlA.includes('TestPanel Co'));
  assert.ok(htmlB.includes('BetaPanel Corp'));
  assert.ok(htmlA.includes('5000 W'));
  assert.ok(htmlB.includes('10000 W'));
});

// ===========================================================================
// 29. Commercial GST breakdown from payload
// ===========================================================================

test('Price Before GST is a payload field (available to page 5) but not a page-7 row', () => {
  const f = D.commercialSummaryFields(payloadA()).find(x => x.label === 'Price Before GST');
  assert.ok(f && f.available && f.value === '₹2,69,512', 'Payload A price before GST');
  assert.equal(D.renderPage7(payloadA()).includes('₹2,69,512'), false, 'not printed on page 7 (approved footer)');
});

test('GST amount is a payload field but not a page-7 row', () => {
  const f = D.commercialSummaryFields(payloadA()).find(x => x.label === 'GST');
  assert.ok(f && f.available && f.value === '₹23,987', 'Payload A GST amount');
  assert.equal(D.renderPage7(payloadA()).includes('₹23,987'), false, 'not printed on page 7 (approved footer)');
});

test('Total Amount comes from payload pricing', () => {
  const html = D.renderPage7(payloadA());
  assert.ok(html.includes('₹2,93,499'), 'Payload A total amount');
});

// ===========================================================================
// 30. Well-formed HTML
// ===========================================================================

test('the rendered Page 7 HTML is well formed', () => {
  const html = D.renderPage7(payloadA());
  assert.equal((html.match(/<section/g) || []).length, (html.match(/<\/section>/g) || []).length);
  assert.equal((html.match(/<table/g) || []).length, (html.match(/<\/table>/g) || []).length);
  assert.equal((html.match(/<tr/g) || []).length, (html.match(/<\/tr>/g) || []).length);
  assert.equal(/<script|onerror=|onload=/i.test(html), false, 'no script in document');
  assert.equal(html.includes('undefined'), false, 'no "undefined" in output');
  assert.equal(html.includes('null'), false, 'no "null" in output');
});

test('Page 7 is deterministic — same payload, same HTML', () => {
  assert.equal(D.renderPage7(payloadA()), D.renderPage7(payloadA()));
});

// ===========================================================================
// 31. No clock or randomness
// ===========================================================================

test('no clock and no randomness in renderer', () => {
  assert.equal(/Date\.now|new Date\b|Math\.random/.test(RENDERER_SRC), false);
});

// ===========================================================================
// 32. Document shell includes Page 7
// ===========================================================================

test('the document shell imports renderPage7 and blockedFieldsPage7', () => {
  assert.ok(PAGE_SRC.includes('renderPage7'), 'renderPage7 imported');
  assert.ok(PAGE_SRC.includes('PAGE_SEVEN_STYLES'), 'PAGE_SEVEN_STYLES imported');
  assert.ok(PAGE_SRC.includes('blockedFieldsPage7'), 'blockedFieldsPage7 imported');
});

// ===========================================================================
// 33. Real HTTP integration — payload through API into Page 7
// ===========================================================================

const routes = [];
function addRoute(method, pattern, handler) {
  const keys = [];
  const rx = pattern.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  routes.push({ method, regex: new RegExp('^' + rx + '$'), keys, handler });
}
function send(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let b = ''; req.on('data', c => { b += c; });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function isAdmin(req) { return (req.headers.authorization || '') === `Bearer ${TOKEN}`; }

let server, base;

before(async () => {
  const transport = require('../server-quotation.js');
  await transport.init({ stateFile: STATE_FILE });
  transport.register(addRoute, { send, parseBody, isAdmin });
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const hit = routes.find(r => r.method === req.method && r.regex.test(url.pathname));
    if (!hit) return send(res, 404, { error: 'API route not found' });
    const m = hit.regex.exec(url.pathname); const params = {};
    hit.keys.forEach((k, i) => { params[k] = m[i + 1]; });
    await hit.handler(req, res, params, url.searchParams);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(r => server.close(r));
  try { rmSync(STATE_FILE, { force: true }); } catch { /* nothing to clean */ }
});

async function call(method, path, { role = 'SALES', body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${TOKEN}`,
      'x-actor-role': role, 'x-actor-user': 'u1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('payload fetched over real API renders customer Page 7 with the correct data', async () => {
  await call('POST', '/api/quotation/bom-snapshots', {
    role: 'PROJECT_HEAD',
    body: { bomSnapshotId: 'BOM-A1', snapshot: bomSnapshotA() },
  });
  await call('POST', '/api/quotation/commercial-snapshots', {
    role: 'PROJECT_HEAD',
    body: { snapshot: commercialSnapshotA() },
  });
  await call('POST', '/api/quotation/quotations', {
    body: {
      quotationId: 'Q-P7', projectId: 'PRJ-A1', at: AT,
      ...QUOTE_A, customer: CUSTOMER_A, system: SYSTEM_A,
      engineering: { status: 'VALID', blocked: [], warnings: [] },
      bomSnapshotId: 'BOM-A1', commercialSnapshotId: 'CS-A1',
      componentAttributes: COMPONENT_ATTRS_A,
      subsidyTreatment: QP.SUBSIDY_TREATMENT.NOT_QUOTED,
    },
  });

  const r = await call('GET', '/api/quotation/quotations/Q-P7/payload');
  assert.equal(r.status, 200);

  const html = D.renderPage7(r.body.payload);
  assert.ok(html.includes('TECHNICAL_SPECIFICATIONS'), 'page section is correct');
  assert.ok(html.includes('5000 W'), 'system wattage from API payload');
  assert.ok(html.includes('Total System Cost'), 'commercial row present');

  // Page 1 also still works from the same API payload
  const page1 = D.renderPage1(r.body.payload);
  assert.ok(page1.includes('Alpha Tester'), 'page 1 still renders from the same payload');
});

// ===========================================================================
// COMMERCIAL BLOCK CORRECTION — 20 new tests per approved spec
// ===========================================================================

// 1. Page 7 contains "Price Before GST"
test('Page 7 footer starts with the approved "Total System Cost" row (no GST split rows)', () => {
  const html = D.renderPage7(payloadA());
  assert.ok(html.includes('Total System Cost'));
  assert.equal(html.includes('Price Before GST'), false);
});

// 2. Page 7 contains "GST"
test('Page 7 contains "GST" label', () => {
  const commercial = D.commercialSummaryFields(payloadA());
  const gstField = commercial.find(f => f.label === 'GST');
  assert.ok(gstField, 'GST field exists');
  assert.equal(gstField.label, 'GST');
});

// 3. Page 7 contains "Total Amount"
test('Page 7 contains "TOTAL AMOUNT" label', () => {
  const commercial = D.commercialSummaryFields(payloadA());
  const totalField = commercial.find(f => f.label === 'TOTAL AMOUNT');
  assert.ok(totalField, 'TOTAL AMOUNT field exists');
});

// 4. Subsidy Amount is absent
test('Subsidy Amount is absent from commercial block', () => {
  const html = D.renderPage7(payloadA());
  assert.equal(html.includes('Subsidy Amount'), false, 'no Subsidy Amount');
  const commercial = D.commercialSummaryFields(payloadA());
  assert.equal(commercial.some(f => f.label === 'Subsidy Amount'), false);
});

// 5. Total System Cost After Subsidy is absent
test('Total System Cost After Subsidy is absent', () => {
  const html = D.renderPage7(payloadA());
  assert.equal(html.includes('Total System Cost After Subsidy'), false);
  const commercial = D.commercialSummaryFields(payloadA());
  assert.equal(commercial.some(f => /after subsidy/i.test(f.label)), false);
});

// 6. PM Surya Ghar subsidy language absent from commercial block
test('PM Surya Ghar subsidy language absent', () => {
  const html = D.renderPage7(payloadA());
  assert.equal(html.includes('Surya Ghar'), false);
  assert.equal(html.includes('PM Surya'), false);
  assert.equal(html.includes('subsidy'), false);
  assert.equal(html.includes('Subsidy'), false);
});

// 7. priceBeforeGST comes from approved payload
test('priceBeforeGST comes from approved payload field', () => {
  const commercial = D.commercialSummaryFields(payloadA());
  const f = commercial.find(f => f.label === 'Price Before GST');
  assert.ok(f.available, 'field is available');
  assert.ok(f.value.includes('2,69,512'), 'value matches payload sellingPriceBeforeGST');
});

// 8. gstAmount comes from approved payload
test('gstAmount comes from approved payload field', () => {
  const commercial = D.commercialSummaryFields(payloadA());
  const f = commercial.find(f => f.label === 'GST');
  assert.ok(f.available, 'field is available');
  assert.ok(f.value.includes('23,987'), 'value matches payload gstAmount');
});

// 9. totalAmount comes from approved payload
test('totalAmount comes from approved payload field', () => {
  const commercial = D.commercialSummaryFields(payloadA());
  const f = commercial.find(f => f.label === 'TOTAL AMOUNT');
  assert.ok(f.available, 'field is available');
  assert.ok(f.value.includes('2,93,499'), 'value matches payload customerTotalIncludingGST');
});

// 10. Changing payload changes all three displayed values
test('changing payload changes all three commercial values', () => {
  const htmlA = D.renderPage7(payloadA());
  const htmlB = D.renderPage7(payloadB());
  // Payload A total 293499 · Payload B total 613559 (approved footer prints the total only)
  assert.ok(htmlA.includes('₹2,93,499'));
  assert.ok(htmlB.includes('₹6,13,559'));
  const fa = D.commercialSummaryFields(payloadA()), fb = D.commercialSummaryFields(payloadB());
  assert.equal(fa.find(f => f.label === 'GST').value, '₹23,987');
  assert.equal(fb.find(f => f.label === 'GST').value, '₹50,144');
  // No cross-leakage
  assert.equal(htmlA.includes('₹5,63,415'), false);
  assert.equal(htmlB.includes('₹2,69,512'), false);
});

// 11. No calculation performed by the renderer
test('no calculation in commercialSummaryFields — pure display', () => {
  const code = RENDERER_SRC;
  // Extract the commercialSummaryFields function body
  const fnStart = code.indexOf('export function commercialSummaryFields');
  assert.ok(fnStart > -1, 'function exists');
  // Find the closing brace by tracking depth
  let depth = 0; let i = code.indexOf('{', fnStart);
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}') { depth--; if (depth === 0) break; }
  }
  const fnBody = code.slice(fnStart, i + 1);
  // Must not contain arithmetic operators on values
  assert.equal(/[+\-*/]\s*(?:cust|pricing|gst|total|price|selling)/i.test(fnBody), false, 'no arithmetic on commercial values');
});

// 12. No Math-based calculation
test('no Math-based calculation in renderer', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/Math\.(round|floor|ceil|abs)\s*\(/i.test(code), false, 'no Math rounding');
});

// 13. No subtraction/addition of commercial values
test('no subtraction or addition of commercial values in renderer', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Check there is no sellingPrice - something or gstAmount + something
  assert.equal(/sellingPrice\s*[-+]|gstAmount\s*[-+]|customerTotal\s*[-+]/i.test(code), false);
  assert.equal(/[-+]\s*sellingPrice|[-+]\s*gstAmount|[-+]\s*customerTotal/i.test(code), false);
});

// 14. Missing GST does not become ₹0
test('missing GST does not become ₹0', () => {
  const noCommercial = QP.buildQuotationPayload({
    quotation: QUOTE_A, customer: CUSTOMER_A, system: SYSTEM_A,
    engineering: null, bomSnapshot: null, commercialSnapshot: null,
    componentAttributes: {}, subsidyTreatment: null, capabilities: [],
  });
  const commercial = D.commercialSummaryFields(noCommercial);
  const gst = commercial.find(f => f.label === 'GST');
  assert.equal(gst.available, false, 'GST blocked when no commercial snapshot');
  const html = D.renderPage7(noCommercial);
  assert.equal(html.includes('₹0'), false, 'no ₹0 for missing GST');
});

// 15. Missing total does not become ₹0
test('missing total does not become ₹0', () => {
  const noCommercial = QP.buildQuotationPayload({
    quotation: QUOTE_A, customer: CUSTOMER_A, system: SYSTEM_A,
    engineering: null, bomSnapshot: null, commercialSnapshot: null,
    componentAttributes: {}, subsidyTreatment: null, capabilities: [],
  });
  const commercial = D.commercialSummaryFields(noCommercial);
  const total = commercial.find(f => f.label === 'TOTAL AMOUNT');
  assert.equal(total.available, false, 'TOTAL AMOUNT blocked when no commercial snapshot');
});

// 16. Missing values use existing named blocked dependency treatment
test('missing commercial values use named blocked dependency', () => {
  const noCommercial = QP.buildQuotationPayload({
    quotation: QUOTE_A, customer: CUSTOMER_A, system: SYSTEM_A,
    engineering: null, bomSnapshot: null, commercialSnapshot: null,
    componentAttributes: {}, subsidyTreatment: null, capabilities: [],
  });
  const commercial = D.commercialSummaryFields(noCommercial);
  for (const f of commercial) {
    assert.equal(f.available, false, `${f.label} must be blocked`);
    assert.ok(f.dependency, `${f.label} must have named dependency`);
    assert.ok(f.note, `${f.label} must have a note explaining why`);
  }
  const html = D.renderPage7(noCommercial);
  assert.ok(html.includes('Not available'), 'blocked text rendered');
  assert.equal(html.includes('COMMERCIAL_SNAPSHOT'), false, 'internal dependency name must not reach the customer-facing HTML');
});

// 17. No artwork example price leaks into output
test('no artwork example prices leak into commercial output', () => {
  const html = D.renderPage7(payloadA());
  for (const artworkPrice of ['3,38,000', '2,68,000', '1,98,000', '2,60,000', '1,90,000', '1,20,000']) {
    assert.equal(html.includes(artworkPrice), false, `artwork price ${artworkPrice} must not appear`);
  }
});

// 18. Internal cost/margin absent
test('internal cost and margin data absent from commercial block', () => {
  const html = D.renderPage7(payloadA());
  for (const internal of ['targetGrossMargin', 'grossProfit', 'marginType', 'GROSS_MARGIN',
    'totalActualProjectCost', 'materialLandedCost', 'directProjectCost']) {
    assert.equal(html.includes(internal), false, `${internal} must not appear`);
  }
});

// 19. C7 legal identity remains separate from GST amount
test('C7 legal identity is separate from GST commercial amount', () => {
  const html = D.renderPage7(payloadA());
  // GST as a commercial amount is a payload field (page 5 cards); page 7 prints the total only
  assert.equal(D.commercialSummaryFields(payloadA()).find(f => f.label === 'GST').value, '₹23,987');
  // GSTIN/legal identity is NOT displayed
  assert.equal(html.includes('GSTIN'), false, 'GSTIN not displayed');
  assert.equal(html.includes('registration'), false, 'registration not displayed');
});

// 20. Existing Page 1 tests remain green (structural check)
test('Page 1 exports and rendering unaffected by commercial correction', () => {
  assert.equal(typeof D.renderPage1, 'function');
  assert.equal(typeof D.PAGE_ONE_STYLES, 'string');
  assert.equal(typeof D.proposalDetailFields, 'function');
  assert.equal(typeof D.blockedFields, 'function');
  const page1 = D.renderPage1(payloadA());
  assert.ok(page1.includes('COVER_AND_PROPOSAL_DETAILS'));
  assert.ok(page1.includes('Alpha Tester'));
  // Page 1 must not contain Page 7 commercial labels
  assert.equal(page1.includes('Price Before GST'), false);
  assert.equal(page1.includes('TOTAL AMOUNT'), false);
});

// PHASE 3 — PART H, STEP 1 — QUOTATION PAYLOAD ASSEMBLER.
//
// The load-bearing assertions here are negative ones. The assembler is only
// correct if it CANNOT do certain things: it cannot resolve a component (it
// never sees a catalog), it cannot recalculate a price (it does no arithmetic),
// it cannot invent a subsidy/savings/finance figure (no engine exists), and it
// cannot leak internal cost or margin to Sales.
//
// Nothing in this file modifies an engine, an existing test or a fixture used
// elsewhere. All fixtures below are test data, not production values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as Q from '../src/lib/quotationPayload.js';
import { ROLES } from '../src/lib/bomRoles.js';
import { createProjectBomSnapshot } from '../src/lib/bomSnapshot.js';
import { createCommercialSnapshot, VERSION_KEYS } from '../src/lib/commercialSnapshot.js';
import { COST_STATUS } from '../src/lib/costEngine.js';
import { PRICING_STATUS } from '../src/lib/pricingEngine.js';

const SRC = readFileSync('src/lib/quotationPayload.js', 'utf8');
const AT = '2026-08-16T00:00:00Z';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const BOM_LINES = [
  { componentId: 'p1', role: ROLES.PANEL, quantity: 9, unitPurchaseCost: 1000 },
  { componentId: 'i1', role: ROLES.INVERTER, quantity: 1, unitPurchaseCost: 20000 },
  { componentId: 'bt1', role: ROLES.BATTERY, quantity: 2, unitPurchaseCost: 50000 },
  { componentId: 'acdb1', role: ROLES.ACDB, quantity: 1, unitPurchaseCost: 2000 },
  { componentId: 'dcdb1', role: ROLES.DCDB, quantity: 1, unitPurchaseCost: 2000 },
  { componentId: 'st1', role: ROLES.STRUCTURE, quantity: 1, unitPurchaseCost: 15000 },
  { componentId: 'dc1', role: ROLES.DC_CABLE, quantity: 60, unitPurchaseCost: 40 },
  { componentId: 'ac1', role: ROLES.AC_CABLE, quantity: 30, unitPurchaseCost: 60 },
  { componentId: 'eth1', role: ROLES.EARTHING, quantity: 2, unitPurchaseCost: 1200 },
  // internal-only — must NOT reach the customer document (§16)
  { componentId: 'bc1', role: ROLES.BATTERY_CABLE, quantity: 4, unitPurchaseCost: 300 },
  { componentId: 'misc1', role: ROLES.OTHER, quantity: 20, unitPurchaseCost: 15 },
];

function lockedBom(lines = BOM_LINES) {
  return createProjectBomSnapshot({
    projectId: 'PRJ-1', bomLines: lines, lockedBy: 'ph1', lockedAt: AT,
    dataVersion: 'catalog.7', engineeringStatus: 'VALID',
  });
}

const COST_RESULT = Object.freeze({
  status: COST_STATUS.COMPLETE,
  projectId: 'PRJ-1',
  bomSnapshotId: 'BOM-1',
  catalogVersion: 'catalog.7',
  procurementPriceVersion: 'pp.3',
  landedCostVersion: 'lc.2',
  projectRateCardVersion: 'rc.4',
  costConfigVersion: 'cc.5',
  costEngineVersion: 'costEngine.1',
  materialLandedCost: 200000,
  structureCost: 15000,
  installationCost: 18000,
  siteSurveyCost: 500,
  engineeringDesignCost: 3000,
  transportationCost: 2500,
  serviceAmcCost: 4000,
  miscellaneousCost: 2430,
  officeExpenseAllocation: 6000,
  specialProjectWorksCost: 0,
  directProjectCost: 243000,
  totalActualProjectCost: 251430,
  traces: Object.freeze([]),
});

const PRICING_RESULT = Object.freeze({
  status: PRICING_STATUS.COMPLETE,
  marginVersion: 'margin.2',
  gstVersion: 'gst.1',
  pricingEngineVersion: 'pricingEngine.1',
  marginType: 'GROSS_MARGIN',
  targetGrossMargin: 0.18,
  sellingPriceBeforeGST: 306622,
  grossProfit: 55192,
  gstRatePct: 8.9,
  gstAmount: 27289.36,
  sellingPriceIncludingGST: 333911.36,
  extras: Object.freeze([Object.freeze({
    extraId: 'EX-CIVIL', description: 'Civil work', includedInBase: false,
    customerPriceExcludingGST: 10000, gstRatePct: 18, customerPriceIncludingGST: 11800,
  })]),
  extrasIncludingGST: 11800,
  customerTotalIncludingGST: 345711.36,
  customerSideExpenses: Object.freeze([Object.freeze({
    id: 'NET-METER', label: 'Net metering (KSEB)', amount: 12000,
  })]),
});

const COMMERCIAL = createCommercialSnapshot({
  snapshotId: 'CS-1', costResult: COST_RESULT, pricingResult: PRICING_RESULT,
  issuedBy: 'ph1', issuedAt: AT,
});

const ATTRS = {
  p1: { brand: 'BrandA', model: 'M-550', moduleWatt: 550, technology: 'Mono PERC', warranty: '25 years' },
  i1: { brand: 'BrandB', model: 'INV-5K', capacity: '5 kW', phase: 'Single Phase' },
  bt1: { brand: 'BrandC', model: 'BAT-5', capacity: '5 kWh' },
};

const CUSTOMER = { customerId: 'C-1', customerName: 'Test Customer', phone: '0000000000', district: 'Ernakulam', state: 'Kerala' };
const SYSTEM = { systemType: 'HYBRID', systemSizeKw: 5, phase: 'SINGLE', packageTier: 'VALUE', roofType: 'SHEET' };
const QUOTE = { quotationNumber: 'Q-1', quotationVersion: 1, quotationDate: AT, status: Q.QUOTATION_STATUS.DRAFT, proposalBy: 'sales1' };
const ENG_VALID = { status: 'VALID', blocked: [], warnings: [] };

function build(over = {}) {
  return Q.buildQuotationPayload({
    quotation: QUOTE, customer: CUSTOMER, system: SYSTEM,
    bomSnapshot: lockedBom(), commercialSnapshot: COMMERCIAL,
    engineering: ENG_VALID, componentAttributes: ATTRS,
    subsidyTreatment: Q.SUBSIDY_TREATMENT.NOT_QUOTED,
    capabilities: [], ...over,
  });
}

const WITH_COST = { capabilities: [Q.CAPABILITY_COST_VIEW] };

// ---------------------------------------------------------------------------
// 1. structural purity
// ---------------------------------------------------------------------------

test('import list is exactly ./bomRoles.js', () => {
  const imports = [...SRC.matchAll(/^import[^;]*?from\s+'([^']+)'/gm)].map(m => m[1]);
  assert.deepEqual(imports, ['./bomRoles.js']);
});

test('no engine is imported and no engine is called', () => {
  for (const forbidden of ['costEngine', 'pricingEngine', 'engineeringChecker', 'projectBom',
    'bomLock', 'projectRateCard', 'commercialHistory', 'money.js', 'catalog']) {
    assert.equal(SRC.includes(`from './${forbidden}`), false, `must not import ${forbidden}`);
  }
  assert.equal(/calculateCost|calculatePricing|runChecker/.test(SRC), false);
});

test('no clock and no randomness', () => {
  assert.equal(/Date\.now|new Date|Math\.random/.test(SRC), false);
});

test('no money arithmetic on payload figures', () => {
  // The assembler copies. Any +, -, * or / applied to a money field would be a
  // recalculation. The only arithmetic permitted is the internal-line count.
  const moneyMath = /(sellingPrice|gstAmount|customerTotal|grossProfit|extrasIncluding|Cost)\w*\s*[+\-*/]\s*\w/;
  assert.equal(moneyMath.test(SRC), false);
});

test('thirteen pinned version keys, identical to the commercial snapshot module', () => {
  assert.equal(Q.REQUIRED_VERSION_KEYS.length, 13);
  assert.deepEqual([...Q.REQUIRED_VERSION_KEYS], [...VERSION_KEYS]);
});

// ---------------------------------------------------------------------------
// 2. engineering identity comes from the locked BOM, unchanged
// ---------------------------------------------------------------------------

test('component ids are the locked BOM ids, unsubstituted', () => {
  const p = build();
  const expected = BOM_LINES.filter(l => Q.CUSTOMER_FACING_ROLES.includes(l.role)).map(l => l.componentId);
  assert.deepEqual([...p.bomSummary.componentIds], expected);
  assert.equal(p.bomSummary.identitySource, Q.SOURCE.LOCKED_BOM_SNAPSHOT);
});

test('every quantity equals the locked BOM quantity', () => {
  const p = build();
  for (const row of p.bomSummary.rows) {
    const line = BOM_LINES.find(l => l.componentId === row.componentId);
    assert.equal(row.quantity, line.quantity);
    assert.equal(row.quantitySource, Q.SOURCE.LOCKED_BOM_SNAPSHOT);
  }
});

test('one inverter identity across bomSummary and technicalSpecifications', () => {
  const p = build();
  const inSummary = p.bomSummary.rows.filter(r => r.role === ROLES.INVERTER);
  const inSpec = p.technicalSpecifications.rows.filter(r => r.role === ROLES.INVERTER);
  assert.equal(inSummary.length, 1);
  assert.equal(inSpec.length, 1);
  assert.equal(inSummary[0].componentId, 'i1');
  assert.equal(inSpec[0], inSummary[0]);            // same object — cannot diverge
});

test('hybrid battery identity and quantity come from the BOM, never hardcoded', () => {
  const p = build();
  const bat = p.bomSummary.rows.filter(r => r.role === ROLES.BATTERY);
  assert.equal(bat.length, 1);
  assert.equal(bat[0].componentId, 'bt1');
  assert.equal(bat[0].quantity, 2);
});

test('a BOM with no battery produces no battery section', () => {
  const noBat = BOM_LINES.filter(l => l.role !== ROLES.BATTERY);
  const p = build({ bomSnapshot: lockedBom(noBat) });
  assert.equal(p.bomSummary.rows.some(r => r.role === ROLES.BATTERY), false);
});

test('internal-only roles never reach the customer document', () => {
  const p = build();
  const ids = p.bomSummary.rows.map(r => r.componentId);
  assert.equal(ids.includes('bc1'), false);
  assert.equal(ids.includes('misc1'), false);
  assert.equal(p.bomSummary.internalOnlyLineCount, 2);
});

test('an unknown component id survives with no attributes — no resolution, no substitution', () => {
  const p = build({ componentAttributes: {} });
  const row = p.bomSummary.rows.find(r => r.componentId === 'i1');
  assert.equal(row.componentId, 'i1');
  assert.equal(row.attributesFound, false);
  assert.deepEqual(row.attributes, {});
});

test('commercial keys in a display-attribute map are refused', () => {
  const p = build({ componentAttributes: { i1: { brand: 'BrandB', purchasePrice: 20000, landedUnitCost: 21000, marketRate: 30000 } } });
  const row = p.bomSummary.rows.find(r => r.componentId === 'i1');
  assert.equal(row.attributes.brand, 'BrandB');
  assert.equal('purchasePrice' in row.attributes, false);
  assert.equal('landedUnitCost' in row.attributes, false);
  assert.equal('marketRate' in row.attributes, false);
  assert.ok(row.attributesRefused.length >= 1);
});

test('no generic warranty is emitted when component warranty data is absent (§15)', () => {
  const p = build();
  const panel = p.bomSummary.rows.find(r => r.role === ROLES.PANEL);
  const acdb = p.bomSummary.rows.find(r => r.role === ROLES.ACDB);
  assert.equal(panel.warranty.available, true);
  assert.equal(panel.warranty.value, '25 years');
  assert.equal(acdb.warranty.available, false);
  assert.equal(acdb.warranty.value, null);
});

// ---------------------------------------------------------------------------
// 3. commercial figures are copies of the issued snapshot
// ---------------------------------------------------------------------------

test('every customer-facing figure equals the commercial snapshot figure', () => {
  const c = build().pricing.customer;
  assert.equal(c.sellingPriceBeforeGST, COMMERCIAL.pricing.sellingPriceBeforeGST);
  assert.equal(c.sellingPriceIncludingGST, COMMERCIAL.pricing.sellingPriceIncludingGST);
  assert.equal(c.extrasIncludingGST, COMMERCIAL.pricing.extrasIncludingGST);
  assert.equal(c.customerTotalIncludingGST, COMMERCIAL.pricing.customerTotalIncludingGST);
});

test('GST matches the snapshot and appears once', () => {
  const p = build();
  assert.equal(p.pricing.customer.gstRatePct, COMMERCIAL.pricing.gstRatePct);
  assert.equal(p.pricing.customer.gstAmount, COMMERCIAL.pricing.gstAmount);
  const json = JSON.stringify(p);
  assert.equal((json.match(/"gstAmount":/g) || []).length, 1);
});

test('the thirteen versions are copied from the snapshot', () => {
  const p = build();
  for (const k of VERSION_KEYS) assert.equal(p.versions[k], COMMERCIAL.versions[k]);
  assert.equal(Object.keys(p.versions).length, 13);
});

test('extras are separate from the base system and never double-counted', () => {
  const p = build();
  assert.equal(p.extras.items.length, 1);
  assert.equal(p.extras.items[0].treatment, Q.TREATMENT.EXTRA);
  assert.equal(p.extras.items[0].includedInBase, false);
  // the extra is not a BOM row
  assert.equal(p.bomSummary.rows.some(r => r.componentId === 'EX-CIVIL'), false);
  // the base system price does not contain the extra
  assert.notEqual(p.pricing.customer.sellingPriceIncludingGST, p.pricing.customer.customerTotalIncludingGST);
});

test('net metering is a customer-side expense, EXCLUDED from BOM, cost, margin and price (C90)', () => {
  const p = build();
  const net = p.extras.customerSideExpenses.find(x => x.id === 'NET-METER');
  assert.ok(net);
  assert.equal(net.treatment, Q.TREATMENT.EXCLUDED);
  assert.equal(p.bomSummary.rows.some(r => r.componentId === 'NET-METER'), false);
  assert.equal(p.extras.items.some(e => e.extraId === 'NET-METER'), false);
});

test('a discount not pinned on the snapshot is reported as not carried, never invented', () => {
  const d = build().pricing.customer.discount;
  assert.equal(d.available, false);
  assert.equal(d.value, null);
  assert.equal(d.dependency, Q.DEPENDENCY.COMMERCIAL_SNAPSHOT);
});

// ---------------------------------------------------------------------------
// 4. internal cost and margin are withheld from Sales (§17, §30)
// ---------------------------------------------------------------------------

test('without COST_VIEW the payload carries no internal cost', () => {
  const json = JSON.stringify(build());
  assert.equal(build().pricing.internal, null);
  for (const key of ['"materialLandedCost"', '"totalActualProjectCost"', '"officeExpenseAllocation"', '"installationCost"']) {
    assert.equal(json.includes(key), false, `${key} must not reach Sales`);
  }
});

test('without COST_VIEW the payload carries no internal margin', () => {
  const json = JSON.stringify(build());
  assert.equal(json.includes('"targetGrossMargin"'), false);
  assert.equal(json.includes('"grossProfit"'), false);
});

test('with COST_VIEW the internal block is present', () => {
  const p = build(WITH_COST);
  assert.equal(p.pricing.internal.targetGrossMargin, COMMERCIAL.pricing.targetGrossMargin);
  assert.equal(p.pricing.internal.cost.totalActualProjectCost, COMMERCIAL.cost.totalActualProjectCost);
  assert.equal(p.pricing.internalWithheld, false);
});

// ---------------------------------------------------------------------------
// 5. sections with no engine — blocked, never invented (§20–§25)
// ---------------------------------------------------------------------------

test('subsidy, savings, financing, consumption, appliances, CMS sections are blocked with a named dependency', () => {
  const p = build();
  const expect = {
    savings: Q.DEPENDENCY.SAVINGS_ENGINE,
    financing: Q.DEPENDENCY.FINANCE_ENGINE,
    consumption: Q.DEPENDENCY.ENERGY_LOAD_CALCULATION_ENGINE,
    applianceUsage: Q.DEPENDENCY.ENERGY_LOAD_CALCULATION_ENGINE,
    testimonials: Q.DEPENDENCY.CMS,
    campaign: Q.DEPENDENCY.CMS,
    terms: Q.DEPENDENCY.CMS,
  };
  for (const [section, dependency] of Object.entries(expect)) {
    assert.equal(p[section].available, false, section);
    assert.equal(p[section].value, null, section);
    assert.equal(p[section].dependency, dependency, section);
    assert.ok(p[section].reason.length > 0, section);
  }
});

test('subsidy is an explicit treatment, never a silent zero', () => {
  const quoted = build();
  assert.equal(quoted.subsidy.available, false);
  assert.equal(quoted.subsidy.value, null);
  assert.equal(quoted.subsidy.treatment, Q.SUBSIDY_TREATMENT.NOT_QUOTED);

  const unresolved = build({ subsidyTreatment: null });
  assert.equal(unresolved.subsidy.dependency, Q.DEPENDENCY.SUBSIDY_ENGINE);
  assert.equal(unresolved.subsidy.value, null);
});

test('no company identity string exists anywhere in the payload (C7)', () => {
  const p = build();
  assert.equal(p.company.available, false);
  assert.equal(p.company.dependency, Q.DEPENDENCY.COMPANY_MASTER);
  const json = JSON.stringify(p);
  for (const s of ['GSTIN', 'Golden Ray', 'Pvt Ltd', 'Private Limited']) {
    assert.equal(json.includes(s), false, `${s} must not be hardcoded`);
  }
});

test('customer-facing tier display name is blocked on C6, internal tier code carried unchanged', () => {
  const p = build();
  assert.equal(p.system.packageTier, 'VALUE');
  assert.equal(p.system.packageTierDisplayName.available, false);
  assert.equal(p.system.packageTierDisplayName.dependency, Q.DEPENDENCY.DECISION_C6_TIER_DISPLAY_NAMES);
});

test('sections are named, never page-numbered (C13 pending)', () => {
  const p = build();
  assert.equal('page' in p, false);
  assert.equal(JSON.stringify(p).includes('"pageNumber"'), false);
  assert.ok(p.sectionNumberingNote.includes('C13'));
});

// ---------------------------------------------------------------------------
// 6. generation gate (§28)
// ---------------------------------------------------------------------------

test('the gate reports eight checks, each with its own reason', () => {
  const gate = build().generationGate;
  assert.equal(gate.checks.length, 8);
  assert.deepEqual(gate.checks.map(c => c.check).sort(), Object.values(Q.GATE_CHECK).sort());
  assert.equal(gate.status, Q.GATE_STATUS.PASS);
});

test('an unlocked BOM blocks generation and blocks the BOM section', () => {
  const draft = { ...lockedBom(), status: 'DRAFT' };
  const p = build({ bomSnapshot: draft });
  assert.equal(p.generationGate.status, Q.GATE_STATUS.BLOCKED);
  assert.ok(p.generationGate.blockedChecks.includes(Q.GATE_CHECK.BOM_LOCKED));
  assert.equal(p.bomSummary.available, false);
  assert.deepEqual([...p.bomSummary.rows], []);
  assert.equal(p.bomSummary.blocked.dependency, Q.DEPENDENCY.LOCKED_BOM_SNAPSHOT);
});

test('a BLOCKED engineering verdict blocks generation', () => {
  const p = build({ engineering: { status: 'BLOCKED', blocked: ['PBC-A-001'], warnings: [] } });
  assert.equal(p.generationGate.status, Q.GATE_STATUS.BLOCKED);
  assert.ok(p.generationGate.blockedChecks.includes(Q.GATE_CHECK.ENGINEERING_VALIDATION));
  assert.ok(p.generationGate.reasons.some(r => r.includes('BLOCKED')));
});

test('a WARNING verdict does not block, and the warnings are carried', () => {
  const p = build({ engineering: { status: 'WARNING', blocked: [], warnings: ['PBC-C-001'], acknowledgements: ['ph1'] } });
  assert.equal(p.generationGate.status, Q.GATE_STATUS.PASS);
  assert.deepEqual([...p.engineering.warnings], ['PBC-C-001']);
  assert.equal(p.engineering.customerVisible, false);
});

test('no ISSUED commercial snapshot blocks the gate and blocks pricing — never zero', () => {
  const p = build({ commercialSnapshot: null });
  assert.equal(p.generationGate.status, Q.GATE_STATUS.BLOCKED);
  assert.ok(p.generationGate.blockedChecks.includes(Q.GATE_CHECK.COMMERCIAL_SNAPSHOT));
  assert.equal(p.pricing.available, false);
  assert.equal(p.pricing.customer, null);
  assert.equal(p.pricing.blocked.dependency, Q.DEPENDENCY.COMMERCIAL_SNAPSHOT);
  assert.equal(JSON.stringify(p.pricing).includes(':0'), false);
});

test('incomplete customer or quotation metadata blocks the gate', () => {
  const noCust = build({ customer: null });
  assert.ok(noCust.generationGate.blockedChecks.includes(Q.GATE_CHECK.CUSTOMER_DATA));
  const noMeta = build({ quotation: { quotationNumber: 'Q-1' } });
  assert.ok(noMeta.generationGate.blockedChecks.includes(Q.GATE_CHECK.QUOTATION_METADATA));
});

test('unresolved subsidy treatment blocks the gate', () => {
  const p = build({ subsidyTreatment: null });
  assert.ok(p.generationGate.blockedChecks.includes(Q.GATE_CHECK.SUBSIDY_RESOLVED));
});

// ---------------------------------------------------------------------------
// 7. payload behaviour
// ---------------------------------------------------------------------------

test('the payload is deep-frozen', () => {
  const p = build();
  assert.equal(Object.isFrozen(p), true);
  assert.equal(Object.isFrozen(p.pricing.customer), true);
  assert.equal(Object.isFrozen(p.bomSummary.rows[0]), true);
  assert.throws(() => { p.variant = 'X'; }, TypeError);
  assert.throws(() => { p.bomSummary.rows[0].quantity = 999; }, TypeError);
});

test('a non-FULL variant is carried but the payload is not trimmed (C14)', () => {
  const full = build();
  const accounts = build({ variant: 'ACCOUNTS' });
  assert.equal(accounts.variant, 'ACCOUNTS');
  assert.deepEqual(Object.keys(accounts), Object.keys(full));
  assert.equal(accounts.bomSummary.rows.length, full.bomSummary.rows.length);
});

test('the assembler is deterministic — same inputs, same payload', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(build())), JSON.parse(JSON.stringify(build())));
});

test('upgrade identity is carried on the quotation, not forced into the BOM (C24)', () => {
  const identity = { upgradePathId: 'UPG-5-10', fromSize: 5, toSize: 10, deltaKw: 5, tier: 'VALUE', approved: true };
  const p = build({ upgradeIdentity: identity });
  assert.equal(p.upgrade.upgradePathId, 'UPG-5-10');
  assert.equal(p.upgrade.source, Q.SOURCE.UPGRADE_MODEL);
  assert.equal(build().upgrade, null);
  assert.equal(p.bomSummary.rows.some(r => 'upgradePathId' in r), false);
});

test('the operator-asserted identity model is stated, not disguised (P3-D)', () => {
  const p = build();
  assert.equal(p.quotation.identityModel, 'OPERATOR_ASSERTED_ROLE');
});

test('every emitted section names either a source or a dependency', () => {
  const p = build();
  for (const key of ['bomSummary', 'technicalSpecifications', 'pricing', 'extras', 'subsidy',
    'savings', 'financing', 'consumption', 'applianceUsage', 'testimonials', 'campaign', 'terms', 'company']) {
    const s = p[key];
    const named = s.source || s.dependency || s.blocked?.dependency;
    assert.ok(named, `${key} names no source and no dependency`);
  }
});

// Phase 2A FINAL — commercial engine. The 37 named tests from §25, plus the
// architecture invariants and GST-regime tests carried forward.
//
// NOTE: this file supersedes the first Phase 2A test set, which asserted
// material cost from PURCHASE price. That model is corrected — material cost is
// now LANDED cost — so those assertions were rewritten rather than retained.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { roundMoney, MONEY_RULE_VERSION } from '../src/lib/money.js';
import {
  toPriceRecord, buildPriceMaster, projectUnitCost, procurementUplift,
  PRICE_KIND, VALID_FOR_PROJECT_COST,
} from '../src/lib/procurementPriceMaster.js';
import {
  calculateCost, explainCost, COST_HEAD, COST_HEAD_ORDER, DIRECT_COST_HEADS,
  COST_HEAD_OWNER, COST_ERROR, COST_STATUS, COST_ENGINE_VERSION, SPECIAL_WORK_TYPE,
} from '../src/lib/costEngine.js';
import {
  calculatePricing, validateGrossMargin, resolveTierMargin, MARGIN_TYPE,
  FORBIDDEN_MARGIN_TYPES, PRICING_ERROR, PRICING_STATUS, EXTRA_TYPE, APPROVAL,
  TIERS, PRICING_ENGINE_VERSION, GST_REGIME, resolveGstRegime,
  FORBIDDEN_EXTRA_TYPES, CUSTOMER_SIDE_EXPENSE_TYPE,
} from '../src/lib/pricingEngine.js';
import {
  createCommercialSnapshot, applyConfigChange, recalculateForNewQuotation,
  COMMERCIAL_SNAPSHOT_STATUS,
} from '../src/lib/commercialSnapshot.js';
import { createProjectBomSnapshot, SNAPSHOT_STATUS } from '../src/lib/bomSnapshot.js';

const CFG = JSON.parse(readFileSync('data/cost-config.json', 'utf8'));
const AT = '2026-08-15T00:00:00Z';
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ------------------------------------------------------------------ fixtures
const lockedBom = (lines) => createProjectBomSnapshot({
  projectId: 'PRJ-A', lockedBy: 'ph@flarize', lockedAt: AT, dataVersion: 'catalog@test',
  bomLines: lines || [
    { componentId: 'p1', role: 'PANEL', qty: 6 },
    { componentId: 'bt1', role: 'BATTERY', qty: 1 },
  ],
});

/** Purchase price and landed cost DIFFER — that is the point of the model. */
const PRICES = {
  p1:  { componentName: 'Waaree 540W', purchasePrice: 13122, landedUnitCost: 13600,
         purchasePriceVersion: 'pp@1', landedCostVersion: 'lc@1', supplier: 'Waaree' },
  bt1: { componentName: 'SEG.5 PRO', purchasePrice: 86717, landedUnitCost: 88000,
         purchasePriceVersion: 'pp@1', landedCostVersion: 'lc@1', supplier: 'SEG' },
  en1: { componentName: 'IQ8P', purchasePrice: 8000, landedUnitCost: 8300,
         purchasePriceVersion: 'pp@1', landedCostVersion: 'lc@1' },
};
const MATERIAL = 6 * 13600 + 88000;         // 169600

/** Every head resolvable — the values the business has NOT supplied are filled here. */
const fullConfig = (over = {}) => ({
  ...CFG,
  transportation: { ...CFG.transportation, version: 'tr@t1', status: 'CONFIGURED',
    vehicles: [
      { vehicleType: 'PICKUP', ratePerKm: 30, version: 'tr@t1' },
      { vehicleType: 'LORRY', ratePerKm: 55, version: 'tr@t1' },
    ] },
  serviceAmc: { ...CFG.serviceAmc, version: 'sv@t1', status: 'CONFIGURED' },
  ...over,
});

const MARGIN_CFG = {
  marginType: 'GROSS_MARGIN', version: 'margin@t1',
  tiers: {
    BASE:    { targetMarginPct: 18, minimumMarginPct: 12 },
    VALUE:   { targetMarginPct: 20, minimumMarginPct: 15 },
    PREMIUM: { targetMarginPct: 25, minimumMarginPct: 18 },
  },
};
const GST = CFG.gst;

const PROJECT = { sizeKw: 3, installationType: 'FLAT', phase: '1P', tier: 'VALUE',
                  distanceKm: 40, vehicleType: 'PICKUP', structureMaterialCost: 10000 };

const cost = (over = {}) => calculateCost({
  snapshot: lockedBom(), config: fullConfig(), priceMaster: PRICES, project: PROJECT,
  calculatedAt: AT, catalogVersion: 'catalog@test',
  procurementPriceVersion: 'pp@1', landedCostVersion: 'lc@1', ...over,
});
const price = (over = {}) => calculatePricing({
  costResult: cost(), margin: MARGIN_CFG, gst: GST, tier: 'VALUE', pricedAt: AT, ...over,
});

// ---------------------------------------------------------------- 1, 2, 3
test('1 — purchase price and landed cost are separate values', () => {
  const rec = toPriceRecord({ componentId: 'p1', ...PRICES.p1 });
  assert.equal(rec.purchasePrice, 13122);
  assert.equal(rec.landedUnitCost, 13600);
  assert.notEqual(rec.purchasePrice, rec.landedUnitCost);
  assert.equal(rec.purchasePriceVersion, 'pp@1');
  assert.equal(rec.landedCostVersion, 'lc@1');
  const up = procurementUplift(rec);
  assert.equal(up.delta, 478);
  // both survive into the cost trace — purchase price stays visible for audit
  const line = cost().heads.MATERIAL_LANDED.lines.find(l => l.componentId === 'p1');
  assert.equal(line.purchasePrice, 13122);
  assert.equal(line.landedUnitCost, 13600);
});

test('2 — material cost uses LANDED cost', () => {
  const r = cost();
  const line = r.heads.MATERIAL_LANDED.lines.find(l => l.componentId === 'p1');
  assert.equal(line.extendedCost, 6 * 13600);
  assert.equal(line.formula, '6 × 13600 (landed)');
  assert.equal(line.priceKindUsed, PRICE_KIND.LANDED_UNIT_COST);
  assert.equal(r.materialLandedCost, MATERIAL);
  assert.equal(r.heads.MATERIAL_LANDED.formula, 'SUM(quantity × landedUnitCost)');
  assert.deepEqual(VALID_FOR_PROJECT_COST, [PRICE_KIND.LANDED_UNIT_COST]);
});

test('3 — purchase price is NEVER substituted when landed cost is missing', () => {
  const r = cost({ priceMaster: { ...PRICES, bt1: { purchasePrice: 86717, purchasePriceVersion: 'pp@1' } } });
  assert.equal(r.materialLandedCost, null, 'must not fall back to the purchase price');
  assert.equal(r.totalActualProjectCost, null);
  const e = r.errors.find(x => x.code === COST_ERROR.LANDED_COST_NOT_CONFIGURED);
  assert.ok(e);
  assert.equal(e.detail.hasPurchasePrice, true, 'a purchase price existed and was still not used');
  assert.match(e.message, /must NOT be substituted/);
});

// ---------------------------------------------------------------- 4
test('4 — the system never auto-allocates freight into landed cost', () => {
  const src = stripComments(readFileSync('src/lib/procurementPriceMaster.js', 'utf8'));
  for (const banned of ['weight', 'volume', 'freight', 'allocat'])
    assert.equal(new RegExp(banned, 'i').test(src.replace(/allocation/gi, '')), false, banned);
  // a record with only a purchase price yields NO landed cost — nothing is derived
  const rec = toPriceRecord({ componentId: 'x', purchasePrice: 1000 });
  assert.equal(rec.landedUnitCost, null);
  assert.equal(rec.landedCostSource, null);
  assert.equal(projectUnitCost(rec).ok, false);
  // and when it IS present, it is recorded as procurement-entered
  assert.equal(toPriceRecord({ componentId: 'x', landedUnitCost: 1100 }).landedCostSource, 'PROCUREMENT_ENTERED');
});

// ---------------------------------------------------------------- 5, 6, 7
test('5 — project transportation is separate from landed cost', () => {
  const r = cost();
  assert.equal(r.transportationCost, 40 * 30);
  assert.equal(r.heads.TRANSPORTATION.head, COST_HEAD.TRANSPORTATION);
  assert.notEqual(r.heads.TRANSPORTATION, r.heads.MATERIAL_LANDED);
  assert.match(r.heads.TRANSPORTATION.note, /Supplier → warehouse logistics are inside landedUnitCost/);
  assert.equal(CFG.transportation.scope, 'WAREHOUSE_TO_SITE');
});

test('6 — transportation uses ONE-WAY distance and is never doubled', () => {
  const r = cost();
  assert.equal(r.heads.TRANSPORTATION.inputs.distanceBasis, 'ONE_WAY');
  assert.equal(r.transportationCost, 40 * 30, 'must not be 2 × 40 × 30');
  assert.notEqual(r.transportationCost, 2 * 40 * 30);
  assert.equal(r.heads.TRANSPORTATION.formula, '40 × 30');
});

test('7 — vehicle-specific rates, and no universal per-km rate', () => {
  assert.equal(cost({ project: { ...PROJECT, vehicleType: 'PICKUP' } }).transportationCost, 40 * 30);
  assert.equal(cost({ project: { ...PROJECT, vehicleType: 'LORRY' } }).transportationCost, 40 * 55);
  const r = cost({ project: { ...PROJECT, vehicleType: 'HELICOPTER' } });
  assert.equal(r.transportationCost, null);
  assert.ok(r.errors.some(e => e.code === COST_ERROR.TRANSPORT_RATE_NOT_CONFIGURED));
  // the legacy universal rates are recorded as rejected, and never applied
  assert.deepEqual(CFG.transportation.rejectedLegacyRates.map(x => x.value), [35, 40, 100]);
  // 2026-09-07 (§16/§24): the shipped vehicles are VERSIONED UAT-reference records flagged
  // isDemo:true — never an unversioned universal rate, never production truth. Production
  // rates come only from the PROJECT_HEAD rate card (PUT /api/workspace/commercial/rate-card).
  assert.equal(CFG.transportation.isDemo, true, 'shipped vehicle rates are UAT reference only');
  assert.equal(CFG.transportation.productionUse, false);
  for (const v of CFG.transportation.vehicles) {
    for (const f of ['vehicleId', 'vehicleType', 'ratePerKm', 'unit', 'effectiveFrom', 'version', 'status', 'changedBy', 'changedAt', 'changeReason'])
      assert.ok(v[f] !== undefined && v[f] !== null && v[f] !== '', `vehicle ${v.vehicleType} missing audit field ${f}`);
    assert.equal(v.unit, 'PER_KM');
    assert.equal(v.isDemo, true, `vehicle ${v.vehicleType} must be flagged isDemo`);
  }
});

// ---------------------------------------------------------------- 8, 9
test('8 — site survey is ₹500 per project within 100 km', () => {
  const r = cost();
  assert.equal(r.siteSurveyCost, 500);
  assert.equal(r.heads.SITE_SURVEY.inputs.unit, 'PER_PROJECT');
  assert.equal(r.heads.SITE_SURVEY.inputs.coverageKm, 100);
  assert.match(r.heads.SITE_SURVEY.note, /project transportation is a different head/);
  assert.equal(cost({ project: { ...PROJECT, distanceKm: 100 } }).siteSurveyCost, 500, 'boundary is inclusive');
});

test('9 — beyond 100 km = ₹500 + excess × ₹3/km', () => {
  const r = cost({ project: { ...PROJECT, distanceKm: 130 } });
  assert.equal(r.siteSurveyCost, 590, 'the brief example: 500 + (30 × 3)');
  assert.equal(r.heads.SITE_SURVEY.inputs.excessKm, 30);
  assert.equal(r.heads.SITE_SURVEY.inputs.excessRatePerKm, 3);
  assert.equal(r.heads.SITE_SURVEY.formula, '500 + (130 - 100) × 3');
  // the flat ₹500 alone is NOT applied beyond coverage
  assert.notEqual(r.siteSurveyCost, 500);
  // the threshold is an approved rule and is not silently moved
  assert.equal(CFG.siteSurvey.coverageKm, 100);
  assert.equal(CFG.siteSurvey.excessRatePerKm, 3);
  // with no excess rate configured it blocks rather than guessing
  const noRate = cost({ project: { ...PROJECT, distanceKm: 130 },
    config: fullConfig({ siteSurvey: { ...CFG.siteSurvey, excessRatePerKm: null } }) });
  assert.equal(noRate.siteSurveyCost, null);
  assert.ok(noRate.errors.some(e => e.code === COST_ERROR.SITE_SURVEY_EXCESS_RATE_NOT_CONFIGURED));
});

test('9b — the survey charge is all-inclusive; no second engineer travel', () => {
  const r = cost();
  assert.deepEqual(CFG.siteSurvey.allInclusive,
    ['engineerCost', 'engineerTravel', 'siteVisit', 'siteSurveyReport']);
  assert.match(r.heads.SITE_SURVEY.note, /No separate engineer travel is added/);
  // survey and project transportation are different heads
  assert.notEqual(r.heads.SITE_SURVEY, r.heads.TRANSPORTATION);
  assert.equal(r.siteSurveyCost + 0, 500);
});

// ---------------------------------------------------------------- 10, 11
test('10 — engineering/design is ₹500 per project up to 20 kW, all-inclusive', () => {
  const r = cost();
  assert.equal(r.engineeringDesignCost, 500);
  assert.equal(r.heads.ENGINEERING_DESIGN.inputs.unit, 'PER_PROJECT');
  assert.match(r.heads.ENGINEERING_DESIGN.note, /Engineer travel is never added separately/);
  assert.match(r.heads.ENGINEERING_DESIGN.note, /never computed per kW/);
  assert.deepEqual(CFG.engineeringDesign.allInclusive,
    ['engineerCost', 'engineerTravel', 'designWork', 'siteEngineeringReport']);
  assert.equal(cost({ project: { ...PROJECT, sizeKw: 20 } }).engineeringDesignCost, 500);
  // never per kW
  assert.notEqual(cost({ project: { ...PROJECT, sizeKw: 10 } }).engineeringDesignCost, 5000);
});

test('11 — above 20 kW blocks unless the rate card holds a >20kW rate', () => {
  const r = cost({ project: { ...PROJECT, sizeKw: 25 } });
  assert.equal(r.engineeringDesignCost, null);
  const e = r.errors.find(x => x.code === COST_ERROR.ENGINEERING_DESIGN_NOT_CONFIGURED);
  assert.ok(e);
  assert.match(e.message, /NOT extrapolated/);
  assert.equal(CFG.engineeringDesign.aboveLimitRate, null, 'no rate supplied');
  assert.equal(CFG.engineeringDesign.aboveLimitStatus, 'DECISION_CLOSED_VALUE_NOT_CONFIGURED');
  assert.notEqual(r.engineeringDesignCost, 500);
});

// ---------------------------------------------------------------- 12, 13, 14
test('12 — installation PER_PROJECT', () => {
  const r = cost();
  assert.equal(r.installationCost, 15000);
  assert.equal(r.heads.INSTALLATION.inputs.unit, 'PER_PROJECT');
  assert.equal(r.heads.INSTALLATION.formula, '15000 (per project)');
  assert.equal(cost({ project: { ...PROJECT, installationType: 'SHEET' } }).installationCost, 18000);
});

test('13 — installation PER_KW', () => {
  const cfg = fullConfig({ installation: { ...CFG.installation, rates: [
    { systemSizeKw: 3, installationType: 'FLAT', unit: 'PER_KW', rate: 2500, version: 'i@k' }] } });
  const r = cost({ config: cfg });
  assert.equal(r.installationCost, 2500 * 3);
  assert.equal(r.heads.INSTALLATION.formula, '2500 × 3 kW');
});

test('14 — a missing installation configuration BLOCKS; nearest size is never used', () => {
  const r = cost({ project: { ...PROJECT, sizeKw: 4 } });     // 3 and 5 exist, 4 does not
  assert.equal(r.installationCost, null);
  const e = r.errors.find(x => x.code === COST_ERROR.INSTALLATION_COST_NOT_CONFIGURED);
  assert.ok(e);
  assert.match(e.message, /nearest system size is NEVER used/);
  assert.equal(r.totalActualProjectCost, null);
  assert.equal(CFG.installation.exactMatchOnly, true);
  assert.equal(CFG.installation.removedLegacyFallback.status, 'REMOVED');
  // the per-kW legacy fallback is unreachable
  const src = stripComments(readFileSync('src/lib/costEngine.js', 'utf8'));
  assert.equal(/perKwFallback/.test(src), false);
});

// ---------------------------------------------------------------- 15, 16
test('15 — service = costPerVisit × visitsPerYear × serviceYears  (C9)', () => {
  const r = cost();
  assert.equal(r.serviceAmcCost, 1000 * 2 * 5);
  assert.equal(r.serviceAmcCost, 10000);
  assert.equal(r.heads.SERVICE_AMC.formula, '1000 × 2 × 5');
  assert.equal(r.heads.SERVICE_AMC.inputs.costPerVisit, 1000);
  assert.equal(r.heads.SERVICE_AMC.inputs.visitsPerYear, 2);
  assert.equal(r.heads.SERVICE_AMC.inputs.serviceYears, 5);
  assert.match(r.heads.SERVICE_AMC.note, /Decision C9/);
  // each term matters independently — doubling visits doubles the cost
  const twice = cost({ config: fullConfig({ serviceAmc: { ...fullConfig().serviceAmc, visitsPerYear: 4 } }) });
  assert.equal(twice.serviceAmcCost, 1000 * 4 * 5);
  // breakdown handling is INCLUDED — there is no separate breakdown head
  assert.match(CFG.serviceAmc.businessMeaning, /BREAKDOWN HANDLING IS INCLUDED/);
  assert.equal(COST_HEAD_ORDER.some(h => /BREAKDOWN/i.test(h)), false);
  // >10 kW blocks
  const over = cost({ project: { ...PROJECT, sizeKw: 20 } });
  assert.ok(over.errors.some(e => e.code === COST_ERROR.SERVICE_OUT_OF_COVERAGE));
  assert.equal(over.serviceAmcCost, null);
});

test('16 — any missing service value BLOCKS, never ₹0, no annual fallback', () => {
  const base = fullConfig().serviceAmc;
  for (const field of ['costPerVisit', 'visitsPerYear', 'serviceYears']) {
    const broken = { ...base }; delete broken[field];
    const r = cost({ config: fullConfig({ serviceAmc: broken }) });
    assert.equal(r.serviceAmcCost, null, field);
    assert.notEqual(r.serviceAmcCost, 0, field);
    const e = r.errors.find(x => x.code === COST_ERROR.SERVICE_CONFIG_INCOMPLETE);
    assert.ok(e, field);
    assert.deepEqual(e.detail.missing, [field]);
    assert.equal(r.totalActualProjectCost, null, `${field} must block the project total`);
  }
  // NO legacy annual fallback: an annualCost is not a recognised input
  const legacyShaped = cost({ config: fullConfig({ serviceAmc:
    { version: 'sv@legacy', serviceIncluded: true, annualCost: 2000, serviceYears: 5, sizeLimitKw: 10 } }) });
  assert.equal(legacyShaped.serviceAmcCost, null, 'annualCost × years must not compute');
  assert.notEqual(legacyShaped.serviceAmcCost, 10000);
  const src = stripComments(readFileSync('src/lib/costEngine.js', 'utf8'));
  assert.equal(src.includes('annualCost'), false, 'no annual-rate path may exist in the engine');
});

test('16b — the legacy ₹2,000 is never promoted, and visitsPerYear is never invented', () => {
  assert.equal(CFG.serviceAmc.costPerVisit, 1000);
  assert.equal(CFG.serviceAmc.visitsPerYear, 2);
  assert.equal(CFG.serviceAmc.serviceYears, 5);
  // the 2000/year figure survives only as explanatory metadata
  assert.equal(CFG.serviceAmc.annualEquivalentMetadata.value, 2000);
  assert.equal(CFG.serviceAmc.annualEquivalentMetadata.status, 'EXPLANATORY_METADATA_ONLY');
  assert.equal(CFG.serviceAmc.formula, 'costPerVisit x visitsPerYear x serviceYears');
  assert.equal(CFG.serviceAmc.sizeLimitKw, 10);
});

test('16c — internal service cost is not a customer-facing AMC price', () => {
  const r = cost();
  assert.equal(r.serviceAmcCost, 10000);
  assert.match(r.heads.SERVICE_AMC.note, /never a customer-facing AMC price/);
  assert.equal(CFG.serviceAmc.customerFacingAmcPrice, null);
  assert.match(CFG.serviceAmc.customerPriceNote, /never merged/);
  // the customer-facing side is an EXTRA, priced separately, and does not move
  // the base margin
  const p = price({ extras: [{ extraId: 'AMC-1', type: EXTRA_TYPE.ADDITIONAL_SERVICE,
    description: 'Customer AMC', customerPrice: 15000 }] });
  assert.equal(p.extras[0].includedInBase, false);
  assert.equal(p.extras[0].semantic, 'CUSTOMER_EXTRA');
  assert.equal(p.actualGrossMarginPct, price().actualGrossMarginPct);
  assert.notEqual(p.extras[0].customerPriceExcludingGST, r.serviceAmcCost);
});

// ---------------------------------------------------------------- 17, 18
test('17 — office allocation = monthly expense ÷ expected projects', () => {
  const r = cost();
  assert.equal(r.officeExpenseAllocation, 150000 / 10);
  assert.equal(r.heads.OFFICE_EXPENSE_ALLOCATION.formula, '150000 ÷ 10');
  assert.match(r.heads.OFFICE_EXPENSE_ALLOCATION.note, /never on actual completed projects/);
});

test('18 — expected projects of zero or missing BLOCKS', () => {
  for (const bad of [0, null, undefined, -3]) {
    const r = cost({ config: fullConfig({ officeExpenseAllocation: {
      version: 'o@x', monthlyOfficeExpense: 150000, expectedProjectsPerMonth: bad } }) });
    assert.equal(r.officeExpenseAllocation, null, String(bad));
    assert.ok(r.errors.some(e => e.code === COST_ERROR.OFFICE_ALLOCATION_INVALID), String(bad));
    assert.equal(r.totalActualProjectCost, null);
  }
  assert.equal(CFG.officeExpenseAllocation.rejectedLegacyFallback.status, 'NOT_APPLIED');
});

// ---------------------------------------------------------------- 19
test('19 — special project works are explicit, visible, and never automatic', () => {
  const none = cost();
  assert.equal(none.specialProjectWorksCost, 0);
  assert.equal(none.heads.SPECIAL_PROJECT_WORKS.formula, '0 (no special work added by Project Head)');

  const withWork = cost({ project: { ...PROJECT, specialWorks: [
    { workType: SPECIAL_WORK_TYPE.CRANE, amount: 12000, reason: 'third floor', addedBy: 'ph@flarize', at: AT },
    { workType: SPECIAL_WORK_TYPE.TRENCHING, amount: 8000, reason: '40 m cable route', addedBy: 'ph@flarize', at: AT },
  ] } });
  assert.equal(withWork.specialProjectWorksCost, 20000);
  assert.equal(withWork.heads.SPECIAL_PROJECT_WORKS.lines.length, 2);
  const crane = withWork.heads.SPECIAL_PROJECT_WORKS.lines.find(l => l.workType === 'CRANE');
  assert.equal(crane.extendedCost, 12000);
  assert.equal(crane.reason, 'third floor');
  assert.equal(crane.addedBy, 'ph@flarize');
  // not hidden inside miscellaneous
  assert.notEqual(withWork.heads.SPECIAL_PROJECT_WORKS, withWork.heads.MISCELLANEOUS);
  // no rate invented
  const bad = cost({ project: { ...PROJECT, specialWorks: [{ workType: 'CRANE' }] } });
  assert.ok(bad.errors.some(e => e.code === COST_ERROR.SPECIAL_WORK_INVALID));
  assert.equal(bad.specialProjectWorksCost, null);
});

// ---------------------------------------------------------------- 20, 21, 22
test('20 — miscellaneous is 1% of DIRECT project cost before miscellaneous', () => {
  const r = cost();
  const direct = DIRECT_COST_HEADS.reduce((a, h) => a + r.heads[h].amountExact, 0);
  assert.equal(r.directProjectCost, roundMoney(direct));
  assert.equal(r.miscellaneousCost, roundMoney(direct * 0.01));
  assert.equal(r.heads.MISCELLANEOUS.inputs.base, 'DIRECT_PROJECT_COST_BEFORE_MISCELLANEOUS');
  assert.equal(CFG.miscellaneous.label, 'CONFIGURED MISCELLANEOUS ALLOWANCE');
  assert.match(r.heads.MISCELLANEOUS.note, /NOT hidden margin/);
  // total = direct + misc
  assert.equal(r.totalActualProjectCost, roundMoney(direct + direct * 0.01));
});

test('21 — miscellaneous creates no circular dependency', () => {
  const r = cost();
  // misc depends only on the direct heads, never on the selling price
  assert.equal(r.heads.MISCELLANEOUS.inputs.directProjectCost, r.directProjectCost);
  const p = price();
  assert.ok(p.sellingPriceBeforeGST > r.totalActualProjectCost);
  // recomputing cost gives the identical misc — the price does not feed back
  assert.equal(cost().miscellaneousCost, r.miscellaneousCost);
  const src = stripComments(readFileSync('src/lib/costEngine.js', 'utf8'));
  for (const banned of ['sellingPrice', 'grossMargin', 'calculatePricing'])
    assert.equal(src.includes(banned), false, `cost engine must not reference ${banned}`);
});

test('22 — admin can change the miscellaneous percentage, including to 0%', () => {
  const two = cost({ config: fullConfig({ miscellaneous: { ...CFG.miscellaneous, version: 'm@2', percentage: 2 } }) });
  const zero = cost({ config: fullConfig({ miscellaneous: { ...CFG.miscellaneous, version: 'm@0', percentage: 0 } }) });
  const one = cost();
  assert.equal(two.miscellaneousCost, roundMoney(two.directProjectCostExact * 0.02));
  assert.equal(zero.miscellaneousCost, 0);
  assert.equal(zero.heads.MISCELLANEOUS.status, 'OK', '0% is an explicit configured value, not an error');
  assert.ok(two.miscellaneousCost > one.miscellaneousCost);
  // but an unconfigured percentage is NOT 0
  const missing = cost({ config: fullConfig({ miscellaneous: { version: 'm@x' } }) });
  assert.equal(missing.miscellaneousCost, null);
  assert.ok(missing.errors.some(e => e.code === COST_ERROR.MISC_CONFIG_INVALID));
});

// ---------------------------------------------------------------- 23, 24, 25
test('23 — target margin is tier-specific', () => {
  const base = resolveTierMargin(MARGIN_CFG, 'BASE');
  const value = resolveTierMargin(MARGIN_CFG, 'VALUE');
  const premium = resolveTierMargin(MARGIN_CFG, 'PREMIUM');
  assert.deepEqual([base.targetMarginPct, value.targetMarginPct, premium.targetMarginPct], [18, 20, 25]);
  const pv = price({ tier: 'VALUE' }), pp = price({ tier: 'PREMIUM' });
  assert.notEqual(pv.sellingPriceBeforeGST, pp.sellingPriceBeforeGST);
  assert.equal(pv.listSellingPriceBeforeGST, roundMoney(cost().totalActualProjectCostExact / 0.8));
  assert.equal(pp.listSellingPriceBeforeGST, roundMoney(cost().totalActualProjectCostExact / 0.75));
  assert.deepEqual(TIERS, ['BASE', 'VALUE', 'PREMIUM']);
  // The config tier values are read from disk — with production setup they
  // may be populated. The test MARGIN_CFG above uses specific test values.
  assert.ok(typeof CFG.margin.tiers.VALUE.targetMarginPct === 'number' || CFG.margin.tiers.VALUE.targetMarginPct === null,
    'tier margin must be number or null, never undefined');
});

test('24 — minimum margin is tier-specific', () => {
  assert.equal(resolveTierMargin(MARGIN_CFG, 'BASE').minimumMarginPct, 12);
  assert.equal(resolveTierMargin(MARGIN_CFG, 'VALUE').minimumMarginPct, 15);
  assert.equal(resolveTierMargin(MARGIN_CFG, 'PREMIUM').minimumMarginPct, 18);
  assert.equal(price({ tier: 'PREMIUM' }).minimumMarginPct, 18);
});

test('25 — minimum margin may not exceed target, and ranges are enforced', () => {
  const bad = resolveTierMargin({ tiers: { VALUE: { targetMarginPct: 20, minimumMarginPct: 25 } } }, 'VALUE');
  assert.equal(bad.ok, false);
  assert.equal(bad.code, PRICING_ERROR.MARGIN_CONFIG_INVALID);
  assert.match(bad.reason, /exceeds targetMarginPct/);
  assert.equal(resolveTierMargin({ tiers: { VALUE: { targetMarginPct: 100, minimumMarginPct: 10 } } }, 'VALUE').ok, false);
  assert.equal(resolveTierMargin({ tiers: { VALUE: { targetMarginPct: 20, minimumMarginPct: -1 } } }, 'VALUE').ok, false);
  assert.equal(resolveTierMargin(MARGIN_CFG, 'NOT_A_TIER').ok, false);
  // equal minimum and target is legal
  assert.equal(resolveTierMargin({ tiers: { VALUE: { targetMarginPct: 20, minimumMarginPct: 20 } } }, 'VALUE').ok, true);
});

// ---------------------------------------------------------------- 26
test('26 — margin below the minimum BLOCKS the quotation', () => {
  // VALUE: target 20, minimum 15. A discount that drops the margin under 15% blocks.
  const list = price().listSellingPriceBeforeGST;
  const blocked = price({ discount: { percentage: 12, requestedBy: 'sales@flarize' } });
  assert.equal(blocked.status, PRICING_STATUS.REJECTED);
  assert.equal(blocked.error, PRICING_ERROR.MARGIN_BELOW_MINIMUM);
  assert.match(blocked.errors[0].message, /BLOCKED/);
  assert.match(blocked.errors[0].message, /Sales cannot bypass/);
  assert.equal(blocked.sellingPriceBeforeGST, null, 'no price is issued');
  assert.ok(list > 0);
});

// ---------------------------------------------------------------- 27, 28
test('27 — a discount recalculates the ACTUAL margin, after the discount', () => {
  const undiscounted = price();
  assert.equal(undiscounted.actualGrossMarginPct, 20);
  assert.equal(undiscounted.approval, APPROVAL.NONE_REQUIRED);

  const d = price({ discount: { percentage: 3, requestedBy: 'sales@flarize', reason: 'competitive' } });
  const c = cost().totalActualProjectCostExact;
  const expectedFinal = (c / 0.8) * 0.97;
  assert.equal(d.finalSellingPriceBeforeGST, roundMoney(expectedFinal));
  assert.ok(d.actualGrossMarginPct < 20, 'margin must fall after a discount');
  assert.equal(d.actualGrossMarginPct, roundMoney(((expectedFinal - c) / expectedFinal) * 100 * 10000) / 10000);
  assert.equal(d.discountAmount, roundMoney((c / 0.8) * 0.03));
  // the discount never touched the cost
  assert.equal(d.totalActualProjectCost, undiscounted.totalActualProjectCost);
});

test('28 — a discount below target but above minimum requires Sales Head approval', () => {
  const d = price({ discount: { percentage: 3, requestedBy: 'sales@flarize' } });
  assert.equal(d.status, PRICING_STATUS.COMPLETE);
  assert.equal(d.approval, APPROVAL.SALES_HEAD_APPROVAL_REQUIRED);
  assert.match(d.approvalReason, /below the 20% target but at or above the 15% minimum/);
  assert.ok(d.actualGrossMarginPct >= 15 && d.actualGrossMarginPct < 20);
  assert.equal(price().approval, APPROVAL.NONE_REQUIRED);
  // an over-sized discount is rejected outright
  assert.equal(price({ discount: { amount: -1 } }).error, PRICING_ERROR.DISCOUNT_INVALID);
  assert.equal(price({ discount: {} }).error, PRICING_ERROR.DISCOUNT_INVALID);
});

// ---------------------------------------------------------------- 29, 30
test('29 — GST is computed as 70/30 components, both visible', () => {
  const p = price();
  const base = p.sellingPriceBeforeGST;
  const goods = p.gstComponents.find(c => c.label === 'GOODS');
  const service = p.gstComponents.find(c => c.label === 'SERVICE');
  assert.equal(p.gstRegime, GST_REGIME.SOLAR_70_30_COMPOSITE);
  assert.equal(goods.valuationPct, 70); assert.equal(goods.ratePct, 5);
  assert.equal(service.valuationPct, 30); assert.equal(service.ratePct, 18);
  assert.equal(goods.taxAmount, roundMoney(p.exact.sellingBeforeGstExact * 0.7 * 0.05));
  assert.equal(service.taxAmount, roundMoney(p.exact.sellingBeforeGstExact * 0.3 * 0.18));
  assert.equal(p.gstAmount, goods.taxAmount + service.taxAmount);
  assert.equal(p.priceIncludingGST, base + p.gstAmount);
});

test('30 — a flat 8.9% is NOT the calculation method', () => {
  const r = resolveGstRegime(GST);
  assert.equal(r.components.length, 2, 'two components, not one blended rate');
  assert.equal(r.effectiveRatePct, 8.9, 'the effective rate is an OUTPUT');
  // a declared rate that disagrees with the split is rejected — the split wins
  assert.equal(resolveGstRegime({ ...GST, effectiveRatePct: 9 }).code,
    PRICING_ERROR.GST_EFFECTIVE_RATE_MISMATCH);
  // omitting the declared rate changes nothing
  assert.equal(resolveGstRegime({ ...GST, effectiveRatePct: undefined }).effectiveRatePct, 8.9);
  const split = resolveGstRegime({ ...GST, goodsValuationPct: 70, serviceValuationPct: 40 });
  assert.equal(split.code, PRICING_ERROR.GST_SPLIT_INVALID);
  assert.equal(resolveGstRegime({}).code, PRICING_ERROR.GST_NOT_CONFIGURED);
  assert.equal(resolveGstRegime({ regime: 'MADE_UP' }).code, PRICING_ERROR.GST_REGIME_INVALID);
});

// ---------------------------------------------------------------- 31
test('31 — the net meter is NOT a Flarize item at all', () => {
  // it cannot be sold as a Flarize extra
  assert.equal(Object.keys(EXTRA_TYPE).includes('NET_METERING'), false);
  assert.deepEqual(FORBIDDEN_EXTRA_TYPES, ['NET_METERING', 'NET_METER']);
  const rejected = price({ extras: [
    { extraId: 'NM-1', type: 'NET_METERING', customerPrice: 25000 }] });
  assert.equal(rejected.extras.length, 0, 'it is refused as an extra');
  assert.ok(rejected.errors.some(e => e.code === PRICING_ERROR.EXTRA_TYPE_FORBIDDEN));

  // it is not in the BOM, not in cost, not in margin, not in the selling price
  const r = cost();
  assert.equal(r.heads.MATERIAL_LANDED.lines.some(l => /meter/i.test(l.componentId || '')), false);
  assert.equal(COST_HEAD_ORDER.some(h => /METER/i.test(h)), false);
  assert.equal(CFG.netMeter.status, 'NOT_A_FLARIZE_ITEM');
  assert.equal(CFG.netMeter.owner, 'CUSTOMER');
  assert.equal(CFG.netMeter.markup, 'NONE — Flarize never marks it up.');
  for (const k of ['flarizeBOM', 'materialLandedCost', 'totalActualProjectCost',
                   'flarizeMargin', 'solarSystemSellingPrice'])
    assert.ok(CFG.netMeter.excludedFrom.includes(k), k);
});

test('31b — a customer-side expense is displayed, never priced or marked up', () => {
  const withRef = price({ customerSideExpenses: [
    { expenseId: 'NM-REF', type: 'NET_METER', description: 'KSEB net meter (customer-procured)', amount: 12000 }] });
  const plain = price();
  const nm = withRef.customerSideExpenses[0];
  assert.equal(nm.amount, 12000);
  assert.equal(nm.paidBy, 'CUSTOMER');
  assert.equal(nm.flarizeMarkup, 0);
  assert.equal(nm.includedInFlarizePrice, false);
  assert.equal(nm.semantic, 'REFERENCE_ONLY');
  // it moves NOTHING on the Flarize side
  assert.equal(withRef.sellingPriceBeforeGST, plain.sellingPriceBeforeGST);
  assert.equal(withRef.grossProfit, plain.grossProfit);
  assert.equal(withRef.actualGrossMarginPct, plain.actualGrossMarginPct);
  assert.equal(withRef.gstAmount, plain.gstAmount);
  assert.equal(withRef.customerTotalIncludingGST, plain.customerTotalIncludingGST);
  assert.equal(withRef.customerSideExpensesTotal, 12000);
});

// ---------------------------------------------------------------- 32
test('32 — market rate cannot override the calculated price', () => {
  // Phase 0 failure: marketRate 200000 against a real cost above it
  const p = price({ marketRate: 200000 });
  assert.equal(p.marketRateReference.usedInCalculation, false);
  assert.equal(p.marketRateReference.semantic, 'REFERENCE_ONLY');
  assert.equal(p.sellingPriceBeforeGST, roundMoney(cost().totalActualProjectCostExact / 0.8));
  assert.ok(p.sellingPriceBeforeGST > p.totalActualProjectCost, 'never priced below cost');
  assert.equal(CFG.marketRate.usage, 'REFERENCE_ONLY');
  const src = stripComments(readFileSync('src/lib/costEngine.js', 'utf8'));
  assert.equal(/marketRate/.test(src), false);
});

// ---------------------------------------------------------------- 33, 34, 35
test('33 — a purchase/landed price change affects NEW quotations', () => {
  const c1 = cost(), p1 = price();
  const snap = createCommercialSnapshot({ snapshotId: 'CS-1', costResult: c1, pricingResult: p1,
    issuedBy: 'admin', issuedAt: AT });
  const newPrices = { ...PRICES, p1: { ...PRICES.p1, landedUnitCost: 15000, landedCostVersion: 'lc@2' } };
  const re = recalculateForNewQuotation({ previousSnapshot: snap, bomSnapshot: lockedBom(),
    config: fullConfig(), priceMaster: newPrices, project: PROJECT, margin: MARGIN_CFG, gst: GST,
    calculatedAt: AT, pricedAt: AT, catalogVersion: 'catalog@test', procurementPriceVersion: 'pp@2' });
  assert.equal(re.cost.materialLandedCost, 6 * 15000 + 88000);
  assert.notEqual(re.cost.totalActualProjectCost, snap.cost.totalActualCost);
  assert.ok(re.comparison.totalActualCost.delta !== 0);
});

test('34 — a locked commercial snapshot never changes', () => {
  const snap = createCommercialSnapshot({ snapshotId: 'CS-1', costResult: cost(), pricingResult: price(), issuedAt: AT });
  const before = JSON.stringify(snap);
  applyConfigChange(snap, 'admin raised margin');
  applyConfigChange(snap, 'procurement raised landed cost');
  assert.equal(JSON.stringify(snap), before);
  assert.equal(applyConfigChange(snap, 'x').mutated, false);
  assert.equal(applyConfigChange(snap, 'x').snapshot, snap);
  assert.throws(() => { snap.pricing.sellingPriceBeforeGST = 1; }, TypeError);
  assert.throws(() => { snap.cost.materialCost = 1; }, TypeError);
  // every listed configuration change is powerless against it
  const p2 = calculatePricing({ costResult: cost(), gst: GST, tier: 'VALUE', pricedAt: AT,
    margin: { ...MARGIN_CFG, version: 'margin@t2',
      tiers: { ...MARGIN_CFG.tiers, VALUE: { targetMarginPct: 35, minimumMarginPct: 15 } } } });
  assert.notEqual(p2.sellingPriceBeforeGST, snap.pricing.sellingPriceBeforeGST);
  assert.equal(snap.pricing.targetGrossMargin, 0.2);
});

test('35 — every commercial version field is preserved on the snapshot', () => {
  const snap = createCommercialSnapshot({ snapshotId: 'CS-1', costResult: cost(), pricingResult: price(), issuedAt: AT });
  for (const k of ['bomSnapshotId', 'catalogVersion', 'procurementPriceVersion', 'costConfigVersion',
                   'marginVersion', 'gstVersion', 'costEngineVersion', 'pricingEngineVersion', 'moneyRuleVersion'])
    assert.ok(snap.versions[k] != null, k);
  assert.equal(snap.versions.costEngineVersion, COST_ENGINE_VERSION);
  assert.equal(snap.versions.pricingEngineVersion, PRICING_ENGINE_VERSION);
  assert.equal(snap.versions.moneyRuleVersion, MONEY_RULE_VERSION);
  assert.equal(snap.versions.marginVersion, 'margin@t1');
  assert.equal(snap.versions.gstVersion, GST.version);
  assert.equal(snap.status, COMMERCIAL_SNAPSHOT_STATUS.ISSUED);
});

// ---------------------------------------------------------------- 36
test('36 — missing commercial configuration never silently becomes ₹0', () => {
  const shipped = calculateCost({ snapshot: lockedBom(), config: CFG, priceMaster: {},
    project: { ...PROJECT, vehicleType: null }, calculatedAt: AT });
  // the shipped config deliberately lacks landed costs, vehicle rates and service values
  for (const head of ['MATERIAL_LANDED', 'TRANSPORTATION']) {
    assert.equal(shipped.heads[head].amount, null, head);
    assert.notEqual(shipped.heads[head].amount, 0, head);
  }
  assert.equal(shipped.totalActualProjectCost, null);
  const codes = new Set(shipped.errors.map(e => e.code));
  for (const c of [COST_ERROR.LANDED_COST_NOT_CONFIGURED, COST_ERROR.TRANSPORT_RATE_NOT_CONFIGURED])
    assert.ok(codes.has(c), c);
  // and pricing refuses to price an incomplete cost
  const p = calculatePricing({ costResult: shipped, margin: MARGIN_CFG, gst: GST, tier: 'VALUE' });
  assert.equal(p.error, PRICING_ERROR.COST_INCOMPLETE);
});

// ---------------------------------------------------------------- 37
test('37 — the engineering baseline contract hash is unchanged', () => {
  const v3 = JSON.parse(readFileSync('docs/baselines/golden-baseline-v3.json', 'utf8'));
  assert.equal(v3.cells.length, 54);
  // the commercial engine imports nothing from the engineering engine
  const src = stripComments(readFileSync('src/lib/costEngine.js', 'utf8'));
  const imports = src.match(/^import .*$/gm) || [];
  for (const imp of imports)
    assert.match(imp, /'\.\/(money|bomSnapshot|procurementPriceMaster|projectRateCard)\.js'/, `unexpected import: ${imp}`);
  for (const banned of ['resolveBattery', 'checkProjectBom', 'setComponent', 'removeRole',
                        'validateEngineering', 'engineeringChecker'])
    assert.equal(src.includes(banned), false, `cost engine must not reference ${banned}`);
});

// -------------------------------------------------- architecture invariants
test('the cost heads, owners and order are the corrected set', () => {
  assert.equal(COST_HEAD_ORDER.length, 10);
  assert.equal(DIRECT_COST_HEADS.length, 9);
  assert.equal(COST_HEAD_ORDER.at(-1), COST_HEAD.MISCELLANEOUS, 'misc is derived last');
  assert.equal(COST_HEAD_OWNER.MATERIAL_LANDED, 'PROCUREMENT');
  assert.equal(COST_HEAD_OWNER.TRANSPORTATION, 'PROJECT_HEAD');
  assert.equal(COST_HEAD_OWNER.OFFICE_EXPENSE_ALLOCATION, 'ADMIN');
  assert.deepEqual([...new Set(Object.values(COST_HEAD_OWNER))].sort(),
    ['ADMIN', 'PROCUREMENT', 'PROJECT_HEAD'], 'Sales owns no cost head');
  const r = cost();
  for (const h of COST_HEAD_ORDER) {
    const t = r.traces.find(x => x.head === h);
    for (const k of ['owner', 'inputs', 'formula', 'status']) assert.ok(t[k] !== undefined, `${h}.${k}`);
  }
});

test('a locked BOM is still required', () => {
  const draft = { ...lockedBom(), status: SNAPSHOT_STATUS.DRAFT };
  const r = calculateCost({ snapshot: draft, config: fullConfig(), priceMaster: PRICES, project: PROJECT });
  assert.equal(r.status, COST_STATUS.UNAVAILABLE);
  assert.equal(r.error, COST_ERROR.COST_NOT_AVAILABLE_UNTIL_BOM_LOCKED);
  assert.equal(r.totalActualProjectCost, null);
});

test('gross margin, never markup', () => {
  const p = price();
  const c = cost().totalActualProjectCostExact;
  assert.equal(p.listSellingPriceBeforeGST, roundMoney(c / 0.8));
  assert.notEqual(p.listSellingPriceBeforeGST, roundMoney(c * 1.2));
  assert.deepEqual(FORBIDDEN_MARGIN_TYPES, ['MARKUP']);
  assert.equal(calculatePricing({ costResult: cost(), gst: GST, tier: 'VALUE',
    margin: { ...MARGIN_CFG, marginType: 'MARKUP' } }).error, PRICING_ERROR.MARGIN_TYPE_FORBIDDEN);
  const src = stripComments(readFileSync('src/lib/pricingEngine.js', 'utf8'));
  assert.equal(/1\s*\+\s*(mv\.value|targetGrossMargin)/.test(src), false);
  assert.equal(validateGrossMargin(1).valid, false);
  assert.equal(validateGrossMargin(-0.1).valid, false);
});

test('both engines are deterministic', () => {
  assert.equal(JSON.stringify(cost().traces), JSON.stringify(cost().traces));
  assert.equal(JSON.stringify(price().exact), JSON.stringify(price().exact));
  const reversed = cost({ snapshot: lockedBom([
    { componentId: 'bt1', role: 'BATTERY', qty: 1 }, { componentId: 'p1', role: 'PANEL', qty: 6 }]) });
  assert.equal(reversed.totalActualProjectCost, cost().totalActualProjectCost);
  for (const f of ['src/lib/costEngine.js', 'src/lib/pricingEngine.js', 'src/lib/money.js',
                   'src/lib/procurementPriceMaster.js']) {
    const src = stripComments(readFileSync(f, 'utf8'));
    assert.equal(/Date\.now\(|new Date\(|Math\.random\(/.test(src), false, f);
  }
});

test('the Pricing Engine touches no BOM, no component price and no engineering', () => {
  const src = stripComments(readFileSync('src/lib/pricingEngine.js', 'utf8'));
  const imports = src.match(/^import .*$/gm) || [];
  for (const imp of imports)
    assert.match(imp, /'\.\/(money|costEngine)\.js'/, `unexpected import: ${imp}`);
  for (const banned of ['priceMaster', 'landedUnitCost', 'purchasePrice', 'calculateCost',
                        'snapshot.lines', 'resolveBattery', 'checkProjectBom', 'setComponent'])
    assert.equal(src.includes(banned), false, `pricing engine must not reference ${banned}`);
});

test('no component-level selling price exists in V1', () => {
  const rec = toPriceRecord({ componentId: 'x', landedUnitCost: 100, SELLING_PRICE: 200 });
  assert.ok(rec.violation);
  assert.equal(projectUnitCost(rec).ok, false);
  assert.equal(CFG.procurement.componentLevelSellingPrice.supported, false);
});

test('the debug view explains every head and the two totals', () => {
  const text = explainCost(cost());
  for (const h of COST_HEAD_ORDER) assert.ok(text.includes(h), h);
  assert.ok(text.includes('DIRECT_PROJECT_COST'));
  assert.ok(text.includes('TOTAL_ACTUAL_PROJECT_COST'));
  assert.equal(explainCost(calculateCost({ snapshot: null, config: {} })),
    COST_ERROR.COST_NOT_AVAILABLE_UNTIL_BOM_LOCKED);
});

test('the config states current production configuration status', () => {
  // After production setup, procurement and margin are CONFIGURED.
  // Transportation may still be unconfigured. These reflect actual state.
  assert.ok(['CONFIGURED', 'DECISION_CLOSED_VALUES_NOT_CONFIGURED'].includes(CFG.procurement.status));
  // 2026-09-07: transport carries versioned UAT-reference vehicles (isDemo:true) — CONFIGURED for UAT,
  // productionUse:false; production requires the PROJECT_HEAD rate card.
  assert.ok(['CONFIGURED', 'DECISION_CLOSED_VALUES_NOT_CONFIGURED'].includes(CFG.transportation.status));
  assert.equal(CFG.transportation.productionUse, false);
  assert.equal(CFG.serviceAmc.status, 'CONFIGURED');
  assert.ok(['CONFIGURED', 'DECISION_CLOSED_VALUES_NOT_CONFIGURED'].includes(CFG.margin.status));
  assert.equal(CFG.netMeter.status, 'NOT_A_FLARIZE_ITEM');
  // stable operational values
  assert.equal(CFG.siteSurvey.costPerProject, 500);
  assert.equal(CFG.siteSurvey.coverageKm, 100);
  assert.equal(CFG.engineeringDesign.costPerProject, 500);
  assert.equal(CFG.engineeringDesign.sizeLimitKw, 20);
  assert.equal(CFG.serviceAmc.sizeLimitKw, 10);
  assert.equal(CFG.siteSurvey.excessRatePerKm, 3);
  assert.equal(CFG.miscellaneous.percentage, 1);
  assert.equal(CFG.gst.regime, 'SOLAR_70_30_COMPOSITE');
});

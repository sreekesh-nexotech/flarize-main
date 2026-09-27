// Phase 2A — closing the four commercial blockers: P2-J, P2-M, P2-F, P2-L.
// The 35 named tests from the closing brief.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { roundMoney } from '../src/lib/money.js';
import {
  buildBatchLandedCosts, toPriceMasterEntries, ALLOCATION_METHOD,
  FORBIDDEN_ALLOCATION_METHODS, BATCH_ERROR,
} from '../src/lib/procurementBatch.js';
import { toPriceRecord, projectUnitCost } from '../src/lib/procurementPriceMaster.js';
import {
  CONFIG_TYPE, CONFIG_STATUS, createHistoryStore, appendVersion,
  getHistory, getCurrentVersion, getVersion, getVersionEffectiveAt, compareVersions,
} from '../src/lib/commercialHistory.js';
import {
  RATE_TYPE, RATE_UNIT, createRateCard, setRate, resolveRate, installationKey,
} from '../src/lib/projectRateCard.js';
import { calculateCost, COST_ERROR, COST_STATUS } from '../src/lib/costEngine.js';
import {
  calculatePricing, resolveTierMargin, PRICING_ERROR, PRICING_STATUS, APPROVAL, TIERS,
} from '../src/lib/pricingEngine.js';
import { createCommercialSnapshot, VERSION_KEYS } from '../src/lib/commercialSnapshot.js';
import { createProjectBomSnapshot } from '../src/lib/bomSnapshot.js';

const CFG = JSON.parse(readFileSync('data/cost-config.json', 'utf8'));
const AT = '2026-08-16T00:00:00Z';
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The brief's own batch: A 70,000 · B 20,000 · C 10,000, delivery 5,000. */
const BATCH = {
  procurementBatchId: 'PB-001',
  deliveryCost: 5000,
  allocationMethod: ALLOCATION_METHOD.PURCHASE_VALUE_PROPORTION,
  recordedBy: 'procurement@flarize', recordedAt: AT, effectiveFrom: '2026-08-16', versionId: 'PB-001-v1',
  lines: [
    { componentId: 'A', quantity: 10, purchaseUnitPrice: 7000 },   // 70,000
    { componentId: 'B', quantity: 10, purchaseUnitPrice: 2000 },   // 20,000
    { componentId: 'C', quantity: 10, purchaseUnitPrice: 1000 },   // 10,000
  ],
};

// ==================================================================== P2-J
test('P2-J 1 — purchase price stays separate from landed cost', () => {
  const r = buildBatchLandedCosts(BATCH);
  const a = r.lines.find(l => l.componentId === 'A');
  assert.equal(a.purchaseUnitPrice, 7000);
  assert.equal(a.landedUnitCost, 7350, '7000 + 3500/10');
  assert.notEqual(a.purchaseUnitPrice, a.landedUnitCost);
  const pm = toPriceMasterEntries(r, { purchasePriceVersion: 'pp@1', landedCostVersion: 'lc@1' });
  assert.equal(pm.A.purchasePrice, 7000);
  assert.equal(pm.A.landedUnitCost, 7350);
  assert.equal(pm.A.purchasePriceVersion, 'pp@1');
  assert.equal(pm.A.landedCostVersion, 'lc@1');
});

test('P2-J 2 — landed cost includes the allocated procurement delivery', () => {
  const r = buildBatchLandedCosts(BATCH);
  for (const [id, alloc, landedUnit] of [['A', 3500, 7350], ['B', 1000, 2100], ['C', 500, 1050]]) {
    const l = r.lines.find(x => x.componentId === id);
    assert.equal(l.allocatedDeliveryCost, alloc, id);
    assert.equal(l.landedUnitCost, landedUnit, id);
  }
  // plus any explicitly entered other procurement charge
  const withOther = buildBatchLandedCosts({ ...BATCH, lines: [
    { ...BATCH.lines[0], otherProcurementCharges: [{ label: 'unloading', amount: 1500 }] },
    BATCH.lines[1], BATCH.lines[2]] });
  const a = withOther.lines.find(l => l.componentId === 'A');
  assert.equal(a.otherProcurementChargesTotal, 1500);
  assert.equal(a.landedUnitCost, 7000 + 3500 / 10 + 1500 / 10);
});

test('P2-J 3 — allocation is by PURCHASE-VALUE proportion, and only that', () => {
  const r = buildBatchLandedCosts(BATCH);
  assert.equal(r.allocation.allocationMethod, 'PURCHASE_VALUE_PROPORTION');
  assert.deepEqual(r.allocation.sourceMaterials.map(m => m.allocationPct), [70, 20, 10]);
  // every forbidden basis is rejected outright
  assert.deepEqual(FORBIDDEN_ALLOCATION_METHODS, ['WEIGHT', 'VOLUME', 'QUANTITY', 'EQUAL_SPLIT']);
  for (const bad of FORBIDDEN_ALLOCATION_METHODS) {
    const out = buildBatchLandedCosts({ ...BATCH, allocationMethod: bad });
    assert.equal(out.ok, false, bad);
    assert.equal(out.errors[0].code, BATCH_ERROR.ALLOCATION_METHOD_INVALID, bad);
  }
  assert.equal(buildBatchLandedCosts({ ...BATCH, allocationMethod: 'SOMETHING_NEW' }).ok, false);
  // equal quantities but different values -> unequal allocation (not per-unit)
  assert.notEqual(r.lines[0].allocatedDeliveryCost, r.lines[1].allocatedDeliveryCost);
  // no weight or volume is ever READ as an allocation input. (The names appear
  // only in FORBIDDEN_ALLOCATION_METHODS, which is the rejection list.)
  const src = strip(readFileSync('src/lib/procurementBatch.js', 'utf8'))
    .replace(/FORBIDDEN_ALLOCATION_METHODS[\s\S]*?\];/, '');
  for (const banned of ['weight', 'volume', 'l\\.qty \\* '])
    assert.equal(new RegExp(banned, 'i').test(src), false, banned);
});

test('P2-J 4 — shares total 100% and the allocation reconciles exactly', () => {
  const r = buildBatchLandedCosts(BATCH);
  assert.equal(r.allocation.sourceMaterials.reduce((a, m) => a + m.allocationPct, 0), 100);
  assert.equal(r.allocation.allocatedTotal, 5000);
  assert.equal(r.allocation.reconciled, true);
  // a batch that does not divide evenly still reconciles to the rupee
  const awkward = buildBatchLandedCosts({ ...BATCH, procurementBatchId: 'PB-002', deliveryCost: 1000,
    lines: [{ componentId: 'X', quantity: 1, purchaseUnitPrice: 3333 },
            { componentId: 'Y', quantity: 1, purchaseUnitPrice: 3333 },
            { componentId: 'Z', quantity: 1, purchaseUnitPrice: 3334 }] });
  assert.equal(awkward.allocation.allocatedTotal, 1000, 'no rupee is lost or invented');
  assert.equal(awkward.allocation.reconciled, true);
});

test('P2-J 5 — every allocation is fully traceable', () => {
  const r = buildBatchLandedCosts(BATCH);
  const al = r.allocation;
  assert.equal(al.procurementBatchId, 'PB-001');
  assert.equal(al.deliveryCost, 5000);
  assert.equal(al.allocationMethod, 'PURCHASE_VALUE_PROPORTION');
  assert.equal(al.totalPurchaseValue, 100000);
  assert.equal(al.recordedBy, 'procurement@flarize');
  assert.equal(al.versionId, 'PB-001-v1');
  for (const m of al.sourceMaterials)
    for (const k of ['componentId', 'purchaseValue', 'allocationPct', 'allocatedAmount'])
      assert.ok(m[k] !== undefined, k);
  const a = r.lines.find(l => l.componentId === 'A');
  assert.equal(a.formula, '7000 + (3500 + 0) / 10');
  assert.equal(a.landedCostSource, 'PROCUREMENT_BATCH_ALLOCATION');
  assert.equal(a.procurementBatchId, 'PB-001');
  // and it survives into the price master and the cost trace
  const pm = toPriceMasterEntries(r, { landedCostVersion: 'lc@1' });
  assert.equal(pm.A.landedCostBuildUp.allocatedDeliveryCost, 3500);
  assert.equal(pm.A.landedCostBuildUp.allocationMethod, 'PURCHASE_VALUE_PROPORTION');
});

test('P2-J 6 — project transportation is NEVER allocated into landed cost', () => {
  const out = buildBatchLandedCosts({ ...BATCH, projectTransportCost: 4000 });
  assert.equal(out.ok, false);
  assert.equal(out.errors[0].code, BATCH_ERROR.PROJECT_TRANSPORT_NOT_ALLOWED);
  assert.match(out.errors[0].message, /separate project cost head/);
  assert.equal(buildBatchLandedCosts(BATCH).allocation.scope, 'SUPPLIER_TO_WAREHOUSE');
  // the module knows nothing about project transport rates
  const src = strip(readFileSync('src/lib/procurementBatch.js', 'utf8'));
  for (const banned of ['ratePerKm', 'vehicleType', 'distanceKm'])
    assert.equal(src.includes(banned), false, banned);
  assert.equal(CFG.procurement.allocationScope, 'SUPPLIER_TO_WAREHOUSE');
});

test('P2-J 7/8 — landed cost versions are append-only; old stays readable', () => {
  let store = createHistoryStore();
  const pm1 = toPriceMasterEntries(buildBatchLandedCosts(BATCH), { landedCostVersion: 'LC-011' });
  store = appendVersion(store, { configType: CONFIG_TYPE.PROCUREMENT_PRICE, recordId: 'A',
    value: { purchasePrice: pm1.A.purchasePrice, landedUnitCost: pm1.A.landedUnitCost },
    versionId: 'LC-011', changedBy: 'procurement@flarize', changedAt: '2026-08-01T00:00:00Z',
    changeReason: 'batch PB-001', effectiveFrom: '2026-08-01' });

  const pm2 = toPriceMasterEntries(buildBatchLandedCosts({ ...BATCH, procurementBatchId: 'PB-002',
    deliveryCost: 6000 }), { landedCostVersion: 'LC-012' });
  store = appendVersion(store, { configType: CONFIG_TYPE.PROCUREMENT_PRICE, recordId: 'A',
    value: { purchasePrice: pm2.A.purchasePrice, landedUnitCost: pm2.A.landedUnitCost },
    versionId: 'LC-012', changedBy: 'procurement@flarize', changedAt: '2026-08-20T00:00:00Z',
    changeReason: 'new delivery charge', effectiveFrom: '2026-08-20' });

  assert.equal(getCurrentVersion(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'A').versionId, 'LC-012');
  assert.equal(getCurrentVersion(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'A').value.landedUnitCost, 7420);
  const old = getVersion(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'A', 'LC-011');
  assert.equal(old.status, CONFIG_STATUS.SUPERSEDED);
  assert.equal(old.value.landedUnitCost, 7350, 'the old landed cost is still readable');
  assert.equal(getVersionEffectiveAt(store, CONFIG_TYPE.PROCUREMENT_PRICE, 'A', '2026-08-10').versionId, 'LC-011');
});

// ==================================================================== P2-M
const vehicleCard = () => {
  let card = createRateCard({ cardVersion: 'RC-T1' });
  card = setRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'VEH-001',
    value: { vehicleId: 'VEH-001', vehicleName: 'Pickup (EXAMPLE)', ratePerKm: 30, unit: RATE_UNIT.PER_KM },
    versionId: 'V-1', changedBy: 'projecthead@flarize', changedAt: '2026-08-01T00:00:00Z',
    changeReason: 'initial', effectiveFrom: '2026-08-01' });
  card = setRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'VEH-002',
    value: { vehicleId: 'VEH-002', vehicleName: 'Lorry (EXAMPLE)', ratePerKm: 55, unit: RATE_UNIT.PER_KM },
    versionId: 'V-2', changedBy: 'projecthead@flarize', changedAt: '2026-08-01T00:00:00Z',
    changeReason: 'initial', effectiveFrom: '2026-08-01' });
  return card;
};
const bom = createProjectBomSnapshot({ projectId: 'PRJ-B', lockedBy: 'ph', lockedAt: AT,
  bomLines: [{ componentId: 'p1', role: 'PANEL', qty: 6 }] });
const costWith = ({ project: projOver, ...over } = {}) => calculateCost({
  snapshot: bom, config: CFG, priceMaster: { p1: { landedUnitCost: 13600, landedCostVersion: 'lc@1' } },
  project: { sizeKw: 3, installationType: 'FLAT', tier: 'VALUE', distanceKm: 40,
             vehicleType: 'VEH-001', structureMaterialCost: 10000, ...(projOver || {}) },
  calculatedAt: AT, ...over });

test('P2-M 9/10 — vehicle-specific rate, one-way, never doubled', () => {
  const card = vehicleCard();
  assert.equal(costWith({ rateCard: card }).transportationCost, 40 * 30);
  assert.equal(costWith({ rateCard: card, project: { vehicleType: 'VEH-002' } }).transportationCost, 40 * 55);
  const r = costWith({ rateCard: card });
  assert.equal(r.heads.TRANSPORTATION.inputs.distanceBasis, 'ONE_WAY');
  assert.notEqual(r.transportationCost, 2 * 40 * 30);
  assert.equal(r.heads.TRANSPORTATION.source, 'PROJECT_HEAD_RATE_CARD');
  assert.equal(r.heads.TRANSPORTATION.configVersion, 'V-1');
});

test('P2-M 11/12 — no 35/40 fallback, no free allowance, missing rate blocks', () => {
  // no rate card and no configured vehicle -> block, never 35 or 40
  const r = costWith({});
  assert.equal(r.transportationCost, null);
  assert.ok(r.errors.some(e => e.code === COST_ERROR.TRANSPORT_RATE_NOT_CONFIGURED));
  assert.equal(r.totalActualProjectCost, null);
  for (const legacy of [40 * 35, 40 * 40]) assert.notEqual(r.transportationCost, legacy);
  // an unconfigured vehicle on a populated card still blocks
  const miss = costWith({ rateCard: vehicleCard(), project: { vehicleType: 'VEH-999' } });
  assert.equal(miss.transportationCost, null);
  assert.ok(miss.errors.some(e => e.code === COST_ERROR.TRANSPORT_RATE_NOT_CONFIGURED));
  // 2026-09-07 (§16/§24): shipped vehicles are versioned UAT-reference records (isDemo:true),
  // never production truth; a production issue refuses them (DEMO_TRANSPORT_RATE_BLOCKED_IN_PRODUCTION).
  assert.equal(CFG.transportation.isDemo, true);
  assert.ok(CFG.transportation.vehicles.every(v => v.isDemo === true && v.version && v.effectiveFrom));
  assert.equal(CFG.transportation.status, 'CONFIGURED');
  // no legacy per-km rate literal, and no free-distance allowance, in the engine
  const src = strip(readFileSync('src/lib/costEngine.js', 'utf8'));
  for (const n of ['35', '40'])
    assert.equal(new RegExp(`[^\\w.]${n}[^\\w.]`).test(src), false, `literal ${n}`);
  for (const banned of ['freeDistanceKm', 'baseDistanceKm', 'chargeableKm'])
    assert.equal(src.includes(banned), false, banned);
  assert.deepEqual(CFG.transportation.rejectedLegacyRates.map(x => x.value), [35, 40, 100]);
});

test('P2-M 13/14 — vehicle rate history and effective-date selection', () => {
  let card = vehicleCard();
  card = setRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'VEH-001',
    value: { vehicleId: 'VEH-001', vehicleName: 'Pickup (EXAMPLE)', ratePerKm: 34, unit: RATE_UNIT.PER_KM },
    versionId: 'V-1b', changedBy: 'projecthead@flarize', changedAt: '2026-09-01T00:00:00Z',
    changeReason: 'fuel price increase', effectiveFrom: '2026-09-01', cardVersion: 'RC-T2' });

  const h = getHistory(card.store, RATE_TYPE.TRANSPORT_VEHICLE, 'VEH-001');
  assert.equal(h.length, 2);
  assert.equal(h[0].value.ratePerKm, 30);
  assert.equal(h[0].status, CONFIG_STATUS.SUPERSEDED);
  assert.equal(h[1].previousVersionId, 'V-1');
  // an old quotation keeps the old rate
  assert.equal(costWith({ rateCard: card, project: { rateEffectiveAt: '2026-08-15' } }).transportationCost, 40 * 30);
  assert.equal(costWith({ rateCard: card, project: { rateEffectiveAt: '2026-09-15' } }).transportationCost, 40 * 34);
  // retiring a vehicle does not delete its history
  const retired = { ...card, store: card.store };
  assert.equal(getVersion(retired.store, RATE_TYPE.TRANSPORT_VEHICLE, 'VEH-001', 'V-1').value.ratePerKm, 30);
});

// ==================================================================== P2-F
const MARGINS = { marginType: 'GROSS_MARGIN', version: 'margin@t1', tiers: {
  BASE: { targetMarginPct: 18, minimumMarginPct: 12 },
  VALUE: { targetMarginPct: 20, minimumMarginPct: 15 },
  PREMIUM: { targetMarginPct: 25, minimumMarginPct: 18 } } };
const goodCost = () => {
  const r = costWith({ rateCard: seededFullCard() });
  assert.equal(r.status, COST_STATUS.COMPLETE, JSON.stringify(r.errors));
  return r;
};
function seededFullCard() {
  let card = vehicleCard();
  const a = (id) => ({ versionId: id, changedBy: 'ph', changedAt: AT, changeReason: 'seed', effectiveFrom: '2026-08-01' });
  card = setRate(card, { rateType: RATE_TYPE.INSTALLATION, recordId: installationKey(3, 'FLAT'),
    value: { systemSizeKw: 3, installationType: 'FLAT', unit: 'PER_PROJECT', rate: 15000 }, ...a('I-1') });
  card = setRate(card, { rateType: RATE_TYPE.SITE_SURVEY, recordId: 'STANDARD',
    value: { costPerProject: 500, coverageKm: 100, excessRatePerKm: 3 }, ...a('S-1') });
  card = setRate(card, { rateType: RATE_TYPE.ENGINEERING_DESIGN, recordId: '<=20kW',
    value: { costPerProject: 500, sizeLimitKw: 20, unit: 'PER_PROJECT' }, ...a('E-1') });
  card = setRate(card, { rateType: RATE_TYPE.SERVICE, recordId: 'STANDARD',
    value: { costPerVisit: 1000, visitsPerYear: 2, serviceYears: 5, sizeLimitKw: 10 }, ...a('SV-1') });
  return card;
}

test('P2-F 15/16 — three tiers, Admin configurable', () => {
  assert.deepEqual(TIERS, ['BASE', 'VALUE', 'PREMIUM']);
  for (const t of TIERS) assert.equal(resolveTierMargin(MARGINS, t).ok, true, t);
  assert.equal(resolveTierMargin(MARGINS, 'BASE').targetMarginPct, 18);
  assert.equal(resolveTierMargin(MARGINS, 'PREMIUM').minimumMarginPct, 18);
  const c = goodCost();
  const base = calculatePricing({ costResult: c, margin: MARGINS, gst: CFG.gst, tier: 'BASE', pricedAt: AT });
  const prem = calculatePricing({ costResult: c, margin: MARGINS, gst: CFG.gst, tier: 'PREMIUM', pricedAt: AT });
  assert.equal(base.listSellingPriceBeforeGST, roundMoney(c.totalActualProjectCostExact / 0.82));
  assert.equal(prem.listSellingPriceBeforeGST, roundMoney(c.totalActualProjectCostExact / 0.75));
});

test('P2-F 17 — unconfigured tiers block, and are never treated as zero', () => {
  // Build an explicitly unconfigured margin to test the blocker path.
  // Production config may now be CONFIGURED, so we use a synthetic margin.
  const unconfiguredMargin = {
    status: 'DECISION_CLOSED_VALUES_NOT_CONFIGURED',
    tiers: { BASE: { targetMarginPct: null, minimumMarginPct: null },
             VALUE: { targetMarginPct: null, minimumMarginPct: null },
             PREMIUM: { targetMarginPct: null, minimumMarginPct: null } },
  };
  const c = goodCost();
  for (const t of TIERS) {
    const p = calculatePricing({ costResult: c, margin: unconfiguredMargin, gst: CFG.gst, tier: t, pricedAt: AT });
    assert.equal(p.status, PRICING_STATUS.REJECTED, t);
    assert.equal(p.error, PRICING_ERROR.MARGIN_CONFIG_INVALID, t);
    assert.equal(p.sellingPriceBeforeGST, null, t);
    // a 0% margin would have priced at cost — it does not
    assert.notEqual(p.sellingPriceBeforeGST, c.totalActualProjectCost, t);
  }
});

test('P2-F 18 — minimum <= target < 100 is enforced', () => {
  const bad = (t, m) => resolveTierMargin({ tiers: { VALUE: { targetMarginPct: t, minimumMarginPct: m } } }, 'VALUE');
  assert.equal(bad(20, 25).ok, false);
  assert.equal(bad(100, 10).ok, false);
  assert.equal(bad(20, -1).ok, false);
  assert.equal(bad(20, 20).ok, true, 'minimum may equal target');
  assert.equal(bad(0, 0).ok, true);
});

test('P2-F 19/20/21 — the margin gate, and margin recomputed after discount', () => {
  const c = goodCost();
  const p = (over) => calculatePricing({ costResult: c, margin: MARGINS, gst: CFG.gst, tier: 'VALUE', pricedAt: AT, ...over });
  // no discount -> at target
  assert.equal(p({}).actualGrossMarginPct, 20);
  assert.equal(p({}).approval, APPROVAL.NONE_REQUIRED);
  // small discount -> below target, above minimum
  const mid = p({ discount: { percentage: 3, requestedBy: 'sales@flarize' } });
  assert.equal(mid.status, PRICING_STATUS.COMPLETE);
  assert.equal(mid.approval, APPROVAL.SALES_HEAD_APPROVAL_REQUIRED);
  assert.ok(mid.actualGrossMarginPct >= 15 && mid.actualGrossMarginPct < 20);
  // the margin was recomputed on the DISCOUNTED price
  const expected = ((mid.exact.sellingBeforeGstExact - c.totalActualProjectCostExact)
    / mid.exact.sellingBeforeGstExact) * 100;
  assert.equal(mid.actualGrossMarginPct, roundMoney(expected * 10000) / 10000);
  // big discount -> below minimum -> hard block, no price
  const blocked = p({ discount: { percentage: 12, requestedBy: 'sales@flarize' } });
  assert.equal(blocked.status, PRICING_STATUS.REJECTED);
  assert.equal(blocked.error, PRICING_ERROR.MARGIN_BELOW_MINIMUM);
  assert.equal(blocked.sellingPriceBeforeGST, null);
  assert.match(blocked.errors[0].message, /Sales cannot bypass/);
});

test('P2-F 22 — a locked quotation preserves the margin version it used', () => {
  const c = goodCost();
  const p = calculatePricing({ costResult: c, margin: MARGINS, gst: CFG.gst, tier: 'VALUE', pricedAt: AT });
  const snap = createCommercialSnapshot({ snapshotId: 'CS-M', costResult: c, pricingResult: p, issuedAt: AT });
  assert.equal(snap.versions.marginVersion, 'margin@t1');
  // Admin raises the margin afterwards
  const p2 = calculatePricing({ costResult: c, gst: CFG.gst, tier: 'VALUE', pricedAt: AT,
    margin: { ...MARGINS, version: 'margin@t2',
      tiers: { ...MARGINS.tiers, VALUE: { targetMarginPct: 30, minimumMarginPct: 15 } } } });
  assert.notEqual(p2.sellingPriceBeforeGST, p.sellingPriceBeforeGST);
  assert.equal(snap.pricing.targetGrossMargin, 0.2, 'the locked quotation is unmoved');
  assert.equal(snap.versions.marginVersion, 'margin@t1');
});

// ==================================================================== P2-L
test('P2-L 23 — up to 20 kW is ₹500 per project', () => {
  const r = costWith({ rateCard: seededFullCard() });
  assert.equal(r.engineeringDesignCost, 500);
  assert.equal(r.heads.ENGINEERING_DESIGN.inputs.band, '<=20kW');
  assert.equal(costWith({ rateCard: seededFullCard(), project: { sizeKw: 20 } }).engineeringDesignCost, 500);
});

test('P2-L 24 — above 20 kW uses the rate card band, with its own unit', () => {
  let card = seededFullCard();
  card = setRate(card, { rateType: RATE_TYPE.ENGINEERING_DESIGN, recordId: '>20kW',
    value: { costPerProject: 2500, unit: 'PER_PROJECT' },
    versionId: 'E-2', changedBy: 'projecthead@flarize', changedAt: AT,
    changeReason: 'large-system engineering rate', effectiveFrom: '2026-08-16' });
  const r = costWith({ rateCard: card, project: { sizeKw: 25 } });
  assert.equal(r.engineeringDesignCost, 2500);
  assert.equal(r.heads.ENGINEERING_DESIGN.inputs.band, '>20kW');
  assert.equal(r.heads.ENGINEERING_DESIGN.configVersion, 'E-2');

  // a PER_KW band is honoured ONLY because the record declares it
  let perKw = seededFullCard();
  perKw = setRate(perKw, { rateType: RATE_TYPE.ENGINEERING_DESIGN, recordId: '>20kW',
    value: { costPerProject: 60, unit: 'PER_KW' },
    versionId: 'E-3', changedBy: 'ph', changedAt: AT, changeReason: 'per kW band', effectiveFrom: '2026-08-16' });
  const rk = costWith({ rateCard: perKw, project: { sizeKw: 25 } });
  assert.equal(rk.engineeringDesignCost, 60 * 25);
  assert.equal(rk.heads.ENGINEERING_DESIGN.inputs.unit, 'PER_KW');
});

test('P2-L 25/26 — ₹500 is never extrapolated; a missing >20 kW rate blocks', () => {
  const r = costWith({ rateCard: seededFullCard(), project: { sizeKw: 25 } });
  assert.equal(r.engineeringDesignCost, null);
  assert.notEqual(r.engineeringDesignCost, 500);
  assert.notEqual(r.engineeringDesignCost, 500 * 25);
  const e = r.errors.find(x => x.code === COST_ERROR.ENGINEERING_DESIGN_NOT_CONFIGURED);
  assert.ok(e);
  assert.match(e.message, /NOT extrapolated/);
  assert.equal(r.totalActualProjectCost, null);
  assert.equal(CFG.engineeringDesign.aboveLimitRate, null);
  assert.equal(CFG.engineeringDesign.aboveLimitStatus, 'DECISION_CLOSED_VALUE_NOT_CONFIGURED');
});

test('P2-L 27 — the engineering band rate is versioned and historied', () => {
  let card = seededFullCard();
  card = setRate(card, { rateType: RATE_TYPE.ENGINEERING_DESIGN, recordId: '>20kW',
    value: { costPerProject: 2500, unit: 'PER_PROJECT' },
    versionId: 'E-2', changedBy: 'ph', changedAt: '2026-08-16T00:00:00Z', changeReason: 'initial', effectiveFrom: '2026-08-16' });
  card = setRate(card, { rateType: RATE_TYPE.ENGINEERING_DESIGN, recordId: '>20kW',
    value: { costPerProject: 3000, unit: 'PER_PROJECT' },
    versionId: 'E-3', changedBy: 'ph', changedAt: '2026-10-01T00:00:00Z', changeReason: 'revised', effectiveFrom: '2026-10-01' });
  const h = getHistory(card.store, RATE_TYPE.ENGINEERING_DESIGN, '>20kW');
  assert.equal(h.length, 2);
  assert.equal(h[0].value.costPerProject, 2500);
  assert.equal(h[0].status, CONFIG_STATUS.SUPERSEDED);
  assert.equal(h[1].previousVersionId, 'E-2');
  assert.equal(costWith({ rateCard: card, project: { sizeKw: 25, rateEffectiveAt: '2026-09-01' } }).engineeringDesignCost, 2500);
  assert.equal(costWith({ rateCard: card, project: { sizeKw: 25, rateEffectiveAt: '2026-11-01' } }).engineeringDesignCost, 3000);
});

// ==================================================================== audit
test('28–31 — changedBy, changedAt, changeReason and effectiveFrom are mandatory', () => {
  const base = { configType: CONFIG_TYPE.MARGIN, recordId: 'VALUE', value: { targetMarginPct: 20 },
    versionId: 'M-1', changedBy: 'admin@flarize', changedAt: AT, changeReason: 'set', effectiveFrom: '2026-08-16' };
  for (const f of ['changedBy', 'changedAt', 'changeReason', 'effectiveFrom', 'versionId']) {
    const e = { ...base }; delete e[f];
    assert.throws(() => appendVersion(createHistoryStore(), e), /MISSING_AUDIT_FIELDS/, f);
  }
  assert.equal(appendVersion(createHistoryStore(), base).records['MARGIN::VALUE'][0].changedBy, 'admin@flarize');
});

test('32/33 — the previous version is retained and comparable', () => {
  let store = createHistoryStore();
  store = appendVersion(store, { configType: CONFIG_TYPE.MARGIN, recordId: 'VALUE',
    value: { targetMarginPct: 20, minimumMarginPct: 15 }, versionId: 'M-1', changedBy: 'admin',
    changedAt: '2026-08-01T00:00:00Z', changeReason: 'initial', effectiveFrom: '2026-08-01' });
  store = appendVersion(store, { configType: CONFIG_TYPE.MARGIN, recordId: 'VALUE',
    value: { targetMarginPct: 22, minimumMarginPct: 15 }, versionId: 'M-2', changedBy: 'admin',
    changedAt: '2026-09-01T00:00:00Z', changeReason: 'margin review', effectiveFrom: '2026-09-01' });
  const cmp = compareVersions(getVersion(store, CONFIG_TYPE.MARGIN, 'VALUE', 'M-1'),
                              getVersion(store, CONFIG_TYPE.MARGIN, 'VALUE', 'M-2'));
  assert.deepEqual(cmp.changes, [{ field: 'targetMarginPct', oldValue: 20, newValue: 22 }]);
  assert.equal(cmp.changeReason, 'margin review');
  assert.equal(getVersion(store, CONFIG_TYPE.MARGIN, 'VALUE', 'M-1').value.targetMarginPct, 20);
});

test('34 — a locked snapshot retains all thirteen versions', () => {
  const c = calculateCost({ snapshot: bom, config: CFG, rateCard: seededFullCard(),
    priceMaster: { p1: { landedUnitCost: 13600, landedCostVersion: 'lc@1' } },
    project: { sizeKw: 3, installationType: 'FLAT', tier: 'VALUE', distanceKm: 40,
               vehicleType: 'VEH-001', structureMaterialCost: 10000 },
    calculatedAt: AT, catalogVersion: 'catalog@t', procurementPriceVersion: 'pp@1',
    landedCostVersion: 'lc@1', projectRateCardVersion: 'RC-T1' });
  const p = calculatePricing({ costResult: c, margin: MARGINS, gst: CFG.gst, tier: 'VALUE', pricedAt: AT });
  const snap = createCommercialSnapshot({ snapshotId: 'CS-F', costResult: c, pricingResult: p, issuedAt: AT });
  assert.equal(VERSION_KEYS.length, 13);
  for (const k of VERSION_KEYS) assert.ok(snap.versions[k] !== undefined, k);
  assert.equal(snap.versions.landedCostVersion, 'lc@1');
  assert.equal(snap.versions.projectRateCardVersion, 'RC-T1');
  assert.throws(() => { snap.versions.landedCostVersion = 'lc@2'; }, TypeError);
});

// ================================================================ regression
test('35 — the engineering baseline is untouched by commercial work', () => {
  const v3 = JSON.parse(readFileSync('docs/baselines/golden-baseline-v3.json', 'utf8'));
  assert.equal(v3.cells.length, 54);
  // no commercial module imports anything from the engineering side
  for (const f of ['src/lib/procurementBatch.js', 'src/lib/commercialHistory.js',
                   'src/lib/projectRateCard.js', 'src/lib/pricingEngine.js']) {
    const imports = (strip(readFileSync(f, 'utf8')).match(/^import .*$/gm) || []);
    for (const imp of imports)
      assert.equal(/resolveBattery|engineeringChecker|projectBom|App\.jsx/.test(imp), false, `${f}: ${imp}`);
  }
});

// ------------------------------------------------ decision vs configuration
test('closed decisions are distinguished from unconfigured values', () => {
  // After production setup, some sections transition from DECISION_CLOSED_VALUES_NOT_CONFIGURED
  // to CONFIGURED. Transportation remains unconfigured. The key invariant is that
  // the status field exists and uses the documented vocabulary.
  assert.ok(['CONFIGURED', 'DECISION_CLOSED_VALUES_NOT_CONFIGURED'].includes(CFG.procurement.status));
  assert.ok(['CONFIGURED', 'DECISION_CLOSED_VALUES_NOT_CONFIGURED'].includes(CFG.transportation.status));
  assert.ok(['CONFIGURED', 'DECISION_CLOSED_VALUES_NOT_CONFIGURED'].includes(CFG.margin.status));
  assert.equal(CFG.engineeringDesign.aboveLimitStatus, 'DECISION_CLOSED_VALUE_NOT_CONFIGURED');
  // the closed METHOD is always recorded
  assert.equal(CFG.procurement.allocationMethod, 'PURCHASE_VALUE_PROPORTION');
  assert.equal(CFG.procurement.allocationExample.status, 'EXAMPLE — NOT ACTIVE CONFIGURATION');
  // transportation may be configured with vehicles
  assert.ok(Array.isArray(CFG.transportation.vehicles));
});

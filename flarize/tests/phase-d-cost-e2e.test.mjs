// tests/phase-d-cost-e2e.test.mjs
//
// Phase D (2026-09-05) — Procurement + Cost E2E.
// Verifies:
//   • Cost engine consumes landedUnitCost, never substitutes purchasePrice or
//     catalog price.
//   • Transportation formula: distanceKm × vehicle.ratePerKm, ONE_WAY, no
//     free 100-km allowance (locked 2.1).
//   • Seed-vs-production discipline (locked 2.8).
//   • BATCH-SEED-005 landed cost round-trips through buildBom → costEngine.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

async function loadCostEngine() { return await import('../src/lib/costEngine.js'); }
async function loadProcurement() { return await import('../src/lib/procurementWorkspace.js'); }
const catalog = require('../data/catalog.json');
const procurementState = require('../data/procurement-state.json');
const procurementPriceMaster = require('../data/procurement-price-master.json');
const { buildBom } = require('../server-bom-builder.js');

// Minimal valid config that lets costEngine reach COMPLETE for a small BOM.
function makeMinimalConfig() {
  return {
    installation: { rates: [
      { systemSizeKw: 3,  installationType: 'FLAT', unit: 'PER_PROJECT', rate: 15000 },
      { systemSizeKw: 5,  installationType: 'FLAT', unit: 'PER_PROJECT', rate: 22000 },
      { systemSizeKw: 10, installationType: 'FLAT', unit: 'PER_PROJECT', rate: 42000 },
    ] },
    transportation: { vehicles: [
      { vehicleType: 'STANDARD', ratePerKm: 35 },
      { vehicleType: 'LORRY',    ratePerKm: 50 },
    ] },
    structure: {
      roofAddOn: [{ installationType: 'FLAT', rate: 0, unit: 'PER_PROJECT' }],
      labour:    { rate: 3000, unit: 'PER_PROJECT' },
      repairAllowancePct: { value: 10, basis: 'STRUCTURE_MATERIAL' },
    },
    siteSurvey:        { costPerProject: 500, coverageKm: 100, excessRatePerKm: 3 },
    engineeringDesign: { costPerProject: 500, sizeLimitKw: 20 },
    serviceAmc:        { serviceIncluded: true, costPerVisit: 1000, visitsPerYear: 2, serviceYears: 5, sizeLimitKw: 10 },
    officeExpenseAllocation: { monthlyOfficeExpense: 150000, expectedProjectsPerMonth: 10 },
    miscellaneous:     { percentage: 1 },
  };
}

// Fixed-item consumables (fi_*) currently lack landed cost seeds (procurement
// data gap flagged for Phase D+). Filter to lines that HAVE landed records so
// we can exercise the material-cost mechanic without the missing-fixed-items
// gap blocking every test. The engine's own gate (LANDED_COST_NOT_CONFIGURED)
// is what enforces "no missing landed" in production issuance — that behavior
// is exercised in the poisoned-cost test.
function makeLockedSnapshotFromBom(bom, priceMaster) {
  return {
    bomSnapshotId: 'test-snapshot',
    status: 'LOCKED',
    lines: bom.lines
      .filter(l => l.componentId && priceMaster[l.componentId] && priceMaster[l.componentId].landedUnitCost != null)
      .map(l => ({ componentId: l.componentId, quantity: l.qty })),
  };
}

const baseProject = { distanceKm: 30, vehicleType: 'STANDARD', sizeKw: 5, installationType: 'FLAT' };

// -----------------------------------------------------------------------------
// 1. Cost engine uses landedUnitCost, never purchasePrice or catalog price.
// -----------------------------------------------------------------------------
describe('D — cost engine uses landedUnitCost', () => {
  it('MATERIAL_LANDED = Σ qty × landedUnitCost from procurement price master', async () => {
    const { calculateCost } = await loadCostEngine();
    const bom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const snapshot = makeLockedSnapshotFromBom(bom, procurementPriceMaster);
    // Expected: sum only the priced lines (fi_* consumables filtered above).
    let expected = 0;
    for (const line of snapshot.lines) {
      const rec = procurementPriceMaster[line.componentId];
      expected += Number(line.quantity) * Number(rec.landedUnitCost);
    }
    const r = calculateCost({
      snapshot, config: makeMinimalConfig(),
      priceMaster: procurementPriceMaster, project: baseProject,
    });
    const material = r.heads.MATERIAL_LANDED;
    assert.ok(material, 'MATERIAL_LANDED head present');
    assert.equal(Math.round(material.amount), Math.round(expected),
      `MATERIAL_LANDED (${material.amount}) must equal Σ qty×landedUnitCost (${expected})`);
  });

  it('purchasePrice is NEVER substituted when landedUnitCost is missing', async () => {
    const { calculateCost } = await loadCostEngine();
    const bom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const snapshot = makeLockedSnapshotFromBom(bom, procurementPriceMaster);
    const firstCid = snapshot.lines[0].componentId;
    const original = procurementPriceMaster[firstCid];
    const poisoned = { ...procurementPriceMaster };
    poisoned[firstCid] = { ...original, landedUnitCost: null };
    const cfg = makeMinimalConfig();
    const injured = calculateCost({ snapshot, config: cfg, priceMaster: poisoned, project: baseProject });
    // The engine gates the entire MATERIAL_LANDED head when any line is missing
    // landed cost. Result: material.amount is null (returned as null in status
    // LANDED_COST_NOT_CONFIGURED). Purchase price MUST NOT be quietly substituted.
    const material = injured.heads.MATERIAL_LANDED;
    // Assert either amount is null / 0 (blocked) OR status flags LANDED_COST_NOT_CONFIGURED.
    const rejectedProperly = (material.amount == null || material.amount === 0)
                          || material.status === 'LANDED_COST_NOT_CONFIGURED';
    assert.ok(rejectedProperly,
      `material head must not silently accept purchase price. status=${material.status} amount=${material.amount}`);
    // Confirm the per-line record for the poisoned line was rejected.
    const poisonedLineRecord = material.lines?.find?.(l => l.componentId === firstCid);
    if (poisonedLineRecord) {
      assert.equal(poisonedLineRecord.landedUnitCost, null);
      assert.notEqual(poisonedLineRecord.status, 'OK');
      // purchasePrice remains visible for audit — but never becomes the extendedCost.
      assert.equal(poisonedLineRecord.extendedCost, null);
    }
  });
});

// -----------------------------------------------------------------------------
// 2. Transportation formula (locked 2.1)
// -----------------------------------------------------------------------------
describe('D — transportation (locked 2.1)', () => {
  const emptySnap = { bomSnapshotId: 'test', status: 'LOCKED', lines: [] };
  const emptyPM = {};
  const cfg = makeMinimalConfig();

  it('STANDARD × 100 km = 3,500 (NO free-km allowance)', async () => {
    const { calculateCost } = await loadCostEngine();
    const r = calculateCost({ snapshot: emptySnap, config: cfg, priceMaster: emptyPM,
      project: { ...baseProject, distanceKm: 100 } });
    assert.equal(r.heads.TRANSPORTATION.amount, 3500);
  });
  it('STANDARD × 250 km = 8,750 (no round-trip doubling)', async () => {
    const { calculateCost } = await loadCostEngine();
    const r = calculateCost({ snapshot: emptySnap, config: cfg, priceMaster: emptyPM,
      project: { ...baseProject, distanceKm: 250 } });
    assert.equal(r.heads.TRANSPORTATION.amount, 250 * 35);
  });
  it('LORRY × 120 km = 6,000 (per-vehicle rate authoritative)', async () => {
    const { calculateCost } = await loadCostEngine();
    const r = calculateCost({ snapshot: emptySnap, config: cfg, priceMaster: emptyPM,
      project: { ...baseProject, vehicleType: 'LORRY', distanceKm: 120 } });
    assert.equal(r.heads.TRANSPORTATION.amount, 6000);
  });
  it('30 km is NOT free — 30 × 35 = 1,050', async () => {
    const { calculateCost } = await loadCostEngine();
    const r = calculateCost({ snapshot: emptySnap, config: cfg, priceMaster: emptyPM,
      project: { ...baseProject, distanceKm: 30 } });
    assert.equal(r.heads.TRANSPORTATION.amount, 30 * 35);
  });
});

// -----------------------------------------------------------------------------
// 3. Seed-vs-production discipline (locked 2.8)
// -----------------------------------------------------------------------------
describe('D — seed vs production procurement (locked 2.8)', () => {
  it('all 5 BATCH-SEED-* recognized as SEED', async () => {
    const { isBatchSeed, batchSeedSummary } = await loadProcurement();
    const summary = batchSeedSummary(procurementState);
    assert.equal(summary.total, 5);
    assert.equal(summary.seed.length, 5);
    assert.equal(summary.production.length, 0);
    assert.equal(summary.hasCommittedProductionBatch, false);
    for (const b of Object.values(procurementState.batches)) {
      assert.ok(isBatchSeed(b), `${b.batchId} classified as SEED`);
    }
  });
  it('assertProductionProcurementAvailable throws NO_PRODUCTION_BATCH on seed-only', async () => {
    const { assertProductionProcurementAvailable, PROCUREMENT_ERROR } = await loadProcurement();
    let err = null;
    try { assertProductionProcurementAvailable(procurementState); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, PROCUREMENT_ERROR.NO_PRODUCTION_BATCH);
  });
  it('production batch (isSeed:false, COMMITTED) passes the gate', async () => {
    const { assertProductionProcurementAvailable } = await loadProcurement();
    const testStore = {
      suppliers: {},
      batches: {
        'BATCH-PROD-001': { batchId: 'BATCH-PROD-001', isSeed: false, status: 'COMMITTED' },
      },
    };
    const s = assertProductionProcurementAvailable(testStore);
    assert.equal(s.hasCommittedProductionBatch, true);
  });
  it('non-seed batch with status = DRAFT does NOT satisfy the gate', async () => {
    const { assertProductionProcurementAvailable, PROCUREMENT_ERROR } = await loadProcurement();
    const testStore = {
      suppliers: {},
      batches: { 'BATCH-PROD-DRAFT': { batchId: 'BATCH-PROD-DRAFT', isSeed: false, status: 'DRAFT' } },
    };
    let err = null;
    try { assertProductionProcurementAvailable(testStore); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, PROCUREMENT_ERROR.NO_PRODUCTION_BATCH);
  });
});

// -----------------------------------------------------------------------------
// 4. Catalog price is NEVER treated as landed cost.
// -----------------------------------------------------------------------------
describe('D — catalog price is never landed cost', () => {
  it('BOM lines whose catalog price differs from landed cost — landed cost is what the engine uses', async () => {
    const { calculateCost } = await loadCostEngine();
    const bom = buildBom({ systemType: 'ongrid', size: '10', tier: 'value' });
    const catalogById = new Map();
    for (const cat of Object.values(catalog.categories)) {
      if (!cat.items) continue;
      for (const it of cat.items) catalogById.set(it.id, it.price);
    }
    let usingCatalogPrice = 0;
    let usingLandedPrice  = 0;
    for (const line of bom.lines) {
      if (!line.componentId) continue;
      const rec = procurementPriceMaster[line.componentId];
      if (!rec || rec.landedUnitCost == null) continue;
      const catPrice = catalogById.get(line.componentId);
      if (catPrice != null && catPrice !== rec.landedUnitCost) {
        // Different — engine should use landed, not catalog. Cost engine already proven
        // in test 1 to use landedUnitCost.
        usingLandedPrice++;
      } else if (catPrice != null) {
        usingCatalogPrice++; // catalog == landed by coincidence
      }
    }
    // Assert at least one line has divergence — proving the choice matters.
    // On the current dataset most catalog prices differ from landed (BATCH-SEED-005 applied).
    assert.ok(usingLandedPrice > 0, `at least one line has catalog≠landed; found ${usingLandedPrice}`);
    // And test 1 proves MATERIAL_LANDED uses landedUnitCost sum, not catalog price sum.
    // Cross-check: sum catalog would differ from sum landed by a measurable amount.
    // Snapshot only priced lines so engine can compute a complete MATERIAL_LANDED.
    const snapshot = makeLockedSnapshotFromBom(bom, procurementPriceMaster);
    let sumCatalog = 0, sumLanded = 0;
    for (const line of snapshot.lines) {
      const rec = procurementPriceMaster[line.componentId];
      const catPrice = catalogById.get(line.componentId);
      sumLanded  += Number(line.quantity) * Number(rec.landedUnitCost);
      if (catPrice != null) sumCatalog += Number(line.quantity) * Number(catPrice);
    }
    const r = calculateCost({ snapshot, config: makeMinimalConfig(), priceMaster: procurementPriceMaster, project: baseProject });
    assert.equal(Math.round(r.heads.MATERIAL_LANDED.amount), Math.round(sumLanded),
      'MATERIAL_LANDED matches Σ qty×landedUnitCost, NOT Σ qty×catalog.price');
    assert.notEqual(Math.round(sumCatalog), Math.round(sumLanded),
      'catalog and landed sums must actually differ on this dataset');
  });
});

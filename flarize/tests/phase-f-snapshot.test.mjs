// tests/phase-f-snapshot.test.mjs
//
// Phase F (2026-09-05) — Commercial freeze / snapshot completeness.
// Verifies all 14 Phase F points.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { buildBom } = require('../server-bom-builder.js');
const catalog = require('../data/catalog.json');
const ppm = require('../data/procurement-price-master.json');
const { buildCommercialSnapshot } = await import('../src/lib/commercialFreeze.js');
const branding = await import('../src/lib/quotationBranding.js');
const policy   = await import('../src/lib/quotationPolicy.js');
async function loadCostEngine()    { return await import('../src/lib/costEngine.js'); }
async function loadPricingEngine() { return await import('../src/lib/pricingEngine.js'); }

const gstCfg = {
  regime: 'SOLAR_70_30_COMPOSITE', goodsValuationPct: 70, goodsRatePct: 5,
  serviceValuationPct: 30, serviceRatePct: 18, effectiveRatePct: 8.9,
};
const marginCfg = { marginType: 'GROSS_MARGIN', tiers: {
  BASE: { targetMarginPct: 20, minimumMarginPct: 15 },
  VALUE:{ targetMarginPct: 20, minimumMarginPct: 15 },
  PREMIUM:{ targetMarginPct: 20, minimumMarginPct: 15 },
} };
const costCfg = () => ({
  installation: { rates: [{systemSizeKw:5,installationType:'FLAT',unit:'PER_PROJECT',rate:22000}] },
  transportation: { version: 'transport@2026-09-05', distanceBasis: 'ONE_WAY',
    vehicles: [{ vehicleType:'STANDARD', ratePerKm: 35 }, { vehicleType:'LORRY', ratePerKm: 50 }] },
  structure: { roofAddOn:[{installationType:'FLAT',rate:0,unit:'PER_PROJECT'}], labour:{rate:3000,unit:'PER_PROJECT'}, repairAllowancePct:{value:10,basis:'STRUCTURE_MATERIAL'} },
  siteSurvey: { costPerProject:500, coverageKm:100, excessRatePerKm:3 },
  engineeringDesign: { costPerProject:500, sizeLimitKw:20 },
  serviceAmc: { serviceIncluded:true, costPerVisit:1000, visitsPerYear:2, serviceYears:5, sizeLimitKw:10 },
  officeExpenseAllocation: { monthlyOfficeExpense:150000, expectedProjectsPerMonth:10 },
  miscellaneous: { percentage:1 },
});
function snapFromBom(bom) {
  return { bomSnapshotId:'test-snap', status:'LOCKED', lines: bom.lines
    .filter(l => l.componentId && ppm[l.componentId]?.landedUnitCost != null)
    .map(l => ({ componentId: l.componentId, quantity: l.qty })) };
}

async function priceOne(bom, tier, project) {
  const { calculateCost } = await loadCostEngine();
  const { calculatePricing } = await loadPricingEngine();
  const cost = calculateCost({ snapshot: snapFromBom(bom), config: costCfg(),
    priceMaster: ppm, project });
  const p = calculatePricing({ costResult: cost, margin: marginCfg, gst: gstCfg, tier: tier.toUpperCase() });
  return { cost, pricing: p };
}

// A live branding store with actual versions the test can freeze against.
function makeBrandingStore() {
  return {
    schema: 'flarize.quotation-branding/1',
    bank: {
      current: 'BK-V1',
      versions: {
        'BK-V1': { versionId:'BK-V1', publishedAt:'2026-09-05T00:00:00Z', publishedBy:'admin-001',
                   values: { bankName:'Flarize Bank A', bankAccountName:'FLARIZE TECHNOLOGIES PVT LTD',
                             bankAccountNumber:'1234567890', bankIfsc:'FBIN0001234', bankBranch:'Alappuzha' } },
      },
    },
    upi: { current: 'UPI-V1', versions: {
      'UPI-V1': { versionId:'UPI-V1', publishedAt:'2026-09-05T00:00:00Z', publishedBy:'admin-001',
                  values: { upiId:'flarize@bank', upiQrAssetId:'qr-01', upiQrImageUri:'/api/cms/assets/qr-01' } },
    } },
    signature: { current: 'SIG-V1', versions: {
      'SIG-V1': { versionId:'SIG-V1', publishedAt:'2026-09-05T00:00:00Z', publishedBy:'projhead-001',
                  values: { signatureAssetId:'sig-01', signatureImageUri:'/api/cms/assets/sig-01' } },
    } },
    seal: { current: 'SEAL-V1', versions: {
      'SEAL-V1': { versionId:'SEAL-V1', publishedAt:'2026-09-05T00:00:00Z', publishedBy:'admin-001',
                   values: { sealAssetId:'seal-01', sealImageUri:'/api/cms/assets/seal-01' } },
    } },
  };
}
function makePolicy() {
  return {
    schema: 'flarize.quotation-policy/1',
    validity: { defaultDays: 15, version: 'v1', updatedBy: 'admin-001', updatedAt: '2026-09-05T00:00:00Z' },
  };
}

// ============================================================================
// Snapshot builder tests (all 14 verification points).
// ============================================================================

describe('F — snapshot completeness', () => {
  it('freezes engineering, battery, package, procurement, transportation, commercial, subsidy, branding, validity, rendererPin', async () => {
    const bom = buildBom({ systemType:'hybrid', size:'5', tier:'value', batteryQuantity: 1 });
    const project = { distanceKm: 30, vehicleType:'STANDARD', sizeKw:5, installationType:'FLAT' };
    const { pricing } = await priceOne(bom, 'value', project);

    const snap = buildCommercialSnapshot({
      bom, project,
      transportationConfig: costCfg().transportation,
      commercialSnapshot: pricing,
      subsidyResult: { available:true, subsidyType:'residential', centralSubsidy:78000, stateSubsidy:0, totalSubsidy:78000, eligibilityStatus:'ELIGIBLE', schemeName:'PMSG', calculatedAt:'2026-09-05T00:00:00Z' },
      brandingStore: makeBrandingStore(),
      policy: makePolicy(),
      issuedAt: '2026-09-05T12:00:00Z',
      rendererPin: { name:'Flarize_Solar_Quotation.v1', bundleSha256:'fbb4e5e2', rendererVersion:'approvedTemplate.1' },
      packageProfile: catalog.packageProfiles.hybrid_value,
    });

    assert.ok(snap.engineering, 'engineering present');
    assert.ok(snap.battery, 'battery present');
    assert.equal(snap.battery.batteryQuantity, 1);
    assert.equal(snap.battery.batterySource, 'PROJECT_HEAD_OVERRIDE');
    assert.ok(snap.package, 'package present');
    assert.equal(snap.package.profileKey, 'hybrid_value');
    assert.equal(snap.package.tier, 'value');
    assert.equal(snap.package.isPremiumTier, false);
    assert.ok(snap.transportation);
    assert.equal(snap.transportation.vehicleType, 'STANDARD');
    assert.equal(snap.transportation.distanceKm, 30);
    assert.equal(snap.transportation.ratePerKm, 35);
    assert.equal(snap.transportation.distanceBasis, 'ONE_WAY');
    assert.equal(snap.transportation.rateVersion, 'transport@2026-09-05');
    assert.equal(snap.transportation.formula, 'distanceKm × vehicle.ratePerKm');
    assert.ok(snap.commercial);
    assert.equal(snap.commercial.marginType, 'GROSS_MARGIN');
    assert.equal(snap.commercial.gstRegime, 'SOLAR_70_30_COMPOSITE');
    assert.ok(snap.commercial.sellingPriceBeforeGST > 0);
    assert.ok(snap.subsidy);
    assert.equal(snap.subsidy.centralSubsidy, 78000);
    assert.ok(snap.branding);
    assert.equal(snap.branding.bank.versionId, 'BK-V1');
    assert.equal(snap.branding.upi.versionId, 'UPI-V1');
    assert.equal(snap.branding.signature.versionId, 'SIG-V1');
    assert.equal(snap.branding.seal.versionId, 'SEAL-V1');
    assert.ok(snap.validity);
    assert.equal(snap.validity.validityDays, 15);
    assert.equal(snap.validity.source, 'ADMIN_DEFAULT');
    assert.ok(snap.validity.validUntil);
    assert.ok(snap.rendererPin);
    assert.equal(snap.rendererPin.rendererVersion, 'approvedTemplate.1');
  });

  it('validity override by Project Head is snapshotted with source', async () => {
    const bom = buildBom({ systemType:'ongrid', size:'5sp', tier:'base' });
    const project = { distanceKm: 30, vehicleType:'STANDARD', sizeKw:5, installationType:'FLAT' };
    const { pricing } = await priceOne(bom, 'base', project);
    const snap = buildCommercialSnapshot({
      bom, project, transportationConfig: costCfg().transportation, commercialSnapshot: pricing,
      brandingStore: makeBrandingStore(), policy: makePolicy(), validityOverrideDays: 30,
      issuedAt: '2026-09-05T12:00:00Z',
    });
    assert.equal(snap.validity.validityDays, 30);
    assert.equal(snap.validity.source, 'PROJECT_HEAD_OVERRIDE');
    // validUntil = issuedAt + 30 days
    assert.equal(new Date(snap.validity.validUntil).getTime() - new Date('2026-09-05T12:00:00Z').getTime(), 30 * 86400000);
  });

  it('validity policy override with 15 days ⇒ +15 days validUntil', async () => {
    const bom = buildBom({ systemType:'ongrid', size:'5sp', tier:'base' });
    const { pricing } = await priceOne(bom, 'base', { distanceKm:30, vehicleType:'STANDARD', sizeKw:5, installationType:'FLAT' });
    const snap = buildCommercialSnapshot({
      bom, project: { distanceKm:30, vehicleType:'STANDARD' },
      transportationConfig: costCfg().transportation, commercialSnapshot: pricing,
      brandingStore: makeBrandingStore(), policy: makePolicy(),
      issuedAt: '2026-09-05T12:00:00Z',
    });
    const days = (new Date(snap.validity.validUntil).getTime() - new Date('2026-09-05T12:00:00Z').getTime()) / 86400000;
    assert.equal(days, 15);
  });
});

// ============================================================================
// Mutation immunity
// ============================================================================

describe('F — mutation immunity', () => {
  it('mutating live branding store after freeze does NOT alter frozen snapshot', async () => {
    const store = makeBrandingStore();
    const bom = buildBom({ systemType:'ongrid', size:'5sp', tier:'base' });
    const { pricing } = await priceOne(bom, 'base', { distanceKm:30, vehicleType:'STANDARD', sizeKw:5, installationType:'FLAT' });
    const snap = buildCommercialSnapshot({
      bom, project: { distanceKm:30, vehicleType:'STANDARD' },
      transportationConfig: costCfg().transportation, commercialSnapshot: pricing,
      brandingStore: store, policy: makePolicy(),
      issuedAt: '2026-09-05T12:00:00Z',
    });
    const frozenBankNumber = snap.branding.bank.values.bankAccountNumber;
    // Now mutate the store
    store.bank.versions['BK-V1'].values.bankAccountNumber = 'MUTATED-9999';
    store.bank.current = null;
    // Frozen snapshot still holds original value
    assert.equal(snap.branding.bank.values.bankAccountNumber, frozenBankNumber);
    assert.equal(snap.branding.bank.values.bankAccountNumber, '1234567890');
  });
  it('publishing a new branding version after freeze does NOT alter frozen snapshot', () => {
    const store = makeBrandingStore();
    const snap = branding.freezeBrandingSnapshot(store);
    // Admin publishes a new bank version and switches current
    store.bank.versions['BK-V2'] = { versionId:'BK-V2', publishedAt:'2027-01-01', publishedBy:'admin-001',
      values: { bankName:'Flarize Bank NEW' } };
    store.bank.current = 'BK-V2';
    assert.equal(snap.bank.versionId, 'BK-V1');
    assert.equal(snap.bank.values.bankName, 'Flarize Bank A');
  });
  it('changing policy defaultDays after freeze does NOT alter frozen validity', () => {
    const pol = makePolicy();
    const r1 = policy.resolveEffectiveValidity(pol, null, '2026-09-05T00:00:00Z');
    // Admin bumps default to 30
    pol.validity.defaultDays = 30;
    // Original snapshot still says 15
    assert.equal(r1.validityDays, 15);
    // Fresh call sees the new value
    const r2 = policy.resolveEffectiveValidity(pol, null, '2026-09-05T00:00:00Z');
    assert.equal(r2.validityDays, 30);
  });
  it('every level of commercial snapshot is deep-frozen', async () => {
    const bom = buildBom({ systemType:'ongrid', size:'5sp', tier:'base' });
    const { pricing } = await priceOne(bom, 'base', { distanceKm:30, vehicleType:'STANDARD', sizeKw:5, installationType:'FLAT' });
    const snap = buildCommercialSnapshot({
      bom, project: { distanceKm:30, vehicleType:'STANDARD' },
      transportationConfig: costCfg().transportation, commercialSnapshot: pricing,
      brandingStore: makeBrandingStore(), policy: makePolicy(),
      issuedAt: '2026-09-05T12:00:00Z',
    });
    assert.equal(Object.isFrozen(snap), true);
    assert.equal(Object.isFrozen(snap.branding.bank.values), true);
    assert.equal(Object.isFrozen(snap.transportation), true);
    assert.equal(Object.isFrozen(snap.commercial), true);
    assert.equal(Object.isFrozen(snap.package), true);
    assert.throws(() => { snap.commercial.gstAmount = 999; }, TypeError);
  });
});

// ============================================================================
// Determinism
// ============================================================================

describe('F — determinism', () => {
  it('same inputs produce byte-equal snapshot (JSON-canonical)', async () => {
    const bom = buildBom({ systemType:'hybrid', size:'5', tier:'value', batteryQuantity: 2 });
    const project = { distanceKm: 50, vehicleType:'LORRY', sizeKw:5, installationType:'FLAT' };
    const { pricing } = await priceOne(bom, 'value', project);
    const store = makeBrandingStore();
    const pol = makePolicy();
    const at = '2026-09-05T12:00:00Z';
    const s1 = buildCommercialSnapshot({
      bom, project, transportationConfig: costCfg().transportation, commercialSnapshot: pricing,
      brandingStore: store, policy: pol, issuedAt: at,
    });
    const s2 = buildCommercialSnapshot({
      bom, project, transportationConfig: costCfg().transportation, commercialSnapshot: pricing,
      brandingStore: store, policy: pol, issuedAt: at,
    });
    assert.equal(JSON.stringify(s1), JSON.stringify(s2));
  });
});

// ============================================================================
// RBAC — Sales cannot mutate branding OR policy
// ============================================================================

describe('F — RBAC (Sales cannot mutate controlled fields)', () => {
  it('Sales role rejected by assertBrandingEditor', () => {
    for (const role of ['SALES','SALES_HEAD','SALES_CRS','FIELD_SALES']) {
      let err = null;
      try { branding.assertBrandingEditor({ userId:'u', role }); } catch (e) { err = e; }
      assert.ok(err, `${role} must be rejected`);
      assert.equal(err.code, branding.BRANDING_ERROR.BRANDING_EDITOR_FORBIDDEN);
    }
  });
  it('Sales role rejected by assertPolicyEditor (Phase J: PROJECT_HEAD now permitted as validity-policy owner)', () => {
    for (const role of ['SALES','SALES_HEAD']) {
      let err = null;
      try { policy.assertPolicyEditor({ userId:'u', role }); } catch (e) { err = e; }
      assert.ok(err); assert.equal(err.code, policy.POLICY_ERROR.POLICY_EDITOR_FORBIDDEN);
    }
    // Phase J: PROJECT_HEAD is the effective-policy owner; ADMIN retains access.
    assert.doesNotThrow(() => policy.assertPolicyEditor({ userId:'u', role:'ADMIN' }));
    assert.doesNotThrow(() => policy.assertPolicyEditor({ userId:'u', role:'PROJECT_HEAD' }));
  });
  it('ADMIN + PROJECT_HEAD accepted by assertBrandingEditor', () => {
    assert.doesNotThrow(() => branding.assertBrandingEditor({ userId:'u', role:'ADMIN' }));
    assert.doesNotThrow(() => branding.assertBrandingEditor({ userId:'u', role:'PROJECT_HEAD' }));
  });
});

// ============================================================================
// Blocked-when-not-configured
// ============================================================================

describe('F — blocked when policy / branding not configured', () => {
  it('resolveEffectiveValidity throws POLICY_NOT_CONFIGURED when both default and override missing', () => {
    const pol = { validity: { defaultDays: null } };
    let err = null;
    try { policy.resolveEffectiveValidity(pol, null, '2026-09-05T00:00:00Z'); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, policy.POLICY_ERROR.POLICY_NOT_CONFIGURED);
  });
  it('freezeBrandingSnapshot emits null per-kind when no current version', () => {
    const empty = { bank:{current:null,versions:{}}, upi:{current:null,versions:{}},
      signature:{current:null,versions:{}}, seal:{current:null,versions:{}} };
    const snap = branding.freezeBrandingSnapshot(empty);
    assert.equal(snap.bank, null);
    assert.equal(snap.upi, null);
    assert.equal(snap.signature, null);
    assert.equal(snap.seal, null);
  });
});

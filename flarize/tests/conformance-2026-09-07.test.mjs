/**
 * CONFORMANCE 2026-09-07 — regression coverage for the changes made against the
 * FINAL MASTER PRODUCT CONFORMANCE + BOM DELIVERY brief.
 *
 *   §4/§7  battery quantity is PROJECT-level (0/1/2) and is applied to the
 *          materialised project BOM by the orchestrator, never invented.
 *   §16    transport: snapshot freezes the rate the Cost Engine actually applied
 *          (rate card versionId + source); UAT reference vehicles are isDemo and
 *          refused in production.
 *   §18    validity policy write surface (Admin + Project Head; Sales refused).
 *   §19    branding write surface (multi-account bank/upi, single-slot sig/seal;
 *          versions immutable; Sales refused).
 *
 * Every assertion runs against the real modules — no fixture engines.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildCommercialSnapshot } from '../src/lib/commercialFreeze.js';
import { publishPolicy, setPolicyStatus, setDefaultValidityDays, resolveEffectiveValidity, describePolicyStore } from '../src/lib/quotationPolicy.js';
import { publishBrandingVersion, setBrandingAccountStatus, setPrimaryBrandingAccount, freezeBrandingSnapshot, describeBrandingStore } from '../src/lib/quotationBranding.js';
import { applyProjectBatteryQuantity, ORCHESTRATION_ERROR, resolveSalesSelections, SALES_CUSTOMIZABLE_CATEGORIES, subsidyDraftFields } from '../src/lib/salesOrchestrator.js';
import { resolvePackageArchitecture, runPackageChecker } from '../src/lib/packageApproval.js';
import { projectIssuedPayloadForActor, projectIssuedSnapshotForActor } from '../src/lib/quotationWorkspace.js';
import * as W from '../src/lib/projectWorkspace.js';
import { hydrateRegistry, visibleForRuntime } from '../src/lib/packageProjection.js';
import { createRateCard, setRate, RATE_TYPE, RATE_UNIT } from '../src/lib/projectRateCard.js';
import { calculateCost } from '../src/lib/costEngine.js';

const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const costConfig = JSON.parse(readFileSync('data/cost-config.json', 'utf8'));
const rawRegistry = JSON.parse(readFileSync('data/packages.proposed.json', 'utf8'));
const batteryMaster = (JSON.parse(readFileSync('data/battery-master.json', 'utf8')).batteries) || {};

const PH = { userId: 'ph-1', role: 'PROJECT_HEAD' };
const ADMIN = { userId: 'admin-1', role: 'ADMIN' };
const SALES = { userId: 'sales-1', role: 'SALES' };
const AT = '2026-09-07T10:00:00.000Z';

const thrown = (fn) => { try { fn(); } catch (e) { return e; } throw new Error('expected throw'); };

// ───────────────────────────────────────────────────────────────────────────
// §16 transport — snapshot freezes the APPLIED rate; demo guard in production
// ───────────────────────────────────────────────────────────────────────────
describe('§16 transport — cost-config vehicles are versioned UAT reference (isDemo)', () => {
  test('shipped vehicles carry audit fields and isDemo:true; block is not production-use', () => {
    const t = costConfig.transportation;
    assert.equal(t.isDemo, true);
    assert.equal(t.productionUse, false);
    assert.equal(t.distanceBasis, 'ONE_WAY');
    assert.ok(t.vehicles.length >= 1);
    for (const v of t.vehicles) {
      for (const f of ['vehicleId', 'vehicleType', 'ratePerKm', 'unit', 'effectiveFrom', 'version', 'status', 'changedBy', 'changedAt', 'changeReason'])
        assert.ok(v[f] != null && v[f] !== '', `${v.vehicleType} missing ${f}`);
      assert.equal(v.isDemo, true);
    }
  });
});

function minimalLockedSnapshot() {
  // A locked snapshot with one costable line whose landed cost exists in the price master.
  const pm = JSON.parse(readFileSync('data/procurement-price-master.json', 'utf8'));
  const list = Array.isArray(pm.components) ? pm.components : Object.values(pm.components || pm.prices || {});
  const rec = list.find(r => r && r.landedUnitCost != null && r.componentId);
  return {
    snapshotId: 'SNAP-T', status: 'LOCKED',
    lines: rec ? [{ role: 'PANEL', componentId: rec.componentId, quantity: 1 }] : [],
    systemConfig: { size: '5sp', sizeKw: 5, systemType: 'ongrid' },
  };
}

describe('§16 transport — commercialFreeze freezes the rate the Cost Engine applied', () => {
  test('rate card path: snapshot.transportation carries rate versionId + source PROJECT_HEAD_RATE_CARD', () => {
    let card = createRateCard({ cardVersion: 'RC-TEST' });
    card = setRate(card, {
      rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'PICKUP',
      value: { vehicleType: 'PICKUP', ratePerKm: 42, unit: RATE_UNIT.PER_KM },
      versionId: 'PICKUP@2026-09-07', changedBy: 'ph-1', changedAt: AT, changeReason: 'test', effectiveFrom: AT,
    });
    const cost = calculateCost({
      snapshot: minimalLockedSnapshot(), config: costConfig, priceMaster: JSON.parse(readFileSync('data/procurement-price-master.json', 'utf8')),
      rateCard: card, project: { distanceKm: 30, vehicleType: 'PICKUP', sizeKw: 5, installationType: 'FLAT' },
    });
    const trace = cost.traces.find(t => t.head === 'TRANSPORTATION');
    assert.equal(trace.inputs.ratePerKm, 42);
    assert.equal(trace.version, 'PICKUP@2026-09-07');
    assert.equal(trace.source, 'PROJECT_HEAD_RATE_CARD');
    assert.equal(trace.amount, 30 * 42);

    const snap = buildCommercialSnapshot({
      bom: { systemConfig: {} }, project: { distanceKm: 30, vehicleType: 'PICKUP' },
      transportationConfig: costConfig.transportation, commercialSnapshot: { cost, pricing: {} },
      productionMode: false, issuedAt: AT,
    });
    assert.equal(snap.transportation.vehicleType, 'PICKUP');
    assert.equal(snap.transportation.distanceKm, 30);
    assert.equal(snap.transportation.ratePerKm, 42);
    assert.equal(snap.transportation.rateVersion, 'PICKUP@2026-09-07');
    assert.equal(snap.transportation.rateSource, 'PROJECT_HEAD_RATE_CARD');
    assert.equal(snap.transportation.distanceBasis, 'ONE_WAY');
    assert.equal(snap.transportation.amount, 1260, 'one-way × rate; never doubled');
  });

  test('cost-config fallback path: freeze records the vehicle version and source; production refuses it; rate-card path is accepted in production', () => {
    const cost = calculateCost({
      snapshot: minimalLockedSnapshot(), config: costConfig, priceMaster: JSON.parse(readFileSync('data/procurement-price-master.json', 'utf8')),
      rateCard: null, project: { distanceKm: 100, vehicleType: 'STANDARD', sizeKw: 5, installationType: 'FLAT' },
    });
    const trace = cost.traces.find(t => t.head === 'TRANSPORTATION');
    assert.equal(trace.amount, 100 * 35, 'locked 2.1: distance × rate, no free 100 km');
    const dev = buildCommercialSnapshot({
      bom: { systemConfig: {} }, project: { distanceKm: 100, vehicleType: 'STANDARD' },
      transportationConfig: costConfig.transportation, commercialSnapshot: { cost, pricing: {} },
      productionMode: false, issuedAt: AT,
    });
    assert.equal(dev.transportation.ratePerKm, 35);
    assert.equal(dev.transportation.rateVersion, 'VEH-STANDARD@2026-09-05');
    assert.notEqual(dev.transportation.rateSource, 'PROJECT_HEAD_RATE_CARD');

    const err = thrown(() => buildCommercialSnapshot({
      bom: { systemConfig: {} }, project: { distanceKm: 100, vehicleType: 'STANDARD' },
      transportationConfig: costConfig.transportation, commercialSnapshot: { cost, pricing: {} },
      productionMode: true, issuedAt: AT,
    }));
    assert.equal(err.code, 'DEMO_TRANSPORT_RATE_BLOCKED_IN_PRODUCTION');

    // Same project, rate published on the PH rate card → production accepts.
    let card = createRateCard({ cardVersion: 'RC-PROD' });
    card = setRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: 'STANDARD',
      value: { vehicleType: 'STANDARD', ratePerKm: 38, unit: RATE_UNIT.PER_KM },
      versionId: 'STANDARD@2026-09-07', changedBy: 'ph-1', changedAt: AT, changeReason: 'published', effectiveFrom: AT });
    const cost2 = calculateCost({
      snapshot: minimalLockedSnapshot(), config: costConfig, priceMaster: JSON.parse(readFileSync('data/procurement-price-master.json', 'utf8')),
      rateCard: card, project: { distanceKm: 100, vehicleType: 'STANDARD', sizeKw: 5, installationType: 'FLAT' },
    });
    const prod = buildCommercialSnapshot({
      bom: { systemConfig: {} }, project: { distanceKm: 100, vehicleType: 'STANDARD' },
      transportationConfig: costConfig.transportation, commercialSnapshot: { cost: cost2, pricing: {} },
      productionMode: true, issuedAt: AT,
    });
    assert.equal(prod.transportation.ratePerKm, 38);
    assert.equal(prod.transportation.rateSource, 'PROJECT_HEAD_RATE_CARD');
    assert.equal(prod.transportation.rateVersion, 'STANDARD@2026-09-07');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §18 validity policy — write surface
// ───────────────────────────────────────────────────────────────────────────
describe('§18 validity policy write surface', () => {
  const empty = () => ({ schema: 'flarize.quotation-policy/2', validity: { defaultDays: null, status: 'NOT_CONFIGURED' }, policies: [] });

  test('PH publishes September=30 / October=15; issue dates resolve the right window', () => {
    let s = publishPolicy(empty(), { actor: PH, policy: { policyId: 'SEP-2026', validityDays: 30, effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: '2026-10-01T00:00:00Z' }, at: AT });
    s = publishPolicy(s, { actor: PH, policy: { policyId: 'OCT-2026', validityDays: 15, effectiveFrom: '2026-10-01T00:00:00Z' }, at: AT });
    assert.equal(resolveEffectiveValidity(s, null, '2026-09-15T09:00:00Z').validityDays, 30);
    assert.equal(resolveEffectiveValidity(s, null, '2026-10-15T09:00:00Z').validityDays, 15);
    assert.equal(describePolicyStore(s, '2026-09-15T09:00:00Z').activeNow.policyId, 'SEP-2026');
    assert.equal(s.policies[0].createdBy, 'ph-1');
  });

  test('Sales cannot publish; duplicates refused; INACTIVE removes the window; default is a gap-filler', () => {
    let s = publishPolicy(empty(), { actor: ADMIN, policy: { policyId: 'P1', validityDays: 20, effectiveFrom: '2026-09-01T00:00:00Z' }, at: AT });
    assert.equal(thrown(() => publishPolicy(s, { actor: SALES, policy: { policyId: 'X', validityDays: 5, effectiveFrom: AT }, at: AT })).code, 'POLICY_EDITOR_FORBIDDEN');
    assert.equal(thrown(() => publishPolicy(s, { actor: PH, policy: { policyId: 'P1', validityDays: 9, effectiveFrom: AT }, at: AT })).code, 'POLICY_WINDOW_INVALID');
    s = setPolicyStatus(s, { actor: PH, policyId: 'P1', status: 'INACTIVE', at: AT });
    assert.equal(thrown(() => resolveEffectiveValidity(s, null, '2026-09-15T00:00:00Z')).code, 'POLICY_NOT_CONFIGURED');
    s = setDefaultValidityDays(s, { actor: ADMIN, defaultDays: 10, at: AT });
    assert.equal(resolveEffectiveValidity(s, null, '2026-09-15T00:00:00Z').source, 'ADMIN_DEFAULT');
    assert.equal(resolveEffectiveValidity(s, null, '2026-09-15T00:00:00Z').validityDays, 10);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §19 branding — write surface
// ───────────────────────────────────────────────────────────────────────────
describe('§19 branding write surface', () => {
  const bank = { bankName: 'HDFC Bank', accountName: 'Flarize Technologies Private Limited', accountNumber: '50200000000001', ifsc: 'HDFC0000001' };

  test('Admin publishes bank + upi accounts and signature/seal; freeze picks primary/current', () => {
    let s = publishBrandingVersion({}, { actor: ADMIN, kind: 'bank', accountId: 'ACC-HDFC', label: 'HDFC current', values: bank, at: AT });
    s = publishBrandingVersion(s, { actor: PH, kind: 'bank', accountId: 'ACC-SBI', label: 'SBI', values: { ...bank, bankName: 'SBI', ifsc: 'SBIN0000001' }, at: '2026-09-07T11:00:00.000Z' });
    s = publishBrandingVersion(s, { actor: ADMIN, kind: 'upi', accountId: 'UPI-MAIN', values: { upiId: 'flarize@hdfcbank' }, at: AT });
    s = publishBrandingVersion(s, { actor: ADMIN, kind: 'signature', values: { signatoryName: 'Authorised Signatory' }, at: AT });
    s = publishBrandingVersion(s, { actor: ADMIN, kind: 'seal', values: {}, at: AT });
    const d = describeBrandingStore(s);
    assert.equal(d.kinds.bank.accounts.length, 2);
    assert.equal(d.kinds.bank.primary, 'ACC-HDFC', 'first published account becomes primary');
    const f = freezeBrandingSnapshot(s);
    assert.equal(f.bank.accountId, 'ACC-HDFC');
    assert.equal(f.bank.values.bankName, 'HDFC Bank');
    assert.equal(f.upi.values.upiId, 'flarize@hdfcbank');
    assert.ok(f.signature.versionId && f.seal.versionId);
    assert.equal(f.bank.isDemo, false);

    // switch primary → new quotations pick SBI; the first version is untouched
    s = setPrimaryBrandingAccount(s, { actor: PH, kind: 'bank', accountId: 'ACC-SBI', at: AT });
    assert.equal(freezeBrandingSnapshot(s).bank.accountId, 'ACC-SBI');
    s = setBrandingAccountStatus(s, { actor: ADMIN, kind: 'bank', accountId: 'ACC-SBI', status: 'INACTIVE', at: AT });
    assert.equal(freezeBrandingSnapshot(s).bank.accountId, 'ACC-HDFC', 'inactive primary falls back to an ACTIVE account');
    assert.equal(Object.keys(s.bank.accounts).length, 2, 'accounts are never deleted');
  });

  test('Sales refused; versions immutable; required values enforced', () => {
    let s = publishBrandingVersion({}, { actor: ADMIN, kind: 'bank', accountId: 'A', values: bank, versionId: 'BK-A-1', at: AT });
    assert.equal(thrown(() => publishBrandingVersion(s, { actor: SALES, kind: 'bank', accountId: 'A', values: bank, at: AT })).code, 'BRANDING_EDITOR_FORBIDDEN');
    assert.equal(thrown(() => publishBrandingVersion(s, { actor: ADMIN, kind: 'bank', accountId: 'A', values: bank, versionId: 'BK-A-1', at: AT })).code, 'BRANDING_VERSION_NOT_FOUND');
    assert.equal(thrown(() => publishBrandingVersion(s, { actor: ADMIN, kind: 'bank', accountId: 'B', values: { bankName: 'X' }, at: AT })).code, 'BRANDING_VERSION_NOT_FOUND');
    assert.equal(s.bank.accounts.A.versions['BK-A-1'].values.ifsc, 'HDFC0000001');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §4/§7 project-level battery quantity applied to the materialised BOM
// ───────────────────────────────────────────────────────────────────────────
describe('§4/§7 project battery quantity (0/1/2) is applied by the orchestrator, never invented', () => {
  const env = {
    catalog,
    batteryMaster,
    packageRegistry: visibleForRuntime(hydrateRegistry(rawRegistry)),
    costConfig,
  };
  const PHW = { userId: 'ph-1', role: 'PROJECT_HEAD' };

  function projectWith(packageId, id) {
    const store = W.createWorkspaceStore();
    W.createProject(store, { actor: PHW, projectId: id, customer: { name: 'T', phone: '9' }, at: AT });
    const pkg = env.packageRegistry.packages.find(p => p.packageId === packageId);
    W.setProjectConfiguration(store, { actor: PHW, projectId: id, at: AT, sysType: 'hybrid', sizeKw: 5, phase: pkg.phase, tier: pkg.tier, architecture: 'HYBRID' });
    W.selectPackage(store, env, { actor: PHW, projectId: id, packageId, at: AT });
    return store;
  }
  const line = (store, id, role) => W.viewBom(store, env, { actor: PHW, projectId: id }).lines.find(l => l.role === role) || null;

  test('hybrid VALUE: qty 2 → BATTERY quantity 2; protection quantity untouched (D12-E is Engineering data)', () => {
    const store = projectWith('PKG-HYBRID-5-1P-VALUE', 'P-B2');
    const protBefore = line(store, 'P-B2', 'BATTERY_PROTECTION')?.quantity ?? null;
    const r = applyProjectBatteryQuantity(store, env, { wsActor: PHW, projectId: 'P-B2', input: { systemType: 'hybrid', batteryQuantity: 2 }, at: AT });
    assert.deepEqual(r, { batteryQuantity: 2 });
    assert.equal(line(store, 'P-B2', 'BATTERY').quantity, 2);
    assert.equal(line(store, 'P-B2', 'BATTERY').componentId, 'bt1', 'model comes from the approved package');
    assert.equal(line(store, 'P-B2', 'BATTERY_PROTECTION')?.quantity ?? null, protBefore, 'no one-per-battery assumption');
  });

  test('hybrid VALUE: qty 0 → battery, protection and battery cable removed with audit', () => {
    const store = projectWith('PKG-HYBRID-5-1P-VALUE', 'P-B0');
    applyProjectBatteryQuantity(store, env, { wsActor: PHW, projectId: 'P-B0', input: { systemType: 'hybrid', batteryQuantity: 0 }, at: AT });
    const view = W.viewBom(store, env, { actor: PHW, projectId: 'P-B0' });
    for (const role of ['BATTERY', 'BATTERY_PROTECTION', 'BATTERY_CABLE']) assert.equal(view.lines.find(l => l.role === role), undefined, `${role} still present`);
    assert.ok(view.removedRoles.includes('BATTERY'));
  });

  test('hybrid BASE (no battery on package): qty 1 → BATTERY_NOT_IN_PACKAGE, nothing substituted', () => {
    const store = projectWith('PKG-HYBRID-5-1P-BASE', 'P-BASE');
    const err = thrown(() => applyProjectBatteryQuantity(store, env, { wsActor: PHW, projectId: 'P-BASE', input: { systemType: 'hybrid', batteryQuantity: 1 }, at: AT }));
    assert.equal(err.code, ORCHESTRATION_ERROR.BATTERY_NOT_IN_PACKAGE);
    assert.equal(err.detail.owner, 'PROJECT_HEAD');
    assert.equal(line(store, 'P-BASE', 'BATTERY'), null);
  });

  test('non-hybrid or absent quantity → BOM untouched (existing callers preserved)', () => {
    const store = projectWith('PKG-HYBRID-5-1P-VALUE', 'P-N');
    assert.equal(applyProjectBatteryQuantity(store, env, { wsActor: PHW, projectId: 'P-N', input: { systemType: 'hybrid' }, at: AT }), null);
    assert.equal(applyProjectBatteryQuantity(store, env, { wsActor: PHW, projectId: 'P-N', input: { systemType: 'ongrid', batteryQuantity: 2 }, at: AT }), null);
    assert.equal(line(store, 'P-N', 'BATTERY').quantity, 1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §11 Sales controlled customization — server-side, validated, no positional default
// ───────────────────────────────────────────────────────────────────────────
describe('§11 resolveSalesSelections — Panel / Inverter / Structure only, validated against approved alternatives', () => {
  const approved = () => ({ panel: [{ id: 'p1' }, { id: 'p6' }], inverter: ['i4'], structure_material: [{ id: 'sm_25x15' }] });
  test('nested-by-tier (wizard shape) and flat shapes both normalise to checker roles', () => {
    const nested = resolveSalesSelections({ tierSelections: { base: { panel: 'p6', structure_material: 'sm_25x15' } } }, 'base', { approvedAlternativesFor: approved });
    assert.deepEqual(nested.map(s => [s.role, s.componentId]), [['PANEL', 'p6'], ['STRUCTURE', 'sm_25x15']]);
    const flat = resolveSalesSelections({ tierSelections: { inverter: 'i4' } }, 'value', { approvedAlternativesFor: approved });
    assert.deepEqual(flat.map(s => [s.role, s.componentId]), [['INVERTER', 'i4']]);
  });
  test('battery / DCDB / cables / any non-Sales category → SELECTION_NOT_PERMITTED (server rule, not UI hiding)', () => {
    for (const cat of ['battery', 'dcdb', 'acdb', 'dc_cable', 'mccb_box', 'earth_cable']) {
      const e = thrown(() => resolveSalesSelections({ tierSelections: { base: { [cat]: 'x' } } }, 'base'));
      assert.equal(e.code, ORCHESTRATION_ERROR.SELECTION_NOT_PERMITTED, cat);
    }
  });
  test('a componentId outside the approved alternatives → SELECTION_NOT_APPROVED', () => {
    const e = thrown(() => resolveSalesSelections({ tierSelections: { base: { panel: 'p3' } } }, 'base', { approvedAlternativesFor: approved }));
    assert.equal(e.code, ORCHESTRATION_ERROR.SELECTION_NOT_APPROVED);
    assert.deepEqual(e.detail.approved, ['p1', 'p6']);
  });
  test('SALES_CUSTOMIZABLE_CATEGORIES is exactly panel / inverter / structure_material', () => {
    assert.deepEqual(Object.keys(SALES_CUSTOMIZABLE_CATEGORIES).sort(), ['inverter', 'panel', 'structure_material']);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §17 subsidy inputs reach the draft; DCR resolved from the BOM, never assumed
// ───────────────────────────────────────────────────────────────────────────
describe('§17 subsidyDraftFields', () => {
  test('no subsidyType → historical NOT_QUOTED; residential/ghs → engine decides (treatment null on draft)', () => {
    assert.deepEqual(subsidyDraftFields({}), { subsidyTreatment: 'NOT_QUOTED' });
    assert.deepEqual(subsidyDraftFields({ subsidyType: 'none' }), { subsidyTreatment: 'NOT_QUOTED', subsidyType: 'none' });
    assert.deepEqual(subsidyDraftFields({ subsidyType: 'residential' }), { subsidyTreatment: null, subsidyType: 'residential' });
    assert.deepEqual(subsidyDraftFields({ subsidyType: 'ghs', ghsHouses: '12' }), { subsidyTreatment: null, subsidyType: 'ghs', ghsHouses: 12 });
    assert.equal(subsidyDraftFields({ subsidyType: 'residential', subsidyTreatment: 'NOT_QUOTED' }).subsidyTreatment, 'NOT_QUOTED', 'explicit treatment wins');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §6/§7 architecture — resolved from configured profile inverterType, never systemType
// ───────────────────────────────────────────────────────────────────────────
describe('resolvePackageArchitecture — DEYE | ENPHASE from package declaration or catalog profile', () => {
  test('explicit valid declaration wins', () => {
    assert.deepEqual(resolvePackageArchitecture({ architecture: 'ENPHASE', profileKey: 'ongrid_base' }, catalog), { architecture: 'ENPHASE', source: 'PACKAGE_DECLARED' });
  });
  test('legacy null architecture resolves from packageProfiles[profileKey].inverterType', () => {
    assert.deepEqual(resolvePackageArchitecture({ architecture: null, profileKey: 'ongrid_base' }, catalog), { architecture: 'DEYE', source: 'PROFILE_INVERTER_TYPE' });
    assert.deepEqual(resolvePackageArchitecture({ architecture: null, profileKey: 'hybrid_value' }, catalog), { architecture: 'DEYE', source: 'PROFILE_INVERTER_TYPE' });
    assert.deepEqual(resolvePackageArchitecture({ architecture: null, profileKey: 'premium' }, catalog), { architecture: 'ENPHASE', source: 'PROFILE_INVERTER_TYPE' });
    assert.deepEqual(resolvePackageArchitecture({ architecture: null, profileKey: 'hybrid_premium' }, catalog), { architecture: 'ENPHASE', source: 'PROFILE_INVERTER_TYPE' });
  });
  test('unknown profile → null (checker raises PBC-A-001; nothing is guessed)', () => {
    assert.deepEqual(resolvePackageArchitecture({ architecture: null, profileKey: 'nope' }, catalog), { architecture: null, source: null });
    assert.deepEqual(resolvePackageArchitecture({ architecture: null, profileKey: 'ongrid_base' }, null), { architecture: null, source: null });
  });
  test('every shipped package resolves to a valid architecture; Premium tiers are ENPHASE', () => {
    for (const p of rawRegistry.packages) {
      const r = resolvePackageArchitecture(p, catalog);
      assert.ok(['DEYE', 'ENPHASE'].includes(r.architecture), `${p.packageId} → ${r.architecture}`);
      if (p.tier === 'premium') assert.equal(r.architecture, 'ENPHASE', p.packageId);
      else assert.equal(r.architecture, 'DEYE', p.packageId);
    }
  });
  test('runPackageChecker runs on a legacy package (lines passed explicitly) and records architecture + source', () => {
    const reg = JSON.parse(JSON.stringify(rawRegistry));
    const r = runPackageChecker(reg, { catalog, batteryMaster }, { actor: PH, packageId: 'PKG-ONGRID-5sp-1P-PREMIUM', at: AT });
    assert.equal(r.architecture, 'ENPHASE');
    assert.equal(r.architectureSource, 'PROFILE_INVERTER_TYPE');
    assert.ok(['VALID', 'WARNING', 'BLOCKED'].includes(r.status));
    // Enphase premium blocks on the missing approved micro-inverter / IQ controller lines — DATA BLOCKER, not PBC-A-002 mixing
    assert.ok(!r.findings.some(f => f.ruleId === 'PBC-A-002'), 'no architecture-mixing error once architecture is ENPHASE');
    assert.ok(r.findings.some(f => f.ruleId === 'PBC-K-001' && /MICRO_INVERTER/.test(f.message)), 'missing MICRO_INVERTER is reported as the real blocker');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §10/§22 Sales projection of ISSUED documents — internal cost/margin absent
// ───────────────────────────────────────────────────────────────────────────
describe('projectIssuedPayloadForActor / projectIssuedSnapshotForActor', () => {
  const payload = { pricing: { available: true, customer: { customerTotalIncludingGST: 100 }, internal: { grossProfit: 1 } }, versions: { catalogVersion: 'c', landedCostVersion: 'l', marginVersion: 'm', procurementPriceVersion: 'p' }, versionKeys: ['catalogVersion', 'landedCostVersion', 'marginVersion'], alternatives: [{ tier: 'value', payload: { pricing: { internal: { grossProfit: 2 } } } }] };
  const snapshot = { schemaVersion: 's', frozenAt: AT, commercial: { totalActualProjectCost: 1 }, procurement: {}, transportation: { ratePerKm: 45 }, engineering: {}, battery: {}, package: {}, subsidy: { totalSubsidy: 78000 }, validity: { validityDays: 30 }, branding: {}, rendererPin: { rendererVersion: 'v1' } };
  test('Sales: internal withheld on primary AND alternatives; internal version labels dropped; payload otherwise intact', () => {
    const out = projectIssuedPayloadForActor(payload, SALES);
    assert.equal(out.pricing.internal, null);
    assert.equal(out.pricing.internalWithheld, true);
    assert.equal(out.pricing.customer.customerTotalIncludingGST, 100);
    assert.deepEqual(Object.keys(out.versions), ['catalogVersion']);
    assert.deepEqual(out.versionKeys, ['catalogVersion']);
    assert.equal(out.alternatives[0].payload.pricing.internal, null);
    assert.ok(!/grossProfit|landedCostVersion|marginVersion/.test(JSON.stringify(out)));
  });
  test('Admin / PH (COST_VIEW): payload returned unchanged', () => {
    assert.equal(projectIssuedPayloadForActor(payload, ADMIN), payload);
    assert.equal(projectIssuedPayloadForActor(payload, PH), payload);
  });
  test('Sales snapshot projection keeps validity / subsidy / branding / rendererPin only', () => {
    const out = projectIssuedSnapshotForActor(snapshot, SALES);
    assert.deepEqual(Object.keys(out).sort(), ['branding', 'frozenAt', 'internalDomainsWithheld', 'rendererPin', 'schemaVersion', 'subsidy', 'validity']);
    assert.equal(projectIssuedSnapshotForActor(snapshot, ADMIN), snapshot);
  });
});

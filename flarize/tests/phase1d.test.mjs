// Phase 1D — battery selection + engineering compatibility model.
// The 16 named tests from the Phase 1D brief, §14.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ENGINEERING_STATUS, PROCUREMENT_STATUS, BATTERY_FIELDS,
  REQUIRED_FOR_SAFE_ISSUE, toBatteryMaster, allBatteries,
  isSelectable, isPermanentlyUnselectable, selectabilityReason,
} from '../src/lib/batteryMaster.js';
import {
  RESULT, checkBatteryCompatibility, resolveProtectionRequirement,
} from '../src/lib/batteryCompatibility.js';
import {
  resolveBattery, approvedBatteryShortlist, BATTERY_PROTECTION_MODE,
} from '../src/lib/resolveBattery.js';
import {
  SELECTION_METHOD, SALES_IMMUTABLE_ROLES, createProjectConfiguration,
  applyProjectOverride, resolveSelection, canRoleBeChangedBy, assertCanChange,
} from '../src/lib/projectConfiguration.js';
import {
  SNAPSHOT_STATUS, createProjectBomSnapshot, applyProcurementPriceChange,
  priceForNewQuotation, diffSnapshotAgainstCurrentPrices,
} from '../src/lib/bomSnapshot.js';
import {
  canWriteField, validateFieldWrite, affectsEngineeringSelection,
  classifyProcurementChange,
} from '../src/lib/procurementBoundary.js';

const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const MASTER = JSON.parse(readFileSync('data/battery-master.json', 'utf8')).batteries;
const P = catalog.packageProfiles;
const item = (id) => catalog.categories.battery.items.find(b => b.id === id);
const rec = (id) => toBatteryMaster(item(id), MASTER[id] || {});

// A throwaway catalog clone so a test never mutates the real one.
const clone = () => JSON.parse(JSON.stringify(catalog));

// ---------------------------------------------------------------- 1
test('1 — Procurement adds a battery; it is NOT immediately selectable', () => {
  const c = clone();
  const added = { id: 'bt_new', name: 'Some New 100Ah', brand: 'Unknown',
                  price: 70000, tiers: ['value'], status: 'ACTIVE' };
  c.categories.battery.items.push(added);
  // no master record => engineeringStatus defaults to PENDING_ENGINEERING_APPROVAL
  const r = toBatteryMaster(added, {});
  assert.equal(r.engineeringStatus, ENGINEERING_STATUS.PENDING_ENGINEERING_APPROVAL);
  assert.equal(isSelectable(r), false);
  assert.match(selectabilityReason(r), /not selectable until Engineering approves/);

  const { selectable } = approvedBatteryShortlist(c, MASTER, { tier: 'value' });
  assert.equal(selectable.some(b => b.componentId === 'bt_new'), false,
    'a Procurement addition must not appear in the Project Head shortlist');
});

// ---------------------------------------------------------------- 2
test('2 — Engineering approves the battery; it becomes selectable', () => {
  const c = clone();
  const added = { id: 'bt_new', name: 'Some New 100Ah', brand: 'Unknown',
                  price: 70000, tiers: ['value'], status: 'ACTIVE' };
  c.categories.battery.items.push(added);
  const master = { ...MASTER, bt_new: {
    engineeringStatus: ENGINEERING_STATUS.APPROVED,
    procurementStatus: PROCUREMENT_STATUS.ACTIVE,
    integratedProtection: false, externalProtectionRequired: true, protectionRating: null,
  } };
  assert.equal(isSelectable(toBatteryMaster(added, master.bt_new)), true);
  const { selectable } = approvedBatteryShortlist(c, master, { tier: 'value' });
  assert.ok(selectable.some(b => b.componentId === 'bt_new'));
});

// ---------------------------------------------------------------- 3
test('3 — Project Head selects an approved battery; the BOM identity changes', () => {
  const c = clone();
  // make bt3 approved so it is a legitimate Project Head choice
  const master = { ...MASTER, bt3: { ...MASTER.bt3,
    engineeringStatus: ENGINEERING_STATUS.APPROVED,
    integratedProtection: false, externalProtectionRequired: true } };
  c.categories.battery.items.find(b => b.id === 'bt3').tiers = ['base', 'value'];

  const def = resolveBattery(P.hybrid_value, c, { sysType: 'hybrid', tier: 'value', batteryMaster: master });
  const ovr = resolveBattery(P.hybrid_value, c, { sysType: 'hybrid', tier: 'value', batteryMaster: master,
    projectOverride: { componentId: 'bt3', selectedBy: 'ph@flarize', at: '2026-08-15T00:00:00Z' } });

  assert.notEqual(def.componentId, 'bt3');
  assert.equal(ovr.componentId, 'bt3');
  assert.equal(ovr.selectionMethod, SELECTION_METHOD.PROJECT_HEAD_OVERRIDE);
  assert.equal(ovr.selectedBy, 'ph@flarize');
  assert.notEqual(ovr.spec.unitPrice, def.spec.unitPrice, 'a different battery must move the BOM price');
});

// ---------------------------------------------------------------- 4
test('4 — Project Head selects an INCOMPATIBLE battery -> BLOCKED, never substituted', () => {
  // Enphase battery on a Deye/SEG architecture.
  const r = checkBatteryCompatibility(rec('bt2'), {
    sysType: 'hybrid', quantity: 1, architecture: 'DEYE',
  });
  assert.equal(r.status, 'BLOCKED');
  assert.ok(r.reasons.some(x => /BC-J/.test(x)));

  // and the resolver does not silently swap it for another battery
  const c = clone();
  const out = resolveBattery(P.hybrid_value, c, {
    sysType: 'hybrid', tier: 'value', batteryMaster: MASTER,
    projectOverride: { componentId: 'ba_3b51aef23f0b' },   // REJECTED / INACTIVE
  });
  assert.equal(out.componentId, 'ba_3b51aef23f0b', 'identity is preserved so the block can name it');
  assert.equal(out.source, 'projectOverride(blocked)');
  assert.ok(out.issues.some(i => i.code === 'BATTERY_OVERRIDE_NOT_SELECTABLE'));
  assert.equal(out.issues.some(i => /substitut/i.test(i.message)), true);
});

// ---------------------------------------------------------------- 5
test('5 — unknown protection: BLOCKED because protection is required to issue safely', () => {
  const r = checkBatteryCompatibility(rec('bt3'), { sysType: 'hybrid', quantity: 1 });
  assert.equal(rec('bt3').integratedProtection, null);
  assert.equal(r.status, 'BLOCKED');
  assert.ok(r.reasons.some(x => /Cannot safely validate/.test(x)));
  assert.deepEqual(REQUIRED_FOR_SAFE_ISSUE, ['integratedProtection']);

  // a battery whose protection IS known but whose non-safety data is missing
  // degrades to WARNING, not BLOCKED
  const partial = toBatteryMaster(item('bt1'), MASTER.bt1);
  assert.equal(partial.integratedProtection, false);
  const r2 = checkBatteryCompatibility({ ...partial, protectionRating: '160A' },
    { sysType: 'hybrid', quantity: 1 });
  assert.equal(r2.status, 'WARNING');
  assert.match(r2.reasons[0], /Engineering data incomplete/);
});

// ---------------------------------------------------------------- 6
test('6 — changing the battery changes the protection requirement', () => {
  const seg = resolveProtectionRequirement(rec('bt1'));
  const enp = resolveProtectionRequirement(rec('bt2'));
  assert.equal(seg.mode, BATTERY_PROTECTION_MODE.EXTERNAL_REQUIRED);
  assert.equal(seg.externalDeviceRequired, true);
  assert.equal(enp.mode, BATTERY_PROTECTION_MODE.INTEGRATED);
  assert.equal(enp.externalDeviceRequired, false);

  // and no rating is ever assumed
  assert.equal(seg.rating, null);
  assert.match(seg.reason, /must not be assumed/);

  const a = resolveBattery(P.hybrid_value, catalog, { sysType: 'hybrid', tier: 'value', batteryMaster: MASTER });
  const b = resolveBattery(P.hybrid_premium, catalog, { sysType: 'hybrid', tier: 'premium', batteryMaster: MASTER });
  assert.equal(a.requiresMccb, true);
  assert.equal(b.requiresMccb, false);
});

// ---------------------------------------------------------------- 7
test('7 — changing the battery changes the battery-cable requirement', () => {
  const a = resolveBattery(P.hybrid_value, catalog, { sysType: 'hybrid', tier: 'value', batteryMaster: MASTER });
  const b = resolveBattery(P.hybrid_premium, catalog, { sysType: 'hybrid', tier: 'premium', batteryMaster: MASTER });
  assert.equal(a.requiresCable, true, 'external-protection topology carries the generic DC cable');
  assert.equal(b.requiresCable, false, 'INTEGRATED topology must NOT carry the generic 25mm DC cable');
});

// ---------------------------------------------------------------- 8
test('8 — changing the battery changes cost', () => {
  const c = clone();
  const master = { ...MASTER, bt4: { ...MASTER.bt4,
    engineeringStatus: ENGINEERING_STATUS.APPROVED,
    integratedProtection: false, externalProtectionRequired: true } };
  c.categories.battery.items.find(b => b.id === 'bt4').tiers = ['base', 'value'];
  const base = resolveBattery(P.hybrid_value, c, { sysType: 'hybrid', tier: 'value', batteryMaster: master });
  const ovr = resolveBattery(P.hybrid_value, c, { sysType: 'hybrid', tier: 'value', batteryMaster: master,
    projectOverride: { componentId: 'bt4' } });
  assert.equal(base.spec.unitPrice, item('bt1').price);
  assert.equal(ovr.spec.unitPrice, item('bt4').price);
  assert.notEqual(base.spec.unitPrice * base.quantity, ovr.spec.unitPrice * ovr.quantity);
});

// ---------------------------------------------------------------- 9
test('9 — a project override does NOT modify the global package', () => {
  const pkgDefaults = { BATTERY: 'bt1', INVERTER: 'inv1' };
  const cfg = createProjectConfiguration({ projectId: 'PRJ-A', packageId: 'hybrid_value', packageDefaults: pkgDefaults });
  const after = applyProjectOverride(cfg, { role: 'BATTERY', componentId: 'bt3', selectedBy: 'ph@flarize' });

  assert.equal(resolveSelection(after, 'BATTERY').componentId, 'bt3');
  assert.equal(resolveSelection(after, 'BATTERY').source, 'PROJECT');
  // package untouched, in this config and in a fresh one
  assert.equal(after.packageDefaults.BATTERY, 'bt1');
  assert.equal(cfg.packageDefaults.BATTERY, 'bt1');
  const projB = createProjectConfiguration({ projectId: 'PRJ-B', packageId: 'hybrid_value', packageDefaults: pkgDefaults });
  assert.equal(resolveSelection(projB, 'BATTERY').componentId, 'bt1');
  assert.equal(resolveSelection(projB, 'BATTERY').selectionMethod, SELECTION_METHOD.PACKAGE_DEFAULT);
  assert.equal(pkgDefaults.BATTERY, 'bt1');
});

// ---------------------------------------------------------------- 10
test('10 — a Procurement price update changes the cost of a NEW quotation', () => {
  const lines = [{ componentId: 'bt1', unitPurchaseCost: 86717 }];
  const repriced = priceForNewQuotation(lines, { bt1: 90000 });
  assert.equal(repriced[0].unitPurchaseCost, 90000);
  const cls = classifyProcurementChange({ purchasePrice: 90000 });
  assert.equal(cls.changesCost, true);
  assert.equal(cls.changesEngineeringSelection, false);
});

// ---------------------------------------------------------------- 11
test('11 — a Procurement price update does NOT change a locked project BOM', () => {
  const snap = createProjectBomSnapshot({
    projectId: 'PRJ-A', lockedBy: 'ph@flarize', lockedAt: '2026-08-01T00:00:00Z',
    dataVersion: 'catalog@2026-08-01',
    bomLines: [{ componentId: 'bt1', role: 'BATTERY', qty: 1, unitPurchaseCost: 86717 }],
  });
  assert.equal(snap.status, SNAPSHOT_STATUS.LOCKED);
  const after = applyProcurementPriceChange(snap, { bt1: 90000 });
  assert.equal(after.lines[0].unitPurchaseCost, 86717);
  assert.equal(after, snap, 'a locked snapshot is returned unchanged, not rebuilt');
  assert.throws(() => { after.lines[0].unitPurchaseCost = 1; }, TypeError);
  // the difference is still reportable without mutating anything
  const d = diffSnapshotAgainstCurrentPrices(snap, { bt1: 90000 });
  assert.equal(d[0].delta, 3283);
  assert.equal(classifyProcurementChange({ purchasePrice: 90000 }).rewritesLockedProjectBoms, false);
});

// ---------------------------------------------------------------- 12
test('12 — Sales cannot modify the battery selection', () => {
  assert.ok(SALES_IMMUTABLE_ROLES.includes('BATTERY'));
  assert.equal(canRoleBeChangedBy('BATTERY', 'SALES'), false);
  assert.equal(canRoleBeChangedBy('BATTERY', 'PROJECT_HEAD'), true);
  assert.throws(() => assertCanChange('BATTERY', 'SALES'), /may not change role BATTERY/);
  // Sales also cannot write engineering fields
  assert.equal(canWriteField('SALES', 'integratedProtection'), false);
});

// ---------------------------------------------------------------- 13
test('13 — Premium cannot select a Deye/SEG battery', () => {
  const r = checkBatteryCompatibility(rec('bt1'), {
    sysType: 'hybrid', quantity: 1, architecture: 'ENPHASE',
  });
  assert.equal(r.status, 'BLOCKED');
  assert.ok(r.reasons.some(x => /only an Enphase battery/.test(x)));
  // and the premium tier does not even offer it
  const { selectable } = approvedBatteryShortlist(catalog, MASTER, { tier: 'premium' });
  assert.deepEqual(selectable.map(b => b.componentId), ['bt2']);
});

// ---------------------------------------------------------------- 14
test('14 — Premium does not inherit the generic mb1 MCCB', () => {
  const b = resolveBattery(P.hybrid_premium, catalog, { sysType: 'hybrid', tier: 'premium', batteryMaster: MASTER });
  assert.equal(b.componentId, 'bt2');
  assert.equal(b.protection.mode, BATTERY_PROTECTION_MODE.INTEGRATED);
  assert.equal(b.requiresMccb, false);
  assert.equal(b.requiresCable, false);
  assert.equal(b.protection.providedBy, 'ENERGY_SYSTEM_CONTROLLER');
});

// ---------------------------------------------------------------- 15
test('15 — Deye Hybrid can select from MULTIPLE approved compatible batteries', () => {
  const c = clone();
  const master = { ...MASTER,
    bt3: { ...MASTER.bt3, engineeringStatus: ENGINEERING_STATUS.APPROVED,
           integratedProtection: false, externalProtectionRequired: true },
    bt4: { ...MASTER.bt4, engineeringStatus: ENGINEERING_STATUS.APPROVED,
           integratedProtection: false, externalProtectionRequired: true } };
  const { selectable } = approvedBatteryShortlist(c, master, { tier: 'base' });
  // bt1 is PENDING after the Phase 1D review correction, so the APPROVED
  // shortlist is bt3 + bt4 — still multiple, still no hardcoded SEG.
  assert.deepEqual(selectable.map(b => b.componentId).sort(), ['bt3', 'bt4']);
  for (const id of ['bt3', 'bt4']) {
    const out = resolveBattery(P.hybrid_bat, c, { sysType: 'hybrid', tier: 'base',
      batteryMaster: master, projectOverride: { componentId: id } });
    assert.equal(out.componentId, id);
    assert.equal(out.source, 'projectOverride');
  }
});

// ---------------------------------------------------------------- 16
test('16 — an existing project retains its selected battery after catalog changes', () => {
  const snap = createProjectBomSnapshot({
    projectId: 'PRJ-A', lockedBy: 'ph@flarize', lockedAt: '2026-08-01T00:00:00Z',
    bomLines: [{ componentId: 'bt3', role: 'BATTERY', qty: 1, unitPurchaseCost: 78000 }],
    selections: { BATTERY: { selectionMethod: SELECTION_METHOD.PROJECT_HEAD_OVERRIDE, selectedBy: 'ph@flarize', at: '2026-08-01T00:00:00Z' } },
  });
  // Procurement later discontinues bt3 and raises every price
  const cls = classifyProcurementChange({ procurementStatus: 'DISCONTINUED' });
  assert.equal(cls.changesFutureAvailability, true);
  assert.equal(cls.rewritesLockedProjectBoms, false);
  const after = applyProcurementPriceChange(snap, { bt3: 99999 });
  assert.equal(after.lines[0].componentId, 'bt3');
  assert.equal(after.lines[0].unitPurchaseCost, 78000);
  assert.equal(after.lines[0].selectionMethod, SELECTION_METHOD.PROJECT_HEAD_OVERRIDE);
});

// ---------------------------------------------- supporting invariants ------
test('master data fabricates nothing — every unrecorded field is null', () => {
  for (const b of allBatteries(catalog, MASTER)) {
    for (const f of BATTERY_FIELDS) assert.notEqual(b[f], undefined, `${b.componentId}.${f}`);
    // no rating is ever invented
    if (b.protectionRating != null) assert.ok(MASTER[b.componentId]?.protectionRating != null);
  }
  assert.equal(rec('bt1').protectionRating, null, 'bt1 must NOT be bound to mb1 160A');
});

test('no battery record is deleted from the catalog', () => {
  const ids = catalog.categories.battery.items.map(i => i.id);
  for (const id of ['bt1', 'bt2', 'bt3', 'bt4', 'ba_3b51aef23f0b']) assert.ok(ids.includes(id));
});

test('procurement/engineering field ownership is enforced both ways', () => {
  assert.equal(validateFieldWrite('PROCUREMENT', { purchasePrice: 1 }).allowed, true);
  const bad = validateFieldWrite('PROCUREMENT', { nominalVoltage: 51.2 });
  assert.equal(bad.allowed, false);
  assert.deepEqual(bad.rejected, ['nominalVoltage']);
  assert.equal(validateFieldWrite('PROJECT_HEAD', { purchasePrice: 1 }).allowed, false);
  assert.equal(affectsEngineeringSelection({ purchasePrice: 1 }).affects, false);
  assert.equal(affectsEngineeringSelection({ compatibleInverters: [] }).affects, true);
});

test('legacy callers without master data keep their previous behaviour', () => {
  const legacy = resolveBattery(P.hybrid_value, catalog, { sysType: 'hybrid', tier: 'value' });
  assert.equal(legacy.componentId, 'bt1');
  assert.equal(legacy.protection.mode, BATTERY_PROTECTION_MODE.UNKNOWN);
  assert.equal(legacy.requiresMccb, true);
});

test('baseline neutrality — master data does not move the resolved identity', () => {
  for (const [key, tier] of [['hybrid_base', 'base'], ['hybrid_value', 'value'], ['hybrid_premium', 'premium']]) {
    const legacy = resolveBattery(P[key], catalog, { sysType: 'hybrid', tier });
    const now = resolveBattery(P[key], catalog, { sysType: 'hybrid', tier, batteryMaster: MASTER });
    assert.equal(now.componentId, legacy.componentId, key);
    assert.equal(now.quantity, legacy.quantity, key);
    assert.equal(now.requiresMccb, legacy.requiresMccb, key);
    assert.equal(now.requiresCable, legacy.requiresCable, key);
  }
});

// ============================================================================
// PHASE 1D REVIEW CORRECTION — C50 / C51
// ============================================================================

test('C50 — bt1 is PENDING_ENGINEERING_APPROVAL, and APPROVED is not implied', () => {
  assert.equal(rec('bt1').engineeringStatus, ENGINEERING_STATUS.PENDING_ENGINEERING_APPROVAL);
  assert.equal(isSelectable(rec('bt1')), false);
  // the standing engineering decision is unchanged
  assert.equal(rec('bt1').externalProtectionRequired, true);
  // and no rating was invented to make it pass
  assert.equal(rec('bt1').protectionRating, null);
  assert.equal(MASTER.bt1.openItems.length, 7);
  // history retained, not overwritten
  assert.equal(MASTER.bt1.statusHistory[0].status, ENGINEERING_STATUS.APPROVED);
});

test('C50 — hybrid Value resolves bt1, is BLOCKED, and is NOT emptied', () => {
  const b = resolveBattery(P.hybrid_value, catalog, { sysType: 'hybrid', tier: 'value', batteryMaster: MASTER });
  assert.equal(b.componentId, 'bt1', 'the battery must NOT be removed from the package');
  assert.equal(b.quantity, 1);
  assert.equal(b.engineeringApproved, false);
  assert.equal(b.approvalStatus, ENGINEERING_STATUS.PENDING_ENGINEERING_APPROVAL);
  assert.ok(b.issues.some(i => i.code === 'BATTERY_NOT_ENGINEERING_APPROVED'));
  assert.ok(b.issues.some(i => i.code === 'BATTERY_PROTECTION_RATING_UNRECORDED'));
  // no compensating BOM change: protection still required, no rating asserted
  assert.equal(b.requiresMccb, true);
  assert.equal(b.protection.rating, null);
});

test('C51 — a PENDING battery is retained; only permanent states are removed', () => {
  assert.equal(isPermanentlyUnselectable(rec('bt1')), false, 'PENDING must stay resolvable');
  assert.equal(isPermanentlyUnselectable(rec('bt3')), false);
  assert.equal(isPermanentlyUnselectable(rec('ba_3b51aef23f0b')), true, 'REJECTED/INACTIVE is removed');
});

test('C51 — approval never reorders identity', () => {
  const c = clone();
  c.categories.battery.items.find(b => b.id === 'bt3').tiers = ['base', 'value'];
  const approvedElsewhere = { ...MASTER, bt3: { ...MASTER.bt3,
    engineeringStatus: ENGINEERING_STATUS.APPROVED,
    integratedProtection: false, externalProtectionRequired: true } };
  const b = resolveBattery(P.hybrid_value, c, { sysType: 'hybrid', tier: 'value', batteryMaster: approvedElsewhere });
  assert.equal(b.componentId, 'bt1',
    'approving bt3 must NOT silently move the package off bt1 — that is a substitution');
});

test('C52 — premium Enphase is unaffected by the correction', () => {
  const b = resolveBattery(P.hybrid_premium, catalog, { sysType: 'hybrid', tier: 'premium', batteryMaster: MASTER });
  assert.equal(b.componentId, 'bt2');
  assert.equal(b.engineeringApproved, true);
  assert.equal(b.requiresMccb, false);
  assert.equal(b.issues.some(i => i.code === 'BATTERY_NOT_ENGINEERING_APPROVED'), false);
});

test('C52 — on-grid carries no battery and no battery finding', () => {
  for (const key of ['ongrid_base', 'ongrid_value']) {
    const b = resolveBattery(P[key], catalog, { sysType: 'ongrid', tier: key.split('_')[1], batteryMaster: MASTER });
    assert.equal(b.required, false);
    assert.equal(b.engineeringApproved, true, 'no battery -> no approval gate');
    assert.equal(b.issues.length, 0);
  }
});

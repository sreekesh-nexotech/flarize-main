// PHASE 2 CLOSURE AUDIT — regression locks on the remaining Phase-2 blockers.
//
// These tests assert that the blockers are STILL BLOCKED and that nothing has
// been silently filled in. They are guards, not features: each one fails the day
// someone supplies data (which is the signal to re-audit) or invents it (which
// is the signal to stop).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { APPROVED_UPGRADE_PATHS } from '../src/lib/upgradeModel.js';
import { toBatteryMaster, ENGINEERING_STATUS, isSelectable } from '../src/lib/batteryMaster.js';
import { checkProjectBom } from '../src/lib/engineeringChecker.js';
import { createProjectBom } from '../src/lib/projectBom.js';
import { ROLES } from '../src/lib/bomRoles.js';

const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const MASTER = JSON.parse(readFileSync('data/battery-master.json', 'utf8')).batteries;
const REGISTRY = JSON.parse(readFileSync('data/packages.proposed.json', 'utf8'));
const AT = '2026-08-16T00:00:00Z';

// ============================================================ C10 upgrade paths
test('C10 — the six approved paths are exactly the approved set', () => {
  assert.deepEqual(
    APPROVED_UPGRADE_PATHS.map(p => `${p.fromKw}_${p.toKw}`).sort(),
    ['3_5', '3_6', '3_8', '5_10', '5_8', '8_10']);
});

test('C10 — 3→6 and 3→8 STILL have no explicit engineering BOM', () => {
  const defined = new Set();
  for (const fi of catalog.bomTemplates.upgrade.fixedItems || [])
    if (fi.qty) Object.keys(fi.qty).forEach(k => defined.add(k));

  // The catalog defines only four paths. This is the blocker.
  assert.deepEqual([...defined].sort(), ['3_5', '5_10', '5_8', '8_10']);
  assert.equal(defined.has('3_6'), false, '3→6 has no explicit definition');
  assert.equal(defined.has('3_8'), false, '3→8 has no explicit definition');

  // and the model says so honestly rather than pretending
  const byId = Object.fromEntries(APPROVED_UPGRADE_PATHS.map(p => [p.id, p]));
  assert.equal(byId['UPG-3-6'].explicitBom, false);
  assert.equal(byId['UPG-3-8'].explicitBom, false);
  for (const id of ['UPG-3-5', 'UPG-5-8', 'UPG-5-10', 'UPG-8-10'])
    assert.equal(byId[id].explicitBom, true, id);
});

test('C10 — an approved path without an explicit BOM is reported, never silently priced', () => {
  const bom = createProjectBom({ projectId: 'PRJ-U', packageId: 'upgrade', architecture: 'DEYE',
    sysType: 'ongrid', sizeKw: 3, phase: '1P', lines: [
      { role: ROLES.PANEL, componentId: 'p1', quantity: 6 },
      { role: ROLES.STRUCTURE, componentId: 'sm_15x15', quantity: 10 },
      { role: ROLES.AC_ISOLATOR, componentId: 'is1', quantity: 1 },
      { role: ROLES.INVERTER, componentId: catalog.categories.inverter.items[0].id, quantity: 1 }] });

  for (const [from, to] of [[3, 6], [3, 8]]) {
    const r = checkProjectBom({ bom, catalog, batteryMaster: MASTER, at: AT,
      upgrade: { fromKw: from, toKw: to } });
    const f = r.findings.find(x => x.ruleId === 'PBC-R-002');
    assert.ok(f, `${from}->${to} must be flagged as auto-scaled`);
    assert.match(f.reason, /auto-scaled/);
  }
  // a pair that was never approved is BLOCKED, not extrapolated
  const bad = checkProjectBom({ bom, catalog, batteryMaster: MASTER, at: AT,
    upgrade: { fromKw: 6, toKw: 15 } });
  const blocker = bad.findings.find(x => x.ruleId === 'PBC-R-001');
  assert.ok(blocker);
  assert.equal(blocker.severity, 'BLOCKED');
});

test('C10 — the legacy auto-scale heuristic is still present and still unfixed', () => {
  // Documented so the blocker cannot be quietly forgotten. When Engineering
  // supplies 3_6 and 3_8 this assertion is the reminder to remove the heuristic.
  const app = readFileSync('src/App.jsx', 'utf8');
  assert.ok(app.includes("const knownPaths = { '3_5': 4, '5_8': 5, '5_10': 9, '8_10': 4 }"),
    'the auto-scale reference table still exists in the engine');
  assert.ok(app.includes('refQty * newPanels / refPanels'),
    'upgrade quantities are still extrapolated for undefined paths');
});

// ============================================================ C11 3 kW / 3-phase
test('C11 — the 3 kW three-phase rule is STILL unconfirmed', () => {
  // on-grid offers 3 kW, and the three-phase list does not include it, but no
  // engineering decision has stated whether that combination is forbidden or
  // merely absent. Nothing here asserts a rule, because none exists.
  assert.ok(Object.keys(catalog.bomTemplates.ongrid.sizes).includes('3'));
  assert.equal(catalog.bomTemplates.ongrid.threePhase.includes('3'), false);
  // no supported-combination rule exists anywhere in the domain modules
  const files = ['src/lib/engineeringChecker.js', 'src/lib/projectBom.js', 'src/lib/upgradeModel.js'];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.equal(/threePhaseUnsupportedSizes|SIZE_PHASE_UNSUPPORTED|hide3kW/i.test(src), false,
      `${f} must not contain an invented size/phase rule`);
  }
});

test('C11 — the silent size coercion is still present and still a blocker', () => {
  // `switchSysType` rewrites 6 kW -> 3 kW with no warning when moving to hybrid,
  // because bomTemplates.hybrid has no "6". C11 forbids silent coercion, but the
  // replacement behaviour (block? hide? warn?) is part of the unconfirmed rule,
  // so it is NOT invented here. This test records the defect precisely.
  const app = readFileSync('src/App.jsx', 'utf8');
  assert.ok(app.includes("if (size === '6') setSize('3');"),
    'the 6 kW -> 3 kW silent rewrite is still in switchSysType');
  assert.equal(Object.keys(catalog.bomTemplates.hybrid.sizes).includes('6'), false,
    'hybrid has no 6 kW size, which is why the coercion exists');
});

// ================================================= battery data (Phase-2 impact)
test('battery — bt1 is still PENDING and still blocks the hybrid Value packages', () => {
  const rec = (id) => toBatteryMaster(catalog.categories.battery.items.find(b => b.id === id), MASTER[id] || {});
  assert.equal(rec('bt1').engineeringStatus, ENGINEERING_STATUS.PENDING_ENGINEERING_APPROVAL);
  assert.equal(rec('bt1').protectionRating, null, 'no rating invented');
  assert.equal(isSelectable(rec('bt1')), false);
  for (const id of ['bt3', 'bt4']) {
    assert.equal(rec(id).engineeringStatus, ENGINEERING_STATUS.PENDING_ENGINEERING_APPROVAL, id);
    assert.equal(rec(id).integratedProtection, null, id);
  }
  // and the electrical data that would clear them is still absent
  for (const id of ['bt1', 'bt2', 'bt3', 'bt4'])
    for (const f of ['capacityKwh', 'nominalVoltage', 'maximumDischargeCurrent',
                     'compatibleInverters', 'communicationProtocol'])
      assert.equal(rec(id)[f], null, `${id}.${f} must not be invented`);
});

test('battery — inverter electrical limits for battery checks are still unrecorded', () => {
  const inv = catalog.categories.inverter.items.filter(i => i.type === 'hybrid');
  assert.ok(inv.length > 0);
  for (const i of inv.slice(0, 5))
    for (const f of ['batteryVoltageMin', 'batteryVoltageMax', 'maxBatteryCurrent', 'communicationProtocols'])
      assert.equal(i[f], undefined, `${i.id}.${f} must not be invented`);
});

// ============================================== package authority / engineering gate
test('D11 / D12 are resolved and implemented', () => {
  const iso = (id) => catalog.categories.isolator.items.find(i => i.id === id);
  assert.deepEqual([...iso('is1').tiers].sort(), ['base', 'premium', 'value']);   // D11-A
  assert.deepEqual([...iso('is2').tiers].sort(), ['base', 'premium', 'value']);   // D11-B
  assert.equal(iso('is_9b53be37fab1').status, 'TEST');                            // D11-D
  assert.equal(MASTER.bt2.protectionType, 'ENERGY_SYSTEM_CONTROLLER');            // D12
  assert.equal(MASTER.bt2.integratedProtection, true);
});

test('the package registry is still 288 PROPOSED and 0 packages fully approved', () => {
  assert.equal(REGISTRY.counts.packages, 48);
  assert.equal(REGISTRY.counts.componentsApproved, 34);
  assert.equal(REGISTRY.counts.componentsProposed, 288);
  assert.equal(REGISTRY.counts.packagesFullyApproved, 0);
  // every APPROVED component still cites the decision that approved it
  for (const p of REGISTRY.packages)
    for (const c of p.components || [])
      if (c.approvalStatus === 'APPROVED')
        assert.ok(c.approvedByDecision, `${p.packageId}/${c.role} approved without a decision id`);
});

// ================================================= Phase 2A commercial invariants
test('Phase 2A commercial rules are intact and unmodified', () => {
  const CFG = JSON.parse(readFileSync('data/cost-config.json', 'utf8'));
  // service, survey, engineering, GST, net meter
  assert.equal(CFG.serviceAmc.costPerVisit, 1000);
  assert.equal(CFG.serviceAmc.visitsPerYear, 2);
  assert.equal(CFG.serviceAmc.serviceYears, 5);
  assert.equal(CFG.siteSurvey.costPerProject, 500);
  assert.equal(CFG.siteSurvey.coverageKm, 100);
  assert.equal(CFG.siteSurvey.excessRatePerKm, 3);
  assert.equal(CFG.engineeringDesign.costPerProject, 500);
  assert.equal(CFG.engineeringDesign.sizeLimitKw, 20);
  assert.equal(CFG.engineeringDesign.aboveLimitRate, null);
  assert.equal(CFG.gst.regime, 'SOLAR_70_30_COMPOSITE');
  assert.equal(CFG.netMeter.status, 'NOT_A_FLARIZE_ITEM');
  assert.equal(CFG.procurement.allocationMethod, 'PURCHASE_VALUE_PROPORTION');
  assert.equal(CFG.margin.marginType, 'GROSS_MARGIN');
  // no commercial rate literal leaked into the cost engine
  const eng = readFileSync('src/lib/costEngine.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const n of ['15000', '500', '1000', '3000', '35', '40'])
    assert.equal(new RegExp(`[^\\w.]${n}[^\\w.]`).test(eng), false, `literal ${n} in cost engine`);
});

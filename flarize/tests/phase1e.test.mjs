// Phase 1E — Project BOM authority + automatic engineering checker.
// The 21 named tests from the brief §13, plus authority invariants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ROLES } from '../src/lib/bomRoles.js';
import {
  PROJECT_BOM_STATUS, PROJECT_EDITABLE_ROLES, createProjectBom, setComponent,
  setQuantity, removeRole, effectiveLine, effectiveLines, diffAgainstPackage,
} from '../src/lib/projectBom.js';
import {
  checkProjectBom, CHECK_STATUS, SEVERITY, CHECKER_RULES, CATEGORY, RULES_VERSION,
} from '../src/lib/engineeringChecker.js';
import {
  attemptLock, LOCK_RESULT, requiresAcknowledgement, lockSummary,
} from '../src/lib/bomLock.js';
import { SELECTION_METHOD, createProjectConfiguration, applyProjectOverride, resolveSelection } from '../src/lib/projectConfiguration.js';

const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const MASTER = JSON.parse(readFileSync('data/battery-master.json', 'utf8')).batteries;
const AT = '2026-08-15T00:00:00Z';
const CV = 'catalog@test';

/** A Deye/SEG hybrid package default that resolves cleanly. */
const deyePackageLines = () => ([
  { role: ROLES.PANEL, componentId: 'p1', quantity: 6 },
  { role: ROLES.INVERTER, componentId: inverterIdFor('1P', 'hybrid'), quantity: 1 },
  { role: ROLES.STRUCTURE, componentId: 'sm_15x15', quantity: 10 },
  { role: ROLES.AC_ISOLATOR, componentId: 'is1', quantity: 1 },
  { role: ROLES.BATTERY, componentId: 'bt1', quantity: 1 },
  { role: ROLES.BATTERY_PROTECTION, componentId: 'mb1', quantity: 1 },
]);

function inverterIdFor(phase, type) {
  const hit = catalog.categories.inverter.items.find(i => i.phase === phase && i.type === type);
  return hit ? hit.id : catalog.categories.inverter.items[0].id;
}

const deyeBom = (over = {}) => createProjectBom({
  projectId: 'PRJ-A', packageId: 'hybrid_value', architecture: 'DEYE',
  sysType: 'hybrid', tier: 'value', sizeKw: 3, phase: '1P',
  lines: deyePackageLines(), ...over,
});

/** Strip comments so a source assertion tests CODE, not prose. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const run = (bom, extra = {}) =>
  checkProjectBom({ bom, catalog, batteryMaster: MASTER, at: AT, catalogVersion: CV, ...extra });

// ---------------------------------------------------------------- 1
test('1 — Project Head changes the battery', () => {
  const bom = deyeBom();
  assert.equal(effectiveLine(bom, ROLES.BATTERY).componentId, 'bt1');
  const after = setComponent(bom, { role: ROLES.BATTERY, componentId: 'bt3',
    selectedBy: 'ph@flarize', at: AT, reason: 'customer request' });
  assert.equal(effectiveLine(after, ROLES.BATTERY).componentId, 'bt3');
  assert.equal(effectiveLine(after, ROLES.BATTERY).selectionMethod, SELECTION_METHOD.PROJECT_HEAD_OVERRIDE);
  assert.equal(effectiveLine(after, ROLES.BATTERY).selectedBy, 'ph@flarize');
  assert.equal(after.history.at(-1).from, 'bt1');
  assert.equal(after.history.at(-1).to, 'bt3');
});

// ---------------------------------------------------------------- 2
test('2 — the package default remains unchanged', () => {
  const bom = deyeBom();
  const after = setComponent(bom, { role: ROLES.BATTERY, componentId: 'bt3' });
  assert.equal(after.packageLines.find(l => l.role === ROLES.BATTERY).componentId, 'bt1');
  assert.equal(bom.packageLines.find(l => l.role === ROLES.BATTERY).componentId, 'bt1');
  assert.throws(() => { after.packageLines[0].componentId = 'x'; }, TypeError);
});

// ---------------------------------------------------------------- 3
test('3 — a project override stays project-specific', () => {
  const shared = deyePackageLines();
  const a = setComponent(createProjectBom({ projectId: 'PRJ-A', packageId: 'hybrid_value', lines: shared }),
    { role: ROLES.BATTERY, componentId: 'bt3' });
  const b = createProjectBom({ projectId: 'PRJ-B', packageId: 'hybrid_value', lines: shared });
  assert.equal(effectiveLine(a, ROLES.BATTERY).componentId, 'bt3');
  assert.equal(effectiveLine(b, ROLES.BATTERY).componentId, 'bt1');
  assert.equal(shared.find(l => l.role === ROLES.BATTERY).componentId, 'bt1');
});

// ---------------------------------------------------------------- 4
test('4 — a fully specified compatible battery yields no battery blocker', () => {
  const master = { ...MASTER, bt1: { ...MASTER.bt1,
    integratedProtection: false, externalProtectionRequired: true, protectionRating: '160A',
    nominalVoltage: 51.2, maximumDischargeCurrent: 100, communicationRequired: false,
    compatibleSystemTypes: ['hybrid'], compatiblePhases: ['1P', '3P'],
    compatibleInverters: [inverterIdFor('1P', 'hybrid')] } };
  const r = checkProjectBom({ bom: deyeBom(), catalog, batteryMaster: master, at: AT, catalogVersion: CV });
  // No battery BLOCKER. The remaining F-002 / G-002 warnings are honest: the
  // INVERTER records no batteryVoltageMin/Max or maxBatteryCurrent, so the
  // comparison cannot be made and is reported rather than assumed.
  const blockers = r.findings.filter(f => f.severity === SEVERITY.BLOCKED);
  assert.deepEqual(blockers.map(h => h.ruleId), [], JSON.stringify(blockers.map(h => h.message)));
  const warned = r.findings.filter(f => ['PBC-F-002', 'PBC-G-002'].includes(f.ruleId));
  assert.equal(warned.length, 2);
  for (const w of warned) assert.match(w.message, /Inverter .* not recorded/);
});

// ---------------------------------------------------------------- 5
test('5 — an incompatible battery is BLOCKED', () => {
  // Enphase battery on a DEYE architecture
  const bom = setComponent(deyeBom(), { role: ROLES.BATTERY, componentId: 'bt2', selectedBy: 'ph@flarize' });
  const r = run(bom);
  assert.equal(r.status, CHECK_STATUS.BLOCKED);
  assert.ok(r.findings.some(f => f.ruleId === 'PBC-A-002' && f.componentIds.includes('bt2')));
});

// ---------------------------------------------------------------- 6
test('6 — missing safety-critical data is BLOCKED', () => {
  const bom = setComponent(deyeBom(), { role: ROLES.BATTERY, componentId: 'bt3' });
  const r = run(bom);
  assert.equal(r.status, CHECK_STATUS.BLOCKED);
  const h1 = r.findings.find(f => f.ruleId === 'PBC-H-001');
  assert.ok(h1, 'protection mode unknown must block');
  assert.equal(h1.severity, SEVERITY.BLOCKED);
  assert.equal(h1.category, CATEGORY.H);
});

// ---------------------------------------------------------------- 7
test('7 — missing non-critical data is a WARNING, not a blocker', () => {
  const master = { ...MASTER, bt1: { ...MASTER.bt1, protectionRating: '160A' } };
  const r = checkProjectBom({ bom: deyeBom(), catalog, batteryMaster: master, at: AT, catalogVersion: CV });
  // voltage / current / communication are unrecorded -> WARNING severity only
  for (const id of ['PBC-F-002', 'PBC-G-002', 'PBC-I-001']) {
    const f = r.findings.find(x => x.ruleId === id);
    assert.ok(f, `${id} expected`);
    assert.equal(f.severity, SEVERITY.WARNING);
  }
  assert.equal(r.findings.some(f => f.ruleId === 'PBC-H-002'), false);
});

// ---------------------------------------------------------------- 8
test('8 — an invalid component stays visible in the BOM', () => {
  const bom = setComponent(deyeBom(), { role: ROLES.BATTERY, componentId: 'bt2' });
  const r = run(bom);
  assert.equal(r.status, CHECK_STATUS.BLOCKED);
  const line = effectiveLine(bom, ROLES.BATTERY);
  assert.equal(line.componentId, 'bt2', 'the offending component must remain in the BOM');
  assert.equal(line.quantity, 1, 'quantity must NOT be zeroed');
  assert.ok(effectiveLines(bom).some(l => l.componentId === 'bt2'));
  // and the blocker names it
  assert.ok(r.findings.some(f => f.componentIds.includes('bt2')));
});

// ---------------------------------------------------------------- 9
test('9 — no automatic substitution anywhere in the checker', () => {
  const before = deyeBom();
  const bom = setComponent(before, { role: ROLES.BATTERY, componentId: 'bt2' });
  const snapshotBefore = JSON.stringify(effectiveLines(bom));
  run(bom);
  run(bom);
  assert.equal(JSON.stringify(effectiveLines(bom)), snapshotBefore,
    'running the checker must not alter the BOM in any way');
  // the checker module must not import a mutation function
  const src = stripComments(readFileSync('src/lib/engineeringChecker.js', 'utf8'));
  for (const fn of ['setComponent', 'removeRole', 'setQuantity'])
    assert.equal(src.includes(`${fn}(`), false, `checker must not call ${fn}`);
});

// ---------------------------------------------------------------- 10
test('10 — no automatic fallback after an explicit Project Head selection', () => {
  const bom = setComponent(deyeBom(), { role: ROLES.INVERTER, componentId: 'i1',
    selectedBy: 'ph@flarize', at: AT });   // i1 is an on-grid 3 kW inverter
  const r = run(bom);
  assert.equal(effectiveLine(bom, ROLES.INVERTER).componentId, 'i1',
    'the explicit selection must survive validation');
  // no nearest-kW resolution anywhere in the checker
  const src = stripComments(readFileSync('src/lib/engineeringChecker.js', 'utf8'));
  assert.equal(/nearest/i.test(src), false);
  assert.ok(r.findings.every(f => f.ruleId.startsWith('PBC-')));
});

// ---------------------------------------------------------------- 11
test('11 — premium IQ8P quantity must equal panel quantity', () => {
  const base = createProjectBom({
    projectId: 'PRJ-P', packageId: 'hybrid_premium', architecture: 'ENPHASE',
    sysType: 'hybrid', tier: 'premium', phase: '1P',
    lines: [
      { role: ROLES.PANEL, componentId: 'p1', quantity: 6 },
      { role: ROLES.MICRO_INVERTER, componentId: 'en1', quantity: 6 },
      { role: ROLES.STRUCTURE, componentId: 'sm_15x15', quantity: 10 },
      { role: ROLES.AC_ISOLATOR, componentId: 'is1', quantity: 1 },
      { role: ROLES.BATTERY, componentId: 'bt2', quantity: 1 },
      { role: ROLES.ENERGY_SYSTEM_CONTROLLER, componentId: 'en_sysctrl', quantity: 1 },
    ],
  });
  assert.equal(run(base).findings.some(f => f.ruleId === 'PBC-M-001'), false);

  const bad = setQuantity(base, { role: ROLES.MICRO_INVERTER, quantity: 13 });
  const r = run(bad);
  const m = r.findings.find(f => f.ruleId === 'PBC-M-001');
  assert.ok(m, 'a hardcoded 13 IQ8P must be caught');
  assert.equal(m.severity, SEVERITY.BLOCKED);
  assert.equal(r.status, CHECK_STATUS.BLOCKED);
});

// ---------------------------------------------------------------- 12
test('12 — premium with a Deye/SEG battery is BLOCKED', () => {
  const bom = createProjectBom({
    projectId: 'PRJ-P', packageId: 'hybrid_premium', architecture: 'ENPHASE',
    sysType: 'hybrid', tier: 'premium', phase: '1P',
    lines: [
      { role: ROLES.PANEL, componentId: 'p1', quantity: 6 },
      { role: ROLES.MICRO_INVERTER, componentId: 'en1', quantity: 6 },
      { role: ROLES.STRUCTURE, componentId: 'sm_15x15', quantity: 10 },
      { role: ROLES.AC_ISOLATOR, componentId: 'is1', quantity: 1 },
      { role: ROLES.BATTERY, componentId: 'bt1', quantity: 1 },
      { role: ROLES.ENERGY_SYSTEM_CONTROLLER, componentId: 'en_sysctrl', quantity: 1 },
    ],
  });
  const r = run(bom);
  assert.equal(r.status, CHECK_STATUS.BLOCKED);
  assert.ok(r.findings.some(f => f.ruleId === 'PBC-A-002' && f.componentIds.includes('bt1')));
  assert.equal(effectiveLine(bom, ROLES.BATTERY).componentId, 'bt1', 'still visible, not removed');
});

// ---------------------------------------------------------------- 13
test('13 — premium inheriting the generic mb1 is BLOCKED', () => {
  const bom = createProjectBom({
    projectId: 'PRJ-P', packageId: 'hybrid_premium', architecture: 'ENPHASE',
    sysType: 'hybrid', tier: 'premium', phase: '1P',
    lines: [
      { role: ROLES.PANEL, componentId: 'p1', quantity: 6 },
      { role: ROLES.MICRO_INVERTER, componentId: 'en1', quantity: 6 },
      { role: ROLES.STRUCTURE, componentId: 'sm_15x15', quantity: 10 },
      { role: ROLES.AC_ISOLATOR, componentId: 'is1', quantity: 1 },
      { role: ROLES.BATTERY, componentId: 'bt2', quantity: 1 },
      { role: ROLES.BATTERY_PROTECTION, componentId: 'mb1', quantity: 1 },
      { role: ROLES.ENERGY_SYSTEM_CONTROLLER, componentId: 'en_sysctrl', quantity: 1 },
    ],
  });
  const r = run(bom);
  const f = r.findings.find(x => x.ruleId === 'PBC-H-004' && x.componentIds.includes('mb1'));
  assert.ok(f, 'generic MCCB on an INTEGRATED topology must block');
  assert.equal(r.status, CHECK_STATUS.BLOCKED);
});

// ---------------------------------------------------------------- 14
test('14 — an external-protection battery runs the protection check', () => {
  const noProt = removeRole(deyeBom(), { role: ROLES.BATTERY_PROTECTION, selectedBy: 'ph@flarize' });
  const r = run(noProt);
  const f = r.findings.find(x => x.ruleId === 'PBC-H-003');
  assert.ok(f, 'external protection required but no protection line -> BLOCKED');
  assert.equal(f.severity, SEVERITY.BLOCKED);
  assert.equal(f.category, CATEGORY.H);
});

// ---------------------------------------------------------------- 15
test('15 — a missing protection rating is BLOCKED and never assumed', () => {
  const r = run(deyeBom());
  const f = r.findings.find(x => x.ruleId === 'PBC-H-002');
  assert.ok(f);
  assert.equal(f.severity, SEVERITY.BLOCKED);
  assert.match(f.reason, /must not be assumed/);
  assert.equal(/160\s*A/.test(f.message), false, 'no rating may be stated');
});

// ---------------------------------------------------------------- 16
test('16 — a valid BOM can be locked', () => {
  const master = { ...MASTER, bt1: { ...MASTER.bt1,
    integratedProtection: false, externalProtectionRequired: true, protectionRating: '160A',
    nominalVoltage: 51.2, maximumDischargeCurrent: 100, communicationRequired: false,
    compatibleSystemTypes: ['hybrid'], compatiblePhases: ['1P', '3P'],
    compatibleInverters: [inverterIdFor('1P', 'hybrid')] } };
  const v = checkProjectBom({ bom: deyeBom(), catalog, batteryMaster: master, at: AT, catalogVersion: CV });
  assert.equal(v.counts.blocked, 0, JSON.stringify(v.findings.filter(f => f.severity === 'BLOCKED').map(f => f.message)));

  const acks = v.findings.filter(f => requiresAcknowledgement(f.ruleId))
    .map(f => ({ ruleId: f.ruleId, by: 'ph@flarize', at: AT, note: 'reviewed' }));
  const out = attemptLock({ bom: deyeBom(), catalog, batteryMaster: master, catalogVersion: CV,
    lockedBy: 'ph@flarize', lockedAt: AT, acknowledgements: acks,
    priceLookup: { bt1: { purchaseCost: 86717 } } });
  assert.equal(out.result, LOCK_RESULT.LOCKED);
  assert.equal(out.bom.status, PROJECT_BOM_STATUS.LOCKED);
  assert.equal(out.snapshot.lines.find(l => l.role === ROLES.BATTERY).unitPurchaseCost, 86717);
});

// ---------------------------------------------------------------- 17
test('17 — a blocked BOM cannot be locked, and the BOM is not modified', () => {
  const bom = deyeBom();                       // bt1 has no recorded protection rating
  const before = JSON.stringify(effectiveLines(bom));
  const out = attemptLock({ bom, catalog, batteryMaster: MASTER, catalogVersion: CV,
    lockedBy: 'ph@flarize', lockedAt: AT });
  assert.equal(out.result, LOCK_RESULT.REJECTED_BLOCKED);
  assert.equal(out.locked, false);
  assert.equal(out.snapshot, null);
  assert.equal(out.bom.status, PROJECT_BOM_STATUS.DRAFT, 'the BOM stays editable');
  assert.equal(JSON.stringify(effectiveLines(out.bom)), before, 'the BOM must not be modified');
  assert.match(out.reason, /Fix the configuration/);
  assert.equal(lockSummary(out.validation).canLock, false);
});

// ---------------------------------------------------------------- 18
test('18 — warnings require explicit acknowledgement', () => {
  const master = { ...MASTER, bt1: { ...MASTER.bt1,
    integratedProtection: false, externalProtectionRequired: true, protectionRating: '160A',
    nominalVoltage: 51.2, maximumDischargeCurrent: 100, communicationRequired: false,
    compatibleSystemTypes: ['hybrid'], compatiblePhases: ['1P', '3P'],
    compatibleInverters: [inverterIdFor('1P', 'hybrid')] } };
  const noAck = attemptLock({ bom: deyeBom(), catalog, batteryMaster: master, catalogVersion: CV,
    lockedBy: 'ph@flarize', lockedAt: AT, acknowledgements: [] });
  assert.equal(noAck.result, LOCK_RESULT.REJECTED_UNACKNOWLEDGED);
  assert.ok(noAck.missingAcknowledgements.length > 0);
  assert.equal(noAck.locked, false);

  const acks = noAck.missingAcknowledgements.map(m => ({ ruleId: m.ruleId, by: 'ph@flarize', at: AT }));
  const ok = attemptLock({ bom: deyeBom(), catalog, batteryMaster: master, catalogVersion: CV,
    lockedBy: 'ph@flarize', lockedAt: AT, acknowledgements: acks });
  assert.equal(ok.result, LOCK_RESULT.LOCKED);
  assert.equal(ok.snapshot.acknowledgements.length, acks.length);
});

// ---------------------------------------------------------------- 19
test('19 — a locked BOM is immutable', () => {
  const master = { ...MASTER, bt1: { ...MASTER.bt1,
    integratedProtection: false, externalProtectionRequired: true, protectionRating: '160A',
    nominalVoltage: 51.2, maximumDischargeCurrent: 100, communicationRequired: false,
    compatibleSystemTypes: ['hybrid'], compatiblePhases: ['1P', '3P'],
    compatibleInverters: [inverterIdFor('1P', 'hybrid')] } };
  const v = checkProjectBom({ bom: deyeBom(), catalog, batteryMaster: master, at: AT, catalogVersion: CV });
  const acks = v.findings.filter(f => requiresAcknowledgement(f.ruleId)).map(f => ({ ruleId: f.ruleId, by: 'ph', at: AT }));
  const out = attemptLock({ bom: deyeBom(), catalog, batteryMaster: master, catalogVersion: CV,
    lockedBy: 'ph@flarize', lockedAt: AT, acknowledgements: acks });

  assert.throws(() => setComponent(out.bom, { role: ROLES.BATTERY, componentId: 'bt3' }), /LOCKED/);
  assert.throws(() => setQuantity(out.bom, { role: ROLES.PANEL, quantity: 9 }), /LOCKED/);
  assert.throws(() => removeRole(out.bom, { role: ROLES.BATTERY }), /LOCKED/);
  assert.throws(() => { out.snapshot.lines[0].quantity = 99; }, TypeError);
  const again = attemptLock({ bom: out.bom, catalog, batteryMaster: master, catalogVersion: CV,
    lockedBy: 'ph', lockedAt: AT });
  assert.equal(again.result, LOCK_RESULT.ALREADY_LOCKED);
});

// ---------------------------------------------------------------- 20
test('20 — a project override does not modify the package configuration', () => {
  const pkgDefaults = { BATTERY: 'bt1' };
  const cfg = createProjectConfiguration({ projectId: 'PRJ-A', packageId: 'hybrid_value', packageDefaults: pkgDefaults });
  const after = applyProjectOverride(cfg, { role: 'BATTERY', componentId: 'bt3', selectedBy: 'ph@flarize' });
  assert.equal(resolveSelection(after, 'BATTERY').componentId, 'bt3');
  assert.equal(after.packageDefaults.BATTERY, 'bt1');
  assert.equal(pkgDefaults.BATTERY, 'bt1');

  const bom = setComponent(deyeBom(), { role: ROLES.BATTERY, componentId: 'bt3' });
  assert.deepEqual(diffAgainstPackage(bom).map(d => [d.role, d.packageComponentId, d.projectComponentId]),
    [[ROLES.BATTERY, 'bt1', 'bt3']]);
});

// ---------------------------------------------------------------- 21
test('21 — same inputs produce the same validation result', () => {
  const bom = setComponent(deyeBom(), { role: ROLES.BATTERY, componentId: 'bt3' });
  const a = run(bom), b = run(bom);
  assert.equal(a.deterministicKey, b.deterministicKey);
  assert.equal(JSON.stringify(a.findings), JSON.stringify(b.findings));
  assert.equal(a.rulesVersion, RULES_VERSION);

  // insertion order must not matter
  const reordered = createProjectBom({
    projectId: 'PRJ-A', packageId: 'hybrid_value', architecture: 'DEYE',
    sysType: 'hybrid', tier: 'value', sizeKw: 3, phase: '1P',
    lines: [...deyePackageLines()].reverse(),
  });
  const c = run(setComponent(reordered, { role: ROLES.BATTERY, componentId: 'bt3' }));
  assert.equal(c.deterministicKey, a.deterministicKey, 'ordering must not change the verdict');

  // `at` is supplied by the caller, never read from the clock
  const src = stripComments(readFileSync('src/lib/engineeringChecker.js', 'utf8'));
  assert.equal(/Date\.now\(|new Date\(|Math\.random\(/.test(src), false);
});

// ------------------------------------------- authority invariants ----------

test('authority — the Project Head may select a component with incomplete data', () => {
  // bt3 has no electrical data at all; selection must still succeed
  const bom = setComponent(deyeBom(), { role: ROLES.BATTERY, componentId: 'bt3' });
  assert.equal(effectiveLine(bom, ROLES.BATTERY).componentId, 'bt3');
  // and validation, not selection, is what reports the problem
  assert.equal(run(bom).status, CHECK_STATUS.BLOCKED);
});

test('authority — a line leaves the BOM only by explicit removal', () => {
  const bom = deyeBom();
  const removed = removeRole(bom, { role: ROLES.BATTERY_PROTECTION, selectedBy: 'ph@flarize', at: AT, reason: 'explicit' });
  assert.equal(effectiveLine(removed, ROLES.BATTERY_PROTECTION), null);
  assert.equal(removed.history.at(-1).action, 'REMOVE_ROLE');
  // setComponent refuses a null id — removal must be deliberate
  assert.throws(() => setComponent(bom, { role: ROLES.BATTERY, componentId: null }), /removeRole/);
});

test('D11 — the checker enforces is1 for 1P and is2 for 3P', () => {
  const wrong = setComponent(deyeBom(), { role: ROLES.AC_ISOLATOR, componentId: 'is2' });
  assert.ok(run(wrong).findings.some(f => f.ruleId === 'PBC-P-001'));
  const threeP = createProjectBom({ projectId: 'P3', packageId: 'k', architecture: 'DEYE',
    sysType: 'hybrid', phase: '3P',
    lines: [...deyePackageLines().filter(l => l.role !== ROLES.AC_ISOLATOR && l.role !== ROLES.INVERTER),
      { role: ROLES.AC_ISOLATOR, componentId: 'is2', quantity: 1 },
      { role: ROLES.INVERTER, componentId: inverterIdFor('3P', 'hybrid'), quantity: 1 }] });
  assert.equal(run(threeP).findings.some(f => f.ruleId === 'PBC-P-001'), false);
});

test('D11-C — a DC_ISOLATOR role is not modelled in V1', () => {
  assert.equal(PROJECT_EDITABLE_ROLES.includes('DC_ISOLATOR'), false);
  const bom = { ...deyeBom() };
  const withDc = { ...bom, packageLines: [...bom.packageLines, { role: 'DC_ISOLATOR', componentId: 'x', quantity: 1 }] };
  assert.ok(run(withDc).findings.some(f => f.ruleId === 'PBC-P-002'));
});

test('a TEST/INACTIVE component is blocked but stays in the BOM', () => {
  const bom = setComponent(deyeBom(), { role: ROLES.AC_ISOLATOR, componentId: 'is_9b53be37fab1' });
  const r = run(bom);
  assert.ok(r.findings.some(f => f.ruleId === 'PBC-K-004'));
  assert.equal(effectiveLine(bom, ROLES.AC_ISOLATOR).componentId, 'is_9b53be37fab1');
});

test('every finding carries the full required shape', () => {
  const r = run(setComponent(deyeBom(), { role: ROLES.BATTERY, componentId: 'bt3' }));
  assert.ok(r.findings.length > 0);
  for (const f of r.findings) {
    for (const k of ['ruleId', 'category', 'severity', 'componentIds', 'message', 'reason', 'source', 'inputs', 'rulesVersion', 'at'])
      assert.ok(f[k] !== undefined, `${f.ruleId} missing ${k}`);
    assert.ok(Array.isArray(f.componentIds));
    assert.ok(CHECKER_RULES.some(x => x.id === f.ruleId), `${f.ruleId} is not in the rule register`);
  }
});

test('all 19 categories A–S are represented in the rule register', () => {
  const covered = new Set(CHECKER_RULES.map(r => r.category));
  for (const c of Object.values(CATEGORY)) assert.ok(covered.has(c), `no rule for category ${c}`);
  assert.equal(Object.keys(CATEGORY).length, 19);
});

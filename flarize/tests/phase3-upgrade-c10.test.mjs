// DECISION C10 — UPGRADE MODEL (approved 2026-08-16).
//
// The load-bearing assertions are negative. C10 is a decision about what the
// system must REFUSE to do: no nearest-path, no proportional scaling, no
// fallback quantity, no assumed inverter retention, no mixed-panel string, no
// silent phase coercion, no invented AC-side or structure quantity.
//
// Catalog data is read for real: `3_6` and `3_8` genuinely have no approved
// fixed-item quantities, and the tests prove the code says so rather than
// filling the gap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as U from '../src/lib/upgradeAssessment.js';
import { APPROVED_UPGRADE_PATHS } from '../src/lib/upgradeModel.js';
import { ROLE, RbacError } from '../src/lib/rbac.js';

const SRC = readFileSync('src/lib/upgradeAssessment.js', 'utf8');
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));

const AT = '2026-08-16T00:00:00Z';
const SALES = { userId: 's1', role: ROLE.SALES };
const PH = { userId: 'ph1', role: ROLE.PROJECT_HEAD };
const ENGR = { userId: 'e1', role: ROLE.ENGINEERING };
const PROC = { userId: 'pr1', role: ROLE.PROCUREMENT };

const item = (cat, id) => catalog.categories[cat].items.find(i => i.id === id);

const P550 = item('panel', 'p2');    // Adani 550 W
const P600 = item('panel', 'p5');    // Premier 600 W
const INV3 = item('inverter', 'i1');   // 3 kW 1P, 1 MPPT
const INV6_3P = item('inverter', 'i5');   // 6 kW 3P, 2 MPPT
const INV6_1P = item('inverter', 'i59');  // 6 kW 1P, 2 MPPT

// A DC/AC policy does NOT exist in the catalog. Where a test needs one it is
// supplied explicitly as test data and labelled as such — never as a default.
const TEST_POLICY = { minRatio: 1.0, maxRatio: 1.4, version: 'TEST-ONLY' };
const FREE_MPPT = [{ mppt: 1, stringsUsed: 1 }, { mppt: 2, stringsUsed: 0 }];
const FULL_MPPT = [{ mppt: 1, stringsUsed: 1 }, { mppt: 2, stringsUsed: 1 }];

// ---------------------------------------------------------------------------
// 0. module discipline
// ---------------------------------------------------------------------------

test('the module has no clock, no randomness and no heuristic scaling', () => {
  assert.equal(/Date\.now|new Date|Math\.random/.test(SRC), false);
  // strip comments — the prohibited words appear only in prose that forbids them
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/nearest|closest|scale|fallback|approx|heuristic/i.test(code), false);
  assert.equal(/refQty|refPanels/.test(SRC), false);
});

test('it imports only the frozen upgrade model and RBAC — no engine, no catalog file', () => {
  const imports = [...SRC.matchAll(/^import[^;]*?from\s+'([^']+)'/gm)].map(m => m[1]).sort();
  assert.deepEqual(imports, ['./rbac.js', './upgradeModel.js']);
  assert.equal(/readFileSync|catalog\.json/.test(SRC), false);
});

// ---------------------------------------------------------------------------
// 1. the two scenarios are never conflated
// ---------------------------------------------------------------------------

test('an unknown scenario is refused outright', () => {
  assert.throws(() => U.assessUpgrade({ scenario: 'UPGRADE', fromKw: 3, toKw: 6 }), /never conflated/);
});

test('future-ready 3→6 assesses BOTH the initial and the target DC/AC ratio', () => {
  const a = U.assessUpgrade({
    scenario: U.SCENARIO.FUTURE_READY, fromKw: 3, toKw: 6, tier: 'BASE', requestedPhase: '3P',
    existingInverter: INV6_3P, existingPanel: P550, initialPanel: P550, initialPanelCount: 6,
    targetPanel: P550, targetPanelCount: 11, dcAcPolicy: TEST_POLICY,
    mpptUtilisation: FREE_MPPT, existingStructureAdequate: true, catalog,
  });
  assert.equal(a.scenario, U.SCENARIO.FUTURE_READY);
  assert.equal(a.initialDcAcRatio, 0.55);   // 6 × 550 W ÷ 6000 W — from supplied values only
  assert.equal(a.targetDcAcRatio, 1.0083);
  // the initial ratio is judged too, and it fails the supplied test range
  assert.ok(a.checks.some(c => c.detail?.label === 'initial system' && c.status === U.CHECK.FAIL));
  assert.equal(a.status, U.ASSESSMENT_STATUS.BLOCKED);
});

test('existing-system 3→6 inspects the existing inverter first', () => {
  const a = U.assessUpgrade({
    scenario: U.SCENARIO.EXISTING_SYSTEM, fromKw: 3, toKw: 6, requestedPhase: '3P',
    existingInverter: INV6_3P, existingPanel: P550, targetPanel: P550, targetPanelCount: 11,
    dcAcPolicy: TEST_POLICY, mpptUtilisation: FREE_MPPT, existingStructureAdequate: true, catalog,
  });
  assert.equal(a.initialDcAcRatio, null, 'there is no "initial system" ratio in this scenario');
  assert.ok(a.inverter);
  assert.equal(a.inverter.checks[0].id, U.FINDING.INVERTER_CAPACITY_UNSUITABLE);
});

// ---------------------------------------------------------------------------
// 2. inverter retention — C10 §E
// ---------------------------------------------------------------------------

test('a suitable 6 kW three-phase inverter is retained when every check passes', () => {
  const r = U.assessInverterRetention({
    existingInverter: INV6_3P, targetKw: 6, requestedPhase: '3P',
    panel: P550, panelCount: 11, dcAcPolicy: TEST_POLICY, mpptUtilisation: FREE_MPPT,
  });
  assert.equal(r.retain, true);
  assert.equal(r.replacementRequired, false);
  assert.equal(r.verdict, U.FINDING.INVERTER_RETAINED);
  assert.deepEqual([...r.missingInputs], []);
});

test('a suitable inverter is NOT replaced merely because an upgrade was requested', () => {
  const r = U.assessInverterRetention({
    existingInverter: INV6_3P, targetKw: 6, requestedPhase: '3P',
    panel: P550, panelCount: 11, dcAcPolicy: TEST_POLICY, mpptUtilisation: FREE_MPPT,
  });
  assert.equal(r.replacementRequired, false);
  assert.equal(r.failedChecks.length, 0);
});

test('an undersized inverter requires replacement', () => {
  const r = U.assessInverterRetention({
    existingInverter: INV3, targetKw: 6, requestedPhase: '3P',
    panel: P550, panelCount: 11, dcAcPolicy: TEST_POLICY, mpptUtilisation: FREE_MPPT,
  });
  assert.equal(r.retain, false);
  assert.equal(r.replacementRequired, true);
  assert.ok(r.failedChecks.includes(U.FINDING.INVERTER_CAPACITY_UNSUITABLE));
});

test('a 6 kW SINGLE-phase inverter fails the >5 kW three-phase requirement', () => {
  const r = U.assessInverterRetention({
    existingInverter: INV6_1P, targetKw: 6, panel: P550, panelCount: 11,
    dcAcPolicy: TEST_POLICY, mpptUtilisation: FREE_MPPT,
  });
  assert.equal(r.retain, false);
  assert.ok(r.failedChecks.includes(U.FINDING.INVERTER_PHASE_UNSUITABLE));
});

test('"a 6 kW inverter exists" alone never yields retention — it yields UNRESOLVED', () => {
  const bare = U.assessInverterRetention({ existingInverter: INV6_3P, targetKw: 6 });
  assert.equal(bare.retain, null, 'not true, and not false either');
  assert.equal(bare.replacementRequired, null);
  assert.equal(bare.verdict, U.FINDING.SALES_MAY_NOT_ENGINEER);
  assert.ok(bare.missingInputs.includes(U.MISSING_INPUT.MPPT_UTILISATION));
  assert.ok(bare.missingInputs.includes(U.MISSING_INPUT.PANEL_ELECTRICAL_CHARACTERISTICS));

  // everything supplied EXCEPT the DC/AC policy — still not a retention
  const noPolicy = U.assessInverterRetention({
    existingInverter: INV6_3P, targetKw: 6, requestedPhase: '3P',
    panel: P550, panelCount: 11, mpptUtilisation: FREE_MPPT,
  });
  assert.equal(noPolicy.retain, null);
  assert.ok(noPolicy.missingInputs.includes(U.MISSING_INPUT.DC_AC_RATIO_POLICY));
});

test('no existing inverter means neither retention nor replacement is assumed', () => {
  const r = U.assessInverterRetention({ targetKw: 6 });
  assert.equal(r.retain, null);
  assert.equal(r.replacementRequired, null);
  assert.ok(r.missingInputs.includes(U.MISSING_INPUT.EXISTING_INVERTER));
});

// ---------------------------------------------------------------------------
// 3. DC/AC ratio
// ---------------------------------------------------------------------------

test('DC/AC ratio is reported but never judged without an approved policy', () => {
  const r = U.assessDcAcRatio({ panel: P550, panelCount: 11, inverter: INV6_3P });
  assert.equal(r.ratio, 1.0083);
  assert.equal(r.check.status, U.CHECK.UNRESOLVED);
  assert.equal(r.check.id, U.FINDING.DCAC_POLICY_ABSENT);
  assert.deepEqual(r.check.detail.missingInputs, [U.MISSING_INPUT.DC_AC_RATIO_POLICY]);
  assert.equal(/no policy is not a pass|not judged/.test(r.check.message), true);
});

test('DC/AC ratio passes and fails against a supplied policy', () => {
  const pass = U.assessDcAcRatio({ panel: P550, panelCount: 11, inverter: INV6_3P, policy: TEST_POLICY });
  assert.equal(pass.check.status, U.CHECK.PASS);
  const fail = U.assessDcAcRatio({ panel: P550, panelCount: 20, inverter: INV6_3P, policy: TEST_POLICY });
  assert.equal(fail.ratio, 1.8333);
  assert.equal(fail.check.status, U.CHECK.FAIL);
});

test('a missing panel or count makes the ratio UNRESOLVED, never 0', () => {
  const r = U.assessDcAcRatio({ inverter: INV6_3P, policy: TEST_POLICY });
  assert.equal(r.ratio, null);
  assert.equal(r.check.status, U.CHECK.UNRESOLVED);
});

// ---------------------------------------------------------------------------
// 4. MPPT and strings
// ---------------------------------------------------------------------------

test('an undeclared MPPT layout is UNRESOLVED — free capacity is never assumed', () => {
  const r = U.assessMpptAvailability({ inverter: INV6_3P });
  assert.equal(r.freeMppts, null);
  assert.equal(r.checks[0].status, U.CHECK.UNRESOLVED);
  assert.ok(r.checks[0].detail.missingInputs.includes(U.MISSING_INPUT.EXISTING_STRING_LAYOUT));
});

test('a declared free MPPT allows the additional array onto a separate MPPT', () => {
  const r = U.assessMpptAvailability({ inverter: INV6_3P, mpptUtilisation: FREE_MPPT });
  assert.equal(r.freeMppts, 1);
  assert.equal(r.checks[0].status, U.CHECK.PASS);
});

test('no free MPPT fails — a panel is never pushed into an occupied string to fit', () => {
  const r = U.assessMpptAvailability({ inverter: INV6_3P, mpptUtilisation: FULL_MPPT });
  assert.equal(r.freeMppts, 0);
  assert.equal(r.checks[0].status, U.CHECK.FAIL);
});

test('550 W → 600 W: the new panel is never added to the existing string', () => {
  const r = U.assessPanelAddition({
    existingPanel: P550, newPanel: P600, inverter: INV6_3P, mpptUtilisation: FREE_MPPT,
  });
  assert.equal(r.sameStringPermitted, false);
  assert.equal(r.separateMpptRequired, true);
  const mixed = r.checks.find(c => c.id === U.FINDING.MIXED_PANEL_SAME_STRING_FORBIDDEN);
  assert.equal(mixed.status, U.CHECK.FAIL);
  assert.equal(mixed.detail.existingWatt, 550);
  assert.equal(mixed.detail.newWatt, 600);
  assert.ok(/Sales may not resolve it/.test(mixed.message));
});

test('a mixed panel with no free MPPT fails on both counts', () => {
  const r = U.assessPanelAddition({
    existingPanel: P550, newPanel: P600, inverter: INV6_3P, mpptUtilisation: FULL_MPPT,
  });
  assert.equal(r.sameStringPermitted, false);
  assert.ok(r.checks.some(c => c.id === U.FINDING.MPPT_NONE_FREE && c.status === U.CHECK.FAIL));
});

test('an identical panel still does not authorise extending the string in V1', () => {
  const r = U.assessPanelAddition({
    existingPanel: P550, newPanel: P550, inverter: INV6_3P, mpptUtilisation: FREE_MPPT,
  });
  assert.equal(r.sameStringPermitted, null, 'not permitted, not refused — string length is not modelled');
  assert.ok(r.checks.some(c => c.id === U.FINDING.STRING_LAYOUT_UNDECLARED && c.status === U.CHECK.UNRESOLVED));
});

// ---------------------------------------------------------------------------
// 5. structure
// ---------------------------------------------------------------------------

test('existing structure declared adequate is neither charged nor replaced', () => {
  const s = U.assessStructure({ existingStructureAdequate: true });
  assert.equal(s.outcome, 'ALREADY_ADEQUATE');
  assert.equal(s.additionalStructureQuantity, null);
  assert.equal(s.checks[0].status, U.CHECK.PASS);
});

test('additional structure required carries NO quantity, and is not zero', () => {
  const s = U.assessStructure({ existingStructureAdequate: false });
  assert.equal(s.outcome, 'ADDITIONAL_REQUIRED');
  assert.equal(s.additionalStructureQuantity, null);
  assert.equal(s.checks[0].status, U.CHECK.UNRESOLVED);
  assert.ok(s.checks[0].detail.missingInputs.includes(U.MISSING_INPUT.ADDITIONAL_STRUCTURE_QUANTITY));
});

test('unassessed structure is UNKNOWN — never assumed adequate', () => {
  const s = U.assessStructure({});
  assert.equal(s.outcome, 'UNKNOWN');
  assert.equal(s.checks[0].status, U.CHECK.UNRESOLVED);
});

// ---------------------------------------------------------------------------
// 6. three-phase rule — C10 §C
// ---------------------------------------------------------------------------

test('above 5 kW the system is three-phase and the AC side must be re-evaluated', () => {
  const p = U.assessPhaseRequirement({ targetKw: 6 });
  assert.equal(p.requiredPhase, '3P');
  assert.deepEqual([...p.acSideReevaluation], ['ACDB', 'AC_CABLE', 'AC_ISOLATOR', 'METER', 'KSEB_CONNECTION']);
  const ac = p.checks.find(c => c.id === U.FINDING.AC_SIDE_REEVALUATION_REQUIRED);
  assert.equal(ac.status, U.CHECK.UNRESOLVED);
  assert.ok(ac.detail.missingInputs.includes(U.MISSING_INPUT.THREE_PHASE_AC_SIDE_QUANTITIES));
  assert.equal(JSON.stringify(p).includes('"quantity"'), false, 'no AC-side quantity is produced');
});

test('up to 5 kW no phase is forced', () => {
  const p = U.assessPhaseRequirement({ targetKw: 5, requestedPhase: '1P' });
  assert.equal(p.requiredPhase, null);
  assert.equal(p.acSideReevaluation, null);
  assert.equal(p.checks.every(c => c.status !== U.CHECK.FAIL), true);
});

test('a single-phase request above 5 kW is blocked, never silently converted', () => {
  const p = U.assessPhaseRequirement({ targetKw: 6, requestedPhase: '1P' });
  assert.ok(p.checks.some(c => c.status === U.CHECK.FAIL));
  assert.ok(p.checks.some(c => /never silently converted/.test(c.message)));
  assert.equal(p.requiredPhase, '3P', 'the requirement is reported; the request is not rewritten');
});

// ---------------------------------------------------------------------------
// 7. fixed items — no invented quantity, no nearest path
// ---------------------------------------------------------------------------

test('3_6 and 3_8 have no approved quantities and are named, not filled', () => {
  for (const [from, to] of [[3, 6], [3, 8]]) {
    const r = U.resolveUpgradeFixedItems(catalog, from, to);
    assert.equal(r.resolved, false, `${from}_${to}`);
    assert.deepEqual([...r.items], []);
    assert.equal(r.pathKey, `${from}_${to}`);
    assert.equal(r.check.status, U.CHECK.UNRESOLVED);
    assert.ok(r.check.detail.missingInputs.includes(U.MISSING_INPUT.UPGRADE_FIXED_ITEM_QUANTITIES));
    assert.deepEqual([...r.definedPathKeys], ['3_5', '5_10', '5_8', '8_10']);
  }
});

test('3_5 resolves to the catalog quantities exactly as authored', () => {
  const r = U.resolveUpgradeFixedItems(catalog, 3, 5);
  assert.equal(r.resolved, true);
  const mc4 = r.items.find(i => i.itemId === 'mc4_1');
  const authored = catalog.bomTemplates.upgrade.fixedItems.find(i => i.itemId === 'mc4_1');
  assert.equal(mc4.quantity, authored.qty['3_5']);
  assert.equal(mc4.source, 'CATALOG_UPGRADE_FIXED_ITEMS');
});

test('no nearest-path fallback: 3_6 does not inherit 3_5 quantities', () => {
  const three_five = U.resolveUpgradeFixedItems(catalog, 3, 5);
  const three_six = U.resolveUpgradeFixedItems(catalog, 3, 6);
  assert.ok(three_five.items.length > 0);
  assert.equal(three_six.items.length, 0);
  assert.equal(JSON.stringify(three_six.items), '[]');
});

test('an unapproved path is blocked, not extrapolated', () => {
  const a = U.assessUpgrade({ scenario: U.SCENARIO.EXISTING_SYSTEM, fromKw: 3, toKw: 15, catalog });
  assert.equal(a.status, U.ASSESSMENT_STATUS.BLOCKED);
  assert.ok(a.failedChecks.includes(U.FINDING.UPGRADE_PATH_NOT_APPROVED));
  assert.deepEqual([...a.quantitiesProduced], []);
  assert.equal(a.identity.approved, false);
  // the approved list itself is unchanged
  assert.equal(APPROVED_UPGRADE_PATHS.length, 6);
});

// ---------------------------------------------------------------------------
// 8. routing to Project Head / Engineering — C10 §D
// ---------------------------------------------------------------------------

test('an unresolved 3→6 assessment routes to engineering and produces no quantity', () => {
  const a = U.assessUpgrade({
    scenario: U.SCENARIO.EXISTING_SYSTEM, fromKw: 3, toKw: 6, requestedPhase: '3P',
    existingInverter: INV6_3P, existingPanel: P550, targetPanel: P600, targetPanelCount: 10,
    dcAcPolicy: TEST_POLICY, mpptUtilisation: FREE_MPPT, existingStructureAdequate: false, catalog,
  });
  assert.equal(a.routeToEngineering, true);
  assert.deepEqual([...a.quantitiesProduced], []);
  assert.ok(a.missingInputs.includes(U.MISSING_INPUT.UPGRADE_FIXED_ITEM_QUANTITIES));
  assert.ok(a.missingInputs.includes(U.MISSING_INPUT.THREE_PHASE_AC_SIDE_QUANTITIES));
  assert.ok(/Sales does not resolve/.test(a.salesNote));
});

test('Sales submits a request; Procurement cannot decide it; Project Head and Engineering can', () => {
  const store = U.createUpgradeRequestStore();
  const assessment = U.assessUpgrade({
    scenario: U.SCENARIO.EXISTING_SYSTEM, fromKw: 3, toKw: 6, requestedPhase: '3P',
    existingInverter: INV6_3P, existingPanel: P550, targetPanel: P600, catalog,
  });
  const req = U.submitUpgradeRequest(store, SALES, {
    requestId: 'UR-1', projectId: 'PRJ-1', assessment,
    existingSystem: { inverterId: 'i5', panelId: 'p2', panelCount: 6 }, at: AT,
  });
  assert.equal(req.status, U.REQUEST_STATUS.SUBMITTED);
  assert.equal(req.submittedByRole, ROLE.SALES);

  assert.equal(U.isUpgradeReviewer(ROLE.PROJECT_HEAD), true);
  assert.equal(U.isUpgradeReviewer(ROLE.ENGINEERING), true);
  assert.equal(U.isUpgradeReviewer(ROLE.SALES), false);
  assert.equal(U.isUpgradeReviewer(ROLE.PROCUREMENT), false);

  assert.throws(() => U.approveUpgradeRequest(store, SALES, 'UR-1',
    { configuration: { lines: [{ componentId: 'p5', quantity: 4 }] }, at: AT }),
  e => e.code === U.REQUEST_ERROR.NOT_A_REVIEWER);
  assert.throws(() => U.approveUpgradeRequest(store, PROC, 'UR-1',
    { configuration: { lines: [{ componentId: 'p5', quantity: 4 }] }, at: AT }),
  e => e.code === U.REQUEST_ERROR.NOT_A_REVIEWER || e instanceof RbacError);
});

test('the approved configuration becomes authoritative for BOM, cost and quotation', () => {
  const store = U.createUpgradeRequestStore();
  const assessment = U.assessUpgrade({ scenario: U.SCENARIO.EXISTING_SYSTEM, fromKw: 3, toKw: 6, catalog });
  U.submitUpgradeRequest(store, SALES, { requestId: 'UR-2', assessment, at: AT });

  const approved = U.approveUpgradeRequest(store, ENGR, 'UR-2', {
    at: AT, reason: 'Separate MPPT approved for the 600 W array.',
    configuration: { lines: [{ componentId: 'p5', quantity: 4 }, { componentId: 'a4', quantity: 1 }] },
  });
  assert.equal(approved.status, U.REQUEST_STATUS.APPROVED);
  assert.equal(approved.approvedConfiguration.authoritative, true);
  assert.deepEqual([...approved.approvedConfiguration.authoritativeFor], ['PROJECT_BOM', 'COST', 'QUOTATION']);
  assert.equal(Object.isFrozen(approved.approvedConfiguration), true);
  assert.equal(U.authoritativeConfigurationFor(store, PH, 'UR-2').approvedBy, 'e1');

  assert.throws(() => U.approveUpgradeRequest(store, PH, 'UR-2',
    { configuration: { lines: [{ componentId: 'p5', quantity: 1 }] }, at: AT }),
  e => e.code === U.REQUEST_ERROR.REQUEST_ALREADY_DECIDED);
});

test('an approval with a missing quantity is refused — a blank is never zero', () => {
  const store = U.createUpgradeRequestStore();
  const assessment = U.assessUpgrade({ scenario: U.SCENARIO.FUTURE_READY, fromKw: 3, toKw: 6, catalog });
  U.submitUpgradeRequest(store, SALES, { requestId: 'UR-3', assessment, at: AT });
  for (const lines of [[], [{ componentId: 'p5' }], [{ quantity: 4 }]]) {
    assert.throws(() => U.approveUpgradeRequest(store, PH, 'UR-3', { configuration: { lines }, at: AT }),
      e => e.code === U.REQUEST_ERROR.CONFIGURATION_INCOMPLETE);
  }
  assert.equal(U.getUpgradeRequest(store, PH, 'UR-3').status, U.REQUEST_STATUS.SUBMITTED);
  assert.equal(U.authoritativeConfigurationFor(store, PH, 'UR-3'), null);
});

test('a rejected request yields no authoritative configuration', () => {
  const store = U.createUpgradeRequestStore();
  const assessment = U.assessUpgrade({ scenario: U.SCENARIO.EXISTING_SYSTEM, fromKw: 3, toKw: 6, catalog });
  U.submitUpgradeRequest(store, SALES, { requestId: 'UR-4', assessment, at: AT });
  const r = U.rejectUpgradeRequest(store, PH, 'UR-4', { at: AT, reason: 'Site survey required first.' });
  assert.equal(r.status, U.REQUEST_STATUS.REJECTED);
  assert.equal(U.authoritativeConfigurationFor(store, PH, 'UR-4'), null);
});

test('every request operation demands a caller-supplied `at`', () => {
  const store = U.createUpgradeRequestStore();
  const assessment = U.assessUpgrade({ scenario: U.SCENARIO.EXISTING_SYSTEM, fromKw: 3, toKw: 6, catalog });
  assert.throws(() => U.submitUpgradeRequest(store, SALES, { requestId: 'UR-5', assessment }),
    e => e.code === U.REQUEST_ERROR.MISSING_TIMESTAMP);
});

test('an unknown request is not found rather than invented', () => {
  const store = U.createUpgradeRequestStore();
  assert.throws(() => U.getUpgradeRequest(store, PH, 'NOPE'),
    e => e.code === U.REQUEST_ERROR.REQUEST_NOT_FOUND);
});

// ---------------------------------------------------------------------------
// 9. nothing is silently substituted or invented, end to end
// ---------------------------------------------------------------------------

test('a fully resolvable assessment still produces only catalog-authored quantities', () => {
  const a = U.assessUpgrade({
    scenario: U.SCENARIO.EXISTING_SYSTEM, fromKw: 5, toKw: 8, requestedPhase: '3P',
    existingInverter: item('inverter', 'i7') ?? INV6_3P, existingPanel: P550, targetPanel: P550,
    targetPanelCount: 14, dcAcPolicy: TEST_POLICY, mpptUtilisation: FREE_MPPT,
    existingStructureAdequate: true, catalog,
  });
  assert.equal(a.fixedItems.resolved, true);
  for (const line of a.quantitiesProduced) {
    const authored = catalog.bomTemplates.upgrade.fixedItems.find(i => i.itemId === line.itemId);
    assert.equal(line.quantity, authored.qty['5_8']);
  }
});

test('no component is ever substituted for another', () => {
  const a = U.assessUpgrade({
    scenario: U.SCENARIO.EXISTING_SYSTEM, fromKw: 3, toKw: 6,
    existingInverter: INV3, existingPanel: P550, targetPanel: P600, catalog,
  });
  // the unsuitable inverter is named, not swapped for a suitable catalog row
  assert.equal(a.inverter.replacementRequired, true);
  assert.equal(JSON.stringify(a).includes('"replacementComponentId"'), false);
  assert.equal(a.quantitiesProduced.length, 0);
});

test('the whole assessment is frozen and reports its missing inputs by name', () => {
  const a = U.assessUpgrade({ scenario: U.SCENARIO.FUTURE_READY, fromKw: 3, toKw: 6, catalog });
  assert.equal(Object.isFrozen(a), true);
  assert.throws(() => { a.status = 'RESOLVED'; }, TypeError);
  assert.ok(a.missingInputs.length > 0);
  for (const m of a.missingInputs) assert.ok(Object.values(U.MISSING_INPUT).includes(m) || typeof m === 'string');
});

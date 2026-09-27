// DECISION C10 — CLOSURE (locked with the Project Head, 2026-08-16).
//
// Regression tests for the behaviour locked at closure, on top of the earlier
// C10 suite (which is untouched):
//   panel RETAIN/REPLACE from Sales screening · zero pricing impact on removed
//   customer property · four-state DC/AC with the manufacturer specification as
//   a hard ceiling · electrically-judged target panel configuration · preliminary
//   Sales allowances (30 m DC cable, 3 MC4 pairs per new string, automatic
//   three-phase conversion items) · RETAIN/REPLACE/ADD/ENGINEERING_REVIEW
//   dispositions · no negative quantity · 3_6 / 3_8 still unresolved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as U from '../src/lib/upgradeAssessment.js';
import { ROLE } from '../src/lib/rbac.js';

const SRC = readFileSync('src/lib/upgradeAssessment.js', 'utf8');
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const item = (cat, id) => catalog.categories[cat].items.find(i => i.id === id);

const AT = '2026-08-16T00:00:00Z';
const SALES = { userId: 's1', role: ROLE.SALES };
const PH = { userId: 'ph1', role: ROLE.PROJECT_HEAD };

const P550 = item('panel', 'p2');        // 550 W
const P600 = item('panel', 'p5');        // 600 W
const INV3 = item('inverter', 'i1');     // 3 kW 1P
const INV6_3P = item('inverter', 'i5');  // 6 kW 3P, 2 MPPT

// A 300 W class panel does not exist in the catalog — an existing customer plant
// predates it. Declared here as EXISTING-SYSTEM data, not as a catalog record.
const OLD_P300 = { id: 'EXISTING-300W', watt: 300, voc: 45, isc: 8.9 };

// Neither the manufacturer DC/AC maximum nor a Flarize preferred range exists in
// the catalog. Both are supplied explicitly as test data where a test needs them.
const MFR_MAX = 1.5;
const PREFERRED = { minRatio: 1.0, maxRatio: 1.2, version: 'TEST-ONLY' };
const FREE_MPPT = [{ mppt: 1, stringsUsed: 1 }, { mppt: 2, stringsUsed: 0 }];

/** A REPLACE-panel assessment, used to prove nothing monetary is emitted. */
function fullAssessmentForRemoval() {
  return U.assessUpgrade({
    scenario: U.SCENARIO.EXISTING_SYSTEM, fromKw: 3, toKw: 6, requestedPhase: '3P',
    existingInverter: INV6_3P, existingPanel: OLD_P300, existingPanelCount: 10,
    panelHealthScreening: U.PANEL_HEALTH.POOR, targetPanel: P550, targetPanelCount: 12,
    manufacturerMaxDcAc: MFR_MAX, dcAcPolicy: PREFERRED, mpptUtilisation: FREE_MPPT,
    existingStructureAdequate: true, newStrings: 1, catalog,
  });
}

// ---------------------------------------------------------------------------
// §6 — DC/AC is four-state and the manufacturer ceiling is hard
// ---------------------------------------------------------------------------

test('DC/AC VALID: within the manufacturer maximum and within the preferred range', () => {
  const r = U.assessDcAcRatio({ panel: P550, panelCount: 12, inverter: INV6_3P, policy: PREFERRED, manufacturerMaxDcAc: MFR_MAX });
  assert.equal(r.ratio, 1.1);
  assert.equal(r.dcAcStatus, U.DCAC_STATUS.VALID);
  assert.equal(r.check.status, U.CHECK.PASS);
});

test('DC/AC WARNING: the manufacturer permits it but it is outside the preferred range', () => {
  const r = U.assessDcAcRatio({ panel: P550, panelCount: 15, inverter: INV6_3P, policy: PREFERRED, manufacturerMaxDcAc: MFR_MAX });
  assert.equal(r.ratio, 1.375);
  assert.equal(r.dcAcStatus, U.DCAC_STATUS.WARNING);
  assert.equal(r.check.status, U.CHECK.WARNING);
  assert.equal(r.check.id, U.FINDING.DCAC_OUTSIDE_PREFERRED);
});

test('DC/AC BLOCKED: the preferred range can never raise the manufacturer ceiling', () => {
  const generous = { minRatio: 1.0, maxRatio: 3.0, version: 'TEST-ONLY' };
  const r = U.assessDcAcRatio({ panel: P550, panelCount: 20, inverter: INV6_3P, policy: generous, manufacturerMaxDcAc: MFR_MAX });
  assert.equal(r.ratio, 1.8333);
  assert.equal(r.dcAcStatus, U.DCAC_STATUS.BLOCKED);
  assert.equal(r.check.status, U.CHECK.FAIL);
  assert.equal(r.check.id, U.FINDING.DCAC_EXCEEDS_MANUFACTURER);
  assert.equal(r.manufacturerMaxDcAc, MFR_MAX);
});

test('DC/AC UNRESOLVED when the manufacturer limit is unavailable — no number is invented', () => {
  const r = U.assessDcAcRatio({ panel: P550, panelCount: 12, inverter: INV6_3P });
  assert.equal(r.dcAcStatus, U.DCAC_STATUS.UNRESOLVED);
  assert.equal(r.check.status, U.CHECK.UNRESOLVED);
  assert.equal(r.check.detail.manufacturerLimitAvailable, false);
  assert.equal(JSON.stringify(r).includes('"maxRatio"'), false);
});

test('a manufacturer maximum on the inverter record is honoured without a preferred range', () => {
  const inv = { ...INV6_3P, maxDcAcRatio: 1.5 };
  const r = U.assessDcAcRatio({ panel: P550, panelCount: 12, inverter: inv });
  assert.equal(r.dcAcStatus, U.DCAC_STATUS.VALID);
  assert.equal(r.manufacturerMaxDcAc, 1.5);
});

// ---------------------------------------------------------------------------
// §3 — existing panels
// ---------------------------------------------------------------------------

test('healthy 550 W panels are retained; no second health questionnaire is asked', () => {
  const d = U.assessExistingPanels({ existingPanel: P550, existingPanelCount: 6, healthScreening: U.PANEL_HEALTH.HEALTHY });
  assert.equal(d.disposition, U.DISPOSITION.RETAIN);
  assert.equal(d.quantity, 6);
  assert.equal(d.checks[0].id, U.FINDING.PANEL_RETAINED);
  assert.equal(/questionnaire|please confirm|do you/i.test(JSON.stringify(d)), false);
});

test('a 300 W class panel is replaced even when screened healthy', () => {
  const d = U.assessExistingPanels({ existingPanel: OLD_P300, existingPanelCount: 10, healthScreening: U.PANEL_HEALTH.HEALTHY });
  assert.equal(d.disposition, U.DISPOSITION.REPLACE);
  assert.ok(d.checks[0].message.includes(String(U.PANEL_RETENTION_MIN_WATT)));
});

test('a POOR screening replaces the panels regardless of wattage', () => {
  const d = U.assessExistingPanels({ existingPanel: P550, existingPanelCount: 6, healthScreening: U.PANEL_HEALTH.POOR });
  assert.equal(d.disposition, U.DISPOSITION.REPLACE);
});

test('a declared space/string/MPPT constraint forces replacement', () => {
  const d = U.assessExistingPanels({
    existingPanel: P550, existingPanelCount: 6,
    healthScreening: U.PANEL_HEALTH.HEALTHY, constraintForcesReplacement: true,
  });
  assert.equal(d.disposition, U.DISPOSITION.REPLACE);
  assert.equal(d.checks[0].detail.constraint, true);
});

test('no screening result means ENGINEERING_REVIEW — a result is never assumed', () => {
  const d = U.assessExistingPanels({ existingPanel: P550, existingPanelCount: 6 });
  assert.equal(d.disposition, U.DISPOSITION.ENGINEERING_REVIEW);
  assert.equal(d.checks[0].id, U.FINDING.PANEL_HEALTH_NOT_SCREENED);
  assert.ok(d.checks[0].detail.missingInputs.includes(U.MISSING_INPUT.PANEL_HEALTH_SCREENING));
});

test('removed panels stay customer property — zero pricing impact, no buyback, no negative quantity', () => {
  const d = U.assessExistingPanels({ existingPanel: OLD_P300, existingPanelCount: 10, healthScreening: U.PANEL_HEALTH.POOR });
  assert.equal(d.disposition, U.DISPOSITION.REPLACE);
  assert.equal(d.pricingImpact, 'NONE');
  assert.equal(d.removedPanelsOwnedByCustomer, true);
  assert.equal(d.buybackValue, null);
  assert.equal(d.tradeInValue, null);
  assert.ok(d.quantity > 0, 'the declared count, never a negative');
  // no buyback or trade-in VALUE is ever produced anywhere in the assessment
  const json = JSON.stringify(fullAssessmentForRemoval());
  assert.equal(/"(buyback|tradeIn)[A-Za-z]*":\s*-?\d/.test(json), false);
});

// ---------------------------------------------------------------------------
// §5 — target panel configuration is judged electrically
// ---------------------------------------------------------------------------

test('the proposed configuration is electrically permitted, not merely close on capacity', () => {
  const r = U.proposeTargetPanelConfiguration({
    targetKw: 6, panel: P550, inverter: INV6_3P, manufacturerMaxDcAc: MFR_MAX, policy: PREFERRED,
  });
  assert.ok(r.proposedPanelCount != null);
  assert.equal(r.proposed.electricallyPermitted, true);
  assert.equal(r.proposed.dcAcStatus, U.DCAC_STATUS.VALID);
  assert.equal(r.selectionRule, 'ELECTRICALLY_PERMITTED_FIRST_THEN_SMALLEST_CAPACITY_DEVIATION');
  // every candidate carries its own electrical verdict
  for (const c of r.candidates) assert.ok(Object.values(U.DCAC_STATUS).includes(c.dcAcStatus));
});

test('capacity deviation alone never selects — a blocked candidate is refused', () => {
  const tight = 0.5;   // manufacturer maximum so low that nothing qualifies
  const r = U.proposeTargetPanelConfiguration({
    targetKw: 6, panel: P600, inverter: INV6_3P, manufacturerMaxDcAc: tight, policy: PREFERRED, searchWidth: 1,
  });
  assert.equal(r.proposedPanelCount, null);
  assert.equal(r.checks[0].status, U.CHECK.UNRESOLVED);
  assert.ok(r.candidates.some(c => c.dcAcStatus === U.DCAC_STATUS.BLOCKED));
});

test('with no manufacturer limit nothing is proposed', () => {
  const r = U.proposeTargetPanelConfiguration({ targetKw: 6, panel: P550, inverter: INV6_3P });
  assert.equal(r.proposedPanelCount, null);
  assert.ok(r.checks[0].detail.missingInputs.includes(U.MISSING_INPUT.MANUFACTURER_DCAC_LIMIT));
});

// ---------------------------------------------------------------------------
// §8 — preliminary Sales allowances
// ---------------------------------------------------------------------------

test('DC cable allowance is 30 m total, 15 m positive + 15 m negative, marked estimated', () => {
  const p = U.buildPreliminaryUpgradeItems({ fromKw: 3, toKw: 6, newStrings: 1 });
  const dc = p.items.find(i => i.role === 'DC_CABLE');
  assert.equal(dc.quantity, 30);
  assert.equal(dc.breakdown.positiveM, 15);
  assert.equal(dc.breakdown.negativeM, 15);
  assert.equal(dc.estimated, true);
  assert.equal(dc.adjustableByProjectHead, true);
  assert.equal(dc.basis, U.ITEM_BASIS.PRELIMINARY_ALLOWANCE);
});

test('MC4 allowance is 3 pairs per new string, and absent when strings are undeclared', () => {
  const two = U.buildPreliminaryUpgradeItems({ fromKw: 3, toKw: 6, newStrings: 2 });
  assert.equal(two.items.find(i => i.role === 'MC4_CONNECTOR').quantity, 6);
  const none = U.buildPreliminaryUpgradeItems({ fromKw: 3, toKw: 6 });
  const mc4 = none.items.find(i => i.role === 'MC4_CONNECTOR');
  assert.equal(mc4.quantity, null, 'undeclared strings never become zero pairs');
  assert.equal(mc4.basis, U.ITEM_BASIS.QUANTITY_NOT_DECIDED);
});

test('3→6 automatically lists the three-phase conversion items, with no invented quantity', () => {
  const p = U.buildPreliminaryUpgradeItems({ fromKw: 3, toKw: 6, newStrings: 1 });
  assert.equal(p.threePhaseConversion, true);
  for (const role of ['ACDB_3P', 'AC_PROTECTION_ISOLATOR', 'AC_CABLE', 'METER_KSEB_CONVERSION']) {
    const it = p.items.find(i => i.role === role);
    assert.ok(it, `${role} must appear automatically`);
    assert.equal(it.quantity, null, `${role} quantity is not decided and is never 0`);
    assert.equal(it.basis, U.ITEM_BASIS.QUANTITY_NOT_DECIDED);
  }
  assert.ok(p.checks.some(c => c.id === U.FINDING.AC_SIDE_QUANTITY_NOT_DECIDED && c.status === U.CHECK.UNRESOLVED));
});

test('a 5 kW upgrade gets no three-phase conversion items', () => {
  const p = U.buildPreliminaryUpgradeItems({ fromKw: 3, toKw: 5, newStrings: 1 });
  assert.equal(p.threePhaseConversion, false);
  assert.equal(p.items.some(i => i.threePhaseConversion), false);
});

test('C10 produces no price, rate or cost head of its own', () => {
  const p = U.buildPreliminaryUpgradeItems({ fromKw: 3, toKw: 6, newStrings: 1 });
  assert.ok(/Cost Engine/.test(p.pricingNote));
  assert.equal(/price|rate|margin|₹/i.test(JSON.stringify(p.items)), false);
  assert.equal(/roundMoney|sellingPrice|gstRate|marginPct/.test(SRC), false);
});

// ---------------------------------------------------------------------------
// §9 — dispositions
// ---------------------------------------------------------------------------

function fullAssessment(over = {}) {
  return U.assessUpgrade({
    scenario: U.SCENARIO.EXISTING_SYSTEM, fromKw: 3, toKw: 6, requestedPhase: '3P',
    existingInverter: INV6_3P, existingPanel: P550, existingPanelCount: 6,
    panelHealthScreening: U.PANEL_HEALTH.HEALTHY, targetPanel: P550, targetPanelCount: 12,
    manufacturerMaxDcAc: MFR_MAX, dcAcPolicy: PREFERRED, mpptUtilisation: FREE_MPPT,
    existingStructureAdequate: true, newStrings: 1, catalog, ...over,
  });
}

test('every affected component resolves to RETAIN / REPLACE / ADD / ENGINEERING_REVIEW', () => {
  const a = fullAssessment();
  assert.ok(a.dispositions.length > 0);
  for (const d of a.dispositions) assert.ok(Object.values(U.DISPOSITION).includes(d.disposition), d.role);
  const inv = a.dispositions.find(d => d.role === 'INVERTER');
  assert.equal(inv.disposition, U.DISPOSITION.RETAIN);
  assert.equal(a.dispositions.find(d => d.role === 'STRUCTURE').disposition, U.DISPOSITION.RETAIN);
});

test('a failed inverter is REPLACE plus an ADD of the approved target, never a negative quantity', () => {
  const a = fullAssessment({ existingInverter: INV3, targetInverter: INV6_3P });
  const inv = a.dispositions.filter(d => d.role === 'INVERTER');
  assert.equal(inv[0].disposition, U.DISPOSITION.REPLACE);
  assert.equal(inv[0].componentId, 'i1');
  assert.equal(inv[0].pricingImpact, 'NONE');
  assert.equal(inv[1].disposition, U.DISPOSITION.ADD);
  assert.equal(inv[1].componentId, 'i5');
  assert.equal(inv[1].quantity, 1);
  for (const d of a.dispositions) assert.ok(d.quantity == null || Number(d.quantity) >= 0);
});

test('a failed inverter with no approved target goes to ENGINEERING_REVIEW, not to a chosen component', () => {
  const a = fullAssessment({ existingInverter: INV3 });
  const add = a.dispositions.filter(d => d.role === 'INVERTER')[1];
  assert.equal(add.disposition, U.DISPOSITION.ENGINEERING_REVIEW);
  assert.equal(add.componentId, null);
  assert.equal(add.quantity, null);
  assert.ok(a.missingInputs.includes(U.MISSING_INPUT.APPROVED_TARGET_INVERTER));
});

test('additional structure appears as ADD with no quantity', () => {
  const a = fullAssessment({ existingStructureAdequate: false });
  const st = a.dispositions.find(d => d.role === 'STRUCTURE');
  assert.equal(st.disposition, U.DISPOSITION.ADD);
  assert.equal(st.quantity, null);
  assert.equal(st.basis, U.ITEM_BASIS.QUANTITY_NOT_DECIDED);
});

test('unknown structure adequacy goes to ENGINEERING_REVIEW', () => {
  const a = fullAssessment({ existingStructureAdequate: null });
  assert.equal(a.dispositions.find(d => d.role === 'STRUCTURE').disposition, U.DISPOSITION.ENGINEERING_REVIEW);
  assert.equal(a.routeToEngineering, true);
});

test('preliminary allowance lines appear among the dispositions, marked estimated', () => {
  const a = fullAssessment();
  const dc = a.dispositions.find(d => d.role === 'DC_CABLE');
  assert.equal(dc.disposition, U.DISPOSITION.ADD);
  assert.equal(dc.quantity, 30);
  assert.equal(dc.estimated, true);
  assert.equal(dc.adjustableByProjectHead, true);
  const acdb = a.dispositions.find(d => d.role === 'ACDB_3P');
  assert.equal(acdb.disposition, U.DISPOSITION.ENGINEERING_REVIEW);
  assert.equal(acdb.quantity, null);
});

test('no disposition ever carries a negative quantity', () => {
  for (const over of [{}, { existingInverter: INV3, targetInverter: INV6_3P },
    { existingPanel: OLD_P300, panelHealthScreening: U.PANEL_HEALTH.POOR },
    { existingStructureAdequate: false }]) {
    for (const d of fullAssessment(over).dispositions) {
      assert.ok(d.quantity == null || Number(d.quantity) >= 0, `${d.role} ${d.quantity}`);
    }
  }
});

// ---------------------------------------------------------------------------
// §10 — 3_6 / 3_8 remain unresolved at closure
// ---------------------------------------------------------------------------

test('closure does not fabricate 3_6 or 3_8 fixed items', () => {
  const a = fullAssessment();
  assert.equal(a.fixedItems.resolved, false);
  assert.deepEqual([...a.fixedItems.items], []);
  assert.deepEqual([...a.fixedItems.definedPathKeys], ['3_5', '5_10', '5_8', '8_10']);
  assert.ok(a.missingInputs.includes(U.MISSING_INPUT.UPGRADE_FIXED_ITEM_QUANTITIES));
  assert.equal(a.routeToEngineering, true);
  // the 3_5 quantities did not leak into the 3_6 assessment
  const authored = catalog.bomTemplates.upgrade.fixedItems.find(i => i.itemId === 'mc4_1').qty['3_5'];
  assert.equal(a.dispositions.some(d => d.componentId === 'mc4_1' && d.quantity === authored), false);
});

// ---------------------------------------------------------------------------
// §11 — approval path unchanged, existing RBAC only
// ---------------------------------------------------------------------------

test('Sales creates the preliminary request; Project Head approval is authoritative', () => {
  const store = U.createUpgradeRequestStore();
  const assessment = fullAssessment();
  U.submitUpgradeRequest(store, SALES, { requestId: 'UR-C10', assessment, at: AT });
  const approved = U.approveUpgradeRequest(store, PH, 'UR-C10', {
    at: AT, reason: 'Verified on site.',
    configuration: { lines: [{ componentId: 'p2', quantity: 6 }, { componentId: 'a4', quantity: 1 }] },
  });
  assert.equal(approved.approvedConfiguration.authoritative, true);
  assert.deepEqual([...approved.approvedConfiguration.authoritativeFor], ['PROJECT_BOM', 'COST', 'QUOTATION']);
  // no new role, no new capability
  assert.equal(/CAPABILITY\.[A-Z_]*UPGRADE|ROLE\.[A-Z_]*UPGRADE|new Role/.test(SRC), false);
});

// ---------------------------------------------------------------------------
// §12 — discipline
// ---------------------------------------------------------------------------

test('closure adds no clock, no randomness and no invented numeric limit', () => {
  assert.equal(/Date\.now|new Date|Math\.random/.test(SRC), false);
  // the only numeric constants are the ones the decision states
  assert.equal(U.PANEL_RETENTION_MIN_WATT, 500);
  assert.deepEqual({ ...U.PRELIMINARY_ALLOWANCE },
    { DC_CABLE_TOTAL_M: 30, DC_CABLE_POSITIVE_M: 15, DC_CABLE_NEGATIVE_M: 15, MC4_PAIRS_PER_NEW_STRING: 3 });
  assert.equal(U.SINGLE_PHASE_MAX_KW, 5);
  // no default DC/AC limit exists anywhere
  assert.equal(/DEFAULT_DCAC|defaultRatio|DCAC_DEFAULT/.test(SRC), false);
});

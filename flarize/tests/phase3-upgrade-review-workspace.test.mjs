// C10 — PROJECT HEAD UPGRADE REVIEW WORKSPACE.
//
// The review layer must add NO engineering of its own: every verdict, ratio,
// disposition and allowance on the panel has to come from upgradeAssessment.js.
// The load-bearing assertions are therefore negative — no second engine, no
// invented quantity, no zero placeholder, no negative quantity, no pricing on
// removed customer property, and no approval while anything is unresolved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as R from '../src/lib/upgradeReviewWorkspace.js';
import * as U from '../src/lib/upgradeAssessment.js';
import { ROLE, RbacError } from '../src/lib/rbac.js';

const SRC = readFileSync('src/lib/upgradeReviewWorkspace.js', 'utf8');
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const item = (cat, id) => catalog.categories[cat].items.find(i => i.id === id);

const AT = '2026-08-16T00:00:00Z';
const AT2 = '2026-08-17T00:00:00Z';

const SALES = { userId: 's1', role: ROLE.SALES };
const PH = { userId: 'ph1', role: ROLE.PROJECT_HEAD };
const ENGR = { userId: 'e1', role: ROLE.ENGINEERING };
const PROC = { userId: 'pr1', role: ROLE.PROCUREMENT };

const P550 = item('panel', 'p2');        // 550 W
const P600 = item('panel', 'p5');        // 600 W
const INV3 = item('inverter', 'i1');     // 3 kW 1P
const INV6_3P = item('inverter', 'i5');  // 6 kW 3P, 2 MPPT
const OLD_P300 = { id: 'EXISTING-300W', watt: 300, voc: 45, isc: 8.9 };

// Neither figure exists in the catalog; both are supplied as test data.
const MFR_MAX = 1.5;
const PREFERRED = { minRatio: 1.0, maxRatio: 1.2, version: 'TEST-ONLY' };
const FREE_MPPT = [{ mppt: 1, stringsUsed: 1 }, { mppt: 2, stringsUsed: 0 }];

function submitted(over = {}, requestId = 'UR-1') {
  const store = R.createUpgradeReviewStore();
  R.submitUpgradeReview(store, {
    actor: SALES, requestId, projectId: 'PRJ-1', at: AT,
    scenario: R.SCENARIO.EXISTING_SYSTEM, fromKw: 3, toKw: 6, requestedPhase: '3P',
    existingInverter: INV6_3P, existingPanel: P550, existingPanelCount: 6,
    panelHealthScreening: R.PANEL_HEALTH.HEALTHY,
    targetPanel: P550, targetPanelCount: 12,
    existingStructureAdequate: true, mpptUtilisation: FREE_MPPT,
    newStrings: 1, dcAcPolicy: PREFERRED, manufacturerMaxDcAc: MFR_MAX, catalog,
    ...over,
  });
  return store;
}

const panelOf = (store, requestId = 'UR-1', actor = PH) => R.reviewPanel(store, { actor, requestId });

/** Resolve every outstanding item so an approval can be tested. */
function resolveAll(store, requestId = 'UR-1', actor = PH) {
  const p = panelOf(store, requestId, actor);
  if (!p.approvalBlockers.length) return [];
  const adjustments = p.approvalBlockers.map((b, i) => ({
    role: b.role, componentId: b.componentId,
    quantity: i + 1, reason: 'Verified on site.',
  }));
  R.setReviewAdjustment(store, { actor, requestId, adjustments, at: AT2 });
  return adjustments;
}

// ---------------------------------------------------------------------------
// 1. no second engineering engine
// ---------------------------------------------------------------------------

test('the review layer imports only the C10 assessment and RBAC', () => {
  const imports = [...SRC.matchAll(/^import[^;]*?from\s+'([^']+)'/gm)].map(m => m[1]).sort();
  assert.deepEqual(imports, ['./rbac.js', './upgradeAssessment.js']);
  for (const f of ['costEngine', 'pricingEngine', 'engineeringChecker', 'projectBom', 'bomLock', 'money.js']) {
    assert.equal(SRC.includes(`/${f}`), false, `must not import ${f}`);
  }
});

test('it recomputes no ratio, no string and no disposition of its own', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/\bMath\.|watt\s*\*|\/\s*1000|dcWatt\s*=/.test(code), false);
  assert.equal(/assessDcAcRatio\(|assessMpptAvailability\(|assessInverterRetention\(|proposeTargetPanelConfiguration\(/.test(code), false);
  // exactly one call into the engineering module — the submission
  assert.equal((code.match(/assessUpgrade\(/g) || []).length, 1);
});

test('no clock and no randomness', () => {
  assert.equal(/Date\.now|new Date|Math\.random/.test(SRC), false);
});

test('no new role and no new capability', () => {
  assert.equal(/CAPABILITY\s*=|ROLE\s*=|CAPABILITY_MATRIX|UPGRADE_APPROVE/.test(SRC), false);
  assert.equal(/CAPABILITY\.(BOM_VIEW)/.test(SRC), true);
});

// ---------------------------------------------------------------------------
// 2. submission + RBAC
// ---------------------------------------------------------------------------

test('Sales submits and the C10 assessment runs on submission', () => {
  const store = submitted();
  const r = U.getUpgradeRequest(store, SALES, 'UR-1');
  assert.equal(r.status, R.REQUEST_STATUS.SUBMITTED);
  assert.equal(r.submittedByRole, ROLE.SALES);
  assert.equal(r.assessment.scenario, R.SCENARIO.EXISTING_SYSTEM);
  assert.equal(r.existingSystem.panelHealthScreening, R.PANEL_HEALTH.HEALTHY);
});

test('a caller-supplied `at` is mandatory', () => {
  const store = R.createUpgradeReviewStore();
  assert.throws(() => R.submitUpgradeReview(store, {
    actor: SALES, requestId: 'UR-X', scenario: R.SCENARIO.EXISTING_SYSTEM, fromKw: 3, toKw: 6, catalog,
  }), e => e.code === R.REVIEW_ERROR.MISSING_TIMESTAMP);
});

test('Sales may read the panel but may not adjust or approve', () => {
  const store = submitted();
  assert.doesNotThrow(() => panelOf(store, 'UR-1', SALES));
  assert.throws(() => R.setReviewAdjustment(store, { actor: SALES, requestId: 'UR-1', adjustments: [], at: AT2 }),
    e => e.code === R.REVIEW_ERROR.NOT_A_REVIEWER);
  assert.throws(() => R.approveUpgradeConfiguration(store, { actor: SALES, requestId: 'UR-1', at: AT2 }),
    e => e.code === R.REVIEW_ERROR.NOT_A_REVIEWER);
});

test('Procurement cannot review; Project Head and Engineering can', () => {
  const store = submitted();
  assert.throws(() => R.setReviewAdjustment(store, { actor: PROC, requestId: 'UR-1', adjustments: [], at: AT2 }),
    e => e.code === R.REVIEW_ERROR.NOT_A_REVIEWER || e instanceof RbacError);
  assert.doesNotThrow(() => R.addEngineeringRemark(store, { actor: PH, requestId: 'UR-1', remark: 'ok', at: AT2 }));
  assert.doesNotThrow(() => R.addEngineeringRemark(store, { actor: ENGR, requestId: 'UR-1', remark: 'ok', at: AT2 }));
});

// ---------------------------------------------------------------------------
// 3. the review panel shows everything the Project Head must see
// ---------------------------------------------------------------------------

test('the panel shows the existing system and the requested target', () => {
  const p = panelOf(submitted());
  assert.equal(p.existingSystem.inverterId, 'i5');
  assert.equal(p.existingSystem.panelId, 'p2');
  assert.equal(p.existingSystem.panelCount, 6);
  assert.equal(p.requestedTarget.fromKw, 3);
  assert.equal(p.requestedTarget.toKw, 6);
  assert.equal(p.requestedTarget.upgradePathId, 'UPG-3-6');
  assert.equal(p.requestedTarget.approvedPath, true);
});

test('the panel shows the inverter verdict and disposition from the assessment', () => {
  const p = panelOf(submitted());
  assert.equal(p.inverter.existingComponentId, 'i5');
  assert.equal(p.inverter.retain, true);
  assert.equal(p.inverter.disposition, R.DISPOSITION.RETAIN);
  assert.ok(p.inverter.checks.length > 0);

  const replace = panelOf(submitted({ existingInverter: INV3, targetInverter: INV6_3P }, 'UR-R'), 'UR-R');
  assert.equal(replace.inverter.disposition, R.DISPOSITION.REPLACE);
  assert.equal(replace.inverter.proposedComponentId, 'i5');
  assert.equal(replace.inverter.proposedQuantity, 1);
  assert.equal(replace.inverter.pricingImpactOfRemoval, 'NONE');
});

test('a replacement with no approved target inverter shows ENGINEERING_REVIEW, not a chosen component', () => {
  const p = panelOf(submitted({ existingInverter: INV3 }, 'UR-N'), 'UR-N');
  assert.equal(p.inverter.proposedDisposition, R.DISPOSITION.ENGINEERING_REVIEW);
  assert.equal(p.inverter.proposedComponentId, null);
  assert.ok(p.missingInputs.includes(U.MISSING_INPUT.APPROVED_TARGET_INVERTER));
});

test('the panel shows panel disposition, the Sales screening and zero pricing impact on removals', () => {
  const p = panelOf(submitted());
  assert.equal(p.panels.existingDisposition, R.DISPOSITION.RETAIN);
  assert.equal(p.panels.healthScreening, R.PANEL_HEALTH.HEALTHY);
  assert.equal(p.panels.healthScreeningSource, 'SALES_SCREENING');
  assert.equal(p.panels.retentionBoundaryWatt, 500);

  const old = panelOf(submitted({ existingPanel: OLD_P300, existingPanelCount: 10, panelHealthScreening: R.PANEL_HEALTH.POOR }, 'UR-O'), 'UR-O');
  assert.equal(old.panels.existingDisposition, R.DISPOSITION.REPLACE);
  assert.equal(old.panels.pricingImpactOfRemoval, 'NONE');
  assert.equal(old.panels.removedPanelsOwnedByCustomer, true);
  assert.equal(old.panels.buybackValue, null);
  assert.equal(old.panels.tradeInValue, null);
});

test('the panel shows DC capacity, AC capacity, DC/AC ratio and its status', () => {
  const p = panelOf(submitted());
  assert.equal(typeof p.targetConfiguration.dcAcRatio, 'number');
  assert.ok(Object.values(R.DCAC_STATUS).includes(p.targetConfiguration.dcAcStatus));
  assert.equal(p.targetConfiguration.acInverterCapacityKw, 6);
  assert.ok(p.targetConfiguration.proposedPanelCount != null);
  assert.ok(p.targetConfiguration.dcCapacityWatt > 0);
  assert.ok(p.targetConfiguration.candidates.length > 0);
});

test('with no manufacturer limit the DC/AC status is UNRESOLVED, never a guessed pass', () => {
  const p = panelOf(submitted({ manufacturerMaxDcAc: null, dcAcPolicy: null }, 'UR-U'), 'UR-U');
  assert.equal(p.targetConfiguration.dcAcStatus, R.DCAC_STATUS.UNRESOLVED);
  assert.equal(p.targetConfiguration.proposedPanelCount, null);
  assert.ok(p.missingInputs.includes(U.MISSING_INPUT.DC_AC_RATIO_POLICY));
});

test('the panel shows the MPPT/string review and the phase requirement', () => {
  const p = panelOf(submitted());
  assert.equal(p.mpptStringReview.freeMppts, 1);
  assert.ok(Array.isArray(p.mpptStringReview.declaredUtilisation));
  assert.equal(p.phaseRequirement.requiredPhase, '3P');
  assert.equal(p.phaseRequirement.singlePhaseMaxKw, 5);
  assert.deepEqual([...p.phaseRequirement.acSideItems], ['ACDB', 'AC_CABLE', 'AC_ISOLATOR', 'METER', 'KSEB_CONNECTION']);
});

test('a mixed 550 W → 600 W addition is surfaced, never silently placed in one string', () => {
  const p = panelOf(submitted({ targetPanel: P600 }, 'UR-M'), 'UR-M');
  assert.equal(p.mpptStringReview.sameStringPermitted, false);
  assert.equal(p.mpptStringReview.separateMpptRequired, true);
  assert.ok(p.blockedFindings.some(c => c.id === U.FINDING.MIXED_PANEL_SAME_STRING_FORBIDDEN));
});

test('the panel shows structure disposition without inventing a quantity', () => {
  assert.equal(panelOf(submitted()).structure.disposition, R.DISPOSITION.RETAIN);
  const add = panelOf(submitted({ existingStructureAdequate: false }, 'UR-S'), 'UR-S');
  assert.equal(add.structure.disposition, R.DISPOSITION.ADD);
  assert.equal(add.structure.quantity, null);
  const unknown = panelOf(submitted({ existingStructureAdequate: null }, 'UR-SU'), 'UR-SU');
  assert.equal(unknown.structure.disposition, R.DISPOSITION.ENGINEERING_REVIEW);
});

test('the panel shows the preliminary allowances, marked estimated and adjustable', () => {
  const p = panelOf(submitted());
  assert.equal(p.preliminaryAllowances.dcCable.totalM, 30);
  assert.equal(p.preliminaryAllowances.dcCable.positiveM, 15);
  assert.equal(p.preliminaryAllowances.dcCable.negativeM, 15);
  assert.equal(p.preliminaryAllowances.dcCable.adjustableByProjectHead, true);
  assert.equal(p.preliminaryAllowances.mc4.pairsPerNewString, 3);
  assert.equal(p.preliminaryAllowances.mc4.quantity, 3);   // one new string
  assert.equal(p.preliminaryAllowances.threePhaseConversion, true);
});

test('3→6 additional materials stay unresolved — nothing from 3→5, nothing fabricated', () => {
  const p = panelOf(submitted());
  assert.equal(p.additionalMaterials.pathKey, '3_6');
  assert.equal(p.additionalMaterials.resolved, false);
  assert.deepEqual([...p.additionalMaterials.items], []);
  assert.deepEqual([...p.additionalMaterials.definedPathKeys], ['3_5', '5_10', '5_8', '8_10']);
  assert.ok(p.missingInputs.includes(U.MISSING_INPUT.UPGRADE_FIXED_ITEM_QUANTITIES));
});

test('the panel lists engineering warnings, blockers and unresolved items', () => {
  const p = panelOf(submitted());
  assert.ok(Array.isArray(p.engineeringWarnings));
  assert.ok(Array.isArray(p.blockedFindings));
  assert.ok(p.unresolvedItems.length > 0);
  for (const u of p.unresolvedItems) assert.ok(u.role);
  assert.ok(p.approvalBlockers.length > 0);
  assert.equal(p.approvedBom, null);
});

test('the panel is deep-frozen', () => {
  const p = panelOf(submitted());
  assert.equal(Object.isFrozen(p), true);
  assert.throws(() => { p.requestStatus = 'APPROVED'; }, TypeError);
});

// ---------------------------------------------------------------------------
// 4. Project Head adjustments
// ---------------------------------------------------------------------------

test('the Project Head can supply a quantity for an unresolved item, with an audit trail', () => {
  const store = submitted({ existingStructureAdequate: false }, 'UR-A');
  R.setReviewAdjustment(store, {
    actor: PH, requestId: 'UR-A', at: AT2,
    adjustments: [{ role: 'STRUCTURE', quantity: 4, reason: 'Two extra rows measured on site.' }],
  });
  const p = panelOf(store, 'UR-A');
  const adj = p.adjustments[0];
  assert.equal(adj.role, 'STRUCTURE');
  assert.equal(adj.quantity, 4);
  assert.equal(adj.previousQuantity, null);
  assert.equal(adj.basis, 'PROJECT_HEAD_DECISION');
  assert.equal(adj.by, 'ph1');
  assert.equal(adj.at, AT2);
  assert.equal(adj.reason, 'Two extra rows measured on site.');
  assert.equal(p.structure.adjustedQuantity, 4);
});

test('a preliminary allowance is adjustable and records what it replaced', () => {
  const store = submitted();
  R.setReviewAdjustment(store, {
    actor: PH, requestId: 'UR-1', at: AT2,
    adjustments: [{ role: 'DC_CABLE', quantity: 46, unit: 'm', reason: 'Measured run.' }],
  });
  const adj = panelOf(store).adjustments.find(a => a.role === 'DC_CABLE');
  assert.equal(adj.quantity, 46);
  assert.equal(adj.previousQuantity, 30);
});

test('a resolved engineering verdict is not adjustable here', () => {
  const store = submitted();
  assert.throws(() => R.setReviewAdjustment(store, {
    actor: PH, requestId: 'UR-1', at: AT2,
    adjustments: [{ role: 'INVERTER', componentId: 'i5', quantity: 2 }],
  }), e => e.code === R.REVIEW_ERROR.ADJUSTMENT_NOT_PERMITTED);
});

test('an adjustment needs an explicit non-negative quantity — a blank is never zero', () => {
  const store = submitted({ existingStructureAdequate: false }, 'UR-B');
  for (const bad of [{ role: 'STRUCTURE' }, { role: 'STRUCTURE', quantity: null }, { role: 'STRUCTURE', quantity: -1 }]) {
    assert.throws(() => R.setReviewAdjustment(store, { actor: PH, requestId: 'UR-B', at: AT2, adjustments: [bad] }),
      e => e.code === R.REVIEW_ERROR.ADJUSTMENT_INVALID);
  }
});

test('engineering remarks are append-only and attributed', () => {
  const store = submitted();
  R.addEngineeringRemark(store, { actor: PH, requestId: 'UR-1', remark: 'Roof survey pending.', at: AT2 });
  R.addEngineeringRemark(store, { actor: ENGR, requestId: 'UR-1', remark: 'Separate MPPT approved.', at: AT2 });
  const remarks = panelOf(store).engineeringRemarks;
  assert.equal(remarks.length, 2);
  assert.equal(remarks[0].by, 'ph1');
  assert.equal(remarks[1].byRole, ROLE.ENGINEERING);
});

// ---------------------------------------------------------------------------
// 5. approval
// ---------------------------------------------------------------------------

test('approval is refused while anything is unresolved, and nothing is defaulted to zero', () => {
  const store = submitted();
  assert.throws(() => R.approveUpgradeConfiguration(store, { actor: PH, requestId: 'UR-1', at: AT2 }),
    e => e.code === R.REVIEW_ERROR.UNRESOLVED_ITEMS_REMAIN && e.detail.blockers.length > 0);
  assert.equal(U.getUpgradeRequest(store, PH, 'UR-1').status, R.REQUEST_STATUS.SUBMITTED);
  assert.equal(panelOf(store).approvedBom, null);
});

test('once every item is decided the configuration approves and becomes authoritative', () => {
  const store = submitted();
  resolveAll(store);
  const approved = R.approveUpgradeConfiguration(store, { actor: PH, requestId: 'UR-1', at: AT2, remarks: 'Verified.' });

  assert.equal(approved.status, R.REQUEST_STATUS.APPROVED);
  const cfg = approved.approvedConfiguration;
  assert.equal(cfg.authoritative, true);
  assert.deepEqual([...cfg.authoritativeFor], ['PROJECT_BOM', 'COST', 'QUOTATION']);
  assert.equal(cfg.approvedByRole, ROLE.PROJECT_HEAD);
  assert.equal(cfg.approvedAt, AT2);
  assert.equal(cfg.upgradePathId, 'UPG-3-6');
  assert.ok(cfg.lines.length > 0);
});

test('the approved configuration is immutable and forbids recalculation by the quotation', () => {
  const store = submitted();
  resolveAll(store);
  const approved = R.approveUpgradeConfiguration(store, { actor: PH, requestId: 'UR-1', at: AT2 });
  assert.equal(Object.isFrozen(approved.approvedConfiguration), true);
  assert.throws(() => { approved.approvedConfiguration.lines[0].quantity = 99; }, TypeError);
  assert.equal(approved.approvedConfiguration.recalculationForbidden, true);
  assert.ok(/never recalculat|neither recalculates/i.test(approved.approvedConfiguration.recalculationNote));
  assert.throws(() => R.approveUpgradeConfiguration(store, { actor: PH, requestId: 'UR-1', at: AT2 }),
    e => e.code === R.REVIEW_ERROR.ALREADY_DECIDED || e.code === 'REQUEST_ALREADY_DECIDED');
});

test('every approved line carries an explicit quantity and its source', () => {
  const store = submitted();
  resolveAll(store);
  const cfg = R.approveUpgradeConfiguration(store, { actor: PH, requestId: 'UR-1', at: AT2 }).approvedConfiguration;
  for (const l of cfg.lines) {
    assert.ok(l.quantity != null, `${l.role} has no quantity`);
    assert.ok(Number(l.quantity) >= 0, `${l.role} is negative`);
    assert.ok(['PROJECT_HEAD_DECISION', 'C10_ASSESSMENT', U.ITEM_BASIS.PRELIMINARY_ALLOWANCE,
      U.ITEM_BASIS.CATALOG_APPROVED, U.ITEM_BASIS.QUANTITY_NOT_DECIDED,
      'ELECTRICALLY_PERMITTED_CONFIGURATION'].includes(l.quantitySource), l.quantitySource);
  }
  // adjusted items without a component id cannot be BOM lines yet — they stay on
  // allLines until Engineering names the component. Nothing is dropped silently.
  const adjusted = cfg.allLines.filter(l => l.adjustedByProjectHead);
  assert.ok(adjusted.length > 0);
  assert.equal(cfg.projectHeadAdjustments.length, adjusted.length);
  for (const l of adjusted) assert.equal(l.quantitySource, 'PROJECT_HEAD_DECISION');
});

test('retained items and removed customer property carry no price and no negative quantity', () => {
  const store = submitted({ existingPanel: OLD_P300, existingPanelCount: 10, panelHealthScreening: R.PANEL_HEALTH.POOR }, 'UR-P');
  resolveAll(store, 'UR-P');
  const cfg = R.approveUpgradeConfiguration(store, { actor: PH, requestId: 'UR-P', at: AT2 }).approvedConfiguration;
  const noPrice = cfg.allLines.filter(l => l.pricingImpact === 'NONE');
  assert.ok(noPrice.length > 0);
  for (const l of cfg.allLines) assert.ok(l.quantity == null || Number(l.quantity) >= 0);
  assert.equal(/"(price|cost|rate|margin|buyback|tradeIn)[A-Za-z]*":\s*-?\d/i.test(JSON.stringify(cfg)), false);
});

test('the approved configuration converts to project BOM lines, mapping only', () => {
  const store = submitted();
  resolveAll(store);
  R.approveUpgradeConfiguration(store, { actor: PH, requestId: 'UR-1', at: AT2 });
  const cfg = R.authoritativeUpgradeConfiguration(store, { actor: PH, requestId: 'UR-1' });
  const lines = R.toProjectBomLines(cfg);
  assert.ok(lines.length > 0);
  for (const l of lines) {
    assert.ok(l.componentId);
    assert.equal(l.source, 'C10_APPROVED_UPGRADE_CONFIGURATION');
    assert.equal(l.upgradePathId, 'UPG-3-6');
  }
  assert.equal(R.toProjectBomLines(null), null);
  assert.equal(R.toProjectBomLines({ lines: [] }), null, 'a non-authoritative object yields nothing');
});

test('a rejected review yields no authoritative configuration', () => {
  const store = submitted();
  R.rejectUpgradeReview(store, { actor: ENGR, requestId: 'UR-1', at: AT2, reason: 'Site survey first.' });
  assert.equal(U.getUpgradeRequest(store, PH, 'UR-1').status, R.REQUEST_STATUS.REJECTED);
  assert.equal(R.authoritativeUpgradeConfiguration(store, { actor: PH, requestId: 'UR-1' }), null);
});

test('an adjustment after a decision is refused', () => {
  const store = submitted();
  R.rejectUpgradeReview(store, { actor: PH, requestId: 'UR-1', at: AT2 });
  assert.throws(() => R.setReviewAdjustment(store, {
    actor: PH, requestId: 'UR-1', at: AT2, adjustments: [{ role: 'DC_CABLE', quantity: 40 }],
  }), e => e.code === R.REVIEW_ERROR.ALREADY_DECIDED);
});

test('an unknown request is not found rather than invented', () => {
  const store = submitted();
  assert.throws(() => panelOf(store, 'NOPE'), e => e.code === R.REVIEW_ERROR.REQUEST_NOT_FOUND);
});

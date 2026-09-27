// C10 — REGRESSION: an approved REPLACE must reach the PROJECT_BOM handoff.
//
// Defect: `toProjectBomLines()` filtered to ADD and RETAIN only, so a Project
// Head-approved REPLACE was silently dropped and the replacement inverter never
// reached the Project BOM.
//
// Fixed behaviour: a REPLACE line is paired with its ADD line and emitted once,
// carrying the NEW componentId and the approved quantity. The removed unit is
// never a BOM quantity, never negative and never priced. A REPLACE with no
// replacement component emits nothing — it is never fabricated, and approval
// blocks upstream while it is unresolved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as R from '../src/lib/upgradeReviewWorkspace.js';
import * as U from '../src/lib/upgradeAssessment.js';
import { ROLE } from '../src/lib/rbac.js';

const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const item = (cat, id) => catalog.categories[cat].items.find(i => i.id === id);

const AT = '2026-08-16T00:00:00Z';
const AT2 = '2026-08-17T00:00:00Z';
const SALES = { userId: 's1', role: ROLE.SALES };
const PH = { userId: 'ph1', role: ROLE.PROJECT_HEAD };

const P550 = item('panel', 'p2');        // 550 W
const INV3 = item('inverter', 'i1');     // existing 3 kW 1P
const INV6_3P = item('inverter', 'i5');  // replacement 6 kW 3P
const OLD_P300 = { id: 'EXISTING-300W', watt: 300, voc: 45, isc: 8.9 };

const MFR_MAX = 1.5;
const PREFERRED = { minRatio: 1.0, maxRatio: 1.2, version: 'TEST-ONLY' };
const FREE_MPPT = [{ mppt: 1, stringsUsed: 1 }, { mppt: 2, stringsUsed: 0 }];

function submit(store, requestId, over = {}) {
  R.submitUpgradeReview(store, {
    actor: SALES, requestId, projectId: 'PRJ-1', at: AT,
    scenario: R.SCENARIO.EXISTING_SYSTEM, fromKw: 3, toKw: 6, requestedPhase: '3P',
    existingInverter: INV3, existingPanel: P550, existingPanelCount: 6,
    panelHealthScreening: R.PANEL_HEALTH.HEALTHY,
    targetPanel: P550, targetPanelCount: 12, targetInverter: INV6_3P,
    existingStructureAdequate: true, mpptUtilisation: FREE_MPPT,
    newStrings: 1, dcAcPolicy: PREFERRED, manufacturerMaxDcAc: MFR_MAX, catalog,
    ...over,
  });
  return store;
}

/** Decide everything still outstanding so the approval can proceed. */
function resolveAll(store, requestId) {
  const blockers = R.reviewPanel(store, { actor: PH, requestId }).approvalBlockers;
  if (blockers.length) {
    R.setReviewAdjustment(store, {
      actor: PH, requestId, at: AT2,
      adjustments: blockers.map((b, i) => ({
        role: b.role, componentId: b.componentId, quantity: i + 1, reason: 'Verified on site.',
      })),
    });
  }
}

function approvedBom(requestId = 'UR-REP', over = {}) {
  const store = R.createUpgradeReviewStore();
  submit(store, requestId, over);
  resolveAll(store, requestId);
  R.approveUpgradeConfiguration(store, { actor: PH, requestId, at: AT2 });
  const cfg = R.authoritativeUpgradeConfiguration(store, { actor: PH, requestId });
  return { store, cfg, bom: R.toProjectBomLines(cfg) };
}

// ---------------------------------------------------------------------------
// 1–3. the replacement inverter reaches the Project BOM
// ---------------------------------------------------------------------------

test('an approved 3 kW → 6 kW inverter replacement reaches toProjectBomLines()', () => {
  const { bom } = approvedBom();
  const inv = bom.filter(l => l.role === 'INVERTER');
  assert.equal(inv.length, 1, 'exactly one inverter line — the pair is emitted once, not twice');
  assert.equal(inv[0].disposition, R.DISPOSITION.REPLACE);
  assert.equal(inv[0].source, 'C10_APPROVED_UPGRADE_CONFIGURATION');
  assert.equal(inv[0].upgradePathId, 'UPG-3-6');
});

test('the emitted component is the NEW inverter, and the old one is named as replaced', () => {
  const { bom } = approvedBom();
  const inv = bom.find(l => l.role === 'INVERTER');
  assert.equal(inv.componentId, 'i5', 'the replacement, not the removed unit');
  assert.equal(inv.replacesComponentId, 'i1');
  assert.equal(inv.quantity, 1, 'the approved quantity');
});

test('the removed inverter is never a BOM line, never negative and never priced', () => {
  const { bom } = approvedBom();
  assert.equal(bom.some(l => l.componentId === 'i1'), false, 'the removed unit is not a BOM line');
  for (const l of bom) assert.ok(l.quantity == null || Number(l.quantity) >= 0, `${l.role} ${l.quantity}`);
  const inv = bom.find(l => l.role === 'INVERTER');
  assert.equal(inv.removedUnitPricingImpact, 'NONE');
  assert.equal(/"(price|cost|rate|margin|buyback|tradeIn)[A-Za-z]*":\s*-?\d/i.test(JSON.stringify(bom)), false);
});

// ---------------------------------------------------------------------------
// 4. customer-owned removed panels
// ---------------------------------------------------------------------------

test('a customer-owned removed panel carries no pricing impact and no negative quantity', () => {
  const { cfg, bom } = approvedBom('UR-PAN', {
    existingPanel: OLD_P300, existingPanelCount: 10, panelHealthScreening: R.PANEL_HEALTH.POOR,
  });
  const removal = cfg.allLines.find(l => l.role === 'PANEL' && l.disposition === R.DISPOSITION.REPLACE);
  assert.ok(removal);
  assert.equal(removal.pricingImpact, 'NONE');
  assert.equal(removal.customerOwned, true);
  assert.ok(Number(removal.quantity) >= 0);

  const panelLine = bom.find(l => l.role === 'PANEL' && l.disposition === R.DISPOSITION.REPLACE);
  assert.equal(panelLine.componentId, 'p2', 'the new panel, not the removed 300 W one');
  assert.equal(panelLine.replacesComponentId, 'EXISTING-300W');
  assert.equal(panelLine.removedUnitOwnedByCustomer, true);
  assert.equal(panelLine.removedUnitPricingImpact, 'NONE');
  assert.equal(bom.some(l => l.componentId === 'EXISTING-300W'), false);
});

// ---------------------------------------------------------------------------
// 5. ADD and RETAIN are unchanged
// ---------------------------------------------------------------------------

test('ADD lines still reach the Project BOM with their own component and quantity', () => {
  const { cfg, bom } = approvedBom('UR-ADD');
  const addLines = cfg.allLines.filter(l => l.disposition === R.DISPOSITION.ADD
    && l.componentId && l.quantity != null);
  for (const a of addLines) {
    const emitted = bom.find(l => l.componentId === a.componentId && l.role === a.role);
    assert.ok(emitted, `${a.role}/${a.componentId} must still reach the BOM`);
    if (emitted.disposition === R.DISPOSITION.ADD) assert.equal(emitted.quantity, a.quantity);
  }
  assert.ok(bom.length > 0);
});

test('RETAIN behaviour is unchanged — a retained component with a quantity is preserved', () => {
  const { cfg, bom } = approvedBom('UR-RET', { existingInverter: INV6_3P, targetInverter: null });
  const retained = cfg.allLines.filter(l => l.disposition === R.DISPOSITION.RETAIN
    && l.componentId && l.quantity != null);
  for (const r of retained) {
    const emitted = bom.find(l => l.componentId === r.componentId && l.disposition === R.DISPOSITION.RETAIN);
    assert.ok(emitted, `${r.role}/${r.componentId} retained line must be preserved`);
    assert.equal(emitted.quantity, r.quantity);
  }
  // the retained inverter itself carries no quantity, so it adds no BOM line —
  // exactly as before the fix
  assert.equal(bom.some(l => l.role === 'INVERTER' && l.disposition === R.DISPOSITION.RETAIN), false);
});

test('every emitted line still carries its source and upgrade path', () => {
  const { bom } = approvedBom('UR-SRC');
  for (const l of bom) {
    assert.equal(l.source, 'C10_APPROVED_UPGRADE_CONFIGURATION');
    assert.equal(l.upgradePathId, 'UPG-3-6');
    assert.ok(l.componentId);
    assert.ok(l.quantity != null);
  }
  assert.equal(R.toProjectBomLines(null), null);
  assert.equal(R.toProjectBomLines({ lines: [] }), null);
});

// ---------------------------------------------------------------------------
// 6. a missing replacement component is never fabricated
// ---------------------------------------------------------------------------

test('a replacement with no approved target inverter blocks approval', () => {
  const store = R.createUpgradeReviewStore();
  submit(store, 'UR-NOTGT', { targetInverter: null });
  const p = R.reviewPanel(store, { actor: PH, requestId: 'UR-NOTGT' });
  assert.equal(p.inverter.disposition, R.DISPOSITION.REPLACE);
  assert.equal(p.inverter.proposedDisposition, R.DISPOSITION.ENGINEERING_REVIEW);
  assert.equal(p.inverter.proposedComponentId, null);
  assert.ok(p.approvalBlockers.some(b => b.role === 'INVERTER'));
  assert.throws(() => R.approveUpgradeConfiguration(store, { actor: PH, requestId: 'UR-NOTGT', at: AT2 }),
    e => e.code === R.REVIEW_ERROR.UNRESOLVED_ITEMS_REMAIN);
});

test('a REPLACE with no replacement component emits no BOM line — none is fabricated', () => {
  // a hand-built authoritative configuration whose REPLACE has no paired ADD
  const cfg = Object.freeze({
    authoritative: true, upgradePathId: 'UPG-3-6',
    allLines: [
      { role: 'INVERTER', componentId: 'i1', disposition: R.DISPOSITION.REPLACE, quantity: null, customerOwned: true },
      { role: 'PANEL', componentId: 'p2', disposition: R.DISPOSITION.ADD, quantity: 6 },
    ],
  });
  const bom = R.toProjectBomLines(cfg);
  assert.equal(bom.some(l => l.role === 'INVERTER'), false, 'no inverter line without a replacement component');
  assert.equal(bom.length, 1);
  assert.equal(bom[0].componentId, 'p2');
  assert.equal(JSON.stringify(bom).includes('i1'), false, 'the removed unit never stands in for the replacement');
});

test('a REPLACE whose paired ADD has no quantity emits nothing rather than a zero', () => {
  const cfg = Object.freeze({
    authoritative: true, upgradePathId: 'UPG-3-6',
    allLines: [
      { role: 'INVERTER', componentId: 'i1', disposition: R.DISPOSITION.REPLACE, quantity: null },
      { role: 'INVERTER', componentId: 'i5', disposition: R.DISPOSITION.ADD, quantity: null },
    ],
  });
  assert.deepEqual([...R.toProjectBomLines(cfg)], []);
});

test('a negative quantity can never leave the handoff', () => {
  const cfg = Object.freeze({
    authoritative: true, upgradePathId: 'UPG-3-6',
    allLines: [{ role: 'PANEL', componentId: 'p2', disposition: R.DISPOSITION.ADD, quantity: -4 }],
  });
  assert.throws(() => R.toProjectBomLines(cfg), e => e.name === 'UpgradeReviewError');
});

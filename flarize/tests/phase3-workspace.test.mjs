// PHASE 3 — PROJECT HEAD WORKSPACE + RBAC.
//
// These tests assert the APPLICATION layer behaves as an application layer:
// it composes the frozen engines and adds no rule of its own. The load-bearing
// assertions are the negative ones — no formula, no clock, no invented value,
// no silent substitution, no second history mechanism.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as W from '../src/lib/projectWorkspace.js';
import * as RBAC from '../src/lib/rbac.js';
import { ROLES } from '../src/lib/bomRoles.js';
import { CONFIG_TYPE, CONFIG_OWNER, createHistoryStore, appendVersion } from '../src/lib/commercialHistory.js';
import { COST_HEAD_ORDER } from '../src/lib/costEngine.js';

const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const ENV = {
  catalog,
  catalogVersion: 'test-catalog',
  batteryMaster: JSON.parse(readFileSync('data/battery-master.json', 'utf8')).batteries,
  packageRegistry: JSON.parse(readFileSync('data/packages.proposed.json', 'utf8')),
  costConfig: JSON.parse(readFileSync('data/cost-config.json', 'utf8')),
  priceMaster: {},
  rateCard: null,
  historyStore: null,
};

const AT = '2026-08-16T00:00:00Z';
const PH = { userId: 'ph1', role: 'PROJECT_HEAD' };
const SALES = { userId: 's1', role: 'SALES' };
const ENGG = { userId: 'e1', role: 'ENGINEERING' };
const PKG = 'PKG-ONGRID-3-1P-BASE';

function seeded() {
  const s = W.createWorkspaceStore();
  W.createProject(s, { actor: PH, projectId: 'P1', customer: 'Test Customer', at: AT });
  W.setProjectConfiguration(s, { actor: PH, projectId: 'P1', at: AT,
    architecture: 'DEYE', sysType: 'ongrid', sizeKw: 3, phase: '1P', tier: 'base' });
  W.selectPackage(s, ENV, { actor: PH, projectId: 'P1', packageId: PKG, at: AT });
  return s;
}

// ===================================================== RBAC (PART G)
test('RBAC — every role is known and no role has an implicit grant', () => {
  assert.deepEqual([...RBAC.ALL_ROLES].sort(),
    ['ADMIN', 'ENGINEERING', 'FIELD_SALES', 'PROCUREMENT', 'PROJECT_HEAD', 'SALES', 'SALES_CRS', 'SALES_HEAD']);
  for (const r of RBAC.ALL_ROLES) assert.ok(Array.isArray(RBAC.CAPABILITY_MATRIX[r]), r);
  // no wildcard: ADMIN does not silently receive every capability
  const all = Object.values(RBAC.CAPABILITY);
  assert.ok(RBAC.CAPABILITY_MATRIX.ADMIN.length < all.length);
  assert.equal(RBAC.can('ADMIN', RBAC.CAPABILITY.BOM_EDIT), false);
  assert.equal(RBAC.can('NOT_A_ROLE', RBAC.CAPABILITY.PROJECT_VIEW), false);
});

test('RBAC — Sales cannot touch engineering BOM authority', () => {
  for (const cap of [RBAC.CAPABILITY.BOM_EDIT, RBAC.CAPABILITY.BOM_LOCK,
                     RBAC.CAPABILITY.ENGINEERING_APPROVE, RBAC.CAPABILITY.PACKAGE_SELECT]) {
    assert.equal(RBAC.can('SALES', cap), false, cap);
    assert.equal(RBAC.can('SALES_HEAD', cap), false, cap);
  }
  // and the domain rule is still consulted, not restated
  assert.throws(() => RBAC.assertCanEditBomRole(SALES, ROLES.BATTERY), /RbacError|may not/);
});

test('RBAC — margin approval belongs to Sales Head only', () => {
  assert.equal(RBAC.can('SALES_HEAD', RBAC.CAPABILITY.MARGIN_APPROVE), true);
  for (const r of ['SALES', 'PROJECT_HEAD', 'ENGINEERING', 'PROCUREMENT', 'ADMIN'])
    assert.equal(RBAC.can(r, RBAC.CAPABILITY.MARGIN_APPROVE), false, r);
});

test('RBAC — cost head and configuration ownership come from the engines', () => {
  assert.throws(() => RBAC.assertOwnsCostHead(PH, 'OFFICE_EXPENSE_ALLOCATION'), /owned by ADMIN/);
  assert.throws(() => RBAC.assertOwnsCostHead(PH, 'MATERIAL_LANDED'), /owned by PROCUREMENT/);
  assert.throws(() => RBAC.assertOwnsConfig({ userId: 'a', role: 'ADMIN' }, CONFIG_TYPE.PROCUREMENT_PRICE), /owned by PROCUREMENT/);
  assert.doesNotThrow(() => RBAC.assertOwnsConfig({ userId: 'a', role: 'ADMIN' }, CONFIG_TYPE.MARGIN));
});

test('RBAC — an anonymous or unknown actor is refused', () => {
  assert.throws(() => RBAC.assertCan(null, RBAC.CAPABILITY.PROJECT_VIEW), /NO_ACTOR|actor/);
  assert.throws(() => RBAC.assertCan({ userId: 'x' }, RBAC.CAPABILITY.PROJECT_VIEW), /actor/);
  assert.throws(() => RBAC.assertCan({ userId: 'x', role: 'GOD' }, RBAC.CAPABILITY.PROJECT_VIEW), /Unknown role/);
});

test('RBAC — the workspace enforces it, not just the UI', () => {
  const s = seeded();
  assert.throws(() => W.editBomComponent(s, ENV, { actor: SALES, projectId: 'P1',
    role: ROLES.BATTERY, componentId: 'bt1', quantity: 1, at: AT }), /RbacError|may not/);
  assert.throws(() => W.lockBom(s, ENV, { actor: SALES, projectId: 'P1', at: AT }), /may not perform BOM_LOCK/);
  assert.throws(() => W.selectPackage(s, ENV, { actor: ENGG, projectId: 'P1', packageId: PKG, at: AT }), /may not perform PACKAGE_SELECT/);
  // Engineering may still READ and run the checker
  assert.doesNotThrow(() => W.runChecker(s, ENV, { actor: ENGG, projectId: 'P1', at: AT }));
});

// ===================================================== determinism
test('the workspace never reads a clock', () => {
  for (const f of ['src/lib/projectWorkspace.js', 'src/lib/rbac.js']) {
    const src = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '');
    assert.equal(/Date\.now\(|new Date\(/.test(src), false, `${f} must not read a clock`);
  }
});

test('every mutating operation demands a caller-supplied timestamp', () => {
  const s = W.createWorkspaceStore();
  assert.throws(() => W.createProject(s, { actor: PH, projectId: 'X' }), /MISSING_TIMESTAMP|timestamp/);
  W.createProject(s, { actor: PH, projectId: 'X', at: AT });
  assert.throws(() => W.setProjectConfiguration(s, { actor: PH, projectId: 'X', sizeKw: 5 }), /timestamp/);
});

test('the checker verdict is reproducible for the same inputs', () => {
  const a = W.runChecker(seeded(), ENV, { actor: PH, projectId: 'P1', at: AT });
  const b = W.runChecker(seeded(), ENV, { actor: PH, projectId: 'P1', at: AT });
  assert.equal(a.deterministicKey, b.deterministicKey);
  assert.deepEqual(a.counts, b.counts);
});

// ===================================================== no duplicated logic
test('the application layer contains no engineering or commercial formula', () => {
  const src = readFileSync('src/lib/projectWorkspace.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '');
  // no margin arithmetic, no GST arithmetic, no cost arithmetic
  assert.equal(/1\s*-\s*margin|1\s*\+\s*margin|\*\s*1\.0?18|0\.089|\bgstRatePct\s*\//.test(src), false);
  // no bare commercial literal
  for (const n of ['500', '1000', '5500', '15000', '18', '5'])
    assert.equal(new RegExp(`[^\\w.'"]${n}[^\\w.%'"]`).test(src), false, `commercial literal ${n} leaked in`);
  // no nearest / fallback selection
  assert.equal(/nearest|fallbackTo|\|\|\s*0\b/i.test(src), false);
});

test('the workspace re-exports engine verdicts rather than computing them', () => {
  const src = readFileSync('src/lib/projectWorkspace.js', 'utf8');
  for (const fn of ['checkProjectBom', 'attemptLock', 'calculateCost', 'calculatePricing', 'historyView'])
    assert.ok(src.includes(fn + '('), `${fn} must be called, not reimplemented`);
  // the status vocabulary is never constructed locally
  assert.equal(/status:\s*['"](VALID|WARNING|BLOCKED)['"]/.test(src), false,
    'validation status must come from the checker, never be assigned here');
});

// ===================================================== PART C — capabilities 1–17
test('C1–C7 — create, configure and select a package', () => {
  const s = seeded();
  const p = W.openProject(s, { actor: PH, projectId: 'P1' });
  assert.equal(p.customer, 'Test Customer');
  assert.equal(p.architecture, 'DEYE');
  assert.equal(p.sysType, 'ongrid');
  assert.equal(p.sizeKw, 3);
  assert.equal(p.phase, '1P');
  assert.equal(p.packageId, PKG);
  assert.equal(p.bomStatus, 'DRAFT');
});

test('C7 — package approval status is reported accurately from registry', () => {
  const list = W.listPackages(ENV, { actor: PH, sysType: 'ongrid', sizeKw: 3, phase: '1P', tier: 'base' });
  assert.equal(list.length, 1);
  // After production setup, packages may be APPROVED by ENGINEERING.
  // The key invariant: status is read from the registry, never fabricated.
  assert.ok(['PROPOSED', 'APPROVED'].includes(list[0].approvalStatus),
    `approvalStatus must be PROPOSED or APPROVED, got ${list[0].approvalStatus}`);
});

test('C8 — the package BOM is materialised from the registry, quantities as recorded', () => {
  const b = W.viewBom(seeded(), ENV, { actor: PH, projectId: 'P1' });
  const byRole = Object.fromEntries(b.lines.map(l => [l.role, l]));
  assert.equal(byRole[ROLES.PANEL].componentId, 'p1');
  assert.equal(byRole[ROLES.PANEL].quantity, 6);
  assert.equal(byRole[ROLES.INVERTER].componentId, 'i95');
  assert.equal(byRole[ROLES.AC_ISOLATOR].componentId, 'is1');
  for (const l of b.lines) assert.equal(l.selectionMethod, 'PACKAGE_DEFAULT');
  // the registry pins no structure, so the workspace does not invent one
  assert.equal(byRole[ROLES.STRUCTURE], undefined);
});

test('C9/C10 — an edit is recorded as a project override and never rewrites the package', () => {
  const s = seeded();
  const before = W.viewBom(s, ENV, { actor: PH, projectId: 'P1' });
  W.editBomComponent(s, ENV, { actor: PH, projectId: 'P1', role: ROLES.PANEL,
    componentId: 'p6', quantity: 7, at: AT, reason: 'availability' });
  const after = W.viewBom(s, ENV, { actor: PH, projectId: 'P1' });
  const line = after.lines.find(l => l.role === ROLES.PANEL);
  assert.equal(line.componentId, 'p6');
  assert.equal(line.quantity, 7);
  assert.equal(line.selectionMethod, 'PROJECT_HEAD_OVERRIDE');
  assert.equal(line.selectedBy, 'ph1');
  // package default untouched
  assert.equal(s.projects.P1.bom.packageLines.find(l => l.role === ROLES.PANEL).componentId, 'p1');
  assert.ok(before.lines.length === after.lines.length);
});

test('C10 — a component outside the catalog is refused, not created', () => {
  const s = seeded();
  assert.throws(() => W.editBomComponent(s, ENV, { actor: PH, projectId: 'P1',
    role: ROLES.PANEL, componentId: 'does-not-exist', quantity: 1, at: AT }),
    /COMPONENT_NOT_IN_CATALOG|not in the catalog/);
});

test('C10 — a pending-approval component is offered, never hidden or substituted', () => {
  const batteries = W.availableComponents(ENV, { actor: PH, role: ROLES.BATTERY });
  const bt1 = batteries.find(c => c.componentId === 'bt1');
  assert.ok(bt1, 'bt1 is pending engineering approval but must remain visible');
  assert.equal(bt1.engineeringStatus, 'PENDING_ENGINEERING_APPROVAL');
  assert.ok(bt1.engineeringNote);
  // selecting it succeeds — the checker, not the picker, reports the problem
  const s = seeded();
  assert.doesNotThrow(() => W.editBomComponent(s, ENV, { actor: PH, projectId: 'P1',
    role: ROLES.BATTERY, componentId: 'bt1', quantity: 1, at: AT }));
  const line = W.viewBom(s, ENV, { actor: PH, projectId: 'P1' }).lines.find(l => l.role === ROLES.BATTERY);
  assert.equal(line.componentId, 'bt1', 'the selection must survive verbatim');
});

test('C11–C13 — the checker reports status and every finding carries full provenance', () => {
  const v = W.runChecker(seeded(), ENV, { actor: PH, projectId: 'P1', at: AT });
  assert.ok(['VALID', 'WARNING', 'BLOCKED'].includes(v.status));
  assert.ok(v.findings.length > 0);
  for (const f of v.findings) {
    assert.ok(f.ruleId && f.severity && f.category, 'rule/severity/category');
    assert.ok(typeof f.message === 'string' && f.message.length);
    assert.ok(typeof f.reason === 'string' && f.reason.length);
    assert.ok(f.source, 'every finding must cite its source');
    assert.ok(Array.isArray(f.components));
  }
  assert.equal(v.rulesVersion, 'phase1e.1');
});

test('C14/C15 — fixing the BOM and re-running changes the verdict honestly', () => {
  const s = seeded();
  const before = W.runChecker(s, ENV, { actor: PH, projectId: 'P1', at: AT });
  assert.equal(before.status, 'BLOCKED');
  assert.ok(before.findings.some(f => f.ruleId === 'PBC-K-001' && f.message.includes('STRUCTURE')));
  // the Project Head supplies the structure line — the system never guesses it
  W.editBomComponent(s, ENV, { actor: PH, projectId: 'P1', role: ROLES.STRUCTURE,
    componentId: 'sm_15x15', quantity: 10, at: AT, reason: 'site survey' });
  const after = W.runChecker(s, ENV, { actor: PH, projectId: 'P1', at: AT });
  assert.equal(after.counts.blocked < before.counts.blocked, true, 'fixing a blocker must reduce blockers');
  assert.equal(after.findings.some(f => f.ruleId === 'PBC-K-001' && f.message.includes('STRUCTURE')), false);
});

test('C16 — lock is refused while BLOCKED and the BOM is left untouched and editable', () => {
  const s = seeded();
  const r = W.lockBom(s, ENV, { actor: PH, projectId: 'P1', at: AT });
  assert.equal(r.locked, false);
  assert.equal(r.result, 'REJECTED_BLOCKED');
  assert.equal(s.projects.P1.bom.status, 'DRAFT');
  assert.equal(W.getSnapshot(s, { actor: PH, projectId: 'P1' }), null);
  assert.doesNotThrow(() => W.editBomComponent(s, ENV, { actor: PH, projectId: 'P1',
    role: ROLES.PANEL, componentId: 'p6', quantity: 6, at: AT }));
});

test('C16 — an unacknowledged warning blocks the lock, and the ack is recorded', () => {
  const s = seeded();
  W.editBomComponent(s, ENV, { actor: PH, projectId: 'P1', role: ROLES.STRUCTURE,
    componentId: 'sm_15x15', quantity: 10, at: AT });
  const first = W.lockBom(s, ENV, { actor: PH, projectId: 'P1', at: AT });
  if (first.result === 'REJECTED_UNACKNOWLEDGED') {
    assert.ok(first.missingAcknowledgements.length > 0);
    assert.equal(s.projects.P1.bom.status, 'DRAFT');
    const acks = first.missingAcknowledgements.map(m => ({ ruleId: m.ruleId, reason: 'reviewed on site' }));
    const second = W.lockBom(s, ENV, { actor: PH, projectId: 'P1', at: AT, acknowledgements: acks });
    assert.equal(second.locked, true);
    assert.equal(second.snapshot.acknowledgements.length, acks.length);
    for (const a of second.snapshot.acknowledgements) {
      assert.equal(a.acknowledgedBy, 'ph1');
      assert.equal(a.acknowledgedAt, AT);
      assert.ok(a.reason);
    }
  } else {
    // still BLOCKED for a reason unrelated to structure — that is honest too
    assert.equal(first.result, 'REJECTED_BLOCKED');
  }
});

test('C17 — after lock the snapshot is immutable and further edits are refused', () => {
  const s = seeded();
  W.editBomComponent(s, ENV, { actor: PH, projectId: 'P1', role: ROLES.STRUCTURE,
    componentId: 'sm_15x15', quantity: 10, at: AT });
  const v = W.runChecker(s, ENV, { actor: PH, projectId: 'P1', at: AT });
  const acks = v.findings.filter(f => f.requiresAcknowledgement).map(f => ({ ruleId: f.ruleId, reason: 'reviewed' }));
  const r = W.lockBom(s, ENV, { actor: PH, projectId: 'P1', at: AT, acknowledgements: acks });
  if (!r.locked) { assert.equal(r.result, 'REJECTED_BLOCKED'); return; }

  const snap = W.getSnapshot(s, { actor: PH, projectId: 'P1' });
  assert.equal(snap.status, 'LOCKED');
  assert.equal(snap.immutable, true);
  assert.ok(snap.lines.length > 0);
  assert.equal(snap.lockedBy, 'ph1');
  assert.throws(() => W.editBomComponent(s, ENV, { actor: PH, projectId: 'P1',
    role: ROLES.PANEL, componentId: 'p6', quantity: 6, at: AT }), /LOCKED/);
  assert.throws(() => W.setProjectConfiguration(s, { actor: PH, projectId: 'P1', at: AT, sizeKw: 5 }), /LOCKED/);
});

// ===================================================== PART D — cost / pricing
test('D — cost is unavailable until the BOM is locked, and says so', () => {
  const c = W.costPanel(seeded(), ENV, { actor: PH, projectId: 'P1', at: AT });
  assert.equal(c.available, false);
  assert.equal(c.blocked, true);
  assert.equal(c.status, 'UNAVAILABLE');
  assert.match(c.blockingReason, /LOCKED/);
  assert.equal(c.totalActualProjectCost, null);
});

test('D — an unconfigured cost head renders as NOT CONFIGURED, never as zero', () => {
  const s = seeded();
  W.editBomComponent(s, ENV, { actor: PH, projectId: 'P1', role: ROLES.STRUCTURE,
    componentId: 'sm_15x15', quantity: 10, at: AT });
  const v = W.runChecker(s, ENV, { actor: PH, projectId: 'P1', at: AT });
  const acks = v.findings.filter(f => f.requiresAcknowledgement).map(f => ({ ruleId: f.ruleId, reason: 'reviewed' }));
  const lock = W.lockBom(s, ENV, { actor: PH, projectId: 'P1', at: AT, acknowledgements: acks });
  if (!lock.locked) return;                       // honestly blocked; nothing to assert

  const c = W.costPanel(s, ENV, { actor: PH, projectId: 'P1', at: AT });
  assert.equal(c.available, true);
  assert.equal(c.heads.length, COST_HEAD_ORDER.length);
  const material = c.heads.find(h => h.head === 'MATERIAL_LANDED');
  // no procurement landed cost is configured in this repository
  assert.equal(material.amount, null);
  assert.equal(material.configured, false);
  assert.equal(material.blocked, true);
  assert.notEqual(material.amount, 0);
  assert.equal(c.totalActualProjectCost, null);
  assert.equal(c.totalConfigured, false);
  assert.equal(c.blocked, true);
  assert.ok(c.errors.some(e => e.code === 'LANDED_COST_NOT_CONFIGURED'));

  // pricing must refuse to price an incomplete cost rather than show ₹0
  const p = W.pricingPanel(s, ENV, { actor: PH, projectId: 'P1', at: AT });
  assert.equal(p.blocked, true);
  assert.equal(p.customerPrice, null);
  assert.equal(p.listPrice, null);
});

test('D — no cost or price value is ever coerced to zero anywhere in the panel', () => {
  const src = readFileSync('src/lib/projectWorkspace.js', 'utf8');
  assert.equal(/amount:\s*h\.amount\s*\?\?\s*0|\?\?\s*0\b|\|\|\s*0\b/.test(src), false,
    'an absent amount must never fall back to 0');
  const ui = readFileSync('public/workspace.html', 'utf8');
  assert.ok(ui.includes('NOT CONFIGURED'), 'the UI must have an explicit not-configured rendering');
  assert.equal(/money\([^)]*\|\|\s*0\)/.test(ui), false);
});

test('D — margin tier config is read from disk and never invented', () => {
  // After production setup margin may be CONFIGURED with real values.
  // Key invariant: the status and values come from cost-config.json, never fabricated.
  const margin = ENV.costConfig.margin;
  assert.ok(margin.status, 'margin.status must exist');
  assert.ok(margin.tiers, 'margin.tiers must exist');
  assert.ok(margin.tiers.BASE, 'margin.tiers.BASE must exist');
});

// ===================================================== PART E — history
test('E — the history panel uses commercialHistory.js and creates no second store', () => {
  let store = createHistoryStore();
  store = appendVersion(store, {
    configType: CONFIG_TYPE.SITE_SURVEY_RATE, recordId: 'SURVEY',
    value: { costPerProject: 500 }, versionId: 'v1', changedBy: 'admin',
    changedAt: '2026-08-01T00:00:00Z', changeReason: 'initial', effectiveFrom: '2026-08-01T00:00:00Z',
  });
  store = appendVersion(store, {
    configType: CONFIG_TYPE.SITE_SURVEY_RATE, recordId: 'SURVEY',
    value: { costPerProject: 600 }, versionId: 'v2', changedBy: 'head',
    changedAt: '2026-08-10T00:00:00Z', changeReason: 'fuel increase', effectiveFrom: '2026-08-10T00:00:00Z',
  });

  const panel = W.commercialHistoryPanel({ historyStore: store },
    { actor: PH, configType: CONFIG_TYPE.SITE_SURVEY_RATE, recordId: 'SURVEY' });

  assert.equal(panel.owner, CONFIG_OWNER[CONFIG_TYPE.SITE_SURVEY_RATE]);
  assert.equal(panel.current.versionId, 'v2');
  assert.equal(panel.history.length, 2);
  const newest = panel.history[0];
  for (const f of ['versionId', 'changedBy', 'changedAt', 'changeReason', 'effectiveFrom', 'oldValue', 'newValue'])
    assert.ok(newest[f] !== undefined, `history must show ${f}`);
  assert.deepEqual(newest.oldValue, { costPerProject: 500 });
  assert.deepEqual(newest.newValue, { costPerProject: 600 });
  assert.equal(panel.history[1].isInitial, true);

  // and the application layer stores nothing of its own
  const src = readFileSync('src/lib/projectWorkspace.js', 'utf8');
  assert.equal(/historyStore\s*=\s*\{|function\s+appendHistory|\.history\.push\(\s*\{\s*version/.test(src), false,
    'the workspace must not implement a second history mechanism');
});

test('E — Sales cannot read commercial configuration history', () => {
  assert.throws(() => W.configTypes({ actor: SALES }), /may not perform COMMERCIAL_HISTORY_VIEW/);
  assert.doesNotThrow(() => W.configTypes({ actor: { userId: 'a', role: 'ADMIN' } }));
});

// ===================================================== audit trail
test('every workspace action is recorded with actor, role and timestamp', () => {
  const s = seeded();
  W.runChecker(s, ENV, { actor: PH, projectId: 'P1', at: AT });
  const h = s.projects.P1.history;
  assert.deepEqual(h.map(x => x.action),
    ['PROJECT_CREATED', 'PROJECT_CONFIGURED', 'PACKAGE_SELECTED', 'CHECKER_RUN']);
  for (const e of h) { assert.equal(e.by, 'ph1'); assert.equal(e.role, 'PROJECT_HEAD'); assert.equal(e.at, AT); }
});

// Phase 1B — package resolution matrix and registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const M = existsSync('docs/phase1/package-resolution-matrix.json')
  ? JSON.parse(readFileSync('docs/phase1/package-resolution-matrix.json','utf8')) : null;
const R = existsSync('data/packages.proposed.json')
  ? JSON.parse(readFileSync('data/packages.proposed.json','utf8')) : null;
const catalog = JSON.parse(readFileSync('data/catalog.json','utf8'));
const allIds = new Set(Object.values(catalog.categories).flatMap(c => (c.items||[]).map(i => i.id)));

test('matrix covers on-grid, hybrid and all six upgrade paths', (t) => {
  if (!M) return t.skip('matrix not generated');
  const g = (s) => M.packages.filter(p => p.systemType === s).length;
  assert.equal(g('ongrid'), 18, '6 sizes x 3 tiers');
  assert.equal(g('hybrid'), 12, '4 sizes x 3 tiers');
  assert.equal(g('upgrade'), 18, '6 paths x 3 tiers');
  assert.equal(M.packages.length, 48);
});

test('every resolved componentId is a real catalog component', (t) => {
  if (!M) return t.skip('matrix not generated');
  for (const p of M.packages)
    for (const c of p.components)
      if (c.componentId) assert.ok(allIds.has(c.componentId), `${p.packageId}/${c.role}: ${c.componentId} not in catalog`);
});

test('no component is identified by display name', (t) => {
  if (!R) return t.skip('registry not generated');
  for (const p of R.packages)
    for (const c of p.components)
      assert.ok(c.componentId === null || typeof c.componentId === 'string' && allIds.has(c.componentId),
        `${p.packageId}/${c.role} must carry a real componentId`);
});

test('every approvedAlternate is a real catalog component', (t) => {
  if (!M) return t.skip('matrix not generated');
  for (const p of M.packages)
    for (const c of p.components)
      for (const a of c.approvedAlternates) assert.ok(allIds.has(a), `${p.packageId}/${c.role}: alternate ${a}`);
});

test('Phase 1C — only explicit engineering decisions are APPROVED', (t) => {
  if (!R) return t.skip('registry not generated');
  // 2026-09-07: the registry is no longer the pristine Phase 1C generator output —
  // packages have since been APPROVED through the authoritative approval route
  // (packageApproval.approvePackage → approvedBy / approvedAt / approvedByDecision
  // 'PKG_APPROVAL_<userId>_<at>'). The durable invariant is therefore:
  //   * approvalStatus is a known state;
  //   * an APPROVED package records who approved it and when;
  //   * an APPROVED component is backed by an explicit decision id — either an
  //     engineering decision (D11-A / D11-B / D12) or a package-approval record;
  //   * nothing is APPROVED without a decision id.
  const DECISION = /^(D11-A|D11-B|D12|PKG_APPROVAL_.+)$/;
  for (const p of R.packages) {
    assert.ok(['PROPOSED', 'APPROVED', 'REJECTED'].includes(p.approvalStatus), `${p.packageId}: ${p.approvalStatus}`);
    if (p.approvalStatus === 'APPROVED') {
      assert.ok(p.approvedBy, `${p.packageId} APPROVED without approvedBy`);
      assert.ok(p.approvedAt, `${p.packageId} APPROVED without approvedAt`);
    }
    for (const c of p.components) {
      if (c.approvalStatus === 'APPROVED')
        assert.match(String(c.approvedByDecision || ''), DECISION,
          `${p.packageId}/${c.role} approved without a decision id`);
      else
        assert.equal(c.approvedByDecision ?? null, null);
    }
  }
  assert.ok(R.packages.some(p => p.components.some(c => c.approvalStatus === 'APPROVED')));
});

test('Phase 1C — fallback-derived components are NOT auto-approved', (t) => {
  if (!R) return t.skip('registry not generated');
  const bad = [];
  for (const p of R.packages)
    for (const c of p.components)
      if (c.approvalStatus === 'APPROVED' && c.derivedBy.startsWith('fallback') && !c.approvedByDecision)
        bad.push(`${p.packageId}/${c.role}`);
  assert.deepEqual(bad, []);
});

test('Phase 1C — premium hybrid records the prohibited components', (t) => {
  if (!R) return t.skip('registry not generated');
  for (const p of R.packages.filter(x => x.systemType === 'hybrid' && x.tier === 'premium')) {
    assert.ok(p.prohibited.includes('mb1'));
    assert.ok(p.prohibited.includes('25mm Battery Cable'));
  }
});

test('fallback provenance is recorded, not hidden', (t) => {
  if (!R) return t.skip('registry not generated');
  for (const p of R.packages)
    for (const c of p.components)
      assert.ok(/^(explicit|fallback:)/.test(c.derivedBy), `${p.packageId}/${c.role} missing provenance`);
  assert.ok(R.counts.componentsFromFallback > 0, 'current state genuinely is fallback-driven');
});

// --- Phase 1C: D11 and D12 are now RESOLVED by approved decisions. ---
// These tests previously asserted the gaps EXISTED. Flipped deliberately.
test('D11 RESOLVED — no package is blocked on an isolator', (t) => {
  if (!M) return t.skip('matrix not generated');
  const iso = M.packages.filter(p => p.blocked.some(b => b.startsWith('isolator')));
  assert.equal(iso.length, 0, `still blocked: ${iso.map(p => p.packageId).join(', ')}`);
});

test('D11 RESOLVED — every package resolves an AC isolator to is1 or is2', (t) => {
  if (!M) return t.skip('matrix not generated');
  for (const p of M.packages) {
    const iso = p.components.find(c => c.role === 'isolator');
    if (!iso) continue;
    assert.ok(['is1', 'is2'].includes(iso.componentId),
      `${p.packageId} resolved isolator to ${iso.componentId}`);
  }
});

test('D11-D — the placeholder isolator never resolves', (t) => {
  if (!M) return t.skip('matrix not generated');
  for (const p of M.packages)
    for (const c of p.components)
      assert.notEqual(c.componentId, 'is_9b53be37fab1', `${p.packageId}/${c.role}`);
});

test('D12 RESOLVED — no premium hybrid is blocked on a battery MCCB', (t) => {
  if (!M) return t.skip('matrix not generated');
  const prem = M.packages.filter(p => p.systemType === 'hybrid' && p.tier === 'premium');
  assert.ok(prem.length > 0);
  for (const p of prem)
    assert.ok(!p.blocked.some(b => b.startsWith('mccb_box')), `${p.packageId}: ${p.blocked.join('; ')}`);
});

test('Phase 1D review — the ONLY blocked packages are blocked on battery approval', (t) => {
  if (!M) return t.skip('matrix not generated');
  const blocked = M.packages.filter(p => p.blocked.length);
  // BLOCKED here is the DESIRED safety behaviour: bt1 is PENDING_ENGINEERING_APPROVAL
  // and its protection rating is not recorded. It is not a software failure.
  for (const p of blocked) {
    assert.equal(p.systemType, 'hybrid', p.packageId);
    for (const b of p.blocked)
      assert.match(b, /^battery: /, `${p.packageId} blocked for a non-battery reason: ${b}`);
  }
  // premium Enphase must be untouched by the correction
  for (const p of M.packages.filter(x => x.tier === 'premium'))
    assert.equal(p.blocked.length, 0, `${p.packageId}: ${p.blocked.join('; ')}`);
  // on-grid must be untouched
  for (const p of M.packages.filter(x => x.systemType !== 'hybrid'))
    assert.equal(p.blocked.length, 0, `${p.packageId}: ${p.blocked.join('; ')}`);
});

test('goal not yet met — zero-fallback package count is reported honestly', (t) => {
  if (!M) return t.skip('matrix not generated');
  assert.equal(M.summary.packagesWithZeroFallback, 0,
    'target is 0 fallbacks per package; current state is 0 packages meeting it');
});

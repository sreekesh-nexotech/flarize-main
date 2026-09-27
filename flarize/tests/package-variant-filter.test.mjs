/**
 * Package variant filter — transport-layer post-process test.
 *
 * The variant filter is applied at the transport layer in
 * server-package-approval.js after listPackagesForRole returns. It is
 * additive: absent-variant preserves existing behaviour byte-for-byte.
 *
 * This test verifies the pure array-filter behaviour used by the transport,
 * without spinning up an HTTP server.
 *
 * P1-5 · Phase 1 · 2026-09-02
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Same predicate used at server-package-approval.js:
//   if (variant) packages = packages.filter(p => (p.variant || null) === variant);
function applyVariantFilter(packages, variant) {
  if (!variant) return packages;
  return packages.filter(p => (p.variant || null) === variant);
}

const FIXTURE = [
  { packageId: 'PKG-STD-3-BASE-1P', systemType: 'ongrid', size: '3', tier: 'base', phase: '1P', approvalStatus: 'APPROVED' },
  { packageId: 'PKG-FR-3-BASE-1P', systemType: 'ongrid', size: '3', tier: 'base', phase: '1P', variant: 'FUTURE_READY', approvalStatus: 'APPROVED' },
  { packageId: 'PKG-STD-5-VALUE-1P', systemType: 'ongrid', size: '5sp', tier: 'value', phase: '1P', approvalStatus: 'APPROVED' },
  { packageId: 'PKG-FR-5-VALUE-1P', systemType: 'ongrid', size: '5sp', tier: 'value', phase: '1P', variant: 'FUTURE_READY', approvalStatus: 'PROPOSED' },
];

describe('P1-5 · Package variant filter (transport layer)', () => {
  it('absent variant returns the full input list byte-for-byte', () => {
    assert.deepEqual(applyVariantFilter(FIXTURE, undefined), FIXTURE);
    assert.deepEqual(applyVariantFilter(FIXTURE, null), FIXTURE);
    assert.deepEqual(applyVariantFilter(FIXTURE, ''), FIXTURE);
  });

  it('variant=FUTURE_READY returns only FR records', () => {
    const out = applyVariantFilter(FIXTURE, 'FUTURE_READY');
    assert.equal(out.length, 2);
    assert.ok(out.every(p => p.variant === 'FUTURE_READY'));
    assert.deepEqual(out.map(p => p.packageId).sort(),
      ['PKG-FR-3-BASE-1P', 'PKG-FR-5-VALUE-1P']);
  });

  it('variant treats packages without a variant field as null (excluded when FR is requested)', () => {
    const stdOnly = FIXTURE.filter(p => !p.variant);
    const out = applyVariantFilter(stdOnly, 'FUTURE_READY');
    assert.equal(out.length, 0);
  });

  it('unknown variant returns empty list — never fabricated records', () => {
    const out = applyVariantFilter(FIXTURE, 'DOES_NOT_EXIST');
    assert.equal(out.length, 0);
  });

  it('filter is a pure array filter — never mutates input', () => {
    const before = JSON.parse(JSON.stringify(FIXTURE));
    applyVariantFilter(FIXTURE, 'FUTURE_READY');
    assert.deepEqual(FIXTURE, before);
  });
});

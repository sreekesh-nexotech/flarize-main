// tests/phase-j-effective-validity-and-demo-safety.test.mjs
//
// Phase J (2026-09-05) — Effective-period validity + DEMO issuance guard.
//
// COVERAGE
//   Effective-period policies (Project-Head-owned):
//     1. ACTIVE policy whose window contains issuedAt is used automatically.
//     2. Precedence order: per-quote override > effective policy > admin default.
//     3. Overlapping ACTIVE policies — last effectiveFrom wins.
//     4. Historical snapshot immutability: publishing a NEW policy after
//        issuance leaves the frozen snapshot's validityDays / policyId
//        unchanged.
//     5. Policies with status INACTIVE are ignored.
//     6. Malformed policy records are skipped, not fatal.
//     7. No matching policy AND no admin default → POLICY_NOT_CONFIGURED.
//     8. PROJECT_HEAD accepted as validity-policy editor; SALES refused.
//   DEMO safety:
//     9. commercialFreeze in productionMode with DEMO branding → REFUSED
//        (DEMO_BRANDING_BLOCKED_IN_PRODUCTION).
//    10. commercialFreeze without productionMode with DEMO branding → ALLOWED
//        (development / test env path).
//    11. Non-demo branding under productionMode issues normally.
//    12. Signature/seal demo also refused when productionMode is on.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

const policy = await import('../src/lib/quotationPolicy.js');
const { buildCommercialSnapshot } = await import('../src/lib/commercialFreeze.js');
const branding = await import('../src/lib/quotationBranding.js');

const AT_SEP = '2026-09-15T00:00:00Z';
const AT_OCT = '2026-10-15T00:00:00Z';
const AT_NOV = '2026-11-15T00:00:00Z';

function makePolicyStore(policies, defaultDays = null) {
  return {
    schema: 'flarize.quotation-policy/2',
    validity: { defaultDays, version: defaultDays ? 'admin-fallback-v1' : null },
    policies,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Effective-period policies
// ─────────────────────────────────────────────────────────────────────────────
describe('J — effective-period validity resolution', () => {
  const septPolicy = { policyId: 'POL-SEP-2026', validityDays: 30,
    effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: '2026-10-01T00:00:00Z',
    status: 'ACTIVE', version: 'sep.v1', createdBy: 'ph1', createdAt: '2026-08-25T00:00:00Z' };
  const octPolicy  = { policyId: 'POL-OCT-2026', validityDays: 15,
    effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: '2026-11-01T00:00:00Z',
    status: 'ACTIVE', version: 'oct.v1', createdBy: 'ph1', createdAt: '2026-09-25T00:00:00Z' };

  it('quotation issued in September uses the 30-day policy automatically', () => {
    const store = makePolicyStore([septPolicy, octPolicy]);
    const r = policy.resolveEffectiveValidity(store, null, AT_SEP);
    assert.equal(r.validityDays, 30);
    assert.equal(r.source, 'EFFECTIVE_POLICY');
    assert.equal(r.policyId, 'POL-SEP-2026');
    assert.equal(r.effectiveFrom, '2026-09-01T00:00:00Z');
    assert.equal(r.effectiveTo,   '2026-10-01T00:00:00Z');
    assert.equal(r.policyVersion, 'sep.v1');
    // validUntil = 2026-09-15 + 30 days = 2026-10-15
    assert.equal(r.validUntil, '2026-10-15T00:00:00.000Z');
  });

  it('quotation issued in October uses the 15-day policy automatically', () => {
    const store = makePolicyStore([septPolicy, octPolicy]);
    const r = policy.resolveEffectiveValidity(store, null, AT_OCT);
    assert.equal(r.validityDays, 15);
    assert.equal(r.policyId, 'POL-OCT-2026');
  });

  it('per-quotation override still wins over any effective policy (source=PROJECT_HEAD_OVERRIDE)', () => {
    const store = makePolicyStore([septPolicy, octPolicy]);
    const r = policy.resolveEffectiveValidity(store, 60, AT_SEP);
    assert.equal(r.validityDays, 60);
    assert.equal(r.source, 'PROJECT_HEAD_OVERRIDE');
  });

  it('no matching policy AND no admin default → POLICY_NOT_CONFIGURED', () => {
    const store = makePolicyStore([septPolicy]);
    let err = null;
    try { policy.resolveEffectiveValidity(store, null, AT_NOV); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, policy.POLICY_ERROR.POLICY_NOT_CONFIGURED);
  });

  it('no matching policy but admin default present → falls back with source=ADMIN_DEFAULT', () => {
    const store = makePolicyStore([septPolicy], 7); // admin fallback 7 days
    const r = policy.resolveEffectiveValidity(store, null, AT_NOV);
    assert.equal(r.validityDays, 7);
    assert.equal(r.source, 'ADMIN_DEFAULT');
  });

  it('INACTIVE policy is ignored even when its window matches', () => {
    const inactiveSep = { ...septPolicy, status: 'INACTIVE' };
    const store = makePolicyStore([inactiveSep]);
    let err = null;
    try { policy.resolveEffectiveValidity(store, null, AT_SEP); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, policy.POLICY_ERROR.POLICY_NOT_CONFIGURED);
  });

  it('overlapping ACTIVE policies — the one with the latest effectiveFrom wins', () => {
    const early = { policyId: 'POL-EARLY', validityDays: 30, status: 'ACTIVE',
      effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: '2026-12-01T00:00:00Z', version: 'e.v1' };
    const later = { policyId: 'POL-LATER', validityDays: 45, status: 'ACTIVE',
      effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: '2026-11-15T00:00:00Z', version: 'l.v1' };
    const store = makePolicyStore([early, later]);
    const r = policy.resolveEffectiveValidity(store, null, AT_OCT);
    assert.equal(r.policyId, 'POL-LATER');
    assert.equal(r.validityDays, 45);
  });

  it('malformed policy record is skipped rather than blocking resolution', () => {
    const broken = { policyId: 'POL-BROKEN', validityDays: -1, status: 'ACTIVE',
      effectiveFrom: 'not-a-date' };
    const store = makePolicyStore([broken, septPolicy]);
    const r = policy.resolveEffectiveValidity(store, null, AT_SEP);
    assert.equal(r.policyId, 'POL-SEP-2026');
  });

  it('publishing a NEW policy AFTER issuance does not mutate the frozen resolution', () => {
    const store = makePolicyStore([septPolicy]);
    const r1 = policy.resolveEffectiveValidity(store, null, AT_SEP);
    const captured = { validityDays: r1.validityDays, policyId: r1.policyId, validUntil: r1.validUntil };
    // Mutate the store as if PH published a REPLACEMENT policy after issuance.
    store.policies.push({ policyId: 'POL-SEP-REVISED', validityDays: 5, status: 'ACTIVE',
      effectiveFrom: '2026-09-10T00:00:00Z', effectiveTo: '2026-10-01T00:00:00Z', version: 'sep.v2' });
    // The originally frozen resolution object is Object.freeze()'d — direct
    // mutation is a no-op. And more importantly the store change does not
    // rewrite anything about r1.
    try { r1.validityDays = 999; } catch { /* frozen */ }
    assert.equal(r1.validityDays, captured.validityDays);
    assert.equal(r1.policyId,     captured.policyId);
    assert.equal(r1.validUntil,   captured.validUntil);
  });

  it('assertPolicyEditor: PROJECT_HEAD accepted (Phase J owner), ADMIN accepted, SALES refused', () => {
    assert.doesNotThrow(() => policy.assertPolicyEditor({ userId: 'p', role: 'PROJECT_HEAD' }));
    assert.doesNotThrow(() => policy.assertPolicyEditor({ userId: 'a', role: 'ADMIN' }));
    let err = null;
    try { policy.assertPolicyEditor({ userId: 's', role: 'SALES' }); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, policy.POLICY_ERROR.POLICY_EDITOR_FORBIDDEN);
  });

  it('validatePolicyRecord rejects invalid shapes explicitly', () => {
    let err;
    err = null; try { policy.validatePolicyRecord({}); } catch (e) { err = e; }
    assert.equal(err.code, policy.POLICY_ERROR.POLICY_WINDOW_INVALID);
    err = null; try { policy.validatePolicyRecord({ policyId: 'X', validityDays: 30, effectiveFrom: 'nope' }); } catch (e) { err = e; }
    assert.ok(err);
    err = null; try { policy.validatePolicyRecord({ policyId: 'X', validityDays: 0,
      effectiveFrom: '2026-09-01T00:00:00Z' }); } catch (e) { err = e; }
    assert.equal(err.code, policy.POLICY_ERROR.VALIDITY_INVALID);
    err = null; try { policy.validatePolicyRecord({ policyId: 'X', validityDays: 30,
      effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: '2026-09-01T00:00:00Z' }); } catch (e) { err = e; }
    assert.equal(err.code, policy.POLICY_ERROR.POLICY_WINDOW_INVALID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DEMO safety issuance guard
// ─────────────────────────────────────────────────────────────────────────────
describe('J — DEMO safety issuance guard', () => {
  function makeDemoBrandingStore() {
    return {
      schema: 'flarize.quotation-branding/2',
      bank: {
        primary: 'ACC-DEMO-BANK-A',
        accounts: {
          'ACC-DEMO-BANK-A': {
            accountId: 'ACC-DEMO-BANK-A', label: 'DEMO_BANK_A', status: 'ACTIVE', isDemo: true,
            current: 'BK-A-v1',
            versions: { 'BK-A-v1': { versionId: 'BK-A-v1', publishedAt: AT_SEP, publishedBy: 'ph',
              values: { bankName: 'DEMO_BANK', bankAccountName: 'H', bankAccountNumber: 'DEMO_ACCT', bankIfsc: 'DEMO_IFSC', bankBranch: 'DEMO' } } },
          },
        },
      },
      upi: { primary: null, accounts: {} },
      signature: { current: null, versions: {} },
      seal: { current: null, versions: {} },
    };
  }
  function makeRealBrandingStore() {
    return {
      schema: 'flarize.quotation-branding/2',
      bank: {
        primary: 'ACC-REAL-BANK-A',
        accounts: {
          'ACC-REAL-BANK-A': {
            accountId: 'ACC-REAL-BANK-A', label: 'REAL_BANK_A', status: 'ACTIVE', isDemo: false,
            current: 'BK-R-v1',
            versions: { 'BK-R-v1': { versionId: 'BK-R-v1', publishedAt: AT_SEP, publishedBy: 'admin',
              values: { bankName: 'REAL_BANK', bankAccountName: 'H', bankAccountNumber: 'R', bankIfsc: 'R', bankBranch: 'R' } } },
          },
        },
      },
      upi: { primary: null, accounts: {} },
      signature: { current: null, versions: {} },
      seal: { current: null, versions: {} },
    };
  }
  const septPolicy = { policyId: 'POL-SEP-2026', validityDays: 30, status: 'ACTIVE',
    effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: '2026-10-01T00:00:00Z', version: 'sep.v1' };
  const policyStore = { schema: 'flarize.quotation-policy/2', validity: { defaultDays: null }, policies: [septPolicy] };

  it('productionMode + DEMO branding → REFUSED with DEMO_BRANDING_BLOCKED_IN_PRODUCTION', () => {
    let err = null;
    try {
      buildCommercialSnapshot({
        brandingStore: makeDemoBrandingStore(),
        policy: policyStore,
        issuedAt: AT_SEP,
        productionMode: true,
      });
    } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, 'DEMO_BRANDING_BLOCKED_IN_PRODUCTION');
    assert.ok(err.detail.demoKinds.includes('bank'));
  });

  it('productionMode + REAL (non-demo) branding → issues normally', () => {
    const snap = buildCommercialSnapshot({
      brandingStore: makeRealBrandingStore(),
      policy: policyStore,
      issuedAt: AT_SEP,
      productionMode: true,
    });
    assert.equal(snap.branding.bank.isDemo, false);
    assert.equal(snap.branding.bank.values.bankAccountNumber, 'R');
  });

  it('productionMode OFF (development/test) + DEMO branding → allowed (existing behaviour preserved)', () => {
    const snap = buildCommercialSnapshot({
      brandingStore: makeDemoBrandingStore(),
      policy: policyStore,
      issuedAt: AT_SEP,
      // productionMode: false — default
    });
    assert.equal(snap.branding.bank.isDemo, true);
    assert.equal(snap.branding.bank.values.bankAccountNumber, 'DEMO_ACCT');
  });

  it('DEMO signature under productionMode also refuses (guard covers every kind)', () => {
    const store = makeRealBrandingStore();
    store.signature = { current: 'SIG-DEMO-v1', versions: {
      'SIG-DEMO-v1': { versionId: 'SIG-DEMO-v1', publishedAt: AT_SEP, publishedBy: 'ph',
        isDemo: true, values: { signatureAssetId: 'demo-sig', signedBy: 'DEMO' } },
    }};
    let err = null;
    try {
      buildCommercialSnapshot({ brandingStore: store, policy: policyStore, issuedAt: AT_SEP, productionMode: true });
    } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, 'DEMO_BRANDING_BLOCKED_IN_PRODUCTION');
    assert.ok(err.detail.demoKinds.includes('signature'));
  });

  it('effective-period policy flows into the frozen snapshot.validity block', () => {
    const snap = buildCommercialSnapshot({
      brandingStore: makeRealBrandingStore(),
      policy: policyStore,
      issuedAt: AT_SEP,
    });
    assert.equal(snap.validity.source, 'EFFECTIVE_POLICY');
    assert.equal(snap.validity.policyId, 'POL-SEP-2026');
    assert.equal(snap.validity.validityDays, 30);
    assert.equal(Object.isFrozen(snap.validity), true);
  });
});

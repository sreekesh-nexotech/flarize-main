// tests/phase-i-multi-account-branding.test.mjs
//
// Phase I (2026-09-05) — Multi-account branding: bank + upi become multi-account
// while signature + seal remain single-slot. v1 stores continue to work via a
// read-side adapter. Snapshot output stays renderer-compatible.
//
// Coverage per approved directive:
//   1  v1 store loads correctly
//   2  v1 store freezes with byte-compatible values
//   3  v2 store with two active bank accounts
//   4  Primary bank account selected automatically
//   5  Non-primary bank selected per quotation
//   6  Specific historical bank version selected
//   7  Two UPI accounts work independently
//   8  Primary UPI selection works
//   9  DEMO flag freezes into snapshot
//   10 Deactivating an account does not mutate an issued snapshot
//   11 Sales cannot modify branding
//   12 Invalid/inactive account selection is rejected
//   13 Existing renderer receives the exact same values shape
//   14 Signature + seal single-slot remain unchanged

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

const B = await import('../src/lib/quotationBranding.js');
const { freezeBrandingSnapshot, BRANDING_ERROR, listAccounts, kindContainsDemo,
        assertBrandingEditor, BRANDING_SCHEMA_V1, BRANDING_SCHEMA_V2,
        currentVersionId, getVersion } = B;

const AT = '2026-09-05T00:00:00Z';

// -----------------------------------------------------------------------------
// FIXTURES — all labelled DEMO. No production data is invented.
// -----------------------------------------------------------------------------
function makeV1Store() {
  return {
    schema: BRANDING_SCHEMA_V1,
    bank: { current: 'BK-DEMO-v1', versions: {
      'BK-DEMO-v1': { versionId: 'BK-DEMO-v1', publishedAt: AT, publishedBy: 'admin',
        values: { bankName: 'DEMO_BANK', bankAccountName: 'DEMO_HOLDER', bankAccountNumber: 'DEMO_ACCT_1', bankIfsc: 'DEMO_IFSC', bankBranch: 'DEMO_BRANCH' } },
    }},
    upi: { current: 'UPI-DEMO-v1', versions: {
      'UPI-DEMO-v1': { versionId: 'UPI-DEMO-v1', publishedAt: AT, publishedBy: 'admin',
        values: { upiId: 'demo@upi', upiQrAssetId: 'demo-qr-v1' } },
    }},
    signature: { current: 'SIG-DEMO-v1', versions: {
      'SIG-DEMO-v1': { versionId: 'SIG-DEMO-v1', publishedAt: AT, publishedBy: 'admin',
        values: { signatureAssetId: 'demo-sig-v1', signedBy: 'DEMO_SIGNATORY' } },
    }},
    seal: { current: 'SEAL-DEMO-v1', versions: {
      'SEAL-DEMO-v1': { versionId: 'SEAL-DEMO-v1', publishedAt: AT, publishedBy: 'admin',
        values: { sealAssetId: 'demo-seal-v1' } },
    }},
  };
}

function makeV2Store() {
  return {
    schema: BRANDING_SCHEMA_V2,
    bank: {
      primary: 'ACC-DEMO-BANK-A',
      accounts: {
        'ACC-DEMO-BANK-A': {
          accountId: 'ACC-DEMO-BANK-A', label: 'DEMO_BANK_A', status: 'ACTIVE', isDemo: true,
          current: 'BK-A-v1',
          versions: {
            'BK-A-v1': { versionId: 'BK-A-v1', publishedAt: AT, publishedBy: 'admin',
              values: { bankName: 'DEMO_BANK_A', bankAccountName: 'DEMO_A_HOLDER', bankAccountNumber: 'DEMO_ACCT_A_1', bankIfsc: 'DEMO_IFSC_A', bankBranch: 'DEMO_BRANCH_A' } },
            'BK-A-v2': { versionId: 'BK-A-v2', publishedAt: AT, publishedBy: 'ph',
              values: { bankName: 'DEMO_BANK_A', bankAccountName: 'DEMO_A_HOLDER', bankAccountNumber: 'DEMO_ACCT_A_2', bankIfsc: 'DEMO_IFSC_A', bankBranch: 'DEMO_BRANCH_A' } },
          },
        },
        'ACC-DEMO-BANK-B': {
          accountId: 'ACC-DEMO-BANK-B', label: 'DEMO_BANK_B', status: 'ACTIVE', isDemo: true,
          current: 'BK-B-v1',
          versions: {
            'BK-B-v1': { versionId: 'BK-B-v1', publishedAt: AT, publishedBy: 'admin',
              values: { bankName: 'DEMO_BANK_B', bankAccountName: 'DEMO_B_HOLDER', bankAccountNumber: 'DEMO_ACCT_B_1', bankIfsc: 'DEMO_IFSC_B', bankBranch: 'DEMO_BRANCH_B' } },
          },
        },
      },
    },
    upi: {
      primary: 'UPI-ACC-DEMO-A',
      accounts: {
        'UPI-ACC-DEMO-A': {
          accountId: 'UPI-ACC-DEMO-A', label: 'DEMO_UPI_A', status: 'ACTIVE', isDemo: true,
          current: 'UPI-A-v1',
          versions: {
            'UPI-A-v1': { versionId: 'UPI-A-v1', publishedAt: AT, publishedBy: 'admin',
              values: { upiId: 'demo-a@upi', upiQrAssetId: 'demo-a-qr-v1' } },
          },
        },
        'UPI-ACC-DEMO-B': {
          accountId: 'UPI-ACC-DEMO-B', label: 'DEMO_UPI_B', status: 'ACTIVE', isDemo: true,
          current: 'UPI-B-v1',
          versions: {
            'UPI-B-v1': { versionId: 'UPI-B-v1', publishedAt: AT, publishedBy: 'admin',
              values: { upiId: 'demo-b@upi', upiQrAssetId: 'demo-b-qr-v1' } },
          },
        },
      },
    },
    signature: { current: 'SIG-DEMO-v1', versions: {
      'SIG-DEMO-v1': { versionId: 'SIG-DEMO-v1', publishedAt: AT, publishedBy: 'admin',
        values: { signatureAssetId: 'demo-sig-v1', signedBy: 'DEMO_SIGNATORY' } },
    }},
    seal: { current: 'SEAL-DEMO-v1', versions: {
      'SEAL-DEMO-v1': { versionId: 'SEAL-DEMO-v1', publishedAt: AT, publishedBy: 'admin',
        values: { sealAssetId: 'demo-seal-v1' } },
    }},
  };
}

// -----------------------------------------------------------------------------
// 1 + 2. v1 back-compat: loads, adapts, freezes with byte-compat values.
// -----------------------------------------------------------------------------
describe('I — v1 back-compat', () => {
  it('v1 store loads via the read-side adapter and reports a synthetic "legacy" account', () => {
    const store = makeV1Store();
    const accs = listAccounts(store, 'bank');
    assert.equal(accs.length, 1);
    assert.equal(accs[0].accountId, 'legacy');
    assert.equal(accs[0].isPrimary, true);
    assert.equal(accs[0].status, 'ACTIVE');
    assert.equal(accs[0].isDemo, false);
    // Legacy currentVersionId still works.
    assert.equal(currentVersionId(store, 'bank'), 'BK-DEMO-v1');
    // Legacy getVersion still works.
    const rec = getVersion(store, 'bank', 'BK-DEMO-v1');
    assert.equal(rec.values.bankAccountNumber, 'DEMO_ACCT_1');
  });

  it('v1 store freeze produces the exact scalar values shape the v1 renderer expects', () => {
    const store = makeV1Store();
    const snap = freezeBrandingSnapshot(store);
    // Shape: renderer contract is values.{bankName,bankAccountName,bankAccountNumber,bankIfsc,bankBranch}
    assert.deepEqual(Object.keys(snap.bank.values).sort(),
      ['bankAccountName','bankAccountNumber','bankBranch','bankIfsc','bankName']);
    assert.equal(snap.bank.values.bankAccountNumber, 'DEMO_ACCT_1');
    // New fields present alongside the values — additive, not replacing.
    assert.equal(snap.bank.accountId, 'legacy');
    assert.equal(snap.bank.versionId, 'BK-DEMO-v1');
    assert.equal(snap.bank.source, 'CURRENT_VERSION');
    assert.equal(snap.bank.isDemo, false); // v1 store has no demo flag
    assert.equal(Object.isFrozen(snap.bank), true);
    assert.equal(Object.isFrozen(snap.bank.values), true);
  });

  it('v1 string override on bank still selects a specific version (Phase F/G back-compat)', () => {
    const store = makeV1Store();
    // Add a second version to the same v1 account so an override has a real target.
    store.bank.versions['BK-DEMO-v2'] = { versionId: 'BK-DEMO-v2', publishedAt: AT, publishedBy: 'ph',
      values: { bankName: 'DEMO_BANK', bankAccountName: 'DEMO_HOLDER', bankAccountNumber: 'DEMO_ACCT_2', bankIfsc: 'DEMO_IFSC', bankBranch: 'DEMO_BRANCH' } };
    const snap = freezeBrandingSnapshot(store, { bank: 'BK-DEMO-v2' });
    assert.equal(snap.bank.versionId, 'BK-DEMO-v2');
    assert.equal(snap.bank.source, 'PROJECT_HEAD_OVERRIDE');
    assert.equal(snap.bank.values.bankAccountNumber, 'DEMO_ACCT_2');
  });
});

// -----------------------------------------------------------------------------
// 3 + 4 + 7 + 8. v2 multi-account: primary auto-select, two accounts coexist.
// -----------------------------------------------------------------------------
describe('I — v2 multi-account: primary auto-selection', () => {
  it('v2 store with two active bank accounts — both are listed independently', () => {
    const store = makeV2Store();
    const accs = listAccounts(store, 'bank');
    assert.equal(accs.length, 2);
    const ids = new Set(accs.map(a => a.accountId));
    assert.ok(ids.has('ACC-DEMO-BANK-A') && ids.has('ACC-DEMO-BANK-B'));
    // Both ACTIVE — one is primary.
    assert.equal(accs.filter(a => a.isPrimary).length, 1);
    assert.equal(accs.every(a => a.status === 'ACTIVE'), true);
  });

  it('freeze without override picks the primary bank account + its current version', () => {
    const store = makeV2Store();
    const snap = freezeBrandingSnapshot(store);
    assert.equal(snap.bank.accountId, 'ACC-DEMO-BANK-A');
    assert.equal(snap.bank.versionId, 'BK-A-v1');
    assert.equal(snap.bank.source, 'CURRENT_VERSION');
    assert.equal(snap.bank.values.bankAccountNumber, 'DEMO_ACCT_A_1');
  });

  it('two UPI accounts work independently — primary UPI is auto-selected', () => {
    const store = makeV2Store();
    const accs = listAccounts(store, 'upi');
    assert.equal(accs.length, 2);
    const snap = freezeBrandingSnapshot(store);
    assert.equal(snap.upi.accountId, 'UPI-ACC-DEMO-A');
    assert.equal(snap.upi.versionId, 'UPI-A-v1');
    assert.equal(snap.upi.values.upiId, 'demo-a@upi');
    // Second UPI still resolvable by explicit selection.
    const snap2 = freezeBrandingSnapshot(store, { upi: { accountId: 'UPI-ACC-DEMO-B' } });
    assert.equal(snap2.upi.accountId, 'UPI-ACC-DEMO-B');
    assert.equal(snap2.upi.versionId, 'UPI-B-v1');
    assert.equal(snap2.upi.values.upiId, 'demo-b@upi');
  });
});

// -----------------------------------------------------------------------------
// 5 + 6. v2 per-quote selection: non-primary account, specific historical version.
// -----------------------------------------------------------------------------
describe('I — v2 per-quotation selection', () => {
  it('non-primary bank account selected per quotation via {accountId}', () => {
    const store = makeV2Store();
    const snap = freezeBrandingSnapshot(store, { bank: { accountId: 'ACC-DEMO-BANK-B' } });
    assert.equal(snap.bank.accountId, 'ACC-DEMO-BANK-B');
    assert.equal(snap.bank.versionId, 'BK-B-v1');       // account's current
    assert.equal(snap.bank.source, 'PROJECT_HEAD_OVERRIDE');
    assert.equal(snap.bank.values.bankAccountNumber, 'DEMO_ACCT_B_1');
  });

  it('specific historical bank version selected via {accountId, versionId}', () => {
    const store = makeV2Store();
    const snap = freezeBrandingSnapshot(store, { bank: { accountId: 'ACC-DEMO-BANK-A', versionId: 'BK-A-v1' } });
    assert.equal(snap.bank.accountId, 'ACC-DEMO-BANK-A');
    assert.equal(snap.bank.versionId, 'BK-A-v1');
    assert.equal(snap.bank.source, 'PROJECT_HEAD_OVERRIDE');
    // Pin to an OLDER version even when account.current has moved on.
    store.bank.accounts['ACC-DEMO-BANK-A'].current = 'BK-A-v2';
    const snapPinned = freezeBrandingSnapshot(store, { bank: { accountId: 'ACC-DEMO-BANK-A', versionId: 'BK-A-v1' } });
    assert.equal(snapPinned.bank.versionId, 'BK-A-v1');
    assert.equal(snapPinned.bank.values.bankAccountNumber, 'DEMO_ACCT_A_1');
  });
});

// -----------------------------------------------------------------------------
// 9. DEMO flag freezes into snapshot (account-level and version-level).
// -----------------------------------------------------------------------------
describe('I — DEMO/TEST distinguishability', () => {
  it('account-level isDemo:true freezes into snapshot.branding.<kind>.isDemo=true', () => {
    const store = makeV2Store(); // every account is DEMO
    const snap = freezeBrandingSnapshot(store);
    assert.equal(snap.bank.isDemo, true);
    assert.equal(snap.upi.isDemo, true);
    // Signature + seal in this fixture are v1-shape (no isDemo declared) — default false.
    assert.equal(snap.signature.isDemo, false);
    assert.equal(snap.seal.isDemo, false);
    // kindContainsDemo introspection helper agrees.
    assert.equal(kindContainsDemo(store, 'bank'), true);
    assert.equal(kindContainsDemo(store, 'signature'), false);
  });

  it('version-level isDemo:true propagates when the account itself is not marked demo', () => {
    const store = makeV2Store();
    // Flip account isDemo off but tag one version as demo.
    store.bank.accounts['ACC-DEMO-BANK-A'].isDemo = false;
    store.bank.accounts['ACC-DEMO-BANK-A'].versions['BK-A-v1'].isDemo = true;
    const snap = freezeBrandingSnapshot(store);
    assert.equal(snap.bank.isDemo, true, 'version-level demo flag surfaces on the frozen snapshot');
  });
});

// -----------------------------------------------------------------------------
// 10. Deactivating an account never mutates an already-issued snapshot.
// -----------------------------------------------------------------------------
describe('I — historical safety after deactivation', () => {
  it('mutating account.status to INACTIVE after freeze leaves the frozen snapshot unchanged', () => {
    const store = makeV2Store();
    const snap = freezeBrandingSnapshot(store, { bank: { accountId: 'ACC-DEMO-BANK-A' } });
    const before = snap.bank.values.bankAccountNumber;
    // Master data mutation post-freeze.
    store.bank.accounts['ACC-DEMO-BANK-A'].status = 'INACTIVE';
    store.bank.accounts['ACC-DEMO-BANK-A'].versions['BK-A-v1'].values.bankAccountNumber = 'MUTATED_VALUE_SHOULD_NOT_APPEAR';
    // Attempt in-place mutation of the frozen snapshot itself.
    try { snap.bank.values.bankAccountNumber = 'INPLACE_MUTATION_ATTEMPT'; } catch { /* frozen */ }
    assert.equal(snap.bank.values.bankAccountNumber, before);
    assert.equal(snap.bank.accountId, 'ACC-DEMO-BANK-A');
    assert.equal(snap.bank.versionId, 'BK-A-v1');
  });

  it('a NEW quotation cannot freeze an INACTIVE account (silent-fallback forbidden)', () => {
    const store = makeV2Store();
    store.bank.accounts['ACC-DEMO-BANK-B'].status = 'INACTIVE';
    let err = null;
    try { freezeBrandingSnapshot(store, { bank: { accountId: 'ACC-DEMO-BANK-B' } }); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, BRANDING_ERROR.BRANDING_ACCOUNT_INACTIVE);
  });

  it('primary pointing at an INACTIVE account is refused; explicit selection required', () => {
    const store = makeV2Store();
    store.bank.accounts['ACC-DEMO-BANK-A'].status = 'INACTIVE';
    // primary still ACC-DEMO-BANK-A — no explicit override.
    let err = null;
    try { freezeBrandingSnapshot(store); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, BRANDING_ERROR.BRANDING_ACCOUNT_INACTIVE);
  });
});

// -----------------------------------------------------------------------------
// 11. Sales cannot modify branding (RBAC unchanged).
// -----------------------------------------------------------------------------
describe('I — RBAC unchanged', () => {
  it('Sales cannot mutate branding (ADMIN + PROJECT_HEAD only)', () => {
    for (const role of ['SALES', 'SALES_HEAD', 'PROCUREMENT', 'ENGINEERING', 'CEO', 'FINANCE']) {
      let err = null;
      try { assertBrandingEditor({ userId: 'x', role }); } catch (e) { err = e; }
      assert.ok(err, `role=${role} must be refused`);
      assert.equal(err.code, BRANDING_ERROR.BRANDING_EDITOR_FORBIDDEN);
    }
    assert.doesNotThrow(() => assertBrandingEditor({ userId: 'a', role: 'ADMIN' }));
    assert.doesNotThrow(() => assertBrandingEditor({ userId: 'p', role: 'PROJECT_HEAD' }));
  });
});

// -----------------------------------------------------------------------------
// 12. Invalid selections rejected (missing account, missing version, single-slot
// kind receiving an account object override).
// -----------------------------------------------------------------------------
describe('I — invalid selection is rejected (no silent fallback)', () => {
  it('unknown accountId → BRANDING_ACCOUNT_NOT_FOUND', () => {
    const store = makeV2Store();
    let err = null;
    try { freezeBrandingSnapshot(store, { bank: { accountId: 'ACC-DOES-NOT-EXIST' } }); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, BRANDING_ERROR.BRANDING_ACCOUNT_NOT_FOUND);
  });

  it('unknown versionId under a real account → BRANDING_VERSION_NOT_FOUND', () => {
    const store = makeV2Store();
    let err = null;
    try { freezeBrandingSnapshot(store, { bank: { accountId: 'ACC-DEMO-BANK-A', versionId: 'BK-A-vZZZ' } }); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND);
  });

  it('v1 string override targeting a missing versionId → BRANDING_VERSION_NOT_FOUND', () => {
    const store = makeV2Store();
    let err = null;
    try { freezeBrandingSnapshot(store, { bank: 'BK-NOPE' }); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, BRANDING_ERROR.BRANDING_VERSION_NOT_FOUND);
  });

  it('object override on single-slot kind (signature/seal) → BRANDING_OVERRIDE_INVALID', () => {
    const store = makeV2Store();
    let err = null;
    try { freezeBrandingSnapshot(store, { signature: { accountId: 'x' } }); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, BRANDING_ERROR.BRANDING_OVERRIDE_INVALID);
  });

  it('v2 override missing accountId → BRANDING_OVERRIDE_INVALID', () => {
    const store = makeV2Store();
    let err = null;
    try { freezeBrandingSnapshot(store, { bank: { versionId: 'BK-A-v1' } }); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, BRANDING_ERROR.BRANDING_OVERRIDE_INVALID);
  });
});

// -----------------------------------------------------------------------------
// 13. Renderer contract preserved — snapshot.branding.<kind>.values shape is
// identical to the v1 Phase F contract.
// -----------------------------------------------------------------------------
describe('I — renderer values contract preserved', () => {
  it('v1 and v2 stores emit the SAME bank.values keys — renderer sees no shape change', () => {
    const v1 = makeV1Store();
    const v2 = makeV2Store();
    const snapV1 = freezeBrandingSnapshot(v1);
    const snapV2 = freezeBrandingSnapshot(v2);
    assert.deepEqual(Object.keys(snapV1.bank.values).sort(), Object.keys(snapV2.bank.values).sort());
    // The five bank fields the approved v1 template consumes.
    assert.deepEqual(Object.keys(snapV1.bank.values).sort(),
      ['bankAccountName','bankAccountNumber','bankBranch','bankIfsc','bankName']);
    // upi.values keys must include upiId + upiQrAssetId.
    for (const k of ['upiId', 'upiQrAssetId']) {
      assert.ok(k in snapV1.upi.values, `v1 upi.values.${k} present`);
      assert.ok(k in snapV2.upi.values, `v2 upi.values.${k} present`);
    }
  });
});

// -----------------------------------------------------------------------------
// 14. Signature + seal remain single-slot (Phase F contract unchanged).
// -----------------------------------------------------------------------------
describe('I — signature + seal single-slot preserved', () => {
  it('signature accepts v1 string override; snapshot carries accountId "legacy"', () => {
    const store = makeV2Store();
    // Publish a second signature version so the override has a real target.
    store.signature.versions['SIG-DEMO-v2'] = { versionId: 'SIG-DEMO-v2', publishedAt: AT, publishedBy: 'ph',
      values: { signatureAssetId: 'demo-sig-v2', signedBy: 'DEMO_SIGNATORY_2' } };
    const snap = freezeBrandingSnapshot(store, { signature: 'SIG-DEMO-v2' });
    assert.equal(snap.signature.versionId, 'SIG-DEMO-v2');
    assert.equal(snap.signature.accountId, 'legacy');
    assert.equal(snap.signature.source, 'PROJECT_HEAD_OVERRIDE');
    assert.equal(snap.signature.values.signatureAssetId, 'demo-sig-v2');
  });

  it('empty store yields null per kind — nothing is invented', () => {
    const store = { schema: BRANDING_SCHEMA_V2, bank: { primary: null, accounts: {} }, upi: { primary: null, accounts: {} }, signature: { current: null, versions: {} }, seal: { current: null, versions: {} } };
    const snap = freezeBrandingSnapshot(store);
    assert.equal(snap.bank, null);
    assert.equal(snap.upi, null);
    assert.equal(snap.signature, null);
    assert.equal(snap.seal, null);
  });
});

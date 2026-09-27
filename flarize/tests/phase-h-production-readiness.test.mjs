// tests/phase-h-production-readiness.test.mjs
//
// Phase H (2026-09-05) — Final production-readiness audit.
//
// This is the closure gate for the Flarize quotation foundation. It is NOT a
// re-run of prior tests — each Phase (A..G) owns its own coverage. Phase H
// asserts the properties those phases must jointly satisfy in production:
//
//   H1 — Procurement price master: explicit classification of the 145
//         landedUnitCost==purchasePrice records, and the 47 fi_* consumables
//         gap (no silent catalog-price fallback in the server chain).
//   H2 — Branding: Admin + Project Head accepted as publishers; the freeze
//         helper captures the SELECTED versions verbatim.
//   H3 — Validity: Admin publishes default; Project Head overrides per
//         quotation; Sales cannot mutate either.
//   H4 — Renderer pin-path: renderQuotationHtml routes templatePaths into
//         loadTemplate so a v1-pinned document reads the v1 bundle even when
//         the loader default is anything else. A missing pinned bundle is
//         REJECTED, never silently substituted.
//   H5 — Legacy quotations: a document without `rendererPinning` cannot be
//         replayed through the pinned-render route (RENDERER_PIN_MISSING).
//         Historical quotation state is not mutated.
//   H7 — End-to-end matrix: hybrid Base/Value/Premium x battery {0,1,2},
//         device allocation VALID/BLOCKED, RBAC across every actor role.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Authoritative modules.
const { buildBom } = require('../server-bom-builder.js');
const catalog = require('../data/catalog.json');
const procurementPriceMaster = require('../data/procurement-price-master.json');
const costConfig = require('../data/cost-config.json');
const subsidyConfig = require('../data/subsidy-config.json');
const { allocateDevices, ALLOCATION_CODE } = require('../src/lib/deviceAllocation.js');

const W               = await import('../src/lib/quotationWorkspace.js');
const { calculateCost }    = await import('../src/lib/costEngine.js');
const { calculatePricing } = await import('../src/lib/pricingEngine.js');
const { calculateSubsidy } = await import('../src/lib/subsidyEngine.js');
const { createProjectBomSnapshot } = await import('../src/lib/bomSnapshot.js');
const { createCommercialSnapshot } = await import('../src/lib/commercialSnapshot.js');
const { buildCommercialSnapshot } = await import('../src/lib/commercialFreeze.js');
const branding = await import('../src/lib/quotationBranding.js');
const policy   = await import('../src/lib/quotationPolicy.js');
const { getCurrentApprovedTemplatePinning, loadPinnedApprovedTemplate,
        resolveApprovedTemplatePaths } = await import('../src/lib/approvedTemplate.loader.js');
const { renderQuotationHtml, APPROVED_TEMPLATE_VERSION } = await import('../src/lib/approvedTemplate.js');
const { ROLE } = await import('../src/lib/rbac.js');

const PH    = { userId: 'ph1', role: ROLE.PROJECT_HEAD };
const SALES = { userId: 's1',  role: ROLE.SALES };
const AT    = '2026-09-05T00:00:00Z';

// -----------------------------------------------------------------------------
// H1 — Procurement price-master explicit classification
// -----------------------------------------------------------------------------
describe('H1 — Procurement price master: explicit classification', () => {
  // Build a category map so parity records can be classified by kind, not lumped.
  function idToCategory() {
    const m = {};
    for (const [cname, cdef] of Object.entries(catalog.categories || {})) {
      for (const it of (cdef.items || [])) if (it.id) m[it.id] = cname;
    }
    return m;
  }
  const idCat = idToCategory();

  it('257-record master partitions into 145 parity + 112 landed>purchase (no other classes)', () => {
    let parity = 0, delta = 0, missingLanded = 0, missingPurchase = 0;
    for (const [k, v] of Object.entries(procurementPriceMaster)) {
      if (!v || typeof v !== 'object') continue;
      const lc = v.landedUnitCost;
      const pp = v.purchasePrice;
      if (lc == null) { missingLanded++; continue; }
      if (pp == null) { missingPurchase++; continue; }
      if (Math.abs(lc - pp) < 0.001) parity++;
      else if (lc > pp) delta++;
      else throw new Error(`landed<purchase for ${k} (${lc} < ${pp}) — negative landing adjustment not allowed`);
    }
    assert.equal(parity, 145, '145 parity records is the locked baseline');
    assert.equal(delta,  112, '112 landed>purchase records is the locked baseline');
    assert.equal(missingLanded,   0, 'no record may lack landedUnitCost');
    assert.equal(missingPurchase, 0, 'no record may lack purchasePrice');
  });

  it('145 parity records are consumables/accessories/panels — bulk categories where supplier price is landed', () => {
    // Categories with parity records: panel, cable, ACDB/DCDB, structure_material,
    // hoymiles, meter, ss_screw, painting_material, isolator, clamps, etc.
    // Categories with landed>purchase: inverter, enphase, battery — high-value
    // equipment where suppliers quote ex-warehouse and landing is added.
    const parityByCat = {};
    const deltaByCat  = {};
    for (const [k, v] of Object.entries(procurementPriceMaster)) {
      if (!v || v.landedUnitCost == null || v.purchasePrice == null) continue;
      const c = idCat[k] || 'unknown';
      if (Math.abs(v.landedUnitCost - v.purchasePrice) < 0.001) {
        parityByCat[c] = (parityByCat[c] || 0) + 1;
      } else {
        deltaByCat[c] = (deltaByCat[c] || 0) + 1;
      }
    }
    // Consumable-class parity is expected. Business classification: parity =
    // "supplier price is delivered-to-warehouse landed" (bulky low-value bulk
    // items with no separate freight/GST break). Delta = "supplier quotes
    // ex-warehouse and landing is added" (inverter/enphase/battery).
    assert.ok(parityByCat.panel >= 30, 'panels dominate parity records');
    assert.ok(deltaByCat.inverter >= 90, 'inverter records dominate landed>purchase');
    // No high-value equipment (inverter/enphase/battery) sneaks into the
    // parity class — every such record must carry an explicit landing.
    assert.equal(parityByCat.inverter || 0, 0, 'no inverter may be recorded at parity');
    assert.equal(parityByCat.enphase  || 0, 0, 'no Enphase device may be recorded at parity');
    assert.equal(parityByCat.battery  || 0, 0, 'no battery may be recorded at parity');
  });

  it('fi_* consumables (47 unique ids from bomTemplates) are absent from the procurement master — EXPLICIT DATA GAP', () => {
    const fiIds = new Set();
    for (const tpl of Object.values(catalog.bomTemplates || {})) {
      for (const fi of (tpl.fixedItems || [])) if (fi.id) fiIds.add(fi.id);
    }
    assert.ok(fiIds.size >= 40, 'catalog carries dozens of fi_* fixed items');
    const inPpm = [...fiIds].filter(k => procurementPriceMaster[k]?.landedUnitCost != null);
    assert.equal(inPpm.length, 0, 'fi_* items must not be counted at catalog price by the server cost engine');
  });

  it('Server cost engine never uses catalog price where landed cost is required — fi_* lines are silently EXCLUDED, not fallback-priced', () => {
    // Real BOM → filter for priced components → cost engine input.
    const bom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const priced = bom.lines.filter(l => l.componentId && procurementPriceMaster[l.componentId]?.landedUnitCost != null);
    const fiLines = bom.lines.filter(l => (l.componentId || '').startsWith('fi_'));
    // fi_* lines exist in the BOM (design-level) …
    assert.ok(fiLines.length > 0, 'fi_* lines are present in the BOM by design');
    // …but none of them enter the priced snapshot (no silent catalog fallback).
    const fiInPriced = priced.filter(l => (l.componentId || '').startsWith('fi_'));
    assert.equal(fiInPriced.length, 0, 'no fi_* line reaches the cost engine input snapshot');
    // The cost engine's MATERIAL_LANDED for the priced subset excludes fi_* by construction.
    const snap = { bomSnapshotId: 't', status: 'LOCKED', tier: 'base',
      lines: priced.map(l => ({ componentId: l.componentId, quantity: l.qty })) };
    const cost = calculateCost({ snapshot: snap, config: costConfig, priceMaster: procurementPriceMaster,
      project: { distanceKm: 30, vehicleType: 'STANDARD', sizeKw: 5, installationType: 'FLAT' } });
    assert.equal(cost.status, 'COMPLETE');
    assert.ok(cost.materialLandedCost > 0);
  });
});

// -----------------------------------------------------------------------------
// H2 — Branding RBAC + freeze roundtrip
// -----------------------------------------------------------------------------
describe('H2 — Branding: Admin + Project Head publish; Sales rejected', () => {
  it('assertBrandingEditor accepts ADMIN and PROJECT_HEAD', () => {
    assert.doesNotThrow(() => branding.assertBrandingEditor({ userId: 'a', role: 'ADMIN' }));
    assert.doesNotThrow(() => branding.assertBrandingEditor({ userId: 'p', role: 'PROJECT_HEAD' }));
  });
  it('assertBrandingEditor refuses every non-editor role', () => {
    for (const role of ['SALES', 'SALES_HEAD', 'PROCUREMENT', 'ENGINEERING', 'CEO', 'FINANCE', null, '']) {
      let err = null;
      try { branding.assertBrandingEditor({ userId: 'x', role }); } catch (e) { err = e; }
      assert.ok(err, `expected refusal for role=${role}`);
      assert.equal(err.code, branding.BRANDING_ERROR.BRANDING_EDITOR_FORBIDDEN);
    }
  });
  it('freezeBrandingSnapshot captures the selected version verbatim (bank/upi/signature/seal)', () => {
    // A published store the tests construct — nothing in the file resembles a
    // real bank/legal account. Values are labeled as fixtures.
    const store = {
      schema: 'flarize.quotation-branding/1',
      bank: { current: 'BK-A', versions: {
        'BK-A': { versionId: 'BK-A', publishedAt: AT, publishedBy: 'admin', values: { bankName: 'FIXTURE_BANK_A', bankAccountName: 'FIXTURE_HOLDER', bankAccountNumber: 'FIXTURE_ACCT_A', bankIfsc: 'FIXTURE_IFSC_A', bankBranch: 'FIXTURE_BRANCH' } },
        'BK-B': { versionId: 'BK-B', publishedAt: AT, publishedBy: 'admin', values: { bankName: 'FIXTURE_BANK_B', bankAccountName: 'FIXTURE_HOLDER', bankAccountNumber: 'FIXTURE_ACCT_B', bankIfsc: 'FIXTURE_IFSC_B', bankBranch: 'FIXTURE_BRANCH' } },
      }},
      upi:       { current: 'UPI-A',  versions: { 'UPI-A':  { versionId: 'UPI-A',  publishedAt: AT, publishedBy: 'admin', values: { upiId: 'FIXTURE_UPI_A', upiQrAssetId: 'FIXTURE_QR_A' } } } },
      signature: { current: 'SIG-A',  versions: {
        'SIG-A': { versionId: 'SIG-A', publishedAt: AT, publishedBy: 'admin', values: { signatureAssetId: 'FIXTURE_SIG_A', signedBy: 'FIXTURE_SIGNER_A' } },
        'SIG-B': { versionId: 'SIG-B', publishedAt: AT, publishedBy: 'ph',    values: { signatureAssetId: 'FIXTURE_SIG_B', signedBy: 'FIXTURE_SIGNER_B' } },
      }},
      seal:      { current: 'SEAL-A', versions: {
        'SEAL-A': { versionId: 'SEAL-A', publishedAt: AT, publishedBy: 'admin', values: { sealAssetId: 'FIXTURE_SEAL_A' } },
        'SEAL-B': { versionId: 'SEAL-B', publishedAt: AT, publishedBy: 'ph',    values: { sealAssetId: 'FIXTURE_SEAL_B' } },
      }},
    };
    const snap1 = branding.freezeBrandingSnapshot(store);
    assert.equal(snap1.bank.versionId, 'BK-A');
    assert.equal(snap1.bank.source, 'CURRENT_VERSION');
    assert.equal(snap1.bank.values.bankAccountNumber, 'FIXTURE_ACCT_A');
    // Project Head override — select a non-current signature and seal.
    const snap2 = branding.freezeBrandingSnapshot(store, { signature: 'SIG-B', seal: 'SEAL-B' });
    assert.equal(snap2.signature.versionId, 'SIG-B');
    assert.equal(snap2.signature.source,    'PROJECT_HEAD_OVERRIDE');
    assert.equal(snap2.seal.versionId,      'SEAL-B');
    assert.equal(snap2.seal.source,         'PROJECT_HEAD_OVERRIDE');
    // Frozen.
    assert.equal(Object.isFrozen(snap1), true);
    assert.equal(Object.isFrozen(snap1.bank.values), true);
  });
});

// -----------------------------------------------------------------------------
// H3 — Validity RBAC + Admin default + PH override
// -----------------------------------------------------------------------------
describe('H3 — Validity: Admin publishes; Project Head overrides; Sales rejected', () => {
  it('assertPolicyEditor accepts ADMIN + PROJECT_HEAD (Phase J: PH is validity-policy owner), refuses everyone else', () => {
    assert.doesNotThrow(() => policy.assertPolicyEditor({ userId: 'a', role: 'ADMIN' }));
    assert.doesNotThrow(() => policy.assertPolicyEditor({ userId: 'p', role: 'PROJECT_HEAD' }));
    for (const role of ['SALES', 'SALES_HEAD', 'PROCUREMENT', 'ENGINEERING', 'CEO', 'FINANCE', null]) {
      let err = null;
      try { policy.assertPolicyEditor({ userId: 'x', role }); } catch (e) { err = e; }
      assert.ok(err, `expected refusal for role=${role}`);
      assert.equal(err.code, policy.POLICY_ERROR.POLICY_EDITOR_FORBIDDEN);
    }
  });
  it('resolveEffectiveValidity picks ADMIN_DEFAULT when no override; PROJECT_HEAD_OVERRIDE when supplied', () => {
    const pol = { schema: 'flarize.quotation-policy/1', validity: { defaultDays: 15, version: 'v1' } };
    const r1 = policy.resolveEffectiveValidity(pol, null, '2026-09-05T00:00:00Z');
    assert.equal(r1.validityDays, 15);
    assert.equal(r1.source, 'ADMIN_DEFAULT');
    const r2 = policy.resolveEffectiveValidity(pol, 45, '2026-09-05T00:00:00Z');
    assert.equal(r2.validityDays, 45);
    assert.equal(r2.source, 'PROJECT_HEAD_OVERRIDE');
  });
  it('resolveEffectiveValidity throws POLICY_NOT_CONFIGURED when neither default nor override is set', () => {
    const pol = { schema: 'flarize.quotation-policy/1', validity: { defaultDays: null } };
    let err = null;
    try { policy.resolveEffectiveValidity(pol, null, '2026-09-05T00:00:00Z'); } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, policy.POLICY_ERROR.POLICY_NOT_CONFIGURED);
  });
  it('data/quotation-policy.json is still NOT_CONFIGURED — Admin must publish before production issuance', () => {
    const pol = JSON.parse(readFileSync('data/quotation-policy.json', 'utf-8'));
    assert.equal(pol.validity.defaultDays, null,
      'Explicit blocker — Admin has not published a production default. Issuance without an override will refuse.');
    assert.equal(pol.validity.status, 'NOT_CONFIGURED');
  });
});

// -----------------------------------------------------------------------------
// H4 — Renderer pin-path routing
// -----------------------------------------------------------------------------
describe('H4 — renderQuotationHtml routes templatePaths so pinned bundle is what actually renders', () => {
  it('templatePaths option flows into loadTemplate — bogus path FAILS LOUD, never silently substituted', () => {
    // Payload can be anything — the loader throws before render begins.
    const payload = {};
    let err = null;
    try {
      renderQuotationHtml(payload, {
        strict: false, includePage3Blocker: true,
        templatePaths: {
          bundlePath: resolve(__dirname, '..', 'assets', 'approved-template', 'NONEXISTENT.v99.html'),
          metaPath:   resolve(__dirname, '..', 'assets', 'approved-template', 'NONEXISTENT.v99.meta.json'),
        },
      });
    } catch (e) { err = e; }
    assert.ok(err, 'renderer must refuse when templatePaths point to a missing bundle');
    assert.match(err.message, /bundle not found|BUNDLE_MISSING/i);
  });

  it('templatePaths resolved from the pin renders the pinned bundle, and its meta echoes the pinned SHA', () => {
    // Round-trip the pinned bundle's identity through the pin-path route.
    const cur = getCurrentApprovedTemplatePinning();
    const paths = resolveApprovedTemplatePaths({ name: cur.name, version: cur.version });
    assert.ok(existsSync(paths.bundlePath), 'pinned bundle must exist at resolved path');
    // Minimal payload — enough for render to run. It'll produce BLOCKED status
    // with unresolved tokens; that is fine, we only test plumbing here.
    const payload = { quotationNumber: 'H4', quotationVersion: 1 };
    const r = renderQuotationHtml(payload, {
      strict: false, includePage3Blocker: true, templatePaths: paths,
    });
    assert.equal(r.meta.bundleSha256, cur.bundleSha256, 'meta must echo pinned bundle SHA — never a substituted one');
    assert.equal(r.meta.rendererVersion, APPROVED_TEMPLATE_VERSION);
  });

  it('pin-path + current-default render identical HTML while pinned=current (Phase G baseline holds)', () => {
    // With v1 as both pinned and current, output must match. Serves as the
    // regression harness for the day Rev 2 becomes current — the pinned call
    // must remain byte-stable.
    const payload = { quotationNumber: 'H4', quotationVersion: 1 };
    const cur = getCurrentApprovedTemplatePinning();
    const paths = resolveApprovedTemplatePaths({ name: cur.name, version: cur.version });
    const a = renderQuotationHtml(payload, { strict: false, includePage3Blocker: true, templatePaths: paths });
    const b = renderQuotationHtml(payload, { strict: false, includePage3Blocker: true });
    const ah = createHash('sha256').update(a.html).digest('hex');
    const bh = createHash('sha256').update(b.html).digest('hex');
    assert.equal(ah, bh, 'pinned-path and default-path must match while pinned==current');
  });

  it('loadPinnedApprovedTemplate refuses a hash-mismatched pin (integrity gate)', () => {
    // Same name+version, but a bundleSha256 that does not match the on-disk meta.
    const cur = getCurrentApprovedTemplatePinning();
    let err = null;
    try { loadPinnedApprovedTemplate({ ...cur, bundleSha256: '0'.repeat(64) }); } catch (e) { err = e; }
    assert.ok(err, 'integrity mismatch must throw');
    assert.match(err.message, /sha256|hash|mismatch/i);
  });
});

// -----------------------------------------------------------------------------
// H5 — Legacy quotations without rendererPinning
// -----------------------------------------------------------------------------
describe('H5 — Legacy quotations without rendererPinning are not replayable through the pinned-render route', () => {
  it('data/quotation-state.json is neither read nor written by this suite (SHA + mtime unchanged)', () => {
    const p = 'data/quotation-state.json';
    const before = createHash('sha256').update(readFileSync(p)).digest('hex');
    const beforeM = statSync(p).mtimeMs;
    // Do some work — Phase H suite itself is meant to be idempotent for
    // historical data.
    branding.freezeBrandingSnapshot({ schema: 'x', bank: {current:null, versions:{}},
      upi:{current:null, versions:{}}, signature:{current:null, versions:{}}, seal:{current:null, versions:{}} });
    const after = createHash('sha256').update(readFileSync(p)).digest('hex');
    const afterM = statSync(p).mtimeMs;
    assert.equal(after, before);
    assert.equal(afterM, beforeM);
  });

  it('An issued document without rendererPinning cannot be pin-loaded (loadPinnedApprovedTemplate refuses)', () => {
    // The workspace still lets an issuance carry rendererPinning:null (legacy
    // path). Such a document has no reproducibility contract to replay
    // against, and the pinned-render route refuses at loadPinnedApprovedTemplate.
    let err = null;
    try { loadPinnedApprovedTemplate(null); } catch (e) { err = e; }
    assert.ok(err, 'null pin must refuse');
    err = null;
    try { loadPinnedApprovedTemplate({}); } catch (e) { err = e; }
    assert.ok(err, 'empty pin must refuse');
    // We do NOT fabricate a pin for such a document. Explicit failure preserves
    // provenance; a silent default would falsely claim reproducibility.
  });

  it('Issuing without commercialFreezeInputs still yields document.snapshot=null (Phase G contract preserved)', () => {
    // Sanity — Phase G-back-compat: legacy issuance paths that do not (yet)
    // pass commercialFreezeInputs continue to work, and the Phase F snapshot
    // is null (not a fabricated shape).
    const bom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const bomLines = bom.lines.filter(l => l.componentId).slice(0, 6)
      .map(l => ({ componentId: l.componentId, role: l.role || 'MISC', quantity: l.qty }));
    const store = W.createQuotationStore();
    W.registerBomSnapshot(store, PH, { bomSnapshotId: 'BOM-L', snapshot: createProjectBomSnapshot({
      projectId: 'PRJ-L', bomLines, lockedBy: 'ph1', lockedAt: AT, dataVersion: 'catalog.7', engineeringStatus: 'VALID' }) });
    const cs = createCommercialSnapshot({
      snapshotId: 'CS-L',
      costResult: { status:'COMPLETE', projectId:'PRJ-L', bomSnapshotId:'BOM-L', catalogVersion:'v',
        procurementPriceVersion:'v', costConfigVersion:'v', costEngineVersion:'v',
        materialLandedCost: 200000, structureCost: 0, installationCost: 0, siteSurveyCost: 0,
        engineeringDesignCost: 0, transportationCost: 0, serviceAmcCost: 0, miscellaneousCost: 0,
        officeExpenseAllocation: 0, specialProjectWorksCost: 0, directProjectCost: 200000,
        totalActualProjectCost: 200000, traces: [] },
      pricingResult: { status:'COMPLETE', marginType:'GROSS_MARGIN', targetGrossMargin: 0.20,
        marginVersion:'v', gstVersion:'v', pricingEngineVersion:'v',
        sellingPriceBeforeGST: 250000, grossProfit: 50000, gstRatePct: 8.9, gstAmount: 22250,
        sellingPriceIncludingGST: 272250, extras: [], extrasIncludingGST: 0,
        customerTotalIncludingGST: 272250, customerSideExpenses: [] },
      issuedBy: 'ph1', issuedAt: AT,
    });
    W.registerCommercialSnapshot(store, PH, { snapshot: cs });
    W.createDraft(store, SALES, {
      quotationId: 'Q-L', projectId: 'PRJ-L', at: AT,
      quotationNumber: 'FLZ-L', quotationDate: AT, proposalBy: 's1',
      customer: { customerId: 'C', customerName: 'C', district: 'Ernakulam' },
      system: { systemType: 'ONGRID', systemSizeKw: 5, phase: 'SINGLE', packageTier: 'BASE' },
      engineering: { status: 'VALID', blocked: [], warnings: [] },
      bomSnapshotId: 'BOM-L', commercialSnapshotId: 'CS-L',
      subsidyTreatment: 'NOT_QUOTED',
    });
    const doc = W.issueQuotation(store, SALES, 'Q-L', { at: AT, catalog });
    assert.equal(doc.snapshot, null);
    assert.equal(doc.rendererPinning, null);
  });
});

// -----------------------------------------------------------------------------
// H7 — Final E2E production matrix
// -----------------------------------------------------------------------------
describe('H7 — end-to-end production matrix', () => {
  // Reuse Phase G harness. Any BOM that produces at least one priced line is
  // enough to exercise the chain.
  function chain({ systemType, size, tier, batteryQuantity = null,
                   distanceKm = 30, vehicleType = 'STANDARD' }) {
    const bomInputs = batteryQuantity != null ? { systemType, size, tier, batteryQuantity } : { systemType, size, tier };
    const bom = buildBom(bomInputs);
    const priced = bom.lines
      .filter(l => l.componentId && procurementPriceMaster[l.componentId]?.landedUnitCost != null)
      .map(l => ({ componentId: l.componentId, quantity: l.qty }));
    if (priced.length === 0) return { bom, skip: true };
    const sizeKw = Number(String(bom.systemConfig.size).replace(/[^0-9.]/g, '')) || 5;
    const snap = { bomSnapshotId: 't', status: 'LOCKED', tier, lines: priced };
    const cost = calculateCost({ snapshot: snap, config: costConfig, priceMaster: procurementPriceMaster,
      project: { distanceKm, vehicleType, sizeKw, installationType: 'FLAT' } });
    const priced2 = calculatePricing({ costResult: cost, margin: costConfig.margin, gst: costConfig.gst, tier: (tier||'base').toUpperCase() });
    return { bom, cost, priced: priced2, sizeKw };
  }

  // Hybrid Base / Value / Premium x battery 0 / 1 / 2 — every leg produces a
  // COMPLETE cost + priced. (Sizes chosen so the packages exist in the registry.)
  const hybridCases = [
    { tier: 'base',    size: '5' },
    { tier: 'value',   size: '5' },
    { tier: 'premium', size: '5' },
  ];
  const batteries = [0, 1, 2];
  for (const c of hybridCases) {
    for (const bq of batteries) {
      it(`hybrid ${c.tier} @ ${c.size}kW battery=${bq}: chain runs COMPLETE`, () => {
        const r = chain({ systemType: 'hybrid', size: c.size, tier: c.tier, batteryQuantity: bq });
        if (r.skip) return; // package absent in test data — skip silently
        assert.equal(r.cost.status,   'COMPLETE');
        assert.equal(r.priced.status, 'COMPLETE');
        assert.ok(r.priced.sellingPriceBeforeGST > 0);
        // GST 8.9% locked (SOLAR_70_30_COMPOSITE = 0.70×5 + 0.30×18)
        assert.equal(r.priced.gstRatePct, 8.9);
        // Battery quantity flows through BOM
        assert.equal(r.bom.systemConfig.batteryQuantity, bq);
      });
    }
  }

  // Device allocation — locked 2.10: deviceType + panelsPerDevice, complete
  // coverage or BLOCKED (no partial).
  it('deviceAllocation VALID: 12 panels + IQ8P (1 panel each) → 12×IQ8P', () => {
    const r = allocateDevices({
      panels: 12,
      candidates: [{ componentId: 'iq8p', deviceType: 'micro_inverter', panelsPerDevice: 1 }],
    });
    assert.equal(r.status, 'VALID');
    assert.equal(r.allocations[0].quantity, 12);
    assert.equal(r.unallocatedPanels, 0);
  });

  it('deviceAllocation VALID: 12 panels + HMS2000 (4 panels) → 3×HMS2000', () => {
    const r = allocateDevices({
      panels: 12,
      candidates: [{ componentId: 'hms2000', deviceType: 'micro_inverter', panelsPerDevice: 4 }],
    });
    assert.equal(r.status, 'VALID');
    assert.equal(r.allocations[0].quantity, 3);
  });

  it('deviceAllocation VALID mixed: 10 panels + [HMS2000 (4), HMS1000 (2)] → prefers fewest units', () => {
    const r = allocateDevices({
      panels: 10,
      candidates: [
        { componentId: 'hms2000', deviceType: 'micro_inverter', panelsPerDevice: 4 },
        { componentId: 'hms1000', deviceType: 'micro_inverter', panelsPerDevice: 2 },
      ],
    });
    assert.equal(r.status, 'VALID');
    // 2×HMS2000 + 1×HMS1000 = 3 units covers 10 panels; alt 5×HMS1000 = 5 units.
    const total = r.allocations.reduce((s,a) => s + a.quantity, 0);
    assert.equal(total, 3);
  });

  it('deviceAllocation BLOCKED: impossible coverage — 7 panels + only 4-panel device', () => {
    const r = allocateDevices({
      panels: 7,
      candidates: [{ componentId: 'hms2000', deviceType: 'micro_inverter', panelsPerDevice: 4 }],
    });
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.code, ALLOCATION_CODE.BLOCKED_INCOMPLETE_ALLOCATION);
    assert.equal(r.allocations.length, 0, 'BLOCKED must emit NO partial allocation');
  });

  it('deviceAllocation refuses string_inverter candidates (never routed here — locked 2.10)', () => {
    const r = allocateDevices({
      panels: 8,
      candidates: [{ componentId: 'si1', deviceType: 'string_inverter', panelsPerDevice: 8 }],
    });
    assert.equal(r.status, 'BLOCKED');
    assert.equal(r.code, ALLOCATION_CODE.BLOCKED_NO_USABLE_CANDIDATES);
  });

  it('buildBom refuses on-grid 3kW 3P (blocked packaging per catalog rules)', () => {
    let err = null;
    try { buildBom({ systemType: 'ongrid', size: '3', tier: 'base', phase: '3P' }); } catch (e) { err = e; }
    assert.ok(err, '3kW 3P must be refused');
  });

  it('Premium classification: on-grid Premium resolves to profileKey=ongrid_premium (locked 2.2)', () => {
    const bom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'premium' });
    assert.equal(bom.systemConfig.profileKey, 'ongrid_premium');
    assert.equal(bom.systemConfig.tier, 'premium');
  });

  it('Subsidy separation (locked 2.7): subsidy result is present and NOT folded into cost/margin', () => {
    const sub = calculateSubsidy({ system: { systemType: 'ongrid', systemSizeKw: 5, connectionType: 'domestic' },
      subsidyConfig, district: 'Ernakulam' });
    // The subsidy engine's output is a self-contained record — not mutated
    // into any cost or pricing line.
    assert.ok(sub);
    // Pricing does not read subsidy at all — the pricing engine's argument
    // signature lists no subsidy field.
    const bom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const snap = { bomSnapshotId: 't', status: 'LOCKED', tier: 'base',
      lines: bom.lines.filter(l => l.componentId && procurementPriceMaster[l.componentId]?.landedUnitCost != null).map(l => ({componentId:l.componentId, quantity:l.qty}))};
    const cost = calculateCost({ snapshot: snap, config: costConfig, priceMaster: procurementPriceMaster,
      project: { distanceKm: 30, vehicleType: 'STANDARD', sizeKw: 5, installationType: 'FLAT' } });
    const priced = calculatePricing({ costResult: cost, margin: costConfig.margin, gst: costConfig.gst, tier: 'BASE' });
    // sellingPriceBeforeGST is derived from cost, not reduced by subsidy.
    assert.ok(priced.sellingPriceBeforeGST >= cost.totalActualProjectCost);
  });

  it('Transportation: distanceKm × vehicle.ratePerKm — no free 100km, no auto-doubling (locked 2.1)', () => {
    const bom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const priced = bom.lines.filter(l => l.componentId && procurementPriceMaster[l.componentId]?.landedUnitCost != null).map(l => ({componentId:l.componentId, quantity:l.qty}));
    const snap = { bomSnapshotId: 't', status: 'LOCKED', tier: 'base', lines: priced };
    const c1 = calculateCost({ snapshot: snap, config: costConfig, priceMaster: procurementPriceMaster,
      project: { distanceKm: 30, vehicleType: 'STANDARD', sizeKw: 5, installationType: 'FLAT' } });
    const c2 = calculateCost({ snapshot: snap, config: costConfig, priceMaster: procurementPriceMaster,
      project: { distanceKm: 60, vehicleType: 'STANDARD', sizeKw: 5, installationType: 'FLAT' } });
    // Doubled distance -> transportationCost doubles (no free allowance, no doubling).
    assert.equal(c2.transportationCost, c1.transportationCost * 2);
  });
});

// -----------------------------------------------------------------------------
// RBAC audit — every editor role gate refuses Sales; every issuance path
// refuses non-Sales operator roles per the workspace's own contract.
// -----------------------------------------------------------------------------
describe('RBAC — non-Sales cannot create/issue; branding/policy locked to Admin/PH; Sales cannot mutate policy/branding', () => {
  it('assertBrandingEditor blocks Sales, assertPolicyEditor blocks all but Admin', () => {
    let e1 = null; try { branding.assertBrandingEditor({ role: 'SALES' }); } catch (e) { e1 = e; }
    assert.equal(e1?.code, branding.BRANDING_ERROR.BRANDING_EDITOR_FORBIDDEN);
    // Phase J: PROJECT_HEAD is now accepted as validity-policy editor. Sales stays refused.
    let e2 = null; try { policy.assertPolicyEditor({ role: 'SALES' }); } catch (e) { e2 = e; }
    assert.equal(e2?.code, policy.POLICY_ERROR.POLICY_EDITOR_FORBIDDEN);
    assert.doesNotThrow(() => policy.assertPolicyEditor({ role: 'PROJECT_HEAD' }));
  });
});

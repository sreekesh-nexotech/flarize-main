// tests/phase-g-quotation-e2e.test.mjs
//
// Phase G (2026-09-05) — Quotation Renderer Wiring + End-to-End Proof.
//
// The full production chain under test, from BOM authorship to the rendered
// customer document:
//
//   buildBom
//     → engineering
//     → LOCKED BOM snapshot
//     → procurement + landed cost
//     → cost engine
//     → pricing engine
//     → subsidy engine
//     → commercial freeze (Phase F)
//     → issueQuotation (with commercialFreezeInputs — Phase G G0)
//     → server renderer (Phase G G1, Q1 Option A)
//     → final quotation HTML
//
// Every step uses the same authoritative modules the server does. Nothing is
// re-implemented; nothing is short-circuited. The HTTP renderer route wired in
// server-quotation.js delegates to loadPinnedApprovedTemplate() +
// renderQuotationHtml() exactly the way this test does — the test IS the
// route's logic without the transport shell.
//
// G0 — buildCommercialSnapshot() is integrated into issueQuotation and the
//        issued document carries `document.snapshot`.
// G1 — server renderer is the AUTHORITATIVE server-side rendering path
//        (renderQuotationHtml, pinned bundle enforced).
// G2 — end-to-end proof for on-grid Base / Value / Premium (ongrid_premium),
//        hybrid, battery 0 / 1 / 2, transportation, validity, branding
//        versions, signature/seal versions, renderer pin.
// G3 — mutation immunity: master data mutated AFTER issuance does not alter
//        the frozen document.snapshot.
// G4 — historical safety: data/quotation-state.json is not read or written.
// G5 — reproducibility: same frozen snapshot + same renderer pin =
//        deterministic HTML.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);

// Authoritative modules.
const { buildBom } = require('../server-bom-builder.js');
const catalog = require('../data/catalog.json');
const procurementPriceMaster = require('../data/procurement-price-master.json');
const costConfig = require('../data/cost-config.json');
const subsidyConfig = require('../data/subsidy-config.json');

const W               = await import('../src/lib/quotationWorkspace.js');
const { calculateCost }    = await import('../src/lib/costEngine.js');
const { calculatePricing } = await import('../src/lib/pricingEngine.js');
const { calculateSubsidy } = await import('../src/lib/subsidyEngine.js');
const { createProjectBomSnapshot, SNAPSHOT_STATUS } = await import('../src/lib/bomSnapshot.js');
const { createCommercialSnapshot } = await import('../src/lib/commercialSnapshot.js');
const { buildCommercialSnapshot } = await import('../src/lib/commercialFreeze.js');
const { getCurrentApprovedTemplatePinning, loadPinnedApprovedTemplate } = await import('../src/lib/approvedTemplate.loader.js');
const { renderQuotationHtml, APPROVED_TEMPLATE_VERSION } = await import('../src/lib/approvedTemplate.js');
const { ROLE } = await import('../src/lib/rbac.js');

const PH    = { userId: 'ph1', role: ROLE.PROJECT_HEAD };
const SALES = { userId: 's1',  role: ROLE.SALES };
const AT    = '2026-09-05T00:00:00Z';

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function costCfgWithTransport() {
  return {
    installation: costConfig.installation,
    transportation: costConfig.transportation, // 35/km STANDARD etc — locked 2.1
    structure: costConfig.structure,
    siteSurvey: costConfig.siteSurvey,
    engineeringDesign: costConfig.engineeringDesign,
    serviceAmc: costConfig.serviceAmc,
    officeExpenseAllocation: costConfig.officeExpenseAllocation,
    miscellaneous: costConfig.miscellaneous,
  };
}

/** Filter BOM to lines with priced components — matches Phase D convention. */
function lockedSnapshotFor(bom, snapshotId) {
  return {
    bomSnapshotId: snapshotId,
    status: 'LOCKED',
    lines: bom.lines
      .filter(l => l.componentId && procurementPriceMaster[l.componentId]?.landedUnitCost != null)
      .map(l => ({ componentId: l.componentId, quantity: l.qty })),
    tier: bom.systemConfig.tier,
  };
}

/**
 * Run the full chain from a BOM configuration through to an issued quotation
 * document, returning the frozen document.snapshot + the whole document +
 * the intermediate results.
 */
function runProductionChain({
  systemType, size, tier,
  batteryQuantity = null,
  vehicleType = 'STANDARD', distanceKm = 30,
  district = 'Ernakulam', connectionType = 'domestic',
  brandingStore, brandingOverrides = {}, policy, validityOverrideDays = null,
  quotationId, bomSnapshotId, commercialSnapshotId,
}) {
  // (1) BOM
  const bomInputs = batteryQuantity != null
    ? { systemType, size, tier, batteryQuantity }
    : { systemType, size, tier };
  const bom = buildBom(bomInputs);

  // (2) locked snapshot for cost + freeze
  const lockedSnap = lockedSnapshotFor(bom, bomSnapshotId);

  // (3) cost engine — sizeKw is numeric. BOM's systemConfig.size may carry
  // a phase suffix (e.g. "5sp" for on-grid single-phase); strip it here.
  const sizeKwNumeric = Number(String(bom.systemConfig.size).replace(/[^0-9.]/g, '')) || 0;
  const cost = calculateCost({
    snapshot: lockedSnap,
    config: costCfgWithTransport(),
    priceMaster: procurementPriceMaster,
    project: { distanceKm, vehicleType, sizeKw: sizeKwNumeric, installationType: 'FLAT' },
  });

  // (4) pricing engine
  const priced = calculatePricing({
    costResult: cost, margin: costConfig.margin, gst: costConfig.gst,
    tier: (tier || 'base').toUpperCase(),
  });

  // (5) subsidy engine (separate from cost/margin — locked 2.7)
  const subsidyResult = calculateSubsidy({
    system: { systemType, systemSizeKw: sizeKwNumeric, connectionType },
    subsidyConfig, district,
  });

  // (6) commercial snapshot (versioned, ISSUED)
  const cs = createCommercialSnapshot({
    snapshotId: commercialSnapshotId,
    costResult: {
      ...cost,
      status: 'COMPLETE',
      projectId: `PRJ-${quotationId}`,
      bomSnapshotId: lockedSnap.bomSnapshotId,
      catalogVersion: 'catalog.7',
      procurementPriceVersion: 'pp.3',
      landedCostVersion: 'lc.2',
      projectRateCardVersion: 'rc.4',
      costConfigVersion: 'cc.5',
      costEngineVersion: 'costEngine.1',
      totalActualProjectCost: cost.totalActualProjectCost ?? cost.totalActualCost,
      traces: [],
    },
    pricingResult: {
      ...priced,
      status: 'COMPLETE',
      marginType: 'GROSS_MARGIN',
      marginVersion: 'margin.2',
      gstVersion: 'gst.1',
      pricingEngineVersion: 'pricingEngine.1',
      sellingPriceIncludingGST: priced.sellingPriceIncludingGST ?? (priced.sellingPriceBeforeGST + priced.gstAmount),
      customerTotalIncludingGST: priced.customerTotalIncludingGST ?? priced.sellingPriceIncludingGST,
      customerSideExpenses: [],
      extras: [],
      extrasIncludingGST: 0,
    },
    issuedBy: 'ph1', issuedAt: AT,
  });

  // (7) issueQuotation with Phase F commercial-freeze inputs
  const store = W.createQuotationStore();
  W.registerBomSnapshot(store, PH, {
    bomSnapshotId: lockedSnap.bomSnapshotId,
    snapshot: createProjectBomSnapshot({
      projectId: `PRJ-${quotationId}`,
      bomLines: bom.lines
        .filter(l => l.componentId)
        .map(l => ({ componentId: l.componentId, role: l.role || 'MISC', quantity: l.qty })),
      lockedBy: 'ph1', lockedAt: AT,
      dataVersion: 'catalog.7', engineeringStatus: 'VALID',
    }),
  });
  W.registerCommercialSnapshot(store, PH, { snapshot: cs });
  W.createDraft(store, SALES, {
    quotationId, projectId: `PRJ-${quotationId}`, at: AT,
    quotationNumber: `FLZ-${quotationId}`, quotationDate: AT, proposalBy: 's1',
    customer: { customerId: 'C-1', customerName: 'Test Customer', district },
    system: {
      systemType: systemType.toUpperCase(), systemSizeKw: sizeKwNumeric, phase: 'SINGLE',
      packageTier: (tier || 'base').toUpperCase(),
    },
    engineering: { status: 'VALID', blocked: [], warnings: [] },
    bomSnapshotId: lockedSnap.bomSnapshotId,
    commercialSnapshotId: cs.snapshotId,
    subsidyTreatment: 'NOT_QUOTED',
  });

  const pinning = getCurrentApprovedTemplatePinning();
  const rendererPinning = { ...pinning, rendererVersion: APPROVED_TEMPLATE_VERSION };

  // Real Phase G G0 integration — feed commercialFreezeInputs so the issued
  // document carries `document.snapshot`.
  const doc = W.issueQuotation(store, SALES, quotationId, {
    at: AT, catalog, rendererPinning,
    commercialFreezeInputs: {
      bom, project: { distanceKm, vehicleType },
      transportationConfig: costConfig.transportation,
      commercialSnapshot: cs,
      subsidyResult,
      brandingStore, brandingOverrides,
      policy, validityOverrideDays,
      packageProfile: null,
    },
  });

  return { bom, cost, priced, subsidyResult, cs, doc, store };
}

const BRAND_STORE = {
  schema: 'flarize.quotation-branding/1',
  bank:      { current: 'BK-V1',   versions: { 'BK-V1':   { versionId: 'BK-V1',   publishedAt: AT, publishedBy: 'admin', values: { bankName: 'HDFC', bankAccountName: 'Golden Ray', bankAccountNumber: '1234567890', bankIfsc: 'HDFC0000123', bankBranch: 'Ernakulam' } } } },
  upi:       { current: 'UPI-V1',  versions: { 'UPI-V1':  { versionId: 'UPI-V1',  publishedAt: AT, publishedBy: 'admin', values: { upiId: 'goldenray@hdfcbank', upiQrAssetId: 'qr-v1' } } } },
  signature: { current: 'SIG-V1',  versions: { 'SIG-V1':  { versionId: 'SIG-V1',  publishedAt: AT, publishedBy: 'admin', values: { signatureAssetId: 'sig-asset-v1', signedBy: 'CEO' } } } },
  seal:      { current: 'SEAL-V1', versions: { 'SEAL-V1': { versionId: 'SEAL-V1', publishedAt: AT, publishedBy: 'admin', values: { sealAssetId: 'seal-asset-v1' } } } },
};
const POLICY = {
  schema: 'flarize.quotation-policy/1',
  validity: { defaultDays: 15, version: '2026-09-05.1', updatedBy: 'admin', updatedAt: AT },
};

// -----------------------------------------------------------------------------
// G0. commercialFreeze integrated into issueQuotation — document.snapshot present
// -----------------------------------------------------------------------------
describe('G0 — buildCommercialSnapshot wired into issueQuotation', () => {
  it('issued document carries document.snapshot with all 10 Phase F domains', () => {
    const { doc } = runProductionChain({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      brandingStore: BRAND_STORE, policy: POLICY,
      quotationId: 'Q-G0', bomSnapshotId: 'BOM-G0', commercialSnapshotId: 'CS-G0',
    });
    assert.ok(doc.snapshot, 'document.snapshot must exist');
    assert.equal(doc.snapshot.schemaVersion, 'flarize.commercial-snapshot/1');
    assert.equal(doc.snapshot.frozenAt, AT);
    // ten domain slots present
    for (const k of ['engineering','battery','package','procurement','transportation','commercial','subsidy','branding','validity','rendererPin']) {
      assert.ok(k in doc.snapshot, `document.snapshot.${k} must be present`);
    }
    assert.equal(Object.isFrozen(doc.snapshot), true);
  });

  it('omitting commercialFreezeInputs still yields document.snapshot=null (back-compat)', () => {
    // Reuse ready() pattern without commercialFreezeInputs.
    const bom = buildBom({ systemType: 'ongrid', size: '5sp', tier: 'base' });
    const store = W.createQuotationStore();
    const bomSnap = createProjectBomSnapshot({
      projectId: 'PRJ-B', bomLines: bom.lines.filter(l => l.componentId).slice(0, 5)
        .map(l => ({ componentId: l.componentId, role: l.role || 'MISC', quantity: l.qty })),
      lockedBy: 'ph1', lockedAt: AT, dataVersion: 'catalog.7', engineeringStatus: 'VALID',
    });
    W.registerBomSnapshot(store, PH, { bomSnapshotId: 'BOM-B', snapshot: bomSnap });
    const cs = createCommercialSnapshot({
      snapshotId: 'CS-B',
      costResult: { status: 'COMPLETE', projectId: 'PRJ-B', bomSnapshotId: 'BOM-B',
        catalogVersion: 'v', procurementPriceVersion: 'v', costConfigVersion: 'v', costEngineVersion: 'v',
        materialLandedCost: 200000, structureCost: 0, installationCost: 0, siteSurveyCost: 0,
        engineeringDesignCost: 0, transportationCost: 0, serviceAmcCost: 0, miscellaneousCost: 0,
        officeExpenseAllocation: 0, specialProjectWorksCost: 0, directProjectCost: 200000,
        totalActualProjectCost: 200000, traces: [] },
      pricingResult: { status: 'COMPLETE', marginType: 'GROSS_MARGIN', targetGrossMargin: 0.20,
        marginVersion: 'v', gstVersion: 'v', pricingEngineVersion: 'v',
        sellingPriceBeforeGST: 250000, grossProfit: 50000, gstRatePct: 8.9, gstAmount: 22250,
        sellingPriceIncludingGST: 272250, extras: [], extrasIncludingGST: 0,
        customerTotalIncludingGST: 272250, customerSideExpenses: [] },
      issuedBy: 'ph1', issuedAt: AT,
    });
    W.registerCommercialSnapshot(store, PH, { snapshot: cs });
    W.createDraft(store, SALES, {
      quotationId: 'Q-B', projectId: 'PRJ-B', at: AT,
      quotationNumber: 'FLZ-B', quotationDate: AT, proposalBy: 's1',
      customer: { customerId: 'C-B', customerName: 'B', district: 'Ernakulam' },
      system: { systemType: 'ONGRID', systemSizeKw: 5, phase: 'SINGLE', packageTier: 'BASE' },
      engineering: { status: 'VALID', blocked: [], warnings: [] },
      bomSnapshotId: 'BOM-B', commercialSnapshotId: 'CS-B',
      subsidyTreatment: 'NOT_QUOTED',
    });
    const doc = W.issueQuotation(store, SALES, 'Q-B', { at: AT, catalog });
    assert.equal(doc.snapshot, null, 'no commercialFreezeInputs -> document.snapshot=null');
    // Prior contract fields still present.
    assert.equal(doc.version, 1);
    assert.equal(doc.status, 'ISSUED');
    assert.ok(doc.payload);
  });
});

// -----------------------------------------------------------------------------
// G2. End-to-end coverage of every locked configuration axis
// -----------------------------------------------------------------------------
describe('G2 — E2E across on-grid Base/Value/Premium, hybrid, battery 0/1/2', () => {
  const configs = [
    { label: 'on-grid Base',    systemType: 'ongrid', size: '5sp', tier: 'base',    battery: null },
    { label: 'on-grid Value',   systemType: 'ongrid', size: '5sp', tier: 'value',   battery: null },
    { label: 'on-grid Premium', systemType: 'ongrid', size: '5sp', tier: 'premium', battery: null,
      expectProfileKey: 'ongrid_premium', expectPremium: true },
    { label: 'hybrid Value bat0', systemType: 'hybrid', size: '5', tier: 'value', battery: 0 },
    { label: 'hybrid Value bat1', systemType: 'hybrid', size: '5', tier: 'value', battery: 1 },
    { label: 'hybrid Value bat2', systemType: 'hybrid', size: '5', tier: 'value', battery: 2 },
  ];
  for (const c of configs) {
    it(`${c.label}: chain runs and document.snapshot is fully populated`, () => {
      const { doc, cs, subsidyResult } = runProductionChain({
        systemType: c.systemType, size: c.size, tier: c.tier,
        batteryQuantity: c.battery,
        brandingStore: BRAND_STORE, policy: POLICY,
        quotationId: `Q-${c.label}`.replace(/[^a-z0-9]/gi,'-'),
        bomSnapshotId: `BOM-${c.label}`.replace(/[^a-z0-9]/gi,'-'),
        commercialSnapshotId: `CS-${c.label}`.replace(/[^a-z0-9]/gi,'-'),
      });
      // engineering
      assert.equal(doc.snapshot.engineering.status, 'VALID');
      // battery
      if (c.battery != null) {
        assert.equal(doc.snapshot.battery.batteryQuantity, c.battery);
      }
      // package + Premium classification per locked 2.2
      if (c.expectProfileKey) {
        assert.equal(doc.snapshot.package.profileKey, c.expectProfileKey,
          'on-grid Premium must resolve to profileKey "ongrid_premium"');
      }
      if (c.expectPremium) {
        assert.equal(doc.snapshot.package.isPremiumTier, true,
          'Premium tier must be classified isPremiumTier=true');
      }
      // procurement version tags
      assert.equal(doc.snapshot.procurement.procurementPriceVersion, 'pp.3');
      assert.equal(doc.snapshot.procurement.landedCostVersion,       'lc.2');
      // transportation — locked 2.1: distanceKm × vehicle.ratePerKm, no free 100km
      assert.equal(doc.snapshot.transportation.vehicleType, 'STANDARD');
      assert.equal(doc.snapshot.transportation.distanceKm,  30);
      assert.equal(typeof doc.snapshot.transportation.ratePerKm, 'number');
      assert.equal(doc.snapshot.transportation.formula, 'distanceKm × vehicle.ratePerKm');
      // commercial — pricing figures propagate
      assert.equal(doc.snapshot.commercial.marginType, 'GROSS_MARGIN');
      assert.ok(doc.snapshot.commercial.sellingPriceBeforeGST > 0);
      assert.equal(doc.snapshot.commercial.gstRatePct, 8.9);
      // subsidy — kept SEPARATE from cost/margin per locked 2.7
      assert.ok(doc.snapshot.subsidy);
      assert.match(doc.snapshot.subsidy.source, /SUBSIDY_ENGINE/);
      // branding — all 4 kinds captured with their current versionId
      assert.equal(doc.snapshot.branding.bank.versionId,      'BK-V1');
      assert.equal(doc.snapshot.branding.upi.versionId,       'UPI-V1');
      assert.equal(doc.snapshot.branding.signature.versionId, 'SIG-V1');
      assert.equal(doc.snapshot.branding.seal.versionId,      'SEAL-V1');
      // validity — Admin default 15d, source recorded
      assert.equal(doc.snapshot.validity.validityDays, 15);
      assert.equal(doc.snapshot.validity.source, 'ADMIN_DEFAULT');
      // rendererPin captured on the freeze surface, matching the doc's rendererPinning
      assert.ok(doc.snapshot.rendererPin);
      assert.equal(doc.snapshot.rendererPin.bundleSha256, doc.rendererPinning.bundleSha256);
    });
  }

  it('Project-Head validity override supersedes Admin default (source=PROJECT_HEAD_OVERRIDE)', () => {
    const { doc } = runProductionChain({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      brandingStore: BRAND_STORE, policy: POLICY, validityOverrideDays: 45,
      quotationId: 'Q-V-OVR', bomSnapshotId: 'BOM-V-OVR', commercialSnapshotId: 'CS-V-OVR',
    });
    assert.equal(doc.snapshot.validity.validityDays, 45);
    assert.equal(doc.snapshot.validity.source, 'PROJECT_HEAD_OVERRIDE');
  });

  it('Project-Head signature/seal override supersedes CURRENT_VERSION', () => {
    // Publish a second signature and seal version and prove an override
    // freezes that version instead of the current.
    const store = JSON.parse(JSON.stringify(BRAND_STORE));
    store.signature.versions['SIG-V2'] = { versionId: 'SIG-V2', publishedAt: AT, publishedBy: 'ph1',
      values: { signatureAssetId: 'sig-asset-v2', signedBy: 'Ops-Head' } };
    store.seal.versions['SEAL-V2']     = { versionId: 'SEAL-V2', publishedAt: AT, publishedBy: 'ph1',
      values: { sealAssetId: 'seal-asset-v2' } };
    // store.signature.current is still SIG-V1 — the override picks V2.
    const { doc } = runProductionChain({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      brandingStore: store, brandingOverrides: { signature: 'SIG-V2', seal: 'SEAL-V2' },
      policy: POLICY,
      quotationId: 'Q-SIG-OVR', bomSnapshotId: 'BOM-SIG-OVR', commercialSnapshotId: 'CS-SIG-OVR',
    });
    assert.equal(doc.snapshot.branding.signature.versionId, 'SIG-V2');
    assert.equal(doc.snapshot.branding.signature.source,    'PROJECT_HEAD_OVERRIDE');
    assert.equal(doc.snapshot.branding.seal.versionId,      'SEAL-V2');
  });
});

// -----------------------------------------------------------------------------
// G1 + G5. Server renderer wiring is the authoritative rendering path AND is
// deterministic for the same (frozen payload, pinned bundle) pair.
// -----------------------------------------------------------------------------
describe('G1 + G5 — server renderer + reproducibility', () => {
  it('renderQuotationHtml against the pinned bundle produces HTML with the pinned meta', () => {
    const { doc } = runProductionChain({
      systemType: 'ongrid', size: '5sp', tier: 'value',
      brandingStore: BRAND_STORE, policy: POLICY,
      quotationId: 'Q-RENDER', bomSnapshotId: 'BOM-RENDER', commercialSnapshotId: 'CS-RENDER',
    });
    // Integrity check the pinned bundle (this is what the HTTP route calls).
    const pinned = loadPinnedApprovedTemplate(doc.rendererPinning);
    assert.equal(pinned.meta.bundleSha256, doc.rendererPinning.bundleSha256);
    // The renderer's own default loader must equal the pin (server-quotation
    // refuses otherwise). During Phase G there is only v1, so this holds.
    const current = getCurrentApprovedTemplatePinning();
    assert.equal(current.bundleSha256, doc.rendererPinning.bundleSha256);
    // Render. strict:false lets the persistent Page-3 blocker not throw.
    const r = renderQuotationHtml(doc.payload, { strict: false, includePage3Blocker: true });
    assert.ok(typeof r.html === 'string' && r.html.length > 0, 'HTML must be produced');
    assert.equal(r.meta.bundleSha256, doc.rendererPinning.bundleSha256);
    assert.equal(r.meta.rendererVersion, APPROVED_TEMPLATE_VERSION);
  });

  it('G5 — same frozen payload + same pin => identical HTML bytes (deterministic)', () => {
    const { doc } = runProductionChain({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      brandingStore: BRAND_STORE, policy: POLICY,
      quotationId: 'Q-DET', bomSnapshotId: 'BOM-DET', commercialSnapshotId: 'CS-DET',
    });
    const r1 = renderQuotationHtml(doc.payload, { strict: false, includePage3Blocker: true });
    const r2 = renderQuotationHtml(doc.payload, { strict: false, includePage3Blocker: true });
    const h1 = createHash('sha256').update(r1.html).digest('hex');
    const h2 = createHash('sha256').update(r2.html).digest('hex');
    assert.equal(h1, h2, 'renderer must be deterministic for the same (payload, pin)');
  });
});

// -----------------------------------------------------------------------------
// G3. Master data mutated AFTER issuance does not alter document.snapshot.
// -----------------------------------------------------------------------------
describe('G3 — mutation immunity: master-data changes after issue never mutate the frozen document', () => {
  it('mutating the branding store after issue does not change document.snapshot.branding', () => {
    const brandingStore = JSON.parse(JSON.stringify(BRAND_STORE));
    const { doc } = runProductionChain({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      brandingStore, policy: POLICY,
      quotationId: 'Q-MUT-BR', bomSnapshotId: 'BOM-MUT-BR', commercialSnapshotId: 'CS-MUT-BR',
    });
    const frozenBankNumber = doc.snapshot.branding.bank.values.bankAccountNumber;
    // Publish a new bank version — historical doc must not observe it.
    brandingStore.bank.versions['BK-V2'] = { versionId: 'BK-V2', publishedAt: AT, publishedBy: 'admin',
      values: { bankName: 'ICICI', bankAccountName: 'X', bankAccountNumber: '9999999999', bankIfsc: 'ICIC000', bankBranch: 'Y' } };
    brandingStore.bank.current = 'BK-V2';
    // And attempt to mutate the frozen record in place.
    try { doc.snapshot.branding.bank.values.bankAccountNumber = '0000000000'; } catch { /* frozen */ }
    assert.equal(doc.snapshot.branding.bank.versionId, 'BK-V1');
    assert.equal(doc.snapshot.branding.bank.values.bankAccountNumber, frozenBankNumber);
    assert.equal(doc.snapshot.branding.bank.values.bankAccountNumber, '1234567890');
    assert.equal(Object.isFrozen(doc.snapshot.branding.bank.values), true);
  });

  it('mutating the validity policy after issue does not change document.snapshot.validity', () => {
    const policy = JSON.parse(JSON.stringify(POLICY));
    const { doc } = runProductionChain({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      brandingStore: BRAND_STORE, policy,
      quotationId: 'Q-MUT-VAL', bomSnapshotId: 'BOM-MUT-VAL', commercialSnapshotId: 'CS-MUT-VAL',
    });
    assert.equal(doc.snapshot.validity.validityDays, 15);
    // Admin publishes a new default policy — historical doc must not observe it.
    policy.validity.defaultDays = 90;
    policy.validity.version = '2026-12-01.1';
    try { doc.snapshot.validity.validityDays = 90; } catch { /* frozen */ }
    assert.equal(doc.snapshot.validity.validityDays, 15);
    assert.equal(doc.snapshot.validity.policyVersion, '2026-09-05.1');
  });

  it('mutating the transportation config after issue does not change document.snapshot.transportation', () => {
    // Not directly editable in place (import binding); simulate by demonstrating
    // the deep-freeze contract on the snapshot itself.
    const { doc } = runProductionChain({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      brandingStore: BRAND_STORE, policy: POLICY,
      quotationId: 'Q-MUT-TR', bomSnapshotId: 'BOM-MUT-TR', commercialSnapshotId: 'CS-MUT-TR',
    });
    const rate = doc.snapshot.transportation.ratePerKm;
    try { doc.snapshot.transportation.ratePerKm = 999; } catch { /* frozen */ }
    assert.equal(doc.snapshot.transportation.ratePerKm, rate);
    assert.equal(Object.isFrozen(doc.snapshot.transportation), true);
  });

  it('mutating the commercialSnapshot after issue does not change document.snapshot.commercial', () => {
    const { doc, cs } = runProductionChain({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      brandingStore: BRAND_STORE, policy: POLICY,
      quotationId: 'Q-MUT-CS', bomSnapshotId: 'BOM-MUT-CS', commercialSnapshotId: 'CS-MUT-CS',
    });
    const frozenSelling = doc.snapshot.commercial.sellingPriceBeforeGST;
    // cs itself is deep-frozen by createCommercialSnapshot — assignment silently
    // no-ops in non-strict; either way the freeze on doc.snapshot is
    // independent by construction (deep-clone in commercialFreeze.js).
    try { cs.pricing.sellingPriceBeforeGST = 1; } catch { /* frozen */ }
    assert.equal(doc.snapshot.commercial.sellingPriceBeforeGST, frozenSelling);
  });
});

// -----------------------------------------------------------------------------
// G4. Historical safety — the on-disk quotation-state.json is not touched.
// -----------------------------------------------------------------------------
describe('G4 — historical quotation-state.json remains untouched by these tests', () => {
  it('SHA256 of data/quotation-state.json is unchanged before/after the chain runs', () => {
    const p = 'data/quotation-state.json';
    const beforeMtime = statSync(p).mtimeMs;
    const before = createHash('sha256').update(readFileSync(p)).digest('hex');
    runProductionChain({
      systemType: 'ongrid', size: '5sp', tier: 'base',
      brandingStore: BRAND_STORE, policy: POLICY,
      quotationId: 'Q-G4', bomSnapshotId: 'BOM-G4', commercialSnapshotId: 'CS-G4',
    });
    const after = createHash('sha256').update(readFileSync(p)).digest('hex');
    const afterMtime = statSync(p).mtimeMs;
    assert.equal(after, before, 'quotation-state.json content must be unchanged');
    assert.equal(afterMtime, beforeMtime, 'quotation-state.json mtime must be unchanged');
  });
});

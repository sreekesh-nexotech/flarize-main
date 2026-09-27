/**
 * C11-H — CMS ↔ Quotation Integration tests.
 *
 * Verifies:
 * - Active CMS campaign flows into quotation payload
 * - CMS page version snapshot captured at issuance
 * - Changing CMS after issuance does NOT change issued quotation
 * - No calculation logic in the integration
 * - campaignResult contract compatibility
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createCmsStore, createPage, createPageVersion, updatePage,
  updatePageVersionContent, updatePageVersionStatus, freezePageVersion,
  createCampaign, updateCampaign, PAGE_STATUS, CAMPAIGN_STATUS,
  getActiveCampaign,
} from '../src/lib/cmsStore.js';
import { createQuotationStore, buildPayload, issueQuotation,
  createDraft, setQuotationFields, registerBomSnapshot,
  registerCommercialSnapshot,
} from '../src/lib/quotationWorkspace.js';
import { SNAPSHOT_STATUS } from '../src/lib/bomSnapshot.js';
import { COMMERCIAL_SNAPSHOT_STATUS } from '../src/lib/commercialSnapshot.js';
import { ROLES } from '../src/lib/bomRoles.js';

const ADMIN = { userId: 'admin', role: 'ADMIN' };
const PH = { userId: 'ph1', role: 'PROJECT_HEAD' };
const SALES = { userId: 'sales1', role: 'SALES' };
const AT = '2026-08-20T00:00:00Z';
const AT2 = '2026-08-21T00:00:00Z';

// ── Fixtures ────────────────────────────────────────────────────────────

function makeBomSnapshot() {
  return {
    projectId: 'proj_test',
    status: SNAPSHOT_STATUS.LOCKED,
    lockedAt: AT,
    lockedBy: 'ph1',
    lines: [
      { componentId: 'p1', role: ROLES.PANEL, quantity: 9 },
      { componentId: 'i1', role: ROLES.INVERTER, quantity: 1 },
    ],
    engineeringResult: {
      status: 'PASS',
      findings: [],
      checkedAt: AT,
    },
  };
}

function makeCommercialSnapshot() {
  return {
    snapshotId: 'cs_test',
    status: COMMERCIAL_SNAPSHOT_STATUS.ISSUED,
    issuedAt: AT,
    issuedBy: 'ph1',
    pricing: {
      sellingPriceBeforeGST: 500000,
      gstAmount: 65000,
      sellingPriceIncludingGST: 565000,
      customerTotalIncludingGST: 565000,
    },
    costs: { totalCost: 400000 },
  };
}

/** Set up a CMS store with an active campaign. */
function setupCmsWithActiveCampaign() {
  const cmsStore = createCmsStore();

  // Create page
  const page = createPage(cmsStore, { name: 'Campaign Page', pageType: 'campaign', createdBy: 'admin' });
  const version = createPageVersion(cmsStore, { pageId: page.pageId, content: {}, createdBy: 'admin' });
  updatePage(cmsStore, page.pageId, { currentVersionId: version.versionId });

  // Publish the page
  updatePageVersionStatus(cmsStore, version.versionId, PAGE_STATUS.REVIEW);
  updatePageVersionStatus(cmsStore, version.versionId, PAGE_STATUS.APPROVED);
  freezePageVersion(cmsStore, version.versionId);
  updatePage(cmsStore, page.pageId, {
    status: PAGE_STATUS.PUBLISHED,
    publishedVersionId: version.versionId,
  });

  // Create campaign with page
  const campaign = createCampaign(cmsStore, { name: 'Summer Sale', createdBy: 'admin' });
  updateCampaign(cmsStore, campaign.campaignId, { pageIds: [page.pageId] });

  // Activate
  updateCampaign(cmsStore, campaign.campaignId, {
    status: CAMPAIGN_STATUS.ACTIVE,
    activatedAt: AT,
  });

  return { cmsStore, page, version, campaign };
}

/** Set up a quotation store with registered snapshots and a draft. */
function setupQuotationDraft(cmsStore) {
  const qStore = createQuotationStore();

  registerBomSnapshot(qStore, PH, {
    bomSnapshotId: 'bom_test',
    snapshot: makeBomSnapshot(),
  });
  registerCommercialSnapshot(qStore, PH, {
    snapshot: makeCommercialSnapshot(),
  });

  createDraft(qStore, SALES, {
    quotationId: 'q_test',
    at: AT,
    quotationNumber: 'QT-001',
    quotationDate: AT,
    validUntil: '2026-09-20',
    bomSnapshotId: 'bom_test',
    commercialSnapshotId: 'cs_test',
    customer: { customerId: 'C-1', customerName: 'Test Customer' },
    system: { systemType: 'ONGRID', systemSizeKw: 3, phase: 'SINGLE' },
    engineering: { status: 'VALID', blocked: [], warnings: [] },
    subsidyTreatment: 'NOT_QUOTED',
  });

  return qStore;
}

// ── Campaign in payload ─────────────────────────────────────────────────

describe('CMS → Quotation: campaign in payload', () => {
  test('buildPayload includes campaign when CMS has active campaign', () => {
    const { cmsStore } = setupCmsWithActiveCampaign();
    const qStore = setupQuotationDraft(cmsStore);

    const payload = buildPayload(qStore, SALES, 'q_test', { cmsStore });
    assert.ok(payload.campaign, 'payload must have campaign section');
    assert.equal(payload.campaign.available, true);
    assert.equal(payload.campaign.source, 'CMS');
    assert.equal(payload.campaign.value.name, 'Summer Sale');
    assert.equal(payload.campaign.value.active, true);
  });

  test('buildPayload has blocked campaign section when no CMS store', () => {
    const qStore = setupQuotationDraft(null);

    const payload = buildPayload(qStore, SALES, 'q_test', { cmsStore: null });
    assert.ok(payload.campaign, 'campaign section exists');
    assert.equal(payload.campaign.available, false);
  });

  test('buildPayload has blocked campaign when CMS has no active campaign', () => {
    const cmsStore = createCmsStore(); // empty store, no active campaign
    const qStore = setupQuotationDraft(cmsStore);

    const payload = buildPayload(qStore, SALES, 'q_test', { cmsStore });
    assert.equal(payload.campaign.available, false);
  });
});

// ── Issuance with CMS ───────────────────────────────────────────────────

describe('CMS → Quotation: issuance', () => {
  test('issued document captures cmsPageVersions', () => {
    const { cmsStore, page, version } = setupCmsWithActiveCampaign();
    const qStore = setupQuotationDraft(cmsStore);

    const doc = issueQuotation(qStore, SALES, 'q_test', { at: AT, cmsStore });
    assert.ok(doc.cmsPageVersions, 'document must have cmsPageVersions');
    assert.equal(doc.cmsPageVersions[page.pageId], version.versionId);
  });

  test('issued document campaign is frozen', () => {
    const { cmsStore } = setupCmsWithActiveCampaign();
    const qStore = setupQuotationDraft(cmsStore);

    const doc = issueQuotation(qStore, SALES, 'q_test', { at: AT, cmsStore });
    assert.ok(Object.isFrozen(doc));
    assert.ok(Object.isFrozen(doc.payload));
    if (doc.payload.campaign?.available) {
      assert.ok(Object.isFrozen(doc.payload.campaign));
    }
  });

  test('issued document without CMS still works (cmsPageVersions null)', () => {
    const qStore = setupQuotationDraft(null);

    const doc = issueQuotation(qStore, SALES, 'q_test', { at: AT });
    assert.equal(doc.cmsPageVersions, null);
    assert.equal(doc.payload.campaign.available, false);
  });
});

// ── Immutability guarantee ──────────────────────────────────────────────

describe('CMS → Quotation: immutability', () => {
  test('changing CMS campaign after issuance does NOT change issued document', () => {
    const { cmsStore, campaign } = setupCmsWithActiveCampaign();
    const qStore = setupQuotationDraft(cmsStore);

    // Issue with current campaign
    const doc = issueQuotation(qStore, SALES, 'q_test', { at: AT, cmsStore });
    const issuedName = doc.payload.campaign.value.name;

    // Now change campaign name in CMS
    updateCampaign(cmsStore, campaign.campaignId, { name: 'Winter Sale' });

    // Issued document must still have old name (frozen)
    assert.equal(doc.payload.campaign.value.name, issuedName);
    assert.equal(doc.payload.campaign.value.name, 'Summer Sale');

    // Verify document is deeply frozen
    assert.ok(Object.isFrozen(doc.payload.campaign.value));
  });

  test('deactivating CMS campaign after issuance does NOT affect document', () => {
    const { cmsStore, campaign } = setupCmsWithActiveCampaign();
    const qStore = setupQuotationDraft(cmsStore);

    const doc = issueQuotation(qStore, SALES, 'q_test', { at: AT, cmsStore });
    assert.equal(doc.payload.campaign.available, true);

    // Deactivate campaign
    updateCampaign(cmsStore, campaign.campaignId, {
      status: CAMPAIGN_STATUS.INACTIVE,
      deactivatedAt: AT2,
    });

    // Issued document still shows campaign as available
    assert.equal(doc.payload.campaign.available, true);
  });
});

// ── SECURITY: no calculation logic ──────────────────────────────────────

describe('SECURITY — CMS quotation integration', () => {
  test('quotationWorkspace.js still has no cost/pricing engine import', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/quotationWorkspace.js', 'utf-8');
    // Must not import cost/pricing engines
    const forbidden = [
      /from\s+['"]\.\/costEngine/,
      /from\s+['"]\.\/pricingEngine/,
      /from\s+['"]\.\/money/,
      /calculatePrice/i,
      /calculateCost/i,
      /calculateGst/i,
      /calculateMargin/i,
    ];
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(src), `quotationWorkspace must not contain ${pattern}`);
    }
  });

  test('CMS integration adds no calculation — only lookup and snapshot', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/quotationWorkspace.js', 'utf-8');
    // The CMS integration functions must not contain arithmetic operators on money
    // (this is a rough heuristic)
    const cmsSection = src.slice(src.indexOf('resolveCampaignResult'), src.indexOf('buildPayload'));
    assert.ok(!cmsSection.includes('* 100'), 'No money arithmetic in CMS integration');
    assert.ok(!cmsSection.includes('/ 100'), 'No money arithmetic in CMS integration');
    assert.ok(!cmsSection.includes('Math.round'), 'No rounding in CMS integration');
  });
});

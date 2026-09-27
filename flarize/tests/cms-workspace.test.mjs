/**
 * C11-F — CMS Workspace (service layer) tests.
 * Page CRUD, workflow, campaigns, RBAC enforcement, immutability.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import * as CMS from '../src/lib/cmsWorkspace.js';
import * as RBAC from '../src/lib/rbac.js';
import { createCmsStore, PAGE_STATUS, CAMPAIGN_STATUS, CMS_ERROR } from '../src/lib/cmsStore.js';
import { SCHEMA_VERSION, A4_WIDTH, A4_HEIGHT, PAGE_TYPE } from '../src/lib/cmsPageSchema.js';

const TEST_ASSETS_DIR = join(process.cwd(), 'tests', '_test-cms-workspace-assets');
const ADMIN = { userId: 'admin1', role: 'ADMIN' };
const PH = { userId: 'ph1', role: 'PROJECT_HEAD' };
const SALES = { userId: 's1', role: 'SALES' };

function fresh() {
  return createCmsStore();
}

function setup() {
  if (!existsSync(TEST_ASSETS_DIR)) mkdirSync(TEST_ASSETS_DIR, { recursive: true });
  return fresh();
}

function cleanup() {
  if (existsSync(TEST_ASSETS_DIR)) rmSync(TEST_ASSETS_DIR, { recursive: true, force: true });
}

// Minimal valid page content for submission
function validContent() {
  return {
    schemaVersion: SCHEMA_VERSION,
    pageType: PAGE_TYPE.CAMPAIGN,
    width: A4_WIDTH,
    height: A4_HEIGHT,
    sections: [
      { id: 's1', blockType: 'section', children: [
        { id: 't1', blockType: 'text', content: 'Hello World' },
      ]},
    ],
  };
}

// Minimal PNG for asset tests
function minimalPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );
}

// ── PAGE CRUD ────────────────────────────────────────────────────────

describe('page CRUD', () => {
  test('ADMIN can create page', () => {
    const s = fresh();
    const { page, version } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'Test', pageType: 'campaign' });
    assert.ok(page.pageId);
    assert.equal(page.name, 'Test');
    assert.ok(version.versionId);
    assert.equal(page.currentVersionId, version.versionId);
  });

  test('PROJECT_HEAD can create page', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, PH, { name: 'PH Page', pageType: 'campaign' });
    assert.ok(page.pageId);
  });

  test('SALES cannot create page', () => {
    const s = fresh();
    assert.throws(() => CMS.pageCreate(s, RBAC, SALES, { name: 'X', pageType: 'campaign' }),
      e => e.code === 'CAPABILITY_DENIED');
  });

  test('can get page', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'G', pageType: 'campaign' });
    const result = CMS.pageGet(s, RBAC, ADMIN, page.pageId);
    assert.equal(result.page.pageId, page.pageId);
    assert.ok(Array.isArray(result.versions));
  });

  test('can list pages', () => {
    const s = fresh();
    CMS.pageCreate(s, RBAC, ADMIN, { name: 'A', pageType: 'campaign' });
    CMS.pageCreate(s, RBAC, ADMIN, { name: 'B', pageType: 'campaign' });
    assert.equal(CMS.pageList(s, RBAC, ADMIN).length, 2);
  });

  test('SALES cannot list pages', () => {
    const s = fresh();
    assert.throws(() => CMS.pageList(s, RBAC, SALES), e => e.code === 'CAPABILITY_DENIED');
  });
});

// ── DRAFT EDITING ────────────────────────────────────────────────────

describe('draft editing', () => {
  test('can update draft content', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'D', pageType: 'campaign' });
    const result = CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());
    assert.deepEqual(result.version.content.schemaVersion, SCHEMA_VERSION);
  });

  test('updating published version creates new version', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'P', pageType: 'campaign' });

    // Publish it
    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());
    CMS.submitForReview(s, RBAC, ADMIN, page.pageId);
    CMS.approve(s, RBAC, ADMIN, page.pageId);
    CMS.publish(s, RBAC, ADMIN, page.pageId);

    const publishedVersionId = s.pages[page.pageId].currentVersionId;

    // Update again — should create new version
    const result = CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());
    assert.notEqual(result.version.versionId, publishedVersionId);
    assert.equal(result.version.status, PAGE_STATUS.DRAFT);
  });

  test('SALES cannot edit draft', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'X', pageType: 'campaign' });
    assert.throws(() => CMS.draftUpdate(s, RBAC, SALES, page.pageId, {}),
      e => e.code === 'CAPABILITY_DENIED');
  });
});

// ── WORKFLOW: DRAFT → REVIEW → APPROVED → PUBLISHED → ARCHIVED ──────

describe('workflow', () => {
  test('full workflow: create → draft → review → approve → publish', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'WF', pageType: 'campaign' });

    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());

    const review = CMS.submitForReview(s, RBAC, ADMIN, page.pageId);
    assert.equal(review.status, PAGE_STATUS.REVIEW);

    const approved = CMS.approve(s, RBAC, ADMIN, page.pageId);
    assert.equal(approved.status, PAGE_STATUS.APPROVED);

    const { version: published } = CMS.publish(s, RBAC, ADMIN, page.pageId);
    assert.equal(published.status, PAGE_STATUS.PUBLISHED);
    assert.ok(published.publishedAt);
  });

  test('cannot submit invalid content for review', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'Bad', pageType: 'campaign' });
    // Content with script tag
    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, {
      schemaVersion: SCHEMA_VERSION,
      pageType: PAGE_TYPE.CAMPAIGN,
      width: A4_WIDTH,
      height: A4_HEIGHT,
      sections: [{ id: 's1', blockType: 'text', content: '<script>evil()</script>' }],
    });

    assert.throws(() => CMS.submitForReview(s, RBAC, ADMIN, page.pageId),
      e => e.code === CMS_ERROR.VALIDATION_FAILED);
  });

  test('cannot submit non-DRAFT for review', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'X', pageType: 'campaign' });
    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());
    CMS.submitForReview(s, RBAC, ADMIN, page.pageId);
    // Already in REVIEW
    assert.throws(() => CMS.submitForReview(s, RBAC, ADMIN, page.pageId),
      e => e.code === CMS_ERROR.INVALID_STATUS);
  });

  test('cannot approve non-REVIEW version', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'X', pageType: 'campaign' });
    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());
    // Still DRAFT
    assert.throws(() => CMS.approve(s, RBAC, ADMIN, page.pageId),
      e => e.code === CMS_ERROR.INVALID_STATUS);
  });

  test('cannot publish non-APPROVED version', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'X', pageType: 'campaign' });
    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());
    CMS.submitForReview(s, RBAC, ADMIN, page.pageId);
    // REVIEW, not APPROVED
    assert.throws(() => CMS.publish(s, RBAC, ADMIN, page.pageId),
      e => e.code === CMS_ERROR.INVALID_STATUS);
  });

  test('archive page sets status', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'Arc', pageType: 'campaign' });
    const archived = CMS.archive(s, RBAC, ADMIN, page.pageId);
    assert.equal(archived.status, PAGE_STATUS.ARCHIVED);
  });
});

// ── PUBLISHED VERSION IMMUTABILITY ───────────────────────────────────

describe('published version immutability', () => {
  test('published content is frozen', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'Frozen', pageType: 'campaign' });
    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());
    CMS.submitForReview(s, RBAC, ADMIN, page.pageId);
    CMS.approve(s, RBAC, ADMIN, page.pageId);
    const { version } = CMS.publish(s, RBAC, ADMIN, page.pageId);

    assert.ok(Object.isFrozen(version.content));
    assert.throws(() => { version.content.newProp = 'x'; });
  });

  test('previous published version archived on new publish', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'Multi', pageType: 'campaign' });

    // First publish
    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());
    CMS.submitForReview(s, RBAC, ADMIN, page.pageId);
    CMS.approve(s, RBAC, ADMIN, page.pageId);
    const { version: v1 } = CMS.publish(s, RBAC, ADMIN, page.pageId);
    const v1Id = v1.versionId;

    // Second publish
    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());
    CMS.submitForReview(s, RBAC, ADMIN, page.pageId);
    CMS.approve(s, RBAC, ADMIN, page.pageId);
    CMS.publish(s, RBAC, ADMIN, page.pageId);

    // V1 should be archived
    assert.equal(s.pageVersions[v1Id].status, PAGE_STATUS.ARCHIVED);
  });
});

// ── VERSION HISTORY ──────────────────────────────────────────────────

describe('version history', () => {
  test('returns all versions for a page', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'VH', pageType: 'campaign' });

    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());
    CMS.submitForReview(s, RBAC, ADMIN, page.pageId);
    CMS.approve(s, RBAC, ADMIN, page.pageId);
    CMS.publish(s, RBAC, ADMIN, page.pageId);
    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());

    const history = CMS.versionHistory(s, RBAC, ADMIN, page.pageId);
    assert.equal(history.length, 2);
  });
});

// ── CAMPAIGN CRUD ────────────────────────────────────────────────────

describe('campaigns', () => {
  test('create campaign', () => {
    const s = fresh();
    const c = CMS.campaignCreate(s, RBAC, ADMIN, { name: 'Onam 2026' });
    assert.ok(c.campaignId);
    assert.equal(c.name, 'Onam 2026');
    assert.equal(c.status, CAMPAIGN_STATUS.DRAFT);
  });

  test('list campaigns', () => {
    const s = fresh();
    CMS.campaignCreate(s, RBAC, ADMIN, { name: 'A' });
    CMS.campaignCreate(s, RBAC, ADMIN, { name: 'B' });
    assert.equal(CMS.campaignList(s, RBAC, ADMIN).length, 2);
  });

  test('get campaign', () => {
    const s = fresh();
    const c = CMS.campaignCreate(s, RBAC, ADMIN, { name: 'G' });
    assert.equal(CMS.campaignGet(s, RBAC, ADMIN, c.campaignId).name, 'G');
  });

  test('update campaign', () => {
    const s = fresh();
    const c = CMS.campaignCreate(s, RBAC, ADMIN, { name: 'Old' });
    CMS.campaignUpdate(s, RBAC, ADMIN, c.campaignId, { name: 'New' });
    assert.equal(CMS.campaignGet(s, RBAC, ADMIN, c.campaignId).name, 'New');
  });

  test('SALES cannot create campaign', () => {
    const s = fresh();
    assert.throws(() => CMS.campaignCreate(s, RBAC, SALES, { name: 'X' }),
      e => e.code === 'CAPABILITY_DENIED');
  });
});

// ── CAMPAIGN ACTIVATION ──────────────────────────────────────────────

describe('campaign activation', () => {
  function publishedPage(s) {
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'CP', pageType: 'campaign' });
    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());
    CMS.submitForReview(s, RBAC, ADMIN, page.pageId);
    CMS.approve(s, RBAC, ADMIN, page.pageId);
    CMS.publish(s, RBAC, ADMIN, page.pageId);
    return page.pageId;
  }

  test('activate campaign with published pages', () => {
    const s = fresh();
    const pid = publishedPage(s);
    const c = CMS.campaignCreate(s, RBAC, ADMIN, { name: 'Act' });
    CMS.campaignUpdate(s, RBAC, ADMIN, c.campaignId, { pageIds: [pid] });
    const activated = CMS.campaignActivate(s, RBAC, ADMIN, c.campaignId);
    assert.equal(activated.status, CAMPAIGN_STATUS.ACTIVE);
    assert.ok(activated.activatedAt);
  });

  test('cannot activate with unpublished pages', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'X', pageType: 'campaign' });
    const c = CMS.campaignCreate(s, RBAC, ADMIN, { name: 'Bad' });
    CMS.campaignUpdate(s, RBAC, ADMIN, c.campaignId, { pageIds: [page.pageId] });
    assert.throws(() => CMS.campaignActivate(s, RBAC, ADMIN, c.campaignId),
      e => e.code === CMS_ERROR.VALIDATION_FAILED);
  });

  test('activating new campaign deactivates previous', () => {
    const s = fresh();
    const pid1 = publishedPage(s);
    const pid2 = publishedPage(s);
    const c1 = CMS.campaignCreate(s, RBAC, ADMIN, { name: 'C1' });
    CMS.campaignUpdate(s, RBAC, ADMIN, c1.campaignId, { pageIds: [pid1] });
    CMS.campaignActivate(s, RBAC, ADMIN, c1.campaignId);

    const c2 = CMS.campaignCreate(s, RBAC, ADMIN, { name: 'C2' });
    CMS.campaignUpdate(s, RBAC, ADMIN, c2.campaignId, { pageIds: [pid2] });
    CMS.campaignActivate(s, RBAC, ADMIN, c2.campaignId);

    assert.equal(s.campaigns[c1.campaignId].status, CAMPAIGN_STATUS.INACTIVE);
    assert.equal(s.campaigns[c2.campaignId].status, CAMPAIGN_STATUS.ACTIVE);
  });

  test('deactivate campaign', () => {
    const s = fresh();
    const pid = publishedPage(s);
    const c = CMS.campaignCreate(s, RBAC, ADMIN, { name: 'Deact' });
    CMS.campaignUpdate(s, RBAC, ADMIN, c.campaignId, { pageIds: [pid] });
    CMS.campaignActivate(s, RBAC, ADMIN, c.campaignId);
    const deact = CMS.campaignDeactivate(s, RBAC, ADMIN, c.campaignId);
    assert.equal(deact.status, CAMPAIGN_STATUS.INACTIVE);
  });

  test('cannot deactivate non-active campaign', () => {
    const s = fresh();
    const c = CMS.campaignCreate(s, RBAC, ADMIN, { name: 'X' });
    assert.throws(() => CMS.campaignDeactivate(s, RBAC, ADMIN, c.campaignId),
      e => e.code === CMS_ERROR.INVALID_STATUS);
  });
});

// ── ASSET MANAGEMENT ─────────────────────────────────────────────────

describe('asset management via workspace', () => {
  test('ADMIN can upload asset', () => {
    const s = setup();
    try {
      const meta = CMS.assetUpload(s, RBAC, ADMIN, {
        filename: 'logo.png',
        mimeType: 'image/png',
        data: minimalPng().toString('base64'),
      }, TEST_ASSETS_DIR);
      assert.ok(meta.assetId);
    } finally { cleanup(); }
  });

  test('SALES cannot upload asset', () => {
    const s = setup();
    try {
      assert.throws(() => CMS.assetUpload(s, RBAC, SALES, {
        filename: 'x.png', data: minimalPng().toString('base64'),
      }, TEST_ASSETS_DIR), e => e.code === 'CAPABILITY_DENIED');
    } finally { cleanup(); }
  });

  test('can list and get assets', () => {
    const s = setup();
    try {
      const meta = CMS.assetUpload(s, RBAC, ADMIN, {
        filename: 'a.png', data: minimalPng().toString('base64'),
      }, TEST_ASSETS_DIR);
      assert.equal(CMS.assetList(s, RBAC, ADMIN).length, 1);
      assert.equal(CMS.assetGet(s, RBAC, ADMIN, meta.assetId).filename, 'a.png');
    } finally { cleanup(); }
  });

  test('can read asset file', () => {
    const s = setup();
    try {
      const meta = CMS.assetUpload(s, RBAC, ADMIN, {
        filename: 'read.png', data: minimalPng().toString('base64'),
      }, TEST_ASSETS_DIR);
      const file = CMS.assetFile(s, RBAC, ADMIN, meta.assetId, TEST_ASSETS_DIR);
      assert.ok(Buffer.isBuffer(file.buffer));
    } finally { cleanup(); }
  });

  test('cannot archive asset in use', () => {
    const s = setup();
    try {
      const meta = CMS.assetUpload(s, RBAC, ADMIN, {
        filename: 'used.png', data: minimalPng().toString('base64'),
      }, TEST_ASSETS_DIR);
      // Simulate usage
      meta.usedByPageVersionIds.push('pgver_fake');
      assert.throws(() => CMS.assetArchive(s, RBAC, ADMIN, meta.assetId),
        e => e.code === CMS_ERROR.ASSET_IN_USE);
    } finally { cleanup(); }
  });

  test('can archive unused asset', () => {
    const s = setup();
    try {
      const meta = CMS.assetUpload(s, RBAC, ADMIN, {
        filename: 'unused.png', data: minimalPng().toString('base64'),
      }, TEST_ASSETS_DIR);
      const archived = CMS.assetArchive(s, RBAC, ADMIN, meta.assetId);
      assert.equal(archived.status, 'ARCHIVED');
    } finally { cleanup(); }
  });
});

// ── FIELD LIST ───────────────────────────────────────────────────────

describe('field list', () => {
  test('returns all registered fields', () => {
    const fields = CMS.fieldList(RBAC, ADMIN);
    assert.ok(Array.isArray(fields));
    assert.ok(fields.length > 0);
    assert.ok(fields.some(f => f.fieldId === 'customer.name'));
  });

  test('SALES cannot list fields', () => {
    assert.throws(() => CMS.fieldList(RBAC, SALES), e => e.code === 'CAPABILITY_DENIED');
  });
});

// ── PREVIEW ──────────────────────────────────────────────────────────

describe('preview', () => {
  test('returns page, version, and field registry', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'PV', pageType: 'campaign' });
    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());
    const result = CMS.preview(s, RBAC, ADMIN, page.pageId);
    assert.ok(result.page);
    assert.ok(result.version);
    assert.ok(Array.isArray(result.fieldRegistry));
  });
});

// ── SNAPSHOT ──────────────────────────────────────────────────────────

describe('snapshot for issuance', () => {
  test('returns snapshot of published version', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'Snap', pageType: 'campaign' });
    CMS.draftUpdate(s, RBAC, ADMIN, page.pageId, validContent());
    CMS.submitForReview(s, RBAC, ADMIN, page.pageId);
    CMS.approve(s, RBAC, ADMIN, page.pageId);
    CMS.publish(s, RBAC, ADMIN, page.pageId);

    const snap = CMS.snapshotForIssuance(s, page.pageId);
    assert.ok(snap);
    assert.ok(snap.versionId);
    assert.ok(snap.content);
  });

  test('returns null for unpublished page', () => {
    const s = fresh();
    const { page } = CMS.pageCreate(s, RBAC, ADMIN, { name: 'Unpub', pageType: 'campaign' });
    const snap = CMS.snapshotForIssuance(s, page.pageId);
    assert.equal(snap, null);
  });
});

// ── ACTIVE CAMPAIGN RESOLVER ─────────────────────────────────────────

describe('resolveActiveCampaign', () => {
  test('returns null when no active campaign', () => {
    const s = fresh();
    assert.equal(CMS.resolveActiveCampaign(s), null);
  });
});

// ── SECURITY: No calculation logic ───────────────────────────────────

describe('SECURITY — CMS has no calculation logic', () => {
  test('cmsWorkspace source has no price/cost/gst/margin/subsidy calculation', async () => {
    // This test reads the source to verify no calculation leaked in
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/cmsWorkspace.js', 'utf-8');
    const forbidden = [
      /calculatePrice/i, /calculateCost/i, /calculateGst/i,
      /calculateSubsidy/i, /calculateMargin/i, /calculateEmi/i,
      /calculateSavings/i, /calculateRoi/i, /calculateGeneration/i,
      /bomQuantit/i, /dcAcRatio/i,
    ];
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(src), `cmsWorkspace must not contain ${pattern}`);
    }
  });
});

/**
 * C11-A — CMS Store foundation tests.
 * Follows existing test conventions: node:test + node:assert/strict.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CMS_STORE_VERSION,
  PAGE_STATUS, ASSET_STATUS, CAMPAIGN_STATUS,
  CMS_ERROR, CmsError,
  createCmsStore,
  createPage, getPage, listPages, updatePage,
  createPageVersion, getPageVersion, updatePageVersionContent,
  updatePageVersionStatus, freezePageVersion, listPageVersions,
  createAssetMeta, getAssetMeta, listAssets, archiveAsset,
  createCampaign, getCampaign, listCampaigns, updateCampaign,
  getActiveCampaign, snapshotPageVersion,
} from '../src/lib/cmsStore.js';

// ── Store creation ───────────────────────────────────────────────────

describe('createCmsStore', () => {
  test('returns correct initial shape', () => {
    const s = createCmsStore();
    assert.equal(s.storeVersion, CMS_STORE_VERSION);
    assert.deepEqual(s.pages, {});
    assert.deepEqual(s.pageVersions, {});
    assert.deepEqual(s.assets, {});
    assert.deepEqual(s.campaigns, {});
    assert.deepEqual(s.fieldRegistry, {});
  });

  test('store is plain object, not Map', () => {
    const s = createCmsStore();
    assert.equal(typeof s, 'object');
    assert.ok(!(s.pages instanceof Map));
    assert.ok(!(s.pageVersions instanceof Map));
    assert.ok(!(s.assets instanceof Map));
    assert.ok(!(s.campaigns instanceof Map));
  });

  test('store is JSON-serializable', () => {
    const s = createCmsStore();
    const json = JSON.stringify(s);
    const parsed = JSON.parse(json);
    assert.deepEqual(parsed, s);
  });

  test('fresh stores are independent', () => {
    const a = createCmsStore();
    const b = createCmsStore();
    a.pages['x'] = { test: true };
    assert.equal(Object.keys(b.pages).length, 0);
  });
});

// ── Constants frozen ─────────────────────────────────────────────────

describe('constants are frozen', () => {
  test('PAGE_STATUS is frozen', () => { assert.ok(Object.isFrozen(PAGE_STATUS)); });
  test('ASSET_STATUS is frozen', () => { assert.ok(Object.isFrozen(ASSET_STATUS)); });
  test('CAMPAIGN_STATUS is frozen', () => { assert.ok(Object.isFrozen(CAMPAIGN_STATUS)); });
  test('CMS_ERROR is frozen', () => { assert.ok(Object.isFrozen(CMS_ERROR)); });
});

// ── CmsError ─────────────────────────────────────────────────────────

describe('CmsError', () => {
  test('carries code and message', () => {
    const e = new CmsError('NOT_FOUND', 'gone');
    assert.equal(e.code, 'NOT_FOUND');
    assert.equal(e.message, 'gone');
    assert.ok(e instanceof Error);
  });

  test('defaults message to code', () => {
    const e = new CmsError('TEST_CODE');
    assert.equal(e.message, 'TEST_CODE');
  });
});

// ── Page CRUD ────────────────────────────────────────────────────────

describe('pages', () => {
  test('createPage returns page with correct fields', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'Campaign Page', pageType: 'campaign', createdBy: 'admin' });
    assert.ok(p.pageId.startsWith('pg_'));
    assert.equal(p.name, 'Campaign Page');
    assert.equal(p.pageType, 'campaign');
    assert.equal(p.status, PAGE_STATUS.DRAFT);
    assert.equal(p.currentVersionId, null);
    assert.equal(p.publishedVersionId, null);
    assert.equal(p.createdBy, 'admin');
    assert.ok(p.createdAt);
    assert.ok(p.updatedAt);
  });

  test('page stored in store.pages', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'Test', pageType: 'campaign', createdBy: 'admin' });
    assert.equal(s.pages[p.pageId], p);
  });

  test('createPage rejects missing name', () => {
    const s = createCmsStore();
    assert.throws(() => createPage(s, { pageType: 'x', createdBy: 'a' }),
      e => e.code === CMS_ERROR.INVALID_INPUT);
  });

  test('createPage rejects missing pageType', () => {
    const s = createCmsStore();
    assert.throws(() => createPage(s, { name: 'x', createdBy: 'a' }),
      e => e.code === CMS_ERROR.INVALID_INPUT);
  });

  test('createPage rejects missing createdBy', () => {
    const s = createCmsStore();
    assert.throws(() => createPage(s, { name: 'x', pageType: 'x' }),
      e => e.code === CMS_ERROR.INVALID_INPUT);
  });

  test('getPage returns existing page', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'X', pageType: 'campaign', createdBy: 'a' });
    const got = getPage(s, p.pageId);
    assert.equal(got.pageId, p.pageId);
  });

  test('getPage throws NOT_FOUND for missing', () => {
    const s = createCmsStore();
    assert.throws(() => getPage(s, 'nope'), e => e.code === CMS_ERROR.NOT_FOUND);
  });

  test('listPages returns all pages', () => {
    const s = createCmsStore();
    createPage(s, { name: 'A', pageType: 'campaign', createdBy: 'a' });
    createPage(s, { name: 'B', pageType: 'campaign', createdBy: 'a' });
    assert.equal(listPages(s).length, 2);
  });

  test('updatePage changes allowed fields', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'Old', pageType: 'x', createdBy: 'a' });
    updatePage(s, p.pageId, { name: 'New' });
    assert.equal(getPage(s, p.pageId).name, 'New');
  });

  test('updatePage does not change pageId or createdBy', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'X', pageType: 'x', createdBy: 'a' });
    const origId = p.pageId;
    updatePage(s, p.pageId, { pageId: 'hacked', createdBy: 'hacked' });
    assert.equal(getPage(s, origId).pageId, origId);
    assert.equal(getPage(s, origId).createdBy, 'a');
  });
});

// ── Page versions ────────────────────────────────────────────────────

describe('page versions', () => {
  test('createPageVersion returns version linked to page', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'P', pageType: 'campaign', createdBy: 'a' });
    const v = createPageVersion(s, { pageId: p.pageId, content: { blocks: [] }, createdBy: 'a' });
    assert.ok(v.versionId.startsWith('pgver_'));
    assert.equal(v.pageId, p.pageId);
    assert.equal(v.status, PAGE_STATUS.DRAFT);
    assert.deepEqual(v.content, { blocks: [] });
  });

  test('version content is deep-cloned on creation', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'P', pageType: 'campaign', createdBy: 'a' });
    const original = { blocks: [{ id: 'b1' }] };
    const v = createPageVersion(s, { pageId: p.pageId, content: original, createdBy: 'a' });
    original.blocks.push({ id: 'b2' });
    assert.equal(v.content.blocks.length, 1, 'mutation of original must not affect stored version');
  });

  test('createPageVersion rejects invalid pageId', () => {
    const s = createCmsStore();
    assert.throws(() => createPageVersion(s, { pageId: 'nope', createdBy: 'a' }),
      e => e.code === CMS_ERROR.NOT_FOUND);
  });

  test('getPageVersion returns existing', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'P', pageType: 'campaign', createdBy: 'a' });
    const v = createPageVersion(s, { pageId: p.pageId, content: {}, createdBy: 'a' });
    assert.equal(getPageVersion(s, v.versionId).versionId, v.versionId);
  });

  test('getPageVersion throws NOT_FOUND', () => {
    const s = createCmsStore();
    assert.throws(() => getPageVersion(s, 'nope'), e => e.code === CMS_ERROR.NOT_FOUND);
  });

  test('updatePageVersionContent deep-clones new content', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'P', pageType: 'campaign', createdBy: 'a' });
    const v = createPageVersion(s, { pageId: p.pageId, content: {}, createdBy: 'a' });
    const newContent = { blocks: [{ id: 'b1' }] };
    updatePageVersionContent(s, v.versionId, newContent);
    newContent.blocks.push({ id: 'b2' });
    assert.equal(getPageVersion(s, v.versionId).content.blocks.length, 1);
  });

  test('updatePageVersionContent rejects PUBLISHED version', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'P', pageType: 'campaign', createdBy: 'a' });
    const v = createPageVersion(s, { pageId: p.pageId, content: {}, createdBy: 'a' });
    freezePageVersion(s, v.versionId);
    assert.throws(() => updatePageVersionContent(s, v.versionId, { new: true }),
      e => e.code === CMS_ERROR.IMMUTABLE);
  });

  test('updatePageVersionContent rejects ARCHIVED version', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'P', pageType: 'campaign', createdBy: 'a' });
    const v = createPageVersion(s, { pageId: p.pageId, content: {}, createdBy: 'a' });
    updatePageVersionStatus(s, v.versionId, PAGE_STATUS.ARCHIVED);
    assert.throws(() => updatePageVersionContent(s, v.versionId, { new: true }),
      e => e.code === CMS_ERROR.IMMUTABLE);
  });

  test('status transitions work for normal workflow', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'P', pageType: 'campaign', createdBy: 'a' });
    const v = createPageVersion(s, { pageId: p.pageId, content: {}, createdBy: 'a' });
    assert.equal(v.status, PAGE_STATUS.DRAFT);
    updatePageVersionStatus(s, v.versionId, PAGE_STATUS.REVIEW);
    assert.equal(getPageVersion(s, v.versionId).status, PAGE_STATUS.REVIEW);
    updatePageVersionStatus(s, v.versionId, PAGE_STATUS.APPROVED);
    assert.equal(getPageVersion(s, v.versionId).status, PAGE_STATUS.APPROVED);
  });

  test('PUBLISHED version can only transition to ARCHIVED', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'P', pageType: 'campaign', createdBy: 'a' });
    const v = createPageVersion(s, { pageId: p.pageId, content: {}, createdBy: 'a' });
    freezePageVersion(s, v.versionId);
    assert.throws(() => updatePageVersionStatus(s, v.versionId, PAGE_STATUS.DRAFT),
      e => e.code === CMS_ERROR.IMMUTABLE);
    // But ARCHIVED is fine
    updatePageVersionStatus(s, v.versionId, PAGE_STATUS.ARCHIVED);
    assert.equal(getPageVersion(s, v.versionId).status, PAGE_STATUS.ARCHIVED);
  });

  test('listPageVersions filters by pageId', () => {
    const s = createCmsStore();
    const p1 = createPage(s, { name: 'P1', pageType: 'campaign', createdBy: 'a' });
    const p2 = createPage(s, { name: 'P2', pageType: 'campaign', createdBy: 'a' });
    createPageVersion(s, { pageId: p1.pageId, content: {}, createdBy: 'a' });
    createPageVersion(s, { pageId: p1.pageId, content: {}, createdBy: 'a' });
    createPageVersion(s, { pageId: p2.pageId, content: {}, createdBy: 'a' });
    assert.equal(listPageVersions(s, p1.pageId).length, 2);
    assert.equal(listPageVersions(s, p2.pageId).length, 1);
  });
});

// ── freezePageVersion ────────────────────────────────────────────────

describe('freezePageVersion', () => {
  test('sets status to PUBLISHED and freezes content', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'P', pageType: 'campaign', createdBy: 'a' });
    const v = createPageVersion(s, {
      pageId: p.pageId,
      content: { blocks: [{ id: 'b1', text: 'hello' }] },
      createdBy: 'a',
    });
    freezePageVersion(s, v.versionId);
    const frozen = getPageVersion(s, v.versionId);
    assert.equal(frozen.status, PAGE_STATUS.PUBLISHED);
    assert.ok(frozen.publishedAt);
    assert.ok(Object.isFrozen(frozen.content));
    assert.ok(Object.isFrozen(frozen.content.blocks));
    assert.ok(Object.isFrozen(frozen.content.blocks[0]));
  });

  test('frozen content cannot be mutated', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'P', pageType: 'campaign', createdBy: 'a' });
    const v = createPageVersion(s, {
      pageId: p.pageId,
      content: { blocks: [] },
      createdBy: 'a',
    });
    freezePageVersion(s, v.versionId);
    assert.throws(() => { getPageVersion(s, v.versionId).content.blocks.push('x'); });
    assert.throws(() => { getPageVersion(s, v.versionId).content.newProp = 'x'; });
  });
});

// ── Asset metadata ───────────────────────────────────────────────────

describe('asset metadata', () => {
  test('createAssetMeta stores metadata', () => {
    const s = createCmsStore();
    const a = createAssetMeta(s, {
      assetId: 'asset_test1',
      filename: 'logo.png',
      storagePath: 'data/cms-assets/asset_test1.png',
      mimeType: 'image/png',
      width: 200,
      height: 100,
      fileSizeBytes: 4096,
      checksum: 'abc123',
      uploadedBy: 'admin',
    });
    assert.equal(a.assetId, 'asset_test1');
    assert.equal(a.filename, 'logo.png');
    assert.equal(a.mimeType, 'image/png');
    assert.equal(a.status, ASSET_STATUS.ACTIVE);
    assert.deepEqual(a.usedByPageVersionIds, []);
  });

  test('duplicate assetId throws DUPLICATE', () => {
    const s = createCmsStore();
    createAssetMeta(s, { assetId: 'asset_dup', uploadedBy: 'a' });
    assert.throws(() => createAssetMeta(s, { assetId: 'asset_dup', uploadedBy: 'a' }),
      e => e.code === CMS_ERROR.DUPLICATE);
  });

  test('getAssetMeta throws NOT_FOUND', () => {
    const s = createCmsStore();
    assert.throws(() => getAssetMeta(s, 'nope'), e => e.code === CMS_ERROR.NOT_FOUND);
  });

  test('listAssets excludes ARCHIVED', () => {
    const s = createCmsStore();
    createAssetMeta(s, { assetId: 'a1', uploadedBy: 'a' });
    createAssetMeta(s, { assetId: 'a2', uploadedBy: 'a' });
    archiveAsset(s, 'a2');
    const active = listAssets(s);
    assert.equal(active.length, 1);
    assert.equal(active[0].assetId, 'a1');
  });

  test('archiveAsset sets status to ARCHIVED', () => {
    const s = createCmsStore();
    createAssetMeta(s, { assetId: 'a1', uploadedBy: 'a' });
    archiveAsset(s, 'a1');
    assert.equal(s.assets['a1'].status, ASSET_STATUS.ARCHIVED);
  });
});

// ── Campaign helpers ─────────────────────────────────────────────────

describe('campaigns', () => {
  test('createCampaign returns campaign with correct fields', () => {
    const s = createCmsStore();
    const c = createCampaign(s, { name: 'Onam 2026', createdBy: 'admin' });
    assert.ok(c.campaignId.startsWith('cmp_'));
    assert.equal(c.name, 'Onam 2026');
    assert.equal(c.status, CAMPAIGN_STATUS.DRAFT);
    assert.deepEqual(c.pageIds, []);
    assert.equal(c.activatedAt, null);
    assert.equal(c.deactivatedAt, null);
  });

  test('createCampaign rejects missing name', () => {
    const s = createCmsStore();
    assert.throws(() => createCampaign(s, { createdBy: 'a' }),
      e => e.code === CMS_ERROR.INVALID_INPUT);
  });

  test('getCampaign throws NOT_FOUND', () => {
    const s = createCmsStore();
    assert.throws(() => getCampaign(s, 'nope'), e => e.code === CMS_ERROR.NOT_FOUND);
  });

  test('listCampaigns returns all', () => {
    const s = createCmsStore();
    createCampaign(s, { name: 'A', createdBy: 'a' });
    createCampaign(s, { name: 'B', createdBy: 'a' });
    assert.equal(listCampaigns(s).length, 2);
  });

  test('updateCampaign changes allowed fields', () => {
    const s = createCmsStore();
    const c = createCampaign(s, { name: 'Old', createdBy: 'a' });
    updateCampaign(s, c.campaignId, { name: 'New', status: CAMPAIGN_STATUS.ACTIVE });
    const updated = getCampaign(s, c.campaignId);
    assert.equal(updated.name, 'New');
    assert.equal(updated.status, CAMPAIGN_STATUS.ACTIVE);
  });

  test('updateCampaign does not change campaignId or createdBy', () => {
    const s = createCmsStore();
    const c = createCampaign(s, { name: 'X', createdBy: 'a' });
    const origId = c.campaignId;
    updateCampaign(s, origId, { campaignId: 'hacked', createdBy: 'hacked' });
    assert.equal(getCampaign(s, origId).campaignId, origId);
    assert.equal(getCampaign(s, origId).createdBy, 'a');
  });

  test('getActiveCampaign returns null when none active', () => {
    const s = createCmsStore();
    createCampaign(s, { name: 'Draft', createdBy: 'a' });
    assert.equal(getActiveCampaign(s), null);
  });

  test('getActiveCampaign returns active campaign', () => {
    const s = createCmsStore();
    const c = createCampaign(s, { name: 'Onam', createdBy: 'a' });
    updateCampaign(s, c.campaignId, { status: CAMPAIGN_STATUS.ACTIVE });
    const active = getActiveCampaign(s);
    assert.ok(active);
    assert.equal(active.campaignId, c.campaignId);
  });
});

// ── Snapshot helper ──────────────────────────────────────────────────

describe('snapshotPageVersion', () => {
  test('returns deep clone', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'P', pageType: 'campaign', createdBy: 'a' });
    const v = createPageVersion(s, {
      pageId: p.pageId,
      content: { blocks: [{ id: 'b1' }] },
      createdBy: 'a',
    });
    const snap = snapshotPageVersion(s, v.versionId);
    assert.deepEqual(snap.content, v.content);
    snap.content.blocks.push({ id: 'b2' });
    assert.equal(v.content.blocks.length, 1, 'snapshot mutation must not affect store');
  });
});

// ── JSON round-trip ──────────────────────────────────────────────────

describe('JSON persistence round-trip', () => {
  test('store with data survives JSON.stringify → JSON.parse', () => {
    const s = createCmsStore();
    const p = createPage(s, { name: 'Test', pageType: 'campaign', createdBy: 'admin' });
    createPageVersion(s, { pageId: p.pageId, content: { blocks: [] }, createdBy: 'admin' });
    createAssetMeta(s, { assetId: 'asset_rt1', filename: 'x.png', uploadedBy: 'admin' });
    createCampaign(s, { name: 'C1', createdBy: 'admin' });

    const json = JSON.stringify(s, null, 2);
    const restored = JSON.parse(json);

    assert.equal(restored.storeVersion, CMS_STORE_VERSION);
    assert.equal(Object.keys(restored.pages).length, 1);
    assert.equal(Object.keys(restored.pageVersions).length, 1);
    assert.equal(Object.keys(restored.assets).length, 1);
    assert.equal(Object.keys(restored.campaigns).length, 1);

    // Restored store works with getters
    assert.equal(getPage(restored, p.pageId).name, 'Test');
    assert.equal(getAssetMeta(restored, 'asset_rt1').filename, 'x.png');
  });

  test('no Maps, no Sets, no class instances in store', () => {
    const s = createCmsStore();
    createPage(s, { name: 'P', pageType: 'x', createdBy: 'a' });
    const json = JSON.stringify(s);
    // Maps/Sets serialize to {} — verify round-trip fidelity
    const restored = JSON.parse(json);
    assert.deepEqual(Object.keys(restored), Object.keys(s));
    // Verify pages is a plain object
    assert.equal(typeof restored.pages, 'object');
    assert.ok(!Array.isArray(restored.pages));
  });
});

/**
 * CMS Store — persistence foundation for the Quotation Page Designer (C11).
 *
 * Follows the SAME conventions as projectWorkspace / procurementWorkspace:
 *   - Plain JavaScript objects (NOT Maps)
 *   - JSON persistence via writeFileSync
 *   - Single-process, no locking
 *   - deepFreeze for published content immutability
 *
 * This module owns the store shape and basic CRUD helpers.
 * Business logic (workflow, validation, RBAC) lives in cmsWorkspace.js.
 */

// ── Constants ────────────────────────────────────────────────────────

export const CMS_STORE_VERSION = 'cms.1';

export const PAGE_STATUS = Object.freeze({
  DRAFT:     'DRAFT',
  REVIEW:    'REVIEW',
  APPROVED:  'APPROVED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED:  'ARCHIVED',
});

export const ASSET_STATUS = Object.freeze({
  ACTIVE:   'ACTIVE',
  ARCHIVED: 'ARCHIVED',
});

export const CAMPAIGN_STATUS = Object.freeze({
  DRAFT:    'DRAFT',
  ACTIVE:   'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
});

export const CMS_ERROR = Object.freeze({
  NOT_FOUND:          'NOT_FOUND',
  INVALID_STATUS:     'INVALID_STATUS',
  IMMUTABLE:          'IMMUTABLE',
  VALIDATION_FAILED:  'VALIDATION_FAILED',
  DUPLICATE:          'DUPLICATE',
  ASSET_IN_USE:       'ASSET_IN_USE',
  INVALID_INPUT:      'INVALID_INPUT',
});

// ── Error class ──────────────────────────────────────────────────────

export class CmsError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

// ── deepFreeze (same implementation used across all modules) ─────────

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

// ── deepClone ────────────────────────────────────────────────────────

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

// ── Store creation ───────────────────────────────────────────────────

export function createCmsStore() {
  return {
    storeVersion: CMS_STORE_VERSION,
    pages: {},
    pageVersions: {},
    assets: {},
    campaigns: {},
    fieldRegistry: {},
  };
}

// ── ID generation ────────────────────────────────────────────────────

let _idCounter = 0;

function generateId(prefix) {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  _idCounter += 1;
  return `${prefix}_${ts}${rnd}${_idCounter}`;
}

export function pageId()        { return generateId('pg'); }
export function pageVersionId() { return generateId('pgver'); }
export function assetId()       { return generateId('asset'); }
export function campaignId()    { return generateId('cmp'); }

// ── Page helpers ─────────────────────────────────────────────────────

export function createPage(store, { name, pageType, createdBy }) {
  if (!name || typeof name !== 'string') throw new CmsError(CMS_ERROR.INVALID_INPUT, 'Page name required');
  if (!pageType || typeof pageType !== 'string') throw new CmsError(CMS_ERROR.INVALID_INPUT, 'pageType required');
  if (!createdBy || typeof createdBy !== 'string') throw new CmsError(CMS_ERROR.INVALID_INPUT, 'createdBy required');

  const id = pageId();
  const now = new Date().toISOString();
  store.pages[id] = {
    pageId: id,
    name,
    pageType,
    status: PAGE_STATUS.DRAFT,
    currentVersionId: null,
    publishedVersionId: null,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  return store.pages[id];
}

export function getPage(store, id) {
  const page = store.pages[id];
  if (!page) throw new CmsError(CMS_ERROR.NOT_FOUND, `Page ${id} not found`);
  return page;
}

export function listPages(store) {
  return Object.values(store.pages);
}

export function updatePage(store, id, updates) {
  const page = getPage(store, id);
  const allowed = ['name', 'status', 'currentVersionId', 'publishedVersionId'];
  for (const key of allowed) {
    if (updates[key] !== undefined) page[key] = updates[key];
  }
  page.updatedAt = new Date().toISOString();
  return page;
}

// ── Page version helpers ─────────────────────────────────────────────

export function createPageVersion(store, { pageId: pid, content, createdBy }) {
  if (!pid) throw new CmsError(CMS_ERROR.INVALID_INPUT, 'pageId required');
  getPage(store, pid); // verify page exists
  if (!createdBy) throw new CmsError(CMS_ERROR.INVALID_INPUT, 'createdBy required');

  const id = pageVersionId();
  const now = new Date().toISOString();
  store.pageVersions[id] = {
    versionId: id,
    pageId: pid,
    status: PAGE_STATUS.DRAFT,
    content: content ? deepClone(content) : {},
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  return store.pageVersions[id];
}

export function getPageVersion(store, versionId) {
  const v = store.pageVersions[versionId];
  if (!v) throw new CmsError(CMS_ERROR.NOT_FOUND, `Page version ${versionId} not found`);
  return v;
}

export function updatePageVersionContent(store, versionId, content) {
  const v = getPageVersion(store, versionId);
  if (v.status === PAGE_STATUS.PUBLISHED) {
    throw new CmsError(CMS_ERROR.IMMUTABLE, `Published version ${versionId} cannot be edited`);
  }
  if (v.status === PAGE_STATUS.ARCHIVED) {
    throw new CmsError(CMS_ERROR.IMMUTABLE, `Archived version ${versionId} cannot be edited`);
  }
  v.content = deepClone(content);
  v.updatedAt = new Date().toISOString();
  return v;
}

export function updatePageVersionStatus(store, versionId, newStatus) {
  const v = getPageVersion(store, versionId);
  if (v.status === PAGE_STATUS.PUBLISHED && newStatus !== PAGE_STATUS.ARCHIVED) {
    throw new CmsError(CMS_ERROR.IMMUTABLE, `Published version can only be archived`);
  }
  v.status = newStatus;
  v.updatedAt = new Date().toISOString();
  return v;
}

export function freezePageVersion(store, versionId) {
  const v = getPageVersion(store, versionId);
  v.status = PAGE_STATUS.PUBLISHED;
  v.publishedAt = new Date().toISOString();
  v.updatedAt = v.publishedAt;
  deepFreeze(v.content);
  return v;
}

export function listPageVersions(store, pid) {
  return Object.values(store.pageVersions).filter(v => v.pageId === pid);
}

// ── Asset metadata helpers ───────────────────────────────────────────

export function createAssetMeta(store, meta) {
  if (!meta.assetId) throw new CmsError(CMS_ERROR.INVALID_INPUT, 'assetId required');
  if (store.assets[meta.assetId]) throw new CmsError(CMS_ERROR.DUPLICATE, `Asset ${meta.assetId} already exists`);

  store.assets[meta.assetId] = {
    assetId: meta.assetId,
    filename: meta.filename || 'untitled',
    storagePath: meta.storagePath || '',
    mimeType: meta.mimeType || 'application/octet-stream',
    width: meta.width || null,
    height: meta.height || null,
    fileSizeBytes: meta.fileSizeBytes || 0,
    checksum: meta.checksum || '',
    uploadedBy: meta.uploadedBy || '',
    uploadedAt: meta.uploadedAt || new Date().toISOString(),
    status: ASSET_STATUS.ACTIVE,
    usedByPageVersionIds: [],
  };
  return store.assets[meta.assetId];
}

export function getAssetMeta(store, id) {
  const a = store.assets[id];
  if (!a) throw new CmsError(CMS_ERROR.NOT_FOUND, `Asset ${id} not found`);
  return a;
}

export function listAssets(store) {
  return Object.values(store.assets).filter(a => a.status === ASSET_STATUS.ACTIVE);
}

export function archiveAsset(store, id) {
  const a = getAssetMeta(store, id);
  a.status = ASSET_STATUS.ARCHIVED;
  return a;
}

// ── Campaign helpers ─────────────────────────────────────────────────

export function createCampaign(store, { name, createdBy }) {
  if (!name) throw new CmsError(CMS_ERROR.INVALID_INPUT, 'Campaign name required');
  if (!createdBy) throw new CmsError(CMS_ERROR.INVALID_INPUT, 'createdBy required');

  const id = campaignId();
  const now = new Date().toISOString();
  store.campaigns[id] = {
    campaignId: id,
    name,
    status: CAMPAIGN_STATUS.DRAFT,
    pageIds: [],
    activatedAt: null,
    deactivatedAt: null,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  return store.campaigns[id];
}

export function getCampaign(store, id) {
  const c = store.campaigns[id];
  if (!c) throw new CmsError(CMS_ERROR.NOT_FOUND, `Campaign ${id} not found`);
  return c;
}

export function listCampaigns(store) {
  return Object.values(store.campaigns);
}

// 2026-09-10 — page-2 (offer page) content lives ON the campaign so the simple
// "Quotation content" editor can maintain it without the page designer. The
// renderer reads exactly these keys from payload.campaign.value.
export const CAMPAIGN_CONTENT_KEYS = Object.freeze([
  'headline', 'subheadline', 'primaryBenefit', 'offers', 'luckyDraw', 'referral',
  'urgency', 'cta', 'disclaimer', 'heroImage', 'artwork', 'template', 'yearBadge', 'theme', 'period',
]);

export function updateCampaign(store, id, updates) {
  const c = getCampaign(store, id);
  const allowed = ['name', 'status', 'pageIds', 'activatedAt', 'deactivatedAt', ...CAMPAIGN_CONTENT_KEYS];
  for (const key of allowed) {
    if (updates[key] !== undefined) c[key] = updates[key];
  }
  c.updatedAt = new Date().toISOString();
  return c;
}

export function getActiveCampaign(store) {
  return Object.values(store.campaigns).find(c => c.status === CAMPAIGN_STATUS.ACTIVE) || null;
}

// ── Snapshot helper (for quotation issuance) ─────────────────────────

export function snapshotPageVersion(store, versionId) {
  const v = getPageVersion(store, versionId);
  return deepClone(v);
}

// ── Exports summary ─────────────────────────────────────────────────
// createCmsStore, createPage, getPage, listPages, updatePage,
// createPageVersion, getPageVersion, updatePageVersionContent,
// updatePageVersionStatus, freezePageVersion, listPageVersions,
// createAssetMeta, getAssetMeta, listAssets, archiveAsset,
// createCampaign, getCampaign, listCampaigns, updateCampaign,
// getActiveCampaign, snapshotPageVersion,
// pageId, pageVersionId, assetId, campaignId,
// CmsError, CMS_ERROR, PAGE_STATUS, ASSET_STATUS, CAMPAIGN_STATUS,
// CMS_STORE_VERSION, deepFreeze (internal), deepClone (internal)

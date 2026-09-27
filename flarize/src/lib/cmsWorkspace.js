/**
 * CMS Workspace — C11-F.
 *
 * Service layer for the Quotation Page Designer CMS.
 * Orchestrates store, RBAC, field registry, page schema, and asset manager.
 *
 * ZERO calculation logic. CMS stores content/layout and references
 * already-calculated quotation values via the field registry.
 *
 * Workflow: DRAFT → REVIEW → APPROVED → PUBLISHED → ARCHIVED
 * Published content is immutable (deepFreeze).
 * Editing published content creates a new version.
 */

import {
  CMS_ERROR, CmsError,
  PAGE_STATUS, CAMPAIGN_STATUS, ASSET_STATUS,
  createPage, getPage, listPages, updatePage,
  createPageVersion, getPageVersion, updatePageVersionContent,
  updatePageVersionStatus, freezePageVersion, listPageVersions,
  getAssetMeta, listAssets,
  createCampaign, getCampaign, listCampaigns, updateCampaign, getActiveCampaign,
  snapshotPageVersion, CAMPAIGN_CONTENT_KEYS,
} from './cmsStore.js';
import { validatePageContent } from './cmsPageSchema.js';
import { FieldRegistry } from './cmsFieldRegistry.js';
import { uploadAsset as doUploadAsset, readAssetFile as doReadAssetFile } from './cmsAssetManager.js';

// ── RBAC capability names ────────────────────────────────────────────

const CAP = {
  VIEW:         'CMS_VIEW',
  EDIT:         'CMS_EDIT',
  PUBLISH:      'CMS_PUBLISH',
  ASSET_MANAGE: 'CMS_ASSET_MANAGE',
};

// ── Field registry singleton ─────────────────────────────────────────

let _registry = null;
function registry() {
  if (!_registry) _registry = new FieldRegistry();
  return _registry;
}

// ── RBAC helpers ─────────────────────────────────────────────────────

function assertAccess(rbac, actor, capability) {
  rbac.assertCan(actor, capability);
}

// ── PAGE CRUD ────────────────────────────────────────────────────────

export function pageCreate(store, rbac, actor, { name, pageType }) {
  assertAccess(rbac, actor, CAP.EDIT);
  const page = createPage(store, { name, pageType, createdBy: actor.userId });
  // Create initial draft version
  const version = createPageVersion(store, {
    pageId: page.pageId,
    content: {},
    createdBy: actor.userId,
  });
  updatePage(store, page.pageId, { currentVersionId: version.versionId });
  return { page, version };
}

export function pageGet(store, rbac, actor, pageId) {
  assertAccess(rbac, actor, CAP.VIEW);
  const page = getPage(store, pageId);
  const versions = listPageVersions(store, pageId);
  return { page, versions };
}

export function pageList(store, rbac, actor) {
  assertAccess(rbac, actor, CAP.VIEW);
  return listPages(store);
}

// ── DRAFT EDITING ────────────────────────────────────────────────────

export function draftUpdate(store, rbac, actor, pageId, content) {
  assertAccess(rbac, actor, CAP.EDIT);
  const page = getPage(store, pageId);

  // Get or create draft version
  let version;
  if (page.currentVersionId) {
    version = getPageVersion(store, page.currentVersionId);
    if (version.status === PAGE_STATUS.PUBLISHED || version.status === PAGE_STATUS.ARCHIVED) {
      // Published/archived — create new version
      version = createPageVersion(store, {
        pageId: page.pageId,
        content,
        createdBy: actor.userId,
      });
      updatePage(store, page.pageId, { currentVersionId: version.versionId });
      return { page: getPage(store, pageId), version };
    }
  } else {
    version = createPageVersion(store, {
      pageId: page.pageId,
      content,
      createdBy: actor.userId,
    });
    updatePage(store, page.pageId, { currentVersionId: version.versionId });
    return { page: getPage(store, pageId), version };
  }

  // Update existing draft/review version
  updatePageVersionContent(store, version.versionId, content);
  return { page: getPage(store, pageId), version: getPageVersion(store, version.versionId) };
}

// ── WORKFLOW TRANSITIONS ─────────────────────────────────────────────

export function submitForReview(store, rbac, actor, pageId) {
  assertAccess(rbac, actor, CAP.EDIT);
  const page = getPage(store, pageId);
  if (!page.currentVersionId) {
    throw new CmsError(CMS_ERROR.INVALID_STATUS, 'No draft version to submit');
  }
  const version = getPageVersion(store, page.currentVersionId);
  if (version.status !== PAGE_STATUS.DRAFT) {
    throw new CmsError(CMS_ERROR.INVALID_STATUS,
      `Cannot submit version in status ${version.status}. Must be DRAFT.`);
  }

  // Validate content before submitting
  const validation = validatePageContent(version.content);
  if (!validation.valid) {
    throw new CmsError(CMS_ERROR.VALIDATION_FAILED,
      `Page content validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
  }

  // Verify referenced assets exist
  for (const assetId of validation.referencedAssetIds) {
    try {
      const asset = getAssetMeta(store, assetId);
      if (asset.status !== ASSET_STATUS.ACTIVE) {
        throw new CmsError(CMS_ERROR.VALIDATION_FAILED, `Asset ${assetId} is not active`);
      }
    } catch (e) {
      if (e.code === CMS_ERROR.NOT_FOUND) {
        throw new CmsError(CMS_ERROR.VALIDATION_FAILED, `Referenced asset ${assetId} not found`);
      }
      throw e;
    }
  }

  updatePageVersionStatus(store, version.versionId, PAGE_STATUS.REVIEW);
  return getPageVersion(store, version.versionId);
}

export function approve(store, rbac, actor, pageId) {
  assertAccess(rbac, actor, CAP.PUBLISH);
  const page = getPage(store, pageId);
  if (!page.currentVersionId) {
    throw new CmsError(CMS_ERROR.INVALID_STATUS, 'No version to approve');
  }
  const version = getPageVersion(store, page.currentVersionId);
  if (version.status !== PAGE_STATUS.REVIEW) {
    throw new CmsError(CMS_ERROR.INVALID_STATUS,
      `Cannot approve version in status ${version.status}. Must be REVIEW.`);
  }

  updatePageVersionStatus(store, version.versionId, PAGE_STATUS.APPROVED);
  return getPageVersion(store, version.versionId);
}

export function publish(store, rbac, actor, pageId) {
  assertAccess(rbac, actor, CAP.PUBLISH);
  const page = getPage(store, pageId);
  if (!page.currentVersionId) {
    throw new CmsError(CMS_ERROR.INVALID_STATUS, 'No version to publish');
  }
  const version = getPageVersion(store, page.currentVersionId);
  if (version.status !== PAGE_STATUS.APPROVED) {
    throw new CmsError(CMS_ERROR.INVALID_STATUS,
      `Cannot publish version in status ${version.status}. Must be APPROVED.`);
  }

  // Archive previous published version
  if (page.publishedVersionId && page.publishedVersionId !== version.versionId) {
    try {
      updatePageVersionStatus(store, page.publishedVersionId, PAGE_STATUS.ARCHIVED);
    } catch (e) {
      // Previous version might already be archived
    }
  }

  // Freeze content — immutable from here
  freezePageVersion(store, version.versionId);

  // Track asset usage
  const validation = validatePageContent(version.content);
  for (const assetId of validation.referencedAssetIds) {
    try {
      const asset = getAssetMeta(store, assetId);
      if (!asset.usedByPageVersionIds.includes(version.versionId)) {
        asset.usedByPageVersionIds.push(version.versionId);
      }
    } catch (e) { /* asset may have been removed */ }
  }

  updatePage(store, page.pageId, {
    status: PAGE_STATUS.PUBLISHED,
    publishedVersionId: version.versionId,
  });

  return { page: getPage(store, pageId), version: getPageVersion(store, version.versionId) };
}

export function archive(store, rbac, actor, pageId) {
  assertAccess(rbac, actor, CAP.PUBLISH);
  const page = getPage(store, pageId);
  updatePage(store, page.pageId, { status: PAGE_STATUS.ARCHIVED });
  return getPage(store, pageId);
}

// ── VERSION HISTORY ──────────────────────────────────────────────────

export function versionHistory(store, rbac, actor, pageId) {
  assertAccess(rbac, actor, CAP.VIEW);
  getPage(store, pageId); // verify exists
  return listPageVersions(store, pageId);
}

// ── PREVIEW ──────────────────────────────────────────────────────────

export function preview(store, rbac, actor, pageId) {
  assertAccess(rbac, actor, CAP.VIEW);
  const page = getPage(store, pageId);
  if (!page.currentVersionId) {
    throw new CmsError(CMS_ERROR.INVALID_STATUS, 'No version to preview');
  }
  const version = getPageVersion(store, page.currentVersionId);
  return { page, version, fieldRegistry: registry().all() };
}

// ── CAMPAIGN CRUD ────────────────────────────────────────────────────

export function campaignCreate(store, rbac, actor, { name }) {
  assertAccess(rbac, actor, CAP.EDIT);
  return createCampaign(store, { name, createdBy: actor.userId });
}

export function campaignGet(store, rbac, actor, campaignId) {
  assertAccess(rbac, actor, CAP.VIEW);
  return getCampaign(store, campaignId);
}

export function campaignList(store, rbac, actor) {
  assertAccess(rbac, actor, CAP.VIEW);
  return listCampaigns(store);
}

export function campaignUpdate(store, rbac, actor, campaignId, updates) {
  assertAccess(rbac, actor, CAP.EDIT);
  const campaign = getCampaign(store, campaignId);
  if (campaign.status === CAMPAIGN_STATUS.ARCHIVED) {
    throw new CmsError(CMS_ERROR.INVALID_STATUS, 'Cannot update archived campaign');
  }

  // Validate pageIds if provided
  if (updates.pageIds) {
    for (const pid of updates.pageIds) {
      getPage(store, pid); // throws if not found
    }
  }

  const allowed = {};
  if (updates.name !== undefined) allowed.name = updates.name;
  if (updates.pageIds !== undefined) allowed.pageIds = updates.pageIds;
  // Offer-page content (simple editor) — plain JSON values only, no functions, size-capped.
  for (const key of CAMPAIGN_CONTENT_KEYS) {
    if (updates[key] === undefined) continue;
    const v = updates[key];
    if (typeof v === 'function') throw new CmsError(CMS_ERROR.INVALID_INPUT, `${key} must be JSON`);
    if (JSON.stringify(v ?? null).length > 20000) throw new CmsError(CMS_ERROR.VALIDATION_FAILED, `${key} too large`);
    allowed[key] = v;
  }

  return updateCampaign(store, campaignId, allowed);
}

export function campaignActivate(store, rbac, actor, campaignId) {
  assertAccess(rbac, actor, CAP.PUBLISH);
  const campaign = getCampaign(store, campaignId);

  if (campaign.status === CAMPAIGN_STATUS.ARCHIVED) {
    throw new CmsError(CMS_ERROR.INVALID_STATUS, 'Cannot activate archived campaign');
  }

  // Verify all campaign pages are published
  for (const pid of campaign.pageIds) {
    const page = getPage(store, pid);
    if (page.status !== PAGE_STATUS.PUBLISHED) {
      throw new CmsError(CMS_ERROR.VALIDATION_FAILED,
        `Page ${pid} (${page.name}) is not published. All campaign pages must be published before activation.`);
    }
  }

  // Deactivate any currently active campaign
  const currentActive = getActiveCampaign(store);
  if (currentActive && currentActive.campaignId !== campaignId) {
    updateCampaign(store, currentActive.campaignId, {
      status: CAMPAIGN_STATUS.INACTIVE,
      deactivatedAt: new Date().toISOString(),
    });
  }

  return updateCampaign(store, campaignId, {
    status: CAMPAIGN_STATUS.ACTIVE,
    activatedAt: new Date().toISOString(),
    deactivatedAt: null,
  });
}

export function campaignDeactivate(store, rbac, actor, campaignId) {
  assertAccess(rbac, actor, CAP.PUBLISH);
  const campaign = getCampaign(store, campaignId);
  if (campaign.status !== CAMPAIGN_STATUS.ACTIVE) {
    throw new CmsError(CMS_ERROR.INVALID_STATUS, 'Campaign is not active');
  }

  return updateCampaign(store, campaignId, {
    status: CAMPAIGN_STATUS.INACTIVE,
    deactivatedAt: new Date().toISOString(),
  });
}

// ── ASSET MANAGEMENT ─────────────────────────────────────────────────

export function assetUpload(store, rbac, actor, input, assetsDir) {
  assertAccess(rbac, actor, CAP.ASSET_MANAGE);
  return doUploadAsset(store, input, actor.userId, assetsDir);
}

export function assetGet(store, rbac, actor, assetId) {
  assertAccess(rbac, actor, CAP.VIEW);
  return getAssetMeta(store, assetId);
}

export function assetList(store, rbac, actor) {
  assertAccess(rbac, actor, CAP.VIEW);
  return listAssets(store);
}

export function assetFile(store, rbac, actor, assetId, assetsDir) {
  assertAccess(rbac, actor, CAP.VIEW);
  return doReadAssetFile(store, assetId, assetsDir);
}

export function assetArchive(store, rbac, actor, assetId) {
  assertAccess(rbac, actor, CAP.ASSET_MANAGE);
  const asset = getAssetMeta(store, assetId);
  if (asset.usedByPageVersionIds.length > 0) {
    throw new CmsError(CMS_ERROR.ASSET_IN_USE,
      `Asset ${assetId} is used by ${asset.usedByPageVersionIds.length} published page version(s)`);
  }
  asset.status = ASSET_STATUS.ARCHIVED;
  return asset;
}

// ── FIELD REGISTRY ───────────────────────────────────────────────────

export function fieldList(rbac, actor) {
  assertAccess(rbac, actor, CAP.VIEW);
  return registry().all();
}

// ── SNAPSHOT (for quotation issuance) ────────────────────────────────

export function snapshotForIssuance(store, pageId) {
  const page = getPage(store, pageId);
  if (!page.publishedVersionId) return null;
  return snapshotPageVersion(store, page.publishedVersionId);
}

// ── Active campaign resolver (for quotation integration) ─────────────

export function resolveActiveCampaign(store) {
  return getActiveCampaign(store);
}

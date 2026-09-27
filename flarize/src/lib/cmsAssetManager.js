/**
 * CMS Asset Manager — C11-E.
 *
 * Handles image asset storage for CMS pages.
 * - JSON base64 upload (no multipart — server has no multipart support)
 * - Magic byte MIME validation
 * - 5MB max decoded file size
 * - Stores to data/cms-assets/<assetId>.<ext>
 * - Metadata in cms-state.json via cmsStore
 */

import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, extname } from 'node:path';
import { CmsError, CMS_ERROR, assetId as generateAssetId, createAssetMeta } from './cmsStore.js';

// ── Constants ────────────────────────────────────────────────────────

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB decoded

export const ALLOWED_MIME_TYPES = Object.freeze({
  'image/png':  '.png',
  'image/jpeg': '.jpg',
});

// PNG magic bytes: 89 50 4E 47
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
// JPEG magic bytes: FF D8 FF
const JPEG_MAGIC = Buffer.from([0xFF, 0xD8, 0xFF]);

// ── MIME detection from magic bytes ──────────────────────────────────

export function detectMimeFromBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer.subarray(0, 4).equals(PNG_MAGIC)) return 'image/png';
  if (buffer.subarray(0, 3).equals(JPEG_MAGIC)) return 'image/jpeg';
  return null;
}

// ── Asset upload ─────────────────────────────────────────────────────

/**
 * Process an asset upload from JSON base64 payload.
 *
 * @param {object} store - CMS store (from cmsStore.js)
 * @param {object} input - { filename, mimeType, data (base64) }
 * @param {string} uploadedBy - actor userId
 * @param {string} assetsDir - path to data/cms-assets/
 * @returns {object} asset metadata
 */
export function uploadAsset(store, input, uploadedBy, assetsDir) {
  // Validate input
  if (!input || typeof input !== 'object') {
    throw new CmsError(CMS_ERROR.INVALID_INPUT, 'Upload input must be an object');
  }
  if (!input.data || typeof input.data !== 'string') {
    throw new CmsError(CMS_ERROR.INVALID_INPUT, 'data (base64) is required');
  }
  if (!input.filename || typeof input.filename !== 'string') {
    throw new CmsError(CMS_ERROR.INVALID_INPUT, 'filename is required');
  }

  // Decode base64
  let buffer;
  try {
    buffer = Buffer.from(input.data, 'base64');
  } catch (e) {
    throw new CmsError(CMS_ERROR.INVALID_INPUT, 'Invalid base64 data');
  }

  // Size check
  if (buffer.length > MAX_FILE_SIZE) {
    throw new CmsError(CMS_ERROR.VALIDATION_FAILED,
      `File size ${buffer.length} bytes exceeds maximum ${MAX_FILE_SIZE} bytes (5MB)`);
  }
  if (buffer.length === 0) {
    throw new CmsError(CMS_ERROR.INVALID_INPUT, 'File is empty');
  }

  // Magic byte MIME detection
  const detectedMime = detectMimeFromBytes(buffer);
  if (!detectedMime) {
    throw new CmsError(CMS_ERROR.VALIDATION_FAILED,
      'File magic bytes do not match any allowed type (PNG or JPEG)');
  }

  // Verify declared MIME matches actual
  if (input.mimeType && input.mimeType !== detectedMime) {
    throw new CmsError(CMS_ERROR.VALIDATION_FAILED,
      `Declared MIME "${input.mimeType}" does not match detected "${detectedMime}"`);
  }

  const ext = ALLOWED_MIME_TYPES[detectedMime];
  const id = generateAssetId();
  const storageName = `${id}${ext}`;
  const storagePath = join(assetsDir, storageName);

  // Compute checksum
  const checksum = createHash('sha256').update(buffer).digest('hex');

  // Sanitize filename — strip path traversal
  const safeName = sanitizeFilename(input.filename);

  // Write file
  writeFileSync(storagePath, buffer);

  // Store metadata
  const meta = createAssetMeta(store, {
    assetId: id,
    filename: safeName,
    storagePath: storageName, // relative to assetsDir
    mimeType: detectedMime,
    width: null,  // image dimensions could be extracted but not required for MVP
    height: null,
    fileSizeBytes: buffer.length,
    checksum,
    uploadedBy,
  });

  return meta;
}

// ── Filename sanitization ────────────────────────────────────────────

export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'untitled';
  // Strip directory separators and dangerous chars
  let safe = name.replace(/[/\\:*?"<>|]/g, '_');
  // Replace consecutive dots (path traversal)
  safe = safe.replace(/\.{2,}/g, '_');
  // Strip leading dots (hidden files)
  safe = safe.replace(/^\.+/, '');
  // Limit length
  if (safe.length > 100) safe = safe.slice(0, 100);
  return safe || 'untitled';
}

// ── Read asset file ──────────────────────────────────────────────────

export function readAssetFile(store, assetIdValue, assetsDir) {
  const meta = store.assets[assetIdValue];
  if (!meta) throw new CmsError(CMS_ERROR.NOT_FOUND, `Asset ${assetIdValue} not found`);

  const filePath = join(assetsDir, meta.storagePath);
  if (!existsSync(filePath)) {
    throw new CmsError(CMS_ERROR.NOT_FOUND, `Asset file not found on disk`);
  }

  return {
    buffer: readFileSync(filePath),
    mimeType: meta.mimeType,
    filename: meta.filename,
  };
}

// ── Path traversal check ─────────────────────────────────────────────

export function isPathTraversal(filename) {
  if (!filename || typeof filename !== 'string') return true;
  if (filename.includes('..')) return true;
  if (filename.includes('/') || filename.includes('\\')) return true;
  if (filename.startsWith('.')) return true;
  return false;
}

/**
 * APPROVED TEMPLATE LOADER
 * ────────────────────────
 * Reads the versioned Claude Design bundle checked in at
 * assets/approved-template/Flarize_Solar_Quotation.v1.html and returns its
 * decoded template DOM, decoded asset manifest, and integrity metadata.
 *
 * Contract (Phase 1 architecture lock):
 *   - The approved bundle is the ONLY visual source of truth.
 *   - Fail loudly if the bundle is missing or malformed.
 *   - Never silently replace: the bundle sha256 is asserted against the pinned
 *     value in the sibling .meta.json.
 *   - No network. No CDN. No runtime patching.
 *   - Pure function of the on-disk bundle. Cached per-process.
 *
 * This module has ONE job: give the renderer a decoded, verified template.
 * It does not strip preview scaffolding, substitute values, or generate HTML.
 * That belongs to approvedTemplate.js.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const APPROVED_TEMPLATE_LOADER_VERSION = 'approvedTemplateLoader.1';

/** Named failure codes. Every throw carries one. */
export const LOADER_ERROR = Object.freeze({
  BUNDLE_MISSING:               'BUNDLE_MISSING',
  META_MISSING:                 'META_MISSING',
  META_MALFORMED:               'META_MALFORMED',
  BUNDLE_HASH_MISMATCH:         'BUNDLE_HASH_MISMATCH',
  MANIFEST_BLOCK_MISSING:       'MANIFEST_BLOCK_MISSING',
  TEMPLATE_BLOCK_MISSING:       'TEMPLATE_BLOCK_MISSING',
  MANIFEST_HASH_MISMATCH:       'MANIFEST_HASH_MISMATCH',
  TEMPLATE_HASH_MISMATCH:       'TEMPLATE_HASH_MISMATCH',
  MANIFEST_MALFORMED:           'MANIFEST_MALFORMED',
  TEMPLATE_MALFORMED:           'TEMPLATE_MALFORMED',
  SECTION_COUNT_UNEXPECTED:     'SECTION_COUNT_UNEXPECTED',
  // R1 (2026-09-04)
  PIN_NAME_MISSING:             'PIN_NAME_MISSING',
  PIN_VERSION_MISSING:          'PIN_VERSION_MISSING',
  PIN_BUNDLE_SHA_MISMATCH:      'PIN_BUNDLE_SHA_MISMATCH',
  PIN_TEMPLATE_SHA_MISMATCH:    'PIN_TEMPLATE_SHA_MISMATCH',
  PIN_MANIFEST_SHA_MISMATCH:    'PIN_MANIFEST_SHA_MISMATCH',
});

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Default vendored bundle path (repo-relative to this file).
const DEFAULT_BUNDLE_PATH = resolve(
  __dirname, '..', '..', 'assets', 'approved-template', 'Flarize_Solar_Quotation.v1.html');
const DEFAULT_META_PATH   = resolve(
  __dirname, '..', '..', 'assets', 'approved-template', 'Flarize_Solar_Quotation.v1.meta.json');

// Per-process cache — the bundle is 3.86 MB and never mutates at runtime.
const _cache = new Map();

/**
 * Load and verify the approved template.
 *
 * @param {object} [opts]
 * @param {string} [opts.bundlePath] — override for tests
 * @param {string} [opts.metaPath]   — override for tests
 * @returns {{
 *   templateHtml: string,             // decoded HTML DOM (post-JSON-unescape)
 *   manifest: Object,                 // uuid → { mime, data (base64), compressed }
 *   uriMap: Record<string,string>,    // uuid → "data:<mime>;base64,<data>"
 *   sectionCount: number,             // number of <section class="page"> in template
 *   meta: object,                     // parsed .meta.json (name, version, hashes)
 *   bundleBytes: number,
 * }}
 */
export function loadApprovedTemplate({ bundlePath = DEFAULT_BUNDLE_PATH, metaPath = DEFAULT_META_PATH } = {}) {
  const cacheKey = bundlePath + '::' + metaPath;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  if (!existsSync(bundlePath)) throwLoader(LOADER_ERROR.BUNDLE_MISSING,
    `Approved bundle not found at ${bundlePath}. Vendor it under assets/approved-template/ before running the renderer.`);

  if (!existsSync(metaPath)) throwLoader(LOADER_ERROR.META_MISSING,
    `Approved bundle meta not found at ${metaPath}. It records the pinned bundle sha256 and must ship with the bundle.`);

  let meta;
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch (e) {
    throwLoader(LOADER_ERROR.META_MALFORMED, `Meta JSON at ${metaPath} did not parse: ${e.message}`);
  }
  for (const key of ['name', 'version', 'bundleSha256', 'manifestSha256', 'templateSha256', 'assetsInManifest']) {
    if (meta[key] === undefined || meta[key] === null || meta[key] === '')
      throwLoader(LOADER_ERROR.META_MALFORMED, `Meta at ${metaPath} missing required key "${key}".`);
  }

  const bundleBuf   = readFileSync(bundlePath);
  const bundleBytes = bundleBuf.length;
  const bundleSha   = sha256(bundleBuf);
  if (bundleSha !== meta.bundleSha256)
    throwLoader(LOADER_ERROR.BUNDLE_HASH_MISMATCH,
      `Approved bundle sha256 changed. Pinned=${meta.bundleSha256} actual=${bundleSha}. ` +
      `If this is an intentional template revision, update the meta and re-run the visual golden.`);

  const bundleSrc = bundleBuf.toString('utf8');

  const manifestRaw = extractScriptBlock(bundleSrc, 'manifest');
  if (manifestRaw == null) throwLoader(LOADER_ERROR.MANIFEST_BLOCK_MISSING,
    'Approved bundle has no <script type="__bundler/manifest"> block.');
  if (sha256(manifestRaw) !== meta.manifestSha256)
    throwLoader(LOADER_ERROR.MANIFEST_HASH_MISMATCH,
      `Approved manifest sha256 changed. Pinned=${meta.manifestSha256} actual=${sha256(manifestRaw)}.`);

  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (e) {
    throwLoader(LOADER_ERROR.MANIFEST_MALFORMED, `Manifest JSON did not parse: ${e.message}`);
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest))
    throwLoader(LOADER_ERROR.MANIFEST_MALFORMED, 'Manifest must be a plain object keyed by asset uuid.');
  const manifestKeys = Object.keys(manifest);
  if (manifestKeys.length !== meta.assetsInManifest)
    throwLoader(LOADER_ERROR.MANIFEST_MALFORMED,
      `Manifest asset count ${manifestKeys.length} does not match meta.assetsInManifest ${meta.assetsInManifest}.`);
  for (const uuid of manifestKeys) {
    const entry = manifest[uuid];
    if (!entry || typeof entry !== 'object' || typeof entry.mime !== 'string' || typeof entry.data !== 'string')
      throwLoader(LOADER_ERROR.MANIFEST_MALFORMED,
        `Manifest entry ${uuid} is malformed (needs {mime, data}).`);
  }

  const templateRaw = extractScriptBlock(bundleSrc, 'template');
  if (templateRaw == null) throwLoader(LOADER_ERROR.TEMPLATE_BLOCK_MISSING,
    'Approved bundle has no <script type="__bundler/template"> block.');
  if (sha256(templateRaw) !== meta.templateSha256)
    throwLoader(LOADER_ERROR.TEMPLATE_HASH_MISMATCH,
      `Approved template sha256 changed. Pinned=${meta.templateSha256} actual=${sha256(templateRaw)}.`);

  // Template block ships as a JSON-encoded string; decode to raw HTML.
  let templateHtml;
  try {
    templateHtml = JSON.parse(templateRaw);
  } catch (e) {
    throwLoader(LOADER_ERROR.TEMPLATE_MALFORMED, `Template JSON did not parse: ${e.message}`);
  }
  if (typeof templateHtml !== 'string' || templateHtml.length === 0)
    throwLoader(LOADER_ERROR.TEMPLATE_MALFORMED, 'Template must decode to a non-empty string.');

  // Section count = the count of <section class="page"> occurrences (verbatim in template).
  const sectionCount = (templateHtml.match(/<section class="page"/g) || []).length;
  if (sectionCount !== 12)
    throwLoader(LOADER_ERROR.SECTION_COUNT_UNEXPECTED,
      `Approved template must declare exactly 12 sections; found ${sectionCount}.`);

  // Build UUID → data-URI lookup once. Every future asset resolution reads from here.
  const uriMap = Object.create(null);
  for (const [uuid, entry] of Object.entries(manifest)) {
    uriMap[uuid] = `data:${entry.mime};base64,${entry.data}`;
  }
  Object.freeze(uriMap);

  const result = Object.freeze({
    templateHtml,
    manifest,
    uriMap,
    sectionCount,
    meta: Object.freeze({ ...meta, bundleShaVerified: bundleSha }),
    bundleBytes,
  });
  _cache.set(cacheKey, result);
  return result;
}

/** Clear the per-process cache. Tests only. */
export function _clearApprovedTemplateCache() {
  _cache.clear();
}

// ═════════════════════════════════════════════════════════════════════════════
// R1 + R2 (2026-09-04) — VERSIONED / PINNED LOAD
//
// The default `loadApprovedTemplate()` above resolves to
// `Flarize_Solar_Quotation.v1.html` in `assets/approved-template/`. When a
// Rev 2 bundle ships, its default path becomes `.v2.html` and a naive replay
// of an old ISSUED quotation would silently render against v2. To prevent
// that, ISSUED documents carry `document.rendererPinning = { name, version,
// bundleSha256, templateSha256, manifestSha256?, rendererVersion, pinnedAt }`.
// The renderer, when it holds pinning, resolves the bundle THROUGH this
// pinned loader, which:
//   1. Resolves the on-disk path from `name + version` deterministically.
//   2. Refuses to load if the file is missing (BUNDLE_MISSING).
//   3. Refuses to load if the meta hash pinning doesn't match the ISSUE-time
//      hashes (PIN_BUNDLE_SHA_MISMATCH / PIN_TEMPLATE_SHA_MISMATCH).
//   4. NEVER falls back to any other version.
// ─────────────────────────────────────────────────────────────────────────────

const APPROVED_TEMPLATE_DIR = resolve(__dirname, '..', '..', 'assets', 'approved-template');

/**
 * Deterministic file resolver — `Flarize_Solar_Quotation.v1.html` +
 * `Flarize_Solar_Quotation.v1.meta.json`. Path shape is fixed; new bundle
 * versions ship under new filenames (`.v2.html`, `.v3.html`, …) so all
 * historical versions coexist on disk.
 */
export function resolveApprovedTemplatePaths({ name, version } = {}) {
  if (!name || typeof name !== 'string')
    throwLoader(LOADER_ERROR.PIN_NAME_MISSING,
      'resolveApprovedTemplatePaths: `name` is required (a non-empty string).');
  if (!version || typeof version !== 'string')
    throwLoader(LOADER_ERROR.PIN_VERSION_MISSING,
      'resolveApprovedTemplatePaths: `version` is required (a non-empty string, e.g. "v1").');
  // Vendored bundle filenames use underscores in place of spaces (e.g.
  // meta.name = "Flarize Solar Quotation" → file "Flarize_Solar_Quotation.v1.html").
  // Deterministic slug: collapse any whitespace to '_' and refuse path
  // traversal characters.
  const safeName = name.replace(/\s+/g, '_').replace(/[\/\\\0]/g, '_');
  const safeVersion = version.replace(/\s+/g, '_').replace(/[\/\\\0]/g, '_');
  return {
    bundlePath: resolve(APPROVED_TEMPLATE_DIR, `${safeName}.${safeVersion}.html`),
    metaPath:   resolve(APPROVED_TEMPLATE_DIR, `${safeName}.${safeVersion}.meta.json`),
  };
}

/**
 * Snapshot of the current default template's identity + integrity. Callers at
 * ISSUE time call this once and pass the returned object as
 * `rendererPinning` to `issueQuotation`. The renderer version comes from the
 * approvedTemplate.js module (passed in by the caller) — this loader does
 * not know about it.
 *
 * @param {object} [opts] — override loader paths (tests)
 * @returns {{
 *   name: string, version: string,
 *   bundleSha256: string, templateSha256: string, manifestSha256: string,
 * }}
 */
export function getCurrentApprovedTemplatePinning(opts) {
  const loaded = loadApprovedTemplate(opts);
  return Object.freeze({
    name: loaded.meta.name,
    version: loaded.meta.version,
    bundleSha256: loaded.meta.bundleSha256,
    templateSha256: loaded.meta.templateSha256,
    manifestSha256: loaded.meta.manifestSha256,
  });
}

/**
 * Load the EXACT bundle recorded on an ISSUED document. Any mismatch between
 * the on-disk meta and the pinned hashes causes a hard failure — never a
 * silent fallback to a different version.
 *
 * @param {object} pinning — the `rendererPinning` object from the ISSUED document
 * @param {string} pinning.name
 * @param {string} pinning.version
 * @param {string} pinning.bundleSha256
 * @param {string} pinning.templateSha256
 * @param {string} [pinning.manifestSha256]
 * @returns same shape as loadApprovedTemplate
 */
export function loadPinnedApprovedTemplate(pinning) {
  if (!pinning || typeof pinning !== 'object')
    throwLoader(LOADER_ERROR.PIN_NAME_MISSING,
      'loadPinnedApprovedTemplate: pinning object required.');
  const { name, version, bundleSha256, templateSha256, manifestSha256 } = pinning;
  if (!name)         throwLoader(LOADER_ERROR.PIN_NAME_MISSING,    'rendererPinning.name is required.');
  if (!version)      throwLoader(LOADER_ERROR.PIN_VERSION_MISSING, 'rendererPinning.version is required.');
  if (!bundleSha256) throwLoader(LOADER_ERROR.PIN_BUNDLE_SHA_MISMATCH,
    'rendererPinning.bundleSha256 is required — cannot enforce integrity without it.');

  const paths = resolveApprovedTemplatePaths({ name, version });

  // 1. Bundle MUST exist at the pinned version's exact path. No fallback.
  if (!existsSync(paths.bundlePath))
    throwLoader(LOADER_ERROR.BUNDLE_MISSING,
      `Pinned approved bundle not found at ${paths.bundlePath}. ` +
      `An ISSUED quotation pinned "${name} ${version}" but that bundle is not on disk. ` +
      `Refusing to substitute another version.`);

  // 2. Load via the generic loader (which itself verifies on-disk meta hashes).
  const loaded = loadApprovedTemplate(paths);

  // 3. Assert the ON-DISK meta matches the ISSUE-TIME pin. If Admin re-signed
  // the meta with a new sha (i.e. edited the bundle in place), we FAIL LOUD.
  if (loaded.meta.bundleSha256 !== bundleSha256)
    throwLoader(LOADER_ERROR.PIN_BUNDLE_SHA_MISMATCH,
      `Pinned bundle sha256 does not match on-disk meta. ` +
      `Pinned=${bundleSha256} on-disk=${loaded.meta.bundleSha256}. ` +
      `The bundle file at ${paths.bundlePath} has been re-signed since this quotation was issued. ` +
      `Refusing to render — historical replay must load the exact bytes that were issued.`);

  if (templateSha256 && loaded.meta.templateSha256 !== templateSha256)
    throwLoader(LOADER_ERROR.PIN_TEMPLATE_SHA_MISMATCH,
      `Pinned template sha256 does not match on-disk meta. ` +
      `Pinned=${templateSha256} on-disk=${loaded.meta.templateSha256}.`);

  if (manifestSha256 && loaded.meta.manifestSha256 !== manifestSha256)
    throwLoader(LOADER_ERROR.PIN_MANIFEST_SHA_MISMATCH,
      `Pinned manifest sha256 does not match on-disk meta. ` +
      `Pinned=${manifestSha256} on-disk=${loaded.meta.manifestSha256}.`);

  return loaded;
}

// ---- internal helpers -------------------------------------------------------

function extractScriptBlock(src, kind) {
  const re = new RegExp(
    `<script[^>]*type="__bundler/${kind}"[^>]*>([\\s\\S]*?)</script>`);
  const m  = re.exec(src);
  return m ? m[1] : null;
}

function sha256(bufOrStr) {
  return createHash('sha256').update(bufOrStr).digest('hex');
}

function throwLoader(code, message) {
  const e = new Error(`[approvedTemplate.loader] ${code}: ${message}`);
  e.code = code;
  throw e;
}

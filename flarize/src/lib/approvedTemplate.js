/**
 * APPROVED-TEMPLATE RENDERER
 * ──────────────────────────
 * Phase 1 architecture (per lock 2026-09-03):
 *
 *   Approved bundle DOM → strip preview shell → expand image slots →
 *   substitute mustaches → validate → print-ready HTML → A4 PDF.
 *
 * MUST DO
 *   1. Preserve approved section DOM.
 *   2. Preserve approved CSS.
 *   3. Preserve approved assets (via manifest UUID → data: URI).
 *   4. Preserve approved positioning, typography, composition.
 *   5. Inject only authorized dynamic data (registry-declared).
 *   6. Expand only authorized image slots (registry-declared).
 *   7. Print directly to A4.
 *
 * MUST NOT
 *   - recreate page layouts / create new page designs.
 *   - use 1000×1414 canvas.
 *   - use `zoom` or `transform: scale` for page fitting.
 *   - pixel-pick page coordinates.
 *   - add page-specific layout corrections, masks, or visual compensations.
 *   - duplicate quotation business logic.
 *
 * Public surface: 6 functions.
 *   loadTemplate(), stripPreviewShell(), expandImageSlots(),
 *   substituteMustaches(), validateUnresolvedTokens(), renderQuotationHtml().
 *
 * Every dynamic value originates from the snapshot payload. If the snapshot
 * lacks a required value, the renderer FAILS SAFELY with a named blocker —
 * never zero, never sample data, never template default.
 */

import { loadApprovedTemplate as _loadApprovedTemplate } from './approvedTemplate.loader.js';

export const APPROVED_TEMPLATE_VERSION = 'approvedTemplate.1';

// ═══════════════════════════════════════════════════════════════════════════
// FAILURE CODES
// ═══════════════════════════════════════════════════════════════════════════

export const RENDER_ERROR = Object.freeze({
  TEMPLATE_NOT_LOADED:                  'TEMPLATE_NOT_LOADED',
  PREVIEW_SHELL_ARTIFACT_LEFTOVER:      'PREVIEW_SHELL_ARTIFACT_LEFTOVER',
  IMAGE_SLOT_UNRESOLVED:                'IMAGE_SLOT_UNRESOLVED',
  IMAGE_SLOT_UNAUTHORIZED:              'IMAGE_SLOT_UNAUTHORIZED',
  MUSTACHE_UNRESOLVED:                  'MUSTACHE_UNRESOLVED',
  MUSTACHE_UNKNOWN:                     'MUSTACHE_UNKNOWN',
  MUSTACHE_MAPPED_TO_NON_AUTHORITATIVE: 'MUSTACHE_MAPPED_TO_NON_AUTHORITATIVE',
  SNAPSHOT_FIELD_MISSING:               'SNAPSHOT_FIELD_MISSING',
  SNAPSHOT_FIELD_INVALID_TYPE:          'SNAPSHOT_FIELD_INVALID_TYPE',
  PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE:
                                        'PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE',
  TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT:
                                        'TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT',
  FORMATTER_FAILED:                     'FORMATTER_FAILED',
});

// ═══════════════════════════════════════════════════════════════════════════
// SUCCESS CODES  (for the audit / blocker report)
// ═══════════════════════════════════════════════════════════════════════════

export const RENDER_STATUS = Object.freeze({
  READY:                                'READY',
  BLOCKED:                              'BLOCKED',
});

export const PRODUCTION_BLOCKER = Object.freeze({
  PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE:
    'PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE',
  TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT:
    'TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT',
  SAVINGS_ENGINE_MISSING_DAILY_FIELD:
    'SAVINGS_ENGINE_MISSING_DAILY_FIELD',
});

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN REGISTRY
//   Every {{ token }} that appears in the approved template is declared here.
//   Any unregistered token in the template is a MUSTACHE_UNKNOWN failure.
//   Any registered token missing from the snapshot is a MUSTACHE_UNRESOLVED
//   failure. No silent fallback, no default.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Authoritative snapshot sources this renderer accepts values from.
 * Anything outside this allow-list is rejected as non-authoritative — even if
 * a token registry entry names it — as an extra guard against drift.
 */
export const AUTHORITATIVE_SOURCES = Object.freeze(new Set([
  'payload.pricing.value',
  'payload.subsidy.value',
  'payload.savings.value',
  'payload.financing.value',
  'payload.company.value',
  'payload.campaign.value',
  'payload.energyProfile.value',
]));

/**
 * Formatter helpers — the ONLY logic run over snapshot values. No calculation.
 * All formatters accept a number and return a string, or throw on invalid input.
 */
export const FORMATTERS = Object.freeze({
  inrRupees(v) {
    assertFiniteNumber(v);
    return '₹' + indianDigitGroup(Math.round(v));
  },
  inrRange(lo, hi) {
    assertFiniteNumber(lo); assertFiniteNumber(hi);
    return '₹' + indianDigitGroup(Math.round(lo)) + '–' + indianDigitGroup(Math.round(hi));
  },
  inrMinus(v) {
    assertFiniteNumber(v);
    return '−₹' + indianDigitGroup(Math.round(v));
  },
  intUnits(v) {
    assertFiniteNumber(v);
    return String(Math.round(v));
  },
  unitsRange(lo, hi) {
    assertFiniteNumber(lo); assertFiniteNumber(hi);
    return Math.round(lo) + '–' + Math.round(hi);
  },
  percent(v) {
    assertFiniteNumber(v);
    return String(v) + '%';
  },
  years(v) {
    assertFiniteNumber(v);
    return String(v) + ' yrs';
  },
  passthrough(v) {
    if (v == null || v === '') throw new Error('empty string');
    return String(v);
  },
});

/**
 * The 23 approved mustache tokens the template ships with.
 *
 * Each entry:
 *   token       — literal {{ token }} name (whitespace-insensitive)
 *   source      — authoritative snapshot section (allow-listed above)
 *   resolve     — function (payload) → raw value | null (null = MISSING)
 *   format      — FORMATTERS.* key OR function(rawValue) → string
 *   pages       — pages the token appears on (documentation only)
 *   required    — true = missing = MUSTACHE_UNRESOLVED
 *   blocker     — set to a PRODUCTION_BLOCKER when the token cannot be resolved
 *                 from the current snapshot shape (documents architectural gap)
 */
export const TOKEN_REGISTRY = Object.freeze([
  // ─── tier pricing (Pages 5, 7, 12) ────────────────────────────────────────
  { token: 'eliteCost',      source: 'payload.pricing.value', format: 'inrRupees',
    resolve: p => tryTier(p, 'elite',      'customerTotalIncludingGST'),
    pages: [5, 7, 12], required: true, blocker: PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT },
  { token: 'smartCost',      source: 'payload.pricing.value', format: 'inrRupees',
    resolve: p => tryTier(p, 'smart',      'customerTotalIncludingGST'),
    pages: [5, 7, 12], required: true, blocker: PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT },
  { token: 'essentialCost',  source: 'payload.pricing.value', format: 'inrRupees',
    resolve: p => tryTier(p, 'essential',  'customerTotalIncludingGST'),
    pages: [5, 7],     required: true, blocker: PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT },

  // ─── down payment (Pages 5, 7) ────────────────────────────────────────────
  { token: 'downLabel',      source: 'payload.financing.value', format: v => `Down Payment (${v}%)`,
    resolve: p => path(p, 'financing.value.downPaymentPercentage'),
    pages: [5, 7], required: true },
  { token: 'eliteDown',      source: 'payload.financing.value', format: 'inrMinus',
    resolve: p => tryTier(p, 'elite',     'downPaymentAmount', 'financing'),
    pages: [5, 7], required: true, blocker: PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT },
  { token: 'smartDown',      source: 'payload.financing.value', format: 'inrMinus',
    resolve: p => tryTier(p, 'smart',     'downPaymentAmount', 'financing'),
    pages: [5, 7], required: true, blocker: PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT },
  { token: 'essentialDown',  source: 'payload.financing.value', format: 'inrMinus',
    resolve: p => tryTier(p, 'essential', 'downPaymentAmount', 'financing'),
    pages: [5, 7], required: true, blocker: PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT },

  // ─── subsidy (Pages 5, 7, 12) ─────────────────────────────────────────────
  //  subsidyAmt appears as a positive amount on Page 7 (Subsidy Amount row).
  //  smartSubsidyMinus appears as a negative amount on Pages 5, 12
  //  (Payment Breakdown row).
  { token: 'subsidyAmt',     source: 'payload.subsidy.value', format: 'inrRupees',
    resolve: p => path(p, 'subsidy.value.subsidyAmount'),
    pages: [5, 7], required: true },
  { token: 'smartSubsidyMinus', source: 'payload.subsidy.value', format: 'inrMinus',
    resolve: p => path(p, 'subsidy.value.subsidyAmount'),
    pages: [5, 12], required: true },

  // ─── financed / amount payable (Pages 5, 7, 12) ───────────────────────────
  { token: 'eliteFin',       source: 'payload.financing.value', format: 'inrRupees',
    resolve: p => tryTier(p, 'elite',     'postSubsidyInvestment', 'financing'),
    pages: [5, 7], required: true, blocker: PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT },
  { token: 'smartFin',       source: 'payload.financing.value', format: 'inrRupees',
    resolve: p => tryTier(p, 'smart',     'postSubsidyInvestment', 'financing'),
    pages: [5, 7, 12], required: true, blocker: PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT },
  { token: 'essentialFin',   source: 'payload.financing.value', format: 'inrRupees',
    resolve: p => tryTier(p, 'essential', 'postSubsidyInvestment', 'financing'),
    pages: [5, 7], required: true, blocker: PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT },

  // ─── EMI (Pages 5, 7) ─────────────────────────────────────────────────────
  { token: 'emiLabel',       source: 'payload.financing.value',
    format: v => `EMI (${v.years} yrs @ ${v.rate}%)`,
    resolve: p => {
      const y = path(p, 'financing.value.tenureYears');
      const r = path(p, 'financing.value.interestRatePct');
      if (y == null || r == null) return null;
      return { years: y, rate: r };
    },
    pages: [5, 7], required: true },
  { token: 'emiOn',          source: 'payload.financing.value',
    format: v => `on ₹${indianDigitGroup(v)}`,
    resolve: p => path(p, 'financing.value.postSubsidyInvestment'),
    pages: [5, 7], required: true },
  { token: 'emiValue',       source: 'payload.financing.value', format: v => '₹' + indianDigitGroup(v) + '/mo',
    resolve: p => path(p, 'financing.value.monthlyEMI'),
    pages: [5, 7], required: true },
  { token: 'eliteEmiValue',  source: 'payload.financing.value', format: v => '₹' + indianDigitGroup(v) + '/mo',
    resolve: p => tryTier(p, 'elite',     'monthlyEMI', 'financing'),
    pages: [5, 7], required: true, blocker: PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT },
  { token: 'smartEmiValue',  source: 'payload.financing.value', format: v => '₹' + indianDigitGroup(v) + '/mo',
    resolve: p => tryTier(p, 'smart',     'monthlyEMI', 'financing'),
    pages: [5, 7], required: true, blocker: PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT },
  { token: 'essentialEmiValue', source: 'payload.financing.value', format: v => '₹' + indianDigitGroup(v) + '/mo',
    resolve: p => tryTier(p, 'essential', 'monthlyEMI', 'financing'),
    pages: [5, 7], required: true, blocker: PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT },

  // ─── daily savings equivalence (Page 5) ───────────────────────────────────
  // RENDERER RULE (Step 1 lock 2026-09-04): the renderer must NOT do
  // arithmetic on payload values. `savingsEngine` currently emits
  // `monthlySavings` but not `dailySavings`. Until the engine adds a
  // `dailySavings` field, these tokens BLOCK with an explicit code — never
  // silently divided by 30.
  { token: 'dailyValue',     source: 'payload.savings.value', format: v => '₹' + indianDigitGroup(v) + '/day',
    resolve: p => path(p, 'savings.value.dailySavings'),
    pages: [5], required: true, blocker: PRODUCTION_BLOCKER.SAVINGS_ENGINE_MISSING_DAILY_FIELD },
  { token: 'eliteDaily',     source: 'payload.savings.value', format: v => '₹' + indianDigitGroup(v) + '/day',
    resolve: p => tryTier(p, 'elite',     'dailySavings', 'savings'),
    pages: [5], required: true, blocker: PRODUCTION_BLOCKER.SAVINGS_ENGINE_MISSING_DAILY_FIELD },
  { token: 'smartDaily',     source: 'payload.savings.value', format: v => '₹' + indianDigitGroup(v) + '/day',
    resolve: p => tryTier(p, 'smart',     'dailySavings', 'savings'),
    pages: [5], required: true, blocker: PRODUCTION_BLOCKER.SAVINGS_ENGINE_MISSING_DAILY_FIELD },
  { token: 'essentialDaily', source: 'payload.savings.value', format: v => '₹' + indianDigitGroup(v) + '/day',
    resolve: p => tryTier(p, 'essential', 'dailySavings', 'savings'),
    pages: [5], required: true, blocker: PRODUCTION_BLOCKER.SAVINGS_ENGINE_MISSING_DAILY_FIELD },

  // ─── monthly savings range (Page 12) ──────────────────────────────────────
  { token: 'savingsRange',   source: 'payload.savings.value',
    format: v => '₹' + indianDigitGroup(v.lo) + '–' + indianDigitGroup(v.hi),
    resolve: p => {
      const lo = path(p, 'savings.value.monthlySavingsLow');
      const hi = path(p, 'savings.value.monthlySavingsHigh');
      if (lo == null || hi == null) return null;
      return { lo, hi };
    },
    pages: [12], required: true },
]);

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE-SLOT REGISTRY
//   Every <image-slot id="…" src="uuid"> in the approved template is declared
//   here. Any unregistered slot is IMAGE_SLOT_UNAUTHORIZED. Any registered
//   slot whose default UUID is missing from the manifest is IMAGE_SLOT_UNRESOLVED.
// ═══════════════════════════════════════════════════════════════════════════

export const IMAGE_SLOT_REGISTRY = Object.freeze([
  { id: 'ofr-scooter', page: 2, defaultUuid: '16d6bc21-5e80-44e6-9dcd-7c72290520e9',
    overridePath: 'payload.campaign.value.artwork.scooterImageUri' },
  { id: 'ben-ac1',     page: 2, defaultUuid: '563c0494-548a-427f-9c14-569955a50b78',
    overridePath: 'payload.campaign.value.artwork.acVoucherImageUri' },
  { id: 'ben-ac2',     page: 2, defaultUuid: '0cf315e2-73de-44f8-854c-52cc65886d9e',
    overridePath: 'payload.campaign.value.artwork.hybridInverterImageUri' },
  { id: 'ben-ac3',     page: 2, defaultUuid: 'd2af45dc-83cf-4b46-b2f2-9036994aaddb',
    overridePath: 'payload.campaign.value.artwork.festiveGiftImageUri' },
]);

// ═══════════════════════════════════════════════════════════════════════════
// PAGE 3 ARCHITECTURAL BLOCKER
//   The approved template's Page 3 is a single baked JPEG with NO mustaches
//   and NO overlays. Live customer data cannot enter Page 3 until the approved
//   template is revised. Per lock: do NOT ship masks / pixel overlays.
// ═══════════════════════════════════════════════════════════════════════════

export const PAGE_3_STATUS = Object.freeze({
  code:  PRODUCTION_BLOCKER.PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE,
  page:  3,
  message:
    'Page 3 of the approved template is a single baked JPEG with no {{mustache}} slots ' +
    'and no <image-slot>. The renderer renders it verbatim. Dynamic Page 3 values ' +
    '(daily generation, monthly KSEB value, home uses, surplus exported, footer contact) ' +
    'require the approved template designer to add authorized {{mustache}} slots or ' +
    'image-slots to Page 3 in a template revision. Until that ships, dynamic Page 3 data ' +
    'is a PRODUCTION-RELEASE BLOCKER.',
  affectedFields: Object.freeze([
    'dailyGenerationRange',
    'monthlyKsebValueRange',
    'homeUsesUnitsPerDay',
    'surplusExportedRange',
    'footerContact',
  ]),
});

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW-SHELL SCAFFOLDING
//   Only confirmed Claude Design runtime scaffolding is removed. Section
//   contents are never touched. If any scaffolding artifact survives stripping,
//   PREVIEW_SHELL_ARTIFACT_LEFTOVER is thrown.
// ═══════════════════════════════════════════════════════════════════════════

export const PREVIEW_SHELL_TAGS = Object.freeze([
  { name: 'runtime-script',     description: '<script src="0abc8473-…"></script> — Claude Design runtime chunk' },
  { name: 'ext-runtime-script', description: 'react + react-dom UMD chunks pulled by ext_resources' },
  { name: 'bundler-scripts',    description: 'all <script type="__bundler/…"> blocks (manifest/template/page_order/ext_resources)' },
  { name: 'x-dc',               description: '<x-dc> host element (kept children)' },
  { name: 'helmet',             description: '<helmet> …hoisted into <head> and tag removed' },
  { name: 'doc-page',           description: '<doc-page size="a4" margin="0"> preview viewport (kept children)' },
  { name: 'bundler-loading',    description: '<div id="__bundler_loading"> / <div id="__bundler_thumbnail"> preview UI' },
  { name: 'bundler-error-sink', description: '<div id="__bundler_err"> runtime error banner' },
]);

/** The direct-print CSS injected into the stripped DOM. Proven by PoC. */
export const A4_PRINT_CSS = `
<style id="__flarize_print_a4__">
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #ffffff; }
  section.page {
    width: 210mm !important;
    height: 297mm !important;
    overflow: hidden !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    box-sizing: border-box;
  }
  section.page:last-child { page-break-after: auto !important; break-after: auto !important; }
</style>`.trim();

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — the 6 functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * (1) Read + verify + cache the versioned approved bundle.
 * Delegates to approvedTemplate.loader. Returns loader result verbatim.
 */
export function loadTemplate(opts) {
  return _loadApprovedTemplate(opts);
}

/**
 * (2) Remove ONLY confirmed Claude Design preview scaffolding.
 * Never alters <section class="page"> contents. Hoists <helmet> children
 * into <head>. Injects the A4 print CSS. Returns rewritten HTML.
 *
 * @param {string} templateHtml — decoded template HTML from loadTemplate()
 * @returns {string} print-ready HTML shell (mustaches + image-slots still present)
 */
export function stripPreviewShell(templateHtml) {
  if (typeof templateHtml !== 'string' || templateHtml.length === 0) {
    throwRender(RENDER_ERROR.TEMPLATE_NOT_LOADED,
      'stripPreviewShell requires the decoded templateHtml from loadTemplate().');
  }

  const sectionCountBefore = (templateHtml.match(/<section class="page"/g) || []).length;
  let html = templateHtml;

  // (a) Remove Claude Design runtime <script src="<uuid>">
  html = html.replace(
    /<script\s+src="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"\s*>\s*<\/script>\s*/g,
    '');

  // (b) Remove any __bundler/* <script type="…"> blocks (already unpacked)
  html = html.replace(
    /<script[^>]*type="__bundler\/[^"]*"[^>]*>[\s\S]*?<\/script>\s*/g, '');

  // (c) Remove <x-dc> / </x-dc> tags — keep children
  html = html.replace(/<\/?x-dc(?:\s[^>]*)?>/g, '');

  // (d) Hoist <helmet>…</helmet> children into <head>
  const helmetMatch = /<helmet(?:\s[^>]*)?>([\s\S]*?)<\/helmet>/.exec(html);
  if (helmetMatch) {
    const helmetBody = helmetMatch[1];
    html = html.slice(0, helmetMatch.index) + html.slice(helmetMatch.index + helmetMatch[0].length);
    // Inject at end of <head>, before </head>
    if (html.includes('</head>')) {
      html = html.replace('</head>', helmetBody + '\n</head>');
    } else {
      // No </head> (unlikely) — prepend to body.
      html = html.replace(/<body(?:\s[^>]*)?>/, m => m + helmetBody);
    }
  }

  // (e) Remove <doc-page ...> and </doc-page> tags — keep children
  html = html.replace(/<doc-page\b[^>]*>/g, '');
  html = html.replace(/<\/doc-page>/g, '');

  // (f) Remove preview UI: __bundler_loading, __bundler_thumbnail, __bundler_err
  html = html.replace(/<div\s+id="__bundler_(?:loading|thumbnail|err|placeholder)"[\s\S]*?<\/div>\s*/g, '');
  // Any straggling loading-only <svg> block just above script — harmless if kept.

  // (g) Inject the A4 print CSS into <head>
  if (html.includes('</head>')) {
    html = html.replace('</head>', A4_PRINT_CSS + '\n</head>');
  }

  // Sanity: no scaffolding artifact left
  const artifacts = [];
  if (/<x-dc\b/.test(html))                                    artifacts.push('<x-dc>');
  if (/<helmet\b/.test(html))                                  artifacts.push('<helmet>');
  if (/<doc-page\b/.test(html))                                artifacts.push('<doc-page>');
  if (/<script[^>]*type="__bundler\//.test(html))              artifacts.push('<script type="__bundler/*">');
  if (/<div\s+id="__bundler_/.test(html))                      artifacts.push('__bundler_* UI');
  if (artifacts.length)
    throwRender(RENDER_ERROR.PREVIEW_SHELL_ARTIFACT_LEFTOVER,
      `Preview scaffolding survived stripping: ${artifacts.join(', ')}`);

  // Sanity: section count preserved
  const sectionCountAfter = (html.match(/<section class="page"/g) || []).length;
  if (sectionCountAfter !== sectionCountBefore)
    throwRender(RENDER_ERROR.PREVIEW_SHELL_ARTIFACT_LEFTOVER,
      `Section count changed during strip: before=${sectionCountBefore} after=${sectionCountAfter}`);

  return html;
}

/**
 * (2b) Inline every manifest asset reference in the stripped HTML.
 *
 * The approved template references JPEGs and fonts by manifest UUID
 * (e.g. `<img src="8d78e938-…">`, `url("b30f90ac-…")`). At runtime the Claude
 * Design bundle rewrites every UUID to a data: URI. We perform the same
 * substitution deterministically before printing.
 *
 * <image-slot src="uuid"> is left untouched here — it is a custom tag whose
 * expansion (with per-quotation override support) belongs to
 * expandImageSlots(). This function only rewrites plain UUID references.
 *
 * @param {string} html
 * @param {Record<string,string>} uriMap  — from loadTemplate().uriMap
 * @returns {string} html with every manifest UUID replaced by its data: URI
 */
function inlineManifestAssets(html, uriMap) {
  if (typeof html !== 'string') throwRender(RENDER_ERROR.TEMPLATE_NOT_LOADED, 'inlineManifestAssets: html required.');
  if (!uriMap || typeof uriMap !== 'object')
    throwRender(RENDER_ERROR.TEMPLATE_NOT_LOADED, 'inlineManifestAssets: uriMap required.');

  const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
  return html.replace(UUID_RE, (u) => uriMap[u] || u);
}

/**
 * (3) Expand every <image-slot id="…" src="uuid" …> tag into an <img> whose
 * src is the manifest data: URI (or the customer override, if present).
 *
 * @param {string} html
 * @param {object} uriMap  — from loadTemplate().uriMap
 * @param {object} payload — snapshot payload (for optional overrides)
 * @returns {{ html: string, expanded: Array<{id,page,src,overridden:boolean}> }}
 */
export function expandImageSlots(html, uriMap, payload) {
  if (typeof html !== 'string')  throwRender(RENDER_ERROR.TEMPLATE_NOT_LOADED, 'expandImageSlots: html required.');
  if (!uriMap || typeof uriMap !== 'object')
    throwRender(RENDER_ERROR.TEMPLATE_NOT_LOADED, 'expandImageSlots: uriMap required.');

  // Discover every <image-slot …> in the template.
  const slotTagRe = /<image-slot\b([^>]*?)\/?>/g;
  const registry  = new Map(IMAGE_SLOT_REGISTRY.map(s => [s.id, s]));
  const expanded  = [];

  const out = html.replace(slotTagRe, (fullTag, attrs) => {
    const id      = readAttr(attrs, 'id');
    const srcUuid = readAttr(attrs, 'src');
    const shape   = readAttr(attrs, 'shape') || 'rect';
    const radius  = readAttr(attrs, 'radius');
    const placeholder = readAttr(attrs, 'placeholder') || '';

    if (!id)      throwRender(RENDER_ERROR.IMAGE_SLOT_UNRESOLVED, `<image-slot> without id: ${fullTag}`);
    if (!srcUuid) throwRender(RENDER_ERROR.IMAGE_SLOT_UNRESOLVED, `<image-slot id="${id}"> without src: ${fullTag}`);

    const spec = registry.get(id);
    if (!spec) throwRender(RENDER_ERROR.IMAGE_SLOT_UNAUTHORIZED,
      `<image-slot id="${id}"> is not declared in IMAGE_SLOT_REGISTRY. Add it explicitly or remove it from template.`);
    if (spec.defaultUuid !== srcUuid) throwRender(RENDER_ERROR.IMAGE_SLOT_UNAUTHORIZED,
      `<image-slot id="${id}"> default UUID drifted from registry. registry=${spec.defaultUuid} template=${srcUuid}`);

    let src = null;
    let overridden = false;
    const override = payload ? path(payload, spec.overridePath.replace(/^payload\./, '')) : null;
    if (override && typeof override === 'string' && override.length > 0) {
      src = override;
      overridden = true;
    } else {
      src = uriMap[srcUuid];
      if (!src) throwRender(RENDER_ERROR.IMAGE_SLOT_UNRESOLVED,
        `<image-slot id="${id}"> default UUID ${srcUuid} not present in manifest.`);
    }

    expanded.push({ id, page: spec.page, src: src.startsWith('data:') ? '[data-uri]' : src, overridden });

    // Rebuild the <img> — the approved .pg class is defined in template CSS
    // and gives object-fit:cover + full-cover sizing. Keep the shape/radius/
    // placeholder attributes as data-* for parity with the runtime component.
    const styleBits = [];
    if (shape === 'rounded' && radius) styleBits.push(`border-radius:${radius}px`);
    styleBits.push('display:block', 'width:100%', 'height:100%', 'object-fit:cover');

    return `<img data-image-slot="${escapeAttr(id)}" data-approved-uuid="${srcUuid}"` +
      ` data-shape="${escapeAttr(shape)}" alt="${escapeAttr(placeholder)}"` +
      ` src="${src}" style="${styleBits.join(';')}">`;
  });

  return { html: out, expanded };
}

/**
 * (4) Substitute every registered {{ token }} in the stripped template.
 * Missing snapshot values are collected; nothing is silently filled.
 *
 * @param {string} html
 * @param {object} payload
 * @returns {{ html: string, substituted: Array, unresolved: Array }}
 */
export function substituteMustaches(html, payload) {
  if (typeof html !== 'string') throwRender(RENDER_ERROR.TEMPLATE_NOT_LOADED, 'substituteMustaches: html required.');

  const registry = new Map(TOKEN_REGISTRY.map(t => [t.token, t]));

  // Discover every {{ token }} in the template FIRST — reject unknowns before
  // any substitution, so a template revision that introduces a new token fails
  // loudly instead of leaving the raw {{token}} in the customer PDF.
  const foundRe = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
  const found   = new Set();
  {
    let m; while ((m = foundRe.exec(html)) !== null) found.add(m[1]);
  }
  const unknownTokens = [...found].filter(t => !registry.has(t));
  if (unknownTokens.length) throwRender(RENDER_ERROR.MUSTACHE_UNKNOWN,
    `Approved template introduced unregistered tokens: ${unknownTokens.map(t => '{{' + t + '}}').join(', ')}. ` +
    `Every token must be declared in TOKEN_REGISTRY with source + formatter before it can be substituted.`);

  const substituted = [];
  const unresolved  = [];

  const out = html.replace(foundRe, (_fullMatch, tokenName) => {
    const spec = registry.get(tokenName);

    // Guard: registry entry's declared source must be authoritative.
    if (!AUTHORITATIVE_SOURCES.has(spec.source)) {
      throwRender(RENDER_ERROR.MUSTACHE_MAPPED_TO_NON_AUTHORITATIVE,
        `Token {{${tokenName}}} declares source="${spec.source}" which is not in AUTHORITATIVE_SOURCES.`);
    }

    let raw;
    try {
      raw = spec.resolve ? spec.resolve(payload) : null;
    } catch (e) {
      throwRender(RENDER_ERROR.FORMATTER_FAILED,
        `Token {{${tokenName}}} resolver threw: ${e.message}`);
    }

    if (raw == null) {
      unresolved.push({
        token: tokenName, source: spec.source, pages: spec.pages,
        blocker: spec.blocker ?? null,
      });
      // Do NOT substitute. Leave the raw {{token}} in place so
      // validateUnresolvedTokens() can decide whether to fail hard or emit
      // an audit report. Never inject a placeholder or default.
      return _fullMatch;
    }

    let out;
    try {
      const fmt = typeof spec.format === 'function' ? spec.format : FORMATTERS[spec.format];
      if (typeof fmt !== 'function')
        throwRender(RENDER_ERROR.FORMATTER_FAILED,
          `Token {{${tokenName}}} has no valid formatter (${spec.format}).`);
      out = fmt(raw);
    } catch (e) {
      throwRender(RENDER_ERROR.FORMATTER_FAILED,
        `Token {{${tokenName}}} formatter failed on raw value ${JSON.stringify(raw)}: ${e.message}`);
    }
    substituted.push({ token: tokenName, source: spec.source, out });
    return out;
  });

  return { html: out, substituted, unresolved };
}

/**
 * (5) Assert nothing is unresolved. Called by renderQuotationHtml with
 * strict=true; can be called separately with strict=false to obtain an audit
 * report the caller decides what to do with.
 *
 * @param {string} html — post-substituteMustaches HTML
 * @param {Array}  unresolved — from substituteMustaches
 * @param {object} [opts]
 * @param {boolean} [opts.strict=true] — throw on any unresolved
 * @returns {{ status: 'READY'|'BLOCKED', blockers: Array, unresolved: Array }}
 */
export function validateUnresolvedTokens(html, unresolved, { strict = true } = {}) {
  const raw = html.match(/\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/g) || [];
  const combined = new Set(raw.map(s => s.replace(/[{}\s]/g, '')));
  for (const u of unresolved || []) combined.add(u.token);

  if (combined.size === 0) {
    return { status: RENDER_STATUS.READY, blockers: [], unresolved: [] };
  }

  const blockerCodes = new Set();
  const enriched = [...combined].map(tokenName => {
    const spec = TOKEN_REGISTRY.find(t => t.token === tokenName) || null;
    if (spec && spec.blocker) blockerCodes.add(spec.blocker);
    return { token: tokenName, source: spec?.source ?? null, pages: spec?.pages ?? [], blocker: spec?.blocker ?? null };
  });

  const blockers = [...blockerCodes].map(code => ({ code, source: 'MUSTACHE_REGISTRY' }));

  if (strict) {
    throwRender(RENDER_ERROR.MUSTACHE_UNRESOLVED,
      `Unresolved approved mustaches: ${enriched.map(e => '{{' + e.token + '}}').join(', ')}. ` +
      `Blockers: ${[...blockerCodes].join(', ') || '(none)'}`);
  }
  return { status: RENDER_STATUS.BLOCKED, blockers, unresolved: enriched };
}

/**
 * (6) End-to-end: load → strip → expand slots → substitute mustaches →
 * validate. Returns the print-ready HTML plus a status object. If strict
 * (default true) and any unresolved token or blocker remains, THROWS instead
 * of returning a broken document.
 *
 * @param {object} payload — snapshot payload (frozen document.payload for
 *                            ISSUED quotations; live buildPayload() for DRAFT)
 * @param {object} [opts]
 * @param {boolean} [opts.strict=true]
 * @param {boolean} [opts.includePage3Blocker=true] — emit the Page 3 blocker
 *                    even if all mustaches resolved (documents architectural gap)
 * @returns {{ html: string, status: object, meta: object }}
 */
export function renderQuotationHtml(payload, { strict = true, includePage3Blocker = true, templatePaths = null } = {}) {
  // Phase H H4 (2026-09-05) — pin-path routing.
  // When `templatePaths` is supplied ({ bundlePath, metaPath } from
  // resolveApprovedTemplatePaths({name, version})), the renderer reads THAT
  // bundle regardless of the loader's current default. This closes the
  // Rev-2-becomes-default risk: a v1-pinned document rendered while Rev 2 is
  // the default still reads the v1 bundle from disk. When omitted the
  // renderer keeps its prior behavior (loader default).
  const loaded  = templatePaths ? loadTemplate(templatePaths) : loadTemplate();
  const shell   = stripPreviewShell(loaded.templateHtml);
  // Order matters: expand <image-slot> tags first so their UUID srcs are
  // resolved with per-quotation override support; only then inline plain
  // <img src="uuid"> / url("uuid") references from the manifest.
  const slots   = expandImageSlots(shell, loaded.uriMap, payload);
  const inlined = inlineManifestAssets(slots.html, loaded.uriMap);
  const subs    = substituteMustaches(inlined, payload);
  const val    = validateUnresolvedTokens(subs.html, subs.unresolved, { strict: false });

  const blockers = [...val.blockers];
  if (includePage3Blocker) {
    blockers.push({ code: PAGE_3_STATUS.code, source: 'PAGE_3_STATUS',
      page: PAGE_3_STATUS.page, message: PAGE_3_STATUS.message,
      affectedFields: PAGE_3_STATUS.affectedFields });
  }

  const status = {
    status: (val.status === RENDER_STATUS.READY && !includePage3Blocker) ? RENDER_STATUS.READY : RENDER_STATUS.BLOCKED,
    blockers,
    unresolved: val.unresolved,
    substituted: subs.substituted.length,
    imageSlotsExpanded: slots.expanded.length,
  };

  if (strict && status.status !== RENDER_STATUS.READY) {
    const codes = blockers.map(b => b.code).join(', ');
    throwRender(RENDER_ERROR.MUSTACHE_UNRESOLVED,
      `Quotation HTML BLOCKED. Blockers: ${codes}. ` +
      `${status.unresolved.length} unresolved tokens.`);
  }

  return {
    html: subs.html,
    status,
    meta: {
      rendererVersion: APPROVED_TEMPLATE_VERSION,
      templateName:    loaded.meta.name,
      templateVersion: loaded.meta.version,
      bundleSha256:    loaded.meta.bundleSha256,
      manifestSha256:  loaded.meta.manifestSha256,
      templateSha256:  loaded.meta.templateSha256,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// internal helpers  (private — no export)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Read a value from an object by dot path, returning null if any hop is
 * undefined. Never invents.
 */
function path(root, dot) {
  if (root == null) return null;
  const parts = dot.split('.');
  let cur = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[p];
  }
  return cur == null ? null : cur;
}

/**
 * Read a per-tier value from the ONE-quotation snapshot that carries three
 * package snapshots (base / value / premium).
 *
 * The primary top-level payload is always the RECOMMENDED tier (value / Smart
 * per data/tier-display-names.json → recommendedTier). The other two tiers
 * are exposed via `payload.alternatives[]`, one entry per non-primary tier,
 * each carrying its own full sub-payload with the same section shape as the
 * top level.
 *
 * Customer-facing tier keys are 'elite' / 'smart' / 'essential' (approved
 * template mustaches use these names). Internal keys are 'premium' / 'value'
 * / 'base'. This function bridges the two, then delegates to a pure `path()`
 * read on the tier's sub-payload — no arithmetic, no invention.
 *
 * Returns null when the requested tier's snapshot is not present or the
 * requested field is missing. Never invents a value.
 */
function tryTier(payload, customerTier, field, section = 'pricing') {
  const internalTier = INTERNAL_TIER_KEY[customerTier];
  if (!internalTier) return null;

  const sub = subPayloadForTier(payload, internalTier);
  if (!sub) return null;

  // Every section on the sub-payload has the shape { available, value, ... }.
  const v = path(sub, `${section}.value.${field}`);
  return v == null ? null : v;
}

/** Customer-facing tier → internal key (matches data/tier-display-names.json). */
const INTERNAL_TIER_KEY = Object.freeze({
  essential: 'base',
  smart:     'value',
  elite:     'premium',
});

/**
 * Return the sub-payload for `internalTier`. The primary top-level payload
 * IS the sub-payload for the recommended tier; the other tiers come from
 * `payload.alternatives[]` (built by quotationWorkspace.buildAlternativePayloads).
 */
function subPayloadForTier(payload, internalTier) {
  if (!payload) return null;
  const primaryTier = path(payload, 'system.value.packageTier');
  if (primaryTier === internalTier) return payload;

  const alts = payload.alternatives;
  if (!Array.isArray(alts)) return null;
  const found = alts.find(a => (a?.tier ?? null) === internalTier);
  return found && found.payload ? found.payload : null;
}

function assertFiniteNumber(v) {
  if (typeof v !== 'number' || !Number.isFinite(v))
    throw new Error(`expected finite number, got ${typeof v} ${JSON.stringify(v)}`);
}

function indianDigitGroup(n) {
  const s = String(Math.abs(Math.round(n)));
  if (s.length <= 3) return (n < 0 ? '-' : '') + s;
  const last3 = s.slice(-3);
  const rest  = s.slice(0, -3);
  const withCommas = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (n < 0 ? '-' : '') + withCommas + ',' + last3;
}

function readAttr(attrs, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`);
  const m  = re.exec(attrs);
  return m ? m[1] : null;
}

function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function throwRender(code, message) {
  const e = new Error(`[approvedTemplate] ${code}: ${message}`);
  e.code = code;
  throw e;
}

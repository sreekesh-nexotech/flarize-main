/**
 * QUOTATION PAYLOAD ASSEMBLER.  (Phase 3 — PART H, Step 1)
 *
 * Implements `QUOTATION_BOM_DATA_CONTRACT.md` §2–§34.
 *
 * This module is a PURE FUNCTION of its inputs. It has no store, no I/O, no
 * clock, no randomness, no RBAC lookup and no catalog access. Its entire import
 * list is ['./bomRoles.js'] — asserted by test.
 *
 * What it does: copies engineering identity and quantity out of the LOCKED BOM
 * snapshot, copies every commercial figure out of the ISSUED commercial
 * snapshot, and arranges them into the contract payload.
 *
 * What it must never do (contract §1, §29, §34):
 *   - resolve a component            (it never sees a catalog)
 *   - recalculate a number           (there is no money arithmetic in this file)
 *   - invent a missing value         (a missing source becomes a named blocker)
 *   - substitute one source for another
 *
 * BOUNDARY: assembly and presentation shaping. It decides nothing.
 */

import { ROLES, roleForLine } from './bomRoles.js';

export const QUOTATION_PAYLOAD_VERSION = 'quotationPayload.1';

/** Where a section's data came from. Every emitted section names one. */
export const SOURCE = {
  LOCKED_BOM_SNAPSHOT: 'LOCKED_BOM_SNAPSHOT',
  COMMERCIAL_SNAPSHOT: 'COMMERCIAL_SNAPSHOT',
  ENGINEERING_CHECKER: 'ENGINEERING_CHECKER',
  PROJECT_CONFIGURATION: 'PROJECT_CONFIGURATION',
  QUOTATION_RECORD: 'QUOTATION_RECORD',
  CUSTOMER_RECORD: 'CUSTOMER_RECORD',
  COMPONENT_DISPLAY_ATTRIBUTES: 'COMPONENT_DISPLAY_ATTRIBUTES',
  UPGRADE_MODEL: 'UPGRADE_MODEL',
};

/**
 * Named dependencies for sections the contract defines but this build has no
 * authoritative source for. These are emitted as blockers, never as zero,
 * never as an empty success and never as an invented default.
 */
export const DEPENDENCY = {
  SUBSIDY_ENGINE: 'SUBSIDY_ENGINE',
  SAVINGS_ENGINE: 'SAVINGS_ENGINE',
  FINANCE_ENGINE: 'FINANCE_ENGINE',
  ENERGY_LOAD_CALCULATION_ENGINE: 'ENERGY_LOAD_CALCULATION_ENGINE',
  CMS: 'CMS',
  COMPANY_MASTER: 'COMPANY_MASTER',
  DECISION_C6_TIER_DISPLAY_NAMES: 'DECISION_C6_TIER_DISPLAY_NAMES',
  DECISION_C7_COMPANY_IDENTITY: 'DECISION_C7_COMPANY_IDENTITY',
  COMMERCIAL_SNAPSHOT: 'COMMERCIAL_SNAPSHOT',
  LOCKED_BOM_SNAPSHOT: 'LOCKED_BOM_SNAPSHOT',
  COMPONENT_DISPLAY_ATTRIBUTES: 'COMPONENT_DISPLAY_ATTRIBUTES',
};

/** Contract §19 — every line carries an explicit treatment. */
export const TREATMENT = {
  INCLUDED: 'INCLUDED',
  EXTRA: 'EXTRA',
  OPTIONAL: 'OPTIONAL',
  EXCLUDED: 'EXCLUDED',
};

/** Contract §26 / §4 — document lifecycle states carried, not decided here. */
export const QUOTATION_STATUS = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  SUPERSEDED: 'SUPERSEDED',
};

/** Snapshot states this assembler recognises. String literals — no engine import. */
const BOM_SNAPSHOT_LOCKED = 'LOCKED';
const COMMERCIAL_SNAPSHOT_ISSUED = 'ISSUED';

/**
 * The thirteen versions a commercial snapshot pins (C69 / C93). Listed here as
 * constants so the payload can be checked for completeness without importing
 * `commercialSnapshot.js`. A test asserts this list equals that module's
 * VERSION_KEYS exactly.
 */
export const REQUIRED_VERSION_KEYS = Object.freeze([
  'bomSnapshotId', 'catalogVersion', 'procurementPriceVersion', 'landedCostVersion',
  'projectRateCardVersion', 'costConfigVersion', 'marginVersion', 'gstVersion',
  'costEngineVersion', 'pricingEngineVersion', 'moneyRuleVersion',
  'offerVersion', 'marketRateVersion',
]);

/**
 * Contract §6 / §16 — which BOM roles reach the customer document.
 * Everything else is internal plant-construction detail and stays out of the
 * customer payload entirely (it is not hidden behind a role check; it is simply
 * not customer-facing data).
 */
export const CUSTOMER_FACING_ROLES = Object.freeze([
  ROLES.PANEL, ROLES.INVERTER, ROLES.MICRO_INVERTER, ROLES.BATTERY,
  ROLES.BATTERY_PROTECTION, ROLES.STRUCTURE, ROLES.DCDB, ROLES.ACDB,
  ROLES.DC_CABLE, ROLES.AC_CABLE, ROLES.EARTHING, ROLES.PROTECTION,
  ROLES.MONITORING, ROLES.METER, ROLES.AC_ISOLATOR, ROLES.CHANGEOVER,
  ROLES.ENERGY_SYSTEM_CONTROLLER,
]);

export const INTERNAL_ONLY_ROLES = Object.freeze([
  ROLES.BATTERY_CABLE, ROLES.ENPHASE_COMMUNICATION, ROLES.OTHER,
]);

/** Contract §6 display categories. Labels for grouping only — no logic. */
export const DISPLAY_CATEGORY = Object.freeze({
  [ROLES.PANEL]: 'Solar Module',
  [ROLES.INVERTER]: 'Inverter',
  [ROLES.MICRO_INVERTER]: 'Micro Inverter',
  [ROLES.BATTERY]: 'Battery',
  [ROLES.BATTERY_PROTECTION]: 'Battery Protection',
  [ROLES.STRUCTURE]: 'Mounting Structure',
  [ROLES.DCDB]: 'DCDB',
  [ROLES.ACDB]: 'ACDB',
  [ROLES.DC_CABLE]: 'DC Cable',
  [ROLES.AC_CABLE]: 'AC Cable',
  [ROLES.EARTHING]: 'Earthing',
  [ROLES.PROTECTION]: 'Lightning Protection',
  [ROLES.MONITORING]: 'Monitoring',
  [ROLES.METER]: 'Meter',
  [ROLES.AC_ISOLATOR]: 'AC Isolator',
  [ROLES.CHANGEOVER]: 'Change Over',
  [ROLES.ENERGY_SYSTEM_CONTROLLER]: 'Energy System Controller',
});

/**
 * Display attributes this assembler is willing to copy. Anything commercial is
 * refused by construction — the customer document never carries a purchase
 * price, a landed cost, a rate or a margin from component data (§17, §30, C3).
 */
export const ALLOWED_ATTRIBUTE_KEYS = Object.freeze([
  'brand', 'model', 'technology', 'specification', 'capacity', 'moduleWatt',
  'phase', 'crossSection', 'unit', 'dcr', 'warranty',
]);

const FORBIDDEN_ATTRIBUTE_PATTERN = /price|cost|rate|margin|discount|supplier|purchase/i;

/** Contract §28 — the eight generation-gate checks. */
export const GATE_CHECK = Object.freeze({
  CUSTOMER_DATA: 'CUSTOMER_DATA',
  SYSTEM_CONFIGURATION: 'SYSTEM_CONFIGURATION',
  BOM_EXISTS: 'BOM_EXISTS',
  BOM_LOCKED: 'BOM_LOCKED',
  ENGINEERING_VALIDATION: 'ENGINEERING_VALIDATION',
  COMMERCIAL_SNAPSHOT: 'COMMERCIAL_SNAPSHOT',
  SUBSIDY_RESOLVED: 'SUBSIDY_RESOLVED',
  QUOTATION_METADATA: 'QUOTATION_METADATA',
});

export const GATE_STATUS = { PASS: 'PASS', BLOCKED: 'BLOCKED' };

/**
 * Because no Subsidy Engine exists, subsidy is never silently omitted and never
 * assumed to be zero. The operator must state the treatment explicitly.
 */
export const SUBSIDY_TREATMENT = {
  NOT_QUOTED: 'NOT_QUOTED',
  ENGINE_RESULT: 'ENGINE_RESULT',
};

export const CAPABILITY_COST_VIEW = 'COST_VIEW';

// ---------------------------------------------------------------------------
// blocked-section helper
// ---------------------------------------------------------------------------

/**
 * The single shape every unavailable section takes. `value` is always null —
 * there is no version of this function that produces a number.
 */
export function blockedSection({ dependency, reference, reason }) {
  return {
    available: false,
    value: null,
    dependency,
    reference: reference ?? null,
    reason,
  };
}

function carriedSection({ source, reference, value }) {
  return { available: true, value, source, reference: reference ?? null, dependency: null, reason: null };
}

// ---------------------------------------------------------------------------
// generation gate (contract §28)
// ---------------------------------------------------------------------------

/**
 * Pure evaluation of the eight gate checks. Reports each individually with its
 * blocking reason; it throws nothing and it enforces nothing. Enforcement (an
 * issue operation refusing to run) belongs to the service layer.
 */
export function evaluateGenerationGate({
  customer = null, system = null, bomSnapshot = null, engineering = null,
  commercialSnapshot = null, subsidyTreatment = null, quotation = null,
} = {}) {
  const checks = [];
  const add = (id, ok, reason) => checks.push({ check: id, status: ok ? GATE_STATUS.PASS : GATE_STATUS.BLOCKED, reason: ok ? null : reason });

  add(GATE_CHECK.CUSTOMER_DATA,
    !!(customer && customer.customerId && customer.customerName),
    'Customer record incomplete — customerId and customerName are required.');

  add(GATE_CHECK.SYSTEM_CONFIGURATION,
    !!(system && system.systemType && system.systemSizeKw != null && system.phase),
    'System configuration incomplete — systemType, systemSizeKw and phase are required.');

  const hasLines = !!(bomSnapshot && Array.isArray(bomSnapshot.lines) && bomSnapshot.lines.length > 0);
  add(GATE_CHECK.BOM_EXISTS, hasLines, 'No BOM lines on the supplied snapshot.');

  add(GATE_CHECK.BOM_LOCKED,
    !!(bomSnapshot && bomSnapshot.status === BOM_SNAPSHOT_LOCKED),
    'BOM is not LOCKED. A quotation may only be built from a locked engineering configuration.');

  add(GATE_CHECK.ENGINEERING_VALIDATION,
    !!(engineering && engineering.status && engineering.status !== 'BLOCKED'),
    engineering && engineering.status === 'BLOCKED'
      ? 'Engineering validation is BLOCKED. Quotation generation disabled.'
      : 'No engineering validation verdict supplied.');

  add(GATE_CHECK.COMMERCIAL_SNAPSHOT,
    !!(commercialSnapshot && commercialSnapshot.status === COMMERCIAL_SNAPSHOT_ISSUED),
    'No ISSUED commercial snapshot. Required commercial values do not exist.');

  add(GATE_CHECK.SUBSIDY_RESOLVED,
    subsidyTreatment === SUBSIDY_TREATMENT.NOT_QUOTED || subsidyTreatment === SUBSIDY_TREATMENT.ENGINE_RESULT,
    'Subsidy treatment unresolved. No Subsidy Engine exists, so the operator must record ' +
    'subsidyTreatment = NOT_QUOTED to state explicitly that this quotation carries no subsidy.');

  add(GATE_CHECK.QUOTATION_METADATA,
    !!(quotation && quotation.quotationNumber && quotation.quotationVersion != null && quotation.quotationDate),
    'Quotation metadata incomplete — quotationNumber, quotationVersion and quotationDate are required.');

  const blocked = checks.filter(c => c.status === GATE_STATUS.BLOCKED);
  return Object.freeze({
    status: blocked.length ? GATE_STATUS.BLOCKED : GATE_STATUS.PASS,
    checks: Object.freeze(checks.map(Object.freeze)),
    blockedChecks: Object.freeze(blocked.map(c => c.check)),
    reasons: Object.freeze(blocked.map(c => `${c.check}: ${c.reason}`)),
  });
}

// ---------------------------------------------------------------------------
// BOM rows
// ---------------------------------------------------------------------------

function safeAttributes(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return { attributes: out, found: false, refused: [] };
  const refused = [];
  for (const [k, v] of Object.entries(raw)) {
    if (FORBIDDEN_ATTRIBUTE_PATTERN.test(k) && k !== 'crossSection') { refused.push(k); continue; }
    if (!ALLOWED_ATTRIBUTE_KEYS.includes(k)) continue;
    out[k] = v;
  }
  return { attributes: out, found: Object.keys(out).length > 0, refused };
}

/**
 * One row per LOCKED BOM line. Identity and quantity are copied, never derived.
 * The role comes from the line's own componentId/category via the frozen role
 * taxonomy — never from a display name.
 */
function buildRows(bomSnapshot, componentAttributes) {
  return (bomSnapshot.lines || []).map(line => {
    const role = line.role || roleForLine(line);
    const componentId = line.componentId ?? line.itemId ?? line.catalogItemId ?? null;
    const attrs = safeAttributes(componentAttributes[componentId]);
    const customerFacing = CUSTOMER_FACING_ROLES.includes(role);
    return Object.freeze({
      componentId,
      componentDataVersion: line.componentDataVersion ?? null,
      role,
      displayCategory: DISPLAY_CATEGORY[role] ?? null,
      quantity: line.quantity ?? null,
      treatment: TREATMENT.INCLUDED,
      customerFacing,
      identitySource: SOURCE.LOCKED_BOM_SNAPSHOT,
      quantitySource: SOURCE.LOCKED_BOM_SNAPSHOT,
      engineeringApprovalState: line.engineeringApprovalState ?? null,
      attributesFound: attrs.found,
      attributesSource: attrs.found ? SOURCE.COMPONENT_DISPLAY_ATTRIBUTES : null,
      attributesRefused: Object.freeze(attrs.refused),
      attributes: Object.freeze(attrs.attributes),
      warranty: attrs.attributes.warranty != null
        ? carriedSection({ source: SOURCE.COMPONENT_DISPLAY_ATTRIBUTES, reference: '§15', value: attrs.attributes.warranty })
        : blockedSection({
          dependency: DEPENDENCY.COMPONENT_DISPLAY_ATTRIBUTES, reference: '§15',
          reason: 'No component warranty data supplied. §15 forbids a generic warranty statement, so none is emitted.',
        }),
    });
  });
}

// ---------------------------------------------------------------------------
// pricing (contract §17, §18, §20)
// ---------------------------------------------------------------------------

function buildPricing(commercialSnapshot, includeInternal) {
  if (!commercialSnapshot || commercialSnapshot.status !== COMMERCIAL_SNAPSHOT_ISSUED) {
    return Object.freeze({
      available: false,
      source: null,
      customer: null,
      internal: null,
      blocked: blockedSection({
        dependency: DEPENDENCY.COMMERCIAL_SNAPSHOT, reference: '§17',
        reason: 'No ISSUED commercial snapshot supplied. No price exists; none is invented and none is zeroed.',
      }),
    });
  }

  const p = commercialSnapshot.pricing;

  // Every figure below is a copy. There is no arithmetic in this function.
  const customer = Object.freeze({
    sellingPriceBeforeGST: p.sellingPriceBeforeGST,
    gstRatePct: p.gstRatePct,
    gstAmount: p.gstAmount,
    sellingPriceIncludingGST: p.sellingPriceIncludingGST,
    extrasIncludingGST: p.extrasIncludingGST,
    customerTotalIncludingGST: p.customerTotalIncludingGST,
    gstAppliedOnce: true,
    gstReference: 'C67 / C73 — SOLAR_70_30_COMPOSITE, applied once on the pre-GST selling price.',
    discount: p.discount != null
      ? carriedSection({ source: SOURCE.COMMERCIAL_SNAPSHOT, reference: '§17', value: p.discount })
      : blockedSection({
        dependency: DEPENDENCY.COMMERCIAL_SNAPSHOT, reference: '§17',
        reason: 'The commercial snapshot pins no discount field. The discount is not re-derived here.',
      }),
  });

  const internal = includeInternal
    ? Object.freeze({
      marginType: p.marginType,
      targetGrossMargin: p.targetGrossMargin,
      grossProfit: p.grossProfit,
      cost: commercialSnapshot.cost,
      capabilityRequired: CAPABILITY_COST_VIEW,
    })
    : null;

  return Object.freeze({
    available: true,
    source: SOURCE.COMMERCIAL_SNAPSHOT,
    snapshotId: commercialSnapshot.snapshotId,
    customer,
    internal,
    internalWithheld: !includeInternal,
    internalWithheldReason: includeInternal ? null
      : 'Internal cost and margin require COST_VIEW (§17, §30). They are absent from this payload, not masked.',
  });
}

function buildExtras(commercialSnapshot) {
  if (!commercialSnapshot || commercialSnapshot.status !== COMMERCIAL_SNAPSHOT_ISSUED) {
    return Object.freeze({
      available: false,
      items: Object.freeze([]),
      blocked: blockedSection({
        dependency: DEPENDENCY.COMMERCIAL_SNAPSHOT, reference: '§18',
        reason: 'Extras are priced by the Pricing Engine and pinned on the commercial snapshot. None supplied.',
      }),
    });
  }
  const items = (commercialSnapshot.pricing.extras || []).map(e => Object.freeze({
    extraId: e.extraId ?? null,
    description: e.description ?? null,
    treatment: TREATMENT.EXTRA,
    includedInBase: false,
    customerPriceExcludingGST: e.customerPriceExcludingGST ?? null,
    gstRatePct: e.gstRatePct ?? null,
    customerPriceIncludingGST: e.customerPriceIncludingGST ?? null,
    source: SOURCE.COMMERCIAL_SNAPSHOT,
  }));

  // C68 / C90 — customer-side expenses are displayed, never added into a
  // Flarize total and never marked up. Net metering lives here, not in the BOM.
  const customerSide = (commercialSnapshot.pricing.customerSideExpenses || []).map(x => Object.freeze({
    ...x,
    treatment: TREATMENT.EXCLUDED,
    reference: 'C68 / C90',
    note: 'Customer-procured. Excluded from the BOM, cost, margin and selling price.',
    source: SOURCE.COMMERCIAL_SNAPSHOT,
  }));

  return Object.freeze({
    available: true,
    source: SOURCE.COMMERCIAL_SNAPSHOT,
    items: Object.freeze(items),
    customerSideExpenses: Object.freeze(customerSide),
  });
}

// ---------------------------------------------------------------------------
// subsidy section builder
// ---------------------------------------------------------------------------

function buildSubsidySection(subsidyTreatment, subsidyResult) {
  // 1. NOT_QUOTED: operator explicitly says no subsidy
  if (subsidyTreatment === SUBSIDY_TREATMENT.NOT_QUOTED) {
    return Object.freeze({
      available: false, value: null, treatment: SUBSIDY_TREATMENT.NOT_QUOTED,
      dependency: DEPENDENCY.SUBSIDY_ENGINE, reference: '§20',
      reason: 'No Subsidy Engine exists. The operator has recorded NOT_QUOTED: this quotation carries no subsidy. It is not assumed to be zero.',
    });
  }

  // 2. Provider result supplied (mock or real)
  if (subsidyResult && subsidyResult.available) {
    return Object.freeze({
      available: true,
      treatment: subsidyResult.treatment ?? SUBSIDY_TREATMENT.ENGINE_RESULT,
      source: subsidyResult.source ?? null,
      status: subsidyResult.status ?? null,
      value: Object.freeze({ ...subsidyResult }),
      dependency: null,
      reference: '§20',
      reason: null,
    });
  }

  // 2b. Provider ran and states NO subsidy (ineligible connection/capacity,
  //     non-DCR "Give It Up", unresolved input). The engine's own status and
  //     reason are carried — the customer document says WHY, and never
  //     assumes zero. (2026-09-07 conformance §17.)
  if (subsidyResult && typeof subsidyResult === 'object') {
    return Object.freeze({
      available: false,
      treatment: subsidyResult.treatment ?? SUBSIDY_TREATMENT.ENGINE_RESULT,
      source: subsidyResult.source ?? null,
      status: subsidyResult.status ?? null,
      eligibilityStatus: subsidyResult.eligibilityStatus ?? null,
      subsidyType: subsidyResult.subsidyType ?? null,
      value: null,
      dependency: null,
      reference: '§20',
      reason: subsidyResult.reason ?? 'Subsidy engine returned no subsidy for this configuration.',
    });
  }

  // 3. No provider, no treatment → blocked
  return blockedSection({
    dependency: DEPENDENCY.SUBSIDY_ENGINE, reference: '§20',
    reason: 'No Subsidy Engine and no recorded subsidy treatment. No eligibility, amount or post-subsidy figure exists.',
  });
}

// ---------------------------------------------------------------------------
// the assembler
// ---------------------------------------------------------------------------

/**
 * Build the quotation data-contract payload.
 *
 * Every argument is data the caller has already obtained from an authoritative
 * source. This function fetches nothing.
 *
 * @param bomSnapshot        LOCKED project BOM snapshot — engineering authority
 * @param commercialSnapshot ISSUED commercial snapshot — commercial authority
 * @param componentAttributes map componentId -> display attributes, built by the
 *                            caller from ids the locked BOM already chose
 * @param capabilities        acting actor's capability strings; COST_VIEW admits
 *                            internal cost and margin
 * @param variant             carried for the renderer (C14). The payload is
 *                            built once and completely; it is never trimmed.
 * @param tierDisplayNames    C6 map: { base: "Base", value: "Value", premium: "Premium" }
 * @param inclusionMatrix     Commercial inclusion config: { Base: { ... }, Value: { ... }, Premium: { ... } }
 */

/**
 * Resolve the customer-facing tier display name from the C6 business decision.
 * Returns an { available, value, source } section or a blocked section.
 * Never derives from tier codes — the names must come from authoritative config.
 */
function resolveTierDisplayName(packageTier, tierDisplayNames) {
  if (!tierDisplayNames || typeof tierDisplayNames !== 'object') {
    return blockedSection({
      dependency: DEPENDENCY.DECISION_C6_TIER_DISPLAY_NAMES, reference: '§5',
      reason: 'No tier display name configuration supplied.',
    });
  }
  const tier = String(packageTier || '').toLowerCase();
  const name = tierDisplayNames[tier];
  if (name && typeof name === 'string') {
    return Object.freeze({ available: true, value: name, source: 'BUSINESS_DECISION_C6' });
  }
  return blockedSection({
    dependency: DEPENDENCY.DECISION_C6_TIER_DISPLAY_NAMES, reference: '§5',
    reason: `No display name configured for tier "${tier}".`,
  });
}

/**
 * R3 — Resolve the "recommended" badge string for the given tier from the
 * authoritative tier-display-names config. Pins the badge at issue so post-
 * issue mutation of `data/tier-display-names.json` cannot silently change
 * the badge on a historical ISSUED quotation.
 *
 * Returns `null` when the given tier is NOT the recommended one (renderer
 * omits the badge). Returns the badge string when it IS. Returns `null`
 * when the config is malformed — never invents a badge.
 */
function resolveRecommendedBadge(packageTier, tierDisplayNames) {
  if (!tierDisplayNames || typeof tierDisplayNames !== 'object') return null;
  const recommendedTier = String(tierDisplayNames.recommendedTier || '').toLowerCase();
  const currentTier = String(packageTier || '').toLowerCase();
  if (!recommendedTier || recommendedTier !== currentTier) return null;
  const badge = tierDisplayNames.recommendedBadge;
  return (badge && typeof badge === 'string') ? badge : null;
}

/**
 * Resolve the commercial inclusion matrix for the given tier.
 * Returns { available, tier, items, source } or a blocked section.
 * Never invents inclusion values — every item must come from authoritative config.
 */
function resolveInclusionMatrix(packageTier, inclusionMatrix) {
  if (!inclusionMatrix || typeof inclusionMatrix !== 'object') {
    return blockedSection({
      dependency: 'INCLUSION_MATRIX', reference: '§INCLUSION',
      reason: 'No inclusion matrix configuration supplied.',
    });
  }
  const tier = String(packageTier || '').toLowerCase();
  // Find the tier entry by case-insensitive match against config keys
  const configKey = Object.keys(inclusionMatrix).find(k =>
    !k.startsWith('_') && (k.toLowerCase() === tier || (inclusionMatrix[k]?._tierCode || '').toLowerCase() === tier)
  );
  const tierConfig = configKey ? inclusionMatrix[configKey] : null;
  if (!tierConfig || typeof tierConfig !== 'object') {
    return blockedSection({
      dependency: 'INCLUSION_MATRIX', reference: '§INCLUSION',
      reason: `No inclusion configuration for tier "${tier}".`,
    });
  }
  // Copy inclusion items — only boolean values, no prices, no costs
  const items = {};
  for (const [key, val] of Object.entries(tierConfig)) {
    if (key.startsWith('_')) continue; // skip metadata keys
    items[key] = val === true || val === false ? val : null;
  }
  // 2026-09-09 — customer-facing "What's Included" service table (approved
  // template v1, page 5). Ordered rows copied for THIS tier only: boolean
  // (✓ / –) or a verbatim string. Missing config → no serviceMatrix key; the
  // renderer then omits the table instead of inventing rows.
  const rawMatrix = Array.isArray(inclusionMatrix._serviceMatrix) ? inclusionMatrix._serviceMatrix : null;
  const serviceMatrix = rawMatrix
    ? Object.freeze(rawMatrix
      .filter(r => r && typeof r === 'object' && typeof r.label === 'string' && r.label.trim())
      .map(r => {
        const v = r[tier];
        return Object.freeze({ label: r.label, value: v === true || v === false ? v : (typeof v === 'string' && v.trim() ? v : null) });
      }))
    : null;
  return Object.freeze({
    available: true,
    tier: configKey,
    items: Object.freeze(items),
    ...(serviceMatrix ? { serviceMatrix } : {}),
    source: 'COMMERCIAL_INCLUSION_CONFIG',
  });
}

/**
 * Customer testimonials (page 6) — copied from the owner-maintained content
 * file data/quotation-testimonials.json. Only complete entries (name + quote)
 * are carried; nothing is invented. Empty → blocked → page omitted.
 */
function resolveTestimonials(content) {
  const entries = content && Array.isArray(content.entries) ? content.entries : [];
  const clean = entries
    .filter(t => t && typeof t === 'object' && typeof t.name === 'string' && t.name.trim() && typeof t.quote === 'string' && t.quote.trim())
    .slice(0, 3)
    .map(t => Object.freeze({
      name: t.name.trim(),
      place: typeof t.place === 'string' && t.place.trim() ? t.place.trim() : null,
      systemKw: Number.isFinite(Number(t.systemKw)) && t.systemKw !== null && t.systemKw !== '' ? Number(t.systemKw) : null,
      installedOn: typeof t.installedOn === 'string' && t.installedOn.trim() ? t.installedOn.trim() : null,
      quote: t.quote.trim(),
      billBefore: Number.isFinite(Number(t.billBefore)) && t.billBefore !== null && t.billBefore !== '' ? Number(t.billBefore) : null,
      billAfter: Number.isFinite(Number(t.billAfter)) && t.billAfter !== null && t.billAfter !== '' ? Number(t.billAfter) : null,
      monthlySaving: Number.isFinite(Number(t.monthlySaving)) && t.monthlySaving !== null && t.monthlySaving !== '' ? Number(t.monthlySaving) : null,
      photoUri: typeof t.photoUri === 'string' && t.photoUri.trim() ? t.photoUri.trim() : null,
    }));
  if (!clean.length) {
    return blockedSection({
      dependency: DEPENDENCY.CMS, reference: '§24',
      reason: 'No customer testimonials entered (data/quotation-testimonials.json → entries). Page 6 is omitted until real testimonials exist.',
    });
  }
  const video = content.video && typeof content.video === 'object' ? content.video : null;
  return Object.freeze({
    available: true,
    source: 'QUOTATION_CONTENT',
    value: Object.freeze({
      intro: typeof content.intro === 'string' && content.intro.trim() ? content.intro.trim() : null,
      entries: Object.freeze(clean),
      video: video && typeof video.title === 'string' && video.title.trim()
        ? Object.freeze({ title: video.title.trim(), text: typeof video.text === 'string' ? video.text.trim() : null, link: typeof video.link === 'string' ? video.link.trim() : null, qrImageUri: typeof video.qrImageUri === 'string' ? video.qrImageUri.trim() : null })
        : null,
    }),
  });
}

export function buildQuotationPayload({
  quotation = null,
  customer = null,
  site = null,
  system = null,
  bomSnapshot = null,
  commercialSnapshot = null,
  engineering = null,
  componentAttributes = {},
  upgradeIdentity = null,
  subsidyTreatment = null,
  capabilities = [],
  variant = 'FULL',
  savingsResult = null,
  subsidyResult = null,
  financingResult = null,
  energyProfileResult = null,
  campaignResult = null,
  companyProfile = null,
  tierDisplayNames = null,
  inclusionMatrix = null,
  testimonialsContent = null,
  documentContent = null,
  applianceRows = null,
} = {}) {
  const includeInternal = (capabilities || []).includes(CAPABILITY_COST_VIEW);

  const gate = evaluateGenerationGate({
    customer, system, bomSnapshot, engineering, commercialSnapshot, subsidyTreatment, quotation,
  });

  // P1 (2026-09-13): frozen document content + Sales appliance rows.
  const documentContentFrozen = documentContent && documentContent.content
    ? Object.freeze({ version: documentContent.version ?? null, content: deepFreezeContent(documentContent.content) })
    : null;
  const applianceRowsResolved = resolveApplianceRows(documentContentFrozen?.content ?? null, applianceRows, system?.systemSizeKw ?? null);
  // Figures the content pages print but must not compute (renderer is display-only):
  const genLo = energyProfileResult?.available ? Number(energyProfileResult.dailyGenerationLow) : NaN;
  const genHi = energyProfileResult?.available ? Number(energyProfileResult.dailyGenerationHigh) : NaN;
  const applianceSurplus = applianceRowsResolved && Number.isFinite(genLo) && Number.isFinite(genHi)
    ? { low: round1(Math.max(0, genLo - applianceRowsResolved.total)), high: round1(Math.max(0, genHi - applianceRowsResolved.total)) }
    : null;
  const contentDerived = documentContentFrozen ? deriveContentFigures(documentContentFrozen.content, system?.systemSizeKw ?? null) : null;

  const bomUsable = !!(bomSnapshot && bomSnapshot.status === BOM_SNAPSHOT_LOCKED && Array.isArray(bomSnapshot.lines));
  const rows = bomUsable ? buildRows(bomSnapshot, componentAttributes || {}) : [];
  const customerRows = rows.filter(r => r.customerFacing);

  const bomSummary = bomUsable
    ? Object.freeze({
      available: true,
      source: SOURCE.LOCKED_BOM_SNAPSHOT,
      bomSnapshotId: bomSnapshot.projectId ?? null,
      identitySource: SOURCE.LOCKED_BOM_SNAPSHOT,
      componentIds: Object.freeze(customerRows.map(r => r.componentId)),
      rows: Object.freeze(customerRows),
      internalOnlyLineCount: rows.length - customerRows.length,
      internalOnlyNote: 'Internal consumables and installation materials stay in the internal BOM (§16).',
    })
    : Object.freeze({
      available: false,
      source: null,
      rows: Object.freeze([]),
      blocked: blockedSection({
        dependency: DEPENDENCY.LOCKED_BOM_SNAPSHOT, reference: '§6',
        reason: 'No LOCKED BOM snapshot supplied. Component identity is never taken from anywhere else.',
      }),
    });

  const technicalSpecifications = bomUsable
    ? Object.freeze({
      available: true,
      source: SOURCE.LOCKED_BOM_SNAPSHOT,
      // Same row objects as bomSummary — one identity, by construction (§8, §29).
      rows: Object.freeze(customerRows),
      note: 'Curated customer-facing equipment list (§16). Derived from the same rows as bomSummary.',
    })
    : Object.freeze({
      available: false, source: null, rows: Object.freeze([]),
      blocked: blockedSection({
        dependency: DEPENDENCY.LOCKED_BOM_SNAPSHOT, reference: '§16',
        reason: 'No LOCKED BOM snapshot supplied.',
      }),
    });

  const versions = {};
  for (const k of REQUIRED_VERSION_KEYS) {
    versions[k] = commercialSnapshot?.versions ? (commercialSnapshot.versions[k] ?? null) : null;
  }

  const payload = {
    payloadVersion: QUOTATION_PAYLOAD_VERSION,
    variant,
    variantNote: 'The payload is built once and completely. `variant` selects sections at render time (C14); nothing is trimmed here.',
    sectionNumberingNote: 'Sections are named, never numbered. Page numbering is decision C13 and is PENDING.',

    generationGate: gate,

    quotation: quotation
      ? Object.freeze({
        quotationNumber: quotation.quotationNumber ?? null,
        quotationVersion: quotation.quotationVersion ?? null,
        quotationDate: quotation.quotationDate ?? null,
        validUntil: quotation.validUntil ?? null,
        proposalBy: quotation.proposalBy ?? null,
        salespersonId: quotation.salespersonId ?? null,
        quotationLanguage: quotation.quotationLanguage ?? null,
        status: quotation.status ?? null,
        quotationSource: quotation.quotationSource ?? null,
        district: quotation.district ?? null,
        affiliateId: quotation.affiliateId ?? null,
        identityModel: 'OPERATOR_ASSERTED_ROLE',
        identityNote: 'P3-D is unresolved: proposalBy / salespersonId are asserted, not authenticated.',
        source: SOURCE.QUOTATION_RECORD,
      })
      : blockedSection({
        dependency: DEPENDENCY.LOCKED_BOM_SNAPSHOT, reference: '§4',
        reason: 'No quotation record supplied.',
      }),

    customer: customer
      ? Object.freeze({ ...customer, source: SOURCE.CUSTOMER_RECORD })
      : blockedSection({ dependency: DEPENDENCY.COMMERCIAL_SNAPSHOT, reference: '§3', reason: 'No customer record supplied.' }),

    site: site ? Object.freeze({ ...site, source: SOURCE.PROJECT_CONFIGURATION }) : null,

    system: system
      ? Object.freeze({
        ...system,
        packageTierDisplayName: resolveTierDisplayName(system.packageTier, tierDisplayNames),
        // R3 (2026-09-04) — pin the recommended-tier badge string at issue so
        // it becomes part of the frozen document.payload. Renderer must NOT
        // read live tier-display-names.json for this on ISSUED quotations.
        // Value is the badge string ONLY when this tier is the recommended
        // one; null on every other tier — including inside per-tier alternatives.
        recommendedBadge: resolveRecommendedBadge(system.packageTier, tierDisplayNames),
        // 2026-09-12 — all three customer-facing tier names, pinned at issue, so
        // the approved three-column pages (5 and 7) can head a column whose
        // package was not quotable ("Not available") with its proper name.
        tierColumnNames: Object.freeze(Object.fromEntries(['base', 'value', 'premium']
          .map(t => [t, resolveTierDisplayName(t, tierDisplayNames)]))),
        source: SOURCE.PROJECT_CONFIGURATION,
      })
      : blockedSection({ dependency: DEPENDENCY.LOCKED_BOM_SNAPSHOT, reference: '§5', reason: 'No system configuration supplied.' }),

    inclusions: resolveInclusionMatrix(system?.packageTier, inclusionMatrix),
    // 2026-09-12 — the "What's Included" service table for ALL three tiers,
    // pinned at issue. It is business configuration per tier (not pricing), so
    // the approved three-column table on page 5 can still show a tier whose
    // package could not be quoted; its price cells stay "Not available".
    inclusionsByTier: Object.freeze(Object.fromEntries(['base', 'value', 'premium']
      .map(t => [t, resolveInclusionMatrix(t, inclusionMatrix)]))),

    upgrade: upgradeIdentity
      ? Object.freeze({ ...upgradeIdentity, source: SOURCE.UPGRADE_MODEL, reference: 'C24 — upgrade identity lives on the quotation, not in the BOM.' })
      : null,

    engineering: engineering
      ? Object.freeze({
        status: engineering.status ?? null,
        blocked: Object.freeze([...(engineering.blocked || [])]),
        warnings: Object.freeze([...(engineering.warnings || [])]),
        acknowledgements: Object.freeze([...(engineering.acknowledgements || [])]),
        source: SOURCE.ENGINEERING_CHECKER,
        customerVisible: false,
        note: 'Internal engineering warnings are not customer-facing (§30). Carried for the gate and for internal review.',
      })
      : blockedSection({ dependency: DEPENDENCY.LOCKED_BOM_SNAPSHOT, reference: '§28', reason: 'No engineering verdict supplied.' }),

    bomSummary,
    technicalSpecifications,

    pricing: buildPricing(commercialSnapshot, includeInternal),
    extras: buildExtras(commercialSnapshot),

    // ---- sections with no authoritative source in this build ---------------
    // When a provider result is supplied (e.g. from a mock or future real
    // provider), the section carries that result. The payload assembler
    // copies — it never derives, verifies or recalculates the values.
    // When no result is supplied, the blocked treatment is unchanged.

    subsidy: buildSubsidySection(subsidyTreatment, subsidyResult),

    savings: savingsResult && savingsResult.available
      ? Object.freeze({
        available: true,
        source: savingsResult.source ?? null,
        status: savingsResult.status ?? null,
        value: Object.freeze({ ...savingsResult }),
        dependency: null,
        reference: '§21',
        reason: null,
      })
      : blockedSection({
        dependency: DEPENDENCY.SAVINGS_ENGINE, reference: '§21',
        reason: 'No Savings Engine. Generation, savings, payback and long-term figures have no approved formula.',
      }),

    financing: financingResult && financingResult.available
      ? Object.freeze({
        available: true,
        source: financingResult.source ?? null,
        status: financingResult.status ?? null,
        value: Object.freeze({ ...financingResult }),
        dependency: null,
        reference: '§22',
        reason: null,
      })
      : blockedSection({
        dependency: DEPENDENCY.FINANCE_ENGINE, reference: '§22',
        reason: 'No Finance Engine. The loan-amount basis is explicitly undecided — price after subsidy is not the loan amount.',
      }),

    consumption: energyProfileResult && energyProfileResult.available
      ? Object.freeze({
        available: true,
        source: energyProfileResult.source ?? null,
        status: energyProfileResult.status ?? null,
        value: Object.freeze({
          monthlyConsumption: energyProfileResult.monthlyConsumption ?? null,
          monthlyConsumptionUnit: energyProfileResult.monthlyConsumptionUnit ?? 'kWh',
          annualConsumption: energyProfileResult.annualConsumption ?? null,
          annualConsumptionUnit: energyProfileResult.annualConsumptionUnit ?? 'kWh',
          recommendedSystemSizeKw: energyProfileResult.recommendedSystemSizeKw ?? null,
          exactSystemSizeKw: energyProfileResult.exactSystemSizeKw ?? null,
          averageTariffRate: energyProfileResult.averageTariffRate ?? null,
          averageTariffRateUnit: energyProfileResult.averageTariffRateUnit ?? '₹/kWh',
          regionId: energyProfileResult.regionId ?? null,
          regionName: energyProfileResult.regionName ?? null,
          tariffName: energyProfileResult.tariffName ?? null,
          tariffVersion: energyProfileResult.tariffVersion ?? null,
        }),
        dependency: null,
        reference: '§23',
        reason: null,
      })
      : blockedSection({
        dependency: DEPENDENCY.ENERGY_LOAD_CALCULATION_ENGINE, reference: '§23',
        reason: 'No Energy/Load Calculation Engine. Consumption and recommended size are not estimated here.',
      }),

    // P1 (2026-09-13): the bilingual document content (terms, timeline, scope,
    // documents, life-now/with-solar, labels, appliance master) this quotation
    // was printed with. Frozen at issue; the renderer reads ONLY this.
    content: documentContentFrozen
      ? Object.freeze({ available: true, source: 'QUOTATION_CONTENT_STORE', status: 'OK', value: Object.freeze({ ...documentContentFrozen, derived: contentDerived }), dependency: null, reference: 'P1', reason: null })
      : blockedSection({ dependency: 'QUOTATION_CONTENT_STORE', reference: 'P1', reason: 'No published quotation content (data/quotation-content.json). Pages 3/9/10/11 print without editable text.' }),

    // P1 (2026-09-13): the page-3 table is the Sales-confirmed appliance rows
    // (Project Head profile for this kW, optionally with EV / extra AC added),
    // priced in units/day from the frozen content's watt ratings. "Your Home
    // Uses" on page 3 is THIS total — one number per page. The bill-derived
    // consumption stays in energyProfile for sizing.
    applianceUsage: applianceRowsResolved
      ? Object.freeze({
        available: true,
        source: 'SALES_APPLIANCE_ROWS',
        status: 'OK',
        value: Object.freeze({
          appliances: Object.freeze(applianceRowsResolved.rows),
          totalDailyUsage: applianceRowsResolved.total,
          profileKey: applianceRowsResolved.profileKey ?? null,
          surplusExportedLow: applianceSurplus?.low ?? null,
          surplusExportedHigh: applianceSurplus?.high ?? null,
        }),
        dependency: null,
        reference: '§23',
        reason: null,
      })
      : energyProfileResult && energyProfileResult.available
      ? Object.freeze({
        available: true,
        source: energyProfileResult.source ?? null,
        status: energyProfileResult.status ?? null,
        value: Object.freeze({
          appliances: energyProfileResult.appliances ?? [],
          totalDailyUsage: energyProfileResult.totalDailyUsage ?? null,
        }),
        dependency: null,
        reference: '§23',
        reason: null,
      })
      : blockedSection({
        dependency: DEPENDENCY.ENERGY_LOAD_CALCULATION_ENGINE, reference: '§23',
        reason: 'No Energy/Load Calculation Engine. Appliance daily units have no approved formula.',
      }),

    energyProfile: energyProfileResult && energyProfileResult.available
      ? Object.freeze({
        available: true,
        source: energyProfileResult.source ?? null,
        status: energyProfileResult.status ?? null,
        value: Object.freeze({
          dailyGenerationLow: energyProfileResult.dailyGenerationLow,
          dailyGenerationHigh: energyProfileResult.dailyGenerationHigh,
          monthlyKsebValueLow: energyProfileResult.monthlyKsebValueLow,
          monthlyKsebValueHigh: energyProfileResult.monthlyKsebValueHigh,
          homeUsesUnitsPerDay: energyProfileResult.homeUsesUnitsPerDay ?? null,
          surplusExportedLow: energyProfileResult.surplusExportedLow ?? null,
          surplusExportedHigh: energyProfileResult.surplusExportedHigh ?? null,
        }),
        dependency: null,
        reference: '§23',
        reason: null,
      })
      : blockedSection({
        dependency: DEPENDENCY.ENERGY_LOAD_CALCULATION_ENGINE, reference: '§23',
        reason: 'No Energy/Load Calculation Engine. Generation profile has no approved formula.',
      }),

    testimonials: resolveTestimonials(testimonialsContent),

    campaign: campaignResult && campaignResult.available
      ? Object.freeze({
        available: true,
        source: campaignResult.source ?? 'CMS',
        value: Object.freeze({
          id: campaignResult.id ?? null,
          name: campaignResult.name ?? null,
          active: campaignResult.active ?? false,
          template: campaignResult.template ?? null,
          yearBadge: campaignResult.yearBadge ?? null,
          theme: campaignResult.theme
            ? Object.freeze({ ...campaignResult.theme })
            : null,
          headline: campaignResult.headline ?? null,
          subheadline: campaignResult.subheadline ?? null,
          heroImage: campaignResult.heroImage ?? null,
          primaryBenefit: campaignResult.primaryBenefit
            ? Object.freeze({ ...campaignResult.primaryBenefit })
            : null,
          offers: Array.isArray(campaignResult.offers)
            ? Object.freeze(campaignResult.offers.map(o => Object.freeze({ ...o })))
            : Object.freeze([]),
          luckyDraw: campaignResult.luckyDraw
            ? Object.freeze({ ...campaignResult.luckyDraw })
            : Object.freeze({ enabled: false }),
          referral: campaignResult.referral
            ? Object.freeze({ ...campaignResult.referral })
            : Object.freeze({ enabled: false }),
          urgency: campaignResult.urgency
            ? Object.freeze({ ...campaignResult.urgency })
            : Object.freeze({ enabled: false }),
          cta: campaignResult.cta
            ? Object.freeze({ ...campaignResult.cta })
            : Object.freeze({ enabled: false }),
          artwork: campaignResult.artwork
            ? Object.freeze({ ...campaignResult.artwork })
            : null,
          disclaimer: campaignResult.disclaimer ?? null,
          // V4 quotation-finalization Phase 2B (D6 approved) — pure additive
          // pass-through of the CMS active campaign's period. Renderer binds
          // the CAMPAIGN PERIOD card to this; a null value suppresses the card.
          // No date arithmetic, no derivation from any offer window.
          period: campaignResult.period
            ? Object.freeze({ ...campaignResult.period })
            : null,
        }),
        reference: '§25',
      })
      : blockedSection({
        dependency: DEPENDENCY.CMS, reference: '§25',
        reason: 'Campaign content is CMS/configuration. A monetary campaign benefit would have to be on the commercial snapshot.',
      }),

    terms: blockedSection({
      dependency: DEPENDENCY.CMS, reference: '§30',
      reason: 'Terms are CMS content. No CMS exists in this build.',
    }),

    company: companyProfile
      ? deepFreeze(companyProfile)
      : blockedSection({
        dependency: DEPENDENCY.COMPANY_MASTER, reference: '§30',
        reason: 'No Company Master configured. Admin must set up the company profile before company identity appears on the quotation.',
      }),

    versions: Object.freeze(versions),
    versionsSource: SOURCE.COMMERCIAL_SNAPSHOT,
    versionKeys: REQUIRED_VERSION_KEYS,
  };

  return deepFreeze(payload);
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}


// ---------------------------------------------------------------------------
// P1 (2026-09-13) — document content helpers (pure)
// ---------------------------------------------------------------------------
const round1 = (n) => Math.round(Number(n) * 10) / 10;

/**
 * Figures printed by the content pages, computed here so the renderer stays
 * display-only: the KSEB registration refund (approved formula: 80% of
 * ₹1,000 per kW, pre-tax) and where the T&C list splits across pages 10/11
 * (balanced by text length, per language).
 */
function deriveContentFigures(content, systemSizeKw) {
  const kw = Number(systemSizeKw);
  const refund = kw > 0 ? Math.round(0.8 * 1000 * kw) : null;
  const split = {};
  for (const lang of ['en', 'ml']) {
    const terms = Array.isArray(content?.terms) ? content.terms : [];
    const weights = terms.map(t => 120 + String(t?.title?.[lang] ?? t?.title?.en ?? '').length + String(t?.body?.[lang] ?? t?.body?.en ?? '').length);
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0, cut = terms.length;
    for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (acc >= total / 2) { cut = i + 1; break; } }
    split[lang] = cut;
  }
  return Object.freeze({
    systemSizeKw: kw > 0 ? kw : null,
    ksebRefundAmount: refund,
    ksebRefundAmountText: refund != null ? refund.toLocaleString('en-IN') : null,
    termsPage10Count: Object.freeze(split),
  });
}
function deepFreezeContent(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreezeContent(v);
  }
  return o;
}

/**
 * Turn Sales-confirmed rows [{ id, qty, hours }] into printable rows using the
 * frozen content's appliance master for name / watts. Returns null when there
 * is no content or no rows (the legacy energyProfile path is used instead).
 */
function resolveApplianceRows(content, rows, systemSizeKw) {
  if (!content) return null;
  let profileKey = null;
  if (!Array.isArray(rows) || !rows.length) {
    // No Sales edit → the Project Head profile for this kW (largest band <= kW).
    const profiles = content.appliances?.profiles || {};
    const keys = Object.keys(profiles).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const kw = Number(systemSizeKw);
    for (const k of keys) if (k <= kw) profileKey = String(k);
    if (profileKey == null && keys.length) profileKey = String(keys[0]);
    rows = profileKey ? profiles[profileKey] : null;
    if (!Array.isArray(rows) || !rows.length) return null;
  }
  const master = new Map((content.appliances?.master || []).map(m => [m.id, m]));
  const out = [];
  for (const r of rows) {
    const m = master.get(r?.id);
    if (!m) continue;
    const qty = Math.max(0, Number(r.qty) || 0);
    const hours = Math.max(0, Number(r.hours ?? m.defaultHours) || 0);
    const watts = Math.max(0, Number(m.watts) || 0);
    if (qty === 0) continue;
    const units = Math.round(qty * watts * hours / 1000 * 10) / 10;
    out.push(Object.freeze({ id: m.id, name: m.name, icon: m.icon || '', qty, hours, watts, units }));
  }
  if (!out.length) return null;
  const total = Math.round(out.reduce((s, r) => s + r.units, 0) * 10) / 10;
  return { rows: out, total, profileKey };
}

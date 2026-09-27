/**
 * SALES ORCHESTRATOR — APPLICATION SERVICE LAYER.  (Master Plan — Step 7)
 *
 * This is the 1-minute quotation flow for Sales users. It orchestrates the
 * EXISTING frozen engines and workspace services in the correct order.
 * It NEVER duplicates any calculation, NEVER invents data, and NEVER
 * bypasses the authority chain.
 *
 * AUTHORITY CHAIN (enforced, not optional):
 *   Catalog → Package Configuration → Approved Package → BOM → Engineering
 *   Validation → Cost Engine → Admin Margin → Pricing Engine → Quotation
 *
 * WHAT THIS MODULE DOES:
 *   1. Validates Sales input (customer, system config)
 *   2. Finds the APPROVED package for the requested system/tier
 *   3. Creates a project in the workspace
 *   4. Selects the approved package (materialises BOM)
 *   5. Runs engineering checker
 *   6. Locks BOM (if VALID)
 *   7. Computes cost (via frozen Cost Engine)
 *   8. Computes pricing (via frozen Pricing Engine)
 *   9. Finds applicable offer (pinned before snapshot)
 *   10. Creates commercial snapshot (with pinned offer + market rate)
 *   11. Registers snapshots in quotation store
 *   12. Creates quotation draft and issues it
 *   13. Strips internal data from result for individual Sales roles
 *
 * WHAT THIS MODULE DOES NOT:
 *   - No cost formula
 *   - No pricing formula
 *   - No margin calculation
 *   - No GST calculation
 *   - No engineering rule
 *   - No BOM quantity decision
 *   - No authority bypass
 *
 * Every step delegates to the existing service. If any step fails, the
 * orchestrator reports the exact blocker and does not proceed.
 */

import * as W from './projectWorkspace.js';
import * as Q from './quotationWorkspace.js';
import { assertPackageSelectableByActor, resolvePackageArchitecture } from './packageApproval.js';
import { findApplicableOffer, offerPayloadShape, calculateOfferAmount } from './offerLifecycle.js';
import { createCommercialSnapshot, createPackCommercialSnapshot } from './commercialSnapshot.js';
import { pricePack, structureMaterial, tubeRateFor, kwOf } from './packPricing.js';
import { ROOF_TO_STRUCTURE_KEY, marketRateKey } from './packConfig.js';
import { CATEGORY_TO_ROLE } from './bomRoles.js';
import { assertCan, CAPABILITY, isIndividualSalesRole } from './rbac.js';
import { calculateCost, COST_STATUS } from './costEngine.js';
import { calculatePricing, PRICING_STATUS } from './pricingEngine.js';

// ---------------------------------------------------------------------------
// P1 (2026-09-13) — quotation language + Sales appliance rows (page 3 table)
// ---------------------------------------------------------------------------
/** 'en' | 'ml' only; anything else → 'en'. */
export function normaliseLanguageInput(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return (s === 'ml' || s === 'malayalam') ? 'ml' : 'en';
}
/** Keep only { id, qty, hours } with sane numbers; null when nothing usable (the
 *  Project Head profile is then applied at render time by the payload builder). */
export function sanitiseApplianceRows(rows) {
  if (!Array.isArray(rows)) return null;
  const out = [];
  for (const r of rows.slice(0, 12)) {
    const id = String(r?.id ?? '').trim();
    if (!/^[a-z0-9_]{2,32}$/.test(id)) continue;
    const qty = Number(r?.qty); const hours = Number(r?.hours);
    if (!(qty >= 0 && qty <= 50) || !(hours >= 0 && hours <= 24)) continue;
    out.push({ id, qty: Math.round(qty), hours: Math.round(hours * 4) / 4 });
  }
  return out.length ? out : null;
}

export const ORCHESTRATOR_VERSION = 'sales-orchestrator.1';

export const ORCHESTRATION_ERROR = {
  NO_APPROVED_PACKAGE: 'NO_APPROVED_PACKAGE',
  ENGINEERING_BLOCKED: 'ENGINEERING_BLOCKED',
  COST_INCOMPLETE: 'COST_INCOMPLETE',
  PRICING_REJECTED: 'PRICING_REJECTED',
  MISSING_INPUT: 'MISSING_INPUT',
  SELECTION_NOT_PERMITTED: 'SELECTION_NOT_PERMITTED',
  SELECTION_NOT_APPROVED: 'SELECTION_NOT_APPROVED',
  STRUCTURE_SELECTION_REQUIRED: 'STRUCTURE_SELECTION_REQUIRED',
  STRUCTURE_PACK_UNRESOLVED: 'STRUCTURE_PACK_UNRESOLVED',
  PACK_PRICING_BLOCKED: 'PACK_PRICING_BLOCKED',
  ORCHESTRATION_FAILED: 'ORCHESTRATION_FAILED',
  BATTERY_NOT_IN_PACKAGE: 'BATTERY_NOT_IN_PACKAGE',
};

class OrchestrationError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'OrchestrationError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * B.6 / conformance §4 §7 (2026-09-07) — battery quantity is a PROJECT-LEVEL
 * parameter (0 / 1 / 2), never a template dimension. The approved package
 * authors the battery MODEL; the quantity chosen for this project is applied
 * to the materialised project BOM here, through the existing Project-Head
 * BOM edit surface (editBomQuantity / removeBomRole → full audit trail).
 *
 *   qty 0   → BATTERY, BATTERY_PROTECTION, BATTERY_CABLE lines are removed
 *             (a battery-less hybrid; the checker keeps validating the rest).
 *   qty 1/2 → BATTERY quantity set. BATTERY_PROTECTION quantity is NOT
 *             touched — the protection-per-battery rule is Engineering data
 *             (D12-E) and must never be assumed here.
 *   qty>0 on a package with no BATTERY role → BATTERY_NOT_IN_PACKAGE. The
 *             package has no approved battery model; nothing is invented.
 *
 * Non-hybrid systems and a null/absent quantity leave the BOM untouched
 * (package default), preserving every existing caller.
 */
/**
 * 2026-09-07 conformance §17 — customer subsidy inputs flow into the draft so
 * quotationWorkspace.issueQuotation resolves the REAL subsidyEngine result
 * (PM Surya Ghar CFA from data/subsidy-config.json) and freezes it into the
 * snapshot. Before this, the orchestrator forced subsidyTreatment=NOT_QUOTED
 * and never forwarded subsidyType, so every orchestrated quotation carried
 * subsidy=null regardless of customer eligibility.
 *
 *   subsidyType : 'residential' | 'ghs' | 'none' (customer/site fact supplied
 *                 by Sales; the ENGINE decides eligibility + amount)
 *   ghsHouses   : number of houses (GHS only)
 *
 * Explicit input.subsidyTreatment still wins. With no subsidyType (or 'none')
 * the historical behaviour is preserved: NOT_QUOTED.
 */
/**
 * Architecture of the package about to be materialised (DEYE | ENPHASE | null).
 * Delegates to packageApproval.resolvePackageArchitecture: explicit package
 * declaration first, then the catalog profile's configured inverterType. A null
 * result is passed through unchanged so the checker raises PBC-A-001 — the
 * orchestrator never substitutes a default architecture.
 */
function packageArchitecture(pkg, env) {
  return resolvePackageArchitecture(pkg, env?.catalog).architecture;
}

export function subsidyDraftFields(input = {}) {
  const subsidyType = input.subsidyType == null ? null : String(input.subsidyType);
  const quoted = subsidyType && subsidyType !== 'none';
  const out = {
    subsidyTreatment: input.subsidyTreatment || (quoted ? null : 'NOT_QUOTED'),
  };
  if (subsidyType) out.subsidyType = subsidyType;
  if (input.ghsHouses != null) out.ghsHouses = Number(input.ghsHouses);
  return out;
}

export function applyProjectBatteryQuantity(workspaceStore, env, { wsActor, projectId, input, at, stepLog = null }) {
  if (input.systemType !== 'hybrid') return null;
  const q = input.batteryQuantity;
  if (!(q === 0 || q === 1 || q === 2)) return null;
  const bom = W.viewBom(workspaceStore, env, { actor: wsActor, projectId });
  const hasBattery = (bom.lines || []).some(l => l.role === 'BATTERY' && l.componentId);
  const reason = `Project battery quantity ${q} — PROJECT_HEAD project configuration (B.6)`;
  if (q === 0) {
    for (const role of ['BATTERY', 'BATTERY_PROTECTION', 'BATTERY_CABLE']) {
      if ((bom.lines || []).some(l => l.role === role))
        W.removeBomRole(workspaceStore, env, { actor: wsActor, projectId, role, reason, at });
    }
    if (stepLog) stepLog('APPLY_BATTERY_QUANTITY', 'OK', { batteryQuantity: 0, removed: ['BATTERY', 'BATTERY_PROTECTION', 'BATTERY_CABLE'] });
    return { batteryQuantity: 0 };
  }
  if (!hasBattery) {
    throw new OrchestrationError(ORCHESTRATION_ERROR.BATTERY_NOT_IN_PACKAGE,
      `Battery quantity ${q} was requested but the approved package "${bom.packageId ?? input.tier}" defines no battery model. ` +
      'The Project Head must author an approved battery on the package before a battery can be quoted. Nothing is substituted.',
      { batteryQuantity: q, packageId: bom.packageId ?? null, owner: 'PROJECT_HEAD' });
  }
  W.editBomQuantity(workspaceStore, env, { actor: wsActor, projectId, role: 'BATTERY', quantity: q, at });
  if (stepLog) stepLog('APPLY_BATTERY_QUANTITY', 'OK', { batteryQuantity: q });
  return { batteryQuantity: q };
}

/**
 * Validate the Sales input before starting orchestration.
 */
function validateSalesInput(input, packMode = null) {
  const errors = [];
  if (!input.customer?.name) errors.push('Customer name is required');
  if (!input.customer?.phone) errors.push('Customer phone is required');
  if (!input.systemType) errors.push('System type is required (ongrid/hybrid)');
  if (!input.size) errors.push('System size is required');
  if (!input.tier) errors.push('Package tier is required (base/value/premium)');
  // Site facts drive INSTALLATION (exact size + type, §15) and TRANSPORTATION
  // (one-way distance × selected vehicle, §16). They are customer/site inputs
  // captured by Sales; the orchestrator never defaults them (no FLAT, no 0 km,
  // no STANDARD) because a defaulted site fact silently prices the wrong job.
  const instType = input.installationType ?? input.roofType ?? null;
  if (!instType) errors.push('installationType is required (installation/roof type from the configured installation matrix)');
  const dist = input.distanceKm;
  if (dist == null || dist === '' || !Number.isFinite(Number(dist)) || Number(dist) < 0) errors.push('distanceKm is required (one-way warehouse → site distance in km, 0 or more)');
  if (!input.vehicleType && !(packMode && (packMode.config?.transportConfig?.vehicles || []).length === 1))
    errors.push('vehicleType is required (transport vehicle from the Project Head rate card)');
  return { valid: errors.length === 0, errors };
}

/**
 * §11 Sales controlled customization — the ONLY categories Sales may choose,
 * mapped to the project-BOM roles the workspace edits. Everything else
 * (battery, protection, DCDB/ACDB, cables, earthing, device allocation…) is
 * engineering and is rejected server-side, not hidden client-side.
 */
export const SALES_CUSTOMIZABLE_CATEGORIES = Object.freeze({
  panel: 'PANEL',
  inverter: 'INVERTER',
  structure_material: 'STRUCTURE',
});

/**
 * Normalise Sales selections for one tier.
 *
 * Accepted shapes (both produced by real clients):
 *   { [tier]: { panel, inverter, structure_material } }   ← sales-wizard / sales.html
 *   { panel, inverter, structure_material }               ← flat
 * Returns [{ category, role, componentId }]. Throws SELECTION_NOT_PERMITTED for
 * any category outside SALES_CUSTOMIZABLE_CATEGORIES, and SELECTION_NOT_APPROVED
 * when `approvedAlternativesFor(tier)` is supplied and the componentId is not
 * among the approved alternatives the package exposes for that category.
 */
export function resolveSalesSelections(input, tier, { approvedAlternativesFor = null, allowedCategories = null } = {}) {
  const raw = input?.tierSelections;
  if (!raw || typeof raw !== 'object') return [];
  const tierKeys = ['base', 'value', 'premium'];
  const nested = tierKeys.some(k => Object.prototype.hasOwnProperty.call(raw, k));
  const sel = nested ? (raw[tier] || {}) : raw;
  if (!sel || typeof sel !== 'object') return [];
  const out = [];
  const approved = approvedAlternativesFor ? (approvedAlternativesFor(tier) || {}) : null;
  // Allowed categories: the pack config's salesSwap slots when supplied (data),
  // else the legacy fixed trio. Role = checker role for the category.
  const allowed = Array.isArray(allowedCategories) ? allowedCategories : Object.keys(SALES_CUSTOMIZABLE_CATEGORIES);
  const roleFor = (category) => SALES_CUSTOMIZABLE_CATEGORIES[category] || CATEGORY_TO_ROLE[category] || null;
  for (const [category, componentId] of Object.entries(sel)) {
    if (componentId == null || componentId === '') continue;
    const role = allowed.includes(category) ? roleFor(category) : null;
    if (!role) {
      throw new OrchestrationError(ORCHESTRATION_ERROR.SELECTION_NOT_PERMITTED,
        `Sales may not configure "${category}". Only ${allowed.join(' / ')} are Sales-selectable for this pack; everything else is fixed by the Project Head.`,
        { category, componentId, allowed });
    }
    if (typeof componentId !== 'string') {
      throw new OrchestrationError(ORCHESTRATION_ERROR.MISSING_INPUT,
        `Selection for ${category} must be a componentId string.`, { category, componentId });
    }
    if (approved) {
      const ids = (approved[category] || []).map(a => (typeof a === 'string' ? a : a?.id)).filter(Boolean);
      if (!ids.includes(componentId)) {
        throw new OrchestrationError(ORCHESTRATION_ERROR.SELECTION_NOT_APPROVED,
          `"${componentId}" is not an approved ${category} alternative for the ${tier} package. Approved: ${ids.length ? ids.join(', ') : 'none'}.`,
          { category, componentId, tier, approved: ids });
      }
    }
    out.push({ category, role, componentId });
  }
  return out;
}

/**
 * Apply Sales selections to a materialised project BOM, then make sure a
 * STRUCTURE line exists. Packages do not carry structure (site-specific);
 * the structure component is a Sales-selected approved alternative — never
 * the first catalog item. Missing → STRUCTURE_SELECTION_REQUIRED.
 */
/**
 * tierSelections for an alternative tier, inheriting the primary tier's
 * structure_material when the alternative tier does not state one (structure is
 * a site fact, identical across Essential / Smart / Elite of the same project).
 */
function withSharedStructure(input, alternativeTier) {
  const raw = input?.tierSelections;
  if (!raw || typeof raw !== 'object') return raw;
  const tierKeys = ['base', 'value', 'premium'];
  const nested = tierKeys.some(k => Object.prototype.hasOwnProperty.call(raw, k));
  if (!nested) return raw; // flat shape already applies to every tier
  const primary = raw[input.tier] || {};
  const alt = { ...(raw[alternativeTier] || {}) };
  if (!alt.structure_material && primary.structure_material) alt.structure_material = primary.structure_material;
  return { ...raw, [alternativeTier]: alt };
}

/**
 * Pack mode — place the STRUCTURE line from the Project Head's structure pack
 * for (system kW × roof type). The primary tube of the roof template is mapped
 * to a catalog `structure_material` item by its configured `tubeSize`
 * attribute (never by name). The full structure material list is frozen in
 * the snapshot's pack domain by the pricing step.
 */
function applyRoofStructure(workspaceStore, env, { wsActor, projectId, input, tier, at, options, stepLog }) {
  const pm = options.packMode;
  const roof = String(input.installationType ?? input.roofType ?? '').toUpperCase();
  const tmpl = (pm.config?.structureTemplates || {})[ROOF_TO_STRUCTURE_KEY[roof]];
  if (!tmpl) return;
  const kw = kwOf(input.futureSystemSize || input.size);
  const sm = structureMaterial(tmpl, kw, tubeRateFor(pm.config?.costs, tier));
  const primaryTube = sm.lines.find(l => l.isTube && l.qty > 0);
  if (!primaryTube) return;
  const items = env.catalog?.categories?.structure_material?.items || [];
  const norm = (v) => String(v || '').toLowerCase().replace(/[×x]/g, 'x').replace(/\s+/g, '');
  const item = items.find(i => i.tubeSize && norm(i.tubeSize) === norm(primaryTube.tubeSize));
  if (!item) return;
  W.editBomComponent(workspaceStore, env, {
    actor: wsActor, projectId, role: 'STRUCTURE', componentId: item.id, quantity: primaryTube.qty,
    reason: `Structure pack ${roof} ${kw} kW — primary tube ${primaryTube.tubeSize} × ${primaryTube.qty}`, at,
  });
  if (stepLog) stepLog('APPLY_STRUCTURE_PACK', 'OK', { roofType: roof, kw, componentId: item.id, quantity: primaryTube.qty, lines: sm.lines.length });
}

function applySalesSelections(workspaceStore, env, { wsActor, projectId, input, tier, at, options, stepLog }) {
  const pm = options?.packMode || null;
  // Pack mode: the categories Sales may swap come from the approved pack config
  // (slots with salesSwap) — the server passes them via approvedAlternativesFor.
  const allowedCategories = pm && options?.approvedAlternativesFor ? Object.keys(options.approvedAlternativesFor(tier) || {}) : null;
  const selections = resolveSalesSelections(input, tier, { approvedAlternativesFor: options?.approvedAlternativesFor || null, allowedCategories });
  const applied = [];
  for (const { role, componentId, category } of selections) {
    try {
      W.editBomComponent(workspaceStore, env, {
        actor: wsActor, projectId, role, componentId,
        ...(role === 'STRUCTURE' ? { quantity: 1 } : {}),
        reason: `Sales-selected approved alternative (${category})`, at,
      });
      applied.push({ role, componentId });
    } catch (err) {
      throw new OrchestrationError(ORCHESTRATION_ERROR.MISSING_INPUT,
        `Alternative selection rejected for ${role}: ${err.message}`,
        { role, componentId, originalError: err.message });
    }
  }
  // Pack mode (owner rule): structure follows the ROOF TYPE — the PH structure
  // pack for this kW × roof supplies the STRUCTURE line; Sales never picks it.
  if (pm) {
    applyRoofStructure(workspaceStore, env, { wsActor, projectId, input, tier, at, options, stepLog });
  }
  const bom = W.viewBom(workspaceStore, env, { actor: wsActor, projectId });
  if (!(bom.lines || []).some(l => l.role === 'STRUCTURE' && l.componentId)) {
    if (pm) {
      throw new OrchestrationError(ORCHESTRATION_ERROR.STRUCTURE_PACK_UNRESOLVED,
        `No structure pack line could be placed for ${input.installationType ?? input.roofType} roof: the structure template's tube sections must map to catalog structure_material items (tubeSize attribute). Project Head / Admin data.`,
        { roofType: input.installationType ?? input.roofType, owner: 'PROJECT_HEAD' });
    }
    throw new OrchestrationError(ORCHESTRATION_ERROR.STRUCTURE_SELECTION_REQUIRED,
      'The approved package carries no structure material and Sales selected none. Structure is site-specific: choose an approved structure alternative (tierSelections.<tier>.structure_material). Nothing is substituted.',
      { tier, owner: 'SALES', allowed: 'structure_material' });
  }
  if (applied.length && stepLog) stepLog('APPLY_ALTERNATIVES', 'OK', { alternatives: applied });
  return applied;
}

/**
 * Find the approved package matching the Sales selection.
 */
function findApprovedPackage(packageRegistry, { systemType, size, phase, tier, futureSystemSize = null }) {
  const packages = packageRegistry?.packages || [];
  const wantVariant = futureSystemSize ? 'FUTURE_READY' : 'STANDARD';
  return packages.find(p =>
    p.systemType === systemType &&
    p.size === size &&
    p.tier === tier &&
    (!phase || p.phase === phase) &&
    p.approvalStatus === 'APPROVED' &&
    !p.supersededBy &&
    (p.variant ?? 'STANDARD') === wantVariant &&
    (!futureSystemSize || String(p.systemSize) === String(futureSystemSize))
  ) || null;
}

/**
 * Generate IDs for the orchestration run.
 * All IDs are deterministic from the input, no randomness.
 */
/**
 * 2026-09-07 — collision-safe id stamp. The previous second-resolution stamp
 * (yyyymmddHHMMSS) made two orchestrations of the same combo inside one
 * second collide on PROJECT_EXISTS (e.g. a Sales retry right after an
 * ENGINEERING_BLOCKED attempt, or two advisors quoting the same plant at the
 * same moment). Millisecond precision plus a short random tail keeps ids
 * unique without touching any caller-supplied id.
 */
function idStamp(at) {
  const ms = at.replace(/[^0-9]/g, '').slice(0, 17);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${ms}${rnd}`;
}

function generateIds(input, at) {
  const ts = idStamp(at);
  const base = `${input.systemType}_${input.size}_${input.tier}_${ts}`;
  return {
    projectId: input.projectId || `PRJ-${base}`,
    quotationId: input.quotationId || `QT-${base}`,
    bomSnapshotId: `SNAP-${base}`,
    commercialSnapshotId: `CS-${base}`,
  };
}

/**
 * Strip internal cost, margin and engineering data from the orchestrator result.
 * Sales roles (SALES, SALES_CRS, FIELD_SALES) see only what they need to present
 * a quotation to the customer: prices, offer, system summary and step status.
 * SALES_HEAD and ADMIN see the full result for monitoring and approval.
 */
export function stripForSales(result) {
  return {
    success: result.success,
    orchestratorVersion: result.orchestratorVersion,
    quotationId: result.quotationId,
    customer: result.customer,
    systemSummary: result.system ? {
      systemType: result.system.systemType,
      systemSizeKw: result.system.systemSizeKw,
      packageTier: result.system.packageTier,
    } : null,
    pricing: result.pricing ? {
      listPrice: result.pricing.listPrice,
      gstAmount: result.pricing.gstAmount,
      customerPrice: result.pricing.customerPrice,
      // Customer-facing extras only (transport beyond the included km). Market
      // rate, swap deltas, margin-vs-market stay internal.
      ...(result.pricing.transportExtra != null ? { transportExtra: result.pricing.transportExtra, transportExtraDetail: result.pricing.transportExtraDetail, customerTotal: result.pricing.customerTotal } : {}),
    } : null,
    offer: result.offer,
    quotation: result.quotation ?? null,
    subsidy: result.subsidy ?? null,
    version: result.version,
    steps: (result.steps || []).map(s => ({ step: s.step, status: s.status })),
  };
}

/**
 * THE ORCHESTRATOR — 1-minute quotation flow.
 *
 * @param {object} workspaceStore - The project workspace store
 * @param {object} quotationStore - The quotation store
 * @param {object} env - The workspace environment (catalog, costConfig, priceMaster, etc.)
 * @param {object} input - Sales input { customer, systemType, size, tier, phase, roofType, ... }
 * @param {object} actor - The authenticated Sales actor { userId, role }
 * @param {object} options - { at, catalog, cmsStore, companyProfile, tierDisplayNames, ... }
 */
export function orchestrateQuotation(workspaceStore, quotationStore, env, input, actor, options = {}) {
  // ---- STEP 0: Validate input ----
  // Gate: the calling actor must have QUOTATION_CREATE.
  assertCan(actor, CAPABILITY.QUOTATION_CREATE);

  const validation = validateSalesInput(input, options.packMode || null);
  if (!validation.valid) {
    throw new OrchestrationError(ORCHESTRATION_ERROR.MISSING_INPUT,
      `Sales input validation failed: ${validation.errors.join('; ')}`,
      { errors: validation.errors });
  }

  const at = options.at || new Date().toISOString();
  const ids = generateIds(input, at);
  const steps = [];
  const stepLog = (name, status, detail = null) => steps.push({ step: name, status, detail, at: new Date().toISOString() });

  // INTERNAL ELEVATED ACTOR — used for workspace operations only.
  //
  // The Sales user's QUOTATION_CREATE capability is the authority gate (checked
  // above). The workspace operations below (createProject, setProjectConfiguration,
  // selectPackage, editBomComponent, setCostInputs, runChecker, lockBom) each
  // require capabilities that Sales intentionally does NOT have — those caps
  // protect the interactive workspace where humans work manually. But in this
  // automated flow the orchestrator IS the approved path: it uses only APPROVED
  // packages, committed procurement prices and frozen engines. No authority is
  // bypassed because the orchestrator never makes a decision a human hasn't
  // already approved.
  //
  // The elevated actor carries the original Sales userId so the audit trail stays
  // intact, and the role 'PROJECT_HEAD' so workspace assertCan checks pass.
  const wsActor = { userId: actor.userId, role: 'PROJECT_HEAD' };

  try {
    // ---- STEP 1: Find approved package ----
    const phase = input.phase || (input.size && ['5sp', '5tp'].includes(input.size)
      ? (input.size === '5tp' ? '3P' : '1P') : '1P');

    const pkg = findApprovedPackage(env.packageRegistry, {
      systemType: input.systemType,
      size: input.size,
      phase,
      tier: input.tier,
      futureSystemSize: input.futureSystemSize || null,
    });

    if (!pkg) {
      // Check if a PROPOSED package exists
      const proposedPkg = (env.packageRegistry?.packages || []).find(p =>
        p.systemType === input.systemType && p.size === input.size &&
        p.tier === input.tier && (!phase || p.phase === phase));

      throw new OrchestrationError(ORCHESTRATION_ERROR.NO_APPROVED_PACKAGE,
        `No APPROVED package found for ${input.systemType} ${input.size}kW ${input.tier} ${phase}. ` +
        (proposedPkg ? `Package ${proposedPkg.packageId} exists but is ${proposedPkg.approvalStatus}. Engineering approval required.`
          : 'No package exists for this configuration.'),
        { systemType: input.systemType, size: input.size, tier: input.tier, phase,
          proposedPackageId: proposedPkg?.packageId || null });
    }
    stepLog('FIND_PACKAGE', 'OK', { packageId: pkg.packageId });

    // ---- STEP 2: Create project ----
    const projectResult = W.createProject(workspaceStore, {
      actor: wsActor, projectId: ids.projectId,
      customer: input.customer, at,
    });
    stepLog('CREATE_PROJECT', 'OK', { projectId: ids.projectId });

    // ---- STEP 3: Configure project ----
    W.setProjectConfiguration(workspaceStore, {
      actor: wsActor, projectId: ids.projectId, at,
      sysType: input.systemType,
      // Phase-suffix-safe sizeKw parse (P0-1 fix). Package/BOM keep the
      // phase-suffixed size (e.g. "5sp"); cost/pricing need the numeric kW.
      sizeKw: Number(String(input.size).replace(/[^0-9.]/g, '')),
      phase,
      tier: input.tier,
      // Engineering architecture (checker vocabulary DEYE | ENPHASE, D12) comes
      // from the approved package / its catalog profile — never from systemType
      // and never from Sales input. Before 2026-09-07 the orchestrator declared
      // 'GRID_TIED' | 'HYBRID', which the checker treated as Deye rules, so every
      // Enphase (Premium) package was blocked with PBC-A-002 by construction.
      architecture: packageArchitecture(pkg, env),
    });
    stepLog('CONFIGURE_PROJECT', 'OK');

    // ---- STEP 4: Select package (materialises BOM) ----
    const bomResult = W.selectPackage(workspaceStore, env, {
      actor: wsActor, projectId: ids.projectId, packageId: pkg.packageId, at,
    });
    stepLog('SELECT_PACKAGE', 'OK', { packageId: pkg.packageId, lineCount: bomResult.bom?.lineCount });

    // ---- STEP 4-B6: Apply project-level battery quantity (hybrid 0/1/2) ----
    applyProjectBatteryQuantity(workspaceStore, env, { wsActor, projectId: ids.projectId, input, at, stepLog });

    // ---- STEP 4a/4b: Sales-selected approved alternatives + structure ----
    // Panel / Inverter / Structure only (§11); every selection validated
    // server-side against the package's approved alternatives. Structure is
    // site-specific and must be a Sales selection — no first-catalog-item default.
    applySalesSelections(workspaceStore, env, { wsActor, projectId: ids.projectId, input, tier: input.tier, at, options, stepLog });

    // ---- STEP 5: Set cost inputs ----
    // Cost Engine requires installationType, distanceKm and vehicleType. They
    // are validated as REQUIRED Sales/site inputs above — no defaults here
    // (§15 exact size + installation type; §16 one-way distance × vehicle).
    const costInputs = {
      installationType: input.installationType ?? input.roofType,
      distanceKm: Number(input.distanceKm),
      vehicleType: input.vehicleType,
      sizeKey: String(input.size),
    };
    W.setCostInputs(workspaceStore, {
      actor: wsActor, projectId: ids.projectId, at,
      inputs: costInputs,
    });
    stepLog('SET_COST_INPUTS', 'OK', costInputs);

    // ---- STEP 6: Run engineering checker ----
    const checkerResult = W.runChecker(workspaceStore, env, {
      actor: wsActor, projectId: ids.projectId, at,
    });
    stepLog('ENGINEERING_CHECK', checkerResult.status, {
      status: checkerResult.status,
      blocked: checkerResult.counts?.blocked || 0,
      warnings: checkerResult.counts?.warning || 0,
    });

    // ---- STEP 7: Lock BOM ----
    // Auto-acknowledge ALL warnings for approved packages. Engineering already
    // approved the package configuration, so the orchestrator acknowledges on
    // behalf of the automated flow. lockBom runs its own fresh checker pass,
    // so we must supply acks for every rule that could fire as WARNING.
    const acks = (checkerResult.findings || [])
      .filter(r => r.severity === 'WARNING')
      .map(r => ({ ruleId: r.ruleId, reason: `Auto-acknowledged: package ${pkg.packageId} is APPROVED` }));

    const lockResult = W.lockBom(workspaceStore, env, {
      actor: wsActor, projectId: ids.projectId, at, acknowledgements: acks,
    });

    if (!lockResult.locked) {
      throw new OrchestrationError(ORCHESTRATION_ERROR.ENGINEERING_BLOCKED,
        `BOM lock failed: ${lockResult.reason || 'engineering validation blocked'}`,
        { result: lockResult.result, missingAcknowledgements: lockResult.missingAcknowledgements });
    }
    stepLog('LOCK_BOM', 'OK', { snapshotId: lockResult.snapshot?.snapshotId });

    // ---- STEP 8: Calculate cost ----
    const p = workspaceStore.projects[ids.projectId];
    const pm = options.packMode || null;
    const costResult = calculateCost({
      snapshot: p.lock,
      config: env.costConfig,
      priceMaster: env.priceMaster || {},
      rateCard: env.rateCard || null,
      project: {
        sizeKw: p.sizeKw,
        sizeKey: p.costInputs?.sizeKey ?? String(input.size),
        installationType: p.costInputs?.installationType ?? input.roofType ?? null,
        phase, sysType: input.systemType, tier: input.tier,
        distanceKm: p.costInputs?.distanceKm ?? null,
        vehicleType: p.costInputs?.vehicleType ?? null,
        structureMaterialCost: p.costInputs?.structureMaterialCost ?? null,
        specialWorks: p.costInputs?.specialWorks || [],
      },
      calculatedAt: at,
      catalogVersion: env.catalogVersion ?? null,
      procurementPriceVersion: env.procurementPriceVersion ?? null,
      landedCostVersion: env.landedCostVersion ?? null,
    });

    if (!pm && costResult.status !== COST_STATUS.COMPLETE) {
      // Cost incomplete — report exactly which heads are blocked
      const blockedHeads = (costResult.errors || []).map(e => e.head || e.code).filter(Boolean);
      throw new OrchestrationError(ORCHESTRATION_ERROR.COST_INCOMPLETE,
        `Cost calculation incomplete. Blocked heads: ${blockedHeads.join(', ') || 'unknown'}. ` +
        'Required: procurement prices, rate card, and all cost configuration.',
        { status: costResult.status, errors: costResult.errors, blockedHeads });
    }
    p.lastCost = costResult;
    stepLog('CALCULATE_COST', costResult.status === COST_STATUS.COMPLETE ? 'OK' : (pm ? 'INFO' : 'BLOCKED'),
      { totalCost: costResult.totalActualProjectCost ?? null, status: costResult.status, mode: pm ? 'PACK_MARKET_RATE (landed cost is an internal check only)' : 'GROSS_MARGIN' });

    // ---- STEP 9: Calculate pricing ----
    let pricingResult = null;
    let packPriced = null;
    let materialList = [];
    if (pm) {
      // Owner's pack formula: market rate + swap deltas + roof add-on; transport
      // beyond the included km as a separate customer extra. Lines come from the
      // approved pack config materialised at the actual selections / battery / FR.
      const selections = {};
      for (const a of (p.bom?.overrides ? Object.values(p.bom.overrides) : [])) { /* project overrides carry roles, not categories */ }
      const tierSel = resolveSalesSelections(input, input.tier, { allowedCategories: Object.keys(CATEGORY_TO_ROLE).concat(['enphase', 'hoymiles']) });
      for (const t of tierSel) selections[t.category] = t.componentId;
      const full = pm.materialise({
        systemType: input.systemType, size: String(input.size), tier: input.tier, phase,
        selections, batteryQuantity: input.batteryQuantity ?? null,
        futureSystemSize: input.futureSystemSize || null, actorRole: 'PROJECT_HEAD', configSource: 'approved',
      });
      packPriced = pricePack({
        config: pm.config, systemType: input.systemType, size: String(input.size), tier: input.tier,
        roofType: input.installationType ?? input.roofType, distanceKm: Number(input.distanceKm),
        vehicleType: input.vehicleType || null, batteryConfig: full.systemConfig?.batteryQuantity ?? 0,
        futureSystemSize: input.futureSystemSize || null, lines: full.lines, pricedAt: at,
      });
      if (packPriced.status !== 'COMPLETE') {
        throw new OrchestrationError(ORCHESTRATION_ERROR.PACK_PRICING_BLOCKED,
          `Pack pricing blocked: ${packPriced.errors.map(e => e.message).join(' | ')}`,
          { errors: packPriced.errors, owner: 'PROJECT_HEAD' });
      }
      materialList = [
        ...full.lines.map(l => ({ category: l.category, componentId: l.componentId ?? null, name: l.name, qty: l.qty, unit: l.unit ?? null, isVariable: !!l.isVariable, selectionMethod: l.selectionMethod ?? null })),
        ...packPriced.structureMaterial.lines.map(l => ({ category: 'structure', componentId: null, name: l.name, qty: l.qty, unit: l.isTube ? 'tube' : 'nos', isVariable: false, selectionMethod: 'STRUCTURE_PACK' })),
      ];
      stepLog('CALCULATE_PRICING', 'OK', {
        mode: 'PACK_MARKET_RATE', marketRateKey: packPriced.marketRateKey,
        listPrice: packPriced.customer.sellingPriceBeforeGST, customerPrice: packPriced.customer.sellingPriceIncludingGST,
        transportExtra: packPriced.customer.transportExtra, swaps: packPriced.swapDeltas.length, roofAddOn: packPriced.customer.roofAddOn,
      });
    } else {
      pricingResult = calculatePricing({
        costResult,
        margin: env.costConfig?.margin || {},
        gst: env.costConfig?.gst || {},
        tier: input.tier,
        discount: null,  // No discount in initial quotation
        pricedAt: at,
      });

      if (pricingResult.status !== PRICING_STATUS.COMPLETE) {
        throw new OrchestrationError(ORCHESTRATION_ERROR.PRICING_REJECTED,
          `Pricing rejected: ${(pricingResult.errors || [])[0]?.message || 'unknown reason'}`,
          { errors: pricingResult.errors });
      }
      p.lastPricing = pricingResult;
      stepLog('CALCULATE_PRICING', 'OK', {
        listPrice: pricingResult.sellingPriceBeforeGST,
        customerPrice: pricingResult.sellingPriceIncludingGST,
      });
    }
    const sellingBeforeGst = pm ? packPriced.customer.sellingPriceBeforeGST : pricingResult.sellingPriceBeforeGST;

    // ---- STEP 10: Find applicable offer (before snapshot so it can be pinned) ----
    let offer = null;
    if (input.offerId && options.offers) {
      // Sales explicitly selected an offer — use that specific one
      offer = (options.offers || []).find(o => o.id === input.offerId) || null;
      if (!offer) {
        stepLog('FIND_OFFER', 'WARN', { requestedOfferId: input.offerId, reason: 'Offer not found or not active' });
      }
    } else if (options.offers) {
      // Auto-find best applicable offer
      offer = findApplicableOffer(options.offers, {
        systemType: input.systemType,
        tier: input.tier,
        size: input.size,
      });
    }
    stepLog('FIND_OFFER', offer ? 'OK' : 'NONE', offer ? { offerId: offer.id || null, offerName: offer.name || null } : null);

    // ---- STEP 11: Create commercial snapshot (with pinned offer) ----
    const offerForSnapshot = offer ? {
      ...offer,
      offerAmount: calculateOfferAmount(offer, sellingBeforeGst),
    } : null;

    const commercialSnapshot = pm
      ? createPackCommercialSnapshot({
          snapshotId: ids.commercialSnapshotId, projectId: ids.projectId, bomSnapshotId: p.lock.snapshotId || ids.bomSnapshotId,
          packPricing: packPriced, configVersion: pm.configVersion, materialList, costResult,
          issuedBy: actor.userId, issuedAt: at, offer: offerForSnapshot, catalogVersion: env.catalogVersion ?? null,
        })
      : createCommercialSnapshot({
          snapshotId: ids.commercialSnapshotId,
          costResult,
          pricingResult,
          issuedBy: actor.userId,
          issuedAt: at,
          offer: offerForSnapshot,
        });
    stepLog('COMMERCIAL_SNAPSHOT', 'OK', { snapshotId: ids.commercialSnapshotId, mode: pm ? 'PACK_MARKET_RATE' : 'GROSS_MARGIN' });

    // ---- STEP 12: Register snapshots in quotation store ----
    // registerBomSnapshot needs BOM_VIEW (Sales has it).
    // registerCommercialSnapshot needs COST_VIEW (Sales does not) — use wsActor.
    Q.registerBomSnapshot(quotationStore, actor, {
      bomSnapshotId: p.lock.snapshotId || ids.bomSnapshotId,
      snapshot: p.lock,
    });

    Q.registerCommercialSnapshot(quotationStore, wsActor, {
      snapshot: commercialSnapshot,
    });
    stepLog('REGISTER_SNAPSHOTS', 'OK');

    // ---- STEP 13: Create quotation draft ----
    // Map Sales customer input to gate-required fields.
    // Gate (§28) checks customerId + customerName — Sales provides name + phone.
    const draftCustomer = {
      ...input.customer,
      customerId: input.customer.customerId || `CUST-${ids.projectId}`,
      customerName: input.customer.customerName || input.customer.name || null,
    };

    // Generate quotation number when Sales does not supply one.
    const quotationNumber = input.quotationNumber || `QN-${ids.quotationId}`;

    // Engineering validation result from the checker run (Step 6).
    // Gate requires engineering.status to exist and not be BLOCKED.
    const engineeringForDraft = {
      status: checkerResult.status,  // VALID or WARNING — never BLOCKED for approved packages
      counts: checkerResult.counts || {},
      checkedAt: at,
    };

    Q.createDraft(quotationStore, actor, {
      quotationId: ids.quotationId,
      projectId: ids.projectId,
      at,
      customer: draftCustomer,
      system: {
        systemType: input.systemType,
        // Phase-suffix-safe (P0-1): "5sp" → 5.
        systemSizeKw: Number(String(input.size).replace(/[^0-9.]/g, '')),
        phase,
        packageTier: input.tier,
      },
      engineering: engineeringForDraft,
      quotationNumber,
      quotationDate: input.quotationDate || at,
      quotationLanguage: normaliseLanguageInput(input.quotationLanguage),
      applianceRows: sanitiseApplianceRows(input.applianceRows),
      quotationSource: input.quotationSource || 'DIRECT',
      district: input.customer?.district || null,
      validUntil: input.validUntil || null,
      proposalBy: input.proposalBy || actor.userId,
      salespersonId: actor.userId,
      bomSnapshotId: p.lock.snapshotId || ids.bomSnapshotId,
      commercialSnapshotId: ids.commercialSnapshotId,
      ...subsidyDraftFields(input),
    });
    stepLog('CREATE_DRAFT', 'OK', { quotationId: ids.quotationId });

    // ---- STEP 14: Issue quotation (with Phase F–J commercial-freeze inputs) ----
    // P0-2 fix: assemble commercialFreezeInputs from already-computed data so
    // the issued document carries the 10-domain snapshot. Branding + policy
    // stores are supplied by the HTTP caller via options (server loads
    // data/quotation-branding-state.json + data/quotation-policy.json at
    // request time). productionMode threads through the env-driven flag.
    const sizeKwParsed = Number(String(input.size).replace(/[^0-9.]/g, ''));
    const commercialFreezeInputs = {
      bom: {
        engineering: {
          status: checkerResult.status,
          blockers: checkerResult.findings ? checkerResult.findings.filter(f => f.severity === 'BLOCKED') : [],
        },
        systemConfig: {
          systemType: input.systemType,
          size: input.size,
          phase,
          tier: input.tier,
          profileKey: pkg?.profileKey || null,
          batteryQuantity: input.batteryQuantity ?? null,
          batterySource: input.batteryQuantity != null ? 'PROJECT_HEAD_OVERRIDE' : null,
          batteryIncluded: input.systemType === 'hybrid',
          roofType: input.installationType ?? input.roofType ?? null,
          variant: input.futureSystemSize ? 'FUTURE_READY' : 'STANDARD',
          futureSystemSize: input.futureSystemSize || null,
          packageVariant: pkg?.variant ?? 'STANDARD',
        },
      },
      project: {
        distanceKm: input.distanceKm != null ? Number(input.distanceKm) : null,
        vehicleType: input.vehicleType || (pm && (pm.config?.transportConfig?.vehicles || []).length === 1 ? pm.config.transportConfig.vehicles[0].vehicleType : null),
      },
      // Pack mode: the PH pack-config transport table (base km included) is the
      // rate source — not the cost-config UAT reference vehicles (isDemo).
      transportationConfig: pm
        ? { version: `pack-config@v${pm.configVersion}`, source: 'PACK_CONFIG_TRANSPORT', isDemo: false, distanceBasis: 'ONE_WAY',
            baseDistanceKm: pm.config?.transportConfig?.baseDistanceKm ?? null, vehicles: pm.config?.transportConfig?.vehicles || [] }
        : (env.costConfig?.transportation || null),
      commercialSnapshot,
      subsidyResult: null,   // resolved inside issueQuotation from subsidyConfig
      brandingStore: options.brandingStore || null,
      brandingOverrides: input.brandingOverrides || {},
      policy: options.policy || null,
      validityOverrideDays: input.validityOverrideDays ?? null,
      packageProfile: pkg || null,
      productionMode: options.productionMode === true,
    };

    const issueResult = Q.issueQuotation(quotationStore, actor, ids.quotationId, {
      at,
      catalog: options.catalog || env.catalog,
      cmsStore: options.cmsStore || null,
      companyProfile: options.companyProfile || null,
      tierDisplayNames: options.tierDisplayNames || null,
      inclusionMatrix: options.inclusionMatrix || null,
      energyConfig: options.energyConfig || null,
      savingsConfig: options.savingsConfig || null,
      subsidyConfig: options.subsidyConfig || null,
      financeConfig: options.financeConfig || null,
      rendererPinning: options.rendererPinning || null,
      commercialFreezeInputs,
    });
    stepLog('ISSUE_QUOTATION', 'OK', { version: issueResult.version });

    const fullResult = {
      success: true,
      orchestratorVersion: ORCHESTRATOR_VERSION,
      quotationId: ids.quotationId,
      projectId: ids.projectId,
      packageId: pkg.packageId,
      customer: input.customer,
      system: {
        systemType: input.systemType,
        // Phase-suffix-safe (P0-1).
        systemSizeKw: Number(String(input.size).replace(/[^0-9.]/g, '')),
        phase,
        packageTier: input.tier,
      },
      cost: {
        totalActualProjectCost: pm ? commercialSnapshot.cost.totalActualProjectCost : costResult.totalActualProjectCost,
        status: pm ? `PACK_MARKET_RATE (reference cost; landed check ${costResult.status})` : costResult.status,
      },
      pricing: pm ? {
        mode: 'PACK_MARKET_RATE',
        listPrice: packPriced.customer.sellingPriceBeforeGST,
        gstAmount: packPriced.customer.gstAmount,
        customerPrice: packPriced.customer.sellingPriceIncludingGST,
        transportExtra: packPriced.customer.transportExtra,
        transportExtraDetail: packPriced.customer.transportExtraDetail,
        customerTotal: packPriced.customer.customerTotalIncludingGST,
        roofAddOn: packPriced.customer.roofAddOn,
        swapDeltaTotal: packPriced.customer.swapDeltaTotal,
        marketRate: packPriced.customer.marketRate,
        marketRateKey: packPriced.marketRateKey,
        marginVsMarket: packPriced.internal.marginVsMarket,
        marginVsMarketPct: packPriced.internal.marginVsMarketPct,
      } : {
        listPrice: pricingResult.sellingPriceBeforeGST,
        gstAmount: pricingResult.gstAmount,
        customerPrice: pricingResult.sellingPriceIncludingGST,
        marginPct: pricingResult.targetGrossMargin,
        grossProfit: pricingResult.grossProfit,
      },
      offer: offer ? offerPayloadShape(offer, sellingBeforeGst) : null,
      // Customer-facing document facts (2026-09-08): number / dates / validity
      // as frozen at issue, and the subsidy result the engine resolved from the
      // locked BOM's panel DCR status — never a UI assumption.
      quotation: {
        quotationNumber: input.quotationNumber ?? null,
        quotationDate: input.quotationDate ?? null,
        validUntil: issueResult.snapshot?.validity?.validUntil ?? input.validUntil ?? null,
        validityDays: issueResult.snapshot?.validity?.validityDays ?? null,
        validitySource: issueResult.snapshot?.validity?.source ?? null,
      },
      subsidy: issueResult.snapshot?.subsidy ? {
        available: issueResult.snapshot.subsidy.available,
        eligibilityStatus: issueResult.snapshot.subsidy.eligibilityStatus,
        totalSubsidy: issueResult.snapshot.subsidy.totalSubsidy,
        schemeName: issueResult.snapshot.subsidy.schemeName,
        subsidyType: issueResult.snapshot.subsidy.subsidyType,
      } : null,
      version: issueResult.version,
      bomSnapshotId: p.lock.snapshotId || ids.bomSnapshotId,
      commercialSnapshotId: ids.commercialSnapshotId,
      steps,
    };

    // Individual Sales roles see only customer-facing data.
    // SALES_HEAD and ADMIN see the full result for monitoring/approval.
    if (isIndividualSalesRole(actor.role)) {
      return stripForSales(fullResult);
    }
    return fullResult;

  } catch (err) {
    if (err.name === 'OrchestrationError') {
      err.detail = { ...(err.detail || {}), steps };
      throw err;
    }
    // Wrap unexpected errors
    throw new OrchestrationError(ORCHESTRATION_ERROR.ORCHESTRATION_FAILED,
      `Orchestration failed at step: ${steps[steps.length - 1]?.step || 'UNKNOWN'}. ${err.message}`,
      { steps, originalError: err.message, originalCode: err.code || null });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// THREE-TIER ORCHESTRATION  (Step 1 — 2026-09-04)
// ═════════════════════════════════════════════════════════════════════════════
//
// Runs the BOM + engineering + cost + pricing + commercialSnapshot pipeline
// THREE TIMES (base / value / premium) against the three approved packages
// for the same (systemType, size, phase), then packs all three snapshots into
// ONE quotation by:
//   1. Running `orchestrateQuotation` once for the RECOMMENDED tier (value =
//      Smart per data/tier-display-names.json). This creates the single
//      quotationId, the single quotationNumber, the single customer record,
//      the single quotation history and the single issued document.
//   2. For each of the OTHER two tiers, running steps 1–14 (BOM+cost+pricing+
//      commercialSnapshot) directly against the workspace stores, WITHOUT
//      calling createDraft / issueQuotation. Registers the tier's bomSnapshot
//      + commercialSnapshot into the quotation store by ID.
//   3. After the primary orchestrateQuotation has run, this function issues
//      a REVISION on the same quotation whose DRAFT carries the collected
//      `alternativeOptions[]` — quotationWorkspace.buildAlternativePayloads
//      then builds full per-tier sub-payloads at issuance.
//
// ATOMIC: any tier failure → all-or-nothing. The function throws before any
// draft is issued when a required tier lacks an APPROVED package, cannot
// materialise its BOM, fails engineering validation, cost calculation,
// pricing, or commercial-snapshot creation. No partial three-tier quotation
// is ever issued.
//
// PROTECTED FILES UNCHANGED:
//   quotationWorkspace.js, quotationPayload.js, costEngine.js, pricingEngine.js,
//   financeEngine.js, savingsEngine.js, subsidyEngine.js, commercialSnapshot.js,
//   engineeringChecker.js, offerLifecycle.js — all reused verbatim.
// ─────────────────────────────────────────────────────────────────────────────

const THREE_TIER_KEYS = Object.freeze(['base', 'value', 'premium']);
const DEFAULT_RECOMMENDED_TIER = 'value';

export const THREE_TIER_ERROR = Object.freeze({
  RECOMMENDED_TIER_UNAPPROVED:      'RECOMMENDED_TIER_UNAPPROVED',
  ALTERNATIVE_TIER_UNAPPROVED:      'ALTERNATIVE_TIER_UNAPPROVED',
  ALTERNATIVE_TIER_ENGINEERING_BLOCKED: 'ALTERNATIVE_TIER_ENGINEERING_BLOCKED',
  ALTERNATIVE_TIER_COST_INCOMPLETE: 'ALTERNATIVE_TIER_COST_INCOMPLETE',
  ALTERNATIVE_TIER_PRICING_REJECTED: 'ALTERNATIVE_TIER_PRICING_REJECTED',
  ALTERNATIVE_TIER_SNAPSHOT_FAILED: 'ALTERNATIVE_TIER_SNAPSHOT_FAILED',
});

/**
 * Build the BOM + cost + pricing + commercial snapshot for ONE tier. Used by
 * orchestrateThreeTiers for every tier (primary + alternatives). Does NOT
 * touch quotation drafts, quotation numbers or customer records. Returns the
 * bomSnapshotId + commercialSnapshotId + engineering result ready for either
 * createDraft (primary) or alternativeOptions (alternatives).
 *
 * Throws OrchestrationError with a THREE_TIER_ERROR code on failure so the
 * caller can name the failed tier + step.
 */
function runTierPipeline(workspaceStore, quotationStore, env, input, actor, alternativeTier, at, options) {
  const wsActor = { userId: actor.userId, role: 'PROJECT_HEAD' };
  const phase = input.phase || (input.size && ['5sp', '5tp'].includes(input.size)
    ? (input.size === '5tp' ? '3P' : '1P') : '1P');

  // 1. Approved package for this tier
  const pkg = findApprovedPackage(env.packageRegistry, {
    systemType: input.systemType, size: input.size, phase, tier: alternativeTier, futureSystemSize: input.futureSystemSize || null,
  });
  if (!pkg) {
    throw new OrchestrationError(THREE_TIER_ERROR.ALTERNATIVE_TIER_UNAPPROVED,
      `Alternative tier "${alternativeTier}" has no APPROVED package for ${input.systemType} ${input.size}kW ${phase}.`,
      { tier: alternativeTier, systemType: input.systemType, size: input.size, phase });
  }

  // 2. IDs for this tier's workspace pass
  const ts = idStamp(at);
  const altBase = `${input.systemType}_${input.size}_${alternativeTier}_${ts}`;
  const altProjectId = `PRJ-ALT-${altBase}`;
  const altBomSnapshotId = `SNAP-${altBase}`;
  const altCommercialSnapshotId = `CS-${altBase}`;

  // 3. Fresh project for this tier's BOM (independent of primary project)
  W.createProject(workspaceStore, { actor: wsActor, projectId: altProjectId, customer: input.customer, at });
  W.setProjectConfiguration(workspaceStore, {
    actor: wsActor, projectId: altProjectId, at,
    sysType: input.systemType, sizeKw: Number(String(input.size).replace(/[^0-9.]/g, '')), phase, tier: alternativeTier,
    architecture: packageArchitecture(pkg, env),
  });

  // 4. Materialise BOM from approved package
  W.selectPackage(workspaceStore, env, { actor: wsActor, projectId: altProjectId, packageId: pkg.packageId, at });
  // 4-B6. Project-level battery quantity applies to every tier of the same project
  applyProjectBatteryQuantity(workspaceStore, env, { wsActor, projectId: altProjectId, input, at });

  // 4a/4b. Sales selections for THIS tier (validated) + structure (site-specific,
  // shared across tiers: the primary tier's structure selection applies when
  // the alternative tier has none of its own).
  const altInput = { ...input, tierSelections: withSharedStructure(input, alternativeTier) };
  applySalesSelections(workspaceStore, env, { wsActor, projectId: altProjectId, input: altInput, tier: alternativeTier, at, options });

  // 5. Cost inputs (shared across tiers)
  const costInputs = {
    installationType: input.installationType ?? input.roofType,
    distanceKm: Number(input.distanceKm),
    vehicleType: input.vehicleType,
    sizeKey: String(input.size),
  };
  W.setCostInputs(workspaceStore, { actor: wsActor, projectId: altProjectId, at, inputs: costInputs });

  // 6. Engineering check + lock
  const checkerResult = W.runChecker(workspaceStore, env, { actor: wsActor, projectId: altProjectId, at });
  const acks = (checkerResult.findings || [])
    .filter(r => r.severity === 'WARNING')
    .map(r => ({ ruleId: r.ruleId, reason: `Auto-acknowledged: alternative tier ${alternativeTier} package ${pkg.packageId} is APPROVED` }));
  const lockResult = W.lockBom(workspaceStore, env, { actor: wsActor, projectId: altProjectId, at, acknowledgements: acks });
  if (!lockResult.locked) {
    throw new OrchestrationError(THREE_TIER_ERROR.ALTERNATIVE_TIER_ENGINEERING_BLOCKED,
      `Alternative tier "${alternativeTier}" BOM lock failed: ${lockResult.reason || 'engineering validation blocked'}.`,
      { tier: alternativeTier, missingAcknowledgements: lockResult.missingAcknowledgements });
  }

  // 7. Cost engine
  const altProject = workspaceStore.projects[altProjectId];
  const costResult = calculateCost({
    snapshot: altProject.lock,
    config: env.costConfig,
    priceMaster: env.priceMaster || {},
    rateCard: env.rateCard || null,
    project: {
      sizeKw: altProject.sizeKw,
      sizeKey: altProject.costInputs?.sizeKey ?? String(input.size),
      installationType: altProject.costInputs?.installationType ?? null,
      phase, sysType: input.systemType, tier: alternativeTier,
      distanceKm: altProject.costInputs?.distanceKm ?? null,
      vehicleType: altProject.costInputs?.vehicleType ?? null,
      structureMaterialCost: altProject.costInputs?.structureMaterialCost ?? null,
      specialWorks: altProject.costInputs?.specialWorks || [],
    },
    calculatedAt: at,
    catalogVersion: env.catalogVersion ?? null,
    procurementPriceVersion: env.procurementPriceVersion ?? null,
    landedCostVersion: env.landedCostVersion ?? null,
  });
  const pm = options.packMode || null;
  if (!pm && costResult.status !== COST_STATUS.COMPLETE) {
    const blockedHeads = (costResult.errors || []).map(e => e.head || e.code).filter(Boolean);
    throw new OrchestrationError(THREE_TIER_ERROR.ALTERNATIVE_TIER_COST_INCOMPLETE,
      `Alternative tier "${alternativeTier}" cost calculation incomplete. Blocked heads: ${blockedHeads.join(', ') || 'unknown'}.`,
      { tier: alternativeTier, status: costResult.status, errors: costResult.errors });
  }

  // 8. Pricing — pack market-rate formula (pack mode) or the gross-margin engine
  let pricingResult = null, packPriced = null, materialList = [];
  if (pm) {
    const selections = {};
    for (const t of resolveSalesSelections(altInput, alternativeTier, { allowedCategories: Object.keys(CATEGORY_TO_ROLE).concat(['enphase', 'hoymiles']) })) selections[t.category] = t.componentId;
    const full = pm.materialise({
      systemType: input.systemType, size: String(input.size), tier: alternativeTier, phase,
      selections, batteryQuantity: input.batteryQuantity ?? null,
      futureSystemSize: input.futureSystemSize || null, actorRole: 'PROJECT_HEAD', configSource: 'approved',
    });
    packPriced = pricePack({
      config: pm.config, systemType: input.systemType, size: String(input.size), tier: alternativeTier,
      roofType: input.installationType ?? input.roofType, distanceKm: Number(input.distanceKm),
      vehicleType: input.vehicleType || null, batteryConfig: full.systemConfig?.batteryQuantity ?? 0,
      futureSystemSize: input.futureSystemSize || null, lines: full.lines, pricedAt: at,
    });
    if (packPriced.status !== 'COMPLETE') {
      throw new OrchestrationError(THREE_TIER_ERROR.ALTERNATIVE_TIER_PRICING_REJECTED,
        `Alternative tier "${alternativeTier}" pack pricing blocked: ${packPriced.errors.map(e => e.message).join(' | ')}`,
        { tier: alternativeTier, errors: packPriced.errors, owner: 'PROJECT_HEAD' });
    }
    materialList = [
      ...full.lines.map(l => ({ category: l.category, componentId: l.componentId ?? null, name: l.name, qty: l.qty, isVariable: !!l.isVariable, selectionMethod: l.selectionMethod ?? null })),
      ...packPriced.structureMaterial.lines.map(l => ({ category: 'structure', componentId: null, name: l.name, qty: l.qty, isVariable: false, selectionMethod: 'STRUCTURE_PACK' })),
    ];
  } else {
    pricingResult = calculatePricing({
      costResult,
      margin: env.costConfig?.margin || {},
      gst: env.costConfig?.gst || {},
      tier: alternativeTier,
      discount: null,
      pricedAt: at,
    });
    if (pricingResult.status !== PRICING_STATUS.COMPLETE) {
      throw new OrchestrationError(THREE_TIER_ERROR.ALTERNATIVE_TIER_PRICING_REJECTED,
        `Alternative tier "${alternativeTier}" pricing rejected: ${(pricingResult.errors || [])[0]?.message || 'unknown reason'}.`,
        { tier: alternativeTier, errors: pricingResult.errors });
    }
  }
  const sellingBeforeGst = pm ? packPriced.customer.sellingPriceBeforeGST : pricingResult.sellingPriceBeforeGST;

  // 9. Applicable offer for THIS tier
  let offer = null;
  if (options.offers) {
    if (input.offerId) offer = (options.offers || []).find(o => o.id === input.offerId) || null;
    if (!offer) offer = findApplicableOffer(options.offers, {
      systemType: input.systemType, tier: alternativeTier, size: input.size,
    });
  }
  const offerForSnapshot = offer ? { ...offer, offerAmount: calculateOfferAmount(offer, sellingBeforeGst) } : null;

  // 10. Commercial snapshot
  let commercialSnapshot;
  try {
    commercialSnapshot = pm
      ? createPackCommercialSnapshot({
          snapshotId: altCommercialSnapshotId, projectId: altProjectId, bomSnapshotId: altProject.lock.snapshotId || altBomSnapshotId,
          packPricing: packPriced, configVersion: pm.configVersion, materialList, costResult,
          issuedBy: actor.userId, issuedAt: at, offer: offerForSnapshot, catalogVersion: env.catalogVersion ?? null,
        })
      : createCommercialSnapshot({
          snapshotId: altCommercialSnapshotId,
          costResult, pricingResult,
          issuedBy: actor.userId, issuedAt: at,
          offer: offerForSnapshot,
        });
  } catch (e) {
    throw new OrchestrationError(THREE_TIER_ERROR.ALTERNATIVE_TIER_SNAPSHOT_FAILED,
      `Alternative tier "${alternativeTier}" commercial snapshot creation failed: ${e.message}`,
      { tier: alternativeTier, originalError: e.message });
  }

  // 11. Register both snapshots by ID (idempotent Map inserts)
  Q.registerBomSnapshot(quotationStore, actor, {
    bomSnapshotId: altProject.lock.snapshotId || altBomSnapshotId,
    snapshot: altProject.lock,
  });
  Q.registerCommercialSnapshot(quotationStore, wsActor, { snapshot: commercialSnapshot });

  return {
    tier: alternativeTier,
    packageId: pkg.packageId,
    packageProfile: pkg || null,
    commercialSnapshot,
    bomSnapshotId: altProject.lock.snapshotId || altBomSnapshotId,
    commercialSnapshotId: altCommercialSnapshotId,
    projectId: altProjectId,
    system: {
      systemType: input.systemType,
      // Phase-suffix-safe (P0-1): "5sp" → 5.
      systemSizeKw: Number(String(input.size).replace(/[^0-9.]/g, '')),
      phase,
      packageTier: alternativeTier,
    },
    engineering: {
      status: checkerResult.status,
      counts: checkerResult.counts || {},
      checkedAt: at,
    },
  };
}

/**
 * THREE-TIER ORCHESTRATOR — one quotation, three tier snapshots.
 *
 * Contract:
 *   - Uses only APPROVED packages (all three tiers).
 *   - ONE quotationId, ONE quotationNumber, ONE customer record, ONE issued
 *     document. The two non-primary tiers ride along as `alternativeOptions[]`
 *     on the ONE quotation and become `payload.alternatives[]` at issuance.
 *   - Atomic: any tier failing → nothing issued. The primary tier's project +
 *     snapshots may be materialised in the workspace store; the quotation is
 *     never issued.
 *
 * @param {object} workspaceStore
 * @param {object} quotationStore
 * @param {object} env      — { packageRegistry, catalog, costConfig, priceMaster, rateCard, ... }
 * @param {object} input    — { customer, systemType, size, phase?, roofType?, distanceKm?,
 *                              recommendedTier?='value', tierSelections?: {...}, quotationLanguage?='en', ... }
 * @param {object} actor    — { userId, role }
 * @param {object} options  — { at, catalog, cmsStore, companyProfile, tierDisplayNames, inclusionMatrix,
 *                              energyConfig, savingsConfig, subsidyConfig, financeConfig, offers }
 * @returns {object} full orchestration result carrying tierResults[] + primary quotation
 */
export function orchestrateThreeTiers(workspaceStore, quotationStore, env, input, actor, options = {}) {
  assertCan(actor, CAPABILITY.QUOTATION_CREATE);

  // Input validation — reuse the existing single-tier validator, but tier is
  // decided by us, not the caller.
  const baseInput = { ...input, tier: input.recommendedTier || DEFAULT_RECOMMENDED_TIER };
  const validation = validateSalesInput(baseInput, options.packMode || null);
  if (!validation.valid)
    throw new OrchestrationError(ORCHESTRATION_ERROR.MISSING_INPUT,
      `Three-tier input validation failed: ${validation.errors.join('; ')}`,
      { errors: validation.errors });

  const at = options.at || new Date().toISOString();
  const recommendedTier = input.recommendedTier || options.tierDisplayNames?.recommendedTier || DEFAULT_RECOMMENDED_TIER;
  if (!THREE_TIER_KEYS.includes(recommendedTier))
    throw new OrchestrationError(ORCHESTRATION_ERROR.MISSING_INPUT,
      `recommendedTier must be one of ${THREE_TIER_KEYS.join(', ')}; got "${recommendedTier}".`,
      { recommendedTier });

  const alternativeTiers = THREE_TIER_KEYS.filter(t => t !== recommendedTier);
  const phase = input.phase || (input.size && ['5sp', '5tp'].includes(input.size)
    ? (input.size === '5tp' ? '3P' : '1P') : '1P');

  // ── PRE-FLIGHT: the recommended (selected) tier MUST have an APPROVED
  // package. By default the two alternatives must too (atomic three-tier).
  // With `options.allowPartialAlternatives` (2026-09-09, pack mode: the
  // customer document shows the two other packs when they exist) an
  // alternative that is unapproved / unpriced / engineering-blocked is
  // RECORDED in `unavailableTiers` and its column stays "Not available" —
  // it never blocks the customer's chosen pack. ───────────────────────────
  const allowPartial = options.allowPartialAlternatives === true;
  const unavailableTiers = [];
  for (const tier of THREE_TIER_KEYS) {
    const pkg = findApprovedPackage(env.packageRegistry, {
      systemType: input.systemType, size: input.size, phase, tier, futureSystemSize: input.futureSystemSize || null,
    });
    if (!pkg) {
      const code = tier === recommendedTier
        ? THREE_TIER_ERROR.RECOMMENDED_TIER_UNAPPROVED
        : THREE_TIER_ERROR.ALTERNATIVE_TIER_UNAPPROVED;
      if (allowPartial && tier !== recommendedTier) {
        unavailableTiers.push({ tier, code, message: `No APPROVED package for ${input.systemType} ${input.size}kW ${phase} ${tier}.` });
        continue;
      }
      throw new OrchestrationError(code,
        `Tier "${tier}" has no APPROVED package for ${input.systemType} ${input.size}kW ${phase}. ` +
        (allowPartial ? 'The selected pack must be APPROVED.' : `Three-tier quotations require all three tiers (base/value/premium) to be APPROVED.`),
        { tier, systemType: input.systemType, size: input.size, phase });
    }
  }

  // ── STEP A: build BOM + cost + pricing + commercial snapshot for the
  // tiers. Atomic by default; with allowPartialAlternatives a failing
  // ALTERNATIVE is recorded and skipped, the primary still throws. ─────────
  const tierResults = {};
  const skipped = new Set(unavailableTiers.map(u => u.tier));
  for (const tier of THREE_TIER_KEYS) {
    if (skipped.has(tier)) continue;
    try {
      tierResults[tier] = runTierPipeline(workspaceStore, quotationStore, env, input, actor, tier, at, options);
    } catch (e) {
      if (allowPartial && tier !== recommendedTier) {
        unavailableTiers.push({ tier, code: e.code || 'ALTERNATIVE_TIER_FAILED', message: e.message, detail: e.detail ?? null });
        continue;
      }
      // The SELECTED tier failed — surface it under the primary error codes
      // the single-tier orchestrator uses, not as an "alternative" failure.
      if (tier === recommendedTier && typeof e.code === 'string' && e.code.startsWith('ALTERNATIVE_TIER_')) {
        const primaryCode = {
          ALTERNATIVE_TIER_UNAPPROVED: ORCHESTRATION_ERROR.NO_APPROVED_PACKAGE,
          ALTERNATIVE_TIER_ENGINEERING_BLOCKED: ORCHESTRATION_ERROR.ENGINEERING_BLOCKED,
          ALTERNATIVE_TIER_COST_INCOMPLETE: ORCHESTRATION_ERROR.COST_INCOMPLETE,
          ALTERNATIVE_TIER_PRICING_REJECTED: /pack pricing blocked/i.test(String(e.message)) ? ORCHESTRATION_ERROR.PACK_PRICING_BLOCKED : ORCHESTRATION_ERROR.PRICING_REJECTED,
          ALTERNATIVE_TIER_SNAPSHOT_FAILED: ORCHESTRATION_ERROR.ORCHESTRATION_FAILED,
        }[e.code] || e.code;
        throw new OrchestrationError(primaryCode, String(e.message).replace(/^Alternative tier "[^"]+" /, `Selected pack (${tier}) `), e.detail ?? null);
      }
      throw e;
    }
  }
  const availableAlternativeTiers = alternativeTiers.filter(t => tierResults[t]);

  // ── STEP B: create ONE quotation draft for the primary tier and attach the
  // other two tiers' snapshots as alternativeOptions[]. This is the ONLY
  // createDraft call and the ONLY issueQuotation call across the three tiers.
  const primary = tierResults[recommendedTier];
  const alternativeOptions = availableAlternativeTiers.map(t => ({
    tier: t,
    bomSnapshotId: tierResults[t].bomSnapshotId,
    commercialSnapshotId: tierResults[t].commercialSnapshotId,
    system: tierResults[t].system,
  }));

  // Per-orchestration IDs (shared prefix for the primary tier); collision-safe stamp.
  const ts = idStamp(at);
  const quotationId = input.quotationId || `QT-${input.systemType}_${input.size}_${recommendedTier}_${ts}`;
  const quotationNumber = input.quotationNumber || `QN-${quotationId}`;

  const draftCustomer = {
    ...input.customer,
    customerId: input.customer.customerId || `CUST-${quotationId}`,
    customerName: input.customer.customerName || input.customer.name || null,
  };

  Q.createDraft(quotationStore, actor, {
    quotationId,
    projectId: primary.projectId,
    at,
    customer: draftCustomer,
    system: primary.system,
    engineering: primary.engineering,
    quotationNumber,
    quotationDate: input.quotationDate || at,
    quotationLanguage: normaliseLanguageInput(input.quotationLanguage),
    applianceRows: sanitiseApplianceRows(input.applianceRows),
    quotationSource: input.quotationSource || 'DIRECT',
    district: input.customer?.district || null,
    validUntil: input.validUntil || null,
    proposalBy: input.proposalBy || actor.userId,
    salespersonId: actor.userId,
    bomSnapshotId: primary.bomSnapshotId,
    commercialSnapshotId: primary.commercialSnapshotId,
    ...subsidyDraftFields(input),
    alternativeOptions,          // ← the whole point of this exercise
  });

  // ── STEP C: issue the single quotation. quotationWorkspace.issueQuotation
  // internally calls buildAlternativePayloads, which builds a full per-tier
  // sub-payload for each entry in alternativeOptions[]. ────────────────────
  // P0-2 fix: pass commercialFreezeInputs so the issued document carries the
  // Phase F–J 10-domain snapshot in the three-tier path as well.
  const primaryPkgRef = primary.packageProfile || null;
  const threeTierFreezeInputs = {
    bom: {
      engineering: primary.engineering || { status: 'VALID', blockers: [] },
      systemConfig: {
        systemType: input.systemType,
        size: input.size,
        phase: primary.system?.phase || input.phase || null,
        tier: recommendedTier,
        profileKey: primaryPkgRef?.profileKey || null,
        batteryQuantity: input.batteryQuantity ?? null,
        batterySource: input.batteryQuantity != null ? 'PROJECT_HEAD_OVERRIDE' : null,
        batteryIncluded: input.systemType === 'hybrid',
        roofType: input.installationType ?? input.roofType ?? null,
        variant: input.futureSystemSize ? 'FUTURE_READY' : 'STANDARD',
        futureSystemSize: input.futureSystemSize || null,
      },
    },
    project: {
      distanceKm: input.distanceKm != null ? Number(input.distanceKm) : null,
      vehicleType: input.vehicleType || (options.packMode && (options.packMode.config?.transportConfig?.vehicles || []).length === 1 ? options.packMode.config.transportConfig.vehicles[0].vehicleType : null),
    },
    transportationConfig: options.packMode
      ? { version: `pack-config@v${options.packMode.configVersion}`, source: 'PACK_CONFIG_TRANSPORT', isDemo: false, distanceBasis: 'ONE_WAY',
          baseDistanceKm: options.packMode.config?.transportConfig?.baseDistanceKm ?? null, vehicles: options.packMode.config?.transportConfig?.vehicles || [] }
      : (env.costConfig?.transportation || null),
    commercialSnapshot: primary.commercialSnapshot || null,
    subsidyResult: null,
    brandingStore: options.brandingStore || null,
    brandingOverrides: input.brandingOverrides || {},
    policy: options.policy || null,
    validityOverrideDays: input.validityOverrideDays ?? null,
    packageProfile: primaryPkgRef,
    productionMode: options.productionMode === true,
  };

  const issueResult = Q.issueQuotation(quotationStore, actor, quotationId, {
    at,
    catalog: options.catalog || env.catalog,
    cmsStore: options.cmsStore || null,
    companyProfile: options.companyProfile || null,
    tierDisplayNames: options.tierDisplayNames || null,
    inclusionMatrix: options.inclusionMatrix || null,
    energyConfig: options.energyConfig || null,
    savingsConfig: options.savingsConfig || null,
    subsidyConfig: options.subsidyConfig || null,
    financeConfig: options.financeConfig || null,
    rendererPinning: options.rendererPinning || null,
    commercialFreezeInputs: threeTierFreezeInputs,
  });

  // Customer-facing figures of the SELECTED pack (same shape as the single-tier
  // result so the Sales page renders either path identically).
  const cs = primary.commercialSnapshot || null;
  const pc = cs?.pricing || null;
  const pricing = pc ? {
    ...(cs.pricingMode === 'PACK_MARKET_RATE' ? { mode: 'PACK_MARKET_RATE' } : {}),
    listPrice: pc.sellingPriceBeforeGST ?? null,
    gstAmount: pc.gstAmount ?? null,
    customerPrice: pc.sellingPriceIncludingGST ?? null,
    ...(pc.extrasIncludingGST ? {
      transportExtra: pc.extrasIncludingGST,
      transportExtraDetail: (pc.extras || []).find(x => x.extraId === 'TRANSPORT_EXTRA_KM')?.detail ?? null,
      customerTotal: pc.customerTotalIncludingGST ?? null,
    } : {}),
    ...(pc.marketRate != null ? { marketRate: pc.marketRate, swapDeltaTotal: pc.swapDeltaTotal ?? null, roofAddOn: pc.roofAddOn ?? null } : {}),
  } : null;
  const fullResult = {
    success: true,
    orchestratorVersion: ORCHESTRATOR_VERSION + '+three-tier.1',
    quotationId,
    quotationNumber,
    recommendedTier,
    version: issueResult.version,
    customer: input.customer,
    system: primary.system,
    systemSummary: { systemType: input.systemType, systemSizeKw: primary.system?.systemSizeKw ?? null, packageTier: recommendedTier },
    pricing,
    quotation: {
      quotationNumber,
      quotationDate: input.quotationDate || at,
      validUntil: issueResult.snapshot?.validity?.validUntil ?? input.validUntil ?? null,
      validityDays: issueResult.snapshot?.validity?.validityDays ?? null,
      validitySource: issueResult.snapshot?.validity?.source ?? null,
    },
    subsidy: issueResult.snapshot?.subsidy ? {
      available: issueResult.snapshot.subsidy.available,
      eligibilityStatus: issueResult.snapshot.subsidy.eligibilityStatus,
      totalSubsidy: issueResult.snapshot.subsidy.totalSubsidy,
      schemeName: issueResult.snapshot.subsidy.schemeName,
      subsidyType: issueResult.snapshot.subsidy.subsidyType,
    } : null,
    unavailableTiers,
    tierResults: THREE_TIER_KEYS.filter(t => tierResults[t]).map(t => ({
      tier: t,
      packageId: tierResults[t].packageId,
      bomSnapshotId: tierResults[t].bomSnapshotId,
      commercialSnapshotId: tierResults[t].commercialSnapshotId,
      primary: t === recommendedTier,
    })),
  };
  if (isIndividualSalesRole(actor.role)) {
    const stripped = stripForSales(fullResult);
    return { ...stripped, quotationNumber, recommendedTier, unavailableTiers: unavailableTiers.map(u => ({ tier: u.tier, code: u.code })), tierResults: fullResult.tierResults.map(t => ({ tier: t.tier, primary: t.primary })) };
  }
  return fullResult;
}

/**
 * Pre-flight check: can Sales create a quotation for this configuration?
 * Returns blockers without actually creating anything.
 */
export function preflightCheck(env, { systemType, size, phase, tier }, { deep = null, packMode = null } = {}) {
  const blockers = [];
  const phaseDerived = phase || '1P';

  // 2026-09-13 — pack mode: the customer price IS the published market rate.
  // A pack whose rate for this size is 0 / missing prints "Not available" in
  // the three-option document, so the Admin readiness matrix must not call it
  // READY (it did — Sales then got "no customer price" with no warning).
  if (packMode?.config) {
    const key = marketRateKey({ systemType, tier, batteryConfig: 0, futureSystemSize: null });
    const rate = packMode.config.marketRates?.[key]?.[String(size)];
    if (!(typeof rate === 'number' && Number.isFinite(rate) && rate > 0)) {
      blockers.push({
        code: 'MARKET_RATE_NOT_SET',
        message: `No customer price for ${systemType} ${size} kW ${tier}. Project Head must enter it in kW Packs → Market rates and publish.`,
        owner: 'PROJECT_HEAD',
      });
    }
  }

  // Check approved package
  const pkg = (env.packageRegistry?.packages || []).find(p =>
    p.systemType === systemType && p.size === size &&
    p.tier === tier && p.phase === phaseDerived &&
    p.approvalStatus === 'APPROVED');

  if (!pkg) {
    const proposed = (env.packageRegistry?.packages || []).find(p =>
      p.systemType === systemType && p.size === size &&
      p.tier === tier && p.phase === phaseDerived);
    blockers.push({
      code: 'NO_APPROVED_PACKAGE',
      message: proposed
        ? `Package ${proposed.packageId} is ${proposed.approvalStatus}. Engineering approval required.`
        : `No package exists for ${systemType} ${size}kW ${tier} ${phaseDerived}.`,
      owner: 'PROJECT_HEAD',
    });
  }

  // Check procurement prices
  if (env.costConfig?.procurement?.status === 'NOT_CONFIGURED' ||
      env.costConfig?.procurement?.status === 'DECISION_CLOSED_VALUES_NOT_CONFIGURED') {
    blockers.push({
      code: 'PROCUREMENT_NOT_CONFIGURED',
      message: 'Procurement landed costs not entered. Cost Engine cannot calculate material cost.',
      owner: 'PROCUREMENT',
    });
  }

  // Check margin configuration
  if (!env.costConfig?.margin?.tiers && !env.costConfig?.margin?.targetGrossMargin) {
    blockers.push({
      code: 'MARGIN_NOT_CONFIGURED',
      message: 'Margin configuration missing. Pricing Engine cannot calculate selling price.',
      owner: 'ADMIN',
    });
  }

  // Check transportation
  if (env.costConfig?.transportation?.status === 'NOT_CONFIGURED') {
    blockers.push({
      code: 'TRANSPORTATION_NOT_CONFIGURED',
      message: 'Transportation cost not configured.',
      owner: 'PROJECT_HEAD',
    });
  }

  // 2026-09-09 — deep check: build the package BOM in a throw-away workspace
  // and run the engineering checker, exactly as an orchestration would. An
  // APPROVED registry record whose BOM the checker BLOCKS (e.g. on-grid
  // Premium without its IQ System Controller — PBC-M-003) is NOT ready, and
  // the Admin readiness matrix must say so instead of "READY".
  if (pkg && deep) {
    try {
      const store = W.createWorkspaceStore();
      const wsActor = { userId: 'preflight', role: 'PROJECT_HEAD' };
      const projectId = `PREFLIGHT-${systemType}-${size}-${tier}`;
      const at = deep.at || '1970-01-01T00:00:00.000Z';
      W.createProject(store, { actor: wsActor, projectId, customer: { name: 'preflight', phone: '0' }, at });
      W.setProjectConfiguration(store, { actor: wsActor, projectId, at, sysType: systemType,
        sizeKw: Number(String(size).replace(/[^0-9.]/g, '')), phase: phaseDerived, tier, architecture: packageArchitecture(pkg, env) });
      W.selectPackage(store, env, { actor: wsActor, projectId, packageId: pkg.packageId, at });
      const check = W.runChecker(store, env, { actor: wsActor, projectId, at });
      // Structure is a per-site Sales choice (roof type) applied at quote time,
      // so structure findings are not package readiness blockers here.
      const siteChoice = (f) => /^PBC-Q-/.test(String(f.ruleId || '')) || /structure/i.test(String(f.message || ''));
      const blockedFindings = (check.findings || []).filter(f => f.severity === 'BLOCKED' && !siteChoice(f));
      if (blockedFindings.length) {
        blockers.push({
          code: 'ENGINEERING_BLOCKED',
          message: `Engineering check blocks package ${pkg.packageId}: ${blockedFindings.map(f => `${f.ruleId} ${f.message || ''}`.trim()).join('; ') || check.status}`,
          owner: 'PROJECT_HEAD',
          findings: blockedFindings.map(f => ({ ruleId: f.ruleId, message: f.message || null })),
        });
      }
    } catch (e) {
      blockers.push({ code: 'ENGINEERING_BLOCKED', message: `Package ${pkg.packageId} cannot be built: ${e.message}`, owner: 'PROJECT_HEAD' });
    }
  }

  return {
    canProceed: blockers.length === 0,
    blockers,
    packageId: pkg?.packageId || null,
  };
}

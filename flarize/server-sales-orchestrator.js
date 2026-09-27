// SALES ORCHESTRATOR — HTTP TRANSPORT.  (Master Plan — Step 5)
//
// Additive. Registers /api/sales/orchestrate and /api/sales/preflight routes.
// Delegates entirely to src/lib/salesOrchestrator.js — this file is transport only.
//
// RBAC: QUOTATION_CREATE required (enforced in service layer).
// Stores are injected via init() — this module owns no state.

const fs = require('fs');
const path = require('path');

// R1 + R2 (2026-09-04) — approved-template renderer + loader are ESM.
// Same mechanism as server-quotation.js: dynamically imported once at
// first-use and memoized so every ISSUED quotation created by the sales
// orchestrator route carries `document.rendererPinning` frozen at issue time.
let _approvedTemplateModules = null;
async function loadApprovedTemplateModules() {
  if (_approvedTemplateModules) return _approvedTemplateModules;
  const loader   = await import('./src/lib/approvedTemplate.loader.js');
  const renderer = await import('./src/lib/approvedTemplate.js');
  _approvedTemplateModules = {
    getCurrentApprovedTemplatePinning: loader.getCurrentApprovedTemplatePinning,
    APPROVED_TEMPLATE_VERSION: renderer.APPROVED_TEMPLATE_VERSION,
  };
  return _approvedTemplateModules;
}

/**
 * Build the rendererPinning object passed into salesOrchestrator options at
 * orchestration time. Same shape as the one server-quotation.js computes.
 * Returns `null` when the approved-template bundle is not available — the
 * orchestrator issues unpinned in that case (legacy path), matching the
 * fallback behavior of the normal issue route. Warning logged so ops see
 * the reproducibility gap for that issuance.
 */
async function currentRendererPinning() {
  try {
    const { getCurrentApprovedTemplatePinning, APPROVED_TEMPLATE_VERSION } = await loadApprovedTemplateModules();
    const templatePin = getCurrentApprovedTemplatePinning();
    return Object.freeze({ ...templatePin, rendererVersion: APPROVED_TEMPLATE_VERSION });
  } catch (e) {
    console.warn('[sales-orchestrator] rendererPinning unavailable at issue — issuing without R1/R2 pinning. Code:',
      e.code || 'unknown', '·', e.message);
    return null;
  }
}

let SO = null;      // ESM sales orchestrator
let OL = null;      // ESM offer lifecycle
let EE = null;      // ESM energy engine
let RBAC = null;

// Injected getters (set in init)
let _getWorkspaceStore = null;
let _getWorkspaceEnv = null;
let _persistWorkspace = null;
let _getQuotationStore = null;
let _persistQuotation = null;
let _getCompanyProfile = null;
let _getCmsStore = null;

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
}

function dataPath(name) { return path.join(__dirname, 'data', name); }

async function init(options = {}) {
  SO = await import('./src/lib/salesOrchestrator.js');
  OL = await import('./src/lib/offerLifecycle.js');
  EE = await import('./src/lib/energyEngine.js');
  RBAC = await import('./src/lib/rbac.js');
  if (options.getWorkspaceStore) _getWorkspaceStore = options.getWorkspaceStore;
  if (options.getWorkspaceEnv) _getWorkspaceEnv = options.getWorkspaceEnv;
  if (options.persistWorkspace) _persistWorkspace = options.persistWorkspace;
  if (options.getQuotationStore) _getQuotationStore = options.getQuotationStore;
  if (options.persistQuotation) _persistQuotation = options.persistQuotation;
  if (options.getCompanyProfile) _getCompanyProfile = options.getCompanyProfile;
  if (options.getCmsStore) _getCmsStore = options.getCmsStore;
  return true;
}

// actorOf is injected from server-users.js
// §11 — every Sales selection is validated server-side against the approved
// alternatives the package exposes (same resolver the wizard reads through
// GET /api/sales/component-alternatives). Sales-role visibility rules apply
// because the actor here is Sales.
function approvedAlternativesResolver(body, actor) {
  const bomBuilder = require('./server-bom-builder.js');
  return (tier) => {
    try {
      return bomBuilder.getAlternatives({
        systemType: body.systemType, size: body.size, tier, phase: body.phase || undefined, actorRole: actor.role,
        futureSystemSize: body.futureSystemSize || null,
        batteryQuantity: (body.batteryQuantity === 0 || body.batteryQuantity === 1 || body.batteryQuantity === 2) ? body.batteryQuantity : null,
      }).alternatives || {};
    } catch (err) {
      const e = new Error(`Approved alternatives could not be resolved for ${body.systemType}/${body.size}/${tier}: ${err.message}`);
      e.code = 'ALTERNATIVES_UNAVAILABLE';
      throw e;
    }
  };
}

// 2026-09-08 — PACK MARKET-RATE mode (owner's formula) whenever the APPROVED
// pack configuration says so. The orchestrator then prices from the pack
// config + materialised template lines; the landed-cost engine becomes an
// internal check. `materialise` is the same server-side BOM builder Sales
// previews with, run as PROJECT_HEAD at the actual selections.
// Returns null when the approved config is absent or in GROSS_MARGIN mode.
function resolvePackMode() {
  try {
    const packConfig = require('./server-pack-config.js');
    const bomBuilder = require('./server-bom-builder.js');
    const approved = packConfig.getConfig('approved');
    if (approved && approved.pricing?.mode === 'PACK_MARKET_RATE') {
      return {
        config: approved,
        configVersion: packConfig.approvedVersion(),
        materialise: (params) => bomBuilder.buildBom(params),
      };
    }
  } catch { /* pack config transport not initialised */ }
  return null;
}

let _actorOf;
function actorOf(req) {
  if (_actorOf) return _actorOf(req);
  const role = (req.headers || {})['x-actor-role'] || null;
  const userId = (req.headers || {})['x-actor-user'] || null;
  if (!role && !userId) return null;
  return { userId, role };
}

function register(addRoute, { send, parseBody, isAdmin, isAuthenticated: injectedIsAuthenticated, actorOf: injectedActorOf }) {
  if (injectedActorOf) _actorOf = injectedActorOf;
  const _isAuth = injectedIsAuthenticated || isAdmin;
  const guard = (handler) => async (req, res, params, query) => {
    if (!_isAuth(req)) return send(res, 401, { error: 'Unauthorized' });
    if (!SO) return send(res, 503, { error: 'Sales orchestrator not initialised yet' });
    try {
      await handler(req, res, params, query);
    } catch (err) {
      const code = err?.code || null;
      const status = err?.name === 'RbacError' ? 403
        : err?.name === 'OrchestrationError' && code === 'NO_APPROVED_PACKAGE' ? 409
        : err?.name === 'OrchestrationError' && code === 'MISSING_INPUT' ? 400
        : err?.name === 'OrchestrationError' && (code === 'PACK_PRICING_BLOCKED' || code === 'STRUCTURE_PACK_UNRESOLVED') ? 422
        : err?.name === 'OrchestrationError' ? 422
        : code ? 400 : 500;
      send(res, status, { error: err.message, code, detail: err.detail ?? null });
    }
  };

  // ---- Pre-flight check (no side effects) -----------------------------------
  addRoute('GET', '/api/sales/preflight', guard(async (req, res, params, query) => {
    const systemType = query?.get?.('systemType');
    const size = query?.get?.('size');
    const tier = query?.get?.('tier');
    const phase = query?.get?.('phase') || null;

    if (!systemType || !size || !tier) {
      return send(res, 400, { error: 'systemType, size and tier are required query parameters' });
    }

    const env = _getWorkspaceEnv ? _getWorkspaceEnv() : {};
    const result = SO.preflightCheck(env, { systemType, size, phase, tier }, { packMode: resolvePackMode() });
    send(res, 200, result);
  }));

  // ---- Orchestrate quotation (the 1-minute flow) ----------------------------
  addRoute('POST', '/api/sales/orchestrate', guard(async (req, res) => {
    const actor = actorOf(req);
    const body = await parseBody(req);

    // Validate Sales role
    const SALES_ROLES = ['SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES', 'ADMIN'];
    if (!actor || !SALES_ROLES.includes(actor.role)) {
      return send(res, 403, { error: 'Orchestration requires a sales or admin role', code: 'ROLE_DENIED' });
    }

    const workspaceStore = _getWorkspaceStore ? _getWorkspaceStore() : {};
    const quotationStore = _getQuotationStore ? _getQuotationStore() : {};
    const env = _getWorkspaceEnv ? _getWorkspaceEnv() : {};

    // Build options with all downstream dependencies
    const catalog = loadJson(dataPath('catalog.json'), { categories: {} });
    const offers = catalog.offers || [];
    const tierDisplayNames = loadJson(dataPath('tier-display-names.json'), null);
    const inclusionMatrix = loadJson(dataPath('quotation-inclusions.json'), null);
    const energyConfig = loadJson(dataPath('energy-config.json'), null);
    const savingsConfig = loadJson(dataPath('savings-config.json'), null);
    const subsidyConfig = loadJson(dataPath('subsidy-config.json'), null);
    const financeConfig = loadJson(dataPath('finance-config.json'), null);

    // R1 + R2 wiring — compute the approved-template bundle + renderer version
    // pinning ONCE for this orchestration and thread it through the existing
    // options object. salesOrchestrator forwards `options.rendererPinning` to
    // Q.issueQuotation, which freezes it into `document.rendererPinning`.
    // On loader failure this is null and issuance proceeds unpinned (legacy
    // path), matching server-quotation.js behavior.
    const rendererPinning = await currentRendererPinning();

    // P0-2 fix: load branding + validity-policy stores at request time so
    // the orchestrator can assemble commercialFreezeInputs. productionMode
    // is env-driven — never hardcoded.
    const brandingStore = loadJson(dataPath('quotation-branding-state.json'), null);
    const policy = loadJson(dataPath('quotation-policy.json'), null);
    const productionMode = String(process.env.PRODUCTION_MODE || '').toLowerCase() === 'true';

    // §11 approved-alternative resolver + 2026-09-08 pack market-rate mode
    // (see helpers above the route — kept out of the route body on purpose).
    const approvedAlternativesFor = approvedAlternativesResolver(body, actor);
    const packMode = resolvePackMode();
    // The old sales page sends roofType; the orchestrator's site fact is installationType.
    if (body.roofType && !body.installationType) body.installationType = String(body.roofType).toUpperCase();
    // Validity is a Project Head / Admin policy (quotation-policy.json), never a
    // UI constant. When the caller does not supply validUntil, resolve it from the
    // effective policy at the quotation date; NOT_CONFIGURED leaves it null and the
    // frozen snapshot records that (the document then shows no validity date).
    if (!body.validUntil) {
      try {
        const QP = await import('./src/lib/quotationPolicy.js');
        const v = QP.resolveEffectiveValidity(policy, body.validityOverrideDays ?? null, body.quotationDate || body.at || new Date().toISOString());
        body.validUntil = v.validUntil;
      } catch { /* POLICY_NOT_CONFIGURED → stays null */ }
    }

    const options = {
      at: body.at || new Date().toISOString(),
      catalog,
      offers,
      approvedAlternativesFor,
      cmsStore: _getCmsStore ? _getCmsStore() : null,
      companyProfile: _getCompanyProfile ? _getCompanyProfile() : null,
      tierDisplayNames,
      inclusionMatrix,
      energyConfig,
      savingsConfig,
      subsidyConfig,
      financeConfig,
      brandingStore,
      policy,
      productionMode,
      packMode,
      rendererPinning,
    };

    // Pack mode issues the THREE-OPTION document the approved template shows
    // (Elite · Smart · Essential): the selected pack is primary, the other two
    // approved packs of the same size ride along as alternatives; a pack that
    // is unapproved / unpriced stays "Not available" instead of blocking the
    // customer's chosen pack. Sales component changes apply to the selected
    // tier only; alternatives use the Project Head defaults.
    // `threeTier: false` in the body keeps the single-option path.
    let result;
    if (packMode && body.threeTier !== false) {
      const tierSel = body.tierSelections && !['base', 'value', 'premium'].some(k => body.tierSelections[k] && typeof body.tierSelections[k] === 'object')
        ? { [body.tier]: body.tierSelections } : (body.tierSelections || {});
      const threeInput = { ...body, recommendedTier: body.tier, tierSelections: tierSel };
      result = SO.orchestrateThreeTiers(workspaceStore, quotationStore, env, threeInput, actor, { ...options, allowPartialAlternatives: true });
    } else {
      result = SO.orchestrateQuotation(workspaceStore, quotationStore, env, body, actor, options);
    }

    // Persist both stores after successful orchestration
    if (_persistWorkspace) _persistWorkspace();
    if (_persistQuotation) _persistQuotation();

    send(res, 200, result);
  }));

  // ---- Bulk preflight (check all system/tier combinations) ------------------
  addRoute('GET', '/api/sales/preflight-all', guard(async (req, res) => {
    const env = _getWorkspaceEnv ? _getWorkspaceEnv() : {};
    const catalog = loadJson(dataPath('catalog.json'), { categories: {} });
    const templates = catalog.bomTemplates || {};
    const results = {};
    const packMode = resolvePackMode();

    for (const [sysType, tmpl] of Object.entries(templates)) {
      if (sysType === 'upgrade') continue;
      const sizes = Object.keys(tmpl.sizes || {});
      const tiers = tmpl.tiers || ['base', 'value', 'premium'];
      results[sysType] = {};

      for (const size of sizes) {
        results[sysType][size] = {};
        for (const tier of tiers) {
          const threePhase = (tmpl.threePhase || []).includes(size);
          const phase = threePhase ? '3P' : '1P';
          // deep: also builds the BOM + runs the engineering checker (in memory) so
          // the Admin readiness matrix never shows READY for a blocked package.
          results[sysType][size][tier] = SO.preflightCheck(env, { systemType: sysType, size, phase, tier }, { deep: {}, packMode });
        }
      }
    }

    send(res, 200, { results });
  }));

  // ---- System size recommendation from electricity bill ----------------------
  addRoute('GET', '/api/sales/recommend-size', guard(async (req, res, params, query) => {
    if (!EE) return send(res, 503, { error: 'Energy engine not initialised yet' });

    const billAmount = parseFloat(query?.get?.('billAmount'));
    const billingCycle = query?.get?.('billingCycle') || 'monthly';
    const phase = query?.get?.('phase') || 'single';

    if (!billAmount || isNaN(billAmount) || billAmount <= 0) {
      return send(res, 400, { error: 'billAmount is required and must be a positive number' });
    }

    if (!['monthly', 'bimonthly'].includes(billingCycle)) {
      return send(res, 400, { error: 'billingCycle must be "monthly" or "bimonthly"' });
    }

    if (!['single', 'three'].includes(phase)) {
      return send(res, 400, { error: 'phase must be "single" or "three"' });
    }

    const energyConfig = loadJson(dataPath('energy-config.json'), null);
    if (!energyConfig) {
      return send(res, 500, { error: 'Energy configuration not available' });
    }

    const profile = EE.calculateEnergyProfile(
      { billAmount, billingCycle, phase },
      energyConfig
    );

    if (!profile.available) {
      return send(res, 422, {
        error: profile.reason || 'Could not calculate energy profile',
        code: profile.error,
        detail: profile,
      });
    }

    // Build the recommendation response
    const recommendation = {
      recommendedSystemSizeKw: profile.recommendedSystemSizeKw,
      monthlyConsumption: profile.monthlyConsumption,
      annualConsumption: profile.annualConsumption,
      monthlyGeneration: profile.monthlyGeneration,
    };

    // Attempt to calculate estimated monthly savings if savings engine is available
    // The savings calculation is derived from KSEB value of generation
    if (profile.monthlyKsebValueLow != null && profile.monthlyKsebValueHigh != null) {
      recommendation.estimatedMonthlySavingsLow = profile.monthlyKsebValueLow;
      recommendation.estimatedMonthlySavingsHigh = profile.monthlyKsebValueHigh;
      recommendation.estimatedMonthlySavings = Math.round(
        (profile.monthlyKsebValueLow + profile.monthlyKsebValueHigh) / 2
      );
    }

    // Include additional context for the caller
    recommendation.input = { billAmount, billingCycle, phase };
    recommendation.averageTariffRate = profile.averageTariffRate;
    recommendation.regionId = profile.regionId;
    recommendation.engineVersion = profile.engineVersion;

    send(res, 200, recommendation);
  }));
}

module.exports = { init, register };

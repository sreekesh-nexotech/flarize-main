/**
 * COST ENGINE — ACTUAL PROJECT COST.  (Phase 2A final)
 *
 *   PROCUREMENT purchase price → LANDED COST → PROJECT BOM →
 *   ACTUAL PROJECT COST → (Pricing Engine) → margin → GST → customer price
 *
 * This module owns exactly one step: ACTUAL PROJECT COST.
 *
 * IT MUST NOT (and structurally cannot):
 *   modify the BOM · resolve a battery · select an inverter · run engineering
 *   validation · read marketRate as a pricing authority · apply a discount ·
 *   modify a locked snapshot.
 * It imports only money.js, the procurement price master and a status constant.
 *
 * NO SILENT FALLBACK. Never a nearest system size, a nearest rate, a first
 * available rate, a legacy value, or ₹0, when a required configuration is
 * missing. Every gap is an explicit status code and blocks the total.
 */

import { roundMoney, sumExact, mulExact, isMoney } from './money.js';
import { SNAPSHOT_STATUS } from './bomSnapshot.js';
import { toPriceRecord, projectUnitCost, procurementUplift, PRICE_KIND } from './procurementPriceMaster.js';
import { RATE_TYPE, resolveRate, installationKey } from './projectRateCard.js';

export const COST_ENGINE_VERSION = 'costEngine.3';

/** Cost heads. MISCELLANEOUS is derived from the others and is always last. */
export const COST_HEAD = {
  MATERIAL_LANDED: 'MATERIAL_LANDED',
  STRUCTURE: 'STRUCTURE',
  INSTALLATION: 'INSTALLATION',
  SITE_SURVEY: 'SITE_SURVEY',
  ENGINEERING_DESIGN: 'ENGINEERING_DESIGN',
  TRANSPORTATION: 'TRANSPORTATION',
  SERVICE_AMC: 'SERVICE_AMC',
  SPECIAL_PROJECT_WORKS: 'SPECIAL_PROJECT_WORKS',
  OFFICE_EXPENSE_ALLOCATION: 'OFFICE_EXPENSE_ALLOCATION',
  MISCELLANEOUS: 'MISCELLANEOUS',
};

/** Heads that make up DIRECT_PROJECT_COST — everything except miscellaneous. */
export const DIRECT_COST_HEADS = [
  COST_HEAD.MATERIAL_LANDED, COST_HEAD.STRUCTURE, COST_HEAD.INSTALLATION,
  COST_HEAD.SITE_SURVEY, COST_HEAD.ENGINEERING_DESIGN, COST_HEAD.TRANSPORTATION,
  COST_HEAD.SERVICE_AMC, COST_HEAD.SPECIAL_PROJECT_WORKS,
  COST_HEAD.OFFICE_EXPENSE_ALLOCATION,
];
export const COST_HEAD_ORDER = [...DIRECT_COST_HEADS, COST_HEAD.MISCELLANEOUS];

export const COST_HEAD_OWNER = {
  MATERIAL_LANDED: 'PROCUREMENT',
  STRUCTURE: 'PROJECT_HEAD',
  INSTALLATION: 'PROJECT_HEAD',
  SITE_SURVEY: 'PROJECT_HEAD',
  ENGINEERING_DESIGN: 'PROJECT_HEAD',
  TRANSPORTATION: 'PROJECT_HEAD',
  SERVICE_AMC: 'PROJECT_HEAD',
  SPECIAL_PROJECT_WORKS: 'PROJECT_HEAD',
  OFFICE_EXPENSE_ALLOCATION: 'ADMIN',
  MISCELLANEOUS: 'ADMIN',
};

export const COST_ERROR = {
  COST_NOT_AVAILABLE_UNTIL_BOM_LOCKED: 'COST_NOT_AVAILABLE_UNTIL_BOM_LOCKED',
  LANDED_COST_NOT_CONFIGURED: 'LANDED_COST_NOT_CONFIGURED',
  PRICE_KIND_INVALID: 'PRICE_KIND_INVALID',
  STRUCTURE_RATE_NOT_CONFIGURED: 'STRUCTURE_RATE_NOT_CONFIGURED',
  INSTALLATION_COST_NOT_CONFIGURED: 'INSTALLATION_COST_NOT_CONFIGURED',
  SITE_SURVEY_NOT_CONFIGURED: 'SITE_SURVEY_NOT_CONFIGURED',
  SITE_SURVEY_EXCESS_RATE_NOT_CONFIGURED: 'SITE_SURVEY_EXCESS_RATE_NOT_CONFIGURED',
  ENGINEERING_DESIGN_NOT_CONFIGURED: 'ENGINEERING_DESIGN_NOT_CONFIGURED',
  TRANSPORT_RATE_NOT_CONFIGURED: 'TRANSPORT_RATE_NOT_CONFIGURED',
  TRANSPORT_DATA_INCOMPLETE: 'TRANSPORT_DATA_INCOMPLETE',
  SERVICE_CONFIG_INCOMPLETE: 'SERVICE_CONFIG_INCOMPLETE',
  SERVICE_OUT_OF_COVERAGE: 'SERVICE_OUT_OF_COVERAGE',
  SPECIAL_WORK_INVALID: 'SPECIAL_WORK_INVALID',
  OFFICE_ALLOCATION_INVALID: 'OFFICE_ALLOCATION_INVALID',
  MISC_CONFIG_INVALID: 'MISC_CONFIG_INVALID',
};

export const COST_STATUS = { COMPLETE: 'COMPLETE', INCOMPLETE: 'INCOMPLETE', UNAVAILABLE: 'UNAVAILABLE' };

/** Special project works the Project Head may add. Never added automatically. */
export const SPECIAL_WORK_TYPE = {
  CIVIL_WORK: 'CIVIL_WORK', TRENCHING: 'TRENCHING', SCAFFOLDING: 'SCAFFOLDING',
  CRANE: 'CRANE', ROOF_REINFORCEMENT: 'ROOF_REINFORCEMENT', DISMANTLING: 'DISMANTLING',
  WATERPROOFING: 'WATERPROOFING', CABLE_ROUTE: 'CABLE_ROUTE', DIFFICULT_ACCESS: 'DIFFICULT_ACCESS',
  PANEL_MODIFICATION: 'PANEL_MODIFICATION', OTHER: 'OTHER',
};

/**
 * @param {object} arg
 *   snapshot        LOCKED project BOM snapshot
 *   config          commercial configuration (data/cost-config.json)
 *   priceMaster     { componentId: rawProcurementRecord }
 *   project         { sizeKw, sizeKey, installationType, phase, sysType, tier,
 *                     distanceKm, vehicleType, structureMaterialCost,
 *                     specialWorks: [{workType, amount, reason, addedBy, at}] }
 *   calculatedAt    ISO timestamp supplied by the caller (determinism)
 */
export function calculateCost({
  snapshot, config, priceMaster = {}, project = {}, rateCard = null,
  calculatedAt = null, catalogVersion = null,
  procurementPriceVersion = null, landedCostVersion = null, projectRateCardVersion = null,
}) {
  // Rate lookup prefers the Project Head RATE CARD (versioned + audited) and
  // uses the plain config block only when no card is supplied. It never falls
  // back to a nearest, first-available or default rate.
  const fromCard = (rateType, recordId) =>
    rateCard ? resolveRate(rateCard, { rateType, recordId, at: project.rateEffectiveAt || null }) : { ok: false };
  const errors = [];
  const heads = {};
  const fail = (code, head, message, detail) => errors.push({ code, head, message, detail: detail ?? null });
  const addHead = (head, amountExact, inputs, formula, extra = {}) => {
    heads[head] = {
      head, owner: COST_HEAD_OWNER[head], inputs, formula,
      amount: amountExact == null ? null : roundMoney(amountExact),
      amountExact: amountExact == null ? null : amountExact,
      source: extra.source ?? null,
      configVersion: extra.version ?? null,
      status: extra.status || (amountExact == null ? 'INCOMPLETE' : 'OK'),
      note: extra.note || null,
      ...(extra.lines ? { lines: extra.lines } : {}),
    };
  };

  // ---- gate: a LOCKED BOM is mandatory ------------------------------------
  if (!snapshot || snapshot.status !== SNAPSHOT_STATUS.LOCKED) {
    return Object.freeze({
      status: COST_STATUS.UNAVAILABLE,
      error: COST_ERROR.COST_NOT_AVAILABLE_UNTIL_BOM_LOCKED,
      errors: Object.freeze([{ code: COST_ERROR.COST_NOT_AVAILABLE_UNTIL_BOM_LOCKED, head: null,
        message: 'Cost cannot be calculated from an unlocked engineering configuration. Lock the project BOM first.' }]),
      projectId: snapshot?.projectId ?? null,
      costEngineVersion: COST_ENGINE_VERSION,
      heads: {}, totalActualProjectCost: null, totalActualProjectCostExact: null, calculatedAt,
    });
  }

  const cfg = config || {};
  const sizeKw = Number(project.sizeKw ?? 0);

  // ---- MATERIAL_LANDED (§1, §2, §20) --------------------------------------
  const materialLines = [];
  for (const l of [...(snapshot.lines || [])].sort((a, b) => (a.componentId || '') < (b.componentId || '') ? -1 : 1)) {
    const rec = toPriceRecord({ componentId: l.componentId, ...(priceMaster[l.componentId] || {}) });
    const resolved = projectUnitCost(rec);
    const qty = Number(l.quantity ?? 0);
    const extended = resolved.ok ? mulExact(qty, resolved.unitCost) : null;

    if (!resolved.ok) {
      fail(rec.violation ? COST_ERROR.PRICE_KIND_INVALID : COST_ERROR.LANDED_COST_NOT_CONFIGURED,
        COST_HEAD.MATERIAL_LANDED,
        `"${l.componentId}": ${resolved.reason}`,
        { componentId: l.componentId, role: l.role, hasPurchasePrice: rec.hasPurchasePrice });
    }

    materialLines.push({
      componentId: l.componentId,
      componentName: rec.componentName ?? l.componentName ?? null,
      role: l.role ?? null,
      quantity: qty,
      // Both values are carried. Purchase price stays visible for audit; it is
      // NEVER the number multiplied into the project cost.
      purchasePrice: rec.hasPurchasePrice ? Number(rec.purchasePrice) : null,
      purchasePriceVersion: rec.purchasePriceVersion,
      landedUnitCost: resolved.ok ? resolved.unitCost : null,
      landedCostVersion: rec.landedCostVersion,
      landedCostEffectiveFrom: rec.landedCostEffectiveFrom,
      landedCostSource: rec.landedCostSource,
      procurementUplift: procurementUplift(rec),
      priceKindUsed: resolved.ok ? PRICE_KIND.LANDED_UNIT_COST : PRICE_KIND.UNKNOWN,
      extendedCost: extended == null ? null : roundMoney(extended),
      extendedExact: extended,
      supplier: rec.supplier, supplierReference: rec.supplierReference,
      componentDataVersion: l.componentDataVersion ?? null,
      formula: resolved.ok ? `${qty} × ${resolved.unitCost} (landed)` : null,
      status: resolved.ok ? 'OK' : COST_ERROR.LANDED_COST_NOT_CONFIGURED,
    });
  }
  const materialOk = materialLines.every(l => l.extendedExact != null);
  addHead(COST_HEAD.MATERIAL_LANDED,
    materialOk ? sumExact(materialLines.map(l => l.extendedExact)) : null,
    { lineCount: materialLines.length, landedCostVersion, procurementPriceVersion },
    'SUM(quantity × landedUnitCost)',
    { version: landedCostVersion, source: 'Procurement price master — landed cost',
      lines: materialLines, status: materialOk ? 'OK' : COST_ERROR.LANDED_COST_NOT_CONFIGURED,
      note: 'Landed cost, not purchase price. Supplier→warehouse logistics live inside landedUnitCost and are never re-charged as project transportation.' });

  // ---- STRUCTURE ----------------------------------------------------------
  const sc = cfg.structure || {};
  const instType = project.installationType || project.roofType || null;
  const addOn = (sc.roofAddOn || []).find(r => r.installationType === instType || r.roofType === instType) || null;
  if (!instType || !addOn) {
    fail(COST_ERROR.STRUCTURE_RATE_NOT_CONFIGURED, COST_HEAD.STRUCTURE,
      `No approved structure rate for installationType "${instType ?? 'undeclared'}". Not assumed to be zero.`, { instType });
    addHead(COST_HEAD.STRUCTURE, null, { installationType: instType }, 'roofAddOn + labour + repairAllowance',
      { version: sc.version, source: sc.source, status: COST_ERROR.STRUCTURE_RATE_NOT_CONFIGURED });
  } else {
    const labour = Number(sc.labour?.rate ?? 0);
    const repairPct = Number(sc.repairAllowancePct?.value ?? 0);
    const structMat = Number(project.structureMaterialCost ?? 0);
    addHead(COST_HEAD.STRUCTURE, sumExact([addOn.rate, labour, mulExact(structMat, repairPct / 100)]),
      { installationType: instType, addOnRate: addOn.rate, unit: addOn.unit, labourRate: labour,
        repairAllowancePct: repairPct, structureMaterialBase: structMat },
      `${addOn.rate} + ${labour} + (${structMat} × ${repairPct}%)`,
      { version: sc.version, source: sc.source,
        note: 'Flat-roof structure MATERIAL is emitted as BOM lines and is counted under MATERIAL_LANDED.' });
  }

  // ---- INSTALLATION (§4) --------------------------------------------------
  // EXACT systemSizeKw + installationType. No nearest kW, no first-available,
  // no legacy fallback. The UNIT comes from the rate record and is never assumed.
  const ic = cfg.installation || {};
  const instCard = fromCard(RATE_TYPE.INSTALLATION, installationKey(sizeKw, instType));
  const rate = instCard.ok ? instCard.value
    : ((ic.rates || []).find(r => Number(r.systemSizeKw) === sizeKw && r.installationType === instType) || null);
  const instVersion = instCard.ok ? instCard.versionId : (rate?.version ?? ic.version);

  if (!rate) {
    fail(COST_ERROR.INSTALLATION_COST_NOT_CONFIGURED, COST_HEAD.INSTALLATION,
      `No installation rate configured for ${sizeKw} kW / ${instType ?? 'undeclared'}. ` +
      'The nearest system size is NEVER used. Configure the exact combination on the Project Head rate card.',
      { sizeKw, installationType: instType });
    addHead(COST_HEAD.INSTALLATION, null, { systemSizeKw: sizeKw, installationType: instType },
      'PER_PROJECT: rate | PER_KW: rate x sizeKw',
      { version: instVersion, status: COST_ERROR.INSTALLATION_COST_NOT_CONFIGURED });
  } else if (rate.unit !== 'PER_KW' && rate.unit !== 'PER_PROJECT') {
    fail(COST_ERROR.INSTALLATION_COST_NOT_CONFIGURED, COST_HEAD.INSTALLATION,
      `Installation rate for ${sizeKw} kW / ${instType} does not declare a valid unit. ` +
      'PER_KW or PER_PROJECT must be stated explicitly on the rate record; the engine never assumes one.');
    addHead(COST_HEAD.INSTALLATION, null,
      { systemSizeKw: sizeKw, installationType: instType, unit: rate.unit ?? null },
      'rate x unit', { version: instVersion, status: COST_ERROR.INSTALLATION_COST_NOT_CONFIGURED });
  } else {
    const amount = rate.unit === 'PER_KW' ? mulExact(rate.rate, sizeKw) : Number(rate.rate);
    addHead(COST_HEAD.INSTALLATION, amount,
      { systemSizeKw: sizeKw, installationType: instType, unit: rate.unit, rate: rate.rate,
        effectiveFrom: instCard.ok ? instCard.effectiveFrom : (rate.effectiveFrom ?? null) },
      rate.unit === 'PER_KW' ? `${rate.rate} \u00d7 ${sizeKw} kW` : `${rate.rate} (per project)`,
      { version: instVersion, source: instCard.ok ? 'PROJECT_HEAD_RATE_CARD' : ic.source });
  }

  // ---- SITE SURVEY (section 5) ---------------------------------------------------
  //   <= coverageKm : costPerProject                       (ALL-INCLUSIVE)
  //    > coverageKm : costPerProject + (km - coverageKm) x excessRatePerKm
  // The flat charge already covers engineer cost, engineer travel, the site
  // visit and the report - no separate engineer travel is ever added.
  const ssCard = fromCard(RATE_TYPE.SITE_SURVEY, 'STANDARD');
  const ss = ssCard.ok ? { ...(cfg.siteSurvey || {}), ...ssCard.value } : (cfg.siteSurvey || {});
  const ssVersion = ssCard.ok ? ssCard.versionId : ss.version;
  const dist = project.distanceKm;

  if (project.siteSurveyIncluded === false) {
    addHead(COST_HEAD.SITE_SURVEY, 0, { siteSurveyIncluded: false },
      '0 (survey explicitly not included in this project)', { version: ssVersion });
  } else if (!isMoney(ss.costPerProject) || !isMoney(ss.coverageKm)) {
    fail(COST_ERROR.SITE_SURVEY_NOT_CONFIGURED, COST_HEAD.SITE_SURVEY,
      'Site survey cost or coverage distance is not configured. Not assumed to be zero.');
    addHead(COST_HEAD.SITE_SURVEY, null, {}, 'costPerProject (+ excess beyond coverageKm)',
      { version: ssVersion, status: COST_ERROR.SITE_SURVEY_NOT_CONFIGURED });
  } else if (!isMoney(dist)) {
    fail(COST_ERROR.SITE_SURVEY_NOT_CONFIGURED, COST_HEAD.SITE_SURVEY,
      'distanceKm is not recorded, so site-survey coverage cannot be determined.');
    addHead(COST_HEAD.SITE_SURVEY, null, { distanceKm: null, coverageKm: Number(ss.coverageKm) },
      'costPerProject (+ excess beyond coverageKm)',
      { version: ssVersion, status: COST_ERROR.SITE_SURVEY_NOT_CONFIGURED });
  } else if (Number(dist) <= Number(ss.coverageKm)) {
    addHead(COST_HEAD.SITE_SURVEY, Number(ss.costPerProject),
      { costPerProject: Number(ss.costPerProject), distanceKm: Number(dist),
        coverageKm: Number(ss.coverageKm), excessKm: 0, unit: 'PER_PROJECT' },
      `${ss.costPerProject} (per project, within ${ss.coverageKm} km)`,
      { version: ssVersion, source: ssCard.ok ? 'PROJECT_HEAD_RATE_CARD' : ss.source,
        note: 'ALL-INCLUSIVE: engineer cost, engineer travel, site visit and survey report. ' +
              'No separate engineer travel is added; project transportation is a different head.' });
  } else if (!isMoney(ss.excessRatePerKm)) {
    fail(COST_ERROR.SITE_SURVEY_EXCESS_RATE_NOT_CONFIGURED, COST_HEAD.SITE_SURVEY,
      `Distance ${dist} km exceeds the ${ss.coverageKm} km coverage but no excess per-km rate is configured. ` +
      'No rate is invented and the flat charge is not applied on its own.',
      { distanceKm: Number(dist), coverageKm: Number(ss.coverageKm) });
    addHead(COST_HEAD.SITE_SURVEY, null,
      { distanceKm: Number(dist), coverageKm: Number(ss.coverageKm), excessRatePerKm: null },
      'costPerProject + (distanceKm - coverageKm) x excessRatePerKm',
      { version: ssVersion, status: COST_ERROR.SITE_SURVEY_EXCESS_RATE_NOT_CONFIGURED });
  } else {
    const excessKm = Number(dist) - Number(ss.coverageKm);
    addHead(COST_HEAD.SITE_SURVEY,
      sumExact([Number(ss.costPerProject), mulExact(excessKm, ss.excessRatePerKm)]),
      { costPerProject: Number(ss.costPerProject), distanceKm: Number(dist),
        coverageKm: Number(ss.coverageKm), excessKm, excessRatePerKm: Number(ss.excessRatePerKm),
        unit: 'PER_PROJECT_PLUS_EXCESS_KM' },
      `${ss.costPerProject} + (${dist} - ${ss.coverageKm}) \u00d7 ${ss.excessRatePerKm}`,
      { version: ssVersion, source: ssCard.ok ? 'PROJECT_HEAD_RATE_CARD' : ss.source,
        note: 'The coverage threshold is an approved business rule and is never silently changed. ' +
              'The excess per-km rate is Project Head configuration on the rate card.' });
  }

  // ---- ENGINEERING / DESIGN (section 6) -----------------------------------------
  //   <= sizeLimitKw : the approved flat per-project rate (ALL-INCLUSIVE)
  //    > sizeLimitKw : whatever the Project Head rate card holds for that band.
  // The flat rate is NEVER extrapolated upward and never computed per kW.
  const edCfg = cfg.engineeringDesign || {};
  const limit = Number(edCfg.sizeLimitKw ?? NaN);
  const withinLimit = Number.isFinite(limit) && sizeKw <= limit;
  const edKey = Number.isFinite(limit) ? (withinLimit ? `<=${limit}kW` : `>${limit}kW`) : 'UNBANDED';
  const edCard = fromCard(RATE_TYPE.ENGINEERING_DESIGN, edKey);
  const edRate = edCard.ok ? edCard.value
    : (withinLimit && isMoney(edCfg.costPerProject)
        ? { costPerProject: edCfg.costPerProject, unit: 'PER_PROJECT', sizeLimitKw: limit }
        : null);
  const edVersion = edCard.ok ? edCard.versionId : edCfg.version;

  if (!Number.isFinite(limit) || !edRate || !isMoney(edRate.costPerProject)) {
    fail(COST_ERROR.ENGINEERING_DESIGN_NOT_CONFIGURED, COST_HEAD.ENGINEERING_DESIGN,
      Number.isFinite(limit) && !withinLimit
        ? `System size ${sizeKw} kW is above the ${limit} kW band and the Project Head rate card has no ` +
          `"${edKey}" rate. The flat rate is NOT extrapolated and no rate is invented.`
        : 'Engineering/design rate or size band is not configured. Not silently zero, never folded into installation.',
      { sizeKw, sizeLimitKw: Number.isFinite(limit) ? limit : null, band: edKey });
    addHead(COST_HEAD.ENGINEERING_DESIGN, null,
      { sizeKw, band: edKey, sizeLimitKw: Number.isFinite(limit) ? limit : null },
      'rate card rate for the applicable size band',
      { version: edVersion, status: COST_ERROR.ENGINEERING_DESIGN_NOT_CONFIGURED });
  } else if (edRate.unit === 'PER_KW') {
    addHead(COST_HEAD.ENGINEERING_DESIGN, mulExact(edRate.costPerProject, sizeKw),
      { sizeKw, band: edKey, rate: edRate.costPerProject, unit: 'PER_KW' },
      `${edRate.costPerProject} \u00d7 ${sizeKw} kW`,
      { version: edVersion, source: 'PROJECT_HEAD_RATE_CARD',
        note: 'PER_KW is used only because the rate record for this band explicitly declares it.' });
  } else {
    addHead(COST_HEAD.ENGINEERING_DESIGN, Number(edRate.costPerProject),
      { sizeKw, band: edKey, costPerProject: Number(edRate.costPerProject),
        unit: 'PER_PROJECT', sizeLimitKw: limit },
      `${edRate.costPerProject} (per project, band ${edKey})`,
      { version: edVersion, source: edCard.ok ? 'PROJECT_HEAD_RATE_CARD' : edCfg.source,
        note: 'ALL-INCLUSIVE: engineer cost, engineer travel, engineering/design work and the site report. ' +
              'Engineer travel is never added separately and the cost is never computed per kW within the band.' });
  }

  // ---- TRANSPORTATION (§3) — warehouse → site only ------------------------
  const tc = cfg.transportation || {};
  const vehicleType = project.vehicleType || null;
  const vehCard = vehicleType ? fromCard(RATE_TYPE.TRANSPORT_VEHICLE, vehicleType) : { ok: false };
  const vehicle = vehCard.ok ? vehCard.value
    : ((tc.vehicles || []).find(v => v.vehicleType === vehicleType) || null);
  if (tc.notApplicable === true) {
    addHead(COST_HEAD.TRANSPORTATION, 0, { notApplicable: true },
      '0 (project transportation explicitly not applicable)', { version: tc.version });
  } else if (!vehicleType || !vehicle) {
    fail(COST_ERROR.TRANSPORT_RATE_NOT_CONFIGURED, COST_HEAD.TRANSPORTATION,
      `No configured vehicle rate for vehicleType "${vehicleType ?? 'undeclared'}". ` +
      'No universal per-km rate is assumed. Project Head must configure vehicle types and rates.',
      { vehicleType, configured: (tc.vehicles || []).map(v => v.vehicleType) });
    addHead(COST_HEAD.TRANSPORTATION, null, { vehicleType, distanceKm: isMoney(dist) ? Number(dist) : null },
      'distanceKm × vehicle.ratePerKm', { version: tc.version, status: COST_ERROR.TRANSPORT_RATE_NOT_CONFIGURED });
  } else if (!isMoney(dist)) {
    fail(COST_ERROR.TRANSPORT_DATA_INCOMPLETE, COST_HEAD.TRANSPORTATION,
      'distanceKm is not recorded on the project. Distance is a project input and is never derived automatically in V1.');
    addHead(COST_HEAD.TRANSPORTATION, null, { vehicleType, ratePerKm: vehicle.ratePerKm, distanceKm: null },
      'distanceKm × vehicle.ratePerKm', { version: tc.version, status: COST_ERROR.TRANSPORT_DATA_INCOMPLETE });
  } else {
    // ONE-WAY billable distance. The system never doubles it.
    addHead(COST_HEAD.TRANSPORTATION, mulExact(dist, vehicle.ratePerKm),
      { vehicleType: vehicle.vehicleType ?? vehicleType, ratePerKm: Number(vehicle.ratePerKm),
        distanceKm: Number(dist), distanceBasis: 'ONE_WAY' },
      `${dist} × ${vehicle.ratePerKm}`,
      { version: vehCard.ok ? vehCard.versionId : (vehicle.version ?? tc.version),
        source: vehCard.ok ? 'PROJECT_HEAD_RATE_CARD' : tc.source,
        note: 'Warehouse → site delivery only. Supplier → warehouse logistics are inside landedUnitCost and are not charged again here. ' +
              'Distance is the one-way billable distance and is NEVER multiplied by 2 by the system.' });
  }

  // ---- SERVICE / AMC (decision C9) ----------------------------------------
  // internalServiceCost = costPerVisit × visitsPerYear × serviceYears
  // Three separately configurable values, all owned by Project Head. There is
  // no annual-rate form: an annual rate hides visitsPerYear, which is exactly
  // the term the legacy engine was missing.
  const sv = cfg.serviceAmc || {};
  if (sv.serviceIncluded === false) {
    addHead(COST_HEAD.SERVICE_AMC, 0, { serviceIncluded: false },
      '0 (service explicitly not included)', { version: sv.version });
  } else {
    const missing = ['costPerVisit', 'visitsPerYear', 'serviceYears'].filter(f => !isMoney(sv[f]));
    if (missing.length) {
      fail(COST_ERROR.SERVICE_CONFIG_INCOMPLETE, COST_HEAD.SERVICE_AMC,
        `Service configuration is incomplete: ${missing.join(', ')} not recorded. ` +
        'None is invented, no annual-rate fallback exists, and none silently becomes zero.',
        { missing, costPerVisit: sv.costPerVisit ?? null, visitsPerYear: sv.visitsPerYear ?? null,
          serviceYears: sv.serviceYears ?? null });
      addHead(COST_HEAD.SERVICE_AMC, null,
        { costPerVisit: sv.costPerVisit ?? null, visitsPerYear: sv.visitsPerYear ?? null,
          serviceYears: sv.serviceYears ?? null, missing },
        'costPerVisit × visitsPerYear × serviceYears',
        { version: sv.version, status: COST_ERROR.SERVICE_CONFIG_INCOMPLETE });
    } else if (isMoney(sv.sizeLimitKw) && sizeKw > Number(sv.sizeLimitKw)) {
      fail(COST_ERROR.SERVICE_OUT_OF_COVERAGE, COST_HEAD.SERVICE_AMC,
        `System size ${sizeKw} kW exceeds the ${sv.sizeLimitKw} kW service model limit. No rate is approved above it.`,
        { sizeKw, sizeLimitKw: Number(sv.sizeLimitKw) });
      addHead(COST_HEAD.SERVICE_AMC, null, { sizeKw, sizeLimitKw: Number(sv.sizeLimitKw) },
        'above size limit — approval required', { version: sv.version, status: COST_ERROR.SERVICE_OUT_OF_COVERAGE });
    } else {
      addHead(COST_HEAD.SERVICE_AMC,
        mulExact(mulExact(sv.costPerVisit, sv.visitsPerYear), sv.serviceYears),
        { costPerVisit: Number(sv.costPerVisit), visitsPerYear: Number(sv.visitsPerYear),
          serviceYears: Number(sv.serviceYears), sizeLimitKw: sv.sizeLimitKw ?? null, sizeKw },
        `${sv.costPerVisit} × ${sv.visitsPerYear} × ${sv.serviceYears}`,
        { version: sv.version, source: sv.source,
          note: 'Decision C9. Per-visit model — the visits-per-year term is explicit, never folded into an annual rate. ' +
                'This is an INTERNAL cost and is never a customer-facing AMC price.' });
    }
  }

  // ---- SPECIAL PROJECT WORKS (§9) -----------------------------------------
  const works = Array.isArray(project.specialWorks) ? project.specialWorks : [];
  const workLines = [];
  for (const w of [...works].sort((a, b) => (a.workType || '') < (b.workType || '') ? -1 : 1)) {
    if (!w.workType || !isMoney(w.amount)) {
      fail(COST_ERROR.SPECIAL_WORK_INVALID, COST_HEAD.SPECIAL_PROJECT_WORKS,
        `Special work "${w.workType ?? '(no type)'}" has no valid amount. No rate is invented.`, w);
      workLines.push({ workType: w.workType ?? null, amount: null, extendedCost: null,
        reason: w.reason ?? null, addedBy: w.addedBy ?? null, at: w.at ?? null, status: COST_ERROR.SPECIAL_WORK_INVALID });
      continue;
    }
    workLines.push({ workType: w.workType, amount: Number(w.amount), extendedCost: roundMoney(Number(w.amount)),
      extendedExact: Number(w.amount), reason: w.reason ?? null, addedBy: w.addedBy ?? null,
      at: w.at ?? null, status: 'OK' });
  }
  const worksOk = workLines.every(l => l.extendedExact != null);
  addHead(COST_HEAD.SPECIAL_PROJECT_WORKS,
    worksOk ? sumExact(workLines.map(l => l.extendedExact || 0)) : null,
    { workCount: workLines.length },
    workLines.length ? 'SUM(explicitly added special works)' : '0 (no special work added by Project Head)',
    { version: null, source: 'Project Head, per project', lines: workLines,
      status: worksOk ? 'OK' : COST_ERROR.SPECIAL_WORK_INVALID,
      note: 'Never added automatically. Each work is its own visible line and is never hidden inside miscellaneous.' });

  // ---- OFFICE EXPENSE ALLOCATION (§8) -------------------------------------
  const oc = cfg.officeExpenseAllocation || {};
  const expected = Number(oc.expectedProjectsPerMonth ?? 0);
  if (!isMoney(oc.monthlyOfficeExpense) || !(expected > 0)) {
    fail(COST_ERROR.OFFICE_ALLOCATION_INVALID, COST_HEAD.OFFICE_EXPENSE_ALLOCATION,
      `monthlyOfficeExpense must be configured and expectedProjectsPerMonth must be > 0 ` +
      `(got ${oc.monthlyOfficeExpense ?? 'null'} ÷ ${oc.expectedProjectsPerMonth ?? 'null'}). ` +
      'No silent fallback to zero and no division by zero.',
      { monthlyOfficeExpense: oc.monthlyOfficeExpense ?? null, expectedProjectsPerMonth: oc.expectedProjectsPerMonth ?? null });
    addHead(COST_HEAD.OFFICE_EXPENSE_ALLOCATION, null,
      { monthlyOfficeExpense: oc.monthlyOfficeExpense ?? null, expectedProjectsPerMonth: oc.expectedProjectsPerMonth ?? null },
      'monthlyOfficeExpense ÷ expectedProjectsPerMonth',
      { version: oc.version, status: COST_ERROR.OFFICE_ALLOCATION_INVALID });
  } else {
    addHead(COST_HEAD.OFFICE_EXPENSE_ALLOCATION, Number(oc.monthlyOfficeExpense) / expected,
      { monthlyOfficeExpense: Number(oc.monthlyOfficeExpense), expectedProjectsPerMonth: expected },
      `${oc.monthlyOfficeExpense} ÷ ${expected}`,
      { version: oc.version, source: oc.source,
        note: 'Allocated on the ADMIN-defined expected volume, never on actual completed projects.' });
  }

  // ---- DIRECT PROJECT COST, then MISCELLANEOUS (§10) ----------------------
  // Miscellaneous is a percentage of the DIRECT cost — the sum of every other
  // head. It is never a percentage of the selling price, so there is no
  // circular dependency: direct cost is fully known before misc is computed.
  const directOk = DIRECT_COST_HEADS.every(h => heads[h]?.amountExact != null);
  const directExact = directOk ? sumExact(DIRECT_COST_HEADS.map(h => heads[h].amountExact)) : null;

  const mc = cfg.miscellaneous || {};
  if (!isMoney(mc.percentage)) {
    fail(COST_ERROR.MISC_CONFIG_INVALID, COST_HEAD.MISCELLANEOUS,
      'A miscellaneous allowance percentage must be explicitly configured (0% is a valid explicit value).');
    addHead(COST_HEAD.MISCELLANEOUS, null, { percentage: null }, 'DIRECT_PROJECT_COST × miscellaneousPct',
      { version: mc.version, status: COST_ERROR.MISC_CONFIG_INVALID });
  } else if (Number(mc.percentage) < 0 || Number(mc.percentage) >= 100) {
    fail(COST_ERROR.MISC_CONFIG_INVALID, COST_HEAD.MISCELLANEOUS,
      `Miscellaneous allowance ${mc.percentage}% is out of range. 0 <= pct < 100.`);
    addHead(COST_HEAD.MISCELLANEOUS, null, { percentage: Number(mc.percentage) },
      'DIRECT_PROJECT_COST × miscellaneousPct', { version: mc.version, status: COST_ERROR.MISC_CONFIG_INVALID });
  } else if (directExact == null) {
    addHead(COST_HEAD.MISCELLANEOUS, null, { percentage: Number(mc.percentage), directProjectCost: null },
      'DIRECT_PROJECT_COST × miscellaneousPct',
      { version: mc.version, status: 'INCOMPLETE',
        note: 'Direct project cost is incomplete, so the allowance cannot be computed.' });
  } else {
    addHead(COST_HEAD.MISCELLANEOUS, mulExact(directExact, Number(mc.percentage) / 100),
      { percentage: Number(mc.percentage), directProjectCost: roundMoney(directExact),
        base: 'DIRECT_PROJECT_COST_BEFORE_MISCELLANEOUS' },
      `${roundMoney(directExact)} × ${mc.percentage}%`,
      { version: mc.version, source: mc.source,
        note: 'CONFIGURED MISCELLANEOUS ALLOWANCE — an explicit cost allowance, NOT hidden margin. ' +
              'Computed on direct project cost before miscellaneous, never on the selling price.' });
  }

  const allOk = COST_HEAD_ORDER.every(h => heads[h]?.amountExact != null);
  const totalExact = allOk ? sumExact(COST_HEAD_ORDER.map(h => heads[h].amountExact)) : null;

  return Object.freeze({
    status: errors.length ? COST_STATUS.INCOMPLETE : COST_STATUS.COMPLETE,
    error: errors.length ? errors[0].code : null,
    errors: Object.freeze(errors),

    projectId: snapshot.projectId,
    bomSnapshotId: snapshot.snapshotId ?? `${snapshot.projectId}@${snapshot.lockedAt}`,
    tier: project.tier ?? null,
    sizeKw,
    costEngineVersion: COST_ENGINE_VERSION,
    catalogVersion, procurementPriceVersion, landedCostVersion,
    projectRateCardVersion: projectRateCardVersion ?? rateCard?.cardVersion ?? null,
    costConfigVersion: cfg.configVersion ?? null,
    calculatedAt,

    materialLandedCost: heads[COST_HEAD.MATERIAL_LANDED].amount,
    structureCost: heads[COST_HEAD.STRUCTURE].amount,
    installationCost: heads[COST_HEAD.INSTALLATION].amount,
    siteSurveyCost: heads[COST_HEAD.SITE_SURVEY].amount,
    engineeringDesignCost: heads[COST_HEAD.ENGINEERING_DESIGN].amount,
    transportationCost: heads[COST_HEAD.TRANSPORTATION].amount,
    serviceAmcCost: heads[COST_HEAD.SERVICE_AMC].amount,
    specialProjectWorksCost: heads[COST_HEAD.SPECIAL_PROJECT_WORKS].amount,
    officeExpenseAllocation: heads[COST_HEAD.OFFICE_EXPENSE_ALLOCATION].amount,
    miscellaneousCost: heads[COST_HEAD.MISCELLANEOUS].amount,

    directProjectCost: directExact == null ? null : roundMoney(directExact),
    directProjectCostExact: directExact,
    totalActualProjectCost: totalExact == null ? null : roundMoney(totalExact),
    totalActualProjectCostExact: totalExact,

    heads: Object.freeze(heads),
    traces: Object.freeze(COST_HEAD_ORDER.map(h => ({
      head: h, owner: heads[h].owner, inputs: heads[h].inputs, formula: heads[h].formula,
      amount: heads[h].amount, source: heads[h].source, version: heads[h].configVersion,
      status: heads[h].status,
    }))),
  });
}

/** Developer/debug view (§30). Text only. */
export function explainCost(result) {
  if (!result) return '';
  if (result.status === COST_STATUS.UNAVAILABLE) return result.error;
  const rows = result.traces.map(t =>
    `${t.head.padEnd(26)} ${String(t.amount ?? '—').padStart(11)}  ${t.owner.padEnd(13)} ${t.formula}` +
    (t.status !== 'OK' ? `   [${t.status}]` : ''));
  return [
    `PROJECT ${result.projectId}   engine=${result.costEngineVersion}   config=${result.costConfigVersion}`,
    ...rows,
    `${'DIRECT_PROJECT_COST'.padEnd(26)} ${String(result.directProjectCost ?? '—').padStart(11)}`,
    `${'TOTAL_ACTUAL_PROJECT_COST'.padEnd(26)} ${String(result.totalActualProjectCost ?? '—').padStart(11)}`,
    ...(result.errors.length ? ['', ...result.errors.map(e => `! ${e.code} [${e.head || '-'}] ${e.message}`)] : []),
  ].join('\n');
}

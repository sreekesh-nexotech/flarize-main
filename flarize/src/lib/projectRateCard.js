/**
 * PROJECT HEAD RATE CARD.  (Phase 2A §3)
 *
 * ONE place where every operational project rate lives:
 *
 *   A. Installation          B. Transportation (per vehicle)
 *   C. Site survey           D. Engineering / design
 *   E. Service / AMC         F. Special project work rates (where predefined)
 *
 * Every rate is a VERSIONED record in the commercial history store, so a rate
 * change is an append with who/when/why — never an overwrite. See
 * `commercialHistory.js`.
 *
 * NO COMMERCIAL RATE LIVES IN THE COST ENGINE. The engine asks this module for
 * the applicable rate and gets either a rate with its version, or an explicit
 * "not configured" — never a nearest match, a first-available or a default.
 */

import {
  CONFIG_TYPE, CONFIG_STATUS, appendVersion, createHistoryStore,
  getCurrentVersion, getVersionEffectiveAt, getHistory,
} from './commercialHistory.js';

export const RATE_CARD_VERSION_FIELD = 'projectRateCardVersion';

export const RATE_TYPE = {
  INSTALLATION: CONFIG_TYPE.INSTALLATION_RATE,
  TRANSPORT_VEHICLE: CONFIG_TYPE.TRANSPORT_VEHICLE_RATE,
  SITE_SURVEY: CONFIG_TYPE.SITE_SURVEY_RATE,
  ENGINEERING_DESIGN: CONFIG_TYPE.ENGINEERING_DESIGN_RATE,
  SERVICE: CONFIG_TYPE.SERVICE_RATE,
  SPECIAL_WORK: CONFIG_TYPE.SPECIAL_WORK_RATE,
};

export const RATE_UNIT = { PER_PROJECT: 'PER_PROJECT', PER_KW: 'PER_KW', PER_KM: 'PER_KM', PER_VISIT: 'PER_VISIT' };

export const RATE_ERROR = {
  RATE_NOT_CONFIGURED: 'RATE_NOT_CONFIGURED',
  RATE_UNIT_INVALID: 'RATE_UNIT_INVALID',
};

/** A rate card is a history store plus the card's own version label. */
export function createRateCard({ cardVersion = null } = {}) {
  return Object.freeze({ cardVersion, store: createHistoryStore() });
}

/**
 * Add or change a rate. Append-only; the previous version is superseded, never
 * edited. `recordId` identifies the thing being priced, e.g.
 *   INSTALLATION        "3kW/FLAT"
 *   TRANSPORT_VEHICLE   "PICKUP"
 *   SITE_SURVEY         "STANDARD"
 *   ENGINEERING_DESIGN  "<=20kW"  /  ">20kW"
 *   SERVICE             "STANDARD"
 */
export function setRate(card, {
  rateType, recordId, value,
  rateId = null, versionId, changedBy, changedAt, changeReason,
  effectiveFrom, effectiveTo = null, cardVersion = null,
}) {
  const store = appendVersion(card.store, {
    configType: rateType, recordId,
    value: { rateId: rateId ?? recordId, ...value },
    versionId, changedBy, changedAt, changeReason, effectiveFrom, effectiveTo,
  });
  return Object.freeze({ cardVersion: cardVersion ?? card.cardVersion, store });
}

/**
 * Resolve the applicable rate.
 * @returns {{ok, value, versionId, effectiveFrom, changedBy, reason}}
 */
export function resolveRate(card, { rateType, recordId, at = null }) {
  if (!card?.store) return { ok: false, code: RATE_ERROR.RATE_NOT_CONFIGURED,
    reason: 'No rate card supplied.' };
  const v = at
    ? getVersionEffectiveAt(card.store, rateType, recordId, at)
    : getCurrentVersion(card.store, rateType, recordId);
  if (!v || v.status === CONFIG_STATUS.ARCHIVED)
    return { ok: false, code: RATE_ERROR.RATE_NOT_CONFIGURED,
      reason: `No ${rateType} rate configured for "${recordId}"` + (at ? ` effective at ${at}.` : '.') +
              ' No nearest, first-available or legacy rate is substituted.' };
  return { ok: true, value: v.value, versionId: v.versionId, effectiveFrom: v.effectiveFrom,
    changedBy: v.changedBy, status: v.status, reason: null };
}

/** Installation rates are keyed by size + type. EXACT match only. */
export function installationKey(systemSizeKw, installationType) {
  return `${systemSizeKw}kW/${installationType}`;
}

/** Engineering/design bands. The band itself is a configured record. */
export function engineeringKey(sizeKw, sizeLimitKw) {
  return Number(sizeKw) <= Number(sizeLimitKw) ? `<=${sizeLimitKw}kW` : `>${sizeLimitKw}kW`;
}

/** Every rate on the card, for a Project Head review screen. */
export function listRates(card) {
  const out = [];
  for (const k of Object.keys(card?.store?.records || {}).sort()) {
    const [configType, recordId] = k.split('::');
    const versions = getHistory(card.store, configType, recordId);
    const current = versions.find(v => v.status === CONFIG_STATUS.ACTIVE) || null;
    out.push({ rateType: configType, recordId, current, versionCount: versions.length });
  }
  return out;
}

/**
 * Build a rate card from a plain configuration block.
 * Used to seed the card from `data/cost-config.json`. Every seeded record still
 * gets a full audit entry — there is no un-audited way in.
 */
export function seedRateCardFromConfig(config, { changedBy, changedAt, changeReason, effectiveFrom, cardVersion }) {
  let card = createRateCard({ cardVersion });
  const audit = (versionId) => ({ versionId, changedBy, changedAt, changeReason, effectiveFrom });

  for (const r of config?.installation?.rates || []) {
    card = setRate(card, { rateType: RATE_TYPE.INSTALLATION,
      recordId: installationKey(r.systemSizeKw, r.installationType),
      value: { systemSizeKw: r.systemSizeKw, installationType: r.installationType, unit: r.unit, rate: r.rate },
      ...audit(r.version ? `${r.version}/${installationKey(r.systemSizeKw, r.installationType)}` : `INST-${r.systemSizeKw}-${r.installationType}`) });
  }
  for (const v of config?.transportation?.vehicles || []) {
    card = setRate(card, { rateType: RATE_TYPE.TRANSPORT_VEHICLE, recordId: v.vehicleType,
      value: { vehicleType: v.vehicleType, ratePerKm: v.ratePerKm, unit: RATE_UNIT.PER_KM },
      ...audit(v.versionId || `VEH-${v.vehicleType}`) });
  }
  const ss = config?.siteSurvey;
  if (ss && ss.costPerProject != null) {
    card = setRate(card, { rateType: RATE_TYPE.SITE_SURVEY, recordId: 'STANDARD',
      value: { costPerProject: ss.costPerProject, unit: RATE_UNIT.PER_PROJECT,
        coverageKm: ss.coverageKm, excessRatePerKm: ss.excessRatePerKm ?? null },
      ...audit(ss.version || 'SURVEY-1') });
  }
  const ed = config?.engineeringDesign;
  if (ed && ed.costPerProject != null) {
    card = setRate(card, { rateType: RATE_TYPE.ENGINEERING_DESIGN, recordId: `<=${ed.sizeLimitKw}kW`,
      value: { costPerProject: ed.costPerProject, unit: RATE_UNIT.PER_PROJECT, sizeLimitKw: ed.sizeLimitKw },
      ...audit(ed.version || 'ENGDES-1') });
  }
  const sv = config?.serviceAmc;
  if (sv && sv.costPerVisit != null) {
    card = setRate(card, { rateType: RATE_TYPE.SERVICE, recordId: 'STANDARD',
      value: { costPerVisit: sv.costPerVisit, visitsPerYear: sv.visitsPerYear,
        serviceYears: sv.serviceYears, sizeLimitKw: sv.sizeLimitKw, unit: RATE_UNIT.PER_VISIT },
      ...audit(sv.version || 'SERVICE-1') });
  }
  for (const w of config?.specialProjectWorks?.rates || []) {
    card = setRate(card, { rateType: RATE_TYPE.SPECIAL_WORK, recordId: w.workType,
      value: { workType: w.workType, rate: w.rate, unit: w.unit },
      ...audit(w.versionId || `WORK-${w.workType}`) });
  }
  return card;
}

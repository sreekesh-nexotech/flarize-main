/**
 * COMMERCIAL CONFIGURATION HISTORY.  (Phase 2A §18, §19)
 *
 * Every commercial value — a landed cost, an installation rate, a vehicle rate,
 * a survey excess rate, an engineering rate, a service rate, a margin, the
 * miscellaneous percentage, the GST configuration — is a VERSIONED RECORD, not
 * a field that gets overwritten.
 *
 *   ₹8,950 → ₹9,200 does not edit a number. It appends a new version and marks
 *   the old one SUPERSEDED. The old one stays readable forever.
 *
 * APPEND-ONLY. There is no update path and no delete path in this module.
 * `appendVersion` returns a NEW store; the input store is never mutated.
 *
 * Determinism: no clock. `changedAt` and `effectiveFrom` are supplied by the
 * caller, so the same inputs always produce the same history.
 */

export const CONFIG_STATUS = {
  ACTIVE: 'ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
  ARCHIVED: 'ARCHIVED',
};

/** The kinds of commercial configuration under audit. */
export const CONFIG_TYPE = {
  PROCUREMENT_PRICE: 'PROCUREMENT_PRICE',      // purchasePrice + landedUnitCost
  INSTALLATION_RATE: 'INSTALLATION_RATE',
  TRANSPORT_VEHICLE_RATE: 'TRANSPORT_VEHICLE_RATE',
  SITE_SURVEY_RATE: 'SITE_SURVEY_RATE',
  ENGINEERING_DESIGN_RATE: 'ENGINEERING_DESIGN_RATE',
  SERVICE_RATE: 'SERVICE_RATE',
  SPECIAL_WORK_RATE: 'SPECIAL_WORK_RATE',
  MARGIN: 'MARGIN',
  MISCELLANEOUS_PCT: 'MISCELLANEOUS_PCT',
  GST_CONFIG: 'GST_CONFIG',
};

export const CONFIG_OWNER = {
  PROCUREMENT_PRICE: 'PROCUREMENT',
  INSTALLATION_RATE: 'PROJECT_HEAD',
  TRANSPORT_VEHICLE_RATE: 'PROJECT_HEAD',
  SITE_SURVEY_RATE: 'PROJECT_HEAD',
  ENGINEERING_DESIGN_RATE: 'PROJECT_HEAD',
  SERVICE_RATE: 'PROJECT_HEAD',
  SPECIAL_WORK_RATE: 'PROJECT_HEAD',
  MARGIN: 'ADMIN',
  MISCELLANEOUS_PCT: 'ADMIN',
  GST_CONFIG: 'ADMIN',
};

export const HISTORY_ERROR = {
  MISSING_AUDIT_FIELDS: 'MISSING_AUDIT_FIELDS',
  UNKNOWN_CONFIG_TYPE: 'UNKNOWN_CONFIG_TYPE',
  DUPLICATE_VERSION_ID: 'DUPLICATE_VERSION_ID',
};

/** Audit fields every version must carry. None may be omitted. */
export const REQUIRED_AUDIT_FIELDS = ['versionId', 'changedBy', 'changedAt', 'changeReason', 'effectiveFrom'];

/** An empty store. */
export function createHistoryStore() {
  return Object.freeze({ records: Object.freeze({}) });
}

const key = (configType, recordId) => `${configType}::${recordId}`;

/**
 * Append a new version. The previous ACTIVE version becomes SUPERSEDED.
 *
 * @param {object} store
 * @param {object} entry
 *   configType, recordId
 *   value          the configuration payload (rate, price, percentages…)
 *   versionId, changedBy, changedAt, changeReason, effectiveFrom
 *   effectiveTo    optional
 */
export function appendVersion(store, entry) {
  const { configType, recordId, value } = entry;
  if (!CONFIG_TYPE[configType])
    throw new Error(`${HISTORY_ERROR.UNKNOWN_CONFIG_TYPE}: "${configType}"`);
  const missing = REQUIRED_AUDIT_FIELDS.filter(f => entry[f] == null || entry[f] === '');
  if (missing.length)
    throw new Error(`${HISTORY_ERROR.MISSING_AUDIT_FIELDS}: ${missing.join(', ')}. ` +
      'Every commercial change must record who, when, why and from when.');

  const k = key(configType, recordId);
  const existing = store.records[k] || [];
  if (existing.some(v => v.versionId === entry.versionId))
    throw new Error(`${HISTORY_ERROR.DUPLICATE_VERSION_ID}: "${entry.versionId}"`);

  const previous = existing.find(v => v.status === CONFIG_STATUS.ACTIVE) || null;

  // The old version is COPIED into a superseded state. Nothing is edited away.
  const superseded = existing.map(v => v.status === CONFIG_STATUS.ACTIVE
    ? Object.freeze({ ...v, status: CONFIG_STATUS.SUPERSEDED,
        effectiveTo: v.effectiveTo ?? entry.effectiveFrom,
        supersededBy: entry.versionId })
    : v);

  const next = Object.freeze({
    configType, recordId,
    owner: CONFIG_OWNER[configType],
    versionId: entry.versionId,
    value: deepFreeze(clone(value)),
    status: CONFIG_STATUS.ACTIVE,
    effectiveFrom: entry.effectiveFrom,
    effectiveTo: entry.effectiveTo ?? null,
    changedBy: entry.changedBy,
    changedAt: entry.changedAt,
    changeReason: entry.changeReason,
    previousVersionId: previous?.versionId ?? null,
    supersededBy: null,
  });

  return Object.freeze({
    ...store,
    records: Object.freeze({ ...store.records, [k]: Object.freeze([...superseded, next]) }),
  });
}

/** Archive a record's active version without replacing it. Still append-only. */
export function archiveVersion(store, { configType, recordId, versionId, changedBy, changedAt, changeReason }) {
  const k = key(configType, recordId);
  const existing = store.records[k] || [];
  return Object.freeze({
    ...store,
    records: Object.freeze({ ...store.records, [k]: Object.freeze(existing.map(v =>
      v.versionId === versionId
        ? Object.freeze({ ...v, status: CONFIG_STATUS.ARCHIVED, archivedBy: changedBy,
            archivedAt: changedAt, archiveReason: changeReason })
        : v)) }),
  });
}

/** Full chronological history, oldest first. Nothing is ever hidden. */
export function getHistory(store, configType, recordId) {
  return [...(store.records[key(configType, recordId)] || [])]
    .sort((a, b) => String(a.changedAt) < String(b.changedAt) ? -1
      : String(a.changedAt) > String(b.changedAt) ? 1
        : String(a.versionId) < String(b.versionId) ? -1 : 1);
}

/** The single ACTIVE version, or null. */
export function getCurrentVersion(store, configType, recordId) {
  return (store.records[key(configType, recordId)] || [])
    .find(v => v.status === CONFIG_STATUS.ACTIVE) || null;
}

/** Any version by id — superseded and archived versions stay readable. */
export function getVersion(store, configType, recordId, versionId) {
  return (store.records[key(configType, recordId)] || [])
    .find(v => v.versionId === versionId) || null;
}

/**
 * The version applicable AT a given effective date.
 * Exactly one version applies: the latest whose effectiveFrom <= date and whose
 * effectiveTo is null or > date. ARCHIVED versions never apply.
 */
export function getVersionEffectiveAt(store, configType, recordId, date) {
  const applicable = (store.records[key(configType, recordId)] || [])
    .filter(v => v.status !== CONFIG_STATUS.ARCHIVED)
    .filter(v => String(v.effectiveFrom) <= String(date))
    .filter(v => v.effectiveTo == null || String(v.effectiveTo) > String(date))
    .sort((a, b) => String(a.effectiveFrom) < String(b.effectiveFrom) ? -1 : 1);
  return applicable.length ? applicable[applicable.length - 1] : null;
}

/** What changed between two versions: field, old value, new value, plus audit. */
export function compareVersions(oldVersion, newVersion) {
  if (!oldVersion || !newVersion) return null;
  const fields = [...new Set([...Object.keys(oldVersion.value || {}), ...Object.keys(newVersion.value || {})])].sort();
  const changes = fields
    .filter(f => JSON.stringify(oldVersion.value?.[f]) !== JSON.stringify(newVersion.value?.[f]))
    .map(f => ({ field: f, oldValue: oldVersion.value?.[f] ?? null, newValue: newVersion.value?.[f] ?? null }));
  return Object.freeze({
    configType: newVersion.configType, recordId: newVersion.recordId,
    from: { versionId: oldVersion.versionId, effectiveFrom: oldVersion.effectiveFrom, status: oldVersion.status },
    to: { versionId: newVersion.versionId, effectiveFrom: newVersion.effectiveFrom, status: newVersion.status },
    changedBy: newVersion.changedBy, changedAt: newVersion.changedAt, changeReason: newVersion.changeReason,
    changes,
  });
}

/** A UI-shaped view: CURRENT + HISTORY. Domain only — no rendering here. */
export function historyView(store, configType, recordId) {
  const history = getHistory(store, configType, recordId);
  const current = getCurrentVersion(store, configType, recordId);
  return Object.freeze({
    configType, recordId, owner: CONFIG_OWNER[configType],
    current: current ? Object.freeze({
      versionId: current.versionId, value: current.value, effectiveFrom: current.effectiveFrom,
      changedBy: current.changedBy, changedAt: current.changedAt, changeReason: current.changeReason,
      status: current.status,
    }) : null,
    history: Object.freeze(history.map(v => Object.freeze({
      versionId: v.versionId, value: v.value, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo,
      changedBy: v.changedBy, changedAt: v.changedAt, changeReason: v.changeReason,
      status: v.status, previousVersionId: v.previousVersionId, supersededBy: v.supersededBy,
    }))),
  });
}

function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/**
 * PACK CONFIG — the Project Head's kW-pack configuration, versioned and
 * approval-gated (2026-09-08, fast-quotation build).
 *
 * This is the owner's original BOM model (BOM tool v1) made server-side and
 * governed:
 *
 *   bomTemplates        per system type: slots (category, qty per size,
 *                       batQty / premiumQty, salesSwap, alternatives, default
 *                       component per size) + fixedItems (consumables per size)
 *   structureTemplates  per roof type: tubes (weightKg × ₹/kg) + fixed items,
 *                       qty per kW
 *   tubeWeights         kg per metre-tube by section
 *   costs               installRate (legacy), service, transportRate,
 *                       miscellaneous, office, tube ₹/kg, structure labour,
 *                       structure repair %
 *   installationMatrix  kW × roofType → ₹ (exact match, no fallback)
 *   transportConfig     { baseDistanceKm: 100, costPerKm: 35, vehicles[] }
 *   marketRates         pack key (systemType_tier[_bat][_upN]) × size → ₹
 *                       customer price incl. GST — set by the Project Head
 *   gst                 { regime: 'SOLAR_70_30_COMPOSITE', ratePct: 8.9 }
 *   pricing             { mode: 'PACK_MARKET_RATE', marginPct: 20 }
 *   futureUpgrade       { pairs: [{ panelSize, systemSize }] }
 *
 * Two copies live in the store: `draft` (what the Project Head is editing) and
 * `approved` (what Sales and the orchestrator use). Draft → SUBMITTED →
 * Admin approve promotes the draft to a new approved version; history is
 * append-only. Nothing in here reads or writes files — the transport does.
 */
import { assertCan, CAPABILITY } from './rbac.js';

export const PACK_CONFIG_SCHEMA = 'flarize.pack-config/1';
export const DRAFT_STATUS = Object.freeze({ DRAFT: 'DRAFT', SUBMITTED: 'SUBMITTED' });
export const PRICING_MODE = Object.freeze({ PACK_MARKET_RATE: 'PACK_MARKET_RATE', GROSS_MARGIN: 'GROSS_MARGIN' });
export const ROOF_TYPES = Object.freeze(['FLAT', 'SHEET', 'ELEVATED']);
/** roofType → structureTemplates key (v1 naming kept so the owner's data loads unchanged). */
export const ROOF_TO_STRUCTURE_KEY = Object.freeze({ FLAT: 'flatRoof', SHEET: 'sheetRoof', ELEVATED: 'elevated' });

export const CONFIG_SECTIONS = Object.freeze([
  'bomTemplates', 'structureTemplates', 'tubeWeights', 'costs', 'installationMatrix',
  'transportConfig', 'marketRates', 'gst', 'pricing', 'futureUpgrade',
]);

export const PACK_CONFIG_ERROR = Object.freeze({
  INVALID_SECTION: 'INVALID_SECTION',
  INVALID_VALUE: 'INVALID_VALUE',
  NOT_SUBMITTED: 'NOT_SUBMITTED',
  ALREADY_SUBMITTED: 'ALREADY_SUBMITTED',
  MISSING_TIMESTAMP: 'MISSING_TIMESTAMP',
  NO_CHANGES: 'NO_CHANGES',
});

export class PackConfigError extends Error {
  constructor(code, message, detail = null) { super(message); this.name = 'PackConfigError'; this.code = code; this.detail = detail; }
}

const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
const requireAt = (at) => { if (!at) throw new PackConfigError(PACK_CONFIG_ERROR.MISSING_TIMESTAMP, 'Timestamp (at) is required.'); return at; };
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Default sales-swappable slots when the template does not say (owner: panel, inverter, maybe DCDB/ACDB). */
export const DEFAULT_SALES_SWAP = Object.freeze(['panel', 'inverter', 'dcdb', 'acdb']);

/**
 * Build the initial store from the catalog the owner already maintains.
 * The catalog keeps components (items, prices, warranty); the pack config
 * takes ownership of templates, structure, costs, matrices and market rates.
 */
export function seedFromCatalog(catalog, { at, by = 'SEED_FROM_CATALOG' }) {
  requireAt(at);
  const templates = clone(catalog?.bomTemplates || {});
  for (const t of Object.values(templates)) {
    for (const slot of t.slots || []) {
      if (slot.salesSwap == null) slot.salesSwap = DEFAULT_SALES_SWAP.includes(slot.category);
      if (!Array.isArray(slot.alternatives)) slot.alternatives = [];   // [] = every eligible catalog item
      if (!slot.defaults || typeof slot.defaults !== 'object') slot.defaults = {}; // size → componentId (PH pick)
    }
  }
  const config = {
    bomTemplates: templates,
    structureTemplates: clone(catalog?.structureTemplates || {}),
    tubeWeights: clone(catalog?.tubeWeights || {}),
    costs: clone(catalog?.costs || {}),
    installationMatrix: clone(catalog?.installationMatrix || {}),
    transportConfig: {
      baseDistanceKm: catalog?.transportConfig?.baseDistanceKm ?? catalog?.costs?.defaultDistKm ?? 100,
      costPerKm: catalog?.transportConfig?.costPerKm ?? 35,
      vehicles: Array.isArray(catalog?.transportConfig?.vehicles) ? clone(catalog.transportConfig.vehicles)
        : [{ vehicleType: 'ACE', vehicleName: 'Tata Ace', ratePerKm: catalog?.transportConfig?.costPerKm ?? 35 }],
    },
    marketRates: clone(catalog?.marketRates || {}),
    gst: { regime: 'SOLAR_70_30_COMPOSITE', ratePct: 8.9, note: '70% supply @5% + 30% service @18% — decision D2 (2026-09-08).' },
    pricing: { mode: PRICING_MODE.PACK_MARKET_RATE, marginPct: 20, note: 'Customer price = pack market rate + swap delta + roof add-on; transport beyond base km is a separate customer extra (D3/D4/D6).' },
    futureUpgrade: {
      // Same phase on both sides: a future-ready pack never changes the customer's connection.
      pairs: [
        { systemType: 'ongrid', panelSize: '3',   systemSize: '5sp' },
        { systemType: 'ongrid', panelSize: '5tp', systemSize: '6' },
        { systemType: 'ongrid', panelSize: '5tp', systemSize: '8' },
        { systemType: 'ongrid', panelSize: '6',   systemSize: '8' },
        { systemType: 'ongrid', panelSize: '6',   systemSize: '10' },
        { systemType: 'ongrid', panelSize: '8',   systemSize: '10' },
        { systemType: 'hybrid', panelSize: '3',   systemSize: '5' },
        { systemType: 'hybrid', panelSize: '8',   systemSize: '10' },
      ],
      note: 'Panels at panelSize, inverter/structure/DB/cables/meter at systemSize (owner Q7). PH edits pairs; market rate key = <systemType>_<tier>[_<bat>]_up<systemSize>. Seeded pairs are proposals — PH confirms.',
    },
  };
  return {
    schema: PACK_CONFIG_SCHEMA,
    approved: { version: 1, approvedBy: by, approvedAt: at, note: 'Seeded from data/catalog.json (owner BOM tool v1 data).', config: clone(config) },
    draft: { version: 2, status: DRAFT_STATUS.DRAFT, basedOn: 1, updatedBy: null, updatedAt: null, submittedBy: null, submittedAt: null, config: clone(config), changeLog: [] },
    history: [{ version: 1, approvedBy: by, approvedAt: at, note: 'Seeded from catalog.' }],
  };
}

/** The config Sales/orchestrator must use. */
export function approvedConfig(store) { return store?.approved?.config ?? null; }
/** The Project Head's working copy. */
export function draftConfig(store) { return store?.draft?.config ?? null; }

function canEdit(actor) {
  try { assertCan(actor, CAPABILITY.PACKAGE_EDIT); return; } catch { /* fall through */ }
  assertCan(actor, CAPABILITY.COMMERCIAL_CONFIG_EDIT);
}

function validateSection(section, value) {
  const bad = (m, d) => { throw new PackConfigError(PACK_CONFIG_ERROR.INVALID_VALUE, m, d); };
  if (!CONFIG_SECTIONS.includes(section)) throw new PackConfigError(PACK_CONFIG_ERROR.INVALID_SECTION, `Unknown config section "${section}".`, { section, allowed: CONFIG_SECTIONS });
  if (value == null || typeof value !== 'object') bad(`${section} must be an object.`);
  if (section === 'installationMatrix') {
    for (const [size, roofs] of Object.entries(value)) {
      if (!roofs || typeof roofs !== 'object') bad(`installationMatrix.${size} must map roof → amount.`);
      for (const [roof, amt] of Object.entries(roofs)) if (!isNum(amt) || amt < 0) bad(`installationMatrix.${size}.${roof} must be a number ≥ 0.`, { size, roof, amt });
    }
  }
  if (section === 'marketRates') {
    for (const [key, sizes] of Object.entries(value)) {
      if (!sizes || typeof sizes !== 'object') bad(`marketRates.${key} must map size → amount.`);
      for (const [size, amt] of Object.entries(sizes)) if (!isNum(amt) || amt < 0) bad(`marketRates.${key}.${size} must be a number ≥ 0.`, { key, size, amt });
    }
  }
  if (section === 'transportConfig') {
    if (!isNum(value.baseDistanceKm) || value.baseDistanceKm < 0) bad('transportConfig.baseDistanceKm must be a number ≥ 0.');
    if (!Array.isArray(value.vehicles) || !value.vehicles.length) bad('transportConfig.vehicles must list at least one vehicle.');
    for (const v of value.vehicles) if (!v?.vehicleType || !isNum(v.ratePerKm) || v.ratePerKm < 0) bad('Each vehicle needs vehicleType and ratePerKm ≥ 0.', v);
  }
  if (section === 'costs') for (const [k, v] of Object.entries(value)) if (v != null && typeof v !== 'string' && (!isNum(v) || v < 0)) bad(`costs.${k} must be a number ≥ 0.`, { k, v });
  if (section === 'gst') if (!isNum(value.ratePct) || value.ratePct < 0 || value.ratePct > 100) bad('gst.ratePct must be 0–100.');
  if (section === 'pricing') if (!Object.values(PRICING_MODE).includes(value.mode)) bad(`pricing.mode must be one of ${Object.values(PRICING_MODE).join(', ')}.`);
  if (section === 'bomTemplates') {
    for (const [sys, t] of Object.entries(value)) {
      // The upgrade product has no kW sizes (its own model); every kW-pack template needs them.
      if (sys !== 'upgrade' && (!t?.sizes || typeof t.sizes !== 'object')) bad(`bomTemplates.${sys}.sizes required.`);
      if (!Array.isArray(t.slots)) bad(`bomTemplates.${sys}.slots must be an array.`);
      for (const s of t.slots) {
        if (!s.category) bad(`bomTemplates.${sys}: every slot needs a category.`, s);
        for (const q of Object.values(s.qty || {})) if (!isNum(q) || q < 0) bad(`bomTemplates.${sys}.${s.category}: qty must be numbers ≥ 0.`);
      }
      for (const f of t.fixedItems || []) { if (!f.name) bad(`bomTemplates.${sys}: fixed item needs a name.`, f); if (f.price != null && (!isNum(f.price) || f.price < 0)) bad(`fixed item ${f.name}: price ≥ 0.`); }
    }
  }
  if (section === 'structureTemplates') {
    for (const [k, t] of Object.entries(value)) {
      if (!Array.isArray(t?.items)) bad(`structureTemplates.${k}.items must be an array.`);
      for (const it of t.items) { if (!it.name || !it.type) bad(`structureTemplates.${k}: item needs name + type.`, it); if (it.type === 'tube' && !isNum(it.weightKg)) bad(`structureTemplates.${k}.${it.name}: tube needs weightKg.`); }
    }
  }
}

/**
 * Replace one section of the DRAFT. Whole-section replace keeps the transport
 * dumb and the audit line explicit. Refused while SUBMITTED (Admin must
 * approve or reject first) unless `force` (PH withdraws by editing → back to DRAFT).
 */
export function updateDraftSection(store, { actor, section, value, at, note = null }) {
  canEdit(actor); requireAt(at);
  validateSection(section, value);
  const s = clone(store);
  if (s.draft.status === DRAFT_STATUS.SUBMITTED) s.draft.status = DRAFT_STATUS.DRAFT; // editing withdraws the submission
  const before = s.draft.config[section];
  s.draft.config[section] = clone(value);
  s.draft.updatedBy = actor.userId ?? actor.role; s.draft.updatedAt = at;
  s.draft.changeLog.push({ at, by: actor.userId ?? actor.role, section, note, changed: JSON.stringify(before) !== JSON.stringify(value) });
  return s;
}

/** Convenience: patch one template (slots / fixedItems / sizes) of one system type. */
export function updateDraftTemplate(store, { actor, systemType, template, at, note = null }) {
  const cur = clone(draftConfig(store)?.bomTemplates || {});
  cur[systemType] = { ...(cur[systemType] || {}), ...clone(template) };
  return updateDraftSection(store, { actor, section: 'bomTemplates', value: cur, at, note: note || `template ${systemType}` });
}

export function submitDraft(store, { actor, at }) {
  assertCan(actor, CAPABILITY.PACKAGE_SUBMIT); requireAt(at);
  const s = clone(store);
  if (s.draft.status === DRAFT_STATUS.SUBMITTED) throw new PackConfigError(PACK_CONFIG_ERROR.ALREADY_SUBMITTED, 'Draft is already submitted for approval.');
  if (JSON.stringify(s.draft.config) === JSON.stringify(s.approved.config)) throw new PackConfigError(PACK_CONFIG_ERROR.NO_CHANGES, 'Draft is identical to the approved configuration; nothing to submit.');
  s.draft.status = DRAFT_STATUS.SUBMITTED; s.draft.submittedBy = actor.userId ?? actor.role; s.draft.submittedAt = at;
  return s;
}

/** Admin only. Promotes the submitted draft to the approved configuration (new version). */
export function approveDraft(store, { actor, at, note = null }) {
  assertCan(actor, CAPABILITY.PACKAGE_APPROVE); requireAt(at);
  const s = clone(store);
  if (s.draft.status !== DRAFT_STATUS.SUBMITTED) throw new PackConfigError(PACK_CONFIG_ERROR.NOT_SUBMITTED, 'Only a SUBMITTED draft can be approved.');
  const version = s.draft.version;
  s.approved = { version, approvedBy: actor.userId ?? actor.role, approvedAt: at, note, submittedBy: s.draft.submittedBy, submittedAt: s.draft.submittedAt, config: clone(s.draft.config) };
  s.history.push({ version, approvedBy: actor.userId ?? actor.role, approvedAt: at, note, changes: s.draft.changeLog.length });
  s.draft = { version: version + 1, status: DRAFT_STATUS.DRAFT, basedOn: version, updatedBy: null, updatedAt: null, submittedBy: null, submittedAt: null, config: clone(s.draft.config), changeLog: [] };
  return s;
}

/**
 * Admin shortcut (2026-09-10 owner feedback: "confused how to approve the
 * market rates"). When Admin has edited the draft directly there is no
 * Project Head submission to approve, so the two-step lifecycle dead-ends.
 * This approves the current DRAFT in one step: it is recorded as submitted
 * AND approved by the Admin (audit line in the change log + history) so the
 * separation of duties is visible, never hidden. PACKAGE_APPROVE only; a
 * SUBMITTED draft takes the normal approve path; identical draft → NO_CHANGES.
 */
export function approveDraftDirect(store, { actor, at, note = null }) {
  assertCan(actor, CAPABILITY.PACKAGE_APPROVE); requireAt(at);
  if (store.draft.status === DRAFT_STATUS.SUBMITTED) return approveDraft(store, { actor, at, note });
  if (JSON.stringify(store.draft.config) === JSON.stringify(store.approved.config)) throw new PackConfigError(PACK_CONFIG_ERROR.NO_CHANGES, 'Draft is identical to the approved configuration; nothing to publish.');
  const s = clone(store);
  const by = actor.userId ?? actor.role;
  s.draft.status = DRAFT_STATUS.SUBMITTED; s.draft.submittedBy = by; s.draft.submittedAt = at;
  s.draft.changeLog.push({ at, by, section: '*', note: 'DIRECT APPROVE by Admin (no Project Head submission)', changed: false });
  return approveDraft(s, { actor, at, note: note || 'direct approve by Admin' });
}

export function rejectDraft(store, { actor, at, reason }) {
  assertCan(actor, CAPABILITY.PACKAGE_APPROVE); requireAt(at);
  const s = clone(store);
  if (s.draft.status !== DRAFT_STATUS.SUBMITTED) throw new PackConfigError(PACK_CONFIG_ERROR.NOT_SUBMITTED, 'Only a SUBMITTED draft can be rejected.');
  s.draft.status = DRAFT_STATUS.DRAFT; s.draft.rejectedBy = actor.userId ?? actor.role; s.draft.rejectedAt = at; s.draft.rejectionReason = reason || null;
  s.draft.changeLog.push({ at, by: actor.userId ?? actor.role, section: '*', note: `REJECTED: ${reason || ''}`, changed: false });
  return s;
}

/** PH discards draft edits and starts again from the approved configuration. */
export function resetDraft(store, { actor, at }) {
  canEdit(actor); requireAt(at);
  const s = clone(store);
  s.draft = { version: s.approved.version + 1, status: DRAFT_STATUS.DRAFT, basedOn: s.approved.version, updatedBy: actor.userId ?? actor.role, updatedAt: at, submittedBy: null, submittedAt: null, config: clone(s.approved.config), changeLog: [{ at, by: actor.userId ?? actor.role, section: '*', note: 'reset to approved', changed: false }] };
  return s;
}

/** Summary for UIs (no mutation). */
export function describeStore(store) {
  const diff = [];
  for (const k of CONFIG_SECTIONS) if (JSON.stringify(store.draft?.config?.[k]) !== JSON.stringify(store.approved?.config?.[k])) diff.push(k);
  return {
    schema: store.schema,
    approved: { version: store.approved.version, approvedBy: store.approved.approvedBy, approvedAt: store.approved.approvedAt, note: store.approved.note ?? null },
    draft: { version: store.draft.version, status: store.draft.status, basedOn: store.draft.basedOn, updatedBy: store.draft.updatedBy, updatedAt: store.draft.updatedAt, submittedBy: store.draft.submittedBy, submittedAt: store.draft.submittedAt, rejectionReason: store.draft.rejectionReason ?? null, changedSections: diff, changeLog: store.draft.changeLog.slice(-50) },
    history: store.history.slice(-50),
  };
}

// ---------------------------------------------------------------------------
// Pack keys & sizes — shared vocabulary for bom-builder, pricing and Sales
// ---------------------------------------------------------------------------

/** Market-rate key exactly as the owner's tool built it: `<sys>_<tier>[_<bat>][_up<systemSize>]`. */
export function marketRateKey({ systemType, tier, batteryConfig = null, futureSystemSize = null }) {
  const bat = systemType === 'hybrid' ? `_${batteryConfig ?? 0}` : '';
  const up = futureSystemSize ? `_up${futureSystemSize}` : '';
  return `${systemType}_${tier}${bat}${up}`;
}

/** Sizes a Sales user may offer for a system type — from the APPROVED template, never hard-coded. */
export function approvedSizes(config, systemType) {
  const t = config?.bomTemplates?.[systemType];
  if (!t) return [];
  return Object.entries(t.sizes || {}).map(([key, label]) => ({ key, label, phase: (t.threePhase || []).includes(key) ? '3P' : '1P' }));
}

/** Future-ready pairs applicable to a panel size (from approved config). */
export function futurePairsFor(config, systemType, panelSize) {
  const pairs = config?.futureUpgrade?.pairs || [];
  const t = config?.bomTemplates?.[systemType];
  const sizes = new Set(Object.keys(t?.sizes || {}));
  const phaseOf = (k) => ((t?.threePhase || []).includes(String(k)) ? '3P' : '1P');
  return pairs.filter(p => (p.systemType || systemType) === systemType
    && String(p.panelSize) === String(panelSize)
    && sizes.has(String(p.systemSize))
    && phaseOf(p.panelSize) === phaseOf(p.systemSize));
}

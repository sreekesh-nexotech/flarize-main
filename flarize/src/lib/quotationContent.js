/**
 * QUOTATION CONTENT — the editable, bilingual customer-facing text of the
 * quotation document (P1, 2026-09-13).
 *
 * One structured store, two languages (`en`, `ml`), one lifecycle:
 *   draft  --(publish, ADMIN | PROJECT_HEAD)-->  published (version+1)
 * New quotations snapshot the PUBLISHED content at issue time; an issued
 * document never changes when the store is edited later.
 *
 * Sections (all text fields are `{ en, ml }`):
 *   labels             fixed headings / captions used by pages 3, 8, 9, 10, 11
 *   terms[]            { title, body }            pages 10–11 (1..19)
 *   timeline[]         { days, title, body }      page 9 (4..6 steps)
 *   weHandle[]         text                       page 9 left column
 *   customerScope[]    text                       page 9 right column
 *   requiredDocuments[] text                      page 8
 *   lifeNow[] / lifeSolar[]  { title, body }      page 3 bottom
 *   extraStructureCost { label, value }           page 8
 *   appliances.master[] { id, name, icon, watts, defaultHours, optional }
 *   appliances.profiles { "<kW>": [{ id, qty, hours }] }   page 3 table
 *
 * FIT GUARD — every field has a hard character / count limit derived from
 * the A4 layout so an edit can never overflow a page. `validateContent`
 * returns the full list of violations; the server refuses to save a draft
 * that has any, and the editor shows live counters against the same LIMITS.
 *
 * Pure module: no I/O. Persistence + RBAC live in server-content.js.
 */

export const CONTENT_STORE_VERSION = 'quotationContent.1';
export const LANGUAGES = Object.freeze(['en', 'ml']);
export const DEFAULT_LANGUAGE = 'en';

/** Per-field limits. Counts are UTF-16 code units (what `String.length`
 *  gives in the browser), so Malayalam — visually shorter per glyph but
 *  longer in code units — gets its own, larger budgets. */
export const LIMITS = Object.freeze({
  terms: { min: 1, max: 19, title: { en: 60, ml: 90 }, body: { en: 1000, ml: 1100 }, totalBody: { en: 9200, ml: 9800 } },
  timeline: { min: 4, max: 6, days: { en: 6, ml: 6 }, title: { en: 42, ml: 60 }, body: { en: 170, ml: 190 } },
  weHandle: { min: 3, max: 8, item: { en: 120, ml: 140 } },
  customerScope: { min: 3, max: 8, item: { en: 270, ml: 280 } },
  requiredDocuments: { min: 1, max: 8, item: { en: 60, ml: 90 } },
  lifeNow: { min: 3, max: 3, title: { en: 32, ml: 48 }, body: { en: 90, ml: 110 } },
  lifeSolar: { min: 3, max: 3, title: { en: 32, ml: 48 }, body: { en: 90, ml: 110 } },
  extraStructureCost: { label: { en: 48, ml: 64 }, value: 20 },
  labels: { en: 300, ml: 360 },
  appliances: { masterMax: 16, profileRowsMax: 9, nameMax: 28, wattsMax: 10000, hoursMax: 24, qtyMax: 50, loadRatioMax: 0.95 },
});

/** Daily generation per kW (units/day) used only for the profile fit rule
 *  when the caller does not supply one; energy-config.json is the authority. */
export const FALLBACK_DAILY_GEN_PER_KW = 4.0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const round1 = (n) => Math.round(n * 10) / 10;

/** Pick the string for a language with fallback to English, then anything. */
export function pick(field, lang = DEFAULT_LANGUAGE) {
  if (field == null) return '';
  if (typeof field === 'string') return field;
  if (!isObj(field)) return '';
  const v = field[lang];
  if (typeof v === 'string' && v.trim()) return v;
  const en = field.en;
  if (typeof en === 'string' && en.trim()) return en;
  for (const k of Object.keys(field)) if (typeof field[k] === 'string' && field[k].trim()) return field[k];
  return '';
}

/** Normalise a language code from any source ('ML', 'malayalam', undefined). */
export function normaliseLanguage(v) {
  const s = str(v).trim().toLowerCase();
  if (s === 'ml' || s === 'malayalam' || s === 'ml-in') return 'ml';
  return 'en';
}

/** Label lookup with `{kw}`-style interpolation. */
export function label(content, key, lang, vars) {
  const raw = pick(content?.labels?.[key], lang);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
}

// ---------------------------------------------------------------------------
// Appliances
// ---------------------------------------------------------------------------

/** Profile key for a system size: the largest configured band <= kW, else the smallest. */
export function profileKeyForKw(profiles, kw) {
  const keys = Object.keys(profiles || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!keys.length) return null;
  const n = Number(kw);
  let best = null;
  for (const k of keys) { if (k <= n) best = k; }
  return String(best == null ? keys[0] : best);
}

/** Resolve profile rows → printable rows with units, using the master for watts/name. */
export function materialiseRows(content, rows, lang = DEFAULT_LANGUAGE) {
  const master = new Map((content?.appliances?.master || []).map(m => [m.id, m]));
  const out = [];
  for (const r of rows || []) {
    const m = master.get(r?.id);
    if (!m) continue;
    const qty = Math.max(0, Number(r.qty) || 0);
    const hours = Math.max(0, Number(r.hours ?? m.defaultHours) || 0);
    const watts = Math.max(0, Number(r.watts ?? m.watts) || 0);
    const units = round1(qty * watts * hours / 1000);
    out.push({ id: m.id, name: pick(m.name, lang), icon: m.icon || '', qty, hours, watts, units });
  }
  return out;
}

export function totalUnits(rows) {
  return round1((rows || []).reduce((s, r) => s + (Number(r.units) || 0), 0));
}

/** Default rows for a kW from the published profiles (qty/hours only — watts come from the master at render time). */
export function defaultRowsForKw(content, kw) {
  const key = profileKeyForKw(content?.appliances?.profiles, kw);
  const rows = key ? content.appliances.profiles[key] : [];
  return { profileKey: key, rows: (rows || []).map(r => ({ id: r.id, qty: r.qty, hours: r.hours })) };
}

/** Daily generation for a size, used by the fit rule and the page-3 cards. */
export function dailyGenerationForKw(kw, dailyGenPerKw = FALLBACK_DAILY_GEN_PER_KW) {
  return round1(Number(kw) * Number(dailyGenPerKw || FALLBACK_DAILY_GEN_PER_KW));
}

// ---------------------------------------------------------------------------
// Validation (fit guard)
// ---------------------------------------------------------------------------

function checkText(errors, path, field, limits, required = true) {
  for (const lang of LANGUAGES) {
    const v = str(field?.[lang]).trim();
    if (!v && required) { errors.push({ path: `${path}.${lang}`, code: 'REQUIRED', message: `${path} (${lang}) is required` }); continue; }
    const max = limits[lang];
    if (v.length > max) errors.push({ path: `${path}.${lang}`, code: 'TOO_LONG', message: `${path} (${lang}) is ${v.length - max} characters over the limit of ${max}`, length: v.length, max });
  }
}

function checkList(errors, path, list, lim, itemCheck) {
  if (!Array.isArray(list)) { errors.push({ path, code: 'INVALID', message: `${path} must be a list` }); return; }
  if (list.length < lim.min) errors.push({ path, code: 'TOO_FEW', message: `${path} needs at least ${lim.min} item(s)` });
  if (list.length > lim.max) errors.push({ path, code: 'TOO_MANY', message: `${path} allows at most ${lim.max} item(s) — the page cannot fit more` });
  list.slice(0, lim.max).forEach((item, i) => itemCheck(`${path}[${i + 1}]`, item));
}

/**
 * Validate a content object. Returns [] when it fits, else a list of
 * { path, code, message }. `opts.dailyGenPerKw` tightens the appliance rule to
 * the live energy config.
 */
export function validateContent(content, opts = {}) {
  const errors = [];
  if (!isObj(content)) return [{ path: '', code: 'INVALID', message: 'content must be an object' }];
  const L = LIMITS;

  // labels — every key present in the seed must stay present (renderer relies on them)
  if (!isObj(content.labels)) errors.push({ path: 'labels', code: 'INVALID', message: 'labels missing' });
  else for (const [k, f] of Object.entries(content.labels)) checkText(errors, `labels.${k}`, f, L.labels);

  checkList(errors, 'terms', content.terms, L.terms, (p, it) => { checkText(errors, `${p}.title`, it?.title, L.terms.title); checkText(errors, `${p}.body`, it?.body, L.terms.body); });
  if (Array.isArray(content.terms)) {
    for (const lang of LANGUAGES) {
      const total = content.terms.reduce((s, t) => s + str(t?.body?.[lang]).length + str(t?.title?.[lang]).length, 0);
      if (total > L.terms.totalBody[lang]) errors.push({ path: `terms.${lang}`, code: 'TOO_LONG', message: `Terms (${lang}) total ${total} characters — pages 10–11 fit ${L.terms.totalBody[lang]}`, length: total, max: L.terms.totalBody[lang] });
    }
  }
  checkList(errors, 'timeline', content.timeline, L.timeline, (p, it) => { checkText(errors, `${p}.days`, it?.days, L.timeline.days); checkText(errors, `${p}.title`, it?.title, L.timeline.title); checkText(errors, `${p}.body`, it?.body, L.timeline.body); });
  checkList(errors, 'weHandle', content.weHandle, L.weHandle, (p, it) => checkText(errors, p, it, L.weHandle.item));
  checkList(errors, 'customerScope', content.customerScope, L.customerScope, (p, it) => checkText(errors, p, it, L.customerScope.item));
  checkList(errors, 'requiredDocuments', content.requiredDocuments, L.requiredDocuments, (p, it) => checkText(errors, p, it, L.requiredDocuments.item));
  checkList(errors, 'lifeNow', content.lifeNow, L.lifeNow, (p, it) => { checkText(errors, `${p}.title`, it?.title, L.lifeNow.title); checkText(errors, `${p}.body`, it?.body, L.lifeNow.body); });
  checkList(errors, 'lifeSolar', content.lifeSolar, L.lifeSolar, (p, it) => { checkText(errors, `${p}.title`, it?.title, L.lifeSolar.title); checkText(errors, `${p}.body`, it?.body, L.lifeSolar.body); });
  if (isObj(content.extraStructureCost)) {
    checkText(errors, 'extraStructureCost.label', content.extraStructureCost.label, L.extraStructureCost.label);
    if (str(content.extraStructureCost.value).length > L.extraStructureCost.value) errors.push({ path: 'extraStructureCost.value', code: 'TOO_LONG', message: `extraStructureCost.value over ${L.extraStructureCost.value} characters` });
  }

  // appliances
  const A = content.appliances;
  if (!isObj(A) || !Array.isArray(A.master) || !isObj(A.profiles)) errors.push({ path: 'appliances', code: 'INVALID', message: 'appliances.master (list) and appliances.profiles (object) are required' });
  else {
    if (A.master.length > L.appliances.masterMax) errors.push({ path: 'appliances.master', code: 'TOO_MANY', message: `at most ${L.appliances.masterMax} appliances` });
    const ids = new Set();
    A.master.forEach((m, i) => {
      const p = `appliances.master[${i + 1}]`;
      if (!/^[a-z0-9_]{2,32}$/.test(str(m?.id))) errors.push({ path: `${p}.id`, code: 'INVALID', message: `${p}.id must be a short snake_case id` });
      else if (ids.has(m.id)) errors.push({ path: `${p}.id`, code: 'DUPLICATE', message: `${p}.id "${m.id}" is used twice` });
      ids.add(m?.id);
      for (const lang of LANGUAGES) if (str(m?.name?.[lang]).length > L.appliances.nameMax) errors.push({ path: `${p}.name.${lang}`, code: 'TOO_LONG', message: `${p} name (${lang}) over ${L.appliances.nameMax} characters` });
      if (!str(m?.name?.en).trim()) errors.push({ path: `${p}.name.en`, code: 'REQUIRED', message: `${p} needs an English name` });
      const w = Number(m?.watts); if (!(w > 0 && w <= L.appliances.wattsMax)) errors.push({ path: `${p}.watts`, code: 'INVALID', message: `${p} watts must be 1–${L.appliances.wattsMax}` });
      const h = Number(m?.defaultHours); if (!(h >= 0 && h <= L.appliances.hoursMax)) errors.push({ path: `${p}.defaultHours`, code: 'INVALID', message: `${p} default hours must be 0–24` });
    });
    const gen = Number(opts.dailyGenPerKw) > 0 ? Number(opts.dailyGenPerKw) : FALLBACK_DAILY_GEN_PER_KW;
    for (const [kw, rows] of Object.entries(A.profiles)) {
      const p = `appliances.profiles["${kw}"]`;
      if (!(Number(kw) > 0)) { errors.push({ path: p, code: 'INVALID', message: `${p}: profile key must be a kW number` }); continue; }
      if (!Array.isArray(rows)) { errors.push({ path: p, code: 'INVALID', message: `${p} must be a list of rows` }); continue; }
      if (rows.length > L.appliances.profileRowsMax) errors.push({ path: p, code: 'TOO_MANY', message: `${p}: page 3 fits at most ${L.appliances.profileRowsMax} rows` });
      const seen = new Set();
      rows.forEach((r, i) => {
        const rp = `${p}[${i + 1}]`;
        if (!ids.has(r?.id)) errors.push({ path: rp, code: 'UNKNOWN_APPLIANCE', message: `${rp}: "${r?.id}" is not in the appliance master` });
        if (seen.has(r?.id)) errors.push({ path: rp, code: 'DUPLICATE', message: `${rp}: "${r?.id}" listed twice` });
        seen.add(r?.id);
        const q = Number(r?.qty); if (!(q >= 0 && q <= L.appliances.qtyMax)) errors.push({ path: `${rp}.qty`, code: 'INVALID', message: `${rp} quantity must be 0–${L.appliances.qtyMax}` });
        const h = Number(r?.hours); if (!(h >= 0 && h <= L.appliances.hoursMax)) errors.push({ path: `${rp}.hours`, code: 'INVALID', message: `${rp} hours must be 0–24` });
      });
      const total = totalUnits(materialiseRows(content, rows));
      const cap = round1(Number(kw) * gen * L.appliances.loadRatioMax);
      if (total > cap) errors.push({ path: p, code: 'OVER_GENERATION', message: `${kw} kW profile uses ${total} units/day — must stay under ${cap} (95% of ${round1(Number(kw) * gen)} units the system generates)`, total, cap });
    }
  }
  return errors;
}

/** Human summary per section for the editor: current counts against limits. */
export function fitSummary(content, opts = {}) {
  const errors = validateContent(content, opts);
  const bySection = {};
  for (const e of errors) {
    const sec = e.path.split(/[.[]/)[0] || 'content';
    (bySection[sec] = bySection[sec] || []).push(e);
  }
  return { ok: errors.length === 0, errors, bySection };
}

// ---------------------------------------------------------------------------
// Store lifecycle (pure functions over the store object)
// ---------------------------------------------------------------------------

export function createEmptyStore(content) {
  return {
    storeVersion: CONTENT_STORE_VERSION,
    published: { version: 1, publishedAt: null, publishedBy: null, content },
    draft: { version: 2, updatedAt: null, updatedBy: null, content: JSON.parse(JSON.stringify(content)) },
  };
}

export function getPublished(store) { return store?.published?.content || null; }
export function getDraft(store) { return store?.draft?.content || null; }

export function saveDraft(store, content, actor, at = new Date().toISOString(), opts = {}) {
  const errors = validateContent(content, opts);
  if (errors.length) { const e = new Error('Content does not fit the page'); e.code = 'CONTENT_INVALID'; e.errors = errors; throw e; }
  store.draft = { version: store.draft?.version ?? (store.published.version + 1), updatedAt: at, updatedBy: actor?.userId || null, content: JSON.parse(JSON.stringify(content)) };
  return store;
}

export function publishDraft(store, actor, at = new Date().toISOString(), opts = {}) {
  const errors = validateContent(store.draft?.content, opts);
  if (errors.length) { const e = new Error('Draft does not fit the page — fix before publishing'); e.code = 'CONTENT_INVALID'; e.errors = errors; throw e; }
  const version = (store.published?.version || 0) + 1;
  store.published = { version, publishedAt: at, publishedBy: actor?.userId || null, content: JSON.parse(JSON.stringify(store.draft.content)) };
  store.draft = { version: version + 1, updatedAt: null, updatedBy: null, content: JSON.parse(JSON.stringify(store.published.content)) };
  return store;
}

export function discardDraft(store) {
  store.draft = { version: (store.published?.version || 0) + 1, updatedAt: null, updatedBy: null, content: JSON.parse(JSON.stringify(store.published.content)) };
  return store;
}

export function describeStore(store) {
  const same = JSON.stringify(store?.draft?.content) === JSON.stringify(store?.published?.content);
  return {
    published: { version: store?.published?.version, publishedAt: store?.published?.publishedAt, publishedBy: store?.published?.publishedBy },
    draft: { version: store?.draft?.version, updatedAt: store?.draft?.updatedAt, updatedBy: store?.draft?.updatedBy, unpublishedChanges: !same },
  };
}

/**
 * kW PACKS — Project Head configuration workspace (2026-09-08 fast-quotation build).
 *
 * One page where the Project Head authors the pack configuration DRAFT
 * (kW sizes, slot templates with Sales-swap / default / alternatives,
 * consumables, roof structure tables, costs, installation matrix, transport,
 * GST / pricing mode, market rates, future-ready pairs), submits it, and
 * Admin approves → the APPROVED version is published to the package
 * registry and becomes what Sales quotes from.
 *
 * Everything commercial is validated and gated SERVER-SIDE
 * (src/lib/packConfig.js + server-pack-config.js). This file renders the
 * draft, stages edits per section and PUTs whole sections with a
 * caller-supplied timestamp.
 *
 * Routes (all existing):
 *   GET  /api/pack-config                      summary
 *   GET  /api/pack-config/draft | /approved     configs
 *   GET  /api/catalog                          component master (PH sees reference price)
 *   PUT  /api/pack-config/draft/:section        { value, at, note }
 *   POST /api/pack-config/draft/submit|approve|reject|reset   { at, reason? }
 *   POST /api/pack-config/publish               { at }   (Admin re-publish)
 *   POST /api/sales/bom-preview                 { configSource:'draft', ... }
 *   POST /api/sales/price-preview               { configSource:'draft', ... }
 */
'use strict';

const SESSION_KEY = 'gr_session_token';
const ROLE_KEY = 'gr_user_role';
const SALES_ROLES = ['SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES'];
const ROOFS = [['flatRoof', 'Flat roof', 'flat'], ['sheetRoof', 'Sheet roof', 'sheet'], ['elevated', 'Elevated', 'elevated']];
const TIERS = ['base', 'value', 'premium'];
const SECTION_TABS = {
  packs: ['bomTemplates'],
  consumables: ['bomTemplates'],
  structure: ['structureTemplates', 'tubeWeights'],
  costs: ['costs', 'installationMatrix', 'transportConfig', 'gst', 'pricing'],
  rates: ['marketRates'],
  future: ['futureUpgrade'],
  review: [],
};
const TAB_LABELS = { packs: 'Packs & slots', consumables: 'Consumables', structure: 'Structure', costs: 'Costs · Installation · Transport', rates: 'Market rates', future: 'Future ready', review: 'Review & approve' };

const $ = (s, r = document) => r.querySelector(s);
const el = (t, a = {}, ...kids) => {
  const n = document.createElement(t);
  for (const [k, v] of Object.entries(a)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === false || v == null) {}
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};
const inr = n => n == null || !Number.isFinite(Number(n)) ? '—' : '₹' + Math.round(n).toLocaleString('en-IN');
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const clone = v => JSON.parse(JSON.stringify(v));
const nowIso = () => new Date().toISOString();

const S = {
  role: '', userId: '',
  summary: null,          // GET /api/pack-config
  draft: null,            // { version, status, config, changeLog }
  approved: null,         // { version, config }
  catalog: null,          // GET /api/catalog (PH view)
  tab: 'packs',
  sys: 'ongrid',
  dirty: new Set(),       // sections edited locally, not yet PUT
  lastPublish: null,
  preview: { sys: 'ongrid', size: null, tier: 'value', roof: 'FLAT', km: 20, bat: 1, fr: '' },
};
const cfg = () => S.draft?.config;
const canEdit = () => S.role === 'PROJECT_HEAD' || S.role === 'ADMIN';
const canApprove = () => S.role === 'ADMIN';
const canSubmit = () => S.role === 'PROJECT_HEAD';

function getToken() { try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } }
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!r.ok) throw Object.assign(new Error(data?.error || r.statusText), { status: r.status, code: data?.code, body: data });
  return data;
}
function toast(msg, kind = '') { const t = $('#toast'); t.textContent = msg; t.className = `toast ${kind}`; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 5000); }
function markDirty(section) { S.dirty.add(section); renderSaveBar(); renderPills(); }

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
async function boot() {
  if (!getToken()) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return; }
  try {
    const me = await api('GET', '/api/auth/session');
    S.role = me?.user?.role || me?.role || sessionStorage.getItem(ROLE_KEY) || '';
    S.userId = me?.user?.userId || me?.userId || '';
  } catch (e) { if (e.status === 401) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return; } }
  if (SALES_ROLES.includes(S.role)) { location.replace('/sales.html'); return; }
  $('#pillRole').textContent = `${S.userId || ''} · ${S.role}`;
  $('#btnSave').addEventListener('click', saveDirty);
  $('#btnReload').addEventListener('click', async () => { if (S.dirty.size && !confirm('Discard unsaved edits and reload the draft?')) return; await loadAll(); toast('Draft reloaded'); });
  window.addEventListener('beforeunload', (e) => { if (S.dirty.size) { e.preventDefault(); e.returnValue = ''; } });
  await loadAll();
}

async function loadAll() {
  try {
    const [summary, draft, approved, catalog, batteryMaster] = await Promise.all([
      api('GET', '/api/pack-config'), api('GET', '/api/pack-config/draft'), api('GET', '/api/pack-config/approved'), api('GET', '/api/catalog'),
      api('GET', '/api/engineering/battery-master').catch(() => ({ batteries: {} })),
    ]);
    S.summary = summary; S.draft = draft; S.approved = approved; S.catalog = catalog; S.batteryMaster = batteryMaster.batteries || {}; S.dirty.clear();
    if (!cfg().bomTemplates[S.sys]) S.sys = Object.keys(cfg().bomTemplates).find(k => k !== 'upgrade') || S.sys;
    renderTabs(); renderPills(); renderSaveBar(); renderView();
  } catch (e) { toast('Failed to load pack configuration: ' + e.message, 'bad'); }
}

// ---------------------------------------------------------------------------
// shell
// ---------------------------------------------------------------------------
function renderTabs() {
  const t = $('#tabs');
  // Build once; afterwards update in place so a blur-change re-render never
  // replaces the tab button the user is clicking on.
  if (!t.childElementCount) for (const [key, label] of Object.entries(TAB_LABELS)) t.append(el('button', { 'data-tab': key, onclick: () => { S.tab = key; renderTabs(); renderView(); } }, label, el('b', { hidden: true }, '●')));
  for (const btn of t.children) {
    const key = btn.dataset.tab;
    btn.className = S.tab === key ? 'on' : '';
    btn.querySelector('b').hidden = !SECTION_TABS[key].some(s => S.dirty.has(s));
  }
}
function renderPills() {
  const a = $('#pillApproved'); a.replaceChildren(el('span', { class: 'dot' }), ` approved v${S.approved?.version ?? '—'}`);
  const d = $('#pillDraft'); const st = S.draft?.status || '—';
  d.className = 'pill ' + (st === 'SUBMITTED' ? 'warn' : S.dirty.size ? 'warn' : 'ok');
  const changed = S.summary?.draft?.changedSections || [];
  d.replaceChildren(el('span', { class: 'dot' }), ` draft v${S.draft?.version ?? '—'} · ${st}${S.dirty.size ? ` · ${S.dirty.size} unsaved` : changed.length ? ` · ${changed.length} section(s) changed` : ' · = approved'}`);
  renderTabs(); renderFlow();
}

/** Market-rate cells that are empty in the DRAFT → those packs are blocked for Sales. */
function missingRates() {
  if (!cfg()) return [];
  const mr = cfg().marketRates || {};
  const out = [];
  for (const r of rateRows()) for (const size of r.sizes) if (!(Number(mr[r.key]?.[size]) > 0)) out.push({ ...r, size });
  return out;
}

/**
 * Guided "how do my edits reach Sales" banner (2026-09-10 owner feedback:
 * "confused how to approve the market rates"). One primary button per role:
 *   Project Head : Save → Submit for approval (Admin then approves)
 *   Admin        : Save & publish now (approve the draft in one step)
 */
function renderFlow() {
  const f = $('#flow'); if (!f || !cfg()) return;
  const status = S.draft?.status; const changed = S.summary?.draft?.changedSections || [];
  const dirty = S.dirty.size > 0; const hasChanges = dirty || changed.length > 0;
  const stage = dirty ? 1 : status === 'SUBMITTED' ? 3 : changed.length ? 2 : 4; // 1 unsaved, 2 saved draft, 3 submitted, 4 published
  const miss = missingRates();
  // Rebuild only when the state actually changed: an input's blur-change fires
  // markDirty → renderFlow while the user is clicking a banner button, and
  // replacing the button mid-click would swallow the click.
  const sig = JSON.stringify([stage, [...S.dirty], status, changed, miss.length, S.draft?.version, S.approved?.version, S.role]);
  if (f.dataset.sig === sig && f.childElementCount) return;
  f.dataset.sig = sig;
  const STEPS = ['Edit', 'Save to draft', canApprove() && status !== 'SUBMITTED' ? 'Publish' : 'Submit to Admin', 'Approved · Sales quotes it'];
  const steps = el('div', { class: 'steps' });
  STEPS.forEach((label, i) => {
    const n = i + 1;
    const cls = stage === 4 && !hasChanges ? 'done' : n < stage ? 'done' : n === stage ? 'now' : '';
    steps.append(el('span', { class: 'step ' + cls }, el('i', {}, cls === 'done' ? '✓' : String(n)), label));
    if (i < STEPS.length - 1) steps.append(el('span', { class: 'step arr', style: 'border:0;background:none;padding:0' }, '→'));
  });
  f.className = 'flow ' + (stage === 4 && !hasChanges ? 'ok' : stage === 3 ? 'warn' : 'warn');
  const actions = el('div', { class: 'row' });
  const msg = el('div', { class: 'msg' });
  if (dirty) {
    msg.append(`You have unsaved edits in: ${[...S.dirty].join(', ')}. Sales is not affected until the draft is approved.`);
    if (canApprove()) actions.append(el('button', { class: 'btn p', onclick: () => saveThen('approve') }, 'Save & publish now'), el('button', { class: 'btn', onclick: saveDirty }, 'Save only'));
    else if (canSubmit()) actions.append(el('button', { class: 'btn p', onclick: () => saveThen('submit') }, 'Save & submit for approval'), el('button', { class: 'btn', onclick: saveDirty }, 'Save only'));
    else actions.append(el('button', { class: 'btn p', onclick: saveDirty }, 'Save to draft'));
  } else if (status === 'SUBMITTED') {
    msg.append(`Draft v${S.draft.version} is waiting for Admin approval (submitted by ${S.summary?.draft?.submittedBy || '—'}). `);
    if (canApprove()) actions.append(el('button', { class: 'btn p', onclick: () => confirmApprove() }, 'Approve & publish'), el('button', { class: 'btn d', onclick: () => { const reason = prompt('Rejection reason for the Project Head'); if (reason != null) lifecycle('reject', { reason }); } }, 'Reject'));
    else msg.append('Editing anything withdraws the submission.');
  } else if (changed.length) {
    msg.append(`Draft v${S.draft.version} differs from the approved v${S.approved?.version} in: ${changed.join(', ')}. Sales still quotes the approved version. `);
    if (canApprove()) actions.append(el('button', { class: 'btn p', onclick: () => confirmApprove() }, 'Publish now'));
    else if (canSubmit()) actions.append(el('button', { class: 'btn p', onclick: () => lifecycle('submit') }, 'Submit for approval'));
    else msg.append('Ask the Project Head to submit it.');
  } else {
    msg.append(`Approved v${S.approved?.version} is live — Sales quotes from it. Edit any tab; the banner tells you what to do next.`);
  }
  if (miss.length) {
    const bySys = {}; for (const m of miss) (bySys[m.sys] = bySys[m.sys] || []).push(`${tmpl(m.sys)?.sizes?.[m.size] || m.size} ${m.tier}${m.bat != null ? ` ${m.bat}bat` : ''}${m.fr ? ' →' + m.fr : ''}`);
    msg.append(el('span', { class: 'tag bad' }, `${miss.length} pack${miss.length > 1 ? 's' : ''} without market rate`),
      el('span', {}, ' — Sales cannot quote those (blocked, never guessed). '),
      el('button', { class: 'lnk', onclick: () => { S.tab = 'rates'; renderTabs(); renderView(); } }, 'Open Market rates'));
    if (stage === 4) f.className = 'flow bad';
  }
  f.replaceChildren(steps, actions, msg); f.hidden = false;
}
function confirmApprove() {
  const d = S.summary?.draft || {};
  if (confirm(`Publish draft v${d.version}? It becomes the live configuration Sales quotes from, and every kW pack is re-published. Packs with missing data are listed afterwards as blocked.`)) lifecycle('approve', { direct: true });
}
async function saveThen(action) {
  const before = S.dirty.size;
  await saveDirty();
  if (S.dirty.size) return; // save failed → toast already shown
  if (!before && !(S.summary?.draft?.changedSections || []).length) { toast('Nothing changed versus the approved configuration.', 'warn'); return; }
  if (action === 'approve') confirmApprove(); else await lifecycle('submit');
}
function renderSaveBar() {
  $('#btnSave').disabled = !S.dirty.size || !canEdit();
  $('#dirtyNote').textContent = S.dirty.size ? `Unsaved: ${[...S.dirty].join(', ')} — saving writes the DRAFT only (Sales unaffected until Admin approves).` : (canEdit() ? 'No unsaved changes.' : 'Read-only for your role.');
}
async function saveDirty() {
  if (!S.dirty.size) return;
  const at = nowIso();
  const sections = [...S.dirty];
  try {
    for (const section of sections) {
      const value = cfg()[section];
      const r = await api('PUT', `/api/pack-config/draft/${section}`, { value, at, note: `edited in kW Packs workspace (${section})` });
      S.summary = r; S.dirty.delete(section);
    }
    S.draft = await api('GET', '/api/pack-config/draft');
    toast(`Saved to draft v${S.draft.version}: ${sections.join(', ')}`, 'ok');
    renderPills(); renderSaveBar(); renderView();
  } catch (e) {
    toast(`Save failed (${e.code || e.status}): ${e.message}${e.body?.detail ? ' — ' + JSON.stringify(e.body.detail) : ''}`, 'bad');
  }
}
function renderView() {
  const v = $('#view'); v.replaceChildren();
  if (!cfg()) return;
  ({ packs: renderPacks, consumables: renderConsumables, structure: renderStructure, costs: renderCosts, rates: renderRates, future: renderFuture, review: renderReview })[S.tab](v);
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------
const sysTypes = () => Object.keys(cfg().bomTemplates).filter(k => k !== 'upgrade');
const tmpl = (sys = S.sys) => cfg().bomTemplates[sys];
const sizeKeys = (sys = S.sys) => Object.keys(tmpl(sys)?.sizes || {});
const phaseOf = (sys, size) => ((tmpl(sys)?.threePhase || []).includes(String(size)) ? '3P' : '1P');
const kwOf = (size) => Number(String(size).replace(/[^0-9.]/g, '')) || 0;
const sortedSizes = (sys = S.sys) => sizeKeys(sys).sort((a, b) => kwOf(a) - kwOf(b) || a.localeCompare(b));
const catItems = (category) => (S.catalog?.categories?.[category]?.items || []).filter(i => (i.status || 'ACTIVE') === 'ACTIVE' && (i.approvalStatus || 'APPROVED') === 'APPROVED');
const itemName = (category, id) => { const it = (S.catalog?.categories?.[category]?.items || []).find(i => i.id === id); return it ? it.name : id; };

/** Same eligibility rule as the server BOM builder (tier + phase + slot filters) — for the picker only. */
function eligible(slot, tier, sys, size) {
  const threeP = phaseOf(sys, size) === '3P';
  return catItems(slot.category).filter(item => {
    if (!item.tiers?.includes(tier)) return false;
    if (slot.filterType === 'hybrid') return item.type === 'hybrid';
    if (slot.filterType === 'ongrid' && item.type && item.type !== 'ongrid') return false;
    if (slot.filterPhase === 'HYB') { if (!item.phase?.includes('HYB')) return false; return threeP ? item.phase.includes('3P') : item.phase.includes('1P'); }
    if (threeP && item.phase) return item.phase === '3P' || item.phase.includes('3P');
    if (!threeP && item.phase) return item.phase === '1P' || item.phase.includes('1P');
    return true;
  });
}
function sysSeg(onChange) {
  return el('div', { class: 'seg' }, sysTypes().map(k => el('button', { class: S.sys === k ? 'on' : '', onclick: () => { S.sys = k; onChange(); } }, tmpl(k).label || k)));
}
function numInput(value, onChange, attrs = {}) {
  const i = el('input', { type: 'number', step: 'any', value: value ?? '', ...attrs });
  i.addEventListener('change', () => { const n = i.value === '' ? null : num(i.value); onChange(n); i.classList.add('dirty'); });
  return i;
}
function textInput(value, onChange, attrs = {}) {
  const i = el('input', { type: 'text', value: value ?? '', ...attrs });
  i.addEventListener('change', () => { onChange(i.value); i.classList.add('dirty'); });
  return i;
}
function toggle(on, onChange) { const b = el('button', { class: 'sw' + (on ? ' on' : ''), type: 'button' }); b.addEventListener('click', () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); onChange(v); }); return b; }
function ro() { return !canEdit(); }

// ---------------------------------------------------------------------------
// TAB 1 — Packs & slots (sizes, slot table, defaults / alternatives)
// ---------------------------------------------------------------------------
function renderPacks(v) {
  const t = tmpl();
  v.append(el('div', { class: 'card' },
    el('h3', {}, el('span', {}, 'System type'), sysSeg(renderView)),
    el('div', { class: 'hint' }, 'A kW size becomes quotable for Sales only after this draft is submitted, approved by Admin and published. Add a new kW here, then fill its slot quantities, consumables, installation amounts and market rates.'),
  ));

  // sizes
  const sizesCard = el('div', { class: 'card' }, el('h3', {}, el('span', {}, `kW sizes — ${t.label || S.sys}`), el('small', {}, 'key · label · phase')));
  const tb = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['KEY', 'LABEL (shown to Sales)', 'PHASE', 'kW', ''].map(h => el('th', {}, h)))));
  const body = el('tbody');
  for (const key of sortedSizes()) {
    const is3 = phaseOf(S.sys, key) === '3P';
    body.append(el('tr', {},
      el('td', { class: 'mono' }, key),
      el('td', {}, textInput(t.sizes[key], (val) => { t.sizes[key] = val; markDirty('bomTemplates'); }, { disabled: ro(), style: 'width:160px' })),
      el('td', {}, el('div', { class: 'seg' }, ['1P', '3P'].map(p => el('button', { class: (is3 ? '3P' : '1P') === p ? 'on' : '', disabled: ro(), onclick: () => { t.threePhase = (t.threePhase || []).filter(x => x !== key); if (p === '3P') t.threePhase.push(key); markDirty('bomTemplates'); renderView(); } }, p)))),
      el('td', { class: 'num' }, kwOf(key)),
      el('td', {}, el('button', { class: 'ic danger', title: 'Remove size', disabled: ro(), onclick: () => { if (!confirm(`Remove ${key} from ${S.sys}? Slot quantities, consumables and market rates for this size are dropped from the draft.`)) return; removeSize(S.sys, key); } }, '×')),
    ));
  }
  const nk = el('input', { type: 'text', placeholder: 'key e.g. 15', style: 'width:110px' });
  const nl = el('input', { type: 'text', placeholder: 'label e.g. 15 kW', style: 'width:160px' });
  const np = el('select', {}, el('option', { value: '1P' }, '1P'), el('option', { value: '3P' }, '3P'));
  body.append(el('tr', { class: 'sub' }, el('td', {}, nk), el('td', {}, nl), el('td', {}, np), el('td', {}), el('td', {}, el('button', { class: 'btn sm p', disabled: ro(), onclick: () => {
    const key = nk.value.trim(); if (!key) return toast('Size key required (e.g. 15, 5sp).', 'bad');
    if (t.sizes[key]) return toast(`Size ${key} already exists.`, 'bad');
    if (!kwOf(key)) return toast('Size key must contain the kW number.', 'bad');
    t.sizes[key] = nl.value.trim() || `${kwOf(key)} kW`;
    if (np.value === '3P') { t.threePhase = [...(t.threePhase || []), key]; }
    // Seed quantities from the nearest existing size so the PH edits, not types from scratch.
    const near = sortedSizes().filter(k => k !== key).sort((a, b) => Math.abs(kwOf(a) - kwOf(key)) - Math.abs(kwOf(b) - kwOf(key)))[0];
    for (const slot of t.slots || []) {
      for (const f of ['qty', 'premiumQty']) if (slot[f] && near && slot[f][near] != null && slot[f][key] == null) slot[f][key] = slot[f][near];
      for (const f of ['batQty', 'premiumBatQty']) if (slot[f]) for (const b of Object.keys(slot[f])) if (near && slot[f][b][near] != null && slot[f][b][key] == null) slot[f][b][key] = slot[f][b][near];
    }
    for (const fi of t.fixedItems || []) {
      if (fi.qty && near && fi.qty[near] != null && fi.qty[key] == null) fi.qty[key] = fi.qty[near];
      if (fi.batQty) for (const b of Object.keys(fi.batQty)) if (near && fi.batQty[b][near] != null && fi.batQty[b][key] == null) fi.batQty[b][key] = fi.batQty[b][near];
      if (fi.premiumQty && near && fi.premiumQty[near] != null && fi.premiumQty[key] == null) fi.premiumQty[key] = fi.premiumQty[near];
    }
    markDirty('bomTemplates'); toast(`Added ${key} (quantities seeded from ${near || 'nothing'} — review every tab, then set installation amounts and market rates).`, 'ok'); renderView();
  } }, '+ Add kW'))));
  tb.append(body); sizesCard.append(el('div', { class: 'wrap' }, tb)); v.append(sizesCard);

  // slots
  const slotsCard = el('div', { class: 'card' }, el('h3', {}, el('span', {}, 'Slots (variable items) — quantity per size · Sales swap · default · approved alternatives'), el('small', {}, 'panel qty is derived from wattage; battery / MCCB follow the battery count')));
  const sizes = sortedSizes();
  const hasBat = S.sys === 'hybrid';
  const st = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['#', 'SLOT', 'CATEGORY', 'GST %', 'SALES SWAP', ...sizes.map(s => el('th', { class: 'num' }, `${t.sizes[s]}${hasBat ? ' (b0/b1/b2)' : ''}`)), 'DEFAULT · ALTERNATIVES'].map(h => typeof h === 'string' ? el('th', {}, h) : h))));
  const sb = el('tbody');
  (t.slots || []).forEach((slot, idx) => {
    const qtyCell = (size) => {
      if (slot.category === 'panel') return el('td', { class: 'num mono' }, el('span', { title: 'ceil(kW × 1000 / panel watt)' }, 'derived'));
      if (slot.category === 'battery') return el('td', { class: 'num mono' }, '= battery count');
      const bq = slot.batQty || slot.premiumBatQty;
      if (bq && hasBat) {
        return el('td', { class: 'num' }, el('div', { class: 'stack' }, ['0', '1', '2'].map(b => el('div', {}, el('label', {}, b), numInput(bq[b]?.[size], (n) => { bq[b] = bq[b] || {}; bq[b][size] = n ?? 0; markDirty('bomTemplates'); }, { class: 'sm', disabled: ro() })))));
      }
      const q = slot.qty || (slot.qty = {});
      return el('td', { class: 'num' }, numInput(q[size], (n) => { q[size] = n ?? 0; markDirty('bomTemplates'); }, { class: 'sm', disabled: ro() }));
    };
    const tr = el('tr', {},
      el('td', {}, idx + 1),
      el('td', {}, textInput(slot.label || slot.category, (val) => { slot.label = val; markDirty('bomTemplates'); }, { disabled: ro(), style: 'width:150px' })),
      el('td', { class: 'mono' }, slot.category),
      el('td', { class: 'num' }, numInput(slot.gst, (n) => { slot.gst = n; markDirty('bomTemplates'); }, { class: 'sm', disabled: ro() })),
      el('td', {}, ['battery', 'mccb_box'].includes(slot.category) ? el('span', { class: 'tag mut', title: 'Battery and MCCB rating are Project Head decisions, never a Sales swap' }, 'PH only') : (ro() ? el('span', { class: 'tag ' + (slot.salesSwap ? 'ok' : 'mut') }, slot.salesSwap ? 'yes' : 'fixed') : toggle(slot.salesSwap === true, (on) => { slot.salesSwap = on; markDirty('bomTemplates'); }))),
      ...sizes.map(qtyCell),
      el('td', {}, el('button', { class: 'btn sm', onclick: () => { const d = tr.nextSibling; if (d && d.classList.contains('slotcfg')) d.remove(); else tr.after(slotConfigRow(slot, sizes.length + 6)); } }, 'Configure ▸')),
    );
    sb.append(tr);
  });
  st.append(sb); slotsCard.append(el('div', { class: 'wrap' }, st));
  slotsCard.append(el('div', { class: 'hint' }, 'Default = the component Sales sees pre-selected (the market rate is set for this default pack). Alternatives = what Sales may swap to; the price difference between alternative and default (with its own GST) is added to the market rate automatically. An empty alternatives list means every eligible catalog item is allowed. For hybrid, choose the MCCB item (its rating) per size in the mccb_box slot — it is only used when a battery is included.'));
  v.append(slotsCard);
}

function slotConfigRow(slot, colspan) {
  const sizes = sortedSizes();
  const tiers = tmpl().tiers || TIERS;
  slot.defaults = slot.defaults || {}; slot.alternatives = slot.alternatives || [];
  const wrap = el('td', { colspan });
  // defaults matrix tier × size
  const dt = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, el('th', {}, 'DEFAULT · TIER'), ...sizes.map(s => el('th', {}, tmpl().sizes[s])))));
  const db = el('tbody');
  for (const tier of tiers) {
    db.append(el('tr', {}, el('td', { class: 'mono' }, tier), ...sizes.map(size => {
      const key = `${tier}:${size}`;
      const cur = slot.defaults[key] ?? slot.defaults[size] ?? '';
      const items = eligible(slot, tier, S.sys, size);
      const sel = el('select', { disabled: ro(), style: 'max-width:230px' }, el('option', { value: '' }, cur ? '— clear (engine picks) —' : '— engine picks —'), items.map(i => el('option', { value: i.id, selected: i.id === cur }, `${i.name}${i.price != null ? ' · ' + inr(i.price) : ''}`)));
      if (cur && !items.some(i => i.id === cur)) sel.prepend(el('option', { value: cur, selected: true }, `${itemName(slot.category, cur)} (not eligible for ${tier}/${size}!)`));
      sel.addEventListener('change', () => { if (sel.value) slot.defaults[key] = sel.value; else { delete slot.defaults[key]; } markDirty('bomTemplates'); sel.classList.add('dirty'); });
      return el('td', {}, sel, items.length === 0 ? el('div', { class: 'hint', style: 'color:var(--r)' }, 'no eligible catalog item') : null);
    })));
  }
  dt.append(db);
  // alternatives checklist
  const all = catItems(slot.category);
  const alt = el('div', { class: 'altgrid' }, all.map(i => {
    const cb = el('input', { type: 'checkbox', disabled: ro(), checked: slot.alternatives.includes(i.id) });
    cb.addEventListener('change', () => { slot.alternatives = cb.checked ? [...new Set([...slot.alternatives, i.id])] : slot.alternatives.filter(x => x !== i.id); markDirty('bomTemplates'); });
    // Warranty is printed on the quotation (§15) — stored on the catalog item, saved immediately (not part of the draft).
    const w = el('input', { type: 'text', value: i.warranty || '', placeholder: 'warranty e.g. 25 Years', title: 'Customer-facing warranty text for this item (saved to the catalog now)', style: 'width:130px;padding:2px 5px;font-size:11px', disabled: ro() });
    w.addEventListener('change', async () => {
      try { const r = await api('PATCH', `/api/catalog/${slot.category}/${i.id}/warranty`, { warranty: w.value, at: nowIso() }); i.warranty = r.warranty; w.classList.remove('dirty'); toast(`Warranty saved for ${i.name}`, 'ok'); }
      catch (e) { toast(`Warranty not saved: ${e.message}`, 'bad'); }
    });
    return el('label', { title: i.id }, cb, `${i.name} `, el('small', { class: 'mono' }, `[${(i.tiers || []).join('/')}${i.phase ? ' ' + i.phase : ''}${i.dcr ? ' DCR' : ''}]`), i.price != null ? el('small', {}, ` ${inr(i.price)}`) : null, ['panel', 'inverter', 'battery'].includes(slot.category) ? w : null);
  }));
  wrap.append(
    el('div', { class: 'row', style: 'justify-content:space-between' }, el('b', {}, `Default component — ${slot.label || slot.category}`), el('span', { class: 'hint' }, 'blank = engine default (registry pin → nearest kW → first eligible, flagged NOT_AUTHORITATIVE)')),
    el('div', { class: 'wrap' }, dt),
    el('div', { class: 'row', style: 'margin-top:8px;justify-content:space-between' }, el('b', {}, `Approved alternatives (${slot.alternatives.length || 'all eligible'})`), el('span', { class: 'row' }, el('button', { class: 'btn sm', disabled: ro(), onclick: () => { slot.alternatives = []; markDirty('bomTemplates'); renderView(); } }, 'Allow all eligible'))),
    alt,
  );
  if (slot.category === 'battery') wrap.append(batteryEngineeringTable());
  return el('tr', { class: 'slotcfg sub' }, wrap);
}

// Owner Q8 — "MCCB rating added when setting the BOM": the external protection
// device rating is an ENGINEERING fact recorded on the battery master. Until it is
// recorded the checker blocks every hybrid pack with that battery (PBC-H-002);
// nothing here derives a rating from Ah.
function batteryEngineeringTable() {
  const bm = S.batteryMaster || {};
  const items = catItems('battery');
  const tb = el('table', { class: 'tbl', style: 'margin-top:8px' }, el('thead', {}, el('tr', {}, ['BATTERY', 'PROTECTION', 'MCCB / PROTECTION RATING', 'MAX DISCHARGE A', 'ENGINEERING STATUS', ''].map(h => el('th', {}, h)))));
  const body = el('tbody');
  for (const it of items) {
    const rec = bm[it.id];
    if (!rec) { body.append(el('tr', {}, el('td', {}, it.name), el('td', { colspan: 5, class: 'hint' }, 'not in battery master — Engineering must register it'))); continue; }
    const rating = el('input', { type: 'text', value: rec.protectionRating ?? '', placeholder: 'e.g. 125 A MCCB', style: 'width:150px' });
    const type = el('input', { type: 'text', value: rec.protectionType ?? '', placeholder: 'e.g. DC MCCB', style: 'width:120px' });
    const amps = el('input', { type: 'number', value: rec.maximumDischargeCurrent ?? '', class: 'sm' });
    const save = el('button', { class: 'btn sm p', disabled: ro(), onclick: async () => {
      try {
        const r = await api('PATCH', `/api/engineering/battery-master/${it.id}`, { at: nowIso(), protectionRating: rating.value, protectionType: type.value, maximumDischargeCurrent: amps.value === '' ? null : Number(amps.value) });
        S.batteryMaster[it.id] = r.record; toast(`Battery master updated for ${it.name}${Object.keys(r.changed).length ? '' : ' (no change)'}. Re-publish the approved packs for the checker to re-run.`, 'ok'); renderView();
      } catch (e) { toast(`Not saved: ${e.message}`, 'bad'); }
    } }, 'Save');
    body.append(el('tr', {}, el('td', {}, it.name, el('div', { class: 'hint mono' }, it.id)),
      el('td', {}, rec.integratedProtection === true ? el('span', { class: 'tag ok' }, 'integrated') : rec.externalProtectionRequired ? el('span', { class: 'tag warn' }, 'external required') : el('span', { class: 'tag mut' }, 'unknown')),
      el('td', {}, el('div', { class: 'row' }, rating, type)), el('td', { class: 'num' }, amps),
      el('td', {}, el('span', { class: 'tag ' + (rec.protectionRating ? 'ok' : 'bad') }, rec.protectionRating ? 'rating recorded' : 'BLOCKED: PBC-H-002 — rating missing'), el('div', { class: 'hint' }, rec.engineeringStatus || '')),
      el('td', {}, save)));
  }
  tb.append(body);
  return el('div', { style: 'margin-top:10px' }, el('b', {}, 'Battery engineering facts (battery master)'), el('div', { class: 'hint' }, 'The MCCB / protection rating printed on the pack and checked by engineering. Enter the device rating from the datasheet — it is never derived from Ah.'), el('div', { class: 'wrap' }, tb));
}

function removeSize(sys, key) {
  const t = tmpl(sys);
  delete t.sizes[key]; t.threePhase = (t.threePhase || []).filter(x => x !== key);
  for (const slot of t.slots || []) {
    for (const f of ['qty', 'premiumQty']) if (slot[f]) delete slot[f][key];
    for (const f of ['batQty', 'premiumBatQty']) if (slot[f]) for (const b of Object.keys(slot[f])) delete slot[f][b][key];
    if (slot.defaults) for (const k of Object.keys(slot.defaults)) if (k === key || k.endsWith(':' + key)) delete slot.defaults[k];
  }
  for (const fi of t.fixedItems || []) { if (fi.qty) delete fi.qty[key]; if (fi.premiumQty) delete fi.premiumQty[key]; if (fi.batQty) for (const b of Object.keys(fi.batQty)) delete fi.batQty[b][key]; }
  markDirty('bomTemplates');
  for (const [k, sizes] of Object.entries(cfg().marketRates || {})) if (k.startsWith(sys + '_') && sizes[key] != null) { delete sizes[key]; markDirty('marketRates'); }
  const im = cfg().installationMatrix || {};
  if (im[key] && !sysTypes().some(s => s !== sys && tmpl(s).sizes[key])) { delete im[key]; markDirty('installationMatrix'); }
  const fu = cfg().futureUpgrade || { pairs: [] };
  const before = fu.pairs.length; fu.pairs = fu.pairs.filter(p => !((p.systemType || 'ongrid') === sys && (String(p.panelSize) === key || String(p.systemSize) === key)));
  if (fu.pairs.length !== before) markDirty('futureUpgrade');
  renderView();
}

// ---------------------------------------------------------------------------
// TAB 2 — Consumables (fixed items) per system type
// ---------------------------------------------------------------------------
function renderConsumables(v) {
  const t = tmpl(); const sizes = sortedSizes(); const hasBat = S.sys === 'hybrid';
  t.fixedItems = t.fixedItems || [];
  v.append(el('div', { class: 'card' }, el('h3', {}, el('span', {}, 'System type'), sysSeg(renderView)),
    el('div', { class: 'hint' }, 'Consumables are fixed per pack (Sales cannot change them). Quantities follow the SYSTEM size — for a future-ready pack that is the inverter capacity, not the panel kW. Reference price is the catalog / purchase reference used for the internal margin check, never shown to Sales.')));
  const card = el('div', { class: 'card' }, el('h3', {}, el('span', {}, `Consumables — ${t.label || S.sys} (${t.fixedItems.length})`)));
  const tb = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['#', 'ITEM', 'UNIT', 'REF ₹', 'GST %', ...sizes.map(s => el('th', { class: 'num' }, `${t.sizes[s]}${hasBat ? ' (b0/b1/b2)' : ''}`)), ''].map(h => typeof h === 'string' ? el('th', {}, h) : h))));
  const body = el('tbody');
  t.fixedItems.forEach((fi, idx) => {
    const qtyCell = (size) => {
      if (fi.batQty && hasBat) return el('td', { class: 'num' }, el('div', { class: 'stack' }, ['0', '1', '2'].map(b => el('div', {}, el('label', {}, b), numInput(fi.batQty[b]?.[size], (n) => { fi.batQty[b] = fi.batQty[b] || {}; fi.batQty[b][size] = n ?? 0; markDirty('bomTemplates'); }, { class: 'sm', disabled: ro() })))));
      fi.qty = fi.qty || {};
      return el('td', { class: 'num' }, numInput(fi.qty[size], (n) => { fi.qty[size] = n ?? 0; markDirty('bomTemplates'); }, { class: 'sm', disabled: ro() }));
    };
    body.append(el('tr', {},
      el('td', {}, idx + 1),
      el('td', {}, textInput(fi.name, (val) => { fi.name = val; markDirty('bomTemplates'); }, { disabled: ro(), style: 'width:240px' })),
      el('td', {}, textInput(fi.unit || '', (val) => { fi.unit = val; markDirty('bomTemplates'); }, { disabled: ro(), style: 'width:70px' })),
      el('td', { class: 'num' }, numInput(fi.price, (n) => { fi.price = n ?? 0; markDirty('bomTemplates'); }, { disabled: ro() })),
      el('td', { class: 'num' }, numInput(fi.gst ?? 18, (n) => { fi.gst = n ?? 18; markDirty('bomTemplates'); }, { class: 'sm', disabled: ro() })),
      ...sizes.map(qtyCell),
      el('td', {}, el('div', { class: 'row' },
        hasBat ? el('button', { class: 'btn sm', title: 'Toggle battery-dependent quantities', disabled: ro(), onclick: () => { if (fi.batQty) { fi.qty = fi.batQty['1'] || fi.qty || {}; delete fi.batQty; } else { fi.batQty = { '0': { ...(fi.qty || {}) }, '1': { ...(fi.qty || {}) }, '2': { ...(fi.qty || {}) } }; } markDirty('bomTemplates'); renderView(); } }, fi.batQty ? 'by battery ✓' : 'by battery') : null,
        el('button', { class: 'ic danger', disabled: ro(), onclick: () => { if (!confirm(`Remove "${fi.name}"?`)) return; t.fixedItems.splice(idx, 1); markDirty('bomTemplates'); renderView(); } }, '×'))),
    ));
  });
  body.append(el('tr', { class: 'sub' }, el('td', { colspan: 6 + sizes.length }, el('button', { class: 'btn sm p', disabled: ro(), onclick: () => {
    const name = prompt('Consumable name (e.g. "Cable ties 300 mm")'); if (!name) return;
    const qty = {}; for (const s of sizes) qty[s] = 1;
    t.fixedItems.push({ id: 'fx_' + Math.random().toString(36).slice(2, 10), name, unit: 'nos', price: 0, gst: 18, qty });
    markDirty('bomTemplates'); renderView();
  } }, '+ Add consumable'))));
  tb.append(body); card.append(el('div', { class: 'wrap' }, tb)); v.append(card);
}

// ---------------------------------------------------------------------------
// TAB 3 — Structure tables (per roof) + tube rates
// ---------------------------------------------------------------------------
function renderStructure(v) {
  const st = cfg().structureTemplates = cfg().structureTemplates || {};
  const costs = cfg().costs = cfg().costs || {};
  v.append(el('div', { class: 'card' },
    el('h3', {}, el('span', {}, 'Structure packs by roof type'), el('small', {}, 'Sales picks the roof; the structure pack follows — never a Sales component swap.')),
    el('div', { class: 'row' },
      el('span', {}, 'GP tube ₹/kg (Base)'), numInput(costs.gpRatePerKg, (n) => { costs.gpRatePerKg = n; markDirty('costs'); }, { disabled: ro() }),
      el('span', {}, 'GI tube ₹/kg (Value / Premium)'), numInput(costs.giRatePerKg, (n) => { costs.giRatePerKg = n; markDirty('costs'); }, { disabled: ro() }),
      el('span', {}, 'Structure labour ₹ (non-flat)'), numInput(costs.structureLabor, (n) => { costs.structureLabor = n; markDirty('costs'); }, { disabled: ro() }),
      el('span', {}, 'Repair / wastage %'), numInput(costs.structureRepairPct, (n) => { costs.structureRepairPct = n; markDirty('costs'); }, { class: 'sm', disabled: ro() })),
    el('div', { class: 'hint' }, 'Tube lines are priced as weight (kg) × ₹/kg of the tier grade; fixed lines use their reference price. Quantity per kW: exact size, interpolated between sizes, scaled above the largest. Sheet / elevated add-on for the customer = (roof pack − flat pack) + labour + repair % + installation difference, plus GST.')));
  for (const [key, label] of ROOFS) {
    const tpl = st[key] = st[key] || { items: [] };
    const kwCols = [...new Set(tpl.items.flatMap(i => Object.keys(i.qty || {})).concat(sysTypes().flatMap(s => sizeKeys(s).map(k => String(kwOf(k))))))].map(Number).filter(Number.isFinite).sort((a, b) => a - b).map(String);
    const card = el('div', { class: 'card' }, el('h3', {}, el('span', {}, `${label} — ${tpl.items.length} items`), el('small', {}, `template key ${key}`)));
    const tb = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['#', 'ITEM', 'TYPE', 'TUBE SIZE', 'KG / PC', 'REF ₹ (fixed)', ...kwCols.map(k => el('th', { class: 'num' }, `${k} kW`)), ''].map(h => typeof h === 'string' ? el('th', {}, h) : h))));
    const body = el('tbody');
    tpl.items.forEach((it, idx) => {
      it.qty = it.qty || {};
      body.append(el('tr', {},
        el('td', {}, idx + 1),
        el('td', {}, textInput(it.name, (val) => { it.name = val; markDirty('structureTemplates'); }, { disabled: ro(), style: 'width:220px' })),
        el('td', {}, (() => { const s = el('select', { disabled: ro() }, ['tube', 'fixed'].map(o => el('option', { value: o, selected: (it.type || 'fixed') === o }, o))); s.addEventListener('change', () => { it.type = s.value; markDirty('structureTemplates'); renderView(); }); return s; })()),
        el('td', {}, it.type === 'tube' ? textInput(it.tubeSize || '', (val) => { it.tubeSize = val; markDirty('structureTemplates'); }, { disabled: ro(), style: 'width:80px', placeholder: '1.5x1.5' }) : '—'),
        el('td', { class: 'num' }, it.type === 'tube' ? numInput(it.weightKg, (n) => { it.weightKg = n; markDirty('structureTemplates'); }, { disabled: ro() }) : '—'),
        el('td', { class: 'num' }, it.type === 'tube' ? el('span', { class: 'hint' }, `${inr((it.weightKg || 0) * (costs.gpRatePerKg || 0))} GP · ${inr((it.weightKg || 0) * (costs.giRatePerKg || 0))} GI`) : numInput(it.price, (n) => { it.price = n ?? 0; markDirty('structureTemplates'); }, { disabled: ro() })),
        ...kwCols.map(k => el('td', { class: 'num' }, numInput(it.qty[k], (n) => { if (n == null) delete it.qty[k]; else it.qty[k] = n; markDirty('structureTemplates'); }, { class: 'sm', disabled: ro() }))),
        el('td', {}, el('button', { class: 'ic danger', disabled: ro(), onclick: () => { if (!confirm(`Remove "${it.name}" from ${label}?`)) return; tpl.items.splice(idx, 1); markDirty('structureTemplates'); renderView(); } }, '×')),
      ));
    });
    body.append(el('tr', { class: 'sub' }, el('td', { colspan: 7 + kwCols.length }, el('div', { class: 'row' },
      el('button', { class: 'btn sm p', disabled: ro(), onclick: () => { const name = prompt('Structure item name'); if (!name) return; tpl.items.push({ name, type: 'fixed', price: 0, qty: {} }); markDirty('structureTemplates'); renderView(); } }, '+ Add fixed item'),
      el('button', { class: 'btn sm', disabled: ro(), onclick: () => { const name = prompt('Tube name (e.g. "GI Tube 1.5x1.5 - 6m")'); if (!name) return; tpl.items.push({ name, type: 'tube', tubeSize: '', weightKg: 0, qty: {} }); markDirty('structureTemplates'); renderView(); } }, '+ Add tube'),
      el('span', { class: 'hint' }, 'The pack\'s primary tube must exist in the catalog structure_material category with the same tubeSize (e.g. 1.5x1.5) so the quotation can show it as an engineering line.')))));
    tb.append(body); card.append(el('div', { class: 'wrap' }, tb)); v.append(card);
  }
}

// ---------------------------------------------------------------------------
// TAB 4 — Costs · installation matrix · transport · GST · pricing mode
// ---------------------------------------------------------------------------
const COST_FIELDS = [
  ['installRate', 'Installation ₹/kW (legacy reference)'], ['serviceRateYear', 'Service ₹/year'], ['serviceYears', 'Service years'],
  ['transportRate', 'Transport ₹/km (reference cost)'], ['defaultDistKm', 'Default distance km (reference)'], ['miscellaneous', 'Miscellaneous ₹ / project'], ['office', 'Office overhead ₹ / project'],
  ['structureLabor', 'Structure labour ₹'], ['structureRepairPct', 'Structure repair %'], ['gpRatePerKg', 'GP tube ₹/kg'], ['giRatePerKg', 'GI tube ₹/kg'],
];
function renderCosts(v) {
  const c = cfg(); c.costs = c.costs || {}; c.installationMatrix = c.installationMatrix || {}; c.transportConfig = c.transportConfig || { baseDistanceKm: 100, vehicles: [] }; c.gst = c.gst || { ratePct: 8.9 }; c.pricing = c.pricing || { mode: 'PACK_MARKET_RATE', marginPct: 20 };
  // costs
  const extra = Object.keys(c.costs).filter(k => !COST_FIELDS.some(([f]) => f === k) && typeof c.costs[k] === 'number');
  v.append(el('div', { class: 'card' }, el('h3', {}, el('span', {}, 'Internal reference costs'), el('small', {}, 'used only for the margin check against the market rate — never shown to Sales')),
    el('div', { class: 'fields' }, [...COST_FIELDS, ...extra.map(k => [k, k])].map(([k, label]) => el('div', {}, el('label', {}, label), numInput(c.costs[k], (n) => { c.costs[k] = n; markDirty('costs'); }, { disabled: ro() }))))));
  // installation matrix
  const allSizes = [...new Set(sysTypes().flatMap(s => sizeKeys(s)))].sort((a, b) => kwOf(a) - kwOf(b) || a.localeCompare(b));
  const im = c.installationMatrix;
  const imCard = el('div', { class: 'card' }, el('h3', {}, el('span', {}, 'Installation amount — size × roof (₹ per project, D1)'), el('small', {}, 'exact size only: a size without a row blocks pricing for that pack')));
  const tb = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, el('th', {}, 'SIZE'), el('th', {}, 'kW'), ...ROOFS.map(([, l]) => el('th', { class: 'num' }, l)), ...ROOFS.map(([, l]) => el('th', { class: 'num' }, `${l} ₹/kW`)))));
  const body = el('tbody');
  for (const size of allSizes) {
    im[size] = im[size] || {};
    const kw = kwOf(size);
    body.append(el('tr', {}, el('td', { class: 'mono' }, size), el('td', { class: 'num' }, kw),
      ...ROOFS.map(([, , k]) => el('td', { class: 'num' }, numInput(im[size][k], (n) => { im[size][k] = n; markDirty('installationMatrix'); renderView(); }, { disabled: ro() }))),
      ...ROOFS.map(([, , k]) => el('td', { class: 'num hint' }, im[size][k] != null && kw ? inr(im[size][k] / kw) : '—'))));
  }
  tb.append(body); imCard.append(el('div', { class: 'wrap' }, tb)); v.append(imCard);
  // transport
  const tc = c.transportConfig; tc.vehicles = tc.vehicles || [];
  const trCard = el('div', { class: 'card' }, el('h3', {}, el('span', {}, 'Transport (D3)'), el('small', {}, 'base km included in every pack; beyond it the customer pays km × vehicle rate as a separate extra, outside the quote price')),
    el('div', { class: 'row' }, el('span', {}, 'Included one-way km'), numInput(tc.baseDistanceKm, (n) => { tc.baseDistanceKm = n; markDirty('transportConfig'); }, { disabled: ro() })));
  const vt = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['VEHICLE TYPE (key)', 'NAME', '₹ / km', ''].map(h => el('th', {}, h)))));
  const vb = el('tbody');
  tc.vehicles.forEach((veh, idx) => vb.append(el('tr', {},
    el('td', {}, textInput(veh.vehicleType, (val) => { veh.vehicleType = val.toUpperCase(); markDirty('transportConfig'); }, { disabled: ro(), style: 'width:120px' })),
    el('td', {}, textInput(veh.vehicleName || '', (val) => { veh.vehicleName = val; markDirty('transportConfig'); }, { disabled: ro(), style: 'width:180px' })),
    el('td', { class: 'num' }, numInput(veh.ratePerKm, (n) => { veh.ratePerKm = n; markDirty('transportConfig'); }, { disabled: ro() })),
    el('td', {}, el('button', { class: 'ic danger', disabled: ro() || tc.vehicles.length <= 1, onclick: () => { tc.vehicles.splice(idx, 1); markDirty('transportConfig'); renderView(); } }, '×')))));
  vb.append(el('tr', { class: 'sub' }, el('td', { colspan: 4 }, el('button', { class: 'btn sm p', disabled: ro(), onclick: () => { tc.vehicles.push({ vehicleType: 'NEW', vehicleName: '', ratePerKm: 0 }); markDirty('transportConfig'); renderView(); } }, '+ Add vehicle'))));
  vt.append(vb); trCard.append(el('div', { class: 'wrap' }, vt)); v.append(trCard);
  // gst + pricing
  const g = c.gst, p = c.pricing;
  v.append(el('div', { class: 'grid2' },
    el('div', { class: 'card' }, el('h3', {}, el('span', {}, 'GST (D2)')), el('div', { class: 'fields' },
      el('div', {}, el('label', {}, 'Composite rate %'), numInput(g.ratePct, (n) => { g.ratePct = n; markDirty('gst'); }, { disabled: ro() })),
      el('div', {}, el('label', {}, 'Regime label'), textInput(g.regime || '', (val) => { g.regime = val; markDirty('gst'); }, { disabled: ro() }))),
      el('div', { class: 'hint' }, 'Composite 8.9% = 70% supply @5% + 30% service @18%. The market rate is GST-inclusive; the quotation shows the pre-GST amount and GST at this rate.')),
    el('div', { class: 'card' }, el('h3', {}, el('span', {}, 'Pricing mode (Admin decision)')), el('div', { class: 'fields' },
      el('div', {}, el('label', {}, 'Mode'), (() => { const s = el('select', { disabled: !canApprove() }, ['PACK_MARKET_RATE', 'GROSS_MARGIN'].map(m => el('option', { value: m, selected: p.mode === m }, m === 'PACK_MARKET_RATE' ? 'Pack market rate (owner formula)' : 'Landed cost + gross margin (cost engine)'))); s.addEventListener('change', () => { p.mode = s.value; markDirty('pricing'); }); return s; })()),
      el('div', {}, el('label', {}, 'Target margin % (internal check)'), numInput(p.marginPct, (n) => { p.marginPct = n; markDirty('pricing'); }, { disabled: ro() }))),
      el('div', { class: 'hint' }, 'PACK_MARKET_RATE: customer price = market rate + swap delta + roof add-on. GROSS_MARGIN: the landed-cost engine prices every line (requires procurement price master). Only Admin changes the mode.'))));
}

// ---------------------------------------------------------------------------
// TAB 5 — Market rates (per pack) + margin check
// ---------------------------------------------------------------------------
function rateRows() {
  const rows = [];
  for (const sys of sysTypes()) {
    const t = tmpl(sys); const tiers = t.tiers || TIERS; const sizes = sortedSizes(sys);
    const bats = sys === 'hybrid' ? [0, 1, 2] : [null];
    const pairs = (cfg().futureUpgrade?.pairs || []).filter(p => (p.systemType || 'ongrid') === sys && t.sizes[String(p.panelSize)] && t.sizes[String(p.systemSize)]);
    for (const tier of tiers) for (const bat of bats) {
      const base = `${sys}_${tier}${bat == null ? '' : '_' + bat}`;
      rows.push({ key: base, sys, tier, bat, sizes, label: `${t.label || sys} · ${tier}${bat == null ? '' : ` · ${bat} battery`}` });
      for (const fs of [...new Set(pairs.map(p => String(p.systemSize)))]) {
        const panelSizes = pairs.filter(p => String(p.systemSize) === fs).map(p => String(p.panelSize));
        rows.push({ key: `${base}_up${fs}`, sys, tier, bat, sizes: panelSizes, fr: fs, label: `${t.label || sys} · ${tier}${bat == null ? '' : ` · ${bat} battery`} · future-ready → ${t.sizes[fs]}` });
      }
    }
  }
  return rows;
}
function renderRates(v) {
  const mr = cfg().marketRates = cfg().marketRates || {};
  const rows = rateRows();
  const miss = missingRates();
  v.append(el('div', { class: 'card' }, el('h3', {}, el('span', {}, 'Market rates — the customer price (incl. GST) for each pack on a flat roof, within the included km'), el('small', {}, `${rows.length} pack rows · `, miss.length ? el('span', { class: 'tag bad' }, `${miss.length} NOT SET`) : el('span', { class: 'tag ok' }, 'all set'))),
    el('div', { class: 'hint' }, 'Type the price you sell each pack for. Red = not set → Sales cannot quote that pack (blocked, never guessed). Roof add-ons, component swaps and extra km are added on top automatically. "check" prices the draft pack and shows your margin vs the internal reference cost (material + structure + installation + service + transport + misc + office, + target margin, + GST).'),
    el('div', { class: 'row' }, el('button', { class: 'btn sm', onclick: () => checkAllRates(v) }, 'Check all margins'), el('span', { class: 'hint' }, 'green ≥ target · amber 0…target · red below cost'))));
  for (const sys of sysTypes()) {
    const sizes = sortedSizes(sys);
    const card = el('div', { class: 'card' }, el('h3', {}, el('span', {}, `${tmpl(sys).label || sys}`)));
    const tb = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, el('th', {}, 'PACK'), el('th', {}, 'KEY'), ...sizes.map(s => el('th', { class: 'num' }, tmpl(sys).sizes[s])))));
    const body = el('tbody');
    for (const r of rows.filter(r => r.sys === sys)) {
      mr[r.key] = mr[r.key] || {};
      body.append(el('tr', {}, el('td', {}, r.label), el('td', { class: 'mono' }, r.key), ...sizes.map(size => {
        if (!r.sizes.includes(size)) return el('td', { class: 'num hint' }, '·');
        const cell = el('div', { class: 'cell' });
        const isMissing = !(Number(mr[r.key][size]) > 0);
        const inp = numInput(mr[r.key][size], (n) => { if (n == null) delete mr[r.key][size]; else mr[r.key][size] = n; inp.classList.toggle('missing', !(Number(n) > 0)); markDirty('marketRates'); }, { disabled: ro(), style: 'width:100px', placeholder: '₹ not set', class: isMissing ? 'missing' : '', title: isMissing ? 'NOT SET — Sales cannot quote this pack' : '' });
        cell.append(inp);
        const chk = el('small', { class: isMissing ? 'miss' : 'mono', style: 'cursor:pointer;text-decoration:underline', 'data-check': `${r.key}|${size}` }, isMissing ? 'NOT SET' : 'check');
        chk.addEventListener('click', () => checkRate(r, size, chk));
        cell.append(chk);
        return el('td', { class: 'num' }, cell);
      })));
    }
    tb.append(body); card.append(el('div', { class: 'wrap' }, tb)); v.append(card);
  }
}
async function checkRate(r, size, out) {
  out.textContent = '…'; out.className = 'mono';
  try {
    if (S.dirty.has('marketRates') || S.dirty.has('bomTemplates') || S.dirty.has('costs') || S.dirty.has('installationMatrix')) { out.textContent = 'save draft first'; out.className = 'warn'; return; }
    const res = await api('POST', '/api/sales/price-preview', { configSource: 'draft', systemType: r.sys, size, tier: r.tier, roofType: 'FLAT', distanceKm: 0, batteryQuantity: r.bat ?? undefined, futureSystemSize: r.fr || null });
    const i = res.internal; const pct = i?.marginVsMarketPct;
    out.textContent = `ref ${inr(i?.grand)} · ${pct == null ? '—' : (pct >= 0 ? '+' : '') + pct + '%'}`;
    const target = cfg().pricing?.marginPct ?? 0;
    out.className = pct == null ? 'mono' : (res.customer.sellingPriceIncludingGST >= i.grand ? 'ok' : (res.customer.sellingPriceIncludingGST >= i.referenceTotal ? 'warn' : 'bad'));
    out.title = `market ${inr(res.customer.sellingPriceIncludingGST)} vs reference incl. ${target}% margin + GST ${inr(i.grand)} (cost only ${inr(i.referenceTotal)})`;
  } catch (e) { out.textContent = e.code === 'MARKET_RATE_NOT_SET' ? 'no rate' : (e.code || 'blocked'); out.className = 'bad'; out.title = e.message; }
}
async function checkAllRates(v) { for (const chk of v.querySelectorAll('[data-check]')) { const [key, size] = chk.dataset.check.split('|'); const r = rateRows().find(x => x.key === key); if (r) await checkRate(r, size, chk); } }

// ---------------------------------------------------------------------------
// TAB 6 — Future-ready pairs (owner Q7)
// ---------------------------------------------------------------------------
function renderFuture(v) {
  const fu = cfg().futureUpgrade = cfg().futureUpgrade || { pairs: [] }; fu.pairs = fu.pairs || [];
  const card = el('div', { class: 'card' }, el('h3', {}, el('span', {}, 'Future-ready packs — panels now, inverter capacity for later'), el('small', {}, 'panels at the panel kW; inverter, structure, DB, cables, meter and consumables at the system kW')),
    el('div', { class: 'hint' }, 'Each pair becomes a quotable pack for Sales (after approval) with its own market rate row (key …_up<systemSize>). Both sizes must be the same phase.'));
  const tb = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['SYSTEM', 'PANEL kW', 'SYSTEM kW (inverter)', 'PHASE', 'MARKET RATE ROWS', ''].map(h => el('th', {}, h)))));
  const body = el('tbody');
  fu.pairs.forEach((p, idx) => {
    const sys = p.systemType || 'ongrid'; const t = tmpl(sys);
    const ok = t && t.sizes[String(p.panelSize)] && t.sizes[String(p.systemSize)] && phaseOf(sys, p.panelSize) === phaseOf(sys, p.systemSize) && kwOf(p.systemSize) > kwOf(p.panelSize);
    const sel = (val, onCh) => { const s = el('select', { disabled: ro() }, sortedSizes(sys).map(k => el('option', { value: k, selected: String(val) === k }, t.sizes[k]))); s.addEventListener('change', () => { onCh(s.value); markDirty('futureUpgrade'); renderView(); }); return s; };
    body.append(el('tr', {},
      el('td', {}, (() => { const s = el('select', { disabled: ro() }, sysTypes().map(k => el('option', { value: k, selected: sys === k }, tmpl(k).label || k))); s.addEventListener('change', () => { p.systemType = s.value; markDirty('futureUpgrade'); renderView(); }); return s; })()),
      el('td', {}, t ? sel(p.panelSize, (val) => p.panelSize = val) : String(p.panelSize)),
      el('td', {}, t ? sel(p.systemSize, (val) => p.systemSize = val) : String(p.systemSize)),
      el('td', {}, t ? el('span', { class: 'tag ' + (ok ? 'ok' : 'bad') }, `${phaseOf(sys, p.panelSize)} → ${phaseOf(sys, p.systemSize)}${ok ? '' : ' ✗'}`) : el('span', { class: 'tag bad' }, 'unknown system')),
      el('td', { class: 'mono' }, (t?.tiers || TIERS).map(tier => `${sys}_${tier}${sys === 'hybrid' ? '_<bat>' : ''}_up${p.systemSize}`).join(' · ')),
      el('td', {}, el('button', { class: 'ic danger', disabled: ro(), onclick: () => { fu.pairs.splice(idx, 1); markDirty('futureUpgrade'); renderView(); } }, '×')),
    ));
  });
  body.append(el('tr', { class: 'sub' }, el('td', { colspan: 6 }, el('button', { class: 'btn sm p', disabled: ro(), onclick: () => { const sizes = sortedSizes(S.sys); fu.pairs.push({ systemType: S.sys, panelSize: sizes[0], systemSize: sizes[1] || sizes[0] }); markDirty('futureUpgrade'); renderView(); } }, '+ Add pair'))));
  tb.append(body); card.append(el('div', { class: 'wrap' }, tb)); v.append(card);
}

// ---------------------------------------------------------------------------
// TAB 7 — Review & approve (+ BOM / price preview of the draft)
// ---------------------------------------------------------------------------
function renderReview(v) {
  const d = S.summary?.draft || {}; const a = S.summary?.approved || {};
  const changed = d.changedSections || [];
  const status = S.draft?.status;
  const left = el('div', { class: 'card' }, el('h3', {}, el('span', {}, 'Lifecycle')),
    el('div', { class: 'kv' },
      el('b', {}, 'Approved'), el('span', {}, `v${a.version} · ${a.approvedBy || '—'} · ${a.approvedAt || '—'}${a.note ? ' · ' + a.note : ''}`),
      el('b', {}, 'Draft'), el('span', {}, `v${d.version} · ${status}${d.updatedBy ? ` · last edit ${d.updatedBy} @ ${d.updatedAt}` : ''}${d.submittedBy ? ` · submitted by ${d.submittedBy} @ ${d.submittedAt}` : ''}`),
      el('b', {}, 'Changed sections'), el('span', {}, changed.length ? changed.map(c => el('span', { class: 'tag warn', style: 'margin-right:4px' }, c)) : el('span', { class: 'tag ok' }, 'none — draft equals approved')),
      d.rejectionReason ? el('b', {}, 'Last rejection') : null, d.rejectionReason ? el('span', { style: 'color:var(--r)' }, d.rejectionReason) : null),
    el('div', { class: 'row', style: 'margin-top:10px' },
      el('button', { class: 'btn o', disabled: !canSubmit() || status === 'SUBMITTED' || !changed.length || S.dirty.size > 0, onclick: () => lifecycle('submit') }, 'Submit for approval'),
      el('button', { class: 'btn p', disabled: !canApprove() || S.dirty.size > 0 || (status !== 'SUBMITTED' && !changed.length), onclick: () => confirmApprove() }, status === 'SUBMITTED' ? 'Approve & publish' : 'Publish draft now'),
      el('button', { class: 'btn d', disabled: !canApprove() || status !== 'SUBMITTED', onclick: () => { const reason = prompt('Rejection reason for the Project Head'); if (reason != null) lifecycle('reject', { reason }); } }, 'Reject'),
      el('button', { class: 'btn', disabled: !canEdit() || (!changed.length && !S.dirty.size), onclick: () => { if (confirm('Discard every draft edit and reset to the approved configuration?')) lifecycle('reset'); } }, 'Reset draft to approved'),
      el('button', { class: 'btn', disabled: !canApprove(), title: 'Re-run publish for the current approved version (e.g. after catalog data was completed)', onclick: () => lifecycle('publish') }, 'Re-publish approved')),
    el('div', { class: 'hint' }, S.dirty.size ? 'Save your edits before submitting.' : canSubmit() ? 'Submit sends the draft to Admin. Editing a submitted draft withdraws it.' : canApprove() ? 'Admin approves a Project Head submission, or publishes its own draft edits directly (recorded as submitted + approved by Admin). Publishing re-creates every pack; packs with missing data are listed below as blocked with the rule.' : ''));
  const log = el('div', { class: 'card' }, el('h3', {}, el('span', {}, 'Draft change log'), el('small', {}, `${(S.draft?.changeLog || []).length} entries`)),
    el('div', { class: 'log' }, (S.draft?.changeLog || []).slice().reverse().slice(0, 60).map(c => el('div', {}, el('b', {}, `${c.section} ${c.changed === false ? '(no change)' : ''}`), el('small', {}, `${c.at} · ${c.by}${c.note ? ' · ' + c.note : ''}`)))));
  v.append(el('div', { class: 'grid2' }, left, log));
  if (S.lastPublish) v.append(publishReport(S.lastPublish));
  v.append(previewCard());
}
// Plain-language "what to do" for the engineering rules that most often block a
// pack at publish time. The rule text itself comes from the checker; nothing
// here changes what blocks — it only tells the Project Head where to fix it.
const RULE_HINTS = {
  'PBC-H-002': 'Enter the battery\'s MCCB / protection rating from its datasheet: Packs & slots → hybrid → "Battery engineering facts" → Save, then "Re-publish approved".',
  'PBC-H-001': 'Record the battery\'s protection mode (integrated / external) in the battery master (Packs & slots → hybrid → Battery engineering facts).',
  'PBC-H-003': 'The hybrid pack needs a battery-protection (MCCB) line — add it to the pack template.',
  'PBC-M-003': 'Hybrid Premium (Enphase) pack has no IQ System Controller line — it is the backup gateway and mandatory with a battery (D12). Add the System Controller to the hybrid premium pack (Enphase accessories). On-grid premium is exempt (no battery, owner decision 2026-09-13).',
  'PBC-M-001': 'Micro-inverter count must equal the panel count — check the premium quantities for this kW.',
  'PBC-M-002': 'The Enphase premium package is defined with exactly one Flex battery — check the battery quantity.',
};
function publishReport(rep) {
  const card = el('div', { class: 'card' }, el('h3', {}, el('span', {}, `Publish report — config v${rep.configVersion}`), el('small', {}, `${rep.published.length} published · ${rep.unchanged.length} unchanged · ${rep.blocked.length} blocked · ${rep.errors.length} errors`)));
  if (rep.blocked.length) {
    const rows = rep.blocked.map(b => el('tr', {}, el('td', { class: 'mono' }, b.combo), el('td', { style: 'white-space:normal' }, b.findings.map(f => el('div', {}, el('span', { class: 'tag bad' }, f.ruleId), ' ', f.message, RULE_HINTS[f.ruleId] ? el('div', { class: 'hint' }, '→ ', RULE_HINTS[f.ruleId]) : null)))));
    card.append(el('h4', { style: 'margin:8px 0 4px' }, 'Blocked packs — Sales cannot quote these until the data below is completed (never published, never guessed)'), el('table', { class: 'tbl' }, el('tbody', {}, rows)));
  }
  if (rep.errors.length) card.append(el('h4', { style: 'margin:8px 0 4px' }, 'Errors'), el('table', { class: 'tbl' }, el('tbody', {}, rep.errors.map(e => el('tr', {}, el('td', { class: 'mono' }, e.combo), el('td', {}, `${e.code ? e.code + ': ' : ''}${e.error}`))))));
  if (rep.published.length) card.append(el('details', {}, el('summary', {}, `Published (${rep.published.length})`), el('div', { class: 'mono' }, rep.published.map(p => el('div', {}, `${p.combo} → ${p.packageId} (${p.validation}${p.supersedes ? ', supersedes ' + p.supersedes : ''})`)))));
  return card;
}
async function lifecycle(action, extra = {}) {
  try {
    const at = nowIso();
    const url = action === 'publish' ? '/api/pack-config/publish' : `/api/pack-config/draft/${action}`;
    const r = await api('POST', url, { at, ...extra });
    if (r.publish) S.lastPublish = r.publish;
    toast(`${action} ok${r.publish ? ` — ${r.publish.published.length} packs published, ${r.publish.blocked.length} blocked` : ''}`, 'ok');
    await loadAll(); S.tab = 'review'; renderTabs(); renderView();
  } catch (e) { toast(`${action} failed (${e.code || e.status}): ${e.message}`, 'bad'); }
}

// ---- draft preview -----------------------------------------------------------
function previewCard() {
  const p = S.preview; if (!tmpl(p.sys)) p.sys = sysTypes()[0];
  const sizes = sortedSizes(p.sys); if (!sizes.includes(p.size)) p.size = sizes[0];
  const pairs = (cfg().futureUpgrade?.pairs || []).filter(x => (x.systemType || 'ongrid') === p.sys && String(x.panelSize) === p.size);
  const sel = (opts, val, onCh) => { const s = el('select', {}, opts.map(([v, l]) => el('option', { value: v, selected: String(val) === String(v) }, l))); s.addEventListener('change', () => { onCh(s.value); renderView(); }); return s; };
  const card = el('div', { class: 'card' }, el('h3', {}, el('span', {}, 'Preview the DRAFT as Sales will see it (server materialisation + price)'), el('small', {}, 'saved draft only — unsaved edits are not previewed')),
    el('div', { class: 'row' },
      sel(sysTypes().map(k => [k, tmpl(k).label || k]), p.sys, (val) => { p.sys = val; p.size = null; p.fr = ''; }),
      sel(sizes.map(k => [k, tmpl(p.sys).sizes[k]]), p.size, (val) => { p.size = val; p.fr = ''; }),
      sel((tmpl(p.sys).tiers || TIERS).map(t => [t, t]), p.tier, (val) => p.tier = val),
      sel([['FLAT', 'Flat roof'], ['SHEET', 'Sheet roof'], ['ELEVATED', 'Elevated']], p.roof, (val) => p.roof = val),
      p.sys === 'hybrid' ? sel([[0, 'no battery'], [1, '1 battery'], [2, '2 batteries']], p.bat, (val) => p.bat = Number(val)) : null,
      pairs.length ? sel([['', 'standard'], ...pairs.map(x => [String(x.systemSize), `future-ready → ${tmpl(p.sys).sizes[String(x.systemSize)]}`])], p.fr, (val) => p.fr = val) : null,
      el('span', {}, 'km'), numInput(p.km, (n) => { p.km = n ?? 0; }, { class: 'sm' }),
      el('button', { class: 'btn sm p', onclick: () => runPreview(card) }, 'Preview')),
    el('div', { id: 'previewOut' }));
  return card;
}
async function runPreview(card) {
  const out = $('#previewOut', card); out.replaceChildren(el('div', { class: 'hint' }, 'materialising…'));
  const p = S.preview;
  const common = { configSource: 'draft', systemType: p.sys, size: p.size, roofType: p.roof, futureSystemSize: p.fr || null, batteryQuantity: p.sys === 'hybrid' ? p.bat : undefined };
  let bom = null, price = null, priceErr = null;
  try { bom = await api('POST', '/api/sales/bom-preview', common); } catch (e) { out.replaceChildren(el('div', { class: 'tag bad' }, `BOM: ${e.message}`)); return; }
  try { price = await api('POST', '/api/sales/price-preview', { ...common, tier: p.tier, distanceKm: p.km }); } catch (e) { priceErr = e; }
  const b = bom.boms[p.tier];
  const lines = [...(b.lines || []), ...((b.structure?.lines || []).map(l => ({ ...l, category: 'structure', label: 'Structure', name: l.name, unitPrice: l.unitPrice, amount: l.amount })))];
  const tb = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['#', 'ITEM', 'CATEGORY', 'COMPONENT', 'QTY', 'REF ₹', 'AMOUNT', 'SOURCE', 'SALES'].map(h => el('th', {}, h)))),
    el('tbody', {}, lines.map((l, i) => el('tr', {}, el('td', {}, i + 1), el('td', {}, l.label || l.name), el('td', { class: 'mono' }, l.category), el('td', {}, l.name, l.defaultComponentId && l.defaultComponentId !== l.componentId ? el('small', { class: 'hint' }, ` (default ${l.defaultName})`) : null), el('td', { class: 'num' }, l.qty), el('td', { class: 'num' }, inr(l.unitPrice)), el('td', { class: 'num' }, inr(l.amount)), el('td', { class: 'mono' }, l.selectionMethod || (l.isStructure ? 'ROOF_PACK' : '')), el('td', {}, l.isVariable ? el('span', { class: 'tag ' + (l.salesSwap ? 'ok' : 'mut') }, l.salesSwap ? 'swap' : 'fixed') : '')))));
  const kv = el('div', { class: 'kv' });
  if (price) {
    const c = price.customer, i = price.internal;
    kv.append(el('b', {}, 'Market rate'), el('span', {}, `${inr(c.marketRate)} (${price.marketRateKey})`),
      el('b', {}, 'Roof add-on'), el('span', {}, inr(c.roofAddOn)), el('b', {}, 'Swap delta'), el('span', {}, inr(c.swapDeltaTotal)),
      el('b', {}, 'Customer price incl. GST'), el('span', {}, el('b', {}, inr(c.sellingPriceIncludingGST)), ` (pre-GST ${inr(c.sellingPriceBeforeGST)} + GST ${inr(c.gstAmount)})`),
      el('b', {}, 'Transport extra'), el('span', {}, `${inr(c.transportExtra)} (${c.transportExtraDetail.extraKm} km beyond ${c.transportExtraDetail.includedKm} × ${inr(c.transportExtraDetail.ratePerKm)} ${c.transportExtraDetail.vehicleType}) — shown separately to the customer`),
      el('b', {}, 'Internal reference'), el('span', {}, `cost ${inr(i.referenceTotal)} · with ${i.marginPct}% margin + GST ${inr(i.grand)} · market vs reference ${i.marginVsMarket >= 0 ? '+' : ''}${inr(i.marginVsMarket)} (${i.marginVsMarketPct}%)`));
  } else if (priceErr) {
    kv.append(el('b', {}, 'Price'), el('span', { style: 'color:var(--r)' }, `${priceErr.code}: ${priceErr.message}`));
  }
  out.replaceChildren(el('div', { class: 'row', style: 'margin:6px 0' }, el('span', { class: 'tag info' }, `${b.systemConfig.systemType} ${b.systemConfig.size}${b.systemConfig.futureReady ? ' → ' + b.systemConfig.systemSize : ''} · ${p.tier} · ${b.systemConfig.phase}${p.sys === 'hybrid' ? ' · battery ' + b.systemConfig.batteryQuantity : ''}`), el('span', { class: 'tag ' + (b.engineering?.status === 'VALID' ? 'ok' : 'bad') }, `engineering ${b.engineering?.status}`), el('span', { class: 'tag mut' }, `source ${bom.configSource}`)), kv, el('div', { class: 'wrap', style: 'margin-top:8px' }, tb));
}

document.addEventListener('DOMContentLoaded', boot);

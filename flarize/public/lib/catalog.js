/**
 * ITEMS & PRICES — the plain item manager (2026-09-09 usability review).
 *
 * Add / edit catalog items (panels, inverters, batteries, cables, structure …),
 * set the reference price, tiers, DCR, warranty; approve (PH / Admin) and retire.
 * All validation and RBAC is server-side (/api/items). Prices shown here are
 * reference material prices — never exposed to Sales.
 */
'use strict';

const SESSION_KEY = 'gr_session_token';
const TIERS = [['base', 'Base'], ['value', 'Value'], ['premium', 'Premium']];
const FIELD_LABELS = {
  name: 'Item name', brand: 'Brand', model: 'Model', price: 'Reference price ₹', warranty: 'Warranty (printed on quotation)', unit: 'Unit', note: 'Note',
  watt: 'Watt (Wp)', dcr: 'DCR panel', panelType: 'Panel type', voc: 'Voc (V)', vmp: 'Vmp (V)', isc: 'Isc (A)', imp: 'Imp (A)', cells: 'Cells',
  kw: 'Capacity (kW)', phase: 'Phase', type: 'Type', mpptCount: 'MPPT count', maxInputVoltage: 'Max input voltage (V)', deviceType: 'Device type',
  kwh: 'Capacity (kWh)', capacityAh: 'Capacity (Ah)', voltage: 'Voltage (V)', rating: 'Rating', sqmm: 'Size (sq mm)', core: 'Cores',
  tubeSize: 'Tube size (e.g. 1.5x1.5)', structureRole: 'Structure role', specification: 'Specification (printed)',
};
const SELECT_FIELDS = { phase: ['1P', '3P', '1P/3P', 'HYB-1P', 'HYB-3P'], type: ['ongrid', 'hybrid'], panelType: ['DCR', 'NON_DCR'], deviceType: ['string_inverter', 'microinverter', 'hybrid_inverter'] };

const $ = (s, r = document) => r.querySelector(s);
const el = (t, a = {}, ...kids) => { const n = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v === false || v == null) {} else if (v === true) n.setAttribute(k, ''); else n.setAttribute(k, v); } for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k))); return n; };
const inr = n => n == null || !Number.isFinite(Number(n)) ? '—' : '₹' + Math.round(n).toLocaleString('en-IN');
const nowIso = () => new Date().toISOString();
function getToken() { try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } }
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!r.ok) throw Object.assign(new Error(data?.error || r.statusText), { status: r.status, code: data?.code });
  return data;
}
function toast(msg, kind = '') { const t = $('#toast'); t.textContent = msg; t.className = `toast ${kind}`; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 4500); }

const S = { data: null, cat: 'panel', q: '', canWrite: false, canApprove: false };

async function boot() {
  if (!getToken()) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return; }
  try { const me = await api('GET', '/api/auth/session'); const role = me?.user?.role || ''; if (['SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES'].includes(role)) { location.replace('/sales.html'); return; } }
  catch (e) { if (e.status === 401) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return; } }
  $('#q').addEventListener('input', () => { S.q = $('#q').value.trim().toLowerCase(); renderList(); });
  $('#btnAdd').addEventListener('click', () => { $('#addCard').hidden = false; renderAdd(); $('#addCard').scrollIntoView({ behavior: 'smooth' }); });
  await load();
}
async function load() {
  try {
    S.data = await api('GET', '/api/items');
    S.canWrite = S.data.roles.canWrite; S.canApprove = S.data.roles.canApprove;
    $('#btnAdd').hidden = !S.canWrite;
    if (!S.data.categories.some(c => c.key === S.cat)) S.cat = S.data.categories[0]?.key;
    renderCats(); renderList();
  } catch (e) { toast('Could not load items: ' + e.message, 'bad'); }
}
const cat = () => S.data.categories.find(c => c.key === S.cat);

function renderCats() {
  const c = $('#cats'); c.replaceChildren(el('div', { class: 'hint', style: 'margin:0 10px 6px' }, 'CATEGORIES'));
  for (const k of S.data.categories) {
    const pending = k.items.filter(i => i.approvalStatus === 'PENDING').length;
    c.append(el('button', { class: k.key === S.cat ? 'on' : '', onclick: () => { S.cat = k.key; $('#addCard').hidden = true; renderCats(); renderList(); } }, el('span', {}, k.label), el('small', {}, `${k.items.filter(i => (i.status || 'ACTIVE') === 'ACTIVE').length}${pending ? ` · ${pending} pending` : ''}`)));
  }
}

function renderList() {
  const c = cat(); const list = $('#list'); list.replaceChildren();
  if (!c) return;
  const items = c.items.filter(i => !S.q || `${i.name} ${i.brand || ''} ${i.model || ''} ${i.id}`.toLowerCase().includes(S.q));
  const specCols = (c.fields || []).filter(f => ['watt', 'kw', 'phase', 'type', 'sqmm', 'kwh', 'capacityAh', 'tubeSize'].includes(f));
  list.append(el('h3', { style: 'margin:0 0 8px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap' }, el('span', {}, `${c.label} `, el('small', { class: 'hint' }, `GST ${c.gstDefault}% · ${items.length} items`)), el('span', { class: 'hint' }, S.canWrite ? 'Click a price, tier or warranty to change it — saved immediately.' : 'Read-only for your role.')));
  const tb = el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['ITEM', 'BRAND / MODEL', ...specCols.map(f => FIELD_LABELS[f] || f), c.key === 'panel' ? 'DCR' : null, 'TIERS', 'REF ₹', 'WARRANTY', 'STATUS', ''].filter(Boolean).map(h => el('th', {}, h)))));
  const body = el('tbody');
  for (const it of items) {
    const retired = (it.status || 'ACTIVE') !== 'ACTIVE';
    const tr = el('tr', { class: retired ? 'retired' : '' });
    tr.append(el('td', {}, el('b', {}, it.name), el('div', { class: 'hint', style: 'font-family:var(--mono)' }, it.id)));
    tr.append(el('td', {}, [it.brand, it.model].filter(Boolean).join(' · ') || '—'));
    for (const f of specCols) tr.append(el('td', {}, it[f] != null ? String(it[f]) : '—'));
    if (c.key === 'panel') tr.append(el('td', {}, el('span', { class: 'tag ' + (it.dcr ? 'ok' : 'mut') }, it.dcr ? 'DCR' : 'Non-DCR')));
    // tiers
    tr.append(el('td', { class: 'tiers' }, TIERS.map(([k, l]) => { const cb = el('input', { type: 'checkbox', checked: (it.tiers || []).includes(k), disabled: !S.canWrite }); cb.addEventListener('change', () => { const tiers = TIERS.map(([t]) => t).filter(t => t === k ? cb.checked : (it.tiers || []).includes(t)); if (!tiers.length) { cb.checked = true; return toast('Keep at least one tier', 'bad'); } save(it, { tiers }); }); return el('label', {}, cb, l); })));
    // price
    const price = el('input', { type: 'number', value: it.price ?? '', disabled: !S.canWrite, step: '1', min: '0' });
    price.addEventListener('change', () => save(it, { price: price.value === '' ? null : Number(price.value) }));
    tr.append(el('td', { class: 'num' }, price));
    const w = el('input', { type: 'text', value: it.warranty || '', placeholder: 'e.g. 25 Years', disabled: !S.canWrite, style: 'width:120px' });
    w.addEventListener('change', () => save(it, { warranty: w.value }));
    tr.append(el('td', {}, w));
    const noPrice = !(Number(it.price) > 0);
    tr.append(el('td', {}, el('span', { class: 'tag ' + (retired ? 'mut' : it.approvalStatus === 'APPROVED' || !it.approvalStatus ? 'ok' : it.approvalStatus === 'PENDING' ? 'warn' : 'bad') }, retired ? 'RETIRED' : (it.approvalStatus || 'APPROVED')),
      noPrice && !retired ? el('div', { class: 'tag bad', style: 'margin-top:4px', title: 'Items without a reference price are not offered to Sales as swaps' }, 'NO PRICE') : ''));
    const actions = el('td', { class: 'row', style: 'white-space:nowrap' });
    if (S.canApprove && it.approvalStatus === 'PENDING') actions.append(el('button', { class: 'btn sm p', onclick: () => save(it, { approvalStatus: 'APPROVED' }) }, 'Approve'));
    if (S.canWrite) actions.append(el('button', { class: 'btn sm' + (retired ? '' : ' d'), onclick: () => { if (retired || confirm(`Retire "${it.name}"? It stays in old quotations but can no longer be picked.`)) save(it, { status: retired ? 'ACTIVE' : 'RETIRED' }); } }, retired ? 'Restore' : 'Retire'));
    tr.append(actions);
    body.append(tr);
  }
  if (!items.length) body.append(el('tr', {}, el('td', { colspan: 12, class: 'hint' }, 'No items match.')));
  tb.append(body); list.append(el('div', { class: 'wrap' }, tb));
}

async function save(it, patch) {
  try {
    const r = await api('PATCH', `/api/items/${S.cat}/${it.id}`, { ...patch, at: nowIso() });
    Object.assign(it, r.item);
    const keys = Object.keys(r.changed);
    toast(keys.length ? `Saved ${keys.join(', ')} for ${it.name}` : 'No change', 'ok');
    renderCats(); renderList();
  } catch (e) { toast(`Not saved: ${e.message}`, 'bad'); renderList(); }
}

function renderAdd() {
  const c = cat(); const card = $('#addCard'); card.replaceChildren();
  const form = {};
  const fields = ['name', 'brand', 'model', 'price', ...(c.fields || []).filter(f => !['dcr'].includes(f)), 'warranty', 'unit'];
  const inputs = {};
  card.append(el('h3', { style: 'margin:0 0 8px' }, `Add ${c.label}`), el('div', { class: 'hint', style: 'margin-bottom:8px' }, S.canApprove ? 'Added items are approved immediately and can be used in kW Packs.' : 'Added items wait for Project Head / Admin approval before they can be used in packs.'));
  const grid = el('div', { class: 'fields' });
  for (const f of fields) {
    let input;
    if (SELECT_FIELDS[f]) input = el('select', {}, el('option', { value: '' }, '—'), SELECT_FIELDS[f].map(v => el('option', { value: v }, v)));
    else input = el('input', { type: ['price', 'watt', 'kw', 'kwh', 'capacityAh', 'voltage', 'voc', 'vmp', 'isc', 'imp', 'cells', 'mpptCount', 'maxInputVoltage', 'sqmm', 'core'].includes(f) ? 'number' : 'text', step: 'any' });
    inputs[f] = input;
    grid.append(el('div', {}, el('label', {}, FIELD_LABELS[f] || f), input));
  }
  card.append(grid);
  const tierBox = el('div', { class: 'tiers', style: 'margin-top:10px' }, el('label', { style: 'font-weight:700;margin-right:10px' }, 'Tiers:'), TIERS.map(([k, l]) => el('label', {}, el('input', { type: 'checkbox', value: k, checked: k !== 'premium' }), l)));
  card.append(tierBox);
  card.append(el('div', { class: 'row', style: 'margin-top:12px' },
    el('button', { class: 'btn p', onclick: async () => {
      const body = { at: nowIso(), tiers: [...tierBox.querySelectorAll('input:checked')].map(i => i.value) };
      for (const [f, input] of Object.entries(inputs)) if (input.value !== '') body[f] = input.value;
      if (c.key === 'panel') body.dcr = body.panelType !== 'NON_DCR';
      try { const item = await api('POST', `/api/items/${c.key}`, body); toast(`Added ${item.name}${item.approvalStatus === 'PENDING' ? ' (pending approval)' : ''}`, 'ok'); card.hidden = true; await load(); }
      catch (e) { toast(`Not added: ${e.message}`, 'bad'); }
    } }, 'Save item'),
    el('button', { class: 'btn', onclick: () => { card.hidden = true; } }, 'Cancel')));
}

document.addEventListener('DOMContentLoaded', boot);

/**
 * Quotation content — DOCUMENT TEXT editor (P1, 2026-09-13).
 * Edits the bilingual store behind pages 3/8/9/10/11 via
 *   GET  /api/quotation-content            (draft + published + limits)
 *   PUT  /api/quotation-content/draft      (422 with per-field errors when it does not fit)
 *   POST /api/quotation-content/publish | /discard
 * ADMIN + PROJECT_HEAD. Counters use the same LIMITS the server enforces.
 */
const $ = (id) => document.getElementById(id);
const tok = () => { try { return sessionStorage.getItem('gr_session_token') || ''; } catch { return ''; } };
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || res.statusText); e.code = data.code; e.errors = data.errors; throw e; }
  return data;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg, kind = '') { const t = $('toast'); if (!t) return; t.textContent = msg; t.className = 'toast ' + kind; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => { t.style.display = 'none'; }, 5000); }

let LIMITS = null, STATE = null, DRAFT = null, TAB = 'terms', GEN = 4;
const TABS = [['terms', 'Terms & conditions (p10–11)'], ['timeline', 'Timeline (p9)'], ['scope', 'We handle / you do (p9)'], ['documents', 'Documents & structure (p8)'], ['life', 'Life now / with solar (p3)'], ['appliances', 'Appliances per kW (p3)'], ['labels', 'Headings & labels']];

/* ---------- bilingual field ---------- */
function field(path, obj, lim, opts = {}) {
  const tag = opts.multi ? 'textarea' : 'input type="text"';
  const cell = (lang) => {
    const v = obj?.[lang] ?? '';
    const max = typeof lim === 'object' ? lim[lang] : lim;
    return `<div><label class="f">${lang === 'en' ? 'English' : 'മലയാളം'} <span data-count="${path}.${lang}" class="${v.length > max ? 'over' : ''}">${v.length}/${max}</span></label>
      <${tag} class="${lang === 'ml' ? 'ml' : ''}" data-path="${path}.${lang}" data-max="${max}" ${opts.multi ? `rows="${opts.rows || 3}"` : ''}${opts.multi ? `>${esc(v)}</textarea>` : ` value="${esc(v)}">`}</div>`;
  };
  return `<div class="doc-2">${cell('en')}${cell('ml')}</div>`;
}
const itemHd = (title, path, idx, len, opts = {}) => `<div class="hd"><b>${esc(title)}</b><span>
  <button class="btn sm" data-move="${path}:${idx}:-1" ${idx === 0 ? 'disabled' : ''}>↑</button>
  <button class="btn sm" data-move="${path}:${idx}:1" ${idx === len - 1 ? 'disabled' : ''}>↓</button>
  ${opts.noDelete ? '' : `<button class="btn sm" data-del="${path}:${idx}">Remove</button>`}</span></div>`;

function render() {
  const c = DRAFT.content; const L = LIMITS;
  $('docTabs').innerHTML = TABS.map(([k, l]) => `<button class="doc-tab ${TAB === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('');
  let h = '';
  if (TAB === 'terms') {
    h += `<div class="hint">${c.terms.length} clauses (max ${L.terms.max}). Both pages together fit about ${L.terms.totalBody.en.toLocaleString()} English characters.</div>`;
    h += c.terms.map((t, i) => `<div class="doc-item">${itemHd(`${i + 1}. ${t.title.en}`, 'terms', i, c.terms.length)}${field(`terms.${i}.title`, t.title, L.terms.title)}${field(`terms.${i}.body`, t.body, L.terms.body, { multi: true, rows: 4 })}</div>`).join('');
    h += `<div class="row" style="margin-top:8px"><button class="btn sm" data-add="terms" ${c.terms.length >= L.terms.max ? 'disabled' : ''}>+ Add clause</button></div>`;
  } else if (TAB === 'timeline') {
    h += `<div class="hint">${L.timeline.min}–${L.timeline.max} steps, printed left to right.</div>`;
    h += c.timeline.map((t, i) => `<div class="doc-item">${itemHd(`Step ${i + 1}`, 'timeline', i, c.timeline.length)}
      <div class="doc-2"><div><label class="f">Day(s) <span data-count="timeline.${i}.days.en">${t.days.en.length}/${L.timeline.days.en}</span></label><input type="text" data-path="timeline.${i}.days.en" data-max="${L.timeline.days.en}" value="${esc(t.days.en)}" style="width:90px"></div><div><label class="f">ദിവസം</label><input type="text" class="ml" data-path="timeline.${i}.days.ml" data-max="${L.timeline.days.ml}" value="${esc(t.days.ml)}" style="width:90px"></div></div>
      ${field(`timeline.${i}.title`, t.title, L.timeline.title)}${field(`timeline.${i}.body`, t.body, L.timeline.body, { multi: true })}</div>`).join('');
    h += `<div class="row" style="margin-top:8px"><button class="btn sm" data-add="timeline" ${c.timeline.length >= L.timeline.max ? 'disabled' : ''}>+ Add step</button></div>`;
  } else if (TAB === 'scope') {
    for (const [key, title] of [['weHandle', 'What we handle'], ['customerScope', 'What you need to do (customer scope)']]) {
      h += `<h3 style="margin:14px 0 4px;font-size:14px">${title} <span class="hint">(${c[key].length}/${L[key].max})</span></h3>`;
      h += c[key].map((t, i) => `<div class="doc-item">${itemHd(`${i + 1}`, key, i, c[key].length)}${field(`${key}.${i}`, t, L[key].item, { multi: true, rows: 2 })}</div>`).join('');
      h += `<div class="row" style="margin-top:8px"><button class="btn sm" data-add="${key}" ${c[key].length >= L[key].max ? 'disabled' : ''}>+ Add point</button></div>`;
    }
  } else if (TAB === 'documents') {
    h += `<h3 style="margin:4px 0;font-size:14px">Required documents <span class="hint">(${c.requiredDocuments.length}/${L.requiredDocuments.max})</span></h3>`;
    h += c.requiredDocuments.map((t, i) => `<div class="doc-item">${itemHd(`${i + 1}`, 'requiredDocuments', i, c.requiredDocuments.length)}${field(`requiredDocuments.${i}`, t, L.requiredDocuments.item)}</div>`).join('');
    h += `<div class="row" style="margin-top:8px"><button class="btn sm" data-add="requiredDocuments" ${c.requiredDocuments.length >= L.requiredDocuments.max ? 'disabled' : ''}>+ Add document</button></div>`;
    h += `<h3 style="margin:16px 0 4px;font-size:14px">Additional structure cost line (page 8)</h3><div class="doc-item">${field('extraStructureCost.label', c.extraStructureCost.label, L.extraStructureCost.label)}
      <div class="doc-2"><div><label class="f">Value (e.g. ₹4,500/kW) <span data-count="extraStructureCost.value">${c.extraStructureCost.value.length}/${L.extraStructureCost.value}</span></label><input type="text" data-path="extraStructureCost.value" data-max="${L.extraStructureCost.value}" value="${esc(c.extraStructureCost.value)}"></div></div></div>`;
  } else if (TAB === 'life') {
    for (const [key, title] of [['lifeNow', 'Your life now (3 points)'], ['lifeSolar', 'Your life with solar (3 points)']]) {
      h += `<h3 style="margin:14px 0 4px;font-size:14px">${title}</h3>`;
      h += c[key].map((t, i) => `<div class="doc-item">${itemHd(`${i + 1}`, key, i, c[key].length, { noDelete: true })}${field(`${key}.${i}.title`, t.title, L[key].title)}${field(`${key}.${i}.body`, t.body, L[key].body, { multi: true, rows: 2 })}</div>`).join('');
    }
  } else if (TAB === 'appliances') {
    const A = c.appliances; const W = Object.fromEntries(A.master.map(m => [m.id, m]));
    h += `<h3 style="margin:4px 0;font-size:14px">Appliance master <span class="hint">watts × hours × quantity ÷ 1000 = units/day</span></h3>
      <table class="doc-table"><tr><th>Id</th><th>Name (EN)</th><th>Name (ML)</th><th>Icon</th><th>Watts</th><th>Default hrs</th><th>Optional</th><th></th></tr>
      ${A.master.map((m, i) => `<tr><td><input type="text" data-path="appliances.master.${i}.id" value="${esc(m.id)}" style="width:120px"></td><td><input type="text" data-path="appliances.master.${i}.name.en" value="${esc(m.name.en)}" style="width:170px"></td><td><input type="text" class="ml" data-path="appliances.master.${i}.name.ml" value="${esc(m.name.ml)}" style="width:170px"></td><td><input type="text" data-path="appliances.master.${i}.icon" value="${esc(m.icon)}" style="width:44px"></td><td><input type="number" data-path="appliances.master.${i}.watts" value="${m.watts}"></td><td><input type="number" step="0.25" data-path="appliances.master.${i}.defaultHours" value="${m.defaultHours}"></td><td><input type="checkbox" data-path="appliances.master.${i}.optional" ${m.optional ? 'checked' : ''}></td><td><button class="btn sm" data-del="appliances.master:${i}">✕</button></td></tr>`).join('')}</table>
      <div class="row" style="margin-top:6px"><button class="btn sm" data-add="appliances.master" ${A.master.length >= L.appliances.masterMax ? 'disabled' : ''}>+ Add appliance</button></div>`;
    for (const kw of Object.keys(A.profiles).sort((a, b) => a - b)) {
      const rows = A.profiles[kw]; const gen = Number(kw) * GEN; const cap = Math.round(gen * L.appliances.loadRatioMax * 10) / 10;
      const total = Math.round(rows.reduce((s, r) => s + (W[r.id] ? r.qty * W[r.id].watts * r.hours / 1000 : 0), 0) * 10) / 10;
      h += `<h3 style="margin:16px 0 4px;font-size:14px">${kw} kW default house <span class="hint">${rows.length}/${L.appliances.profileRowsMax} rows · <b class="${total > cap ? 'over' : ''}" style="${total > cap ? 'color:var(--r)' : 'color:var(--g)'}">${total} units/day</b> of ${gen} generated (limit ${cap})</span> <button class="btn sm" data-delprofile="${kw}">Remove ${kw} kW</button></h3>
        <table class="doc-table"><tr><th>Appliance</th><th>Qty</th><th>Hours/day</th><th>Units/day</th><th></th></tr>
        ${rows.map((r, i) => `<tr><td><select data-path="appliances.profiles.${kw}.${i}.id">${A.master.map(m => `<option value="${esc(m.id)}" ${m.id === r.id ? 'selected' : ''}>${esc(m.name.en)}</option>`).join('')}</select></td><td><input type="number" data-path="appliances.profiles.${kw}.${i}.qty" value="${r.qty}"></td><td><input type="number" step="0.25" data-path="appliances.profiles.${kw}.${i}.hours" value="${r.hours}"></td><td>${W[r.id] ? Math.round(r.qty * W[r.id].watts * r.hours / 100) / 10 : '?'}</td><td><button class="btn sm" data-del="appliances.profiles.${kw}:${i}">✕</button></td></tr>`).join('')}</table>
        <div class="row" style="margin-top:6px"><button class="btn sm" data-add="appliances.profiles.${kw}" ${rows.length >= L.appliances.profileRowsMax ? 'disabled' : ''}>+ Add row</button></div>`;
    }
    h += `<div class="row" style="margin-top:12px"><input type="number" id="newProfileKw" placeholder="kW" style="width:90px"><button class="btn sm" id="addProfile">+ Add kW profile</button></div>`;
  } else if (TAB === 'labels') {
    h += `<div class="hint">Headings and captions printed on pages 3, 8, 9, 10. Keys are fixed; text is yours.</div>`;
    h += Object.keys(c.labels).map(k => `<div class="doc-item"><div class="hd"><b>${esc(k)}</b></div>${field(`labels.${k}`, c.labels[k], L.labels)}</div>`).join('');
  }
  $('docBody').innerHTML = h;
  const st = STATE.status;
  $('docState').textContent = st.draft.unpublishedChanges ? `draft v${st.draft.version} · unpublished changes` : `published v${st.published.version}`;
  $('docState').className = 'tag ' + (st.draft.unpublishedChanges ? 'warn' : 'ok');
  $('docHint').textContent = st.published.publishedAt ? `Live since ${new Date(st.published.publishedAt).toLocaleString()} by ${st.published.publishedBy || '—'}` : '';
}

/* ---------- path helpers on DRAFT.content ---------- */
function getAt(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), DRAFT.content); }
function setAt(path, v) { const ks = path.split('.'); const last = ks.pop(); const o = ks.reduce((o, k) => o[k], DRAFT.content); o[last] = v; }

document.addEventListener('input', (ev) => {
  const el = ev.target; const path = el.dataset?.path; if (!path || !DRAFT) return;
  if (el.type === 'checkbox') setAt(path, el.checked);
  else if (el.type === 'number') setAt(path, el.value === '' ? 0 : Number(el.value));
  else setAt(path, el.value);
  const cnt = document.querySelector(`[data-count="${path}"]`); const max = Number(el.dataset.max);
  if (cnt && max) { cnt.textContent = `${el.value.length}/${max}`; cnt.className = el.value.length > max ? 'over' : ''; }
});
document.addEventListener('change', (ev) => { const el = ev.target; if (el.tagName === 'SELECT' && el.dataset?.path) { setAt(el.dataset.path, el.value); render(); } });
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (!b || !DRAFT) return;
  if (b.dataset.tab) { TAB = b.dataset.tab; render(); return; }
  const blank = { en: '', ml: '' };
  if (b.dataset.add) {
    const k = b.dataset.add; const arr = getAt(k);
    if (k === 'terms') arr.push({ title: { ...blank }, body: { ...blank } });
    else if (k === 'timeline') arr.push({ days: { ...blank }, title: { ...blank }, body: { ...blank } });
    else if (k === 'appliances.master') arr.push({ id: 'new_item', name: { en: 'New appliance', ml: '' }, icon: '', watts: 100, defaultHours: 1, optional: true });
    else if (k.startsWith('appliances.profiles.')) arr.push({ id: DRAFT.content.appliances.master[0]?.id, qty: 1, hours: 1 });
    else arr.push({ ...blank });
    render(); return;
  }
  if (b.dataset.del) { const [k, i] = b.dataset.del.split(':'); getAt(k).splice(Number(i), 1); render(); return; }
  if (b.dataset.move) { const [k, i, d] = b.dataset.move.split(':'); const arr = getAt(k); const a = Number(i), bIdx = a + Number(d); if (bIdx < 0 || bIdx >= arr.length) return; [arr[a], arr[bIdx]] = [arr[bIdx], arr[a]]; render(); return; }
  if (b.dataset.delprofile) { delete DRAFT.content.appliances.profiles[b.dataset.delprofile]; render(); return; }
  if (b.id === 'addProfile') { const kw = Number($('newProfileKw').value); if (kw > 0) { DRAFT.content.appliances.profiles[String(kw)] = []; render(); } return; }
});

function showErrors(errs) {
  $('docErrors').innerHTML = errs && errs.length ? `<b>Does not fit the page — fix these first:</b><ul style="margin:4px 0 0 18px">${errs.map(e => `<li>${esc(e.message)}</li>`).join('')}</ul>` : '';
}
async function load() {
  const d = await api('GET', '/api/quotation-content');
  LIMITS = d.limits; STATE = d; GEN = d.dailyGenPerKw || 4;
  DRAFT = JSON.parse(JSON.stringify(d.draft));
  if (!DRAFT.content) { $('docBody').innerHTML = '<div class="hint">No content store yet (data/quotation-content.json). Run scripts/build-quotation-content-seed.py.</div>'; return; }
  render();
}
async function save(publish) {
  try {
    showErrors([]);
    const r = await api('PUT', '/api/quotation-content/draft', { content: DRAFT.content });
    if (publish) await api('POST', '/api/quotation-content/publish');
    toast(publish ? `Published v${(await api('GET', '/api/quotation-content')).status.published.version} — live for new quotations` : 'Draft saved', 'ok');
    await load();
  } catch (e) {
    if (e.errors) { showErrors(e.errors); toast('Some fields do not fit the page — see the list', 'bad'); }
    else toast(e.message, 'bad');
  }
}
$('docSave').onclick = () => save(false);
$('docPublish').onclick = () => { if (confirm('Publish the draft? New quotations will print this text.')) save(true); };
$('docDiscard').onclick = async () => { if (!confirm('Discard unpublished changes?')) return; try { await api('POST', '/api/quotation-content/discard'); toast('Draft reset to published', 'ok'); await load(); } catch (e) { toast(e.message, 'bad'); } };
load().catch(e => { $('docState').textContent = e.code === 'ROLE_DENIED' ? 'read-only' : 'error'; $('docBody').innerHTML = `<div class="hint">${esc(e.message)}</div>`; });

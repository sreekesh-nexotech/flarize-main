/**
 * Quotation content — the simple editor for everything a customer reads in the
 * quotation that is not price or engineering:
 *   • Offer page (page 2)  → CMS campaign record (content keys), activate / deactivate
 *   • Testimonials (page 6) → data/quotation-testimonials.json via /api/quotation-content/testimonials
 * Images are uploaded through the existing CMS asset store (/api/cms/assets) and
 * referenced by their public file URL. Admin only for writes.
 */
const $ = (id) => document.getElementById(id);
const token = () => { try { return sessionStorage.getItem('gr_session_token') || ''; } catch { return ''; } };
const nowIso = () => new Date().toISOString();

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || res.statusText); e.code = data.code; throw e; }
  return data;
}
function toast(msg, kind = '') { const t = $('toast'); t.textContent = msg; t.className = 'toast ' + kind; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => { t.style.display = 'none'; }, 4500); }
const val = (id) => ($(id)?.value ?? '').trim();
const num = (id) => { const v = val(id); return v === '' ? null : Number(v); };
const set = (id, v) => { const el = $(id); if (el) el.value = v == null ? '' : String(v); };
const setImg = (id, uri) => { set(id, uri || ''); const th = $(id + '-thumb'); if (th) { th.src = uri || ''; th.style.visibility = uri ? 'visible' : 'hidden'; } };

// ---- image upload (CMS asset store) -----------------------------------------
async function uploadImage(file) {
  if (!file) return null;
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Only PNG or JPEG images are accepted');
  if (file.size > 5 * 1024 * 1024) throw new Error('Image larger than 5 MB');
  const data = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(file); });
  const out = await api('POST', '/api/cms/assets', { data, filename: file.name, mimeType: file.type });
  const id = out.assetId || out.asset?.assetId;
  return `/api/cms/assets/${encodeURIComponent(id)}/file`;
}
document.addEventListener('change', async (ev) => {
  const input = ev.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.dataset.target) return;
  try { const uri = await uploadImage(input.files[0]); setImg(input.dataset.target, uri); toast('Image uploaded', 'ok'); }
  catch (e) { toast(e.message, 'bad'); }
  input.value = '';
});

// ---- offer page --------------------------------------------------------------
let CAMPAIGN = null;
function offerRow(i, o = {}) {
  return `<div class="entry"><h3>Offer ${i + 1}</h3><div class="grid">
    <div><label class="f">Title</label><input type="text" id="of-${i}-title" value="${esc(o.title)}" placeholder="AC voucher"></div>
    <div><label class="f">Description</label><input type="text" id="of-${i}-desc" value="${esc(o.description)}" placeholder="Worth ₹5,000 on booking"></div>
    <div><label class="f">Photo</label><div class="upl"><img class="thumb" id="of-${i}-img-thumb" alt=""><input type="file" accept="image/png,image/jpeg" data-target="of-${i}-img"><input type="hidden" id="of-${i}-img" value="${esc(o.image)}"></div></div>
  </div></div>`;
}
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fillOffer(c) {
  CAMPAIGN = c;
  const on = c && c.status === 'ACTIVE';
  $('offerOn').checked = !!on;
  $('offerState').textContent = c ? (on ? 'ON — printed as page 2' : 'OFF — page 2 not printed') : 'not set up yet';
  $('offerState').className = 'tag ' + (on ? 'ok' : 'mut');
  set('o-name', c?.name); set('o-yearBadge', c?.yearBadge); set('o-festival', c?.theme?.festival); set('o-headline', c?.headline); set('o-subheadline', c?.subheadline);
  set('o-pbHeadline', c?.primaryBenefit?.headline); set('o-pbValue', c?.primaryBenefit?.displayValue);
  set('o-urgText', c?.urgency?.displayText); set('o-urgCount', c?.urgency?.remainingCount);
  set('o-periodText', c?.period?.displayText); set('o-periodNote', c?.period?.note);
  set('o-ctaText', c?.cta?.buttonText); set('o-ctaDesc', c?.cta?.description); set('o-disclaimer', c?.disclaimer);
  set('o-ldTitle', c?.luckyDraw?.title); set('o-ldWinners', c?.luckyDraw?.winners); set('o-ldDesc', c?.luckyDraw?.description);
  const offers = Array.isArray(c?.offers) ? c.offers : [];
  $('offers').innerHTML = [0, 1, 2].map(i => offerRow(i, offers[i] || {})).join('');
  setImg('o-ldImg', c?.luckyDraw?.image || '');
  [0, 1, 2].forEach(i => setImg(`of-${i}-img`, offers[i]?.image || ''));
}
function readOffer() {
  const offers = [0, 1, 2].map((i, idx) => ({ title: val(`of-${i}-title`) || null, description: val(`of-${i}-desc`) || null, image: val(`of-${i}-img`) || null, enabled: true, sortOrder: idx + 1 }))
    .filter(o => o.title);
  return {
    name: val('o-name') || 'Offer page',
    theme: val('o-festival') ? { festival: val('o-festival') } : null,
    yearBadge: val('o-yearBadge') || null, headline: val('o-headline') || null, subheadline: val('o-subheadline') || null,
    primaryBenefit: val('o-pbValue') ? { headline: val('o-pbHeadline') || null, displayValue: val('o-pbValue') } : null,
    urgency: (val('o-urgText') || num('o-urgCount') != null) ? { enabled: true, displayText: val('o-urgText') || null, remainingCount: num('o-urgCount') } : null,
    period: (val('o-periodText') || val('o-periodNote')) ? { displayText: val('o-periodText') || null, note: val('o-periodNote') || null } : null,
    cta: (val('o-ctaText') || val('o-ctaDesc')) ? { enabled: true, buttonText: val('o-ctaText') || null, description: val('o-ctaDesc') || null } : null,
    disclaimer: val('o-disclaimer') || null,
    luckyDraw: (val('o-ldTitle') || val('o-ldDesc')) ? { enabled: true, title: val('o-ldTitle') || null, description: val('o-ldDesc') || null, winners: num('o-ldWinners'), image: val('o-ldImg') || null } : null,
    offers,
  };
}
async function loadOffer() {
  try {
    const { campaigns } = await api('GET', '/api/cms/campaigns');
    const list = (campaigns || []).filter(c => c.status !== 'ARCHIVED');
    const hasContent = (c) => !!(c.headline || c.subheadline || c.primaryBenefit || (Array.isArray(c.offers) && c.offers.length));
    // ACTIVE wins; otherwise the most recently edited campaign that has offer
    // content. Empty shells (e.g. created by API tests) are ignored — saving
    // with none selected creates a fresh campaign.
    const c = list.find(c => c.status === 'ACTIVE') || list.filter(hasContent).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
    fillOffer(c);
  } catch (e) { $('offerState').textContent = e.message; $('offerState').className = 'tag warn'; }
}
$('saveOffer').onclick = async () => {
  const btn = $('saveOffer'); btn.disabled = true;
  try {
    const body = readOffer();
    if (!CAMPAIGN) { const out = await api('POST', '/api/cms/campaigns', { name: body.name }); CAMPAIGN = out.campaign || out; }
    const id = CAMPAIGN.campaignId;
    await api('PUT', `/api/cms/campaigns/${encodeURIComponent(id)}`, body);
    const wantOn = $('offerOn').checked;
    if (wantOn) await api('POST', `/api/cms/campaigns/${encodeURIComponent(id)}/activate`);
    else if (CAMPAIGN.status === 'ACTIVE') await api('POST', `/api/cms/campaigns/${encodeURIComponent(id)}/deactivate`);
    await loadOffer();
    toast(wantOn ? 'Offer page saved and ON' : 'Offer page saved (OFF)', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
  btn.disabled = false;
};

// Approved design (template v1 page 2 — Onam Solar Fest 2026) as form content.
// The JSON is the owner's own artwork values; loading only fills the form.
$('loadApproved').onclick = async () => {
  try {
    const seed = await (await fetch('/assets/quotation/approved-offer-campaign.json', { cache: 'no-store' })).json();
    const { _note, ...content } = seed;
    const keep = CAMPAIGN ? { campaignId: CAMPAIGN.campaignId, status: CAMPAIGN.status } : {};
    fillOffer({ ...(CAMPAIGN || {}), ...content, ...keep });
    toast('Approved Onam design loaded into the form — check the campaign period and slots, then Save (switch ON to print it).', 'ok');
  } catch (e) { toast('Could not load the approved design: ' + e.message, 'bad'); }
};
$('previewOffer').onclick = () => { window.open('/offer-preview.html', '_blank'); };

// ---- testimonials ------------------------------------------------------------
function testiRow(i, t = {}) {
  return `<div class="entry"><h3>Testimonial ${i + 1}</h3><div class="grid">
    <div><label class="f">Customer name</label><input type="text" id="ts-${i}-name" value="${esc(t.name)}" placeholder="Jose V P"></div>
    <div><label class="f">Place</label><input type="text" id="ts-${i}-place" value="${esc(t.place)}" placeholder="Vadakkal, Alappuzha"></div>
    <div><label class="f">System (kW)</label><input type="number" step="0.1" id="ts-${i}-kw" value="${esc(t.systemKw)}"></div>
    <div><label class="f">Installed on (text)</label><input type="text" id="ts-${i}-on" value="${esc(t.installedOn)}" placeholder="June 2025"></div>
    <div style="grid-column:1/-1"><label class="f">Quote (their words)</label><textarea id="ts-${i}-quote">${esc(t.quote)}</textarea></div>
    <div><label class="f">Bill before (₹/month)</label><input type="number" id="ts-${i}-before" value="${esc(t.billBefore)}"></div>
    <div><label class="f">Bill after (₹/month)</label><input type="number" id="ts-${i}-after" value="${esc(t.billAfter)}"></div>
    <div><label class="f">Monthly saving (₹)</label><input type="number" id="ts-${i}-save" value="${esc(t.monthlySaving)}"></div>
    <div><label class="f">Photo</label><div class="upl"><img class="thumb" id="ts-${i}-img-thumb" alt=""><input type="file" accept="image/png,image/jpeg" data-target="ts-${i}-img"><input type="hidden" id="ts-${i}-img" value="${esc(t.photoUri)}"></div></div>
  </div></div>`;
}
function fillTesti(d) {
  set('t-intro', d?.intro);
  const list = Array.isArray(d?.entries) ? d.entries : [];
  $('testis').innerHTML = [0, 1, 2].map(i => testiRow(i, list[i] || {})).join('');
  [0, 1, 2].forEach(i => setImg(`ts-${i}-img`, list[i]?.photoUri || ''));
  set('t-vTitle', d?.video?.title); set('t-vText', d?.video?.text); set('t-vLink', d?.video?.link); setImg('t-vQr', d?.video?.qrImageUri || '');
  const n = list.filter(t => t && t.name && t.quote).length;
  $('testiState').textContent = n ? `${n} testimonial${n > 1 ? 's' : ''} — page 6 printed` : 'none yet — page 6 not printed';
  $('testiState').className = 'tag ' + (n ? 'ok' : 'mut');
}
async function loadTesti() {
  try { fillTesti(await api('GET', '/api/quotation-content/testimonials')); }
  catch (e) { $('testiState').textContent = e.message; $('testiState').className = 'tag warn'; }
}
$('saveTesti').onclick = async () => {
  const btn = $('saveTesti'); btn.disabled = true;
  try {
    const entries = [0, 1, 2].map(i => ({ name: val(`ts-${i}-name`), place: val(`ts-${i}-place`), systemKw: num(`ts-${i}-kw`), installedOn: val(`ts-${i}-on`), quote: val(`ts-${i}-quote`), billBefore: num(`ts-${i}-before`), billAfter: num(`ts-${i}-after`), monthlySaving: num(`ts-${i}-save`), photoUri: val(`ts-${i}-img`) }))
      .filter(t => t.name || t.quote);
    const out = await api('PUT', '/api/quotation-content/testimonials', { at: nowIso(), intro: val('t-intro'), entries, video: { title: val('t-vTitle'), text: val('t-vText'), link: val('t-vLink'), qrImageUri: val('t-vQr') } });
    fillTesti(out); toast('Testimonials saved', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
  btn.disabled = false;
};

loadOffer(); loadTesti();

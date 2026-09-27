/**
 * SALES WIZARD — Phase 2 (2026-09-02).
 *
 * Guided 7-step Sales flow. Pure UI + orchestration layer over existing APIs.
 * No business calculation. No engine duplication. No cost/margin exposure.
 *
 * The wizard is a THIN CLIENT:
 *   Step 1  Customer         → /api/sales/customers
 *   Step 2  Bill+Requirement → /api/sales/recommend-size
 *   Step 3  Choose System    → /api/sales/system-options + /api/packages(?variant=…) + /api/sales/preflight
 *   Step 4  Customize        → /api/sales/component-alternatives (panel · inverter · structure_material)
 *   Step 5  Review Plant     → /api/sales/bom-preview (Sales-safe)
 *   Step 6  Price & Offer    → /api/offers + /api/sales/orchestrate + /api/quotation/quotations/:id/payload (EMI)
 *   Step 7  Generate         → open /quotation-document.html?id=…
 *
 * Every displayed number comes from an authoritative backend response.
 * The wizard NEVER computes: BOM, cost, margin, GST, offer deduction total, EMI.
 */

'use strict';

// ---------------------------------------------------------------------------
// AUTH + FETCH
// ---------------------------------------------------------------------------

const SESSION_KEY = 'gr_session_token';
const ROLE_KEY = 'gr_user_role';

function getToken() {
  try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}

function getRole() {
  try { return sessionStorage.getItem(ROLE_KEY) || ''; } catch { return ''; }
}

function authHeaders(extra = {}) {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken(), ...extra };
}

async function api(method, url, body) {
  const opts = { method, headers: authHeaders() };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text || 'Invalid JSON response' }; }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data?.code || null;
    err.detail = data?.detail || null;
    err.body = data;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------------------
// ERROR MAPPER — imported from /lib/sales-wizard-errors.js (pure module).
// Loaded via a separate <script> tag so it is testable under Node independently.
// ---------------------------------------------------------------------------

const translateOrchestratorError = (window.SalesWizardErrors && window.SalesWizardErrors.translateOrchestratorError)
  || function fallbackErrorMapper(code, detail) {
    return { rawCode: code, rawDetail: detail, businessMessage: 'Unable to complete this quotation.', owner: 'Support' };
  };
const translatePreflightBlockers = (window.SalesWizardErrors && window.SalesWizardErrors.translatePreflightBlockers)
  || function fallbackPreflightMapper() { return null; };

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------

const STATE = {
  step: 1,
  customer: null,
  bill: { amount: null, cycle: 'monthly', phase: 'single', connectionType: 'domestic', subsidyType: 'residential', ghsHouses: 1 },
  site: { installationType: null, distanceKm: null, vehicleType: null },   // site facts → INSTALLATION (exact size+type) + TRANSPORTATION (one-way × vehicle)
  recommendation: null,
  systemType: null,
  size: null,
  phaseCode: null,           // '1P' or '3P'
  tier: null,                // 'base' | 'value' | 'premium'
  variant: null,             // null | 'FUTURE_READY'
  batteryQuantity: null,     // hybrid only: 0 | 1 | 2 — PROJECT-level option (B.6), presented to Sales as plant cards
  selectedPackage: null,
  systemOptions: null,       // /api/sales/system-options
  tierDisplayNames: null,    // /api/sales/tier-display-names
  approvedByCombo: {},       // { `${sysType}|${size}|${tier}|${phase}|${variant||'STD'}`: pkg|null }
  alternates: { panel: null, inverter: null, structure_material: null },
  selections: { panel: null, inverter: null, structure_material: null },
  bomPreview: null,
  offers: [],
  selectedOffer: null,
  orchestrateResult: null,
  commercial: null,          // customer-facing figures copied from the ISSUED payload (subsidy / net payable / savings / EMI / validity)
  emi: null,
  emiSource: null,           // 'PAYLOAD_FINANCE' | 'UNAVAILABLE'
  blocker: null,
  quotationNumber: null,
};

// ---------------------------------------------------------------------------
// DOM HELPERS
// ---------------------------------------------------------------------------

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Math.round(Number(n));
  return '₹' + v.toLocaleString('en-IN');
}

function el(id) { return document.getElementById(id); }
function q(sel) { return document.querySelector(sel); }
function on(node, ev, fn) { if (node) node.addEventListener(ev, fn); }

// ---------------------------------------------------------------------------
// STEP LABELS + STEPPER
// ---------------------------------------------------------------------------

const STEPS = [
  { n: 1, label: 'Customer' },
  { n: 2, label: 'Bill' },
  { n: 3, label: 'System' },
  { n: 4, label: 'Customize' },
  { n: 5, label: 'Review' },
  { n: 6, label: 'Price' },
  { n: 7, label: 'Done' },
];

function renderStepper() {
  const html = STEPS.map(s => {
    const cls = s.n < STATE.step ? 'done' : s.n === STATE.step ? 'current' : '';
    return `<div class="sw-step-dot ${cls}"><span class="sw-num">${s.n}</span>${esc(s.label)}</div>`;
  }).join('');
  el('sw-stepper').innerHTML = html;
}

// ---------------------------------------------------------------------------
// GENERIC RENDER
// ---------------------------------------------------------------------------

function render() {
  renderStepper();
  const card = el('sw-card');
  card.innerHTML = '';
  switch (STATE.step) {
    case 1: return renderStep1();
    case 2: return renderStep2();
    case 3: return renderStep3();
    case 4: return renderStep4();
    case 5: return renderStep5();
    case 6: return renderStep6();
    case 7: return renderStep7();
  }
}

function footer(back, primary) {
  return `<div class="sw-footer">
    <div>${back ? `<button class="sw-btn sw-btn-ghost" id="sw-back">← Back</button>` : ''}</div>
    <div>${primary || ''}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// STEP 1 — CUSTOMER
// ---------------------------------------------------------------------------

let searchDebounce;
async function searchCustomers(term) {
  const url = '/api/sales/customers' + (term ? `?q=${encodeURIComponent(term)}` : '');
  const data = await api('GET', url);
  return data?.customers || [];
}

async function renderStep1() {
  const card = el('sw-card');
  card.innerHTML = `
    <h1 class="sw-title">Customer</h1>
    <p class="sw-sub">Choose an existing customer or add a new one.</p>
    <div class="sw-form-row">
      <label>Search by name or phone</label>
      <input type="text" id="sw-search" class="sw-input" placeholder="Type to search…" autocomplete="off" />
    </div>
    <div id="sw-cust-list" class="sw-list" style="margin-bottom:24px"></div>
    <details style="margin-top:24px">
      <summary style="cursor:pointer;font-weight:600;color:var(--accent)">+ Add new customer</summary>
      <div style="margin-top:16px;padding:16px;background:#f8fafc;border-radius:8px">
        <div class="sw-form-row"><label>Name<span class="req">*</span></label><input type="text" id="sw-c-name" class="sw-input" /></div>
        <div class="sw-form-row"><label>Phone<span class="req">*</span></label><input type="tel" id="sw-c-phone" class="sw-input" placeholder="10-digit mobile" /></div>
        <div class="sw-form-row"><label>Email</label><input type="email" id="sw-c-email" class="sw-input" /></div>
        <div class="sw-form-row"><label>Address</label><input type="text" id="sw-c-address" class="sw-input" /></div>
        <div class="sw-form-row"><label>District</label><input type="text" id="sw-c-district" class="sw-input" /></div>
        <div class="sw-form-row"><label>Pincode</label><input type="text" id="sw-c-pincode" class="sw-input" /></div>
        <div id="sw-c-err" class="sw-err"></div>
        <button class="sw-btn sw-btn-primary" id="sw-c-save">Save + Continue</button>
      </div>
    </details>
    ${STATE.customer ? `<div style="margin-top:20px;padding:16px;background:var(--accent-soft);border-radius:8px">
      <div style="font-weight:600">Selected: ${esc(STATE.customer.name)}</div>
      <div style="color:var(--dim);font-size:13px;margin-top:4px">${esc(STATE.customer.phone)}</div>
    </div>` : ''}
    ${footer(false, `<button class="sw-btn sw-btn-primary" id="sw-next" ${STATE.customer ? '' : 'disabled'}>Continue →</button>`)}
  `;

  on(el('sw-search'), 'input', e => {
    clearTimeout(searchDebounce);
    const term = e.target.value.trim();
    searchDebounce = setTimeout(async () => {
      try {
        const list = await searchCustomers(term);
        el('sw-cust-list').innerHTML = list.slice(0, 8).map(c =>
          `<div class="sw-customer-row" data-id="${esc(c.customerId)}">
            <div>
              <div class="sw-customer-name">${esc(c.name)}</div>
              <div class="sw-customer-meta">${esc(c.phone || '')} · ${esc(c.district || c.address || '')}</div>
            </div>
            <button class="sw-btn sw-btn-ghost sw-select-cust" data-id="${esc(c.customerId)}">Select</button>
          </div>`
        ).join('') || '<div class="sw-hint">No customers found. Add a new one below.</div>';
        document.querySelectorAll('.sw-select-cust').forEach(b =>
          on(b, 'click', () => { const c = list.find(x => x.customerId === b.dataset.id); STATE.customer = c; render(); }));
      } catch (err) { el('sw-cust-list').innerHTML = `<div class="sw-err">${esc(err.message)}</div>`; }
    }, 220);
  });

  on(el('sw-c-save'), 'click', async () => {
    const name = el('sw-c-name').value.trim();
    const phone = el('sw-c-phone').value.trim();
    const errEl = el('sw-c-err'); errEl.textContent = '';
    if (!name) return errEl.textContent = 'Name is required.';
    if (!/^[6-9]\d{9}$/.test(phone)) return errEl.textContent = 'Phone must be a valid 10-digit Indian mobile.';
    try {
      const c = await api('POST', '/api/sales/customers', {
        name, phone,
        email: el('sw-c-email').value.trim(),
        address: el('sw-c-address').value.trim(),
        district: el('sw-c-district').value.trim(),
        pincode: el('sw-c-pincode').value.trim(),
      });
      STATE.customer = c;
      STATE.step = 2; render();
    } catch (err) {
      errEl.textContent = err.code === 'CUSTOMER_DUPLICATE'
        ? `A customer with this phone already exists: ${err.body?.existingCustomer?.name || ''}`
        : err.message;
    }
  });

  on(el('sw-next'), 'click', () => { STATE.step = 2; render(); });
}

// ---------------------------------------------------------------------------
// STEP 2 — BILL & REQUIREMENT
// ---------------------------------------------------------------------------

function renderStep2() {
  const card = el('sw-card');
  const r = STATE.recommendation;
  if (!STATE.systemOptions) {
    card.innerHTML = `<div class="sw-progress"><div class="sw-spinner"></div><div class="sw-progress-msg">Loading configured site options…</div></div>`;
    ensureSystemOptions().then(render).catch(err => { card.innerHTML = `<div class="sw-blocker bad"><div class="sw-blocker-title">Site options unavailable</div><div class="sw-blocker-msg">${esc(err.message)}</div></div>${footer(true, '')}`; on(el('sw-back'), 'click', () => { STATE.step = 1; render(); }); });
    return;
  }
  const site = STATE.systemOptions.siteOptions || { installationTypes: [], vehicleTypes: [] };
  card.innerHTML = `
    <h1 class="sw-title">Electricity Bill & Requirement</h1>
    <p class="sw-sub">Tell us about your customer's usage to get a recommendation.</p>
    <div class="sw-form-row"><label>Monthly electricity bill (₹)</label>
      <input type="number" id="sw-bill" class="sw-input" value="${STATE.bill.amount || ''}" min="0" step="100" /></div>
    <div class="sw-form-row"><label>Billing cycle</label>
      <div class="sw-radio-group">
        <label><input type="radio" name="sw-cycle" value="monthly" ${STATE.bill.cycle==='monthly'?'checked':''}/> Monthly</label>
        <label><input type="radio" name="sw-cycle" value="bimonthly" ${STATE.bill.cycle==='bimonthly'?'checked':''}/> Bi-monthly</label>
      </div></div>
    <div class="sw-form-row"><label>Phase</label>
      <div class="sw-radio-group">
        <label><input type="radio" name="sw-phase" value="single" ${STATE.bill.phase==='single'?'checked':''}/> Single</label>
        <label><input type="radio" name="sw-phase" value="three" ${STATE.bill.phase==='three'?'checked':''}/> Three</label>
      </div></div>
    <div class="sw-form-row"><label>Connection type</label>
      <div class="sw-radio-group">
        <label><input type="radio" name="sw-conn" value="domestic" ${STATE.bill.connectionType==='domestic'?'checked':''}/> Domestic</label>
        <label><input type="radio" name="sw-conn" value="commercial" ${STATE.bill.connectionType==='commercial'?'checked':''}/> Commercial</label>
      </div></div>
    <div class="sw-form-row"><label>Central subsidy scheme (PM Surya Ghar)</label>
      <div class="sw-radio-group">
        <label><input type="radio" name="sw-subsidy" value="residential" ${STATE.bill.subsidyType==='residential'?'checked':''}/> Residential</label>
        <label><input type="radio" name="sw-subsidy" value="ghs" ${STATE.bill.subsidyType==='ghs'?'checked':''}/> Group housing</label>
        <label><input type="radio" name="sw-subsidy" value="none" ${STATE.bill.subsidyType==='none'?'checked':''}/> Not applicable</label>
      </div>
      <div class="sw-hint">Eligibility and amount are decided by the subsidy engine at quotation time — never entered here.</div></div>
    <div class="sw-form-row" id="sw-ghs-row" ${STATE.bill.subsidyType==='ghs'?'':'hidden'}><label>Houses in the society</label>
      <input type="number" id="sw-ghs" class="sw-input" value="${STATE.bill.ghsHouses || 1}" min="1" step="1" /></div>
    <h2 class="sw-title" style="font-size:16px;margin-top:18px">Site</h2>
    <div class="sw-form-row"><label>Installation / roof type</label>
      <div class="sw-radio-group" id="sw-inst-group">
        ${(site.installationTypes || []).map(t => `<label><input type="radio" name="sw-inst" value="${esc(t)}" ${STATE.site.installationType===t?'checked':''}/> ${esc(t.charAt(0) + t.slice(1).toLowerCase())}</label>`).join('') || '<span class="sw-hint">No installation types configured — Project Head must publish the installation matrix.</span>'}
      </div></div>
    <div class="sw-form-row"><label>One-way distance, warehouse → site (km)</label>
      <input type="number" id="sw-dist" class="sw-input" value="${STATE.site.distanceKm ?? ''}" min="0" step="1" />
      <div class="sw-hint">Actual one-way distance. Transport is priced as distance × the Project Head's vehicle rate — never round trip, never a free allowance.</div></div>
    <div class="sw-form-row"><label>Transport vehicle</label>
      <select class="sw-select" id="sw-veh">
        ${STATE.site.vehicleType ? '' : '<option value="" selected disabled>Choose vehicle…</option>'}
        ${(site.vehicleTypes || []).map(v => `<option value="${esc(v.vehicleType)}" ${STATE.site.vehicleType===v.vehicleType?'selected':''}>${esc(v.vehicleName || v.vehicleType)}</option>`).join('')}
      </select>
      ${(site.vehicleTypes || []).length ? '' : '<div class="sw-hint">No vehicle rates configured — Project Head must publish the transport rate card.</div>'}</div>
    <div id="sw-site-err" class="sw-err"></div>
    <button class="sw-btn sw-btn-primary" id="sw-reco-btn">Show recommendation →</button>
    <div id="sw-reco-out">${r ? renderRecoCard(r) : ''}</div>
    ${footer(true, `<button class="sw-btn sw-btn-primary" id="sw-next" ${r ? '' : 'disabled'}>Continue →</button>`)}
  `;
  const readBillForm = () => {
    const amount = Number(el('sw-bill').value);
    const cycle = q('input[name=sw-cycle]:checked').value;
    const phase = q('input[name=sw-phase]:checked').value;
    const connectionType = q('input[name=sw-conn]:checked')?.value || 'domestic';
    const subsidyType = q('input[name=sw-subsidy]:checked')?.value || 'none';
    const ghsHouses = Math.max(1, Number(el('sw-ghs')?.value) || 1);
    return { amount, cycle, phase, connectionType, subsidyType, ghsHouses };
  };
  document.querySelectorAll('input[name=sw-subsidy]').forEach(rb => on(rb, 'change', () => {
    STATE.bill = { ...STATE.bill, ...readBillForm(), amount: STATE.bill.amount };
    STATE.orchestrateResult = null;
    el('sw-ghs-row').hidden = STATE.bill.subsidyType !== 'ghs';
  }));
  document.querySelectorAll('input[name=sw-conn]').forEach(rb => on(rb, 'change', () => {
    STATE.bill = { ...STATE.bill, ...readBillForm(), amount: STATE.bill.amount };
    STATE.orchestrateResult = null;
  }));
  const readSiteForm = () => ({
    installationType: q('input[name=sw-inst]:checked')?.value || null,
    distanceKm: el('sw-dist').value === '' ? null : Number(el('sw-dist').value),
    vehicleType: el('sw-veh')?.value || null,
  });
  const siteError = (st) => !st.installationType ? 'Choose the installation / roof type.'
    : (st.distanceKm == null || !Number.isFinite(st.distanceKm) || st.distanceKm < 0) ? 'Enter the one-way distance in km (0 or more).'
    : !st.vehicleType ? 'Choose the transport vehicle.' : '';
  ['sw-dist', 'sw-veh'].forEach(id => on(el(id), 'change', () => { STATE.site = readSiteForm(); STATE.orchestrateResult = null; el('sw-site-err').textContent = ''; }));
  document.querySelectorAll('input[name=sw-inst]').forEach(rb => on(rb, 'change', () => { STATE.site = readSiteForm(); STATE.orchestrateResult = null; el('sw-site-err').textContent = ''; }));
  on(el('sw-back'), 'click', () => { STATE.step = 1; render(); });
  on(el('sw-next'), 'click', () => {
    STATE.bill = { ...STATE.bill, ...readBillForm(), amount: STATE.bill.amount };
    STATE.site = readSiteForm();
    const e = siteError(STATE.site); if (e) { el('sw-site-err').textContent = e; return; }
    STATE.step = 3; render();
  });
  on(el('sw-reco-btn'), 'click', async () => {
    const { amount, cycle, phase, connectionType, subsidyType, ghsHouses } = readBillForm();
    if (!amount || amount <= 0) { el('sw-reco-out').innerHTML = '<div class="sw-err">Enter a valid bill amount.</div>'; return; }
    STATE.bill = { amount, cycle, phase, connectionType, subsidyType, ghsHouses };
    el('sw-reco-out').innerHTML = '<div class="sw-progress"><div class="sw-spinner"></div><div class="sw-progress-msg">Calculating recommendation…</div></div>';
    try {
      const rec = await api('GET', `/api/sales/recommend-size?billAmount=${amount}&billingCycle=${cycle}&phase=${phase}`);
      STATE.recommendation = rec;
      render();
    } catch (err) {
      el('sw-reco-out').innerHTML = `<div class="sw-blocker bad"><div class="sw-blocker-title">Recommendation unavailable</div><div class="sw-blocker-msg">${esc(err.message)}</div></div>`;
    }
  });
}

function renderRecoCard(r) {
  return `<div class="sw-reco-card">
    <div class="sw-reco-num">${esc(r.recommendedSystemSizeKw)} kW</div>
    <div class="sw-reco-label">Recommended system size</div>
    ${r.monthlyGeneration != null ? `<div class="sw-reco-fact"><span>Expected monthly generation</span><b>${esc(Math.round(r.monthlyGeneration))} kWh</b></div>` : ''}
    ${r.estimatedMonthlySavingsLow != null ? `<div class="sw-reco-fact"><span>Estimated monthly savings</span><b>${money(r.estimatedMonthlySavingsLow)} – ${money(r.estimatedMonthlySavingsHigh)}</b></div>` : ''}
    <div class="sw-hint" style="margin-top:12px">Numbers from the energy engine. Continue to choose an approved system.</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// STEP 3 — CHOOSE SYSTEM (three plans + FR toggle · NOT a fourth tier)
// ---------------------------------------------------------------------------

async function ensureSystemOptions() {
  if (STATE.systemOptions && STATE.tierDisplayNames) return;
  const [opts, tdn] = await Promise.all([
    api('GET', '/api/sales/system-options'),
    api('GET', '/api/sales/tier-display-names').catch(() => ({ available:false, names:null, recommendedTier:null, recommendedBadge:null })),
  ]);
  STATE.systemOptions = opts;
  STATE.tierDisplayNames = tdn;
}

/** Customer-facing size label from the server's system options (e.g. "5 kW · 1P"), never the raw size key. */
function sizeLabel() {
  const sz = (STATE.systemOptions?.options?.[STATE.systemType]?.sizes || []).find(s => s.key === STATE.size);
  return sz?.label || `${String(STATE.size || '').replace(/[^0-9.]/g, '')} kW`;
}

function comboKey(sysType, size, tier, phase, variant) {
  return `${sysType}|${size}|${tier}|${phase}|${variant || 'STD'}`;
}

async function fetchApprovedPackage(sysType, size, tier, phase, variant) {
  const key = comboKey(sysType, size, tier, phase, variant);
  if (STATE.approvedByCombo[key] !== undefined) return STATE.approvedByCombo[key];
  const params = new URLSearchParams({
    approvalStatus: 'APPROVED',
    systemType: sysType, size, tier, phase,
  });
  if (variant) params.set('variant', variant);
  try {
    const data = await api('GET', '/api/packages?' + params.toString());
    const pkg = (data?.packages || [])[0] || null;
    STATE.approvedByCombo[key] = pkg;
    return pkg;
  } catch { STATE.approvedByCombo[key] = null; return null; }
}

async function renderStep3() {
  const card = el('sw-card');
  card.innerHTML = `<div class="sw-progress"><div class="sw-spinner"></div><div class="sw-progress-msg">Loading approved systems…</div></div>`;
  await ensureSystemOptions();

  if (!STATE.systemType) STATE.systemType = 'ongrid';
  if (!STATE.size) STATE.size = String(STATE.recommendation?.recommendedSystemSizeKw || '5');

  // Normalise size to a template key that exists
  const opts = STATE.systemOptions?.options?.[STATE.systemType];
  const sizeKeys = (opts?.sizes || []).map(s => s.key);
  if (!sizeKeys.includes(STATE.size)) {
    // Try to find nearest — but wizard MUST not fabricate; pick first available.
    STATE.size = sizeKeys[0] || null;
  }
  const sizeMeta = (opts?.sizes || []).find(s => s.key === STATE.size);
  STATE.phaseCode = sizeMeta?.phase || '1P';

  const tdn = STATE.tierDisplayNames?.names || {};
  const recommendedTier = STATE.tierDisplayNames?.recommendedTier || 'value';
  const recommendedBadge = STATE.tierDisplayNames?.recommendedBadge || 'Recommended';

  // Fetch approved package for each of the three tiers (STD variant)
  const tiers = ['base', 'value', 'premium'];
  const stdApproved = {};
  for (const t of tiers) stdApproved[t] = await fetchApprovedPackage(STATE.systemType, STATE.size, t, STATE.phaseCode, null);

  // FR is not a fourth tier — check FR existence for the currently-selected tier only.
  const selectedTierForFR = STATE.tier || recommendedTier;
  const frPkg = STATE.tier ? await fetchApprovedPackage(STATE.systemType, STATE.size, selectedTierForFR, STATE.phaseCode, 'FUTURE_READY') : null;

  const planCard = (tier, pkg) => {
    const display = tdn[tier] || (tier[0].toUpperCase() + tier.slice(1) + ' System');
    const isRecommended = tier === recommendedTier;
    const isSelected = STATE.tier === tier;
    const disabled = !pkg;
    return `<div class="sw-plan ${isRecommended ? 'recommended' : ''} ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''}" data-tier="${esc(tier)}">
      ${isRecommended ? `<div class="sw-plan-badge">${esc(recommendedBadge)}</div>` : ''}
      <div class="sw-plan-name">${esc(display)}</div>
      <div class="sw-plan-desc">${esc(planDescription(tier))}</div>
      ${disabled
        ? `<div class="sw-plan-blocked">Not yet approved for sales</div>`
        : `<button class="sw-btn ${isSelected ? 'sw-btn-primary' : 'sw-btn-ghost'} sw-pick-tier" data-tier="${esc(tier)}">${isSelected ? 'Selected' : 'Select'}</button>`}
    </div>`;
  };

  // Variant toggle appears ONLY when tier selected AND FR variant exists for that tier
  const variantToggleHtml = (() => {
    if (!STATE.tier) return '';
    // Trigger FR fetch for the selected tier
    return `<div id="sw-fr-slot"></div>`;
  })();

  // Battery storage option (hybrid only, after a plan is chosen). Conformance §15 /
  // B.6: battery QUANTITY is a project-level parameter owned by the Project Head;
  // Sales only picks one of the permitted counts the approved package allows. The
  // battery MODEL is fixed by the approved package and is not selectable here. A
  // package without an approved battery offers only "no battery".
  const batteryOptionHtml = (() => {
    if (STATE.systemType !== 'hybrid' || !STATE.tier) return '';
    const pkg = stdApproved[STATE.tier];
    const hasBattery = !!(pkg?.components || []).some(c => String(c.role).toLowerCase() === 'battery' && c.componentId);
    const allowed = Array.isArray(pkg?.batteryConfig?.allowedQuantities)
      ? pkg.batteryConfig.allowedQuantities
      : (hasBattery ? [0, 1, 2] : [0]);
    if (STATE.batteryQuantity == null || !allowed.includes(STATE.batteryQuantity)) {
      STATE.batteryQuantity = allowed.includes(1) ? 1 : allowed[0];
    }
    const label = q => q === 0 ? 'No battery' : q === 1 ? '1 battery' : `${q} batteries`;
    return `<div class="sw-form-row">
      <label>Battery storage</label>
      <div class="sw-tabs" id="sw-bat-tabs">
        ${allowed.map(q => `<button class="sw-tab ${q === STATE.batteryQuantity ? 'active' : ''}" data-batq="${q}">${label(q)}</button>`).join('')}
      </div>
      ${hasBattery ? '' : '<div class="sw-sub" style="margin-top:6px">This plan has no approved battery. Ask Engineering to add one to offer storage.</div>'}
    </div>`;
  })();

  card.innerHTML = `
    <h1 class="sw-title">Choose System</h1>
    <p class="sw-sub">Pick a size, then an approved plan. All numbers come from Engineering-approved packages.</p>
    <div class="sw-form-row">
      <label>System capacity (kW)</label>
      <div class="sw-tabs" id="sw-size-tabs">
        ${(opts?.sizes || []).map(s => `<button class="sw-tab ${s.key===STATE.size?'active':''}" data-size="${esc(s.key)}">${esc(s.label)}</button>`).join('')}
      </div>
    </div>
    <div class="sw-form-row">
      <label>System type</label>
      <div class="sw-tabs">
        ${Object.keys(STATE.systemOptions?.options || {}).map(k =>
          `<button class="sw-tab ${k===STATE.systemType?'active':''}" data-systype="${esc(k)}">${esc(STATE.systemOptions.options[k].label)}</button>`).join('')}
      </div>
    </div>
    <div class="sw-plans">
      ${tiers.map(t => planCard(t, stdApproved[t])).join('')}
    </div>
    ${batteryOptionHtml}
    ${variantToggleHtml}
    ${footer(true, `<button class="sw-btn sw-btn-primary" id="sw-next" ${STATE.tier ? '' : 'disabled'}>Continue →</button>`)}
  `;
  on(el('sw-back'), 'click', () => { STATE.step = 2; render(); });
  document.querySelectorAll('[data-batq]').forEach(b => on(b, 'click', () => { STATE.batteryQuantity = Number(b.dataset.batq); STATE.orchestrateResult = null; render(); }));
  on(el('sw-next'), 'click', () => { STATE.selectedPackage = STATE.approvedByCombo[comboKey(STATE.systemType, STATE.size, STATE.tier, STATE.phaseCode, STATE.variant)]; STATE.step = 4; STATE.selections = { panel: null, inverter: null, structure_material: null }; render(); });
  document.querySelectorAll('[data-size]').forEach(b => on(b, 'click', () => { STATE.size = b.dataset.size; STATE.tier = null; STATE.variant = null; render(); }));
  document.querySelectorAll('[data-systype]').forEach(b => on(b, 'click', () => { STATE.systemType = b.dataset.systype; STATE.tier = null; STATE.variant = null; STATE.batteryQuantity = null; render(); }));
  document.querySelectorAll('.sw-pick-tier').forEach(b => on(b, 'click', () => { STATE.tier = b.dataset.tier; STATE.variant = null; render(); }));

  if (STATE.tier) renderFRSlot(frPkg);
}

function planDescription(tier) {
  if (tier === 'base') return 'Approved essential specification.';
  if (tier === 'value') return 'Balanced value and performance.';
  if (tier === 'premium') return 'Higher-specification approved package.';
  return '';
}

function renderFRSlot(frPkg) {
  const slot = el('sw-fr-slot');
  if (!slot) return;
  if (!frPkg && STATE.variant !== 'FUTURE_READY') {
    // No FR record exists — hide the toggle entirely per rule (do not fabricate).
    slot.innerHTML = '';
    return;
  }
  slot.innerHTML = `<div class="sw-variant-toggle">
    <div class="sw-variant-toggle-label">Configuration</div>
    <div class="sw-variant-btns">
      <button class="sw-variant-btn ${!STATE.variant ? 'active' : ''}" data-variant="STD">Standard</button>
      <button class="sw-variant-btn ${STATE.variant === 'FUTURE_READY' ? 'active' : ''}" data-variant="FR" ${frPkg ? '' : 'disabled'}>Future Ready</button>
    </div>
    <div class="sw-hint" style="margin-top:10px">${frPkg
      ? 'Future Ready: prepared for a later capacity upgrade using approved larger inverter and supporting infrastructure.'
      : 'Future Ready not approved for this configuration.'}</div>
  </div>`;
  document.querySelectorAll('[data-variant]').forEach(b => on(b, 'click', () => {
    STATE.variant = b.dataset.variant === 'FR' ? 'FUTURE_READY' : null;
    render();
  }));
}

// ---------------------------------------------------------------------------
// STEP 4 — CUSTOMIZE (panel · inverter · structure only)
// ---------------------------------------------------------------------------

async function fetchAlternates(category) {
  const p = new URLSearchParams({
    systemType: STATE.systemType, size: STATE.size, tier: STATE.tier, phase: STATE.phaseCode, category,
  });
  try {
    const data = await api('GET', '/api/sales/component-alternatives?' + p.toString());
    return data?.alternatives?.[category] || [];
  } catch { return []; }
}

async function renderStep4() {
  const card = el('sw-card');
  card.innerHTML = `<div class="sw-progress"><div class="sw-spinner"></div><div class="sw-progress-msg">Loading approved alternatives…</div></div>`;
  const [panelAlts, inverterAlts, structureAlts] = await Promise.all([
    fetchAlternates('panel'),
    fetchAlternates('inverter'),
    fetchAlternates('structure_material'),
  ]);
  STATE.alternates = { panel: panelAlts, inverter: inverterAlts, structure_material: structureAlts };
  // Defaults come from the server (`isDefault` = the approved package's own
  // component, or a catalog-flagged default). Never the first list item: when the
  // server marks no default — structure, which the package does not carry — Sales
  // must choose explicitly before continuing.
  if (!STATE.selections.panel) STATE.selections.panel = panelAlts.find(a => a.isDefault)?.id || null;
  if (!STATE.selections.inverter) STATE.selections.inverter = inverterAlts.find(a => a.isDefault)?.id || null;
  if (!STATE.selections.structure_material) STATE.selections.structure_material = structureAlts.find(a => a.isDefault)?.id || null;

  const altRow = (label, cat, alts, hint, required = false) => {
    if (!alts.length) return `<div class="sw-form-row">
      <label>${esc(label)}</label>
      <div class="sw-blocker"><div class="sw-blocker-title">Alternatives pending Engineering approval</div>
        <div class="sw-blocker-msg">${esc(hint)}</div></div></div>`;
    const chosen = STATE.selections[cat];
    return `<div class="sw-form-row"><label>${esc(label)}${required ? ' <span style="color:var(--bad,#b91c1c)">*</span>' : ''}</label>
      <select class="sw-select" data-cat="${esc(cat)}">
        ${chosen ? '' : `<option value="" selected disabled>Choose ${esc(label.toLowerCase())}…</option>`}
        ${alts.map(a => `<option value="${esc(a.id)}" ${chosen===a.id?'selected':''}>${esc(a.brand || '')} ${esc(a.name || a.id)}${a.watt?` · ${esc(a.watt)}W`:''}${a.kw?` · ${esc(a.kw)}kW`:''}${a.isDefault?' (package default)':''}</option>`).join('')}
      </select></div>`;
  };
  const structureRequired = structureAlts.length > 0;

  card.innerHTML = `
    <h1 class="sw-title">Customize</h1>
    <p class="sw-sub">Choose from approved alternatives for Panel, Inverter and Structure only. All other components are engineering-controlled.</p>
    ${altRow('Solar Panel', 'panel', panelAlts, 'Panel alternatives will appear when Engineering approves them.')}
    ${altRow('Inverter', 'inverter', inverterAlts, 'Inverter alternatives will appear when Engineering approves them.')}
    ${altRow('Structure', 'structure_material', structureAlts, 'No approved structure material is available for this system. Engineering must approve structure alternatives before a quotation can be generated.', true)}
    <div id="sw-cust-err" class="sw-err"></div>
    ${footer(true, `<button class="sw-btn sw-btn-primary" id="sw-next">Review plant →</button>`)}
  `;
  on(el('sw-back'), 'click', () => { STATE.step = 3; render(); });
  document.querySelectorAll('[data-cat]').forEach(sel => on(sel, 'change', e => { STATE.selections[sel.dataset.cat] = e.target.value || null; STATE.orchestrateResult = null; el('sw-cust-err').textContent = ''; }));
  on(el('sw-next'), 'click', () => {
    if (structureRequired && !STATE.selections.structure_material) { el('sw-cust-err').textContent = 'Choose the structure material for this site — the plant cannot be priced without it.'; return; }
    STATE.step = 5; render();
  });
}

// ---------------------------------------------------------------------------
// STEP 5 — REVIEW PLANT
// ---------------------------------------------------------------------------

async function renderStep5() {
  const card = el('sw-card');
  card.innerHTML = `<div class="sw-progress"><div class="sw-spinner"></div><div class="sw-progress-msg">Building plant preview…</div></div>`;
  const tierSelections = {};
  tierSelections[STATE.tier] = {};
  if (STATE.selections.panel) tierSelections[STATE.tier].panel = STATE.selections.panel;
  if (STATE.selections.inverter) tierSelections[STATE.tier].inverter = STATE.selections.inverter;
  if (STATE.selections.structure_material) tierSelections[STATE.tier].structure_material = STATE.selections.structure_material;

  try {
    const data = await api('POST', '/api/sales/bom-preview', {
      systemType: STATE.systemType, size: STATE.size, phase: STATE.phaseCode, tierSelections,
      ...(STATE.systemType === 'hybrid' && STATE.batteryQuantity != null ? { batteryQuantity: STATE.batteryQuantity } : {}),
    });
    STATE.bomPreview = data?.boms?.[STATE.tier] || null;
  } catch (err) {
    card.innerHTML = `<h1 class="sw-title">Review Plant</h1>
      <div class="sw-blocker bad"><div class="sw-blocker-title">Preview unavailable</div><div class="sw-blocker-msg">${esc(err.message)}</div></div>
      ${footer(true, '')}`;
    on(el('sw-back'), 'click', () => { STATE.step = 4; render(); });
    return;
  }

  const bom = STATE.bomPreview;
  const lines = bom?.lines || [];
  const findByCat = c => lines.find(l => l.category === c);
  const panel = findByCat('panel');
  const inverter = findByCat('inverter');
  const structure = findByCat('structure_material') || findByCat('fixed');  // structure lives in fixed for some templates
  const enphase = lines.find(l => l.category === 'enphase' && /IQ8P/i.test(l.name || ''));
  const battery = findByCat('battery');
  // Customer-friendly "included" groups — derived from the categories the server
  // resolved (presence only; no quantities, no ids, no engineering detail).
  const has = (...cats) => lines.some(l => cats.includes(l.category) && Number(l.qty) > 0);
  const included = [
    has('acdb', 'dcdb', 'isolator', 'change_over', 'la_cable', 'la_rod', 'mccb_box') ? 'Protection' : null,
    has('dc_cable', 'ac_cable', 'ug_cable', 'armoured_cable', 'conduit_pipe', 'flexible_pipe') ? 'DC/AC cabling' : null,
    has('earth_cable', 'cb_rod') ? 'Earthing' : null,
    has('monitoring', 'enphase', 'hoymiles') ? 'Monitoring' : null,
    has('meter', 'meter_box') ? 'Net meter (KSEB)' : null,
  ].filter(Boolean);

  const tdn = STATE.tierDisplayNames?.names || {};
  const planName = tdn[STATE.tier] || STATE.tier;

  const tile = (label, value) => `<div class="sw-plant-tile"><span class="sw-plant-tile-label">${esc(label)}</span><span class="sw-plant-tile-value">${value}</span></div>`;

  card.innerHTML = `
    <h1 class="sw-title">Review Plant</h1>
    <p class="sw-sub">${esc(planName)}${STATE.variant === 'FUTURE_READY' ? ' · Future Ready' : ''} · ${esc(sizeLabel())} · ${esc(STATE.systemOptions?.options?.[STATE.systemType]?.label || STATE.systemType)}</p>
    <div class="sw-plant-tiles">
      ${tile('System capacity', esc(sizeLabel()))}
      ${panel ? tile('Solar Panel', `${esc(panel.brand || '')} ${esc(panel.name || '')}<br><span style="color:var(--dim);font-weight:400">${esc(panel.qty)} nos${panel.watt?` · ${esc(panel.watt)}W`:''}</span>`) : tile('Solar Panel', '<span style="color:var(--warn)">Not resolved</span>')}
      ${inverter ? tile('Inverter', `${esc(inverter.brand || '')} ${esc(inverter.name || '')}<br><span style="color:var(--dim);font-weight:400">${esc(inverter.qty)} no${inverter.qty>1?'s':''}${inverter.kw?` · ${esc(inverter.kw)}kW`:''}</span>`) : (enphase ? tile('Micro Inverter', `${esc(enphase.name)}<br><span style="color:var(--dim);font-weight:400">${esc(enphase.qty)} nos</span>`) : tile('Inverter', '<span style="color:var(--warn)">Not resolved</span>'))}
      ${structure ? tile('Structure', esc(structure.name || 'Standard mount')) : tile('Structure', 'Standard mounting (package default)')}
      ${STATE.systemType === 'hybrid' ? (battery && Number(battery.qty) > 0
          ? tile('Battery storage', `${esc(battery.brand || '')} ${esc(battery.name || '')}<br><span style="color:var(--dim);font-weight:400">${esc(battery.qty)} no${Number(battery.qty) > 1 ? 's' : ''}</span>`)
          : tile('Battery storage', 'No battery in this plan (battery-ready)')) : ''}
      ${STATE.variant === 'FUTURE_READY' ? tile('Configuration', 'Future Ready — prepared for upgrade') : ''}
      ${tile('Included', included.length ? esc(included.join(' · ')) : 'All approved installation components per BOM')}
    </div>
    ${footer(true, `<button class="sw-btn sw-btn-primary" id="sw-next">Price & Offer →</button>`)}
  `;
  on(el('sw-back'), 'click', () => { STATE.step = 4; render(); });
  on(el('sw-next'), 'click', () => { STATE.step = 6; render(); });
}

// ---------------------------------------------------------------------------
// STEP 6 — PRICE & OFFER  (single orchestrate call · zero frontend math)
// ---------------------------------------------------------------------------

async function fetchOffersAndOrchestrate() {
  // Fetch offers first (informational only — orchestrator auto-selects best match).
  try { STATE.offers = (await api('GET', '/api/offers'))?.offers || []; } catch { STATE.offers = []; }

  // Orchestrate — single authoritative call. Backend runs the 15-step internal flow.
  const tierSelections = {};
  const sel = STATE.selections;
  if (sel.panel || sel.inverter || sel.structure_material) {
    const t = {};
    if (sel.panel) t.panel = sel.panel;
    if (sel.inverter) t.inverter = sel.inverter;
    if (sel.structure_material) t.structure_material = sel.structure_material;
    tierSelections[STATE.tier] = t;
  }

  const body = {
    customer: {
      customerId: STATE.customer.customerId,
      customerName: STATE.customer.name,
      name: STATE.customer.name,
      phone: STATE.customer.phone,
      email: STATE.customer.email,
      address: STATE.customer.address,
      district: STATE.customer.district,
      pincode: STATE.customer.pincode,
      // Energy / savings engine inputs (customer facts captured in step 2).
      currentBillAmount: STATE.bill.amount ?? null,
      currentBillCycle: STATE.bill.cycle || 'monthly',
      connectionPhase: STATE.bill.phase || 'single',
      connectionType: STATE.bill.connectionType || 'domestic',
    },
    systemType: STATE.systemType,
    size: STATE.size,
    tier: STATE.tier,
    phase: STATE.phaseCode,
    variant: STATE.variant || null,
    tierSelections,
    // Subsidy inputs: scheme applicability is a customer fact; eligibility and
    // amount are computed server-side by subsidyEngine and frozen in the snapshot.
    // Site facts (required server-side; no defaults are applied anywhere).
    installationType: STATE.site.installationType,
    distanceKm: STATE.site.distanceKm,
    vehicleType: STATE.site.vehicleType,
    subsidyType: STATE.bill.subsidyType || 'none',
    ...(STATE.bill.subsidyType === 'ghs' ? { ghsHouses: STATE.bill.ghsHouses || 1 } : {}),
    ...(STATE.systemType === 'hybrid' && STATE.batteryQuantity != null ? { batteryQuantity: STATE.batteryQuantity } : {}),
  };

  const result = await api('POST', '/api/sales/orchestrate', body);
  STATE.orchestrateResult = result;

  // Fetch the ISSUED payload (frozen at issue; every figure below is copied from
  // the server's engines — subsidyEngine / savingsEngine / financeEngine — and
  // the frozen validity policy. Nothing is computed here.)
  STATE.commercial = null;
  if (result?.quotationId) {
    try {
      const p = await api('GET', `/api/quotation/quotations/${encodeURIComponent(result.quotationId)}/payload`);
      const pl = p?.payload || {};
      const fin = pl.financing || null;
      const sub = pl.subsidy || null;
      const sav = pl.savings || null;
      const en = pl.energyProfile || null;
      const finV = fin && fin.available ? (fin.value || {}) : null;
      STATE.commercial = {
        subsidy: sub && sub.available ? { amount: sub.value?.totalSubsidy ?? null, scheme: sub.value?.schemeName ?? null }
          : { amount: null, reason: sub?.reason ?? null, status: sub?.status ?? null, treatment: sub?.treatment ?? null },
        netPayable: finV ? (finV.postSubsidyInvestment ?? null) : null,
        monthlySavings: sav && sav.available ? (sav.value?.monthlySavings ?? null) : null,
        // Generation: savingsEngine exposes annualOutputKwh / dailyGenerationUnits; energy
        // engine exposes a daily low/high band. Displayed as the engine states them.
        annualGenerationKwh: sav && sav.available ? (sav.value?.annualOutputKwh ?? null) : null,
        dailyGenerationUnits: sav && sav.available ? (sav.value?.dailyGenerationUnits ?? null)
          : (en && en.available && en.value?.dailyGenerationLow != null ? en.value.dailyGenerationLow : null),
        emi: finV ? { monthly: finV.monthlyEMI ?? null, tenure: finV.tenureMonths ?? null } : null,
        validUntil: pl.quotation?.validUntil ?? null,
        validityDays: null,
      };
      // Validity comes from the frozen effective-period policy on the issued version.
      try {
        const ver = result.version ?? 1;
        const v = await api('GET', `/api/quotation/quotations/${encodeURIComponent(result.quotationId)}/versions/${ver}`);
        const val = v?.snapshot?.validity || null;
        if (val) { STATE.commercial.validityDays = val.validityDays ?? val.effectiveDays ?? null; STATE.commercial.validUntil = val.validUntil ?? STATE.commercial.validUntil; }
      } catch { /* validity stays as the payload states it */ }
      if (STATE.commercial.emi && STATE.commercial.emi.monthly != null) { STATE.emi = STATE.commercial.emi; STATE.emiSource = 'PAYLOAD_FINANCE'; }
      else { STATE.emi = null; STATE.emiSource = 'UNAVAILABLE'; }
    } catch { STATE.emi = null; STATE.emiSource = 'UNAVAILABLE'; }
  }
}

const PROGRESS_MESSAGES = [
  'Configuring plant…',
  'Checking engineering…',
  'Locking BOM…',
  'Calculating price…',
  'Applying offer…',
  'Preparing quotation…',
];

async function renderStep6() {
  const card = el('sw-card');
  card.innerHTML = `<h1 class="sw-title">Price & Offer</h1><div id="sw-p6-body"><div class="sw-progress"><div class="sw-spinner"></div><div class="sw-progress-msg" id="sw-p6-msg">Preparing…</div></div></div>`;

  // If orchestrate already ran, just render result — do not re-orchestrate on Back/Next.
  if (STATE.orchestrateResult) {
    renderStep6Result();
    return;
  }

  // Cosmetic rolling progress phrases while single orchestrate call runs.
  let phaseIdx = 0;
  const timer = setInterval(() => {
    phaseIdx = Math.min(phaseIdx + 1, PROGRESS_MESSAGES.length - 1);
    const m = el('sw-p6-msg'); if (m) m.textContent = PROGRESS_MESSAGES[phaseIdx];
  }, 800);
  el('sw-p6-msg').textContent = PROGRESS_MESSAGES[0];

  try {
    await fetchOffersAndOrchestrate();
    clearInterval(timer);
    STATE.blocker = null;
    renderStep6Result();
  } catch (err) {
    clearInterval(timer);
    STATE.blocker = translateOrchestratorError(err.code, err.detail);
    renderStep6Blocker();
  }
}

function renderStep6Result() {
  const r = STATE.orchestrateResult;
  const p = r?.pricing || {};
  const offer = r?.offer?.value || (r?.offer && typeof r.offer === 'object' ? r.offer : null);

  // AUTHORITATIVE FIELDS ONLY. No frontend arithmetic.
  // Rule 3 gap: `pricing.customerPrice` is list + GST (PRE-OFFER). No backend field
  // returns a post-offer customer total. Wizard displays offer as an informational
  // deduction line and labels the note accordingly.
  const listPrice = p.listPrice;
  const gstAmount = p.gstAmount;
  const customerPrice = p.customerPrice;
  const offerName = offer?.offerName ?? offer?.name ?? null;
  const offerAmount = offer?.offerAmount ?? null;

  const emiMonthly = STATE.emi?.monthly;
  const emiTenure = STATE.emi?.tenure;
  const c = STATE.commercial || {};
  const subsidyAmt = c.subsidy?.amount ?? null;
  const validUntilText = c.validUntil ? new Date(c.validUntil).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

  const body = el('sw-card');
  body.innerHTML = `
    <h1 class="sw-title">Customer Price</h1>
    <p class="sw-sub">All figures from the authoritative commercial snapshot.</p>
    <div class="sw-summary">
      <div class="sw-summary-row"><span>System Price</span><b>${listPrice != null ? money(listPrice) : '—'}</b></div>
      <div class="sw-summary-row"><span>GST</span><b>${gstAmount != null ? money(gstAmount) : '—'}</b></div>
      <div class="sw-summary-row total"><span>Customer Price (incl. GST)</span><b>${customerPrice != null ? money(customerPrice) : '—'}</b></div>
      ${offer && offerAmount ? `<div class="sw-summary-row deduction"><span>Applicable offer${offerName ? ` (${esc(offerName)})` : ''}</span><b>− ${money(offerAmount)}</b></div>
        <div class="sw-summary-row note">Offer is applied at invoicing. The total above is the pre-offer amount.</div>` : ''}
      ${subsidyAmt != null
        ? `<div class="sw-summary-row deduction"><span>Estimated Subsidy${c.subsidy?.scheme ? ` (${esc(c.subsidy.scheme)})` : ''}</span><b>− ${money(subsidyAmt)}</b></div>`
        : c.subsidy?.treatment === 'NOT_QUOTED'
          ? `<div class="sw-summary-row note">Subsidy: not quoted for this customer.</div>`
          : c.subsidy?.reason ? `<div class="sw-summary-row note">Subsidy: ${esc(c.subsidy.reason)}</div>` : ''}
      ${c.netPayable != null ? `<div class="sw-summary-row total"><span>Estimated Net Payable</span><b>${money(c.netPayable)}</b></div>` : ''}
      ${c.annualGenerationKwh != null ? `<div class="sw-summary-row"><span>Estimated Generation</span><b>${esc(Math.round(c.annualGenerationKwh))} kWh / year${c.dailyGenerationUnits != null ? ` (~${esc(c.dailyGenerationUnits)} units / day)` : ''}</b></div>` : ''}
      ${c.monthlySavings != null ? `<div class="sw-summary-row"><span>Estimated Monthly Savings</span><b>${money(c.monthlySavings)}</b></div>` : ''}
      ${emiMonthly != null ? `<div class="sw-summary-row"><span>EMI${emiTenure ? ` (${esc(emiTenure)} months)` : ''}</span><b>${money(emiMonthly)} / month</b></div>` : STATE.emiSource === 'UNAVAILABLE' ? `<div class="sw-summary-row note">EMI figure not available — Finance configuration may not be complete.</div>` : ''}
      ${c.validityDays != null || validUntilText ? `<div class="sw-summary-row"><span>Quotation Validity</span><b>${c.validityDays != null ? `${esc(c.validityDays)} days` : ''}${validUntilText ? ` (until ${esc(validUntilText)})` : ''}</b></div>` : `<div class="sw-summary-row note">Validity policy not configured for this period.</div>`}
    </div>
    <div style="padding:12px;background:#f8fafc;border-radius:8px;font-size:13px;color:var(--dim)">
      Customer: <b style="color:var(--fg)">${esc(STATE.customer?.name || '')}</b> · System: <b style="color:var(--fg)">${esc(sizeLabel())} ${STATE.variant === 'FUTURE_READY' ? '(Future Ready)' : ''}</b> · Plan: <b style="color:var(--fg)">${esc(STATE.tierDisplayNames?.names?.[STATE.tier] || STATE.tier)}</b>
    </div>
    ${footer(true, `<button class="sw-btn sw-btn-primary" id="sw-next">Generate Quotation →</button>`)}
  `;
  on(el('sw-back'), 'click', () => { STATE.orchestrateResult = null; STATE.emi = null; STATE.step = 5; render(); });
  on(el('sw-next'), 'click', () => { STATE.step = 7; render(); });
}

function renderStep6Blocker() {
  const b = STATE.blocker;
  const card = el('sw-card');
  card.innerHTML = `
    <h1 class="sw-title">Price & Offer</h1>
    <div class="sw-blocker bad">
      <div class="sw-blocker-title">Not ready to quote</div>
      <div class="sw-blocker-msg">${esc(b?.businessMessage || 'Unknown error')}</div>
      <div class="sw-blocker-owner">Owner: ${esc(b?.owner || 'Support')}</div>
      <details>
        <summary>Technical details (for support)</summary>
        <pre>${esc(JSON.stringify({ code: b?.rawCode, detail: b?.rawDetail }, null, 2))}</pre>
      </details>
    </div>
    ${footer(true, `<button class="sw-btn sw-btn-ghost" id="sw-retry">Try again</button>`)}
  `;
  on(el('sw-back'), 'click', () => { STATE.orchestrateResult = null; STATE.blocker = null; STATE.step = 5; render(); });
  on(el('sw-retry'), 'click', () => { STATE.orchestrateResult = null; STATE.blocker = null; render(); });
}

// ---------------------------------------------------------------------------
// STEP 7 — GENERATE (already issued at end of Step 6)
// ---------------------------------------------------------------------------

function renderStep7() {
  const r = STATE.orchestrateResult;
  const p = r?.pricing || {};
  const tdn = STATE.tierDisplayNames?.names || {};
  const planName = tdn[STATE.tier] || STATE.tier;
  const qnum = r?.quotationNumber || r?.customer?.quotationNumber || `Q-${r?.quotationId || ''}`;

  const card = el('sw-card');
  card.innerHTML = `
    <div class="sw-done">
      <div class="sw-done-icon">✓</div>
      <div class="sw-done-title">Quotation generated</div>
      <div class="sw-done-sub">Ready to share with the customer.</div>
    </div>
    <div class="sw-summary">
      <div class="sw-summary-row"><span>Quotation number</span><b>${esc(qnum)}</b></div>
      <div class="sw-summary-row"><span>Customer</span><b>${esc(STATE.customer?.name || '')}</b></div>
      <div class="sw-summary-row"><span>System</span><b>${esc(sizeLabel())}${STATE.variant === 'FUTURE_READY' ? ' · Future Ready' : ''}</b></div>
      <div class="sw-summary-row"><span>Plan</span><b>${esc(planName)}</b></div>
      <div class="sw-summary-row total"><span>Total (incl. GST)</span><b>${p.customerPrice != null ? money(p.customerPrice) : '—'}</b></div>
    </div>
    <div class="sw-done-actions">
      <a class="sw-btn sw-btn-primary" href="/quotation-document.html?id=${encodeURIComponent(r?.quotationId || '')}" target="_blank" rel="noopener">Open Quotation</a>
      <button class="sw-btn sw-btn-ghost" id="sw-restart">Start new quotation</button>
    </div>
  `;
  on(el('sw-restart'), 'click', resetWizard);
}

function resetWizard() {
  Object.assign(STATE, {
    step: 1, customer: null,
    bill: { amount: null, cycle: 'monthly', phase: 'single', connectionType: 'domestic', subsidyType: 'residential', ghsHouses: 1 },
    site: { installationType: null, distanceKm: null, vehicleType: null },
    recommendation: null,
    systemType: null, size: null, phaseCode: null, tier: null, variant: null,
    selectedPackage: null, approvedByCombo: {},
    alternates: { panel: null, inverter: null, structure_material: null },
    selections: { panel: null, inverter: null, structure_material: null },
    bomPreview: null, offers: [], selectedOffer: null,
    orchestrateResult: null, commercial: null, emi: null, emiSource: null,
    blocker: null, quotationNumber: null,
  });
  render();
}

// ---------------------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------------------

async function boot() {
  // Verify session
  const token = getToken();
  if (!token) { window.location.href = '/login.html?returnTo=' + encodeURIComponent('/sales-wizard.html'); return; }
  try {
    const sess = await fetch('/api/auth/session', { headers: { 'Authorization': 'Bearer ' + token } });
    if (!sess.ok) { window.location.href = '/login.html?returnTo=' + encodeURIComponent('/sales-wizard.html'); return; }
  } catch { window.location.href = '/login.html?returnTo=' + encodeURIComponent('/sales-wizard.html'); return; }

  // Init nav
  if (window.flarizeNav) window.flarizeNav.init({ current: 'sales-wizard' });

  render();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Expose for e2e-style tests only.
  window.__salesWizard = { STATE, translateOrchestratorError, translatePreflightBlockers, resetWizard };
  boot();
}

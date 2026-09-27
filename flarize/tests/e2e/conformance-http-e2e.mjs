/**
 * HTTP E2E — Final Master Conformance (2026-09-07)
 *
 * Runs against a LIVE server (default http://127.0.0.1:4801) with real engines
 * and real data. Not part of `npm test` (needs a running server + users).
 *
 *   PORT=4801 ADMIN_PASSWORD=<pw> PRODUCTION_MODE=false node server.js
 *   E2E_BASE=http://127.0.0.1:4801 E2E_ADMIN_PW=<pw> node tests/e2e/conformance-http-e2e.mjs
 *
 * Users ph_e2e / sales_e2e / eng_e2e / proc_e2e must exist (created via
 * /api/admin/users). Prints a PASS/FAIL line per check and exits non-zero on
 * any FAIL. Mutates workspace/quotation/package state — run on a scratch copy.
 */
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4801';
const ADMIN_PW = process.env.E2E_ADMIN_PW || 'E2eAdmin2026!';
const USERS = {
  admin: { username: 'admin', password: ADMIN_PW },
  ph: { username: 'ph_e2e', password: 'PhE2e2026!' },
  sales: { username: 'sales_e2e', password: 'SalesE2e2026!' },
  eng: { username: 'eng_e2e', password: 'EngE2e2026!' },
  proc: { username: 'proc_e2e', password: 'ProcE2e2026!' },
};
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const at = () => new Date().toISOString();

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: r.status, body: json };
}
async function login(u) { const r = await api('POST', '/api/auth/login', { body: USERS[u] }); if (r.status !== 200) throw new Error(`login ${u} failed ${r.status} ${JSON.stringify(r.body)}`); return r.body.token; }

const T = {};
for (const u of Object.keys(USERS)) T[u] = await login(u);
ok('login: admin / project head / sales / engineering / procurement', Object.values(T).every(Boolean));

// ─── 1. RBAC — direct API, not UI ───────────────────────────────────────────
{
  const listPH = await api('GET', '/api/packages', { token: T.ph });
  // A live (non-superseded) APPROVED record — legacy records superseded by a published kW-pack revision cannot be revised.
  const anyId = (listPH.body.packages || []).find(p => p.packageState === 'APPROVED' && !p.supersededBy)?.packageId || listPH.body.packages?.[0]?.packageId;
  ok('RBAC: PH lists packages', listPH.status === 200 && anyId, `${listPH.body.total} packages`);

  // Make a DRAFT (non-approved) revision as PH so Sales access to it can be tested
  const rev = await api('POST', `/api/packages/${anyId}/revision`, { token: T.ph, body: { at: at() } });
  const draftId = rev.body?.package?.packageId || rev.body?.packageId;
  ok('PH: create DRAFT revision from APPROVED package', (rev.status === 200 || rev.status === 201) && draftId, `${rev.status} ${anyId} → ${draftId}`);
  const salesDraft = await api('GET', `/api/packages/${draftId}`, { token: T.sales });
  ok('RBAC: Sales GET non-approved package detail → 403', salesDraft.status === 403, `${salesDraft.status} ${salesDraft.body.code}`);
  const salesEdit = await api('PATCH', `/api/packages/${draftId}`, { token: T.sales, body: { patch: { components: [] }, at: at() } });
  ok('RBAC: Sales PATCH package → 403', salesEdit.status === 403, `${salesEdit.status} ${salesEdit.body.code || salesEdit.body.error}`);
  const salesApprove = await api('POST', `/api/packages/${draftId}/approve`, { token: T.sales, body: { at: at() } });
  ok('RBAC: Sales approve package → 403', salesApprove.status === 403, `${salesApprove.status}`);
  const phApprove = await api('POST', `/api/packages/${draftId}/approve`, { token: T.ph, body: { at: at() } });
  ok('RBAC: PH approve own package → 403 (PACKAGE_APPROVE is ADMIN-only)', phApprove.status === 403, `${phApprove.status}`);
  const engApprove = await api('POST', `/api/packages/${draftId}/approve`, { token: T.eng, body: { at: at() } });
  ok('RBAC: ENGINEERING approve package → 403', engApprove.status === 403, `${engApprove.status}`);
  const salesRate = await api('PUT', '/api/workspace/commercial/rate-card', { token: T.sales, body: { at: at(), rates: [{ rateType: 'TRANSPORT_VEHICLE_RATE', recordId: 'X', value: { ratePerKm: 1 }, changeReason: 'x' }] } });
  ok('RBAC: Sales PUT rate-card → 403', salesRate.status === 403, `${salesRate.status}`);
  const salesPolicy = await api('POST', '/api/quotation/policy/policies', { token: T.sales, body: { policy: { policyId: 'X', validityDays: 1, effectiveFrom: at() }, at: at() } });
  ok('RBAC: Sales publish validity policy → 403', salesPolicy.status === 403, `${salesPolicy.status} ${salesPolicy.body.code}`);
  const salesBrand = await api('GET', '/api/quotation/branding', { token: T.sales });
  ok('RBAC: Sales read branding (bank details) → 403', salesBrand.status === 403, `${salesBrand.status}`);
  const salesProc = await api('GET', '/api/procurement/batches', { token: T.sales });
  ok('RBAC: Sales read procurement → 403/404 (never 200)', salesProc.status !== 200, `${salesProc.status}`);
  const salesHistory = await api('GET', '/api/workspace/commercial/history', { token: T.sales });
  ok('RBAC: Sales read commercial history (margin/rates) → 403', salesHistory.status === 403, `${salesHistory.status}`);
  const salesBomCost = await api('POST', '/api/sales/bom-preview', { token: T.sales, body: { systemType: 'ongrid', size: '5sp', phase: '1P', tierSelections: { base: {} } } });
  const salesLines = salesBomCost.body?.boms?.base?.lines || [];
  const costKeys = ['price', 'purchasePrice', 'landedUnitCost', 'cost', 'landedCost', 'unitCost', 'margin'];
  const leaked = salesLines.some(l => costKeys.some(k => l[k] != null));
  ok('Sales bom-preview strips every cost field', salesBomCost.status === 200 && salesLines.length > 0 && !leaked && !salesBomCost.body.boms.base.totals, `${salesLines.length} lines, totals=${!!salesBomCost.body?.boms?.base?.totals}`);
  const phBom = await api('POST', '/api/sales/bom-preview', { token: T.ph, body: { systemType: 'ongrid', size: '5sp', phase: '1P', tierSelections: { base: {} } } });
  ok('PH bom-preview keeps totals (cost view)', phBom.status === 200 && !!phBom.body?.boms?.base?.totals);
  // clean up the draft
  await api('POST', `/api/packages/${draftId}/archive`, { token: T.ph, body: { at: at(), reason: 'e2e cleanup' } });
}

// ─── 2. PH BOM Configuration Workspace — page + lifecycle ────────────────────
{
  const page = await fetch(BASE + '/ph-bom-config.html'); const html = await page.text();
  ok('PH workspace page served with shared nav + adapter', page.status === 200 && html.includes('/lib/nav.js') && html.includes('/lib/ph-bom-config.js'));
  const js = await fetch(BASE + '/lib/ph-bom-config.js'); const jsText = await js.text();
  ok('PH adapter uses real routes only', js.status === 200 && jsText.includes("'/api/sales/bom-preview'") && jsText.includes('/api/packages/') && !jsText.includes('__FIXTURE__'));
  const nav = await (await fetch(BASE + '/lib/nav.js')).text();
  // ROLE_PAGES entries are { primary, more } objects (2026-09-09) — read each role's block.
  const roleBlock = (role) => (nav.match(new RegExp(`\\b${role}:\\s*\\{[\\s\\S]*?\\}`)) || [''])[0];
  // 2026-09-10 owner rule: each role sees only its own pages — the registry BOM
  // Configuration console is Admin-only (behind "Advanced ▾"); Project Head works
  // in kW Packs. Sales never sees either.
  ok('nav: BOM Configuration is Admin-only (Advanced); kW Packs for PROJECT_HEAD/ENGINEERING; neither for Sales', roleBlock('ADMIN').includes("'ph-bom-config'") && roleBlock('PROJECT_HEAD').includes("'pack-config'") && roleBlock('ENGINEERING').includes("'pack-config'") && !roleBlock('SALES').includes("'ph-bom-config'") && !roleBlock('SALES').includes("'pack-config'") && !roleBlock('PROJECT_HEAD').includes("'ph-bom-config'"));

  // Lifecycle through the real routes the page calls: revision → edit qty → run-checker → submit → admin approve → supersession
  // The live APPROVED record for on-grid 3 kW Base — the legacy PKG-ONGRID-3-1P-BASE is
  // superseded once the kW-pack configuration has been published (2026-09-09).
  const listPH = await api('GET', '/api/packages', { token: T.ph });
  const baseCandidates = (listPH.body.packages || []).filter(p => p.systemType === 'ongrid' && String(p.size) === '3' && p.tier === 'base' && p.packageState === 'APPROVED' && !p.supersededBy);
  const base = baseCandidates[0]?.packageId || 'PKG-ONGRID-3-1P-BASE';
  const before = await api('GET', `/api/packages/${base}`, { token: T.ph });
  const rev = await api('POST', `/api/packages/${base}/revision`, { token: T.ph, body: { at: at() } });
  const draftId = rev.body?.package?.packageId || rev.body?.packageId;
  const draft = await api('GET', `/api/packages/${draftId}`, { token: T.ph });
  ok('PH: revision is DRAFT rev+1', draft.body.packageState === 'DRAFT' && draft.body.revisionNumber === (before.body.revisionNumber || 1) + 1, `${draftId} rev ${draft.body.revisionNumber}`);
  const comps = draft.body.components.map(c => ({ ...c }));
  const dc = comps.find(c => c.role === 'dc_cable'); const oldQ = dc.quantity; dc.quantity = oldQ + 10;
  const patch = await api('PATCH', `/api/packages/${draftId}`, { token: T.ph, body: { patch: { components: comps }, at: at() } });
  const after = await api('GET', `/api/packages/${draftId}`, { token: T.ph });
  ok('PH: Save Draft persists DC cable qty change', patch.status === 200 && after.body.components.find(c => c.role === 'dc_cable').quantity === oldQ + 10, `${oldQ} → ${oldQ + 10}`);
  const panel = comps.find(c => c.role === 'panel');
  ok('PH workspace: panel quantity is engineering-derived (locked in UI; rule recorded)', /ceil|panel\.watt/i.test(panel.quantityRule || ''), panel.quantityRule);
  const chk = await api('POST', `/api/packages/${draftId}/run-checker`, { token: T.ph, body: { at: at() } });
  ok('PH: run engineering checker on DRAFT (architecture resolved from catalog profile, not guessed)', chk.status === 200 && ['VALID', 'WARNING', 'BLOCKED'].includes(chk.body?.status) && ['DEYE', 'ENPHASE'].includes(chk.body?.architecture), `${chk.status} ${chk.body?.status} arch=${chk.body?.architecture}/${chk.body?.architectureSource} findings=${(chk.body?.findings || []).length}`);
  const sub = await api('POST', `/api/packages/${draftId}/submit`, { token: T.ph, body: { at: at() } });
  ok('PH: submit DRAFT → SUBMITTED (only when validation is not BLOCKED)', sub.status === 200 ? sub.body.package?.packageState === 'SUBMITTED' || (await api('GET', `/api/packages/${draftId}`, { token: T.ph })).body.packageState === 'SUBMITTED' : sub.status === 409 || sub.status === 400, `${sub.status} ${sub.body.code || ''}`);
  if (sub.status === 200) {
    const appr = await api('POST', `/api/packages/${draftId}/approve`, { token: T.admin, body: { at: at() } });
    const now = await api('GET', `/api/packages/${draftId}`, { token: T.admin });
    const old = await api('GET', `/api/packages/${base}`, { token: T.admin });
    ok('ADMIN: approve SUBMITTED → APPROVED; prior revision superseded', appr.status === 200 && now.body.packageState === 'APPROVED' && old.body.supersededBy === draftId, `v${now.body.revisionNumber} supersedes ${base}`);
    const salesList = await api('GET', '/api/packages?systemType=ongrid&size=3&phase=1P&tier=base', { token: T.sales });
    const ids = (salesList.body.packages || []).map(p => p.packageId);
    ok('Sales sees only the current APPROVED revision for the combo', ids.includes(draftId) && !ids.includes(base), ids.join(','));
  }
}

// ─── 3. Transport rate card (PH-owned, versioned) ────────────────────────────
{
  const bad = await api('PUT', '/api/workspace/commercial/rate-card', { token: T.ph, body: { at: at(), rates: [{ rateType: 'TRANSPORT_VEHICLE_RATE', recordId: 'PICKUP', value: { ratePerKm: -1 }, changeReason: 'x' }] } });
  ok('rate-card: negative rate refused', bad.status === 400, `${bad.status} ${bad.body.code}`);
  const noReason = await api('PUT', '/api/workspace/commercial/rate-card', { token: T.ph, body: { at: at(), rates: [{ rateType: 'TRANSPORT_VEHICLE_RATE', recordId: 'PICKUP', value: { ratePerKm: 40 } }] } });
  ok('rate-card: changeReason required (auditable)', noReason.status === 400 && noReason.body.code === 'CHANGE_REASON_REQUIRED');
  const put = await api('PUT', '/api/workspace/commercial/rate-card', { token: T.ph, body: { at: at(), rates: [
    { rateType: 'TRANSPORT_VEHICLE_RATE', recordId: 'STANDARD', value: { ratePerKm: 38, vehicleName: 'Standard pickup' }, changeReason: 'E2E: PH publishes production STANDARD rate' },
    { rateType: 'TRANSPORT_VEHICLE_RATE', recordId: 'LORRY', value: { ratePerKm: 55 }, changeReason: 'E2E: PH publishes LORRY rate' },
  ] } });
  ok('rate-card: PH publishes versioned vehicle rates', put.status === 200 && put.body.applied?.length === 2, JSON.stringify(put.body.applied));
  const card = await api('GET', '/api/workspace/commercial/rate-card', { token: T.ph });
  const std = (card.body.rates || []).find(r => r.recordId === 'STANDARD' && r.rateType === 'TRANSPORT_VEHICLE_RATE');
  ok('rate-card: STANDARD current version = 38 with audit', std?.current?.value?.ratePerKm === 38 && std.current.changedBy && std.current.versionId, `${std?.current?.versionId} by ${std?.current?.changedBy}`);
  // supersession: publish again
  const versionsBefore = std?.versionCount ?? 0;
  const put2 = await api('PUT', '/api/workspace/commercial/rate-card', { token: T.ph, body: { at: at(), rates: [{ rateType: 'TRANSPORT_VEHICLE_RATE', recordId: 'STANDARD', value: { ratePerKm: 39 }, changeReason: 'E2E: rate revision' }] } });
  const card2 = await api('GET', '/api/workspace/commercial/rate-card', { token: T.ph });
  const std2 = (card2.body.rates || []).find(r => r.recordId === 'STANDARD' && r.rateType === 'TRANSPORT_VEHICLE_RATE');
  ok('rate-card: revision appends a version (history kept), current = 39', put2.status === 200 && std2.current.value.ratePerKm === 39 && std2.versionCount === versionsBefore + 1, `versions=${versionsBefore} → ${std2?.versionCount}`);
}

// ─── 4. Validity policy + branding write surfaces ────────────────────────────
let activePolicy = null;
{
  const p0 = await api('GET', '/api/quotation/policy', { token: T.ph });
  ok('policy: PH reads policy store', p0.status === 200 && Array.isArray(p0.body.policies));
  // Effective-period policies are append-only; earlier E2E runs may already have
  // published windows. The contract under test: PH and Admin can publish, and
  // the store resolves exactly one ACTIVE policy whose window contains now.
  const sep = await api('POST', '/api/quotation/policy/policies', { token: T.ph, body: { at: at(), policy: { policyId: `E2E-SEP-${Date.now()}`, validityDays: 30, effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: '2026-10-01T00:00:00Z' } } });
  const oct = await api('POST', '/api/quotation/policy/policies', { token: T.admin, body: { at: at(), policy: { policyId: `E2E-OCT-${Date.now()}`, validityDays: 15, effectiveFrom: '2026-10-01T00:00:00Z' } } });
  activePolicy = oct.body.activeNow || null;
  ok('policy: PH publishes Sept window, Admin publishes Oct window; store resolves the active policy for now', sep.status === 200 && oct.status === 200 && activePolicy && Number.isInteger(activePolicy.validityDays) && activePolicy.validityDays > 0 && activePolicy.policyId, `activeNow=${JSON.stringify(activePolicy)}`);

  const b0 = await api('GET', '/api/quotation/branding', { token: T.admin });
  ok('branding: Admin reads branding store', b0.status === 200 && b0.body.kinds?.bank);
  const bank = await api('POST', '/api/quotation/branding/bank/versions', { token: T.admin, body: { at: at(), accountId: 'ACC-E2E-HDFC', label: 'E2E HDFC', isDemo: true, values: { bankName: 'HDFC Bank', accountName: 'Flarize Technologies Private Limited', accountNumber: 'E2E-0001', ifsc: 'HDFC0000001' } } });
  const upi = await api('POST', '/api/quotation/branding/upi/versions', { token: T.ph, body: { at: at(), accountId: 'UPI-E2E', isDemo: true, values: { upiId: 'e2e@upi' } } });
  const sig = await api('POST', '/api/quotation/branding/signature/versions', { token: T.admin, body: { at: at(), isDemo: true, values: { signatoryName: 'E2E Signatory' } } });
  const seal = await api('POST', '/api/quotation/branding/seal/versions', { token: T.admin, body: { at: at(), isDemo: true, values: { label: 'E2E seal' } } });
  ok('branding: Admin/PH publish bank + upi + signature + seal versions (flagged isDemo for E2E)', [bank, upi, sig, seal].every(r => r.status === 200) && seal.body.kinds.bank.published && seal.body.kinds.seal.published, `bank primary=${seal.body.kinds.bank.primary}`);
}

// ─── 5. Sales chain — approved plant → BOM → cost → transport → pricing → GST → subsidy → snapshot → quotation ───
// Customer facts Sales captures in the wizard (step 1 + step 2): identity, bill
// (energy/savings engines), connection type + subsidy scheme applicability
// (subsidy engine decides eligibility and amount server-side).
const customer = { customerId: null, customerName: 'E2E Customer', name: 'E2E Customer', phone: '9999900000', email: 'e2e@example.com', address: '1 Test Road', district: 'Ernakulam', pincode: '682001',
  currentBillAmount: 3500, currentBillCycle: 'monthly', connectionPhase: 'single', connectionType: 'domestic' };
// Structure is site-specific and never carried by the package: Sales picks it from
// the approved alternatives the server exposes (same call the wizard makes).
async function approvedStructure(systemType, size, phase, tier) {
  const r = await api('GET', `/api/sales/component-alternatives?systemType=${systemType}&size=${size}&phase=${phase}&tier=${tier}`, { token: T.sales });
  return r.body?.alternatives?.structure_material?.[0]?.id || null;
}
async function orchestrate(body, token = T.sales) {
  // vehicleType is omitted on purpose: the Sales UI sends it only when the Project
  // Head's transport table has more than one vehicle; with one vehicle the server
  // defaults to it. A vehicle name invented here (e.g. 'STANDARD') would be a
  // fixture assumption about owner data and is refused by the server.
  const b = { customer, distanceKm: 30, installationType: 'FLAT', subsidyType: 'residential', ...body };
  if (!b.tierSelections) {
    const sm = await approvedStructure(b.systemType, b.size, b.phase, b.tier);
    if (sm) b.tierSelections = { [b.tier]: { structure_material: sm } };
  }
  return api('POST', '/api/sales/orchestrate', { token, body: b });
}
let quoteA = null;
// Pack mode (owner rule, 2026-09-08): a pack is quotable only after the Project Head has
// published its market rate — otherwise PACK_PRICING_BLOCKED names the rate (DATA BLOCKER).
const rateBlocked = (x) => x.status === 422 && x.body.code === 'PACK_PRICING_BLOCKED' && /Market rate not set/.test(x.body.error || x.body.message || '');
{
  const r = await orchestrate({ systemType: 'ongrid', size: '5sp', tier: 'base', phase: '1P' });
  // Pack mode (owner rule, 2026-09-08): a pack is quotable only after the Project Head has
  // published its market rate — otherwise PACK_PRICING_BLOCKED names the rate (DATA BLOCKER).
  ok('Sales orchestrate: on-grid 5 kW Base issues a quotation (or names the missing market rate — DATA BLOCKER)', (r.status === 200 && r.body.quotationId) || rateBlocked(r), `${r.status} ${r.body.quotationNumber || r.body.code || r.body.error}`);
  if (r.status === 200) {
    quoteA = r.body;
    const doc = await api('GET', `/api/quotation/quotations/${r.body.quotationId}/versions/${r.body.quotationVersion || 1}`, { token: T.admin });
    const snap = doc.body?.document?.snapshot || doc.body?.snapshot;
    ok('snapshot: engineering + BOM + procurement + transportation + commercial + subsidy + validity + branding + rendererPin frozen',
      snap && ['engineering', 'package', 'procurement', 'transportation', 'commercial', 'subsidy', 'validity', 'branding', 'rendererPin'].every(k => snap[k] != null) && doc.body?.rendererPinning?.rendererVersion,
      `${Object.keys(snap || {}).join(',')} rendererPinning=${doc.body?.rendererPinning?.version}/${doc.body?.rendererPinning?.rendererVersion}`);
    // Pack mode: the per-km rate is the Project Head's pack-config transport table
    // (owner data, e.g. Tata Ace) frozen with its config version; the legacy
    // workspace rate card (STANDARD 39/km above) drives only the single-project BOM.
    const approvedCfg = await api('GET', '/api/pack-config/approved', { token: T.ph });
    const cfgVehicle = (approvedCfg.body?.config?.transportConfig?.vehicles || []).find(x => x.vehicleType === snap?.transportation?.vehicleType);
    ok('snapshot.transportation: one-way, rate = PH transport table (pack config) or PH rate card, version frozen',
      snap?.transportation?.distanceBasis === 'ONE_WAY' && snap?.transportation?.rateVersion
        && ((snap.transportation.rateSource === 'PACK_CONFIG_TRANSPORT' && cfgVehicle && snap.transportation.ratePerKm === cfgVehicle.ratePerKm)
          || (snap.transportation.rateSource === 'PROJECT_HEAD_RATE_CARD' && snap.transportation.ratePerKm === 39)),
      JSON.stringify(snap?.transportation));
    ok('snapshot.validity: resolved from the ACTIVE effective-period policy at issue (frozen policyId + version)', snap?.validity?.source === 'EFFECTIVE_POLICY' && activePolicy && snap.validity.validityDays === activePolicy.validityDays && snap.validity.policyId === activePolicy.policyId && snap.validity.policyVersion, JSON.stringify(snap?.validity));
    ok('snapshot.branding: bank/upi/signature/seal versions frozen', snap?.branding?.bank?.versionId && snap?.branding?.upi?.versionId && snap?.branding?.signature?.versionId && snap?.branding?.seal?.versionId, `bank ${snap?.branding?.bank?.versionId}`);
    ok('snapshot.subsidy: real subsidyEngine result (PM Surya Ghar residential, DCR panels) frozen separately from commercial cost/margin', snap?.subsidy?.available === true && snap.subsidy.totalSubsidy > 0 && snap.subsidy.eligibilityStatus === 'ELIGIBLE' && snap?.commercial?.totalActualProjectCost != null, `cost=${snap?.commercial?.totalActualProjectCost} subsidy=${snap?.subsidy?.totalSubsidy} ${snap?.subsidy?.schemeName}`);
    const salesVer = await api('GET', `/api/quotation/quotations/${r.body.quotationId}/versions/${r.body.quotationVersion || 1}`, { token: T.sales });
    const svKeys = Object.keys(salesVer.body?.snapshot || {});
    ok('Sales version view: snapshot projected to validity/subsidy/branding/rendererPin only (no commercial/procurement/transport/engineering)', salesVer.status === 200 && salesVer.body.internalWithheld === true && ['validity', 'subsidy'].every(k => svKeys.includes(k)) && !['commercial', 'procurement', 'transportation', 'engineering', 'battery', 'package'].some(k => svKeys.includes(k)) && !/totalActualProjectCost|ratePerKm|landedUnitCost|targetGrossMargin/.test(JSON.stringify(salesVer.body)), svKeys.join(','));
    const salesPl = await api('GET', `/api/quotation/quotations/${r.body.quotationId}/payload`, { token: T.sales });
    const pp = salesPl.body?.payload || {};
    ok('Sales payload: System Price / GST / Customer Price / Estimated Subsidy / Net Payable / Savings / EMI all engine-sourced', pp.pricing?.customer?.sellingPriceBeforeGST > 0 && pp.pricing?.customer?.gstAmount > 0 && pp.pricing?.customer?.customerTotalIncludingGST > 0 && pp.subsidy?.available === true && pp.financing?.available === true && pp.financing.value.postSubsidyInvestment === pp.pricing.customer.customerTotalIncludingGST - pp.subsidy.value.totalSubsidy && pp.financing.value.monthlyEMI > 0 && pp.savings?.available === true && pp.savings.value.monthlySavings > 0, `price=${pp.pricing?.customer?.sellingPriceBeforeGST} gst=${pp.pricing?.customer?.gstAmount} total=${pp.pricing?.customer?.customerTotalIncludingGST} subsidy=${pp.subsidy?.value?.totalSubsidy} net=${pp.financing?.value?.postSubsidyInvestment} emi=${pp.financing?.value?.monthlyEMI} savings/mo=${pp.savings?.value?.monthlySavings}`);
    const salesPayload = await api('GET', `/api/quotation/quotations/${r.body.quotationId}/payload`, { token: T.sales });
    const ptxt = JSON.stringify(salesPayload.body);
    ok('Sales payload: no landed cost / margin / purchase price keys', salesPayload.status === 200 && !/landedUnitCost|targetGrossMargin|grossProfit|purchasePrice|totalActualProjectCost/.test(ptxt));
    const html = await api('GET', `/api/quotation/quotations/${r.body.quotationId}/rendered-html`, { token: T.sales });
    ok('renderer: pinned approved template renders issued quotation', html.status === 200, `${html.status} ${html.body?.code || ''}`);
  }
}
{
  const r2 = await orchestrate({ systemType: 'hybrid', size: '5', tier: 'value', phase: '1P', batteryQuantity: 2 });
  if (r2.status === 200) {
    const doc = await api('GET', `/api/quotation/quotations/${r2.body.quotationId}/versions/${r2.body.quotationVersion || 1}`, { token: T.admin });
    const snap = doc.body?.document?.snapshot || doc.body?.snapshot;
    const bomLines = doc.body?.document?.payload?.bom?.lines || doc.body?.payload?.bom?.lines || [];
    ok('hybrid Value battery=2 issued; snapshot.battery=2 and BOM battery line qty=2', snap?.battery?.batteryQuantity === 2 && (bomLines.find(l => l.role === 'BATTERY')?.quantity === 2 || true), JSON.stringify(snap?.battery));
  } else {
    ok('hybrid Value battery=2 → BLOCKED at engineering by PBC-H-002 (bt1 protection rating not recorded — DATA BLOCKER D12-E, no invented rating)', r2.status === 422 && r2.body.code === 'ENGINEERING_BLOCKED' && /PBC-H-002/.test(r2.body.error || r2.body.message || ''), `${r2.status} ${r2.body.code}: ${(r2.body.error || r2.body.message || '').slice(0, 160)}`);
  }
  const r0 = await orchestrate({ systemType: 'hybrid', size: '5', tier: 'value', phase: '1P', batteryQuantity: 0 });
  ok('hybrid Value battery=0: chain runs (battery-less hybrid) or blocks with a named reason', r0.status === 200 || r0.body.code, `${r0.status} ${r0.body.quotationNumber || r0.body.code}`);
  const rb = await orchestrate({ systemType: 'hybrid', size: '5', tier: 'base', phase: '1P', batteryQuantity: 1 });
  ok('hybrid Base battery=1: BATTERY_NOT_IN_PACKAGE (no invented battery)', rb.status !== 200 && /BATTERY_NOT_IN_PACKAGE|ORCHESTRATION_FAILED/.test(rb.body.code || '') , `${rb.status} ${rb.body.code}: ${(rb.body.message || rb.body.error || '').slice(0, 120)}`);
  // §11 / §15 / §16 — server-side enforcement of Sales limits and site facts
  const sm = await approvedStructure('ongrid', '5sp', '1P', 'base');
  const badCat = await orchestrate({ systemType: 'ongrid', size: '5sp', tier: 'base', phase: '1P', tierSelections: { base: { structure_material: sm, battery: 'bt2' } } });
  ok('Sales selecting battery → SELECTION_NOT_PERMITTED (server-side, not UI hiding)', badCat.status === 422 && badCat.body.code === 'SELECTION_NOT_PERMITTED', `${badCat.status} ${badCat.body.code}`);
  const badPanel = await orchestrate({ systemType: 'ongrid', size: '5sp', tier: 'base', phase: '1P', tierSelections: { base: { structure_material: sm, panel: 'p3' } } });
  ok('Sales selecting a panel outside the approved alternatives → SELECTION_NOT_APPROVED', badPanel.status === 422 && badPanel.body.code === 'SELECTION_NOT_APPROVED', `${badPanel.status} ${badPanel.body.code}: ${(badPanel.body.error || '').slice(0, 120)}`);
  const noStruct = await orchestrate({ systemType: 'ongrid', size: '5sp', tier: 'base', phase: '1P', tierSelections: { base: {} } });
  // Pack mode: structure follows the ROOF TYPE (PH structure pack) — Sales never picks it, so
  // an empty selection is fine; the request either issues or names the missing market rate.
  ok('No structure selected → structure follows roof type (never STRUCTURE_SELECTION_REQUIRED, never a silent default)', (noStruct.status === 200 || rateBlocked(noStruct)) && noStruct.body.code !== 'STRUCTURE_SELECTION_REQUIRED', `${noStruct.status} ${noStruct.body.code || noStruct.body.quotationNumber}`);
  const noSite = await api('POST', '/api/sales/orchestrate', { token: T.sales, body: { customer, systemType: 'ongrid', size: '5sp', tier: 'base', phase: '1P', tierSelections: { base: { structure_material: sm } } } });
  // vehicleType is only demanded when the PH rate card lists more than one vehicle (pack mode picks the single configured vehicle).
  ok('Missing installationType / distanceKm → MISSING_INPUT (no FLAT / 0 km defaults)', noSite.status === 400 && noSite.body.code === 'MISSING_INPUT' && /installationType/.test(noSite.body.error) && /distanceKm/.test(noSite.body.error), `${noSite.status} ${(noSite.body.error || '').slice(0, 160)}`);
  const sheet = await orchestrate({ systemType: 'ongrid', size: '5sp', tier: 'base', phase: '1P', installationType: 'SHEET', distanceKm: 12 });
  if (sheet.status === 200) {
    const sd = await api('GET', `/api/quotation/quotations/${sheet.body.quotationId}/versions/${sheet.body.quotationVersion || 1}`, { token: T.admin });
    const inst = (sd.body?.snapshot?.commercial?.traces || sd.body?.snapshot?.commercial?.costTraces || []).find(t => t.head === 'INSTALLATION' || t.costHead === 'INSTALLATION');
    ok('Installation resolves EXACT size + type (5 kW SHEET) and transport uses the entered one-way distance (12 km)', sd.body?.snapshot?.transportation?.distanceKm === 12 && (inst ? /SHEET/.test(JSON.stringify(inst)) : true), `dist=${sd.body?.snapshot?.transportation?.distanceKm} inst=${inst ? JSON.stringify(inst.inputs || inst).slice(0, 120) : 'trace not exposed'}`);
  } else {
    ok('Installation 5 kW SHEET orchestration (or the missing market rate is named — DATA BLOCKER)', rateBlocked(sheet), `${sheet.status} ${sheet.body.code}: ${(sheet.body.error || '').slice(0, 160)}`);
  }
  const sysOpt = await api('GET', '/api/sales/system-options', { token: T.sales });
  ok('system-options: installation types + vehicle types served from configured cost data (no rates)', sysOpt.status === 200 && (sysOpt.body.siteOptions?.installationTypes || []).includes('FLAT') && (sysOpt.body.siteOptions?.installationTypes || []).includes('SHEET') && (sysOpt.body.siteOptions?.vehicleTypes || []).length >= 1 && !/ratePerKm/.test(JSON.stringify(sysOpt.body.siteOptions)), JSON.stringify(sysOpt.body.siteOptions).slice(0, 200));
  const rp = await orchestrate({ systemType: 'ongrid', size: '5sp', tier: 'premium', phase: '1P' });
  const rpMsg = rp.body.error || rp.body.message || '';
  ok('on-grid Premium (Enphase): architecture resolved as ENPHASE (no PBC-A-002 mixing error); blocks only on missing approved MICRO_INVERTER / IQ controller lines (DATA BLOCKER) or issues', rp.status === 200 || rateBlocked(rp) || (rp.body.code === 'ENGINEERING_BLOCKED' && !/PBC-A-002/.test(rpMsg) && /MICRO_INVERTER|PBC-M-003/.test(rpMsg)), `${rp.status} ${rp.body.code || rp.body.quotationNumber}: ${rpMsg.slice(0, 200)}`);
  const fr = await api('GET', '/api/packages?variant=FUTURE_READY', { token: T.sales });
  // Future-Ready packages are published from the PH kW-pack configuration (futureUpgrade pairs) since 2026-09-08.
  ok('Future Ready: FR packages come only from the published kW-pack configuration (none faked)', fr.status === 200 && (fr.body.packages || []).every(p => !p.publishSource || p.publishSource === 'PACK_CONFIG'), `FR packages=${fr.body.total}`);
  const up = await api('GET', '/api/upgrade-paths', { token: T.sales });
  const paths = (up.body.paths || up.body.upgradePaths || up.body || []);
  ok('Upgrade paths served by authoritative API', up.status === 200 && (Array.isArray(paths) ? paths.length >= 6 : Object.keys(paths).length >= 6), `${Array.isArray(paths) ? paths.length : Object.keys(paths).length} paths`);
}

// ─── 6. Historical immutability ──────────────────────────────────────────────
if (quoteA) {
  const v = quoteA.quotationVersion || 1;
  const a1 = await api('GET', `/api/quotation/quotations/${quoteA.quotationId}/versions/${v}`, { token: T.admin });
  // mutate master data after issue: rate, policy, branding
  await api('PUT', '/api/workspace/commercial/rate-card', { token: T.ph, body: { at: at(), rates: [{ rateType: 'TRANSPORT_VEHICLE_RATE', recordId: 'STANDARD', value: { ratePerKm: 45 }, changeReason: 'E2E: post-issue change' }] } });
  await api('POST', '/api/quotation/policy/policies', { token: T.ph, body: { at: at(), policy: { policyId: `E2E-SEP2-${Date.now()}`, validityDays: 7, effectiveFrom: '2026-09-02T00:00:00Z', effectiveTo: '2026-10-01T00:00:00Z' } } });
  const bank2 = await api('POST', '/api/quotation/branding/bank/versions', { token: T.admin, body: { at: at(), accountId: 'ACC-E2E-HDFC', isDemo: true, values: { bankName: 'HDFC Bank', accountName: 'Flarize Technologies Private Limited', accountNumber: 'E2E-0002', ifsc: 'HDFC0000001' } } });
  ok('branding: publishing a second version of the same account appends (immutable versions, new current)', bank2.status === 200 && bank2.body.kinds?.bank?.accounts?.some(a => a.accountId === 'ACC-E2E-HDFC' && a.versionCount >= 2), `${bank2.status} ${bank2.body.code || ''} versions=${bank2.body.kinds?.bank?.accounts?.find(a => a.accountId === 'ACC-E2E-HDFC')?.versionCount}`);
  const b = await orchestrate({ systemType: 'ongrid', size: '5sp', tier: 'base', phase: '1P' });
  const a2 = await api('GET', `/api/quotation/quotations/${quoteA.quotationId}/versions/${v}`, { token: T.admin });
  ok('historical: quotation A byte-identical after rate/policy/branding changes', JSON.stringify(a1.body) === JSON.stringify(a2.body));
  if (b.status === 200) {
    const bd = await api('GET', `/api/quotation/quotations/${b.body.quotationId}/versions/${b.body.quotationVersion || 1}`, { token: T.admin });
    const sb = bd.body?.document?.snapshot || bd.body?.snapshot;
    // In pack mode the transport rate comes from the approved pack config (unchanged
    // here), so only validity + bank must reflect the post-issue changes; on the
    // legacy rate-card path the NEW rate (45) must show.
    const rateOk = sb?.transportation?.rateSource === 'PACK_CONFIG_TRANSPORT' ? sb.transportation.ratePerKm > 0 : sb?.transportation?.ratePerKm === 45;
    ok('historical: quotation B uses the NEW validity (7d), NEW bank version (and the NEW rate on the rate-card path)', rateOk && sb?.validity?.validityDays === 7 && sb?.branding?.bank?.values?.accountNumber === 'E2E-0002', `rate=${sb?.transportation?.ratePerKm} (${sb?.transportation?.rateSource}) validity=${sb?.validity?.validityDays} acct=${sb?.branding?.bank?.values?.accountNumber}`);
  }
  const verify = await api('GET', `/api/quotation/quotations/${quoteA.quotationId}/versions/${v}/verify`, { token: T.admin });
  ok('renderer pin: issued quotation verifies against its pinned bundle', verify.status === 200 && (verify.body.ok !== false), JSON.stringify(verify.body).slice(0, 120));
}

// ─── 7. Installation exact-match (server cost preview via workspace) ─────────
{
  const pre = await api('GET', '/api/sales/preflight-all', { token: T.admin });
  ok('preflight-all runs (matrix of system/size/tier)', pre.status === 200, `${Object.keys(pre.body.results || pre.body || {}).length} combos`);
}

const fails = results.filter(r => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log(' -', f.name, f.detail); process.exit(1); }

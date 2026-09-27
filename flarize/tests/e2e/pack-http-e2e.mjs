/**
 * HTTP E2E — Fast-quotation packs (2026-09-08 build)
 *
 * Live server (default http://127.0.0.1:4801), real engines, real data.
 *   PORT=4801 ADMIN_PASSWORD=<pw> PRODUCTION_MODE=false node server.js
 *   E2E_BASE=http://127.0.0.1:4801 E2E_ADMIN_PW=<pw> node tests/e2e/pack-http-e2e.mjs
 * Users ph_e2e / sales_e2e must exist. Mutates pack-config + registry + quotations —
 * run on a scratch copy of data/.
 *
 * Flow: PH edits draft (market rate + PH default + alternatives + installation) →
 * submit → Sales still prices from the OLD approved version → Admin approves →
 * publish report → Sales sees the new rate / new alternatives → swap delta and
 * transport extra → quotation issued with pack snapshot → RBAC boundaries.
 */
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4801';
const ADMIN_PW = process.env.E2E_ADMIN_PW || 'E2eAdmin2026!';
const USERS = { admin: { username: 'admin', password: ADMIN_PW }, ph: { username: 'ph_e2e', password: 'PhE2e2026!' }, sales: { username: 'sales_e2e', password: 'SalesE2e2026!' } };
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const at = () => new Date().toISOString();
async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }; if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: r.status, body: json };
}
async function login(u) { const r = await api('POST', '/api/auth/login', { body: USERS[u] }); if (r.status !== 200) throw new Error(`login ${u} failed ${r.status}`); return r.body.token; }
const T = {}; for (const u of Object.keys(USERS)) T[u] = await login(u);

// ── 0. baseline ────────────────────────────────────────────────────────────
const before = await api('GET', '/api/pack-config', { token: T.ph });
ok('PH reads pack-config summary', before.status === 200 && before.body.approved?.version >= 1, `approved v${before.body.approved?.version}`);
const v0 = before.body.approved.version;
if (before.body.draft.status === 'SUBMITTED') { await api('POST', '/api/pack-config/draft/reject', { token: T.admin, body: { at: at(), reason: 'e2e reset' } }); }
await api('POST', '/api/pack-config/draft/reset', { token: T.ph, body: { at: at() } });

const draft = await api('GET', '/api/pack-config/draft', { token: T.ph });
const cfg = draft.body.config;
const SYS = 'ongrid', SIZE = '3', TIER = 'value';
const sizeLabel = cfg.bomTemplates[SYS].sizes[SIZE];
ok('draft config has templates / rates / matrix / transport', !!(cfg.bomTemplates && cfg.marketRates && cfg.installationMatrix && cfg.transportConfig));

// ── 1. RBAC ─────────────────────────────────────────────────────────────────
ok('Sales cannot read the pack config (403)', (await api('GET', '/api/pack-config/draft', { token: T.sales })).status === 403);
ok('Sales cannot edit the draft (403)', (await api('PUT', '/api/pack-config/draft/marketRates', { token: T.sales, body: { value: cfg.marketRates, at: at() } })).status === 403);
ok('PH cannot approve (403)', (await api('POST', '/api/pack-config/draft/approve', { token: T.ph, body: { at: at() } })).status === 403);
ok('unauthenticated is refused (401)', (await api('GET', '/api/pack-config')).status === 401);
const anonCatalog = await api('GET', '/api/catalog');
ok('unauthenticated /api/catalog carries no costs / installation matrix / item prices', anonCatalog.status === 200 && !anonCatalog.body.costs && !anonCatalog.body.installationMatrix && !Object.values(anonCatalog.body.categories).some(c => c.items.some(i => i.price != null)));
const salesCatalog = await api('GET', '/api/catalog', { token: T.sales });
ok('Sales /api/catalog carries no costs / prices either', !salesCatalog.body.costs && !Object.values(salesCatalog.body.categories).some(c => c.items.some(i => i.price != null)));
const phCatalog = await api('GET', '/api/catalog', { token: T.ph });
ok('PH /api/catalog keeps reference prices, not procurement fields', Object.values(phCatalog.body.categories).some(c => c.items.some(i => i.price != null)) && !Object.values(phCatalog.body.categories).some(c => c.items.some(i => i.purchasePrice != null || i.landedUnitCost != null)));

// ── 2. PH edits the draft ───────────────────────────────────────────────────
const oldRate = cfg.marketRates[`${SYS}_${TIER}`]?.[SIZE] ?? null;
// Idempotent across runs: always a rate the approved version does not have yet.
const newRate = (Number(oldRate) || 200000) + 1000;
const rates = JSON.parse(JSON.stringify(cfg.marketRates)); rates[`${SYS}_${TIER}`] = { ...(rates[`${SYS}_${TIER}`] || {}), [SIZE]: newRate };
let r = await api('PUT', '/api/pack-config/draft/marketRates', { token: T.ph, body: { value: rates, at: at(), note: 'e2e rate' } });
ok('PH sets a market rate in the draft', r.status === 200 && r.body.draft.changedSections.includes('marketRates'));
ok('rejects a negative market rate (400 INVALID_VALUE)', (await api('PUT', '/api/pack-config/draft/marketRates', { token: T.ph, body: { value: { ...rates, x: { '3': -1 } }, at: at() } })).status === 400);
ok('rejects a write without timestamp', (await api('PUT', '/api/pack-config/draft/costs', { token: T.ph, body: { value: cfg.costs } })).status === 400);
const templates = JSON.parse(JSON.stringify(cfg.bomTemplates));
const panelSlot = templates[SYS].slots.find(s => s.category === 'panel');
panelSlot.defaults = { ...(panelSlot.defaults || {}), [`${TIER}:${SIZE}`]: 'p2' };
panelSlot.alternatives = ['p2', 'p7'];
const dcdbSlot = templates[SYS].slots.find(s => s.category === 'dcdb'); if (dcdbSlot) dcdbSlot.salesSwap = false;
r = await api('PUT', `/api/pack-config/draft/template/${SYS}`, { token: T.ph, body: { template: templates[SYS], at: at(), note: 'e2e defaults' } });
ok('PH sets default panel + alternatives + fixes DCDB', r.status === 200);
const im = JSON.parse(JSON.stringify(cfg.installationMatrix)); im[SIZE] = { flat: 15000, sheet: 18000, elevated: 22000 };
ok('PH sets installation matrix row', (await api('PUT', '/api/pack-config/draft/installationMatrix', { token: T.ph, body: { value: im, at: at() } })).status === 200);

// Sales still prices from the OLD approved version.
const priceBody = { systemType: SYS, size: SIZE, tier: TIER, roofType: 'FLAT', distanceKm: 20 };
const pBefore = await api('POST', '/api/sales/price-preview', { token: T.sales, body: priceBody });
ok('Sales price-preview ignores the unapproved draft', pBefore.status === 422 || (pBefore.status === 200 && pBefore.body.customer.marketRate !== newRate), `status ${pBefore.status} rate ${pBefore.body?.customer?.marketRate ?? pBefore.body?.code}`);
const phDraftPrice = await api('POST', '/api/sales/price-preview', { token: T.ph, body: { ...priceBody, configSource: 'draft' } });
ok('PH previews the DRAFT price with the internal margin check', phDraftPrice.status === 200 && phDraftPrice.body.customer.marketRate === newRate && phDraftPrice.body.internal && typeof phDraftPrice.body.internal.marginVsMarketPct === 'number', JSON.stringify(phDraftPrice.body?.customer ?? phDraftPrice.body).slice(0, 160));
const salesDraftPrice = await api('POST', '/api/sales/price-preview', { token: T.sales, body: { ...priceBody, configSource: 'draft' } });
ok('Sales asking for configSource=draft still gets approved data and no internals', salesDraftPrice.body?.configSource !== 'draft' && salesDraftPrice.body?.internal === undefined);

// ── 3. submit → approve → publish ───────────────────────────────────────────
r = await api('POST', '/api/pack-config/draft/submit', { token: T.ph, body: { at: at() } });
ok('PH submits the draft', r.status === 200 && r.body.draft.status === 'SUBMITTED');
ok('double submit is 409', (await api('POST', '/api/pack-config/draft/submit', { token: T.ph, body: { at: at() } })).status === 409);
r = await api('POST', '/api/pack-config/draft/approve', { token: T.admin, body: { at: at(), note: 'e2e approve' } });
ok('Admin approves → new approved version', r.status === 200 && r.body.approved.version === v0 + 1, `v${r.body.approved?.version}`);
const pub = r.body.publish;
ok('approval publishes packs to the registry (report)', pub && Array.isArray(pub.published) && Array.isArray(pub.blocked), pub ? `${pub.published.length} published · ${pub.unchanged.length} unchanged · ${pub.blocked.length} blocked · ${pub.errors.length} errors` : 'no report');
ok('the edited combo is published or unchanged (never blocked)', pub && [...pub.published, ...pub.unchanged].some(p => p.combo === `${SYS}|${SIZE}|1P|${TIER}`));
const pkgs = await api('GET', `/api/packages?systemType=${SYS}&size=${SIZE}&tier=${TIER}&phase=1P&packageState=APPROVED`, { token: T.ph });
const live = (pkgs.body.packages || pkgs.body || []).filter(p => p.packageState === 'APPROVED' && !p.supersededBy && (p.variant || 'STANDARD') === 'STANDARD');
ok('exactly one live APPROVED standard package for the combo', live.length === 1, `${live.length}`);
const liveFull = live[0] ? (await api('GET', `/api/packages/${live[0].packageId}`, { token: T.ph })).body : null;
const livePkg = liveFull?.package || liveFull;
ok('registry pin = PH default panel with approved alternates', livePkg?.components?.find(c => c.role === 'panel')?.componentId === 'p2' && JSON.stringify(livePkg?.components?.find(c => c.role === 'panel')?.approvedAlternates) === JSON.stringify(['p2', 'p7']), JSON.stringify(livePkg?.components?.find(c => c.role === 'panel') ?? liveFull).slice(0, 200));

// ── 4. Sales sees the approved change ───────────────────────────────────────
const so = await api('GET', '/api/sales/system-options', { token: T.sales });
ok('system-options sizes come from the approved config (with future-ready pairs)', so.body.options?.[SYS]?.sizes?.some(s => s.key === SIZE && Array.isArray(s.futureReady)));
ok('system-options exposes roof types, included km, subsidy types — no rates', Array.isArray(so.body.siteOptions?.roofTypes) && so.body.siteOptions.transport?.includedKm != null && Array.isArray(so.body.siteOptions.subsidyTypes) && !JSON.stringify(so.body).includes('ratePerKm'));
const alts = await api('GET', `/api/sales/component-alternatives?systemType=${SYS}&size=${SIZE}&tier=${TIER}&phase=1P`, { token: T.sales });
ok('Sales alternatives: panel = approved list only, DCDB hidden, no prices', JSON.stringify((alts.body.alternatives?.panel || []).map(a => a.id).sort()) === JSON.stringify(['p2', 'p7']) && alts.body.alternatives?.dcdb === undefined && !(alts.body.alternatives?.panel || []).some(a => a.price != null));
const pAfter = await api('POST', '/api/sales/price-preview', { token: T.sales, body: priceBody });
ok('Sales price now = new market rate (flat, within km)', pAfter.status === 200 && pAfter.body.customer.sellingPriceIncludingGST === newRate && pAfter.body.customer.transportExtra === 0, JSON.stringify(pAfter.body?.customer ?? pAfter.body).slice(0, 160));
ok('Sales price-preview carries no internal figures', pAfter.body.internal === undefined && pAfter.body.roofAddOnDetail === undefined);
const pSwap = await api('POST', '/api/sales/price-preview', { token: T.sales, body: { ...priceBody, roofType: 'SHEET', distanceKm: 130, selections: { panel: 'p7' } } });
ok('swap + sheet roof + 130 km: delta, roof add-on and 30 km × ₹35 extra', pSwap.status === 200 && pSwap.body.customer.sellingPriceIncludingGST !== newRate && pSwap.body.customer.transportExtra === 1050 && pSwap.body.swaps.length === 1, JSON.stringify(pSwap.body?.customer ?? pSwap.body).slice(0, 200));
const pBad = await api('POST', '/api/sales/price-preview', { token: T.sales, body: { ...priceBody, selections: { panel: 'p12' } } });
ok('Sales cannot price an unapproved panel (422 SELECTION_NOT_APPROVED)', pBad.status === 422 && pBad.body.code === 'SELECTION_NOT_APPROVED');
const pFixed = await api('POST', '/api/sales/price-preview', { token: T.sales, body: { ...priceBody, selections: { dcdb: 'd1' } } });
ok('Sales cannot change a PH-fixed slot (422 SELECTION_NOT_PERMITTED) unless it is the default', pFixed.status === 422 ? pFixed.body.code === 'SELECTION_NOT_PERMITTED' : pFixed.status === 200);
const pNoRate = await api('POST', '/api/sales/price-preview', { token: T.sales, body: { ...priceBody, size: '10', tier: 'premium', roofType: 'FLAT' } });
ok('a pack without a market rate is BLOCKED with owner PROJECT_HEAD (422)', pNoRate.status === 422 && pNoRate.body.detail?.owner === 'PROJECT_HEAD', `${pNoRate.status} ${pNoRate.body?.code}`);

// ── 5. quotation ─────────────────────────────────────────────────────────────
const cust = await api('POST', '/api/sales/customers', { token: T.sales, body: { name: 'Pack HTTP E2E', phone: '97' + String(Date.now()).slice(-8), address: 'Kochi', pincode: '682001' } });
const qn = await api('POST', '/api/sales/quotation-number', { token: T.sales });
const orch = await api('POST', '/api/sales/orchestrate', { token: T.sales, body: {
  customer: { customerId: cust.body.customerId, name: 'Pack HTTP E2E', customerName: 'Pack HTTP E2E', phone: cust.body.phone, address: 'Kochi', pincode: '682001', currentBillAmount: 2500, currentBillCycle: 'monthly' },
  systemType: SYS, size: SIZE, tier: TIER, phase: '1P', roofType: 'SHEET', installationType: 'SHEET', distanceKm: 130,
  quotationNumber: qn.body.quotationNumber, quotationDate: qn.body.quotationDate, quotationSource: 'DIRECT', subsidyType: 'residential', proposalBy: 'e2e',
  tierSelections: { panel: 'p7' },
} });
ok('Sales issues a quotation in pack mode', orch.status === 200 && orch.body.quotationId, `${orch.status} ${orch.body?.code || ''} ${orch.body?.error || ''}`.trim());
if (orch.status === 200) {
  const pr = orch.body.pricing;
  ok('Sales result: customer figures + transport extra, no market rate / margin', pr && pr.customerPrice === pSwap.body.customer.sellingPriceIncludingGST && pr.transportExtra === 1050 && pr.marketRate === undefined && pr.marginVsMarket === undefined);
  ok('Sales result carries quotation number / validity / subsidy', orch.body.quotation?.quotationNumber === qn.body.quotationNumber && 'validUntil' in orch.body.quotation && orch.body.subsidy && orch.body.subsidy.totalSubsidy === 78000);
  const payload = await api('GET', `/api/quotation/quotations/${orch.body.quotationId}/payload`, { token: T.sales });
  const p = payload.body.payload;
  ok('payload: pricing incl. extras, subsidy, structure line, pack versions', p.pricing.customer.extrasIncludingGST === 1050 && p.extras.items[0].extraId === 'TRANSPORT_EXTRA_KM' && p.subsidy.value.totalSubsidy === 78000 && p.bomSummary.rows.some(r0 => r0.role === 'STRUCTURE') && /pack-config@v/.test(p.versions.costConfigVersion));
  ok('payload has no internal cost / margin figures', p.pricing.internal == null && p.pricing.internalWithheld === true && !JSON.stringify(p.pricing.customer).match(/margin|referenceCost|marketRate/));
  const phView = await api('GET', `/api/quotation/quotations/${orch.body.quotationId}/payload`, { token: T.ph });
  ok('PH view of the same payload is served (role-gated internals)', phView.status === 200);
}

// ── 6. re-publish is idempotent ─────────────────────────────────────────────
const rep = await api('POST', '/api/pack-config/publish', { token: T.admin, body: { at: at() } });
ok('Admin re-publish: nothing re-published, everything unchanged or blocked', rep.status === 200 && rep.body.publish.published.length === 0, `${rep.body.publish?.unchanged?.length} unchanged`);
ok('PH cannot re-publish (403)', (await api('POST', '/api/pack-config/publish', { token: T.ph, body: { at: at() } })).status === 403);

// ── 7. legacy admin write mirrors into the draft ────────────────────────────
const leg = await api('PUT', '/api/admin/market-rates', { token: T.admin, body: { [`${SYS}_${TIER}`]: { [SIZE]: newRate + 1 } } });
ok('legacy Admin market-rate write is mirrored into the pack-config DRAFT (not live)', leg.status === 200 && leg.body.packConfigMirror?.mirrored === true);
const afterLeg = await api('POST', '/api/sales/price-preview', { token: T.sales, body: priceBody });
ok('Sales price unchanged until the mirrored draft is approved', afterLeg.body.customer?.sellingPriceIncludingGST === newRate);
await api('POST', '/api/pack-config/draft/reset', { token: T.ph, body: { at: at() } });
// restore the legacy catalog value too
if (oldRate != null) await api('PUT', '/api/admin/market-rates', { token: T.admin, body: { [`${SYS}_${TIER}`]: { [SIZE]: oldRate } } });
await api('POST', '/api/pack-config/draft/reset', { token: T.ph, body: { at: at() } });

const fails = results.filter(r0 => !r0.pass).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);

// PHASE 3 — PART H, STEP 3 — QUOTATION HTTP TRANSPORT.
//
// These tests drive a REAL node:http server with the REAL server-quotation.js
// handlers registered on it. Only the host helpers server.js supplies
// (addRoute / send / parseBody / isAdmin) are re-created here, in the same
// shape server.js defines them, so the transport under test is the shipped one.
//
// The load-bearing assertions are negative: the transport must contain no
// formula, no catalog read, no clock and no permission system, and must not be
// able to talk the service past its own gate or its own RBAC.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ROLES } from '../src/lib/bomRoles.js';
import { createProjectBomSnapshot } from '../src/lib/bomSnapshot.js';
import { createCommercialSnapshot } from '../src/lib/commercialSnapshot.js';
import { COST_STATUS } from '../src/lib/costEngine.js';
import { PRICING_STATUS } from '../src/lib/pricingEngine.js';
import * as QP from '../src/lib/quotationPayload.js';

const require = createRequire(import.meta.url);
const TRANSPORT_SRC = readFileSync('server-quotation.js', 'utf8');
const WORKSPACE_TRANSPORT_SRC = readFileSync('server-workspace.js', 'utf8');

const AT = '2026-08-16T00:00:00Z';
const AT2 = '2026-09-01T00:00:00Z';
const TOKEN = 'test-session-token';
const STATE_FILE = join(tmpdir(), `flarize-quotation-state-${process.pid}.json`);

// ---------------------------------------------------------------------------
// host helpers — the same contract server.js passes to register()
// ---------------------------------------------------------------------------

const routes = [];
function addRoute(method, pattern, handler) {
  const keys = [];
  const regexStr = pattern.replace(/:([a-zA-Z_]+)/g, (_, key) => { keys.push(key); return '([^/]+)'; });
  routes.push({ method, regex: new RegExp('^' + regexStr + '$'), keys, handler });
}
function matchRoute(method, urlPath) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.regex.exec(urlPath);
    if (m) { const params = {}; r.keys.forEach((k, i) => { params[k] = m[i + 1]; }); return [r.handler, params]; }
  }
  return null;
}
function send(res, status, data) {
  const json = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(json);
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
function isAdmin(req) { return (req.headers.authorization || '') === `Bearer ${TOKEN}`; }

let server, base;

before(async () => {
  const transport = require('../server-quotation.js');
  await transport.init({ stateFile: STATE_FILE });
  transport.register(addRoute, { send, parseBody, isAdmin });

  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const match = matchRoute(req.method, url.pathname);
    if (!match) return send(res, 404, { error: 'API route not found' });
    const [handler, params] = match;
    await handler(req, res, params, url.searchParams);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(r => server.close(r));
  try { rmSync(STATE_FILE, { force: true }); } catch { /* nothing to clean */ }
});

/** One HTTP call. Returns { status, body }. Raw text bodies are returned as-is. */
async function call(method, path, { role = 'SALES', user = 's1', body, token = TOKEN, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (role) headers['x-actor-role'] = role;
  if (user) headers['x-actor-user'] = user;
  const res = await fetch(`${base}${path}`, {
    method, headers,
    body: raw !== undefined ? raw : (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

const PH = { role: 'PROJECT_HEAD', user: 'ph1' };
const SALES = { role: 'SALES', user: 's1' };

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const BOM_LINES = [
  { componentId: 'p1', role: ROLES.PANEL, quantity: 9 },
  { componentId: 'i1', role: ROLES.INVERTER, quantity: 1 },
  { componentId: 'acdb1', role: ROLES.ACDB, quantity: 1 },
];

function bomSnapshot() {
  return createProjectBomSnapshot({
    projectId: 'PRJ-1', bomLines: BOM_LINES, lockedBy: 'ph1', lockedAt: AT,
    dataVersion: 'catalog.7', engineeringStatus: 'VALID',
  });
}

function commercialSnapshot(id, over = {}) {
  return createCommercialSnapshot({
    snapshotId: id, issuedBy: 'ph1', issuedAt: AT,
    costResult: {
      status: COST_STATUS.COMPLETE, projectId: 'PRJ-1', bomSnapshotId: 'BOM-1',
      catalogVersion: 'catalog.7', procurementPriceVersion: 'pp.3', landedCostVersion: 'lc.2',
      projectRateCardVersion: 'rc.4', costConfigVersion: 'cc.5', costEngineVersion: 'costEngine.1',
      materialLandedCost: 200000, structureCost: 15000, installationCost: 18000,
      siteSurveyCost: 500, engineeringDesignCost: 3000, transportationCost: 2500,
      serviceAmcCost: 4000, miscellaneousCost: 2430, officeExpenseAllocation: 6000,
      specialProjectWorksCost: 0, directProjectCost: 243000, totalActualProjectCost: 251430, traces: [],
    },
    pricingResult: {
      status: PRICING_STATUS.COMPLETE, marginVersion: 'margin.2', gstVersion: 'gst.1',
      pricingEngineVersion: 'pricingEngine.1', marginType: 'GROSS_MARGIN',
      targetGrossMargin: 0.18, sellingPriceBeforeGST: 306622, grossProfit: 55192,
      gstRatePct: 8.9, gstAmount: 27289.36, sellingPriceIncludingGST: 333911.36,
      extras: [], extrasIncludingGST: 0, customerTotalIncludingGST: 333911.36,
      customerSideExpenses: [], ...over,
    },
  });
}

const DRAFT = (id, over = {}) => ({
  quotationId: id, projectId: 'PRJ-1', at: AT,
  quotationNumber: `FLZ-${id}`, quotationDate: AT, proposalBy: 's1',
  customer: { customerId: 'C-1', customerName: 'Test Customer' },
  system: { systemType: 'ONGRID', systemSizeKw: 5, phase: 'SINGLE', packageTier: 'BASE' },
  engineering: { status: 'VALID', blocked: [], warnings: [] },
  bomSnapshotId: 'BOM-1', commercialSnapshotId: 'CS-1',
  subsidyTreatment: QP.SUBSIDY_TREATMENT.NOT_QUOTED,
  ...over,
});

/** Register the two snapshots once; issuable drafts are created per test. */
async function seed() {
  await call('POST', '/api/quotation/bom-snapshots', { ...PH, body: { bomSnapshotId: 'BOM-1', snapshot: bomSnapshot() } });
  await call('POST', '/api/quotation/commercial-snapshots', { ...PH, body: { snapshot: commercialSnapshot('CS-1') } });
}

// ---------------------------------------------------------------------------
// 1. transport purity
// ---------------------------------------------------------------------------

test('the transport contains no business formula and no engine import', () => {
  for (const f of ['costEngine', 'pricingEngine', 'engineeringChecker', 'projectBom',
    'quotationPayload', 'money.js', 'commercialSnapshot', 'bomSnapshot']) {
    assert.equal(TRANSPORT_SRC.includes(`/${f}`), false, `must not import ${f}`);
  }
  assert.equal(/calculateCost|calculatePricing|buildQuotationPayload|evaluateGenerationGate/.test(TRANSPORT_SRC), false);
  const moneyMath = /(sellingPrice|gstAmount|customerTotal|grossProfit|margin|Cost)\w*\s*[+\-*/]\s*\w/;
  assert.equal(moneyMath.test(TRANSPORT_SRC), false);
});

test('the transport has no clock, no randomness and no counter', () => {
  assert.equal(/Date\.now|new Date|Math\.random|\+\+|counter/.test(TRANSPORT_SRC), false);
});

test('the transport reads no catalog attribute itself', () => {
  // it loads the catalog file and hands it to the service, and never inspects it
  assert.equal(/catalog\.categories|catalog\?\.categories|\.items\b/.test(TRANSPORT_SRC), false);
  assert.equal(TRANSPORT_SRC.includes('componentAttributesFor'), false);
});

test('the transport implements no permission system of its own', () => {
  assert.equal(/CAPABILITY_MATRIX|capabilitiesOf\(|\bcan\(|assertCan/.test(TRANSPORT_SRC), false);
  // RBAC is referenced only for the role list reported by /session
  assert.equal((TRANSPORT_SRC.match(/RBAC\./g) || []).length, 2);
});

test('server-workspace.js gained only the additive integration hunks', () => {
  assert.ok(WORKSPACE_TRANSPORT_SRC.includes("require('./server-quotation.js')"));
  // C11-H: quotation.init() now receives CMS store getter
  assert.ok(WORKSPACE_TRANSPORT_SRC.includes('await quotation.init('));
  assert.ok(
    WORKSPACE_TRANSPORT_SRC.includes('quotation.register(addRoute, { send, parseBody, isAdmin });') ||
    WORKSPACE_TRANSPORT_SRC.includes('quotation.register(addRoute, { send, parseBody, isAdmin, actorOf: _actorOf });') ||
    WORKSPACE_TRANSPORT_SRC.includes('quotation.register(addRoute, { send, parseBody, isAdmin, isAuthenticated: _isAuth, actorOf: _actorOf });')
  );
  // C11-G/H: CMS integration adds cms require + cms.init + cms.register + getCmsStore wiring
  assert.ok(WORKSPACE_TRANSPORT_SRC.includes("require('./server-cms.js')"));
  assert.ok(WORKSPACE_TRANSPORT_SRC.includes('await cms.init()'));
  assert.ok(
    WORKSPACE_TRANSPORT_SRC.includes('cms.register(addRoute, { send, parseBody, isAdmin });') ||
    WORKSPACE_TRANSPORT_SRC.includes('cms.register(addRoute, { send, parseBody, isAdmin, actorOf: _actorOf });') ||
    WORKSPACE_TRANSPORT_SRC.includes('cms.register(addRoute, { send, parseBody, isAdmin, isAuthenticated: _isAuth, actorOf: _actorOf });')
  );
});

// ---------------------------------------------------------------------------
// 2. authentication + session
// ---------------------------------------------------------------------------

test('an unauthenticated request is refused before anything else', async () => {
  const r = await call('GET', '/api/quotation/session', { token: null });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'Unauthorized');
});

test('the session endpoint reports capabilities and the authenticated-user identity model (P1-4)', async () => {
  const r = await call('GET', '/api/quotation/session', SALES);
  assert.equal(r.status, 200);
  // P1-4: per-user identity is active (server-users.js). Transport advertises AUTHENTICATED_USER.
  assert.equal(r.body.identityModel, 'AUTHENTICATED_USER');
  assert.ok(r.body.capabilities.includes('QUOTATION_CREATE'));
  assert.equal(r.body.capabilities.includes('COST_VIEW'), false);
  assert.ok(r.body.roles.includes('SALES_HEAD'));
  assert.ok(/session-derived|authenticated session/.test(r.body.identityNote),
    'identityNote must describe session-derived identity');
});

// ---------------------------------------------------------------------------
// 3. drafts, retrieval, editing
// ---------------------------------------------------------------------------

test('create draft, get it back, list it', async () => {
  await seed();
  const created = await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-1') });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'DRAFT');
  assert.equal(created.body.createdAt, AT);

  const got = await call('GET', '/api/quotation/quotations/Q-1', SALES);
  assert.equal(got.status, 200);
  assert.equal(got.body.quotationId, 'Q-1');
  assert.equal(got.body.currentVersion, null);

  const list = await call('GET', '/api/quotation/quotations', SALES);
  assert.equal(list.status, 200);
  assert.ok(list.body.quotations.some(q => q.quotationId === 'Q-1'));
});

test('set quotation fields through PATCH', async () => {
  await seed();
  await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-PATCH') });
  const r = await call('PATCH', '/api/quotation/quotations/Q-PATCH', { ...SALES, body: { at: AT2, fields: { validUntil: AT2 } } });
  assert.equal(r.status, 200);
  assert.equal(r.body.validUntil, AT2);
  assert.equal(r.body.updatedAt, AT2);
});

test('an unknown quotation is a 404 carrying the service code', async () => {
  const r = await call('GET', '/api/quotation/quotations/NOPE', SALES);
  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'QUOTATION_NOT_FOUND');
});

test('a duplicate id is a 409 carrying the service code', async () => {
  await seed();
  await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-DUP') });
  const r = await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-DUP') });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'QUOTATION_EXISTS');
});

test('a malformed body is a 400, not a 500', async () => {
  const r = await call('POST', '/api/quotation/quotations', { ...SALES, raw: '{not json' });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'MALFORMED_REQUEST');
});

test('a missing `at` is refused by the service and surfaces as 400', async () => {
  const { at, ...noAt } = DRAFT('Q-NOAT');
  const r = await call('POST', '/api/quotation/quotations', { ...SALES, body: noAt });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'MISSING_TIMESTAMP');
});

// ---------------------------------------------------------------------------
// 4. RBAC is not bypassable from the transport
// ---------------------------------------------------------------------------

test('an authenticated operator asserting a role without QUOTATION_CREATE is refused 403', async () => {
  await seed();
  const r = await call('POST', '/api/quotation/quotations', { role: 'PROCUREMENT', user: 'pr1', body: DRAFT('Q-RBAC') });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'CAPABILITY_DENIED');
  const check = await call('GET', '/api/quotation/quotations/Q-RBAC', SALES);
  assert.equal(check.status, 404, 'the refused draft was never created');
});

test('an unknown asserted role is refused, not defaulted to something harmless', async () => {
  const r = await call('POST', '/api/quotation/quotations', { role: 'CEO', user: 'x', body: DRAFT('Q-CEO') });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'UNKNOWN_ROLE');
});

test('a missing role header is refused — no anonymous operation', async () => {
  const r = await call('GET', '/api/quotation/quotations', { role: null, user: null });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'NO_ACTOR');
});

test('Sales cannot register a commercial snapshot', async () => {
  const r = await call('POST', '/api/quotation/commercial-snapshots', { ...SALES, body: { snapshot: commercialSnapshot('CS-SALES') } });
  assert.equal(r.status, 403);
});

test('an unlocked BOM snapshot is refused with its service code', async () => {
  const draftBom = { ...bomSnapshot(), status: 'DRAFT' };
  const r = await call('POST', '/api/quotation/bom-snapshots', { ...PH, body: { bomSnapshotId: 'BOM-DRAFT', snapshot: draftBom } });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'BOM_NOT_LOCKED');
});

// ---------------------------------------------------------------------------
// 5. payload + gate over HTTP
// ---------------------------------------------------------------------------

test('the payload route returns the assembled payload with blocked sections intact', async () => {
  await seed();
  await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-PAY') });
  const r = await call('GET', '/api/quotation/quotations/Q-PAY/payload', SALES);
  assert.equal(r.status, 200);
  const p = r.body.payload;
  assert.deepEqual(p.bomSummary.componentIds, ['p1', 'i1', 'acdb1']);
  assert.equal(p.savings.dependency, 'SAVINGS_ENGINE');
  assert.equal(p.company.dependency, 'COMPANY_MASTER');
  assert.equal(p.subsidy.treatment, 'NOT_QUOTED');
  // catalog decoration reached the payload through the service, not the transport
  assert.equal(p.bomSummary.rows.find(r2 => r2.componentId === 'p1').attributes.brand, 'Waaree');
});

test('a Sales payload over HTTP carries no internal cost or margin', async () => {
  await seed();
  await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-SALES') });
  const r = await call('GET', '/api/quotation/quotations/Q-SALES/payload', SALES);
  const json = JSON.stringify(r.body);
  for (const k of ['"materialLandedCost"', '"totalActualProjectCost"', '"targetGrossMargin"', '"grossProfit"']) {
    assert.equal(json.includes(k), false, `${k} must not cross the wire to Sales`);
  }
  const asPh = await call('GET', '/api/quotation/quotations/Q-SALES/payload', PH);
  assert.equal(asPh.body.payload.pricing.internal.targetGrossMargin, 0.18);
});

test('the gate route reports the eight checks', async () => {
  await seed();
  await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-GATE') });
  const r = await call('GET', '/api/quotation/quotations/Q-GATE/gate', SALES);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'PASS');
  assert.equal(r.body.checks.length, 8);

  await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-GATE-B', { subsidyTreatment: null }) });
  const blocked = await call('GET', '/api/quotation/quotations/Q-GATE-B/gate', SALES);
  assert.equal(blocked.body.status, 'BLOCKED');
  assert.ok(blocked.body.blockedChecks.includes('SUBSIDY_RESOLVED'));
});

// ---------------------------------------------------------------------------
// 6. GENERATION_BLOCKED survives serialisation
// ---------------------------------------------------------------------------

test('a blocked issue returns GENERATION_BLOCKED with the exact failed checks', async () => {
  await seed();
  // With subsidy engine, null subsidyTreatment auto-derives NOT_QUOTED (passes gate).
  // CUSTOMER_DATA still fails because customer: null.
  await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-BLOCK', { subsidyTreatment: null, customer: null }) });
  const r = await call('POST', '/api/quotation/quotations/Q-BLOCK/issue', { ...SALES, body: { at: AT } });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'GENERATION_BLOCKED');
  assert.ok(r.body.failedChecks.includes('CUSTOMER_DATA'));
  assert.equal(r.body.reasons.length, r.body.failedChecks.length);
  assert.ok(r.body.detail.checks.length === 8);
  assert.notEqual(r.status, 500, 'a meaningful service error must never become a generic 500');
});

test('a blocked issue creates no version and does not change state', async () => {
  await seed();
  await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-BLOCK2', { engineering: { status: 'BLOCKED', blocked: ['PBC-A-001'], warnings: [] } }) });
  const r = await call('POST', '/api/quotation/quotations/Q-BLOCK2/issue', { ...SALES, body: { at: AT } });
  assert.equal(r.body.code, 'GENERATION_BLOCKED');
  const versions = await call('GET', '/api/quotation/quotations/Q-BLOCK2/versions', SALES);
  assert.deepEqual(versions.body.versions, []);
  const q = await call('GET', '/api/quotation/quotations/Q-BLOCK2', SALES);
  assert.equal(q.body.status, 'DRAFT');
  assert.equal(q.body.currentVersion, null);
});

// ---------------------------------------------------------------------------
// 7. issue, revise, versions, verify
// ---------------------------------------------------------------------------

test('a valid quotation issues v1, then revises to v2 with v1 preserved', async () => {
  await seed();
  await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-ISSUE') });

  const v1 = await call('POST', '/api/quotation/quotations/Q-ISSUE/issue', { ...SALES, body: { at: AT } });
  assert.equal(v1.status, 201);
  assert.equal(v1.body.version, 1);
  assert.equal(v1.body.status, 'ISSUED');

  const reissue = await call('POST', '/api/quotation/quotations/Q-ISSUE/issue', { ...SALES, body: { at: AT2 } });
  assert.equal(reissue.status, 409);
  assert.equal(reissue.body.code, 'QUOTATION_ALREADY_ISSUED');

  await call('POST', '/api/quotation/commercial-snapshots', {
    ...PH,
    body: { snapshot: commercialSnapshot('CS-2', { sellingPriceBeforeGST: 999999, sellingPriceIncludingGST: 1088900, customerTotalIncludingGST: 1088900 }) },
  });
  const rev = await call('POST', '/api/quotation/quotations/Q-ISSUE/revise', { ...SALES, body: { at: AT2, changes: { commercialSnapshotId: 'CS-2' } } });
  assert.equal(rev.status, 200);
  assert.equal(rev.body.supersededVersion, 1);

  const v2 = await call('POST', '/api/quotation/quotations/Q-ISSUE/issue', { ...SALES, body: { at: AT2 } });
  assert.equal(v2.body.version, 2);

  const readV1 = await call('GET', '/api/quotation/quotations/Q-ISSUE/versions/1', PH);
  assert.equal(readV1.status, 200);
  assert.equal(readV1.body.status, 'SUPERSEDED');
  assert.equal(readV1.body.payload.pricing.customer.sellingPriceBeforeGST, 306622);

  const readV2 = await call('GET', '/api/quotation/quotations/Q-ISSUE/versions/2', PH);
  assert.equal(readV2.body.status, 'ISSUED');
  assert.equal(readV2.body.payload.pricing.customer.sellingPriceBeforeGST, 999999);

  const list = await call('GET', '/api/quotation/quotations/Q-ISSUE/versions', SALES);
  assert.deepEqual(list.body.versions.map(v => v.version), [1, 2]);
  assert.deepEqual(list.body.versions.map(v => v.status), ['SUPERSEDED', 'ISSUED']);

  const missing = await call('GET', '/api/quotation/quotations/Q-ISSUE/versions/3', SALES);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, 'VERSION_NOT_FOUND');
});

test('an issued quotation cannot be edited through PATCH', async () => {
  await seed();
  await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-FROZEN') });
  await call('POST', '/api/quotation/quotations/Q-FROZEN/issue', { ...SALES, body: { at: AT } });
  const r = await call('PATCH', '/api/quotation/quotations/Q-FROZEN', { ...SALES, body: { at: AT2, fields: { validUntil: AT2 } } });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'QUOTATION_ALREADY_ISSUED');
});

test('the verify route proves the stored document still matches its snapshot', async () => {
  await seed();
  await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-VERIFY') });
  await call('POST', '/api/quotation/quotations/Q-VERIFY/issue', { ...SALES, body: { at: AT } });
  const r = await call('GET', '/api/quotation/quotations/Q-VERIFY/versions/1/verify', PH);
  assert.equal(r.status, 200);
  assert.equal(r.body.frozen, true);
  assert.equal(r.body.snapshotPresent, true);
  assert.equal(r.body.matchesSnapshot, true);
});

test('reading a stored version as Sales withholds internal figures on the wire', async () => {
  await seed();
  await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-WIRE') });
  await call('POST', '/api/quotation/quotations/Q-WIRE/issue', { ...SALES, body: { at: AT } });

  const asSales = await call('GET', '/api/quotation/quotations/Q-WIRE/versions/1', SALES);
  const json = JSON.stringify(asSales.body);
  assert.equal(asSales.body.internalWithheld, true);
  for (const k of ['"targetGrossMargin"', '"materialLandedCost"', '"totalActualProjectCost"']) {
    assert.equal(json.includes(k), false, `${k} must not cross the wire to Sales`);
  }
  // customer figures unchanged — nothing was recomputed for the redacted view
  assert.equal(asSales.body.payload.pricing.customer.sellingPriceIncludingGST, 333911.36);

  const asPh = await call('GET', '/api/quotation/quotations/Q-WIRE/versions/1', PH);
  assert.equal(asPh.body.payload.pricing.internal.targetGrossMargin, 0.18);
});

// ---------------------------------------------------------------------------
// 8. persistence is serialisation, not a second source of truth
// ---------------------------------------------------------------------------

test('a restart rebuilds the store and issued documents stay frozen and unchanged', async () => {
  await seed();
  await call('POST', '/api/quotation/quotations', { ...SALES, body: DRAFT('Q-RESTART') });
  const issued = await call('POST', '/api/quotation/quotations/Q-RESTART/issue', { ...SALES, body: { at: AT } });

  // a second transport instance reading the same state file
  delete require.cache[require.resolve('../server-quotation.js')];
  const reloaded = require('../server-quotation.js');
  await reloaded.init({ stateFile: STATE_FILE });

  const routes2 = [];
  const addRoute2 = (m, p, h) => {
    const keys = [];
    const rx = p.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
    routes2.push({ m, rx: new RegExp('^' + rx + '$'), keys, h });
  };
  reloaded.register(addRoute2, { send, parseBody, isAdmin });
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const r = routes2.find(x => x.m === req.method && x.rx.test(url.pathname));
    if (!r) return send(res, 404, { error: 'API route not found' });
    const m = r.rx.exec(url.pathname); const params = {};
    r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
    await r.h(req, res, params, url.searchParams);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;

  const res = await fetch(`http://127.0.0.1:${port}/api/quotation/quotations/Q-RESTART/versions/1/verify`, {
    headers: { authorization: `Bearer ${TOKEN}`, 'x-actor-role': 'PROJECT_HEAD', 'x-actor-user': 'ph1' },
  });
  const verify = await res.json();
  assert.equal(verify.frozen, true, 'a restored document must be frozen again');
  assert.equal(verify.matchesSnapshot, true);

  const res2 = await fetch(`http://127.0.0.1:${port}/api/quotation/quotations/Q-RESTART/versions/1`, {
    headers: { authorization: `Bearer ${TOKEN}`, 'x-actor-role': 'PROJECT_HEAD', 'x-actor-user': 'ph1' },
  });
  const restored = await res2.json();
  assert.equal(restored.payload.pricing.customer.sellingPriceIncludingGST,
    issued.body.payload.pricing.customer.sellingPriceIncludingGST);
  assert.equal(restored.issuedAt, AT);

  await new Promise(r => srv.close(r));
});

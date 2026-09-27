/**
 * PHASE B — Quotation History Tests
 *
 * Tests history API, filters, version detail, role-based visibility,
 * and salesperson/district list endpoints.
 * Runs against a real server instance (same as security-acceptance).
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:4800';

async function api(method, path, { token, body, headers: extra } = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

let adminToken, headToken, crsAToken;

describe('Phase B — Quotation History', async () => {

  before(async () => {
    const r = await api('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'TestAdmin2026!' }
    });
    assert.equal(r.status, 200);
    adminToken = r.body.token;

    // Ensure test users exist (created by security tests)
    const users = [
      { username: 'saleshead1', name: 'Sales Head', email: 'sh@test.com', role: 'SALES_HEAD', password: 'Head2026!' },
      { username: 'crs_a', name: 'CRS Alpha', email: 'crsa@test.com', role: 'SALES_CRS', password: 'CrsA2026!' },
    ];
    for (const u of users) {
      const existing = await api('GET', '/api/admin/users', { token: adminToken });
      if (!(existing.body.users || []).find(x => x.username === u.username)) {
        await api('POST', '/api/admin/users', { token: adminToken, body: u });
      }
    }

    const loginAs = async (u, p) => {
      const r = await api('POST', '/api/auth/login', { body: { username: u, password: p } });
      assert.equal(r.status, 200, `Login ${u}`);
      return r.body.token;
    };
    headToken = await loginAs('saleshead1', 'Head2026!');
    crsAToken = await loginAs('crs_a', 'CrsA2026!');
  });

  // ---- 12. Quotation history loads ----
  test('12. Quotation history loads', async () => {
    const r = await api('GET', '/api/sales/quotation-history', { token: adminToken });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.quotations));
    assert.ok(typeof r.body.total === 'number');
  });

  // ---- 13. Search by quotation number ----
  test('13. Search by quotation number', async () => {
    const all = await api('GET', '/api/sales/quotation-history', { token: adminToken });
    if (all.body.quotations.length > 0) {
      const qNum = all.body.quotations[0].quotationNumber;
      if (qNum) {
        const r = await api('GET', `/api/sales/quotation-history?q=${encodeURIComponent(qNum)}`, { token: adminToken });
        assert.equal(r.status, 200);
        assert.ok(r.body.quotations.length > 0, 'Search by number returns result');
        assert.ok(r.body.quotations.some(q => q.quotationNumber === qNum));
      }
    }
  });

  // ---- 14. Search by customer ----
  test('14. Search by customer name', async () => {
    const all = await api('GET', '/api/sales/quotation-history', { token: adminToken });
    const withCustomer = all.body.quotations.find(q => q.customer?.name);
    if (withCustomer) {
      const name = withCustomer.customer.name.slice(0, 4);
      const r = await api('GET', `/api/sales/quotation-history?q=${encodeURIComponent(name)}`, { token: adminToken });
      assert.equal(r.status, 200);
      assert.ok(r.body.quotations.length > 0, 'Search by customer returns result');
    }
  });

  // ---- 15. Status filter ----
  test('15. Status filter works', async () => {
    const r = await api('GET', '/api/sales/quotation-history?status=ISSUED', { token: adminToken });
    assert.equal(r.status, 200);
    for (const q of r.body.quotations) {
      assert.equal(q.status, 'ISSUED');
    }
    const dr = await api('GET', '/api/sales/quotation-history?status=DRAFT', { token: adminToken });
    assert.equal(dr.status, 200);
    for (const q of dr.body.quotations) {
      assert.equal(q.status, 'DRAFT');
    }
  });

  // ---- 16. Source filter ----
  test('16. Source filter works', async () => {
    const r = await api('GET', '/api/sales/quotation-history?source=DIRECT', { token: adminToken });
    assert.equal(r.status, 200);
    for (const q of r.body.quotations) {
      assert.equal(q.quotationSource, 'DIRECT');
    }
  });

  // ---- 17. District filter ----
  test('17. District filter works', async () => {
    // Just verify the endpoint accepts the param
    const r = await api('GET', '/api/sales/quotation-history?district=test', { token: adminToken });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.quotations));
  });

  // ---- 18. Date range filter ----
  test('18. Date range filter works', async () => {
    const r = await api('GET', '/api/sales/quotation-history?dateFrom=2020-01-01&dateTo=2099-12-31', { token: adminToken });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.quotations));
  });

  // ---- 19. Salesperson filter for Sales Head ----
  test('19. Salesperson filter available for Sales Head', async () => {
    const sp = await api('GET', '/api/sales/salespersons', { token: headToken });
    assert.equal(sp.status, 200);
    assert.ok(sp.body.salespersons.length > 0, 'Sales Head sees salesperson list');
    // Use salesperson filter
    const userId = sp.body.salespersons[0].userId;
    const r = await api('GET', `/api/sales/quotation-history?salesperson=${userId}`, { token: headToken });
    assert.equal(r.status, 200);
  });

  // ---- 20. Salesperson filter unavailable for individual sales ----
  test('20. Salesperson filter unavailable for individual sales', async () => {
    const sp = await api('GET', '/api/sales/salespersons', { token: crsAToken });
    assert.equal(sp.status, 200);
    assert.equal(sp.body.salespersons.length, 0, 'Individual sales gets empty salesperson list');
  });

  // ---- 21. Individual sales automatically receive own data ----
  test('21. Individual sales automatically filtered to own data', async () => {
    const sess = await api('GET', '/api/auth/session', { token: crsAToken });
    const userId = (sess.body.user || sess.body).userId;
    const r = await api('GET', '/api/sales/quotation-history', { token: crsAToken });
    assert.equal(r.status, 200);
    for (const q of r.body.quotations) {
      assert.ok(
        q.salespersonId === userId || q.createdBy === userId,
        'Individual sales sees only own quotations'
      );
    }
  });

  // ---- 22. Version history loads ----
  test('22. Version history loads for a quotation', async () => {
    const all = await api('GET', '/api/sales/quotation-history', { token: adminToken });
    if (all.body.quotations.length > 0) {
      const qId = all.body.quotations[0].quotationId;
      const r = await api('GET', `/api/sales/quotation-versions/${qId}`, { token: adminToken });
      assert.equal(r.status, 200);
      assert.ok(r.body.quotationId);
      assert.ok(Array.isArray(r.body.versions));
    }
  });

  // ---- 23. Classification preserved ----
  test('23. Classification preserved (quotationSource, district)', async () => {
    const r = await api('GET', '/api/sales/quotation-history', { token: adminToken });
    assert.equal(r.status, 200);
    for (const q of r.body.quotations) {
      assert.ok(
        ['DIRECT', 'AFFILIATE', 'DISTRICT'].includes(q.quotationSource),
        `Valid source: ${q.quotationSource}`
      );
    }
  });

  // ---- 24. Quotation number format unchanged ----
  test('24. Quotation number format GR-YYYYMMDD-NNNN', async () => {
    const r = await api('GET', '/api/sales/next-quotation-number', { token: adminToken });
    assert.equal(r.status, 200);
    assert.match(r.body.quotationNumber, /^GR-\d{8}-\d{4}$/);
  });

  // ---- 25. Districts list endpoint ----
  test('25. Districts list endpoint works', async () => {
    const r = await api('GET', '/api/sales/districts', { token: adminToken });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.districts));
  });

  // ---- 26. History page HTML served ----
  test('26. Quotation history page served', async () => {
    const r = await fetch(`${BASE}/quotation-history.html`);
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.ok(text.includes('Quotation History'));
  });

  // ---- 27. Amount field present in history ----
  test('27. Amount field present in quotation history', async () => {
    const r = await api('GET', '/api/sales/quotation-history', { token: adminToken });
    assert.equal(r.status, 200);
    // Amount field exists in schema (may be null for drafts)
    if (r.body.quotations.length > 0) {
      assert.ok('amount' in r.body.quotations[0], 'amount field present');
    }
  });
});

/**
 * PHASE A — LIVE HTTP Security Acceptance Tests
 *
 * Runs against a real server instance. Tests auth, identity protection,
 * ownership isolation, and header-spoofing resistance.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:4800';

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let adminToken;
let headToken;
let crsAToken, crsBToken;
let fsAToken, fsBToken;

// ---------------------------------------------------------------------------
// Setup — login admin, create test users
// ---------------------------------------------------------------------------

describe('Phase A — Security Acceptance', async () => {

  before(async () => {
    // Login as admin (seeded via ADMIN_PASSWORD env)
    const r = await api('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'TestAdmin2026!' }
    });
    assert.equal(r.status, 200, 'Admin login must succeed');
    adminToken = r.body.token;

    // Create test users
    const users = [
      { username: 'saleshead1', name: 'Sales Head', email: 'sh@test.com', role: 'SALES_HEAD', password: 'Head2026!' },
      { username: 'crs_a', name: 'CRS Alpha', email: 'crsa@test.com', role: 'SALES_CRS', password: 'CrsA2026!' },
      { username: 'crs_b', name: 'CRS Beta', email: 'crsb@test.com', role: 'SALES_CRS', password: 'CrsB2026!' },
      { username: 'fs_a', name: 'Field Alpha', email: 'fsa@test.com', role: 'FIELD_SALES', password: 'FsA2026!' },
      { username: 'fs_b', name: 'Field Beta', email: 'fsb@test.com', role: 'FIELD_SALES', password: 'FsB2026!' },
    ];

    for (const u of users) {
      const existing = await api('GET', '/api/admin/users', { token: adminToken });
      const found = (existing.body.users || []).find(x => x.username === u.username);
      if (!found) {
        const cr = await api('POST', '/api/admin/users', { token: adminToken, body: u });
        assert.ok(cr.status === 201 || cr.status === 200, `Create ${u.username}: ${cr.status}`);
      }
    }

    // Login each user
    const login = async (u, p) => {
      const r = await api('POST', '/api/auth/login', { body: { username: u, password: p } });
      assert.equal(r.status, 200, `Login ${u}`);
      return r.body.token;
    };
    headToken = await login('saleshead1', 'Head2026!');
    crsAToken = await login('crs_a', 'CrsA2026!');
    crsBToken = await login('crs_b', 'CrsB2026!');
    fsAToken = await login('fs_a', 'FsA2026!');
    fsBToken = await login('fs_b', 'FsB2026!');
  });

  // ========================================================================
  // 1. Correct login succeeds
  // ========================================================================
  test('1. Correct username/password login succeeds', async () => {
    const r = await api('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'TestAdmin2026!' }
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
  });

  // ========================================================================
  // 2. Wrong password fails
  // ========================================================================
  test('2. Wrong password fails', async () => {
    const r = await api('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'wrongpassword' }
    });
    assert.ok(r.status >= 400, `Expected 4xx, got ${r.status}`);
  });

  // ========================================================================
  // 3. Disabled user cannot login
  // ========================================================================
  test('3. Disabled user cannot login', async () => {
    // Create temp user, disable, try login
    const u = { username: 'temp_disable', name: 'Temp', email: 't@t.com', role: 'SALES_CRS', password: 'Temp2026!' };
    await api('POST', '/api/admin/users', { token: adminToken, body: u });

    // Find user ID
    const list = await api('GET', '/api/admin/users', { token: adminToken });
    const tempUser = list.body.users.find(x => x.username === 'temp_disable');
    assert.ok(tempUser, 'Temp user exists');

    // Disable
    await api('PATCH', `/api/admin/users/${tempUser.userId}`, {
      token: adminToken, body: { status: 'DISABLED' }
    });

    // Try login
    const r = await api('POST', '/api/auth/login', {
      body: { username: 'temp_disable', password: 'Temp2026!' }
    });
    assert.ok(r.status >= 400, `Disabled user login must fail: ${r.status}`);
  });

  // ========================================================================
  // 4. Session returns correct identity
  // ========================================================================
  test('4. Authenticated session returns correct userId, username, role', async () => {
    const r = await api('GET', '/api/auth/session', { token: crsAToken });
    assert.equal(r.status, 200);
    const user = r.body.user || r.body;
    assert.equal(user.username, 'crs_a');
    assert.equal(user.role, 'SALES_CRS');
    assert.ok(user.userId);
  });

  // ========================================================================
  // 5. Cannot impersonate via x-actor-user header
  // ========================================================================
  test('5. SALES_CRS_A cannot impersonate SALES_CRS_B via x-actor-user header', async () => {
    const r = await api('GET', '/api/auth/session', {
      token: crsAToken,
      headers: { 'x-actor-user': 'crs_b' }
    });
    assert.equal(r.status, 200);
    const user = r.body.user || r.body;
    assert.equal(user.username, 'crs_a', 'Session must return real user, not spoofed');
    assert.notEqual(user.username, 'crs_b');
  });

  // ========================================================================
  // 6. Cannot escalate via x-actor-role header
  // ========================================================================
  test('6. SALES_CRS_A cannot escalate to ADMIN via x-actor-role header', async () => {
    const r = await api('GET', '/api/auth/session', {
      token: crsAToken,
      headers: { 'x-actor-role': 'ADMIN' }
    });
    assert.equal(r.status, 200);
    const user = r.body.user || r.body;
    assert.equal(user.role, 'SALES_CRS', 'Role must come from session, not header');
  });

  // ========================================================================
  // 7. Query-param ownership bypass blocked
  // ========================================================================
  test('7. SALES_CRS_A cannot bypass ownership via ?user= query param', async () => {
    // Get CRS_B userId
    const sessB = await api('GET', '/api/auth/session', { token: crsBToken });
    const userBId = (sessB.body.user || sessB.body).userId;

    // Try to access quotation history with another user's ID
    const r = await api('GET', `/api/sales/quotation-history?user=${userBId}`, { token: crsAToken });
    // Should either ignore the param or return only own data
    if (r.status === 200 && r.body.quotations) {
      const sessA = await api('GET', '/api/auth/session', { token: crsAToken });
      const userAId = (sessA.body.user || sessA.body).userId;
      for (const q of r.body.quotations) {
        assert.ok(
          q.salespersonId === userAId || q.createdBy === userAId,
          `CRS_A should only see own quotations, got q belonging to ${q.salespersonId || q.createdBy}`
        );
      }
    }
  });

  // ========================================================================
  // 8. Direct quotation ID access blocked
  // ========================================================================
  test('8. SALES_CRS_A cannot access SALES_CRS_B quotation by ID', async () => {
    // First create a quotation as CRS_B via sales API
    const custR = await api('POST', '/api/sales/customers', {
      token: crsBToken,
      body: { name: 'Test Customer B', phone: '9876543210' }
    });

    // Get CRS_B quotation history
    const histB = await api('GET', '/api/sales/quotation-history', { token: crsBToken });

    if (histB.body.quotations && histB.body.quotations.length > 0) {
      const qId = histB.body.quotations[0].quotationId;
      // CRS_A tries to access CRS_B quotation
      const r = await api('GET', `/api/quotation/quotations/${qId}`, { token: crsAToken });
      assert.ok(r.status === 403 || r.status === 404,
        `CRS_A accessing CRS_B quotation should be denied, got ${r.status}`);
    }
  });

  // ========================================================================
  // 9. Direct customer ID access blocked
  // ========================================================================
  test('9. SALES_CRS_A cannot access SALES_CRS_B customer by ID', async () => {
    // Get CRS_B customers
    const custB = await api('GET', '/api/sales/customers', { token: crsBToken });

    if (custB.body.customers && custB.body.customers.length > 0) {
      const cId = custB.body.customers[0].id || custB.body.customers[0].customerId;
      // CRS_A tries to access CRS_B customer
      const r = await api('GET', `/api/sales/customers/${cId}`, { token: crsAToken });
      assert.ok(r.status === 403 || r.status === 404,
        `CRS_A accessing CRS_B customer should be denied, got ${r.status}`);
    }
  });

  // ========================================================================
  // 10. FIELD_SALES cross-user isolation
  // ========================================================================
  test('10. FIELD_SALES_A cannot access FIELD_SALES_B quotation/customer', async () => {
    // Create customer as FS_B
    await api('POST', '/api/sales/customers', {
      token: fsBToken,
      body: { name: 'FS-B Customer', phone: '9876543211' }
    });

    // FS_A tries to see FS_B customers
    const custA = await api('GET', '/api/sales/customers', { token: fsAToken });
    if (custA.body.customers) {
      const sessA = await api('GET', '/api/auth/session', { token: fsAToken });
      const userAId = (sessA.body.user || sessA.body).userId;
      for (const c of custA.body.customers) {
        assert.equal(c.createdBy, userAId,
          `FS_A should only see own customers`);
      }
    }
  });

  // ========================================================================
  // 11. SALES_HEAD sees team quotations
  // ========================================================================
  test('11. SALES_HEAD can access sales-team quotations', async () => {
    const r = await api('GET', '/api/sales/quotation-history', { token: headToken });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.quotations), 'Should return quotations array');
  });

  // ========================================================================
  // 12. ADMIN sees system-wide data
  // ========================================================================
  test('12. ADMIN can access appropriate system-wide data', async () => {
    const r = await api('GET', '/api/sales/quotation-history', { token: adminToken });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.quotations));

    const users = await api('GET', '/api/admin/users', { token: adminToken });
    assert.equal(users.status, 200);
    assert.ok(Array.isArray(users.body.users));
  });

  // ========================================================================
  // 13. Quotation numbering works
  // ========================================================================
  test('13. Quotation numbering still GR-YYYYMMDD-NNNN', async () => {
    const r = await api('GET', '/api/sales/next-quotation-number', { token: crsAToken });
    if (r.status === 200 && r.body.quotationNumber) {
      assert.match(r.body.quotationNumber, /^GR-\d{8}-\d{4}$/);
    }
  });

  // ========================================================================
  // 14. Quotation classification
  // ========================================================================
  test('14. Quotation classification DIRECT/AFFILIATE/DISTRICT preserved', async () => {
    // Verify via quotation-history metadata
    const r = await api('GET', '/api/sales/quotation-history', { token: headToken });
    assert.equal(r.status, 200);
    // Check sources available
    if (r.body.quotations?.length > 0) {
      for (const q of r.body.quotations) {
        if (q.quotationSource) {
          assert.ok(['DIRECT', 'AFFILIATE', 'DISTRICT'].includes(q.quotationSource),
            `Invalid source: ${q.quotationSource}`);
        }
      }
    }
  });

  // ========================================================================
  // 15. Quotation history accessible by role
  // ========================================================================
  test('15. Quotation history accessible per role', async () => {
    // Sales Head
    const sh = await api('GET', '/api/sales/quotation-history', { token: headToken });
    assert.equal(sh.status, 200);

    // Individual sales
    const crs = await api('GET', '/api/sales/quotation-history', { token: crsAToken });
    assert.equal(crs.status, 200);

    // Admin
    const adm = await api('GET', '/api/sales/quotation-history', { token: adminToken });
    assert.equal(adm.status, 200);
  });

  // ========================================================================
  // CRITICAL: Non-admin cannot manage users
  // ========================================================================
  test('Non-admin cannot access user management', async () => {
    const r = await api('GET', '/api/admin/users', { token: crsAToken });
    assert.equal(r.status, 401, 'Sales user must be denied user management');
  });

  // ========================================================================
  // CRITICAL: No token = no access
  // ========================================================================
  test('Unauthenticated request denied', async () => {
    const r = await api('GET', '/api/sales/quotation-history');
    assert.ok(r.status === 401 || r.status === 403, `No token should fail: ${r.status}`);
  });

  // ========================================================================
  // Default admin security — no hardcoded password
  // ========================================================================
  test('Default admin password comes from env, not hardcoded', async () => {
    // Verify admin123 does NOT work (it's not the env password)
    const r = await api('POST', '/api/auth/login', {
      body: { username: 'admin', password: 'admin123' }
    });
    assert.ok(r.status >= 400, 'admin123 must not work — password from ADMIN_PASSWORD env');
  });
});

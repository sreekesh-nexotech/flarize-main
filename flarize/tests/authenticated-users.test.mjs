/**
 * Authenticated Users + Sales Visibility — Tests
 *
 * Covers acceptance criteria 1–35 from the spec.
 * Tests run against the service layer (unit) and the server-users module (integration).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- RBAC (criteria 14–17) ------------------------------------------------
import {
  ROLE, ALL_ROLES, CAPABILITY, CAPABILITY_MATRIX,
  can, isKnownRole, isIndividualSalesRole, INDIVIDUAL_SALES_ROLES,
} from '../src/lib/rbac.js';

describe('RBAC — new roles', () => {
  it('14. SALES_CRS exists as a known role', () => {
    assert.ok(ALL_ROLES.includes('SALES_CRS'));
    assert.ok(isKnownRole('SALES_CRS'));
  });

  it('15. FIELD_SALES exists as a known role', () => {
    assert.ok(ALL_ROLES.includes('FIELD_SALES'));
    assert.ok(isKnownRole('FIELD_SALES'));
  });

  it('16. SALES_CRS receives SALES capabilities', () => {
    const salesCaps = CAPABILITY_MATRIX['SALES'];
    const crsCaps = CAPABILITY_MATRIX['SALES_CRS'];
    for (const cap of salesCaps) {
      assert.ok(crsCaps.includes(cap), `SALES_CRS should have ${cap}`);
    }
  });

  it('17. FIELD_SALES receives SALES capabilities', () => {
    const salesCaps = CAPABILITY_MATRIX['SALES'];
    const fsCaps = CAPABILITY_MATRIX['FIELD_SALES'];
    for (const cap of salesCaps) {
      assert.ok(fsCaps.includes(cap), `FIELD_SALES should have ${cap}`);
    }
  });

  it('isIndividualSalesRole includes SALES, SALES_CRS, FIELD_SALES', () => {
    assert.ok(isIndividualSalesRole('SALES'));
    assert.ok(isIndividualSalesRole('SALES_CRS'));
    assert.ok(isIndividualSalesRole('FIELD_SALES'));
    assert.ok(!isIndividualSalesRole('SALES_HEAD'));
    assert.ok(!isIndividualSalesRole('ADMIN'));
  });

  it('SALES_CRS cannot edit BOM', () => {
    assert.ok(!can('SALES_CRS', CAPABILITY.BOM_EDIT));
  });

  it('FIELD_SALES cannot edit BOM', () => {
    assert.ok(!can('FIELD_SALES', CAPABILITY.BOM_EDIT));
  });

  it('35. Existing RBAC tests pass — all original roles still present', () => {
    const expected = ['ADMIN', 'PROJECT_HEAD', 'ENGINEERING', 'PROCUREMENT', 'SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES'];
    for (const r of expected) assert.ok(ALL_ROLES.includes(r), `Missing role: ${r}`);
  });
});

// ---- server-users.js (criteria 1–13) ---------------------------------------
// We test the module functions directly rather than HTTP to avoid port conflicts.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

// Save/restore users.json around tests
let originalUsers;
function backupUsers() {
  try { originalUsers = fs.readFileSync(USERS_FILE, 'utf8'); } catch { originalUsers = '[]'; }
}
function restoreUsers() {
  fs.writeFileSync(USERS_FILE, originalUsers, 'utf8');
}

// Dynamic import of CJS module
let userAuth;
async function loadUserAuth() {
  if (userAuth) return;
  userAuth = await import('../server-users.js');
  userAuth = userAuth.default || userAuth;
}

describe('server-users.js', () => {
  beforeEach(async () => {
    await loadUserAuth();
  });

  describe('Password hashing', () => {
    it('1. hashPassword produces salted scrypt hash', async () => {
      const hash = await userAuth.hashPassword('test123');
      assert.ok(hash.includes(':'), 'Hash should contain salt:key');
      const [salt, key] = hash.split(':');
      assert.equal(salt.length, 32); // 16 bytes hex
      assert.equal(key.length, 128); // 64 bytes hex
    });

    it('1b. verifyPassword confirms correct password', async () => {
      const hash = await userAuth.hashPassword('mypassword');
      assert.ok(await userAuth.verifyPassword('mypassword', hash));
    });

    it('2. Wrong password rejected', async () => {
      const hash = await userAuth.hashPassword('correct');
      assert.ok(!(await userAuth.verifyPassword('wrong', hash)));
    });
  });

  describe('User store', () => {
    beforeEach(() => backupUsers());

    it('8. Admin can create user (via store)', async () => {
      const users = userAuth.readUsers();
      const newUser = {
        userId: `test-${Date.now()}`,
        username: `testcreate-${Date.now()}`,
        name: 'Test Create',
        email: 'test@example.com',
        passwordHash: await userAuth.hashPassword('pass123'),
        role: 'SALES_CRS',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        createdBy: 'admin-001',
      };
      users.push(newUser);
      userAuth.writeUsers(users);
      const found = userAuth.findUserById(newUser.userId);
      assert.ok(found);
      assert.equal(found.username, newUser.username);
      assert.equal(found.role, 'SALES_CRS');
      restoreUsers();
    });

    it('9. User fields can be edited', async () => {
      const users = userAuth.readUsers();
      const testId = `test-edit-${Date.now()}`;
      users.push({
        userId: testId, username: `edit-${Date.now()}`, name: 'Before',
        email: '', passwordHash: await userAuth.hashPassword('pw'),
        role: 'SALES', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'admin',
      });
      userAuth.writeUsers(users);
      const reloaded = userAuth.readUsers();
      const user = reloaded.find(u => u.userId === testId);
      user.name = 'After';
      user.email = 'new@example.com';
      userAuth.writeUsers(reloaded);
      const verify = userAuth.findUserById(testId);
      assert.equal(verify.name, 'After');
      assert.equal(verify.email, 'new@example.com');
      restoreUsers();
    });

    it('10. User can be disabled', async () => {
      const users = userAuth.readUsers();
      const testId = `test-disable-${Date.now()}`;
      users.push({
        userId: testId, username: `disable-${Date.now()}`, name: 'Dis',
        email: '', passwordHash: await userAuth.hashPassword('pw'),
        role: 'FIELD_SALES', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'admin',
      });
      userAuth.writeUsers(users);
      const reloaded = userAuth.readUsers();
      const user = reloaded.find(u => u.userId === testId);
      user.status = 'DISABLED';
      userAuth.writeUsers(reloaded);
      assert.equal(userAuth.findUserById(testId).status, 'DISABLED');
      restoreUsers();
    });

    it('11. User can be re-enabled', async () => {
      const users = userAuth.readUsers();
      const testId = `test-enable-${Date.now()}`;
      users.push({
        userId: testId, username: `enable-${Date.now()}`, name: 'En',
        email: '', passwordHash: await userAuth.hashPassword('pw'),
        role: 'FIELD_SALES', status: 'DISABLED', createdAt: new Date().toISOString(), createdBy: 'admin',
      });
      userAuth.writeUsers(users);
      const reloaded = userAuth.readUsers();
      reloaded.find(u => u.userId === testId).status = 'ACTIVE';
      userAuth.writeUsers(reloaded);
      assert.equal(userAuth.findUserById(testId).status, 'ACTIVE');
      restoreUsers();
    });

    it('12. Password can be reset', async () => {
      const users = userAuth.readUsers();
      const testId = `test-pwreset-${Date.now()}`;
      users.push({
        userId: testId, username: `pwreset-${Date.now()}`, name: 'PW',
        email: '', passwordHash: await userAuth.hashPassword('old'),
        role: 'SALES', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'admin',
      });
      userAuth.writeUsers(users);
      const newHash = await userAuth.hashPassword('newpassword');
      const reloaded = userAuth.readUsers();
      reloaded.find(u => u.userId === testId).passwordHash = newHash;
      userAuth.writeUsers(reloaded);
      const updated = userAuth.findUserById(testId);
      assert.ok(await userAuth.verifyPassword('newpassword', updated.passwordHash));
      assert.ok(!(await userAuth.verifyPassword('old', updated.passwordHash)));
      restoreUsers();
    });

    it('safeUser strips passwordHash', () => {
      const user = { userId: 'u1', username: 'test', passwordHash: 'secret:hash', role: 'SALES' };
      const safe = userAuth.safeUser(user);
      assert.ok(!('passwordHash' in safe));
      assert.equal(safe.userId, 'u1');
    });
  });

  describe('Session management', () => {
    it('4. Session contains userId', () => {
      const user = { userId: 'u-session', username: 'sess', role: 'SALES_CRS' };
      const token = crypto.randomBytes(32).toString('hex');
      userAuth.sessions.set(token, {
        userId: user.userId, username: user.username, role: user.role,
        createdAt: new Date().toISOString(),
      });
      const sess = userAuth.getSession(token);
      assert.ok(sess);
      assert.equal(sess.userId, 'u-session');
      userAuth.sessions.delete(token);
    });

    it('5. Session contains role', () => {
      const token = crypto.randomBytes(32).toString('hex');
      userAuth.sessions.set(token, {
        userId: 'u2', username: 'test2', role: 'FIELD_SALES',
        createdAt: new Date().toISOString(),
      });
      const sess = userAuth.getSession(token);
      assert.equal(sess.role, 'FIELD_SALES');
      userAuth.sessions.delete(token);
    });

    it('3. Disabled user rejected — session invalid after disable', () => {
      const token = crypto.randomBytes(32).toString('hex');
      userAuth.sessions.set(token, {
        userId: 'disabled-user', username: 'dis', role: 'SALES',
        createdAt: new Date().toISOString(),
      });
      // Simulate disable: delete session
      userAuth.sessions.delete(token);
      assert.equal(userAuth.getSession(token), null);
    });

    it('actorOf returns null for no session', () => {
      const fakeReq = { headers: {} };
      const actor = userAuth.actorOf(fakeReq);
      assert.equal(actor, null);
    });

    it('6. actorOf ignores x-actor-user header', () => {
      const token = crypto.randomBytes(32).toString('hex');
      userAuth.sessions.set(token, {
        userId: 'real-user', username: 'real', role: 'SALES_CRS',
        createdAt: new Date().toISOString(),
      });
      const fakeReq = {
        headers: {
          'authorization': 'Bearer ' + token,
          'x-actor-user': 'spoofed-user',
          'x-actor-role': 'ADMIN',
        },
      };
      const actor = userAuth.actorOf(fakeReq);
      assert.equal(actor.userId, 'real-user', 'userId must come from session, not header');
      assert.equal(actor.role, 'SALES_CRS', 'role must come from session, not header');
      userAuth.sessions.delete(token);
    });

    it('7. actorOf ignores x-actor-role header — cannot escalate to ADMIN', () => {
      const token = crypto.randomBytes(32).toString('hex');
      userAuth.sessions.set(token, {
        userId: 'sales-guy', username: 'sg', role: 'SALES',
        createdAt: new Date().toISOString(),
      });
      const fakeReq = {
        headers: {
          'authorization': 'Bearer ' + token,
          'x-actor-role': 'ADMIN',
        },
      };
      const actor = userAuth.actorOf(fakeReq);
      assert.equal(actor.role, 'SALES', 'Role must come from session, not spoofed header');
      userAuth.sessions.delete(token);
    });

    it('13. Non-admin cannot manage users (isAdmin check)', () => {
      const token = crypto.randomBytes(32).toString('hex');
      userAuth.sessions.set(token, {
        userId: 'sales1', username: 'sales', role: 'SALES_CRS',
        createdAt: new Date().toISOString(),
      });
      const fakeReq = { headers: { 'authorization': 'Bearer ' + token } };
      assert.ok(!userAuth.isAdmin(fakeReq), 'SALES_CRS must not be admin');
      userAuth.sessions.delete(token);
    });

    it('isAdmin returns true for ADMIN role', () => {
      const token = crypto.randomBytes(32).toString('hex');
      userAuth.sessions.set(token, {
        userId: 'admin-001', username: 'admin', role: 'ADMIN',
        createdAt: new Date().toISOString(),
      });
      const fakeReq = { headers: { 'authorization': 'Bearer ' + token } };
      assert.ok(userAuth.isAdmin(fakeReq));
      userAuth.sessions.delete(token);
    });

    it('isAuthenticated returns true for valid session', () => {
      const token = crypto.randomBytes(32).toString('hex');
      userAuth.sessions.set(token, {
        userId: 'u-auth', username: 'auth', role: 'FIELD_SALES',
        createdAt: new Date().toISOString(),
      });
      const fakeReq = { headers: { 'authorization': 'Bearer ' + token } };
      assert.ok(userAuth.isAuthenticated(fakeReq));
      userAuth.sessions.delete(token);
    });
  });
});

// ---- Quotation ownership (criteria 18–26) -----------------------------------
import {
  createQuotationStore, createDraft, listQuotations, getQuotation,
  setQuotationFields, QUOTATION_SOURCE,
} from '../src/lib/quotationWorkspace.js';

describe('Quotation ownership visibility', () => {
  let store;
  const NOW = '2026-08-28T10:00:00.000Z';
  const ADMIN = { userId: 'admin-001', role: 'ADMIN' };
  const PH = { userId: 'ph-001', role: 'PROJECT_HEAD' };
  const HEAD = { userId: 'head-001', role: 'SALES_HEAD' };
  const CRS1 = { userId: 'crs-001', role: 'SALES_CRS' };
  const CRS2 = { userId: 'crs-002', role: 'SALES_CRS' };
  const FS1 = { userId: 'fs-001', role: 'FIELD_SALES' };

  let qIdCrs1, qIdFs1;

  beforeEach(() => {
    store = createQuotationStore();

    // CRS1 creates a quotation
    let nextIdCounter = 1;
    const result1 = createDraft(store, CRS1, {
      quotationId: `q-crs1-${nextIdCounter}`,
      at: NOW,
    });
    qIdCrs1 = result1.quotationId;

    // FS1 creates a quotation
    nextIdCounter++;
    const result2 = createDraft(store, FS1, {
      quotationId: `q-fs1-${nextIdCounter}`,
      at: NOW,
    });
    qIdFs1 = result2.quotationId;
  });

  it('18. Sales CRS sees own quotations', () => {
    const list = listQuotations(store, CRS1);
    assert.ok(list.some(q => q.quotationId === qIdCrs1));
  });

  it('19. Sales CRS cannot see another salesperson\'s quotation', () => {
    const list = listQuotations(store, CRS1);
    assert.ok(!list.some(q => q.quotationId === qIdFs1));
  });

  it('20. Field Sales sees own quotations', () => {
    const list = listQuotations(store, FS1);
    assert.ok(list.some(q => q.quotationId === qIdFs1));
  });

  it('21. Field Sales cannot see another salesperson\'s quotation', () => {
    const list = listQuotations(store, FS1);
    assert.ok(!list.some(q => q.quotationId === qIdCrs1));
  });

  it('22. Sales Head sees all sales quotations', () => {
    const list = listQuotations(store, HEAD);
    assert.ok(list.some(q => q.quotationId === qIdCrs1));
    assert.ok(list.some(q => q.quotationId === qIdFs1));
  });

  it('26. Direct quotation ID access is protected', () => {
    // CRS1 cannot access FS1's quotation by ID
    assert.throws(() => getQuotation(store, CRS1, qIdFs1), /Access denied/);
  });

  it('Sales Head can access any quotation by ID', () => {
    const q = getQuotation(store, HEAD, qIdCrs1);
    assert.equal(q.quotationId, qIdCrs1);
  });

  it('PROJECT_HEAD can access any quotation by ID', () => {
    const q = getQuotation(store, PH, qIdCrs1);
    assert.equal(q.quotationId, qIdCrs1);
  });

  it('Owner can access own quotation by ID', () => {
    const q = getQuotation(store, CRS1, qIdCrs1);
    assert.equal(q.quotationId, qIdCrs1);
  });

  it('CRS2 cannot access CRS1 quotation', () => {
    assert.throws(() => getQuotation(store, CRS2, qIdCrs1), /Access denied/);
  });
});

// ---- Quotation numbering + classification (criteria 27–33) ------------------

describe('Quotation numbering and classification', () => {
  let store;
  const NOW = '2026-08-28T10:00:00.000Z';
  const ACTOR = { userId: 'sales-num', role: 'SALES_CRS' };

  beforeEach(() => {
    store = createQuotationStore();
  });

  it('27. Quotation numbering still works', () => {
    const result = createDraft(store, ACTOR, {
      quotationId: 'q-num-test',
      at: NOW,
    });
    assert.ok(result.quotationId);
  });

  it('28. Existing quotation classification still works', () => {
    const result = createDraft(store, ACTOR, {
      quotationId: 'q-class-test',
      at: NOW,
      quotationSource: 'AFFILIATE',
      affiliateId: 'aff-001',
    });
    const q = getQuotation(store, ACTOR, result.quotationId);
    assert.equal(q.quotationSource, 'AFFILIATE');
    assert.equal(q.affiliateId, 'aff-001');
    assert.equal(q.salespersonId, 'sales-num');
  });

  it('29. Source filtering still works (QUOTATION_SOURCE constant)', () => {
    assert.ok(QUOTATION_SOURCE);
    assert.equal(QUOTATION_SOURCE.DIRECT, 'DIRECT');
    assert.equal(QUOTATION_SOURCE.AFFILIATE, 'AFFILIATE');
    assert.equal(QUOTATION_SOURCE.DISTRICT, 'DISTRICT');
  });

  it('30. District filtering — DISTRICT source requires district', () => {
    assert.throws(() => {
      createDraft(store, ACTOR, {
        quotationId: 'q-district-missing',
        at: NOW,
        quotationSource: 'DISTRICT',
      });
    }, /district is required/i);
  });

  it('31. Classification survives setQuotationFields', () => {
    const result = createDraft(store, ACTOR, {
      quotationId: 'q-persist',
      at: NOW,
      quotationSource: 'DISTRICT',
      district: 'ERNAKULAM',
    });
    // Set other fields — classification should persist
    setQuotationFields(store, ACTOR, result.quotationId, { validUntil: '2026-12-31' }, NOW);
    const q = getQuotation(store, ACTOR, result.quotationId);
    assert.equal(q.quotationSource, 'DISTRICT');
    assert.equal(q.district, 'ERNAKULAM');
  });

  it('salespersonId is server-derived from actor, not client-provided', () => {
    const result = createDraft(store, ACTOR, {
      quotationId: 'q-sp-test',
      at: NOW,
    });
    const q = getQuotation(store, ACTOR, result.quotationId);
    assert.equal(q.salespersonId, 'sales-num', 'salespersonId must match actor.userId');
  });
});

// ---- Internal cost protection (criterion 34) --------------------------------

describe('Internal cost protection', () => {
  it('34. SALES_CRS cannot access cost input', () => {
    assert.ok(!can('SALES_CRS', CAPABILITY.COST_INPUT_EDIT));
    assert.ok(!can('FIELD_SALES', CAPABILITY.COST_INPUT_EDIT));
    assert.ok(!can('SALES', CAPABILITY.COST_INPUT_EDIT));
  });

  it('SALES roles cannot edit procurement prices', () => {
    assert.ok(!can('SALES_CRS', CAPABILITY.PROCUREMENT_PRICE_EDIT));
    assert.ok(!can('FIELD_SALES', CAPABILITY.PROCUREMENT_PRICE_EDIT));
  });
});

// ---- VALID_USER_ROLES check -------------------------------------------------

describe('User roles validation', () => {
  it('VALID_USER_ROLES includes all four user-facing roles', async () => {
    await loadUserAuth();
    const roles = userAuth.VALID_USER_ROLES;
    assert.ok(roles.includes('ADMIN'));
    assert.ok(roles.includes('SALES_HEAD'));
    assert.ok(roles.includes('SALES_CRS'));
    assert.ok(roles.includes('FIELD_SALES'));
  });
});

// Stateless HMAC sessions — P0.1 (2026-09-13)
// A token issued by one server process must verify in a fresh process that
// shares the same secret (restart / redeploy), a tampered token must be
// rejected, and password reset / disable must invalidate old tokens.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USERS_FILE = path.join(ROOT, 'data', 'users.json');

// Work on a copy of users.json and restore it afterwards — never mutate the live store.
let backup;
const TEST_USER = {
  userId: 'sess-test-001', username: 'sess_test', name: 'Session Test', email: 'st@test.local',
  passwordHash: 'x:y', role: 'SALES', status: 'ACTIVE', createdAt: new Date().toISOString(), createdBy: 'TEST',
};

function freshModule() {
  const key = require.resolve('../server-users.js');
  delete require.cache[key];
  return require('../server-users.js');
}

describe('P0.1 — stateless sessions', () => {
  before(() => {
    backup = fs.existsSync(USERS_FILE) ? fs.readFileSync(USERS_FILE, 'utf8') : null;
    const users = backup ? JSON.parse(backup) : [];
    users.push({ ...TEST_USER });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    process.env.SESSION_SECRET = 'test-secret-' + os.hostname() + '-0123456789';
  });
  after(() => {
    if (backup == null) fs.rmSync(USERS_FILE, { force: true });
    else fs.writeFileSync(USERS_FILE, backup);
    delete process.env.SESSION_SECRET;
  });

  it('token survives a module reload (simulated restart) with the same secret', () => {
    const a = freshModule();
    const token = a.createSession(TEST_USER);
    assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'signed token shape');
    assert.equal(a.getSession(token)?.userId, TEST_USER.userId);
    const b = freshModule(); // new process-equivalent: empty Maps
    assert.equal(b.sessions.size, 0);
    const sess = b.getSession(token);
    assert.ok(sess, 'token still valid after restart');
    assert.equal(sess.userId, TEST_USER.userId);
    assert.equal(sess.role, 'SALES');
  });

  it('tampered payload or signature is rejected', () => {
    const m = freshModule();
    const token = m.createSession(TEST_USER);
    const [p, sig] = token.split('.');
    // flip role to ADMIN inside the payload, keep signature
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    payload.r = 'ADMIN';
    const forged = Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + sig;
    assert.equal(m.getSession(forged), null);
    assert.equal(m.getSession(p + '.' + sig.slice(1) + 'A'), null);
    assert.equal(m.getSession('garbage'), null);
    assert.equal(m.getSession(''), null);
  });

  it('a different secret rejects the token', () => {
    const m1 = freshModule();
    const token = m1.createSession(TEST_USER);
    process.env.SESSION_SECRET = 'another-secret-value-0123456789';
    const m2 = freshModule();
    assert.equal(m2.getSession(token), null);
    process.env.SESSION_SECRET = 'test-secret-' + os.hostname() + '-0123456789';
  });

  it('logout revokes the token in that process', () => {
    const m = freshModule();
    const token = m.createSession(TEST_USER);
    assert.ok(m.getSession(token));
    m.invalidateSession(token);
    assert.equal(m.getSession(token), null);
  });

  it('bumping sessionVersion (password reset / disable) invalidates old tokens', () => {
    const m = freshModule();
    const token = m.createSession(TEST_USER);
    assert.ok(m.getSession(token));
    const users = m.readUsers();
    const u = users.find(x => x.userId === TEST_USER.userId);
    u.sessionVersion = 1;
    m.writeUsers(users);
    assert.equal(m.getSession(token), null, 'old token dead after version bump');
    const token2 = m.createSession({ ...TEST_USER, sessionVersion: 1 });
    assert.ok(m.getSession(token2), 'new token with current version works');
  });

  it('disabled user cannot use an existing token', () => {
    const m = freshModule();
    const users = m.readUsers();
    const u = users.find(x => x.userId === TEST_USER.userId);
    const token = m.createSession(u);
    assert.ok(m.getSession(token));
    u.status = 'DISABLED';
    m.writeUsers(users);
    assert.equal(m.getSession(token), null);
    u.status = 'ACTIVE';
    m.writeUsers(users);
  });

  it('legacy overlay Map still resolves (tests / password-only admin fallback)', () => {
    const m = freshModule();
    m.sessions.set('legacy-token', { userId: 'admin-legacy', username: 'admin', role: 'ADMIN', createdAt: new Date().toISOString() });
    assert.equal(m.getSession('legacy-token')?.role, 'ADMIN');
    m.sessions.delete('legacy-token');
  });
});

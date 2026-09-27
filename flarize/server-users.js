/**
 * SERVER-USERS — User Store + Authentication + User Management
 *
 * Parts 1-3 of Authenticated Users phase.
 *
 * User store:      data/users.json
 * Password hashing: crypto.scrypt (64-byte key, 16-byte salt)
 * Session tokens:   stateless HMAC-SHA256 tokens (`<payload>.<sig>`, base64url)
 *                   signed with SESSION_SECRET (env) or data/.session-secret
 *                   (auto-generated once, persisted). Survive server restarts
 *                   and redeploys. Payload: userId, username, role, sv
 *                   (user.sessionVersion — bumped on password reset), iat, exp.
 *                   A disabled user or a bumped sessionVersion invalidates the
 *                   token on the next request. Logout adds the token to an
 *                   in-memory revocation list (browser storage is cleared too).
 *                   The legacy in-memory `sessions` Map is kept only as an
 *                   overlay for the password-only admin fallback and tests.
 *
 * Authentication:
 *   POST /api/auth/login   → username + password → session token
 *   POST /api/auth/logout  → invalidate token
 *   GET  /api/auth/session → current session info
 *
 * User management (admin-only):
 *   POST   /api/admin/users            → create user
 *   GET    /api/admin/users            → list users
 *   PATCH  /api/admin/users/:id        → edit user
 *   PUT    /api/admin/users/:id/password → reset password
 *
 * Identity model: AUTHENTICATED_USER
 * Once a session is established, actorOf(req) returns { userId, role }
 * derived from the session — the client CANNOT override these.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours
const SCRYPT_KEYLEN = 64;
const SALT_LEN = 16;

// Valid roles for user creation/editing
const VALID_USER_ROLES = ['ADMIN', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES', 'SALES', 'PROJECT_HEAD', 'ENGINEERING', 'PROCUREMENT'];

// ---------------------------------------------------------------------------
// Session signing secret — env SESSION_SECRET wins; otherwise a random secret
// is generated once and persisted next to the user store so tokens stay valid
// across restarts (on Render the data/ dir is the persistent disk).
// ---------------------------------------------------------------------------
const SECRET_FILE = path.join(__dirname, 'data', '.session-secret');
function loadSessionSecret() {
  const env = String(process.env.SESSION_SECRET || '').trim();
  if (env.length >= 16) return env;
  try {
    const s = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (s.length >= 32) return s;
  } catch { /* first boot */ }
  const s = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  } catch (e) {
    console.warn('[users] could not persist session secret — tokens will not survive a restart:', e.message);
  }
  return s;
}
const SESSION_SECRET = loadSessionSecret();

// ---------------------------------------------------------------------------
// Legacy in-memory overlay: token → { userId, username, role, createdAt }.
// Only the password-only admin fallback and unit tests write here; real
// logins issue stateless signed tokens (see createSession / getSession).
// ---------------------------------------------------------------------------
const sessions = new Map();
// Tokens explicitly logged out before their exp — token → exp (ms).
const revoked = new Map();

// Rate limiting: IP → { count, resetAt }
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 min

// ---------------------------------------------------------------------------
// Password hashing (crypto.scrypt)
// ---------------------------------------------------------------------------

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LEN).toString('hex');
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
      if (err) return reject(err);
      resolve(`${salt}:${key.toString('hex')}`);
    });
  });
}

function verifyPassword(password, storedHash) {
  return new Promise((resolve, reject) => {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return resolve(false);
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
      if (err) return reject(err);
      resolve(crypto.timingSafeEqual(Buffer.from(hash, 'hex'), key));
    });
  });
}

// ---------------------------------------------------------------------------
// User store (file-backed)
// ---------------------------------------------------------------------------

function readUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function findUserByUsername(username) {
  return readUsers().find(u => u.username.toLowerCase() === username.toLowerCase());
}

function findUserById(userId) {
  return readUsers().find(u => u.userId === userId);
}

/** Strip passwordHash from user for API responses */
function safeUser(u) {
  if (!u) return null;
  const { passwordHash, ...safe } = u;
  return safe;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

function gcSessions() {
  const now = Date.now();
  for (const [tok, sess] of sessions) {
    if (now - new Date(sess.createdAt).getTime() > SESSION_TTL) sessions.delete(tok);
  }
  for (const [tok, exp] of revoked) {
    if (now > exp) revoked.delete(tok);
  }
}

function signPayload(payloadB64) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
}

/**
 * Issue a stateless signed token for a user record. Nothing is stored
 * server-side; the token is self-describing and verified on every request.
 */
function createSession(user) {
  gcSessions();
  const now = Date.now();
  const payload = {
    u: user.userId,
    n: user.username,
    r: user.role,
    sv: Number(user.sessionVersion || 0),
    iat: now,
    exp: now + SESSION_TTL,
  };
  const p = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${p}.${signPayload(p)}`;
}

/**
 * Resolve a token to { userId, username, role, createdAt } or null.
 * Order: legacy overlay Map → revocation list → HMAC verify → exp →
 * user still ACTIVE with matching sessionVersion. Role/username are read
 * from the live user record so an admin role change applies immediately.
 */
function getSession(token) {
  if (!token) return null;
  const overlay = sessions.get(token);
  if (overlay) {
    if (Date.now() - new Date(overlay.createdAt).getTime() > SESSION_TTL) {
      sessions.delete(token);
      return null;
    }
    return overlay;
  }
  if (revoked.has(token)) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const p = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signPayload(p);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch { return null; }
  let payload;
  try { payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); }
  catch { return null; }
  if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  const user = findUserById(payload.u);
  if (!user || user.status !== 'ACTIVE') return null;
  if (Number(user.sessionVersion || 0) !== Number(payload.sv || 0)) return null;
  return {
    userId: user.userId,
    username: user.username,
    role: user.role,
    createdAt: new Date(payload.iat || Date.now()).toISOString(),
  };
}

function invalidateSession(token) {
  if (!token) return;
  sessions.delete(token);
  // Stateless token: remember it as revoked until its own exp (or TTL).
  let exp = Date.now() + SESSION_TTL;
  try {
    const p = token.slice(0, token.indexOf('.'));
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (typeof payload?.exp === 'number') exp = payload.exp;
  } catch { /* not a signed token */ }
  revoked.set(token, exp);
}

/**
 * Invalidate every session of a user (password reset / disable): bump the
 * user's sessionVersion so previously issued tokens no longer verify, and
 * drop any overlay entries. Caller persists `users`.
 */
function invalidateUserSessions(users, userId) {
  const u = users.find(x => x.userId === userId);
  if (u) u.sessionVersion = Number(u.sessionVersion || 0) + 1;
  for (const [tok, sess] of sessions) {
    if (sess.userId === userId) sessions.delete(tok);
  }
}

// ---------------------------------------------------------------------------
// Token extraction
// ---------------------------------------------------------------------------

function getToken(req) {
  const auth = req.headers['authorization'] || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

/**
 * actorOf(req) — the ONLY way to derive identity.
 * Returns { userId, role } from the authenticated session.
 * Client headers x-actor-role / x-actor-user are IGNORED.
 * Returns null if no valid session.
 */
function actorOf(req) {
  const sess = getSession(getToken(req));
  if (!sess) return null;
  return { userId: sess.userId, role: sess.role };
}

/**
 * Is the request from an authenticated user (any role)?
 */
function isAuthenticated(req) {
  return actorOf(req) !== null;
}

/**
 * Is the request from an authenticated admin?
 */
function isAdmin(req) {
  const actor = actorOf(req);
  return actor !== null && actor.role === 'ADMIN';
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) return true;
  return entry.count < MAX_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW });
  } else {
    entry.count++;
  }
}

function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

// ---------------------------------------------------------------------------
// Seed admin (first boot)
// ---------------------------------------------------------------------------

async function ensureAdminExists() {
  const users = readUsers();
  if (users.some(u => u.role === 'ADMIN' && u.status === 'ACTIVE')) return;

  // Seed from ADMIN_PASSWORD env var for backward compat
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) return; // Cannot seed without a password

  const admin = {
    userId: 'admin-001',
    username: 'admin',
    name: 'Administrator',
    email: '',
    passwordHash: await hashPassword(adminPw),
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    createdBy: 'SYSTEM',
  };
  users.push(admin);
  writeUsers(users);
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function init({ addRoute }) {

  // ========================================================================
  // AUTHENTICATION
  // ========================================================================

  /** POST /api/auth/login — username + password → session token */
  addRoute('POST', '/api/auth/login', async (req, res) => {
    const ip = req.socket?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      return send(res, 429, { error: 'Too many login attempts. Try again later.' });
    }

    let body = '';
    for await (const chunk of req) body += chunk;
    let parsed;
    try { parsed = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid JSON.' }); }

    const { username, password } = parsed || {};
    if (!username || !password) {
      return send(res, 400, { error: 'username and password are required.' });
    }

    const user = findUserByUsername(username);
    if (!user || user.status !== 'ACTIVE') {
      recordFailedAttempt(ip);
      return send(res, 401, { error: 'Invalid credentials.' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      recordFailedAttempt(ip);
      return send(res, 401, { error: 'Invalid credentials.' });
    }

    clearAttempts(ip);
    const token = createSession(user);
    send(res, 200, {
      token,
      user: safeUser(user),
      identityModel: 'AUTHENTICATED_USER',
    });
  });

  /** POST /api/auth/logout — invalidate session */
  addRoute('POST', '/api/auth/logout', async (req, res) => {
    invalidateSession(getToken(req));
    send(res, 200, { ok: true });
  });

  /** GET /api/auth/session — current session info */
  addRoute('GET', '/api/auth/session', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return send(res, 401, { error: 'Not authenticated.' });
    const user = findUserById(actor.userId);
    send(res, 200, {
      user: safeUser(user),
      identityModel: 'AUTHENTICATED_USER',
    });
  });

  // ========================================================================
  // LEGACY AUTH — backward compat with ADMIN_PASSWORD
  // Accepts password-only login (no username), creates admin session.
  // This allows existing sales.html/company-profile.html to work until
  // their login forms are updated.
  // ========================================================================

  addRoute('POST', '/api/auth', async (req, res) => {
    const ip = req.socket?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      return send(res, 429, { error: 'Too many login attempts. Try again later.' });
    }

    let body = '';
    for await (const chunk of req) body += chunk;
    let parsed;
    try { parsed = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid JSON.' }); }

    // Try new-style login first (username + password)
    if (parsed.username && parsed.password) {
      const user = findUserByUsername(parsed.username);
      if (!user || user.status !== 'ACTIVE') {
        recordFailedAttempt(ip);
        return send(res, 401, { error: 'Invalid credentials.' });
      }
      const valid = await verifyPassword(parsed.password, user.passwordHash);
      if (!valid) {
        recordFailedAttempt(ip);
        return send(res, 401, { error: 'Invalid credentials.' });
      }
      clearAttempts(ip);
      const token = createSession(user);
      return send(res, 200, {
        token,
        user: safeUser(user),
        identityModel: 'AUTHENTICATED_USER',
      });
    }

    // Legacy: password-only login (backward compat)
    const adminPw = process.env.ADMIN_PASSWORD;
    if (parsed.password && adminPw && parsed.password === adminPw) {
      clearAttempts(ip);
      // Find or create admin user for session
      let admin = findUserByUsername('admin');
      if (!admin) {
        await ensureAdminExists();
        admin = findUserByUsername('admin');
      }
      if (admin) {
        const token = createSession(admin);
        return send(res, 200, {
          token,
          user: safeUser(admin),
          identityModel: 'AUTHENTICATED_USER',
        });
      }
      // Fallback: create transient admin session (no user record)
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, {
        userId: 'admin-legacy',
        username: 'admin',
        role: 'ADMIN',
        createdAt: new Date().toISOString(),
      });
      return send(res, 200, { token, identityModel: 'LEGACY_ADMIN_PASSWORD' });
    }

    recordFailedAttempt(ip);
    send(res, 401, { error: 'Invalid credentials.' });
  });

  // ========================================================================
  // USER MANAGEMENT (admin-only)
  // ========================================================================

  const adminGuard = (handler) => async (req, res, params, query) => {
    if (!isAdmin(req)) return send(res, 401, { error: 'Admin authentication required.' });
    try { return await handler(req, res, params, query); }
    catch (e) { send(res, 500, { error: e.message }); }
  };

  /** POST /api/admin/users — create user */
  addRoute('POST', '/api/admin/users', adminGuard(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);

    const { username, name, email, password, role } = input;
    if (!username || !password || !role) {
      return send(res, 400, { error: 'username, password, and role are required.' });
    }
    if (username.length < 2 || username.length > 50) {
      return send(res, 400, { error: 'Username must be 2-50 characters.' });
    }
    if (password.length < 6) {
      return send(res, 400, { error: 'Password must be at least 6 characters.' });
    }
    if (!VALID_USER_ROLES.includes(role)) {
      return send(res, 400, { error: `Invalid role. Must be one of: ${VALID_USER_ROLES.join(', ')}` });
    }

    const users = readUsers();
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      return send(res, 409, { error: `Username "${username}" already exists.` });
    }

    const actor = actorOf(req);
    const userId = `user-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const user = {
      userId,
      username,
      name: name || username,
      email: email || '',
      passwordHash: await hashPassword(password),
      role,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      createdBy: actor.userId,
    };
    users.push(user);
    writeUsers(users);
    send(res, 201, { user: safeUser(user) });
  }));

  /** GET /api/admin/users — list all users */
  addRoute('GET', '/api/admin/users', adminGuard(async (req, res) => {
    const users = readUsers().map(safeUser);
    send(res, 200, { users });
  }));

  /** PATCH /api/admin/users/:id — edit user */
  addRoute('PATCH', '/api/admin/users/:id', adminGuard(async (req, res, params) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    const userId = params.id;

    const users = readUsers();
    const idx = users.findIndex(u => u.userId === userId);
    if (idx === -1) return send(res, 404, { error: 'User not found.' });

    const user = users[idx];
    const actor = actorOf(req);

    // Editable fields
    if (input.name !== undefined) user.name = input.name;
    if (input.email !== undefined) user.email = input.email;

    if (input.role !== undefined) {
      if (!VALID_USER_ROLES.includes(input.role)) {
        return send(res, 400, { error: `Invalid role. Must be one of: ${VALID_USER_ROLES.join(', ')}` });
      }
      user.role = input.role;
    }

    if (input.status !== undefined) {
      if (!['ACTIVE', 'DISABLED'].includes(input.status)) {
        return send(res, 400, { error: 'Status must be ACTIVE or DISABLED.' });
      }
      // Protect last active admin
      if (input.status === 'DISABLED' && user.role === 'ADMIN') {
        const activeAdmins = users.filter(u => u.role === 'ADMIN' && u.status === 'ACTIVE' && u.userId !== userId);
        if (activeAdmins.length === 0) {
          return send(res, 400, { error: 'Cannot disable the last active administrator.' });
        }
      }
      user.status = input.status;
      // Invalidate sessions for disabled users
      if (input.status === 'DISABLED') invalidateUserSessions(users, userId);
    }

    // Also protect last admin if role change would remove last admin
    if (input.role !== undefined && input.role !== 'ADMIN' && user.role === 'ADMIN') {
      // Re-read the role before the change was applied — we already applied it above
      // but we need to check if there are other admins
      const otherAdmins = users.filter(u => u.role === 'ADMIN' && u.status === 'ACTIVE' && u.userId !== userId);
      if (otherAdmins.length === 0) {
        user.role = 'ADMIN'; // revert
        return send(res, 400, { error: 'Cannot change role of the last active administrator.' });
      }
    }

    user.updatedAt = new Date().toISOString();
    user.updatedBy = actor.userId;
    users[idx] = user;
    writeUsers(users);
    send(res, 200, { user: safeUser(user) });
  }));

  /** PUT /api/admin/users/:id/password — reset password */
  addRoute('PUT', '/api/admin/users/:id/password', adminGuard(async (req, res, params) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    const userId = params.id;

    if (!input.password || input.password.length < 6) {
      return send(res, 400, { error: 'Password must be at least 6 characters.' });
    }

    const users = readUsers();
    const idx = users.findIndex(u => u.userId === userId);
    if (idx === -1) return send(res, 404, { error: 'User not found.' });

    users[idx].passwordHash = await hashPassword(input.password);
    users[idx].updatedAt = new Date().toISOString();
    users[idx].updatedBy = actorOf(req).userId;
    // Invalidate all sessions for this user (force re-login)
    invalidateUserSessions(users, userId);
    writeUsers(users);

    send(res, 200, { ok: true, message: 'Password reset successfully.' });
  }));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  init,
  ensureAdminExists,
  actorOf,
  isAuthenticated,
  isAdmin,
  getToken,
  getSession,
  createSession,
  invalidateSession,
  sessions,
  hashPassword,
  verifyPassword,
  findUserByUsername,
  findUserById,
  safeUser,
  readUsers,
  writeUsers,
  VALID_USER_ROLES,
};

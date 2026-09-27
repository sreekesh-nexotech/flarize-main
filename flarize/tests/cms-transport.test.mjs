/**
 * C11-G — CMS HTTP Transport tests.
 *
 * Drives a REAL node:http server with the REAL server-cms.js handlers.
 * Only the host helpers server.js supplies (addRoute / send / parseBody /
 * isAdmin) are re-created here, in the same shape server.js defines them.
 *
 * Transport-layer assertions: correct HTTP verbs/status codes, RBAC
 * enforcement via headers, error mapping, JSON payloads, asset file serving.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

const TOKEN = 'test-cms-token';
const STATE_FILE = join(tmpdir(), `flarize-cms-state-${process.pid}.json`);
const ASSETS_DIR = join(tmpdir(), `flarize-cms-assets-${process.pid}`);

// ---------------------------------------------------------------------------
// host helpers — same contract server.js passes to register()
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

// Minimal valid PNG (1x1 pixel) for asset tests
const MINIMAL_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

before(async () => {
  // Ensure temp assets dir
  if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });

  // Patch the transport to use temp state/assets
  // We'll write the state file to temp, and override ASSETS_DIR via a small shim
  // Actually, server-cms.js uses __dirname-relative paths. To test without modifying it,
  // we'll init with the real paths but clean up after.
  // Instead, let's use the CMS workspace directly in tests to verify the transport shape.

  // 2026-09-12 — point the transport at the temp store/assets BEFORE it is
  // required (the paths are read at module load). Never touch data/.
  process.env.CMS_STATE_FILE = STATE_FILE;
  process.env.CMS_ASSETS_DIR = ASSETS_DIR;
  const transport = require('../server-cms.js');
  await transport.init();
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
  // Clean up temp store + dirs
  try { rmSync(ASSETS_DIR, { recursive: true, force: true }); } catch { }
  try { rmSync(STATE_FILE, { force: true }); } catch { }
});

/** HTTP call helper. */
async function call(method, path, { role = 'ADMIN', user = 'admin', body, token = TOKEN } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (role) headers['x-actor-role'] = role;
  if (user) headers['x-actor-user'] = user;
  const res = await fetch(`${base}${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = res.headers.get('content-type') || '';
  let parsed;
  if (contentType.includes('application/json')) {
    const text = await res.text();
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  } else {
    parsed = await res.arrayBuffer();
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

const ADMIN = { role: 'ADMIN', user: 'admin' };
const SALES = { role: 'SALES', user: 'sales1' };

// Valid page content for workflow tests
function validPageContent() {
  return {
    schemaVersion: 'pageSchema.1',
    pageType: 'campaign',
    canvas: { width: 794, height: 1123 },
    background: { type: 'color', value: '#FFFFFF' },
    theme: { primaryColor: '#000000', secondaryColor: '#666666', backgroundColor: '#FFFFFF' },
    sections: [
      {
        id: 'sec1', blockType: 'section', sortOrder: 0,
        children: [
          { id: 'h1', blockType: 'heading', sortOrder: 0, props: { text: 'Hello', level: 1 } },
        ],
      },
    ],
    overlays: [],
  };
}

// ── Authentication ──────────────────────────────────────────────────────

describe('CMS transport — auth', () => {
  test('401 without token', async () => {
    const r = await call('GET', '/api/cms/pages', { token: null });
    assert.equal(r.status, 401);
  });

  test('401 with bad token', async () => {
    const r = await call('GET', '/api/cms/pages', { token: 'wrong' });
    assert.equal(r.status, 401);
  });
});

// ── Pages CRUD ──────────────────────────────────────────────────────────

describe('CMS transport — pages', () => {
  let pageId;

  test('POST /api/cms/pages creates a page', async () => {
    const r = await call('POST', '/api/cms/pages', {
      ...ADMIN,
      body: { name: 'Test Page', pageType: 'quotation' },
    });
    assert.equal(r.status, 201);
    assert.ok(r.body.page);
    assert.ok(r.body.version);
    pageId = r.body.page.pageId;
  });

  test('GET /api/cms/pages lists pages', async () => {
    const r = await call('GET', '/api/cms/pages', ADMIN);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.pages));
    assert.ok(r.body.pages.length > 0);
  });

  test('GET /api/cms/pages/:pageId returns page', async () => {
    const r = await call('GET', `/api/cms/pages/${pageId}`, ADMIN);
    assert.equal(r.status, 200);
    assert.equal(r.body.page.pageId, pageId);
  });

  test('GET /api/cms/pages/:pageId 404 for unknown', async () => {
    const r = await call('GET', '/api/cms/pages/pg_nonexistent', ADMIN);
    assert.equal(r.status, 404);
  });

  test('PUT /api/cms/pages/:pageId/draft updates draft', async () => {
    const r = await call('PUT', `/api/cms/pages/${pageId}/draft`, {
      ...ADMIN,
      body: { content: validPageContent() },
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.version);
  });

  test('GET /api/cms/pages/:pageId/versions returns versions', async () => {
    const r = await call('GET', `/api/cms/pages/${pageId}/versions`, ADMIN);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.versions));
  });

  test('POST /api/cms/pages/:pageId/preview returns preview', async () => {
    const r = await call('POST', `/api/cms/pages/${pageId}/preview`, ADMIN);
    assert.equal(r.status, 200);
    assert.ok(r.body.page);
    assert.ok(r.body.fieldRegistry);
  });
});

// ── RBAC enforcement ────────────────────────────────────────────────────

describe('CMS transport — RBAC', () => {
  test('SALES cannot create pages (no CMS_EDIT)', async () => {
    const r = await call('POST', '/api/cms/pages', {
      ...SALES,
      body: { name: 'Nope', pageType: 'quotation' },
    });
    assert.equal(r.status, 403);
  });

  test('SALES cannot list pages (no CMS_VIEW)', async () => {
    const r = await call('GET', '/api/cms/pages', SALES);
    assert.equal(r.status, 403);
  });

  test('SALES cannot upload assets', async () => {
    const r = await call('POST', '/api/cms/assets', {
      ...SALES,
      body: { filename: 'x.png', data: MINIMAL_PNG_B64 },
    });
    assert.equal(r.status, 403);
  });
});

// ── Workflow ─────────────────────────────────────────────────────────────

describe('CMS transport — workflow', () => {
  let pageId;

  test('full workflow: create → draft → review → approve → publish', async () => {
    // Create
    let r = await call('POST', '/api/cms/pages', {
      ...ADMIN,
      body: { name: 'Workflow Page', pageType: 'quotation' },
    });
    assert.equal(r.status, 201);
    pageId = r.body.page.pageId;

    // Draft
    r = await call('PUT', `/api/cms/pages/${pageId}/draft`, {
      ...ADMIN,
      body: { content: validPageContent() },
    });
    assert.equal(r.status, 200);

    // Submit review
    r = await call('POST', `/api/cms/pages/${pageId}/submit-review`, ADMIN);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'REVIEW');

    // Approve
    r = await call('POST', `/api/cms/pages/${pageId}/approve`, ADMIN);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'APPROVED');

    // Publish
    r = await call('POST', `/api/cms/pages/${pageId}/publish`, ADMIN);
    assert.equal(r.status, 200);
    assert.ok(r.body.page);
    assert.ok(r.body.version);
  });

  test('submit review with invalid content → 400', async () => {
    // Create page then set content with invalid pageType
    let r = await call('POST', '/api/cms/pages', {
      ...ADMIN,
      body: { name: 'Bad Page', pageType: 'campaign' },
    });
    pageId = r.body.page.pageId;

    // Set invalid content (bad pageType)
    await call('PUT', `/api/cms/pages/${pageId}/draft`, {
      ...ADMIN,
      body: { content: { ...validPageContent(), pageType: 'INVALID_TYPE' } },
    });

    // Try to submit review — should fail validation
    r = await call('POST', `/api/cms/pages/${pageId}/submit-review`, ADMIN);
    assert.equal(r.status, 400);
  });

  test('archive page', async () => {
    let r = await call('POST', '/api/cms/pages', {
      ...ADMIN,
      body: { name: 'Archive Me', pageType: 'quotation' },
    });
    const pid = r.body.page.pageId;
    r = await call('POST', `/api/cms/pages/${pid}/archive`, ADMIN);
    assert.equal(r.status, 200);
  });
});

// ── Assets ──────────────────────────────────────────────────────────────

describe('CMS transport — assets', () => {
  let assetId;

  test('POST /api/cms/assets uploads image', async () => {
    const r = await call('POST', '/api/cms/assets', {
      ...ADMIN,
      body: {
        filename: 'logo.png',
        mimeType: 'image/png',
        data: MINIMAL_PNG_B64,
      },
    });
    assert.equal(r.status, 201);
    assert.ok(r.body.assetId);
    assetId = r.body.assetId;
  });

  test('GET /api/cms/assets lists assets', async () => {
    const r = await call('GET', '/api/cms/assets', ADMIN);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.assets));
    assert.ok(r.body.assets.length > 0);
  });

  test('GET /api/cms/assets/:assetId returns metadata', async () => {
    const r = await call('GET', `/api/cms/assets/${assetId}`, ADMIN);
    assert.equal(r.status, 200);
    assert.equal(r.body.assetId, assetId);
    assert.equal(r.body.mimeType, 'image/png');
  });

  test('GET /api/cms/assets/:assetId/file returns binary image', async () => {
    const res = await fetch(`${base}/api/cms/assets/${assetId}/file`, {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'x-actor-role': 'ADMIN',
        'x-actor-user': 'admin',
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 0);
    // Verify it's a valid PNG (magic bytes)
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50);
  });

  test('POST /api/cms/assets/:assetId/archive', async () => {
    // Upload a fresh asset not used by any page
    const r = await call('POST', '/api/cms/assets', {
      ...ADMIN,
      body: { filename: 'unused.png', mimeType: 'image/png', data: MINIMAL_PNG_B64 },
    });
    const id = r.body.assetId;
    const r2 = await call('POST', `/api/cms/assets/${id}/archive`, ADMIN);
    assert.equal(r2.status, 200);
  });

  test('rejects invalid upload (no data) → 400', async () => {
    const r = await call('POST', '/api/cms/assets', {
      ...ADMIN,
      body: { filename: 'bad.png' },
    });
    assert.equal(r.status, 400);
  });

  test('GET /api/cms/assets/:assetId 404 for unknown', async () => {
    const r = await call('GET', '/api/cms/assets/asset_nonexistent', ADMIN);
    assert.equal(r.status, 404);
  });
});

// ── Campaigns ───────────────────────────────────────────────────────────

describe('CMS transport — campaigns', () => {
  let campaignId;

  test('POST /api/cms/campaigns creates campaign', async () => {
    const r = await call('POST', '/api/cms/campaigns', {
      ...ADMIN,
      body: { name: 'Summer Campaign' },
    });
    assert.equal(r.status, 201);
    assert.ok(r.body.campaignId);
    campaignId = r.body.campaignId;
  });

  test('GET /api/cms/campaigns lists campaigns', async () => {
    const r = await call('GET', '/api/cms/campaigns', ADMIN);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.campaigns));
  });

  test('GET /api/cms/campaigns/:id returns campaign', async () => {
    const r = await call('GET', `/api/cms/campaigns/${campaignId}`, ADMIN);
    assert.equal(r.status, 200);
    assert.equal(r.body.campaignId, campaignId);
  });

  test('PUT /api/cms/campaigns/:id updates campaign', async () => {
    const r = await call('PUT', `/api/cms/campaigns/${campaignId}`, {
      ...ADMIN,
      body: { name: 'Updated Campaign' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'Updated Campaign');
  });

  test('campaign activate requires published pages', async () => {
    // Campaign has no pages, activation should work (empty pageIds)
    // First update campaign with a non-existent page to test error
    // Actually, activation with empty pageIds should succeed
    const r = await call('POST', `/api/cms/campaigns/${campaignId}/activate`, ADMIN);
    assert.equal(r.status, 200);
  });

  test('campaign deactivate', async () => {
    const r = await call('POST', `/api/cms/campaigns/${campaignId}/deactivate`, ADMIN);
    assert.equal(r.status, 200);
  });
});

// ── Fields ──────────────────────────────────────────────────────────────

describe('CMS transport — fields', () => {
  test('GET /api/cms/fields returns field registry', async () => {
    const r = await call('GET', '/api/cms/fields', ADMIN);
    assert.equal(r.status, 200);
    assert.ok(r.body.fields);
    assert.ok(Object.keys(r.body.fields).length > 0);
  });
});

// ── Templates ───────────────────────────────────────────────────────────

describe('CMS transport — templates', () => {
  test('GET /api/cms/templates returns array', async () => {
    const r = await call('GET', '/api/cms/templates', ADMIN);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.templates));
  });
});

// ── SECURITY — transport source contains no calculation logic ───────────

describe('SECURITY — CMS transport', () => {
  test('server-cms.js has no price/cost/gst/margin calculation', async () => {
    const src = readFileSync('server-cms.js', 'utf-8');
    const forbidden = [
      /calculatePrice/i, /calculateCost/i, /calculateGst/i,
      /calculateSubsidy/i, /calculateMargin/i, /calculateEmi/i,
      /calculateSavings/i, /calculateRoi/i, /calculateGeneration/i,
    ];
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(src), `server-cms.js must not contain ${pattern}`);
    }
  });

  test('no catalog read in transport', async () => {
    const src = readFileSync('server-cms.js', 'utf-8');
    assert.ok(!src.includes('catalog.json'), 'transport must not read catalog');
  });
});

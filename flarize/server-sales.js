// SALES LAYER — HTTP TRANSPORT.  (Phase 1)
//
// Additive. Registers /api/sales/* routes alongside the existing workspace
// and quotation routes. Nothing here modifies or replaces existing modules.
//
// Responsibilities:
//   1. Customer CRUD with persistence (data/customers.json)
//   2. Server-side quotation number generation (sequential, collision-free)
//   3. Quotation history API with search/filter
//   4. Sales-role routing metadata
//
// Authentication: same shared credential as the rest of the server.
// RBAC: validated at the service layer via x-actor-role header, same pattern.
// This file is transport only — no business rule, no calculation.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CUSTOMER_FILE = path.join(__dirname, 'data', 'customers.json');
const COUNTER_FILE = path.join(__dirname, 'data', 'quotation-counter.json');

// Individual sales roles: these see only their own data.
// Mirrors rbac.js INDIVIDUAL_SALES_ROLES without async import.
const INDIVIDUAL_SALES_ROLES = ['SALES', 'SALES_CRS', 'FIELD_SALES'];
function isIndividualSalesRole(role) { return INDIVIDUAL_SALES_ROLES.includes(role); }

// ---------------------------------------------------------------------------
// persistence helpers
// ---------------------------------------------------------------------------

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
}

function saveJson(p, data) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// customer store — in-memory + file persistence
// ---------------------------------------------------------------------------

let customers = [];

function loadCustomers() {
  customers = loadJson(CUSTOMER_FILE, []);
  return customers;
}

function persistCustomers() {
  saveJson(CUSTOMER_FILE, customers);
}

function generateCustomerId() {
  return 'CUST-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

// ---------------------------------------------------------------------------
// quotation number — server-side sequential generation
// ---------------------------------------------------------------------------

let counter = { lastNumber: 0, prefix: 'GR' };

function loadCounter() {
  counter = loadJson(COUNTER_FILE, { lastNumber: 0, prefix: 'GR' });
  return counter;
}

function persistCounter() {
  saveJson(COUNTER_FILE, counter);
}

/**
 * Generate a unique quotation number: GR-YYYYMMDD-NNNN
 * Sequential, server-authoritative, no collision risk.
 */
function nextQuotationNumber() {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  counter.lastNumber += 1;
  const seq = String(counter.lastNumber).padStart(4, '0');
  const qNum = `${counter.prefix}-${dateStr}-${seq}`;
  persistCounter();
  return { quotationNumber: qNum, quotationDate: now.toISOString(), serverTimestamp: now.toISOString() };
}

// ---------------------------------------------------------------------------
// quotation state reader (read-only access to quotation-state.json)
// ---------------------------------------------------------------------------

function readQuotationState() {
  return loadJson(path.join(__dirname, 'data', 'quotation-state.json'), {
    quotations: {}, documents: {}, bomSnapshots: {}, commercialSnapshots: {}, versionStatus: {},
  });
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

function init() {
  loadCustomers();
  loadCounter();

  // Backfill counter from existing quotation numbers to avoid collision
  const qState = readQuotationState();
  const existingQuotations = Object.values(qState.quotations || {});
  for (const q of existingQuotations) {
    const qNum = q.quotationNumber;
    if (qNum && typeof qNum === 'string') {
      const match = qNum.match(/-(\d{4})$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > counter.lastNumber) {
          counter.lastNumber = num;
          persistCounter();
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// route registration
// ---------------------------------------------------------------------------

// actorOf is injected from server-users.js (session-derived, not header-derived).
let _actorOf;
function actorOf(req) {
  if (_actorOf) return _actorOf(req);
  const role = (req.headers || {})['x-actor-role'] || 'ADMIN';
  const userId = (req.headers || {})['x-actor-user'] || 'admin';
  return { userId, role };
}

function register(addRoute, { send, parseBody, isAdmin, isAuthenticated: injectedIsAuthenticated, actorOf: injectedActorOf }) {
  if (injectedActorOf) _actorOf = injectedActorOf;
  // Sales routes need ANY authenticated user, not just admin.
  // isAuthenticated checks session exists; RBAC handles role authorization.
  const _isAuth = injectedIsAuthenticated || isAdmin; // fallback for test harness compat
  const guard = (handler) => async (req, res, params, query) => {
    if (!_isAuth(req)) return send(res, 401, { error: 'Unauthorized' });
    try {
      await handler(req, res, params, query);
    } catch (err) {
      send(res, err.status || 500, { error: err.message, code: err.code || null });
    }
  };

  // ---- customers ----------------------------------------------------------

  // List customers (with optional search)
  // VISIBILITY: individual sales see own customers; SALES_HEAD/ADMIN see all.
  addRoute('GET', '/api/sales/customers', guard(async (req, res, params, query) => {
    const actor = actorOf(req);
    const search = (query?.get?.('q') || query?.get?.('search') || '').toLowerCase().trim();
    let result = customers;

    // Ownership filter: individual sales see only their own customers
    if (actor && isIndividualSalesRole(actor.role)) {
      result = result.filter(c => c.createdBy === actor.userId);
    }

    if (search) {
      result = result.filter(c =>
        (c.name || '').toLowerCase().includes(search) ||
        (c.phone || '').includes(search) ||
        (c.address || '').toLowerCase().includes(search) ||
        (c.pincode || '').includes(search) ||
        (c.customerId || '').toLowerCase().includes(search)
      );
    }
    send(res, 200, { customers: result, total: result.length });
  }));

  // Get single customer
  // VISIBILITY: individual sales can only access own customers.
  addRoute('GET', '/api/sales/customers/:id', guard(async (req, res, params) => {
    const actor = actorOf(req);
    const c = customers.find(c => c.customerId === params.id);
    if (!c) return send(res, 404, { error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
    // Ownership check
    if (actor && isIndividualSalesRole(actor.role) && c.createdBy !== actor.userId) {
      return send(res, 403, { error: 'Access denied', code: 'CUSTOMER_ACCESS_DENIED' });
    }
    send(res, 200, c);
  }));

  // Create customer
  addRoute('POST', '/api/sales/customers', guard(async (req, res) => {
    const body = await parseBody(req);
    if (!body.name || !body.name.trim()) return send(res, 400, { error: 'Customer name is required', code: 'MISSING_NAME' });
    if (!body.phone || !body.phone.trim()) return send(res, 400, { error: 'Phone number is required', code: 'MISSING_PHONE' });

    // Check duplicate by phone
    const existing = customers.find(c => c.phone === body.phone.trim());
    if (existing) return send(res, 409, {
      error: 'Customer with this phone number already exists',
      code: 'CUSTOMER_DUPLICATE',
      existingCustomer: existing,
    });

    const customer = {
      customerId: generateCustomerId(),
      name: body.name.trim(),
      phone: body.phone.trim(),
      email: (body.email || '').trim() || null,
      address: (body.address || '').trim() || null,
      pincode: (body.pincode || '').trim() || null,
      district: (body.district || '').trim() || null,
      state: (body.state || '').trim() || null,
      currentBill: body.currentBill != null ? Number(body.currentBill) : null,
      billCycle: (body.billCycle || '').trim() || null,
      source: body.source || 'SALES_ENTRY',
      createdAt: new Date().toISOString(),
      createdBy: (actorOf(req) || {}).userId || 'unknown',
    };

    customers.push(customer);
    persistCustomers();
    send(res, 201, customer);
  }));

  // Update customer
  // VISIBILITY: individual sales can only update own customers.
  addRoute('PATCH', '/api/sales/customers/:id', guard(async (req, res, params) => {
    const actor = actorOf(req);
    const idx = customers.findIndex(c => c.customerId === params.id);
    if (idx === -1) return send(res, 404, { error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
    // Ownership check: individual sales can only update own customers
    if (actor && isIndividualSalesRole(actor.role) && customers[idx].createdBy !== actor.userId) {
      return send(res, 403, { error: 'Access denied', code: 'CUSTOMER_ACCESS_DENIED' });
    }
    const body = await parseBody(req);
    const updatable = ['name', 'phone', 'email', 'address', 'pincode', 'district', 'state', 'currentBill', 'billCycle', 'source'];
    for (const field of updatable) {
      if (body[field] !== undefined) {
        if (field === 'currentBill') {
          customers[idx][field] = body[field] != null ? Number(body[field]) : null;
        } else {
          customers[idx][field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
        }
      }
    }
    customers[idx].updatedAt = new Date().toISOString();
    customers[idx].updatedBy = (actorOf(req) || {}).userId || 'unknown';
    persistCustomers();
    send(res, 200, customers[idx]);
  }));

  // ---- quotation number ---------------------------------------------------

  // Generate next quotation number (server-authoritative)
  // Only roles with QUOTATION_CREATE capability may generate a number.
  addRoute('POST', '/api/sales/quotation-number', guard(async (req, res) => {
    const actor = actorOf(req);
    const SALES_ROLES = ['SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES', 'ADMIN'];
    if (!actor || !SALES_ROLES.includes(actor.role)) {
      return send(res, 403, { error: 'Quotation number generation requires a sales or admin role', code: 'ROLE_DENIED' });
    }
    const result = nextQuotationNumber();
    send(res, 200, result);
  }));

  // GET alias for next-quotation-number (read-only peek, does not increment)
  addRoute('GET', '/api/sales/next-quotation-number', guard(async (req, res) => {
    const now = new Date();
    const dateStr = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const nextSeq = String(counter.lastNumber + 1).padStart(4, '0');
    send(res, 200, { quotationNumber: `${counter.prefix}-${dateStr}-${nextSeq}` });
  }));

  // ---- quotation history --------------------------------------------------

  // List quotations with search/filter (reads from quotation-state.json)
  // VISIBILITY: individual sales see own quotations; SALES_HEAD/ADMIN see all.
  // Client ?user= / ?userId= params are IGNORED — server derives from session.
  addRoute('GET', '/api/sales/quotation-history', guard(async (req, res, params, query) => {
    const actor = actorOf(req);
    const qState = readQuotationState();
    const allQuotations = Object.values(qState.quotations || {});
    const search = (query?.get?.('q') || '').toLowerCase().trim();
    const statusFilter = (query?.get?.('status') || '').toUpperCase();
    const sourceFilter = (query?.get?.('source') || '').toUpperCase();
    const districtFilter = (query?.get?.('district') || '').toLowerCase();
    const dateFrom = query?.get?.('dateFrom') || '';
    const dateTo = query?.get?.('dateTo') || '';
    // Salesperson filter — ONLY honoured for SALES_HEAD/ADMIN, ignored for individual sales
    const salespersonFilter = (query?.get?.('salesperson') || '').trim();

    // Display names for the salesperson column (never the internal user id).
    const usersById = new Map();
    for (const u of loadJson(path.join(__dirname, 'data', 'users.json'), [])) usersById.set(u.userId, u.name || u.username || u.userId);
    const nameOf = (id) => (id && usersById.get(id)) || null;

    let result = allQuotations.map(q => {
      // Enrich with version count and latest amount
      const docs = qState.documents?.[q.quotationId] || [];
      // Customer total (incl. GST) of the latest ISSUED document — copied from
      // the frozen payload's commercial figures (fixed 2026-09-09: the old
      // lookup read fields that never existed, so the column was always "—").
      let amount = null;
      if (Array.isArray(docs) && docs.length > 0) {
        const latest = docs[docs.length - 1];
        const cust = latest?.payload?.pricing?.customer;
        amount = cust?.customerTotalIncludingGST ?? latest?.pricing?.finalPrice ?? latest?.pricing?.totalPrice ?? latest?.totalAmount ?? null;
      }
      return {
        quotationId: q.quotationId,
        quotationNumber: q.quotationNumber || null,
        projectId: q.projectId || null,
        status: q.status,
        currentVersion: q.currentVersion || null,
        versionCount: Array.isArray(docs) ? docs.length : 0,
        amount,
        customer: q.customer ? {
          customerId: q.customer.customerId || null,
          name: q.customer.customerName || q.customer.name || null,
          phone: q.customer.phone || null,
        } : null,
        system: q.system ? {
          systemType: q.system.systemType || null,
          systemSizeKw: q.system.systemSizeKw || null,
          phase: q.system.phase || null,
          packageTier: q.system.packageTier || null,
        } : null,
        quotationDate: q.quotationDate || q.createdAt || null,
        createdAt: q.createdAt || null,
        createdBy: q.createdBy || null,
        proposalBy: q.proposalBy || null,
        validUntil: q.validUntil || null,
        quotationSource: q.quotationSource || 'DIRECT',
        district: q.district || null,
        affiliateId: q.affiliateId || null,
        salespersonId: q.salespersonId || null,
        salespersonName: nameOf(q.salespersonId) || nameOf(q.createdBy) || q.proposalBy || null,
      };
    });

    // OWNERSHIP FILTER: individual sales see only own quotations
    if (actor && isIndividualSalesRole(actor.role)) {
      result = result.filter(q =>
        q.salespersonId === actor.userId ||
        q.createdBy === actor.userId
      );
    }

    // Salesperson filter — server-enforced: only SALES_HEAD/ADMIN may use it
    if (salespersonFilter && actor && !isIndividualSalesRole(actor.role)) {
      result = result.filter(q =>
        q.salespersonId === salespersonFilter || q.createdBy === salespersonFilter
      );
    }

    // Apply search/status/source/district filters
    if (search) {
      result = result.filter(q =>
        (q.quotationNumber || '').toLowerCase().includes(search) ||
        (q.customer?.name || '').toLowerCase().includes(search) ||
        (q.customer?.phone || '').includes(search) ||
        (q.quotationId || '').toLowerCase().includes(search)
      );
    }
    if (statusFilter) {
      result = result.filter(q => q.status === statusFilter);
    }
    if (sourceFilter) {
      result = result.filter(q => q.quotationSource === sourceFilter);
    }
    if (districtFilter) {
      result = result.filter(q => (q.district || '').toLowerCase().includes(districtFilter));
    }
    // Date range filter
    if (dateFrom) {
      result = result.filter(q => (q.quotationDate || q.createdAt || '') >= dateFrom);
    }
    if (dateTo) {
      // Include the entire 'to' day
      const toEnd = dateTo.length === 10 ? dateTo + 'T23:59:59.999Z' : dateTo;
      result = result.filter(q => (q.quotationDate || q.createdAt || '') <= toEnd);
    }

    // Sort newest first
    result.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    send(res, 200, { quotations: result, total: result.length });
  }));

  // ---- system configuration metadata -------------------------------------

  // Return valid system configurations from catalog
  addRoute('GET', '/api/sales/system-options', guard(async (req, res) => {
    // 2026-09-08 — sizes, tiers, future-ready pairs and battery options come from
    // the APPROVED pack configuration (Project Head authored, Admin approved);
    // a new kW appears here the moment its config version is approved.
    const bomBuilder = require('./server-bom-builder.js');
    const catalog = bomBuilder.loadCatalog('approved');
    const templates = catalog.bomTemplates || {};
    const profiles = catalog.packageProfiles || {};
    const frPairs = catalog.futureUpgrade?.pairs || [];

    const options = {};
    for (const [sysType, tmpl] of Object.entries(templates)) {
      if (sysType === 'upgrade') continue; // Upgrade not in Phase 1 sales flow
      const sizes = tmpl.sizes || {};
      const tiers = tmpl.tiers || ['base', 'value', 'premium'];
      const threePhase = tmpl.threePhase || [];
      const phaseOf = (k) => threePhase.includes(String(k)) ? '3P' : '1P';
      options[sysType] = {
        label: sysType === 'ongrid' ? 'On-Grid' : sysType === 'hybrid' ? 'Hybrid' : sysType,
        sizes: Object.entries(sizes).map(([key, label]) => ({
          key,
          label,
          phase: phaseOf(key),
          isThreePhase: threePhase.includes(key),
          // Future Ready: panels at this size, inverter/structure/DB/cables at systemSize (same phase).
          futureReady: frPairs
            .filter(p => (p.systemType || sysType) === sysType && String(p.panelSize) === String(key) && sizes[String(p.systemSize)] && phaseOf(p.systemSize) === phaseOf(key))
            .map(p => ({ systemSize: String(p.systemSize), label: `${label} panels · ${sizes[String(p.systemSize)]} system` })),
        })),
        tiers,
        batteryOptions: sysType === 'hybrid' ? (Array.isArray(tmpl.batteryConfigs) ? tmpl.batteryConfigs.map(Number) : [0, 1, 2]) : [0],
      };
    }

    // Profile summaries for each tier
    const profileSummaries = {};
    for (const [key, profile] of Object.entries(profiles)) {
      profileSummaries[key] = {
        label: profile.label || key,
        structureType: profile.structureType || null,
        inverterType: profile.inverterType || null,
        batteryIncluded: profile.batteryIncluded || false,
        batteryQuantity: profile.batteryQuantity || 0,
      };
    }

    // Site options come from configured cost data, never a hardcoded list:
    //   installationTypes — distinct installationType values in
    //                       cost-config.installation.rates (exact-match matrix, §15)
    //   vehicleTypes      — ACTIVE TRANSPORT_VEHICLE_RATE records on the PH rate
    //                       card, plus cost-config vehicles (names only — rates
    //                       are never sent to Sales) (§16)
    const costConfig = loadJson(path.join(__dirname, 'data', 'cost-config.json'), {});
    const installationTypes = [...new Set((costConfig.installation?.rates || []).map(r => r.installationType).filter(Boolean))];
    const rateCardFile = loadJson(path.join(__dirname, 'data', 'project-rate-card.json'), null);
    const vehicleMap = new Map();
    for (const v of (costConfig.transportation?.vehicles || [])) {
      if (v?.vehicleType && (v.status || 'ACTIVE') === 'ACTIVE') vehicleMap.set(v.vehicleType, { vehicleType: v.vehicleType, vehicleName: v.vehicleName || v.vehicleType, source: 'COST_CONFIG' });
    }
    const records = rateCardFile?.store?.records || {};
    for (const [key, versions] of Object.entries(records)) {
      if (!key.startsWith('TRANSPORT_VEHICLE_RATE::')) continue;
      const active = (versions || []).find(r => r.status === 'ACTIVE');
      if (!active) continue;
      const vt = active.value?.vehicleType || active.recordId;
      vehicleMap.set(vt, { vehicleType: vt, vehicleName: active.value?.vehicleName || vt, source: 'PROJECT_HEAD_RATE_CARD' });
    }
    // Pack-config transport table (owner rule: base km included, extra km as a customer extra).
    const tc = catalog.transportConfig || {};
    const packVehicles = (tc.vehicles || []).map(v => ({ vehicleType: v.vehicleType, vehicleName: v.vehicleName || v.vehicleType, source: 'PACK_CONFIG' }));
    // In pack market-rate mode the Project Head transport table IS the vehicle
    // list (transport extra = km × its rate); the cost-config / rate-card
    // vehicles only apply to the landed-cost pricing mode.
    const packMode = catalog.pricing?.mode === 'PACK_MARKET_RATE' && packVehicles.length > 0;
    if (packMode) vehicleMap.clear();
    for (const v of packVehicles) vehicleMap.set(v.vehicleType, v);
    const roofTypes = ['FLAT', 'SHEET', 'ELEVATED'].filter(r => Object.values(catalog.installationMatrix || {}).some(row => row && row[r.toLowerCase()] != null));
    const siteOptions = {
      installationTypes: roofTypes.length ? roofTypes : installationTypes,
      roofTypes,
      vehicleTypes: [...vehicleMap.values()],
      transport: { includedKm: tc.baseDistanceKm ?? null, pricingMode: catalog.pricing?.mode ?? null, note: 'Distance beyond the included km is quoted to the customer as a separate extra.' },
      subsidyTypes: [{ key: 'residential', label: 'Residential (PM Surya Ghar)' }, { key: 'ghs', label: 'Group housing (GHS / RWA)' }, { key: 'none', label: 'No subsidy' }],
      packConfigVersion: (() => { try { return require('./server-pack-config.js').approvedVersion(); } catch { return null; } })(),
    };

    send(res, 200, { options, profiles: profileSummaries, siteOptions, availableRoofTypes: siteOptions.installationTypes });
  }));

  // ---- BOM preview (server-side resolution) --------------------------------

  addRoute('POST', '/api/sales/bom-preview', guard(async (req, res) => {
    const actor = actorOf(req);
    const BOM_VIEW_ROLES = ['SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES', 'ADMIN', 'PROJECT_HEAD', 'ENGINEERING', 'PROCUREMENT'];
    if (!actor || !BOM_VIEW_ROLES.includes(actor.role)) {
      return send(res, 403, { error: 'BOM preview requires an authorised role', code: 'ROLE_DENIED' });
    }
    const body = await parseBody(req);
    if (!body.systemType) return send(res, 400, { error: 'systemType required' });
    if (!body.size) return send(res, 400, { error: 'size required' });
    try {
      const bomBuilder = require('./server-bom-builder.js');
      // B.6 (locked 2.3, 2026-09-05) — accept project-level batteryQuantity
      // (0/1/2) from Project Head. Sales callers may pass through what the
      // Project Head selected; the value is validated in buildBom and only
      // applies to hybrid systems.
      const isSales = bomBuilder.isSalesRole(actor.role);
      // Sales always previews the APPROVED configuration; PH/Admin may ask for the draft.
      const configSource = (!isSales && body.configSource === 'draft') ? 'draft' : 'approved';
      const allBoms = bomBuilder.buildAllTierBoms({
        systemType: body.systemType,
        size: body.size,
        phase: body.phase || null,
        tierSelections: body.tierSelections || {},
        actorRole: actor.role,
        configSource,
        futureSystemSize: body.futureSystemSize || null,
        batteryQuantity: (body.batteryQuantity === 0 || body.batteryQuantity === 1 || body.batteryQuantity === 2)
          ? body.batteryQuantity : null,
      });
      // Structure by roof type (owner rule: structure pack follows the roof, never a Sales pick).
      const roof = body.roofType ? String(body.roofType).toUpperCase() : null;
      if (roof) {
        const PP = await import('./src/lib/packPricing.js');
        const PC = await import('./src/lib/packConfig.js');
        const cfg = bomBuilder.loadCatalog(configSource);
        for (const tier of Object.keys(allBoms)) {
          const b = allBoms[tier];
          const kw = PP.kwOf(b.systemConfig?.systemSize || body.size);
          const sm = PP.structureMaterial((cfg.structureTemplates || {})[PC.ROOF_TO_STRUCTURE_KEY[roof]], kw, PP.tubeRateFor(cfg.costs, tier));
          b.structure = { roofType: roof, kw, lines: sm.lines.map(l => ({ ...l, category: 'structure', isStructure: true })), total: sm.total };
        }
      }
      // Strip cost/procurement fields for Sales roles
      if (isSales) {
        for (const tier of Object.keys(allBoms)) {
          allBoms[tier].lines = bomBuilder.stripCostFieldsForSales(allBoms[tier].lines).map(l => { const { defaultUnitPrice, alternatives, ...rest } = l; return rest; });
          if (allBoms[tier].structure) allBoms[tier].structure = { roofType: roof, lines: allBoms[tier].structure.lines.map(({ name, qty, type }) => ({ name, qty, type })) };
          // Remove totals — Sales should not see material cost breakdown
          delete allBoms[tier].totals;
        }
      }
      send(res, 200, { boms: allBoms, configSource });
    } catch (err) {
      send(res, 400, { error: err.message, code: 'BOM_BUILD_FAILED' });
    }
  }));

  // ---- price preview (owner's pack formula, server-side) --------------------
  // POST { systemType, size, tier, phase?, roofType, distanceKm, vehicleType?,
  //        batteryQuantity?, futureSystemSize?, selections?, configSource? }
  // Sales receives the customer-facing figures only; PH / Admin also get the
  // internal reference cost + margin-vs-market check. Nothing is issued.
  addRoute('POST', '/api/sales/price-preview', guard(async (req, res) => {
    const actor = actorOf(req);
    const ROLES_OK = ['SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES', 'ADMIN', 'PROJECT_HEAD', 'ENGINEERING'];
    if (!actor || !ROLES_OK.includes(actor.role)) return send(res, 403, { error: 'Price preview requires an authorised role', code: 'ROLE_DENIED' });
    const body = await parseBody(req);
    for (const f of ['systemType', 'size', 'tier', 'roofType']) if (!body[f]) return send(res, 400, { error: `${f} required`, code: 'MISSING_INPUT' });
    if (body.distanceKm == null || !Number.isFinite(Number(body.distanceKm)) || Number(body.distanceKm) < 0) return send(res, 400, { error: 'distanceKm required (one-way km, ≥ 0)', code: 'MISSING_INPUT' });
    try {
      const bomBuilder = require('./server-bom-builder.js');
      const PP = await import('./src/lib/packPricing.js');
      const isSales = bomBuilder.isSalesRole(actor.role);
      const configSource = (!isSales && body.configSource === 'draft') ? 'draft' : 'approved';
      const bom = bomBuilder.buildBom({
        systemType: body.systemType, size: body.size, tier: body.tier, phase: body.phase || null,
        selections: body.selections || {}, actorRole: actor.role, configSource,
        futureSystemSize: body.futureSystemSize || null,
        batteryQuantity: (body.batteryQuantity === 0 || body.batteryQuantity === 1 || body.batteryQuantity === 2) ? body.batteryQuantity : null,
      });
      const cfg = bomBuilder.loadCatalog(configSource);
      const priced = PP.pricePack({
        config: cfg, systemType: body.systemType, size: body.size, tier: body.tier,
        roofType: body.roofType, distanceKm: Number(body.distanceKm), vehicleType: body.vehicleType || null,
        batteryConfig: bom.systemConfig?.batteryQuantity ?? 0, futureSystemSize: body.futureSystemSize || null,
        lines: bom.lines,
      });
      if (priced.status !== 'COMPLETE') return send(res, 422, { error: priced.errors.map(e => e.message).join(' | '), code: priced.errors[0]?.code || 'PRICING_BLOCKED', detail: { errors: priced.errors, owner: 'PROJECT_HEAD' } });
      // Subsidy ESTIMATE for the price panel — same engine and config the
      // issuance freezes, panel DCR status from the materialised BOM's panel
      // line (catalog item), never assumed. The issued document re-resolves it
      // from the locked BOM; this preview is informational.
      let subsidy = null;
      try {
        const subsidyType = body.subsidyType == null ? 'residential' : String(body.subsidyType);
        const SE = await import('./src/lib/subsidyEngine.js');
        const subsidyConfig = loadJson(path.join(__dirname, 'data', 'subsidy-config.json'), null);
        const panelLine = (bom.lines || []).find(l => l.category === 'panel');
        const panelItem = panelLine ? (cfg.categories?.panel?.items || []).find(i => i.id === panelLine.componentId) : null;
        const panelType = panelItem ? (panelItem.panelType === 'NON_DCR' || panelItem.dcr === false ? 'non-DCR' : (panelItem.dcr === true || panelItem.panelType === 'DCR' ? 'DCR' : null)) : null;
        const r = (subsidyType === 'none') ? { available: false, eligibilityStatus: 'NOT_QUOTED', totalSubsidy: 0, status: 'NOT_QUOTED' }
          : panelType == null ? { available: false, eligibilityStatus: null, totalSubsidy: null, status: 'INVALID_INPUT', reason: 'Panel DCR status unknown' }
          : SE.calculateSubsidy({ systemSizeKw: PP.kwOf(body.size), subsidyType, ghsHouses: body.ghsHouses ?? 1, panelType, connectionType: body.connectionType || 'domestic', subsidyConfig });
        subsidy = { estimate: true, subsidyType, panelType, available: r.available ?? false, eligibilityStatus: r.eligibilityStatus ?? null, totalSubsidy: r.totalSubsidy ?? null, schemeName: r.schemeName ?? null, reason: r.reason ?? null };
      } catch (e) { subsidy = { estimate: true, available: false, error: e.message }; }
      // Validity from the effective policy (Admin / PH owned); null when not configured.
      let validity = null;
      try {
        const QP = await import('./src/lib/quotationPolicy.js');
        const v = QP.resolveEffectiveValidity(loadJson(path.join(__dirname, 'data', 'quotation-policy.json'), null), null, body.at || new Date().toISOString());
        validity = { validityDays: v.validityDays, validUntil: v.validUntil, source: v.source };
      } catch (e) { validity = { validityDays: null, validUntil: null, source: null, reason: e.code || e.message }; }
      const netPayable = subsidy?.available && Number.isFinite(subsidy.totalSubsidy) ? priced.customer.customerTotalIncludingGST - subsidy.totalSubsidy : priced.customer.customerTotalIncludingGST;
      const out = {
        configSource, packConfigVersion: (() => { try { return require('./server-pack-config.js').approvedVersion(); } catch { return null; } })(),
        marketRateKey: priced.marketRateKey, inputs: priced.inputs, gst: priced.gst, customer: { ...priced.customer, netPayableAfterSubsidy: netPayable },
        subsidy, validity,
        swaps: priced.swapDeltas.map(d => ({ category: d.category, selectedName: d.selectedName, defaultName: d.defaultName, diff: d.diff })),
        engineering: bom.engineering,
      };
      if (!isSales) { out.internal = priced.internal; out.roofAddOnDetail = priced.roofAddOnDetail; out.structureMaterial = priced.structureMaterial; out.swapDetail = priced.swapDeltas; }
      send(res, 200, out);
    } catch (err) {
      const code = err.code || 'PRICE_PREVIEW_FAILED';
      send(res, code === 'SELECTION_NOT_PERMITTED' || code === 'SELECTION_NOT_APPROVED' ? 422 : 400, { error: err.message, code, detail: err.detail ?? null });
    }
  }));

  // ---- component alternatives (for sales selection) -------------------------

  addRoute('GET', '/api/sales/component-alternatives', guard(async (req, res, params, query) => {
    const actor = actorOf(req);
    const BOM_VIEW_ROLES = ['SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES', 'ADMIN', 'PROJECT_HEAD', 'ENGINEERING', 'PROCUREMENT'];
    if (!actor || !BOM_VIEW_ROLES.includes(actor.role)) {
      return send(res, 403, { error: 'Component alternatives requires an authorised role', code: 'ROLE_DENIED' });
    }
    const systemType = query?.get?.('systemType');
    const size = query?.get?.('size');
    const tier = query?.get?.('tier');
    const category = query?.get?.('category') || undefined;
    if (!systemType) return send(res, 400, { error: 'systemType required' });
    if (!size) return send(res, 400, { error: 'size required' });
    if (!tier) return send(res, 400, { error: 'tier required' });
    try {
      const bomBuilder = require('./server-bom-builder.js');
      const bq = query?.get?.('batteryQuantity');
      const result = bomBuilder.getAlternatives({
        systemType,
        size,
        tier,
        phase: query?.get?.('phase') || undefined,
        category,
        actorRole: actor.role,
        // 2026-09-08 pack facts: future-ready system size and battery count
        futureSystemSize: query?.get?.('futureSystemSize') || null,
        batteryQuantity: bq === '0' || bq === '1' || bq === '2' ? Number(bq) : null,
      });
      send(res, 200, result);
    } catch (err) {
      send(res, 400, { error: err.message, code: 'ALTERNATIVES_FAILED' });
    }
  }));

  // ---- salesperson list (for SALES_HEAD/ADMIN filters) --------------------

  addRoute('GET', '/api/sales/salespersons', guard(async (req, res) => {
    const actor = actorOf(req);
    // Only SALES_HEAD/ADMIN get the list; individual sales get empty
    if (actor && isIndividualSalesRole(actor.role)) {
      return send(res, 200, { salespersons: [] });
    }
    // Read users file and return sales-role users
    const usersFile = path.join(__dirname, 'data', 'users.json');
    const allUsers = loadJson(usersFile, []);
    const salesRoles = ['SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES'];
    const salespersons = allUsers
      .filter(u => salesRoles.includes(u.role) && u.status !== 'DISABLED')
      .map(u => ({ userId: u.userId, username: u.username, name: u.name || u.username, role: u.role }));
    send(res, 200, { salespersons });
  }));

  // ---- district list (for filter dropdowns) --------------------------------

  addRoute('GET', '/api/sales/districts', guard(async (req, res) => {
    const qState = readQuotationState();
    const allQuotations = Object.values(qState.quotations || {});
    const districts = [...new Set(
      allQuotations.map(q => q.district).filter(Boolean)
    )].sort();
    send(res, 200, { districts });
  }));

  // ---- quotation version detail (for history panel) -----------------------

  addRoute('GET', '/api/sales/quotation-versions/:id', guard(async (req, res, params) => {
    const actor = actorOf(req);
    const qState = readQuotationState();
    const q = qState.quotations?.[params.id];
    if (!q) return send(res, 404, { error: 'Quotation not found' });

    // Ownership check
    if (actor && isIndividualSalesRole(actor.role)) {
      if (q.salespersonId !== actor.userId && q.createdBy !== actor.userId) {
        return send(res, 403, { error: 'Access denied' });
      }
    }

    const docs = qState.documents?.[params.id] || [];
    const versionStatuses = qState.versionStatus?.[params.id] || {};
    const versions = docs.map((doc, idx) => ({
      version: idx + 1,
      status: versionStatuses[idx + 1] || (doc?.issued ? 'ISSUED' : 'DRAFT'),
      quotationNumber: doc?.quotationNumber || q.quotationNumber || null,
      amount: doc?.pricing?.finalPrice ?? doc?.pricing?.totalPrice ?? doc?.totalAmount ?? null,
      customer: q.customer ? { name: q.customer.customerName || q.customer.name || null } : null,
      system: q.system || null,
      quotationSource: q.quotationSource || 'DIRECT',
      district: q.district || null,
      createdAt: doc?.issuedAt || doc?.createdAt || q.createdAt || null,
      createdBy: doc?.issuedBy || doc?.createdBy || q.createdBy || null,
    }));

    send(res, 200, {
      quotationId: params.id,
      quotationNumber: q.quotationNumber,
      status: q.status,
      currentVersion: q.currentVersion,
      customer: q.customer,
      system: q.system,
      versions,
    });
  }));

  // ---- tier display names (Phase 2 · P2-C1) --------------------------------
  // Read-only presentation config for the Sales Wizard.
  // Serves the authoritative data/tier-display-names.json for browsers.
  // Same file server-quotation.js already consumes at issue time.
  // No engine, no computation, no fabrication — returns null when file absent.
  addRoute('GET', '/api/sales/tier-display-names', guard(async (req, res) => {
    const raw = loadJson(path.join(__dirname, 'data', 'tier-display-names.json'), null);
    if (!raw || typeof raw !== 'object') {
      return send(res, 200, { available: false, source: 'BUSINESS_DECISION_C6', names: null, recommendedTier: null, recommendedBadge: null });
    }
    // Strip metadata keys (leading _) — same normalisation as server-quotation.js loadTierDisplayNames.
    const names = {};
    let recommendedTier = null;
    let recommendedBadge = null;
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith('_') || typeof v !== 'string') continue;
      if (k === 'recommendedTier') recommendedTier = v;
      else if (k === 'recommendedBadge') recommendedBadge = v;
      else names[k] = v;
    }
    send(res, 200, {
      available: Object.keys(names).length > 0,
      source: 'BUSINESS_DECISION_C6',
      names,
      recommendedTier,
      recommendedBadge,
    });
  }));

  // ---- sales session metadata ---------------------------------------------

  addRoute('GET', '/api/sales/session', guard(async (req, res) => {
    const actor = actorOf(req);
    const role = actor ? actor.role : null;
    const SALES_ROLES = ['SALES', 'SALES_HEAD', 'SALES_CRS', 'FIELD_SALES'];
    const isSalesRole = SALES_ROLES.includes(role);
    // Return actual RBAC capabilities from the capability matrix (loaded by workspace layer)
    // rather than a hardcoded subset. The matrix is the single authority.
    let capabilities = [];
    try {
      // Attempt dynamic import for capability resolution
      const rbac = require('./src/lib/rbac.js');
      // If CJS require fails for ESM module, use hardcoded sales caps as fallback
      if (rbac && rbac.capabilitiesOf) capabilities = rbac.capabilitiesOf(role);
    } catch {
      // ESM module — use known capability list from rbac.js (must match CAPABILITY_MATRIX)
      // This is a read-only reflection, not a grant. The service boundary is the real check.
      if (isSalesRole) {
        capabilities = ['PROJECT_VIEW', 'BOM_VIEW', 'PRICING_VIEW', 'DISCOUNT_REQUEST', 'QUOTATION_CREATE'];
        if (role === 'SALES_HEAD') capabilities.push('MARGIN_APPROVE');
      } else if (role === 'ADMIN') {
        capabilities = ['PROJECT_VIEW', 'BOM_VIEW', 'BOM_RUN_CHECKER', 'COST_VIEW', 'PRICING_VIEW',
          'COMMERCIAL_CONFIG_EDIT', 'COMMERCIAL_HISTORY_VIEW', 'CMS_VIEW', 'CMS_EDIT', 'CMS_PUBLISH',
          'CMS_ASSET_MANAGE', 'QUOTATION_CREATE'];
      }
    }
    send(res, 200, {
      role,
      isSalesRole,
      userId: actor ? actor.userId : null,
      capabilities,
      ui: isSalesRole ? 'SALES_WIZARD' : 'ADMIN',
    });
  }));
}

module.exports = { init, register };

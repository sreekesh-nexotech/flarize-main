// COMPANY PROFILE — HTTP TRANSPORT.
//
// Additive. Registers /api/admin/company-profile and /api/sales/company-profile.
// Admin can read+write; sales can only read (for quotation display).
//
// RBAC:
//   Admin: full read/write
//   Sales: read-only (non-sensitive subset for quotation rendering)
//
// Data authority: ADMIN_CONTROLLED
// File: data/company-profile.json

const fs = require('fs');
const path = require('path');

const PROFILE_FILE = path.join(__dirname, 'data', 'company-profile.json');

function loadProfile() {
  try {
    const raw = fs.readFileSync(PROFILE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed || null;
  } catch { return null; }
}

function saveProfile(profile) {
  const dir = path.dirname(PROFILE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2), 'utf-8');
}

/**
 * Validate company profile fields. Returns { valid, errors }.
 */
function validateProfile(body) {
  const errors = [];

  // GSTIN validation (optional but if provided, must be 15 chars)
  if (body.gstin && typeof body.gstin === 'string' && body.gstin.trim().length > 0) {
    const gstin = body.gstin.trim();
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]$/.test(gstin)) {
      errors.push('GSTIN must be a valid 15-character GST Identification Number');
    }
  }

  // Phone validation (optional, 10-digit Indian mobile)
  if (body.phone && typeof body.phone === 'string' && body.phone.trim().length > 0) {
    const phone = body.phone.trim().replace(/[\s-]/g, '');
    if (!/^[6-9]\d{9}$/.test(phone)) {
      errors.push('Phone must be a valid 10-digit Indian mobile number');
    }
  }

  // Email validation (basic)
  if (body.email && typeof body.email === 'string' && body.email.trim().length > 0) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      errors.push('Email must be a valid email address');
    }
  }

  // IFSC validation (optional, 11 chars)
  if (body.bankIfsc && typeof body.bankIfsc === 'string' && body.bankIfsc.trim().length > 0) {
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(body.bankIfsc.trim())) {
      errors.push('IFSC must be a valid 11-character bank IFSC code');
    }
  }

  // Pincode validation (optional, 6-digit)
  if (body.pincode && typeof body.pincode === 'string' && body.pincode.trim().length > 0) {
    if (!/^[1-9]\d{5}$/.test(body.pincode.trim())) {
      errors.push('Pincode must be a valid 6-digit Indian pincode');
    }
  }

  // completedInstallations validation (optional, non-negative integer)
  // Additive V4 quotation-finalization Phase 2C: the authoritative source
  // for the "N homes installed" company metric that appears on the customer
  // quotation. Never invented, never defaulted — Admin sets it explicitly.
  if (body.completedInstallations != null && body.completedInstallations !== '') {
    const n = Number(body.completedInstallations);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      errors.push('completedInstallations must be a non-negative integer or null');
    }
  }

  // yearsExperience validation (optional, non-negative integer) — page-4
  // "N+ Years Industry Experience" stat. Never defaulted.
  if (body.yearsExperience != null && body.yearsExperience !== '') {
    const n = Number(body.yearsExperience);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      errors.push('yearsExperience must be a non-negative integer or null');
    }
  }

  // mnreEmpanelled validation (optional, strict boolean)
  // Additive V4 quotation-finalization Phase 2B: authoritative company
  // credential for the Page 1 "MNRE Empanelled — Government certified" trust
  // badge. Never inferred. Admin sets it explicitly to true / false / null
  // (null = not stated → badge suppressed; false = explicitly not empanelled →
  // badge suppressed). No hardcoded credential claim in the renderer.
  if (body.mnreEmpanelled != null && body.mnreEmpanelled !== '') {
    if (typeof body.mnreEmpanelled !== 'boolean') {
      errors.push('mnreEmpanelled must be a boolean or null');
    }
  }

  // ── C7 IDENTITY FOUNDATION (2026-09-04) ─────────────────────────────────
  // Additive extension. Business decision locked:
  //   brandName        = customer-facing brand (e.g. "FLARIZE")
  //   parentBrandLine  = parent/backing wording (e.g. "Backed by Golden Ray")
  // Legal identity remains in legalName. These fields never override legalName;
  // they are separate, semantic fields consumed by the renderer.
  if (body.brandName != null && body.brandName !== '' && typeof body.brandName !== 'string') {
    errors.push('brandName must be a string or null');
  }
  if (body.parentBrandLine != null && body.parentBrandLine !== '' && typeof body.parentBrandLine !== 'string') {
    errors.push('parentBrandLine must be a string or null');
  }

  // C7 payment extension — UPI + branch. Bank account fields remain in the
  // existing bank* slots and stay null until Finance supplies the receiving
  // account. NEVER auto-populate from historical artwork. IFSC still governs
  // the bank identity check; branch is display-only.
  if (body.bankBranch != null && body.bankBranch !== '' && typeof body.bankBranch !== 'string') {
    errors.push('bankBranch must be a string or null');
  }
  if (body.upiId != null && body.upiId !== '' && typeof body.upiId !== 'string') {
    errors.push('upiId must be a string or null');
  }

  // C7 CMS asset references — signature / seal / UPI QR. Asset IDs are opaque
  // strings owned by the CMS asset manager; imageUri fields hold the resolved
  // /api/cms/assets/<id> path or an external URL. Renderer must survive nulls.
  for (const f of ['signatureAssetId', 'signatureImageUri', 'sealAssetId',
                    'sealImageUri', 'upiQrAssetId', 'upiQrImageUri']) {
    if (body[f] != null && body[f] !== '' && typeof body[f] !== 'string') {
      errors.push(`${f} must be a string or null`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sanitise and structure the profile from raw body.
 */
function buildProfile(body, existing) {
  const str = (v) => (v && typeof v === 'string' ? v.trim() : null) || null;
  // completedInstallations: coerce to integer if provided; otherwise carry
  // forward the existing value; null means "not set" — the renderer will
  // block the badge rather than fabricate a number.
  let ci = null;
  if (body.completedInstallations != null && body.completedInstallations !== '') {
    const n = Number(body.completedInstallations);
    if (Number.isFinite(n) && Number.isInteger(n) && n >= 0) ci = n;
  } else if (existing && Object.prototype.hasOwnProperty.call(existing, 'completedInstallations')
             && existing.completedInstallations != null) {
    ci = existing.completedInstallations;
  }
  let ye = null;
  if (body.yearsExperience != null && body.yearsExperience !== '') {
    const n = Number(body.yearsExperience);
    if (Number.isFinite(n) && Number.isInteger(n) && n >= 0) ye = n;
  } else if (existing && existing.yearsExperience != null) {
    ye = existing.yearsExperience;
  }
  // mnreEmpanelled: coerce to strict boolean when explicitly provided; carry
  // forward existing value when body omits the field; otherwise null (not
  // stated → renderer suppresses the badge).
  let mnre = null;
  if (body.mnreEmpanelled === true || body.mnreEmpanelled === false) {
    mnre = body.mnreEmpanelled;
  } else if (existing && Object.prototype.hasOwnProperty.call(existing, 'mnreEmpanelled')
             && (existing.mnreEmpanelled === true || existing.mnreEmpanelled === false)) {
    mnre = existing.mnreEmpanelled;
  }
  return {
    // Company identity
    legalName: str(body.legalName),
    displayName: str(body.displayName),
    // C7 IDENTITY FOUNDATION (2026-09-04) — customer-facing brand + parent
    // backing wording, kept semantically SEPARATE from legalName so the
    // renderer can display "FLARIZE" while the legal issuer / T&C / warranty
    // / payment entity stays "FLARIZE TECHNOLOGIES PRIVATE LIMITED".
    brandName: str(body.brandName),
    parentBrandLine: str(body.parentBrandLine),
    gstin: str(body.gstin),
    companyRegistration: str(body.companyRegistration),

    // Contact
    address: str(body.address),
    city: str(body.city),
    state: str(body.state),
    pincode: str(body.pincode),
    phone: str(body.phone),
    email: str(body.email),
    website: str(body.website),

    // Payment
    bankName: str(body.bankName),
    bankAccountName: str(body.bankAccountName),
    bankAccountNumber: str(body.bankAccountNumber),
    bankIfsc: str(body.bankIfsc),
    // C7 extension — bank branch (display only) + UPI receiving details.
    // All remain null until Finance supplies real Flarize account data.
    // Historical Golden Ray LLP values are NEVER auto-populated here.
    bankBranch: str(body.bankBranch),
    upiId: str(body.upiId),
    upiQrAssetId: str(body.upiQrAssetId),
    upiQrImageUri: str(body.upiQrImageUri),
    paymentInstructions: str(body.paymentInstructions),

    // C7 CMS asset references — signature + company seal images used by
    // the renderer's dynamic sections. Uploaded via existing CMS asset
    // manager; identity is opaque assetId, resolved path in imageUri.
    signatureAssetId: str(body.signatureAssetId),
    signatureImageUri: str(body.signatureImageUri),
    sealAssetId: str(body.sealAssetId),
    sealImageUri: str(body.sealImageUri),

    // V4 quotation-finalization Phase 2C — authoritative company metric.
    // Integer count of completed installations. Never invented. Displayed
    // on Page 4/Page 12 trust badges as governed by the approved artwork.
    completedInstallations: ci,
    // 2026-09-09 — years of industry experience (page-4 stat). Integer | null.
    yearsExperience: ye,

    // V4 Phase 2B — authoritative MNRE empanelment credential for the Page 1
    // "MNRE Empanelled" trust badge. Boolean | null. Never inferred.
    mnreEmpanelled: mnre,

    // Metadata
    updatedAt: new Date().toISOString(),
    updatedBy: body._updatedBy || 'admin',
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
}

/**
 * Sales-facing subset: only what the quotation renderer needs.
 * No bank account number, no internal metadata.
 */
function salesView(profile) {
  if (!profile) return null;
  return {
    legalName: profile.legalName,
    displayName: profile.displayName,
    // C7 — brand + parent line surfaced to sales for renderer consumption.
    brandName: profile.brandName ?? null,
    parentBrandLine: profile.parentBrandLine ?? null,
    gstin: profile.gstin,
    companyRegistration: profile.companyRegistration,
    address: profile.address,
    city: profile.city,
    state: profile.state,
    pincode: profile.pincode,
    phone: profile.phone,
    email: profile.email,
    website: profile.website,
    // Payment: name, bank, IFSC visible for quotation (bank transfer details)
    bankName: profile.bankName,
    bankAccountName: profile.bankAccountName,
    bankIfsc: profile.bankIfsc,
    // C7 — bank branch (display only) + UPI receiving details.
    bankBranch: profile.bankBranch ?? null,
    upiId: profile.upiId ?? null,
    upiQrAssetId: profile.upiQrAssetId ?? null,
    upiQrImageUri: profile.upiQrImageUri ?? null,
    paymentInstructions: profile.paymentInstructions,
    // Account number: visible on quotation for bank transfer. Not sensitive in B2B context.
    bankAccountNumber: profile.bankAccountNumber,
    // C7 — signature + seal (CMS asset references) for quotation renderer.
    signatureAssetId: profile.signatureAssetId ?? null,
    signatureImageUri: profile.signatureImageUri ?? null,
    sealAssetId: profile.sealAssetId ?? null,
    sealImageUri: profile.sealImageUri ?? null,
    // V4 Phase 2C — authoritative company installation count for quotation
    // trust badges. Integer. Null when Admin has not set it.
    completedInstallations: profile.completedInstallations ?? null,
    yearsExperience: profile.yearsExperience ?? null,
    // V4 Phase 2B — MNRE empanelment credential for Page 1 trust badge.
    mnreEmpanelled: profile.mnreEmpanelled ?? null,
  };
}

/**
 * Quotation payload shape: matches what the renderer expects.
 * company.available + company.value.* pattern.
 */
function quotationShape(profile) {
  if (!profile) return null;
  return {
    available: true,
    source: 'COMPANY_MASTER',
    value: {
      // NOTE (C7): companyName / legalName / brandName / parentBrandLine
      // are DISTINCT semantic fields. companyName preserves the legacy
      // renderer contract (display OR legal fallback). Rev2 renderer will
      // bind brandName + parentBrandLine independently; existing v1 pages
      // remain wired to companyName so historical behaviour is preserved.
      companyName: profile.displayName || profile.legalName || null,
      legalName: profile.legalName || null,
      brandName: profile.brandName || null,
      parentBrandLine: profile.parentBrandLine || null,
      gstNumber: profile.gstin || null,
      companyRegistration: profile.companyRegistration || null,
      address: profile.address || null,
      city: profile.city || null,
      state: profile.state || null,
      pincode: profile.pincode || null,
      phone: profile.phone || null,
      email: profile.email || null,
      website: profile.website || null,
      bankName: profile.bankName || null,
      bankAccountName: profile.bankAccountName || null,
      bankAccountNumber: profile.bankAccountNumber || null,
      bankIfsc: profile.bankIfsc || null,
      // C7 — bank branch (display only) + UPI receiving details, all null
      // until Finance supplies real values.
      bankBranch: profile.bankBranch || null,
      upiId: profile.upiId || null,
      upiQrAssetId: profile.upiQrAssetId || null,
      upiQrImageUri: profile.upiQrImageUri || null,
      paymentInstructions: profile.paymentInstructions || null,
      // C7 — signature + company seal (CMS asset references) surfaced to
      // the quotation renderer for dynamic sections.
      signatureAssetId: profile.signatureAssetId || null,
      signatureImageUri: profile.signatureImageUri || null,
      sealAssetId: profile.sealAssetId || null,
      sealImageUri: profile.sealImageUri || null,
      // V4 Phase 2C — authoritative "N homes installed" metric surfaced to
      // the quotation renderer. Renderer must block the badge when null;
      // never fabricate a number.
      completedInstallations: profile.completedInstallations ?? null,
      yearsExperience: profile.yearsExperience ?? null,
      // V4 Phase 2B — MNRE empanelment credential surfaced to the Page 1
      // trust badge. Boolean | null. Renderer suppresses the badge when
      // null or false; never fabricates a credential claim.
      mnreEmpanelled: profile.mnreEmpanelled ?? null,
    },
  };
}

function init() {
  // Ensure file exists
  if (!fs.existsSync(PROFILE_FILE)) {
    saveProfile(null);
  }
}

// actorOf is injected from server-users.js (session-derived, not header-derived).
let _actorOf;

function register(addRoute, { send, parseBody, isAdmin, isAuthenticated, actorOf: injectedActorOf }) {
  if (injectedActorOf) _actorOf = injectedActorOf;
  const _isAuth = isAuthenticated || isAdmin; // fallback for compat
  const adminGuard = (handler) => async (req, res, params, query) => {
    if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
    try { await handler(req, res, params, query); }
    catch (err) { send(res, err.status || 500, { error: err.message }); }
  };
  const authGuard = (handler) => async (req, res, params, query) => {
    if (!_isAuth(req)) return send(res, 401, { error: 'Unauthorized' });
    try { await handler(req, res, params, query); }
    catch (err) { send(res, err.status || 500, { error: err.message }); }
  };

  // Admin: read full profile
  addRoute('GET', '/api/admin/company-profile', adminGuard(async (req, res) => {
    send(res, 200, { profile: loadProfile() });
  }));

  // Admin: save profile
  addRoute('PUT', '/api/admin/company-profile', adminGuard(async (req, res) => {
    const body = await parseBody(req);
    body._updatedBy = (_actorOf && _actorOf(req) || {}).userId || 'admin';

    const validation = validateProfile(body);
    if (!validation.valid) {
      return send(res, 400, { error: 'Validation failed', errors: validation.errors });
    }

    const existing = loadProfile();
    const profile = buildProfile(body, existing);
    saveProfile(profile);
    send(res, 200, { profile, saved: true });
  }));

  // Sales: read-only (quotation-facing subset) — any authenticated user
  addRoute('GET', '/api/sales/company-profile', authGuard(async (req, res) => {
    send(res, 200, { profile: salesView(loadProfile()) });
  }));
}

// Exported for server-quotation.js to read company profile for payload
function getQuotationCompanyProfile() {
  return quotationShape(loadProfile());
}

module.exports = { init, register, getQuotationCompanyProfile };

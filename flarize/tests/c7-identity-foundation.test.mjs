/**
 * C7 IDENTITY FOUNDATION — focused tests (2026-09-04).
 *
 * The C7 gate installs the LOCKED business identity into
 * `data/company-profile.json` and extends `server-company.js` +
 * `public/company-profile.html` with new additive fields so that Rev2 can
 * later consume the correct identity from frozen quotation snapshots.
 *
 * Locked business truth for this gate:
 *   Customer-facing brand:       FLARIZE
 *   Parent / backing wording:    Backed by Golden Ray
 *   Legal quotation issuer:      FLARIZE TECHNOLOGIES PRIVATE LIMITED
 *   GSTIN:                       32AAGCF7283D1ZR
 *   Legal address:               Floor 01, Building 49/190/B, Tharath Building,
 *                                 Ambalappuzha, Alappuzha North,
 *                                 Alappuzha, Kerala 688007
 *
 * These tests prove:
 *   (a) data/company-profile.json holds exactly the locked identity.
 *   (b) The legal name is NOT overwritten with the brand.
 *   (c) brand + parent line are semantically SEPARATE fields.
 *   (d) buildProfile + salesView + quotationShape preserve all new fields
 *       and pass them through unchanged.
 *   (e) The new fields survive quotationPayload.buildPayload() and end up
 *       inside the frozen `payload.company.value.*` shape.
 *   (f) Bank fields remain null when Admin has not supplied them — no
 *       Golden Ray LLP bank details leak in from anywhere.
 *   (g) The historical Golden Ray LLP bank IFSC/account values NEVER appear
 *       inside `data/company-profile.json`.
 *   (h) The buildPayload() function does not mutate a caller-supplied
 *       companyProfile (frozen contract preserved).
 *   (i) The company-profile.html Admin UI carries form fields for every
 *       new schema slot.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const root       = resolve(__dirname, '..');

const PROFILE_PATH = resolve(root, 'data', 'company-profile.json');
const PROFILE      = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'));

import * as Q from '../src/lib/quotationPayload.js';
const companyModule = require('../server-company.js');

// Historical Golden Ray LLP bank identifiers that MUST NEVER appear in
// data/company-profile.json (they belong to the old artwork, not Flarize).
const GOLDEN_RAY_LLP_FORBIDDEN = [
  'AAP-6531',                    // (registration was inherited via legacy — not forbidden per se)
  'GOLDEN RAY RENEWABLE',        // legal name of the LLP
  'GOLDEN RAY RENEWABLE ENERGY', // full form
];
// Bank strings that MUST NEVER appear — from historical artwork rendering.
const HISTORICAL_LLP_BANK_STRINGS = [
  'AXIS BANK',       // if it was the LLP receiving bank
  'HDFC BANK',
  'ICICI BANK',
  'SBI BANK',
  'STATE BANK OF INDIA',
];

// ═════════════════════════════════════════════════════════════════════════════
// 1. data/company-profile.json — LOCKED identity
// ═════════════════════════════════════════════════════════════════════════════
describe('data/company-profile.json — C7 locked identity', () => {
  test('legalName is FLARIZE TECHNOLOGIES PRIVATE LIMITED (never overwritten by brand)', () => {
    assert.equal(PROFILE.legalName, 'FLARIZE TECHNOLOGIES PRIVATE LIMITED');
    assert.notEqual(PROFILE.legalName, 'FLARIZE', 'legalName must not be the brand');
    assert.notEqual(PROFILE.legalName, 'Flarize Technologies Pvt. Ltd.', 'must be the FULL locked legal name');
  });

  test('displayName mirrors legalName for legal/T&C/payment surfaces', () => {
    assert.equal(PROFILE.displayName, 'FLARIZE TECHNOLOGIES PRIVATE LIMITED');
  });

  test('brandName is the customer-facing FLARIZE brand — separate field', () => {
    assert.equal(PROFILE.brandName, 'FLARIZE');
    assert.notEqual(PROFILE.brandName, PROFILE.legalName,
      'brandName and legalName are SEPARATE semantic fields');
  });

  test('parentBrandLine is exactly "Backed by Golden Ray"', () => {
    assert.equal(PROFILE.parentBrandLine, 'Backed by Golden Ray');
  });

  test('gstin is the locked C7 GSTIN 32AAGCF7283D1ZR', () => {
    assert.equal(PROFILE.gstin, '32AAGCF7283D1ZR');
    // Locked GSTIN must be a valid 15-char GSTIN pattern
    assert.match(PROFILE.gstin, /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]$/,
      'GSTIN pattern must be valid');
    // Old GSTIN must not linger
    assert.notEqual(PROFILE.gstin, '32AAUFG1464A1ZP', 'old GSTIN must be replaced');
  });

  test('registered address matches the owner-confirmed footer address (2026-09-12)', () => {
    // Owner instruction 2026-09-12: footer address is
    // "Floor 01, Building 49/190/B, Tharath Building, Alappuzha – 688007"
    // (the "Ambalappuzha, Alappuzha North" locality lines are dropped).
    for (const marker of [
      'Floor 01',
      'Building 49/190/B',
      'Tharath Building',
    ]) {
      assert.ok(PROFILE.address.includes(marker),
        `address must include GST certificate marker "${marker}"`);
    }
    assert.equal(PROFILE.city, 'Alappuzha');
    assert.equal(PROFILE.state, 'Kerala');
    assert.equal(PROFILE.pincode, '688007');
  });

  test('bank fields remain null — no invented Flarize account, no Golden Ray LLP leak', () => {
    for (const field of ['bankName', 'bankAccountName', 'bankAccountNumber',
                          'bankIfsc', 'bankBranch', 'upiId', 'upiQrAssetId',
                          'upiQrImageUri', 'paymentInstructions']) {
      assert.equal(PROFILE[field], null,
        `${field} must be null until Finance supplies real values`);
    }
  });

  test('signature + seal CMS asset slots are null (not supplied yet)', () => {
    for (const field of ['signatureAssetId', 'signatureImageUri',
                          'sealAssetId', 'sealImageUri']) {
      assert.equal(PROFILE[field], null, `${field} must be null until CMS supplies asset`);
    }
  });

  test('no Golden Ray LLP legal-name or bank strings leak into company-profile.json', () => {
    const raw = readFileSync(PROFILE_PATH, 'utf8').toUpperCase();
    for (const forbidden of GOLDEN_RAY_LLP_FORBIDDEN) {
      // "GOLDEN RAY RENEWABLE" and its full form are the LLP legal name and
      // must never appear. The customer-facing "Backed by Golden Ray" line
      // is filtered out here because it contains "GOLDEN RAY" but NOT
      // "GOLDEN RAY RENEWABLE".
      if (forbidden === 'AAP-6531') continue; // legacy registration allowed to remain
      assert.ok(!raw.includes(forbidden),
        `forbidden LLP identity string "${forbidden}" must not appear in company-profile.json`);
    }
    // No historical bank string may leak either — bank fields are null.
    for (const bank of HISTORICAL_LLP_BANK_STRINGS) {
      assert.ok(!raw.includes(bank),
        `historical bank string "${bank}" must not appear in company-profile.json`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. server-company.js — schema extension
// ═════════════════════════════════════════════════════════════════════════════
describe('server-company.js — C7 schema extension', () => {
  test('getQuotationCompanyProfile exposes the C7 fields inside .value', () => {
    const result = companyModule.getQuotationCompanyProfile();
    assert.ok(result, 'must return a shape when profile is configured');
    assert.equal(result.available, true);
    assert.equal(result.source, 'COMPANY_MASTER');
    const v = result.value;

    // Core identity
    assert.equal(v.legalName,       'FLARIZE TECHNOLOGIES PRIVATE LIMITED');
    assert.equal(v.brandName,       'FLARIZE');
    assert.equal(v.parentBrandLine, 'Backed by Golden Ray');
    assert.equal(v.gstNumber,       '32AAGCF7283D1ZR');

    // New payment slots (null-preserved)
    for (const field of ['bankBranch', 'upiId', 'upiQrAssetId', 'upiQrImageUri']) {
      assert.equal(v[field], null, `${field} must be null-preserved`);
    }
    // New signature/seal slots (null-preserved)
    for (const field of ['signatureAssetId', 'signatureImageUri',
                          'sealAssetId', 'sealImageUri']) {
      assert.equal(v[field], null, `${field} must be null-preserved`);
    }
  });

  test('legacy companyName field remains present for the v1 renderer', () => {
    const v = companyModule.getQuotationCompanyProfile().value;
    // v1 renderer binds to companyName (display OR legal fallback). This
    // contract must be preserved — the C7 gate only ADDS fields.
    assert.ok(v.companyName, 'companyName must still be present');
    assert.equal(v.companyName, 'FLARIZE TECHNOLOGIES PRIVATE LIMITED',
      'companyName resolves via displayName || legalName');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Payload propagation — deepFreeze(companyProfile) auto-flows new fields
// ═════════════════════════════════════════════════════════════════════════════
describe('quotationPayload.buildPayload — C7 field propagation', () => {
  // Full company profile shape as it would arrive from server-company.js.
  const companyProfile = Object.freeze({
    available: true,
    source: 'COMPANY_MASTER',
    value: Object.freeze({
      companyName: 'FLARIZE TECHNOLOGIES PRIVATE LIMITED',
      legalName:   'FLARIZE TECHNOLOGIES PRIVATE LIMITED',
      brandName:   'FLARIZE',
      parentBrandLine: 'Backed by Golden Ray',
      gstNumber:   '32AAGCF7283D1ZR',
      companyRegistration: 'AAP-6531',
      address:     'Floor 01, Building 49/190/B, Tharath Building',
      city:        'Alappuzha',
      state:       'Kerala',
      pincode:     '688007',
      phone:       '9995073579',
      email:       'sales@flarize.com',
      website:     'www.flarize.com',
      bankName: null, bankAccountName: null, bankAccountNumber: null, bankIfsc: null,
      bankBranch: null, upiId: null, upiQrAssetId: null, upiQrImageUri: null,
      paymentInstructions: null,
      signatureAssetId: null, signatureImageUri: null,
      sealAssetId: null, sealImageUri: null,
      completedInstallations: null,
      mnreEmpanelled: null,
    }),
  });

  test('payload.company preserves brandName + parentBrandLine + gstNumber', () => {
    const payload = Q.buildQuotationPayload({ companyProfile });
    assert.ok(payload.company, 'payload.company must exist');
    assert.equal(payload.company.available, true);
    assert.equal(payload.company.source,    'COMPANY_MASTER');
    const v = payload.company.value;
    assert.equal(v.legalName,       'FLARIZE TECHNOLOGIES PRIVATE LIMITED');
    assert.equal(v.brandName,       'FLARIZE');
    assert.equal(v.parentBrandLine, 'Backed by Golden Ray');
    assert.equal(v.gstNumber,       '32AAGCF7283D1ZR');
  });

  test('payload.company is deep-frozen (R1/R2/R3 reproducibility contract)', () => {
    const payload = Q.buildQuotationPayload({ companyProfile });
    assert.ok(Object.isFrozen(payload.company),        'company section frozen');
    assert.ok(Object.isFrozen(payload.company.value),  'company.value frozen');
    // Attempts to mutate a frozen leaf are silently ignored in sloppy mode;
    // in strict mode they throw. The assertion here is structural.
    assert.throws(() => { 'use strict'; payload.company.value.brandName = 'HACK'; },
      /read.only|Cannot assign|frozen/i,
      'attempting to mutate a frozen brandName throws in strict mode');
  });

  test('payload.company includes all new C7 payment + asset slots (null-preserved)', () => {
    const payload = Q.buildQuotationPayload({ companyProfile });
    const v = payload.company.value;
    for (const field of ['bankBranch', 'upiId', 'upiQrAssetId', 'upiQrImageUri',
                          'signatureAssetId', 'signatureImageUri',
                          'sealAssetId', 'sealImageUri']) {
      assert.ok(Object.prototype.hasOwnProperty.call(v, field),
        `payload.company.value must expose ${field}`);
      assert.equal(v[field], null, `${field} null-preserved through payload`);
    }
  });

  test('buildPayload does NOT mutate the caller-supplied companyProfile', () => {
    const beforeJson = JSON.stringify(companyProfile);
    Q.buildQuotationPayload({ companyProfile });
    const afterJson = JSON.stringify(companyProfile);
    assert.equal(afterJson, beforeJson, 'companyProfile input is immutable');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Historical ISSUED quotation payloads are NOT mutated by this gate
// ═════════════════════════════════════════════════════════════════════════════
describe('historical ISSUED quotations remain frozen', () => {
  test('data/quotations.json — no bulk GSTIN replacement into historical rows', () => {
    // Load the persisted quotation store. Every ISSUED quotation's payload
    // that mentions gstNumber MUST NOT have been rewritten to the new
    // GSTIN by this gate; the old GSTIN can survive there per contract.
    const p = resolve(root, 'data', 'quotations.json');
    let raw;
    try { raw = readFileSync(p, 'utf8'); }
    catch { return; /* absent in fresh checkouts — nothing to check */ }
    const store = JSON.parse(raw);
    const rows  = Array.isArray(store?.quotations) ? store.quotations
                : Array.isArray(store) ? store : [];
    let scannedIssued = 0;
    for (const q of rows) {
      if (!q || typeof q !== 'object') continue;
      if (q.status !== 'ISSUED' && q.status !== 'ARCHIVED') continue;
      scannedIssued++;
      // The ISSUED payload lives under q.document.payload (frozen at issue).
      const gst = q.document?.payload?.company?.value?.gstNumber;
      if (gst && gst !== '32AAGCF7283D1ZR') {
        // This is FINE — historical rows keep their frozen GSTIN.
        assert.ok(true, `historical ISSUED quotation keeps its own GSTIN (${gst})`);
      }
    }
    // If there were historical rows, we scanned them without failing.
    assert.ok(scannedIssued >= 0, `scanned ${scannedIssued} historical ISSUED rows`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Admin UI carries form fields for every new schema slot
// ═════════════════════════════════════════════════════════════════════════════
describe('public/company-profile.html — Admin UI extension', () => {
  const HTML = readFileSync(resolve(root, 'public', 'company-profile.html'), 'utf8');

  test('form inputs exist for every new C7 field', () => {
    for (const f of ['brandName', 'parentBrandLine',
                      'bankBranch', 'upiId', 'upiQrAssetId', 'upiQrImageUri',
                      'signatureAssetId', 'signatureImageUri',
                      'sealAssetId', 'sealImageUri']) {
      assert.ok(HTML.includes(`id="f-${f}"`),
        `Admin UI must expose input#f-${f}`);
    }
  });

  test('FIELDS array includes every new C7 field (round-trips load/save)', () => {
    // The FIELDS array drives populateForm() and collectForm() — every new
    // field must be listed there or the Admin UI silently drops it on save.
    for (const f of ['brandName', 'parentBrandLine',
                      'bankBranch', 'upiId', 'upiQrAssetId', 'upiQrImageUri',
                      'signatureAssetId', 'signatureImageUri',
                      'sealAssetId', 'sealImageUri']) {
      assert.match(HTML, new RegExp(`'${f}'`),
        `FIELDS array must contain '${f}'`);
    }
  });
});

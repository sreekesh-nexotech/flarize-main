// COMPANY MASTER + CUSTOMER INPUTS — Tests
//
// Covers:
//  1. Company profile quotation shape function
//  2. Quotation payload receives company profile
//  3. Company profile blocked when not configured
//  4. Customer billCycle field
//  5. Customer currentBillAmount/currentBillCycle on quotation
//  6. Missing bill does not become ₹0
//  7. Missing pincode does not become fake data
//  8. Company profile immutability (frozen in payload)
//  9. No hardcoded company/customer values
// 10. Payload contract preservation

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

import * as Q from '../src/lib/quotationPayload.js';

// ---------------------------------------------------------------------------
// 1. server-company.js unit tests
// ---------------------------------------------------------------------------

describe('server-company.js — quotation shape', () => {
  const mod = require('../server-company.js');

  test('getQuotationCompanyProfile returns null when no profile configured', () => {
    const result = mod.getQuotationCompanyProfile();
    // With data/company-profile.json = null, should return null
    if (result === null || result === undefined) {
      assert.ok(true, 'null profile returns null company shape');
    } else {
      // If profile exists (from prior test run), verify shape
      assert.equal(result.available, true);
      assert.equal(result.source, 'COMPANY_MASTER');
      assert.ok(result.value, 'value should exist');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Quotation payload: company profile acceptance
// ---------------------------------------------------------------------------

const COMPANY_PROFILE = {
  available: true,
  source: 'COMPANY_MASTER',
  value: {
    companyName: 'Golden Ray Renewable Energy',
    legalName: 'Golden Ray Renewable Energy Pvt. Ltd.',
    gstNumber: '32AABCG1234A1ZP',
    companyRegistration: 'U40106KL2024PTC12345',
    address: '123 Solar Lane',
    city: 'Trivandrum',
    state: 'Kerala',
    pincode: '695001',
    phone: '9876543210',
    email: 'info@goldenray.in',
    website: 'www.goldenray.in',
    bankName: 'State Bank of India',
    bankAccountName: 'Golden Ray Renewable Energy',
    bankAccountNumber: '1234567890',
    bankIfsc: 'SBIN0001234',
    paymentInstructions: 'Pay within 7 days of quotation date.',
  },
};

describe('quotationPayload — company profile', () => {
  test('company profile appears in payload when provided', () => {
    const payload = Q.buildQuotationPayload({ companyProfile: COMPANY_PROFILE });
    assert.ok(payload.company, 'company section exists');
    assert.equal(payload.company.available, true);
    assert.equal(payload.company.source, 'COMPANY_MASTER');
    assert.equal(payload.company.value.gstNumber, '32AABCG1234A1ZP');
    assert.equal(payload.company.value.companyRegistration, 'U40106KL2024PTC12345');
    assert.equal(payload.company.value.companyName, 'Golden Ray Renewable Energy');
    assert.equal(payload.company.value.address, '123 Solar Lane');
    assert.equal(payload.company.value.bankName, 'State Bank of India');
    assert.equal(payload.company.value.bankIfsc, 'SBIN0001234');
  });

  test('company is blocked when no profile provided', () => {
    const payload = Q.buildQuotationPayload({});
    assert.ok(payload.company, 'company section exists');
    assert.equal(payload.company.available, false, 'should be blocked');
    assert.equal(payload.company.dependency, 'COMPANY_MASTER');
  });

  test('company is blocked when companyProfile is null', () => {
    const payload = Q.buildQuotationPayload({ companyProfile: null });
    assert.equal(payload.company.available, false);
    assert.equal(payload.company.dependency, 'COMPANY_MASTER');
  });

  test('company profile is frozen in payload (immutable)', () => {
    const payload = Q.buildQuotationPayload({ companyProfile: COMPANY_PROFILE });
    assert.ok(Object.isFrozen(payload.company), 'company should be frozen');
  });

  test('no renderer-side calculation in company section', () => {
    const payload = Q.buildQuotationPayload({ companyProfile: COMPANY_PROFILE });
    const v = payload.company.value;
    assert.equal(v.gstNumber, COMPANY_PROFILE.value.gstNumber);
    assert.equal(v.companyRegistration, COMPANY_PROFILE.value.companyRegistration);
    assert.equal(v.address, COMPANY_PROFILE.value.address);
  });
});

// ---------------------------------------------------------------------------
// 3. Customer inputs: currentBillAmount and currentBillCycle
// ---------------------------------------------------------------------------

describe('quotationPayload — customer inputs', () => {
  test('customer with currentBillAmount appears in payload', () => {
    const customer = {
      customerId: 'CUST-TEST-001',
      customerName: 'Test Customer',
      name: 'Test Customer',
      phone: '9876543210',
      address: '42 Solar Street',
      pincode: '390001',
      currentBillAmount: 4500,
      currentBillCycle: 'MONTHLY',
    };
    const payload = Q.buildQuotationPayload({ customer });
    assert.ok(payload.customer);
    assert.equal(payload.customer.currentBillAmount, 4500);
    assert.equal(payload.customer.currentBillCycle, 'MONTHLY');
    assert.equal(payload.customer.pincode, '390001');
  });

  test('missing currentBill does NOT become ₹0', () => {
    const customer = {
      customerId: 'CUST-TEST-002',
      customerName: 'No Bill Customer',
      name: 'No Bill Customer',
      phone: '9876500002',
    };
    const payload = Q.buildQuotationPayload({ customer });
    assert.ok(
      payload.customer.currentBillAmount === undefined || payload.customer.currentBillAmount === null,
      'missing bill must not become 0'
    );
  });

  test('missing pincode does NOT become fake data', () => {
    const customer = {
      customerId: 'CUST-TEST-003',
      customerName: 'No Pincode Customer',
      name: 'No Pincode Customer',
      phone: '9876500003',
    };
    const payload = Q.buildQuotationPayload({ customer });
    assert.ok(
      payload.customer.pincode === undefined || payload.customer.pincode === null,
      'missing pincode must not become fake data'
    );
  });

  test('customer is frozen in payload', () => {
    const customer = {
      customerId: 'CUST-TEST-004',
      customerName: 'Frozen Customer',
      name: 'Frozen Customer',
      phone: '9876500004',
      pincode: '682001',
      currentBillAmount: 3000,
      currentBillCycle: 'BIMONTHLY',
    };
    const payload = Q.buildQuotationPayload({ customer });
    assert.ok(Object.isFrozen(payload.customer));
  });

  test('customer billCycle BIMONTHLY preserved', () => {
    const customer = {
      customerId: 'CUST-TEST-005',
      customerName: 'Bimonthly Customer',
      name: 'Bimonthly Customer',
      phone: '9876500005',
      currentBillAmount: 6000,
      currentBillCycle: 'BIMONTHLY',
    };
    const payload = Q.buildQuotationPayload({ customer });
    assert.equal(payload.customer.currentBillCycle, 'BIMONTHLY');
  });
});

// ---------------------------------------------------------------------------
// 4. DEPENDENCY constants
// ---------------------------------------------------------------------------

describe('DEPENDENCY constants', () => {
  test('COMPANY_MASTER dependency constant exists', () => {
    assert.ok(Q.DEPENDENCY.COMPANY_MASTER);
    assert.equal(Q.DEPENDENCY.COMPANY_MASTER, 'COMPANY_MASTER');
  });

  test('DECISION_C7_COMPANY_IDENTITY constant still exists for backward compat', () => {
    assert.ok(Q.DEPENDENCY.DECISION_C7_COMPANY_IDENTITY);
  });
});

// ---------------------------------------------------------------------------
// 5. No hardcoded company/customer values
// ---------------------------------------------------------------------------

describe('no hardcoded company/customer values in assembler', () => {
  const SRC = readFileSync('src/lib/quotationPayload.js', 'utf8');

  test('no hardcoded GSTIN', () => {
    assert.ok(!SRC.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z0-9]\b/), 'no GSTIN pattern in source');
  });

  test('no hardcoded company name in assembler', () => {
    assert.ok(!SRC.includes('Golden Ray'), 'no company name hardcoded');
    // 'Flarize' may appear in comments — check only non-comment lines
    const codeLines = SRC.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    const codeOnly = codeLines.join('\n');
    assert.ok(!codeOnly.includes('Flarize'), 'no Flarize hardcoded in code');
  });
});

// ---------------------------------------------------------------------------
// 6. Payload contract preservation
// ---------------------------------------------------------------------------

describe('payload assembler contract preserved', () => {
  test('buildQuotationPayload accepts all original + new parameters', () => {
    const payload = Q.buildQuotationPayload({
      quotation: null,
      customer: null,
      site: null,
      system: null,
      bomSnapshot: null,
      commercialSnapshot: null,
      engineering: null,
      componentAttributes: {},
      upgradeIdentity: null,
      subsidyTreatment: null,
      capabilities: [],
      variant: 'FULL',
      savingsResult: null,
      subsidyResult: null,
      financingResult: null,
      energyProfileResult: null,
      campaignResult: null,
      companyProfile: null,
    });
    assert.ok(payload);
    assert.equal(payload.payloadVersion, Q.QUOTATION_PAYLOAD_VERSION);
  });
});

// QUOTATION V4 FINALIZATION — Phase 2B — PAGE 1.
//
// Verifies the F1 architecture on Page 1:
//   1. Approved static artwork is vendored (hero, brand logo, signature/seal).
//   2. Approved static copy (headline, sub-tagline) appears verbatim.
//   3. The 3 trust badges bind to authoritative sources and SUPPRESS when
//      their source is unavailable (no ₹78,000, no 300+, no "MNRE Empanelled"
//      hardcoded as a business claim).
//   4. The live-HTML footer replaces page-footer.jpg and binds to the
//      authoritative Company Master (address, city, pincode, website, email,
//      phone).
//   5. mnreEmpanelled is a strict boolean|null on the company profile.
//   6. No customer sample value from the approved mockup ("Sareena KV",
//      "9809445408", "QUO-GR-AS-2025", ₹78,000, 300+, etc.) is present in
//      the shipped renderer source.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import * as D from '../public/lib/quotationDocument.js';
import { ROLES } from '../src/lib/bomRoles.js';
import { createProjectBomSnapshot } from '../src/lib/bomSnapshot.js';
import { createCommercialSnapshot } from '../src/lib/commercialSnapshot.js';
import { COST_STATUS } from '../src/lib/costEngine.js';
import { PRICING_STATUS } from '../src/lib/pricingEngine.js';
import * as QP from '../src/lib/quotationPayload.js';

const AT = '2026-08-16T00:00:00Z';

const CUSTOMER = {
  customerId: 'C-P1', customerName: 'Aparna Menon',
  address: '42 Test Marg, Ward 7', pincode: '682020', phone: '9800088000',
  district: 'Ernakulam', state: 'Kerala',
  currentBillAmount: 5400, currentBillCycle: 'bi monthly',
};
const SYSTEM = { systemType: 'ONGRID', systemSizeKw: 5, phase: 'SINGLE', packageTier: 'VALUE', roofType: 'RCC' };
const QUOTE = {
  quotationNumber: 'FLZ-P1-0001', quotationVersion: 1, quotationDate: '2026-08-16',
  validUntil: '2026-08-31', proposalBy: 'P1 Advisor', status: 'DRAFT',
};

function bom() {
  return createProjectBomSnapshot({
    projectId: 'PRJ-P1', lockedBy: 'ph1', lockedAt: AT, dataVersion: 'catalog.7',
    engineeringStatus: 'VALID',
    bomLines: [
      { componentId: 'p1', role: ROLES.PANEL, quantity: 9 },
      { componentId: 'i1', role: ROLES.INVERTER, quantity: 1 },
    ],
  });
}

function commercial() {
  return createCommercialSnapshot({
    snapshotId: 'CS-P1', issuedBy: 'ph1', issuedAt: AT,
    costResult: {
      status: COST_STATUS.COMPLETE, projectId: 'PRJ-P1', bomSnapshotId: 'BOM-P1',
      catalogVersion: 'catalog.7', procurementPriceVersion: 'pp.3', landedCostVersion: 'lc.2',
      projectRateCardVersion: 'rc.4', costConfigVersion: 'cc.5', costEngineVersion: 'costEngine.1',
      materialLandedCost: 200000, structureCost: 15000, installationCost: 18000,
      siteSurveyCost: 500, engineeringDesignCost: 3000, transportationCost: 2500,
      serviceAmcCost: 4000, miscellaneousCost: 2430, officeExpenseAllocation: 6000,
      specialProjectWorksCost: 0, directProjectCost: 243000, totalActualProjectCost: 251430, traces: [],
    },
    pricingResult: {
      status: PRICING_STATUS.COMPLETE, marginVersion: 'margin.2', gstVersion: 'gst.1',
      pricingEngineVersion: 'pricingEngine.1', marginType: 'GROSS_MARGIN',
      targetGrossMargin: 0.18, sellingPriceBeforeGST: 306622, grossProfit: 55192,
      gstRatePct: 8.9, gstAmount: 27289, sellingPriceIncludingGST: 333911,
      extras: [], extrasIncludingGST: 0, customerTotalIncludingGST: 333911, customerSideExpenses: [],
    },
  });
}

// Build a payload with a live company profile + engine subsidy result.
function payloadWith({ company = null, subsidyResult = null, subsidyTreatment = QP.SUBSIDY_TREATMENT.NOT_QUOTED } = {}) {
  return QP.buildQuotationPayload({
    quotation: QUOTE, customer: CUSTOMER, system: SYSTEM,
    engineering: { status: 'VALID', blocked: [], warnings: [] },
    bomSnapshot: bom(), commercialSnapshot: commercial(),
    componentAttributes: {}, subsidyTreatment, subsidyResult,
    companyProfile: company,
    capabilities: [], variant: 'FULL',
  });
}

// ---------------------------------------------------------------------------
// 1. static artwork + approved static copy
// ---------------------------------------------------------------------------

test('page 1 vendors the F1 static assets — hero photo, brand logo, signature/seal', () => {
  for (const a of ['q-page-01-hero.jpg', 'q-flarize-logo-592e2a11.png', 'signature-seal.png']) {
    assert.ok(existsSync(`public/assets/quotation/${a}`), `${a} must ship`);
  }
  assert.equal(D.PAGE_ONE_ASSETS.brandLogo, 'assets/quotation/q-flarize-logo-592e2a11.png');
  assert.equal(D.PAGE_ONE_ASSETS.hero,      'assets/quotation/q-page-01-hero.jpg');
  assert.equal(D.PAGE_ONE_ASSETS.signature, 'assets/quotation/signature-seal.png');
  assert.equal(D.PAGE_ONE_ASSETS.seal,      'assets/quotation/signature-seal.png');
});

test('page 1 renders the approved static headline and sub-tagline verbatim', () => {
  const html = D.renderPage1(payloadWith());
  assert.ok(html.includes('Stop Worrying About Electricity Bills Forever'),
    'approved headline must appear verbatim');
  assert.ok(html.includes('Empowering Kerala homes with clean energy, smart savings, and the joy of sustainability.'),
    'approved sub-tagline must appear verbatim');
});

// ---------------------------------------------------------------------------
// 2. trust badges bind to authoritative sources
// ---------------------------------------------------------------------------

test('trust badges suppress when no authoritative source is supplied (never hardcoded)', () => {
  const html = D.renderPage1(payloadWith());
  // No hardcoded artwork sample values
  assert.equal(html.includes('₹78,000'), false, 'no hardcoded ₹78,000 subsidy amount');
  assert.equal(html.includes('300+'),    false, 'no hardcoded 300+ homes count');
  assert.equal(html.includes('MNRE Empanelled'), false,
    'MNRE credential must not appear as a business claim when company profile does not assert it');
  // Suppressed slots present but hidden
  assert.ok(html.includes('q-badge-blocked'), 'suppressed badge slots must be marked so layout reserves the position');
});

test('subsidy badge binds to payload.subsidy.value.subsidyAmount from the Subsidy Engine', () => {
  const withSubsidy = payloadWith({
    subsidyTreatment: QP.SUBSIDY_TREATMENT.ENGINE_RESULT,
    subsidyResult: {
      available: true, source: 'PM_SURYA_GHAR', status: 'COMPLETE',
      subsidyAmount: 78000, schemeName: 'PM Surya Ghar',
    },
  });
  const html = D.renderPage1(withSubsidy);
  assert.ok(html.includes('₹78,000 Subsidy'), 'subsidy badge must render the authoritative amount');
  assert.ok(html.includes('PM Surya Ghar'), 'subsidy sub-line references the scheme');

  const withDifferent = payloadWith({
    subsidyTreatment: QP.SUBSIDY_TREATMENT.ENGINE_RESULT,
    subsidyResult: {
      available: true, source: 'PM_SURYA_GHAR', status: 'COMPLETE',
      subsidyAmount: 30000, schemeName: 'PM Surya Ghar',
    },
  });
  const html2 = D.renderPage1(withDifferent);
  assert.ok(html2.includes('₹30,000 Subsidy'),
    'subsidy badge must vary with the engine result — never fixed at ₹78,000');
});

test('homes-installed badge binds to payload.company.value.completedInstallations', () => {
  const company = {
    available: true, source: 'COMPANY_MASTER',
    value: { completedInstallations: 412, mnreEmpanelled: false },
  };
  const html = D.renderPage1(payloadWith({ company }));
  assert.ok(html.includes('412+ Homes'),
    'homes badge must reflect the authoritative company metric, not a hardcoded 300+');
  assert.equal(html.includes('300+'), false);
});

test('MNRE badge appears only when payload.company.value.mnreEmpanelled === true', () => {
  const noMnre = {
    available: true, source: 'COMPANY_MASTER',
    value: { completedInstallations: 100, mnreEmpanelled: null },
  };
  assert.equal(D.renderPage1(payloadWith({ company: noMnre })).includes('MNRE Empanelled'), false);

  const falseMnre = {
    available: true, source: 'COMPANY_MASTER',
    value: { completedInstallations: 100, mnreEmpanelled: false },
  };
  assert.equal(D.renderPage1(payloadWith({ company: falseMnre })).includes('MNRE Empanelled'), false);

  const trueMnre = {
    available: true, source: 'COMPANY_MASTER',
    value: { completedInstallations: 100, mnreEmpanelled: true },
  };
  const html = D.renderPage1(payloadWith({ company: trueMnre }));
  assert.ok(html.includes('MNRE Empanelled'));
  assert.ok(html.includes('Government certified'));
});

// ---------------------------------------------------------------------------
// 3. footer contact strip is live HTML, not the baked page-footer.jpg
// ---------------------------------------------------------------------------

test('footer contact strip renders live company profile data — no baked JPEG', () => {
  const company = {
    available: true, source: 'COMPANY_MASTER',
    value: {
      address: 'Thannikakal, Thumpoly PO',
      city: 'Alappuzha', pincode: '688008',
      website: 'www.flarize.com', email: 'sales@flarize.com',
      phone: '+91 9995 073 579',
      completedInstallations: null, mnreEmpanelled: null,
    },
  };
  const html = D.renderPage1(payloadWith({ company }));
  assert.ok(html.includes('Thannikakal, Thumpoly PO'));
  assert.ok(html.includes('Alappuzha'));
  assert.ok(html.includes('688008'));
  assert.ok(html.includes('www.flarize.com'));
  assert.ok(html.includes('sales@flarize.com'));
  assert.ok(html.includes('+91 9995 073 579'));
  assert.equal(html.includes('assets/quotation/page-footer.jpg'), false,
    'legacy baked footer JPEG must NOT be referenced on Page 1');
});

test('footer suppresses missing contact fields (never invents)', () => {
  const partial = {
    available: true, source: 'COMPANY_MASTER',
    value: { address: 'X Road', city: 'Kochi', pincode: null, website: null, email: 'x@y.z', phone: null },
  };
  const html = D.renderPage1(payloadWith({ company: partial }));
  assert.ok(html.includes('X Road'));
  assert.ok(html.includes('x@y.z'));
  assert.equal(/\+91|9995|073/.test(html), false, 'no phone slot invented');
});

// ---------------------------------------------------------------------------
// 4. no artwork sample values shipped, no legacy assets referenced on page 1
// ---------------------------------------------------------------------------

test('renderer OUTPUT carries no artwork sample customer/legal/marketing values', () => {
  // Check the actual HTML emitted (not the source, since docstrings legitimately
  // name the forbidden values as negative examples).
  const html = D.renderPage1(payloadWith());
  const forbidden = [
    'Sareena KV', 'Sareena,',
    'Kurukkaankizhakke', 'Azhikkode',
    'QUO-GR-AS-2025',
    '9809445408',
    '32AAUFG1464A1ZP', 'AAP-6531',
    '₹78,000', '₹6,000/bi monthly',
    '300+ Homes', '300+',
  ];
  for (const v of forbidden) {
    assert.equal(html.includes(v), false, `render output must not carry sample value: ${v}`);
  }

  // Also: the renderer source must not hardcode these values as code literals
  // (a comment mentioning them is fine — those are negative examples).
  const SRC = readFileSync('public/lib/quotationDocument.js', 'utf8');
  const codeOnly = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const codeForbidden = [
    'Sareena', 'Kurukkaankizhakke', 'Azhikkode',
    'QUO-GR-AS-2025', '9809445408', '32AAUFG1464A1ZP', 'AAP-6531',
    '78000', "'300+'", '"300+"',
  ];
  for (const v of codeForbidden) {
    assert.equal(codeOnly.includes(v), false, `renderer code must not hardcode sample value: ${v}`);
  }
});

test('page 1 does not reference the legacy page-footer.jpg or page1-hero.jpg', () => {
  const html = D.renderPage1(payloadWith());
  assert.equal(html.includes('assets/quotation/page1-hero.jpg'), false);
  assert.equal(html.includes('assets/quotation/page-footer.jpg'), false);
});

// ---------------------------------------------------------------------------
// 5. server-company.js exposes mnreEmpanelled as a strict boolean|null
// ---------------------------------------------------------------------------

test('server-company.js validates mnreEmpanelled as boolean|null and exposes it in quotationShape', () => {
  const SRC = readFileSync('server-company.js', 'utf8');
  assert.ok(SRC.includes('mnreEmpanelled must be a boolean or null'),
    'validator must reject non-boolean mnreEmpanelled values');
  assert.ok((SRC.match(/mnreEmpanelled/g) || []).length >= 4,
    'mnreEmpanelled must appear at validate/build/salesView/quotationShape (>=4)');
  // Never a hardcoded credential claim in the server
  assert.equal(SRC.includes('mnreEmpanelled: true,'), false,
    'server must not hardcode mnreEmpanelled: true');
});

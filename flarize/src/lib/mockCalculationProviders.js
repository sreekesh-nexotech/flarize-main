/**
 * MOCK CALCULATION PROVIDERS.  (Phase 3 — PART H, Page 8 mock data)
 *
 * TEST-ONLY mock providers that supply deterministic calculation results
 * for the quotation payload. These replace the absent Savings Engine,
 * Subsidy Engine and Finance Engine with explicit test data.
 *
 * RULES:
 *   - Every result carries { source: 'MOCK', status: 'TEST_ONLY' }
 *   - No real formula is implemented — values are literal constants
 *   - No Date.now(), no Math.random(), no current-date calculation
 *   - Values are deterministic and stable across runs
 *   - The renderer never imports this file — it only sees the payload
 *
 * FUTURE:
 *   Replace each provider with the real Flarize API integration.
 *   The payload contract and the renderer need not change.
 */

export const MOCK_SOURCE = 'MOCK';
export const MOCK_STATUS = 'TEST_ONLY';

/** Metadata that every mock result carries. */
function mockMeta() {
  return Object.freeze({ source: MOCK_SOURCE, status: MOCK_STATUS });
}

// ---------------------------------------------------------------------------
// SAVINGS PROVIDER
// ---------------------------------------------------------------------------

/**
 * Mock savings result for a residential system.
 *
 * @param {object} opts
 * @param {number} opts.systemSizeKw — system size in kW
 * @param {number} opts.currentBillAmount — customer's current bill
 * @param {string} opts.billingCycle — 'monthly' | 'bi-monthly'
 * @returns {object} frozen savings result with TEST_ONLY metadata
 */
export function mockSavingsResult({
  systemSizeKw = 5,
  currentBillAmount = 6000,
  billingCycle = 'monthly',
} = {}) {
  // All values are hardcoded test data. No formula. No derivation.
  const dailyGenerationUnits = systemSizeKw === 5 ? 20 : systemSizeKw === 10 ? 40 : 16;
  const annualOutputKwh = dailyGenerationUnits * 365;
  const monthlySavingsLow = systemSizeKw === 5 ? 4000 : systemSizeKw === 10 ? 8000 : 3200;
  const monthlySavingsHigh = systemSizeKw === 5 ? 4500 : systemSizeKw === 10 ? 9000 : 3600;
  const annualSavingsAmount = systemSizeKw === 5 ? 52000 : systemSizeKw === 10 ? 104000 : 41600;
  const lifetimeSavingsAmount = systemSizeKw === 5 ? 1560000 : systemSizeKw === 10 ? 3120000 : 1248000;
  const returnPeriodMonths = systemSizeKw === 5 ? 42 : systemSizeKw === 10 ? 48 : 45;
  const postSolarBillLow = systemSizeKw === 5 ? 100 : systemSizeKw === 10 ? 80 : 150;
  const postSolarBillHigh = systemSizeKw === 5 ? 500 : systemSizeKw === 10 ? 200 : 600;
  const tariffEscalationLow = 3;
  const tariffEscalationHigh = 5;
  const lifetimeKSEBSpend = systemSizeKw === 5 ? 2400000 : systemSizeKw === 10 ? 4800000 : 1920000;

  // Graph time-series: 25 years of deterministic mock data
  // These are LITERAL values, not calculated from any formula
  const graphPoints = [];
  const baseWithoutSolar = systemSizeKw === 5 ? 72000 : systemSizeKw === 10 ? 144000 : 57600;
  const baseWithSolar = systemSizeKw === 5 ? 6000 : systemSizeKw === 10 ? 3000 : 8000;
  for (let year = 1; year <= 25; year++) {
    graphPoints.push(Object.freeze({
      year,
      withoutSolarCumulative: baseWithoutSolar * year,
      withSolarCumulative: baseWithSolar * year,
    }));
  }

  return Object.freeze({
    ...mockMeta(),
    available: true,
    systemSizeKw,
    dailyGenerationUnits,
    annualOutputKwh,
    monthlySavingsLow,
    monthlySavingsHigh,
    annualSavingsAmount,
    lifetimeSavingsAmount,
    returnPeriodMonths,
    postSolarBillLow,
    postSolarBillHigh,
    tariffEscalationLow,
    tariffEscalationHigh,
    lifetimeKSEBSpend,
    graphPoints: Object.freeze(graphPoints),
  });
}

// ---------------------------------------------------------------------------
// SUBSIDY PROVIDER
// ---------------------------------------------------------------------------

/**
 * Mock subsidy result for a residential system.
 *
 * @param {object} opts
 * @param {number} opts.systemSizeKw — system size in kW
 * @returns {object} frozen subsidy result with TEST_ONLY metadata
 */
export function mockSubsidyResult({ systemSizeKw = 5 } = {}) {
  // TEST_ONLY — tiered residential formula matching PM Surya Ghar CFA.
  // ₹30,000/kW for first 2kW, ₹18,000/kW for 2–3kW, capped at ₹78,000.
  let subsidyAmount = 0;
  if (systemSizeKw > 0 && systemSizeKw <= 10) {
    if (systemSizeKw <= 2) {
      subsidyAmount = Math.round(systemSizeKw * 30000);
    } else if (systemSizeKw <= 3) {
      subsidyAmount = Math.round(60000 + (systemSizeKw - 2) * 18000);
    } else {
      subsidyAmount = 78000;
    }
  }
  const schemeName = 'PM Surya Ghar';

  return Object.freeze({
    ...mockMeta(),
    available: subsidyAmount > 0,
    treatment: 'ENGINE_RESULT',
    subsidyAmount,
    schemeName,
    postSubsidyInvestment: null, // Not calculated here — payload assembler handles this
  });
}

// ---------------------------------------------------------------------------
// EMI / FINANCE PROVIDER
// ---------------------------------------------------------------------------

/**
 * Mock EMI/financing result.
 *
 * @param {object} opts
 * @param {number} opts.loanAmount — principal
 * @param {number} opts.interestRatePct — annual interest rate %
 * @param {number} opts.tenureYears — loan tenure in years
 * @returns {object} frozen financing result with TEST_ONLY metadata
 */
export function mockFinancingResult({
  grossQuotationAmount = 285000,
  subsidyAmount = 78000,
  downPaymentPercentage = 10,
  tenureYears = 10,
} = {}) {
  // Business-rule flow: gross → 10% down → remaining → less subsidy → principal
  const dpAmount = Math.round(grossQuotationAmount * downPaymentPercentage / 100);
  const remaining = grossQuotationAmount - dpAmount;
  const loanAmount = Math.max(0, remaining - subsidyAmount);
  const postSubsidyInvestment = Math.max(0, grossQuotationAmount - subsidyAmount);

  // Rate tier: ≤₹200k → 5.75%, >₹200k → 7.90%
  const interestRatePct = loanAmount <= 200000 ? 5.75 : 7.90;

  // Standard PMT formula — matches financeEngine.js calculateFinance().
  const tenureMonths = tenureYears * 12;
  let monthlyEMI;
  if (loanAmount === 0) {
    monthlyEMI = 0;
  } else if (interestRatePct === 0) {
    monthlyEMI = Math.round(loanAmount / tenureMonths);
  } else {
    const r = interestRatePct / 12 / 100;
    const c = Math.pow(1 + r, tenureMonths);
    monthlyEMI = Math.round((loanAmount * r * c) / (c - 1));
  }
  const totalRepayment = monthlyEMI * tenureMonths;
  const totalInterest = totalRepayment - loanAmount;

  return Object.freeze({
    ...mockMeta(),
    available: true,
    loanAmount,
    interestRatePct,
    rateLabel: 'Indicative PM Surya Ghar rate',
    tenureYears,
    tenureMonths,
    monthlyEMI,
    totalInterest,
    totalRepayment,
    downPaymentPercentage,
    downPaymentAmount: dpAmount,
    grossQuotationAmount,
    postSubsidyInvestment,
  });
}

// ---------------------------------------------------------------------------
// ENERGY PROFILE PROVIDER  (Page 3 — generation + appliance usage)
// ---------------------------------------------------------------------------

/**
 * Mock energy profile for the customer's daily generation and appliance usage.
 *
 * Every value is a hardcoded test constant. No formula. No yield calculation.
 * The real provider will come from the Flarize advanced calculator API.
 *
 * @param {object} opts
 * @param {number} opts.systemSizeKw — system size in kW
 * @returns {object} frozen energy profile with TEST_ONLY metadata
 */
export function mockEnergyProfileResult({ systemSizeKw = 5 } = {}) {
  // All values are literal test data — no derivation from systemSizeKw formulas.
  const genLow = systemSizeKw === 5 ? 18 : systemSizeKw === 10 ? 36 : 14;
  const genHigh = systemSizeKw === 5 ? 22 : systemSizeKw === 10 ? 44 : 18;
  const ksebValueLow = systemSizeKw === 5 ? 5500 : systemSizeKw === 10 ? 11000 : 4400;
  const ksebValueHigh = systemSizeKw === 5 ? 6600 : systemSizeKw === 10 ? 13200 : 5280;

  const appliances = Object.freeze([
    Object.freeze({ name: 'Lights + Fans', quantity: 10, hoursPerDay: 6, unitsPerDay: 0.6 }),
    Object.freeze({ name: 'Refrigerator', quantity: 1, hoursPerDay: 24, unitsPerDay: 1.5 }),
    Object.freeze({ name: 'Induction Stove', quantity: null, hoursPerDay: 1, unitsPerDay: 0.8 }),
    Object.freeze({ name: 'Washing Machine', quantity: 1, hoursPerDay: 1, unitsPerDay: 0.5 }),
    Object.freeze({ name: 'TV + OTT', quantity: 1, hoursPerDay: 5, unitsPerDay: 0.5 }),
    Object.freeze({ name: 'Air Conditioner', quantity: 1, hoursPerDay: 6, unitsPerDay: 7.2 }),
    Object.freeze({ name: 'Inverter + Chargers', quantity: null, hoursPerDay: 24, unitsPerDay: 0.5 }),
    Object.freeze({ name: 'EV Charging', quantity: null, hoursPerDay: 1, unitsPerDay: 0.8 }),
  ]);

  const totalDailyUsage = 13.1; // hardcoded — not summed from appliances array
  const surplusLow = systemSizeKw === 5 ? 4 : systemSizeKw === 10 ? 22 : 1;
  const surplusHigh = systemSizeKw === 5 ? 8 : systemSizeKw === 10 ? 30 : 4;

  return Object.freeze({
    ...mockMeta(),
    available: true,
    dailyGenerationLow: genLow,
    dailyGenerationHigh: genHigh,
    monthlyKsebValueLow: ksebValueLow,
    monthlyKsebValueHigh: ksebValueHigh,
    appliances,
    totalDailyUsage,
    homeUsesUnitsPerDay: totalDailyUsage,
    surplusExportedLow: surplusLow,
    surplusExportedHigh: surplusHigh,
  });
}

// ---------------------------------------------------------------------------
// CAMPAIGN PROVIDER  (Page 2 — seasonal campaign / festival offer)
// ---------------------------------------------------------------------------

/**
 * Mock campaign result for the quotation's seasonal offer page.
 *
 * Every value is a hardcoded test constant. No business logic.
 * The real provider will come from a CMS/admin campaign configuration.
 *
 * @param {object} opts
 * @param {string} opts.campaignId — campaign identifier
 * @returns {object} frozen campaign snapshot with TEST_ONLY metadata
 */
export function mockCampaignResult({ campaignId = 'ONAM_2026' } = {}) {
  const isOnam = campaignId === 'ONAM_2026';
  const isDiwali = campaignId === 'DIWALI_2026';

  if (isDiwali) {
    return Object.freeze({
      ...mockMeta(),
      available: true,
      id: 'DIWALI_2026',
      name: 'Diwali Solar Fest',
      active: true,
      template: 'FESTIVAL_DIWALI',
      yearBadge: '2026',
      theme: Object.freeze({
        primary: '#1a0a2e',
        secondary: '#2d1854',
        accent: '#d4a516',
        background: '#0f0520',
        text: '#f5f0e8',
        muted: '#a89bc2',
      }),
      headline: 'Diwali Solar Fest',
      subheadline: 'Light up your home with solar this Diwali!',
      heroImage: null,
      primaryBenefit: Object.freeze({
        headline: 'Festival Offers Worth Up To',
        displayValue: '30,000+',
        description: 'Exclusive Diwali solar benefits for your home',
      }),
      offers: Object.freeze([
        Object.freeze({ id: 'dw1', title: 'Free Smart Meter', description: 'Wi-Fi enabled energy monitor', displayValue: 'Worth 5,000', image: null, enabled: true, sortOrder: 1 }),
        Object.freeze({ id: 'dw2', title: 'Extended Warranty', description: 'Additional 2 years panel warranty', displayValue: '+2 Years', image: null, enabled: true, sortOrder: 2 }),
        Object.freeze({ id: 'dw3', title: 'Referral Bonus', description: 'Earn when your friends go solar', displayValue: '3,000 per referral', image: null, enabled: true, sortOrder: 3 }),
      ]),
      luckyDraw: Object.freeze({ enabled: false, title: null, description: null, image: null }),
      referral: Object.freeze({ enabled: true, title: 'Refer & Earn', description: 'Share the light of solar', rewardText: '3,000 per referral', image: null }),
      urgency: Object.freeze({ enabled: true, displayText: 'Offer Ends Soon', remainingCount: null }),
      cta: Object.freeze({ enabled: true, buttonText: 'Book Your Solar System Today!', description: 'Celebrate Diwali with clean energy', actionType: 'BOOKING' }),
      artwork: Object.freeze({
        illustrationImage: null,
        decorationImage: null,
        qrImage: 'assets/quotation/campaign-qr.jpg',
      }),
      disclaimer: '*T&C Apply. Offer valid during the campaign period. Benefits vary by system configuration and eligibility.',
    });
  }

  // Default: Onam campaign
  return Object.freeze({
    ...mockMeta(),
    available: true,
    id: 'ONAM_2026',
    name: 'Onam Solar Fest',
    active: true,
    template: 'FESTIVAL_ONAM',
    yearBadge: '2026',
    theme: Object.freeze({
      primary: '#123f35',
      secondary: '#1c6b3f',
      accent: '#F5901E',
      background: '#fff9ec',
      text: '#16262b',
      muted: '#5b656a',
    }),
    headline: 'Onam Solar Fest',
    subheadline: 'Celebrate Onam with Flarize!',
    heroImage: null,
    primaryBenefit: Object.freeze({
      headline: 'Festival Offers Worth Up To',
      displayValue: '40,000+',
      description: 'Exclusive Onam solar benefits for your home',
    }),
    offers: Object.freeze([
      Object.freeze({ id: 'on1', title: 'Win an AC Voucher', description: 'Available for Eligible Bookings', displayValue: null, image: null, enabled: true, sortOrder: 1 }),
      Object.freeze({ id: 'on2', title: 'Free Hybrid Upgrade', description: 'Go solar, ride electric — celebrate Onam the sustainable way.', displayValue: null, image: null, enabled: true, sortOrder: 2 }),
      Object.freeze({ id: 'on3', title: 'Referral Reward', description: 'Refer a friend, earn rewards', displayValue: null, image: null, enabled: true, sortOrder: 3 }),
    ]),
    luckyDraw: Object.freeze({ enabled: true, title: '5 Lucky Winners', description: 'Win an EV bike this Onam!', image: null }),
    referral: Object.freeze({ enabled: true, title: 'Refer & Earn', description: 'Refer a friend and earn solar rewards', rewardText: 'Earn rewards on every referral', image: null }),
    urgency: Object.freeze({ enabled: true, displayText: 'LIMITED SLOTS', remainingCount: null }),
    cta: Object.freeze({ enabled: true, buttonText: 'Book Your Solar System Today!', description: 'Celebrate Onam with clean energy for a brighter tomorrow — limited festival slots available.', actionType: 'BOOKING' }),
    artwork: Object.freeze({
      illustrationImage: 'assets/quotation/campaign-mahabali.jpg',
      decorationImage: 'assets/quotation/campaign-floral.jpg',
      qrImage: 'assets/quotation/campaign-qr.jpg',
    }),
    disclaimer: '*T&C Apply. Offer valid during the campaign period. Benefits vary by system configuration and eligibility.',
  });
}

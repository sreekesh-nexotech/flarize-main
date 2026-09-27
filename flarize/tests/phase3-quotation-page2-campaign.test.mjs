// PAGE 2 — permanent Onam Offer Page.
//
// V4 quotation-finalization Phase 2B. The FESTIVAL_ONAM / FESTIVAL_DIWALI /
// FESTIVAL_GENERIC template selector, resolveTemplate, APPROVED_TEMPLATES,
// validateTheme and DEFAULT_THEME are DELETED. Page 2 is ONE permanent
// visual (the approved Onam artwork) with dynamic offer data supplied by
// payload.campaign.value and CTA contact bound to payload.company.value.
//
// This suite asserts:
//  - the removed API surface is really removed;
//  - the single-visual renderer preserves the approved DOM contract;
//  - every dynamic region binds to the authoritative source (no hardcode);
//  - missing dynamic values suppress their region without inventing;
//  - CAMPAIGN PERIOD binds to payload.campaign.value.period pass-through;
//  - CTA website/phone bind to payload.company.value.*;
//  - lucky-draw winners bind to campaign.value.luckyDraw.winners;
//  - no XSS surface, no calculation, no clock, no randomness on Page 2.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as D from '../public/lib/quotationDocument.js';

const RENDERER_SRC = readFileSync('public/lib/quotationDocument.js', 'utf8');
const PAGE_SRC     = readFileSync('public/quotation-document.html', 'utf8');

// ---------------------------------------------------------------------------
// helpers — a payload with a live Onam campaign, from a hand-built snapshot
// ---------------------------------------------------------------------------

function makeCampaignPayload(overrides = {}) {
  return {
    campaign: {
      available: true,
      source: 'CMS',
      value: {
        id: 'ONAM_QA',
        name: 'Onam Solar Fest',
        active: true,
        template: null,          // renderer ignores template — single visual
        yearBadge: '2027',       // deliberately not 2026 to prove no hardcode
        theme: { festival: 'Onam' }, // 2026-09-10: festival word / Onam artwork print only when the campaign names the festival
        headline: 'ഓണം സോളാർ ഫെസ്റ്റ്',
        subheadline: 'Celebrate Onam with Flarize!',
        heroImage: null,
        primaryBenefit: { headline: 'Festival Offers Worth Up To', displayValue: '42,500+', description: 'Exclusive Onam solar benefits' },
        offers: [
          { id: 'o1', title: 'Win an AC Voucher', description: 'Available for Eligible Bookings', enabled: true, sortOrder: 1, image: null },
          { id: 'o2', title: 'Free Hybrid Upgrade', description: '+ Buyback Support', enabled: true, sortOrder: 2, image: null },
          { id: 'o3', title: 'Refer Friends & Win More Prizes', description: 'Earn rewards for every successful referral.', enabled: true, sortOrder: 3, image: null },
        ],
        luckyDraw: { enabled: true, title: 'Win an Electric Scooter', description: 'Every eligible solar booking enters the grand festival draw.', winners: 7, image: null },
        referral: { enabled: false },
        urgency:  { enabled: true, displayText: 'LIMITED SLOTS', remainingCount: 41 },
        cta:      { enabled: true, buttonText: 'Book Your Solar System Today!', description: 'Celebrate Onam with clean energy for a brighter tomorrow.' },
        artwork:  { illustrationImage: 'assets/quotation/q-page-02-mahabali.jpg', decorationImage: 'assets/quotation/q-page-02-onam-floral.jpg', qrImage: 'assets/quotation/q-page-02-qr.jpg' },
        disclaimer: '*T&C Apply. Offer valid during the campaign period.',
        period: { displayText: '15 AUG – 5 SEP', note: 'Book before 5th September to avail these exclusive festival offers.' },
        ...overrides.campaignValue,
      },
    },
    company: {
      available: true, source: 'COMPANY_MASTER',
      value: {
        website: 'www.flarize.com', phone: '+91 9995 073 579',
        ...(overrides.companyValue ?? {}),
      },
    },
    ...overrides.payload,
  };
}

// ---------------------------------------------------------------------------
// A. seasonal selector architecture is DELETED
// ---------------------------------------------------------------------------

test('A1 — removed exports (seasonal selector): resolveTemplate / APPROVED_TEMPLATES / validateTheme / DEFAULT_THEME', () => {
  assert.equal(typeof D.resolveTemplate,    'undefined', 'resolveTemplate must be removed');
  assert.equal(typeof D.APPROVED_TEMPLATES, 'undefined', 'APPROVED_TEMPLATES must be removed');
  assert.equal(typeof D.validateTheme,      'undefined', 'validateTheme must be removed');
  assert.equal(typeof D.DEFAULT_THEME,      'undefined', 'DEFAULT_THEME must be removed');
});

test('A2 — renderer source carries no FESTIVAL_* template identifiers as code', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const s of ["'FESTIVAL_ONAM'", '"FESTIVAL_ONAM"', "'FESTIVAL_DIWALI'", '"FESTIVAL_DIWALI"', "'FESTIVAL_GENERIC'", '"FESTIVAL_GENERIC"']) {
    assert.equal(code.includes(s), false, `code must not contain ${s}`);
  }
  // No data-template attribute on Page 2 output (single visual).
  const html = D.renderPage2(makeCampaignPayload());
  assert.equal(html.includes('data-template='), false, 'Page 2 must render one visual — no data-template selector');
});

// ---------------------------------------------------------------------------
// B. approved DOM contract is preserved
// ---------------------------------------------------------------------------

test('B1 — Page 2 renders the approved DOM regions in order', () => {
  const html = D.renderPage2(makeCampaignPayload());
  assert.ok(html.includes('data-page-section="SEASONAL_CAMPAIGN"'));
  assert.ok(html.includes('data-document-order="2"'));
  const idx = {
    header:   html.indexOf('q2-header'),
    hero:     html.indexOf('q2-hero'),
    benefit:  html.indexOf('q2-benefit-band'),
    lucky:    html.indexOf('q2-lucky'),
    offers:   html.indexOf('q2-offers-grid'),
    why:      html.indexOf('q2-why'),
    period:   html.indexOf('q2-period-card'),
    cta:      html.indexOf('q2-cta-row'),
    disclaim: html.indexOf('q2-disclaimer'),
  };
  for (const [k, v] of Object.entries(idx)) assert.ok(v > 0, `${k} region present`);
  assert.ok(idx.header < idx.hero, 'header before hero');
  assert.ok(idx.hero < idx.benefit, 'hero before primary benefit band');
  assert.ok(idx.benefit < idx.lucky, 'benefit before lucky draw');
  assert.ok(idx.lucky < idx.offers, 'lucky before offers');
  assert.ok(idx.offers < idx.why, 'offers before WHY BOOK section');
  assert.ok(idx.why < idx.cta, 'WHY BOOK before CTA');
  assert.ok(idx.cta < idx.disclaim, 'CTA before disclaimer');
});

test('B2 — Onam floral decoration renders at all four corners (approved permanent artwork)', () => {
  const html = D.renderPage2(makeCampaignPayload());
  for (const c of ['q2-deco-tr', 'q2-deco-tl', 'q2-deco-bl', 'q2-deco-br']) {
    assert.ok(html.includes(c), `${c} corner floral present`);
  }
});

test('B3 — WHY BOOK DURING ONAM section carries the four approved items verbatim', () => {
  const html = D.renderPage2(makeCampaignPayload());
  assert.ok(html.includes('WHY BOOK DURING ONAM?'));
  for (const item of ['Better Savings', 'Exclusive Gifts', 'Faster Installation', 'Limited Time Only']) {
    assert.ok(html.includes(item), `approved WHY BOOK item present: ${item}`);
  }
});

test('B4 — a campaign without a festival prints neutral wording and no Onam-only artwork (2026-09-10)', () => {
  const html = D.renderPage2(makeCampaignPayload({ campaignValue: { id: 'MONSOON_QA', theme: null, artwork: null, name: 'Monsoon Offer', primaryBenefit: { headline: 'Offers worth up to', displayValue: '42,500+' }, subheadline: 'Book this month and save more', cta: { enabled: true, buttonText: 'Book today', description: 'Call or scan the QR.' } } }));
  assert.ok(html.includes('WHY BOOK NOW?'), 'neutral WHY BOOK header');
  assert.equal(html.includes('ONAM'), false, 'no ONAM word');
  assert.equal(/FESTIVAL/.test(html), false, 'no FESTIVAL word anywhere');
  assert.equal(html.includes('q2-mahabali'), false, 'no Mahabali illustration');
  assert.equal(html.includes('q2-deco-tr'), false, 'no floral corners');
  assert.ok(html.includes('MONSOON OFFER'), 'year badge carries the campaign name');
  assert.ok(html.includes('Offers worth up to ₹42,500+'), 'WHY BOOK savings line uses the campaign benefit value, never a fixed figure');
});

test('B5 — WHY BOOK savings line tracks primaryBenefit.displayValue; absent value → generic line', () => {
  const a = D.renderPage2(makeCampaignPayload({ campaignValue: { primaryBenefit: { headline: 'X', displayValue: '19,900+' } } }));
  assert.ok(a.includes('Offers worth up to ₹19,900+'));
  assert.equal(a.includes('40,000'), false);
  const b = D.renderPage2(makeCampaignPayload({ campaignValue: { primaryBenefit: null } }));
  assert.ok(b.includes('Bundled offers &amp; vouchers'));
});

// ---------------------------------------------------------------------------
// C. dynamic bindings — no hardcoded artwork sample values
// ---------------------------------------------------------------------------

test('C1 — headline / subheadline / yearBadge bind to payload.campaign.value', () => {
  const html = D.renderPage2(makeCampaignPayload());
  assert.ok(html.includes('ഓണം സോളാർ ഫെസ്റ്റ്'));
  // Sub-headline text is bound verbatim; the approved artwork's colour accents
  // (festival word green, "Flarize!" orange) are spans around the same words.
  assert.ok(html.replace(/<\/?span[^>]*>/g, '').includes('Celebrate Onam with Flarize!'));
  assert.ok(html.includes('<span class="q2-sub-fest">Onam</span>') && html.includes('<span class="q2-sub-brand">Flarize!</span>'), 'approved accents on festival + brand');
  assert.ok(html.includes('2027'), 'year badge from payload (not hardcoded 2026)');
});

test('C2 — urgency remainingCount binds to payload — no hardcoded 35', () => {
  const html = D.renderPage2(makeCampaignPayload());
  assert.ok(html.includes('Only'));
  assert.ok(html.includes('41'), 'urgency count from payload');
  assert.equal(html.includes('Only 35'), false, 'no hardcoded 35');
});

test('C3 — primary benefit displayValue binds to payload (band and WHY-BOOK line both follow it)', () => {
  const html = D.renderPage2(makeCampaignPayload());
  // The primary benefit BAND value must reflect the payload — not the approved
  // static WHY-BOOK item (which is permanent artwork copy per D7).
  const bandMatch = html.match(/class="q2-benefit-band-value">([^<]+)</);
  assert.ok(bandMatch, 'primary benefit band renders');
  assert.ok(bandMatch[1].includes('₹42,500+'), 'benefit band value comes from payload');
  // A second payload with a different amount must change the band.
  const other = D.renderPage2(makeCampaignPayload({ campaignValue: { primaryBenefit: { headline: 'X', displayValue: '19,900+', description: 'y' } } }));
  const otherMatch = other.match(/class="q2-benefit-band-value">([^<]+)</);
  assert.ok(otherMatch[1].includes('₹19,900+'), 'benefit band tracks payload changes');
});

test('C4 — lucky-draw winners binds to campaign.value.luckyDraw.winners — no hardcoded "5 Lucky Winners"', () => {
  const html = D.renderPage2(makeCampaignPayload());
  assert.ok(html.includes('7 Lucky Winners'), 'winners count from payload');
  assert.equal(html.includes('5 Lucky Winners'), false, 'no hardcoded 5 winners');
});

test('C5 — lucky-draw winners text SUPPRESSES when winners is absent', () => {
  const p = makeCampaignPayload({ campaignValue: { luckyDraw: { enabled: true, title: 'Win a Prize', description: 'desc', image: null } } });
  const html = D.renderPage2(p);
  assert.ok(html.includes('Win a Prize'), 'lucky draw title still renders');
  assert.equal(/\d+\s+Lucky Winners/.test(html), false, 'no winners line without payload.winners');
});

test('C6 — campaign period card binds to campaign.value.period pass-through', () => {
  const html = D.renderPage2(makeCampaignPayload());
  assert.ok(html.includes('CAMPAIGN PERIOD'));
  assert.ok(html.includes('15 AUG – 5 SEP'), 'period display from payload');
  assert.ok(html.includes('Book before 5th September'), 'period note from payload');
});

test('C7 — campaign period card SUPPRESSES when period is null', () => {
  const p = makeCampaignPayload({ campaignValue: { period: null } });
  const html = D.renderPage2(p);
  assert.equal(html.includes('CAMPAIGN PERIOD'), false, 'period card fully suppressed when null');
});

test('C8 — CTA website + phone bind to payload.company.value (not to campaign, not hardcoded)', () => {
  const html = D.renderPage2(makeCampaignPayload({
    companyValue: { website: 'www.example.co', phone: '+91 90000 12345' },
  }));
  assert.ok(html.includes('www.example.co'));
  assert.ok(html.includes('+91 90000 12345'));
  assert.equal(html.includes('999 508 3579'), false, 'no hardcoded sample phone');
});

test('C9 — CTA contact row suppresses fields the Company Master does not supply', () => {
  const p = makeCampaignPayload({ companyValue: { website: 'x.com', phone: null } });
  const html = D.renderPage2(p);
  assert.ok(html.includes('x.com'));
  assert.equal(html.includes('q2-cta-info-phone'), false, 'phone row suppressed when phone missing');
});

test('C10 — CTA card is not rendered when both button text and description are absent', () => {
  const p = makeCampaignPayload({ campaignValue: { cta: { enabled: true } } });
  const html = D.renderPage2(p);
  assert.equal(html.includes('q2-cta-row'), false, 'CTA row absent without cta content');
});

test('C11 — QR image binds to campaign.value.artwork.qrImage', () => {
  const p = makeCampaignPayload({ campaignValue: { artwork: { qrImage: 'assets/quotation/q-page-02-qr.jpg' } } });
  const html = D.renderPage2(p);
  assert.ok(html.includes('assets/quotation/q-page-02-qr.jpg'));
});

test('C12 — Mahabali illustration binds to campaign.value.artwork.illustrationImage', () => {
  const p = makeCampaignPayload({ campaignValue: { artwork: { illustrationImage: 'assets/quotation/q-page-02-mahabali.jpg', decorationImage: 'assets/quotation/q-page-02-onam-floral.jpg' } } });
  const html = D.renderPage2(p);
  assert.ok(html.includes('assets/quotation/q-page-02-mahabali.jpg'));
});

// ---------------------------------------------------------------------------
// D. no-campaign / no-render safety
// ---------------------------------------------------------------------------

test('D1 — empty string when campaign.available is false', () => {
  assert.equal(D.renderPage2({ campaign: { available: false } }), '');
  assert.equal(D.renderPage2({}), '');
  assert.equal(D.renderPage2({ campaign: null }), '');
});

// ---------------------------------------------------------------------------
// E. purity — no clock, no arithmetic, no hardcoded artwork values
// ---------------------------------------------------------------------------

test('E1 — no Date/Random in renderer', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/\bDate\.now\b/.test(code), false);
  assert.equal(/\bnew Date\b/.test(code), false);
  assert.equal(/\bMath\.random\b/.test(code), false);
});

test('E2 — no hardcoded artwork sample values in renderer code', () => {
  const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Sample values from approved artwork that must never be code literals:
  //   "2026", "35", "40,000", "5 Lucky Winners", "29 JULY", "12 AUGUST",
  //   the mock phone number, "www.flarize.com"
  assert.equal(/['"]2026['"]/.test(code), false, 'no hardcoded 2026');
  assert.equal(code.includes("'35'"), false);
  assert.equal(code.includes("'40,000'"), false);
  assert.equal(code.includes("'40000'"), false);
  assert.equal(code.includes('5 Lucky Winners'), false);
  assert.equal(code.includes('29 JULY'), false);
  assert.equal(code.includes('12 AUGUST'), false);
  assert.equal(code.includes('999 508 3579'), false);
  assert.equal(code.includes("'www.flarize.com'"), false);
});

// ---------------------------------------------------------------------------
// F. XSS surface
// ---------------------------------------------------------------------------

test('F1 — CMS text is HTML-escaped', () => {
  const p = makeCampaignPayload({
    campaignValue: {
      headline: '<script>alert("xss")</script>',
      subheadline: '<img onerror="hack()" src=x>',
      primaryBenefit: { headline: '<iframe>', displayValue: '<b>bad</b>', description: 'desc' },
      offers: [{ id: 'o', title: '<svg onload=alert(1)>', description: 'safe', enabled: true, sortOrder: 1 }],
      luckyDraw: { enabled: true, title: '<script>', description: 'x', winners: 3, image: null },
      period: { displayText: '<script>', note: '<b>' },
    },
  });
  const html = D.renderPage2(p);
  assert.equal(html.includes('<script>alert'), false);
  assert.equal(html.includes('<iframe'), false);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;svg'));
  // Primary benefit headline is uppercased before HTML-escaping, so the
  // escaped form is upper-case too.
  assert.ok(html.includes('&lt;IFRAME') || html.includes('&lt;iframe'),
    'iframe tag from CMS must be escaped (either case)');
});

// ---------------------------------------------------------------------------
// G. blockedFieldsPage2 reports every suppressed dependency
// ---------------------------------------------------------------------------

test('G1 — blockedFieldsPage2 names Company Master when contact fields are missing', () => {
  const p = makeCampaignPayload({ companyValue: { website: null, phone: null } });
  const blocked = D.blockedFieldsPage2(p);
  const labels = blocked.map(b => b.label);
  assert.ok(labels.includes('Contact Website'));
  assert.ok(labels.includes('Contact Phone'));
  for (const b of blocked) assert.ok(b.dependency, `${b.label} names its dependency`);
});

test('G2 — blockedFieldsPage2 names CMS when no active campaign is supplied', () => {
  const blocked = D.blockedFieldsPage2({});
  const labels = blocked.map(b => b.label);
  for (const l of ['Campaign Headline', 'Campaign Subheadline', 'Primary Benefit', 'Campaign Name', 'Campaign Period', 'Contact Website', 'Contact Phone']) {
    assert.ok(labels.includes(l), `${l} reported`);
  }
});

// ---------------------------------------------------------------------------
// H. downstream contract preserved — Phase 2D reproducibility
// ---------------------------------------------------------------------------

test('H1 — payload assembler additive pass-through: campaign.value.period is exposed', () => {
  const PAYLOAD_SRC = readFileSync('src/lib/quotationPayload.js', 'utf8');
  assert.ok(PAYLOAD_SRC.includes('period: campaignResult.period'),
    'quotationPayload.js must expose campaign.value.period as pure additive pass-through');
});

test('H2 — resolveCampaignResult passes activeCampaign.period through', () => {
  const WS_SRC = readFileSync('src/lib/quotationWorkspace.js', 'utf8');
  assert.ok(WS_SRC.includes('period: activeCampaign.period'),
    'quotationWorkspace resolveCampaignResult must pass activeCampaign.period through');
});

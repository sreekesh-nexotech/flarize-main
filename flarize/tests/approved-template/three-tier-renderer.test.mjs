/**
 * THREE-TIER RENDERER — approvedTemplate.js tryTier() unit tests (Step 1).
 *
 * Verifies:
 *   - tryTier reads the primary top-level payload when its packageTier matches
 *     the requested tier's internal key.
 *   - tryTier walks payload.alternatives[] to find non-primary tiers.
 *   - Customer-facing keys (elite/smart/essential) map to internal keys
 *     (premium/value/base) — no other naming system.
 *   - Renderer does NOT compute prices, EMI, savings, subsidy, financing.
 *   - dailyValue / *Daily tokens block on SAVINGS_ENGINE_MISSING_DAILY_FIELD
 *     when snapshot lacks dailySavings — never a silent /30 division.
 *   - Renderer never introduces arithmetic on payload values (source lint).
 *   - Every registered token has a whitelisted authoritative source.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TOKEN_REGISTRY,
  PRODUCTION_BLOCKER,
  AUTHORITATIVE_SOURCES,
  substituteMustaches,
  validateUnresolvedTokens,
} from '../../src/lib/approvedTemplate.js';

// ---------------------------------------------------------------------------
// A payload that carries three tier snapshots. Numbers are illustrative;
// tests read them back and do not compute new values.
// ---------------------------------------------------------------------------
function threeTierPayload() {
  const smart = {
    pricing:   { available: true, source: 'CS', value: { customerTotalIncludingGST: 268000 } },
    financing: { available: true, source: 'FIN', value: {
      downPaymentPercentage: 10, downPaymentAmount: 26800,
      tenureYears: 10, interestRatePct: 8,
      postSubsidyInvestment: 190000, monthlyEMI: 2306,
    }},
    savings:   { available: true, source: 'SAV', value: {
      monthlySavings: 5500, monthlySavingsLow: 5183, monthlySavingsHigh: 5700,
      dailySavings: 183,
    }},
    subsidy:   { available: true, source: 'SUB', value: { subsidyAmount: 78000 } },
    system:    { available: true, source: 'PROJ', value: { systemSizeKw: 5, packageTier: 'value' } },
  };
  const elite = {
    pricing:   { available: true, source: 'CS', value: { customerTotalIncludingGST: 338000 } },
    financing: { available: true, source: 'FIN', value: {
      downPaymentPercentage: 10, downPaymentAmount: 33800,
      tenureYears: 10, interestRatePct: 8,
      postSubsidyInvestment: 260000, monthlyEMI: 3155,
    }},
    savings:   { available: true, source: 'SAV', value: {
      monthlySavings: 6100, monthlySavingsLow: 5750, monthlySavingsHigh: 6320,
      dailySavings: 203,
    }},
    subsidy:   { available: true, source: 'SUB', value: { subsidyAmount: 78000 } },
    system:    { available: true, source: 'PROJ', value: { systemSizeKw: 5, packageTier: 'premium' } },
  };
  const essential = {
    pricing:   { available: true, source: 'CS', value: { customerTotalIncludingGST: 198000 } },
    financing: { available: true, source: 'FIN', value: {
      downPaymentPercentage: 10, downPaymentAmount: 19800,
      tenureYears: 10, interestRatePct: 8,
      postSubsidyInvestment: 120000, monthlyEMI: 1456,
    }},
    savings:   { available: true, source: 'SAV', value: {
      monthlySavings: 4800, monthlySavingsLow: 4520, monthlySavingsHigh: 4990,
      dailySavings: 160,
    }},
    subsidy:   { available: true, source: 'SUB', value: { subsidyAmount: 78000 } },
    system:    { available: true, source: 'PROJ', value: { systemSizeKw: 5, packageTier: 'base' } },
  };
  return {
    ...smart,
    alternatives: [
      { optionIndex: 0, tier: 'premium', bomSnapshotId: 'SNAP-x-prem', commercialSnapshotId: 'CS-x-prem', payload: elite },
      { optionIndex: 1, tier: 'base',    bomSnapshotId: 'SNAP-x-base', commercialSnapshotId: 'CS-x-base', payload: essential },
    ],
  };
}

// A tiny HTML snippet containing exactly the 23 approved mustache tokens.
const ALL_MUSTACHES_HTML = `
<div>
  {{ eliteCost }} {{ smartCost }} {{ essentialCost }}
  {{ downLabel }} {{ eliteDown }} {{ smartDown }} {{ essentialDown }}
  {{ subsidyAmt }} {{ smartSubsidyMinus }}
  {{ eliteFin }} {{ smartFin }} {{ essentialFin }}
  {{ emiLabel }} {{ emiOn }} {{ emiValue }}
  {{ eliteEmiValue }} {{ smartEmiValue }} {{ essentialEmiValue }}
  {{ dailyValue }} {{ eliteDaily }} {{ smartDaily }} {{ essentialDaily }}
  {{ savingsRange }}
</div>`;

// ═══════════════════════════════════════════════════════════════════════════
// tryTier — primary + alternatives
// ═══════════════════════════════════════════════════════════════════════════

describe('tryTier reads from payload.alternatives[]', () => {
  test('Smart price resolves from top-level (primary tier = value)', () => {
    const { html, unresolved } = substituteMustaches('{{ smartCost }}', threeTierPayload());
    assert.equal(unresolved.length, 0);
    assert.equal(html.trim(), '₹2,68,000');
  });

  test('Elite price resolves from premium alternative', () => {
    const { html, unresolved } = substituteMustaches('{{ eliteCost }}', threeTierPayload());
    assert.equal(unresolved.length, 0);
    assert.equal(html.trim(), '₹3,38,000');
  });

  test('Essential price resolves from base alternative', () => {
    const { html, unresolved } = substituteMustaches('{{ essentialCost }}', threeTierPayload());
    assert.equal(unresolved.length, 0);
    assert.equal(html.trim(), '₹1,98,000');
  });

  test('Financing per tier — down / postSubsidyInvestment / EMI', () => {
    const p = threeTierPayload();
    const { html: h } = substituteMustaches(
      '{{ eliteDown }} {{ smartDown }} {{ essentialDown }} ' +
      '{{ eliteFin }} {{ smartFin }} {{ essentialFin }} ' +
      '{{ eliteEmiValue }} {{ smartEmiValue }} {{ essentialEmiValue }}',
      p);
    // Down (negative-formatted)
    assert.ok(h.includes('−₹33,800'), 'eliteDown from premium alt');
    assert.ok(h.includes('−₹26,800'), 'smartDown from primary');
    assert.ok(h.includes('−₹19,800'), 'essentialDown from base alt');
    // Post-subsidy investment
    assert.ok(h.includes('₹2,60,000'), 'eliteFin from premium alt');
    assert.ok(h.includes('₹1,90,000'), 'smartFin from primary');
    assert.ok(h.includes('₹1,20,000'), 'essentialFin from base alt');
    // Monthly EMI per tier
    assert.ok(h.includes('₹3,155/mo'), 'eliteEmiValue from premium alt');
    assert.ok(h.includes('₹2,306/mo'), 'smartEmiValue from primary');
    assert.ok(h.includes('₹1,456/mo'), 'essentialEmiValue from base alt');
  });

  test('Savings per tier — dailySavings must come from snapshot (no renderer arithmetic)', () => {
    const p = threeTierPayload();
    const { html: h, unresolved } = substituteMustaches(
      '{{ dailyValue }} {{ eliteDaily }} {{ smartDaily }} {{ essentialDaily }}', p);
    assert.equal(unresolved.length, 0);
    assert.ok(h.includes('₹183/day'), 'dailyValue from primary savings.dailySavings');
    assert.ok(h.includes('₹203/day'), 'eliteDaily from premium alt');
    assert.ok(h.includes('₹160/day'), 'essentialDaily from base alt');
  });

  test('Subsidy is per-primary and shared (constant across tiers for a given system size)', () => {
    const p = threeTierPayload();
    const { html: h } = substituteMustaches('{{ subsidyAmt }} {{ smartSubsidyMinus }}', p);
    assert.ok(h.includes('₹78,000'),  'positive subsidy');
    assert.ok(h.includes('−₹78,000'), 'negative subsidy');
  });

  test('Savings range binds to top-level (Page 12 single-tier context)', () => {
    const p = threeTierPayload();
    const { html: h } = substituteMustaches('{{ savingsRange }}', p);
    assert.equal(h.trim(), '₹5,183–5,700');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOCKERS when snapshot lacks fields (never silent defaulting)
// ═══════════════════════════════════════════════════════════════════════════

describe('blockers when snapshot lacks per-tier fields', () => {
  test('dailyValue blocks SAVINGS_ENGINE_MISSING_DAILY_FIELD when dailySavings absent', () => {
    const p = threeTierPayload();
    delete p.savings.value.dailySavings;
    const { unresolved } = substituteMustaches('{{ dailyValue }}', p);
    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0].token, 'dailyValue');
    assert.equal(unresolved[0].blocker, PRODUCTION_BLOCKER.SAVINGS_ENGINE_MISSING_DAILY_FIELD);
  });

  test('eliteCost blocks TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT when premium alternative missing', () => {
    const p = threeTierPayload();
    // Remove the premium alt
    p.alternatives = p.alternatives.filter(a => a.tier !== 'premium');
    const { unresolved } = substituteMustaches('{{ eliteCost }}', p);
    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0].blocker, PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT);
  });

  test('essentialCost blocks when base alternative missing', () => {
    const p = threeTierPayload();
    p.alternatives = p.alternatives.filter(a => a.tier !== 'base');
    const { unresolved } = substituteMustaches('{{ essentialCost }}', p);
    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0].blocker, PRODUCTION_BLOCKER.TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RENDERER PURITY — no arithmetic anywhere in renderer source
// ═══════════════════════════════════════════════════════════════════════════

describe('renderer purity — no arithmetic on payload values', () => {
  test('src/lib/approvedTemplate.js contains no `/ 30`, no `* 12`, no arithmetic-on-payload patterns', () => {
    const src = readFileSync('src/lib/approvedTemplate.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    // No dividing by 30 (was the old dailyValue hack)
    assert.equal(/\/\s*30\b/.test(src), false, 'no "/ 30" division');
    // No multiplying by 12 (annualise)
    assert.equal(/\*\s*12\b/.test(src), false, 'no "* 12" multiplication');
    // No `payload.<something> [+*/-] <something>` arithmetic patterns
    assert.equal(/payload\.\w+.*[+\-*/]\s*payload\./.test(src), false,
      'no cross-payload arithmetic');
  });

  test('every TOKEN_REGISTRY entry declares an AUTHORITATIVE source', () => {
    for (const t of TOKEN_REGISTRY) {
      assert.ok(AUTHORITATIVE_SOURCES.has(t.source),
        `token ${t.token} source "${t.source}" not in AUTHORITATIVE_SOURCES`);
    }
  });

  test('every daily-savings token carries SAVINGS_ENGINE_MISSING_DAILY_FIELD blocker', () => {
    for (const name of ['dailyValue', 'eliteDaily', 'smartDaily', 'essentialDaily']) {
      const entry = TOKEN_REGISTRY.find(t => t.token === name);
      assert.ok(entry, `missing token ${name}`);
      assert.equal(entry.blocker, PRODUCTION_BLOCKER.SAVINGS_ENGINE_MISSING_DAILY_FIELD,
        `${name} must block on SAVINGS_ENGINE_MISSING_DAILY_FIELD`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ONE-QUOTATION invariant proof (payload shape assertion)
// ═══════════════════════════════════════════════════════════════════════════

describe('one-quotation payload shape (three tiers, one document)', () => {
  test('primary is Smart; alternatives carry premium + base only', () => {
    const p = threeTierPayload();
    assert.equal(p.system.value.packageTier, 'value',
      'top-level packageTier must be the recommended value');
    assert.equal(p.alternatives.length, 2, 'exactly two alternatives');
    const tiers = p.alternatives.map(a => a.tier).sort();
    assert.deepEqual(tiers, ['base', 'premium'],
      'alternatives are the two non-primary tiers');
    // No duplicate value/Smart entry in alternatives
    assert.equal(p.alternatives.some(a => a.tier === 'value'), false,
      'primary tier must not appear in alternatives[]');
  });

  test('resolving all 23 tokens against a well-formed payload leaves nothing unresolved', () => {
    const p = threeTierPayload();
    const { html, unresolved } = substituteMustaches(ALL_MUSTACHES_HTML, p);
    assert.equal(unresolved.length, 0,
      `expected 0 unresolved, got: ${unresolved.map(u => u.token).join(', ')}`);
    // Also confirm the substituted HTML has no {{…}} left
    const validation = validateUnresolvedTokens(html, unresolved, { strict: false });
    assert.equal(validation.status, 'READY');
  });
});

/**
 * Phase 2 · Sales Wizard · error-mapper pure-function test.
 *
 * Verifies every orchestrator + preflight error code maps to a
 * customer-friendly business message + owner label. Raw enum names
 * must never appear in the primary message.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { translateOrchestratorError, translatePreflightBlockers } = require('../public/lib/sales-wizard-errors.js');

describe('translateOrchestratorError · every documented code maps to a friendly message', () => {
  const cases = [
    { code: 'NO_APPROVED_PACKAGE',       owner: 'Engineering',          msgIncludes: 'not yet approved for sales' },
    { code: 'ENGINEERING_BLOCKED',       owner: 'Engineering',          msgIncludes: 'Engineering validation failed' },
    { code: 'COST_INCOMPLETE',           owner: 'Procurement / Admin',  msgIncludes: 'cost information is not yet configured' },
    { code: 'PRICING_REJECTED',          owner: 'Admin',                msgIncludes: 'Commercial configuration' },
    { code: 'MARGIN_NOT_CONFIGURED',     owner: 'Admin',                msgIncludes: 'Commercial configuration' },
    { code: 'MARGIN_BELOW_MINIMUM',      owner: 'Admin',                msgIncludes: 'Commercial configuration' },
    { code: 'MARGIN_CONFIG_INVALID',     owner: 'Admin',                msgIncludes: 'Commercial configuration' },
    { code: 'GST_NOT_CONFIGURED',        owner: 'Admin',                msgIncludes: 'Commercial configuration' },
    { code: 'GST_REGIME_INVALID',        owner: 'Admin',                msgIncludes: 'Commercial configuration' },
    { code: 'GENERATION_BLOCKED',        owner: 'Sales / Admin',        msgIncludes: 'Quotation cannot be generated' },
    { code: 'MISSING_INPUT',             owner: 'Sales',                msgIncludes: 'required information is missing' },
    { code: 'ROLE_DENIED',               owner: 'Admin',                msgIncludes: 'role does not permit' },
    { code: 'ORCHESTRATION_FAILED',      owner: 'Support',              msgIncludes: 'Unable to complete this quotation' },
  ];
  for (const c of cases) {
    it(`${c.code} → owner=${c.owner}`, () => {
      const out = translateOrchestratorError(c.code, null);
      assert.equal(out.owner, c.owner);
      assert.ok(out.businessMessage.includes(c.msgIncludes),
        `expected message to include "${c.msgIncludes}", got "${out.businessMessage}"`);
      assert.equal(out.rawCode, c.code, 'raw code preserved for technical details expander');
    });
  }
});

describe('translateOrchestratorError · unknown code falls back safely', () => {
  it('unknown code returns a generic Support-owned message', () => {
    const out = translateOrchestratorError('SOMETHING_WEIRD', null);
    assert.equal(out.owner, 'Support');
    assert.ok(out.businessMessage.includes('Unable to complete this quotation'));
    assert.equal(out.rawCode, 'SOMETHING_WEIRD');
  });

  it('null code returns generic fallback', () => {
    const out = translateOrchestratorError(null, null);
    assert.equal(out.owner, 'Support');
    assert.equal(out.rawCode, null);
  });
});

describe('translateOrchestratorError · never echoes raw enum in primary message', () => {
  const FORBIDDEN_IN_PRIMARY = [
    'NO_APPROVED_PACKAGE', 'ENGINEERING_BLOCKED', 'COST_INCOMPLETE',
    'PRICING_REJECTED', 'MARGIN_NOT_CONFIGURED', 'GENERATION_BLOCKED',
    'MISSING_INPUT', 'ROLE_DENIED', 'ORCHESTRATION_FAILED',
  ];
  for (const code of FORBIDDEN_IN_PRIMARY) {
    it(`primary message for ${code} does not contain the raw enum string`, () => {
      const out = translateOrchestratorError(code, null);
      assert.ok(!out.businessMessage.includes(code),
        `businessMessage must not echo raw enum "${code}" — got "${out.businessMessage}"`);
    });
  }
});

describe('translateOrchestratorError · COST_INCOMPLETE surfaces blocked heads readably', () => {
  it('formats blockedHeads list into the message', () => {
    const out = translateOrchestratorError('COST_INCOMPLETE', {
      blockedHeads: ['MATERIAL_LANDED', 'TRANSPORTATION'],
    });
    assert.ok(out.businessMessage.includes('MATERIAL_LANDED'));
    assert.ok(out.businessMessage.includes('TRANSPORTATION'));
    // Even here, the primary message must be human-readable prose
    assert.ok(out.businessMessage.includes('not yet configured'));
  });

  it('handles missing blockedHeads gracefully', () => {
    const out = translateOrchestratorError('COST_INCOMPLETE', {});
    assert.ok(out.businessMessage.includes('not yet configured'));
  });
});

describe('translateOrchestratorError · GENERATION_BLOCKED surfaces failed checks readably', () => {
  it('names customer-friendly labels, not enum names, for failed gate checks', () => {
    const out = translateOrchestratorError('GENERATION_BLOCKED', {
      failedChecks: ['CUSTOMER_DATA', 'BOM_LOCKED', 'SUBSIDY_RESOLVED'],
    });
    assert.ok(out.businessMessage.includes('customer information'));
    assert.ok(out.businessMessage.includes('approved BOM'));
    assert.ok(out.businessMessage.includes('subsidy treatment'));
    // Enum names must NOT appear in the primary message
    assert.ok(!out.businessMessage.includes('CUSTOMER_DATA'));
    assert.ok(!out.businessMessage.includes('BOM_LOCKED'));
    assert.ok(!out.businessMessage.includes('SUBSIDY_RESOLVED'));
  });
});

describe('translatePreflightBlockers', () => {
  it('returns null when no blockers', () => {
    assert.equal(translatePreflightBlockers([]), null);
    assert.equal(translatePreflightBlockers(null), null);
  });

  it('maps first blocker with owner remap', () => {
    const out = translatePreflightBlockers([
      { code: 'NO_APPROVED_PACKAGE', message: 'Package pending', owner: 'PROJECT_HEAD' },
    ]);
    assert.equal(out.owner, 'Engineering');
    assert.equal(out.businessMessage, 'Package pending');
    assert.equal(out.rawCode, 'NO_APPROVED_PACKAGE');
  });

  it('preserves owner label when not in remap table', () => {
    const out = translatePreflightBlockers([
      { code: 'X', message: 'Whatever', owner: 'CUSTOM_OWNER' },
    ]);
    assert.equal(out.owner, 'CUSTOM_OWNER');
  });
});

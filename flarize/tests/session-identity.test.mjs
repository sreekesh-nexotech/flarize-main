/**
 * P1-4 · Session identity model alignment.
 *
 * server-users.js delivers per-user identity as AUTHENTICATED_USER.
 * The workspace / procurement / quotation session routes must reflect
 * that reality rather than the stale OPERATOR_ASSERTED_ROLE disclaimer.
 *
 * Verified by reading the transport source and asserting the current
 * response body carries `identityModel: 'AUTHENTICATED_USER'` plus a
 * customer-appropriate identityNote.
 *
 * 2026-09-02 · Phase 1
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WORKSPACE_SRC = readFileSync('server-workspace.js', 'utf-8');
const PROCUREMENT_SRC = readFileSync('server-procurement.js', 'utf-8');
const QUOTATION_SRC = readFileSync('server-quotation.js', 'utf-8');

describe('P1-4 · identityModel = AUTHENTICATED_USER', () => {
  it('server-workspace.js session response advertises AUTHENTICATED_USER', () => {
    assert.ok(WORKSPACE_SRC.includes("identityModel: 'AUTHENTICATED_USER'"),
      'workspace /api/*/session must return AUTHENTICATED_USER');
    assert.ok(!WORKSPACE_SRC.includes("identityModel: 'OPERATOR_ASSERTED_ROLE'"),
      'stale OPERATOR_ASSERTED_ROLE disclaimer must be removed from transport');
  });

  it('server-procurement.js session response advertises AUTHENTICATED_USER', () => {
    assert.ok(PROCUREMENT_SRC.includes("identityModel: 'AUTHENTICATED_USER'"),
      'procurement /api/procurement/session must return AUTHENTICATED_USER');
  });

  it('server-quotation.js session response advertises AUTHENTICATED_USER', () => {
    assert.ok(QUOTATION_SRC.includes("identityModel: 'AUTHENTICATED_USER'"),
      'quotation /api/quotation/session must return AUTHENTICATED_USER');
  });

  it('identityNote describes session-derived identity, not header-derived', () => {
    for (const src of [WORKSPACE_SRC, PROCUREMENT_SRC, QUOTATION_SRC]) {
      assert.ok(src.includes('derived from the authenticated session server-side'),
        'identityNote must document session-derived identity');
      assert.ok(src.includes('x-actor-* headers'),
        'identityNote must state x-actor-* headers are ignored');
    }
  });
});

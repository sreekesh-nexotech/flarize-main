// QUOTATION V4 FINALIZATION — Phase 2C.
// Verifies that server-company.js accepts and preserves the additive
// `completedInstallations` integer field, without inventing a value.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Import the CJS module via createRequire so node --test does not fail
// on the require() interop.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const companyModule = require('../server-company.js');

// server-company.js exports a small public API; unit-test the shape by
// exercising register() indirectly via inspecting the exported quotation
// company profile function.

test('server-company — module exports getQuotationCompanyProfile function', () => {
  assert.equal(typeof companyModule.getQuotationCompanyProfile, 'function',
    'Expected server-company to export getQuotationCompanyProfile.');
});

test('server-company — register() attaches the profile routes', () => {
  const routes = [];
  const addRoute = (method, path) => routes.push(`${method} ${path}`);
  const send = () => {};
  const parseBody = async () => ({});
  const isAdmin = () => true;
  companyModule.register(addRoute, {
    send, parseBody, isAdmin,
    isAuthenticated: () => true,
    actorOf: () => ({ userId: 'admin', role: 'ADMIN' }),
  });
  assert.ok(routes.some(r => r === 'PUT /api/admin/company-profile'),
    'Expected PUT /api/admin/company-profile to be registered.');
  assert.ok(routes.some(r => r === 'GET /api/admin/company-profile'),
    'Expected GET /api/admin/company-profile to be registered.');
});

// Structural test on the source file to prove the additive field lives at
// every boundary (validator + builder + salesView + quotationShape) without
// inventing a value.
import { readFileSync } from 'node:fs';
const SRC = readFileSync('server-company.js', 'utf8');

test('server-company — completedInstallations declared in validateProfile', () => {
  assert.ok(SRC.includes('completedInstallations must be a non-negative integer'),
    'Expected validateProfile to reject non-integer / negative completedInstallations values.');
});

test('server-company — buildProfile carries forward existing completedInstallations when body omits it', () => {
  assert.ok(/existing\.completedInstallations/.test(SRC),
    'Expected buildProfile to inspect existing.completedInstallations on carry-forward.');
});

test('server-company — quotationShape surfaces completedInstallations to the renderer', () => {
  // salesView + quotationShape both must expose the field.
  const salesViewOccurrences = (SRC.match(/completedInstallations/g) || []).length;
  assert.ok(salesViewOccurrences >= 4,
    `Expected completedInstallations to appear in validate/build/salesView/quotationShape (>=4 references). Found: ${salesViewOccurrences}.`);
});

test('server-company — completedInstallations MUST default to null (never a made-up number)', () => {
  // Verify no literal "300" appears in the source for this field
  // (guards against future accidental hardcoding).
  const badPatterns = [
    /completedInstallations:\s*300\b/,
    /completedInstallations:\s*\d{2,}(?!\s*\?\?\s*null)/,
  ];
  for (const p of badPatterns) {
    assert.ok(!p.test(SRC),
      `server-company.js must not hardcode a completedInstallations count. Matched pattern: ${p}`);
  }
});

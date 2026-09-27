/**
 * Legacy bridge — the 48 on-disk records survive V4 hydration and remain
 * runtime-visible, and revising one of them produces a clean DRAFT that
 * does not mutate the source.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hydrateRegistry, visibleForRuntime } from '../src/lib/packageProjection.js';
import { createRevision, PACKAGE_STATE } from '../src/lib/packageApproval.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_FILE = path.join(__dirname, '..', 'data', 'packages.proposed.json');

function loadRaw() {
  return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
}

test('the 48 legacy records all hydrate as legacyApproved=true', () => {
  const raw = loadRaw();
  assert.equal(raw.packages.length, 48, 'sanity — the on-disk snapshot has 48 records');
  const hydrated = hydrateRegistry(raw);
  for (const pkg of hydrated.packages) {
    assert.equal(pkg.legacyApproved, true, `Expected ${pkg.packageId} to be legacyApproved`);
    assert.equal(pkg.lastValidation, null);
    assert.equal(pkg.packageState, 'APPROVED');
  }
});

test('visibleForRuntime keeps all 48 legacy records', () => {
  const raw = loadRaw();
  const hydrated = hydrateRegistry(raw);
  const visible = visibleForRuntime(hydrated);
  assert.equal(visible.packages.length, 48);
});

test('createRevision on a legacy — DRAFT with legacyApproved=false, source untouched', () => {
  const raw = loadRaw();
  const hydrated = hydrateRegistry(raw);
  const source = hydrated.packages[0];
  const sourceSerialised = JSON.stringify(source);

  const actor = { userId: 'ph-01', role: 'PROJECT_HEAD' };
  const { package: revision } = createRevision(hydrated, {
    actor, sourcePackageId: source.packageId, at: '2026-09-03T00:00:00Z',
  });
  assert.equal(revision.packageState, PACKAGE_STATE.DRAFT);
  assert.equal(revision.legacyApproved, false);
  assert.equal(revision.lastValidation, null);
  assert.equal(revision.revisionNumber, (source.revisionNumber || 1) + 1);
  assert.equal(revision.comboKey, source.comboKey);
  assert.equal(revision.architecture, source.architecture); // may be null for legacy — inherited

  // Source is NOT mutated
  assert.equal(JSON.stringify(source), sourceSerialised, 'source record must not be mutated by createRevision');
});

// 2026-09-13 owner decision — PBC-M-003 (IQ System Controller mandatory for
// backup, D12) applies to HYBRID Enphase packs only. On-grid Elite is an Enphase
// micro-inverter pack with no battery, so it ships without a System Controller.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLES } from '../src/lib/bomRoles.js';
import { createProjectBom } from '../src/lib/projectBom.js';
import { checkProjectBom } from '../src/lib/engineeringChecker.js';

const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const MASTER = JSON.parse(readFileSync('data/battery-master.json', 'utf8')).batteries;
const AT = '2026-09-13T00:00:00Z';

const enphaseLines = () => ([
  { role: ROLES.PANEL, componentId: 'p1', quantity: 6 },
  { role: ROLES.MICRO_INVERTER, componentId: 'en1', quantity: 6 },
  { role: ROLES.STRUCTURE, componentId: 'sm_15x15', quantity: 10 },
  { role: ROLES.AC_ISOLATOR, componentId: 'is1', quantity: 1 },
]);

const bomFor = (sysType) => createProjectBom({
  projectId: `PRJ-${sysType}`, packageId: `${sysType}_premium`, architecture: 'ENPHASE',
  sysType, tier: 'premium', sizeKw: 3, phase: '1P', lines: enphaseLines(),
});

const m003 = (bom) => checkProjectBom({ bom, catalog, batteryMaster: MASTER, at: AT, catalogVersion: 'catalog@test' })
  .findings.filter(f => f.ruleId === 'PBC-M-003');

test('PBC-M-003 does NOT fire for an on-grid Enphase pack without a System Controller', () => {
  assert.equal(m003(bomFor('ongrid')).length, 0);
});

test('PBC-M-003 still fires for a hybrid Enphase pack without a System Controller', () => {
  const hits = m003(bomFor('hybrid'));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].severity, 'BLOCKED');
});

test('PBC-M-003 is satisfied on hybrid once the System Controller line is present', () => {
  const bom = createProjectBom({
    projectId: 'PRJ-hybrid-ok', packageId: 'hybrid_premium', architecture: 'ENPHASE',
    sysType: 'hybrid', tier: 'premium', sizeKw: 3, phase: '1P',
    lines: [...enphaseLines(), { role: ROLES.ENERGY_SYSTEM_CONTROLLER, componentId: 'en7', quantity: 1 }],
  });
  assert.equal(m003(bom).length, 0);
});

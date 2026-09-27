/**
 * AUTOMATIC ENGINEERING CHECKER.  (Phase 1E §4, §6, §12)
 *
 * The checker is the AUTHORITY on whether a project BOM is technically valid.
 * It is NOT the authority on what is in the BOM — that is the Project Head.
 *
 * Therefore this module is strictly READ-ONLY over the BOM. It returns findings.
 * It never removes, substitutes, re-selects, zeroes or reorders a component, and
 * it has no reference to any mutation function.
 *
 * DETERMINISM (§12)
 *   Same BOM + same catalog version + same rules version -> identical result.
 *   - no Date.now(), no Math.random(): the caller supplies `at`
 *   - no dependency on UI state, dropdown order or insertion order
 *   - findings sorted by (ruleId, componentIds)
 *   - no nearest-kW fallback, and no fallback of any kind: a missing input is
 *     reported, never guessed around
 *
 * NO THRESHOLD IS INVENTED. Where a limit is not present in the catalog the
 * check reports UNVERIFIABLE and names the missing field.
 */

import { ROLES } from './bomRoles.js';
import { toBatteryMaster } from './batteryMaster.js';
import { checkBatteryCompatibility, resolveProtectionRequirement } from './batteryCompatibility.js';
import { BATTERY_PROTECTION_MODE } from './resolveBattery.js';
import { APPROVED_UPGRADE_PATHS } from './upgradeModel.js';

export const RULES_VERSION = 'phase1e.1';

export const SEVERITY = { BLOCKED: 'BLOCKED', WARNING: 'WARNING', INFO: 'INFO' };
export const CHECK_STATUS = { VALID: 'VALID', WARNING: 'WARNING', BLOCKED: 'BLOCKED' };

/** Validation categories A–S from the brief §6. */
export const CATEGORY = {
  A: 'SYSTEM_ARCHITECTURE',
  B: 'PANEL_INVERTER_COMPATIBILITY',
  C: 'PANEL_ELECTRICAL_LIMITS',
  D: 'INVERTER_ELECTRICAL_LIMITS',
  E: 'BATTERY_INVERTER_COMPATIBILITY',
  F: 'BATTERY_VOLTAGE',
  G: 'BATTERY_CURRENT',
  H: 'BATTERY_PROTECTION',
  I: 'BATTERY_COMMUNICATION',
  J: 'PHASE_COMPATIBILITY',
  K: 'REQUIRED_COMPONENT_PRESENCE',
  L: 'COMPONENT_QUANTITY',
  M: 'MICROINVERTER_QUANTITY',
  N: 'BRANCH_CIRCUIT_CONSTRAINTS',
  O: 'DCDB_ACDB_CONFIGURATION',
  P: 'AC_ISOLATOR',
  Q: 'STRUCTURE',
  R: 'UPGRADE_CONFIGURATION',
  S: 'FUTURE_UPGRADE_CONFIGURATION',
};

/** Rule register. Every finding must cite one of these. */
export const CHECKER_RULES = [
  { id: 'PBC-A-001', category: CATEGORY.A, severity: SEVERITY.BLOCKED,
    description: 'Architecture is not declared for the project BOM',
    inputs: ['bom.architecture'], source: 'Phase 1E §1 — architecture drives every downstream rule' },
  { id: 'PBC-A-002', category: CATEGORY.A, severity: SEVERITY.BLOCKED,
    description: 'Component belongs to a different system architecture',
    inputs: ['bom.architecture', 'component.brand'], source: 'decision D12 — Enphase and Deye/SEG are separate architectures' },

  { id: 'PBC-B-001', category: CATEGORY.B, severity: SEVERITY.WARNING,
    description: 'Panel/inverter compatibility cannot be verified — data missing',
    inputs: ['panel', 'inverter'], source: 'catalog fields absent; no threshold assumed' },
  { id: 'PBC-B-002', category: CATEGORY.B, severity: SEVERITY.BLOCKED,
    description: 'Panel maximum system voltage is below the inverter maximum input voltage',
    inputs: ['panel.maxSysVoltage', 'inverter.maxInputVoltage'], source: 'catalog panel.maxSysVoltage' },

  { id: 'PBC-C-001', category: CATEGORY.C, severity: SEVERITY.WARNING,
    description: 'Panel electrical data incomplete — limits cannot be evaluated',
    inputs: ['panel.voc', 'panel.isc', 'panel.tempCoeffVoc'], source: 'catalog panel record' },

  { id: 'PBC-D-001', category: CATEGORY.D, severity: SEVERITY.WARNING,
    description: 'Inverter electrical window not recorded — limits cannot be evaluated',
    inputs: ['inverter.mpptVoltageMin', 'inverter.mpptVoltageMax', 'inverter.maxInputVoltage'],
    source: 'catalog inverter record' },
  { id: 'PBC-D-002', category: CATEGORY.D, severity: SEVERITY.BLOCKED,
    description: 'Single-panel Voc at minimum cell temperature already exceeds the inverter maximum input voltage',
    inputs: ['panel.voc', 'panel.tempCoeffVoc', 'inverter.maxInputVoltage'],
    source: 'App.jsx stringConfig — Kerala minimum cell temperature 15 °C, STC 25 °C' },
  { id: 'PBC-D-003', category: CATEGORY.D, severity: SEVERITY.WARNING,
    description: 'String length is not declared, so string voltage and current cannot be verified',
    inputs: ['bom.stringConfiguration'], source: 'Phase 1E — string configuration is not modelled in V1' },

  { id: 'PBC-E-001', category: CATEGORY.E, severity: SEVERITY.BLOCKED,
    description: 'Battery is not compatible with the selected inverter or architecture',
    inputs: ['battery', 'inverter'], source: 'batteryCompatibility BC-A / BC-B / BC-J' },
  { id: 'PBC-F-001', category: CATEGORY.F, severity: SEVERITY.BLOCKED,
    description: 'Battery voltage is outside the inverter operating range',
    inputs: ['battery.nominalVoltage', 'inverter.batteryVoltageMin', 'inverter.batteryVoltageMax'],
    source: 'batteryCompatibility BC-C' },
  { id: 'PBC-F-002', category: CATEGORY.F, severity: SEVERITY.WARNING,
    description: 'Battery voltage compatibility cannot be verified — data missing',
    inputs: ['battery.nominalVoltage'], source: 'batteryCompatibility BC-C INDETERMINATE' },
  { id: 'PBC-G-001', category: CATEGORY.G, severity: SEVERITY.BLOCKED,
    description: 'Battery current capability is below the inverter requirement',
    inputs: ['battery.maximumDischargeCurrent', 'inverter.maxBatteryCurrent'], source: 'batteryCompatibility BC-D' },
  { id: 'PBC-G-002', category: CATEGORY.G, severity: SEVERITY.WARNING,
    description: 'Battery current compatibility cannot be verified — data missing',
    inputs: ['battery.maximumDischargeCurrent'], source: 'batteryCompatibility BC-D INDETERMINATE' },
  { id: 'PBC-H-001', category: CATEGORY.H, severity: SEVERITY.BLOCKED,
    description: 'Battery protection mode is unknown — the BOM cannot be issued safely',
    inputs: ['battery.integratedProtection'], source: 'C44 — protection is the safety-critical field' },
  { id: 'PBC-H-002', category: CATEGORY.H, severity: SEVERITY.BLOCKED,
    description: 'External battery protection is required but the device rating is not recorded',
    inputs: ['battery.externalProtectionRequired', 'battery.protectionRating'],
    source: 'D12-E — the rating must not be assumed or derived from Ah' },
  { id: 'PBC-H-003', category: CATEGORY.H, severity: SEVERITY.BLOCKED,
    description: 'External battery protection is required but no protection line is present',
    inputs: ['bom.lines', 'battery'], source: 'D12 — protection follows the battery' },
  { id: 'PBC-H-004', category: CATEGORY.H, severity: SEVERITY.BLOCKED,
    description: 'Generic battery protection present on an INTEGRATED-protection topology',
    inputs: ['bom.lines', 'battery.protectionMode'], source: 'D12 — prohibited on the Enphase architecture' },
  { id: 'PBC-I-001', category: CATEGORY.I, severity: SEVERITY.WARNING,
    description: 'Battery communication compatibility cannot be verified — protocol not recorded',
    inputs: ['battery.communicationProtocol'], source: 'batteryCompatibility BC-E INDETERMINATE' },

  { id: 'PBC-J-001', category: CATEGORY.J, severity: SEVERITY.BLOCKED,
    description: 'Component phase does not match the system phase',
    inputs: ['component.phase', 'bom.phase'], source: 'App.jsx phaseFilter()' },

  { id: 'PBC-K-001', category: CATEGORY.K, severity: SEVERITY.BLOCKED,
    description: 'A required component role is missing from the BOM',
    inputs: ['bom.lines', 'bom.architecture'], source: 'Phase 1E §6 K — required component presence' },
  { id: 'PBC-K-002', category: CATEGORY.K, severity: SEVERITY.BLOCKED,
    description: 'A BOM line has no component selected',
    inputs: ['bom.lines'], source: 'a role present with componentId null cannot be built' },
  { id: 'PBC-K-003', category: CATEGORY.K, severity: SEVERITY.BLOCKED,
    description: 'The selected component is not in the catalog',
    inputs: ['bom.lines', 'catalog'], source: 'componentId must resolve to a catalog record' },
  { id: 'PBC-K-004', category: CATEGORY.K, severity: SEVERITY.BLOCKED,
    description: 'The selected component is not ACTIVE in the catalog',
    inputs: ['component.status'], source: 'D11-D — TEST/INACTIVE records must not be built' },

  { id: 'PBC-L-001', category: CATEGORY.L, severity: SEVERITY.BLOCKED,
    description: 'Component quantity is zero or negative while the role is present',
    inputs: ['bom.lines.quantity'], source: 'Phase 1E §6 L' },

  { id: 'PBC-M-001', category: CATEGORY.M, severity: SEVERITY.BLOCKED,
    description: 'Micro-inverter quantity does not equal the approved panel quantity',
    inputs: ['MICRO_INVERTER.quantity', 'PANEL.quantity'], source: 'D12 — 1 IQ8P per approved PV panel' },
  { id: 'PBC-M-002', category: CATEGORY.M, severity: SEVERITY.BLOCKED,
    description: 'Enphase premium architecture requires exactly one FlexPhase battery in the V1 package',
    inputs: ['BATTERY.quantity'], source: 'D12 — 1 FlexPhase battery for the current V1 package' },
  { id: 'PBC-M-003', category: CATEGORY.M, severity: SEVERITY.BLOCKED,
    description: 'Enphase premium architecture requires an IQ System Controller for backup (hybrid only — on-grid has no battery, owner decision 2026-09-13)',
    inputs: ['bom.lines', 'bom.sysType'], source: 'D12 — System Controller mandatory for backup' },

  { id: 'PBC-N-001', category: CATEGORY.N, severity: SEVERITY.WARNING,
    description: 'Branch / circuit constraints cannot be verified — string configuration not modelled in V1',
    inputs: ['inverter.mpptCount', 'inverter.maxStringsPerMppt', 'bom.stringConfiguration'],
    source: 'Phase 1E — declared as unverifiable rather than assumed' },

  { id: 'PBC-O-001', category: CATEGORY.O, severity: SEVERITY.BLOCKED,
    description: 'DCDB or ACDB phase does not match the system phase',
    inputs: ['ACDB.phase', 'DCDB.phase', 'bom.phase'], source: 'App.jsx phaseFilter()' },

  { id: 'PBC-P-001', category: CATEGORY.P, severity: SEVERITY.BLOCKED,
    description: 'AC isolator does not match the approved D11 selection for this phase',
    inputs: ['AC_ISOLATOR.componentId', 'bom.phase'], source: 'decisions D11-A (is1, 1P) and D11-B (is2, 3P)' },
  { id: 'PBC-P-002', category: CATEGORY.P, severity: SEVERITY.BLOCKED,
    description: 'A separate DC isolator role is not modelled in V1',
    inputs: ['bom.lines'], source: 'decision D11-C' },

  { id: 'PBC-Q-001', category: CATEGORY.Q, severity: SEVERITY.BLOCKED,
    description: 'Structure is missing from the BOM',
    inputs: ['bom.lines'], source: 'Phase 1E §6 Q' },

  { id: 'PBC-R-001', category: CATEGORY.R, severity: SEVERITY.BLOCKED,
    description: 'Upgrade path is not engineering-approved',
    inputs: ['upgrade.fromKw', 'upgrade.toKw'], source: 'APPROVED_UPGRADE_PATHS' },
  { id: 'PBC-R-002', category: CATEGORY.R, severity: SEVERITY.WARNING,
    description: 'Approved upgrade path has no explicit BOM and is currently auto-scaled',
    inputs: ['upgrade.pathId'], source: 'APPROVED_UPGRADE_PATHS.explicitBom === false' },
  { id: 'PBC-S-001', category: CATEGORY.S, severity: SEVERITY.WARNING,
    description: 'Future-upgrade configuration mixes panel-kW and inverter-kW sizing; verify per component',
    inputs: ['futureUpgrade'], source: 'App.jsx future-upgrade sizing split' },
];

const RULE_BY_ID = Object.fromEntries(CHECKER_RULES.map(r => [r.id, r]));

/** Roles that must exist in every project BOM. */
export const REQUIRED_ROLES_ALL = [ROLES.PANEL, ROLES.STRUCTURE, ROLES.AC_ISOLATOR];
export const REQUIRED_ROLES_DEYE = [ROLES.INVERTER];
export const REQUIRED_ROLES_ENPHASE = [ROLES.MICRO_INVERTER];

const num = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

/**
 * Run the full check over a project BOM.
 *
 * @param {object} arg
 *   bom            project BOM (projectBom.js)
 *   catalog        full catalog
 *   batteryMaster  overlay keyed by componentId
 *   at             ISO timestamp supplied BY THE CALLER (determinism)
 *   catalogVersion opaque version string recorded on every finding
 *   upgrade        { fromKw, toKw } | null
 *   futureUpgrade  boolean
 * @returns {{status, findings, counts, rulesVersion, catalogVersion, at, deterministicKey}}
 */
export function checkProjectBom({
  bom, catalog, batteryMaster = {}, at = null, catalogVersion = null,
  upgrade = null, futureUpgrade = false, lines: linesIn = null,
  // 2026-09-08 — a PACK TEMPLATE has no site yet: STRUCTURE is resolved per
  // project from the roof type (structure pack), so its presence rules
  // (PBC-K-001 for STRUCTURE, PBC-Q-001) do not apply at template scope. Every
  // other rule is identical. Project-level checks never pass this flag.
  templateScope = false,
}) {
  const findings = [];
  const add = (ruleId, componentIds, message, reason, extraInputs) => {
    const r = RULE_BY_ID[ruleId];
    findings.push({
      ruleId,
      category: r.category,
      severity: r.severity,
      componentIds: [...(componentIds || [])].filter(Boolean).sort(),
      message,
      reason: reason || r.description,
      source: r.source,
      inputs: extraInputs || r.inputs,
      rulesVersion: RULES_VERSION,
      catalogVersion,
      at,
    });
  };

  const lines = linesIn || (bom ? effectiveLinesOf(bom) : []);
  const byRole = Object.fromEntries(lines.map(l => [l.role, l]));
  const find = (role) => byRole[role] || null;
  const item = (componentId) => {
    if (!componentId || !catalog?.categories) return null;
    for (const key of Object.keys(catalog.categories).sort()) {
      const hit = (catalog.categories[key].items || []).find(i => i.id === componentId);
      if (hit) return { ...hit, _category: key };
    }
    return null;
  };
  const phase = bom?.phase || null;
  const arch = bom?.architecture || null;

  // ---- A. system architecture ---------------------------------------------
  if (!arch)
    add('PBC-A-001', [], 'Project BOM does not declare a system architecture.',
      'Architecture determines the battery, protection and micro-inverter rules; it cannot be inferred.');

  // ---- K. presence, resolvability, lifecycle ------------------------------
  const required = [
    ...REQUIRED_ROLES_ALL.filter(r => !(templateScope && r === ROLES.STRUCTURE)),
    ...(arch === 'ENPHASE' ? REQUIRED_ROLES_ENPHASE : arch ? REQUIRED_ROLES_DEYE : []),
  ];
  for (const role of [...new Set(required)].sort())
    if (!find(role))
      add('PBC-K-001', [], `Required role ${role} is missing from the project BOM.`,
        `${role} is mandatory for architecture ${arch || 'UNDECLARED'}.`);

  for (const l of lines) {
    if (!l.componentId) {
      add('PBC-K-002', [], `Role ${l.role} is present but no component is selected.`);
      continue;
    }
    const rec = item(l.componentId);
    if (!rec) {
      add('PBC-K-003', [l.componentId], `Component "${l.componentId}" (role ${l.role}) is not in the catalog.`);
      continue;
    }
    const status = (rec.status || 'ACTIVE').toUpperCase();
    if (status !== 'ACTIVE')
      add('PBC-K-004', [l.componentId], `Component "${rec.name}" (role ${l.role}) has catalog status ${rec.status}.`,
        'A TEST or INACTIVE record must not be built (D11-D).');

    // ---- L. quantity ------------------------------------------------------
    const q = num(l.quantity);
    if (q == null || q <= 0)
      add('PBC-L-001', [l.componentId], `Role ${l.role} has quantity ${l.quantity}.`,
        'A role present in the BOM must carry a positive quantity. Use explicit removal instead of a zero quantity.');

    // ---- J. phase ---------------------------------------------------------
    if (phase && rec.phase && !String(rec.phase).includes('HYB')) {
      const ok = String(rec.phase).includes(phase);
      if (!ok)
        add('PBC-J-001', [l.componentId], `Component "${rec.name}" (role ${l.role}) is ${rec.phase} but the system is ${phase}.`);
    }

    // ---- A-002. architecture mixing ---------------------------------------
    const brand = String(rec.brand || '').toLowerCase();
    if (arch === 'ENPHASE' && [ROLES.BATTERY, ROLES.MICRO_INVERTER, ROLES.ENERGY_SYSTEM_CONTROLLER].includes(l.role) && brand && brand !== 'enphase')
      add('PBC-A-002', [l.componentId], `"${rec.name}" is ${rec.brand}; the Enphase architecture accepts only Enphase components in role ${l.role}.`,
        'Enphase architecture must not inherit Deye/SEG component rules (D12).');
    if (arch && arch !== 'ENPHASE' && brand === 'enphase')
      add('PBC-A-002', [l.componentId], `"${rec.name}" is an Enphase component and cannot be used on a ${arch} architecture.`);
  }

  // ---- P. AC isolator (D11) ----------------------------------------------
  const iso = find(ROLES.AC_ISOLATOR);
  if (iso?.componentId && phase) {
    const expected = phase === '3P' ? 'is2' : 'is1';
    if (iso.componentId !== expected)
      add('PBC-P-001', [iso.componentId], `AC isolator is "${iso.componentId}" but the approved ${phase} isolator is "${expected}".`,
        phase === '3P' ? 'decision D11-B' : 'decision D11-A');
  }
  if (lines.some(l => l.role === 'DC_ISOLATOR'))
    add('PBC-P-002', [], 'The BOM contains a DC_ISOLATOR role.', 'D11-C: V1 does not model a separate DC isolator.');

  // ---- Q. structure -------------------------------------------------------
  if (!templateScope && !find(ROLES.STRUCTURE))
    add('PBC-Q-001', [], 'No structure line is present in the project BOM.');

  // ---- panel / inverter ---------------------------------------------------
  const panelLine = find(ROLES.PANEL);
  const invLine = find(ROLES.INVERTER);
  const panel = panelLine ? item(panelLine.componentId) : null;
  const inverter = invLine ? item(invLine.componentId) : null;

  // ---- C. panel electrical limits ----------------------------------------
  if (panel) {
    const missing = ['voc', 'isc', 'tempCoeffVoc', 'maxSysVoltage'].filter(f => num(panel[f]) == null);
    if (missing.length)
      add('PBC-C-001', [panel.id], `Panel "${panel.name}" is missing ${missing.join(', ')}.`,
        'String limits cannot be evaluated. No value is assumed.', missing);
  }

  // ---- B / D. panel↔inverter ---------------------------------------------
  if (panel && inverter) {
    const maxIn = num(inverter.maxInputVoltage);
    const maxSys = num(panel.maxSysVoltage);
    if (maxIn == null)
      add('PBC-D-001', [inverter.id], `Inverter "${inverter.name}" does not record maxInputVoltage.`,
        'The DC input window cannot be evaluated. No limit is assumed.');
    if (maxIn != null && maxSys != null && maxSys < maxIn)
      add('PBC-B-002', [panel.id, inverter.id],
        `Panel maximum system voltage ${maxSys} V is below the inverter maximum input voltage ${maxIn} V.`);

    // Single-panel cold Voc vs the inverter limit. Uses ONLY values recorded in
    // the catalog and the existing App.jsx string assumption (min cell 15 °C,
    // STC 25 °C). No new threshold is introduced.
    const voc = num(panel.voc), tc = num(panel.tempCoeffVoc);
    if (voc != null && tc != null && maxIn != null) {
      const coldVoc = voc * (1 + (tc / 100) * (15 - 25));
      if (coldVoc > maxIn)
        add('PBC-D-002', [panel.id, inverter.id],
          `A single "${panel.name}" reaches ${coldVoc.toFixed(1)} V at 15 °C, above the inverter limit ${maxIn} V.`,
          'App.jsx stringConfig — Kerala minimum cell temperature 15 °C, STC 25 °C.');
    }
    // String length is not modelled, so string-level voltage and current
    // are declared unverifiable rather than assumed.
    add('PBC-D-003', [panel.id, inverter.id], 'String length is not declared in the project BOM.',
      'String voltage and current cannot be verified. No string configuration is assumed.');
    add('PBC-N-001', [inverter.id],
      `Inverter records mpptCount=${inverter.mpptCount ?? 'null'} and maxStringsPerMppt=${inverter.maxStringsPerMppt ?? 'null'}, but the BOM declares no string layout.`,
      'Branch/circuit constraints are unverifiable in V1.');
  } else if (panel && !inverter && arch !== 'ENPHASE') {
    add('PBC-B-001', [panel.id], 'No inverter is selected; panel/inverter compatibility cannot be evaluated.');
  }

  // ---- O. DCDB / ACDB -----------------------------------------------------
  for (const role of [ROLES.ACDB, ROLES.DCDB]) {
    const l = find(role);
    const rec = l ? item(l.componentId) : null;
    if (rec && phase && rec.phase && !String(rec.phase).includes('HYB') && !String(rec.phase).includes(phase))
      add('PBC-O-001', [rec.id], `${role} "${rec.name}" is ${rec.phase} but the system is ${phase}.`);
  }

  // ---- battery: E, F, G, H, I --------------------------------------------
  const batLine = find(ROLES.BATTERY);
  if (batLine?.componentId) {
    const batItem = item(batLine.componentId);
    const bat = batItem ? toBatteryMaster(batItem, batteryMaster[batLine.componentId] || {}) : null;
    if (bat) {
      const compat = checkBatteryCompatibility(bat, {
        inverter, sysType: bom?.sysType || 'hybrid', phase,
        quantity: num(batLine.quantity) || 0, architecture: arch,
      });
      const byId = Object.fromEntries(compat.checks.map(c => [c.id, c]));
      const ids = [bat.componentId];

      if (byId['BC-J']?.result === 'FAIL') add('PBC-A-002', ids, byId['BC-J'].message);
      if (byId['BC-A']?.result === 'FAIL' || byId['BC-B']?.result === 'FAIL')
        add('PBC-E-001', ids, [byId['BC-A'], byId['BC-B']].filter(c => c?.result === 'FAIL').map(c => c.message).join(' '));
      if (byId['BC-C']?.result === 'FAIL') add('PBC-F-001', ids, byId['BC-C'].message);
      if (byId['BC-C']?.result === 'INDETERMINATE') add('PBC-F-002', ids, byId['BC-C'].message);
      if (byId['BC-D']?.result === 'FAIL') add('PBC-G-001', ids, byId['BC-D'].message);
      if (byId['BC-D']?.result === 'INDETERMINATE') add('PBC-G-002', ids, byId['BC-D'].message);
      if (byId['BC-E']?.result === 'INDETERMINATE') add('PBC-I-001', ids, byId['BC-E'].message);

      // H. protection — derived from the SELECTED battery, never hardcoded.
      const prot = resolveProtectionRequirement(bat);
      const protLine = find(ROLES.BATTERY_PROTECTION);
      if (bat.integratedProtection == null)
        add('PBC-H-001', ids, `Protection mode for "${bat.displayName}" is not recorded.`,
          'Cannot safely validate this battery configuration.');
      if (prot.mode === BATTERY_PROTECTION_MODE.EXTERNAL_REQUIRED) {
        if (prot.rating == null)
          add('PBC-H-002', ids, `External protection is required for "${bat.displayName}" but no rating is recorded.`,
            'The rating must not be assumed, substituted, or derived from Ah (open item D12-E).');
        if (!protLine)
          add('PBC-H-003', ids, `External protection is required for "${bat.displayName}" but no BATTERY_PROTECTION line is present.`);
      }
      if (prot.mode === BATTERY_PROTECTION_MODE.INTEGRATED) {
        if (protLine)
          add('PBC-H-004', [bat.componentId, protLine.componentId],
            `"${bat.displayName}" carries integrated protection but a generic BATTERY_PROTECTION line is present.`,
            'Prohibited on the Enphase architecture (D12).');
        const cableLine = find(ROLES.BATTERY_CABLE);
        if (cableLine)
          add('PBC-H-004', [bat.componentId, cableLine.componentId],
            `"${bat.displayName}" carries integrated protection but a generic DC battery cable line is present.`,
            'Prohibited on the Enphase architecture (D12).');
      }
    }
  }

  // ---- M. Enphase premium quantities --------------------------------------
  if (arch === 'ENPHASE') {
    const micro = find(ROLES.MICRO_INVERTER);
    const pnl = find(ROLES.PANEL);
    if (micro && pnl && num(micro.quantity) !== num(pnl.quantity))
      add('PBC-M-001', [micro.componentId, pnl.componentId],
        `Micro-inverter quantity ${micro.quantity} does not equal the panel quantity ${pnl.quantity}.`,
        'D12 — one IQ8P per approved PV panel.');
    const b = find(ROLES.BATTERY);
    if (b && num(b.quantity) !== 1)
      add('PBC-M-002', [b.componentId], `Battery quantity is ${b.quantity}.`,
        'D12 — the current V1 Enphase package is one FlexPhase battery.');
    // 2026-09-13 owner decision — the System Controller is the backup gateway
    // (D12: "mandatory for backup"). Backup needs a battery, so the rule is
    // scoped to hybrid; an on-grid Enphase (Elite) pack ships without it.
    if ((bom?.sysType || 'hybrid') === 'hybrid' && !find(ROLES.ENERGY_SYSTEM_CONTROLLER))
      add('PBC-M-003', [], 'No IQ System Controller line is present.',
        'D12 — the System Controller is mandatory for backup (hybrid only).');
  }

  // ---- R / S. upgrade -----------------------------------------------------
  if (upgrade) {
    const from = num(upgrade.fromKw), to = num(upgrade.toKw);
    const path = APPROVED_UPGRADE_PATHS.find(p => p.fromKw === from && p.toKw === to);
    if (!path) add('PBC-R-001', [], `Upgrade ${from}→${to} kW is not an engineering-approved path.`);
    else if (path.explicitBom === false)
      add('PBC-R-002', [], `Upgrade path ${path.id} is approved but has no explicit BOM; it is auto-scaled.`, path.note);
  }
  if (futureUpgrade)
    add('PBC-S-001', [], 'Future-upgrade configuration is active.',
      'Panels size on panel kW while upsized components size on inverter kW. Verify each component.');

  // ---- determinism: stable ordering ---------------------------------------
  findings.sort((a, b) =>
    a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1
      : (a.componentIds.join(',') < b.componentIds.join(',') ? -1
        : a.componentIds.join(',') > b.componentIds.join(',') ? 1 : 0));

  const counts = {
    blocked: findings.filter(f => f.severity === SEVERITY.BLOCKED).length,
    warning: findings.filter(f => f.severity === SEVERITY.WARNING).length,
    info: findings.filter(f => f.severity === SEVERITY.INFO).length,
    checksRun: CHECKER_RULES.length,
  };
  const status = counts.blocked ? CHECK_STATUS.BLOCKED
    : counts.warning ? CHECK_STATUS.WARNING
      : CHECK_STATUS.VALID;

  return {
    status, findings, counts,
    rulesVersion: RULES_VERSION, catalogVersion, at,
    /** Identity of the verdict, independent of `at`. Same inputs -> same key. */
    deterministicKey: findings.map(f => `${f.ruleId}|${f.componentIds.join('+')}`).join(';'),
  };
}

/** Local copy so the checker never imports a mutation function. */
function effectiveLinesOf(bom) {
  const roles = new Set([...bom.packageLines.map(l => l.role), ...Object.keys(bom.overrides)]);
  return [...roles]
    .filter(r => !bom.removedRoles.includes(r))
    .sort()
    .map(r => bom.overrides[r] || bom.packageLines.find(l => l.role === r))
    .filter(Boolean);
}

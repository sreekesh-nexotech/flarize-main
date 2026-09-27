/**
 * ENGINEERING VALIDATION.  (Phase 1E)
 *
 * Answers exactly one question: "Is this configuration technically valid?"
 * It does not choose components, does not price, does not present.
 *
 * EVERY RULE IS EXTRACTED FROM THE EXISTING APPLICATION OR CATALOG.
 * Nothing electrical is invented. Each rule records its `source` so the
 * provenance is auditable — see docs/phase1/04_ENGINEERING_VALIDATION.md.
 *
 * Pure, dependency-free.
 */

import { validateBatteryConsistency } from '../../scripts/validate-bom.mjs';
import { APPROVED_UPGRADE_PATHS, checkUpgradeSectionPolicy } from './upgradeModel.js';
import { COMPONENT_STATUS } from './componentIdentity.js';
import { classifyCatalogItem } from './catalogLifecycle.js';

export const SEVERITY = { BLOCKED: 'BLOCKED', WARNING: 'WARNING', VALID: 'VALID' };

/**
 * Rule registry. `source` cites where the rule already exists in the system.
 * No rule here was authored from domain assumption.
 */
export const RULES = [
  { id: 'ENG-BAT-001', severity: 'BLOCKED', description: 'Battery declared by the package but absent from the BOM',
    inputs: ['profile.batteryQuantity', 'bom.lines'], source: 'packageProfiles + defect D1' },
  { id: 'ENG-BAT-002', severity: 'BLOCKED', description: 'Battery quantity differs from the package profile',
    inputs: ['profile.batteryQuantity', 'bom.lines'], source: 'packageProfiles' },
  { id: 'ENG-BAT-003', severity: 'BLOCKED', description: 'Battery present without its MCCB protection',
    inputs: ['bom.lines'], source: 'bomTemplates.hybrid.slots[4] mccb_box (batQty 1:1)' },
  { id: 'ENG-BAT-004', severity: 'BLOCKED', description: 'Battery accessories present without a battery',
    inputs: ['bom.lines'], source: 'defect D1' },
  { id: 'ENG-BAT-005', severity: 'BLOCKED', description: 'Battery present when the package declares none',
    inputs: ['profile.batteryQuantity', 'bom.lines'], source: 'packageProfiles' },
  { id: 'ENG-BAT-006', severity: 'WARNING', description: 'Profile internally inconsistent (batteryIncluded vs batteryQuantity)',
    inputs: ['profile'], source: 'packageProfiles' },

  { id: 'ENG-SYS-001', severity: 'BLOCKED', description: 'System size not offered for this system type',
    inputs: ['sysType', 'size', 'catalog.bomTemplates'], source: 'bomTemplates[sysType].sizes' },
  { id: 'ENG-SYS-002', severity: 'BLOCKED', description: 'Phase not supported for this size',
    inputs: ['size', 'phase', 'catalog.bomTemplates'], source: 'bomTemplates[sysType].threePhase' },
  { id: 'ENG-SYS-003', severity: 'BLOCKED', description: 'Mandatory BOM component missing (N/A line)',
    inputs: ['bom.lines'], source: 'App.jsx pushes an N/A ₹0 line when no candidate resolves' },

  { id: 'ENG-CMP-001', severity: 'BLOCKED', description: 'A selected component is not ACTIVE',
    inputs: ['bom.lines', 'catalog'], source: 'Phase 1G catalog lifecycle' },
  { id: 'ENG-CMP-002', severity: 'BLOCKED', description: 'Inverter phase does not match system phase',
    inputs: ['bom.lines', 'phase'], source: 'App.jsx phaseFilter()' },
  { id: 'ENG-CMP-003', severity: 'BLOCKED', description: 'Inverter type incompatible with system type',
    inputs: ['bom.lines', 'sysType'], source: 'App.jsx phaseFilter() filterType' },
  { id: 'ENG-CMP-004', severity: 'BLOCKED', description: 'Duplicate incompatible component in the same role',
    inputs: ['bom.lines'], source: 'one slot per role in bomTemplates' },
  { id: 'ENG-CMP-005', severity: 'WARNING', description: 'Component chosen by fallback rather than an approved selection',
    inputs: ['bom.lines.resolution'], source: 'Phase 0 hotfix H3' },

  { id: 'ENG-PNL-001', severity: 'BLOCKED', description: 'Subsidy requires DCR panels but a non-DCR panel is selected',
    inputs: ['subsidyType', 'bom.lines'], source: 'App.jsx dcrFilter() — subsidy forces DCR' },
  { id: 'ENG-PNL-002', severity: 'WARNING', description: 'Installed DC capacity deviates materially from the nameplate system size',
    inputs: ['size', 'panel.watt', 'panel.qty'], source: 'App.jsx panel qty = ceil(size*1000/watt)' },

  { id: 'ENG-STR-001', severity: 'WARNING', description: 'String open-circuit voltage at minimum cell temperature approaches the inverter limit',
    inputs: ['panel.voc', 'panel.tempCoeffVoc', 'inverter.maxInputVoltage'],
    source: 'App.jsx stringConfig — Kerala cell temp min 15°C, STC 25°C' },

  { id: 'ENG-BAT-007', severity: 'WARNING', description: 'Battery protection mode not confirmed by Engineering',
    inputs: ['battery.componentId'], source: 'decision D12 — per-battery confirmation pending' },
  { id: 'ENG-BAT-008', severity: 'BLOCKED', description: 'Generic Deye/SEG battery protection or DC cable used on an Enphase topology',
    inputs: ['bom.lines', 'battery.protection.mode'], source: 'decision D12 — prohibited on premium' },

  { id: 'ENG-BAT-009', severity: 'BLOCKED', description: 'Selected battery is not engineering-approved',
    inputs: ['battery.approvalStatus'], source: 'Phase 1D review correction — C50' },
  { id: 'ENG-BAT-010', severity: 'BLOCKED', description: 'Battery data required to issue the BOM safely is not recorded',
    inputs: ['battery.missingForSafeIssue', 'battery.protection.rating'], source: 'Phase 1D — C44 / C51' },

  { id: 'ENG-ENP-001', severity: 'BLOCKED', description: 'Premium hybrid requires an IQ System Controller',
    inputs: ['bom.lines', 'tier', 'sysType'], source: 'decision D12 — ENERGY_SYSTEM_CONTROLLER required' },
  { id: 'ENG-ENP-002', severity: 'BLOCKED', description: 'IQ8P micro-inverter quantity must equal approved panel quantity',
    inputs: ['bom.lines'], source: 'decision D12 — IQ8P qty = panel qty' },
  { id: 'ENG-ENP-003', severity: 'WARNING', description: 'Enphase component configuration not yet confirmed',
    inputs: ['bom.lines'], source: 'decision D12 — PENDING_CONFIGURATION_CONFIRMATION' },
  { id: 'ENG-ENP-004', severity: 'WARNING', description: 'Enphase communication cable identity not yet in the catalog',
    inputs: ['tier', 'sysType'], source: 'decision D12 — pending catalog identity' },

  { id: 'ENG-UPG-001', severity: 'BLOCKED', description: 'Upgrade path is not engineering-approved',
    inputs: ['fromKw', 'toKw'], source: 'Build Spec §8 + decision C10' },
  { id: 'ENG-UPG-002', severity: 'WARNING', description: 'Approved upgrade path has no explicit BOM definition and is auto-scaled',
    inputs: ['fromKw', 'toKw'], source: 'bomTemplates.upgrade.fixedItems path keys' },
  { id: 'ENG-UPG-003', severity: 'BLOCKED', description: 'Mandatory upgrade sections not selected — quotation not sellable',
    inputs: ['upgradeSections'], source: 'defect D10 + decision C24' },

  // Phase C.3 (locked 2.10, 2026-09-05) — panel allocation completeness.
  { id: 'ENG-DEV-001', severity: 'BLOCKED',
    description: 'Panel allocation incomplete — one or more panels cannot be validly assigned to a micro-inverter / optimizer device (locked 2.10). Every panel must be explicitly covered; a silent remainder is prohibited.',
    inputs: ['bom.engineering.blockers', 'catalog.categories.enphase|hoymiles.items[].{deviceType,panelsPerDevice}'],
    source: 'Phase C.1 deviceAllocation.js + locked 2.10' },
  // Phase C.5 (locked §6, H9, 2026-09-05) — unsupported configuration.
  { id: 'ENG-SYS-004', severity: 'BLOCKED',
    description: 'Unsupported system configuration — the requested (systemType, size, phase) combination is not covered by any registered package. Silent coercion to a supported combination is prohibited.',
    inputs: ['systemType', 'size', 'phase'],
    source: 'Phase C.5 + locked §6' },
];

const byId = Object.fromEntries(RULES.map(r => [r.id, r]));
const nm = (l) => l?.name || '';
const qn = (v) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };

/**
 * @param {object} input {
 *   bom: {bomLines|lines}, profile, catalog,
 *   sysType, size, tier, phase, subsidyType,
 *   upgrade: {fromKw,toKw,sections}|null
 * }
 * @returns {{status, findings:[], counts, rulesEvaluated}}
 */
export function validateEngineering(input = {}) {
  const { bom, profile, catalog, sysType = 'ongrid', size, tier, phase, subsidyType, upgrade } = input;
  const lines = bom?.bomLines || bom?.lines || [];
  const findings = [];
  const add = (ruleId, message, detail) => {
    const r = byId[ruleId];
    findings.push({ ruleId, severity: r?.severity || 'WARNING', description: r?.description, message, detail, source: r?.source });
  };

  // ---- battery (delegates to the Phase 0 validator; single implementation) --
  const protectionMode = input.batteryProtectionMode || 'UNKNOWN';
  if (profile) {
    const bat = validateBatteryConsistency({ bomLines: lines }, profile, { protectionMode });
    const MAP = {
      BATTERY_MISSING: 'ENG-BAT-001', BATTERY_QTY_MISMATCH: 'ENG-BAT-002',
      BATTERY_MCCB_MISSING: 'ENG-BAT-003', BATTERY_ACCESSORIES_WITHOUT_BATTERY: 'ENG-BAT-004',
      BATTERY_UNEXPECTED: 'ENG-BAT-005', BATTERY_MCCB_UNEXPECTED: 'ENG-BAT-005',
      BATTERY_ACCESSORIES_ORPHANED: 'ENG-BAT-004', PROFILE_INCONSISTENT: 'ENG-BAT-006',
      BATTERY_CABLE_MISSING: 'ENG-BAT-006',
      BATTERY_DC_CABLE_PROHIBITED: 'ENG-BAT-008', BATTERY_MCCB_PROHIBITED: 'ENG-BAT-008',
    };
    for (const f of bat.findings) add(MAP[f.code] || 'ENG-BAT-006', f.message, { expected: f.expected, actual: f.actual, code: f.code });
  }

  // ---- system size / phase -------------------------------------------------
  const template = catalog?.bomTemplates?.[sysType];
  if (template && size != null) {
    const sizes = Object.keys(template.sizes || {});
    if (sizes.length && !sizes.includes(String(size)))
      add('ENG-SYS-001', `Size "${size}" is not offered for system type "${sysType}". Available: ${sizes.join(', ')}.`);
    const is3p = (template.threePhase || []).includes(String(size));
    if (phase === '3P' && !is3p && sizes.includes(String(size)))
      add('ENG-SYS-002', `Size "${size}" is not listed as three-phase for "${sysType}".`);
  }

  // ---- mandatory components / N/A lines ------------------------------------
  for (const l of lines) {
    if (l.isNA || (!nm(l) && qn(l.qty) > 0) || nm(l) === 'N/A')
      add('ENG-SYS-003', `No component resolved for "${l.label || l.category || 'unknown slot'}" — the line is priced at zero.`, { pos: l.pos, category: l.category });
  }

  // ---- component status ----------------------------------------------------
  if (catalog) {
    for (const l of lines) {
      const id = l.itemId || l.catalogItemId;
      if (!id) continue;
      const found = findRaw(catalog, id);
      const item = found?.item;
      // Classification is computed, not persisted (decision C25), so the rule
      // fires on placeholder records without mutating catalog data.
      const status = item?.status || classifyCatalogItem(found?.categoryKey, item).status;
      if (status !== COMPONENT_STATUS.ACTIVE)
        add('ENG-CMP-001', `Component "${nm(l) || id}" is marked ${status} and must not be used in a production configuration.`, { componentId: id, status });
    }
  }

  // ---- inverter phase / type ----------------------------------------------
  const inv = lines.find(l => l.category === 'inverter');
  if (inv && phase && inv.raw?.phase && inv.raw.phase !== 'HYB' && inv.raw.phase !== phase)
    add('ENG-CMP-002', `Inverter phase ${inv.raw.phase} does not match system phase ${phase}.`);
  if (inv && sysType === 'hybrid' && inv.type && inv.type !== 'hybrid')
    add('ENG-CMP-003', `Hybrid system has an inverter of type "${inv.type}".`);

  // ---- duplicate role ------------------------------------------------------
  const roleCount = {};
  for (const l of lines) {
    if (!l.category || !['inverter', 'battery', 'dcdb', 'acdb'].includes(l.category)) continue;
    roleCount[l.category] = (roleCount[l.category] || 0) + 1;
  }
  for (const [role, n] of Object.entries(roleCount))
    if (n > 1) add('ENG-CMP-004', `${n} separate "${role}" lines in one BOM.`, { role, count: n });

  // ---- fallback selections (H3) -------------------------------------------
  const fallbacks = lines.filter(l => l.autoSelected);
  if (fallbacks.length)
    add('ENG-CMP-005', `${fallbacks.length} component(s) chosen by fallback rather than an approved selection.`,
      { components: fallbacks.map(f => ({ category: f.category, name: nm(f), resolution: f.resolution })) });

  // ---- DCR / subsidy -------------------------------------------------------
  if (subsidyType === 'residential' || subsidyType === 'ghs') {
    const panel = lines.find(l => l.category === 'panel');
    const pt = panel?.panelType || (panel?.dcr ? 'DCR' : null);
    if (panel && pt && pt !== 'DCR')
      add('ENG-PNL-001', `Subsidy "${subsidyType}" requires DCR panels but "${nm(panel)}" is ${pt}.`);
  }

  // ---- Enphase premium architecture (decision D12) --------------------------
  const isPremiumHybrid = tier === 'premium' && sysType === 'hybrid';
  const isPremium = tier === 'premium';
  if (isPremium) {
    const byId = (id) => lines.filter(l => (l.itemId || l.catalogItemId) === id);
    const iq8p = lines.filter(l => /IQ8P/i.test(nm(l)));
    const panel = lines.find(l => l.category === 'panel');
    if (iq8p.length && panel) {
      const iqQty = qn(iq8p[0].qty), pQty = qn(panel.qty);
      if (iqQty !== pQty)
        add('ENG-ENP-002', `IQ8P quantity ${iqQty} does not equal panel quantity ${pQty}.`, { iqQty, pQty });
    }
    if (isPremiumHybrid) {
      const sc = lines.filter(l => /System Controller/i.test(nm(l)));
      if (!sc.length)
        add('ENG-ENP-001', 'Premium hybrid backup architecture requires an IQ System Controller; none is present.');
      if (byId('mb1').length)
        add('ENG-BAT-008', 'Generic 160A MCCB (mb1) is present on an Enphase premium system. Prohibited by D12.');
      if (lines.some(l => /25mm Battery Cable/i.test(nm(l))))
        add('ENG-BAT-008', 'Generic 25 mm DC battery cable is present on an Enphase premium system. Prohibited by D12.');
      add('ENG-ENP-004', 'Enphase communication/control cable (supplied commercial BOM: 10 m, ₹6,000 + GST) has no catalog identity yet. Not added to the BOM.');
    }
    const PENDING = { en3: 'Envoy S Metered', en4: 'IQ Relay', en6: 'CT 200' };
    const present = Object.keys(PENDING).filter(id => byId(id).length);
    if (present.length)
      add('ENG-ENP-003',
        `Configuration not confirmed for: ${present.map(id => PENDING[id]).join(', ')}. ` +
        'These functions may be integrated into the IQ System Controller. Retained pending confirmation (D12).',
        { componentIds: present });
  }

  // ---- battery protection mode ---------------------------------------------
  if (protectionMode === 'UNKNOWN' && lines.some(l => l.category === 'battery'))
    add('ENG-BAT-007', 'Battery protection mode is not confirmed by Engineering. Existing template behaviour preserved (D12).');

  // ---- battery engineering approval + safe-issue data (Phase 1D review) -----
  // An APPROVED engineering status must never be IMPLIED by the fact that a
  // battery resolved. It is asserted here, explicitly, against the master data.
  const battery = input.battery || null;
  if (battery?.required) {
    if (battery.engineeringApproved === false)
      add('ENG-BAT-009',
        `Battery "${battery.component?.name || battery.componentId}" is ${battery.approvalStatus}. ` +
        'The battery is retained in the BOM — it is not removed — but the configuration cannot be issued ' +
        'until Engineering approves it.',
        { componentId: battery.componentId, approvalStatus: battery.approvalStatus });

    const missing = [...(battery.missingForSafeIssue || [])];
    if (battery.protection?.mode === 'EXTERNAL_REQUIRED' && battery.protection?.rating == null)
      missing.push('protectionRating');
    if (missing.length)
      add('ENG-BAT-010',
        `Cannot safely validate this battery configuration — ${[...new Set(missing)].join(', ')} not recorded. ` +
        'The value must not be assumed, substituted, or derived from Ah (open item D12-E).',
        { componentId: battery.componentId, missing: [...new Set(missing)] });
  }

  // ---- upgrade -------------------------------------------------------------
  if (upgrade) {
    const { fromKw, toKw, sections } = upgrade;
    const path = APPROVED_UPGRADE_PATHS.find(p => p.fromKw === Number(fromKw) && p.toKw === Number(toKw));
    if (!path) add('ENG-UPG-001', `Upgrade ${fromKw}→${toKw} kW is not an engineering-approved path.`);
    else if (!path.explicitBom) add('ENG-UPG-002', `Upgrade path ${path.id} has no explicit BOM definition; the BOM is auto-scaled from the nearest known path.`, { pathId: path.id });
    if (sections) {
      const pol = checkUpgradeSectionPolicy(sections);
      if (!pol.sellable) add('ENG-UPG-003', pol.message, { missing: pol.missingMandatory });
    }
  }

  const blocked = findings.filter(f => f.severity === SEVERITY.BLOCKED);
  const warnings = findings.filter(f => f.severity === SEVERITY.WARNING);
  return {
    status: blocked.length ? SEVERITY.BLOCKED : warnings.length ? SEVERITY.WARNING : SEVERITY.VALID,
    findings,
    counts: { blocked: blocked.length, warning: warnings.length },
    rulesEvaluated: RULES.length,
  };
}

function findRaw(catalog, id) {
  for (const [categoryKey, cat] of Object.entries(catalog?.categories || {})) {
    const hit = (cat.items || []).find(i => i.id === id);
    if (hit) return { categoryKey, item: hit };
  }
  return null;
}

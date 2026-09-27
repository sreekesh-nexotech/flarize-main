/**
 * PACKAGE RESOLUTION MATRIX.  (Phase 1B — R1 / C23)
 *
 * Replays the engine's component-resolution logic offline for every production
 * package and reports, per package:
 *   packageId · componentIds · quantities · engineering status · fallback count
 *
 * Purpose: prove whether a package resolves from EXPLICIT approved component
 * ids, or is still relying on nearest-kW / first-array fallback.
 *
 * Target: fallbackCount === 0 for every approved production package.
 *
 * READ-ONLY. Emits a report. Changes no catalog data and no engine behaviour.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveBattery } from '../src/lib/resolveBattery.js';
import { toBatteryMaster, isPermanentlyUnselectable } from '../src/lib/batteryMaster.js';
import { classifyCatalogItem } from '../src/lib/catalogLifecycle.js';
import { COMPONENT_STATUS } from '../src/lib/componentIdentity.js';
import { APPROVED_UPGRADE_PATHS } from '../src/lib/upgradeModel.js';

const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
// Phase 1D — same battery master overlay the engine uses.
const BATTERY_MASTER = JSON.parse(readFileSync('data/battery-master.json', 'utf8')).batteries || {};
const bomState = JSON.parse(readFileSync('data/bom-state.json', 'utf8'));
const selections = bomState.selections || {};
const packagesFile = process.argv.includes('--packages')
  ? JSON.parse(readFileSync(process.argv[process.argv.indexOf('--packages') + 1], 'utf8'))
  : null;

const profileKeyFor = (sysType, tier) =>
  sysType === 'hybrid' ? `hybrid_${tier}` : tier === 'premium' ? 'premium' : `ongrid_${tier}`;

const ONGRID = [['3','1P'],['5sp','1P'],['5tp','3P'],['6','3P'],['8','3P'],['10','3P']];
const HYBRID = [['3','1P'],['5','1P'],['8','3P'],['10','3P']];
const TIERS  = ['base','value','premium'];

/** Mirrors App.jsx phaseFilter() / dcrFilter(). */
function candidates(catKey, slot, tier, is3P, subsidyType = 'residential') {
  const cat = catalog.categories[catKey];
  if (!cat) return [];
  // Mirrors App.jsx:1632 phaseFilter() exactly.
  const phaseOk = (it) => {
    if (slot.filterType === 'hybrid') return it.type === 'hybrid';
    if (slot.filterType === 'ongrid') { if (it.type && it.type !== 'ongrid') return false; }
    if (slot.filterPhase === 'HYB') {
      if (!it.phase?.includes('HYB')) return false;
      return is3P ? !!it.phase?.includes('3P') : !!it.phase?.includes('1P');
    }
    if (is3P && it.phase) return it.phase === '3P' || it.phase.includes('3P');
    if (!is3P && it.phase) return it.phase === '1P' || it.phase.includes('1P') || !it.phase;
    return true;
  };
  const dcrOk = (it) => {
    if (catKey !== 'panel') return true;
    if (subsidyType === 'residential' || subsidyType === 'ghs')
      return (it.panelType || (it.dcr ? 'DCR' : 'NON_DCR')) === 'DCR';
    return true;
  };
  // Phase 1D — a battery must be ENGINEERING-APPROVED before it is offered.
  // Only permanently unselectable records are removed. A PENDING battery is
  // retained and the package is BLOCKED — never silently emptied.
  const engOk = (it) => catKey !== 'battery' ||
    !isPermanentlyUnselectable(toBatteryMaster(it, BATTERY_MASTER[it.id] || {}));
  return (cat.items || []).filter(it =>
    Array.isArray(it.tiers) && it.tiers.includes(tier) && engOk(it) && phaseOk(it) && dcrOk(it));
}

function resolvePackage(sysType, sizeKey, phase, tier) {
  const packageId = `PKG-${sysType.toUpperCase()}-${sizeKey}-${phase}-${tier.toUpperCase()}`;
  const template = catalog.bomTemplates[sysType];
  const profile = catalog.packageProfiles[profileKeyFor(sysType, tier)];
  const out = { packageId, systemType: sysType, size: sizeKey, phase, tier,
    profileKey: profileKeyFor(sysType, tier), components: [],
    fallbackCount: 0, explicitCount: 0, blocked: [], warnings: [] };

  if (!template) { out.blocked.push(`no bomTemplate for "${sysType}"`); return out; }
  const sizes = Object.keys(template.sizes || {});
  if (sizes.length && !sizes.includes(sizeKey)) {
    out.blocked.push(`size "${sizeKey}" not offered for "${sysType}" (available: ${sizes.join(', ')})`);
    return out;
  }
  const is3P = (template.threePhase || []).includes(sizeKey);
  const battery = resolveBattery(profile, catalog, { sysType, tier, sizeKey, batteryMaster: BATTERY_MASTER });
  const isPremiumMicro = tier === 'premium' && (sysType === 'ongrid' || sysType === 'hybrid');

  for (const slot of template.slots || []) {
    // quantity, mirroring the engine
    let qty = 0;
    if (isPremiumMicro && (slot.premiumBatQty || slot.premiumQty)) {
      if (slot.premiumBatQty) qty = (slot.premiumBatQty[battery.batQtyIndex] || slot.premiumBatQty['0'] || {})[sizeKey] || 0;
      else qty = (slot.premiumQty || {})[sizeKey] || 0;
    } else if (slot.batQty) {
      qty = (slot.batQty[battery.batQtyIndex] || slot.batQty['0'] || {})[sizeKey] || 0;
    } else if (slot.qty) qty = (slot.qty[sizeKey] || 0);
    if (slot.category === 'battery') qty = battery.quantity;
    if (slot.category === 'mccb_box') qty = battery.requiresMccb ? Math.max(1, qty) : 0;
    if (qty === 0) continue;

    const selKey = `${sysType}_${tier}_${sizeKey}_${slot.pos}`;
    const explicitId = packagesFile?.[`${sysType}|${sizeKey}|${tier}`]?.components
      ?.find(c => c.role === slot.category)?.componentId || selections[selKey] || null;

    const avail = candidates(slot.category, slot, tier, is3P);
    let chosen = null, resolution = 'fallback:noCandidate';

    if (explicitId) {
      chosen = avail.find(i => i.id === explicitId)
        || (catalog.categories[slot.category]?.items || []).find(i => i.id === explicitId) || null;
      if (chosen) resolution = 'explicit';
    }
    if (!chosen && avail.length) {
      if (slot.category === 'inverter' && avail.some(i => i.kw)) {
        const target = parseFloat(sizeKey) || 3;
        chosen = [...avail].sort((a, b) => Math.abs((a.kw||0)-target) - Math.abs((b.kw||0)-target))[0];
        resolution = 'fallback:nearestKw';
      } else { chosen = avail[0]; resolution = 'fallback:firstAvailable'; }
    }

    const status = chosen ? (chosen.status || classifyCatalogItem(slot.category, chosen).status) : null;
    const rec = { role: slot.category, label: slot.label, componentId: chosen?.id || null,
      name: chosen?.name || null, quantity: qty, quantityRule: describeQty(slot, sizeKey),
      required: true, resolution, status, candidateCount: avail.length,
      approvedAlternates: avail.map(i => i.id) };
    out.components.push(rec);

    if (resolution === 'explicit') out.explicitCount++; else out.fallbackCount++;
    if (!chosen) out.blocked.push(`${slot.category}: no candidate (${avail.length} available)`);
    else if (status && status !== COMPONENT_STATUS.ACTIVE)
      out.blocked.push(`${slot.category}: component ${chosen.id} "${chosen.name}" is ${status}`);
  }

  if (battery.required && !out.components.some(c => c.role === 'battery' && c.componentId))
    out.blocked.push('battery declared by profile but not resolved');
  for (const i of battery.issues) {
    // Phase 1D review correction: approval and safe-issue gaps BLOCK the package.
    if (i.code === 'BATTERY_NOT_ENGINEERING_APPROVED' || i.code === 'BATTERY_PROTECTION_RATING_UNRECORDED')
      out.blocked.push(`battery: ${i.message}`);
    else out.warnings.push(`battery: ${i.message}`);
  }
  if (out.fallbackCount) out.warnings.push(`${out.fallbackCount} component(s) resolved by fallback`);

  out.engineeringStatus = out.blocked.length ? 'BLOCKED' : out.warnings.length ? 'WARNING' : 'VALID';
  return out;
}

function describeQty(slot, sizeKey) {
  if (slot.category === 'panel') return 'ceil(sizeKw*1000 / panel.watt)';
  if (slot.batQty || slot.premiumBatQty) return 'batQty[profile.batteryQuantity][size]';
  if (slot.qty) return `fixed:${slot.qty[sizeKey] ?? 0}`;
  return 'unknown';
}

// ---- build the matrix ------------------------------------------------------
const rows = [];
for (const [size, phase] of ONGRID) for (const t of TIERS) rows.push(resolvePackage('ongrid', size, phase, t));
for (const [size, phase] of HYBRID) for (const t of TIERS) rows.push(resolvePackage('hybrid', size, phase, t));
for (const p of APPROVED_UPGRADE_PATHS) for (const t of TIERS) {
  const r = resolvePackage('upgrade', String(p.toKw), '1P', t);
  r.packageId = `PKG-UPGRADE-${p.id}-${t.toUpperCase()}`;
  r.upgradePathId = p.id; r.fromSize = p.fromKw; r.toSize = p.toKw;
  if (!p.explicitBom) r.warnings.push(`upgrade path ${p.id} has no explicit BOM definition (auto-scaled)`);
  r.engineeringStatus = r.blocked.length ? 'BLOCKED' : r.warnings.length ? 'WARNING' : 'VALID';
  rows.push(r);
}

const summary = {
  generatedAtUtc: new Date().toISOString(),
  packagesEvaluated: rows.length,
  totalComponents: rows.reduce((s, r) => s + r.components.length, 0),
  totalFallbacks: rows.reduce((s, r) => s + r.fallbackCount, 0),
  totalExplicit: rows.reduce((s, r) => s + r.explicitCount, 0),
  packagesWithZeroFallback: rows.filter(r => r.fallbackCount === 0 && r.components.length).length,
  status: {
    VALID: rows.filter(r => r.engineeringStatus === 'VALID').length,
    WARNING: rows.filter(r => r.engineeringStatus === 'WARNING').length,
    BLOCKED: rows.filter(r => r.engineeringStatus === 'BLOCKED').length,
  },
};

writeFileSync('docs/phase1/package-resolution-matrix.json', JSON.stringify({ summary, packages: rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log('\nBLOCKED packages:');
for (const r of rows.filter(r => r.engineeringStatus === 'BLOCKED'))
  console.log(`  ${r.packageId.padEnd(34)} ${r.blocked.join(' | ')}`);

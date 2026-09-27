/**
 * BOM battery-consistency validator.  (Phase 0 — detection only)
 *
 * Checks a generated BOM against the authoritative package profile.
 * This module DETECTS the Hybrid Value defect. It does NOT fix it — the
 * correction is a separate controlled Phase 1 engineering change.
 *
 * Pure and dependency-free so it can run over a captured baseline, in a unit
 * test, or later inside the engine itself.
 */

export const SEVERITY = { BLOCKED: 'BLOCKED', WARNING: 'WARNING', VALID: 'VALID' };

const RX = {
  battery: /SEG\.|Okaya|Livguard|Flex Battery|LiFePO4|^New Battery/i,
  batteryMccb: /MCCB/i,
  batteryCable: /Battery Cable/i,
  changeOver: /Change Over Switch$/i,
};

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const match = (lines, rx) => (lines || []).filter(l => rx.test(l?.name || ''));

/**
 * @param {object} bom      { bomLines: [{name, qty, ...}] }
 * @param {object} profile  packageProfiles entry — { batteryIncluded, batteryQuantity, ... }
 * @param {object} opts     { requireMccbWhenBattery = true, allowAccessoriesWithoutBattery = false }
 * @returns {{status, findings: Array<{code,severity,message,expected,actual}>}}
 */
export function validateBatteryConsistency(bom, profile, opts = {}) {
  const {
    // D12: topology-aware. An INTEGRATED-protection battery (Enphase) does not
    // require an external MCCB and must not carry the generic DC battery cable.
    protectionMode = 'UNKNOWN',
    allowAccessoriesWithoutBattery = false,
  } = opts;
  const requireMccbWhenBattery =
    opts.requireMccbWhenBattery !== undefined ? opts.requireMccbWhenBattery
      : protectionMode !== 'INTEGRATED';
  const expectDcCable = protectionMode !== 'INTEGRATED';

  const lines = bom?.bomLines || bom?.lines || [];
  const findings = [];
  const add = (code, severity, message, expected, actual) =>
    findings.push({ code, severity, message, expected, actual });

  const wantQty = Number(profile?.batteryQuantity ?? 0);
  const wantIncluded = !!profile?.batteryIncluded;

  const batteries = match(lines, RX.battery);
  const mccbs = match(lines, RX.batteryMccb);
  const cables = match(lines, RX.batteryCable);
  const changeOvers = match(lines, RX.changeOver);
  const gotQty = batteries.reduce((s, l) => s + num(l.qty), 0);

  // --- profile declares a battery -----------------------------------------
  if (wantQty > 0) {
    if (batteries.length === 0) {
      add('BATTERY_MISSING', SEVERITY.BLOCKED,
        `Profile declares batteryQuantity=${wantQty} but the BOM contains no battery line.`,
        `${wantQty} battery item(s)`, 'none');
    } else if (gotQty !== wantQty) {
      add('BATTERY_QTY_MISMATCH', SEVERITY.BLOCKED,
        `Battery quantity does not match the profile.`, wantQty, gotQty);
    }

    if (requireMccbWhenBattery && mccbs.length === 0) {
      add('BATTERY_MCCB_MISSING', SEVERITY.BLOCKED,
        'Battery is declared but no battery MCCB / protection line is present.',
        'at least 1 MCCB line', 'none');
    }

    if (expectDcCable && cables.length === 0) {
      add('BATTERY_CABLE_MISSING', SEVERITY.WARNING,
        'Battery is declared but no battery cable line is present.',
        'at least 1 battery cable line', 'none');
    }
  }

  // --- profile declares NO battery ----------------------------------------
  if (wantQty === 0) {
    if (batteries.length > 0) {
      add('BATTERY_UNEXPECTED', SEVERITY.BLOCKED,
        'Profile declares no battery but the BOM contains battery line(s).',
        'none', batteries.map(b => `${b.name} x${b.qty}`).join(', '));
    }
    if (mccbs.length > 0) {
      add('BATTERY_MCCB_UNEXPECTED', SEVERITY.BLOCKED,
        'Profile declares no battery but a battery MCCB is present.',
        'none', mccbs.map(m => m.name).join(', '));
    }
    if (!allowAccessoriesWithoutBattery && (cables.length > 0 || changeOvers.length > 0)) {
      add('BATTERY_ACCESSORIES_ORPHANED', SEVERITY.WARNING,
        'Battery accessories present without a battery.',
        'none', [...cables, ...changeOvers].map(x => x.name).join(', '));
    }
  }

  // --- accessories present with no battery, regardless of profile ----------
  // This is the specific shape of the live Hybrid Value defect: cabling and a
  // change-over switch shipped on a system with no battery at all.
  if (protectionMode === 'INTEGRATED' && cables.length > 0) {
    add('BATTERY_DC_CABLE_PROHIBITED', SEVERITY.BLOCKED,
      'Generic DC battery cable present on an INTEGRATED-protection (Enphase) topology.',
      'none', cables.map(c => c.name).join(', '));
  }
  if (protectionMode === 'INTEGRATED' && mccbs.length > 0) {
    add('BATTERY_MCCB_PROHIBITED', SEVERITY.BLOCKED,
      'Generic battery MCCB present on an INTEGRATED-protection (Enphase) topology.',
      'none', mccbs.map(c => c.name).join(', '));
  }
  if (batteries.length === 0 && (cables.length > 0 || changeOvers.length > 0)) {
    add('BATTERY_ACCESSORIES_WITHOUT_BATTERY', SEVERITY.BLOCKED,
      'BOM contains battery cabling and/or a change-over switch but no battery. The system as specified cannot be installed.',
      'battery present, or accessories absent',
      [...cables, ...changeOvers].map(x => `${x.name} x${x.qty}`).join(', '));
  }

  // --- profile internal consistency ---------------------------------------
  if (wantIncluded && wantQty === 0) {
    add('PROFILE_INCONSISTENT', SEVERITY.WARNING,
      'Profile sets batteryIncluded=true but batteryQuantity=0.', 'quantity > 0', 0);
  }

  const status = findings.some(f => f.severity === SEVERITY.BLOCKED) ? SEVERITY.BLOCKED
    : findings.some(f => f.severity === SEVERITY.WARNING) ? SEVERITY.WARNING
      : SEVERITY.VALID;

  return { status, findings };
}

/** Resolve the profile key the active engine uses for a system type + tier. */
export function profileKeyFor(sysType, tier) {
  if (sysType === 'hybrid') return `hybrid_${tier}`;
  if (tier === 'premium') return 'premium';
  return `ongrid_${tier}`;
}

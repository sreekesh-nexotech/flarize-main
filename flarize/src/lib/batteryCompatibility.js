/**
 * BATTERY / INVERTER COMPATIBILITY.  (Phase 1D)
 *
 * Checks A–J from the Phase 1D brief. NO THRESHOLD IS INVENTED.
 * Where the data required for a check does not exist, the check returns
 * INDETERMINATE with the exact missing field named — never a pass.
 *
 * Severity policy:
 *   - a check that can be evaluated and fails            -> BLOCKED
 *   - data missing but not required to issue safely      -> WARNING
 *   - data missing AND required to issue safely          -> BLOCKED
 *
 * BOUNDARY: compatibility only. Selects nothing, prices nothing.
 */

import { BATTERY_PROTECTION_MODE, REQUIRED_FOR_SAFE_ISSUE } from './batteryMaster.js';

export const RESULT = { PASS: 'PASS', FAIL: 'FAIL', INDETERMINATE: 'INDETERMINATE' };

export const COMPAT_CHECKS = [
  { id: 'BC-A', name: 'System type compatibility', needs: ['compatibleSystemTypes'] },
  { id: 'BC-B', name: 'Inverter compatibility', needs: ['compatibleInverters'] },
  { id: 'BC-C', name: 'Voltage compatibility', needs: ['nominalVoltage'] },
  { id: 'BC-D', name: 'Current compatibility', needs: ['maximumDischargeCurrent'] },
  { id: 'BC-E', name: 'Communication compatibility', needs: ['communicationProtocol'] },
  { id: 'BC-F', name: 'Phase compatibility', needs: ['compatiblePhases'] },
  { id: 'BC-G', name: 'Protection requirement', needs: ['integratedProtection'] },
  { id: 'BC-H', name: 'Battery capacity', needs: ['capacityKwh'] },
  { id: 'BC-I', name: 'Battery quantity', needs: [] },
  { id: 'BC-J', name: 'Manufacturer / architecture compatibility', needs: [] },
];

/**
 * @param {object} battery  master record (batteryMaster.toBatteryMaster)
 * @param {object} ctx      { inverter, sysType, phase, tier, quantity, architecture }
 */
export function checkBatteryCompatibility(battery, ctx = {}) {
  const { inverter = null, sysType = 'hybrid', phase = null, quantity = 0, architecture = null } = ctx;
  const checks = [];
  const add = (id, result, message, detail) => {
    const spec = COMPAT_CHECKS.find(c => c.id === id);
    checks.push({ id, name: spec?.name, result, message, detail });
  };

  if (!battery) {
    add('BC-A', RESULT.FAIL, 'No battery component supplied.');
    return summarise(checks, battery);
  }

  // --- J. architecture: the one rule that IS decided (D12) ------------------
  const invBrand = (inverter?.brand || '').toLowerCase();
  const batBrand = (battery.brand || '').toLowerCase();
  const isEnphaseArch = architecture === 'ENPHASE' || batBrand === 'enphase';
  if (architecture === 'ENPHASE' && batBrand !== 'enphase')
    add('BC-J', RESULT.FAIL,
      `Enphase premium architecture accepts only an Enphase battery. "${battery.displayName}" is ${battery.brand || 'unbranded'}.`);
  else if (architecture && architecture !== 'ENPHASE' && batBrand === 'enphase')
    add('BC-J', RESULT.FAIL,
      `Enphase battery "${battery.displayName}" cannot be used on a ${architecture} architecture.`);
  else
    add('BC-J', RESULT.PASS, 'Architecture/manufacturer combination is permitted.');

  // --- A. system type -------------------------------------------------------
  if (battery.compatibleSystemTypes === null)
    add('BC-A', RESULT.INDETERMINATE, 'compatibleSystemTypes not recorded.', { missing: 'compatibleSystemTypes' });
  else if (!battery.compatibleSystemTypes.includes(sysType))
    add('BC-A', RESULT.FAIL, `Battery is not listed as compatible with system type "${sysType}".`);
  else add('BC-A', RESULT.PASS, `Compatible with "${sysType}".`);

  // --- B. inverter ----------------------------------------------------------
  if (battery.compatibleInverters === null)
    add('BC-B', RESULT.INDETERMINATE, 'compatibleInverters not recorded — inverter compatibility cannot be verified.', { missing: 'compatibleInverters' });
  else if (!inverter)
    add('BC-B', RESULT.INDETERMINATE, 'No inverter in context to check against.');
  else if (!battery.compatibleInverters.includes(inverter.id))
    add('BC-B', RESULT.FAIL, `Battery is not approved for inverter "${inverter.name || inverter.id}".`,
      { inverterId: inverter.id, approved: battery.compatibleInverters });
  else add('BC-B', RESULT.PASS, `Approved for inverter "${inverter.name || inverter.id}".`);

  // --- C. voltage -----------------------------------------------------------
  if (battery.nominalVoltage === null)
    add('BC-C', RESULT.INDETERMINATE, 'nominalVoltage not recorded.', { missing: 'nominalVoltage' });
  else if (inverter?.batteryVoltageMin != null && inverter?.batteryVoltageMax != null) {
    const ok = battery.nominalVoltage >= inverter.batteryVoltageMin && battery.nominalVoltage <= inverter.batteryVoltageMax;
    add('BC-C', ok ? RESULT.PASS : RESULT.FAIL,
      ok ? 'Battery voltage is within the inverter window.'
         : `Battery ${battery.nominalVoltage} V is outside the inverter window ${inverter.batteryVoltageMin}–${inverter.batteryVoltageMax} V.`);
  } else add('BC-C', RESULT.INDETERMINATE, 'Inverter battery-voltage window not recorded.', { missing: 'inverter.batteryVoltageMin/Max' });

  // --- D. current -----------------------------------------------------------
  if (battery.maximumDischargeCurrent === null)
    add('BC-D', RESULT.INDETERMINATE, 'maximumDischargeCurrent not recorded.', { missing: 'maximumDischargeCurrent' });
  else if (inverter?.maxBatteryCurrent != null) {
    const ok = battery.maximumDischargeCurrent >= inverter.maxBatteryCurrent;
    add('BC-D', ok ? RESULT.PASS : RESULT.FAIL,
      ok ? 'Battery current capability meets the inverter requirement.'
         : `Battery ${battery.maximumDischargeCurrent} A is below the inverter requirement ${inverter.maxBatteryCurrent} A.`);
  } else add('BC-D', RESULT.INDETERMINATE, 'Inverter max battery current not recorded.', { missing: 'inverter.maxBatteryCurrent' });

  // --- E. communication -----------------------------------------------------
  if (battery.communicationRequired === false) add('BC-E', RESULT.PASS, 'No communication link required.');
  else if (battery.communicationProtocol === null)
    add('BC-E', RESULT.INDETERMINATE, 'communicationProtocol not recorded.', { missing: 'communicationProtocol' });
  else if (inverter?.communicationProtocols == null)
    add('BC-E', RESULT.INDETERMINATE, 'Inverter communication protocols not recorded.', { missing: 'inverter.communicationProtocols' });
  else {
    const ok = inverter.communicationProtocols.includes(battery.communicationProtocol);
    add('BC-E', ok ? RESULT.PASS : RESULT.FAIL,
      ok ? `Protocol ${battery.communicationProtocol} is supported.`
         : `Inverter does not support ${battery.communicationProtocol}.`);
  }

  // --- F. phase -------------------------------------------------------------
  if (battery.compatiblePhases === null)
    add('BC-F', RESULT.INDETERMINATE, 'compatiblePhases not recorded.', { missing: 'compatiblePhases' });
  else if (phase && !battery.compatiblePhases.includes(phase))
    add('BC-F', RESULT.FAIL, `Battery is not listed for phase "${phase}".`);
  else add('BC-F', RESULT.PASS, phase ? `Compatible with ${phase}.` : 'No phase constraint.');

  // --- G. protection --------------------------------------------------------
  if (battery.integratedProtection === null)
    add('BC-G', RESULT.INDETERMINATE,
      'integratedProtection not recorded — the external-protection requirement cannot be determined.',
      { missing: 'integratedProtection', safetyCritical: true });
  else if (battery.integratedProtection === true)
    add('BC-G', RESULT.PASS, 'Battery carries integrated protection; no external device required.');
  else if (battery.externalProtectionRequired === true) {
    if (battery.protectionRating == null)
      add('BC-G', RESULT.INDETERMINATE,
        'External protection is required but protectionRating is not recorded. The rating must not be assumed or derived from Ah.',
        { missing: 'protectionRating', safetyCritical: true });
    else add('BC-G', RESULT.PASS, `External protection required at ${battery.protectionRating}.`);
  } else add('BC-G', RESULT.INDETERMINATE, 'externalProtectionRequired not recorded.', { missing: 'externalProtectionRequired' });

  // --- H. capacity ----------------------------------------------------------
  if (battery.capacityKwh === null)
    add('BC-H', RESULT.INDETERMINATE, 'capacityKwh not recorded — backup sizing cannot be assessed.', { missing: 'capacityKwh' });
  else add('BC-H', RESULT.PASS, `Capacity ${battery.capacityKwh} kWh recorded.`);

  // --- I. quantity ----------------------------------------------------------
  if (quantity <= 0) add('BC-I', RESULT.FAIL, 'Battery quantity must be at least 1 when a battery is selected.');
  else add('BC-I', RESULT.PASS, `Quantity ${quantity}.`);

  return summarise(checks, battery);
}

function summarise(checks, battery) {
  const failed = checks.filter(c => c.result === RESULT.FAIL);
  const indet = checks.filter(c => c.result === RESULT.INDETERMINATE);
  const safetyCritical = indet.filter(c => c.detail?.safetyCritical);
  const missingSafe = battery?.missingForSafeIssue || [];

  let status = 'VALID';
  const reasons = [];
  if (failed.length) {
    status = 'BLOCKED';
    reasons.push(...failed.map(f => `${f.id}: ${f.message}`));
  } else if (safetyCritical.length || missingSafe.length) {
    status = 'BLOCKED';
    reasons.push('Cannot safely validate this battery configuration — ' +
      [...new Set([...safetyCritical.map(c => c.detail.missing), ...missingSafe])].join(', ') + ' missing.');
  } else if (indet.length) {
    status = 'WARNING';
    reasons.push('Engineering data incomplete — review required: ' +
      [...new Set(indet.map(c => c.detail?.missing).filter(Boolean))].join(', '));
  }
  return { status, checks, reasons, counts: { fail: failed.length, indeterminate: indet.length, pass: checks.length - failed.length - indet.length } };
}

/** Protection requirement for a battery + inverter. Never assumes a rating. */
export function resolveProtectionRequirement(battery) {
  if (!battery) return { mode: BATTERY_PROTECTION_MODE.UNKNOWN, externalDeviceRequired: false, rating: null, reason: 'no battery' };
  if (battery.integratedProtection === true)
    return { mode: BATTERY_PROTECTION_MODE.INTEGRATED, externalDeviceRequired: false, rating: null,
             reason: 'battery carries integrated protection' };
  if (battery.externalProtectionRequired === true)
    return { mode: BATTERY_PROTECTION_MODE.EXTERNAL_REQUIRED, externalDeviceRequired: true,
             rating: battery.protectionRating ?? null,
             reason: battery.protectionRating == null
               ? 'external protection required; rating NOT recorded and must not be assumed'
               : `external protection required at ${battery.protectionRating}` };
  if (battery.externalProtectionRequired === false)
    return { mode: BATTERY_PROTECTION_MODE.EXTERNAL_OPTIONAL, externalDeviceRequired: false, rating: null,
             reason: 'external protection explicitly not required' };
  return { mode: BATTERY_PROTECTION_MODE.UNKNOWN, externalDeviceRequired: false, rating: null,
           reason: 'protection data not recorded' };
}

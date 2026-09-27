/**
 * DEVICE ALLOCATION ENGINE — generalized panel-to-device allocator.
 *
 * Phase C.1 (locked 2.10, 2026-09-05).
 *
 * PURPOSE
 * -------
 * Given a panel count and a set of candidate devices (each declaring its
 * deviceType and panelsPerDevice), compute how many of each device to
 * install so that EVERY panel is covered. No panel may remain unallocated.
 * When no exact-coverage allocation exists across the supplied candidates,
 * the result is BLOCKED and a reason is emitted for engineering.
 *
 * RULES
 * -----
 *   1. deviceType is authoritative (locked 2.10).
 *      Valid values: 'microinverter' | 'optimizer' | 'string_inverter'
 *      (string_inverter is per-string, not per-panel — allocator does not
 *      cover it; string inverters go through the standard inverter slot.)
 *   2. panelsPerDevice is authoritative per candidate.
 *      Missing / null / <= 0 → the candidate is UNUSABLE by the allocator
 *      and is skipped (recorded in `skipped` for engineering visibility).
 *   3. Complete coverage is mandatory: unallocated > 0 → BLOCKED.
 *   4. No name.includes / manufacturer / array-order routing.
 *   5. Allocation prefers fewer devices (largest panelsPerDevice first)
 *      when multiple exact-coverage allocations exist. Deterministic.
 *   6. On BLOCKED, no partial allocation is emitted — the whole
 *      configuration must be engineering-reviewed.
 *
 * PURE FUNCTION. NO I/O. NO CATALOG. Caller supplies candidates.
 */

'use strict';

/** @typedef {'microinverter'|'optimizer'|'string_inverter'|string} DeviceType */

/**
 * @typedef {Object} DeviceCandidate
 * @property {string} componentId          - catalog id of the device
 * @property {DeviceType} deviceType       - device architecture kind
 * @property {number} panelsPerDevice      - integer > 0, panels one device covers
 * @property {string} [name]               - display name (not used in logic)
 * @property {number} [price]              - unit price (passed through)
 * @property {string} [approvalStatus]     - catalog-level approval status
 */

/**
 * @typedef {Object} DeviceAllocationLine
 * @property {string} componentId
 * @property {DeviceType} deviceType
 * @property {number} panelsPerDevice
 * @property {number} quantity             - how many units to install
 * @property {number} coveredPanels        - panelsPerDevice × quantity
 * @property {string} [name]
 * @property {number} [price]
 */

/**
 * @typedef {Object} DeviceAllocationResult
 * @property {'VALID'|'BLOCKED'|'NOT_APPLICABLE'} status
 * @property {number} panels               - input panels
 * @property {DeviceAllocationLine[]} allocations - empty when BLOCKED
 * @property {number} unallocatedPanels    - panels not covered (0 when VALID)
 * @property {string|null} reason          - human-readable reason when BLOCKED
 * @property {string} code                 - machine code
 * @property {Object[]} skipped            - candidates rejected before allocation
 */

const ALLOCATION_CODE = Object.freeze({
  VALID:                                  'VALID',
  NOT_APPLICABLE:                         'NOT_APPLICABLE',
  BLOCKED_NO_CANDIDATES:                  'BLOCKED_NO_CANDIDATES',
  BLOCKED_NO_USABLE_CANDIDATES:           'BLOCKED_NO_USABLE_CANDIDATES',
  BLOCKED_INCOMPLETE_ALLOCATION:          'BLOCKED_INCOMPLETE_ALLOCATION',
  BLOCKED_PANELS_INVALID:                 'BLOCKED_PANELS_INVALID',
});

/**
 * Validate a candidate. Returns null when valid; otherwise reason string.
 */
function candidateProblem(c) {
  if (!c || typeof c !== 'object') return 'not an object';
  if (typeof c.componentId !== 'string' || !c.componentId) return 'missing componentId';
  if (typeof c.deviceType !== 'string' || !c.deviceType) return 'missing deviceType';
  // String inverters are NOT covered by the panel-allocator — they use the
  // standard inverter slot. Callers must filter them out beforehand, but
  // we also skip defensively.
  if (c.deviceType === 'string_inverter') return 'string_inverter is not a per-panel device';
  const n = Number(c.panelsPerDevice);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0)
    return `panelsPerDevice=${c.panelsPerDevice} is not a positive integer`;
  return null;
}

/**
 * Try to find an EXACT-COVERAGE allocation using dynamic programming.
 * State: dp[k] = { best: {qty per candidate index}, totalUnits, largestFirst }
 * where dp[k] represents "can we cover exactly k panels".
 *
 * Preference (deterministic tie-break):
 *   1. FEWEST TOTAL UNITS (fewer devices).
 *   2. Bias toward larger devices first (more units of larger panelsPerDevice
 *      when total unit count ties).
 *
 * @param {number} panels
 * @param {DeviceCandidate[]} usable
 * @returns {DeviceAllocationLine[]|null} allocation lines OR null when no exact cover.
 */
function findExactAllocation(panels, usable) {
  if (panels === 0) return [];

  // Order candidates by panelsPerDevice DESC — deterministic + tie-break bias
  const sorted = [...usable].sort((a, b) => b.panelsPerDevice - a.panelsPerDevice);

  // DP table. dp[k] = { qty[idx], totalUnits } best solution to cover exactly k panels.
  const dp = new Array(panels + 1).fill(null);
  dp[0] = { qty: new Array(sorted.length).fill(0), totalUnits: 0, largestBias: 0 };

  for (let k = 1; k <= panels; k++) {
    let best = null;
    for (let i = 0; i < sorted.length; i++) {
      const cap = sorted[i].panelsPerDevice;
      if (cap > k) continue;
      const prev = dp[k - cap];
      if (!prev) continue;
      const candQty = [...prev.qty]; candQty[i] += 1;
      const totalUnits = prev.totalUnits + 1;
      // Bias score: larger devices used earlier score higher (index 0 = largest).
      // Use (sorted.length - i) as weight per unit.
      const bias = prev.largestBias + (sorted.length - i);
      const candidate = { qty: candQty, totalUnits, largestBias: bias };
      if (!best
          || candidate.totalUnits < best.totalUnits
          || (candidate.totalUnits === best.totalUnits && candidate.largestBias > best.largestBias)) {
        best = candidate;
      }
    }
    dp[k] = best;
  }

  const solution = dp[panels];
  if (!solution) return null;

  const lines = [];
  for (let i = 0; i < sorted.length; i++) {
    const q = solution.qty[i];
    if (q > 0) {
      const c = sorted[i];
      lines.push({
        componentId: c.componentId,
        deviceType: c.deviceType,
        panelsPerDevice: c.panelsPerDevice,
        quantity: q,
        coveredPanels: q * c.panelsPerDevice,
        name: c.name || null,
        price: (c.price != null ? c.price : null),
      });
    }
  }
  return lines;
}

/**
 * Main allocator.
 *
 * @param {Object} params
 * @param {number} params.panels               - total panels to cover (>= 0)
 * @param {DeviceCandidate[]} params.candidates - candidate devices
 * @returns {DeviceAllocationResult}
 */
function allocateDevices({ panels, candidates } = {}) {
  const n = Number(panels);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return Object.freeze({
      status: 'BLOCKED',
      code: ALLOCATION_CODE.BLOCKED_PANELS_INVALID,
      panels: n,
      allocations: [],
      unallocatedPanels: n,
      reason: `panels=${panels} is not a non-negative integer`,
      skipped: [],
    });
  }

  if (n === 0) {
    // No panels to cover — the situation is not an error, and no devices
    // need to be installed. NOT_APPLICABLE distinguishes this from VALID
    // (which asserts a positive allocation actually happened).
    return Object.freeze({
      status: 'NOT_APPLICABLE',
      code: ALLOCATION_CODE.NOT_APPLICABLE,
      panels: 0,
      allocations: [],
      unallocatedPanels: 0,
      reason: 'no panels to allocate',
      skipped: [],
    });
  }

  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length === 0) {
    return Object.freeze({
      status: 'BLOCKED',
      code: ALLOCATION_CODE.BLOCKED_NO_CANDIDATES,
      panels: n,
      allocations: [],
      unallocatedPanels: n,
      reason: 'no device candidates supplied',
      skipped: [],
    });
  }

  const usable = [];
  const skipped = [];
  for (const c of list) {
    const bad = candidateProblem(c);
    if (bad) {
      skipped.push({ candidate: c, reason: bad });
    } else {
      usable.push(c);
    }
  }

  if (usable.length === 0) {
    return Object.freeze({
      status: 'BLOCKED',
      code: ALLOCATION_CODE.BLOCKED_NO_USABLE_CANDIDATES,
      panels: n,
      allocations: [],
      unallocatedPanels: n,
      reason: `no usable device candidates (${skipped.length} skipped)`,
      skipped: Object.freeze(skipped),
    });
  }

  const alloc = findExactAllocation(n, usable);
  if (!alloc) {
    // Compute best-effort partial coverage for the reason string only.
    // The RETURN allocations remain empty per rule 6.
    const sortedDesc = [...usable].sort((a, b) => b.panelsPerDevice - a.panelsPerDevice);
    let remaining = n;
    const partial = [];
    for (const c of sortedDesc) {
      const q = Math.floor(remaining / c.panelsPerDevice);
      if (q > 0) {
        partial.push(`${q}× ${c.componentId}(cap=${c.panelsPerDevice})`);
        remaining -= q * c.panelsPerDevice;
      }
    }
    return Object.freeze({
      status: 'BLOCKED',
      code: ALLOCATION_CODE.BLOCKED_INCOMPLETE_ALLOCATION,
      panels: n,
      allocations: [],
      unallocatedPanels: remaining > 0 ? remaining : 0,
      reason:
        `no exact-coverage allocation for ${n} panels across candidates ` +
        `(caps: ${usable.map(c => c.panelsPerDevice).join(',')}). ` +
        `Best partial: ${partial.join(' + ') || 'none'}${
          remaining > 0 ? `; ${remaining} panel(s) uncovered` : ''}. ` +
        `Add a device candidate that covers the remainder or change panel count.`,
      skipped: Object.freeze(skipped),
    });
  }

  return Object.freeze({
    status: 'VALID',
    code: ALLOCATION_CODE.VALID,
    panels: n,
    allocations: Object.freeze(alloc),
    unallocatedPanels: 0,
    reason: null,
    skipped: Object.freeze(skipped),
  });
}

module.exports = {
  allocateDevices,
  ALLOCATION_CODE,
};

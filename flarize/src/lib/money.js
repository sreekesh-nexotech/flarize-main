/**
 * MONETARY ROUNDING — ONE CENTRAL RULE.  (Phase 2A §26)
 *
 * RULE
 *   Calculate at full double precision. Round ONCE, at the point a monetary
 *   amount is published (a cost head total, a price, a tax amount).
 *   Intermediate products and sums are NEVER rounded.
 *
 * MODE
 *   HALF_UP to whole rupees. `Math.round` is half-up for positives but
 *   half-up-toward-+Infinity for negatives (-0.5 -> -0), so it is not used
 *   directly. `roundMoney` is symmetric and deterministic for both signs.
 *
 * COMPOSITION OF PUBLISHED FIGURES
 *   Where a published total is made of published parts that a customer will see
 *   side by side — goods GST + service GST = total GST, base + GST = total — the
 *   total is the sum of the ROUNDED parts, so the printed document reconciles to
 *   the rupee. The exact values are retained alongside for audit. Everywhere
 *   else (cost heads into a project total) the rule above applies: sum exact,
 *   round once.
 *
 * DETERMINISM
 *   No locale, no clock, no floating-point display formatting inside the
 *   calculation path. The epsilon nudge removes binary representation error
 *   (e.g. 1.005 stored as 1.00499999999999989) so the same inputs always
 *   produce the same rupee.
 */

export const CURRENCY = 'INR';
export const ROUNDING_MODE = 'HALF_UP';
export const ROUNDING_UNIT = 1;          // whole rupees
export const MONEY_RULE_VERSION = 'money.1';

/** Round a monetary amount to whole rupees, half away from zero. */
export function roundMoney(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  const sign = v < 0 ? -1 : 1;
  const abs = Math.abs(v);
  // Nudge by one ULP-scale epsilon so 1.005 -> 1.01 rather than 1.00.
  return sign * Math.round(abs + Number.EPSILON * abs);
}

/** Sum at full precision. Rounding happens once, by the caller. */
export function sumExact(values) {
  return (values || []).reduce((a, b) => a + (Number(b) || 0), 0);
}

/** Multiply at full precision. */
export function mulExact(a, b) {
  return (Number(a) || 0) * (Number(b) || 0);
}

/** Is this a usable monetary number? `null` and NaN are not. */
export function isMoney(v) {
  return v != null && v !== '' && Number.isFinite(Number(v));
}

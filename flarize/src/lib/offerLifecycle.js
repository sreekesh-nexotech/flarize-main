/**
 * OFFER LIFECYCLE SERVICE.  (Master Plan — Step 5)
 *
 * Manages the offer pipeline: Admin creates offers, validates them against
 * the commercial configuration, and the quotation assembler consumes the
 * active applicable offer.
 *
 * An offer is a REDUCTION from the list selling price. It is NOT a cost.
 * Offers are distinct from discounts: a discount is per-quotation approval,
 * an offer is a standing campaign that applies automatically.
 *
 * AUTHORITY CHAIN:
 *   Pricing Engine produces list price
 *   → Admin creates market rate reference (optional)
 *   → Admin creates offer (flat ₹ or percentage of list price)
 *   → Offer is validated: net price after offer must not breach minimum margin
 *   → Active offer is applied at quotation assembly time
 *
 * LIFECYCLE STATE MACHINE:
 *   DRAFT → APPROVED → ACTIVE → EXPIRED → ARCHIVED
 *                    ↘        ↗
 *                     EXPIRED
 *
 *   DRAFT:    Created by Admin. Editable. Not visible to Sales.
 *   APPROVED: Passed validation + margin safety check. Ready to activate.
 *   ACTIVE:   Live. Visible to Sales. Applied at quotation assembly.
 *   EXPIRED:  Past endDate (auto) or manually expired. Not visible to Sales.
 *   ARCHIVED: Soft-deleted. Never hard-deleted. Not visible to Sales.
 *
 * Every transition records changedBy, changedAt. Every content change
 * increments offerVersion.
 *
 * This module does NOT modify the pricing engine. It adds a layer on top
 * that the quotation assembler can query.
 */

export const OFFER_TYPE = {
  FLAT: 'flat',           // ₹X off the list price
  PERCENTAGE: 'percentage', // X% off the list price
};

export const OFFER_STATUS = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  ARCHIVED: 'ARCHIVED',
};

/**
 * Valid state transitions. Key = current status, value = array of allowed next statuses.
 */
export const VALID_TRANSITIONS = {
  [OFFER_STATUS.DRAFT]:    [OFFER_STATUS.APPROVED, OFFER_STATUS.ARCHIVED],
  [OFFER_STATUS.APPROVED]: [OFFER_STATUS.ACTIVE, OFFER_STATUS.DRAFT, OFFER_STATUS.ARCHIVED],
  [OFFER_STATUS.ACTIVE]:   [OFFER_STATUS.EXPIRED, OFFER_STATUS.ARCHIVED],
  [OFFER_STATUS.EXPIRED]:  [OFFER_STATUS.ARCHIVED, OFFER_STATUS.DRAFT],
  [OFFER_STATUS.ARCHIVED]: [], // terminal — no transitions out
};

export const OFFER_ERROR = {
  INVALID_TYPE: 'INVALID_TYPE',
  INVALID_VALUE: 'INVALID_VALUE',
  MARGIN_BREACH: 'MARGIN_BREACH',
  OFFER_NOT_FOUND: 'OFFER_NOT_FOUND',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  ALREADY_ARCHIVED: 'ALREADY_ARCHIVED',
  NOT_DRAFT: 'NOT_DRAFT',
  NOT_APPROVED: 'NOT_APPROVED',
};

class OfferError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'OfferError';
    this.code = code;
    this.detail = detail;
  }
}

// -------------------------------------------------------------------------
// Validation
// -------------------------------------------------------------------------

/**
 * Validate an offer definition.
 */
export function validateOffer(offer) {
  const errors = [];
  if (!offer.name || !offer.name.trim()) errors.push('Offer name is required');
  if (!offer.type || !Object.values(OFFER_TYPE).includes(offer.type)) {
    errors.push(`Offer type must be one of: ${Object.values(OFFER_TYPE).join(', ')}`);
  }
  if (offer.value == null || isNaN(Number(offer.value)) || Number(offer.value) < 0) {
    errors.push('Offer value must be a non-negative number');
  }
  if (offer.type === OFFER_TYPE.PERCENTAGE && Number(offer.value) > 100) {
    errors.push('Percentage offer cannot exceed 100%');
  }
  if (offer.startDate && offer.endDate && offer.startDate > offer.endDate) {
    errors.push('startDate must be on or before endDate');
  }
  return { valid: errors.length === 0, errors };
}

// -------------------------------------------------------------------------
// Margin safety
// -------------------------------------------------------------------------

/**
 * Check if applying an offer would breach the minimum margin.
 *
 * @param {number} listPrice - The list selling price before GST
 * @param {number} cost - The total project cost
 * @param {object} offer - { type, value }
 * @param {number} minMargin - Minimum gross margin (e.g., 0.15 for 15%)
 * @returns {{ safe: boolean, effectiveMargin: number, breach: number|null }}
 */
export function marginSafetyCheck(listPrice, cost, offer, minMargin) {
  if (!listPrice || !cost || listPrice <= 0 || cost <= 0) {
    return { safe: false, effectiveMargin: 0, breach: null, reason: 'Missing price or cost data' };
  }

  let offerAmount = 0;
  if (offer.type === OFFER_TYPE.FLAT) {
    offerAmount = Number(offer.value);
  } else if (offer.type === OFFER_TYPE.PERCENTAGE) {
    offerAmount = listPrice * (Number(offer.value) / 100);
  }

  const netPrice = listPrice - offerAmount;
  if (netPrice <= 0) {
    return { safe: false, effectiveMargin: -1, breach: minMargin, reason: 'Offer exceeds list price' };
  }

  // Gross margin = (netPrice - cost) / netPrice
  const effectiveMargin = (netPrice - cost) / netPrice;

  return {
    safe: effectiveMargin >= minMargin,
    effectiveMargin,
    breach: effectiveMargin < minMargin ? minMargin - effectiveMargin : null,
    offerAmount,
    netPrice,
  };
}

// -------------------------------------------------------------------------
// State transitions
// -------------------------------------------------------------------------

/**
 * Check if a transition is valid.
 *
 * @param {string} from - Current status
 * @param {string} to - Target status
 * @returns {boolean}
 */
export function isValidTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Transition an offer to a new status.
 *
 * Mutates the offer in place and returns it. The caller is responsible
 * for persisting the change to storage.
 *
 * @param {object} offer - The offer object
 * @param {string} toStatus - Target status
 * @param {string} changedBy - userId of the actor performing the transition
 * @param {string} [reason] - Optional reason for the transition
 * @returns {{ offer: object, transition: object }}
 * @throws {OfferError} if the transition is invalid
 */
export function transitionOffer(offer, toStatus, changedBy, reason) {
  const fromStatus = offer.status || OFFER_STATUS.DRAFT;

  if (!isValidTransition(fromStatus, toStatus)) {
    throw new OfferError(
      OFFER_ERROR.INVALID_TRANSITION,
      `Cannot transition from ${fromStatus} to ${toStatus}`,
      { from: fromStatus, to: toStatus, allowed: VALID_TRANSITIONS[fromStatus] || [] }
    );
  }

  const now = new Date().toISOString();
  const transition = {
    from: fromStatus,
    to: toStatus,
    changedBy,
    changedAt: now,
    reason: reason || null,
  };

  // Update the offer
  offer.status = toStatus;
  offer.changedBy = changedBy;
  offer.changedAt = now;

  // Maintain audit trail
  if (!offer.transitions) offer.transitions = [];
  offer.transitions.push(transition);

  // Legacy compatibility: sync the `active` boolean
  offer.active = toStatus === OFFER_STATUS.ACTIVE;

  return { offer, transition };
}

/**
 * Create a new offer in DRAFT status.
 *
 * @param {object} fields - Offer fields (name, type, value, etc.)
 * @param {string} createdBy - userId of the creator
 * @returns {object} The new offer object
 */
export function createDraftOffer(fields, createdBy) {
  const now = new Date().toISOString();
  return {
    id: fields.id || 'offer_' + Date.now(),
    name: fields.name || 'New Offer',
    type: fields.type || OFFER_TYPE.FLAT,
    value: Number(fields.value) || 0,
    appliesTo: fields.appliesTo || 'all',
    appliesToTier: fields.appliesToTier || 'all',
    appliesToSize: fields.appliesToSize || 'all',
    startDate: fields.startDate || '',
    endDate: fields.endDate || '',
    description: fields.description || '',
    status: OFFER_STATUS.DRAFT,
    active: false,
    offerVersion: 1,
    createdAt: now,
    createdBy,
    changedAt: now,
    changedBy: createdBy,
    transitions: [{
      from: null,
      to: OFFER_STATUS.DRAFT,
      changedBy: createdBy,
      changedAt: now,
      reason: 'Offer created',
    }],
  };
}

/**
 * Update allowed fields on an offer. Only DRAFT and APPROVED offers can be
 * edited (APPROVED reverts to DRAFT on content change). Active/Expired/Archived
 * offers are immutable.
 *
 * @param {object} offer - The existing offer
 * @param {object} updates - Fields to update
 * @param {string} changedBy - userId of the editor
 * @returns {{ offer: object, reverted: boolean }}
 * @throws {OfferError} if the offer is not editable
 */
export function updateOffer(offer, updates, changedBy) {
  const editableStatuses = [OFFER_STATUS.DRAFT, OFFER_STATUS.APPROVED];
  if (!editableStatuses.includes(offer.status)) {
    throw new OfferError(
      OFFER_ERROR.INVALID_TRANSITION,
      `Cannot edit offer in ${offer.status} status. Only DRAFT and APPROVED offers can be edited.`,
      { status: offer.status }
    );
  }

  const now = new Date().toISOString();
  const editableFields = ['name', 'type', 'value', 'appliesTo', 'appliesToTier', 'appliesToSize', 'startDate', 'endDate', 'description'];

  let changed = false;
  for (const field of editableFields) {
    if (updates[field] !== undefined && updates[field] !== offer[field]) {
      offer[field] = updates[field];
      changed = true;
    }
  }

  let reverted = false;
  if (changed) {
    offer.offerVersion = (offer.offerVersion || 1) + 1;
    offer.changedAt = now;
    offer.changedBy = changedBy;

    // If APPROVED, revert to DRAFT on content change (needs re-approval)
    if (offer.status === OFFER_STATUS.APPROVED) {
      transitionOffer(offer, OFFER_STATUS.DRAFT, changedBy, 'Content changed — reverted to DRAFT for re-approval');
      reverted = true;
    }
  }

  return { offer, reverted };
}

/**
 * Check if any ACTIVE offers should be auto-expired based on their endDate.
 *
 * @param {Array} offers - All offers
 * @param {string} [asOf] - Date to check against (ISO string, defaults to today)
 * @returns {Array} offers that were expired
 */
export function autoExpireOffers(offers, asOf) {
  if (!Array.isArray(offers)) return [];
  const now = asOf || new Date().toISOString().slice(0, 10);
  const expired = [];

  for (const offer of offers) {
    if (offer.status === OFFER_STATUS.ACTIVE && offer.endDate && offer.endDate < now) {
      transitionOffer(offer, OFFER_STATUS.EXPIRED, 'SYSTEM', 'Auto-expired: endDate passed');
      expired.push(offer);
    }
  }

  return expired;
}

// -------------------------------------------------------------------------
// Offer lookup
// -------------------------------------------------------------------------

/**
 * Find the best active offer for a given system/tier/size.
 *
 * @param {Array} offers - All offers from the catalog
 * @param {object} criteria - { systemType, tier, size, date }
 * @returns {object|null} The applicable offer, or null
 */
export function findApplicableOffer(offers, { systemType, tier, size, date }) {
  if (!offers || !Array.isArray(offers)) return null;
  const now = date || new Date().toISOString().slice(0, 10);

  const active = offers.filter(o => {
    // Must be ACTIVE status (not just boolean)
    if (o.status !== OFFER_STATUS.ACTIVE) return false;
    if (o.startDate && o.startDate > now) return false;
    if (o.endDate && o.endDate < now) return false;
    // Check appliesTo criteria
    if (o.appliesTo && o.appliesTo !== 'all') {
      if (o.appliesTo !== systemType) return false;
    }
    if (o.appliesToTier && o.appliesToTier !== 'all') {
      if (o.appliesToTier !== tier) return false;
    }
    if (o.appliesToSize && o.appliesToSize !== 'all') {
      if (o.appliesToSize !== size) return false;
    }
    return true;
  });

  if (!active.length) return null;

  // Return the most recently created applicable offer
  return active.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
}

// -------------------------------------------------------------------------
// Calculation helpers
// -------------------------------------------------------------------------

/**
 * Calculate the offer amount for display.
 */
export function calculateOfferAmount(offer, listPrice) {
  if (!offer || !listPrice || listPrice <= 0) return 0;
  if (offer.type === OFFER_TYPE.FLAT) return Math.min(Number(offer.value), listPrice);
  if (offer.type === OFFER_TYPE.PERCENTAGE) return listPrice * (Number(offer.value) / 100);
  return 0;
}

/**
 * Build the offer section for quotation payload.
 * Pure assembler shape — no calculation.
 */
export function offerPayloadShape(offer, listPrice) {
  if (!offer) return { available: false, source: 'NO_ACTIVE_OFFER', value: null };
  const amount = calculateOfferAmount(offer, listPrice);
  return {
    available: true,
    source: 'OFFER_MASTER',
    value: {
      offerId: offer.id || null,
      offerName: offer.name || null,
      offerType: offer.type,
      offerValue: Number(offer.value),
      offerAmount: amount,
      offerVersion: offer.offerVersion || 1,
      offerStatus: offer.status,
      appliesTo: offer.appliesTo || 'all',
      appliesToTier: offer.appliesToTier || 'all',
      startDate: offer.startDate || null,
      endDate: offer.endDate || null,
    },
  };
}

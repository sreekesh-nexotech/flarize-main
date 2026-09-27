/**
 * CMS Dynamic Field Registry — C11-C.
 *
 * Customer-safe field whitelist. CMS users reference fields by fieldId,
 * NEVER by arbitrary payload paths. No eval, no Function(), no expressions.
 *
 * Fields map fieldId → { payloadPath, label, category, format, fallbackDefault }.
 * The resolver reads values from a resolved quotation payload using only
 * whitelisted paths.
 *
 * SECURITY: Internal fields (pricing.internal.*, engineering.*, margin,
 * cost, supplier/purchase data, actor/session metadata, snapshot internals)
 * are NEVER exposed.
 */

// ── Fallback modes ───────────────────────────────────────────────────

export const FALLBACK_MODE = Object.freeze({
  BLOCKED:      'blocked',      // render "[Data unavailable]"
  HIDE:         'hide',         // render empty string — block disappears
  FALLBACK_TEXT: 'fallbackText', // render custom fallback text
});

// ── Field categories ─────────────────────────────────────────────────

export const FIELD_CATEGORY = Object.freeze({
  CUSTOMER:   'CUSTOMER',
  SYSTEM:     'SYSTEM',
  PRICING:    'PRICING',
  COMPONENT:  'COMPONENT',
  CAMPAIGN:   'CAMPAIGN',
  QUOTATION:  'QUOTATION',
  SAVINGS:    'SAVINGS',
});

// ── Format types ─────────────────────────────────────────────────────

export const FIELD_FORMAT = Object.freeze({
  TEXT:     'text',
  NUMBER:   'number',
  CURRENCY: 'currency',
  PHONE:    'phone',
  DATE:     'date',
  LIST:     'list',     // array of objects (offers, etc.)
  OBJECT:   'object',   // nested object (luckyDraw, referral, etc.)
});

// ── Forbidden path prefixes (security) ───────────────────────────────

const FORBIDDEN_PREFIXES = Object.freeze([
  'pricing.internal',
  'pricing.value.procurementcost',
  'pricing.value.landedcost',
  'pricing.value.materialcost',
  'pricing.value.marginamount',
  'pricing.value.marginpercent',
  'pricing.value.discountamount',
  'pricing.value.costbreakdown',
  'discount',
  'engineering',
  'bomsnapshot',
  'commercialsnapshot',
  'supplier',
  'purchase',
  'margin',
  'cost',
  'rate',
  'actor',
  'session',
  'token',
  'version',
  'snapshot',
  'internal',
]);

// ── Built-in field definitions ───────────────────────────────────────

const BUILT_IN_FIELDS = Object.freeze({
  // CUSTOMER
  'customer.name': {
    fieldId: 'customer.name',
    payloadPath: 'customerName',
    label: 'Customer Name',
    category: FIELD_CATEGORY.CUSTOMER,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'customer.address': {
    fieldId: 'customer.address',
    payloadPath: 'customerAddress',
    label: 'Customer Address',
    category: FIELD_CATEGORY.CUSTOMER,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'customer.phone': {
    fieldId: 'customer.phone',
    payloadPath: 'customerPhone',
    label: 'Customer Phone',
    category: FIELD_CATEGORY.CUSTOMER,
    format: FIELD_FORMAT.PHONE,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'customer.pincode': {
    fieldId: 'customer.pincode',
    payloadPath: 'customerPincode',
    label: 'Customer Pincode',
    category: FIELD_CATEGORY.CUSTOMER,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },

  // SYSTEM
  'system.type': {
    fieldId: 'system.type',
    payloadPath: 'systemType',
    label: 'System Type',
    category: FIELD_CATEGORY.SYSTEM,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'system.sizeKw': {
    fieldId: 'system.sizeKw',
    payloadPath: 'systemSizekW',
    label: 'System Size (kW)',
    category: FIELD_CATEGORY.SYSTEM,
    format: FIELD_FORMAT.NUMBER,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'system.phase': {
    fieldId: 'system.phase',
    payloadPath: 'components.inverter.phase',
    label: 'Phase',
    category: FIELD_CATEGORY.SYSTEM,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'system.panelCount': {
    fieldId: 'system.panelCount',
    payloadPath: 'panelCountRequired',
    label: 'Panel Count',
    category: FIELD_CATEGORY.SYSTEM,
    format: FIELD_FORMAT.NUMBER,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },

  // PRICING (customer-facing only)
  'pricing.customer.sellingPriceBeforeGST': {
    fieldId: 'pricing.customer.sellingPriceBeforeGST',
    payloadPath: 'pricing.value.systemCostBeforeSubsidy',
    label: 'Selling Price (before GST)',
    category: FIELD_CATEGORY.PRICING,
    format: FIELD_FORMAT.CURRENCY,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'pricing.customer.gstAmount': {
    fieldId: 'pricing.customer.gstAmount',
    payloadPath: 'pricing.value.gstAmount',
    label: 'GST Amount',
    category: FIELD_CATEGORY.PRICING,
    format: FIELD_FORMAT.CURRENCY,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'pricing.customer.customerTotalIncludingGST': {
    fieldId: 'pricing.customer.customerTotalIncludingGST',
    payloadPath: 'pricing.value.customerTotalIncludingGST',
    label: 'Total (incl. GST)',
    category: FIELD_CATEGORY.PRICING,
    format: FIELD_FORMAT.CURRENCY,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },

  // COMPONENT
  'component.panel.brand': {
    fieldId: 'component.panel.brand',
    payloadPath: 'components.panel.brand',
    label: 'Panel Brand',
    category: FIELD_CATEGORY.COMPONENT,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'component.panel.model': {
    fieldId: 'component.panel.model',
    payloadPath: 'components.panel.model',
    label: 'Panel Model',
    category: FIELD_CATEGORY.COMPONENT,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'component.panel.watt': {
    fieldId: 'component.panel.watt',
    payloadPath: 'components.panel.moduleWatt',
    label: 'Panel Watt',
    category: FIELD_CATEGORY.COMPONENT,
    format: FIELD_FORMAT.NUMBER,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'component.inverter.brand': {
    fieldId: 'component.inverter.brand',
    payloadPath: 'components.inverter.brand',
    label: 'Inverter Brand',
    category: FIELD_CATEGORY.COMPONENT,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'component.inverter.model': {
    fieldId: 'component.inverter.model',
    payloadPath: 'components.inverter.model',
    label: 'Inverter Model',
    category: FIELD_CATEGORY.COMPONENT,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },

  // CAMPAIGN
  'campaign.headline': {
    fieldId: 'campaign.headline',
    payloadPath: 'campaign.value.headline',
    label: 'Campaign Headline',
    category: FIELD_CATEGORY.CAMPAIGN,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },
  'campaign.subheadline': {
    fieldId: 'campaign.subheadline',
    payloadPath: 'campaign.value.subheadline',
    label: 'Campaign Subheadline',
    category: FIELD_CATEGORY.CAMPAIGN,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },
  'campaign.primaryBenefit.headline': {
    fieldId: 'campaign.primaryBenefit.headline',
    payloadPath: 'campaign.value.primaryBenefit.headline',
    label: 'Primary Benefit Headline',
    category: FIELD_CATEGORY.CAMPAIGN,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },
  'campaign.primaryBenefit.displayValue': {
    fieldId: 'campaign.primaryBenefit.displayValue',
    payloadPath: 'campaign.value.primaryBenefit.displayValue',
    label: 'Primary Benefit Value',
    category: FIELD_CATEGORY.CAMPAIGN,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },
  'campaign.offers': {
    fieldId: 'campaign.offers',
    payloadPath: 'campaign.value.offers',
    label: 'Campaign Offers',
    category: FIELD_CATEGORY.CAMPAIGN,
    format: FIELD_FORMAT.LIST,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },
  'campaign.luckyDraw': {
    fieldId: 'campaign.luckyDraw',
    payloadPath: 'campaign.value.luckyDraw',
    label: 'Lucky Draw',
    category: FIELD_CATEGORY.CAMPAIGN,
    format: FIELD_FORMAT.OBJECT,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },
  'campaign.referral': {
    fieldId: 'campaign.referral',
    payloadPath: 'campaign.value.referral',
    label: 'Referral Program',
    category: FIELD_CATEGORY.CAMPAIGN,
    format: FIELD_FORMAT.OBJECT,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },
  'campaign.urgency.displayText': {
    fieldId: 'campaign.urgency.displayText',
    payloadPath: 'campaign.value.urgency.displayText',
    label: 'Urgency Text',
    category: FIELD_CATEGORY.CAMPAIGN,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },
  'campaign.cta.buttonText': {
    fieldId: 'campaign.cta.buttonText',
    payloadPath: 'campaign.value.cta.buttonText',
    label: 'CTA Button Text',
    category: FIELD_CATEGORY.CAMPAIGN,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },
  'campaign.cta.description': {
    fieldId: 'campaign.cta.description',
    payloadPath: 'campaign.value.cta.description',
    label: 'CTA Description',
    category: FIELD_CATEGORY.CAMPAIGN,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },
  'campaign.disclaimer': {
    fieldId: 'campaign.disclaimer',
    payloadPath: 'campaign.value.disclaimer',
    label: 'Campaign Disclaimer',
    category: FIELD_CATEGORY.CAMPAIGN,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },

  // QUOTATION
  'quotation.number': {
    fieldId: 'quotation.number',
    payloadPath: 'quotationId',
    label: 'Quotation Number',
    category: FIELD_CATEGORY.QUOTATION,
    format: FIELD_FORMAT.TEXT,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'quotation.date': {
    fieldId: 'quotation.date',
    payloadPath: 'quotationDate',
    label: 'Quotation Date',
    category: FIELD_CATEGORY.QUOTATION,
    format: FIELD_FORMAT.DATE,
    fallbackDefault: FALLBACK_MODE.BLOCKED,
  },
  'quotation.validUntil': {
    fieldId: 'quotation.validUntil',
    payloadPath: 'validUntil',
    label: 'Valid Until',
    category: FIELD_CATEGORY.QUOTATION,
    format: FIELD_FORMAT.DATE,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },

  // SAVINGS
  'savings.annualAmount': {
    fieldId: 'savings.annualAmount',
    payloadPath: 'savings.value.annualSaving',
    label: 'Annual Savings',
    category: FIELD_CATEGORY.SAVINGS,
    format: FIELD_FORMAT.CURRENCY,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },
  'savings.lifetimeAmount': {
    fieldId: 'savings.lifetimeAmount',
    payloadPath: 'savings.value.lifetimeSaving',
    label: 'Lifetime Savings',
    category: FIELD_CATEGORY.SAVINGS,
    format: FIELD_FORMAT.CURRENCY,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },
  'savings.returnPeriodMonths': {
    fieldId: 'savings.returnPeriodMonths',
    payloadPath: 'savings.value.returnPeriodMonths',
    label: 'Return Period (months)',
    category: FIELD_CATEGORY.SAVINGS,
    format: FIELD_FORMAT.NUMBER,
    fallbackDefault: FALLBACK_MODE.HIDE,
  },
});

// ── Registry class ───────────────────────────────────────────────────

export class FieldRegistry {
  constructor() {
    this._fields = {};
    // Load built-in fields
    for (const [id, def] of Object.entries(BUILT_IN_FIELDS)) {
      this._fields[id] = { ...def };
    }
  }

  /** Get field definition by fieldId. Returns null if not found. */
  get(fieldId) {
    return this._fields[fieldId] || null;
  }

  /** Check if fieldId exists. */
  has(fieldId) {
    return fieldId in this._fields;
  }

  /** List all fields. */
  all() {
    return Object.values(this._fields);
  }

  /** List fields by category. */
  byCategory(category) {
    return this.all().filter(f => f.category === category);
  }

  /** Get field count. */
  count() {
    return Object.keys(this._fields).length;
  }
}

// ── Path safety validation ───────────────────────────────────────────

/**
 * Check if a payload path is forbidden (internal/sensitive).
 * Used to prevent registering fields that expose internal data.
 */
export function isForbiddenPath(path) {
  if (!path || typeof path !== 'string') return true;
  const lower = path.toLowerCase();
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (lower === prefix || lower.startsWith(prefix + '.')) return true;
  }
  return false;
}

/**
 * Validate a fieldId — must be non-empty string, no dangerous chars.
 * Allowed: alphanumeric, dots, underscores, hyphens.
 */
export function isValidFieldId(fieldId) {
  if (!fieldId || typeof fieldId !== 'string') return false;
  return /^[a-zA-Z][a-zA-Z0-9._-]{0,99}$/.test(fieldId);
}

// ── Value resolver ───────────────────────────────────────────────────

/**
 * Resolve a field value from a quotation payload using the registered path.
 * No eval. No Function(). No arbitrary expression execution.
 * Only safe dot-path traversal on whitelisted paths.
 *
 * @param {object} payload - Resolved quotation payload
 * @param {object} fieldDef - Field definition from registry
 * @param {object} [options] - { fallback: 'blocked'|'hide'|'fallbackText', fallbackText: '...' }
 * @returns {{ value: any, resolved: boolean, display: string }}
 */
export function resolveFieldValue(payload, fieldDef, options = {}) {
  if (!payload || !fieldDef || !fieldDef.payloadPath) {
    return applyFallback(fieldDef, options);
  }

  // Safe dot-path traversal — no eval, no bracket notation, no expressions
  const parts = fieldDef.payloadPath.split('.');
  let current = payload;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return applyFallback(fieldDef, options);
    }
    current = current[part];
  }

  if (current === undefined || current === null) {
    return applyFallback(fieldDef, options);
  }

  return { value: current, resolved: true, display: String(current) };
}

function applyFallback(fieldDef, options) {
  const mode = options.fallback || (fieldDef ? fieldDef.fallbackDefault : FALLBACK_MODE.BLOCKED);

  switch (mode) {
    case FALLBACK_MODE.HIDE:
      return { value: null, resolved: false, display: '' };
    case FALLBACK_MODE.FALLBACK_TEXT:
      return { value: null, resolved: false, display: options.fallbackText || '' };
    case FALLBACK_MODE.BLOCKED:
    default:
      return { value: null, resolved: false, display: '[Data unavailable]' };
  }
}

// ── Singleton convenience ────────────────────────────────────────────

let _defaultRegistry = null;

export function getDefaultRegistry() {
  if (!_defaultRegistry) _defaultRegistry = new FieldRegistry();
  return _defaultRegistry;
}

/** Reset for testing. */
export function _resetDefaultRegistry() {
  _defaultRegistry = null;
}

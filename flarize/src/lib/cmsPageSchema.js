/**
 * CMS Page JSON Schema — C11-D.
 *
 * Controlled block system for A4 quotation page design.
 * 12 approved block types, no arbitrary HTML/CSS/JS.
 *
 * A4 canvas: 794 × 1123 px
 */

import { isValidFieldId, getDefaultRegistry } from './cmsFieldRegistry.js';

// ── A4 dimensions ────────────────────────────────────────────────────

export const A4_WIDTH  = 794;
export const A4_HEIGHT = 1123;

// ── Schema version ───────────────────────────────────────────────────

export const SCHEMA_VERSION = 'pageSchema.1';

// ── Block type whitelist ─────────────────────────────────────────────

export const BLOCK_TYPE = Object.freeze({
  // Layout
  SECTION:          'section',
  COLUMNS:          'columns',
  COLUMN:           'column',
  OVERLAY:          'overlay',
  // Content
  HEADING:          'heading',
  TEXT:             'text',
  IMAGE:            'image',
  BACKGROUND_IMAGE: 'backgroundImage',
  DIVIDER:          'divider',
  SPACER:           'spacer',
  // Dynamic
  DYNAMIC_FIELD:    'dynamicField',
  QR:               'qr',
});

const BLOCK_TYPE_SET = new Set(Object.values(BLOCK_TYPE));

export const LAYOUT_BLOCKS  = Object.freeze(['section', 'columns', 'column', 'overlay']);
export const CONTENT_BLOCKS = Object.freeze(['heading', 'text', 'image', 'backgroundImage', 'divider', 'spacer']);
export const DYNAMIC_BLOCKS = Object.freeze(['dynamicField', 'qr']);

// ── Page types ───────────────────────────────────────────────────────

export const PAGE_TYPE = Object.freeze({
  CAMPAIGN:  'campaign',
  CUSTOM:    'custom',
  TEMPLATE:  'template',
});

// ── Approved formatting values ───────────────────────────────────────

export const APPROVED_FONTS = Object.freeze([
  'Arial', 'Helvetica', 'Times New Roman', 'Georgia',
  'Verdana', 'Tahoma', 'Trebuchet MS', 'Roboto', 'Open Sans',
  'Lato', 'Montserrat', 'Poppins', 'Noto Sans',
]);

export const APPROVED_FONT_SIZES = Object.freeze([
  8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72,
]);

export const APPROVED_FONT_WEIGHTS = Object.freeze([
  '300', '400', '500', '600', '700', '800', '900',
  'normal', 'bold',
]);

export const APPROVED_TEXT_ALIGNS = Object.freeze([
  'left', 'center', 'right', 'justify',
]);

// Max padding/margin value (px)
const MAX_SPACING = 200;

// ── Dangerous content patterns ───────────────────────────────────────

const DANGEROUS_PATTERNS = [
  /<script/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /<form/i,
  /on\w+\s*=/i,              // event handlers: onclick=, onload=, etc.
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /<style/i,                  // no inline style tags
  /expression\s*\(/i,        // CSS expression()
  /url\s*\(\s*['"]?\s*javascript/i,
];

// ── Color validation ─────────────────────────────────────────────────

const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGBA_RE = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/;

function isValidColor(val) {
  if (!val || typeof val !== 'string') return false;
  return COLOR_RE.test(val) || RGBA_RE.test(val) || val === 'transparent';
}

// ── Validation errors ────────────────────────────────────────────────

export class PageSchemaError extends Error {
  constructor(message, path = '', details = null) {
    super(message);
    this.name = 'PageSchemaError';
    this.path = path;
    this.details = details;
  }
}

// ── ID validation ────────────────────────────────────────────────────

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function isValidId(id) {
  return id && typeof id === 'string' && ID_RE.test(id);
}

// ── Content sanitization check ───────────────────────────────────────

export function containsDangerousContent(text) {
  if (!text || typeof text !== 'string') return false;
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

// ── Block validation ─────────────────────────────────────────────────

function validateBlock(block, path, errors, seenIds, assetIds) {
  if (!block || typeof block !== 'object') {
    errors.push(new PageSchemaError('Block must be an object', path));
    return;
  }

  // ID
  if (!isValidId(block.id)) {
    errors.push(new PageSchemaError('Block must have a valid id', path));
  } else if (seenIds.has(block.id)) {
    errors.push(new PageSchemaError(`Duplicate block id "${block.id}"`, path));
  } else {
    seenIds.add(block.id);
  }

  // Block type
  if (!BLOCK_TYPE_SET.has(block.blockType)) {
    errors.push(new PageSchemaError(
      `Unknown block type "${block.blockType}". Allowed: ${[...BLOCK_TYPE_SET].join(', ')}`,
      path));
    return; // can't validate further
  }

  // Visibility
  if (block.visible !== undefined && typeof block.visible !== 'boolean') {
    errors.push(new PageSchemaError('visible must be boolean', path));
  }

  // Sort order
  if (block.sortOrder !== undefined && (typeof block.sortOrder !== 'number' || !Number.isFinite(block.sortOrder))) {
    errors.push(new PageSchemaError('sortOrder must be a finite number', path));
  }

  // Type-specific validation
  switch (block.blockType) {
    case BLOCK_TYPE.SECTION:
      validateSection(block, path, errors, seenIds, assetIds);
      break;
    case BLOCK_TYPE.COLUMNS:
      validateColumns(block, path, errors, seenIds, assetIds);
      break;
    case BLOCK_TYPE.COLUMN:
      validateColumn(block, path, errors, seenIds, assetIds);
      break;
    case BLOCK_TYPE.OVERLAY:
      validateOverlay(block, path, errors, seenIds, assetIds);
      break;
    case BLOCK_TYPE.HEADING:
    case BLOCK_TYPE.TEXT:
      validateTextBlock(block, path, errors);
      break;
    case BLOCK_TYPE.IMAGE:
      validateImage(block, path, errors, assetIds);
      break;
    case BLOCK_TYPE.BACKGROUND_IMAGE:
      validateBackgroundImage(block, path, errors, assetIds);
      break;
    case BLOCK_TYPE.DIVIDER:
      validateDivider(block, path, errors);
      break;
    case BLOCK_TYPE.SPACER:
      validateSpacer(block, path, errors);
      break;
    case BLOCK_TYPE.DYNAMIC_FIELD:
      validateDynamicField(block, path, errors);
      break;
    case BLOCK_TYPE.QR:
      validateQr(block, path, errors);
      break;
  }
}

function validateSection(block, path, errors, seenIds, assetIds) {
  if (block.children && Array.isArray(block.children)) {
    block.children.forEach((child, i) => {
      validateBlock(child, `${path}.children[${i}]`, errors, seenIds, assetIds);
    });
  }
  validateSpacing(block.padding, `${path}.padding`, errors);
  validateSpacing(block.margin, `${path}.margin`, errors);
  if (block.backgroundColor && !isValidColor(block.backgroundColor)) {
    errors.push(new PageSchemaError('Invalid backgroundColor', path));
  }
}

function validateColumns(block, path, errors, seenIds, assetIds) {
  if (!block.children || !Array.isArray(block.children)) {
    errors.push(new PageSchemaError('columns must have children array', path));
    return;
  }
  for (let i = 0; i < block.children.length; i++) {
    const child = block.children[i];
    if (child && child.blockType !== BLOCK_TYPE.COLUMN) {
      errors.push(new PageSchemaError('columns children must be column blocks', `${path}.children[${i}]`));
    }
    validateBlock(child, `${path}.children[${i}]`, errors, seenIds, assetIds);
  }
}

function validateColumn(block, path, errors, seenIds, assetIds) {
  if (block.widthPercent !== undefined) {
    if (typeof block.widthPercent !== 'number' || block.widthPercent < 1 || block.widthPercent > 100) {
      errors.push(new PageSchemaError('widthPercent must be 1-100', path));
    }
  }
  if (block.children && Array.isArray(block.children)) {
    block.children.forEach((child, i) => {
      validateBlock(child, `${path}.children[${i}]`, errors, seenIds, assetIds);
    });
  }
  validateSpacing(block.padding, `${path}.padding`, errors);
}

function validateOverlay(block, path, errors, seenIds, assetIds) {
  // Position is required
  if (block.x === undefined || block.y === undefined) {
    errors.push(new PageSchemaError('overlay must have x and y coordinates', path));
  } else {
    if (typeof block.x !== 'number' || typeof block.y !== 'number') {
      errors.push(new PageSchemaError('overlay x and y must be numbers', path));
    }
    // Bounds check — overlay must stay within A4 canvas
    const w = typeof block.width === 'number' ? block.width : 0;
    const h = typeof block.height === 'number' ? block.height : 0;
    if (block.x < 0 || block.y < 0) {
      errors.push(new PageSchemaError('overlay position must not be negative', path));
    }
    if (block.x + w > A4_WIDTH) {
      errors.push(new PageSchemaError(`overlay exceeds A4 width (${A4_WIDTH}px)`, path));
    }
    if (block.y + h > A4_HEIGHT) {
      errors.push(new PageSchemaError(`overlay exceeds A4 height (${A4_HEIGHT}px)`, path));
    }
  }
  if (block.width !== undefined && (typeof block.width !== 'number' || block.width < 0)) {
    errors.push(new PageSchemaError('overlay width must be non-negative number', path));
  }
  if (block.height !== undefined && (typeof block.height !== 'number' || block.height < 0)) {
    errors.push(new PageSchemaError('overlay height must be non-negative number', path));
  }
  // Overlay children
  if (block.children && Array.isArray(block.children)) {
    block.children.forEach((child, i) => {
      validateBlock(child, `${path}.children[${i}]`, errors, seenIds, assetIds);
    });
  }
}

function validateTextBlock(block, path, errors) {
  if (block.content !== undefined && typeof block.content !== 'string') {
    errors.push(new PageSchemaError('content must be a string', path));
  }
  if (block.content && containsDangerousContent(block.content)) {
    errors.push(new PageSchemaError('content contains dangerous HTML/script', path));
  }
  if (block.fontFamily && !APPROVED_FONTS.includes(block.fontFamily)) {
    errors.push(new PageSchemaError(`fontFamily "${block.fontFamily}" not approved`, path));
  }
  if (block.fontSize !== undefined && !APPROVED_FONT_SIZES.includes(block.fontSize)) {
    errors.push(new PageSchemaError(`fontSize ${block.fontSize} not approved`, path));
  }
  if (block.fontWeight && !APPROVED_FONT_WEIGHTS.includes(block.fontWeight)) {
    errors.push(new PageSchemaError(`fontWeight "${block.fontWeight}" not approved`, path));
  }
  if (block.textAlign && !APPROVED_TEXT_ALIGNS.includes(block.textAlign)) {
    errors.push(new PageSchemaError(`textAlign "${block.textAlign}" not approved`, path));
  }
  if (block.color && !isValidColor(block.color)) {
    errors.push(new PageSchemaError('Invalid text color', path));
  }
}

function validateImage(block, path, errors, assetIds) {
  if (!block.assetId && !block.src) {
    errors.push(new PageSchemaError('image must have assetId or src', path));
  }
  if (block.assetId) {
    assetIds.add(block.assetId);
  }
  if (block.src && containsDangerousContent(block.src)) {
    errors.push(new PageSchemaError('image src contains dangerous content', path));
  }
  if (block.alt !== undefined && typeof block.alt !== 'string') {
    errors.push(new PageSchemaError('alt must be a string', path));
  }
  if (block.width !== undefined && (typeof block.width !== 'number' || block.width < 0)) {
    errors.push(new PageSchemaError('image width must be non-negative', path));
  }
  if (block.height !== undefined && (typeof block.height !== 'number' || block.height < 0)) {
    errors.push(new PageSchemaError('image height must be non-negative', path));
  }
}

function validateBackgroundImage(block, path, errors, assetIds) {
  if (!block.assetId) {
    errors.push(new PageSchemaError('backgroundImage must have assetId', path));
  } else {
    assetIds.add(block.assetId);
  }
  if (block.fit && !['cover', 'contain', 'fill', 'none'].includes(block.fit)) {
    errors.push(new PageSchemaError('backgroundImage fit must be cover|contain|fill|none', path));
  }
}

function validateDivider(block, path, errors) {
  if (block.thickness !== undefined && (typeof block.thickness !== 'number' || block.thickness < 0 || block.thickness > 20)) {
    errors.push(new PageSchemaError('divider thickness must be 0-20', path));
  }
  if (block.color && !isValidColor(block.color)) {
    errors.push(new PageSchemaError('Invalid divider color', path));
  }
}

function validateSpacer(block, path, errors) {
  if (block.height !== undefined && (typeof block.height !== 'number' || block.height < 0 || block.height > MAX_SPACING)) {
    errors.push(new PageSchemaError(`spacer height must be 0-${MAX_SPACING}`, path));
  }
}

function validateDynamicField(block, path, errors) {
  if (!block.fieldId) {
    errors.push(new PageSchemaError('dynamicField must have fieldId', path));
    return;
  }
  if (!isValidFieldId(block.fieldId)) {
    errors.push(new PageSchemaError(`Invalid fieldId "${block.fieldId}"`, path));
    return;
  }
  // Verify field exists in registry
  const registry = getDefaultRegistry();
  if (!registry.has(block.fieldId)) {
    errors.push(new PageSchemaError(`Unknown fieldId "${block.fieldId}" — not in registry`, path));
  }
  // Fallback
  if (block.fallback && !['blocked', 'hide', 'fallbackText'].includes(block.fallback)) {
    errors.push(new PageSchemaError('Invalid fallback mode', path));
  }
  // Text styling
  validateTextBlock(block, path, errors);
}

function validateQr(block, path, errors) {
  if (block.dataFieldId && !isValidFieldId(block.dataFieldId)) {
    errors.push(new PageSchemaError('Invalid QR dataFieldId', path));
  }
  if (block.staticValue && containsDangerousContent(block.staticValue)) {
    errors.push(new PageSchemaError('QR staticValue contains dangerous content', path));
  }
  if (block.size !== undefined && (typeof block.size !== 'number' || block.size < 20 || block.size > 400)) {
    errors.push(new PageSchemaError('QR size must be 20-400px', path));
  }
}

function validateSpacing(spacing, path, errors) {
  if (!spacing) return;
  if (typeof spacing !== 'object') {
    errors.push(new PageSchemaError('spacing must be an object', path));
    return;
  }
  for (const side of ['top', 'right', 'bottom', 'left']) {
    if (spacing[side] !== undefined) {
      if (typeof spacing[side] !== 'number' || spacing[side] < 0 || spacing[side] > MAX_SPACING) {
        errors.push(new PageSchemaError(`${side} spacing must be 0-${MAX_SPACING}`, `${path}.${side}`));
      }
    }
  }
}

// ── Page-level validation ────────────────────────────────────────────

/**
 * Validate a complete page JSON document.
 * Returns { valid: boolean, errors: PageSchemaError[], referencedAssetIds: Set }
 */
export function validatePageContent(content) {
  const errors = [];
  const seenIds = new Set();
  const assetIds = new Set();

  if (!content || typeof content !== 'object') {
    errors.push(new PageSchemaError('Page content must be an object', ''));
    return { valid: false, errors, referencedAssetIds: assetIds };
  }

  // Schema version
  if (content.schemaVersion && content.schemaVersion !== SCHEMA_VERSION) {
    errors.push(new PageSchemaError(
      `Unknown schemaVersion "${content.schemaVersion}". Expected "${SCHEMA_VERSION}"`, 'schemaVersion'));
  }

  // Page type
  if (content.pageType && !Object.values(PAGE_TYPE).includes(content.pageType)) {
    errors.push(new PageSchemaError(`Unknown pageType "${content.pageType}"`, 'pageType'));
  }

  // Dimensions
  if (content.width !== undefined && content.width !== A4_WIDTH) {
    errors.push(new PageSchemaError(`Page width must be ${A4_WIDTH}px`, 'width'));
  }
  if (content.height !== undefined && content.height !== A4_HEIGHT) {
    errors.push(new PageSchemaError(`Page height must be ${A4_HEIGHT}px`, 'height'));
  }

  // Background
  if (content.background) {
    if (content.background.color && !isValidColor(content.background.color)) {
      errors.push(new PageSchemaError('Invalid background color', 'background.color'));
    }
    if (content.background.assetId) {
      assetIds.add(content.background.assetId);
    }
  }

  // Theme
  if (content.theme) {
    if (typeof content.theme !== 'object') {
      errors.push(new PageSchemaError('theme must be an object', 'theme'));
    } else {
      const colorFields = ['primaryColor', 'secondaryColor', 'accentColor', 'textColor', 'backgroundColor'];
      for (const field of colorFields) {
        if (content.theme[field] && !isValidColor(content.theme[field])) {
          errors.push(new PageSchemaError(`Invalid theme ${field}`, `theme.${field}`));
        }
      }
    }
  }

  // Sections
  if (content.sections) {
    if (!Array.isArray(content.sections)) {
      errors.push(new PageSchemaError('sections must be an array', 'sections'));
    } else {
      content.sections.forEach((section, i) => {
        validateBlock(section, `sections[${i}]`, errors, seenIds, assetIds);
      });
    }
  }

  // Overlays
  if (content.overlays) {
    if (!Array.isArray(content.overlays)) {
      errors.push(new PageSchemaError('overlays must be an array', 'overlays'));
    } else {
      content.overlays.forEach((overlay, i) => {
        if (overlay && overlay.blockType !== BLOCK_TYPE.OVERLAY) {
          errors.push(new PageSchemaError('overlays array items must be overlay blocks', `overlays[${i}]`));
        }
        validateBlock(overlay, `overlays[${i}]`, errors, seenIds, assetIds);
      });
    }
  }

  return { valid: errors.length === 0, errors, referencedAssetIds: assetIds };
}

/**
 * Check if content is dangerous (contains script/iframe/etc.).
 * Quick scan for use before deeper validation.
 */
export function quickSanityScan(content) {
  const json = JSON.stringify(content);
  return !containsDangerousContent(json);
}

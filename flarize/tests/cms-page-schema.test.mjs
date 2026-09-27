/**
 * C11-D — Page JSON Schema tests.
 * 12 block types, A4 validation, security (no arbitrary HTML/CSS/JS).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  A4_WIDTH, A4_HEIGHT, SCHEMA_VERSION,
  BLOCK_TYPE, PAGE_TYPE,
  APPROVED_FONTS, APPROVED_FONT_SIZES, APPROVED_FONT_WEIGHTS, APPROVED_TEXT_ALIGNS,
  LAYOUT_BLOCKS, CONTENT_BLOCKS, DYNAMIC_BLOCKS,
  PageSchemaError, containsDangerousContent,
  validatePageContent, quickSanityScan,
} from '../src/lib/cmsPageSchema.js';

// ── Helper: minimal valid page ───────────────────────────────────────

function minimalPage(overrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    pageType: PAGE_TYPE.CAMPAIGN,
    width: A4_WIDTH,
    height: A4_HEIGHT,
    sections: [],
    ...overrides,
  };
}

function textBlock(id, content = 'Hello') {
  return { id, blockType: BLOCK_TYPE.TEXT, content };
}

function headingBlock(id, content = 'Title') {
  return { id, blockType: BLOCK_TYPE.HEADING, content };
}

// ── Constants ────────────────────────────────────────────────────────

describe('constants', () => {
  test('A4 dimensions', () => {
    assert.equal(A4_WIDTH, 794);
    assert.equal(A4_HEIGHT, 1123);
  });

  test('exactly 12 block types', () => {
    assert.equal(Object.keys(BLOCK_TYPE).length, 12);
  });

  test('block type categories', () => {
    assert.equal(LAYOUT_BLOCKS.length, 4);
    assert.equal(CONTENT_BLOCKS.length, 6);
    assert.equal(DYNAMIC_BLOCKS.length, 2);
    assert.equal(LAYOUT_BLOCKS.length + CONTENT_BLOCKS.length + DYNAMIC_BLOCKS.length, 12);
  });

  test('BLOCK_TYPE is frozen', () => { assert.ok(Object.isFrozen(BLOCK_TYPE)); });
  test('PAGE_TYPE is frozen', () => { assert.ok(Object.isFrozen(PAGE_TYPE)); });
});

// ── Page-level validation ────────────────────────────────────────────

describe('validatePageContent — page level', () => {
  test('minimal valid page passes', () => {
    const result = validatePageContent(minimalPage());
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  test('null content fails', () => {
    const r = validatePageContent(null);
    assert.equal(r.valid, false);
  });

  test('wrong schemaVersion fails', () => {
    const r = validatePageContent(minimalPage({ schemaVersion: 'bogus' }));
    assert.equal(r.valid, false);
    assert.ok(r.errors[0].message.includes('schemaVersion'));
  });

  test('unknown pageType fails', () => {
    const r = validatePageContent(minimalPage({ pageType: 'whatever' }));
    assert.equal(r.valid, false);
  });

  test('wrong width fails', () => {
    const r = validatePageContent(minimalPage({ width: 800 }));
    assert.equal(r.valid, false);
    assert.ok(r.errors[0].message.includes('width'));
  });

  test('wrong height fails', () => {
    const r = validatePageContent(minimalPage({ height: 1000 }));
    assert.equal(r.valid, false);
  });

  test('invalid background color fails', () => {
    const r = validatePageContent(minimalPage({ background: { color: 'not-a-color' } }));
    assert.equal(r.valid, false);
  });

  test('valid background color passes', () => {
    const r = validatePageContent(minimalPage({ background: { color: '#FF5500' } }));
    assert.equal(r.valid, true);
  });

  test('rgba color passes', () => {
    const r = validatePageContent(minimalPage({ background: { color: 'rgba(255, 0, 0, 0.5)' } }));
    assert.equal(r.valid, true);
  });

  test('transparent passes', () => {
    const r = validatePageContent(minimalPage({ background: { color: 'transparent' } }));
    assert.equal(r.valid, true);
  });

  test('background assetId tracked', () => {
    const r = validatePageContent(minimalPage({ background: { assetId: 'asset_bg1' } }));
    assert.ok(r.referencedAssetIds.has('asset_bg1'));
  });

  test('theme color validation', () => {
    const r = validatePageContent(minimalPage({
      theme: { primaryColor: '#FF0000', textColor: 'bad' },
    }));
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(e => e.path.includes('theme.textColor')));
  });
});

// ── Block validation ─────────────────────────────────────────────────

describe('block validation', () => {
  test('text block passes', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 's1', blockType: 'section', children: [textBlock('t1')] }],
    }));
    assert.equal(r.valid, true);
  });

  test('heading block passes', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 's1', blockType: 'section', children: [headingBlock('h1')] }],
    }));
    assert.equal(r.valid, true);
  });

  test('block without id fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ blockType: 'text', content: 'x' }],
    }));
    assert.equal(r.valid, false);
  });

  test('duplicate block ids fail', () => {
    const r = validatePageContent(minimalPage({
      sections: [textBlock('dup'), textBlock('dup')],
    }));
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(e => e.message.includes('Duplicate')));
  });

  test('unknown block type fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'x1', blockType: 'carousel' }],
    }));
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(e => e.message.includes('Unknown block type')));
  });

  test('visible must be boolean', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 't1', blockType: 'text', content: 'x', visible: 'yes' }],
    }));
    assert.equal(r.valid, false);
  });

  test('sortOrder must be finite number', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 't1', blockType: 'text', content: 'x', sortOrder: Infinity }],
    }));
    assert.equal(r.valid, false);
  });
});

// ── Text/heading formatting ──────────────────────────────────────────

describe('text formatting validation', () => {
  test('approved font passes', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 't1', blockType: 'text', content: 'x', fontFamily: 'Arial' }],
    }));
    assert.equal(r.valid, true);
  });

  test('unapproved font fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 't1', blockType: 'text', content: 'x', fontFamily: 'Comic Sans' }],
    }));
    assert.equal(r.valid, false);
  });

  test('approved font size passes', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 't1', blockType: 'text', content: 'x', fontSize: 14 }],
    }));
    assert.equal(r.valid, true);
  });

  test('unapproved font size fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 't1', blockType: 'text', content: 'x', fontSize: 13 }],
    }));
    assert.equal(r.valid, false);
  });

  test('approved textAlign passes', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 't1', blockType: 'text', content: 'x', textAlign: 'center' }],
    }));
    assert.equal(r.valid, true);
  });

  test('unapproved textAlign fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 't1', blockType: 'text', content: 'x', textAlign: 'start' }],
    }));
    assert.equal(r.valid, false);
  });

  test('valid text color passes', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 't1', blockType: 'text', content: 'x', color: '#333333' }],
    }));
    assert.equal(r.valid, true);
  });
});

// ── Columns ──────────────────────────────────────────────────────────

describe('columns validation', () => {
  test('valid columns structure', () => {
    const r = validatePageContent(minimalPage({
      sections: [{
        id: 'cols1', blockType: 'columns',
        children: [
          { id: 'c1', blockType: 'column', widthPercent: 50, children: [textBlock('t1')] },
          { id: 'c2', blockType: 'column', widthPercent: 50, children: [textBlock('t2')] },
        ],
      }],
    }));
    assert.equal(r.valid, true);
  });

  test('columns without children fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'cols1', blockType: 'columns' }],
    }));
    assert.equal(r.valid, false);
  });

  test('columns children must be column type', () => {
    const r = validatePageContent(minimalPage({
      sections: [{
        id: 'cols1', blockType: 'columns',
        children: [textBlock('t1')],
      }],
    }));
    assert.equal(r.valid, false);
  });

  test('column widthPercent out of range fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{
        id: 'cols1', blockType: 'columns',
        children: [{ id: 'c1', blockType: 'column', widthPercent: 150 }],
      }],
    }));
    assert.equal(r.valid, false);
  });
});

// ── Overlay validation ───────────────────────────────────────────────

describe('overlay validation', () => {
  test('valid overlay passes', () => {
    const r = validatePageContent(minimalPage({
      overlays: [{
        id: 'ov1', blockType: 'overlay',
        x: 100, y: 200, width: 200, height: 100,
        children: [textBlock('t1')],
      }],
    }));
    assert.equal(r.valid, true);
  });

  test('overlay without coordinates fails', () => {
    const r = validatePageContent(minimalPage({
      overlays: [{ id: 'ov1', blockType: 'overlay', width: 100, height: 100 }],
    }));
    assert.equal(r.valid, false);
  });

  test('overlay exceeding A4 width fails', () => {
    const r = validatePageContent(minimalPage({
      overlays: [{
        id: 'ov1', blockType: 'overlay',
        x: 700, y: 0, width: 200, height: 100,
      }],
    }));
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(e => e.message.includes('width')));
  });

  test('overlay exceeding A4 height fails', () => {
    const r = validatePageContent(minimalPage({
      overlays: [{
        id: 'ov1', blockType: 'overlay',
        x: 0, y: 1100, width: 100, height: 100,
      }],
    }));
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(e => e.message.includes('height')));
  });

  test('overlay at exact edge passes', () => {
    const r = validatePageContent(minimalPage({
      overlays: [{
        id: 'ov1', blockType: 'overlay',
        x: A4_WIDTH - 100, y: A4_HEIGHT - 50, width: 100, height: 50,
      }],
    }));
    assert.equal(r.valid, true);
  });

  test('negative overlay position fails', () => {
    const r = validatePageContent(minimalPage({
      overlays: [{
        id: 'ov1', blockType: 'overlay',
        x: -10, y: 0, width: 100, height: 100,
      }],
    }));
    assert.equal(r.valid, false);
  });

  test('overlays must be overlay blockType', () => {
    const r = validatePageContent(minimalPage({
      overlays: [textBlock('t1')],
    }));
    assert.equal(r.valid, false);
  });
});

// ── Image validation ─────────────────────────────────────────────────

describe('image validation', () => {
  test('image with assetId passes', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'img1', blockType: 'image', assetId: 'asset_123' }],
    }));
    assert.equal(r.valid, true);
    assert.ok(r.referencedAssetIds.has('asset_123'));
  });

  test('image without assetId or src fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'img1', blockType: 'image' }],
    }));
    assert.equal(r.valid, false);
  });

  test('backgroundImage without assetId fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'bg1', blockType: 'backgroundImage' }],
    }));
    assert.equal(r.valid, false);
  });

  test('backgroundImage with valid fit passes', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'bg1', blockType: 'backgroundImage', assetId: 'a1', fit: 'cover' }],
    }));
    assert.equal(r.valid, true);
  });

  test('backgroundImage with invalid fit fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'bg1', blockType: 'backgroundImage', assetId: 'a1', fit: 'stretch' }],
    }));
    assert.equal(r.valid, false);
  });
});

// ── Dynamic field validation ─────────────────────────────────────────

describe('dynamicField validation', () => {
  test('valid dynamicField passes', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'df1', blockType: 'dynamicField', fieldId: 'customer.name' }],
    }));
    assert.equal(r.valid, true);
  });

  test('dynamicField without fieldId fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'df1', blockType: 'dynamicField' }],
    }));
    assert.equal(r.valid, false);
  });

  test('dynamicField with unknown fieldId fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'df1', blockType: 'dynamicField', fieldId: 'nonexistent.field' }],
    }));
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(e => e.message.includes('not in registry')));
  });

  test('dynamicField with invalid fieldId format fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'df1', blockType: 'dynamicField', fieldId: '<script>alert(1)</script>' }],
    }));
    assert.equal(r.valid, false);
  });

  test('dynamicField supports fallback modes', () => {
    for (const fallback of ['blocked', 'hide', 'fallbackText']) {
      const r = validatePageContent(minimalPage({
        sections: [{ id: `df-${fallback}`, blockType: 'dynamicField', fieldId: 'customer.name', fallback }],
      }));
      assert.equal(r.valid, true, `fallback=${fallback} should pass`);
    }
  });

  test('dynamicField with invalid fallback fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'df1', blockType: 'dynamicField', fieldId: 'customer.name', fallback: 'eval' }],
    }));
    assert.equal(r.valid, false);
  });
});

// ── QR validation ────────────────────────────────────────────────────

describe('QR validation', () => {
  test('valid QR passes', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'qr1', blockType: 'qr', dataFieldId: 'quotation.number', size: 100 }],
    }));
    assert.equal(r.valid, true);
  });

  test('QR with oversized dimension fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'qr1', blockType: 'qr', size: 500 }],
    }));
    assert.equal(r.valid, false);
  });

  test('QR with undersized dimension fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'qr1', blockType: 'qr', size: 10 }],
    }));
    assert.equal(r.valid, false);
  });
});

// ── Divider/Spacer validation ────────────────────────────────────────

describe('divider and spacer', () => {
  test('valid divider passes', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'd1', blockType: 'divider', thickness: 2, color: '#CCCCCC' }],
    }));
    assert.equal(r.valid, true);
  });

  test('divider thickness out of range fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'd1', blockType: 'divider', thickness: 25 }],
    }));
    assert.equal(r.valid, false);
  });

  test('valid spacer passes', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'sp1', blockType: 'spacer', height: 40 }],
    }));
    assert.equal(r.valid, true);
  });

  test('spacer height out of range fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'sp1', blockType: 'spacer', height: 300 }],
    }));
    assert.equal(r.valid, false);
  });
});

// ── Spacing validation ───────────────────────────────────────────────

describe('spacing validation', () => {
  test('valid padding passes', () => {
    const r = validatePageContent(minimalPage({
      sections: [{
        id: 's1', blockType: 'section',
        padding: { top: 10, right: 20, bottom: 10, left: 20 },
      }],
    }));
    assert.equal(r.valid, true);
  });

  test('excessive padding fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{
        id: 's1', blockType: 'section',
        padding: { top: 300 },
      }],
    }));
    assert.equal(r.valid, false);
  });

  test('negative padding fails', () => {
    const r = validatePageContent(minimalPage({
      sections: [{
        id: 's1', blockType: 'section',
        padding: { top: -5 },
      }],
    }));
    assert.equal(r.valid, false);
  });
});

// ── SECURITY: Dangerous content ──────────────────────────────────────

describe('SECURITY — dangerous content detection', () => {
  test('script tag detected', () => {
    assert.ok(containsDangerousContent('<script>alert(1)</script>'));
  });

  test('iframe detected', () => {
    assert.ok(containsDangerousContent('<iframe src="evil.com">'));
  });

  test('object tag detected', () => {
    assert.ok(containsDangerousContent('<object data="x">'));
  });

  test('embed tag detected', () => {
    assert.ok(containsDangerousContent('<embed src="x">'));
  });

  test('form tag detected', () => {
    assert.ok(containsDangerousContent('<form action="x">'));
  });

  test('event handler detected', () => {
    assert.ok(containsDangerousContent('onclick="alert(1)"'));
    assert.ok(containsDangerousContent('onload="evil()"'));
    assert.ok(containsDangerousContent('onerror ="evil()"'));
  });

  test('javascript: URL detected', () => {
    assert.ok(containsDangerousContent('javascript:alert(1)'));
  });

  test('vbscript: detected', () => {
    assert.ok(containsDangerousContent('vbscript:evil'));
  });

  test('data:text/html detected', () => {
    assert.ok(containsDangerousContent('data:text/html,<h1>evil</h1>'));
  });

  test('style tag detected', () => {
    assert.ok(containsDangerousContent('<style>body{display:none}</style>'));
  });

  test('CSS expression detected', () => {
    assert.ok(containsDangerousContent('expression(alert(1))'));
  });

  test('safe text not flagged', () => {
    assert.ok(!containsDangerousContent('Hello, this is a normal text'));
    assert.ok(!containsDangerousContent('Price: ₹3,25,000'));
    assert.ok(!containsDangerousContent('Go Solar with Flarize!'));
  });

  test('text block with script in content rejected', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 't1', blockType: 'text', content: '<script>evil()</script>' }],
    }));
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(e => e.message.includes('dangerous')));
  });

  test('image src with javascript: rejected', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'img1', blockType: 'image', src: 'javascript:alert(1)' }],
    }));
    assert.equal(r.valid, false);
  });

  test('QR staticValue with script rejected', () => {
    const r = validatePageContent(minimalPage({
      sections: [{ id: 'qr1', blockType: 'qr', staticValue: '<script>x</script>' }],
    }));
    assert.equal(r.valid, false);
  });
});

// ── quickSanityScan ──────────────────────────────────────────────────

describe('quickSanityScan', () => {
  test('clean content passes', () => {
    assert.ok(quickSanityScan(minimalPage()));
  });

  test('content with script fails', () => {
    assert.ok(!quickSanityScan({
      sections: [{ content: '<script>evil</script>' }],
    }));
  });
});

// ── No arbitrary HTML/CSS/JS block types ─────────────────────────────

describe('SECURITY — no arbitrary block types', () => {
  const FORBIDDEN_TYPES = ['html', 'css', 'javascript', 'script', 'iframe',
    'object', 'embed', 'form', 'rawHtml', 'codeBlock', 'customHtml'];

  for (const type of FORBIDDEN_TYPES) {
    test(`block type "${type}" rejected`, () => {
      const r = validatePageContent(minimalPage({
        sections: [{ id: `x-${type}`, blockType: type }],
      }));
      assert.equal(r.valid, false);
      assert.ok(r.errors.some(e => e.message.includes('Unknown block type')));
    });
  }
});

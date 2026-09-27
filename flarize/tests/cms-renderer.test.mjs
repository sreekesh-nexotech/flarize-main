/**
 * C11-I — CMS Generic Page Renderer tests.
 *
 * Verifies:
 * - renderCmsPage produces valid HTML for all 12 block types
 * - escapeHtml applied to all text content
 * - Unknown block types produce comments, not crashes
 * - CMS assets use /api/cms/assets/:assetId/file URLs
 * - No arbitrary HTML/JS passthrough
 * - No calculation logic
 * - Dynamic fields render resolved values
 * - A4 dimensions enforced
 * - Overlay positioning
 * - Visibility flag respected
 * - Sort order respected
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// The renderer lives in public/lib — load it as ESM from the project root
const DOC = await import('../public/lib/quotationDocument.js');
const { renderCmsPage, CMS_PAGE_STYLES, escapeHtml, formatMoney } = DOC;

// ── Empty / missing content ────────────────────────────────────────────

describe('renderCmsPage — empty/missing', () => {
  test('null content returns empty page', () => {
    const { html, styles } = renderCmsPage(null);
    assert.ok(html.includes('cms-page-empty'));
    assert.ok(styles.length > 0);
  });

  test('undefined content returns empty page', () => {
    const { html } = renderCmsPage(undefined);
    assert.ok(html.includes('cms-page-empty'));
  });

  test('empty object content returns page shell', () => {
    const { html } = renderCmsPage({});
    assert.ok(html.includes('cms-page'));
    assert.ok(html.includes('794'));
    assert.ok(html.includes('1123'));
  });
});

// ── A4 dimensions ──────────────────────────────────────────────────────

describe('renderCmsPage — A4 dimensions', () => {
  test('page container has correct A4 pixel dimensions', () => {
    const { html } = renderCmsPage({ sections: [] });
    assert.ok(html.includes('width:794px'));
    assert.ok(html.includes('height:1123px'));
  });
});

// ── Section block ──────────────────────────────────────────────────────

describe('renderCmsPage — section', () => {
  test('section renders with background color', () => {
    const content = {
      sections: [{
        blockType: 'section', id: 's1', sortOrder: 1,
        backgroundColor: '#ff0000',
        children: [],
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('cms-section'));
    assert.ok(html.includes('background-color:#ff0000'));
    assert.ok(html.includes('data-block-id="s1"'));
  });

  test('section renders with padding', () => {
    const content = {
      sections: [{
        blockType: 'section', id: 's2', sortOrder: 1,
        padding: { top: 10, left: 20 },
        children: [],
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('padding-top:10px'));
    assert.ok(html.includes('padding-left:20px'));
  });

  test('section renders children', () => {
    const content = {
      sections: [{
        blockType: 'section', id: 's3', sortOrder: 1,
        children: [
          { blockType: 'text', id: 't1', content: 'Hello World', sortOrder: 1 },
        ],
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('Hello World'));
    assert.ok(html.includes('cms-text'));
  });
});

// ── Columns block ──────────────────────────────────────────────────────

describe('renderCmsPage — columns', () => {
  test('columns renders with display:flex', () => {
    const content = {
      sections: [{
        blockType: 'columns', id: 'cols1', sortOrder: 1,
        children: [
          { blockType: 'column', id: 'col1', widthPercent: 50, children: [], sortOrder: 1 },
          { blockType: 'column', id: 'col2', widthPercent: 50, children: [], sortOrder: 2 },
        ],
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('cms-columns'));
    assert.ok(html.includes('display:flex'));
    assert.ok(html.includes('flex:0 0 50%'));
  });

  test('column without widthPercent uses flex:1', () => {
    const content = {
      sections: [{
        blockType: 'columns', id: 'cols2', sortOrder: 1,
        children: [
          { blockType: 'column', id: 'col3', children: [], sortOrder: 1 },
        ],
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('flex:1 1 0'));
  });
});

// ── Heading block ──────────────────────────────────────────────────────

describe('renderCmsPage — heading', () => {
  test('heading renders with correct level', () => {
    const content = {
      sections: [{
        blockType: 'heading', id: 'h1', sortOrder: 1,
        content: 'Title', level: 1,
        fontFamily: 'Arial', fontSize: 24, fontWeight: '700', color: '#000000',
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('<h1'));
    assert.ok(html.includes('</h1>'));
    assert.ok(html.includes('Title'));
    assert.ok(html.includes('font-family:Arial'));
    assert.ok(html.includes('font-size:24px'));
  });

  test('heading defaults to h2 for invalid level', () => {
    const content = {
      sections: [{
        blockType: 'heading', id: 'h2', sortOrder: 1,
        content: 'Subtitle', level: 5,
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('<h2'));
  });

  test('heading escapes HTML in content', () => {
    const content = {
      sections: [{
        blockType: 'heading', id: 'h3', sortOrder: 1,
        content: '<script>alert("xss")</script>',
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

// ── Text block ─────────────────────────────────────────────────────────

describe('renderCmsPage — text', () => {
  test('text renders with white-space:pre-wrap', () => {
    const content = {
      sections: [{
        blockType: 'text', id: 'txt1', sortOrder: 1,
        content: 'Line 1\nLine 2',
        textAlign: 'center',
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('white-space:pre-wrap'));
    assert.ok(html.includes('text-align:center'));
    assert.ok(html.includes('Line 1\nLine 2'));
  });

  test('text escapes dangerous content', () => {
    const content = {
      sections: [{
        blockType: 'text', id: 'txt2', sortOrder: 1,
        content: '<iframe src="evil.html">',
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(!html.includes('<iframe'));
    assert.ok(html.includes('&lt;iframe'));
  });
});

// ── Image block ────────────────────────────────────────────────────────

describe('renderCmsPage — image', () => {
  test('image with assetId uses CMS asset URL', () => {
    const content = {
      sections: [{
        blockType: 'image', id: 'img1', sortOrder: 1,
        assetId: 'asset_abc123',
        alt: 'Test image',
        width: 400,
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('/api/cms/assets/asset_abc123/file'));
    assert.ok(html.includes('alt="Test image"'));
    assert.ok(html.includes('width:400px'));
  });

  test('image with src uses src directly', () => {
    const content = {
      sections: [{
        blockType: 'image', id: 'img2', sortOrder: 1,
        src: 'assets/quotation/some-image.jpg',
        alt: 'Legacy',
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('src="assets/quotation/some-image.jpg"'));
  });

  test('image alt text is escaped', () => {
    const content = {
      sections: [{
        blockType: 'image', id: 'img3', sortOrder: 1,
        assetId: 'a1',
        alt: 'Image "with quotes" & <tags>',
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('&quot;with quotes&quot;'));
    assert.ok(html.includes('&amp;'));
  });
});

// ── Background image block ─────────────────────────────────────────────

describe('renderCmsPage — backgroundImage', () => {
  test('background image renders as absolute positioned div', () => {
    const content = {
      background: {
        blockType: 'backgroundImage', id: 'bg1',
        assetId: 'asset_bg1', fit: 'cover',
      },
      sections: [],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('/api/cms/assets/asset_bg1/file'));
    assert.ok(html.includes('position:absolute'));
    assert.ok(html.includes('background-size:cover'));
  });

  test('background image defaults to cover for unknown fit', () => {
    const content = {
      background: {
        blockType: 'backgroundImage', id: 'bg2',
        assetId: 'asset_bg2', fit: 'evil-value',
      },
      sections: [],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('background-size:cover'));
  });

  test('background fit=fill renders as 100% 100%', () => {
    const content = {
      background: {
        blockType: 'backgroundImage', id: 'bg3',
        assetId: 'asset_bg3', fit: 'fill',
      },
      sections: [],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('background-size:100% 100%'));
  });
});

// ── Divider block ──────────────────────────────────────────────────────

describe('renderCmsPage — divider', () => {
  test('divider renders with default style', () => {
    const content = {
      sections: [{
        blockType: 'divider', id: 'div1', sortOrder: 1,
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('cms-divider'));
    assert.ok(html.includes('border-top:1px solid'));
  });

  test('divider renders with custom thickness and color', () => {
    const content = {
      sections: [{
        blockType: 'divider', id: 'div2', sortOrder: 1,
        thickness: 3, color: '#ff0000',
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('border-top:3px solid #ff0000'));
  });
});

// ── Spacer block ───────────────────────────────────────────────────────

describe('renderCmsPage — spacer', () => {
  test('spacer renders with specified height', () => {
    const content = {
      sections: [{
        blockType: 'spacer', id: 'sp1', sortOrder: 1,
        height: 50,
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('height:50px'));
    assert.ok(html.includes('cms-spacer'));
  });

  test('spacer defaults to 10px height', () => {
    const content = {
      sections: [{
        blockType: 'spacer', id: 'sp2', sortOrder: 1,
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('height:10px'));
  });
});

// ── Dynamic field block ────────────────────────────────────────────────

describe('renderCmsPage — dynamicField', () => {
  test('resolved field shows value', () => {
    const content = {
      sections: [{
        blockType: 'dynamicField', id: 'df1', sortOrder: 1,
        fieldId: 'customer.name',
        resolvedValue: { value: 'John Doe', resolved: true, display: 'John Doe' },
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('John Doe'));
    assert.ok(html.includes('cms-field-resolved'));
    assert.ok(html.includes('data-field="customer.name"'));
  });

  test('unresolved field shows fallback', () => {
    const content = {
      sections: [{
        blockType: 'dynamicField', id: 'df2', sortOrder: 1,
        fieldId: 'customer.name',
        resolvedValue: { value: null, resolved: false, display: '[Data unavailable]' },
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('[Data unavailable]'));
    assert.ok(html.includes('cms-field-unresolved'));
  });

  test('currency field uses formatMoney', () => {
    const content = {
      sections: [{
        blockType: 'dynamicField', id: 'df3', sortOrder: 1,
        fieldId: 'pricing.customer.sellingPriceBeforeGST',
        format: 'currency',
        resolvedValue: { value: 500000, resolved: true, display: '500000' },
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('₹'));
    assert.ok(html.includes('5,00,000'));
  });

  test('field without resolvedValue shows blocked text', () => {
    const content = {
      sections: [{
        blockType: 'dynamicField', id: 'df4', sortOrder: 1,
        fieldId: 'customer.name',
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('[Data unavailable]'));
  });

  test('dynamic field escapes resolved value', () => {
    const content = {
      sections: [{
        blockType: 'dynamicField', id: 'df5', sortOrder: 1,
        fieldId: 'customer.name',
        resolvedValue: { value: '<script>xss</script>', resolved: true, display: '<script>xss</script>' },
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(!html.includes('<script>xss'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

// ── QR block ───────────────────────────────────────────────────────────

describe('renderCmsPage — qr', () => {
  test('QR renders with size and data', () => {
    const content = {
      sections: [{
        blockType: 'qr', id: 'qr1', sortOrder: 1,
        size: 150,
        staticValue: 'https://example.com',
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('cms-qr'));
    assert.ok(html.includes('width:150px'));
    assert.ok(html.includes('height:150px'));
    assert.ok(html.includes('data-qr-value="https://example.com"'));
  });

  test('QR uses resolvedValue if present', () => {
    const content = {
      sections: [{
        blockType: 'qr', id: 'qr2', sortOrder: 1,
        size: 100,
        resolvedValue: { display: 'https://resolved.com', resolved: true },
        staticValue: 'https://fallback.com',
      }],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('data-qr-value="https://resolved.com"'));
  });
});

// ── Overlay block ──────────────────────────────────────────────────────

describe('renderCmsPage — overlay', () => {
  test('overlay renders with absolute positioning', () => {
    const content = {
      overlays: [{
        blockType: 'overlay', id: 'ov1', sortOrder: 1,
        x: 100, y: 200, width: 300, height: 50,
        children: [
          { blockType: 'text', id: 'ovt1', content: 'Overlay Text', sortOrder: 1 },
        ],
      }],
      sections: [],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('position:absolute'));
    assert.ok(html.includes('left:100px'));
    assert.ok(html.includes('top:200px'));
    assert.ok(html.includes('width:300px'));
    assert.ok(html.includes('height:50px'));
    assert.ok(html.includes('Overlay Text'));
  });
});

// ── Visibility ─────────────────────────────────────────────────────────

describe('renderCmsPage — visibility', () => {
  test('hidden blocks are not rendered', () => {
    const content = {
      sections: [
        { blockType: 'text', id: 'vis1', content: 'Visible', sortOrder: 1, visible: true },
        { blockType: 'text', id: 'vis2', content: 'Hidden', sortOrder: 2, visible: false },
      ],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('Visible'));
    assert.ok(!html.includes('Hidden'));
  });
});

// ── Sort order ─────────────────────────────────────────────────────────

describe('renderCmsPage — sort order', () => {
  test('blocks render in sortOrder', () => {
    const content = {
      sections: [
        { blockType: 'text', id: 'so2', content: 'Second', sortOrder: 2 },
        { blockType: 'text', id: 'so1', content: 'First', sortOrder: 1 },
        { blockType: 'text', id: 'so3', content: 'Third', sortOrder: 3 },
      ],
    };
    const { html } = renderCmsPage(content);
    const firstIdx = html.indexOf('First');
    const secondIdx = html.indexOf('Second');
    const thirdIdx = html.indexOf('Third');
    assert.ok(firstIdx < secondIdx, 'First before Second');
    assert.ok(secondIdx < thirdIdx, 'Second before Third');
  });
});

// ── Unknown block types ────────────────────────────────────────────────

describe('renderCmsPage — unknown block types', () => {
  test('unknown block type produces comment, not crash', () => {
    const content = {
      sections: [
        { blockType: 'evil_block', id: 'ub1', sortOrder: 1, content: 'Should not render' },
        { blockType: 'text', id: 'ok1', content: 'Should render', sortOrder: 2 },
      ],
    };
    const { html } = renderCmsPage(content);
    assert.ok(html.includes('<!-- CMS: unknown block type'));
    assert.ok(html.includes('evil_block'));
    assert.ok(html.includes('Should render'));
    assert.ok(!html.includes('Should not render'));
  });
});

// ── SECURITY ───────────────────────────────────────────────────────────

describe('SECURITY — CMS renderer', () => {
  test('quotationDocument.js has zero imports (purity check)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('public/lib/quotationDocument.js', 'utf-8');
    const imports = src.match(/^import\s+/gm);
    assert.equal(imports, null, 'renderer must have zero imports');
  });

  test('renderer contains no calculation functions', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('public/lib/quotationDocument.js', 'utf-8');
    const forbidden = [
      /calculatePrice/i,
      /calculateCost/i,
      /calculateGst/i,
      /calculateMargin/i,
      /sumExact/i,
      /roundMoney/i,
    ];
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(src), `renderer must not contain ${pattern}`);
    }
  });

  test('no eval or Function constructor in renderer', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('public/lib/quotationDocument.js', 'utf-8');
    // Must not have eval() or new Function()
    assert.ok(!/\beval\s*\(/.test(src), 'no eval');
    assert.ok(!/new\s+Function\s*\(/.test(src), 'no new Function');
  });

  test('CMS renderer escapes all block types with dangerous content', () => {
    const xss = '<img src=x onerror=alert(1)>';
    const content = {
      sections: [
        { blockType: 'heading', id: 'xh1', content: xss, sortOrder: 1 },
        { blockType: 'text', id: 'xt1', content: xss, sortOrder: 2 },
        {
          blockType: 'dynamicField', id: 'xd1', sortOrder: 3,
          fieldId: 'customer.name',
          resolvedValue: { value: xss, resolved: true, display: xss },
        },
      ],
    };
    const { html } = renderCmsPage(content);
    // The raw XSS must never appear
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
    // Escaped version must appear
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  test('renderCmsPage exists as an export', () => {
    assert.equal(typeof renderCmsPage, 'function');
  });

  test('CMS_PAGE_STYLES exists as an export', () => {
    assert.equal(typeof CMS_PAGE_STYLES, 'string');
    assert.ok(CMS_PAGE_STYLES.includes('.cms-page'));
  });
});

// ── Complex page ───────────────────────────────────────────────────────

describe('renderCmsPage — complex page', () => {
  test('full page with background, sections, overlays renders correctly', () => {
    const content = {
      background: {
        blockType: 'backgroundImage', id: 'bg1',
        assetId: 'asset_campaign_bg',
        fit: 'cover',
      },
      sections: [{
        blockType: 'section', id: 'main', sortOrder: 1,
        padding: { top: 20, left: 15, right: 15 },
        children: [
          { blockType: 'heading', id: 'title', content: 'Summer Sale!', level: 1, fontSize: 36, sortOrder: 1 },
          { blockType: 'spacer', id: 'sp1', height: 10, sortOrder: 2 },
          {
            blockType: 'columns', id: 'cols', sortOrder: 3,
            children: [
              {
                blockType: 'column', id: 'left', widthPercent: 60, sortOrder: 1,
                children: [
                  { blockType: 'text', id: 'desc', content: 'Best solar deal this season', sortOrder: 1 },
                  {
                    blockType: 'dynamicField', id: 'price', sortOrder: 2,
                    fieldId: 'pricing.customer.sellingPriceBeforeGST',
                    format: 'currency',
                    resolvedValue: { value: 350000, resolved: true, display: '350000' },
                  },
                ],
              },
              {
                blockType: 'column', id: 'right', widthPercent: 40, sortOrder: 2,
                children: [
                  { blockType: 'image', id: 'panel', assetId: 'asset_panel_img', alt: 'Solar Panel', sortOrder: 1 },
                ],
              },
            ],
          },
          { blockType: 'divider', id: 'd1', thickness: 2, color: '#e0e0e0', sortOrder: 4 },
          { blockType: 'qr', id: 'qr1', size: 80, staticValue: 'https://flarize.com', sortOrder: 5 },
        ],
      }],
      overlays: [{
        blockType: 'overlay', id: 'badge', x: 600, y: 50, width: 150, height: 40, sortOrder: 1,
        children: [
          {
            blockType: 'dynamicField', id: 'cname', sortOrder: 1,
            fieldId: 'customer.name',
            resolvedValue: { value: 'Test Customer', resolved: true, display: 'Test Customer' },
          },
        ],
      }],
    };

    const { html, styles } = renderCmsPage(content);

    // Background
    assert.ok(html.includes('/api/cms/assets/asset_campaign_bg/file'));
    // Heading
    assert.ok(html.includes('Summer Sale!'));
    // Text
    assert.ok(html.includes('Best solar deal this season'));
    // Currency
    assert.ok(html.includes('₹'));
    // Image
    assert.ok(html.includes('/api/cms/assets/asset_panel_img/file'));
    // Divider
    assert.ok(html.includes('border-top:2px solid #e0e0e0'));
    // QR
    assert.ok(html.includes('data-qr-value="https://flarize.com"'));
    // Overlay
    assert.ok(html.includes('left:600px'));
    assert.ok(html.includes('top:50px'));
    assert.ok(html.includes('Test Customer'));
    // Styles present
    assert.ok(styles.includes('.cms-page'));
  });
});

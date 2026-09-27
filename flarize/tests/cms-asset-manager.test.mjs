/**
 * C11-E — Asset Manager tests.
 * Base64 JSON upload, magic byte validation, 5MB limit, path traversal.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  MAX_FILE_SIZE, ALLOWED_MIME_TYPES,
  detectMimeFromBytes, uploadAsset, sanitizeFilename,
  readAssetFile, isPathTraversal,
} from '../src/lib/cmsAssetManager.js';
import { createCmsStore, CMS_ERROR } from '../src/lib/cmsStore.js';

const TEST_ASSETS_DIR = join(process.cwd(), 'tests', '_test-cms-assets');

// Set up and tear down test assets dir
function setup() {
  if (!existsSync(TEST_ASSETS_DIR)) mkdirSync(TEST_ASSETS_DIR, { recursive: true });
  return createCmsStore();
}

function cleanup() {
  if (existsSync(TEST_ASSETS_DIR)) rmSync(TEST_ASSETS_DIR, { recursive: true, force: true });
}

// Create a minimal valid PNG (1x1 pixel)
function minimalPng() {
  // Valid 1x1 white PNG
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );
}

// Create a minimal valid JPEG
function minimalJpeg() {
  // Valid tiny JPEG — FF D8 FF header + minimal data
  const buf = Buffer.alloc(20);
  buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF; buf[3] = 0xE0;
  return buf;
}

// ── Constants ────────────────────────────────────────────────────────

describe('asset constants', () => {
  test('MAX_FILE_SIZE is 5MB', () => {
    assert.equal(MAX_FILE_SIZE, 5 * 1024 * 1024);
  });

  test('only PNG and JPEG allowed', () => {
    const types = Object.keys(ALLOWED_MIME_TYPES);
    assert.equal(types.length, 2);
    assert.ok(types.includes('image/png'));
    assert.ok(types.includes('image/jpeg'));
  });
});

// ── Magic byte detection ─────────────────────────────────────────────

describe('detectMimeFromBytes', () => {
  test('detects PNG', () => {
    assert.equal(detectMimeFromBytes(minimalPng()), 'image/png');
  });

  test('detects JPEG', () => {
    assert.equal(detectMimeFromBytes(minimalJpeg()), 'image/jpeg');
  });

  test('returns null for GIF', () => {
    const gif = Buffer.from('GIF89a', 'ascii');
    assert.equal(detectMimeFromBytes(gif), null);
  });

  test('returns null for empty buffer', () => {
    assert.equal(detectMimeFromBytes(Buffer.alloc(0)), null);
  });

  test('returns null for non-buffer', () => {
    assert.equal(detectMimeFromBytes('not a buffer'), null);
  });

  test('returns null for too-small buffer', () => {
    assert.equal(detectMimeFromBytes(Buffer.alloc(2)), null);
  });

  test('returns null for random bytes', () => {
    const random = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    assert.equal(detectMimeFromBytes(random), null);
  });
});

// ── Upload ───────────────────────────────────────────────────────────

describe('uploadAsset', () => {
  test('valid PNG upload succeeds', () => {
    const store = setup();
    try {
      const png = minimalPng();
      const meta = uploadAsset(store, {
        filename: 'logo.png',
        mimeType: 'image/png',
        data: png.toString('base64'),
      }, 'admin', TEST_ASSETS_DIR);

      assert.ok(meta.assetId.startsWith('asset_'));
      assert.equal(meta.filename, 'logo.png');
      assert.equal(meta.mimeType, 'image/png');
      assert.equal(meta.fileSizeBytes, png.length);
      assert.ok(meta.checksum);
      assert.equal(meta.uploadedBy, 'admin');
      assert.equal(meta.status, 'ACTIVE');

      // File exists on disk
      assert.ok(existsSync(join(TEST_ASSETS_DIR, meta.storagePath)));
    } finally { cleanup(); }
  });

  test('valid JPEG upload succeeds', () => {
    const store = setup();
    try {
      const jpeg = minimalJpeg();
      const meta = uploadAsset(store, {
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        data: jpeg.toString('base64'),
      }, 'admin', TEST_ASSETS_DIR);

      assert.equal(meta.mimeType, 'image/jpeg');
      assert.ok(meta.storagePath.endsWith('.jpg'));
    } finally { cleanup(); }
  });

  test('rejects missing data', () => {
    const store = setup();
    try {
      assert.throws(() => uploadAsset(store, { filename: 'x.png' }, 'a', TEST_ASSETS_DIR),
        e => e.code === CMS_ERROR.INVALID_INPUT);
    } finally { cleanup(); }
  });

  test('rejects missing filename', () => {
    const store = setup();
    try {
      assert.throws(() => uploadAsset(store, { data: 'abc' }, 'a', TEST_ASSETS_DIR),
        e => e.code === CMS_ERROR.INVALID_INPUT);
    } finally { cleanup(); }
  });

  test('rejects null input', () => {
    const store = setup();
    try {
      assert.throws(() => uploadAsset(store, null, 'a', TEST_ASSETS_DIR),
        e => e.code === CMS_ERROR.INVALID_INPUT);
    } finally { cleanup(); }
  });

  test('rejects empty file', () => {
    const store = setup();
    try {
      assert.throws(() => uploadAsset(store, {
        filename: 'empty.png',
        data: '',
      }, 'a', TEST_ASSETS_DIR), e => e.code === CMS_ERROR.INVALID_INPUT);
    } finally { cleanup(); }
  });

  test('rejects non-image file (text disguised as PNG)', () => {
    const store = setup();
    try {
      const textFile = Buffer.from('Hello, this is a text file');
      assert.throws(() => uploadAsset(store, {
        filename: 'evil.png',
        mimeType: 'image/png',
        data: textFile.toString('base64'),
      }, 'a', TEST_ASSETS_DIR), e => e.code === CMS_ERROR.VALIDATION_FAILED);
    } finally { cleanup(); }
  });

  test('rejects GIF file', () => {
    const store = setup();
    try {
      const gif = Buffer.from('GIF89a' + 'x'.repeat(100), 'ascii');
      assert.throws(() => uploadAsset(store, {
        filename: 'anim.gif',
        mimeType: 'image/gif',
        data: gif.toString('base64'),
      }, 'a', TEST_ASSETS_DIR), e => e.code === CMS_ERROR.VALIDATION_FAILED);
    } finally { cleanup(); }
  });

  test('rejects MIME mismatch (claims PNG, actually JPEG)', () => {
    const store = setup();
    try {
      const jpeg = minimalJpeg();
      assert.throws(() => uploadAsset(store, {
        filename: 'photo.jpg',
        mimeType: 'image/png', // lie
        data: jpeg.toString('base64'),
      }, 'a', TEST_ASSETS_DIR), e => e.code === CMS_ERROR.VALIDATION_FAILED && e.message.includes('does not match'));
    } finally { cleanup(); }
  });

  test('rejects oversized file', () => {
    const store = setup();
    try {
      // Create PNG header + large padding
      const bigBuffer = Buffer.alloc(MAX_FILE_SIZE + 1);
      minimalPng().copy(bigBuffer);
      assert.throws(() => uploadAsset(store, {
        filename: 'big.png',
        mimeType: 'image/png',
        data: bigBuffer.toString('base64'),
      }, 'a', TEST_ASSETS_DIR), e => e.code === CMS_ERROR.VALIDATION_FAILED && e.message.includes('5MB'));
    } finally { cleanup(); }
  });

  test('metadata stored in store.assets', () => {
    const store = setup();
    try {
      const meta = uploadAsset(store, {
        filename: 'test.png',
        mimeType: 'image/png',
        data: minimalPng().toString('base64'),
      }, 'admin', TEST_ASSETS_DIR);
      assert.ok(store.assets[meta.assetId]);
      assert.equal(store.assets[meta.assetId].filename, 'test.png');
    } finally { cleanup(); }
  });

  test('MIME auto-detected when not declared', () => {
    const store = setup();
    try {
      const meta = uploadAsset(store, {
        filename: 'auto.png',
        data: minimalPng().toString('base64'),
        // no mimeType
      }, 'admin', TEST_ASSETS_DIR);
      assert.equal(meta.mimeType, 'image/png');
    } finally { cleanup(); }
  });
});

// ── Read asset ───────────────────────────────────────────────────────

describe('readAssetFile', () => {
  test('reads uploaded asset back', () => {
    const store = setup();
    try {
      const png = minimalPng();
      const meta = uploadAsset(store, {
        filename: 'readable.png',
        mimeType: 'image/png',
        data: png.toString('base64'),
      }, 'admin', TEST_ASSETS_DIR);

      const file = readAssetFile(store, meta.assetId, TEST_ASSETS_DIR);
      assert.ok(Buffer.isBuffer(file.buffer));
      assert.equal(file.mimeType, 'image/png');
      assert.equal(file.filename, 'readable.png');
      assert.ok(file.buffer.equals(png));
    } finally { cleanup(); }
  });

  test('throws NOT_FOUND for unknown asset', () => {
    const store = setup();
    try {
      assert.throws(() => readAssetFile(store, 'bogus', TEST_ASSETS_DIR),
        e => e.code === CMS_ERROR.NOT_FOUND);
    } finally { cleanup(); }
  });
});

// ── Filename sanitization ────────────────────────────────────────────

describe('sanitizeFilename', () => {
  test('normal filename unchanged', () => {
    assert.equal(sanitizeFilename('logo.png'), 'logo.png');
  });

  test('strips directory separators', () => {
    const result = sanitizeFilename('../../../etc/passwd');
    assert.ok(!result.includes('/'));
    assert.ok(!result.includes('..'));
  });

  test('strips backslash separators', () => {
    const result = sanitizeFilename('..\\..\\system32\\evil');
    assert.ok(!result.includes('\\'));
    assert.ok(!result.includes('..'));
  });

  test('strips leading dots', () => {
    assert.equal(sanitizeFilename('.hidden'), 'hidden');
    const result = sanitizeFilename('...dotdotdot');
    assert.ok(!result.includes('..'), 'no consecutive dots');
    assert.ok(!result.startsWith('.'), 'no leading dot');
  });

  test('strips dangerous chars', () => {
    assert.equal(sanitizeFilename('file<script>.png'), 'file_script_.png');
  });

  test('truncates long names', () => {
    const long = 'a'.repeat(200) + '.png';
    assert.ok(sanitizeFilename(long).length <= 100);
  });

  test('null/empty → untitled', () => {
    assert.equal(sanitizeFilename(null), 'untitled');
    assert.equal(sanitizeFilename(''), 'untitled');
  });
});

// ── Path traversal detection ─────────────────────────────────────────

describe('isPathTraversal', () => {
  test('normal filename safe', () => {
    assert.equal(isPathTraversal('logo.png'), false);
  });

  test('double dot detected', () => {
    assert.equal(isPathTraversal('../etc/passwd'), true);
    assert.equal(isPathTraversal('foo/../../bar'), true);
  });

  test('forward slash detected', () => {
    assert.equal(isPathTraversal('path/to/file'), true);
  });

  test('backslash detected', () => {
    assert.equal(isPathTraversal('path\\to\\file'), true);
  });

  test('leading dot detected', () => {
    assert.equal(isPathTraversal('.hidden'), true);
  });

  test('null/empty detected', () => {
    assert.equal(isPathTraversal(null), true);
    assert.equal(isPathTraversal(''), true);
  });
});

// ── SECURITY: Negative tests ─────────────────────────────────────────

describe('SECURITY — asset upload', () => {
  test('SVG file rejected (not in allowed types)', () => {
    const store = setup();
    try {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="50"/></svg>');
      assert.throws(() => uploadAsset(store, {
        filename: 'icon.svg',
        mimeType: 'image/svg+xml',
        data: svg.toString('base64'),
      }, 'a', TEST_ASSETS_DIR), e => e.code === CMS_ERROR.VALIDATION_FAILED);
    } finally { cleanup(); }
  });

  test('HTML file rejected', () => {
    const store = setup();
    try {
      const html = Buffer.from('<html><body><script>evil()</script></body></html>');
      assert.throws(() => uploadAsset(store, {
        filename: 'page.html',
        data: html.toString('base64'),
      }, 'a', TEST_ASSETS_DIR), e => e.code === CMS_ERROR.VALIDATION_FAILED);
    } finally { cleanup(); }
  });

  test('path traversal in filename sanitized', () => {
    const store = setup();
    try {
      const meta = uploadAsset(store, {
        filename: '../../../etc/passwd.png',
        data: minimalPng().toString('base64'),
      }, 'admin', TEST_ASSETS_DIR);
      // Filename is sanitized, not the raw traversal
      assert.ok(!meta.filename.includes('..'));
      assert.ok(!meta.storagePath.includes('..'));
    } finally { cleanup(); }
  });

  test('asset stored with generated ID, not user filename', () => {
    const store = setup();
    try {
      const meta = uploadAsset(store, {
        filename: 'evil_name.png',
        data: minimalPng().toString('base64'),
      }, 'admin', TEST_ASSETS_DIR);
      // Storage path uses generated assetId, not user filename
      assert.ok(meta.storagePath.startsWith('asset_'));
      assert.ok(!meta.storagePath.includes('evil_name'));
    } finally { cleanup(); }
  });
});

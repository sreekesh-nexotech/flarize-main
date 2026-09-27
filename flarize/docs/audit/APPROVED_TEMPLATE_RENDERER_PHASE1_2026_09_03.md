# Approved-Template Renderer — Phase 1 Deliverable

**Date:** 2026-09-03
**Architecture:** locked per user directive 2026-09-03 (READ-ONLY architecture report accepted; direct-print PoC accepted; the approved bundle is the ONLY visual source of truth).
**Scope:** Phase 1 — build the new renderer BESIDE the existing `public/lib/quotationDocument.js`. Do not modify the old renderer. Do not change the production quotation route. Do not start Page 4.
**Status:** ✅ TECHNICALLY READY · ⚠️ PRODUCTION BLOCKED (2 named blockers, §13/§14).

---

## 1. Files created

| Path | Bytes | Purpose |
|---|--:|---|
| `assets/approved-template/Flarize_Solar_Quotation.v1.html` | 3,860,840 | Versioned copy of the authoritative approved Claude Design bundle |
| `assets/approved-template/Flarize_Solar_Quotation.v1.meta.json` | 581 | Pinned hashes + version + asset count; loaded on every render for integrity check |
| `src/lib/approvedTemplate.loader.js` | ~180 lines | Loader: decode + verify + cache. Named `LOADER_ERROR` codes; fail-loud on any drift |
| `src/lib/approvedTemplate.js` | ~530 lines | Renderer: 6 public functions + TOKEN_REGISTRY + IMAGE_SLOT_REGISTRY + PREVIEW_SHELL_TAGS + A4_PRINT_CSS + PAGE_3_STATUS + PRODUCTION_BLOCKER codes |
| `tests/approved-template/approved-template.contract.test.mjs` | ~490 lines | 24 tests covering the 18-check contract + 6 extra regressions |
| `tests/approved-template/_out/approved-template-print.html` | ~4.1 MB | Intermediate print HTML (post-strip + expand + substitute) |
| `tests/approved-template/_out/approved-template-poc.pdf` | 3,601,527 | 12-page A4 PDF produced by the new renderer + Playwright |
| `_arch_trace/approved-template-poc.pdf` | 3,601,527 | Delivery copy of the above |
| `_arch_trace/approved_template_golden_comparison.png` | 2,582,367 | 6-page side-by-side raster (Pages 1/2/3/5/7/12): approved bundle vs new renderer |

## 2. Files modified

**None.** Zero production files changed.

## 3. Files intentionally untouched

Verified verbatim (sha256):

| Path | sha256 (unchanged) |
|---|---|
| `public/lib/quotationDocument.js` | `fb3a223ec2e25e1b6279ce797ab5ce33313933d46e599dbef18e04dd29d9d369` |
| `src/lib/quotationPayload.js`     | `1263eb6051cf3bd11ad8680df591207bf21c459b03893e538d21fe4ed0d30c5e` |
| `src/lib/quotationWorkspace.js`   | `0b72297fc05af77868daf75492feb5bf6108db780c21f3e287baf5f3f6ff342f` |

Also untouched: server routes, engineeringChecker, costEngine, pricingEngine, engineering commercialSnapshot, bomSnapshot, bomLock, projectBom, offerLifecycle, upgradeAssessment, batteryCompatibility, all approved artwork, `assets/quotation/*` on-disk fonts and JPEGs, and every legacy test suite. Old renderer's tests are NOT rewritten to pretend the new renderer is production-ready.

## 4. Template hash / version

Pinned in `assets/approved-template/Flarize_Solar_Quotation.v1.meta.json`:

```json
{
  "name": "Flarize Solar Quotation",
  "version": "v1",
  "source": "Claude Design self-extracting bundle",
  "bundleSha256":   "fbb4e5e206b867b0391c6c0f696bf040c68abb7678cb626a317ad2923582d1d1",
  "bundleBytes":    3860840,
  "manifestSha256": "799e4b10ce2e53783269ffa29b9a6de2af63bac0c8731a27f31bb21daf2e35ce",
  "manifestBytes":  3745728,
  "templateSha256": "f632f67e733237e1f1e1037fb9656e3508ebae0389e0ac3df97a603852e8b2be",
  "templateBytes":  95538,
  "assetsInManifest": 48,
  "checkedInAt":    "2026-09-03T21:00:00.673089Z"
}
```

Every load asserts:
- Bundle bytes hash to `bundleSha256` (else `BUNDLE_HASH_MISMATCH`).
- Manifest block hashes to `manifestSha256` (else `MANIFEST_HASH_MISMATCH`).
- Template block hashes to `templateSha256` (else `TEMPLATE_HASH_MISMATCH`).
- Manifest is a non-null object with `assetsInManifest` entries (else `MANIFEST_MALFORMED`).
- Template decodes to a non-empty string with exactly 12 `<section class="page">` occurrences (else `TEMPLATE_MALFORMED` / `SECTION_COUNT_UNEXPECTED`).

**Silent replacement is impossible** — the bundle byte hash is checked against the pinned value before any downstream work runs.

## 5. Token registry

23 mustaches, each declaring `source` + `resolve(payload)` + `format`. Full registry in `src/lib/approvedTemplate.js` under `TOKEN_REGISTRY`:

| # | Token | Snapshot source | Formatter | Pages | Status |
|--:|---|---|---|---|---|
|  1 | `eliteCost`         | `payload.pricing.value.tiers.elite.customerTotalIncludingGST` | inrRupees | 5, 7, 12 | ⚠️ TIER_PRICING blocker |
|  2 | `smartCost`         | `payload.pricing.value.tiers.smart.customerTotalIncludingGST` | inrRupees | 5, 7, 12 | ⚠️ TIER_PRICING blocker |
|  3 | `essentialCost`     | `payload.pricing.value.tiers.essential.customerTotalIncludingGST` | inrRupees | 5, 7 | ⚠️ TIER_PRICING blocker |
|  4 | `downLabel`         | `payload.financing.value.downPaymentPercentage` | `Down Payment (N%)` | 5, 7 | ✅ resolves |
|  5 | `eliteDown`         | `payload.financing.value.tiers.elite.downPaymentAmount` | inrMinus | 5, 7 | ⚠️ TIER_PRICING blocker |
|  6 | `smartDown`         | `payload.financing.value.tiers.smart.downPaymentAmount` | inrMinus | 5, 7 | ⚠️ TIER_PRICING blocker |
|  7 | `essentialDown`     | `payload.financing.value.tiers.essential.downPaymentAmount` | inrMinus | 5, 7 | ⚠️ TIER_PRICING blocker |
|  8 | `subsidyAmt`        | `payload.subsidy.value.subsidyAmount` | inrRupees | 5, 7 | ✅ resolves |
|  9 | `smartSubsidyMinus` | `payload.subsidy.value.subsidyAmount` | inrMinus | 5, 12 | ✅ resolves |
| 10 | `eliteFin`          | `payload.financing.value.tiers.elite.postSubsidyInvestment` | inrRupees | 5, 7 | ⚠️ TIER_PRICING blocker |
| 11 | `smartFin`          | `payload.financing.value.tiers.smart.postSubsidyInvestment` | inrRupees | 5, 7, 12 | ⚠️ TIER_PRICING blocker |
| 12 | `essentialFin`      | `payload.financing.value.tiers.essential.postSubsidyInvestment` | inrRupees | 5, 7 | ⚠️ TIER_PRICING blocker |
| 13 | `emiLabel`          | `payload.financing.value.{tenureYears, interestRatePct}` | `EMI (N yrs @ M%)` | 5, 7 | ✅ resolves |
| 14 | `emiOn`             | `payload.financing.value.postSubsidyInvestment` | `on ₹N` | 5, 7 | ✅ resolves |
| 15 | `emiValue`          | `payload.financing.value.monthlyEMI` | `₹N/mo` | 5, 7 | ✅ resolves |
| 16 | `eliteEmiValue`     | `payload.financing.value.tiers.elite.monthlyEMI` | `₹N/mo` | 5, 7 | ⚠️ TIER_PRICING blocker |
| 17 | `smartEmiValue`     | `payload.financing.value.tiers.smart.monthlyEMI` | `₹N/mo` | 5, 7 | ⚠️ TIER_PRICING blocker |
| 18 | `essentialEmiValue` | `payload.financing.value.tiers.essential.monthlyEMI` | `₹N/mo` | 5, 7 | ⚠️ TIER_PRICING blocker |
| 19 | `dailyValue`        | `payload.savings.value.monthlySavings ÷ 30` | `₹N/day` | 5 | ✅ resolves |
| 20 | `eliteDaily`        | `payload.savings.value.tiers.elite.dailySavings` | `₹N/day` | 5 | ⚠️ TIER_PRICING blocker |
| 21 | `smartDaily`        | `payload.savings.value.tiers.smart.dailySavings` | `₹N/day` | 5 | ⚠️ TIER_PRICING blocker |
| 22 | `essentialDaily`    | `payload.savings.value.tiers.essential.dailySavings` | `₹N/day` | 5 | ⚠️ TIER_PRICING blocker |
| 23 | `savingsRange`      | `payload.savings.value.{monthlySavingsLow, monthlySavingsHigh}` | `₹low–high` | 12 | ✅ resolves |

**8 tokens resolve** with the current snapshot shape. **15 tokens block** on the tier-pricing gap (see §14).

`AUTHORITATIVE_SOURCES` is an explicit allow-list; any token whose `source` is outside the list throws `MUSTACHE_MAPPED_TO_NON_AUTHORITATIVE`. Guard against future drift into invented data paths.

## 6. Image-slot registry

4 slots, all on Page 2. Full registry in `IMAGE_SLOT_REGISTRY`:

| id | Page | Default UUID | Override path |
|---|--:|---|---|
| `ofr-scooter` | 2 | `16d6bc21-5e80-44e6-9dcd-7c72290520e9` | `payload.campaign.value.artwork.scooterImageUri` |
| `ben-ac1`     | 2 | `563c0494-548a-427f-9c14-569955a50b78` | `payload.campaign.value.artwork.acVoucherImageUri` |
| `ben-ac2`     | 2 | `0cf315e2-73de-44f8-854c-52cc65886d9e` | `payload.campaign.value.artwork.hybridInverterImageUri` |
| `ben-ac3`     | 2 | `d2af45dc-83cf-4b46-b2f2-9036994aaddb` | `payload.campaign.value.artwork.festiveGiftImageUri` |

Rules:
- Unregistered `<image-slot id="…">` → `IMAGE_SLOT_UNAUTHORIZED`.
- Registered slot whose default UUID drifted from the template → `IMAGE_SLOT_UNAUTHORIZED`.
- Registered slot whose default UUID is missing from the manifest → `IMAGE_SLOT_UNRESOLVED`.
- No override → use default from manifest.
- With override present (non-empty string) → use override; report `overridden: true`.

## 7. Preview wrappers removed

8 confirmed Claude Design runtime tags, declared in `PREVIEW_SHELL_TAGS`:

| name | Removed | Notes |
|---|---|---|
| `runtime-script`     | `<script src="0abc8473-…">` | Claude Design runtime chunk (mustache/image-slot interpreter) |
| `ext-runtime-script` | `<script src="data:text/javascript;base64,…">` × 2 | React + ReactDOM UMD chunks pulled by ext_resources |
| `bundler-scripts`    | `<script type="__bundler/{manifest,template,page_order,ext_resources}">` × 4 | Already unpacked, no longer needed |
| `x-dc`               | `<x-dc>` / `</x-dc>` | Host element; children preserved |
| `helmet`             | `<helmet>` / `</helmet>` | Children hoisted into `<head>` |
| `doc-page`           | `<doc-page size="a4" margin="0" style="…">` / `</doc-page>` | Preview viewport; children preserved |
| `bundler-loading`    | `<div id="__bundler_loading">` / `<div id="__bundler_thumbnail">` / `<div id="__bundler_placeholder">` | Preview UI |
| `bundler-error-sink` | `<div id="__bundler_err">` | Runtime error banner |

Section contents inside `<section class="page">…</section>` are never touched. After stripping, `stripPreviewShell` re-scans for artifacts and throws `PREVIEW_SHELL_ARTIFACT_LEFTOVER` if any remain.

## 8. Tests

18 required checks + 6 regressions = **24 tests** in `tests/approved-template/approved-template.contract.test.mjs`:

```
 1. approved template loads with exactly 12 sections
 2. rendered PDF has exactly 12 pages
 3. every PDF page is A4 portrait (595.28 × 841.89 pt ±1.5)
 4. preview scaffolding removed from print HTML
 4b. preview-shell registry names 8 removed tags
 5. section DOM preserved verbatim (12 sections, opening + closing tags intact)
 6. approved asset UUIDs all resolve to data: URIs in manifest
 7. unresolved mustaches produce named blockers (no silent substitution)
 7b. strict mode throws on unresolved
 8. all 4 approved <image-slot> tags expand to <img> with data URIs
 8b. customer override wins over manifest default when present
 9. unknown {{mustache}} in template fails loudly
10. missing required snapshot values surface as unresolved (not silently defaulted)
11. Page 1 = one <img class="pg" src="data:image/jpeg…">, nothing else
12. Page 2 keeps approved live DOM (>6 <img>, gradient background, Onam hero)
13. Page 3 = single approved image (no masks, no overlays, no mustaches)
13b. Page 3 architectural blocker is emitted
14. Pages 4-12 preserve their approved section bodies
15,16,17. renderer imports contain no engines / no arithmetic on payload / no coordinates
15b. AUTHORITATIVE_SOURCES allow-list is enforced for every token
15c. rendered HTML does NOT contain internal engine / dependency names
18. PDF exists and is a valid, non-trivial A4 document
    (also) registry census: 23 tokens, 4 image-slots, A4_PRINT_CSS forbids zoom/transform
    (also) DOM measurement: all 12 sections uniform A4 in-viewport
```

## 9. Test results

```
# tests 24
# pass  24
# fail  0
# duration_ms  2378
```

All 18 required contract checks pass. All 6 regressions pass. Zero failures.

## 10. 12-page PDF dimensions

`approved-template-poc.pdf`, 3,601,527 bytes, 12 pages, every page **594.96 × 841.92 pt** (portrait). Within 0.32 pt of the ±1.5 tolerance around exact A4 (595.28 × 841.89 pt).

In-DOM measurement (viewport = 794 × 1123 px = 210 × 297 mm @ 96 dpi):
```
Page  1  x=0  y=0      w=794  h=1123
Page  2  x=0  y=1123   w=794  h=1123
Page  3  x=0  y=2246   w=794  h=1123
Page  4  x=0  y=3369   w=794  h=1123
Page  5  x=0  y=4492   w=794  h=1123
Page  6  x=0  y=5615   w=794  h=1123
Page  7  x=0  y=6738   w=794  h=1123
Page  8  x=0  y=7861   w=794  h=1123
Page  9  x=0  y=8984   w=794  h=1123
Page 10  x=0  y=10107  w=794  h=1123
Page 11  x=0  y=11230  w=794  h=1123
Page 12  x=0  y=12353  w=794  h=1123
```
All sections uniform w=794 h=1123. Zero drift.

## 11. Raster QA

`pdftoppm -r 96 approved-template-poc.pdf approved_poc -png` → 12 PNGs, one per page, each **794 × 1123 px**.

Fonts (18 vendored woff2 faces) load via inline `@font-face` declarations carried in the approved template's own `<style>` block; `document.fonts.ready` is awaited before `page.pdf()` returns. No missing-glyph boxes on any page.

## 12. Pages 1 / 2 / 3 / 5 / 7 / 12 visual comparison

`approved_template_golden_comparison.png` — 6-page side-by-side. **LEFT = approved template (visual golden). RIGHT = approved-template renderer output.**

Pixel-wise mean-absolute-diff at 96 dpi (0 = byte-identical, 255 = max diverged):

| Page | Mean diff | p99 | Differing px | % of frame | Explanation |
|--:|--:|--:|--:|--:|---|
|  1 | **0.000** | 0.0 | 0 | 0.00% | Pure approved image; verbatim |
|  2 | 13.448 | 224.0 | 136,581 | 15.32% | 4 `<image-slot>` filled with manifest default JPEGs — the golden had raw `<image-slot>` tags that Chrome doesn't render, so RIGHT is more complete than LEFT. Divergence is a correct renderer improvement, not drift. |
|  3 | **0.000** | 0.0 | 0 | 0.00% | Pure approved image; verbatim |
|  5 | 0.555 | 0.0 | 7,294 | 0.82% | Mustache values substituted with snapshot data (`downLabel`, `subsidyAmt`, `emiLabel`, `emiOn`, `emiValue`, `dailyValue`, `savingsRange`). Every diff pixel is inside a mustache slot; nothing else moved. |
|  7 | 0.350 | 0.0 | 3,483 | 0.39% | Same — only mustache regions changed. |
| 12 | 0.598 | 0.0 | 5,733 | 0.64% | Same — only mustache regions changed. |

**The visual golden IS the approved template.** Every diff is either (a) a slot correctly filled that wasn't in the raw preview, or (b) a mustache correctly substituted with the snapshot value. There is no arbitrary rendering divergence.

## 13. Unresolved Page 3 limitation

Emitted verbatim as `PAGE_3_STATUS` and included in every render's `status.blockers`:

```
code:            PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE
page:            3
message:         Page 3 of the approved template is a single baked JPEG with no
                 {{mustache}} slots and no <image-slot>. The renderer renders it
                 verbatim. Dynamic Page 3 values (daily generation, monthly KSEB
                 value, home uses, surplus exported, footer contact) require the
                 approved template designer to add authorized {{mustache}} slots or
                 image-slots to Page 3 in a template revision. Until that ships,
                 dynamic Page 3 data is a PRODUCTION-RELEASE BLOCKER.
affectedFields:  dailyGenerationRange
                 monthlyKsebValueRange
                 homeUsesUnitsPerDay
                 surplusExportedRange
                 footerContact
```

The renderer does NOT ship pixel overlays. Page 3 currently renders exactly as the approved template. Per lock, dynamic Page 3 remains blocked pending template revision.

## 14. Production blockers

Two named `PRODUCTION_BLOCKER` codes:

1. **`PAGE_3_DYNAMIC_DATA_NOT_SUPPORTED_BY_TEMPLATE`** — described in §13. Blocks per-customer variance on Page 3's daily-generation, KSEB value, home-uses, surplus, and footer.
2. **`TIER_PRICING_NOT_SUPPORTED_BY_SNAPSHOT`** — the approved template ships 3 pricing tiers (Elite/Smart/Essential) with per-tier down-payment, financed amount, EMI and daily-savings mustaches. The current commercial snapshot exposes a single `customerTotalIncludingGST`. Blocks 15 mustaches on Pages 5, 7, 12 until pricingEngine / commercialSnapshot / financeEngine / savingsEngine grow a per-tier axis, OR business decides Elite/Smart/Essential map to the same figure (which would require an explicit product decision, NOT invented data).

`renderQuotationHtml(payload, { strict: true })` throws `MUSTACHE_UNRESOLVED` if either blocker is active with unresolved tokens. `strict: false` returns a status object with `blockers[]` for audit reporting. This is the mechanism the production route will use to REFUSE issuance until blockers are cleared.

## 15. Rollback strategy

Because no production file was modified and no route was rewired:

- **Rollback = do nothing.** The system continues to run on `public/lib/quotationDocument.js`. No cutover has happened.
- **Removing the new work** = delete `src/lib/approvedTemplate.js`, `src/lib/approvedTemplate.loader.js`, `assets/approved-template/`, and `tests/approved-template/`. Zero downstream impact.
- **Phase 2 cutover plan** (not part of this deliverable):
  1. Add `USE_APPROVED_TEMPLATE_RENDERER=false` feature flag to the quotation route (one env only).
  2. Confirm production blockers §14 are cleared (business decisions on tier pricing + template revision for Page 3).
  3. Flip flag ON in staging. Sales runs their own samples.
  4. One-week soak.
  5. Flip flag ON in production.
  6. Delete `public/lib/quotationDocument.js` in a separate PR after ≥30 days of clean production runs.
  7. Rollback at any step = flip flag OFF. Zero data migration. Zero payload shape change.

---

## HALT

- Old renderer NOT deleted, NOT modified.
- Production quotation route NOT changed.
- Page 4 NOT started.
- New renderer sits BESIDE the old one and is independently testable.
- Awaiting review.

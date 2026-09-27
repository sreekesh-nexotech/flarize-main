# Approved Template — Architecture Report (Read-Only)

**Date:** 2026-09-03
**Status:** READ-ONLY — no production, business logic, or approved-HTML files modified.
**Trigger:** rejection of current renderer's visual fidelity after `.q-inner + zoom` pagination fix.
**Ask:** determine whether we can print the approved Claude Design bundle DOM directly instead of reconstructing pages through a 1000×1414 canvas + F1 overlays.

**Verdict — direct print is not only possible; it is the intended architecture.** The template already ships with a mustache-token binding system + a percentage-based mask/overlay pattern. Our current renderer reimplements both, badly, from pixel-picked coordinates.

---

## 0. Evidence pipeline

Bundle file: `/root/.claude/uploads/4e5b8a83-.../998f0b63-Flarize_Solar_Quotation_1.html` (3.86 MB).
Bundler blocks:
- `<script type="__bundler/manifest">` — 48 assets (fonts + JPEGs + JS chunks)
- `<script type="__bundler/template">` — 89,504-char JSON-escaped HTML
- `<script type="__bundler/page_order">` — empty array `[]`
- `<script type="__bundler/ext_resources">` — 2 external UUID→URL pins (react, react-dom)

Trace artifacts under `_arch_trace/`:
- `_template_decoded.html` — decoded template DOM (89.5 KB)
- `_manifest.json` — 48-entry asset table
- `stripped_direct.html` — v1 (broke on natural section heights, spilled to 20 A4 pages)
- `stripped_direct_v2.html` — **v2, canonical**: preview wrappers removed + `section.page` pinned to 210mm × 297mm + `page-break-after: always`. **Prints to 12 exact-A4 pages, 2.64 MB.**
- `stripped_direct_v2.pdf` — direct A4 print (12 × 594.96 × 841.92 pt)
- `side_by_side_p1_p2_p3.png` — visual comparison, approved-direct vs current renderer

---

## 1. Why current renderer differs from approved HTML

Current `public/lib/quotationDocument.js` **reconstructs** each page instead of consuming the approved DOM:

1. **Wrong coordinate system.** Approved template = 794×1123 CSS px (native A4 @ 96 dpi) with **percentage-based** positioning for overlays (Page 7: `top:73.9%; height:19.2%`; Page 12: `top:11.8%; height:37.2%`). Current renderer = 1000×1414 px design canvas with **pixel-picked** overlays (Page 3: `top:227px; left:38px; width:290px`). Coordinates drift because 1000×1414 does not map to the JPEG's actual composition.
2. **Wrong asset provenance.** Approved DOM references JPEGs by manifest UUID (`8d78e938-…-2c0d13d463`) resolved to data URIs at runtime. Current renderer references separately vendored `assets/quotation/q-page-03.jpg` copies whose relationship to the manifest asset is not enforced.
3. **Reinvented mustaches.** Approved template has 47 `{{token}}` sites across Pages 5, 7, 12 with 23 unique tokens (`eliteCost`, `smartCost`, `essentialCost`, `subsidyAmt`, `eliteDown`, `smartDown`, `essentialDown`, `eliteFin`, `smartFin`, `essentialFin`, `eliteEmiValue`, `smartEmiValue`, `essentialEmiValue`, `eliteDaily`, `smartDaily`, `essentialDaily`, `downLabel`, `emiLabel`, `emiOn`, `emiValue`, `dailyValue`, `savingsRange`, `smartSubsidyMinus`). Current renderer emits its own hand-authored templates instead of substituting these tokens.
4. **Missing mask+overlay pattern.** Approved Pages 7 and 12 use the pattern `<img class="pg">` + full-width white mask at % coordinates + overlay div with `{{ mustache }}` grid. Current Page 3 renderer builds the same idea from px coordinates and gets edge bleed because a `290px` overlay on a 1000-px canvas scaled into A4 does not land on the exact JPEG region.
5. **No `@page` in approved.** The approved template has NO `@page` rule and NO `.page` size rule. Physical A4 came from `<doc-page size="a4" margin="0">` (a preview-only Claude Design element). When we removed that wrapper we had to supply the print CSS ourselves — which is fine, but our current renderer went further and rebuilt the entire layer.

Verified `.pg` rule in approved CSS: `.pg{width:100%;height:100%;display:block;object-fit:cover}` — the image already covers the whole section. No coordinate math needed for image-only pages.

---

## 2. Whether direct cleaned-template printing is technically possible

**Yes. PoC v2 succeeds.** Playwright + Chromium + `page.pdf({ format:'A4', printBackground:true, preferCSSPageSize:true, margin:0 })` on `stripped_direct_v2.html` produces:

- **12 physical PDF pages** (one per approved section)
- **Every page 594.96 × 841.92 pt** (≈595.28 × 841.89 pt = A4; 0.006% under, well inside the 1.5-pt contract tolerance)
- **DOM section bounds:** all 12 sections measure exactly `x=0 y=n*1123 w=794 h=1123` after pinning
- **2.64 MB output** (backgrounds + all fonts + all baked JPEGs preserved)
- **All 6 `<img>` elements on Page 2** render at their approved coordinates
- **Page 3 baked JPEG covers the full 794×1123 canvas**

The only injected CSS is 6 lines:
```css
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0 !important; padding: 0 !important; background: #ffffff; }
section.page {
  width: 210mm !important; height: 297mm !important;
  overflow: hidden !important;
  page-break-after: always !important; break-after: page !important;
  page-break-inside: avoid !important; break-inside: avoid !important;
  box-sizing: border-box;
}
section.page:last-child { page-break-after: auto !important; break-after: auto !important; }
```

No `zoom`. No `transform: scale`. No 1000×1414 canvas. No per-page reconstruction.

---

## 3. Exact preview wrappers safe to remove

Only these are Claude Design preview scaffolding (not content):

| Tag / script | Purpose | Action |
|---|---|---|
| `<script src="0abc8473-5e1c-4604-86c6-5d7c14b0bf1c"></script>` @125 | Claude Design runtime that expands mustaches + `<image-slot>` + injects `<doc-page>` | **Delete script tag** — we will run our own mustache substitution server-side |
| `<x-dc>` / `</x-dc>` @198,85046 | Claude Design host element | **Delete tags, keep children** |
| `<helmet>` / `</helmet>` @205,9778 | `<head>` fragment container | **Delete tags, hoist children into `<head>`** |
| `<doc-page size="a4" margin="0" style="position:absolute;left:176px;top:-5px">` / `</doc-page>` @9788,85034 | Preview A4 viewport chrome | **Delete tags, keep children** |
| `<script type="__bundler/*">` (all 4 blocks) | Bundle manifest/template/page_order/ext_resources | **Delete** — bundle data has already been unpacked and inlined |
| `<script src="data:text/javascript;base64,…">` (2 pulled in from ext_resources UUIDs) | react + react-dom UMD chunks | **Delete** — no React DOM is used by the approved page content |

Preserve, verbatim: every `<section class="page">…</section>`, every `<style>` block hoisted from `<helmet>`, every `@font-face` (18 faces), every inline `<img>` and `<image-slot>`.

---

## 4. Exact approved DOM that must remain

Per-section census (from `_template_decoded.html`, 12 sections):

| # | Bytes | Mustaches | `<img>` | `<image-slot>` | Character | Type |
|---|------:|----------:|-------:|--------------:|------------|------|
| 1 | 107 | 0 | 1 | 0 | Full JPEG cover (`.pg`) | image-only |
| 2 | 17,396 | 0 | 6 | 4 | Onam offer page + 4 upload slots | live HTML |
| 3 | 107 | 0 | 1 | 0 | Full JPEG cover (`.pg`) | image-only |
| 4 | 12,950 | 0 | 8 | 0 | Benefits (all baked JPEGs) | live HTML |
| 5 | 30,676 | **24** | 2 | 0 | Elite / Smart / Essential pricing cards | live HTML + mustache |
| 6 | 107 | 0 | 1 | 0 | Full JPEG cover | image-only |
| 7 | 3,656 | **13** | 1 | 0 | JPEG + white mask 73.9%–93.1% + EMI table on top | hybrid (mask + mustache) |
| 8 | 107 | 0 | 1 | 0 | Full JPEG cover | image-only |
| 9 | 107 | 0 | 1 | 0 | Full JPEG cover | image-only |
| 10 | 108 | 0 | 1 | 0 | Full JPEG cover | image-only |
| 11 | 108 | 0 | 1 | 0 | Full JPEG cover | image-only |
| 12 | 14,202 | **10** | 1 | 0 | JPEG + white mask 11.8%–49% + rebuilt investment card | hybrid (mask + mustache) |

Everything in this table is source of truth. Nothing is regenerated by our code; we substitute tokens and expand `<image-slot>` only.

---

## 5. Recommended renderer architecture

**Server-side template renderer** (~150 lines total, replacing ~3600 lines of `quotationDocument.js`):

```
approvedTemplate.js
├── loadTemplate()          — read once + cache the decoded template + manifest
├── stripPreviewShell(tpl)  — remove runtime script, <x-dc>, <helmet>, <doc-page>, bundler scripts;
│                             hoist helmet children into <head>; inject the 6-line print CSS above
├── expandImageSlots(html, payload)
│                           — <image-slot id="…" src="uuid"> → <img src="data:…"> using
│                             manifest[uuid] as the default, with per-quotation override lookup
├── substituteMustaches(html, tokens)
│                           — for each of the 23 tokens, replace {{ token }} with formatted string
│                             from live snapshot payload
├── formatToken(name, snapshot)
│                           — one function per token; delegates to pricingEngine / financeEngine /
│                             savingsEngine outputs already in snapshot (no new business logic)
└── renderQuotationHtml(snapshot) → string
```

The Playwright PDF pipeline (`page.pdf({ format:'A4', preferCSSPageSize:true, margin:0, printBackground:true })`) is unchanged.

No 1000×1414 canvas. No `zoom`. No `transform: scale`. No pixel-picked overlays. No F1 hybrid we author ourselves — the approved template already carries the only hybrid pattern (Page 7, Page 12) and we honor it verbatim.

---

## 6. How dynamic data should be injected

Two channels, both native to the approved template:

**A. `{{ mustache }}` substitution** (Pages 5, 7, 12 — the only pages with tokens).
`data-props` on `<doc-page>` declares the schema:

| Prop | Editor | Default | Section |
|---|---|--:|---|
| `costElite` | int | 338000 | Pricing |
| `costSmart` | int | 268000 | Pricing |
| `costEssential` | int | 198000 | Pricing |
| `subsidy` | int | 78000 | Pricing |
| `downPaymentPct` | int | 10 | Financing |
| `emiRatePct` | int | 8 | Financing |
| `emiYears` | int | 10 | Financing |
| `savingsLow` | int | 5183 | Financing |
| `savingsHigh` | int | 5700 | Financing |

Snapshot payload feed:
- `costElite`/`costSmart`/`costEssential` ← `payload.pricing.value.customerTotalIncludingGST` per package tier
- `subsidyAmt` ← `payload.subsidy.value.pmSuryaGharAmount`
- `savingsRange` ← `payload.savings.value.monthlyLow..monthlyHigh`
- `emiValue`, `eliteEmiValue`, `smartEmiValue`, `essentialEmiValue` ← `payload.financing.value.emiMonthlyPerTier`
- `downLabel`, `emiLabel`, `emiOn` ← formatted from `payload.financing.value.{downPaymentPct, emiRatePct, emiYears}`
- `smartSubsidyMinus` ← `-` + formatted `payload.subsidy.value.pmSuryaGharAmount`
- `dailyValue` ← `payload.savings.value.dailyAverage`

Formatting = Indian digit grouping + `₹` prefix + en-dash for ranges (already implemented in `quotationDocument.js` helpers — reusable).

**B. `<image-slot id="…" placeholder="…" src="uuid">` expansion** (Page 2 only).
4 slots: `ofr-scooter`, `ben-ac1`, `ben-ac2`, `ben-ac3`. Default = the UUID's manifest asset (already an approved JPEG). Per-quotation override = customer's uploaded photo, when present. Otherwise the approved default JPEG stays.

**No other injection surface.** Pages 3, 6, 8, 9, 10, 11 are approved image-only (`.pg` full-cover). Page 4 is approved image-only-composite (8 `<img>` elements at fixed CSS positions). None takes dynamic data.

---

## 7. Page 1 strategy

Page 1 is 107 bytes: `<section class="page"><img class="pg" src="8d78e938-…" alt="Page 1"></section>`.

Direct print puts the JPEG at `x=0 y=0 w=794 h=1123` filling the A4 canvas exactly.

**Strategy: 100% approved DOM verbatim. No renderer. No overrides. No coordinate work.** The reason our current Page 1 renderer diverges from approved is that it authors the page itself instead of emitting the approved single-`<img class="pg">` line. The fix is to stop authoring — pass the approved DOM through.

---

## 8. Page 2 strategy

Page 2 = live HTML, 17.4 KB. 4 `<image-slot>` upload targets (scooter + 3 AC/inverter/gift photos), 6 baked `<img>` decoratives, 1 inline campaign panel, no `{{mustache}}` tokens.

**Strategy: pass approved DOM verbatim + expand `<image-slot>`.** The renderer's only job on Page 2 is to substitute customer photos for the 4 default JPEGs (or leave defaults). Every other element — decorative accents, Onam artwork, "Best Deal of the Year" pill, campaign panel, footer — comes from the approved section body untouched. This eliminates every current Page 2 visual defect (section spacing, vertical positioning, campaign/footer/decorative composition), because those defects are our reconstruction drifting from the source.

The current `campaign.period` D6 pass-through in `src/lib/quotationPayload.js` becomes obsolete for Page 2 rendering (the approved DOM has no campaign-period mustache); however, KEEP it in payload for other consumers.

---

## 9. Page 3 strategy

Page 3 approved DOM = 107 bytes, `<img class="pg" src="a20a72b1-…-411da58a48b">`. **No mustaches. No overlays. No mask. Full JPEG cover.**

The `data-props` schema does not declare a single Page 3 field. The approved template designer chose to bake sample banner values, appliance table, total daily usage, cards, and footer into `q-page-03.jpg`.

Three honest options — this is a **business/product decision**, not an engineering one:

**Option Z (strict-verbatim):** Use approved DOM verbatim. Page 3 shows the baked sample values (`18–22`, `₹5,500–6,600`, `~13`, `4–8`, footer `+91 9995 073 579`). Any per-quotation variance in daily generation / KSEB value / home uses / surplus / company contact is IGNORED on Page 3. Downside: violates the spirit of "no invented values" — the baked figures are effectively hard-coded per quotation.

**Option Y (approved F1 pattern, honestly implemented):** Copy the Page 7 / Page 12 pattern to Page 3. Add `position:absolute` white masks + overlay divs at PERCENTAGE coordinates measured from the JPEG, with `{{ dailyGen }} / {{ ksebValue }} / {{ homeUses }} / {{ surplus }} / {{ footerContact }}` mustaches. This is what our current F1 code tried to do but with px coordinates on a 1000×1414 canvas — the pixel-picking is what caused the visible edge bleed. Rebuilt with % on the 794×1123 source, edges will land on the JPEG regions correctly. **This is our recommended path if dynamic Page 3 values are still required.**

**Option X (re-authored artwork):** Ask Claude Design to add mustaches to Page 3 in the source template, then re-export the bundle. Cleanest, but requires template revision.

**Recommendation: Option Z first (ship the approved page as-is, sample values acceptable while the template locks), then Option Y if Sales confirms per-quotation Page 3 dynamics are non-negotiable.** Either way, delete the current F1 overlay implementation.

---

## 10. Page 4–12 strategy

| Page | DOM | Strategy |
|---|---|---|
| 4  | live HTML, 8 `<img>`, 0 mustache | Verbatim. No overrides. |
| 5  | live HTML, 2 `<img>`, **24 mustaches** | Verbatim + mustache substitution (Elite / Smart / Essential pricing block) |
| 6  | `<img class="pg">` | Verbatim |
| 7  | `<img class="pg">` + mask + **13 mustaches** | Verbatim + mustache substitution (EMI table). Approved pattern — copy exactly, do NOT pick coordinates. |
| 8  | `<img class="pg">` | Verbatim |
| 9  | `<img class="pg">` | Verbatim |
| 10 | `<img class="pg">` | Verbatim |
| 11 | `<img class="pg">` | Verbatim |
| 12 | `<img class="pg">` + mask + **10 mustaches** | Verbatim + mustache substitution (rebuilt investment card). Approved pattern. |

Total mustache sites across the deck: **47** (10 unique + repeats). Total `<image-slot>` sites: **4**. Everything else in all 12 pages: verbatim.

---

## 11. What current renderer code becomes obsolete

`public/lib/quotationDocument.js` (~3,600 lines, 12 renderPage functions + PAGE_A4_CONTRACT_STYLES + 12 PAGE_N_STYLES + overlay coordinate tables + PAGE_THREE_ASSETS + PAGE_N_ASSETS + hand-authored SVGs and campaign markup) is almost entirely obsolete:

- Every `renderPageN(payload)` function — obsolete. Replaced by `substituteMustaches(approvedSectionN, tokens)`.
- `PAGE_A4_CONTRACT_STYLES` (`.q-canvas`, `.q-inner`, `zoom: calc(...)`, `@page`) — obsolete. Replaced by the 6-line print CSS injected into the stripped template.
- `PAGE_THREE_ASSETS.fullArtwork` + `q-page-03.jpg` on disk — obsolete IF we consume the approved manifest UUID directly. (Or keep it as a mirror if we prefer disk assets, but drop the divergent reference.)
- Every `q3-ov-l1`…`q3-ov-l8` overlay + pixel coordinate table — obsolete. Replaced (if we go Option Y) by percentage-based masks copying the Page 7 / Page 12 pattern.
- 1000×1414 design canvas — obsolete. Approved uses 794×1123.
- `blockedFieldsPageN(payload)` — obsolete for approved DOM; replace with a small validator that walks the mustache token list and reports which snapshot fields are missing.

What survives:
- `getIssuedPayload()` / `buildPayload()` snapshot logic
- Indian digit-grouping + en-dash formatter helpers (reusable inside `formatToken`)
- The Playwright PDF driver (fixture + `page.pdf(...)`)
- The tests (they get rewritten around approved DOM, not our reconstruction)

---

## 12. What can be reused

1. **`src/lib/quotationPayload.js`** — the snapshot payload is EXACTLY the input needed to fill the 23 mustache tokens + 4 image slots. No shape change required. The D6 `campaign.value.period` addition stays.
2. **Snapshot pinning** (`getIssuedPayload()`, `buildPayload()`, ISSUED vs DRAFT) — unchanged.
3. **Vendored fonts** under `public/assets/quotation/fonts/` — already 1:1 with the manifest's 18 woff2 faces. Keep them; drop the manifest-inlined base64 duplicates from the print HTML to save bytes.
4. **Playwright PDF pipeline** (`tests/pdf-a4-fixture.html` + `tests/pdf-a4-contract.test.mjs` structure) — reusable with a new fixture that loads the stripped approved template.
5. **Formatters** — Indian digit grouping, `₹` prefixing, en-dash ranges, phone display.
6. **`public/assets/quotation/q-page-*.jpg`** — bit-identical to the manifest UUIDs (should verify), so on-disk assets can back the manifest lookup.

---

## 13. Minimal migration path

7 steps. No production write until step 6.

1. **Add `src/lib/approvedTemplate.js`** — the ~150-line renderer described in §5. Not wired to any route yet.
2. **Add `src/lib/approvedTemplate.loader.js`** — loads and caches the decoded template + manifest from a project-checked-in copy of the approved bundle under `assets/quotation/approved-bundle.html`.
3. **Add tests** under `tests/approved-template/`: (a) 12 sections load; (b) preview scaffolding is stripped; (c) each mustache substitutes; (d) each `<image-slot>` expands; (e) direct-print PDF has 12 A4 pages; (f) baked JPEG on Pages 1/3/6/8/9/10/11 matches manifest asset bit-for-bit.
4. **PoC deploy behind a feature flag** `USE_APPROVED_TEMPLATE_RENDERER=false` in one env — Sales runs their own quotation samples and confirms visual parity vs the approved page.
5. **Flip the flag ON** in one env — one week soak.
6. **Route production PDF button to the new renderer.** `quotationDocument.js` remains on disk but no longer imported.
7. **Delete `quotationDocument.js`** and its overlay assets in a separate PR once the new renderer is proven in production.

Rollback = flip flag OFF. Zero data migration. Zero payload shape change.

---

## 14. Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Approved template revisions ship out-of-band | Medium | Medium | Version-pin the checked-in bundle; test hash on load; alert on mismatch |
| Mustache token added by design team, not consumed by us | Medium | Low | Test emits list of unmatched tokens; CI fails on unbound mustache |
| Sample values baked into Page 3 JPEG mislead sales | High if Option Z | Medium | Choose Option Y (approved F1 pattern) if per-quotation Page 3 data required |
| Playwright / Chromium print regressions across versions | Low | High | Pin Chromium version in tests; existing PDF-contract test suite catches it |
| Fonts fail to load in headless print (network gap) | Low | High | Continue vendoring the 18 woff2 faces; use `document.fonts.ready` gate (already in fixture) |
| Approved bundle grows past our print-hydration budget | Low | Low | Manifest is 3.6 MB — well within Playwright's per-page limit; strip react/react-dom UMD chunks (already done in PoC) |
| Cross-page break drifts (a section is authored > 297 mm intrinsic) | Low | Medium | `section.page { height: 297mm; overflow: hidden }` clips; add per-page height-audit test |
| We diverge from approved DOM under future feature pressure | Medium | High | Add a lint rule: `approvedTemplate.js` never rewrites section bodies; only substitutes tokens + expands `<image-slot>` |

---

## 15. Proof-of-concept results — Pages 1, 2, 3

Direct print of `stripped_direct_v2.html` via Chromium/Playwright at `format:'A4', preferCSSPageSize:true, margin:0, printBackground:true`:

**PDF file:** `_arch_trace/stripped_direct_v2.pdf`, 2,638,563 bytes, 12 pages, every page `594.96 × 841.92 pt` (portrait, A4-tolerance-compliant).

**DOM section bounds after A4 pinning:**
```
Page  1  x=0  y=0      w=794  h=1123
Page  2  x=0  y=1123   w=794  h=1123
Page  3  x=0  y=2245   w=794  h=1123
Page  4  x=0  y=3368   w=794  h=1123
Page  5  x=0  y=4490   w=794  h=1123
Page  6  x=0  y=5613   w=794  h=1123
Page  7  x=0  y=6735   w=794  h=1123
Page  8  x=0  y=7858   w=794  h=1123
Page  9  x=0  y=8980   w=794  h=1123
Page 10  x=0  y=10103  w=794  h=1123
Page 11  x=0  y=11225  w=794  h=1123
Page 12  x=0  y=12348  w=794  h=1123
```
All sections uniform width 794 (= 210 mm @ 96 dpi), uniform height 1123 (= 297 mm @ 96 dpi). Zero drift.

**Sub-region bounds — Page 1:** one `<img class="pg">` at `x=0 y=0 w=794 h=1123`. Full JPEG cover. Zero blank margin.

**Sub-region bounds — Page 2 (approved DOM live-HTML):**
```
img#logo-small  x=0    y=0    w=150  h=57
img#logo-large  x=594  y=0    w=200  h=77
img#onam-hero   x=571  y=45   w=190  h=353
img#fx-corner-l x=-10  y=999  w=140  h=54
img#fx-corner-r x=670  y=1007 w=130  h=50
pill "Best Deal of the Year"    x=40  y=66  w=236  h=32   bg=#123f35
box "Fixed Price"               x=397 y=36  w=176  h=87
campaign panel (gradient)       x=40  y=246 w=714  h=99
```
All fully inside the 794×1123 canvas; nothing clips; approved authors' offsets honored exactly. **Current renderer's Page 2 vertical spacing / footer / campaign composition rejection is resolved by this path** — because the path passes the approved DOM through instead of reconstructing.

**Sub-region bounds — Page 3:** one `<img class="pg">` at `x=0 y=0 w=794 h=1123`. Full JPEG cover, 0 overlays. **Current F1 overlay implementation's edge bleed is inapplicable to the direct-print path** — the direct print never emits overlays because the approved DOM has none.

**Rasterized comparison:** `_arch_trace/side_by_side_p1_p2_p3.png` (2.42 MB, 1596×3517 px) shows Pages 1/2/3 approved-direct-print (left) vs current renderer (right). Left column matches approved bundle preview 1:1; right column shows the current renderer's known-rejected drift.

**Rasterization command used for both sides:** `pdftoppm -r 96 <in>.pdf <prefix> -png`. Chromium version `pw-1194`. Font stack fully vendored (18 woff2 faces + system fallbacks).

**Contract compliance vs `tests/pdf-a4-contract.test.mjs`:**
- ✅ PDF exists, > 4 KB (2.64 MB)
- ✅ pdf-lib parses
- ✅ page count = **12** (test currently expects 3; migration will update expectation)
- ✅ every page A4 portrait within ±1.5 pt
- ✅ backgrounds render (> 60 KB heuristic met by 2.64 MB)
- ⚠️ `PAGE_A4_CONTRACT_STYLES` export check fails — this contract belongs to the old renderer and is retired under the new architecture

**Bottom line:** direct print delivers a 12-page A4 PDF whose section geometry matches the approved bundle exactly, with no coordinate reconstruction and no overlay mask math. Visual parity is architectural, not a matter of tuning.

---

## HALT

No production files were modified. No approved HTML was modified. No business logic was modified. No page was implemented. Report ends here. Awaiting decision on Options Z / Y / X for Page 3 and approval to begin the 7-step migration.

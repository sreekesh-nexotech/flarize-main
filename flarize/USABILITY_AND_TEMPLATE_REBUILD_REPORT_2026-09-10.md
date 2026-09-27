# FLARIZE — USABILITY REVIEW + APPROVED-TEMPLATE PDF REBUILD — DELIVERY REPORT

**Date:** 2026-09-10 · **Bundle:** `flarize_usable_2026-09-10.zip` · **Base:** `flarize_fastquote_2026-09-09.zip`
**Owner feedback (2026-09-09):** panel dropdown in Sales; quotation PDF ≠ approved template (alignment/visual); project page not understandable; procurement unusable for adding items / setting panels & inverters / prices; district dropdown; two Sales pages; "be the critic, correct all things, remove unwanted things, make it usable for normal people".

Everything below was tested as each role in a real browser (Chromium) and through the API. Where the owner's data does not yet carry a value, the platform **blocks and names the owner** — nothing is invented.

---

## 1. Quotation PDF — now the approved template (owner v1 bundle, sha fbb4e5e2…)

The customer document (`public/lib/quotationDocument.js`, served by `quotation-document.html`) was rebuilt page by page against `assets/approved-template/Flarize_Solar_Quotation.v1.html`. Typography and geometry use the approved px values directly on the physical A4 page (1 CSS px = 1/96 in, so the approved 794-px layout maps 1:1 to 210 mm — no zoom, no transform); the live pages use the approved Poppins faces vendored in the repo.

| Page | Before | Now |
|---|---|---|
| 1 Cover | left-aligned title, one badge, ad-hoc footer | approved centred title/sub-line, badge row (subsidy + **300+ Homes** + **MNRE** when the Admin enters them in Company profile), approved contact strip |
| 3 Generation | overlay values wrapped/overflowed the banner (the "page 3 overlap" in the owner's PDF); footer address ran off the strip | values re-measured against the artwork (never wrap), full-width live contact strip |
| 4 Why Choose | generic `.qd-` layout, filler copy | approved DOM: intro, "Our Promise", stat cards (installations / years / MNRE **only when entered** — CERTIFIED and KERALA are approved static), 8 approved gallery photos extracted from the bundle, "We hand picked" band |
| 5 Three options | 3 columns always, 2 of them "Not available" with internal notes; Price-before-GST rows; column order reversed | approved cards **Elite · Smart · Essential** — ★ Recommended ribbon, Total System Cost, PAYMENT BREAKDOWN (Down payment / PM Surya Ghar subsidy / Amount payable), EMI (N yrs @ R %), Daily Investment, the approved **"What's Included" service table** (13 rows, from `data/quotation-inclusions.json → _serviceMatrix`), contact strip. A tier that is not quotable is **omitted**, not printed empty |
| 6 Testimonials | generic filler quotes + "Not available" | approved layout, rendered **only when real testimonials exist** in `data/quotation-testimonials.json`; otherwise the page is left out (template sample customers are never printed as genuine) |
| 7 Technical specs | header banner, GST rows only, "ongrid (1P)" inverter type | approved logo/heading, recommended column highlighted, live columns only for quoted tiers, GST rows + approved payment rows (Down Payment / **Subsidy Amount** / **Amount Payable · Financed**) + footnote, inverter type "String Inverter (Single Phase)", structure specification, item warranty when entered |
| 8 Savings | "Not available" graph + internal notes, "₹2,398 – ₹2,398" ranges, bank "Not available" | graph/lifetime figures appear when the savings config carries the approved escalation + degradation (engine extension, §3); ranges collapse when low = high; **Required Documents** (approved 8-item list); "Book now" printed only when the bank account exists in Company profile |
| 9 Timeline | generic 6-step DOM | approved artwork; the 5 kW-specific "REFUND FROM KSEB … Rs 4000" example is covered by the approved formula text so the page is right for every size |
| 10/11 Terms | truncated 19 one-liners | the owner's approved artwork pages (19 clauses) |
| 12 Investment summary | separate blocks, "Not available" rows, dated "Priority 10-Day" offer | approved orange-header card (payment breakdown, savings, green EMI + Daily Investment), artwork base (hybrid banner, badges, guarantees), approved **Refer & Earn** block |

**PDF generation.** New `GET /api/quotation/quotations/:id/pdf` renders the same document in headless Chromium on the server (Playwright) and streams an A4 PDF named `{Customer}_{OnGrid|Hybrid}_{kW}kW_{QNo}.pdf` — identical on every browser (the owner's PDF came from Firefox, which has no CSS `zoom` and adds print margins). Sales "Download PDF", History "Download PDF" and the document's Print button use it; when Playwright/Chromium is not installed on the host the route answers 501 and the page falls back to the browser print dialog. Firefox on-screen also gets a `transform` fallback for the design canvas. Install once on the server: `npm i -D playwright && npx playwright install chromium` (or set `PDF_CHROMIUM_PATH` to a system Chrome).

**Three tiers in one quotation.** Pack-mode orchestration now runs `orchestrateThreeTiers` with `allowPartialAlternatives`: the selected pack is primary; Base/Value/Premium alternatives are attached when their pack is approved and priced, otherwise recorded in `unavailableTiers` (never faked). A failure of the *selected* tier is reported under the primary codes (`PACK_PRICING_BLOCKED`, `ENGINEERING_BLOCKED`…), not as an "alternative" failure.

Verified: `tests/e2e/render-pdf-verify.mjs` (12-page A4, reproducible), server PDF 10–12 pages depending on CMS campaign / testimonials, screenshots in `tests/e2e/shots/`.

## 2. Usability — role by role (what changed)

**Sales (`sales.html`, the only Sales page).** Component changes are dropdowns (panel / inverter / ACDB — only the slots the Project Head opened); district is a Kerala dropdown (customer form + district source); `sales-wizard.html` redirects here. Download PDF = server PDF.

**Procurement.** Primary page is **Items & Prices** (`catalog.html`): every category, add item (panel: watt/DCR/electrical facts; inverter: kW/phase/type…), reference price, tiers, DCR, warranty (printed on the quotation), approve (PH/Admin), retire/restore. Items **without a positive price** are tagged **NO PRICE** and are no longer offered to Sales as swaps (a "New Solar Panel" at ₹0 sat in the catalog — a swap to it would have cut the customer price). "Purchase batches" (old procurement console) moved under More ▾ with a plain-language intro and headings.

**Project Head.** kW Packs first; Items & Prices; History. "Project workspace" (single-project engineering console) sits under More ▾ with a plain intro ("everyday work does not need this page"), numbered plain-language steps (1 Project → 2 Configuration → 3 Approved package → 4 BOM → 5 Engineering check → 6 Lock → 7 Cost & price → 8 Rate history); the dead "acting role" switcher is gone (role comes from the login). The contract-style "Quotation Review" console is now **Quotation internals** under More ▾ (newest quotation first, no manual timestamp); **History** is the review tool (customer, system, **amount**, salesperson **name**, status; detail → View quotation / Download PDF / Internal review).

**Admin.** Dashboard: recent quotations show the customer name (was `[object Object]`); the readiness matrix now runs the engineering check per pack (was READY for packs that fail at issue) — 20 ready / 10 blocked on the dev data with the reason per cell; bank-details note updated. Company profile gained **Quotation trust badges**: completed installations, years of experience, MNRE empanelled (blank = badge not printed). Package Approvals page: fixed — it sent no session token (every call 401).

## 3. Engine / data-model additions

- `savingsEngine.projectLifetime()` — 25-year graph, lifetime KSEB spend, lifetime net savings, computed **only** when `data/savings-config.json` carries `tariffEscalationLow/High` and `degradationRatePerYear` (all still `null` — owner decision). Until then the graph card is omitted, never fabricated.
- `quotationWorkspace.componentAttributesFor` copies item `warranty`, `specification` and a readable inverter type from `deviceType`.
- `quotationPayload`: `inclusions.serviceMatrix` (per tier), `testimonials` from `data/quotation-testimonials.json` (server provider; frozen into ISSUED documents like everything else).
- `server-company.js`: `yearsExperience`; `completedInstallations` / `mnreEmpanelled` now editable in the UI.

## 4. CODE DEFECTS found and fixed (pre-existing)

1. Page 3 overlays mis-measured (banner value wrapped and spilled outside the rounded banner; footer overflow) — the owner's "alignment" complaint, reproducible in Chrome too.
2. Page 8 bank block never rendered even with bank data (`field()` stringified the object → `[object Object]`).
3. `package-approval.html` / `package-authoring.html` API calls carried no Bearer token → 401 for everyone.
4. Quotation History: amount column always "—" (read fields that never existed); salesperson showed internal user ids; unescaped customer/district text.
5. Admin dashboard recent quotations printed `[object Object]`; readiness matrix ignored the engineering checker.
6. Three-tier orchestration: a *selected*-tier failure surfaced as `ALTERNATIVE_TIER_*`.
7. Zero-price catalog items were valid Sales swaps.

## 5. DATA / DECISION BLOCKERS (owner action — nothing invented)

| # | Blocker | Where to fix | Effect until fixed |
|---|---|---|---|
| 1 | **Market rates** — release data has rates for only 3 packs (on-grid Value 3 kW, on-grid Premium 5 kW 1P, hybrid Value 3 kW / 2 batteries). | kW Packs → Market rates → Submit → Admin approve & publish | `PACK_PRICING_BLOCKED` for every other pack; three-option page shows only the priced tiers |
| 2 | **On-grid Premium (Enphase)** — PBC-M-003 / PBC-K-001: no MICRO_INVERTER / IQ System Controller line in the on-grid Premium template. | kW Packs → ongrid → Premium slots (or amend D12) | Elite column absent on on-grid quotations |
| 3 | **Battery `bt1` (SEG.5 PRO 100AH)** — protection rating not recorded (PBC-H-002). | kW Packs → hybrid → battery engineering facts → MCCB rating | Hybrid Value not quotable |
| 4 | **Savings projection assumptions** (`tariffEscalationLow/High`, `degradationRatePerYear`) null. | `data/savings-config.json` (no UI yet) | No 25-year graph / lifetime figures on pages 8 & 12 |
| 5 | **Bank / UPI / QR / seal / signature** empty. | Admin → Company profile | Page 8 "Book now" block omitted |
| 6 | **Trust facts** (completed installations, years, MNRE) empty. | Admin → Company profile → Quotation trust badges | Page 1 shows the subsidy badge only; page 4 shows CERTIFIED / KERALA only |
| 7 | **Testimonials** — none entered. | `data/quotation-testimonials.json` (real customers only) | Page 6 omitted |
| 8 | **Item warranties** mostly blank; panel/inverter warranty rows print "Not available". | Items & Prices → Warranty | §15 forbids a generic statement |
| 9 | Terms artwork names **Golden Ray Renewable Energy**; company master says FLARIZE TECHNOLOGIES PVT LTD. | Confirm, or supply revised T&C artwork | Approved artwork printed as-is |
| 10 | Catalog test items from earlier owner testing: "hari 550", "New Solar Panel" (₹0 — now NO PRICE, not offered), "adani 600". | Items & Prices → Retire | none (kept — owner data) |
| 11 | Additional-structure ₹/kW (approved page-8 line) has no configured rate. | Decision: pack-config field | Line not printed |

## 6. Verification

| Suite | Result |
|---|---|
| `node --test tests/*.test.mjs` on the **release data** | **2483 pass · 0 fail** (34 live-only tests run separately) |
| Live suites (server on 4800, `ADMIN_PASSWORD` seed) | **34 / 34** (Phase A security, Phase B history) |
| `tests/e2e/pack-http-e2e.mjs` | **43 / 43** |
| `tests/e2e/conformance-http-e2e.mjs` (assertions updated to pack-mode semantics) | **46 / 46** |
| `tests/e2e/browser-sales-pack.mjs` (Sales end-to-end, dropdown swaps, document) | **24 / 24** |
| `tests/e2e/browser-pack-config.mjs` | **18 / 18** |
| `tests/e2e/browser-ph-lifecycle.mjs` · `browser-ph-sales.mjs` | **8 / 8** · **8 / 8** |
| `tests/e2e/render-pdf-verify.mjs` | pinned v1 bundle, 12-page A4, byte-identical re-render |
| Role walkthrough (Admin / PH / Procurement / Sales, every nav page) | no page errors, no failed requests (after the fixes in §4) |

Renderer tests updated to the approved design (page 5 cards/tiers, page 7 rows/strip, page 8 graph/bank/documents, page 12 card/artwork, provenance-leak guards kept, no-arithmetic guards kept); renderer baseline md5 refreshed. `npx vite build` run; `dist/` current.

## 7. How the owner starts (unchanged flow, fewer pages)

1. **Admin → Company profile:** bank/UPI/QR, seal/signature, completed installations, years, MNRE. **Admin dashboard:** validity days.
2. **Project Head → kW Packs:** market rates for every pack, battery MCCB rating, Premium template line; **Items & Prices:** warranties, retire test items. Submit → Admin approve & publish.
3. **Sales → Sales:** quote; Download PDF gives the approved-template PDF (install Playwright Chromium on the server once).
4. Optional content: `data/quotation-testimonials.json` (real customers), `data/savings-config.json` assumptions.

## 8. Files

**New:** `USABILITY_AND_TEMPLATE_REBUILD_REPORT_2026-09-10.md`, `data/quotation-testimonials.json`, `public/assets/quotation/q-gallery-01..08.jpg` (from the approved bundle).
**Changed:** `public/lib/quotationDocument.js` (pages 1,3,4,5,6,7,8,9,10,11,12; contact strip; tier order helpers), `public/quotation-document.html` (server PDF download, Firefox fallback), `server-quotation.js` (PDF route + Chromium discovery, testimonials provider), `src/lib/quotationPayload.js` (service matrix, testimonials), `src/lib/quotationWorkspace.js` (attributes, content provider), `src/lib/savingsEngine.js` (lifetime projection), `src/lib/salesOrchestrator.js` (deep preflight, primary error codes), `server-sales-orchestrator.js` (deep readiness), `server-sales.js` (history amount + names), `server-company.js` (yearsExperience), `server-bom-builder.js` (priced swaps only), `public/sales.html`, `public/quotation-history.html`, `public/quotation.html`, `public/workspace.html`, `public/procurement.html`, `public/company-profile.html`, `public/admin-dashboard.html`, `public/lib/nav.js`, `public/lib/catalog.js`, `public/lib/package-approval.js`, `public/lib/package-authoring.js`, `data/quotation-inclusions.json` (`_serviceMatrix`), tests (renderer suites, orchestrator pinning, quotation-ui, E2E conformance / ph-sales).

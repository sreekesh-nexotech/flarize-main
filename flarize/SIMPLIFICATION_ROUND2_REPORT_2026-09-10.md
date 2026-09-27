# FLARIZE — SIMPLIFICATION ROUND 2 — DELIVERY REPORT

**Date:** 2026-09-10 (second delivery) · **Bundle:** `flarize_simple_2026-09-10.zip` · **Base:** `flarize_usable_2026-09-10.zip`
**Owner feedback (2026-09-10, 4 screenshots + `QA_Test_Customer_OnGrid_3kW_GR_20260910_9690.pdf`):** no upload button for UPI QR / seal / signature; workspace and procurement pages not understandable and nothing can be added or priced there; Items & Prices belongs to Procurement, kW Packs to the Project Head; the quotation must offer all three options (Value / Base / Premium); bank details missing; quotation workspace not understandable; CMS editing too hard; each role should see only its own pages, Admin everything; "also confused how to approve the market rates".

Every change was exercised as each role in a real browser (Chromium 136 via Playwright) and through the API. Where the owner's data does not carry a value the platform still **blocks and names the owner** — nothing is invented.

---

## 1. What each role now sees (owner rule: "sales sees sales things, project same, admin everything")

`public/lib/nav.js` — one shared top bar, role → pages:

| Role | Top bar | Notes |
|---|---|---|
| Sales / Sales Head / CRS / Field Sales | **Sales · History** | Nothing else. The Sales page's own duplicate Logout button was removed (top bar has it). |
| Project Head / Engineering | **kW Packs · Items & Prices · History** | kW Packs first. Items & Prices stays because the Project Head approves new items that Procurement adds. |
| Procurement | **Items & Prices** | Add items, set purchase prices, panels/inverters, GST — the only page they need. |
| Admin | Dashboard · Sales · History · kW Packs · Items & Prices · **Quotation content** · Company · Users · **Advanced ▾** | Advanced ▾ holds the engineering / developer consoles: Approvals, Quotation internals (gate · versions), Project workspace (single-project BOM), Purchase batches (landed cost), BOM Configuration (registry), Packages (registry list), CMS (document content). |

The single-project workspace, purchase batches and the CMS page designer are no longer shown to Project Head or Procurement — they are Admin-only, behind Advanced ▾. Nothing was deleted; every route still exists and is still guarded server-side.

## 2. "Confused how to approve the market rates" — guided publish flow

`public/pack-config.html` + `public/lib/pack-config.js`

* A status banner at the top of kW Packs shows the four steps **Edit → Save to draft → Submit to Admin / Publish → Approved · Sales quotes it**, highlights the current step, and shows **one primary button for the signed-in role**:
  * Project Head, after editing: **Save & submit for approval** (or *Save only*). Once submitted: "Draft vN is waiting for Admin approval".
  * Admin, after editing: **Save & publish now** — saves the draft and approves it in one click. On a Project-Head submission: **Approve & publish** / **Reject** (reason prompt).
  * Nothing edited: "Approved vN is live — Sales quotes from it."
* The banner always shows **how many packs have no market rate** (red badge) with an *Open Market rates* link — those packs are blocked for Sales, never guessed.
* **Market rates tab:** every empty cell is red with the placeholder "₹ not set" and a red **NOT SET** label; the card header counts them ("87 NOT SET" / "all set"). Heading and hint are in plain words: *the customer price (incl. GST) for each pack on a flat roof, within the included km; roof add-ons, swaps and extra km are added automatically*.
* **Publish report** now adds a plain-language "→ what to do" line under the engineering rule that blocked a pack (PBC-H-001/002/003, PBC-M-001/002/003), e.g. *"Enter the battery's MCCB / protection rating from its datasheet: Packs & slots → hybrid → Battery engineering facts → Save, then Re-publish approved."*
* Review & approve tab: Admin's button reads **Publish draft now** on an Admin-authored draft, **Approve & publish** on a submitted one.

**Server:** `src/lib/packConfig.js` gains `approveDraftDirect()` — Admin only (`PACKAGE_APPROVE`), refused when the draft equals the approved config (`NO_CHANGES`), and audit-visible: the draft is recorded as *submitted by* and *approved by* the Admin with a change-log line `DIRECT APPROVE by Admin (no Project Head submission)` and approval note `direct approve by Admin`. `POST /api/pack-config/draft/approve { at, direct: true }` uses it when the draft is not SUBMITTED; without `direct` the previous rule (only a SUBMITTED draft can be approved) is unchanged. Project Head still cannot approve; Sales still cannot see the page (403). Before this, an Admin who edited a rate had **no way to publish it** — Admin lacks `PACKAGE_SUBMIT`, so the two-step lifecycle dead-ended (CODE DEFECT, confirmed by test `Admin approves, PH submits`).

**Two click-swallowing bugs fixed** while testing the flow (real cause of "hard to use"): typing in a rate cell and then clicking a banner button or a tab did nothing, because the input's blur fired a re-render that replaced the button under the mouse. The banner re-renders only when its state changes; tabs are built once and updated in place.

## 3. Uploads — UPI QR, seal, signature, offer photos, testimonial photos

* **Company profile** (Admin): UPI QR, signature and seal each have a file input (PNG/JPEG ≤ 5 MB) with a live preview. The file is stored through the existing CMS asset store (`POST /api/cms/assets`) and the profile keeps the asset id + public file URL. Verified: upload → preview → Save → reload → previews persist; the images print on page 1 (signature + seal beside "Warm Regards") and page 8 (QR beside the bank block).
* `GET /api/cms/assets/:id/file` is now public-read (it only serves files a logged-in Admin uploaded) so the printed quotation and the server-side PDF renderer can load them.

## 4. "CMS editing is very hard" — one plain page: Quotation content

New `public/quotation-content.html` + `public/lib/quotation-content.js` (Admin; in the top bar). Two cards:

* **Offer page (page 2)** — ON/OFF switch, campaign name, **festival** (type *Onam* for the approved Onam artwork and festival wording; any other festival prints its name; blank prints a neutral offer page), year badge, headline (Malayalam or English), sub-headline, benefit band label + value, urgency label + slots left, campaign period + note, call-to-action, disclaimer, optional lucky draw (title, winners, description, photo), up to 3 offer cards (title, description, photo). *Save offer page* creates/updates the CMS campaign and activates or deactivates it. Blank fields hide their block.
* **Customer testimonials (page 6)** — banner line, up to 3 real customers (name, place, kW, installed on, quote, bill before/after, monthly saving, photo), optional video/QR block. Stored in `data/quotation-testimonials.json` via `GET/PUT /api/quotation-content/testimonials` (Admin writes; Project Head / Sales Head read). Page 6 is omitted until at least one testimonial exists.

The old CMS page designer remains under Advanced ▾ for developers.

**Page 2 = the original design (owner, 2026-09-11: "12 page sample offer is not same as our original design").** Two causes, both fixed:

1. **CODE DEFECT — page 2 was drawn at 79 %.** The approved page-2 artwork is authored in px on the 794-px A4 page (padding 40 px, urgency card at left 397 px, 40 px headline, 170 px lucky-draw image …) and `PAGE_TWO_STYLES` carries exactly those values — but the section was still wrapped in the 1000 × 1414 design canvas (`zoom 0.79374`), so every height and offset shrank to 79 %: squashed hero, Mahabali over the urgency card, offer images 110 px instead of 150 px, an empty band above the disclaimer. Page 2 now draws directly on the physical A4 page like pages 1 and 4–12. Side-by-side against the approved bundle's page 2 the layout is now identical (`tests/approved-template/_out/approved-template-poc.pdf` p.2 vs the server PDF). The sub-headline also carries the approved colour accents (festival word green, "Flarize!" orange).
2. **The sample was rendered from a near-empty test campaign** (headline + one offer with a 1-pixel test photo) — every unfilled block is hidden by design, so the page collapsed. The approved content now ships ready-made:
   * `public/assets/quotation/approved-offer-campaign.json` — the Onam Solar Fest 2026 page as campaign content (every value copied from the approved bundle: headline, "FESTIVAL OFFERS WORTH UP TO ₹40,000+", 35 slots, electric-scooter lucky draw with 5 winners, the three offer cards with the bundle's photos — `q-page-02-scooter/ac-voucher/hybrid-upgrade/refer-gift.jpg` — period 29 July – 12 August, CTA, disclaimer).
   * **Quotation content → "Load approved Onam design"** fills the form with it; **"Preview page 2"** (`offer-preview.html`) shows the saved page exactly as it prints.
   * `scripts/seed-approved-offer-campaign.mjs` plants it as an **OFF** campaign; the release data ships with it seeded, so Admin only reviews the period / slot count and switches it ON. Nothing prints until it is ON.

**Renderer (page 2) binding fix:** the approved artwork is the Onam Solar Fest page. Its festival words ("WHY BOOK DURING ONAM?", "FESTIVAL OFFER", "MORE FESTIVAL BENEFITS"), King Mahabali illustration and floral corners now print only when the campaign names the festival (or supplies its own artwork); other campaigns get neutral wording ("WHY BOOK NOW?", "MORE BENEFITS") and no Onam-only artwork. The "Better Savings — Offers worth up to ₹40,000+" line was static template copy that contradicted the campaign's own benefit value; it now reads the campaign value (e.g. ₹25,000) or a generic line. Tests updated (`tests/phase3-quotation-page2-campaign.test.mjs` B4/B5).

## 5. "All three options in the quotation"

The document already prints every tier that can be priced. Why the owner's PDF showed one option, and what changed:

* **CODE DEFECT fixed — offer page never reached Sales quotations.** `salesOrchestrator.init` in `server.js` was never given the CMS store, so the ACTIVE offer campaign (page 2) was silently omitted from every Sales-generated quotation (only the internal `/api/quotation` route had it). Wired through `workspace.getCmsStore()`. Verified: a Sales quotation now prints page 2 when a campaign is ON.
* **Sales result screen explains the options** (`public/sales.html`, step 8): "Quotation generated successfully! (2 of 3 options)" and an **OPTIONS IN THIS QUOTATION** block — ✓ for each tier in the document, ✗ with a plain-language reason for each missing tier (codes never shown):
  * not published for this kW → Project Head must add and publish the pack in kW Packs
  * no customer price → Project Head must enter the market rate (kW Packs → Market rates)
  * engineering check failed for this pack → Project Head must fix the pack configuration
  * cost data incomplete → Procurement must complete item prices
* **Page 5 heading counts the printed options** — "Two Options. One Smart Choice." when two tiers are live — instead of always promising three.
* Owner data still decides (see §7): Base needs its market rate; on-grid Premium is blocked by rule PBC-M-003.

## 5b. Pages 5 and 7 — three columns, as the original (owner, 2026-09-12: "technical specification we need three — smart, essential and elite — placement and other as original, no changes in the design")

Re-checked against the re-uploaded `Flarize Solar Quotation 1.html` (byte-identical to the stored approved bundle, sha `fbb4e5e2…`).

* **Page 7 (Technical Specifications)** and **page 5 (Three Options)** now always print the three approved columns in the approved placement — **Elite (premium) · Smart (value, recommended, centre) · Essential (base)** — instead of only the tiers that could be quoted. A tier whose package was not quotable keeps its column, headed with its customer-facing name, and every cell reads *Not available*; on page 5 its card says "This option is not included in this quotation. Ask your Flarize advisor for a quote on this system." Nothing is borrowed from another tier and nothing is invented (test: the Smart total appears exactly once in the page).
* **Page 7 footer = the approved rows only:** Total System Cost · Down Payment (N%) · Subsidy Amount · Amount Payable / Financed. The "Price Before GST / GST / System Price incl. GST / Extras" rows added on 09-10 were not in the design and are removed (the GST split and the transport-extra note stay on the page-5 option cards). Table typography raised to the approved raster metrics (11 px rows, 12 px headers, 15 px cell padding) so the table fills the page as in the artwork.
* **Page 5 heading** is the approved text verbatim, "Three Options. One Smart Choice."; the "What's Included" table always has three columns — for an unquoted tier it uses that tier's own service matrix (business configuration pinned at issue as `inclusionsByTier`), never another tier's.
* **Payload:** `system.tierColumnNames` (all three C6 names) and `inclusionsByTier` are pinned at issue (`src/lib/quotationPayload.js`), so a historical quotation prints the same three headings forever.
* **Why the Elite column is "Not available" today — DATA / DECISION BLOCKER (unchanged, §7 #2):** every on-grid premium pack is blocked by engineering rule PBC-M-003 (D12 System Controller). The column fills with real Enphase data the moment that decision is made and the premium market rate is entered; the Essential column needs its market rate on kW sizes other than 3 kW.

**Test-harness CODE DEFECT found while verifying:** `tests/cms-transport.test.mjs` ran `server-cms.js` against the real `data/cms-state.json` and `data/cms-assets` — every `npm test` wrote "Updated Campaign" records, test pages and assets into live data and **deactivated the live offer campaign** (that is where the 315 junk campaigns in the previous bundles came from, and why an intermediate sample lost its page 2). `server-cms.js` now honours `CMS_STATE_FILE` / `CMS_ASSETS_DIR`; the test points them at a temp store and removes it afterwards. Verified: `data/cms-state.json` byte-identical before and after `npm test`.

## 5c. Pages 1, 4 and the footer of every page — as the original (owner, 2026-09-12, three screenshots)

Re-measured against the approved artwork at 96 dpi (1 px = 1 CSS px):

* **Page 1** — logo 22 px at (45, 22); hero 700 × 226 px at (47, 62); headline 30 px; the three trust badges (₹ subsidy / homes / MNRE) now use the approved glyph discs (money-bag, house-tick, shield-tick) and sit on the full-width rule at y ≈ 468; letter from y ≈ 505; **YOUR PROPOSAL DETAILS** now sits at y ≈ 776 with the approved 36 px row pitch, labels at x 55 / 417 and values at x 232 / 594 — the block was 50 px too high with 28 px rows, which left the white band the owner circled.
* **Page 4** — the five stat cards (300+ Successful Installations · 8+ Years Industry Experience · CERTIFIED · KERALA · MNRE) print with their glyph discs at the approved 78 px height, and "300+ Projects Across Kerala" heads the gallery. Only two cards printed before because the three company figures were empty; with them the band "WE HAND PICKED FOR YOUR HOME" lands at y ≈ 565–700 exactly as in the artwork (the white space below the band is in the artwork too, same height now).
* **Trust figures seeded** (`data/company-profile.json`: `completedInstallations 300`, `yearsExperience 8`, `mnreEmpanelled true`) — the figures printed on the owner-approved artwork; editable in Admin → Company profile → Quotation Trust Badges.
* **Footer strip on all 12 pages** — pages 9–12 are approved artwork with the OLD address ("Thannikakal, Thumpoly PO, Alappuzha – 688008") baked into their footer; the live strip, bound to the company master like pages 1–8, is now laid over that band (top 1070 px, 53 px). The strip itself was re-measured: wordmark only (no tagline), 10 px medium text, address on two short lines (street line, then "City – PIN"), phone spaced "+91 9995 073 579".
* **Address** — per the owner's instruction the company master address is now `Floor 01, Building 49/190/B, Tharath Building` + `Alappuzha – 688007` (dev and release data; the C6/C7 tests that pinned the old "Ambalappuzha, Alappuzha North" wording were updated to the owner-confirmed form). Every page prints the same two-line footer address.

## 6. Bank details

They print on page 8 (QR left, *Bank Transfer* right: bank, A/c name, A/c no, IFSC, branch) **as soon as bank name + account number + IFSC exist in Company profile**. The release data ships with these empty (never invented), so a fresh install shows no bank block until the Admin fills Company profile → Bank & payment. Nothing else hides it. The UPI QR now has an upload button (§3).

## 7. DATA / DECISION BLOCKERS — owner action (nothing invented)

| # | Blocker | Where | Effect until done |
|---|---|---|---|
| 1 | **Market rate per pack** — release data prices 3 packs only (on-grid 3 kW Value ₹2,00,000; on-grid 5 kW 1P Premium ₹2,50,000; hybrid 3 kW Value 2-battery ₹5,49,902 — owner-entered); every other cell is red *NOT SET* | Project Head → kW Packs → Market rates → Save & submit; Admin → Approve & publish (or Admin: Save & publish now) | Sales cannot quote that pack; the tier is missing from the document with the reason shown |
| 2 | **On-grid Premium (Enphase micro-inverter)** — engineering rule **PBC-M-003** ("No IQ System Controller line is present", decision D12: *System Controller mandatory for backup*). The on-grid premium pack has no battery / backup, so the rule blocks every on-grid premium kW. | **Owner / Engineering decision (Aromal):** either D12 applies to hybrid (backup) only → rule scoped to hybrid by engineering, or the on-grid premium pack must include the Enphase System Controller (catalog `en7` ₹1,10,000 or `en_sysctrl` ₹25,000 — owner to say which). | Premium column missing from every on-grid quotation |
| 3 | **Battery `bt1` (SEG.5 PRO 100AH) protection rating** — PBC-H-002 | kW Packs → Packs & slots → hybrid → *Battery engineering facts* → enter MCCB rating → Save → Admin *Re-publish approved* | Every hybrid Value pack blocked |
| 4 | **Company profile**: bank name / A/c / IFSC / branch / UPI id, UPI QR upload, seal + signature uploads, completed installations, years of experience, MNRE | Admin → Company | No bank block on page 8; no seal/signature on page 1; trust badges omitted |
| 5 | **Offer page**: the approved Onam design is pre-loaded but OFF — review period (29 July – 12 August in the artwork) and slot count, then switch ON; **testimonials** (real customers) | Admin → Quotation content | Page 2 / page 6 omitted |
| 6 | Savings projection assumptions (`data/savings-config.json`), item warranties, T&C entity, quotation validity policy | unchanged from the 2026-09-10 report §5 | as before |

## 8. Verification

| Suite | Result |
|---|---|
| Unit (`npm test`) on **clean release data** with the live server on 4800 | **2 486 / 2 486 pass, 0 fail** (2 520 tests incl. subtests; 09-12 re-run on dev data: 2 474 pass, the same 13 data-state failures only) |
| Unit on the mutated dev data | 13 data-state failures only (legacy registry counts, C7 identity fields that the upload test filled in) — none on release data |
| `tests/pack-config.test.mjs` (+ `approveDraftDirect` test) | 23 / 23 |
| `tests/phase3-quotation-page2-campaign.test.mjs` (+ B4/B5 festival-neutral, C1 accents) | 27 / 27 |
| Page 2 vs approved bundle p.2 (Chromium PDF, same content) | layout identical; Sales quotation PDF page 2 = approved design |
| Pages 5 + 7 vs approved bundle (three columns, placement, footer rows) | placement identical; Elite column "Not available" pending the PBC-M-003 decision (`pages5-7_approved_vs_rendered.png`) |
| `tests/phase3-quotation-page7.test.mjs` (+ three-column contract test), `page5` | 72 / 72 · 43 / 43 |
| `tests/cms-transport.test.mjs` on a temp store — `data/cms-state.json` unchanged by `npm test` | 32 / 32, byte-identical |
| `tests/pdf-a4-contract.test.mjs` (zoom constant 0.79374 = 210 mm ÷ 1000 px accepted) | 7 / 7 |
| `tests/e2e/pack-http-e2e.mjs` | 43 / 43 |
| `tests/e2e/conformance-http-e2e.mjs` (pack-mode transport + Admin-only registry nav assumptions updated) | 59 / 59 |
| `tests/e2e/browser-sales-pack.mjs` (+ options block, no raw codes, no internals) | 27 / 27 |
| `tests/e2e/browser-pack-config.mjs` | 18 / 18 |
| `tests/e2e/browser-ph-lifecycle.mjs` · `browser-ph-sales.mjs` | 8 / 8 · 8 / 8 |
| `tests/e2e/render-pdf-verify.mjs` | rendered HTML 200, PDF 12 pages, byte-identical HTML across two renders |
| Browser flow (Playwright): PH edits a rate → *Save & submit* → Admin sees *Approve & publish* → publish report; Admin edits → *Save & publish now* → v9 live | pass, no page errors |
| Browser: Company profile uploads (QR/signature/seal) persist after reload; Quotation content saves offer (ON) + testimonial; next Sales quotation = 12 pages with page 2 offer, page 6 testimonial, page 1 seal/signature | pass |
| Pages 1 + 4 vs approved artwork at 96 dpi | geometry within a few px; footers of pages 9–12 = company master |
| Renderer md5 pin refreshed (`tests/issue-fixes-regression.test.mjs`) | `2d78d5f2c02b304e720ed515352f0d96` |

## 9. Release data (`data/`)

Cleaned of test residue that the previous bundle still carried: 315 empty "Updated Campaign" CMS campaigns, 1 261 test CMS pages and 630 test assets (CMS store reset to empty), 2 test quotations, 5 test customers, 10 test workspace projects. Kept: catalog, pack configuration (approved v1, 3 market rates), cost/energy/finance/subsidy/savings config, procurement seed batches (they carry landed costs), commercial history, users (`admin`, `sales1`, `projhead1`, `procurement1`, `eng1` — passwords unchanged from the previous bundle), quotation counter (continues from the last issued number). `data/quotation-testimonials.json` empty; `company-profile.json` bank/QR/seal/signature null, trust figures 300 / 8 / MNRE true (approved artwork), address `Floor 01, Building 49/190/B, Tharath Building`, Alappuzha – 688007. The CMS store carries exactly one campaign — the approved Onam Solar Fest 2026 offer page, **OFF** — seeded by `scripts/seed-approved-offer-campaign.mjs`.

## 10. Files changed (round 2)

`server.js` (CMS store into Sales orchestrator), `server-workspace.js` (`getCmsStore` export), `server-pack-config.js` (`direct` approve), `server-quotation.js` (testimonials routes), `server-cms.js` (public asset file read), `server-company.js` (yearsExperience), `src/lib/packConfig.js` (`approveDraftDirect`), `src/lib/cmsStore.js` + `cmsWorkspace.js` (campaign content keys), `src/lib/quotationPayload.js` + `quotationWorkspace.js` (testimonials, service matrix), `public/lib/nav.js`, `public/lib/pack-config.js`, `public/pack-config.html`, `public/sales.html`, `public/company-profile.html`, `public/quotation-content.html` + `public/lib/quotation-content.js` (new), `public/offer-preview.html` (new), `public/assets/quotation/approved-offer-campaign.json` + `q-page-02-scooter/ac-voucher/hybrid-upgrade/refer-gift.jpg` (from the approved bundle), `scripts/seed-approved-offer-campaign.mjs` (new), `public/lib/quotationDocument.js` (page 2 direct A4 draw + festival binding, pages 5/7 fixed three columns + approved footer rows, seal/signature, numeric zoom), `server-cms.js` (env-overridable store paths), `tests/cms-transport.test.mjs` (temp store), tests listed in §8, `KNOWN_BLOCKERS.md`.

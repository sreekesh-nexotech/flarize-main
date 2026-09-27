# FLARIZE — FAST QUOTATION BUILD (kW PACKS) — DELIVERY REPORT

**Date:** 2026-09-09 · **Bundle:** `flarize_fastquote_2026-09-09.zip` · **Base:** `flarize_final_2026-09-07.zip`
**Owner brief:** "faster quotation" — Sales issues a quotation in minutes from Project-Head-approved kW packs; no sales-head BOM building per enquiry. Decisions Q1–Q10 / D1–D6 (owner, 2026-09-08) are implemented as stated; where the owner's data does not yet carry a value the platform **blocks and names the owner** — nothing is invented.

---

## 1. What was built (one flow)

```
Project Head                      Admin                        Sales (old sales.html, same steps)
────────────────────────────────  ───────────────────────────  ──────────────────────────────────────────
kW Packs workspace (draft)        Approve draft → version n    Customer → Bill → System (size / Future-Ready /
 • kW sizes (+ add 15 kW …)        → publish packs to registry   battery / roof / km / subsidy) → Package →
 • slots: qty per size, Sales      → Sales sees version n        Options (only PH-opened slots, approved
   swap yes/no, PH default,                                      alternatives) → Offer → Price panel (server) →
   approved alternatives          Quotation controls           Generate → PDF
 • consumables · roof structure     • validity days             {Customer}_{OnGrid|Hybrid}_{kW}kW_{QNo}.pdf
   tables · costs · installation    • bank details status
   matrix · transport · GST ·       • pack status / approvals
   pricing mode · market rates ·
   future-ready pairs · battery
   MCCB rating · item warranty
 • submit                          Legacy admin BOM tool writes are mirrored into the draft (never live)
```

**Price formula (D1–D6, server-side, `src/lib/packPricing.js`):**
`customer price incl. GST = market rate(pack, flat roof, within km) + Σ swap delta(selected − PH default, at line GST) + roof add-on((roof pack − flat pack) + labour + repair % + installation(roof) − installation(flat), + GST)`;
`transport extra = (km − included km) × vehicle ₹/km` — **shown separately, not in the system price**; GST composite 8.9 % (70 % @ 5 + 30 % @ 18); subsidy from the chosen panel's DCR status (engine); installation from the exact kW × roof matrix (no nearest-size).

## 2. Files

**New (7 + tests):** `src/lib/packConfig.js` (versioned draft/approved config, RBAC, validation), `src/lib/packPricing.js`, `server-pack-config.js` (`/api/pack-config/*`), `server-pack-publish.js` (approved config → registry packages, checker at template scope, supersede chain), `public/pack-config.html` + `public/lib/pack-config.js` (PH workspace, 7 tabs), `docs/BUILD_PLAN_FAST_QUOTATION_2026_09_08.md`; tests `tests/pack-config.test.mjs`, `tests/pack-pricing.test.mjs`, `tests/pack-bom-builder.test.mjs`, `tests/pack-publish.test.mjs`; E2E `tests/e2e/pack-http-e2e.mjs`, `tests/e2e/browser-pack-config.mjs`, `tests/e2e/browser-sales-pack.mjs`.

**Changed (18):** `server-bom-builder.js` (config-driven, Future-Ready panel/system size, PH defaults `tier:size`, salesSwap / alternatives enforcement, least-privilege alternatives), `server-sales.js` (system-options from approved config, bom-preview structure by roof, `POST /api/sales/price-preview` with subsidy estimate + validity, alternatives FR/battery params, pack vehicles), `server-sales-orchestrator.js` (pack mode, validity from policy, helpers hoisted), `src/lib/salesOrchestrator.js` (pack pricing, structure pack line, `quotation` + `subsidy` in the Sales result), `src/lib/commercialSnapshot.js` / `commercialFreeze.js` (`pack` domain, extras), `src/lib/packageApproval.js` (variant / systemSize / comboKey FR, acknowledged warnings), `src/lib/packageProjection.js` (FR comboKey identity — defect fix), `src/lib/engineeringChecker.js` (template scope), `server.js` (`/api/catalog` role views, warranty + battery-master routes, legacy write mirroring), `public/sales.html` (see §3), `public/quotation-document.html` (title = PDF name, `?print=1`), `public/lib/quotationDocument.js` (extras rows, page-5 EMI / savings / warranty from engines, page-8 bank details from company master), `public/admin-dashboard.html` (Quotation Controls card; `renderCostConfig` defect fix), `public/lib/nav.js` (kW Packs), `tests/issue-fixes-regression.test.mjs` (renderer baseline hash), `tests/package-projection.test.mjs` (+FR case).

**Data:** `data/catalog.json` — `tubeSize` / `structureRole` / `specification` on `sm_15x15`, `sm_25x15` (facts already in the item names; needed to map the roof pack's primary tube and print the structure row). `data/pack-config.json` — **seeded v1 from the owner's catalog** (templates, structure, costs, installation matrix, transport 100 km / ACE ₹35, market rates as they were, GST 8.9 %, mode PACK_MARKET_RATE, proposed future-ready pairs). Everything else reset to the 2026-09-07 state; all test users / test rates / test quotations removed. `App.jsx` untouched.

## 3. Old Sales UI (`sales.html`) — same steps, pack-aware

Step 3: size cards from the **approved** config (a new kW appears only after Admin approval), Future-Ready cards ("3 kW panels → 5 kW inverter & structure"), hybrid battery cards (0 = no battery / future ready → no battery, MCCB or extra meter), roof cards = the roof types the PH priced, **one-way km** (required; note shows the included km), vehicle (only when the PH table has >1), subsidy scheme cards. "Upgradeable to" labels removed. Step 4: tier cards show the pack's key components / battery / FR. Step 5: one server call; only PH-opened slots; approved alternatives; DCR ↔ subsidy badge; "fixed by Project Head" lines; structure line follows the roof; no prices. Step 7: **server price panel** — System Price, GST 8.9 %, Customer Price incl. GST, transport extra (separate), subsidy (engine, DCR-aware; "forfeited" on non-DCR), net payable, validity (from policy or an explicit "not configured" notice), or the named blocker + owner. Step 8: issues via the orchestrator (pack snapshot), shows number / date / valid-until / subsidy, **Download PDF** (`?print=1`), file name `{Customer}_{OnGrid|Hybrid}_{kW}kW_{QNo}.pdf` (= document title).

## 4. Verification

| Suite | Result |
|---|---|
| `node --test tests/*.test.mjs` (clean data) | **2520 tests · 2486 pass · 0 fail** · 34 = live suites |
| Live suites (server 4800, `ADMIN_PASSWORD` seed) | **34 / 34** (Phase A security, Phase B history) |
| `tests/e2e/pack-http-e2e.mjs` (RBAC, draft → submit → approve → publish, Sales sees only approved, swaps, blockers, quotation, idempotent re-publish, legacy mirror) | **43 / 43** |
| `tests/e2e/browser-pack-config.mjs` (PH page, all tabs, save round-trip, Sales redirected + 403) | **18 / 18** |
| `tests/e2e/browser-sales-pack.mjs` (old sales UI end-to-end → document title) | **24 / 24** |
| Worked example (3 kW Value, sheet roof, 130 km, panel p2→p7, rate 2,00,000) | price 2,12,815 (pre-GST 1,95,422 + GST 17,393) · transport extra 1,050 separate · subsidy 78,000 · net 1,35,865 — snapshot `pack` domain, versions `pack-config@vN`, `pack-pricing.1` |

`npx vite build` run; `dist/` current. Screenshots: `tests/e2e/shots/pack-0*.png`, `sales-0*.png`, `doc-p*.png`, `admin-controls.png`.

## 5. CODE DEFECTS found and fixed (pre-existing)

1. `src/lib/packageProjection.js` recomputed `comboKey` without the variant → a Future-Ready package collided with its standard pack after every reload (registry identity bug). Fixed + test.
2. `GET /api/catalog` (unauthenticated / Sales) exposed `costs`, `installationMatrix`, `structureTemplates`, `officeExpense`, fixed-item prices. Now role-scoped (Admin full; PH / Engineering / Procurement reference price, no procurement fields; Sales / anonymous: component master only, market rates kept — they are the price list). Old App.jsx public view still loads (uses market rates).
3. `admin-dashboard.html` called an undefined `renderCostConfig` → the dashboard threw on every load. Fixed.
4. `sales.html` hard-coded validity (+15 days) and forced `subsidyTreatment: NOT_QUOTED` → every orchestrated quotation had no subsidy. Validity now resolves from the Admin / PH policy; subsidy from the engine.
5. `quotationDocument.js` page 5 left EMI / savings / warranty blank although the payload carried the engine results; page 8 hard-blocked bank details although the company master has the fields. Renderer copies them now (baseline hash refreshed; no arithmetic added).
6. Pack publish exported only Sales-variable slots, so every Premium (Enphase) pack failed the checker for a missing micro-inverter. Architecture accessories are now part of the published package (hybrid Premium publishes; see blocker 2 for on-grid Premium).

## 6. DATA / DECISION BLOCKERS (owner action — nothing invented)

| # | Blocker | Where to fix | Effect until fixed |
|---|---|---|---|
| 1 | **Market rates** — only a few packs have a rate (v1 data: most cells 0). | kW Packs → Market rates → Save → Submit → Admin approve | `MARKET_RATE_NOT_SET` (owner PROJECT_HEAD): Sales cannot price that pack |
| 2 | **On-grid Premium (Enphase)** — checker rule PBC-M-003 (D12) requires an IQ System Controller for every Enphase architecture; the owner's template adds it only for hybrid. 12 on-grid Premium combos blocked. | Engineering decision: either add the System Controller to the on-grid Premium template (kW Packs → slots) or amend D12 for on-grid. | On-grid Premium not quotable |
| 3 | **Hybrid Value battery `bt1`** — external protection rating not recorded (PBC-H-002, open item D12-E). 6 hybrid Value combos blocked. | kW Packs → hybrid → battery slot → "Battery engineering facts" → enter the MCCB rating from the datasheet → Re-publish approved | Hybrid Value not quotable |
| 4 | **Quotation validity** not configured. | Admin dashboard → Quotation Controls → validity days (or an effective-period policy) | Documents print no "Valid until" |
| 5 | **Bank / UPI / seal / signature** empty in the company master. | Admin → Company profile | Page 8 "Book now" prints "Not available" |
| 6 | **Item warranty** absent on catalog items. | kW Packs → slot → alternatives → warranty field (panel / inverter / battery) | Warranty rows print "Not available" (§15 forbids a generic statement) |
| 7 | **Hybrid template at 0 batteries still lists meter × 1**; owner said no battery → no meter. Owner's v1 data. | kW Packs → hybrid slots → meter qty (b0) | Meter line present on no-battery hybrid packs |
| 8 | **Structure grade text** — catalog tube items are named "GP"; Value / Premium price at GI rates (owner rule). | Add GI items / attribute in catalog (Admin) | Document structure row shows tube size + gauge only |
| 9 | Future-ready pairs seeded (3→5sp, 5tp→6/8, 6→8/10, 8→10, hybrid 3→5, 8→10) are **proposals**. | kW Packs → Future ready | Each pair needs its own market-rate row |

## 7. How the owner starts

1. Log in as Project Head → **kW Packs**: check slot defaults / Sales-swap / alternatives per size, fill the **Market rates** table (Check margin uses the internal reference cost), installation matrix, transport vehicles; enter battery MCCB rating and item warranties; **Save to draft → Submit**.
2. Log in as Admin → **kW Packs → Review & approve → Approve & publish** (publish report lists blocked packs with the rule); Admin dashboard → validity days; Company profile → bank / UPI / seal.
3. Sales → **Sales (legacy)** → quote as before; the price panel and the PDF come from the approved packs.

## 8. Notes / limits

- Legacy admin routes (`/api/admin/market-rates|costs|bom-template|installation-matrix|transport-config|structure-templates`) still write `catalog.json` for the old React tool **and** mirror the change into the pack-config draft (visible after approval). The mirror uses the request time when the old tool sends no timestamp.
- Three-option (Base / Value / Premium) document columns require `orchestrateThreeTiers` — the lib exists, the old sales flow issues one chosen package; option columns 2–3 show "Not available" as before.
- Pricing mode is switchable by Admin (`PACK_MARKET_RATE` ↔ `GROSS_MARGIN`); the landed-cost engine still runs as an informational check in pack mode.

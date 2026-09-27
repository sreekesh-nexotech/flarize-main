# FLARIZE — FAST QUOTATION BUILD PLAN (kW packs)

**Date:** 2026-09-08 · **Owner decisions captured from:** Aromal KM (IT Head) replies of 2026-09-08 · **Base code:** `flarize_final_2026-09-07.zip`
**Goal:** a sales person issues a complete, approved-design quotation in minutes without asking the sales head for a BOM or price.

This plan reuses the existing engines (checker, package approval, project workspace, commercial snapshot, pinned renderer, RBAC). Nothing is rebuilt. Items marked **DECISION NEEDED** are the only points still open; everything else was answered.

---

## 1. Decisions recorded (from the owner)

| # | Topic | Decision |
|---|---|---|
| Q1 | Sales UI | Old UI/UX stays (`sales.html`: Customer → Bill → Recommended size + roof type → options → quote). No redesign. Minimum additions only (see §4). |
| Q2 | Tiers | The approved design has **three option columns** ("Three Options. One Smart Choice." — Essential / Smart / Elite). Tiers stay; each tier of a kW is a pack. |
| Q3 | Variable slots | Sales may change **Panel, Inverter**; **Structure follows roof type** (Flat / Sheet / Elevated) automatically; **DCDB / ACDB / Earthing** variable only if PH exposes approved alternatives for them (owner: "may be"). Everything else fixed by PH. **DECISION NEEDED:** confirm DCDB/ACDB/Earthing as variable, or fixed. |
| Q4 | Transport | **100 km included in every pack.** PH sets vehicle rate (e.g. Ace ₹35/km). Distance beyond 100 km → `(km − 100) × rate` shown as a **separate "Extra transport" line**, not inside the pack price. |
| Q5 | Pricing | **Project Head sets the market (selling) rate**, not sales head. Catalog material price is not the actual price. PH also sets the other charges: transportation, warehouse rent, loading/unloading, installation, others. Sales never edits price. |
| Q6 | Sizes | Not a fixed list. PH creates a pack for any kW (15 kW …); once Admin approves it, it appears in Sales. |
| Q7 | Future Ready | **Wanted.** FR pack = panels for the quoted kW (e.g. 3 kW), everything else — inverter, structure, cables, protection — sized for the larger capacity (e.g. 5 kW). Customer adds panels later without replacing the inverter. PH authors FR packs; Sales shows them only when approved. |
| Q8a | Bank / UPI / seal / signature | Admin enters in back-end; printed on the quotation. |
| Q8b | Warranty | Entered per catalog item when the item is added; printed on the spec page. |
| Q8c | Validity | Admin / PH set validity days (effective-period policy). |
| Q8d | Subsidy | DCR panel → subsidy project (PM Surya Ghar); non-DCR panel → no subsidy. |
| Q8e | Hybrid battery | Battery quantity per pack variant: **Value — no battery (battery-ready)** and **Value — 1 battery**. No battery ⇒ battery-dependent lines (battery meter, meter box, battery MCCB) drop out. When PH adds a battery to a BOM, PH **enters the MCCB rating** (protection data) — this is what unblocks bt1/bt3/bt4; the code never guesses it. |
| Q9 | PDF file name | `{CustomerName}_{OnGrid|Hybrid}_{kW}kW_{QuotationNo}.pdf` |
| Q10 | Approval | PH authors, **Admin approves** the BOM (unchanged). |
| — | Design | Uploaded `Flarize Solar Quotation 1.html` is byte-identical to the pinned approved v1 bundle (`fbb4e5e2…`). It is the target look. The PDF the team prints today comes from the data-bound page `quotation-document.html` (same design, HTML-built, with "Not available" gaps). Plan fills those gaps; no artwork redesign. |

**Rule change to record explicitly (DECISION NEEDED — confirm "yes"):** the 2026-09-07 conformance brief locked "no free 100 km". The owner now states 100 km is included in every pack. This plan implements the owner's rule: `transport = includedKm 100 (PH-configurable) + max(0, km − 100) × PH vehicle rate` as a separate extra line. Historical quotations are unaffected (snapshot).

---

## 2. Target model

```
PACK (package registry, existing)          = systemType × kW × phase × tier × variant
  variant: STANDARD | FUTURE_READY { panelKw, systemKw }
  batteryOptions: [0] | [0,1] | [1] | [0,1,2]   (hybrid only; PH decides per pack)
  lines[]:
     role, componentId, quantity,
     slot: FIXED | VARIABLE(approvedAlternates[])   ← sales may swap only VARIABLE
     dependsOn: null | BATTERY                       ← dropped when battery qty = 0
     protection: { mccbRating, fuseRating, ... }     ← PH-entered when line is a battery/protection
STRUCTURE PACK (new, PH-approved)           = kW × roofType (FLAT | SHEET | ELEVATED) → lines[]
SELLING RATE CARD (new, PH, versioned)      = componentId → sellingRate (₹/unit)  ("market rate")
CHARGES CARD (new, PH, versioned)           = installation(kW × roof), transport { includedKm, vehicle rates },
                                              warehouseRent, loadingUnloading, other[] — per kW or flat
VALIDITY POLICY (exists)  ·  BRANDING/BANK (exists)  ·  WARRANTY (new field on catalog item)
```

**Price (server, frozen in snapshot):**

```
materialSelling  = Σ line.qty × sellingRate(componentId)          ← pack lines after variable swaps + structure pack
charges          = installation(kW, roof) + transportIncluded + warehouseRent + loadingUnloading + other
systemPrice      = materialSelling + charges
GST              = per existing gstEngine (composite 70/30 rule unchanged)
customerPrice    = systemPrice + GST
extraTransport   = max(0, km − includedKm) × vehicleRate            ← separate line, outside systemPrice
subsidy          = subsidyEngine(DCR?, kW, connection)             ← unchanged
netPayable       = customerPrice − subsidy                          ← unchanged (financeEngine)
```

Internal (PH/Admin only): `margin = systemPrice − costEngine.totalActualProjectCost` when landed cost exists. Cost engine stays as the margin check; it no longer gates issuance when a selling rate exists for every line.

---

## 3. Build phases

### P1 — Data + engines (server)
1. `packageApproval.js`: pack fields `variant`, `panelKw`, `batteryOptions`, per-line `slot`, `approvedAlternates` (already exists on lines), `dependsOn`, `protection`. Validation: FIXED lines cannot be swapped; VARIABLE alternatives must be APPROVED catalog items.
2. `structurePacks.js` (new lib, PH-owned, versioned like the rate card): kW × roofType → lines. Seeded from the catalog's existing `structureTemplates` (flat / sheet / elevated for 3, 5, 8, 10 kW). 6 kW and others entered by PH.
3. `sellingRateCard.js` (new, same versioned append-only pattern as `projectRateCard.js`): componentId → sellingRate, changedBy, changeReason, effectiveFrom. Snapshot freezes versionIds.
4. `chargesCard.js` (new, PH): installation matrix (seeded from the catalog `installationMatrix`), transport `{ includedKm: 100, vehicles[] }` (seeded from cost-config UAT vehicles, marked demo until PH publishes), warehouseRent, loadingUnloading, other charges.
5. `pricingEngine.js`: add **SELLING_RATE mode** beside the existing gross-margin mode. Mode is a PH/Admin setting; every quotation records which mode priced it.
6. `salesOrchestrator.js`: structure from roof type (structure pack) — removes `STRUCTURE_SELECTION_REQUIRED` for sales; battery quantity variants + `dependsOn: BATTERY` line removal; FR packs; transport = included km + extra line; `distanceKm` required, `vehicleType` from PH default per kW if sales does not choose.
7. `engineeringChecker.js`: read protection rating from the line's PH-entered `protection` block (battery-master stays the fallback source). No rule relaxed.
8. Catalog item `warrantyYears` (+ `warrantyNote`) — set on add/edit; `componentAttributesFor` exposes it to the document.
9. PDF: `GET /api/quotation/quotations/:id/pdf` (Playwright when available on the host; otherwise the print page sets `document.title` to the file name so the browser's Save-as-PDF uses it). File name `{CustomerName}_{OnGrid|Hybrid}_{kW}kW_{QuotationNo}.pdf`.

### P2 — Project Head workspace (`ph-bom-config.html`)
1. **New pack** — any kW / phase / tier / variant (clone from an existing pack or empty).
2. **Future Ready** — mark pack FR: panel kW vs system kW; checker validates inverter/structure at system kW, panels at panel kW.
3. **Fixed / Variable** toggle per line; approved alternatives picker for variable lines.
4. **Battery** — allowed quantities per pack; battery line requires **MCCB rating** entry (stored on the line and pushed to battery-master through the existing engineering write path).
5. **Structure packs** tab — per kW × roof type lines.
6. **Selling rates** tab — per component rate (versioned) + **Charges** tab (installation, transport included km + vehicle rates, warehouse, loading/unloading, other).
7. **Validity policy** form (uses existing API). Warranty field on the "+ Template" add dialog.
8. Submit → Admin approve (unchanged). Approved pack appears in Sales immediately.

### P3 — Admin
1. Bank / UPI / signature / seal page (uses existing branding API; images uploaded through CMS assets).
2. Pricing mode switch (SELLING_RATE / GROSS_MARGIN) + approve packs (existing page).

### P4 — Sales (`sales.html`, old UI)
1. One new field on the Recommended-System step: **Site distance from warehouse (km)**. Roof type already there.
2. Size cards come from **approved packs** (any kW PH published), not a hard-coded list. FR packs show as their own card ("3 kW · future-ready 5 kW inverter").
3. Option step shows only VARIABLE slots (Panel — DCR / non-DCR, Inverter, and DCDB/ACDB/Earthing if approved as variable). No BOM table, no ids, no costs.
4. Price panel: System Price · GST · Customer Price · Extra transport (only if > 100 km) · Estimated Subsidy · Net Payable · Monthly Savings · EMI · Validity — all from the server.
5. **Download PDF** with the agreed file name.
6. Remove "Upgradeable to …" labels (upgrade paths stay in the API for the upgrade product; FR is the sales story).

### P5 — Quotation document (`quotation-document.html`, same design)
Fill every "Not available" that now has data: subsidy, savings/generation, validity, warranty (per item), mounting structure (from structure pack), three option columns (tiers of the same kW), bank / UPI / signature / seal, EMI + net monthly. Page-1 letter uses customer name (already). No artwork change.

### P6 — Migration + verification
- Existing 48 packages → packs with every line `FIXED`; existing `approvedAlternates` on panel/inverter/dcdb lines → `VARIABLE`.
- Structure packs seeded from `structureTemplates` (3/5/8/10 kW × flat/sheet/elevated); **6 kW = PH must enter**.
- Selling rates: seeded **empty** (PH enters; catalog `price` is reference only and is shown to PH as a hint, never used as the selling rate).
- Tests: unit (packs, structure resolution, selling-rate pricing, transport included/extra, FR checker, battery-dependent lines), HTTP E2E (RBAC, PH lifecycle, Sales chain, snapshot, immutability), browser E2E (old sales UI end-to-end to PDF), PDF file name.

---

## 4. What PH / Admin must enter before real quotations (no code can invent these)

1. Selling rate per component used in packs (PH).
2. Charges: installation per kW × roof (seed exists), transport vehicle rates (₹/km per vehicle), warehouse rent, loading/unloading, others (PH).
3. Structure pack for 6 kW (and any new kW) × roof type (PH).
4. Battery MCCB / protection ratings for bt1 / bt3 / bt4 (PH/Engineering, entered in the workspace).
5. Future Ready packs (PH) — e.g. 3 kW panels + 5 kW inverter.
6. Warranty years per panel / inverter brand (Admin/PH on the catalog item).
7. Validity days (Admin/PH). 8. Bank / UPI / signature / seal (Admin). 9. Premium (Enphase) packs: micro-inverter + IQ controller lines (PH).

---

## 5. Open decisions (answer before P1 starts)

1. **Transport rule reversal** — confirm: 100 km included in every pack, extra km as a separate line. (Reverses the 2026-09-07 "no free 100 km" lock.)
2. **DCDB / ACDB / Earthing** — variable for sales (from PH-approved alternatives) or fixed?
3. **Pricing mode** — confirm SELLING_RATE mode as the production mode (PH market rate per component + charges); gross-margin engine kept only as internal margin check.
4. **Distance input** — sales enters km on the old UI (one field). OK?
5. **Battery pricing** — battery line priced by its selling rate like any component (no separate battery price list)? OK?

---

## 6. Revision after reviewing `BOM_V1_Fixed.zip` (owner's original BOM tool, 2026-09-08)

**Finding:** the owner's v1 data is already in this repo. `BOM_V1_Fixed/data/catalog.json` = repo `data/catalog.json` minus the later additions (256 of 257 items identical, 6 rounding-level price differences, same `bomTemplates`, `structureTemplates`, `tubeWeights`, `costs`, `marketRates`). The repo additionally carries `installationMatrix`, `transportConfig {100 km, ₹35}`, `packageProfiles` and the rejected battery `ba_3b51aef23f0b`.

**What v1 defines that the Sept-5/7 "registry pack" model lost:**

| v1 concept (owner's process) | Where it lives | Server today |
|---|---|---|
| Template per system type: slots × qty per size, `variable` flag per slot | `bomTemplates.*.slots` | `server-bom-builder.js` builds it (server-side) ✔ |
| Consumables per size (`fixedItems`, 36–39 lines) | `bomTemplates.*.fixedItems` | built ✔ — **not in registry packs** (9–11 lines) |
| Battery-dependent quantities (`batQty` 0/1/2: MCCB box, battery cable, change-over, meter box, meter) | slots + fixedItems | built ✔ |
| Premium (micro) quantities (`premiumQty`) | slots + fixedItems | built ✔ |
| Structure by roof type (tube counts × `tubeWeights` × ₹/kg + fixed items + labour + repair %) | `structureTemplates`, `tubeWeights`, `costs` | **only in App.jsx** — not server-side |
| Costs: install ₹/kW, service, transport ₹/km with 100 km default, misc, office, elevated/sheet add-on | `costs` | partly (`cost-config.json` diverged) |
| **Pack market rate** (admin-set per systemType × tier × batteryConfig × size, FR key `_up{size}`) + `_diffBase` | `marketRates` | **only in App.jsx** |
| Customer price = market rate + variable-swap delta (selected − admin default, incl. GST) + add-ons + transport extra (> 100 km) | App.jsx | **only in App.jsx** |
| Future upgrade: panels at `size`, inverter (± structure / DB / cables / meter per option) at `upgradeSize` | App.jsx `fuOpts` | not server-side |

**Decision (senior-dev):** build the fast-quotation product on the **template model** (the owner's BOM), server-side, PH-editable, approval-gated — not on the 9-line registry packs. Concretely:

1. `server-bom-builder.js` stays the BOM engine (already server-side) and gains structure-by-roof (port of App.jsx structure logic, data = `structureTemplates`).
2. New `src/lib/packPricing.js` = v1 formula server-side: `customerPrice = marketRate(pack) + Σ variable-swap deltas + add-ons + transportExtra(km > included)`; internal `grand = material + GST + costs + margin` kept for the PH margin check (v1 already compared both).
3. Registry package = the **approval/version record** of a template pack (systemType × size × tier × batteryConfig × variant). On approve, the pack's full materialised lines (slots + fixedItems + structure) are frozen into the record so the checker, procurement and the quotation all see the same 40–50-line BOM.
4. PH workspace edits the **template** (qty per size, slot fixed/variable, alternatives, fixedItems, structure tables, costs, market rates) — the same data the owner already maintains — then Submit → Admin approve.
5. Sales (old `sales.html`) unchanged in shape: size cards from approved packs, variable slots only, roof type, km, price panel, PDF.

**Data conflicts to resolve with the owner before P1 (each has two "sources" in the repo):**

| # | Topic | v1 (owner tool) | Later repo config | Need |
|---|---|---|---|---|
| D1 | Installation | ₹3,000 / kW (`costs.installRate`) + elevated ₹5,000 / sheet ₹3,000 structure add-on | `installationMatrix` per kW × roof (3 kW flat 15,000 / sheet 18,000 / elevated 22,000 …) | Which is the real rule? |
| D2 | GST on selling price | flat 9 % | composite 8.9 % (70 % @ 5 % + 30 % @ 18 %) | Which? |
| D3 | Transport | `transportRate` 40 ₹/km, default 100 km; extra beyond 100 km hard-coded **₹35/km** | `transportConfig` 100 km @ ₹35 | One rate, PH-editable per vehicle — confirm ₹35 Ace, others? |
| D4 | Market rate | **per pack** (systemType × tier × battery × size; FR = `_up{size}`) — only 3 values set today | — | Confirm per-pack market rate (not per component). PH fills the table. |
| D5 | Variable-swap delta | computed from catalog `price` (v1) | owner: "material price is not actual price" | Delta from catalog price (PH keeps catalog prices current) **or** PH sets a selling price per alternative item? |
| D6 | Which slots sales may swap | every slot `variable: true` in v1 | — | PH toggles per slot; default variable = panel, inverter (+ dcdb/acdb?) |

Everything else in §1–§5 stands.

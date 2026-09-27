# ENGINEERING APPROVAL MATRIX

**Status:** 🟡 **MIXED** — 34 components APPROVED by decision, 288 still PROPOSED · **Phase:** 1C · **Updated:** 2026-08-15

**Source:** `docs/phase1/package-resolution-matrix.json` (offline replay of the engine, validated 7/7 against captured baseline v2).

> **Phase 1C update.** Components backed by an explicit engineering decision are now APPROVED and carry a decision id:
> `is1` (D11-A, every 1P package) · `is2` (D11-B, every 3P package) · `bt2` (D12, premium hybrid battery).
> **BLOCKED packages: 16 → 0.** The placeholder isolator no longer resolves anywhere.
>
> ⚠️ **Every other component in this document is still PROPOSED.** Each was produced by the current resolver. Where `derivedBy` is a FALLBACK value, the id is what `available[0]` or nearest-kW happened to return — decided by catalog array order, not by engineering. Approving these as-is would make an accident permanent.

## Legend

| Marker | Meaning |
|---|---|
| `EXPLICIT` | resolved from a stored selection (`data/bom-state.json`) |
| `FALLBACK_FIRST_AVAILABLE` | `available[0]` — first catalog row matching tier+phase |
| `FALLBACK_NEAREST_KW` | inverter chosen by |kW − target| |
| `NO_CANDIDATE` | nothing resolved — BOM emits an `N/A ₹0` line |
| `NOT_MODELLED` | the role has no engine slot — cannot be pinned (C32) |

## Roles with no engine slot (C32)

These engineering roles **cannot be pinned by any package** because the BOM engine does not emit them with a category. They are listed once here, not repeated per package.

| Role | Where it comes from today | Catalog category exists? | Consequence |
|---|---|---|---|
| `MICRO_INVERTER` | micro branch, emitted as `enphase` accessories via `find(name.includes('IQ8P'))` | ✅ `enphase` (mixed bag) | identified **by display name**; ₹110k vs ₹25k System Controller defect lives here |
| `BATTERY_CABLE` | uncategorised `fixedItems` entry `25mm Battery Cable` | ✅ `battery_cable` | category exists but the BOM line carries **no category** |
| `CHANGEOVER` | uncategorised `fixedItems` entry `40A Change Over Switch` | ✅ `change_over` | same — category exists, line untagged |
| `STRUCTURE` | generated from `structureTemplates` (flatRoof/elevated/sheetRoof) | ⚠️ `structure_material` | not a slot; qty interpolated, not selected |
| `MONITORING` | Envoy / DTU inside the micro branch | ❌ none | invisible to spec table and procurement |
| `DC_ISOLATOR` | — | ❌ none | one untyped `isolator` category only |

## Catalog reference for the contested roles


**`isolator` → AC_ISOLATOR? / DC_ISOLATOR?**

| componentId | name | brand | tiers | phase | price | status |
|---|---|---|---|---|---|---|
| `is1` | Honey Well Isolator 2P 40A | Honey Well | base,value,premium | 1P | ₹212 | ACTIVE |
| `is2` | L&T Isolator 40A 4P | L&T | base,value,premium | 3P | ₹623 | ACTIVE |
| `is_9b53be37fab1` | New Isolator | — | value | — | ₹0 | TEST |

**`mccb_box` → BATTERY_PROTECTION**

| componentId | name | brand | tiers | phase | price | status |
|---|---|---|---|---|---|---|
| `mb1` | Battery MCCB Box 160A | Generic | base,value | — | ₹8,500 | ACTIVE |

**`battery` → BATTERY**

| componentId | name | brand | tiers | phase | price | status |
|---|---|---|---|---|---|---|
| `bt1` | SEG.5 PRO 100AH LV Battery | SEG | base,value | — | ₹86,717 | ACTIVE |
| `bt2` | Enphase Flex Battery | Enphase | premium | — | ₹95,000 | ACTIVE |
| `bt3` | Okaya 100AH | Okaya | base | — | ₹78,000 | ACTIVE |
| `bt4` | Livguard 100AH | Livguard | base | — | ₹75,000 | ACTIVE |
| `ba_3b51aef23f0b` | New Battery | — | value | — | ₹0 | TEST |

**`battery_cable` → BATTERY_CABLE**

| componentId | name | brand | tiers | phase | price | status |
|---|---|---|---|---|---|---|
| `bc_25` | 25mm Battery Cable | Generic | base,value,premium | — | ₹120 | ACTIVE |

**`change_over` → CHANGEOVER**

| componentId | name | brand | tiers | phase | price | status |
|---|---|---|---|---|---|---|
| `co_1` | Change Over Switch | Generic | base,value,premium | — | ₹1,200 | ACTIVE |

---

# ON-GRID PACKAGES


## `PKG-ONGRID-3-1P-BASE`

**System:** ongrid · **Size:** 3 · **Phase:** 1P · **Tier:** base · **Profile:** `ongrid_base`

**Engineering status:** `WARNING` · **Fallback count:** 10 · **Explicit:** 1

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p1` | Waaree Mono perc Bifacial 540W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,122 | Approve this component or name the correct one |
| INVERTER | `i95` | Eastman 1P 3kW | `EXPLICIT` | ACTIVE | ₹14,800 | Confirm the stored selection is the approved component |
| DCDB | `d1` | 1/1 DCDB Havells MCB 500v 32A + Havells SPD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,525 | Approve this component or name the correct one |
| ACDB | `a1` | ETN 32A + Mersen ACDB | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,600 | Approve this component or name the correct one |
| METER | `m1` | Visiontek Single Phase Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,400 | Approve this component or name the correct one |
| DC_CABLE | `dc1` | DC-WACAB-Basic 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹43 | Approve this component or name the correct one |
| AC_CABLE | `ac1` | AC-RR 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is1` | Honey Well Isolator 2P 40A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹212 | Approve this component or name the correct one |
| EARTHING | `cb1` | CB Rod 14mm 100u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹260 | Approve this component or name the correct one |
| EARTHING | `ec1` | 16sqmm Green Cable FLEXGUARD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹21.6 | Approve this component or name the correct one |
| PROTECTION | `la2` | Kanberry FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-3-1P-VALUE`

**System:** ongrid · **Size:** 3 · **Phase:** 1P · **Tier:** value · **Profile:** `ongrid_value`

**Engineering status:** `WARNING` · **Fallback count:** 10 · **Explicit:** 1

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p2` | Adani Mono perc Bifacial 550W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,585 | Approve this component or name the correct one |
| INVERTER | `i87` | Foxess 1P 3.3kW | `EXPLICIT` | ACTIVE | ₹16,300 | Confirm the stored selection is the approved component |
| DCDB | `d2` | 1/1 DCDB ETN MCB 500v 32A + Mersen 600v SPD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹2,800 | Approve this component or name the correct one |
| ACDB | `a1` | ETN 32A + Mersen ACDB | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,600 | Approve this component or name the correct one |
| METER | `m2` | Genius Single Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,610 | Approve this component or name the correct one |
| DC_CABLE | `dc3` | DC-APAR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹55 | Approve this component or name the correct one |
| AC_CABLE | `ac2` | AC-RR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹65.25 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is1` | Honey Well Isolator 2P 40A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹212 | Approve this component or name the correct one |
| EARTHING | `cb4` | CB Rod 14mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec2` | 16sqmm Green Poluguards | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹24 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-3-1P-PREMIUM`

**System:** ongrid · **Size:** 3 · **Phase:** 1P · **Tier:** premium · **Profile:** `premium`

**Engineering status:** `WARNING` · **Fallback count:** 9 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p3` | Adani Bifacial Topcon G2S 620W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹15,934 | Approve this component or name the correct one |
| ACDB | `a5` | Enphase ACDB + AJ Box ABB MCB 16A 2P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹6,080 | Approve this component or name the correct one |
| METER | `m2` | Genius Single Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,610 | Approve this component or name the correct one |
| DC_CABLE | `dc4` | DC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹60 | Approve this component or name the correct one |
| AC_CABLE | `ac3` | AC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹56 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is1` | Honey Well Isolator 2P 40A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹212 | Approve this component or name the correct one |
| EARTHING | `cb5` | CB Rod 17.2mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec3` | 16sqmm Green Cable APAR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹29 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-5sp-1P-BASE`

**System:** ongrid · **Size:** 5sp · **Phase:** 1P · **Tier:** base · **Profile:** `ongrid_base`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p1` | Waaree Mono perc Bifacial 540W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,122 | Approve this component or name the correct one |
| INVERTER | `i4` | Growatt MIN 5000 TL-X | `FALLBACK_NEAREST_KW` | ACTIVE | ₹29,200 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d1` | 1/1 DCDB Havells MCB 500v 32A + Havells SPD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,525 | Approve this component or name the correct one |
| ACDB | `a1` | ETN 32A + Mersen ACDB | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,600 | Approve this component or name the correct one |
| METER | `m1` | Visiontek Single Phase Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,400 | Approve this component or name the correct one |
| DC_CABLE | `dc1` | DC-WACAB-Basic 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹43 | Approve this component or name the correct one |
| AC_CABLE | `ac1` | AC-RR 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is1` | Honey Well Isolator 2P 40A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹212 | Approve this component or name the correct one |
| EARTHING | `cb1` | CB Rod 14mm 100u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹260 | Approve this component or name the correct one |
| EARTHING | `ec1` | 16sqmm Green Cable FLEXGUARD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹21.6 | Approve this component or name the correct one |
| PROTECTION | `la2` | Kanberry FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-5sp-1P-VALUE`

**System:** ongrid · **Size:** 5sp · **Phase:** 1P · **Tier:** value · **Profile:** `ongrid_value`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p2` | Adani Mono perc Bifacial 550W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,585 | Approve this component or name the correct one |
| INVERTER | `i23` | Sungrow SG5K-D | `FALLBACK_NEAREST_KW` | ACTIVE | ₹30,600 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d2` | 1/1 DCDB ETN MCB 500v 32A + Mersen 600v SPD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹2,800 | Approve this component or name the correct one |
| ACDB | `a1` | ETN 32A + Mersen ACDB | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,600 | Approve this component or name the correct one |
| METER | `m2` | Genius Single Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,610 | Approve this component or name the correct one |
| DC_CABLE | `dc3` | DC-APAR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹55 | Approve this component or name the correct one |
| AC_CABLE | `ac2` | AC-RR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹65.25 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is1` | Honey Well Isolator 2P 40A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹212 | Approve this component or name the correct one |
| EARTHING | `cb4` | CB Rod 14mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec2` | 16sqmm Green Poluguards | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹24 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-5sp-1P-PREMIUM`

**System:** ongrid · **Size:** 5sp · **Phase:** 1P · **Tier:** premium · **Profile:** `premium`

**Engineering status:** `WARNING` · **Fallback count:** 9 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p3` | Adani Bifacial Topcon G2S 620W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹15,934 | Approve this component or name the correct one |
| ACDB | `a5` | Enphase ACDB + AJ Box ABB MCB 16A 2P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹6,080 | Approve this component or name the correct one |
| METER | `m2` | Genius Single Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,610 | Approve this component or name the correct one |
| DC_CABLE | `dc4` | DC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹60 | Approve this component or name the correct one |
| AC_CABLE | `ac3` | AC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹56 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is1` | Honey Well Isolator 2P 40A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹212 | Approve this component or name the correct one |
| EARTHING | `cb5` | CB Rod 17.2mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec3` | 16sqmm Green Cable APAR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹29 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-5tp-3P-BASE`

**System:** ongrid · **Size:** 5tp · **Phase:** 3P · **Tier:** base · **Profile:** `ongrid_base`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p1` | Waaree Mono perc Bifacial 540W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,122 | Approve this component or name the correct one |
| INVERTER | `i48` | DEYE On-Grid 3P 5kW | `FALLBACK_NEAREST_KW` | ACTIVE | ₹45,696 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d6` | 2/2 DCDB Havells MCB 500v + Havells SPD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,525 | Approve this component or name the correct one |
| ACDB | `a4` | ETN 32A Mersen 3P ACDB | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,700 | Approve this component or name the correct one |
| METER | `m3` | Visiontek Three Phase Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,950 | Approve this component or name the correct one |
| DC_CABLE | `dc1` | DC-WACAB-Basic 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹43 | Approve this component or name the correct one |
| AC_CABLE | `ac1` | AC-RR 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb1` | CB Rod 14mm 100u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹260 | Approve this component or name the correct one |
| EARTHING | `ec1` | 16sqmm Green Cable FLEXGUARD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹21.6 | Approve this component or name the correct one |
| PROTECTION | `la2` | Kanberry FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-5tp-3P-VALUE`

**System:** ongrid · **Size:** 5tp · **Phase:** 3P · **Tier:** value · **Profile:** `ongrid_value`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p2` | Adani Mono perc Bifacial 550W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,585 | Approve this component or name the correct one |
| INVERTER | `i24` | Sungrow SG5.0RT | `FALLBACK_NEAREST_KW` | ACTIVE | ₹54,500 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d7` | 2/2 DCDB ETN MCB 500v + Mersen 600v SPD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,700 | Approve this component or name the correct one |
| ACDB | `a4` | ETN 32A Mersen 3P ACDB | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,700 | Approve this component or name the correct one |
| METER | `m4` | Genius Three Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹4,650 | Approve this component or name the correct one |
| DC_CABLE | `dc3` | DC-APAR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹55 | Approve this component or name the correct one |
| AC_CABLE | `ac2` | AC-RR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹65.25 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb4` | CB Rod 14mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec2` | 16sqmm Green Poluguards | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹24 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-5tp-3P-PREMIUM`

**System:** ongrid · **Size:** 5tp · **Phase:** 3P · **Tier:** premium · **Profile:** `premium`

**Engineering status:** `WARNING` · **Fallback count:** 9 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p3` | Adani Bifacial Topcon G2S 620W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹15,934 | Approve this component or name the correct one |
| ACDB | `a6` | Enphase ACDB + AJ Box 3P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹9,585 | Approve this component or name the correct one |
| METER | `m4` | Genius Three Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹4,650 | Approve this component or name the correct one |
| DC_CABLE | `dc4` | DC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹60 | Approve this component or name the correct one |
| AC_CABLE | `ac3` | AC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹56 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb5` | CB Rod 17.2mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec3` | 16sqmm Green Cable APAR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹29 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-6-3P-BASE`

**System:** ongrid · **Size:** 6 · **Phase:** 3P · **Tier:** base · **Profile:** `ongrid_base`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p1` | Waaree Mono perc Bifacial 540W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,122 | Approve this component or name the correct one |
| INVERTER | `i5` | Growatt 5000 TL3-S | `FALLBACK_NEAREST_KW` | ACTIVE | ₹47,600 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d6` | 2/2 DCDB Havells MCB 500v + Havells SPD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,525 | Approve this component or name the correct one |
| ACDB | `a4` | ETN 32A Mersen 3P ACDB | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,700 | Approve this component or name the correct one |
| METER | `m3` | Visiontek Three Phase Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,950 | Approve this component or name the correct one |
| DC_CABLE | `dc1` | DC-WACAB-Basic 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹43 | Approve this component or name the correct one |
| AC_CABLE | `ac1` | AC-RR 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb1` | CB Rod 14mm 100u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹260 | Approve this component or name the correct one |
| EARTHING | `ec1` | 16sqmm Green Cable FLEXGUARD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹21.6 | Approve this component or name the correct one |
| PROTECTION | `la2` | Kanberry FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-6-3P-VALUE`

**System:** ongrid · **Size:** 6 · **Phase:** 3P · **Tier:** value · **Profile:** `ongrid_value`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p2` | Adani Mono perc Bifacial 550W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,585 | Approve this component or name the correct one |
| INVERTER | `i25` | Sungrow SG6.0RT | `FALLBACK_NEAREST_KW` | ACTIVE | ₹56,000 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d7` | 2/2 DCDB ETN MCB 500v + Mersen 600v SPD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,700 | Approve this component or name the correct one |
| ACDB | `a4` | ETN 32A Mersen 3P ACDB | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,700 | Approve this component or name the correct one |
| METER | `m4` | Genius Three Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹4,650 | Approve this component or name the correct one |
| DC_CABLE | `dc3` | DC-APAR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹55 | Approve this component or name the correct one |
| AC_CABLE | `ac2` | AC-RR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹65.25 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb4` | CB Rod 14mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec2` | 16sqmm Green Poluguards | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹24 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-6-3P-PREMIUM`

**System:** ongrid · **Size:** 6 · **Phase:** 3P · **Tier:** premium · **Profile:** `premium`

**Engineering status:** `WARNING` · **Fallback count:** 9 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p3` | Adani Bifacial Topcon G2S 620W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹15,934 | Approve this component or name the correct one |
| ACDB | `a6` | Enphase ACDB + AJ Box 3P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹9,585 | Approve this component or name the correct one |
| METER | `m4` | Genius Three Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹4,650 | Approve this component or name the correct one |
| DC_CABLE | `dc4` | DC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹60 | Approve this component or name the correct one |
| AC_CABLE | `ac3` | AC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹56 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb5` | CB Rod 17.2mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec3` | 16sqmm Green Cable APAR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹29 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-8-3P-BASE`

**System:** ongrid · **Size:** 8 · **Phase:** 3P · **Tier:** base · **Profile:** `ongrid_base`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p1` | Waaree Mono perc Bifacial 540W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,122 | Approve this component or name the correct one |
| INVERTER | `i7` | Growatt MOD 8000 TL3-X | `FALLBACK_NEAREST_KW` | ACTIVE | ₹53,200 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d6` | 2/2 DCDB Havells MCB 500v + Havells SPD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,525 | Approve this component or name the correct one |
| ACDB | `a4` | ETN 32A Mersen 3P ACDB | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,700 | Approve this component or name the correct one |
| METER | `m3` | Visiontek Three Phase Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,950 | Approve this component or name the correct one |
| DC_CABLE | `dc1` | DC-WACAB-Basic 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹43 | Approve this component or name the correct one |
| AC_CABLE | `ac1` | AC-RR 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb1` | CB Rod 14mm 100u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹260 | Approve this component or name the correct one |
| EARTHING | `ec1` | 16sqmm Green Cable FLEXGUARD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹21.6 | Approve this component or name the correct one |
| PROTECTION | `la2` | Kanberry FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-8-3P-VALUE`

**System:** ongrid · **Size:** 8 · **Phase:** 3P · **Tier:** value · **Profile:** `ongrid_value`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p2` | Adani Mono perc Bifacial 550W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,585 | Approve this component or name the correct one |
| INVERTER | `i26` | Sungrow SG8.0RT | `FALLBACK_NEAREST_KW` | ACTIVE | ₹58,500 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d7` | 2/2 DCDB ETN MCB 500v + Mersen 600v SPD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,700 | Approve this component or name the correct one |
| ACDB | `a4` | ETN 32A Mersen 3P ACDB | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,700 | Approve this component or name the correct one |
| METER | `m4` | Genius Three Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹4,650 | Approve this component or name the correct one |
| DC_CABLE | `dc3` | DC-APAR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹55 | Approve this component or name the correct one |
| AC_CABLE | `ac2` | AC-RR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹65.25 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb4` | CB Rod 14mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec2` | 16sqmm Green Poluguards | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹24 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-8-3P-PREMIUM`

**System:** ongrid · **Size:** 8 · **Phase:** 3P · **Tier:** premium · **Profile:** `premium`

**Engineering status:** `WARNING` · **Fallback count:** 9 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p3` | Adani Bifacial Topcon G2S 620W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹15,934 | Approve this component or name the correct one |
| ACDB | `a6` | Enphase ACDB + AJ Box 3P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹9,585 | Approve this component or name the correct one |
| METER | `m4` | Genius Three Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹4,650 | Approve this component or name the correct one |
| DC_CABLE | `dc4` | DC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹60 | Approve this component or name the correct one |
| AC_CABLE | `ac3` | AC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹56 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb5` | CB Rod 17.2mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec3` | 16sqmm Green Cable APAR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹29 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-10-3P-BASE`

**System:** ongrid · **Size:** 10 · **Phase:** 3P · **Tier:** base · **Profile:** `ongrid_base`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p1` | Waaree Mono perc Bifacial 540W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,122 | Approve this component or name the correct one |
| INVERTER | `i8` | Growatt MOD 10000 TL3-X | `FALLBACK_NEAREST_KW` | ACTIVE | ₹54,500 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d6` | 2/2 DCDB Havells MCB 500v + Havells SPD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,525 | Approve this component or name the correct one |
| ACDB | `a4` | ETN 32A Mersen 3P ACDB | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,700 | Approve this component or name the correct one |
| METER | `m3` | Visiontek Three Phase Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,950 | Approve this component or name the correct one |
| DC_CABLE | `dc1` | DC-WACAB-Basic 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹43 | Approve this component or name the correct one |
| AC_CABLE | `ac1` | AC-RR 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb1` | CB Rod 14mm 100u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹260 | Approve this component or name the correct one |
| EARTHING | `ec1` | 16sqmm Green Cable FLEXGUARD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹21.6 | Approve this component or name the correct one |
| PROTECTION | `la2` | Kanberry FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-10-3P-VALUE`

**System:** ongrid · **Size:** 10 · **Phase:** 3P · **Tier:** value · **Profile:** `ongrid_value`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p2` | Adani Mono perc Bifacial 550W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,585 | Approve this component or name the correct one |
| INVERTER | `i27` | Sungrow SG10.0RT | `FALLBACK_NEAREST_KW` | ACTIVE | ₹64,500 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d7` | 2/2 DCDB ETN MCB 500v + Mersen 600v SPD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,700 | Approve this component or name the correct one |
| ACDB | `a4` | ETN 32A Mersen 3P ACDB | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,700 | Approve this component or name the correct one |
| METER | `m4` | Genius Three Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹4,650 | Approve this component or name the correct one |
| DC_CABLE | `dc3` | DC-APAR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹55 | Approve this component or name the correct one |
| AC_CABLE | `ac2` | AC-RR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹65.25 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb4` | CB Rod 14mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec2` | 16sqmm Green Poluguards | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹24 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-ONGRID-10-3P-PREMIUM`

**System:** ongrid · **Size:** 10 · **Phase:** 3P · **Tier:** premium · **Profile:** `premium`

**Engineering status:** `WARNING` · **Fallback count:** 9 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p3` | Adani Bifacial Topcon G2S 620W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹15,934 | Approve this component or name the correct one |
| ACDB | `a6` | Enphase ACDB + AJ Box 3P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹9,585 | Approve this component or name the correct one |
| METER | `m4` | Genius Three Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹4,650 | Approve this component or name the correct one |
| DC_CABLE | `dc4` | DC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹60 | Approve this component or name the correct one |
| AC_CABLE | `ac3` | AC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹56 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb5` | CB Rod 17.2mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec3` | 16sqmm Green Cable APAR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹29 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

---

# HYBRID PACKAGES


## `PKG-HYBRID-3-1P-BASE`

**System:** hybrid · **Size:** 3 · **Phase:** 1P · **Tier:** base · **Profile:** `hybrid_base`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p1` | Waaree Mono perc Bifacial 540W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,122 | Approve this component or name the correct one |
| INVERTER | `i56` | Deye Hybrid 1P 3-48v | `FALLBACK_NEAREST_KW` | ACTIVE | ₹67,100 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d9` | 1/1 DCDB ABB MCB 500v 32A + Citel 500v SPD + Fuses (Hybrid) | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,226 | Approve this component or name the correct one |
| ACDB | `a7` | ACDB WITH CHANGE OVER SWITCH 1PH Hybrid | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹8,100 | Approve this component or name the correct one |
| METER | `m1` | Visiontek Single Phase Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,400 | Approve this component or name the correct one |
| DC_CABLE | `dc1` | DC-WACAB-Basic 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹43 | Approve this component or name the correct one |
| AC_CABLE | `ac1` | AC-RR 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is1` | Honey Well Isolator 2P 40A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹212 | Approve this component or name the correct one |
| EARTHING | `cb1` | CB Rod 14mm 100u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹260 | Approve this component or name the correct one |
| EARTHING | `ec1` | 16sqmm Green Cable FLEXGUARD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹21.6 | Approve this component or name the correct one |
| PROTECTION | `la2` | Kanberry FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| BATTERY | — | — | `NOT_MODELLED` | — | — | C32 — profile declares none |
| BATTERY_PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — no candidate for this tier |
| BATTERY_CABLE | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| CHANGEOVER | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-HYBRID-3-1P-VALUE`

**System:** hybrid · **Size:** 3 · **Phase:** 1P · **Tier:** value · **Profile:** `hybrid_value`

**Engineering status:** `WARNING` · **Fallback count:** 12 · **Explicit:** 1

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p3` | Adani Bifacial Topcon G2S 620W DCR | `EXPLICIT` | ACTIVE | ₹15,934 | Confirm the stored selection is the approved component |
| INVERTER | `i56` | Deye Hybrid 1P 3-48v | `FALLBACK_NEAREST_KW` | ACTIVE | ₹67,100 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d9` | 1/1 DCDB ABB MCB 500v 32A + Citel 500v SPD + Fuses (Hybrid) | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,226 | Approve this component or name the correct one |
| ACDB | `a7` | ACDB WITH CHANGE OVER SWITCH 1PH Hybrid | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹8,100 | Approve this component or name the correct one |
| BATTERY_PROTECTION | `mb1` | Battery MCCB Box 160A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹8,500 | Approve this component or name the correct one |
| BATTERY | `bt1` | SEG.5 PRO 100AH LV Battery | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹86,717 | Approve this component or name the correct one |
| METER | `m2` | Genius Single Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,610 | Approve this component or name the correct one |
| DC_CABLE | `dc3` | DC-APAR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹55 | Approve this component or name the correct one |
| AC_CABLE | `ac2` | AC-RR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹65.25 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is1` | Honey Well Isolator 2P 40A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹212 | Approve this component or name the correct one |
| EARTHING | `cb4` | CB Rod 14mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec2` | 16sqmm Green Poluguards | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹24 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| BATTERY_CABLE | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| CHANGEOVER | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-HYBRID-3-1P-PREMIUM`

**System:** hybrid · **Size:** 3 · **Phase:** 1P · **Tier:** premium · **Profile:** `hybrid_premium`

**Engineering status:** `WARNING` · **Fallback count:** 10 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p3` | Adani Bifacial Topcon G2S 620W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹15,934 | Approve this component or name the correct one |
| ACDB | `ac_hyb_en1p` | ACDB Hybrid Enphase 1Ph (ABB MCB+Citel SPD) | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,500 | Approve this component or name the correct one |
| BATTERY | `bt2` | Enphase Flex Battery | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹95,000 | Approve this component or name the correct one |
| METER | `m2` | Genius Single Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,610 | Approve this component or name the correct one |
| DC_CABLE | `dc4` | DC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹60 | Approve this component or name the correct one |
| AC_CABLE | `ac3` | AC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹56 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is1` | Honey Well Isolator 2P 40A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹212 | Approve this component or name the correct one |
| EARTHING | `cb5` | CB Rod 17.2mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec3` | 16sqmm Green Cable APAR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹29 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| BATTERY_PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — no candidate for this tier |
| BATTERY_CABLE | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| CHANGEOVER | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-HYBRID-5-1P-BASE`

**System:** hybrid · **Size:** 5 · **Phase:** 1P · **Tier:** base · **Profile:** `hybrid_base`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p1` | Waaree Mono perc Bifacial 540W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,122 | Approve this component or name the correct one |
| INVERTER | `i58` | Deye Hybrid 1P 5-48v | `FALLBACK_NEAREST_KW` | ACTIVE | ₹81,730 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d9` | 1/1 DCDB ABB MCB 500v 32A + Citel 500v SPD + Fuses (Hybrid) | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,226 | Approve this component or name the correct one |
| ACDB | `a7` | ACDB WITH CHANGE OVER SWITCH 1PH Hybrid | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹8,100 | Approve this component or name the correct one |
| METER | `m1` | Visiontek Single Phase Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,400 | Approve this component or name the correct one |
| DC_CABLE | `dc1` | DC-WACAB-Basic 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹43 | Approve this component or name the correct one |
| AC_CABLE | `ac1` | AC-RR 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is1` | Honey Well Isolator 2P 40A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹212 | Approve this component or name the correct one |
| EARTHING | `cb1` | CB Rod 14mm 100u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹260 | Approve this component or name the correct one |
| EARTHING | `ec1` | 16sqmm Green Cable FLEXGUARD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹21.6 | Approve this component or name the correct one |
| PROTECTION | `la2` | Kanberry FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| BATTERY | — | — | `NOT_MODELLED` | — | — | C32 — profile declares none |
| BATTERY_PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — no candidate for this tier |
| BATTERY_CABLE | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| CHANGEOVER | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-HYBRID-5-1P-VALUE`

**System:** hybrid · **Size:** 5 · **Phase:** 1P · **Tier:** value · **Profile:** `hybrid_value`

**Engineering status:** `WARNING` · **Fallback count:** 13 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p2` | Adani Mono perc Bifacial 550W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,585 | Approve this component or name the correct one |
| INVERTER | `i58` | Deye Hybrid 1P 5-48v | `FALLBACK_NEAREST_KW` | ACTIVE | ₹81,730 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d9` | 1/1 DCDB ABB MCB 500v 32A + Citel 500v SPD + Fuses (Hybrid) | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,226 | Approve this component or name the correct one |
| ACDB | `a7` | ACDB WITH CHANGE OVER SWITCH 1PH Hybrid | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹8,100 | Approve this component or name the correct one |
| BATTERY_PROTECTION | `mb1` | Battery MCCB Box 160A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹8,500 | Approve this component or name the correct one |
| BATTERY | `bt1` | SEG.5 PRO 100AH LV Battery | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹86,717 | Approve this component or name the correct one |
| METER | `m2` | Genius Single Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,610 | Approve this component or name the correct one |
| DC_CABLE | `dc3` | DC-APAR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹55 | Approve this component or name the correct one |
| AC_CABLE | `ac2` | AC-RR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹65.25 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is1` | Honey Well Isolator 2P 40A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹212 | Approve this component or name the correct one |
| EARTHING | `cb4` | CB Rod 14mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec2` | 16sqmm Green Poluguards | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹24 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| BATTERY_CABLE | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| CHANGEOVER | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-HYBRID-5-1P-PREMIUM`

**System:** hybrid · **Size:** 5 · **Phase:** 1P · **Tier:** premium · **Profile:** `hybrid_premium`

**Engineering status:** `WARNING` · **Fallback count:** 10 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p3` | Adani Bifacial Topcon G2S 620W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹15,934 | Approve this component or name the correct one |
| ACDB | `ac_hyb_en1p` | ACDB Hybrid Enphase 1Ph (ABB MCB+Citel SPD) | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,500 | Approve this component or name the correct one |
| BATTERY | `bt2` | Enphase Flex Battery | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹95,000 | Approve this component or name the correct one |
| METER | `m2` | Genius Single Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹1,610 | Approve this component or name the correct one |
| DC_CABLE | `dc4` | DC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹60 | Approve this component or name the correct one |
| AC_CABLE | `ac3` | AC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹56 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is1` | Honey Well Isolator 2P 40A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹212 | Approve this component or name the correct one |
| EARTHING | `cb5` | CB Rod 17.2mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec3` | 16sqmm Green Cable APAR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹29 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| BATTERY_PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — no candidate for this tier |
| BATTERY_CABLE | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| CHANGEOVER | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-HYBRID-8-3P-BASE`

**System:** hybrid · **Size:** 8 · **Phase:** 3P · **Tier:** base · **Profile:** `hybrid_base`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p1` | Waaree Mono perc Bifacial 540W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,122 | Approve this component or name the correct one |
| INVERTER | `i60` | Deye Hybrid 3P 8-48v | `FALLBACK_NEAREST_KW` | ACTIVE | ₹152,719 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d10` | 2/2 DCDB ABB MCB 500v + Mersen 500v SPD + Fuses (Hybrid 3P) | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹5,594 | Approve this component or name the correct one |
| ACDB | `a8` | ACDB Hybrid 3PH | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹12,100 | Approve this component or name the correct one |
| METER | `m3` | Visiontek Three Phase Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,950 | Approve this component or name the correct one |
| DC_CABLE | `dc1` | DC-WACAB-Basic 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹43 | Approve this component or name the correct one |
| AC_CABLE | `ac1` | AC-RR 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb1` | CB Rod 14mm 100u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹260 | Approve this component or name the correct one |
| EARTHING | `ec1` | 16sqmm Green Cable FLEXGUARD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹21.6 | Approve this component or name the correct one |
| PROTECTION | `la2` | Kanberry FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| BATTERY | — | — | `NOT_MODELLED` | — | — | C32 — profile declares none |
| BATTERY_PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — no candidate for this tier |
| BATTERY_CABLE | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| CHANGEOVER | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-HYBRID-8-3P-VALUE`

**System:** hybrid · **Size:** 8 · **Phase:** 3P · **Tier:** value · **Profile:** `hybrid_value`

**Engineering status:** `WARNING` · **Fallback count:** 13 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p2` | Adani Mono perc Bifacial 550W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,585 | Approve this component or name the correct one |
| INVERTER | `i60` | Deye Hybrid 3P 8-48v | `FALLBACK_NEAREST_KW` | ACTIVE | ₹152,719 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d10` | 2/2 DCDB ABB MCB 500v + Mersen 500v SPD + Fuses (Hybrid 3P) | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹5,594 | Approve this component or name the correct one |
| ACDB | `a8` | ACDB Hybrid 3PH | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹12,100 | Approve this component or name the correct one |
| BATTERY_PROTECTION | `mb1` | Battery MCCB Box 160A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹8,500 | Approve this component or name the correct one |
| BATTERY | `bt1` | SEG.5 PRO 100AH LV Battery | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹86,717 | Approve this component or name the correct one |
| METER | `m4` | Genius Three Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹4,650 | Approve this component or name the correct one |
| DC_CABLE | `dc3` | DC-APAR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹55 | Approve this component or name the correct one |
| AC_CABLE | `ac2` | AC-RR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹65.25 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb4` | CB Rod 14mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec2` | 16sqmm Green Poluguards | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹24 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| BATTERY_CABLE | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| CHANGEOVER | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-HYBRID-8-3P-PREMIUM`

**System:** hybrid · **Size:** 8 · **Phase:** 3P · **Tier:** premium · **Profile:** `hybrid_premium`

**Engineering status:** `WARNING` · **Fallback count:** 10 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p3` | Adani Bifacial Topcon G2S 620W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹15,934 | Approve this component or name the correct one |
| ACDB | `ac_hyb_en3p` | ACDB Hybrid Enphase 3Ph (ABB MCB+Citel SPD) | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹10,612 | Approve this component or name the correct one |
| BATTERY | `bt2` | Enphase Flex Battery | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹95,000 | Approve this component or name the correct one |
| METER | `m4` | Genius Three Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹4,650 | Approve this component or name the correct one |
| DC_CABLE | `dc4` | DC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹60 | Approve this component or name the correct one |
| AC_CABLE | `ac3` | AC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹56 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb5` | CB Rod 17.2mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec3` | 16sqmm Green Cable APAR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹29 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| BATTERY_PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — no candidate for this tier |
| BATTERY_CABLE | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| CHANGEOVER | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-HYBRID-10-3P-BASE`

**System:** hybrid · **Size:** 10 · **Phase:** 3P · **Tier:** base · **Profile:** `hybrid_base`

**Engineering status:** `WARNING` · **Fallback count:** 11 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p1` | Waaree Mono perc Bifacial 540W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,122 | Approve this component or name the correct one |
| INVERTER | `i61` | Deye Hybrid 3P 10-48v | `FALLBACK_NEAREST_KW` | ACTIVE | ₹162,136 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d10` | 2/2 DCDB ABB MCB 500v + Mersen 500v SPD + Fuses (Hybrid 3P) | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹5,594 | Approve this component or name the correct one |
| ACDB | `a8` | ACDB Hybrid 3PH | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹12,100 | Approve this component or name the correct one |
| METER | `m3` | Visiontek Three Phase Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹3,950 | Approve this component or name the correct one |
| DC_CABLE | `dc1` | DC-WACAB-Basic 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹43 | Approve this component or name the correct one |
| AC_CABLE | `ac1` | AC-RR 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb1` | CB Rod 14mm 100u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹260 | Approve this component or name the correct one |
| EARTHING | `ec1` | 16sqmm Green Cable FLEXGUARD | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹21.6 | Approve this component or name the correct one |
| PROTECTION | `la2` | Kanberry FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹58 | Approve this component or name the correct one |
| BATTERY | — | — | `NOT_MODELLED` | — | — | C32 — profile declares none |
| BATTERY_PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — no candidate for this tier |
| BATTERY_CABLE | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| CHANGEOVER | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-HYBRID-10-3P-VALUE`

**System:** hybrid · **Size:** 10 · **Phase:** 3P · **Tier:** value · **Profile:** `hybrid_value`

**Engineering status:** `WARNING` · **Fallback count:** 13 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p2` | Adani Mono perc Bifacial 550W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹13,585 | Approve this component or name the correct one |
| INVERTER | `i61` | Deye Hybrid 3P 10-48v | `FALLBACK_NEAREST_KW` | ACTIVE | ₹162,136 | Approve inverter for this size, or confirm nearest-kW is acceptable |
| DCDB | `d10` | 2/2 DCDB ABB MCB 500v + Mersen 500v SPD + Fuses (Hybrid 3P) | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹5,594 | Approve this component or name the correct one |
| ACDB | `a8` | ACDB Hybrid 3PH | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹12,100 | Approve this component or name the correct one |
| BATTERY_PROTECTION | `mb1` | Battery MCCB Box 160A | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹8,500 | Approve this component or name the correct one |
| BATTERY | `bt1` | SEG.5 PRO 100AH LV Battery | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹86,717 | Approve this component or name the correct one |
| METER | `m4` | Genius Three Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹4,650 | Approve this component or name the correct one |
| DC_CABLE | `dc3` | DC-APAR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹55 | Approve this component or name the correct one |
| AC_CABLE | `ac2` | AC-RR 6sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹65.25 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb4` | CB Rod 14mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec2` | 16sqmm Green Poluguards | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹24 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| BATTERY_CABLE | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| CHANGEOVER | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

## `PKG-HYBRID-10-3P-PREMIUM`

**System:** hybrid · **Size:** 10 · **Phase:** 3P · **Tier:** premium · **Profile:** `hybrid_premium`

**Engineering status:** `WARNING` · **Fallback count:** 10 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | `p3` | Adani Bifacial Topcon G2S 620W DCR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹15,934 | Approve this component or name the correct one |
| ACDB | `ac_hyb_en3p` | ACDB Hybrid Enphase 3Ph (ABB MCB+Citel SPD) | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹10,612 | Approve this component or name the correct one |
| BATTERY | `bt2` | Enphase Flex Battery | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹95,000 | Approve this component or name the correct one |
| METER | `m4` | Genius Three Phase Energy Meter | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹4,650 | Approve this component or name the correct one |
| DC_CABLE | `dc4` | DC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹60 | Approve this component or name the correct one |
| AC_CABLE | `ac3` | AC-POLY 4sqmm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹56 | Approve this component or name the correct one |
| AC_ISOLATOR (untyped) | `is2` | L&T Isolator 40A 4P | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹623 | Approve this component or name the correct one |
| EARTHING | `cb5` | CB Rod 17.2mm 250u 1.2m | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹900 | Approve this component or name the correct one |
| EARTHING | `ec3` | 16sqmm Green Cable APAR | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹29 | Approve this component or name the correct one |
| PROTECTION | `la1` | Excel FLX Al Down conductor 8mm | `FALLBACK_FIRST_AVAILABLE` | ACTIVE | ₹72 | Approve this component or name the correct one |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| BATTERY_PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — no candidate for this tier |
| BATTERY_CABLE | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| CHANGEOVER | — | — | `NOT_MODELLED` | — | — | C32 — uncategorised fixedItem |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |

---

# UPGRADE PACKAGES


## `PKG-UPGRADE-UPG-3-5-BASE`

**System:** upgrade · **Size:** 5 · **Phase:** 1P · **Tier:** base · **Profile:** `ongrid_base` · **Path:** `UPG-3-5` (3→5 kW)

**Engineering status:** `VALID` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | C32 —  |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-3-5-VALUE`

**System:** upgrade · **Size:** 5 · **Phase:** 1P · **Tier:** value · **Profile:** `ongrid_value` · **Path:** `UPG-3-5` (3→5 kW)

**Engineering status:** `VALID` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | C32 —  |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-3-5-PREMIUM`

**System:** upgrade · **Size:** 5 · **Phase:** 1P · **Tier:** premium · **Profile:** `premium` · **Path:** `UPG-3-5` (3→5 kW)

**Engineering status:** `VALID` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-3-6-BASE`

**System:** upgrade · **Size:** 6 · **Phase:** 1P · **Tier:** base · **Profile:** `ongrid_base` · **Path:** `UPG-3-6` (3→6 kW)

**Engineering status:** `WARNING` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | C32 —  |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-3-6-VALUE`

**System:** upgrade · **Size:** 6 · **Phase:** 1P · **Tier:** value · **Profile:** `ongrid_value` · **Path:** `UPG-3-6` (3→6 kW)

**Engineering status:** `WARNING` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | C32 —  |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-3-6-PREMIUM`

**System:** upgrade · **Size:** 6 · **Phase:** 1P · **Tier:** premium · **Profile:** `premium` · **Path:** `UPG-3-6` (3→6 kW)

**Engineering status:** `WARNING` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-3-8-BASE`

**System:** upgrade · **Size:** 8 · **Phase:** 1P · **Tier:** base · **Profile:** `ongrid_base` · **Path:** `UPG-3-8` (3→8 kW)

**Engineering status:** `WARNING` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | C32 —  |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-3-8-VALUE`

**System:** upgrade · **Size:** 8 · **Phase:** 1P · **Tier:** value · **Profile:** `ongrid_value` · **Path:** `UPG-3-8` (3→8 kW)

**Engineering status:** `WARNING` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | C32 —  |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-3-8-PREMIUM`

**System:** upgrade · **Size:** 8 · **Phase:** 1P · **Tier:** premium · **Profile:** `premium` · **Path:** `UPG-3-8` (3→8 kW)

**Engineering status:** `WARNING` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-5-8-BASE`

**System:** upgrade · **Size:** 8 · **Phase:** 1P · **Tier:** base · **Profile:** `ongrid_base` · **Path:** `UPG-5-8` (5→8 kW)

**Engineering status:** `VALID` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | C32 —  |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-5-8-VALUE`

**System:** upgrade · **Size:** 8 · **Phase:** 1P · **Tier:** value · **Profile:** `ongrid_value` · **Path:** `UPG-5-8` (5→8 kW)

**Engineering status:** `VALID` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | C32 —  |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-5-8-PREMIUM`

**System:** upgrade · **Size:** 8 · **Phase:** 1P · **Tier:** premium · **Profile:** `premium` · **Path:** `UPG-5-8` (5→8 kW)

**Engineering status:** `VALID` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-5-10-BASE`

**System:** upgrade · **Size:** 10 · **Phase:** 1P · **Tier:** base · **Profile:** `ongrid_base` · **Path:** `UPG-5-10` (5→10 kW)

**Engineering status:** `VALID` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | C32 —  |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-5-10-VALUE`

**System:** upgrade · **Size:** 10 · **Phase:** 1P · **Tier:** value · **Profile:** `ongrid_value` · **Path:** `UPG-5-10` (5→10 kW)

**Engineering status:** `VALID` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | C32 —  |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-5-10-PREMIUM`

**System:** upgrade · **Size:** 10 · **Phase:** 1P · **Tier:** premium · **Profile:** `premium` · **Path:** `UPG-5-10` (5→10 kW)

**Engineering status:** `VALID` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-8-10-BASE`

**System:** upgrade · **Size:** 10 · **Phase:** 1P · **Tier:** base · **Profile:** `ongrid_base` · **Path:** `UPG-8-10` (8→10 kW)

**Engineering status:** `VALID` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | C32 —  |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-8-10-VALUE`

**System:** upgrade · **Size:** 10 · **Phase:** 1P · **Tier:** value · **Profile:** `ongrid_value` · **Path:** `UPG-8-10` (8→10 kW)

**Engineering status:** `VALID` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | C32 —  |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

## `PKG-UPGRADE-UPG-8-10-PREMIUM`

**System:** upgrade · **Size:** 10 · **Phase:** 1P · **Tier:** premium · **Profile:** `premium` · **Path:** `UPG-8-10` (8→10 kW)

**Engineering status:** `VALID` · **Fallback count:** 0 · **Explicit:** 0

| Role | componentId | Display name | derivedBy | Status | Price | Engineering decision required |
|---|---|---|---|---|---|---|
| PANEL | — | — | `NOT_MODELLED` | — | — | C32 —  |
| INVERTER | — | — | `NOT_MODELLED` | — | — | Premium is micro-inverter architecture (C5) — no central inverter by design; confirm |
| MICRO_INVERTER | — | — | `NOT_MODELLED` | — | — | C32 — emitted as `enphase` accessories, name-matched |
| AC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — untyped `isolator` |
| DC_ISOLATOR | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| ACDB | — | — | `NOT_MODELLED` | — | — | C32 —  |
| DCDB | — | — | `NOT_MODELLED` | — | — | Premium emits no DCDB (`premiumQty`=0) — confirm this is correct for micro architecture |
| STRUCTURE | — | — | `NOT_MODELLED` | — | — | C32 — from structureTemplates |
| MONITORING | — | — | `NOT_MODELLED` | — | — | C32 — no category exists |
| PROTECTION | — | — | `NOT_MODELLED` | — | — | C32 — LA conductor only |
| EARTHING | — | — | `NOT_MODELLED` | — | — | C32 — partly `earth_cable`/`cb_rod` |

---

## Totals

- Packages: **48**
- Components resolved: **322**
- `EXPLICIT`: **3**
- Fallback of all kinds: **319**
- Packages with zero fallback: **0** (target 48)
- Engineering status: VALID 12 · WARNING 36 · BLOCKED 0

- Components APPROVED by decision: **34** (`is1` D11-A · `is2` D11-B · `bt2` D12)
- Components still PROPOSED: **288**
- Packages fully approved: **0** of 48

**BLOCKED: 0.** All 16 previous blockers (14 isolator, 4 premium MCCB) are resolved by decisions D11 and D12.

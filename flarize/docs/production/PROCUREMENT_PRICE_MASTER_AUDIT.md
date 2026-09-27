# Procurement Price Master Audit

**Date:** 2026-08-29  
**Phase:** Pre-procurement data entry  
**Scope:** Complete component inventory, deduplication, price source classification, priority lists, landed cost schema, import readiness

---

## 1. Summary

| Metric | Count |
|---|---|
| Total unique component IDs (catalog + fixed) | 304 |
| Catalog category items | 257 |
| Fixed BOM items (fi_*) | 47 |
| **Components actually used in production BOMs** | **112** |
| Components with verified procurement cost | **0** |
| Components with historical procurement cost | **0** |
| Components missing procurement cost | **112** |
| P1 components (priority quotation set) | 68 |
| P2 components (other selectable packages) | 44 |
| P3 components (unused catalog items — no procurement needed) | 192 |

---

## 2. Component Inventory — All 112 BOM-Used Components

### 2A. Catalog Components Used in BOMs (65)

| # | componentId | Name | Category | Used In Systems | Ref Price (₹) | Procurement Status |
|---|---|---|---|---|---|---|
| 1 | p1 | Waaree Mono perc Bifacial 540W DCR | panel | ongrid | 13,122 | ❌ MISSING |
| 2 | p2 | Adani Mono perc Bifacial 550W DCR | panel | ongrid, hybrid | 13,585 | ❌ MISSING |
| 3 | p3 | Adani Bifacial Topcon G2S 620W DCR | panel | ongrid, hybrid | 15,934 | ❌ MISSING |
| 4 | i1 | Growatt MIC 3000TL-X | inverter | ongrid | 16,600 | ❌ MISSING |
| 5 | i4 | Growatt MIN 5000 TL-X | inverter | ongrid | 29,200 | ❌ MISSING |
| 6 | i5 | Growatt 5000 TL3-S | inverter | ongrid | 47,600 | ❌ MISSING |
| 7 | i7 | Growatt MOD 8000 TL3-X | inverter | ongrid | 53,200 | ❌ MISSING |
| 8 | i8 | Growatt MOD 10000 TL3-X | inverter | ongrid | 54,500 | ❌ MISSING |
| 9 | i20 | Sungrow SG 3.0RT | inverter | ongrid, hybrid | 18,250 | ❌ MISSING |
| 10 | i23 | Sungrow SG5K-D | inverter | ongrid | 30,600 | ❌ MISSING |
| 11 | i24 | Sungrow SG5.0RT | inverter | ongrid | 54,500 | ❌ MISSING |
| 12 | i25 | Sungrow SG6.0RT | inverter | ongrid | 56,000 | ❌ MISSING |
| 13 | i26 | Sungrow SG8.0RT | inverter | ongrid | 58,500 | ❌ MISSING |
| 14 | i27 | Sungrow SG10.0RT | inverter | ongrid, hybrid | 64,500 | ❌ MISSING |
| 15 | i48 | DEYE On-Grid 3P 5kW | inverter | ongrid | 45,696 | ❌ MISSING |
| 16 | i56 | Deye Hybrid 1P 3-48v | inverter | hybrid | 67,100 | ❌ MISSING |
| 17 | i58 | Deye Hybrid 1P 5-48v | inverter | hybrid | 81,730 | ❌ MISSING |
| 18 | i60 | Deye Hybrid 3P 8-48v | inverter | hybrid | 152,719 | ❌ MISSING |
| 19 | i61 | Deye Hybrid 3P 10-48v | inverter | hybrid | 162,136 | ❌ MISSING |
| 20 | d1 | 1/1 DCDB Havells MCB 500v 32A + Havells SPD | dcdb | ongrid | 1,525 | ❌ MISSING |
| 21 | d2 | 1/1 DCDB ETN MCB 500v 32A + Mersen 600v SPD | dcdb | ongrid, hybrid | 2,800 | ❌ MISSING |
| 22 | d6 | 2/2 DCDB Havells MCB 500v + Havells SPD | dcdb | ongrid | 1,525 | ❌ MISSING |
| 23 | d7 | 2/2 DCDB ETN MCB 500v + Mersen 600v SPD | dcdb | ongrid, hybrid | 3,700 | ❌ MISSING |
| 24 | d9 | 1/1 DCDB ABB MCB 500v + Citel SPD + Fuses (Hybrid) | dcdb | hybrid | 3,226 | ❌ MISSING |
| 25 | d10 | 2/2 DCDB ABB MCB 500v + Mersen SPD + Fuses (Hybrid 3P) | dcdb | hybrid | 5,594 | ❌ MISSING |
| 26 | a1 | ETN 32A + Mersen ACDB | acdb | ongrid, hybrid | 1,600 | ❌ MISSING |
| 27 | a4 | ETN 32A Mersen 3P ACDB | acdb | ongrid | 3,700 | ❌ MISSING |
| 28 | a5 | Enphase ACDB + AJ Box ABB MCB 16A 2P | acdb | ongrid | 6,080 | ❌ MISSING |
| 29 | a6 | Enphase ACDB + AJ Box 3P | acdb | ongrid | 9,585 | ❌ MISSING |
| 30 | a7 | ACDB WITH CHANGE OVER SWITCH 1PH Hybrid | acdb | hybrid | 8,100 | ❌ MISSING |
| 31 | a8 | ACDB Hybrid 3PH | acdb | hybrid | 12,100 | ❌ MISSING |
| 32 | ac_hyb_en1p | ACDB Hybrid Enphase 1Ph | acdb | hybrid | 3,500 | ❌ MISSING |
| 33 | ac_hyb_en3p | ACDB Hybrid Enphase 3Ph | acdb | hybrid | 10,612 | ❌ MISSING |
| 34 | m1 | Visiontek Single Phase Meter | meter | ongrid | 1,400 | ❌ MISSING |
| 35 | m2 | Genius Single Phase Energy Meter | meter | ongrid, hybrid | 1,610 | ❌ MISSING |
| 36 | m3 | Visiontek Three Phase Meter | meter | ongrid | 3,950 | ❌ MISSING |
| 37 | m4 | Genius Three Phase Energy Meter | meter | ongrid, hybrid | 4,650 | ❌ MISSING |
| 38 | dc1 | DC-WACAB-Basic 4sqmm | dc_cable | ongrid | 43/m | ❌ MISSING |
| 39 | dc3 | DC-APAR 6sqmm | dc_cable | ongrid, hybrid | 55/m | ❌ MISSING |
| 40 | dc4 | DC-POLY 4sqmm | dc_cable | ongrid | 60/m | ❌ MISSING |
| 41 | ac1 | AC-RR 4sqmm | ac_cable | ongrid | 58/m | ❌ MISSING |
| 42 | ac2 | AC-RR 6sqmm | ac_cable | ongrid, hybrid | 65.25/m | ❌ MISSING |
| 43 | ac3 | AC-POLY 4sqmm | ac_cable | ongrid | 56/m | ❌ MISSING |
| 44 | is1 | Honey Well Isolator 2P 40A | isolator | ongrid, hybrid | 212 | ❌ MISSING |
| 45 | is2 | L&T Isolator 40A 4P | isolator | ongrid, hybrid | 623 | ❌ MISSING |
| 46 | cb1 | CB Rod 14mm 100u 1.2m | cb_rod | ongrid | 260 | ❌ MISSING |
| 47 | cb4 | CB Rod 14mm 250u 1.2m | cb_rod | ongrid, hybrid | 900 | ❌ MISSING |
| 48 | cb5 | CB Rod 17.2mm 250u 1.2m | cb_rod | ongrid | 900 | ❌ MISSING |
| 49 | ec1 | 16sqmm Green Cable FLEXGUARD | earth_cable | ongrid | 21.6/m | ❌ MISSING |
| 50 | ec2 | 16sqmm Green Poluguards | earth_cable | ongrid, hybrid | 24/m | ❌ MISSING |
| 51 | ec3 | 16sqmm Green Cable APAR | earth_cable | ongrid | 29/m | ❌ MISSING |
| 52 | la1 | Excel FLX Al Down conductor 8mm | la_cable | ongrid, hybrid | 72/m | ❌ MISSING |
| 53 | la2 | Kanberry FLX Al Down conductor 8mm | la_cable | ongrid | 58/m | ❌ MISSING |
| 54 | bt1 | SEG.5 PRO 100AH LV Battery | battery | hybrid | 86,717 | ❌ MISSING |
| 55 | bt2 | Enphase Flex Battery | battery | hybrid | 95,000 | ❌ MISSING |
| 56 | mb1 | Battery MCCB Box 160A | mccb_box | hybrid | 8,500 | ❌ MISSING |
| 57 | ug_2core | UG Cable 2 Core Armoured | ug_cable | ongrid, hybrid | 150/m | ❌ MISSING |
| 58 | ug_4core | UG Cable 4 Core Armoured | ug_cable | ongrid, hybrid | 250/m | ❌ MISSING |
| 59 | en1 | Enphase IQ8P Micro Inverter | enphase | ongrid, hybrid | 8,200 | ❌ MISSING |
| 60 | en2 | Enphase Q Cable Portrait 2m | enphase | ongrid, hybrid | 750 | ❌ MISSING |
| 61 | en3 | Enphase Envoy S Metered | enphase | ongrid, hybrid | 12,610 | ❌ MISSING |
| 62 | en4 | Enphase Q Relay | enphase | ongrid, hybrid | 5,150 | ❌ MISSING |
| 63 | en5 | Enphase Q Terminal | enphase | ongrid, hybrid | 700 | ❌ MISSING |
| 64 | en6 | Enphase CT 200 | enphase | ongrid, hybrid | 1,500 | ❌ MISSING |
| 65 | en7 | Enphase System Controller | enphase | ongrid, hybrid | 110,000 | ❌ MISSING |

### 2B. Fixed BOM Components (47)

| # | componentId | Name | Used In | Ref Price (₹) | Procurement Status |
|---|---|---|---|---|---|
| 1 | fi_mc4_connector | MC4 Connector | ongrid, hybrid | 56 | ❌ MISSING |
| 2 | fi_cable_tray | Cable Tray | ongrid, hybrid | 186 | ❌ MISSING |
| 3 | fi_earthing_copper_10swg | 10 SWG Earthing Copper | ongrid, hybrid | 105 | ❌ MISSING |
| 4 | fi_ss_terminal_4p | SS Terminal Strip 4P | ongrid | 150 | ❌ MISSING |
| 5 | fi_ss_terminal_4p_excel | SS Terminal Strip 4P Excel | hybrid | 150 | ❌ MISSING |
| 6 | fi_earthing_chamber | Earthing Chamber 180x180mm | ongrid, hybrid | 270 | ❌ MISSING |
| 7 | fi_lightning_arrester | Lightning Arrester 16mm 1m | ongrid, hybrid | 600 | ❌ MISSING |
| 8 | fi_flexible_pipe | Flexible Pipe | ongrid, hybrid | 49 | ❌ MISSING |
| 9 | fi_earth_pit_compound | Earth Pit Compound | ongrid, hybrid | 167 | ❌ MISSING |
| 10 | fi_cable_tie_300mm | Cable Tie 300mm WR | ongrid, hybrid | 320 | ❌ MISSING |
| 11 | fi_ss_screw_1_5in | SS Star Screw 1.5in | ongrid, hybrid | 1 | ❌ MISSING |
| 12 | fi_ss_screw_1in | SS Star Screw 1in | ongrid, hybrid | 1.7 | ❌ MISSING |
| 13 | fi_copper_lug_4_6mm | Ring Type 4-6mm Copper Lug | ongrid, hybrid | 9.3 | ❌ MISSING |
| 14 | fi_insulation_tape | Insulation Tape | ongrid, hybrid | 9 | ❌ MISSING |
| 15 | fi_alu_lug_16mm | 16mm Aluminium Lug | ongrid, hybrid | 4.2 | ❌ MISSING |
| 16 | fi_alu_lug_50mm | 50mm Aluminium Lug | ongrid, hybrid | 13.6 | ❌ MISSING |
| 17 | fi_pvc_pipe_20mm | 20mm PVC Pipe | ongrid | 45 | ❌ MISSING |
| 18 | fi_pvc_pipe_25mm | 25mm PVC Pipe | ongrid | 72 | ❌ MISSING |
| 19 | fi_pipe_20mm | 20mm Pipe | hybrid | 45 | ❌ MISSING |
| 20 | fi_pipe_25mm | 25mm Pipe | hybrid | 72 | ❌ MISSING |
| 21 | fi_bend_20mm | 20mm Bend | ongrid, hybrid | 5.5 | ❌ MISSING |
| 22 | fi_bend_25mm | 25mm Bend | ongrid, hybrid | 8 | ❌ MISSING |
| 23 | fi_elbow_20mm | 20mm Elbow | ongrid, hybrid | 4 | ❌ MISSING |
| 24 | fi_elbow_25mm | 25mm Elbow | ongrid, hybrid | 4.5 | ❌ MISSING |
| 25 | fi_ss_saddle_20mm | SS Saddle 20mm | ongrid, hybrid | 2.7 | ❌ MISSING |
| 26 | fi_saddle_25mm | 25mm Saddle | ongrid, hybrid | 3 | ❌ MISSING |
| 27 | fi_meter_box_1p | 1P Meter Box | ongrid | 950 | ❌ MISSING |
| 28 | fi_meter_box_3p | 3P Meter Box | ongrid | 950 | ❌ MISSING |
| 29 | fi_meter_box_1phase | 1 Phase Meter Box | hybrid | 950 | ❌ MISSING |
| 30 | fi_meter_box_3phase | Three Phase Meter Box | hybrid | 950 | ❌ MISSING |
| 31 | fi_end_sleeve_green | End Sleeve Green | ongrid, hybrid | 5 | ❌ MISSING |
| 32 | fi_wall_plug_6mm | 6mm Wall Plug | ongrid | 17 | ❌ MISSING |
| 33 | fi_plug_6mm | 6mm Plug | hybrid | 17 | ❌ MISSING |
| 34 | fi_la_nylon_holder | LA Nylon Holder | ongrid, hybrid | 9 | ❌ MISSING |
| 35 | fi_mid_clamp | Mid Clamp | ongrid, hybrid | 19 | ❌ MISSING |
| 36 | fi_end_clamp | End Clamp | ongrid, hybrid | 13 | ❌ MISSING |
| 37 | fi_j_bolt | J Bolt | ongrid, hybrid | 20 | ❌ MISSING |
| 38 | fi_panel_earthing_bolt | Panel Earthing Nut & Bolt | ongrid, hybrid | 1.6 | ❌ MISSING |
| 39 | fi_pvc_t_20mm | PVC T 20mm | ongrid | 5 | ❌ MISSING |
| 40 | fi_pvc_t_25mm | PVC T 25mm | ongrid | 7.6 | ❌ MISSING |
| 41 | fi_t_20mm_ivory | T 20mm Ivory | hybrid | 5 | ❌ MISSING |
| 42 | fi_t_25mm | 25mm T | hybrid | 7.6 | ❌ MISSING |
| 43 | fi_la_base_bolt | LA Base Nut & Bolt | ongrid, hybrid | 1.4 | ❌ MISSING |
| 44 | fi_gland_20mm | 20mm Gland | ongrid, hybrid | 7.4 | ❌ MISSING |
| 45 | fi_changeover_40a | 40A Change Over Switch | hybrid | 3,500 | ❌ MISSING |
| 46 | fi_battery_cable_25mm | 25mm Battery Cable | hybrid | 180 | ❌ MISSING |
| 47 | fi_copper_lug_25mm | 25mm Copper Lug | hybrid | 85 | ❌ MISSING |

---

## 3. Deduplication Analysis

### 3.1 Shared Components (used in both ongrid AND hybrid)

57 components appear in both system types. Each has ONE authoritative componentId — no duplicate procurement records needed.

### 3.2 Functionally Equivalent Items with Different IDs

These pairs are the same physical item but carry different IDs in ongrid vs hybrid templates:

| Ongrid ID | Hybrid ID | Item | Same Price? |
|---|---|---|---|
| fi_pvc_pipe_20mm | fi_pipe_20mm | 20mm PVC Pipe | ✅ both ₹45 |
| fi_pvc_pipe_25mm | fi_pipe_25mm | 25mm PVC Pipe | ✅ both ₹72 |
| fi_wall_plug_6mm | fi_plug_6mm | 6mm Wall Plug | ✅ both ₹17 |
| fi_pvc_t_20mm | fi_t_20mm_ivory | 20mm T | ✅ both ₹5 |
| fi_pvc_t_25mm | fi_t_25mm | 25mm T | ✅ both ₹7.6 |
| fi_meter_box_1p | fi_meter_box_1phase | 1P Meter Box | ✅ both ₹950 |
| fi_meter_box_3p | fi_meter_box_3phase | 3P Meter Box | ✅ both ₹950 |
| fi_ss_terminal_4p | fi_ss_terminal_4p_excel | SS Terminal Strip 4P | ✅ both ₹150 |

**Impact:** 8 pairs = 16 IDs representing 8 physical items. Procurement must enter costs for ALL 16 IDs (the Cost Engine looks up by componentId, not by name). The same procurement cost applies to both IDs in each pair.

### 3.3 Deduplication Summary

| Metric | Count |
|---|---|
| Total unique componentIds in BOMs | 112 |
| Physically unique components (after pairing) | 104 |
| Duplicate pairs (same item, different ID) | 8 |
| Components appearing in multiple BOMs | 57 |
| Components in only one system type | 55 |

---

## 4. Price Source Classification

### Classification Key

| Class | Meaning |
|---|---|
| A | Current verified procurement cost exists |
| B | Historical procurement cost exists but needs confirmation |
| C | Catalog/reference price only (NOT a procurement cost) |
| D | No cost data at all |

### Results

| Class | Count | Components |
|---|---|---|
| **A** | **0** | None — no procurement prices have been entered |
| **B** | **0** | None — no historical procurement batches exist |
| **C** | **112** | All 112 BOM-used components have reference/selling prices in catalog.json |
| **D** | **0** | Every BOM-used component has at least a reference price |

**Critical:** All 112 components are Class C. The catalog prices are **reference/selling prices**, NOT procurement costs. The Cost Engine requires `landedUnitCost` — the actual cost to get the component to the warehouse. These are two entirely different numbers and must NOT be conflated.

The procurement price master (`data/procurement-price-master.json`) does not exist on disk. `cost-config.json` shows `priceMaster: {}` (empty object), `purchasePriceVersion: null`, `landedCostVersion: null`, `status: DECISION_CLOSED_VALUES_NOT_CONFIGURED`.

---

## 5. Priority Lists

### PRIORITY 1 — Required for Production Quotations (68 components)

These components are needed for the four priority configurations:
- 3 kW On-grid Value
- 5 kW On-grid Value (single-phase)
- 10 kW On-grid Value
- 3 kW Hybrid Value

| # | componentId | Name | Category |
|---|---|---|---|
| 1 | p2 | Adani Mono perc Bifacial 550W DCR | panel |
| 2 | i20 | Sungrow SG 3.0RT | inverter |
| 3 | i23 | Sungrow SG5K-D | inverter |
| 4 | i27 | Sungrow SG10.0RT | inverter |
| 5 | i56 | Deye Hybrid 1P 3-48v | inverter |
| 6 | d2 | 1/1 DCDB ETN MCB 500v 32A + Mersen 600v SPD | dcdb |
| 7 | d7 | 2/2 DCDB ETN MCB 500v + Mersen 600v SPD | dcdb |
| 8 | d9 | 1/1 DCDB ABB MCB 500v + Citel SPD + Fuses (Hybrid) | dcdb |
| 9 | a1 | ETN 32A + Mersen ACDB | acdb |
| 10 | a4 | ETN 32A Mersen 3P ACDB | acdb |
| 11 | a7 | ACDB WITH CHANGE OVER SWITCH 1PH Hybrid | acdb |
| 12 | m2 | Genius Single Phase Energy Meter | meter |
| 13 | m4 | Genius Three Phase Energy Meter | meter |
| 14 | dc3 | DC-APAR 6sqmm | dc_cable |
| 15 | ac2 | AC-RR 6sqmm | ac_cable |
| 16 | is1 | Honey Well Isolator 2P 40A | isolator |
| 17 | is2 | L&T Isolator 40A 4P | isolator |
| 18 | cb4 | CB Rod 14mm 250u 1.2m | cb_rod |
| 19 | ec2 | 16sqmm Green Poluguards | earth_cable |
| 20 | la1 | Excel FLX Al Down conductor 8mm | la_cable |
| 21 | bt1 | SEG.5 PRO 100AH LV Battery | battery |
| 22 | mb1 | Battery MCCB Box 160A | mccb_box |
| 23–68 | fi_* | 46 fixed BOM items | fixed |

**P1 fixed items (46):** fi_mc4_connector, fi_cable_tray, fi_earthing_copper_10swg, fi_ss_terminal_4p, fi_earthing_chamber, fi_lightning_arrester, fi_flexible_pipe, fi_earth_pit_compound, fi_cable_tie_300mm, fi_ss_screw_1_5in, fi_ss_screw_1in, fi_copper_lug_4_6mm, fi_insulation_tape, fi_alu_lug_16mm, fi_alu_lug_50mm, fi_pvc_pipe_20mm, fi_pvc_pipe_25mm, fi_bend_20mm, fi_bend_25mm, fi_elbow_20mm, fi_elbow_25mm, fi_ss_saddle_20mm, fi_saddle_25mm, fi_meter_box_1p, fi_meter_box_3p, fi_end_sleeve_green, fi_wall_plug_6mm, fi_la_nylon_holder, fi_mid_clamp, fi_end_clamp, fi_j_bolt, fi_panel_earthing_bolt, fi_pvc_t_20mm, fi_pvc_t_25mm, fi_la_base_bolt, fi_gland_20mm, fi_ss_terminal_4p_excel, fi_pipe_20mm, fi_pipe_25mm, fi_plug_6mm, fi_t_20mm_ivory, fi_t_25mm, fi_changeover_40a, fi_battery_cable_25mm, fi_copper_lug_25mm, fi_meter_box_1phase

### PRIORITY 2 — Other Selectable Packages (44 components)

Components used in base/premium ongrid, or 5/8/10 kW hybrid, or Enphase premium — NOT already in P1.

| # | componentId | Name | Category |
|---|---|---|---|
| 1 | p1 | Waaree Mono perc Bifacial 540W DCR | panel |
| 2 | p3 | Adani Bifacial Topcon G2S 620W DCR | panel |
| 3 | i1 | Growatt MIC 3000TL-X | inverter |
| 4 | i4 | Growatt MIN 5000 TL-X | inverter |
| 5 | i5 | Growatt 5000 TL3-S | inverter |
| 6 | i7 | Growatt MOD 8000 TL3-X | inverter |
| 7 | i8 | Growatt MOD 10000 TL3-X | inverter |
| 8 | i24 | Sungrow SG5.0RT | inverter |
| 9 | i25 | Sungrow SG6.0RT | inverter |
| 10 | i26 | Sungrow SG8.0RT | inverter |
| 11 | i48 | DEYE On-Grid 3P 5kW | inverter |
| 12 | i58 | Deye Hybrid 1P 5-48v | inverter |
| 13 | i60 | Deye Hybrid 3P 8-48v | inverter |
| 14 | i61 | Deye Hybrid 3P 10-48v | inverter |
| 15 | d1 | 1/1 DCDB Havells MCB 500v 32A + Havells SPD | dcdb |
| 16 | d6 | 2/2 DCDB Havells MCB 500v + Havells SPD | dcdb |
| 17 | d10 | 2/2 DCDB ABB MCB 500v + Mersen SPD + Fuses (Hybrid 3P) | dcdb |
| 18 | a5 | Enphase ACDB + AJ Box ABB MCB 16A 2P | acdb |
| 19 | a6 | Enphase ACDB + AJ Box 3P | acdb |
| 20 | a8 | ACDB Hybrid 3PH | acdb |
| 21 | ac_hyb_en1p | ACDB Hybrid Enphase 1Ph | acdb |
| 22 | ac_hyb_en3p | ACDB Hybrid Enphase 3Ph | acdb |
| 23 | m1 | Visiontek Single Phase Meter | meter |
| 24 | m3 | Visiontek Three Phase Meter | meter |
| 25 | dc1 | DC-WACAB-Basic 4sqmm | dc_cable |
| 26 | dc4 | DC-POLY 4sqmm | dc_cable |
| 27 | ac1 | AC-RR 4sqmm | ac_cable |
| 28 | ac3 | AC-POLY 4sqmm | ac_cable |
| 29 | cb1 | CB Rod 14mm 100u 1.2m | cb_rod |
| 30 | cb5 | CB Rod 17.2mm 250u 1.2m | cb_rod |
| 31 | ec1 | 16sqmm Green Cable FLEXGUARD | earth_cable |
| 32 | ec3 | 16sqmm Green Cable APAR | earth_cable |
| 33 | la2 | Kanberry FLX Al Down conductor 8mm | la_cable |
| 34 | bt2 | Enphase Flex Battery | battery |
| 35 | ug_2core | UG Cable 2 Core Armoured | ug_cable |
| 36 | ug_4core | UG Cable 4 Core Armoured | ug_cable |
| 37 | en1 | Enphase IQ8P Micro Inverter | enphase |
| 38 | en2 | Enphase Q Cable Portrait 2m | enphase |
| 39 | en3 | Enphase Envoy S Metered | enphase |
| 40 | en4 | Enphase Q Relay | enphase |
| 41 | en5 | Enphase Q Terminal | enphase |
| 42 | en6 | Enphase CT 200 | enphase |
| 43 | en7 | Enphase System Controller | enphase |
| 44 | fi_meter_box_3phase | Three Phase Meter Box | fixed |

### PRIORITY 3 — Unused Catalog Items (192 components)

192 catalog items exist but are NOT selected by any current BOM configuration. These include alternative panels (p4-p33), larger inverters (15-125kW), Hoymiles accessories, armoured cables, structure materials, painting/welding supplies, and user-added items. **No procurement cost entry needed** for these until they are added to active BOM templates.

---

## 6. Landed Cost Schema

### 6.1 Price Record Fields (from `procurementPriceMaster.js`)

Each component requires these fields in the procurement price master:

| Field | Type | Required | Description |
|---|---|---|---|
| `componentId` | string | ✅ | Must match BOM componentId exactly |
| `componentName` | string | ✅ | Human-readable name |
| `purchasePrice` | number | ✅ | What the supplier charges per unit (ex-GST) |
| `purchasePriceVersion` | string | — | Version tag for audit trail |
| `purchasePriceEffectiveFrom` | date string | — | When this price became effective |
| `landedUnitCost` | number | ✅✅ | **THE COST THE ENGINE USES.** Total cost to get one unit to the warehouse |
| `landedCostVersion` | string | — | Version tag for audit trail |
| `landedCostEffectiveFrom` | date string | — | When this cost became effective |
| `supplier` | string | — | Supplier/vendor name |
| `supplierReference` | string | — | PO number, quote ref, etc. |
| `currency` | string | — | Default INR |
| `notes` | string | — | Free text |

### 6.2 Critical Rules

1. **`landedUnitCost` is the ONLY cost the Cost Engine consumes.** It is NEVER auto-derived from `purchasePrice`.
2. Both `purchasePrice` and `landedUnitCost` must be entered manually by procurement.
3. `landedUnitCost` = purchase price + allocated freight + loading/unloading + handling + warehouse charges + other — all per unit.
4. Allocation method is `PURCHASE_VALUE_PROPORTION` (by value share of total order, not by weight/volume/quantity).
5. Allocation scope is `SUPPLIER_TO_WAREHOUSE` (project-site transport is separate).
6. Forbidden price kinds: `SELLING_PRICE`, `CUSTOMER_PRICE`, `MARKET_RATE` — the engine rejects these.

### 6.3 Procurement-Side Cost Heads (from `cost-config.json`)

| Cost Head | Description |
|---|---|
| inboundMaterialDelivery | Freight from supplier to warehouse |
| loading | Loading charges at supplier end |
| unloading | Unloading at warehouse |
| handling | Material handling charges |
| warehouseProcurementCost | Warehouse receiving/storage cost |
| otherExplicitlyEnteredCharges | Any other procurement-side charges |

---

## 7. Import Mechanism

### 7.1 Existing Mechanism

The project has a **procurement workspace** (`server-procurement.js` + `src/lib/procurementWorkspace.js`) with a batch-based workflow:

1. Create a procurement batch
2. Add component price records to the batch
3. Commit the batch → writes `data/procurement-price-master.json`
4. Cost Engine reads the price master on next quotation

This is accessed via the procurement workspace UI at `/procurement` (requires PROCUREMENT role).

### 7.2 No Bulk CSV/XLSX Import

No CSV or spreadsheet import mechanism exists. Prices must be entered through the procurement workspace UI, one batch at a time.

### 7.3 What Procurement Needs to Provide

For **each of the 112 BOM-used components**, procurement must enter:

| Data Point | Example |
|---|---|
| componentId | `p2` or `fi_mc4_connector` |
| purchasePrice (₹) | What the supplier charges per unit, ex-GST |
| landedUnitCost (₹) | Total per-unit cost including allocated freight, loading, handling |
| supplier | "Adani Solar" or "Local electrical" |
| supplierReference | PO or quotation reference number |
| effectiveFrom | Date the price is valid from |

---

## 8. Verification

### 8.1 Tests and Build

| Check | Status |
|---|---|
| `npm run build` | ✅ (verified in test baseline phase) |
| BOM componentId coverage | ✅ 100% — all 4 systems, 0 null componentIds |
| Test baseline | ✅ 17 known failures, all classified, 0 from BOM fix |

### 8.2 Data Integrity

| Check | Status |
|---|---|
| Every BOM line has a componentId | ✅ verified |
| Every componentId maps to a catalog or fixed item | ✅ verified |
| No duplicate procurement records needed for same physical ID | ✅ (8 pairs need same cost entered under both IDs) |
| No procurement prices invented or guessed | ✅ — zero prices entered |
| No selling prices used as costs | ✅ — reference prices listed for context only |
| No code modified | ✅ — audit only |

---

## 9. Exact Data Required from Procurement

### Minimum Required (to unblock Cost Engine)

For each of the **112 components** (start with the 68 P1 components):

1. **`landedUnitCost`** — the per-unit cost including all procurement-side charges, allocated by purchase-value proportion
2. **`purchasePrice`** — what the supplier charges per unit (ex-GST)
3. **`supplier`** — vendor name

### Recommended (for audit trail)

4. `supplierReference` — PO or quote number
5. `effectiveFrom` — date the price is valid from
6. `currency` — INR (default)
7. `notes` — any context

### Entry Method

Use the procurement workspace UI at `/procurement` → create a batch → add component prices → commit.

---

## 10. Reconciliation

| Question | Answer |
|---|---|
| How many unique procurement component IDs exist? | **112** (65 catalog + 47 fixed) |
| How many already have authoritative costs? | **0** |
| How many are missing? | **112** (all of them) |
| How many needed for P1 priority set? | **68** |
| What exact data must procurement provide? | `landedUnitCost`, `purchasePrice`, `supplier` per component (minimum) |

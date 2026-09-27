# Missing Landed Cost Data -- Production Audit

**Date**: 2026-08-29
**Status**: BLOCKING -- No authoritative procurement data exists in repository
**Source files audited**: `data/catalog.json`, `data/cost-config.json`
**Procurement price master file**: `data/procurement-price-master.json` DOES NOT EXIST

---

## Executive Summary

**No component in the Flarize catalog has authoritative procurement/landed cost data.**

The catalog contains a `price` field on each component. These are **reference/selling prices, NOT procurement costs**. No `procurement-price-master.json` file exists in the repository. The cost engine expects a `priceMaster` keyed by `componentId` to look up purchase prices, but no such data store has been populated.

The `cost-config.json` procurement section explicitly confirms this:

```
"procurement.status": "DECISION_CLOSED_VALUES_NOT_CONFIGURED"
"procurement.purchasePriceVersion": null
"procurement.landedCostVersion": null
```

The cost engine will block with `LANDED_COST_NOT_CONFIGURED` for every material line. This is by design -- the system refuses to invent costs -- but it means **no quotation can produce an accurate material cost until procurement data is entered**.

---

## Component Inventory -- All Missing Landed Costs

### 1. Solar Panels (36 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| p1 | Waaree Mono perc Bifacial 540W DCR | Waaree | 13,122 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p2 | Adani Mono perc Bifacial 550W DCR | Adani | 13,585 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p3 | Adani Bifacial Topcon G2S 620W DCR | Adani | 15,934 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p4 | Premier Energies Mono perc 540W DCR | Premier Energies | 13,635 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p5 | Premier Energies TopCon 600W DCR | Premier Energies | 15,750 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p6 | Vikram Solar Mono perc 540W DCR | Vikram Solar | 12,690 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p7 | Renewsys Mono perc 545W DCR | Renewsys | 13,298 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p8 | Rayzon Mono perc 545W DCR | Rayzon | 12,808 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p9 | Panasonic Mono perc 540W DCR | Panasonic | 13,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p10 | Axitec Mono perc 550W DCR | Axitec | 12,925 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p11 | Saatvik Solar Mono perc 540W DCR | Saatvik Solar | 12,420 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p12 | Saatvik Solar Topcon G2G 565W DCR | Saatvik Solar | 14,973 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p13 | Jakson 570W DCR | Jakson | 10,830 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p14 | Renew Mono perc 550W | Renew | 13,035 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p15 | Emvee Topcon G2G 565W DCR | Emvee | 14,690 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p16 | Waaree Mono perc 545W NDCR | Waaree | 8,175 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p17 | Waaree Bifacial Topcon 575W NDCR | Waaree | 9,200 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p18 | Vikram Solar Mono perc 550W NDCR | Vikram Solar | 8,800 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p19 | Renewsys Mono perc 545W NDCR | Renewsys | 8,175 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p20 | Renewsys TopCon G2G 600W NDCR | Renewsys | 9,480 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p21 | Rayzon Mono perc 545W NDCR | Rayzon | 8,666 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p22 | Panasonic Mono perc 550W NDCR | Panasonic | 9,488 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p23 | Axitec Bifacial Topcon 600W NDCR | Axitec | 10,020 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p24 | Premier Energies Mono perc 545W NDCR | Premier Energies | 8,284 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p25 | Premier Energies Bifacial Topcon 590W NDCR | Premier Energies | 9,145 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p26 | Saatvik Solar Mono perc 540W NDCR | Saatvik Solar | 7,992 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p27 | Saatvik Solar Topcon G2G 580W NDCR | Saatvik Solar | 8,410 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p28 | Adani Topcon 620W NDCR | Adani | 10,540 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p29 | Pahal Bifacial Topcon G2G 600W NDCR | Pahal | 9,600 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p30 | Goldi Bifacial Topcon G2G 580W NDCR | Goldi | 9,280 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p31 | Emvee Topcon 580W NDCR | Emvee | 9,280 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p32 | Renew Topcon G2G 640W NDCR | Renew | 10,240 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| p33 | Adani Bifacial G2G 555W NDCR | Adani | 8,325 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| pa_0006870e2e7d | hari 550 | hari | 9,900 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| pa_a2ea75b89b4d | New Solar Panel | (none) | 0 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| pa_9e35d4adf2a3 | adani 600 | adani | 15,420 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 2. Inverters (98 components)

#### 2a. On-Grid Inverters

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| i1 | Growatt MIC 3000TL-X | Growatt | 16,600 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i2 | Growatt MIC 3300TL-X | Growatt | 16,700 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i3 | Growatt MIN 4200 TL-X | Growatt | 30,850 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i4 | Growatt MIN 5000 TL-X | Growatt | 29,200 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i5 | Growatt 5000 TL3-S | Growatt | 47,600 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i6 | Growatt 6000 TL3-S | Growatt | 50,400 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i7 | Growatt MOD 8000 TL3-X | Growatt | 53,200 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i8 | Growatt MOD 10000 TL3-X | Growatt | 54,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i9 | Growatt MOD 12000 TL3-X | Growatt | 64,800 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i10 | Growatt MOD 15000 TL3-X | Growatt | 66,650 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i11 | Growatt MID 20 KTL3-X | Growatt | 86,700 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i12 | Growatt MID 25 KTL3-X | Growatt | 91,650 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i13 | Growatt MID 30 KTL3-X | Growatt | 121,350 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i14 | Growatt MID 33 KTL3-X | Growatt | 126,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i15 | Growatt MID 40 KTL3-X | Growatt | 143,950 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i16 | Growatt MAC 50 KTL3-X | Growatt | 161,850 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i17 | Growatt MAX 80KTL3-LV | Growatt | 236,033 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i18 | Growatt MAX 100KTL3-X-LV | Growatt | 292,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i19 | Growatt MAX 125KTL3-X-LV | Growatt | 312,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i20 | Sungrow SG 3.0RT | Sungrow | 18,250 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i21 | Sungrow SG 3.3RT | Sungrow | 22,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i22 | Sungrow SG 4.0RT | Sungrow | 28,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i23 | Sungrow SG5K-D | Sungrow | 30,600 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i24 | Sungrow SG5.0RT | Sungrow | 54,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i25 | Sungrow SG6.0RT | Sungrow | 56,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i26 | Sungrow SG8.0RT | Sungrow | 58,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i27 | Sungrow SG10.0RT | Sungrow | 64,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i28 | Sungrow SG12.0RT | Sungrow | 66,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i29 | Sungrow SG15.0RT | Sungrow | 87,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i30 | Sungrow SG20KTL-M | Sungrow | 93,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i31 | Sungrow SG33CX | Sungrow | 133,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i32 | Sungrow SG50CX | Sungrow | 168,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i33 | Sungrow SG110CX | Sungrow | 317,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i34 | Sungrow SG125HX | Sungrow | 347,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i35 | SolarEdge SE3000H | SolarEdge | 39,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i36 | SolarEdge SE5K | SolarEdge | 75,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i37 | SolarEdge SE8K | SolarEdge | 60,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i38 | SolarEdge SE15K | SolarEdge | 88,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i39 | SolarEdge SE17K | SolarEdge | 89,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i40 | SolarEdge SE27.6K | SolarEdge | 112,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i41 | SolarEdge SE-33.3KW | SolarEdge | 118,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i42 | SolarEdge SE66K | SolarEdge | 228,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i43 | SolarEdge SE 100kw | SolarEdge | 315,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i44 | DEYE On-Grid 1P 3kW | DEYE | 15,700 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i45 | DEYE On-Grid 1P 3.3kW | DEYE | 18,672 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i46 | DEYE On-Grid 1P 4kW | DEYE | 19,975 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i47 | DEYE On-Grid 1P 5kW | DEYE | 26,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i48 | DEYE On-Grid 3P 5kW | DEYE | 45,696 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i49 | DEYE On-Grid 3P 6kW | DEYE | 46,502 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i50 | DEYE On-Grid 3P 8kW | DEYE | 48,115 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i51 | DEYE On-Grid 3P 10kW | DEYE | 49,728 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i52 | DEYE On-Grid 3P 15kW | DEYE | 60,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i53 | DEYE On-Grid 3P 20kW | DEYE | 69,750 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i54 | DEYE On-Grid 3P 33kW | DEYE | 110,611 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i55 | DEYE On-Grid 3P 40kW | DEYE | 140,238 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i66 | Solaire ZIP-3.3kw | Solaire | 19,800 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i67 | Solaire ZIP-5kw | Solaire | 32,700 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i68 | PV BLINK 1P 3kW | PV BLINK | 17,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i69 | PV BLINK 1P 5kW | PV BLINK | 31,200 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i70 | PV BLINK 3P 5kW | PV BLINK | 50,700 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i71 | PV BLINK 3P 6kW | PV BLINK | 53,350 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i72 | PV BLINK 3P 8kW | PV BLINK | 60,200 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i73 | PV BLINK 3P 10kW | PV BLINK | 61,250 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i74 | PV BLINK 3P 12kW | PV BLINK | 68,700 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i75 | PV BLINK 3P 15kW | PV BLINK | 71,800 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i76 | PV BLINK 3P 20kW | PV BLINK | 87,700 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i77 | PV BLINK 3P 25kW | PV BLINK | 102,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i78 | PV BLINK 3P 30kW | PV BLINK | 110,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i79 | Solis 1P 3kW | Solis | 17,900 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i80 | Solis 1P 5kW | Solis | 30,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i81 | Solis 3P 5kW | Solis | 54,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i82 | Solis 3P 8kW | Solis | 58,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i83 | Solis 3P 10kW | Solis | 59,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i84 | Solis 3P 20kW | Solis | 85,129 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i85 | Solis 3P 40kW | Solis | 142,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i86 | Solis 3P 50kW | Solis | 152,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i87 | Foxess 1P 3.3kW | Foxess | 16,300 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i88 | Foxess 1P 5kW | Foxess | 31,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i89 | Foxess 3P 6kW | Foxess | 55,900 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i90 | Foxess 3P 8kW | Foxess | 58,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i91 | Foxess 3P 10kW | Foxess | 59,900 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i92 | Foxess 3P 15kW | Foxess | 67,800 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i93 | Foxess 3P 20kW | Foxess | 77,900 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i94 | Foxess 3P 25kW | Foxess | 83,900 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i95 | Eastman 1P 3kW | Eastman | 14,800 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i96 | Eastman 1P 5kW | Eastman | 24,900 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i97 | ENPHASE IQ8P Micro | ENPHASE | 8,200 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i98 | Hoymiles Micro Inverter | Hoymiles | 7,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

#### 2b. Hybrid Inverters

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| i56 | Deye Hybrid 1P 3-48v | Deye | 67,100 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i57 | Deye Hybrid 1P 3.6-48v | Deye | 74,786 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i58 | Deye Hybrid 1P 5-48v | Deye | 81,730 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i59 | Deye Hybrid 1P 6-48v | Deye | 86,076 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i60 | Deye Hybrid 3P 8-48v | Deye | 152,719 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i61 | Deye Hybrid 3P 10-48v | Deye | 162,136 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i62 | Deye Hybrid 3P 12-48v | Deye | 168,438 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i63 | Deye Hybrid 3P 30-48v | Deye | 353,925 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i64 | Deye Hybrid 3P 40-48v | Deye | 423,833 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| i65 | DEYE Hybrid 3P 80-48v | DEYE | 686,205 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 3. DCDB (10 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| d1 | 1/1 DCDB Havells MCB 500v 32A + Havells SPD | Havells | 1,525 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| d2 | 1/1 DCDB ETN MCB 500v 32A + Mersen 600v SPD | ETN+Mersen | 2,800 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| d3 | 1/1 DCDB ABB MCB 500v 32A + Citel 500v SPD | ABB+Citel | 3,226 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| d4 | 1/1 DCDB ABB MCB 500v + Mersen SPD | ABB+Mersen | 2,030 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| d5 | 1/1 DCDB ABB MCB 500v + Phoenix SPD | ABB+Phoenix | 2,473 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| d6 | 2/2 DCDB Havells MCB 500v + Havells SPD | Havells | 1,525 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| d7 | 2/2 DCDB ETN MCB 500v + Mersen 600v SPD | ETN+Mersen | 3,700 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| d8 | 2/2 DCDB ABB MCB 500v + Mersen SPD | ABB+Mersen | 1,858 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| d9 | 1/1 DCDB ABB MCB 500v 32A + Citel 500v SPD + Fuses (Hybrid) | ABB+Citel | 3,226 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| d10 | 2/2 DCDB ABB MCB 500v + Mersen 500v SPD + Fuses (Hybrid 3P) | ABB+Mersen | 5,594 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 4. ACDB (10 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| a1 | ETN 32A + Mersen ACDB | ETN+Mersen | 1,600 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| a2 | ABB + Citel SPD ACDB | ABB+Citel | 2,282 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| a3 | ABB + Mersen SPD ACDB | ABB+Mersen | 1,858 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| a4 | ETN 32A Mersen 3P ACDB | ETN+Mersen | 3,700 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| a5 | Enphase ACDB + AJ Box ABB MCB 16A 2P | Enphase | 6,080 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| a6 | Enphase ACDB + AJ Box 3P | Enphase | 9,585 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| a7 | ACDB WITH CHANGE OVER SWITCH 1PH Hybrid | Generic | 8,100 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| a8 | ACDB Hybrid 3PH | Generic | 12,100 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ac_hyb_en1p | ACDB Hybrid Enphase 1Ph (ABB MCB+Citel SPD) | ABB/Citel | 3,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ac_hyb_en3p | ACDB Hybrid Enphase 3Ph (ABB MCB+Citel SPD) | ABB/Citel | 10,612 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 5. Meters (7 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| m1 | Visiontek Single Phase Meter | Visiontek | 1,400 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| m2 | Genius Single Phase Energy Meter | Genius | 1,610 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| m3 | Visiontek Three Phase Meter | Visiontek | 3,950 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| m4 | Genius Three Phase Energy Meter | Genius | 4,650 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| m5 | L&T 1P Meter | L&T | 1,680 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| m6 | L&T 3P Meter | L&T | 5,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| m7 | Three Phase Genus Meter | Genus | 4,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 6. DC Cables (6 components)

| ID | Name | Brand | Ref. Price/m | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| dc1 | DC-WACAB-Basic 4sqmm | WACAB | 43 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| dc2 | DC-WACAB-Basic 6sqmm | WACAB | 53 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| dc3 | DC-APAR 6sqmm | APAR | 55 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| dc4 | DC-POLY 4sqmm | POLY | 60 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| dc5 | DC-LUMICON 4sqmm | LUMICON | 37 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| dc6 | DC-LUMICON 6sqmm | LUMICON | 54 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 7. AC Cables (4 components)

| ID | Name | Brand | Ref. Price/m | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| ac1 | AC-RR 4sqmm | RR | 58 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ac2 | AC-RR 6sqmm | RR | 65.25 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ac3 | AC-POLY 4sqmm | POLY | 56 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ac4 | AC-POLY 6sqmm | POLY | 61 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 8. Isolators (3 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| is1 | Honey Well Isolator 2P 40A | Honey Well | 212 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| is2 | L&T Isolator 40A 4P | L&T | 623 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| is_9b53be37fab1 | New Isolator | (none) | 0 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 9. CB Rods / Earthing (6 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| cb1 | CB Rod 14mm 100u 1.2m | Generic | 260 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| cb2 | CB Rod 17.2mm 100u 1.2m | Generic | 360 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| cb3 | CB Rod 17.2mm 100u 2m | Generic | 595 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| cb4 | CB Rod 14mm 250u 1.2m | Generic | 900 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| cb5 | CB Rod 17.2mm 250u 1.2m | Generic | 900 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| cb6 | CB Rod 17.2mm 250u 2m | Generic | 1,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 10. Earthing Cable (3 components)

| ID | Name | Brand | Ref. Price/m | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| ec1 | 16sqmm Green Cable FLEXGUARD | FLEXGUARD | 21.6 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ec2 | 16sqmm Green Poluguards | Poluguards | 24 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ec3 | 16sqmm Green Cable APAR | APAR | 29 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 11. LA Conductor (2 components)

| ID | Name | Brand | Ref. Price/m | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| la1 | Excel FLX Al Down conductor 8mm | Excel | 72 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| la2 | Kanberry FLX Al Down conductor 8mm | Kanberry | 58 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 12. Batteries (5 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| bt1 | SEG.5 PRO 100AH LV Battery | SEG | 86,717 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| bt2 | Enphase Flex Battery | Enphase | 95,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| bt3 | Okaya 100AH | Okaya | 78,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| bt4 | Livguard 100AH | Livguard | 75,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ba_3b51aef23f0b | New Battery | (none) | 0 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 13. Enphase Accessories (9 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| en1 | Enphase IQ8P Micro Inverter | Enphase | 8,200 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| en2 | Enphase Q Cable Portrait 2m | Enphase | 750 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| en3 | Enphase Envoy S Metered | Enphase | 12,610 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| en4 | Enphase Q Relay | Enphase | 5,150 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| en5 | Enphase Q Terminal | Enphase | 700 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| en6 | Enphase CT 200 | Enphase | 1,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| en7 | Enphase System Controller | Enphase | 110,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| en_sysctrl | Enphase System Controller with Cable | Enphase | 25,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| en_flexbat | Enphase Flex Battery 5kWh | Enphase | 135,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 14. Hoymiles Accessories (6 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| hm1 | Hoymiles HMS 2000 (4 Module / 4 MPPT) | Hoymiles | 22,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| hm2 | Hoymiles HMS 1000 (2 Module / 2 MPPT) | Hoymiles | 14,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| hm3 | Hoymiles DTU Pro (Zero Export / Monitoring) | Hoymiles | 15,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| hm4 | Hoymiles DTU Lite (Basic Monitoring) | Hoymiles | 8,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| hm5 | Hoymiles End Cap (Pack of 5) | Hoymiles | 1,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| hm6 | Hoymiles AC Trunk Cable | Hoymiles | 2,000 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 15. Armoured Cable (15 components)

| ID | Name | Brand | Ref. Price/m | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| ar1 | 4Core 4sqmm Armoured | Generic | 80 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar2 | 4Core 6sqmm Armoured | Generic | 94 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar3 | 4Core 10sqmm Armoured | Generic | 112 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar4 | 4Core 16sqmm Armoured | Generic | 131 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar5 | 4Core 25sqmm Armoured | Generic | 179 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar6 | 4Core 35sqmm Armoured | Generic | 235 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar7 | 4Core 50sqmm Armoured | Generic | 390 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar8 | 3.5Core 70sqmm Armoured | Generic | 379 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar9 | 3.5Core 95sqmm Armoured | Generic | 468 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar10 | 3.5Core 120sqmm Armoured | Generic | 585 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar11 | 3.5Core 150sqmm Armoured | Generic | 690 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar12 | 3.5Core 185sqmm Armoured | Generic | 884 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar13 | 3.5Core 240sqmm Armoured | Generic | 1,096 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar14 | 3.5Core 300sqmm Armoured | Generic | 1,331 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ar15 | 3.5Core 400sqmm Armoured | Generic | 1,734 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 16. Battery MCCB Box (1 component)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| mb1 | Battery MCCB Box 160A | Generic | 8,500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 17. UG Cable (2 components)

| ID | Name | Brand | Ref. Price/m | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| ug_2core | UG Cable 2 Core Armoured | Generic | 150 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ug_4core | UG Cable 4 Core Armoured | Generic | 250 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 18. Change Over Switch (1 component)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| co_1 | Change Over Switch | Generic | 1,200 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 19. Battery Cable (1 component)

| ID | Name | Brand | Ref. Price/m | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| bc_25 | 25mm Battery Cable | Generic | 120 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 20. Meter Box (1 component)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| mbox_1 | Meter Box | Generic | 500 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 21. MC4 Connector (1 component)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| mc4_1 | MC4 Connector Pair | (none) | 50 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 22. Cable Tie (1 component)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| ct_1 | Cable Tie 300mm Weather Resistant (Pkt) | (none) | 120 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 23. Flexible Pipe (1 component)

| ID | Name | Brand | Ref. Price/m | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| fp_1 | Flexible Pipe (per meter) | (none) | 80 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 24. SS Screws & Bolts (4 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| ss_15 | SS Star Screw 1.5 inch | (none) | 8 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ss_1 | SS Star Screw 1 inch | (none) | 6 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ss_self34 | 3/4 inch Self Screw | (none) | 5 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| ss_selfbolt | Self Bolt Corroshield | (none) | 12 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 25. Copper Lug (2 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| cl_1 | Ring Type 4-6mm Copper Lug | (none) | 15 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| cl_25 | 25mm Lug | (none) | 35 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 26. Insulation Tape (1 component)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| it_1 | Insulation Tape | (none) | 40 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 27. Conduit Pipe & Fittings (6 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| cp_pipe | 20mm Conduit Pipe | (none) | 35 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| cp_bend | 20mm Bend | (none) | 12 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| cp_elbow | 20mm Elbow | (none) | 10 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| cp_t | 20mm T Connector | (none) | 12 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| cp_saddle | SS Saddle 20mm | (none) | 8 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| cp_gland | 20mm Gland | (none) | 15 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 28. Solar Clamps & Bolts (3 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| sc_mid | Mid Clamp | (none) | 35 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| sc_end | End Clamp | (none) | 35 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| sc_jbolt | J Bolt | (none) | 25 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 29. Structure Material (6 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| sm_15x15 | 1.5x1.5 Square Tube 16 Gauge GP | (none) | 450 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| sm_25x15 | 2.5x1.5 Square Tube 16 Gauge GP | (none) | 600 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| sm_plate | MS Square Plate 5x5 | (none) | 80 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| sm_anchor | Anchor Bolt 8mm | (none) | 12 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| sm_endcap_25 | 2.5x1.5 End Cap | (none) | 15 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| sm_endcap_15 | 1.5x1.5 End Cap | (none) | 12 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 30. Painting & Finishing (4 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| pm_epoxy | Epoxy Primer ESS Dee Black (per litre) | (none) | 350 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| pm_thinner | Thinner D13 (per litre) | (none) | 180 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| pm_roller | Roller 4 inch | (none) | 60 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| pm_cotton | Cotton Waste (50gm) | (none) | 30 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

### 31. Welding & Cutting (2 components)

| ID | Name | Brand | Ref. Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Effective Date | Source |
|---|---|---|---:|---|---|---|---|---|---|
| wm_wheel | 4" Cutting Wheel Bullet | (none) | 45 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |
| wm_electrode | Welding Electrodes 2.50 Sunbond (12 pack) | (none) | 280 | MISSING | MISSING | MISSING | MISSING | N/A | No procurement data exists in repository |

---

## BOM Template Fixed Items -- Also Missing Landed Costs

BOM templates (`ongrid`, `hybrid`, `upgrade`) include fixed-price items that are embedded directly in the template with hardcoded `price` values. These prices are also reference prices -- no procurement cost has been established for any of them.

### On-Grid Template Fixed Items (36 items)

| Item Name | Template Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Source |
|---|---:|---|---|---|---|---|
| MC4 Connector | 56 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| Cable Tray | 186 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 10 SWG Earthing Copper | 105 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| SS Terminal Strip 4P | 150 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| Earthing Chamber 180x180mm | 270 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| Lightning Arrester 16mm 1m | 600 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| Flexible Pipe | 49 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| Earth Pit Compound | 167 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| Cable Tie 300mm WR | 320 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| SS Star Screw 1.5in | 1 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| SS Star Screw 1in | 1.7 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| Ring Type 4-6mm Copper Lug | 9.3 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| Insulation Tape | 9 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 16mm Aluminium Lug | 4.2 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 50mm Aluminium Lug | 13.6 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 20mm PVC Pipe | 45 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 25mm PVC Pipe | 72 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 20mm Bend | 5.5 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 25mm Bend | 8 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 20mm Elbow | 4 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 25mm Elbow | 4.5 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| SS Saddle 20mm | 2.7 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 25mm Saddle | 3 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 1P Meter Box | 950 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 3P Meter Box | 950 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| End Sleeve Green | 5 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 6mm Wall Plug | 17 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| LA Nylon Holder | 9 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| Mid Clamp | 19 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| End Clamp | 13 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| J Bolt | 20 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| Panel Earthing Nut & Bolt | 1.6 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| PVC T 20mm | 5 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| PVC T 25mm | 7.6 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| LA Base Nut & Bolt | 1.4 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 20mm Gland | 7.4 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |

### Hybrid Template Additional Fixed Items (3 items beyond shared ongrid set)

| Item Name | Template Price | Purchase Price | Freight | Other Landed | Final Landed Cost | Source |
|---|---:|---|---|---|---|---|
| 40A Change Over Switch | 3,500 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 25mm Battery Cable | 180 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |
| 25mm Copper Lug | 85 | MISSING | MISSING | MISSING | MISSING | No procurement data exists in repository |

### Upgrade Template Fixed Items (34 items)

The upgrade template references catalog component items by `catalogRef` rather than embedding prices. All referenced components are already listed above. The template also includes structure materials (tubes, plates, bolts), painting materials (epoxy, thinner, roller, cotton waste), and welding materials (cutting wheel, electrodes) -- all listed in their respective catalog category sections above.

---

## Summary Counts

| Category | Component Count | With Procurement Data | Missing Procurement Data |
|---|---:|---:|---:|
| Solar Panel | 36 | 0 | **36** |
| Inverter (On-Grid) | 88 | 0 | **88** |
| Inverter (Hybrid) | 10 | 0 | **10** |
| DCDB | 10 | 0 | **10** |
| ACDB | 10 | 0 | **10** |
| Meter | 7 | 0 | **7** |
| DC Cable | 6 | 0 | **6** |
| AC Cable | 4 | 0 | **4** |
| Isolator | 3 | 0 | **3** |
| CB Rod | 6 | 0 | **6** |
| Earthing Cable | 3 | 0 | **3** |
| LA Conductor | 2 | 0 | **2** |
| Battery | 5 | 0 | **5** |
| Enphase Accessories | 9 | 0 | **9** |
| Hoymiles Accessories | 6 | 0 | **6** |
| Armoured Cable | 15 | 0 | **15** |
| Battery MCCB Box | 1 | 0 | **1** |
| UG Cable | 2 | 0 | **2** |
| Change Over Switch | 1 | 0 | **1** |
| Battery Cable | 1 | 0 | **1** |
| Meter Box | 1 | 0 | **1** |
| MC4 Connector | 1 | 0 | **1** |
| Cable Tie | 1 | 0 | **1** |
| Flexible Pipe | 1 | 0 | **1** |
| SS Screws & Bolts | 4 | 0 | **4** |
| Copper Lug | 2 | 0 | **2** |
| Insulation Tape | 1 | 0 | **1** |
| Conduit Pipe & Fittings | 6 | 0 | **6** |
| Solar Clamps & Bolts | 3 | 0 | **3** |
| Structure Material | 6 | 0 | **6** |
| Painting & Finishing | 4 | 0 | **4** |
| Welding & Cutting | 2 | 0 | **2** |
| BOM Template Fixed Items | ~39 unique | 0 | **~39** |
| **TOTAL** | **~296** | **0** | **~296** |

---

## Installation Rates

### Configured Sizes (from `cost-config.json`)

Installation rates exist in `cost-config.json` for the following system size / installation type combinations:

| System Size (kW) | FLAT | SHEET | ELEVATED |
|---|---:|---:|---:|
| 3 | 15,000 | 18,000 | 22,000 |
| 5 | 22,000 | 26,000 | 32,000 |
| 6 | 28,000 | 33,000 | 40,000 |
| 8 | 35,000 | 42,000 | 50,000 |
| 10 | 42,000 | 50,000 | 60,000 |

**Note**: The catalog `installationMatrix` also has keys `5sp` (5kW 1-Phase) and `5tp` (5kW 3-Phase) with identical rates (flat=22000, sheet=26000, elevated=32000). The `cost-config.json` normalizes these to a single 5 kW entry.

### Missing Installation Sizes

The cost engine uses **exact match only** (Decision C75). Any system size not listed above will block with `INSTALLATION_COST_NOT_CONFIGURED`. The following sizes are used by inverters in the catalog but have **no installation rate configured**:

- 3.3 kW, 3.6 kW, 4 kW, 4.2 kW (small 1P systems)
- 12 kW, 15 kW, 17 kW, 20 kW, 25 kW, 27.6 kW, 30 kW, 33 kW, 33.3 kW, 40 kW, 50 kW, 66 kW, 80 kW, 100 kW, 110 kW, 125 kW (commercial-scale systems)

The per-kW legacy fallback (`catalog.costs.installRate = 3000 per kW`) has been **deliberately removed** (status: REMOVED in cost-config).

---

## Transportation

**Status: COMPLETELY UNCONFIGURED**

From `cost-config.json`:

```
"transportation.status": "DECISION_CLOSED_VALUES_NOT_CONFIGURED"
"transportation.vehicles": []
```

- The transportation formula is defined: `distanceKm x vehicle.ratePerKm`
- The scope is defined: `WAREHOUSE_TO_SITE`, one-way distance
- **No vehicles have been configured** -- the `vehicles` array is empty
- **No per-km rates exist** for any vehicle type
- The cost engine will block with `TRANSPORT_RATE_NOT_CONFIGURED`
- Legacy transport rates from the catalog (`costPerKm: 35`, `transportRate: 40`) have been explicitly rejected (Decision C76) and are not applied

The `vehicleRecordShape` is defined but no records have been created:
- Required fields: `vehicleId`, `vehicleName`, `ratePerKm`, `unit`, `effectiveFrom`, `effectiveTo`, `version`, `status`, `changedBy`, `changedAt`, `changeReason`, `previousVersionId`

---

## Landed Cost Formula (Defined but No Data)

The approved landed cost formula from `cost-config.json`:

```
landedCost = purchaseUnitPrice + allocatedProcurementDelivery/quantity + otherProcurementCharges/quantity
```

- **Allocation method**: Purchase-value proportion (approved Decision P2-J)
- **Allocation scope**: Supplier to warehouse only
- **Procurement-side costs to allocate**: inbound material delivery, loading, unloading, handling, warehouse procurement cost, other explicitly entered charges
- **All values**: null / not configured

---

## Key Statements

1. **No procurement price master exists.** The file `data/procurement-price-master.json` does not exist in the repository. No `priceMaster` data store has been populated.

2. **Catalog `price` fields are reference/selling prices, not procurement costs.** They must not be used as purchase prices for cost calculation.

3. **No values have been invented in this document.** Every "MISSING" entry reflects the actual state of the repository.

4. **The cost engine will correctly block.** The system is designed to return `LANDED_COST_NOT_CONFIGURED` rather than produce a quotation with fabricated costs. This is the intended behavior until Procurement enters real data.

5. **All 257 catalog components and ~39 BOM template fixed items (~296 total) lack landed cost data.**

6. **Transportation is completely unconfigured** -- no vehicles, no rates.

7. **Installation rates cover only 5 standard residential sizes** (3, 5, 6, 8, 10 kW). All commercial sizes are missing.

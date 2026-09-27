# TRANSPORTATION MODEL

**Phase 2A final** · §3 · owner: **PROJECT HEAD**

---

## Scope: warehouse → site only

```
supplier → warehouse    inbound logistics    inside landedUnitCost
warehouse → site        project delivery     TRANSPORTATION cost head
```

Charging inbound logistics here would double-count it, because it is already
inside the landed cost of every component.

---

## Formula

```
TRANSPORTATION_COST = distanceKm × selectedVehicle.ratePerKm
```

`distanceKm` is the **ONE-WAY** actual/billable distance. The system **never**
multiplies it by two — a test asserts the result is `distance × rate` and
explicitly not `2 × distance × rate`. If a return leg is billable, that belongs
in the configured per-km rate or in an explicit business rule, not in a hidden
multiplier.

`distanceKm` is a project input. V1 never derives it; map integration is a later
phase. Missing distance → `TRANSPORT_DATA_INCOMPLETE`.

---

## Vehicle rates are configuration

```
vehicles: [
  { vehicleType: 'PICKUP', ratePerKm: …, version: … },
  { vehicleType: 'LORRY',  ratePerKm: …, version: … },
]
```

**No universal per-km rate exists.** The legacy values are recorded as rejected
and are never applied:

| source field | value | status |
|---|---|---|
| `catalog.transportConfig.costPerKm` | 35 | NOT_APPLIED |
| `catalog.costs.transportRate` | 40 | NOT_APPLIED |
| `catalog.transportConfig.baseDistanceKm` | 100 | NOT_APPLIED — the legacy free-distance allowance is not part of the approved formula |

A vehicle type with no configured rate returns `TRANSPORT_RATE_NOT_CONFIGURED`
and blocks. Nothing falls back to 35 or 40.

---

## Rates live on the Project Head rate card

Vehicle rates are `TRANSPORT_VEHICLE_RATE` records on the rate card, versioned
and audited like every other commercial value. The Cost Engine resolves the rate
for the project's `vehicleType` and records the version it used.

## Current data state

`transportation.status = NOT_CONFIGURED`, `vehicles: []`.

The business has not supplied vehicle types or per-km rates, so this head blocks
every calculation with `TRANSPORT_RATE_NOT_CONFIGURED`. Open item **P2-M**.

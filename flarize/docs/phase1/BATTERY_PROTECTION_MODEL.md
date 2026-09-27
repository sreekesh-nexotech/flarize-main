# BATTERY PROTECTION MODEL

**Phase 1D** · supersedes the hardcoded per-component table from Phase 1C

---

## The rule that was removed

```
battery present  ->  add mb1 160A MCCB
```

This universal rule is gone. It was wrong in two directions: it added an MCCB to
an Enphase system that already has integrated protection, and it asserted a
**160 A rating** for every battery regardless of what that battery actually needs.

---

## The rule that replaced it

```
batteryProtectionMode = f(selected battery, selected inverter, architecture)
```

```
INTEGRATED         protection provided by the system itself   -> no external device, no generic DC cable
EXTERNAL_REQUIRED  a discrete protection device is required   -> device required; RATING comes from data
EXTERNAL_OPTIONAL  permitted but not mandatory
UNKNOWN            not yet confirmed by Engineering           -> existing template behaviour preserved, validation warns
```

`resolveProtectionRequirement(batteryMaster)` derives the mode from recorded
fields only:

| `integratedProtection` | `externalProtectionRequired` | mode |
|---|---|---|
| `true` | — | INTEGRATED |
| `false`/`null` | `true` | EXTERNAL_REQUIRED |
| `false`/`null` | `false` | EXTERNAL_OPTIONAL |
| `null` | `null` | UNKNOWN |

---

## Ratings are never assumed

`protectionRating` is `null` for every battery in the current data set, and
`resolveProtectionRequirement` returns `rating: null` with the reason:

> `external protection required; rating NOT recorded and must not be assumed`

`resolveBattery` raises `BATTERY_PROTECTION_RATING_UNRECORDED` in that state.

Explicitly, and permanently in this model:

- **160 A is not assumed.**
- **125 A is not assumed.**
- **No rating is derived from Ah.**
- **`bt1` is NOT permanently bound to `mb1` 160 A.** `bt1` is recorded as
  `externalProtectionRequired: true` with `protectionRating: null`. That is the
  standing Project/Engineering position: an external device is required; which
  device, at what rating, is open item **D12-E**.
- **`bt1` is `PENDING_ENGINEERING_APPROVAL`** (Phase 1D review correction, C50).
  An APPROVED status must not be implied by the fact that a battery resolves. See
  `BATTERY_SELECTION_MODEL.md` §8.

The generic `mb1` line continues to emit for `bt1` because that is the existing
approved template behaviour and this phase is numerically neutral. What changed
is that the *reason* is now data, and the rating is recorded as unknown rather
than implied by the part number.

---

## Topology separation (D12)

Deye/SEG DC-coupled and Enphase AC-coupled are different electrical topologies
and do not share a protection rule.

| | Deye / SEG (`bt1`) | Enphase (`bt2`) |
|---|---|---|
| mode | EXTERNAL_REQUIRED | INTEGRATED |
| external MCCB (`mb1`) | required (rating open) | **prohibited** |
| generic 25 mm DC battery cable | required | **prohibited** |
| protection provided by | discrete device, TBD | IQ System Controller |

`scripts/validate-bom.mjs` enforces both prohibitions as BLOCKED findings
(`BATTERY_MCCB_PROHIBITED`, `BATTERY_DC_CABLE_PROHIBITED`) when
`protectionMode === 'INTEGRATED'`.

---

## Severity when protection is unknown

Protection is the one field in `REQUIRED_FOR_SAFE_ISSUE`. A battery whose
`integratedProtection` is `null` cannot be validated safely, so the configuration
is **BLOCKED**, not warned. `bt3` and `bt4` are in exactly that state, which is
also why they are not engineering-approved and therefore never reach a BOM.

A battery whose protection **is** known but whose secondary data (voltage,
capacity, discharge current) is missing degrades to **WARNING** — reviewable, not
unsafe.

# AUTOMATIC ENGINEERING CHECKER

**Phase 1E** · `src/lib/engineeringChecker.js` · rules version `phase1e.1`

---

## Contract

```js
checkProjectBom({ bom, catalog, batteryMaster, at, catalogVersion, upgrade, futureUpgrade })
  -> { status, findings[], counts, rulesVersion, catalogVersion, at, deterministicKey }
```

`status` ∈ `VALID | WARNING | BLOCKED`. Every finding carries the full shape the
brief requires:

```js
{
  ruleId:        'PBC-H-002',
  category:      'BATTERY_PROTECTION',
  severity:      'BLOCKED',
  componentIds:  ['bt1'],
  message:       'External protection is required for "…" but no rating is recorded.',
  reason:        'The rating must not be assumed, substituted, or derived from Ah (D12-E).',
  source:        'D12-E — the rating must not be assumed or derived from Ah',
  inputs:        ['battery.externalProtectionRequired', 'battery.protectionRating'],
  rulesVersion:  'phase1e.1',
  catalogVersion: '…',
  at:            '2026-08-15T00:00:00Z'
}
```

A test asserts every field is present on every finding and that every `ruleId`
exists in the rule register.

---

## Categories A–S

All 19 categories from the brief have at least one rule. A test enforces that.

| | category | rules |
|---|---|---|
| A | system architecture | PBC-A-001/002 |
| B | panel ↔ inverter | PBC-B-001/002 |
| C | panel electrical limits | PBC-C-001 |
| D | inverter electrical limits | PBC-D-001/002/003 |
| E | battery ↔ inverter | PBC-E-001 |
| F | battery voltage | PBC-F-001/002 |
| G | battery current | PBC-G-001/002 |
| H | battery protection | PBC-H-001/002/003/004 |
| I | battery communication | PBC-I-001 |
| J | phase compatibility | PBC-J-001 |
| K | required component presence | PBC-K-001/002/003/004 |
| L | component quantity | PBC-L-001 |
| M | micro-inverter quantity | PBC-M-001/002/003 |
| N | branch / circuit constraints | PBC-N-001 |
| O | DCDB / ACDB configuration | PBC-O-001 |
| P | AC isolator | PBC-P-001/002 |
| Q | structure | PBC-Q-001 |
| R | upgrade configuration | PBC-R-001/002 |
| S | future upgrade | PBC-S-001 |

Battery categories E–I delegate to `batteryCompatibility.js` (BC-A…BC-J) rather
than re-implementing the logic, so there is one battery rule set, not two.

---

## No invented thresholds

Every limit compared against is a value **recorded in the catalog**:

- `panel.maxSysVoltage`, `panel.voc`, `panel.isc`, `panel.tempCoeffVoc`
- `inverter.maxInputVoltage`, `mpptVoltageMin/Max`, `mpptCount`, `maxStringsPerMppt`
- battery master data (Phase 1D)

The single derived value is cold Voc:

```
coldVoc = voc × (1 + tempCoeffVoc/100 × (15 − 25))
```

15 °C minimum cell temperature and 25 °C STC are **the existing App.jsx
stringConfig assumption**, cited as the rule's `source`. Nothing new was introduced.

Where a limit is not recorded, the checker says so and stops:

- `PBC-D-001` inverter maxInputVoltage not recorded
- `PBC-C-001` panel electrical data incomplete
- `PBC-F-002` / `PBC-G-002` battery voltage/current unverifiable
- `PBC-D-003` string length is not declared, so string voltage/current are unverifiable
- `PBC-N-001` branch/circuit constraints unverifiable in V1

These are WARNING, not silent PASS, and not a guessed limit.

---

## Severity policy

```
data missing AND safety-critical      -> BLOCKED
data present AND limit exceeded       -> BLOCKED
data missing AND not safety-critical  -> WARNING
```

Safety-critical today is battery protection: mode unknown (`PBC-H-001`) or an
external device required with no recorded rating (`PBC-H-002`). That follows
decision C44 and is deliberately narrow.

---

## Determinism (§12)

| requirement | how |
|---|---|
| no clock | `at` is a parameter. A test asserts `Date.now(` / `new Date(` / `Math.random(` do not appear in the code (comments stripped first). |
| no UI state | the checker takes a BOM and a catalog. Nothing else. |
| no dropdown / insertion order | `effectiveLines` sorts by role; category scan sorts keys; findings sort by `(ruleId, componentIds)`. Test 21 reverses the input order and asserts an identical verdict. |
| no nearest-kW fallback | a test asserts the string `nearest` does not occur in the code. |
| comparable identity | `deterministicKey` is the finding set without timestamps, so two runs can be compared directly. |

---

## What the checker will not do

It has no reference to `setComponent`, `setQuantity` or `removeRole`, and a test
asserts those names do not appear in its source. It cannot substitute, cannot
remove, cannot re-select, cannot zero a quantity. It returns findings, and the
Project Head decides what to do about them.

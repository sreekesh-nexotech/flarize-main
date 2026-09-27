# BATTERY COMPATIBILITY MODEL

**Phase 1D** · `src/lib/batteryCompatibility.js` · 10 checks A–J

---

## Principle

**No threshold is invented.** Where the data a check needs does not exist, the
check returns `INDETERMINATE` and names the exact missing field. It never
returns PASS by default, and it never manufactures a limit to compare against.

```
RESULT = PASS | FAIL | INDETERMINATE
```

---

## The ten checks

| id | name | needs | FAIL when |
|---|---|---|---|
| BC-A | System type compatibility | `compatibleSystemTypes` | system type not listed |
| BC-B | Inverter compatibility | `compatibleInverters` | selected inverter id not in list |
| BC-C | Voltage compatibility | `nominalVoltage` + inverter window | outside `batteryVoltageMin…Max` |
| BC-D | Current compatibility | `maximumDischargeCurrent` + `inverter.maxBatteryCurrent` | battery below inverter requirement |
| BC-E | Communication compatibility | `communicationProtocol` + `inverter.communicationProtocols` | protocol unsupported |
| BC-F | Phase compatibility | `compatiblePhases` | phase not listed |
| BC-G | Protection requirement | `integratedProtection` | — (see below) |
| BC-H | Battery capacity | `capacityKwh` | — (informational) |
| BC-I | Battery quantity | — | quantity < 1 with a battery selected |
| BC-J | Manufacturer / architecture | — | Enphase↔non-Enphase mismatch |

BC-J is the one rule that is fully **decided** (D12): an ENPHASE architecture
accepts only an Enphase battery, and an Enphase battery cannot be placed on a
non-Enphase architecture. Everything else depends on data that Engineering has
not yet recorded.

---

## Severity policy

```
any check FAILs                                    -> BLOCKED
missing data that is safety-critical               -> BLOCKED   "Cannot safely validate this battery configuration"
missing data that is not safety-critical           -> WARNING   "Engineering data incomplete — review required"
otherwise                                          -> VALID
```

Safety-critical today is exactly `REQUIRED_FOR_SAFE_ISSUE = ['integratedProtection']`,
plus the case where external protection is required but `protectionRating` is not
recorded. Both are marked `safetyCritical: true` on the check detail. The list is
deliberately short and explicit; widening it is an engineering decision, not a
code convenience.

---

## Current data state

| battery | engineeringStatus | BC-G | overall |
|---|---|---|---|
| `bt1` SEG.5 PRO 100AH LV | **PENDING_ENGINEERING_APPROVAL** | EXTERNAL_REQUIRED, rating **not recorded** | **BLOCKED** — safety-critical INDETERMINATE |
| `bt2` Enphase Flex Battery | APPROVED | INTEGRATED via IQ System Controller | WARNING (electrical data open) |
| `bt3` Okaya 100AH | PENDING_ENGINEERING_APPROVAL | unknown | **BLOCKED** — not selectable |
| `bt4` Livguard 100AH | PENDING_ENGINEERING_APPROVAL | unknown | **BLOCKED** — not selectable |
| `ba_3b51aef23f0b` New Battery | REJECTED / INACTIVE | n/a | never selectable |

Every one of these records exists in `data/battery-master.json` with an
`engineeringNotes` string and an `openItems` list naming what is still missing.
**No record was deleted.**

---

## What this model cannot yet do

`compatibleInverters` is `null` for every battery, so BC-B is INDETERMINATE
everywhere. The brief's requirement — *"a battery may be compatible with one Deye
inverter and incompatible with another"* — is **modelled and enforced** (the
check exists, the field is per-model, and a non-listed inverter FAILs) but is not
yet **populated**, because that data does not exist in the source and must not be
invented. Populating it is an open engineering item, not a code change.

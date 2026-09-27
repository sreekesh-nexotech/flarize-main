# VALIDATION STATUS MODEL

**Phase 1E** · `engineeringChecker.js` + `bomStatus.js`

---

## Three statuses, one derivation

```
any BLOCKED finding    -> BLOCKED
else any WARNING       -> WARNING
else                   -> VALID
```

There is no fourth state and no "VALID with issues". A configuration is either
buildable, buildable-with-review, or not buildable.

| status | meaning | quotation | BOM lock |
|---|---|---|---|
| **VALID** | every evaluable check passed and nothing safety-critical is unrecorded | yes | yes |
| **WARNING** | nothing failed, but something could not be verified | yes | only with acknowledgement |
| **BLOCKED** | a check failed, or safety-critical data is missing | no | **no** |

---

## What each severity means

**BLOCKED** — one of:

- a limit recorded in the catalog is exceeded (`PBC-B-002`, `PBC-D-002`, `PBC-F-001`, `PBC-G-001`)
- an architecture rule is violated (`PBC-A-002`, `PBC-M-001/002/003`, `PBC-H-004`)
- a required role is missing, unresolvable, or not ACTIVE (`PBC-K-001…004`, `PBC-Q-001`)
- safety-critical data is unrecorded (`PBC-H-001`, `PBC-H-002`)
- an approved-decision rule is broken (`PBC-P-001` D11, `PBC-P-002` D11-C, `PBC-R-001`)

**WARNING** — the check could not be evaluated because an input is not recorded.
Never a guess, never a silent pass. The missing field is always named.

---

## BLOCKED is not a software failure

When engineering data is incomplete, BLOCKED is the **correct** output. The
system is refusing to certify something it cannot verify. Four hybrid Value
packages are BLOCKED today because `bt1` has no recorded protection rating
(open item D12-E) and is `PENDING_ENGINEERING_APPROVAL` — that state clears when
Engineering supplies the data, not when the code is changed.

The temptation this model is built against: making validation pass by weakening
the rule, assuming a rating, or hiding the component. All three are prohibited.

---

## Status is not authority

`statusFromValidation()` maps a checker result onto the `BOM_STATUS` lifecycle
(`DRAFT → VALID/WARNING/BLOCKED → APPROVED`). The checker produces the technical
verdict; the lifecycle records what the organisation then did about it. A human
APPROVED does not overwrite a technical BLOCKED — `canLockProjectBom` still
consults the gate.

---

## Presentation

```
🔴 2 blockers   🟠 1 warning   🟢 remaining checks passed
[ FIX CONFIGURATION ]
```

`lockSummary(validation)` returns exactly `{ blockers, warnings, canLock, label }`
so the header and the lock button read from one source and cannot disagree.

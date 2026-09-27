# COMMERCIAL CONFIGURATION HISTORY

**Phase 2A §18–§19** · `src/lib/commercialHistory.js`

---

## Every commercial value is a versioned record

Not a field that gets overwritten. A landed cost moving ₹8,950 → ₹9,200 does not
edit a number — it appends a version and supersedes the old one.

```
LC-011  ₹8,950  effective 01 Aug  Procurement  "Supplier revision"   SUPERSEDED
LC-012  ₹9,200  effective 20 Aug  Procurement  "New supplier price"  ACTIVE
```

Audited configuration types:

```
PROCUREMENT_PRICE · INSTALLATION_RATE · TRANSPORT_VEHICLE_RATE ·
SITE_SURVEY_RATE · ENGINEERING_DESIGN_RATE · SERVICE_RATE ·
SPECIAL_WORK_RATE · MARGIN · MISCELLANEOUS_PCT · GST_CONFIG
```

Each type has exactly one owner — Procurement, Project Head or Admin. **Sales
owns none**, asserted by test.

---

## Mandatory audit fields

```
versionId · changedBy · changedAt · changeReason · effectiveFrom
```

All five are required. Omitting any one throws `MISSING_AUDIT_FIELDS` — a
commercial change cannot be anonymous, undated or unexplained. A test omits each
field in turn and asserts the throw.

Each version also records `previousVersionId`, `effectiveTo`, `supersededBy` and
`status`.

---

## Append-only

```
ACTIVE → SUPERSEDED → (ARCHIVED)
```

`appendVersion` returns a NEW store; the input is never mutated. There is no
`updateVersion`, no `deleteVersion` and no `splice` in the module — a test
asserts all three strings are absent. Archiving marks a version `ARCHIVED` and
keeps its value readable; it does not remove anything.

Exactly one `ACTIVE` version exists per record at a time, and
`getVersionEffectiveAt` selects exactly one applicable version for a given date.

---

## The API a future UI will use

```js
getHistory(store, configType, recordId)          // chronological, oldest first
getCurrentVersion(store, configType, recordId)   // the one ACTIVE version
getVersion(store, configType, recordId, id)      // any version, forever
getVersionEffectiveAt(store, type, id, date)     // what applied on that date
compareVersions(oldVersion, newVersion)          // field · oldValue · newValue
historyView(store, configType, recordId)         // { current, history[] }
```

`compareVersions` returns only the fields that actually changed, plus who
changed them, when and why:

```
landedUnitCost  8950 → 9200
purchasePrice   8600 → 8850
(supplier unchanged, so not listed)
```

`historyView` is the shape a screen needs — CURRENT above, HISTORY below. **No UI
is built in Phase 2A**; the domain simply supports one.

---

## Determinism

No clock. `changedAt` and `effectiveFrom` are supplied by the caller, so the same
inputs always produce the same history and the same comparison.

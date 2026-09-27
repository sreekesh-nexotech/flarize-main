# PROCUREMENT WORKSPACE — PHASE 3, PART F

**Status:** delivered 2026-08-16. Purely additive.
**Authority:** `docs/DECISION_LOG.md`. This document describes an implementation, it decides nothing.
**Decisions applied:** C63, C74, C92, C93, C95, C96, C64.

---

## WHAT IT IS

The screen through which Procurement records what was actually bought, what the
supplier actually charged to deliver it to our warehouse, and therefore what a
component actually costs us. Until this existed, `MATERIAL_LANDED` could only
ever return `LANDED_COST_NOT_CONFIGURED`, because there was no way to enter a
landed cost at all.

```
SUPPLIER -> PURCHASE BATCH -> MATERIAL LINES -> PURCHASE PRICE
-> PROCUREMENT DELIVERY / OTHER PROCUREMENT CHARGES
-> PURCHASE-VALUE ALLOCATION -> RECONCILED ALLOCATION -> LANDED UNIT COST
-> VERSIONED PRICE MASTER -> COST ENGINE
```

## FILES

| File | Role |
|---|---|
| `src/lib/procurementWorkspace.js` | application service layer — composes the frozen engines, contains no formula |
| `server-procurement.js` | HTTP transport, `/api/procurement/*` |
| `public/procurement.html` | screens A–E; renders API output, computes nothing |
| `tests/phase3-procurement.test.mjs` | 22 tests, mostly negative assertions |
| `server-workspace.js` | **2 additive hunks only** — `require`, `init` hook, `register` call |

`src/App.jsx`, `data/catalog.json`, every engine and every existing test are untouched.

## SCREENS

| | Screen | What it shows |
|---|---|---|
| A | Procurement dashboard | suppliers, batches, and every component that has a committed landed cost, with its version |
| B | New purchase batch | supplier, batch id/date/reference, material lines, quantity, purchase unit price, delivery cost, other charges, allocation method |
| C | Allocation review | per-material purchase value, share %, allocated delivery, landed unit cost, and the **exact** reconciliation to the entered delivery charge |
| D | Material / landed cost detail | `purchase price + allocated delivery + other procurement charges = landed unit cost`, plus the engine's own formula string, source and version |
| E | Price history / comparison | every version, oldest readable, previous-vs-current field diff |

## THE MODEL, AS IMPLEMENTED

### Two values, never merged

`purchasePrice` is what the supplier charges. `landedUnitCost` is what the
component costs us once it is in our warehouse. Both are stored on every price
version. **Only `landedUnitCost` enters project material cost** — the Cost
Engine's own `projectUnitCost` refuses anything else, and this layer never
substitutes one for the other.

### Allocation

Purchase-value proportion, and only that. `WEIGHT`, `VOLUME`, `QUANTITY` and
`EQUAL_SPLIT` are refused by name with an error; they never silently fall back.
The allocated amounts are reconciled by the frozen engine so they sum
**exactly** to the entered delivery charge — a 5,000 charge never allocates to
4,999.

### Scope

Procurement delivery is **supplier → warehouse**. Project transportation
(**warehouse → customer site**) is a separate Project Head cost head. Six field
names that could carry it are refused by name at the batch, charges and line
boundaries, and the batch engine refuses `projectTransportCost` again behind
that. `procurementWorkspace.js` does not import `costEngine.js` at all.

### Versioning

Every commit appends one `PROCUREMENT_PRICE` version per material line via
`commercialHistory.appendVersion`. Append-only: the previous ACTIVE version
becomes SUPERSEDED and stays readable forever. Version ids are **derived**
(`<batchId>::<componentId>`) — no clock, no counter, no randomness — which is
what makes a double commit impossible rather than merely discouraged.

A committed batch is immutable. A price correction is a new batch, not an edit.

### The price master is a projection

`priceMasterView(store)` is computed from the history store on every call.
There is no second table of current prices that could drift from the audit
trail, and no second history mechanism. `priceMasterView(store, { asOf })` reads
historic versions, so an old price stays queryable by date as well as by id.

### Nothing is invented

- The delivery charge must be **entered**. An absent charge is not zero; the
  batch simply cannot be committed.
- A component with no committed version is **absent** from the price master, so
  the Cost Engine reports its own `LANDED_COST_NOT_CONFIGURED`. It is never
  handed a zero.
- `effectiveFrom` and `changeReason` are mandatory; `commercialHistory` refuses
  an un-audited version regardless.

## RBAC

Writes require `CAPABILITY.PROCUREMENT_PRICE_EDIT` **and** ownership of
`CONFIG_TYPE.PROCUREMENT_PRICE` (`CONFIG_OWNER` — PROCUREMENT). ADMIN,
PROJECT_HEAD, ENGINEERING, SALES and SALES_HEAD are all refused at the service
boundary, not merely greyed out in the UI. Reads require
`COMMERCIAL_HISTORY_VIEW`, which SALES does not have.

`rbac.assertOwnsConfig` is deliberately not reused: it gates on
`COMMERCIAL_CONFIG_EDIT`, the ADMIN commercial-configuration path. The ownership
constant consulted is the same one either way. **`rbac.js` was not modified.**

**P3-D is not solved here.** The acting role is still operator-asserted, and
`GET /api/procurement/session` says so in `identityModel` / `identityNote`.

## COST ENGINE INTEGRATION

The Cost Engine was **not modified**. It already consumes
`priceMaster = { componentId: record }`. On commit the transport writes
`data/procurement-price-master.json` (the projection) and
`data/commercial-history.json` (the one history store), then calls the
workspace layer's `onCommit` hook, which rebuilds its environment. The next
cost calculation sees the new landed-cost version.

## KNOWN CONSTRAINT — NOT INVENTED AROUND

**Batch-level "other procurement charges" have no approved allocation basis.**

C95 approves purchase-value proportion for the **delivery** charge. No recorded
decision extends it to a batch-level pool of other procurement charges, and the
frozen batch engine allocates only the delivery cost. Rather than invent a
second allocation, the UI takes other charges **per line, entered explicitly**
(which is what the engine's contract supports) and treats any batch-level figure
as a **control total** that must reconcile exactly to the sum of the per-line
amounts. A mismatch blocks the commit.

If Procurement needs a genuine batch-level other-charge pool that is allocated
rather than typed per line, that is a **decision request**, not a code change.
See `docs/phase3/DECISION_REQUEST_OTHER_PROCUREMENT_CHARGES.md`.

## API

```
GET    /api/procurement/session
GET    /api/procurement/dashboard
GET    /api/procurement/materials
GET    /api/procurement/price-master[?asOf=]
GET    /api/procurement/suppliers
POST   /api/procurement/suppliers
GET    /api/procurement/batches
POST   /api/procurement/batches
GET    /api/procurement/batches/:id
PUT    /api/procurement/batches/:id/lines
PUT    /api/procurement/batches/:id/charges
GET    /api/procurement/batches/:id/allocation
POST   /api/procurement/batches/:id/commit
GET    /api/procurement/materials/:componentId[?asOf=]
GET    /api/procurement/materials/:componentId/history
GET    /api/procurement/materials/:componentId/compare?from=&to=
```

UI: `http://localhost:4800/procurement.html`

## VERIFICATION AT DELIVERY

```
node --test tests/*.test.mjs   312 pass / 0 fail   (290 existing + 22 PART F)
npx vite build                 dist/assets/index-vy7RQ7xF.js   382.17 kB   name unchanged
sha256 src/App.jsx             97dfe333…d84c3   unchanged
sha256 data/catalog.json       8147aca9…3e3345  unchanged
tree diff vs source archive    4 files added, server-workspace.js +2 hunks, nothing else
```

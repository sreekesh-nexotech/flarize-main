# SERVICE / AMC MODEL

**Phase 2A (service correction)** · §7 + **decision C9** · owner: **PROJECT HEAD**

---

## Approved formula (C9)

```
internalServiceCost = costPerVisit × visitsPerYear × serviceYears
```

Applies up to `sizeLimitKw` = **10 kW**.

```
costPerVisit · visitsPerYear · serviceYears · sizeLimitKw · version
```

All three values are **separately configurable** and owned by Project Head. Each
is an independent commercial lever: doubling the visits doubles the cost, and a
test asserts exactly that.

---

## Why not an annual rate

An earlier Phase 2A implementation used `annualCost × serviceYears`. That was
**wrong** — it contradicts the authoritative decision C9 and it reproduces the
exact defect C9 was written to fix:

> "There is no visits-per-year term at all" — C9, on the legacy engine
> (`App.jsx:1853`, `serviceRateYear × serviceYears`).

An annual rate *hides* `visitsPerYear` inside a single number. Two services a
year and four services a year then look identical to the cost engine, and a
change in service policy silently fails to move the cost. The per-visit form
keeps the term visible and editable.

The engine now contains no annual-rate path at all — a test asserts the string
`annualCost` does not appear in `costEngine.js`, so an annual-shaped
configuration cannot compute by accident. It returns
`SERVICE_CONFIG_INCOMPLETE`.

---

## Approved values (supplied 2026-08-16)

```
costPerVisit   ₹1,000
visitsPerYear  2
serviceYears   5
sizeLimitKw    10

₹1,000 × 2 × 5 = ₹10,000 internal service cost
```

Business meaning: ₹2,000 per year, two planned service visits a year, a five-year
internal service period. **Breakdown handling is included in this figure** —
there is deliberately no separate breakdown cost head, and a test asserts no head
name contains "BREAKDOWN".

The ₹2,000/year figure is retained only as `annualEquivalentMetadata`, marked
`EXPLANATORY_METADATA_ONLY`. It explains the business meaning; it is never a
calculation input. The engine contains no annual-rate path — a test asserts the
identifier `annualCost` does not appear in `costEngine.js`.

This closes the P2-N ambiguity that C9 flagged: ₹2,000 was the **annual** figure,
and the per-visit rate is ₹1,000 across two visits.

Any missing value still returns `SERVICE_CONFIG_INCOMPLETE` and blocks the total —
a test deletes each of the three in turn.

---

## Above the size limit

A project above 10 kW returns `SERVICE_OUT_OF_COVERAGE`. No rate is approved
above the limit and none is extrapolated.

---

## Internal cost vs customer AMC price

This head is the **internal** cost of servicing the plant — what it costs Flarize
to send an engineer.

A **customer-facing AMC price** is a different concept with a different owner. It
is not modelled here; `customerFacingAmcPrice` exists in the config and is
`null`. If an AMC is sold to the customer it is priced as a `CUSTOMER_EXTRA`
through the Pricing Engine, carries `includedInBase: false`, and does not move
the base system margin — asserted by test.

The two are never merged and never substituted for one another.

# PROJECT HEAD RATE CARD

**Phase 2A** · `src/lib/projectRateCard.js` (on `commercialHistory.js`)

---

## One place for every operational rate

| area | rateType | recordId example |
|---|---|---|
| A. Installation | `INSTALLATION_RATE` | `3kW/FLAT` |
| B. Transportation | `TRANSPORT_VEHICLE_RATE` | `PICKUP` |
| C. Site survey | `SITE_SURVEY_RATE` | `STANDARD` |
| D. Engineering / design | `ENGINEERING_DESIGN_RATE` | `<=20kW`, `>20kW` |
| E. Service / AMC | `SERVICE_RATE` | `STANDARD` |
| F. Special project work | `SPECIAL_WORK_RATE` | `CRANE` |

Every record carries:

```
rateId · rateType · configuration · rate · unit · size/range
effectiveFrom · effectiveTo · version · status
changedBy · changedAt · changeReason · previousVersionId
```

---

## No commercial rate lives in the Cost Engine

The engine asks `resolveRate(card, { rateType, recordId, at })` and receives
either a rate **with its version**, or an explicit `RATE_NOT_CONFIGURED` —
never a nearest match, a first-available or a default.

A test strips comments from `costEngine.js` and asserts the numeric literals
`15000`, `500`, `1000` and `3000` do not appear anywhere in it.

`seedRateCardFromConfig()` builds the card from `data/cost-config.json`, and even
seeding writes a full audit entry: there is no un-audited way to create a rate.

---

## Versioned like a procurement price

Changing a rate is an **append**, never an edit. The previous version becomes
`SUPERSEDED` with an `effectiveTo`, and stays readable forever.

```
V-1  ₹30/km  effective 01 Aug  Project Head  "initial"            SUPERSEDED
V-2  ₹34/km  effective 01 Sep  Project Head  "fuel price increase" ACTIVE
```

`resolveRate(..., { at: '2026-08-15' })` returns ₹30; `at: '2026-09-15'` returns
₹34. A quotation locked in August keeps ₹30 forever.

---

## Units are never assumed

Installation supports `PER_PROJECT` and `PER_KW`, and the engine uses **the unit
stored on the rate record**. A record without a valid unit fails with
`INSTALLATION_COST_NOT_CONFIGURED` rather than defaulting to either. Where the
business has not yet stated which unit a future size band uses, the engine takes
no position — the rate record must say.

---

## Adding a size band is configuration, not code

3, 5, 6, 8, 10 kW are seeded today. 12, 15, 20 kW and beyond are added by writing
a rate record. No code changes, no redeploy, and no size is ever inferred from a
neighbouring one.

# GST POLICY

**Phase 2A §18**

---

## One regime, applied once, at the end

```
TOTAL ACTUAL COST
      ↓  ÷ (1 − grossMargin)
SELLING PRICE BEFORE GST
      ↓  × gstRate
GST
      ↓
CUSTOMER TOTAL
```

```
priceExcludingGST · gstAmount · priceIncludingGST
```

All three are distinct fields on the PricingResult. There is no field that is
ambiguously "the price".

---

## GST is never inside a cost head

Not in material, structure, installation, site survey, engineering/design,
transport, service, miscellaneous or office allocation. A test asserts no cost
head's inputs contain a GST reference, and the gross-margin calculation operates
on a pre-GST cost only.

---

## Approved regime — SOLAR_70_30_COMPOSITE (C73)

A solar plant supply is split by **value**, and each part is taxed at its own
statutory rate:

```
GOODS    70% of the supply  @  5%   ->  3.5
SERVICE  30% of the supply  @ 18%   ->  5.4
                            effective  8.9%
```

```
gst.regime                SOLAR_70_30_COMPOSITE
gst.goodsValuationPct     70
gst.goodsRatePct          5
gst.serviceValuationPct   30
gst.serviceRatePct        18
gst.effectiveRatePct      8.9        <- cross-check only
gst.appliesTo             SELLING_PRICE_BEFORE_GST
gst.version               gst@2026-08-15.2
```

**8.9% is an output, not an input.** The engine computes the goods and service
components separately and sums them. `effectiveRatePct` in the config is a
cross-check: if it disagrees with the split, the engine returns
`GST_EFFECTIVE_RATE_MISMATCH` and **the split wins**. Declaring 9% against this
split is rejected, not quietly accepted.

Worked example on a ₹2,50,000 pre-GST selling price:

| component | taxable value | rate | tax |
|---|---|---|---|
| GOODS | 175,000 (70%) | 5% | 8,750 |
| SERVICE | 75,000 (30%) | 18% | 13,500 |
| **total** | 250,000 | **8.9%** | **22,250** |

Both components are reported on the PricingResult (`gstComponents`, each with
its taxable value, rate, amount and formula) so an invoice can show the split
rather than only a blended number.

## Supersedes the legacy flat 9%

The legacy engine applied `Flat 9% GST on selling price`. That was an
approximation of this split and **overstated tax by 0.1 percentage point** —
₹22,500 against ₹22,250 on the example above. A test asserts exactly that
₹250 difference so the change is visible rather than incidental.

`FLAT` remains a supported regime for configurations that genuinely have one
rate, and for regression against the legacy behaviour. **Only one regime is ever
applied to a given price** — a test asserts the composite produces two
components and the flat regime produces one, never both.

## Validation

```
GST_NOT_CONFIGURED           no regime and no rate — nothing is assumed
GST_REGIME_INVALID           unrecognised regime name
GST_SPLIT_INVALID            valuation split does not total 100%, or a field is missing
GST_EFFECTIVE_RATE_MISMATCH  declared effective rate disagrees with the split
```

**Two GST regimes are never run at the same time.** The legacy engine also
carried per-line `gst`/`gstAmt` fields on BOM lines; those belong to the
engineering BOM display and are not a second commercial tax calculation. The
Pricing Engine computes GST exactly once, on the pre-GST selling price.

**Open item P2-G is now CLOSED** by decision C73: the approved treatment is the
70/30 composite above.

---

## Extras

An extra with no `gstRatePct` follows the **system regime** — a net-metering
charge is therefore taxed 70/30 like the base supply. An extra that declares its
own `gstRatePct` is taxed FLAT at that rate on the extra alone, which is how a
pure-service extra at 18% is expressed.

Base-system GST and extra GST are computed independently, reported separately,
and summed only in `customerTotalIncludingGST`.

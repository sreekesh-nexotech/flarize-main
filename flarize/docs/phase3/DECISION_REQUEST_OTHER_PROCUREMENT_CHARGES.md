# DECISION REQUEST — BATCH-LEVEL OTHER PROCUREMENT CHARGES

**Raised:** 2026-08-16, during Phase 3 PART F.
**Owner of the answer:** Procurement + Admin.
**Blocks:** nothing today. PART F ships without it.
**Do not answer this in code.** It is a commercial rule, not a developer choice.

---

## THE QUESTION

C95 approves **PURCHASE_VALUE_PROPORTION** as the allocation basis for the
procurement **delivery** charge (supplier → warehouse).

It does not say anything about a batch-level pool of **other procurement
charges** — unloading, handling, packing, inspection, warehouse-in fees — that
arrive as one figure on a supplier invoice and cover several materials at once.

**Is a batch-level other-charge pool allocated by purchase-value proportion the
same way delivery is, or must it be entered per material line?**

## WHAT WAS DONE INSTEAD OF GUESSING

`procurementBatch.js` (frozen) allocates only `deliveryCost`. It accepts other
procurement charges **per line, entered explicitly**, and adds them to that
line's landed cost. No rule derives them.

PART F therefore:

- takes other procurement charges **per material line**;
- accepts an optional batch-level figure as a **control total only**;
- **blocks the commit** if the per-line amounts do not sum exactly to that
  control total (`OTHER_CHARGES_NOT_RECONCILED`).

Nothing is allocated by an unapproved basis, and nothing is silently dropped.

## OPTIONS

| # | Option | Consequence |
|---|---|---|
| A | Other charges stay **per line, entered** | No change. Current behaviour. Procurement types the split from the invoice. |
| B | Batch-level pool, allocated by **PURCHASE_VALUE_PROPORTION** | Extends C95 to a second pool. Requires an engine change to `procurementBatch.js`, which is frozen — so it needs an explicit decision first. |
| C | Batch-level pool, allocated by some other basis | Would require naming the basis. Weight / volume / quantity / equal split are forbidden by C95's reasoning; a new basis needs its own decision. |

Recommended default if no answer arrives: **A**. It is what the frozen engine
already supports, it invents nothing, and it stays exactly reconcilable to the
supplier invoice.

## WHAT AN ANSWER MUST CONTAIN

1. Whether a batch-level other-charge pool exists as a real invoice line.
2. If yes, the allocation basis, stated by name.
3. Whether historic committed versions are re-stated or left as recorded
   (append-only says: left as recorded).

# OWNERSHIP MATRIX

**Phase 2A §29**

---

## Who owns what

| Owner | Owns | Cost head |
|---|---|---|
| **PROCUREMENT** | purchase prices, supplier, availability, purchase history | MATERIAL |
| **PROJECT HEAD** | installation rates, structure rates, site survey cost, engineering/design cost, service/AMC rules | STRUCTURE · INSTALLATION · SITE_SURVEY · ENGINEERING_DESIGN · SERVICE_AMC |
| **ADMIN** | transport rate/km, office expense, expected projects/month, miscellaneous rules, gross margin, GST configuration | TRANSPORTATION · MISCELLANEOUS · OFFICE_EXPENSE_ALLOCATION · margin · GST |
| **SALES** | the customer-facing quotation workflow (a later phase) | none |

`COST_HEAD_OWNER` encodes this in code and every trace line carries its owner.
A test asserts the owner set is exactly `{ADMIN, PROCUREMENT, PROJECT_HEAD}` —
Sales owns no cost assumption.

---

## The full authority chain

| Concern | Authority |
|---|---|
| What are we building? | Project Head (selection) + Engineering Checker (validity) |
| What does it cost us? | **Cost Engine**, from the locked BOM and owned configuration |
| What do we sell it for? | **Pricing Engine**, from the cost result and the approved margin |
| How is it presented? | Quotation — a later phase |

---

## Sales cannot move a number

Sales owns no cost head, no rate, no margin and no price type. Combined with
`SALES_IMMUTABLE_ROLES` from Phase 1D, Sales can change neither the engineering
selection nor any commercial assumption behind the price.

RBAC enforcement at the transport layer is a later phase. Phase 2A expresses the
rules as data and functions so that layer has something exact to enforce.

---

## Cross-boundary writes

`procurementBoundary.js` (Phase 1D) already rejects Procurement writing an
engineering field and Project Head writing a purchase price. Phase 2A extends
the same principle to the commercial configuration: each config block records
its `owner` and its own `version`, so a change is always attributable to a role
and a version.

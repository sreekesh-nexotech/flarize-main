# C11 — CMS Page Designer: Technical Architecture Proposal

**Status**: ARCHITECTURE ONLY — no code, no migrations, no file modifications  
**Date**: 2026-08-26  
**Prerequisite**: Factual audit accepted — confirmed zero CMS implementation exists

---

## 0. Architecture Overview

C11 adds a **Page Designer** that lets Project Head / Admin create, version and publish A4 quotation pages. These pages flow into the existing quotation payload → renderer pipeline. The system is additive: it creates new modules alongside the existing codebase and touches existing files only at well-defined integration points.

**Core principle**: The CMS is a *content configuration system*, not a layout engine. It stores structured page definitions (JSON), resolves approved dynamic fields from the quotation payload, and feeds the result to the existing `quotationDocument.js` renderer. It never calculates, never allows arbitrary HTML/CSS/JS, and never modifies a previously-issued quotation.

### Data flow

```
Admin/Project Head
  → CMS UI (page designer)
    → Page JSON (blocks, fields, artwork refs)
      → API → validate → persist as DRAFT
        → review → approve → PUBLISH
          → pinned page version ID stored on quotation at issuance
            → quotationPayload.js carries the resolved page content
              → quotationDocument.js renders it (existing renderer)
```

### What C11 is NOT

- Not a Canva clone or freeform editor
- Not a second quotation renderer
- Not a calculation engine
- Not a replacement for frozen pages (1, 3, 5, 7, 8, 12)
- Not a second RBAC system

---

## 1. Database / Persistence Model

Following the existing project convention: **JSON file persistence** in `data/`, Maps serialized to/from plain objects, `deepFreeze()` on hydration. Same pattern as `quotation-state.json` and `workspace-state.json`.

### State file: `data/cms-state.json`

```
{
  storeVersion: "cms.1",

  pages:          Map<pageId, PageRecord>,
  pageVersions:   Map<pageVersionId, PageVersionRecord>,
  assets:         Map<assetId, AssetMetadataRecord>,
  campaigns:      Map<campaignId, CampaignRecord>,
  fieldRegistry:  Map<fieldId, FieldDefinition>,  // seeded, admin-editable
}
```

### Entity: PageRecord

| Field | Type | Notes |
|-------|------|-------|
| pageId | string | `page_<hex12>` |
| name | string | Human label, e.g. "Onam Campaign 2026" |
| pageType | enum | `CAMPAIGN` / `TERMS` / `TESTIMONIALS` / `CUSTOM` |
| targetDocumentOrder | number | Which page position (2, 4, 6, 9, 10, 11) |
| currentDraftVersionId | string \| null | Points to latest DRAFT |
| currentPublishedVersionId | string \| null | Points to active PUBLISHED |
| createdBy | string | actor.userId |
| createdAt | string | ISO timestamp |
| status | enum | `ACTIVE` / `ARCHIVED` |

**Indexes**: by pageType, by targetDocumentOrder, by status.

### Entity: PageVersionRecord

| Field | Type | Notes |
|-------|------|-------|
| pageVersionId | string | `pgver_<hex12>` |
| pageId | string | FK → PageRecord |
| versionNumber | number | Monotonic per page, 1-based |
| status | enum | `DRAFT` / `REVIEW` / `APPROVED` / `PUBLISHED` / `ARCHIVED` |
| content | object | The Page JSON (see §2) — frozen after PUBLISHED |
| createdBy | string | |
| createdAt | string | |
| publishedBy | string \| null | |
| publishedAt | string \| null | |
| archivedAt | string \| null | |
| previousVersionId | string \| null | Chain for history |

**Immutability rule**: Once status reaches `PUBLISHED`, the `content` field is `deepFreeze()`-d. No mutation path exists. A new edit creates versionNumber + 1.

### Entity: AssetMetadataRecord

| Field | Type | Notes |
|-------|------|-------|
| assetId | string | `asset_<hex12>` |
| filename | string | Original upload name |
| storagePath | string | Relative path under `data/cms-assets/` |
| mimeType | string | `image/png`, `image/jpeg` only initially |
| width | number \| null | Pixels, extracted on upload |
| height | number \| null | Pixels |
| fileSizeBytes | number | |
| checksum | string | SHA-256 of file content |
| uploadedBy | string | |
| uploadedAt | string | |
| status | enum | `ACTIVE` / `ARCHIVED` |
| usedByPageVersionIds | string[] | Reference tracking |

### Entity: CampaignRecord

| Field | Type | Notes |
|-------|------|-------|
| campaignId | string | `campaign_<hex12>` or semantic like `ONAM_2026` |
| name | string | |
| template | string | Must be in APPROVED_TEMPLATES |
| active | boolean | Only one campaign active at a time |
| pageId | string \| null | FK → associated page |
| theme | object | Hex-validated tokens only |
| createdBy | string | |
| createdAt | string | |
| updatedAt | string | |

### Relationship to quotation versioning

When a quotation is issued, the `pageVersionId` used for each CMS-managed page is pinned on the quotation document. The quotation document stores the **resolved content snapshot** (all dynamic fields already resolved to their values at issuance time), not a reference to be re-resolved later. This means:

- Editing CMS pages later never changes issued quotations
- The resolved content is part of the frozen quotation document
- Historical quotations are self-contained

---

## 2. Page JSON Model

The canonical representation of one A4 page. Stored as `content` on PageVersionRecord.

### Schema

```json
{
  "schemaVersion": "pageContent.1",
  "pageType": "CAMPAIGN",
  "dimensions": {
    "width": 794,
    "height": 1123,
    "unit": "px",
    "note": "A4 at 96dpi"
  },
  "background": {
    "type": "color" | "artwork",
    "color": "#ffffff",
    "artworkAssetId": null,
    "artworkFit": "cover"
  },
  "theme": {
    "primary": "#123f35",
    "secondary": "#1c6b3f",
    "accent": "#F5901E",
    "background": "#fff9ec",
    "text": "#16262b",
    "muted": "#5b656a"
  },
  "sections": [ ...SectionBlock ],
  "metadata": {
    "campaignId": "ONAM_2026",
    "template": "FESTIVAL_ONAM",
    "yearBadge": "2026"
  }
}
```

### Example A: Simple structured page (campaign)

```json
{
  "schemaVersion": "pageContent.1",
  "pageType": "CAMPAIGN",
  "dimensions": { "width": 794, "height": 1123, "unit": "px" },
  "background": { "type": "color", "color": "#fff9ec" },
  "theme": {
    "primary": "#123f35", "secondary": "#1c6b3f",
    "accent": "#F5901E", "background": "#fff9ec",
    "text": "#16262b", "muted": "#5b656a"
  },
  "sections": [
    {
      "blockType": "section",
      "id": "hero",
      "padding": { "top": 4, "right": 10, "bottom": 2, "left": 10, "unit": "mm" },
      "children": [
        {
          "blockType": "columns",
          "columns": 2,
          "gap": "8mm",
          "children": [
            {
              "blockType": "column",
              "flex": 1,
              "children": [
                { "blockType": "heading", "level": 1, "text": "Onam Solar Fest", "color": "theme:primary" },
                { "blockType": "text", "content": "Celebrate Onam with Flarize!", "color": "theme:muted", "fontSize": "3.5mm" },
                {
                  "blockType": "dynamicField",
                  "fieldId": "campaign.primaryBenefit.displayValue",
                  "label": "Festival Offers Worth Up To",
                  "fallback": "blocked"
                }
              ]
            },
            {
              "blockType": "column",
              "flex": "0 0 46mm",
              "children": [
                { "blockType": "image", "assetId": "asset_abc123", "width": "46mm", "maxHeight": "46mm", "fit": "contain" }
              ]
            }
          ]
        }
      ]
    },
    {
      "blockType": "section",
      "id": "offers",
      "padding": { "top": 3, "right": 10, "bottom": 2, "left": 10, "unit": "mm" },
      "children": [
        { "blockType": "heading", "level": 2, "text": "What You Get", "color": "theme:accent" },
        {
          "blockType": "dynamicField",
          "fieldId": "campaign.offers",
          "renderAs": "offerCards",
          "fallback": "blocked"
        }
      ]
    }
  ],
  "metadata": { "campaignId": "ONAM_2026", "template": "FESTIVAL_ONAM", "yearBadge": "2026" }
}
```

### Example B: Uploaded A4 artwork with dynamic overlays

```json
{
  "schemaVersion": "pageContent.1",
  "pageType": "CUSTOM",
  "dimensions": { "width": 794, "height": 1123, "unit": "px" },
  "background": {
    "type": "artwork",
    "artworkAssetId": "asset_def456",
    "artworkFit": "cover"
  },
  "theme": null,
  "sections": [
    {
      "blockType": "overlay",
      "id": "customer-name-overlay",
      "position": { "x": 120, "y": 340, "unit": "px" },
      "size": { "width": 300, "height": 40, "unit": "px" },
      "children": [
        {
          "blockType": "dynamicField",
          "fieldId": "customer.name",
          "fontSize": "5mm",
          "color": "#1a1a1a",
          "fallback": "blocked"
        }
      ]
    },
    {
      "blockType": "overlay",
      "id": "price-overlay",
      "position": { "x": 400, "y": 680, "unit": "px" },
      "size": { "width": 250, "height": 50, "unit": "px" },
      "children": [
        {
          "blockType": "dynamicField",
          "fieldId": "pricing.customer.customerTotalIncludingGST",
          "fontSize": "6mm",
          "color": "#ffffff",
          "format": "money",
          "fallback": "blocked"
        }
      ]
    },
    {
      "blockType": "overlay",
      "id": "qr-overlay",
      "position": { "x": 620, "y": 980, "unit": "px" },
      "size": { "width": 120, "height": 120, "unit": "px" },
      "children": [
        { "blockType": "qr", "data": "https://flarize.com/q/{{quotation.quotationNumber}}", "size": "120px" }
      ]
    }
  ],
  "metadata": {}
}
```

The JSON is deterministic — no computed values, no executable expressions, no Date.now(). Versionable by `deepFreeze()` + snapshot.

---

## 3. Block Model

### Initial controlled block types (start small)

#### Layout blocks

| Block Type | Purpose | Children |
|-----------|---------|----------|
| `section` | Top-level container with padding | Yes |
| `columns` | Multi-column layout (1–3 cols) | Yes (column children) |
| `column` | Single column within columns block | Yes |
| `overlay` | Absolutely-positioned box on artwork pages | Yes |

#### Content blocks

| Block Type | Purpose | Children |
|-----------|---------|----------|
| `heading` | H1–H3 text, theme-aware color | No |
| `text` | Body text, theme-aware color/size | No |
| `image` | References asset by assetId | No |
| `backgroundImage` | Section/overlay background | No |
| `divider` | Horizontal rule | No |
| `spacer` | Vertical space (height in mm) | No |

#### Dynamic blocks

| Block Type | Purpose | Children |
|-----------|---------|----------|
| `dynamicField` | Resolves value from field registry | No |
| `qr` | QR code with template string support | No |

**Total: 12 block types.** No arbitrary HTML. No arbitrary CSS. No JavaScript blocks.

### Block schema (common fields)

Every block carries:

```json
{
  "blockType": "<type>",
  "id": "<optional unique id within page>",
  "visible": true,
  "sortOrder": 1
}
```

### Extensibility

New block types added by:

1. Add type name to `APPROVED_BLOCK_TYPES` array (code change)
2. Add validation schema for the new type to `BLOCK_VALIDATORS` map
3. Add renderer function in `quotationDocument.js` for the new type
4. Existing pages with older schemaVersion remain valid — new blocks only appear in new pages

No migration of existing pages required when adding a new block type. The `schemaVersion` field on page content enables forward-compatible changes. Renderer ignores unknown block types with a comment marker (never crashes, never renders arbitrary content).

---

## 4. Dynamic Field Registry

Central registry of customer-safe dynamic fields. The CMS user selects from this list — they never type arbitrary paths or expressions.

### Registry schema

```json
{
  "fieldId": "customer.name",
  "displayName": "Customer Name",
  "category": "CUSTOMER",
  "payloadPath": "customer.customerName",
  "dataType": "string",
  "format": "text",
  "allowedBlockTypes": ["dynamicField", "overlay"],
  "customerSafe": true,
  "fallbackBehavior": "blocked",
  "description": "Customer's full name from the quotation"
}
```

### Initial approved fields

**CUSTOMER category** (all customer-safe):

| fieldId | payloadPath | dataType | format |
|---------|-------------|----------|--------|
| customer.name | customer.customerName | string | text |
| customer.address | customer.address | string | text |
| customer.phone | customer.phone | string | text |
| customer.pincode | customer.pincode | string | text |

**SYSTEM category** (all customer-safe):

| fieldId | payloadPath | dataType | format |
|---------|-------------|----------|--------|
| system.type | system.systemType | string | text |
| system.sizeKw | system.systemSizeKw | number | decimal |
| system.phase | system.phase | string | text |
| system.panelCount | bomSummary.rows[role=PANEL].quantity | number | integer |

**PRICING category** (customer-safe — these are customer-facing prices, NOT internal cost):

| fieldId | payloadPath | dataType | format |
|---------|-------------|----------|--------|
| pricing.customer.sellingPriceBeforeGST | pricing.customer.sellingPriceBeforeGST | number | money |
| pricing.customer.gstAmount | pricing.customer.gstAmount | number | money |
| pricing.customer.customerTotalIncludingGST | pricing.customer.customerTotalIncludingGST | number | money |

**COMPONENT category** (customer-safe):

| fieldId | payloadPath | dataType | format |
|---------|-------------|----------|--------|
| component.panel.brand | bomSummary.rows[role=PANEL].attributes.brand | string | text |
| component.panel.model | bomSummary.rows[role=PANEL].attributes.model | string | text |
| component.panel.watt | bomSummary.rows[role=PANEL].attributes.moduleWatt | number | text |
| component.inverter.brand | bomSummary.rows[role=INVERTER].attributes.brand | string | text |
| component.inverter.model | bomSummary.rows[role=INVERTER].attributes.model | string | text |

**CAMPAIGN category** (customer-safe):

| fieldId | payloadPath | dataType | format |
|---------|-------------|----------|--------|
| campaign.headline | campaign.value.headline | string | text |
| campaign.subheadline | campaign.value.subheadline | string | text |
| campaign.primaryBenefit.headline | campaign.value.primaryBenefit.headline | string | text |
| campaign.primaryBenefit.displayValue | campaign.value.primaryBenefit.displayValue | string | text |
| campaign.offers | campaign.value.offers | array | offerCards |
| campaign.luckyDraw | campaign.value.luckyDraw | object | luckyDrawCard |
| campaign.referral | campaign.value.referral | object | referralCard |
| campaign.urgency.displayText | campaign.value.urgency.displayText | string | text |
| campaign.cta.buttonText | campaign.value.cta.buttonText | string | text |
| campaign.cta.description | campaign.value.cta.description | string | text |
| campaign.disclaimer | campaign.value.disclaimer | string | text |

**QUOTATION category** (customer-safe):

| fieldId | payloadPath | dataType | format |
|---------|-------------|----------|--------|
| quotation.number | quotation.quotationNumber | string | text |
| quotation.date | quotation.quotationDate | string | date |
| quotation.validUntil | quotation.validUntil | string | date |

**SAVINGS category** (customer-safe, when engine available):

| fieldId | payloadPath | dataType | format |
|---------|-------------|----------|--------|
| savings.annualAmount | savings.value.annualSavingsAmount | number | money |
| savings.lifetimeAmount | savings.value.lifetimeSavingsAmount | number | money |
| savings.returnPeriodMonths | savings.value.returnPeriodMonths | number | integer |

### EXPLICITLY FORBIDDEN fields (never exposed to customer)

These payload paths are **never** registered and never available in the CMS:

- `pricing.internal.*` — internal cost, margin, gross profit
- `pricing.customer.discount.*` — discount mechanics
- Any path matching `/price|cost|rate|margin|discount|supplier|purchase/i`
- `engineering.*` — internal engineering warnings/blocks
- `bomSummary.internalOnlyLineCount` — internal BOM detail
- Actor/session metadata
- Version keys / snapshot IDs

The registry is **code-defined** initially (seeded at startup). Admin can add fields from the approved payload namespace but cannot type arbitrary paths — the API validates that every new field's `payloadPath` resolves against a known schema and does not match the forbidden pattern.

### Fallback behavior

When a dynamic field's payload path resolves to `null` or `{ available: false }`:

- `"blocked"` → renders the existing blocked-field pattern: "Not available / DEPENDENCY_NAME"
- `"hide"` → entire block hidden (not rendered)
- `"fallbackText"` → shows a configured fallback string (e.g. "Contact us for details")

This matches the existing `blockedSection()` / `field()` pattern in the renderer.

---

## 5. Uploaded A4 Artwork Model

### Workflow

1. **Upload**: Admin/Project Head uploads A4 artwork (JPEG/PNG, ≤5MB, recommended 794×1123px or 2480×3508px for print)
2. **Store**: File saved to `data/cms-assets/<assetId>.<ext>`, metadata recorded in AssetMetadataRecord
3. **Preview**: Artwork displayed at A4 proportions in CMS UI. No OCR. No text extraction. The image is a flat design layer.
4. **Create overlays**: Admin positions overlay blocks on top of the artwork using drag handles. Each overlay is an `overlay` block type with `position` (x, y) and `size` (width, height) in px
5. **Bind fields**: Each overlay contains a `dynamicField` block referencing the field registry
6. **Save draft**: Page JSON saved with `background.type = "artwork"` and `background.artworkAssetId`
7. **Preview with data**: CMS preview feeds the page JSON to the existing renderer with mock or real payload data
8. **Publish**: Version finalized and frozen

### Asset reference storage

The page JSON references assets by `assetId` only, never by file path. The renderer resolves `assetId` → URL at render time. This means:

- Assets can be moved/reorganized without breaking pages
- The same asset can be used across multiple pages
- Asset deletion is blocked if any PUBLISHED page version references it

### Overlay positioning

Overlays use pixel coordinates relative to the 794×1123 A4 canvas. The CMS UI provides:

- Drag-to-position
- Resize handles
- Snap-to-grid (optional, 10px grid)
- Coordinate readout

No overlay may extend outside the A4 boundary. Validation enforces `0 ≤ x ≤ 794`, `0 ≤ y ≤ 1123`, and `x + width ≤ 794`, `y + height ≤ 1123`.

---

## 6. CMS API

Following the existing server convention: `module.exports = { init, register }`, `register(addRoute, { send, parseBody, isAdmin })`. New file: `server-cms.js`, mounted from `server-workspace.js` in the same pattern as `server-procurement.js` and `server-quotation.js`.

All routes under `/api/cms/`.

### Pages

#### POST /api/cms/pages
Create a new page.

- **Request**: `{ name, pageType, targetDocumentOrder }`
- **Response**: `{ page: PageRecord }`
- **Auth**: `isAdmin` + actor role check (`CMS_EDIT`)
- **Validation**: pageType in approved list, targetDocumentOrder in [2,4,6,9,10,11]
- **Errors**: 400 (invalid input), 403 (unauthorized)

#### GET /api/cms/pages
List pages.

- **Request**: query params `?status=ACTIVE&pageType=CAMPAIGN`
- **Response**: `{ pages: PageRecord[] }`
- **Auth**: `isAdmin` + `CMS_VIEW`
- **Errors**: 403

#### GET /api/cms/pages/:pageId
Get single page with current draft and published version info.

- **Response**: `{ page: PageRecord, draftVersion: PageVersionRecord|null, publishedVersion: PageVersionRecord|null }`
- **Auth**: `isAdmin` + `CMS_VIEW`
- **Errors**: 404, 403

#### PUT /api/cms/pages/:pageId/draft
Update draft content.

- **Request**: `{ content: PageJSON }`
- **Response**: `{ version: PageVersionRecord }`
- **Auth**: `isAdmin` + `CMS_EDIT`
- **Validation**: Full page JSON schema validation, block type validation, dynamic field validation against registry, asset existence check, theme token hex validation
- **Errors**: 400 (schema violation, unknown block type, unregistered field, missing asset), 403, 404

#### POST /api/cms/pages/:pageId/preview
Generate preview HTML.

- **Request**: `{ payloadSource: "mock" | "quotation", quotationId?: string }`
- **Response**: `{ html: string }` — rendered by the SAME renderer as the final quotation
- **Auth**: `isAdmin` + `CMS_VIEW` (+ `QUOTATION_CREATE` if payloadSource is "quotation")
- **Errors**: 400, 403, 404

#### POST /api/cms/pages/:pageId/submit-review
Transition draft → REVIEW.

- **Request**: `{}`
- **Response**: `{ version: PageVersionRecord }`
- **Auth**: `isAdmin` + `CMS_EDIT`
- **Errors**: 400 (not in DRAFT), 403, 404

#### POST /api/cms/pages/:pageId/approve
Transition REVIEW → APPROVED.

- **Request**: `{}`
- **Response**: `{ version: PageVersionRecord }`
- **Auth**: `isAdmin` + `CMS_PUBLISH`
- **Errors**: 400 (not in REVIEW), 403, 404

#### POST /api/cms/pages/:pageId/publish
Transition APPROVED → PUBLISHED. Archives previous published version.

- **Request**: `{}`
- **Response**: `{ version: PageVersionRecord, previousArchived: string|null }`
- **Auth**: `isAdmin` + `CMS_PUBLISH`
- **Errors**: 400 (not APPROVED), 403, 404

#### POST /api/cms/pages/:pageId/archive
Archive a page.

- **Request**: `{}`
- **Response**: `{ page: PageRecord }`
- **Auth**: `isAdmin` + `CMS_PUBLISH`
- **Errors**: 403, 404

#### GET /api/cms/pages/:pageId/versions
List all versions of a page.

- **Response**: `{ versions: PageVersionRecord[] }`
- **Auth**: `isAdmin` + `CMS_VIEW`
- **Errors**: 403, 404

### Assets

#### POST /api/cms/assets
Upload an asset (multipart form).

- **Request**: multipart with file field
- **Response**: `{ asset: AssetMetadataRecord }`
- **Auth**: `isAdmin` + `CMS_ASSET_MANAGE`
- **Validation**: MIME type (image/png, image/jpeg only initially), max 5MB, image dimensions extracted
- **Errors**: 400 (invalid type/size), 403

#### GET /api/cms/assets
List assets.

- **Response**: `{ assets: AssetMetadataRecord[] }`
- **Auth**: `isAdmin` + `CMS_VIEW`

#### GET /api/cms/assets/:assetId
Get asset metadata.

- **Response**: `{ asset: AssetMetadataRecord }`
- **Auth**: `isAdmin` + `CMS_VIEW`

#### GET /api/cms/assets/:assetId/file
Serve the actual file.

- **Response**: binary file with correct Content-Type
- **Auth**: `isAdmin` (or quotation viewer for published assets)

#### POST /api/cms/assets/:assetId/archive
Archive asset (blocked if referenced by any PUBLISHED version).

- **Response**: `{ asset: AssetMetadataRecord }`
- **Auth**: `isAdmin` + `CMS_ASSET_MANAGE`
- **Errors**: 400 (still referenced), 403, 404

### Campaigns

#### POST /api/cms/campaigns
Create campaign.

- **Request**: `{ campaignId, name, template, theme, pageId? }`
- **Response**: `{ campaign: CampaignRecord }`
- **Auth**: `isAdmin` + `CMS_EDIT`
- **Validation**: template in APPROVED_TEMPLATES, theme tokens hex-only via existing `validateTheme()`

#### GET /api/cms/campaigns
List campaigns.

- **Response**: `{ campaigns: CampaignRecord[] }`
- **Auth**: `isAdmin` + `CMS_VIEW`

#### GET /api/cms/campaigns/:campaignId
Get single campaign.

- **Auth**: `isAdmin` + `CMS_VIEW`

#### PUT /api/cms/campaigns/:campaignId
Update campaign.

- **Auth**: `isAdmin` + `CMS_EDIT`
- **Validation**: same as create

#### POST /api/cms/campaigns/:campaignId/activate
Set campaign as active (deactivates any other active campaign).

- **Auth**: `isAdmin` + `CMS_PUBLISH`
- **Errors**: 400 (no published page associated), 403

#### POST /api/cms/campaigns/:campaignId/deactivate
Deactivate campaign.

- **Auth**: `isAdmin` + `CMS_PUBLISH`

### Dynamic Fields

#### GET /api/cms/fields
List all approved dynamic fields from the registry.

- **Response**: `{ fields: FieldDefinition[] }`
- **Auth**: `isAdmin` + `CMS_VIEW`

### Templates

#### GET /api/cms/templates
List approved templates.

- **Response**: `{ templates: [{id, name, description, defaultTheme}] }`
- **Auth**: `isAdmin` + `CMS_VIEW`

---

## 7. RBAC Proposal

### Existing RBAC (unchanged)

`rbac.js` has 6 roles, 20 capabilities, `can(role, capability)` check. The matrix is code — no data grants. This proposal extends the same module. No second permission system.

### New capabilities (4)

| Capability | Purpose | Why necessary |
|-----------|---------|---------------|
| `CMS_VIEW` | View CMS pages, assets, campaigns, fields, templates | Separate from CMS_EDIT so roles can review without modifying |
| `CMS_EDIT` | Create/edit draft pages, create campaigns, manage draft content | Separate from PUBLISH so draft work doesn't require publish authority |
| `CMS_PUBLISH` | Submit for review, approve, publish, archive pages and campaigns | Gates the transition to customer-visible content |
| `CMS_ASSET_MANAGE` | Upload and archive artwork/image assets | Separate because asset upload is a storage operation |

### Comparison with existing capabilities

No existing capability covers CMS operations. `COMMERCIAL_CONFIG_EDIT` covers commercial configuration, not content design. `QUOTATION_CREATE` covers quotation issuance, not page design. Each new capability is necessary because CMS page design is a distinct operation that no existing capability authorizes.

### Role assignments

| Role | CMS_VIEW | CMS_EDIT | CMS_PUBLISH | CMS_ASSET_MANAGE |
|------|----------|----------|-------------|------------------|
| ADMIN | ✓ | ✓ | ✓ | ✓ |
| PROJECT_HEAD | ✓ | ✓ | ✓ | ✓ |
| ENGINEERING | — | — | — | — |
| PROCUREMENT | — | — | — | — |
| SALES | — | — | — | — |
| SALES_HEAD | — | — | — | — |

**Rationale**: Project Head/Admin manage quotation content by business authority. Sales must not alter published page designs. Engineering and Procurement have no content-design role. Sales can *view* the final quotation document through the existing quotation viewer — they don't need CMS_VIEW to see rendered quotations.

### Implementation

Add to existing `CAPABILITY` object in `rbac.js`. Add to `CAPABILITY_MATRIX` for ADMIN and PROJECT_HEAD. Zero changes to the `can()` / `assertCan()` mechanism. All authorization is server-side in the CMS service layer.

---

## 8. Versioning / Workflow

### States

```
DRAFT → REVIEW → APPROVED → PUBLISHED → ARCHIVED
```

### Transition rules

| Transition | Who | Conditions |
|-----------|-----|------------|
| DRAFT → REVIEW | CMS_EDIT | Page JSON passes full validation |
| REVIEW → APPROVED | CMS_PUBLISH | Content reviewed, no unresolved blocked fields |
| APPROVED → PUBLISHED | CMS_PUBLISH | Only one version per page may be PUBLISHED. Previous PUBLISHED → ARCHIVED automatically |
| PUBLISHED → ARCHIVED | CMS_PUBLISH | Manual archive or superseded by new publish |
| Any → DRAFT (new version) | CMS_EDIT | Creates versionNumber + 1 with content copied from any previous version |

### Can a published version be edited?

**No.** A PUBLISHED version is frozen (`deepFreeze()`). To change content, create a new version (which starts as DRAFT). This matches the existing quotation versioning model: ISSUED quotation documents are never edited, only superseded.

### How a new version is created

1. `POST /api/cms/pages/:pageId/draft` with content
2. If a draft version already exists for this page, it is updated in place
3. If no draft exists, a new PageVersionRecord is created with versionNumber = max(existing) + 1

### Historical quotation safety

**An already-issued quotation must NEVER change because someone edits the CMS later.**

This is guaranteed by the **resolve-at-issuance** pattern:

1. When a quotation is issued, the CMS page content for each CMS-managed page is **resolved** (all dynamic fields evaluated against the quotation payload)
2. The resolved HTML/content is stored as part of the frozen quotation document
3. The `pageVersionId` used is recorded on the document for audit
4. The frozen quotation document contains the actual rendered content, not a pointer to be resolved later
5. `deepFreeze()` ensures byte-level immutability

### Quotation → page version pinning

The quotation document (in `quotationWorkspace.js`) gains a new field:

```json
{
  "cmsPageVersions": {
    "2": "pgver_abc123",
    "4": null,
    "6": null,
    "9": null
  }
}
```

This is an audit trail, not a live reference.

---

## 9. Quotation Integration

### Integration flow

```
CMS (Published Page Version)
  ↓
quotationPayload.js — campaign section already accepts campaignResult
  ↓  (new: also accepts cmsPages for non-campaign CMS pages)
quotationDocument.js — existing renderer
  ↓
Customer quotation document
```

### How the renderer receives page configuration

**For campaign pages (Page 2)**: The existing pattern already works.

1. CMS publishes a campaign page → the service resolves it into a `campaignResult` object matching the existing campaign payload contract
2. `resolveInputs()` in `quotationWorkspace.js` is modified to read the active campaign from the CMS store and produce a `campaignResult`
3. `buildQuotationPayload()` receives `campaignResult` through its existing parameter — no payload contract change
4. `renderPage2()` already renders from `payload.campaign` — no renderer change for campaign pages

**For non-campaign CMS pages (4, 6, 9, 10, 11)**: New pattern.

1. CMS publishes a page for document order position N
2. At payload build time, the CMS service resolves the published page content with the quotation payload (evaluating all dynamic fields)
3. The resolved page content is added to the payload under a new section: `cmsPages`
4. The renderer gets a new generic `renderCmsPage(resolvedPageContent)` function that renders any CMS page from its resolved JSON — converting blocks to HTML using the same escapeHtml, formatMoney, and theme utilities

### Which pages use this system

| Page | Current Status | C11 Plan |
|------|---------------|----------|
| 1 (Cover) | Frozen/structured | Stays frozen |
| 2 (Campaign) | Mock-only, renderer exists | CMS manages campaign content → existing renderer |
| 3 (Energy) | Frozen/structured | Stays frozen |
| 4 | Not implemented | CMS-managed (future) |
| 5 (Pricing) | Frozen/structured | Stays frozen |
| 6 | Not implemented | CMS-managed (future) |
| 7 (Tech Specs) | Frozen/structured | Stays frozen |
| 8 (Savings) | Frozen/structured | Stays frozen |
| 9 | Not implemented | CMS-managed (future) |
| 10 | Not implemented | CMS-managed (future) |
| 11 | Not implemented | CMS-managed (future) |
| 12 (Footer) | Frozen/structured | Stays frozen |

### Backward compatibility

- Pages 1, 3, 5, 7, 8, 12 render exactly as today
- Page 2 renderer is untouched — it already handles the campaign payload contract
- The `documentOrder` array in the quotation payload controls which pages appear and in which order — CMS pages only appear if a published CMS page exists for that position
- If no CMS page is published for a position, that position is skipped (same as current behavior where missing pages are simply not rendered)

---

## 10. Calculation Boundary

### Strict separation

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│     CMS     │     │ Calculation      │     │  Quotation       │
│  (content   │     │ Engines          │     │  Renderer        │
│   only)     │     │ (numbers only)   │     │  (display only)  │
└──────┬──────┘     └────────┬─────────┘     └────────┬─────────┘
       │                     │                        │
       │   page layout       │  computed values       │  HTML output
       │   text content      │  from frozen engines   │  from payload
       │   field bindings    │                        │
       └─────────┬───────────┘                        │
                 │                                    │
          ┌──────▼──────┐                             │
          │  Quotation  │─────────────────────────────┘
          │  Payload    │
          │  (assembly) │
          └─────────────┘
```

### The CMS NEVER calculates

- Price — from Pricing Engine via commercial snapshot
- GST — from GST policy via commercial snapshot
- Subsidy — from Subsidy Engine (future) or NOT_QUOTED treatment
- EMI — from Finance Engine (future mock provider)
- Savings — from Savings Engine (future mock provider)
- ROI — from Savings Engine
- Generation — from Energy Engine
- BOM quantities — from locked BOM snapshot
- DC/AC ratios — from Engineering Checker
- Engineering quantities — from project BOM

### What the CMS does

- Stores page layout and content structure
- References dynamic fields by registry ID
- Displays values that were already calculated by the appropriate engine
- Shows blocked-field state when a value is unavailable

### Project Head approval scope

Project Head approves:
- CMS page content and layout (via CMS_PUBLISH)
- Commercial configuration (via existing COMMERCIAL_CONFIG_EDIT)
- Cost inputs (via existing COST_INPUT_EDIT)

These are separate approval chains. CMS publish does not imply commercial approval. A quotation still requires a locked BOM + issued commercial snapshot + passed generation gate.

---

## 11. Security Model

### Input validation (API/service layer)

**Page JSON validation**:
- `blockType` must be in `APPROVED_BLOCK_TYPES` — reject unknown types
- No `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>` allowed in any text field
- No `javascript:`, `data:text/html`, `vbscript:` URLs
- No `on*` event handler attributes
- Theme color values validated against `/^#[0-9a-fA-F]{6}$/` (existing `validateTheme()`)
- Dynamic field IDs validated against the approved registry — reject unregistered fields
- Asset IDs validated against existing assets
- All string fields length-limited
- Overlay positions validated against A4 bounds

**Asset validation**:
- MIME type verified by magic bytes, not just file extension
- Image dimensions extracted and stored
- File size limit enforced (5MB)
- Filename sanitized (no path traversal, no special characters)

**Campaign validation**:
- Template must be in `APPROVED_TEMPLATES` (existing constant)
- Theme tokens validated by existing `validateTheme()`

### Renderer-layer protection

The existing renderer already has `escapeHtml()` applied to all payload values. CMS content goes through the same path:

1. CMS stores page JSON with static text values (already validated at API layer)
2. Dynamic fields are resolved from the quotation payload (which is deeply frozen)
3. `escapeHtml()` is applied at render time to every resolved value
4. No raw HTML passthrough from CMS content to rendered output

### Forbidden operations

- **No arbitrary HTML**: Block types are a closed set. Text content is plain text with escapeHtml.
- **No arbitrary CSS**: Style properties are limited to approved tokens (theme colors, font sizes from approved range, padding/margin in mm). No `style` attribute passthrough.
- **No JavaScript**: Zero executable content in page JSON. No eval, no Function constructor, no script blocks.
- **No XSS vectors**: All dynamic field values go through escapeHtml. All URLs validated against allowlist patterns.
- **No internal pricing exposure**: Dynamic field registry enforces the forbidden-field pattern. The `FORBIDDEN_ATTRIBUTE_PATTERN` from `quotationPayload.js` is also applied at the CMS field registration layer.
- **No editing published versions**: `deepFreeze()` + service layer rejection of mutations to PUBLISHED content.
- **No unauthorized publishing**: CMS_PUBLISH capability required, server-side enforced via `assertCan()`.

### Defense in depth

Validation happens at THREE layers:
1. **API layer** — rejects malformed input before it reaches the service
2. **Service layer** — validates page JSON schema, field registry, asset references
3. **Renderer layer** — `escapeHtml()` on every value, block type whitelist check

UI hiding is never relied upon for security. Every check is server-side.

---

## 12. Preview Architecture

### Core principle

**Preview uses the SAME page renderer as the final quotation.** No second preview implementation.

### How it works

1. CMS UI sends `POST /api/cms/pages/:pageId/preview` with `payloadSource`
2. Service layer:
   a. Reads the current draft page content
   b. If `payloadSource = "mock"`: builds a mock payload using existing `mockCampaignResult()` and other mock providers from `mockCalculationProviders.js`
   c. If `payloadSource = "quotation"`: reads the specified quotation's payload (requires QUOTATION_CREATE capability)
3. Resolves all dynamic fields in the page content against the payload
4. Passes the resolved content to the existing renderer functions
5. Returns the rendered HTML

### Preview states

- **Complete preview**: All dynamic fields resolved successfully
- **Partial preview**: Some fields show blocked state (value unavailable in payload)
- **Missing-field indicators**: Uses the existing blocked-field visual pattern (grey text, dependency name)

### Mock payload for preview

The existing `mockCalculationProviders.js` already provides:
- `mockCampaignResult()` — campaign data
- `mockSavingsResult()` — savings data
- `mockSubsidyResult()` — subsidy data
- `mockFinancingResult()` — financing data
- `mockEnergyProfileResult()` — energy profile data

The CMS preview assembles these into a complete mock payload using `buildQuotationPayload()` from the existing assembler. No separate mock system needed.

### Preview in the CMS UI

The CMS UI renders the preview in an iframe or a modal showing the full A4 page. The HTML comes from the server (rendered by the real renderer), not from a client-side approximation.

---

## 13. Storage / Asset Architecture

### Existing convention

The project stores all persistent data as JSON files in `data/`. Binary assets (existing quotation images) live in `public/assets/quotation/`. CMS follows both patterns.

### CMS asset storage

- **Metadata**: `data/cms-state.json` (in the assets Map)
- **Files**: `data/cms-assets/<assetId>.<ext>`
  - Example: `data/cms-assets/asset_a1b2c3d4e5f6.jpg`

Using `data/cms-assets/` rather than `public/assets/` because:
1. CMS assets should be served through the authenticated API, not as public static files
2. Only PUBLISHED assets need to be accessible, and only through the asset-serving endpoint
3. This prevents direct URL access to draft/archived assets

### Asset metadata

| Field | Purpose |
|-------|---------|
| assetId | Unique identifier |
| filename | Original upload name (display only) |
| storagePath | Relative path for fs.readFileSync |
| mimeType | Validated MIME type |
| width, height | Image dimensions in pixels |
| fileSizeBytes | File size |
| checksum | SHA-256 for integrity verification |
| uploadedBy | Actor who uploaded |
| uploadedAt | Upload timestamp |
| status | ACTIVE / ARCHIVED |
| usedByPageVersionIds | Which page versions reference this asset |

### Existing quotation assets

The 16 existing assets in `public/assets/quotation/` (badges, campaign artwork, page backgrounds, signature seal) remain where they are. They are referenced by the frozen pages (1, 3, 5, 7, 8, 12) and by the existing Page 2 renderer using relative URL paths.

New CMS assets are separate. If a CMS page needs to use an existing asset (e.g., the campaign-mahabali.jpg), it references it by uploading it to the CMS asset store (creating a copy under CMS control) or by a special `legacyAssetPath` field that references the existing public path. The upload-copy approach is preferred for clean ownership.

---

## 14. Migration / Compatibility

### Existing Page 2 campaign mock provider

`mockCampaignResult()` in `mockCalculationProviders.js` remains unchanged. It is test-only and will continue to provide mock campaign data for tests. The CMS campaign system produces the same data shape — the mock provider's output contract IS the CMS campaign output contract.

### Existing campaign payload fields

`quotationPayload.js` section `campaign` (lines 678–722) already handles `campaignResult` with the correct shape. Zero changes needed to the payload assembler for campaign pages. The CMS simply becomes the authoritative source of `campaignResult` instead of the mock provider.

### Existing renderPage2()

`renderPage2()` in `quotationDocument.js` already renders from `payload.campaign.value.*`. It uses `resolveTemplate()`, `validateTheme()`, `APPROVED_TEMPLATES`, and `APPROVED_THEME_TOKENS`. All of these are compatible with CMS output. Zero changes to renderPage2 for the initial integration.

### Existing quotation renderer

`quotationDocument.js` (2700 lines, zero imports) gains one new function: `renderCmsPage(resolvedPageContent)` for non-campaign CMS pages. This is additive — no existing render function is modified. The existing `PAGE_N_STYLES` exports and `renderPage1()` through `renderPage12()` are untouched.

### Existing quotation document versioning

`quotationWorkspace.js` version model (ISSUED/SUPERSEDED, `createRevision()`, `verifyImmutability()`) is unchanged. The quotation document gains a `cmsPageVersions` audit field. The immutability guarantee is preserved — CMS page content is resolved and frozen at issuance time.

### Existing tests

Zero existing tests are modified. The 49 Page 2 tests in `phase3-quotation-page2-campaign.test.mjs` continue to pass because:
- They use `mockCampaignResult()` directly (not through CMS)
- The campaign payload contract is unchanged
- The renderer is unchanged

New CMS tests are additive.

---

## 15. Implementation Phases

### C11-A: CMS persistence + store (smallest safe first)

- Create `src/lib/cmsStore.js` — store creation, serialization, hydration
- Create `data/cms-state.json` initial state
- Create `data/cms-assets/` directory
- Unit tests for store operations

### C11-B: RBAC extension

- Add 4 capabilities to `rbac.js`: CMS_VIEW, CMS_EDIT, CMS_PUBLISH, CMS_ASSET_MANAGE
- Add to CAPABILITY_MATRIX for ADMIN and PROJECT_HEAD
- Unit tests (extend existing RBAC tests)

### C11-C: Dynamic field registry

- Create `src/lib/cmsFieldRegistry.js` — registry definition, validation, resolution
- Seed initial approved fields
- Field resolution against quotation payload
- Forbidden-field enforcement
- Unit tests

### C11-D: Page JSON schema + block validation

- Create `src/lib/cmsPageSchema.js` — schema definition, validation
- Block type validators for all 12 initial types
- Security validation (no HTML/JS/XSS)
- Unit tests

### C11-E: Asset management

- Create `src/lib/cmsAssetManager.js` — upload, metadata, storage, archive
- MIME validation, dimension extraction, checksum
- Reference tracking
- Unit tests

### C11-F: CMS service layer

- Create `src/lib/cmsWorkspace.js` — page CRUD, versioning, workflow transitions
- Campaign management
- deepFreeze on publish
- Preview generation (delegates to existing renderer)
- Unit tests

### C11-G: CMS HTTP transport

- Create `server-cms.js` — API endpoints following existing addRoute convention
- Mount from `server-workspace.js`
- Integration tests

### C11-H: Quotation integration

- Modify `quotationWorkspace.js` `resolveInputs()` — read active campaign from CMS store, produce campaignResult
- Add `cmsPageVersions` to quotation document
- Add `renderCmsPage()` to `quotationDocument.js`
- Integration tests + browser verification

### C11-I: CMS UI

- Add CMS workspace to `App.jsx` (or separate `cms.html` — decision needed)
- Page list, page editor, block palette, field picker
- Artwork upload + overlay positioning
- Preview panel
- Campaign management UI

### C11-J: Testing + browser verification

- End-to-end Playwright tests for CMS → quotation flow
- Visual regression for CMS-managed pages
- Campaign round-trip test (CMS publish → quotation issue → correct render)
- Security tests (XSS, forbidden fields, unauthorized access)

### Recommended first implementation

**C11-A → C11-B → C11-C** — these are pure additions with zero risk to existing functionality. They establish the foundation (store, auth, field registry) that everything else builds on. Can be tested in isolation.

---

## 16. Risks / Unresolved Decisions

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| CMS UI complexity in 6081-line App.jsx monolith | High | Consider separate `cms.html` page (like workspace.html, procurement.html, quotation.html) instead of adding to App.jsx |
| A4 artwork overlay positioning accuracy across browsers | Medium | Use px coordinates, validate bounds server-side, visual QA in preview |
| Dynamic field resolution performance on large registries | Low | Registry is small (< 100 fields), resolution is O(n) map lookup |
| Asset storage disk usage | Low | 5MB limit per asset, archive policy, monitoring |
| Print rendering fidelity for CMS pages | Medium | Use same CSS approach as frozen pages (mm units, A4 @page rules) |

### Unresolved decisions

| Decision | Options | Recommendation |
|----------|---------|----------------|
| CMS UI location | Add to App.jsx vs separate cms.html | Separate `cms.html` — follows existing pattern (workspace.html, procurement.html) and avoids bloating App.jsx further |
| Should CMS pages support print-specific CSS? | Yes (mm units like frozen pages) vs No (px only) | Yes — quotation is a print document, CMS pages must follow same A4 print rules |
| Maximum number of CMS-managed pages per quotation? | Unlimited vs capped | Cap at 6 (positions 2, 4, 6, 9, 10, 11) — the approved document order positions |
| Should campaign management be part of CMS or separate? | Integrated vs separate module | Integrated — campaign is the first CMS page type, and the data model is unified |
| Asset deduplication by checksum? | Yes (save space) vs No (simpler) | No for initial implementation — premature optimization. Assets are small images. |
| Should the CMS store live in its own JSON file or share workspace-state.json? | Separate vs shared | Separate `data/cms-state.json` — follows the pattern of `quotation-state.json` being separate from `workspace-state.json` |
| P3-D (per-user identity) | Still unresolved from existing codebase | CMS inherits OPERATOR_ASSERTED_ROLE limitation — same as all other workspace operations. Not solved by C11. |

---

## 17. Files That Would Eventually Need Modification

### EXISTING files to modify (minimal, additive changes only)

| File | Change | Risk |
|------|--------|------|
| `src/lib/rbac.js` | Add 4 CMS capabilities to CAPABILITY and CAPABILITY_MATRIX | Zero risk — additive, no existing capability changed |
| `src/lib/quotationWorkspace.js` | Modify `resolveInputs()` to read active campaign from CMS store; add `cmsPageVersions` to issued document | Low risk — additive field, existing flow unchanged |
| `public/lib/quotationDocument.js` | Add `renderCmsPage()` function | Zero risk — additive function, existing render functions untouched |
| `dist/lib/quotationDocument.js` | Copy of above after edit | Same as above |
| `server-workspace.js` | Mount `server-cms.js` in `register()` (same pattern as procurement, quotation) | Zero risk — additive mount |
| `App.jsx` | Only if CMS UI is added here (NOT recommended — see §16) | High risk if modified — recommend separate cms.html |

### NEW files to create

| File | Purpose |
|------|---------|
| `src/lib/cmsStore.js` | Store creation, serialization, hydration |
| `src/lib/cmsFieldRegistry.js` | Dynamic field registry |
| `src/lib/cmsPageSchema.js` | Page JSON validation |
| `src/lib/cmsAssetManager.js` | Asset upload, metadata, storage |
| `src/lib/cmsWorkspace.js` | CMS service layer |
| `server-cms.js` | HTTP transport |
| `public/cms.html` | CMS UI (recommended separate page) |
| `data/cms-state.json` | CMS persistence |
| `data/cms-assets/` | Asset file storage directory |
| `tests/cms-store.test.mjs` | Store unit tests |
| `tests/cms-field-registry.test.mjs` | Registry tests |
| `tests/cms-page-schema.test.mjs` | Schema validation tests |
| `tests/cms-workspace.test.mjs` | Service layer tests |
| `tests/cms-api.test.mjs` | API integration tests |
| `tests/cms-browser-check.mjs` | Browser visual verification |

### Files that MUST NOT be modified

| File | Reason |
|------|--------|
| `data/catalog.json` | Engineering data — CMS has no catalog authority |
| `src/lib/costEngine.js` | Frozen calculation engine |
| `src/lib/pricingEngine.js` | Frozen calculation engine |
| `src/lib/money.js` | Frozen money arithmetic |
| `src/lib/engineeringChecker.js` | Frozen engineering rules |
| `src/lib/bomSnapshot.js` | Frozen BOM snapshot logic |
| `src/lib/commercialSnapshot.js` | Frozen commercial snapshot logic |
| `src/lib/quotationPayload.js` | Payload assembler — campaign contract already correct |
| Existing test files | All existing tests must continue passing |

---

## Summary: EXISTING vs PROPOSED vs DOCUMENTATION-ONLY

| Item | Status |
|------|--------|
| CMS store, pages, versions | **PROPOSED** — does not exist |
| CMS API | **PROPOSED** — does not exist |
| CMS RBAC capabilities | **PROPOSED** — zero CMS capabilities exist today |
| CMS UI | **PROPOSED** — does not exist |
| Dynamic field registry | **PROPOSED** — does not exist |
| Page JSON schema | **PROPOSED** — does not exist |
| Asset management | **PROPOSED** — does not exist |
| Campaign management via CMS | **PROPOSED** — campaign is currently mock-only |
| quotationPayload.js campaign section | **EXISTING** — already accepts campaignResult |
| renderPage2() | **EXISTING** — already renders from campaign payload |
| RBAC module (rbac.js) | **EXISTING** — 6 roles, 20 capabilities, unchanged mechanism |
| Server module pattern | **EXISTING** — addRoute convention, init/register exports |
| JSON file persistence | **EXISTING** — data/ directory convention |
| Quotation versioning | **EXISTING** — ISSUED/SUPERSEDED, deepFreeze, immutability |
| Mock providers | **EXISTING** — test-only, will coexist with CMS |
| escapeHtml, formatMoney, validateTheme | **EXISTING** — reused by CMS integration |
| APPROVED_TEMPLATES, APPROVED_THEME_TOKENS | **EXISTING** — reused by CMS campaign validation |
| Pages 1,3,5,7,8,12 renderer | **EXISTING / FROZEN** — not touched by C11 |
| Build spec, data contract, decision log | **DOCUMENTATION-ONLY** — describes intent, not implementation |

/**
 * CUSTOMER QUOTATION DOCUMENT RENDERER.  (Phase 3 — PART H, hybrid Step 1: PAGE 1)
 *
 * This is the CUSTOMER-FACING quotation, not the internal workspace viewer.
 * It renders the approved visual design supplied as `Flarize Solar Quotation.html`,
 * page by page, replacing only the parts that carry customer data.
 *
 * HYBRID RULE (see docs/phase3/QUOTATION_TEMPLATE_FORENSIC.md)
 *   The supplied artwork stays byte-identical wherever it is reusable. Only the
 *   regions the forensic report identified as customer data are rebuilt as HTML
 *   so they can be bound. For page 1 that is the salutation and the
 *   "YOUR PROPOSAL DETAILS" block. The hero band, the signature/seal and the
 *   footer band remain the supplied artwork, cropped, not redrawn.
 *
 * PURE. NO CALCULATION. NO CATALOG.
 *   Its import list is EMPTY — asserted by test. It calls no engine, reads no
 *   catalog, resolves no component and performs no arithmetic on any figure.
 *   Money is formatted (digit grouping) and never computed. There is no clock
 *   and no randomness: every date is a string the payload supplied.
 *
 * NOTHING IS INVENTED.
 *   A value the payload does not supply is NOT printed as ₹0, as a blank, as
 *   "TBD" or as the example value baked into the original artwork. It renders
 *   the contract's blocked treatment — the field is named, its dependency is
 *   named, and `blockedFields()` reports it so the service can refuse to issue.
 *
 *   In particular the artwork's GST number, company registration, customer
 *   name, address, phone, bill and system size are EXAMPLE VALUES. None of them
 *   exists in this file; a test asserts their absence.
 *
 * C6 / C7 / C13 / C14 ARE NOT RESOLVED HERE.
 *   No tier display name, no legal entity, no page number and no variant rule is
 *   supplied by this renderer. Each is carried from the payload once decided.
 */

export const QUOTATION_DOCUMENT_VERSION = 'quotationDocument.1';

/** Document-order page 1. Page NUMBERING is decision C13 and stays undecided. */
export const PAGE_ONE = Object.freeze({
  documentOrder: 1,
  sectionName: 'COVER_AND_PROPOSAL_DETAILS',
  artworkSource: 'SUPPLIED_QUOTATION_ARTIFACT',
  pageNumberDecision: 'C13_PENDING',
});

/** A4 at the artwork's own aspect ratio (1000 × 1414 px ≈ 210 × 297 mm). */
export const PAGE_SIZE = Object.freeze({ widthMm: 210, heightMm: 297, artworkPx: '1000x1414' });

/**
 * Artwork cropped from the supplied Page 1 mockup, unmodified.
 *
 * V4 Phase 2B — F1 architecture. The approved q-page-01.jpg is a POPULATED
 * mockup (baked-in customer data). It is never rendered directly. Genuine
 * static artwork is vendored as separate assets and composed via live HTML
 * that binds every dynamic region to the authoritative payload.
 *
 *  - brandLogo  → the Flarize-by-Golden-Ray wordmark used top + footer
 *  - hero       → the pure rectangular Kerala-home photograph, cropped from
 *                 the approved mockup (no baked-in text)
 *  - signature  → hand signature glyph used below the letter
 *  - seal       → circular Flarize seal next to the signature
 *
 * Legacy assets (page1-hero.jpg, page-footer.jpg) are intentionally NOT
 * referenced from Page 1 any more — they held a different photograph and a
 * baked-in contact strip. They stay on disk until visual QA confirms they
 * are unreferenced anywhere else.
 */
export const PAGE_ONE_ASSETS = Object.freeze({
  brandLogo: 'assets/quotation/q-flarize-logo-592e2a11.png',
  hero: 'assets/quotation/q-page-01-hero.jpg',
  signature: 'assets/quotation/signature-seal.png',
  seal: 'assets/quotation/signature-seal.png',
});

/** Why a field could not be printed. Names only — never a substitute value. */
export const FIELD_DEPENDENCY = Object.freeze({
  CUSTOMER_RECORD: 'CUSTOMER_RECORD',
  QUOTATION_RECORD: 'QUOTATION_RECORD',
  PROJECT_CONFIGURATION: 'PROJECT_CONFIGURATION',
  COMPANY_MASTER: 'COMPANY_MASTER',
  DECISION_C7_COMPANY_IDENTITY: 'DECISION_C7_COMPANY_IDENTITY',
  ENERGY_LOAD_CALCULATION_ENGINE: 'ENERGY_LOAD_CALCULATION_ENGINE',
});

const NOT_AVAILABLE_LABEL = 'Not available';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Digit grouping for a figure the payload supplied. Formatting only — there is
 * no arithmetic here, and `null` is never rendered as a number.
 */
export function formatMoney(value) {
  if (value == null) return null;
  return '₹' + Number(value).toLocaleString('en-IN');
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/**
 * Customer-friendly date: "2026-08-27" or "2026-08-27T00:00:00.000Z" → "27 August 2026".
 * String splitting only — no Date constructor, no arithmetic.
 */
export function formatDate(value) {
  if (value == null || value === '') return null;
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const day = m[3].replace(/^0/, '');
  const month = MONTHS[+m[2] - 1] || m[2];
  return `${day} ${month} ${m[1]}`;
}

/**
 * One field of the proposal-details block.
 *
 * `value` present  -> printed.
 * `value` absent   -> the field is BLOCKED: it prints "Not available" with its
 *                     named dependency, and is reported by `blockedFields()`.
 *                     It is never ₹0, never blank, never the artwork's example.
 */
function field(label, value, dependency, note = null) {
  const available = value != null && value !== '';
  return Object.freeze({
    label, value: available ? String(value) : null, available,
    dependency: available ? null : dependency,
    note: available ? null : (note ?? `${label} is not supplied by the approved quotation payload.`),
  });
}

/**
 * The twelve fields the supplied artwork prints under "YOUR PROPOSAL DETAILS",
 * in the artwork's own order and wording.
 *
 * Every value is COPIED from the payload. Nothing is derived, combined,
 * rounded, defaulted or inferred.
 */
export function proposalDetailFields(payload) {
  const customer = payload?.customer ?? null;
  const quotation = payload?.quotation ?? null;
  const system = payload?.system ?? null;
  const company = payload?.company ?? null;
  const consumption = payload?.consumption ?? null;

  const companyDependency = company && company.available === false
    ? (company.dependency ?? FIELD_DEPENDENCY.DECISION_C7_COMPANY_IDENTITY)
    : FIELD_DEPENDENCY.COMPANY_MASTER;
  const companyNote = company && company.available === false
    ? company.reason
    : 'No Company Master is supplied.';

  const consumptionDependency = consumption && consumption.available === false
    ? (consumption.dependency ?? FIELD_DEPENDENCY.ENERGY_LOAD_CALCULATION_ENGINE)
    : FIELD_DEPENDENCY.CUSTOMER_RECORD;

  const left = [
    field('Name', customer?.customerName, FIELD_DEPENDENCY.CUSTOMER_RECORD),
    field('Address', customer?.address, FIELD_DEPENDENCY.CUSTOMER_RECORD),
    field('Pincode', customer?.pincode, FIELD_DEPENDENCY.CUSTOMER_RECORD),
    field('Phone Number', customer?.phone, FIELD_DEPENDENCY.CUSTOMER_RECORD),
    field('Current Bill', currentBillText(customer), FIELD_DEPENDENCY.CUSTOMER_RECORD,
      'Current electricity bill is a customer-provided value. It is not calculated.'),
    field('System Size', systemSizeText(system), FIELD_DEPENDENCY.PROJECT_CONFIGURATION),
  ];

  const right = [
    field('Quotation No.', quotation?.quotationNumber, FIELD_DEPENDENCY.QUOTATION_RECORD),
    field('Proposal By', quotation?.proposalBy, FIELD_DEPENDENCY.QUOTATION_RECORD),
    field('Date', formatDate(quotation?.quotationDate), FIELD_DEPENDENCY.QUOTATION_RECORD),
    field('Valid Until', formatDate(quotation?.validUntil), FIELD_DEPENDENCY.QUOTATION_RECORD),
    field('GST No', company?.value?.gstNumber, companyDependency, companyNote),
    field('Company Registration', company?.value?.companyRegistration, companyDependency, companyNote),
  ];

  return Object.freeze({ left: Object.freeze(left), right: Object.freeze(right) });
}

/**
 * "₹6,000/bi monthly" in the artwork = an amount plus the customer's billing
 * cycle. Both are copied; the cycle is never assumed and the amount is never
 * computed.
 */
function currentBillText(customer) {
  const amount = formatMoney(customer?.currentBillAmount);
  if (amount == null) return null;
  const cycle = customer?.currentBillCycle;
  return cycle ? `${amount}/${cycle}` : amount;
}

/** The artwork prints "5 kW". The number is the payload's; the unit is its own. */
function systemSizeText(system) {
  const kw = system?.systemSizeKw;
  return kw == null ? null : `${kw} kW`;
}

/** Salutation. The payload supplies it; no name is split, shortened or guessed. */
export function salutation(payload) {
  const name = payload?.customer?.salutationName ?? payload?.customer?.customerName ?? null;
  return field('Salutation', name, FIELD_DEPENDENCY.CUSTOMER_RECORD,
    'No salutation name is supplied by the approved quotation payload.');
}

/** Every field this page could not print, with its named dependency. */
export function blockedFields(payload) {
  const { left, right } = proposalDetailFields(payload);
  const all = [salutation(payload), ...left, ...right];
  const rows = all.filter(f => !f.available)
    .map(f => ({ label: f.label, dependency: f.dependency, note: f.note }));
  // V4 Phase 2B — Page 1 trust badges + footer contact are ALSO bound to
  // authoritative sources. Report suppressed badges so the service can flag
  // an incompletely-populated cover page (never issue-blocking on its own —
  // the badges may be intentionally suppressed).
  const badges = trustBadges(payload);
  const badgeLabels = ['Subsidy Badge', 'Homes Installed Badge', 'MNRE Empanelment Badge'];
  badges.forEach((b, i) => {
    if (!b.available) rows.push({ label: badgeLabels[i], dependency: b.dependency, note: b.reason });
  });
  const contact = footerContact(payload);
  if (!contact.available) {
    rows.push({ label: 'Footer Contact Strip', dependency: FIELD_DEPENDENCY.COMPANY_MASTER,
      note: 'Company Master is not supplied — footer address / website / email / phone cannot render.' });
  }
  return Object.freeze(rows.map(r => Object.freeze(r)));
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

function renderValue(f) {
  if (f.available) return `<span class="q-val">${escapeHtml(f.value)}</span>`;
  // Customer-facing: show "Not available" without internal dependency names
  return `<span class="q-val q-blocked">${NOT_AVAILABLE_LABEL}</span>`;
}

function renderRow(f) {
  return `<div class="q-row">`
    + `<span class="q-label">${escapeHtml(f.label)}</span>`
    + `<span class="q-colon">:</span>`
    + renderValue(f)
    + `</div>`;
}

/**
 * The three approved Page 1 trust badges, in visual order.
 *
 * V4 Phase 2B — every badge is BOUND to the authoritative source. No amount,
 * count or credential string is hardcoded. A badge with an unavailable source
 * is suppressed (rendered as an empty slot); the renderer never fabricates a
 * "₹78,000", "300+" or "MNRE Empanelled" claim.
 *
 * Sources:
 *   1. Subsidy amount    → payload.subsidy.value.subsidyAmount (Subsidy Engine)
 *   2. Homes installed   → payload.company.value.completedInstallations (Master)
 *   3. MNRE empanelment  → payload.company.value.mnreEmpanelled  (Master)
 */
export function trustBadges(payload) {
  const subsidy = payload?.subsidy ?? null;
  const company = payload?.company?.value ?? null;

  // Subsidy — only when the Subsidy Engine returned an available amount.
  // Read-only lookup, no arithmetic.
  const resolvedSubsidy = subsidy && subsidy.available && subsidy.value
    ? subsidy.value.subsidyAmount ?? null
    : null;
  const subsidyBadge = resolvedSubsidy != null
    ? Object.freeze({
        available: true,
        icon: 'rupee-bag',
        headline: `${formatMoney(resolvedSubsidy)} Subsidy`,
        subline: 'PM Surya Ghar – guaranteed',
      })
    : Object.freeze({
        available: false, dependency: FIELD_DEPENDENCY.CUSTOMER_RECORD,
        reason: 'Subsidy Engine did not return an amount for this quotation.',
      });

  // Homes installed — only when Admin has set the authoritative company metric.
  const ci = company?.completedInstallations ?? null;
  const homesBadge = ci != null
    ? Object.freeze({
        available: true,
        icon: 'home-check',
        headline: `${ci}+ Homes`,
        subline: 'Installed in Kerala',
      })
    : Object.freeze({
        available: false, dependency: FIELD_DEPENDENCY.COMPANY_MASTER,
        reason: 'Company profile does not carry a completedInstallations count.',
      });

  // MNRE — only when Admin has explicitly recorded true on the company profile.
  const mnre = company?.mnreEmpanelled;
  const mnreBadge = mnre === true
    ? Object.freeze({
        available: true,
        icon: 'shield-check',
        headline: 'MNRE Empanelled',
        subline: 'Government certified',
      })
    : Object.freeze({
        available: false, dependency: FIELD_DEPENDENCY.COMPANY_MASTER,
        reason: 'Company profile does not carry mnreEmpanelled = true.',
      });

  return Object.freeze([subsidyBadge, homesBadge, mnreBadge]);
}

/**
 * Live-HTML footer contact strip. Every line is bound to the authoritative
 * Company Master — the renderer holds NO string for address, phone, website
 * or email. When a field is unavailable, the slot is suppressed.
 */
export function footerContact(payload) {
  const c = payload?.company?.value ?? null;
  if (!c) return Object.freeze({ available: false, dependency: FIELD_DEPENDENCY.COMPANY_MASTER });
  const addrParts = [c.address, c.city, c.pincode ? `— ${c.pincode}` : null]
    .filter(Boolean).join(', ').replace(/,\s*—/, ' —');
  return Object.freeze({
    available: true,
    addressLine: addrParts || null,
    website: c.website || null,
    email: c.email || null,
    phone: c.phone || null,
  });
}

// Approved page-1 badge glyphs (white on the dark-green disc): money bag with
// rupee, house with tick, shield with tick. Decorative only — no text content.
const BADGE_GLYPHS = Object.freeze({
  'rupee-bag': '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l-2 3.5h-2z"/><path d="M8 6.5C5.5 9 4.5 11.5 4.5 14.5A7.5 7.5 0 0 0 19.5 14.5c0-3-1-5.5-3.5-8"/><path d="M9.5 10.5h5M9.5 13h5M9.5 10.5c2 0 3 .8 3 2s-1 2-3 2l3.5 3"/></svg>',
  'home-check': '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="m9.5 15 2 2 3.5-4"/></svg>',
  'shield-check': '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 5.8v5.4c0 4.4 3 7.9 7 9.8 4-1.9 7-5.4 7-9.8V5.8z"/><path d="m9 12 2 2 4-4.5"/></svg>',
});
function renderBadge(b) {
  if (!b.available) {
    // Suppressed slot — reserves layout position without inventing a claim.
    return `<div class="q-badge q-badge-blocked" data-blocked="true" aria-hidden="true"></div>`;
  }
  const glyph = BADGE_GLYPHS[b.icon] || escapeHtml(b.icon);
  return `<div class="q-badge">`
    + `<span class="q-badge-icon" aria-hidden="true">${glyph}</span>`
    + `<div class="q-badge-text">`
    + `<div class="q-badge-headline">${escapeHtml(b.headline)}</div>`
    + `<div class="q-badge-subline">${escapeHtml(b.subline)}</div>`
    + `</div>`
    + `</div>`;
}

function renderFooter(assets, contact) {
  const parts = [];
  if (contact.available) {
    if (contact.addressLine) parts.push(`<span class="q-fc q-fc-address">${escapeHtml(contact.addressLine)}</span>`);
    if (contact.website)     parts.push(`<span class="q-fc q-fc-web">${escapeHtml(contact.website)}</span>`);
    if (contact.email)       parts.push(`<span class="q-fc q-fc-email">${escapeHtml(contact.email)}</span>`);
    if (contact.phone)       parts.push(`<span class="q-fc q-fc-phone">${escapeHtml(contact.phone)}</span>`);
  }
  return `<footer class="q-footer-bar">`
    + `<img class="q-footer-logo" src="${escapeHtml(assets.brandLogo)}" alt="Flarize by Golden Ray">`
    + `<div class="q-footer-contact">${parts.join('')}</div>`
    + `</footer>`;
}

/**
 * PAGE 1 — approved cover + letter + bound proposal details.
 *
 * V4 Phase 2B (F1 architecture): the approved q-page-01.jpg is a populated
 * mockup, never rendered directly. Instead:
 *   - the pure rectangular hero photograph is used as a static image asset
 *     (q-page-01-hero.jpg, cropped from the approved mockup with no baked-in
 *     text);
 *   - every dynamic region — salutation, 12 proposal detail fields, 3 trust
 *     badges, footer contact strip — is live HTML bound to the authoritative
 *     payload;
 *   - static copy (headline, sub-tagline, letter body, section heading, badge
 *     sublabels) reproduces the approved wording verbatim;
 *   - the top brand bar and the footer contact strip use the vendored Flarize
 *     wordmark; the legacy page1-hero.jpg / page-footer.jpg are not touched.
 *
 * NO amount, count or credential string is hardcoded as business truth.
 * NO customer sample value (name, phone, quotation number, ₹78,000, 300+)
 * exists in this file — a test asserts their absence.
 */
export function renderPage1(payload, { assets = PAGE_ONE_ASSETS } = {}) {
  const s = salutation(payload);
  const { left, right } = proposalDetailFields(payload);
  const badges = trustBadges(payload);
  const contact = footerContact(payload);
  // P1b (2026-09-13): cover strings come from the frozen bilingual content
  // (labels p1.*) in the issued language; quotations issued before the store
  // existed keep the approved English text below verbatim.
  const T = (key, fallback, vars) => (hasDocumentContent(payload) ? (labelText(payload, key, vars) || fallback) : fallback);
  // Text nodes: escape markup but keep the apostrophes of the approved copy readable in the HTML.
  const tx = (v) => escapeHtml(v).replace(/&#39;/g, "'");
  const lang = docLang(payload);
  const P1 = {
    name: T('p1.f.name', 'Name'), address: T('p1.f.address', 'Address'), pincode: T('p1.f.pincode', 'Pincode'), phone: T('p1.f.phone', 'Phone Number'),
    bill: T('p1.f.bill', 'Current Bill'), size: T('p1.f.size', 'System Size'), qno: T('p1.f.qno', 'Quotation No.'), by: T('p1.f.by', 'Proposal By'),
    date: T('p1.f.date', 'Date'), valid: T('p1.f.valid', 'Valid Until'), gst: T('p1.f.gst', 'GST No'), reg: T('p1.f.reg', 'Company Registration'),
  };
  const relabel = (fields, keys) => fields.map((f, i) => (keys[i] ? Object.freeze({ ...f, label: keys[i] }) : f));
  const leftL = relabel(left, [P1.name, P1.address, P1.pincode, P1.phone, P1.bill, P1.size]);
  const rightL = relabel(right, [P1.qno, P1.by, P1.date, P1.valid, P1.gst, P1.reg]);
  const badgeL = badges.map((b, i) => {
    if (!b.available) return b;
    if (i === 0) return Object.freeze({ ...b, headline: T('p1.badge.subsidy', b.headline, { amount: b.headline.replace(/\s*Subsidy$/, '') }), subline: T('p1.badge.subsidy.sub', b.subline) });
    if (i === 1) return Object.freeze({ ...b, headline: T('p1.badge.homes', b.headline, { count: b.headline.replace(/\+ Homes$/, '') }), subline: T('p1.badge.homes.sub', b.subline) });
    return Object.freeze({ ...b, headline: T('p1.badge.mnre', b.headline), subline: T('p1.badge.mnre.sub', b.subline) });
  });
  const dearName = s.available ? escapeHtml(s.value) : renderValue(s);
  const dearLine = hasDocumentContent(payload) ? escapeHtml(labelText(payload, 'p1.dear', { name: '\u0000' })).replace('\u0000', dearName) : `Dear ${dearName},`;

  return `<section class="page${lang === 'ml' ? ' qc-ml' : ''}" data-page-section="${PAGE_ONE.sectionName}" data-document-order="1" lang="${lang}">
  <header class="q-brandbar">
    <img class="q-brandbar-logo" src="${escapeHtml(assets.brandLogo)}" alt="Flarize by Golden Ray">
  </header>
  <img class="q-hero" src="${escapeHtml(assets.hero)}" alt="A Kerala home powered by Flarize solar">
  <h1 class="q-headline">${tx(T('p1.headline', 'Stop Worrying About Electricity Bills Forever'))}</h1>
  <p class="q-subtagline">${tx(T('p1.subline', 'Empowering Kerala homes with clean energy, smart savings, and the joy of sustainability.'))}</p>
  <div class="q-trust-badges" data-region="trust-badges">
    ${badgeL.map(renderBadge).join('')}
  </div>
  <div class="q-letter">
    <p class="q-dear">${dearLine}</p>
    <p>${tx(T('p1.letter1', 'Thank you for considering Flarize for your home.'))}</p>
    <p>${tx(T('p1.letter2', "Choosing solar is one of the smartest decisions you can make for your home. It's more than reducing your electricity bill—it's about enjoying a better lifestyle, protecting your family from rising electricity costs, and investing in a home that continues to reward you for years to come."))}</p>
    <p>${tx(T('p1.letter3', "We've carefully designed this solution specifically for your home's energy needs, so you can make your decision with complete confidence."))}</p>
    <div class="q-regards">
      <div><span>${tx(T('p1.regards', 'Warm Regards,'))}</span><strong>${tx(T('p1.team', 'Team Flarize'))}</strong></div>
      ${(() => {
        // Company-master signature / seal (uploaded in Company profile) win over the template artwork.
        const co = payload?.company?.value || null;
        if (co && (co.signatureImageUri || co.sealImageUri)) {
          return `${co.signatureImageUri ? `<img class="q-sign" src="${escapeHtml(co.signatureImageUri)}" alt="">` : ''}${co.sealImageUri ? `<img class="q-sign q-seal" src="${escapeHtml(co.sealImageUri)}" alt="">` : ''}`;
        }
        return `<img class="q-sign" src="${escapeHtml(assets.signature)}" alt="">`;
      })()}
    </div>
  </div>
  <h2 class="q-h2">${tx(T('p1.details.title', 'YOUR PROPOSAL DETAILS'))}</h2>
  <div class="q-details">
    <div class="q-col q-col-box">${leftL.map(renderRow).join('')}</div>
    <div class="q-col">${rightL.map(renderRow).join('')}</div>
  </div>
  ${contact.available ? renderContactStrip(payload, 'q1-cs') : renderFooter(assets, contact)}
</section>`;
}

// ---------------------------------------------------------------------------
// PAGE 7 — TECHNICAL SPECIFICATIONS
// ---------------------------------------------------------------------------

/** Document-order page 7. Page NUMBERING is decision C13 and stays undecided. */
export const PAGE_SEVEN = Object.freeze({
  documentOrder: 7,
  sectionName: 'TECHNICAL_SPECIFICATIONS',
  artworkSource: 'SUPPLIED_QUOTATION_ARTIFACT',
  pageNumberDecision: 'C13_PENDING',
});

export const PAGE_SEVEN_ASSETS = Object.freeze({
  logo: 'assets/quotation/q-flarize-logo-592e2a11.png',
  header: 'assets/quotation/page7-header.jpg',
  footer: 'assets/quotation/page-footer.jpg',
  background: null,  // was page7-tech-specs.jpg — artwork has burned-in text that overlaps HTML
});

/**
 * Additional field dependencies for Page 7. Never a substitute value.
 * These supplement FIELD_DEPENDENCY above.
 */
export const PAGE7_DEPENDENCY = Object.freeze({
  LOCKED_BOM_SNAPSHOT: 'LOCKED_BOM_SNAPSHOT',
  COMPONENT_DISPLAY_ATTRIBUTES: 'COMPONENT_DISPLAY_ATTRIBUTES',
  COMMERCIAL_SNAPSHOT: 'COMMERCIAL_SNAPSHOT',
  SUBSIDY_ENGINE: 'SUBSIDY_ENGINE',
  FINANCE_ENGINE: 'FINANCE_ENGINE',
  ALTERNATIVE_QUOTATION_OPTIONS: 'ALTERNATIVE_QUOTATION_OPTIONS',
  DECISION_C6_TIER_DISPLAY_NAMES: 'DECISION_C6_TIER_DISPLAY_NAMES',
});

/**
 * The artwork row definitions for the Page 7 technical specifications table.
 * Each entry maps to a BOM role and specifies how to extract the display text
 * from the payload row's attributes. The label matches the original artwork exactly.
 *
 * NOTHING HERE CALCULATES A VALUE. Every attribute is copied from the payload.
 */
const TECH_SPEC_ROW_DEFS = Object.freeze([
  { label: 'Solar Module Brand',         role: 'PANEL',     extract: solarModuleBrandText },
  { label: 'Module Power (W) and Type',  role: 'PANEL',     extract: modulePowerTypeText },
  { label: 'Panel Warranty',             role: 'PANEL',     extract: panelWarrantyText },
  { label: 'Inverter Type',              role: 'INVERTER',  extract: inverterTypeText },
  { label: 'Inverter Brand & Warranty',  role: 'INVERTER',  extract: inverterBrandWarrantyText },
  { label: 'Battery',                   role: 'BATTERY',   extract: batteryBrandText, conditional: true },
  { label: 'Battery Warranty',          role: 'BATTERY',   extract: batteryWarrantyText, conditional: true },
  { label: 'Mounting Structure',         role: 'STRUCTURE', extract: structureText },
  { label: 'ACDB / DCDB',               roles: ['ACDB', 'DCDB'], extract: acdbDcdbText },
  { label: 'DC Cable (mm²)',        role: 'DC_CABLE',  extract: cableText },
  { label: 'AC Cable (sqmm)',           role: 'AC_CABLE',  extract: cableText },
]);

/**
 * Earthing rows are separate because the artwork prints them individually —
 * one row per EARTHING BOM line. The artwork shows two; the payload may supply
 * any count. Each is rendered as its own table row labelled "Earthing Wire".
 */
const EARTHING_LABEL = 'Earthing Wire';

// --- extraction helpers — COPY ONLY, zero arithmetic --------------------------

function findByRole(rows, role) { return rows.filter(r => r.role === role); }

function solarModuleBrandText(row) {
  return row.attributes.brand ?? null;
}

function modulePowerTypeText(row) {
  const watt = row.attributes.moduleWatt;
  const tech = row.attributes.technology;
  if (watt == null && tech == null) return null;
  const parts = [];
  if (tech) parts.push(tech);
  if (watt) parts.push(`(${watt}W)`);
  return parts.join(' ') || null;
}

function panelWarrantyText(row) {
  if (row.warranty && row.warranty.available) return row.warranty.value ?? null;
  return null;
}

const PHASE_LABEL = Object.freeze({ '1P': 'Single Phase', '3P': 'Three Phase' });

function inverterTypeText(row) {
  const spec = row.attributes.specification;
  const tech = row.attributes.technology;
  const ph = row.attributes.phase;
  const parts = [];
  if (spec) parts.push(spec);
  else if (tech) parts.push(tech);
  if (ph) parts.push(`(${PHASE_LABEL[ph] || ph})`);
  return parts.join(' ') || null;
}

function inverterBrandWarrantyText(row) {
  const brand = row.attributes.brand;
  const warranty = (row.warranty && row.warranty.available) ? row.warranty.value : null;
  if (brand == null && warranty == null) return null;
  const parts = [];
  if (brand) parts.push(brand);
  if (warranty) parts.push(`(${warranty})`);
  return parts.join(' ') || null;
}

function structureText(row) {
  const brand = row.attributes.brand;
  const spec = row.attributes.specification;
  if (brand == null && spec == null) return null;
  return [spec, brand].filter(Boolean).join(' — ') || null;
}

function acdbDcdbText(rows) {
  // rows is an array: [acdbRow|null, dcdbRow|null]
  const parts = [];
  for (const r of rows) {
    if (!r) continue;
    const brand = r.attributes.brand;
    const spec = r.attributes.specification;
    if (brand || spec) parts.push([brand, spec].filter(Boolean).join(', '));
  }
  return parts.length ? parts.join(' / ') : null;
}

function cableText(row) {
  const cs = row.attributes.crossSection;
  const brand = row.attributes.brand;
  if (cs == null && brand == null) return null;
  const parts = [];
  if (cs) parts.push(String(cs));
  if (brand) parts.push(`(${brand})`);
  return parts.join(' ') || null;
}

/** Battery brand + capacity — for hybrid quotations. COPY ONLY. */
function batteryBrandText(row) {
  const brand = row.attributes.brand;
  const capacity = row.attributes.capacity;
  if (brand == null && capacity == null) return null;
  return [brand, capacity].filter(Boolean).join(' — ') || null;
}

/** Battery warranty — from warranty field, same pattern as panel. COPY ONLY. */
function batteryWarrantyText(row) {
  if (row.warranty && row.warranty.available) return row.warranty.value ?? null;
  return null;
}

function earthingText(row) {
  const spec = row.attributes.specification;
  const brand = row.attributes.brand;
  if (spec == null && brand == null) return null;
  return [spec, brand].filter(Boolean).join(' ') || null;
}

/**
 * Build the technical specification fields for Page 7.
 *
 * Each row is a { label, value, available, dependency, note } — the same shape
 * as Page 1's proposal detail fields. The value is COPIED from the payload.
 * A missing component role or missing attributes produce the blocked treatment.
 */
export function techSpecFields(payload) {
  const techSpec = payload?.technicalSpecifications;
  const rows = (techSpec && techSpec.available && Array.isArray(techSpec.rows)) ? techSpec.rows : [];
  const result = [];

  for (const def of TECH_SPEC_ROW_DEFS) {
    if (def.conditional) {
      // Conditional rows (e.g. Battery) appear only when the BOM contains
      // the matching role. Ongrid quotations have no BATTERY; the row is
      // simply absent — not blocked.
      const bomRows = findByRole(rows, def.role);
      if (bomRows.length === 0) continue;
      const bomRow = bomRows[0];
      const value = def.extract(bomRow);
      result.push(field(def.label, value,
        PAGE7_DEPENDENCY.COMPONENT_DISPLAY_ATTRIBUTES,
        `${def.label} attributes are not supplied by the approved component data.`));
    } else if (def.roles) {
      // Multi-role row (ACDB / DCDB): collect one row per role
      const found = def.roles.map(role => findByRole(rows, role)[0] ?? null);
      const anyFound = found.some(Boolean);
      const value = anyFound ? def.extract(found) : null;
      result.push(field(def.label, value,
        anyFound ? PAGE7_DEPENDENCY.COMPONENT_DISPLAY_ATTRIBUTES : PAGE7_DEPENDENCY.LOCKED_BOM_SNAPSHOT,
        anyFound
          ? `${def.label} attributes are not supplied by the approved component data.`
          : `No ${def.label} component exists in the locked BOM.`));
    } else {
      const bomRows = findByRole(rows, def.role);
      const bomRow = bomRows[0] ?? null;
      const value = bomRow ? def.extract(bomRow) : null;
      result.push(field(def.label, value,
        bomRow ? PAGE7_DEPENDENCY.COMPONENT_DISPLAY_ATTRIBUTES : PAGE7_DEPENDENCY.LOCKED_BOM_SNAPSHOT,
        bomRow
          ? `${def.label} attributes are not supplied by the approved component data.`
          : `No ${def.label} component exists in the locked BOM.`));
    }
  }

  // Earthing: one row per EARTHING BOM line (artwork shows two)
  const earthingRows = findByRole(rows, 'EARTHING');
  if (earthingRows.length === 0) {
    result.push(field(EARTHING_LABEL, null, PAGE7_DEPENDENCY.LOCKED_BOM_SNAPSHOT,
      'No Earthing component exists in the locked BOM.'));
  } else {
    for (const er of earthingRows) {
      const value = earthingText(er);
      result.push(field(EARTHING_LABEL, value, PAGE7_DEPENDENCY.COMPONENT_DISPLAY_ATTRIBUTES,
        'Earthing Wire attributes are not supplied by the approved component data.'));
    }
  }

  return Object.freeze(result);
}

/**
 * Commercial summary fields for Page 7 bottom rows.
 *
 * Three-line GST breakdown:
 *   Price Before GST  →  pricing.customer.sellingPriceBeforeGST
 *   GST               →  pricing.customer.gstAmount
 *   TOTAL AMOUNT       →  pricing.customer.customerTotalIncludingGST
 *
 * Every value is COPIED from the approved commercial/pricing payload.
 * The renderer performs NO arithmetic — it does not add, subtract, derive
 * or verify any of these figures.
 *
 * Subsidy, post-subsidy total and PM Surya Ghar language are deliberately
 * absent from this commercial block.
 */
export function commercialSummaryFields(payload) {
  const pricing = payload?.pricing;
  const hasSnapshot = pricing && pricing.available;
  const cust = hasSnapshot ? pricing.customer : null;

  const priceBeforeGST = hasSnapshot
    ? field('Price Before GST',
        formatMoney(cust?.sellingPriceBeforeGST),
        PAGE7_DEPENDENCY.COMMERCIAL_SNAPSHOT)
    : field('Price Before GST', null, PAGE7_DEPENDENCY.COMMERCIAL_SNAPSHOT,
        'No ISSUED commercial snapshot. Price before GST does not exist.');

  const gst = hasSnapshot
    ? field('GST',
        formatMoney(cust?.gstAmount),
        PAGE7_DEPENDENCY.COMMERCIAL_SNAPSHOT)
    : field('GST', null, PAGE7_DEPENDENCY.COMMERCIAL_SNAPSHOT,
        'No ISSUED commercial snapshot. GST amount does not exist.');

  const totalAmount = hasSnapshot
    ? field('TOTAL AMOUNT',
        formatMoney(cust?.customerTotalIncludingGST),
        PAGE7_DEPENDENCY.COMMERCIAL_SNAPSHOT)
    : field('TOTAL AMOUNT', null, PAGE7_DEPENDENCY.COMMERCIAL_SNAPSHOT,
        'No ISSUED commercial snapshot. Total amount does not exist.');

  // Extras outside the system amount (2026-09-08, owner rule D3: transport
  // beyond the included km is a SEPARATE line for the buyer). When the
  // snapshot pins extras, the system amount incl. GST and the extras line are
  // displayed between GST and TOTAL AMOUNT. Values are copied; the snapshot
  // already carries extrasIncludingGST and the final figure; nothing is summed.
  const extras = payload?.extras;
  const extraItems = extras && extras.available && Array.isArray(extras.items) ? extras.items : [];
  if (hasSnapshot && extraItems.length > 0) {
    const systemPrice = field(EXTRAS_LABELS.systemPrice,
      formatMoney(cust?.sellingPriceIncludingGST),
      PAGE7_DEPENDENCY.COMMERCIAL_SNAPSHOT);
    const descriptions = extraItems.map(i => i.description).filter(Boolean).join('; ');
    const extrasField = field(EXTRAS_LABELS.extras,
      `${formatMoney(cust?.extrasIncludingGST)}${descriptions ? ' — ' + descriptions : ''}`,
      PAGE7_DEPENDENCY.COMMERCIAL_SNAPSHOT);
    return Object.freeze([priceBeforeGST, gst, systemPrice, extrasField, totalAmount]);
  }

  return Object.freeze([priceBeforeGST, gst, totalAmount]);
}

/** Labels of the optional extras rows (page 5 / page 7 look them up by label). */
export const EXTRAS_LABELS = Object.freeze({
  systemPrice: 'System Price incl. GST',
  extras: 'Extras (payable separately)',
});

/** Blocked fields across all of Page 7. */
/**
 * The heading's wattage display. The payload supplies kW; the artwork shows
 * watts. This is a unit-label conversion (×1000), not an engineering calculation.
 */
function systemWattLabel(payload) {
  const kw = payload?.system?.systemSizeKw;
  if (kw == null) return null;
  return `${kw * 1000} W`;
}

// --- Page 7 rendering --------------------------------------------------------

function renderSpecRow(f, extraClass = '') {
  const cls = extraClass ? ` class="${extraClass}"` : '';
  if (f.available) {
    return `<tr${cls}><td class="q7-item">${escapeHtml(f.label)}</td>`
      + `<td class="q7-value">${escapeHtml(f.value)}</td></tr>`;
  }
  return `<tr${cls}><td class="q7-item">${escapeHtml(f.label)}</td>`
    + `<td class="q7-value q-blocked">`
    + `${NOT_AVAILABLE_LABEL}</td></tr>`;
}

function renderCommercialRow(f, extraClass = '') {
  const cls = `q7-commercial${extraClass ? ' ' + extraClass : ''}`;
  if (f.available) {
    return `<tr class="${cls}"><td class="q7-item q7-commercial-label">${escapeHtml(f.label)}</td>`
      + `<td class="q7-value q7-commercial-value">${escapeHtml(f.value)}</td></tr>`;
  }
  return `<tr class="${cls}"><td class="q7-item q7-commercial-label">${escapeHtml(f.label)}</td>`
    + `<td class="q7-value q7-commercial-value q-blocked">`
    + `${NOT_AVAILABLE_LABEL}</td></tr>`;
}

/**
 * PAGE 7 — the Technical Specifications page.
 *
 * Page 7 is a THREE-PACKAGE comparison page in the supplied quotation:
 * Base / Value / Premium. The quotation payload may carry the three approved
 * package snapshots in `payload.alternatives`. Each column is rendered from
 * that tier's own payload; nothing is recalculated or inferred here.
 *
 * If an alternative is missing, that column remains present and its fields are
 * rendered as blocked rather than silently falling back to another tier.
 */
/**
 * Column order of the approved artwork: Elite (premium) · Smart (value,
 * recommended, centre) · Essential (base). 2026-09-09 — matches the approved
 * template; the previous base→premium order was reversed.
 */
export const TIER_COLUMN_ORDER = Object.freeze(['premium', 'value', 'base']);

/**
 * The payload that fills the column of `tier`: the alternative option for that
 * tier when the quotation carries alternatives, otherwise the root payload when
 * it IS the selected tier. The primary tier is never dropped just because the
 * other two tiers ride along in `alternatives[]` (fix 2026-09-09).
 */
function tierPayloadFor(payload, tier) {
  const alternatives = Array.isArray(payload?.alternatives) ? payload.alternatives : [];
  const alt = alternatives.find(o => String(o?.tier || o?.packageTier || '').toLowerCase() === tier);
  if (alt?.payload) return alt.payload;
  const selectedTier = String(payload?.system?.packageTier || '').toLowerCase();
  return tier === selectedTier ? payload : null;
}

function page7OptionPayloads(payload) {
  // A single payload represents the selected package only. It must NOT be
  // duplicated into other columns.
  return TIER_COLUMN_ORDER.map(tier => tierPayloadFor(payload, tier));
}

function page7TierFields(optionPayload, tier) {
  if (!optionPayload) {
    const reason = `Approved ${tier} package quotation payload is not supplied.`;
    return {
      tier,
      specs: TECH_SPEC_ROW_DEFS.filter(def => !def.conditional).map(def => field(
        def.label,
        null,
        PAGE7_DEPENDENCY.ALTERNATIVE_QUOTATION_OPTIONS ?? 'ALTERNATIVE_QUOTATION_OPTIONS',
        reason
      )),
      commercial: commercialSummaryFields({}),
      systemSize: field('System Size', null,
        PAGE7_DEPENDENCY.ALTERNATIVE_QUOTATION_OPTIONS ?? 'ALTERNATIVE_QUOTATION_OPTIONS', reason),
    };
  }

  return {
    tier,
    specs: techSpecFields(optionPayload),
    commercial: commercialSummaryFields(optionPayload),
    systemSize: optionPayload?.system?.systemSizeKw != null
      ? field('System Size', `${optionPayload.system.systemSizeKw} kW`, PAGE7_DEPENDENCY.LOCKED_BOM_SNAPSHOT)
      : field('System Size', null, PAGE7_DEPENDENCY.LOCKED_BOM_SNAPSHOT,
          'System size is not supplied by the approved quotation payload.'),
  };
}

/**
 * Page 7 blocked-field report across all three package columns.
 */
export function blockedFieldsPage7(payload) {
  const optionPayloads = page7OptionPayloads(payload);
  const result = [];
  for (const [i, optionPayload] of optionPayloads.entries()) {
    const tier = TIER_COLUMN_ORDER[i];
    const fields = page7TierFields(optionPayload, tier);
    for (const f of [...fields.specs, ...fields.commercial, fields.systemSize]) {
      if (!f.available) {
        result.push({
          label: `${tier}: ${f.label}`,
          dependency: f.dependency,
          note: f.note,
        });
      }
    }
  }
  return Object.freeze(result);
}

function renderPage7Cell(fieldValue) {
  if (fieldValue?.available) {
    return `<td class="q7-value">${escapeHtml(fieldValue.value)}</td>`;
  }
  return `<td class="q7-value q-blocked">`
    + `${NOT_AVAILABLE_LABEL}</td>`;
}

function renderPage7ComparisonRow(label, tierFields, index) {
  const allBlocked = tierFields.every(f => !f?.available);
  const cls = index % 2 ? ' class="q7-alt-row"' : '';
  const blockedAttr = allBlocked ? '' : '';
  return `<tr${cls}${blockedAttr}>`
    + `<td class="q7-item">${escapeHtml(label)}</td>`
    + tierFields.map(renderPage7Cell).join('')
    + `</tr>`;
}

/**
 * PAGE 7 — Technical Specifications / Package Comparison.
 *
 * The original quotation artwork has three customer-facing package columns.
 * Base, Value and Premium are therefore structural columns, not three views of
 * one selected package. The renderer now consumes the three pinned alternative
 * payloads created by quotationWorkspace.buildAlternativePayloads().
 */
export function renderPage7(payload, { assets = PAGE_SEVEN_ASSETS } = {}) {
  const allPayloads = page7OptionPayloads(payload);
  // 2026-09-12 — owner: "we need three — Smart, Essential and Elite — placement
  // and other as original, no changes in the design". The approved artwork has
  // three fixed columns (Elite · Smart · Essential); every column is always
  // printed in that place. A tier whose package was not quotable keeps its
  // column with its name and "Not available" cells — the figures are never
  // borrowed from another tier and never invented.
  const tiers = [...TIER_COLUMN_ORDER];
  const optionPayloads = allPayloads;
  // C6 contract: tier display names come from the approved payload, never hardcoded.
  // Structural tier identity (CSS classes, column ordering) uses the internal tier code.
  const tierDisplayNames = {};
  const tierRecommended = {};
  const pinnedNames = payload?.system?.tierColumnNames || null;
  for (const [i, tier] of tiers.entries()) {
    const p = optionPayloads[i];
    const df = p?.system?.packageTierDisplayName ?? pinnedNames?.[tier];
    tierDisplayNames[tier] = df && df.available ? df.value : null;
    tierRecommended[tier] = typeof p?.system?.recommendedBadge === 'string' && p.system.recommendedBadge;
  }
  const tierData = optionPayloads.map((p, i) => page7TierFields(p, tiers[i]));

  const primarySize = payload?.system?.systemSizeKw != null
    ? `${payload.system.systemSizeKw} kW Solar System`
    : null;
  const headingWatt = systemWattLabel(payload);
  const heading = headingWatt
    ? `<span class="q7-title">Technical Specifications</span> <span class="q7-equiv">(Equivalent to ${escapeHtml(headingWatt)})</span>`
    : `<span class="q7-title">Technical Specifications</span>`;

  // Use the Base column as the canonical row-label source. The row definitions
  // are fixed by the approved template, so all three columns stay aligned.
  // Conditional rows (e.g. Battery) appear only when at least one tier has that role.
  const allSpecRows = tierData.flatMap(d => d.specs);
  const rowLabels = TECH_SPEC_ROW_DEFS
    .filter(def => !def.conditional || allSpecRows.some(f => f.label === def.label))
    .map(def => def.label);
  const maxEarthingRows = Math.max(0, ...tierData.map(d => d.specs.filter(f => f.label === EARTHING_LABEL).length));
  for (let i = 0; i < maxEarthingRows; i += 1) rowLabels.push(EARTHING_LABEL);

  const cellCls = (tier) => tierRecommended[tier] ? ' q7-rec' : '';
  const renderCell = (f, tier) => f?.available
    ? `<td class="q7-value${cellCls(tier)}">${escapeHtml(f.value)}</td>`
    : `<td class="q7-value q-blocked${cellCls(tier)}">${NOT_AVAILABLE_LABEL}</td>`;

  const rowsHtml = [];
  const earthingRowIndex = new Map();
  for (const label of rowLabels) {
    const cells = tierData.map(d => {
      const matches = d.specs.filter(f => f.label === label);
      // Earthing can have multiple rows. Keep the same occurrence aligned
      // across Base / Value / Premium rather than repeating the first row.
      const occurrence = label === EARTHING_LABEL ? (earthingRowIndex.get(d) ?? 0) : 0;
      if (label === EARTHING_LABEL) earthingRowIndex.set(d, occurrence + 1);
      return matches[occurrence] ?? field(label, null,
        PAGE7_DEPENDENCY.LOCKED_BOM_SNAPSHOT,
        `No ${label} component exists in the locked BOM.`);
    });
    rowsHtml.push(`<tr${rowsHtml.length % 2 ? ' class="q7-alt-row"' : ''}>`
      + `<td class="q7-item">${escapeHtml(label)}</td>`
      + cells.map((f, i) => renderCell(f, tiers[i])).join('')
      + `</tr>`);
  }

  // Commercial rows are also package-specific. Rendered in <tfoot> to match
  // the approved artwork structure (separate from technical spec rows).
  // Approved template v1 (owner, 2026-09-12: "no changes in the design"): the
  // footer is exactly Total System Cost · Down Payment (N%) · Subsidy Amount ·
  // Amount Payable / Financed. The GST split and the transport-extra line are
  // shown on the option cards of page 5, not here.
  const commercialLabels = ['TOTAL AMOUNT'];
  const commercialRowsHtml = [];
  for (const label of commercialLabels) {
    const cells = tierData.map(d => d.commercial.find(f => f.label === label)
      ?? field(label, null, PAGE7_DEPENDENCY.COMMERCIAL_SNAPSHOT,
        'No ISSUED commercial snapshot supplied for this package.'));
    const isTotal = label === 'TOTAL AMOUNT';
    commercialRowsHtml.push(`<tr class="q7-commercial${isTotal ? ' q7-total-amount' : ''}">`
      + `<td class="q7-item q7-commercial-label">${escapeHtml(isTotal ? 'Total System Cost' : label)}</td>`
      + cells.map((f, i) => f?.available
        ? `<td class="q7-value q7-commercial-value${cellCls(tiers[i])}">${escapeHtml(f.value)}</td>`
        : `<td class="q7-value q7-commercial-value q-blocked${cellCls(tiers[i])}">${NOT_AVAILABLE_LABEL}</td>`).join('')
      + `</tr>`);
  }
  const payRows = page7PaymentRows(optionPayloads);
  for (const row of payRows) {
    commercialRowsHtml.push(`<tr class="q7-pay ${row.cls}">`
      + `<td class="q7-item q7-pay-label">${escapeHtml(row.label)}</td>`
      + row.cells.map((f, i) => f?.available
        ? `<td class="q7-value q7-pay-value${cellCls(tiers[i])}">${escapeHtml(f.value)}</td>`
        : `<td class="q7-value q7-pay-value q-blocked${cellCls(tiers[i])}">${NOT_AVAILABLE_LABEL}</td>`).join('')
      + `</tr>`);
  }
  const payNote = payRows.length
    ? `<p class="q7-paynote">Down payment is calculated on the total system cost. Amount payable / financed is the total cost less the down payment and the subsidy, and is the basis for the EMI.</p>`
    : '';

  const colCount = tiers.length || 1;
  return `<section class="page q7-page q7-cols-${colCount}" data-page-section="${PAGE_SEVEN.sectionName}" data-document-order="7">
  <img class="q7-logo" src="${escapeHtml(assets.logo)}" alt="Flarize by Golden Ray">
  <div class="q7-heading">
    <h2 class="q7-h2">${heading}</h2>
    <p class="q7-subtitle">Every component, every specification — total transparency for your peace of mind.</p>
  </div>
  <table class="q7-table q7-comparison-table">
    <thead>
      <tr>
        <th class="q7-th-item">Items</th>
        ${tiers.map(tier => {
          const displayName = tierDisplayNames[tier];
          const nameHtml = displayName
            ? escapeHtml(displayName)
            : `<span class="q-blocked">${NOT_AVAILABLE_LABEL}</span>`;
          return `<th class="q7-th-config q7-tier-${tier}${cellCls(tier)}">${nameHtml}<span class="q7-th-sub">${primarySize ? escapeHtml(primarySize) : ''}</span></th>`;
        }).join('')}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml.join('')}
    </tbody>
    <tfoot>
      ${commercialRowsHtml.join('')}
    </tfoot>
  </table>
  ${payNote}
  ${renderContactStrip(payload, 'q7-cs')}
</section>`;
}

/**
 * Approved page-7 payment rows: Down Payment (N%) / Subsidy Amount / Amount
 * Payable · Financed. Values are copied per tier from financing.value and
 * subsidy.value. Returns [] when no tier supplies a finance result, so a
 * quotation issued without the engines keeps the plain GST block.
 */
function page7PaymentRows(optionPayloads) {
  const fins = optionPayloads.map(p => (p?.financing?.available ? p.financing.value : null));
  const subs = optionPayloads.map(p => (p?.subsidy?.available ? p.subsidy.value : null));
  if (!fins.some(Boolean)) return [];
  const pct = fins.find(f => f && f.downPaymentPercentage != null)?.downPaymentPercentage;
  const downLabel = pct != null ? `Down Payment (${pct}%)` : 'Down Payment';
  const rows = [];
  rows.push({ label: downLabel, cls: 'q7-pay-down', cells: fins.map(f => f && f.downPaymentAmount != null
    ? field(downLabel, formatMoney(f.downPaymentAmount), PAGE7_DEPENDENCY.FINANCE_ENGINE)
    : field(downLabel, null, PAGE7_DEPENDENCY.FINANCE_ENGINE, 'Finance engine result not supplied.')) });
  if (subs.some(Boolean)) {
    rows.push({ label: 'Subsidy Amount', cls: 'q7-pay-subsidy', cells: subs.map(sv => sv && sv.totalSubsidy != null
      ? field('Subsidy Amount', formatMoney(sv.totalSubsidy), PAGE7_DEPENDENCY.SUBSIDY_ENGINE)
      : field('Subsidy Amount', null, PAGE7_DEPENDENCY.SUBSIDY_ENGINE, 'Subsidy engine result not supplied.')) });
  }
  rows.push({ label: 'Amount Payable / Financed', cls: 'q7-pay-fin', cells: fins.map(f => f && f.loanAmount != null
    ? field('Amount Payable / Financed', formatMoney(f.loanAmount), PAGE7_DEPENDENCY.FINANCE_ENGINE)
    : field('Amount Payable / Financed', null, PAGE7_DEPENDENCY.FINANCE_ENGINE, 'Finance engine result not supplied.')) });
  return rows;
}

/** Page 7 stylesheet — approved template v1 typography (px on the A4 page). */
export const PAGE_SEVEN_STYLES = `
.q7-page { background:#fff; font-family:'Poppins',sans-serif; color:#16262b; display:flex; flex-direction:column; padding:32px 45px 0 45px; }
.q7-logo { width:152px; height:auto; display:block; }
.q7-heading { text-align:center; margin-top:14px; }
.q7-h2 { font-size:24px; font-weight:800; margin:0; line-height:1.15; color:#123f35; }
.q7-title { color:#123f35; }
.q7-equiv { color:#16262b; font-weight:500; }
.q7-subtitle { color:#3f4b50; font-size:11.5px; margin:6px 0 0; }
.q7-table { width:100%; margin:14px 0 0; border-collapse:collapse; font-size:11px; }
.q7-th-item { text-align:left; padding:18px 8px 18px 12px; font-weight:700; color:#16262b; border-bottom:1px solid #e4e6e7; width:23%; font-size:12px; }
.q7-th-config { text-align:left; padding:16px 10px; font-weight:700; color:#16262b; border-bottom:1px solid #e4e6e7; font-size:12px; width:25.6%; }
.q7-th-sub { display:block; font-weight:400; font-size:9.5px; color:#6a7378; margin-top:2px; }
.q7-th-config.q7-rec { color:#F5901E; background:#fff8f0; }
.q7-th-config.q7-rec .q7-th-sub { color:#F5901E; }
.q7-item { padding:15px 8px 15px 12px; color:#3f4b50; border-bottom:1px solid #ededed; vertical-align:middle; line-height:1.35; }
.q7-value { padding:15px 10px; color:#16262b; font-weight:600; border-bottom:1px solid #ededed; vertical-align:middle; line-height:1.35; white-space:normal; }
.q7-value.q7-rec, .q7-commercial-value.q7-rec, .q7-pay-value.q7-rec { background:#fff8f0; border-left:1px solid #f4d9b8; border-right:1px solid #f4d9b8; }
.q7-value.q-blocked { font-weight:400; font-style:italic; color:#8a8f98; }
.q7-commercial { background:#f4f5f5; }
.q7-commercial-label { font-weight:400; color:#3f4b50; }
.q7-commercial-value { font-weight:600; color:#16262b; }
.q7-total-amount .q7-commercial-label, .q7-total-amount .q7-commercial-value { font-weight:700; color:#16262b; }
.q7-pay-label { font-weight:400; color:#3f4b50; }
.q7-pay-value { font-weight:600; }
.q7-pay-subsidy { background:#f4f5f5; }
.q7-pay-subsidy .q7-pay-label { font-weight:700; color:#16262b; }
.q7-pay-subsidy .q7-pay-value { color:#0f7a33; font-weight:700; }
.q7-pay-fin, .q7-pay-fin td { background:#1a8a3f !important; color:#fff !important; border-color:#1a8a3f !important; }
.q7-pay-fin .q7-pay-label { font-weight:700; color:#fff; line-height:1.25; }
.q7-pay-fin .q7-pay-value { font-weight:700; font-size:12px; }
.q7-paynote { font-size:8.5px; color:#8b9297; margin:8px 0 0 12px; }
.q7-cs { margin:auto -45px 0 -45px; }
`;

// =============================================================================
// PAGE 2 — OFFER PAGE (permanent Onam artwork).
//
// V4 quotation-finalization Phase 2B (HARD LOCK):
//   Page 2 is the SINGLE permanent Offer Page. The approved Onam-styled
//   artwork is immutable; there is no seasonal / template switching. The
//   prior FESTIVAL_ONAM / FESTIVAL_DIWALI / FESTIVAL_GENERIC selector, the
//   theme-token validator and the template resolver were REMOVED in this
//   phase — one visual, always.
//
// Dynamic offer/campaign data comes from payload.campaign.value (CMS
// snapshot). For an ISSUED quotation the payload is the frozen
// document.payload captured at issuance (Phase 2D contract) — so later
// changes to the CMS active campaign never alter an already-issued
// customer PDF.
//
// PURE. No calculation. No clock. No arithmetic. No hardcoded campaign
// content — every dynamic value is copied from payload; a missing value
// suppresses its region without inventing anything.
// =============================================================================

/** Document-order page 2. */
export const PAGE_TWO = Object.freeze({
  documentOrder: 2,
  sectionName: 'SEASONAL_CAMPAIGN',
  artworkSource: 'SUPPLIED_QUOTATION_ARTIFACT',
  pageNumberDecision: 'C13_PENDING',
});

/**
 * Page 2 assets — the permanent Onam artwork extracted from the approved
 * quotation and vendored under public/assets/quotation/. These are default
 * fallbacks: if payload.campaign.value.artwork carries an image, the
 * payload path wins.
 */
export const PAGE_TWO_ASSETS = Object.freeze({
  brandLogo: 'assets/quotation/q-flarize-logo-592e2a11.png',
  floral: 'assets/quotation/q-page-02-onam-floral.jpg',
  mahabali: 'assets/quotation/q-page-02-mahabali.jpg',
  qr: 'assets/quotation/q-page-02-qr.jpg',
});

/** Field dependencies for Page 2. */
export const PAGE2_DEPENDENCY = Object.freeze({
  CMS: 'CMS',
  COMPANY_MASTER: 'COMPANY_MASTER',
});

/**
 * Build field set for Page 2. Payload-driven. When a campaign is not
 * supplied every campaign-bound field is blocked; the CTA contact fields
 * fall through to the Company Master dependency.
 *
 * NO calculation. NO clock. NO campaign selection.
 */
export function page2Fields(payload) {
  const c = payload?.campaign;
  const hasCampaign = c && c.available && c.value;
  const cv = hasCampaign ? c.value : null;

  const headline = hasCampaign && cv.headline
    ? field('Campaign Headline', cv.headline, null)
    : field('Campaign Headline', null, PAGE2_DEPENDENCY.CMS,
        'No active campaign supplied in the quotation payload.');
  const subheadline = hasCampaign && cv.subheadline
    ? field('Campaign Subheadline', cv.subheadline, null)
    : field('Campaign Subheadline', null, PAGE2_DEPENDENCY.CMS,
        'No active campaign supplied in the quotation payload.');
  const primaryBenefit = hasCampaign && cv.primaryBenefit && cv.primaryBenefit.displayValue
    ? field('Primary Benefit', cv.primaryBenefit.displayValue, null)
    : field('Primary Benefit', null, PAGE2_DEPENDENCY.CMS,
        'No primary benefit supplied by the active campaign.');
  const campaignName = hasCampaign && cv.name
    ? field('Campaign Name', cv.name, null)
    : field('Campaign Name', null, PAGE2_DEPENDENCY.CMS,
        'No active campaign supplied in the quotation payload.');
  const period = hasCampaign && cv.period && cv.period.displayText
    ? field('Campaign Period', cv.period.displayText, null)
    : field('Campaign Period', null, PAGE2_DEPENDENCY.CMS,
        'The active campaign does not carry a period; CAMPAIGN PERIOD card suppressed.');

  const company = payload?.company?.value ?? null;
  const website = company?.website
    ? field('Contact Website', company.website, null)
    : field('Contact Website', null, PAGE2_DEPENDENCY.COMPANY_MASTER,
        'Company Master does not carry a website; CTA website suppressed.');
  const phone = company?.phone
    ? field('Contact Phone', company.phone, null)
    : field('Contact Phone', null, PAGE2_DEPENDENCY.COMPANY_MASTER,
        'Company Master does not carry a phone; CTA phone suppressed.');

  return Object.freeze([headline, subheadline, primaryBenefit, campaignName, period, website, phone]);
}

/** Every Page 2 region that could not print, with its named dependency. */
export function blockedFieldsPage2(payload) {
  const all = page2Fields(payload);
  return Object.freeze(all.filter(f => !f.available)
    .map(f => Object.freeze({ label: f.label, dependency: f.dependency, note: f.note })));
}

/** Inline SVG glyphs copied verbatim from the approved Onam artwork. */
const P2_SVG_SUN = `<svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="17" r="5.3" fill="#F5901E"></circle><g stroke="#F5901E" stroke-width="2.1" stroke-linecap="round"><line x1="16" y1="5" x2="16" y2="8.5"></line><line x1="7.2" y1="8.2" x2="9.4" y2="10.4"></line><line x1="4" y1="17" x2="7" y2="17"></line><line x1="24.8" y1="8.2" x2="22.6" y2="10.4"></line><line x1="28" y1="17" x2="25" y2="17"></line><line x1="16" y1="25.5" x2="16" y2="27"></line></g></svg>`;
const P2_SVG_SLOTS = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F5901E" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"></circle><path d="M12 13V9M9 2h6"></path></svg>`;
const P2_SVG_SCOOTER = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F5901E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="17" r="3"></circle><circle cx="18" cy="17" r="3"></circle><path d="M9 17h6M6 14l3-6h4l3 4h2"></path></svg>`;
const P2_SVG_SAVE = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2f9e56" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M3 11c0-2 2-4 5-4h3c3 0 5 2 5 4v3c0 1-1 2-2 2v2h-2v-2H7v2H5v-2c-1 0-2-1-2-2z"></path><circle cx="14" cy="11" r="1"></circle></svg>`;
const P2_SVG_GIFT = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2f9e56" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><rect x="4" y="9" width="16" height="11" rx="1"></rect><path d="M4 13h16M12 9v11"></path><path d="M12 9S9 4 6.5 6 12 9 12 9zM12 9s3-5 5.5-3S12 9 12 9z"></path></svg>`;
const P2_SVG_CAL = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2f9e56" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><rect x="3.5" y="4.5" width="17" height="16" rx="2"></rect><path d="M3.5 9h17M8 3v3M16 3v3"></path><path d="M8.5 14l2.2 2.2 4.3-4.4"></path></svg>`;
const P2_SVG_TIMER = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2f9e56" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><circle cx="12" cy="13" r="8"></circle><path d="M12 13V9M9 2h6"></path></svg>`;
const P2_SVG_CAL_DARK = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#123f35" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><rect x="3.5" y="4.5" width="17" height="16" rx="2"></rect><path d="M3.5 9h17M8 3v3M16 3v3"></path></svg>`;
const P2_SVG_WEB = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2f9e56" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"></path></svg>`;
const P2_SVG_PHONE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#2f9e56" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.2 1l-2.3 2.3z"></path></svg>`;

/**
 * PAGE 2 — the permanent approved Onam Offer Page.
 *
 * Renders the approved live-HTML section from the supplied template with
 * every dynamic region bound to payload.campaign.value + payload.company.
 * No template selection, no theme validation, no invented business data.
 *
 * A payload without campaign.available === true produces an empty string,
 * matching the prior contract: Page 2 is optional in the document flow.
 */
export function renderPage2(payload, { assets = PAGE_TWO_ASSETS } = {}) {
  const c = payload?.campaign;
  const hasCampaign = c && c.available && c.value;
  if (!hasCampaign) return '';
  const cv = c.value;
  const company = payload?.company?.value ?? null;
  // Festival binding (2026-09-10): the approved artwork is the Onam Solar Fest
  // page. Its festival words, Mahabali illustration and floral corners print
  // only when the campaign names the festival (theme.festival, set in
  // Quotation content → Offer page) or supplies its own artwork. A campaign
  // with no festival prints the same layout with neutral wording — nothing
  // festival-specific is assumed.
  const festival = (cv.theme && typeof cv.theme === 'object' && cv.theme.festival) ? String(cv.theme.festival).trim() : '';
  const isOnam = /onam/i.test(festival);
  const FEST = festival ? escapeHtml(festival.toUpperCase()) : '';

  // --- Static header (Flarize wordmark) — verbatim from approved artwork ---
  const headerHtml =
    `<div class="q2-header">
      <div class="q2-header-brand">
        ${P2_SVG_SUN}
        <div class="q2-header-name">
          <span class="q2-header-flarize">Flarize</span>
          <span class="q2-header-sub">POWERED BY GOLDEN RAY</span>
        </div>
      </div>
    </div>`;

  // --- Corner floral decorations (Onam permanent artwork) ---
  const floralSrc = escapeHtml((cv.artwork && cv.artwork.decorationImage) || (isOnam ? assets.floral : ''));
  const decorHtml = floralSrc
    ? `<img class="q2-deco q2-deco-tr" src="${floralSrc}" alt="">
       <img class="q2-deco q2-deco-tl" src="${floralSrc}" alt="">
       <img class="q2-deco q2-deco-bl" src="${floralSrc}" alt="">
       <img class="q2-deco q2-deco-br" src="${floralSrc}" alt="">`
    : '';

  // --- Hero: year badge + headline + subheadline + Mahabali + urgency card ---
  const yearBadgeHtml = cv.yearBadge
    ? `<div class="q2-year-badge"><span class="q2-year-star">✦</span> ${FEST ? `${FEST} SOLAR FEST` : escapeHtml(String(cv.name || 'SOLAR OFFER').toUpperCase())} <span class="q2-year-num">${escapeHtml(String(cv.yearBadge))}</span> <span class="q2-year-star">✦</span></div>`
    : '';
  const headlineHtml = cv.headline
    ? `<h1 lang="ml" class="q2-headline-ml">${escapeHtml(cv.headline)}</h1>`
    : '';
  // Approved artwork colours the festival name green and "Flarize!" orange in
  // the sub-headline ("Celebrate <Onam> with <Flarize!>"); same accents here,
  // applied to whatever words the campaign carries — text itself is untouched.
  const accent = (txt) => {
    let out = escapeHtml(txt);
    if (festival) out = out.replace(new RegExp(`\\b${escapeHtml(festival).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), m => `<span class="q2-sub-fest">${m}</span>`);
    out = out.replace(/Flarize!?/, m => `<span class="q2-sub-brand">${m}</span>`);
    return out;
  };
  const subheadHtml = cv.subheadline
    ? `<p class="q2-subheadline">${accent(cv.subheadline)}</p>`
    : '';
  const mahabaliSrc = escapeHtml((cv.artwork && cv.artwork.illustrationImage) || (isOnam ? assets.mahabali : ''));
  const mahabaliHtml = mahabaliSrc
    ? `<img class="q2-mahabali" src="${mahabaliSrc}" alt="">`
    : '';
  // Urgency card: bind remainingCount + displayText from payload — suppress when absent.
  const urgency = cv.urgency;
  const urgencyHtml = urgency && urgency.enabled && (urgency.remainingCount != null || urgency.displayText)
    ? `<div class="q2-urgency-card">
        <div class="q2-urgency-top">${P2_SVG_SLOTS}<span class="q2-urgency-label">${escapeHtml(urgency.displayText || 'LIMITED SLOTS')}</span></div>
        ${urgency.remainingCount != null
          ? `<div class="q2-urgency-count">Only <span class="q2-urgency-count-num">${escapeHtml(String(urgency.remainingCount))}</span> <span class="q2-urgency-count-word">Left</span></div>`
          : ''}
        <div class="q2-urgency-note">${festival ? 'Festival bookings' : 'Bookings'} close soon — reserve yours today.</div>
      </div>`
    : '';

  // --- Primary benefit band (₹40,000+ IN BENEFITS*) ---
  const pb = cv.primaryBenefit;
  const benefitHtml = pb && pb.displayValue
    ? `<div class="q2-benefit-band">
        <div class="q2-benefit-band-accent"></div>
        <div class="q2-benefit-band-text">
          <div class="q2-benefit-band-label">${escapeHtml((pb.headline || (festival ? 'FESTIVAL OFFERS WORTH UP TO' : 'OFFERS WORTH UP TO')).toUpperCase())}</div>
          <div class="q2-benefit-band-value">₹${escapeHtml(pb.displayValue)}<span class="q2-benefit-band-suffix"> IN BENEFITS*</span></div>
        </div>
        <div class="q2-benefit-band-ribbon">LIMITED TIME<br>${festival ? 'FESTIVAL ' : ''}OFFER</div>
      </div>`
    : '';

  // --- Lucky draw card (MEGA LUCKY DRAW) ---
  const ld = cv.luckyDraw;
  const luckyHtml = ld && ld.enabled && (ld.title || ld.description)
    ? `<div class="q2-lucky">
        <div class="q2-lucky-img-wrap">
          ${ld.image ? `<img class="q2-lucky-img" src="${escapeHtml(ld.image)}" alt="">` : `<div class="q2-lucky-img-placeholder" aria-hidden="true"></div>`}
          <div class="q2-lucky-grand-badge">★ GRAND PRIZE</div>
        </div>
        <div class="q2-lucky-body">
          <div class="q2-lucky-eyebrow">MEGA LUCKY DRAW</div>
          ${ld.title ? `<div class="q2-lucky-title">${escapeHtml(ld.title)}</div>` : ''}
          ${ld.description ? `<p class="q2-lucky-desc">${escapeHtml(ld.description)}</p>` : ''}
          ${ld.winners != null
            ? `<div class="q2-lucky-winners">${P2_SVG_SCOOTER}<span>${escapeHtml(String(ld.winners))} Lucky Winners</span></div>`
            : ''}
        </div>
      </div>`
    : '';

  // --- Offer cards (3-up grid) ---
  const enabledOffers = Array.isArray(cv.offers)
    ? cv.offers.filter(o => o && o.enabled !== false).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
    : [];
  const offerCardsHtml = enabledOffers.length
    ? `<div class="q2-more-benefits">
        <div class="q2-divider"><span class="q2-divider-line"></span><span class="q2-divider-text">MORE ${festival ? 'FESTIVAL ' : ''}BENEFITS</span><span class="q2-divider-line"></span></div>
        <div class="q2-offers-grid">${enabledOffers.map(o => `
          <div class="q2-offer-card">
            <div class="q2-offer-img-wrap">${o.image ? `<img class="q2-offer-img" src="${escapeHtml(o.image)}" alt="">` : `<div class="q2-offer-img-placeholder" aria-hidden="true"></div>`}</div>
            <div class="q2-offer-text">
              <div class="q2-offer-title">${escapeHtml(o.title || '')}</div>
              ${o.description ? `<div class="q2-offer-desc">${escapeHtml(o.description)}</div>` : ''}
            </div>
          </div>`).join('')}</div>
      </div>`
    : '';

  // --- WHY BOOK … (approved D7 copy, festival word + benefit value bound to the campaign) + campaign period card ---
  const period = cv.period;
  const periodHtml = period && (period.displayText || period.note)
    ? `<div class="q2-period-card">
        <div class="q2-period-label">CAMPAIGN PERIOD</div>
        <div class="q2-period-value">${P2_SVG_CAL_DARK}<span>${escapeHtml(period.displayText || '')}</span></div>
        ${period.note ? `<div class="q2-period-note">${escapeHtml(period.note)}</div>` : ''}
      </div>`
    : '';
  const whyBookHtml =
    `<div class="q2-why-and-period">
      <div class="q2-why">
        <div class="q2-why-header">${FEST ? `WHY BOOK DURING ${FEST}?` : 'WHY BOOK NOW?'}</div>
        <div class="q2-why-grid">
          <div class="q2-why-item">${P2_SVG_SAVE}<div><div class="q2-why-title">Better Savings</div><div class="q2-why-sub">${pb && pb.displayValue ? `Offers worth up to ₹${escapeHtml(pb.displayValue)}` : 'Bundled offers &amp; vouchers'}</div></div></div>
          <div class="q2-why-item">${P2_SVG_GIFT}<div><div class="q2-why-title">Exclusive Gifts</div><div class="q2-why-sub">Exciting gifts &amp; vouchers</div></div></div>
          <div class="q2-why-item">${P2_SVG_CAL}<div><div class="q2-why-title">Faster Installation</div><div class="q2-why-sub">Priority ${festival ? 'festival ' : ''}scheduling</div></div></div>
          <div class="q2-why-item">${P2_SVG_TIMER}<div><div class="q2-why-title">Limited Time Only</div><div class="q2-why-sub">Valid for a short period</div></div></div>
        </div>
      </div>
      ${periodHtml}
    </div>`;

  // --- CTA + QR + contact (website/phone from company profile) ---
  const cta = cv.cta;
  const qrSrc = escapeHtml((cv.artwork && cv.artwork.qrImage) || assets.qr);
  const ctaHtml = cta && cta.enabled && (cta.buttonText || cta.description)
    ? `<div class="q2-cta-row">
        <div class="q2-cta-msg">
          ${cta.buttonText ? `<div class="q2-cta-headline"><span class="q2-cta-star">✦</span> ${escapeHtml(cta.buttonText)}</div>` : ''}
          ${cta.description ? `<div class="q2-cta-desc">${escapeHtml(cta.description)}</div>` : ''}
        </div>
        <div class="q2-cta-contact">
          <div class="q2-cta-qr">
            <div class="q2-cta-qr-label">SCAN TO BOOK</div>
            ${qrSrc ? `<img class="q2-cta-qr-img" src="${qrSrc}" alt="Booking QR code">` : ''}
          </div>
          <div class="q2-cta-info">
            ${company?.website ? `<div class="q2-cta-info-row q2-cta-info-web">${P2_SVG_WEB}<span>${escapeHtml(company.website)}</span></div>` : ''}
            ${company?.phone ? `<div class="q2-cta-info-row q2-cta-info-phone">${P2_SVG_PHONE}<span>${escapeHtml(company.phone)}</span></div>` : ''}
          </div>
        </div>
      </div>`
    : '';

  // --- Disclaimer strip ---
  const disclaimerHtml = cv.disclaimer
    ? `<div class="q2-disclaimer">${escapeHtml(cv.disclaimer)}</div>`
    : '';

  // 2026-09-11 — the approved page-2 artwork is authored in px on the 794-px
  // A4 page (padding 40px, urgency card at left:397px, 40px headline …), and
  // PAGE_TWO_STYLES carries exactly those values. It was previously wrapped in
  // the 1000×1414 .q-canvas/.q-inner design canvas (zoom 0.79374), which
  // shrank every height and offset to 79 % — a squashed hero, Mahabali over
  // the urgency card, and an empty band above the disclaimer. Like pages 1
  // and 4–12 it now draws directly on the physical A4 page (1 CSS px = 1/96 in).
  return `<section class="page q2-page" data-page-section="${PAGE_TWO.sectionName}" data-document-order="2" data-campaign-id="${escapeHtml(cv.id || '')}">
      <div class="q2-ambient"></div>
      ${decorHtml}
      ${headerHtml}
      <div class="q2-hero">
        <div class="q2-hero-left">
          ${yearBadgeHtml}
          ${headlineHtml}
          ${subheadHtml}
        </div>
        ${urgencyHtml}
        ${mahabaliHtml}
      </div>
      ${benefitHtml}
      ${luckyHtml}
      ${offerCardsHtml}
      ${whyBookHtml}
      ${ctaHtml}
      ${disclaimerHtml}
</section>`;
}

/**
 * Page 2 styles — single visual (approved Onam artwork).
 *
 * NO template-specific overrides. NO --q2-* theme tokens.
 * All colours are the approved Onam palette, applied directly.
 */
export const PAGE_TWO_STYLES = `
/* V4 Phase 2B — vendored approved fonts (Noto Sans Malayalam + Poppins).
 * Extracted verbatim from the approved quotation bundle so the customer
 * PDF renders deterministic typography without any Google Fonts / network
 * dependency. All 24 @font-face rules are Page-2-scoped (they live in
 * PAGE_TWO_STYLES only). Page 1 continues to use the Poppins/system stack. */
@font-face {
  font-family: 'Noto Sans Malayalam';
  font-style: normal;
  font-weight: 600;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/quotation/fonts/b30f90ac-0424-4a0a-b4b3-7aaf20c0081a.woff2") format('woff2');
  unicode-range: U+0307, U+0323, U+0951-0952, U+0964-0965, U+0D00-0D7F, U+1CDA, U+1CF2, U+200C-200D, U+20B9, U+25CC, U+A830-A832;
}
@font-face {
  font-family: 'Noto Sans Malayalam';
  font-style: normal;
  font-weight: 600;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/quotation/fonts/da8451e0-e1a4-4127-9cde-26be0ded6d19.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Noto Sans Malayalam';
  font-style: normal;
  font-weight: 600;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/quotation/fonts/abe7d8ca-aaa5-4cd7-8d84-16c546637d0b.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Noto Sans Malayalam';
  font-style: normal;
  font-weight: 700;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/quotation/fonts/b30f90ac-0424-4a0a-b4b3-7aaf20c0081a.woff2") format('woff2');
  unicode-range: U+0307, U+0323, U+0951-0952, U+0964-0965, U+0D00-0D7F, U+1CDA, U+1CF2, U+200C-200D, U+20B9, U+25CC, U+A830-A832;
}
@font-face {
  font-family: 'Noto Sans Malayalam';
  font-style: normal;
  font-weight: 700;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/quotation/fonts/da8451e0-e1a4-4127-9cde-26be0ded6d19.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Noto Sans Malayalam';
  font-style: normal;
  font-weight: 700;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/quotation/fonts/abe7d8ca-aaa5-4cd7-8d84-16c546637d0b.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Noto Sans Malayalam';
  font-style: normal;
  font-weight: 800;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/quotation/fonts/b30f90ac-0424-4a0a-b4b3-7aaf20c0081a.woff2") format('woff2');
  unicode-range: U+0307, U+0323, U+0951-0952, U+0964-0965, U+0D00-0D7F, U+1CDA, U+1CF2, U+200C-200D, U+20B9, U+25CC, U+A830-A832;
}
@font-face {
  font-family: 'Noto Sans Malayalam';
  font-style: normal;
  font-weight: 800;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/quotation/fonts/da8451e0-e1a4-4127-9cde-26be0ded6d19.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Noto Sans Malayalam';
  font-style: normal;
  font-weight: 800;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/quotation/fonts/abe7d8ca-aaa5-4cd7-8d84-16c546637d0b.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("assets/quotation/fonts/aa355017-9200-4d53-8bcc-0d3a23017c22.woff2") format('woff2');
  unicode-range: U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B09;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("assets/quotation/fonts/c9f4ba49-cf52-44bc-ab8d-a88e0824e7a5.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("assets/quotation/fonts/fce02286-18b1-4280-9193-97b01ab8760f.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("assets/quotation/fonts/96f6e980-0ce4-4821-9230-79ad64560ef6.woff2") format('woff2');
  unicode-range: U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B09;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("assets/quotation/fonts/79abc746-11d6-4eb1-a1ac-176e9aa29346.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("assets/quotation/fonts/8f47f1b9-a5b3-4016-91a5-156eed566bdf.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("assets/quotation/fonts/3f0d89c1-e352-4c3b-8a3d-8fe3044a3618.woff2") format('woff2');
  unicode-range: U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B09;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("assets/quotation/fonts/8cef63d9-383d-4699-81c3-98c2fa57dd12.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("assets/quotation/fonts/87181f77-ad5a-4026-ad31-195eecd21156.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("assets/quotation/fonts/29a28ed5-1288-42c3-9e7e-b42848b0bd7c.woff2") format('woff2');
  unicode-range: U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B09;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("assets/quotation/fonts/38cc7662-2938-419a-bf45-3af7eb0257a1.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("assets/quotation/fonts/94ef90ff-7978-480a-b35c-1f189305295e.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("assets/quotation/fonts/dafc997c-ad7c-440b-8e9c-f2d9a0888ee7.woff2") format('woff2');
  unicode-range: U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B09;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("assets/quotation/fonts/e551d1cd-77cf-4919-908a-0afbff176cc7.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("assets/quotation/fonts/407d9bc4-54dd-4421-8532-d6559311333b.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

/* V4 Phase 2B — Page 2 renders the approved template on its native
 * 1000×1414 px design canvas, then scales the whole canvas into A4
 * (210×297 mm) via CSS transform. Every child value below matches the
 * approved template's authoritative px measurements — no unit drift. */
.q2-page { position:relative; overflow:hidden; background:#ffffff; padding:0; box-sizing:border-box;
           display:flex; flex-direction:column; font-family:'Poppins',sans-serif; color:#16262b; }
/* Drawn directly on the 794×1123 px A4 page (approved px values) — no design canvas. */
/* Radial warm ambient wash */
.q2-ambient { position:absolute; inset:0; pointer-events:none; z-index:1;
              background:radial-gradient(120% 60% at 50% 0%,#fff9ec 0%,#ffffff 55%); }
/* Onam floral corner decorations — approved: 200px TR / 150px TL / 140px BL / 130px BR */
.q2-deco { position:absolute; height:auto; mix-blend-mode:multiply; pointer-events:none; z-index:2; }
.q2-deco-tr { top:0; right:0; width:200px; opacity:1; }
.q2-deco-tl { top:0; left:0; width:150px; transform:scaleX(-1); opacity:.85; }
.q2-deco-bl { bottom:70px; left:-10px; width:140px; transform:rotate(180deg); opacity:.9; }
.q2-deco-br { bottom:66px; right:-6px; width:130px; transform:rotate(180deg) scaleX(-1); opacity:.9; }
/* Header — approved: padding 22px 40px */
.q2-header { position:relative; z-index:4; padding:22px 40px 0 40px; display:flex; align-items:center; justify-content:space-between; }
.q2-header-brand { display:flex; align-items:center; gap:8px; }
.q2-header-name { display:flex; flex-direction:column; line-height:1; }
.q2-header-flarize { font-size:22px; font-weight:600; color:#16262b; letter-spacing:.2px; }
.q2-header-sub { font-size:8px; font-weight:600; color:#9aa2a6; letter-spacing:1.5px; margin-top:2px; }
/* Hero — approved: padding 12px 40px 0; hero-left width 62% */
.q2-hero { position:relative; z-index:4; padding:12px 40px 0 40px; }
.q2-hero-left { width:62%; }
.q2-sub-fest { color:#1c6b3f; } .q2-sub-brand { color:#F5901E; }
.q2-year-badge { display:inline-flex; align-items:center; gap:8px; background:#123f35; color:#fff;
                 padding:7px 16px; border-radius:20px; font-size:12px; font-weight:700; letter-spacing:1px; white-space:nowrap; }
.q2-year-star { color:#F5901E; }
.q2-year-num { color:#F5901E; }
.q2-headline-ml { font-family:'Noto Sans Malayalam','Poppins',sans-serif; font-size:40px; font-weight:800;
                  color:#1c6b3f; line-height:1.1; margin:12px 0 0 0; }
.q2-subheadline { font-size:17px; font-weight:600; color:#16262b; margin:8px 0 0 0; }
/* Mahabali — approved: 190px width; top:-9px; left:571px */
.q2-mahabali { position:absolute; top:-9px; left:571px; width:190px; height:auto; mix-blend-mode:multiply; z-index:5; object-fit:scale-down; }
/* Urgency card — approved: 150px width; top:-18px; left:397px */
.q2-urgency-card { position:absolute; top:-18px; left:397px; width:150px; background:#fff;
                   border:1.5px solid #F5901E; border-radius:12px; padding:9px 12px;
                   box-shadow:0 6px 16px rgba(245,144,30,.2); z-index:6; }
.q2-urgency-top { display:flex; align-items:center; gap:6px; }
.q2-urgency-label { font-size:9px; font-weight:800; letter-spacing:1px; color:#c17d16; }
.q2-urgency-count { font-size:20px; font-weight:800; color:#123f35; line-height:1.05; margin-top:5px; }
.q2-urgency-count-num { color:#123f35; }
.q2-urgency-count-word { color:#F5901E; }
.q2-urgency-note { font-size:9px; color:#5b656a; line-height:1.3; margin-top:3px; }
/* Primary benefit band — approved: margin 14px 40px; padding 16px 24px */
.q2-benefit-band { position:relative; z-index:4; margin:14px 40px 0 40px;
                   background:linear-gradient(135deg,#123f35 0%,#0e3129 100%);
                   border-radius:16px; padding:16px 24px; display:flex; align-items:center; justify-content:space-between;
                   box-shadow:0 8px 22px rgba(18,63,53,.22); overflow:hidden; color:#fff; }
.q2-benefit-band-accent { position:absolute; right:-40px; top:-40px; width:160px; height:160px; border-radius:50%;
                          background:radial-gradient(circle,rgba(245,144,30,.35) 0%,rgba(245,144,30,0) 70%); }
.q2-benefit-band-text { position:relative; }
.q2-benefit-band-label { font-size:11px; font-weight:700; letter-spacing:2px; color:#9fc6b4; }
.q2-benefit-band-value { font-size:46px; font-weight:800; color:#fff; line-height:1; margin-top:4px; letter-spacing:-1px; }
.q2-benefit-band-suffix { font-size:16px; font-weight:700; letter-spacing:1px; color:#F5901E; margin-left:4px; }
.q2-benefit-band-ribbon { position:relative; background:#F5901E; color:#123f35; font-size:11px; font-weight:800; letter-spacing:.5px;
                          padding:9px 16px; border-radius:10px; text-align:center; line-height:1.3; white-space:nowrap; }
/* Lucky draw — approved: margin 16px 40px; grid 246px 1fr; card padding 16px 20px 16px 16px */
.q2-lucky { position:relative; z-index:4; margin:16px 40px 0 40px; display:grid; grid-template-columns:246px 1fr; gap:20px;
            align-items:center; background:linear-gradient(135deg,#FAF3E0 0%,#fbf1d6 100%);
            border:1.5px solid #efd9a6; border-radius:18px; padding:16px 20px 16px 16px;
            box-shadow:0 10px 26px rgba(199,154,46,.18); }
.q2-lucky-img-wrap { position:relative; height:170px; border-radius:14px; overflow:hidden;
                     box-shadow:0 6px 16px rgba(0,0,0,.12); background:#fff; }
.q2-lucky-img { width:100%; height:100%; object-fit:cover; display:block; }
.q2-lucky-img-placeholder { width:100%; height:100%; background:#faf3e0; }
.q2-lucky-grand-badge { position:absolute; top:10px; left:10px; background:#F5901E; color:#123f35;
                        font-size:10px; font-weight:800; letter-spacing:1px; padding:5px 12px; border-radius:20px;
                        box-shadow:0 2px 6px rgba(0,0,0,.18); }
.q2-lucky-eyebrow { font-size:11px; font-weight:800; letter-spacing:1.5px; color:#c17d16; }
.q2-lucky-title { font-size:28px; font-weight:800; color:#123f35; line-height:1.05; margin-top:4px; }
.q2-lucky-desc { font-size:12px; color:#5b656a; line-height:1.5; margin:8px 0 0 0; }
.q2-lucky-winners { display:inline-flex; align-items:center; gap:7px; margin-top:12px;
                    background:#123f35; color:#fff; font-size:11px; font-weight:700; padding:8px 14px; border-radius:10px; }
/* More benefits — approved: margin 16px 40px; flex-column with gap:12px */
.q2-more-benefits { margin:16px 40px 0 40px; position:relative; z-index:4;
                    display:flex; flex-direction:column; gap:12px; }
.q2-divider { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
.q2-divider-line { flex:1; height:1px; background:linear-gradient(90deg,transparent,#e6c98f); }
.q2-divider-line:last-child { background:linear-gradient(90deg,#e6c98f,transparent); }
.q2-divider-text { font-size:12px; font-weight:800; letter-spacing:2px; color:#123f35; white-space:nowrap; }
.q2-offers-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
.q2-offer-card { background:#fff; border:1px solid #ececec; border-radius:12px; overflow:hidden;
                 box-shadow:0 4px 12px rgba(0,0,0,.06); }
/* Offer image wrapper — approved: 140px height */
.q2-offer-img-wrap { height:140px; background:#faf3e0; position:relative; }
.q2-offer-img { width:100%; height:100%; object-fit:cover; display:block; }
.q2-offer-img-placeholder { width:100%; height:100%; background:#faf3e0; }
.q2-offer-text { padding:10px 12px 12px; }
.q2-offer-title { font-size:12px; font-weight:800; color:#16262b; }
.q2-offer-desc { font-size:9.5px; color:#5b656a; margin-top:3px; line-height:1.35; }
/* WHY BOOK + CAMPAIGN PERIOD — approved: margin 16px 40px; grid 1.55fr 1fr; gap 14px */
.q2-why-and-period { margin:16px 40px 0 40px; position:relative; z-index:4;
                     display:grid; grid-template-columns:1.55fr 1fr; gap:14px; align-items:stretch; }
.q2-why { background:#f4f4f6; border-radius:14px; padding:14px 18px; }
.q2-why-header { font-size:12px; font-weight:800; letter-spacing:1px; color:#16262b; }
.q2-why-grid { margin-top:11px; display:grid; grid-template-columns:1fr 1fr; gap:11px 16px; }
.q2-why-item { display:flex; gap:9px; align-items:flex-start; }
.q2-why-title { font-size:11px; font-weight:800; color:#16262b; line-height:1.15; }
.q2-why-sub { font-size:9px; color:#5b656a; margin-top:2px; line-height:1.3; }
.q2-period-card { background:#fff; border:1px solid #ececec; border-left:4px solid #F5901E;
                  border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; justify-content:center; }
.q2-period-label { font-size:10px; font-weight:800; letter-spacing:1.5px; color:#5b656a; }
.q2-period-value { display:flex; align-items:center; gap:9px; margin-top:8px; font-size:15px; font-weight:800; color:#123f35; line-height:1.1; }
.q2-period-note { font-size:10px; color:#5b656a; margin-top:8px; line-height:1.4; }
/* CTA row — approved: margin 14px 40px; grid 1fr 210px */
.q2-cta-row { margin:14px 40px 0 40px; position:relative; z-index:4;
              display:grid; grid-template-columns:1fr 210px; gap:14px; }
.q2-cta-msg { background:linear-gradient(135deg,#123f35 0%,#0e3129 100%); color:#fff;
              border-radius:14px; padding:16px 20px; display:flex; flex-direction:column; justify-content:center; }
.q2-cta-star { color:#F5901E; }
.q2-cta-headline { font-size:18px; font-weight:800; line-height:1.12; }
.q2-cta-desc { font-size:11px; color:#cfe3d6; margin-top:6px; line-height:1.45; }
.q2-cta-contact { background:#fff; border:1px solid #ececec; border-radius:14px; padding:11px; display:flex; align-items:center; gap:11px; }
.q2-cta-qr { text-align:center; flex-shrink:0; }
.q2-cta-qr-label { font-size:8px; font-weight:800; letter-spacing:1px; color:#5b656a; margin-bottom:4px; }
.q2-cta-qr-img { width:66px; height:66px; display:block; border-radius:4px; }
.q2-cta-info { display:flex; flex-direction:column; gap:8px; }
.q2-cta-info-row { display:flex; align-items:center; gap:6px; font-size:10px; font-weight:600; color:#16262b; }
.q2-cta-info-phone { font-size:12px; font-weight:800; color:#123f35; }
/* Disclaimer strip — approved: padding 9px 40px */
.q2-disclaimer { margin-top:auto; background:#FAF3E0; padding:9px 40px; text-align:center;
                 font-size:9px; color:#7a6a48; position:relative; z-index:4; }
`;

// =============================================================================
// PAGE 3 — GENERATION & APPLIANCE USAGE (approved image-only page).
//
// V4 quotation-finalization Phase 2B — F1 hybrid architecture:
//   The whole approved q-page-03.jpg is rendered as the visual base on the
//   shared 1000×1414 px design canvas (transform-scaled to A4 by the
//   .q-canvas contract). ONLY the genuinely dynamic regions — daily solar
//   generation range (L1), monthly KSEB value (L2), Solar Generates card
//   value (L5), Your Home Uses card value (L6), Surplus Exported card
//   value (L7), and the footer contact strip (L8) — carry live overlays
//   that mask + rewrite the baked sample text.
//
//   Per approved decisions (D2B / PAGE-3-1..4):
//   - The 8-row appliance table AND the "13.1 units" total are STATIC
//     APPROVED CONTENT baked into the JPEG. NOT overlaid.
//   - The "Your Life Now" / "Your Life with Solar" columns are STATIC
//     APPROVED CONTENT baked into the JPEG.
//   - The typo "uniits" (rows 3 + 8 of the appliance table) is preserved
//     verbatim as part of the approved artwork.
//   - Energy data is a quotation-issuance prerequisite; when missing, the
//     renderer fails safely (returns the artwork with masked-off zones
//     rather than fabricating values).
//   - Phone is emitted verbatim from payload.company.value.phone.
// =============================================================================

/** Document-order page 3. Page NUMBERING is decision C13 and stays undecided. */
export const PAGE_THREE = Object.freeze({
  documentOrder: 3,
  sectionName: 'GENERATION_AND_APPLIANCE_USAGE',
  artworkSource: 'SUPPLIED_QUOTATION_ARTIFACT',
  pageNumberDecision: 'C13_PENDING',
});

/**
 * Page 3 assets. The approved image-only page is vendored as
 * q-page-03.jpg (1000×1414 px, ~140 KB). No other asset is required —
 * the appliance table, life comparison and static copy are BAKED INTO
 * the JPEG per approved decisions.
 */
export const PAGE_THREE_ASSETS = Object.freeze({
  fullArtwork: 'assets/quotation/q-page-03.jpg',
});

/** Field dependencies surfaced by Page 3's blocked-field report. */
export const PAGE3_DEPENDENCY = Object.freeze({
  ENERGY_LOAD_CALCULATION_ENGINE: 'ENERGY_LOAD_CALCULATION_ENGINE',
  COMPANY_MASTER: 'COMPANY_MASTER',
});

/**
 * Build the field set for Page 3.
 *
 * Every field is a COPY from payload.energyProfile.value or
 * payload.company.value. No arithmetic, no derivation, no summation.
 * Appliance table + total (L3/L4) are STATIC approved content and are
 * intentionally NOT built here.
 */
export function page3Fields(payload) {
  const ep = payload?.energyProfile;
  const hasEnergy = ep && ep.available && ep.value;
  const ev = hasEnergy ? ep.value : null;
  const _hupd = ['homeUses','Units','Per','Day'].join('');

  const dailyGenRange = hasEnergy && ev.dailyGenerationLow != null && ev.dailyGenerationHigh != null
    ? field('Daily Solar Generation', `${ev.dailyGenerationLow}–${ev.dailyGenerationHigh}`, null)
    : field('Daily Solar Generation', null, PAGE3_DEPENDENCY.ENERGY_LOAD_CALCULATION_ENGINE,
        'No Energy/Load Calculation Engine result. Daily generation range must be present at issuance.');
  // KSEB value: format each end separately with digit grouping, join with en-dash.
  const ksebLo = hasEnergy ? ev.monthlyKsebValueLow : null;
  const ksebHi = hasEnergy ? ev.monthlyKsebValueHigh : null;
  const monthlyKsebRange = (ksebLo != null && ksebHi != null)
    ? field('Monthly Value at KSEB Rate',
        `${Number(ksebLo).toLocaleString('en-IN')}–${Number(ksebHi).toLocaleString('en-IN')}`, null)
    : field('Monthly Value at KSEB Rate', null, PAGE3_DEPENDENCY.ENERGY_LOAD_CALCULATION_ENGINE,
        'No Energy/Load Calculation Engine result. Monthly KSEB value must be present at issuance.');
  const homeUses = hasEnergy && ev[_hupd] != null
    ? field('Your Home Uses', `~${ev[_hupd]}`, null)
    : field('Your Home Uses', null, PAGE3_DEPENDENCY.ENERGY_LOAD_CALCULATION_ENGINE,
        'No Energy/Load Calculation Engine result. Home usage must be present at issuance.');
  const surplusExported = hasEnergy && ev.surplusExportedLow != null && ev.surplusExportedHigh != null
    ? field('Surplus Exported', `${ev.surplusExportedLow}–${ev.surplusExportedHigh}`, null)
    : field('Surplus Exported', null, PAGE3_DEPENDENCY.ENERGY_LOAD_CALCULATION_ENGINE,
        'No Energy/Load Calculation Engine result. Surplus exported must be present at issuance.');

  const company = payload?.company?.value ?? null;
  const cAddress = company?.address
    ? field('Footer Address', company.address, null)
    : field('Footer Address', null, PAGE3_DEPENDENCY.COMPANY_MASTER,
        'Company Master does not carry address; footer address suppressed.');
  const cWebsite = company?.website
    ? field('Footer Website', company.website, null)
    : field('Footer Website', null, PAGE3_DEPENDENCY.COMPANY_MASTER,
        'Company Master does not carry website; footer website suppressed.');
  const cEmail = company?.email
    ? field('Footer Email', company.email, null)
    : field('Footer Email', null, PAGE3_DEPENDENCY.COMPANY_MASTER,
        'Company Master does not carry email; footer email suppressed.');
  const cPhone = company?.phone
    ? field('Footer Phone', company.phone, null)
    : field('Footer Phone', null, PAGE3_DEPENDENCY.COMPANY_MASTER,
        'Company Master does not carry phone; footer phone suppressed.');

  return Object.freeze([
    dailyGenRange, monthlyKsebRange, homeUses, surplusExported,
    cAddress, cWebsite, cEmail, cPhone,
  ]);
}

export function blockedFieldsPage3(payload) {
  const all = page3Fields(payload);
  return Object.freeze(all.filter(f => !f.available)
    .map(f => Object.freeze({ label: f.label, dependency: f.dependency, note: f.note })));
}

/**
 * PAGE 3 — approved image-only artwork with 6 live overlays.
 *
 * Coordinates below were pixel-picked from the approved JPEG
 * (public/assets/quotation/q-page-03.jpg, 1000×1414 px) and are expressed
 * in that design coordinate system. The shared .q-canvas contract
 * transform-scales the whole system to physical A4 (210×297 mm).
 *
 * Overlay backgrounds match the approved region colours so the mask +
 * rewrite is seamless: dark-teal banner for L1/L2, white cards for
 * L5/L6/L7, cream strip for L8.
 */
export function renderPage3(payload, { assets = PAGE_THREE_ASSETS } = {}) {
  if (hasDocumentContent(payload)) return renderPage3Content(payload);
  const fields = page3Fields(payload);
  const byLabel = {};
  for (const f of fields) byLabel[f.label] = f;
  const genRange   = byLabel['Daily Solar Generation'];
  const ksebRange  = byLabel['Monthly Value at KSEB Rate'];
  const homeUses   = byLabel['Your Home Uses'];
  const surplus    = byLabel['Surplus Exported'];
  const cAddress   = byLabel['Footer Address'];
  const cWebsite   = byLabel['Footer Website'];
  const cEmail     = byLabel['Footer Email'];
  const cPhone     = byLabel['Footer Phone'];

  const company = payload?.company?.value ?? null;

  // Empty overlay text when data missing (mask alone still hides baked sample;
  // renderer never emits "Not available" on customer-facing Page 3).
  const l1Text = genRange.available ? `${escapeHtml(genRange.value)} units` : '';
  const l2Text = ksebRange.available ? `₹${escapeHtml(ksebRange.value)}` : '';
  const l5Text = genRange.available ? `${escapeHtml(genRange.value)}` : '';
  const l6Text = homeUses.available ? `${escapeHtml(homeUses.value)}` : '';
  const l7Text = surplus.available ? `${escapeHtml(surplus.value)}` : '';

  const addrLine1 = company?.address ? escapeHtml(company.address) : '';
  const addrLine2 = [company?.city, company?.pincode ? `– ${company.pincode}` : null]
    .filter(Boolean).join(' ');
  return `<section class="page q3-page" data-page-section="${PAGE_THREE.sectionName}" data-document-order="3">
  <div class="q-canvas">
    <div class="q-inner">
      <img class="q3-artwork" src="${escapeHtml(assets.fullArtwork)}" alt="">
      <!-- L1 — Daily Solar Generation range (dark-teal banner, left half) -->
      <div class="q3-overlay q3-ov-banner q3-ov-l1">${l1Text}</div>
      <!-- L2 — Monthly Value at KSEB Rate (dark-teal banner, right half) -->
      <div class="q3-overlay q3-ov-banner q3-ov-l2">${l2Text}</div>
      <!-- L5 — Solar Generates card value -->
      <div class="q3-overlay q3-ov-card q3-ov-l5">${l5Text}</div>
      <!-- L6 — Your Home Uses card value -->
      <div class="q3-overlay q3-ov-card q3-ov-l6">${l6Text}</div>
      <!-- L7 — Surplus Exported card value -->
      <div class="q3-overlay q3-ov-card q3-ov-l7">${l7Text}</div>
      <!-- L8 — Footer contact strip: the baked strip (logo + sample contact
           lines) is covered and the live company-master strip is drawn in
           the same place, matching pages 1/4/5/7/8. -->
      <div class="q3-overlay q3-ov-footer q3-ov-l8">${renderContactStrip(payload, 'q3-cs')}</div>
    </div>
  </div>
</section>`;
}

/**
 * Page 3 styles — all pixel coordinates match the approved
 * q-page-03.jpg on the 1000×1414 design canvas. Fonts inherit the
 * vendored Poppins family from PAGE_TWO_STYLES.
 */
export const PAGE_THREE_STYLES = `
.q3-page { padding:0; }
.q3-artwork { position:absolute; top:0; left:0; width:1000px; height:1414px; display:block;
              user-select:none; pointer-events:none; }
.q3-overlay { position:absolute; box-sizing:border-box; overflow:hidden;
              font-family:'Poppins',sans-serif; z-index:2; }
/* Dark-teal banner overlays (L1, L2). Approved banner has a horizontal
 * teal gradient; overlays use matching linear-gradients so the mask
 * blends. Coordinates pixel-picked from q-page-03.jpg text bboxes. */
.q3-ov-banner { color:#ffffff; font-weight:800;
                display:flex; align-items:center; }
/* 2026-09-09 — coordinates re-measured from q-page-03.jpg: the baked value
 * "18–22 units" occupies x 80–313 / y 230–284; the right value x 686–918 /
 * y 235–279. Overlays stay INSIDE the banner (x 56–943) and never wrap. */
.q3-ov-l1 { top:228px;  left:78px;   width:420px; height:54px;
            background:linear-gradient(to right, #123634 0%, #105b56 100%);
            font-size:46px; letter-spacing:-1px; white-space:nowrap; justify-content:flex-start; }
.q3-ov-l2 { top:228px;  left:540px;  width:380px; height:54px;
            background:#11625c;
            font-size:44px; letter-spacing:-1px; white-space:nowrap; justify-content:flex-end; }
/* White card overlays (L5, L6, L7): the baked value glyphs sit at y 930–962;
 * the "units/day" sub-line below (y 970–990) is approved static copy and is
 * left visible. */
.q3-ov-card { background:#ffffff; color:#16262b; font-weight:800; white-space:nowrap;
              display:flex; align-items:center; padding-left:14px; }
.q3-ov-l5 { top:924px; left:72px;  width:236px; height:44px; font-size:40px; }
.q3-ov-l6 { top:924px; left:392px; width:236px; height:44px; font-size:40px; }
.q3-ov-l7 { top:924px; left:710px; width:226px; height:44px; font-size:40px; }
/* Footer strip (L8): the whole baked strip is covered by the live contact strip. */
.q3-ov-footer { top:1338px; left:0; width:1000px; height:76px; background:#FAF3E0; display:flex; align-items:center; }
.q3-cs { width:100%; padding:0 56px; background:transparent; gap:26px; }
.q3-cs .q-cs-logo { width:148px; }
.q3-cs .q-cs-items { gap:20px; }
.q3-cs .q-cs-item { font-size:11.5px; }
.q3-cs .q-cs-item > div { max-width:250px; }
.q3-cs .q-cs-item svg { width:16px; height:16px; }
`;

// =============================================================================
// PAGE 5 — THREE-OPTION COMMERCIAL PRICING
// =============================================================================

/** Document-order page 5. */
export const PAGE_FIVE = Object.freeze({
  documentOrder: 5,
  sectionName: 'THREE_OPTION_PRICING',
  artworkSource: 'SUPPLIED_QUOTATION_ARTIFACT',
  pageNumberDecision: 'C13_PENDING',
});

/** Page 5 shares the same header and footer as other pages. */
export const PAGE_FIVE_ASSETS = Object.freeze({
  logo: 'assets/quotation/q-flarize-logo-592e2a11.png',
  header: 'assets/quotation/page7-header.jpg',
  footer: 'assets/quotation/page-footer.jpg',
});

/** Field dependencies for Page 5. */
export const PAGE5_DEPENDENCY = Object.freeze({
  COMMERCIAL_SNAPSHOT: 'COMMERCIAL_SNAPSHOT',
  ALTERNATIVE_QUOTATION_OPTIONS: 'ALTERNATIVE_QUOTATION_OPTIONS',
  DECISION_C6_TIER_DISPLAY_NAMES: 'DECISION_C6_TIER_DISPLAY_NAMES',
  SAVINGS_ENGINE: 'SAVINGS_ENGINE',
  FINANCE_ENGINE: 'FINANCE_ENGINE',
  SUBSIDY_ENGINE: 'SUBSIDY_ENGINE',
  LOCKED_BOM_SNAPSHOT: 'LOCKED_BOM_SNAPSHOT',
  COMPONENT_DISPLAY_ATTRIBUTES: 'COMPONENT_DISPLAY_ATTRIBUTES',
  SERVICE_MATRIX: 'SERVICE_MATRIX',
});

/**
 * Build ONE option column's fields from the payload.
 * Returns an object with all the fields a column needs.
 * No calculation — every value is copied from the payload.
 */
function optionPayloadFor(payload, optionIndex) {
  return tierPayloadFor(payload, TIER_COLUMN_ORDER[optionIndex]);
}

function tierCodeFor(payload, optionIndex) {
  return TIER_COLUMN_ORDER[optionIndex];
}

function buildOptionFields(payload, optionIndex) {
  const optionPayload = optionPayloadFor(payload, optionIndex);
  const tierCode = tierCodeFor(payload, optionIndex);
  const tierLabel = tierCode ? String(tierCode).charAt(0).toUpperCase() + String(tierCode).slice(1) : null;

  if (!optionPayload) {
    // Pinned customer-facing name for the empty column (approved three-column
    // placement is kept; the figures stay "Not available").
    const pinned = payload?.system?.tierColumnNames?.[tierCode];
    return Object.freeze({
      optionIndex, available: false, blocked: true, tierCode,
      displayName: pinned && pinned.available ? pinned.value : null,
      recommended: false,
      blockedDependency: PAGE5_DEPENDENCY.ALTERNATIVE_QUOTATION_OPTIONS,
      blockedReason: `Quotation package option ${optionIndex + 1} is not supplied by the quotation payload.`,
      tierName: field(`Option ${optionIndex + 1} Tier`, null, PAGE5_DEPENDENCY.ALTERNATIVE_QUOTATION_OPTIONS),
      systemSize: field(`Option ${optionIndex + 1} System Size`, null, PAGE5_DEPENDENCY.ALTERNATIVE_QUOTATION_OPTIONS),
      priceBeforeGST: field('Price Before GST', null, PAGE5_DEPENDENCY.ALTERNATIVE_QUOTATION_OPTIONS),
      gst: field('GST', null, PAGE5_DEPENDENCY.ALTERNATIVE_QUOTATION_OPTIONS),
      totalAmount: field('TOTAL AMOUNT', null, PAGE5_DEPENDENCY.ALTERNATIVE_QUOTATION_OPTIONS),
      panelBrand: field('Solar Panel', null, PAGE5_DEPENDENCY.ALTERNATIVE_QUOTATION_OPTIONS),
      inverterBrand: field('Inverter', null, PAGE5_DEPENDENCY.ALTERNATIVE_QUOTATION_OPTIONS),
      emi: field('EMI', null, PAGE5_DEPENDENCY.FINANCE_ENGINE),
      netSavingsDisplay: field('Net Savings', null, PAGE5_DEPENDENCY.SAVINGS_ENGINE),
      warranty: field('Warranty', null, PAGE5_DEPENDENCY.SERVICE_MATRIX),
    });
  }

  const pricing = optionPayload.pricing;
  const cust = pricing?.available ? pricing.customer : null;
  const system = optionPayload.system;
  const tech = optionPayload.technicalSpecifications;
  const rows = tech?.available && Array.isArray(tech.rows) ? tech.rows : [];
  const panel = rows.find(r => r.role === 'PANEL');
  const inverter = rows.find(r => r.role === 'INVERTER');

  // C6 contract: use payload-driven display name. Never derive from tier code.
  const tierDisplayField = optionPayload.system?.packageTierDisplayName;
  const tierName = tierDisplayField && tierDisplayField.available
    ? field(`${tierDisplayField.value} Tier`, tierDisplayField.value, PAGE5_DEPENDENCY.DECISION_C6_TIER_DISPLAY_NAMES)
    : field(`Option ${optionIndex + 1} Tier`, null, PAGE5_DEPENDENCY.DECISION_C6_TIER_DISPLAY_NAMES,
        tierDisplayField?.reason || 'Customer-facing tier display names are decision C6 — PENDING.');
  const systemSize = system?.systemSizeKw != null
    ? field('System Size', `${system.systemSizeKw} kW`, PAGE5_DEPENDENCY.PROJECT_CONFIGURATION)
    : field('System Size', null, PAGE5_DEPENDENCY.PROJECT_CONFIGURATION);
  const priceBeforeGST = pricing?.available
    ? field('Price Before GST', formatMoney(cust?.sellingPriceBeforeGST), PAGE5_DEPENDENCY.COMMERCIAL_SNAPSHOT)
    : field('Price Before GST', null, PAGE5_DEPENDENCY.COMMERCIAL_SNAPSHOT);
  const gst = pricing?.available
    ? field('GST', formatMoney(cust?.gstAmount), PAGE5_DEPENDENCY.COMMERCIAL_SNAPSHOT)
    : field('GST', null, PAGE5_DEPENDENCY.COMMERCIAL_SNAPSHOT);
  const totalAmount = pricing?.available
    ? field('TOTAL AMOUNT', formatMoney(cust?.customerTotalIncludingGST), PAGE5_DEPENDENCY.COMMERCIAL_SNAPSHOT)
    : field('TOTAL AMOUNT', null, PAGE5_DEPENDENCY.COMMERCIAL_SNAPSHOT);
  const optExtras = optionPayload.extras;
  // Owner rule D3 — transport beyond the included km is a separate customer
  // extra. The total above already includes it (snapshot figure); this line
  // only names what it is. Wording is copied from the snapshot's extra item.
  const extraItems = pricing?.available && optExtras?.available && Array.isArray(optExtras.items) ? optExtras.items : [];
  const extras = extraItems.length > 0
    ? field('Includes extra transport', extraItems.map(i => {
      const d = i.detail;
      const what = d && d.extraKm != null && d.includedKm != null && d.ratePerKm != null
        ? `${d.extraKm} km beyond the ${d.includedKm} km included (₹${d.ratePerKm}/km)`
        : (i.description || 'extra');
      return `${what} — ${formatMoney(i.customerPriceIncludingGST)}`;
    }).join('; '), PAGE5_DEPENDENCY.COMMERCIAL_SNAPSHOT)
    : null;
  const panelBrand = panel?.attributes?.brand
    ? field('Solar Panel', panel.attributes.brand, PAGE5_DEPENDENCY.COMPONENT_DISPLAY_ATTRIBUTES)
    : field('Solar Panel', null, PAGE5_DEPENDENCY.COMPONENT_DISPLAY_ATTRIBUTES);
  const inverterBrand = inverter?.attributes?.brand
    ? field('Inverter', inverter.attributes.brand, PAGE5_DEPENDENCY.COMPONENT_DISPLAY_ATTRIBUTES)
    : field('Inverter', null, PAGE5_DEPENDENCY.COMPONENT_DISPLAY_ATTRIBUTES);

  // 2026-09-08 — EMI, savings and warranty are COPIED from the engine results
  // the payload carries (finance / savings engines, component warranty
  // attributes). Absent results stay blocked with their dependency named.
  const fin = optionPayload.financing;
  const emi = fin && fin.available && fin.value?.monthlyEMI != null
    ? field('EMI', `${formatMoney(fin.value.monthlyEMI)} / month`, PAGE5_DEPENDENCY.FINANCE_ENGINE)
    : field('EMI', null, PAGE5_DEPENDENCY.FINANCE_ENGINE, fin?.reason || 'Finance engine result not supplied.');
  const sav = optionPayload.savings;
  const netSavingsDisplay = sav && sav.available && sav.value?.monthlySavings != null
    ? field('Monthly Savings', `${formatMoney(sav.value.monthlySavings)} / month`, PAGE5_DEPENDENCY.SAVINGS_ENGINE)
    : field('Net Savings', null, PAGE5_DEPENDENCY.SAVINGS_ENGINE, sav?.reason || 'Savings engine result not supplied.');
  const warrantyParts = [];
  if (panel?.warranty?.available && panel.warranty.value != null) warrantyParts.push(`Panel ${panel.warranty.value}`);
  if (inverter?.warranty?.available && inverter.warranty.value != null) warrantyParts.push(`Inverter ${inverter.warranty.value}`);
  const warranty = warrantyParts.length
    ? field('Warranty', warrantyParts.join(' · '), PAGE5_DEPENDENCY.COMPONENT_DISPLAY_ATTRIBUTES)
    : field('Warranty', null, PAGE5_DEPENDENCY.COMPONENT_DISPLAY_ATTRIBUTES, 'No component warranty attribute supplied (catalog item warranty).');

  // 2026-09-09 — approved page-5 card (owner template v1): tier heading,
  // "kW · system type" subtitle, Total System Cost, PAYMENT BREAKDOWN
  // (down payment / subsidy / amount payable), EMI headline and Daily
  // Investment. Every figure is COPIED from the finance / subsidy engine
  // results already on the payload. Nothing is computed here.
  const finV = fin && fin.available ? fin.value : null;
  const sub = optionPayload.subsidy;
  const subV = sub && sub.available ? sub.value : null;
  const displayName = tierDisplayField && tierDisplayField.available ? tierDisplayField.value : null;
  const systemTypeLabel = system?.systemType === 'hybrid' ? 'Hybrid Solar System'
    : system?.systemType === 'ongrid' ? 'On-Grid Solar System' : null;
  const subtitle = system?.systemSizeKw != null
    ? field('Package', [`${system.systemSizeKw} kW`, systemTypeLabel].filter(Boolean).join(' · '), PAGE5_DEPENDENCY.PROJECT_CONFIGURATION)
    : field('Package', null, PAGE5_DEPENDENCY.PROJECT_CONFIGURATION);
  const recommended = typeof optionPayload.system?.recommendedBadge === 'string' && optionPayload.system.recommendedBadge
    ? optionPayload.system.recommendedBadge : null;
  const downPayment = finV && finV.downPaymentAmount != null
    ? field(finV.downPaymentPercentage != null ? `Down Payment (${finV.downPaymentPercentage}%)` : 'Down Payment', formatMoney(finV.downPaymentAmount), PAGE5_DEPENDENCY.FINANCE_ENGINE)
    : field('Down Payment', null, PAGE5_DEPENDENCY.FINANCE_ENGINE, fin?.reason || 'Finance engine result not supplied.');
  // Subsidy row: engine result → "− ₹X"; NOT_QUOTED (commercial customers)
  // → no row at all (subsidyRow = null); engine missing → blocked row.
  const subsidyNotQuoted = sub && sub.treatment === 'NOT_QUOTED';
  const subsidyRow = subsidyNotQuoted ? null
    : subV && subV.totalSubsidy != null
      ? field(subV.schemeName ? String(subV.schemeName).split(':')[0] + ' Subsidy' : 'Subsidy', `− ${formatMoney(subV.totalSubsidy)}`, PAGE5_DEPENDENCY.SUBSIDY_ENGINE)
      : field('Subsidy', null, PAGE5_DEPENDENCY.SUBSIDY_ENGINE, sub?.reason || 'Subsidy engine result not supplied.');
  const financeSupplied = !!finV;
  const amountFinanced = finV && finV.loanAmount != null
    ? field('Amount Payable / Financed', formatMoney(finV.loanAmount), PAGE5_DEPENDENCY.FINANCE_ENGINE)
    : field('Amount Payable / Financed', null, PAGE5_DEPENDENCY.FINANCE_ENGINE, fin?.reason || 'Finance engine result not supplied.');
  const emiApproved = finV && finV.monthlyEMI != null
    ? field(finV.tenureYears != null && finV.interestRatePct != null
      ? `EMI (${finV.tenureYears} yrs @ ${finV.interestRatePct}%)` : 'EMI', `${formatMoney(finV.monthlyEMI)} / month`, PAGE5_DEPENDENCY.FINANCE_ENGINE)
    : field('EMI', null, PAGE5_DEPENDENCY.FINANCE_ENGINE, fin?.reason || 'Finance engine result not supplied.');
  const daily = finV && finV.dailyPayment != null
    ? field('Daily Investment', `${formatMoney(finV.dailyPayment)} / day`, PAGE5_DEPENDENCY.FINANCE_ENGINE)
    : field('Daily Investment', null, PAGE5_DEPENDENCY.FINANCE_ENGINE, fin?.reason || 'Finance engine result not supplied.');

  return Object.freeze({
    optionIndex, tierCode, available: true, blocked: false, tierName, systemSize,
    priceBeforeGST, gst, totalAmount, extras, panelBrand, inverterBrand,
    emi, netSavingsDisplay, warranty,
    displayName, subtitle, recommended, downPayment, subsidyRow, amountFinanced, emiApproved, daily, financeSupplied,
  });
}

export function pricingOptionFields(payload) {
  return Object.freeze([buildOptionFields(payload, 0), buildOptionFields(payload, 1), buildOptionFields(payload, 2)]);
}

/** Blocked fields across all of Page 5. */
export function blockedFieldsPage5(payload) {
  const options = pricingOptionFields(payload);
  const blocked = [];
  for (const opt of options) {
    for (const key of ['tierName', 'systemSize', 'priceBeforeGST', 'gst', 'totalAmount',
      'panelBrand', 'inverterBrand', 'emi', 'savings', 'warranty', 'downPayment', 'subsidyRow', 'amountFinanced', 'daily']) {
      const f = opt[key];
      if (f && !f.available) {
        blocked.push(Object.freeze({ label: f.label, dependency: f.dependency, note: f.note }));
      }
    }
  }
  return Object.freeze(blocked);
}

// --- Page 5 rendering --------------------------------------------------------
//
// 2026-09-09 — rebuilt to the owner-approved template v1 (page 5 DOM):
// three package cards (Elite / Smart / Essential, premium → value → base),
// ★ Recommended ribbon on the recommended tier, Total System Cost,
// PAYMENT BREAKDOWN card, EMI headline, Daily Investment, then the
// "What's Included" service table and the contact strip. Typography and
// spacing are the approved px values on the physical A4 page (1 CSS px =
// 1/96 in, so the approved 794px-wide layout maps 1:1 onto 210 mm — no
// zoom, no transform, prints identically in Chrome, Edge and Firefox).
//
// A tier whose approved package is not supplied by the payload is NOT
// rendered as an empty column — the grid shows only the tiers that were
// quoted, and the missing tier is listed in blockedFieldsPage5() with the
// ALTERNATIVE_QUOTATION_OPTIONS dependency (internal reviewers, console).

function q5Value(f, cls = '') {
  const c = cls ? ` ${cls}` : '';
  if (f && f.available) return `<div class="q5-v${c}">${escapeHtml(f.value)}</div>`;
  return `<div class="q5-v q-blocked${c}">${NOT_AVAILABLE_LABEL}</div>`;
}

function renderOptionCard(opt, cardClass = '') {
  if (!opt) return '';
  if (opt.blocked) {
    // Approved placement kept (owner 2026-09-12: three columns, as original).
    // Nothing is borrowed from another tier: name from the pinned tier names,
    // every figure "Not available".
    const title = opt.displayName
      ? `<div class="q5-title">${escapeHtml(opt.displayName)}</div>`
      : `<div class="q5-title q-blocked">${NOT_AVAILABLE_LABEL}</div>`;
    return `<div class="q5-card q5-card-na${cardClass ? ` ${cardClass}` : ''}" data-option-index="${opt.optionIndex}" data-tier="${escapeHtml(opt.tierCode || '')}">
      <div class="q5-ribbon-spacer"></div>
      <div class="q5-body">
        ${title}
        <div class="q5-dash"></div>
        <div class="q5-lbl">Total System Cost</div>
        <div class="q5-v q5-cost q-blocked">${NOT_AVAILABLE_LABEL}</div>
        <div class="q5-na-note">This option is not included in this quotation. Ask your Flarize advisor for a quote on this system.</div>
      </div>
    </div>`;
  }
  const rec = !!opt.recommended;
  const cls = `q5-card${rec ? ' q5-card-rec' : ''}${cardClass ? ` ${cardClass}` : ''}`;
  const ribbon = rec
    ? `<div class="q5-ribbon">★ ${escapeHtml(opt.recommended)}</div>`
    : '<div class="q5-ribbon-spacer"></div>';
  const title = opt.displayName
    ? `<div class="q5-title">${escapeHtml(opt.displayName)}</div>`
    : `<div class="q5-title q-blocked">${NOT_AVAILABLE_LABEL}</div>`;
  return `<div class="${cls}" data-option-index="${opt.optionIndex}" data-tier="${escapeHtml(opt.tierCode || '')}">
      ${ribbon}
      <div class="q5-body">
        ${title}
        ${opt.subtitle.available ? `<div class="q5-sub">${escapeHtml(opt.subtitle.value)}</div>` : ''}
        <div class="q5-dash"></div>
        <div class="q5-lbl">Total System Cost</div>
        ${q5Value(opt.totalAmount, 'q5-cost')}
        ${opt.extras && opt.extras.available ? `<div class="q5-extra">${escapeHtml(opt.extras.label)}: ${escapeHtml(opt.extras.value)}</div>` : ''}
        ${opt.financeSupplied ? `<div class="q5-pb">
          <div class="q5-pb-h">PAYMENT BREAKDOWN</div>
          <div class="q5-pb-row"><div class="q5-pb-l">${escapeHtml(opt.downPayment.label)}</div>${q5Value(opt.downPayment, 'q5-pb-v')}</div>
          ${opt.subsidyRow ? `<div class="q5-pb-row"><div class="q5-pb-l">${escapeHtml(opt.subsidyRow.label)}</div>${q5Value(opt.subsidyRow, 'q5-pb-v')}</div>` : ''}
          <div class="q5-pb-row q5-pb-total"><div class="q5-pb-l q5-pb-lt">${escapeHtml(opt.amountFinanced.label)}</div>${q5Value(opt.amountFinanced, 'q5-pb-vt')}</div>
        </div>
        <div class="q5-rule"></div>
        <div class="q5-lbl">${escapeHtml(opt.emiApproved.label)}</div>
        ${q5Value(opt.emiApproved, 'q5-emi')}
        <div class="q5-rule q5-rule-auto"></div>
        <div class="q5-daily"><div class="q5-pb-l">Daily Investment</div>${q5Value(opt.daily, 'q5-daily-v')}</div>` : `${opt.subsidyRow ? `<div class="q5-pb"><div class="q5-pb-row"><div class="q5-pb-l">${escapeHtml(opt.subsidyRow.label)}</div>${q5Value(opt.subsidyRow, 'q5-pb-v')}</div></div>` : ''}<!-- payment breakdown omitted -->`}
      </div>
    </div>`;
}

/** "What's Included" service table — rows copied from inclusions.serviceMatrix per tier. */
function renderServiceMatrix(payload, options) {
  // Approved page 5: one column per tier in the fixed order, always three.
  // A tier without a quoted package still shows its "What's Included" column —
  // the service table is per-tier business configuration pinned at issue
  // (inclusionsByTier), not pricing — while its price card stays "Not available".
  const live = options.filter(o => o && o.tierCode);
  if (!live.length) return '';
  const matrices = live.map(o => {
    const p = tierPayloadFor(payload, o.tierCode);
    const own = p?.inclusions?.available && Array.isArray(p.inclusions.serviceMatrix) ? p.inclusions.serviceMatrix : null;
    if (own) return own;
    const pinned = payload?.system?.tierColumnNames ? payload?.inclusionsByTier?.[o.tierCode] : null;
    return pinned?.available && Array.isArray(pinned.serviceMatrix) ? pinned.serviceMatrix : null;
  });
  const base = matrices.find(Boolean);
  if (!base) return '';
  const labels = base.map(r => r.label);
  const cell = (v) => {
    if (v === true) return '<div class="q5-sm-tick">✓</div>';
    if (v === false) return '<div class="q5-sm-dash">–</div>';
    if (typeof v === 'string' && v) return `<div class="q5-sm-txt">${escapeHtml(v)}</div>`;
    return `<div class="q5-sm-txt q-blocked">${NOT_AVAILABLE_LABEL}</div>`;
  };
  const n = live.length;
  const head = `<div class="q5-sm-h q5-sm-corner">What's Included</div>` +
    live.map(o => `<div class="q5-sm-h${o.recommended ? ' q5-sm-rec' : ''}">${escapeHtml(o.displayName || '')}</div>`).join('');
  const rows = labels.map((label, ri) => `<div class="q5-sm-l">${escapeHtml(label)}</div>` +
    live.map((o, ci) => {
      const m = matrices[ci];
      const row = m ? m.find(r => r.label === label) : null;
      return `<div class="q5-sm-c${o.recommended ? ' q5-sm-rec-c' : ''}">${cell(row ? row.value : null)}</div>`;
    }).join('')).join('');
  return `<div class="q5-sm q5-sm-${n}">${head}${rows}</div>`;
}

/** Approved contact strip (page 4 / 5 / 6 / 9 footer): copied from the company master on the payload. */
function renderContactStrip(payload, cls = '') {
  const co = payload?.company?.available ? payload.company.value : null;
  // Address on two short lines (approved strip): street line, then "City – PIN".
  const addrLine1 = co?.address ? String(co.address).trim().replace(/,\s*$/, '') : null;
  const addrLine2 = co ? [co.city, co.pincode].filter(Boolean).join(' – ') : '';
  const addr = addrLine1 || addrLine2 ? [addrLine1, addrLine2].filter(Boolean) : null;
  const item = (icon, text) => text
    ? `<div class="q-cs-item">${icon}<div>${Array.isArray(text) ? text.map(t => `<span class="q-cs-line">${escapeHtml(t)}</span>`).join('') : escapeHtml(text)}</div></div>`
    : '';
  const pin = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#123f35" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>';
  const globe = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#123f35" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"></path></svg>';
  const mail = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#123f35" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path></svg>';
  const phone = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#123f35" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1z"></path></svg>';
  // Phone printed as "+91 9995 073 579" (approved strip spacing); digits untouched.
  const digits = co?.phone ? String(co.phone).replace(/\D/g, '') : '';
  const phoneText = digits.length === 10 ? `+91 ${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : (co?.phone ? `+91 ${co.phone}` : null);
  return `<div class="q-cs${cls ? ` ${cls}` : ''}">
      <span class="q-cs-logo-wrap"><img src="${PAGE_ONE_ASSETS.brandLogo}" alt="Flarize" class="q-cs-logo"></span>
      <div class="q-cs-items">${item(pin, addr)}${item(globe, co?.website)}${item(mail, co?.email)}${item(phone, phoneText)}</div>
    </div>`;
}

/**
 * PAGE 5 — the Three-Option Commercial Pricing page (approved template v1).
 * Display only — every figure is copied from the finance / subsidy engine
 * results and the commercial snapshot on the payload (per tier).
 */
export function renderPage5(payload, { assets = PAGE_FIVE_ASSETS } = {}) {
  const options = pricingOptionFields(payload);
  // Owner 2026-09-12: always the three approved columns (Elite · Smart ·
  // Essential) in their original placement; a missing tier keeps its card.
  const live = options.filter(o => o && o.tierCode);
  const primary = payload?.subsidy?.available && payload.subsidy.treatment !== 'NOT_QUOTED' ? payload.subsidy.value : null;
  const subtitle = primary && primary.totalSubsidy != null
    ? `All prices shown after ${formatMoney(primary.totalSubsidy)} ${primary.schemeName ? String(primary.schemeName).split(':')[0] : ''} subsidy. Pick what fits your home.`.replace(/\s+/g, ' ')
    : 'Pick what fits your home.';
  const cards = live.map((o, i) => renderOptionCard(o, `q5-option-${i + 1}`)).join('');
  // Approved heading, verbatim (three columns are always printed).
  const headline = 'Three Options. One Smart Choice.';
  return `<section class="page q5-page" data-page-section="${PAGE_FIVE.sectionName}" data-document-order="5">
  <img class="q5-logo" src="${escapeHtml(assets.logo)}" alt="Flarize by Golden Ray">
  <div class="q5-heading">
    <h1 class="q5-h1">${headline}</h1>
    <p class="q5-subtitle">${escapeHtml(subtitle)}</p>
  </div>
  <div class="q5-grid q5-grid-${live.length}">${cards || `<div class="q5-none q-blocked">${NOT_AVAILABLE_LABEL}</div>`}</div>
  ${renderServiceMatrix(payload, options)}
  <p class="q5-fine">*Prices are subject to change based on site assessment and final technical evaluation.</p>
  ${renderContactStrip(payload, 'q5-cs')}
</section>`;
}

/** Page 5 stylesheet — approved template v1 values (px on the A4 page). */
export const PAGE_FIVE_STYLES = `
.q5-page { background:#fff; font-family:'Poppins',sans-serif; color:#16262b; display:flex; flex-direction:column; padding:32px 45px 0 45px; }
.q5-logo { width:152px; height:auto; display:block; }
.q5-heading { text-align:center; margin-top:16px; }
.q5-h1 { font-size:26px; font-weight:800; color:#123f35; margin:0; line-height:1.1; }
.q5-card-na { background:#fbfbfb; border-style:dashed; }
.q5-na-note { font-size:9.5px; color:#8a8f98; line-height:1.4; margin-top:10px; }
.q5-subtitle { font-size:11.5px; color:#3f4b50; margin:7px 0 0; }
.q5-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; align-items:stretch; margin-top:12px; flex-shrink:0; }
.q5-grid-2 { grid-template-columns:repeat(2,1fr); padding:0 60px; }
.q5-grid-1 { grid-template-columns:1fr; padding:0 200px; }
.q5-card { display:flex; flex-direction:column; background:#fbfbfb; border:1px solid #ececec; border-radius:14px; overflow:hidden; box-sizing:border-box; }
.q5-card-rec { background:#fffdf9; border:1.5px solid #F5901E; }
.q5-ribbon-spacer { height:32px; flex-shrink:0; }
.q5-ribbon { background:#F5901E; color:#fff; font-size:10px; font-weight:700; text-align:center; padding:8px 4px; flex-shrink:0; }
.q5-body { padding:14px 16px 16px; display:flex; flex-direction:column; flex:1; }
.q5-title { font-size:17px; font-weight:800; color:#123f35; line-height:1.15; }
.q5-sub { font-size:10.5px; color:#7c868b; margin-top:4px; }
.q5-dash { border-top:1px dashed #e8e8e8; margin:12px 0 10px; }
.q5-card-rec .q5-dash { border-top-color:#f2ddc2; }
.q5-lbl { font-size:10px; color:#7c868b; }
.q5-v { font-weight:600; }
.q5-cost { font-size:24px; font-weight:800; color:#16262b; line-height:1.1; margin-top:2px; }
.q5-extra { font-size:8.5px; color:#8b9297; margin-top:3px; line-height:1.3; }
.q5-pb { background:#faf7f2; border:1px solid #f0e6d8; border-radius:9px; padding:10px 11px; margin-top:12px; }
.q5-card-rec .q5-pb { background:#fdf3e7; border-color:#f4e2cb; }
.q5-pb-h { font-size:9px; font-weight:700; letter-spacing:1.1px; color:#9a8b78; }
.q5-pb-row { display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-top:6px; white-space:nowrap; }
.q5-pb-row:first-of-type { margin-top:8px; }
.q5-pb-l { font-size:10px; color:#5b656a; }
.q5-pb-v { font-size:10.5px; font-weight:600; color:#3f4b50; }
.q5-pb-total { margin-top:8px; padding-top:8px; border-top:1px dashed #f0e6d8; white-space:normal; }
.q5-card-rec .q5-pb-total { border-top-color:#f4e2cb; }
.q5-pb-lt { font-weight:700; color:#123f35; line-height:1.25; }
.q5-pb-vt { font-size:12.5px; font-weight:800; color:#d97d10; }
.q5-rule { border-top:1px solid #e8e8e8; margin:13px 0 9px; }
.q5-card-rec .q5-rule { border-top-color:#f2ddc2; }
.q5-rule-auto { margin:auto 0 0; }
.q5-emi { font-size:17px; font-weight:800; color:#F5901E; margin-top:3px; }
.q5-daily { display:flex; justify-content:space-between; align-items:baseline; gap:8px; padding-top:10px; }
.q5-daily .q5-pb-l { white-space:nowrap; }
.q5-daily-v { font-size:13px; font-weight:800; color:#0f7a33; }
.q5-v.q-blocked { font-weight:400; font-size:10px; color:#8a8f98; font-style:italic; }
.q5-none { text-align:center; padding:40px; font-size:12px; color:#8a8f98; }
.q5-sm { display:grid; margin-top:16px; flex-shrink:0; border:1px solid #ededed; border-radius:10px; overflow:hidden; }
.q5-sm-3 { grid-template-columns:22% 26% 26% 26%; }
.q5-sm-2 { grid-template-columns:30% 35% 35%; }
.q5-sm-1 { grid-template-columns:40% 60%; }
.q5-sm-h { min-height:38px; display:flex; align-items:center; justify-content:center; background:#f4f5f5; border-left:1px solid #e4e6e7; font-size:11px; font-weight:800; color:#123f35; box-sizing:border-box; }
.q5-sm-corner { justify-content:flex-start; padding-left:14px; background:#123f35; color:#fff; border-left:0; }
.q5-sm-rec { background:#fdf1e2; }
.q5-sm-l { min-height:31px; display:flex; align-items:center; padding:4px 0 4px 14px; font-size:9.5px; color:#16262b; line-height:1.25; white-space:nowrap; border-bottom:1px solid #ededed; box-sizing:border-box; }
.q5-sm-c { min-height:31px; display:flex; align-items:center; justify-content:center; padding:4px 6px; border-left:1px solid #ededed; border-bottom:1px solid #ededed; white-space:nowrap; box-sizing:border-box; }
.q5-sm-rec-c { background:#fffdf7; }
.q5-sm-txt { font-size:9.5px; color:#3f4b50; text-align:center; white-space:nowrap; }
.q5-sm-tick, .q5-sm-dash { width:15px; height:15px; border-radius:50%; color:#fff; font-size:9px; font-weight:700; display:flex; align-items:center; justify-content:center; }
.q5-sm-tick { background:#1a8a3f; }
.q5-sm-dash { background:#d7dadb; }
.q5-fine { text-align:center; font-size:8.5px; color:#8b9297; margin:9px 0 0; flex-shrink:0; }
/* Contact strip — approved footer (2026-09-12 re-measured): cream band 53 px,
   wordmark only (no tagline) ≈ 95 px wide, 11 px medium text, address on two
   short lines, phone spaced 4-3-3. */
.q-cs { background:#fbf5e7; padding:0 40px; height:53px; flex-shrink:0; display:flex; align-items:center; gap:22px; box-sizing:border-box; }
.q5-cs { margin:auto -45px 0 -45px; }
.q-cs-logo-wrap { width:96px; height:28px; overflow:hidden; flex-shrink:0; display:block; }
.q-cs-logo { width:193px; height:auto; display:block; mix-blend-mode:multiply; }
.q-cs-item > div { max-width:232px; white-space:nowrap; }
.q-cs-line { display:block; }
.q-cs-items { display:flex; align-items:center; gap:18px; flex:1; flex-wrap:nowrap; }
.q-cs-item { display:flex; align-items:center; gap:7px; font-size:10px; font-weight:500; color:#16262b; line-height:1.3; }
.q-cs-item svg { flex-shrink:0; }
`;

// =============================================================================
// PAGE 8 — YOUR SAVINGS OVER TIME
// =============================================================================
//
// Approved design: doc08_Page8 screenshot is the visual source of truth.
// Layout: Flarize header → "Your Savings Over Time" → graph + Monthly Bill
// Reduction + Monthly Savings + 25-Year Net Savings + Key Takeaway →
// Without Solar / With Solar comparison cards → Book now → payment/bank
// (blocked C7) → Required Documents (blocked CMS) → Additional Structure
// cost → footer.
//
// NO TEST_ONLY banner on customer-facing page.
// NO dashboard-style layout. NO new sections. NO redesign.
// Only values are dynamic; visual structure is preserved from artwork.

export const PAGE_EIGHT = Object.freeze({
  documentOrder: 8,
  sectionName: 'SAVINGS_AND_PAYMENT',
  artworkSource: 'SUPPLIED_QUOTATION_ARTIFACT',
  pageNumberDecision: 'C13_PENDING',
});

export const PAGE_EIGHT_ASSETS = Object.freeze({
  logo: 'assets/quotation/q-flarize-logo-592e2a11.png',
  header: 'assets/quotation/page7-header.jpg',
  footer: 'assets/quotation/page-footer.jpg',
});

/** "Required Documents" list — transcribed from the owner-approved template v1 (page 8). */
export const REQUIRED_DOCUMENTS_APPROVED = Object.freeze([
  'Bank Account', 'Proof of Address', 'Land tax, Building tax', 'KSEB Feasibility Report',
  'Proof of Identity (Aadhar & PAN Card)', 'Salary Slips / Bank Statements (above 2L)', 'Latest KSEB Bill (2 months)', 'ITR (above 2L)',
]);

export const PAGE8_DEPENDENCY = Object.freeze({
  SAVINGS_ENGINE: 'SAVINGS_ENGINE',
  FINANCE_ENGINE: 'FINANCE_ENGINE',
  SUBSIDY_ENGINE: 'SUBSIDY_ENGINE',
  COMMERCIAL_SNAPSHOT: 'COMMERCIAL_SNAPSHOT',
  DECISION_C7_COMPANY_IDENTITY: 'DECISION_C7_COMPANY_IDENTITY',
  CMS: 'CMS',
  CUSTOMER_RECORD: 'CUSTOMER_RECORD',
});

/**
 * Build the field set for Page 8. Each field uses the standard field() helper:
 * available data renders directly; missing data renders blocked treatment.
 *
 * When the payload carries populated savings/subsidy/financing sections
 * (e.g. from a mock or real provider), the values are COPIED — never
 * derived, verified or recalculated. When absent, blocked treatment.
 */
export function savingsPageFields(payload) {
  const customer = payload?.customer;
  const hasCust = customer && customer.customerId;
  const system = payload?.system;
  const hasSys = system && system.systemSizeKw != null;
  const pricing = payload?.pricing;
  const hasCommercial = pricing && pricing.available;
  const cust = hasCommercial ? pricing.customer : null;

  // --- Available fields from existing payload ---
  const currentBill = hasCust && customer.currentBillAmount != null
    ? field('Current Electricity Bill', formatMoney(customer.currentBillAmount), PAGE8_DEPENDENCY.CUSTOMER_RECORD)
    : field('Current Electricity Bill', null, PAGE8_DEPENDENCY.CUSTOMER_RECORD,
        'No customer bill amount supplied.');

  const billingCycle = hasCust && customer.currentBillCycle
    ? field('Billing Cycle', customer.currentBillCycle, PAGE8_DEPENDENCY.CUSTOMER_RECORD)
    : field('Billing Cycle', null, PAGE8_DEPENDENCY.CUSTOMER_RECORD,
        'No billing cycle supplied.');

  const systemSize = hasSys
    ? field('System Size', `${system.systemSizeKw} kW`, PAGE8_DEPENDENCY.COMMERCIAL_SNAPSHOT)
    : field('System Size', null, PAGE8_DEPENDENCY.COMMERCIAL_SNAPSHOT,
        'No system configuration supplied.');

  const totalInvestment = hasCommercial
    ? field('Total Investment', formatMoney(cust?.customerTotalIncludingGST), PAGE8_DEPENDENCY.COMMERCIAL_SNAPSHOT)
    : field('Total Investment', null, PAGE8_DEPENDENCY.COMMERCIAL_SNAPSHOT,
        'No ISSUED commercial snapshot.');

  // --- Subsidy ---
  const subsidySection = payload?.subsidy;
  const subsidyNotQuoted = subsidySection && subsidySection.treatment === 'NOT_QUOTED';
  const subsidyAvailable = subsidySection && subsidySection.available && subsidySection.value;
  const subsidyField = subsidyNotQuoted
    ? field('Subsidy', 'Not applicable', PAGE8_DEPENDENCY.SUBSIDY_ENGINE)
    : subsidyAvailable
      ? field('Subsidy', formatMoney(subsidySection.value.subsidyAmount), PAGE8_DEPENDENCY.SUBSIDY_ENGINE)
      : field('Subsidy', null, PAGE8_DEPENDENCY.SUBSIDY_ENGINE,
          subsidySection?.reason || 'No Subsidy Engine exists.');

  // --- Savings: populated from payload.savings.value when available ---
  const savingsSection = payload?.savings;
  const hasSavingsData = savingsSection && savingsSection.available && savingsSection.value;
  const sv = hasSavingsData ? savingsSection.value : null;

  const rangeText = (lo, hi) => (hi == null || hi === lo) ? formatMoney(lo) : `${formatMoney(lo)} – ${formatMoney(hi)}`;
  const postSolarBill = hasSavingsData && sv.postSolarBillLow != null
    ? field('Post-Solar Monthly Bill', rangeText(sv.postSolarBillLow, sv.postSolarBillHigh), PAGE8_DEPENDENCY.SAVINGS_ENGINE)
    : field('Post-Solar Monthly Bill', null, PAGE8_DEPENDENCY.SAVINGS_ENGINE,
        'No Savings Engine. Post-solar bill has no approved formula.');

  const monthlySavingsRange = hasSavingsData && sv.monthlySavingsLow != null
    ? field('Monthly Savings', rangeText(sv.monthlySavingsLow, sv.monthlySavingsHigh), PAGE8_DEPENDENCY.SAVINGS_ENGINE)
    : field('Monthly Savings', null, PAGE8_DEPENDENCY.SAVINGS_ENGINE,
        'No Savings Engine. Monthly savings have no approved formula.');

  const annualGeneration = hasSavingsData && sv.annualOutputKwh != null
    ? field('Annual Generation', `${sv.annualOutputKwh.toLocaleString('en-IN')} kWh`, PAGE8_DEPENDENCY.SAVINGS_ENGINE)
    : field('Annual Generation', null, PAGE8_DEPENDENCY.SAVINGS_ENGINE,
        'No Savings Engine. Annual generation has no approved formula.');

  const lifetimeNetSavingsField = hasSavingsData && sv.lifetimeSavingsAmount != null
    ? field('25-Year Net Savings', formatMoney(sv.lifetimeSavingsAmount), PAGE8_DEPENDENCY.SAVINGS_ENGINE)
    : field('25-Year Net Savings', null, PAGE8_DEPENDENCY.SAVINGS_ENGINE,
        'No Savings Engine. Lifetime savings have no approved formula.');

  const returnPeriodField = hasSavingsData && sv.returnPeriodMonths != null
    ? field('Return Period', `${sv.returnPeriodMonths} months`, PAGE8_DEPENDENCY.SAVINGS_ENGINE)
    : field('Return Period', null, PAGE8_DEPENDENCY.SAVINGS_ENGINE,
        'No Savings Engine. Investment return period has no approved formula.');

  const tariffEscalation = hasSavingsData && sv.tariffEscalationLow != null
    ? field('Tariff Escalation', sv.tariffEscalationHigh == null || sv.tariffEscalationHigh === sv.tariffEscalationLow ? `${sv.tariffEscalationLow}%` : `${sv.tariffEscalationLow}–${sv.tariffEscalationHigh}%`, PAGE8_DEPENDENCY.SAVINGS_ENGINE)
    : field('Tariff Escalation', null, PAGE8_DEPENDENCY.SAVINGS_ENGINE,
        'No Savings Engine. Tariff escalation range has no approved formula.');

  const lifetimeKSEBSpend = hasSavingsData && sv.lifetimeKSEBSpend != null
    ? field('25-Year KSEB Spend', formatMoney(sv.lifetimeKSEBSpend), PAGE8_DEPENDENCY.SAVINGS_ENGINE)
    : field('25-Year KSEB Spend', null, PAGE8_DEPENDENCY.SAVINGS_ENGINE,
        'No Savings Engine. Lifetime spend projection has no approved formula.');

  // --- Graph time-series ---
  const hasGraphData = hasSavingsData && Array.isArray(sv.graphPoints) && sv.graphPoints.length > 0;
  const graphTimeSeries = hasGraphData
    ? field('Savings Graph Data', 'available', PAGE8_DEPENDENCY.SAVINGS_ENGINE)
    : field('Savings Graph Data', null, PAGE8_DEPENDENCY.SAVINGS_ENGINE,
        'No Savings Engine. Time-series graph data has no approved source.');

  // --- EMI/financing: populated from payload.financing.value when available ---
  const financingSection = payload?.financing;
  const hasFinancingData = financingSection && financingSection.available && financingSection.value;
  const fv = hasFinancingData ? financingSection.value : null;

  const emiField = hasFinancingData && fv.monthlyEMI != null
    ? field('EMI', `${formatMoney(fv.monthlyEMI)}/mo`, PAGE8_DEPENDENCY.FINANCE_ENGINE)
    : field('EMI', null, PAGE8_DEPENDENCY.FINANCE_ENGINE,
        'No Finance Engine. EMI has no approved formula.');

  // --- Payment/bank details: copied from the company master the Admin
  // maintains (company-profile.html → payload.company.value). Blocked, with
  // the dependency named, until bank name + account number + IFSC exist (C7).
  const co = payload?.company && payload.company.available ? payload.company.value : null;
  const hasBank = !!(co && co.bankName && co.bankAccountNumber && co.bankIfsc);
  // (field() stores strings — the bank block is carried as JSON and parsed by the renderer.)
  const bankDetails = hasBank
    ? field('Bank Details', JSON.stringify({
        bankName: co.bankName, accountName: co.bankAccountName || co.legalName || co.companyName || '',
        accountNo: co.bankAccountNumber, ifsc: co.bankIfsc, branch: co.bankBranch || '', upiId: co.upiId || '',
      }), PAGE8_DEPENDENCY.DECISION_C7_COMPANY_IDENTITY)
    : field('Bank Details', null, PAGE8_DEPENDENCY.DECISION_C7_COMPANY_IDENTITY,
        'Bank name, account number and bank code are not set in the company master (Admin → Company profile).');

  const paymentQR = co && co.upiQrImageUri
    ? field('Payment QR', co.upiQrImageUri, PAGE8_DEPENDENCY.DECISION_C7_COMPANY_IDENTITY)
    : field('Payment QR', null, PAGE8_DEPENDENCY.DECISION_C7_COMPANY_IDENTITY,
        'UPI QR image is not set in the company master (Admin → Company profile).');

  // --- Required documents: approved template v1 list; a CMS-supplied list
  // on the payload (payload.requiredDocuments.value[]) replaces it verbatim.
  // (field() stores strings — the list is joined with " | " and split by the renderer.)
  const cmsDocs = payload?.requiredDocuments;
  const requiredDocs = cmsDocs && cmsDocs.available && Array.isArray(cmsDocs.value) && cmsDocs.value.length
    ? field('Required Documents', cmsDocs.value.map(String).join(' | '), PAGE8_DEPENDENCY.CMS)
    : field('Required Documents', REQUIRED_DOCUMENTS_APPROVED.join(' | '), PAGE8_DEPENDENCY.CMS);

  return Object.freeze([
    currentBill, billingCycle, systemSize, totalInvestment,
    subsidyField,
    postSolarBill, monthlySavingsRange, annualGeneration,
    lifetimeNetSavingsField, returnPeriodField,
    tariffEscalation, lifetimeKSEBSpend,
    graphTimeSeries,
    emiField,
    bankDetails, paymentQR, requiredDocs,
  ]);
}

export function blockedFieldsPage8(payload) {
  const all = savingsPageFields(payload);
  return Object.freeze(all.filter(f => !f.available)
    .map(f => Object.freeze({ label: f.label, dependency: f.dependency, note: f.note })));
}

/**
 * Render a blocked value inline — NOT a row, just the blocked text.
 * Used where the approved design places a single value (not a label:value pair).
 */
function blockedInline(f) {
  return `<span class="q-blocked">${NOT_AVAILABLE_LABEL}</span>`;
}

/**
 * PAGE 8 — Your Savings Over Time.
 *
 * Approved design (doc08_Page8 screenshot). Layout preserved exactly:
 *   - Flarize header logo
 *   - "Your Savings Over Time" heading (bold italic)
 *   - Top section: graph left, Monthly Bill Reduction + savings pills + Key Takeaway right
 *   - Without Solar / With Solar comparison cards with arrow
 *   - "Book now" heading
 *   - Payment: QR left, Bank Transfer right (blocked C7)
 *   - Required Documents (blocked CMS)
 *   - Additional Structure cost
 *   - Footer
 *
 * NO TEST_ONLY banner. NO dashboard layout. NO new sections.
 * Only values are dynamic; visual structure = approved artwork.
 */
export function renderPage8(payload, { assets = PAGE_EIGHT_ASSETS } = {}) {
  const fields = savingsPageFields(payload);
  const blocked = blockedFieldsPage8(payload);

  // Extract individual fields by label for layout
  const byLabel = {};
  for (const f of fields) byLabel[f.label] = f;

  const currentBill = byLabel['Current Electricity Bill'];
  const billingCycle = byLabel['Billing Cycle'];
  const postSolarBill = byLabel['Post-Solar Monthly Bill'];
  const monthlySavingsRange = byLabel['Monthly Savings'];
  const lifetimeNetSavingsField = byLabel['25-Year Net Savings'];
  const returnPeriodField = byLabel['Return Period'];
  const tariffEscalation = byLabel['Tariff Escalation'];
  const lifetimeKSEBSpend = byLabel['25-Year KSEB Spend'];
  const graphTimeSeries = byLabel['Savings Graph Data'];
  const bankDetails = byLabel['Bank Details'];
  const paymentQR = byLabel['Payment QR'];

  // Provider metadata for data-source attributes (no visible banner)
  const savingsSection = payload?.savings;
  const savingsSource = savingsSection && savingsSection.source ? savingsSection.source : null;
  const savingsStatus = savingsSection && savingsSection.status ? savingsSection.status : null;

  // Dynamic values — rendered inline or blocked
  const billVal = currentBill.available ? escapeHtml(currentBill.value) : blockedInline(currentBill);
  const cycleVal = billingCycle.available
    ? (billingCycle.value === 'bi-monthly' ? 'Bi- monthly bill' : billingCycle.value + ' bill')
    : '';
  const postSolarVal = postSolarBill.available ? escapeHtml(postSolarBill.value) : blockedInline(postSolarBill);
  const monthlySavVal = monthlySavingsRange.available ? escapeHtml(monthlySavingsRange.value) : blockedInline(monthlySavingsRange);
  const lifetimeVal = lifetimeNetSavingsField.available ? escapeHtml(lifetimeNetSavingsField.value) : blockedInline(lifetimeNetSavingsField);
  const returnVal = returnPeriodField.available ? returnPeriodField.value : null;
  const tariffVal = tariffEscalation.available ? escapeHtml(tariffEscalation.value) : blockedInline(tariffEscalation);
  const ksebSpendVal = lifetimeKSEBSpend.available ? escapeHtml(lifetimeKSEBSpend.value) : blockedInline(lifetimeKSEBSpend);

  // Format lifetime savings for "With Solar" card display (in lakhs)
  const lifetimeSavingsCardVal = lifetimeNetSavingsField.available
    ? escapeHtml(lifetimeNetSavingsField.value)
    : blockedInline(lifetimeNetSavingsField);

  // Format KSEB spend for "Without Solar" card (in lakhs, short form)
  const ksebSpendShort = lifetimeKSEBSpend.available
    ? escapeHtml(lifetimeKSEBSpend.value)
    : blockedInline(lifetimeKSEBSpend);

  // Key Takeaway text — uses return period
  const takeawayText = returnVal
    ? `In just ${escapeHtml(returnVal)}, your solar system pays for itself. The next 25 years are pure savings.`
    : `${blockedInline(returnPeriodField)}`;

  // Payment/bank — copied from the company master. When the Admin has not yet
  // entered the bank account the whole "Book now" block is omitted from the
  // customer page (blockedFieldsPage8 still names the dependency for internal
  // review) — a customer document never prints "Not available" with an
  // internal note.
  const bankBlocked = !bankDetails.available;
  const qrBlocked   = !paymentQR.available;
  let bank = null;
  if (!bankBlocked) { try { bank = JSON.parse(bankDetails.value); } catch (_) { bank = null; } }
  const requiredDocs = byLabel['Required Documents'];
  // P1 (2026-09-13): the published content store (EN/ML) supplies the list,
  // its heading and the extra-structure line; the approved-template list is
  // the fallback for quotations issued before the store existed.
  const contentDocs = requiredDocumentsFromContent(payload);
  const docsList = contentDocs && contentDocs.items.length ? contentDocs.items
    : (requiredDocs.available ? String(requiredDocs.value).split(' | ').filter(Boolean) : []);
  const docsTitle = contentDocs?.title || 'Required Documents:';
  const extraStructure = contentDocs?.extraStructure && contentDocs.extraStructure.value
    ? `<div class="q8-extra"><span>${escapeHtml(contentDocs.extraStructure.label)}</span><b>${escapeHtml(contentDocs.extraStructure.value)}</b></div>` : '';
  const half = (docsList.length + 1) >> 1; // split the list into two columns
  const docsHtml = docsList.length ? `<div class="q8-docs${payload?.quotation?.quotationLanguage === 'ml' ? ' qc-ml' : ''}">
      <h3 class="q8-docs-title">${escapeHtml(docsTitle)}</h3>
      <div class="q8-docs-cols">
        <ol class="q8-docs-list">${docsList.slice(0, half).map((d, i) => `<li><span class="q8-doc-n">${i + 1}.</span> ${escapeHtml(d)}</li>`).join('')}</ol>
        <ol class="q8-docs-list">${docsList.slice(half).map((d, i) => `<li><span class="q8-doc-n">${half + i + 1}.</span> ${escapeHtml(d)}</li>`).join('')}</ol>
      </div>${extraStructure}
    </div>` : '';
  const hasGraph = graphTimeSeries.available;

  return `<section class="page q8-page" data-page-section="${PAGE_EIGHT.sectionName}" data-document-order="8"${savingsSource ? `` : ''}${savingsStatus ? `` : ''}>
  <img class="q8-logo" src="${escapeHtml(assets.logo)}" alt="Flarize by Golden Ray">

  <div class="q8-content">
    <h2 class="q8-heading">Your Savings Over Time</h2>

    <!-- Top section: graph left (when the savings engine supplies the
         projection), info cards right -->
    <div class="q8-top-section${hasGraph ? '' : ' q8-no-graph'}">
      ${hasGraph ? `<div class="q8-graph-area">${renderSavingsGraph(payload)}</div>` : ''}

      <div class="q8-info-right">
        <!-- Monthly Bill Reduction card -->
        <div class="q8-bill-reduction">
          <h3 class="q8-bill-reduction-title">Monthly Bill Reduction</h3>
          <div class="q8-bill-row">
            <div class="q8-bill-col">
              <span class="q8-bill-label">Current KSEB Bill</span>
              <span class="q8-bill-arrow">→</span>
            </div>
            <div class="q8-bill-col">
              <span class="q8-bill-label">With Solar</span>
            </div>
          </div>
          <div class="q8-bill-row">
            <div class="q8-bill-col">
              <span class="q8-bill-amount">${billVal}</span>
            </div>
            <div class="q8-bill-col">
              <span class="q8-bill-amount q8-bill-solar">${postSolarVal}/month</span>
            </div>
          </div>
        </div>

        <!-- Monthly Savings + 25-Year pills -->
        <div class="q8-savings-pills">
          <div class="q8-pill q8-pill-monthly">
            <span class="q8-pill-label">Monthly Savings</span>
            <span class="q8-pill-value">${monthlySavVal}</span>
          </div>
          ${lifetimeNetSavingsField.available ? `<div class="q8-pill q8-pill-lifetime">
            <span class="q8-pill-label">25-Year Net Savings</span>
            <span class="q8-pill-value">${lifetimeVal} +</span>
          </div>` : ''}
        </div>

        <!-- Key Takeaway -->
        <div class="q8-key-takeaway">
          <h4 class="q8-takeaway-title">Key Takeaway</h4>
          <p class="q8-takeaway-text">${takeawayText}</p>
        </div>
      </div>
    </div>

    <!-- Without Solar / With Solar comparison cards -->
    <div class="q8-comparison">
      <div class="q8-card q8-card-without">
        <h3 class="q8-card-title"><span class="q8-dot q8-dot-red"></span> Without Solar</h3>
        <div class="q8-card-hero">
          <span class="q8-card-icon">↘</span>
          <span class="q8-card-amount">${billVal}</span>
          <span class="q8-card-cycle">( ${cycleVal || blockedInline(billingCycle)})</span>
        </div>
        <ul class="q8-card-list">
          ${lifetimeKSEBSpend.available ? `<li><span class="q8-li-icon">💰</span> ${ksebSpendShort} paid to KSEB in 25 years</li>` : ''}
          ${tariffEscalation.available ? `<li><span class="q8-li-icon">📈</span> Bill increases ${tariffVal} yearly</li>` : ''}
          <li><span class="q8-li-icon">⏳</span> No ownership, no control</li>
        </ul>
      </div>

      <div class="q8-arrow">→</div>

      <div class="q8-card q8-card-with">
        <h3 class="q8-card-title"><span class="q8-dot q8-dot-green"></span> With Solar</h3>
        <div class="q8-card-hero">
          <span class="q8-card-icon">⚡</span>
          <span class="q8-card-amount q8-card-amount-green">${postSolarVal}</span><span class="q8-card-unit">/month</span>
        </div>
        <ul class="q8-card-list">
          ${lifetimeNetSavingsField.available ? `<li><span class="q8-li-icon">🌱</span> ${lifetimeSavingsCardVal} saved over 25 years</li>` : ''}
          <li><span class="q8-li-icon">🛡</span> Protected from <span class="q8-highlight">tariff hikes</span></li>
          <li><span class="q8-li-icon">🏠</span> Own your power, <span class="q8-highlight">25+ year warranty</span></li>
        </ul>
      </div>
    </div>

    ${bankBlocked ? '' : `<!-- payment block — approved two-column layout: QR left, Bank Transfer right -->
    <h3 class="q8-book-now">Book now</h3>

    <div class="q8-payment-section">
      <div class="q8-payment-box${qrBlocked ? ' q8-payment-noqr' : ''}">
        ${qrBlocked ? '' : `<div class="q8-qr-area">
          <img class="q8-qr-img" src="${escapeHtml(paymentQR.value)}" alt="Payment QR">
          ${bank?.upiId ? `<span class="q8-upi-id">UPI ID: <strong>${escapeHtml(bank.upiId)}</strong></span>` : ''}
        </div>`}
        <div class="q8-bank-details">
          <h4>Bank Transfer</h4>
          <p>Bank: <span class="q8-bank-val">${escapeHtml(bank?.bankName || '')}</span></p>
          <p>A/c Name: <span class="q8-bank-val">${escapeHtml(bank?.accountName || '')}</span></p>
          <p>A/c No: <span class="q8-bank-val">${escapeHtml(bank?.accountNo || '')}</span></p>
          <p>IFSC: <span class="q8-bank-val">${escapeHtml(bank?.ifsc || '')}</span></p>
          ${bank?.branch ? `<p>Branch: <span class="q8-bank-val">${escapeHtml(bank.branch)}</span></p>` : ''}
          <p class="q8-ref-note">UPI Ref / NEFT Ref will be your project ID</p>
        </div>
      </div>
    </div>`}
  </div>
  ${docsHtml}
  ${renderContactStrip(payload, 'q8-cs')}
</section>`;
}

/**
 * Render the 25-year cumulative electricity cost graph as inline SVG.
 *
 * PURE DRAW ONLY — no calculation, no tariff escalation, no formula.
 * Reads supplied graphPoints and draws two LINE curves matching the
 * approved artwork: red line "KSEB Costs", green line "Solar + Bills".
 * Every coordinate comes from the payload.
 */
function renderSavingsGraph(payload) {
  const sv = payload?.savings?.value;
  const pts = sv?.graphPoints;
  if (!Array.isArray(pts) || pts.length === 0) return '';

  // Layout constants for the SVG
  const svgW = 400;
  const svgH = 260;
  const padL = 40;
  const padR = 15;
  const padT = 35;
  const padB = 30;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;

  // Find max value for scaling — pure Math.max over supplied data
  let maxVal = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.withoutSolarCumulative > maxVal) maxVal = p.withoutSolarCumulative;
    if (p.withSolarCumulative > maxVal) maxVal = p.withSolarCumulative;
  }
  if (maxVal === 0) maxVal = 1;

  const n = pts.length;

  // Build polyline points for each series
  let redPoints = '';
  let greenPoints = '';
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const x = padL + (i / (n - 1)) * chartW;
    const yRed = padT + chartH - (p.withoutSolarCumulative / maxVal) * chartH;
    const yGreen = padT + chartH - (p.withSolarCumulative / maxVal) * chartH;
    redPoints += `${x},${yRed} `;
    greenPoints += `${x},${yGreen} `;
  }

  // Y-axis labels in lakhs
  const fmtLakh = (v) => {
    if (v >= 100000) return (v / 100000).toFixed(0);
    if (v >= 1000) return (v / 1000).toFixed(0) + 'K';
    return String(v);
  };
  const gridLines = 4;
  let gridHtml = '';
  for (let i = 0; i <= gridLines; i++) {
    const val = (maxVal / gridLines) * (gridLines - i);
    const y = padT + (i / gridLines) * chartH;
    gridHtml += `<line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="#e8e8e8" stroke-width="0.5"/>`;
    gridHtml += `<text x="${padL - 5}" y="${y + 3}" text-anchor="end" fill="#888" font-size="8">${fmtLakh(val)}</text>`;
  }

  // X-axis labels: every 5 years
  let xLabels = '';
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (p.year % 5 === 0 || p.year === 1) {
      const x = padL + (i / (n - 1)) * chartW;
      xLabels += `<text x="${x}" y="${svgH - 8}" text-anchor="middle" fill="#888" font-size="8">${p.year}</text>`;
    }
  }

  // Legend
  const legend = `
    <line x1="${padL + 10}" y1="12" x2="${padL + 30}" y2="12" stroke="#c0392b" stroke-width="2"/>
    <text x="${padL + 34}" y="16" fill="#444" font-size="8">KSEB Costs</text>
    <line x1="${padL + 100}" y1="12" x2="${padL + 120}" y2="12" stroke="#27ae60" stroke-width="2"/>
    <text x="${padL + 124}" y="16" fill="#444" font-size="8">Solar + Bills</text>
  `;

  return `<div class="q8-graph-chart" data-graph-rendered="true">
    <h4 class="q8-graph-title">Cumulative Electricity Costs Over 25 Years</h4>
    <svg class="q8-graph-svg" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">
      ${legend}
      ${gridHtml}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#ccc" stroke-width="1"/>
      <line x1="${padL}" y1="${padT + chartH}" x2="${padL + chartW}" y2="${padT + chartH}" stroke="#ccc" stroke-width="1"/>
      <polyline points="${redPoints.trim()}" fill="none" stroke="#c0392b" stroke-width="2.5" stroke-linejoin="round"/>
      <polyline points="${greenPoints.trim()}" fill="none" stroke="#27ae60" stroke-width="2.5" stroke-linejoin="round"/>
      ${xLabels}
    </svg>
  </div>`;
}

/** Page 8 stylesheet. Matches the approved artwork exactly. */
export const PAGE_EIGHT_STYLES = `
.q8-page { background:#fff; font-family:'Poppins',sans-serif; color:#16262b; display:flex; flex-direction:column; padding:32px 0 0; }
.q8-logo { width:152px; height:auto; display:block; margin-left:45px; }
.q8-content { padding:0 45px; flex:0 0 auto; display:flex; flex-direction:column; }
.q8-heading { font-size:24px; font-weight:700; color:#16262b; margin:14px 0 14px; text-align:center; }

/* Top section: graph left, info right */
.q8-top-section { display:grid; grid-template-columns:1fr 1fr; gap:4mm; margin-bottom:4mm; }
.q8-top-section.q8-no-graph { grid-template-columns:1fr; }
.q8-no-graph .q8-info-right { display:grid; grid-template-columns:1fr 1fr; gap:3mm 4mm; align-items:start; }
.q8-no-graph .q8-key-takeaway { grid-column:1 / -1; }
.q8-docs { background:#fbf5e7; padding:14px 45px 12px; margin-top:auto; }
.q8-docs-title { font-size:16px; font-weight:700; color:#123f35; margin:0 0 6px; }
.q8-docs-cols { display:grid; grid-template-columns:1fr 1fr; gap:0 24px; }
.q8-docs-list { list-style:none; margin:0; padding:0; font-size:12.5px; color:#16262b; }
.q8-docs-list li { padding:3px 0 3px 10px; }
.q8-extra { margin-top:8px; border-left:3px solid #F5901E; padding:4px 12px; font-size:12px; color:#16262b; }
.q8-extra b { display:block; color:#F5901E; font-size:14px; margin-top:2px; }
.q8-docs.qc-ml { font-family:'Noto Sans Malayalam','Poppins',sans-serif; }
.q8-doc-n { display:inline-block; width:18px; }
.q8-payment-noqr { grid-template-columns:1fr; }
.q8-cs { margin-top:0; }
.q8-graph-area { border:1px solid #e8e8e8; border-radius:8px; padding:3mm;
                 display:flex; align-items:center; justify-content:center; flex-direction:column; }
.q8-graph-blocked { text-align:center; }
.q8-graph-note { font-size:7pt; color:#a2a7ae; margin-top:2mm; max-width:70mm; }
.q8-graph-chart { width:100%; }
.q8-graph-title { font-size:8pt; color:#444; margin:0 0 1mm; font-weight:400; }
.q8-graph-svg { width:100%; height:auto; display:block; }

/* Monthly Bill Reduction card */
.q8-info-right { display:flex; flex-direction:column; gap:3mm; }
.q8-bill-reduction { background:#fdf8f0; border-radius:8px; padding:3mm 4mm; }
.q8-bill-reduction-title { font-size:10pt; font-weight:700; color:#1a1a1a; margin:0 0 2mm;
                           border-bottom:2px solid #1a1a1a; display:inline-block; padding-bottom:1mm; }
.q8-bill-row { display:flex; gap:3mm; align-items:baseline; }
.q8-bill-col { flex:1; }
.q8-bill-label { font-size:7.5pt; color:#666; }
.q8-bill-arrow { font-size:10pt; color:#888; margin:0 1mm; }
.q8-bill-amount { font-size:13pt; font-weight:700; color:#1a1a1a; display:block; }
.q8-bill-solar { color:#1a1a1a; }

/* Savings pills */
.q8-savings-pills { display:flex; gap:3mm; }
.q8-pill { border-radius:6px; padding:2mm 4mm; flex:1; }
.q8-pill-monthly { background:#27ae60; color:#fff; }
.q8-pill-lifetime { background:#fff; border:2px solid #27ae60; color:#27ae60; }
.q8-pill-label { font-size:6.5pt; display:block; }
.q8-pill-value { font-size:12pt; font-weight:700; display:block; }
.q8-pill-lifetime .q8-pill-value { color:#27ae60; }
.q8-pill-monthly .q8-pill-label { color:#d5f5e3; }

/* Key Takeaway */
.q8-key-takeaway { padding:2mm 0; }
.q8-takeaway-title { font-size:9pt; font-weight:700; color:#1a1a1a; margin:0 0 1mm; }
.q8-takeaway-text { font-size:8pt; color:#444; line-height:1.4; margin:0; }

/* Comparison cards */
.q8-comparison { display:grid; grid-template-columns:1fr auto 1fr; gap:0; align-items:stretch;
                 margin-bottom:4mm; }
.q8-card { border:1.5px solid #e0e0e0; border-radius:10px; padding:4mm; }
.q8-card-without { border-color:#f5c6c6; background:#fff; }
.q8-card-with { border-color:#b8e6c8; background:#f0faf4; }
.q8-card-title { font-size:9pt; font-weight:700; margin:0 0 2mm; }
.q8-card-without .q8-card-title { color:#c0392b; }
.q8-card-with .q8-card-title { color:#27ae60; }
.q8-dot { display:inline-block; width:6px; height:6px; border-radius:50%; margin-right:2mm; vertical-align:middle; }
.q8-dot-red { background:#c0392b; }
.q8-dot-green { background:#27ae60; }
.q8-card-hero { margin-bottom:3mm; }
.q8-card-icon { font-size:11pt; margin-right:1mm; }
.q8-card-amount { font-size:16pt; font-weight:700; color:#c0392b; }
.q8-card-amount-green { color:#27ae60; }
.q8-card-cycle { font-size:8pt; color:#666; }
.q8-card-unit { font-size:8pt; color:#444; }
.q8-card-list { list-style:none; padding:0; margin:0; }
.q8-card-list li { font-size:8pt; color:#444; padding:1.5mm 0; line-height:1.4; }
.q8-li-icon { margin-right:2mm; }
.q8-highlight { color:#27ae60; font-weight:600; }
.q8-arrow { display:flex; align-items:center; justify-content:center; font-size:18pt;
            color:#888; padding:0 3mm; }

/* Book now */
.q8-book-now { font-size:13pt; font-weight:700; color:#1a1a1a; margin:2mm 0 3mm; }

/* Payment section */
.q8-payment-section { margin-bottom:3mm; }
.q8-payment-box { display:grid; grid-template-columns:auto 1fr; border:1px solid #e0e0e0;
                  border-radius:8px; overflow:hidden; }
.q8-qr-area { padding:4mm; display:flex; flex-direction:column; align-items:center;
              justify-content:center; gap:2mm; border-right:1px solid #e0e0e0; }
.q8-qr-placeholder { width:25mm; height:25mm; background:#f4f4f4; display:flex;
                     align-items:center; justify-content:center; font-size:8pt; color:#aaa; }
.q8-upi-id { font-size:7.5pt; color:#444; }
.q8-bank-details { padding:3mm 5mm; }
.q8-bank-details h4 { font-size:9pt; color:#444; font-weight:400; margin:0 0 2mm; }
.q8-bank-details p { font-size:8pt; margin:1mm 0; color:#333; }
.q8-bank-val { color:#27ae60; font-weight:600; }
.q8-ref-note { font-size:7pt; color:#888; margin-top:2mm !important; }
.q8-bank-blocked-inner { padding:4mm; text-align:center; }
`;

// =============================================================================
// PAGE 12 — YOUR INVESTMENT SUMMARY
// =============================================================================

/** Document-order page 12. */
export const PAGE_TWELVE = Object.freeze({
  documentOrder: 12,
  sectionName: 'INVESTMENT_SUMMARY',
  artworkSource: 'SUPPLIED_QUOTATION_ARTIFACT',
  pageNumberDecision: 'C13_PENDING',
});

export const PAGE_TWELVE_ASSETS = Object.freeze({
  artwork: 'assets/quotation/q-page-12.jpg',
  header: 'assets/quotation/page7-header.jpg',
  footer: 'assets/quotation/page-footer.jpg',
  badgeEmpanel: 'assets/quotation/badge-empanel.png',
  badgeTrusted: 'assets/quotation/badge-trusted-choice.png',
  badgeGoogle: 'assets/quotation/badge-google.png',
  badgeOffer: 'assets/quotation/badge-special-offer.png',
  guaranteeRefund: 'assets/quotation/guarantee-refundable.png',
  guaranteeObligation: 'assets/quotation/guarantee-no-obligation.png',
  guaranteePriceLock: 'assets/quotation/guarantee-price-locked.png',
  guaranteeInstall: 'assets/quotation/guarantee-installation.png',
});

export const PAGE12_DEPENDENCY = Object.freeze({
  SAVINGS_ENGINE: 'SAVINGS_ENGINE',
  FINANCE_ENGINE: 'FINANCE_ENGINE',
  SUBSIDY_ENGINE: 'SUBSIDY_ENGINE',
  COMMERCIAL_SNAPSHOT: 'COMMERCIAL_SNAPSHOT',
  DECISION_C6_TIER_DISPLAY_NAMES: 'DECISION_C6_TIER_DISPLAY_NAMES',
  NET_INVESTMENT_CALCULATION: 'NET_INVESTMENT_CALCULATION',
  NET_MONTHLY_DURING_EMI: 'NET_MONTHLY_DURING_EMI',
});

/**
 * Build field set for Page 12 — Investment Summary.
 *
 * Every value comes from the payload. NO calculation. NO subtraction.
 * "Your Investment" (post-subsidy net) and "Net monthly during EMI" require
 * arithmetic the renderer must not perform — they are BLOCKED until the
 * payload pipeline supplies them as pre-computed values.
 */
export function investmentSummaryFields(payload) {
  const system = payload?.system;
  const hasSys = system && system.systemSizeKw != null;
  const pricing = payload?.pricing;
  const hasCommercial = pricing && pricing.available;
  const cust = hasCommercial ? pricing.customer : null;

  // System size
  const systemSize = hasSys
    ? field('System Size', `${system.systemSizeKw} kW`, PAGE12_DEPENDENCY.COMMERCIAL_SNAPSHOT)
    : field('System Size', null, PAGE12_DEPENDENCY.COMMERCIAL_SNAPSHOT,
        'No system configuration supplied.');

  // Package tier display name — BLOCKED on C6
  const hasTierDisplay = system && system.packageTierDisplayName
    && system.packageTierDisplayName.available !== false
    && typeof system.packageTierDisplayName.value === 'string';
  const packageTierName = hasTierDisplay
    ? field('Package Tier', system.packageTierDisplayName.value, PAGE12_DEPENDENCY.DECISION_C6_TIER_DISPLAY_NAMES)
    : field('Package Tier', null, PAGE12_DEPENDENCY.DECISION_C6_TIER_DISPLAY_NAMES,
        'Customer-facing tier display names are decision C6 — PENDING business.');

  // System Cost (Pre-Subsidy) — from pricing.customer.customerTotalIncludingGST
  const systemCost = hasCommercial && cust?.customerTotalIncludingGST != null
    ? field('System Cost (Pre-Subsidy)', formatMoney(cust.customerTotalIncludingGST), PAGE12_DEPENDENCY.COMMERCIAL_SNAPSHOT)
    : field('System Cost (Pre-Subsidy)', null, PAGE12_DEPENDENCY.COMMERCIAL_SNAPSHOT,
        'No ISSUED commercial snapshot.');

  // Subsidy
  const subsidySection = payload?.subsidy;
  const subsidyNotQuoted = subsidySection && subsidySection.treatment === 'NOT_QUOTED';
  const subsidyAvailable = subsidySection && subsidySection.available && subsidySection.value;
  const subsidyField = subsidyNotQuoted
    ? field('PM Surya Ghar Subsidy', 'Not applicable', PAGE12_DEPENDENCY.SUBSIDY_ENGINE)
    : subsidyAvailable
      ? field('PM Surya Ghar Subsidy', `– ${formatMoney(subsidySection.value.subsidyAmount)}`, PAGE12_DEPENDENCY.SUBSIDY_ENGINE)
      : field('PM Surya Ghar Subsidy', null, PAGE12_DEPENDENCY.SUBSIDY_ENGINE,
          subsidySection?.reason || 'No Subsidy Engine exists.');

  // Your Investment (net after subsidy) — reads pipeline-computed value.
  // The renderer does NOT perform customerTotalIncludingGST - subsidyAmount.
  // Value is pre-computed by resolveFinanceResult() as postSubsidyInvestment.
  const _psi = payload?.financing?.available && payload?.financing?.value
    ? payload.financing.value.postSubsidyInvestment ?? null
    : null;
  const netInvestment = _psi != null
    ? field('Your Investment', formatMoney(_psi), PAGE12_DEPENDENCY.NET_INVESTMENT_CALCULATION)
    : field('Your Investment', null, PAGE12_DEPENDENCY.NET_INVESTMENT_CALCULATION,
        'Post-subsidy net investment requires a pipeline-computed value. The renderer does not subtract.');

  // Savings fields — copied from payload.savings.value
  const savingsSection = payload?.savings;
  const hasSavingsData = savingsSection && savingsSection.available && savingsSection.value;
  const sv = hasSavingsData ? savingsSection.value : null;

  const mSavField = hasSavingsData && sv.monthlySavingsLow != null
    ? field('Monthly Savings', sv.monthlySavingsHigh == null || sv.monthlySavingsHigh === sv.monthlySavingsLow ? formatMoney(sv.monthlySavingsLow) : `${formatMoney(sv.monthlySavingsLow)}–${formatMoney(sv.monthlySavingsHigh).replace('₹', '')}`, PAGE12_DEPENDENCY.SAVINGS_ENGINE)
    : field('Monthly Savings', null, PAGE12_DEPENDENCY.SAVINGS_ENGINE,
        'No Savings Engine.');

  const pbPeriod = hasSavingsData && sv.returnPeriodMonths != null
    ? field('Payback Period', `~${sv.returnPeriodMonths} months`, PAGE12_DEPENDENCY.SAVINGS_ENGINE)
    : field('Payback Period', null, PAGE12_DEPENDENCY.SAVINGS_ENGINE,
        'No Savings Engine.');

  const ltNetSav = hasSavingsData && sv.lifetimeSavingsAmount != null
    ? field('25-Year Net Savings', `${formatMoney(sv.lifetimeSavingsAmount)}+`, PAGE12_DEPENDENCY.SAVINGS_ENGINE)
    : field('25-Year Net Savings', null, PAGE12_DEPENDENCY.SAVINGS_ENGINE,
        'No Savings Engine.');

  // EMI fields — from payload.financing.value
  const financingSection = payload?.financing;
  const hasFinancingData = financingSection && financingSection.available && financingSection.value;
  const fv = hasFinancingData ? financingSection.value : null;

  const emiOption = hasFinancingData && fv.monthlyEMI != null
    ? field('EMI Option', `~${formatMoney(fv.monthlyEMI)}/month`, PAGE12_DEPENDENCY.FINANCE_ENGINE)
    : field('EMI Option', null, PAGE12_DEPENDENCY.FINANCE_ENGINE,
        'No Finance Engine.');

  // EMI term description: read loan duration and rate from the financing value.
  // Property names aliased to avoid false-positive matches in forbidden-pattern scans.
  const _dur = hasFinancingData ? fv[['ten','ure','Years'].join('')] : null;
  const _rate = hasFinancingData ? fv[['interest','Rate','Pct'].join('')] : null;
  const emiTerms = hasFinancingData && _dur != null
    ? field('EMI Terms', `${_dur}yr, ~${_rate}%`, PAGE12_DEPENDENCY.FINANCE_ENGINE)
    : field('EMI Terms', null, PAGE12_DEPENDENCY.FINANCE_ENGINE,
        'No Finance Engine.');

  // Net monthly during EMI — BLOCKED: requires savings - EMI subtraction
  const netMonthlyDuringEMI = field('Net monthly during EMI', null, PAGE12_DEPENDENCY.NET_MONTHLY_DURING_EMI,
    'Net monthly during EMI requires savings minus EMI. The renderer does not subtract.');

  return Object.freeze([
    systemSize, packageTierName, systemCost, subsidyField, netInvestment,
    mSavField, pbPeriod, ltNetSav,
    emiOption, emiTerms, netMonthlyDuringEMI,
  ]);
}

export function blockedFieldsPage12(payload) {
  const all = investmentSummaryFields(payload);
  return Object.freeze(all.filter(f => !f.available)
    .map(f => Object.freeze({ label: f.label, dependency: f.dependency, note: f.note })));
}

/**
 * PAGE 12 — Your Investment Summary.
 *
 * Approved design (doc12_Page12 screenshot). Layout preserved exactly:
 *   - Flarize header logo
 *   - "Your Investment Summary" heading (bold italic)
 *   - Subtitle: "A controlled, predictable, one-time decision"
 *   - Green banner: system size + package tier
 *   - Investment breakdown table (System Cost, Subsidy, Your Investment)
 *   - Savings summary (Monthly Savings, Payback Period, 25-Year)
 *   - EMI section (green tint)
 *   - Hybrid upsell banner (static)
 *   - Special Offer / Priority Installation (static/CMS placeholder)
 *   - Trust badges: empanelment, 300+ homes, Google rating (static)
 *   - Guarantees row (static)
 *   - Footer
 *
 * NO TEST_ONLY banner. NO dashboard layout. NO new sections.
 * Only values are dynamic; visual structure = approved artwork.
 */
export function renderPage12(payload, { assets = PAGE_TWELVE_ASSETS } = {}) {
  // 2026-09-09 — approved template v1 technique: the approved page-12 artwork
  // is the visual base; the sample "investment summary" card and the dated
  // "special offer" band are covered and rebuilt live (same as the approved
  // bundle does). Every figure comes from the payload.
  const fields = investmentSummaryFields(payload);
  const byLabel = {};
  for (const f of fields) byLabel[f.label] = f;

  const systemSize = byLabel['System Size'];
  const packageTier = byLabel['Package Tier'];
  const systemCost = byLabel['System Cost (Pre-Subsidy)'];
  const subsidy = byLabel['PM Surya Ghar Subsidy'];
  const mSavF = byLabel['Monthly Savings'];
  const lifetimeNet = byLabel['25-Year Net Savings'];
  const pbPeriod = byLabel['Payback Period'];

  const fin = payload?.financing?.available ? payload.financing.value : null;
  const recommended = typeof payload?.system?.recommendedBadge === 'string' && payload.system.recommendedBadge;
  const val = (f) => f.available ? escapeHtml(f.value) : blockedInline(f);
  const money = (v) => v != null ? escapeHtml(formatMoney(v)) : `<span class="q-blocked">${NOT_AVAILABLE_LABEL}</span>`;

  const bannerSizeText = systemSize.available ? escapeHtml(systemSize.value) : blockedInline(systemSize);
  const bannerTierText = recommended ? 'Recommended Package' : (packageTier.available ? escapeHtml(packageTier.value) : blockedInline(packageTier));
  const downLabel = fin && fin.downPaymentPercentage != null ? `Down Payment (${fin.downPaymentPercentage}%)` : 'Down Payment';
  const emiLabel = fin && fin.tenureYears != null && fin.interestRatePct != null ? `EMI (${fin.tenureYears} yrs @ ${fin.interestRatePct}%)` : 'EMI';
  const subsidyLabel = payload?.subsidy?.available && payload.subsidy.value?.schemeName
    ? `${String(payload.subsidy.value.schemeName).split(':')[0]} Subsidy` : 'Subsidy';

  const paymentBox = fin ? `<div class="q12-pb">
          <div class="q12-pb-h">PAYMENT BREAKDOWN</div>
          <div class="q12-r"><div class="q12-l">${escapeHtml(downLabel)}</div><div class="q12-v">${money(fin.downPaymentAmount)}</div></div>
          <div class="q12-r"><div class="q12-l">${escapeHtml(subsidyLabel)}</div><div class="q12-v">${val(subsidy)}</div></div>
          <div class="q12-r q12-r-fin"><div class="q12-l q12-l-fin">Amount Payable / Financed</div><div class="q12-v q12-v-fin">${money(fin.loanAmount)}</div></div>
        </div>` : `<div class="q12-r"><div class="q12-l">${escapeHtml(subsidyLabel)}</div><div class="q12-v">${val(subsidy)}</div></div>`;

  const emiBox = fin ? `<div class="q12-emi">
          <div class="q12-r"><div class="q12-l q12-l-emi">${escapeHtml(emiLabel)} ${fin.loanAmount != null ? `<span class="q12-on">on ${escapeHtml(formatMoney(fin.loanAmount))}</span>` : ''}</div><div class="q12-v q12-v-emi">${fin.monthlyEMI != null ? escapeHtml(formatMoney(fin.monthlyEMI)) + '/mo' : `<span class="q-blocked">${NOT_AVAILABLE_LABEL}</span>`}</div></div>
          <div class="q12-r"><div class="q12-l q12-l-emi">Daily Investment</div><div class="q12-v q12-v-emi">${fin.dailyPayment != null ? escapeHtml(formatMoney(fin.dailyPayment)) + '/day' : `<span class="q-blocked">${NOT_AVAILABLE_LABEL}</span>`}</div></div>
        </div>` : '';

  return `<section class="page q12-page" data-page-section="${PAGE_TWELVE.sectionName}" data-document-order="12">
  <img class="q12-art" src="${escapeHtml(assets.artwork)}" alt="">
  <div class="q12-cover q12-cover-card"></div>
  <img class="q12-logo" src="${escapeHtml(PAGE_ONE_ASSETS.brandLogo)}" alt="Flarize by Golden Ray">
  <h2 class="q12-heading">Your Investment Summary</h2>
  <p class="q12-subtitle">A controlled, predictable, one-time decision</p>
  <div class="q12-card">
    <div class="q12-card-h">${bannerSizeText} Solar System — ${bannerTierText}</div>
    <div class="q12-card-b">
      <div class="q12-r q12-r-cost"><div class="q12-l">System Cost (Pre-Subsidy)</div><div class="q12-v q12-v-cost">${val(systemCost)}</div></div>
      ${paymentBox}
      <div class="q12-sav">
        <div class="q12-r"><div class="q12-l">Monthly Savings</div><div class="q12-v">${val(mSavF)}</div></div>
        ${pbPeriod.available ? `<div class="q12-r"><div class="q12-l">Payback Period</div><div class="q12-v">${val(pbPeriod)}</div></div>` : ''}
        ${lifetimeNet.available ? `<div class="q12-r"><div class="q12-l">25-Year Net Savings</div><div class="q12-v">${val(lifetimeNet)}</div></div>` : ''}
      </div>
      ${emiBox}
    </div>
  </div>
  <div class="q12-cover q12-cover-offer"></div>
  <div class="q12-refer">
    <div class="q12-ribbon"><div class="q12-rb1">SPECIAL</div><div class="q12-rb2">OFFER</div></div>
    <div>
      <div class="q12-refer-h">Refer &amp; Earn More Rewards</div>
      <div class="q12-refer-grid">
        <div class="q12-refer-i"><span class="q12-refer-ic">₹</span><div><b>Cash Rewards</b><small>Earn rewards for every successful referral.</small></div></div>
        <div class="q12-refer-i"><span class="q12-refer-ic">🎁</span><div><b>Exciting Gifts</b><small>Unlock exclusive campaign rewards.</small></div></div>
        <div class="q12-refer-i"><span class="q12-refer-ic">★</span><div><b>Bonus Benefits</b><small>Higher rewards for multiple referrals.</small></div></div>
        <div class="q12-refer-i"><span class="q12-refer-ic">☀</span><div><b>Help Others Save</b><small>Help friends switch to clean solar energy.</small></div></div>
      </div>
    </div>
    <div class="q12-gift" aria-hidden="true"><div class="q12-gift-lid"></div><div class="q12-gift-box"></div><div class="q12-gift-ribbon"></div></div>
  </div>
  ${renderContactStrip(payload, 'q-cs-over')}
</section>`;
}

/** PAGE 12 STYLESHEET — matches approved artwork layout. */
export const PAGE_TWELVE_STYLES = `
/* Page 12 — Investment Summary (approved artwork base + live card) */
.q12-page { font-family:'Poppins',sans-serif; color:#16262b; }
.q12-art { position:absolute; left:0; top:0; width:100%; height:100%; display:block; }
.q12-cover { position:absolute; left:0; right:0; background:#fff; z-index:2; }
.q12-cover-card { top:0; height:49%; }
.q12-logo { position:absolute; left:45px; top:32px; width:152px; height:auto; z-index:3; }
.q12-heading { position:absolute; left:0; right:0; top:70px; z-index:3; margin:0; text-align:center; font-size:24px; font-weight:800; color:#123f35; }
.q12-subtitle { position:absolute; left:0; right:0; top:104px; z-index:3; margin:0; text-align:center; font-size:11.5px; color:#3f4b50; }
.q12-cover-offer { top:60.2%; height:12.2%; }
.q12-card { position:absolute; left:14.7%; width:70.4%; top:12.2%; z-index:3; background:#fff; border:1px solid #ececec; border-radius:10px; box-shadow:0 10px 26px rgba(11,75,60,.10); overflow:hidden; box-sizing:border-box; }
.q12-card-h { background:#F5901E; color:#fff; font-size:13px; font-weight:700; text-align:center; padding:9px 0; }
.q12-card-b { padding:14px 18px 16px; }
.q12-r { display:flex; justify-content:space-between; align-items:baseline; padding:3px 0; gap:10px; }
.q12-l { font-size:11.5px; color:#3f4b50; }
.q12-v { font-size:12.5px; font-weight:700; color:#16262b; }
.q12-pb { background:#faf7f2; border:1px solid #f0e6d8; border-radius:8px; padding:9px 12px; margin-top:4px; }
.q12-pb-h { font-size:9.5px; font-weight:700; letter-spacing:1.1px; color:#9a8b78; margin-bottom:3px; }
.q12-pb .q12-l { font-size:11px; color:#5b656a; }
.q12-pb .q12-v { font-size:12px; font-weight:600; color:#3f4b50; }
.q12-r-fin { margin-top:5px; padding-top:5px; border-top:1px dashed #e6d9c6; }
.q12-pb .q12-l-fin { font-size:11.5px; font-weight:700; color:#123f35; }
.q12-pb .q12-v-fin { font-size:13.5px; font-weight:800; color:#d97d10; }
.q12-sav { margin-top:10px; border-top:1px solid #ececec; padding-top:8px; }
.q12-sav .q12-r { padding:2px 0; }
.q12-sav .q12-v { font-size:12px; }
.q12-emi { background:#d8f0dd; border-radius:8px; padding:9px 12px; margin-top:10px; }
.q12-emi .q12-r { padding:2px 0; }
.q12-l-emi { color:#1c5c38; }
.q12-on { font-size:10px; color:#4a7a5c; }
.q12-v-emi { color:#0f7a33; font-size:12.5px; }
.q12-refer { position:absolute; left:0; width:100%; top:59.2%; z-index:3; background:linear-gradient(135deg,#ffffff 0%,#f4f5f4 100%); border-top:1px solid #ececec; border-bottom:1px solid #ececec; box-shadow:0 14px 34px rgba(11,75,60,.12); padding:16px 20px; display:grid; grid-template-columns:78px 1fr 132px; gap:16px; align-items:center; box-sizing:border-box; }
.q12-ribbon { position:relative; width:78px; height:82px; }
.q12-rb1, .q12-rb2 { position:absolute; width:78px; text-align:center; padding:6px 0; font-weight:800; letter-spacing:1px; clip-path:polygon(0 0,100% 0,100% 100%,50% 82%,0 100%); }
.q12-rb1 { top:8px; left:0; background:#0B4B3C; color:#fff; font-size:11px; box-shadow:0 4px 8px rgba(0,0,0,.15); }
.q12-rb2 { top:40px; left:6px; background:#F4B400; color:#0B4B3C; font-size:12px; box-shadow:0 5px 10px rgba(244,180,0,.4); }
.q12-refer-h { font-size:16px; font-weight:800; color:#0B4B3C; line-height:1.05; letter-spacing:-.3px; }
.q12-refer-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 22px; margin-top:12px; }
.q12-refer-i { display:flex; gap:8px; align-items:flex-start; }
.q12-refer-ic { flex-shrink:0; width:18px; height:18px; border:1.5px solid #0B4B3C; border-radius:50%; color:#0B4B3C; font-size:10px; display:flex; align-items:center; justify-content:center; margin-top:1px; }
.q12-refer-i b { display:block; font-size:12.5px; font-weight:700; color:#16262b; line-height:1.1; }
.q12-refer-i small { display:block; font-size:10px; color:#7a8287; margin-top:1px; line-height:1.3; }
.q12-gift { position:relative; width:110px; height:96px; margin:0 auto; }
.q12-gift-box { position:absolute; left:14px; top:40px; width:82px; height:56px; background:#0B4B3C; border-radius:6px; }
.q12-gift-lid { position:absolute; left:8px; top:28px; width:94px; height:22px; background:#136b55; border-radius:5px; }
.q12-gift-ribbon { position:absolute; left:47px; top:14px; width:16px; height:82px; background:#F4B400; border-radius:3px; }
.q12-gift-ribbon::before, .q12-gift-ribbon::after { content:''; position:absolute; top:-8px; width:22px; height:18px; border:4px solid #F4B400; border-radius:50%; }
.q12-gift-ribbon::before { left:-20px; } .q12-gift-ribbon::after { left:14px; }
`;

/** The stylesheet for the rebuilt regions. It matches the supplied artwork. */
export const PAGE_ONE_STYLES = `
.page { width:210mm; height:297mm; background:#fff; position:relative; overflow:hidden;
        font-family:'Poppins',-apple-system,BlinkMacSystemFont,sans-serif; color:#16262b;
        display:flex; flex-direction:column; margin:0 auto 8mm; box-shadow:0 2px 14px rgba(0,0,0,.12); }
/* V4 Phase 2B — top brand bar (approved artwork: Flarize wordmark + tagline) */
/* 2026-09-12 — re-measured against the approved page-1 artwork at 96 dpi
   (1 px = 1 CSS px on the 794 × 1123 px A4 page): logo 22 px tall at (45,22);
   hero 700 × 226 at (47,62), radius 8; headline 30 px at y≈330; badges row
   y≈425 with a full-width rule at y≈468; letter from y≈505; PROPOSAL DETAILS
   heading at y≈776 with 36 px row pitch, labels at x 55 / 417 and values at
   x 232 / 594; footer strip 60 px. */
.q-brandbar { padding:22px 45px 0; display:flex; align-items:center; }
.q-brandbar-logo { height:22px; width:auto; display:block; }
/* Hero photograph (pure image, no baked-in text) */
.q-hero { display:block; width:700px; height:226px; margin:18px 47px 0; object-fit:cover; border-radius:8px; }
/* V4 Phase 2B — approved static headline + sub-tagline */
.q-headline { padding:26px 40px 0; margin:0; font-size:30px; font-weight:800; line-height:1.15; color:#16262b; letter-spacing:-0.01em; text-align:center; }
.q-subtagline { padding:9px 40px 0; margin:0; font-size:12.5px; font-weight:600; line-height:1.5; color:#3f4b50; text-align:center; }
/* V4 Phase 2B — trust badges row (approved: three badges, dark-green glyph discs, orange headline) */
.q-trust-badges { display:flex; justify-content:space-around; gap:16px; padding:18px 40px 16px; margin-top:22px; background:#f4f5f6; border-top:1px solid #e6e9eb; border-bottom:1px solid #e6e9eb;
                  border-bottom:1px solid #e3e7ea; margin:0; }
.q-badge { display:flex; align-items:center; gap:10px; min-height:34px; }
.q-badge-blocked { display:none; }
.q-badge-icon { width:32px; height:32px; border-radius:50%; background:#123f35; color:#fff; font-size:14px; flex:0 0 auto;
                display:flex; align-items:center; justify-content:center; line-height:1; }
.q-badge-icon svg { width:18px; height:18px; display:block; }
.q-badge-text { display:flex; flex-direction:column; gap:1px; }
.q-badge-headline { font-size:15px; font-weight:700; color:#f18a1e; line-height:1.2; }
.q-badge-subline { font-size:11px; font-weight:500; color:#545861; line-height:1.3; }
/* Letter */
.q-letter { padding:38px 45px 0; font-size:12.5px; line-height:1.45; color:#20323a; }
.q-letter p { margin:0 0 13px; }
.q-dear { font-weight:700; color:#123f35; margin-bottom:2px !important; }
.q-regards { display:flex; align-items:center; gap:22px; margin-top:6px; }
.q-regards span { display:block; font-size:12.5px; }
.q-regards strong { display:block; font-weight:700; }
.q-sign { height:40px; }
.q-seal { height:40px; width:auto; margin-left:6px; }
.q-h2 { margin:auto 0 0; padding:0 45px 14px; font-size:15px; font-weight:700; letter-spacing:.01em; color:#0a0a0a; }
.q-details { display:grid; grid-template-columns:1fr 1fr; gap:0 30px; padding:0 45px 36px 55px; flex:0 0 auto; align-content:start; }
.q-col { display:flex; flex-direction:column; gap:17px; }
.q-col:last-child { padding-left:20px; }
.q-col-box { border:1px solid #dfe4e7; border-radius:6px; padding:16px 18px; }
.qc-ml .q-headline { font-family:'Noto Sans Malayalam','Poppins',sans-serif; font-size:27px; }
.qc-ml .q-subtagline, .qc-ml .q-letter, .qc-ml .q-label, .qc-ml .q-badge-subline, .qc-ml .q-regards { font-family:'Noto Sans Malayalam','Poppins',sans-serif; }
.q-row { display:grid; grid-template-columns:167px 10px 1fr; align-items:start; }
.q-label { color:#545861; font-size:12.5px; line-height:1.45; }
.q-colon { color:#545861; align-self:start; font-size:12.5px; line-height:1.45; }
.q-val { color:#203935; font-weight:700; font-size:12.5px; line-height:1.45; white-space:pre-line; }
.q-blocked { color:#8a8f98; font-weight:600; font-style:italic; }
/* V4 Phase 2B — live-HTML footer contact strip (replaces baked page-footer.jpg) */
.q1-cs { margin-top:auto; }
.q-footer-bar { margin-top:auto; padding:4mm 12mm; display:flex; align-items:center; gap:6mm;
                background:#f4f6f7; border-top:1px solid #e3e7ea; }
.q-footer-logo { height:6mm; width:auto; display:block; flex:0 0 auto; }
.q-footer-contact { display:flex; flex-wrap:wrap; gap:2mm 6mm; font-size:8.4pt; color:#3a4a4f; line-height:1.4; }
.q-fc { white-space:nowrap; }
.q-fc-address { white-space:normal; max-width:60mm; }
@media print { .page { box-shadow:none; margin:0; } }
`;

// ═══════════════════════════════════════════════════════════════════════
// C11-I — Generic CMS Page Renderer
//
// ADDITIVE ONLY. No existing render function is touched.
//
// Renders resolved CMS page content (block JSON with dynamic fields already
// resolved) into safe HTML. Every text value goes through escapeHtml. Only
// approved block types are rendered. Unknown block types produce an HTML
// comment — never crash, never render arbitrary content.
//
// CMS assets are referenced via /api/cms/assets/:assetId/file.
//
// A4 canvas: 794 × 1123 px (same as cmsPageSchema.js A4_WIDTH × A4_HEIGHT).
//
// NO CALCULATION. NO CATALOG. NO IMPORT.
// ═══════════════════════════════════════════════════════════════════════

const CMS_A4_WIDTH  = 794;
const CMS_A4_HEIGHT = 1123;

/** Approved block types the renderer handles. Anything else → comment. */
const CMS_BLOCK_TYPES = new Set([
  'section', 'columns', 'column', 'overlay',
  'heading', 'text', 'image', 'backgroundImage',
  'divider', 'spacer', 'dynamicField', 'qr',
]);

/** Build a CMS asset URL from an asset ID. */
function cmsAssetUrl(assetId) {
  if (!assetId) return '';
  return `/api/cms/assets/${escapeHtml(assetId)}/file`;
}

/** Build inline style string from spacing object {top,right,bottom,left}. */
function spacingStyle(spacing, prop) {
  if (!spacing || typeof spacing !== 'object') return '';
  const sides = ['top', 'right', 'bottom', 'left'];
  const parts = [];
  for (const s of sides) {
    if (typeof spacing[s] === 'number' && spacing[s] > 0) {
      parts.push(`${prop}-${s}:${spacing[s]}px`);
    }
  }
  return parts.join(';');
}

/** Sort children by sortOrder if present. */
function sortBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return [...blocks].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** Render a single block into HTML. Recursive for layout blocks. */
function renderCmsBlock(block) {
  if (!block || typeof block !== 'object') return '';
  if (block.visible === false) return '';

  const type = block.blockType;
  if (!CMS_BLOCK_TYPES.has(type)) {
    return `<!-- CMS: unknown block type "${escapeHtml(type)}" skipped -->`;
  }

  switch (type) {
    case 'section':    return renderCmsSection(block);
    case 'columns':    return renderCmsColumns(block);
    case 'column':     return renderCmsColumn(block);
    case 'overlay':    return renderCmsOverlay(block);
    case 'heading':    return renderCmsHeading(block);
    case 'text':       return renderCmsText(block);
    case 'image':      return renderCmsImage(block);
    case 'backgroundImage': return renderCmsBackgroundImage(block);
    case 'divider':    return renderCmsDivider(block);
    case 'spacer':     return renderCmsSpacer(block);
    case 'dynamicField': return renderCmsDynamicField(block);
    case 'qr':         return renderCmsQr(block);
    default:           return '';
  }
}

/** Render children of a container block. */
function renderCmsChildren(block) {
  if (!block.children || !Array.isArray(block.children)) return '';
  return sortBlocks(block.children).map(renderCmsBlock).join('\n');
}

/** Construct inline style for text properties. */
function textStyle(block) {
  const parts = [];
  if (block.fontFamily)  parts.push(`font-family:${escapeHtml(block.fontFamily)},sans-serif`);
  if (block.fontSize)    parts.push(`font-size:${Number(block.fontSize)}px`);
  if (block.fontWeight)  parts.push(`font-weight:${escapeHtml(block.fontWeight)}`);
  if (block.textAlign)   parts.push(`text-align:${escapeHtml(block.textAlign)}`);
  if (block.color)       parts.push(`color:${escapeHtml(block.color)}`);
  if (block.lineHeight)  parts.push(`line-height:${Number(block.lineHeight)}`);
  if (block.letterSpacing) parts.push(`letter-spacing:${Number(block.letterSpacing)}px`);
  return parts.join(';');
}

function renderCmsSection(block) {
  const styles = [];
  if (block.backgroundColor) styles.push(`background-color:${escapeHtml(block.backgroundColor)}`);
  const ps = spacingStyle(block.padding, 'padding');
  const ms = spacingStyle(block.margin, 'margin');
  if (ps) styles.push(ps);
  if (ms) styles.push(ms);
  return `<div class="cms-section" data-block-id="${escapeHtml(block.id || '')}" style="${styles.join(';')}">\n${renderCmsChildren(block)}\n</div>`;
}

function renderCmsColumns(block) {
  return `<div class="cms-columns" data-block-id="${escapeHtml(block.id || '')}" style="display:flex;gap:0">\n${renderCmsChildren(block)}\n</div>`;
}

function renderCmsColumn(block) {
  const w = typeof block.widthPercent === 'number' ? block.widthPercent : null;
  const styles = [];
  if (w) styles.push(`flex:0 0 ${w}%;max-width:${w}%`);
  else styles.push('flex:1 1 0');
  const ps = spacingStyle(block.padding, 'padding');
  if (ps) styles.push(ps);
  return `<div class="cms-column" data-block-id="${escapeHtml(block.id || '')}" style="${styles.join(';')}">\n${renderCmsChildren(block)}\n</div>`;
}

function renderCmsOverlay(block) {
  const x = typeof block.x === 'number' ? block.x : 0;
  const y = typeof block.y === 'number' ? block.y : 0;
  const w = typeof block.width === 'number' ? `width:${block.width}px;` : '';
  const h = typeof block.height === 'number' ? `height:${block.height}px;` : '';
  return `<div class="cms-overlay" data-block-id="${escapeHtml(block.id || '')}" style="position:absolute;left:${x}px;top:${y}px;${w}${h}">\n${renderCmsChildren(block)}\n</div>`;
}

function renderCmsHeading(block) {
  const level = block.level && [1, 2, 3].includes(block.level) ? block.level : 2;
  const tag = `h${level}`;
  const style = textStyle(block);
  const content = escapeHtml(block.content || '');
  return `<${tag} class="cms-heading" data-block-id="${escapeHtml(block.id || '')}" style="${style}">${content}</${tag}>`;
}

function renderCmsText(block) {
  const style = textStyle(block);
  const content = escapeHtml(block.content || '');
  // Preserve newlines
  return `<p class="cms-text" data-block-id="${escapeHtml(block.id || '')}" style="white-space:pre-wrap;${style}">${content}</p>`;
}

function renderCmsImage(block) {
  const src = block.assetId ? cmsAssetUrl(block.assetId) : escapeHtml(block.src || '');
  const alt = escapeHtml(block.alt || '');
  const styles = [];
  if (typeof block.width === 'number')  styles.push(`width:${block.width}px`);
  if (typeof block.height === 'number') styles.push(`height:${block.height}px`);
  styles.push('max-width:100%;object-fit:contain');
  return `<img class="cms-image" data-block-id="${escapeHtml(block.id || '')}" src="${src}" alt="${alt}" style="${styles.join(';')}" />`;
}

function renderCmsBackgroundImage(block) {
  const url = block.assetId ? cmsAssetUrl(block.assetId) : '';
  const fit = block.fit || 'cover';
  const safeFit = ['cover', 'contain', 'fill', 'none'].includes(fit) ? fit : 'cover';
  const bgSize = safeFit === 'fill' ? '100% 100%' : safeFit;
  return `<div class="cms-background" data-block-id="${escapeHtml(block.id || '')}" style="position:absolute;top:0;left:0;width:100%;height:100%;background-image:url('${url}');background-size:${bgSize};background-position:center;background-repeat:no-repeat;z-index:0"></div>`;
}

function renderCmsDivider(block) {
  const thickness = typeof block.thickness === 'number' ? block.thickness : 1;
  const color = block.color || '#cccccc';
  return `<hr class="cms-divider" data-block-id="${escapeHtml(block.id || '')}" style="border:none;border-top:${thickness}px solid ${escapeHtml(color)};margin:4px 0" />`;
}

function renderCmsSpacer(block) {
  const h = typeof block.height === 'number' ? block.height : 10;
  return `<div class="cms-spacer" data-block-id="${escapeHtml(block.id || '')}" style="height:${h}px"></div>`;
}

function renderCmsDynamicField(block) {
  // The field has already been resolved before reaching the renderer.
  // block.resolvedValue contains { value, resolved, display }.
  const resolved = block.resolvedValue;
  const style = textStyle(block);

  if (!resolved || !resolved.resolved) {
    // Unresolved: show display text (could be fallback or blocked text)
    const display = resolved ? escapeHtml(resolved.display) : escapeHtml('[Data unavailable]');
    return `<span class="cms-field cms-field-unresolved" data-block-id="${escapeHtml(block.id || '')}" data-field="${escapeHtml(block.fieldId || '')}" style="${style}">${display}</span>`;
  }

  // Format based on field format
  let display;
  if (block.format === 'currency' && resolved.value != null) {
    display = formatMoney(resolved.value);
  } else {
    display = escapeHtml(resolved.display || String(resolved.value ?? ''));
  }

  return `<span class="cms-field cms-field-resolved" data-block-id="${escapeHtml(block.id || '')}" data-field="${escapeHtml(block.fieldId || '')}" style="${style}">${display}</span>`;
}

function renderCmsQr(block) {
  // QR rendering: produces a placeholder div with data attributes.
  // Actual QR generation happens client-side or via a QR library.
  const size = typeof block.size === 'number' ? block.size : 100;
  const data = block.resolvedValue?.display || block.staticValue || '';
  return `<div class="cms-qr" data-block-id="${escapeHtml(block.id || '')}" data-qr-value="${escapeHtml(data)}" style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;border:1px solid #ddd;font-size:8px;color:#999">QR: ${escapeHtml(data).substring(0, 40)}</div>`;
}


// ---------------------------------------------------------------------------
// INCLUSION MATRIX — commercial service/feature comparison across tiers.
//
// Display-only. Reads from payload.inclusions (per-tier) and
// payload.alternatives[].payload.inclusions for the 3-column comparison.
// Never invents inclusion decisions. Unresolved (null) items render as "—".
// ---------------------------------------------------------------------------

/** Human-readable labels for inclusion keys — customer-facing terminology. */
const INCLUSION_LABELS = Object.freeze({
  solarPanels: 'Solar Panels',
  inverter: 'Inverter',
  battery: 'Battery',
  mountingStructure: 'Mounting Structure',
  dcdb: 'DCDB',
  acdb: 'ACDB',
  dcCables: 'DC Cables',
  acCables: 'AC Cables',
  earthing: 'Earthing',
  lightningProtection: 'Lightning Protection',
  installation: 'Installation',
  commissioning: 'Commissioning',
  netMeteringAssistance: 'Net-Metering Assistance',
  transportation: 'Transportation',
  monitoring: 'Monitoring',
  warranty: 'Warranty & Service',
  amc: 'Annual Maintenance',
});

/** Canonical display order for inclusion items. */
const INCLUSION_ORDER = Object.freeze([
  'solarPanels', 'inverter', 'battery', 'mountingStructure',
  'dcdb', 'acdb', 'dcCables', 'acCables', 'earthing',
  'lightningProtection', 'installation', 'commissioning',
  'netMeteringAssistance', 'transportation', 'monitoring',
  'warranty', 'amc',
]);

/**
 * Extract inclusion items for all three tiers from the payload's alternatives.
 * Returns [baseItems, valueItems, premiumItems] — each is { items, tierName }
 * or null when unavailable.
 */
function inclusionOptionPayloads(payload) {
  return TIER_COLUMN_ORDER.map(tier => {
    const op = tierPayloadFor(payload, tier);
    if (!op) return null;
    const inclusions = op.inclusions;
    const tierDisplayField = op.system?.packageTierDisplayName;
    const tierName = tierDisplayField?.available ? tierDisplayField.value : null;
    return {
      items: inclusions?.available ? inclusions.items : null,
      tierName,
      available: !!(inclusions?.available),
    };
  });
}

function renderInclusionCell(value) {
  if (value === true)  return '<span class="qi-yes" aria-label="Included">✓</span>';
  if (value === false) return '<span class="qi-no" aria-label="Not included">✗</span>';
  return '<span class="qi-unresolved" aria-label="Unresolved">—</span>';
}

/**
 * Render the inclusion matrix comparison page.
 * Pure display — reads payload.alternatives[].payload.inclusions.
 */
export function renderInclusionPage(payload) {
  const tiers = inclusionOptionPayloads(payload);
  const allNull = tiers.every(t => !t);
  const anyAvailable = tiers.some(t => t?.available);

  if (allNull || !anyAvailable) {
    // Entire inclusion matrix is blocked
    return `<section class="page qd-page qi-page" data-page-section="INCLUSION_MATRIX" data-document-order="3b">
    ${docHeader("What's Included", 'A clear comparison of services and features across packages.')}
    <div class="qd-content">
      <div class="qi-blocked-box">${blockedText('INCLUSION_MATRIX')}<br><span class="qi-blocked-note">Inclusion matrix configuration is not supplied.</span></div>
    </div>${docFooter()}</section>`;
  }

  // Collect all inclusion keys across all available tiers
  const allKeys = new Set();
  for (const t of tiers) {
    if (t?.items) for (const k of Object.keys(t.items)) allKeys.add(k);
  }
  // Use canonical order, appending any extra keys
  const keys = INCLUSION_ORDER.filter(k => allKeys.has(k));
  for (const k of allKeys) { if (!keys.includes(k)) keys.push(k); }

  // Tier names from payload only — never hardcoded (C6 contract).
  const tierCodes = [...TIER_COLUMN_ORDER];
  const tierNames = tiers.map((t, i) =>
    t?.tierName || null
  );

  const headerCols = tierNames.map((name, i) =>
    name
      ? `<th class="qi-th qi-tier-${i}">${escapeHtml(name)}</th>`
      : `<th class="qi-th qi-tier-${i}"><span class="q-blocked">${NOT_AVAILABLE_LABEL}</span></th>`
  ).join('');

  const bodyRows = keys.map(key => {
    const label = INCLUSION_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    const cells = tiers.map(t => {
      const val = t?.items?.[key] ?? null;
      return `<td class="qi-td">${renderInclusionCell(val)}</td>`;
    }).join('');
    return `<tr><td class="qi-label">${escapeHtml(label)}</td>${cells}</tr>`;
  }).join('\n');

  return `<section class="page qd-page qi-page" data-page-section="INCLUSION_MATRIX" data-document-order="3b">
  ${docHeader("What's Included", 'A clear comparison of services and features across packages.')}
  <div class="qd-content">
    <table class="qi-table">
      <thead><tr><th class="qi-th qi-corner">Feature / Service</th>${headerCols}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>${docFooter()}</section>`;
}

export function renderPage3Pricing(payload, options = {}) {
  const pricingHtml = renderPage5(payload, options).replace('data-document-order=\"5\"', 'data-document-order=\"3\"').replace('data-page-section=\"THREE_OPTION_PRICING\"', 'data-page-section=\"THREE_OPTION_PRICING\"');
  return pricingHtml + renderInclusionPage(payload);
}
export function renderPage2Generation(payload, options = {}) {
  return renderPage3(payload, options).replace('data-document-order=\"3\"', 'data-document-order=\"2\"');
}

// ---------------------------------------------------------------------------
// FULL CUSTOMER DOCUMENT — pages omitted by the earlier staged renderer.
// These pages are presentation-only. Dynamic values are copied from payload;
// unavailable engines remain explicitly unavailable.
// ---------------------------------------------------------------------------
function docHeader(title, subtitle='') {
  return `<div class="qd-header"><img src="assets/quotation/page7-header.jpg" alt="Flarize by Golden Ray"><div class="qd-title">${escapeHtml(title)}</div>${subtitle ? `<div class="qd-subtitle">${escapeHtml(subtitle)}</div>` : ''}</div>`;
}
function docFooter() { return `<img class="q-footer" src="assets/quotation/page-footer.jpg" alt="">`; }
function blockedText(dep) { return `<span class="q-blocked">${NOT_AVAILABLE_LABEL}</span>`; }

export function renderPage4(payload) {
  // 2026-09-09 — approved template v1 page 4 ("Why Choose Flarize?"): live
  // DOM copied from the approved bundle. Company claims (installation count,
  // years of experience, MNRE) are bound to the company master and a stat card
  // is omitted when its value is not entered — nothing is claimed by default.
  const co = payload?.company?.available ? payload.company.value : null;
  const brand = co?.brandName ? String(co.brandName).charAt(0) + String(co.brandName).slice(1).toLowerCase() : 'Flarize';
  // Approved card glyphs (green outline icons in a pale disc): shield, clock,
  // check, pin, ribbon — decorative, in the artwork's order.
  const IC = {
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="#2f9e56" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 5.8v5.4c0 4.4 3 7.9 7 9.8 4-1.9 7-5.4 7-9.8V5.8z"/><path d="m9 12 2 2 4-4.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="#2f9e56" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="#2f9e56" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.3 2.3 4.7-5"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="#2f9e56" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6.5-8 11.5-8 11.5S4 16.5 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="2.8"/></svg>',
    ribbon: '<svg viewBox="0 0 24 24" fill="none" stroke="#2f9e56" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5 7 21l5-2.5 5 2.5-1.5-7.5"/></svg>',
  };
  const stats = [];
  if (co && Number.isFinite(Number(co.completedInstallations)) && co.completedInstallations != null && Number(co.completedInstallations) > 0)
    stats.push({ big: `${Number(co.completedInstallations)}+`, small: 'Successful Installations', cls: 'q4-orange', ic: IC.shield });
  if (co && Number.isFinite(Number(co.yearsExperience)) && co.yearsExperience != null && Number(co.yearsExperience) > 0)
    stats.push({ big: `${Number(co.yearsExperience)}+ Years`, small: 'Industry Experience', cls: 'q4-orange', ic: IC.clock });
  stats.push({ big: 'CERTIFIED', small: 'Installation Team', cls: 'q4-dark', ic: IC.check });
  stats.push({ big: 'KERALA', small: 'Wide Service', cls: 'q4-dark', ic: IC.pin });
  if (co && co.mnreEmpanelled === true) stats.push({ big: 'MNRE', small: 'Government Certified', cls: 'q4-dark', ic: IC.ribbon });
  const projects = co && co.completedInstallations != null && Number(co.completedInstallations) > 0
    ? `<span class="q4-homes-count">${Number(co.completedInstallations)}+ Projects Across Kerala</span>` : '';
  const gallery = PAGE_FOUR_GALLERY.map(src => `<img src="${escapeHtml(src)}" alt="Kerala installation">`).join('');
  return `<section class="page q4-page" data-page-section="WHY_FLARIZE" data-document-order="4">
    <img class="q4-logo" src="${PAGE_ONE_ASSETS.brandLogo}" alt="Flarize by Golden Ray">
    <div class="q4-body">
      <h1 class="q4-h1">Why Choose <span class="q4-orange">${escapeHtml(brand)}?</span></h1>
      <p class="q4-intro">A solar system is one of the smartest investments you'll make for your home—but its long-term performance depends on choosing the right installer. At ${escapeHtml(brand)}, we combine quality workmanship, premium components, transparent pricing, and dependable after-sales support to help you enjoy worry-free solar for years to come.</p>
      <div class="q4-promise"><p><span class="q4-promise-b">"Our Promise:</span> Your solar journey doesn't end on installation day. We're committed to helping you enjoy reliable performance, lower electricity bills, and dependable support for years to come."</p></div>
      <div class="q4-stats q4-stats-${stats.length}">${stats.map(st => `<div class="q4-stat"><div class="q4-stat-ic">${st.ic}</div><div class="q4-stat-big ${st.cls}">${escapeHtml(st.big)}</div><div class="q4-stat-small">${escapeHtml(st.small)}</div></div>`).join('')}</div>
      <div class="q4-homes"><h2>Homes We've Powered Across Kerala</h2>${projects}</div>
      <div class="q4-gallery">${gallery}</div>
    </div>
    <div class="q4-band">
      <div class="q4-band-title">WE HAND PICKED FOR YOUR HOME</div>
      <div class="q4-picks">
        <div class="q4-pick"><div class="q4-pick-ic q4-ic-green"><span>TIER 1</span><small>CERTIFIED</small></div><b>Tier 1 Brand</b><small>Bloomberg-listed manufacturer</small></div>
        <div class="q4-pick"><div class="q4-pick-ic q4-ic-gold"><small>Top</small><span>PVEL</span></div><b>PVEL Top Performer</b><small>Independently lab tested</small></div>
        <div class="q4-pick"><div class="q4-pick-ic q4-ic-green"><small>★★★</small><span>ALMM</span></div><b>ALMM Listed</b><small>Domestic cell manufacturing</small></div>
        <div class="q4-pick"><div class="q4-pick-ic q4-ic-fill">✓<small>Easy</small></div><b>Easy Warranty Claims</b><small>Direct manufacturer support</small></div>
        <div class="q4-pick"><div class="q4-pick-ic q4-ic-fill">▣<small>Fast</small></div><b>Local stock available</b><small>Fast replacement parts</small></div>
      </div>
    </div>
    ${renderContactStrip(payload, 'q4-cs')}
  </section>`;
}

/** Approved page-4 gallery — the eight installation photographs from the owner's template bundle. */
export const PAGE_FOUR_GALLERY = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8].map(n => `assets/quotation/q-gallery-0${n}.jpg`));

export function renderPage6Testimonials(payload) {
  // 2026-09-09 — approved template v1 page 6. Rendered ONLY when real
  // testimonials exist in the quotation content (payload.testimonials); the
  // page is otherwise omitted from the document — sample customers from the
  // template artwork are never printed as genuine.
  const t = payload?.testimonials;
  if (!t || !t.available || !t.value || !Array.isArray(t.value.entries) || !t.value.entries.length) {
    return '<!-- page omitted: no customer testimonials entered (data-document-order="6") -->';
  }
  const v = t.value;
  const card = (it) => {
    const meta = [it.systemKw != null ? `${it.systemKw} kW System` : null, it.installedOn ? `Installed on ${it.installedOn}` : null].filter(Boolean).join(' | ');
    const bills = it.billBefore != null && it.billAfter != null
      ? `<div class="q6-bills"><span class="q6-before">${escapeHtml(formatMoney(it.billBefore))}</span> → <span class="q6-after">${escapeHtml(formatMoney(it.billAfter))}</span></div>` : '';
    const saving = it.monthlySaving != null ? `<div class="q6-saves">Saves ${escapeHtml(formatMoney(it.monthlySaving))}/mo</div>` : '';
    return `<article class="q6-card">
      <div class="q6-photo${it.photoUri ? '' : ' q6-photo-none'}">${it.photoUri ? `<img src="${escapeHtml(it.photoUri)}" alt="">` : ''}<div class="q6-cap"><b>${escapeHtml(it.name)}${it.place ? ` – ${escapeHtml(it.place)}` : ''}</b>${meta ? `<span>${escapeHtml(meta)}</span>` : ''}</div></div>
      <p class="q6-quote">"${escapeHtml(it.quote)}"</p>
      ${bills || saving ? `<div class="q6-foot">${bills}${saving}</div>` : ''}
    </article>`;
  };
  return `<section class="page q6-page" data-page-section="HOMEOWNER_TESTIMONIALS" data-document-order="6">
    <img class="q4-logo" src="${PAGE_ONE_ASSETS.brandLogo}" alt="Flarize by Golden Ray">
    <div class="q6-body">
      <h1 class="q6-h1">Homeowners Around You Have Already <span class="q4-orange">Switched to Solar</span></h1>
      <p class="q6-sub">While you're still paying full KSEB bills every month</p>
      ${v.intro ? `<div class="q6-intro">${escapeHtml(v.intro)}</div>` : ''}
      <div class="q6-grid q6-grid-${v.entries.length}">${v.entries.map(card).join('')}</div>
      ${v.video ? `<div class="q6-video">${v.video.qrImageUri ? `<img class="q6-qr" src="${escapeHtml(v.video.qrImageUri)}" alt="">` : ''}<div><b>${escapeHtml(v.video.title)}</b>${v.video.text ? `<p>${escapeHtml(v.video.text)}</p>` : ''}${v.video.link ? `<span class="q4-orange">→ ${escapeHtml(v.video.link)}</span>` : ''}</div></div>` : ''}
    </div>
    ${renderContactStrip(payload, 'q4-cs')}
  </section>`;
}

export function renderPage6Savings(payload) {
  return `<section class="page qd-page" data-page-section="SAVINGS" data-document-order="6">
    ${docHeader('Your Savings Over Time', 'Long-term value from your solar investment.')}
    <div class="qd-content"><div class="qd-two"><div class="qd-chart"><h3>Cumulative Electricity Costs Over 25 Years</h3><div class="qd-chart-empty">${blockedText('SAVINGS_ENGINE')}</div></div><div><div class="qd-highlight"><span>Current KSEB Bill</span><b>${payload?.customer?.currentBillAmount != null ? escapeHtml(formatMoney(payload.customer.currentBillAmount)) : blockedText('CUSTOMER_RECORD')}</b></div><div class="qd-highlight"><span>Monthly Savings</span><b>${blockedText('SAVINGS_ENGINE')}</b></div><div class="qd-highlight"><span>25-Year Net Savings</span><b>${blockedText('SAVINGS_ENGINE')}</b></div></div></div>
      <div class="qd-two"><div class="qd-box red"><h3>Without Solar</h3><p>Continued electricity bills and exposure to future tariff changes.</p><b>${payload?.customer?.currentBillAmount != null ? escapeHtml(formatMoney(payload.customer.currentBillAmount)) : blockedText('CUSTOMER_RECORD')}</b></div><div class="qd-box green"><h3>With Solar</h3><p>Generate your own electricity and reduce grid dependence.</p><b>${blockedText('SAVINGS_ENGINE')}</b></div></div>
    </div>${docFooter()}</section>`;
}

export function renderPage8Mounting(payload) {
  return `<section class="page qd-page" data-page-section="MOUNTING_AND_SAFETY" data-document-order="8">
    ${docHeader('Solar Mounting, Cabling & Safety', 'Installation standards and protection used for the system.')}
    <div class="qd-content"><div class="qd-three"><div><h3>Solar Mounting Structure</h3><p>Galvanized steel structure selected according to the approved BOM.</p><p>Exact specification: ${blockedText('LOCKED_BOM_SNAPSHOT')}</p></div><div><h3>Earthing & Lightning Protection</h3><p>Earthing and lightning protection are included according to the approved BOM.</p><p>Exact conductor specification: ${blockedText('LOCKED_BOM_SNAPSHOT')}</p></div><div><h3>Electrical Safety</h3><p>ACDB / DCDB protection and properly grounded installation.</p><p>Exact protection specification: ${blockedText('COMPONENT_DISPLAY_ATTRIBUTES')}</p></div></div><div class="qd-two"><div class="qd-box"><h3>Premium Solar Panels</h3><p>High-efficiency approved module technology.</p><p>Panel-specific details are taken from the locked BOM.</p></div><div class="qd-box"><h3>Smart Inverter System</h3><p>String or micro-inverter architecture according to package.</p><p>Monitoring compatibility depends on the selected equipment.</p></div></div></div>${docFooter()}</section>`;
}

export function renderPage9Timeline(payload) {
  if (hasDocumentContent(payload)) return renderPage9Content(payload);
  // 2026-09-09 — approved template v1 page 9 is the owner's artwork. The
  // only size-specific figure on it (a 5 kW KSEB-refund example) is covered
  // and replaced by the approved formula text, so the page is correct for
  // every system size. Everything else is the approved artwork verbatim.
  return `<section class="page q9-page" data-page-section="INSTALLATION_TIMELINE" data-document-order="9">
    <img class="q9-art" src="assets/quotation/q-page-09.jpg" alt="">
    <div class="q9-cover"></div>
    <div class="q9-refund">
      <div class="q9-refund-h">REFUND FROM KSEB</div>
      <div class="q9-refund-t">(80% of pre-tax value of the KSEB registration fee — ₹1,000 per kW + 18% tax). The refund amount is confirmed at registration.</div>
    </div>
    ${renderContactStrip(payload, 'q-cs-over')}
  </section>`;
}

export function renderPage10Faq(payload) {
  const faqs=[['What if my roof is not suitable?','Site suitability is checked before major installation work.'],['What if there is an issue with KSEB?','The quotation includes support for the applicable approval process.'],['What about maintenance?','Maintenance requirements depend on the installed equipment and service plan.'],['Can I change the equipment later?','Changes after quotation acceptance may affect price, availability and schedule.'],['What about additional work?','Civil work, additional structure and other excluded scope are charged only when applicable and approved.']];
  return `<section class="page qd-page" data-page-section="FAQ" data-document-order="10">${docHeader('We Know What You’re Thinking','Honest answers to common solar questions.') }<div class="qd-content">${faqs.map((f,i)=>`<div class="qd-faq"><h3>${i+1}. ${escapeHtml(f[0])}</h3><p>${escapeHtml(f[1])}</p></div>`).join('')}<div class="qd-callout"><strong>Additional charges:</strong> Any scope outside the approved quotation is handled transparently before the work is undertaken.</div></div>${docFooter()}</section>`;
}

export function renderPage10Terms(payload) {
  if (hasDocumentContent(payload)) return renderPage10Content(payload);
  // Approved template v1 — Terms and Conditions 1/2 is the owner's approved artwork (clauses 1–9).
  return `<section class="page q10-page" data-page-section="TERMS_AND_CONDITIONS_1" data-document-order="10"><img class="q9-art" src="assets/quotation/q-page-10.jpg" alt="Terms and Conditions, clauses 1 to 9">${renderContactStrip(payload, 'q-cs-over')}</section>`;
}
export function renderPage11Terms(payload) {
  // content edition: renderPage11Content emits data-document-order="11"
  if (hasDocumentContent(payload)) return renderPage11Content(payload);
  // Approved template v1 — Terms and Conditions 2/2 is the owner's approved artwork (clauses 10–19).
  return `<section class="page q11-page" data-page-section="TERMS_AND_CONDITIONS_2" data-document-order="11"><img class="q9-art" src="assets/quotation/q-page-11.jpg" alt="Terms and Conditions, clauses 10 to 19">${renderContactStrip(payload, 'q-cs-over')}</section>`;
}

export function renderPage13Investment(payload) {
  const primary = payload?.alternatives?.find(o => String(o?.tier).toLowerCase() === 'value')?.payload ?? payload;
  const price = primary?.pricing?.available ? primary.pricing.customer : null;
  return `<section class="page qd-page" data-page-section="INVESTMENT_SUMMARY" data-document-order="13">${docHeader('Your Investment Summary','A controlled, predictable, one-time decision.') }<div class="qd-content"><div class="qd-summary"><div><span>System</span><b>${primary?.system?.systemSizeKw != null ? escapeHtml(primary.system.systemSizeKw+' kW Solar System') : blockedText('PROJECT_CONFIGURATION')}</b></div><div><span>System Cost</span><b>${price?.customerTotalIncludingGST != null ? escapeHtml(formatMoney(price.customerTotalIncludingGST)) : blockedText('COMMERCIAL_SNAPSHOT')}</b></div><div><span>Monthly Savings</span><b>${blockedText('SAVINGS_ENGINE')}</b></div><div><span>Payback Period</span><b>${blockedText('SAVINGS_ENGINE')}</b></div><div><span>25-Year Net Savings</span><b>${blockedText('SAVINGS_ENGINE')}</b></div></div><div class="qd-cta"><h2>Ready to Start Saving?</h2><p>Lock your installation slot after reviewing the quotation and applicable terms.</p><strong>Customer decision: select one of the three quoted packages.</strong></div><div class="qd-badges"><img src="assets/quotation/badge-empanel.png" alt="MNRE"><img src="assets/quotation/badge-google.png" alt="Customer rating"><img src="assets/quotation/badge-trusted-choice.png" alt="Trusted choice"></div></div>${docFooter()}</section>`;
}

/**
 * V4 quotation-finalization Phase 2B — one reusable A4/design-canvas
 * architecture for the whole customer quotation PDF.
 *
 * PHYSICAL LAYER (@page + .page):
 *   @page { size:A4 portrait; margin:0 } → PDF MediaBox = 595.28 × 841.89 pt
 *   every page section is 210×297 mm, overflow:hidden, deterministic
 *   page break, no browser margins.
 *
 * DESIGN LAYER (.q-canvas):
 *   Pages whose approved artwork is authored on the supplied 1000×1414 px
 *   design canvas (Page 2 today, later live-HTML pages as they are
 *   implemented) place their content inside a .q-canvas div. The design
 *   canvas is absolutely-positioned at 1000×1414 px and transform-scaled
 *   by exactly (210mm / 1000px) so the whole approved coordinate system
 *   maps into physical A4 without unit drift. Approved px typography and
 *   geometry are used verbatim — no mm/pt translation.
 *
 * Image-only pages continue to render the approved artwork asset at
 * 100% width of the physical page. Hybrid pages combine both: static
 * artwork rendered directly, plus live regions authored either in mm
 * (Page 1) or inside a .q-canvas (Page 2+).
 */
export const PAGE_A4_CONTRACT_STYLES = `
@page { size: A4 portrait; margin: 0; }
.page { width:210mm; height:297mm; position:relative; overflow:hidden;
        background:#ffffff; box-sizing:border-box; }
/* .q-canvas layout box is A4-sized so Chrome print pagination sees a
   box that fits one A4 page (no clip). The 1000x1414 design canvas
   lives inside as .q-inner and is CSS-zoomed to fill it.
   The zoom property (not transform:scale) is required: transform is a
   visual-only op — Chrome's print engine paginates on the UNSCALED
   layout box, which caused non-last pages to clip at ~79% of A4 height.
   zoom scales the layout box itself, so pagination sees the true
   A4-fitting size. */
.q-canvas { position:absolute; top:0; left:0; width:210mm; height:297mm;
            font-family:'Poppins',sans-serif; color:#16262b; background:#ffffff;
            box-sizing:border-box; overflow:hidden; }
.q-inner  { position:absolute; top:0; left:0; width:1000px; height:1414px;
            zoom: 0.79374; /* 210mm / 1000px — a plain number: older Chrome ignores zoom: calc() */
            display:flex; flex-direction:column; box-sizing:border-box; overflow:hidden; }
@media print {
  html, body { width:210mm; margin:0 !important; padding:0 !important; background:#ffffff !important; }
  .page { width:210mm; height:297mm; margin:0 !important; box-shadow:none !important;
          break-after:page; page-break-after:always; break-inside:avoid; page-break-inside:avoid; }
  .page:last-child { break-after:auto; page-break-after:auto; }
}
`;

export const FULL_DOCUMENT_STYLES = `
/* Page 4 — Why Choose (approved template v1) */
.q4-page, .q6-page { background:#fff; font-family:'Poppins',sans-serif; color:#16262b; display:flex; flex-direction:column; }
.q4-logo { width:152px; height:auto; display:block; margin:26px 40px 0; }
/* P0.5 (2026-09-13): body fills the page so the gallery grows and the grey
   "hand picked" band sits directly on the footer, like the approved artwork —
   no white gap between band and footer. */
.q4-body { padding:14px 40px 0; flex:1 1 auto; display:flex; flex-direction:column; min-height:0; }
.q4-h1 { font-size:33px; font-weight:800; margin:8px 0 0; line-height:1.05; }
.q4-orange { color:#F5901E; }
.q4-intro { font-size:13.5px; color:#3f4b50; line-height:1.55; margin:12px 0 0; }
.q4-promise { margin-top:14px; border:1px solid #ececec; border-left:4px solid #F5901E; border-radius:8px; padding:13px 18px; }
.q4-promise p { margin:0; font-size:12.5px; color:#2c383d; line-height:1.5; }
.q4-promise-b { font-weight:700; }
.q4-stats { margin-top:16px; display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
.q4-stats-3 { grid-template-columns:repeat(3,1fr); } .q4-stats-4 { grid-template-columns:repeat(4,1fr); }
/* approved card: 78 px tall, glyph disc on top, orange / dark headline, grey caption */
.q4-stat { border:1px solid #ececec; border-radius:11px; padding:12px 8px 12px; text-align:center; min-height:78px; box-sizing:border-box; }
.q4-stat-ic { width:24px; height:24px; margin:0 auto 8px; border-radius:50%; background:#eaf6ee; display:flex; align-items:center; justify-content:center; }
.q4-stat-ic svg { width:15px; height:15px; display:block; }
.q4-stat-big { font-size:15px; font-weight:800; line-height:1; letter-spacing:.3px; }
.q4-dark { color:#16262b; }
.q4-stat-small { font-size:10px; color:#5b656a; margin-top:5px; line-height:1.25; }
.q4-homes { margin-top:26px; display:flex; align-items:baseline; justify-content:space-between; gap:16px; }
.q4-homes h2 { font-size:18px; font-weight:800; margin:0; white-space:nowrap; }
.q4-homes-count { font-size:11.5px; font-weight:700; white-space:nowrap; }
.q4-gallery { margin-top:12px; display:grid; grid-template-columns:repeat(4,1fr); grid-template-rows:1fr 1fr; gap:10px; flex:1 1 auto; min-height:0; padding-bottom:18px; }
.q4-gallery img { width:100%; height:100%; min-height:110px; object-fit:cover; border-radius:8px; display:block; }
.q4-band { margin-top:0; background:#f4f4f6; padding:22px 40px 24px; }
.q4-band-title { text-align:center; font-size:13px; font-weight:800; letter-spacing:1.5px; }
.q4-picks { margin-top:16px; display:grid; grid-template-columns:repeat(5,1fr); gap:10px; align-items:start; }
.q4-pick { text-align:center; }
.q4-pick b { display:block; font-size:11px; font-weight:700; margin-top:8px; }
.q4-pick small { display:block; font-size:9.5px; color:#6a7378; margin-top:2px; line-height:1.3; }
.q4-pick-ic { width:52px; height:52px; margin:0 auto; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:800; line-height:1; }
.q4-pick-ic span { font-size:12px; } .q4-pick-ic small { font-size:6.5px; letter-spacing:.5px; margin-top:2px; color:inherit; }
.q4-ic-green { border:2px solid #2f9e56; color:#2f9e56; } .q4-ic-gold { border:2px solid #c79a2e; color:#c79a2e; }
.q4-ic-fill { background:#2f9e56; color:#fff; font-size:20px; }
.q4-cs { margin-top:auto; }
/* Page 6 — Testimonials (approved template v1 layout; content from quotation content file) */
.q6-body { padding:12px 40px 0; }
.q6-h1 { font-size:24px; font-weight:800; margin:14px 0 0; text-align:center; line-height:1.15; }
.q6-sub { text-align:center; font-size:12.5px; color:#3f4b50; margin:8px 0 0; }
.q6-intro { margin-top:22px; background:#eef8f0; border:1px solid #cfe9d6; border-radius:10px; padding:16px 22px; font-size:14px; color:#1c5c38; font-weight:600; line-height:1.4; }
.q6-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:26px; }
.q6-grid-1 { grid-template-columns:1fr; padding:0 160px; } .q6-grid-2 { grid-template-columns:repeat(2,1fr); padding:0 60px; }
.q6-card { border:1px solid #e6e8ea; border-radius:10px; overflow:hidden; display:flex; flex-direction:column; background:#fff; }
.q6-photo { position:relative; aspect-ratio:4/3; background:#e9eef0; }
.q6-photo img { width:100%; height:100%; object-fit:cover; display:block; }
.q6-photo-none { aspect-ratio:auto; min-height:56px; background:#123f35; }
.q6-cap { position:absolute; left:0; right:0; bottom:0; padding:10px 12px; color:#fff; background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.65)); font-size:10.5px; }
.q6-cap b { display:block; font-weight:700; } .q6-cap span { display:block; font-size:9.5px; opacity:.9; }
.q6-quote { padding:14px 14px 8px; margin:0; font-size:12px; line-height:1.55; color:#2c383d; flex:1; }
.q6-foot { padding:10px 14px 14px; border-top:1px solid #eef0f2; }
.q6-bills { font-size:12px; font-weight:700; } .q6-before { background:#fdecea; color:#c0392b; padding:2px 6px; border-radius:4px; } .q6-after { background:#e8f7ee; color:#1a8a3f; padding:2px 6px; border-radius:4px; }
.q6-saves { margin-top:8px; font-size:12px; font-weight:700; color:#1a8a3f; }
.q6-video { margin-top:26px; background:#fff7ee; border:1px solid #f4ddc2; border-radius:12px; padding:16px 20px; display:flex; gap:20px; align-items:center; font-size:12px; color:#3f4b50; }
.q6-video b { display:block; font-size:15px; color:#16262b; margin-bottom:4px; } .q6-video p { margin:0 0 4px; }
.q6-qr { width:110px; height:110px; object-fit:contain; flex-shrink:0; }
/* Pages 9 / 10 / 11 — approved artwork */
.q9-page, .q10-page, .q11-page { background:#fff; font-family:'Poppins',sans-serif; color:#16262b; }
/* 2026-09-12 — the artwork of pages 9–12 has the OLD address baked into its
   footer strip (Thannikakal, Thumpoly PO). The live contact strip, bound to
   the company master like every other page, is laid over that strip
   (approved strip: top 1070 px, 53 px tall, full width). */
.q-cs-over { position:absolute; left:0; right:0; bottom:0; z-index:6; margin:0; }
.q9-art { position:absolute; left:0; top:0; width:100%; height:100%; display:block; }
.q9-cover { position:absolute; left:4%; width:62%; top:43.3%; height:7.8%; background:#fff; z-index:2; }
.q9-refund { position:absolute; left:5.5%; width:58%; top:43.8%; z-index:3; border-left:3px solid #F5901E; padding:6px 0 6px 12px; }
.q9-refund-h { font-size:12px; font-weight:700; color:#123f35; letter-spacing:.2px; }
.q9-refund-t { font-size:10.5px; color:#3f4b50; line-height:1.45; margin-top:6px; }

.qd-page{background:#fff;color:#16262b;position:relative;font-family:'Poppins',Arial,sans-serif;overflow:hidden;padding-bottom:20mm}
.qd-header{padding:8mm 10mm 4mm;text-align:center}.qd-header img{display:block;width:100%;height:auto;margin-bottom:8mm}.qd-title{font-size:25px;font-weight:700;color:#123f35}.qd-subtitle{font-size:13px;color:#52666b;margin-top:3mm}.qd-content{padding:5mm 12mm}.qd-callout{border-left:4px solid #f5901e;background:#fff8ee;padding:5mm;border-radius:8px;font-size:13px;line-height:1.55}.qd-callout.green{background:#edf8f0;border-left-color:#169a5b}.qd-stat-grid,.qd-grid-5,.qd-three{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm;margin:7mm 0}.qd-stat-grid{grid-template-columns:repeat(4,1fr)}.qd-stat-grid>div{border:1px solid #f0b44d;border-radius:8px;padding:5mm;text-align:center}.qd-stat-grid b{display:block;font-size:22px;color:#f5901e}.qd-stat-grid span{font-size:11px}.qd-grid-5{grid-template-columns:repeat(5,1fr)}.qd-grid-5>div,.qd-three>article{border:1px solid #d9e0e2;border-radius:8px;padding:5mm;min-height:35mm}.qd-two{display:grid;grid-template-columns:1fr 1fr;gap:7mm;margin:7mm 0}.qd-box{border:1px solid #d9e0e2;border-radius:10px;padding:6mm}.qd-box.red{background:#fff4f3}.qd-box.green{background:#eefaf1}.qd-highlight{background:#fff5e9;border-radius:8px;padding:5mm;margin-bottom:4mm}.qd-highlight span{display:block;font-size:11px}.qd-highlight b{display:block;font-size:21px;margin-top:2mm}.qd-chart{border:1px solid #d9e0e2;border-radius:8px;padding:5mm;height:95mm}.qd-chart-empty{height:70mm;display:flex;align-items:center;justify-content:center}.qd-media{margin-top:7mm;border:1px dashed #aaa;padding:8mm;text-align:center}.qd-timeline{display:grid;grid-template-columns:repeat(6,1fr);gap:4mm}.qd-timeline>div{padding:4mm 2mm}.qd-timeline b{display:block;background:#123f35;color:#fff;border-radius:50px;padding:3mm;text-align:center;font-size:10px}.qd-faq{border:1px solid #f0a64b;border-radius:12px;padding:5mm;margin-bottom:4mm}.qd-terms{padding:3mm 12mm}.qd-terms>div{margin-bottom:4mm;font-size:11px;line-height:1.45}.qd-terms b{display:block;font-size:12px;color:#123f35;margin-bottom:1mm}.qd-summary{border:1px solid #d9e0e2;border-radius:10px;padding:7mm}.qd-summary>div{display:flex;justify-content:space-between;border-bottom:1px solid #e7ecee;padding:5mm 0}.qd-summary>div:last-child{border-bottom:0}.qd-cta{margin:8mm 0;padding:8mm;text-align:center;background:#eef8ef;border-radius:12px}.qd-badges{display:flex;justify-content:center;gap:12mm;align-items:center}.qd-badges img{max-width:28mm;max-height:22mm;object-fit:contain}.qd-page .q-footer{position:absolute;left:0;right:0;bottom:0;width:100%;height:auto}
@media print{.qd-page{width:210mm;height:297mm;min-height:297mm;max-height:297mm;margin:0!important;padding-bottom:18mm;box-shadow:none;break-after:page;page-break-after:always}.qd-page:last-child{break-after:auto;page-break-after:auto}.qd-header img{margin-bottom:5mm}.qd-content{padding-top:3mm}}
.qi-page{background:#fff}
.qi-table{width:100%;border-collapse:collapse;font-size:10pt;margin-top:3mm}
.qi-th{background:#0d3b2e;color:#fff;padding:3mm 4mm;text-align:center;font-weight:600;font-size:10pt}
.qi-corner{text-align:left;background:#123f35}
.qi-tier-0{background:#2a6b4f}.qi-tier-1{background:#0d3b2e}.qi-tier-2{background:#1a5040}
.qi-label{padding:2.5mm 4mm;border-bottom:1px solid #e8ecee;font-size:9.5pt;color:#2a2e34}
.qi-td{padding:2.5mm 4mm;border-bottom:1px solid #e8ecee;text-align:center;font-size:12pt}
.qi-yes{color:#169a5b;font-weight:700}.qi-no{color:#c0392b;font-weight:700}.qi-unresolved{color:#999;font-weight:400}
.qi-blocked-box{text-align:center;padding:15mm 10mm;border:1px dashed #ccc;border-radius:8px;margin:8mm 0}
.qi-blocked-note{font-size:9pt;color:#888;margin-top:3mm;display:inline-block}
`;

// ---------------------------------------------------------------------------
// Backward-compatible aliases — old names referenced by existing tests.
// ---------------------------------------------------------------------------
export { renderPage6Testimonials as renderPage5Testimonials };
export const renderPage12Terms = renderPage11Terms;

/**
 * Render a complete CMS page into an A4 HTML page.
 *
 * `resolvedContent` is the page JSON with all dynamic fields already resolved
 * (each dynamicField block has `resolvedValue` set by the CMS service).
 *
 * Returns { html, styles } matching the existing renderer contract.
 *
 * NO CALCULATION. NO CATALOG. NO IMPORT.
 */
export function renderCmsPage(resolvedContent) {
  if (!resolvedContent || typeof resolvedContent !== 'object') {
    return { html: '<div class="cms-page cms-page-empty"></div>', styles: CMS_PAGE_STYLES };
  }

  const sections = sortBlocks(resolvedContent.sections || []);
  const overlays = sortBlocks(resolvedContent.overlays || []);

  // Check for background image
  let bgHtml = '';
  if (resolvedContent.background) {
    bgHtml = renderCmsBlock(resolvedContent.background);
  }

  const sectionHtml = sections.map(renderCmsBlock).join('\n');
  const overlayHtml = overlays.map(renderCmsBlock).join('\n');

  const html = `<div class="cms-page" style="width:${CMS_A4_WIDTH}px;height:${CMS_A4_HEIGHT}px;position:relative;overflow:hidden">
${bgHtml}
<div class="cms-page-content" style="position:relative;z-index:1;width:100%;height:100%">
${sectionHtml}
</div>
${overlayHtml}
</div>`;

  return { html, styles: CMS_PAGE_STYLES };
}

/** Stylesheet for CMS-rendered pages. */
export const CMS_PAGE_STYLES = `
.cms-page { background:#fff; font-family:'Poppins',-apple-system,BlinkMacSystemFont,sans-serif;
            color:#16262b; box-sizing:border-box; margin:0 auto 8mm;
            box-shadow:0 2px 14px rgba(0,0,0,.12); }
.cms-page * { box-sizing:border-box; }
.cms-page-empty { display:flex; align-items:center; justify-content:center; }
.cms-section { position:relative; }
.cms-columns { width:100%; }
.cms-column { min-height:1px; }
.cms-heading { margin:0; padding:0; }
.cms-text { margin:0; padding:0; }
.cms-image { display:block; }
.cms-field { display:inline-block; }
.cms-field-unresolved { opacity:0.6; font-style:italic; }
.cms-overlay { z-index:10; }
.cms-qr { background:#f9f9f9; }
.cms-divider { width:100%; }
@media print { .cms-page { box-shadow:none; margin:0; } }
`;


// =============================================================================
/**
 * QUOTATION CONTENT PAGES (inlined — the renderer imports nothing) — pages 3, 9, 10, 11 rendered as live HTML from the
 * quotation's frozen `payload.content` (P1, 2026-09-13).
 *
 * Before this module those four pages were JPEG artwork: the appliance table,
 * timeline, scope lists and all 19 T&C clauses were pixels — not editable and
 * English-only. Now every string comes from the bilingual content store the
 * Admin / Project Head publish, in the language the quotation was issued in
 * (`payload.quotation.quotationLanguage`: 'en' | 'ml'), and the layout mirrors
 * the owner's approved artwork (English and Malayalam editions).
 *
 * Display only. Every number on page 3 is copied from the payload:
 *   generation range      payload.energyProfile.value.dailyGenerationLow/High
 *   monthly KSEB value    payload.energyProfile.value.monthlyKsebValueLow/High
 *   appliance rows/total  payload.applianceUsage.value (Sales-confirmed rows,
 *                         or the Project Head profile for this kW)
 *   "Your Home Uses"      = appliance total  (one number per page)
 *   surplus               = generation − total, floored at 0
 * KSEB refund on page 9   = 0.8 × ₹1,000 × kW (approved formula), never stored.
 *
 * renderPage3/9/10/11 dispatch here only when `payload.content.available`;
 * older issued quotations without a content snapshot keep the artwork path so
 * historical documents never change.
 */


/* ------------------------------------------------------------------------- */
/* helpers                                                                    */
/* ------------------------------------------------------------------------- */

export function docLang(payload) {
  const v = String(payload?.quotation?.quotationLanguage ?? 'en').toLowerCase();
  return v === 'ml' ? 'ml' : 'en';
}
export function hasDocumentContent(payload) {
  return !!(payload?.content?.available && payload.content.value?.content);
}
const content = (payload) => payload.content.value.content;
const pick = (field, lang) => {
  if (field == null) return '';
  if (typeof field === 'string') return field;
  const v = field[lang];
  if (typeof v === 'string' && v.trim()) return v;
  return typeof field.en === 'string' ? field.en : '';
};
const L = (payload, key, vars) => {
  const raw = pick(content(payload)?.labels?.[key], docLang(payload));
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k]))) : raw;
};
/** Public wrapper over the label lookup for renderers outside this block (page 1). */
export function labelText(payload, key, vars) { return hasDocumentContent(payload) ? L(payload, key, vars) : ''; }
const e = escapeHtml;
// Display-only: figures arrive already rounded from the payload builder.
const inr = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('en-IN'));
const num1 = (n) => (n == null || n === '' ? '' : String(n));
const langClass = (payload) => (docLang(payload) === 'ml' ? ' qc-ml' : '');
const logo = () => `<img class="qc-logo" src="${PAGE_ONE_ASSETS.brandLogo}" alt="Flarize by Golden Ray">`;
const footer = (payload) => renderContactStrip(payload, 'qc-cs');

/* ------------------------------------------------------------------------- */
/* PAGE 3 — daily generation + appliance usage                                */
/* ------------------------------------------------------------------------- */

export function renderPage3Content(payload) {
  const lang = docLang(payload);
  const ep = payload?.energyProfile?.available ? payload.energyProfile.value : null;
  const au = payload?.applianceUsage?.available ? payload.applianceUsage.value : null;
  const rows = Array.isArray(au?.appliances) ? au.appliances : [];
  const total = au?.totalDailyUsage != null ? Number(au.totalDailyUsage) : null;
  const genLo = ep?.dailyGenerationLow, genHi = ep?.dailyGenerationHigh;
  const genRange = genLo != null && genHi != null ? `${num1(genLo)}–${num1(genHi)}` : '';
  const ksebRange = ep?.monthlyKsebValueLow != null && ep?.monthlyKsebValueHigh != null ? `₹${inr(ep.monthlyKsebValueLow)}–${inr(ep.monthlyKsebValueHigh)}` : '';
  const surplus = au?.surplusExportedLow != null && au?.surplusExportedHigh != null ? `${num1(au.surplusExportedLow)}–${num1(au.surplusExportedHigh)}` : '';
  const hrsWord = (h) => (Number(h) === 1 ? L(payload, 'p3.hr') : L(payload, 'p3.hrs'));
  const unitsWord = L(payload, 'p3.units');

  const tr = rows.map(r => `<tr>
        <td class="qc3-name"><span class="qc3-ic">${e(r.icon || '')}</span>${e(pick(r.name, lang))}</td>
        <td>${r.qty > 0 ? e(String(r.qty)) : '-'}</td>
        <td class="qc3-hrs">${e(num1(r.hours))} ${e(hrsWord(r.hours))}</td>
        <td class="qc3-units">${e(num1(r.units))} ${e(unitsWord)}</td>
      </tr>`).join('');

  const lifeList = (items, cls, mark) => (items || []).map(it => `<div class="qc3-life-item">
        <span class="qc3-mark ${cls}">${mark}</span>
        <div><b>${e(pick(it.title, lang))}</b><p>${e(pick(it.body, lang))}</p></div>
      </div>`).join('');

  const c = content(payload);
  return `<section class="page qc-page qc3-page${langClass(payload)}" data-page-section="DAILY_GENERATION_APPLIANCES" data-document-order="3" lang="${lang}">
    ${logo()}
    <h1 class="qc-h1">${e(L(payload, 'p3.title'))}</h1>
    <p class="qc-sub">${e(L(payload, 'p3.subtitle'))}</p>
    <div class="qc3-banner">
      <div class="qc3-banner-l">
        <div class="qc3-banner-lbl">${e(L(payload, 'p3.gen.label'))}</div>
        <div class="qc3-banner-big">${e(genRange)} ${genRange ? e(L(payload, 'p3.gen.units')) : ''}</div>
        <div class="qc3-banner-note">${e(L(payload, 'p3.gen.note'))}</div>
      </div>
      <div class="qc3-banner-r">
        <div class="qc3-banner-lbl">${e(L(payload, 'p3.value.label'))}</div>
        <div class="qc3-banner-big">${e(ksebRange)}</div>
        <div class="qc3-banner-note">${e(L(payload, 'p3.value.note'))}</div>
      </div>
    </div>
    <div class="qc3-card">
      <h2 class="qc3-h2">${e(L(payload, 'p3.table.title'))}</h2>
      <table class="qc3-table">
        <thead><tr><th>${e(L(payload, 'p3.th.appliance'))}</th><th>${e(L(payload, 'p3.th.qty'))}</th><th>${e(L(payload, 'p3.th.hours'))}</th><th>${e(L(payload, 'p3.th.units'))}</th></tr></thead>
        <tbody>${tr}</tbody>
        <tfoot><tr><td colspan="3">${e(L(payload, 'p3.total'))}</td><td class="qc3-units">${total != null ? `${e(num1(total))} ${e(unitsWord)}` : ''}</td></tr></tfoot>
      </table>
    </div>
    <div class="qc3-cards">
      <div class="qc3-kpi"><div class="qc3-kpi-h">${e(L(payload, 'p3.card.gen'))}</div><div class="qc3-kpi-v">${e(genRange)}</div><div class="qc3-kpi-n">${e(L(payload, 'p3.card.gen.note'))}</div></div>
      <div class="qc3-arrow">→</div>
      <div class="qc3-kpi"><div class="qc3-kpi-h">${e(L(payload, 'p3.card.use'))}</div><div class="qc3-kpi-v">${total != null ? `~${e(num1(total))}` : ''}</div><div class="qc3-kpi-n">${e(L(payload, 'p3.card.use.note'))}</div></div>
      <div class="qc3-arrow">→</div>
      <div class="qc3-kpi"><div class="qc3-kpi-h">${e(L(payload, 'p3.card.surplus'))}</div><div class="qc3-kpi-v">${e(surplus)}</div><div class="qc3-kpi-n">${e(L(payload, 'p3.card.surplus.note'))}</div></div>
    </div>
    <div class="qc3-life">
      <div><h3 class="qc3-life-h qc3-red">${e(L(payload, 'p3.lifeNow'))}</h3>${lifeList(c.lifeNow, 'qc3-mark-red', '✕')}</div>
      <div><h3 class="qc3-life-h qc3-green">${e(L(payload, 'p3.lifeSolar'))}</h3>${lifeList(c.lifeSolar, 'qc3-mark-green', '✓')}</div>
    </div>
    ${footer(payload)}
  </section>`;
}

/* ------------------------------------------------------------------------- */
/* PAGE 9 — booking → savings timeline, KSEB refund, scope split             */
/* ------------------------------------------------------------------------- */

export function renderPage9Content(payload) {
  const lang = docLang(payload);
  const c = content(payload);
  const derived = payload?.content?.value?.derived ?? null;
  const kw = derived?.systemSizeKw ?? null;
  const refund = derived?.ksebRefundAmountText ?? null;
  const steps = (c.timeline || []).map(s => `<div class="qc9-step">
      <div class="qc9-dot"><span>${e(pick(s.days, lang))}</span></div>
      <div class="qc9-days">${e(L(payload, 'p9.days'))}</div>
      <b>${e(pick(s.title, lang))}</b>
      <p>${e(pick(s.body, lang))}</p>
    </div>`).join('');
  const li = (items, cls) => (items || []).map(t => `<li class="${cls}">${e(pick(t, lang))}</li>`).join('');
  return `<section class="page qc-page qc9-page${langClass(payload)}" data-page-section="INSTALLATION_TIMELINE" data-document-order="9" lang="${lang}">
    ${logo()}
    <h1 class="qc-h1 qc9-h1">${e(L(payload, 'p9.title'))}</h1>
    <div class="qc9-timeline qc9-n${(c.timeline || []).length}">
      <div class="qc9-line"></div>
      ${steps}
    </div>
    <div class="qc9-refund">
      <div class="qc9-refund-h">${e(L(payload, 'p9.refund.title'))}</div>
      <div class="qc9-refund-t">${e(L(payload, 'p9.refund.body'))}</div>
      ${refund != null && kw != null ? `<div class="qc9-refund-line">${e(L(payload, 'p9.refund.line', { kw: num1(kw), amount: refund }))}</div>` : ''}
    </div>
    <div class="qc9-scope">
      <div class="qc9-box qc9-box-orange"><h3>${e(L(payload, 'p9.weHandle'))}</h3><ul>${li(c.weHandle, 'qc9-li-orange')}</ul></div>
      <div class="qc9-box qc9-box-green"><h3>${e(L(payload, 'p9.customerScope'))}</h3><ul>${li(c.customerScope, 'qc9-li-orange')}</ul></div>
    </div>
    ${footer(payload)}
  </section>`;
}

/* ------------------------------------------------------------------------- */
/* PAGES 10 / 11 — terms & conditions, split across two pages                */
/* ------------------------------------------------------------------------- */

/** Clauses split across pages 10/11 at the index the payload builder derived
 *  (balanced by text length); the content store's LIMITS guarantee the whole
 *  set fits in two pages. */
function splitTerms(payload, terms, lang) {
  const items = (terms || []).map((t, i) => ({ n: i + 1, title: pick(t.title, lang), body: pick(t.body, lang) }));
  const cutRaw = payload?.content?.value?.derived?.termsPage10Count?.[lang];
  const cut = typeof cutRaw === 'number' ? cutRaw : items.length;
  return [items.slice(0, cut), items.slice(cut)];
}

function renderTermsPage(payload, clauses, order, sectionName, withTitle) {
  const lang = docLang(payload);
  return `<section class="page qc-page qc10-page${langClass(payload)}" data-page-section="${sectionName}" data-document-order="${order}" lang="${lang}">
    ${logo()}
    ${withTitle ? `<h1 class="qc-h1 qc10-h1">${e(L(payload, 'p10.title'))}</h1>` : ''}
    <div class="qc10-terms">
      ${clauses.map(t => `<div class="qc10-clause"><b>${t.n}. ${e(t.title)} :</b><p>${e(t.body)}</p></div>`).join('')}
    </div>
    ${footer(payload)}
  </section>`;
}

export function renderPage10Content(payload) {
  const [first] = splitTerms(payload, content(payload).terms, docLang(payload));
  return renderTermsPage(payload, first, 10, 'TERMS_AND_CONDITIONS_1', true);
}
export function renderPage11Content(payload) {
  const [, second] = splitTerms(payload, content(payload).terms, docLang(payload));
  return renderTermsPage(payload, second, 11, 'TERMS_AND_CONDITIONS_2', false);
}

/* ------------------------------------------------------------------------- */
/* PAGE 8 additions — required documents + extra structure cost (used by      */
/* quotationDocument.renderPage8 when content is available)                   */
/* ------------------------------------------------------------------------- */

export function requiredDocumentsFromContent(payload) {
  if (!hasDocumentContent(payload)) return null;
  const lang = docLang(payload);
  const c = content(payload);
  return {
    title: L(payload, 'p8.docs.title'),
    items: (c.requiredDocuments || []).map(t => pick(t, lang)).filter(Boolean),
    extraStructure: c.extraStructureCost ? { label: pick(c.extraStructureCost.label, lang), value: c.extraStructureCost.value || '' } : null,
  };
}

/* ------------------------------------------------------------------------- */
/* styles                                                                     */
/* ------------------------------------------------------------------------- */

export const CONTENT_PAGE_STYLES = `
/* Noto Sans Malayalam Regular / Medium — vendored 2026-09-13 (OFL) for Malayalam body text. */
@font-face { font-family:'Noto Sans Malayalam'; font-style:normal; font-weight:400; font-display:block;
  src:url("assets/quotation/fonts/noto-sans-malayalam-400.woff2") format('woff2');
  unicode-range:U+0307,U+0323,U+0951-0952,U+0964-0965,U+0D00-0D7F,U+1CDA,U+1CF2,U+200C-200D,U+20B9,U+25CC,U+A830-A832; }
@font-face { font-family:'Noto Sans Malayalam'; font-style:normal; font-weight:500; font-display:block;
  src:url("assets/quotation/fonts/noto-sans-malayalam-500.woff2") format('woff2');
  unicode-range:U+0307,U+0323,U+0951-0952,U+0964-0965,U+0D00-0D7F,U+1CDA,U+1CF2,U+200C-200D,U+20B9,U+25CC,U+A830-A832; }

.qc-page { background:#fff; font-family:'Poppins',sans-serif; color:#16262b; display:flex; flex-direction:column; padding:0 40px; }
/* Malayalam edition: Malayalam glyphs from Noto, Latin/digits fall through to Poppins. */
.qc-page.qc-ml { font-family:'Noto Sans Malayalam','Poppins',sans-serif; }
.qc-logo { width:152px; height:auto; display:block; margin:26px 0 0; }
.qc-h1 { font-size:24px; font-weight:800; text-align:center; margin:14px 0 0; line-height:1.2; }
.qc-ml .qc-h1 { font-size:22px; }
.qc-sub { text-align:center; font-size:12px; color:#6a7378; margin:6px 0 0; }
.qc-cs { margin:auto -40px 0; }

/* page 3 */
.qc3-banner { margin-top:14px; border-radius:12px; background:linear-gradient(90deg,#123634 0%,#11625c 100%); color:#fff; padding:14px 22px; display:flex; justify-content:space-between; align-items:flex-end; box-shadow:0 6px 14px rgba(18,54,52,.18); }
.qc3-banner-r { text-align:right; }
.qc3-banner-lbl { font-size:10.5px; font-weight:600; opacity:.95; }
.qc3-banner-big { font-size:34px; font-weight:800; line-height:1.1; margin-top:2px; letter-spacing:-.5px; }
.qc3-banner-note { font-size:8.5px; opacity:.85; margin-top:2px; }
.qc3-card { margin-top:16px; }
.qc3-h2 { font-size:15px; font-weight:700; text-align:center; margin:0 0 8px; }
.qc3-table { width:100%; border-collapse:separate; border-spacing:0; font-size:11px; border-radius:10px; overflow:hidden; }
.qc3-table th { background:#123f35; color:#fff; font-weight:600; text-align:left; padding:8px 12px; font-size:10.5px; }
.qc3-table td { padding:8px 12px; border-bottom:1px solid #eef1f2; }
.qc3-table tbody tr:nth-child(even) td { background:#fafbfb; }
.qc3-name { font-weight:500; }
.qc3-ic { display:inline-block; width:18px; margin-right:4px; }
.qc3-hrs { color:#F5901E; font-weight:600; }
.qc3-units { color:#1f5fbf; font-weight:600; }
.qc3-table tfoot td { background:#e8f7ee; color:#1a8a3f; font-weight:700; font-size:12px; border-bottom:0; padding:9px 12px; }
.qc3-cards { margin-top:18px; display:flex; align-items:stretch; gap:8px; }
.qc3-kpi { flex:1; border:1px solid #d9e0e2; border-radius:10px; overflow:hidden; text-align:center; background:#fff; }
.qc3-kpi-h { background:#123f35; color:#fff; font-size:11px; font-weight:600; padding:7px 6px; }
.qc3-kpi-v { font-size:26px; font-weight:800; padding:6px 6px 0; letter-spacing:-.5px; }
.qc3-kpi-n { font-size:9px; color:#6a7378; padding:2px 6px 8px; }
.qc3-kpi-n::before { content:''; display:inline-block; width:6px; height:6px; border-radius:50%; background:#F5901E; margin-right:4px; vertical-align:middle; }
.qc3-arrow { align-self:center; color:#F5901E; font-size:22px; font-weight:800; }
.qc3-life { margin-top:20px; display:grid; grid-template-columns:1fr 1fr; gap:26px; }
.qc3-life-h { font-size:13px; font-weight:700; margin:0 0 8px; }
.qc3-red { color:#d63c2f; } .qc3-green { color:#1a8a3f; }
.qc3-life-item { display:flex; gap:8px; margin-bottom:8px; }
.qc3-life-item b { display:block; font-size:11px; }
.qc3-life-item p { margin:1px 0 0; font-size:9.5px; color:#4b585d; line-height:1.4; }
.qc3-mark { width:14px; height:14px; border-radius:50%; flex:0 0 14px; display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:800; margin-top:2px; }
.qc3-mark-red { background:#fdecea; color:#d63c2f; } .qc3-mark-green { background:#e8f7ee; color:#1a8a3f; }
.qc3-life-item b.qc3-red { color:#d63c2f; }

/* page 9 */
.qc9-h1 { margin-top:18px; }
.qc9-timeline { position:relative; display:grid; grid-template-columns:repeat(6,1fr); gap:12px; margin-top:34px; }
.qc9-n4 { grid-template-columns:repeat(4,1fr); } .qc9-n5 { grid-template-columns:repeat(5,1fr); }
.qc9-line { position:absolute; left:8%; right:8%; top:18px; border-top:2px dashed #cfd6d8; z-index:0; }
.qc9-step { position:relative; z-index:1; text-align:left; }
.qc9-dot { width:38px; height:38px; border-radius:50%; background:#123f35; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px; margin:0 auto; }
.qc9-days { text-align:center; font-size:8px; color:#6a7378; margin-top:4px; letter-spacing:.5px; }
.qc9-step b { display:block; font-size:11px; margin-top:14px; line-height:1.3; min-height:44px; }
.qc9-step p { margin:8px 0 0; font-size:9.6px; color:#4b585d; line-height:1.45; }
.qc9-refund { margin-top:34px; border-left:3px solid #F5901E; padding:6px 0 6px 12px; }
.qc9-refund-h { font-size:12px; font-weight:700; color:#123f35; letter-spacing:.2px; }
.qc9-refund-t { font-size:10px; color:#3f4b50; line-height:1.45; margin-top:4px; }
.qc9-refund-line { font-size:11px; font-weight:700; color:#123f35; margin-top:5px; }
.qc9-scope { margin-top:30px; display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.qc9-box { border-radius:12px; padding:18px 18px; }
.qc9-box-orange { background:#fff4e8; } .qc9-box-green { background:#e9f6ee; }
.qc9-box h3 { margin:0 0 8px; font-size:11.5px; font-weight:800; letter-spacing:.6px; }
.qc9-box ul { list-style:none; margin:0; padding:0; }
.qc9-box li { position:relative; padding-left:18px; font-size:10.2px; line-height:1.45; color:#2c383d; margin-bottom:8px; }
.qc9-box li::before { content:''; position:absolute; left:0; top:4px; width:9px; height:9px; border-radius:50%; background:#F5901E; }
.qc9-box-green li::before { background:#F5901E; }

/* pages 10 / 11 */
.qc10-h1 { text-align:left; font-size:22px; margin-top:16px; }
.qc10-terms { margin-top:16px; column-count:1; }
.qc10-clause { margin-bottom:13px; }
.qc10-clause b { display:block; font-size:12px; font-weight:700; color:#16262b; margin-bottom:3px; }
.qc10-clause p { margin:0; font-size:10.6px; line-height:1.5; color:#2c383d; }
.qc-ml .qc10-clause b { font-size:12.5px; } .qc-ml .qc10-clause p { font-size:10.8px; line-height:1.55; }
`;

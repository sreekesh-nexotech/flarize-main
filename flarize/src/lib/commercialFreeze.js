/**
 * COMMERCIAL FREEZE HELPER — Phase F (2026-09-05).
 *
 * Assembles the document.snapshot sub-object that captures every commercial
 * input a historical quotation must reproduce byte-for-byte. Purely
 * additive to the existing quotationWorkspace.issueQuotation freeze surface.
 *
 * WHAT IT FREEZES  (each field carries source + version tags where present)
 * ------------------------------------------------------------------------
 *   engineering  — bom-level engineering status + blockers
 *   battery      — project batteryQuantity + source (locked 2.3)
 *   package      — profileKey + tier + premium classification
 *   procurement  — batch(es) referenced + landedCostVersion + parity notes
 *   transportation — distanceKm + vehicleType + ratePerKm + rate version (locked 2.1)
 *   commercial   — actual cost + margin + list + gst + selling (from commercial snapshot)
 *   subsidy      — subsidyResult passthrough
 *   branding     — freezeBrandingSnapshot output (bank/upi/signature/seal, locked 2.4 + 2.5)
 *   validity     — resolveEffectiveValidity output (locked 2.6)
 *   rendererPin  — pointer to the R1/R2 pin already captured on document
 *
 * Pure function. Never reads a clock. Never mutates inputs. Every field
 * that is not supplied comes out `null` — no fabrication.
 */
import { freezeBrandingSnapshot } from './quotationBranding.js';
import { resolveEffectiveValidity } from './quotationPolicy.js';

function deepClone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}
function deepFreeze(x) {
  if (x == null || typeof x !== 'object') return x;
  for (const k of Object.keys(x)) deepFreeze(x[k]);
  return Object.freeze(x);
}

/**
 * @param {Object} params
 * @param {Object} params.bom                  server-bom-builder.buildBom result — for engineering + systemConfig
 * @param {Object} [params.project]            {distanceKm, vehicleType} — locked 2.1 + 2.3 inputs
 * @param {Object} [params.transportationConfig] cost-config.transportation — for vehicle rate version
 * @param {Object} [params.commercialSnapshot] pricing snapshot — cost/margin/GST/selling
 * @param {Object} [params.subsidyResult]      subsidy engine result — passthrough
 * @param {Object} [params.brandingStore]      loaded quotation-branding-state.json
 * @param {Object} [params.brandingOverrides]  {bank,upi,signature,seal: versionId}
 * @param {Object} [params.policy]             loaded quotation-policy.json
 * @param {number} [params.validityOverrideDays] Project-Head per-quote override
 * @param {string}  params.issuedAt            ISO timestamp — required
 * @param {Object} [params.rendererPin]        already captured on document (pointer only)
 * @param {Object} [params.packageProfile]     catalog.packageProfiles[key] — for premium classification
 * @returns {Object} frozen commercial snapshot
 */
export function buildCommercialSnapshot(params = {}) {
  const {
    bom = null,
    project = {},
    transportationConfig = null,
    commercialSnapshot = null,
    subsidyResult = null,
    brandingStore = null,
    brandingOverrides = {},
    policy = null,
    validityOverrideDays = null,
    issuedAt = null,
    rendererPin = null,
    packageProfile = null,
    productionMode = false,   // Phase J DEMO safety — when true, DEMO branding refuses to issue
  } = params;

  if (!issuedAt) throw new Error('commercialFreeze.buildCommercialSnapshot: issuedAt required');

  // Engineering block from BOM
  const engineering = bom?.engineering
    ? deepFreeze(deepClone({
        status: bom.engineering.status || null,
        blockers: bom.engineering.blockers || [],
      }))
    : null;

  // Battery from systemConfig (Phase B.6)
  const battery = bom?.systemConfig
    ? deepFreeze(deepClone({
        batteryQuantity: bom.systemConfig.batteryQuantity ?? null,
        batterySource:   bom.systemConfig.batterySource ?? null,
        batteryIncluded: bom.systemConfig.batteryIncluded ?? null,
      }))
    : null;

  // Package/profile + premium classification
  const pkg = bom?.systemConfig
    ? deepFreeze(deepClone({
        systemType: bom.systemConfig.systemType ?? null,
        size:       bom.systemConfig.size ?? null,
        phase:      bom.systemConfig.phase ?? null,
        tier:       bom.systemConfig.tier ?? null,
        profileKey: bom.systemConfig.profileKey ?? null,
        // Premium classification per locked 2.2 — is this profile a Premium one?
        // The registry / catalog may carry an isPremium classification per component;
        // for the package level, tier === 'premium' OR profileKey === 'ongrid_premium'|'hybrid_premium'|'premium'.
        isPremiumTier: bom.systemConfig.tier === 'premium',
        profileNotes: packageProfile?.notes ?? null,
      }))
    : null;

  // Procurement + landed cost version(s) — from commercialSnapshot.
  // Accept either the flat shape ({procurementPriceVersion, landedCostVersion, catalogVersion})
  // or the versioned commercialSnapshot shape ({versions: {...}}).
  const csVersions = commercialSnapshot?.versions ?? commercialSnapshot ?? null;
  const procurement = csVersions
    ? deepFreeze(deepClone({
        procurementPriceVersion: csVersions.procurementPriceVersion ?? null,
        landedCostVersion:       csVersions.landedCostVersion ?? null,
        catalogVersion:          csVersions.catalogVersion ?? null,
      }))
    : null;

  // Transportation — capture the inputs used AND the applicable rate/version.
  // 2026-09-07 conformance §16/§20: freeze the rate the Cost Engine ACTUALLY
  // applied. The engine resolves a vehicle rate first from the PROJECT_HEAD
  // versioned rate card (projectRateCard.js) and only then from
  // cost-config.transportation.vehicles; it records vehicleType / ratePerKm /
  // distanceKm / distanceBasis in the TRANSPORTATION trace together with the
  // rate versionId and source. When that trace is present it is authoritative;
  // the cost-config lookup below remains only as the legacy fallback for
  // callers that pass no commercialSnapshot.
  const csCostForTransport = commercialSnapshot?.cost ?? commercialSnapshot ?? null;
  const transportTrace = Array.isArray(csCostForTransport?.traces)
    ? csCostForTransport.traces.find(t => t && t.head === 'TRANSPORTATION') || null
    : null;
  const veh = (transportationConfig?.vehicles || []).find(v => v.vehicleType === project.vehicleType) || null;
  const transportation = (project.vehicleType || project.distanceKm != null || transportTrace)
    ? deepFreeze(deepClone({
        vehicleType: transportTrace?.inputs?.vehicleType ?? project.vehicleType ?? null,
        distanceKm:  transportTrace?.inputs?.distanceKm ?? project.distanceKm ?? null,
        distanceBasis: transportTrace?.inputs?.distanceBasis || transportationConfig?.distanceBasis || 'ONE_WAY',
        ratePerKm:   transportTrace?.inputs?.ratePerKm ?? veh?.ratePerKm ?? null,
        rateVersion: transportTrace?.version ?? veh?.version ?? transportationConfig?.version ?? null,
        rateSource:  transportTrace?.source ?? (veh ? 'COST_CONFIG_VEHICLES' : null),
        amount:      transportTrace?.amount ?? null,
        formula: 'distanceKm × vehicle.ratePerKm',
      }))
    : null;

  // Commercial (cost/margin/GST/selling) passthrough. Accept either the flat
  // shape or the versioned commercialSnapshot shape ({cost, pricing, versions}).
  const csCost    = commercialSnapshot?.cost    ?? commercialSnapshot ?? null;
  const csPricing = commercialSnapshot?.pricing ?? commercialSnapshot ?? null;
  const commercial = commercialSnapshot
    ? deepFreeze(deepClone({
        totalActualProjectCost: csCost?.totalActualProjectCost ?? commercialSnapshot.totalActualProjectCost ?? null,
        marginType:             csPricing?.marginType ?? commercialSnapshot.marginType ?? null,
        targetMarginPct:        csPricing?.targetGrossMargin != null ? csPricing.targetGrossMargin * 100 : (commercialSnapshot.targetMarginPct ?? null),
        minimumMarginPct:       commercialSnapshot.minimumMarginPct ?? null,
        listSellingPriceBeforeGST: commercialSnapshot.listSellingPriceBeforeGST ?? null,
        discount:               commercialSnapshot.discount ?? null,
        discountAmount:         commercialSnapshot.discountAmount ?? null,
        sellingPriceBeforeGST:  csPricing?.sellingPriceBeforeGST ?? commercialSnapshot.sellingPriceBeforeGST ?? null,
        finalSellingPriceBeforeGST: commercialSnapshot.finalSellingPriceBeforeGST ?? null,
        gstRegime:              commercialSnapshot.gstRegime ?? null,
        gstRatePct:             csPricing?.gstRatePct ?? commercialSnapshot.gstRatePct ?? null,
        gstAmount:              csPricing?.gstAmount ?? commercialSnapshot.gstAmount ?? null,
        sellingPriceIncludingGST: csPricing?.sellingPriceIncludingGST ?? commercialSnapshot.sellingPriceIncludingGST ?? null,
        marginVersion:          csVersions?.marginVersion ?? commercialSnapshot.marginVersion ?? null,
        gstVersion:             csVersions?.gstVersion ?? commercialSnapshot.gstVersion ?? null,
        pricingMode:            commercialSnapshot.pricingMode ?? 'GROSS_MARGIN',
        marketRate:             csPricing?.marketRate ?? null,
        swapDeltaTotal:         csPricing?.swapDeltaTotal ?? null,
        roofAddOn:              csPricing?.roofAddOn ?? null,
        extrasIncludingGST:     csPricing?.extrasIncludingGST ?? null,
        customerTotalIncludingGST: csPricing?.customerTotalIncludingGST ?? null,
      }))
    : null;

  // Subsidy passthrough (kept SEPARATE from cost/margin per locked 2.7)
  const subsidy = subsidyResult
    ? deepFreeze(deepClone({
        available: subsidyResult.available ?? null,
        subsidyType: subsidyResult.subsidyType ?? null,
        centralSubsidy: subsidyResult.centralSubsidy ?? null,
        stateSubsidy: subsidyResult.stateSubsidy ?? null,
        totalSubsidy: subsidyResult.totalSubsidy ?? null,
        eligibilityStatus: subsidyResult.eligibilityStatus ?? null,
        schemeName: subsidyResult.schemeName ?? null,
        calculatedAt: subsidyResult.calculatedAt ?? null,
        source: 'SUBSIDY_ENGINE (separate from cost/margin per locked 2.7)',
      }))
    : null;

  // Branding (bank/upi/signature/seal) — versioned freeze per locked 2.4 + 2.5
  const branding = brandingStore
    ? freezeBrandingSnapshot(brandingStore, brandingOverrides)
    : null;

  // Phase J DEMO safety — refuse production issuance when any resolved
  // branding kind is flagged isDemo:true. Development / test environments
  // simply pass productionMode=false (default) and the guard is a no-op.
  if (productionMode && branding) {
    const demoKinds = [];
    for (const kind of ['bank', 'upi', 'signature', 'seal']) {
      if (branding[kind] && branding[kind].isDemo === true) demoKinds.push(kind);
    }
    if (demoKinds.length > 0) {
      const err = new Error(
        `DEMO_BRANDING_BLOCKED_IN_PRODUCTION: cannot issue a production quotation while branding ${demoKinds.join(', ')} is flagged isDemo:true. Publish a non-demo account or lift productionMode.`
      );
      err.code = 'DEMO_BRANDING_BLOCKED_IN_PRODUCTION';
      err.detail = { demoKinds };
      throw err;
    }
  }

  // 2026-09-07 conformance §16 / §24 — transport rate production guard.
  // cost-config.transportation.vehicles are VERSIONED UAT REFERENCE rates
  // flagged isDemo:true (₹35/km STANDARD is historical/reference only). In
  // production the applied rate must come from the PROJECT_HEAD versioned
  // rate card (trace.source === 'PROJECT_HEAD_RATE_CARD'). Same shape as the
  // branding guard above; a no-op when productionMode=false.
  if (productionMode && transportation && transportation.ratePerKm != null) {
    const fromRateCard = transportation.rateSource === 'PROJECT_HEAD_RATE_CARD';
    const cfgIsDemo = transportationConfig?.isDemo === true
      || (veh && veh.isDemo === true);
    if (!fromRateCard && cfgIsDemo) {
      const err = new Error(
        `DEMO_TRANSPORT_RATE_BLOCKED_IN_PRODUCTION: vehicle rate for "${transportation.vehicleType}" resolved from cost-config UAT reference data (isDemo:true). ` +
        'Project Head must publish the vehicle rate through the versioned rate card (PUT /api/workspace/commercial/rate-card) before production issuance.'
      );
      err.code = 'DEMO_TRANSPORT_RATE_BLOCKED_IN_PRODUCTION';
      err.detail = { vehicleType: transportation.vehicleType, rateSource: transportation.rateSource ?? null, rateVersion: transportation.rateVersion ?? null };
      throw err;
    }
  }

  // Validity (default + override) per locked 2.6 + Phase J effective-period.
  // In dev/UAT (productionMode=false) a not-yet-configured policy is
  // acceptable — the frozen `snapshot.validity` stays null so testing can
  // proceed. In production (productionMode=true) `POLICY_NOT_CONFIGURED` is
  // fatal by design and must not be silenced.
  let validity = null;
  if (policy) {
    try {
      validity = resolveEffectiveValidity(policy, validityOverrideDays, issuedAt);
    } catch (e) {
      if (productionMode || e?.code !== 'POLICY_NOT_CONFIGURED') throw e;
      validity = null;
    }
  }

  // 2026-09-08 — pack market-rate quotations carry the frozen pack facts
  // (config version, market-rate key, swap deltas, roof add-on, transport,
  // full material list). Null for gross-margin-engine quotations.
  const pack = commercialSnapshot?.pack ? deepFreeze(deepClone(commercialSnapshot.pack)) : null;

  return Object.freeze({
    schemaVersion: 'flarize.commercial-snapshot/1',
    frozenAt: issuedAt,
    engineering, battery, package: pkg, procurement, transportation,
    commercial, subsidy, branding, validity, pack,
    rendererPin: rendererPin ? Object.freeze({ ...rendererPin }) : null,
  });
}

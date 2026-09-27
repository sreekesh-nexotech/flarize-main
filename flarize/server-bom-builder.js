// BOM BUILDER — SERVER-SIDE PACKAGE RESOLUTION.  (Phase 1)
//
// Given a system configuration (type, size, tier, phase), resolve the
// approved package BOM from catalog templates + profiles.
//
// This mirrors the BOM generation that App.jsx performs client-side, but
// runs server-side so the sales wizard can request a BOM without needing
// to replicate the 300-line React useMemo.
//
// Rules:
//   - Component selection uses catalog items filtered by tier, phase, status
//   - Battery resolution uses package profile
//   - Inverter selection uses nearest-kW match
//   - Panel quantity is dynamic based on selected panel wattage
//   - Fixed items use size-based quantities from template
//   - No business rules are invented; all come from catalog data

const fs = require('fs');
const path = require('path');

// C.1 (locked 2.10, 2026-09-05) — generalized panel-to-device allocator.
const { allocateDevices } = require('./src/lib/deviceAllocation.js');

// 2026-09-08 fast-quotation build — the PACK CONFIG (Project Head owned,
// Admin approved; data/pack-config.json via server-pack-config.js) is the
// authority for templates, structure tables, costs, installation matrix,
// transport and market rates. The catalog keeps the component master (items,
// reference prices, warranty). `source` = 'approved' (Sales / orchestrator)
// or 'draft' (Project Head preview of unpublished edits).
const PACK_CONFIG_SECTIONS = ['bomTemplates', 'structureTemplates', 'tubeWeights', 'costs', 'installationMatrix', 'transportConfig', 'marketRates', 'gst', 'pricing', 'futureUpgrade'];
let _packConfigProvider = null;
function setPackConfigProvider(fn) { _packConfigProvider = fn; }
function loadCatalog(source = 'approved') {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'catalog.json'), 'utf-8'));
  const cfg = _packConfigProvider ? _packConfigProvider(source) : null;
  if (cfg) for (const k of PACK_CONFIG_SECTIONS) if (cfg[k] != null) catalog[k] = cfg[k];
  catalog._packConfigSource = cfg ? source : 'CATALOG_ONLY';
  return catalog;
}

// ---------------------------------------------------------------------------
// Package registry — approved alternates for Sales enforcement
// ---------------------------------------------------------------------------

const REGISTRY_FILE = path.join(__dirname, 'data', 'packages.proposed.json');

function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8')); } catch { return { packages: [] }; }
}

// Sales roles that see restricted alternatives (mirrors packageAuthority.js).
const INDIVIDUAL_SALES_ROLES = ['SALES', 'SALES_CRS', 'FIELD_SALES'];
function isSalesRole(role) {
  return INDIVIDUAL_SALES_ROLES.includes(role) || role === 'SALES_HEAD';
}

/**
 * Find the registry package matching a configuration.
 */
function findRegistryPackage(registry, { systemType, size, tier, phase }) {
  return (registry?.packages || []).find(p =>
    p.systemType === systemType &&
    p.size === size &&
    p.tier === tier &&
    p.phase === phase
  ) || null;
}

/**
 * Get approved alternate component IDs for a role from a registry package.
 * Returns null when no registry entry exists (non-restrictive fallback).
 */
function getApprovedAlternateIds(registryPkg, role) {
  if (!registryPkg) return null;
  const comp = (registryPkg.components || []).find(c => c.role === role);
  return comp ? (comp.approvedAlternates || []) : null;
}

/**
 * Strip cost/procurement fields from BOM lines for Sales-role responses.
 * Non-Sales callers receive the full data.
 */
function stripCostFieldsForSales(lines) {
  const SENSITIVE = ['unitPrice', 'amount', 'gst', 'gstAmt', 'landedUnitCost', 'purchasePrice', 'supplier'];
  return lines.map(line => {
    const clean = { ...line };
    for (const key of SENSITIVE) delete clean[key];
    return clean;
  });
}

/**
 * Resolve profile key from system type and tier.
 * Mirrors getProfileKey() in App.jsx.
 */
function getProfileKey(sysType, tier) {
  // B.8 (locked 2.2, 2026-09-05) — On-grid Premium routes to explicit
  // ongrid_premium profile, never to the global 'premium' fallback.
  // Hybrid Premium keeps hybrid_premium. Base/Value unchanged.
  if (sysType === 'hybrid') return `hybrid_${tier}`;
  if (tier === 'premium') return 'ongrid_premium';
  return `ongrid_${tier}`;
}

/**
 * Build a complete BOM for a given configuration.
 *
 * @param {Object} config
 * @param {string} config.systemType  - 'ongrid' or 'hybrid'
 * @param {string} config.size        - '3', '5sp', '5tp', '6', '8', '10' (ongrid) or '3', '5', '8', '10' (hybrid)
 * @param {string} config.tier        - 'base', 'value', or 'premium'
 * @param {string} [config.phase]     - '1P' or '3P' (auto-detected from size if omitted)
 * @param {Object} [config.selections] - Component overrides keyed by slot category
 *   e.g. { panel: 'componentId', inverter: 'componentId', battery: 'componentId' }
 * @param {string} [config.actorRole] - Caller's RBAC role; Sales roles trigger
 *   approved-alternate validation for every selection.
 * @returns {{ lines: Array, totals: Object, profile: Object }}
 */
function buildBom(config) {
  const catalog = loadCatalog(config.configSource || 'approved');
  const { systemType, size, tier, actorRole } = config;
  const selections = config.selections || {};
  // Future Ready (owner Q7): panels are sized for `size`; inverter, structure,
  // DB, cables, meter and consumables are sized for `futureSystemSize`.
  const sysSize = config.futureSystemSize ? String(config.futureSystemSize) : String(size);
  const isFutureReady = sysSize !== String(size);

  // C.2/C.3 — engineering blockers collected during BOM build so the caller
  // surfaces them (e.g. Sales UI, engineering validation). Empty when clean.
  const engineeringBlockers = [];

  // C.5 (locked §6, H9, 2026-09-05) — explicit BLOCK for unsupported
  // combinations. 3 kW 3P is not a supported system (no 3-phase 3 kW
  // package exists in the registry and no engineering rules cover it).
  // The block is explicit, never a silent fall-through to some other size
  // or phase.
  const requestedPhase = config.phase || null;
  if (systemType === 'ongrid' && String(size) === '3' && requestedPhase === '3P') {
    throw Object.assign(new Error(
      'Unsupported configuration: 3 kW 3-phase on-grid is not a supported system. ' +
      '3 kW is single-phase only. To size a 3-phase system, choose 5 kW (5tp), 6 kW, 8 kW or 10 kW.'
    ), {
      code: 'UNSUPPORTED_CONFIGURATION',
      detail: { systemType, size, phase: requestedPhase, supportedThreePhaseSizes: ['5tp','6','8','10'] },
    });
  }
  if (systemType === 'hybrid' && String(size) === '3' && requestedPhase === '3P') {
    throw Object.assign(new Error(
      'Unsupported configuration: 3 kW 3-phase hybrid is not a supported system. ' +
      'Hybrid 3 kW is single-phase only.'
    ), {
      code: 'UNSUPPORTED_CONFIGURATION',
      detail: { systemType, size, phase: requestedPhase, supportedHybrid3P: ['8','10'] },
    });
  }

  const template = catalog.bomTemplates?.[systemType];
  if (!template) throw new Error(`No BOM template for system type "${systemType}"`);
  if (!template.sizes?.[size]) throw new Error(`Invalid size "${size}" for system type "${systemType}"`);
  if (isFutureReady && !template.sizes?.[sysSize]) throw Object.assign(new Error(`Invalid future-ready system size "${sysSize}" for system type "${systemType}"`), { code: 'UNSUPPORTED_CONFIGURATION' });

  const profileKey = getProfileKey(systemType, tier);
  const profile = catalog.packageProfiles?.[profileKey] || null;
  const isThreePhase = config.phase === '3P' || template.threePhase?.includes(sysSize);
  if (isFutureReady && (template.threePhase?.includes(sysSize) !== template.threePhase?.includes(String(size)))) {
    throw Object.assign(new Error(`Future-ready pair ${size} → ${sysSize} changes the phase; not allowed.`), { code: 'UNSUPPORTED_CONFIGURATION' });
  }
  const tiers = template.tiers || ['base', 'value', 'premium'];
  if (!tiers.includes(tier)) throw new Error(`Invalid tier "${tier}". Valid: ${tiers.join(', ')}`);

  // B.5 (locked 2.9, 2026-09-05) — registry is loaded UNCONDITIONALLY now.
  // packages.proposed.json is the authoritative source for production slot
  // resolution (C23 closed). Sales-role approvedAlternates enforcement below
  // still keys off registryPkg, but the registry is now consulted for EVERY
  // caller's default component pick — not just Sales.
  const registry = loadRegistry();
  const registryPkg = findRegistryPackage(registry, {
    systemType, size: sysSize, tier,
    phase: isThreePhase ? '3P' : '1P',
  });

  // B.6 (locked 2.3, 2026-09-05) — Battery quantity is project-level (0/1/2).
  // Project Head passes `config.batteryQuantity` per project; when supplied,
  // it OVERRIDES the profile default. Engineering validation (ENG-BAT-006
  // in resolveBattery.js) still guards profile-vs-project consistency. When
  // `config.batteryQuantity` is null/undefined, fall back to profile's
  // batteryQuantity (backwards-compat for callers not yet passing project qty).
  //
  // Non-hybrid systems always resolve to 0 regardless of override.
  const projectBatQtyRaw = config.batteryQuantity;
  const projectBatQty = (projectBatQtyRaw === 0 || projectBatQtyRaw === 1 || projectBatQtyRaw === 2)
    ? projectBatQtyRaw : null;
  let batQty;
  if (systemType !== 'hybrid') {
    batQty = 0;
  } else if (projectBatQty != null) {
    batQty = projectBatQty;
  } else if (profile?.batteryIncluded) {
    batQty = profile.batteryQuantity || 1;
  } else {
    batQty = 0;
  }
  const batConfig = String(batQty);
  const batterySource = projectBatQty != null ? 'PROJECT_HEAD_OVERRIDE'
                       : (profile?.batteryIncluded ? 'PROFILE_DEFAULT' : 'NONE');

  const lines = [];
  let matTotal = 0;
  let allGst = 0;
  let numPanels = 0;

  // Variable slots
  for (const slot of (template.slots || [])) {
    // Determine quantity
    let qty = 0;
    const isPremiumMicro = tier === 'premium' && (systemType === 'ongrid' || systemType === 'hybrid');

    // Panels follow the panel size; every other slot follows the system size (FR).
    const qSize = slot.category === 'panel' ? String(size) : sysSize;
    if (isPremiumMicro && (slot.premiumBatQty || slot.premiumQty)) {
      if (slot.premiumBatQty) {
        const bq = slot.premiumBatQty[batConfig] || slot.premiumBatQty['0'] || {};
        qty = bq[qSize] || 0;
      } else if (slot.premiumQty) {
        qty = slot.premiumQty[qSize] || 0;
      }
    } else if (slot.batQty) {
      const bq = slot.batQty[batConfig] || slot.batQty['0'] || {};
      qty = bq[qSize] || 0;
    } else if (slot.qty) {
      qty = slot.qty[qSize] || 0;
    }

    // Battery quantity from profile
    if (slot.category === 'battery') qty = batQty;
    // MCCB only if battery present
    if (slot.category === 'mccb_box') qty = batQty > 0 ? Math.max(1, qty) : 0;

    if (qty === 0) continue;

    const category = catalog.categories?.[slot.category];
    if (!category) continue;

    // Filter items by tier, phase, status
    const phaseFilter = item => {
      if (slot.filterType === 'hybrid') return item.type === 'hybrid';
      if (slot.filterType === 'ongrid') {
        if (item.type && item.type !== 'ongrid') return false;
      }
      if (slot.filterPhase === 'HYB') {
        if (!item.phase?.includes('HYB')) return false;
        return isThreePhase ? item.phase?.includes('3P') : item.phase?.includes('1P');
      }
      if (isThreePhase && item.phase) return item.phase === '3P' || item.phase.includes('3P');
      if (!isThreePhase && item.phase) return item.phase === '1P' || item.phase.includes('1P') || !item.phase;
      return true;
    };
    const statusFilter = item => (item.status || 'ACTIVE') === 'ACTIVE';
    const available = category.items.filter(item =>
      item.tiers?.includes(tier) && statusFilter(item) && phaseFilter(item)
    );
    if (available.length === 0) continue;

    // ---- Project Head default for this slot/size --------------------------
    // Order (all configured data, never positional when a default exists):
    //   1. slot.defaults[size]  — PH pick in the pack config
    //   2. registry component   — approved package pin (legacy V4 registry)
    //   3. inverter nearest configured kW to the SYSTEM size
    //   4. first eligible item  — flagged NOT_AUTHORITATIVE so PH sees it
    const defSize = slot.category === 'panel' ? String(size) : sysSize;
    const phDefaultId = phDefaultFor(slot, tier, defSize);
    const registryRec = (registryPkg?.components || []).find(c => c.role === slot.category);
    const registryCid = registryRec?.componentId || registryRec?.pinnedComponentId || null;
    let defaultItem = null, defaultMethod = null;
    if (phDefaultId && available.find(i => i.id === phDefaultId)) { defaultItem = available.find(i => i.id === phDefaultId); defaultMethod = 'PACK_CONFIG_DEFAULT'; }
    else if (registryCid && available.find(i => i.id === registryCid)) { defaultItem = available.find(i => i.id === registryCid); defaultMethod = registryRec?.derivedBy === 'explicit' ? 'PACKAGE_REGISTRY_AUTHORITATIVE' : 'PACKAGE_REGISTRY_FALLBACK'; }
    else if (slot.category === 'inverter' && available.some(i => i.kw)) {
      const targetKw = parseFloat(sysSize) || 3;
      defaultItem = [...available].sort((a, b) => Math.abs((a.kw || 0) - targetKw) - Math.abs((b.kw || 0) - targetKw))[0];
      defaultMethod = 'NEAREST_KW_TO_SYSTEM_SIZE';
    } else { defaultItem = available[0]; defaultMethod = 'LEGACY_FIRST_MATCH_NOT_AUTHORITATIVE'; }

    // ---- Sales-swappable? and which alternatives -------------------------
    // slot.salesSwap (PH toggle) decides whether Sales may change this slot;
    // slot.alternatives (PH list) restricts the choice; [] = every eligible
    // catalog item of the category; legacy registry approvedAlternates still
    // honoured when the slot has no list of its own.
    const salesSwap = slotSalesSwappable(slot);
    const slotAlternatives = Array.isArray(slot.alternatives) && slot.alternatives.length ? slot.alternatives
      : (getApprovedAlternateIds(registryPkg, slot.category) || null);
    const isSalesCaller = actorRole && isSalesRole(actorRole);

    // Select component — sales selection override or PH default
    let selected = null;
    let selectionMethod = 'PACKAGE_DEFAULT';

    if (selections[slot.category]) {
      const selId = selections[slot.category];
      if (isSalesCaller && !salesSwap && selId !== defaultItem?.id) {
        throw Object.assign(new Error(`Sales may not change ${slot.label || slot.category}; it is fixed by the Project Head for this pack.`), { code: 'SELECTION_NOT_PERMITTED', detail: { category: slot.category } });
      }
      selected = available.find(i => i.id === selId);
      if (!selected) {
        // Check if item exists in catalog but fails filters
        const allItems = category.items || [];
        const existsInCatalog = allItems.find(i => i.id === selId);
        if (!existsInCatalog) {
          throw new Error(`Selected component "${selId}" not found in category "${slot.category}"`);
        }
        // Item exists but not available for this config
        const reasons = [];
        if (!existsInCatalog.tiers?.includes(tier)) reasons.push(`not available in ${tier} tier`);
        if ((existsInCatalog.status || 'ACTIVE') !== 'ACTIVE') reasons.push('not active');
        if (!phaseFilter(existsInCatalog)) reasons.push(`not compatible with ${isThreePhase ? '3-phase' : '1-phase'} configuration`);
        throw new Error(`Component "${existsInCatalog.name || selId}" cannot be selected for ${slot.category}: ${reasons.join(', ') || 'not eligible for this configuration'}`);
      }
      // Sales-role enforcement: selection must be in the approved alternatives
      if (isSalesCaller && slotAlternatives && !slotAlternatives.includes(selId) && selId !== defaultItem?.id) {
        throw Object.assign(new Error(
          `Component "${selected.name || selId}" is not an approved alternative for ${slot.category}. ` +
          `Sales may only select from the approved list for this pack.`), { code: 'SELECTION_NOT_APPROVED', detail: { category: slot.category, approved: slotAlternatives } });
      }
      selectionMethod = selected.id === defaultItem?.id ? (defaultMethod || 'PACKAGE_DEFAULT') : 'SALES_SELECTION';
    } else {
      selected = defaultItem;
      selectionMethod = defaultMethod || 'PACKAGE_DEFAULT';
    }
    if (!selected) continue;

    // Dynamic panel quantity
    if (slot.category === 'panel' && selected.watt) {
      const systemWatts = parseFloat(size) * 1000;
      qty = Math.ceil(systemWatts / selected.watt);
      numPanels = qty;
    }

    const unitPrice = selected.price || 0;
    const amount = qty * unitPrice;
    const gst = slot.gst || category.gstDefault || 18;
    const gstAmt = Math.round(amount * gst / 100);
    matTotal += amount;
    allGst += gstAmt;

    lines.push({
      pos: slot.pos,
      category: slot.category,
      label: slot.label,
      name: selected.name,
      catalogItemId: selected.id,
      brand: selected.brand || null,
      watt: selected.watt || null,
      kw: selected.kw || null,
      type: selected.type || null,
      qty,
      unitPrice,
      amount,
      gst,
      gstAmt,
      isVariable: true,
      salesSwap,
      componentId: selected.id,
      selectionMethod,
      // PH default for this slot — the swap delta (packPricing) is selected − default.
      defaultComponentId: defaultItem?.id ?? null,
      defaultName: defaultItem?.name ?? null,
      defaultUnitPrice: defaultItem?.price ?? 0,
      defaultQty: (slot.category === 'panel' && defaultItem?.watt) ? Math.ceil(parseFloat(size) * 1000 / defaultItem.watt) : qty,
      defaultMethod,
      alternatives: slotAlternatives,
    });
  }

  // Premium micro-inverter accessories
  if (tier === 'premium' && (systemType === 'ongrid' || systemType === 'hybrid')) {
    const isPremiumHybrid = systemType === 'hybrid' && tier === 'premium';
    const microBrand = isPremiumHybrid ? 'enphase' : 'enphase';

    // C.2 (locked 2.10 + §5, 2026-09-05) — structured Enphase routing.
    // No name.includes() business logic. All routing keyed on either the
    // catalog item's `deviceType` (per-panel devices) or its
    // `microAccessoryRole` (fixed-purpose accessories).
    //
    // Microinverter allocation goes through allocateDevices() so panel-count
    // remainders cannot be silently dropped. For Enphase (IQ8P: panelsPerDevice=1)
    // the allocation is always trivial; for Hoymiles (HMS 2000 cap=4 + HMS 1000
    // cap=2) the same call yields a correct mixed allocation.
    if (catalog.categories?.enphase) {
      const en = catalog.categories.enphase.items;
      const byRole = (role) => en.find(i => i.microAccessoryRole === role);
      // Catalog items use `id`; the allocator expects `componentId`. Normalize
      // shape so the pure allocator does not reach into catalog schema.
      const microCandidates = en
        .filter(i => i.deviceType === 'microinverter'
                  && Number.isInteger(i.panelsPerDevice)
                  && i.panelsPerDevice > 0)
        .map(i => ({
          componentId: i.id,
          deviceType: i.deviceType,
          panelsPerDevice: i.panelsPerDevice,
          name: i.name || null,
          price: i.price || null,
          approvalStatus: i.approvalStatus || null,
        }));

      const addMicro = (item, qty, label, methodOverride) => {
        if (!item || qty === 0) return;
        const gst = item.gstOverride || catalog.categories.enphase?.gstDefault || 18;
        const amount = qty * (item.price || 0);
        const gstAmt = Math.round(amount * gst / 100);
        matTotal += amount;
        allGst += gstAmt;
        lines.push({
          pos: lines.length, category: 'enphase', label,
          name: item.name, catalogItemId: item.id,
          qty, unitPrice: item.price || 0, amount, gst, gstAmt,
          isVariable: false, componentId: item.id,
          selectionMethod: methodOverride || 'PACKAGE_DEFAULT',
        });
      };

      // Microinverter allocation (structured, complete-or-BLOCKED).
      const alloc = allocateDevices({ panels: numPanels, candidates: microCandidates });
      if (alloc.status === 'BLOCKED') {
        // Record BLOCKED status on the BOM result so the caller can surface it.
        // Do NOT synthesize partial device lines.
        engineeringBlockers.push({
          code: 'ENG-DEV-001',
          category: 'enphase',
          message: alloc.reason,
          panels: numPanels,
          unallocated: alloc.unallocatedPanels,
        });
      } else if (alloc.status === 'VALID') {
        for (const a of alloc.allocations) {
          // Fetch back the ORIGINAL catalog item (has full fields addMicro needs).
          const item = en.find(x => x.id === a.componentId);
          if (!item) continue;
          addMicro(item, a.quantity, `${item.name} (${a.quantity} × ${a.panelsPerDevice}-panel)`, 'DEVICE_ALLOCATION_STRUCTURED');
        }
      }
      // status === 'NOT_APPLICABLE' → no panels, nothing to add.

      // Per-panel cable — one Q Cable per panel (still structured via microAccessoryRole).
      const qCable = byRole('cable_per_panel');
      if (qCable) addMicro(qCable, numPanels, 'Q Cable Portrait', 'ACCESSORY_ROLE_LOOKUP');

      // Fixed-count Enphase accessories via microAccessoryRole (no name.includes).
      const envoy    = byRole('gateway');
      const qRelay   = byRole('relay');
      const qTermItm = byRole('terminal');
      const ct       = byRole('ct');
      const sysCtrl  = byRole('system_controller');

      const qTerminalQty = isThreePhase ? 3 : 1;
      const ctQty        = isThreePhase ? 4 : 0;

      if (envoy)    addMicro(envoy, 1,             'Envoy S Metered', 'ACCESSORY_ROLE_LOOKUP');
      if (qRelay)   addMicro(qRelay, 1,            'Q Relay',         'ACCESSORY_ROLE_LOOKUP');
      if (qTermItm) addMicro(qTermItm, qTerminalQty, 'Q Terminal',    'ACCESSORY_ROLE_LOOKUP');
      if (ctQty && ct) addMicro(ct, ctQty,         'CT 200',          'ACCESSORY_ROLE_LOOKUP');
      if (isPremiumHybrid && sysCtrl) addMicro(sysCtrl, 1, 'System Controller', 'ACCESSORY_ROLE_LOOKUP');
    }

    // UG Cable for premium hybrid — structured via microAccessoryRole.
    if (isPremiumHybrid && catalog.categories?.ug_cable) {
      const ugItems = catalog.categories.ug_cable.items || [];
      const targetRole = isThreePhase ? 'cable_4core' : 'cable_2core';
      const ugCable = ugItems.find(i => i.microAccessoryRole === targetRole);
      if (ugCable) {
        const ugQty = 40;
        const ugAmount = ugQty * (ugCable.price || 0);
        const ugGst = 18;
        const ugGstAmt = Math.round(ugAmount * ugGst / 100);
        matTotal += ugAmount;
        allGst += ugGstAmt;
        lines.push({
          pos: lines.length, category: 'ug_cable', label: 'UG Cable',
          name: ugCable.name, catalogItemId: ugCable.id,
          qty: ugQty, unitPrice: ugCable.price || 0, amount: ugAmount,
          gst: ugGst, gstAmt: ugGstAmt,
          isVariable: false, componentId: ugCable.id,
          selectionMethod: 'PACKAGE_DEFAULT',
        });
      }
    }
    if (catalog.categories?.hoymiles && !isPremiumHybrid) {
      // Hoymiles as alternative not added by default — only Enphase for premium
    }
  }

  // Fixed items — 3-branch qty resolution matching App.jsx:
  //   premiumQty (if premium micro) → batQty (battery-dependent) → qty (fallback)
  const isPremiumMicroFixed = tier === 'premium' && (systemType === 'ongrid' || systemType === 'hybrid');
  for (const fi of (template.fixedItems || [])) {
    let qty = 0;
    // Consumables follow the SYSTEM size (FR: sized for the future capacity).
    if (isPremiumMicroFixed && fi.premiumQty) {
      qty = fi.premiumQty[sysSize] || 0;
    } else if (fi.batQty) {
      const bq = fi.batQty[batConfig] || fi.batQty['0'] || {};
      qty = bq[sysSize] || 0;
    } else if (fi.qty) {
      qty = fi.qty[sysSize] || 0;
    }
    if (qty === 0) continue;
    const amount = qty * (fi.price || 0);
    const gst = fi.gst || 18;
    const gstAmt = Math.round(amount * gst / 100);
    matTotal += amount;
    allGst += gstAmt;
    lines.push({
      pos: lines.length,
      category: 'fixed',
      label: fi.name,
      name: fi.name,
      catalogItemId: fi.id || null,
      qty,
      unitPrice: fi.price || 0,
      amount,
      gst,
      gstAmt,
      isVariable: false,
      componentId: fi.id || null,
      selectionMethod: 'FIXED_TEMPLATE',
    });
  }

  const sub = matTotal;
  const grand = matTotal + allGst;

  return {
    lines,
    totals: { matTotal, allGst, sub, grand },
    profile: profile || {},
    systemConfig: {
      systemType,
      size,
      // Future Ready: panels at `size`, everything else at `systemSize`.
      systemSize: sysSize,
      futureReady: isFutureReady,
      tier,
      phase: isThreePhase ? '3P' : '1P',
      configSource: catalog._packConfigSource,
      profileKey,
      batteryIncluded: batQty > 0,
      // B.6 (locked 2.3, 2026-09-05) — expose project-level battery info
      // for snapshot/downstream visibility.
      batteryQuantity: batQty,
      batterySource, // PROJECT_HEAD_OVERRIDE | PROFILE_DEFAULT | NONE
    },
    // C.2/C.3 (locked 2.10, 2026-09-05) — surface engineering blockers
    // discovered during BOM build (e.g. unallocated microinverter panels).
    // Empty array when clean. Caller must not proceed with an approved BOM
    // if this is non-empty.
    engineering: {
      blockers: engineeringBlockers,
      status: engineeringBlockers.length === 0 ? 'VALID' : 'BLOCKED',
    },
  };
}

/**
 * Build BOMs for all three tiers.
 * @param {{ systemType: string, size: string, phase?: string, tierSelections?: Object, actorRole?: string }} config
 *   tierSelections: { base: {panel: id, ...}, value: {...}, premium: {...} }
 * @returns {{ base: BomResult, value: BomResult, premium: BomResult }}
 */
function buildAllTierBoms(config) {
  const tierSelections = config.tierSelections || {};
  const result = {};
  for (const tier of ['base', 'value', 'premium']) {
    result[tier] = buildBom({
      ...config,
      tier,
      selections: tierSelections[tier] || {},
      actorRole: config.actorRole,
    });
  }
  return result;
}

/**
 * Sales-selectable categories — must match SALES_SELECTABLE_ROLES in
 * packageAuthority.js (decision C12, revised 2026-09-02).  Roles map 1:1
 * to category names for this set.
 *
 * Revision (2026-09-02): Sales direct-selectable categories are Panel,
 * Inverter and Structure. ACDB / DCDB moved to engineering-approval-only —
 * they are engineering-sensitive and must go through the approval workflow.
 */
const SALES_SELECTABLE_CATEGORIES = ['panel', 'inverter', 'structure_material'];
// Project Head default for a slot: keyed by `tier:size` (tier-specific pick),
// then `size` (all tiers), then `tier:*`, then `*`. Returns a componentId or null.
function phDefaultFor(slot, tier, size) {
  const d = slot?.defaults;
  if (!d || typeof d !== 'object') return null;
  return d[`${tier}:${size}`] ?? d[size] ?? d[`${tier}:*`] ?? d['*'] ?? null;
}
// Sales may change a slot when the Project Head opened it (slot.salesSwap === true).
// A slot with NO salesSwap flag (catalog-only, no approved pack config yet) falls
// back to the legacy SALES_SELECTABLE_CATEGORIES contract.
function slotSalesSwappable(slot) {
  if (typeof slot?.salesSwap === 'boolean') return slot.salesSwap;
  return SALES_SELECTABLE_CATEGORIES.includes(slot?.category);
}


/**
 * Get approved alternative components for selectable categories.
 *
 * When `actorRole` is a Sales role, alternatives are restricted to the
 * `approvedAlternates` list from the matching package in the registry.
 * Non-Sales roles see every catalog item that passes tier/phase/status.
 *
 * @param {Object} config
 * @param {string} config.systemType
 * @param {string} config.size
 * @param {string} config.tier
 * @param {string} [config.phase]
 * @param {string} [config.category] - specific category, or omit for all selectable
 * @param {string} [config.actorRole] - caller's RBAC role
 * @returns {{ alternatives: Object, defaultSelections: Object }}
 */
function getAlternatives(config) {
  const catalog = loadCatalog(config.configSource || 'approved');
  const { systemType, size, tier, actorRole } = config;
  const sysSize = config.futureSystemSize ? String(config.futureSystemSize) : String(size);

  const template = catalog.bomTemplates?.[systemType];
  if (!template) throw new Error(`No BOM template for system type "${systemType}"`);

  const profileKey = getProfileKey(systemType, tier);
  const profile = catalog.packageProfiles?.[profileKey] || null;
  const isThreePhase = config.phase === '3P' || template.threePhase?.includes(sysSize);
  const batQty = (systemType === 'hybrid')
    ? ((config.batteryQuantity === 0 || config.batteryQuantity === 1 || config.batteryQuantity === 2) ? config.batteryQuantity : (profile?.batteryIncluded ? (profile.batteryQuantity || 1) : 0))
    : 0;
  const phase = isThreePhase ? '3P' : '1P';
  // Least privilege: an unknown / missing actor role is treated as Sales
  // (salesSwap slots only, no reference prices). PH/Admin routes pass actorRole.
  const isSales = !actorRole || isSalesRole(actorRole);

  const registry = loadRegistry();
  const registryPkg = findRegistryPackage(registry, { systemType, size: sysSize, tier, phase });

  const wanted = config.category ? [config.category] : null;

  const alternatives = {};
  const defaultSelections = {};
  const slotsOut = [];

  for (const slot of (template.slots || [])) {
    if (wanted && !wanted.includes(slot.category)) continue;
    // Sales sees only the slots the Project Head opened for swapping.
    if (isSales && !slotSalesSwappable(slot)) continue;
    // Battery-dependent slots vanish when the pack has no battery.
    if (slot.category === 'battery' || slot.category === 'mccb_box') { if (batQty === 0) continue; }

    const category = catalog.categories?.[slot.category];
    if (!category) continue;

    const phaseFilter = item => {
      if (slot.filterType === 'hybrid') return item.type === 'hybrid';
      if (slot.filterType === 'ongrid') { if (item.type && item.type !== 'ongrid') return false; }
      if (slot.filterPhase === 'HYB') {
        if (!item.phase?.includes('HYB')) return false;
        return isThreePhase ? item.phase?.includes('3P') : item.phase?.includes('1P');
      }
      if (isThreePhase && item.phase) return item.phase === '3P' || item.phase.includes('3P');
      if (!isThreePhase && item.phase) return item.phase === '1P' || item.phase.includes('1P') || !item.phase;
      return true;
    };
    // 2026-09-09 — an item without a positive reference price is never offered
    // to Sales as a swap: the swap price delta would be computed against ₹0
    // and silently cut the customer price (a "New Solar Panel" at ₹0 sat in
    // the owner's catalog). PH/Admin still see it in Items & Prices to fix.
    const pricedFilter = item => Number.isFinite(Number(item.price)) && Number(item.price) > 0;
    const statusFilter = item => (item.status || 'ACTIVE') === 'ACTIVE' && (item.approvalStatus || 'APPROVED') === 'APPROVED' && pricedFilter(item);
    let available = category.items.filter(item => item.tiers?.includes(tier) && statusFilter(item) && phaseFilter(item));
    if (available.length === 0) continue;

    // PH default (same order as buildBom)
    const defSize = slot.category === 'panel' ? String(size) : sysSize;
    const phDefaultId = phDefaultFor(slot, tier, defSize);
    const registryRec = (registryPkg?.components || []).find(c => c.role === slot.category);
    const registryCid = registryRec?.componentId || registryRec?.pinnedComponentId || null;
    let defaultItem = null;
    if (phDefaultId) defaultItem = available.find(i => i.id === phDefaultId) || null;
    if (!defaultItem && registryCid) defaultItem = available.find(i => i.id === registryCid) || null;
    if (!defaultItem && slot.category === 'inverter' && available.some(i => i.kw)) {
      const targetKw = parseFloat(sysSize) || 0;
      defaultItem = [...available].sort((a, b) => Math.abs((a.kw || 0) - targetKw) - Math.abs((b.kw || 0) - targetKw))[0];
    }
    if (!defaultItem) defaultItem = available[0];

    // Approved alternatives: slot list (PH) → legacy registry list → every eligible item
    const listed = Array.isArray(slot.alternatives) && slot.alternatives.length ? slot.alternatives : (getApprovedAlternateIds(registryPkg, slot.category) || null);
    if (listed) available = available.filter(item => listed.includes(item.id) || item.id === defaultItem.id);

    // Sales-safe shape — no procurement cost; the reference price stays for PH/Admin.
    alternatives[slot.category] = available.map(item => ({
      id: item.id, name: item.name, brand: item.brand || null, watt: item.watt || null, kw: item.kw || null,
      type: item.type || null, phase: item.phase || null, warranty: item.warrantyYears ?? item.warranty ?? null,
      dcr: item.dcr || null,
      isDefault: item.id === defaultItem.id,
      ...(isSales ? {} : { price: item.price ?? null, panelType: item.panelType || null }),
    }));
    defaultSelections[slot.category] = defaultItem.id;
    slotsOut.push({ category: slot.category, label: slot.label || slot.category, salesSwap: slotSalesSwappable(slot), defaultId: defaultItem.id });
  }

  return { alternatives, defaultSelections, slots: slotsOut, systemConfig: { systemType, size, systemSize: sysSize, tier, phase, batteryQuantity: batQty, configSource: catalog._packConfigSource } };
}

module.exports = { buildBom, buildAllTierBoms, getProfileKey, getAlternatives, SALES_SELECTABLE_CATEGORIES, stripCostFieldsForSales, isSalesRole, setPackConfigProvider, loadCatalog };

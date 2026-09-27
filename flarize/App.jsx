import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import enLocale from './locales/en.json';
import mlLocale from './locales/ml.json';

const API = '/api';
const LOCALES = { en: enLocale, ml: mlLocale };

// --- i18n helper ---
function useI18n(lang) {
  const t = useCallback((key) => {
    return LOCALES[lang]?.[key] || LOCALES.en[key] || key;
  }, [lang]);
  return t;
}

// --- Customer quotation: 14-row specification table from BOM data ---
function buildSpecTable(lines, sysType = 'ongrid', batConfig = '0', structLabel = 'GI') {
  // Helper: find first BOM line by category
  const findByCat = (cat) => lines.find(l => l.category === cat);
  const findAllByCat = (cat) => lines.filter(l => l.category === cat);
  const findStructure = () => lines.find(l => l.isStructure);

  const panel = findByCat('panel');
  const inverter = findByCat('inverter') || findByCat('enphase') || findByCat('hoymiles');
  const battery = findByCat('battery');
  const dcdb = findByCat('dcdb');
  const acdb = findByCat('acdb');
  const meter = findByCat('meter');
  const dcCable = findByCat('dc_cable');
  const acCable = findByCat('ac_cable');
  const isolator = findByCat('isolator');
  const earthCable = findByCat('earth_cable');
  const cbRod = findByCat('cb_rod');
  const laCable = findByCat('la_cable');
  const structure = findStructure();

  // Extract brand from name (first word or before first space)
  const getBrand = (item) => item?.brand || (item?.name || '').split(' ')[0] || '-';
  // Extract watt from panel
  const panelWatt = panel?.watt || (panel?.name?.match(/(\d{3,4})\s*W/i)?.[1]) || '-';
  const panelType = panel?.panelType || (panel?.dcr ? 'DCR' : 'NON_DCR');
  // Extract sqmm from cable
  const getSqmm = (item) => item?.sqmm ? `${item.sqmm} sqmm` : (item?.name?.match(/(\d+\.?\d*)\s*sq/i)?.[1] + ' sqmm' || '-');
  // Inverter type — now reads from BOM line's propagated `type` field
  const invType = inverter?.type === 'hybrid' ? 'Hybrid' : inverter?.type === 'micro' ? 'Micro' : 'On-Grid';

  const isHybrid = sysType === 'hybrid';

  const rows = [
    { label: 'Solar Module Brand', value: getBrand(panel), detail: panel?.name || '-' },
    { label: 'Module Power (W) & Type', value: `${panelWatt}W ${panelType}`, detail: panel ? `${panel.qty} nos` : '-' },
    { label: 'Panel Warranty', value: '25 Years Performance Warranty', detail: 'As per manufacturer' },
    { label: 'Inverter Type', value: invType, detail: inverter?.name || '-' },
    { label: 'Inverter Brand & Warranty', value: getBrand(inverter), detail: inverter ? `${inverter.qty} nos - 5 Year Warranty` : '-' },
  ];

  // Battery rows — only for hybrid systems
  if (isHybrid) {
    if (battery && battery.qty > 0 && batConfig !== '0') {
      rows.push(
        { label: 'Battery', value: getBrand(battery), detail: `${battery.name} — ${battery.qty} nos` },
        { label: 'Battery Capacity', value: battery.kwh ? `${battery.kwh} kWh` : '-', detail: batConfig === '2' ? `${batConfig} units (total ${(battery.kwh || 0) * battery.qty} kWh)` : '1 unit' }
      );
    } else {
      rows.push(
        { label: 'Battery', value: 'Hybrid Ready (No Battery Installed)', detail: 'Battery can be added later' }
      );
    }
  }

  rows.push(
    { label: 'Mounting Structure', value: structure ? `${structLabel} Galvanized` : '-', detail: structure?.name || 'MS Structure' },
    { label: 'DCDB / ACDB', value: [dcdb, acdb].filter(Boolean).map(d => d.name).join(' + ') || '-', detail: '' },
    { label: 'Energy Meter', value: meter?.name || 'Net Meter (KSEB Approved)', detail: meter ? `${meter.qty} nos` : '1 nos' },
    { label: 'DC Cable', value: dcCable ? getSqmm(dcCable) : '-', detail: dcCable?.name || '-' },
    { label: 'AC Cable', value: acCable ? getSqmm(acCable) : '-', detail: acCable?.name || '-' },
    { label: 'AC Isolator', value: isolator?.name || '-', detail: isolator ? `${isolator.qty} nos` : '-' },
    { label: 'Earthing Wire', value: earthCable?.name || '-', detail: earthCable ? `${earthCable.qty} ${earthCable.unit || 'mtr'}` : '-' },
    { label: 'Earthing Rod', value: cbRod?.name || '-', detail: cbRod ? `${cbRod.qty} nos` : '-' },
    { label: 'LA Down Conductor', value: laCable?.name || '-', detail: laCable ? `${laCable.qty} ${laCable.unit || 'mtr'}` : '-' },
  );

  return rows;
}

// Engineering-level items hidden in sales view
const ENGINEERING_CATEGORIES = new Set([
  'mc4_connector', 'cable_tie', 'flexible_pipe', 'ss_screw',
  'copper_lug', 'insulation_tape', 'conduit_pipe', 'solar_clamp',
  'structure_material', 'painting_material', 'welding_material',
  'meter_box', 'battery_cable'
]);

function isEngineeringItem(line) {
  if (line.category && ENGINEERING_CATEGORIES.has(line.category)) return true;
  if (!line.isVariable && !line.isStructure && !line.isAddOn && !line.isEnphase && !line.category) {
    // Fixed items: check name for engineering components
    const n = (line.name || '').toLowerCase();
    return /mc4|connector|lug|cable tie|washer|bolt|screw|clamp|tape|sleeve|gland|saddle|bend|elbow|plug|conduit|flexible pipe|cotton|thinner|primer|roller|silicon|cutting|welding|epoxy|anchor|corroshield|end cap|panel.*earth.*nut|insulation/i.test(n);
  }
  return false;
}

function fmt(n) {
  const num = Number(n || 0);
  if (num === 0) return '\u20B90';
  return '\u20B9' + num.toLocaleString('en-IN');
}

// Category display order for admin
const CAT_ORDER = [
  'panel', 'inverter', 'dcdb', 'acdb', 'meter', 'dc_cable', 'ac_cable',
  'isolator', 'cb_rod', 'earth_cable', 'la_cable', 'battery', 'enphase',
  'hoymiles', 'armoured_cable', 'mccb_box', 'ug_cable'
];

// ==================== STRUCTURE COST HELPERS ====================
// Get qty for a structure item at a given kW, interpolating between defined sizes
function getStructureQty(item, kw) {
  const qtyMap = item.qty;
  const sizes = Object.keys(qtyMap).map(Number).sort((a, b) => a - b);
  if (kw <= sizes[0]) return qtyMap[String(sizes[0])];
  if (kw >= sizes[sizes.length - 1]) {
    // Scale linearly from last defined size
    const last = sizes[sizes.length - 1];
    return Math.ceil(qtyMap[String(last)] * kw / last);
  }
  // Find bracketing sizes and interpolate
  for (let i = 0; i < sizes.length - 1; i++) {
    if (kw >= sizes[i] && kw <= sizes[i + 1]) {
      const lo = sizes[i], hi = sizes[i + 1];
      const loQty = qtyMap[String(lo)], hiQty = qtyMap[String(hi)];
      const ratio = (kw - lo) / (hi - lo);
      return Math.ceil(loQty + ratio * (hiQty - loQty));
    }
  }
  return qtyMap[String(sizes[sizes.length - 1])];
}

// Calculate total structure cost for a template at given kW and tube rate
function calcStructureCost(template, kw, ratePerKg) {
  if (!template || !template.items) return { total: 0, lines: [] };
  let total = 0;
  const lines = [];
  for (const item of template.items) {
    const qty = getStructureQty(item, kw);
    let cost;
    if (item.type === 'tube') {
      cost = Math.round(item.weightKg * ratePerKg * qty);
    } else {
      cost = Math.round((item.price || 0) * qty);
    }
    total += cost;
    lines.push({ name: item.name, type: item.type, qty, cost, isTube: item.type === 'tube', weightKg: item.weightKg });
  }
  return { total, lines };
}

// --- Upgrade-specific specification table (delta items only, no engineering BOM) ---
function buildUpgradeSpecTable(lines, upgradeSections, structLabel = 'GI') {
  const findByCat = (cat) => lines.find(l => l.category === cat);
  const getBrand = (item) => item?.brand || (item?.name || '').split(' ')[0] || '-';

  const rows = [];
  const panel = findByCat('panel');
  if (panel) {
    const panelWatt = panel.watt || (panel.name?.match(/(\d{3,4})\s*W/i)?.[1]) || '-';
    rows.push(
      { label: 'New Solar Panels', value: getBrand(panel), detail: `${panel.name} — ${panel.qty} nos` },
      { label: 'Panel Power & Type', value: `${panelWatt}W`, detail: panel.qty ? `${panel.qty} panels added` : '-' }
    );
  }

  const inverter = findByCat('inverter');
  if (inverter) {
    const invType = inverter.type === 'hybrid' ? 'Hybrid' : inverter.type === 'micro' ? 'Micro' : 'On-Grid';
    rows.push(
      { label: 'Inverter (Upgrade)', value: `${invType} — ${getBrand(inverter)}`, detail: inverter.name || '-' },
      { label: 'Inverter Warranty', value: '5 Year Warranty', detail: 'As per manufacturer' }
    );
  }

  const battery = findByCat('battery');
  if (upgradeSections?.battery && upgradeSections?.hybridInv) {
    if (battery && battery.qty > 0) {
      rows.push(
        { label: 'Battery', value: getBrand(battery), detail: `${battery.name} — ${battery.qty} nos` },
        { label: 'Battery Capacity', value: battery.kwh ? `${battery.kwh} kWh` : '-', detail: battery.qty > 1 ? `${battery.qty} units` : '1 unit' }
      );
    } else {
      rows.push({ label: 'Battery', value: 'Hybrid Ready (No Battery)', detail: 'Can be added later' });
    }
  }

  if (upgradeSections?.structure) {
    const structure = lines.find(l => l.isStructure || l.category === 'structure_material');
    rows.push({ label: 'Mounting Structure', value: `${structLabel} Galvanized`, detail: structure?.name || 'For new panels' });
  }

  const dcdb = findByCat('dcdb');
  const acdb = findByCat('acdb');
  if (dcdb || acdb) {
    rows.push({ label: 'DCDB / ACDB', value: [dcdb, acdb].filter(Boolean).map(d => d.name).join(' + ') || '-', detail: 'Upgraded' });
  }

  const dcCable = findByCat('dc_cable');
  const acCable = findByCat('ac_cable');
  if (dcCable) rows.push({ label: 'DC Cable', value: dcCable.name || '-', detail: `${dcCable.qty} m` });
  if (acCable) rows.push({ label: 'AC Cable', value: acCable.name || '-', detail: `${acCable.qty} m` });

  const meter = lines.filter(l => l.category === 'meter');
  if (meter.length > 0) {
    rows.push({ label: 'Energy Meter', value: meter.map(m => m.name).join(', '), detail: `${meter.length} nos` });
  }

  // Services
  rows.push(
    { label: 'Installation & Commissioning', value: 'Included', detail: '✓' },
    { label: 'Testing & Handover', value: 'Included', detail: '✓' }
  );

  return rows;
}

// --- Derive package profile key from UI state (config-driven, never hardcoded) ---
function getProfileKey(sysType, tier, batConfig) {
  // B.8 (locked 2.2) — On-grid Premium routes to explicit ongrid_premium profile,
  // never to the global 'premium' fallback. Hybrid Premium keeps its own key.
  if (tier === 'premium') {
    if (sysType === 'ongrid') return 'ongrid_premium';
    if (sysType === 'hybrid') return 'hybrid_premium';
    return 'premium';
  }
  if (sysType === 'hybrid') return batConfig !== '0' ? 'hybrid_bat' : 'hybrid_nobat';
  return `ongrid_${tier}`; // ongrid_base or ongrid_value
}

// --- Look up structure type from package profile config ---
function getProfileStructure(catalog, profileKey) {
  const profiles = catalog?.packageProfiles || {};
  const profile = profiles[profileKey];
  return profile?.structureType || 'GI'; // fallback GI
}

// ==================== UPGRADE PANEL COMPONENT ====================
function UpgradePanel({
  catalog, admin, isQ, mode,
  upgradeFromKw, setUpgradeFromKw, upgradeToKw, setUpgradeToKw,
  upgradePhase, setUpgradePhase,
  upgradeTier, setUpgradeTier,
  upgradeSections, setUpgradeSections,
  upgradeBom, handleSelection, handleQtyChange,
  distKm, setDistKm,
  mrInput, setMrInput, mrSaved, setMrSaved,
  authHeaders, refreshCatalog,
  marginType, setMarginType, marginVal, setMarginVal,
  costOvr, setCostOvr, fmt,
  discountCalc, offers, selectedOffer, setSelectedOffer,
  subsidyType, setSubsidyType, ghsHouses, setGhsHouses,
  handleUpgradePriceChange,
  upgradeAddOns, setUpgradeAddOns,
  upgradeCustomItems, addUpgradeCustom, removeUpgradeCustom, updateUpgradeCustom,
  clearUpgradeCustom,
  upgradeStringConfig
}) {
  const bom = upgradeBom;
  const kwOptions = [3, 5, 6, 8, 10, 15, 20, 25, 30];
  const fromKw = parseFloat(upgradeFromKw) || 3;
  const toKw = parseFloat(upgradeToKw) || 5;

  const tierColors = { base: 'bg-orange-500', value: 'bg-emerald-600', premium: 'bg-purple-600' };

  return (
    <div className="space-y-4">
      {/* Upgrade Config */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 no-print">
        {/* From → To */}
        <div className="p-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--ink-1)' }}>Upgrade Path</label>
          <div className="flex items-center gap-2">
            <select value={upgradeFromKw} onChange={e => {
              setUpgradeFromKw(e.target.value);
              if (parseFloat(e.target.value) >= parseFloat(upgradeToKw)) {
                const next = kwOptions.find(k => k > parseFloat(e.target.value));
                if (next) setUpgradeToKw(String(next));
              }
            }} className="flex-1 px-2 py-2 border rounded text-sm font-semibold bg-white focus:outline-none" style={{ borderColor: 'var(--line)' }}>
              {kwOptions.filter(k => k < Math.max(...kwOptions)).map(k => (
                <option key={k} value={k}>{k} kW</option>
              ))}
            </select>
            <span className="font-bold text-lg" style={{ color: 'var(--accent)' }}>→</span>
            <select value={upgradeToKw} onChange={e => setUpgradeToKw(e.target.value)}
              className="flex-1 px-2 py-2 border rounded text-sm font-semibold bg-white focus:outline-none" style={{ borderColor: 'var(--line)' }}>
              {kwOptions.filter(k => k > fromKw).map(k => (
                <option key={k} value={k}>{k} kW</option>
              ))}
            </select>
          </div>
          <p className="text-xs mt-1 font-medium" style={{ color: 'var(--accent)' }}>
            Adding ~{bom.newPanels} new panels ({toKw - fromKw}kW extra)
          </p>
        </div>

        {/* Phase Selector */}
        <div className="p-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--ink-1)' }}>Target Phase</label>
          <div className="flex gap-1">
            {[
              { key: '1P', label: 'Single Phase (1P)' },
              { key: '3P', label: 'Three Phase (3P)' }
            ].map(p => (
              <button key={p.key} onClick={() => setUpgradePhase(p.key)}
                className={`pill-btn flex-1 ${upgradePhase === p.key ? 'active' : ''}`}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-xs mt-1 font-medium" style={{ color: 'var(--ink-2)' }}>
            {upgradePhase === '3P' ? 'Inverter, ACDB = 3P' : 'Inverter, ACDB = 1P'} — DCDB always 2/2
            {upgradePhase === '3P' && ' · + 3P Meter, Meter Box, Isolator'}
          </p>
          {upgradeSections.hybridInv && toKw <= 5 && upgradePhase === '3P' && (
            <p className="text-xs mt-1 font-semibold" style={{ color: 'var(--red)' }}>
              ⚠ Hybrid ≤5kW: only 1P inverters available — forced to 1P
            </p>
          )}
        </div>

        {/* Tier */}
        <div className="p-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--ink-1)' }}>Package Tier</label>
          <div className="flex gap-1">
            {['base', 'value', 'premium'].map(t => (
              <button key={t} onClick={() => setUpgradeTier(t)}
                className={`pill-btn flex-1 ${upgradeTier === t ? 'active' : ''}`}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Mode + Distance */}
        <div className="p-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          <label className="block text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--ink-1)' }}>Distance</label>
          <div className="flex items-center gap-2">
            <input type="number" min="0" value={distKm}
              onChange={e => setDistKm(Number(e.target.value) || 0)}
              className="w-20 text-center text-sm border rounded px-2 py-1.5 focus:outline-none" style={{ borderColor: 'var(--line)' }} />
            <span className="text-sm text-gray-600">km</span>
            {distKm > 100 && <span className="text-xs font-semibold" style={{ color: 'var(--red)' }}>+{distKm - 100}km extra</span>}
          </div>
        </div>
      </div>

      {/* Upgrade Scope Checkboxes */}
      <div className="rounded-lg p-3 no-print" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }}></div>
          <h3 className="font-bold text-sm" style={{ color: 'var(--ink-1)' }}>What's being upgraded?</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'panels', label: 'New Panels', desc: 'panels only' },
            { key: 'structure', label: 'Structure', desc: 'frame + hardware + painting' },
            { key: 'inverter', label: 'Inverter', desc: 'ongrid + DCDB + ACDB', hide: upgradeSections.hybridInv },
            { key: 'hybridInv', label: 'Hybrid Inverter', desc: 'replaces ongrid inverter' },
            { key: 'battery', label: 'Battery', desc: '+ MCCB box', disabled: !upgradeSections.hybridInv },
            { key: 'wiring', label: 'Wiring', desc: 'DC/AC cable + conduit' }
          ].filter(s => !s.hide).map(s => (
            <label key={s.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition
              ${s.disabled ? 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-50' :
                upgradeSections[s.key] ? 'bg-white shadow-sm' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'}`}
              style={!s.disabled && upgradeSections[s.key] ? { border: '1px solid var(--accent)' } : undefined}>
              <input type="checkbox" checked={upgradeSections[s.key] || false}
                disabled={s.disabled}
                onChange={e => {
                  const next = { ...upgradeSections, [s.key]: e.target.checked };
                  // If hybrid inverter unchecked, also uncheck battery
                  if (s.key === 'hybridInv' && !e.target.checked) next.battery = false;
                  // If hybrid inverter checked, uncheck ongrid inverter
                  if (s.key === 'hybridInv' && e.target.checked) next.inverter = false;
                  // If ongrid inverter checked, uncheck hybrid
                  if (s.key === 'inverter' && e.target.checked) { next.hybridInv = false; next.battery = false; }
                  setUpgradeSections(next);
                }}
                className="w-3.5 h-3.5 accent-amber-600" />
              <span className="font-bold text-gray-700">{s.label}</span>
              <span className="text-gray-400 font-normal">{s.desc}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Extra Structure Add-On */}
      <div className="rounded-xl p-3 no-print" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }}></div>
          <h3 className="font-bold text-sm" style={{ color: 'var(--ink-1)' }}>Extra Structure (New Panels)</h3>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={upgradeAddOns.structure.enabled}
              onChange={e => setUpgradeAddOns(p => ({ ...p, structure: { ...p.structure, enabled: e.target.checked } }))}
              className="w-4 h-4 accent-amber-600 rounded" />
            <span className="text-sm font-semibold" style={{ color: 'var(--ink-1)' }}>Add structure for new panels</span>
          </label>
          {upgradeAddOns.structure.enabled && (
            <>
              <select value={upgradeAddOns.structure.type}
                onChange={e => setUpgradeAddOns(p => ({ ...p, structure: { ...p.structure, type: e.target.value } }))}
                className="text-xs border rounded px-2 py-1 bg-white focus:outline-none" style={{ borderColor: 'var(--line)' }}>
                <option value="elevated">Elevated</option>
                <option value="sheet">Sheet Roof</option>
              </select>
              <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>{fmt(bom.upgradeStructureAddOnTotal)}</span>
            </>
          )}
        </div>
        {upgradeAddOns.structure.enabled && bom.upgradeStructureAddOnTotal > 0 && (
          <div className="mt-2 space-y-1 pl-6 text-xs" style={{ color: 'var(--ink-2)' }}>
            <div className="flex justify-between">
              <span>Material Extra ({bom.upgradeStructureExtraLabel} − Flat Roof)</span>
              <span className="font-medium">{fmt(bom.upgradeStructureExtraCost)}</span>
            </div>
            <div className="flex justify-between">
              <span>Labor Charge</span>
              <span className="font-medium">{fmt(bom.upgradeStructureLabor)}</span>
            </div>
            {bom.upgradeStructureRepairAmt > 0 && (
              <div className="flex justify-between">
                <span>Repair Margin</span>
                <span className="font-medium">{fmt(bom.upgradeStructureRepairAmt)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Variable Items - Brand Selection */}
      <details className="rounded-lg no-print overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)' }} open>
        <summary className="p-3 cursor-pointer font-semibold text-sm select-none" style={{ color: 'var(--ink-1)' }}>
          Select Brand / Model (Upgrade)
        </summary>
        <div className="p-3 pt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {bom.lines.filter(l => l.isVariable).map(line => (
            <div key={line.pos} className="bg-white p-2 rounded border border-gray-200">
              <label className="text-xs font-bold text-gray-700">{line.label}</label>
              <select
                value={line.catalogItemId || ''}
                onChange={e => handleSelection(line.pos, e.target.value, line.category)}
                className="w-full mt-1 px-2 py-1.5 border border-amber-300 rounded text-xs bg-white focus:ring-1 focus:ring-amber-400 focus:outline-none">
                {(admin ? (line.available || []) : (line.allAvailable || line.available || [])).map(item => {
                  const isCrossTier = !admin && line.available && !line.available.find(x => x.id === item.id);
                  const tierTag = isCrossTier ? ` [${(item.tiers || []).filter(t => t !== upgradeTier).join('/')}]` : '';
                  return (
                    <option key={item.id} value={item.id}>
                      {item.name}{tierTag}{admin && item.price ? ` — ${fmt(item.price)}` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          ))}
        </div>
      </details>

      {/* BOM Table — Admin: full engineering BOM, Non-Admin: upgrade spec table */}
      {admin ? (
      <>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bom-table">
            <tr>
              <th className="px-2 py-2.5 text-left text-xs font-semibold w-8">#</th>
              <th className="px-2 py-2.5 text-left text-xs font-semibold">Material / Brand</th>
              <th className="px-2 py-2.5 text-center text-xs font-semibold w-16">Qty</th>
              <th className="px-2 py-2.5 text-left text-xs font-semibold w-10">Unit</th>
              {isQ && <th className="px-2 py-2.5 text-right text-xs font-semibold w-24">Price</th>}
              {isQ && <th className="px-2 py-2.5 text-right text-xs font-semibold w-24">Amount</th>}
              {isQ && <th className="px-2 py-2.5 text-center text-xs font-semibold w-14">GST%</th>}
            </tr>
          </thead>
          <tbody>
            {bom.lines.map((item, i) => {
              const bg = item.isVariable ? 'bg-amber-50' : (i % 2 === 0 ? 'bg-white' : 'bg-gray-50');
              return (
                <tr key={`${item.pos}_${i}`} className={`${bg} border-b border-gray-100 hover:bg-blue-50 transition`}>
                  <td className="px-2 py-1.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    {item.isVariable ? (
                      <select value={item.catalogItemId || ''} onChange={e => handleSelection(item.pos, e.target.value, item.category)}
                        className={`w-full text-xs border rounded px-1 py-1 focus:ring-1 focus:outline-none ${
                          item.catalogItemId && item.available?.length > 0 && !item.available.find(a => a.id === item.catalogItemId)
                            ? 'border-orange-400 bg-orange-50 focus:ring-orange-400'
                            : 'border-amber-200 bg-amber-50 focus:ring-amber-400'
                        }`}>
                        {(item.available || []).map(a => (
                          <option key={a.id} value={a.id}>{a.name}{a.price ? ` (${fmt(a.price)})` : ''}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-800 text-xs font-medium">{item.name}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="number" min="0" step="any" value={item.qty}
                      onChange={e => handleQtyChange(item.qKey, e.target.value)}
                      className="w-14 text-center text-xs border border-gray-300 rounded px-1 py-1 focus:outline-none bg-white" />
                  </td>
                  <td className="px-2 py-1.5 text-gray-400 text-xs">{item.unit || 'nos'}</td>
                  {isQ && (
                    <td className="px-2 py-1.5 text-right">
                      <input type="number" min="0" step="any"
                        value={item.unitPrice}
                        onChange={e => {
                          const val = Number(e.target.value) || 0;
                          handleUpgradePriceChange(item.pKey || `upg_p_${item.pos}`, val);
                        }}
                        className="w-20 text-right text-xs border border-gray-300 rounded px-1 py-1 focus:ring-1 focus:ring-amber-400 focus:outline-none bg-white" />
                    </td>
                  )}
                  {isQ && <td className="px-2 py-1.5 text-right text-xs font-semibold text-gray-800">{fmt(item.amount)}</td>}
                  {isQ && (
                    <td className="px-2 py-1.5 text-center">
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">9%</span>
                    </td>
                  )}
                </tr>
              );
            })}
            {upgradeCustomItems.map((ci, i) => {
              const amt = ci.qty * ci.price;
              return (
                <tr key={`uci_${ci.id}`} className="bg-purple-50 border-b border-gray-100">
                  <td className="px-2 py-1.5 text-purple-400 text-xs">{bom.lines.length + i + 1}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <input type="text" value={ci.name} onChange={e => updateUpgradeCustom(ci.id, 'name', e.target.value)}
                        className="flex-1 text-xs border border-purple-300 rounded px-1 py-1 bg-purple-50 focus:outline-none" />
                      <button onClick={() => removeUpgradeCustom(ci.id)} className="text-red-400 hover:text-red-600 text-xs font-bold">X</button>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="number" min="0" value={ci.qty} onChange={e => updateUpgradeCustom(ci.id, 'qty', e.target.value)}
                      className="w-14 text-center text-xs border border-gray-300 rounded px-1 py-1 focus:outline-none" />
                  </td>
                  <td className="px-2 py-1.5 text-gray-400 text-xs">nos</td>
                  {isQ && <td className="px-2 py-1.5 text-right">
                    <input type="number" min="0" value={ci.price} onChange={e => updateUpgradeCustom(ci.id, 'price', e.target.value)}
                      className="w-20 text-right text-xs border border-blue-300 rounded px-1 py-1 bg-blue-50 focus:outline-none" />
                  </td>}
                  {isQ && <td className="px-2 py-1.5 text-right text-xs font-semibold text-gray-800">{fmt(amt)}</td>}
                  {isQ && <td className="px-2 py-1.5 text-center">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">9%</span>
                  </td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 text-xs flex-wrap no-print">
        <button onClick={addUpgradeCustom} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>+ Add Custom Item</button>
        {upgradeCustomItems.length > 0 && <button onClick={clearUpgradeCustom} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>Clear Custom Items</button>}
      </div>
      </>
      ) : (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }}></div>
          <h3 className="font-bold text-sm" style={{ color: 'var(--ink-1)' }}>Upgrade Specification — Additional Components</h3>
        </div>
        {(() => {
          const upProfKey = getProfileKey('ongrid', upgradeTier, '0');
          const upStructLabel = getProfileStructure(catalog, upProfKey);
          const upgradeSpec = buildUpgradeSpecTable(bom.lines, upgradeSections, upStructLabel);
          return (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--line)' }}>
              <table className="bom-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>Particulars</th>
                    <th className="text-center" style={{ minWidth: 140 }}>Specification</th>
                    <th className="text-center" style={{ minWidth: 100 }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {upgradeSpec.map((row, i) => (
                    <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-100`}>
                      <td className="px-2 py-1.5 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-2 py-1.5 text-gray-800 text-xs font-semibold">{row.label}</td>
                      <td className="px-2 py-1.5 text-center text-xs text-gray-700 font-medium">{row.value}</td>
                      <td className="px-2 py-1.5 text-center text-xs text-gray-500">{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
      )}

      {/* ===== UPGRADE STRING CONFIGURATION ===== */}
      {upgradeStringConfig && (
        <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: '#2563eb', background: '#eff6ff' }}>
          <div className="flex items-center gap-2">
            <span className="text-lg">⚡</span>
            <h3 className="font-bold text-sm" style={{ color: '#1e40af' }}>String Configuration — Upgrade Design</h3>
            {upgradeStringConfig.isValid ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">VALID</span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">ISSUES</span>
            )}
          </div>

          {/* MPPT Allocation for Upgrade (existing + new) */}
          <div className="bg-white rounded-lg p-3 border border-blue-300">
            <p className="text-xs font-bold text-gray-700 mb-2">MPPT Allocation — {upgradeStringConfig.panelsPerString} panels/string optimal</p>
            <div className="space-y-1">
              {upgradeStringConfig.mpptAllocation.map(m => (
                <div key={m.mppt} className="flex items-center gap-2 text-xs">
                  <span className="w-20 font-bold text-blue-700">MPPT {m.mppt}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${m.label === 'Existing System' ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-700'}`}>{m.label}</span>
                  <span className="text-gray-600">{m.strings} string{m.strings > 1 ? 's' : ''} × {m.panelsPerString} panels = {m.totalPanels} panels</span>
                </div>
              ))}
            </div>
          </div>

          {/* DC Cable */}
          <div className="flex items-center gap-2 text-xs bg-white rounded-lg px-3 py-2 border border-blue-200">
            <span className="font-bold text-gray-700">DC Cable Recommended:</span>
            <span className="font-bold text-blue-700">{upgradeStringConfig.dcCableRecommended}m</span>
          </div>

          {/* Warnings */}
          {upgradeStringConfig.warnings.length > 0 && (
            <div className="space-y-1">
              {upgradeStringConfig.warnings.map((w, i) => (
                <div key={i} className={`text-xs px-3 py-2 rounded-lg font-medium ${
                  w.type === 'critical' ? 'bg-red-100 text-red-800 border border-red-300' :
                  w.type === 'warning' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                  'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  {w.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin Cost & Pricing Section */}
      {admin && isQ && (
        <div className="space-y-4 no-print">
          {/* Summary */}
          <div className="p-4 rounded-lg space-y-2" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
            <div className="flex justify-between text-xs text-gray-700"><span>Material Total (pre-GST)</span><span className="font-medium">{fmt(bom.totals.matTotal)}</span></div>
            <div className="flex justify-between text-xs text-green-700"><span>GST @9%</span><span className="font-medium">{fmt(bom.totals.totalGst)}</span></div>
            <div className="flex justify-between text-xs text-gray-800 font-semibold border-t pt-1"><span>Material Total (incl GST)</span><span>{fmt(bom.totals.matWithGst)}</span></div>
            <div className="flex justify-between text-xs text-gray-600"><span>Installation ({toKw - fromKw}kW new)</span><span>{fmt(bom.costCalc.installation)}</span></div>
            {bom.costCalc.transportation > 0 && <div className="flex justify-between text-xs text-gray-600"><span>Transportation ({distKm}km)</span><span>{fmt(bom.costCalc.transportation)}</span></div>}
            <div className="flex justify-between text-xs text-gray-600"><span>Miscellaneous</span><span>{fmt(bom.costCalc.miscellaneous)}</span></div>
            <div className="flex justify-between text-xs text-gray-600"><span>Office Expense</span><span>{fmt(bom.costCalc.office)}</span></div>
            {bom.upgradeStructureAddOnTotal > 0 && (
              <div className="flex justify-between text-xs" style={{ color: 'var(--accent)' }}><span>Extra Structure ({bom.upgradeStructureExtraLabel})</span><span className="font-medium">{fmt(bom.upgradeStructureAddOnTotal)}</span></div>
            )}
            <div className="flex justify-between text-xs text-gray-700 border-t pt-1"><span>Subtotal</span><span className="font-medium">{fmt(bom.sub)}</span></div>
            <div className="flex justify-between text-xs text-gray-700"><span>Profit {marginType === 'percent' ? `(${marginVal}%)` : ''}</span><span className="font-medium">+ {fmt(bom.mAmt)}</span></div>
            <div className="border-t-2 pt-2 flex justify-between font-bold text-lg">
              <span className="text-gray-800">Actual Cost (with Profit)</span>
              <span style={{ color: 'var(--accent)' }}>{fmt(bom.grand)}</span>
            </div>
          </div>

          {/* Market Rate */}
          <div className="p-4 rounded-lg border-2 border-amber-400 bg-amber-50 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
              <h3 className="font-bold text-sm text-amber-900">Market Rate — Upgrade {Math.round(fromKw)}kW → {Math.round(toKw)}kW</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">₹</span>
              <input type="number" min="0"
                value={mrInput[bom.mrKey] !== undefined ? mrInput[bom.mrKey] : (bom.marketRate || '')}
                onChange={e => setMrInput(prev => ({ ...prev, [bom.mrKey]: e.target.value }))}
                className="w-40 text-right text-sm border border-amber-300 rounded px-3 py-2 bg-white font-semibold focus:outline-none" />
              <button type="button" onClick={async () => {
                try {
                  const val = mrInput[bom.mrKey] !== undefined && mrInput[bom.mrKey] !== '' ? Number(mrInput[bom.mrKey]) : bom.marketRate;
                  const payload = {
                    [bom.mrKey]: { rate: val || 0 },
                    [bom.mrKey + '_diffBase']: { rate: bom.priceDiffTotal || 0 }
                  };
                  const r = await fetch(`${API}/admin/market-rates`, {
                    method: 'PUT', headers: authHeaders,
                    body: JSON.stringify(payload)
                  });
                  if (!r.ok) { setMrSaved('Error: ' + r.status); return; }
                  await r.json();
                  setMrSaved(`Upgrade rate updated: ${fmt(val || 0)}`);
                  refreshCatalog();
                  setTimeout(() => setMrSaved(''), 5000);
                } catch (err) { setMrSaved('Network error'); }
              }} className="px-4 py-2 bg-amber-500 text-white font-bold rounded text-sm hover:bg-amber-600 transition">Save Rate</button>
            </div>
            {mrSaved && (
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded text-sm font-bold ${mrSaved.startsWith('Error') || mrSaved.startsWith('Network') ? 'bg-red-100 border-2 border-red-400 text-red-800' : 'bg-green-100 border-2 border-green-400 text-green-800'}`}>
                <span>{mrSaved.startsWith('Error') || mrSaved.startsWith('Network') ? '✗' : '✓'}</span> {mrSaved}
              </div>
            )}
            {bom.marketRate > 0 && (
              <div className="mt-2 p-3 bg-white rounded-lg border border-amber-200 grid grid-cols-3 gap-3 text-xs">
                <div><span className="text-gray-500 block">Actual Cost</span><span className="font-bold text-base">{fmt(bom.grand)}</span></div>
                <div><span className="text-gray-500 block">Market Rate</span><span className="font-bold text-base text-amber-700">{fmt(bom.marketRate)}</span></div>
                <div><span className="text-gray-500 block">Margin</span>
                  <span className={`font-bold text-base ${bom.marketRate >= bom.grand ? 'text-green-700' : 'text-red-600'}`}>
                    {bom.marketRate >= bom.grand ? '+' : ''}{fmt(bom.marketRate - bom.grand)}
                    {bom.grand > 0 && <span className="text-xs font-normal ml-1">({((bom.marketRate - bom.grand) / bom.grand * 100).toFixed(1)}%)</span>}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sales Team Price Summary (non-admin) */}
      {!admin && isQ && (
        <div className="price-card rounded-lg overflow-hidden shadow-lg">
          <div className="p-4 text-center">
            <p className="text-white/70 text-sm mb-1">
              Upgrade {Math.round(fromKw)}kW → {Math.round(toKw)}kW — {upgradeTier.charAt(0).toUpperCase() + upgradeTier.slice(1)}
            </p>
          </div>
          <div className="bg-black/20 p-5">
            {bom.marketRate > 0 ? (
              <div className="space-y-3">
                <div className="text-center">
                  <p className="text-white/60 text-xs uppercase tracking-wider mb-1">System Price</p>
                  <p className="text-white text-3xl font-bold">{fmt(bom.customerPrice || bom.marketRate)}</p>
                  {bom.priceDiffDelta !== 0 && bom.priceDiffDelta != null && (
                    <p className={`text-xs mt-1 font-semibold ${bom.priceDiffDelta > 0 ? 'text-orange-300' : 'text-emerald-300'}`}>
                      {bom.priceDiffDelta > 0 ? '\u25B2' : '\u25BC'} Component change: {bom.priceDiffDelta > 0 ? '+' : ''}{fmt(bom.priceDiffDelta)}
                    </p>
                  )}
                </div>
                {bom.upgradeStructureAddOnTotal > 0 && (
                  <div className="bg-white/10 rounded-lg p-2">
                    <div className="flex justify-between text-white/80 text-xs">
                      <span>Extra Structure ({bom.upgradeStructureExtraLabel})</span>
                      <span className="font-semibold">{fmt(bom.upgradeStructureAddOnTotal)}</span>
                    </div>
                  </div>
                )}

                {/* Offer selector (admin-preset only) */}
                {(discountCalc.applicableOffers || []).length > 0 && (
                  <div className="bg-white/10 rounded-lg p-3 space-y-2">
                    <label className="text-white/70 text-xs font-bold uppercase tracking-wide">Apply Offer</label>
                    <select value={selectedOffer} onChange={e => setSelectedOffer(e.target.value)}
                      className="w-full px-3 py-2 rounded text-sm bg-white/90 text-gray-800 font-medium focus:outline-none">
                      <option value="">No offer</option>
                      {(discountCalc.applicableOffers || []).map(o => (
                        <option key={o.id} value={o.id}>{o.name} ({o.type === 'percent' ? o.value + '%' : fmt(o.value)} off)</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Discount line */}
                {discountCalc.discountAmt > 0 && (
                  <div className="bg-green-500/20 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between text-green-200 text-sm">
                      <span>{discountCalc.discountLabel}</span>
                      <span className="font-bold">- {fmt(discountCalc.discountAmt)}</span>
                    </div>
                    <div className="flex justify-between text-white text-sm font-bold border-t border-white/20 pt-1">
                      <span>Price after Discount</span>
                      <span>{fmt(discountCalc.finalPrice)}</span>
                    </div>
                  </div>
                )}

                {/* Final Price */}
                <div className="text-center border-t border-white/20 pt-3">
                  <p className="text-white/60 text-xs uppercase tracking-wider mb-1">
                    {discountCalc.discountAmt > 0 ? 'Discounted Price' : 'Total Price'}
                  </p>
                  <p className="text-white text-4xl font-bold">{fmt(discountCalc.finalPrice || bom.customerPrice || bom.marketRate)}</p>
                </div>

                {/* PM Surya Ghar Subsidy */}
                <div className="bg-yellow-500/20 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-yellow-200 text-xs font-bold">Subsidy Type:</label>
                    <select value={subsidyType} onChange={e => setSubsidyType(e.target.value)}
                      className="px-2 py-1 rounded text-xs bg-white/90 text-gray-800 font-medium focus:outline-none">
                      <option value="residential">Residential</option>
                      <option value="ghs">GHS / RWA</option>
                      <option value="none">No Subsidy</option>
                    </select>
                    {subsidyType === 'ghs' && (
                      <div className="flex items-center gap-1">
                        <input type="number" min="1" max="500" value={ghsHouses}
                          onChange={e => setGhsHouses(Math.max(1, Number(e.target.value) || 1))}
                          className="w-14 px-1.5 py-1 rounded text-xs bg-white/90 text-gray-800 font-medium text-center focus:outline-none" />
                        <span className="text-yellow-200 text-[10px]">houses</span>
                      </div>
                    )}
                  </div>
                  {subsidyType !== 'none' && (
                    <>
                      <div className="flex justify-between text-yellow-200 text-xs">
                        <span>{discountCalc.subsidyLabel}</span>
                        <span className="font-bold">- {fmt(discountCalc.subsidy)}</span>
                      </div>
                      <div className="flex justify-between text-white font-bold text-sm border-t border-white/20 pt-1">
                        <span>Customer Pays (after subsidy)</span>
                        <span className="text-yellow-200 text-lg">{fmt(discountCalc.priceAfterSubsidy)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-yellow-200 text-sm font-medium text-center">Price not yet configured. Contact admin.</p>
            )}
          </div>
        </div>
      )}

      {/* Item count for dispatch mode */}
      {mode !== 'quotation' && (
        <div className="p-4 rounded-lg flex justify-between items-center" style={{ background: 'var(--card-active)', border: '1px solid var(--line)' }}>
          <span className="font-semibold" style={{ color: 'var(--ink-1)' }}>Total Items</span>
          <span className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{bom.lines.length}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  // --- Core state ---
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- System config ---
  const [sysType, setSysType] = useState('ongrid');
  const [size, setSize] = useState('3');
  const [tier, setTier] = useState('value');
  const [batConfig, setBatConfig] = useState('0');
  const [mode, setMode] = useState('quotation');

  // --- Bill calculator ---
  const [billAmt, setBillAmt] = useState('');
  const [billFreq, setBillFreq] = useState('bimonthly'); // 'monthly' or 'bimonthly'
  const [showBillCalc, setShowBillCalc] = useState(false);
  const [housePhase, setHousePhase] = useState('1P'); // '1P' or '3P'

  // --- Admin ---
  const [admin, setAdmin] = useState(false);
  const [pwdInput, setPwdInput] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [pwdErr, setPwdErr] = useState(false);
  const [sessionToken, setSessionToken] = useState('');
  const [adminTab, setAdminTab] = useState('catalog');
  const [catTab, setCatTab] = useState('panel');
  const [structTab, setStructTab] = useState('flatRoof');

  // --- Micro-inverter state (premium ongrid) ---
  const [microBrand, setMicroBrand] = useState('enphase');
  const [zeroExport, setZeroExport] = useState(true);

  // --- Future upgrade (enhanced: independent inverter kW + optional components) ---
  const [futureUpgrade, setFutureUpgrade] = useState(false);
  const [upgradeSize, setUpgradeSize] = useState('');
  // Enhanced: which components to include when futureUpgrade is on
  const [fuOpts, setFuOpts] = useState({
    includeStructure: true,  // Include structure in BOM
    includeDB: true,         // Include DCDB + ACDB
    includeCables: true,     // Include DC/AC cables, conduit, earthing
    includeMeter: true,      // Include meter + meter box
  });

  // --- Existing system upgrade (separate tab) ---
  const [upgradeFromKw, setUpgradeFromKw] = useState('3');
  const [upgradeToKw, setUpgradeToKw] = useState('5');
  const [upgradePhase, setUpgradePhase] = useState('1P'); // '1P' or '3P' — applies to target system
  const [upgradeTier, setUpgradeTier] = useState('value');
  const [upgradeSelections, setUpgradeSelections] = useState({});
  const [upgradeQtyOverrides, setUpgradeQtyOverrides] = useState({});
  const [upgradePriceOverrides, setUpgradePriceOverrides] = useState({});

  // Pending fixed item price edits — keyed by `${systemType}_${index}`
  const [pendingFixedPrices, setPendingFixedPrices] = useState({});

  // Pending structure template changes — keyed by `${templateKey}_${itemIndex}_${field}`
  const [pendingStructChanges, setPendingStructChanges] = useState({});
  const [structSaving, setStructSaving] = useState(false);
  const [structSaved, setStructSaved] = useState('');
  const [fixedPriceSaving, setFixedPriceSaving] = useState(false);
  const [fixedPriceSaved, setFixedPriceSaved] = useState('');
  const [upgradeSections, setUpgradeSections] = useState({
    panels: true,       // New panels only
    structure: true,    // Structure + hardware (clamps, screws, painting, welding)
    inverter: true,     // Ongrid inverter + DCDB + ACDB
    hybridInv: false,   // Hybrid inverter (replaces ongrid inverter)
    battery: false,     // Battery + MCCB box (only with hybrid inverter)
    wiring: true        // DC cable, AC cable, conduit, connectors, lugs, tape
  });

  // --- BOM state ---
  const [selections, setSelections] = useState({});
  const [qtyOverrides, setQtyOverrides] = useState({});
  const [priceOverrides, setPriceOverrides] = useState({});
  const [customItems, setCustomItems] = useState([]);
  const [upgradeCustomItems, setUpgradeCustomItems] = useState([]);

  // --- Site add-ons (optional, all users) ---
  const [addOns, setAddOns] = useState({
    structure: { enabled: false, type: 'elevated' }, // elevated or sheet, rate from admin costs
    extraDcCable: { enabled: false, itemId: '', qty: 0 },
    extraAcCable: { enabled: false, itemId: '', qty: 0 },
    armouredCable: { enabled: false, itemId: '', qty: 0 }
  });
  const [upgradeAddOns, setUpgradeAddOns] = useState({
    structure: { enabled: false, type: 'elevated' }
  });

  // --- Customer info ---
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [salesPerson, setSalesPerson] = useState('');
  const [showQuotation, setShowQuotation] = useState(false);

  // --- Offers / Discounts ---
  const [offers, setOffers] = useState([]);       // active offers from server
  const [allOffers, setAllOffers] = useState([]);  // all offers (admin)
  const [selectedOffer, setSelectedOffer] = useState('');  // offer id or 'custom'
  const [customDiscount, setCustomDiscount] = useState({ type: 'flat', value: 0 });
  const [subsidyType, setSubsidyType] = useState('residential'); // 'residential' | 'ghs' | 'none'
  const [structGrade, setStructGrade] = useState('default'); // 'default' | 'gp' | 'gi' (admin only)
  const [structGradeMode, setStructGradeMode] = useState('manual'); // 'manual' (₹/kg) | 'flat' (₹/kW)
  const [ghsHouses, setGhsHouses] = useState(1); // number of houses for GHS/RWA calc

  // --- Cost overrides ---
  const [distKm, setDistKm] = useState(100);
  const [costOvr, setCostOvr] = useState({});
  const [marginType, setMarginType] = useState('percent');
  const [mrInput, setMrInput] = useState({});
  const [mrSaved, setMrSaved] = useState('');
  const [marginVal, setMarginVal] = useState(20);

  // --- Quotation view mode: 'admin' (full BOM) or 'sales' (customer-friendly) ---
  const [quotationViewMode, setQuotationViewMode] = useState('sales');

  // --- Language ---
  const [lang, setLang] = useState('en');
  const t = useI18n(lang);

  // --- BOM Save Persistence ---
  const [bomDirty, setBomDirty] = useState(false);
  const [bomSaving, setBomSaving] = useState(false);
  const [bomSaveMsg, setBomSaveMsg] = useState('');
  const [lastSavedState, setLastSavedState] = useState(null);
  const bomDirtyRef = useRef(false);

  // --- DCR filter for panels ---
  const [panelTypeFilter, setPanelTypeFilter] = useState('all'); // 'all' | 'DCR' | 'NON_DCR'
  const [roofType, setRoofType] = useState('flat'); // 'flat' | 'sheet' | 'elevated'

  // --- Edit state for catalog items ---
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);

  // --- Load catalog ---
  useEffect(() => {
    fetch(`${API}/catalog`)
      .then(r => r.json())
      .then(data => { setCatalog(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  // --- Sync structGradeMode from catalog ---
  useEffect(() => {
    if (catalog?.costs?.structGradeMode) {
      setStructGradeMode(catalog.costs.structGradeMode);
    }
  }, [catalog]);

  // --- Load active offers (re-fetch when admin state changes so sales view stays in sync) ---
  useEffect(() => {
    fetch(`${API}/offers`).then(r => r.json()).then(setOffers).catch(() => {});
  }, [admin]);

  // --- Load all offers when admin ---
  useEffect(() => {
    if (admin && sessionToken) {
      fetch(`${API}/admin/offers`, { headers: { 'Authorization': `Bearer ${sessionToken}` } })
        .then(r => r.json()).then(setAllOffers).catch(() => {});
    }
  }, [admin, sessionToken]);

  const refreshOffers = useCallback(() => {
    fetch(`${API}/offers`).then(r => r.json()).then(setOffers).catch(() => {});
    if (admin && sessionToken) {
      fetch(`${API}/admin/offers`, { headers: { 'Authorization': `Bearer ${sessionToken}` } })
        .then(r => r.json()).then(setAllOffers).catch(() => {});
    }
  }, [admin, sessionToken]);

  // --- Auth ---
  const handleLogin = useCallback(() => {
    fetch(`${API}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwdInput })
    })
      .then(r => {
        if (r.ok) return r.json();
        if (r.status === 429) { setPwdErr('rate'); return null; }
        setPwdErr(true);
        return null;
      })
      .then(data => {
        if (data && data.token) {
          setSessionToken(data.token);
          setShowPwd(false);
          setPwdInput('');
          setPwdErr(false);
          // Reload catalog with admin token FIRST, then set admin=true
          fetch(`${API}/catalog`, { headers: { 'Authorization': `Bearer ${data.token}` } })
            .then(r => r.json())
            .then(adminCatalog => { setCatalog(adminCatalog); setAdmin(true); });
        }
      });
  }, [pwdInput]);

  const handleLogout = useCallback(() => {
    setAdmin(false);
    setSessionToken('');
    setShowPwd(false);
    // Keep selections — priceDiffTotal no longer affects customerPrice,
    // so admin's panel/inverter picks safely carry over to non-admin view
    fetch(`${API}/catalog`).then(r => r.json()).then(setCatalog);
  }, []);

  // --- API helpers ---
  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${sessionToken}`
  }), [sessionToken]);

  const refreshCatalog = useCallback(() => {
    const headers = sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {};
    fetch(`${API}/catalog`, { headers }).then(r => r.json()).then(data => {
      setCatalog(data);
    });
  }, [sessionToken]);

  // --- BOM State Save/Load ---
  const getBomStateSnapshot = useCallback(() => ({
    selections, qtyOverrides, priceOverrides, customItems,
    upgradeSelections, upgradeQtyOverrides, upgradePriceOverrides, upgradeCustomItems,
    sysType, size, tier, batConfig, mode, distKm, costOvr, marginType, marginVal,
    subsidyType, ghsHouses, structGrade, structGradeMode,
    upgradeFromKw, upgradeToKw, upgradePhase, upgradeTier, upgradeSections,
    addOns, upgradeAddOns, microBrand, zeroExport,
    futureUpgrade, upgradeSize, fuOpts, housePhase,
    custName, custPhone, custAddress, salesPerson,
    selectedOffer, panelTypeFilter, quotationViewMode, lang, roofType,
  }), [selections, qtyOverrides, priceOverrides, customItems,
    upgradeSelections, upgradeQtyOverrides, upgradePriceOverrides, upgradeCustomItems,
    sysType, size, tier, batConfig, mode, distKm, costOvr, marginType, marginVal,
    subsidyType, ghsHouses, structGrade, structGradeMode,
    upgradeFromKw, upgradeToKw, upgradePhase, upgradeTier, upgradeSections,
    addOns, upgradeAddOns, microBrand, zeroExport,
    futureUpgrade, upgradeSize, fuOpts, housePhase,
    custName, custPhone, custAddress, salesPerson,
    selectedOffer, panelTypeFilter, quotationViewMode, lang, roofType]);

  // Track dirty state
  useEffect(() => {
    if (lastSavedState === null) return; // Not loaded yet
    const current = JSON.stringify(getBomStateSnapshot());
    const saved = JSON.stringify(lastSavedState);
    const dirty = current !== saved;
    setBomDirty(dirty);
    bomDirtyRef.current = dirty;
  }, [getBomStateSnapshot, lastSavedState]);

  // beforeunload warning
  useEffect(() => {
    const handler = (e) => {
      if (bomDirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Load BOM state on admin login
  useEffect(() => {
    if (admin && sessionToken) {
      fetch(`${API}/admin/bom-state`, { headers: { 'Authorization': `Bearer ${sessionToken}` } })
        .then(r => r.ok ? r.json() : {})
        .then(state => {
          if (state && state.savedAt) {
            // Restore saved state
            if (state.selections) setSelections(state.selections);
            if (state.qtyOverrides) setQtyOverrides(state.qtyOverrides);
            if (state.priceOverrides) setPriceOverrides(state.priceOverrides);
            if (state.customItems) setCustomItems(state.customItems);
            if (state.upgradeSelections) setUpgradeSelections(state.upgradeSelections);
            if (state.upgradeQtyOverrides) setUpgradeQtyOverrides(state.upgradeQtyOverrides);
            if (state.upgradePriceOverrides) setUpgradePriceOverrides(state.upgradePriceOverrides);
            if (state.upgradeCustomItems) setUpgradeCustomItems(state.upgradeCustomItems);
            if (state.sysType) setSysType(state.sysType);
            if (state.size) setSize(state.size);
            if (state.tier) setTier(state.tier);
            if (state.batConfig !== undefined) setBatConfig(state.batConfig);
            if (state.mode) setMode(state.mode);
            if (state.distKm !== undefined) setDistKm(state.distKm);
            if (state.costOvr) setCostOvr(state.costOvr);
            if (state.marginType) setMarginType(state.marginType);
            if (state.marginVal !== undefined) setMarginVal(state.marginVal);
            if (state.subsidyType) setSubsidyType(state.subsidyType);
            if (state.ghsHouses !== undefined) setGhsHouses(state.ghsHouses);
            if (state.structGrade) setStructGrade(state.structGrade);
            if (state.structGradeMode) setStructGradeMode(state.structGradeMode);
            if (state.upgradeFromKw) setUpgradeFromKw(state.upgradeFromKw);
            if (state.upgradeToKw) setUpgradeToKw(state.upgradeToKw);
            if (state.upgradePhase) setUpgradePhase(state.upgradePhase);
            if (state.upgradeTier) setUpgradeTier(state.upgradeTier);
            if (state.upgradeSections) setUpgradeSections(state.upgradeSections);
            if (state.addOns) setAddOns(state.addOns);
            if (state.upgradeAddOns) setUpgradeAddOns(state.upgradeAddOns);
            if (state.microBrand) setMicroBrand(state.microBrand);
            if (state.zeroExport !== undefined) setZeroExport(state.zeroExport);
            if (state.futureUpgrade !== undefined) setFutureUpgrade(state.futureUpgrade);
            if (state.upgradeSize) setUpgradeSize(state.upgradeSize);
            if (state.fuOpts) setFuOpts(state.fuOpts);
            if (state.housePhase) setHousePhase(state.housePhase);
            if (state.roofType) setRoofType(state.roofType);
            if (state.custName) setCustName(state.custName);
            if (state.custPhone) setCustPhone(state.custPhone);
            if (state.custAddress) setCustAddress(state.custAddress);
            if (state.salesPerson) setSalesPerson(state.salesPerson);
            if (state.selectedOffer) setSelectedOffer(state.selectedOffer);
            if (state.panelTypeFilter) setPanelTypeFilter(state.panelTypeFilter);
            if (state.quotationViewMode) setQuotationViewMode(state.quotationViewMode);
            if (state.lang) setLang(state.lang);
            // Set baseline for dirty tracking (use setTimeout to let state settle)
            setTimeout(() => setLastSavedState(state), 100);
          } else {
            // No saved state — set current as baseline
            setTimeout(() => setLastSavedState(getBomStateSnapshot()), 100);
          }
        })
        .catch(() => {
          setTimeout(() => setLastSavedState(getBomStateSnapshot()), 100);
        });
    }
  }, [admin, sessionToken]);

  // Save BOM state
  const saveBomState = useCallback(async () => {
    if (!admin || !sessionToken) return;
    setBomSaving(true);
    setBomSaveMsg('');
    try {
      const snapshot = getBomStateSnapshot();
      const res = await fetch(`${API}/admin/bom-state`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(snapshot)
      });
      if (res.ok) {
        setLastSavedState(snapshot);
        setBomDirty(false);
        bomDirtyRef.current = false;
        // Invalidate cache: re-fetch catalog to ensure fresh data
        refreshCatalog();
        setBomSaveMsg(t('saveSuccess'));
        setTimeout(() => setBomSaveMsg(''), 4000);
      } else {
        setBomSaveMsg('Error: ' + res.status);
      }
    } catch (err) {
      setBomSaveMsg('Error: ' + err.message);
    }
    setBomSaving(false);
  }, [admin, sessionToken, authHeaders, getBomStateSnapshot, refreshCatalog, t]);

  // Discard BOM changes
  const discardBomChanges = useCallback(() => {
    if (!lastSavedState) return;
    // Restore from last saved
    if (lastSavedState.selections) setSelections(lastSavedState.selections);
    if (lastSavedState.qtyOverrides) setQtyOverrides(lastSavedState.qtyOverrides);
    if (lastSavedState.priceOverrides) setPriceOverrides(lastSavedState.priceOverrides);
    if (lastSavedState.customItems) setCustomItems(lastSavedState.customItems);
    if (lastSavedState.upgradeSelections) setUpgradeSelections(lastSavedState.upgradeSelections);
    if (lastSavedState.upgradeQtyOverrides) setUpgradeQtyOverrides(lastSavedState.upgradeQtyOverrides);
    if (lastSavedState.upgradePriceOverrides) setUpgradePriceOverrides(lastSavedState.upgradePriceOverrides);
    if (lastSavedState.upgradeCustomItems) setUpgradeCustomItems(lastSavedState.upgradeCustomItems);
    setBomDirty(false);
    bomDirtyRef.current = false;
  }, [lastSavedState]);

  // Run panel type migration on first admin login
  useEffect(() => {
    if (admin && sessionToken) {
      fetch(`${API}/admin/migrate-panel-types`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${sessionToken}` }
      }).catch(() => {});
    }
  }, [admin, sessionToken]);

  // --- Catalog CRUD ---
  const addCatalogItem = useCallback(async (category, item) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/catalog/${category}`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(item)
      });
      if (res.ok) refreshCatalog();
    } finally { setSaving(false); }
  }, [authHeaders, refreshCatalog]);

  const updateCatalogItem = useCallback(async (category, id, updates) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/catalog/${category}/${id}`, {
        method: 'PUT', headers: authHeaders, body: JSON.stringify(updates)
      });
      if (res.ok) refreshCatalog();
    } finally { setSaving(false); }
  }, [authHeaders, refreshCatalog]);

  const deleteCatalogItem = useCallback(async (category, id) => {
    if (!confirm('Delete this item?')) return;
    setSaving(true);
    try {
      await fetch(`${API}/admin/catalog/${category}/${id}`, {
        method: 'DELETE', headers: authHeaders
      });
      refreshCatalog();
    } finally { setSaving(false); }
  }, [authHeaders, refreshCatalog]);

  // --- KSEB Bill Calculator (reverse: bill amount → units → recommended kW) ---
  const billCalc = useMemo(() => {
    const amt = parseFloat(billAmt) || 0;
    if (amt <= 0) return null;
    // Convert to monthly amount
    const monthlyBill = billFreq === 'bimonthly' ? amt / 2 : amt;
    // Convert to bi-monthly for KSEB slab calculation (KSEB bills bi-monthly)
    const biMonthlyBill = monthlyBill * 2;

    // KSEB LT-1A Domestic Tariff 2025-2027
    // Reverse-engineer units from bill amount
    // Bill = energyCharge + fixedCharge + duty(10% of energyCharge) + meterRent(₹14)
    // So: energyCharge = (bill - fixedCharge - meterRent) / 1.10
    // But fixed charge depends on units, so we iterate

    // KSEB LT-1A Domestic Tariff 2025-27
    // Slabs are BI-MONTHLY. ≤250 bi-monthly = telescopic, >250 = non-telescopic (flat ₹8.20)
    const slabs = [
      { limit: 50, rate: 3.25 },   // 0-50 bi-monthly
      { limit: 100, rate: 4.05 },  // 51-100
      { limit: 150, rate: 5.10 },  // 101-150
      { limit: 200, rate: 6.95 },  // 151-200
      { limit: 250, rate: 8.20 },  // 201-250
    ];

    // Fixed charges (bi-monthly, single phase domestic):
    // Simplified based on KSEB calculator verification
    function getFixedCharge(biMonthlyUnits) {
      if (biMonthlyUnits <= 100) return 80;
      return 80; // KSEB calculator shows ₹80 even for 500 units (1P domestic)
    }
    const meterRent = 14; // bi-monthly

    // Forward calculation: bi-monthly units → bill
    function unitsToBill(biMonthlyUnits) {
      let energyCharge = 0;
      if (biMonthlyUnits <= 250) {
        // Telescopic: apply progressive slab rates
        let remaining = biMonthlyUnits;
        let prev = 0;
        for (const slab of slabs) {
          const slabWidth = slab.limit - prev;
          const slabUnits = Math.min(remaining, slabWidth);
          if (slabUnits <= 0) break;
          energyCharge += slabUnits * slab.rate;
          remaining -= slabUnits;
          prev = slab.limit;
        }
      } else {
        // Non-telescopic (>250 bi-monthly): flat ₹8.20 for ENTIRE consumption
        energyCharge = biMonthlyUnits * 8.20;
      }
      const fixedCharge = getFixedCharge(biMonthlyUnits);
      const duty = Math.round(energyCharge * 0.10); // 10% electricity duty
      const total = Math.round(energyCharge + fixedCharge + duty + meterRent);
      return { energyCharge: Math.round(energyCharge), fixedCharge, duty, meterRent, total, biMonthlyUnits, monthlyUnits: Math.round(biMonthlyUnits / 2) };
    }

    // Binary search: find units that produce this bill
    let lo = 0, hi = 3000;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const bill = unitsToBill(mid);
      if (bill.total < biMonthlyBill) lo = mid;
      else hi = mid;
    }
    const estimatedBiMonthlyUnits = Math.round((lo + hi) / 2);
    const breakdown = unitsToBill(estimatedBiMonthlyUnits);
    const monthlyUnits = Math.round(estimatedBiMonthlyUnits / 2);

    // Kerala solar generation: GHI ~4.8-5.0 kWh/m²/day, PR ~0.78
    // Practical Kerala figure: ~4.0 units/kW/day = ~120 units/kW/month
    // This aligns with industry data: 5kW system → ~7200 units/year (600/month)
    const dailyGenPerKw = 4.0; // units per kW per day (conservative Kerala avg)
    const monthlyGenPerKw = Math.round(dailyGenPerKw * 30); // ~120 units/kW/month

    const exactKw = monthlyUnits / monthlyGenPerKw;

    // Map to available system sizes — filtered by house phase
    // 3kW works on BOTH phases (1P inverter on 3P house is fine)
    const allSizes = [
      { key: '3', kw: 3, label: '3 kW' },
      { key: '5sp', kw: 5, label: '5 kW (1\u03A6)', sysType: 'ongrid', phase: '1P' },
      { key: '5tp', kw: 5, label: '5 kW (3\u03A6)', sysType: 'ongrid', phase: '3P' },
      { key: '5', kw: 5, label: '5 kW', sysType: 'hybrid' },
      { key: '6', kw: 6, label: '6 kW', sysType: 'ongrid', phase: '3P' },
      { key: '8', kw: 8, label: '8 kW', phase: '3P' },
      { key: '10', kw: 10, label: '10 kW', phase: '3P' },
    ];

    // Find best fit: smallest system that covers ≥ 80% of consumption
    // Filter by sysType and house phase
    let recommended = null;
    let recommendedKey = null;
    let phaseUpgradeNeeded = false;
    const isHybrid = sysType === 'hybrid';
    const relevantSizes = allSizes.filter(s => {
      if (s.sysType && s.sysType !== sysType) return false;
      // For hybrid, no phase filtering on size keys
      if (isHybrid) return true;
      // For ongrid: 3kW works on both, 5kW picks sp/tp based on phase, 6/8/10 need 3P
      if (s.phase && s.phase !== housePhase) return false;
      return true;
    });
    for (const s of relevantSizes) {
      if (s.kw >= exactKw * 0.85) {
        recommended = s;
        recommendedKey = s.key;
        break;
      }
    }
    if (!recommended && relevantSizes.length > 0) {
      recommended = relevantSizes[relevantSizes.length - 1];
      recommendedKey = recommended.key;
    }

    // Check if ideal kW exceeds what's available on current phase
    // (1P max is 5kW — if they need more, they need a KSEB phase upgrade to 3P)
    if (housePhase === '1P' && exactKw > 5) {
      phaseUpgradeNeeded = true;
    }

    // Monthly savings estimate (at current KSEB avg rate)
    const avgRate = monthlyUnits > 0 ? (breakdown.total / 2) / monthlyUnits : 7;
    const genUnits = recommended ? recommended.kw * monthlyGenPerKw : 0;
    const effectiveGenUnits = Math.min(genUnits, monthlyUnits); // can't save more than you consume
    const monthlySavings = Math.round(effectiveGenUnits * avgRate);
    const annualSavings = monthlySavings * 12;
    const paybackYears = recommended ? Math.round((recommended.kw * 55000) / annualSavings * 10) / 10 : 0; // rough ₹55k/kW

    return {
      monthlyBill,
      biMonthlyBill,
      monthlyUnits,
      biMonthlyUnits: estimatedBiMonthlyUnits,
      breakdown,
      exactKw: Math.round(exactKw * 10) / 10,
      recommended,
      recommendedKey,
      monthlyGenPerKw: Math.round(monthlyGenPerKw),
      monthlySavings,
      annualSavings,
      paybackYears,
      avgRate: Math.round(avgRate * 100) / 100,
      phaseUpgradeNeeded,
      housePhase,
    };
  }, [billAmt, billFreq, sysType, housePhase]);

  // --- BOM Computation (client-side for instant reactivity) ---
  // Computes BOM for ALL 3 tiers simultaneously for package comparison quotation
  const allTierBoms = useMemo(() => {
    if (!catalog?.categories) return { base: { lines: [], totals: {} }, value: { lines: [], totals: {} }, premium: { lines: [], totals: {} } };

    function computeForTier(tierParam) {

    if (!catalog) return { lines: [], totals: {} };

    const template = catalog.bomTemplates[sysType];
    if (!template) return { lines: [], totals: {} };

    // Future upgrade: panels use `size`, everything else uses `bomSize`
    const bomSize = (futureUpgrade && upgradeSize) ? upgradeSize : size;
    // Enhanced future upgrade: determine phase from inverter kW (bomSize), not just template
    // When futureUpgrade + bigger inverter → if inverter kW ≥6, force 3P for meter/ACDB
    // But ONLY if that component is checked (upsized). Unchecked = panel kW sizing + original phase.
    const fuInverterKw = futureUpgrade && upgradeSize ? (parseFloat(upgradeSize) || 0) : 0;
    const fuActive = futureUpgrade && !!upgradeSize;
    // Phase: 3P forced only for components that are upsized to inverter kW
    const fuForce3P = fuActive && fuInverterKw >= 6;
    const isThreePhase = fuForce3P || template.threePhase?.includes(bomSize);
    // For downsized components, use panel kW phase
    const panelPhaseIs3P = template.threePhase?.includes(size);
    const lines = [];
    let pos = 0;

    // Enhanced future upgrade: categories that use panel kW (size) instead of inverter kW (bomSize)
    // Checked = use bomSize (inverter kW), Unchecked = use size (panel kW)
    const fuDownsizeCats = new Set();
    if (fuActive) {
      if (!fuOpts.includeStructure) { /* structure handled separately below */ }
      if (!fuOpts.includeDB) { fuDownsizeCats.add('dcdb'); fuDownsizeCats.add('acdb'); }
      if (!fuOpts.includeCables) { fuDownsizeCats.add('dc_cable'); fuDownsizeCats.add('ac_cable'); fuDownsizeCats.add('earth_cable'); fuDownsizeCats.add('la_cable'); fuDownsizeCats.add('cb_rod'); fuDownsizeCats.add('isolator'); }
      if (!fuOpts.includeMeter) { fuDownsizeCats.add('meter'); }
    }

    // Detect premium micro-inverter mode
    const isPremiumMicro = tierParam === 'premium' && (sysType === 'ongrid' || sysType === 'hybrid');
    const isPremiumHybrid = sysType === 'hybrid' && tierParam === 'premium';
    const panelSlot = template.slots.find(s => s.category === 'panel');
    // numPanels will be recalculated after panel selection (see below)
    let numPanels = panelSlot?.qty?.[size] || 0;

    // Variable slots
    for (const slot of template.slots) {
      // Enhanced future upgrade: unchecked categories use panel kW (size) instead of inverter kW (bomSize)
      // Panels always use panel size; everything else uses bomSize (or size if downsized)
      const slotSize = slot.category === 'panel' ? size : (fuDownsizeCats.has(slot.category) ? size : bomSize);

      // Determine qty: premium uses premiumQty/premiumBatQty if available
      let qty = 0;
      if (isPremiumMicro && (slot.premiumBatQty || slot.premiumQty)) {
        if (slot.premiumBatQty) {
          const bq = slot.premiumBatQty[batConfig] || slot.premiumBatQty['0'] || {};
          qty = bq[slotSize] || 0;
        } else if (slot.premiumQty) {
          qty = slot.premiumQty[slotSize] || 0;
        }
      } else if (slot.batQty) {
        const bq = slot.batQty[batConfig] || slot.batQty['0'] || {};
        qty = bq[slotSize] || 0;
      } else if (slot.qty) {
        qty = slot.qty[slotSize] || 0;
      }
      if (qty === 0) continue;

      const category = catalog.categories[slot.category];
      if (!category) continue;

      // Phase/type filter (applies regardless of tierParam)
      // DCDB for 5sp uses 2/2 (3P-tagged) for future upgrade readiness
      const dcdb5spForce3P = slot.category === 'dcdb' && size === '5sp';
      // Downsized categories use panel phase; upsized use inverter phase
      const slotIs3P = fuDownsizeCats.has(slot.category) ? panelPhaseIs3P : isThreePhase;
      const effectiveThreePhase = dcdb5spForce3P ? true : slotIs3P;
      const phaseFilter = item => {
        if (slot.filterType === 'hybrid') return item.type === 'hybrid';
        if (slot.filterType === 'ongrid') { if (item.type && item.type !== 'ongrid') return false; }
        if (slot.filterPhase === 'HYB') {
          if (!item.phase?.includes('HYB')) return false;
          if (effectiveThreePhase) return item.phase?.includes('3P');
          return item.phase?.includes('1P');
        }
        if (effectiveThreePhase && item.phase) return item.phase === '3P' || item.phase.includes('3P');
        if (!effectiveThreePhase && item.phase) return item.phase === '1P' || item.phase.includes('1P') || !item.phase;
        return true;
      };

      // --- DCR/Non-DCR filtering + status check for panels ---
      const dcrFilter = (item) => {
        if (slot.category !== 'panel') return true;
        // Filter out inactive panels
        if (item.status === 'inactive') return false;
        // Determine panel type (panelType takes priority, fallback to dcr boolean)
        const pt = item.panelType || (item.dcr ? 'DCR' : 'NON_DCR');
        // If panelTypeFilter explicitly set
        if (panelTypeFilter === 'DCR') return pt === 'DCR';
        if (panelTypeFilter === 'NON_DCR') return pt === 'NON_DCR';
        // Auto-enforce: subsidy YES = DCR only
        if (subsidyType === 'residential' || subsidyType === 'ghs') return pt === 'DCR';
        return true;
      };

      // Current tierParam items (for default selection + price-diff baseline)
      const available = category.items.filter(item => item.tiers.includes(tierParam) && phaseFilter(item) && dcrFilter(item));

      // All tiers (for sales team cross-tierParam selection — customer picks value panel in base etc.)
      // DCDB/ACDB: show ALL options (1/1, 2/2, hybrid) so user can override phase default
      const isDcdbAcdb = slot.category === 'dcdb' || slot.category === 'acdb';
      const allAvailable = isDcdbAcdb
        ? category.items.filter(item => item.tiers?.length > 0)
        : category.items.filter(item => item.tiers?.length > 0 && phaseFilter(item) && dcrFilter(item));

      const qKey = `${sysType}_${slotSize}_${tierParam}_${batConfig}_${slot.pos}`;
      const selKey = `${sysType}_${tierParam}_${slotSize}_${slot.pos}`;
      const pKey = `${sysType}_${tierParam}_${slotSize}_${slot.pos}`;

      let selected = null;
      if (selections[selKey]) {
        // Look in allAvailable so cross-tierParam picks are found
        selected = allAvailable.find(i => i.id === selections[selKey]);
      }
      if (!selected && available.length > 0) {
        // Default: auto-select from current tierParam
        if (slot.category === 'inverter' && available.some(i => i.kw)) {
          const targetKw = parseFloat(slotSize) || 3;
          const kwSorted = [...available].sort((a, b) => Math.abs((a.kw || 0) - targetKw) - Math.abs((b.kw || 0) - targetKw));
          selected = kwSorted[0];
        } else {
          selected = available[0];
        }
      }

      // === Dynamic panel qty based on selected panel wattage ===
      if (slot.category === 'panel' && selected?.watt) {
        const systemWatts = parseFloat(size) * 1000; // e.g. 3kW = 3000W
        const panelWatts = selected.watt; // e.g. 550W
        qty = Math.ceil(systemWatts / panelWatts); // e.g. ceil(3000/550) = 6
        numPanels = qty; // Update numPanels for micro-inverter accessory calculations
      }

      const finalQty = qtyOverrides[qKey] !== undefined ? qtyOverrides[qKey] : qty;
      const unitPrice = priceOverrides[pKey] !== undefined ? priceOverrides[pKey] : (selected?.price || 0);
      const amount = finalQty * unitPrice;
      const gst = slot.gst || category.gstDefault || 18;
      const gstAmt = Math.round(amount * gst / 100);

      lines.push({
        pos: slot.pos, category: slot.category, label: slot.label,
        name: selected?.name || 'N/A', catalogItemId: selected?.id,
        type: selected?.type, brand: selected?.brand, watt: selected?.watt,
        kwh: selected?.kwh, kw: selected?.kw,
        panelType: selected?.panelType, dcr: selected?.dcr,
        sqmm: selected?.sqmm, unit: selected?.unit,
        qty: finalQty, defQty: qty, unitPrice, amount, gst, gstAmt,
        isVariable: true, available, allAvailable
      });
      pos++;
    }

    // === PREMIUM MICRO-INVERTER: Auto-add Enphase or Hoymiles accessories ===
    if (isPremiumMicro) {
      const addMicroLine = (catKey, item, qty, label) => {
        if (!item || qty === 0) return;
        const cat = catalog.categories[catKey];
        const eqKey = `micro_${microBrand}_${sysType}_${bomSize}_${item.id}`;
        const finalQty = qtyOverrides[eqKey] !== undefined ? qtyOverrides[eqKey] : qty;
        const itemGst = item.gstOverride || cat?.gstDefault || 18;
        const amount = finalQty * (item.price || 0);
        lines.push({
          pos: pos, category: catKey, label,
          name: item.name, catalogItemId: item.id,
          qty: finalQty, defQty: qty, unitPrice: item.price || 0,
          amount, gst: itemGst, gstAmt: Math.round(amount * itemGst / 100),
          isVariable: false, isEnphase: true, enphaseQtyKey: eqKey
        });
        pos++;
      };

      // Enphase accessories (ongrid + hybrid premium)
      if ((microBrand === 'enphase' || isPremiumHybrid) && catalog.categories.enphase) {
        const en = catalog.categories.enphase.items;
        const find = (m) => en.find(i => i.name.includes(m));
        const qTerminalQty = isThreePhase ? 3 : 1;
        const ctQty = isThreePhase ? 4 : 0;

        addMicroLine('enphase', find('IQ8P'), numPanels, 'IQ8P Micro Inverter (per panel)');
        addMicroLine('enphase', find('Q Cable'), numPanels, 'Q Cable Portrait 2m (per panel)');
        addMicroLine('enphase', find('Envoy'), 1, 'Enphase Envoy S Metered');
        addMicroLine('enphase', find('Q Relay'), 1, 'Enphase Q Relay');
        addMicroLine('enphase', find('Q Terminal'), qTerminalQty, `Enphase Q Terminal (${isThreePhase ? '3P' : '1P'})`);
        addMicroLine('enphase', find('CT'), ctQty, 'Enphase CT 200 (3P only)');

        // Hybrid premium extras: System Controller + Flex Battery + UG Cable
        if (isPremiumHybrid) {
          addMicroLine('enphase', find('System Controller'), 1, 'Enphase System Controller');
          const batQtyNum = Number(batConfig) || 0;
          if (batQtyNum > 0) {
            addMicroLine('enphase', find('Flex Battery'), batQtyNum, `Enphase Flex Battery (x${batQtyNum})`);
          }
          // UG Cable: 2-core for 1P (3/5kw), 4-core for 3P (8/10kw)
          if (catalog.categories.ug_cable) {
            const ug = catalog.categories.ug_cable.items;
            const ugItem = isThreePhase ? ug.find(i => i.name.includes('4 Core')) : ug.find(i => i.name.includes('2 Core'));
            if (ugItem) addMicroLine('ug_cable', ugItem, 40, `UG Cable ${isThreePhase ? '4 Core' : '2 Core'} (40m)`);
          }
        }
      }

      // Hoymiles accessories (ongrid premium only, not hybrid)
      if (microBrand === 'hoymiles' && !isPremiumHybrid && catalog.categories.hoymiles) {
        const hm = catalog.categories.hoymiles.items;
        const find = (m) => hm.find(i => i.name.includes(m));
        const hms2000Qty = Math.floor(numPanels / 4);
        const hms1000Qty = (numPanels - hms2000Qty * 4) >= 1 ? 1 : 0;
        const dtuQty = Math.ceil(numPanels / 99) || 1;
        const trunkQty = hms2000Qty + hms1000Qty;

        addMicroLine('hoymiles', find('HMS 2000'), hms2000Qty, 'HMS 2000 (4 Module/4 MPPT)');
        addMicroLine('hoymiles', find('HMS 1000'), hms1000Qty, 'HMS 1000 (2 Module/2 MPPT)');
        if (zeroExport) {
          addMicroLine('hoymiles', find('DTU Pro'), dtuQty, 'DTU Pro (Zero Export/Monitoring)');
        } else {
          addMicroLine('hoymiles', find('DTU Lite'), dtuQty, 'DTU Lite (Basic Monitoring)');
        }
        addMicroLine('hoymiles', find('End Cap'), 1, 'End Cap (Pack of 5)');
        addMicroLine('hoymiles', find('AC Trunk'), trunkQty, 'AC Trunk Cable (per inverter)');
      }
    }

    // Fixed items (use bomSize except for panel-related, or size if downsized)
    for (const fixed of (template.fixedItems || [])) {
      // Enhanced future upgrade: downsize to panel kW when component unchecked
      let fixedItemSize = bomSize;
      if (futureUpgrade && upgradeSize) {
        const fn = (fixed.name || '').toLowerCase();
        // Structure items: clamp, bolt, base plate, square plate, anchor, epoxy, primer,
        // thinner, roller, silicon, cotton, cutting wheel, welding, self screw, end cap, corroshield
        const isStructureItem = /clamp|j bolt|base plate|square plate|anchor|epoxy|primer|thinner|roller|silicon|cotton|cutting|welding|self screw|end cap|corroshield|panel.*earth.*nut/i.test(fn);
        // Wiring items: pipe, bend, elbow, saddle, gland, cable tie, sleeve, plug, lug, tape, insulation, mc4, cable tray, earthing|earth|la|lightning
        const isWiringItem = /pipe|bend|elbow|saddle|gland|cable tie|sleeve|plug$|lug|tape|insulation|mc4|cable tray/i.test(fn);
        const isEarthingItem = /earth|lightning|la .*holder|la base|cb rod|10 swg|terminal strip/i.test(fn);
        // Meter box
        const isMeterItem = /meter box/i.test(fn);

        // Downsize to panel kW instead of skipping
        if ((!fuOpts.includeStructure && isStructureItem) ||
            (!fuOpts.includeCables && (isWiringItem || isEarthingItem)) ||
            (!fuOpts.includeMeter && isMeterItem)) {
          fixedItemSize = size; // Use panel kW sizing
        }
      }

      let qty = 0;
      if (isPremiumMicro && fixed.premiumQty) {
        qty = fixed.premiumQty[fixedItemSize] || 0;
      } else if (fixed.batQty) {
        const bq = fixed.batQty[batConfig] || fixed.batQty['0'] || {};
        qty = bq[fixedItemSize] || 0;
      } else if (fixed.qty) {
        qty = fixed.qty[fixedItemSize] || 0;
      }
      if (qty === 0) continue;

      // MC4 Connector: scale with numPanels for micro-inverter setups only
      const isMC4 = fixed.name?.toLowerCase().includes('mc4');
      if (isMC4 && isPremiumMicro && numPanels > 0) {
        qty = numPanels;
      }

      const fKey = `fixed_${sysType}_${bomSize}_${batConfig}_${pos}`;
      const pKey = `${sysType}_${tierParam}_${bomSize}_${pos}`;
      const finalQty = qtyOverrides[fKey] !== undefined ? qtyOverrides[fKey] : qty;
      const unitPrice = priceOverrides[pKey] !== undefined ? priceOverrides[pKey] : fixed.price;
      const amount = finalQty * unitPrice;
      const gst = fixed.gst || 18;
      const gstAmt = Math.round(amount * gst / 100);

      lines.push({
        pos: pos, name: fixed.name, qty: finalQty, defQty: qty,
        unitPrice, amount, gst, gstAmt, isVariable: false
      });
      pos++;
    }

    // === Site Add-Ons (catalog-based optional items) ===
    const addOnLines = [];
    const addCatLine = (catKey, itemId, qty, label) => {
      const cat = catalog.categories[catKey];
      if (!cat || !itemId || qty <= 0) return;
      const item = cat.items.find(i => i.id === itemId);
      if (!item) return;
      const gst = cat.gstDefault || 18;
      const amount = qty * (item.price || 0);
      const gstAmt = Math.round(amount * gst / 100);
      addOnLines.push({
        pos: pos, category: catKey, label,
        name: `${item.name} (${label})`, catalogItemId: item.id,
        qty, defQty: qty, unitPrice: item.price || 0,
        amount, gst, gstAmt, isVariable: false, isAddOn: true
      });
      pos++;
    };
    if (addOns.extraDcCable.enabled && addOns.extraDcCable.qty > 0) {
      addCatLine('dc_cable', addOns.extraDcCable.itemId, addOns.extraDcCable.qty, 'Extra DC Cable');
    }
    if (addOns.extraAcCable.enabled && addOns.extraAcCable.qty > 0) {
      addCatLine('ac_cable', addOns.extraAcCable.itemId, addOns.extraAcCable.qty, 'Extra AC Cable');
    }
    if (addOns.armouredCable.enabled && addOns.armouredCable.qty > 0) {
      addCatLine('armoured_cable', addOns.armouredCable.itemId, addOns.armouredCable.qty, 'Armoured/UG Cable');
    }
    lines.push(...addOnLines);

    // === Compute bomKw, tubeRate FIRST (needed for structure lines) ===
    const panelKw = parseFloat(size) || 3;
    const bomKw = parseFloat(bomSize) || panelKw;
    const costs = catalog.costs || {};
    const gpRate = costs.gpRatePerKg || 85;
    const giRate = costs.giRatePerKg || 98.3;
    // Config-driven: look up structure type from package profile
    const profileKey = getProfileKey(sysType, tierParam, batConfig);
    const profileStructure = getProfileStructure(catalog, profileKey);
    const defaultTubeRate = profileStructure === 'GP' ? gpRate : giRate;
    const defaultGradeLabel = profileStructure;
    const customerTubeRate = structGrade === 'gp' ? gpRate : structGrade === 'gi' ? giRate : defaultTubeRate;
    const customerGradeLabel = structGrade === 'gp' ? 'GP' : structGrade === 'gi' ? 'GI' : defaultGradeLabel;
    const tubeRate = customerTubeRate;
    const stTemplates = catalog.structureTemplates || {};

    // === Add flat roof structure items as BOM line items ===
    // Structure: use panel kW when includeStructure unchecked (downsize, not skip)
    const structKw = (futureUpgrade && upgradeSize && !fuOpts.includeStructure) ? panelKw : bomKw;
    const flatRoofResult = calcStructureCost(stTemplates.flatRoof, structKw, tubeRate);
    const flatRoofCost = flatRoofResult.total;
    const flatRoofTmpl = stTemplates.flatRoof;
    if (flatRoofTmpl?.items) {
      for (const stItem of flatRoofTmpl.items) {
        const qty = getStructureQty(stItem, structKw);
        if (qty <= 0) continue;
        let unitPrice;
        if (stItem.type === 'tube') {
          unitPrice = Math.round(stItem.weightKg * tubeRate);
        } else {
          unitPrice = stItem.price || 0;
        }
        const amount = Math.round(unitPrice * qty);
        const gst = 18;
        const gstAmt = Math.round(amount * gst / 100);
        lines.push({
          pos: pos, name: stItem.name + (stItem.type === 'tube' ? ` (${stItem.weightKg}kg × ₹${Math.round(tubeRate)}/kg)` : ''),
          qty, defQty: qty, unitPrice, amount, gst, gstAmt,
          isVariable: false, isStructure: true
        });
        pos++;
      }
    }

    // Custom items
    let customTotal = 0, customGst = 0;
    customItems.forEach(ci => {
      const amt = ci.qty * ci.price;
      const gAmt = Math.round(amt * ci.gst / 100);
      customTotal += amt;
      customGst += gAmt;
    });

    // === TOTALS (now includes structure lines) ===
    // Flat 9% GST (composite supply scheme for solar)
    let matTotal = 0;
    for (const line of lines) {
      matTotal += line.amount;
    }
    matTotal += customTotal;
    const totalGstFlat = Math.round(matTotal * 9 / 100);
    // Keep gst5/gst12/gst18 for backward compat but zero them
    let gst5 = 0, gst12 = 0, gst18 = 0;
    // (legacy per-item GST buckets no longer used)
    customItems.forEach(ci => {
      const gAmt = Math.round(ci.qty * ci.price * ci.gst / 100);
      if (ci.gst === 5) gst5 += gAmt;
      else if (ci.gst === 12) gst12 += gAmt;
      else gst18 += gAmt;
    });

    const totalGst = totalGstFlat; // Flat 9% GST
    const matWithGst = matTotal + totalGst;

    // Structure grade diff: difference between customer-selected and tierParam-default rate (admin only)
    const defaultFlatRoofCost = calcStructureCost(stTemplates.flatRoof, bomKw, defaultTubeRate).total;
    let structGradeDiff = 0;
    const gradeFlatPerKw = costs.structGradeFlatPerKw || 0;
    const effectiveGradeMode = structGradeMode || (costs.structGradeMode || 'manual');
    if (structGrade !== 'default') {
      if (effectiveGradeMode === 'flat' && gradeFlatPerKw > 0) {
        // Flat mode: fixed ₹/kW premium (includes GST)
        structGradeDiff = Math.round(gradeFlatPerKw * bomKw);
        // Negative if downgrading (e.g. value/premium switching to GP)
        const isDowngrade = (profileStructure !== 'GP' && structGrade === 'gp') ? false
          : (profileStructure === 'GP' && structGrade === 'gp') ? false // same as default
          : false;
      } else {
        // Manual mode: calculated from rate-per-kg difference + 18% GST
        const structGradeDiffRaw = flatRoofCost - defaultFlatRoofCost;
        structGradeDiff = Math.round(structGradeDiffRaw * 1.18);
      }
    }

    // Extra structure if add-on enabled (elevated or sheet roof)
    let structureExtraCost = 0;
    let structureExtraLines = [];
    let structureExtraLabel = '';
    if (addOns.structure.enabled) {
      const templateKey = addOns.structure.type === 'elevated' ? 'elevated' : 'sheetRoof';
      const selectedResult = calcStructureCost(stTemplates[templateKey], structKw, tubeRate);
      structureExtraCost = Math.max(0, selectedResult.total - flatRoofCost);
      structureExtraLines = selectedResult.lines;
      structureExtraLabel = addOns.structure.type === 'elevated' ? 'Elevated' : 'Sheet Roof';
    }

    // Labor + repair margin for extra structure work
    const structureLabor = addOns.structure.enabled ? (costs.structureLabor || 0) : 0;
    const structureRepairAmt = addOns.structure.enabled
      ? Math.round((structureExtraCost + structureLabor) * (costs.structureRepairPct || 0) / 100)
      : 0;
    const structureAddOnTotal = structureExtraCost + structureLabor + structureRepairAmt;

    // Transport: first 100km included, extra km at ₹35/km
    const extraKm = Math.max(0, distKm - 100);
    const transportExtra = extraKm * 35;
    // Structure GST — now part of flat 9% composite, no separate calc needed
    const flatRoofGst = 0;
    const structureExtraGst = 0;

    // Cost Engine: Installation from matrix, Transport from config, Office from config
    const instMatrix = catalog.installationMatrix || {};
    const instMatrixCost = instMatrix[size]?.[roofType] || 0;
    const tConfig = catalog.transportConfig || {};
    const tBaseKm = tConfig.baseDistanceKm || 100;
    const tCostPerKm = tConfig.costPerKm || 35;
    const transportCalc = Math.max(0, distKm - tBaseKm) * tCostPerKm;
    const oConfig = catalog.officeExpense || {};
    const officeCostPerProject = oConfig.expectedProjectsPerMonth > 0
      ? Math.round(oConfig.monthlyExpense / oConfig.expectedProjectsPerMonth)
      : (costs.office || 0);

    const costCalc = {
      installation: costOvr.installation ?? (instMatrixCost || bomKw * (costs.installRate || 0)),
      service: costOvr.service ?? (costs.serviceRateYear || 0) * (costs.serviceYears || 0),
      transportation: costOvr.transportation ?? transportCalc,
      miscellaneous: costOvr.miscellaneous ?? (costs.miscellaneous || 0),
      office: costOvr.office ?? officeCostPerProject,
      // Structure extras (elevated/sheet roof add-on — NOT flat roof which is now in material lines)
      structureExtra: structureExtraCost,
      structureExtraGst: 0, // Now using flat 9% GST
      structureLabor: structureLabor,
      structureRepair: structureRepairAmt
    };
    // Step 1: Pre-GST cost = material (includes structure items) + structure extras + overheads
    // Note: matTotal already includes flat roof structure items (they're in BOM lines now)
    const overheads = costCalc.installation + costCalc.service + costCalc.transportation + costCalc.miscellaneous + costCalc.office;
    const structExtraPreGst = structureExtraCost + structureLabor + structureRepairAmt;
    const preGstSub = matTotal + structExtraPreGst + overheads;
    // Step 2: Profit on pre-GST cost
    const marginPctVal = Number(marginVal) || 0;
    const mAmt = marginType === 'percent'
      ? Math.round(preGstSub * marginPctVal / 100)
      : marginPctVal;
    // Step 3: Flat 9% GST on selling price (pre-GST cost + profit)
    const sub = preGstSub + mAmt;
    const allGst = Math.round(sub * 9 / 100);
    // Step 4: Grand = pre-GST + profit + 9% GST
    const grand = sub + allGst;

    // Extra costs visible to sales/customer (add-ons on top of market rate)
    let addOnTotal = 0;
    addOnTotal += structureAddOnTotal; // extra structure + labor + repair
    addOnTotal += transportExtra;
    const cableAddOnCost = addOnLines.reduce((s, l) => s + l.amount + l.gstAmt, 0);
    addOnTotal += cableAddOnCost;

    // Base actual cost (excluding add-on extras) — for margin comparison against market rate
    // addOnInSub = pre-GST add-on costs that are baked into matTotal/structExtraPreGst
    const addOnPreGst = structureAddOnTotal; // structure add-on (elevated/sheet roof extra + labor + repair)
    const addOnGstFromLines = addOnLines.reduce((s, l) => s + l.gstAmt, 0);
    const addOnPreGstFromLines = addOnLines.reduce((s, l) => s + l.amount, 0);
    const totalAddOnPreGst = addOnPreGst + addOnPreGstFromLines;
    const totalAddOnGst = costCalc.structureExtraGst + addOnGstFromLines;
    // Base pre-GST = total pre-GST minus add-on pre-GST costs
    const basePreGst = preGstSub - totalAddOnPreGst;
    // Base profit (same margin % applied to base only)
    const baseProfit = marginType === 'percent'
      ? Math.round(basePreGst * marginPctVal / 100)
      : mAmt; // flat margin applies fully to base
    // Base GST = flat 9% on (base pre-GST + base profit)
    const baseSub = basePreGst + baseProfit;
    const baseGstScaled = Math.round(baseSub * 9 / 100);
    const baseGrand = baseSub + baseGstScaled;

    // Market rate lookup
    const upgTag = (futureUpgrade && upgradeSize) ? `_up${bomSize}` : '';
    const mrKey = sysType === 'hybrid'
      ? `hybrid_${tierParam}_${batConfig}${upgTag}`
      : `${sysType}_${tierParam}${upgTag}`;
    const marketRate = catalog.marketRates?.[mrKey]?.[size] || 0;
    // priceDiffBase: the priceDiffTotal that existed when admin last saved the market rate
    // This lets us track DELTA from admin's config, not from tierParam default
    const priceDiffBase = catalog.marketRates?.[mrKey + '_diffBase']?.[size] || 0;

    // --- Price difference: selected vs default items for all variable slots ---
    // Includes GST on the difference (panel 5%, inverter 5%/12%, etc.)
    let priceDiffTotal = 0;
    const priceDiffLines = [];
    for (const line of lines) {
      if (!line.isVariable || !line.available || line.available.length === 0) continue;
      let defaultItem;
      if (line.category === 'inverter' && line.available.some(i => i.kw)) {
        const targetKw = parseFloat(line.category === 'panel' ? size : bomSize) || 3;
        const kwSorted = [...line.available].sort((a, b) => Math.abs((a.kw || 0) - targetKw) - Math.abs((b.kw || 0) - targetKw));
        defaultItem = kwSorted[0];
      } else {
        defaultItem = line.available[0];
      }
      if (!defaultItem || defaultItem.id === line.catalogItemId) continue;
      const defaultTotal = (defaultItem.price || 0) * line.qty;
      const selectedTotal = line.unitPrice * line.qty;
      const diffPreGst = selectedTotal - defaultTotal;
      const diffGst = Math.round(diffPreGst * line.gst / 100);
      const diff = diffPreGst + diffGst;
      if (diff !== 0) {
        priceDiffTotal += diff;
        priceDiffLines.push({
          label: line.label,
          selectedName: line.name,
          defaultName: defaultItem.name,
          diff,
          diffPreGst,
          diffGst,
          gstPct: line.gst,
          qty: line.qty
        });
      }
    }

    // Customer price = marketRate + addOns + DELTA from admin's saved config
    // priceDiffDelta: positive if sales picked more expensive, negative if cheaper
    // If sales person keeps admin's exact picks → delta = 0 → price = marketRate
    const priceDiffDelta = priceDiffTotal - priceDiffBase;
    const customerPrice = marketRate > 0 ? marketRate + addOnTotal + priceDiffDelta : grand;

    return {
      lines, customTotal, customGst,
      totals: { matTotal, gst5, gst12, gst18, totalGst, matWithGst },
      costCalc, sub, mAmt, grand, preGstSub, allGst,
      marketRate, customerPrice, addOnTotal, transportExtra, mrKey, baseGrand,
      panelKw, bomKw, bomSize,
      flatRoofCost, flatRoofGst, flatRoofLines: flatRoofResult.lines,
      structureExtraCost, structureExtraLines, structureExtraLabel,
      structureLabor, structureRepairAmt, structureAddOnTotal, tubeRate,
      priceDiffTotal, priceDiffBase, priceDiffDelta, priceDiffLines,
      structGradeDiff, defaultGradeLabel, customerGradeLabel,
      profileKey, profileStructure
    };

    }

    return {
      base: computeForTier('base'),
      value: computeForTier('value'),
      premium: computeForTier('premium'),
    };
  }, [catalog, sysType, size, batConfig, microBrand, zeroExport, selections, qtyOverrides, priceOverrides, customItems, distKm, costOvr, marginType, marginVal, futureUpgrade, upgradeSize, fuOpts, addOns, structGrade, structGradeMode, panelTypeFilter, subsidyType, roofType]);

  // Active tier BOM (backward compat — used by UI controls, admin panel, etc.)
  const bom = allTierBoms[tier] || { lines: [], totals: {} };

  // ============================================================
  // STRING CONFIGURATION & MPPT OPTIMIZATION ENGINE
  // Kerala climate: cell temp min ~15°C (cold morning), max ~70°C (hot roof)
  // STC reference: 25°C
  // ============================================================
  const stringConfig = useMemo(() => {
    if (!bom || !bom.lines || bom.lines.length === 0) return null;

    // Find selected panel and inverter from BOM lines
    const panelLine = bom.lines.find(l => l.category === 'panel');
    const invLine = bom.lines.find(l => l.category === 'inverter');
    if (!panelLine || !invLine) return null;

    // Get catalog items with engineering specs
    const panelCat = catalog.categories?.panel?.items || [];
    const invCat = catalog.categories?.inverter?.items || [];
    const panel = panelCat.find(p => p.id === panelLine.catalogItemId);
    const inverter = invCat.find(i => i.id === invLine.catalogItemId);

    if (!panel?.voc || !inverter?.mpptCount) return null;

    // Skip string config for micro-inverters (1 panel per micro)
    if (inverter.isMicro) {
      return {
        isMicro: true,
        panel, inverter,
        totalPanels: panelLine.qty,
        microCount: panelLine.qty,
        message: `${panelLine.qty} micro-inverters — one per panel, no string configuration needed`,
        warnings: [],
        dcCableRecommended: Math.max(10, Math.ceil(panelLine.qty * 2))
      };
    }

    // SolarEdge optimizer-based: special handling
    if (inverter.optimizerBased) {
      const maxStringLen = Math.floor(inverter.maxInputVoltage / 1); // optimizers output ~1V per optimizer
      return {
        isOptimizer: true,
        panel, inverter,
        totalPanels: panelLine.qty,
        message: `SolarEdge optimizer system — each panel has its own optimizer. String length is flexible (up to ${maxStringLen} optimizers per string).`,
        warnings: [],
        dcCableRecommended: 50
      };
    }

    const totalPanels = panelLine.qty;
    const { voc, vmp, isc, imp, tempCoeffVoc } = panel;
    const { mpptCount, mpptVoltageMin, mpptVoltageMax, maxInputVoltage, maxInputCurrent, maxStringsPerMppt, maxIsc } = inverter;

    // Temperature coefficients (Kerala climate)
    const T_MIN = 15;   // Coldest cell temp (early morning winter) — gives highest Voc
    const T_MAX = 70;   // Hottest cell temp (peak summer on dark roof) — gives lowest Vmp
    const T_STC = 25;   // STC reference temperature

    // Voc at coldest temp (worst case for max voltage — must not exceed inverter max)
    const vocCold = voc * (1 + (tempCoeffVoc / 100) * (T_MIN - T_STC));
    // Vmp at hottest temp (worst case for min voltage — must stay above MPPT min)
    const vmpHot = vmp * (1 + (tempCoeffVoc / 100) * (T_MAX - T_STC));
    // Vmp at STC for optimal MPPT operation
    const vmpStc = vmp;

    // String sizing
    const maxPanelsPerString = Math.floor(maxInputVoltage / vocCold);
    const minPanelsPerString = Math.ceil(mpptVoltageMin / vmpHot);

    // Optimal: Vmp*N should be in the middle-upper range of MPPT window
    // Target: 60-80% of MPPT voltage range for best efficiency
    const mpptMid = (mpptVoltageMin + mpptVoltageMax) * 0.65;
    const optimalPanelsPerString = Math.round(mpptMid / vmpStc);

    // Clamp to valid range
    const panelsPerString = Math.max(minPanelsPerString, Math.min(maxPanelsPerString, optimalPanelsPerString));

    // Calculate number of strings needed
    const totalStrings = Math.ceil(totalPanels / panelsPerString);

    // Check if strings fit in available MPPT inputs
    const maxTotalStrings = mpptCount * maxStringsPerMppt;

    // MPPT allocation: distribute strings across MPPTs
    const stringsPerMppt = Math.ceil(totalStrings / mpptCount);

    // Actual panel distribution
    const actualPanelsUsed = panelsPerString * totalStrings;
    const extraPanels = actualPanelsUsed - totalPanels;

    // Voltage calculations for display
    const stringVocCold = panelsPerString * vocCold;
    const stringVmpHot = panelsPerString * vmpHot;
    const stringVmpStc = panelsPerString * vmpStc;

    // DC cable recommendation: 50m default for Kerala 2-floor homes
    const dcCableRecommended = totalPanels <= 12 ? 50 : Math.max(50, totalPanels * 4);

    // === WARNINGS ===
    const warnings = [];

    // 1. String Voc exceeds inverter max input voltage
    if (stringVocCold > maxInputVoltage) {
      warnings.push({
        type: 'critical',
        code: 'VOC_EXCEEDS_MAX',
        message: `⚠ CRITICAL: String Voc at 15°C (${stringVocCold.toFixed(1)}V) exceeds inverter max input voltage (${maxInputVoltage}V). Reduce panels per string to ${Math.floor(maxInputVoltage / vocCold)}.`
      });
    }

    // 2. String Vmp below MPPT minimum
    if (stringVmpHot < mpptVoltageMin) {
      warnings.push({
        type: 'critical',
        code: 'VMP_BELOW_MPPT_MIN',
        message: `⚠ CRITICAL: String Vmp at 70°C (${stringVmpHot.toFixed(1)}V) falls below MPPT minimum (${mpptVoltageMin}V). Increase panels per string to ${Math.ceil(mpptVoltageMin / vmpHot)}.`
      });
    }

    // 3. String Isc exceeds inverter max input current
    if (isc > maxInputCurrent) {
      warnings.push({
        type: 'warning',
        code: 'ISC_EXCEEDS_MAX',
        message: `⚠ Panel Isc (${isc}A) exceeds inverter max input current per MPPT (${maxInputCurrent}A). Consider a higher-rated inverter.`
      });
    }

    // 4. Too many strings for available MPPT inputs
    if (totalStrings > maxTotalStrings) {
      warnings.push({
        type: 'critical',
        code: 'STRINGS_EXCEED_MPPT',
        message: `⚠ CRITICAL: Need ${totalStrings} strings but inverter only supports ${maxTotalStrings} (${mpptCount} MPPTs × ${maxStringsPerMppt} strings each). Use a higher-capacity inverter or parallel combiner.`
      });
    }

    // 5. String voltage above MPPT max (suboptimal but not critical)
    if (stringVmpStc > mpptVoltageMax) {
      warnings.push({
        type: 'warning',
        code: 'VMP_ABOVE_MPPT_MAX',
        message: `String Vmp at STC (${stringVmpStc.toFixed(1)}V) exceeds MPPT max (${mpptVoltageMax}V). Inverter may clip power. Reduce panels per string.`
      });
    }

    // 6. Uneven panel distribution warning
    if (extraPanels > 0 && totalStrings > 1) {
      warnings.push({
        type: 'info',
        code: 'UNEVEN_STRINGS',
        message: `${totalPanels} panels across ${totalStrings} strings of ${panelsPerString} = ${actualPanelsUsed} panel slots. Last string has ${panelsPerString - extraPanels} panels (${extraPanels} slot${extraPanels > 1 ? 's' : ''} empty). Uneven strings reduce efficiency.`
      });
    }

    // 7. System voltage check (1500V limit for most panels)
    const maxSysVoltage = panel.maxSysVoltage || 1500;
    if (stringVocCold > maxSysVoltage) {
      warnings.push({
        type: 'critical',
        code: 'SYSTEM_VOLTAGE_EXCEEDED',
        message: `⚠ CRITICAL: String voltage (${stringVocCold.toFixed(1)}V) exceeds panel max system voltage (${maxSysVoltage}V). This violates panel certification.`
      });
    }

    // MPPT configuration summary
    const mpptConfig = [];
    let remainingPanels = totalPanels;
    for (let m = 0; m < mpptCount && remainingPanels > 0; m++) {
      const stringsThisMppt = Math.min(stringsPerMppt, Math.ceil(remainingPanels / panelsPerString));
      const panelsThisMppt = Math.min(stringsThisMppt * panelsPerString, remainingPanels);
      mpptConfig.push({
        mppt: m + 1,
        strings: stringsThisMppt,
        panelsPerString,
        totalPanels: panelsThisMppt
      });
      remainingPanels -= panelsThisMppt;
    }

    return {
      panel, inverter, totalPanels,
      panelsPerString,
      minPanelsPerString,
      maxPanelsPerString,
      optimalPanelsPerString: panelsPerString,
      totalStrings,
      maxTotalStrings,
      mpptCount,
      stringsPerMppt,
      mpptConfig,
      vocCold: vocCold.toFixed(1),
      vmpHot: vmpHot.toFixed(1),
      vmpStc: vmpStc.toFixed(1),
      stringVocCold: stringVocCold.toFixed(1),
      stringVmpHot: stringVmpHot.toFixed(1),
      stringVmpStc: stringVmpStc.toFixed(1),
      dcCableRecommended,
      warnings,
      isValid: !warnings.some(w => w.type === 'critical')
    };
  }, [bom, catalog]);

  // --- Upgrade BOM Computation ---
  // Section mapping: which categories belong to which checkbox section
  const upgSectionMap = {
    // "panels" section: panels only
    panel: 'panels',
    // "structure" section: structure + hardware (clamps, screws, painting, welding)
    solar_clamp: 'structure', structure_material: 'structure',
    painting_material: 'structure', welding_material: 'structure', ss_screw: 'structure',
    // "inverter" section: ongrid inverter + DCDB + ACDB (or "hybridInv" overrides)
    inverter: 'inverter', dcdb: 'inverter', acdb: 'inverter',
    // "battery" section: battery + MCCB box + change over + battery cable
    battery: 'battery', mccb_box: 'battery', change_over: 'battery', battery_cable: 'battery',
    // "hybridInv" section extras
    meter_box: 'hybridInv',
    // "wiring" section: cables, conduit, connectors, lugs, tape
    dc_cable: 'wiring', ac_cable: 'wiring', conduit_pipe: 'wiring',
    mc4_connector: 'wiring', copper_lug: 'wiring', insulation_tape: 'wiring',
    cable_tie: 'wiring', flexible_pipe: 'wiring'
  };

  const upgradeBom = useMemo(() => {
    if (!catalog || sysType !== 'upgrade') return { lines: [], totals: {}, newPanels: 0, fromKw: 3, toKw: 5 };
    const tmpl = catalog.bomTemplates.upgrade;
    if (!tmpl) return { lines: [], totals: {}, newPanels: 0, fromKw: 3, toKw: 5 };

    const fromKw = parseFloat(upgradeFromKw) || 3;
    const toKw = parseFloat(upgradeToKw) || 5;
    // newPanels will be recalculated after panel selection based on wattage
    let newPanels = Math.max(1, Math.round((toKw - fromKw) / 0.55));
    const lines = [];
    let pos = 0;

    // If hybridInv is on, inverter section is replaced by hybrid
    const effectiveInvSection = upgradeSections.hybridInv ? 'hybridInv' : 'inverter';
    const isHybUpgrade = upgradeSections.hybridInv;

    // Hybrid phase restriction: up to 5kW only 1P hybrid inverters exist (3P starts at 8kW)
    const effectiveUpgradePhase = (isHybUpgrade && toKw <= 5) ? '1P' : upgradePhase;

    // Build dynamic slots: template slots + hybrid extras if needed
    const dynamicSlots = [...tmpl.slots];
    // If hybrid inverter checked, replace the ongrid inverter slot
    if (isHybUpgrade) {
      // Remove the ongrid inverter, DCDB, ACDB slots — replace with hybrid versions
      const invIdx = dynamicSlots.findIndex(s => s.category === 'inverter');
      if (invIdx >= 0) dynamicSlots.splice(invIdx, 1);
      const dcdbIdx = dynamicSlots.findIndex(s => s.category === 'dcdb');
      if (dcdbIdx >= 0) dynamicSlots.splice(dcdbIdx, 1);
      const acdbIdx = dynamicSlots.findIndex(s => s.category === 'acdb');
      if (acdbIdx >= 0) dynamicSlots.splice(acdbIdx, 1);

      // Add hybrid inverter slot
      dynamicSlots.splice(invIdx >= 0 ? invIdx : 1, 0, {
        pos: 100, category: 'inverter', label: 'Hybrid Inverter',
        variable: true, gst: 5, qtyMode: 'fixed', fixedQty: 1,
        filterType: 'hybrid', _section: 'hybridInv'
      });
      // Add hybrid DCDB (with HYB phase filter)
      dynamicSlots.push({
        pos: 104, category: 'dcdb', label: 'DCDB (Hybrid)',
        variable: true, gst: 18, qtyMode: 'fixed', fixedQty: 1,
        _section: 'hybridInv', _hybridDcdb: true
      });
      // Add hybrid ACDB (with HYB phase filter)
      dynamicSlots.push({
        pos: 105, category: 'acdb', label: 'ACDB (Hybrid)',
        variable: true, gst: 18, qtyMode: 'fixed', fixedQty: 1,
        filterType: 'hybrid', _section: 'hybridInv'
      });
      // Add battery-related slots if battery section is on
      if (upgradeSections.battery) {
        dynamicSlots.push({
          pos: 101, category: 'battery', label: 'Battery',
          variable: true, gst: 18, qtyMode: 'fixed', fixedQty: 1,
          _section: 'battery'
        });
        dynamicSlots.push({
          pos: 102, category: 'mccb_box', label: 'Battery MCCB Box',
          variable: true, gst: 18, qtyMode: 'fixed', fixedQty: 1,
          _section: 'battery'
        });
        dynamicSlots.push({
          pos: 103, category: 'meter', label: 'Meter (Battery)',
          variable: true, gst: 18, qtyMode: 'fixed', fixedQty: 1,
          _section: 'battery'
        });
      }
    }

    // Variable slots
    const isUpgPremiumMicro = upgradeTier === 'premium' && !isHybUpgrade;
    for (const slot of dynamicSlots) {
      // Check if this slot's section is enabled
      const section = slot._section || upgSectionMap[slot.category] || 'panels';
      // For inverter category: check based on hybrid toggle
      const effectiveSection = (slot.category === 'inverter') ? effectiveInvSection : section;
      if (!upgradeSections[effectiveSection]) continue;

      // Premium micro-inverter: skip the regular inverter and DCDB slots (Enphase doesn't need DCDB)
      if (isUpgPremiumMicro && (slot.category === 'inverter' || slot.category === 'dcdb')) continue;

      const category = catalog.categories[slot.category];
      if (!category) continue;

      let qty = 0;
      if (slot.qtyMode === 'newPanels') qty = newPanels;
      else if (slot.qtyMode === 'fixed') {
        // Use hybridQty for AC cable when hybrid inverter is selected
        qty = (isHybUpgrade && slot.hybridQty) ? slot.hybridQty : (slot.fixedQty || 0);
      }
      // AC Cable: override qty based on phase and system type
      if (slot.category === 'ac_cable') {
        if (isUpgPremiumMicro) {
          qty = effectiveUpgradePhase === '3P' ? 90 : 60; // Enphase needs more AC cable (micro-inverters use AC side)
        } else if (effectiveUpgradePhase === '3P') {
          qty = 40; // Normal on-grid 3P: ~35-40m
        }
        // 1P non-enphase keeps default (20m), hybrid keeps hybridQty (30m)
      }
      // DC Cable: Enphase needs less (short panel-to-micro runs only)
      if (slot.category === 'dc_cable' && isUpgPremiumMicro) {
        qty = Math.max(10, Math.ceil(newPanels * 2)); // ~2m per panel for short DC runs
      }
      if (qty === 0) continue;

      const upgPhaseFilter = item => {
        // Hybrid filter for hybrid slots
        if (slot.filterType === 'hybrid') {
          if (!item.type && !item.phase?.includes('HYB')) return false;
          if (item.type && item.type !== 'hybrid') return false;
          // Phase within hybrid
          if (item.phase?.includes('HYB')) {
            if (effectiveUpgradePhase === '3P') return item.phase.includes('3P');
            return item.phase.includes('1P');
          }
          return true;
        }
        if (slot.filterType === 'ongrid' && item.type && item.type !== 'ongrid') return false;
        // DCDB always uses 2/2 (3P-tagged) in upgrades — needs extra strings
        const isDcdb = slot.category === 'dcdb';
        if (isDcdb) {
          // For hybrid DCDB, filter HYB items
          if (slot._hybridDcdb) {
            if (!item.phase?.includes('HYB')) return false;
            if (effectiveUpgradePhase === '3P') return item.phase.includes('3P');
            return item.phase.includes('1P');
          }
          // Normal upgrade DCDB: always 2/2 (3P-tagged, non-hybrid)
          if (item.phase?.includes('HYB')) return false;
          return item.phase === '3P' || item.phase?.includes('3P');
        }
        // ACDB: use effectiveUpgradePhase
        const is3P = effectiveUpgradePhase === '3P';
        if (is3P && item.phase) {
          return item.phase.includes('3P') && !item.phase.includes('HYB');
        }
        if (!is3P && item.phase) {
          if (item.phase.includes('HYB')) return false;
          return item.phase === '1P' || item.phase.includes('1P') || !item.phase;
        }
        return true;
      };

      // DCR filter for upgrade panels
      const upgDcrFilter = (item) => {
        if (slot.category !== 'panel') return true;
        if (panelTypeFilter === 'DCR') return item.panelType === 'DCR' || item.dcr === true;
        if (panelTypeFilter === 'NON_DCR') return item.panelType === 'NON_DCR' || item.dcr === false;
        if (subsidyType === 'residential' || subsidyType === 'ghs') {
          return item.panelType === 'DCR' || item.dcr === true;
        }
        return true;
      };

      const available = category.items.filter(item => item.tiers?.includes(upgradeTier) && upgPhaseFilter(item) && upgDcrFilter(item));
      // DCDB/ACDB: show ALL options (1/1, 2/2, hybrid) so user can override phase default
      const isUpgDcdbAcdb = slot.category === 'dcdb' || slot.category === 'acdb';
      const allAvailable = isUpgDcdbAcdb
        ? category.items.filter(item => item.tiers?.length > 0)
        : category.items.filter(item => item.tiers?.length > 0 && upgPhaseFilter(item) && upgDcrFilter(item));

      const selKey = `upg_${upgradeTier}_${slot.pos}`;
      let selected = null;
      if (upgradeSelections[selKey]) {
        selected = allAvailable.find(i => i.id === upgradeSelections[selKey]);
      }
      if (!selected && available.length > 0) {
        if (slot.category === 'inverter' && available.some(i => i.kw)) {
          const kwSorted = [...available].sort((a, b) => Math.abs((a.kw || 0) - toKw) - Math.abs((b.kw || 0) - toKw));
          selected = kwSorted[0];
        } else {
          selected = available[0];
        }
      }

      // Dynamic panel qty for upgrade: panels needed = ceil(additionalKW * 1000 / panelWatts)
      if (slot.category === 'panel' && slot.qtyMode === 'newPanels' && selected?.watt) {
        const additionalWatts = (toKw - fromKw) * 1000;
        qty = Math.max(1, Math.ceil(additionalWatts / selected.watt));
        newPanels = qty;
      }

      const qKey = `upg_${slot.pos}`;
      const pKey = `upg_p_${slot.pos}`;
      const finalQty = upgradeQtyOverrides[qKey] !== undefined ? upgradeQtyOverrides[qKey] : qty;
      const unitPrice = upgradePriceOverrides[pKey] !== undefined ? upgradePriceOverrides[pKey] : (selected?.price || 0);
      const amount = finalQty * unitPrice;
      const gst = slot.gst || category.gstDefault || 18;
      const gstAmt = Math.round(amount * gst / 100);

      lines.push({
        pos: slot.pos, category: slot.category, label: slot.label, section,
        name: selected?.name || 'N/A', catalogItemId: selected?.id,
        type: selected?.type, brand: selected?.brand, watt: selected?.watt,
        kwh: selected?.kwh, kw: selected?.kw,
        qty: finalQty, defQty: qty, unitPrice, amount, gst, gstAmt,
        isVariable: true, available, allAvailable, qKey, pKey, unit: slot.category === 'dc_cable' || slot.category === 'ac_cable' ? 'm' : 'nos'
      });
      pos++;
    }

    // === PREMIUM MICRO-INVERTER for Upgrade: Enphase accessories ===
    const isUpgPremium = upgradeTier === 'premium';
    const isUpg3Phase = effectiveUpgradePhase === '3P'; // Use effective phase (respects hybrid 1P-only ≤5kW)
    if (isUpgPremium && catalog.categories.enphase) {
      const en = catalog.categories.enphase.items;
      const find = (m) => en.find(i => i.name.includes(m));
      const qTerminalQty = isUpg3Phase ? 3 : 1;
      const ctQty = isUpg3Phase ? 4 : 0;

      const addUpgMicroLine = (catKey, item, qty, label) => {
        if (!item || qty === 0) return;
        const cat = catalog.categories[catKey];
        const eqKey = `upg_micro_${item.id}`;
        const finalQty = upgradeQtyOverrides[eqKey] !== undefined ? upgradeQtyOverrides[eqKey] : qty;
        const itemGst = item.gstOverride || cat?.gstDefault || 18;
        const amount = finalQty * (item.price || 0);
        lines.push({
          pos: pos, category: catKey, label, section: 'inverter',
          name: item.name, catalogItemId: item.id,
          qty: finalQty, defQty: qty, unitPrice: item.price || 0,
          amount, gst: itemGst, gstAmt: Math.round(amount * itemGst / 100),
          isVariable: false, isEnphase: true, qKey: eqKey, unit: 'nos'
        });
        pos++;
      };

      // Only new panel-specific items — Envoy & Q Relay already installed in existing system
      addUpgMicroLine('enphase', find('IQ8P'), newPanels, 'IQ8P Micro Inverter (per panel)');
      addUpgMicroLine('enphase', find('Q Cable'), newPanels, 'Q Cable Portrait 2m (per panel)');
      addUpgMicroLine('enphase', find('Q Terminal'), qTerminalQty, `Enphase Q Terminal (${isUpg3Phase ? '3P×3' : '1P×1'})`);
      if (ctQty > 0) {
        addUpgMicroLine('enphase', find('CT'), ctQty, `Enphase CT 200 (3P — ${ctQty} nos)`);
      }
    }

    // === PHASE CHANGE ITEMS: When upgrading to 3P, add meter, meter box, isolator ===
    if (effectiveUpgradePhase === '3P') {
      const addPhaseItem = (catKey, filterFn, label, gstPct) => {
        const cat = catalog.categories[catKey];
        if (!cat) return;
        const available = cat.items.filter(i => i.tiers?.includes(upgradeTier) && filterFn(i));
        if (available.length === 0) return;
        const allAvail = cat.items.filter(i => i.tiers?.length > 0);
        const selKey = `upg_phase_${catKey}`;
        let selected = upgradeSelections[selKey] ? allAvail.find(i => i.id === upgradeSelections[selKey]) : null;
        if (!selected) selected = available[0];
        const qKey = `upg_ph_${catKey}`;
        const pKey = `upg_pp_${catKey}`;
        const finalQty = upgradeQtyOverrides[qKey] !== undefined ? upgradeQtyOverrides[qKey] : 1;
        const unitPrice = upgradePriceOverrides[pKey] !== undefined ? upgradePriceOverrides[pKey] : (selected?.price || 0);
        const amount = finalQty * unitPrice;
        const gst = gstPct || 18;
        lines.push({
          pos, category: catKey, label, section: 'inverter',
          name: selected.name, catalogItemId: selected.id,
          qty: finalQty, defQty: 1, unitPrice, amount, gst,
          gstAmt: Math.round(amount * gst / 100),
          isVariable: true, isPhaseChange: true, available, allAvailable: allAvail,
          qKey, pKey, unit: 'nos'
        });
        pos++;
      };
      addPhaseItem('meter', i => i.phase === '3P', '3-Phase Meter (phase change)', 18);
      addPhaseItem('meter_box', () => true, 'Meter Box (3P upgrade)', 18);
      addPhaseItem('isolator', i => i.phase === '3P' || !i.phase, '3-Phase Isolator (phase change)', 18);
    }

    // === HYBRID EXTRA: Add meter + meter box for all hybrid upgrades ===
    if (isHybUpgrade) {
      const meterCat = catalog.categories.meter;
      if (meterCat) {
        const hybMeters = meterCat.items.filter(i => i.tiers?.includes(upgradeTier) && i.phase === '1P');
        if (hybMeters.length > 0) {
          const selKey = `upg_hyb_meter`;
          let selected = upgradeSelections[selKey] ? meterCat.items.find(i => i.id === upgradeSelections[selKey]) : null;
          if (!selected) selected = hybMeters[0];
          const qKey = `upg_hm_meter`;
          const pKey = `upg_hp_meter`;
          const finalQty = upgradeQtyOverrides[qKey] !== undefined ? upgradeQtyOverrides[qKey] : 1;
          const unitPrice = upgradePriceOverrides[pKey] !== undefined ? upgradePriceOverrides[pKey] : (selected?.price || 0);
          const amount = finalQty * unitPrice;
          lines.push({
            pos, category: 'meter', label: 'Extra Meter (Hybrid)', section: 'hybridInv',
            name: selected.name, catalogItemId: selected.id,
            qty: finalQty, defQty: 1, unitPrice, amount, gst: 18,
            gstAmt: Math.round(amount * 18 / 100),
            isVariable: true, isHybridExtra: true,
            available: hybMeters, allAvailable: meterCat.items.filter(i => i.tiers?.length > 0),
            qKey, pKey, unit: 'nos'
          });
          pos++;
        }
      }
    }

    // Fixed items — path-based qty lookup with auto-scaling
    const pathKey = `${Math.round(fromKw)}_${Math.round(toKw)}`;
    // Known paths from Excel: 3_5 (~4 panels), 5_8 (~5 panels), 5_10 (~9 panels), 8_10 (~4 panels)
    const knownPaths = { '3_5': 4, '5_8': 5, '5_10': 9, '8_10': 4 };

    for (const fi of tmpl.fixedItems) {
      // Use explicit _section from template if set, otherwise map by category
      const section = fi._section || upgSectionMap[fi.category] || 'panels';
      if (!upgradeSections[section]) continue;

      const cat = catalog.categories[fi.category];
      const item = cat?.items?.find(i => i.id === fi.itemId);
      if (!item) continue;

      let qty = 0;
      if (fi.qty) {
        // Path-based qty: try exact path first
        if (fi.qty[pathKey] !== undefined) {
          qty = fi.qty[pathKey];
        } else {
          // Auto-scale: find the closest known path by panel count and scale
          const closestKey = Object.keys(fi.qty).reduce((best, k) => {
            const kPanels = knownPaths[k] || Math.round((parseInt(k.split('_')[1]) - parseInt(k.split('_')[0])) / 0.55);
            const bestPanels = knownPaths[best] || Math.round((parseInt(best.split('_')[1]) - parseInt(best.split('_')[0])) / 0.55);
            return Math.abs(kPanels - newPanels) < Math.abs(bestPanels - newPanels) ? k : best;
          });
          const refQty = fi.qty[closestKey] || 0;
          const refPanels = knownPaths[closestKey] || 4;
          // Scale proportionally if qty varies with panels, otherwise keep same
          const allSame = Object.values(fi.qty).every(v => v === refQty);
          qty = allSame ? refQty : Math.max(1, Math.round(refQty * newPanels / refPanels));
        }
      } else if (fi.qtyMode === 'fixed') {
        qty = fi.fixedQty || 0;
      }
      if (qty <= 0) continue;

      // MC4 Connector: scale with newPanels for upgrade premium micro only
      const isUpgMC4 = fi.name?.toLowerCase().includes('mc4');
      if (isUpgMC4 && isUpgPremium && newPanels > 0) {
        qty = newPanels;
      }

      const qKey = `upg_f_${pos}`;
      const pKey = `upg_p_f_${pos}`;
      const finalQty = upgradeQtyOverrides[qKey] !== undefined ? upgradeQtyOverrides[qKey] : qty;
      const unitPrice = upgradePriceOverrides[pKey] !== undefined ? upgradePriceOverrides[pKey] : (item.price || 0);
      const gst = fi.gst || cat?.gstDefault || 18;
      const amount = finalQty * unitPrice;
      const gstAmt = Math.round(amount * gst / 100);

      lines.push({
        pos: pos, category: fi.category, label: fi.name, section,
        name: item.name, catalogItemId: item.id,
        qty: finalQty, defQty: qty, unitPrice,
        amount, gst, gstAmt, isVariable: false, qKey, pKey, unit: fi.unit || 'nos'
      });
      pos++;
    }

    // Upgrade custom items (admin)
    for (const ci of upgradeCustomItems) {
      const amt = ci.qty * ci.price;
      const gstAmt = Math.round(amt * ci.gst / 100);
      lines.push({
        pos: pos, category: 'custom', label: ci.name, section: 'custom',
        name: ci.name, catalogItemId: null,
        qty: ci.qty, defQty: ci.qty, unitPrice: ci.price,
        amount: amt, gst: ci.gst, gstAmt, isVariable: false, isCustom: true,
        customId: ci.id, unit: 'nos'
      });
      pos++;
    }

    // Totals
    let matTotal = 0;
    for (const line of lines) {
      matTotal += line.amount;
    }
    const totalGst = Math.round(matTotal * 9 / 100); // Flat 9% GST
    const gst5 = 0, gst12 = 0, gst18 = 0; // Legacy compat
    const matWithGst = matTotal + totalGst;

    // Costs — use Cost Engine (matrix, transport config, office config)
    const costs = catalog.costs || {};
    const upInstMatrix = catalog.installationMatrix || {};
    const upInstCost = upInstMatrix[size]?.[roofType] || 0;
    const upTConfig = catalog.transportConfig || {};
    const upTransportCalc = Math.max(0, distKm - (upTConfig.baseDistanceKm || 100)) * (upTConfig.costPerKm || 35);
    const upOConfig = catalog.officeExpense || {};
    const upOfficeCost = upOConfig.expectedProjectsPerMonth > 0
      ? Math.round(upOConfig.monthlyExpense / upOConfig.expectedProjectsPerMonth)
      : (costs.office || 0);
    const costCalc = {
      installation: upInstCost || (toKw - fromKw) * (costs.installRate || 0),
      transportation: upTransportCalc,
      miscellaneous: costs.miscellaneous || 0,
      office: upOfficeCost
    };
    // Upgrade structure add-on
    let upgradeStructureAddOnTotal = 0;
    let upgradeStructureExtraCost = 0;
    let upgradeStructureExtraLines = [];
    let upgradeStructureExtraLabel = '';
    let upgradeStructureLabor = 0;
    let upgradeStructureRepairAmt = 0;
    if (upgradeAddOns.structure.enabled && catalog.structureTemplates) {
      const newKw = toKw - fromKw;
      // Config-driven: look up structure type from package profile for upgrade tier
      const upProfileKey = getProfileKey('ongrid', upgradeTier, '0');
      const upProfileStructure = getProfileStructure(catalog, upProfileKey);
      const tubeRate = upProfileStructure === 'GP' ? (costs.gpRatePerKg || 85) : (costs.giRatePerKg || 98.3);
      const flatRoofKey = 'flatRoof';
      const extraKey = upgradeAddOns.structure.type === 'elevated' ? 'elevated' : 'sheetRoof';
      const flatResult = calcStructureCost(catalog.structureTemplates[flatRoofKey], newKw, tubeRate);
      const extraResult = calcStructureCost(catalog.structureTemplates[extraKey], newKw, tubeRate);
      upgradeStructureExtraCost = Math.max(0, extraResult.total - flatResult.total);
      upgradeStructureExtraLines = extraResult.lines;
      upgradeStructureExtraLabel = upgradeAddOns.structure.type === 'elevated' ? 'Elevated' : 'Sheet Roof';
      upgradeStructureLabor = costs.structureLabor || 0;
      const repairPct = costs.structureRepairPct || 0;
      upgradeStructureRepairAmt = Math.round((upgradeStructureExtraCost + upgradeStructureLabor) * repairPct / 100);
      upgradeStructureAddOnTotal = upgradeStructureExtraCost + upgradeStructureLabor + upgradeStructureRepairAmt;
    }

    const overheads = Object.values(costCalc).reduce((s, v) => s + v, 0);
    const preGstSub = matTotal + overheads + upgradeStructureAddOnTotal;
    const marginPctVal = Number(marginVal) || 0;
    const mAmt = marginType === 'percent'
      ? Math.round(preGstSub * marginPctVal / 100)
      : marginPctVal;
    // Flat 9% GST on selling price (pre-GST cost + profit)
    const sub = preGstSub + mAmt;
    const allGst = Math.round(sub * 9 / 100);
    const grand = sub + allGst;

    // Market rate
    const mrKey = `upgrade_${Math.round(fromKw)}_${Math.round(toKw)}`;
    const marketRate = catalog.marketRates?.[mrKey]?.rate || 0;
    const priceDiffBase = catalog.marketRates?.[mrKey + '_diffBase']?.rate || 0;

    // --- Price difference: selected vs default items for variable slots ---
    let priceDiffTotal = 0;
    const priceDiffLines = [];
    for (const line of lines) {
      if (!line.isVariable || !line.available || line.available.length === 0) continue;
      const defaultItem = line.available[0];
      if (!defaultItem || defaultItem.id === line.catalogItemId) continue;
      const defaultTotal = (defaultItem.price || 0) * line.qty;
      const selectedTotal = line.unitPrice * line.qty;
      const diffPreGst = selectedTotal - defaultTotal;
      const diffGst = Math.round(diffPreGst * line.gst / 100);
      const diff = diffPreGst + diffGst;
      if (diff !== 0) {
        priceDiffTotal += diff;
        priceDiffLines.push({
          label: line.label, selectedName: line.name,
          defaultName: defaultItem.name, diff, diffPreGst, diffGst, gstPct: line.gst, qty: line.qty
        });
      }
    }

    const priceDiffDelta = priceDiffTotal - priceDiffBase;
    const customerPrice = marketRate > 0 ? marketRate + upgradeStructureAddOnTotal + priceDiffDelta : grand;

    return {
      lines, newPanels, fromKw, toKw,
      totals: { matTotal, gst5, gst12, gst18, totalGst, matWithGst },
      costCalc, sub, mAmt, grand, marketRate, customerPrice, mrKey,
      priceDiffTotal, priceDiffBase, priceDiffDelta, priceDiffLines,
      upgradeStructureAddOnTotal, upgradeStructureExtraCost, upgradeStructureExtraLines,
      upgradeStructureExtraLabel, upgradeStructureLabor, upgradeStructureRepairAmt
    };
  }, [catalog, sysType, upgradeFromKw, upgradeToKw, upgradePhase, upgradeTier, upgradeSelections, upgradeQtyOverrides, upgradePriceOverrides, upgradeSections, distKm, costOvr, marginType, marginVal, upgradeCustomItems, upgradeAddOns]);

  // ============================================================
  // UPGRADE STRING CONFIG (2 MPPTs: existing + future expansion)
  // ============================================================
  const upgradeStringConfig = useMemo(() => {
    if (!upgradeBom?.lines || upgradeBom.lines.length === 0) return null;

    const panelLine = upgradeBom.lines.find(l => l.category === 'panel');
    const invLine = upgradeBom.lines.find(l => l.category === 'inverter');
    if (!panelLine || !invLine) return null;

    const panelCat = catalog.categories?.panel?.items || [];
    const invCat = catalog.categories?.inverter?.items || [];
    const panel = panelCat.find(p => p.id === panelLine.catalogItemId);
    const inverter = invCat.find(i => i.id === invLine.catalogItemId);

    if (!panel?.voc || !inverter?.mpptCount) return null;
    if (inverter.isMicro || inverter.optimizerBased) return null;

    const { voc, vmp, isc, tempCoeffVoc } = panel;
    const { mpptCount: mc, mpptVoltageMin, mpptVoltageMax, maxInputVoltage, maxInputCurrent, maxStringsPerMppt } = inverter;

    const T_MIN = 15; const T_MAX = 70; const T_STC = 25;
    const vocCold = voc * (1 + (tempCoeffVoc / 100) * (T_MIN - T_STC));
    const vmpHot = vmp * (1 + (tempCoeffVoc / 100) * (T_MAX - T_STC));

    const maxPPS = Math.floor(maxInputVoltage / vocCold);
    const minPPS = Math.ceil(mpptVoltageMin / vmpHot);
    const mpptMid = (mpptVoltageMin + mpptVoltageMax) * 0.65;
    const optPPS = Math.max(minPPS, Math.min(maxPPS, Math.round(mpptMid / vmp)));

    // Upgrade logic: MPPT1 = existing panels, MPPT2 = future expansion
    const newPanels = panelLine.qty;
    const fromKw = parseFloat(upgradeFromKw) || 0;
    const existingPanels = Math.ceil((fromKw * 1000) / (panel.watt || 540));

    const warnings = [];
    const mpptAllocation = [];

    if (mc >= 2) {
      const existStrings = existingPanels > 0 ? Math.ceil(existingPanels / optPPS) : 0;
      if (existingPanels > 0) {
        mpptAllocation.push({
          mppt: 1, label: 'Existing System',
          strings: existStrings,
          panelsPerString: optPPS,
          totalPanels: existingPanels
        });
      }
      const newStrings = Math.ceil(newPanels / optPPS);
      mpptAllocation.push({
        mppt: existingPanels > 0 ? 2 : 1, label: existingPanels > 0 ? 'New Expansion' : 'New Panels',
        strings: newStrings,
        panelsPerString: optPPS,
        totalPanels: newPanels
      });

      if (existStrings > maxStringsPerMppt) {
        warnings.push({ type: 'warning', code: 'EXIST_STRINGS_HIGH', message: `Existing system needs ${existStrings} strings but MPPT1 supports max ${maxStringsPerMppt}. May need combiner box.` });
      }
      if (newStrings > maxStringsPerMppt) {
        warnings.push({ type: 'warning', code: 'NEW_STRINGS_HIGH', message: `New panels need ${newStrings} strings but MPPT2 supports max ${maxStringsPerMppt}. May need combiner box.` });
      }
    } else {
      const totalP = existingPanels + newPanels;
      const strings = Math.ceil(totalP / optPPS);
      mpptAllocation.push({ mppt: 1, label: 'All Panels', strings, panelsPerString: optPPS, totalPanels: totalP });
      warnings.push({ type: 'info', code: 'SINGLE_MPPT', message: `Single MPPT inverter — all ${totalP} panels on one tracker. Consider dual-MPPT for better optimization.` });
    }

    if (isc > maxInputCurrent) {
      warnings.push({ type: 'warning', code: 'ISC_HIGH', message: `Panel Isc (${isc}A) exceeds inverter max input current (${maxInputCurrent}A).` });
    }

    return {
      panel, inverter,
      panelsPerString: optPPS,
      mpptAllocation,
      existingPanels,
      newPanels,
      dcCableRecommended: 50,
      warnings,
      isValid: !warnings.some(w => w.type === 'critical')
    };
  }, [upgradeBom, catalog, upgradeFromKw]);

  // --- Discount calculation ---
  const discountCalc = useMemo(() => {
    const activeBom = sysType === 'upgrade' ? upgradeBom : bom;
    const basePrice = activeBom.customerPrice || activeBom.grand || 0;
    const currentTier = sysType === 'upgrade' ? upgradeTier : tier;
    const applicableOffers = offers.filter(o => {
      const sysMatch = o.appliesTo === 'all' || o.appliesTo === sysType;
      const tierMatch = !o.appliesToTier || o.appliesToTier === 'all' || o.appliesToTier === currentTier;
      return sysMatch && tierMatch;
    });

    let discountAmt = 0;
    let discountLabel = '';
    if (selectedOffer && selectedOffer !== 'custom') {
      const offer = applicableOffers.find(o => o.id === selectedOffer);
      if (offer) {
        discountAmt = offer.type === 'percent'
          ? Math.round(basePrice * offer.value / 100)
          : offer.value;
        discountLabel = offer.name;
      }
    }

    const finalPrice = Math.max(0, basePrice - discountAmt);

    // PM Surya Ghar subsidy calculation
    const kw = sysType === 'upgrade' ? (upgradeBom.toKw - upgradeBom.fromKw) : (parseFloat(size) || 3);
    let subsidy = 0;
    let subsidyLabel = '';
    if (subsidyType === 'residential') {
      // Residential: ₹30,000/kW first 2kW, ₹18,000/kW for 2-3kW, capped ₹78,000 for >3kW
      if (kw <= 2) {
        subsidy = kw * 30000;
      } else if (kw <= 3) {
        subsidy = (2 * 30000) + ((kw - 2) * 18000);
      } else {
        subsidy = 78000;
      }
      subsidyLabel = `PM Surya Ghar — Residential (${kw}kW)`;
    } else if (subsidyType === 'ghs') {
      // GHS/RWA: ₹18,000/kW, up to 500kW total (3kW per house cap)
      const perHouseKw = Math.min(kw, 3); // max 3kW subsidy per house
      subsidy = perHouseKw * 18000 * ghsHouses;
      const maxCommunity = 500; // max 500kW community cap
      const maxSubsidy = Math.min(maxCommunity, ghsHouses * 3) * 18000;
      subsidy = Math.min(subsidy, maxSubsidy);
      subsidyLabel = `PM Surya Ghar — GHS/RWA (${ghsHouses} house${ghsHouses > 1 ? 's' : ''} × ${perHouseKw}kW)`;
    }
    const priceAfterSubsidy = Math.max(0, finalPrice - subsidy);

    return { discountAmt, discountLabel, finalPrice, subsidy, subsidyLabel, priceAfterSubsidy, applicableOffers, basePrice, kw };
  }, [sysType, bom, upgradeBom, offers, selectedOffer, size, tier, upgradeTier, subsidyType, ghsHouses]);

  // --- Per-tier discount calculation for package comparison quotation ---
  const allTierDiscounts = useMemo(() => {
    const result = {};
    for (const t of ['base', 'value', 'premium']) {
      const tierBom = allTierBoms[t];
      if (!tierBom) { result[t] = { discountAmt: 0, finalPrice: 0, subsidy: 0, priceAfterSubsidy: 0 }; continue; }
      const basePrice = tierBom.customerPrice || tierBom.grand || 0;
      const applicableOffers = offers.filter(o => {
        const sysMatch = o.appliesTo === 'all' || o.appliesTo === sysType;
        const tierMatch = !o.appliesToTier || o.appliesToTier === 'all' || o.appliesToTier === t;
        return sysMatch && tierMatch;
      });
      let discountAmt = 0, discountLabel = '';
      if (selectedOffer && selectedOffer !== 'custom') {
        const offer = applicableOffers.find(o => o.id === selectedOffer);
        if (offer) {
          discountAmt = offer.type === 'percent' ? Math.round(basePrice * offer.value / 100) : offer.value;
          discountLabel = offer.name;
        }
      }
      const finalPrice = Math.max(0, basePrice - discountAmt);
      const kw = parseFloat(size) || 3;
      let subsidy = 0, subsidyLabel = '';
      if (subsidyType === 'residential') {
        if (kw <= 2) subsidy = kw * 30000;
        else if (kw <= 3) subsidy = (2 * 30000) + ((kw - 2) * 18000);
        else subsidy = 78000;
        subsidyLabel = `PM Surya Ghar (${kw}kW)`;
      } else if (subsidyType === 'ghs') {
        const perHouseKw = Math.min(kw, 3);
        subsidy = perHouseKw * 18000 * ghsHouses;
        subsidyLabel = `PM Surya Ghar GHS (${ghsHouses} houses)`;
      }
      const priceAfterSubsidy = Math.max(0, finalPrice - subsidy);
      result[t] = { discountAmt, discountLabel, finalPrice, subsidy, subsidyLabel, priceAfterSubsidy, applicableOffers, basePrice };
    }
    return result;
  }, [allTierBoms, sysType, offers, selectedOffer, size, subsidyType, ghsHouses]);

  // --- Handlers ---
  const bomSizeKey = (futureUpgrade && upgradeSize) ? upgradeSize : size;
  const handleSelection = (slotPos, itemId, category) => {
    if (sysType === 'upgrade') {
      const key = `upg_${upgradeTier}_${slotPos}`;
      setUpgradeSelections(prev => ({ ...prev, [key]: itemId }));
      return;
    }
    const slotBomSize = category === 'panel' ? size : bomSizeKey;
    const key = `${sysType}_${tier}_${slotBomSize}_${slotPos}`;
    setSelections(prev => ({ ...prev, [key]: itemId }));
  };

  const handleQtyChange = (key, val) => {
    const setter = sysType === 'upgrade' ? setUpgradeQtyOverrides : setQtyOverrides;
    setter(prev => {
      const next = { ...prev };
      if (val === '' || val === undefined) delete next[key];
      else next[key] = Number(val);
      return next;
    });
  };

  const switchSysType = (newType) => {
    setSysType(newType);
    setFutureUpgrade(false);
    setUpgradeSize('');
    if (newType === 'upgrade') return; // No size conversion needed
    if (newType === 'hybrid') {
      if (size === '5sp' || size === '5tp') setSize('5');
      if (size === '6') setSize('3');
    } else {
      if (size === '5') setSize(housePhase === '3P' ? '5tp' : '5sp');
    }
  };

  // Phase-aware size setter: auto-corrects 5kW variant based on house phase
  const setPhaseAwareSize = (newSize) => {
    if (sysType !== 'hybrid') {
      if (newSize === '5sp' && housePhase === '3P') { setSize('5tp'); return; }
      if (newSize === '5tp' && housePhase === '1P') { setSize('5sp'); return; }
    }
    setSize(newSize);
  };

  // When house phase changes, auto-correct size
  const handlePhaseChange = (newPhase) => {
    setHousePhase(newPhase);
    if (sysType === 'hybrid') return; // hybrid doesn't have sp/tp split
    if (newPhase === '3P' && size === '5sp') setSize('5tp');
    if (newPhase === '1P' && size === '5tp') setSize('5sp');
  };

  const addCustom = () => {
    setCustomItems(prev => [...prev, { id: Date.now(), name: 'New Item', qty: 1, price: 0, gst: 18 }]);
  };
  const removeCustom = (id) => setCustomItems(prev => prev.filter(c => c.id !== id));
  const updateCustom = (id, field, val) => {
    setCustomItems(prev => prev.map(c => {
      if (c.id !== id) return c;
      return { ...c, [field]: field === 'name' ? val : Number(val) || 0 };
    }));
  };

  const addUpgradeCustom = () => {
    setUpgradeCustomItems(prev => [...prev, { id: Date.now(), name: 'New Item', qty: 1, price: 0, gst: 18 }]);
  };
  const removeUpgradeCustom = (id) => setUpgradeCustomItems(prev => prev.filter(c => c.id !== id));
  const updateUpgradeCustom = (id, field, val) => {
    setUpgradeCustomItems(prev => prev.map(c => {
      if (c.id !== id) return c;
      return { ...c, [field]: field === 'name' ? val : Number(val) || 0 };
    }));
  };
  const clearUpgradeCustom = () => setUpgradeCustomItems([]);

  const exportCsv = () => {
    const isQ = mode === 'quotation';
    const currentBom = sysType === 'upgrade' ? upgradeBom : bom;
    let csv = isQ
      ? 'No,Material / Brand,Qty,Unit,Unit Price,Amount,GST%\n'
      : 'No,Material / Brand,Qty,Unit\n';

    currentBom.lines.forEach((item, i) => {
      let r = `${i + 1},"${item.name.replace(/"/g, '""')}",${item.qty},${item.unit || 'nos'}`;
      if (isQ) r += `,${item.unitPrice},${item.amount},9%`;
      csv += r + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const label = sysType === 'upgrade' ? `Upgrade_${upgradeFromKw}to${upgradeToKw}kW` : sysType === 'hybrid' ? `Hybrid_${batConfig}Bat` : tier;
    a.download = `GoldenRay_BOM_${label}_${mode}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- Render ---
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="text-center">
        <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600">Loading catalog...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
        <h2 className="text-red-800 font-bold text-lg mb-2">Error</h2>
        <p className="text-red-600">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Retry</button>
      </div>
    </div>
  );

  if (!catalog) return null;

  const isUpgrade = sysType === 'upgrade';
  const template = catalog.bomTemplates[sysType] || catalog.bomTemplates.ongrid;
  const sizeKeys = template.sizes ? Object.keys(template.sizes) : [];
  const sizeLabels = template.sizes || {};
  const isHyb = sysType === 'hybrid';
  const isQ = mode === 'quotation';
  const kw = parseFloat(size) || 3;
  const bomKwDisplay = (futureUpgrade && upgradeSize) ? (parseFloat(upgradeSize) || kw) : kw;

  const tierColors = { base: 'bg-orange-500', value: 'bg-emerald-600', premium: 'bg-purple-600' };
  const batLabels = { '0': 'No Battery', '1': '1 Battery', '2': '2 Battery' };

  return (
    <div className="min-h-screen p-3" style={{ background: 'var(--bg)' }}>
      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden" style={{ borderColor: 'var(--line)' }}>

        {/* Header — Sticky warm bar */}
        <div className="sticky top-0 z-40 px-5 py-3 flex justify-between items-center border-b" style={{ background: 'linear-gradient(135deg, #FFF8ED, #FFF0D6)', borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">☀</span>
              <div>
                <span className="text-lg font-bold" style={{ color: 'var(--ink-1)' }}>Golden Ray</span>
                <span className="text-lg" style={{ color: 'var(--accent)' }}> ·</span>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-3)' }}>by Flarize</div>
              </div>
            </div>
            <div className="hidden sm:block h-6 w-px bg-gray-300 mx-1"></div>
            <span className="hidden sm:block text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-2)' }}>BOM Generator</span>
            <div className="hidden md:flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
              <span style={{ color: isUpgrade ? '#DE350B' : isHyb ? '#00856F' : 'var(--accent)' }}>{'\u25CF'}</span>
              <span>{isUpgrade ? 'Upgrade' : isHyb ? 'Hybrid' : 'On-Grid'}</span>
              <span style={{ color: 'var(--ink-3)' }}>/</span>
              <span>{isUpgrade ? `${upgradeFromKw}→${upgradeToKw}kW` : sizeLabels[size]}</span>
              <span style={{ color: 'var(--ink-3)' }}>/</span>
              <span>{isUpgrade ? upgradeTier : tier}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 no-print">
            {/* Unsaved Changes Indicator + Save/Discard */}
            {admin && bomDirty && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: '#FEF3C7', border: '1px solid #F59E0B' }}>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span className="text-xs font-bold text-amber-800">{t('unsavedChanges')}</span>
                <button onClick={saveBomState} disabled={bomSaving}
                  className="px-2 py-0.5 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700 transition">
                  {bomSaving ? t('saving') : t('saveBom')}
                </button>
                <button onClick={discardBomChanges}
                  className="px-2 py-0.5 bg-gray-400 text-white rounded text-xs font-bold hover:bg-gray-500 transition">
                  {t('discardChanges')}
                </button>
              </div>
            )}
            {admin && bomSaveMsg && (
              <span className={`text-xs font-bold px-2 py-1 rounded ${bomSaveMsg.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {bomSaveMsg.startsWith('Error') ? '\u2717' : '\u2713'} {bomSaveMsg}
              </span>
            )}

            {showPwd && !admin && (
              <div className="flex items-center gap-1 rounded-lg px-2 py-1" style={{ background: 'rgba(30,58,95,0.08)' }}>
                <input type="password" value={pwdInput}
                  onChange={e => { setPwdInput(e.target.value); setPwdErr(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
                  placeholder={pwdErr === 'rate' ? t('tooManyTries') : t('password')}
                  className={`w-28 px-2 py-1 rounded text-xs focus:outline-none ${pwdErr ? 'border-2 border-red-500 bg-red-50' : 'border border-gray-300 bg-white'}`}
                  style={{ color: 'var(--ink-1)' }}
                  autoFocus />
                <button onClick={handleLogin} className="px-2 py-1 rounded text-xs font-semibold text-white" style={{ background: 'var(--green)' }}>Go</button>
                <button onClick={() => { setShowPwd(false); setPwdInput(''); }} className="px-2 py-1 bg-gray-400 text-white rounded text-xs font-semibold">X</button>
              </div>
            )}
            {admin && (
              <button onClick={() => {}} className="px-3 py-2 rounded-lg text-xs font-bold border transition hover:opacity-80" style={{ borderColor: 'var(--line)', color: 'var(--ink-1)', background: 'var(--card)' }}>
                <span className="mr-1">{'\u2699'}</span> {t('adminConsole')}
              </button>
            )}
            <button onClick={admin ? handleLogout : () => setShowPwd(true)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition ${admin ? 'text-white hover:opacity-90' : 'border hover:opacity-80'}`}
              style={admin ? { background: 'var(--red)' } : { borderColor: 'var(--line)', color: 'var(--ink-1)', background: 'var(--card)' }}>
              {admin ? t('exitAdmin') : '\uD83D\uDD12 ' + t('adminLogin')}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* Customer Info */}
          {isQ && (
            <div className="rounded-lg p-3 no-print space-y-2" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }}></div>
                <h3 className="font-bold text-xs uppercase tracking-wide" style={{ color: 'var(--ink-1)' }}>{t('quotationDetails')}</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--ink-3)' }}>{t('customerName')}</label>
                  <input type="text" placeholder={t('fullName')} value={custName} onChange={e => setCustName(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-amber-400 focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--ink-3)' }}>{t('phone')}</label>
                  <input type="tel" placeholder={t('phoneNumber')} value={custPhone} onChange={e => setCustPhone(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-amber-400 focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--ink-3)' }}>{t('address')}</label>
                  <input type="text" placeholder={t('locationAddress')} value={custAddress} onChange={e => setCustAddress(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-amber-400 focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--ink-3)' }}>{t('salesPerson')}</label>
                  <input type="text" placeholder={t('yourName')} value={salesPerson} onChange={e => setSalesPerson(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-amber-400 focus:outline-none" />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: System Type Cards */}
          <div className="no-print">
            <div className="step-label">{t('step1')} <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{t('selectInstallationType')}</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { key: 'ongrid', icon: '\u2600', title: t('onGrid'), sub: t('onGridSub'), desc: t('onGridDesc'), color: '#D4922A' },
                { key: 'hybrid', icon: '\uD83D\uDD0B', title: t('hybrid'), sub: t('hybridSub'), desc: t('hybridDesc'), color: '#00856F' },
                { key: 'upgrade', icon: '\u2B06', title: t('upgrade'), sub: t('upgradeSub'), desc: t('upgradeDesc'), color: '#DE350B' },
              ].map(t => (
                <div key={t.key} onClick={() => switchSysType(t.key)}
                  className={`type-card ${sysType === t.key ? 'active' : ''}`}
                  style={sysType === t.key ? { borderColor: t.color, boxShadow: `0 0 0 1px ${t.color}` } : {}}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl" style={{ opacity: 0.8 }}>{t.icon}</span>
                      <div>
                        <div className="font-bold text-sm" style={{ color: 'var(--ink-1)' }}>{t.title}</div>
                        <div className="text-xs" style={{ color: 'var(--ink-3)' }}>{t.sub}</div>
                      </div>
                    </div>
                    {sysType === t.key && <span className="text-lg" style={{ color: t.color }}>{'\u2714'}</span>}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>{t.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ========== UPGRADE MODE ========== */}
          {isUpgrade && <UpgradePanel
            catalog={catalog} admin={admin} isQ={isQ} mode={mode}
            upgradeFromKw={upgradeFromKw} setUpgradeFromKw={setUpgradeFromKw}
            upgradeToKw={upgradeToKw} setUpgradeToKw={setUpgradeToKw}
            upgradePhase={upgradePhase} setUpgradePhase={setUpgradePhase}
            upgradeTier={upgradeTier} setUpgradeTier={setUpgradeTier}
            upgradeSections={upgradeSections} setUpgradeSections={setUpgradeSections}
            upgradeBom={upgradeBom} handleSelection={handleSelection}
            handleQtyChange={handleQtyChange} distKm={distKm} setDistKm={setDistKm}
            mrInput={mrInput} setMrInput={setMrInput} mrSaved={mrSaved} setMrSaved={setMrSaved}
            authHeaders={authHeaders} refreshCatalog={refreshCatalog}
            marginType={marginType} setMarginType={setMarginType} marginVal={marginVal} setMarginVal={setMarginVal}
            costOvr={costOvr} setCostOvr={setCostOvr} fmt={fmt}
            discountCalc={discountCalc} offers={offers}
            selectedOffer={selectedOffer} setSelectedOffer={setSelectedOffer}
            subsidyType={subsidyType} setSubsidyType={setSubsidyType}
            ghsHouses={ghsHouses} setGhsHouses={setGhsHouses}
            handleUpgradePriceChange={(pKey, val) => setUpgradePriceOverrides(prev => ({ ...prev, [pKey]: val }))}
            upgradeAddOns={upgradeAddOns} setUpgradeAddOns={setUpgradeAddOns}
            upgradeCustomItems={upgradeCustomItems}
            addUpgradeCustom={addUpgradeCustom}
            removeUpgradeCustom={removeUpgradeCustom}
            updateUpgradeCustom={updateUpgradeCustom}
            clearUpgradeCustom={clearUpgradeCustom}
            upgradeStringConfig={upgradeStringConfig}
          />}

          {/* ========== NORMAL MODE (ongrid / hybrid) ========== */}
          {!isUpgrade && <>

          {/* KSEB Bill Calculator — helps sales team find the right system size */}
          <div className="no-print">
            <button
              onClick={() => setShowBillCalc(!showBillCalc)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold transition-all"
              style={{
                background: showBillCalc ? '#FFF7ED' : 'var(--card)',
                borderColor: showBillCalc ? '#F59E0B' : 'var(--line)',
                color: 'var(--ink-1)'
              }}>
              <span className="flex items-center gap-2">
                <span style={{ fontSize: 18 }}>{'\u26A1'}</span>
                KSEB Bill Calculator {'\u2014'} Find the right system size
              </span>
              <span style={{ transform: showBillCalc ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>{'\u25BC'}</span>
            </button>

            {showBillCalc && (
              <div className="bg-white rounded-b-xl border border-t-0 p-4 space-y-4" style={{ borderColor: showBillCalc ? '#F59E0B' : 'var(--line)' }}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Bill Amount Input */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-2)' }}>
                      Electricity Bill Amount ({'\u20B9'})
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{'\u20B9'}</span>
                      <input
                        type="number"
                        placeholder="e.g. 5000"
                        value={billAmt}
                        onChange={e => setBillAmt(e.target.value)}
                        className="w-full pl-8 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-400 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Billing Frequency */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-2)' }}>
                      Billing Cycle
                    </label>
                    <div className="pill-group">
                      {[
                        { key: 'bimonthly', label: 'Bi-Monthly' },
                        { key: 'monthly', label: 'Monthly' },
                      ].map(f => (
                        <button key={f.key} onClick={() => setBillFreq(f.key)}
                          className={`pill-btn flex-1 ${billFreq === f.key ? 'active' : ''}`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>KSEB bills bi-monthly (every 2 months)</p>
                  </div>

                  {/* House Phase */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-2)' }}>
                      House Connection
                    </label>
                    <div className="pill-group">
                      {[
                        { key: '1P', label: 'Single Phase' },
                        { key: '3P', label: 'Three Phase' },
                      ].map(p => (
                        <button key={p.key} onClick={() => handlePhaseChange(p.key)}
                          className={`pill-btn flex-1 ${housePhase === p.key ? 'active' : ''}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>
                      {housePhase === '1P' ? 'Max 5 kW on single phase' : '6 kW and above available'}
                    </p>
                  </div>

                  {/* Result */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-2)' }}>
                      Recommended Size
                    </label>
                    {billCalc ? (
                      <button
                        onClick={() => {
                          if (billCalc.recommendedKey) {
                            setSize(billCalc.recommendedKey);
                            setShowBillCalc(false);
                          }
                        }}
                        className="w-full py-2.5 rounded-lg text-white font-bold text-lg transition-all hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg, #D4922A, #B87A1E)' }}>
                        {billCalc.recommended ? `${billCalc.recommended.kw} kW` : `${billCalc.exactKw} kW`}
                        <span className="block text-[10px] font-normal opacity-80">Click to select</span>
                      </button>
                    ) : (
                      <div className="w-full py-2.5 rounded-lg text-center text-sm text-gray-400 border border-dashed border-gray-300">
                        Enter bill amount
                      </div>
                    )}
                  </div>
                </div>

                {/* Detailed breakdown */}
                {billCalc && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-lg p-3 text-center" style={{ background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
                      <div className="text-[10px] font-bold uppercase text-blue-600 mb-1">Monthly Usage</div>
                      <div className="text-lg font-bold text-blue-800">{billCalc.monthlyUnits}</div>
                      <div className="text-[10px] text-blue-500">units/month</div>
                    </div>
                    <div className="rounded-lg p-3 text-center" style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}>
                      <div className="text-[10px] font-bold uppercase text-amber-600 mb-1">Ideal System</div>
                      <div className="text-lg font-bold text-amber-800">{billCalc.exactKw} kW</div>
                      <div className="text-[10px] text-amber-500">exact calculation</div>
                    </div>
                    <div className="rounded-lg p-3 text-center" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                      <div className="text-[10px] font-bold uppercase text-green-600 mb-1">Monthly Savings</div>
                      <div className="text-lg font-bold text-green-800">{fmt(billCalc.monthlySavings)}</div>
                      <div className="text-[10px] text-green-500">{fmt(billCalc.annualSavings)}/year</div>
                    </div>
                    <div className="rounded-lg p-3 text-center" style={{ background: '#FDF2F8', border: '1px solid #FBCFE8' }}>
                      <div className="text-[10px] font-bold uppercase text-pink-600 mb-1">Payback Period</div>
                      <div className="text-lg font-bold text-pink-800">{billCalc.paybackYears}</div>
                      <div className="text-[10px] text-pink-500">years (approx)</div>
                    </div>
                  </div>
                )}

                {/* Phase upgrade warning */}
                {billCalc && billCalc.phaseUpgradeNeeded && (
                  <div className="rounded-lg p-3 text-sm" style={{ background: '#FEF3C7', border: '1px solid #F59E0B' }}>
                    <span className="font-bold text-amber-800">{'\u26A0'} Phase Upgrade Needed:</span>
                    <span className="text-amber-700"> Customer needs {billCalc.exactKw} kW but has single-phase connection. Max 5 kW on 1{'\u03A6'}. Recommend KSEB 3-phase upgrade ({'\u20B9'}3,000{'\u2013'}5,000 fee) to install {billCalc.exactKw > 5 ? '6\u201310 kW' : ''}. Or install max 5 kW on current connection.</span>
                  </div>
                )}

                {billCalc && (
                  <p className="text-[10px] text-center" style={{ color: 'var(--ink-3)' }}>
                    Based on KSEB 2025-27 domestic tariff {'\u00B7'} Kerala avg {billCalc.monthlyGenPerKw} units/kW/month {'\u00B7'} GHI ~4.8 kWh/m{'\u00B2'}/day {'\u00B7'} PR 0.78
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Configuration */}
          <div className="no-print mt-4">
            <div className="step-label">{t('step2')} <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{t('selectSystemSize')}</span></div>
            <div className="bg-white rounded-xl p-4 border" style={{ borderColor: 'var(--line)' }}>
              <div className={`grid grid-cols-1 ${isHyb ? 'md:grid-cols-3 lg:grid-cols-5' : 'md:grid-cols-2 lg:grid-cols-4'} gap-4`}>
                {/* House Phase */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-2)' }}>
                    House Phase
                  </label>
                  <div className="pill-group">
                    {[
                      { key: '1P', label: 'Single Phase' },
                      { key: '3P', label: 'Three Phase' },
                    ].map(p => (
                      <button key={p.key} onClick={() => handlePhaseChange(p.key)}
                        className={`pill-btn flex-1 ${housePhase === p.key ? 'active' : ''}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Size — phase-aware: only show valid sizes */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-2)' }}>System Size</label>
                  <div className="pill-group flex flex-wrap">
                    {sizeKeys.filter(k => {
                      const kwVal = parseFloat(k) || (k === '5sp' || k === '5tp' ? 5 : 3);
                      const needs3P = kwVal >= 6 || k === '5tp';
                      if (housePhase === '1P') return !needs3P;
                      if (housePhase === '3P') return k !== '5sp' && k !== '3';
                      return true;
                    }).map(k => (
                      <button key={k} onClick={() => setPhaseAwareSize(k)}
                        className={`pill-btn ${size === k ? 'active' : ''}`}>
                        {sizeLabels[k]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tier */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-2)' }}>Package Tier</label>
                  <div className="pill-group">
                    {(template.tiers || ['base', 'value', 'premium']).map(t => (
                      <button key={t} onClick={() => setTier(t)}
                        className={`pill-btn flex-1 ${tier === t ? 'active' : ''}`}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Battery Config (Hybrid only) */}
                {isHyb && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-2)' }}>Battery Config</label>
                    <div className="pill-group">
                      {['0', '1', '2'].map(bt => (
                        <button key={bt} onClick={() => setBatConfig(bt)}
                          className={`pill-btn flex-1 ${batConfig === bt ? 'active' : ''}`}>
                          {batLabels[bt]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mode */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-2)' }}>Output Mode</label>
                  <div className="pill-group">
                    {['quotation', 'dispatch'].map(md => (
                      <button key={md} onClick={() => setMode(md)}
                        className={`pill-btn flex-1 ${mode === md ? 'active-gold' : ''}`}>
                        {md === 'quotation' ? t('quotation') : t('dispatch')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row 2: Subsidy toggle */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
                {/* Subsidy Yes/No */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-2)' }}>Eligible for Subsidy</label>
                  <div className="pill-group">
                    <button onClick={() => {
                      setSubsidyType('residential');
                      setPanelTypeFilter('DCR');
                    }}
                      className={`pill-btn flex-1 ${subsidyType !== 'none' ? 'active' : ''}`}>
                      Yes
                    </button>
                    <button onClick={() => {
                      setSubsidyType('none');
                      setPanelTypeFilter('all');
                    }}
                      className={`pill-btn flex-1 ${subsidyType === 'none' ? 'active' : ''}`}>
                      No
                    </button>
                  </div>
                  {subsidyType !== 'none' && (
                    <p className="text-[10px] mt-1 font-medium" style={{ color: 'var(--accent)' }}>
                      DCR panels only — MNRE subsidy eligible
                    </p>
                  )}
                </div>

                {/* Roof Type */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-2)' }}>Roof Type</label>
                  <div className="pill-group">
                    {[
                      { key: 'flat', label: 'Flat Roof' },
                      { key: 'sheet', label: 'Sheet Roof' },
                      { key: 'elevated', label: 'Elevated' },
                    ].map(rt => (
                      <button key={rt.key} onClick={() => setRoofType(rt.key)}
                        className={`pill-btn flex-1 ${roofType === rt.key ? 'active' : ''}`}>
                        {rt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Phase-aware: invalid sizes hidden, no mismatch warning needed */}


          {/* Enhanced Future Upgrade — independent inverter kW + optional components */}
          {tier !== 'premium' && (() => {
            const kwMap = isHyb
              ? { '3': 3, '5': 5, '8': 8, '10': 10 }
              : { '3': 3, '5sp': 5, '5tp': 5, '6': 6, '8': 8, '10': 10 };
            const currentKw = kwMap[size] || 0;
            const upgradeable = sizeKeys.filter(k => (kwMap[k] || 0) > currentKw);
            if (upgradeable.length === 0) return null;
            const fuInvKw = upgradeSize ? (parseFloat(upgradeSize) || 0) : 0;
            const fuIs3P = fuInvKw >= 6;
            return (
              <div className="rounded-lg p-3 no-print space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={futureUpgrade}
                      onChange={e => {
                        setFutureUpgrade(e.target.checked);
                        if (e.target.checked && !upgradeSize) setUpgradeSize(upgradeable[0]);
                        if (!e.target.checked) setUpgradeSize('');
                      }}
                      className="w-4 h-4 accent-amber-600 rounded" />
                    <span className="font-bold text-sm" style={{ color: 'var(--ink-1)' }}>Future Upgrade Ready</span>
                  </label>
                  {futureUpgrade && (
                    <>
                      <span className="text-xs text-gray-500">Panels: {sizeLabels[size]}</span>
                      <span className="text-xs text-gray-400">{'\u2192'}</span>
                      <span className="text-xs font-medium text-gray-600">Inverter sized for:</span>
                      <div className="flex gap-1">
                        {upgradeable.map(k => (
                          <button key={k} onClick={() => setUpgradeSize(k)}
                            className={`pill-btn ${upgradeSize === k ? 'active' : ''}`}>
                            {sizeLabels[k]}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Component Checkboxes */}
                {futureUpgrade && upgradeSize && (
                  <>
                    <div className="border-t pt-2" style={{ borderColor: 'var(--line)' }}>
                      <p className="text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Size for inverter kW (uncheck = panel kW only)</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { key: 'includeStructure', label: 'Structure', desc: 'Frame + hardware + painting' },
                          { key: 'includeDB', label: 'DCDB + ACDB', desc: 'Distribution boxes (2/2 when included)' },
                          { key: 'includeCables', label: 'Cables & Wiring', desc: 'DC/AC cables, conduit, earthing, LA' },
                          { key: 'includeMeter', label: 'Meter', desc: 'Energy meter + meter box' },
                        ].map(c => (
                          <label key={c.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition
                            ${fuOpts[c.key] ? 'bg-white shadow-sm' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 opacity-60'}`}
                            style={fuOpts[c.key] ? { border: '1px solid var(--accent)' } : undefined}>
                            <input type="checkbox" checked={fuOpts[c.key]}
                              onChange={e => setFuOpts(prev => ({ ...prev, [c.key]: e.target.checked }))}
                              className="w-3.5 h-3.5 accent-amber-600" />
                            <span className="font-bold text-gray-700">{c.label}</span>
                            <span className="text-gray-400 font-normal hidden sm:inline">{c.desc}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Phase auto-detect info */}
                    <div className={`text-xs px-3 py-2 rounded-lg font-medium ${fuIs3P ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-600'}`}>
                      {fuIs3P ? (
                        <span>{'\u26A1'} {sizeLabels[upgradeSize]} inverter is <b>Three Phase</b> {'\u2014'} meter, meter box, ACDB will be 3P. DCDB: 2/2 (upgrade ready)</span>
                      ) : (
                        <span>{sizeLabels[size]} panels installed now {'\u2014'} inverter sized for {sizeLabels[upgradeSize]} (Single Phase). DCDB: 2/2 (upgrade ready)</span>
                      )}
                      {(!fuOpts.includeStructure || !fuOpts.includeDB || !fuOpts.includeCables || !fuOpts.includeMeter) && (
                        <span className="ml-2 text-amber-600 font-bold">
                          {'\u00B7'} Panel kW sizing: {[
                            !fuOpts.includeStructure && 'Structure',
                            !fuOpts.includeDB && 'DB',
                            !fuOpts.includeCables && 'Cables',
                            !fuOpts.includeMeter && 'Meter'
                          ].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Premium Micro-Inverter Config */}
          {tier === 'premium' && (sysType === 'ongrid' || sysType === 'hybrid') && (
            <div className="rounded-lg p-3 no-print space-y-2" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-bold text-sm" style={{ color: 'var(--ink-1)' }}>
                  {isHyb ? 'Enphase Hybrid Micro-Inverter' : 'Micro-Inverter System'}
                </span>
                {!isHyb && (
                  <div className="flex gap-1">
                    <button onClick={() => setMicroBrand('enphase')}
                      className={`pill-btn ${microBrand === 'enphase' ? 'active' : ''}`}>
                      Enphase
                    </button>
                    <button onClick={() => setMicroBrand('hoymiles')}
                      className={`pill-btn ${microBrand === 'hoymiles' ? 'active' : ''}`}>
                      Hoymiles
                    </button>
                  </div>
                )}
                {!isHyb && microBrand === 'hoymiles' && (
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--ink-2)' }}>
                    <input type="checkbox" checked={zeroExport} onChange={e => setZeroExport(e.target.checked)}
                      className="rounded border-gray-300 accent-amber-600" />
                    <span className="font-medium">Zero Export (DTU Pro)</span>
                  </label>
                )}
                <span className="text-xs ml-auto" style={{ color: 'var(--accent)' }}>
                  {bom.lines.find(l => l.category === 'panel')?.qty || 0} panels — accessories auto-calculated
                  {futureUpgrade && upgradeSize && ` | Inverter: ${sizeLabels[upgradeSize]}${(!fuOpts.includeStructure || !fuOpts.includeDB || !fuOpts.includeCables || !fuOpts.includeMeter) ? ' (partial)' : ''}`}
                  {isHyb && ` | ${batConfig} batter${batConfig === '1' ? 'y' : 'ies'}`}
                </span>
              </div>
            </div>
          )}

          {/* Variable Items - Dropdowns (All users can select brand/model) */}
          <details className="no-print rounded-xl border overflow-hidden" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
            <summary className="p-4 cursor-pointer font-bold text-sm select-none flex items-center gap-2" style={{ color: 'var(--ink-1)' }}>
              <span>{'\u25B6'}</span> Brand & Model Selection
              <span className="text-xs font-medium ml-auto" style={{ color: 'var(--ink-3)' }}>Override defaults for each component</span>
            </summary>
            <div className="p-3 pt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {bom.lines.filter(l => l.isVariable).map(line => {
                return (
                  <div key={line.pos} className="bg-white p-2 rounded border border-gray-200">
                    <label className="text-xs font-bold text-gray-700">{line.label}</label>
                    <select
                      value={line.catalogItemId || ''}
                      onChange={e => handleSelection(line.pos, e.target.value, line.category)}
                      className="w-full mt-1 px-2 py-1.5 border border-amber-300 rounded text-xs bg-white focus:ring-1 focus:ring-amber-400 focus:outline-none">
                      {line.available.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name}{admin && item.price ? ` — ${fmt(item.price)}` : ''}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-xs text-gray-400">
                      {line.available.length} options {admin ? `for ${tier.toUpperCase()}` : ''}
                    </div>
                  </div>
                );
                })}
              </div>
            </details>

          {/* ===== Site Add-Ons (all users, above BOM) ===== */}
          <div className="rounded-lg p-3 no-print" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }}></div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--ink-1)' }}>Site Add-Ons</h3>
            </div>
            <div className="flex flex-wrap gap-3">
              {/* Extra Structure */}
              <div className={`flex-1 min-w-[280px] px-3 py-2 rounded-lg border text-xs ${addOns.structure.enabled ? 'bg-white' : 'border-gray-200 bg-gray-50'}`} style={addOns.structure.enabled ? { border: '1px solid var(--accent)' } : undefined}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={addOns.structure.enabled}
                    onChange={e => setAddOns(p => ({ ...p, structure: { ...p.structure, enabled: e.target.checked } }))}
                    className="w-3.5 h-3.5 accent-amber-600" />
                  <span className="font-bold text-gray-700">Extra Structure</span>
                  {addOns.structure.enabled && (
                    <select value={addOns.structure.type}
                      onChange={e => setAddOns(p => ({ ...p, structure: { ...p.structure, type: e.target.value } }))}
                      className="text-xs border rounded px-2 py-1 bg-white focus:outline-none" style={{ borderColor: 'var(--line)' }}>
                      <option value="elevated">Elevated</option>
                      <option value="sheet">Sheet Roof</option>
                    </select>
                  )}
                  {addOns.structure.enabled && (
                    <span className="font-semibold" style={{ color: 'var(--accent)' }}>{fmt(bom.structureAddOnTotal)}</span>
                  )}
                </div>
                {addOns.structure.enabled && (
                  <div className="mt-2 space-y-1 pl-6">
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Material Extra ({bom.structureExtraLabel}−Flat Roof)</span>
                      <span className="font-medium">{fmt(bom.structureExtraCost)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Labor Charge</span>
                      <span className="font-medium">{fmt(bom.structureLabor)}</span>
                    </div>
                    {bom.structureRepairAmt > 0 && (
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>Repair Margin ({catalog.costs?.structureRepairPct || 0}%)</span>
                        <span className="font-medium">{fmt(bom.structureRepairAmt)}</span>
                      </div>
                    )}
                    {/* Show major material lines (tubes) */}
                    <details className="mt-1">
                      <summary className="text-xs cursor-pointer font-medium" style={{ color: 'var(--accent)' }}>View Materials</summary>
                      <div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                        {(bom.structureExtraLines || []).map((sl, i) => (
                          <div key={i} className="flex justify-between text-[10px] text-gray-500">
                            <span>{sl.name} ×{sl.qty}{sl.isTube ? ` (${sl.weightKg}kg)` : ''}</span>
                            <span>{fmt(sl.cost)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>

              {/* Extra DC Cable */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${addOns.extraDcCable.enabled ? 'bg-white' : 'border-gray-200 bg-gray-50'}`} style={addOns.extraDcCable.enabled ? { border: '1px solid var(--accent)' } : undefined}>
                <input type="checkbox" checked={addOns.extraDcCable.enabled}
                  onChange={e => {
                    const items = catalog.categories.dc_cable?.items || [];
                    setAddOns(p => ({ ...p, extraDcCable: { ...p.extraDcCable, enabled: e.target.checked, itemId: p.extraDcCable.itemId || items[0]?.id || '' } }));
                  }}
                  className="w-3.5 h-3.5 accent-amber-600" />
                <span className="font-bold text-gray-700">DC Cable</span>
                {addOns.extraDcCable.enabled && (
                  <>
                    <select value={addOns.extraDcCable.itemId}
                      onChange={e => setAddOns(p => ({ ...p, extraDcCable: { ...p.extraDcCable, itemId: e.target.value } }))}
                      className="text-xs border rounded px-1 py-1 bg-white focus:outline-none max-w-[140px]" style={{ borderColor: 'var(--line)' }}>
                      {(catalog.categories.dc_cable?.items || []).map(it => (
                        <option key={it.id} value={it.id}>{it.name}</option>
                      ))}
                    </select>
                    <input type="number" min="0" value={addOns.extraDcCable.qty}
                      onChange={e => setAddOns(p => ({ ...p, extraDcCable: { ...p.extraDcCable, qty: Number(e.target.value) || 0 } }))}
                      className="w-16 text-center text-xs border rounded px-1 py-1 focus:outline-none" style={{ borderColor: 'var(--line)' }} />
                    <span className="text-gray-500">m</span>
                  </>
                )}
              </div>

              {/* Extra AC Cable */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${addOns.extraAcCable.enabled ? 'bg-white' : 'border-gray-200 bg-gray-50'}`} style={addOns.extraAcCable.enabled ? { border: '1px solid var(--accent)' } : undefined}>
                <input type="checkbox" checked={addOns.extraAcCable.enabled}
                  onChange={e => {
                    const items = catalog.categories.ac_cable?.items || [];
                    setAddOns(p => ({ ...p, extraAcCable: { ...p.extraAcCable, enabled: e.target.checked, itemId: p.extraAcCable.itemId || items[0]?.id || '' } }));
                  }}
                  className="w-3.5 h-3.5 accent-amber-600" />
                <span className="font-bold text-gray-700">AC Cable</span>
                {addOns.extraAcCable.enabled && (
                  <>
                    <select value={addOns.extraAcCable.itemId}
                      onChange={e => setAddOns(p => ({ ...p, extraAcCable: { ...p.extraAcCable, itemId: e.target.value } }))}
                      className="text-xs border rounded px-1 py-1 bg-white focus:outline-none max-w-[140px]" style={{ borderColor: 'var(--line)' }}>
                      {(catalog.categories.ac_cable?.items || []).map(it => (
                        <option key={it.id} value={it.id}>{it.name}</option>
                      ))}
                    </select>
                    <input type="number" min="0" value={addOns.extraAcCable.qty}
                      onChange={e => setAddOns(p => ({ ...p, extraAcCable: { ...p.extraAcCable, qty: Number(e.target.value) || 0 } }))}
                      className="w-16 text-center text-xs border rounded px-1 py-1 focus:outline-none" style={{ borderColor: 'var(--line)' }} />
                    <span className="text-gray-500">m</span>
                  </>
                )}
              </div>

              {/* Armoured / UG Cable */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${addOns.armouredCable.enabled ? 'bg-white' : 'border-gray-200 bg-gray-50'}`} style={addOns.armouredCable.enabled ? { border: '1px solid var(--accent)' } : undefined}>
                <input type="checkbox" checked={addOns.armouredCable.enabled}
                  onChange={e => {
                    const items = catalog.categories.armoured_cable?.items || [];
                    setAddOns(p => ({ ...p, armouredCable: { ...p.armouredCable, enabled: e.target.checked, itemId: p.armouredCable.itemId || items[0]?.id || '' } }));
                  }}
                  className="w-3.5 h-3.5 accent-amber-600" />
                <span className="font-bold text-gray-700">UG Cable</span>
                {addOns.armouredCable.enabled && (
                  <>
                    <select value={addOns.armouredCable.itemId}
                      onChange={e => setAddOns(p => ({ ...p, armouredCable: { ...p.armouredCable, itemId: e.target.value } }))}
                      className="text-xs border rounded px-1 py-1 bg-white focus:outline-none max-w-[160px]" style={{ borderColor: 'var(--line)' }}>
                      {(catalog.categories.armoured_cable?.items || []).map(it => (
                        <option key={it.id} value={it.id}>{it.name}</option>
                      ))}
                    </select>
                    <input type="number" min="0" value={addOns.armouredCable.qty}
                      onChange={e => setAddOns(p => ({ ...p, armouredCable: { ...p.armouredCable, qty: Number(e.target.value) || 0 } }))}
                      className="w-16 text-center text-xs border rounded px-1 py-1 focus:outline-none" style={{ borderColor: 'var(--line)' }} />
                    <span className="text-gray-500">m</span>
                  </>
                )}
              </div>

              {/* Transportation Distance */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-xs" style={{ border: '1px solid var(--line)' }}>
                <span className="font-bold text-gray-700">🚛 Distance</span>
                <input type="number" min="0" value={distKm}
                  onChange={e => setDistKm(Number(e.target.value) || 0)}
                  className="w-16 text-center text-xs border rounded px-1 py-1 focus:outline-none" style={{ borderColor: 'var(--line)' }} />
                <span className="text-gray-500">km</span>
                {distKm > 100 && (
                  <span className="font-semibold" style={{ color: 'var(--accent)' }}>+{distKm - 100}km extra = {fmt((distKm - 100) * 35)}</span>
                )}
                {distKm <= 100 && (
                  <span className="text-green-700 font-medium">First 100km included</span>
                )}
              </div>
            </div>
          </div>

          {/* ============ BOM / SPECIFICATION DISPLAY ============ */}
          {/* ARCHITECTURE: Two completely separate renderers reading same BOM data */}
          {/* Admin/Dispatch: Full Engineering BOM (61+ items, prices, quantities) */}
          {/* Non-Admin (Sales/Customer): 14-row Specification Table only */}

          {admin ? (
          <>
          {/* ADMIN: Full Engineering BOM */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-bold text-base" style={{ color: 'var(--ink-1)' }}>{t('billOfMaterials')}</h3>
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{bom.lines.length} {t('items')} {'·'} {bom.lines.find(l => l.category === 'panel')?.qty || 0} {t('panels')} {'·'} {bomKwDisplay} kW {t('infrastructure')}</p>
              </div>
              {isQ && <span className="text-xs font-bold px-2 py-1 rounded" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>Quotation Mode</span>}
            </div>
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--line)' }}>
            <table className="bom-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>{t('material')}</th>
                  <th style={{ textAlign: 'center', width: 56 }}>{t('qty')}</th>
                  <th style={{ width: 44 }}>{t('unit')}</th>
                  {isQ && <th style={{ textAlign: 'right', width: 80 }}>{t('unitPrice')}</th>}
                  {isQ && <th style={{ textAlign: 'right', width: 90 }}>{t('amount')}</th>}
                  {isQ && <th style={{ textAlign: 'center', width: 50 }}>{t('gstPercent')}</th>}
                </tr>
              </thead>
              <tbody>
                {bom.lines.map((item, i) => {
                  const bg = item.isEnphase ? 'bg-purple-50' : item.isVariable ? 'bg-amber-50' : (i % 2 === 0 ? 'bg-white' : 'bg-gray-50');
                  const qKey = item.enphaseQtyKey
                    ? item.enphaseQtyKey
                    : item.isVariable
                      ? `${sysType}_${size}_${tier}_${batConfig}_${item.pos}`
                      : `fixed_${sysType}_${size}_${batConfig}_${item.pos}`;
                  return (
                    <tr key={`${item.pos}_${i}`} className={`${bg} border-b border-gray-100 hover:bg-blue-50 transition`}>
                      <td className="px-2 py-1.5 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        {item.isVariable ? (
                          <select value={item.catalogItemId || ''} onChange={e => handleSelection(item.pos, e.target.value, item.category)}
                            className={`w-full text-xs border rounded px-1 py-1 focus:ring-1 focus:outline-none ${
                              item.catalogItemId && item.available?.length > 0 && !item.available.find(a => a.id === item.catalogItemId)
                                ? 'border-orange-400 bg-orange-50 focus:ring-orange-400'
                                : 'border-amber-200 bg-amber-50 focus:ring-amber-400'
                            }`}>
                            {item.available.map(a => (
                              <option key={a.id} value={a.id}>{a.name}{a.price ? ` (${fmt(a.price)})` : ''}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-800 text-xs font-medium">{item.name}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input type="number" min="0" step="any" value={item.qty}
                          onChange={e => handleQtyChange(qKey, e.target.value)}
                          className="w-14 text-center text-xs border border-gray-300 rounded px-1 py-1 focus:ring-1 focus:ring-indigo-400 focus:outline-none bg-white" />
                      </td>
                      <td className="px-2 py-1.5 text-gray-400 text-xs">nos</td>
                      {isQ && (
                        <td className="px-2 py-1.5 text-right">
                          <input type="number" min="0" step="any"
                            value={item.unitPrice}
                            onChange={e => {
                              const val = Number(e.target.value) || 0;
                              const pKey = `${sysType}_${tier}_${item.isVariable ? (item.category === 'panel' ? size : bom.bomSize) : bom.bomSize}_${item.pos}`;
                              setPriceOverrides(prev => ({ ...prev, [pKey]: val }));
                            }}
                            className="w-20 text-right text-xs border border-gray-300 rounded px-1 py-1 focus:ring-1 focus:ring-indigo-400 focus:outline-none bg-white" />
                        </td>
                      )}
                      {isQ && <td className="px-2 py-1.5 text-right text-xs font-semibold text-gray-800">{fmt(item.amount)}</td>}
                      {isQ && (
                        <td className="px-2 py-1.5 text-center">
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">9%</span>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {/* Custom items (admin only) */}
                {customItems.map((ci, i) => {
                  const amt = ci.qty * ci.price;
                  const gAmt = Math.round(amt * ci.gst / 100);
                  return (
                    <tr key={`ci_${ci.id}`} className="bg-purple-50 border-b border-gray-100">
                      <td className="px-2 py-1.5 text-purple-400 text-xs">{bom.lines.length + i + 1}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <input type="text" value={ci.name} onChange={e => updateCustom(ci.id, 'name', e.target.value)}
                            className="flex-1 text-xs border border-purple-300 rounded px-1 py-1 bg-purple-50 focus:outline-none" />
                          <button onClick={() => removeCustom(ci.id)} className="text-red-400 hover:text-red-600 text-xs font-bold">X</button>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input type="number" min="0" value={ci.qty} onChange={e => updateCustom(ci.id, 'qty', e.target.value)}
                          className="w-14 text-center text-xs border border-gray-300 rounded px-1 py-1 focus:outline-none" />
                      </td>
                      <td className="px-2 py-1.5 text-gray-400 text-xs">nos</td>
                      {isQ && <td className="px-2 py-1.5 text-right">
                        <input type="number" min="0" value={ci.price} onChange={e => updateCustom(ci.id, 'price', e.target.value)}
                          className="w-20 text-right text-xs border border-blue-300 rounded px-1 py-1 bg-blue-50 focus:outline-none" />
                      </td>}
                      {isQ && <td className="px-2 py-1.5 text-right text-xs font-semibold text-gray-800">{fmt(amt)}</td>}
                      {isQ && <td className="px-2 py-1.5 text-center">
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">9%</span>
                      </td>}
                    </tr>
                  );
                })}
              </tbody>
              {isQ && (
                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={4} className="px-2 py-2 font-bold text-gray-700 text-sm">{t('materialTotal')}</td>
                    <td className="px-2 py-2"></td>
                    <td className="px-2 py-2 text-right font-bold text-indigo-700 text-sm">{fmt(bom.totals.matTotal)}</td>
                    <td></td>
                  </tr>
                  <tr className="bg-green-50">
                    <td colSpan={5} className="px-2 py-1.5 text-xs font-semibold text-green-800">{t('gst9')}</td>
                    <td className="px-2 py-1.5 text-right text-xs font-bold text-green-700">{fmt(bom.totals.totalGst)}</td>
                    <td></td>
                  </tr>
                  <tr className="bg-gray-200">
                    <td colSpan={4} className="px-2 py-2 font-bold text-gray-800 text-sm">{t('materialTotalGst')}</td>
                    <td className="px-2 py-2"></td>
                    <td className="px-2 py-2 text-right font-bold text-indigo-800 text-sm">{fmt(bom.totals.matWithGst)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          </div>

          {/* Admin Action buttons */}
          <div className="flex gap-3 text-xs flex-wrap no-print">
            <button onClick={() => setQtyOverrides({})} className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium">{t('resetQuantities')}</button>
            <button onClick={addCustom} className="text-purple-600 hover:text-purple-800 hover:underline font-medium">{t('addCustomItem')}</button>
            {customItems.length > 0 && <button onClick={() => setCustomItems([])} className="text-purple-600 hover:text-purple-800 hover:underline font-medium">{t('clearCustomItems')}</button>}
          </div>
          </>
          ) : (
          <>
          {/* NON-ADMIN: Customer Specification Table — 14 rows only */}
          {/* Completely separate renderer. Does NOT loop through engineering BOM. */}
          {/* Reads dynamically from same BOM data via buildSpecTable() */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-bold text-base" style={{ color: 'var(--ink-1)' }}>System Specification</h3>
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{parseFloat(size) || 3}kW Solar Power Plant — Product Specifications</p>
              </div>
            </div>
            {(() => {
              const tiers = ['base', 'value', 'premium'];
              const tierLabels = { base: 'Base', value: 'Value', premium: 'Premium' };
              const tierColors = { base: '#EA580C', value: '#059669', premium: '#7C3AED' };
              const specTables = {};
              for (const tp of tiers) {
                const tierBom = allTierBoms[tp];
                specTables[tp] = tierBom?.lines ? buildSpecTable(tierBom.lines, sysType, batConfig, tierBom.customerGradeLabel || tierBom.defaultGradeLabel || 'GI') : [];
              }
              const specLabels = specTables.base.length > 0 ? specTables.base.map(r => r.label)
                : specTables.value.length > 0 ? specTables.value.map(r => r.label) : [];

              return (
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--line)' }}>
                  <table className="bom-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }}>#</th>
                        <th>Particulars</th>
                        {tiers.map(tp => (
                          <th key={tp} className="text-center text-white" style={{ background: tierColors[tp], minWidth: 100 }}>
                            {tierLabels[tp]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {specLabels.map((label, i) => (
                        <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-100`}>
                          <td className="px-2 py-1.5 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-2 py-1.5 text-gray-800 text-xs font-semibold">{label}</td>
                          {tiers.map(tp => {
                            const row = specTables[tp]?.[i];
                            return (
                              <td key={tp} className="px-2 py-1.5 text-center text-xs text-gray-700">
                                <div className="font-medium">{row?.value || '-'}</div>
                                {row?.detail && row.detail !== '-' && row.detail !== '' && (
                                  <div className="text-[9px] text-gray-400">{row.detail}</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {/* Services Included */}
                      <tr className="bg-amber-50 border-b border-amber-200">
                        <td colSpan={2} className="px-2 py-1.5 font-bold text-amber-800 text-xs uppercase tracking-wide">Services Included</td>
                        {tiers.map(tp => (
                          <td key={tp} className="px-2 py-1.5 text-center text-amber-700 text-[10px] font-semibold">Included</td>
                        ))}
                      </tr>
                      {['Installation & Commissioning', 'Net Metering Assistance', 'Testing & Commissioning', 'Documentation & Handover'].map((svc, i) => (
                        <tr key={`svc-${i}`} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-100`}>
                          <td className="px-2 py-1 text-gray-400 text-xs">{specLabels.length + i + 1}</td>
                          <td className="px-2 py-1 text-gray-700 text-xs font-medium">{svc}</td>
                          {tiers.map(tp => (
                            <td key={tp} className="px-2 py-1 text-center text-green-600 text-[10px]">{'✓'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
          </>
          )}

          {/* ===== STRING CONFIGURATION & SOLAR DESIGN ===== */}
          {stringConfig && !stringConfig.isMicro && !stringConfig.isOptimizer && (
            <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: '#2563eb', background: '#eff6ff' }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <h3 className="font-bold text-sm" style={{ color: '#1e40af' }}>String Configuration — Solar Design Engine</h3>
                {stringConfig.isValid ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">VALID</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">ISSUES</span>
                )}
              </div>

              {/* Panel & Inverter Summary */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white rounded-lg p-3 border border-blue-200">
                  <p className="font-bold text-gray-700 mb-1">Panel: {stringConfig.panel?.name}</p>
                  <div className="grid grid-cols-2 gap-1 text-gray-600">
                    <span>Voc: {stringConfig.panel?.voc}V</span>
                    <span>Vmp: {stringConfig.panel?.vmp}V</span>
                    <span>Isc: {stringConfig.panel?.isc}A</span>
                    <span>Imp: {stringConfig.panel?.imp}A</span>
                    <span className="col-span-2">Temp Coeff Voc: {stringConfig.panel?.tempCoeffVoc}%/°C</span>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-200">
                  <p className="font-bold text-gray-700 mb-1">Inverter: {stringConfig.inverter?.name}</p>
                  <div className="grid grid-cols-2 gap-1 text-gray-600">
                    <span>MPPTs: {stringConfig.mpptCount}</span>
                    <span>Strings/MPPT: {stringConfig.inverter?.maxStringsPerMppt}</span>
                    <span>MPPT Range: {stringConfig.inverter?.mpptVoltageMin}-{stringConfig.inverter?.mpptVoltageMax}V</span>
                    <span>Max Vin: {stringConfig.inverter?.maxInputVoltage}V</span>
                    <span>Max Iin: {stringConfig.inverter?.maxInputCurrent}A/MPPT</span>
                    <span>Total Capacity: {stringConfig.maxTotalStrings} strings</span>
                  </div>
                </div>
              </div>

              {/* String Configuration Result */}
              <div className="bg-white rounded-lg p-3 border border-blue-300">
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-xs text-gray-500">Panels/String</p>
                    <p className="text-xl font-bold" style={{ color: '#1e40af' }}>{stringConfig.panelsPerString}</p>
                    <p className="text-[10px] text-gray-400">range: {stringConfig.minPanelsPerString}-{stringConfig.maxPanelsPerString}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Strings</p>
                    <p className="text-xl font-bold" style={{ color: '#1e40af' }}>{stringConfig.totalStrings}</p>
                    <p className="text-[10px] text-gray-400">max: {stringConfig.maxTotalStrings}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">String Voc (15°C)</p>
                    <p className="text-xl font-bold text-orange-600">{stringConfig.stringVocCold}V</p>
                    <p className="text-[10px] text-gray-400">max: {stringConfig.inverter?.maxInputVoltage}V</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">String Vmp (70°C)</p>
                    <p className="text-xl font-bold text-green-600">{stringConfig.stringVmpHot}V</p>
                    <p className="text-[10px] text-gray-400">min: {stringConfig.inverter?.mpptVoltageMin}V</p>
                  </div>
                </div>
              </div>

              {/* MPPT Allocation */}
              {stringConfig.mpptConfig?.length > 0 && (
                <div className="bg-white rounded-lg p-3 border border-blue-200">
                  <p className="text-xs font-bold text-gray-700 mb-2">MPPT Allocation</p>
                  <div className="space-y-1">
                    {stringConfig.mpptConfig.map(m => (
                      <div key={m.mppt} className="flex items-center gap-2 text-xs">
                        <span className="w-16 font-bold text-blue-700">MPPT {m.mppt}</span>
                        <span className="text-gray-600">{m.strings} string{m.strings > 1 ? 's' : ''} × {m.panelsPerString} panels = {m.totalPanels} panels</span>
                        <span className="text-gray-400">({(m.panelsPerString * parseFloat(stringConfig.vmpStc)).toFixed(0)}V STC)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DC Cable Recommendation */}
              <div className="flex items-center gap-2 text-xs bg-white rounded-lg px-3 py-2 border border-blue-200">
                <span className="font-bold text-gray-700">DC Cable Recommended:</span>
                <span className="font-bold text-blue-700">{stringConfig.dcCableRecommended}m</span>
                <span className="text-gray-400">(Kerala 2-floor home standard)</span>
              </div>

              {/* Warnings */}
              {stringConfig.warnings.length > 0 && (
                <div className="space-y-1">
                  {stringConfig.warnings.map((w, i) => (
                    <div key={i} className={`text-xs px-3 py-2 rounded-lg font-medium ${
                      w.type === 'critical' ? 'bg-red-100 text-red-800 border border-red-300' :
                      w.type === 'warning' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                      'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {w.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Micro-inverter info */}
          {stringConfig?.isMicro && (
            <div className="rounded-xl border p-3 text-xs" style={{ borderColor: '#a855f7', background: '#faf5ff' }}>
              <div className="flex items-center gap-2">
                <span>⚡</span>
                <span className="font-bold text-purple-700">{stringConfig.message}</span>
              </div>
              <p className="text-purple-600 mt-1">DC Cable Recommended: {stringConfig.dcCableRecommended}m ({stringConfig.totalPanels} panels × 2m each)</p>
            </div>
          )}

          {/* Optimizer-based info */}
          {stringConfig?.isOptimizer && (
            <div className="rounded-xl border p-3 text-xs" style={{ borderColor: '#06b6d4', background: '#ecfeff' }}>
              <div className="flex items-center gap-2">
                <span>⚡</span>
                <span className="font-bold text-cyan-700">{stringConfig.message}</span>
              </div>
              <p className="text-cyan-600 mt-1">DC Cable Recommended: {stringConfig.dcCableRecommended}m</p>
            </div>
          )}

          {/* ===== ADMIN: Cost Settings (Installation Matrix, Transport, Office) ===== */}
          {admin && (
            <details className="admin-section no-print">
              <summary className="p-3 cursor-pointer font-semibold text-sm select-none">
                Cost Settings (Installation Matrix / Transport / Office Expense)
              </summary>
              <div className="p-3 pt-1 space-y-4">
                {/* Installation Cost Matrix */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2">Installation Cost Matrix (Size x Roof Type)</h4>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-blue-100">
                        <th className="px-2 py-1.5 text-left font-bold text-blue-700">Size</th>
                        <th className="px-2 py-1.5 text-right font-bold text-blue-700">Flat Roof</th>
                        <th className="px-2 py-1.5 text-right font-bold text-blue-700">Sheet Roof</th>
                        <th className="px-2 py-1.5 text-right font-bold text-blue-700">Elevated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {['3', '5sp', '5tp', '6', '8', '10'].map(sz => {
                        const matrix = catalog.installationMatrix || {};
                        const row = matrix[sz] || {};
                        return (
                          <tr key={sz} className="border-b border-blue-100">
                            <td className="px-2 py-1.5 font-semibold text-gray-700">{sz === '5sp' ? '5kW(1P)' : sz === '5tp' ? '5kW(3P)' : sz + 'kW'}</td>
                            {['flat', 'sheet', 'elevated'].map(rt => (
                              <td key={rt} className="px-2 py-1">
                                <input type="number" min="0"
                                  defaultValue={row[rt] || 0}
                                  onBlur={async (e) => {
                                    const val = Number(e.target.value) || 0;
                                    await fetch(`${API}/admin/installation-matrix`, {
                                      method: 'PUT', headers: authHeaders,
                                      body: JSON.stringify({ [sz]: { [rt]: val } })
                                    });
                                    refreshCatalog();
                                  }}
                                  className="w-full text-right text-xs border border-blue-200 rounded px-2 py-1 focus:ring-1 focus:ring-blue-400 focus:outline-none" />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Transport Config */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <h4 className="text-xs font-bold text-green-800 uppercase tracking-wide mb-2">Transportation Config</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-green-700 font-semibold">Base Distance Included (km)</label>
                      <input type="number" min="0"
                        defaultValue={catalog.transportConfig?.baseDistanceKm || 100}
                        onBlur={async (e) => {
                          await fetch(`${API}/admin/transport-config`, {
                            method: 'PUT', headers: authHeaders,
                            body: JSON.stringify({ baseDistanceKm: Number(e.target.value) || 0 })
                          });
                          refreshCatalog();
                        }}
                        className="w-full text-xs border border-green-200 rounded px-2 py-1.5 mt-0.5 focus:ring-1 focus:ring-green-400 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-green-700 font-semibold">Cost Per KM (beyond base)</label>
                      <input type="number" min="0"
                        defaultValue={catalog.transportConfig?.costPerKm || 35}
                        onBlur={async (e) => {
                          await fetch(`${API}/admin/transport-config`, {
                            method: 'PUT', headers: authHeaders,
                            body: JSON.stringify({ costPerKm: Number(e.target.value) || 0 })
                          });
                          refreshCatalog();
                        }}
                        className="w-full text-xs border border-green-200 rounded px-2 py-1.5 mt-0.5 focus:ring-1 focus:ring-green-400 focus:outline-none" />
                    </div>
                  </div>
                </div>

                {/* Office Expense Config */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <h4 className="text-xs font-bold text-purple-800 uppercase tracking-wide mb-2">Office Expense</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-purple-700 font-semibold">Monthly Office Expense</label>
                      <input type="number" min="0"
                        defaultValue={catalog.officeExpense?.monthlyExpense || 0}
                        onBlur={async (e) => {
                          await fetch(`${API}/admin/office-expense`, {
                            method: 'PUT', headers: authHeaders,
                            body: JSON.stringify({ monthlyExpense: Number(e.target.value) || 0 })
                          });
                          refreshCatalog();
                        }}
                        className="w-full text-xs border border-purple-200 rounded px-2 py-1.5 mt-0.5 focus:ring-1 focus:ring-purple-400 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-purple-700 font-semibold">Expected Projects / Month</label>
                      <input type="number" min="1"
                        defaultValue={catalog.officeExpense?.expectedProjectsPerMonth || 10}
                        onBlur={async (e) => {
                          await fetch(`${API}/admin/office-expense`, {
                            method: 'PUT', headers: authHeaders,
                            body: JSON.stringify({ expectedProjectsPerMonth: Number(e.target.value) || 1 })
                          });
                          refreshCatalog();
                        }}
                        className="w-full text-xs border border-purple-200 rounded px-2 py-1.5 mt-0.5 focus:ring-1 focus:ring-purple-400 focus:outline-none" />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-purple-600 font-semibold">
                    Cost/Project = {fmt(Math.round((catalog.officeExpense?.monthlyExpense || 0) / (catalog.officeExpense?.expectedProjectsPerMonth || 1)))}
                  </div>
                </div>
              </div>
            </details>
          )}

          {/* ===== ADMIN: Product Catalog Management ===== */}
          {admin && (
            <details className="admin-section no-print" open>
              <summary className="p-3 cursor-pointer font-semibold text-sm select-none">
                Product & Price Catalog (Add / Remove / Update)
              </summary>
              <div className="p-3 pt-1 space-y-3">
                {/* Category tabs */}
                <div className="flex flex-wrap gap-1">
                  {CAT_ORDER.filter(c => catalog.categories[c]).map(cat => (
                    <button key={cat} onClick={() => setCatTab(cat)}
                      className={`px-3 py-1.5 rounded text-xs font-bold transition ${catTab === cat ? 'bg-red-600 text-white shadow' : 'bg-white text-gray-600 hover:bg-red-100 border border-gray-300'}`}>
                      {catalog.categories[cat].label} ({catalog.categories[cat].items.length})
                    </button>
                  ))}
                </div>

                {/* Category items table */}
                {catalog.categories[catTab] && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-red-800">
                        {catalog.categories[catTab].label} - {catalog.categories[catTab].items.length} items
                      </span>
                      <button onClick={() => {
                        const cat = catalog.categories[catTab];
                        const newItem = { name: `New ${catalog.categories[catTab].label}`, brand: '', tiers: ['value'], price: 0 };
                        if (catTab === 'panel') Object.assign(newItem, { watt: 550, perWatt: 0, dcr: true, panelType: 'DCR', status: 'active' });
                        if (catTab === 'inverter') Object.assign(newItem, { phase: '1P', kw: 3, model: '', type: 'ongrid' });
                        if (['dc_cable', 'ac_cable', 'earth_cable', 'la_cable'].includes(catTab)) newItem.sqmm = 4;
                        addCatalogItem(catTab, newItem);
                      }} className="px-3 py-1 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700">
                        + Add {catalog.categories[catTab].label}
                      </button>
                    </div>

                    <div className="overflow-x-auto border border-gray-200 rounded max-h-96 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-red-700 text-white sticky top-0">
                          <tr>
                            <th className="px-2 py-1.5 text-left w-8">#</th>
                            <th className="px-2 py-1.5 text-left">Name</th>
                            <th className="px-2 py-1.5 text-left">Brand</th>
                            <th className="px-2 py-1.5 text-center">Tiers</th>
                            {catTab === 'panel' && <th className="px-2 py-1.5 text-center">Watt</th>}
                            {catTab === 'panel' && <th className="px-2 py-1.5 text-right">/W</th>}
                            {catTab === 'panel' && <th className="px-2 py-1.5 text-center">Type</th>}
                            {catTab === 'panel' && <th className="px-2 py-1.5 text-center">Status</th>}
                            {catTab === 'inverter' && <th className="px-2 py-1.5 text-center">Phase</th>}
                            {catTab === 'inverter' && <th className="px-2 py-1.5 text-center">kW</th>}
                            {catTab === 'inverter' && <th className="px-2 py-1.5 text-center">Type</th>}
                            {['dc_cable', 'ac_cable', 'earth_cable', 'la_cable', 'armoured_cable'].includes(catTab) && <th className="px-2 py-1.5 text-center">Sqmm</th>}
                            <th className="px-2 py-1.5 text-right w-24">Price</th>
                            <th className="px-1 py-1.5 w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {catalog.categories[catTab].items.map((item, i) => (
                            <tr key={item.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-100`}>
                              <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                              <td className="px-1 py-1">
                                <input type="text" defaultValue={item.name}
                                  onBlur={e => { if (e.target.value !== item.name) updateCatalogItem(catTab, item.id, { name: e.target.value }); }}
                                  className="w-full px-1 py-0.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-red-300" />
                              </td>
                              <td className="px-1 py-1">
                                <input type="text" defaultValue={item.brand || ''}
                                  onBlur={e => { if (e.target.value !== (item.brand || '')) updateCatalogItem(catTab, item.id, { brand: e.target.value }); }}
                                  className="w-20 px-1 py-0.5 border border-gray-200 rounded text-xs focus:outline-none" />
                              </td>
                              <td className="px-1 py-1 text-center">
                                <div className="flex flex-wrap gap-0.5 justify-center">
                                  {['base', 'value', 'premium'].map(t => (
                                    <button key={t}
                                      onClick={() => {
                                        const newTiers = item.tiers.includes(t)
                                          ? item.tiers.filter(x => x !== t)
                                          : [...item.tiers, t];
                                        if (newTiers.length > 0) updateCatalogItem(catTab, item.id, { tiers: newTiers });
                                      }}
                                      className={`px-1 py-0.5 rounded text-[10px] font-bold ${item.tiers.includes(t) ? (t === 'base' ? 'bg-orange-500 text-white' : t === 'value' ? 'bg-emerald-600 text-white' : 'bg-purple-600 text-white') : 'bg-gray-200 text-gray-400'}`}>
                                      {t[0].toUpperCase()}
                                    </button>
                                  ))}
                                </div>
                              </td>
                              {catTab === 'panel' && (
                                <td className="px-1 py-1">
                                  <input type="number" defaultValue={item.watt || 550}
                                    onBlur={e => { const w = Number(e.target.value); updateCatalogItem(catTab, item.id, { watt: w, price: Math.round(w * (item.perWatt || 0)) }); }}
                                    className="w-14 text-center px-1 py-0.5 border border-gray-200 rounded text-xs" />
                                </td>
                              )}
                              {catTab === 'panel' && (
                                <td className="px-1 py-1">
                                  <input type="number" step="0.1" defaultValue={item.perWatt || 0}
                                    onBlur={e => {
                                      const pw = Number(e.target.value);
                                      updateCatalogItem(catTab, item.id, { perWatt: pw, price: Math.round((item.watt || 550) * pw) });
                                    }}
                                    className="w-14 text-right px-1 py-0.5 border border-blue-200 rounded text-xs bg-blue-50" />
                                </td>
                              )}
                              {catTab === 'panel' && (
                                <td className="px-1 py-1 text-center">
                                  <select defaultValue={item.panelType || (item.dcr ? 'DCR' : 'NON_DCR')}
                                    onChange={e => updateCatalogItem(catTab, item.id, { panelType: e.target.value, dcr: e.target.value === 'DCR' })}
                                    className="text-xs border border-gray-200 rounded px-1 py-0.5">
                                    <option value="DCR">DCR</option>
                                    <option value="NON_DCR">NON_DCR</option>
                                  </select>
                                </td>
                              )}
                              {catTab === 'panel' && (
                                <td className="px-1 py-1 text-center">
                                  <select defaultValue={item.status || 'active'}
                                    onChange={e => updateCatalogItem(catTab, item.id, { status: e.target.value })}
                                    className={`text-xs border rounded px-1 py-0.5 ${(item.status || 'active') === 'active' ? 'border-green-300 bg-green-50 text-green-700' : 'border-red-300 bg-red-50 text-red-700'}`}>
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                  </select>
                                </td>
                              )}
                              {catTab === 'inverter' && (
                                <td className="px-1 py-1 text-center">
                                  <select defaultValue={item.phase || '1P'}
                                    onChange={e => updateCatalogItem(catTab, item.id, { phase: e.target.value })}
                                    className="text-xs border border-gray-200 rounded px-1 py-0.5">
                                    <option value="1P">1P</option>
                                    <option value="3P">3P</option>
                                  </select>
                                </td>
                              )}
                              {catTab === 'inverter' && (
                                <td className="px-1 py-1">
                                  <input type="number" step="0.1" defaultValue={item.kw || 0}
                                    onBlur={e => updateCatalogItem(catTab, item.id, { kw: Number(e.target.value) })}
                                    className="w-12 text-center px-1 py-0.5 border border-gray-200 rounded text-xs" />
                                </td>
                              )}
                              {catTab === 'inverter' && (
                                <td className="px-1 py-1 text-center">
                                  <select defaultValue={item.type || 'ongrid'}
                                    onChange={e => updateCatalogItem(catTab, item.id, { type: e.target.value })}
                                    className="text-xs border border-gray-200 rounded px-1 py-0.5">
                                    <option value="ongrid">On-Grid</option>
                                    <option value="hybrid">Hybrid</option>
                                    <option value="micro">Micro</option>
                                  </select>
                                </td>
                              )}
                              {['dc_cable', 'ac_cable', 'earth_cable', 'la_cable', 'armoured_cable'].includes(catTab) && (
                                <td className="px-1 py-1">
                                  <input type="number" step="0.1" defaultValue={item.sqmm || 0}
                                    onBlur={e => updateCatalogItem(catTab, item.id, { sqmm: Number(e.target.value) })}
                                    className="w-14 text-center px-1 py-0.5 border border-gray-200 rounded text-xs" />
                                </td>
                              )}
                              <td className="px-1 py-1">
                                {catTab === 'panel' ? (
                                  <span className="inline-block w-24 text-right px-1 py-0.5 text-xs font-semibold text-gray-700">{fmt(Math.round((item.watt || 0) * (item.perWatt || 0)))}</span>
                                ) : (
                                  <input type="number" defaultValue={item.price}
                                    onBlur={e => updateCatalogItem(catTab, item.id, { price: Number(e.target.value) })}
                                    className="w-24 text-right px-1 py-0.5 border border-blue-200 rounded text-xs bg-blue-50 focus:outline-none" />
                                )}
                              </td>
                              <td className="px-1 py-1 text-center">
                                <button onClick={() => deleteCatalogItem(catTab, item.id)}
                                  className="text-red-400 hover:text-red-600 font-bold" title="Remove">X</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {saving && <div className="text-xs text-orange-600 font-medium mt-1">Saving...</div>}
                  </div>
                )}
              </div>
            </details>
          )}

          {/* ===== ADMIN: Structure Templates & Rates ===== */}
          {admin && (
            <details className="admin-section no-print">
              <summary className="p-3 cursor-pointer font-semibold text-sm select-none">
                Structure Templates & Tube Rates (GI/GP)
              </summary>
              <div className="p-3 pt-1 space-y-3">
                {/* GI / GP Rates + Grade Pricing Mode */}
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="bg-white p-2.5 rounded-lg border border-orange-300">
                    <label className="text-xs font-bold text-orange-800">GP Rate (Base Tier)</label>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-gray-400">₹</span>
                      <input type="number" min="0" step="0.1"
                        defaultValue={catalog.costs?.gpRatePerKg || 85}
                        onBlur={async e => {
                          const v = Number(e.target.value) || 0;
                          await fetch(`${API}/admin/costs`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ gpRatePerKg: v }) });
                          refreshCatalog();
                        }}
                        className="w-24 text-right text-sm font-bold border border-orange-300 rounded px-2 py-1.5 focus:outline-none" />
                      <span className="text-xs text-gray-500">/kg</span>
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-orange-300">
                    <label className="text-xs font-bold text-orange-800">GI Rate (Value/Premium)</label>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-gray-400">₹</span>
                      <input type="number" min="0" step="0.1"
                        defaultValue={catalog.costs?.giRatePerKg || 98.3}
                        onBlur={async e => {
                          const v = Number(e.target.value) || 0;
                          await fetch(`${API}/admin/costs`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ giRatePerKg: v }) });
                          refreshCatalog();
                        }}
                        className="w-24 text-right text-sm font-bold border border-orange-300 rounded px-2 py-1.5 focus:outline-none" />
                      <span className="text-xs text-gray-500">/kg</span>
                    </div>
                  </div>
                  <div className={`bg-white p-2.5 rounded-lg border ${structGradeMode === 'flat' ? 'border-orange-400 ring-1 ring-orange-300' : 'border-gray-200'}`}>
                    <label className="text-xs font-bold text-orange-800">Flat Grade Premium</label>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-gray-400">₹</span>
                      <input type="number" min="0" step="100"
                        defaultValue={catalog.costs?.structGradeFlatPerKw || 0}
                        disabled={structGradeMode !== 'flat'}
                        onBlur={async e => {
                          const v = Number(e.target.value) || 0;
                          await fetch(`${API}/admin/costs`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ structGradeFlatPerKw: v }) });
                          refreshCatalog();
                        }}
                        className="w-24 text-right text-sm font-bold border border-orange-300 rounded px-2 py-1.5 focus:outline-none disabled:bg-gray-100 disabled:opacity-50" />
                      <span className="text-xs text-gray-500">/kW</span>
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-orange-300">
                    <label className="text-xs font-bold text-orange-800">Structure Labor</label>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-gray-400">₹</span>
                      <input type="number" min="0"
                        defaultValue={catalog.costs?.structureLabor || 0}
                        onBlur={async e => {
                          const v = Number(e.target.value) || 0;
                          await fetch(`${API}/admin/costs`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ structureLabor: v }) });
                          refreshCatalog();
                        }}
                        className="w-24 text-right text-sm font-bold border border-orange-300 rounded px-2 py-1.5 focus:outline-none" />
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-orange-300">
                    <label className="text-xs font-bold text-orange-800">Repair Margin</label>
                    <div className="flex items-center gap-1 mt-1">
                      <input type="number" min="0" step="1"
                        defaultValue={catalog.costs?.structureRepairPct || 0}
                        onBlur={async e => {
                          const v = Number(e.target.value) || 0;
                          await fetch(`${API}/admin/costs`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ structureRepairPct: v }) });
                          refreshCatalog();
                        }}
                        className="w-20 text-right text-sm font-bold border border-orange-300 rounded px-2 py-1.5 focus:outline-none" />
                      <span className="text-xs text-gray-500">%</span>
                    </div>
                  </div>
                </div>

                {/* Structure template tabs */}
                <div className="flex gap-1">
                  {[
                    { key: 'flatRoof', label: 'Flat Roof (Base)' },
                    { key: 'elevated', label: 'Elevated' },
                    { key: 'sheetRoof', label: 'Sheet Roof' }
                  ].map(t => (
                    <button key={t.key} onClick={() => setStructTab(t.key)}
                      className={`px-3 py-1.5 rounded text-xs font-bold transition ${structTab === t.key ? 'bg-orange-600 text-white shadow' : 'bg-white text-gray-600 hover:bg-orange-100 border border-gray-300'}`}>
                      {t.label} ({(catalog.structureTemplates?.[t.key]?.items || []).length})
                    </button>
                  ))}
                </div>

                {/* Template items table with Save button */}
                {catalog.structureTemplates?.[structTab] && (() => {
                  const tmplItems = catalog.structureTemplates[structTab].items;
                  const changedCount = Object.keys(pendingStructChanges).filter(k => k.startsWith(structTab + '_')).length;
                  // Get display value: pending change or original
                  const getVal = (idx, field, fallback) => {
                    const key = `${structTab}_${idx}_${field}`;
                    return pendingStructChanges[key] !== undefined ? pendingStructChanges[key] : fallback;
                  };
                  const setVal = (idx, field, val) => {
                    const key = `${structTab}_${idx}_${field}`;
                    const orig = field.startsWith('qty_')
                      ? (tmplItems[idx]?.qty?.[field.replace('qty_','')] || 0)
                      : tmplItems[idx]?.[field];
                    if (val === orig) {
                      setPendingStructChanges(prev => { const next = {...prev}; delete next[key]; return next; });
                    } else {
                      setPendingStructChanges(prev => ({ ...prev, [key]: val }));
                    }
                  };
                  return (
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-bold text-orange-800">
                        {catalog.structureTemplates[structTab].label} — {tmplItems.length} items
                      </span>
                      <button
                        disabled={structSaving || changedCount === 0}
                        onClick={async () => {
                          setStructSaving(true);
                          setStructSaved('');
                          try {
                            const updated = tmplItems.map((item, idx) => {
                              let newItem = { ...item };
                              // Apply all pending changes for this item
                              for (const [key, val] of Object.entries(pendingStructChanges)) {
                                if (!key.startsWith(`${structTab}_${idx}_`)) continue;
                                const field = key.replace(`${structTab}_${idx}_`, '');
                                if (field.startsWith('qty_')) {
                                  const kw = field.replace('qty_', '');
                                  newItem = { ...newItem, qty: { ...newItem.qty, [kw]: val } };
                                } else if (field === 'weightKg' || field === 'price') {
                                  newItem[field] = val;
                                } else if (field === 'name') {
                                  newItem.name = val;
                                }
                              }
                              return newItem;
                            });
                            await fetch(`${API}/admin/structure-templates`, {
                              method: 'PUT', headers: authHeaders,
                              body: JSON.stringify({ templateKey: structTab, items: updated })
                            });
                            // Clear pending changes for this tab
                            setPendingStructChanges(prev => {
                              const next = {};
                              for (const [k,v] of Object.entries(prev)) {
                                if (!k.startsWith(structTab + '_')) next[k] = v;
                              }
                              return next;
                            });
                            refreshCatalog();
                            setStructSaved(`${changedCount} change${changedCount > 1 ? 's' : ''} saved`);
                            setTimeout(() => setStructSaved(''), 5000);
                          } catch (err) {
                            setStructSaved('Error: ' + err.message);
                          }
                          setStructSaving(false);
                        }}
                        className={`px-4 py-1.5 rounded text-xs font-bold transition shadow ${
                          changedCount === 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : structSaving ? 'bg-orange-400 text-white cursor-wait'
                            : 'bg-orange-600 text-white hover:bg-orange-700'
                        }`}>
                        {structSaving ? 'Saving...' : `Save Changes${changedCount > 0 ? ` (${changedCount})` : ''}`}
                      </button>
                      {changedCount > 0 && !structSaving && (
                        <button onClick={() => setPendingStructChanges(prev => {
                          const next = {};
                          for (const [k,v] of Object.entries(prev)) {
                            if (!k.startsWith(structTab + '_')) next[k] = v;
                          }
                          return next;
                        })} className="px-3 py-1.5 rounded text-xs font-bold bg-gray-200 text-gray-600 hover:bg-gray-300">Discard</button>
                      )}
                      {structSaved && (
                        <span className={`text-xs font-bold px-2 py-1 rounded ${structSaved.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {structSaved.startsWith('Error') ? '✗' : '✓'} {structSaved}
                        </span>
                      )}
                      <button onClick={async () => {
                        const newItems = [...tmplItems, { name: 'New Item', type: 'fixed', price: 0, unit: 'nos', qty: { '3': 1, '5': 1, '8': 1, '10': 1 } }];
                        await fetch(`${API}/admin/structure-templates`, {
                          method: 'PUT', headers: authHeaders,
                          body: JSON.stringify({ templateKey: structTab, items: newItems })
                        });
                        refreshCatalog();
                      }} className="ml-auto px-3 py-1 bg-orange-600 text-white rounded text-xs font-bold hover:bg-orange-700">
                        + Add Item
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-orange-200 text-orange-900">
                            <th className="px-2 py-1.5 text-left">#</th>
                            <th className="px-2 py-1.5 text-left">Name</th>
                            <th className="px-2 py-1.5 text-center">Type</th>
                            <th className="px-2 py-1.5 text-center">Weight/Price</th>
                            <th className="px-2 py-1.5 text-center">3kW</th>
                            <th className="px-2 py-1.5 text-center">5kW</th>
                            <th className="px-2 py-1.5 text-center">8kW</th>
                            <th className="px-2 py-1.5 text-center">10kW</th>
                            <th className="px-2 py-1.5 text-center">X</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tmplItems.map((item, i) => {
                            const hasChange = Object.keys(pendingStructChanges).some(k => k.startsWith(`${structTab}_${i}_`));
                            return (
                              <tr key={i} className={`${hasChange ? 'bg-amber-50' : ''} border-b border-orange-100 hover:bg-orange-50`}>
                                <td className="px-2 py-1 text-gray-500">{i + 1}</td>
                                <td className="px-1 py-1">
                                  <input type="text" value={getVal(i, 'name', item.name)}
                                    onChange={e => setVal(i, 'name', e.target.value)}
                                    className="w-full px-1 py-0.5 border border-gray-200 rounded text-xs focus:outline-none" />
                                </td>
                                <td className="px-1 py-1 text-center">
                                  <span className="text-xs text-gray-600">{item.type === 'tube' ? 'Tube' : 'Fixed'}</span>
                                </td>
                                <td className="px-1 py-1 text-center">
                                  {item.type === 'tube' ? (
                                    <div className="flex items-center gap-1 justify-center">
                                      <input type="number" step="0.1"
                                        value={getVal(i, 'weightKg', item.weightKg || 0)}
                                        onChange={e => setVal(i, 'weightKg', Number(e.target.value) || 0)}
                                        className="w-16 text-right px-1 py-0.5 border border-orange-200 rounded text-xs focus:outline-none" />
                                      <span className="text-[10px] text-gray-400">kg</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 justify-center">
                                      <span className="text-[10px] text-gray-400">₹</span>
                                      <input type="number"
                                        value={getVal(i, 'price', item.price || 0)}
                                        onChange={e => setVal(i, 'price', Number(e.target.value) || 0)}
                                        className="w-16 text-right px-1 py-0.5 border border-blue-200 rounded text-xs focus:outline-none" />
                                    </div>
                                  )}
                                </td>
                                {['3', '5', '8', '10'].map(kw => (
                                  <td key={kw} className="px-1 py-1 text-center">
                                    <input type="number" step="0.5" min="0"
                                      value={getVal(i, 'qty_' + kw, item.qty?.[kw] || 0)}
                                      onChange={e => setVal(i, 'qty_' + kw, Number(e.target.value) || 0)}
                                      className={`w-12 text-center px-1 py-0.5 border rounded text-xs focus:outline-none ${
                                        pendingStructChanges[`${structTab}_${i}_qty_${kw}`] !== undefined ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                                      }`} />
                                  </td>
                                ))}
                                <td className="px-1 py-1 text-center">
                                  <button onClick={async () => {
                                    const items = tmplItems.filter((_, idx) => idx !== i);
                                    await fetch(`${API}/admin/structure-templates`, {
                                      method: 'PUT', headers: authHeaders,
                                      body: JSON.stringify({ templateKey: structTab, items })
                                    });
                                    setPendingStructChanges({});
                                    refreshCatalog();
                                  }} className="text-red-400 hover:text-red-600 font-bold" title="Remove">X</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  );
                })()}
              </div>
            </details>
          )}

          {/* ===== ADMIN: BOM Fixed Item Prices ===== */}
          {admin && catalog?.bomTemplates && (
            <details className="admin-section no-print">
              <summary className="p-3 cursor-pointer font-semibold text-sm select-none">
                BOM Fixed Item Prices (one change → all sizes)
              </summary>
              <div className="p-3 pt-1 space-y-3">
                <p className="text-xs text-violet-600">
                  Edit prices below, then click <strong>Save All Prices</strong>. Changes affect all kW sizes and tiers.
                </p>

                {/* Save button + status */}
                <div className="flex items-center gap-3">
                  <button
                    disabled={fixedPriceSaving || Object.keys(pendingFixedPrices).length === 0}
                    onClick={async () => {
                      setFixedPriceSaving(true);
                      setFixedPriceSaved('');
                      try {
                        // Group pending changes by system type
                        const changesByType = {};
                        for (const [key, newPrice] of Object.entries(pendingFixedPrices)) {
                          const [st, idxStr] = key.split('_');
                          if (!changesByType[st]) changesByType[st] = {};
                          changesByType[st][Number(idxStr)] = newPrice;
                        }
                        // Save each system type in sequence
                        for (const [st, changes] of Object.entries(changesByType)) {
                          const tmpl = catalog.bomTemplates[st];
                          const updated = tmpl.fixedItems.map((fi, idx) =>
                            changes[idx] !== undefined ? { ...fi, price: changes[idx] } : fi
                          );
                          const res = await fetch(`${API}/admin/bom-template/${st}`, {
                            method: 'PUT', headers: authHeaders,
                            body: JSON.stringify({ fixedItems: updated })
                          });
                          if (!res.ok) throw new Error(`Failed to save ${st}: ${res.status}`);
                        }
                        // Clear overrides and refresh
                        setPriceOverrides({});
                        setUpgradePriceOverrides({});
                        setPendingFixedPrices({});
                        refreshCatalog();
                        const count = Object.keys(pendingFixedPrices).length;
                        setFixedPriceSaved(`${count} price${count > 1 ? 's' : ''} saved successfully`);
                        setTimeout(() => setFixedPriceSaved(''), 5000);
                      } catch (err) {
                        setFixedPriceSaved('Error: ' + err.message);
                      }
                      setFixedPriceSaving(false);
                    }}
                    className={`px-5 py-2 rounded-lg text-xs font-bold transition shadow ${
                      Object.keys(pendingFixedPrices).length === 0
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : fixedPriceSaving
                          ? 'bg-violet-400 text-white cursor-wait'
                          : 'bg-violet-600 text-white hover:bg-violet-700'
                    }`}>
                    {fixedPriceSaving ? 'Saving...' : `Save All Prices${Object.keys(pendingFixedPrices).length > 0 ? ` (${Object.keys(pendingFixedPrices).length} changed)` : ''}`}
                  </button>
                  {Object.keys(pendingFixedPrices).length > 0 && !fixedPriceSaving && (
                    <button onClick={() => setPendingFixedPrices({})}
                      className="px-3 py-2 rounded-lg text-xs font-bold bg-gray-200 text-gray-600 hover:bg-gray-300 transition">
                      Discard Changes
                    </button>
                  )}
                  {fixedPriceSaved && (
                    <span className={`text-xs font-bold px-3 py-1.5 rounded ${fixedPriceSaved.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {fixedPriceSaved.startsWith('Error') ? '✗' : '✓'} {fixedPriceSaved}
                    </span>
                  )}
                </div>

                {['ongrid', 'hybrid'].map(st => {
                  const tmpl = catalog.bomTemplates[st];
                  if (!tmpl?.fixedItems?.length) return null;
                  const changedCount = tmpl.fixedItems.filter((_, idx) => pendingFixedPrices[`${st}_${idx}`] !== undefined).length;
                  return (
                    <details key={st} className="bg-white rounded-lg border border-violet-200">
                      <summary className="p-2 cursor-pointer text-xs font-bold text-violet-800 select-none">
                        {st === 'ongrid' ? 'On-Grid' : 'Hybrid'} Fixed Items ({tmpl.fixedItems.length})
                        {changedCount > 0 && <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px]">{changedCount} unsaved</span>}
                      </summary>
                      <div className="p-2 overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-violet-100 text-violet-900">
                              <th className="px-2 py-1 text-left w-8">#</th>
                              <th className="px-2 py-1 text-left">Item Name</th>
                              <th className="px-2 py-1 text-right w-24">Current ₹</th>
                              <th className="px-2 py-1 text-right w-24">New ₹</th>
                              <th className="px-2 py-1 text-center w-14">GST%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tmpl.fixedItems.map((fi, idx) => {
                              const pKey = `${st}_${idx}`;
                              const isPending = pendingFixedPrices[pKey] !== undefined;
                              const displayPrice = isPending ? pendingFixedPrices[pKey] : fi.price;
                              return (
                                <tr key={idx} className={`${isPending ? 'bg-amber-50' : idx % 2 === 0 ? 'bg-white' : 'bg-violet-50/50'} border-b border-violet-100 hover:bg-violet-50`}>
                                  <td className="px-2 py-1 text-gray-400">{idx + 1}</td>
                                  <td className="px-2 py-1 font-medium text-gray-800">{fi.name}</td>
                                  <td className="px-2 py-1 text-right text-gray-400">
                                    {isPending ? <span className="line-through">{fi.price}</span> : <span className="text-gray-600">{fi.price}</span>}
                                  </td>
                                  <td className="px-2 py-1 text-right">
                                    <input type="number" min="0" step="any"
                                      value={displayPrice}
                                      onChange={e => {
                                        const val = e.target.value === '' ? '' : Number(e.target.value);
                                        if (val === fi.price || val === '') {
                                          // Reverted to original — remove from pending
                                          setPendingFixedPrices(prev => {
                                            const next = { ...prev };
                                            delete next[pKey];
                                            return next;
                                          });
                                        } else {
                                          setPendingFixedPrices(prev => ({ ...prev, [pKey]: val }));
                                        }
                                      }}
                                      className={`w-20 text-right px-1 py-0.5 border rounded text-xs font-bold focus:outline-none ${
                                        isPending ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-violet-300 text-gray-700'
                                      }`} />
                                  </td>
                                  <td className="px-2 py-1 text-center">
                                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">9%</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  );
                })}
              </div>
            </details>
          )}

          {/* ===== ADMIN: Offers & Discounts Management ===== */}
          {admin && (
            <details className="admin-section no-print">
              <summary className="p-3 cursor-pointer font-semibold text-sm select-none">
                Offers & Discounts Management ({allOffers.length} total)
              </summary>
              <div className="p-3 pt-1 space-y-3">
                {/* Create new offer */}
                <div className="bg-white p-3 rounded-lg border border-green-200 space-y-2">
                  <h4 className="text-xs font-bold text-green-800 uppercase tracking-wide">Create New Offer</h4>
                  <form onSubmit={async e => {
                    e.preventDefault();
                    const fd = new FormData(e.target);
                    const payload = {
                      name: fd.get('name'),
                      type: fd.get('type'),
                      value: Number(fd.get('value')) || 0,
                      appliesTo: fd.get('appliesTo'),
                      appliesToTier: fd.get('appliesToTier'),
                      startDate: fd.get('startDate') || null,
                      endDate: fd.get('endDate') || null,
                      active: true
                    };
                    if (!payload.name || !payload.value) return;
                    await fetch(`${API}/admin/offers`, { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
                    refreshOffers();
                    e.target.reset();
                  }} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input name="name" placeholder="Offer name" required className="col-span-2 sm:col-span-1 px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none" />
                    <div className="flex gap-1">
                      <select name="type" className="px-2 py-1.5 border border-gray-300 rounded text-xs bg-white focus:outline-none">
                        <option value="flat">₹ Flat</option>
                        <option value="percent">% Percent</option>
                      </select>
                      <input name="value" type="number" min="0" step="any" placeholder="Value" required className="w-20 px-2 py-1.5 border border-gray-300 rounded text-xs text-right focus:outline-none" />
                    </div>
                    <select name="appliesTo" className="px-2 py-1.5 border border-gray-300 rounded text-xs bg-white focus:outline-none">
                      <option value="all">All Systems</option>
                      <option value="ongrid">On-Grid Only</option>
                      <option value="hybrid">Hybrid Only</option>
                      <option value="upgrade">Upgrade Only</option>
                    </select>
                    <select name="appliesToTier" className="px-2 py-1.5 border border-gray-300 rounded text-xs bg-white focus:outline-none">
                      <option value="all">All Tiers</option>
                      <option value="base">Base Only</option>
                      <option value="value">Value Only</option>
                      <option value="premium">Premium Only</option>
                    </select>
                    <div className="flex gap-1 items-center">
                      <input name="startDate" type="date" className="px-1.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none" />
                      <span className="text-xs text-gray-400">to</span>
                      <input name="endDate" type="date" className="px-1.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none" />
                    </div>
                    <button type="submit" className="col-span-2 sm:col-span-4 px-4 py-2 bg-green-600 text-white font-bold rounded text-xs hover:bg-green-700 transition">
                      + Create Offer
                    </button>
                  </form>
                </div>

                {/* Existing offers table */}
                {allOffers.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-green-200 text-green-900">
                          <th className="px-2 py-1.5 text-left">Name</th>
                          <th className="px-2 py-1.5 text-center">Type</th>
                          <th className="px-2 py-1.5 text-center">Value</th>
                          <th className="px-2 py-1.5 text-center">System</th>
                          <th className="px-2 py-1.5 text-center">Tier</th>
                          <th className="px-2 py-1.5 text-center">Start</th>
                          <th className="px-2 py-1.5 text-center">End</th>
                          <th className="px-2 py-1.5 text-center">Active</th>
                          <th className="px-2 py-1.5 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allOffers.map(offer => {
                          const now = new Date().toISOString().slice(0, 10);
                          const isExpired = offer.endDate && offer.endDate < now;
                          const isNotStarted = offer.startDate && offer.startDate > now;
                          const statusColor = !offer.active ? 'bg-gray-50 text-gray-400' :
                            isExpired ? 'bg-red-50' : isNotStarted ? 'bg-yellow-50' : 'bg-white';
                          return (
                            <tr key={offer.id} className={`${statusColor} border-b border-green-100 hover:bg-green-50`}>
                              <td className="px-2 py-1.5 font-medium">{offer.name}</td>
                              <td className="px-2 py-1.5 text-center">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${offer.type === 'percent' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                  {offer.type === 'percent' ? '%' : '₹'}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-center font-bold">
                                {offer.type === 'percent' ? offer.value + '%' : fmt(offer.value)}
                              </td>
                              <td className="px-2 py-1.5 text-center capitalize">{offer.appliesTo}</td>
                              <td className="px-2 py-1.5 text-center capitalize">{offer.appliesToTier || 'all'}</td>
                              <td className="px-2 py-1.5 text-center text-gray-500">{offer.startDate || '—'}</td>
                              <td className="px-2 py-1.5 text-center text-gray-500">{offer.endDate || '—'}</td>
                              <td className="px-2 py-1.5 text-center">
                                <button onClick={async () => {
                                  await fetch(`${API}/admin/offers/${offer.id}`, {
                                    method: 'PUT', headers: authHeaders,
                                    body: JSON.stringify({ ...offer, active: !offer.active })
                                  });
                                  refreshOffers();
                                }} className={`px-2 py-0.5 rounded text-[10px] font-bold ${offer.active ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                                  {offer.active ? 'ON' : 'OFF'}
                                </button>
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <button onClick={async () => {
                                  if (!confirm(`Delete offer "${offer.name}"?`)) return;
                                  await fetch(`${API}/admin/offers/${offer.id}`, { method: 'DELETE', headers: authHeaders });
                                  refreshOffers();
                                }} className="text-red-400 hover:text-red-600 font-bold" title="Delete">✕</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {allOffers.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-2">No offers created yet. Create your first offer above.</p>
                )}
              </div>
            </details>
          )}

          {/* ===== ADMIN: Cost Breakdown & Profit ===== */}
          {admin && isQ && (
            <div className="bg-slate-50 border border-slate-300 rounded-lg p-4 space-y-4 no-print">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <h3 className="font-bold text-sm text-slate-800">Admin: Cost Breakdown & Profit</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-700">Installation Charge</label>
                    <span className="text-xs text-gray-400">{catalog.installationMatrix?.[size]?.[roofType] ? `${size} / ${roofType}` : `${bomKwDisplay}kW x ${catalog.costs?.installRate || 0}/kW`}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-gray-400">{'\u20B9'}</span>
                    <input type="number" min="0" value={bom.costCalc.installation}
                      onChange={e => setCostOvr(prev => ({ ...prev, installation: Number(e.target.value) || 0 }))}
                      className="w-full text-right text-xs border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-400 focus:outline-none" />
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                  <label className="text-xs font-medium text-gray-700">Service (5Yrs/10 Visits)</label>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-gray-400">{'\u20B9'}</span>
                    <input type="number" min="0" value={bom.costCalc.service}
                      onChange={e => setCostOvr(prev => ({ ...prev, service: Number(e.target.value) || 0 }))}
                      className="w-full text-right text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none" />
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-blue-300">
                  <label className="text-xs font-medium text-gray-700">Transportation</label>
                  <div className="text-[10px] text-blue-600 mb-1">Base: {catalog.transportConfig?.baseDistanceKm || 100}km incl, then {catalog.transportConfig?.costPerKm || 35}/km</div>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="number" min="0" value={distKm}
                      onChange={e => setDistKm(Number(e.target.value) || 0)}
                      className="w-20 text-center text-xs border border-blue-300 rounded px-2 py-1.5 bg-blue-50 focus:outline-none" />
                    <span className="text-xs text-gray-500">km</span>
                    <span className="text-xs font-semibold text-gray-700 ml-auto">= {fmt(bom.costCalc.transportation)}</span>
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                  <label className="text-xs font-medium text-gray-700">Miscellaneous</label>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-gray-400">{'\u20B9'}</span>
                    <input type="number" min="0" value={bom.costCalc.miscellaneous}
                      onChange={e => setCostOvr(prev => ({ ...prev, miscellaneous: Number(e.target.value) || 0 }))}
                      className="w-full text-right text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none" />
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                  <label className="text-xs font-medium text-gray-700">Office Expense</label>
                  <div className="text-[10px] text-gray-500 mb-1">{fmt(catalog.officeExpense?.monthlyExpense || 0)}/mo \u00F7 {catalog.officeExpense?.expectedProjectsPerMonth || 0} projects</div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-gray-400">{'\u20B9'}</span>
                    <input type="number" min="0" value={bom.costCalc.office}
                      onChange={e => setCostOvr(prev => ({ ...prev, office: Number(e.target.value) || 0 }))}
                      className="w-full text-right text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none" />
                  </div>
                </div>

                {/* Structure Grade Section */}
                <div className="col-span-2 bg-orange-50 p-3 rounded-lg border border-orange-300">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-orange-800 uppercase tracking-wide">Structure Grade (GP / GI)</label>
                    <div className="flex gap-1">
                      {[
                        { key: 'default', label: `Default (${bom.defaultGradeLabel})` },
                        { key: 'gp', label: 'GP' },
                        { key: 'gi', label: 'GI' }
                      ].map(g => (
                        <button key={g.key} onClick={() => setStructGrade(g.key)}
                          className={`px-2 py-1 rounded text-[10px] font-bold transition ${structGrade === g.key ? 'bg-orange-600 text-white shadow' : 'bg-white text-orange-700 border border-orange-300 hover:bg-orange-100'}`}>
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Grade Pricing Mode */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-orange-700 font-semibold uppercase">Pricing Mode:</span>
                    <div className="flex gap-1">
                      {[
                        { key: 'manual', label: 'Manual (₹/kg)' },
                        { key: 'flat', label: 'Flat (₹/kW)' }
                      ].map(m => (
                        <button key={m.key} onClick={async () => {
                          setStructGradeMode(m.key);
                          await fetch(`${API}/admin/costs`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ structGradeMode: m.key }) });
                          refreshCatalog();
                        }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${structGradeMode === m.key ? 'bg-orange-700 text-white' : 'bg-white text-orange-600 border border-orange-200 hover:bg-orange-50'}`}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {/* GP Rate */}
                    <div className="bg-white p-2 rounded border border-orange-200">
                      <label className="text-[10px] font-medium text-orange-700">GP Rate (Base)</label>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-gray-400">₹</span>
                        <input type="number" min="0" step="0.1"
                          defaultValue={catalog.costs?.gpRatePerKg || 85}
                          onBlur={async e => {
                            const v = Number(e.target.value) || 0;
                            await fetch(`${API}/admin/costs`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ gpRatePerKg: v }) });
                            refreshCatalog();
                          }}
                          className="w-full text-right text-[11px] border border-orange-300 rounded px-1.5 py-1 focus:outline-none" />
                        <span className="text-[10px] text-gray-400">/kg</span>
                      </div>
                    </div>
                    {/* GI Rate */}
                    <div className="bg-white p-2 rounded border border-orange-200">
                      <label className="text-[10px] font-medium text-orange-700">GI Rate (Val/Prem)</label>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-gray-400">₹</span>
                        <input type="number" min="0" step="0.1"
                          defaultValue={catalog.costs?.giRatePerKg || 98.3}
                          onBlur={async e => {
                            const v = Number(e.target.value) || 0;
                            await fetch(`${API}/admin/costs`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ giRatePerKg: v }) });
                            refreshCatalog();
                          }}
                          className="w-full text-right text-[11px] border border-orange-300 rounded px-1.5 py-1 focus:outline-none" />
                        <span className="text-[10px] text-gray-400">/kg</span>
                      </div>
                    </div>
                    {/* Flat Premium Per kW */}
                    <div className={`bg-white p-2 rounded border ${structGradeMode === 'flat' ? 'border-orange-400 ring-1 ring-orange-300' : 'border-gray-200 opacity-50'}`}>
                      <label className="text-[10px] font-medium text-orange-700">Flat Premium</label>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-gray-400">₹</span>
                        <input type="number" min="0" step="100"
                          defaultValue={catalog.costs?.structGradeFlatPerKw || 0}
                          disabled={structGradeMode !== 'flat'}
                          onBlur={async e => {
                            const v = Number(e.target.value) || 0;
                            await fetch(`${API}/admin/costs`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ structGradeFlatPerKw: v }) });
                            refreshCatalog();
                          }}
                          className="w-full text-right text-[11px] border border-orange-300 rounded px-1.5 py-1 focus:outline-none disabled:bg-gray-100" />
                        <span className="text-[10px] text-gray-400">/kW</span>
                      </div>
                    </div>
                  </div>
                  {/* Live preview of grade diff */}
                  {structGrade !== 'default' && (
                    <div className="mt-2 text-[10px] bg-white rounded p-2 border border-orange-200">
                      <span className="text-orange-700 font-semibold">Grade Diff ({bom.defaultGradeLabel} → {bom.customerGradeLabel}):</span>{' '}
                      <span className="font-bold text-orange-900">{bom.structGradeDiff >= 0 ? '+' : ''}{fmt(bom.structGradeDiff)}</span>
                      <span className="text-gray-500 ml-1">
                        ({structGradeMode === 'flat' ? `₹${catalog.costs?.structGradeFlatPerKw || 0}/kW × ${bom.bomKw}kW` : 'rate-per-kg diff + 18% GST'})
                      </span>
                    </div>
                  )}
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-orange-200">
                  <label className="text-xs font-medium text-orange-700">Structure Labor</label>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-gray-400">{'\u20B9'}</span>
                    <input type="number" min="0"
                      defaultValue={catalog.costs?.structureLabor || 0}
                      onBlur={async e => {
                        const v = Number(e.target.value) || 0;
                        await fetch(`${API}/admin/costs`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ structureLabor: v }) });
                        refreshCatalog();
                      }}
                      className="w-full text-right text-xs border border-orange-300 rounded px-2 py-1.5 focus:outline-none" />
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-orange-200">
                  <label className="text-xs font-medium text-orange-700">Repair Margin %</label>
                  <div className="flex items-center gap-1 mt-1">
                    <input type="number" min="0" step="1"
                      defaultValue={catalog.costs?.structureRepairPct || 0}
                      onBlur={async e => {
                        const v = Number(e.target.value) || 0;
                        await fetch(`${API}/admin/costs`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ structureRepairPct: v }) });
                        refreshCatalog();
                      }}
                      className="w-full text-right text-xs border border-orange-300 rounded px-2 py-1.5 focus:outline-none" />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                </div>
                <div className="bg-orange-50 p-2.5 rounded-lg border border-orange-200">
                  <label className="text-xs font-medium text-orange-700">Tube Rate</label>
                  <div className="text-sm font-bold text-orange-800 mt-1">{bom.customerGradeLabel || bom.defaultGradeLabel || 'GI'} @ {'\u20B9'}{bom.tubeRate}/kg</div>
                  <div className="text-[10px] text-gray-500">Structure items in material list</div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                  <button onClick={() => setCostOvr({})} className="text-xs text-indigo-600 hover:underline font-medium">Reset to Defaults</button>
                </div>
              </div>

              {/* Package Engineering Profiles — config-driven structure type per package */}
              <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-300">
                <label className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-2 block">Package Engineering Profiles</label>
                <div className="text-[10px] text-indigo-600 mb-2">Structure type per package. Changes apply to all new quotations.</div>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { key: 'ongrid_base', label: 'On-Grid Base' },
                    { key: 'ongrid_value', label: 'On-Grid Value' },
                    { key: 'hybrid_nobat', label: 'Hybrid (No Bat)' },
                    { key: 'hybrid_bat', label: 'Hybrid + Battery' },
                    { key: 'premium', label: 'Premium Enphase' }
                  ].map(pkg => {
                    const profiles = catalog.packageProfiles || {};
                    const profile = profiles[pkg.key] || {};
                    const currentStruct = profile.structureType || (pkg.key === 'ongrid_base' ? 'GP' : 'GI');
                    return (
                      <div key={pkg.key} className="bg-white p-2 rounded border border-indigo-200">
                        <div className="text-[10px] font-bold text-indigo-700 mb-1 truncate" title={pkg.label}>{pkg.label}</div>
                        <div className="flex gap-1">
                          {['GP', 'GI'].map(st => (
                            <button key={st} onClick={async () => {
                              const updated = { ...catalog.packageProfiles };
                              if (!updated[pkg.key]) updated[pkg.key] = { label: pkg.label };
                              updated[pkg.key] = { ...updated[pkg.key], structureType: st };
                              await fetch(`${API}/admin/package-profiles`, {
                                method: 'PUT', headers: authHeaders,
                                body: JSON.stringify({ [pkg.key]: updated[pkg.key] })
                              });
                              refreshCatalog();
                            }}
                              className={`flex-1 px-1.5 py-1 rounded text-[10px] font-bold transition ${currentStruct === st ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-500 hover:bg-indigo-100'}`}>
                              {st}
                            </button>
                          ))}
                        </div>
                        <div className="text-[9px] text-gray-400 mt-1">
                          {profile.inverterType === 'hybrid' ? 'Hybrid Inv' : profile.inverterType === 'micro' ? 'Micro Inv' : 'On-Grid Inv'}
                          {profile.batteryIncluded ? ' + Battery' : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-lg border border-gray-200">
                <span className="text-xs font-bold text-gray-700">Profit Margin</span>
                <select value={marginType} onChange={e => setMarginType(e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none">
                  <option value="percent">% of Subtotal</option>
                  <option value="flat">{'\u20B9'} Flat Amount</option>
                </select>
                <input type="number" min="0" step="any" value={marginVal}
                  onChange={e => setMarginVal(e.target.value)}
                  className="w-24 text-right text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none" />
                <span className="text-xs text-gray-500 font-medium">= {fmt(bom.mAmt)}</span>
              </div>

              {/* Summary */}
              <div className={`p-4 rounded-lg border space-y-2 ${isHyb ? 'bg-teal-50 border-teal-200' : 'bg-indigo-50 border-indigo-200'}`}>
                <div className="flex justify-between text-xs text-gray-700"><span>Material Total (pre-GST)</span><span className="font-medium">{fmt(bom.totals.matTotal)}</span></div>
                <div className="flex justify-between text-xs text-green-700"><span>GST @9%</span><span className="font-medium">{fmt(bom.totals.totalGst)}</span></div>
                <div className="flex justify-between text-xs text-gray-800 font-semibold border-t pt-1"><span>Material Total (incl GST)</span><span>{fmt(bom.totals.matWithGst)}</span></div>
                <div className="flex justify-between text-xs text-gray-600"><span>Installation ({bomKwDisplay}kW)</span><span>{fmt(bom.costCalc.installation)}</span></div>
                <div className="flex justify-between text-xs text-gray-600"><span>Service (5Yrs)</span><span>{fmt(bom.costCalc.service)}</span></div>
                {bom.costCalc.transportation > 0 && <div className="flex justify-between text-xs text-gray-600"><span>Transportation ({distKm}km)</span><span>{fmt(bom.costCalc.transportation)}</span></div>}
                <div className="flex justify-between text-xs text-gray-600"><span>Miscellaneous</span><span>{fmt(bom.costCalc.miscellaneous)}</span></div>
                <div className="flex justify-between text-xs text-gray-600"><span>Office Expense</span><span>{fmt(bom.costCalc.office)}</span></div>
                {bom.structureAddOnTotal > 0 && (
                  <>
                    <div className="flex justify-between text-xs text-orange-600"><span>Structure Extra ({bom.structureExtraLabel})</span><span>{fmt(bom.costCalc.structureExtra)}</span></div>

                    <div className="flex justify-between text-xs text-orange-600"><span>Structure Labor</span><span>{fmt(bom.costCalc.structureLabor)}</span></div>
                    {bom.costCalc.structureRepair > 0 && <div className="flex justify-between text-xs text-orange-600"><span>Repair Margin ({catalog.costs?.structureRepairPct}%)</span><span>{fmt(bom.costCalc.structureRepair)}</span></div>}
                  </>
                )}
                {bom.lines.filter(l => l.isAddOn).map((l, i) => (
                  <div key={`addon-${i}`} className="flex justify-between text-xs text-orange-600"><span>{l.label} ({l.qty}m)</span><span>{fmt(l.amount + l.gstAmt)}</span></div>
                ))}
                {bom.transportExtra > 0 && <div className="flex justify-between text-xs text-orange-600"><span>Transport Extra ({distKm - 100}km × ₹35)</span><span>{fmt(bom.transportExtra)}</span></div>}
                {bom.addOnTotal > 0 && <div className="flex justify-between text-xs text-orange-700 font-semibold"><span>Total Add-On Extras</span><span>{fmt(bom.addOnTotal)}</span></div>}
                <div className="flex justify-between text-xs text-gray-700 border-t pt-1"><span>Pre-GST Cost</span><span className="font-medium">{fmt(bom.preGstSub)}</span></div>
                <div className="flex justify-between text-xs text-gray-700"><span>Profit {marginType === 'percent' ? `(${marginVal}%)` : ''} (on pre-GST)</span><span className="font-medium">+ {fmt(bom.mAmt)}</span></div>
                <div className="flex justify-between text-xs text-gray-700 font-semibold"><span>Cost + Profit (pre-GST)</span><span>{fmt(bom.sub)}</span></div>
                <div className="flex justify-between text-xs text-green-700"><span>GST @9% on selling price</span><span className="font-medium">+ {fmt(bom.allGst)}</span></div>
                <div className="border-t-2 pt-2 flex justify-between font-bold text-lg">
                  <span className="text-gray-800">Actual Cost (with Profit + GST)</span>
                  <span className={isHyb ? 'text-teal-700' : 'text-indigo-700'}>{fmt(bom.grand)}</span>
                </div>
              </div>

              {/* Market Rate Section */}
              <div className="p-4 rounded-lg border-2 border-amber-400 bg-amber-50 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                  <h3 className="font-bold text-sm text-amber-900">Market Rate (Customer Sees This)</h3>
                </div>
                <div className="text-xs font-medium text-gray-600 mb-1">
                  {isHyb ? 'Hybrid' : 'On-Grid'} / {tier} {isHyb ? `/ ${batConfig} bat` : ''} / {sizeLabels[size]}
                  {futureUpgrade && upgradeSize && ` (Inverter: ${sizeLabels[upgradeSize]}${(!fuOpts.includeStructure || !fuOpts.includeDB || !fuOpts.includeCables || !fuOpts.includeMeter) ? ' partial' : ''})`}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-500">₹</span>
                    <input type="number" min="0" step="1000"
                      value={mrInput[`${bom.mrKey}_${size}`] ?? bom.marketRate}
                      onChange={e => {
                        const v = e.target.value;
                        setMrInput(prev => ({ ...prev, [`${bom.mrKey}_${size}`]: v === '' ? '' : Number(v) }));
                        setMrSaved('');
                      }}
                      className="w-40 text-right text-sm font-bold border-2 border-amber-400 rounded px-2 py-1.5 bg-white focus:ring-2 focus:ring-amber-400 focus:outline-none" />
                  </div>
                  <button type="button" onClick={async () => {
                    try {
                      const mk = `${bom.mrKey}_${size}`;
                      const raw = mrInput[mk];
                      const val = raw !== undefined && raw !== '' ? Number(raw) : bom.marketRate;
                      // Save rate AND priceDiffBase (current priceDiffTotal at time of save)
                      const payload = {
                        [bom.mrKey]: { [size]: val || 0 },
                        [bom.mrKey + '_diffBase']: { [size]: bom.priceDiffTotal || 0 }
                      };
                      console.log('[MR Save]', payload, 'priceDiffBase:', bom.priceDiffTotal);
                      const r = await fetch(`${API}/admin/market-rates`, {
                        method: 'PUT', headers: authHeaders,
                        body: JSON.stringify(payload)
                      });
                      if (!r.ok) { const e = await r.text(); console.error('[MR Error]', r.status, e); setMrSaved('Error: ' + r.status); return; }
                      await r.json();
                      setMrSaved(`Market rate updated: ${fmt(val || 0)} (config locked)`);
                      setMrInput(prev => { const n = { ...prev }; delete n[mk]; return n; });
                      refreshCatalog();
                      setTimeout(() => setMrSaved(''), 5000);
                    } catch (err) { console.error('[MR Fetch Error]', err); setMrSaved('Network error — check console'); }
                  }} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold transition shadow-sm">
                    Save Rate
                  </button>
                  <button type="button" onClick={async () => {
                    try {
                      const val = bom.grand;
                      const payload = {
                        [bom.mrKey]: { [size]: val },
                        [bom.mrKey + '_diffBase']: { [size]: bom.priceDiffTotal || 0 }
                      };
                      console.log('[MR SetActual]', payload);
                      const r = await fetch(`${API}/admin/market-rates`, {
                        method: 'PUT', headers: authHeaders,
                        body: JSON.stringify(payload)
                      });
                      if (!r.ok) { const e = await r.text(); console.error('[MR Error]', r.status, e); setMrSaved('Error: ' + r.status); return; }
                      await r.json();
                      setMrSaved(`Market rate set to actual: ${fmt(val)}`);
                      const mk = `${bom.mrKey}_${size}`;
                      setMrInput(prev => { const n = { ...prev }; delete n[mk]; return n; });
                      refreshCatalog();
                      setTimeout(() => setMrSaved(''), 5000);
                    } catch (err) { console.error('[MR Fetch Error]', err); setMrSaved('Network error — check console'); }
                  }} className="px-2 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-semibold transition">
                    Set to Actual ({fmt(bom.grand)})
                  </button>
                </div>
                {mrSaved && (
                  <div className={`flex items-center gap-2 px-3 py-2.5 rounded text-sm font-bold ${mrSaved.startsWith('Error') || mrSaved.startsWith('Network') ? 'bg-red-100 border-2 border-red-400 text-red-800' : 'bg-green-100 border-2 border-green-400 text-green-800'}`}>
                    <span>{mrSaved.startsWith('Error') || mrSaved.startsWith('Network') ? '✗' : '✓'}</span> {mrSaved}
                  </div>
                )}
                {bom.marketRate > 0 && (
                  <>
                    <div className="mt-2 p-3 bg-white rounded-lg border border-amber-200 grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-gray-500 block">Base Cost (excl extras)</span>
                        <span className="font-bold text-base">{fmt(bom.baseGrand)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Market Rate</span>
                        <span className="font-bold text-base text-amber-700">{fmt(bom.marketRate)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Margin</span>
                        <span className={`font-bold text-base ${bom.marketRate >= bom.baseGrand ? 'text-green-700' : 'text-red-600'}`}>
                          {bom.marketRate >= bom.baseGrand ? '+' : ''}{fmt(bom.marketRate - bom.baseGrand)}
                          {bom.baseGrand > 0 && <span className="text-xs font-normal ml-1">({((bom.marketRate - bom.baseGrand) / bom.baseGrand * 100).toFixed(1)}%)</span>}
                        </span>
                      </div>
                    </div>
                    {Math.abs(bom.marketRate - bom.grand) > 100 && (
                      <div className="mt-1 p-2 bg-red-50 border border-red-300 rounded text-xs text-red-700 font-medium">
                        ⚠ Market Rate ({fmt(bom.marketRate)}) differs from Actual Cost ({fmt(bom.grand)}) by {fmt(Math.abs(bom.marketRate - bom.grand))}. Non-admin view uses Market Rate. Click "Set to Actual" above to sync.
                      </div>
                    )}
                  </>
                )}
                {bom.marketRate === 0 && !mrSaved && (
                  <p className="text-xs text-red-600 font-medium">⚠ No market rate set — customer will see "Price not configured"</p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Sales Team Price Summary — All 3 Packages (non-admin quotation mode) */}
          {!admin && isQ && (
            <div>
              <div className="step-label">{t('step3')} <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Package Pricing</span></div>
              {(() => {
                const tiers = ['base', 'value', 'premium'];
                const tierLabels = { base: 'Base', value: 'Value', premium: 'Premium' };
                const tierColors = { base: '#EA580C', value: '#059669', premium: '#7C3AED' };
                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {tiers.map(tp => {
                      const tierBom = allTierBoms[tp];
                      const tierDisc = allTierDiscounts[tp] || {};
                      const price = tierDisc.finalPrice || tierBom?.customerPrice || tierBom?.marketRate || 0;
                      const isActive = tp === tier;
                      return (
                        <div key={tp}
                          onClick={() => setTier(tp)}
                          className={`rounded-xl p-4 cursor-pointer transition-all ${isActive ? 'ring-2 ring-offset-2 shadow-lg scale-[1.02]' : 'hover:shadow-md'}`}
                          style={{
                            background: isActive ? tierColors[tp] : 'white',
                            border: `2px solid ${tierColors[tp]}`,
                            ringColor: tierColors[tp],
                          }}>
                          <div className="text-center">
                            <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${isActive ? 'text-white/80' : ''}`}
                              style={{ color: isActive ? undefined : tierColors[tp] }}>
                              {tierLabels[tp]} Package
                            </div>
                            <div className={`text-2xl font-extrabold ${isActive ? 'text-white' : 'text-gray-900'}`}>
                              {fmt(price)}
                            </div>
                            {tierBom?.marketRate > 0 && (
                              <div className={`text-xs mt-1 ${isActive ? 'text-white/70' : 'text-gray-500'}`}>
                                {fmt(tierBom.marketRate)}/kW
                              </div>
                            )}
                            {tierDisc.discountAmt > 0 && (
                              <div className={`text-[10px] mt-1 font-semibold ${isActive ? 'text-green-200' : 'text-green-700'}`}>
                                {tierDisc.discountLabel}: -{fmt(tierDisc.discountAmt)}
                              </div>
                            )}
                            {subsidyType !== 'none' && tierDisc.subsidy > 0 && (
                              <div className={`mt-2 pt-2 border-t ${isActive ? 'border-white/30' : 'border-gray-200'}`}>
                                <div className={`text-[10px] ${isActive ? 'text-yellow-200' : 'text-amber-700'}`}>
                                  {tierDisc.subsidyLabel}
                                </div>
                                <div className={`text-[10px] ${isActive ? 'text-yellow-200' : 'text-amber-700'}`}>
                                  -{fmt(tierDisc.subsidy)}
                                </div>
                                <div className={`text-sm font-bold mt-1 ${isActive ? 'text-white' : 'text-green-800'}`}>
                                  You Pay: {fmt(tierDisc.priceAfterSubsidy)}
                                </div>
                              </div>
                            )}
                            {isActive && (
                              <div className="mt-2 text-white/90 text-[10px] font-bold uppercase tracking-wider">
                                Selected
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Offer selector */}
              {(discountCalc.applicableOffers || []).length > 0 && (
                <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
                  <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Apply Offer</label>
                  <select value={selectedOffer} onChange={e => setSelectedOffer(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded text-sm bg-white text-gray-800 font-medium border focus:outline-none" style={{ borderColor: 'var(--line)' }}>
                    <option value="">No offer</option>
                    {(discountCalc.applicableOffers || []).map(o => (
                      <option key={o.id} value={o.id}>{o.name} ({o.type === 'percent' ? o.value + '%' : fmt(o.value)} off)</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Subsidy selector */}
              <div className="mt-3 rounded-lg p-3" style={{ background: '#FFFBEB', border: '1px solid #F59E0B' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs font-bold text-amber-800">Subsidy Type:</label>
                  <select value={subsidyType} onChange={e => setSubsidyType(e.target.value)}
                    className="px-2 py-1 rounded text-xs bg-white text-gray-800 font-medium border border-amber-300 focus:outline-none">
                    <option value="residential">Residential</option>
                    <option value="ghs">GHS / RWA</option>
                    <option value="none">No Subsidy</option>
                  </select>
                  {subsidyType === 'ghs' && (
                    <div className="flex items-center gap-1">
                      <input type="number" min="1" max="500" value={ghsHouses}
                        onChange={e => setGhsHouses(Math.max(1, Number(e.target.value) || 1))}
                        className="w-14 px-1.5 py-1 rounded text-xs bg-white text-gray-800 font-medium text-center border border-amber-300 focus:outline-none" />
                      <span className="text-amber-700 text-[10px]">houses</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!isQ && (
            <div className="rounded-xl p-4 flex justify-between items-center" style={{ background: 'var(--card-active)', border: '1px solid var(--line)' }}>
              <span className="font-semibold text-sm" style={{ color: 'var(--ink-1)' }}>Total Items</span>
              <span className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{bom.lines.length}</span>
            </div>
          )}

          </>}

          {/* Export buttons */}
          <div className="flex flex-wrap gap-3 justify-center pt-2 pb-2 no-print">
            {admin && <button onClick={exportCsv} className="px-6 py-2.5 text-white font-semibold rounded-lg transition shadow text-sm" style={{ background: 'var(--ink-1)' }}>{t('downloadCsv')}</button>}
            {admin && <button onClick={() => window.print()} className="px-6 py-2.5 text-white font-semibold rounded-lg transition shadow text-sm" style={{ background: 'var(--accent)' }}>{t('print')}</button>}
            {isQ && (
              <button onClick={() => {
                if (!custName.trim()) { alert('Please enter customer name'); return; }
                if (!custPhone.trim()) { alert('Please enter phone number'); return; }
                if (!salesPerson.trim()) { alert('Please enter sales person name'); return; }
                setShowQuotation(true);
              }} className="px-8 py-3 text-white font-bold rounded-lg transition shadow-lg text-sm" style={{ background: 'var(--accent)' }}>
                {t('generateQuotation')}
              </button>
            )}
          </div>

          {/* ============ QUOTATION VIEW (print-ready) ============ */}
          {showQuotation && isQ && (() => {
            const activeBom = isUpgrade ? upgradeBom : bom;
            const today = new Date();
            const dateStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            const quoteNo = `GR-${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}-${String(Math.floor(Math.random()*9000)+1000)}`;
            const validTill = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            const sysLabel = isUpgrade
              ? `${t('upgrade')} ${upgradeBom.fromKw}kW → ${upgradeBom.toKw}kW`
              : `${isHyb ? t('hybrid') : t('onGrid')} ${parseFloat(size) || 3}kW`;
            const tierLabel = (isUpgrade ? upgradeTier : tier).charAt(0).toUpperCase() + (isUpgrade ? upgradeTier : tier).slice(1);
            const finalPrice = discountCalc.finalPrice || activeBom.customerPrice || activeBom.marketRate || 0;

            // Always show customer spec table in quotation (admin BOM is in admin panel)

            return (
              <div className="quotation-page bg-white border border-gray-300 rounded-lg shadow-xl mt-4">
                {/* Close + Print (no-print) */}
                <div className="flex items-center justify-between p-2 no-print">
                  <div className="flex gap-1">
                    <span className="px-3 py-1 rounded text-xs font-bold bg-gray-100 text-gray-600">
                      Customer Quotation — All Packages
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setShowQuotation(false)} className="px-3 py-1 bg-gray-200 text-gray-600 rounded text-xs font-bold hover:bg-gray-300">{t('closeQuotation')}</button>
                    <button onClick={() => window.print()} className="px-4 py-1 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700">{t('printSavePdf')}</button>
                  </div>
                </div>

                {/* Quotation Header */}
                <div className="px-8 pt-4 pb-4 border-b-4 border-amber-500">
                  <div className="flex justify-between items-start">
                    <div>
                      <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">{t('companyName')}</h1>
                      <p className="text-xs text-gray-500 mt-0.5">{t('companyLegal')}</p>
                      <p className="text-xs text-gray-500">{t('companyLocation')}</p>
                    </div>
                    <div className="text-right">
                      <h2 className="text-lg font-bold text-amber-700 uppercase tracking-wider">{t('quotation')}</h2>
                      <p className="text-xs text-gray-600 mt-1"><span className="font-semibold">{t('quoteNo')}</span> {quoteNo}</p>
                      <p className="text-xs text-gray-600"><span className="font-semibold">{t('date')}:</span> {dateStr}</p>
                      <p className="text-xs text-gray-600"><span className="font-semibold">{t('validTill')}:</span> {validTill}</p>
                    </div>
                  </div>
                </div>

                {/* Customer + System Info */}
                <div className="px-8 py-4 grid grid-cols-2 gap-6 border-b border-gray-200">
                  <div>
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('customerDetails')}</h3>
                    <p className="text-sm font-bold text-gray-900">{custName}</p>
                    <p className="text-xs text-gray-600">{custPhone}</p>
                    {custAddress && <p className="text-xs text-gray-600 mt-0.5">{custAddress}</p>}
                  </div>
                  <div className="text-right">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('systemSpecification')}</h3>
                    <p className="text-sm font-bold text-gray-900">{sysLabel}</p>
                    {isHyb && batConfig !== '0' && <p className="text-xs text-gray-600">{batConfig} {batConfig === '1' ? t('batteryIncluded') : t('batteriesIncluded')}</p>}
                    <p className="text-xs text-gray-500 mt-1">{t('sales')}: {salesPerson}</p>
                  </div>
                </div>

                {/* Package Comparison — Specification Table */}
                <div className="px-8 py-4">
                  {(() => {
                    if (isUpgrade) {
                      // Upgrade mode: single-tier spec table showing delta items
                      const upPrintProfKey = getProfileKey('ongrid', upgradeTier, '0');
                      const upPrintStructLabel = getProfileStructure(catalog, upPrintProfKey);
                      const upgradeSpec = buildUpgradeSpecTable(upgradeBom.lines, upgradeSections, upPrintStructLabel);
                      return (
                        <>
                          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">
                            Upgrade Specification — Additional Components ({upgradeTier.charAt(0).toUpperCase() + upgradeTier.slice(1)} Package)
                          </h3>
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="border-b-2 border-gray-300">
                                <th className="px-2 py-2 text-left text-gray-600 font-bold w-8">#</th>
                                <th className="px-2 py-2 text-left text-gray-600 font-bold">Particulars</th>
                                <th className="px-2 py-2 text-center text-gray-600 font-bold" style={{minWidth:'140px'}}>Specification</th>
                                <th className="px-2 py-2 text-center text-gray-600 font-bold" style={{minWidth:'100px'}}>Details</th>
                              </tr>
                            </thead>
                            <tbody>
                              {upgradeSpec.map((row, i) => (
                                <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-100`}>
                                  <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                                  <td className="px-2 py-1.5 text-gray-800 font-semibold">{row.label}</td>
                                  <td className="px-2 py-1.5 text-center text-gray-700 font-medium">{row.value}</td>
                                  <td className="px-2 py-1.5 text-center text-gray-500">{row.detail}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      );
                    }

                    // Standard mode: 3-tier package comparison
                    const tiers = ['base', 'value', 'premium'];
                    const tierLabels = { base: 'Base', value: 'Value', premium: 'Premium' };
                    const tierColors = { base: '#EA580C', value: '#059669', premium: '#7C3AED' };
                    const specTables = {};
                    for (const t of tiers) {
                      const tierBom = allTierBoms[t];
                      specTables[t] = tierBom?.lines ? buildSpecTable(tierBom.lines, sysType, batConfig, tierBom.customerGradeLabel || tierBom.defaultGradeLabel || 'GI') : [];
                    }
                    const specLabels = specTables.base.length > 0 ? specTables.base.map(r => r.label)
                      : specTables.value.length > 0 ? specTables.value.map(r => r.label) : [];

                    return (
                    <>
                      <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">System Specification — Package Comparison</h3>
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b-2 border-gray-300">
                            <th className="px-2 py-2 text-left text-gray-600 font-bold w-8">#</th>
                            <th className="px-2 py-2 text-left text-gray-600 font-bold" style={{minWidth:'120px'}}>Particulars</th>
                            {tiers.map(t => (
                              <th key={t} className="px-2 py-2 text-center font-bold text-white" style={{background: tierColors[t], minWidth:'100px'}}>
                                {tierLabels[t]}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {specLabels.map((label, i) => (
                            <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-100`}>
                              <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                              <td className="px-2 py-1.5 text-gray-800 font-semibold">{label}</td>
                              {tiers.map(t => {
                                const row = specTables[t]?.[i];
                                return (
                                  <td key={t} className="px-2 py-1.5 text-center text-gray-700">
                                    <div className="font-medium">{row?.value || '-'}</div>
                                    {row?.detail && row.detail !== '-' && row.detail !== '' && (
                                      <div className="text-[9px] text-gray-400">{row.detail}</div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          {/* Services row */}
                          <tr className="bg-amber-50 border-b border-amber-200">
                            <td colSpan={2} className="px-2 py-1.5 font-bold text-amber-800 text-xs uppercase tracking-wide">Services Included</td>
                            {tiers.map(t => (
                              <td key={t} className="px-2 py-1.5 text-center text-amber-700 text-[10px] font-semibold">Included</td>
                            ))}
                          </tr>
                          {['Installation & Commissioning', 'Net Metering Assistance', 'Testing & Commissioning', 'Documentation & Handover'].map((svc, i) => (
                            <tr key={`svc-${i}`} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-100`}>
                              <td className="px-2 py-1 text-gray-400">{specLabels.length + i + 1}</td>
                              <td className="px-2 py-1 text-gray-700 font-medium">{svc}</td>
                              {tiers.map(t => (
                                <td key={t} className="px-2 py-1 text-center text-green-600 text-[10px]">✓</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                    );
                  })()}
                </div>

                {/* Pricing Summary — All 3 Packages */}
                <div className="px-8 py-4 border-t border-gray-200">
                  {(() => {
                    const tiers = ['base', 'value', 'premium'];
                    const tierLabels = { base: 'Base', value: 'Value', premium: 'Premium' };
                    const tierColors = { base: '#EA580C', value: '#059669', premium: '#7C3AED' };
                    return (
                      <div className="grid grid-cols-3 gap-4">
                        {tiers.map(t => {
                          const tierBom = allTierBoms[t];
                          const tierDisc = allTierDiscounts[t] || {};
                          const price = tierDisc.finalPrice || tierBom?.customerPrice || tierBom?.marketRate || 0;
                          return (
                            <div key={t} className="rounded-lg p-3 text-center" style={{border: `2px solid ${tierColors[t]}`}}>
                              <div className="text-xs font-bold text-white px-3 py-1 rounded-full inline-block mb-2" style={{background: tierColors[t]}}>
                                {tierLabels[t]} Package
                              </div>
                              <div className="text-lg font-bold text-gray-900">{fmt(price)}</div>
                              {tierDisc.discountAmt > 0 && (
                                <div className="text-[10px] text-green-700 mt-0.5">
                                  {tierDisc.discountLabel}: -{fmt(tierDisc.discountAmt)}
                                </div>
                              )}
                              {subsidyType !== 'none' && tierDisc.subsidy > 0 && (
                                <>
                                  <div className="text-[10px] text-amber-700 mt-1">{tierDisc.subsidyLabel}</div>
                                  <div className="text-[10px] text-amber-700">-{fmt(tierDisc.subsidy)}</div>
                                  <div className="text-sm font-bold text-green-800 border-t border-green-200 mt-1 pt-1">
                                    You Pay: {fmt(tierDisc.priceAfterSubsidy)}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                                {/* Terms & Footer */}
                <div className="px-8 py-4 border-t border-gray-200 bg-gray-50">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('termsConditions')}</h3>
                  <div className="text-[10px] text-gray-500 leading-relaxed space-y-0.5">
                    <p>1. {t('term1')}</p>
                    <p>2. {t('term2')}</p>
                    <p>3. {t('term3')}</p>
                    <p>4. {t('term4')}</p>
                    <p>5. {t('term5')}</p>
                  </div>
                </div>

                {/* Signature area */}
                <div className="px-8 py-6 flex justify-between items-end">
                  <div className="text-center">
                    <div className="w-40 border-t border-gray-400 mt-8 pt-1">
                      <p className="text-xs text-gray-600">{t('customerSignature')}</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-gray-700">{salesPerson}</p>
                    <div className="w-40 border-t border-gray-400 mt-1 pt-1">
                      <p className="text-xs text-gray-600">{t('authorizedSignatory')}</p>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{t('companyName')}</p>
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}

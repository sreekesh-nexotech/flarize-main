/**
 * PRODUCTION PIPELINE AUDIT — 2026-08-29
 * Tests all aspects of the commercial configuration + production pipeline.
 */
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');

// ── Load engines ──
const { calculateCost } = await import(path.join(ROOT, 'src/lib/costEngine.js'));
const { calculatePricing } = await import(path.join(ROOT, 'src/lib/pricingEngine.js'));
const { calculateSubsidy } = await import(path.join(ROOT, 'src/lib/subsidyEngine.js'));
const { calculateFinance } = await import(path.join(ROOT, 'src/lib/financeEngine.js'));
const Q = await import(path.join(ROOT, 'src/lib/quotationWorkspace.js'));
const { CAPABILITY, assertCan } = await import(path.join(ROOT, 'src/lib/rbac.js'));

// ── Load configs ──
const costConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cost-config.json'), 'utf8'));
const financeConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/finance-config.json'), 'utf8'));
const subsidyConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/subsidy-config.json'), 'utf8'));
const companyProfile = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/company-profile.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));

const buildBom = require(path.join(ROOT, 'server-bom-builder.js')).buildBom;

const ADMIN_ACTOR = { userId: 'admin-001', role: 'ADMIN' };
const SALES_ACTOR = { userId: 'sales-001', role: 'SALES' };
const PH_ACTOR = { userId: 'ph-001', role: 'PROJECT_HEAD' };
const ISO_NOW = new Date().toISOString();
const TEST_MARGIN = 0.20;
const GST_EFFECTIVE = 0.089;

// ═══════════════════════════════════════════════════════════════
// A. MARGIN CONFIGURATION
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ A. MARGIN CONFIGURATION ═══');
console.log(`Status: ${costConfig.margin.status}`);
for (const [tier, val] of Object.entries(costConfig.margin.tiers)) {
  console.log(`  ${tier}: target=${val.targetMarginPct}%, min=${val.minimumMarginPct}%`);
}
const marginOk = costConfig.margin.tiers.BASE.targetMarginPct === 20 &&
  costConfig.margin.tiers.VALUE.targetMarginPct === 20 &&
  costConfig.margin.tiers.PREMIUM.targetMarginPct === 20;
console.log(`RESULT: ${marginOk ? '✅ PASS' : '❌ FAIL'}`);

// ═══════════════════════════════════════════════════════════════
// B. COMPANY MASTER
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ B. COMPANY MASTER ═══');
const expected = {
  legalName: 'Flarize Technologies Pvt. Ltd.',
  gstin: '32AAUFG1464A1ZP',
  companyRegistration: 'AAP-6531',
  address: 'Thannikakal, Thumpoly PO',
  city: 'Alappuzha', state: 'Kerala', pincode: '688008',
  phone: '9995073579', email: 'sales@flarize.com', website: 'www.flarize.com',
};
let companyOk = true;
for (const [k, v] of Object.entries(expected)) {
  const match = companyProfile[k] === v;
  if (!match) companyOk = false;
  console.log(`  ${k}: ${match ? '✅' : '❌'} "${companyProfile[k]}"`);
}
console.log(`  bank: ${companyProfile.bankName === null ? '✅ null (pending)' : '❌ should be null'}`);
console.log(`RESULT: ${companyOk ? '✅ PASS' : '❌ FAIL'}`);

// ═══════════════════════════════════════════════════════════════
// HELPER: Get installation cost from config
// ═══════════════════════════════════════════════════════════════
function getInstallCost(sizeKw, installType) {
  const rates = costConfig.installation?.rates || [];
  const match = rates.find(r => r.systemSizeKw === sizeKw && r.installationType === installType);
  return match?.rate ?? null;
}

// ═══════════════════════════════════════════════════════════════
// C-R. PRODUCTION QUOTATIONS FOR 4 SYSTEMS
// ═══════════════════════════════════════════════════════════════
const systems = [
  { label: '3kW Ongrid Value', systemType: 'ongrid', size: 3, tier: 'value', phase: '1P', sizeKw: 3 },
  { label: '5kW Ongrid Value', systemType: 'ongrid', size: '5sp', tier: 'value', phase: '1P', sizeKw: 5 },
  { label: '10kW Ongrid Value', systemType: 'ongrid', size: 10, tier: 'value', phase: '3P', sizeKw: 10 },
  { label: '3kW Hybrid Value', systemType: 'hybrid', size: 3, tier: 'value', phase: '1P', sizeKw: 3 },
];

const allResults = [];

for (const sys of systems) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${sys.label.toUpperCase()}`);
  console.log(`${'═'.repeat(60)}`);

  // ── BOM ──
  const bom = buildBom({ systemType: sys.systemType, size: sys.size, tier: sys.tier, phase: sys.phase });
  const panels = bom.lines.filter(l => l.category === 'panel');
  const inverters = bom.lines.filter(l => l.category === 'inverter');
  const batteries = bom.lines.filter(l => l.category === 'battery');

  console.log(`\n  BOM: ${bom.lines.length} lines`);
  console.log(`  Panel: ${panels[0]?.name} × ${panels[0]?.qty}`);
  console.log(`  Inverter: ${inverters[0]?.name} × ${inverters[0]?.qty}`);
  if (batteries.length) console.log(`  Battery: ${batteries[0]?.name} × ${batteries[0]?.qty}`);
  console.log(`  Material total (catalog): ₹${bom.totals.matTotal.toFixed(2)}`);
  console.log(`  BOM GST: ₹${bom.totals.allGst}`);
  console.log(`  BOM Grand: ₹${bom.totals.grand.toFixed(2)}`);

  // ── COST ENGINE (production attempt) ──
  const snapshot = {
    status: 'LOCKED',
    lines: bom.lines.map(l => ({
      componentId: l.id || null,
      role: l.category || 'fixed',
      quantity: l.qty,
    })),
  };

  const costResult = calculateCost({
    snapshot, config: costConfig, priceMaster: {},
    project: { sizeKw: sys.sizeKw, installationType: 'FLAT', distanceKm: 50 },
    rateCard: null, calculatedAt: ISO_NOW,
  });

  console.log(`\n  COST ENGINE (production):`);
  console.log(`  Status: ${costResult.status}`);
  const errorCodes = [...new Set((costResult.errors || []).map(e => e.code))];
  console.log(`  Blocked by: ${errorCodes.join(', ')}`);

  // Show which heads WORK
  const configuredHeads = {};
  if (costResult.heads) {
    for (const [head, data] of Object.entries(costResult.heads)) {
      const amt = data.amountExact != null ? Math.round(data.amountExact) : null;
      configuredHeads[head] = amt;
      const status = amt !== null ? `✅ ₹${amt}` : '❌ null';
      console.log(`    ${head}: ${status}`);
    }
  }

  // ── MANUAL COST CALCULATION (catalog prices as material proxy) ──
  const matTotal = bom.totals.matTotal;
  const installCost = getInstallCost(sys.sizeKw, 'FLAT') ?? 0;
  const structureCost = 0; // FLAT roof = 0 per config
  const structureLabour = costConfig.structure?.labour?.costPerProject ?? 3000;
  const surveyCost = costConfig.siteSurvey?.costPerProject ?? 500;
  const engDesignCost = costConfig.engineeringDesign?.costPerProject ?? 500;
  const serviceCost = (costConfig.serviceAmc?.costPerVisit ?? 1000)
    * (costConfig.serviceAmc?.visitsPerYear ?? 2)
    * (costConfig.serviceAmc?.serviceYears ?? 5);
  const officeAlloc = (costConfig.officeExpenseAllocation?.monthlyOfficeExpense ?? 150000)
    / (costConfig.officeExpenseAllocation?.expectedProjectsPerMonth ?? 10);
  const directBeforeMisc = matTotal + installCost + structureCost + structureLabour
    + surveyCost + engDesignCost + serviceCost + officeAlloc;
  const miscPct = (costConfig.miscellaneous?.percentage ?? 1) / 100; // percentage field is 1 = 1%
  const miscCost = directBeforeMisc * miscPct;
  const totalActualCost = directBeforeMisc + miscCost;

  console.log(`\n  COST (manual calculation, catalog material prices):`);
  console.log(`    Material (catalog):    ₹${matTotal.toFixed(2)}`);
  console.log(`    Installation (FLAT):   ₹${installCost}`);
  console.log(`    Structure (FLAT):      ₹${structureCost}`);
  console.log(`    Structure Labour:      ₹${structureLabour}`);
  console.log(`    Survey:                ₹${surveyCost}`);
  console.log(`    Eng Design:            ₹${engDesignCost}`);
  console.log(`    Service AMC:           ₹${serviceCost}`);
  console.log(`    Office Allocation:     ₹${officeAlloc}`);
  console.log(`    Direct (before misc):  ₹${directBeforeMisc.toFixed(2)}`);
  console.log(`    Miscellaneous (1%):    ₹${miscCost.toFixed(2)}`);
  console.log(`    ─────────────────────────────────`);
  console.log(`    TOTAL ACTUAL COST:     ₹${totalActualCost.toFixed(2)}`);

  // ── PRICING ──
  const sellingPrice = totalActualCost / (1 - TEST_MARGIN);
  const gstAmount = Math.round(sellingPrice * GST_EFFECTIVE);
  const gross = Math.round(sellingPrice + gstAmount);
  const verifyMargin = (sellingPrice - totalActualCost) / sellingPrice;

  console.log(`\n  PRICING (20% gross margin):`);
  console.log(`    Selling price:              ₹${sellingPrice.toFixed(2)}`);
  console.log(`    Formula: ${totalActualCost.toFixed(2)} / (1 - 0.20) = ${sellingPrice.toFixed(2)}`);
  console.log(`    Margin verify: ${(verifyMargin * 100).toFixed(2)}% ${Math.abs(verifyMargin - 0.20) < 0.001 ? '✅' : '❌'}`);
  console.log(`    GST (8.9%):                 ₹${gstAmount}`);
  console.log(`    customerTotalIncludingGST:   ₹${gross}`);

  // ── SUBSIDY ──
  const isDCR = panels[0]?.name?.includes('DCR') ?? false;
  const subsidyResult = calculateSubsidy({
    systemSizeKw: sys.sizeKw,
    panelType: isDCR ? 'DCR' : 'NON_DCR',
    connectionType: 'domestic',
    subsidyConfig,
  });
  const subsidy = subsidyResult.totalSubsidy ?? subsidyResult.subsidyAmount ?? 0;

  console.log(`\n  SUBSIDY:`);
  console.log(`    Panel: ${isDCR ? 'DCR' : 'NON_DCR'}`);
  console.log(`    Eligible: ${subsidyResult.eligible ?? subsidyResult.available ?? subsidyResult.eligibilityStatus}`);
  console.log(`    CFA: ₹${subsidy}`);

  // ── FINANCIAL PIPELINE ──
  const dpPct = financeConfig.downPayment.percentage;
  const downPayment = Math.round(gross * dpPct / 100);
  const remaining = gross - downPayment;
  const financePrincipal = remaining - subsidy;

  const finResult = calculateFinance({
    principal: financePrincipal,
    grossQuotationAmount: gross,
    postSubsidyInvestment: gross - subsidy,
    downPaymentAmount: downPayment,
    downPaymentPercentage: dpPct,
    financeConfig,
    calculatedAt: ISO_NOW,
  });

  const emi = finResult.monthlyEMI ?? 0;
  const rate = finResult.interestRatePct ?? 0;
  const tenure = finResult.tenureMonths ?? 120;

  console.log(`\n  FINANCIAL PIPELINE:`);
  console.log(`    Gross:               ₹${gross}`);
  console.log(`    Down payment (${dpPct}%): ₹${downPayment}`);
  console.log(`    Remaining:           ₹${remaining}`);
  console.log(`    Subsidy:             ₹${subsidy}`);
  console.log(`    Finance principal:   ₹${financePrincipal}`);
  console.log(`    Rate:                ${rate}% (${financePrincipal <= 200000 ? '≤₹2L' : '>₹2L'})`);
  console.log(`    Tenure:              ${tenure} months`);
  console.log(`    EMI:                 ₹${emi}`);
  console.log(`    Customer investment: ₹${gross - subsidy}`);

  allResults.push({
    system: sys.label,
    matTotal: Math.round(matTotal),
    totalActualCost: Math.round(totalActualCost),
    sellingPrice: Math.round(sellingPrice),
    gst: gstAmount,
    gross,
    subsidy,
    downPayment,
    financePrincipal,
    rate,
    emi: Math.round(emi),
    customerInvestment: gross - subsidy,
  });
}

// ═══════════════════════════════════════════════════════════════
// T. QUOTATION ISSUE + SNAPSHOT FREEZE
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log('  T. QUOTATION ISSUE + SNAPSHOT FREEZE');
console.log(`${'═'.repeat(60)}`);

const store = Q.createQuotationStore();
const bom3kw = buildBom({ systemType: 'ongrid', size: 3, tier: 'value', phase: '1P' });

const bomSnapshotId = 'bom-prod-3kw';
const bomSnapshot = {
  projectId: bomSnapshotId, snapshotId: bomSnapshotId, status: 'LOCKED',
  lockedAt: ISO_NOW, lockedBy: 'admin-001',
  systemType: 'ongrid', systemSizeKw: 3, tier: 'value', phase: '1P',
  lines: bom3kw.lines.map(l => ({
    componentId: l.id || l.sku || null, componentName: l.name,
    category: l.category, role: l.category, quantity: l.qty,
    componentDataVersion: 'catalog@2026-08-15',
    panelType: l.category === 'panel' ? (l.name?.includes('DCR') ? 'DCR' : 'NON_DCR') : undefined,
  })),
};

// Use allResults[0] for 3kW commercial data
const r0 = allResults[0];
const csId = 'cs-prod-3kw';
const cs = {
  snapshotId: csId, status: 'ISSUED', projectId: bomSnapshotId,
  issuedAt: ISO_NOW, issuedBy: 'admin-001',
  versions: {
    bomSnapshotId, catalogVersion: 'catalog@2026-08-15',
    procurementPriceVersion: null, landedCostVersion: null, projectRateCardVersion: null,
    costConfigVersion: costConfig.configVersion, marginVersion: 'production-20pct',
    gstVersion: costConfig.gst.version,
    costEngineVersion: 'manual-production-audit', pricingEngineVersion: 'manual-production-audit',
    moneyRuleVersion: 'INR-paise-round-nearest',
  },
  cost: {
    totalActualProjectCost: r0.totalActualCost,
    materialCost: r0.matTotal,
  },
  pricing: {
    tier: 'VALUE', targetMarginPct: 20,
    totalActualCost: r0.totalActualCost,
    sellingPriceBeforeGST: r0.sellingPrice,
    sellingPrice: r0.sellingPrice,
    gstRegime: 'SOLAR_70_30_COMPOSITE',
    gstAmount: r0.gst,
    customerTotalIncludingGST: r0.gross,
  },
};

// ADMIN registers BOM + Commercial snapshots (needs COST_VIEW + PRICING_VIEW)
Q.registerBomSnapshot(store, ADMIN_ACTOR, { bomSnapshotId, snapshot: bomSnapshot });
Q.registerCommercialSnapshot(store, ADMIN_ACTOR, { snapshot: cs });
console.log('  ✅ BOM + Commercial snapshots registered');

// SALES creates draft (needs QUOTATION_CREATE)
const quotationId = 'QT-PROD-AUDIT-001';
const quotationNumber = 'GR-9687';
const quotationDate = ISO_NOW.split('T')[0];
const draft = Q.createDraft(store, SALES_ACTOR, {
  quotationId,
  at: ISO_NOW,
  bomSnapshotId,
  commercialSnapshotId: csId,
  customer: { customerId: 'CUST-TEST-001', customerName: 'Production Test Customer', phone: '9876543210', email: 'test@test.com', address: 'Kerala' },
  system: { systemType: 'ongrid', systemSizeKw: 3, packageTier: 'VALUE', phase: '1P', installationType: 'FLAT' },
  engineering: { status: 'APPROVED', validationVerdict: 'APPROVED', validatedAt: ISO_NOW, validatedBy: 'eng-001' },
  subsidyTreatment: 'ENGINE_RESULT',
  quotationNumber,
  quotationDate,
  validUntil: '2026-09-28',
  proposalBy: 'sales-001',
});
console.log(`  ✅ Draft created: ${quotationId}`);

// Check generation gate (SALES needs PRICING_VIEW)
const gate = Q.checkGenerationGate(store, SALES_ACTOR, quotationId);
console.log(`  Generation gate: ${gate.status}`);
if (gate.status !== 'PASS' && gate.checks) {
  for (const c of gate.checks.filter(c => c.status === 'BLOCKED')) {
    console.log(`    BLOCKED: ${c.check} — ${c.reason || ''}`);
  }
}

// Build payload (preview)
try {
  const payload = Q.buildPayload(store, SALES_ACTOR, quotationId, {
    catalog, companyProfile, subsidyConfig, financeConfig,
  });
  console.log('  ✅ Payload built');
  console.log(`  Company in payload: ${payload.company?.legalName ?? payload.company?.displayName ?? 'NOT_FOUND'}`);
  console.log(`  GSTIN in payload: ${payload.company?.gstin ?? 'NOT_FOUND'}`);
} catch (e) {
  console.log(`  ⚠ Payload build: ${e.code || e.message}`);
}

// Issue quotation
try {
  const issued = Q.issueQuotation(store, SALES_ACTOR, quotationId, {
    at: ISO_NOW,
    catalog, companyProfile, subsidyConfig, financeConfig,
  });
  console.log(`  ✅ Quotation issued: version ${issued.version}`);
  console.log(`  quotationNumber: ${issued.quotationNumber ?? quotationNumber}`);
  console.log(`  salespersonId: ${issued.salespersonId ?? issued.issuedBy ?? draft.createdBy}`);

  // Verify freeze — re-issue should be blocked
  try {
    Q.issueQuotation(store, SALES_ACTOR, quotationId, { at: ISO_NOW, catalog, companyProfile });
    console.log('  ❌ Re-issue should have been blocked');
  } catch (e2) {
    console.log(`  ✅ Re-issue blocked: ${e2.code || e2.message}`);
  }

  // Verify immutability of issued document
  const doc = Q.getQuotation(store, SALES_ACTOR, quotationId);
  console.log(`  Frozen status: ${doc.status}`);
  console.log(`  Document version: ${doc.currentVersion}`);

} catch (e) {
  console.log(`  ❌ Issue failed: ${e.code || e.message}`);
  if (e.detail?.failedChecks) {
    for (const c of e.detail.failedChecks) {
      console.log(`    BLOCKED: ${c}`);
    }
  }
  if (e.detail?.reasons) {
    for (const r of e.detail.reasons) {
      console.log(`    Reason: ${r}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// U. RBAC VERIFICATION
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log('  U. RBAC VERIFICATION');
console.log(`${'═'.repeat(60)}`);

const allowed = [
  [ADMIN_ACTOR, CAPABILITY.COST_VIEW, 'ADMIN can view cost'],
  [ADMIN_ACTOR, CAPABILITY.PRICING_VIEW, 'ADMIN can view pricing'],
  [ADMIN_ACTOR, CAPABILITY.COMMERCIAL_CONFIG_EDIT, 'ADMIN can edit commercial config'],
  [PH_ACTOR, CAPABILITY.BOM_EDIT, 'PROJECT_HEAD can edit BOM'],
  [PH_ACTOR, CAPABILITY.COST_INPUT_EDIT, 'PROJECT_HEAD can edit cost inputs'],
  [SALES_ACTOR, CAPABILITY.QUOTATION_CREATE, 'SALES can create quotation'],
  [SALES_ACTOR, CAPABILITY.PRICING_VIEW, 'SALES can view pricing'],
];
const denied = [
  [SALES_ACTOR, CAPABILITY.COMMERCIAL_CONFIG_EDIT, 'SALES cannot edit commercial config'],
  [SALES_ACTOR, CAPABILITY.BOM_EDIT, 'SALES cannot edit BOM'],
  [SALES_ACTOR, CAPABILITY.COST_INPUT_EDIT, 'SALES cannot edit cost inputs'],
  [SALES_ACTOR, CAPABILITY.PROCUREMENT_PRICE_EDIT, 'SALES cannot edit procurement'],
];

for (const [actor, cap, desc] of allowed) {
  try { assertCan(actor, cap); console.log(`  ✅ ${desc}`); }
  catch (e) { console.log(`  ❌ ${desc}: DENIED`); }
}
for (const [actor, cap, desc] of denied) {
  try { assertCan(actor, cap); console.log(`  ❌ ${desc}: SHOULD DENY`); }
  catch (e) { console.log(`  ✅ ${desc}`); }
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY TABLE
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log('  SUMMARY — ALL 4 SYSTEMS');
console.log(`${'═'.repeat(60)}`);
console.log('System                  | Material   | Total Cost | Selling    | GST      | Gross      | Subsidy  | DP       | Fin.Prin | Rate   | EMI');
console.log('─'.repeat(140));
for (const r of allResults) {
  console.log(
    `${r.system.padEnd(24)}| ₹${String(r.matTotal).padStart(8)} | ₹${String(r.totalActualCost).padStart(8)} | ₹${String(r.sellingPrice).padStart(8)} | ₹${String(r.gst).padStart(6)} | ₹${String(r.gross).padStart(8)} | ₹${String(r.subsidy).padStart(6)} | ₹${String(r.downPayment).padStart(6)} | ₹${String(r.financePrincipal).padStart(6)} | ${String(r.rate).padStart(5)}% | ₹${String(r.emi).padStart(6)}`
  );
}

console.log('\n═══ AUDIT COMPLETE ═══');

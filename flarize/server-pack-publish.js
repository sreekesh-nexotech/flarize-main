// PACK PUBLISH — turns the APPROVED pack configuration into approved registry
// packages (2026-09-08 fast-quotation build).
//
// The registry (data/packages.proposed.json) stays the approval / version
// record the orchestrator, checker, workspace and quotation already consume.
// Publishing = for every (systemType × size × tier [× future-ready pair]) in
// the approved templates: materialise the variable slots with the BOM builder,
// compare with the current APPROVED package for that combo, and when anything
// changed create a revision (or a new package for a new kW / FR pack), run the
// engineering checker at TEMPLATE scope, submit and approve it — superseding
// the prior revision. BLOCKED combos are reported, never published.
//
// Authoring steps run as a system PROJECT_HEAD actor (PACK_PUBLISH); the
// approval step runs as the Admin who approved the configuration.

const fs = require('fs');
const path = require('path');
const bomBuilder = require('./server-bom-builder.js');

const REGISTRY_FILE = path.join(__dirname, 'data', 'packages.proposed.json');
let PA = null, PROJ = null;

function loadJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fb; } }
function loadRegistry() { const raw = loadJson(REGISTRY_FILE, { packages: [] }); return PROJ ? PROJ.hydrateRegistry(raw) : raw; }
function persistRegistry(reg) { fs.writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2), 'utf-8'); }

async function init() {
  PA = await import('./src/lib/packageApproval.js');
  PROJ = await import('./src/lib/packageProjection.js');
}

const SYSTEM_ACTOR = Object.freeze({ userId: 'PACK_PUBLISH', role: 'PROJECT_HEAD' });

/**
 * Registry components from a materialised BOM: every catalog-identified line
 * (variable slots AND the engineering accessories the template adds for the
 * architecture — Enphase micro-inverters / system controller / UG cable on
 * Premium). Consumables (`fixed`, no catalog identity) and roof structure are
 * project-level material and stay out of the registry package.
 */
function componentsFromBom(bom) {
  return (bom.lines || [])
    .filter(l => l.componentId && l.category !== 'fixed' && !l.isStructure)
    .map(l => ({
      role: l.category,
      componentId: l.componentId,
      quantity: l.qty,
      approvedAlternates: l.isVariable && Array.isArray(l.alternatives) ? l.alternatives : [],
      salesSwap: l.isVariable && l.salesSwap === true,
      quantityRule: l.category === 'panel' ? 'ceil(sizeKw*1000 / panel.watt)' : (l.category === 'enphase' && l.selectionMethod === 'DEVICE_ALLOCATED') ? 'allocate(panels / panelsPerDevice)' : `template:${l.qty}`,
      selectionMethod: l.selectionMethod,
      derivedBy: l.selectionMethod === 'PACK_CONFIG_DEFAULT' ? 'explicit' : (l.isVariable ? 'template' : 'architecture'),
    }));
}

function sameComponents(a, b) {
  const norm = (cs) => JSON.stringify((cs || []).map(c => ({ r: c.role, c: c.componentId, q: c.quantity, a: [...(c.approvedAlternates || [])].sort(), s: c.salesSwap === true })).sort((x, y) => x.r.localeCompare(y.r)));
  return norm(a) === norm(b);
}

/**
 * @param {object} p
 * @param {object} [p.registry]  in-memory registry to publish into (tests / dry runs); default = data/packages.proposed.json
 * @param {boolean} [p.persist]  write the registry back to disk (default true; ignored when `registry` is supplied unless explicitly true)
 * @returns {{ configVersion, published: [], unchanged: [], blocked: [], errors: [] }}
 */
async function publishApprovedPacks({ actor, at, env, config, configVersion, registry: injected = null, persist = injected ? false : true }) {
  if (!PA) await init();
  if (!at) throw Object.assign(new Error('Timestamp (at) is required.'), { code: 'MISSING_TIMESTAMP' });
  const registry = injected ? (PROJ ? PROJ.hydrateRegistry(injected) : injected) : loadRegistry();
  const report = { configVersion, at, publishedBy: actor?.userId ?? null, published: [], unchanged: [], blocked: [], errors: [] };
  const catalog = env?.catalog || bomBuilder.loadCatalog('approved');
  const checkerEnv = { catalog, batteryMaster: env?.batteryMaster || {}, catalogVersion: env?.catalogVersion ?? null };

  const templates = config?.bomTemplates || {};
  const pairs = config?.futureUpgrade?.pairs || [];

  for (const [systemType, t] of Object.entries(templates)) {
    if (systemType === 'upgrade') continue;                 // upgrade product has its own model
    const tiers = t.tiers || ['base', 'value', 'premium'];
    for (const size of Object.keys(t.sizes || {})) {
      const phase = (t.threePhase || []).includes(size) ? '3P' : '1P';
      const variants = [{ variant: 'STANDARD', systemSize: size }];
      for (const p of pairs) {
        if ((p.systemType || systemType) !== systemType || String(p.panelSize) !== String(size)) continue;
        if (!t.sizes[String(p.systemSize)]) continue;
        if (((t.threePhase || []).includes(String(p.systemSize)) ? '3P' : '1P') !== phase) continue;
        variants.push({ variant: 'FUTURE_READY', systemSize: String(p.systemSize) });
      }
      for (const tier of tiers) {
        for (const v of variants) {
          const combo = PA.comboKeyFor({ systemType, size, phase, tier, variant: v.variant, systemSize: v.systemSize });
          const label = `${combo}`;
          let draftId = null;
          try {
            const bom = bomBuilder.buildBom({
              systemType, size, tier, phase, configSource: 'approved',
              futureSystemSize: v.variant === 'FUTURE_READY' ? v.systemSize : null,
              actorRole: 'PROJECT_HEAD',
            });
            const components = componentsFromBom(bom);
            if (!components.length) { report.errors.push({ combo, error: 'template resolved to no components' }); continue; }

            const current = (registry.packages || []).find(p => (p.comboKey ?? PA.comboKeyFor(p)) === combo && p.packageState === 'APPROVED' && !p.supersededBy);
            if (current && sameComponents(current.components, components) && (current.publishedFromConfigVersion ?? null) != null) {
              report.unchanged.push({ combo, packageId: current.packageId });
              continue;
            }

            // Author the new revision / package as the system PH actor.
            draftId = null;
            if (current) {
              const rev = PA.createRevision(registry, { actor: SYSTEM_ACTOR, sourcePackageId: current.packageId, at });
              draftId = rev.packageId;
              PA.editPackage(registry, { actor: SYSTEM_ACTOR, packageId: draftId, patch: { components }, at });
            } else {
              const arch = PA.resolvePackageArchitecture({ architecture: null, profileKey: bom.systemConfig?.profileKey }, catalog).architecture;
              if (!arch) { report.errors.push({ combo, error: `architecture unresolved for profile ${bom.systemConfig?.profileKey}` }); continue; }
              const created = PA.createPackage(registry, { actor: SYSTEM_ACTOR, at, template: {
                systemType, size, phase, tier, architecture: arch, profileKey: bom.systemConfig?.profileKey,
                variant: v.variant, systemSize: v.systemSize, components,
              } });
              draftId = created.packageId;
            }
            const pkg = (registry.packages || []).find(p => p.packageId === draftId);
            pkg.variant = v.variant; pkg.systemSize = v.systemSize; pkg.comboKey = combo;
            pkg.publishedFromConfigVersion = configVersion; pkg.publishSource = 'PACK_CONFIG';

            const validation = PA.runPackageChecker(registry, checkerEnv, { actor: SYSTEM_ACTOR, packageId: draftId, at });
            if (validation.status === 'BLOCKED') {
              PA.archivePackage(registry, { actor: SYSTEM_ACTOR, packageId: draftId, at, reason: `publish v${configVersion}: BLOCKED by engineering checker` });
              report.blocked.push({ combo, packageId: draftId, findings: (validation.findings || []).filter(f => f.severity === 'BLOCKED').map(f => ({ ruleId: f.ruleId, message: f.message })) });
              continue;
            }
            PA.submitPackage(registry, { actor: SYSTEM_ACTOR, packageId: draftId, at, acknowledgeWarnings: true });
            PA.approvePackage(registry, { actor, packageId: draftId, at, catalog, acknowledgeWarnings: true, notes: `Published from pack config v${configVersion}` });
            report.published.push({ combo, packageId: draftId, supersedes: current?.packageId ?? null, validation: validation.status, components: components.length });
          } catch (e) {
            report.errors.push({ combo: label, error: e.message, code: e.code ?? null });
            // Never leave a half-published DRAFT behind.
            if (draftId) { try { PA.archivePackage(registry, { actor: SYSTEM_ACTOR, packageId: draftId, at, reason: `publish v${configVersion} failed: ${e.code || e.message}` }); } catch { /* already archived / approved */ } }
          }
        }
      }
    }
  }
  if (persist) persistRegistry(registry);
  // In-memory callers (tests, dry runs) get the resulting registry back via a
  // non-enumerable property so HTTP responses never carry the whole registry.
  Object.defineProperty(report, 'registry', { value: registry, enumerable: false });
  return report;
}

module.exports = { init, publishApprovedPacks, componentsFromBom };

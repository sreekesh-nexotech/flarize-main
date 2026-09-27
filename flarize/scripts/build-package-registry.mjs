/**
 * PROPOSED PACKAGE REGISTRY.  (Phase 1B — R1 / C23)
 *
 * Emits explicit componentIds per package/role, derived from what the engine
 * currently resolves (componentId-based, never display names).
 *
 * ⚠️ EVERY RECORD IS `approvalStatus: "PROPOSED"`.
 * A proposal is NOT an approval. Today's values are what the FALLBACK produced —
 * `available[0]` and nearest-kW. Pinning them without Engineering review would
 * silently promote an accident into an approved engineering decision.
 *
 * Engineering must review each row and set `approvalStatus: "APPROVED"`.
 * The registry is NOT wired into the BOM engine (decision C23).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const matrix = JSON.parse(readFileSync('docs/phase1/package-resolution-matrix.json', 'utf8'));

/**
 * Phase 1C: only the explicitly APPROVED engineering decisions become APPROVED
 * package rules. The remaining fallback-derived resolutions stay PROPOSED.
 */
const APPROVED_RULES = [
  { role: 'isolator', componentId: 'is1', when: p => p.phase === '1P',
    decision: 'D11-A', note: 'Honey Well 2P 40A approved for Base/Value/Premium 1P.' },
  { role: 'isolator', componentId: 'is2', when: p => p.phase === '3P',
    decision: 'D11-B', note: 'L&T 40A 4P approved for Base/Value/Premium 3P.' },
  { role: 'battery', componentId: 'bt2', when: p => p.systemType === 'hybrid' && p.tier === 'premium',
    decision: 'D12', note: 'Enphase FlexPhase battery x1 for 3/5/8/10 kW premium hybrid.' },
];
const PROHIBITED_PREMIUM = ['mb1', '25mm Battery Cable'];

const packages = matrix.packages.map(p => ({
  packageId: p.packageId,
  systemType: p.systemType,
  size: p.size,
  phase: p.phase,
  tier: p.tier,
  profileKey: p.profileKey,
  upgradePathId: p.upgradePathId || null,
  fromSize: p.fromSize ?? null,
  toSize: p.toSize ?? null,
  approvalStatus: 'PROPOSED',
  approvedBy: null,
  approvedAt: null,
  engineeringStatus: p.engineeringStatus,
  blockers: p.blocked,
  approvedRules: APPROVED_RULES.filter(r => r.when(p)).map(r => ({ ...r, when: undefined })),
  prohibited: (p.systemType === 'hybrid' && p.tier === 'premium') ? PROHIBITED_PREMIUM : [],
  components: p.components.map(c => ({
    approvalStatus: APPROVED_RULES.some(r => r.when(p) && r.role === c.role && r.componentId === c.componentId)
      ? 'APPROVED' : 'PROPOSED',
    approvedByDecision: (APPROVED_RULES.find(r => r.when(p) && r.role === c.role && r.componentId === c.componentId) || {}).decision || null,
    role: c.role,
    componentId: c.componentId,
    componentName: c.name,          // reference only — NEVER used for identity
    quantity: c.quantity,
    quantityRule: c.quantityRule,
    required: c.required,
    approvedAlternates: c.approvedAlternates,
    derivedBy: c.resolution,        // 'explicit' | 'fallback:*'  <- provenance
    componentStatus: c.status,
  })),
}));

const out = {
  schema: 'flarize.package-registry/1',
  generatedAtUtc: new Date().toISOString(),
  note: 'MIXED. Components carrying approvalStatus APPROVED are backed by an explicit engineering decision (D11/D12). ' +
        'All others remain PROPOSED and derived from current fallback behaviour. ' +
        'Engineering approval required before any record is treated as authoritative. ' +
        'Not wired into the BOM engine (decision C23).',
  counts: {
    packages: packages.length,
    packagesFullyApproved: 0,
    componentsApproved: packages.reduce((s, p) => s + p.components.filter(c => c.approvalStatus === 'APPROVED').length, 0),
    componentsProposed: packages.reduce((s, p) => s + p.components.filter(c => c.approvalStatus !== 'APPROVED').length, 0),
    componentsPinned: packages.reduce((s, p) => s + p.components.filter(c => c.componentId).length, 0),
    componentsFromFallback: packages.reduce((s, p) => s + p.components.filter(c => c.derivedBy.startsWith('fallback')).length, 0),
    packagesBlocked: packages.filter(p => p.engineeringStatus === 'BLOCKED').length,
  },
  packages,
};

writeFileSync('data/packages.proposed.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.counts, null, 2));

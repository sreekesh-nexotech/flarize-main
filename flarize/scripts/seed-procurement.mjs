#!/usr/bin/env node
/**
 * Seed procurement prices for all catalog materials.
 * Populates the price master so the Cost Engine can run and Sales can generate quotations.
 */

const BASE = 'http://localhost:4800';

async function api(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  const d = await r.json();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${d.error || JSON.stringify(d)}`);
  return d;
}

const PRICE_MAP = {
  panel: 8500, inverter: 25000, battery: 45000, mccb_box: 3500,
  battery_cable: 250, isolator: 1200, acdb: 3500, dcdb: 2800,
  change_over: 2200, meter: 1500, ac_cable: 85, dc_cable: 65,
  ug_cable: 120, armoured_cable: 180, earth_cable: 45, cb_rod: 800,
  la_cable: 350, structure_material: 4500, enphase: 15000,
};

async function main() {
  const { token: pToken } = await api('POST', '/api/auth/login', { username: 'procurement1', password: 'proc123' });
  console.log('Logged in as procurement1');

  const matResp = await api('GET', '/api/procurement/materials', null, pToken);
  const materials = matResp.materials || matResp;
  console.log(`Materials: ${materials.length}`);

  // Create batch with batchReference
  const batchId = 'BATCH-SEED-004';
  try {
    await api('POST', '/api/procurement/batches', {
      batchId, supplierId: 'SUP001', batchReference: 'PO-2026-SEED-001',
      batchDate: '2026-08-30', at: '2026-08-30T12:00:00Z',
    }, pToken);
    console.log(`Batch ${batchId} created`);
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log(`Batch ${batchId} exists, reusing`);
    } else throw e;
  }

  // Build lines
  const lines = materials.map(m => {
    const basePrice = PRICE_MAP[m.category] || 1000;
    const hash = [...(m.componentId || '')].reduce((a, c) => a + c.charCodeAt(0), 0);
    const variation = 0.8 + (hash % 40) / 100;
    return {
      componentId: m.componentId,
      purchaseUnitPrice: Math.round(basePrice * variation),
      quantity: 100,
    };
  });

  await api('PUT', `/api/procurement/batches/${batchId}/lines`, { lines, at: '2026-08-30T12:00:00Z' }, pToken);
  console.log(`${lines.length} lines set`);

  // Set charges
  await api('PUT', `/api/procurement/batches/${batchId}/charges`, {
    deliveryCost: 15000, otherChargesDeclared: 0,
    allocationMethod: 'PURCHASE_VALUE_PROPORTION',
    at: '2026-08-30T12:00:00Z',
  }, pToken);
  console.log('Charges set');

  // Commit
  const result = await api('POST', `/api/procurement/batches/${batchId}/commit`, {
    at: '2026-08-30T12:00:00Z', effectiveFrom: '2026-08-30',
    changeReason: 'Initial procurement price seeding for all catalog materials',
  }, pToken);
  console.log('Committed:', JSON.stringify(result).slice(0, 400));

  // Verify
  const { token: sToken } = await api('POST', '/api/auth/login', { username: 'sales1', password: 'sales123' });
  const pf = await api('GET', '/api/sales/preflight?systemType=ongrid&size=3&tier=base', null, sToken);
  console.log('\nPreflight ongrid/3/base:', JSON.stringify(pf));
}

main().catch(e => { console.error(e.message); process.exit(1); });

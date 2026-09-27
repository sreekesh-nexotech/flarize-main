#!/usr/bin/env node
/**
 * Plant the approved template v1 offer page (Onam Solar Fest 2026) as an OFF
 * campaign in the CMS store, so Admin → Quotation content shows the original
 * design pre-filled and only has to review the period / slots and switch it ON.
 *
 * Content: public/assets/quotation/approved-offer-campaign.json (owner artwork
 * values — nothing invented). Idempotent: skipped when a campaign with the
 * same name already exists.
 *
 *   node scripts/seed-approved-offer-campaign.mjs            # data/cms-state.json
 *   node scripts/seed-approved-offer-campaign.mjs /path/data # another data dir
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCmsStore, createCampaign, updateCampaign } from '../src/lib/cmsStore.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const dataDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'data');
const stateFile = path.join(dataDir, 'cms-state.json');
const seed = JSON.parse(fs.readFileSync(path.join(root, 'public', 'assets', 'quotation', 'approved-offer-campaign.json'), 'utf8'));
const { _note, ...content } = seed;

let store;
try { store = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { store = createCmsStore(); }
store.campaigns = store.campaigns || {};
const existing = Object.values(store.campaigns).find(c => c.name === content.name && c.status !== 'ARCHIVED');
if (existing) { console.log(`skip: "${content.name}" already present (${existing.campaignId}, ${existing.status})`); process.exit(0); }

const c = createCampaign(store, { name: content.name, createdBy: 'SEED_APPROVED_TEMPLATE_V1' });
updateCampaign(store, c.campaignId, content); // status stays DRAFT (= OFF) until Admin switches it ON
fs.writeFileSync(stateFile, JSON.stringify(store, null, 2) + '\n');
console.log(`seeded "${content.name}" as ${c.campaignId} (OFF) in ${stateFile}`);

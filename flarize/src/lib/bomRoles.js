/**
 * CANONICAL BOM ROLE TAXONOMY.  (Phase 1C — decision C32, approved)
 *
 * V1 role set as approved by Engineering. DC_ISOLATOR is deliberately NOT a
 * V1 role (decision D11-C): V1 does not model a separate DC isolator as an
 * independent BOM line. Approved V1 architecture:
 *
 *   PV -> DCDB -> inverter -> ACDB -> AC isolator -> solar meter / grid
 *
 * DCDB and ACDB are independent BOM assemblies. The AC isolator is NOT a
 * substitute for either.
 *
 * Mapping only. This module selects nothing, prices nothing, validates nothing.
 */

export const ROLES = {
  PANEL: 'PANEL',
  INVERTER: 'INVERTER',
  MICRO_INVERTER: 'MICRO_INVERTER',
  BATTERY: 'BATTERY',
  BATTERY_PROTECTION: 'BATTERY_PROTECTION',
  BATTERY_CABLE: 'BATTERY_CABLE',
  AC_ISOLATOR: 'AC_ISOLATOR',
  ACDB: 'ACDB',
  DCDB: 'DCDB',
  STRUCTURE: 'STRUCTURE',
  CHANGEOVER: 'CHANGEOVER',
  MONITORING: 'MONITORING',
  PROTECTION: 'PROTECTION',
  EARTHING: 'EARTHING',
  AC_CABLE: 'AC_CABLE',
  DC_CABLE: 'DC_CABLE',
  ENERGY_SYSTEM_CONTROLLER: 'ENERGY_SYSTEM_CONTROLLER',
  ENPHASE_COMMUNICATION: 'ENPHASE_COMMUNICATION',
  METER: 'METER',
  OTHER: 'OTHER',
};

/** DC_ISOLATOR is intentionally absent for V1 — decision D11-C. */
export const NOT_MODELLED_IN_V1 = ['DC_ISOLATOR'];

/** Engine slot category -> canonical role. Unambiguous mappings only. */
export const CATEGORY_TO_ROLE = {
  panel: ROLES.PANEL,
  inverter: ROLES.INVERTER,
  battery: ROLES.BATTERY,
  mccb_box: ROLES.BATTERY_PROTECTION,
  battery_cable: ROLES.BATTERY_CABLE,
  isolator: ROLES.AC_ISOLATOR,          // D11-C: the only isolator role in V1
  acdb: ROLES.ACDB,
  dcdb: ROLES.DCDB,
  change_over: ROLES.CHANGEOVER,
  meter: ROLES.METER,
  ac_cable: ROLES.AC_CABLE,
  dc_cable: ROLES.DC_CABLE,
  ug_cable: ROLES.AC_CABLE,
  armoured_cable: ROLES.AC_CABLE,
  earth_cable: ROLES.EARTHING,
  cb_rod: ROLES.EARTHING,
  la_cable: ROLES.PROTECTION,
  structure_material: ROLES.STRUCTURE,
};

/**
 * Enphase catalog rows carry mixed roles inside one `enphase` category.
 * Mapped by explicit componentId — never by display-name matching.
 * Ids verified against data/catalog.json.
 */
export const ENPHASE_COMPONENT_ROLES = {
  en1: ROLES.MICRO_INVERTER,              // IQ8P Micro Inverter
  en2: ROLES.AC_CABLE,                    // Q Cable Portrait 2m
  en3: ROLES.MONITORING,                  // Envoy S Metered        (PENDING)
  en4: ROLES.PROTECTION,                  // Q Relay                (PENDING)
  en5: ROLES.AC_CABLE,                    // Q Terminal
  en6: ROLES.MONITORING,                  // CT 200                 (PENDING)
  en7: ROLES.ENERGY_SYSTEM_CONTROLLER,    // System Controller      (duplicate identity)
  en_sysctrl: ROLES.ENERGY_SYSTEM_CONTROLLER, // System Controller with Cable
  en_flexbat: ROLES.BATTERY,              // alias of canonical bt2 — not emitted
};

/**
 * Uncategorised `fixedItems` whose physical identity is unambiguous.
 * Everything else stays OTHER — decision: do not force a role onto an item
 * whose identity is not certain.
 */
export const FIXED_ITEM_NAME_TO_ROLE = {
  '25mm Battery Cable': ROLES.BATTERY_CABLE,
  '40A Change Over Switch': ROLES.CHANGEOVER,
};

/** Roles required for a Premium (Enphase) hybrid system — decision D12. */
export const PREMIUM_HYBRID_REQUIRED_ROLES = [
  ROLES.PANEL, ROLES.MICRO_INVERTER, ROLES.BATTERY, ROLES.ENERGY_SYSTEM_CONTROLLER,
];

/** Roles PROHIBITED on a Premium (Enphase) hybrid system — decision D12. */
export const PREMIUM_HYBRID_PROHIBITED = {
  mb1: 'Generic 160A MCCB is a Deye/SEG DC-coupled device. Prohibited on Enphase architecture (D12).',
  '25mm Battery Cable': 'Generic DC battery cable is Deye/SEG-specific. Prohibited on Enphase architecture (D12).',
};

/** Resolve the canonical role for a BOM line. Identity first, name last. */
export function roleForLine(line) {
  if (!line) return ROLES.OTHER;
  const id = line.itemId || line.catalogItemId;
  if (id && ENPHASE_COMPONENT_ROLES[id]) return ENPHASE_COMPONENT_ROLES[id];
  if (line.category && CATEGORY_TO_ROLE[line.category]) return CATEGORY_TO_ROLE[line.category];
  if (line.isStructure) return ROLES.STRUCTURE;
  const nm = (line.name || '').trim();
  if (FIXED_ITEM_NAME_TO_ROLE[nm]) return FIXED_ITEM_NAME_TO_ROLE[nm];
  return ROLES.OTHER;
}

/** Components whose configuration is not yet confirmed — decision D12, PENDING. */
export const PENDING_CONFIGURATION_CONFIRMATION = {
  en3: 'Envoy S Metered — may be integrated into the IQ System Controller. Supplied configuration unconfirmed.',
  en4: 'IQ Relay — may be integrated into the IQ System Controller. Supplied configuration unconfirmed.',
  en6: 'CT 200 — quantity and necessity unconfirmed against the supplied configuration.',
};

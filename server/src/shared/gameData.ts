// Carga CLASSES / SPELLS / ITEMS desde web/public/data (fuente única de verdad).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../../web/public/data');

const read = (f: string) => JSON.parse(readFileSync(resolve(dataDir, f), 'utf8'));

export interface ClassStats {
  max_hp: number; max_energy: number; energy_regen: number;
  base_damage: number; move_time_multiplier: number; armor: number;
}
export interface ClassDef {
  name: string; role: string; color: [number, number, number];
  spells: string[]; stats: ClassStats;
}
export interface SpellDef {
  name: string; energy_cost: number; cooldown: number;
  damage_type: string; color: [number, number, number];
  effect?: string; cc?: string; cc_duration?: number;
  aoe_radius?: number; heal_base?: number; heal_multiplier?: number;
  shield?: number; shield_duration?: number;
  invisible_duration?: number; cleanse?: boolean;
}
export interface ItemDef {
  id: string; name: string; type: string;
  color: [number, number, number];
  restore_hp?: number; restore_mp?: number;
  stackable?: boolean; max_stack?: number;
}

export const CLASSES: Record<string, ClassDef> = read('classes.json');
export const SPELLS: Record<string, SpellDef> = read('spells.json');
export const ITEMS: Record<string, ItemDef> = read('items.json');

// Multiplicadores de daño por tipo (espejo de GameEngine.DAMAGE_MULT)
export const DAMAGE_MULT: Record<string, number> = {
  single_melee: 1.0, single_ranged: 0.85, aoe_targeted: 0.55,
  aoe_self: 0.45, melee_area: 0.45,
};
export const CC_AOE_MULT = 0.6;

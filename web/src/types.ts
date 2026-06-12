export type RGB = [number, number, number];

export interface Rank {
  id: string; name: string; min_elo: number; max_elo: number;
  color: RGB; tier: string;
}

export interface ClassDef {
  name: string; role: string; lore: string; color: RGB;
  armor_type: string; spells: string[];
  stats: {
    max_hp: number; max_energy: number; base_damage: number;
    description_stats: Record<string, number>;
  };
}

export interface SpellDef {
  name: string; slot?: string; energy_cost?: number; cooldown: number;
  damage_type: string; color: RGB; desc: string;
}

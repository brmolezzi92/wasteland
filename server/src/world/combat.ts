import { DAMAGE_MULT } from '../shared/gameData.js';
import type { SpellDef } from '../shared/gameData.js';
import type { Player } from './Player.js';

// Daño base de un hechizo según su tipo (espejo de GameEngine.calcDamage)
export function calcSpellDamage(sp: SpellDef, baseDamage: number): number {
  return Math.max(1, Math.round(baseDamage * (DAMAGE_MULT[sp.damage_type] ?? 1)));
}

// Aplica daño a un jugador con armadura + escudo. Devuelve el daño real recibido.
export function applyDamageToPlayer(p: Player, dmg: number): number {
  if (p.isGhost) return 0;
  p.isInvisible = false; p.invisTimer = 0;
  if (p.shield > 0) { const a = Math.min(p.shield, dmg); p.shield -= a; dmg -= a; }
  const red = Math.max(0, dmg - Math.floor(p.armor / 3));
  p.hp = Math.max(0, p.hp - red);
  return red;
}

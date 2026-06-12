import { CLASSES } from '../shared/gameData.js';
import type { CC, InventorySlot } from './types.js';

export const GHOST_DURATION = 18;

// Jugador autoritativo en el servidor. El cliente solo refleja este estado.
export class Player {
  userId: string;
  username: string;
  classId: string;
  charId: string;
  socketId: string;

  zoneIdx = 0;
  tx = 50; ty = 74;
  facing = 1;
  moving = false;

  hp: number; maxHp: number;
  energy: number; maxEnergy: number;
  energyRegen: number;
  baseDamage: number;
  armor: number;

  spellIds: string[];
  spellCd: number[];

  isGhost = false;
  ghostTimer = 0;
  spawnTx = 50; spawnTy = 74;

  shield = 0; shieldTimer = 0;
  isInvisible = false; invisTimer = 0;
  cc: CC = null; ccTimer = 0;

  inventory: (InventorySlot | null)[];

  potionCd = 0;
  ping = 0;
  connectedAt = Date.now();
  inDuel: string | null = null;
  partyId: string | null = null;

  constructor(p: { userId: string; username: string; classId: string; charId: string; socketId: string }) {
    this.userId = p.userId;
    this.username = p.username;
    this.classId = p.classId;
    this.charId = p.charId;
    this.socketId = p.socketId;

    const cls = CLASSES[p.classId] ?? CLASSES['baluarte'];
    const st = cls.stats;
    this.hp = st.max_hp; this.maxHp = st.max_hp;
    this.energy = st.max_energy; this.maxEnergy = st.max_energy;
    this.energyRegen = st.energy_regen;
    this.baseDamage = st.base_damage;
    this.armor = st.armor;
    this.spellIds = cls.spells.slice();
    this.spellCd = new Array(cls.spells.length).fill(0);

    this.inventory = [
      { itemId: 'hp_potion', qty: 12 }, { itemId: 'mp_potion', qty: 12 },
      { itemId: 'hp_potion_large', qty: 6 }, { itemId: 'mp_potion_large', qty: 6 },
      ...new Array(20).fill(null),
    ];
  }

  tick(dt: number) {
    this.energy = Math.min(this.maxEnergy, this.energy + this.energyRegen * dt);
    for (let i = 0; i < this.spellCd.length; i++) this.spellCd[i] = Math.max(0, this.spellCd[i] - dt);
    this.potionCd = Math.max(0, this.potionCd - dt);
    if (this.ccTimer > 0) { this.ccTimer -= dt; if (this.ccTimer <= 0) this.cc = null; }
    if (this.shieldTimer > 0) { this.shieldTimer -= dt; if (this.shieldTimer <= 0) this.shield = 0; }
    if (this.invisTimer > 0) { this.invisTimer -= dt; if (this.invisTimer <= 0) this.isInvisible = false; }
    if (this.isGhost) { this.ghostTimer -= dt; if (this.ghostTimer <= 0) this.respawn(); }
  }

  addItem(itemId: string, qty: number) {
    const existing = this.inventory.find(s => s?.itemId === itemId);
    if (existing) { existing.qty += qty; return; }
    const empty = this.inventory.findIndex(s => s === null);
    if (empty !== -1) this.inventory[empty] = { itemId, qty };
  }

  die() {
    this.isGhost = true;
    this.ghostTimer = GHOST_DURATION;
    this.hp = 0;
    this.cc = null; this.ccTimer = 0;
  }

  respawn() {
    this.isGhost = false; this.ghostTimer = 0;
    this.hp = Math.round(this.maxHp * 0.4);
    this.energy = Math.round(this.maxEnergy * 0.2);
    this.tx = this.spawnTx; this.ty = this.spawnTy;
    this.shield = 0; this.shieldTimer = 0;
  }
}

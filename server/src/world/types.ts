export type CC = 'stun' | 'root' | 'slow' | null;

export interface ServerEnemy {
  idx: number;
  name: string;
  kind: 'enemy' | 'boss';
  tx: number; ty: number;
  hp: number; maxHp: number;
  alive: boolean;
  facing: number;
  cc: CC; ccTimer: number;
  atkCd: number;
  moveCd: number;
}

export interface ServerGroundItem {
  itemId: string; qty: number; tx: number; ty: number;
}

export interface InventorySlot { itemId: string; qty: number; }

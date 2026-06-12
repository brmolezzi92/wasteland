import type { Rank, ClassDef, SpellDef, RGB } from './types';

export const RANKS: Rank[] = [];
export const CLASSES: Record<string, ClassDef> = {};
export const SPELLS: Record<string, SpellDef> = {};
export const ITEMS: Record<string, any> = {};

export async function loadData() {
  const [ranks, classes, spells, items] = await Promise.all([
    fetch('/data/ranks.json').then(r => r.json()),
    fetch('/data/classes.json').then(r => r.json()),
    fetch('/data/spells.json').then(r => r.json()),
    fetch('/data/items.json').then(r => r.json()),
  ]);
  RANKS.push(...ranks.ranks);
  Object.assign(CLASSES, classes);
  Object.assign(SPELLS, spells);
  Object.assign(ITEMS, items);
}

export function eloToRank(elo: number): Rank {
  let best = RANKS[0];
  for (const r of RANKS) if (elo >= r.min_elo) best = r;
  return best;
}

export function rgb(c: RGB, a = 1): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export const TILE = 64;

export const T = {
  GRASS:     0,
  DIRT:      1,
  WATER:     2,
  WALL:      3,
  PATH:      4,
  FORT:      5,   // fortress floor (dark stone)
  FORT_WALL: 6,   // fortress outer wall
} as const;

export const SOLID: Record<number, boolean> = {
  [T.GRASS]: false, [T.DIRT]: false, [T.WATER]: true,
  [T.WALL]: true,   [T.PATH]: false,
  [T.FORT]: false,  [T.FORT_WALL]: true,
};

export const TILE_SPRITE: Record<number, string> = {
  [T.GRASS]: 'floor', [T.DIRT]: 'dirt', [T.WATER]: 'toxic',
  [T.WALL]: 'wall',   [T.PATH]: 'path',
  [T.FORT]: 'wall',   [T.FORT_WALL]: 'wall',
};

// Colores de fallback por tipo de tile (cuando no carga sprite)
export const TILE_COLOR: Record<number, number> = {
  [T.GRASS]:     0x2d4a1e,
  [T.DIRT]:      0x5a3a1a,
  [T.WATER]:     0x1a4060,
  [T.WALL]:      0x353535,
  [T.PATH]:      0x6b5c3e,
  [T.FORT]:      0x2a1a1a,
  [T.FORT_WALL]: 0x1a0a0a,
};

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── zonas del mapa ───────────────────────────────────────────────────────────
//  rows  0-12   → FORTALEZA ENEMIGA
//  rows 13-17   → tierra de nadie / transición
//  rows 18-57   → MUNDO ABIERTO
//  rows 58-62   → transición / camino de entrada
//  rows 63-78   → BASE DEL JUGADOR
//  row  79      → borde

export const ZONE = {
  FORT_INNER:   { y0: 2,  y1: 11 },
  NO_MANS:      { y0: 12, y1: 17 },
  OPEN_WORLD:   { y0: 18, y1: 57 },
  TRANSITION:   { y0: 58, y1: 62 },
  PLAYER_BASE:  { y0: 63, y1: 78 },
} as const;

// Posiciones clave exportadas para spawnEntities
export const SPAWN = {
  player:   { tx: 45, ty: 70 },
  npcs: [
    { tx: 39, ty: 68, kind: 'knight'  },
    { tx: 51, ty: 68, kind: 'knight'  },
    { tx: 42, ty: 73, kind: 'rogue'   },
    { tx: 48, ty: 73, kind: 'rogue'   },
    { tx: 45, ty: 75, kind: 'wizzard' },
  ],
  enemies: [
    // patrullas mundo abierto
    { tx: 30, ty: 35, name: 'Bandido Tirador', hp: 80  },
    { tx: 60, ty: 28, name: 'Bandido Tirador', hp: 80  },
    { tx: 20, ty: 45, name: 'Bandido Bruto',   hp: 120 },
    { tx: 70, ty: 42, name: 'Bandido Bruto',   hp: 120 },
    { tx: 45, ty: 38, name: 'Torreta',         hp: 100 },
    // fortaleza
    { tx: 35, ty:  6, name: 'Bandido Tirador', hp: 80  },
    { tx: 55, ty:  6, name: 'Bandido Bruto',   hp: 120 },
    { tx: 30, ty:  9, name: 'Torreta',         hp: 100 },
    { tx: 60, ty:  9, name: 'Torreta',         hp: 100 },
  ],
  boss: { tx: 45, ty: 6, name: 'El Devorador', hp: 500 },
};

export class TileMap {
  width: number; height: number;
  tiles: number[][];

  constructor(width = 90, height = 80, seed = 7) {
    this.width = width; this.height = height;
    const rng = mulberry32(seed);
    const t: number[][] = Array.from({ length: height }, () => Array(width).fill(T.GRASS));

    // ── borde exterior ────────────────────────────────────────────────────────
    for (let x = 0; x < width; x++) { t[0][x] = T.WALL; t[height - 1][x] = T.WALL; }
    for (let y = 0; y < height; y++) { t[y][0] = T.WALL; t[y][width - 1] = T.WALL; }

    // ── fortaleza enemiga (rows 2-11) ─────────────────────────────────────────
    const F = ZONE.FORT_INNER;
    // Piso de fortaleza
    for (let y = F.y0; y <= F.y1; y++)
      for (let x = 5; x < width - 5; x++) t[y][x] = T.FORT;

    // Muros perimetrales de la fortaleza
    for (let x = 5; x < width - 5; x++) {
      t[F.y0 - 1][x] = T.FORT_WALL;
      t[F.y1 + 1][x] = T.FORT_WALL;
    }
    for (let y = F.y0 - 1; y <= F.y1 + 1; y++) {
      t[y][5] = T.FORT_WALL; t[y][width - 6] = T.FORT_WALL;
    }
    // Entrada de la fortaleza (centro-sur)
    t[F.y1 + 1][44] = T.FORT; t[F.y1 + 1][45] = T.FORT; t[F.y1 + 1][46] = T.FORT;
    // Torres en esquinas
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const corners = [[7, F.y0 - 1], [width - 8, F.y0 - 1], [7, F.y1 + 1], [width - 8, F.y1 + 1]];
        for (const [cx, cy] of corners) {
          const nx = cx + dx, ny = cy + dy;
          if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1) t[ny][nx] = T.FORT_WALL;
        }
      }

    // ── tierra de nadie (filas 12-17): ruinas dispersas ───────────────────────
    for (let y = ZONE.NO_MANS.y0; y <= ZONE.NO_MANS.y1; y++)
      for (let x = 1; x < width - 1; x++) {
        const r = rng();
        if (r < 0.08) t[y][x] = T.WALL;
        else if (r < 0.14) t[y][x] = T.DIRT;
      }

    // ── mundo abierto (filas 18-57) ───────────────────────────────────────────
    for (let y = ZONE.OPEN_WORLD.y0; y <= ZONE.OPEN_WORLD.y1; y++)
      for (let x = 1; x < width - 1; x++) {
        const r = rng();
        if (r < 0.09) t[y][x] = T.DIRT;
        else if (r < 0.11) t[y][x] = T.WALL;
      }

    // Lagos tóxicos en mundo abierto
    for (let i = 0; i < 10; i++) {
      const lx = 5 + Math.floor(rng() * (width - 10));
      const ly = ZONE.OPEN_WORLD.y0 + 2 + Math.floor(rng() * (ZONE.OPEN_WORLD.y1 - ZONE.OPEN_WORLD.y0 - 4));
      const rad = 2 + Math.floor(rng() * 3);
      for (let dy = -rad; dy <= rad; dy++)
        for (let dx = -rad; dx <= rad; dx++)
          if (dx * dx + dy * dy <= rad * rad) {
            const nx = lx + dx, ny = ly + dy;
            if (nx > 1 && nx < width - 2 && ny > ZONE.OPEN_WORLD.y0 && ny < ZONE.OPEN_WORLD.y1)
              t[ny][nx] = T.WATER;
          }
    }

    // ── transición / camino de entrada (filas 58-62) ─────────────────────────
    for (let y = ZONE.TRANSITION.y0; y <= ZONE.TRANSITION.y1; y++)
      for (let x = 1; x < width - 1; x++) t[y][x] = T.DIRT;

    // ── base del jugador (filas 63-78) ───────────────────────────────────────
    // Piso limpio (ya es GRASS por defecto, no hace nada)
    // Muros del perímetro de la base (dos paredes)
    for (let x = 5; x < width - 5; x++) {
      t[ZONE.PLAYER_BASE.y0][x] = T.WALL;
      t[ZONE.PLAYER_BASE.y1][x] = T.WALL;
    }
    for (let y = ZONE.PLAYER_BASE.y0; y <= ZONE.PLAYER_BASE.y1; y++) {
      t[y][5] = T.WALL; t[y][width - 6] = T.WALL;
    }
    // Entrada de la base (centro-norte de la base)
    t[ZONE.PLAYER_BASE.y0][44] = T.GRASS;
    t[ZONE.PLAYER_BASE.y0][45] = T.GRASS;
    t[ZONE.PLAYER_BASE.y0][46] = T.GRASS;

    // ── caminos principales ───────────────────────────────────────────────────
    // Camino vertical central (conecta todo el mapa)
    for (let y = 2; y < height - 2; y++) {
      if (t[y][44] !== T.FORT_WALL && t[y][44] !== T.WALL) t[y][44] = T.PATH;
      if (t[y][45] !== T.FORT_WALL && t[y][45] !== T.WALL) t[y][45] = T.PATH;
      if (t[y][46] !== T.FORT_WALL && t[y][46] !== T.WALL) t[y][46] = T.PATH;
    }
    // Camino horizontal en mundo abierto
    const hy = 38;
    for (let x = 6; x < width - 6; x++)
      if (t[hy][x] !== T.WATER && t[hy][x] !== T.WALL) t[hy][x] = T.PATH;

    // ── asegurar que spawns sean walkable ─────────────────────────────────────
    const clearArea = (cx: number, cy: number, r = 2) => {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1)
            if (SOLID[t[ny][nx]]) t[ny][nx] = T.GRASS;
        }
    };
    clearArea(SPAWN.player.tx, SPAWN.player.ty, 3);
    for (const npc of SPAWN.npcs) clearArea(npc.tx, npc.ty, 1);
    for (const e of SPAWN.enemies) clearArea(e.tx, e.ty, 1);
    clearArea(SPAWN.boss.tx, SPAWN.boss.ty, 2);

    this.tiles = t;
  }

  isSolid(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return true;
    return SOLID[this.tiles[ty][tx]];
  }
}

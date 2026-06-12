export const TILE = 64; // tile size in pixels

export const T = {
  GRASS:      0,  // suelo verde — BASE BUENA, BOSQUE
  DIRT:       1,  // tierra marrón — transición, wasteland
  WATER:      2,  // SÓLIDO — barrera tóxica (impassable)
  WALL:       3,  // SÓLIDO — muro de cemento
  PATH:       4,  // camino empedrado
  FORT:       5,  // piso de fortaleza enemiga
  FORT_WALL:  6,  // SÓLIDO — muro de fortaleza
  TOXIC:      7,  // suelo tóxico CAMINABLE (bordes laterales)
  SAND:       8,  // arena del desierto
  DUNGEON:    9,  // piso de dungeon
  TREE:       10, // SÓLIDO — árbol / vegetación densa
} as const;

export const SOLID: Record<number, boolean> = {
  [T.GRASS]: false,    [T.DIRT]: false,    [T.WATER]: true,
  [T.WALL]: true,      [T.PATH]: false,    [T.FORT]: false,
  [T.FORT_WALL]: true, [T.TOXIC]: false,   [T.SAND]: false,
  [T.DUNGEON]: false,  [T.TREE]: true,
};

export const TILE_SPRITE: Record<number, string> = {
  [T.GRASS]:     'floor',
  [T.DIRT]:      'dirt',
  [T.WATER]:     'toxic',
  [T.WALL]:      'wall',
  [T.PATH]:      'path',
  [T.FORT]:      'floor',
  [T.FORT_WALL]: 'wall',
  [T.TOXIC]:     'toxic',
  [T.SAND]:      'dirt',
  [T.DUNGEON]:   'floor',
  [T.TREE]:      'wall',
};

export const TILE_COLOR: Record<number, number> = {
  [T.GRASS]:     0x2a6e25,  // verde profundo
  [T.DIRT]:      0x5a3a1a,  // tierra marrón
  [T.WATER]:     0x2e5c10,  // tóxico sólido verde oscuro
  [T.WALL]:      0x383838,  // gris concreto
  [T.PATH]:      0x7a6a48,  // piedra camino
  [T.FORT]:      0x2a1808,  // piso fortaleza naranja oscuro
  [T.FORT_WALL]: 0x180c04,  // muro fortaleza muy oscuro
  [T.TOXIC]:     0x8ab820,  // verde lima tóxico brillante
  [T.SAND]:      0xc4a050,  // arena amarilla
  [T.DUNGEON]:   0x18182a,  // azul-negro dungeon
  [T.TREE]:      0x1a4010,  // verde muy oscuro árbol
};

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── ZONAS DEL MAPA (100 × 500 tiles) ────────────────────────────────────────
//   rows   0 –  79  → BASE IA ENEMIGA        (80 tiles)
//   rows  80 –  94  → BARRERA TÓXICA NORTE   (15 tiles, sólida)
//   rows  95 – 194  → DUNGEON + NPCS ALTO    (100 tiles)
//   rows 195 – 209  → BARRERA TÓXICA SUR     (15 tiles, sólida)
//   rows 210 – 309  → BIOMA DESIERTO         (100 tiles)
//   rows 310 – 409  → BIOMA VERDE BOSQUE     (100 tiles)
//   rows 410 – 499  → BASE BUENA             (90 tiles)
//   cols   0 –   4  → BORDE TÓXICO IZQUIERDO (caminable)
//   cols  95 –  99  → BORDE TÓXICO DERECHO   (caminable)

export const ZONE = {
  ENEMY_BASE:  { y0: 0,   y1: 79  },
  TOXIC_N:     { y0: 80,  y1: 94  },
  DUNGEON:     { y0: 95,  y1: 194 },
  TOXIC_S:     { y0: 195, y1: 209 },
  DESERT:      { y0: 210, y1: 309 },
  FOREST:      { y0: 310, y1: 409 },
  PLAYER_BASE: { y0: 410, y1: 499 },
} as const;

// camino central: cols 48–51 (4 tiles de ancho)
const PATH_X = [48, 49, 50, 51];

export const SPAWN = {
  player: { tx: 50, ty: 460 },

  npcs: [
    { tx: 44, ty: 428, name: 'Comandante'  },
    { tx: 56, ty: 428, name: 'Explorador'  },
    { tx: 50, ty: 440, name: 'Alquimista'  },
    { tx: 40, ty: 455, name: 'Mecánico'    },
    { tx: 60, ty: 455, name: 'Mercader'    },
  ],

  enemies: [
    // ── BASE IA ENEMIGA ───────────────────────────────────────
    { tx: 30, ty: 12, name: 'Bandido Tirador', hp: 80  },
    { tx: 70, ty: 12, name: 'Bandido Tirador', hp: 80  },
    { tx: 20, ty: 42, name: 'Bandido Bruto',   hp: 120 },
    { tx: 80, ty: 42, name: 'Bandido Bruto',   hp: 120 },
    { tx: 35, ty: 65, name: 'Torreta',         hp: 100 },
    { tx: 65, ty: 65, name: 'Torreta',         hp: 100 },
    { tx: 20, ty: 65, name: 'Bandido Tirador', hp: 80  },
    { tx: 80, ty: 65, name: 'Bandido Tirador', hp: 80  },
    { tx: 50, ty: 40, name: 'Torreta',         hp: 100 },
    // ── DUNGEON ───────────────────────────────────────────────
    { tx: 28, ty: 115, name: 'Chamán Corrupto', hp: 160 },
    { tx: 72, ty: 115, name: 'Chamán Corrupto', hp: 160 },
    { tx: 50, ty: 140, name: 'Chamán Corrupto', hp: 160 },
    { tx: 22, ty: 165, name: 'Torreta',          hp: 100 },
    { tx: 78, ty: 165, name: 'Torreta',          hp: 100 },
    { tx: 38, ty: 182, name: 'Bandido Bruto',    hp: 120 },
    { tx: 62, ty: 182, name: 'Bandido Bruto',    hp: 120 },
    // ── BIOMA DESIERTO ────────────────────────────────────────
    { tx: 20, ty: 228, name: 'Bandido Tirador', hp: 80  },
    { tx: 80, ty: 228, name: 'Bandido Tirador', hp: 80  },
    { tx: 35, ty: 255, name: 'Bandido Bruto',   hp: 120 },
    { tx: 65, ty: 255, name: 'Bandido Bruto',   hp: 120 },
    { tx: 50, ty: 278, name: 'Bandido Tirador', hp: 80  },
    { tx: 20, ty: 298, name: 'Bandido Bruto',   hp: 120 },
    { tx: 80, ty: 298, name: 'Bandido Tirador', hp: 80  },
    // ── BIOMA BOSQUE ──────────────────────────────────────────
    { tx: 20, ty: 330, name: 'Bandido Tirador', hp: 80  },
    { tx: 80, ty: 330, name: 'Bandido Tirador', hp: 80  },
    { tx: 35, ty: 360, name: 'Bandido Bruto',   hp: 120 },
    { tx: 65, ty: 360, name: 'Bandido Bruto',   hp: 120 },
    { tx: 50, ty: 390, name: 'Bandido Tirador', hp: 80  },
  ],

  boss: { tx: 50, ty: 15, name: 'El Devorador', hp: 600 },
};

export class TileMap {
  width: number; height: number;
  tiles: number[][];

  constructor(width = 100, height = 500, seed = 7) {
    this.width = width; this.height = height;
    const rng = mulberry32(seed);
    const t: number[][] = Array.from({ length: height }, () => Array(width).fill(T.GRASS));

    // ── BORDES TÓXICOS LATERALES (toda la altura) ─────────────────────────────
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < 5; x++) t[y][x] = T.TOXIC;
      for (let x = 95; x < width; x++) t[y][x] = T.TOXIC;
    }

    // ── BASE IA ENEMIGA (rows 0–79) ──────────────────────────────────────────
    for (let y = 0; y <= 79; y++)
      for (let x = 5; x < 95; x++) t[y][x] = T.FORT;

    // Perimeter walls
    for (let x = 5; x < 95; x++) { t[0][x] = T.FORT_WALL; t[79][x] = T.FORT_WALL; }
    for (let y = 0; y <= 79; y++) { t[y][5] = T.FORT_WALL; t[y][94] = T.FORT_WALL; }

    // South entrance gap
    for (const px of PATH_X) t[79][px] = T.FORT;

    // Guard towers (4 corners, 3×3)
    for (const [cx, cy] of [[8,2],[90,2],[8,76],[90,76]]) {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          t[cy + dy][cx + dx] = T.FORT_WALL;
    }

    // Inner dividing wall row 32 — separates outer patrol from inner sanctum
    for (let x = 6; x < 94; x++) t[32][x] = T.FORT_WALL;
    for (const px of PATH_X) t[32][px] = T.FORT;
    // Side passages in dividing wall
    t[32][20] = T.FORT; t[32][21] = T.FORT;
    t[32][78] = T.FORT; t[32][79] = T.FORT;

    // Inner sanctum wall row 58
    for (let x = 6; x < 94; x++) t[58][x] = T.FORT_WALL;
    for (const px of PATH_X) t[58][px] = T.FORT;
    t[58][20] = T.FORT; t[58][21] = T.FORT;
    t[58][78] = T.FORT; t[58][79] = T.FORT;

    // Command center box (rows 3–26, cols 35–65)
    for (let x = 35; x <= 65; x++) { t[3][x] = T.FORT_WALL; t[26][x] = T.FORT_WALL; }
    for (let y = 3; y <= 26; y++) { t[y][35] = T.FORT_WALL; t[y][65] = T.FORT_WALL; }
    // Command center entrance (south wall gap)
    for (const px of PATH_X) t[26][px] = T.FORT;

    // Barracks east/west (small rooms)
    for (const [bx, by] of [[10, 38], [84, 38], [10, 62], [84, 62]]) {
      for (let dy = 0; dy < 5; dy++)
        for (let dx = 0; dx < 6; dx++)
          if (dy === 0 || dy === 4 || dx === 0 || dx === 5)
            t[by + dy][bx + dx] = T.FORT_WALL;
    }

    // ── BARRERA TÓXICA NORTE (rows 80–94) ────────────────────────────────────
    for (let y = 80; y <= 94; y++)
      for (let x = 5; x < 95; x++) t[y][x] = T.WATER;
    // Gap central para pasar
    for (let y = 80; y <= 94; y++)
      for (const px of PATH_X) t[y][px] = T.PATH;

    // ── DUNGEON / NPCS NIVEL ALTO (rows 95–194) ───────────────────────────────
    for (let y = 95; y <= 194; y++)
      for (let x = 5; x < 95; x++) t[y][x] = T.DUNGEON;

    // Pilares (2×2 FORT_WALL)
    const pillars = [
      [18,108],[82,108],[18,148],[82,148],[18,185],[82,185],
      [35,128],[65,128],[35,168],[65,168],[35,188],[65,188],
    ];
    for (const [px, py] of pillars)
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++)
          if (px+dx >= 6 && px+dx < 94 && py+dy >= 96 && py+dy <= 193)
            t[py+dy][px+dx] = T.FORT_WALL;

    // Muros internos del dungeon (habitaciones)
    for (let x = 6; x < 94; x++) {
      if (x < 44 || x > 55) { t[130][x] = T.FORT_WALL; }
    }
    for (let x = 6; x < 94; x++) {
      if (x < 44 || x > 55) { t[170][x] = T.FORT_WALL; }
    }

    // Pozos tóxicos del dungeon
    for (const [px, py, r] of [[28,120,3],[72,160,3],[50,188,2]]) {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (dx*dx+dy*dy <= r*r && px+dx >= 6 && px+dx < 94 && py+dy >= 96 && py+dy <= 193)
            t[py+dy][px+dx] = T.WATER;
    }

    // ── BARRERA TÓXICA SUR (rows 195–209) ────────────────────────────────────
    for (let y = 195; y <= 209; y++)
      for (let x = 5; x < 95; x++) t[y][x] = T.WATER;
    for (let y = 195; y <= 209; y++)
      for (const px of PATH_X) t[y][px] = T.PATH;

    // ── BIOMA DESIERTO (rows 210–309) ────────────────────────────────────────
    for (let y = 210; y <= 309; y++)
      for (let x = 5; x < 95; x++) t[y][x] = T.SAND;

    // Ruinas (perímetros de WALL)
    const ruins = [[15,222],[85,222],[12,260],[88,260],[25,278],[75,278],[15,295],[85,295],[35,240],[65,240]];
    for (const [rx, ry] of ruins) {
      const w = 3 + Math.floor(rng() * 6);
      const h = 2 + Math.floor(rng() * 5);
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++)
          if ((dy === 0 || dy === h-1 || dx === 0 || dx === w-1)
              && rx+dx >= 6 && rx+dx < 94 && ry+dy >= 211 && ry+dy <= 308)
            t[ry+dy][rx+dx] = T.WALL;
    }

    // Parches de DIRT en la arena
    for (let i = 0; i < 20; i++) {
      const px = 6 + Math.floor(rng() * 87);
      const py = 212 + Math.floor(rng() * 95);
      const r = 1 + Math.floor(rng() * 3);
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (dx*dx+dy*dy <= r*r && t[py+dy]?.[px+dx] === T.SAND)
            t[py+dy][px+dx] = T.DIRT;
    }

    // ── BIOMA VERDE BOSQUE (rows 310–409) ────────────────────────────────────
    for (let y = 310; y <= 409; y++)
      for (let x = 5; x < 95; x++) t[y][x] = T.GRASS;

    // Clusters de árboles (círculos de TREE)
    const treeClusters = [
      [14,325,5],[86,325,5],[22,348,6],[78,348,6],
      [14,372,5],[86,372,5],[30,390,4],[70,390,4],
      [14,402,4],[86,402,4],[40,330,4],[60,330,4],
    ];
    for (const [cx, cy, r] of treeClusters) {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (dx*dx+dy*dy <= r*r && cx+dx >= 6 && cx+dx < 94 && cy+dy >= 311 && cy+dy <= 408)
            if (rng() > 0.28)
              t[cy+dy][cx+dx] = T.TREE;
    }

    // Camino sinuoso en el bosque (S-curve de PATH)
    for (let y = 310; y <= 409; y++) {
      const off = Math.round(6 * Math.sin((y - 310) * 0.06));
      const cx = 49 + off;
      for (let dx = -2; dx <= 2; dx++)
        if (cx+dx >= 6 && cx+dx < 94 && !SOLID[t[y][cx+dx]])
          t[y][cx+dx] = T.PATH;
    }

    // ── BASE BUENA (rows 410–499) ─────────────────────────────────────────────
    // GRASS ya por defecto
    // Perimeter wall
    for (let x = 5; x < 95; x++) { t[410][x] = T.WALL; t[499][x] = T.WALL; }
    for (let y = 410; y <= 499; y++) { t[y][5] = T.WALL; t[y][94] = T.WALL; }
    // North entrance
    for (const px of PATH_X) t[410][px] = T.GRASS;

    // Plaza central con PATH
    for (let x = 6; x < 94; x++) if (!SOLID[t[440][x]]) t[440][x] = T.PATH;
    for (let y = 411; y <= 499; y++) if (!SOLID[t[y][49]]) t[y][49] = T.PATH;
    for (let y = 411; y <= 499; y++) if (!SOLID[t[y][50]]) t[y][50] = T.PATH;

    // Muros internos de la base (cuartos laterales)
    for (let y = 415; y <= 435; y++) { t[y][20] = T.WALL; t[y][79] = T.WALL; }
    t[435][20] = T.GRASS; t[435][79] = T.GRASS; // entrada

    // ── CAMINO CENTRAL VERTICAL (conecta todo el mapa) ───────────────────────
    for (let y = 0; y < height; y++)
      for (const px of PATH_X)
        if (!SOLID[t[y][px]]) t[y][px] = T.PATH;

    // ── CLEAR AREAS alrededor de spawns ──────────────────────────────────────
    const zoneTile = (cy: number) =>
      cy <= 79 ? T.FORT : cy <= 194 ? T.DUNGEON : cy <= 309 ? T.SAND : cy <= 409 ? T.GRASS : T.GRASS;

    const clearArea = (cx: number, cy: number, r = 2) => {
      const fill = zoneTile(cy);
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx > 5 && nx < 94 && ny > 0 && ny < height - 1)
            if (SOLID[t[ny][nx]]) t[ny][nx] = fill;
        }
    };

    clearArea(SPAWN.player.tx, SPAWN.player.ty, 3);
    for (const npc of SPAWN.npcs) clearArea(npc.tx, npc.ty, 2);
    for (const e of SPAWN.enemies)  clearArea(e.tx, e.ty, 1);
    clearArea(SPAWN.boss.tx, SPAWN.boss.ty, 3);

    this.tiles = t;
  }

  isSolid(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return true;
    return SOLID[this.tiles[ty][tx]] ?? true;
  }
}

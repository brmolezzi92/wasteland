export const TILE     = 64;
export const ZONE_W   = 100;
export const ZONE_H   = 80;
export const ZONE_COUNT = 10;

// ─── Tile types ───────────────────────────────────────────────────────────────
export const T = {
  GRASS:     0,
  DIRT:      1,
  WATER:     2,  // SÓLIDO
  WALL:      3,  // SÓLIDO
  PATH:      4,
  FORT:      5,
  FORT_WALL: 6,  // SÓLIDO
  TOXIC:     7,
  SAND:      8,
  DUNGEON:   9,
  TREE:      10, // SÓLIDO
} as const;

export const SOLID: Record<number, boolean> = {
  0: false, 1: false, 2: true,  3: true,  4: false,
  5: false, 6: true,  7: false, 8: false, 9: false, 10: true,
};

export const TILE_SPRITE: Record<number, string> = {
  0: 'floor', 1: 'dirt',  2: 'toxic', 3: 'wall', 4: 'path',
  5: 'floor', 6: 'wall',  7: 'toxic', 8: 'dirt', 9: 'floor', 10: 'floor',
};

export const TILE_COLOR: Record<number, number> = {
  0: 0x3a5e28,  1: 0x7c5a38,  2: 0x1a2e08,  3: 0x3a3a3a,
  4: 0x6e6248,  5: 0x3a3e44,  6: 0x2a2e34,  7: 0x8ab820,
  8: 0xc4a050,  9: 0x18182a, 10: 0x1a4010,
};

// ─── Zone names ───────────────────────────────────────────────────────────────
export const ZONE_NAMES = [
  'Base del Jugador',
  'Praderas del Sur',
  'Bosque del Sur',
  'Bosque del Norte',
  'Desierto',
  'Ruinas Antiguas',
  'Zona Tóxica',
  'Dungeon',
  'Dungeon Profundo',
  'Base IA Enemiga',
];

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface PropDef {
  key: string;
  tx: number;
  ty: number;
  scale?: number;
}

export interface EnemySpawn {
  tx: number; ty: number; name: string; hp: number;
}

export interface NpcSpawn {
  tx: number; ty: number; name: string;
}

// ─── TileMap ──────────────────────────────────────────────────────────────────
export class TileMap {
  readonly width  = ZONE_W;
  readonly height = ZONE_H;
  tiles: number[][];
  props:   PropDef[]   = [];
  enemies: EnemySpawn[] = [];
  boss:    EnemySpawn | null = null;
  npcs:    NpcSpawn[]  = [];
  playerSpawn = { tx: 50, ty: ZONE_H - 6 };
  groundItemIds: string[] = ['scrap'];
  groundItemCount = 10;
  readonly zoneIdx: number;

  constructor(zoneIdx: number) {
    this.zoneIdx = zoneIdx;
    this.tiles = Array.from({ length: ZONE_H }, () => new Array(ZONE_W).fill(T.GRASS));
    this.generate();
  }

  isSolid(tx: number, ty: number): boolean {
    if (tx < 0 || tx >= ZONE_W) return true;
    if (ty < 0 || ty >= ZONE_H) return false; // north/south edges = zone exit (passable)
    return !!(SOLID[this.tiles[ty][tx]]);
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  private f(r0: number, r1: number, c0: number, c1: number, tile: number) {
    for (let r = Math.max(0, r0); r <= Math.min(ZONE_H - 1, r1); r++)
      for (let c = Math.max(0, c0); c <= Math.min(ZONE_W - 1, c1); c++)
        this.tiles[r][c] = tile;
  }
  private p(key: string, tx: number, ty: number, scale = 1.0) {
    this.props.push({ key, tx, ty, scale });
  }
  private e(name: string, tx: number, ty: number, hp: number) {
    this.enemies.push({ name, tx, ty, hp });
  }
  // Deterministic hash for pseudo-random patterns (no Math.random)
  private h(r: number, c: number) { return ((r * 1009 + c * 1013 + r * c) & 0x7fffffff) % 100; }

  // North + South passage cols kept clear
  private openPassage() {
    for (let r = 0; r < ZONE_H; r++) {
      for (let c = 47; c <= 52; c++) {
        if (this.tiles[r][c] !== T.WATER) this.tiles[r][c] = T.PATH;
      }
    }
  }

  private generate() {
    switch (this.zoneIdx) {
      case 0: this.genBase();       break;
      case 1: this.genPraderas();   break;
      case 2: this.genBosqueSur();  break;
      case 3: this.genBosqueNorte(); break;
      case 4: this.genDesierto();   break;
      case 5: this.genRuinas();     break;
      case 6: this.genToxic();      break;
      case 7: this.genDungeon();    break;
      case 8: this.genDungeonDeep(); break;
      case 9: this.genBaseIA();     break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 0: BASE DEL JUGADOR (safe, NPCs, shops)
  // ─────────────────────────────────────────────────────────────────────────────
  private genBase() {
    this.f(0, ZONE_H - 1, 0, ZONE_W - 1, T.GRASS);
    // Perimeter walls
    this.f(0, ZONE_H - 1, 0,  1,          T.WALL);
    this.f(0, ZONE_H - 1, ZONE_W - 2, ZONE_W - 1, T.WALL);
    this.f(ZONE_H - 2, ZONE_H - 1, 0, ZONE_W - 1, T.WALL); // south = no exit
    this.f(0, 1, 0, ZONE_W - 1, T.WALL);
    // North entrance corridor (path)
    this.f(0, 3, 46, 53, T.PATH);
    // Main vertical path
    this.f(0, ZONE_H - 3, 47, 52, T.PATH);
    // Horizontal cross paths
    this.f(28, 30, 2, ZONE_W - 3, T.PATH);
    this.f(52, 54, 2, ZONE_W - 3, T.PATH);
    // ── West building (armory) ─────────────────────────────────────────────────
    this.f(6, 24,  5, 38, T.GRASS);
    this.f(6,  6,  5, 38, T.WALL);
    this.f(24, 24, 5, 38, T.WALL);
    this.f(6, 24,  5,  5, T.WALL);
    this.f(6, 24, 38, 38, T.WALL);
    this.f(14, 16,  5,  5, T.PATH);  // west door
    this.f(14, 16, 38, 38, T.PATH);  // east door
    this.f(9, 9,  10, 20, T.WALL);   // inner divider
    this.f(9, 9,  23, 35, T.WALL);
    // ── East building (depot) ──────────────────────────────────────────────────
    this.f(6, 24, 62, 95, T.GRASS);
    this.f(6,  6, 62, 95, T.WALL);
    this.f(24, 24, 62, 95, T.WALL);
    this.f(6, 24, 62, 62, T.WALL);
    this.f(6, 24, 95, 95, T.WALL);
    this.f(14, 16, 62, 62, T.PATH);
    this.f(14, 16, 95, 95, T.PATH);
    // ── Central command hall ───────────────────────────────────────────────────
    this.f(33, 50, 37, 63, T.FORT);
    this.f(33, 33, 37, 63, T.FORT_WALL);
    this.f(50, 50, 37, 63, T.FORT_WALL);
    this.f(33, 50, 37, 37, T.FORT_WALL);
    this.f(33, 50, 63, 63, T.FORT_WALL);
    this.f(38, 45, 37, 37, T.PATH); // west door
    this.f(38, 45, 63, 63, T.PATH); // east door
    this.f(33, 33, 47, 52, T.PATH); // north door
    // Spawn in south, center
    this.playerSpawn = { tx: 50, ty: 68 };
    // NPCs inside the command hall
    this.npcs = [
      { tx: 50, ty: 40, name: 'Comandante' },
      { tx: 42, ty: 43, name: 'Explorador' },
      { tx: 58, ty: 43, name: 'Alquimista' },
      { tx: 42, ty: 57, name: 'Mecánico'   },
      { tx: 58, ty: 57, name: 'Mercader'   },
    ];
    // Props
    this.p('lockers',    10, 10, 1.6);  this.p('lockers',    10, 16, 1.6);
    this.p('locker',     88, 10, 2.0);  this.p('locker',     90, 10, 2.0);
    this.p('locker',     88, 18, 2.0);  this.p('locker',     90, 18, 2.0);
    this.p('barrel',     25, 15, 2.5);  this.p('barrel',     28, 15, 2.5);
    this.p('barrel',     72, 15, 2.5);  this.p('barrel',     75, 15, 2.5);
    this.p('rock_a',     20, 65, 2.5);  this.p('rock_b',     24, 68, 2.5);
    this.p('bush_a',     78, 62, 2.2);  this.p('bush_b',     82, 66, 2.2);
    this.groundItemIds  = ['scrap'];
    this.groundItemCount = 6;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 1: PRADERAS DEL SUR (easy zone, intro)
  // ─────────────────────────────────────────────────────────────────────────────
  private genPraderas() {
    this.f(0, ZONE_H - 1, 0, ZONE_W - 1, T.GRASS);
    this.f(0, ZONE_H - 1, 0,  2, T.WALL);
    this.f(0, ZONE_H - 1, ZONE_W - 3, ZONE_W - 1, T.WALL);
    // Dirt patches
    this.f(12, 18, 12, 24, T.DIRT);
    this.f(32, 40, 68, 82, T.DIRT);
    this.f(58, 65, 18, 32, T.DIRT);
    // Scattered light tree lines
    const ltrees = [
      [8,6],[8,14],[8,22],[8,30],[8,38],[8,44],
      [9,7],[9,15],[9,23],[9,31],
      [22,6],[22,12],[22,20],[22,36],[22,43],
      [38,8],[38,16],[38,24],[38,38],[38,44],
      [50,6],[50,14],[50,22],[50,38],[50,44],
      [62,8],[62,14],[62,24],[62,38],
      [70,6],[70,16],[70,30],[70,42],
      // East side
      [8,56],[8,64],[8,72],[8,82],[8,90],
      [22,55],[22,62],[22,70],[22,80],[22,88],
      [38,56],[38,66],[38,74],[38,84],[38,92],
      [52,58],[52,66],[52,76],[52,86],
      [64,56],[64,66],[64,74],[64,84],[64,92],
    ];
    for (const [r, c] of ltrees) {
      if (c < 45 || c > 54) {
        this.tiles[r][c] = T.TREE;
        if (r + 1 < ZONE_H) this.tiles[r + 1][c] = T.TREE;
      }
    }
    this.openPassage();
    this.enemies = [
      { tx: 18, ty: 18, name: 'Bandido Tirador', hp: 80 },
      { tx: 76, ty: 25, name: 'Bandido Tirador', hp: 80 },
      { tx: 14, ty: 50, name: 'Bandido Bruto',   hp: 120 },
      { tx: 82, ty: 55, name: 'Bandido Tirador', hp: 80 },
      { tx: 38, ty: 42, name: 'Bandido Tirador', hp: 80 },
    ];
    this.props = [
      { key: 'rock_a', tx: 24, ty: 40, scale: 2.2 },
      { key: 'rock_b', tx: 27, ty: 43, scale: 2.2 },
      { key: 'bush_a', tx: 62, ty: 20, scale: 2.0 },
      { key: 'bush_b', tx: 28, ty: 68, scale: 2.0 },
      { key: 'bush_a', tx: 74, ty: 50, scale: 2.0 },
      { key: 'bush_b', tx: 10, ty: 44, scale: 2.0 },
    ];
    this.playerSpawn    = { tx: 50, ty: ZONE_H - 4 };
    this.groundItemIds  = ['scrap', 'hierba_medicinal'];
    this.groundItemCount = 10;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 2: BOSQUE DEL SUR
  // ─────────────────────────────────────────────────────────────────────────────
  private genBosqueSur() {
    this.f(0, ZONE_H - 1, 0, ZONE_W - 1, T.GRASS);
    this.f(0, ZONE_H - 1, 0,  2, T.WALL);
    this.f(0, ZONE_H - 1, ZONE_W - 3, ZONE_W - 1, T.WALL);
    // Dense tree grid (west + east)
    for (let r = 4; r < ZONE_H - 4; r += 4) {
      for (let c = 3; c < 45; c += 4) {
        if (this.h(r, c) > 28) {
          this.tiles[r][c] = T.TREE;
          if (r + 1 < ZONE_H) this.tiles[r + 1][c] = T.TREE;
        }
      }
      for (let c = 55; c < ZONE_W - 3; c += 4) {
        if (this.h(r, c) > 28) {
          this.tiles[r][c] = T.TREE;
          if (r + 1 < ZONE_H) this.tiles[r + 1][c] = T.TREE;
        }
      }
    }
    // Clearings for enemies
    this.f(12, 18, 10, 20, T.GRASS);
    this.f(12, 18, 78, 88, T.GRASS);
    this.f(38, 46, 10, 20, T.GRASS);
    this.f(38, 46, 78, 88, T.GRASS);
    this.f(60, 68, 14, 26, T.GRASS);
    this.openPassage();
    this.enemies = [
      { tx: 14, ty: 14, name: 'Bandido Tirador', hp: 80  },
      { tx: 82, ty: 14, name: 'Bandido Bruto',   hp: 120 },
      { tx: 14, ty: 42, name: 'Bandido Bruto',   hp: 120 },
      { tx: 82, ty: 42, name: 'Bandido Tirador', hp: 80  },
      { tx: 18, ty: 64, name: 'Esqueleto Base',  hp: 85  },
    ];
    this.props = [
      { key: 'tree_a', tx: 33, ty: 20, scale: 1.8 },
      { key: 'tree_b', tx: 65, ty: 30, scale: 1.8 },
      { key: 'tree_a', tx: 20, ty: 50, scale: 1.8 },
      { key: 'tree_b', tx: 78, ty: 55, scale: 1.8 },
      { key: 'bush_a', tx: 40, ty: 14, scale: 2.0 },
      { key: 'bush_b', tx: 68, ty: 26, scale: 2.0 },
      { key: 'bush_a', tx: 26, ty: 72, scale: 2.0 },
      { key: 'rock_a', tx: 14, ty: 30, scale: 2.2 },
      { key: 'rock_b', tx: 84, ty: 60, scale: 2.2 },
    ];
    this.playerSpawn    = { tx: 50, ty: ZONE_H - 4 };
    this.groundItemIds  = ['madera_reforzada', 'hierba_medicinal'];
    this.groundItemCount = 14;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 3: BOSQUE DEL NORTE (dense)
  // ─────────────────────────────────────────────────────────────────────────────
  private genBosqueNorte() {
    this.f(0, ZONE_H - 1, 0, ZONE_W - 1, T.GRASS);
    this.f(0, ZONE_H - 1, 0,  2, T.WALL);
    this.f(0, ZONE_H - 1, ZONE_W - 3, ZONE_W - 1, T.WALL);
    // Very dense forest
    for (let r = 3; r < ZONE_H - 3; r += 3) {
      for (let c = 3; c < ZONE_W - 3; c += 3) {
        if ((c < 45 || c > 54) && this.h(r, c) > 32) {
          this.tiles[r][c] = T.TREE;
          if (r + 1 < ZONE_H) this.tiles[r + 1][c] = T.TREE;
        }
      }
    }
    // Clearings
    this.f(14, 22, 14, 24, T.GRASS);
    this.f(14, 22, 76, 86, T.GRASS);
    this.f(42, 52, 12, 22, T.GRASS);
    this.f(42, 52, 78, 88, T.GRASS);
    this.f(60, 70, 18, 30, T.GRASS);
    this.f(60, 70, 70, 82, T.GRASS);
    this.openPassage();
    this.enemies = [
      { tx: 18, ty: 16, name: 'Esqueleto Base',  hp: 85  },
      { tx: 80, ty: 18, name: 'Bandido Bruto',   hp: 120 },
      { tx: 16, ty: 46, name: 'Bandido Bruto',   hp: 120 },
      { tx: 82, ty: 47, name: 'Esqueleto Base',  hp: 85  },
      { tx: 22, ty: 65, name: 'Bandido Tirador', hp: 80  },
      { tx: 75, ty: 65, name: 'Esqueleto Rogue', hp: 75  },
    ];
    this.props = [
      { key: 'tree_a', tx: 30, ty: 8,  scale: 2.0 },
      { key: 'tree_b', tx: 68, ty: 10, scale: 2.0 },
      { key: 'tree_a', tx: 25, ty: 35, scale: 2.0 },
      { key: 'tree_b', tx: 73, ty: 38, scale: 2.0 },
      { key: 'tree_a', tx: 38, ty: 58, scale: 2.0 },
      { key: 'bush_a', tx: 44, ty: 28, scale: 2.0 },
      { key: 'bush_b', tx: 56, ty: 32, scale: 2.0 },
      { key: 'rock_a', tx: 35, ty: 28, scale: 2.2 },
      { key: 'rock_b', tx: 65, ty: 30, scale: 2.2 },
    ];
    this.playerSpawn    = { tx: 50, ty: ZONE_H - 4 };
    this.groundItemIds  = ['madera_reforzada', 'hierba_medicinal'];
    this.groundItemCount = 12;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 4: DESIERTO (sand, light ruins)
  // ─────────────────────────────────────────────────────────────────────────────
  private genDesierto() {
    this.f(0, ZONE_H - 1, 0, ZONE_W - 1, T.SAND);
    this.f(0, ZONE_H - 1, 0,  2, T.WALL);
    this.f(0, ZONE_H - 1, ZONE_W - 3, ZONE_W - 1, T.WALL);
    // DIRT patches / dried riverbed
    this.f(20, 24, 3, 44, T.DIRT);
    this.f(55, 59, 55, 97, T.DIRT);
    // Ruin west
    this.f(8, 25, 6, 24, T.WALL);   this.f(9, 24, 7, 23, T.SAND);
    this.f(16, 17, 6, 6, T.SAND);   // door
    this.f(5, 5, 12, 18, T.SAND);   // collapsed section
    // Ruin east
    this.f(8, 25, 76, 94, T.WALL);  this.f(9, 24, 77, 93, T.SAND);
    this.f(16, 17, 94, 94, T.SAND);
    // Lower ruin west
    this.f(45, 62, 8, 30, T.WALL);  this.f(46, 61, 9, 29, T.SAND);
    this.f(53, 54, 8, 8, T.SAND);
    // Lower ruin east
    this.f(45, 62, 70, 92, T.WALL); this.f(46, 61, 71, 91, T.SAND);
    this.f(53, 54, 92, 92, T.SAND);
    this.openPassage();
    this.enemies = [
      { tx: 14, ty: 14, name: 'Esqueleto Rogue',  hp: 75  },
      { tx: 84, ty: 14, name: 'Bandido Tirador',  hp: 80  },
      { tx: 18, ty: 52, name: 'Bandido Tirador',  hp: 80  },
      { tx: 78, ty: 53, name: 'Esqueleto Rogue',  hp: 75  },
      { tx: 38, ty: 34, name: 'Bandido Bruto',    hp: 120 },
      { tx: 62, ty: 34, name: 'Bandido Bruto',    hp: 120 },
    ];
    this.props = [
      { key: 'pillar',        tx: 6,  ty: 8,  scale: 2.0 },
      { key: 'pillar',        tx: 23, ty: 8,  scale: 2.0 },
      { key: 'pillar_broken', tx: 8,  ty: 24, scale: 2.0 },
      { key: 'pillar',        tx: 76, ty: 8,  scale: 2.0 },
      { key: 'pillar_broken', tx: 92, ty: 24, scale: 2.0 },
      { key: 'barrel',        tx: 36, ty: 18, scale: 2.5 },
      { key: 'barrel',        tx: 64, ty: 18, scale: 2.5 },
      { key: 'rock_a',        tx: 38, ty: 70, scale: 2.5 },
      { key: 'rock_b',        tx: 62, ty: 70, scale: 2.5 },
    ];
    this.playerSpawn    = { tx: 50, ty: ZONE_H - 4 };
    this.groundItemIds  = ['arena_toxica', 'scrap'];
    this.groundItemCount = 14;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 5: RUINAS ANTIGUAS (harder desert, big ruins)
  // ─────────────────────────────────────────────────────────────────────────────
  private genRuinas() {
    this.f(0, ZONE_H - 1, 0, ZONE_W - 1, T.SAND);
    this.f(0, ZONE_H - 1, 0,  2, T.WALL);
    this.f(0, ZONE_H - 1, ZONE_W - 3, ZONE_W - 1, T.WALL);
    // ── Large temple ruin north-west ──────────────────────────────────────────
    this.f(4, 32, 4, 40, T.WALL);    this.f(5, 31, 5, 39, T.SAND);
    this.f(14, 18, 4, 4, T.SAND);    // west door
    this.f(4, 4, 14, 26, T.SAND);    // roof hole
    this.f(18, 20, 15, 20, T.WALL);  // interior wall
    // ── Large temple ruin north-east ─────────────────────────────────────────
    this.f(4, 32, 60, 96, T.WALL);   this.f(5, 31, 61, 95, T.SAND);
    this.f(14, 18, 96, 96, T.SAND);
    this.f(4, 4, 70, 82, T.SAND);
    this.f(18, 20, 75, 80, T.WALL);
    // ── Mid ruins center-west ─────────────────────────────────────────────────
    this.f(38, 60, 18, 44, T.WALL);  this.f(39, 59, 19, 43, T.SAND);
    this.f(48, 50, 18, 18, T.SAND);
    // ── Mid ruins center-east ─────────────────────────────────────────────────
    this.f(38, 60, 56, 82, T.WALL);  this.f(39, 59, 57, 81, T.SAND);
    this.f(48, 50, 82, 82, T.SAND);
    this.openPassage();
    this.enemies = [
      { tx: 14, ty: 10, name: 'Chamán Corrupto', hp: 160 },
      { tx: 82, ty: 10, name: 'Esqueleto Mago',  hp: 95  },
      { tx: 22, ty: 44, name: 'Bandido Bruto',   hp: 120 },
      { tx: 76, ty: 44, name: 'Bandido Bruto',   hp: 120 },
      { tx: 36, ty: 63, name: 'Esqueleto Rogue', hp: 75  },
      { tx: 64, ty: 63, name: 'Esqueleto Rogue', hp: 75  },
      { tx: 50, ty: 70, name: 'Bandido Bruto',   hp: 120 },
    ];
    this.props = [
      { key: 'pillar_broken', tx: 5,  ty: 5,  scale: 2.0 },
      { key: 'pillar_broken', tx: 38, ty: 5,  scale: 2.0 },
      { key: 'pillar_broken', tx: 61, ty: 5,  scale: 2.0 },
      { key: 'pillar_broken', tx: 94, ty: 5,  scale: 2.0 },
      { key: 'pillar',        tx: 7,  ty: 30, scale: 2.0 },
      { key: 'pillar',        tx: 94, ty: 30, scale: 2.0 },
      { key: 'barrel',        tx: 22, ty: 50, scale: 2.5 },
      { key: 'barrel',        tx: 78, ty: 50, scale: 2.5 },
      { key: 'barrel_green',  tx: 40, ty: 68, scale: 2.5 },
      { key: 'rock_a',        tx: 45, ty: 73, scale: 2.5 },
    ];
    this.playerSpawn    = { tx: 50, ty: ZONE_H - 4 };
    this.groundItemIds  = ['arena_toxica', 'cristal_corrompido'];
    this.groundItemCount = 14;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 6: ZONA TÓXICA (hazard zone, narrow passage)
  // ─────────────────────────────────────────────────────────────────────────────
  private genToxic() {
    this.f(0, ZONE_H - 1, 0, ZONE_W - 1, T.TOXIC);
    // Impassable liquid sides
    this.f(0, ZONE_H - 1, 0,  3, T.WATER);
    this.f(0, ZONE_H - 1, ZONE_W - 4, ZONE_W - 1, T.WATER);
    // Toxic pools in rows (with PATH gap at center)
    const poolRows = [14, 32, 50, 64];
    for (const pr of poolRows) {
      this.f(pr, pr + 5, 4, 45, T.WATER);
      this.f(pr, pr + 5, 54, ZONE_W - 5, T.WATER);
    }
    // Island platforms (reachable via path)
    this.f(20, 28, 12, 22, T.TOXIC);
    this.f(20, 28, 78, 88, T.TOXIC);
    this.f(38, 46, 16, 28, T.TOXIC);
    this.f(38, 46, 72, 84, T.TOXIC);
    this.openPassage();
    this.enemies = [
      { tx: 16, ty: 6,  name: 'Chamán Corrupto', hp: 160 },
      { tx: 84, ty: 6,  name: 'Torreta',         hp: 100 },
      { tx: 18, ty: 24, name: 'Chamán Corrupto', hp: 160 },
      { tx: 82, ty: 26, name: 'Chamán Corrupto', hp: 160 },
      { tx: 50, ty: 42, name: 'Torreta',         hp: 100 },
      { tx: 35, ty: 70, name: 'Chamán Corrupto', hp: 160 },
    ];
    this.props = [
      { key: 'barrel_green', tx: 20, ty: 4,  scale: 2.5 },
      { key: 'barrel_green', tx: 78, ty: 4,  scale: 2.5 },
      { key: 'barrel_green', tx: 10, ty: 22, scale: 2.5 },
      { key: 'barrel_green', tx: 90, ty: 24, scale: 2.5 },
      { key: 'barrel_green', tx: 14, ty: 46, scale: 2.5 },
      { key: 'barrel_green', tx: 86, ty: 46, scale: 2.5 },
    ];
    this.playerSpawn    = { tx: 50, ty: ZONE_H - 4 };
    this.groundItemIds  = ['cristal_corrompido', 'arena_toxica'];
    this.groundItemCount = 10;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 7: DUNGEON (dungeon entry, skeleton hordes)
  // ─────────────────────────────────────────────────────────────────────────────
  private genDungeon() {
    this.f(0, ZONE_H - 1, 0, ZONE_W - 1, T.DUNGEON);
    this.f(0, ZONE_H - 1, 0,  1, T.FORT_WALL);
    this.f(0, ZONE_H - 1, ZONE_W - 2, ZONE_W - 1, T.FORT_WALL);
    // ── Room 1: west ─────────────────────────────────────────────────────────
    this.f(6, 30, 4, 40, T.FORT_WALL);   this.f(7, 29, 5, 39, T.DUNGEON);
    this.f(17, 19, 4, 4, T.DUNGEON);     // west door
    this.f(17, 19, 40, 40, T.PATH);      // east door
    // Pillars
    this.f(10, 12, 9, 11, T.FORT_WALL);  this.f(10, 12, 18, 20, T.FORT_WALL);
    this.f(22, 24, 9, 11, T.FORT_WALL);  this.f(22, 24, 18, 20, T.FORT_WALL);
    // Toxic pool inside room 1
    this.f(13, 18, 26, 36, T.WATER);
    // ── Room 2: east ─────────────────────────────────────────────────────────
    this.f(6, 30, 60, 96, T.FORT_WALL);  this.f(7, 29, 61, 95, T.DUNGEON);
    this.f(17, 19, 60, 60, T.PATH);
    this.f(17, 19, 96, 96, T.DUNGEON);
    this.f(10, 12, 79, 81, T.FORT_WALL); this.f(10, 12, 88, 90, T.FORT_WALL);
    this.f(22, 24, 79, 81, T.FORT_WALL); this.f(22, 24, 88, 90, T.FORT_WALL);
    this.f(13, 18, 64, 74, T.WATER);
    // ── Room 3: south-center large ───────────────────────────────────────────
    this.f(38, 72, 24, 76, T.FORT_WALL); this.f(39, 71, 25, 75, T.DUNGEON);
    this.f(54, 56, 24, 24, T.PATH);      // west door
    this.f(54, 56, 76, 76, T.PATH);      // east door
    this.f(38, 38, 47, 52, T.PATH);      // north door
    this.f(72, 72, 47, 52, T.PATH);      // south door
    // Interior pillars
    this.f(42, 44, 30, 32, T.FORT_WALL); this.f(42, 44, 44, 46, T.FORT_WALL);
    this.f(42, 44, 54, 56, T.FORT_WALL); this.f(42, 44, 68, 70, T.FORT_WALL);
    this.f(64, 66, 30, 32, T.FORT_WALL); this.f(64, 66, 68, 70, T.FORT_WALL);
    // Toxic pools
    this.f(50, 56, 33, 40, T.WATER);
    this.f(50, 56, 60, 67, T.WATER);
    this.openPassage();
    this.enemies = [
      { tx: 20, ty: 14, name: 'Esqueleto Base',  hp: 85  },
      { tx: 30, ty: 20, name: 'Esqueleto Rogue', hp: 75  },
      { tx: 74, ty: 14, name: 'Esqueleto Mago',  hp: 95  },
      { tx: 84, ty: 20, name: 'Esqueleto Base',  hp: 85  },
      { tx: 38, ty: 52, name: 'Chamán Corrupto', hp: 160 },
      { tx: 62, ty: 54, name: 'Esqueleto Mago',  hp: 95  },
      { tx: 50, ty: 64, name: 'Esqueleto Rogue', hp: 75  },
    ];
    this.props = [
      { key: 'cryobox', tx: 6,  ty: 8,  scale: 1.8 },
      { key: 'cryobox', tx: 36, ty: 8,  scale: 1.8 },
      { key: 'locker',  tx: 64, ty: 8,  scale: 2.2 },
      { key: 'locker',  tx: 66, ty: 8,  scale: 2.2 },
      { key: 'locker',  tx: 92, ty: 8,  scale: 2.2 },
      { key: 'locker',  tx: 94, ty: 8,  scale: 2.2 },
      { key: 'barrel',        tx: 30, ty: 44, scale: 2.2 },
      { key: 'barrel_green',  tx: 32, ty: 47, scale: 2.2 },
    ];
    this.playerSpawn    = { tx: 50, ty: ZONE_H - 4 };
    this.groundItemIds  = ['cristal_corrompido'];
    this.groundItemCount = 12;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 8: DUNGEON PROFUNDO (boss prep, heavy dungeon)
  // ─────────────────────────────────────────────────────────────────────────────
  private genDungeonDeep() {
    this.f(0, ZONE_H - 1, 0, ZONE_W - 1, T.DUNGEON);
    this.f(0, ZONE_H - 1, 0,  1, T.FORT_WALL);
    this.f(0, ZONE_H - 1, ZONE_W - 2, ZONE_W - 1, T.FORT_WALL);
    // ── Main chamber ─────────────────────────────────────────────────────────
    this.f(4, 36, 14, 86, T.FORT_WALL); this.f(5, 35, 15, 85, T.DUNGEON);
    this.f(19, 21, 14, 14, T.PATH);     // west door
    this.f(19, 21, 86, 86, T.PATH);     // east door
    this.f(4,  4,  47, 52, T.PATH);     // north door
    this.f(36, 36, 47, 52, T.PATH);     // south door
    // Pillar array inside
    for (const [r, c] of [[8,20],[8,30],[8,70],[8,80],[28,20],[28,30],[28,70],[28,80]]) {
      this.f(r, r + 2, c, c + 2, T.FORT_WALL);
    }
    // ── South rooms ──────────────────────────────────────────────────────────
    this.f(44, 70, 4, 44, T.FORT_WALL);  this.f(45, 69, 5, 43, T.DUNGEON);
    this.f(56, 58, 44, 44, T.PATH);
    this.f(44, 70, 56, 96, T.FORT_WALL); this.f(45, 69, 57, 95, T.DUNGEON);
    this.f(56, 58, 56, 56, T.PATH);
    // Toxic pools
    this.f(50, 56, 10, 22, T.WATER); this.f(50, 56, 28, 40, T.WATER);
    this.f(50, 56, 60, 72, T.WATER); this.f(50, 56, 78, 88, T.WATER);
    this.openPassage();
    this.enemies = [
      { tx: 28, ty: 12, name: 'Esqueleto Mago',  hp: 95  },
      { tx: 50, ty: 12, name: 'Chamán Corrupto', hp: 160 },
      { tx: 72, ty: 12, name: 'Esqueleto Mago',  hp: 95  },
      { tx: 20, ty: 28, name: 'Chamán Corrupto', hp: 160 },
      { tx: 80, ty: 28, name: 'Esqueleto Mago',  hp: 95  },
      { tx: 18, ty: 56, name: 'Esqueleto Rogue', hp: 75  },
      { tx: 78, ty: 56, name: 'Esqueleto Rogue', hp: 75  },
      { tx: 50, ty: 64, name: 'Torreta',         hp: 100 },
    ];
    this.props = [
      { key: 'biocomputer', tx: 16, ty: 6,  scale: 1.5 },
      { key: 'biocomputer', tx: 82, ty: 6,  scale: 1.5 },
      { key: 'cryobox',     tx: 16, ty: 22, scale: 1.8 },
      { key: 'cryobox',     tx: 82, ty: 22, scale: 1.8 },
      { key: 'lockers',     tx: 17, ty: 30, scale: 1.5 },
      { key: 'lockers',     tx: 80, ty: 30, scale: 1.5 },
      { key: 'barrel_green', tx: 6,  ty: 55, scale: 2.2 },
      { key: 'barrel_green', tx: 94, ty: 55, scale: 2.2 },
    ];
    this.playerSpawn    = { tx: 50, ty: ZONE_H - 4 };
    this.groundItemIds  = ['cristal_corrompido', 'placa_ia'];
    this.groundItemCount = 14;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZONE 9: BASE IA ENEMIGA (enemy base, boss zone)
  // ─────────────────────────────────────────────────────────────────────────────
  private genBaseIA() {
    this.f(0, ZONE_H - 1, 0, ZONE_W - 1, T.FORT);
    this.f(0, ZONE_H - 1, 0,  1, T.FORT_WALL);
    this.f(0, ZONE_H - 1, ZONE_W - 2, ZONE_W - 1, T.FORT_WALL);
    // North border (boss protected zone)
    this.f(0, 2, 0, ZONE_W - 1, T.FORT_WALL);
    this.f(0, 2, 46, 53, T.FORT); // north path through
    // ── Boss command center ───────────────────────────────────────────────────
    this.f(3, 28, 18, 82, T.FORT_WALL); this.f(4, 27, 19, 81, T.FORT);
    this.f(15, 17, 18, 18, T.PATH);     // west door
    this.f(15, 17, 82, 82, T.PATH);     // east door
    this.f(3,  3,  46, 53, T.PATH);     // boss door (north)
    this.f(28, 28, 46, 53, T.PATH);     // south door
    // Boss position in center of command room
    this.boss = { tx: 50, ty: 12, name: 'El Devorador', hp: 600 };
    // ── Secondary bunkers ─────────────────────────────────────────────────────
    this.f(34, 56, 4, 38, T.FORT_WALL); this.f(35, 55, 5, 37, T.FORT);
    this.f(44, 46, 38, 38, T.PATH);
    this.f(34, 56, 62, 96, T.FORT_WALL); this.f(35, 55, 63, 95, T.FORT);
    this.f(44, 46, 62, 62, T.PATH);
    // ── Guard towers (corners of command center) ──────────────────────────────
    this.f(3, 8, 18, 24, T.FORT_WALL);
    this.f(3, 8, 76, 82, T.FORT_WALL);
    this.f(22, 28, 18, 24, T.FORT_WALL);
    this.f(22, 28, 76, 82, T.FORT_WALL);
    // Main path
    this.openPassage();
    this.enemies = [
      { tx: 24, ty: 32, name: 'Bandido Tirador', hp: 80  },
      { tx: 76, ty: 32, name: 'Bandido Tirador', hp: 80  },
      { tx: 14, ty: 42, name: 'Bandido Bruto',   hp: 120 },
      { tx: 86, ty: 42, name: 'Bandido Bruto',   hp: 120 },
      { tx: 18, ty: 56, name: 'Torreta',         hp: 100 },
      { tx: 82, ty: 56, name: 'Torreta',         hp: 100 },
      { tx: 50, ty: 66, name: 'Bandido Tirador', hp: 80  },
      { tx: 32, ty: 70, name: 'Torreta',         hp: 100 },
      { tx: 68, ty: 70, name: 'Torreta',         hp: 100 },
    ];
    this.props = [
      { key: 'computer_evil', tx: 20, ty: 4,  scale: 2.0 },
      { key: 'computer_evil', tx: 80, ty: 4,  scale: 2.0 },
      { key: 'computer',      tx: 22, ty: 10, scale: 2.5 },
      { key: 'computer',      tx: 78, ty: 10, scale: 2.5 },
      { key: 'machine_a',     tx: 20, ty: 18, scale: 1.8 },
      { key: 'machine_a',     tx: 80, ty: 18, scale: 1.8 },
      { key: 'machine_b',     tx: 38, ty: 37, scale: 1.8 },
      { key: 'machine_b',     tx: 62, ty: 37, scale: 1.8 },
      { key: 'machine_c',     tx: 6,  ty: 44, scale: 1.8 },
      { key: 'machine_c',     tx: 94, ty: 44, scale: 1.8 },
      { key: 'barrel',        tx: 36, ty: 60, scale: 2.5 },
      { key: 'barrel',        tx: 64, ty: 60, scale: 2.5 },
    ];
    this.playerSpawn    = { tx: 50, ty: ZONE_H - 4 };
    this.groundItemIds  = ['placa_ia'];
    this.groundItemCount = 12;
  }
}

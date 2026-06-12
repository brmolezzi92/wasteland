import { Application, Container, Sprite, Graphics, Text, Assets, Texture, Rectangle } from 'pixi.js';
import { TileMap, TILE, TILE_SPRITE, TILE_COLOR, ZONE_NAMES, ZONE_COUNT, ZONE_W, ZONE_H } from './tilemap';
import { CLASSES, SPELLS, ITEMS } from '../data';

// El daño, CC y muerte los calcula el servidor (autoritativo). El cliente solo
// muestra los visuales que el servidor difunde.
const POTION_CD_KEY = 0.5;
const POTION_CD_CLICK = 0.4;

// Offsets de alineación del arte del sprite, por clase
const CLASS_OFFSET: Record<string, { x: number; y: number }> = {
  baluarte:    { x: -10, y: 10 },
  cuchilla:    { x: 0,   y: 10 },
  artillero:   { x: -10, y: 10 },
  medico_nano: { x: 0,   y: 10 },
  operador:    { x: 0,   y: 10 },
};

const col = (c: [number, number, number]) => (c[0] << 16) | (c[1] << 8) | c[2];

type AnimState = 'idle' | 'run';

interface AnimCfg { key: string; frames: number; size: number; }
interface SpriteCfg { idle: AnimCfg; run: AnimCfg; }

const SPRITE_CFG: Record<string, SpriteCfg> = {
  // Jugador
  player:              { idle: { key: 'player_idle',       frames: 4, size: 64 }, run: { key: 'player_run',        frames: 6, size: 64 } },
  // Enemigos mundo abierto
  'Bandido Tirador':   { idle: { key: 'orc_rogue_idle',    frames: 4, size: 32 }, run: { key: 'orc_rogue_run',     frames: 6, size: 64 } },
  'Bandido Bruto':     { idle: { key: 'orc_warrior_idle',  frames: 4, size: 32 }, run: { key: 'orc_warrior_run',   frames: 6, size: 64 } },
  'Torreta':           { idle: { key: 'skel_warrior_idle', frames: 4, size: 32 }, run: { key: 'skel_warrior_run',  frames: 6, size: 64 } },
  'El Devorador':      { idle: { key: 'orc_idle',          frames: 4, size: 32 }, run: { key: 'orc_run',           frames: 6, size: 64 } },
  // Enemigos dungeon
  'Chamán Corrupto':   { idle: { key: 'orc_shaman_idle',   frames: 4, size: 32 }, run: { key: 'orc_shaman_run',   frames: 6, size: 64 } },
  'Esqueleto Base':    { idle: { key: 'skel_base_idle',    frames: 4, size: 32 }, run: { key: 'skel_base_run',    frames: 6, size: 64 } },
  'Esqueleto Mago':    { idle: { key: 'skel_mage_idle',    frames: 4, size: 32 }, run: { key: 'skel_mage_run',    frames: 6, size: 64 } },
  'Esqueleto Rogue':   { idle: { key: 'skel_rogue_idle',   frames: 4, size: 32 }, run: { key: 'skel_rogue_run',   frames: 6, size: 64 } },
  // NPCs
  'Guardia':           { idle: { key: 'npc_knight_idle',   frames: 4, size: 32 }, run: { key: 'npc_knight_run',   frames: 6, size: 64 } },
  'Explorador':        { idle: { key: 'npc_rogue_idle',    frames: 4, size: 32 }, run: { key: 'npc_rogue_run',    frames: 6, size: 64 } },
  'Alquimista':        { idle: { key: 'npc_wizzard_idle',  frames: 4, size: 32 }, run: { key: 'npc_wizzard_run',  frames: 6, size: 64 } },
  'Comandante':        { idle: { key: 'npc_knight_idle',   frames: 4, size: 32 }, run: { key: 'npc_knight_run',   frames: 6, size: 64 } },
  'Mecánico':          { idle: { key: 'npc_wizzard_idle',  frames: 4, size: 32 }, run: { key: 'npc_wizzard_run',  frames: 6, size: 64 } },
  'Mercader':          { idle: { key: 'npc_rogue_idle',    frames: 4, size: 32 }, run: { key: 'npc_rogue_run',    frames: 6, size: 64 } },
};

const MOVE_KEYS: Record<string, [number, number]> = {
  w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1],
  a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0],
};

type CC = 'stun' | 'root' | 'slow' | null;

// Caracteres miden 30px reales en cualquier frame (medido). Scale fijo → tamaño consistente idle↔run.
const ENTITY_SCALE = 2.0;   // char muestra ~60px (~1 tile alto)
const BOSS_SCALE   = 3.0;

interface Entity {
  kind: 'player' | 'enemy' | 'boss' | 'npc';
  name: string;
  tileX: number; tileY: number;
  visX: number; visY: number;
  tgtX: number; tgtY: number;
  moving: boolean;
  hp: number; maxHp: number;
  alive: boolean;
  scale: number;
  sprite: Sprite;
  hpbar: Graphics;
  cc: CC; ccTimer: number;
  moveTimer: number;
  atkCd: number;
  hitTimer: number;
  baseScale: number;
  facing: number;
  animState: AnimState;
  animFrame: number;
  animTimer: number;
}

interface GroundItemData {
  itemId: string; qty: number; tileX: number; tileY: number; t: number;
}

export interface HudSpell {
  name: string; cost: number; cooldown: number; cd: number;
  ready: boolean; damageType: string; color: string; aim: string;
}
export interface MinimapDot { tx: number; ty: number; color: string; }
export interface LogEntry { msg: string; color: string; }
export interface RemotePlayerData {
  userId: string; username: string; classId: string;
  tx: number; ty: number; hp: number; maxHp: number;
  facing: number; moving: boolean;
}
export interface HudState {
  className: string; role: string;
  hp: number; maxHp: number; energy: number; maxEnergy: number;
  spells: HudSpell[]; pending: number | null;
  inventory: { itemId: string; qty: number }[]; selectedSlot: number | null;
  potionKey: number; potionClick: number;
  isGhost: boolean; ghostTimer: number; cc: CC; ccTimer: number;
  isInvisible: boolean;
  logs: LogEntry[];
  fps: number; ping: number;
  zoneName: string; zoneIdx: number;
  minimap: {
    mapW: number; mapH: number;
    playerTx: number; playerTy: number;
    dots: MinimapDot[];
  };
}

interface RemotePEntry {
  cont: Container; sprite: Sprite | Graphics; nameLabel: Text;
  hpBar: Graphics;
  visX: number; visY: number; tgtX: number; tgtY: number;
  hp: number; maxHp: number; facing: number; moving: boolean;
  animFrame: number; animTimer: number; animState: AnimState;
  lastSeen: number;
}

export class GameEngine {
  app: Application;
  world = new Container();
  tileLayer = new Container();
  gridLayer = new Graphics();
  groundG = new Graphics();
  entityLayer = new Container();
  fxLayer = new Container();
  previewG = new Graphics();
  overlayG = new Graphics();
  mouseWX = 0; mouseWY = 0;
  classOffset = { x: 0, y: 0 };
  hitstop = 0;
  pressedOrder: string[] = [];
  map: TileMap;
  classId: string;
  cls: any;

  currentZone = 0;
  pendingZoneChange: { idx: number; fromSouth: boolean } | null = null;
  onZoneChange: (() => void) | null = null;
  private _propSprites: Sprite[] = [];

  player!: Entity & {
    energy: number; maxEnergy: number; energyRegen: number; baseDamage: number;
    armor: number; moveTime: number; spellIds: string[]; spellCd: number[];
    isGhost: boolean; ghostTimer: number; spawnX: number; spawnY: number;
    shield: number; shieldTimer: number;
    isInvisible: boolean; invisTimer: number;
  };
  enemies: Entity[] = [];
  npcs: Entity[] = [];
  effects: { obj: Container; update: (dt: number) => boolean }[] = [];
  pendingDamage: { t: number; target: Entity; dmg: number; cc: CC; ccDur: number; wx: number; wy: number }[] = [];
  pendingAreas: { t: number; wx: number; wy: number; r: number; dmg: number; sp: any; c: number }[] = [];

  remotePlayers = new Map<string, RemotePEntry>();
  fps = 0; ping = 0;
  myUserId = '';

  // ── Intents hacia el servidor (los conecta Game.tsx con NetClient) ──────────
  onMove: ((tx: number, ty: number, facing: number, moving: boolean) => void) | null = null;
  onCast: ((intent: { spellId: string; enemyIdx?: number; wx?: number; wy?: number }) => void) | null = null;
  onZoneEnter: ((zoneIdx: number) => void) | null = null;
  onPickupIntent: ((tileX: number, tileY: number) => void) | null = null;
  onUsePotion: ((slot: number) => void) | null = null;
  onMatchmake: (() => void) | null = null;

  keys = new Set<string>();
  pending: number | null = null;
  selectedSlot: number | null = 0;
  inventory: ({ itemId: string; qty: number } | null)[] = [];
  groundItems: GroundItemData[] = [];
  potionKey = 0; potionClick = 0;
  logs: LogEntry[] = [];
  camX = 0; camY = 0;
  viewW = 800; viewH = 600;
  textures: Record<string, Texture> = {};
  animFrames: Record<string, Texture[]> = {};
  private _raf = 0;
  private _inited = false;
  private _destroyed = false;
  private _onResize = () => this.resize();

  constructor(classId: string) {
    this.classId = classId;
    this.cls = CLASSES[classId];
    this.map = new TileMap(0);
    this.app = new Application();
  }

  async init(host: HTMLElement) {
    this.viewW = host.clientWidth;
    this.viewH = host.clientHeight;
    await this.app.init({
      width: this.viewW, height: this.viewH, background: 0x0a0806, antialias: false,
    });
    // StrictMode puede haber pedido destroy mientras init corría
    if (this._destroyed) { try { this.app.destroy(true, { children: true }); } catch { /* */ } return; }
    host.appendChild(this.app.canvas);

    this.world.addChild(this.tileLayer, this.gridLayer, this.groundG, this.entityLayer, this.previewG, this.fxLayer, this.overlayG);
    this.entityLayer.sortableChildren = true;
    this.app.stage.addChild(this.world);

    await this.loadTextures();
    this.buildTiles();
    this.buildGrid();
    this.buildProps();
    this.spawnEntities();
    this.spawnGroundItems();

    // Input
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.app.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.app.canvas.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('resize', this._onResize);

    this.app.ticker.add((tk) => this.update(tk.deltaMS / 1000));
    this._inited = true;
  }

  // ── carga ────────────────────────────────────────────────────────────────
  async loadTextures() {
    const tileNames = ['floor', 'dirt', 'toxic', 'wall', 'path'];
    for (const n of tileNames) {
      try { this.textures[`/assets/tiles/${n}.png`] = await Assets.load(`/assets/tiles/${n}.png`); } catch { /* ignore */ }
    }
    const sheets: [string, number, number][] = [
      ['player_idle', 4, 64], ['player_run',  6, 64],
      ['orc_rogue_idle',    4, 32], ['orc_rogue_run',    6, 64],
      ['orc_warrior_idle',  4, 32], ['orc_warrior_run',  6, 64],
      ['skel_warrior_idle', 4, 32], ['skel_warrior_run', 6, 64],
      ['orc_idle', 4, 32], ['orc_run', 6, 64],
      ['orc_shaman_idle', 4, 32],   ['orc_shaman_run', 6, 64],
      ['skel_base_idle',  4, 32],   ['skel_base_run',  6, 64],
      ['skel_mage_idle',  4, 32],   ['skel_mage_run',  6, 64],
      ['skel_rogue_idle', 4, 32],   ['skel_rogue_run', 6, 64],
      ['npc_knight_idle',  4, 32], ['npc_knight_run',  6, 64],
      ['npc_rogue_idle',   4, 32], ['npc_rogue_run',   6, 64],
      ['npc_wizzard_idle', 4, 32], ['npc_wizzard_run', 6, 64],
    ];
    for (const [key, frames, size] of sheets) {
      try {
        const base: Texture = await Assets.load(`/assets/sprites/${key}.png`);
        const sliced: Texture[] = [];
        for (let i = 0; i < frames; i++)
          sliced.push(new Texture({ source: base.source, frame: new Rectangle(i * size, 0, size, size) }));
        this.animFrames[key] = sliced;
      } catch { /* sprite missing, will fall back to colored box */ }
    }
    const exSheets: [string, number, number][] = [
      ['explosion_sm', 8, 32], ['explosion_lg', 8, 48],
    ];
    for (const [key, frames, size] of exSheets) {
      try {
        const base: Texture = await Assets.load(`/assets/effects/${key}.png`);
        const sliced: Texture[] = [];
        for (let i = 0; i < frames; i++)
          sliced.push(new Texture({ source: base.source, frame: new Rectangle(i * size, 0, size, size) }));
        this.animFrames[key] = sliced;
      } catch { /* fallback circles */ }
    }
    const propKeys = [
      'tree_a', 'tree_b', 'bush_a', 'bush_b', 'rock_a', 'rock_b',
      'barrel', 'barrel_green', 'computer', 'computer_evil',
      'machine_a', 'machine_b', 'machine_c',
      'locker', 'lockers', 'cryobox', 'pillar', 'pillar_broken', 'biocomputer',
    ];
    for (const key of propKeys) {
      try { this.textures[`prop_${key}`] = await Assets.load(`/assets/props/${key}.png`); } catch { /* missing */ }
    }
  }

  buildTiles() {
    const byType = new Map<number, [number, number][]>();
    for (let ty = 0; ty < this.map.height; ty++)
      for (let tx = 0; tx < this.map.width; tx++) {
        const t = this.map.tiles[ty][tx];
        if (!byType.has(t)) byType.set(t, []);
        byType.get(t)!.push([tx, ty]);
      }
    for (const [tileType, positions] of byType) {
      const tex = this.textures[`/assets/tiles/${TILE_SPRITE[tileType]}.png`];
      if (tex) {
        for (const [tx, ty] of positions) {
          const s = new Sprite(tex);
          s.width = TILE; s.height = TILE;
          s.position.set(tx * TILE, ty * TILE);
          this.tileLayer.addChild(s);
        }
      } else {
        const c = TILE_COLOR[tileType] ?? 0x4e6e3c;
        const g = new Graphics();
        for (const [tx, ty] of positions) g.rect(tx * TILE, ty * TILE, TILE, TILE);
        g.fill(c);
        this.tileLayer.addChild(g);
      }
    }
  }

  buildProps() {
    for (const spr of this._propSprites) { spr.parent?.removeChild(spr); spr.destroy(); }
    this._propSprites = [];
    for (const p of this.map.props) {
      const tex = this.textures[`prop_${p.key}`];
      if (!tex) continue;
      const spr = new Sprite(tex);
      spr.anchor.set(0.5, 1.0);
      spr.scale.set(p.scale ?? 1.0);
      spr.position.set(p.tx * TILE + TILE / 2, p.ty * TILE + TILE);
      spr.zIndex = p.ty * TILE + TILE;
      this.entityLayer.addChild(spr);
      this._propSprites.push(spr);
    }
  }

  buildGrid() {
    const g = this.gridLayer;
    const L = 5;
    for (let ty = 0; ty < this.map.height; ty++)
      for (let tx = 0; tx < this.map.width; tx++) {
        const x = tx * TILE, y = ty * TILE;
        g.poly([x, y + L, x, y, x + L, y]);
        g.poly([x + TILE - L, y, x + TILE, y, x + TILE, y + L]);
        g.poly([x, y + TILE - L, x, y + TILE, x + L, y + TILE]);
        g.poly([x + TILE - L, y + TILE, x + TILE, y + TILE, x + TILE, y + TILE - L]);
      }
    g.stroke({ width: 2, color: 0xffffff, alpha: 0.45 });
  }

  makeEntity(kind: Entity['kind'], name: string, tx: number, ty: number,
             _texUrl: string, hp: number, scale: number): Entity {
    const cfgKey = kind === 'player' ? 'player' : name;
    const cfg = SPRITE_CFG[cfgKey];
    const idleCfg = cfg?.idle;
    const firstFrames = idleCfg ? this.animFrames[idleCfg.key] : null;

    let spr: Sprite;
    if (firstFrames?.length) {
      spr = new Sprite(firstFrames[0]);
      spr.anchor.set(0.5, 1.0);
      spr.scale.set(kind === 'boss' ? BOSS_SCALE : ENTITY_SCALE);
    } else {
      // Fallback: colored box (no sprite loaded)
      const FALLBACK_COLORS: Record<string, number> = {
        'Bandido Tirador': 0xcc7722, 'Bandido Bruto': 0x882211,
        'Torreta': 0x335566, 'El Devorador': 0x770022,
        'Chamán Corrupto': 0x6622aa, 'Esqueleto Base': 0xccccaa,
        'Esqueleto Mago': 0x4488ff, 'Esqueleto Rogue': 0xaaccaa,
      };
      let boxColor = kind === 'player'
        ? col((CLASSES[this.classId]?.color ?? [68, 136, 204]) as [number, number, number])
        : (FALLBACK_COLORS[name] ?? 0xaa3333);
      const bossH = kind === 'boss' ? TILE * 2 : TILE * 1.5;
      const bossW = kind === 'boss' ? TILE * 1.5 : TILE;
      const g = new Graphics();
      g.rect(-bossW / 2, -bossH, bossW, bossH).fill(boxColor)
       .rect(-bossW / 2, -bossH, bossW, bossH).stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
      spr = g as unknown as Sprite;  // Graphics satisfies the positional API we use
    }

    const hpbar = new Graphics();
    const cont = new Container();
    cont.addChild(spr, hpbar);
    this.entityLayer.addChild(cont);
    const e: Entity = {
      kind, name, tileX: tx, tileY: ty, visX: tx * TILE, visY: ty * TILE,
      tgtX: tx * TILE, tgtY: ty * TILE, moving: false,
      hp, maxHp: hp, alive: true, scale, sprite: spr, hpbar,
      cc: null, ccTimer: 0, moveTimer: 0, atkCd: 0,
      hitTimer: 0, baseScale: 1, facing: 1,
      animState: 'idle', animFrame: 0, animTimer: 0,
    };
    (e as any).cont = cont;
    return e;
  }

  spawnEntities() {
    const { tx: cx, ty: cy } = this.map.playerSpawn;
    const st = this.cls.stats;
    const p = this.makeEntity('player', this.cls.name, cx, cy, '', st.max_hp, 1) as any;
    p.energy = st.max_energy; p.maxEnergy = st.max_energy; p.energyRegen = st.energy_regen;
    p.baseDamage = st.base_damage; p.armor = st.armor;
    p.moveTime = 0.25 * (st.move_time_multiplier || 1);
    p.spellIds = this.cls.spells; p.spellCd = new Array(this.cls.spells.length).fill(0);
    p.isGhost = false; p.ghostTimer = 0; p.spawnX = cx; p.spawnY = cy;
    p.shield = 0; p.shieldTimer = 0;
    p.isInvisible = false; p.invisTimer = 0;
    this.player = p;
    this.classOffset = CLASS_OFFSET[this.classId] || { x: 0, y: 0 };
    this.spawnEnemiesNpcs();
    this.inventory = [
      { itemId: 'hp_potion', qty: 12 }, { itemId: 'mp_potion', qty: 12 },
      { itemId: 'hp_potion_large', qty: 6 }, { itemId: 'mp_potion_large', qty: 6 },
      ...Array(20).fill(null),
    ];
  }

  spawnEnemiesNpcs() {
    for (const { tx, ty, name, hp } of this.map.enemies)
      this.enemies.push(this.makeEntity('enemy', name, tx, ty, '', hp, 1));
    if (this.map.boss) {
      const { tx, ty, name, hp } = this.map.boss;
      this.enemies.push(this.makeEntity('boss', name, tx, ty, '', hp, 1));
    }
    this.npcs = this.map.npcs.map(({ tx, ty, name }) =>
      this.makeEntity('npc', name, tx, ty, '', 999, 1));
  }

  // ── ground items (autoritativos en el servidor) ───────────────────────────
  // El servidor genera y posee los items; el cliente solo los renderiza desde
  // los snapshots. No se generan items localmente.
  spawnGroundItems() { /* no-op: el servidor provee los items via snapshot */ }

  tryPickup() {
    const p = this.player;
    if (p.isGhost || !p.alive) return;
    const idx = this.groundItems.findIndex(gi => gi.tileX === p.tileX && gi.tileY === p.tileY);
    if (idx === -1) return;
    const gi = this.groundItems[idx];
    // Optimista: lo saco localmente y aviso al server; el snapshot corrige si falla.
    this.groundItems.splice(idx, 1);
    const name = ITEMS[gi.itemId]?.name ?? gi.itemId;
    this.floatText(p.visX + TILE / 2, p.visY, `+${gi.qty} ${name}`, 0xffe080);
    this.onPickupIntent?.(gi.tileX, gi.tileY);
  }

  // Reemplaza los items del piso desde el snapshot del servidor.
  applyGroundItemsFromServer(items: { itemId: string; qty: number; tx: number; ty: number }[]) {
    // Conserva la fase de animación de items que persisten entre snapshots.
    const prev = new Map(this.groundItems.map(g => [`${g.tileX},${g.tileY}`, g.t]));
    this.groundItems = items.map(it => ({
      itemId: it.itemId, qty: it.qty, tileX: it.tx, tileY: it.ty,
      t: prev.get(`${it.tx},${it.ty}`) ?? Math.random() * Math.PI * 2,
    }));
  }

  addItemToInventory(itemId: string, qty: number) {
    const existing = this.inventory.find(s => s?.itemId === itemId);
    if (existing) { existing.qty += qty; return; }
    const emptyIdx = this.inventory.findIndex(s => s === null);
    if (emptyIdx !== -1) this.inventory[emptyIdx] = { itemId, qty };
  }

  drawGroundItems(dt: number) {
    const g = this.groundG;
    g.clear();
    const p = this.player;
    for (const gi of this.groundItems) {
      gi.t += dt;
      const cx = gi.tileX * TILE + TILE / 2;
      const cy = gi.tileY * TILE + TILE * 0.72;
      const pulse = 0.6 + 0.4 * Math.sin(gi.t * 3.2);
      const item = ITEMS[gi.itemId];
      const c = item ? col(item.color as [number, number, number]) : 0xaaaaaa;
      // Sombra
      g.roundRect(cx - 5, cy - 2, 10, 7, 2).fill({ color: 0x000000, alpha: 0.4 });
      // Chip
      g.roundRect(cx - 5, cy - 4, 10, 7, 2).fill({ color: c, alpha: 0.9 });
      g.roundRect(cx - 5, cy - 4, 10, 7, 2).stroke({ width: 1.5, color: 0xfff0a0, alpha: pulse });
      // Anillo de pickup cuando el player está encima
      if (!p.isGhost && p.tileX === gi.tileX && p.tileY === gi.tileY) {
        const r = 13 + 2 * Math.sin(gi.t * 8);
        g.circle(cx, cy, r).stroke({ width: 2, color: 0xffe080, alpha: 0.85 });
      }
    }
  }

  // ── input ────────────────────────────────────────────────────────────────
  onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (MOVE_KEYS[k] && !this.pressedOrder.includes(k)) this.pressedOrder.push(k);
    if (e.key === 'Escape') this.cancelCast();
    if (k === 'u') this.usePotionKey();
    if (k === ' ') { e.preventDefault(); this.tryPickup(); }
  };
  onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    this.pressedOrder = this.pressedOrder.filter((x) => x !== k);
  };

  // Última dirección presionada que siga apretada (giros instantáneos)
  readMoveInput(): [number, number] {
    for (let i = this.pressedOrder.length - 1; i >= 0; i--) {
      const k = this.pressedOrder[i];
      if (this.keys.has(k)) return MOVE_KEYS[k];
    }
    return [0, 0];
  }

  addLog(msg: string, color = '#f0e4cc') {
    this.logs.push({ msg, color });
    if (this.logs.length > 50) this.logs.shift();
  }

  onPointerDown = (e: PointerEvent) => {
    const rect = this.app.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const wx = sx + this.camX, wy = sy + this.camY;
    if (e.button === 2) { this.cancelCast(); return; }

    // Sin hechizo cargado: inspect entidad
    if (this.pending === null) {
      const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
      const enemy = this.enemyAtTile(tx, ty);
      if (enemy) {
        const hostile = enemy.kind === 'boss' ? '⚠ JEFE' : '⚔ Hostil';
        const color = enemy.kind === 'boss' ? '#ff4444' : '#e06020';
        this.addLog(`${enemy.name} — HP: ${Math.round(enemy.hp)}/${enemy.maxHp} — ${hostile}`, color);
        return;
      }
      const npc = this.npcs.find(n => n.alive && n.tileX === tx && n.tileY === ty);
      if (npc) {
        const NPC_DIALOGUE: Record<string, string> = {
          'Comandante':  '📋 "Avanza al norte y neutraliza la Base IA. Trae una Placa IA como prueba."',
          'Explorador':  '🗺 "El dungeon esconde peligros y Cristales Corrompidos. Ve preparado."',
          'Alquimista':  '⚗ "Necesito Hierba Medicinal del bosque para preparar mis pociones."',
          'Mecánico':    '🔧 "Con Placas IA puedo mejorar tu equipo. Consígueme 5."',
          'Mercader':    '💰 "Compro materiales: Scrap, Arena Tóxica, Madera. ¿Qué traes?"',
        };
        const line = NPC_DIALOGUE[npc.name] ?? `${npc.name} — ✦ Pacífico`;
        this.addLog(line, '#78d25a');
        return;
      }
      return;
    }
    this.worldClick(wx, wy);
  };
  onPointerMove = (e: PointerEvent) => {
    const rect = this.app.canvas.getBoundingClientRect();
    this.mouseWX = e.clientX - rect.left + this.camX;
    this.mouseWY = e.clientY - rect.top + this.camY;
  };

  // ── API para React ─────────────────────────────────────────────────────────
  loadSpell(idx: number) {
    const p = this.player;
    if (p.isGhost || idx >= p.spellIds.length) return;
    const sp = SPELLS[p.spellIds[idx]];
    const cost = sp.energy_cost || 0;
    if (p.spellCd[idx] > 0 || p.energy < cost) return;
    const mode = this.targetMode(sp);
    if (mode === 'instant') { this.castInstant(idx); return; }
    this.pending = idx;
    document.body.style.cursor = 'crosshair';
  }
  cancelCast() { this.pending = null; document.body.style.cursor = 'default'; }

  selectSlot(i: number) { this.selectedSlot = i; }
  usePotionKey() { if (this.selectedSlot != null) this.usePotion('key', this.selectedSlot); }
  usePotionClick(i: number) { this.usePotion('click', i); }

  targetMode(sp: any): 'instant' | 'ground' | 'enemy' | 'ally' {
    const dt = sp.damage_type;
    if (['self', 'aoe_self', 'melee_area', 'aoe_heal', 'single_target_heal'].includes(dt)) return 'instant';
    if (dt === 'resurrect') return 'ally';   // revivir = single target (clic en aliado caído)
    if (dt === 'aoe_targeted') return 'ground';
    return 'enemy';
  }

  isGroundSpell(): boolean {
    if (this.pending == null) return false;
    return this.targetMode(SPELLS[this.player.spellIds[this.pending]]) === 'ground';
  }

  // ── update loop ────────────────────────────────────────────────────────────
  update(dt: number) {
    dt = Math.min(dt, 0.05);
    if (this.pendingZoneChange) {
      const { idx, fromSouth } = this.pendingZoneChange;
      this.pendingZoneChange = null;
      this.loadZone(idx, fromSouth);
      return;
    }
    if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.18; }
    this.updatePlayer(dt);
    // Enemigos: el servidor es autoritativo, el cliente solo interpola.
    for (const e of this.enemies) this.lerpEnemy(dt, e);
    this.updatePendingAreas(dt);
    this.updateEffects(dt);
    this.updateRemotePlayers(dt);
    this.updateCamera();
    this.drawGroundItems(dt);
    this.syncSprites(dt);
  }

  updatePlayer(dt: number) {
    const p = this.player;
    p.hitTimer = Math.max(0, p.hitTimer - dt);
    p.energy = Math.min(p.maxEnergy, p.energy + p.energyRegen * dt);
    for (let i = 0; i < p.spellCd.length; i++) p.spellCd[i] = Math.max(0, p.spellCd[i] - dt);
    this.potionKey = Math.max(0, this.potionKey - dt);
    this.potionClick = Math.max(0, this.potionClick - dt);
    if (p.ccTimer > 0) { p.ccTimer -= dt; if (p.ccTimer <= 0) p.cc = null; }
    if (p.shieldTimer > 0) { p.shieldTimer -= dt; if (p.shieldTimer <= 0) p.shield = 0; }
    if (p.invisTimer > 0) { p.invisTimer -= dt; if (p.invisTimer <= 0) p.isInvisible = false; }

    // Fantasma y respawn los controla el servidor (forceZone + you).
    if (p.isGhost) {
      this.moveEntity(dt, p, p.moveTime, true);
      return;
    }
    this.moveEntity(dt, p, p.moveTime, false);
  }

  moveEntity(dt: number, e: Entity, moveTime: number, ghost: boolean) {
    const blocked = !ghost && (e.cc === 'stun' || e.cc === 'root');
    let dx = 0, dy = 0;
    if (e.kind === 'player' && !blocked) {
      [dx, dy] = this.readMoveInput();
      if (dx !== 0) e.facing = dx > 0 ? 1 : -1;
    }
    let speed = TILE / moveTime;
    if (!ghost && e.cc === 'slow') speed *= 0.4;

    if (!e.moving && (dx || dy)) this.tryMove(e, dx, dy, ghost);
    if (e.moving) {
      const ddx = e.tgtX - e.visX, ddy = e.tgtY - e.visY;
      const dist = Math.hypot(ddx, ddy), step = speed * dt;
      if (step >= dist) {
        e.visX = e.tgtX; e.visY = e.tgtY; e.moving = false;
        if (e.kind === 'player' && (dx || dy)) this.tryMove(e, dx, dy, ghost);
      } else { e.visX += ddx / dist * step; e.visY += ddy / dist * step; }
    }
  }

  tryMove(e: Entity, dx: number, dy: number, ghost: boolean): boolean {
    const nx = e.tileX + dx, ny = e.tileY + dy;
    // Zone transitions for player on north/south edge
    if (e.kind === 'player') {
      if (ny < 0 && this.currentZone < ZONE_COUNT - 1) {
        this.pendingZoneChange = { idx: this.currentZone + 1, fromSouth: true };
        return false;
      }
      if (ny >= ZONE_H && this.currentZone > 0) {
        this.pendingZoneChange = { idx: this.currentZone - 1, fromSouth: false };
        return false;
      }
    }
    if (this.map.isSolid(nx, ny)) return false;
    if (!ghost) {
      const all = e.kind === 'player' ? this.enemies : [this.player, ...this.enemies];
      for (const o of all) if (o !== e && o.alive && o.tileX === nx && o.tileY === ny) return false;
    }
    e.tileX = nx; e.tileY = ny; e.tgtX = nx * TILE; e.tgtY = ny * TILE; e.moving = true;
    // El jugador reporta su movimiento al servidor (autoritativo del mundo).
    if (e.kind === 'player') this.onMove?.(nx, ny, e.facing, true);
    return true;
  }

  loadZone(idx: number, fromSouth: boolean) {
    const tx = Math.floor(ZONE_W / 2);
    const ty = fromSouth ? ZONE_H - 4 : 3;
    this.loadZoneTo(idx, tx, ty);
  }

  // Carga una zona y posiciona al jugador en (tx,ty). Avisa al servidor.
  loadZoneTo(idx: number, tx: number, ty: number) {
    this.currentZone = idx;
    this.map = new TileMap(idx);
    for (const c of [...this.tileLayer.children]) c.destroy();
    this.tileLayer.removeChildren();
    this.gridLayer.clear();
    this.groundG.clear();
    for (const e of [...this.enemies, ...this.npcs]) {
      const cont = (e as any).cont as Container;
      cont?.parent?.removeChild(cont); cont?.destroy({ children: true });
    }
    this.enemies = []; this.npcs = [];
    for (const fx of this.effects) { fx.obj.parent?.removeChild(fx.obj); fx.obj.destroy(); }
    this.effects = []; this.pendingDamage = []; this.pendingAreas = [];
    this.groundItems = [];
    this.player.tileX = tx; this.player.tileY = ty;
    this.player.tgtX = tx * TILE; this.player.tgtY = ty * TILE;
    this.player.visX = this.player.tgtX; this.player.visY = this.player.tgtY;
    this.player.moving = false;
    this.player.spawnX = tx; this.player.spawnY = ty;
    this.buildTiles(); this.buildGrid(); this.buildProps();
    this.spawnEnemiesNpcs();
    this.addLog(`▶ ${ZONE_NAMES[idx]}`, '#88ddff');
    this.onZoneChange?.();       // rebuild minimap
    this.onZoneEnter?.(idx);     // avisar al servidor
  }

  // ── combate (intents al servidor; el servidor resuelve el daño) ────────────
  // El cliente muestra el visual de inmediato para feedback, pero el daño,
  // muerte y CC los decide el servidor y vuelven como eventos 'fx'/'you'.
  worldClick(wx: number, wy: number) {
    if (this.pending == null) return;
    const idx = this.pending;
    const sp = SPELLS[this.player.spellIds[idx]];
    const mode = this.targetMode(sp);
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (mode === 'ground') {
      this.castGroundVisual(sp, wx, wy);
      this.sendCast(idx, { wx, wy });
      this.cancelCast();
    } else if (mode === 'ally') {
      this.floatText(wx, wy, 'Sin aliado caído', 0xc8c850); this.cancelCast();
    } else {
      const enemy = this.enemyAtTile(tx, ty);
      if (enemy) {
        this.castEnemyVisual(sp, enemy);
        this.sendCast(idx, { enemyIdx: this.enemies.indexOf(enemy) });
        this.cancelCast();
      } else { this.floatText(wx, wy, '¡Sin impacto!', 0xff6464); this.cancelCast(); }
    }
  }

  // Cooldown/energía optimistas para que el HUD responda ya; el server corrige.
  private sendCast(idx: number, extra: { enemyIdx?: number; wx?: number; wy?: number }) {
    const sp = SPELLS[this.player.spellIds[idx]];
    this.player.energy = Math.max(0, this.player.energy - (sp.energy_cost || 0));
    this.player.spellCd[idx] = sp.cooldown || 1.5;
    this.onCast?.({ spellId: this.player.spellIds[idx], ...extra });
  }

  castInstant(idx: number) {
    const sp = SPELLS[this.player.spellIds[idx]]; const p = this.player;
    const dt = sp.damage_type; const c = col((sp.color as any) || [200, 200, 200]);
    const aoeR = (sp as any).aoe_radius || 64;
    const pcx = p.visX + TILE / 2, pcy = p.visY + TILE / 2;
    // Buffs propios: aplicamos optimista para respuesta inmediata.
    if (dt === 'self') {
      if ((sp as any).invisible_duration) {
        p.isInvisible = true; p.invisTimer = (sp as any).invisible_duration;
        this.floatText(pcx, pcy - TILE, 'CAMUFLAJE', 0xb4dc64);
      }
      if ((sp as any).cleanse) { p.cc = null; p.ccTimer = 0; this.floatText(pcx, pcy - TILE, 'CC LIMPIADO', 0x64dcff); }
    } else if (dt === 'single_target_heal' || dt === 'aoe_heal') {
      this.floatText(pcx, pcy - TILE, 'CURACIÓN', 0x78dc8c);
    }
    this.explosion(pcx, pcy, c, aoeR);
    this.sendCast(idx, {});
  }

  // Solo visual: telegraph del AoE en el piso.
  castGroundVisual(sp: any, wx: number, wy: number) {
    const c = col(sp.color || [200, 200, 200]);
    const aoeR = sp.aoe_radius || 96;
    this.aoeTelegraph(wx, wy, c, aoeR, 0.35);
  }

  updatePendingAreas(dt: number) {
    // El daño de área lo resuelve el servidor; acá solo expira telegraphs viejos.
    const keep: typeof this.pendingAreas = [];
    for (const a of this.pendingAreas) { a.t -= dt; if (a.t > 0) keep.push(a); }
    this.pendingAreas = keep;
  }

  // Tiles de aviso que pulsan durante el delay del AoE
  aoeTelegraph(x: number, y: number, c: number, max: number, dur: number) {
    const cells = this.tilesInRadius(x, y, max);
    const g = new Graphics(); this.fxLayer.addChild(g); let t = 0;
    this.effects.push({ obj: g, update: (dt) => {
      t += dt; const k = t / dur;
      const a = 0.12 + 0.18 * Math.abs(Math.sin(t * 12));   // pulso
      g.clear();
      for (const [tx, ty] of cells) g.rect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
      g.fill({ color: c, alpha: a }).stroke({ width: 2, color: c, alpha: 0.5 + 0.4 * k });
      return t >= dur;
    }});
  }

  tilesInRadius(x: number, y: number, max: number): [number, number][] {
    const ctx = Math.floor(x / TILE), cty = Math.floor(y / TILE);
    const span = Math.ceil(max / TILE) + 1;
    const cells: [number, number][] = [];
    for (let ty = cty - span; ty <= cty + span; ty++)
      for (let tx = ctx - span; tx <= ctx + span; tx++) {
        const cxp = tx * TILE + TILE / 2, cyp = ty * TILE + TILE / 2;
        if (Math.hypot(cxp - x, cyp - y) <= max) cells.push([tx, ty]);
      }
    return cells;
  }

  // Solo visual: proyectil o explosión sobre el enemigo objetivo.
  castEnemyVisual(sp: any, enemy: Entity) {
    this.player.isInvisible = false; this.player.invisTimer = 0;
    const c = col(sp.color || [200, 200, 200]);
    const tx = enemy.visX + TILE / 2, ty = enemy.visY + TILE / 2;
    const pcx = this.player.visX + TILE / 2, pcy = this.player.visY + TILE / 2;
    if (sp.effect === 'projectile') this.projectile(pcx, pcy, tx, ty, c);
    else this.explosion(tx, ty, c, 44);
  }

  enemyAtTile(tx: number, ty: number): Entity | null {
    for (const e of this.enemies) if (e.alive && e.tileX === tx && e.tileY === ty) return e;
    return null;
  }

  // ── Aplicación de estado autoritativo del servidor ─────────────────────────
  // Snapshot de la zona: enemigos, items y otros jugadores.
  applyServerSnapshot(snap: {
    zoneIdx: number;
    enemies: { idx: number; tx: number; ty: number; hp: number; alive: boolean; facing: number; cc: string | null }[];
    items: { itemId: string; qty: number; tx: number; ty: number }[];
    players: RemotePlayerData[];
  }) {
    if (snap.zoneIdx !== this.currentZone) return; // ignorar snapshots de otra zona
    for (const s of snap.enemies) {
      const e = this.enemies[s.idx]; if (!e) continue;
      e.tgtX = s.tx * TILE; e.tgtY = s.ty * TILE;
      e.tileX = s.tx; e.tileY = s.ty;
      e.facing = s.facing;
      e.cc = (s.cc as CC) ?? null;
      if (e.alive && !s.alive) { e.alive = false; e.hp = 0; this.addLog(`${e.name} fue eliminado.`, '#ff4444'); }
      else if (s.alive) { e.hp = s.hp; e.alive = true; }
    }
    this.applyGroundItemsFromServer(snap.items);
    // Otros jugadores (excluyo a mí mismo)
    const seen = new Set<string>();
    for (const np of snap.players) {
      if (np.userId === this.myUserId) continue;
      seen.add(np.userId);
      this.upsertRemotePlayer(np);
    }
    for (const [uid] of this.remotePlayers) if (!seen.has(uid)) this.removeRemotePlayer(uid);
  }

  // Estado propio autoritativo (HP, energía, inventario, fantasma).
  applyServerYou(y: { hp?: number; energy?: number; isGhost?: boolean; isInvisible?: boolean;
                      inventory?: ({ itemId: string; qty: number } | null)[] }) {
    const p = this.player;
    if (y.hp != null) { if (y.hp < p.hp) p.hitTimer = 0.13; p.hp = y.hp; }
    if (y.energy != null) p.energy = y.energy;
    if (y.isGhost != null) { p.isGhost = y.isGhost; p.sprite.alpha = y.isGhost ? 0.45 : 1; }
    if (y.isInvisible != null) p.isInvisible = y.isInvisible;
    if (y.inventory) this.inventory = y.inventory;
  }

  // Evento visual puntual difundido por el servidor.
  applyServerFx(fx: { kind: string; wx: number; wy: number; wx2?: number; wy2?: number;
                      amount?: number; color?: number; text?: string; targetUserId?: string }) {
    const c = fx.color ?? 0xffaa40;
    switch (fx.kind) {
      case 'hit':
        if (fx.text) this.floatText(fx.wx, fx.wy - TILE, fx.text, c);
        this.hitstop = Math.max(this.hitstop, 0.04);
        break;
      case 'heal':
        this.floatText(fx.wx, fx.wy - TILE, `+${fx.amount ?? 0}`, 0x78dc8c);
        this.explosion(fx.wx, fx.wy, c, 60);
        break;
      case 'explosion':
        this.explosion(fx.wx, fx.wy, c, fx.amount ?? 60);
        break;
      case 'projectile':
        if (fx.wx2 != null && fx.wy2 != null) this.projectile(fx.wx, fx.wy, fx.wx2, fx.wy2, c);
        break;
      case 'death':
        this.explosion(fx.wx, fx.wy, 0xff5050, 50);
        break;
    }
  }

  // El servidor fuerza una zona/posición (respawn, entrada a duelo).
  applyForceZone(zoneIdx: number, tx: number, ty: number) {
    if (zoneIdx !== this.currentZone) {
      this.pendingZoneChange = null;
      this.loadZoneTo(zoneIdx, tx, ty);
    } else {
      const p = this.player;
      p.tileX = tx; p.tileY = ty; p.tgtX = tx * TILE; p.tgtY = ty * TILE;
      p.visX = p.tgtX; p.visY = p.tgtY; p.moving = false;
    }
  }

  // ── potions ──────────────────────────────────────────────────────────────
  usePotion(method: 'key' | 'click', idx: number) {
    if ((method === 'key' ? this.potionKey : this.potionClick) > 0) return;
    const slot = this.inventory[idx]; if (!slot) return;
    const data = ITEMS[slot.itemId]; if (!data || data.type !== 'consumable') return;
    // El servidor descuenta del inventario autoritativo y devuelve hp/energía.
    this.onUsePotion?.(idx);
    if (method === 'key') this.potionKey = POTION_CD_KEY; else this.potionClick = POTION_CD_CLICK;
  }

  // ── efectos (Pixi) ─────────────────────────────────────────────────────────
  projectile(x0: number, y0: number, x1: number, y1: number, c: number) {
    const g = new Graphics(); this.fxLayer.addChild(g);
    const d = Math.hypot(x1 - x0, y1 - y0) || 1; const sp = 600;
    const vx = (x1 - x0) / d * sp, vy = (y1 - y0) / d * sp;
    let x = x0, y = y0;
    this.effects.push({ obj: g, update: (dt) => {
      x += vx * dt; y += vy * dt;
      g.clear().circle(x, y, 7).fill(c).circle(x, y, 7).stroke({ width: 2, color: 0xffffff });
      return ((x1 - x) * vx + (y1 - y) * vy) <= 0;
    }});
  }
  explosion(x: number, y: number, c: number, max: number) {
    const key = max >= 60 ? 'explosion_lg' : 'explosion_sm';
    const frames = this.animFrames[key];
    if (frames?.length) {
      const scale = max >= 60 ? 2.2 : 1.6;
      const spr = new Sprite(frames[0]);
      spr.anchor.set(0.5); spr.position.set(x, y); spr.scale.set(scale);
      this.fxLayer.addChild(spr);
      let t = 0; const dur = 0.42; const fps = frames.length / dur;
      this.effects.push({ obj: spr, update: (dt) => {
        t += dt;
        const fi = Math.min(frames.length - 1, Math.floor(t * fps));
        spr.texture = frames[fi];
        spr.alpha = 1 - t / dur;
        return t >= dur;
      }});
    } else {
      // Fallback círculo si el sprite no cargó
      const g = new Graphics(); this.fxLayer.addChild(g); let t = 0; const dur = 0.38;
      this.effects.push({ obj: g, update: (dt) => {
        t += dt; const k = t / dur; const r = Math.max(1, max * k);
        g.clear().circle(x, y, r).stroke({ width: Math.max(1, 5 * (1 - k)), color: c, alpha: 1 - k });
        return t >= dur;
      }});
    }
  }
  aoeIndicator(x: number, y: number, c: number, max: number) {
    const cells = this.tilesInRadius(x, y, max);   // rasterizado cuadrado
    const g = new Graphics(); this.fxLayer.addChild(g); let t = 0; const dur = 0.5;
    this.effects.push({ obj: g, update: (dt) => {
      t += dt; const k = t / dur; g.clear();
      for (const [tx, ty] of cells) g.rect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
      g.fill({ color: c, alpha: 0.28 * (1 - k) }).stroke({ width: 2, color: c, alpha: 0.7 * (1 - k) });
      return t >= dur;
    }});
  }
  floatText(x: number, y: number, text: string, c: number) {
    const t = new Text({ text, style: { fontFamily: 'Oswald, sans-serif', fontSize: 24, fontWeight: '700', fill: c, stroke: { color: 0x000000, width: 4 } } });
    t.anchor.set(0.5); t.position.set(x, y); this.fxLayer.addChild(t);
    let life = 0; const dur = 1.0;
    this.effects.push({ obj: t, update: (dt) => {
      life += dt; const k = life / dur;
      // Pop: salta a 1.25 y asienta a 1.0
      const s = k < 0.18 ? 0.7 + (k / 0.18) * 0.55 : 1.25 - Math.min(1, (k - 0.18) / 0.2) * 0.25;
      t.scale.set(s);
      t.y -= 30 * dt; t.alpha = 1 - k * k;
      return life >= dur;
    }});
  }
  updateEffects(dt: number) {
    this.effects = this.effects.filter((fx) => {
      const done = fx.update(dt); if (done) fx.obj.destroy(); return !done;
    });
  }

  // ── cámara + sprites ────────────────────────────────────────────────────────
  updateCamera() {
    const p = this.player;
    this.camX = Math.max(0, Math.min(p.visX + TILE / 2 - this.viewW / 2, this.map.width * TILE - this.viewW));
    this.camY = Math.max(0, Math.min(p.visY + TILE / 2 - this.viewH / 2, this.map.height * TILE - this.viewH));
    this.world.x = -this.camX; this.world.y = -this.camY;
  }

  drawHpBar(e: Entity) {
    const g = e.hpbar; g.clear();
    if (!e.alive || e.kind === 'player') return;
    const bossW = e.kind === 'boss' ? TILE * 1.5 : TILE;
    const bossH = e.kind === 'boss' ? TILE * 2 : TILE * 1.5;
    // cont is positioned at entity bottom-center, so these local coords are above the sprite
    const x = -bossW / 2, y = -bossH - 8;
    g.rect(x, y, bossW, 5).fill(0x1a0808);
    g.rect(x, y, bossW * (e.hp / e.maxHp), 5).fill(e.kind === 'boss' ? 0xc83250 : 0xc83232);
  }

  stepAnim(e: Entity, dt: number) {
    const cfgKey = (e.kind === 'player') ? 'player' : e.name;
    const cfg = SPRITE_CFG[cfgKey];
    if (!cfg) return;

    const newState: AnimState = e.moving ? 'run' : 'idle';
    if (newState !== e.animState) { e.animState = newState; e.animFrame = 0; e.animTimer = 0; }

    const anim = newState === 'run' ? cfg.run : cfg.idle;
    const fps = newState === 'run' ? 10 : 6;
    e.animTimer += dt;
    if (e.animTimer >= 1 / fps) {
      e.animTimer -= 1 / fps;
      e.animFrame = (e.animFrame + 1) % anim.frames;
    }

    const frames = this.animFrames[anim.key];
    if (frames?.length) {
      (e.sprite as Sprite).texture = frames[Math.min(e.animFrame, frames.length - 1)];
    }

    const pop = e.hitTimer > 0 ? 1 + (e.hitTimer / 0.13) * 0.16 : 1;
    const base = e.kind === 'boss' ? BOSS_SCALE : ENTITY_SCALE;
    e.sprite.scale.x = e.facing * base * pop;
    e.sprite.scale.y = base * pop;
  }

  syncSprites(dt: number) {
    const place = (e: Entity) => {
      const cont = (e as any).cont as Container;
      cont.visible = e.alive;
      const yOff = e.kind === 'player' ? this.classOffset.y : 0;
      cont.x = e.visX + TILE / 2;
      cont.y = e.visY + TILE + yOff;
      cont.zIndex = e.visY + TILE;
      this.drawHpBar(e);
      this.stepAnim(e, dt);
      (e.sprite as any).tint = e.hitTimer > 0 ? 0xffd8c8
        : e.cc === 'stun' ? 0xffe632 : e.cc === 'slow' ? 0x9a8a68 : 0xffffff;
    };
    place(this.player);
    this.player.sprite.alpha = this.player.isGhost ? 0.35 : this.player.isInvisible ? 0.3 : 1;
    for (const e of this.enemies) place(e);
    for (const n of this.npcs) place(n);
    this.drawPreview();
    this.drawOverlay();
  }

  // ── overlay: hover del objetivo + cursor cargado ───────────────────────────
  drawOverlay() {
    const g = this.overlayG; g.clear();
    if (this.pending == null) return;
    const sp = SPELLS[this.player.spellIds[this.pending]] as any;
    const c = col(sp.color || [230, 160, 40]);
    const mode = this.targetMode(sp);
    const tx = Math.floor(this.mouseWX / TILE), ty = Math.floor(this.mouseWY / TILE);

    // Highlight del tile objetivo (solo single-target: el hitbox es el tile)
    if (mode === 'enemy') {
      const target = this.enemyAtTile(tx, ty);
      const valid = !!target;
      const hc = valid ? 0x66e06a : 0xc85a4a;   // verde válido / rojo inválido
      g.rect(tx * TILE + 2, ty * TILE + 2, TILE - 4, TILE - 4)
        .fill({ color: hc, alpha: valid ? 0.22 : 0.10 })
        .stroke({ width: 2, color: hc, alpha: valid ? 0.9 : 0.4 });
    }
    // Cursor "cargado": anillo del color de la habilidad
    g.circle(this.mouseWX, this.mouseWY, 11).stroke({ width: 2, color: c, alpha: 0.9 });
    g.circle(this.mouseWX, this.mouseWY, 4).fill({ color: c, alpha: 0.9 });
  }

  // ── preview de área rasterizada a tiles ("círculo con bordes cuadrados") ────
  drawPreview() {
    const g = this.previewG; g.clear();
    if (!this.isGroundSpell()) return;
    const sp = SPELLS[this.player.spellIds[this.pending!]] as any;
    const r = sp.aoe_radius || 96;
    const c = col(sp.color || [220, 160, 40]);
    const wx = this.mouseWX, wy = this.mouseWY;
    const ctx = Math.floor(wx / TILE), cty = Math.floor(wy / TILE);
    const span = Math.ceil(r / TILE) + 1;
    for (let ty = cty - span; ty <= cty + span; ty++)
      for (let tx = ctx - span; tx <= ctx + span; tx++) {
        const cxp = tx * TILE + TILE / 2, cyp = ty * TILE + TILE / 2;
        if (Math.hypot(cxp - wx, cyp - wy) <= r) {
          g.rect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
        }
      }
    g.fill({ color: c, alpha: 0.18 }).stroke({ width: 1.5, color: c, alpha: 0.55 });
  }

  // ── Interpolación de enemigos (estado autoritativo del servidor) ───────────
  lerpEnemy(dt: number, e: Entity) {
    e.hitTimer = Math.max(0, e.hitTimer - dt);
    if (!e.alive) return;
    const ddx = e.tgtX - e.visX, ddy = e.tgtY - e.visY;
    const dist = Math.hypot(ddx, ddy);
    if (dist > 1) {
      const speed = TILE / 0.25;
      const step = speed * dt;
      if (step >= dist) { e.visX = e.tgtX; e.visY = e.tgtY; e.moving = false; }
      else { e.visX += (ddx / dist) * step; e.visY += (ddy / dist) * step; e.moving = true; }
    } else {
      e.moving = false;
    }
  }

  // ── Remote players ───────────────────────────────────────────────────────────
  upsertRemotePlayer(data: RemotePlayerData) {
    let entry = this.remotePlayers.get(data.userId);
    if (!entry) {
      const cont = new Container();
      let sprite: Sprite | Graphics;
      const frames = this.animFrames['player_idle'];
      if (frames?.length) {
        sprite = new Sprite(frames[0]);
        (sprite as Sprite).anchor.set(0.5, 1);
      } else {
        sprite = new Graphics().rect(-14, -32, 28, 32).fill(0x4488ff);
      }
      const hpBar = new Graphics();
      const nameLabel = new Text({
        text: data.username,
        style: { fontFamily: 'Oswald, sans-serif', fontSize: 13, fontWeight: '700', fill: 0x88ccff, stroke: { color: 0x000000, width: 3 } },
      });
      nameLabel.anchor.set(0.5, 1);
      nameLabel.y = -36;
      cont.addChild(sprite, hpBar, nameLabel);
      this.entityLayer.addChild(cont);
      entry = {
        cont, sprite, nameLabel, hpBar,
        visX: data.tx * TILE, visY: data.ty * TILE,
        tgtX: data.tx * TILE, tgtY: data.ty * TILE,
        hp: data.hp, maxHp: data.maxHp,
        facing: data.facing, moving: data.moving,
        animFrame: 0, animTimer: 0, animState: 'idle',
        lastSeen: Date.now(),
      };
      this.remotePlayers.set(data.userId, entry);
    } else {
      entry.tgtX = data.tx * TILE;
      entry.tgtY = data.ty * TILE;
      entry.hp = data.hp; entry.maxHp = data.maxHp;
      entry.facing = data.facing; entry.moving = data.moving;
      entry.nameLabel.text = data.username;
      entry.lastSeen = Date.now();
    }
  }

  removeRemotePlayer(userId: string) {
    const entry = this.remotePlayers.get(userId);
    if (entry) { entry.cont.destroy(); this.remotePlayers.delete(userId); }
  }

  updateRemotePlayers(dt: number) {
    const speed = TILE / 0.18; // same feel as local player movement
    for (const [, e] of this.remotePlayers) {
      const ddx = e.tgtX - e.visX, ddy = e.tgtY - e.visY;
      const dist = Math.hypot(ddx, ddy);
      e.moving = dist > 2;
      if (e.moving) {
        const step = speed * dt;
        if (step >= dist) { e.visX = e.tgtX; e.visY = e.tgtY; }
        else { e.visX += (ddx / dist) * step; e.visY += (ddy / dist) * step; }
      }

      // Animate
      const newState: AnimState = e.moving ? 'run' : 'idle';
      if (newState !== e.animState) { e.animState = newState; e.animFrame = 0; e.animTimer = 0; }
      const animKey = e.moving ? 'player_run' : 'player_idle';
      const cfg = e.moving ? { frames: 6 } : { frames: 4 };
      const fps = e.moving ? 10 : 6;
      e.animTimer += dt;
      if (e.animTimer >= 1 / fps) { e.animTimer -= 1 / fps; e.animFrame = (e.animFrame + 1) % cfg.frames; }
      const frames = this.animFrames[animKey];
      if (frames?.length && e.sprite instanceof Sprite) {
        e.sprite.texture = frames[Math.min(e.animFrame, frames.length - 1)];
      }
      e.sprite.scale.x = e.facing * ENTITY_SCALE;
      e.sprite.scale.y = ENTITY_SCALE;

      // HP bar
      const g = e.hpBar; g.clear();
      const bw = TILE, bh = 5;
      const bx = -bw / 2, by = -(TILE * 1.5) - 8;
      g.rect(bx, by, bw, bh).fill(0x1a0808);
      g.rect(bx, by, bw * Math.max(0, e.hp / Math.max(1, e.maxHp)), bh).fill(0x4488ff);

      // Position container
      e.cont.x = e.visX + TILE / 2;
      e.cont.y = e.visY + TILE + 10;
      e.cont.zIndex = e.visY + TILE + 1;
    }
  }

  getHud(): HudState {
    const p = this.player;
    const aimLabel = (dt: string) => ['self', 'aoe_self', 'melee_area', 'aoe_heal', 'single_target_heal'].includes(dt)
      ? 'instantáneo' : dt === 'aoe_targeted' ? 'área' : dt === 'resurrect' ? 'aliado' : 'objetivo';
    const spells: HudSpell[] = p.spellIds.map((id, i) => {
      const s = SPELLS[id]; const cost = s.energy_cost || 0;
      return {
        name: s.name, cost, cooldown: s.cooldown, cd: p.spellCd[i],
        ready: p.spellCd[i] <= 0 && p.energy >= cost,
        damageType: s.damage_type, color: `rgb(${s.color.join(',')})`, aim: aimLabel(s.damage_type),
      };
    });
    const dots: MinimapDot[] = [];
    for (const e of this.enemies) if (e.alive) dots.push({ tx: e.tileX, ty: e.tileY, color: e.kind === 'boss' ? '#ff4444' : '#e06020' });
    for (const n of this.npcs)    if (n.alive) dots.push({ tx: n.tileX, ty: n.tileY, color: '#78d25a' });
    for (const [, r] of this.remotePlayers) dots.push({ tx: r.tgtX / TILE, ty: r.tgtY / TILE, color: '#44aaff' });
    return {
      className: this.cls.name, role: this.cls.role,
      hp: Math.round(p.hp), maxHp: p.maxHp, energy: Math.round(p.energy), maxEnergy: p.maxEnergy,
      spells, pending: this.pending,
      inventory: this.inventory.map((s) => s ? { itemId: s.itemId, qty: s.qty } : null).filter(Boolean) as any,
      selectedSlot: this.selectedSlot,
      potionKey: this.potionKey, potionClick: this.potionClick,
      isGhost: p.isGhost, ghostTimer: p.ghostTimer, cc: p.cc, ccTimer: p.ccTimer,
      isInvisible: p.isInvisible,
      logs: this.logs.slice(-8),
      fps: Math.round(this.fps), ping: Math.round(this.ping),
      minimap: { mapW: ZONE_W, mapH: ZONE_H, playerTx: p.tileX, playerTy: p.tileY, dots },
      zoneName: ZONE_NAMES[this.currentZone], zoneIdx: this.currentZone,
    };
  }

  resize() {
    const host = this.app.canvas.parentElement; if (!host) return;
    this.viewW = host.clientWidth; this.viewH = host.clientHeight;
    this.app.renderer.resize(this.viewW, this.viewH);
  }

  destroy() {
    this._destroyed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this._onResize);
    cancelAnimationFrame(this._raf);
    document.body.style.cursor = 'default';
    if (this._inited) { try { this.app.destroy(true, { children: true }); } catch { /* */ } }
  }
}

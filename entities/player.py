import pygame
import json
import math
from settings import TILE_SIZE, TILE_MOVE_TIME, GHOST_DURATION, GHOST_REVIVE_HP, GHOST_REVIVE_EN
from entities.assets import assets

# Alto de los sprites de personaje (sobresalen hacia arriba del tile)
SPRITE_H = int(TILE_SIZE * 1.9)

# Cargado una vez al import
_CLASSES = None
def _get_classes():
    global _CLASSES
    if _CLASSES is None:
        with open("data/classes.json", encoding="utf-8") as f:
            _CLASSES = json.load(f)
    return _CLASSES

BASE_MOVE_SPEED = TILE_SIZE / TILE_MOVE_TIME

class Player:
    # CC states
    CC_NONE  = None
    CC_STUN  = "stun"   # no move, no cast
    CC_ROOT  = "root"   # no move, can cast
    CC_SLOW  = "slow"   # reduced speed

    def __init__(self, tile_x, tile_y, player_class="baluarte"):
        self.tile_x = tile_x
        self.tile_y = tile_y
        self._vis_x = float(tile_x * TILE_SIZE)
        self._vis_y = float(tile_y * TILE_SIZE)
        self._tgt_x = self._vis_x
        self._tgt_y = self._vis_y
        self._moving = False

        # Spawn point for ghost respawn
        self._spawn_x = tile_x
        self._spawn_y = tile_y

        self.set_class(player_class)

        # ── CC state ──────────────────────────────────────────────────────────
        self.cc_type   = self.CC_NONE
        self.cc_timer  = 0.0
        self.cc_slow_factor = 0.5  # velocidad = normal * (1 - slow_factor)

        # ── Ghost / Proyección Cuántica ───────────────────────────────────────
        self.is_ghost    = False
        self.ghost_timer = 0.0
        self._ghost_alpha = 140   # transparencia del sprite

        # ── Invisible (Protocolo Camuflaje) ───────────────────────────────────
        self.is_invisible     = False
        self.invisible_timer  = 0.0
        self.first_hit_bonus  = 0.0   # multiplicador del primer golpe invisible

        # ── Shield (Barrera de Datos) ─────────────────────────────────────────
        self.shield       = 0
        self.shield_timer = 0.0

        # ── Ranks / ELO ───────────────────────────────────────────────────────
        self.elo_1v1 = 1500
        self.elo_2v2 = 1500
        self.elo_4v4 = 1500

    # ── Class loading ─────────────────────────────────────────────────────────

    def set_class(self, class_id: str):
        self.player_class = class_id
        cls = _get_classes().get(class_id, {})
        stats = cls.get("stats", {})

        self.max_hp       = stats.get("max_hp",    200)
        self.hp           = self.max_hp
        self.max_energy   = stats.get("max_energy", 250)
        self.energy       = float(self.max_energy)
        self.energy_regen = stats.get("energy_regen", 8)
        self.base_damage  = stats.get("base_damage", 60)
        self.armor        = stats.get("armor", 10)
        self._move_mult   = stats.get("move_time_multiplier", 1.0)
        self._move_speed  = BASE_MOVE_SPEED / self._move_mult
        self._class_color = tuple(cls.get("color", [200, 200, 50]))
        self.spell_ids    = cls.get("spells", [])

    # ── MP alias (algunos sistemas usan mp) ───────────────────────────────────
    @property
    def mp(self): return self.energy
    @mp.setter
    def mp(self, v): self.energy = v
    @property
    def max_mp(self): return self.max_energy

    @property
    def elo_general(self):
        return (self.elo_1v1 + self.elo_2v2 + self.elo_4v4) // 3

    # ── Pixel position ────────────────────────────────────────────────────────
    @property
    def pixel_x(self): return int(self._vis_x)
    @property
    def pixel_y(self): return int(self._vis_y)

    # ── CC helpers ────────────────────────────────────────────────────────────

    def apply_cc(self, cc_type: str, duration: float):
        if self.is_ghost:
            return
        # Stun overrides root; anything overrides slow
        if self.cc_type == self.CC_STUN and cc_type != self.CC_STUN:
            return  # stun can't be overridden by weaker CC
        self.cc_type  = cc_type
        self.cc_timer = duration

    def clear_cc(self):
        self.cc_type  = self.CC_NONE
        self.cc_timer = 0.0

    @property
    def can_move(self):
        return (not self.is_ghost and
                self.cc_type not in (self.CC_STUN, self.CC_ROOT))

    @property
    def can_cast(self):
        return not self.is_ghost and self.cc_type != self.CC_STUN

    # ── Damage / death ────────────────────────────────────────────────────────

    def take_damage(self, amount: int) -> int:
        """Aplica daño considerando escudo y armadura. Retorna daño real."""
        # Romper invisibilidad al recibir daño
        self.is_invisible = False

        # Escudo absorbe primero
        if self.shield > 0:
            absorbed = min(self.shield, amount)
            self.shield -= absorbed
            amount     -= absorbed
            if amount <= 0:
                return absorbed

        # Armadura reduce daño
        reduced = max(0, amount - self.armor // 3)
        self.hp = max(0, self.hp - reduced)

        if self.hp <= 0 and not self.is_ghost:
            self._die()

        return reduced

    def _die(self):
        self.is_ghost    = True
        self.ghost_timer = GHOST_DURATION
        self.hp          = 0
        self.cc_type     = self.CC_NONE

    def revive(self):
        """Llamado cuando Nanopárticulas aterriza sobre este jugador fantasma."""
        if not self.is_ghost:
            return
        self.is_ghost   = False
        self.ghost_timer = 0.0
        self.hp          = max(1, int(self.max_hp * GHOST_REVIVE_HP))
        self.energy      = max(1, int(self.max_energy * GHOST_REVIVE_EN))
        # Vuelve al tile donde estaba
        self._vis_x = float(self.tile_x * TILE_SIZE)
        self._vis_y = float(self.tile_y * TILE_SIZE)
        self._tgt_x = self._vis_x
        self._tgt_y = self._vis_y

    def force_respawn(self):
        """Respawn forzado cuando el ghost_timer expira."""
        self.revive()
        self.tile_x = self._spawn_x
        self.tile_y = self._spawn_y
        self._vis_x = float(self._spawn_x * TILE_SIZE)
        self._vis_y = float(self._spawn_y * TILE_SIZE)
        self._tgt_x = self._vis_x
        self._tgt_y = self._vis_y

    # ── Update ────────────────────────────────────────────────────────────────

    def update(self, dt, keys, tilemap, enemies=None):
        # Regen energía
        self.energy = min(self.max_energy, self.energy + self.energy_regen * dt)

        # Timers CC
        if self.cc_timer > 0:
            self.cc_timer -= dt
            if self.cc_timer <= 0:
                self.clear_cc()

        # Ghost timer
        if self.is_ghost:
            self.ghost_timer -= dt
            if self.ghost_timer <= 0:
                self.force_respawn()
            self._update_movement(dt, keys, tilemap, enemies, ghost=True)
            return

        # Shield timer
        if self.shield_timer > 0:
            self.shield_timer -= dt
            if self.shield_timer <= 0:
                self.shield = 0

        # Invisible timer
        if self.is_invisible:
            self.invisible_timer -= dt
            if self.invisible_timer <= 0:
                self.is_invisible   = False
                self.first_hit_bonus = 0.0

        self._update_movement(dt, keys, tilemap, enemies, ghost=False)

    def _update_movement(self, dt, keys, tilemap, enemies, ghost):
        # Ghost puede moverse sin restricción de CC pero no puede atacar
        blocked = not ghost and not self.can_move

        dx, dy = 0, 0
        if not blocked:
            if   keys[pygame.K_UP]    or keys[pygame.K_w]: dy = -1
            elif keys[pygame.K_DOWN]  or keys[pygame.K_s]: dy =  1
            elif keys[pygame.K_LEFT]  or keys[pygame.K_a]: dx = -1
            elif keys[pygame.K_RIGHT] or keys[pygame.K_d]: dx =  1

        speed = self._move_speed
        if not ghost and self.cc_type == self.CC_SLOW:
            speed *= (1.0 - self.cc_slow_factor)

        if not self._moving and (dx or dy):
            self._try_move(dx, dy, tilemap, enemies)

        if self._moving:
            dist = math.hypot(self._tgt_x - self._vis_x, self._tgt_y - self._vis_y)
            step = speed * dt
            if step >= dist:
                self._vis_x = self._tgt_x
                self._vis_y = self._tgt_y
                self._moving = False
                if dx or dy:
                    self._try_move(dx, dy, tilemap, enemies)
            else:
                ratio = step / dist
                self._vis_x += (self._tgt_x - self._vis_x) * ratio
                self._vis_y += (self._tgt_y - self._vis_y) * ratio

    def _try_move(self, dx, dy, tilemap, enemies=None):
        nx, ny = self.tile_x + dx, self.tile_y + dy
        if tilemap.is_solid(nx, ny):
            return
        if not self.is_ghost and enemies:
            for e in enemies:
                if getattr(e, "alive", False) and e.tile_x == nx and e.tile_y == ny:
                    if self.is_invisible:
                        self.is_invisible = False  # El contacto físico rompe el camuflaje
                        self.invisible_timer = 0.0
                        self.first_hit_bonus = 0.0
                    return
        self.tile_x = nx
        self.tile_y = ny
        self._tgt_x = float(nx * TILE_SIZE)
        self._tgt_y = float(ny * TILE_SIZE)
        self._moving = True

    # ── Draw ──────────────────────────────────────────────────────────────────

    def draw(self, surface, sx, sy):
        ts = TILE_SIZE
        cx = sx + ts // 2
        cy = sy + ts // 2
        r  = ts // 2 - 2

        if self.is_ghost:
            self._draw_ghost(surface, cx, cy, r)
            return

        alpha = 90 if self.is_invisible else 255

        # 1) Intentar sprite PNG (assets/players/<clase>.png)
        # +10px: baja el sprite para que quede mejor centrado en el tile
        drew = assets.blit_entity(surface, f"players/{self.player_class}.png",
                                  cx, sy + ts + 10, SPRITE_H, alpha)

        # 2) Fallback: círculo de siempre
        if not drew:
            col     = self._class_color
            outline = tuple(min(255, c + 60) for c in col)
            if self.cc_type == self.CC_STUN:   col = (230, 230, 80)
            elif self.cc_type == self.CC_ROOT: col = (80, 200, 255)
            elif self.cc_type == self.CC_SLOW: col = tuple(int(c * 0.6) for c in col)

            if self.is_invisible:
                buf = pygame.Surface((ts, ts), pygame.SRCALPHA)
                pygame.draw.ellipse(buf, (20,20,20,60), (cx-sx-r, cy-sy+r-3, r*2, 6))
                pygame.draw.circle(buf, (*col, 80), (cx-sx, cy-sy), r)
                surface.blit(buf, (sx, sy))
            else:
                pygame.draw.ellipse(surface, (20,20,20), (cx-r, cy+r-3, r*2, 6))
                pygame.draw.circle(surface, col, (cx, cy), r)
                pygame.draw.circle(surface, outline, (cx, cy), r, 2)
                pygame.draw.circle(surface, outline, (cx, cy - r + 5), 3)

        # 3) Overlays de estado (siempre, sobre sprite o círculo)
        if self.shield > 0:
            pygame.draw.circle(surface, (100, 160, 255), (cx, cy), r + 5, 2)
        if self.cc_type == self.CC_STUN:
            for i in range(4):
                a = i * math.pi / 2 + pygame.time.get_ticks() * 0.003
                px2 = cx + int((r+8)*math.cos(a))
                py2 = cy + int((r+8)*math.sin(a))
                pygame.draw.circle(surface, (255, 230, 50), (px2, py2), 4)
        elif self.cc_type == self.CC_ROOT:
            pygame.draw.circle(surface, (80, 200, 255), (cx, cy), r + 4, 2)

    def _draw_ghost(self, surface, cx, cy, r):
        buf = pygame.Surface((r*2+20, r*2+20), pygame.SRCALPHA)
        bc  = r + 10
        # Aura exterior pulsante
        pulse = int(30 + 20 * math.sin(pygame.time.get_ticks() * 0.004))
        pygame.draw.circle(buf, (150, 200, 255, pulse), (bc, bc), r + 8, 2)
        # Cuerpo semitransparente
        pygame.draw.circle(buf, (180, 220, 255, 120), (bc, bc), r)
        pygame.draw.circle(buf, (220, 240, 255, 160), (bc, bc), r, 2)
        surface.blit(buf, (cx - bc, cy - bc))

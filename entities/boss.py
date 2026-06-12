import pygame
import math
from settings import TILE_SIZE, TILE_MOVE_TIME
from entities.assets import assets, slugify

_MOVE_SPEED  = TILE_SIZE / (TILE_MOVE_TIME * 1.6)   # un poco más lento que player
_BOSS_SPRITE_H = int(TILE_SIZE * 3.0)               # el boss es grande

IDLE    = "idle"
CHASE   = "chase"
ATTACK  = "attack"
RETREAT = "retreat"

class Boss:
    DETECT_RANGE = 16   # tiles para activarse
    MELEE_RANGE  = 1.5  # tiles para golpe melee

    def __init__(self, tile_x, tile_y):
        self.tile_x   = tile_x
        self.tile_y   = tile_y
        self._vis_x   = float(tile_x * TILE_SIZE)
        self._vis_y   = float(tile_y * TILE_SIZE)
        self._tgt_x   = self._vis_x
        self._tgt_y   = self._vis_y
        self._moving  = False

        self.name     = "El Devorador"
        self.scale    = 3.0 / 1.9   # para hitbox de clic (sprite = 3 tiles de alto)
        self.max_hp   = 500
        self.hp       = 500
        self.max_mp   = 250
        self.mp       = 250.0
        self.mp_regen = 6.0
        self.alive    = True

        self._state        = IDLE
        self._move_timer   = 0.0
        self._move_interval= 0.35

        # Cooldowns de habilidades
        self._cd_melee  = 0.0
        self._cd_ranged = 0.0
        self._cd_slam   = 0.0   # habilidad especial fase 2

        # Proyectiles en vuelo → (tiempo_restante, daño)
        self._projectiles = []

        self._phase = 1   # cambia a 2 cuando HP < 50%

        # CC stats
        self.cc_type = None
        self.cc_timer = 0.0
        self.cc_slow_factor = 0.4

    def apply_cc(self, cc_type, duration):
        if not self.alive:
            return
        # Tenacidad del Boss: Stun y Root duran la mitad (50%)
        tenacious_dur = duration
        if cc_type in ("stun", "root"):
            tenacious_dur *= 0.5
        if self.cc_type == "stun" and cc_type != "stun":
            return
        self.cc_type = cc_type
        self.cc_timer = tenacious_dur

    def clear_cc(self):
        self.cc_type = None
        self.cc_timer = 0.0

    # ── propiedades visuales ───────────────────────────────────────────────────

    @property
    def pixel_x(self): return int(self._vis_x)
    @property
    def pixel_y(self): return int(self._vis_y)

    # ── daño ──────────────────────────────────────────────────────────────────

    def take_damage(self, amount):
        self.hp = max(0, self.hp - amount)
        if self.hp <= 0:
            self.alive = False

    # ── update ────────────────────────────────────────────────────────────────

    def update(self, dt, player, tilemap, other_enemies, effects):
        """
        Retorna una lista de valores de daño a aplicar al player este frame.
        `effects` es la lista compartida de game.py — el boss añade efectos directamente.
        """
        if not self.alive:
            return []

        from entities.effects import (MeleeSlash, ExplosionEffect,
                                       ProjectileEffect, FloatingText, AoEIndicator)

        self.mp = min(self.max_mp, self.mp + self.mp_regen * dt)
        
        # CC updates
        if self.cc_timer > 0:
            self.cc_timer -= dt
            if self.cc_timer <= 0:
                self.clear_cc()

        # Si está stuneado, no se mueve y no ataca
        if self.cc_type == "stun":
            self._moving = False
            return []

        self._cd_melee  = max(0, self._cd_melee  - dt)
        self._cd_ranged = max(0, self._cd_ranged - dt)
        self._cd_slam   = max(0, self._cd_slam   - dt)
        self._move_timer= max(0, self._move_timer - dt)

        # Fase 2 al 50% HP
        hp_pct = self.hp / self.max_hp
        self._phase = 1 if hp_pct > 0.5 else 2

        # Proyectiles en vuelo
        dmg_to_player = []
        still_flying  = []
        for (t, dmg) in self._projectiles:
            t -= dt
            if t <= 0:
                dmg_to_player.append(dmg)
            else:
                still_flying.append((t, dmg))
        self._projectiles = still_flying

        # Distancia al player (tiles)
        dist = math.hypot(self.tile_x - player.tile_x,
                          self.tile_y - player.tile_y)

        # Detección de invisibilidad: solo detecta a rango cuerpo a cuerpo cercano (<= 1.5)
        player_visible = True
        if getattr(player, "is_invisible", False):
            player_visible = (dist <= 1.5)

        # ── State machine ──────────────────────────────────────────────────
        if not player_visible or dist > self.DETECT_RANGE:
            self._state = IDLE
        elif hp_pct < 0.25 and dist > 4:
            self._state = RETREAT
        elif dist <= self.MELEE_RANGE + 0.6:
            self._state = ATTACK
        else:
            self._state = CHASE

        # ── Movimiento ────────────────────────────────────────────────────
        can_move = (self.cc_type != "root")
        if can_move and self._move_timer <= 0 and not self._moving:
            if self._state == CHASE:
                self._move_toward(player.tile_x, player.tile_y,
                                  tilemap, other_enemies)
            elif self._state == RETREAT:
                dx = self.tile_x - player.tile_x
                dy = self.tile_y - player.tile_y
                # Solo cardinal — alejarse por el eje de mayor distancia
                if abs(dx) >= abs(dy):
                    self._try_move(1 if dx > 0 else -1, 0, tilemap, other_enemies)
                elif dy != 0:
                    self._try_move(0, 1 if dy > 0 else -1, tilemap, other_enemies)
            
            interval = self._move_interval * (0.7 if self._phase == 2 else 1.0)
            if self.cc_type == "slow":
                interval /= (1.0 - self.cc_slow_factor)
            self._move_timer = interval

        # ── Ataques ───────────────────────────────────────────────────────
        if player_visible:
            if self._state == ATTACK:
                self._melee_attack(player, effects)
            if dist <= 8 and self._state in (CHASE, ATTACK):
                self._ranged_attack(player, effects)
            if self._phase == 2 and dist <= 5:
                self._slam_attack(player, effects)

        # ── Smooth movement ───────────────────────────────────────────────
        if self._moving:
            speed = _MOVE_SPEED
            if self.cc_type == "slow":
                speed *= (1.0 - self.cc_slow_factor)
            d    = math.hypot(self._tgt_x - self._vis_x, self._tgt_y - self._vis_y)
            step = speed * dt
            if step >= d:
                self._vis_x  = self._tgt_x
                self._vis_y  = self._tgt_y
                self._moving = False
            else:
                ratio = step / d
                self._vis_x += (self._tgt_x - self._vis_x) * ratio
                self._vis_y += (self._tgt_y - self._vis_y) * ratio

        return dmg_to_player

    # ── ataques ───────────────────────────────────────────────────────────────

    def _melee_attack(self, player, effects):
        from entities.effects import MeleeSlash, ExplosionEffect
        if self._cd_melee > 0:
            return
        col = (210, 80, 255) if self._phase == 1 else (255, 40, 80)
        dmg = 18 if self._phase == 1 else 28

        for dy in range(-1, 2):
            for dx in range(-1, 2):
                if dx == 0 and dy == 0:
                    continue
                wx = (self.tile_x + dx) * TILE_SIZE + TILE_SIZE // 2
                wy = (self.tile_y + dy) * TILE_SIZE + TILE_SIZE // 2
                effects.append(MeleeSlash(wx, wy, col, duration=0.20))
                effects.append(ExplosionEffect(wx, wy, col, max_radius=16, duration=0.18))

        if (abs(player.tile_x - self.tile_x) <= 1 and
                abs(player.tile_y - self.tile_y) <= 1):
            self._projectiles.append((0.05, dmg))

        self._cd_melee = 0.9 if self._phase == 1 else 0.55
        self.mp = max(0, self.mp - 8)

    def _ranged_attack(self, player, effects):
        from entities.effects import ProjectileEffect
        if self._cd_ranged > 0 or self.mp < 20:
            return
        col = (180, 80, 255) if self._phase == 1 else (255, 60, 120)
        pcx = self.pixel_x + TILE_SIZE // 2
        pcy = self.pixel_y + TILE_SIZE // 2
        ptx = player.pixel_x + TILE_SIZE // 2
        pty = player.pixel_y + TILE_SIZE // 2
        spd = 360 if self._phase == 1 else 480

        effects.append(ProjectileEffect(pcx, pcy, ptx, pty, col, speed=spd, radius=7))

        dist_px    = math.hypot(ptx - pcx, pty - pcy)
        travel     = dist_px / spd
        dmg        = 14 if self._phase == 1 else 22
        self._projectiles.append((travel, dmg))
        self._cd_ranged = 2.2 if self._phase == 1 else 1.3
        self.mp -= 20

    def _slam_attack(self, player, effects):
        """Fase 2: área grande alrededor del boss."""
        from entities.effects import AoEIndicator, ExplosionEffect
        if self._cd_slam > 0 or self.mp < 40:
            return
        col = (255, 50, 80)
        cx  = self.pixel_x + TILE_SIZE // 2
        cy  = self.pixel_y + TILE_SIZE // 2
        effects.append(AoEIndicator(cx, cy, col, max_radius=80, duration=0.45))
        effects.append(ExplosionEffect(cx, cy, col, max_radius=50, duration=0.35))

        dist = math.hypot(player.tile_x - self.tile_x,
                          player.tile_y - self.tile_y)
        if dist <= 2.5:
            self._projectiles.append((0.3, 35))

        self._cd_slam = 4.0
        self.mp -= 40

    # ── pathfinding ───────────────────────────────────────────────────────────

    def _move_toward(self, tx, ty, tilemap, enemies):
        dx = 0 if self.tile_x == tx else (1 if tx > self.tile_x else -1)
        dy = 0 if self.tile_y == ty else (1 if ty > self.tile_y else -1)
        dist_x = abs(tx - self.tile_x)
        dist_y = abs(ty - self.tile_y)
        # Solo 4 direcciones — priorizar el eje con mayor distancia
        if dist_x >= dist_y:
            attempts = [(dx, 0), (0, dy)]
        else:
            attempts = [(0, dy), (dx, 0)]
        for adx, ady in attempts:
            if adx == 0 and ady == 0:
                continue
            if self._try_move(adx, ady, tilemap, enemies):
                return

    def _try_move(self, dx, dy, tilemap, enemies):
        nx, ny = self.tile_x + dx, self.tile_y + dy
        if tilemap.is_solid(nx, ny):
            return False
        for e in enemies:
            if hasattr(e, 'alive') and e.alive and e is not self:
                if e.tile_x == nx and e.tile_y == ny:
                    return False
        self.tile_x  = nx
        self.tile_y  = ny
        self._tgt_x  = float(nx * TILE_SIZE)
        self._tgt_y  = float(ny * TILE_SIZE)
        self._moving = True
        return True

    # ── draw ──────────────────────────────────────────────────────────────────

    def draw(self, surface, sx, sy):
        if not self.alive:
            return
        ts    = TILE_SIZE
        cx    = sx + ts // 2
        cy    = sy + ts // 2
        r     = ts // 2 + 2   # más grande que enemigos normales
        hp_pct= self.hp / self.max_hp

        col, outline = (
            ((255, 40, 80),  (255, 120, 160)) if self._phase == 2
            else ((160, 50, 210), (210, 110, 255))
        )

        # Colores alterados por CC
        if self.cc_type == "stun":
            col = (230, 230, 80)
            outline = (255, 255, 120)
        elif self.cc_type == "root":
            col = (80, 200, 255)
            outline = (120, 220, 255)
        elif self.cc_type == "slow":
            col = tuple(int(c * 0.6) for c in col)
            outline = tuple(int(c * 0.6) for c in outline)

        # Aura pulsante (fase 2)
        if self._phase == 2 and self.cc_type != "stun":
            pygame.draw.circle(surface, (100, 20, 40), (cx, cy), r + 6, 2)

        # 1) Sprite PNG (assets/boss/<nombre>.png)
        drew = assets.blit_entity(surface, f"boss/{slugify(self.name)}.png",
                                  cx, sy + ts, _BOSS_SPRITE_H)

        # 2) Fallback: círculo con picos y ojos
        if not drew:
            pygame.draw.ellipse(surface, (30, 0, 40), (cx - r, cy + r - 4, r * 2, 8))
            pygame.draw.circle(surface, col, (cx, cy), r)
            pygame.draw.circle(surface, outline, (cx, cy), r, 3)
            for i in range(6):
                a   = i * math.pi / 3
                px2 = cx + int((r + 9) * math.cos(a))
                py2 = cy + int((r + 9) * math.sin(a))
                pygame.draw.circle(surface, outline, (px2, py2), 4)
            eye_col = (255, 60, 60) if self._phase == 2 else (255, 0, 0)
            pygame.draw.circle(surface, eye_col,       (cx - 5, cy - 5), 5)
            pygame.draw.circle(surface, eye_col,       (cx + 5, cy - 5), 5)
            pygame.draw.circle(surface, (255, 220, 50),(cx - 5, cy - 5), 2)
            pygame.draw.circle(surface, (255, 220, 50),(cx + 5, cy - 5), 2)

        # HP bar sobre el sprite
        bw, bh = ts + 20, 7
        bx, by = cx - bw // 2, sy - 16
        pygame.draw.rect(surface, (40, 0, 40), (bx, by, bw, bh))
        fill_w = max(0, int(bw * hp_pct))
        if fill_w:
            bar_col = (220, 40, 40) if hp_pct < 0.3 else col
            pygame.draw.rect(surface, bar_col, (bx, by, fill_w, bh))
        pygame.draw.rect(surface, outline, (bx, by, bw, bh), 1)

        # Nombre
        font = pygame.font.SysFont('Arial', 15, bold=True)
        tag  = font.render(self.name, True, outline)
        surface.blit(tag, (cx - tag.get_width() // 2, by - 17))

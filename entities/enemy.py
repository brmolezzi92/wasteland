import pygame
import math
import random
from settings import TILE_SIZE, TILE_MOVE_TIME
from entities.assets import assets, slugify

_SPRITE_H = int(TILE_SIZE * 1.9)

_MOVE_SPEED = TILE_SIZE / (TILE_MOVE_TIME * 2.5)  # Más lento que el player y que el boss

class Enemy:
    def __init__(self, tile_x, tile_y, name="Goblin", color=(175, 55, 55), scale=1.0):
        self.tile_x  = tile_x
        self.tile_y  = tile_y
        self._vis_x  = float(tile_x * TILE_SIZE)
        self._vis_y  = float(tile_y * TILE_SIZE)
        self._tgt_x  = self._vis_x
        self._tgt_y  = self._vis_y
        self._moving = False

        self.name    = name
        self.color   = color
        self.scale   = scale          # multiplicador de tamaño visual del sprite
        self.max_hp  = 80
        self.hp      = 80
        self.alive   = True

        # AI & CC stats
        self.cc_type   = None
        self.cc_timer  = 0.0
        self.cc_slow_factor = 0.5

        self._detect_range = 8
        self._melee_range  = 1.5
        self._move_timer   = 0.0
        self._move_interval = 0.5
        self._cd_attack    = 0.0
        self._damage       = 8

    @property
    def pixel_x(self): return int(self._vis_x)
    @property
    def pixel_y(self): return int(self._vis_y)

    @property
    def center_px(self):
        return (self.pixel_x + TILE_SIZE // 2, self.pixel_y + TILE_SIZE // 2)

    def apply_cc(self, cc_type, duration):
        if not self.alive:
            return
        if self.cc_type == "stun" and cc_type != "stun":
            return  # Stun no se sobreescribe por efectos menores
        self.cc_type  = cc_type
        self.cc_timer = duration

    def clear_cc(self):
        self.cc_type  = None
        self.cc_timer = 0.0

    def take_damage(self, amount):
        self.hp = max(0, self.hp - amount)
        if self.hp <= 0:
            self.alive = False

    def update(self, dt, player, tilemap, other_enemies):
        if not self.alive:
            return []

        # Timers de CC
        if self.cc_timer > 0:
            self.cc_timer -= dt
            if self.cc_timer <= 0:
                self.clear_cc()

        self._cd_attack = max(0.0, self._cd_attack - dt)
        self._move_timer = max(0.0, self._move_timer - dt)

        # Si está stuneado, no se mueve ni ataca
        if self.cc_type == "stun":
            self._moving = False
            return []

        # Distancia al jugador
        dist = math.hypot(self.tile_x - player.tile_x, self.tile_y - player.tile_y)

        # Detectar si el jugador es visible
        # Si el jugador está invisible, solo se detecta a rango cuerpo a cuerpo inmediato (<= 1.2 tiles)
        player_visible = True
        if getattr(player, "is_invisible", False):
            player_visible = (dist <= 1.2)

        damage_done = []

        # Ataque Melee
        if dist <= self._melee_range and player_visible and self._cd_attack <= 0:
            if not player.is_ghost:
                damage_done.append(self._damage)
                self._cd_attack = 1.5

        # Movimiento / Persecución
        can_move = (self.cc_type != "root")
        if can_move and self._move_timer <= 0 and not self._moving:
            if player_visible and dist <= self._detect_range and dist > self._melee_range:
                # Moverse hacia el jugador
                self._move_toward(player.tile_x, player.tile_y, tilemap, other_enemies)
            elif not player_visible:
                # Patrullar de forma aleatoria para no quedarse estático
                if random.random() < 0.15:
                    dx, dy = random.choice([(1,0), (-1,0), (0,1), (0,-1)])
                    self._try_move(dx, dy, tilemap, other_enemies)
            
            # El CC Slow ralentiza la tasa de actualización de pasos
            interval = self._move_interval
            if self.cc_type == "slow":
                interval /= (1.0 - self.cc_slow_factor)
            self._move_timer = interval

        # Interpolación suave de movimiento
        if self._moving:
            speed = _MOVE_SPEED
            if self.cc_type == "slow":
                speed *= (1.0 - self.cc_slow_factor)
            d = math.hypot(self._tgt_x - self._vis_x, self._tgt_y - self._vis_y)
            step = speed * dt
            if step >= d:
                self._vis_x = self._tgt_x
                self._vis_y = self._tgt_y
                self._moving = False
            else:
                ratio = step / d
                self._vis_x += (self._tgt_x - self._vis_x) * ratio
                self._vis_y += (self._tgt_y - self._vis_y) * ratio

        return damage_done

    def _move_toward(self, tx, ty, tilemap, enemies):
        dx = 0 if self.tile_x == tx else (1 if tx > self.tile_x else -1)
        dy = 0 if self.tile_y == ty else (1 if ty > self.tile_y else -1)
        dist_x = abs(tx - self.tile_x)
        dist_y = abs(ty - self.tile_y)
        
        # Priorizar eje con mayor distancia
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
            if e is not self and getattr(e, 'alive', False) and e.tile_x == nx and e.tile_y == ny:
                return False
        self.tile_x  = nx
        self.tile_y  = ny
        self._tgt_x  = float(nx * TILE_SIZE)
        self._tgt_y  = float(ny * TILE_SIZE)
        self._moving = True
        return True

    def draw(self, surface, sx, sy):
        if not self.alive:
            return
        ts = TILE_SIZE
        cx = sx + ts // 2
        cy = sy + ts // 2
        r  = ts // 2 - 3

        # 1) Sprite PNG (assets/enemies/<nombre>.png)
        sprite_h = int(TILE_SIZE * 1.9 * self.scale)
        drew = assets.blit_entity(surface, f"enemies/{slugify(self.name)}.png",
                                  cx, sy + ts + 8, sprite_h)

        # 2) Fallback: círculo + ojos
        if not drew:
            body_col = self.color
            if self.cc_type == "stun":
                body_col = (230, 230, 80)
            elif self.cc_type == "root":
                body_col = (80, 200, 255)
            elif self.cc_type == "slow":
                body_col = tuple(int(c * 0.6) for c in body_col)

            pygame.draw.ellipse(surface, (20, 20, 20), (cx - r, cy + r - 3, r * 2, 6))
            pygame.draw.circle(surface, body_col, (cx, cy), r)
            pygame.draw.circle(surface, (230, 90, 90), (cx, cy), r, 2)
            pygame.draw.circle(surface, (240, 240, 80), (cx - 4, cy - 3), 3)
            pygame.draw.circle(surface, (240, 240, 80), (cx + 4, cy - 3), 3)
            pygame.draw.circle(surface, (0, 0, 0),       (cx - 4, cy - 3), 1)
            pygame.draw.circle(surface, (0, 0, 0),       (cx + 4, cy - 3), 1)

        # HP bar
        bw, bh = ts - 4, 4
        bx, by = sx + 2, sy - 8
        pygame.draw.rect(surface, (40, 40, 40), (bx, by, bw, bh))
        hp_w = int(bw * self.hp / self.max_hp)
        if hp_w:
            pygame.draw.rect(surface, (200, 50, 50), (bx, by, hp_w, bh))

        # Name tag
        font = pygame.font.SysFont('Arial', 15)
        tag  = font.render(self.name, True, (220, 180, 180))
        surface.blit(tag, (cx - tag.get_width() // 2, by - 11))

        # CC Anillo Visual
        if self.cc_type == "stun":
            for i in range(3):
                a = i * 2 * math.pi / 3 + pygame.time.get_ticks() * 0.003
                px2 = cx + int((r+5)*math.cos(a))
                py2 = cy + int((r+5)*math.sin(a))
                pygame.draw.circle(surface, (255, 230, 50), (px2, py2), 3)
        elif self.cc_type == "root":
            pygame.draw.circle(surface, (80, 200, 255), (cx, cy), r + 3, 2)

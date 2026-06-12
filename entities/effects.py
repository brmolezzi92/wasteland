import pygame
import math

class ProjectileEffect:
    def __init__(self, wx, wy, tx, ty, color, speed=500, radius=6):
        self.x, self.y   = float(wx), float(wy)
        self.tx, self.ty = float(tx), float(ty)
        self.color       = color
        self.radius      = radius
        self.done        = False
        self._trail      = []
        dist = math.hypot(tx - wx, ty - wy)
        if dist > 0:
            self.vx = (tx - wx) / dist * speed
            self.vy = (ty - wy) / dist * speed
        else:
            self.vx = self.vy = 0
            self.done = True

    def update(self, dt):
        self._trail.append((self.x, self.y))
        if len(self._trail) > 10: self._trail.pop(0)
        self.x += self.vx * dt
        self.y += self.vy * dt
        if (self.tx - self.x) * self.vx + (self.ty - self.y) * self.vy <= 0:
            self.x, self.y = self.tx, self.ty
            self.done = True

    def draw(self, surface, cam_x, cam_y):
        n = len(self._trail)
        for i, (px, py) in enumerate(self._trail):
            t   = i / max(n, 1)
            r   = max(1, int(self.radius * t))
            col = tuple(int(c * t) for c in self.color)
            pygame.draw.circle(surface, col, (int(px - cam_x), int(py - cam_y)), r)
        sx, sy = int(self.x - cam_x), int(self.y - cam_y)
        pygame.draw.circle(surface, self.color, (sx, sy), self.radius)
        pygame.draw.circle(surface, (255, 255, 255), (sx, sy), self.radius, 1)


class ExplosionEffect:
    def __init__(self, wx, wy, color, max_radius=44, duration=0.38):
        self.wx, self.wy  = wx, wy
        self.color        = color
        self.max_radius   = max_radius
        self.duration     = duration
        self.timer        = 0.0
        self.done         = False

    def update(self, dt):
        self.timer += dt
        if self.timer >= self.duration: self.done = True

    def draw(self, surface, cam_x, cam_y):
        t  = self.timer / self.duration
        r  = max(1, int(self.max_radius * t))
        sx = int(self.wx - cam_x)
        sy = int(self.wy - cam_y)
        # Bright inner flash early
        if t < 0.4:
            inner = tuple(min(255, c + 100) for c in self.color)
            pygame.draw.circle(surface, inner, (sx, sy), max(1, r // 2))
        # Expanding ring
        lw = max(1, int(5 * (1 - t)))
        col = tuple(int(c * (1 - t * 0.6)) for c in self.color)
        pygame.draw.circle(surface, col, (sx, sy), r, lw)


class AoEIndicator:
    """Expanding ring preview / impact for area spells."""
    def __init__(self, wx, wy, color, max_radius=80, duration=0.5):
        self.wx, self.wy  = wx, wy
        self.color        = color
        self.max_radius   = max_radius
        self.duration     = duration
        self.timer        = 0.0
        self.done         = False

    def update(self, dt):
        self.timer += dt
        if self.timer >= self.duration: self.done = True

    def draw(self, surface, cam_x, cam_y):
        t  = self.timer / self.duration
        r  = max(1, int(self.max_radius * (0.2 + 0.8 * t)))
        sx = int(self.wx - cam_x)
        sy = int(self.wy - cam_y)
        col = tuple(int(c * (1 - t)) for c in self.color)
        pygame.draw.circle(surface, col, (sx, sy), r, 2)
        if r > 6:
            col2 = tuple(int(c * (1 - t) * 0.5) for c in self.color)
            pygame.draw.circle(surface, col2, (sx, sy), r - 5, 1)


class MeleeSlash:
    """Flash rápido en forma de X sobre un tile — efecto de golpe melee."""
    def __init__(self, wx, wy, color, duration=0.22):
        self.wx, self.wy = wx, wy
        self.color       = color
        self.duration    = duration
        self.timer       = 0.0
        self.done        = False

    def update(self, dt):
        self.timer += dt
        if self.timer >= self.duration:
            self.done = True

    def draw(self, surface, cam_x, cam_y):
        t   = self.timer / self.duration
        sx  = int(self.wx - cam_x)
        sy  = int(self.wy - cam_y)
        r   = int(14 * (1 - t * 0.3))
        col = tuple(min(255, int(c + (255 - c) * (1 - t))) for c in self.color)
        alpha = int(220 * (1 - t ** 1.5))
        buf = pygame.Surface((r * 2 + 2, r * 2 + 2), pygame.SRCALPHA)
        c = r + 1
        lw = max(1, int(3 * (1 - t)))
        pygame.draw.line(buf, (*col, alpha), (c - r, c - r), (c + r, c + r), lw)
        pygame.draw.line(buf, (*col, alpha), (c + r, c - r), (c - r, c + r), lw)
        pygame.draw.line(buf, (*col, alpha), (c - r, c),     (c + r, c),     lw)
        pygame.draw.line(buf, (*col, alpha), (c, c - r),     (c, c + r),     lw)
        surface.blit(buf, (sx - r - 1, sy - r - 1))


class CCIndicator:
    """Indicador visual de CC sobre un tile (círculo de color con tipo)."""
    def __init__(self, wx, wy, cc_type, duration):
        self.wx, self.wy = wx, wy
        self.cc_type     = cc_type
        self.duration    = duration
        self.timer       = 0.0
        self.done        = False
        self._colors     = {
            "stun": (255, 230, 50),
            "root": (80,  200, 255),
            "slow": (160, 100, 255),
        }

    def update(self, dt):
        self.timer += dt
        if self.timer >= self.duration:
            self.done = True

    def draw(self, surface, cam_x, cam_y):
        t   = self.timer / self.duration
        col = self._colors.get(self.cc_type, (200, 200, 200))
        sx  = int(self.wx - cam_x)
        sy  = int(self.wy - cam_y)
        alpha = int(200 * (1 - t ** 2))
        r   = 18 + int(6 * math.sin(self.timer * 8))
        buf = pygame.Surface((r*2+4, r*2+4), pygame.SRCALPHA)
        pygame.draw.circle(buf, (*col, alpha), (r+2, r+2), r, 3)
        surface.blit(buf, (sx - r - 2, sy - r - 2))
        # Label del tipo
        font = pygame.font.SysFont("Arial", 13, bold=True)
        txt  = font.render(self.cc_type.upper(), True, col)
        surface.blit(txt, (sx - txt.get_width()//2, sy - 30))


class FloatingText:
    def __init__(self, wx, wy, text, color=(255, 220, 80), size=20, duration=1.3):
        self.wx, self.wy = float(wx), float(wy)
        self.text        = text
        self.duration    = duration
        self.timer       = 0.0
        self.done        = False
        font  = pygame.font.SysFont('Arial', size, bold=True)
        self._surf = font.render(text, True, color)

    def update(self, dt):
        self.timer  += dt
        self.wy     -= 28 * dt
        if self.timer >= self.duration: self.done = True

    def draw(self, surface, cam_x, cam_y):
        t   = self.timer / self.duration
        alpha = int(255 * (1 - t ** 1.5))
        sx  = int(self.wx - cam_x) - self._surf.get_width() // 2
        sy  = int(self.wy - cam_y)
        s   = self._surf.copy()
        s.set_alpha(alpha)
        surface.blit(s, (sx, sy))

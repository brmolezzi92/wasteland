import pygame
import json
import math
from settings import SCREEN_W, SCREEN_H
from entities.assets import assets

# Paleta WASTELAND (Mad Max / Borderlands)
BG          = (16,  12,  8)
BG_TOP      = (30,  22,  14)
PANEL_BG    = (28,  21,  14)
PANEL_SEL   = (42,  31,  18)
BORDER      = (92,  68,  36)
BORDER_HOT  = (210, 130, 32)
BORDER_SEL  = (255, 180, 60)
TEXT        = (240, 228, 204)
TEXT_DIM    = (160, 138, 104)
GREEN_NEON  = (240, 190, 70)    # ahora ámbar (nombre legacy)
STAT_BG     = (22,  17,  11)
HAZARD_Y    = (228, 172, 36)
HAZARD_D    = (26,  20,  12)
ACCENT      = (230, 144, 34)

ROLE_COLORS = {
    "Tank":       (80,  140, 220),
    "DPS Melee":  (220, 80,  80),
    "DPS Ranged": (80,  200, 120),
    "Support":    (200, 160, 50),
    "Healer":     (80,  220, 180),
}




class CharSelect:
    """
    Pantalla de selección de clase (5 cartas).
    Retorna class_id al confirmar, None si cancela.
    """

    def __init__(self):
        with open("data/classes.json",  encoding="utf-8") as f:
            self._classes = json.load(f)
        with open("data/spells.json",  encoding="utf-8") as f:
            self._spells  = json.load(f)

        self._fonts: dict = {}
        self._class_ids   = list(self._classes.keys())
        self._hovered     = None
        self._selected    = 0      # índice pre-seleccionado
        self._confirmed   = False
        self._anim        = 0.0

        # Construir rects de cartas (5 en fila)
        n       = len(self._class_ids)
        cw, ch  = 310, 640
        gap     = 20
        total_w = n * cw + (n - 1) * gap
        ox      = (SCREEN_W - total_w) // 2
        oy      = (SCREEN_H - ch) // 2 + 30
        self._card_rects = [
            pygame.Rect(ox + i * (cw + gap), oy, cw, ch)
            for i in range(n)
        ]

        # Botón confirmar
        bw, bh = 360, 62
        self._confirm_btn = pygame.Rect(SCREEN_W//2 - bw//2, SCREEN_H - 90, bw, bh)

        # Rain effect
        self._rain_cols = self._init_rain()

    # ── Rain ──────────────────────────────────────────────────────────────────

    def _init_rain(self):
        import random
        cols = []
        for x in range(0, SCREEN_W, 22):
            cols.append({
                "x": x, "y": random.randint(-SCREEN_H, 0),
                "speed": random.uniform(180, 380),
                "chars": [chr(random.randint(0x30A0, 0x30FF)) for _ in range(20)],
                "len": random.randint(6, 18),
            })
        return cols

    def _font(self, size, bold=False):
        key = (size, bold)
        if key not in self._fonts:
            self._fonts[key] = pygame.font.SysFont("Arial", size, bold=bold)
        return self._fonts[key]

    # ── Event ─────────────────────────────────────────────────────────────────

    def handle_event(self, event, mx, my):
        """Retorna class_id al confirmar, 'back' al cancelar, None si no pasa nada."""
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                return "back"
            if event.key == pygame.K_LEFT:
                self._selected = max(0, self._selected - 1)
            if event.key == pygame.K_RIGHT:
                self._selected = min(len(self._class_ids)-1, self._selected+1)
            if event.key == pygame.K_RETURN:
                return self._class_ids[self._selected]

        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            for i, rect in enumerate(self._card_rects):
                if rect.collidepoint(mx, my):
                    if self._selected == i:
                        return self._class_ids[i]   # segundo clic confirma
                    self._selected = i
                    return None
            if self._confirm_btn.collidepoint(mx, my):
                return self._class_ids[self._selected]

        return None

    def update(self, dt, mx, my):
        self._anim += dt
        self._hovered = None
        for i, rect in enumerate(self._card_rects):
            if rect.collidepoint(mx, my):
                self._hovered = i
        for col in self._rain_cols:
            col["y"] += col["speed"] * dt
            if col["y"] > SCREEN_H + 200:
                col["y"] = -len(col["chars"]) * 18

    # ── Draw ──────────────────────────────────────────────────────────────────

    def draw(self, surface):
        surface.fill(BG)
        self._draw_rain(surface)
        self._draw_title(surface)
        for i, cid in enumerate(self._class_ids):
            self._draw_card(surface, i, cid)
        self._draw_confirm_btn(surface)
        self._draw_hint(surface)

    def _draw_rain(self, surface):
        # Fondo cálido cacheado (gradiente + viñeta + hazard arriba)
        if getattr(self, "_bg_cache", None) is None:
            bg = pygame.Surface((SCREEN_W, SCREEN_H))
            for y in range(SCREEN_H):
                t = y / SCREEN_H
                bg.fill((int(BG_TOP[0]+(BG[0]-BG_TOP[0])*t),
                         int(BG_TOP[1]+(BG[1]-BG_TOP[1])*t),
                         int(BG_TOP[2]+(BG[2]-BG_TOP[2])*t)), (0, y, SCREEN_W, 1))
            vig = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
            for i in range(120):
                pygame.draw.rect(vig, (0, 0, 0, int(90*(1-i/120))),
                                 (i, i, SCREEN_W-2*i, SCREEN_H-2*i), 1)
            bg.blit(vig, (0, 0))
            self._bg_cache = bg
        surface.blit(self._bg_cache, (0, 0))
        # Cinta de peligro arriba
        band = pygame.Rect(0, 0, SCREEN_W, 6)
        surface.fill(HAZARD_D, band)
        for sx in range(-6, SCREEN_W+13, 26):
            pygame.draw.polygon(surface, HAZARD_Y,
                [(sx, 6), (sx+13, 6), (sx+19, 0), (sx+6, 0)])

    def _draw_title(self, surface):
        t1 = self._font(56, bold=True).render("SELECCIONAR CLASE", True, GREEN_NEON)
        surface.blit(t1, (SCREEN_W//2 - t1.get_width()//2, 28))
        t2 = self._font(20).render(
            "Clic para seleccionar  ·  Doble clic o ENTER para confirmar  ·  ESC para volver",
            True, TEXT_DIM)
        surface.blit(t2, (SCREEN_W//2 - t2.get_width()//2, 96))

    def _draw_card(self, surface, idx, class_id):
        rect     = self._card_rects[idx]
        cls      = self._classes[class_id]
        selected = (idx == self._selected)
        hovered  = (idx == self._hovered)
        col      = tuple(cls["color"])
        role     = cls["role"]
        role_col = ROLE_COLORS.get(role, col)

        # Offset vertical al seleccionar
        draw_rect = rect.copy()
        if selected:
            draw_rect.y -= 16

        # Fondo
        bg = PANEL_SEL if selected else PANEL_BG
        pygame.draw.rect(surface, bg, draw_rect, border_radius=10)
        border_col = BORDER_SEL if selected else (BORDER_HOT if hovered else BORDER)
        pygame.draw.rect(surface, border_col, draw_rect, 2 if not selected else 3, border_radius=10)

        # Glow seleccionado
        if selected:
            pulse = int(40 + 20 * math.sin(self._anim * 3))
            glow  = pygame.Surface((draw_rect.width+16, draw_rect.height+16), pygame.SRCALPHA)
            pygame.draw.rect(glow, (*col, pulse), (0,0,draw_rect.width+16, draw_rect.height+16), border_radius=14)
            surface.blit(glow, (draw_rect.x-8, draw_rect.y-8))
            pygame.draw.rect(surface, bg, draw_rect, border_radius=10)
            pygame.draw.rect(surface, border_col, draw_rect, 3, border_radius=10)

        pad  = 16
        cx   = draw_rect.centerx
        y    = draw_rect.y + pad

        # Avatar: sprite REAL de la clase sobre un pedestal
        av_zone = 108
        base_cy = y + av_zone - 6
        # pedestal elíptico
        pygame.draw.ellipse(surface, tuple(c//4 for c in col), (cx-46, base_cy-8, 92, 20))
        pygame.draw.ellipse(surface, tuple(c//2 for c in col), (cx-46, base_cy-8, 92, 20), 2)
        spr = assets.sprite(f"players/{class_id}.png", av_zone)
        if spr is not None:
            # limitar ancho si el sprite es muy alto/angosto
            if spr.get_width() > 120:
                spr = assets.sprite(f"players/{class_id}.png", int(av_zone * 120 / spr.get_width()))
            surface.blit(spr, (cx - spr.get_width()//2, base_cy - spr.get_height()))
        else:
            av_r = 46
            pygame.draw.circle(surface, tuple(c//2 for c in col), (cx, y + av_r), av_r)
            pygame.draw.circle(surface, col, (cx, y + av_r), av_r, 3)
            ini = self._font(48, bold=True).render(cls["name"][0], True, col)
            surface.blit(ini, (cx - ini.get_width()//2, y + av_r - ini.get_height()//2))
        y += av_zone + 10

        # Role badge
        badge_surf = self._font(17, bold=True).render(role.upper(), True, role_col)
        bx = cx - badge_surf.get_width()//2 - 8
        by = y
        bg2 = pygame.Surface((badge_surf.get_width()+16, badge_surf.get_height()+6), pygame.SRCALPHA)
        bg2.fill((*role_col, 40))
        surface.blit(bg2, (bx, by))
        pygame.draw.rect(surface, role_col, (bx, by, badge_surf.get_width()+16, badge_surf.get_height()+6), 1, border_radius=4)
        surface.blit(badge_surf, (bx+8, by+3))
        y += badge_surf.get_height() + 14

        # Nombre clase
        name_s = self._font(28, bold=True).render(cls["name"], True, TEXT)
        surface.blit(name_s, (cx - name_s.get_width()//2, y))
        y += name_s.get_height() + 8

        # Lore
        lore = cls["lore"]
        self._draw_wrapped(surface, lore, draw_rect.x+pad, y, draw_rect.width-pad*2, 17, TEXT_DIM)
        y += 58

        # Stats bars
        stats_visual = cls["stats"].get("description_stats", {})
        stat_labels  = ["HP", "Daño", "Velocidad", "Energía"]
        for stat_lbl in stat_labels:
            val = stats_visual.get(stat_lbl, 0)
            self._draw_stat_bar(surface, draw_rect.x+pad, y, draw_rect.width-pad*2, stat_lbl, val, 5, col)
            y += 26

        y += 8
        # Separador
        pygame.draw.line(surface, BORDER, (draw_rect.x+pad, y), (draw_rect.right-pad, y), 1)
        y += 10

        # Habilidades
        spell_ids = cls.get("spells", [])
        for si, sid in enumerate(spell_ids[:3]):
            spell = self._spells.get(sid, {})
            scol     = tuple(spell.get("color", [150,150,150]))
            # Dibujar un pequeño círculo indicador (viñeta)
            pygame.draw.circle(surface, scol, (draw_rect.x + pad + 6, y + 10), 5)
            nm_s     = self._font(15).render(spell.get("name",""), True, TEXT_DIM)
            surface.blit(nm_s, (draw_rect.x + pad + 20, y + 1))
            y += 22

        # Selected checkmark
        if selected:
            check = self._font(22, bold=True).render("✓ SELECCIONADO", True, GREEN_NEON)
            surface.blit(check, (cx - check.get_width()//2, draw_rect.bottom - 36))

    def _draw_wrapped(self, surf, text, x, y, max_w, size, col):
        font    = self._font(size)
        words   = text.split()
        line    = ""
        lines   = []
        for w in words:
            test = line + (" " if line else "") + w
            if font.size(test)[0] <= max_w:
                line = test
            else:
                if line: lines.append(line)
                line = w
        if line: lines.append(line)
        for ln in lines[:3]:
            s = font.render(ln, True, col)
            surf.blit(s, (x, y))
            y += size + 3

    def _draw_stat_bar(self, surf, x, y, w, label, val, max_val, col):
        font = self._font(14)
        lbl  = font.render(label, True, TEXT_DIM)
        surf.blit(lbl, (x, y))
        bx   = x + 80
        bw   = w - 82
        bh   = 12
        pygame.draw.rect(surf, STAT_BG, (bx, y+2, bw, bh), border_radius=3)
        fill = int(bw * val / max_val)
        if fill:
            pygame.draw.rect(surf, col, (bx, y+2, fill, bh), border_radius=3)

    def _draw_confirm_btn(self, surface):
        sel_cls = self._classes.get(self._class_ids[self._selected], {})
        col     = tuple(sel_cls.get("color", [230,144,34]))
        r       = self._confirm_btn
        pygame.draw.rect(surface, (0, 0, 0), r.move(4, 5))
        pygame.draw.rect(surface, tuple(int(c*0.30) for c in col), r)
        pygame.draw.rect(surface, col, r, 3)
        pygame.draw.line(surface, tuple(min(255,c+50) for c in col), (r.x+3, r.y+2), (r.right-3, r.y+2))
        pygame.draw.line(surface, col, (r.right-16, r.y+1), (r.right-1, r.y+16), 3)
        txt = self._font(26, bold=True).render(
            f"CONFIRMAR — {sel_cls.get('name','')}  [{sel_cls.get('role','')}]",
            True, (255, 245, 220))
        surface.blit(txt, (r.centerx - txt.get_width()//2, r.centery - txt.get_height()//2))

    def _draw_hint(self, surface):
        hint = self._font(16).render("← → para navegar  ·  ENTER / doble clic para confirmar  ·  ESC para volver", True, TEXT_DIM)
        surface.blit(hint, (SCREEN_W//2 - hint.get_width()//2, SCREEN_H - 28))

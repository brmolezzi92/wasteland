import pygame
from settings import *

class SettingsPanel:
    def __init__(self):
        self.visible     = False
        self.show_fps    = False
        self._fullscreen = False
        self._fonts_ok   = False
        self._font_title = None
        self._font_btn   = None
        self._font_sm    = None

        # Presets de escala
        self._scales = [
            ("50%",  (int(SCREEN_W * 0.50), int(SCREEN_H * 0.50))),
            ("67%",  (int(SCREEN_W * 0.67), int(SCREEN_H * 0.67))),
            ("75%",  (int(SCREEN_W * 0.75), int(SCREEN_H * 0.75))),
            ("100%", (SCREEN_W,             SCREEN_H)),
        ]
        self._scale_idx = 1    # 67% por defecto

        # Panel centrado en 1920×800
        pw, ph = 700, 520
        self._panel = pygame.Rect((SCREEN_W - pw) // 2, (SCREEN_H - ph) // 2, pw, ph)
        self._build_rects()

    # ------------------------------------------------------------------ layout

    def _build_rects(self):
        p   = self._panel
        bw, bh, gap = 130, 46, 10

        # Cerrar
        self._close_btn = pygame.Rect(p.right - 38, p.top + 10, 28, 28)

        # Botones de escala
        total = len(self._scales) * bw + (len(self._scales) - 1) * gap
        sx    = p.centerx - total // 2
        sy    = p.top + 96
        self._scale_btns = [
            pygame.Rect(sx + i * (bw + gap), sy, bw, bh)
            for i in range(len(self._scales))
        ]

        # Pantalla completa
        self._fs_btn = pygame.Rect(p.centerx - 155, sy + bh + 22, 310, bh)

        # Mostrar FPS
        self._fps_btn = pygame.Rect(p.centerx - 155, self._fs_btn.bottom + 14, 310, bh)

    # ------------------------------------------------------------------ control

    def show(self):
        self.visible = True

    def hide(self):
        self.visible = False

    def toggle(self):
        self.visible = not self.visible

    def handle_click(self, mx, my) -> bool:
        """Retorna True si el clic fue consumido por el panel."""
        if not self.visible:
            return False

        # Clic fuera → cerrar
        if not self._panel.collidepoint((mx, my)):
            self.hide()
            return True

        if self._close_btn.collidepoint((mx, my)):
            self.hide()
            return True

        for i, rect in enumerate(self._scale_btns):
            if rect.collidepoint((mx, my)):
                self._apply_scale(i)
                return True

        if self._fs_btn.collidepoint((mx, my)):
            self._toggle_fullscreen()
            return True

        if self._fps_btn.collidepoint((mx, my)):
            self.show_fps = not self.show_fps
            return True

        return True   # modal: consume todo clic dentro del panel

    def _apply_scale(self, idx):
        self._scale_idx  = idx
        self._fullscreen = False
        w, h = self._scales[idx][1]
        pygame.display.set_mode((w, h), pygame.RESIZABLE)

    def _toggle_fullscreen(self):
        self._fullscreen = not self._fullscreen
        if self._fullscreen:
            pygame.display.set_mode((SCREEN_W, SCREEN_H), pygame.FULLSCREEN)
        else:
            w, h = self._scales[self._scale_idx][1]
            pygame.display.set_mode((w, h), pygame.RESIZABLE)

    # ------------------------------------------------------------------ draw

    def draw(self, screen):
        if not self.visible:
            return
        self._init_fonts()

        # Fondo oscuro semitransparente sobre toda la pantalla
        dim = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        dim.fill((0, 0, 0, 175))
        screen.blit(dim, (0, 0))

        p = self._panel

        # Panel (sombra + cuerpo cálido + borde ámbar)
        pygame.draw.rect(screen, (0, 0, 0), p.move(5, 6), border_radius=6)
        pygame.draw.rect(screen, SIDEBAR_BG, p, border_radius=6)
        pygame.draw.rect(screen, ACCENT_ORANGE, p, 2, border_radius=6)
        pygame.draw.rect(screen, (44, 32, 18),
                         (p.x+2, p.y+2, p.width-4, 50), border_top_left_radius=6, border_top_right_radius=6)

        # Título
        title = self._font_title.render("⚙   CONFIGURACIÓN", True, ACCENT_ORANGE)
        screen.blit(title, (p.centerx - title.get_width() // 2, p.top + 12))
        # Cinta de peligro bajo el título
        band = pygame.Rect(p.x+2, p.top+50, p.width-4, 4)
        prev = screen.get_clip(); screen.set_clip(band)
        screen.fill(HAZARD_DARK, band)
        for sx in range(p.x-4, p.right+13, 24):
            pygame.draw.polygon(screen, HAZARD_YELLOW, [(sx,band.bottom),(sx+12,band.bottom),(sx+16,band.top),(sx+4,band.top)])
        screen.set_clip(prev)

        # Cerrar [✕]
        pygame.draw.rect(screen, (95, 40, 32), self._close_btn, border_radius=4)
        pygame.draw.rect(screen, (180, 80, 60), self._close_btn, 1, border_radius=4)
        xt = self._font_btn.render("✕", True, (220, 150, 150))
        screen.blit(xt, (self._close_btn.centerx - xt.get_width() // 2,
                          self._close_btn.centery - xt.get_height() // 2))

        # Sección tamaño de ventana
        lbl = self._font_sm.render("TAMAÑO DE VENTANA", True, TEXT_DIM)
        screen.blit(lbl, (p.centerx - lbl.get_width() // 2,
                           self._scale_btns[0].top - 22))

        for i, (rect, (label, _)) in enumerate(zip(self._scale_btns, self._scales)):
            active = (i == self._scale_idx and not self._fullscreen)
            self._draw_btn(screen, rect, label, active)

        # Pantalla completa
        self._draw_btn(screen, self._fs_btn, "Pantalla completa", self._fullscreen)

        # Separador
        pygame.draw.line(screen, DIVIDER_COLOR,
                         (p.x + 20, self._fps_btn.top - 8),
                         (p.right - 20, self._fps_btn.top - 8), 1)

        # FPS toggle
        fps_lbl = f"Mostrar FPS:  {'ON ✓' if self.show_fps else 'OFF'}"
        self._draw_btn(screen, self._fps_btn, fps_lbl, self.show_fps)

    def _draw_btn(self, screen, rect, label, active):
        if active:
            bg, border, tc = (120, 70, 18), ACCENT_ORANGE, (255, 244, 214)
        else:
            bg, border, tc = SLOT_BG, SLOT_BORDER, TEXT_DIM
        pygame.draw.rect(screen, bg, rect)
        pygame.draw.rect(screen, border, rect, 2 if active else 1)
        pygame.draw.line(screen, tuple(min(255,c+30) for c in border), (rect.x+2, rect.y+2), (rect.right-3, rect.y+2))
        if active:
            pygame.draw.rect(screen, ACCENT_ORANGE, (rect.x, rect.bottom-3, rect.width, 3))
        t = self._font_btn.render(label, True, tc)
        screen.blit(t, (rect.centerx - t.get_width() // 2,
                         rect.centery - t.get_height() // 2))

    def _init_fonts(self):
        if not self._fonts_ok:
            self._font_title = pygame.font.SysFont('Arial', 28, bold=True)
            self._font_btn   = pygame.font.SysFont('Arial', 20)
            self._font_sm    = pygame.font.SysFont('Arial', 17)
            self._fonts_ok   = True

import pygame
import math
import time
from settings import SCREEN_W, SCREEN_H
from backend.supabase_client import (
    elo_to_rank, mock_player, _mock_friends, is_connected,
    initialize_user_session, join_queue, leave_queue, find_match, check_queue_status
)

# ── Paleta WASTELAND (Mad Max / Borderlands) ───────────────────────────────────
BG          = (16,  12,  8)     # fondo cálido casi negro
BG_TOP      = (30,  22,  14)    # tope del gradiente
PANEL_BG    = (30,  23,  15)    # panel cálido
PANEL_HEAD  = (44,  32,  18)    # banda de header
PANEL_DARK  = (19,  14,  9)
BORDER      = (98,  72,  38)    # metal oxidado
BORDER_HOT  = (230, 144, 34)    # ámbar
ACCENT      = (230, 144, 34)
ACCENT_HOT  = (255, 180, 60)
TEXT        = (240, 228, 204)
TEXT_DIM    = (160, 138, 104)
TEXT_DARK   = (98,  82,  58)
GREEN_ON    = (120, 210, 90)
RED_OFF     = (192, 72,  56)
BLUE_ELO    = (240, 192, 72)    # ELO en oro cálido (antes azul frío)
GOLD        = (232, 190, 44)
DANGER      = (202, 62,  50)
HAZARD_Y    = (228, 172, 36)    # amarillo cinta de peligro
HAZARD_D    = (26,  20,  12)
RUST        = (138, 80,  40)

# Tamaños de fuente (legibles al 67% de 1920x1080)
FS_TITLE  = 72
FS_H1     = 36
FS_H2     = 28
FS_BODY   = 22
FS_SMALL  = 18

class Button:
    def __init__(self, rect, label, color=ACCENT, hot_color=ACCENT_HOT,
                 font_size=FS_BODY, bold=False, border_r=6):
        self.rect      = pygame.Rect(rect)
        self.label     = label
        self.color     = color
        self.hot_color = hot_color
        self.border_r  = border_r
        self._font     = pygame.font.SysFont("Arial", font_size, bold=bold)
        self.hovered   = False
        self.disabled  = False

    def update(self, mx, my):
        self.hovered = self.rect.collidepoint(mx, my) and not self.disabled

    def clicked(self, mx, my):
        return self.rect.collidepoint(mx, my) and not self.disabled

    def draw(self, surf):
        r   = self.rect
        col = self.hot_color if self.hovered else self.color
        if self.disabled:
            col = tuple(c // 3 for c in col)
        # Oscurecer proporcional (mantiene el matiz cálido, no vira a rojo)
        body = tuple(int(c * (0.42 if self.hovered else 0.26)) for c in col)
        # Cuerpo angular (sin redondeo = look industrial)
        pygame.draw.rect(surf, body, r)
        pygame.draw.rect(surf, col, r, 2)
        # Brillo superior + muesca de esquina
        pygame.draw.line(surf, tuple(min(255, c + 45) for c in col), (r.x + 2, r.y + 2), (r.right - 3, r.y + 2))
        pygame.draw.line(surf, col, (r.right - 13, r.y + 1), (r.right - 1, r.y + 13), 2)
        if self.hovered:
            pygame.draw.rect(surf, ACCENT_HOT, (r.x, r.bottom - 3, r.width, 3))
        t_col = TEXT_DARK if self.disabled else ((255, 244, 214) if self.hovered else TEXT)
        lbl = self._font.render(self.label, True, t_col)
        surf.blit(lbl, (r.centerx - lbl.get_width() // 2, r.centery - lbl.get_height() // 2))


class MainMenu:
    """
    Pantalla principal de WASTELAND.
    draw() renderiza sobre surface (1920×1080).
    handle_event() retorna string de acción o None.
    """

    # ── Acciones retornadas ───────────────────────────────────────────────────
    ACT_PRACTICE_DM   = "play_practice_dm"
    ACT_PRACTICE_CZ   = "play_practice_cz"
    ACT_OPEN_WORLD    = "play_open_world"
    ACT_QUEUE_1V1     = "queue_1v1"
    ACT_QUEUE_2V2     = "queue_2v2"
    ACT_QUEUE_4V4     = "queue_4v4"
    ACT_CANCEL_QUEUE  = "cancel_queue"
    ACT_QUIT          = "quit"

    def __init__(self):
        self._fonts: dict = {}

        # Datos del jugador (cargados de Supabase o mock offline)
        self.player  = initialize_user_session()
        self.rank    = elo_to_rank(self.player.get("elo", 1500))
        from backend.supabase_client import get_friends
        self.friends = get_friends(self.player["id"])

        # Estado
        self.state        = "menu"   # "menu" | "searching" | "room_lobby" | "add_friend"
        self.queue_mode   = None
        self.queue_start  = 0.0
        self._dots_timer  = 0.0
        self._dots_frame  = 0
        self._anim_timer  = 0.0
        self._last_poll_time = 0.0
        self.matched_room_id = None

        # Notificación temporal
        self._notif_msg   = ""
        self._notif_timer = 0.0

        # Input texto "agregar amigo"
        self._friend_input = ""
        self._input_active = False

        # Rects principales
        PAD = 24
        TOP = 80   # altura top bar

        # Columna izquierda: Competitivo
        self._competitive_rect = pygame.Rect(PAD, TOP + PAD, 680, 620)
        # Columna centro-derecha top: Práctica
        self._practice_rect    = pygame.Rect(PAD + 680 + PAD, TOP + PAD, 530, 290)
        # Columna centro-derecha mid: Mundo Abierto
        self._openworld_rect   = pygame.Rect(PAD + 680 + PAD, TOP + PAD + 290 + PAD, 530, 140)
        # Columna derecha: Social / Amigos
        self._social_rect      = pygame.Rect(PAD + 680 + PAD + 530 + PAD, TOP + PAD, 380, 620)
        # Barra inferior
        self._bottom_rect      = pygame.Rect(PAD, TOP + PAD + 620 + PAD, SCREEN_W - PAD*2, 200)

        self._build_buttons()

    def _font(self, size, bold=False):
        key = (size, bold)
        if key not in self._fonts:
            self._fonts[key] = pygame.font.SysFont("Arial", size, bold=bold)
        return self._fonts[key]

    # ── Build buttons ─────────────────────────────────────────────────────────

    def _build_buttons(self):
        cr = self._competitive_rect
        pr = self._practice_rect
        ow = self._openworld_rect

        bw, bh, gap = 190, 80, 16
        modes_y = cr.y + 340
        self._btn_1v1 = Button((cr.x + 20,         modes_y, bw, bh), "1 vs 1",  font_size=FS_H2, bold=True, border_r=8)
        self._btn_2v2 = Button((cr.x + 20+bw+gap,  modes_y, bw, bh), "2 vs 2",  font_size=FS_H2, bold=True, border_r=8)
        self._btn_4v4 = Button((cr.x + 20+bw*2+gap*2, modes_y, bw, bh), "4 vs 4", font_size=FS_H2, bold=True, border_r=8)

        pbw, pbh = pr.width - 40, 70
        self._btn_dm  = Button((pr.x+20, pr.y+70,  pbw, pbh), "Deathmatch Práctica",  color=(190,140,50), hot_color=ACCENT_HOT, font_size=FS_BODY)
        self._btn_cz  = Button((pr.x+20, pr.y+150, pbw, pbh), "Capturar la Zona",     color=(170,120,55), hot_color=ACCENT_HOT, font_size=FS_BODY)

        self._btn_ow  = Button((ow.x+20, ow.centery-30, ow.width-40, 60),
                                "ENTRAR AL WASTELAND", color=(60,40,20), hot_color=(100,60,20),
                                font_size=FS_H2, bold=True)

        # Botón agregar amigo
        sr = self._social_rect
        self._btn_add_friend  = Button((sr.x+10, sr.bottom-130, sr.width-20, 50), "+ Agregar Amigo", color=(30,50,30), hot_color=(50,80,50), font_size=FS_BODY)
        self._btn_crear_sala  = Button((sr.x+10, sr.bottom-70,  sr.width-20, 50), "Crear Sala",      color=(170,120,55), hot_color=ACCENT_HOT, font_size=FS_BODY)

        self._btn_cancel_queue = Button(
            (SCREEN_W//2 - 160, SCREEN_H//2 + 140, 320, 60),
            "Cancelar Búsqueda", color=(100,30,30), hot_color=(160,40,40),
            font_size=FS_BODY, bold=True
        )

        self._all_buttons = [
            self._btn_1v1, self._btn_2v2, self._btn_4v4,
            self._btn_dm, self._btn_cz, self._btn_ow,
            self._btn_add_friend, self._btn_crear_sala,
        ]

    # ── Events ────────────────────────────────────────────────────────────────

    def handle_event(self, event, mx=0, my=0):
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                if self.state == "searching":
                    self.state = "menu"
                    leave_queue(self.player["id"])
                    return self.ACT_CANCEL_QUEUE
                elif self.state == "add_friend":
                    self.state = "menu"
                else:
                    return self.ACT_QUIT

            if self.state == "add_friend" and self._input_active:
                if event.key == pygame.K_RETURN:
                    self._send_friend_request()
                elif event.key == pygame.K_BACKSPACE:
                    self._friend_input = self._friend_input[:-1]
                else:
                    if len(self._friend_input) < 24:
                        self._friend_input += event.unicode

        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.state == "searching":
                if self._btn_cancel_queue.clicked(mx, my):
                    self.state = "menu"
                    leave_queue(self.player["id"])
                    return self.ACT_CANCEL_QUEUE
                return None

            # Botones de modo competitivo
            if self._btn_1v1.clicked(mx, my):
                self._start_queue("1v1")
                return None
            if self._btn_2v2.clicked(mx, my):
                self._start_queue("2v2")
                return None
            if self._btn_4v4.clicked(mx, my):
                self._start_queue("4v4")
                return None

            # Práctica
            if self._btn_dm.clicked(mx, my):
                return self.ACT_PRACTICE_DM
            if self._btn_cz.clicked(mx, my):
                return self.ACT_PRACTICE_CZ

            # Mundo abierto
            if self._btn_ow.clicked(mx, my):
                return self.ACT_OPEN_WORLD

            # Social
            if self._btn_add_friend.clicked(mx, my):
                self.state        = "add_friend"
                self._friend_input = ""
                self._input_active = True
            if self._btn_crear_sala.clicked(mx, my):
                self._notify("Sala creada — invitá a tus amigos con el código")

        return None

    # ── Logic helpers ─────────────────────────────────────────────────────────

    def _start_queue(self, mode):
        self.state       = "searching"
        self.queue_mode  = mode
        self.queue_start = time.time()
        self._last_poll_time = 0.0
        self.matched_room_id = None
        join_queue(self.player["id"], mode, self.player.get(f"elo_{mode}", 1500))

    def _send_friend_request(self):
        name = self._friend_input.strip()
        if name:
            self._notify(f"Solicitud enviada a {name}")
        self.state        = "menu"
        self._friend_input = ""

    def _notify(self, msg, duration=3.0):
        self._notif_msg   = msg
        self._notif_timer = duration

    # ── Update ────────────────────────────────────────────────────────────────

    def update(self, dt, mx, my):
        self._anim_timer += dt
        self._dots_timer += dt
        if self._dots_timer >= 0.45:
            self._dots_timer  = 0
            self._dots_frame  = (self._dots_frame + 1) % 4
        if self._notif_timer > 0:
            self._notif_timer -= dt

        for btn in self._all_buttons:
            btn.update(mx, my)
        if self.state == "searching":
            self._btn_cancel_queue.update(mx, my)
            # Polling del matchmaking
            now = time.time()
            if now - self._last_poll_time >= 2.0:
                self._last_poll_time = now
                mode = self.queue_mode
                player_id = self.player["id"]
                elo_val = self.player.get(f"elo_{mode}", 1500)
                
                # Aumentar rango de ELO a buscar con el tiempo (15 ELO extra por segundo de búsqueda)
                elapsed = now - self.queue_start
                rango = 200 + int(elapsed * 15)
                
                if is_connected():
                    # Primero verificar si otro host ya nos emparejó
                    room_id = check_queue_status(player_id)
                    if room_id:
                        print(f"[Matchmaking] ¡Emparejado! Entrando a la sala {room_id}")
                        self.state = "menu"
                        self.matched_room_id = room_id
                        return f"play_match_{mode}"
                    
                    # Intentar emparejar nosotros como host
                    room_id = find_match(player_id, mode, elo_val, rango)
                    if room_id:
                        print(f"[Matchmaking] ¡Partida creada! Entrando a la sala {room_id} como Host")
                        self.state = "menu"
                        self.matched_room_id = room_id
                        return f"play_match_{mode}"
                else:
                    # Modo simulado: transicionar después de 5 segundos
                    if elapsed >= 5.0:
                        print("[Matchmaking] Emparejamiento simulado exitoso.")
                        self.state = "menu"
                        self.matched_room_id = "mock_room_123"
                        return f"play_match_{mode}"
        return None

    # ── Draw ──────────────────────────────────────────────────────────────────

    def draw(self, surface):
        if getattr(self, "_bg_cache", None) is None:
            self._bg_cache = self._build_bg()
        surface.blit(self._bg_cache, (0, 0))
        self._draw_top_bar(surface)
        self._draw_competitive_panel(surface)
        self._draw_practice_panel(surface)
        self._draw_openworld_panel(surface)
        self._draw_social_panel(surface)
        self._draw_bottom_bar(surface)

        if self._notif_timer > 0:
            self._draw_notification(surface)

        if self.state == "searching":
            self._draw_searching_overlay(surface)
        elif self.state == "add_friend":
            self._draw_add_friend_modal(surface)

    # ── Draw helpers ──────────────────────────────────────────────────────────

    def _build_bg(self):
        """Fondo cacheado: gradiente cálido + viñeta + scanlines sutiles."""
        bg = pygame.Surface((SCREEN_W, SCREEN_H))
        for y in range(SCREEN_H):
            t = y / SCREEN_H
            c = (int(BG_TOP[0] + (BG[0]-BG_TOP[0])*t),
                 int(BG_TOP[1] + (BG[1]-BG_TOP[1])*t),
                 int(BG_TOP[2] + (BG[2]-BG_TOP[2])*t))
            pygame.draw.line(bg, c, (0, y), (SCREEN_W, y))
        # Scanlines muy sutiles
        sl = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        for y in range(0, SCREEN_H, 3):
            pygame.draw.line(sl, (0, 0, 0, 22), (0, y), (SCREEN_W, y))
        bg.blit(sl, (0, 0))
        # Viñeta (oscurece bordes)
        vig = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        for i in range(120):
            a = int(90 * (1 - i/120))
            pygame.draw.rect(vig, (0, 0, 0, a), (i, i, SCREEN_W-2*i, SCREEN_H-2*i), 1)
        bg.blit(vig, (0, 0))
        return bg

    def _hazard_strip(self, surf, x, y, w, h):
        """Cinta de peligro: rayas diagonales amarillo/negro."""
        band = pygame.Rect(x, y, w, h)
        prev = surf.get_clip()
        surf.set_clip(band)
        surf.fill(HAZARD_D, band)
        sw = 13
        for sx in range(x - h, x + w + sw, sw * 2):
            pygame.draw.polygon(surf, HAZARD_Y,
                [(sx, y + h), (sx + sw, y + h), (sx + sw + h, y), (sx + h, y)])
        surf.set_clip(prev)

    def _draw_panel(self, surf, rect, title=None, accent=None):
        accent = accent or BORDER_HOT
        # Sombra
        pygame.draw.rect(surf, (0, 0, 0), rect.move(5, 6), border_radius=4)
        # Cuerpo
        pygame.draw.rect(surf, PANEL_BG, rect, border_radius=4)
        # Borde + brillo superior
        pygame.draw.rect(surf, BORDER, rect, 2, border_radius=4)
        pygame.draw.line(surf, RUST, (rect.x + 6, rect.y + 2), (rect.right - 6, rect.y + 2))
        if title:
            # Banda de header
            head = pygame.Rect(rect.x + 2, rect.y + 2, rect.width - 4, 48)
            pygame.draw.rect(surf, PANEL_HEAD, head, border_top_left_radius=4, border_top_right_radius=4)
            self._hazard_strip(surf, rect.x + 2, rect.y + 50, rect.width - 4, 4)
            lbl = self._font(FS_H1, bold=True).render(title, True, accent)
            surf.blit(lbl, (rect.x + 18, rect.y + 8))
            # Remaches en esquinas del header
            for rx in (rect.x + 12, rect.right - 12):
                pygame.draw.circle(surf, BORDER, (rx, rect.y + 14), 3)
        # Remaches inferiores
        for rx in (rect.x + 12, rect.right - 12):
            pygame.draw.circle(surf, BORDER, (rx, rect.bottom - 11), 3)

    def _draw_top_bar(self, surf):
        bar = pygame.Rect(0, 0, SCREEN_W, 84)
        pygame.draw.rect(surf, PANEL_DARK, bar)
        self._hazard_strip(surf, 0, 84, SCREEN_W, 5)

        # Logo + tagline
        logo = self._font(FS_TITLE, bold=True).render("WASTELAND", True, ACCENT_HOT)
        surf.blit(logo, (28, 4))
        tag = self._font(FS_SMALL).render("SOBREVIVÍ · DOMINÁ · REMATERIALIZÁ", True, TEXT_DIM)
        surf.blit(tag, (34, 62))

        # Estado de conexión (chip)
        connected = is_connected()
        dot_col = GREEN_ON if connected else RED_OFF
        dot_txt = "ONLINE" if connected else "OFFLINE"
        chip = self._font(FS_SMALL).render(dot_txt, True, dot_col)
        chip_x = SCREEN_W - 430 - chip.get_width() - 24
        pygame.draw.circle(surf, dot_col, (chip_x, 42), 6)
        surf.blit(chip, (chip_x + 14, 32))

        # Player card (derecha) — sin solapamientos
        card = pygame.Rect(SCREEN_W - 410, 9, 392, 66)
        pygame.draw.rect(surf, PANEL_BG, card)
        pygame.draw.rect(surf, BORDER, card, 1)
        self._draw_rank_badge(surf, card.x + 8, card.y + 9, 48, self.rank)
        name = self._font(FS_H2, bold=True).render(self.player["username"], True, TEXT)
        surf.blit(name, (card.x + 66, card.y + 7))
        rank_lbl = self._font(FS_SMALL).render(self.rank["name"], True, tuple(self.rank["color"]))
        surf.blit(rank_lbl, (card.x + 66, card.y + 38))
        elo_lbl = self._font(FS_BODY, bold=True).render(f"{self.player['elo']}", True, BLUE_ELO)
        surf.blit(elo_lbl, (card.right - elo_lbl.get_width() - 48, card.y + 20))
        elo_tag = self._font(FS_SMALL).render("ELO", True, TEXT_DIM)
        surf.blit(elo_tag, (card.right - 38, card.y + 28))

    def _draw_rank_badge(self, surf, x, y, size, rank):
        col = tuple(rank["color"])
        cx, cy, r = x + size//2, y + size//2, size//2 - 2
        tier = rank["tier"]
        if tier in ("hierro", "bronce"):
            pygame.draw.circle(surf, col, (cx, cy), r, 3)
            pygame.draw.circle(surf, tuple(c//2 for c in col), (cx, cy), r-4)
        elif tier in ("plata", "oro"):
            pts = [(cx, cy-r), (cx+r, cy), (cx, cy+r), (cx-r, cy)]
            pygame.draw.polygon(surf, tuple(c//2 for c in col), pts)
            pygame.draw.polygon(surf, col, pts, 3)
        elif tier in ("platino", "diamante"):
            pts = [(cx, cy-r), (cx+int(r*0.7), cy-int(r*0.3)),
                   (cx+int(r*0.4), cy+r), (cx-int(r*0.4), cy+r),
                   (cx-int(r*0.7), cy-int(r*0.3))]
            pygame.draw.polygon(surf, tuple(c//2 for c in col), pts)
            pygame.draw.polygon(surf, col, pts, 3)
        else:
            # Maestro/Campeón: estrella
            for i in range(5):
                a1 = math.pi/2 + i*2*math.pi/5
                a2 = a1 + math.pi/5
                p1 = (cx + int(r*math.cos(a1)), cy - int(r*math.sin(a1)))
                p2 = (cx + int(r*0.4*math.cos(a2)), cy - int(r*0.4*math.sin(a2)))
                pygame.draw.line(surf, col, p1, p2, 3)

    def _draw_competitive_panel(self, surf):
        cr = self._competitive_rect
        self._draw_panel(surf, cr, "COMPETITIVO", BORDER_HOT)

        # Rank display grande
        rank_col = tuple(self.rank["color"])
        self._draw_rank_badge(surf, cr.x + 20, cr.y + 70, 110, self.rank)

        rname = self._font(FS_H1, bold=True).render(self.rank["name"], True, rank_col)
        surf.blit(rname, (cr.x + 150, cr.y + 80))

        elo_big = self._font(FS_TITLE, bold=True).render(str(self.player["elo"]), True, BLUE_ELO)
        surf.blit(elo_big, (cr.x + 150, cr.y + 115))
        surf.blit(self._font(FS_SMALL).render("ELO", True, TEXT_DIM), (cr.x + 150 + elo_big.get_width() + 8, cr.y + 145))

        # Stats
        total = max(1, self.player["wins"] + self.player["losses"])
        wr    = self.player["wins"] / total * 100
        stats_x = cr.x + 150
        stats_y = cr.y + 205
        for label, val, col in [
            ("VICTORIAS", str(self.player["wins"]),  GREEN_ON),
            ("DERROTAS",  str(self.player["losses"]), DANGER),
            ("WIN RATE",  f"{wr:.0f}%",               GOLD),
        ]:
            lbl = self._font(FS_SMALL).render(label, True, TEXT_DIM)
            val_s = self._font(FS_H2, bold=True).render(val, True, col)
            surf.blit(lbl, (stats_x, stats_y))
            surf.blit(val_s, (stats_x, stats_y + 20))
            stats_x += 160

        # Separador
        pygame.draw.line(surf, BORDER, (cr.x+14, cr.y+305), (cr.right-14, cr.y+305), 1)

        # Título modos
        surf.blit(self._font(FS_BODY, bold=True).render("Elegir modo de partida:", True, TEXT_DIM),
                  (cr.x+20, cr.y+315))

        # Botones modos
        for btn, desc in [
            (self._btn_1v1, "Duelo 1v1"),
            (self._btn_2v2, "2 vs 2"),
            (self._btn_4v4, "4 vs 4"),
        ]:
            btn.draw(surf)

        # Dibujar ELOs de categorías individuales debajo de los botones
        bw, gap = 190, 16
        submodes = [
            ("1v1", self.player["elo_1v1"], cr.x + 20),
            ("2v2", self.player["elo_2v2"], cr.x + 20 + bw + gap),
            ("4v4", self.player["elo_4v4"], cr.x + 20 + bw*2 + gap*2),
        ]
        
        for name_mode, elo_val, start_x in submodes:
            rank_obj = elo_to_rank(elo_val)
            r_color = tuple(rank_obj["color"])
            
            # Dibujar badge pequeña
            self._draw_rank_badge(surf, start_x + 5, cr.y + 455, 38, rank_obj)
            
            # Nombre de la categoría
            t_cat = self._font(FS_SMALL - 1, bold=True).render(f"RANGO {name_mode}", True, TEXT_DIM)
            surf.blit(t_cat, (start_x + 50, cr.y + 448))
            
            # ELO y Nombre de rango
            t_elo = self._font(FS_BODY - 2, bold=True).render(f"{elo_val} ELO", True, BLUE_ELO)
            surf.blit(t_elo, (start_x + 50, cr.y + 468))
            
            t_rank = self._font(FS_SMALL - 1).render(rank_obj["name"], True, r_color)
            surf.blit(t_rank, (start_x + 50, cr.y + 488))

        # Info extra debajo
        note_y = cr.y + 580
        surf.blit(self._font(FS_SMALL).render(
            "Matchmaking basado en ELO ±200  —  Sistema CS2-style",
            True, TEXT_DARK), (cr.x+20, note_y))

    def _draw_practice_panel(self, surf):
        pr = self._practice_rect
        self._draw_panel(surf, pr, "PRÁCTICA")
        self._btn_dm.draw(surf)
        self._btn_cz.draw(surf)

    def _draw_openworld_panel(self, surf):
        ow = self._openworld_rect
        # Fondo especial con tinte naranja pulsante
        pulse = 0.5 + 0.5 * math.sin(self._anim_timer * 1.2)
        tint  = tuple(int(c + (BORDER_HOT[i] - c) * pulse * 0.3)
                      for i, c in enumerate(PANEL_BG))
        pygame.draw.rect(surf, tint, ow, border_radius=8)
        pygame.draw.rect(surf, BORDER_HOT, ow, 2, border_radius=8)

        title = self._font(FS_H2, bold=True).render("MUNDO ABIERTO", True, ACCENT_HOT)
        surf.blit(title, (ow.x + 20, ow.y + 10))
        sub = self._font(FS_SMALL).render("Firebase — Mundo persistente online", True, TEXT_DIM)
        surf.blit(sub, (ow.x + 20, ow.y + 44))
        self._btn_ow.draw(surf)

    def _draw_social_panel(self, surf):
        sr = self._social_rect
        self._draw_panel(surf, sr, "AMIGOS")

        online  = sum(1 for f in self.friends if f["status"] == "online")
        count_s = self._font(FS_SMALL).render(f"{online}/{len(self.friends)} online", True, GREEN_ON)
        surf.blit(count_s, (sr.right - count_s.get_width() - 16, sr.y + 16))

        # Placeholder si no hay contactos
        if not self.friends:
            msg = self._font(FS_BODY).render("Sin contactos en la red", True, TEXT_DARK)
            surf.blit(msg, (sr.centerx - msg.get_width()//2, sr.y + 180))
            sub = self._font(FS_SMALL).render("Agregá un sobreviviente para escuadrar", True, TEXT_DARK)
            surf.blit(sub, (sr.centerx - sub.get_width()//2, sr.y + 210))

        fy = sr.y + 64
        for friend in self.friends[:7]:
            if fy + 60 > sr.bottom - 150:
                break
            # Dot
            dot_col = GREEN_ON if friend["status"] == "online" else (80, 70, 60)
            pygame.draw.circle(surf, dot_col, (sr.x + 22, fy + 18), 7)

            name = self._font(FS_BODY, bold=True).render(friend["username"], True, TEXT)
            surf.blit(name, (sr.x + 38, fy + 4))

            act = self._font(FS_SMALL).render(friend["activity"], True, TEXT_DIM)
            surf.blit(act, (sr.x + 38, fy + 26))

            rank_f = elo_to_rank(friend["elo"])
            self._draw_rank_badge(surf, sr.right - 40, fy + 4, 30, rank_f)

            pygame.draw.line(surf, BORDER, (sr.x+10, fy+56), (sr.right-10, fy+56), 1)
            fy += 58

        self._btn_add_friend.draw(surf)
        self._btn_crear_sala.draw(surf)

    def _draw_bottom_bar(self, surf):
        br = self._bottom_rect
        pygame.draw.rect(surf, PANEL_DARK, br, border_radius=8)
        pygame.draw.rect(surf, BORDER, br, 1, border_radius=8)

        title = self._font(FS_H2, bold=True).render("ÚLTIMAS PARTIDAS", True, ACCENT)
        surf.blit(title, (br.x + 20, br.y + 16))

        # Mock historial
        matches = [
            ("1v1",  "Victoria", "+28", GREEN_ON),
            ("2v2",  "Derrota",  "-22", DANGER),
            ("4v4",  "Victoria", "+31", GREEN_ON),
            ("1v1",  "Victoria", "+19", GREEN_ON),
            ("2v2",  "Derrota",  "-18", DANGER),
        ]
        mx2 = br.x + 20
        for mode, result, elo_ch, col in matches:
            w = 200
            bg = (20, 35, 15) if col == GREEN_ON else (35, 15, 15)
            r  = pygame.Rect(mx2, br.y + 60, w-8, 90)
            pygame.draw.rect(surf, bg,   r, border_radius=6)
            pygame.draw.rect(surf, col,  r, 1, border_radius=6)
            surf.blit(self._font(FS_BODY, bold=True).render(mode,   True, TEXT),    (r.x+12, r.y+10))
            surf.blit(self._font(FS_BODY).render(result, True, col),                (r.x+12, r.y+36))
            surf.blit(self._font(FS_H2, bold=True).render(elo_ch, True, col),       (r.x+12, r.y+60))
            mx2 += w

    def _draw_searching_overlay(self, surf):
        # Fondo oscuro
        dim = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        dim.fill((0, 0, 0, 200))
        surf.blit(dim, (0, 0))

        # Panel central
        pw, ph = 600, 340
        px, py = SCREEN_W//2 - pw//2, SCREEN_H//2 - ph//2
        panel  = pygame.Rect(px, py, pw, ph)
        pygame.draw.rect(surf, PANEL_BG, panel, border_radius=12)
        pygame.draw.rect(surf, BORDER_HOT, panel, 2, border_radius=12)

        # Modo
        mode_lbl = self._font(FS_TITLE, bold=True).render(self.queue_mode, True, ACCENT_HOT)
        surf.blit(mode_lbl, (SCREEN_W//2 - mode_lbl.get_width()//2, py + 30))

        # Texto animado
        dots  = "." * self._dots_frame
        txt   = f"Buscando partida{dots}"
        tlbl  = self._font(FS_H2).render(txt, True, TEXT)
        surf.blit(tlbl, (SCREEN_W//2 - tlbl.get_width()//2, py + 130))

        # Timer
        elapsed = time.time() - self.queue_start
        m, s    = int(elapsed)//60, int(elapsed)%60
        timer_s = self._font(FS_TITLE, bold=True).render(f"{m:02d}:{s:02d}", True, BLUE_ELO)
        surf.blit(timer_s, (SCREEN_W//2 - timer_s.get_width()//2, py + 175))

        # ELO range info
        elo_info = self._font(FS_SMALL).render(
            f"ELO {self.player['elo']-200} — {self.player['elo']+200}  ·  "
            f"{'Ampliando rango...' if elapsed > 60 else 'Rango estándar ±200'}",
            True, TEXT_DIM)
        surf.blit(elo_info, (SCREEN_W//2 - elo_info.get_width()//2, py + 255))

        # Spinner
        sa = self._anim_timer * 3
        for i in range(8):
            a     = sa + i * math.pi/4
            alpha = int(60 + 195 * (i/8))
            sx2   = SCREEN_W//2 + int(26 * math.cos(a))
            sy2   = py + 90 + int(26 * math.sin(a))
            pygame.draw.circle(surf, (*ACCENT_HOT, alpha)[:3], (sx2, sy2), 5)

        self._btn_cancel_queue.draw(surf)

    def _draw_add_friend_modal(self, surf):
        dim = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        dim.fill((0, 0, 0, 180))
        surf.blit(dim, (0, 0))

        pw, ph = 560, 240
        px, py = SCREEN_W//2 - pw//2, SCREEN_H//2 - ph//2
        panel  = pygame.Rect(px, py, pw, ph)
        pygame.draw.rect(surf, PANEL_BG, panel, border_radius=10)
        pygame.draw.rect(surf, BORDER_HOT, panel, 2, border_radius=10)

        surf.blit(self._font(FS_H1, bold=True).render("Agregar Amigo", True, ACCENT_HOT),
                  (px + 20, py + 20))
        surf.blit(self._font(FS_BODY).render("Nombre de usuario:", True, TEXT_DIM),
                  (px + 20, py + 75))

        # Input box
        inp_rect = pygame.Rect(px + 20, py + 105, pw - 40, 48)
        pygame.draw.rect(surf, (25, 20, 14), inp_rect, border_radius=6)
        pygame.draw.rect(surf, ACCENT_HOT if self._input_active else BORDER, inp_rect, 2, border_radius=6)
        cursor = "|" if self._input_active and int(self._anim_timer * 2) % 2 == 0 else ""
        inp_t  = self._font(FS_H2).render(self._friend_input + cursor, True, TEXT)
        surf.blit(inp_t, (inp_rect.x + 10, inp_rect.centery - inp_t.get_height()//2))

        surf.blit(self._font(FS_SMALL).render("ENTER para enviar   ·   ESC para cancelar", True, TEXT_DIM),
                  (px + 20, py + 170))

    def _draw_notification(self, surf):
        t     = min(1.0, self._notif_timer / 0.4)
        alpha = int(230 * t)
        msg   = self._font(FS_BODY).render(self._notif_msg, True, TEXT)
        nw    = msg.get_width() + 40
        nh    = msg.get_height() + 20
        nx    = SCREEN_W//2 - nw//2
        ny    = SCREEN_H - 120
        bg    = pygame.Surface((nw, nh), pygame.SRCALPHA)
        bg.fill((*PANEL_BG, alpha))
        surf.blit(bg, (nx, ny))
        pygame.draw.rect(surf, (*ACCENT_HOT, alpha), (nx, ny, nw, nh), 2, border_radius=6)
        surf.blit(msg, (nx + 20, ny + 10))

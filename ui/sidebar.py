import pygame
import json
import time
from settings import *
from entities.assets import assets

# Layout interno del sidebar
_STATS_Y   = 12
_TAB_Y     = 100
_TAB_H     = 36
_CONTENT_Y = _TAB_Y + _TAB_H + 10   # 146

class Sidebar:
    def __init__(self, player):
        self.player   = player
        self.surface  = pygame.Surface((SIDEBAR_W, SCREEN_H))

        with open('data/items.json',   encoding='utf-8') as f: self._items_db   = json.load(f)
        with open('data/spells.json',  encoding='utf-8') as f: self._spells_db  = json.load(f)
        with open('data/classes.json', encoding='utf-8') as f: self._classes_db = json.load(f)

        self._font_sm  = None
        self._font_md  = None
        self._font_lg  = None
        self._fonts_ok = False

        # ── Inventario ──────────────────────────────────────────────────────
        self.inventory = [None] * 24
        self.inventory[0] = {"item_id": "hp_potion",       "qty": 10}
        self.inventory[1] = {"item_id": "mp_potion",       "qty": 10}
        self.inventory[2] = {"item_id": "hp_potion_large", "qty": 5}
        self.inventory[3] = {"item_id": "mp_potion_large", "qty": 5}

        self.selected_slot    = None
        self._last_click_slot = None
        self._last_click_time = 0.0

        # ── Potion cooldown ──────────────────────────────────────────────────
        # Dos tracks independientes: U y doble-clic tienen su propio CD y no
        # se interrumpen. Alternarlos permite potear casi al doble de ritmo.
        self.potion_timer_key   = 0.0   # track tecla U
        self.potion_timer_click = 0.0   # track doble-clic
        self._pot_flash         = 0.0

        # ── Habilidades Q/W/E ────────────────────────────────────────────────
        self.player_class   = player.player_class if hasattr(player, "player_class") else "baluarte"
        self._load_class_spells()
        self.pending_spell  = None
        self.on_spell_click = None

        # ── Solapas ───────────────────────────────────────────────────────────
        self.active_tab = "inventory"   # "inventory" | "spells"
        tw = (SIDEBAR_W - 16) // 2
        self._tab_inv_rect   = pygame.Rect(6,      _TAB_Y, tw, _TAB_H)
        self._tab_spell_rect = pygame.Rect(6+tw+4, _TAB_Y, tw, _TAB_H)

        # ── Grid inventario (dentro de solapa) ───────────────────────────────
        used_w       = SLOT_COLS * SLOT_SIZE + (SLOT_COLS - 1) * SLOT_PADDING
        self._grid_x = (SIDEBAR_W - used_w) // 2
        avail_h      = SCREEN_H - _CONTENT_Y - 10
        self._inv_rows = max(1, avail_h // (SLOT_SIZE + SLOT_PADDING))

        # ── Botones de hechizos (dentro de solapa) ────────────────────────────
        self._spell_rects = self._build_spell_rects()

        # ── Botón de configuración (tuerca) ──────────────────────────────────
        _gs = 44
        self._gear_btn = pygame.Rect(SIDEBAR_W - _gs - 8, SCREEN_H - _gs - 8, _gs, _gs)
        self._gear_font_ok = False
        self._gear_font    = None

        # ── Hover ─────────────────────────────────────────────────────────────
        self._hover_slot  = None
        self._hover_spell = None

    # ──────────────────────────────────────────── class loading

    def _load_class_spells(self):
        cls_data    = self._classes_db.get(self.player_class, {})
        spell_ids   = cls_data.get("spells", [])
        self.spells = [self._spells_db[sid] for sid in spell_ids if sid in self._spells_db]
        self.spell_timers = [0.0] * len(self.spells)
        self._spell_rects = self._build_spell_rects()

    def set_class(self, class_id: str):
        self.player_class = class_id
        self._load_class_spells()

    # ──────────────────────────────────────────── layout

    def _build_spell_rects(self):
        """Crea botones para todos los hechizos en columna compacta dinámica."""
        n       = len(self.spells) if hasattr(self, "spells") else 3
        n       = max(1, n)
        avail_h = SCREEN_H - _CONTENT_Y - 70
        btn_w   = SIDEBAR_W - 20
        gap     = 6
        # Si hay muchos hechizos, reducir la altura de cada botón para que quepan todos
        btn_h   = min(100, (avail_h - gap * (n - 1)) // n)
        ox      = 10
        rects   = []
        y       = _CONTENT_Y + 6
        for _ in range(n):
            rects.append(pygame.Rect(ox, y, btn_w, btn_h))
            y += btn_h + gap
        return rects

    def _slot_rect(self, idx):
        col = idx % SLOT_COLS
        row = idx // SLOT_COLS
        x   = self._grid_x + col * (SLOT_SIZE + SLOT_PADDING)
        y   = _CONTENT_Y   + row * (SLOT_SIZE + SLOT_PADDING)
        return pygame.Rect(x, y, SLOT_SIZE, SLOT_SIZE)

    # ──────────────────────────────────────────── input público

    def switch_tab(self, tab: str):
        """Llamado por Game con teclas I / H."""
        self.active_tab = tab

    def handle_click(self, pos):
        """pos en coordenadas del sidebar."""
        now = time.time()

        # ── Botón tuerca ──
        if self._gear_btn.collidepoint(pos):
            return "open_settings"   # señal al Game

        # ── Solapas ──
        if self._tab_inv_rect.collidepoint(pos):
            self.active_tab = "inventory"
            return
        if self._tab_spell_rect.collidepoint(pos):
            self.active_tab = "spells"
            return

        # ── Contenido según solapa activa ──
        if self.active_tab == "inventory":
            visible = SLOT_COLS * self._inv_rows
            for i in range(min(len(self.inventory), visible)):
                if self._slot_rect(i).collidepoint(pos):
                    if self._last_click_slot == i and (now - self._last_click_time) < DOUBLE_CLICK_TIME:
                        self._use_item("click", i)
                        self._last_click_slot = None
                    else:
                        self.selected_slot    = i
                        self._last_click_slot = i
                        self._last_click_time = now
                    return

        elif self.active_tab == "spells":
            for i, rect in enumerate(self._spell_rects):
                if i < len(self.spells) and rect.collidepoint(pos):
                    self._on_spell_button(i)
                    return

    def use_selected_item(self):
        """Tecla U — funciona desde cualquier solapa."""
        if self.selected_slot is not None:
            self._use_item("key", self.selected_slot)

    # ──────────────────────────────────────────── lógica de pociones

    def _use_item(self, method: str, idx: int):
        # Cada método consulta y resetea SOLO su propio track
        timer = self.potion_timer_key if method == "key" else self.potion_timer_click
        if timer > 0:
            return
        if not self._apply_item(idx):
            return
        if method == "key":
            self.potion_timer_key   = POTION_CD_KEY
        else:
            self.potion_timer_click = POTION_CD_CLICK
        self._pot_flash = 0.25

    def _apply_item(self, idx) -> bool:
        slot = self.inventory[idx]
        if slot is None:
            return False
        data = self._items_db.get(slot["item_id"])
        if not data or data.get("type") != "consumable":
            return False
        if data.get("restore_hp", 0): self.player.hp = min(self.player.max_hp, self.player.hp + data["restore_hp"])
        if data.get("restore_mp", 0): self.player.mp = min(self.player.max_mp, self.player.mp + data["restore_mp"])
        slot["qty"] -= 1
        if slot["qty"] <= 0:
            self.inventory[idx] = None
            if self.selected_slot == idx:
                self.selected_slot = None
        return True

    # ──────────────────────────────────────────── lógica de hechizos

    def _on_spell_button(self, idx):
        if idx >= len(self.spells): return
        spell = self.spells[idx]
        cost  = spell.get("energy_cost", spell.get("mp_cost", 0))
        if self.spell_timers[idx] > 0: return
        if self.player.mp < cost: return
        if self.on_spell_click:
            self.on_spell_click(idx)

    def confirm_cast(self, idx):
        if idx >= len(self.spells): return
        spell = self.spells[idx]
        cost  = spell.get("energy_cost", spell.get("mp_cost", 0))
        self.player.mp        -= cost
        self.spell_timers[idx] = spell.get("cooldown", 1.5)
        self.pending_spell     = None

    def cancel_pending(self):
        self.pending_spell = None

    def get_spell(self, idx):
        return self.spells[idx] if 0 <= idx < len(self.spells) else None

    # ──────────────────────────────────────────── update

    def update(self, dt):
        self.potion_timer_key   = max(0.0, self.potion_timer_key   - dt)
        self.potion_timer_click = max(0.0, self.potion_timer_click - dt)
        self._pot_flash         = max(0.0, self._pot_flash         - dt)
        for i in range(len(self.spell_timers)):
            self.spell_timers[i] = max(0.0, self.spell_timers[i] - dt)

        mx, my = pygame.mouse.get_pos()
        self._hover_slot  = None
        self._hover_spell = None
        if mx >= GAME_W:
            sx, sy = mx - GAME_W, my
            if self.active_tab == "inventory":
                visible = SLOT_COLS * self._inv_rows
                for i in range(min(len(self.inventory), visible)):
                    if self._slot_rect(i).collidepoint((sx, sy)):
                        self._hover_slot = i
                        break
            elif self.active_tab == "spells":
                for i, rect in enumerate(self._spell_rects):
                    if i < len(self.spells) and rect.collidepoint((sx, sy)):
                        self._hover_spell = i
                        break

    # ──────────────────────────────────────────── draw

    def draw(self, screen, offset_x, offset_y):
        self.surface.fill(SIDEBAR_BG)
        if not self._fonts_ok:
            self._font_sm  = pygame.font.SysFont('Arial', 17)
            self._font_md  = pygame.font.SysFont('Arial', 20)
            self._font_lg  = pygame.font.SysFont('Arial', 23, bold=True)
            self._fonts_ok = True

        # Acento hazard arriba de todo (firma Borderlands)
        self._hazard_band(0, 6)

        self._draw_stats()
        self._draw_tabs()
        self._hazard_band(_CONTENT_Y - 8, 5)

        if self.active_tab == "inventory":
            self._draw_inventory()
        else:
            self._draw_spells()

        # Borde izquierdo del panel (metal oxidado)
        pygame.draw.line(self.surface, RUST, (0, 0), (0, SCREEN_H), 3)
        self._draw_gear_btn()
        screen.blit(self.surface, (offset_x, offset_y))

    def _draw_divider(self, y):
        pygame.draw.line(self.surface, DIVIDER_COLOR, (6, y), (SIDEBAR_W - 6, y), 1)

    def _hazard_band(self, y, h, x0=0, x1=None):
        """Rayas diagonales amarillo/negro estilo cinta de peligro."""
        s = self.surface
        if x1 is None:
            x1 = SIDEBAR_W
        band = pygame.Rect(x0, y, x1 - x0, h)
        prev = s.get_clip()
        s.set_clip(band)
        s.fill(HAZARD_DARK, band)
        sw = 11
        for sx in range(x0 - h, x1 + sw, sw * 2):
            pygame.draw.polygon(s, HAZARD_YELLOW,
                [(sx, y + h), (sx + sw, y + h), (sx + sw + h, y), (sx + h, y)])
        s.set_clip(prev)

    def _stat_bar(self, x, y, w, h, val, maxv, col, label):
        s = self.surface
        pygame.draw.rect(s, BAR_BG, (x, y, w, h))
        fill = max(0, int(w * val / maxv)) if maxv else 0
        if fill:
            pygame.draw.rect(s, col, (x, y, fill, h))
            pygame.draw.rect(s, tuple(min(255, c + 45) for c in col), (x, y, fill, 3))  # brillo
        pygame.draw.rect(s, SLOT_BORDER, (x, y, w, h), 1)
        txt = self._font_sm.render(f"{label}  {val} / {maxv}", True, TEXT_WHITE)
        s.blit(txt, (x + 6, y + (h - txt.get_height()) // 2))

    def _draw_stats(self):
        s, pad = self.surface, 12
        cls  = self._classes_db.get(self.player_class, {})
        name = cls.get("name", self.player_class.title())
        role = cls.get("role", "")
        y = _STATS_Y + 4

        # Nombre de clase (grande) + rol en ámbar
        s.blit(self._font_lg.render(name.upper(), True, TEXT_WHITE), (pad, y))
        if role:
            rs = self._font_sm.render(role, True, ACCENT_ORANGE)
            s.blit(rs, (SIDEBAR_W - pad - rs.get_width(), y + 7))
        y += 32

        bar_w, bar_h = SIDEBAR_W - pad * 2, 17
        self._stat_bar(pad, y, bar_w, bar_h, self.player.hp, self.player.max_hp, HP_COLOR, "HP")
        y += bar_h + 6
        self._stat_bar(pad, y, bar_w, bar_h, int(self.player.mp), self.player.max_mp, MP_COLOR, "EN")

    def _draw_tabs(self):
        s = self.surface
        for tab, rect, label in [
            ("inventory", self._tab_inv_rect,   "INVENTARIO"),
            ("spells",    self._tab_spell_rect,  "HABILIDADES"),
        ]:
            active = (self.active_tab == tab)
            bg     = SLOT_HOVER if active else SLOT_BG
            border = ACCENT_ORANGE if active else SLOT_BORDER
            pygame.draw.rect(s, bg, rect)
            pygame.draw.rect(s, border, rect, 2 if active else 1)
            # Barra ámbar inferior en la solapa activa
            if active:
                pygame.draw.rect(s, ACCENT_ORANGE, (rect.x, rect.bottom - 3, rect.width, 3))
            lbl = self._font_sm.render(label, True, TEXT_WHITE if active else TEXT_DIM)
            s.blit(lbl, (rect.centerx - lbl.get_width() // 2, rect.centery - lbl.get_height() // 2))

    def _draw_gear_btn(self):
        if not self._gear_font_ok:
            self._gear_font    = pygame.font.SysFont('Arial', 28)
            self._gear_font_ok = True
        r    = self._gear_btn
        mx, my = pygame.mouse.get_pos()
        hover  = r.collidepoint((mx - GAME_W, my))
        bg     = (60, 60, 90) if hover else (35, 35, 55)
        border = (120, 120, 170) if hover else (65, 65, 95)
        pygame.draw.rect(self.surface, bg,     r, border_radius=6)
        pygame.draw.rect(self.surface, border, r, 1, border_radius=6)
        gear = self._gear_font.render("⚙", True, (190, 190, 220))
        self.surface.blit(gear, (r.centerx - gear.get_width() // 2,
                                  r.centery - gear.get_height() // 2))

    def _draw_inventory(self):
        s = self.surface

        # Cooldown indicators — dos tracks independientes (U y doble-clic)
        cd_x = SIDEBAR_W - 6
        if self.potion_timer_click > 0:
            lbl = self._font_sm.render(f"2×clic {self.potion_timer_click:.1f}s", True, (100, 210, 255))
            s.blit(lbl, (cd_x - lbl.get_width(), _CONTENT_Y + 2))
        if self.potion_timer_key > 0:
            lbl = self._font_sm.render(f"U {self.potion_timer_key:.1f}s", True, COOLDOWN_FLASH)
            s.blit(lbl, (cd_x - lbl.get_width(), _CONTENT_Y + 20))

        # Hint
        hint = self._font_sm.render("[U] usar  [2×clic] usar", True, TEXT_DIM)
        s.blit(hint, ((SIDEBAR_W - hint.get_width()) // 2, _CONTENT_Y + 2))

        visible = SLOT_COLS * self._inv_rows
        for i in range(min(len(self.inventory), visible)):
            rect = self._slot_rect(i)
            slot = self.inventory[i]

            if i == self.selected_slot: bg = SLOT_SELECTED
            elif i == self._hover_slot: bg = SLOT_HOVER
            else:                       bg = SLOT_BG
            pygame.draw.rect(s, bg, rect, border_radius=4)
            pygame.draw.rect(s, SLOT_BORDER, rect, 1, border_radius=4)

            if slot:
                data  = self._items_db.get(slot["item_id"], {})
                # 1) Sprite del item (assets/items/<id>.png)
                spr = assets.sprite(f"items/{slot['item_id']}.png", rect.height - 12)
                if spr is not None:
                    s.blit(spr, (rect.centerx - spr.get_width()//2,
                                 rect.centery - spr.get_height()//2))
                else:
                    # 2) Fallback: elipse de color
                    color = tuple(data.get("color", [150, 150, 150]))
                    if self._pot_flash > 0 and i == self.selected_slot:
                        t = self._pot_flash / 0.25
                        color = tuple(min(255, int(c + (255 - c) * t)) for c in color)
                    icon = rect.inflate(-12, -12)
                    pygame.draw.ellipse(s, color, icon)
                    pygame.draw.ellipse(s, WHITE, icon, 1)
                qty = self._font_sm.render(str(slot["qty"]), True, TEXT_WHITE)
                s.blit(qty, (rect.right - qty.get_width() - 3, rect.bottom - qty.get_height() - 2))

    def _draw_spells(self):
        s     = self.surface
        dmult_labels = {
            "single_melee":   "Melee ST ×1.0",
            "single_ranged":  "Ranged ST ×0.85",
            "aoe_targeted":   "AoE ×0.55",
            "aoe_self":       "AoE Self ×0.45",
            "melee_area":     "Melee AoE ×0.45",
            "self":           "Self",
            "resurrect":      "Revive",
            "single_target_heal": "Curación",
            "aoe_heal":       "AoE Curación",
        }

        for i, rect in enumerate(self._spell_rects):
            if i >= len(self.spells): break
            spell   = self.spells[i]
            on_cd   = self.spell_timers[i] > 0
            cost    = spell.get("energy_cost", spell.get("mp_cost", 0))
            no_en   = self.player.mp < cost
            is_pend = (i == self.pending_spell)
            color   = tuple(spell.get("color", [150, 150, 200]))

            if is_pend:     bg = (80, 80, 150)
            elif i == self._hover_spell and not on_cd and not no_en: bg = SPELL_HOVER
            else:           bg = SPELL_BG
            pygame.draw.rect(s, bg, rect, border_radius=6)
            border = (160, 160, 255) if is_pend else SPELL_BORDER
            pygame.draw.rect(s, border, rect, 2 if is_pend else 1, border_radius=6)

            # Ícono de color de la habilidad (no es número de tecla — se clickea)
            icon_c = color if not (on_cd or no_en) else tuple(c//2 for c in color)
            icon_cy = rect.y + rect.height // 2
            pygame.draw.circle(s, icon_c, (rect.x + 20, icon_cy), 11)
            pygame.draw.circle(s, tuple(min(255,c+50) for c in icon_c), (rect.x + 20, icon_cy), 11, 2)

            if on_cd:
                pct  = self.spell_timers[i] / max(0.01, spell.get("cooldown", 1.5))
                ov_h = int(rect.height * pct)
                ov   = pygame.Surface((rect.width, ov_h), pygame.SRCALPHA)
                ov.fill((0, 0, 0, 155))
                s.blit(ov, (rect.x, rect.y))
                cd_t = self._font_md.render(f"{self.spell_timers[i]:.1f}s", True, COOLDOWN_FLASH)
                s.blit(cd_t, (rect.centerx - cd_t.get_width()//2,
                               rect.centery - cd_t.get_height()//2))
            else:
                dim  = tuple(max(0, c-80) for c in color) if no_en else color

                # Nombre
                name = self._font_md.render(spell["name"], True, TEXT_DIM if no_en else TEXT_WHITE)
                
                # Cargar el texto de Estado
                dtype = spell.get("damage_type", "")
                needs_aim = dtype not in ("self",)
                is_ground = dtype in ("aoe_targeted", "resurrect")
                if is_pend:
                    if is_ground:
                        st_lbl = "▶ CARGADO — clic en el piso"
                    else:
                        st_lbl = "▶ CARGADO — clic en enemigo"
                    st_col = (120, 255, 140)
                elif self._hover_spell == i and not no_en:
                    st_lbl = "clic para cargar"
                    st_col = (200, 220, 255)
                else:
                    if not needs_aim:
                        st_lbl = "instantáneo"
                    elif is_ground:
                        st_lbl = "clic en piso"
                    else:
                        st_lbl = "clic en enemigo"
                    st_col = TEXT_DIM
                st_s = self._font_sm.render(st_lbl, True, st_col if not no_en else TEXT_DARK)

                # Energy cost + CD
                info = f"{cost} EN  ·  CD {spell.get('cooldown',0):.0f}s"
                info_s = self._font_sm.render(info, True, MP_COLOR if not no_en else DANGER)

                # Renderizar según el tamaño vertical disponible
                if rect.height >= 90:
                    # Distribución completa
                    s.blit(name, (rect.x + 40, rect.y + 6))
                    s.blit(st_s, (rect.x + 40, rect.y + 28))
                    
                    dtype_lbl = dmult_labels.get(dtype, "")
                    if dtype_lbl:
                        dt = self._font_sm.render(dtype_lbl, True, dim)
                        s.blit(dt, (rect.x + 40, rect.y + 46))
                    
                    s.blit(info_s, (rect.x + 40, rect.bottom - info_s.get_height() - 6))
                else:
                    # Distribución compacta para que quepan 7 hechizos de forma premium
                    s.blit(name, (rect.x + 40, rect.y + 3))
                    s.blit(st_s, (rect.x + 40, rect.y + 21))
                    s.blit(info_s, (rect.x + 40, rect.bottom - info_s.get_height() - 4))

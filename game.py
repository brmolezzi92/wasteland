import pygame
import sys
import math
import time
from settings import *
from world.tilemap import TileMap
from entities.player import Player
from entities.enemy import Enemy
from entities.boss import Boss
from entities.effects import ProjectileEffect, ExplosionEffect, AoEIndicator, FloatingText, MeleeSlash, CCIndicator
from ui.sidebar import Sidebar
from ui.settings_panel import SettingsPanel

CURSOR_ARROW     = pygame.SYSTEM_CURSOR_ARROW
CURSOR_CROSSHAIR = pygame.SYSTEM_CURSOR_CROSSHAIR

class RemotePlayerProxy:
    def __init__(self, pid, rp):
        self.id = pid
        self.tile_x = rp["tile_x"]
        self.tile_y = rp["tile_y"]
        self.is_ghost = (rp.get("hp", 100) <= 0)
        self.is_invisible = False
        
        # Atributos de compatibilidad con Enemy/Boss
        self.pixel_x = rp["pixel_x"]
        self.pixel_y = rp["pixel_y"]
        self.alive = (rp.get("hp", 100) > 0)
        self.hp = rp.get("hp", 100)
        self.max_hp = 100

    def take_damage(self, amount):
        from backend.supabase_client import send_player_damage, is_connected
        if is_connected():
            send_player_damage(self.id, amount)

    def apply_cc(self, cc_type, duration):
        from backend.supabase_client import send_player_damage, is_connected
        if is_connected():
            send_player_damage(self.id, 0, cc_type, duration)

class Game:
    def __init__(self, screen, player_class="baluarte", mode="play_practice_dm", player_profile=None, room_id=None):
        self.screen  = screen
        self.running = True
        self._scale    = 0.67
        self._offset_x = 0
        self._offset_y = 0

        # Cargar mapa y personajes según modo (Mundo o Duelo)
        if "play_match_" in mode:
            self.tilemap = TileMap(map_type="duel")
            # Determinar spawn simétrico consistente consultando la sala en Supabase
            spawn_x, spawn_y = 12, 22
            if room_id:
                from backend.supabase_client import get_client
                db = get_client()
                if db:
                    try:
                        # Marcar cola como procesada para no quedar atrapados en el loop de emparejamiento
                        db.table("matchmaking_queue")\
                          .update({"status": "processed"})\
                          .eq("user_id", player_profile["id"])\
                          .eq("room_id", room_id)\
                          .execute()
                    except Exception as e:
                        print(f"[Game init] Error al marcar cola como procesada: {e}")

                    try:
                        res = db.table("rooms").select("players").eq("id", room_id).single().execute()
                        if res.data and res.data.get("players"):
                            players_list = res.data["players"]
                            players_list.sort()
                            if player_profile and player_profile.get("id") in players_list:
                                idx = players_list.index(player_profile["id"])
                                if idx == 0:
                                    spawn_x, spawn_y = 12, 22
                                else:
                                    spawn_x, spawn_y = 48, 22
                    except Exception as e:
                        print(f"[Game init] Error al recuperar spawns de la sala: {e}")
            
            self.player = Player(spawn_x, spawn_y, player_class)
            self.enemies = [
                Enemy(30, 12, "Bandido Tirador", (175, 55,  55), scale=1.3),
                Enemy(30, 32, "Bandido Bruto",   (140, 90,  50), scale=1.7),
                Enemy(35, 22, "Torreta",         (120, 120, 130), scale=1.6),
            ]
            self.boss = Boss(30, 22)
        else:
            self.tilemap  = TileMap()
            self.player   = Player(35, 35, player_class)
            self.enemies = [
                Enemy(38, 33, "Bandido Tirador",  (175, 55,  55), scale=1.3),
                Enemy(40, 36, "Bandido Corredor", (90,  140, 60), scale=1.3),
                Enemy(33, 37, "Dron Lata",        (160, 160, 180), scale=1.1),
            ]
            self.boss = Boss(42, 40)

        self.sidebar  = Sidebar(self.player)
        self.sidebar.set_class(player_class)
        self.sidebar.on_spell_click = self._begin_cast
        self.settings = SettingsPanel()

        self.game_surf = pygame.Surface((GAME_W, GAME_H))
        self._font_hud = None

        self.cam_x = 0
        self.cam_y = 0

        self._pending_spell     = None
        self._pending_idx       = 0
        self._effects: list     = []
        self._aoe_preview_color = (255, 255, 255)
        self._aoe_preview_r     = 80
        self._hud_msg           = ""
        self._hud_msg_timer     = 0.0

        # Daño diferido: [(timer, target, damage, cc_type, cc_dur, color)]
        # Se aplica cuando el proyectil viaja y llega al objetivo
        self._pending_damage: list = []

        # Datos de red / modo
        self.mode = mode
        self.room_id = room_id
        self.player_profile = player_profile or {"id": "mock_user", "username": "Survivor"}
        self.remote_players = {}

        self._last_sent_tile = (self.player.tile_x, self.player.tile_y)
        self._last_sent_hp = self.player.hp
        self._last_sent_energy = self.player.energy
        self._last_net_send_time = 0.0
        self._last_ping_send_time = 0.0

        # Conectar al canal si es mundo abierto o partida online y Supabase está en línea
        from backend.supabase_client import is_connected, join_world_channel
        is_online_game = "open_world" in self.mode or "play_match_" in self.mode
        if is_online_game and is_connected():
            channel_name = "open_world" if "open_world" in self.mode else f"room_{self.room_id}"
            print(f"[Game Net] Conectando al canal '{channel_name}' para usuario {self.player_profile['username']}...")
            join_world_channel(
                self.player_profile["id"],
                self._on_remote_player_sync,
                self._on_remote_npc_sync,
                self._on_remote_npc_damage,
                self._on_remote_player_damage,
                channel_name=channel_name
            )

    # ── coord transform ───────────────────────────────────────────────────────

    def _to_game(self, wx, wy):
        """Convierte coords de ventana → coords lógicas del juego (1920×800)."""
        if self._scale <= 0:
            return wx, wy
        return (int((wx - self._offset_x) / self._scale),
                int((wy - self._offset_y) / self._scale))

    def _game_mouse(self):
        return self._to_game(*pygame.mouse.get_pos())

    # ── cast ──────────────────────────────────────────────────────────────────

    def _targeting_mode(self, spell):
        """
        Clasifica cómo se apunta el hechizo según damage_type:
          instant → centrado en el jugador, sin apuntar
          ground  → clic en cualquier punto del piso, pega a todos en el radio
          enemy   → debe clickear un hostil
        """
        dt = spell.get("damage_type", "single_ranged")
        if dt in ("self", "aoe_self", "melee_area", "aoe_heal", "single_target_heal"):
            return "instant"
        if dt in ("aoe_targeted", "resurrect"):
            return "ground"
        return "enemy"   # single_melee, single_ranged

    def _begin_cast(self, spell_idx):
        spell = self.sidebar.get_spell(spell_idx)
        if spell is None:
            return
        mode = self._targeting_mode(spell)
        if mode == "instant":
            self._execute_instant(spell)
            self.sidebar.confirm_cast(spell_idx)
            return
        # ground / enemy → entrar en modo apuntado (clic con el mouse)
        self._pending_spell        = spell
        self._pending_idx          = spell_idx
        self.sidebar.pending_spell = spell_idx
        self._aoe_preview_color    = tuple(spell.get("color", (200, 200, 200)))
        self._aoe_preview_r        = spell.get("aoe_radius", 80)
        pygame.mouse.set_cursor(CURSOR_CROSSHAIR)

    def _cancel_cast(self):
        self._pending_spell        = None
        self.sidebar.pending_spell = None
        pygame.mouse.set_cursor(CURSOR_ARROW)

    def _resolve_world_click(self, gx, gy):
        """gx, gy en coords lógicas del juego."""
        if self._pending_spell is None:
            return
        spell  = self._pending_spell
        mode   = self._targeting_mode(spell)
        wx     = gx + self.cam_x
        wy     = gy + self.cam_y
        tx, ty = int(wx // TILE_SIZE), int(wy // TILE_SIZE)

        if mode == "ground":
            # Clic en el piso — el área pega a todos los hostiles en el radio
            self._execute_ground(spell, wx, wy)
            self.sidebar.confirm_cast(self._pending_idx)
            self._cancel_cast()
        else:  # enemy
            # Hitbox = SOLO el tile de los pies (no el arte). Así un sprite alto no
            # tapa el targeting de quien esté detrás. Clickeás el suelo, no el dibujo.
            enemy = self._enemy_at_tile(tx, ty)
            if enemy:
                self._execute_enemy(spell, enemy)
                self.sidebar.confirm_cast(self._pending_idx)
                self._cancel_cast()
            else:
                self._effects.append(FloatingText(wx, wy, "¡Sin impacto!",
                                                  color=(255, 100, 100), size=16, duration=1.2))
                self._cancel_cast()

    # ── damage helpers ─────────────────────────────────────────────────────────

    def _calc_damage(self, spell) -> int:
        base  = self.player.base_damage
        dmult = DAMAGE_MULT.get(spell.get("damage_type", "single_ranged"), 1.0)
        if self.player.is_invisible and self.player.first_hit_bonus > 0:
            dmult *= (1 + self.player.first_hit_bonus)
            self.player.is_invisible    = False
            self.player.first_hit_bonus = 0.0
        return max(1, int(base * dmult))

    def _apply_cc(self, spell, target, is_aoe=False):
        cc_type = spell.get("cc")
        if not cc_type or not hasattr(target, "apply_cc"):
            return
        duration = spell.get("cc_duration", 1.5)
        if is_aoe:
            duration *= CC_AOE_DURATION_MULT
        self._damage_npc(target, 0, cc_type, duration)

    def _show_damage(self, wx, wy, dmg, col=(255, 80, 80)):
        self._effects.append(FloatingText(wx, wy - TILE_SIZE, f"-{dmg}",
                                          color=col, size=20, duration=1.1))

    def _all_hostiles(self):
        out = [e for e in self.enemies if e.alive]
        if self.boss.alive:
            out.append(self.boss)
        if "play_match_" in self.mode:
            for pid, rp in self.remote_players.items():
                if rp.get("hp", 100) > 0:
                    out.append(RemotePlayerProxy(pid, rp))
        return out

    def _damage_in_radius(self, wx, wy, radius, damage, spell):
        """Pega a TODOS los hostiles cuyo centro cae dentro del radio (px)."""
        hit = 0
        for e in self._all_hostiles():
            ex = e.pixel_x + TILE_SIZE // 2
            ey = e.pixel_y + TILE_SIZE // 2
            if math.hypot(ex - wx, ey - wy) <= radius:
                cc_type = spell.get("cc")
                cc_dur = spell.get("cc_duration", 1.5) if cc_type else 0.0
                if cc_type:
                    cc_dur *= CC_AOE_DURATION_MULT
                self._damage_npc(e, damage, cc_type, cc_dur)
                hit += 1
        return hit

    # ── execute por modo ───────────────────────────────────────────────────────

    def _apply_caster_defensives(self, spell):
        pcx = self.player.pixel_x + TILE_SIZE // 2
        pcy = self.player.pixel_y + TILE_SIZE // 2
        # Cleanse
        if spell.get("cleanse", False):
            self.player.clear_cc()
            self._effects.append(FloatingText(pcx, pcy - TILE_SIZE, "¡LIMPIO!",
                                              color=(100, 220, 255), size=18, duration=1.0))
        # Invisibilidad (Camuflaje / Protocolo Camuflaje)
        invis = spell.get("invisible_duration", 0)
        if invis:
            self.player.is_invisible     = True
            self.player.invisible_timer  = max(self.player.invisible_timer, invis)
            self.player.first_hit_bonus  = max(self.player.first_hit_bonus, spell.get("first_hit_bonus", 0.0))

    def _check_resurrection_trigger(self, spell, ix, iy, radius):
        if not spell.get("can_resurrect", False):
            return
        if self.player.is_ghost:
            pxc = self.player.pixel_x + TILE_SIZE // 2
            pyc = self.player.pixel_y + TILE_SIZE // 2
            if math.hypot(pxc - ix, pyc - iy) <= radius:
                self.player.revive()
                color = tuple(spell.get("color", (220, 220, 80)))
                self._effects.append(ExplosionEffect(pxc, pyc, color, 60, 0.5))
                self._effects.append(FloatingText(pxc, pyc - TILE_SIZE*2, "REMATERIALIZADO",
                                                  color=(220, 220, 80), size=18, duration=2.0))

    def _execute_instant(self, spell):
        """Hechizos centrados en el jugador (sin apuntar)."""
        dtype  = spell.get("damage_type", "self")
        color  = tuple(spell.get("color", (200, 200, 200)))
        aoe_r  = spell.get("aoe_radius", 64)
        pcx    = self.player.pixel_x + TILE_SIZE // 2
        pcy    = self.player.pixel_y + TILE_SIZE // 2

        self._apply_caster_defensives(spell)
        self._check_resurrection_trigger(spell, pcx, pcy, aoe_r)

        # Buffs propios
        if dtype == "self":
            shield = spell.get("shield", 0)
            if shield:
                self.player.shield       = max(self.player.shield, shield)
                self.player.shield_timer = max(self.player.shield_timer, spell.get("shield_duration", 5.0))
            self._effects.append(AoEIndicator(pcx, pcy, color, max(aoe_r, 40), 0.5))
            return

        # Curaciones (en solo, cura al propio jugador)
        if dtype in ("single_target_heal", "aoe_heal"):
            heal = spell.get("heal_base", 0)
            if dtype == "aoe_heal":
                heal = int(heal * spell.get("heal_multiplier", 0.55))
            self.player.hp = min(self.player.max_hp, self.player.hp + heal)
            self._effects.append(AoEIndicator(pcx, pcy, color, max(aoe_r, 40), 0.5))
            self._effects.append(FloatingText(pcx, pcy - TILE_SIZE, f"+{heal}",
                                              color=(120, 255, 140), size=20, duration=1.1))
            return

        # aoe_self / melee_area → daño en área alrededor del jugador
        damage = self._calc_damage(spell)
        self._effects.append(AoEIndicator(pcx, pcy, color, aoe_r, 0.55))
        self._effects.append(ExplosionEffect(pcx, pcy, color, aoe_r // 2, 0.4))
        self._damage_in_radius(pcx, pcy, aoe_r, damage, spell)

    def _execute_ground(self, spell, wx, wy):
        """AoE clickeado en el piso — pega a todos los hostiles en el radio."""
        dtype = spell.get("damage_type", "aoe_targeted")
        color = tuple(spell.get("color", (200, 200, 200)))
        aoe_r = spell.get("aoe_radius", 96)

        self._apply_caster_defensives(spell)
        self._check_resurrection_trigger(spell, wx, wy, aoe_r)

        # Resurrección y Curación en área
        if dtype == "resurrect":
            pxc = self.player.pixel_x + TILE_SIZE // 2
            pyc = self.player.pixel_y + TILE_SIZE // 2
            if not self.player.is_ghost and math.hypot(pxc - wx, pyc - wy) <= aoe_r:
                heal = spell.get("heal_base", 60)
                self.player.hp = min(self.player.max_hp, self.player.hp + heal)
                self._effects.append(ExplosionEffect(pxc, pyc, color, 40, 0.4))
                self._effects.append(FloatingText(pxc, pyc - TILE_SIZE, f"+{heal}",
                                                  color=(120, 255, 140), size=20, duration=1.1))
            return

        damage = self._calc_damage(spell)
        self._effects.append(AoEIndicator(wx, wy, color, aoe_r, 0.6))
        self._effects.append(ExplosionEffect(wx, wy, color, aoe_r // 2, 0.42))
        self._damage_in_radius(wx, wy, aoe_r, damage, spell)

    def _execute_enemy(self, spell, enemy):
        """Single target sobre el hostil clickeado."""
        etype  = spell.get("effect", "explosion")
        color  = tuple(spell.get("color", (200, 200, 200)))
        damage = self._calc_damage(spell)
        tx     = enemy.pixel_x + TILE_SIZE // 2
        ty     = enemy.pixel_y + TILE_SIZE // 2
        pcx    = self.player.pixel_x + TILE_SIZE // 2
        pcy    = self.player.pixel_y + TILE_SIZE // 2

        self._apply_caster_defensives(spell)
        self._check_resurrection_trigger(spell, tx, ty, spell.get("aoe_radius", 64))

        if etype == "projectile":
            # Proyectil viaja → daño diferido al llegar (se puede esquivar)
            self._effects.append(ProjectileEffect(pcx, pcy, tx, ty, color, 550))
            travel  = math.hypot(tx - pcx, ty - pcy) / 550
            cc_type = spell.get("cc")
            cc_dur  = spell.get("cc_duration", 0.0)
            self._pending_damage.append(
                (travel, enemy, damage, cc_type, cc_dur, color, tx, ty))
        else:
            self._effects.append(ExplosionEffect(tx, ty, color, 44, 0.35))
            cc_type = spell.get("cc")
            cc_dur = spell.get("cc_duration", 1.5) if cc_type else 0.0
            self._damage_npc(enemy, damage, cc_type, cc_dur)

    # ── helpers ───────────────────────────────────────────────────────────────

    def _draw_remote_player(self, p, cx, cy):
        rx = int(p["pixel_x"] - cx)
        ry = int(p["pixel_y"] - cy)
        ts = TILE_SIZE
        rcx, rcy = rx + ts // 2, ry + ts // 2
        r = ts // 2 - 2
        pygame.draw.ellipse(self.game_surf, (20, 20, 20), (rcx - r, rcy + r - 3, r * 2, 6))
        pygame.draw.circle(self.game_surf, (50, 150, 255), (rcx, rcy), r)
        pygame.draw.circle(self.game_surf, (100, 200, 255), (rcx, rcy), r, 2)
        pygame.draw.circle(self.game_surf, (100, 200, 255), (rcx, rcy - r + 5), 3)
        hp_pct = max(0.0, min(1.0, p["hp"] / 100.0))
        bar_w, bar_h = 40, 5
        bx, by = rx + ts // 2 - bar_w // 2, ry - 10
        pygame.draw.rect(self.game_surf, (80, 20, 20), (bx, by, bar_w, bar_h))
        pygame.draw.rect(self.game_surf, (50, 200, 80), (bx, by, int(bar_w * hp_pct), bar_h))
        pygame.draw.rect(self.game_surf, (200, 200, 200), (bx, by, bar_w, bar_h), 1)
        font_name = pygame.font.SysFont("Arial", 14, bold=True)
        name_t = font_name.render(p["username"], True, (220, 240, 255))
        self.game_surf.blit(name_t, (rx + ts // 2 - name_t.get_width() // 2, ry - 28))

    def _enemy_at_tile(self, tx, ty):
        for e in self.enemies:
            if e.alive and e.tile_x == tx and e.tile_y == ty:
                return e
        if self.boss.alive and self.boss.tile_x == tx and self.boss.tile_y == ty:
            return self.boss
        if "play_match_" in self.mode:
            for pid, rp in self.remote_players.items():
                if rp.get("hp", 100) > 0 and rp.get("tile_x") == tx and rp.get("tile_y") == ty:
                    return RemotePlayerProxy(pid, rp)
        return None

    def _set_hud(self, text, duration):
        self._hud_msg       = text
        self._hud_msg_timer = duration

    # ── loop ──────────────────────────────────────────────────────────────────

    def run_frame(self, dt, render_surf, to_game_fn):
        """
        Ejecuta un frame del juego.
        render_surf: superficie 1920×1080 donde se dibuja todo.
        to_game_fn:  función que convierte coords de ventana → coords lógicas.
        Retorna "back_to_menu" si ESC fue presionado sin spell pendiente.
        """
        self._render_surf = render_surf
        self._to_game_fn  = to_game_fn
        self._fps = (1.0 / dt) if dt > 0 else 0.0
        self._events()
        self._update(dt)
        self._draw()
        if not self.running:
            try:
                from backend.supabase_client import leave_world_channel
                leave_world_channel()
            except Exception as e:
                print(f"[Game Net] Error al desconectar: {e}")
            self.running = True   # reset para si vuelve
            return "back_to_menu"
        return None

    def __del__(self):
        try:
            from backend.supabase_client import leave_world_channel
            leave_world_channel()
        except:
            pass

    def _on_remote_player_sync(self, pid, x, y, hp, energy):
        now = time.time()
        if pid in self.remote_players:
            p = self.remote_players[pid]
            p["target_pixel_x"] = x * TILE_SIZE
            p["target_pixel_y"] = y * TILE_SIZE
            p["hp"] = hp
            p["energy"] = energy
            p["last_update"] = now
            p["tile_x"] = x
            p["tile_y"] = y
        else:
            self.remote_players[pid] = {
                "tile_x": x,
                "tile_y": y,
                "pixel_x": x * TILE_SIZE,
                "pixel_y": y * TILE_SIZE,
                "target_pixel_x": x * TILE_SIZE,
                "target_pixel_y": y * TILE_SIZE,
                "hp": hp,
                "energy": energy,
                "last_update": now,
                "username": f"Jugador_{pid[:5]}"
            }
            import threading
            threading.Thread(target=self._fetch_remote_username, args=(pid,), daemon=True).start()

    def _fetch_remote_username(self, pid):
        try:
            from backend.supabase_client import get_client
            db = get_client()
            if db:
                res = db.table("users").select("username").eq("id", pid).single().execute()
                if res.data and res.data.get("username"):
                    if pid in self.remote_players:
                        self.remote_players[pid]["username"] = res.data["username"]
        except Exception as e:
            print(f"[Game Net] No se pudo obtener username para {pid}: {e}")

    def _is_npc_authority(self):
        if "open_world" not in self.mode and "play_match_" not in self.mode:
            return True
        all_players = [self.player_profile["id"]] + list(self.remote_players.keys())
        all_players.sort()
        return self.player_profile["id"] == all_players[0]

    def _find_closest_player(self, npc):
        candidates = []
        if not self.player.is_ghost:
            candidates.append(self.player)
        for pid, rp in self.remote_players.items():
            if rp.get("hp", 100) > 0:
                candidates.append(RemotePlayerProxy(pid, rp))
        if not candidates:
            return self.player
        best = self.player
        min_d = float('inf')
        for c in candidates:
            d = math.hypot(npc.tile_x - c.tile_x, npc.tile_y - c.tile_y)
            if d < min_d:
                min_d = d
                best = c
        return best

    def _on_remote_npc_sync(self, npcs):
        if self._is_npc_authority():
            return
        for npc in npcs:
            idx = npc["idx"]
            ntype = npc["type"]
            if ntype == "enemy":
                if idx < len(self.enemies):
                    e = self.enemies[idx]
                    e.tile_x = npc["tile_x"]
                    e.tile_y = npc["tile_y"]
                    e._tgt_x = float(npc["x"])
                    e._tgt_y = float(npc["y"])
                    e.hp = npc["hp"]
                    e.alive = npc["alive"]
                    e.cc_type = npc["cc_type"]
                    e.cc_timer = npc["cc_timer"]
            elif ntype == "boss":
                b = self.boss
                b.tile_x = npc["tile_x"]
                b.tile_y = npc["tile_y"]
                b._tgt_x = float(npc["x"])
                b._tgt_y = float(npc["y"])
                b.hp = npc["hp"]
                b.alive = npc["alive"]
                b.cc_type = npc["cc_type"]
                b.cc_timer = npc["cc_timer"]

    def _on_remote_npc_damage(self, npc_type, idx, dmg, cc, cc_dur):
        if not self._is_npc_authority():
            return
        target = None
        if npc_type == "enemy":
            if idx < len(self.enemies):
                target = self.enemies[idx]
        elif npc_type == "boss":
            target = self.boss
        if target and target.alive:
            if dmg > 0:
                target.take_damage(dmg)
                self._show_damage(target.pixel_x + TILE_SIZE // 2, target.pixel_y + TILE_SIZE // 2, dmg)
            if cc and hasattr(target, "apply_cc"):
                target.apply_cc(cc, cc_dur)
                cx = target.pixel_x + TILE_SIZE // 2
                cy = target.pixel_y + TILE_SIZE // 2
                self._effects.append(CCIndicator(cx, cy, cc, min(cc_dur, 2.5)))

    def _on_remote_player_damage(self, dmg, cc_type=None, cc_dur=0.0):
        damage_taken = self.player.take_damage(dmg)
        if damage_taken > 0:
            cx = self.player.pixel_x + TILE_SIZE // 2
            cy = self.player.pixel_y + TILE_SIZE // 2
            self._effects.append(
                FloatingText(cx, cy - TILE_SIZE, f"-{damage_taken}",
                             color=(255, 60, 60), size=20, duration=1.0)
            )
        if cc_type and cc_dur > 0:
            self.player.apply_cc(cc_type, cc_dur)

    def _damage_npc(self, target, damage, cc_type=None, cc_dur=0.0):
        if isinstance(target, RemotePlayerProxy):
            if damage > 0:
                target.take_damage(damage)
                self._show_damage(target.pixel_x + TILE_SIZE // 2, target.pixel_y + TILE_SIZE // 2, damage)
            if cc_type:
                target.apply_cc(cc_type, cc_dur)
            return

        npc_type = "boss" if target == self.boss else "enemy"
        npc_idx = 0
        if npc_type == "enemy":
            try:
                npc_idx = self.enemies.index(target)
            except ValueError:
                return

        # Aplicar daño/CC local inmediato para respuesta visual rápida
        if damage > 0:
            target.take_damage(damage)
            self._show_damage(target.pixel_x + TILE_SIZE // 2, target.pixel_y + TILE_SIZE // 2, damage)
        if cc_type and hasattr(target, "apply_cc"):
            target.apply_cc(cc_type, cc_dur)
            cx = target.pixel_x + TILE_SIZE // 2
            cy = target.pixel_y + TILE_SIZE // 2
            self._effects.append(CCIndicator(cx, cy, cc_type, min(cc_dur, 2.5)))

        # Reportar a la autoridad si no somos nosotros
        if not self._is_npc_authority():
            from backend.supabase_client import send_npc_damage, is_connected
            is_online = "open_world" in self.mode or "play_match_" in self.mode
            if is_online and is_connected():
                send_npc_damage(self.player_profile["id"], npc_type, npc_idx, damage, cc_type, cc_dur)

    # ── events ────────────────────────────────────────────────────────────────

    def _events(self):
        raw_mx, raw_my = pygame.mouse.get_pos()
        fn             = getattr(self, "_to_game_fn", self._to_game)
        gmx, gmy       = fn(raw_mx, raw_my)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit(); sys.exit()

            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    if self._pending_spell:
                        self._cancel_cast()
                    else:
                        self.running = False   # señal a run_frame → back_to_menu
                        return
                # U = usar poción seleccionada (combo "inventariar")
                if event.key == pygame.K_u: self.sidebar.use_selected_item()
                # NOTA: los hechizos NO se activan con teclado — solo con el mouse.
                # El skill está en el viaje del cursor: clic en habilidad → clic en hostil.

            if event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 1:
                    if self.settings.handle_click(gmx, gmy):
                        continue
                    if gmx < GAME_W:
                        self._resolve_world_click(gmx, gmy)
                    else:
                        result = self.sidebar.handle_click((gmx - GAME_W, gmy))
                        if result == "open_settings":
                            self.settings.toggle()

                if event.button == 3:
                    if self._pending_spell:
                        self._cancel_cast()

    # ── update ────────────────────────────────────────────────────────────────

    def _update(self, dt):
        # ── Sincronización de Red ──
        is_online = "open_world" in self.mode or "play_match_" in self.mode
        if is_online:
            now = time.time()
            if not hasattr(self, "_last_ping_send_time"):
                self._last_ping_send_time = 0.0
            if now - self._last_ping_send_time > 2.0:
                self._last_ping_send_time = now
                from backend.supabase_client import send_ping, is_connected
                if is_connected():
                    send_ping(self.player_profile["id"], now)

            current_tile = (self.player.tile_x, self.player.tile_y)
            if (current_tile != self._last_sent_tile or
                self.player.hp != self._last_sent_hp or
                self.player.energy != self._last_sent_energy or
                now - self._last_net_send_time > 0.4):
                
                self._last_sent_tile = current_tile
                self._last_sent_hp = self.player.hp
                self._last_sent_energy = self.player.energy
                self._last_net_send_time = now
                
                from backend.supabase_client import send_world_position, is_connected
                if is_connected():
                    send_world_position(
                        self.player_profile["id"],
                        self.player.tile_x,
                        self.player.tile_y,
                        self.player.hp,
                        self.player.energy
                    )

            # Interpolación y actualización de jugadores remotos
            active_remotes = {}
            for pid, p in list(self.remote_players.items()):
                # Expiración a los 12 segundos sin reportar
                if now - p["last_update"] > 12.0:
                    continue
                
                dx = p["target_pixel_x"] - p["pixel_x"]
                dy = p["target_pixel_y"] - p["pixel_y"]
                dist = math.hypot(dx, dy)
                
                if dist > TILE_SIZE * 4:
                    p["pixel_x"] = p["target_pixel_x"]
                    p["pixel_y"] = p["target_pixel_y"]
                else:
                    p["pixel_x"] += dx * dt * 9.0
                    p["pixel_y"] += dy * dt * 9.0
                    
                active_remotes[pid] = p
            self.remote_players = active_remotes

        all_entities = self.enemies + ([self.boss] if self.boss.alive else [])
        self.player.update(dt, pygame.key.get_pressed(), self.tilemap, all_entities)
        self.sidebar.update(dt)

        if self._is_npc_authority():
            # Update boss IA
            if self.boss.alive:
                target_player = self._find_closest_player(self.boss)
                dmg_list = self.boss.update(dt, target_player, self.tilemap,
                                            all_entities, self._effects)
                if target_player == self.player:
                    for dmg in dmg_list:
                        damage_taken = self.player.take_damage(dmg)
                        if damage_taken > 0:
                            cx = self.player.pixel_x + TILE_SIZE // 2
                            cy = self.player.pixel_y + TILE_SIZE // 2
                            self._effects.append(
                                FloatingText(cx, cy - TILE_SIZE, f"-{damage_taken}",
                                             color=(255, 60, 60), size=20, duration=1.0)
                            )

            # Update enemigos comunes IA
            for e in self.enemies:
                if e.alive:
                    target_player = self._find_closest_player(e)
                    dmg_list = e.update(dt, target_player, self.tilemap, all_entities)
                    if target_player == self.player:
                        for dmg in dmg_list:
                            damage_taken = self.player.take_damage(dmg)
                            if damage_taken > 0:
                                cx = self.player.pixel_x + TILE_SIZE // 2
                                cy = self.player.pixel_y + TILE_SIZE // 2
                                self._effects.append(
                                    FloatingText(cx, cy - TILE_SIZE, f"-{damage_taken}",
                                                 color=(255, 60, 60), size=20, duration=1.0)
                                )
            
            # Broadcast de NPCs desde la autoridad
            if is_online:
                now = time.time()
                if not hasattr(self, "_last_npc_sync_time"):
                    self._last_npc_sync_time = 0.0
                if now - self._last_npc_sync_time > 0.25:
                    self._last_npc_sync_time = now
                    npc_data = []
                    for idx, e in enumerate(self.enemies):
                        npc_data.append({
                            "idx": idx,
                            "type": "enemy",
                            "tile_x": e.tile_x,
                            "tile_y": e.tile_y,
                            "x": e.pixel_x,
                            "y": e.pixel_y,
                            "hp": e.hp,
                            "alive": e.alive,
                            "cc_type": e.cc_type,
                            "cc_timer": e.cc_timer
                        })
                    npc_data.append({
                        "idx": 0,
                        "type": "boss",
                        "tile_x": self.boss.tile_x,
                        "tile_y": self.boss.tile_y,
                        "x": self.boss.pixel_x,
                        "y": self.boss.pixel_y,
                        "hp": self.boss.hp,
                        "alive": self.boss.alive,
                        "cc_type": self.boss.cc_type,
                        "cc_timer": self.boss.cc_timer
                    })
                    from backend.supabase_client import send_npc_sync, is_connected
                    if is_connected():
                        send_npc_sync(self.player_profile["id"], npc_data)
        else:
            # Interpolación visual de NPCs en clientes no autorizados
            if self.boss.alive:
                if not hasattr(self.boss, "_tgt_x"):
                    self.boss._tgt_x = self.boss._vis_x
                    self.boss._tgt_y = self.boss._vis_y
                dx = self.boss._tgt_x - self.boss._vis_x
                dy = self.boss._tgt_y - self.boss._vis_y
                dist = math.hypot(dx, dy)
                if dist > TILE_SIZE * 4:
                    self.boss._vis_x = self.boss._tgt_x
                    self.boss._vis_y = self.boss._tgt_y
                else:
                    self.boss._vis_x += dx * dt * 9.0
                    self.boss._vis_y += dy * dt * 9.0
                if self.boss.cc_timer > 0:
                    self.boss.cc_timer -= dt
                    if self.boss.cc_timer <= 0:
                        self.boss.clear_cc()
                        
            for e in self.enemies:
                if e.alive:
                    if not hasattr(e, "_tgt_x"):
                        e._tgt_x = e._vis_x
                        e._tgt_y = e._vis_y
                    dx = e._tgt_x - e._vis_x
                    dy = e._tgt_y - e._vis_y
                    dist = math.hypot(dx, dy)
                    if dist > TILE_SIZE * 4:
                        e._vis_x = e._tgt_x
                        e._vis_y = e._tgt_y
                    else:
                        e._vis_x += dx * dt * 9.0
                        e._vis_y += dy * dt * 9.0
                    if e.cc_timer > 0:
                        e.cc_timer -= dt
                        if e.cc_timer <= 0:
                            e.clear_cc()
        for fx in self._effects:
            fx.update(dt)
        self._effects = [fx for fx in self._effects if not fx.done]

        # Proyectiles en vuelo → aplicar daño al llegar
        still_flying = []
        for entry in self._pending_damage:
            timer, target, dmg, cc_type, cc_dur, col, wx, wy = entry
            timer -= dt
            if timer <= 0:
                # El proyectil llegó — aplicar daño SI el target está dentro del radio (esquivable)
                if hasattr(target, "alive") and target.alive:
                    tcx = target.pixel_x + TILE_SIZE // 2
                    tcy = target.pixel_y + TILE_SIZE // 2
                    # Si el objetivo está dentro de 1.2 tiles del punto de impacto, recibe el golpe
                    if math.hypot(tcx - wx, tcy - wy) <= TILE_SIZE * 1.2:
                        self._damage_npc(target, dmg, cc_type, cc_dur)
                        self._effects.append(ExplosionEffect(tcx, tcy, col, 36, 0.32))
                    else:
                        # ¡Esquivado!
                        self._effects.append(FloatingText(wx, wy, "¡Esquivado!",
                                                          color=(150, 150, 255), size=18, duration=1.2))
                        self._effects.append(ExplosionEffect(wx, wy, (100, 100, 100), 24, 0.25))
            else:
                still_flying.append((timer, target, dmg, cc_type, cc_dur, col, wx, wy))
        self._pending_damage = still_flying
        if self._hud_msg_timer > 0:
            self._hud_msg_timer -= dt
            if self._hud_msg_timer <= 0:
                self._hud_msg = ""

    # ── draw ──────────────────────────────────────────────────────────────────

    def _draw(self):
        # Cámara
        self.cam_x = max(0, min(self.player.pixel_x - GAME_W // 2 + TILE_SIZE // 2,
                                self.tilemap.width  * TILE_SIZE - GAME_W))
        self.cam_y = max(0, min(self.player.pixel_y - GAME_H // 2 + TILE_SIZE // 2,
                                self.tilemap.height * TILE_SIZE - GAME_H))
        cx, cy = self.cam_x, self.cam_y

        # Mundo
        self.game_surf.fill((10, 10, 15))
        self.tilemap.draw(self.game_surf, cx, cy, GAME_W, GAME_H)
        # ── Y-SORT: dibujar entidades por profundidad ────────────────────────
        # El que tiene los pies más abajo en pantalla se dibuja ENCIMA.
        drawables = []
        for e in self.enemies:
            if e.alive:
                drawables.append((e.pixel_y + TILE_SIZE,
                    lambda e=e: e.draw(self.game_surf, e.pixel_x - cx, e.pixel_y - cy)))
        if self.boss.alive:
            drawables.append((self.boss.pixel_y + TILE_SIZE,
                lambda: self.boss.draw(self.game_surf,
                                       self.boss.pixel_x - cx, self.boss.pixel_y - cy)))
        drawables.append((self.player.pixel_y + TILE_SIZE,
            lambda: self.player.draw(self.game_surf,
                                     self.player.pixel_x - cx, self.player.pixel_y - cy)))
        for pid, p in self.remote_players.items():
            drawables.append((p["pixel_y"] + TILE_SIZE,
                lambda p=p: self._draw_remote_player(p, cx, cy)))

        drawables.sort(key=lambda d: d[0])
        for _, fn in drawables:
            fn()

        for fx in self._effects:
            fx.draw(self.game_surf, cx, cy)
        if self._pending_spell:
            self._draw_aoe_preview()
            self._draw_targeting_hud()
        if self._hud_msg:
            self._draw_hud_msg()

        if self._font_hud is None:
            self._font_hud = pygame.font.SysFont('Arial', 17)
        coord = self._font_hud.render(f"({self.player.tile_x}, {self.player.tile_y})",
                                      True, (160, 160, 160))
        self.game_surf.blit(coord, (6, 6))

        # Indicador de conexión y jugadores online en el Mundo Abierto / Partida Online
        is_online = "open_world" in self.mode or "play_match_" in self.mode
        if is_online:
            from backend.supabase_client import is_connected, get_net_rates
            status_txt = "CONECTADO" if is_connected() else "LOCAL"
            status_col = (80, 220, 100) if is_connected() else (200, 180, 80)
            
            lbl_mode = "MUNDO ONLINE" if "open_world" in self.mode else "PARTIDA ONLINE"
            online_t = self._font_hud.render(
                f"{lbl_mode} [{status_txt}]  ·  JUGADORES: {len(self.remote_players) + 1}",
                True, status_col
            )
            # Dibujar fondo semitransparente
            bg_w = online_t.get_width() + 12
            bg_h = online_t.get_height() + 6
            hud_bg = pygame.Surface((bg_w, bg_h), pygame.SRCALPHA)
            hud_bg.fill((0, 0, 0, 140))
            self.game_surf.blit(hud_bg, (4, 26))
            self.game_surf.blit(online_t, (10, 29))

            # Telemetría de Red (NET HUD)
            ping_val, up_val, down_val = get_net_rates()
            net_text = f"FPS: {int(getattr(self, '_fps', 0))}  ·  PING: {int(ping_val)}ms  ·  UP: {up_val:.2f} KB/s  ·  DOWN: {down_val:.2f} KB/s"
            net_t = self._font_hud.render(net_text, True, (200, 200, 210))
            
            net_bg_w = net_t.get_width() + 12
            net_bg_h = net_t.get_height() + 6
            net_hud_bg = pygame.Surface((net_bg_w, net_bg_h), pygame.SRCALPHA)
            net_hud_bg.fill((0, 0, 0, 140))
            self.game_surf.blit(net_hud_bg, (4, 56))
            self.game_surf.blit(net_t, (10, 59))

        # Ghost HUD
        if self.player.is_ghost:
            self._draw_ghost_hud()

        # CC HUD
        if self.player.cc_type:
            self._draw_cc_hud()

        # Boss bar (parte superior central del game area)
        if self.boss.alive:
            self._draw_boss_bar()

        # Componer render interno
        self._render_surf.blit(self.game_surf, (0, 0))
        self.sidebar.draw(self._render_surf, GAME_W, 0)

        if self.settings.show_fps:
            fps_t = self._font_hud.render(f"FPS: {int(getattr(self, '_fps', 0))}",
                                          True, (180, 220, 180))
            self._render_surf.blit(fps_t, (6, SCREEN_H - 18))

        self.settings.draw(self._render_surf)

        # Escalar render_surf → ventana real (con letterbox negro si el ratio difiere)
        # El escalado y flip lo hace main.py — aquí solo se dibuja en _render_surf

    # ── draw helpers ──────────────────────────────────────────────────────────

    def _draw_ghost_hud(self):
        t = self.player.ghost_timer
        font = pygame.font.SysFont("Arial", 19, bold=True)
        msg  = f"PROYECCIÓN CUÁNTICA  —  Respawn en {t:.0f}s"
        surf = font.render(msg, True, (180, 220, 255))
        bx   = GAME_W // 2 - surf.get_width() // 2
        by   = GAME_H - 55
        bg   = pygame.Surface((surf.get_width()+16, surf.get_height()+10), pygame.SRCALPHA)
        bg.fill((0, 30, 60, 180))
        self.game_surf.blit(bg, (bx-8, by-5))
        self.game_surf.blit(surf, (bx, by))

    def _draw_cc_hud(self):
        cc_colors = {"stun": (255,230,50), "root": (80,200,255), "slow": (160,100,255)}
        cc_names  = {"stun": "ATURDIDO", "root": "INMOVILIZADO", "slow": "LENTO"}
        col  = cc_colors.get(self.player.cc_type, (200,200,200))
        name = cc_names.get(self.player.cc_type, self.player.cc_type.upper())
        font = pygame.font.SysFont("Arial", 17, bold=True)
        msg  = f"{name}  {self.player.cc_timer:.1f}s"
        surf = font.render(msg, True, col)
        bx   = GAME_W // 2 - surf.get_width() // 2
        bg   = pygame.Surface((surf.get_width()+12, surf.get_height()+8), pygame.SRCALPHA)
        bg.fill((0, 0, 0, 160))
        self.game_surf.blit(bg, (bx-6, GAME_H - 90))
        self.game_surf.blit(surf, (bx, GAME_H - 87))

    def _draw_boss_bar(self):
        b      = self.boss
        hp_pct = b.hp / b.max_hp
        bw, bh = 500, 22
        bx     = GAME_W // 2 - bw // 2
        by     = 14
        phase2 = b._phase == 2

        # Fondo
        bg = pygame.Surface((bw + 16, bh + 28), pygame.SRCALPHA)
        bg.fill((0, 0, 0, 160))
        self.game_surf.blit(bg, (bx - 8, by - 20))

        # Nombre
        font   = pygame.font.SysFont('Arial', 17, bold=True)
        col    = (255, 120, 160) if phase2 else (210, 110, 255)
        label  = font.render(
            f"{'⚡ ' if phase2 else ''}{b.name}{'  [ FASE 2 ]' if phase2 else ''}",
            True, col)
        self.game_surf.blit(label, (GAME_W // 2 - label.get_width() // 2, by - 18))

        # Barra
        pygame.draw.rect(self.game_surf, (50, 0, 50), (bx, by, bw, bh), border_radius=4)
        fill = max(0, int(bw * hp_pct))
        bar_col = (220, 40, 80) if hp_pct < 0.3 else ((180, 50, 210) if not phase2 else (255, 60, 100))
        if fill:
            pygame.draw.rect(self.game_surf, bar_col, (bx, by, fill, bh), border_radius=4)
        pygame.draw.rect(self.game_surf, col, (bx, by, bw, bh), 2, border_radius=4)

        # HP texto
        hp_txt = self._font_hud.render(f"{b.hp} / {b.max_hp}", True, (220, 220, 230))
        self.game_surf.blit(hp_txt, (GAME_W // 2 - hp_txt.get_width() // 2, by + 3))

    def _draw_aoe_circle(self, sx, sy, r, col):
        if r <= 0:
            return
        buf = pygame.Surface((r * 2 + 4, r * 2 + 4), pygame.SRCALPHA)
        c = r + 2
        pygame.draw.circle(buf, (*col, 30),  (c, c), r)
        pygame.draw.circle(buf, (*col, 170), (c, c), r, 2)
        if r > 6:
            pygame.draw.circle(buf, (*col, 70), (c, c), r - 5, 1)
        self.game_surf.blit(buf, (sx - r - 2, sy - r - 2))

    def _draw_aoe_preview(self):
        spell    = self._pending_spell
        mode     = self._targeting_mode(spell)
        aoe_r    = spell.get("aoe_radius", 0)
        col      = self._aoe_preview_color
        gmx, gmy = self._game_mouse()

        if mode == "ground" and aoe_r > 0 and gmx < GAME_W:
            # El círculo sigue al mouse en el piso (es donde caerá el área)
            self._draw_aoe_circle(gmx, gmy, aoe_r, col)

    def _draw_targeting_hud(self):
        spell    = self._pending_spell
        dtype    = spell.get("damage_type", "")
        if dtype in ("aoe_targeted", "aoe_self", "melee_area"):
            hint = "APUNTÁ al área con el mouse y hacé clic"
        elif dtype == "self":
            hint = "Instantáneo — sin objetivo"
        else:
            hint = "APUNTÁ al enemigo con el mouse y hacé clic"
        font_big = pygame.font.SysFont('Arial', 20, bold=True)
        text     = f"[{spell.get('name','')}]  —  {hint}    (clic derecho cancela)"
        surf     = font_big.render(text, True, (255, 255, 160))
        bx       = GAME_W // 2 - surf.get_width() // 2
        pad      = 6
        bg       = pygame.Surface((surf.get_width() + pad*2, surf.get_height() + pad*2), pygame.SRCALPHA)
        bg.fill((0, 0, 0, 170))
        self.game_surf.blit(bg, (bx - pad, 18 - pad))
        self.game_surf.blit(surf, (bx, 18))

    def _draw_hud_msg(self):
        font = pygame.font.SysFont('Arial', 19, bold=True)
        surf = font.render(self._hud_msg, True, (255, 130, 130))
        bx   = GAME_W // 2 - surf.get_width() // 2
        by   = GAME_H - 40
        bg   = pygame.Surface((surf.get_width() + 12, surf.get_height() + 8), pygame.SRCALPHA)
        bg.fill((0, 0, 0, 150))
        self.game_surf.blit(bg, (bx - 6, by - 4))
        self.game_surf.blit(surf, (bx, by))

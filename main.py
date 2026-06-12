import pygame
import sys
from settings import SCREEN_W, SCREEN_H

def main():
    pygame.init()

    # Ventana inicial al 67%
    win_w = int(SCREEN_W * 0.67)
    win_h = int(SCREEN_H * 0.67)
    screen = pygame.display.set_mode((win_w, win_h), pygame.RESIZABLE)
    pygame.display.set_caption("WASTELAND")
    clock  = pygame.time.Clock()

    # Superficie interna 1920×1080 — todo se renderiza aquí
    render_surf = pygame.Surface((SCREEN_W, SCREEN_H))

    # Factores de escala (calculados cada frame)
    scale, offset_x, offset_y = 0.67, 0, 0

    def to_game(wx, wy):
        if scale <= 0:
            return wx, wy
        return int((wx - offset_x) / scale), int((wy - offset_y) / scale)

    def blit_scaled():
        nonlocal scale, offset_x, offset_y
        ww, wh = screen.get_size()
        s      = min(ww / SCREEN_W, wh / SCREEN_H)
        sw, sh = int(SCREEN_W * s), int(SCREEN_H * s)
        ox, oy = (ww - sw)//2, (wh - sh)//2
        scale, offset_x, offset_y = s, ox, oy
        scaled = pygame.transform.scale(render_surf, (sw, sh))
        screen.fill((0, 0, 0))
        screen.blit(scaled, (ox, oy))
        pygame.display.flip()

    # ── Estado inicial ────────────────────────────────────────────────────────
    state         = "menu"
    pending_mode  = None   # modo de juego elegido en el menú
    chosen_class  = None   # clase elegida en char_select

    from screens.main_menu  import MainMenu
    from screens.char_select import CharSelect
    menu       = MainMenu()
    char_sel   = None
    game       = None

    while True:
        dt     = clock.tick(60) / 1000.0
        rx, ry = pygame.mouse.get_pos()
        gmx, gmy = to_game(rx, ry)

        # ── MENU ──────────────────────────────────────────────────────────────
        if state == "menu":
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit(); sys.exit()
                action = menu.handle_event(event, gmx, gmy)
                if action == MainMenu.ACT_QUIT:
                    pygame.quit(); sys.exit()
                elif action in (MainMenu.ACT_PRACTICE_DM,
                                MainMenu.ACT_PRACTICE_CZ,
                                MainMenu.ACT_OPEN_WORLD,
                                MainMenu.ACT_QUEUE_1V1,
                                MainMenu.ACT_QUEUE_2V2,
                                MainMenu.ACT_QUEUE_4V4):
                    pending_mode = action
                    char_sel     = CharSelect()
                    state        = "char_select"

            update_action = menu.update(dt, gmx, gmy)
            if update_action:
                pending_mode = update_action
                char_sel     = CharSelect()
                state        = "char_select"
            menu.draw(render_surf)
            blit_scaled()

        # ── CHAR SELECT ───────────────────────────────────────────────────────
        elif state == "char_select":
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit(); sys.exit()
                result = char_sel.handle_event(event, gmx, gmy)
                if result == "back":
                    state    = "menu"
                    char_sel = None
                elif result is not None:
                    chosen_class = result
                    from game import Game
                    game  = Game(screen, chosen_class, mode=pending_mode, player_profile=menu.player, room_id=menu.matched_room_id)
                    state = "game"

            char_sel.update(dt, gmx, gmy)
            char_sel.draw(render_surf)
            blit_scaled()

        # ── JUEGO ─────────────────────────────────────────────────────────────
        elif state == "game":
            result = game.run_frame(dt, render_surf, to_game)
            blit_scaled()
            if result == "back_to_menu":
                game  = None
                state = "menu"

if __name__ == "__main__":
    main()

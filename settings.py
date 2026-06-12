# ── Resolución base (render interno) ─────────────────────────────────────────
# El juego siempre dibuja a 1920×800.
# pygame.SCALED escala al tamaño real de la ventana automáticamente.
SCREEN_W  = 1920
SCREEN_H  = 1080
SIDEBAR_W = 280
GAME_W    = SCREEN_W - SIDEBAR_W   # 1640
GAME_H    = SCREEN_H               # 800

TILE_SIZE = 64    # tamaño de tile = zoom de cámara. Más grande = más zoom, sprites más grandes, menos visión.
FPS       = 60
TITLE     = "WASTELAND — Prototipo"

# Dos tracks de poción independientes (no se interrumpen entre sí)
POTION_CD_KEY   = 0.5    # CD del track tecla U
POTION_CD_CLICK = 0.4    # CD del track doble-clic
TILE_MOVE_TIME        = 0.10   # segundos para cruzar un tile base

# ── Balance de daño ───────────────────────────────────────────────────────────
DAMAGE_MULT = {
    "single_melee":   1.00,   # requiere adyacencia
    "single_ranged":  0.85,   # requiere clickear al objetivo
    "aoe_targeted":   0.55,   # área en posición, fácil de esquivar
    "aoe_self":       0.45,   # alrededor del caster, sin apuntado
    "melee_area":     0.45,   # Golpe Área (Arco de Golpe)
}

# CC: AoE CC dura menos que single-target CC
CC_AOE_DURATION_MULT = 0.60   # CC en AoE = 60% de la duración normal

# Ghost mode
GHOST_DURATION = 20.0         # segundos antes del respawn forzado
GHOST_REVIVE_HP  = 0.40       # % HP al revivir
GHOST_REVIVE_EN  = 0.20       # % Energía al revivir
DOUBLE_CLICK_TIME     = 0.35

# ── UI layout (sidebar) ───────────────────────────────────────────────────────
SLOT_SIZE    = 52
SLOT_COLS    = 4
SLOT_PADDING = 5

# ── Colors — paleta WASTELAND (Mad Max / Borderlands) ─────────────────────────
SIDEBAR_BG     = (26,  21,  16)    # marrón-negro grunge
SLOT_BG        = (42,  34,  24)    # metal sucio
SLOT_BORDER    = (96,  72,  40)    # borde oxidado
SLOT_SELECTED  = (210, 130, 35)    # ámbar/naranja (selección)
SLOT_HOVER     = (64,  50,  32)
HP_COLOR       = (200, 55,  42)    # rojo
MP_COLOR       = (70,  155, 210)   # energía cian
BAR_BG         = (30,  24,  17)
TEXT_WHITE     = (236, 224, 200)   # blanco cálido
TEXT_DIM       = (152, 130, 98)    # arena apagada
TEXT_DARK      = (90,  76,  56)    # texto muy apagado (deshabilitado)
SPELL_BG       = (42,  34,  24)
SPELL_HOVER    = (64,  50,  32)
SPELL_BORDER   = (112, 82,  42)
DIVIDER_COLOR  = (74,  54,  28)
COOLDOWN_FLASH = (240, 180, 50)    # ámbar brillante
WHITE          = (255, 255, 255)
BLACK          = (0,   0,   0)

# Acentos hazard (rayas amarillo/negro estilo Borderlands)
HAZARD_YELLOW  = (224, 168, 32)
HAZARD_DARK    = (28,  22,  14)
ACCENT_ORANGE  = (228, 126, 26)
RUST           = (140, 78,  38)

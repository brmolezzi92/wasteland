"""
AssetManager — carga sprites PNG con fallback elegante.

Filosofía: si el archivo existe, se dibuja el sprite. Si no, el caller dibuja
su primitiva (círculo) de siempre. El juego nunca se rompe por falta de assets.

Estructura esperada (relativa a la raíz del proyecto):
    assets/
      players/   baluarte.png  cuchilla.png  artillero.png  operador.png  medico_nano.png
      enemies/   <nombre>.png
      boss/      <nombre>.png
      tiles/     grass.png  dirt.png  ...
      items/     hp_potion.png  ...

Cada PNG debe ser UN solo frame (recortado, fondo transparente). Para cortar
las tiras de 5 frames que genera ChatGPT, usá tools/slice_sheet.py.
"""

import os
import pygame

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ASSETS_DIR = os.path.join(_ROOT, "assets")


class AssetManager:
    def __init__(self):
        self._base_cache: dict = {}    # rel_path -> Surface | None
        self._scaled_cache: dict = {}  # (rel_path, target_h) -> Surface | None

    # ── carga base ──────────────────────────────────────────────────────────

    def _load_base(self, rel_path: str):
        if rel_path in self._base_cache:
            return self._base_cache[rel_path]
        full = os.path.join(_ASSETS_DIR, rel_path)
        surf = None
        if os.path.isfile(full):
            try:
                surf = pygame.image.load(full).convert_alpha()
            except Exception as e:
                print(f"[AssetManager] error cargando {rel_path}: {e}")
                surf = None
        self._base_cache[rel_path] = surf
        return surf

    # ── sprite escalado por altura ──────────────────────────────────────────

    def sprite(self, rel_path: str, target_h: int):
        """Retorna el sprite escalado a target_h px de alto (aspecto preservado), o None."""
        key = (rel_path, target_h)
        if key in self._scaled_cache:
            return self._scaled_cache[key]
        base = self._load_base(rel_path)
        scaled = None
        if base is not None:
            w, h = base.get_size()
            if h > 0:
                tw = max(1, int(w * target_h / h))
                scaled = pygame.transform.smoothscale(base, (tw, target_h))
        self._scaled_cache[key] = scaled
        return scaled

    # ── dibujo de entidad ───────────────────────────────────────────────────

    def blit_entity(self, surface, rel_path, cx, foot_y, target_h, alpha=255):
        """
        Dibuja un sprite centrado en cx con los pies en foot_y (sobresale hacia arriba).
        Retorna True si dibujó un sprite, False si no existe (el caller hace fallback).
        """
        spr = self.sprite(rel_path, target_h)
        if spr is None:
            return False
        if alpha < 255:
            spr = spr.copy()
            spr.set_alpha(alpha)
        w, h = spr.get_size()
        surface.blit(spr, (cx - w // 2, foot_y - h))
        return True

    # ── tile (escalado cuadrado a TILE_SIZE) ────────────────────────────────

    def tile(self, rel_path: str, size: int):
        key = (rel_path, ("tile", size))
        if key in self._scaled_cache:
            return self._scaled_cache[key]
        base = self._load_base(rel_path)
        scaled = None
        if base is not None:
            scaled = pygame.transform.smoothscale(base, (size, size))
        self._scaled_cache[key] = scaled
        return scaled

    def has(self, rel_path: str) -> bool:
        return self._load_base(rel_path) is not None


# Singleton compartido por todo el juego
assets = AssetManager()


def slugify(name: str) -> str:
    """Convierte 'General Malkhor' → 'general_malkhor' para nombres de archivo."""
    return name.lower().strip().replace(" ", "_").replace("-", "_")

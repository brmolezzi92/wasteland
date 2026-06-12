import pygame
import random
from settings import TILE_SIZE
from entities.assets import assets

GRASS = 0
DIRT  = 1
WATER = 2
WALL  = 3
PATH  = 4

# Base colors per tile type (fallback si falta el PNG)
_TILE_BASE = {
    GRASS: (78,  115, 60),
    DIRT:  (135, 110, 78),
    WATER: (55,  115, 190),
    WALL:  (72,  72,  72),
    PATH:  (160, 140, 105),
}

# Sprite por tipo de tile (assets/tiles/*.png)
_TILE_SPRITE = {
    GRASS: "tiles/floor.png",
    DIRT:  "tiles/dirt.png",
    WATER: "tiles/toxic.png",
    WALL:  "tiles/wall.png",
    PATH:  "tiles/path.png",
}

SOLID = {GRASS: False, DIRT: False, WATER: True, WALL: True, PATH: False}

MAP_W = 120
MAP_H = 110

class TileMap:
    def __init__(self, seed=42, map_type="world"):
        self._rng = random.Random(seed)
        self.map_type = map_type
        if map_type == "duel":
            self.width  = 60
            self.height = 45
        else:
            self.width  = MAP_W
            self.height = MAP_H
        self.tiles  = self._generate()
        self._color_cache = {}   # (tile_type, x, y) → color

    def _generate(self):
        rng = self._rng
        tiles = [[GRASS] * self.width for _ in range(self.height)]

        # Border walls
        for x in range(self.width):
            tiles[0][x] = WALL
            tiles[self.height - 1][x] = WALL
        for y in range(self.height):
            tiles[y][0] = WALL
            tiles[y][self.width - 1] = WALL

        if self.map_type == "duel":
            # Arena de Duelo Simétrica
            # Lagos en las esquinas
            for y in range(self.height):
                for x in range(self.width):
                    if (x < 8 and y < 8) or (x >= self.width - 8 and y < 8) or \
                       (x < 8 and y >= self.height - 8) or (x >= self.width - 8 and y >= self.height - 8):
                        if 0 < x < self.width - 1 and 0 < y < self.height - 1:
                            tiles[y][x] = WATER

            # Pilares de piedra simétricos
            pillars = [
                (15, 15),
                (45, 15),
                (15, 30),
                (45, 30),
            ]
            for px, py in pillars:
                for dy in [-1, 0, 1]:
                    for dx in [-1, 0, 1]:
                        tiles[py + dy][px + dx] = WALL

            # Caminos en forma de cruz central
            hy = self.height // 2
            for x in range(2, self.width - 2):
                if tiles[hy][x] not in (WATER, WALL):
                    tiles[hy][x] = PATH
                if tiles[hy + 1][x] not in (WATER, WALL):
                    tiles[hy + 1][x] = PATH

            vx = self.width // 2
            for y in range(2, self.height - 2):
                if tiles[y][vx] not in (WATER, WALL):
                    tiles[y][vx] = PATH
                if tiles[y][vx + 1] not in (WATER, WALL):
                    tiles[y][vx + 1] = PATH

            # Scatter sutil de DIRT
            for y in range(1, self.height - 1):
                for x in range(1, self.width - 1):
                    if tiles[y][x] == GRASS and rng.random() < 0.08:
                        tiles[y][x] = DIRT
        else:
            # Base scatter: dirt y walls (sin agua individual)
            for y in range(1, self.height - 1):
                for x in range(1, self.width - 1):
                    r = rng.random()
                    if r < 0.10:
                        tiles[y][x] = DIRT
                    elif r < 0.14:
                        tiles[y][x] = WALL

            # Manchas de agua (lagos pequeños)
            for _ in range(18):
                lx = rng.randint(3, self.width  - 4)
                ly = rng.randint(3, self.height - 4)
                radius = rng.randint(2, 5)
                for dy in range(-radius, radius + 1):
                    for dx in range(-radius, radius + 1):
                        if dx*dx + dy*dy <= radius*radius:
                            nx, ny = lx + dx, ly + dy
                            if 1 <= nx < self.width-1 and 1 <= ny < self.height-1:
                                tiles[ny][nx] = WATER

            # A simple horizontal dirt path across the map center
            py = self.height // 2
            for x in range(2, self.width - 2):
                if tiles[py][x] != WATER:
                    tiles[py][x] = PATH
                if tiles[py + 1][x] not in (WATER, WALL):
                    tiles[py + 1][x] = PATH

            # A vertical dirt path
            px = self.width // 2
            for y in range(2, self.height - 2):
                if tiles[y][px] != WATER:
                    tiles[y][px] = PATH
                if tiles[y][px + 1] not in (WATER, WALL):
                    tiles[y][px + 1] = PATH

        return tiles

    def _tile_color(self, tile, tx, ty):
        key = (tile, tx, ty)
        if key in self._color_cache:
            return self._color_cache[key]
        base = _TILE_BASE[tile]
        # Subtle per-tile variation using position hash
        v = ((tx * 73856093) ^ (ty * 19349663)) & 0xFF
        v = (v % 12) - 6   # -6 to +5
        color = (
            max(0, min(255, base[0] + v)),
            max(0, min(255, base[1] + v)),
            max(0, min(255, base[2] + v)),
        )
        self._color_cache[key] = color
        return color

    def is_solid(self, tx, ty):
        if tx < 0 or ty < 0 or tx >= self.width or ty >= self.height:
            return True
        return SOLID[self.tiles[ty][tx]]

    def draw(self, surface, cam_x, cam_y, game_w, game_h):
        ts = TILE_SIZE
        start_x = max(0, cam_x // ts)
        start_y = max(0, cam_y // ts)
        end_x   = min(self.width,  start_x + game_w // ts + 2)
        end_y   = min(self.height, start_y + game_h // ts + 2)

        for ty in range(start_y, end_y):
            for tx in range(start_x, end_x):
                tile = self.tiles[ty][tx]
                sx   = tx * ts - cam_x
                sy   = ty * ts - cam_y
                spr  = assets.tile(_TILE_SPRITE.get(tile), ts) if tile in _TILE_SPRITE else None
                if spr is not None:
                    surface.blit(spr, (sx, sy))
                else:
                    pygame.draw.rect(surface, self._tile_color(tile, tx, ty), (sx, sy, ts, ts))

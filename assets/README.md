# Assets — dónde va cada sprite

El juego carga automáticamente los PNG que encuentre acá. Si falta un archivo,
dibuja el círculo de placeholder (no se rompe nada). Apenas dropeás el PNG en la
carpeta correcta con el nombre correcto, aparece en el juego.

**Formato:** PNG con fondo transparente, UN solo frame (recortado), vista top-down.

## Personajes (clases)  →  `assets/players/`
Nombre de archivo = id de la clase (ver `data/classes.json`):

| Archivo | Clase |
|---------|-------|
| `baluarte.png`    | Baluarte (Tank) |
| `cuchilla.png`    | Cuchilla (DPS Melee) |
| `artillero.png`   | Artillero (DPS Ranged) |
| `operador.png`    | Operador (Support) |
| `medico_nano.png` | Médico Nano (Healer) |

## Enemigos  →  `assets/enemies/`
Nombre de archivo = nombre del enemigo en minúsculas con `_` en vez de espacios.
Ej: enemigo "Drone NEXUS" → `drone_nexus.png`

## Boss  →  `assets/boss/`
Ej: "General Malkhor" → `general_malkhor.png`  ·  "El Devorador" → `el_devorador.png`

## Tiles (piso)  →  `assets/tiles/`
`grass.png`, `dirt.png`, `water.png`, `wall.png`, `path.png` (32×32, tileable)

## Items  →  `assets/items/`
Nombre = id del item en `data/items.json`. Ej: `hp_potion.png`

---

## Cortar las tiras de 5 frames de ChatGPT

Si generaste una tira horizontal con varias poses, guardala en `assets/_sheets/`
y corré:

```
python tools/slice_sheet.py assets/_sheets/baluarte.png 5 assets/players/baluarte.png
```

Esto corta la tira en 5 columnas iguales y guarda el frame 0 (el primero) en el
destino. Para elegir otro frame agregá el índice al final:

```
python tools/slice_sheet.py assets/_sheets/baluarte.png 5 assets/players/baluarte.png 2
```

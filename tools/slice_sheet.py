"""
Corta una tira horizontal de N frames y guarda uno (o todos) recortados al
contenido real (auto-trim del espacio transparente).

Uso:
    # Guardar el frame 0:
    python tools/slice_sheet.py <tira.png> <n_frames> <salida.png>

    # Guardar un frame específico (índice 0..n-1):
    python tools/slice_sheet.py <tira.png> <n_frames> <salida.png> <idx>

    # Guardar TODOS los frames (salida usada como prefijo: salida_0.png, _1.png...):
    python tools/slice_sheet.py <tira.png> <n_frames> <salida.png> all

Requiere Pillow:  pip install pillow
"""

import sys
from PIL import Image


def trim(im):
    """Recorta el espacio transparente alrededor del contenido."""
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)

    src      = sys.argv[1]
    n        = int(sys.argv[2])
    out      = sys.argv[3]
    which    = sys.argv[4] if len(sys.argv) > 4 else "0"

    sheet = Image.open(src).convert("RGBA")
    W, H  = sheet.size
    fw    = W // n

    def frame(i):
        box = (i * fw, 0, (i + 1) * fw, H)
        return trim(sheet.crop(box))

    if which == "all":
        base = out.rsplit(".", 1)[0]
        for i in range(n):
            f = frame(i)
            path = f"{base}_{i}.png"
            f.save(path)
            print(f"  guardado {path}  ({f.size[0]}x{f.size[1]})")
    else:
        i = int(which)
        f = frame(i)
        f.save(out)
        print(f"  guardado {out}  (frame {i}, {f.size[0]}x{f.size[1]})")


if __name__ == "__main__":
    main()

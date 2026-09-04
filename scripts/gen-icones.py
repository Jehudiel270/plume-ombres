# gen-icones.py — génère toutes les variantes d'icône de l'app à
# partir du visuel officiel (PNG RGBA 1254×1254 fourni par Carrel).
#
# Variantes (toutes dans public/ sauf favicon) :
#   icon-192.png    favicon + PWA 192
#   icon-512.png    PWA 512 (manifest)
#   icon-masque.png icône « maskable » : visuel réduit dans la zone
#                  sûre (80 %) sur fond couleur app (#0b0709)
#   apple-icon.png  iOS « Ajouter à l'écran d'accueil » (180)
#   app/favicon.ico ICO multi-tailles (16/32/48) — Next.js App Router

from PIL import Image
from pathlib import Path

SOURCE = r"C:\Users\dosso\AppData\Local\hermes\profiles\devotron\cache\images\img_d4930257338c.png"
PUBLIC = Path(__file__).resolve().parent.parent / "public"
APP = Path(__file__).resolve().parent.parent / "app"
FOND = (11, 7, 9, 255)  # #0b0709 (themeColor app)

def centraliser(img, taille, fond=None):
    """Redimensionne en conservant le ratio puis centre sur une
    toile carrée. Un fond couleur est demandé (masque, 192/512,
    apple) : la source est composée sur celui-ci avant réduction,
    pour que les zones transparentes ne laissent pas filtrer le
    fond cible (prévisibilité des PWA)."""
    img = img.convert("RGBA")
    # Pré-composition sur le fond (ou transparent si non demandé).
    if fond is not None:
        base = Image.new("RGBA", img.size, fond)
        base.alpha_composite(img)
        img = base
    img.thumbnail((taille, taille), Image.LANCZOS)
    toile = Image.new("RGBA", (taille, taille), fond or (255, 255, 255, 0))
    im2 = Image.new("RGBA", (img.width, img.height), (0, 0, 0, 0))
    im2.paste(img, (0, 0))
    toile.paste(im2, ((taille - img.width) // 2, (taille - img.height) // 2), im2)
    return toile

def principal():
    src = Image.open(SOURCE)
    print(f"source : {src.size} {src.mode}")

    # 192 / 512 : visuel plein cadre sur fond app (lisible partout).
    for t in (192, 512):
        centraliser(src, t, fond=FOND).convert("RGB").save(PUBLIC / f"icon-{t}.png", optimize=True)
        print(f"icon-{t}.png ok")

    # Masque : contenu dans 80 % de la zone, fond couleur app.
    masque = Image.new("RGBA", (512, 512), FOND)
    contenu = centraliser(src, 409, fond=FOND)  # 80 % de 512
    masque.alpha_composite(contenu, (51, 51))
    masque.convert("RGB").save(PUBLIC / "icon-masque.png", optimize=True)
    print("icon-masque.png ok")

    # Apple : 180×180 (iOS applique ses propres coins) — fond app.
    centraliser(src, 180, fond=FOND).convert("RGB").save(PUBLIC / "apple-icon.png", optimize=True)
    print("apple-icon.png ok")

    # Favicon ICO : 16/32/48 (échelle par taille depuis 128 px).
    # Next.js l'exige en RGBA dans l'ICO — conversion RGBA obligatoire.
    (APP / "favicon.ico").unlink(missing_ok=True)
    centraliser(src, 128, fond=FOND).save(
        APP / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print("app/favicon.ico ok")

if __name__ == "__main__":
    principal()
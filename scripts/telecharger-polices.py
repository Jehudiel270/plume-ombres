#!/usr/bin/env python3
"""Telecharge les polices libres (SIL OFL) au format woff2, sous-ensemble latin,
depuis l'API CSS2 de Google Fonts, pour un auto-hebergement via next/font/local.
Aucune dependance externe (stdlib uniquement)."""
import json
import os
import re
import sys
import urllib.request

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

FAMILLES = {
    "Bodoni Moda": "family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900",
    "Literata": "family=Literata:ital,opsz,wght@0,7..72,200..900;1,7..72,200..900",
    "Cormorant Garamond": "family=Cormorant+Garamond:ital,wght@0,300..700;1,300..700",
}

DEST = sys.argv[1] if len(sys.argv) > 1 else "app/fonts"


def telecharger(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as rep:
        return rep.read()


css_url = (
    "https://fonts.googleapis.com/css2?"
    + "&".join(FAMILLES.values())
    + "&display=swap"
)
css = telecharger(css_url).decode("utf-8")

# Decoupe : /* sous-ensemble */ @font-face { ... }
blocs = re.findall(
    r"/\*\s*([a-z\-0-9]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S
)

os.makedirs(DEST, exist_ok=True)
rapport = []
for sousensemble, corps in blocs:
    if sousensemble != "latin":
        continue
    famille = re.search(r"font-family:\s*'([^']+)'", corps)
    style = re.search(r"font-style:\s*(\w+)", corps)
    poids = re.search(r"font-weight:\s*([\d\s]+);", corps)
    src = re.search(r"url\((https://[^)]+\.woff2)\)", corps)
    urange = re.search(r"unicode-range:\s*([^;]+);", corps)
    if not (famille and style and poids and src):
        print("BLOQUE illisible:", corps[:120])
        continue
    nom = "%s-%s.woff2" % (
        famille.group(1).replace(" ", ""),
        style.group(1),
    )
    chemin = os.path.join(DEST, nom)
    data = telecharger(src.group(1))
    with open(chemin, "wb") as f:
        f.write(data)
    rapport.append(
        {
            "famille": famille.group(1),
            "fichier": nom,
            "style": style.group(1),
            "poids": poids.group(1).strip(),
            "octets": len(data),
            "unicodeRange": urange.group(1).strip() if urange else None,
            "source": src.group(1),
        }
    )

print(json.dumps(rapport, ensure_ascii=False, indent=2))
print("FICHIERS:", len(rapport))

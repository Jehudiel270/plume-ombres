#!/usr/bin/env python3
"""Inspecte un fichier .epub (archive ZIP + validité XML) et imprime un JSON.

Usage : python scripts/inspecter-epub.py chemin/vers/fichier.epub
Dépendances : bibliothèque standard uniquement (zipfile, xml.dom.minidom).
"""
import json
import os
import re
import sys
import zipfile
import xml.dom.minidom as minidom


def inspecter(chemin: str) -> dict:
    res: dict = {
        "fichier": chemin,
        "existe": False,
        "valide": False,
        "erreurs": [],
    }
    if not os.path.isfile(chemin):
        res["erreurs"].append("fichier introuvable")
        return res

    res["existe"] = True
    res["taille"] = os.path.getsize(chemin)

    with zipfile.ZipFile(chemin) as z:
        noms = z.namelist()
        infos = z.infolist()
        res["entrees"] = len(noms)
        res["noms"] = noms

        res["premier_est_mimetype"] = infos[0].filename == "mimetype"
        res["mimetype_stocke"] = infos[0].compress_type == zipfile.ZIP_STORED
        res["mimetype_contenu"] = (
            z.read("mimetype").decode("utf-8", "replace")
            if "mimetype" in noms
            else None
        )
        res["container_present"] = "META-INF/container.xml" in noms
        res["opf_present"] = "OEBPS/content.opf" in noms
        res["nav_present"] = "OEBPS/nav.xhtml" in noms
        res["toc_ncx_present"] = "OEBPS/toc.ncx" in noms
        res["chapitres"] = sorted(
            n for n in noms if n.startswith("OEBPS/text/chapitre-")
        )
        res["nb_chapitres"] = len(res["chapitres"])

        opf = (
            z.read("OEBPS/content.opf").decode("utf-8", "replace")
            if res["opf_present"]
            else ""
        )
        for balise, cle in (
            ("dc:language", "langue"),
            ("dc:title", "titre"),
            ("dc:creator", "auteur"),
        ):
            m = re.search(rf"<{balise}>([^<]+)</{balise}>", opf)
            res[cle] = m.group(1) if m else None
        m = re.search(r"<dc:identifier[^>]*>([^<]+)</dc:identifier>", opf)
        res["identifiant"] = m.group(1) if m else None
        nav = (
            z.read("OEBPS/nav.xhtml").decode("utf-8", "replace")
            if res["nav_present"]
            else ""
        )
        res["nav_liens_chapitres"] = len(
            re.findall(r"<a href=\"text/chapitre-[^\"]+\"", nav)
        )

        xml_ok = True
        for n in noms:
            if n.endswith((".xhtml", ".opf", ".ncx", ".xml")):
                try:
                    minidom.parseString(z.read(n))
                except Exception as exc:  # noqa: BLE001
                    xml_ok = False
                    res["erreurs"].append(f"XML invalide ({n}) : {exc}")
        res["xml_valide"] = xml_ok

    res["valide"] = all(
        [
            res.get("premier_est_mimetype", False),
            res.get("mimetype_stocke", False),
            res.get("mimetype_contenu") == "application/epub+zip",
            res.get("container_present", False),
            res.get("opf_present", False),
            res.get("nav_present", False),
            res.get("nb_chapitres", 0) > 0,
            res.get("xml_valide", False),
            res.get("langue") == "fr",
        ]
    )
    return res


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage : python scripts/inspecter-epub.py <fichier.epub>", file=sys.stderr)
        sys.exit(2)
    print(json.dumps(inspecter(sys.argv[1]), ensure_ascii=False, indent=2))

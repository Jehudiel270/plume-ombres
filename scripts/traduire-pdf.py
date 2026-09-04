#!/usr/bin/env python3
"""
Plume d'Ombres — Traduit un PDF en conservant la mise en page originale.

Usage :
  echo '<JSON avec les traductions>' | python3 traduire-pdf.py <pdf_entree> <pdf_sortie>

Format du JSON d'entrée :
  {
    "pages": [
      {
        "num": 1,
        "lignes": ["ligne 1 traduite", "ligne 2 traduite", ...]
      },
      ...
    ]
  }

Le script extrait automatiquement les lignes du PDF, applique les traductions
fournies, et génère un nouveau PDF identique en mise en page mais en français.
"""
import json, sys, os, fitz

def traiter_pdf(pdf_path: str, traductions_par_page: dict, out_path: str):
    """
    traductions_par_page : dict[int, list[str]]
        numéro_de_page -> [ligne_traduite_1, ligne_traduite_2, ...]
    """
    doc = fitz.open(pdf_path)
    total_lignes_original = 0
    total_lignes_inserees = 0

    for i, page in enumerate(doc):
        num_page = i + 1
        lignes_traduites = traductions_par_page.get(num_page)
        if not lignes_traduites:
            continue

        # 1. Extraire toutes les lignes avec leurs positions
        blocks = page.get_text("dict")["blocks"]
        items = []
        for b in blocks:
            if b["type"] != 0:  # ignorer images
                continue
            for line in b.get("lines", []):
                texte = "".join(s["text"] for s in line["spans"])
                if texte.strip():
                    items.append({
                        "bbox": fitz.Rect(line["bbox"]),
                        "text": texte,
                        "font": line["spans"][0].get("font", ""),
                        "size": line["spans"][0].get("size", 11),
                        "color": line["spans"][0].get("color", 0),
                    })

        total_lignes_original += len(items)

        # 2. Créer des annotations de redaction (cache le texte original)
        for item in items:
            # Ajouter une marge de 1px pour éviter les résidus de pixels
            rect = item["bbox"]
            rect = fitz.Rect(rect.x0 - 0.5, rect.y0 - 0.5,
                             rect.x1 + 0.5, rect.y1 + 0.5)
            page.add_redact_annot(rect, fill=(1, 1, 1))  # blanc

        # 3. Appliquer les redactions
        page.apply_redactions()

        # 4. Réinsérer le texte traduit
        for j, item in enumerate(items):
            if j < len(lignes_traduites) and lignes_traduites[j].strip():
                rect = item["bbox"]
                # Déterminer la police : on utilise la police standard helv
                # (le PDF original peut avoir des polices non embarquées)
                taille = item["size"]
                couleur = item["color"]

                # Ajustement : réduire légèrement la taille si le texte est long
                # pour éviter les débordements
                texte_traduit = lignes_traduites[j]
                texte_original = item["text"]

                ratio = len(texte_traduit) / max(len(texte_original), 1)
                taille_finale = taille * (0.85 if ratio > 1.3 else 0.95)

                page.insert_textbox(
                    rect,
                    texte_traduit,
                    fontname="helv",
                    fontsize=taille_finale,
                    color=couleur,
                    align=fitz.TEXT_ALIGN_LEFT,
                )
                total_lignes_inserees += 1

    doc.save(out_path, garbage=4, deflate=True, clean=True)
    doc.close()

    return {
        "ok": True,
        "pages": len(doc) if hasattr(doc, '__len__') else 0,
        "lignes_originales": total_lignes_original,
        "lignes_traduites": total_lignes_inserees,
        "sortie": out_path
    }


def extraire_lignes(pdf_path: str) -> dict:
    """Extrait toutes les lignes de texte d'un PDF avec leurs positions."""
    doc = fitz.open(pdf_path)
    resultat = {"pages": [], "total_pages": len(doc)}
    for i, page in enumerate(doc):
        blocks = page.get_text("dict")["blocks"]
        lignes = []
        for b in blocks:
            if b["type"] != 0:
                continue
            for line in b.get("lines", []):
                texte = "".join(s["text"] for s in line["spans"])
                if texte.strip():
                    lignes.append({
                        "bbox": list(line["bbox"]),
                        "text": texte,
                    })
        resultat["pages"].append({
            "num": i + 1,
            "lignes": lignes,
        })
    doc.close()
    return resultat


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage:", file=sys.stderr)
        print("  Extraire les lignes :  python3 traduire-pdf.py extraire <pdf>", file=sys.stderr)
        print("  Traduire le PDF :      echo '{...}' | python3 traduire-pdf.py traduire <pdf_entree> <pdf_sortie>", file=sys.stderr)
        sys.exit(1)

    commande = sys.argv[1]

    if commande == "extraire":
        pdf_path = sys.argv[2]
        resultat = extraire_lignes(pdf_path)
        print(json.dumps(resultat, ensure_ascii=False))

    elif commande == "traduire":
        pdf_entree = sys.argv[2]
        pdf_sortie = sys.argv[3]
        data = json.loads(sys.stdin.read())
        traductions = {int(k): v for k, v in data.get("traductions", {}).items()}
        resultat = traiter_pdf(pdf_entree, traductions, pdf_sortie)
        print(json.dumps(resultat, ensure_ascii=False))

    else:
        print(f"Commande inconnue : {commande}", file=sys.stderr)
        sys.exit(1)
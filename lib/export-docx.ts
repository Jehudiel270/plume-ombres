// ============================================================
// export-docx.ts — Génère un document Word (.docx) mis en forme
// à partir des chapitres (titre du livre, titres de chapitres en
// style Titre 1, paragraphes aérés). Bibliothèque `docx` chargée
// à la demande (côté navigateur, aucun serveur requis).
// ============================================================

export interface ChapitreExport {
  titre: string;
  texte: string; // texte à exporter (traduit si dispo, sinon source)
}

/** Sépare un texte brut en paragraphes propres (lignes vides). */
export function enParagraphes(texte: string): string[] {
  return texte
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n+/g, ' ').trim())
    .filter((p) => p.length > 0);
}

/**
 * Construit le .docx (titre du livre + chapitres en Titre 1 + paragraphes).
 * Retourne un Blob prêt à télécharger.
 */
export async function genererDocx(
  titreLivre: string,
  chapitres: ChapitreExport[]
): Promise<Blob> {
  // Import dynamique : la bibliothèque `docx` est lourde (~1 Mo).
  const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } =
    await import('docx');

  // Typé de façon souple : les classes docx viennent de l'import dynamique.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enfants: any[] = [];

  // Page de titre
  enfants.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 200 },
      children: [new TextRun({ text: titreLivre, bold: true, size: 64, font: 'Georgia' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({ text: 'Traduction française', italics: true, size: 28, font: 'Georgia', color: '666666' }),
      ],
    })
  );

  for (const chapitre of chapitres) {
    enfants.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 800, after: 400 },
        children: [new TextRun({ text: chapitre.titre, font: 'Georgia' })],
      })
    );
    for (const paragraphe of enParagraphes(chapitre.texte)) {
      enfants.push(
        new Paragraph({
          spacing: { after: 220, line: 360 },
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: paragraphe, size: 26, font: 'Georgia' })],
        })
      );
    }
  }

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children: enfants,
      },
    ],
  });

  return Packer.toBlob(document);
}

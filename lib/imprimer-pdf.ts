// ============================================================
// imprimer-pdf.ts — Impression / « Enregistrer en PDF » d'un
// livre mis en forme, depuis le navigateur (aucune dépendance).
// Ouvre un document propre dans une iframe invisible puis lance
// la boîte de dialogue d'impression : l'utilisateur choisit
// « Enregistrer au format PDF ».
// ============================================================

import type { ChapitreExport } from './export-docx';

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function imprimerLivre(titreLivre: string, chapitres: ChapitreExport[]) {
  const paragraphesHtml = chapitres
    .map((chapitre) => {
      const corps = chapitre.texte
        .split(/\n{2,}/)
        .map((p) => p.replace(/\n+/g, ' ').trim())
        .filter(Boolean)
        .map((p) => `<p>${echapper(p)}</p>`)
        .join('\n');
      return `<section><h2>${echapper(chapitre.titre)}</h2>${corps}</section>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${echapper(titreLivre)}</title>
<style>
  @page { size: A4; margin: 2.2cm 2cm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a;
         max-width: 17cm; margin: 0 auto; line-height: 1.65; }
  header { text-align: center; margin-bottom: 1.4cm; }
  header h1 { font-size: 26pt; margin: 0 0 6px; }
  header p { font-style: italic; color: #555; margin: 0; }
  h2 { font-size: 16pt; margin: 1.4cm 0 0.6cm; text-align: center;
       text-transform: uppercase; letter-spacing: 0.08em; }
  p { font-size: 11.5pt; text-align: justify; margin: 0 0 0.45cm; text-indent: 0.6cm; }
  section { page-break-before: always; }
  section:first-of-type { page-break-before: avoid; }
</style>
</head>
<body>
  <header>
    <h1>${echapper(titreLivre)}</h1>
    <p>Traduction française</p>
  </header>
  ${paragraphesHtml}
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const fenetre = iframe.contentWindow;
  if (!fenetre) {
    document.body.removeChild(iframe);
    return;
  }

  iframe.onload = () => {
    try {
      fenetre.focus();
      fenetre.print();
    } finally {
      // Nettoyage après l'impression (délai court : dialog bloquant).
      setTimeout(() => document.body.removeChild(iframe), 60_000);
    }
  };

  fenetre.document.open();
  fenetre.document.write(html);
  fenetre.document.close();
}

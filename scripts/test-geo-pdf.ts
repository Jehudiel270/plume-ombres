// ============================================================
// test-geo-pdf.ts — Test RÉEL de lib/geo-pdf (chantier B2/B3/B5).
//
// Vérifie, sans navigateur :
//   1. calculerGeo() sur mesures synthétiques (dimensions, marges,
//      bornes de marge, corps/interligne, cas « sans texte ») ;
//   2. l'aller-retour STOCKAGE : resumerGeo → geoDepuisStockage /
//      geoDepuisLivre (les 3 nombres en base suffisent à
//      reconstruire la géométrie ; colonnes absentes → null) ;
//   3. un PDF RÉEL (corpus local) : mesure pdf.js → calculerGeo →
//      3 nombres → reconstruction → genererPdfTraduit, puis
//      relecture du PDF généré (pdf-lib) : la taille de page est
//      exactement celle des 3 nombres stockés.
//
// Usage : npx tsx scripts/test-geo-pdf.ts
// ============================================================

import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
import {
  calculerGeo,
  resumerGeo,
  geoDepuisStockage,
  geoDepuisLivre,
  type PageBrute,
} from '../lib/geo-pdf';
import { genererPdfTraduit } from '../lib/pdf-traduit';

const CORPUS = 'C:/Users/dosso/dev/test-corpus/The_Predator_RuNyx.pdf';

let echecs = 0;
function verifier(nom: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`✓ ${nom}`);
  } else {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------- 1. calculerGeo sur mesures synthétiques ----------
function pageSynthetique(): PageBrute {
  const items = [];
  for (let i = 0; i < 40; i++) {
    items.push({ x: 50, y: 60 + i * 12, w: 300, h: 10, dy: 11 });
  }
  return { largeur: 400, hauteur: 600, items };
}

function testCalculerGeo() {
  const geo = calculerGeo([pageSynthetique()]);
  verifier('calculerGeo : géométrie non nulle', geo !== null);
  if (!geo) return;
  verifier('calculerGeo : largeur = 400', geo.largeur === 400, `reçu ${geo.largeur}`);
  verifier('calculerGeo : hauteur = 600', geo.hauteur === 600, `reçu ${geo.hauteur}`);
  verifier('calculerGeo : margeGauche = 50', geo.margeGauche === 50, `reçu ${geo.margeGauche}`);
  verifier('calculerGeo : margeDroite = 50', geo.margeDroite === 50, `reçu ${geo.margeDroite}`);
  verifier('calculerGeo : margeBas = 60', geo.margeBas === 60, `reçu ${geo.margeBas}`);
  verifier('calculerGeo : margeHaut = 62', geo.margeHaut === 62, `reçu ${geo.margeHaut}`);
  verifier('calculerGeo : tailleCorps = 11', geo.tailleCorps === 11, `reçu ${geo.tailleCorps}`);
  verifier('calculerGeo : hauteurLigne = 12', geo.hauteurLigne === 12, `reçu ${geo.hauteurLigne}`);

  // Bornes : marge minimum 20 pts (texte collé au bord).
  const colle = calculerGeo([
    { largeur: 400, hauteur: 600, items: [{ x: 0, y: 0, w: 400, h: 10, dy: 11 }] },
  ]);
  verifier('calculerGeo : marge bornée à ≥ 20 pt', colle?.margeGauche === 20, `reçu ${colle?.margeGauche}`);

  // Aucun item de texte → null (import non-PDF / PDF image).
  verifier('calculerGeo : sans texte → null', calculerGeo([{ largeur: 400, hauteur: 600, items: [] }]) === null);
}

// ---------- 2. Aller-retour stockage (3 nombres) ----------
function testAllerRetour() {
  const geo = calculerGeo([pageSynthetique()]);
  const stockee = resumerGeo(geo);
  verifier('resumerGeo : 3 nombres', stockee !== null && stockee.largeur === 400 && stockee.hauteur === 600 && stockee.margeEnBloc === 50, JSON.stringify(stockee));

  const relu = geoDepuisStockage(stockee);
  verifier('geoDepuisStockage : dimensions conservées', relu?.largeur === 400 && relu?.hauteur === 600, JSON.stringify(relu));
  verifier('geoDepuisStockage : marge appliquée aux 4 bords', relu?.margeGauche === 50 && relu?.margeDroite === 50 && relu?.margeHaut === 50 && relu?.margeBas === 50, JSON.stringify(relu));

  verifier('geoDepuisStockage(null) → null', geoDepuisStockage(null) === null);
  verifier('resumerGeo(null) → null', resumerGeo(null) === null);
  verifier('geoDepuisLivre : colonnes nulles → null', geoDepuisLivre({ pdf_largeur: null, pdf_hauteur: null, pdf_marge: null }) === null);
  verifier('geoDepuisLivre : colonnes remplies → géométrie', geoDepuisLivre({ pdf_largeur: 400, pdf_hauteur: 600, pdf_marge: 50 })?.largeur === 400);
  verifier('geoDepuisStockage : 0×0 → null', geoDepuisStockage({ largeur: 0, hauteur: 0, margeEnBloc: 0 }) === null);
}

// ---------- 3. PDF réel → 3 nombres → export ----------
async function testPdfReel() {
  const octets = new Uint8Array(readFileSync(CORPUS));
  const doc = await (pdfjs as unknown as {
    getDocument: (o: { data: Uint8Array }) => {
      promise: Promise<{
        numPages: number;
        getPage: (i: number) => Promise<{
          getViewport: (o: { scale: number }) => { width: number; height: number };
          getTextContent: () => Promise<{ items: Array<{ transform: number[]; width: number; height: number; str?: string }> }>;
        }>;
        destroy?: () => Promise<void> | void;
      }>;
    };
  }).getDocument({ data: octets }).promise;

  // Même « sondage » que mesurerOriginalPdf (8 premières pages).
  const pages: PageBrute[] = [];
  const total = doc.numPages;
  const n = Math.min(8, total);
  for (let i = 1; i <= n; i++) {
    const p = await doc.getPage(i);
    const vp = p.getViewport({ scale: 1 });
    const contenu = await p.getTextContent();
    const items = contenu.items
      .filter((it) => (it.str ?? '').trim() !== '' && it.width > 0)
      .map((it) => ({
        x: it.transform[4],
        y: it.transform[5],
        w: it.width,
        h: it.height,
        dy: Math.abs(it.transform[0]),
      }));
    pages.push({ largeur: vp.width, hauteur: vp.height, items });
  }
  await Promise.resolve(doc.destroy?.()).catch(() => undefined);

  const geo = calculerGeo(pages);
  verifier('PDF réel : géométrie mesurée', geo !== null);
  if (!geo) return;
  console.log(`  corpus : ${total} pages, mesuré ${geo.largeur}×${geo.hauteur} pt, marge ${geo.margeGauche}`);

  const stockee = resumerGeo(geo);
  verifier('PDF réel : 3 nombres enregistrables', stockee !== null);
  if (!stockee) return;
  const relu = geoDepuisLivre({
    pdf_largeur: stockee.largeur,
    pdf_hauteur: stockee.hauteur,
    pdf_marge: stockee.margeEnBloc,
  });
  verifier('PDF réel : reconstruction identique', relu?.largeur === stockee.largeur && relu?.hauteur === stockee.hauteur && relu?.margeGauche === stockee.margeEnBloc, JSON.stringify(relu));

  // Export : le PDF traduit doit sortir aux dimensions des 3 nombres.
  const bytes = await genererPdfTraduit({
    titreLivre: 'Test géométrie',
    chapitres: [{ titre: 'Chapitre 1', texte: 'Un court paragraphe de contrôle pour la géométrie.' }],
    geo: relu ?? undefined,
  });
  const produit = await PDFDocument.load(bytes);
  const page = produit.getPage(0);
  verifier(
    'Export : page = largeur × hauteur stockées',
    Math.round(page.getWidth()) === stockee.largeur && Math.round(page.getHeight()) === stockee.hauteur,
    `${page.getWidth()}×${page.getHeight()} vs ${stockee.largeur}×${stockee.hauteur}`
  );
  verifier('Export : taille A4 par défaut ≠ corpus (garde-fou)', !(stockee.largeur === 595 && stockee.hauteur === 842));
}

async function principal() {
  testCalculerGeo();
  testAllerRetour();
  await testPdfReel();
  console.log(echecs === 0 ? '\nTout est vert.' : `\n${echecs} échec(s).`);
  process.exit(echecs === 0 ? 0 : 1);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});

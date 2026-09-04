// test-pdf-fidele.ts — T1 : validation du SYSTÈME pdf-fidele sur
// The Reaper (331 pages, images incluses).
//
// Le test utilise une traduction SIMULÉE (français, longueur ≈ 1.15×) :
// il valide la mécanique complète — scan, alignement exact,
// effacement, écoulement, débordement — sans dépendre du traducteur.
//
// Vérifications (critères adaptés à l'approche « recouvrement blanc ») :
//   1. Image page 43 : nombre strictement identique original → final.
//   2. Page 21 : le texte FR ajouté est extraisible (accents + mots
//      simulés) — l'EN sous-jacent reste dans la couche textuelle
//      (recouvrement visuel, pas de redaction native dans pdf-lib).
//   3. Page 1 (couverture) : texte strictement identique.
//   4. Rendus PNG avant/après des pages 21 et 43 pour validation
//      visuelle (texte FR visible, EN masqué, image intacte).
//
// Usage : npx tsx scripts/test-pdf-fidele.ts
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getDocument as pdfjsGetDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  genererPdfFidele,
  scannerPagesFideles,
  type PageSourceFidele,
} from '../lib/pdf-fidele';

const SOURCE =
  'C:/Users/dosso/AppData/Local/hermes/profiles/devotron/cache/documents/doc_7091958450d0__OceanofPDF.com_The_Reaper_-__RuNyx.pdf';

// ---------- Traduction simulée : français, longueur ≈ 1.15× ----------
const MOTS_FR = (
  'noir ombre nuit reaper mort éternel le vent froid mordait sa peau ' +
  'il marcha dans les ruelles vides une larme de sang coula le long de son cou ' +
  'la porte grinca dans le silence le souffle était un couteau ' +
  'rien ne survivait à la nuit les cendres portaient le nom de l’hiver ' +
  'une clarté blanche déchira le ciel le sol trembla sous ses pas ' +
  'elle murmura son nom en silence la mort était sa seule compagne ' +
  'le feu mourait dans le poêle les murs suintaient de givre'
)
  .split(/\s+/)
  .filter(Boolean);

function pseudoTraduit(longueurCible: number): string {
  let s = '';
  let i = 0;
  while (s.length < longueurCible) {
    const mot = MOTS_FR[i % MOTS_FR.length];
    s += (s === '' ? '' : ' ') + mot;
    i++;
    if (i % 14 === 0) s += i % 28 === 0 ? '.' : ' …';
  }
  return s.slice(0, longueurCible);
}

async function principal() {
  const t0 = Date.now();
  const secs = () =>
    ((Date.now() - t0) / 1000).toFixed(1).replace('.', ',') + ' s';
  const tmp = os.tmpdir();

  console.log('[1/6] Lecture de l’original…');
  const octets = new Uint8Array(fs.readFileSync(SOURCE));
  console.log(`    ${octets.length.toLocaleString('fr-FR')} octets`);

  console.log('[2/6] Scan pdf.js (331 pages)…');
  const doc = await pdfjsGetDocument({
    data: octets.slice(), // pdf.js consomme son buffer : copie dédiée
    disableFontFace: true,
  }).promise;
  const { pages, textes } = await scannerPagesFideles(
    doc,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: number, tot: number) => {
      if (p === 1 || p % 50 === 0 || p === tot)
        console.log(`    page ${p}/${tot}…`);
    }
  );
  // pdf.js libère ses ressources ; le type public n'expose pas
  // `destroy` (présent à l'exécution).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void (doc as any).destroy?.();
  console.log(`    ${pages.length} pages analysées en ${secs()}`);

  console.log('[3/6] Simulation d’une traduction (longueur ×1.15)…');
  const flux = textes.join('\n');
  const fr = pseudoTraduit(Math.round(flux.length * 1.15));
  console.log(
    `    flux ${flux.length.toLocaleString('fr-FR')} → fr ${fr.length.toLocaleString('fr-FR')} car en ${secs()}`
  );

  console.log('[4/6] Génération du PDF fidèle…');
  const t4 = Date.now();
  const {
    octets: out,
    nbPages,
    pagesRemplacees,
    pagesIntactes,
    pagesAjoutees,
  } = await genererPdfFidele({
    octets,
    pages: pages as PageSourceFidele[],
    textesPages: textes,
    chapitres: [{ titre: 'Test', texte_source: flux, texte_traduit: fr }],
  });
  const genSecs = ((Date.now() - t4) / 1000).toFixed(1).replace('.', ',');
  console.log(`    généré en ${genSecs} s`);

  const sortie = path.join(tmp, 'reaper-fidele-test.pdf');
  fs.writeFileSync(sortie, out);
  console.log(
    `[5/6] pages ${nbPages} (${pagesRemplacees} remplaces, ${pagesIntactes} intactes, ${pagesAjoutees} ajoutees) → ${sortie}`
  );

  console.log('[6/6] Vérification indépendante (PyMuPDF)…');
  const { execFileSync } = await import('node:child_process');
  const py = 'C:/Users/dosso/dev/lt-venv/Scripts/python.exe';
  const script = `
import sys
import fitz
src = fitz.open(${JSON.stringify(SOURCE)})
dst = fitz.open(${JSON.stringify(sortie)})
tmp = ${JSON.stringify(tmp)}
ok = True

# 1. Image page 43 (page index 42) conservees
img_src = len(src[42].get_images())
img_dst = len(dst[42].get_images())
print('images page43 : src=%d dst=%d' % (img_src, img_dst))
ok = ok and (img_src > 0) and (img_src == img_dst)

# 2. Page 21 : texte FR ajoute present dans l'extraction
t_dst = dst[20].get_text().lower()
accents = [c for c in t_dst if c in 'àâäéèêëîïôöùûüçœ']
mots_fr = [m for m in ['ombre', 'nuit', 'reaper', 'eternel', 'froid', 'clarte', 'compagne'] if m in t_dst]
print('page21 : accents FR %d, mots FR simules %d' % (len(accents), len(mots_fr)))
ok = ok and len(accents) > 10 and len(mots_fr) >= 3

# 3. Page 1 (couverture) : texte strictement identique
t1s = src[0].get_text('text').strip()
t1d = dst[0].get_text('text').strip()
print('page1 : src %d car, dst %d car -> %s' % (len(t1s), len(t1d), 'OK' if t1s == t1d else 'DIFFERE'))
ok = ok and t1s == t1d

# 4. Rendus PNG avant/après pour validation visuelle
mat = fitz.Matrix(2, 2)
for idx, nom in ((20, 'p21'), (42, 'p43')):
    src[idx].get_pixmap(matrix=mat).save(tmp + '/avant-' + nom + '.png')
    dst[idx].get_pixmap(matrix=mat).save(tmp + '/apres-' + nom + '.png')
print('rendus PNG : OK')

print('VERDICT : %s' % ('PASS' if ok else 'FAIL'))
sys.exit(0 if ok else 1)
`;
  try {
    execFileSync(py, ['-c', script], { stdio: 'inherit' });
  } catch (e) {
    console.error('❌ Vérification échouée');
    process.exit(1);
  }
  console.log(`\n✅ T1 PASS — système validé en ${secs()}`);
}

principal().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
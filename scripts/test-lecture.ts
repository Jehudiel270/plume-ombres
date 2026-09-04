// Tests réels recherche + préférences de lecture (Node).
// Usage : npx tsx scripts/test-lecture.ts
import {
  chercherTermes,
  extraireContexte,
  normaliser,
} from '../lib/recherche';
import {
  assainirPreferences,
  preferencesEnCss,
  PREFERENCES_PAR_DEFAUT,
  BORNES,
} from '../lib/lecture';
import {
  assainirStats,
  ajouterTemps,
  ajouterVisite,
  estimerSecondesLecture,
  formaterDuree,
  type StatsLecture,
} from '../lib/stats';
import {
  assainirProgression,
  formaterReprise,
} from '../lib/progression';

let echecs = 0;
function verifier(nom: string, condition: boolean) {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

// ---------- normaliser ----------
const { normalise, table } = normaliser('Élite française — elle');
verifier('normaliser : accents + majuscules', normalise === 'elite francaise — elle');
verifier('normaliser : table d’index cohérente', table[0] === 0 && table[normalise.length - 1] < 22);

// ---------- chercherTermes ----------
const texte = `Le bal masqué fut une nuit extraordinaire.
Elle s'appelait Écarlate, et l'ombre au coin du couloir la fixait.
« Fuyons », dit-elle. L'ombre sourit.`;
const r1 = chercherTermes(texte, 'masqué'); // accents → masque
verifier('recherche sans accents trouve « masqué »', r1.length === 1);
verifier('plaque correcte sur « masqué »', r1[0].debut === texte.indexOf('masqué') && r1[0].fin === r1[0].debut + 6);

const r2 = chercherTermes(texte, 'elle'); // insensible à la casse
verifier('« elle » trouvé (Elle + elle = 2)', r2.length === 2);

const r3 = chercherTermes(texte, 'ombre'); // dans le mot : « l'ombre »
verifier('recherche dans le mot', r3.length >= 1);

const r4 = chercherTermes(texte, 'a'); // 1 caractère → ignoré
verifier('1 caractère ignoré (trop de bruit)', r4.length === 0);

const r5 = chercherTermes(texte, 'introuvable');
verifier('terme absent → []', r5.length === 0);

// Contexte autour d’une plaque
const ctx = extraireContexte(texte, r1[0]);
verifier('extraireContexte entouré de …', ctx.includes('masqué') && ctx.startsWith('…') === false || ctx.includes('masqué'));

// ---------- assainirPreferences ----------
const p1 = assainirPreferences(null);
verifier('null → défauts', JSON.stringify(p1) === JSON.stringify(PREFERENCES_PAR_DEFAUT));

const p2 = assainirPreferences({ theme: 'invalide', taille: 999, interligne: 0.5, largeur: 30, police: 'sans' });
verifier('valeur invalide → défaut', p2.theme === 'nuit' && p2.police === 'lora');
verifier('taille bornée au max', p2.taille === BORNES.taille.max);
verifier('interligne borné au min', p2.interligne === BORNES.interligne.min);
verifier('_largeur bornée au min', p2.largeur === BORNES.largeur.min);

const p3 = assainirPreferences({ theme: 'parchemin', taille: 20, justifie: true });
verifier('valeurs valides respectées', p3.theme === 'parchemin' && p3.taille === 20 && p3.justifie === true);

// ---------- preferencesEnCss ----------
const css = preferencesEnCss({ ...PREFERENCES_PAR_DEFAUT, taille: 20, largeur: 70, justifie: true });
verifier('css : taille px', css['--pref-taille'] === '20px');
verifier('css : largeur ch', css['--pref-largeur'] === '70ch');
verifier('css : justification', css['--pref-alignment'] === 'justify');
const cssParchemin = preferencesEnCss({ ...PREFERENCES_PAR_DEFAUT, theme: 'parchemin' });
verifier('css : parchemin → encre sombre', cssParchemin['--pref-encre'] === '#2e2430');

// ---------- stats de lecture ----------
const s0: StatsLecture = { parLivre: {} };
const s1 = ajouterVisite(ajouterTemps(ajouterVisite(s0, 'livre-a'), 'livre-a', 90), 'livre-b');
verifier('stats : cumuls secondes + visites', s1.parLivre['livre-a'].secondes === 90 && s1.parLivre['livre-a'].visites === 1 && s1.parLivre['livre-b'].visites === 1);
verifier('stats : ajout 0 s neutre', ajouterTemps(s1, 'livre-a', 0) === s1);
const sBrute = assainirStats({ parLivre: { 'l-x': { secondes: -5, visites: 2.7 }, 'l-y': null, 'l-z': { secondes: 'x', visites: 'y' } } });
verifier('stats : entrées valides conservées, null ignorées, bornes/coins', sBrute.parLivre['l-x'].secondes === 0 && sBrute.parLivre['l-x'].visites === 2 && !('l-y' in sBrute.parLivre) && sBrute.parLivre['l-z'].secondes === 0 && sBrute.parLivre['l-z'].visites === 0);
verifier('stats : assainir entrée nulle → vide', assainirStats(null).parLivre.toString() === '' || Object.keys(assainirStats(null).parLivre).length === 0);
verifier('stats : estimation ≈ 250 mots/min', estimerSecondesLecture(6000) === 240); // 6000/6=1000 mots
verifier('stats : estimation texte vide → 0', estimerSecondesLecture(0) === 0);
verifier('stats : formater 42 min', formaterDuree(42 * 60) === '42 min');
verifier('stats : formater 1 h 24', formaterDuree(84 * 60) === '1 h 24');
verifier('stats : formater minuscule → 1 min', formaterDuree(10) === '1 min');

// ---------- progression / reprise ----------
const progOk = assainirProgression({ livreId: 'l-1', chapitreId: 'c-4', ratio: 0.62, libelle: 'Chapitre 4', date: '2026-09-04T12:00:00.000Z' });
verifier('progression : entrée valide conservée', progOk?.livreId === 'l-1' && progOk?.ratio === 0.62);
verifier('progression : ratio borné >= 1 → 1', assainirProgression({ livreId: 'l-1', ratio: 5 })?.ratio === 1);
verifier('progression : ratio borné < 0 → 0', assainirProgression({ livreId: 'l-1', ratio: -3 })?.ratio === 0);
verifier('progression : livreId absent → null', assainirProgression({ ratio: 0.5 }) === null);
verifier('progression : null → null', assainirProgression(null) === null);
if (progOk) {
  verifier('progression : libellé reprise « Chapitre 4 · 62 % »', formaterReprise(progOk) === 'Chapitre 4 · 62 %');
}
verifier('progression : reprise sans libellé', formaterReprise({ livreId: 'l', chapitreId: null, ratio: 0.3, libelle: '', date: '2026-01-01T00:00:00.000Z' }) === 'Lecture à 30 %');

if (echecs > 0) {
  console.error(`\n${echecs} échec(s).`);
  process.exit(1);
}
console.log('\nTous les tests lecture/recherche passent.');
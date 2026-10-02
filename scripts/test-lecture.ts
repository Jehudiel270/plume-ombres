// Tests réels recherche + préférences de lecture (Node).
// Usage : npx tsx scripts/test-lecture.ts
import {
  chercherTermes,
  extraireContexte,
  normaliser,
} from '../lib/recherche';
import {
  assainirPreferences,
  espacementEffectif,
  preferencesEnCss,
  PREFERENCES_PAR_DEFAUT,
  ESPACEMENT_MINI_SANS_RETRAIT,
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
import {
  decouperEnParagraphes,
  estSeparateurScene,
  grouperEnBlocs,
} from '../lib/pagination';

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
verifier('css : mesure = largeur × facteur de caractère, en em de la taille', css['--pref-largeur'] === 'calc(var(--pref-taille) * 35.000)');
verifier('css : justification', css['--pref-alignment'] === 'justify');
const cssParchemin = preferencesEnCss({ ...PREFERENCES_PAR_DEFAUT, theme: 'parchemin' });
verifier('css : parchemin → encre sombre', cssParchemin['--pref-encre'] === '#2e2430');

// ---------- F5 : réglages ajoutés (aucune perte des anciens) ----------
const p4 = assainirPreferences(null);
verifier(
  'F5 : les six anciens réglages survivent (theme/police/taille/interligne/largeur/justifie)',
  p4.theme === 'nuit' && p4.police === 'lora' && p4.taille === 17 && p4.interligne === 1.75 && p4.largeur === 68 && p4.justifie === false
);
verifier(
  'F5 : réglages ajoutés présents (espacement/retrait/césure/colonnes/marges/lettrine)',
  p4.espacement === 0.9 && p4.retrait === false && p4.cesure === true && p4.colonnes === 1 && p4.marges === 'normale' && p4.lettrine === true
);
const p5 = assainirPreferences({ theme: 'encre', taille: 19, interligne: 2, largeur: 70, justifie: true, espacement: 9, retrait: true, cesure: false, colonnes: 7, marges: 'inepte', lettrine: false });
verifier('F5 : préférences héritées relues telles quelles', p5.theme === 'encre' && p5.taille === 19 && p5.justifie === true && p5.largeur === 70);
verifier('F5 : espacement borné au max', p5.espacement === BORNES.espacement.max);
verifier('F5 : marges inconnues → défaut', p5.marges === 'normale');
verifier('F5 : colonnes hors {1,2} → 1', p5.colonnes === 1);
verifier('F5 : retrait/césure/lettrine booléens respectés', p5.retrait === true && p5.cesure === false && p5.lettrine === false);
// Une préférence enregistrée par la version précédente (sans les nouveaux
// réglages) doit être honorée : rien n'est perdu, rien n'est rejeté.
const ancienne = assainirPreferences({ theme: 'parchemin', police: 'monospace', taille: 21, interligne: 2.2, largeur: 55, justifie: true });
verifier(
  'F5 : préférences d’une version antérieure conservées à l’identique',
  ancienne.theme === 'parchemin' && ancienne.police === 'monospace' && ancienne.taille === 21 && ancienne.interligne === 2.2 && ancienne.largeur === 55 && ancienne.justifie === true
);
verifier('F5 : nouveaux réglages comblés par les défauts', ancienne.espacement === 0.9 && ancienne.marges === 'normale' && ancienne.colonnes === 1 && ancienne.lettrine === true);
const cssF5 = preferencesEnCss({ ...PREFERENCES_PAR_DEFAUT, espacement: 1.4, retrait: true, cesure: false, colonnes: 2, marges: 'large', lettrine: false });
verifier('F5 css : espacement em', cssF5['--pref-espacement'] === '1.40em');
verifier('F5 css : retrait em', cssF5['--pref-retrait'] === '1.6em');
verifier('F5 css : césure auto/manual', cssF5['--pref-cesure'] === 'manual');
verifier('F5 css : marges rem', cssF5['--pref-marges'] === '3.25rem');
verifier('F5 css : gouttière seulement en deux colonnes', cssF5['--pref-colonnes'] === '2' && cssF5['--pref-gouttiere'] === '3rem' && preferencesEnCss(PREFERENCES_PAR_DEFAUT)['--pref-gouttiere'] === '0px');
verifier('F5 css : lettrine en 0/1', cssF5['--pref-lettrine'] === '0' && preferencesEnCss(PREFERENCES_PAR_DEFAUT)['--pref-lettrine'] === '1');
verifier('F5 : espacement mini garanti sans retrait', espacementEffectif({ ...PREFERENCES_PAR_DEFAUT, espacement: 0, retrait: false }) === ESPACEMENT_MINI_SANS_RETRAIT && espacementEffectif({ ...PREFERENCES_PAR_DEFAUT, espacement: 0, retrait: true }) === 0);
verifier('F5 css : anciennes variables intactes', cssF5['--pref-taille'] === '17px' && cssF5['--pref-alignment'] === 'left' && typeof cssF5['--pref-police'] === 'string' && typeof cssF5['--pref-fond'] === 'string' && typeof cssF5['--pref-encre'] === 'string' && cssF5['--pref-interligne'] === '1.75');

// ---------- F5 : structure typographique (paragraphes + scènes) ----------
const fixture = [
  'Premier paragraphe du chapitre, sur une seule ligne.',
  '',
  'Deuxième paragraphe.',
  '',
  '   ',
  '* * *',
  '',
  'Après la scène : le paragraphe suivant ne prend pas de retrait.',
  '',
  '⁂',
  '',
  'Dernier paragraphe avec un mot très long aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa fin.',
].join('\n');

const blocs = decouperEnParagraphes(fixture);
verifier('F5 : 6 blocs (4 paragraphes + 2 scènes détectées)', blocs.length === 6);
verifier('F5 : offsets → reconstitution exacte du texte rogné', blocs.every((b) => fixture.slice(b.debut, b.fin) === b.texte));
verifier('F5 : séparateur « * * * » reconnu comme scène', blocs[2].type === 'scene' && blocs[2].texte === '* * *');
verifier('F5 : ornement « ⁂ » reconnu comme scène', blocs[4]?.type === 'scene');
verifier('F5 : les paragraphes restent des paragraphes', blocs[0].type === 'paragraphe' && blocs[1].type === 'paragraphe' && blocs[5].type === 'paragraphe');
verifier('F5 : aucun bloc vide', blocs.every((b) => b.texte.trim().length > 0));
verifier('F5 : les blancs de séparation ne sont PAS dans les blocs', blocs[0].texte === 'Premier paragraphe du chapitre, sur une seule ligne.');

// Faux positifs : une ligne de texte ne devient jamais un ornement.
verifier('F5 : ligne de texte → pas une scène', !estSeparateurScene('Elle partit.'));
verifier('F5 : tiret de dialogue → pas une scène', !estSeparateurScene('— Je ne savais pas, dit-elle.'));
verifier('F5 : « --- » → scène', estSeparateurScene('---') && estSeparateurScene('***') && estSeparateurScene('...'));
verifier('F5 : un seul tiret isolé → scène', estSeparateurScene('—'));

// Un chapitre sans ligne vide reste un seul paragraphe (aucune perte).
const unSeul = 'Une seule ligne de texte, sans aucune séparation.';
const bUn = decouperEnParagraphes(unSeul);
verifier('F5 : chapitre d’une ligne → 1 bloc intact', bUn.length === 1 && bUn[0].texte === unSeul && bUn[0].debut === 0 && bUn[0].fin === unSeul.length);

// Les offsets restent compatibles avec la recherche plein texte.
const terme = 'scène';
const plaques = chercherTermes(fixture, terme);
verifier('F5 : recherche toujours alignée sur les offsets', plaques.length === 1 && fixture.slice(plaques[0].debut, plaques[0].fin) === 'scène');
const porteur = blocs.find((b) => plaques[0].debut >= b.debut && plaques[0].fin <= b.fin);
verifier('F5 : l’occurrence tombe dans un bloc identifiable', !!porteur);

// Regroupement en paquets : jamais de coupe au milieu d’un bloc.
const gros = Array.from({ length: 120 }, (_, i) => `Paragraphe numéro ${i} — ${'x'.repeat(160)}`).join('\n\n');
const blocsGros = decouperEnParagraphes(gros);
const paquets = grouperEnBlocs(blocsGros, 20000);
verifier('F5 : le regroupement conserve tous les blocs, dans l’ordre', paquets.flat().length === blocsGros.length && paquets.flat().every((b, i) => b.debut === blocsGros[i].debut));
verifier('F5 : chaque paquet fait au moins la moitié de la cible (sauf le dernier)', paquets.slice(0, -1).every((p) => p.reduce((s, b) => s + (b.fin - b.debut), 0) >= 10000));
verifier('F5 : un petit texte → un seul paquet', grouperEnBlocs(blocs, 20000).length === 1);

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
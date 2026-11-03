// Génère et insère le bloc « transition de palette » dans app/globals.css.
// Idempotent : ne réinsère pas si le marqueur est déjà présent.
const fs = require('fs');

const CHEMIN = 'app/globals.css';
let css = fs.readFileSync(CHEMIN, 'utf8');

const MARQUEUR = '/* ----- Transition de palette (généré : tokens officiels) ----- */';
if (css.includes(MARQUEUR)) {
  console.log('bloc déjà présent, rien à faire');
  process.exit(0);
}

// Source de vérité = le bloc de la palette par défaut (brume).
const bloc = css.match(/html\[data-palette='brume'\]\s*\{([\s\S]*?)\}/);
if (!bloc) throw new Error('palette brume introuvable');

const paires = [...bloc[1].matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)].map(
  (m) => [m[1], m[2]]
);
if (paires.length < 20) throw new Error('tokens inattendus : ' + paires.length);

const registered = paires
  .map(
    ([nom, valeur]) =>
      `@property ${nom} {\n  syntax: '<color>';\n  inherits: true;\n  initial-value: ${valeur};\n}`
  )
  .join('\n');

const liste = paires.map(([nom]) => `${nom} 520ms var(--courbe)`).join(',\n    ');

const blocCss = `${MARQUEUR}
/* Les 18 palettes ne posent que des variables CSS : sans enregistrement,
   elles basculent d'un coup et l'écran « flashe ». @property déclare les
   jetons comme des couleurs INTERPOLABLES ; la transition posée sur <html>
   fait alors dérouler la valeur, que les descendants héritent image par
   image. Aucun JS, aucun coût au repos, et les utilitaires Tailwind
   (bg-nuit-800, text-grenat-400…) en profitent sans modification. */
${registered}

/* Coupée si l'utilisateur demande moins de mouvement, ou si l'appareil
   est en économie de données (html[data-economie="1"]). */
html {
  transition:
    ${liste};
}
@media (prefers-reduced-motion: reduce) {
  html {
    transition: none;
  }
}
html[data-economie='1'] {
  transition: none;
}

/* ----- Transitions légères d'état (survol, focus, changement de couleur) ----- */
/* Un seul tempo pour tout le site : les éléments qui portent DÉJÀ leur
   propre transition (utilitaires Tailwind, .carte-livre, .fond-ambiance…)
   ne sont pas touchés : leurs classes sont plus spécifiques. */
a:not(.carte-livre),
button:not(.carte-livre),
summary,
input,
select,
textarea,
.velours,
.lien-discret,
.champ {
  transition-property: color, background-color, border-color, box-shadow,
    outline-color, fill, stroke, text-decoration-color;
  transition-duration: 220ms;
  transition-timing-function: var(--courbe);
}
@media (prefers-reduced-motion: reduce) {
  a:not(.carte-livre),
  button:not(.carte-livre),
  summary,
  input,
  select,
  textarea,
  .velours,
  .lien-discret,
  .champ {
    transition-duration: 1ms;
  }
}

`;

// CRLF : on repère l'en-tête du bloc PALETTES puis on remonte au début
// de son commentaire.
const iTitre = css.indexOf('PALETTES — chaque bloc');
if (iTitre < 0) throw new Error('en-tête PALETTES introuvable');
const iAncre = css.lastIndexOf('/* ===', iTitre);
if (iAncre < 0) throw new Error('ancre de commentaire introuvable');
css = css.slice(0, iAncre) + blocCss + css.slice(iAncre);
fs.writeFileSync(CHEMIN, css);
console.log('inséré :', paires.length, 'tokens, +' + blocCss.length + ' octets');

// ============================================================
// Preuve de RENDU — le bandeau de complément de crédits produit bien
// un DOM (HTML) réel côté serveur, avec la taille du livre, le déficit
// et le complément au prorata.
// Usage : npx tsx scripts/probe-rendu-bandeau.ts
//
// PUREMENT LOCAL : rendu React côté serveur (renderToStaticMarkup),
// aucune base, aucun réseau, aucune écriture en base. Le HTML produit
// est écrit dans .tmp-rendu-bandeau.html (jetable) pour inspection.
// ============================================================

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { packsCredits } from '../lib/abonnement';
import { calculerComplement } from '../lib/credits-manquants';
import ComplementCreditsBandeau from '../components/ComplementCredits';

let echecs = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

function rendre(html: string) {
  return html.replace(/\s+/g, ' ').trim();
}

// Cas cible : livre 600 000 car., solde 580 000 → il manque 20 000.
const complement = calculerComplement(
  600000,
  { quotaRestant: 580000, credits: 0 },
  packsCredits()
);

const html = rendre(
  renderToStaticMarkup(
    createElement(ComplementCreditsBandeau, { complement })
  )
);
const chemin = join(__dirname, '..', '.tmp-rendu-bandeau.html');
writeFileSync(chemin, html, 'utf8');

console.log('— DOM produit (extrait) —');
console.log(html.slice(0, 900));
console.log('…');
console.log(`\n· HTML complet écrit : ${chemin} (${html.length} caractères)`);

verifier(
  'R.1 : la taille du livre est affichée AVANT la traduction',
  html.includes('Taille du livre') && html.includes('600 000 caractères')
);
verifier(
  'R.2 : le déficit est affiché',
  html.includes('Il vous manque') && html.includes('20 000 caractères')
);
verifier(
  'R.3 : le pack le plus juste est proposé (Pack Découverte)',
  html.includes('Pack Découverte') && html.includes('250 000 caractères')
);
verifier(
  'R.4 : le complément au prorata + la réduction sont affichés',
  html.includes('100 F CFA') && html.includes('400 F CFA') && html.includes('−80 %')
);
verifier(
  'R.5 : le lien d’achat pointe sur le tunnel du pack',
  html.includes('href="/paiement/credits_250"')
);
verifier(
  'R.6 : le message clair est rendu',
  html.includes('le complément au prorata vous revient')
);

// Le bandeau ne rend RIEN quand le solde suffit.
const complet = calculerComplement(600000, { quotaRestant: 900000, credits: 0 }, packsCredits());
const html2 = renderToStaticMarkup(
  createElement(ComplementCreditsBandeau, { complement: complet })
);
verifier('R.7 : aucun bandeau quand le solde couvre déjà le livre', html2 === '', html2);

console.log(
  `\n${echecs === 0 ? '✓ DOM CONFORME' : `✗ ${echecs} ÉCHEC(S)`}`
);
process.exit(echecs === 0 ? 0 : 1);

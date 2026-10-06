// Contraste WCAG RÉEL des couleurs utilisées par le panneau admin,
// calculé sur les jetons de app/globals.css (aucune valeur estimée).
import { readFileSync } from 'node:fs';

const css = readFileSync('app/globals.css', 'utf8');

function lireBloc(regex) {
  const m = css.match(regex);
  if (!m) return null;
  const jetons = {};
  for (const x of m[1].matchAll(/--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) {
    jetons[x[1]] = x[2].toLowerCase();
  }
  return jetons;
}

const palettes = { 'defaut (brume)': lireBloc(/:root\s*\{([^}]*)\}/s) };
for (const m of css.matchAll(/html\[data-palette=['"]([a-z0-9-]+)['"]\]\s*\{([^}]*)\}/gsi)) {
  const jetons = {};
  for (const x of m[2].matchAll(/--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) {
    jetons[x[1]] = x[2].toLowerCase();
  }
  palettes[m[1]] = { ...palettes['defaut (brume)'], ...jetons };
}

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Paires réellement employées dans components/admin/* et app/admin/page.tsx.
const PAIRES = [
  ['encre-100', 'nuit-800', 'textes principaux / carte velours'],
  ['encre-100', 'nuit-850', 'textes principaux / pastille'],
  ['encre-300', 'nuit-800', 'textes secondaires / carte velours'],
  ['encre-500', 'nuit-800', 'libellés, notes / carte velours'],
  ['encre-500', 'nuit-950', 'notes / fond de page'],
  ['grenat-300', 'nuit-800', 'messages d’erreur / carte'],
  ['grenat-400', 'nuit-950', 'sur-titre Administration / fond'],
  ['violet-rom-300', 'nuit-800', 'abonnement actif / carte'],
  ['encre-100', 'nuit-950', 'texte / fond de page'],
];

let min = Infinity;
let echecs = 0;
for (const [nom, jetons] of Object.entries(palettes)) {
  if (!jetons) continue;
  console.log(`\n■ ${nom}`);
  for (const [a, b, usage] of PAIRES) {
    const ca = jetons[a];
    const cb = jetons[b];
    if (!ca || !cb) continue;
    const r = ratio(ca, cb);
    min = Math.min(min, r);
    const ok = r >= 4.5;
    if (!ok) echecs += 1;
    console.log(`  ${ok ? 'OK ' : 'KO '} ${r.toFixed(2)}:1  ${a} sur ${b} — ${usage}`);
  }
}
console.log(`\nMinimum observé : ${min.toFixed(2)}:1 ; échecs AA : ${echecs}`);

#!/usr/bin/env node
// ============================================================
// verifier-contraste.mjs — Contrôle AA des palettes.
//
// Lit RÉELLEMENT les valeurs d'app/globals.css (blocs
// html[data-palette="…"]) et calcule le ratio de contraste WCAG
// de chaque paire de texte. Aucune valeur « estimée ».
//
//   node scripts/verifier-contraste.mjs
//
// Sortie : tableau par palette + bilan. Code 1 si un contrôle
// échoue (utilisable en CI).
// ============================================================

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(racine, 'app', 'globals.css'), 'utf8');

/** Extrait les jetons --color-* d'un bloc html[data-palette="X"]. */
function lirePalette(id) {
  const re = new RegExp(
    `html\\[data-palette='${id}'\\]\\s*\\{([^}]*)\\}`,
    's',
  );
  const bloc = css.match(re);
  if (!bloc) throw new Error(`Bloc de palette introuvable : ${id}`);
  const jetons = {};
  for (const m of bloc[1].matchAll(/--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) {
    jetons[m[1]] = m[2].toLowerCase();
  }
  return jetons;
}

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Luminance relative WCAG 2.x. */
function luminance(h) {
  const canaux = hex(h).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * canaux[0] + 0.7152 * canaux[1] + 0.0722 * canaux[2];
}

/** Ratio de contraste (1 → 21). */
function contraste(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const clair = Math.max(la, lb);
  const sombre = Math.min(la, lb);
  return (clair + 0.05) / (sombre + 0.05);
}

const PALETTES = ['brume', 'orage', 'encre', 'sangOr', 'claire'];

// Paires contrôlées : [libellé, jeton avant, jeton arrière, seuil]
const PAIRES = [
  ['texte / fond', 'encre-100', 'nuit-950', 4.5],
  ['texte doux / fond', 'encre-300', 'nuit-950', 4.5],
  ['texte discret / fond', 'encre-500', 'nuit-950', 4.5],
  ['texte / surface', 'encre-100', 'nuit-800', 4.5],
  ['texte discret / surface', 'encre-500', 'nuit-800', 4.5],
  ['texte / lecteur', 'encre-100', 'nuit-900', 4.5],
  ['accent texte / fond', 'grenat-400', 'nuit-950', 4.5],
  ['accent texte / surface', 'grenat-400', 'nuit-800', 4.5],
  ['titre accent / fond', 'grenat-300', 'nuit-950', 4.5],
  ['bouton : blanc / stop 1', 'sur-accent', 'bouton-1', 4.5],
  ['bouton : blanc / stop 2', 'sur-accent', 'bouton-2', 4.5],
  ['bouton : blanc / stop 3', 'sur-accent', 'bouton-3', 4.5],
];

let echecs = 0;
let controles = 0;

console.log('Contrôle AA — valeurs lues dans app/globals.css\n');
for (const id of PALETTES) {
  const p = lirePalette(id);
  console.log(`■ ${id}`);
  for (const [libelle, avant, arriere, seuil] of PAIRES) {
    const a = p[avant];
    const b = p[arriere];
    if (!a || !b) {
      console.log(`   ⚠ ${libelle} : jeton manquant (${avant}=${a} ${arriere}=${b})`);
      echecs++;
      continue;
    }
    const r = contraste(a, b);
    const ok = r >= seuil;
    controles++;
    if (!ok) echecs++;
    console.log(
      `   ${ok ? 'OK ' : 'ÉCHEC'} ${libelle.padEnd(24)} ${r.toFixed(2)}:1 (min ${seuil}) — ${a} sur ${b}`,
    );
  }
  console.log('');
}

console.log(
  `Bilan : ${controles - echecs}/${controles} paires ≥ AA, ${echecs} échec(s).`,
);
process.exit(echecs > 0 ? 1 : 0);

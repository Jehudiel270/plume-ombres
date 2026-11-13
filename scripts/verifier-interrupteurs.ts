// ============================================================
// scripts/verifier-interrupteurs.ts — Garde-fou du registre.
//
// Portage React/Next de scripts/check-flags.mjs (maquette) : chaque
// page et chaque route d'API du projet doit être soit derrière un
// interrupteur (lib/fonctionnalites/registre.ts), soit dans le socle
// (ITINERAIRES_SOCLE), soit réservée aux administrateurs
// (ITINERAIRES_ADMIN). Échoue sinon.
//
// Usage : npm run check:flags
// ============================================================

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INTERRUPTEURS,
  ITINERAIRES_ADMIN,
  ITINERAIRES_SOCLE,
  estCheminAdmin,
  estCheminSocle,
  interrupteurPourChemin,
} from '../lib/fonctionnalites/registre';

const racine = fileURLToPath(new URL('..', import.meta.url));

function parcourir(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? parcourir(chemin) : [chemin];
  });
}

/** app/livres/[id]/page.tsx → /livres/x (les groupes (…) sont ignorés). */
function itinerairePage(fichier: string): string {
  const segments = relative(join(racine, 'app'), fichier)
    .split(sep)
    .filter((s) => s !== '' && !/^\(.*\)$/.test(s));
  segments.pop(); // page.tsx
  return '/' + segments.map((s) => (/^\[.+\]$/.test(s) ? 'x' : s)).join('/');
}

/** app/api/paiement/webhook/route.ts → /api/paiement/webhook */
function itineraireApi(fichier: string): string {
  const segments = relative(join(racine, 'app'), fichier)
    .split(sep)
    .filter((s) => s !== '' && !/^\(.*\)$/.test(s));
  segments.pop(); // route.ts(x)
  return '/' + segments.map((s) => (/^\[.+\]$/.test(s) ? 'x' : s)).join('/');
}

const erreurs: string[] = [];

function verifier(itineraire: string, genre: 'page' | 'api'): void {
  const portee = genre === 'api' ? 'api' : 'pages';
  const couvert =
    Boolean(interrupteurPourChemin(itineraire, portee)) ||
    estCheminSocle(itineraire) ||
    estCheminAdmin(itineraire);
  if (!couvert) {
    erreurs.push(`${genre} ${itineraire}`);
  }
}

const pages = parcourir(join(racine, 'app')).filter(
  (f) => /page\.(tsx|ts)$/.test(f) && !f.includes(`${sep}fonts${sep}`)
);
const routes = parcourir(join(racine, 'app')).filter((f) => /route\.(tsx|ts)$/.test(f));

for (const f of pages) verifier(itinerairePage(f), 'page');
for (const f of routes) verifier(itineraireApi(f), 'api');

// --- Santé du registre lui-même ---
const doublons = INTERRUPTEURS.map((i) => i.cle).filter(
  (c, i, a) => a.indexOf(c) !== i
);
if (doublons.length) erreurs.push(`clés en double : ${doublons.join(', ')}`);

for (const def of INTERRUPTEURS) {
  if (def.risqueJuridique && def.prod) {
    erreurs.push(`interrupteur à risque juridique activé par défaut : ${def.cle}`);
  }
  if (
    def.itineraires.length === 0 &&
    def.api.length === 0 &&
    !def.sansItineraire
  ) {
    erreurs.push(`interrupteur sans effet (ni itinéraire, ni API, ni justification) : ${def.cle}`);
  }
  if (def.sansItineraire && (def.itineraires.length > 0 || def.api.length > 0)) {
    erreurs.push(`justification sansItineraire inutile (itinéraires déclarés) : ${def.cle}`);
  }
}

// Chaque itinéraire d'interrupteur doit pointer vers une zone non-socle
// (sinon la barrière du socle et l'interrupteur se marchent dessus).
for (const socle of ITINERAIRES_SOCLE) {
  const ss = socle.split('/').filter(Boolean);
  for (const def of INTERRUPTEURS) {
    for (const motif of [...def.itineraires, ...def.api]) {
      const ms = motif.split('/').filter(Boolean);
      const identique = ms.length > 0 && ms.length === ss.length && ms.every((s, i) => s === ss[i]);
      if (identique) {
        erreurs.push(`${motif} (${def.cle}) fait doublon avec l'itinéraire du socle ${socle}`);
      }
    }
  }
}

// Les itinéraires admin restent hors des interrupteurs.
for (const admin of ITINERAIRES_ADMIN) {
  if (interrupteurPourChemin(admin, 'pages') || interrupteurPourChemin(admin, 'api')) {
    erreurs.push(`itinéraire admin couvert par un interrupteur : ${admin}`);
  }
}

if (erreurs.length) {
  console.error(
    'Itinéraires non déclarés ou invalides :\n - ' +
      erreurs.join('\n - ') +
      '\nDéclarez-les dans lib/fonctionnalites/registre.ts (INTERRUPTEURS ou ITINERAIRES_SOCLE).'
  );
  process.exit(1);
}

console.log(
  `OK : ${INTERRUPTEURS.length} interrupteurs, ${pages.length} pages et ${routes.length} routes d'API toutes couvertes (interrupteur, socle ou admin).`
);

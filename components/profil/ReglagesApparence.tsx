'use client';

// Carte « Apparence » du profil (/compte).
//
// Contrat d'interface : le bouton n'ouvre PAS de composant en propre — il
// diffuse l'événement `plume:ouvrir-apparence`. C'est le panneau d'apparence
// global (fourni par une autre branche) qui l'écoute et s'ouvre. Cette page
// n'importe donc aucun composant d'apparence.
//
// La palette et la typographie courantes sont lues dans localStorage
// (source de vérité de lib/theme.ts) pour afficher l'état réel.

import { useSyncExternalStore } from 'react';
import {
  assainirPalette,
  assainirTypo,
  CLEF_PALETTE,
  CLEF_TYPO,
  lirePreference,
  PALETTES,
  TYPOS,
  type PaletteId,
  type TypoId,
} from '@/lib/theme';

// Lecture de localStorage via un « store externe » : pas de setState dans
// un effet (règle react-hooks/set-state-in-effect), pas de décalage
// d'hydratation — le serveur rend null, le client lit la valeur réelle.
const AUCUN_ABONNEMENT = () => () => undefined;
const lirePalette = () => assainirPalette(lirePreference(CLEF_PALETTE));
const lireTypo = () => assainirTypo(lirePreference(CLEF_TYPO));
const palettesServeur = (): null => null;

export default function ReglagesApparence() {
  const palette = useSyncExternalStore<PaletteId | null>(
    AUCUN_ABONNEMENT,
    lirePalette,
    palettesServeur
  );
  const typo = useSyncExternalStore<TypoId | null>(
    AUCUN_ABONNEMENT,
    lireTypo,
    palettesServeur
  );

  function ouvrir() {
    window.dispatchEvent(new CustomEvent('plume:ouvrir-apparence'));
  }

  return (
    <section className="velours p-6" aria-label="Apparence">
      <p className="sur-titre text-encre-300">Apparence</p>

      <p className="text-encre-300 text-sm mt-4 leading-relaxed">
        Palette, typographie, taille du texte et confort de lecture : vos réglages
        s’appliquent à tout le studio et restent dans ce navigateur.
      </p>

      <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-encre-500 text-[11px] uppercase tracking-wider">
            Palette
          </dt>
          <dd className="text-encre-100 mt-1">
            {palette ? PALETTES[palette].nom : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-encre-500 text-[11px] uppercase tracking-wider">
            Typographie
          </dt>
          <dd className="text-encre-100 mt-1">
            {typo ? TYPOS[typo].nom : '—'}
          </dd>
        </div>
      </dl>

      <button type="button" onClick={ouvrir} className="bouton-principal mt-5">
        <span aria-hidden="true">✦</span>
        Ouvrir les réglages d’apparence
      </button>
    </section>
  );
}

// ============================================================
// ProviderTheme.tsx — Contexte d'identité visuelle.
//
// Porte la palette et la typographie choisies, les applique à
// <html> (data-palette / data-typo + variables --typo-*), les
// persiste dans localStorage et, tant que l'utilisateur n'a rien
// choisi, suit les changements de prefers-color-scheme.
//
// Le premier rendu n'attend PAS ce composant : un script inline
// (voir lib/theme.ts → SCRIPT_THEME) pose déjà les attributs, ce
// qui évite tout clignotement.
// ============================================================

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  appliquerTheme,
  assainirPalette,
  assainirTypo,
  CLEF_PALETTE,
  CLEF_TYPO,
  ecrirePreference,
  lirePreference,
  paletteDefaut,
  TYPO_DEFAUT,
  type PaletteId,
  type TypoId,
} from '@/lib/theme';

interface ContexteTheme {
  palette: PaletteId;
  typo: TypoId;
  choisirPalette: (p: PaletteId) => void;
  choisirTypo: (t: TypoId) => void;
  /** Efface les choix stockés : la palette suit de nouveau le système. */
  reinitialiser: () => void;
}

const Ctx = createContext<ContexteTheme | null>(null);

export function useTheme(): ContexteTheme {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useTheme doit être utilisé dans <ProviderTheme>.');
  }
  return ctx;
}

function paletteInitiale(): PaletteId {
  const stockee = lirePreference(CLEF_PALETTE);
  if (stockee) return assainirPalette(stockee);
  const clair =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: light)').matches;
  return paletteDefaut(!clair);
}

function typoInitiale(): TypoId {
  return assainirTypo(lirePreference(CLEF_TYPO));
}

export default function ProviderTheme({ children }: { children: ReactNode }) {
  const [palette, setPalette] = useState<PaletteId>(paletteInitiale);
  const [typo, setTypo] = useState<TypoId>(typoInitiale);

  // Synchronise l'état React vers le DOM (aucun setState ici).
  useEffect(() => {
    appliquerTheme(palette, typo);
  }, [palette, typo]);

  // Tant qu'aucun choix explicite n'est stocké, on suit le système.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const surChangement = () => {
      if (!lirePreference(CLEF_PALETTE)) {
        setPalette(paletteDefaut(!mq.matches));
      }
    };
    mq.addEventListener('change', surChangement);
    return () => mq.removeEventListener('change', surChangement);
  }, []);

  const choisirPalette = useCallback((p: PaletteId) => {
    setPalette(assainirPalette(p));
    ecrirePreference(CLEF_PALETTE, p);
  }, []);

  const choisirTypo = useCallback((t: TypoId) => {
    setTypo(assainirTypo(t));
    ecrirePreference(CLEF_TYPO, t);
  }, []);

  // Retour aux préférences par défaut : on efface les choix explicites
  // pour que la palette se remette à suivre le schéma du système.
  const reinitialiser = useCallback(() => {
    try {
      window.localStorage.removeItem(CLEF_PALETTE);
      window.localStorage.removeItem(CLEF_TYPO);
    } catch {
      /* stockage indisponible : non bloquant */
    }
    const clair = window.matchMedia('(prefers-color-scheme: light)').matches;
    setPalette(paletteDefaut(!clair));
    setTypo(TYPO_DEFAUT);
  }, []);

  return (
    <Ctx.Provider
      value={{ palette, typo, choisirPalette, choisirTypo, reinitialiser }}
    >
      {children}
    </Ctx.Provider>
  );
}

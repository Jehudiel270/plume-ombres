// ============================================================
// RegleLecture.tsx — Adaptateur du panneau de confort de lecture.
//
// L'implémentation vit dans `components/lecteur/ReglagesLecture.tsx`
// (F5) : ce fichier n'existe plus que pour les surfaces qui ne
// peuvent pas porter les variables de préférence en style en ligne
// — typiquement l'aperçu `app/connexion/apercu`, où la cible est un
// paragraphe rendu ailleurs dans la page. Dans ce cas, les variables
// CSS sont posées IMPÉRATIVEMENT sur l'élément `idLecteur`, comme
// avant.
//
// Le lecteur de livre, lui, consomme directement
// `usePreferencesLecture()` + `<ReglagesLecture />`.
// ============================================================
'use client';

import { useEffect } from 'react';
import { preferencesEnCss } from '@/lib/lecture';
import ReglagesLecture, {
  usePreferencesLecture,
} from '@/components/lecteur/ReglagesLecture';

export default function RegleLecture({ idLecteur }: { idLecteur: string }) {
  const { prefs, maj, reinitialiser } = usePreferencesLecture();

  // Synchronise les préférences vers les variables CSS de la cible
  // (ici, un élément rendu par une autre surface).
  useEffect(() => {
    const cible = document.getElementById(idLecteur);
    if (!cible) return;
    const css = preferencesEnCss(prefs);
    for (const [cle, valeur] of Object.entries(css)) {
      cible.style.setProperty(cle, valeur);
    }
  }, [prefs, idLecteur]);

  return (
    <ReglagesLecture prefs={prefs} maj={maj} reinitialiser={reinitialiser} />
  );
}

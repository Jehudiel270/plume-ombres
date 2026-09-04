// ============================================================
// useLecture.ts — Hook : reprise de lecture + stats de lecture.
//
// Enregistre (localStorage, tout est local et gratuit) :
//  - la progression : dernier chapitre ouvert + ratio de page
//    (pour proposer « Reprendre là où j'en étais » au retour),
//  - les stats : temps passé par livre + estimation de lecture.
//
// Ne met JAMAIS d'horodatage wall-clock dans les données
// stockées (détente d'IA : le temps affiché est calculé à la
// demande, pas "enregistré maintenant").
// ============================================================
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assainirProgression,
  CLEF_PROGRESSION,
  formaterReprise,
  type ProgressionLecture,
} from '@/lib/progression';
import {
  assainirStats,
  CLEF_STATS,
  ajouterTemps,
  ajouterVisite,
  formaterDuree,
  type StatsLecture,
} from '@/lib/stats';

/** Lit une valeur JSON du localStorage (→ null en cas d'erreur). */
function lireJson(clef: string): unknown {
  try {
    const brut = window.localStorage.getItem(clef);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

/** Écrit une valeur JSON dans le localStorage (silencieux). */
function ecrireJson(clef: string, valeur: unknown): void {
  try {
    window.localStorage.setItem(clef, JSON.stringify(valeur));
  } catch {
    /* stockage plein / navigation privée : on ignore */
  }
}

export function useLecture({
  livreId,
  titreLivre,
  chapitres,
  totalCaracteres,
}: {
  livreId: string;
  titreLivre: string;
  /** Chapitres légers (id, position, titre) du livre. */
  chapitres: Array<{ id: string; position: number; titre: string }>;
  /** Nombre total de caractères du livre (pour l'estimation). */
  totalCaracteres: number;
}) {
  const [progression, setProgression] = useState<ProgressionLecture | null>(null);
  const [stats, setStats] = useState<StatsLecture>({ parLivre: {} });
  const timerRef = useRef<number | null>(null);
  const chapitreActuelRef = useRef<string | null>(null);
  const chargeRef = useRef(0); // secondes accumulées pendant la session

  // Chargement initial : progression + stats.
  useEffect(() => {
    const p = assainirProgression(lireJson(CLEF_PROGRESSION));
    setProgression(p && p.livreId === livreId ? p : null);
    setStats(assainirStats(lireJson(CLEF_STATS)));
    // Compte la visite du livre.
    setStats((s) => ajouterVisite(s, livreId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livreId]);

  // Mesure le temps de lecture : accumule les secondes tant que la
  // page est visible (document.visibilityState). Ne stocke le temps
  // QUE comme durée "de lecture" — pas d'horodatage "maintenant".
  useEffect(() => {
    let derniere = Date.now();
    const battre = () => {
      const maintenant = Date.now();
      if (document.visibilityState === 'visible') {
        chargeRef.current += (maintenant - derniere) / 1000;
      }
      derniere = maintenant;
    };
    timerRef.current = window.setInterval(battre, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  // Persiste la progression quand le chapitre ouvert change.
  const majProgression = useCallback(
    (chapitreId: string, ratio: number, libelle: string) => {
      const p: ProgressionLecture = {
        livreId,
        chapitreId,
        ratio: Math.min(Math.max(ratio, 0), 1),
        libelle,
        date: nouvelleDateIso(),
      };
      setProgression(p);
      ecrireJson(CLEF_PROGRESSION, p);
    },
    [livreId]
  );

  /** Enregistre la progression du chapitre (appelé par le lecteur). */
  function enregistrer(chapitreId: string, ratio: number) {
    const chapitre = chapitres.find((c) => c.id === chapitreId);
    if (!chapitre) return;
    chapitreActuelRef.current = chapitreId;
    const libelle = `Chapitre ${chapitre.position + 1}`;
    majProgression(chapitreId, ratio, libelle);
  }

  // À la sortie : on cumule le temps de lecture de la session.
  useEffect(() => {
    return () => {
      if (chargeRef.current >= 1) {
        setStats((s) => {
          const maj = ajouterTemps(s, livreId, chargeRef.current);
          ecrireJson(CLEF_STATS, maj);
          return maj;
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livreId]);

  const detailLecture = stats.parLivre[livreId] ?? null;
  const estimee = formaterDuree(estimerSecondesLectureLivre(totalCaracteres));

  return {
    /** Progression existante (pour afficher « Reprendre »). */
    progression,
    /** Temps déjà passé sur ce livre (formaté), ou null. */
    tempsLecture: detailLecture
      ? formaterDuree(detailLecture.secondes)
      : null,
    /** Estimation du temps de lecture du livre entier. */
    tempsEstime: estimee,
    /** Libellé court « Chapitre 3 · 62 % ». */
    etiquetteReprise: progression ? formaterReprise(progression) : null,
    /** Le chapitre à réouvrir (id) s'il existe encore. */
    chapitreReprendre:
      progression?.chapitreId &&
      chapitres.some((c) => c.id === progression.chapitreId)
        ? progression.chapitreId
        : null,
    /** Enregistre le point de lecture courant. */
    enregistrer,
  };
}

// --- Aides non exportées ---------------------------------------------

/** Nouvelle date ISO (utilisée uniquement comme repère d'ordre). */
function nouvelleDateIso(): string {
  return new Date().toISOString();
}

/** Estimation locale du temps de lecture pour éviter l'import circulatoire. */
function estimerSecondesLectureLivre(caracteres: number): number {
  if (caracteres <= 0) return 0;
  const mots = caracteres / 6;
  return Math.max(60, Math.round((mots / 250) * 60));
}
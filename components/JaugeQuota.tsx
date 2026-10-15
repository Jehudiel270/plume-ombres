// ============================================================
// components/JaugeQuota.tsx — Compteur VIVANT du quota (P0.9).
//
// Problème corrigé : la page d'abonnement affichait la LIMITE du plan
// (« 500 000 caractères »), jamais ce qui RESTE — et rien ne
// rafraîchissait l'affichage après une traduction (valeur figée au
// rendu serveur).
//
// Ce composant client reçoit le rendu SERVEUR (premier affichage
// exact, sans clignotement ni dépendance au réseau) puis le
// RAFRAÎCHIT sur :
//   · `plume:quota-consomme` — émis par lib/useMoteurTraduction.ts
//     dès qu'une traduction est facturée (le corps de /api/translate
//     renvoie déjà { utilise, limite, periode }) ;
//   · retour d'onglet (focus / visibilitychange) ;
//   · un sondage léger (45 s) tant que l'onglet est visible.
//
// La valeur fait toujours autorité côté serveur : on n'incrémente
// jamais localement, on RELIT /api/abonnement (cache: 'no-store').
// ============================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { libelleCaracteres } from '@/lib/abonnement';

export interface EtatQuotaAffiche {
  /** Caractères consommés sur la période. */
  utilise: number;
  /** Plafond effectif de l'offre en vigueur. */
  limite: number;
  /** Ce qui reste : limite - utilisé. */
  restant: number;
  /** Solde de crédits prépayés (caractères). */
  soldeCredits: number;
  /** Période facturée (mois civil), pour la mention « du … au … ». */
  periode: { debut: string; fin: string };
}

interface Props {
  /** Valeur rendue par le serveur : affichée avant tout appel réseau. */
  initial: EtatQuotaAffiche;
  /** Intervalle de sondage (ms). 0 = aucun sondage. */
  intervalleMs?: number;
}

const dateCourte = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** Nombre localisé, sans planter sur une valeur absente ou NaN. */
const nombre = (n: unknown, secours = 0): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : secours;

export default function JaugeQuota({ initial, intervalleMs = 45_000 }: Props) {
  const [etat, setEtat] = useState<EtatQuotaAffiche>(initial);
  const [relu, setRelu] = useState(false);
  const enCours = useRef(false);

  const recharger = useCallback(async () => {
    if (enCours.current) return;
    enCours.current = true;
    try {
      const reponse = await fetch('/api/abonnement', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!reponse.ok) return;
      const donnees = (await reponse.json()) as {
        quota?: {
          effectif?: number;
          limite?: number;
          utilise?: number;
          restant?: number;
          periode?: { debut?: string; fin?: string };
        };
        credits?: { solde?: number };
      };
      const q = donnees.quota;
      if (!q || typeof q.utilise !== 'number') return;
      const limite = nombre(q.effectif ?? q.limite, etat.limite);
      const utilise = nombre(q.utilise, etat.utilise);
      setEtat({
        utilise,
        limite,
        restant: nombre(q.restant, Math.max(limite - utilise, 0)),
        soldeCredits: nombre(donnees.credits?.solde, etat.soldeCredits),
        periode: {
          debut: q.periode?.debut ?? etat.periode.debut,
          fin: q.periode?.fin ?? etat.periode.fin,
        },
      });
      setRelu(true);
    } catch {
      // Réseau indisponible : on garde la dernière valeur CONNUE (celle
      // du serveur) plutôt que d'afficher un chiffre inventé.
    } finally {
      enCours.current = false;
    }
  }, [etat.limite, etat.utilise, etat.soldeCredits, etat.periode.debut, etat.periode.fin]);

  useEffect(() => {
    // Contrat d'événement : lib/useMoteurTraduction.ts l'émet après
    // chaque traduction facturée (quota réellement décompté).
    const surConsommation = () => {
      void recharger();
    };
    const surReveil = () => {
      if (document.visibilityState === 'visible') void recharger();
    };

    window.addEventListener('plume:quota-consomme', surConsommation);
    window.addEventListener('focus', surConsommation);
    document.addEventListener('visibilitychange', surReveil);

    let minuteur: ReturnType<typeof setInterval> | undefined;
    if (intervalleMs > 0) {
      minuteur = setInterval(surReveil, intervalleMs);
    }
    return () => {
      window.removeEventListener('plume:quota-consomme', surConsommation);
      window.removeEventListener('focus', surConsommation);
      document.removeEventListener('visibilitychange', surReveil);
      if (minuteur) clearInterval(minuteur);
    };
  }, [recharger, intervalleMs]);

  const pourcent =
    etat.limite > 0
      ? Math.min(Math.max((etat.utilise / etat.limite) * 100, 0), 100)
      : 0;

  return (
    <>
      <div>
        <dt className="text-encre-500">Caractères restants ce mois</dt>
        <dd className="text-encre-100" data-testid="quota-restant" aria-live="polite">
          <span className="font-semibold">{libelleCaracteres(etat.restant)}</span>
          <span className="text-encre-500">
            {' '}
            sur {etat.limite.toLocaleString('fr-FR')}
          </span>
          <span className="block text-encre-500 text-xs mt-1">
            {etat.utilise.toLocaleString('fr-FR')} consommés · période du{' '}
            {dateCourte(etat.periode.debut)} au {dateCourte(etat.periode.fin)}
            {relu ? ' · à jour' : ''}
          </span>
          <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={etat.limite}
            aria-valuenow={etat.utilise}
            aria-label="Quota mensuel consommé"
            className="block h-1.5 rounded-full bg-nuit-700 mt-2 overflow-hidden"
          >
            <span
              className="block h-full rounded-full bg-grenat-500"
              style={{ width: `${pourcent}%` }}
            />
          </span>
        </dd>
      </div>

      <div>
        <dt className="text-encre-500">Crédits prépayés</dt>
        <dd className="text-encre-100" data-testid="quota-credits" aria-live="polite">
          {libelleCaracteres(etat.soldeCredits)}
          {etat.soldeCredits > 0 ? (
            <span className="text-encre-500"> — sans expiration</span>
          ) : (
            <span className="text-encre-500"> — aucun</span>
          )}
        </dd>
      </div>
    </>
  );
}

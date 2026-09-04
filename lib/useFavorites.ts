'use client';

// Hook des favoris : liste des livres favoris de l'utilisateur connecté,
// bascule optimiste au clic + repli (rollback) si le serveur refuse.
// Sans session auth, la liste est vide et aucun toggle n'est lancé
// (l'insert échouerait sur la policy RLS → inutile d'appeler le serveur).

import { useCallback, useEffect, useRef, useState } from 'react';
import { creerClientNavigateur } from './supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Favori, LigneFavoriteBrute } from './favoris';
import { assainirFavorites, estFavorite, remplacerLigne, toggle } from './favoris';

export interface ResultatToggle {
  ok: boolean;
  /** Message lisible si le toggle a échoué. */
  erreur: string | null;
  /** Liste des favoris à jour après l'opération. */
  liste: Favori[];
}

export interface HookFavorites {
  /** Liste des favoris (ids + métadonnées de la ligne). */
  liste: Favori[];
  /** Chargement initial en attente. */
  chargeEnCours: boolean;
  /** True si une session auth est présente (prérequis au toggle). */
  estConnecte: boolean;
  /** estFavori(livreId) — booléen simple, stable par référence à `liste`. */
  isFavori: (livreId: string) => boolean;
  /**
   * toggleFavori(livreId) — ajoute ou retire avec optimiste + repli.
   * Ne lance aucune requête si non connecté (retour : erreur explicite).
   */
  toggleFavori: (livreId: string) => Promise<ResultatToggle>;
}

const SELECT_FAVORIS = 'id, proprietaire_id, livre_id, created_at';

export function useFavorites(): HookFavorites {
  const [liste, setListe] = useState<Favori[]>([]);
  const [chargeEnCours, setChargeEnCours] = useState(true);
  const [estConnecte, setEstConnecte] = useState(false);

  // Antirebond : un seul toggle à la fois par livre (double-clic).
  const enCours = useRef<Set<string>>(new Set());
  // Miroir de `liste` mis à jour après chaque rendu (écriture de ref,
  // pas un setState → toléré par les règles React Compiler). Permet à
  // toggleFavori de garder une identité stable tout en lisant l'état
  // courant au moment du clic (optimiste + repli exacts).
  const listeRef = useRef<Favori[]>(liste);
  useEffect(() => {
    listeRef.current = liste;
  }, [liste]);

  const charger = useCallback(async (client: SupabaseClient) => {
    const [session, { data, error }] = await Promise.all([
      client.auth.getSession(),
      client
        .from('favorites')
        .select(SELECT_FAVORIS)
        .order('created_at', { ascending: true }),
    ]);
    setEstConnecte(session.data.session !== null);
    if (error) {
      // Pas connecté : RLS rend la table vide (erreur possible si la
      // table n'existe pas encore) → liste vide, pas de crash.
      console.warn('favorites : chargement impossible —', error.message);
      setListe([]);
    } else {
      setListe(assainirFavorites(data));
    }
  }, []);

  // Chargement initial au montage : l'IIFE asynchrone est le pattern
  // toléré par les règles React Compiler (aucun setState dans le corps
  // synchron de l'effet — tout passe après le premier `await`).
  useEffect(() => {
    const client = creerClientNavigateur();
    let annule = false;
    (async () => {
      const [session, { data, error }] = await Promise.all([
        client.auth.getSession(),
        client
          .from('favorites')
          .select(SELECT_FAVORIS)
          .order('created_at', { ascending: true }),
      ]);
      if (annule) return;
      setEstConnecte(session.data.session !== null);
      if (error) {
        // Pas connecté : RLS rend la table vide (erreur possible si la
        // table n'existe pas encore) → liste vide, pas de crash.
        console.warn('favorites : chargement impossible —', error.message);
        setListe([]);
      } else {
        setListe(assainirFavorites(data));
      }
    })()
      .catch(() => {
        if (!annule) console.warn('favorites : erreur inattendue au chargement');
      })
      .finally(() => {
        if (!annule) setChargeEnCours(false);
      });
    return () => {
      annule = true;
    };
  }, []);

  const toggleFavori = useCallback(async (livreId: string): Promise<ResultatToggle> => {
    const client = creerClientNavigateur();
    const etatAvant = listeRef.current;

    // Prérequis : session présente, sinon on court-circuite localement
    // (RLS bloquerait la requête ; mieux d'éviter son coût).
    const { data: session } = await client.auth.getSession();
    if (!session.session) {
      return {
        ok: false,
        erreur: 'Connectez-vous pour marquer un favori.',
        liste: etatAvant,
      };
    }

    // Antirebond : déjà un toggle en vol pour ce livre.
    if (enCours.current.has(livreId)) {
      return { ok: false, erreur: 'Un basculement est déjà en cours.', liste: etatAvant };
    }
    enCours.current.add(livreId);

    const etaitFavori = estFavorite(etatAvant, livreId);

    // 1) Optimiste : bascule locale immédiate (UX instantanée).
    const idTemporaire = livreId; // clef provisoire si insertion confirmée après
    const optimiste = toggle(etatAvant, livreId, idTemporaire);
    setListe(optimiste);

    // 2) Réponse du serveur.
    let resultat: { data: unknown; error: { message: string } | null };
    let ligneInseree: LigneFavoriteBrute | undefined;
    if (etaitFavori) {
      // Retirer : delete sur livre_id (unique par propriétaire → 1 ligne max).
      resultat = await client
        .from('favorites')
        .delete()
        .eq('livre_id', livreId);
    } else {
      // Ajouter : insert + select de la ligne réelle (id gen_random_uuid()).
      resultat = await client
        .from('favorites')
        .insert({ livre_id: livreId })
        .select(SELECT_FAVORIS);
      const arr = resultat.data as LigneFavoriteBrute[] | null;
      ligneInseree = Array.isArray(arr) && arr.length > 0 ? arr[0] : undefined;
    }

    enCours.current.delete(livreId);

    // 3) Repli si échec : retour à l'état d'avant (optimiste annulé).
    if (resultat.error) {
      // Idempotence : si l'erreur est « already exists », le favori est
      // déjà présent → mettre à jour l'état au lieu de le rejouer.
      const dejaPresent = /already exists/i.test(resultat.error.message);
      if (!etaitFavori && dejaPresent) {
        // Il existe déjà côté serveur, mais pas chez nous (cache stale) :
        // on recharge la vraie liste plutôt que d'inventer une ligne.
        charger(client).catch(() => undefined);
        return { ok: true, erreur: null, liste: optimiste };
      }
      setListe(etatAvant);
      return { ok: false, erreur: resultat.error.message, liste: etatAvant };
    }

    // 4) Succès.
    if (!etaitFavori && ligneInseree) {
      // On remplace la ligne temporaire par la ligne réelle du serveur.
      const definitif = remplacerLigne(optimiste, idTemporaire, ligneInseree);
      setListe(definitif);
      return { ok: true, erreur: null, liste: definitif };
    }
    return { ok: true, erreur: null, liste: optimiste };
  }, [charger]);

  const isFavori = useCallback((livreId: string) => estFavorite(liste, livreId), [liste]);

  return { liste, chargeEnCours, estConnecte, isFavori, toggleFavori };
}
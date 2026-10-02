'use client';

// ============================================================
// useMoteurTraduction.ts — File d'attente de traduction PARALLÈLE.
//
// Parcourt les segments « en attente » ou « en erreur » des
// chapitres demandés, appelle la route API /api/translate (pool
// de travailleurs concurrents), persiste chaque résultat, gère
// retry avec backoff, annulation propre et progression temps
// réel. Une interruption ne perd rien : les segments restent en
// attente en base et la reprise repart d'où elle en était.
// ============================================================

import { useCallback, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { paginer } from '@/lib/pagination';
import {
  chargerPairesGlossaire,
  construireContexteGlissant,
  MAX_ENTREES_PROMPT,
  MAX_SEGMENTS_CONTEXTE,
} from '@/lib/glossaire';
import { chapitreEntierementTraduit } from '@/lib/types';
import type {
  Chapitre,
  Livre,
  PaireGlossaire,
  Segment,
  StatutChapitre,
} from '@/lib/types';

/** Âge au-delà duquel un segment `en_cours` est considéré orphelin. */
export const SEUIL_SEGMENT_EN_COURS_MS = 10 * 60 * 1000; // ~10 min

/**
 * Reprise des segments orphelins : un onglet fermé / un crash en pleine
 * traduction laisse des segments bloqués en `en_cours`, jamais retraités
 * par la file (qui ne lit que `en_attente`/`erreur`). Au-delà du seuil,
 * on les remet dans la file (`en_attente`). Idempotent et sûr en
 * concurrence : un segment activement traité a un `updated_at` récent.
 * Renvoie le nombre de segments requalifiés.
 */
export async function reprendreSegmentsEnCours(
  supabase: SupabaseClient,
  chapitreId: string,
  seuilMs: number = SEUIL_SEGMENT_EN_COURS_MS
): Promise<number> {
  const limite = new Date(Date.now() - seuilMs).toISOString();
  const { data } = await supabase
    .from('segments')
    .update({ statut: 'en_attente', erreur: null })
    .eq('chapitre_id', chapitreId)
    .eq('statut', 'en_cours')
    .lt('updated_at', limite)
    .select('id');
  return data?.length ?? 0;
}

export interface Progression {
  /** Segments déjà traduits (fait) dans le lot courant. */
  faits: number;
  /** Segments en erreur (abandonnés après épuisement des essais). */
  erreurs: number;
  /** Total de segments programmés par ce lot. */
  total: number;
  /** Chapitre en cours de traitement. */
  chapitreEnCours: Chapitre | null;
}

const MAX_ESSAIS = 3;
const DELAI_COURANT = 80; // entre deux segments (moteurs rapides)
const DELAI_MYMEMORY = 1200; // quota MyMemory : ~1 requête/seconde

function attendre(ms: number, signal: AbortSignal | null): Promise<void> {
  return new Promise((resoudre) => {
    if (signal?.aborted) return resoudre();
    const id = setTimeout(resoudre, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        resoudre();
      },
      { once: true }
    );
  });
}

type ResultatRequete =
  | { ok: true; texte: string; essais: number; fournisseur: string }
  | { ok: false; essais: number; raison: 'limite' | 'long' | 'abort' };

interface CorpsTraduction {
  texte: string;
  source: string;
  cible: string;
  /** P1.1 : paires source → traduction imposées (glossaire actif). */
  glossaire?: PaireGlossaire[];
  /** P1.1 : rappel de contexte glissant (segments précédents). */
  contexte?: string;
}

export function useMoteurTraduction() {
  const [actif, setActif] = useState(false);
  const [progression, setProgression] = useState<Progression>({
    faits: 0,
    erreurs: 0,
    total: 0,
    chapitreEnCours: null,
  });
  const signalAnnulation = useRef<AbortController | null>(null);

  const annuler = useCallback(() => {
    signalAnnulation.current?.abort();
  }, []);

  /** Termine un chapitre : assemblage 1:1 + statut (sauf si annulation). */
  const cloreChapitre = useCallback(
    async (
      supabase: SupabaseClient,
      chapitre: Chapitre,
      majChapitre: (
        chapitre: Chapitre,
        texteTraduit: string,
        statut: StatutChapitre
      ) => void,
      annule: boolean
    ) => {
      const liste = await paginer<Segment>((debut, fin) =>
        supabase
          .from('segments')
          .select('*')
          .eq('chapitre_id', chapitre.id)
          .order('position', { ascending: true })
          .range(debut, fin)
      );

      if (annule) {
        // On ne touche pas au texte déjà assemblé ; on reflète juste
        // ce qui reste à faire. Garde-fou : le chapitre n'est
        // « traduit » que si aucun segment n'a de trou.
        const complet = chapitreEntierementTraduit(liste);
        await supabase
          .from('chapitres')
          .update({ statut: complet ? 'traduit' : 'a_traduire' })
          .eq('id', chapitre.id);
        if (complet) {
          majChapitre(chapitre, assemblerChapitre(liste), 'traduit');
        }
        return;
      }

      const texteAssemble = assemblerChapitre(liste);
      // Garde-fou : statut « traduit » réservé aux chapitres dont TOUS
      // les segments ont un texte cible non vide. Sinon un segment resté
      // `en_cours` (orphelin) ou une traduction vide laisserait un trou
      // silencieux dans un chapitre présenté comme traduit.
      const statut: StatutChapitre = chapitreEntierementTraduit(liste)
        ? 'traduit'
        : 'erreur';
      await supabase
        .from('chapitres')
        .update({ statut, texte_traduit: texteAssemble })
        .eq('id', chapitre.id);
      majChapitre(chapitre, texteAssemble, statut);
    },
    []
  );

  const lancer = useCallback(
    async (
      supabase: SupabaseClient,
      chapitres: Chapitre[],
      livre: Livre,
      majChapitre: (
        chapitre: Chapitre,
        texteTraduit: string,
        statut: StatutChapitre
      ) => void,
      /**
       * P1.1 — paramètre FACULTATIF (additif) : paires de glossaire à
       * imposer. Omis, le glossaire actif du livre est chargé depuis
       * Supabase ; une erreur de chargement ne bloque jamais le lot.
       */
      options?: { glossaire?: readonly PaireGlossaire[] }
    ) => {
      if (chapitres.length === 0 || actif) return;

      // Glossaire actif du livre (source → traduction imposée), borné
      // pour ne pas exploser la taille des requêtes.
      const glossaireActif: PaireGlossaire[] = (
        options?.glossaire ?? (await chargerPairesGlossaire(supabase, livre.id))
      )
        .filter((p) => p.source.trim() && p.traduction.trim())
        .slice(0, MAX_ENTREES_PROMPT);

      const controleur = new AbortController();
      signalAnnulation.current = controleur;
      setActif(true);
      setProgression({
        faits: 0,
        erreurs: 0,
        total: 0,
        chapitreEnCours: null,
      });

      const CONCURRENCE = 4;

      try {
        for (const chapitre of chapitres) {
          let chapitreAnnule = false;
          if (controleur.signal.aborted) break;

          await supabase
            .from('chapitres')
            .update({ statut: 'en_traduction' })
            .eq('id', chapitre.id);

          // Reprise défensive : les segments orphelins restés `en_cours`
          // (crash, onglet fermé) repassent en file avant de la
          // construire, sinon ils ne seraient jamais retraités.
          await reprendreSegmentsEnCours(supabase, chapitre.id);

          const file = await paginer<Segment>((debut, fin) =>
            supabase
              .from('segments')
              .select('*')
              .eq('chapitre_id', chapitre.id)
              .in('statut', ['en_attente', 'erreur'])
              .order('position', { ascending: true })
              .range(debut, fin)
          );

          // P1.1 — vue complète du chapitre : sert au contexte glissant
          // (segments déjà traduits situés AVANT le segment courant).
          const segmentsChapitre = await paginer<Segment>((debut, fin) =>
            supabase
              .from('segments')
              .select('*')
              .eq('chapitre_id', chapitre.id)
              .order('position', { ascending: true })
              .range(debut, fin)
          );
          if (file.length === 0) {
            if (!controleur.signal.aborted) {
              await cloreChapitre(supabase, chapitre, majChapitre, false);
            }
            continue;
          }

          setProgression((p) => ({
            ...p,
            total: p.total + file.length,
            chapitreEnCours: chapitre,
          }));

          // --- Pool de travailleurs : traitement PARALLÈLE des segments ---
          let suivant = 0;
          let erreurInterne: Error | null = null;

          const traiterSegment = async (segment: Segment) => {
            const texte = segment.source;
            if (!texte) {
              await supabase
                .from('segments')
                .update({ statut: 'fait', traduit: '', erreur: null })
                .eq('id', segment.id);
              setProgression((p) => ({ ...p, faits: p.faits + 1 }));
              return;
            }

            await supabase
              .from('segments')
              .update({ statut: 'en_cours' })
              .eq('id', segment.id);

            // P1.1 — contexte glissant : les N segments précédents DÉJÀ
            // traduits du même chapitre, sous budget (les termes fixés,
            // eux, sont envoyés via `glossaire` et composés une seule
            // fois dans le prompt côté serveur — pas de doublon).
            const precedents = segmentsChapitre
              .filter((s) => s.position < segment.position)
              .slice(-MAX_SEGMENTS_CONTEXTE)
              .map((s) => ({ source: s.source, traduit: s.traduit }));
            const contexte = construireContexteGlissant({
              segments: precedents,
            });

            const resultat = await traduireAvecEssais(
              {
                texte,
                source: livre.langue_source,
                cible: livre.langue_cible,
                ...(glossaireActif.length > 0
                  ? { glossaire: glossaireActif }
                  : {}),
                ...(contexte.extrait ? { contexte: contexte.extrait } : {}),
              },
              segment.tentative,
              controleur.signal
            );

            if (!resultat.ok && resultat.raison === 'abort') {
              // Annulation : segment laissé en attente pour la reprise.
              await supabase
                .from('segments')
                .update({ statut: 'en_attente' })
                .eq('id', segment.id);
              return;
            }

            if (resultat.ok) {
              await supabase
                .from('segments')
                .update({
                  statut: 'fait',
                  traduit: resultat.texte,
                  erreur: null,
                  tentative: resultat.essais,
                })
                .eq('id', segment.id);
              setProgression((p) => ({ ...p, faits: p.faits + 1 }));
              const delai =
                resultat.fournisseur === 'mymemory'
                  ? DELAI_MYMEMORY
                  : DELAI_COURANT;
              await attendre(delai, controleur.signal);
            } else {
              // Échec définitif du segment (essais épuisés ou trop long).
              await supabase
                .from('segments')
                .update({
                  statut: 'erreur',
                  tentative: resultat.essais,
                  erreur:
                    resultat.raison === 'long'
                      ? 'Segment trop long pour le fournisseur.'
                      : 'Échec après plusieurs essais.',
                })
                .eq('id', segment.id);
              setProgression((p) => ({ ...p, erreurs: p.erreurs + 1 }));
              await attendre(300, controleur.signal);
            }
          };

          const travailleurs = Array.from(
            { length: Math.min(CONCURRENCE, file.length) },
            async () => {
              for (;;) {
                if (controleur.signal.aborted) {
                  chapitreAnnule = true;
                  return;
                }
                const indice = suivant++;
                if (indice >= file.length) return;
                try {
                  await traiterSegment(file[indice]);
                } catch (e) {
                  erreurInterne =
                    e instanceof Error
                      ? e
                      : new Error('Erreur interne de traduction.');
                  return;
                }
              }
            }
          );
          await Promise.all(travailleurs);
          if (erreurInterne) throw erreurInterne;

          // Fin du chapitre : assemblage 1:1 et statut.
          await cloreChapitre(
            supabase,
            chapitre,
            majChapitre,
            controleur.signal.aborted || chapitreAnnule
          );
        }
      } finally {
        setActif(false);
        signalAnnulation.current = null;
        setProgression((p) => ({ ...p, chapitreEnCours: null }));
      }
    },
    [actif, cloreChapitre]
  );

  /** Reprise ponctuelle des segments `en_cours` périmés d'un chapitre. */
  const reprendre = useCallback(
    (supabase: SupabaseClient, chapitreId: string) =>
      reprendreSegmentsEnCours(supabase, chapitreId),
    []
  );

  return { actif, progression, lancer, annuler, reprendre };
}

/** Retry avec backoff : jusqu'à MAX_ESSAIS tentatives par segment. */
async function traduireAvecEssais(
  corps: CorpsTraduction,
  tentativeInitiale: number,
  signal: AbortSignal
): Promise<ResultatRequete> {
  let tentative = tentativeInitiale;

  while (tentative < MAX_ESSAIS) {
    if (signal.aborted) {
      return { ok: false, essais: tentative + 1, raison: 'abort' };
    }
    try {
      const reponse = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
        signal,
      });

      if (reponse.ok) {
        const donnees = (await reponse.json()) as {
          traduit?: string;
          fournisseur?: string;
        };
        if (typeof donnees.traduit === 'string') {
          // Segment renvoyé vide par le moteur : on refuse le faux succès
          // (sinon le segment serait marqué `fait` avec un trou). L'erreur
          // déclenche une nouvelle tentative, puis un statut `erreur`.
          if (donnees.traduit.trim() === '') {
            throw new Error('Traduction vide renvoyée par le moteur.');
          }
          return {
            ok: true,
            texte: donnees.traduit,
            essais: tentative + 1,
            fournisseur: donnees.fournisseur ?? '',
          };
        }
        throw new Error('Réponse sans traduction.');
      }

      const detail = (await reponse.json().catch(() => null)) as {
        erreur?: string;
      } | null;

      if (reponse.status === 413) {
        return { ok: false, essais: tentative + 1, raison: 'long' };
      }
      throw new Error(detail?.erreur ?? `HTTP ${reponse.status}`);
    } catch (e) {
      const estAbort = e instanceof DOMException && e.name === 'AbortError';
      if (estAbort || signal.aborted) {
        return { ok: false, essais: tentative + 1, raison: 'abort' };
      }
      tentative += 1;
      if (tentative >= MAX_ESSAIS) {
        return { ok: false, essais: tentative, raison: 'limite' };
      }
      // Backoff exponentiel : 1,5 s puis 3 s.
      await attendre(1500 * 2 ** (tentative - 1), signal);
    }
  }
  return { ok: false, essais: tentative, raison: 'limite' };
}

/**
 * Assemble les segments d'un chapitre : traduction + espacement
 * d'origine — structure préservée 1:1.
 */
export function assemblerChapitre(segments: Segment[]): string {
  return segments.map((s) => (s.traduit ?? '') + s.suite).join('');
}

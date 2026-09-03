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
import type {
  Chapitre,
  Livre,
  Segment,
  StatutChapitre,
} from '@/lib/types';

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
        // ce qui reste à faire.
        const reste = liste.some(
          (s) => s.statut === 'en_attente' || s.statut === 'erreur'
        );
        await supabase
          .from('chapitres')
          .update({ statut: reste ? 'a_traduire' : 'traduit' })
          .eq('id', chapitre.id);
        if (!reste) {
          majChapitre(chapitre, assemblerChapitre(liste), 'traduit');
        }
        return;
      }

      const texteAssemble = assemblerChapitre(liste);
      const resteErreur = liste.some(
        (s) => s.statut === 'erreur' || s.statut === 'en_attente'
      );
      const statut: StatutChapitre = resteErreur ? 'erreur' : 'traduit';
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
      ) => void
    ) => {
      if (chapitres.length === 0 || actif) return;

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

          const file = await paginer<Segment>((debut, fin) =>
            supabase
              .from('segments')
              .select('*')
              .eq('chapitre_id', chapitre.id)
              .in('statut', ['en_attente', 'erreur'])
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

            const resultat = await traduireAvecEssais(
              {
                texte,
                source: livre.langue_source,
                cible: livre.langue_cible,
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

  return { actif, progression, lancer, annuler };
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

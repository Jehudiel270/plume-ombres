'use client';

// ============================================================
// useMoteurTraduction.ts — Moteur de traduction PAR LOTS.
//
// Un LOT = une seule requête `POST /api/translate/lot` pour un paquet
// de segments (plafond du contrat : 40 segments / 20 000 caractères).
// Trois lots tournent en parallèle : le livre avance ~60 segments à la
// fois au lieu d'un seul. L'ancienne boucle appelait `/api/translate`
// segment par segment — trois allers-retours Supabase par segment
// (authentification, débit, quota) puis `attendre(80)` — d'où la
// lenteur mesurée dans docs/CHANTIER-TRADUCTION-2026-10-17.md.
//
// Conservé tel quel : glossaire actif du livre, contexte glissant
// (segments précédents du même chapitre), annulation propre (les
// segments d'un lot interrompu repassent `en_attente`), assemblage 1:1
// et statut de fin de chapitre (`traduit` seulement si aucun trou).
//
// Ajouté : REPRISE AUTOMATIQUE. À la fin du passage d'un chapitre, les
// segments encore en échec sont relancés seuls — deux passes
// supplémentaires, après 3 s puis 10 s — sans aucune action de
// l'utilisateur. Ce qui échoue encore reste `erreur`, avec un message
// lisible et sans nom de fournisseur.
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

/** Segments par lot (le serveur accepte jusqu'à 40 ; 20 tient la latence). */
export const TAILLE_LOT = 20;

/** Lots simultanés (3 × 20 = 60 segments en vol). */
export const LOTS_PARALLELES = 3;

/**
 * Budget de caractères d'un paquet. Le contrat du lot plafonne à
 * 20 000 caractères : on garde une marge pour la marge d'en-tête.
 */
export const MAX_CARACTERES_LOT = 18_000;

/** Plafond d'un segment côté serveur (au-delà : refus `raison: "long"`). */
export const MAX_CARACTERES_PAR_SEGMENT = 6_000;

/** Délais des deux passes de reprise automatique (3 s puis 10 s). */
export const DELAIS_REPRISE_MS: readonly number[] = [3_000, 10_000];

const MESSAGE_TROP_LONG =
  'Segment trop long pour être traduit en une fois (6 000 caractères maximum).';
const MESSAGE_ECHEC = 'La traduction de ce passage a échoué.';
const MESSAGE_INDISPONIBLE =
  'Traduction momentanément indisponible — réessayez dans quelques minutes.';
const MESSAGE_RESEAU = 'Connexion interrompue pendant la traduction.';
const MESSAGE_SESSION = 'Session expirée : reconnectez-vous pour continuer.';

/**
 * Filet de sécurité : aucun nom de fournisseur ne doit apparaître dans
 * l'interface, même si un message serveur en contenait un.
 */
const NOMS_FOURNISSEURS = /gemini|google|libre\s*translate|mymemory|deepl|openai/i;

// ------------------------------------------------------------
// Reprise des segments orphelins
// ------------------------------------------------------------

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

/**
 * Passe le livre à `traduit` quand TOUS ses chapitres le sont.
 *
 * C'est ce changement d'état — et lui seul — qui déclenche la
 * notification « Traduction terminée » côté base
 * (trigger `public.notifier_traduction_terminee`). Sans cet appel, les
 * chapitres pouvaient être complets alors que `livres.statut` restait
 * `pret` : la cloche ne recevait jamais rien.
 *
 * Idempotent : la mise à jour n'est faite que sur une transition.
 */
export async function cloreLivreSiComplet(
  supabase: SupabaseClient,
  livreId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from('chapitres')
    .select('id', { count: 'exact', head: true })
    .eq('livre_id', livreId)
    .neq('statut', 'traduit');
  if (error) return false;
  if ((count ?? 0) > 0) return false;

  const { error: erreurMaj } = await supabase
    .from('livres')
    .update({ statut: 'traduit' })
    .eq('id', livreId)
    .neq('statut', 'traduit');
  return !erreurMaj;
}

/**
 * Reprise au montage, à l'échelle du LIVRE : requalifie les segments
 * `en_cours` périmés de tous les chapitres, puis renvoie les chapitres
 * qui ont encore du travail (`en_attente` / `erreur`). Une seule passe
 * paginée sur les segments — pas une requête par chapitre.
 */
export async function chapitresAReprendre(
  supabase: SupabaseClient,
  chapitreIds: readonly string[],
  seuilMs: number = SEUIL_SEGMENT_EN_COURS_MS
): Promise<string[]> {
  if (chapitreIds.length === 0) return [];

  const limite = new Date(Date.now() - seuilMs).toISOString();
  await supabase
    .from('segments')
    .update({ statut: 'en_attente', erreur: null })
    .in('chapitre_id', [...chapitreIds])
    .eq('statut', 'en_cours')
    .lt('updated_at', limite);

  const lignes = await paginer<{ id: number; chapitre_id: string; statut: string }>(
    (debut, fin) =>
      supabase
        .from('segments')
        .select('id, chapitre_id, statut')
        .in('chapitre_id', [...chapitreIds])
        .in('statut', ['en_attente', 'erreur'])
        .order('id', { ascending: true })
        .range(debut, fin)
  );

  const concernes = new Set<string>();
  for (const ligne of lignes) concernes.add(ligne.chapitre_id);
  return [...concernes];
}

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface Progression {
  /** Segments déjà traduits (fait) dans le passage courant. */
  faits: number;
  /** Segments en erreur après épuisement des reprises automatiques. */
  erreurs: number;
  /** Total de segments programmés par ce passage. */
  total: number;
  /** Chapitre en cours de traitement. */
  chapitreEnCours: Chapitre | null;
}

/** Paquet envoyé au lot : identifiants en chaîne (contrat d'API). */
interface SegmentEnvoye {
  id: string;
  texte: string;
  contexte?: string;
}

interface CorpsLot {
  source: string;
  cible: string;
  glossaire?: PaireGlossaire[];
  segments: SegmentEnvoye[];
}

interface ResultatLot {
  id?: string;
  traduit?: string;
  fournisseur?: string;
  essais?: number;
}

interface EchecLot {
  id?: string;
  raison?: string;
  message?: string;
}

/** Corps de `POST /api/translate/lot` (cf. docs/CHANTIER-TRADUCTION). */
export interface ReponseLot {
  statut?: 'ok' | 'partiel' | 'indisponible';
  resultats?: ResultatLot[];
  echecs?: EchecLot[];
  quota?: {
    utilise?: number;
    limite?: number;
    periode?: { debut: string; fin: string };
  };
  erreur?: string;
}

type EtatSegment = 'fait' | 'erreur';

interface ContextePasse {
  supabase: SupabaseClient;
  livre: Livre;
  glossaire: PaireGlossaire[];
  signal: AbortSignal;
  /** Mémorise l'état TERMINAL d'un segment (une seule fois compté). */
  enregistrerEtat: (id: number, etat: EtatSegment) => void;
  /** Compteur du moteur technique réellement utilisé (par chapitre). */
  moteurs: Map<string, number>;
  /**
   * Caractères réellement traduits depuis le début du passage.
   * Sert à mesurer le débit RÉEL (car/s) pour l'estimation de durée.
   */
  caracteresFaits: number;
}

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------

function attendre(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resoudre) => {
    if (signal.aborted) return resoudre();
    const id = setTimeout(resoudre, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        resoudre();
      },
      { once: true }
    );
  });
}

function estAnnulation(e: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  return e instanceof DOMException && e.name === 'AbortError';
}

/** Message lisible, neutre (aucun nom de fournisseur). */
function messageEchec(raison?: string, message?: string): string {
  if (raison === 'long') return MESSAGE_TROP_LONG;
  if (raison === 'limite') return MESSAGE_INDISPONIBLE;
  const propre = (message ?? '').trim();
  if (propre && propre.length <= 160 && !NOMS_FOURNISSEURS.test(propre)) {
    return propre;
  }
  return MESSAGE_ECHEC;
}

/** Message d'échec d'un lot entier (réponse HTTP non 2xx). */
function messageHttp(statut: number, detail?: string): string {
  if (statut === 402) return MESSAGE_INDISPONIBLE;
  if (statut === 429) return 'Trop de demandes en peu de temps — réessayez dans un instant.';
  if (statut === 401 || statut === 403) return MESSAGE_SESSION;
  const propre = (detail ?? '').trim();
  if (propre && propre.length <= 160 && !NOMS_FOURNISSEURS.test(propre)) {
    return propre;
  }
  return `${MESSAGE_ECHEC} (code ${statut})`;
}

/**
 * Découpe une file de segments en paquets respectant DEUX plafonds :
 * le nombre de segments (20) et le volume de texte (18 000 caractères),
 * pour ne jamais franchir les seuils du contrat de lot.
 */
export function decouperEnPaquets(
  segments: readonly Segment[],
  tailleMax: number = TAILLE_LOT,
  caracteresMax: number = MAX_CARACTERES_LOT
): Segment[][] {
  const paquets: Segment[][] = [];
  let courant: Segment[] = [];
  let taille = 0;

  for (const segment of segments) {
    const longueur = segment.source?.length ?? 0;
    if (
      courant.length > 0 &&
      (courant.length >= tailleMax || taille + longueur > caracteresMax)
    ) {
      paquets.push(courant);
      courant = [];
      taille = 0;
    }
    courant.push(segment);
    taille += longueur;
  }
  if (courant.length > 0) paquets.push(courant);
  return paquets;
}

// ------------------------------------------------------------
// Un lot : une requête pour tout un paquet
// ------------------------------------------------------------

/**
 * Envoie un paquet et persiste les résultats. Renvoie les segments qui
 * n'ont pas de traduction (à relancer par la passe de reprise).
 */
async function envoyerPaquet(
  paquet: readonly Segment[],
  contextes: Map<number, string>,
  ctx: ContextePasse
): Promise<Segment[]> {
  const { supabase, signal } = ctx;
  if (signal.aborted) return [...paquet];

  const ids = paquet.map((s) => s.id);
  await supabase.from('segments').update({ statut: 'en_cours' }).in('id', ids);

  const corps: CorpsLot = {
    source: ctx.livre.langue_source,
    cible: ctx.livre.langue_cible,
    ...(ctx.glossaire.length > 0 ? { glossaire: ctx.glossaire } : {}),
    segments: paquet.map((s) => {
      const contexte = contextes.get(s.id);
      return {
        id: String(s.id),
        texte: s.source,
        ...(contexte ? { contexte } : {}),
      };
    }),
  };

  let donnees: ReponseLot;
  try {
    const reponse = await fetch('/api/translate/lot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
      signal,
    });

    if (!reponse.ok) {
      const detail = (await reponse.json().catch(() => null)) as {
        erreur?: string;
      } | null;
      return marquerEchecs(paquet, messageHttp(reponse.status, detail?.erreur), ctx);
    }
    donnees = (await reponse.json()) as ReponseLot;
  } catch (e) {
    if (estAnnulation(e, signal)) {
      // Annulation : le lot n'est pas perdu, les segments repartent en file.
      if (ids.length > 0) {
        await supabase.from('segments').update({ statut: 'en_attente' }).in('id', ids);
      }
      return [...paquet];
    }
    return marquerEchecs(paquet, MESSAGE_RESEAU, ctx);
  }

  // Quota réellement décompté (une seule fois pour tout le lot) : les
  // compteurs affichés (components/JaugeQuota.tsx) RELISENT l'état.
  if (donnees.quota && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('plume:quota-consomme', { detail: donnees.quota })
    );
  }

  const parId = new Map<string, ResultatLot>();
  for (const r of donnees.resultats ?? []) {
    if (r && typeof r.id === 'string') parId.set(r.id, r);
  }
  const echecsParId = new Map<string, EchecLot>();
  for (const e of donnees.echecs ?? []) {
    if (e && typeof e.id === 'string') echecsParId.set(e.id, e);
  }

  const reussis: { segment: Segment; resultat: ResultatLot }[] = [];
  const rates: { segment: Segment; raison?: string; message?: string }[] = [];

  for (const segment of paquet) {
    const cle = String(segment.id);
    const resultat = parId.get(cle);
    // Une traduction vide est un faux succès : elle laisse un trou dans
    // le chapitre, donc elle compte comme un échec.
    if (resultat && typeof resultat.traduit === 'string' && resultat.traduit.trim()) {
      reussis.push({ segment, resultat });
      continue;
    }
    const echec = echecsParId.get(cle);
    rates.push({ segment, raison: echec?.raison, message: echec?.message });
  }

  await Promise.all(
    reussis.map(({ segment, resultat }) =>
      supabase
        .from('segments')
        .update({
          statut: 'fait',
          traduit: resultat.traduit,
          erreur: null,
          tentative: Math.max(
            resultat.essais ?? 0,
            segment.tentative,
            1
          ),
        })
        .eq('id', segment.id)
    )
  );

  for (const { segment, resultat } of reussis) {
    ctx.enregistrerEtat(segment.id, 'fait');
    ctx.caracteresFaits += segment.source.length;
    if (resultat.fournisseur) {
      ctx.moteurs.set(
        resultat.fournisseur,
        (ctx.moteurs.get(resultat.fournisseur) ?? 0) + 1
      );
    }
  }

  if (rates.length > 0) {
    await marquerEchecs(
      rates.map((r) => r.segment),
      undefined,
      ctx,
      new Map(
        rates.map((r) => [
          r.segment.id,
          messageEchec(r.raison, r.message),
        ])
      )
    );
  }

  return rates.map((r) => r.segment);
}

/**
 * Écrit `erreur` pour un paquet entier (message commun ou message par
 * segment) et alimente la progression. Sert aussi aux échecs réseau.
 */
async function marquerEchecs(
  segments: readonly Segment[],
  messageCommun: string | undefined,
  ctx: ContextePasse,
  messagesParId?: Map<number, string>
): Promise<Segment[]> {
  if (ctx.signal.aborted) return [...segments];

  await Promise.all(
    segments.map((segment) => {
      segment.tentative += 1;
      return ctx.supabase
        .from('segments')
        .update({
          statut: 'erreur',
          tentative: segment.tentative,
          erreur:
            messagesParId?.get(segment.id) ?? messageCommun ?? MESSAGE_ECHEC,
        })
        .eq('id', segment.id);
    })
  );

  for (const segment of segments) ctx.enregistrerEtat(segment.id, 'erreur');
  return [...segments];
}

/**
 * Passe complète sur une liste de segments : paquets de 20, trois lots
 * en parallèle. Renvoie les segments encore sans traduction.
 */
async function traduireParLots(
  segments: readonly Segment[],
  contextes: Map<number, string>,
  ctx: ContextePasse
): Promise<Segment[]> {
  if (segments.length === 0) return [];
  const paquets = decouperEnPaquets(segments);
  const rates = new Map<number, Segment>();
  let suivant = 0;

  const travailleur = async () => {
    for (;;) {
      if (ctx.signal.aborted) return;
      const indice = suivant++;
      if (indice >= paquets.length) return;
      const echecs = await envoyerPaquet(paquets[indice], contextes, ctx);
      for (const segment of echecs) rates.set(segment.id, segment);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(LOTS_PARALLELES, paquets.length) },
      () => travailleur()
    )
  );

  return [...rates.values()];
}

// ------------------------------------------------------------
// Le hook
// ------------------------------------------------------------

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
      annule: boolean,
      /** Moteur dominant du chapitre (identifiant technique) — mémorisé. */
      moteur: string | null = null
    ) => {
      const liste = await paginer<Segment>((debut, fin) =>
        supabase
          .from('segments')
          .select('*')
          .eq('chapitre_id', chapitre.id)
          .order('position', { ascending: true })
          .range(debut, fin)
      );

      // On n'écrit `moteur_traduction` que si un moteur a réellement servi
      // (sinon on préserve la valeur existante — reprise d'un chapitre
      // déjà partiellement traduit).
      const champMoteur = moteur ? { moteur_traduction: moteur } : {};

      if (annule) {
        // On ne touche pas au texte déjà assemblé ; on reflète juste
        // ce qui reste à faire. Garde-fou : le chapitre n'est
        // « traduit » que si aucun segment n'a de trou.
        const complet = chapitreEntierementTraduit(liste);
        await supabase
          .from('chapitres')
          .update({ statut: complet ? 'traduit' : 'a_traduire', ...champMoteur })
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
        .update({ statut, texte_traduit: texteAssemble, ...champMoteur })
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

      // Progression comptée PAR SEGMENT : un segment ne peut être que
      // « fait » ou « erreur », jamais les deux — même après deux passes
      // de reprise, le total reste juste.
      const etats = new Map<number, EtatSegment>();
      const majProgression = () => {
        let faits = 0;
        let erreurs = 0;
        for (const etat of etats.values()) {
          if (etat === 'fait') faits += 1;
          else erreurs += 1;
        }
        setProgression((p) => ({ ...p, faits, erreurs }));
      };

      const contextePasse: ContextePasse = {
        supabase,
        livre,
        glossaire: glossaireActif,
        signal: controleur.signal,
        enregistrerEtat: (id, etat) => {
          etats.set(id, etat);
          majProgression();
        },
        moteurs: new Map<string, number>(),
        caracteresFaits: 0,
      };

      const debutPassage = Date.now();

      try {
        for (const chapitre of chapitres) {
          if (controleur.signal.aborted) break;

          await supabase
            .from('chapitres')
            .update({ statut: 'en_traduction' })
            .eq('id', chapitre.id);

          // Reprise défensive : les segments orphelins restés `en_cours`
          // (crash, onglet fermé) repassent en file avant de la
          // construire, sinon ils ne seraient jamais retraités.
          await reprendreSegmentsEnCours(supabase, chapitre.id);

          const [file, segmentsChapitre] = await Promise.all([
            paginer<Segment>((debut, fin) =>
              supabase
                .from('segments')
                .select('*')
                .eq('chapitre_id', chapitre.id)
                .in('statut', ['en_attente', 'erreur'])
                .order('position', { ascending: true })
                .range(debut, fin)
            ),
            // Vue complète du chapitre : sert au contexte glissant
            // (segments déjà traduits situés AVANT le segment courant).
            paginer<Segment>((debut, fin) =>
              supabase
                .from('segments')
                .select('*')
                .eq('chapitre_id', chapitre.id)
                .order('position', { ascending: true })
                .range(debut, fin)
            ),
          ]);

          if (file.length === 0) {
            if (!controleur.signal.aborted) {
              await cloreChapitre(
                supabase,
                chapitre,
                majChapitre,
                false,
                moteurDominant(contextePasse.moteurs)
              );
            }
            continue;
          }

          setProgression((p) => ({
            ...p,
            total: p.total + file.length,
            chapitreEnCours: chapitre,
          }));

          // Segments sans texte source : rien à traduire, ils ne partent
          // pas dans un lot (le serveur les refuserait comme vides).
          const vides = file.filter((s) => s.source.trim() === '');
          if (vides.length > 0) {
            await supabase
              .from('segments')
              .update({ statut: 'fait', traduit: '', erreur: null })
              .in('id', vides.map((s) => s.id));
            for (const segment of vides) {
              contextePasse.enregistrerEtat(segment.id, 'fait');
            }
          }

          // Au-delà de 6 000 caractères le serveur refuse (`raison: long`) :
          // inutile de payer deux passes de reprise pour rien.
          const tropLongs = file.filter(
            (s) =>
              s.source.trim() !== '' &&
              s.source.length > MAX_CARACTERES_PAR_SEGMENT
          );
          if (tropLongs.length > 0) {
            await marquerEchecs(tropLongs, MESSAGE_TROP_LONG, contextePasse);
          }

          const aTraduire = file.filter(
            (s) =>
              s.source.trim() !== '' &&
              s.source.length <= MAX_CARACTERES_PAR_SEGMENT
          );

          // Contexte glissant calculé UNE fois par chapitre (les segments
          // précédents ne changent plus : la file est déjà figée).
          const contextes = new Map<number, string>();
          for (const segment of aTraduire) {
            const precedents = segmentsChapitre
              .filter((s) => s.position < segment.position)
              .slice(-MAX_SEGMENTS_CONTEXTE)
              .map((s) => ({ source: s.source, traduit: s.traduit }));
            const contexte = construireContexteGlissant({ segments: precedents });
            if (contexte.extrait) contextes.set(segment.id, contexte.extrait);
          }

          // --- Passes : 1 passage + 2 reprises AUTOMATIQUES ---
          let restants = aTraduire;
          let passe = 0;
          let chapitreAnnule = false;

          while (restants.length > 0) {
            restants = await traduireParLots(restants, contextes, contextePasse);
            if (controleur.signal.aborted) {
              chapitreAnnule = true;
              break;
            }
            if (restants.length === 0) break;

            const delai = DELAIS_REPRISE_MS[passe];
            if (delai === undefined) break; // deux reprises déjà faites
            passe += 1;
            await attendre(delai, controleur.signal);
          }

          // Fin du chapitre : assemblage 1:1, statut, moteur dominant.
          await cloreChapitre(
            supabase,
            chapitre,
            majChapitre,
            controleur.signal.aborted || chapitreAnnule,
            moteurDominant(contextePasse.moteurs)
          );

          if (chapitreAnnule) break;
          contextePasse.moteurs = new Map<string, number>();
        }

        // Livre entièrement traduit → statut `traduit` en base : c'est la
        // transition qui déclenche la notification « Traduction terminée »
        // (trigger SQL), donc la cloche cesse d'être vide.
        if (!controleur.signal.aborted) {
          await cloreLivreSiComplet(supabase, livre.id).catch(() => false);
        }
      } finally {
        // Débit RÉEL du passage : caractères traduits / secondes écoulées.
        // Publié pour que l'interface enregistre une estimation honnête de
        // la durée des prochaines traductions (aucune constante inventée).
        const dureeSec = (Date.now() - debutPassage) / 1000;
        if (
          contextePasse.caracteresFaits > 500 &&
          dureeSec > 3 &&
          typeof window !== 'undefined'
        ) {
          window.dispatchEvent(
            new CustomEvent('plume:debit-traduction', {
              detail: {
                caracteres: contextePasse.caracteresFaits,
                dureeSec,
                debit: contextePasse.caracteresFaits / dureeSec,
              },
            })
          );
        }
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

/**
 * Assemble les segments d'un chapitre : traduction + espacement
 * d'origine — structure préservée 1:1.
 */
export function assemblerChapitre(segments: Segment[]): string {
  return segments.map((s) => (s.traduit ?? '') + s.suite).join('');
}

/**
 * Moteur DOMINANT d'un chapitre : celui qui a traduit le plus de
 * segments. `null` si aucun segment n'a encore été traduit. Sert à
 * enregistrer, en base, quel fournisseur a réellement servi le
 * chapitre (traçabilité / affichage admin).
 */
export function moteurDominant(compte: Map<string, number>): string | null {
  let meilleur: string | null = null;
  let max = 0;
  for (const [id, n] of compte) {
    if (n > max) {
      max = n;
      meilleur = id;
    }
  }
  return meilleur;
}

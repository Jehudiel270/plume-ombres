// ============================================================
// lib/sante.ts — Supervision du studio (P1.6) et santé machine.
//
// RÈGLE DE CONFIDENTIALITÉ : aucune phrase issue d'un livre ne doit
// apparaître dans une métrique, un journal ou une page de suivi.
// Elle est garantie à DEUX niveaux :
//   1. en BASE : public.journal_traduction n'a aucune colonne de
//      contenu ; sante_studio / sante_machine ne renvoient que des
//      AGRÉGATS (voir supabase/migrations/..._monitoring.sql) ;
//   2. ICI : les normaliseurs ne recopient QUE des champs d'une
//      liste blanche typée. Toute clé inattendue renvoyée par la
//      base est IGNORÉE — une fuite accidentelle ne peut donc pas
//      atteindre la page de suivi.
//
// Le client est injecté sous forme d'un adaptateur .rpc(...), comme
// lib/admin-stats.ts : la mise en forme est testable sans Supabase.
// ============================================================

import type { ClientRpc } from './rate-limit';

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

/** Traductions par état (unité = chapitre). */
export interface TraductionsEtat {
  enCours: number;
  termine: number;
  erreur: number;
  aTraduire: number;
  total: number;
}

/** Segments par état (unité de traduction). */
export interface SegmentsEtat {
  enCours: number;
  fait: number;
  erreur: number;
  enAttente: number;
  total: number;
}

/** Durées mesurées (secondes) depuis les horodatages réels. */
export interface DureesSante {
  moyenneChapitreS: number | null;
  chapitresMesures: number;
  moyenneLivreS: number | null;
  livresMesures: number;
}

/** Tailles moyennes (caractères) — le texte n'est jamais renvoyé. */
export interface TaillesSante {
  caracteresMoyenChapitre: number;
  caracteresMoyenLivre: number;
  segmentsMoyenChapitre: number;
}

/** Taux d'échec par fournisseur de traduction. */
export interface FournisseurSante {
  fournisseur: string;
  succes: number;
  echecs: number;
  total: number;
  tauxEchec: number;
  dureeMoyenneMs: number;
  caracteres: number;
}

/** Caractères consommés par compte sur le mois. */
export interface UsageCompte {
  pseudo: string;
  plan: string;
  caracteres: number;
}

/** Caractères consommés par plan sur le mois. */
export interface UsagePlan {
  plan: string;
  comptes: number;
  caracteres: number;
}

/** Dernier événement d'erreur (type technique, jamais de message). */
export interface ErreurRecente {
  quand: string;
  fournisseur: string;
  categorie: string | null;
  statut: string;
}

/** Tableau de bord complet. */
export interface SanteStudio {
  genereLe: string;
  fenetreJours: number;
  traductions: TraductionsEtat;
  segments: SegmentsEtat;
  essaisEnCours: { chapitres: number; segments: number };
  durees: DureesSante;
  taille: TaillesSante;
  fournisseurs: FournisseurSante[];
  usageMois: {
    periode: string;
    total: number;
    parPlan: UsagePlan[];
    parCompte: UsageCompte[];
  };
  erreursRecentes: ErreurRecente[];
}

/** État machine minimal (cron externe). Aucun secret, aucun contenu. */
export interface SanteMachine {
  version: number;
  chapitresEnTraduction: number;
  segmentsEnCours: number;
  chapitresErreur: number;
  segmentsErreur: number;
  bloquesEnCours: number;
  fileEnRetard: boolean;
  evenements24h: number;
  erreurs24h: number;
  derniereTraduction: string | null;
}

/** Résultat d'une collecte : données OU message d'indisponibilité. */
export interface ResultatSante<T> {
  donnees: T | null;
  erreur: string | null;
}

// ------------------------------------------------------------
// Utilitaires d'assainissement
// ------------------------------------------------------------

function objet(valeur: unknown): Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null
    ? (valeur as Record<string, unknown>)
    : {};
}

function nombre(valeur: unknown): number {
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  return Number.isFinite(n) ? n : 0;
}

function nombreOuNull(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined) return null;
  const n = Number(valeur);
  return Number.isFinite(n) ? n : null;
}

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function texteOuNull(valeur: unknown): string | null {
  return typeof valeur === 'string' ? valeur : null;
}

function booleen(valeur: unknown): boolean {
  return valeur === true;
}

function liste(valeur: unknown): unknown[] {
  return Array.isArray(valeur) ? valeur : [];
}

// ------------------------------------------------------------
// Normalisation — LISTES BLANCHES strictes (anti-fuite)
// ------------------------------------------------------------

/** Assainit le JSON renvoyé par public.sante_studio. */
export function normaliserSanteStudio(brut: unknown): SanteStudio {
  const o = objet(brut);
  const dur = objet(o.durees);
  const taille = objet(o.taille);
  const usage = objet(o.usage_mois);
  const essais = objet(o.essais_en_cours);
  const tra = objet(o.traductions);
  const seg = objet(o.segments);

  return {
    genereLe: texte(o.genere_le),
    fenetreJours: nombre(o.fenetre_jours),
    traductions: {
      enCours: nombre(tra.en_cours),
      termine: nombre(tra.termine),
      erreur: nombre(tra.erreur),
      aTraduire: nombre(tra.a_traduire),
      total: nombre(tra.total),
    },
    segments: {
      enCours: nombre(seg.en_cours),
      fait: nombre(seg.fait),
      erreur: nombre(seg.erreur),
      enAttente: nombre(seg.en_attente),
      total: nombre(seg.total),
    },
    essaisEnCours: {
      chapitres: nombre(essais.chapitres),
      segments: nombre(essais.segments),
    },
    durees: {
      moyenneChapitreS: nombreOuNull(dur.moyenne_chapitre_s),
      chapitresMesures: nombre(dur.chapitres_mesures),
      moyenneLivreS: nombreOuNull(dur.moyenne_livre_s),
      livresMesures: nombre(dur.livres_mesures),
    },
    taille: {
      caracteresMoyenChapitre: nombre(taille.caracteres_moyen_chapitre),
      caracteresMoyenLivre: nombre(taille.caracteres_moyen_livre),
      segmentsMoyenChapitre: nombre(taille.segments_moyen_chapitre),
    },
    fournisseurs: liste(o.fournisseurs).map((f) => {
      const x = objet(f);
      return {
        fournisseur: texte(x.fournisseur, 'inconnu'),
        succes: nombre(x.succes),
        echecs: nombre(x.echecs),
        total: nombre(x.total),
        tauxEchec: nombre(x.taux_echec),
        dureeMoyenneMs: nombre(x.duree_moyenne_ms),
        caracteres: nombre(x.caracteres),
      };
    }),
    usageMois: {
      periode: texte(usage.periode),
      total: nombre(usage.total),
      parPlan: liste(usage.par_plan).map((p) => {
        const x = objet(p);
        return {
          plan: texte(x.plan, 'Gratuit'),
          comptes: nombre(x.comptes),
          caracteres: nombre(x.caracteres),
        };
      }),
      parCompte: liste(usage.par_compte).map((c) => {
        const x = objet(c);
        return {
          pseudo: texte(x.pseudo, 'lecteur'),
          plan: texte(x.plan, 'Gratuit'),
          caracteres: nombre(x.caracteres),
        };
      }),
    },
    erreursRecentes: liste(o.erreurs_recentes).map((e) => {
      const x = objet(e);
      return {
        quand: texte(x.quand),
        fournisseur: texte(x.fournisseur, 'inconnu'),
        categorie: texteOuNull(x.categorie),
        statut: texte(x.statut, 'echec'),
      };
    }),
  };
}

/** Assainit le JSON renvoyé par public.sante_machine. */
export function normaliserSanteMachine(brut: unknown): SanteMachine {
  const o = objet(brut);
  return {
    version: nombre(o.version),
    chapitresEnTraduction: nombre(o.chapitres_en_traduction),
    segmentsEnCours: nombre(o.segments_en_cours),
    chapitresErreur: nombre(o.chapitres_erreur),
    segmentsErreur: nombre(o.segments_erreur),
    bloquesEnCours: nombre(o.bloques_en_cours),
    fileEnRetard: booleen(o.file_en_retard),
    evenements24h: nombre(o.evenements_traduction_24h),
    erreurs24h: nombre(o.erreurs_traduction_24h),
    derniereTraduction: texteOuNull(o.derniere_traduction),
  };
}

// ------------------------------------------------------------
// Collecte
// ------------------------------------------------------------

/** Collecte le tableau de bord (RPC admin). */
export async function collecterSanteStudio(
  client: ClientRpc,
  jours = 30
): Promise<ResultatSante<SanteStudio>> {
  try {
    const { data, error } = await client.rpc('sante_studio', { p_jours: jours });
    if (error) return { donnees: null, erreur: error.message };
    return { donnees: normaliserSanteStudio(data), erreur: null };
  } catch (e) {
    return {
      donnees: null,
      erreur: e instanceof Error ? e.message : 'Erreur inconnue.',
    };
  }
}

/** Collecte l'état machine (RPC légère, lisible par anon). */
export async function collecterSanteMachine(
  client: ClientRpc
): Promise<ResultatSante<SanteMachine>> {
  try {
    const { data, error } = await client.rpc('sante_machine', {});
    if (error) return { donnees: null, erreur: error.message };
    return { donnees: normaliserSanteMachine(data), erreur: null };
  } catch (e) {
    return {
      donnees: null,
      erreur: e instanceof Error ? e.message : 'Erreur inconnue.',
    };
  }
}

// ------------------------------------------------------------
// Journalisation d'exploitation (P1.6) — best-effort, jamais bloquante
// ------------------------------------------------------------

export interface EvenementTraduction {
  fournisseur: string;
  /** 'succes' | 'vide' (réponse vide) | 'echec' (erreur levée). */
  statut: 'succes' | 'vide' | 'echec';
  categorie?: string | null;
  dureeMs?: number;
  caracteres?: number;
  essais?: number;
}

/**
 * Écrit un événement de traduction. N'envoie QUE des énumérations
 * techniques et des nombres : jamais de texte. Toute erreur du
 * journal est avalée — superviser ne doit JAMAIS casser le service.
 */
export async function journaliserTraduction(
  client: ClientRpc,
  evenement: EvenementTraduction
): Promise<boolean> {
  try {
    const { error } = await client.rpc('journaliser_traduction', {
      p_fournisseur: evenement.fournisseur,
      p_statut: evenement.statut,
      p_categorie: evenement.categorie ?? null,
      p_duree_ms: Math.max(0, Math.round(evenement.dureeMs ?? 0)),
      p_caracteres: Math.max(0, Math.round(evenement.caracteres ?? 0)),
      p_essais: Math.max(1, Math.round(evenement.essais ?? 1)),
    });
    return !error;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// État global + mise en forme (pures, testables)
// ------------------------------------------------------------

/** Seuil d'erreurs sur 24 h au-delà duquel l'état est « dégradé ». */
export const SEUIL_ERREURS_24H = 20;

export type EtatGlobal = 'ok' | 'degrade' | 'panne';

/**
 * État global déduit de l'état machine :
 *   * file bloquée (en cours sans progression > 15 min) → dégradé ;
 *   * trop d'erreurs de traduction sur 24 h → dégradé ;
 *   * sinon → ok. (« panne » est réservé à une base injoignable,
 *     décidé par la route, qui n'a pas de données à analyser.)
 */
export function etatGlobal(machine: SanteMachine): EtatGlobal {
  if (machine.fileEnRetard) return 'degrade';
  if (machine.erreurs24h >= SEUIL_ERREURS_24H) return 'degrade';
  return 'ok';
}

/** Libellés lisibles des moteurs (sans instancier de client). */
export const LIBELLES_FOURNISSEURS: Record<string, string> = {
  libretranslate: 'LibreTranslate',
  gemini: 'Gemini',
  google: 'Google (libre)',
  mymemory: 'MyMemory',
};

/** Nom d'affichage d'un moteur (retombe sur l'identifiant brut). */
export function libelleFournisseur(id: string): string {
  return LIBELLES_FOURNISSEURS[id] ?? id;
}

/** « 12 345 » (séparateur de milliers français). */
export function formaterNombre(valeur: number): string {
  return Math.round(valeur).toLocaleString('fr-FR');
}

/** « 25,2 s » / « 5 min 51 » (à partir de secondes). */
export function formaterSecondes(secondes: number | null): string {
  if (secondes === null || !Number.isFinite(secondes)) return '—';
  if (secondes < 60) return `${secondes.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;
  const m = Math.floor(secondes / 60);
  const s = Math.round(secondes % 60);
  return `${m} min ${String(s).padStart(2, '0')}`;
}

/** « 42 ms » / « 1,2 s » (à partir de millisecondes). */
export function formaterMillisecondes(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;
}

/** « 12,3 % » à partir d'un taux (0..1). */
export function formaterTaux(taux: number): string {
  if (!Number.isFinite(taux)) return '—';
  return `${(taux * 100).toLocaleString('fr-FR', {
    maximumFractionDigits: 1,
  })} %`;
}

/** Horodatage court « 02 oct. 10:42 » (usage opérateur). */
export function formaterHorodatage(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

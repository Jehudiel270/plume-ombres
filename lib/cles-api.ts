// ============================================================
// lib/cles-api.ts — RÉSERVOIR DE CLÉS D'API (côté serveur).
//
// Système de succession multi-fournisseurs géré depuis l'onglet
// « Clés API » du tableau de bord (table `cles_api`, migration
// 20261113000002) :
//
//   * PLUSIEURS fournisseurs (Gemini, DeepSeek, OpenAI, OpenRouter,
//     Mistral, autre) et PLUSIEURS clés par fournisseur (ex. 3
//     clés Gemini) ;
//   * SUCCESSION : les clés sont essayées DANS L'ORDRE (position).
//     Une clé qui échoue trop souvent est mise au repos (cooldown)
//     puis réintègre automatiquement la rotation — les autres
//     clés continuent de servir entre-temps ;
//   * AFFECTATION PAR ABONNEMENT : une clé peut être réservée à un
//     niveau (« Passionné et plus », « Illimité »…) — même échelle
//     que les interrupteurs de fonctionnalités ;
//   * la variable d'environnement (GEMINI_API_KEY) garde la
//     priorité : elle est toujours essayée avant le réservoir.
//
// SÉCURITÉ :
//   * la table n'est lisible que par un administrateur (RLS) ;
//     les consommateurs serveur lisent via le rôle service
//     (lib/supabase/service) quand il est configuré ;
//   * une valeur de clé ne quitte JAMAIS le serveur : les écrans
//     ne reçoivent qu'un aperçu masqué (AIza…x9Qz) ;
//   * aucune fonction ici n'est importée par le navigateur.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import type { NiveauPlan } from '@/lib/fonctionnalites/registre';
import { creerClientService } from '@/lib/supabase/service';

// Catalogue des fournisseurs (fichier pur, partagé avec les écrans).
export {
  type FournisseurCle,
  type MetaFournisseur,
  FOURNISSEURS,
  metaFournisseur,
  estFournisseurConnu,
} from '@/lib/cles-api-fournisseurs';

import {
  type FournisseurCle,
  estFournisseurConnu,
} from '@/lib/cles-api-fournisseurs';

// ------------------------------------------------------------
// Succession et affectation par abonnement
// ------------------------------------------------------------

/** Échelle des niveaux (même logique que les interrupteurs). */
const RANG_NIVEAU: Record<NiveauPlan, number> = {
  gratuit: 0,
  lecteur: 1,
  passionne: 2,
  illimite: 3,
};

/**
 * Une clé sert-elle ce niveau d'abonnement ? `planMinimal` null =
 * tous les abonnements ; sinon la clé est réservée au niveau indiqué
 * ET AUX NIVEAUX AU-DESSUS (comme les modules : « Passionné et plus »).
 * `niveau` null = requête sans filtrage (essai par un administrateur).
 */
export function cleServitPourPlan(
  planMinimal: string | null,
  niveau: NiveauPlan | null
): boolean {
  if (planMinimal === null || niveau === null) return true;
  const rangCle = RANG_NIVEAU[planMinimal as NiveauPlan];
  const rangNiveau = RANG_NIVEAU[niveau];
  if (rangCle === undefined || rangNiveau === undefined) return true;
  return rangNiveau >= rangCle;
}

/** Temps de repos automatique après des échecs répétés (1 minute). */
export const COOLDOWN_CLE_MS = 60_000;
/** Nombre d'échecs de suite qui déclenche le temps de repos. */
export const SEUIL_ECHECS = 3;

// ------------------------------------------------------------
// Lignes (lecture défensive de la table)
// ------------------------------------------------------------

export interface LigneCleApi {
  id: string;
  fournisseur: FournisseurCle;
  libelle: string;
  valeur: string;
  planMinimal: 'lecteur' | 'passionne' | 'illimite' | null;
  position: number;
  actif: boolean;
  echecsConsecutifs: number;
  suspendueLe: string | null;
  derniereErreur: string | null;
  majLe: string | null;
}

/** Une clé est-elle utilisable à cet instant ? */
export function cleUsable(ligne: LigneCleApi, maintenant: number = Date.now()): boolean {
  if (!ligne.actif) return false;
  if (!ligne.suspendueLe) return true;
  const instant = Date.parse(ligne.suspendueLe);
  if (Number.isNaN(instant)) return true;
  return maintenant - instant >= COOLDOWN_CLE_MS;
}

/** Lit toutes les clés (session admin, ou rôle service). Table absente → []. */
export async function listerClesApi(
  client: SupabaseClient
): Promise<LigneCleApi[]> {
  const { data, error } = await client
    .from('cles_api')
    .select(
      'id, fournisseur, libelle, valeur, plan_minimal, position, actif, echecs_consecutifs, suspendue_le, derniere_erreur, maj_le'
    )
    .order('position', { ascending: true })
    .order('cree_le', { ascending: true });
  if (error) return [];

  const lignes: LigneCleApi[] = [];
  for (const brut of Array.isArray(data) ? data : []) {
    const l = brut as Record<string, unknown>;
    if (typeof l.id !== 'string' || typeof l.valeur !== 'string') continue;
    lignes.push({
      id: l.id,
      fournisseur: estFournisseurConnu(l.fournisseur) ? l.fournisseur : 'autre',
      libelle: typeof l.libelle === 'string' && l.libelle.trim() ? l.libelle.trim() : 'Clé',
      valeur: l.valeur,
      planMinimal:
        l.plan_minimal === 'lecteur' || l.plan_minimal === 'passionne' || l.plan_minimal === 'illimite'
          ? l.plan_minimal
          : null,
      position: typeof l.position === 'number' && Number.isFinite(l.position) ? l.position : 0,
      actif: l.actif !== false,
      echecsConsecutifs:
        typeof l.echecs_consecutifs === 'number' && l.echecs_consecutifs > 0
          ? l.echecs_consecutifs
          : 0,
      suspendueLe: typeof l.suspendue_le === 'string' ? l.suspendue_le : null,
      derniereErreur: typeof l.derniere_erreur === 'string' ? l.derniere_erreur : null,
      majLe: typeof l.maj_le === 'string' ? l.maj_le : null,
    });
  }
  return lignes;
}

/**
 * Clés D'UN FOURNISSEUR essayées dans l'ordre pour un niveau
 * d'abonnement : actives, hors temps de repos, dont l'affectation
 * couvre le niveau demandé (null = sans filtrage).
 */
export function successionPourPlan(
  cles: readonly LigneCleApi[],
  fournisseur: FournisseurCle,
  niveau: NiveauPlan | null,
  maintenant: number = Date.now()
): LigneCleApi[] {
  return cles
    .filter(
      (c) =>
        c.fournisseur === fournisseur &&
        cleServitPourPlan(c.planMinimal, niveau) &&
        cleUsable(c, maintenant)
    )
    .sort((a, b) => a.position - b.position);
}

// ------------------------------------------------------------
// Résolution pour les consommateurs (assistance, traduction)
// ------------------------------------------------------------

/**
 * Clés Gemini à essayer, DANS L'ORDRE : variable d'environnement
 * d'abord (voie officielle), puis réservoir en base filtré par le
 * niveau d'abonnement de l'appelant (null = sans filtrage).
 * `session` (facultatif) sert de repli si le rôle service n'est pas
 * configuré : le réservoir n'est alors lisible que par un admin.
 */
export async function resoudreClesGemini(options: {
  niveau?: NiveauPlan | null;
  session?: SupabaseClient;
}): Promise<{ cles: LigneCleApi[]; sourceEnv: string | null }> {
  const sourceEnv = process.env.GEMINI_API_KEY?.trim() || null;
  const client = creerClientService() ?? options.session ?? null;
  const cles = client
    ? successionPourPlan(await listerClesApi(client), 'gemini', options.niveau ?? null)
    : [];
  return { cles, sourceEnv };
}

// ------------------------------------------------------------
// Signaux de santé (cooldown automatique)
// ------------------------------------------------------------

/** Erreur identifiant une clé elle-même (401/403/429 — quota ou accès). */
export function echecVautPourCle(message: string): boolean {
  return /40[13]|429|quota|permission|invalid api key|api key/i.test(message);
}

async function ecrireSignal(
  id: string,
  modifications: Record<string, unknown>
): Promise<void> {
  const client = creerClientService();
  if (!client) return; // Sans rôle service : les signaux sont ignorés.
  await client
    .from('cles_api')
    .update({ ...modifications, maj_le: new Date().toISOString() })
    .eq('id', id);
}

/**
 * Note un échec attribuable à la clé (quota, accès refusé). Après
 * SEUIL_ECHECS échecs de suite, la clé prend un temps de repos de
 * COOLDOWN_CLE_MS puis réintègre la rotation automatiquement.
 * Silencieux : un signal raté ne doit jamais faire échouer un appel.
 */
export async function signalerEchecCle(id: string, message: string): Promise<void> {
  const echecs = await (async () => {
    const client = creerClientService();
    if (!client) return null;
    const { data } = await client
      .from('cles_api')
      .select('echecs_consecutifs')
      .eq('id', id)
      .maybeSingle();
    const ligne = data as { echecs_consecutifs?: unknown } | null;
    return typeof ligne?.echecs_consecutifs === 'number' ? ligne.echecs_consecutifs : 0;
  })();
  const suivants = echecs === null ? SEUIL_ECHECS : echecs + 1;
  await ecrireSignal(id, {
    echecs_consecutifs: Math.max(1, suivants),
    suspendue_le: suivants >= SEUIL_ECHECS ? new Date().toISOString() : null,
    derniere_erreur: message.slice(0, 300),
  });
}

/** Note une réussite : la clé redevient pleinement disponible. */
export async function signalerSuccesCle(id: string): Promise<void> {
  await ecrireSignal(id, {
    echecs_consecutifs: 0,
    suspendue_le: null,
    derniere_erreur: null,
  });
}

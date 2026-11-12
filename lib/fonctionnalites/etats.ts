// ============================================================
// lib/fonctionnalites/etats.ts — ÉTATS DES INTERRUPTEURS (serveur).
//
// Les états choisis par l'administrateur vivent dans la table
// `fonctionnalites_etats` (migration 20261112000001). Lecture par
// l'API REST Supabase : compatible edge (proxy) ET Node, avec un
// cache de 30 s pour ne pas alourdir chaque requête. Si la table
// n'existe pas encore (migrations du chantier non appliquées) ou en
// cas de panne, on retombe sur les DÉFAUTS du registre : tout est
// éteint — un module ne s'ouvre jamais par accident.
//
// Le serveur est l'autorité (règle du brief) :
//   * `verdictPourChemin` — barrière GROSSIÈRE du proxy (éteint → 404) ;
//   * `verifierAccesModule` — barrière FINE côté page (plan,
//     déploiement) : à appeler dans chaque page de module ;
//   * `verifierModuleApi` — même barrière fine pour une route d'API.
// ============================================================

import { NextResponse } from 'next/server';

import {
  INTERRUPTEURS,
  etatParDefaut,
  evaluerInterrupteur,
  interrupteurParCle,
  interrupteurPourChemin,
  niveauPlanDepuisCode,
  type DefInterrupteur,
  type EtatInterrupteur,
  type NiveauPlan,
  type VerdictInterrupteur,
} from '@/lib/fonctionnalites/registre';

/** Durée de vie du cache d'états (ms). Un changement admin se propage
 *  donc au plus tard 30 s plus tard, sans redéploiement. */
const DUREE_CACHE_MS = 30_000;

let cache: { etats: Record<string, EtatInterrupteur>; luLe: number } | null = null;

/** Ramène une ligne brute de la table à un état sûr (données validées). */
function ligneVersEtat(ligne: Record<string, unknown>): EtatInterrupteur | null {
  const cle = typeof ligne.cle === 'string' ? ligne.cle : '';
  if (!cle) return null;
  const deploiementBrut = Number(ligne.deploiement);
  const plan = typeof ligne.plan_minimal === 'string' ? ligne.plan_minimal : null;
  return {
    actif: ligne.actif === true,
    planMinimal: (['gratuit', 'lecteur', 'passionne', 'illimite'] as const).includes(
      plan as NiveauPlan
    )
      ? (plan as NiveauPlan)
      : null,
    deploiement: Number.isFinite(deploiementBrut)
      ? Math.max(0, Math.min(100, Math.round(deploiementBrut)))
      : 100,
    juristeOk: ligne.juriste_ok === true,
    majLe: typeof ligne.maj_le === 'string' ? ligne.maj_le : undefined,
    majPar: typeof ligne.maj_par === 'string' ? ligne.maj_par : null,
  };
}

/**
 * Lit les états enregistrés (cache 30 s). Retourne une carte clé →
 * état ; les clés absentes suivent le défaut du registre.
 */
export async function lireEtats(force = false): Promise<Record<string, EtatInterrupteur>> {
  if (!force && cache && Date.now() - cache.luLe < DUREE_CACHE_MS) {
    return cache.etats;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const cleAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !cleAnon) {
    // Configuration absente (build, aperçu sans variables) : défauts.
    return {};
  }
  try {
    const reponse = await fetch(
      `${url}/rest/v1/fonctionnalites_etats?select=cle,actif,plan_minimal,deploiement,juriste_ok,maj_le,maj_par`,
      {
        headers: {
          apikey: cleAnon,
          Authorization: `Bearer ${cleAnon}`,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(4_000),
      }
    );
    if (!reponse.ok) {
      cache = { etats: {}, luLe: Date.now() };
      return {};
    }
    const lignes = (await reponse.json()) as Array<Record<string, unknown>>;
    const etats: Record<string, EtatInterrupteur> = {};
    for (const ligne of lignes) {
      const etat = ligneVersEtat(ligne);
      if (etat && typeof ligne.cle === 'string') etats[ligne.cle] = etat;
    }
    cache = { etats, luLe: Date.now() };
    return etats;
  } catch {
    // Panne réseau / table absente : défauts (tout éteint), cache court
    // pour retenter bientôt sans marteler la base.
    cache = { etats: {}, luLe: Date.now() - DUREE_CACHE_MS + 5_000 };
    return {};
  }
}

/** Vide le cache (à appeler après un changement d'état côté admin). */
export function viderCacheEtats(): void {
  cache = null;
}

/** État EFFECTIF d'un interrupteur : défaut du registre fusionné avec la base. */
export function etatEffectif(
  def: DefInterrupteur,
  etats: Record<string, EtatInterrupteur>
): EtatInterrupteur {
  const enregistre = etats[def.cle];
  if (!enregistre) return etatParDefaut(def);
  return {
    ...etatParDefaut(def),
    ...enregistre,
    // Un module à risque ne peut jamais être ouvert sans confirmation.
    juristeOk: def.risqueJuridique ? enregistre.juristeOk === true : undefined,
  };
}

/** Verdict GROSSIER pour une route (barrière du proxy, sans lecteur). */
export async function verdictPourChemin(
  chemin: string,
  portee: 'pages' | 'api' = 'pages'
): Promise<{ def: DefInterrupteur | null; verdict: VerdictInterrupteur }> {
  const def = interrupteurPourChemin(chemin, portee);
  if (!def) return { def: null, verdict: { ouvert: true, raison: 'eteint' } };
  const etats = await lireEtats();
  return {
    def,
    verdict: evaluerInterrupteur(def, etatEffectif(def, etats)),
  };
}

export interface ResultatModule {
  ouvert: boolean;
  def: DefInterrupteur | null;
  verdict: VerdictInterrupteur;
  /** Réponse prête à renvoyer pour une route d'API (403/404 selon la raison). */
  reponseApi?: NextResponse;
  /** Message lisible pour une page (redirection gérée par l'appelant). */
  message: string;
}

/**
 * Barrière FINE pour une PAGE de module (à appeler côté serveur, avec
 * le contexte du lecteur). Renvoie `ouvert: true` si la page peut se
 * rendre ; sinon le message indique quoi faire (redirection vers
 * /abonnement pour un problème de plan).
 */
export async function verifierAccesModule(
  cle: string,
  lecteur: { utilisateurId: string | null; codePlan?: string | null }
): Promise<ResultatModule> {
  const def = interrupteurParCle(cle);
  if (!def) {
    return {
      ouvert: false,
      def: null,
      verdict: { ouvert: false, raison: 'eteint' },
      message: 'Fonctionnalité inconnue.',
    };
  }
  const etats = await lireEtats();
  const lecteurComplet = {
    utilisateurId: lecteur.utilisateurId,
    niveauPlan: niveauPlanDepuisCode(lecteur.codePlan) as NiveauPlan,
  };
  const verdict = evaluerInterrupteur(def, etatEffectif(def, etats), lecteurComplet);
  if (verdict.ouvert) {
    return { ouvert: true, def, verdict, message: '' };
  }
  const messages: Record<string, string> = {
    eteint: 'Cette fonctionnalité est fermée pour le moment.',
    juriste: 'Cette fonctionnalité attend une validation juridique.',
    deploiement:
      'Cette fonctionnalité arrive progressivement : elle n’est pas encore ouverte à votre compte.',
    plan: 'Cette fonctionnalité demande un abonnement supérieur.',
  };
  return { ouvert: false, def, verdict, message: messages[verdict.raison] ?? '' };
}

/**
 * Barrière FINE pour une ROUTE D'API de module : module éteint ou hors
 * déploiement → 404 (comme si la route n'existait pas) ; plan
 * insuffisant → 403. À appeler AVANT toute autre lecture.
 */
export async function verifierModuleApi(
  cle: string,
  lecteur: { utilisateurId: string | null; codePlan?: string | null }
): Promise<ResultatModule> {
  const resultat = await verifierAccesModule(cle, lecteur);
  if (resultat.ouvert) return resultat;
  const statut =
    resultat.verdict.raison === 'plan' ? 403 : resultat.verdict.raison === 'juriste' ? 404 : 404;
  resultat.reponseApi = NextResponse.json(
    { erreur: resultat.message || 'Fonctionnalité indisponible.' },
    { status: statut }
  );
  return resultat;
}

/** Liste des définitions avec leur état effectif (page admin). */
export async function listeAvecEtats(): Promise<
  Array<{ def: DefInterrupteur; etat: EtatInterrupteur }>
> {
  const etats = await lireEtats(true);
  return INTERRUPTEURS_TRIES.map((def) => ({ def, etat: etatEffectif(def, etats) }));
}

/** Tri stable : par groupe puis par libellé (affichage admin). */
const INTERRUPTEURS_TRIES = [...INTERRUPTEURS].sort((a, b) => {
  if (a.groupe !== b.groupe) return a.groupe.localeCompare(b.groupe, 'fr');
  return a.libelle.localeCompare(b.libelle, 'fr');
});

// ============================================================
// travaux-traduction.ts — Travaux de traduction PERSISTANTS.
//
// Un « travail » décrit une traduction à faire sur un livre. Il vit en
// base (public.travaux_traduction) : fermer l'onglet n'annule plus
// rien, un exécutant serveur reprend le travail là où il en est.
//
// Ce module est volontairement JUMEAU côté client et côté serveur :
//  - le navigateur appelle `creerTravail()` (RLS « own » : le
//    propriétaire par défaut est `auth.uid()`) ;
//  - l'exécutant serveur (service role, sans session) appelle
//    `prochainTravail()`, `avancerTravail()` et `lireTravail()` en
//    passant le client service role.
//
// Aucune dépendance à `next` : uniquement supabase-js, pour rester
// importable depuis une fonction Netlify, un script tsx et un
// composant client.
//
// EXCLUSIVITÉ D'EXÉCUTION — le BAIL (voir prendreBail/renouvelerBail).
// Le battement seul ne suffisait pas : c'est un signe de vie, pas une
// propriété. Un bail explicite (executeur + bail_expire_le) désigne UN
// titulaire à la fois ; l'attribution est un UPDATE conditionnel
// atomique (CAS) tranché par PostgreSQL, donc deux exécutants
// concurrents ne peuvent pas gagner tous les deux.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** États d'un travail (alignés sur la contrainte CHECK en base). */
export type StatutTravail =
  | 'en_attente'
  | 'en_cours'
  | 'termine'
  | 'erreur'
  | 'annule';

/** États pendant lesquels un travail est encore « vivant ». */
export const STATUTS_ACTIFS: readonly StatutTravail[] = ['en_attente', 'en_cours'];

/**
 * Âge au-delà duquel un travail `en_cours` sans battement est considéré
 * comme ABANDONNÉ (exécutant tué, déploiement, timeout) et peut être
 * repris. Doit rester supérieur à la durée d'un passage d'exécutant.
 */
export const SEUIL_BATTEMENT_MS = 2 * 60 * 1000; // 2 min

/**
 * Durée d'un bail pris par l'EXÉCUTANT SERVEUR. Doit couvrir la durée
 * d'un lot (le bail est renouvelé avant chaque lot) avec de la marge :
 * un bail trop court expirerait en pleine traduction et un autre
 * exécutant prendrait le relais pour rien.
 */
export const DUREE_BAIL_SERVEUR_MS = 2 * 60 * 1000; // 2 min

/**
 * Durée d'un bail pris par le NAVIGATEUR. Renouvelé toutes les 20 s :
 * trois battements manqués (onglet fermé, onglet gelé) avant reprise
 * par l'exécutant serveur.
 */
export const DUREE_BAIL_NAVIGATEUR_MS = 60 * 1000; // 1 min

/** Une ligne de public.travaux_traduction. */
export interface TravailTraduction {
  id: string;
  livre_id: string;
  proprietaire_id: string;
  statut: StatutTravail;
  /** Segments traités (succès + échecs) depuis la création. */
  traites: number;
  /** Segments à traduire (0 = pas encore calculé par l'exécutant). */
  total: number;
  /** Segments restés en erreur. */
  erreurs: number;
  cree_le: string;
  maj_le: string;
  battement_le: string | null;
  /** Titulaire du bail d'exécution ; `null` = travail libre. */
  executeur: string | null;
  /** Fin de validité du bail ; `null` = travail libre. */
  bail_expire_le: string | null;
}

/** Avancement lisible (0-100, borné). */
export interface ProgressionTravail {
  pourcentage: number;
  restants: number;
}

const STATUTS: readonly StatutTravail[] = [
  'en_attente',
  'en_cours',
  'termine',
  'erreur',
  'annule',
];

/** Vrai si le statut fait partie des états « vivants ». */
export function estTravailActif(statut: StatutTravail): boolean {
  return STATUTS_ACTIFS.includes(statut);
}

/** Avancement d'un travail, borné à [0, 100] ; total inconnu → 0 %. */
export function progressionTravail(travail: {
  traites: number;
  total: number;
}): ProgressionTravail {
  const total = Math.max(0, travail.total || 0);
  const traites = Math.max(0, travail.traites || 0);
  if (total <= 0) return { pourcentage: 0, restants: 0 };
  return {
    pourcentage: Math.min(100, Math.round((traites / total) * 100)),
    restants: Math.max(0, total - traites),
  };
}

function entierPositif(valeur: unknown): number {
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Normalise une ligne brute ; `null` si elle est inutilisable. */
export function assainirTravail(brut: unknown): TravailTraduction | null {
  if (!brut || typeof brut !== 'object') return null;
  const ligne = brut as Record<string, unknown>;
  const id = typeof ligne.id === 'string' ? ligne.id : '';
  const livreId = typeof ligne.livre_id === 'string' ? ligne.livre_id : '';
  const proprietaireId =
    typeof ligne.proprietaire_id === 'string' ? ligne.proprietaire_id : '';
  const statut = STATUTS.includes(ligne.statut as StatutTravail)
    ? (ligne.statut as StatutTravail)
    : 'en_attente';
  if (!id || !livreId || !proprietaireId) return null;
  return {
    id,
    livre_id: livreId,
    proprietaire_id: proprietaireId,
    statut,
    traites: entierPositif(ligne.traites),
    total: entierPositif(ligne.total),
    erreurs: entierPositif(ligne.erreurs),
    cree_le: typeof ligne.cree_le === 'string' ? ligne.cree_le : '',
    maj_le: typeof ligne.maj_le === 'string' ? ligne.maj_le : '',
    battement_le: typeof ligne.battement_le === 'string' ? ligne.battement_le : null,
    executeur: typeof ligne.executeur === 'string' && ligne.executeur ? ligne.executeur : null,
    bail_expire_le:
      typeof ligne.bail_expire_le === 'string' ? ligne.bail_expire_le : null,
  };
}

/** Travail actif du livre, s'il existe (le plus récent). */
async function travailActifDuLivre(
  supabase: SupabaseClient,
  livreId: string
): Promise<TravailTraduction | null> {
  const { data, error } = await supabase
    .from('travaux_traduction')
    .select('*')
    .eq('livre_id', livreId)
    .in('statut', [...STATUTS_ACTIFS])
    .order('cree_le', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return assainirTravail(data);
}

export interface OptionsCreationTravail {
  livreId: string;
  /**
   * Nombre de segments à traduire. Facultatif : à 0 (défaut), le
   * premier passage de l'exécutant le calcule et le fige.
   */
  total?: number;
  /**
   * Destinataire. À OMETTRE côté navigateur (défaut base : auth.uid()) ;
   * OBLIGATOIRE côté serveur (service role n'a pas de session).
   */
  proprietaireId?: string;
  /**
   * `en_cours` quand c'est le NAVIGATEUR qui travaille tout de suite :
   * le battement est posé à la création, donc l'exécutant serveur ne
   * prend pas la main tant que l'onglet donne signe de vie. À laisser
   * à `en_attente` pour confier le travail directement au serveur.
   */
  statutInitial?: 'en_attente' | 'en_cours';
}

/**
 * Crée (ou retrouve) le travail actif d'un livre.
 *
 * Idempotent : si un travail `en_attente`/`en_cours` existe déjà pour ce
 * livre, il est renvoyé tel quel — deux onglets (ou un onglet + le
 * worker) ne se marchent pas dessus. L'index d'unicité partiel en base
 * garantit la même chose en cas de course entre deux INSERT.
 *
 * Cas du NAVIGATEUR (`statutInitial: 'en_cours'`) sur un travail déjà
 * `en_attente` : le travail est PROMU `en_cours` avec un battement. Sans
 * cette promotion, l'onglet battrait sur un travail resté `en_attente`,
 * que l'exécutant serveur prendrait aussitôt : les deux traduiraient le
 * même livre en parallèle.
 */
export async function creerTravail(
  supabase: SupabaseClient,
  options: OptionsCreationTravail
): Promise<TravailTraduction> {
  const livreId = (options.livreId ?? '').trim();
  if (!livreId) throw new Error('Travail sans livre.');

  const existant = await travailActifDuLivre(supabase, livreId);
  if (existant) {
    if (options.statutInitial === 'en_cours' && existant.statut === 'en_attente') {
      return avancerTravail(supabase, existant.id, {
        statut: 'en_cours',
        battement: true,
      });
    }
    return existant;
  }

  const ligne: Record<string, unknown> = {
    livre_id: livreId,
    total: entierPositif(options.total),
  };
  if (options.statutInitial === 'en_cours') {
    ligne.statut = 'en_cours';
    ligne.battement_le = new Date().toISOString();
  }
  const proprietaireId = options.proprietaireId?.trim();
  if (proprietaireId) ligne.proprietaire_id = proprietaireId;

  const { data, error } = await supabase
    .from('travaux_traduction')
    .insert(ligne)
    .select('*')
    .single();

  if (error) {
    // Course entre deux créations : l'index d'unicité a refusé la
    // seconde. On relit le travail gagnant plutôt que d'échouer.
    if (error.code === '23505') {
      const gagnant = await travailActifDuLivre(supabase, livreId);
      if (gagnant) return gagnant;
    }
    throw error;
  }

  const cree = assainirTravail(data);
  if (!cree) throw new Error('Travail créé illisible.');
  return cree;
}

/**
 * Travail courant d'un livre : le travail ACTIF s'il y en a un, sinon le
 * plus récent (terminé / en erreur / annulé) — pratique pour afficher
 * « dernière traduction : terminée ».
 */
export async function lireTravail(
  supabase: SupabaseClient,
  livreId: string
): Promise<TravailTraduction | null> {
  const id = (livreId ?? '').trim();
  if (!id) return null;

  const actif = await travailActifDuLivre(supabase, id);
  if (actif) return actif;

  const { data, error } = await supabase
    .from('travaux_traduction')
    .select('*')
    .eq('livre_id', id)
    .order('cree_le', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return assainirTravail(data);
}

/** Travail par identifiant (exécutant : relecture après mise à jour). */
export async function lireTravailParId(
  supabase: SupabaseClient,
  travailId: string
): Promise<TravailTraduction | null> {
  const id = (travailId ?? '').trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from('travaux_traduction')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return assainirTravail(data);
}

export interface AvanceeTravail {
  traites?: number;
  total?: number;
  erreurs?: number;
  statut?: StatutTravail;
  /** Pose `battement_le = now()` : signe de vie de l'exécutant. */
  battement?: boolean;
}

/**
 * Met à jour les compteurs / le statut d'un travail.
 *
 * Utilisé par le navigateur (progression affichée) comme par
 * l'exécutant serveur (compteurs + battement). Seuls les champs fournis
 * sont écrits : un appel `{ battement: true }` ne touche à rien d'autre.
 * `maj_le` est de toute façon reposé par un trigger en base.
 */
export async function avancerTravail(
  supabase: SupabaseClient,
  travailId: string,
  avancee: AvanceeTravail
): Promise<TravailTraduction> {
  const id = (travailId ?? '').trim();
  if (!id) throw new Error('Travail sans identifiant.');

  const patch: Record<string, unknown> = {};
  if (avancee.traites !== undefined) patch.traites = entierPositif(avancee.traites);
  if (avancee.total !== undefined) patch.total = entierPositif(avancee.total);
  if (avancee.erreurs !== undefined) patch.erreurs = entierPositif(avancee.erreurs);
  if (avancee.statut !== undefined) patch.statut = avancee.statut;
  if (avancee.battement) patch.battement_le = new Date().toISOString();
  if (Object.keys(patch).length === 0) {
    const inchange = await lireTravailParId(supabase, id);
    if (!inchange) throw new Error('Travail introuvable.');
    return inchange;
  }

  const { data, error } = await supabase
    .from('travaux_traduction')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    // Aucune ligne touchée : travail supprimé entre-temps.
    if (error.code === 'PGRST116') throw new Error('Travail introuvable.');
    throw error;
  }
  const avance = assainirTravail(data);
  if (!avance) throw new Error('Travail mis à jour illisible.');
  return avance;
}

/** Marque un travail comme annulé (le navigateur peut le faire). */
export async function annulerTravail(
  supabase: SupabaseClient,
  travailId: string
): Promise<TravailTraduction> {
  return avancerTravail(supabase, travailId, { statut: 'annule' });
}

// ------------------------------------------------------------
// BAIL D'EXÉCUTION — un seul titulaire à la fois
// ------------------------------------------------------------
//
// `executeur` désigne le titulaire ; `bail_expire_le` sa fenêtre de
// validité. Les trois opérations sont des UPDATE CONDITIONNELS : c'est
// PostgreSQL qui tranche, pas l'ordre des appels TS. Un exécutant ne
// peut donc écrire un lot que s'il est encore titulaire.

/**
 * Identifiant unique par passage d'exécutant. Le préfixe rend les
 * journaux lisibles : `serveur:` (route cron) / `onglet:` (navigateur).
 */
export function identifiantExecutant(prefixe: string): string {
  const cryptoApi = globalThis.crypto;
  const aleatoire =
    cryptoApi && typeof cryptoApi.randomUUID === 'function'
      ? cryptoApi.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefixe}:${aleatoire}`;
}

/** Durée de bail validée (positive, finie). */
function dureeBailValide(dureeMs: number): number {
  if (!Number.isFinite(dureeMs) || dureeMs <= 0) {
    throw new Error('Durée de bail invalide.');
  }
  return Math.floor(dureeMs);
}

/** Exécutant privé de son bail : il doit abandonner SANS écrire. */
export class ErreurBailPerdu extends Error {
  constructor(travailId: string) {
    super(`Bail perdu sur le travail ${travailId}.`);
    this.name = 'ErreurBailPerdu';
  }
}

export interface OptionsPriseBail {
  /** Identifiant du candidat (`identifiantExecutant('serveur')`). */
  executeur: string;
  /** Durée du bail ; à renouveler avant qu'elle n'expire. */
  dureeMs: number;
  /**
   * Écrase un bail détenu par un AUTRE exécutant. Réservé au navigateur :
   * quand l'utilisateur clique « Tout traduire », il passe avant
   * l'exécutant serveur, qui perdra son bail au prochain renouvellement
   * et abandonnera son lot.
   */
  forcer?: boolean;
}

/**
 * Prend le bail d'un travail. `true` seulement si l'appel a RÉELLEMENT
 * obtenu le bail.
 *
 * CAS : un seul UPDATE conditionnel (`bail_expire_le IS NULL OR
 * bail_expire_le < maintenant`) qui n'aboutit que si le bail est libre
 * ou échu. Deux appels concurrents : PostgreSQL reverrouve la ligne et
 * réévalue la condition après le premier gagnant, donc un seul obtient
 * une ligne en retour.
 *
 * Effets : pose `statut = 'en_cours'` et le battement (compatibilité
 * avec les travaux antérieurs au bail), sans toucher aux compteurs.
 */
export async function prendreBail(
  supabase: SupabaseClient,
  travailId: string,
  options: OptionsPriseBail
): Promise<boolean> {
  const id = (travailId ?? '').trim();
  const executeur = (options.executeur ?? '').trim();
  if (!id) throw new Error('Bail sans travail.');
  if (!executeur) throw new Error('Bail sans exécutant.');
  const duree = dureeBailValide(options.dureeMs);

  const maintenant = new Date();
  const maintenantIso = maintenant.toISOString();
  const expiration = new Date(maintenant.getTime() + duree).toISOString();

  let requete = supabase
    .from('travaux_traduction')
    .update({
      executeur,
      bail_expire_le: expiration,
      battement_le: maintenantIso,
      statut: 'en_cours',
    })
    .eq('id', id)
    // Un travail clos n'est jamais repris, même avec un bail libre.
    .in('statut', [...STATUTS_ACTIFS]);

  if (options.forcer !== true) {
    // Clause du CAS : bail libre (NULL) ou échu.
    requete = requete.or(
      `bail_expire_le.is.null,bail_expire_le.lt.${maintenantIso}`
    );
  }

  const { data, error } = await requete.select('*').maybeSingle();
  if (error) throw error;

  const pris = assainirTravail(data);
  return pris !== null && pris.executeur === executeur;
}

/**
 * Prolonge le bail — SEULEMENT si `executeur` en est toujours le
 * titulaire. `false` = délogé : l'appelant doit cesser d'écrire.
 */
export async function renouvelerBail(
  supabase: SupabaseClient,
  travailId: string,
  executeur: string,
  dureeMs: number
): Promise<boolean> {
  const id = (travailId ?? '').trim();
  const titulaire = (executeur ?? '').trim();
  if (!id) throw new Error('Bail sans travail.');
  if (!titulaire) throw new Error('Bail sans exécutant.');
  const duree = dureeBailValide(dureeMs);

  const maintenant = new Date();
  const { data, error } = await supabase
    .from('travaux_traduction')
    .update({
      bail_expire_le: new Date(maintenant.getTime() + duree).toISOString(),
      battement_le: maintenant.toISOString(),
    })
    .eq('id', id)
    .eq('executeur', titulaire)
    .in('statut', [...STATUTS_ACTIFS])
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/**
 * Lève `ErreurBailPerdu` si le bail n'est plus tenu. À appeler AVANT
 * toute écriture issue d'un lot : perdre le bail juste après une
 * écriture laisserait un résultat partiel que le nouveau titulaire
 * écraserait ou doublerait.
 */
export async function exigerBail(
  supabase: SupabaseClient,
  travailId: string,
  executeur: string,
  dureeMs: number
): Promise<void> {
  if (!(await renouvelerBail(supabase, travailId, executeur, dureeMs))) {
    throw new ErreurBailPerdu(travailId);
  }
}

/**
 * Renouvelle le bail puis exécute `ecrire` — le tout ou rien côté
 * appelant : si le bail est perdu, `ecrire` n'est JAMAIS appelé.
 */
export async function ecrireSousBail<T>(
  supabase: SupabaseClient,
  travailId: string,
  executeur: string,
  dureeMs: number,
  ecrire: () => Promise<T>
): Promise<T> {
  await exigerBail(supabase, travailId, executeur, dureeMs);
  return ecrire();
}

/**
 * Libère le bail — uniquement si `executeur` en est le titulaire
 * (sinon aucune ligne n'est touchée : on ne vole pas le bail d'autrui).
 * Le battement est effacé : le travail redevient immédiatement
 * proposable au passage suivant.
 */
export async function relacherBail(
  supabase: SupabaseClient,
  travailId: string,
  executeur: string
): Promise<boolean> {
  const id = (travailId ?? '').trim();
  const titulaire = (executeur ?? '').trim();
  if (!id) throw new Error('Bail sans travail.');
  if (!titulaire) throw new Error('Bail sans exécutant.');

  const { data, error } = await supabase
    .from('travaux_traduction')
    .update({ executeur: null, bail_expire_le: null, battement_le: null })
    .eq('id', id)
    .eq('executeur', titulaire)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export interface OptionsProchainTravail {
  /** Âge du battement au-delà duquel un `en_cours` est repris. */
  seuilBattementMs?: number;
}

/** Millisecondes d'une date ISO ; 0 si illisible (tri de repli). */
function dateMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Travail à faire MAINTENANT pour l'exécutant : le plus ancien travail
 * LIBRE, c'est-à-dire, dans l'ordre du bail :
 *  - un travail dont le bail est NULL (personne ne le tient) ;
 *  - un travail dont le bail est ÉCHU (titulaire mort ou onglet fermé).
 *
 * Un travail au bail VALIDE appartient à son titulaire : il est ignoré
 * même si son battement est frais — c'est la règle qui empêche deux
 * exécutants de traduire le même livre.
 *
 * Compatibilité : les travaux créés avant le bail (`bail_expire_le`
 * NULL) restent gouvernés par le BATTEMENT — un `en_cours` sans
 * battement, ou au battement périmé, est repris.
 *
 * Le filtrage est fait EN BASE (cinq lectures, une ligne chacune) et non
 * par un balayage côté client : un balayage borné (`.limit(20)` puis tri
 * en mémoire) laissait les travaux situés derrière une file de baux
 * valides invisibles pour toujours.
 */
export async function prochainTravail(
  supabase: SupabaseClient,
  options: OptionsProchainTravail = {}
): Promise<TravailTraduction | null> {
  const seuil = options.seuilBattementMs ?? SEUIL_BATTEMENT_MS;
  const maintenant = new Date();
  const maintenantIso = maintenant.toISOString();
  const limiteBattement = new Date(
    maintenant.getTime() - Math.max(0, seuil)
  ).toISOString();

  const [
    attenteLibre,
    attenteBailEchu,
    sansBattement,
    battementPerime,
    bailEchu,
  ] = await Promise.all([
    // 1) en_attente, aucun bail.
    supabase
      .from('travaux_traduction')
      .select('*')
      .eq('statut', 'en_attente')
      .is('bail_expire_le', null)
      .order('cree_le', { ascending: true })
      .limit(1)
      .maybeSingle(),
    // 2) en_attente dont le bail est échu (titulaire disparu).
    supabase
      .from('travaux_traduction')
      .select('*')
      .eq('statut', 'en_attente')
      .lt('bail_expire_le', maintenantIso)
      .order('cree_le', { ascending: true })
      .limit(1)
      .maybeSingle(),
    // 3) en_cours sans bail ni battement (travail hérité).
    supabase
      .from('travaux_traduction')
      .select('*')
      .eq('statut', 'en_cours')
      .is('bail_expire_le', null)
      .is('battement_le', null)
      .order('cree_le', { ascending: true })
      .limit(1)
      .maybeSingle(),
    // 4) en_cours sans bail, battement périmé (exécutant tué).
    supabase
      .from('travaux_traduction')
      .select('*')
      .eq('statut', 'en_cours')
      .is('bail_expire_le', null)
      .lt('battement_le', limiteBattement)
      .order('cree_le', { ascending: true })
      .limit(1)
      .maybeSingle(),
    // 5) en_cours dont le bail est échu (titulaire mort, onglet fermé).
    supabase
      .from('travaux_traduction')
      .select('*')
      .eq('statut', 'en_cours')
      .lt('bail_expire_le', maintenantIso)
      .order('cree_le', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  for (const reponse of [
    attenteLibre,
    attenteBailEchu,
    sansBattement,
    battementPerime,
    bailEchu,
  ]) {
    if (reponse.error) throw reponse.error;
  }

  const candidats = [
    attenteLibre.data,
    attenteBailEchu.data,
    sansBattement.data,
    battementPerime.data,
    bailEchu.data,
  ]
    .map(assainirTravail)
    .filter((travail): travail is TravailTraduction => travail !== null);

  let choisi: TravailTraduction | null = null;
  for (const candidat of candidats) {
    if (!choisi || dateMs(candidat.cree_le) < dateMs(choisi.cree_le)) choisi = candidat;
  }
  return choisi;
}

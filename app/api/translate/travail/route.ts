// ============================================================
// app/api/translate/travail/route.ts — Exécutant de traduction serveur.
//
// Une requête = UN passage : prendre le travail actif le plus ancien,
// en PRENDRE LE BAIL, traduire un lot (40 segments / 20 000 caractères),
// vérifier le bail AVANT d'enregistrer, tenir les compteurs, puis clore
// le travail s'il ne reste plus rien (avec une reprise des segments en
// erreur).
//
// BAIL : l'identifiant `serveur:<uuid>` est unique à ce passage. Si le
// bail est perdu en cours de route (le navigateur l'a préempté, un autre
// passage l'a repris), le lot en cours est ABANDONNÉ SANS ÉCRITURE :
// aucun résultat partiel, aucun compteur avancé. Le travail reste à son
// nouveau titulaire.
//
// C'est ce qui rend la traduction PERSISTANTE : le moteur du navigateur
// s'arrête à la fermeture de l'onglet, pas ce worker — déclenché chaque
// minute par netlify/functions/worker-traduction.mts.
//
// Protection : en-tête `x-plume-travail` comparé à CRON_SECRET en temps
// constant. Aucune session utilisateur n'est requise : les écritures
// passent par la clé service role (RLS contournée, propriétaire vérifié
// par la base).
//
// Aucun nom de fournisseur de traduction n'apparaît dans les textes
// produits (ni notification, ni message d'erreur).
// ============================================================

import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, after, type NextRequest } from 'next/server';
import { traiterLotSegments } from '@/lib/traduction/lot';
import { fautIlEnchainer, profondeurSuivante } from '@/lib/traduction/chaine';
import type {
  EchecSegmentLot,
  ResultatLotSegments,
  SegmentLot,
} from '@/lib/traduction/lot';
import { chargerPairesGlossaire } from '@/lib/glossaire';
import { creerNotification } from '@/lib/notifications';
import { paginer } from '@/lib/pagination';
import {
  DUREE_BAIL_SERVEUR_MS,
  ErreurBailPerdu,
  avancerTravail,
  ecrireSousBail,
  exigerBail,
  lireTravailParId,
  prendreBail,
  prochainTravail,
  relacherBail,
  type StatutTravail,
  type TravailTraduction,
} from '@/lib/travaux-traduction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Seuils du contrat de lot (docs/CHANTIER-TRADUCTION-2026-10-17.md). */
const MAX_SEGMENTS_LOT = 40;
const MAX_CARACTERES_LOT = 20_000;
/** Parallélisme interne demandé au traitement de lot. */
const CONCURRENCE = 8;
/**
 * Budget d'exécution d'un passage. La route est synchrone : au-delà, le
 * passage suivant prendra la suite (le travail reste `en_cours`).
 */
const BUDGET_MS = 45_000;

/**
 * Plancher du budget quand un déclencheur externe l'impose par `?budget=`
 * (en millisecondes) : sous ~8 s, un lot n'a pas le temps de se terminer.
 */
const BUDGET_MIN_MS = 8_000;
/** Un segment `en_cours` plus vieux que ce seuil est orphelin. */
const SEUIL_SEGMENT_ORPHELIN_MS = 10 * 60 * 1000;
/** Fenêtre de déduplication de la notification de fin. */
const FENETRE_NOTIF_MS = 120_000;

interface LivreTravail {
  id: string;
  titre: string;
  proprietaire_id: string;
  langue_source: string;
  langue_cible: string;
  statut: string;
}

interface ChapitreTravail {
  id: string;
  position: number;
  statut: string;
  texte_traduit: string | null;
}

interface SegmentTravail {
  id: number;
  chapitre_id: string;
  position: number;
  source: string;
  suite: string;
  traduit: string | null;
  statut: string;
}

/** Réponse JSON sans cache (état vivant, jamais mis en cache CDN). */
function reponse(corps: unknown, status = 200): NextResponse {
  return NextResponse.json(corps, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** Comparaison en temps constant (longueurs d'abord). */
function jetonValide(fourni: string, attendu: string): boolean {
  const a = Buffer.from(fourni, 'utf8');
  const b = Buffer.from(attendu, 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/** Client service role (aucune session : scripts et fonctions Netlify). */
function clientServeur(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !cle) return null;
  return createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : 'Erreur inconnue.';
}

/**
 * Message utilisateur d'un échec de segment. Volontairement GÉNÉRIQUE :
 * la raison brute peut mentionner un fournisseur, elle ne sort jamais.
 */
function messageEchec(echec: EchecSegmentLot): string {
  if (echec.raison === 'long') return 'Segment trop long pour la traduction.';
  if (echec.raison === 'limite') return 'Échec après plusieurs essais.';
  if (echec.raison === 'indisponible') return 'Moteur momentanément indisponible.';
  return 'Échec de la traduction.';
}

// ------------------------------------------------------------
// Accès aux données
// ------------------------------------------------------------

async function chargerLivre(
  supabase: SupabaseClient,
  livreId: string
): Promise<LivreTravail | null> {
  const { data, error } = await supabase
    .from('livres')
    .select('id, titre, proprietaire_id, langue_source, langue_cible, statut')
    .eq('id', livreId)
    .maybeSingle();
  if (error) throw error;
  return (data as LivreTravail | null) ?? null;
}

async function chargerChapitres(
  supabase: SupabaseClient,
  livreId: string
): Promise<ChapitreTravail[]> {
  const { data, error } = await supabase
    .from('chapitres')
    .select('id, position, statut, texte_traduit')
    .eq('livre_id', livreId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChapitreTravail[];
}

/** Nombre de segments d'un livre dans les statuts demandés. */
async function compterSegments(
  supabase: SupabaseClient,
  chapitreIds: string[],
  statuts: string[]
): Promise<number> {
  if (chapitreIds.length === 0) return 0;
  const { count, error } = await supabase
    .from('segments')
    .select('id', { count: 'exact', head: true })
    .in('chapitre_id', chapitreIds)
    .in('statut', statuts);
  if (error) throw error;
  return typeof count === 'number' ? count : 0;
}

/**
 * Reprise défensive : les segments restés `en_cours` (onglet fermé en
 * pleine traduction, exécutant tué) repassent en file après le seuil.
 * Même règle que lib/useMoteurTraduction.reprendreSegmentsEnCours, mais
 * sur tout le livre (le worker n'agit pas chapitre par chapitre).
 */
async function reprendreSegmentsOrphelins(
  supabase: SupabaseClient,
  chapitreIds: string[]
): Promise<number> {
  if (chapitreIds.length === 0) return 0;
  const limite = new Date(Date.now() - SEUIL_SEGMENT_ORPHELIN_MS).toISOString();
  const { data, error } = await supabase
    .from('segments')
    .update({ statut: 'en_attente', erreur: null })
    .in('chapitre_id', chapitreIds)
    .eq('statut', 'en_cours')
    .lt('updated_at', limite)
    .select('id');
  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}

/**
 * Segments suivants à traduire : les plus anciens (id croissant, donc
 * ordre d'import) dans les statuts demandés, bornés par le nombre ET par
 * le budget de caractères du lot.
 */
async function constituerLot(
  supabase: SupabaseClient,
  chapitreIds: string[],
  statuts: string[],
  ordreChapitres: Map<string, number>
): Promise<SegmentTravail[]> {
  if (chapitreIds.length === 0) return [];
  const { data, error } = await supabase
    .from('segments')
    .select('id, chapitre_id, position, source, suite, traduit, statut')
    .in('chapitre_id', chapitreIds)
    .in('statut', statuts)
    .order('id', { ascending: true })
    .limit(MAX_SEGMENTS_LOT);
  if (error) throw error;

  const bruts = ((data ?? []) as SegmentTravail[]).sort((a, b) => {
    const chapitreA = ordreChapitres.get(a.chapitre_id) ?? 0;
    const chapitreB = ordreChapitres.get(b.chapitre_id) ?? 0;
    if (chapitreA !== chapitreB) return chapitreA - chapitreB;
    return a.position - b.position;
  });

  const lot: SegmentTravail[] = [];
  let caracteres = 0;
  for (const segment of bruts) {
    const taille = (segment.source ?? '').length;
    if (lot.length > 0 && caracteres + taille > MAX_CARACTERES_LOT) continue;
    lot.push(segment);
    caracteres += taille;
    if (lot.length >= MAX_SEGMENTS_LOT) break;
  }
  return lot;
}

/** Source vide : rien à traduire, le segment est « fait » à vide. */
async function cloturerSegmentsVides(
  supabase: SupabaseClient,
  segments: SegmentTravail[]
): Promise<number> {
  const vides = segments.filter((s) => (s.source ?? '').trim() === '');
  await Promise.all(
    vides.map(async (segment) => {
      const { error } = await supabase
        .from('segments')
        .update({ statut: 'fait', traduit: '', erreur: null })
        .eq('id', segment.id);
      if (error) throw error;
    })
  );
  return vides.length;
}

/**
 * Écrit les résultats d'un lot en base. Renvoie le nombre de succès et
 * d'échecs RÉELLEMENT enregistrés.
 */
async function enregistrerLot(
  supabase: SupabaseClient,
  lot: SegmentTravail[],
  resultats: { id: string; traduit: string; essais: number }[],
  echecs: EchecSegmentLot[]
): Promise<{ faits: number; echoues: number }> {
  const connus = new Set(lot.map((s) => String(s.id)));
  const succes = resultats.filter((r) => connus.has(String(r.id)));
  const rates = echecs.filter((e) => connus.has(String(e.id)));

  await Promise.all(
    succes.map(async (resultat) => {
      const { error } = await supabase
        .from('segments')
        .update({
          statut: 'fait',
          traduit: resultat.traduit,
          erreur: null,
          tentative: Number.isFinite(resultat.essais) ? resultat.essais : 1,
        })
        .eq('id', Number(resultat.id));
      if (error) throw error;
    })
  );

  await Promise.all(
    rates.map(async (echec) => {
      const { error } = await supabase
        .from('segments')
        .update({
          statut: 'erreur',
          erreur: messageEchec(echec),
        })
        .eq('id', Number(echec.id));
      if (error) throw error;
    })
  );

  return { faits: succes.length, echoues: rates.length };
}

/**
 * Traduit un lot et l'enregistre. Réutilise `traiterLotSegments`
 * (lib/traduction/lot.ts) : le worker ne réimplémente RIEN du moteur.
 *
 * Ordre imposé par le bail : la traduction se fait EN MÉMOIRE, puis le
 * bail est revérifié juste avant la première écriture (`ecrireSousBail`).
 * Bail perdu → `ErreurBailPerdu`, aucune écriture, aucun compteur : le
 * lot est abandonné, pas à moitié enregistré.
 */
async function traiterEtEnregistrer(
  supabase: SupabaseClient,
  travail: TravailTraduction,
  executeur: string,
  livre: LivreTravail,
  segments: SegmentTravail[],
  glossaire: { source: string; traduction: string }[]
): Promise<{ faits: number; echoues: number }> {
  const aTraduire = segments.filter((s) => (s.source ?? '').trim() !== '');

  let resultat: ResultatLotSegments = { resultats: [], echecs: [] };
  if (aTraduire.length > 0) {
    const lot: SegmentLot[] = aTraduire.map((segment) => ({
      id: String(segment.id),
      texte: segment.source,
    }));

    resultat = await traiterLotSegments(lot, {
      source: livre.langue_source,
      cible: livre.langue_cible,
      ...(glossaire.length > 0 ? { glossaire } : {}),
      concurrence: CONCURRENCE,
    });
  }

  return ecrireSousBail(
    supabase,
    travail.id,
    executeur,
    DUREE_BAIL_SERVEUR_MS,
    async () => {
      const faits = await cloturerSegmentsVides(supabase, segments);
      const bilan = await enregistrerLot(
        supabase,
        aTraduire,
        resultat.resultats,
        resultat.echecs
      );
      return { faits: faits + bilan.faits, echoues: bilan.echoues };
    }
  );
}

/**
 * Assemble les chapitres intégralement traduits (1:1 : traduction +
 * espacement d'origine), pour que le texte soit lisible sans rouvrir
 * l'onglet. Idempotent : un chapitre déjà assemblé n'est pas réécrit.
 */
async function assemblerChapitres(
  supabase: SupabaseClient,
  chapitres: ChapitreTravail[]
): Promise<number> {
  let assembles = 0;
  for (const chapitre of chapitres) {
    if (chapitre.statut === 'traduit' && chapitre.texte_traduit) continue;

    const segments = await paginer<{
      traduit: string | null;
      suite: string;
      statut: string;
    }>((debut, fin) =>
      supabase
        .from('segments')
        .select('traduit, suite, statut, position')
        .eq('chapitre_id', chapitre.id)
        .order('position', { ascending: true })
        .range(debut, fin)
    );

    if (segments.length === 0) continue;
    if (segments.some((s) => s.statut !== 'fait')) continue;

    const texte = segments.map((s) => (s.traduit ?? '') + s.suite).join('');
    const { error } = await supabase
      .from('chapitres')
      .update({ statut: 'traduit', texte_traduit: texte })
      .eq('id', chapitre.id);
    if (error) throw error;
    assembles += 1;
  }
  return assembles;
}

/**
 * Positionne le livre à `traduit` si TOUS ses chapitres le sont.
 * Renvoie vrai si la transition vient d'avoir lieu (le trigger
 * `notifier_traduction_terminee` a alors pu créer une notification).
 */
async function marquerLivreTraduit(
  supabase: SupabaseClient,
  livre: LivreTravail
): Promise<boolean> {
  if (livre.statut === 'traduit') return false;
  const chapitres = await chargerChapitres(supabase, livre.id);
  if (chapitres.length === 0) return false;
  if (chapitres.some((c) => c.statut !== 'traduit')) return false;

  const { error } = await supabase
    .from('livres')
    .update({ statut: 'traduit' })
    .eq('id', livre.id);
  if (error) throw error;
  return true;
}

/** Une notification déjà posée pour ce livre dans la fenêtre récente ? */
async function notificationRecente(
  supabase: SupabaseClient,
  proprietaireId: string,
  lien: string
): Promise<boolean> {
  const depuis = new Date(Date.now() - FENETRE_NOTIF_MS).toISOString();
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('proprietaire_id', proprietaireId)
    .eq('lien', lien)
    .gte('cree_le', depuis)
    .limit(1);
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

/**
 * Notification de fin de travail — via creerNotification(), SEUL point
 * d'insertion de la table. Si la transition du livre a déjà déclenché la
 * notification de la base (trigger), on ne double pas la cloche.
 */
async function notifierFin(
  supabase: SupabaseClient,
  livre: LivreTravail,
  statut: StatutTravail,
  total: number,
  erreurs: number
): Promise<void> {
  const lien = `/livres/${livre.id}`;
  if (await notificationRecente(supabase, livre.proprietaire_id, lien)) return;

  const succes = statut === 'termine';
  try {
    await creerNotification(supabase, {
      proprietaire_id: livre.proprietaire_id,
      type: succes ? 'traduction' : 'erreur',
      titre: succes ? 'Traduction terminée' : 'Traduction interrompue',
      corps: succes
        ? `${livre.titre} : ${total} segment${total > 1 ? 's' : ''} traduits.`
        : `${livre.titre} : ${erreurs} segment${erreurs > 1 ? 's' : ''} n'ont pas pu être traduits.`,
      lien,
    });
  } catch (erreur) {
    // Une notification manquée ne doit jamais faire échouer une
    // traduction terminée.
    console.warn('[travail] notification non créée :', messageErreur(erreur));
  }
}

// ------------------------------------------------------------
// Prise du travail (bail exclusif)
// ------------------------------------------------------------

/**
 * Identifiant de CE passage. Unique : deux passages simultanés (cron +
 * déclenchement manuel) ne peuvent pas se croire titulaires du même
 * bail, et les journaux disent lequel a abandonné.
 */
function identifiantPassage(): string {
  return `serveur:${randomUUID()}`;
}

// ------------------------------------------------------------
// Passage
// ------------------------------------------------------------

async function executer(
  supabase: SupabaseClient,
  travail: TravailTraduction,
  executeur: string,
  budgetMs: number
): Promise<NextResponse> {
  const debut = Date.now();
  const livre = await chargerLivre(supabase, travail.livre_id);
  if (!livre) {
    await avancerTravail(supabase, travail.id, { statut: 'erreur' });
    await relacherBail(supabase, travail.id, executeur).catch(() => undefined);
    return reponse({ statut: 'erreur', id: travail.id, motif: 'livre introuvable' });
  }

  const chapitres = await chargerChapitres(supabase, livre.id);
  const chapitreIds = chapitres.map((c) => c.id);
  const ordre = new Map(chapitres.map((c, index) => [c.id, index]));

  if (chapitreIds.length === 0) {
    await avancerTravail(supabase, travail.id, {
      statut: 'erreur',
      traites: 0,
      total: 0,
      erreurs: 0,
      battement: true,
    });
    await relacherBail(supabase, travail.id, executeur).catch(() => undefined);
    await notifierFin(supabase, livre, 'erreur', 0, 0);
    return reponse({ statut: 'erreur', id: travail.id, motif: 'livre vide' });
  }

  let bilan = { faits: 0, echoues: 0 };

  try {
    // Bail revérifié AVANT la première écriture (la reprise des
    // orphelins en est une) : si un autre exécutant l'a pris entre la
    // prise et ici, ce passage n'écrit strictement rien.
    await exigerBail(supabase, travail.id, executeur, DUREE_BAIL_SERVEUR_MS);

    await reprendreSegmentsOrphelins(supabase, chapitreIds);
    const glossaire = await chargerPairesGlossaire(supabase, livre.id);

    const enAttente = await compterSegments(supabase, chapitreIds, ['en_attente']);
    const enErreur = await compterSegments(supabase, chapitreIds, ['erreur']);

    // Total figé au premier passage : il ne bouge plus, la progression est
    // donc monotone même si des segments sont ajoutés plus tard.
    const total = travail.total > 0 ? travail.total : enAttente + enErreur;

    // 1) Lot principal (segments jamais traduits d'abord, erreurs ensuite).
    const lot = await constituerLot(supabase, chapitreIds, ['en_attente', 'erreur'], ordre);
    if (lot.length > 0) {
      const resultat = await traiterEtEnregistrer(
        supabase,
        travail,
        executeur,
        livre,
        lot,
        glossaire
      );
      bilan = {
        faits: bilan.faits + resultat.faits,
        echoues: bilan.echoues + resultat.echoues,
      };
    }

    // 2) Reprise des erreurs EN FIN de travail : plus rien en attente mais
    // il reste des échecs → une dernière passe, sans action de l'utilisateur.
    let restants = await compterSegments(supabase, chapitreIds, ['en_attente', 'erreur']);
    if (restants > 0 && Date.now() - debut < budgetMs) {
      const resteEnAttente = await compterSegments(supabase, chapitreIds, ['en_attente']);
      if (resteEnAttente === 0) {
        const reprise = await constituerLot(supabase, chapitreIds, ['erreur'], ordre);
        if (reprise.length > 0) {
          const resultat = await traiterEtEnregistrer(
            supabase,
            travail,
            executeur,
            livre,
            reprise,
            glossaire
          );
          bilan = {
            faits: bilan.faits + resultat.faits,
            echoues: bilan.echoues + resultat.echoues,
          };
          restants = await compterSegments(supabase, chapitreIds, [
            'en_attente',
            'erreur',
          ]);
        }
      }
    }

    // Compteurs et assemblage des chapitres sont aussi des écritures :
    // le bail doit encore être tenu.
    await exigerBail(supabase, travail.id, executeur, DUREE_BAIL_SERVEUR_MS);

    // Compteurs recalculés depuis la base : jamais de dérive cumulative.
    const erreursRestantes = await compterSegments(supabase, chapitreIds, ['erreur']);
    const traites = Math.max(0, total - restants);

    // 3) Travail terminé : plus aucun segment en attente ni en erreur.
    if (restants === 0) {
      await assemblerChapitres(supabase, await chargerChapitres(supabase, livre.id));
      const transition = await marquerLivreTraduit(supabase, livre);
      if (transition) livre.statut = 'traduit';
      await avancerTravail(supabase, travail.id, {
        statut: 'termine',
        traites,
        total,
        erreurs: 0,
        battement: true,
      });
      await relacherBail(supabase, travail.id, executeur).catch(() => undefined);
      await notifierFin(supabase, livre, 'termine', total, 0);
      return reponse({
        statut: 'termine',
        id: travail.id,
        livre_id: livre.id,
        total,
        traites,
        erreurs: 0,
        lots: bilan,
      });
    }

    // 4) Abandon franc : il ne reste QUE des erreurs et cette passe n'a
    // rien sauvé (moteur indisponible, segments définitivement refusés).
    if (erreursRestantes > 0 && erreursRestantes === restants && bilan.faits === 0) {
      await assemblerChapitres(supabase, await chargerChapitres(supabase, livre.id));
      await avancerTravail(supabase, travail.id, {
        statut: 'erreur',
        traites,
        total,
        erreurs: erreursRestantes,
        battement: true,
      });
      await relacherBail(supabase, travail.id, executeur).catch(() => undefined);
      await notifierFin(supabase, livre, 'erreur', total, erreursRestantes);
      return reponse({
        statut: 'erreur',
        id: travail.id,
        livre_id: livre.id,
        total,
        traites,
        erreurs: erreursRestantes,
        lots: bilan,
      });
    }

    // 5) Il reste du travail : le passage suivant prendra la suite. Le
    // bail est RENDU (battement effacé) pour que le prochain cron reparte
    // sans attendre son expiration.
    await avancerTravail(supabase, travail.id, {
      statut: 'en_cours',
      traites,
      total,
      erreurs: erreursRestantes,
      battement: true,
    });
    await relacherBail(supabase, travail.id, executeur).catch(() => undefined);
    return reponse({
      statut: 'en_cours',
      id: travail.id,
      livre_id: livre.id,
      total,
      traites,
      erreurs: erreursRestantes,
      lots: bilan,
    });
  } catch (erreur) {
    if (erreur instanceof ErreurBailPerdu) {
      // Le lot est ABANDONNÉ, sans écriture ni compteur : le travail
      // appartient à son nouveau titulaire. On ne le remet pas dans la
      // file et on ne libère pas un bail qu'on ne tient plus.
      console.warn('[travail] bail perdu, lot abandonné :', travail.id);
      return reponse({
        statut: 'bail_perdu',
        id: travail.id,
        livre_id: livre.id,
        lots: bilan,
      });
    }
    throw erreur;
  }
}

// ------------------------------------------------------------
// POST
// ------------------------------------------------------------

async function passer(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return reponse({ erreur: 'Exécutant non configuré (CRON_SECRET).' }, 503);
  }

  // Deux formes de secret acceptées :
  //  • `x-plume-travail: <secret>` — notre horloge (Netlify hier, pg_cron demain) ;
  //  • `Authorization: Bearer <secret>` — Vercel Cron, qui l'envoie ainsi.
  const porteur = request.headers.get('authorization') ?? '';
  const fourni =
    request.headers.get('x-plume-travail') ??
    (porteur.startsWith('Bearer ') ? porteur.slice('Bearer '.length) : '');
  if (!jetonValide(fourni, secret)) {
    return reponse({ erreur: 'Non autorisé.' }, 401);
  }

  // Budget d'exécution : 45 s par défaut. Un déclencheur externe peut
  // l'abaisser via `?budget=25000` (cron-job.org coupe à 30 s).
  const demande = Number(request.nextUrl.searchParams.get('budget') ?? '');
  const budgetMs =
    Number.isFinite(demande) && demande > 0
      ? Math.min(BUDGET_MS, Math.max(BUDGET_MIN_MS, demande))
      : BUDGET_MS;

  const supabase = clientServeur();
  if (!supabase) {
    return reponse(
      { erreur: 'Exécutant non configuré (SUPABASE_SERVICE_ROLE_KEY).' },
      503
    );
  }

  const executeur = identifiantPassage();
  let travail: TravailTraduction | null = null;
  try {
    const candidat = await prochainTravail(supabase);
    if (!candidat) {
      return reponse({ statut: 'inactif' });
    }

    // BAIL exclusif : un seul passage peut obtenir cette ligne. Le
    // perdant repart sans rien écrire (cron + déclenchement manuel, ou
    // deux instances de la fonction).
    const pris = await prendreBail(supabase, candidat.id, {
      executeur,
      dureeMs: DUREE_BAIL_SERVEUR_MS,
    });
    if (!pris) {
      return reponse({ statut: 'deja_pris', id: candidat.id });
    }

    // Relu après la prise : les compteurs peuvent avoir bougé depuis
    // prochainTravail (autre passage, navigateur).
    travail = (await lireTravailParId(supabase, candidat.id)) ?? candidat;
    const resultat = await executer(supabase, travail, executeur, budgetMs);
    await enchainerSiUtile(request, resultat, secret, budgetMs);
    return resultat;
  } catch (erreur) {
    // Panne transitoire : le bail est RELÂCHÉ et le travail rendu à la
    // file, aucun segment n'est perdu, le passage suivant repart.
    if (travail) {
      await avancerTravail(supabase, travail.id, { statut: 'en_attente' }).catch(
        () => undefined
      );
      await relacherBail(supabase, travail.id, executeur).catch(() => undefined);
    }
    console.warn('[travail] passage interrompu :', messageErreur(erreur));
    return reponse({ statut: 'erreur', erreur: messageErreur(erreur) }, 500);
  }
}

/**
 * Un passage qui laisse du travail DERRIÈRE LUI relance le suivant, sans
 * horloge externe : le livre avance même si le client a fermé son onglet.
 *
 * Garde-fous :
 *  • seulement si le passage a RÉELLEMENT avancé (`faits > 0`) — sinon on
 *    tournerait à vide sur un moteur en panne et le cron trancherait ;
 *  • profondeur bornée (PROFONDEUR_MAX_CHAINE) : une chaîne ne peut pas
 *    s'emballer, le cron reprend la main au-delà ;
 *  • relance après la réponse (`after`) : le client reçoit son statut sans
 *    attendre le passage suivant.
 */
async function enchainerSiUtile(
  request: NextRequest,
  resultat: NextResponse,
  secret: string,
  budgetMs: number
): Promise<void> {
  type CorpsPassage = { statut?: string; lots?: { faits?: number } };
  let corps: CorpsPassage | null = null;
  try {
    corps = (await resultat.clone().json()) as CorpsPassage;
  } catch {
    return;
  }
  const profondeur = profondeurSuivante(
    request.nextUrl.searchParams.get('chaine')
  );
  if (!fautIlEnchainer(corps, profondeur)) return;

  const url = new URL(request.nextUrl.pathname, request.nextUrl.origin);
  url.searchParams.set('chaine', String(profondeur));
  if (budgetMs !== BUDGET_MS) url.searchParams.set('budget', String(budgetMs));

  after(async () => {
    try {
      await fetch(url, {
        headers: { 'x-plume-travail': secret },
        cache: 'no-store',
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      // Le cron quotidien reste le filet : rien n'est perdu.
    }
  });
}

/**
 * Vercel Cron appelle la route en GET (avec `Authorization: Bearer
 * CRON_SECRET`). Le traitement est identique à POST : un seul passage.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return passer(request);
}

export const GET = POST;

// ============================================================
// app/api/livres/[id]/graphe/route.ts — Graphe narratif (F25).
//
//   GET    ?chapitreLu=<position 1..n | 0>
//          → graphe FILTRÉ PAR LE SERVEUR : rien au-delà du chapitre
//            lu ne quitte la base (anti-spoilers par construction) ;
//   POST   { type: 'personnage' | 'relation', … } → ajout manuel ;
//   DELETE ?type=personnage|relation&id=<uuid>   → suppression.
//
// GARDES : session 401, interrupteur `graphe` (éteint → 404, plan
// insuffisant → 403), livre du compte par RLS (404 sinon). L'édition
// manuelle est réservée au PROPRIÉTAIRE du livre (c'est lui qui
// construit son graphe) ; la lecture filtrée suit la progression.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  ajouterPersonnage,
  ajouterRelation,
  chargerGraphe,
  estRole,
  supprimerPersonnage,
  supprimerRelation,
} from '@/lib/graphe';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Contexte =
  | {
      ok: true;
      client: Awaited<ReturnType<typeof creerClientServeur>>;
      utilisateurId: string;
    }
  | { ok: false; reponse: NextResponse };

async function contexte(): Promise<Contexte> {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    return {
      ok: false,
      reponse: NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 }),
    };
  }
  const client = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(client)
    .lire(utilisateur.id)
    .catch(() => null);
  const module = await verifierModuleApi('graphe', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!module.ouvert && module.reponseApi) {
    return { ok: false, reponse: module.reponseApi };
  }
  return { ok: true, client, utilisateurId: utilisateur.id };
}

/** Le livre existe-t-il pour ce compte (RLS « own ») + est-il à lui ? */
async function livrePossede(
  client: Awaited<ReturnType<typeof creerClientServeur>>,
  livreId: string,
  utilisateurId: string
): Promise<boolean> {
  const { data } = await client
    .from('livres')
    .select('id, proprietaire_id')
    .eq('id', livreId)
    .maybeSingle();
  if (!data) return false;
  return (data as { proprietaire_id: string }).proprietaire_id === utilisateurId;
}

/** Chapitres du livre → Map id → position (pour les premières apparitions). */
async function positionsDesChapitres(
  client: Awaited<ReturnType<typeof creerClientServeur>>,
  livreId: string
): Promise<Map<string, number>> {
  const { data } = await client
    .from('chapitres')
    .select('id, position')
    .eq('livre_id', livreId)
    .order('position', { ascending: true });
  const liste = (data ?? []) as Array<{ id: string; position: number }>;
  return new Map(liste.map((c) => [c.id, c.position]));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 400 });
  }

  try {
    const positions = await positionsDesChapitres(ctx.client, id);
    const brut = request.nextUrl.searchParams.get('chapitreLu');
    const chapitreLu =
      brut !== null && /^\d+$/.test(brut) ? Math.max(0, Number(brut)) : null;
    const graphe = await chargerGraphe(
      ctx.client,
      id,
      positions,
      chapitreLu !== null && chapitreLu > 0 ? chapitreLu : null
    );
    return NextResponse.json({ ok: true, ...graphe });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Graphe indisponible.' },
      { status: 400 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 400 });
  }
  if (!(await livrePossede(ctx.client, id, ctx.utilisateurId))) {
    return NextResponse.json({ erreur: 'Livre introuvable.' }, { status: 404 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  const chapitreApparition =
    typeof corps.premiereChapitreId === 'string' && UUID.test(corps.premiereChapitreId)
      ? corps.premiereChapitreId
      : null;

  try {
    if (corps.type === 'personnage') {
      await ajouterPersonnage(ctx.client, {
        livreId: id,
        nom: typeof corps.nom === 'string' ? corps.nom : '',
        role: estRole(corps.role) ? corps.role : 'secondaire',
        description: typeof corps.description === 'string' ? corps.description : null,
        premiereChapitreId: chapitreApparition,
      });
      return NextResponse.json({ ok: true });
    }
    if (corps.type === 'relation') {
      const origineId = typeof corps.origineId === 'string' ? corps.origineId : '';
      const destinationId =
        typeof corps.destinationId === 'string' ? corps.destinationId : '';
      if (!UUID.test(origineId) || !UUID.test(destinationId)) {
        return NextResponse.json(
          { erreur: 'Personnages invalides.' },
          { status: 400 }
        );
      }
      await ajouterRelation(ctx.client, {
        livreId: id,
        origineId,
        destinationId,
        libelle: typeof corps.libelle === 'string' ? corps.libelle : '',
        premiereChapitreId: chapitreApparition,
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ erreur: 'Type inconnu.' }, { status: 400 });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Échec de l’ajout.' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 400 });
  }
  if (!(await livrePossede(ctx.client, id, ctx.utilisateurId))) {
    return NextResponse.json({ erreur: 'Livre introuvable.' }, { status: 404 });
  }

  const paramsUrl = request.nextUrl.searchParams;
  const type = paramsUrl.get('type');
  const cible = paramsUrl.get('id') ?? '';
  if (!UUID.test(cible)) {
    return NextResponse.json({ erreur: 'Cible invalide.' }, { status: 400 });
  }

  try {
    if (type === 'personnage') await supprimerPersonnage(ctx.client, cible);
    else if (type === 'relation') await supprimerRelation(ctx.client, cible);
    else {
      return NextResponse.json({ erreur: 'Type inconnu.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Échec de la suppression.' },
      { status: 400 }
    );
  }
}

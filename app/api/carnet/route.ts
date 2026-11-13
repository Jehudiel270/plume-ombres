// ============================================================
// app/api/carnet/route.ts — Carnet de lecture (F2).
//
//   GET    ?livreId=&chapitreId=&type=  → liste (RLS, filtrée) ;
//   POST   { livreId, chapitreId?, type, extrait?, annotation?,
//            chapitreTitre?, couleur? }  → ajoute une entrée ;
//   PATCH  { id, annotation?, type?, couleur? } → met à jour ;
//   DELETE { id }              → supprime une entrée.
//
// GARDES (le serveur est l'autorité) :
//   1. interrupteur `carnet` (verifierModuleApi : éteint → 404,
//      plan insuffisant → 403) ;
//   2. propriété du livre vérifiée par RLS (un livre d'autrui se
//      comporte comme introuvable) ;
//   3. extraits PLAFONNÉS par lib/carnet (jamais de texte intégral) ;
//   4. RLS « own » protège aussi PATCH/DELETE (une entrée d'autrui
//      ne matche pas → aucun effet, réponse ok neutre).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  ajouterNote,
  majNote,
  supprimerNote,
  estTypeCarnet,
  estCouleurCarnet,
  listerCarnet,
  type CouleurCarnet,
  type TypeCarnet,
} from '@/lib/carnet';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function contexte(): Promise<
  | { ok: true; client: Awaited<ReturnType<typeof creerClientServeur>> }
  | { ok: false; reponse: NextResponse }
> {
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
  const module = await verifierModuleApi('carnet', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!module.ouvert && module.reponseApi) {
    return { ok: false, reponse: module.reponseApi };
  }
  return { ok: true, client };
}

async function corpsValide(
  request: NextRequest
): Promise<Record<string, unknown> | null> {
  try {
    const corps = (await request.json()) as unknown;
    return corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;

  // Filtres : livreId requis (jamais tout le carnet d'un coup),
  // chapitreId et type facultatifs — le lecteur ne charge que les
  // surlignages du chapitre affiché.
  const params = request.nextUrl.searchParams;
  const livreId = params.get('livreId') ?? '';
  if (!UUID.test(livreId)) {
    return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 400 });
  }
  const chapitreIdBrut = params.get('chapitreId') ?? '';
  const chapitreId = UUID.test(chapitreIdBrut) ? chapitreIdBrut : null;
  const typeBrut = params.get('type');
  const type = typeBrut && estTypeCarnet(typeBrut) ? (typeBrut as TypeCarnet) : null;

  try {
    const entrees = await listerCarnet(ctx.client, { livreId, chapitreId, type });
    return NextResponse.json({ ok: true, entrees });
  } catch {
    return NextResponse.json({ erreur: 'Lecture impossible.' }, { status: 400 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;

  const corps = await corpsValide(request);
  if (!corps) {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  const livreId = typeof corps.livreId === 'string' ? corps.livreId : '';
  if (!UUID.test(livreId)) {
    return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 400 });
  }
  const chapitreId =
    typeof corps.chapitreId === 'string' && UUID.test(corps.chapitreId)
      ? corps.chapitreId
      : null;
  const type: TypeCarnet = estTypeCarnet(corps.type) ? corps.type : 'note';
  const extrait = typeof corps.extrait === 'string' ? corps.extrait : '';
  const annotation = typeof corps.annotation === 'string' ? corps.annotation : '';
  const chapitreTitre =
    typeof corps.chapitreTitre === 'string' ? corps.chapitreTitre.slice(0, 200) : null;
  const couleur = estCouleurCarnet(corps.couleur) ? corps.couleur : null;

  if (!extrait.trim() && !annotation.trim()) {
    return NextResponse.json(
      { erreur: 'Écrivez une note ou sélectionnez un passage.' },
      { status: 400 }
    );
  }

  try {
    const entree = await ajouterNote(ctx.client, {
      livreId,
      chapitreId,
      type,
      extrait,
      annotation,
      chapitreTitre,
      couleur,
    });
    return NextResponse.json({ ok: true, entree });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Échec de l’ajout.' },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;

  const corps = await corpsValide(request);
  if (!corps) {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }
  const id = typeof corps.id === 'string' && UUID.test(corps.id) ? corps.id : '';
  if (!id) {
    return NextResponse.json({ erreur: 'Entrée invalide.' }, { status: 400 });
  }

  const maj: {
    annotation?: string | null;
    type?: TypeCarnet;
    couleur?: CouleurCarnet | null;
  } = {};
  if (typeof corps.annotation === 'string') maj.annotation = corps.annotation;
  if (estTypeCarnet(corps.type)) maj.type = corps.type;
  if (corps.couleur !== undefined) {
    maj.couleur = estCouleurCarnet(corps.couleur) ? corps.couleur : null;
  }
  if (Object.keys(maj).length === 0) {
    return NextResponse.json({ erreur: 'Aucun champ à mettre à jour.' }, { status: 400 });
  }

  try {
    await majNote(ctx.client, id, maj);
    return NextResponse.json({ ok: true });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Échec de la mise à jour.' },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;

  const corps = await corpsValide(request);
  if (!corps) {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }
  const id = typeof corps.id === 'string' && UUID.test(corps.id) ? corps.id : '';
  if (!id) {
    return NextResponse.json({ erreur: 'Entrée invalide.' }, { status: 400 });
  }

  try {
    await supprimerNote(ctx.client, id);
    return NextResponse.json({ ok: true });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Échec de la suppression.' },
      { status: 400 }
    );
  }
}

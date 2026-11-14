// ============================================================
// app/api/clubs/[id]/membres/route.ts — Gestion des membres d'un
// club privé (F11 v2).
//
//   DELETE ?utilisateurId=<uuid> → le CRÉATEUR exclut un membre.
//   (Le départ volontaire reste DELETE /api/clubs/[id].)
//
// GARDES : session 401, interrupteur `clubs`, créateur seulement.
// Jamais le créateur lui-même : il supprime le club entier.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }
  const client = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(client)
    .lire(utilisateur.id)
    .catch(() => null);
  const moduleVerdict = await verifierModuleApi('clubs', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert && moduleVerdict.reponseApi) {
    return moduleVerdict.reponseApi;
  }
  if (!UUID.test(id)) {
    return NextResponse.json({ erreur: 'Club inconnu.' }, { status: 404 });
  }

  const cible = requete.nextUrl.searchParams.get('utilisateurId') ?? '';
  if (!UUID.test(cible)) {
    return NextResponse.json({ erreur: 'Membre invalide.' }, { status: 422 });
  }
  if (cible === utilisateur.id) {
    return NextResponse.json(
      { erreur: 'Pour partir, utilisez « Quitter le club ».' },
      { status: 422 }
    );
  }

  const { data: club } = await client
    .from('clubs')
    .select('createur_id')
    .eq('id', id)
    .maybeSingle();
  if (!club) {
    return NextResponse.json({ erreur: 'Club inconnu.' }, { status: 404 });
  }
  if ((club as { createur_id: string }).createur_id !== utilisateur.id) {
    return NextResponse.json(
      { erreur: 'Seul le créateur retire un membre.' },
      { status: 403 }
    );
  }

  const { error, count } = await client
    .from('clubs_membres')
    .delete({ count: 'exact' })
    .eq('club_id', id)
    .eq('utilisateur_id', cible);
  if (error) {
    return NextResponse.json({ erreur: 'Retrait refusé.' }, { status: 500 });
  }
  if ((count ?? 0) === 0) {
    return NextResponse.json({ erreur: 'Ce compte n’est pas membre.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

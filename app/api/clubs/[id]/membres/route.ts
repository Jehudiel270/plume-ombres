// ============================================================
// app/api/clubs/[id]/membres/route.ts — Gestion des membres d'un
// club privé (F11 v4 : rôles admin / moderateur / membre).
//
//   PATCH → { utilisateurId, role } : l'ADMIN change le rôle d'un
//           membre (jamais le sien, jamais le créateur : la règle
//           « le créateur est admin » prime).
//   DELETE ?utilisateurId=… → l'ADMIN (ou le créateur) exclut un
//           membre. Le départ volontaire reste DELETE /api/clubs/[id].
//
// GARDES : session 401, interrupteur `clubs`, rôle contrôlé.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { estRoleClub, libelleRole } from '@/lib/clubs';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
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

  const corps = (await requete.json().catch(() => ({}))) as Record<string, unknown>;
  const cible = typeof corps.utilisateurId === 'string' ? corps.utilisateurId : '';
  if (!UUID.test(cible)) {
    return NextResponse.json({ erreur: 'Membre invalide.' }, { status: 422 });
  }
  if (!estRoleClub(corps.role)) {
    return NextResponse.json(
      { erreur: 'Rôle invalide (admin, moderateur ou membre).' },
      { status: 422 }
    );
  }
  const nouveauRole = corps.role;

  // Mon rôle : admin seulement (le créateur passe aussi par là).
  const { data: club } = await client
    .from('clubs')
    .select('createur_id')
    .eq('id', id)
    .maybeSingle();
  if (!club) {
    return NextResponse.json({ erreur: 'Club inconnu.' }, { status: 404 });
  }
  const estCreateur = (club as { createur_id: string }).createur_id === utilisateur.id;
  if (!estCreateur) {
    const { data: monRoleLigne } = await client
      .from('clubs_membres')
      .select('role')
      .eq('club_id', id)
      .eq('utilisateur_id', utilisateur.id)
      .maybeSingle();
    const monRole = (monRoleLigne as { role: string | null } | null)?.role;
    if (monRole !== 'admin') {
      return NextResponse.json(
        { erreur: 'Seul l’administrateur du club change les rôles.' },
        { status: 403 }
      );
    }
  }

  if (cible === utilisateur.id) {
    return NextResponse.json(
      { erreur: 'Vous ne pouvez pas changer votre propre rôle.' },
      { status: 422 }
    );
  }
  // Le créateur reste admin : personne ne peut le rétrograder.
  if (cible === (club as { createur_id: string }).createur_id) {
    return NextResponse.json(
      { erreur: 'Le créateur du club reste administrateur.' },
      { status: 422 }
    );
  }

  const { data: cibleLigne } = await client
    .from('clubs_membres')
    .select('id')
    .eq('club_id', id)
    .eq('utilisateur_id', cible)
    .maybeSingle();
  if (!cibleLigne) {
    return NextResponse.json({ erreur: 'Ce compte n’est pas membre.' }, { status: 404 });
  }

  const { error } = await client
    .from('clubs_membres')
    .update({ role: nouveauRole })
    .eq('club_id', id)
    .eq('utilisateur_id', cible);
  if (error) {
    return NextResponse.json({ erreur: 'Changement refusé.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, role: nouveauRole, libelle: libelleRole(nouveauRole) });
}

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

  // Admin (ou créateur) seulement.
  const { data: club } = await client
    .from('clubs')
    .select('createur_id')
    .eq('id', id)
    .maybeSingle();
  if (!club) {
    return NextResponse.json({ erreur: 'Club inconnu.' }, { status: 404 });
  }
  const estCreateur = (club as { createur_id: string }).createur_id === utilisateur.id;
  if (!estCreateur) {
    const { data: monRoleLigne } = await client
      .from('clubs_membres')
      .select('role')
      .eq('club_id', id)
      .eq('utilisateur_id', utilisateur.id)
      .maybeSingle();
    const monRole = (monRoleLigne as { role: string | null } | null)?.role;
    if (monRole !== 'admin') {
      return NextResponse.json(
        { erreur: 'Seul l’administrateur retire un membre.' },
        { status: 403 }
      );
    }
  }
  if (cible === (club as { createur_id: string }).createur_id) {
    return NextResponse.json(
      { erreur: 'Le créateur ne peut pas être exclu : il supprime le club entier.' },
      { status: 422 }
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

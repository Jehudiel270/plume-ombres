// ============================================================
// app/api/clubs/[id]/contexte.ts — Garde commune des sous-routes
// du salon (étapes, sondages, rencontres, signalements).
//
// Session 401, interrupteur `clubs` (fermé → 404, plan insuffisant
// → 403), club inconnu → 404, et le RÔLE du membre (admin,
// moderateur, membre) pour les décisions de staff — sans jamais
// ouvrir le contenu au-delà du plafond anti-spoilers.
// ============================================================

import { NextResponse } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { estRoleClub, estStaff, type RoleClub } from '@/lib/clubs';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ContexteClub = {
  ok: true;
  client: Awaited<ReturnType<typeof creerClientServeur>>;
  utilisateurId: string;
  clubId: string;
  maPosition: number;
  monRole: RoleClub;
  estCreateur: boolean;
  estStaff: boolean;
};

export async function contexteClub(
  id: string
): Promise<ContexteClub | { ok: false; reponse: NextResponse }> {
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
  const moduleVerdict = await verifierModuleApi('clubs', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert && moduleVerdict.reponseApi) {
    return { ok: false, reponse: moduleVerdict.reponseApi };
  }
  if (!UUID.test(id)) {
    return {
      ok: false,
      reponse: NextResponse.json({ erreur: 'Club inconnu.' }, { status: 404 }),
    };
  }
  // Mon adhésion (avec rôle) + le club (RLS par adhésion).
  const [monAdhesion, club] = await Promise.all([
    client
      .from('clubs_membres')
      .select('position_lecture, role')
      .eq('club_id', id)
      .eq('utilisateur_id', utilisateur.id)
      .maybeSingle(),
    client
      .from('clubs')
      .select('createur_id')
      .eq('id', id)
      .maybeSingle(),
  ]);
  const adhesion = monAdhesion.data as
    | { position_lecture: number; role: string | null }
    | null;
  if (!adhesion || !club.data) {
    return {
      ok: false,
      reponse: NextResponse.json({ erreur: 'Club inconnu.' }, { status: 404 }),
    };
  }
  const estCreateur =
    (club.data as { createur_id: string }).createur_id === utilisateur.id;
  const monRole: RoleClub = estRoleClub(adhesion.role) ? adhesion.role : 'membre';
  return {
    ok: true,
    client,
    utilisateurId: utilisateur.id,
    clubId: id,
    maPosition: adhesion.position_lecture,
    monRole,
    estCreateur,
    // Le créateur est staff DE TOUTE FAÇON (double sécurité si sa
    // ligne de membre n'a pas encore le rôle admin).
    estStaff: estStaff(monRole) || estCreateur,
  };
}

/** Réponse 403 standard pour « réservé au staff ». */
export function reponseStaff(): NextResponse {
  return NextResponse.json(
    { erreur: 'Réservé aux administrateurs et modérateurs du club.' },
    { status: 403 }
  );
}

/** Réponse 403 standard pour « réservé à l'administrateur ». */
export function reponseAdmin(): NextResponse {
  return NextResponse.json(
    { erreur: 'Réservé à l’administrateur du club.' },
    { status: 403 }
  );
}

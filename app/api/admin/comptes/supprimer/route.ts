// ============================================================
// app/api/admin/comptes/supprimer/route.ts — Supprimer DÉFINITIVEMENT
// un compte (utilisateur, administrateur ou super-administrateur).
//
//   POST { utilisateurId, motif? } → supprime le compte et toutes ses
//   données (livres, chapitres, segments, favoris, abonnements,
//   crédits, paiements…), puis journalise l'action.
//
// GARDE SERVEUR, trois niveaux :
//   1. permission de base `admin.comptes.supprimer` (admin ET
//      super-admin) — un simple utilisateur reçoit 401/403 ;
//   2. si la cible est `admin` ou `super_admin`, la permission forte
//      `admin.roles.super_admin`, calculée par
//      `permissionPourSupprimerCompte(roleCible)` : un admin ne peut
//      donc pas supprimer un autre administrateur ;
//   3. la RPC `public.admin_supprimer_compte` (SECURITY DEFINER)
//      revérifie tout côté base (est_admin / est_super_admin, refus de
//      son propre compte, refus de supprimer le dernier super-admin)
//      et journalise dans `public.admin_actions` avant le DELETE.
//
// L'interface ne fait que masquer le bouton : la décision est prise
// ici, puis de nouveau dans la base.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { creerClientServeur } from '@/lib/supabase/server';
import { verifierPermission } from '@/lib/roles-garde';
import { normaliserRole, permissionPourSupprimerCompte } from '@/lib/roles';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reponseRefus(statut: number) {
  if (statut === 401) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }
  return NextResponse.json(
    { erreur: 'Accès refusé : vous ne pouvez pas supprimer ce compte.' },
    { status: 403 }
  );
}

export async function POST(request: NextRequest) {
  // 1. Permission de base : administrateur (admin ou super-admin).
  const decision = await verifierPermission('admin.comptes.supprimer');
  if (decision.statut !== 200 || !decision.utilisateurId) {
    return reponseRefus(decision.statut);
  }

  let corps: { utilisateurId?: unknown; motif?: unknown };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  const utilisateurId =
    typeof corps.utilisateurId === 'string' ? corps.utilisateurId : '';
  if (!UUID.test(utilisateurId)) {
    return NextResponse.json({ erreur: 'Compte cible invalide.' }, { status: 400 });
  }

  if (utilisateurId === decision.utilisateurId) {
    return NextResponse.json(
      { erreur: 'Vous ne pouvez pas supprimer votre propre compte.' },
      { status: 400 }
    );
  }

  const supabase = await creerClientServeur();

  // 2. Rôle de la cible : il détermine la permission exigée.
  const { data: cible, error: erreurLecture } = await supabase
    .from('profiles')
    .select('role, pseudo')
    .eq('id', utilisateurId)
    .maybeSingle();
  if (erreurLecture) {
    return NextResponse.json(
      { erreur: `Compte illisible : ${erreurLecture.message}` },
      { status: 502 }
    );
  }
  if (!cible) {
    return NextResponse.json({ erreur: 'Compte introuvable.' }, { status: 404 });
  }

  const roleCible = normaliserRole((cible as { role?: string }).role);
  const permissionRequise = permissionPourSupprimerCompte(roleCible);
  const decisionFine = await verifierPermission(permissionRequise);
  if (decisionFine.statut !== 200) {
    return reponseRefus(decisionFine.statut);
  }

  const pseudo = (cible as { pseudo?: string | null }).pseudo ?? null;
  const motif =
    typeof corps.motif === 'string' && corps.motif.trim()
      ? corps.motif.trim().slice(0, 200)
      : `suppression de ${pseudo ?? utilisateurId}`;

  const { data, error } = await supabase.rpc('admin_supprimer_compte', {
    p_user_id: utilisateurId,
    p_motif: motif,
  });
  if (error) {
    const statut = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 502;
    return NextResponse.json(
      { erreur: `Compte non supprimé : ${error.message}` },
      { status: statut }
    );
  }

  return NextResponse.json({
    ok: true,
    resultat: Array.isArray(data) ? data[0] ?? null : data ?? null,
  });
}

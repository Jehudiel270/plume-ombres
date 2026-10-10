// ============================================================
// app/api/admin/roles/route.ts — Nommer / rétrograder un compte
// (réservé au SUPER-administrateur).
//
//   POST { utilisateurId, role, motif? } → change le rôle
//
// `role` accepte 'utilisateur' | 'admin' | 'super_admin'.
//
// GARDE SERVEUR : deux niveaux, tous deux dans lib/roles (source de
// vérité) et appliqués par lib/roles-garde :
//   1. la permission de base `admin.roles.attribuer` (que seul le
//      super-admin possède) — un simple `admin` reçoit 403 ;
//   2. si la cible EST ou DEVIENT `super_admin`, la permission forte
//      `admin.roles.super_admin`, calculée par
//      `permissionPourChangerRole(roleActuel, roleVise)`.
//
// L'interface ne fait que cacher des boutons ; la décision est prise
// ICI, et une seconde fois DANS la base : la RPC
// `public.admin_changer_role` (SECURITY DEFINER) vérifie elle-même
// `est_super_admin(auth.uid())` et journalise l'action dans
// `public.admin_actions` au cours de la MÊME transaction. Un appel
// direct à la RPC par un compte non super-admin échoue en 42501.
//
// Un super-administrateur ne peut pas modifier SON PROPRE rôle : la
// base le refuse (déclencheur `proteger_role_profiles`), ce qui
// garantit qu'il subsiste toujours au moins un super-administrateur.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { creerClientServeur } from '@/lib/supabase/server';
import { verifierPermission } from '@/lib/roles-garde';
import {
  LIBELLES_ROLES,
  normaliserRole,
  permissionPourChangerRole,
  type Role,
} from '@/lib/roles';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reponseRefus(statut: number) {
  if (statut === 401) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }
  return NextResponse.json(
    { erreur: 'Accès refusé : permission de super-administrateur requise.' },
    { status: 403 }
  );
}

export async function POST(request: NextRequest) {
  // 1. Permission de base : seul le super-admin la détient.
  const decision = await verifierPermission('admin.roles.attribuer');
  if (decision.statut !== 200 || !decision.utilisateurId) {
    return reponseRefus(decision.statut);
  }

  let corps: { utilisateurId?: unknown; role?: unknown; motif?: unknown };
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

  const roleVise: Role | null =
    typeof corps.role === 'string' &&
    (['utilisateur', 'admin', 'super_admin'] as const).includes(corps.role as Role)
      ? (corps.role as Role)
      : null;
  if (!roleVise) {
    return NextResponse.json(
      { erreur: 'Rôle invalide (attendu : utilisateur, admin ou super_admin).' },
      { status: 400 }
    );
  }

  if (utilisateurId === decision.utilisateurId) {
    return NextResponse.json(
      {
        erreur:
          'Un super-administrateur ne peut pas modifier son propre rôle (garde anti-verrouillage).',
      },
      { status: 400 }
    );
  }

  const supabase = await creerClientServeur();

  // 2. Rôle ACTUEL de la cible : il détermine la permission exigée.
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

  const roleActuel = normaliserRole((cible as { role?: string }).role);
  const permissionRequise = permissionPourChangerRole(roleActuel, roleVise);
  const decisionFine = await verifierPermission(permissionRequise);
  if (decisionFine.statut !== 200) {
    return reponseRefus(decisionFine.statut);
  }

  const motif =
    typeof corps.motif === 'string' && corps.motif.trim()
      ? corps.motif.trim().slice(0, 200)
      : `super-administrateur ${decision.utilisateurId} — ${LIBELLES_ROLES[roleVise]}`;

  const { data, error } = await supabase.rpc('admin_changer_role', {
    p_user_id: utilisateurId,
    p_role: roleVise,
    p_motif: motif,
  });
  if (error) {
    const statut = error.code === '42501' ? 403 : 502;
    return NextResponse.json(
      { erreur: `Rôle non modifié : ${error.message}` },
      { status: statut }
    );
  }

  return NextResponse.json({
    ok: true,
    resultat: Array.isArray(data) ? data[0] ?? null : data ?? null,
  });
}

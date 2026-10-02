// ============================================================
// app/api/admin/abonnement/route.ts — Attribuer / révoquer un
// abonnement (réservé aux administrateurs).
//
//   POST   { utilisateurId, duree }  → attribuer
//   DELETE { utilisateurId }         → révoquer
//
// `duree` accepte 'vie' | '1_mois' | '3_mois' | '12_mois' OU une
// date de fin ISO (YYYY-MM-DD). La conversion en jours pour la RPC
// public.attribuer_abonnement est faite par lib/admin-abonnements.ts.
//
// GARDE SERVEUR : chaque méthode vérifie une permission DISTINCTE
// (admin.abonnements.attribuer / admin.abonnements.revoquer) via
// lib/roles-garde. L'interface ne fait que cacher les boutons — la
// décision d'accès, elle, est prise ici.
//
// RPC appelées (fournies par la branche `w4/paiement`) :
//   attribuer_abonnement(p_user_id uuid, p_duree integer, p_motif text)
//   revoquer_abonnement(p_user_id uuid, p_motif text)
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { creerClientServeur } from '@/lib/supabase/server';
import { verifierPermission } from '@/lib/roles-garde';
import { resoudreDuree, type DureeResolue } from '@/lib/admin-abonnements';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reponseRefus(statut: number) {
  if (statut === 401) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }
  return NextResponse.json(
    { erreur: 'Accès refusé : permission administrateur requise.' },
    { status: 403 }
  );
}

/** Journalise l'action (qui, quoi, quand) dans public.admin_actions. */
async function journaliser(
  supabase: Awaited<ReturnType<typeof creerClientServeur>>,
  action: 'attribuer' | 'revoquer',
  cibleId: string,
  duree: string | null,
  periodeFin: string | null
): Promise<void> {
  const { error } = await supabase.from('admin_actions').insert({
    cible_id: cibleId,
    action,
    duree,
    periode_fin: periodeFin,
  });
  if (error) {
    // Le journal est une trace, pas la transaction : on signale sans
    // annuler l'action déjà validée par la RPC.
    console.warn('[admin] journal indisponible :', error.message);
  }
}

export async function POST(request: NextRequest) {
  const decision = await verifierPermission('admin.abonnements.attribuer');
  if (decision.statut !== 200) return reponseRefus(decision.statut);

  let corps: { utilisateurId?: unknown; duree?: unknown };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  const utilisateurId = typeof corps.utilisateurId === 'string' ? corps.utilisateurId : '';
  if (!UUID.test(utilisateurId)) {
    return NextResponse.json({ erreur: 'Compte cible invalide.' }, { status: 400 });
  }

  const duree: DureeResolue | null = resoudreDuree(corps.duree);
  if (!duree) {
    return NextResponse.json(
      { erreur: 'Durée invalide (attendu : vie, 1_mois, 3_mois, 12_mois ou une date ISO).' },
      { status: 400 }
    );
  }

  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc('attribuer_abonnement', {
    p_user_id: utilisateurId,
    p_duree: duree.jours,
    p_motif: `administrateur ${decision.utilisateurId} — ${duree.libelle}`,
  });
  if (error) {
    return NextResponse.json(
      { erreur: `Abonnement non attribué : ${error.message}` },
      { status: 502 }
    );
  }

  await journaliser(supabase, 'attribuer', utilisateurId, duree.libelle, duree.periodeFin);

  return NextResponse.json({
    ok: true,
    duree: duree.libelle,
    abonnement: Array.isArray(data) ? data[0] ?? null : data ?? null,
  });
}

export async function DELETE(request: NextRequest) {
  const decision = await verifierPermission('admin.abonnements.revoquer');
  if (decision.statut !== 200) return reponseRefus(decision.statut);

  let corps: { utilisateurId?: unknown };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  const utilisateurId = typeof corps.utilisateurId === 'string' ? corps.utilisateurId : '';
  if (!UUID.test(utilisateurId)) {
    return NextResponse.json({ erreur: 'Compte cible invalide.' }, { status: 400 });
  }

  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc('revoquer_abonnement', {
    p_user_id: utilisateurId,
    p_motif: `administrateur ${decision.utilisateurId} — révocation`,
  });
  if (error) {
    return NextResponse.json(
      { erreur: `Abonnement non révoqué : ${error.message}` },
      { status: 502 }
    );
  }

  await journaliser(supabase, 'revoquer', utilisateurId, null, null);

  return NextResponse.json({ ok: true, abonnement: data ?? null });
}

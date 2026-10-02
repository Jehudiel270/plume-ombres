// ============================================================
// app/api/abonnement/route.ts — État d'abonnement du compte (P0.9).
//
// GET → { statut, premium, plan, periodeFin, quota, plans, mode }
// Sert à l'affichage (badge, quota effectif) et à l'espace abonnement.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  CODE_PLAN_GRATUIT,
  estPlanPremium,
  planParCode,
  quotaPourPlan,
  statutEffectif,
  tousLesPlans,
  type CodePlan,
} from '@/lib/abonnement';
import { quotaMensuel } from '@/lib/quota';
import { fournisseurActif } from '@/lib/paiement/fournisseur';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { utilisateurRequete } from '@/lib/paiement/serveur';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { supabase, user } = await utilisateurRequete(request);
  if (!user) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }

  const abonnement = await new MagasinAbonnementSupabase(supabase).lire(user.id);
  const statut = statutEffectif(abonnement);
  const plan =
    planParCode(abonnement?.plan ?? null) ?? planParCode(CODE_PLAN_GRATUIT)!;
  const premium = statut === 'actif' && estPlanPremium(plan);
  const base = quotaMensuel();

  // Fournisseur actif (description, sans secret). Tolérant à l'absence
  // de configuration : on renvoie alors null.
  let paiement: { id: string; nom: string; mode: string } | null = null;
  try {
    const f = fournisseurActif();
    paiement = { id: f.id, nom: f.nom, mode: f.mode };
  } catch {
    paiement = null;
  }

  return NextResponse.json({
    statut,
    premium,
    plan: plan.code,
    planNom: plan.nom,
    periodeDebut: abonnement?.periode_debut ?? null,
    periodeFin: abonnement?.periode_fin ?? null,
    moteur: plan.moteur,
    quota: { base, effectif: quotaPourPlan(plan, base) },
    paiement,
    plans: tousLesPlans().map((p) => ({
      code: p.code as CodePlan,
      nom: p.nom,
      prixXof: p.prixXof,
      devise: p.devise,
      dureeJours: p.dureeJours,
      quotaMensuelCaracteres: p.quotaMensuelCaracteres,
      moteur: p.moteur,
      avantages: p.avantages,
    })),
  });
}

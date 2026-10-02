// ============================================================
// app/api/abonnement/route.ts — État d'abonnement du compte.
//
// GET → { statut, premium, plan, planNom, essai, quota, paiement,
//         plans }
// Sert à l'affichage (badge, quota effectif) et à l'espace abonnement.
// Le plan renvoyé est le plan EFFECTIF : l'essai prime tant qu'il
// court ; un abonnement échu retombe sur `gratuit`.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  CODE_PLAN_GRATUIT,
  estPlanPremium,
  planEffectif,
  quotaPourPlan,
  statutEffectif,
  abonnementActif,
  plansPublics,
  type CodePlan,
} from '@/lib/abonnement';
import { etatEssai, MESSAGE_ESSAI_ECHU } from '@/lib/essai';
import { quotaMensuel } from '@/lib/quota';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { MagasinEssaiSupabase } from '@/lib/paiement/magasin-essai';
import { fournisseurActif } from '@/lib/paiement/fournisseur';
import { utilisateurRequete } from '@/lib/paiement/serveur';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { supabase, user } = await utilisateurRequete(request);
  if (!user) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }

  const magasinAbonnement = new MagasinAbonnementSupabase(supabase);
  let abonnement = await magasinAbonnement.lire(user.id);
  if (abonnement?.plan === 'essai') {
    try {
      await new MagasinEssaiSupabase(supabase).basculerSiEchu(user.id);
      abonnement = (await magasinAbonnement.lire(user.id)) ?? abonnement;
    } catch {
      /* la bascule est un confort : la lecture reste juste sans elle */
    }
  }

  const statut = statutEffectif(abonnement);
  const plan = planEffectif(abonnement);
  const premium = statut === 'actif' && estPlanPremium(plan);
  const base = quotaMensuel();
  const essai = etatEssai(abonnement);

  // Fournisseur de paiement (description, sans secret). Tolérant à
  // l'absence de configuration : on renvoie alors null.
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
    plan: plan.code as CodePlan,
    planNom: plan.nom,
    periodeDebut: abonnement?.periode_debut ?? null,
    periodeFin: abonnement?.periode_fin ?? null,
    quota: { base, effectif: quotaPourPlan(plan, base) },
    essai: {
      ...essai,
      message: essai.actif
        ? null
        : essai.echu
          ? MESSAGE_ESSAI_ECHU
          : null,
    },
    actif: abonnementActif(abonnement),
    paiement,
    plans: plansPublics().map((p) => ({
      code: p.code as CodePlan,
      nom: p.nom,
      resume: p.resume,
      prixXof: p.prixXof,
      prixMensuelXof: p.prixMensuelXof ?? null,
      devise: p.devise,
      dureeJours: p.dureeJours,
      quotaMensuelCaracteres: p.quotaMensuelCaracteres,
      livresMois: p.livresMois,
      traductionsSimultanees: p.traductionsSimultanees,
      filePrioritaire: p.filePrioritaire,
      glossaire: p.glossaire,
      minPersonnes: p.minPersonnes,
      parPersonne: p.parPersonne,
      verificationRequise: p.verificationRequise ?? false,
      usageRaisonnable: p.usageRaisonnable ?? false,
      avantages: p.avantages,
    })),
    planGratuit: CODE_PLAN_GRATUIT,
  });
}

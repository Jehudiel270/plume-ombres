// ============================================================
// app/api/abonnement/route.ts — État d'abonnement du compte (P0.9).
//
// GET → { statut, premium, plan, periodeFin, quota, plans, mode }
// Sert à l'affichage (badge, quota effectif) et à l'espace abonnement.
//
// Le CATALOGUE (plans + packs) est lu depuis la BASE
// (public.plans_abonnement + public.packs_credits) : aucune valeur de
// prix, de durée ou de quota n'est écrite en dur ici. lireCatalogue()
// hydrate aussi le catalogue partagé (lib/abonnement.ts) pour les
// fonctions d'affichage synchrones.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  CODE_PLAN_GRATUIT,
  estPackCredits,
  estPlanPremium,
  packsCredits,
  planParCode,
  planEnVigueur,
  plansAbonnementAffiches,
  quotaPourPlan,
  statutEffectif,
  type CodePlan,
} from '@/lib/abonnement';
import { lireCatalogue } from '@/lib/plans-catalogue';
import { lireQuotaRestant, quotaMensuel, MagasinQuotaSupabase, type QuotaRestant } from '@/lib/quota';
import { fournisseurActif } from '@/lib/paiement/fournisseur';
import { MagasinAbonnementSupabase, MagasinCreditsSupabase, lireMouvementsCredits } from '@/lib/paiement/magasin';
import { utilisateurRequete } from '@/lib/paiement/serveur';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { supabase, user } = await utilisateurRequete(request);
  if (!user) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }

  // La BASE est la source de vérité : on lit le catalogue, on hydrate le
  // catalogue partagé, puis on résout l'offre du compte dessus.
  await lireCatalogue(supabase);

  const abonnement = await new MagasinAbonnementSupabase(supabase).lire(user.id);
  const statut = statutEffectif(abonnement);
  const plan =
    planParCode(abonnement?.plan ?? null) ?? planParCode(CODE_PLAN_GRATUIT)!;
  const premium = statut === 'actif' && estPlanPremium(plan);
  const base = quotaMensuel();
  // Le quota effectif suit l'offre réellement en vigueur : un abonnement
  // échu (periode_fin <= now()) retombe sur le plafond de base.
  const planQuota =
    planParCode(planEnVigueur(abonnement)) ?? planParCode(CODE_PLAN_GRATUIT)!;

  // Crédits prépayés (pay-as-you-go) : solde + journal récent. Tolérant :
  // une base non migrée ne doit pas faire échouer tout l'état du compte.
  const magasinCredits = new MagasinCreditsSupabase(supabase);
  const [soldeCredits, mouvements] = await Promise.all([
    magasinCredits.lireSolde(user.id).catch(() => 0),
    lireMouvementsCredits(supabase, user.id).catch(() => []),
  ]);

  // QUOTA RÉEL : la limite effective de l'offre en vigueur, PLUS ce qui
  // a été consommé et ce qui reste sur la période. Sans cela l'appelant
  // ne pouvait afficher que le plafond (valeur figée, jamais à jour).
  const limiteEffective = quotaPourPlan(planQuota, base);
  let usage: QuotaRestant | null = null;
  try {
    usage = await lireQuotaRestant(
      new MagasinQuotaSupabase(supabase),
      user.id,
      new Date(),
      limiteEffective
    );
  } catch (erreur) {
    // Base non migrée / panne : on n'invente aucune consommation, la
    // limite reste servie telle quelle.
    console.warn(
      '[abonnement] usage de quota illisible :',
      erreur instanceof Error ? erreur.message : erreur
    );
  }

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
    quota: {
      base,
      effectif: limiteEffective,
      // Ce qui RESTE (null si l'usage est illisible) : l'UI l'affiche
      // tel quel, sans recalcul local.
      utilise: usage?.utilise ?? null,
      restant: usage?.restant ?? null,
      limite: usage?.limite ?? limiteEffective,
      periode: usage?.periode ?? null,
    },
    credits: {
      solde: soldeCredits,
      mouvements,
      packs: packsCredits().map((p) => ({
        code: p.code as CodePlan,
        nom: p.nom,
        prixXof: p.prixXof,
        devise: p.devise,
        caracteres: p.caracteres ?? 0,
        avantages: p.avantages,
        estPack: estPackCredits(p),
      })),
    },
    paiement,
    plans: plansAbonnementAffiches().map((p) => ({
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

// ============================================================
// app/api/paiement/verifier/route.ts — « Vérifier au retour » (P0.9).
//
// POST { reference } → { statut, statutAbonnement, premium, plan,
//                        periodeFin, fournisseur }
//
// Utile quand le webhook tarde : interroge le fournisseur (mode réel)
// et applique le résultat. La lecture du paiement est bornée par la
// RLS au propriétaire connecté.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { fournisseurActif } from '@/lib/paiement/fournisseur';
import {
  MagasinAbonnementSupabase,
  MagasinCreditsSupabase,
  MagasinPaiementSupabase,
} from '@/lib/paiement/magasin';
import { lireStatutAbonnement, verifierAuRetour } from '@/lib/paiement/service';
import { utilisateurRequete } from '@/lib/paiement/serveur';
import {
  CODE_RATE_LIMIT_DEPASSE,
  MagasinRateLimitSupabase,
  entetesRateLimit,
  extraireIp,
  limiterRequete,
  optionsRateLimit,
  type ClientRpc,
  type EtatRateLimit,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { supabase, user } = await utilisateurRequete(request);
  if (!user) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }

  // Chaque appel interroge l'API du fournisseur : sans plafond, un compte
  // pourrait s'en servir comme relais de sondage. Même barème que la
  // création de paiement.
  const ip = extraireIp(request);
  let etatDebit: EtatRateLimit | null = null;
  try {
    const clientRpc: ClientRpc = {
      rpc: (nom, args) => supabase.rpc(nom, args),
    };
    etatDebit = await limiterRequete(
      new MagasinRateLimitSupabase(clientRpc),
      { userId: user.id, ip },
      optionsRateLimit()
    );
  } catch (erreur) {
    console.warn(
      '[rate-limit] magasin indisponible sur /api/paiement/verifier :',
      erreur instanceof Error ? erreur.message : erreur
    );
  }
  if (etatDebit && !etatDebit.autorise) {
    return NextResponse.json(
      {
        erreur: 'Trop de vérifications : réessayez dans un instant.',
        code: CODE_RATE_LIMIT_DEPASSE,
      },
      { status: 429, headers: entetesRateLimit(etatDebit) }
    );
  }

  let corps: { reference?: unknown };
  try {
    corps = (await request.json()) as { reference?: unknown };
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }
  const reference =
    typeof corps.reference === 'string' ? corps.reference.trim() : '';
  if (!reference) {
    return NextResponse.json({ erreur: 'Référence manquante.' }, { status: 400 });
  }

  const magasinPaiement = new MagasinPaiementSupabase(supabase);
  const magasinAbonnement = new MagasinAbonnementSupabase(supabase);
  const magasinCredits = new MagasinCreditsSupabase(supabase);
  const existing = await magasinPaiement.lire(reference);
  if (!existing) {
    return NextResponse.json({ erreur: 'Paiement introuvable.' }, { status: 404 });
  }

  try {
    await verifierAuRetour(
      {
        magasinPaiement,
        magasinAbonnement,
        magasinCredits,
        fournisseur: fournisseurActif(),
      },
      reference
    );
  } catch {
    /* fournisseur momentanément indisponible : on renvoie l'état connu */
  }

  const paiement = await magasinPaiement.lire(reference);
  const abonnement = await lireStatutAbonnement(
    { magasinAbonnement },
    existing.proprietaire_id
  );

  return NextResponse.json({
    statut: paiement?.statut ?? 'inconnu',
    statutAbonnement: abonnement.statut,
    premium: abonnement.premium,
    plan: abonnement.abonnement?.plan ?? null,
    periodeFin: abonnement.abonnement?.periode_fin ?? null,
    fournisseur: paiement?.fournisseur ?? null,
  });
}

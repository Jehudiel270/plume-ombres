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
  MagasinPaiementSupabase,
} from '@/lib/paiement/magasin';
import { lireStatutAbonnement, verifierAuRetour } from '@/lib/paiement/service';
import { utilisateurRequete } from '@/lib/paiement/serveur';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { supabase, user } = await utilisateurRequete(request);
  if (!user) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
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
  const existing = await magasinPaiement.lire(reference);
  if (!existing) {
    return NextResponse.json({ erreur: 'Paiement introuvable.' }, { status: 404 });
  }

  try {
    await verifierAuRetour(
      {
        magasinPaiement,
        magasinAbonnement,
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

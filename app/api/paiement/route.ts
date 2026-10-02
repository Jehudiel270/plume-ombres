// ============================================================
// app/api/paiement/route.ts — Initier un paiement Mobile Money (P0.9).
//
// POST { plan, telephone, pays?, prenom?, nom?, email? }
//   → { url, reference, fournisseur }
//
// Le fournisseur actif vient de la fabrique (FedaPay en tête, repli
// simulation). En simulation : URL locale /paiement/simulation,
// aucune clé, aucun débit.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { estCodePlan } from '@/lib/abonnement';
import { fournisseurActif } from '@/lib/paiement/fournisseur';
import {
  MagasinAbonnementSupabase,
  MagasinPaiementSupabase,
} from '@/lib/paiement/magasin';
import { initierPaiement } from '@/lib/paiement/service';
import { origineSite, utilisateurRequete } from '@/lib/paiement/serveur';

export const runtime = 'nodejs';

function texte(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await utilisateurRequete(request);
  if (!user) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  if (!estCodePlan(corps.plan)) {
    return NextResponse.json({ erreur: 'Plan inconnu.' }, { status: 400 });
  }
  const telephone = texte(corps.telephone);
  if (!telephone || telephone.replace(/\D/g, '').length < 8) {
    return NextResponse.json(
      { erreur: 'Numéro Mobile Money invalide.' },
      { status: 400 }
    );
  }

  const base = origineSite(request);
  let fournisseur;
  try {
    fournisseur = fournisseurActif(base);
  } catch (erreur) {
    return NextResponse.json(
      {
        erreur:
          erreur instanceof Error ? erreur.message : 'Paiement indisponible.',
      },
      { status: 503 }
    );
  }

  try {
    const resultat = await initierPaiement(
      {
        magasinPaiement: new MagasinPaiementSupabase(supabase),
        magasinAbonnement: new MagasinAbonnementSupabase(supabase),
        fournisseur,
        baseUrl: base,
      },
      {
        proprietaireId: user.id,
        plan: corps.plan,
        telephone,
        pays: texte(corps.pays),
        prenom: texte(corps.prenom),
        nom: texte(corps.nom),
        email: texte(corps.email) ?? user.email ?? undefined,
      }
    );
    return NextResponse.json({
      url: resultat.url,
      reference: resultat.paiement.reference,
      fournisseur: resultat.fournisseur,
    });
  } catch (erreur) {
    return NextResponse.json(
      {
        erreur:
          erreur instanceof Error ? erreur.message : 'Paiement impossible.',
      },
      { status: 400 }
    );
  }
}

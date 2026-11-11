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
  MagasinCreditsSupabase,
  MagasinPaiementSupabase,
} from '@/lib/paiement/magasin';
import { initierPaiement } from '@/lib/paiement/service';
import { origineSite, utilisateurRequete } from '@/lib/paiement/serveur';
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

function texte(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await utilisateurRequete(request);
  if (!user) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }

  // Chaque création de paiement ouvre une transaction chez le fournisseur :
  // sans plafond, un compte valide pourrait saturer la ligne et enchaîner
  // des demandes de prélèvement. On limite donc par compte ET par IP.
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
    // Magasin de débit indisponible : on laisse passer (disponibilité) mais
    // on signale l'incident. L'authentification reste la barrière d'accès.
    console.warn(
      '[rate-limit] magasin indisponible sur /api/paiement :',
      erreur instanceof Error ? erreur.message : erreur
    );
  }
  if (etatDebit && !etatDebit.autorise) {
    return NextResponse.json(
      {
        erreur: 'Trop de tentatives de paiement : réessayez dans un instant.',
        code: CODE_RATE_LIMIT_DEPASSE,
      },
      { status: 429, headers: entetesRateLimit(etatDebit) }
    );
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
  const moyen = corps.moyen === 'carte' ? 'carte' : 'mobile_money';
  if (moyen === 'mobile_money' && (!telephone || telephone.replace(/\D/g, '').length < 8)) {
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
        magasinCredits: new MagasinCreditsSupabase(supabase),
        fournisseur,
        baseUrl: base,
      },
      {
        proprietaireId: user.id,
        plan: corps.plan,
        telephone,
        moyen,
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

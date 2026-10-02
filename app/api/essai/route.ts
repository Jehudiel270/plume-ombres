// ============================================================
// app/api/essai/route.ts — Essai gratuit 7 jours (état et anti-abus).
//
// GET  → état de l'essai du compte (en cours / échu / livres utilisés).
// POST { telephone } → lie un numéro Mobile Money à l'essai.
//   * 200 si le numéro est libre (ou déjà le sien) ;
//   * 409 si le numéro est déjà utilisé par un essai qui n'a pas payé :
//     l'essai du compte est alors RÉVOQUÉ (bascule en gratuit), la
//     bibliothèque restant intacte.
//
// Aucune carte, aucun numéro n'est exigé pour DÉMARRER l'essai :
// il est attribué automatiquement à la création du compte.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { planEffectif } from '@/lib/abonnement';
import {
  CODE_ESSAI_TELEPHONE_UTILISE,
  etatEssai,
  masquerTelephone,
  messageEssaiActif,
  normaliserTelephone,
} from '@/lib/essai';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { MagasinEssaiSupabase } from '@/lib/paiement/magasin-essai';
import { utilisateurRequete } from '@/lib/paiement/serveur';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function etatCompte(
  supabase: Awaited<ReturnType<typeof utilisateurRequete>>['supabase'],
  utilisateurId: string
) {
  const magasin = new MagasinEssaiSupabase(supabase);
  const abonnement = await new MagasinAbonnementSupabase(supabase).lire(utilisateurId);
  // Bascule automatique en gratuit si l'essai est échu.
  if (abonnement?.plan === 'essai') {
    try {
      await magasin.basculerSiEchu(utilisateurId);
    } catch {
      /* la bascule est un confort : la lecture reste juste sans elle */
    }
  }
  const aJour =
    (await new MagasinAbonnementSupabase(supabase).lire(utilisateurId)) ?? abonnement;
  const etat = etatEssai(aJour);
  const registre = await magasin.lireRegistre(utilisateurId);
  const plan = planEffectif(aJour);
  return {
    essai: etat,
    message: etat.actif
      ? messageEssaiActif(etat)
      : etat.echu
        ? 'Votre essai gratuit est terminé : votre bibliothèque est conservée.'
        : null,
    telephone: registre?.telephone ? masquerTelephone(registre.telephone) : null,
    telephoneScelle: !!registre?.telephone,
    dejaPaye: !!registre?.paye_le,
    plan: plan.code,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, user } = await utilisateurRequete(request);
  if (!user) return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  const etat = await etatCompte(supabase, user.id);
  return NextResponse.json(etat);
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await utilisateurRequete(request);
  if (!user) return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });

  let corps: { telephone?: unknown } = {};
  try {
    corps = (await request.json()) as { telephone?: unknown };
  } catch {
    corps = {};
  }
  const telephoneBrut =
    typeof corps.telephone === 'string' ? corps.telephone.trim() : '';
  if (!telephoneBrut) {
    const etat = await etatCompte(supabase, user.id);
    return NextResponse.json(etat);
  }
  const telephone = normaliserTelephone(telephoneBrut);
  if (!telephone) {
    return NextResponse.json(
      { erreur: 'Numéro Mobile Money invalide.' },
      { status: 400 }
    );
  }

  try {
    const resultat = await new MagasinEssaiSupabase(supabase).sceller(telephone);
    if (!resultat.ok && resultat.code === CODE_ESSAI_TELEPHONE_UTILISE) {
      return NextResponse.json(
        {
          erreur:
            'Ce numéro Mobile Money a déjà servi à un essai gratuit. ' +
            'L’essai de ce compte a été interrompu ; vous pouvez souscrire une offre.',
          code: CODE_ESSAI_TELEPHONE_UTILISE,
        },
        { status: 409 }
      );
    }
    if (!resultat.ok) {
      const messages: Record<string, string> = {
        SANS_ESSAI: 'Aucun essai en cours sur ce compte.',
        TELEPHONE_INVALIDE: 'Numéro Mobile Money invalide.',
      };
      return NextResponse.json(
        { erreur: messages[resultat.code] ?? 'Essai indisponible.', code: resultat.code },
        { status: 400 }
      );
    }
    const etat = await etatCompte(supabase, user.id);
    return NextResponse.json({ ...etat, telephone: masquerTelephone(telephone) });
  } catch (erreur) {
    return NextResponse.json(
      {
        erreur:
          erreur instanceof Error ? erreur.message : 'Essai momentanément indisponible.',
      },
      { status: 503 }
    );
  }
}

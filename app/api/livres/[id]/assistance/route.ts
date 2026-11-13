// ============================================================
// app/api/livres/[id]/assistance/route.ts — Aide à la reprise (F10)
// et questions sur la lecture (F6). PREMIUM (interrupteur `reprise`,
// plan Passionné et au-delà).
//
//   POST { action: 'resume' } ou { action: 'question', question }
//        + chapitreLu (position 1..n transmise par le lecteur)
//
// ANTI-SPOILERS : le contexte du modèle est construit côté serveur
// avec les SEULS chapitres ≤ chapitreLu. Le résumé est mis en cache
// (resume_lectures) et régénéré seulement quand la lecture avance.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { resumerReprise, questionnerIntrigue } from '@/lib/assistance';

export const runtime = 'nodejs';
// Les appels modèle peuvent prendre quelques secondes : marge de fonction.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 400 });
  }

  const client = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(client)
    .lire(utilisateur.id)
    .catch(() => null);
  const module = await verifierModuleApi('reprise', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!module.ouvert && module.reponseApi) {
    return module.reponseApi;
  }

  let corps: { action?: unknown; question?: unknown; chapitreLu?: unknown };
  try {
    corps = (await request.json()) as typeof corps;
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  // La position lue : nombre entier borné (le lecteur envoie son
  // chapitre ouvert) ; le serveur ne prend JAMAIS une position « au
  //-delà » en confiance — il filtre de toute façon par ≤.
  const chapitreLu =
    typeof corps.chapitreLu === 'number' && Number.isInteger(corps.chapitreLu)
      ? Math.max(0, corps.chapitreLu)
      : null;

  try {
    if (corps.action === 'resume') {
      const resume = await resumerReprise(client, id, chapitreLu);
      if (!resume) {
        return NextResponse.json({
          ok: true,
          resume: null,
          message: 'Ouvrez au moins un chapitre traduit pour obtenir un résumé.',
        });
      }
      return NextResponse.json({ ok: true, resume });
    }
    if (corps.action === 'question') {
      const reponse = await questionnerIntrigue(
        client,
        id,
        chapitreLu,
        typeof corps.question === 'string' ? corps.question : ''
      );
      return NextResponse.json({ ok: true, reponse });
    }
    return NextResponse.json({ erreur: 'Action inconnue.' }, { status: 400 });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'L’aide à la lecture est indisponible.' },
      { status: 502 }
    );
  }
}

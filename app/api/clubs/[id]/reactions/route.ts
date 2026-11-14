// ============================================================
// app/api/clubs/[id]/reactions/route.ts — Réactions émojis d'un
// message du salon (F11 v3).
//
//   POST { messageId, emoji } → BASCULE : ajoute ma réaction si je
//   ne l'avais pas, la retire si je l'avais déjà (une seule requête,
//   un seul aller-retour — la discussion reste fluide).
//
// GARDES : session 401, interrupteur `clubs`, adhésion au club,
// liste blanche d'émojis (lib/clubs), message lisible par moi
// (plafond anti-spoilers + message privé concerné seulement),
// unicité en base (message, utilisateur, émoji). La RLS double
// chaque garde.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { estEmojiReaction, messageVisiblePour } from '@/lib/clubs';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Contexte = {
  ok: true;
  client: Awaited<ReturnType<typeof creerClientServeur>>;
  utilisateurId: string;
  clubId: string;
  maPosition: number;
};

async function contexte(
  id: string
): Promise<Contexte | { ok: false; reponse: NextResponse }> {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    return {
      ok: false,
      reponse: NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 }),
    };
  }
  const client = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(client)
    .lire(utilisateur.id)
    .catch(() => null);
  const moduleVerdict = await verifierModuleApi('clubs', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert && moduleVerdict.reponseApi) {
    return { ok: false, reponse: moduleVerdict.reponseApi };
  }
  if (!UUID.test(id)) {
    return {
      ok: false,
      reponse: NextResponse.json({ erreur: 'Club inconnu.' }, { status: 404 }),
    };
  }
  const [monAdhesion, club] = await Promise.all([
    client
      .from('clubs_membres')
      .select('position_lecture')
      .eq('club_id', id)
      .eq('utilisateur_id', utilisateur.id)
      .maybeSingle(),
    client
      .from('clubs')
      .select('id')
      .eq('id', id)
      .maybeSingle(),
  ]);
  const position = (monAdhesion.data as { position_lecture: number } | null)
    ?.position_lecture;
  if (position === undefined || position === null || !club.data) {
    return {
      ok: false,
      reponse: NextResponse.json({ erreur: 'Club inconnu.' }, { status: 404 }),
    };
  }
  return {
    ok: true,
    client,
    utilisateurId: utilisateur.id,
    clubId: id,
    maPosition: position,
  };
}

export async function POST(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexte(id);
  if (!c.ok) return c.reponse;
  let corps: Record<string, unknown>;
  try {
    corps = (await requete.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erreur: 'Requête illisible.' }, { status: 400 });
  }

  const messageId = Math.floor(Number(corps.messageId));
  if (!Number.isFinite(messageId) || messageId <= 0) {
    return NextResponse.json({ erreur: 'Message introuvable.' }, { status: 404 });
  }
  if (!estEmojiReaction(corps.emoji)) {
    return NextResponse.json(
      { erreur: 'Réaction inconnue : choisissez un émoji de la palette.' },
      { status: 422 }
    );
  }
  const emoji = corps.emoji;

  // Le message existe-t-il dans CE club et puis-je le lire ?
  const { data: message } = await c.client
    .from('clubs_messages')
    .select('id, auteur_id, chapitre_max, prive, destinataire_id')
    .eq('id', messageId)
    .eq('club_id', c.clubId)
    .maybeSingle();
  const ligne = message as
    | {
        id: number;
        auteur_id: string;
        chapitre_max: number;
        prive: boolean;
        destinataire_id: string | null;
      }
    | null;
  if (
    !ligne ||
    !messageVisiblePour(ligne.chapitre_max, c.maPosition) ||
    (ligne.prive &&
      ligne.auteur_id !== c.utilisateurId &&
      ligne.destinataire_id !== c.utilisateurId)
  ) {
    return NextResponse.json({ erreur: 'Message introuvable.' }, { status: 404 });
  }

  // Bascule : présente → je retire ; absente → j'ajoute.
  const { data: existante } = await c.client
    .from('clubs_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('utilisateur_id', c.utilisateurId)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existante) {
    const { error } = await c.client
      .from('clubs_reactions')
      .delete()
      .eq('id', (existante as { id: number }).id);
    if (error) {
      return NextResponse.json({ erreur: 'Retrait refusé.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, actif: false });
  }

  const { error } = await c.client.from('clubs_reactions').insert({
    message_id: messageId,
    club_id: c.clubId,
    utilisateur_id: c.utilisateurId,
    emoji,
  });
  if (error) {
    // Course entre deux onglets : la contrainte UNIQUE a tranché,
    // la réaction est déjà posée — réponse stable, pas une erreur.
    if (error.code === '23505') {
      return NextResponse.json({ ok: true, actif: true });
    }
    return NextResponse.json({ erreur: 'Réaction refusée.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, actif: true }, { status: 201 });
}

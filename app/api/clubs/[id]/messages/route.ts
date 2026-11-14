// ============================================================
// app/api/clubs/[id]/messages/route.ts — Actions sur un message
// d'un club privé (F11 v2).
//
//   PATCH  { id, contenu }              → l'AUTEUR édite son message
//                                         (fenêtre de 15 minutes,
//                                         une seule modification).
//   POST   { action: 'epingler', id }   → le CRÉATEUR épingle
//          { action: 'desepingler', id }  (ou désépingle) un message.
//          { action: 'signaler', id }   → un MEMBRE signale un
//          { action: 'retirer-signalement', id } → message ; le
//                                         créateur retire le signalement.
//   DELETE ?id=<message>                → l'auteur ou le créateur
//                                         supprime le message.
//
// GARDES : session 401, interrupteur `clubs`, adhésion au club,
// règles lib/clubs. La RLS double l'autorité de l'API.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { editionPossible, propreMessage } from '@/lib/clubs';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Contexte = {
  ok: true;
  client: Awaited<ReturnType<typeof creerClientServeur>>;
  utilisateurId: string;
  clubId: string;
  estCreateur: boolean;
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
      .select('createur_id')
      .eq('id', id)
      .maybeSingle(),
  ]);
  if (!monAdhesion.data || !club.data) {
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
    estCreateur: (club.data as { createur_id: string }).createur_id === utilisateur.id,
  };
}

type LigneMessage = {
  id: number;
  auteur_id: string;
  contenu: string;
  created_at: string;
  modifie_le: string | null;
  signale: boolean;
  epingle: boolean;
};

/** Le message appartient bien à CE club ? Renvoie la ligne ou null. */
async function messageDuClub(
  c: Contexte,
  idBrut: unknown
): Promise<LigneMessage | null> {
  const id = Math.floor(Number(idBrut));
  if (!Number.isFinite(id) || id <= 0) return null;
  const { data } = await c.client
    .from('clubs_messages')
    .select('id, auteur_id, contenu, created_at, modifie_le, signale, epingle')
    .eq('id', id)
    .eq('club_id', c.clubId)
    .maybeSingle();
  return (data as LigneMessage | null) ?? null;
}

export async function PATCH(
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

  const message = await messageDuClub(c, corps.id);
  if (!message) {
    return NextResponse.json({ erreur: 'Message introuvable.' }, { status: 404 });
  }
  if (message.auteur_id !== c.utilisateurId) {
    return NextResponse.json(
      { erreur: 'On n’édite que ses propres messages.' },
      { status: 403 }
    );
  }
  if (!editionPossible(message.created_at, message.modifie_le)) {
    return NextResponse.json(
      { erreur: 'La fenêtre d’édition (15 minutes) est close. Supprimez et republiez.' },
      { status: 422 }
    );
  }
  const contenu = propreMessage(corps.contenu);
  if (!contenu) {
    return NextResponse.json({ erreur: 'Message vide.' }, { status: 422 });
  }
  const { error } = await c.client
    .from('clubs_messages')
    .update({ contenu, modifie_le: new Date().toISOString() })
    .eq('id', message.id)
    .eq('auteur_id', c.utilisateurId);
  if (error) {
    return NextResponse.json({ erreur: 'Modification refusée.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
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
  const action = typeof corps.action === 'string' ? corps.action : '';
  const message = await messageDuClub(c, corps.id);
  if (!message) {
    return NextResponse.json({ erreur: 'Message introuvable.' }, { status: 404 });
  }

  // Épinglage : outil du créateur pour tenir les annonces en tête.
  if (action === 'epingler' || action === 'desepingler') {
    if (!c.estCreateur) {
      return NextResponse.json(
        { erreur: 'Seul le créateur épingle un message.' },
        { status: 403 }
      );
    }
    const { error } = await c.client
      .from('clubs_messages')
      .update({ epingle: action === 'epingler' })
      .eq('id', message.id);
    if (error) {
      return NextResponse.json({ erreur: 'Épinglage refusé.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, epingle: action === 'epingler' });
  }

  // Signalement : tout membre (sauf l'auteur lui-même, inutile).
  if (action === 'signaler') {
    if (message.auteur_id === c.utilisateurId) {
      return NextResponse.json(
        { erreur: 'Inutile de signaler votre propre message : supprimez-le.' },
        { status: 422 }
      );
    }
    const { error } = await c.client
      .from('clubs_messages')
      .update({ signale: true })
      .eq('id', message.id);
    if (error) {
      return NextResponse.json({ erreur: 'Signalement refusé.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Retrait du signalement : le créateur tranche.
  if (action === 'retirer-signalement') {
    if (!c.estCreateur) {
      return NextResponse.json(
        { erreur: 'Seul le créateur retire un signalement.' },
        { status: 403 }
      );
    }
    const { error } = await c.client
      .from('clubs_messages')
      .update({ signale: false })
      .eq('id', message.id);
    if (error) {
      return NextResponse.json({ erreur: 'Retrait refusé.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erreur: 'Action inconnue.' }, { status: 422 });
}

export async function DELETE(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexte(id);
  if (!c.ok) return c.reponse;
  const idBrut = requete.nextUrl.searchParams.get('id');
  const message = await messageDuClub(c, idBrut);
  if (!message) {
    return NextResponse.json({ erreur: 'Message introuvable.' }, { status: 404 });
  }
  if (message.auteur_id !== c.utilisateurId && !c.estCreateur) {
    return NextResponse.json(
      { erreur: 'Seul l’auteur ou le créateur supprime un message.' },
      { status: 403 }
    );
  }
  const { error } = await c.client
    .from('clubs_messages')
    .delete()
    .eq('id', message.id);
  if (error) {
    return NextResponse.json({ erreur: 'Suppression refusée.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

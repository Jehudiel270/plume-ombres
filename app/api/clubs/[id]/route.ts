// ============================================================
// app/api/clubs/[id]/route.ts — Salon d'un club privé (F11).
//
//   GET     → le club, ses membres, ses messages FILTRÉS :
//             tout message dont `chapitre_max` dépasse MA position
//             de lecture est retiré CÔTÉ SERVEUR (jamais un flou
//             CSS — règle du brief).
//   POST    → { contenu, chapitreMax?, positionLecture? } : publier
//             un message ou mettre à jour sa position de lecture.
//   DELETE  → quitter le club (le créateur ne peut pas quitter :
//             il supprime le club entier).
//
// GARDES : session 401, interrupteur `clubs` (fermé → 404, plan
// insuffisant → 403), RLS par adhésion, bornes lib/clubs.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  bornePosition,
  messageVisiblePour,
  propreMessage,
} from '@/lib/clubs';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Contexte = {
  ok: true;
  client: Awaited<ReturnType<typeof creerClientServeur>>;
  utilisateurId: string;
  clubId: string;
  maPosition: number;
  estCreateur: boolean;
};

async function contexte(id: string): Promise<Contexte | { ok: false; reponse: NextResponse }> {
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
  // Mon adhésion (RLS « own » sur clubs_membres) + le club (RLS par
  // adhésion : si je ne suis pas membre, la lecture du club est vide).
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
    estCreateur: (club.data as { createur_id: string }).createur_id === utilisateur.id,
  };
}

export async function GET(
  _requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexte(id);
  if (!c.ok) return c.reponse;

  const [clubLigne, membres, messages] = await Promise.all([
    c.client
      .from('clubs')
      .select('id, titre, description, code_invitation, createur_id, livres ( titre )')
      .eq('id', c.clubId)
      .maybeSingle(),
    c.client
      .from('clubs_membres')
      .select('utilisateur_id, position_lecture, profiles ( pseudo )')
      .eq('club_id', c.clubId)
      .order('rejoins_le', { ascending: true })
      .limit(12),
    c.client
      .from('clubs_messages')
      .select('id, auteur_id, contenu, chapitre_max, created_at, profiles ( pseudo )')
      .eq('club_id', c.clubId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (!clubLigne.data || membres.error || messages.error) {
    return NextResponse.json({ erreur: 'Club introuvable.' }, { status: 404 });
  }

  type MembreLigne = {
    utilisateur_id: string;
    position_lecture: number;
    profiles: { pseudo: string | null } | null;
  };
  type MessageLigne = {
    id: number;
    auteur_id: string;
    contenu: string;
    chapitre_max: number;
    created_at: string;
    profiles: { pseudo: string | null } | null;
  };

  // FILTRAGE ANTI-SPOILERS côté serveur : le contenu hors de ma
  // lecture N'EST PAS ENVOYÉ (compte tenu dans `masques`).
  const visibles: Array<{
    id: number;
    auteur: string;
    mien: boolean;
    contenu: string;
    plafond: number;
    le: string;
  }> = [];
  let masques = 0;
  for (const m of (messages.data ?? []) as unknown as MessageLigne[]) {
    if (!messageVisiblePour(m.chapitre_max, c.maPosition)) {
      masques += 1;
      continue;
    }
    visibles.push({
      id: m.id,
      auteur: m.profiles?.pseudo ?? 'Lecteur',
      mien: m.auteur_id === c.utilisateurId,
      contenu: m.contenu,
      plafond: m.chapitre_max,
      le: m.created_at,
    });
  }

  const club = clubLigne.data as unknown as {
    titre: string;
    description: string | null;
    code_invitation: string;
    createur_id: string;
    livres: { titre: string } | null;
  };

  return NextResponse.json(
    {
      club: {
        titre: club.titre,
        description: club.description,
        codeInvitation: club.code_invitation,
        estCreateur: c.estCreateur,
        livreTitre: club.livres?.titre ?? null,
      },
      maPosition: c.maPosition,
      membres: ((membres.data ?? []) as unknown as MembreLigne[]).map((m) => ({
        pseudo: m.profiles?.pseudo ?? 'Lecteur',
        moi: m.utilisateur_id === c.utilisateurId,
        position: m.position_lecture,
      })),
      messages: visibles,
      masques,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
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

  // Mise à jour de MA position de lecture (anti-spoilers personnel).
  if (corps.positionLecture !== undefined && corps.contenu === undefined) {
    const { error } = await c.client
      .from('clubs_membres')
      .update({ position_lecture: bornePosition(corps.positionLecture) })
      .eq('club_id', c.clubId)
      .eq('utilisateur_id', c.utilisateurId);
    if (error) {
      return NextResponse.json({ erreur: 'Mise à jour refusée.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const contenu = propreMessage(corps.contenu);
  if (!contenu) {
    return NextResponse.json({ erreur: 'Message vide.' }, { status: 422 });
  }
  const chapitreMax = Math.max(0, Math.round(Number(corps.chapitreMax) || 0));

  // Anti-spam : au plus un message toutes les 20 secondes par membre.
  const { data: dernier } = await c.client
    .from('clubs_messages')
    .select('created_at')
    .eq('club_id', c.clubId)
    .eq('auteur_id', c.utilisateurId)
    .order('created_at', { ascending: false })
    .limit(1);
  const dernierLe = (dernier?.[0] as { created_at: string } | undefined)?.created_at;
  if (dernierLe && Date.now() - new Date(dernierLe).getTime() < 20_000) {
    return NextResponse.json(
      { erreur: 'Un peu de calme : attendez quelques secondes entre deux messages.' },
      { status: 429 }
    );
  }

  const { error } = await c.client.from('clubs_messages').insert({
    club_id: c.clubId,
    auteur_id: c.utilisateurId,
    contenu,
    chapitre_max: chapitreMax,
  });
  if (error) {
    return NextResponse.json({ erreur: 'Publication refusée.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(
  _requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexte(id);
  if (!c.ok) return c.reponse;
  if (c.estCreateur) {
    return NextResponse.json(
      { erreur: 'Le créateur ne quitte pas son club : il le supprime depuis la liste.' },
      { status: 422 }
    );
  }
  const { error } = await c.client
    .from('clubs_membres')
    .delete()
    .eq('club_id', c.clubId)
    .eq('utilisateur_id', c.utilisateurId);
  if (error) {
    return NextResponse.json({ erreur: 'Départ refusé.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

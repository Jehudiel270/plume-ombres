// ============================================================
// app/api/clubs/[id]/route.ts — Salon d'un club privé (F11 v2).
//
//   GET     → le club, ses membres, ses messages FILTRÉS :
//             tout message dont `chapitre_max` dépasse MA position
//             de lecture est retiré CÔTÉ SERVEUR (jamais un flou
//             CSS — règle du brief). Pagination : ?avant=<id>.
//   POST    → { contenu, chapitreMax?, reponseA? } : publier
//             { positionLecture } : mettre à jour ma position
//             { action: 'regenerer-code' } : créateur seulement
//   PATCH   → réglages du club (créateur) : titre, description,
//             livreId (null pour détacher le livre)
//   DELETE  → quitter le club ; ?mode=supprimer : le créateur
//             supprime le club entier (messages et adhésions
//             partent en cascade).
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
  codeInvitation,
  editionPossible,
  messageVisiblePour,
  propreMessage,
  propreTexte,
} from '@/lib/clubs';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pagination du fil : 60 messages par page. */
const PAGE_MESSAGES = 60;

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
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexte(id);
  if (!c.ok) return c.reponse;

  // Curseur de pagination : les messages plus anciens que `avant`.
  const avantBrut = requete.nextUrl.searchParams.get('avant');
  const avant = Number(avantBrut);
  const pageAnciens = Number.isFinite(avant) && avant > 0;

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
      .limit(24),
    c.client
      .from('clubs_messages')
      .select(
        'id, auteur_id, contenu, chapitre_max, created_at, modifie_le, epingle, reponse_a, signale, profiles ( pseudo )'
      )
      .eq('club_id', c.clubId)
      .lt('id', pageAnciens ? Math.floor(avant) : Number.MAX_SAFE_INTEGER)
      .order('created_at', { ascending: false })
      .limit(PAGE_MESSAGES + 1),
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
    modifie_le: string | null;
    epingle: boolean;
    reponse_a: number | null;
    signale: boolean;
    profiles: { pseudo: string | null } | null;
  };

  const lignes = (messages.data ?? []) as unknown as MessageLigne[];
  const plusAnciens = lignes.length > PAGE_MESSAGES;
  const page = plusAnciens ? lignes.slice(0, PAGE_MESSAGES) : lignes;

  // FILTRAGE ANTI-SPOILERS côté serveur : le contenu hors de ma
  // lecture N'EST PAS ENVOYÉ (compte tenu dans `masques`). La
  // fenêtre d'édition est calculée ICI (horloge serveur, la même
  // que celle de l'API qui l'applique).
  type MessageVisible = {
    id: number;
    auteur: string;
    auteurId: string;
    mien: boolean;
    contenu: string;
    plafond: number;
    le: string;
    modifieLe: string | null;
    epingle: boolean;
    reponseA: number | null;
    editionPossible: boolean;
    signale: boolean;
  };
  const visibles: MessageVisible[] = [];
  let masques = 0;
  for (const m of page) {
    if (!messageVisiblePour(m.chapitre_max, c.maPosition)) {
      masques += 1;
      continue;
    }
    visibles.push({
      id: m.id,
      auteur: m.profiles?.pseudo ?? 'Lecteur',
      auteurId: m.auteur_id,
      mien: m.auteur_id === c.utilisateurId,
      contenu: m.contenu,
      plafond: m.chapitre_max,
      le: m.created_at,
      modifieLe: m.modifie_le,
      epingle: m.epingle,
      reponseA: m.reponse_a,
      editionPossible: editionPossible(m.created_at, m.modifie_le),
      // Le signalement reste une affaire de modération : visible du
      // créateur seulement, jamais renvoyé comme arme entre membres.
      signale: m.signale === true && c.estCreateur,
    });
  }

  // Les épinglés remontent, sans quitter l'ordre chronologique du
  // reste du fil (l'interface les met en avant elle-même).
  visibles.sort((a, b) => {
    if (a.epingle !== b.epingle) return a.epingle ? -1 : 1;
    return b.le.localeCompare(a.le);
  });

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
        createurId: club.createur_id,
        estCreateur: c.estCreateur,
        livreTitre: club.livres?.titre ?? null,
      },
      maPosition: c.maPosition,
      membres: ((membres.data ?? []) as unknown as MembreLigne[]).map((m) => ({
        utilisateurId: m.utilisateur_id,
        pseudo: m.profiles?.pseudo ?? 'Lecteur',
        moi: m.utilisateur_id === c.utilisateurId,
        createur: m.utilisateur_id === club.createur_id,
        position: m.position_lecture,
      })),
      messages: visibles,
      masques,
      plusAnciens,
      curseur: page.length > 0 ? page[page.length - 1].id : null,
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

  // Régénération du code d'invitation (créateur seulement).
  if (corps.action === 'regenerer-code') {
    if (!c.estCreateur) {
      return NextResponse.json(
        { erreur: 'Seul le créateur régénère le code.' },
        { status: 403 }
      );
    }
    for (let essai = 0; essai < 6; essai += 1) {
      const { data, error } = await c.client
        .from('clubs')
        .update({ code_invitation: codeInvitation(), updated_at: new Date().toISOString() })
        .eq('id', c.clubId)
        .select('code_invitation')
        .maybeSingle();
      if (!error && data) {
        return NextResponse.json({
          codeInvitation: (data as { code_invitation: string }).code_invitation,
        });
      }
    }
    return NextResponse.json({ erreur: 'Régénération impossible.' }, { status: 500 });
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

  // Réponse à un message : il doit exister dans CE club ET être
  // visible pour moi (on ne répond pas à ce qu'on ne peut pas lire).
  let reponseA: number | null = null;
  if (corps.reponseA !== undefined && corps.reponseA !== null) {
    const idReponse = Math.floor(Number(corps.reponseA));
    if (Number.isFinite(idReponse) && idReponse > 0) {
      const { data: cible } = await c.client
        .from('clubs_messages')
        .select('id, chapitre_max')
        .eq('id', idReponse)
        .eq('club_id', c.clubId)
        .maybeSingle();
      if (
        cible &&
        messageVisiblePour(
          (cible as { chapitre_max: number }).chapitre_max,
          c.maPosition
        )
      ) {
        reponseA = idReponse;
      }
    }
  }

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
    reponse_a: reponseA,
  });
  if (error) {
    return NextResponse.json({ erreur: 'Publication refusée.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Réglages du club (créateur seulement) : titre, description, livre. */
export async function PATCH(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexte(id);
  if (!c.ok) return c.reponse;
  if (!c.estCreateur) {
    return NextResponse.json(
      { erreur: 'Seul le créateur règle son club.' },
      { status: 403 }
    );
  }
  let corps: Record<string, unknown>;
  try {
    corps = (await requete.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erreur: 'Requête illisible.' }, { status: 400 });
  }

  const maj: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (corps.titre !== undefined) {
    const titre = propreTexte(corps.titre, 120);
    if (!titre) {
      return NextResponse.json({ erreur: 'Le titre ne peut pas être vide.' }, { status: 422 });
    }
    maj.titre = titre;
  }
  if (corps.description !== undefined) {
    maj.description = propreTexte(corps.description, 600) || null;
  }
  if (corps.livreId !== undefined) {
    // null détache le livre ; sinon un UUID de livre DU COMPTE.
    if (corps.livreId === null || corps.livreId === '') {
      maj.livre_id = null;
    } else if (typeof corps.livreId === 'string' && UUID.test(corps.livreId)) {
      const { data: livre } = await c.client
        .from('livres')
        .select('id')
        .eq('id', corps.livreId)
        .maybeSingle();
      if (!livre) {
        return NextResponse.json({ erreur: 'Livre introuvable dans votre bibliothèque.' }, { status: 404 });
      }
      maj.livre_id = corps.livreId;
    } else {
      return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 422 });
    }
  }

  const { error } = await c.client.from('clubs').update(maj).eq('id', c.clubId);
  if (error) {
    return NextResponse.json({ erreur: 'Enregistrement refusé.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexte(id);
  if (!c.ok) return c.reponse;

  // Le créateur supprime le club ENTIER (cascade en base).
  if (requete.nextUrl.searchParams.get('mode') === 'supprimer') {
    if (!c.estCreateur) {
      return NextResponse.json(
        { erreur: 'Seul le créateur supprime le club.' },
        { status: 403 }
      );
    }
    const { error } = await c.client.from('clubs').delete().eq('id', c.clubId);
    if (error) {
      return NextResponse.json({ erreur: 'Suppression refusée.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, supprime: true });
  }

  if (c.estCreateur) {
    return NextResponse.json(
      { erreur: 'Le créateur ne quitte pas son club : il le supprime depuis le salon ou la liste.' },
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

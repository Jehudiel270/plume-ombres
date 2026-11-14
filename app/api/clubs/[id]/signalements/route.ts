// ============================================================
// app/api/clubs/[id]/signalements/route.ts — File de modération du
// club (F11 v4) : signalement avec motif, traitement par le staff.
//
//   GET            → la file (STAFF) : signalements en attente et
//                    traités récents, avec l'extrait du message.
//   POST           → { messageId, motif, detail? } : tout membre
//                    signale un message du club.
//   PATCH          → { id, action: 'conserver' | 'masquer' } :
//                    le STAFF traite — « masquer » rend le message
//                    invisible pour les membres (le staff et
//                    l'auteur le voient toujours, avec sa marque).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { contexteClub, reponseStaff } from '../contexte';
import { MAX_MESSAGE, propreMotif, propreTexte } from '@/lib/clubs';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LigneSignalement = {
  id: string;
  club_id: string;
  message_id: number;
  signalant_id: string;
  motif: string;
  statut: string;
  traite_par: string | null;
  traite_le: string | null;
  created_at: string;
};

export async function GET(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexteClub(id);
  if (!c.ok) return c.reponse;
  if (!c.estStaff) return reponseStaff();

  const { data } = await c.client
    .from('clubs_signalements')
    .select(
      'id, club_id, message_id, signalant_id, motif, statut, traite_par, traite_le, created_at'
    )
    .eq('club_id', c.clubId)
    .order('created_at', { ascending: false })
    .limit(100);
  const lignes = (data ?? []) as unknown as LigneSignalement[];

  // Extrait du message signalé (tronqué) + pseudo de l'auteur :
  // le staff juge avec le contexte, jamais à l'aveugle.
  const idsMessages = Array.from(new Set(lignes.map((l) => l.message_id)));
  const messages = new Map<
    number,
    { contenu: string; auteur: string; masque: boolean }
  >();
  if (idsMessages.length > 0) {
    const { data: msgs } = await c.client
      .from('clubs_messages')
      .select('id, contenu, auteur_id, masque, profiles ( pseudo )')
      .in('id', idsMessages)
      .limit(100);
    for (const m of (msgs ?? []) as unknown as Array<{
      id: number;
      contenu: string;
      auteur_id: string;
      masque: boolean;
      profiles: { pseudo: string | null } | null;
    }>) {
      messages.set(m.id, {
        contenu: m.contenu.slice(0, 280),
        auteur: m.profiles?.pseudo ?? 'Lecteur',
        masque: m.masque,
      });
    }
  }

  const sortie = lignes.map((l) => {
    const m = messages.get(l.message_id);
    return {
      id: l.id,
      messageId: l.message_id,
      motif: l.motif,
      statut: l.statut,
      traiteLe: l.traite_le,
      le: l.created_at,
      extrait: m?.contenu ?? null,
      auteur: m?.auteur ?? null,
      messageMasque: m?.masque ?? false,
    };
  });

  return NextResponse.json({
    enAttente: sortie.filter((s) => s.statut === 'en_attente'),
    traites: sortie.filter((s) => s.statut !== 'en_attente'),
  });
}

export async function POST(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexteClub(id);
  if (!c.ok) return c.reponse;

  const corps = (await requete.json().catch(() => ({}))) as Record<string, unknown>;
  const messageId = Math.round(Number(corps.messageId));
  const motif = propreMotif(corps.motif);
  const detail = propreTexte(corps.detail, 200);
  if (!Number.isFinite(messageId) || messageId <= 0) {
    return NextResponse.json({ erreur: 'Message invalide.' }, { status: 422 });
  }
  if (!motif) {
    return NextResponse.json({ erreur: 'Choisissez un motif.' }, { status: 422 });
  }
  const motifComplet = detail && detail !== motif ? `${motif} — ${detail}` : motif;

  // Le message appartient-il à CE club ? (un signalement croise
  // toujours le plafond : signaler n'ouvre pas le contenu)
  const { data: message } = await c.client
    .from('clubs_messages')
    .select('id')
    .eq('id', messageId)
    .eq('club_id', c.clubId)
    .maybeSingle();
  if (!message) {
    return NextResponse.json({ erreur: 'Message inconnu.' }, { status: 404 });
  }

  // Pas deux signalements du même message par la même personne.
  const { data: deja } = await c.client
    .from('clubs_signalements')
    .select('id')
    .eq('message_id', messageId)
    .eq('signalant_id', c.utilisateurId)
    .maybeSingle();
  if (deja) {
    return NextResponse.json(
      { erreur: 'Vous avez déjà signalé ce message.' },
      { status: 409 }
    );
  }

  const { error } = await c.client.from('clubs_signalements').insert({
    club_id: c.clubId,
    message_id: messageId,
    signalant_id: c.utilisateurId,
    motif: motifComplet.slice(0, 200),
  });
  if (error) {
    return NextResponse.json({ erreur: 'Signalement refusé.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexteClub(id);
  if (!c.ok) return c.reponse;
  if (!c.estStaff) return reponseStaff();

  const corps = (await requete.json().catch(() => ({}))) as Record<string, unknown>;
  const signalementId = typeof corps.id === 'string' ? corps.id : '';
  const action = corps.action;
  if (!UUID.test(signalementId) || (action !== 'conserver' && action !== 'masquer')) {
    return NextResponse.json({ erreur: 'Traitement invalide.' }, { status: 422 });
  }

  const { data: signalement } = await c.client
    .from('clubs_signalements')
    .select('id, message_id, statut')
    .eq('id', signalementId)
    .eq('club_id', c.clubId)
    .maybeSingle();
  if (!signalement) {
    return NextResponse.json({ erreur: 'Signalement inconnu.' }, { status: 404 });
  }

  const masquer = action === 'masquer';
  const { error } = await c.client
    .from('clubs_signalements')
    .update({
      statut: masquer ? 'masque' : 'conserve',
      traite_par: c.utilisateurId,
      traite_le: new Date().toISOString(),
    })
    .eq('id', signalementId);
  if (error) {
    return NextResponse.json({ erreur: 'Traitement refusé.' }, { status: 500 });
  }

  // Le message suit la décision du staff (idempotent).
  const messageId = (signalement as { message_id: number }).message_id;
  await c.client
    .from('clubs_messages')
    .update({ masque: masquer })
    .eq('id', messageId)
    .eq('club_id', c.clubId);

  return NextResponse.json({ ok: true, masque: masquer });
}

// Longueur maximale réutilisée pour la borne du détail de motif.
void MAX_MESSAGE;

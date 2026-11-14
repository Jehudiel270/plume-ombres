// ============================================================
// app/api/clubs/[id]/rencontres/route.ts — Rencontres du club
// (F11 v4) : en ligne (appel vocal) ou salon écrit, avec
// participants.
//
//   GET                    → rencontres à venir et passées + le
//                            compte de participants + « je
//                            participe » pour chacune.
//   POST                   → { titre, prevuLe, mode, chapitres? } :
//                            proposer une rencontre (membre).
//   DELETE ?rencontreId=…  → l'auteur ou le staff retire une
//                            rencontre.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { contexteClub } from '../contexte';
import {
  estModeRencontre,
  MAX_NOTE_CHAPITRES,
  MAX_TITRE_RENCONTRE,
  propreTexte,
} from '@/lib/clubs';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LigneRencontre = {
  id: string;
  club_id: string;
  auteur_id: string;
  titre: string;
  prevu_le: string;
  mode: string;
  note_chapitres: string | null;
  created_at: string;
};

export async function GET(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexteClub(id);
  if (!c.ok) return c.reponse;

  const [rencontres, participants] = await Promise.all([
    c.client
      .from('clubs_rencontres')
      .select(
        'id, club_id, auteur_id, titre, prevu_le, mode, note_chapitres, created_at'
      )
      .eq('club_id', c.clubId)
      .order('prevu_le', { ascending: true })
      .limit(60),
    c.client
      .from('clubs_rencontres_participants')
      .select('rencontre_id, utilisateur_id')
      .limit(3000),
  ]);

  const maintenant = Date.now();
  const liste = (rencontres.data ?? []) as unknown as LigneRencontre[];
  const lignesParticipants = (participants.data ?? []) as unknown as Array<{
    rencontre_id: string;
    utilisateur_id: string;
  }>;

  const sorties = liste.map((r) => {
    const ses = lignesParticipants.filter((p) => p.rencontre_id === r.id);
    return {
      id: r.id,
      titre: r.titre,
      prevuLe: r.prevu_le,
      mode: r.mode,
      chapitres: r.note_chapitres,
      passee: new Date(r.prevu_le).getTime() < maintenant,
      mienne: r.auteur_id === c.utilisateurId,
      participants: ses.length,
      jeParticipe: ses.some((p) => p.utilisateur_id === c.utilisateurId),
    };
  });

  return NextResponse.json({
    aVenir: sorties.filter((r) => !r.passee),
    passees: sorties
      .filter((r) => r.passee)
      .sort((a, b) => b.prevuLe.localeCompare(a.prevuLe)),
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
  const titre = propreTexte(corps.titre, MAX_TITRE_RENCONTRE);
  const mode = corps.mode;
  const prevuLeBrut = typeof corps.prevuLe === 'string' ? corps.prevuLe : '';
  const prevu = new Date(prevuLeBrut);
  if (!titre || !estModeRencontre(mode) || !Number.isFinite(prevu.getTime())) {
    return NextResponse.json(
      { erreur: 'Un titre, une date et un format (en ligne / salon écrit) sont requis.' },
      { status: 422 }
    );
  }
  // Pas de rencontre dans le passé (tolérance d'une minute).
  if (prevu.getTime() < Date.now() - 60_000) {
    return NextResponse.json(
      { erreur: 'Choisissez une date à venir.' },
      { status: 422 }
    );
  }

  const note = propreTexte(corps.chapitres, MAX_NOTE_CHAPITRES);
  const { data: rencontre, error } = await c.client
    .from('clubs_rencontres')
    .insert({
      club_id: c.clubId,
      auteur_id: c.utilisateurId,
      titre,
      prevu_le: prevu.toISOString(),
      mode,
      note_chapitres: note,
    })
    .select('id')
    .single();
  if (error || !rencontre) {
    return NextResponse.json({ erreur: 'Proposition refusée.' }, { status: 500 });
  }
  const rencontreId = (rencontre as { id: string }).id;

  // Le proposateur participe d'office (cohérent avec le cahier).
  await c.client
    .from('clubs_rencontres_participants')
    .insert({ rencontre_id: rencontreId, utilisateur_id: c.utilisateurId });

  return NextResponse.json({ ok: true, rencontreId });
}

export async function DELETE(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexteClub(id);
  if (!c.ok) return c.reponse;

  const rencontreId = requete.nextUrl.searchParams.get('rencontreId') ?? '';
  if (!UUID.test(rencontreId)) {
    return NextResponse.json({ erreur: 'Rencontre invalide.' }, { status: 422 });
  }

  const { data: rencontre } = await c.client
    .from('clubs_rencontres')
    .select('auteur_id')
    .eq('id', rencontreId)
    .eq('club_id', c.clubId)
    .maybeSingle();
  if (!rencontre) {
    return NextResponse.json({ erreur: 'Rencontre inconnue.' }, { status: 404 });
  }
  const mienne = (rencontre as { auteur_id: string }).auteur_id === c.utilisateurId;
  if (!mienne && !c.estStaff) {
    return NextResponse.json(
      { erreur: 'Seul l’auteur de la rencontre ou le staff peut la retirer.' },
      { status: 403 }
    );
  }

  const { error } = await c.client
    .from('clubs_rencontres')
    .delete()
    .eq('id', rencontreId);
  if (error) {
    return NextResponse.json({ erreur: 'Retrait refusé.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

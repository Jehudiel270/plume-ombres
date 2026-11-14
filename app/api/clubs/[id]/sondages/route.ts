// ============================================================
// app/api/clubs/[id]/sondages/route.ts — Sondages du club (F11 v4).
//
//   GET                  → les sondages avec leurs options ; la
//                          RÉPARTITION des votes n'est envoyée que
//                          pour les sondages auxquels J'AI voté (ou
//                          fermés) — avant le vote, seul le total
//                          traverse, jamais l'influence des autres.
//   POST                 → { question, options[], fermeLe? } :
//                          créer un sondage (membre).
//   DELETE ?sondageId=…  → l'auteur ou le staff retire un sondage.
//
// GARDES : session 401, module `clubs`, adhésion (404), bornes
// lib/clubs (question 200, 2 → 4 options).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { contexteClub } from '../contexte';
import {
  dateClotureSondage,
  MAX_OPTIONS_SONDAGE,
  MIN_OPTIONS_SONDAGE,
  MAX_QUESTION_SONDAGE,
  nettoyerOptionsSondage,
  propreTexte,
} from '@/lib/clubs';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LigneSondage = {
  id: string;
  club_id: string;
  auteur_id: string;
  question: string;
  ferme_le: string;
  created_at: string;
};

type LigneOption = {
  id: string;
  sondage_id: string;
  label: string;
  position: number;
};

type LigneVote = {
  sondage_id: string;
  option_id: string;
  utilisateur_id: string;
};

export async function GET(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexteClub(id);
  if (!c.ok) return c.reponse;

  // Les sondages d'abord (les options en dépendent), puis options
  // et votes en parallèle.
  const { data: lignesSondages } = await c.client
    .from('clubs_sondages')
    .select('id, club_id, auteur_id, question, ferme_le, created_at')
    .eq('club_id', c.clubId)
    .order('created_at', { ascending: false })
    .limit(30);

  const listeSondages = (lignesSondages ?? []) as unknown as LigneSondage[];
  const idsSondages = listeSondages.map((s) => s.id);

  const [options, votes] = await Promise.all([
    idsSondages.length > 0
      ? c.client
          .from('clubs_sondages_options')
          .select('id, sondage_id, label, position')
          .in('sondage_id', idsSondages)
          .order('position', { ascending: true })
          .limit(120)
      : Promise.resolve({ data: null as unknown[] | null }),
    c.client
      .from('clubs_sondages_votes')
      .select('sondage_id, option_id, utilisateur_id')
      .limit(5000),
  ]);

  const listeOptions = ((options.data ?? []) as unknown as LigneOption[]).filter((o) =>
    idsSondages.includes(o.sondage_id)
  );
  const listeVotes = ((votes.data ?? []) as unknown as LigneVote[]).filter((v) =>
    idsSondages.includes(v.sondage_id)
  );

  const maintenant = Date.now();
  const sortie = listeSondages.map((s) => {
    const sesOptions = listeOptions
      .filter((o) => o.sondage_id === s.id)
      .map((o) => ({ id: o.id, label: o.label, position: o.position }));
    const votesSondage = listeVotes.filter((v) => v.sondage_id === s.id);
    const monVote = votesSondage.find((v) => v.utilisateur_id === c.utilisateurId) ?? null;
    const ouvert = new Date(s.ferme_le).getTime() > maintenant;
    // Répartition seulement APRÈS mon vote (ou sondage clos) :
    // les résultats s'affichent après avoir voté — règle du cahier.
    const repartition: Record<string, number> = {};
    if ((monVote || !ouvert) && sesOptions.length > 0) {
      for (const o of sesOptions) repartition[o.id] = 0;
      for (const v of votesSondage) {
        repartition[v.option_id] = (repartition[v.option_id] ?? 0) + 1;
      }
    }
    return {
      id: s.id,
      question: s.question,
      fermeLe: s.ferme_le,
      ouvert,
      mien: s.auteur_id === c.utilisateurId,
      parMoi: monVote !== null,
      monOption: monVote?.option_id ?? null,
      total: votesSondage.length,
      options: sesOptions,
      repartition,
    };
  });

  return NextResponse.json({ sondages: sortie });
}

export async function POST(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexteClub(id);
  if (!c.ok) return c.reponse;

  const corps = (await requete.json().catch(() => ({}))) as Record<string, unknown>;
  const question = propreTexte(corps.question, MAX_QUESTION_SONDAGE);
  const options = nettoyerOptionsSondage(corps.options);
  if (!question || options.length < MIN_OPTIONS_SONDAGE) {
    return NextResponse.json(
      {
        erreur: `Une question et au moins ${MIN_OPTIONS_SONDAGE} options sont requises (jusqu’à ${MAX_OPTIONS_SONDAGE}).`,
      },
      { status: 422 }
    );
  }

  const fermeLe = dateClotureSondage(Number(corps.fermeDansJours) || 7);
  const { data: sondage, error } = await c.client
    .from('clubs_sondages')
    .insert({
      club_id: c.clubId,
      auteur_id: c.utilisateurId,
      question,
      ferme_le: fermeLe,
    })
    .select('id')
    .single();
  if (error || !sondage) {
    return NextResponse.json({ erreur: 'Création refusée.' }, { status: 500 });
  }
  const sondageId = (sondage as { id: string }).id;

  const { error: errOptions } = await c.client
    .from('clubs_sondages_options')
    .insert(
      options.map((label, i) => ({
        sondage_id: sondageId,
        label,
        position: i + 1,
      }))
    );
  if (errOptions) {
    // Le sondage sans ses options serait une coquille vide : on
    // retire et on le dit.
    await c.client.from('clubs_sondages').delete().eq('id', sondageId);
    return NextResponse.json({ erreur: 'Création refusée.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sondageId });
}

export async function DELETE(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexteClub(id);
  if (!c.ok) return c.reponse;

  const sondageId = requete.nextUrl.searchParams.get('sondageId') ?? '';
  if (!UUID.test(sondageId)) {
    return NextResponse.json({ erreur: 'Sondage invalide.' }, { status: 422 });
  }

  const { data: sondage } = await c.client
    .from('clubs_sondages')
    .select('auteur_id')
    .eq('id', sondageId)
    .eq('club_id', c.clubId)
    .maybeSingle();
  if (!sondage) {
    return NextResponse.json({ erreur: 'Sondage inconnu.' }, { status: 404 });
  }
  const mien = (sondage as { auteur_id: string }).auteur_id === c.utilisateurId;
  if (!mien && !c.estStaff) {
    return NextResponse.json(
      { erreur: 'Seul l’auteur du sondage ou le staff peut le retirer.' },
      { status: 403 }
    );
  }

  const { error } = await c.client
    .from('clubs_sondages')
    .delete()
    .eq('id', sondageId);
  if (error) {
    return NextResponse.json({ erreur: 'Retrait refusé.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

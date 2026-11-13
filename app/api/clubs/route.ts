// ============================================================
// app/api/clubs/route.ts — Clubs de lecture PRIVÉS (F11).
//
//   GET    → mes clubs (créés ou rejoints)
//   POST   → { action: 'creer', titre, description?, livreId? }
//            { action: 'rejoindre', code }
//
// GARDES : session 401, interrupteur `clubs` (fermé → 404, plan
// insuffisant → 403). Les clubs restent PRIVÉS : rejoint par code,
// aucune page publique, aucun texte de chapitre partagé. Le créateur
// devient membre (position de lecture 0).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  codeInvitation,
  estCodeValide,
  MAX_CLUBS_PAR_COMPTE,
  propreTexte,
} from '@/lib/clubs';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function contexte(): Promise<
  | { ok: true; client: Awaited<ReturnType<typeof creerClientServeur>>; utilisateurId: string }
  | { ok: false; reponse: NextResponse }
> {
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
  return { ok: true, client, utilisateurId: utilisateur.id };
}

export async function GET(): Promise<NextResponse> {
  const c = await contexte();
  if (!c.ok) return c.reponse;
  const { data, error } = await c.client
    .from('clubs_membres')
    .select(
      'position_lecture, clubs ( id, titre, description, code_invitation, createur_id, livre_id, livres ( titre ) )'
    )
    .eq('utilisateur_id', c.utilisateurId)
    .limit(50);
  if (error) {
    return NextResponse.json({ erreur: 'Lecture impossible.' }, { status: 500 });
  }
  type Ligne = {
    position_lecture: number;
    clubs: {
      id: string;
      titre: string;
      description: string | null;
      code_invitation: string;
      createur_id: string;
      livre_id: string | null;
      livres: { titre: string } | null;
    } | null;
  };
  const clubs = ((data ?? []) as unknown as Ligne[])
    .map((l: Ligne) =>
      l.clubs
        ? {
            id: l.clubs.id,
            titre: l.clubs.titre,
            description: l.clubs.description,
            codeInvitation: l.clubs.code_invitation,
            estCreateur: l.clubs.createur_id === c.utilisateurId,
            livreTitre: l.clubs.livres?.titre ?? null,
            positionLecture: l.position_lecture,
          }
        : null
    )
    .filter(Boolean);
  return NextResponse.json({ clubs }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(requete: NextRequest): Promise<NextResponse> {
  const c = await contexte();
  if (!c.ok) return c.reponse;
  let corps: Record<string, unknown>;
  try {
    corps = (await requete.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erreur: 'Requête illisible.' }, { status: 400 });
  }
  const action = typeof corps.action === 'string' ? corps.action : '';

  if (action === 'creer') {
    const titre = propreTexte(corps.titre, 120);
    if (!titre) {
      return NextResponse.json({ erreur: 'Le club a besoin d’un titre.' }, { status: 422 });
    }
    const { count } = await c.client
      .from('clubs_membres')
      .select('id', { count: 'exact', head: true })
      .eq('utilisateur_id', c.utilisateurId);
    if ((count ?? 0) >= MAX_CLUBS_PAR_COMPTE) {
      return NextResponse.json(
        { erreur: `Vous participez déjà à ${MAX_CLUBS_PAR_COMPTE} clubs.` },
        { status: 422 }
      );
    }
    const livreId =
      typeof corps.livreId === 'string' && UUID.test(corps.livreId)
        ? corps.livreId
        : null;

    // Code d'invitation régénéré jusqu'à unicité (contrainte UNIQUE).
    for (let essai = 0; essai < 6; essai += 1) {
      const code = codeInvitation();
      const { data, error } = await c.client
        .from('clubs')
        .insert({
          createur_id: c.utilisateurId,
          titre,
          description: propreTexte(corps.description, 600) || null,
          livre_id: livreId,
          code_invitation: code,
        })
        .select('id')
        .maybeSingle();
      if (!error && data) {
        const clubId = (data as { id: string }).id;
        await c.client.from('clubs_membres').insert({
          club_id: clubId,
          utilisateur_id: c.utilisateurId,
          position_lecture: 0,
        });
        return NextResponse.json({ id: clubId }, { status: 201 });
      }
    }
    return NextResponse.json({ erreur: 'Création refusée, réessayez.' }, { status: 500 });
  }

  if (action === 'rejoindre') {
    const code = typeof corps.code === 'string' ? corps.code.trim().toUpperCase() : '';
    if (!estCodeValide(code)) {
      return NextResponse.json({ erreur: 'Code d’invitation invalide.' }, { status: 422 });
    }
    const { data: club } = await c.client
      .from('clubs')
      .select('id')
      .eq('code_invitation', code)
      .maybeSingle();
    if (!club) {
      return NextResponse.json({ erreur: 'Aucun club avec ce code.' }, { status: 404 });
    }
    const clubId = (club as { id: string }).id;
    const { error } = await c.client
      .from('clubs_membres')
      .insert({ club_id: clubId, utilisateur_id: c.utilisateurId, position_lecture: 0 });
    if (error) {
      return NextResponse.json({ erreur: 'Vous êtes déjà membre de ce club.' }, { status: 409 });
    }
    return NextResponse.json({ id: clubId }, { status: 201 });
  }

  return NextResponse.json({ erreur: 'Action inconnue.' }, { status: 422 });
}

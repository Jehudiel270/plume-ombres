// ============================================================
// app/api/defis/route.ts — Défis de lecture personnels (F14).
//
//   GET                → liste des défis (progression calculée côté page)
//   POST               → créer { titre, genre, cible, livreId?, echeance? }
//   PATCH              → modifier { id, titre?, cible?, echeance? }
//   DELETE ?id=<uuid>  → supprimer
//
// GARDES : session 401, interrupteur `defis` (fermé → 404, plan
// insuffisant → 403), RLS « own ». La progression n'est JAMAIS
// saisie : elle sort des compteurs réels du compte (lib/defis).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  borneCible,
  CIBLE_MAX,
  dateSeule,
  estGenreDefi,
  MAX_DEFIS,
  propreTitre,
} from '@/lib/defis';

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
  const moduleVerdict = await verifierModuleApi('defis', {
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
    .from('defis')
    .select('id, titre, genre, cible, livre_id, echeance, termine_le, created_at')
    .order('created_at', { ascending: false })
    .limit(MAX_DEFIS);
  if (error) {
    return NextResponse.json({ erreur: 'Lecture impossible.' }, { status: 500 });
  }
  const defis = (data ?? []).map((d) => {
    const ligne = d as Record<string, unknown>;
    return {
      id: String(ligne.id),
      titre: String(ligne.titre),
      genre: estGenreDefi(ligne.genre) ? ligne.genre : 'chapitres',
      cible: Number(ligne.cible) || 1,
      livreId: typeof ligne.livre_id === 'string' ? ligne.livre_id : null,
      echeance: typeof ligne.echeance === 'string' ? ligne.echeance : null,
      termineLe: typeof ligne.termine_le === 'string' ? ligne.termine_le : null,
      creeLe: String(ligne.created_at ?? ''),
    };
  });
  return NextResponse.json({ defis }, { headers: { 'Cache-Control': 'no-store' } });
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

  const titre = propreTitre(corps.titre, 120);
  if (!titre) {
    return NextResponse.json({ erreur: 'Le défi a besoin d’un titre.' }, { status: 422 });
  }
  if (!estGenreDefi(corps.genre)) {
    return NextResponse.json({ erreur: 'Type de défi inconnu.' }, { status: 422 });
  }
  const cible = borneCible(corps.cible);
  if (!cible) {
    return NextResponse.json(
      { erreur: `La cible doit être entre 1 et ${CIBLE_MAX}.` },
      { status: 422 }
    );
  }
  const echeance = dateSeule(corps.echeance);
  const livreId =
    typeof corps.livreId === 'string' && UUID.test(corps.livreId)
      ? corps.livreId
      : null;

  // Plafond de défis conservés (borne lib/defis, revérifiée ici).
  const { count } = await c.client
    .from('defis')
    .select('id', { count: 'exact', head: true })
    .eq('utilisateur_id', c.utilisateurId);
  if ((count ?? 0) >= MAX_DEFIS) {
    return NextResponse.json(
      { erreur: `Au plus ${MAX_DEFIS} défis conservés.` },
      { status: 422 }
    );
  }

  const { error } = await c.client.from('defis').insert({
    utilisateur_id: c.utilisateurId,
    titre,
    genre: corps.genre,
    cible,
    livre_id: livreId,
    echeance,
  });
  if (error) {
    return NextResponse.json({ erreur: 'Enregistrement refusé.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(requete: NextRequest): Promise<NextResponse> {
  const c = await contexte();
  if (!c.ok) return c.reponse;
  let corps: Record<string, unknown>;
  try {
    corps = (await requete.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erreur: 'Requête illisible.' }, { status: 400 });
  }
  const id = typeof corps.id === 'string' && UUID.test(corps.id) ? corps.id : null;
  if (!id) {
    return NextResponse.json({ erreur: 'Défi inconnu.' }, { status: 422 });
  }

  const modifications: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (corps.titre !== undefined) {
    const titre = propreTitre(corps.titre, 120);
    if (!titre) {
      return NextResponse.json({ erreur: 'Titre vide.' }, { status: 422 });
    }
    modifications.titre = titre;
  }
  if (corps.cible !== undefined) {
    const cible = borneCible(corps.cible);
    if (!cible) {
      return NextResponse.json({ erreur: 'Cible invalide.' }, { status: 422 });
    }
    modifications.cible = cible;
  }
  if (corps.echeance !== undefined) {
    modifications.echeance = dateSeule(corps.echeance);
  }

  const { error } = await c.client
    .from('defis')
    .update(modifications)
    .eq('id', id)
    .eq('utilisateur_id', c.utilisateurId);
  if (error) {
    return NextResponse.json({ erreur: 'Modification refusée.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(requete: NextRequest): Promise<NextResponse> {
  const c = await contexte();
  if (!c.ok) return c.reponse;
  const id = requete.nextUrl.searchParams.get('id') ?? '';
  if (!UUID.test(id)) {
    return NextResponse.json({ erreur: 'Défi inconnu.' }, { status: 422 });
  }
  const { error } = await c.client
    .from('defis')
    .delete()
    .eq('id', id)
    .eq('utilisateur_id', c.utilisateurId);
  if (error) {
    return NextResponse.json({ erreur: 'Suppression refusée.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

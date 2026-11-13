// ============================================================
// app/api/progression/route.ts — XP, rangs et badges (A17).
//
//   POST { livreId, chapitreId } → XP de DÉCOUVERTE du chapitre
//          (unique en base : relire ne rapporte rien deux fois,
//          non punitif par construction) + résumé XP/rang/badges ;
//   GET  → résumé (XP, rang, jauge, badges obtenus).
//
// GARDES : session 401, interrupteur `progression` (404/403), RLS
// « own » (on ne lit et n'écrit que SON compte).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { niveauPlanDepuisCode } from '@/lib/fonctionnalites/registre';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  XP_PAR_CHAPITRE,
  progressionRang,
  rangDepuisXp,
} from '@/lib/xp';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function contexte(): Promise<
  | {
      ok: true;
      client: Awaited<ReturnType<typeof creerClientServeur>>;
      utilisateurId: string;
      abonne: boolean;
    }
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
  const codePlan = planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT;
  const module = await verifierModuleApi('progression', {
    utilisateurId: utilisateur.id,
    codePlan,
  });
  if (!module.ouvert && module.reponseApi) {
    return { ok: false, reponse: module.reponseApi };
  }
  const abonne = niveauPlanDepuisCode(codePlan) !== 'gratuit';
  return { ok: true, client, utilisateurId: utilisateur.id, abonne };
}

/** Compteurs du compte (chapitres découverts, carnet, théories, graphes). */
async function compteursDuCompte(
  client: Awaited<ReturnType<typeof creerClientServeur>>,
  utilisateurId: string
): Promise<{
  chapitres: number;
  carnet: number;
  theories: number;
  personnages: number;
  livresTraduits: number;
}> {
  const [xp, carnet, theories, personnages, traduits] = await Promise.all([
    client.from('lectures_xp').select('chapitre_id', { count: 'exact', head: true }).eq('utilisateur_id', utilisateurId),
    client.from('carnet_notes').select('id', { count: 'exact', head: true }),
    client.from('theories').select('id', { count: 'exact', head: true }),
    client.from('graphe_personnages').select('id', { count: 'exact', head: true }),
    client.from('livres').select('id', { count: 'exact', head: true }).eq('statut', 'traduit'),
  ]);
  return {
    chapitres: xp.count ?? 0,
    carnet: carnet.count ?? 0,
    theories: theories.count ?? 0,
    personnages: personnages.count ?? 0,
    livresTraduits: traduits.count ?? 0,
  };
}

async function resume(client: Awaited<ReturnType<typeof creerClientServeur>>, utilisateurId: string, abonne: boolean) {
  const [xpLues, compteurs] = await Promise.all([
    client
      .from('lectures_xp')
      .select('xp')
      .eq('utilisateur_id', utilisateurId)
      .limit(5000),
    compteursDuCompte(client, utilisateurId),
  ]);
  // Somme côté application (borné : une ligne par chapitre découvert,
  // UNIQUE en base — 5 000 chapitres est déjà un cycle de lecture immense).
  const xp = (xpLues.data ?? []).reduce(
    (somme, l) => somme + ((l as { xp: number }).xp || 0),
    0
  );
  const rang = rangDepuisXp(xp);
  const { badgesPour, BADGES } = await import('@/lib/xp');
  const codes = badgesPour({ ...compteurs, abonne });
  return {
    xp,
    chapitres: compteurs.chapitres,
    rang,
    jauge: progressionRang(xp),
    badges: BADGES.filter((b) => codes.includes(b.code)).map((b) => ({
      code: b.code,
      nom: b.nom,
      description: b.description,
    })),
    compteurs,
  };
}

export async function GET(): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;
  try {
    return NextResponse.json({ ok: true, ...(await resume(ctx.client, ctx.utilisateurId, ctx.abonne)) });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Progression indisponible.' },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;

  let corps: { livreId?: unknown; chapitreId?: unknown };
  try {
    corps = (await request.json()) as typeof corps;
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }
  const livreId = typeof corps.livreId === 'string' && UUID.test(corps.livreId) ? corps.livreId : '';
  const chapitreId = typeof corps.chapitreId === 'string' && UUID.test(corps.chapitreId) ? corps.chapitreId : '';
  if (!livreId || !chapitreId) {
    return NextResponse.json({ erreur: 'Livre ou chapitre invalide.' }, { status: 400 });
  }

  try {
    // Insert … on conflict do nothing : relire un chapitre ne
    // rapporte RIEN de plus (non punitif, anti-farming par design).
    const { error } = await ctx.client
      .from('lectures_xp')
      .upsert(
        { utilisateur_id: ctx.utilisateurId, livre_id: livreId, chapitre_id: chapitreId, xp: XP_PAR_CHAPITRE },
        { onConflict: 'utilisateur_id,chapitre_id', ignoreDuplicates: true }
      );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, ...(await resume(ctx.client, ctx.utilisateurId, ctx.abonne)) });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Progression indisponible.' },
      { status: 400 }
    );
  }
}

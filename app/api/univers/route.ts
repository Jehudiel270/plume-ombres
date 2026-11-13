// ============================================================
// app/api/univers/route.ts — Univers multi-tomes (F17, Illimité).
//
//   POST { action: 'creer', titre, description? }
//   POST { action: 'renommer', id, titre?, description? }
//   POST { action: 'ajouter', id, livreId, position? }
//   POST { action: 'retirer', id, livreId }
//   POST { action: 'supprimer', id }
//   DELETE ?id=<uuid>
//
// GARDES : session 401, interrupteur `univers` (fermé → 404, plan
// < Illimité → 403), RLS « own », livres du compte seulement.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';

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
  const module = await verifierModuleApi('univers', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!module.ouvert && module.reponseApi) {
    return { ok: false, reponse: module.reponseApi };
  }
  return { ok: true, client, utilisateurId: utilisateur.id };
}

async function universDuCompte(
  client: Awaited<ReturnType<typeof creerClientServeur>>,
  id: string,
  utilisateurId: string
): Promise<boolean> {
  const { data } = await client
    .from('univers')
    .select('id')
    .eq('id', id)
    .eq('proprietaire_id', utilisateurId)
    .maybeSingle();
  return Boolean(data);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;

  let corps: Record<string, unknown>;
  try {
    corps = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }
  const action = String(corps.action ?? '');

  try {
    if (action === 'creer') {
      const titre = String(corps.titre ?? '').trim().slice(0, 160);
      if (titre.length < 1) {
        return NextResponse.json({ erreur: 'Donnez un titre.' }, { status: 400 });
      }
      const description =
        typeof corps.description === 'string' ? corps.description.trim().slice(0, 2000) : null;
      const { data, error } = await ctx.client
        .from('univers')
        .insert({ proprietaire_id: ctx.utilisateurId, titre, description })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: (data as { id: string }).id });
    }

    const id = typeof corps.id === 'string' && UUID.test(corps.id) ? corps.id : '';
    if (!id || !(await universDuCompte(ctx.client, id, ctx.utilisateurId))) {
      return NextResponse.json({ erreur: 'Univers introuvable.' }, { status: 404 });
    }

    if (action === 'renommer') {
      const champs: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof corps.titre === 'string' && corps.titre.trim()) {
        champs.titre = corps.titre.trim().slice(0, 160);
      }
      if (typeof corps.description === 'string') {
        champs.description = corps.description.trim().slice(0, 2000) || null;
      }
      const { error } = await ctx.client.from('univers').update(champs).eq('id', id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === 'ajouter') {
      const livreId = typeof corps.livreId === 'string' && UUID.test(corps.livreId) ? corps.livreId : '';
      if (!livreId) {
        return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 400 });
      }
      // Le livre doit appartenir au compte (RLS « own »).
      const { data: livre } = await ctx.client
        .from('livres')
        .select('id')
        .eq('id', livreId)
        .maybeSingle();
      if (!livre) {
        return NextResponse.json({ erreur: 'Livre introuvable.' }, { status: 404 });
      }
      const position = Number.isInteger(corps.position) ? Number(corps.position) : 0;
      const { error } = await ctx.client.from('univers_livres').upsert(
        {
          univers_id: id,
          livre_id: livreId,
          ...(position >= 1 && position <= 100 ? { position } : {}),
        },
        { onConflict: 'univers_id,livre_id' }
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === 'retirer') {
      const livreId = typeof corps.livreId === 'string' && UUID.test(corps.livreId) ? corps.livreId : '';
      if (!livreId) {
        return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 400 });
      }
      const { error } = await ctx.client
        .from('univers_livres')
        .delete()
        .eq('univers_id', id)
        .eq('livre_id', livreId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === 'supprimer') {
      const { error } = await ctx.client.from('univers').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ erreur: 'Action inconnue.' }, { status: 400 });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Opération impossible.' },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!UUID.test(id) || !(await universDuCompte(ctx.client, id, ctx.utilisateurId))) {
    return NextResponse.json({ erreur: 'Univers introuvable.' }, { status: 404 });
  }
  const { error } = await ctx.client.from('univers').delete().eq('id', id);
  if (error) {
    return NextResponse.json(
      { erreur: error instanceof Error ? error.message : 'Suppression impossible.' },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}

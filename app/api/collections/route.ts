// ============================================================
// app/api/collections/route.ts — Collections personnelles (A14/F22).
//
//   GET    → collections du compte, avec leurs livres (RLS « own »)
//   POST   → actions { creer | renommer | ajouter | retirer | supprimer }
//
// GARDES : session 401, interrupteur `collections` (fermé → 404,
// plan insuffisant → 403, à risque : confirmation juriste exigée
// par le registre). Rien n'est exposé à des tiers : les collections
// sont des listes PRIVÉES du lecteur sur SES livres.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_COLLECTIONS = 50;
const MAX_LIVRES_PAR_COLLECTION = 100;

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
  const moduleVerdict = await verifierModuleApi('collections', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert && moduleVerdict.reponseApi) {
    return { ok: false, reponse: moduleVerdict.reponseApi };
  }
  return { ok: true, client, utilisateurId: utilisateur.id };
}

const propre = (brut: unknown, maximum: number): string =>
  typeof brut === 'string' ? brut.trim().replace(/\s+/g, ' ').slice(0, maximum) : '';

export async function GET(): Promise<NextResponse> {
  const c = await contexte();
  if (!c.ok) return c.reponse;
  const [collections, lignes] = await Promise.all([
    c.client
      .from('collections')
      .select('id, titre, description, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_COLLECTIONS),
    c.client
      .from('collections_livres')
      .select('collection_id, position, livres ( id, titre, auteur, statut )')
      .order('position', { ascending: true })
      .limit(1000),
  ]);
  if (collections.error || lignes.error) {
    return NextResponse.json({ erreur: 'Lecture impossible.' }, { status: 500 });
  }
  type LigneLivre = {
    collection_id: string;
    livres: { id: string; titre: string; auteur: string | null; statut: string } | null;
  };
  const parCollection = new Map<string, Array<{ id: string; titre: string; auteur: string | null; statut: string }>>();
  for (const l of (lignes.data ?? []) as unknown as LigneLivre[]) {
    if (!l.livres) continue;
    const liste = parCollection.get(l.collection_id) ?? [];
    liste.push(l.livres);
    parCollection.set(l.collection_id, liste);
  }
  const resultat = (collections.data ?? []).map((col) => {
    const ligne = col as Record<string, unknown>;
    return {
      id: String(ligne.id),
      titre: String(ligne.titre),
      description: typeof ligne.description === 'string' ? ligne.description : null,
      livres: parCollection.get(String(ligne.id)) ?? [],
    };
  });
  return NextResponse.json(
    { collections: resultat },
    { headers: { 'Cache-Control': 'no-store' } }
  );
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
    const titre = propre(corps.titre, 120);
    if (!titre) {
      return NextResponse.json({ erreur: 'La collection a besoin d’un titre.' }, { status: 422 });
    }
    const { count } = await c.client
      .from('collections')
      .select('id', { count: 'exact', head: true })
      .eq('proprietaire_id', c.utilisateurId);
    if ((count ?? 0) >= MAX_COLLECTIONS) {
      return NextResponse.json(
        { erreur: `Au plus ${MAX_COLLECTIONS} collections.` },
        { status: 422 }
      );
    }
    const description = propre(corps.description, 600) || null;
    const { error } = await c.client.from('collections').insert({
      proprietaire_id: c.utilisateurId,
      titre,
      description,
    });
    if (error) {
      return NextResponse.json({ erreur: 'Enregistrement refusé.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const id = typeof corps.id === 'string' && UUID.test(corps.id) ? corps.id : null;
  if (!id) {
    return NextResponse.json({ erreur: 'Collection inconnue.' }, { status: 422 });
  }

  if (action === 'renommer') {
    const titre = propre(corps.titre, 120);
    if (!titre) {
      return NextResponse.json({ erreur: 'Titre vide.' }, { status: 422 });
    }
    const { error } = await c.client
      .from('collections')
      .update({
        titre,
        description: corps.description !== undefined ? propre(corps.description, 600) || null : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('proprietaire_id', c.utilisateurId);
    if (error) {
      return NextResponse.json({ erreur: 'Modification refusée.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'ajouter') {
    const livreId = typeof corps.livreId === 'string' && UUID.test(corps.livreId) ? corps.livreId : null;
    if (!livreId) {
      return NextResponse.json({ erreur: 'Livre inconnu.' }, { status: 422 });
    }
    // Le livre doit appartenir au compte (RLS le garantirait déjà,
    // on refuse proprement avant).
    const { data: livre } = await c.client
      .from('livres')
      .select('id')
      .eq('id', livreId)
      .eq('proprietaire_id', c.utilisateurId)
      .maybeSingle();
    if (!livre) {
      return NextResponse.json({ erreur: 'Livre inconnu.' }, { status: 422 });
    }
    const { count } = await c.client
      .from('collections_livres')
      .select('id', { count: 'exact', head: true })
      .eq('collection_id', id);
    if ((count ?? 0) >= MAX_LIVRES_PAR_COLLECTION) {
      return NextResponse.json(
        { erreur: `Au plus ${MAX_LIVRES_PAR_COLLECTION} livres par collection.` },
        { status: 422 }
      );
    }
    const { error } = await c.client
      .from('collections_livres')
      .insert({ collection_id: id, livre_id: livreId, position: (count ?? 0) + 1 });
    if (error) {
      // Déjà présent : on le signale sans casser.
      return NextResponse.json({ erreur: 'Ce livre est déjà dans la collection.' }, { status: 409 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  if (action === 'retirer') {
    const livreId = typeof corps.livreId === 'string' && UUID.test(corps.livreId) ? corps.livreId : null;
    if (!livreId) {
      return NextResponse.json({ erreur: 'Livre inconnu.' }, { status: 422 });
    }
    const { error } = await c.client
      .from('collections_livres')
      .delete()
      .eq('collection_id', id)
      .eq('livre_id', livreId);
    if (error) {
      return NextResponse.json({ erreur: 'Retrait refusé.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'supprimer') {
    const { error } = await c.client
      .from('collections')
      .delete()
      .eq('id', id)
      .eq('proprietaire_id', c.utilisateurId);
    if (error) {
      return NextResponse.json({ erreur: 'Suppression refusée.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erreur: 'Action inconnue.' }, { status: 422 });
}

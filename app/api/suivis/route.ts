// ============================================================
// app/api/suivis/route.ts — Suivis des œuvres + agenda des sorties
// (A7/A22, variante atelier).
//
//   GET     → { suivis: [...], agenda: [...], sorties: [...] } :
//             les œuvres suivies de l'atelier, l'agenda des sorties
//             réelles (rencontres à venir des clubs, échéances de
//             défis) et les traductions terminées récentes.
//   POST    → { livreId } : suivre une œuvre (un livre de SON
//             atelier — la RLS refuse un livre d'autrui).
//   DELETE  → ?livreId=… : ne plus suivre.
//
// GARDES : session 401, interrupteur `suivis` (fermé → 404, plan
// insuffisant → 403), bornes (MAX_SUIVIS), UUID validé.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { MAX_SUIVIS, fusionnerAgenda, type OeuvreSuivie } from '@/lib/suivis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LigneSuivi = {
  livre_id: string;
  cree_le: string;
  livres: { titre: string; auteur: string | null; statut: string } | null;
};

type LigneChapitre = { livre_id: string; statut: string };

type LigneRencontre = {
  id: string;
  titre: string;
  prevu_le: string;
  mode: string;
  note_chapitres: string | null;
  clubs: { titre: string } | null;
};

type LigneDefi = {
  id: string;
  titre: string;
  genre: string;
  cible: number;
  echeance: string | null;
};

export async function GET(): Promise<NextResponse> {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }
  const client = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(client)
    .lire(utilisateur.id)
    .catch(() => null);
  const moduleVerdict = await verifierModuleApi('suivis', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert && moduleVerdict.reponseApi) {
    return moduleVerdict.reponseApi;
  }

  const maintenant = new Date();
  const aujourdhui = maintenant.toISOString().slice(0, 10);

  const [suivisLus, mesClubs, defisLus, sortiesLues] = await Promise.all([
    client
      .from('suivis_oeuvres')
      .select('livre_id, cree_le, livres ( titre, auteur, statut )')
      .order('cree_le', { ascending: false })
      .limit(MAX_SUIVIS),
    client.from('clubs_membres').select('club_id').limit(50),
    client
      .from('defis')
      .select('id, titre, genre, cible, echeance')
      .not('echeance', 'is', null)
      .is('termine_le', null)
      .gte('echeance', aujourdhui)
      .order('echeance', { ascending: true })
      .limit(20),
    client
      .from('livres')
      .select('id, titre, updated_at')
      .eq('statut', 'traduit')
      .order('updated_at', { ascending: false })
      .limit(8),
  ]);

  const lignes = (suivisLus.data ?? []) as unknown as LigneSuivi[];
  const livresSuivis = lignes.filter((l) => l.livres);
  const ids = [...new Set(livresSuivis.map((l) => l.livre_id))];

  // Compte de chapitres (total / traduits) des œuvres suivies —
  // UNE requête groupée, pas de N+1.
  const compte = new Map<string, { total: number; traduits: number }>();
  if (ids.length) {
    const { data: chapitres } = await client
      .from('chapitres')
      .select('livre_id, statut')
      .in('livre_id', ids)
      .limit(4000);
    for (const c of (chapitres ?? []) as unknown as LigneChapitre[]) {
      const entree = compte.get(c.livre_id) ?? { total: 0, traduits: 0 };
      entree.total += 1;
      if (c.statut === 'traduit') entree.traduits += 1;
      compte.set(c.livre_id, entree);
    }
  }

  const suivis: OeuvreSuivie[] = livresSuivis.map((l) => {
    const n = compte.get(l.livre_id) ?? { total: 0, traduits: 0 };
    return {
      livreId: l.livre_id,
      titre: l.livres!.titre,
      auteur: l.livres!.auteur,
      statut: l.livres!.statut,
      chapitresTotal: n.total,
      chapitresTraduits: n.traduits,
      suivieDepuis: l.cree_le,
    };
  });

  // Agenda : rencontres à venir des clubs où je suis membre.
  const clubIds = [
    ...new Set(((mesClubs.data ?? []) as { club_id: string }[]).map((m) => m.club_id)),
  ];
  const brutesRencontres = [];
  if (clubIds.length) {
    const { data: rencontres } = await client
      .from('clubs_rencontres')
      .select('id, titre, prevu_le, mode, note_chapitres, clubs ( titre )')
      .in('club_id', clubIds)
      .gte('prevu_le', maintenant.toISOString())
      .order('prevu_le', { ascending: true })
      .limit(30);
    for (const r of (rencontres ?? []) as unknown as LigneRencontre[]) {
      brutesRencontres.push({
        cle: `rencontre-${r.id}`,
        prevuLe: r.prevu_le,
        titre: r.titre,
        clubTitre: r.clubs?.titre ?? 'Club',
        mode: r.mode,
        noteChapitres: r.note_chapitres,
        lien: '/clubs',
      });
    }
  }

  const brutesEcheances = ((defisLus.data ?? []) as unknown as LigneDefi[]).map((d) => ({
    cle: `defi-${d.id}`,
    echeance: `${d.echeance}T23:59:00Z`,
    titre: d.titre,
    detail: `Défi de lecture · cible ${d.cible}`,
    lien: '/defis',
  }));

  return NextResponse.json({
    suivis,
    agenda: fusionnerAgenda(brutesRencontres, brutesEcheances, maintenant),
    sorties: (
      (sortiesLues.data ?? []) as Array<{ id: string; titre: string; updated_at: string }>
    ).map((l) => ({ id: l.id, titre: l.titre, le: l.updated_at })),
  });
}

export async function POST(requete: NextRequest): Promise<NextResponse> {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }
  const client = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(client)
    .lire(utilisateur.id)
    .catch(() => null);
  const moduleVerdict = await verifierModuleApi('suivis', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert && moduleVerdict.reponseApi) {
    return moduleVerdict.reponseApi;
  }

  const corps = (await requete.json().catch(() => ({}))) as Record<string, unknown>;
  const livreId = typeof corps.livreId === 'string' ? corps.livreId : '';
  if (!UUID.test(livreId)) {
    return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 422 });
  }

  // Déjà suivi ? Idempotent, sans pénalité.
  const { data: existante } = await client
    .from('suivis_oeuvres')
    .select('livre_id')
    .eq('livre_id', livreId)
    .maybeSingle();
  if (existante) {
    return NextResponse.json({ ok: true, dejaSuivi: true });
  }

  const { count } = await client
    .from('suivis_oeuvres')
    .select('livre_id', { count: 'exact', head: true });
  if ((count ?? 0) >= MAX_SUIVIS) {
    return NextResponse.json(
      { erreur: `Plafond de ${MAX_SUIVIS} œuvres suivies atteint.` },
      { status: 422 }
    );
  }

  // La RLS refuse d'elle-même un livre qui n'est pas le mien.
  const { error } = await client
    .from('suivis_oeuvres')
    .insert({ utilisateur_id: utilisateur.id, livre_id: livreId });
  if (error) {
    return NextResponse.json(
      { erreur: 'Suivi refusé : ce livre n’est pas dans votre atelier.' },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(requete: NextRequest): Promise<NextResponse> {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }
  const client = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(client)
    .lire(utilisateur.id)
    .catch(() => null);
  const moduleVerdict = await verifierModuleApi('suivis', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert && moduleVerdict.reponseApi) {
    return moduleVerdict.reponseApi;
  }

  const livreId = requete.nextUrl.searchParams.get('livreId') ?? '';
  if (!UUID.test(livreId)) {
    return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 422 });
  }
  const { error } = await client
    .from('suivis_oeuvres')
    .delete()
    .eq('livre_id', livreId)
    .eq('utilisateur_id', utilisateur.id);
  if (error) {
    return NextResponse.json({ erreur: 'Retrait refusé.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

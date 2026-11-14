// ============================================================
// app/api/clubs/[id]/rencontres/participation/route.ts — Bascule
// « Je participe » à une rencontre du club (F11 v4).
//
//   POST → { rencontreId } : participe si absent, retire ma
//          participation si déjà présent (bascule).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { contexteClub } from '../../contexte';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexteClub(id);
  if (!c.ok) return c.reponse;

  const corps = (await requete.json().catch(() => ({}))) as Record<string, unknown>;
  const rencontreId = typeof corps.rencontreId === 'string' ? corps.rencontreId : '';
  if (!UUID.test(rencontreId)) {
    return NextResponse.json({ erreur: 'Rencontre invalide.' }, { status: 422 });
  }

  // La rencontre appartient-elle à CE club ?
  const { data: rencontre } = await c.client
    .from('clubs_rencontres')
    .select('id')
    .eq('id', rencontreId)
    .eq('club_id', c.clubId)
    .maybeSingle();
  if (!rencontre) {
    return NextResponse.json({ erreur: 'Rencontre inconnue.' }, { status: 404 });
  }

  // Déjà participant ?
  const { data: deja } = await c.client
    .from('clubs_rencontres_participants')
    .select('utilisateur_id')
    .eq('rencontre_id', rencontreId)
    .eq('utilisateur_id', c.utilisateurId)
    .maybeSingle();

  if (deja) {
    const { error } = await c.client
      .from('clubs_rencontres_participants')
      .delete()
      .eq('rencontre_id', rencontreId)
      .eq('utilisateur_id', c.utilisateurId);
    if (error) {
      return NextResponse.json({ erreur: 'Retrait refusé.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, participe: false });
  }

  const { error } = await c.client
    .from('clubs_rencontres_participants')
    .insert({ rencontre_id: rencontreId, utilisateur_id: c.utilisateurId });
  if (error) {
    return NextResponse.json({ erreur: 'Participation refusée.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, participe: true });
}

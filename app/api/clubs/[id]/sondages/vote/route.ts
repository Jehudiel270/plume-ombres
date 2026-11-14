// ============================================================
// app/api/clubs/[id]/sondages/vote/route.ts — Voter à un sondage
// (F11 v4). UN vote par membre et par sondage, garanti par la clé
// primaire de clubs_sondages_votes ; l'API refuse aussi les
// sondages clos et les options étrangères au sondage.
//
//   POST → { sondageId, optionId }
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { contexteClub } from '../../contexte';
import { sondageOuvert } from '@/lib/clubs';

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
  const sondageId = typeof corps.sondageId === 'string' ? corps.sondageId : '';
  const optionId = typeof corps.optionId === 'string' ? corps.optionId : '';
  if (!UUID.test(sondageId) || !UUID.test(optionId)) {
    return NextResponse.json({ erreur: 'Vote invalide.' }, { status: 422 });
  }

  // Le sondage appartient à CE club et est-il encore ouvert ?
  const { data: sondage } = await c.client
    .from('clubs_sondages')
    .select('ferme_le')
    .eq('id', sondageId)
    .eq('club_id', c.clubId)
    .maybeSingle();
  if (!sondage) {
    return NextResponse.json({ erreur: 'Sondage inconnu.' }, { status: 404 });
  }
  if (!sondageOuvert((sondage as { ferme_le: string }).ferme_le)) {
    return NextResponse.json(
      { erreur: 'Ce sondage est clos.' },
      { status: 409 }
    );
  }

  // L'option appartient-elle à ce sondage ?
  const { data: option } = await c.client
    .from('clubs_sondages_options')
    .select('id')
    .eq('id', optionId)
    .eq('sondage_id', sondageId)
    .maybeSingle();
  if (!option) {
    return NextResponse.json({ erreur: 'Option inconnue.' }, { status: 404 });
  }

  const { error } = await c.client.from('clubs_sondages_votes').insert({
    sondage_id: sondageId,
    option_id: optionId,
    utilisateur_id: c.utilisateurId,
  });
  if (error) {
    // Violation de clé primaire = déjà voté (le serveur tranche).
    if (error.code === '23505') {
      return NextResponse.json(
        { erreur: 'Vous avez déjà voté à ce sondage.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ erreur: 'Vote refusé.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

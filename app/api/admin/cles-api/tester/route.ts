// ============================================================
// app/api/admin/cles-api/tester/route.ts — Test manuel d'une clé
// du réservoir (onglet « Clés API »).
//
// POST { id } → sonde le fournisseur avec la clé (requête de contrôle
// SANS consommation de quota : liste des modèles, ou information de
// clé) puis met à jour les signaux de santé :
//   * succès → compteurs d'échecs remis à zéro, temps de repos levé ;
//   * échec imputable à la clé (401/403/429, quota…) → compteur
//     incrémenté, temps de repos après 3 échecs de suite ;
//   * autre échec (réseau, fournisseur inconnu) → aucun compteur
//     touché : ce n'est pas la faute de la clé.
//
// SÉCURITÉ : garde `admin.fonctionnalites.gerer` (comme le reste du
// réservoir) + RLS public.est_admin() en seconde barrière. La valeur
// de la clé ne quitte JAMAIS le serveur et n'apparaît dans aucun
// message.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { verifierPermission } from '@/lib/roles-garde';
import { creerClientServeur } from '@/lib/supabase/server';
import {
  echecVautPourCle,
  listerClesApi,
  signalerEchecCle,
  signalerSuccesCle,
} from '@/lib/cles-api';
import { sonderCle } from '@/lib/cles-api-sonde';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const decision = await verifierPermission('admin.fonctionnalites.gerer');
  if (decision.statut !== 200) {
    return NextResponse.json(
      { erreur: decision.statut === 401 ? 'Non connecté.' : 'Réservé aux administrateurs.' },
      { status: decision.statut }
    );
  }

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'Requête illisible.' }, { status: 400 });
  }
  const id =
    typeof (corps as { id?: unknown })?.id === 'string'
      ? (corps as { id: string }).id
      : '';
  if (!id) {
    return NextResponse.json({ erreur: 'Clé non désignée.' }, { status: 400 });
  }

  const supabase = await creerClientServeur();
  const cles = await listerClesApi(supabase);
  const cle = cles.find((c) => c.id === id);
  if (!cle) {
    return NextResponse.json(
      { erreur: 'Clé introuvable (elle a peut-être été retirée).' },
      { status: 404 }
    );
  }
  if (!cle.actif) {
    return NextResponse.json(
      { erreur: 'Cette clé est désactivée : réactivez-la avant de la tester.' },
      { status: 400 }
    );
  }

  const resultat = await sonderCle(cle.fournisseur, cle.valeur);

  // Signaux de santé — mêmes règles que la consommation réelle.
  if (resultat.ok) {
    await signalerSuccesCle(cle.id);
  } else if (resultat.attribuable && echecVautPourCle(resultat.message)) {
    await signalerEchecCle(cle.id, resultat.message);
  }

  // État à jour après signaux (repos levé, compteur, erreur).
  const apres = (await listerClesApi(supabase)).find((c) => c.id === cle.id);
  return NextResponse.json({
    ok: resultat.ok,
    message: resultat.message,
    echecsConsecutifs: apres?.echecsConsecutifs ?? 0,
    suspendueLe: apres?.suspendueLe ?? null,
    derniereErreur: apres?.derniereErreur ?? null,
  });
}

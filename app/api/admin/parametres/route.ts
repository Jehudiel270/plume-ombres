// ============================================================
// app/api/admin/parametres/route.ts — Paramètres système (clé du
// modèle d'aide à la lecture, module 8 — F6/F10).
//
//   GET     → { defini, apercu, majLe } — l'aperçu masque la clé
//             (AIza…x9Qz) : la valeur complète ne quitte JAMAIS le
//             serveur une fois enregistrée.
//   PUT     → { valeur } enregistre (ou remplace) la clé.
//   DELETE  → retire la clé.
//
// GARDE : permission `admin.fonctionnalites.gerer` (vérifiée ici, et
// une seconde fois par la RLS de la table via public.est_admin()).
// Un lecteur simple ne peut NI lire NI écrire (RLS).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { verifierPermission } from '@/lib/roles-garde';
import { creerClientServeur } from '@/lib/supabase/server';
import {
  CLE_PARAMETRE_GEMINI,
  lireParametreMeta,
  masquerCle,
  validerCleCollee,
} from '@/lib/parametres';

export const runtime = 'nodejs';

function garde(decision: { statut: number }): NextResponse | null {
  if (decision.statut !== 200) {
    return NextResponse.json(
      { erreur: decision.statut === 401 ? 'Non connecté.' : 'Réservé aux administrateurs.' },
      { status: decision.statut }
    );
  }
  return null;
}

export async function GET(): Promise<NextResponse> {
  const decision = await verifierPermission('admin.fonctionnalites.gerer');
  const refuse = garde(decision);
  if (refuse) return refuse;

  const supabase = await creerClientServeur();
  const meta = await lireParametreMeta(supabase, CLE_PARAMETRE_GEMINI);
  return NextResponse.json({
    defini: meta !== null,
    apercu: meta ? masquerCle(meta.valeur) : null,
    majLe: meta?.majLe ?? null,
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const decision = await verifierPermission('admin.fonctionnalites.gerer');
  const refuse = garde(decision);
  if (refuse) return refuse;
  if (!decision.utilisateurId) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }

  let corps: { valeur?: unknown };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  const erreur = validerCleCollee(corps.valeur);
  if (erreur) {
    return NextResponse.json({ erreur }, { status: 422 });
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase
    .from('parametres_systeme')
    .upsert(
      {
        cle: CLE_PARAMETRE_GEMINI,
        valeur: (corps.valeur as string).trim(),
        maj_le: new Date().toISOString(),
        maj_par: decision.utilisateurId,
      },
      { onConflict: 'cle' }
    );

  if (error) {
    const reserve =
      error.message.includes('row-level security') ||
      error.message.includes('permission denied');
    return NextResponse.json(
      { erreur: reserve ? 'Réservé aux administrateurs.' : error.message },
      { status: reserve ? 403 : 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  const decision = await verifierPermission('admin.fonctionnalites.gerer');
  const refuse = garde(decision);
  if (refuse) return refuse;

  const supabase = await creerClientServeur();
  const { error } = await supabase
    .from('parametres_systeme')
    .delete()
    .eq('cle', CLE_PARAMETRE_GEMINI);

  if (error) {
    const reserve =
      error.message.includes('row-level security') ||
      error.message.includes('permission denied');
    return NextResponse.json(
      { erreur: reserve ? 'Réservé aux administrateurs.' : error.message },
      { status: reserve ? 403 : 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

// ============================================================
// app/api/admin/sections/route.ts — Délimiter les parties du tableau
// de bord ouvertes à un administrateur (réservé au SUPER-admin).
//
//   POST { utilisateurId, sections: string[] | null }
//     * null → remet l'administrateur au comportement par défaut
//       (toutes les sections d'exploitation) ;
//     * tableau → seules ces sections sont ouvertes.
//
// GARDE À DEUX NIVEAUX, comme /api/admin/roles :
//   1. `verifierPermission('admin.roles.attribuer')` — que seul le
//      super-administrateur possède ;
//   2. la RPC `public.definir_sections_admin` (SECURITY DEFINER)
//      revérifie `est_super_admin()` et n'accepte que des sections
//      connues (contrainte CHECK sur la table).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { verifierPermission } from '@/lib/roles-garde';
import { creerClientServeur } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SECTIONS_CONNUES = [
  'comptes',
  'abonnements',
  'paiements',
  'audience',
  'systeme',
] as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const decision = await verifierPermission('admin.roles.attribuer');
  if (decision.statut !== 200) {
    return NextResponse.json(
      { erreur: decision.statut === 401 ? 'Non connecté.' : 'Réservé au super-administrateur.' },
      { status: decision.statut }
    );
  }

  let corps: { utilisateurId?: unknown; sections?: unknown };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  const utilisateurId = typeof corps.utilisateurId === 'string' ? corps.utilisateurId : '';
  if (!UUID.test(utilisateurId)) {
    return NextResponse.json({ erreur: 'Compte cible invalide.' }, { status: 400 });
  }

  let sections: string[] | null;
  if (corps.sections === null) {
    sections = null;
  } else if (Array.isArray(corps.sections)) {
    const demandees = corps.sections.filter((valeur): valeur is string => typeof valeur === 'string');
    const inconnues = demandees.filter(
      (section) => !(SECTIONS_CONNUES as readonly string[]).includes(section)
    );
    if (inconnues.length > 0) {
      return NextResponse.json(
        { erreur: `Section inconnue : ${inconnues.join(', ')}.` },
        { status: 400 }
      );
    }
    sections = [...new Set(demandees)];
  } else {
    return NextResponse.json(
      { erreur: 'Le champ sections doit être un tableau ou null.' },
      { status: 400 }
    );
  }

  const supabase = await creerClientServeur();

  // La RPC vérifie une seconde fois les droits et la nature de la cible.
  const { data, error } = await supabase.rpc('definir_sections_admin', {
    p_cible: utilisateurId,
    p_sections: sections,
  });

  if (error) {
    const message =
      error.message.includes('cible_non_administrateur')
        ? 'Ce compte n’est pas administrateur : nommez-le administrateur avant de choisir ses sections.'
        : error.message.includes('reserve_au_super_admin')
          ? 'Réservé au super-administrateur.'
          : error.message;
    return NextResponse.json({ erreur: message }, { status: 403 });
  }

  return NextResponse.json({ ok: true, sections: data ?? null });
}

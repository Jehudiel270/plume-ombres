// ============================================================
// app/api/admin/cles-api/route.ts — Réservoir de clés d'API
// (onglet « Clés API » du tableau de bord).
//
//   GET     → liste masquée (apercu AIza…x9Qz) + état de l'ancienne
//             clé unique (parametres_systeme / cle_api_gemini).
//   POST    → ajoute une clé { fournisseur, libelle?, valeur,
//             planMinimal? } — placée en FIN de succession.
//   PATCH   → { id, actif? | direction? | planMinimal? | libelle? }
//             — `direction` ('monter'|'descendre') échange la clé
//             avec sa voisine DANS LE MÊME FOURNISSEUR.
//   DELETE  → ?id=… retire la clé.
//
// SÉCURITÉ : la valeur complète n'est JAMAIS renvoyée au navigateur.
// Garde : permission `admin.fonctionnalites.gerer` (vérifiée ici, et
// une seconde fois par la RLS de la table via public.est_admin()).
// Toute écriture est journalisée côté base (sans la valeur).
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
import {
  estFournisseurConnu,
  listerClesApi,
} from '@/lib/cles-api';

export const runtime = 'nodejs';

type PlanMinimal = 'lecteur' | 'passionne' | 'illimite';

function garde(decision: { statut: number }): NextResponse | null {
  if (decision.statut !== 200) {
    return NextResponse.json(
      { erreur: decision.statut === 401 ? 'Non connecté.' : 'Réservé aux administrateurs.' },
      { status: decision.statut }
    );
  }
  return null;
}

function erreurSupabase(error: { message: string } | null): NextResponse | null {
  if (!error) return null;
  const reserve =
    error.message.includes('row-level security') ||
    error.message.includes('permission denied') ||
    error.message.includes('duplicate key');
  return NextResponse.json(
    {
      erreur: reserve
        ? 'Réservé aux administrateurs, ou clé déjà enregistrée pour ce fournisseur.'
        : error.message,
    },
    { status: reserve ? 403 : 500 }
  );
}

export async function GET(): Promise<NextResponse> {
  const decision = await verifierPermission('admin.fonctionnalites.gerer');
  const refuse = garde(decision);
  if (refuse) return refuse;

  const supabase = await creerClientServeur();
  const [cles, ancienne] = await Promise.all([
    listerClesApi(supabase),
    lireParametreMeta(supabase, CLE_PARAMETRE_GEMINI),
  ]);

  return NextResponse.json({
    cles: cles.map((c) => ({
      id: c.id,
      fournisseur: c.fournisseur,
      libelle: c.libelle,
      apercu: masquerCle(c.valeur),
      planMinimal: c.planMinimal,
      position: c.position,
      actif: c.actif,
      echecsConsecutifs: c.echecsConsecutifs,
      suspendueLe: c.suspendueLe,
      derniereErreur: c.derniereErreur,
      majLe: c.majLe,
    })),
    ancienne: ancienne
      ? { defini: true, apercu: masquerCle(ancienne.valeur), majLe: ancienne.majLe }
      : { defini: false, apercu: null, majLe: null },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const decision = await verifierPermission('admin.fonctionnalites.gerer');
  const refuse = garde(decision);
  if (refuse) return refuse;
  if (!decision.utilisateurId) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }

  let corps: {
    fournisseur?: unknown;
    libelle?: unknown;
    valeur?: unknown;
    planMinimal?: unknown;
  };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  if (!estFournisseurConnu(corps.fournisseur)) {
    return NextResponse.json({ erreur: 'Fournisseur inconnu.' }, { status: 422 });
  }
  const erreurCle = validerCleCollee(corps.valeur);
  if (erreurCle) {
    return NextResponse.json({ erreur: erreurCle }, { status: 422 });
  }
  const planMinimal =
    corps.planMinimal === 'lecteur' ||
    corps.planMinimal === 'passionne' ||
    corps.planMinimal === 'illimite'
      ? (corps.planMinimal as PlanMinimal)
      : null;
  const libelle =
    typeof corps.libelle === 'string' && corps.libelle.trim()
      ? corps.libelle.trim().slice(0, 80)
      : 'Clé';

  const valeur = (corps.valeur as string).trim();
  const supabase = await creerClientServeur();

  // Doublon explicite (le message SQL serait obscur).
  const { data: doublon } = await supabase
    .from('cles_api')
    .select('id')
    .eq('fournisseur', corps.fournisseur)
    .eq('valeur', valeur)
    .limit(1);
  if (Array.isArray(doublon) && doublon.length > 0) {
    return NextResponse.json(
      { erreur: 'Cette clé est déjà enregistrée pour ce fournisseur.' },
      { status: 422 }
    );
  }

  // Fin de succession : position = max + 1 du fournisseur.
  const { data: voisines } = await supabase
    .from('cles_api')
    .select('position')
    .eq('fournisseur', corps.fournisseur);
  const positions = (Array.isArray(voisines) ? voisines : [])
    .map((l) => (l as { position?: unknown }).position)
    .filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
  const position = positions.length > 0 ? Math.max(...positions) + 1 : 0;

  const { error } = await supabase.from('cles_api').insert({
    fournisseur: corps.fournisseur,
    libelle,
    valeur,
    plan_minimal: planMinimal,
    position,
    actif: true,
    maj_par: decision.utilisateurId,
  });
  const echec = erreurSupabase(error);
  if (echec) return echec;

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const decision = await verifierPermission('admin.fonctionnalites.gerer');
  const refuse = garde(decision);
  if (refuse) return refuse;
  if (!decision.utilisateurId) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }

  let corps: {
    id?: unknown;
    actif?: unknown;
    direction?: unknown;
    planMinimal?: unknown;
    libelle?: unknown;
  };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }
  if (typeof corps.id !== 'string') {
    return NextResponse.json({ erreur: 'Clé inconnue.' }, { status: 400 });
  }

  const supabase = await creerClientServeur();

  // Succession : échange des positions avec la voisine du fournisseur.
  if (corps.direction === 'monter' || corps.direction === 'descendre') {
    const lignes = await listerClesApi(supabase);
    const cible = lignes.find((l) => l.id === corps.id);
    if (!cible) {
      return NextResponse.json({ erreur: 'Clé inconnue.' }, { status: 404 });
    }
    const groupe = lignes
      .filter((l) => l.fournisseur === cible.fournisseur)
      .sort((a, b) => a.position - b.position);
    const index = groupe.findIndex((l) => l.id === cible.id);
    const voisin =
      corps.direction === 'monter' ? groupe[index - 1] : groupe[index + 1];
    if (!voisin) {
      return NextResponse.json({ ok: true }); // déjà en bout : rien à faire
    }
    const { error: erreurA } = await supabase
      .from('cles_api')
      .update({ position: voisin.position, maj_le: new Date().toISOString() })
      .eq('id', cible.id);
    const echecA = erreurSupabase(erreurA);
    if (echecA) return echecA;
    const { error: erreurB } = await supabase
      .from('cles_api')
      .update({ position: cible.position, maj_le: new Date().toISOString() })
      .eq('id', voisin.id);
    const echecB = erreurSupabase(erreurB);
    if (echecB) return echecB;
    return NextResponse.json({ ok: true });
  }

  const modifications: Record<string, unknown> = { maj_le: new Date().toISOString() };

  if (typeof corps.actif === 'boolean') modifications.actif = corps.actif;
  if (corps.planMinimal === null || corps.planMinimal === '') {
    modifications.plan_minimal = null;
  } else if (
    corps.planMinimal === 'lecteur' ||
    corps.planMinimal === 'passionne' ||
    corps.planMinimal === 'illimite'
  ) {
    modifications.plan_minimal = corps.planMinimal;
  }
  if (typeof corps.libelle === 'string' && corps.libelle.trim()) {
    modifications.libelle = corps.libelle.trim().slice(0, 80);
  }

  const { error } = await supabase
    .from('cles_api')
    .update(modifications)
    .eq('id', corps.id);
  const echec = erreurSupabase(error);
  if (echec) return echec;

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const decision = await verifierPermission('admin.fonctionnalites.gerer');
  const refuse = garde(decision);
  if (refuse) return refuse;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ erreur: 'Clé inconnue.' }, { status: 400 });
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.from('cles_api').delete().eq('id', id);
  const echec = erreurSupabase(error);
  if (echec) return echec;

  return NextResponse.json({ ok: true });
}

// ============================================================
// app/api/admin/fonctionnalites/route.ts — États des interrupteurs.
//
//   GET    → toutes les définitions du registre, avec leur état
//            effectif (défaut du registre fusionné avec la base).
//   PATCH  → { cle, actif?, planMinimal?, deploiement?, juristeOk? }
//            met à jour l'état d'UN interrupteur.
//
// GARDE : permission `admin.fonctionnalites.gerer` (vérifiée ici, et
// une seconde fois par la RLS de la table via public.est_admin()).
//
// Règles du brief appliquées :
//   * un module à risque juridique ne peut pas être activé sans la
//     confirmation « validé par un juriste » (422 sinon) ;
//   * la confirmation ne peut être posée QUE sur un module à risque ;
//   * désactiver un module retire la confirmation (retour propre).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { verifierPermission } from '@/lib/roles-garde';
import { creerClientServeur } from '@/lib/supabase/server';
import {
  INTERRUPTEURS,
  estNiveauPlan,
  interrupteurParCle,
  type NiveauPlan,
} from '@/lib/fonctionnalites/registre';
import {
  listeAvecEtats,
  viderCacheEtats,
} from '@/lib/fonctionnalites/etats';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const decision = await verifierPermission('admin.fonctionnalites.gerer');
  if (decision.statut !== 200) {
    return NextResponse.json(
      { erreur: decision.statut === 401 ? 'Non connecté.' : 'Réservé aux administrateurs.' },
      { status: decision.statut }
    );
  }
  const liste = await listeAvecEtats();
  return NextResponse.json({
    interrupteurs: liste.map(({ def, etat }) => ({
      cle: def.cle,
      code: def.code,
      libelle: def.libelle,
      groupe: def.groupe,
      description: def.description,
      itineraires: def.itineraires,
      api: def.api,
      risqueJuridique: def.risqueJuridique === true,
      noteJuridique: def.noteJuridique ?? null,
      sansItineraire: def.sansItineraire ?? null,
      etat: {
        actif: etat.actif,
        planMinimal: etat.planMinimal,
        deploiement: etat.deploiement,
        juristeOk: etat.juristeOk === true,
        majLe: etat.majLe ?? null,
        majPar: etat.majPar ?? null,
      },
    })),
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const decision = await verifierPermission('admin.fonctionnalites.gerer');
  if (decision.statut !== 200) {
    return NextResponse.json(
      { erreur: decision.statut === 401 ? 'Non connecté.' : 'Réservé aux administrateurs.' },
      { status: decision.statut }
    );
  }
  if (!decision.utilisateurId) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }

  let corps: {
    cle?: unknown;
    actif?: unknown;
    planMinimal?: unknown;
    deploiement?: unknown;
    juristeOk?: unknown;
  };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  const cle = typeof corps.cle === 'string' ? corps.cle : '';
  const def = interrupteurParCle(cle);
  if (!def) {
    return NextResponse.json(
      { erreur: 'Interrupteur inconnu. Le registre est la source de vérité.' },
      { status: 400 }
    );
  }

  // --- État actuel (pour valider les transitions à risque) ---
  const supabase = await creerClientServeur();
  const { data: ligneActuelle } = await supabase
    .from('fonctionnalites_etats')
    .select('*')
    .eq('cle', cle)
    .maybeSingle();

  const etatActuel = {
    actif: ligneActuelle ? ligneActuelle.actif === true : def.prod,
    planMinimal:
      ligneActuelle && typeof ligneActuelle.plan_minimal === 'string'
        ? (ligneActuelle.plan_minimal as NiveauPlan)
        : def.planMinimal,
    deploiement:
      ligneActuelle && Number.isFinite(Number(ligneActuelle.deploiement))
        ? Math.max(0, Math.min(100, Math.round(Number(ligneActuelle.deploiement))))
        : 100,
    juristeOk: ligneActuelle ? ligneActuelle.juriste_ok === true : false,
  };

  // --- Champs demandés (tous facultatifs) ---
  const patch: Record<string, unknown> = {};

  if (corps.planMinimal !== undefined) {
    if (corps.planMinimal === null) {
      patch.plan_minimal = null;
    } else if (estNiveauPlan(corps.planMinimal)) {
      patch.plan_minimal = corps.planMinimal;
    } else {
      return NextResponse.json(
        { erreur: 'Plan minimal inconnu (gratuit, lecteur, passionne, illimite).' },
        { status: 400 }
      );
    }
  }

  if (corps.deploiement !== undefined) {
    const valeur = Number(corps.deploiement);
    if (!Number.isFinite(valeur) || valeur < 0 || valeur > 100) {
      return NextResponse.json(
        { erreur: 'Le déploiement doit être un pourcentage entre 0 et 100.' },
        { status: 400 }
      );
    }
    patch.deploiement = Math.round(valeur);
  }

  if (corps.juristeOk !== undefined) {
    if (typeof corps.juristeOk !== 'boolean') {
      return NextResponse.json({ erreur: 'juristeOk doit être un booléen.' }, { status: 400 });
    }
    if (corps.juristeOk && !def.risqueJuridique) {
      return NextResponse.json(
        { erreur: 'La confirmation juridique ne concerne que les modules à risque.' },
        { status: 422 }
      );
    }
    patch.juriste_ok = corps.juristeOk;
  }

  if (corps.actif !== undefined) {
    if (typeof corps.actif !== 'boolean') {
      return NextResponse.json({ erreur: 'actif doit être un booléen.' }, { status: 400 });
    }
    const juristeApres =
      corps.juristeOk !== undefined ? (corps.juristeOk as boolean) : etatActuel.juristeOk;
    if (corps.actif && def.risqueJuridique && !juristeApres) {
      return NextResponse.json(
        {
          erreur:
            'Ce module attend la validation écrite d’un juriste avant toute ouverture (loi n° 2005-30).',
        },
        { status: 422 }
      );
    }
    patch.actif = corps.actif;
    if (!corps.actif) {
      // Fermer un module retire la confirmation juridique : réouverture
      // exigera une décision nouvelle, jamais un reliquat oublié.
      patch.juriste_ok = false;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ erreur: 'Aucun champ à mettre à jour.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('fonctionnalites_etats')
    .upsert(
      {
        cle,
        ...patch,
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

  viderCacheEtats();
  return NextResponse.json({ ok: true, cle });
}

/** Nombre d'interrupteurs du registre (diagnostic de déploiement). */
export async function HEAD(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: { 'x-interrupteurs': String(INTERRUPTEURS.length) },
  });
}

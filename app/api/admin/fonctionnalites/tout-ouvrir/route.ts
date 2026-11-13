// ============================================================
// app/api/admin/fonctionnalites/tout-ouvrir/route.ts —
// Ouverture en masse des modules (bouton « tout ouvrir » du
// tableau de bord, onglet chantier).
//
//   POST { avecRisque?: boolean }
//     * avecRisque absent ou faux : ouvre SEULEMENT les modules
//       sans risque juridique ;
//     * avecRisque vrai : inclut les modules à risque ET pose la
//       confirmation « validé par un juriste » — l'interface exige
//       une case de confirmation explicite avant d'envoyer, le
//       serveur ne l'accepte que dans ce cadre ;
//     * chaque ouverture pose actif = vrai et déploiement = 100 %
//       (l'intention du geste est « tout voir »), sans toucher au
//       plan minimal déjà réglé ;
//     * un module déjà ouvert à 100 % n'est pas réécrit (journal
//       propre) ;
//     * la journalisation reste celle du chantier : le déclencheur
//       tracer_fonctionnalites_etats écrit une entrée par ligne
//       modifiée.
//
// GARDE : permission admin.fonctionnalites.gerer (vérifiée ici, et
// une seconde fois par la RLS de la table via public.est_admin()).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { verifierPermission } from '@/lib/roles-garde';
import { creerClientServeur } from '@/lib/supabase/server';
import { INTERRUPTEURS, planifierOuvertureMasse } from '@/lib/fonctionnalites/registre';
import { listeAvecEtats, viderCacheEtats } from '@/lib/fonctionnalites/etats';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  let corps: { avecRisque?: unknown } = {};
  try {
    corps = (await request.json().catch(() => ({}))) as { avecRisque?: unknown };
  } catch {
    corps = {};
  }
  const avecRisque = corps.avecRisque === true;

  // États effectifs (défaut du registre fusionné avec la base) :
  // c'est ce que l'évaluation des pages utilise — le plan s'appuie
  // sur la même source, pas sur l'affichage du panneau.
  const liste = await listeAvecEtats();
  const etatParCle = new Map(
    liste.map(({ def, etat }) => [def.cle, { actif: etat.actif, deploiement: etat.deploiement }])
  );

  const plan = planifierOuvertureMasse(etatParCle, avecRisque);
  if (plan.aOuvrir.length === 0) {
    return NextResponse.json({
      ok: true,
      ouvres: 0,
      inchanges: plan.inchanges.length,
      ignoresRisque: plan.ignoresRisque.length,
    });
  }

  const maintenant = new Date().toISOString();
  const lignes = plan.aOuvrir.map((cle) => {
    const def = INTERRUPTEURS.find((d) => d.cle === cle);
    return {
      cle,
      actif: true,
      deploiement: 100,
      juriste_ok: def?.risqueJuridique === true ? true : undefined,
      maj_le: maintenant,
      maj_par: decision.utilisateurId,
    };
  });

  const supabase = await creerClientServeur();
  const { error } = await supabase
    .from('fonctionnalites_etats')
    .upsert(lignes, { onConflict: 'cle' });

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
  return NextResponse.json({
    ok: true,
    ouvres: plan.aOuvrir.length,
    inchanges: plan.inchanges.length,
    ignoresRisque: plan.ignoresRisque.length,
  });
}

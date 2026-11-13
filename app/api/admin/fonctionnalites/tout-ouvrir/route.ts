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
//     * juriste_ok est un booléen EXPLICITE sur chaque ligne : vrai
//       pour un module à risque (ouvert avec confirmation), faux
//       ailleurs. supabase-js déduit la liste des colonnes de
//       l'UNION des clés du tableau — une clé absente d'une ligne
//       serait insérée à NULL (23502) ;
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
import {
  construireLignesOuvertureMasse,
  planifierOuvertureMasse,
} from '@/lib/fonctionnalites/registre';
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
  const lignes = construireLignesOuvertureMasse(plan.aOuvrir, decision.utilisateurId, maintenant);

  const supabase = await creerClientServeur();
  const { error } = await supabase
    .from('fonctionnalites_etats')
    .upsert(lignes, { onConflict: 'cle' });

  if (error) {
    const reserve =
      error.message.includes('row-level security') ||
      error.message.includes('permission denied');
    // Erreur de contrainte / charge utile incohérente : message
    // lisible au lieu du texte brut de Postgres (le cas ne devrait
    // plus se produire — lignes homogènes — mais on reste prudent).
    const incoherente =
      error.code === '23502' ||
      error.message.includes('All object keys must match') ||
      error.message.includes('null value in column');
    return NextResponse.json(
      {
        erreur: reserve
          ? 'Réservé aux administrateurs.'
          : incoherente
            ? 'Ouverture groupée impossible : états incohérents côté serveur. Réessayez ; si le problème persiste, prévenez l\u2019équipe.'
            : error.message,
      },
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

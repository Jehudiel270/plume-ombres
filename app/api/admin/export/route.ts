// ============================================================
// app/api/admin/export/route.ts — Export CSV du panneau admin.
//
//   GET /api/admin/export?type=comptes|stats|abonnements|anomalies|paiements
//
// GARDE SERVEUR : l'export n'est qu'une autre LECTURE des mêmes
// données. Chaque type vérifie la permission qui le gouverne
// (admin.comptes.lister ou admin.stats.voir) via lib/roles-garde ;
// l'interface ne fait que proposer le lien.
//
// SÉCURITÉ : aucune de ces colonnes ne contient de contenu de livre.
// Les comptes/dates viennent de public.admin_lister_comptes, les
// agrégats de public.admin_stats_abonnements (SECURITY DEFINER) —
// jamais un titre, un texte ou un segment.
//
// Format : CSV en UTF-8 AVEC BOM (Excel), séparateur « ; ».
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { creerClientServeur } from '@/lib/supabase/server';
import { verifierPermission } from '@/lib/roles-garde';
import type { ClientRpc } from '@/lib/rate-limit';
import { type Permission } from '@/lib/roles';
import {
  abonnementActif,
  collecterStatsAbonnements,
  collecterStatsAdmin,
  comptesEnAnomalie,
  detecterAnomalies,
  formaterDateCourte,
  formaterNombre,
  LIBELLES_ANOMALIE,
  listerComptesAdmin,
  listerCourrielsAdmin,
  listerPaiementsAdmin,
  nomPlan,
  normaliserPlans,
  versCsv,
  type ColonneCsv,
} from '@/lib/admin-stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Types d'export reconnus et permission requise pour chacun. */
const TYPES = {
  comptes: 'admin.comptes.lister',
  anomalies: 'admin.comptes.lister',
  stats: 'admin.stats.voir',
  abonnements: 'admin.stats.voir',
  paiements: 'admin.stats.voir',
} satisfies Record<string, Permission>;

type TypeExport = keyof typeof TYPES;

function estTypeExport(valeur: string | null): valeur is TypeExport {
  return valeur !== null && Object.prototype.hasOwnProperty.call(TYPES, valeur);
}

function refus(statut: number) {
  if (statut === 401) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }
  return NextResponse.json(
    { erreur: 'Accès refusé : permission administrateur requise.' },
    { status: 403 }
  );
}

/** Réponse CSV téléchargeable (BOM + nom de fichier daté). */
function reponseCsv(type: TypeExport, contenu: string) {
  const jour = new Date().toISOString().slice(0, 10);
  return new NextResponse(`\uFEFF${contenu}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="plume-admin-${type}-${jour}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Colonnes du tableau des comptes (aucune donnée de contenu). */
const COLONNES_COMPTES: readonly ColonneCsv[] = [
  { cle: 'pseudo', libelle: 'Pseudo' },
  { cle: 'courriel', libelle: 'Courriel' },
  { cle: 'role', libelle: 'Rôle' },
  { cle: 'inscription', libelle: 'Inscription' },
  { cle: 'plan', libelle: 'Plan' },
  { cle: 'statut', libelle: 'Statut abonnement' },
  { cle: 'fin', libelle: 'Fin d’abonnement' },
  { cle: 'actif', libelle: 'Actif' },
  { cle: 'anomalies', libelle: 'Anomalies' },
];

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type');

  if (!estTypeExport(type)) {
    return NextResponse.json(
      {
        erreur:
          'Type d’export inconnu. Attendu : comptes, anomalies, stats, abonnements ou paiements.',
      },
      { status: 400 }
    );
  }

  const decision = await verifierPermission(TYPES[type]);
  if (decision.statut !== 200) return refus(decision.statut);

  const supabase = await creerClientServeur();
  const clientRpc: ClientRpc = { rpc: (nom, args) => supabase.rpc(nom, args) };

  // ------- comptes + anomalies (même source) -------
  if (type === 'comptes' || type === 'anomalies') {
    const [{ data: plansBruts }, resultatComptes, resultatCourriels] = await Promise.all([
      supabase.from('plans_abonnement').select('code, nom'),
      listerComptesAdmin(clientRpc),
      listerCourrielsAdmin(clientRpc),
    ]);
    const plans = normaliserPlans(plansBruts);
    const courriels = resultatCourriels.courriels;
    const parId = new Map(
      resultatComptes.comptes.map((compte) => [
        compte.id,
        { compte, codes: detecterAnomalies(compte, plans) },
      ])
    );
    // `comptes` : tous les comptes ; `anomalies` : seulement ceux qui dévient.
    const selection =
      type === 'comptes'
        ? [...parId.values()]
        : comptesEnAnomalie(resultatComptes.comptes, plans).map((a) => ({
            compte: a.compte,
            codes: a.codes,
          }));

    const lignes = selection.map(({ compte, codes }) => ({
      pseudo: compte.pseudo,
      courriel: courriels[compte.id] ?? '',
      role: compte.role,
      inscription: formaterDateCourte(compte.creeLe),
      plan: nomPlan(compte.abonnementPlan, plans),
      statut: compte.abonnementStatut ?? 'aucun',
      fin: formaterDateCourte(compte.abonnementFin),
      actif: abonnementActif(compte) ? 'oui' : 'non',
      anomalies: codes.map((c) => LIBELLES_ANOMALIE[c]).join(' | '),
    }));

    return reponseCsv(type, versCsv(COLONNES_COMPTES, lignes));
  }

  // ------- paiements -------
  if (type === 'paiements') {
    const limite = Number(request.nextUrl.searchParams.get('limite') ?? '200');
    const { paiements } = await listerPaiementsAdmin(
      clientRpc,
      Number.isFinite(limite) ? limite : 200
    );
    return reponseCsv(
      type,
      versCsv(
        [
          { cle: 'reference', libelle: 'Référence' },
          { cle: 'referenceFournisseur', libelle: 'Réf. fournisseur' },
          { cle: 'pseudo', libelle: 'Compte' },
          { cle: 'plan', libelle: 'Plan' },
          { cle: 'montant', libelle: 'Montant' },
          { cle: 'devise', libelle: 'Devise' },
          { cle: 'statut', libelle: 'Statut' },
          { cle: 'fournisseur', libelle: 'Fournisseur' },
          { cle: 'operateur', libelle: 'Opérateur' },
          { cle: 'creeLe', libelle: 'Créé le' },
        ],
        paiements.map((p) => ({
          reference: p.reference,
          referenceFournisseur: p.referenceFournisseur ?? '',
          pseudo: p.pseudo,
          plan: p.plan ?? '',
          montant: p.montant,
          devise: p.devise,
          statut: p.statut,
          fournisseur: p.fournisseur ?? '',
          operateur: p.operateur ?? '',
          creeLe: formaterDateCourte(p.creeLe),
        }))
      )
    );
  }

  // ------- stats + abonnements (agrégats) -------
  const [resultatStats, resultatAgr] = await Promise.all([
    collecterStatsAdmin(clientRpc),
    collecterStatsAbonnements(clientRpc),
  ]);
  const stats = resultatStats.stats;
  const agr = resultatAgr.stats;

  if (type === 'stats') {
    const lignes: Record<string, unknown>[] = [];
    if (stats) {
      lignes.push(
        { indicateur: 'Comptes', valeur: stats.comptes, detail: '' },
        { indicateur: 'Livres importés', valeur: stats.livres, detail: `${stats.chapitres} chapitres, ${stats.segments} segments` },
        { indicateur: 'Chapitres traduits', valeur: stats.chapitresTraduits, detail: `sur ${stats.chapitres} chapitres` },
        { indicateur: 'Caractères utilisés (total)', valeur: stats.caracteresUtilisesTotal, detail: '' },
        {
          indicateur: `Caractères traduits (${stats.periodeDebut} → ${stats.periodeFin})`,
          valeur: stats.caracteresPeriode,
          detail: '',
        },
        {
          indicateur: 'Abonnements actifs',
          valeur: stats.abonnementsActifs ?? '—',
          detail: '',
        },
        {
          indicateur: 'Paiements réussis',
          valeur: stats.paiementsReussis ?? '—',
          detail: '',
        }
      );
      for (const p of stats.periodes) {
        lignes.push({
          indicateur: `Caractères ${p.periode}`,
          valeur: p.caracteres,
          detail: 'mensuel',
        });
      }
    }
    if (agr) {
      lignes.push(
        { indicateur: 'Crédits vendus (caractères)', valeur: agr.credits.vendusTotal, detail: `${agr.credits.packsVendus} packs` },
        { indicateur: 'Crédits consommés (caractères)', valeur: agr.credits.consommesTotal, detail: '' },
        { indicateur: 'Solde de crédits', valeur: agr.credits.soldeTotal, detail: `${agr.credits.comptesAvecSolde} comptes` },
        { indicateur: 'Montant des crédits vendus (XOF)', valeur: agr.credits.montantVendu, detail: '' },
        { indicateur: 'Paiements — montant réussi (XOF)', valeur: agr.paiements.montantReussi, detail: '' },
      );
    }
    return reponseCsv(
      type,
      versCsv(
        [
          { cle: 'indicateur', libelle: 'Indicateur' },
          { cle: 'valeur', libelle: 'Valeur' },
          { cle: 'detail', libelle: 'Détail' },
        ],
        lignes
      )
    );
  }

  // type === 'abonnements'
  const lignes = (agr?.parPlan ?? []).map((l) => ({
    plan: l.nom,
    code: l.plan,
    actifs: l.actifs,
    expires: l.expires,
    autres: l.autres,
    total: l.total,
  }));
  const entete = `Total;${formaterNombre(agr?.abonnementsTotal ?? 0)}\r\nActifs;${formaterNombre(
    agr?.abonnementsActifs ?? 0
  )}\r\nExpirés non résiliés;${formaterNombre(agr?.abonnementsExpiresNonResilies ?? 0)}\r\n\r\n`;
  return reponseCsv(
    type,
    entete +
      versCsv(
        [
          { cle: 'plan', libelle: 'Plan' },
          { cle: 'code', libelle: 'Code' },
          { cle: 'actifs', libelle: 'Actifs' },
          { cle: 'expires', libelle: 'Expirés' },
          { cle: 'autres', libelle: 'Autres statuts' },
          { cle: 'total', libelle: 'Total' },
        ],
        lignes
      )
  );
}

// ============================================================
// app/admin/page.tsx — Tableau de bord administrateur.
//
// GARDE SERVEUR : la permission `admin.tableau_de_bord.voir` est
// vérifiée ici (source de vérité). Un compte connecté non admin est
// renvoyé vers sa bibliothèque ; un visiteur vers la connexion.
//
// L'admin ne voit ICI que des NOMBRES et des métadonnées de comptes
// (pseudo, courriel, rôle, dates, abonnement) : jamais le contenu d'un
// livre d'autrui (voir supabase/migrations/..._roles_admin.sql). Les
// agrégats abonnements / crédits / paiements passent par les RPC
// SECURITY DEFINER de admin_agregats.sql, qui ne renvoient que des
// comptages et des libellés.
//
// VAGUE W8/W9 : recherche/filtre/tri/pagination des comptes, export
// CSV, vue abonnements & crédits, journal des paiements, journal des
// actions admin et comptes en anomalie.
//
// VAGUE ONGLETS : les blocs ne sont plus empilés à la suite (page
// interminable) mais regroupés en CINQ onglets ARIA. Un seul panneau
// est monté à la fois ; le composant serveur reste le propriétaire des
// données et passe à <OngletsAdmin> le JSX de chaque panneau.
// ============================================================

import type { Metadata } from 'next';
import { creerClientServeur } from '@/lib/supabase/server';
import { exigerPermission } from '@/lib/roles-garde';
import BarreNavigation from '@/components/BarreNavigation';
import OngletsAdmin, { type OngletAdmin } from '@/components/admin/OngletsAdmin';
import TableauComptes from '@/components/admin/TableauComptes';
import GestionRoles from '@/components/admin/GestionRoles';
import OrdreChaine from '@/components/admin/OrdreChaine';
import SanteMoteurs from '@/components/admin/SanteMoteurs';
import RepartitionAbonnements from '@/components/admin/RepartitionAbonnements';
import PaiementsFiltrables from '@/components/admin/PaiementsFiltrables';
import TableauVisites from '@/components/admin/TableauVisites';
import { agregerPaiements } from '@/lib/admin-paiements';
import SectionsAdministrateurs from '@/components/admin/SectionsAdministrateurs';
import AlertesPaiements from '@/components/admin/AlertesPaiements';
import BandeauAujourdhui, { type CarteKpi } from '@/components/admin/BandeauAujourdhui';
import BandeauSante, { type VoyantSante } from '@/components/admin/BandeauSante';
import CommandPalette, { type EntreePalette } from '@/components/admin/CommandPalette';
import BlocRepliable from '@/components/admin/BlocRepliable';
import { normaliserVisites } from '@/lib/visites';
import JournalActions from '@/components/admin/JournalActions';
import AnomaliesComptes from '@/components/admin/AnomaliesComptes';
import ExportsAdmin from '@/components/admin/ExportsAdmin';
import { verifierChaine, type SanteChaine } from '@/lib/providers/sante';
import { listeAvecEtats } from '@/lib/fonctionnalites/etats';
import {
  compterModulesOuverts,
  versInterrupteursAdmin,
} from '@/lib/fonctionnalites/interrupteurs-admin';
import { CLE_PARAMETRE_GEMINI, lireParametreMeta, masquerCle } from '@/lib/parametres';
import PanneauFonctionnalites from '@/components/admin/PanneauFonctionnalites';
import RevenusAbonnements from '@/components/admin/RevenusAbonnements';
import JournalWebhooks from '@/components/admin/JournalWebhooks';
import ClesApi, {
  type CoteCle,
  type EtatAncienneCle,
} from '@/components/admin/ClesApi';
import { listerClesApi } from '@/lib/cles-api';
import { collecterStatsRevenus } from '@/lib/admin-revenus';
import { normaliserWebhooks } from '@/lib/admin-webhooks';
import { aLaPermission, estAdmin, estSuperAdmin, normaliserRole } from '@/lib/roles';
import {
  collecterStatsAbonnements,
  collecterStatsAdmin,
  comptesEnAnomalie,
  formaterNombre,
  formaterMontant,
  formaterPeriode,
  listerComptesAdmin,
  listerCourrielsAdmin,
  listerPaiementsAdmin,
  normaliserActions,
  normaliserPlans,
  type PlanAdmin,
  type StatsAdmin,
} from '@/lib/admin-stats';
import type { ClientRpc } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Administration',
  description: 'Statistiques d’usage, comptes, abonnements et paiements.',
  robots: { index: false, follow: false, nocache: true },
};

interface CarteStatProps {
  libelle: string;
  valeur: string;
  detail?: string;
}

function CarteStat({ libelle, valeur, detail }: CarteStatProps) {
  return (
    <div className="velours p-4 sm:p-5">
      <p className="text-encre-500 text-[11px] uppercase tracking-wider leading-tight">{libelle}</p>
      <p className="font-display text-2xl sm:text-3xl text-encre-100 mt-2 break-words">{valeur}</p>
      {detail && <p className="text-encre-500 text-xs mt-1">{detail}</p>}
    </div>
  );
}

export default async function PageAdmin() {
  // Source de vérité : le garde serveur. Redirige sinon.
  await exigerPermission('admin.tableau_de_bord.voir', '/admin');

  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const clientRpc: ClientRpc = { rpc: (nom, args) => supabase.rpc(nom, args) };

  // Sections du tableau de bord ouvertes à ce compte. Le super-admin
  // reçoit toutes les sections ; un administrateur nommé reçoit celles
  // que le super-admin lui a ouvertes (toutes par défaut).
  const { data: sectionsBrutes } = await supabase.rpc('mes_sections');
  const sectionsAutorisees: string[] = Array.isArray(sectionsBrutes)
    ? (sectionsBrutes as string[])
    : [];
  const peutVoir = (section: string): boolean => sectionsAutorisees.includes(section);

  const [
    { data: profil },
    resultatStats,
    resultatComptes,
    resultatCourriels,
    resultatAgr,
    resultatPaiements,
    { data: plansBruts },
    { data: actionsBrutes, error: actionsErreur },
    { data: visitesBrutes, error: visitesErreur },
    { data: sectionsRows },
    sante,
    mesAlertesResultat,
    { data: alertesAdminRows },
    // Vague 2 : indicateurs de revenus (MRR, mouvements mensuels).
    resultatRevenus,
    // Vague 2 : journal des livraisons de webhook (RLS admin). La
    // table peut être absente tant que la migration n'est pas
    // appliquée : l'écran l'indique proprement.
    { data: webhooksBruts, error: webhooksErreur },
  ] = await Promise.all([
    supabase.from('profiles').select('pseudo, role').eq('id', user?.id ?? '').maybeSingle(),
    collecterStatsAdmin(clientRpc),
    listerComptesAdmin(clientRpc),
    listerCourrielsAdmin(clientRpc),
    collecterStatsAbonnements(clientRpc),
    listerPaiementsAdmin(clientRpc, 200),
    // Catalogue public (lecture autorisée à tout compte connecté).
    supabase.from('plans_abonnement').select('code, nom').order('ordre'),
    // Journal des actions : lisible par le SEUL rôle admin (RLS est_admin).
    supabase
      .from('admin_actions')
      .select('id, admin_id, cible_id, action, duree, periode_fin, motif, cree_le')
      .order('cree_le', { ascending: false })
      .limit(20),
    // Audience anonyme (comptages seuls, 30 jours).
    supabase.rpc('admin_stats_visites', { p_jours: 30 }),
    // Réglages de sections par administrateur (lisible du seul super-admin
    // par la politique RLS de la table).
    supabase.from('admin_sections').select('proprietaire_id, sections'),
    // Contrôle de santé RÉEL des moteurs (sondes courtes mises en cache).
    // En cas d'erreur inattendue, l'admin reste affiché sans ce bloc.
    verifierChaine().catch(() => null as SanteChaine | null),
    // Préférences d'alerte du compte connecté (réussi / échoué).
    supabase.rpc('mes_alertes'),
    // Réglages des autres administrateurs (le super-admin seul y a droit :
    // la fonction SQL lève une exception pour les autres, d'où `data` nulle).
    supabase.rpc('admin_alertes_liste'),
    // Vague 2 : indicateurs de revenus (MRR, mouvements mensuels).
    collecterStatsRevenus(clientRpc, 6),
    // Vague 2 : journal des livraisons de webhook (RLS admin). La
    // table peut être absente tant que la migration n'est pas
    // appliquée : l'écran l'indique proprement.
    supabase
      .from('evenements_webhook')
      .select(
        'id, fournisseur, evenement, reference, statut_http, traite, deja_traite, erreur, cree_le'
      )
      .order('cree_le', { ascending: false })
      .limit(30),
  ]);

  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (user?.email?.split('@')[0] ?? 'Administrateur');
  const role = (profil as { role?: string } | null)?.role ?? 'admin';
  const roleCourant = normaliserRole(role);
  // Le panneau « Rôles » n'est monté QUE pour un super-administrateur :
  // c'est un AJOUT au tableau de bord, les cinq onglets existants
  // restent identiques (mêmes index) pour un administrateur simple.
  const superAdmin = estSuperAdmin(roleCourant);
  const nbAdministrateurs = resultatComptes.comptes.filter((c) =>
    estAdmin(normaliserRole(c.role))
  ).length;

  // -------- Chantier post-lancement + Clés API --------
  // Même permission que la page dédiée /admin/fonctionnalites : les
  // écrans sont équivalents. Les clés d'API vivent dans LEUR onglet
  // (« Clés API »), plus dans « Fonctionnalités ». Chargés SEULEMENT
  // si le compte peut gérer les fonctionnalités ET qu'une des deux
  // sections correspondantes lui est ouverte (aucune requête inutile
  // sinon).
  const peutGererFonctionnalites = aLaPermission(roleCourant, 'admin.fonctionnalites.gerer');
  let interrupteursChantier: ReturnType<typeof versInterrupteursAdmin> = [];
  let clesApi: CoteCle[] = [];
  let ancienneCle: EtatAncienneCle = { defini: false, apercu: null, majLe: null };
  if (peutGererFonctionnalites && (peutVoir('cles_api') || peutVoir('fonctionnalites'))) {
    const [listeChantier, lignesCles, metaCleChantier] = await Promise.all([
      listeAvecEtats(),
      // Réservoir de clés (table cles_api) : lisible ici (session
      // admin + RLS). La valeur complète ne quitte JAMAIS le serveur :
      // seul l'aperçu masqué (AIza…x9Qz) est transmis à l'interface.
      listerClesApi(supabase),
      lireParametreMeta(supabase, CLE_PARAMETRE_GEMINI),
    ]);
    interrupteursChantier = versInterrupteursAdmin(listeChantier);
    clesApi = lignesCles.map((c) => ({
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
    }));
    ancienneCle = {
      defini: metaCleChantier !== null,
      apercu: metaCleChantier ? masquerCle(metaCleChantier.valeur) : null,
      majLe: metaCleChantier?.majLe ?? null,
    };
  }

  // -------- Alertes de paiement --------
  const ligneAlertes = (Array.isArray(mesAlertesResultat.data)
    ? mesAlertesResultat.data[0]
    : mesAlertesResultat.data) as
    | { paiement_reussi?: boolean; paiement_echoue?: boolean }
    | null
    | undefined;
  const alertesMoi = {
    reussi: ligneAlertes?.paiement_reussi ?? true,
    echoue: ligneAlertes?.paiement_echoue ?? true,
  };
  const reglagesAlertes = new Map<string, { reussi: boolean; echoue: boolean }>();
  for (const brut of Array.isArray(alertesAdminRows) ? alertesAdminRows : []) {
    const ligne = brut as {
      compte_id?: string;
      paiement_reussi?: boolean;
      paiement_echoue?: boolean;
    };
    if (typeof ligne.compte_id === 'string') {
      reglagesAlertes.set(ligne.compte_id, {
        reussi: ligne.paiement_reussi ?? true,
        echoue: ligne.paiement_echoue ?? true,
      });
    }
  }
  const administrateursAlertes = superAdmin
    ? resultatComptes.comptes
        .filter((c) => estAdmin(normaliserRole(c.role)))
        .map((c) => ({
          id: c.id,
          pseudo: c.pseudo,
          reussi: reglagesAlertes.get(c.id)?.reussi ?? true,
          echoue: reglagesAlertes.get(c.id)?.echoue ?? true,
        }))
    : [];

  const stats: StatsAdmin | null = resultatStats.stats;
  const abonnementsDisponibles = stats !== null && stats.abonnementsActifs !== null;

  // -------- Vague 2 : revenus et livraisons de webhook --------
  const statsRevenus = resultatRevenus.stats;
  const erreurRevenus = resultatRevenus.erreur;
  const livraisonsWebhook = normaliserWebhooks(webhooksBruts);
  const erreurWebhooks = webhooksErreur
    ? webhooksErreur.message.includes('does not exist')
      ? 'table non encore créée : appliquez la migration « evenements_webhook » (SQL consolidé).'
      : webhooksErreur.message
    : null;

  const plans: PlanAdmin[] = normaliserPlans(plansBruts);
  const actions = normaliserActions(actionsBrutes);
  const pseudos: Record<string, string> = {};
  for (const c of resultatComptes.comptes) pseudos[c.id] = c.pseudo;
  const anomalies = comptesEnAnomalie(resultatComptes.comptes, plans);

  // ------------------------------------------------------------
  // Audience et conversions : tout est calculé à partir de données
  // déjà chargées (aucune requête supplémentaire).
  // ------------------------------------------------------------
  const visites = normaliserVisites(visitesBrutes);

  // Réglages de sections déjà enregistrés (les autres comptes suivent
  // le comportement par défaut : toutes les sections d'exploitation).
  const sectionsParCompte: Record<string, string[] | null> = {};
  for (const ligne of sectionsRows ?? []) {
    const brut = ligne as { proprietaire_id?: unknown; sections?: unknown };
    if (typeof brut.proprietaire_id === 'string' && Array.isArray(brut.sections)) {
      sectionsParCompte[brut.proprietaire_id] = brut.sections.filter(
        (valeur): valeur is string => typeof valeur === 'string'
      );
    }
  }

  const agregatsPaiements30 = agregerPaiements(resultatPaiements.paiements, 30);
  const paiementsEncaisse30 = agregatsPaiements30.parStatut
    .filter((ligne) => ligne.statut === 'reussi')
    .reduce((total, ligne) => total + ligne.nombre, 0);

  // ------------------------------------------------------------
  // Trois chiffres d'aujourd'hui + voyants d'exploitation.
  // Tout provient de données DÉJÀ chargées : aucune requête de plus,
  // donc aucun coût Supabase supplémentaire.
  // ------------------------------------------------------------
  const serieEncaisse = agregatsPaiements30.serie.map((point) => point.encaisse);
  const encaisseJour = serieEncaisse[serieEncaisse.length - 1] ?? 0;
  const encaisseHier = serieEncaisse[serieEncaisse.length - 2] ?? 0;
  const nbPaiementsJour = agregatsPaiements30.serie[agregatsPaiements30.serie.length - 1]?.nombre ?? 0;
  const serieVisites = visites.parJour.slice(-14).map((point) => point.visites);
  const moisTraduits = stats?.periodes ?? [];
  const caracteresMois = moisTraduits[moisTraduits.length - 1]?.caracteres ?? 0;
  const caracteresMoisPrecedent = moisTraduits[moisTraduits.length - 2]?.caracteres ?? 0;

  /** Variation en % ; null quand la comparaison n'a pas de sens (0 → n). */
  const variation = (actuel: number, precedent: number): number | null => {
    if (precedent === 0) return actuel === 0 ? 0 : null;
    return ((actuel - precedent) / precedent) * 100;
  };

  const cartesKpi: CarteKpi[] = [
    {
      cle: 'encaisse',
      libelle: 'Encaissé aujourd’hui',
      valeur: formaterNombre(encaisseJour),
      unite: 'F CFA',
      detail:
        nbPaiementsJour === 0
          ? 'aucun paiement encaissé'
          : `${nbPaiementsJour} paiement${nbPaiementsJour > 1 ? 's' : ''} encaissé${nbPaiementsJour > 1 ? 's' : ''}`,
      delta: variation(encaisseJour, encaisseHier),
      serie: serieEncaisse.slice(-14),
      ton: 'grenat',
    },
    {
      cle: 'visites',
      libelle: 'Pages vues aujourd’hui',
      valeur: formaterNombre(visites.totaux.aujourdhui),
      unite: 'vues',
      detail: `${formaterNombre(visites.totaux.uniques)} visiteurs uniques sur 30 jours`,
      delta: variation(visites.totaux.aujourdhui, visites.totaux.hier),
      serie: serieVisites,
      ton: 'violet',
    },
    {
      cle: 'traduction',
      libelle: 'Caractères traduits',
      valeur: formaterNombre(caracteresMois),
      unite: 'ce mois',
      detail:
        moisTraduits.length > 0
          ? `${formaterPeriode(moisTraduits[moisTraduits.length - 1].periode)} — ${formaterNombre(
              stats?.chapitresTraduits ?? 0
            )} chapitres au total`
          : 'aucune traduction enregistrée',
      delta: variation(caracteresMois, caracteresMoisPrecedent),
      serie: moisTraduits.slice(-6).map((point) => point.caracteres),
      ton: 'or',
    },
  ];

  const erreursLecture = [
    resultatStats.erreur,
    resultatComptes.erreur,
    resultatPaiements.erreur,
  ].filter((valeur): valeur is string => typeof valeur === 'string' && valeur !== '');

  const derniersEncaissements = resultatPaiements.paiements
    .filter((paiement) => paiement.statut === 'reussi' && paiement.creeLe)
    .map((paiement) => paiement.creeLe as string)
    .sort();
  const dernierEncaissement = derniersEncaissements[derniersEncaissements.length - 1] ?? null;
  // Fraîcheur jugée sur la série déjà agrégée (7 derniers jours) plutôt
  // qu'avec Date.now() : le rendu reste pur et l'information est la même.
  const encaissementCetteSemaine = serieEncaisse.slice(-7).some((montant) => montant > 0);
  const dateCourte = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

  // -------- Voyant IA : au moins une clé utilisable ? --------
  // La variable d'environnement compte comme une clé (voie officielle).
  const nbClesGeminiActives = clesApi.filter(
    (c) => c.fournisseur === 'gemini' && c.actif
  ).length;
  const nbClesAutres = clesApi.filter((c) => c.fournisseur !== 'gemini').length;
  const iaConfiguree =
    Boolean(process.env.GEMINI_API_KEY?.trim()) ||
    nbClesGeminiActives > 0 ||
    ancienneCle.defini;
  const detailClesIa = [
    process.env.GEMINI_API_KEY?.trim() ? 'variable d’environnement' : null,
    nbClesGeminiActives > 0
      ? `${nbClesGeminiActives} clé${nbClesGeminiActives > 1 ? 's' : ''} Gemini`
      : null,
    nbClesAutres > 0 ? `${nbClesAutres} autre${nbClesAutres > 1 ? 's' : ''}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const voyants: VoyantSante[] = [
    {
      cle: 'base',
      libelle: 'Base de données',
      etat: erreursLecture.length > 0 ? 'panne' : 'ok',
      detail:
        erreursLecture.length > 0
          ? `${erreursLecture.length} lecture${erreursLecture.length > 1 ? 's' : ''} en échec`
          : 'lectures OK',
    },
    {
      cle: 'paiements',
      libelle: 'Encaissements',
      etat: encaissementCetteSemaine ? 'ok' : 'attention',
      detail:
        dernierEncaissement === null
          ? 'aucun encaissement enregistré'
          : `dernier le ${dateCourte(dernierEncaissement)}`,
      onglet: 'paiements',
    },
    {
      cle: 'traduction',
      libelle: 'Traduction',
      etat: (stats?.chapitresTraduits ?? 0) > 0 ? 'ok' : 'attention',
      detail: `${formaterNombre(stats?.chapitresTraduits ?? 0)} chapitres traduits`,
      onglet: 'systeme',
    },
    {
      cle: 'moteurs',
      libelle: 'Moteurs',
      etat: !sante || (sante.moteurs ?? []).every((moteur) => moteur.etat !== 'ok') ? 'panne' : 'ok',
      detail:
        sante?.moteurActif !== null && sante?.moteurActif !== undefined
          ? `${sante.moteurActif.nom} disponible`
          : 'aucun moteur disponible',
      onglet: 'systeme',
    },
    {
      cle: 'ia',
      libelle: 'Clés IA',
      etat: iaConfiguree ? 'ok' : 'attention',
      detail: iaConfiguree
        ? detailClesIa || 'clés enregistrées'
        : 'aucune clé : collez-en une dans « Clés API »',
      onglet: 'cles',
    },
  ];

  // ------------------------------------------------------------
  // Regroupement en SIX onglets. Chaque panneau conserve son
  // contenu d'origine à l'identique : aucun bloc n'est retiré, seul
  // l'affichage change (un seul panneau monté à la fois).
  // Les pastilles n'utilisent que des données déjà chargées.
  // ------------------------------------------------------------
  const onglets: OngletAdmin[] = [
    {
      id: 'apercu',
      libelle: 'Vue d’ensemble',
      contenu: (
        <>
          {stats ? (
            <>
              <section aria-labelledby="titre-vue-ensemble" className="space-y-4">
                <div>
                  <h2 id="titre-vue-ensemble" className="sur-titre text-encre-300">
                    Vue d’ensemble
                  </h2>
                  <div className="liseret mt-3" />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  <CarteStat libelle="Comptes" valeur={formaterNombre(stats.comptes)} />
                  <CarteStat
                    libelle="Livres importés"
                    valeur={formaterNombre(stats.livres)}
                    detail={`${formaterNombre(stats.chapitres)} chapitres, ${formaterNombre(
                      stats.segments
                    )} segments`}
                  />
                  <CarteStat
                    libelle="Chapitres traduits"
                    valeur={formaterNombre(stats.chapitresTraduits)}
                    detail={`sur ${formaterNombre(stats.chapitres)} chapitres`}
                  />
                  <CarteStat
                    libelle="Caractères traduits (période)"
                    valeur={formaterNombre(stats.caracteresPeriode)}
                    detail={`du ${stats.periodeDebut} au ${stats.periodeFin}`}
                  />
                  <CarteStat
                    libelle="Caractères utilisés (total)"
                    valeur={formaterNombre(stats.caracteresUtilisesTotal)}
                  />
                  <CarteStat
                    libelle="Abonnements actifs"
                    valeur={
                      stats.abonnementsActifs === null
                        ? '—'
                        : formaterNombre(stats.abonnementsActifs)
                    }
                    detail={
                      stats.paiementsReussis === null
                        ? 'schéma abonnement non fusionné'
                        : `${formaterNombre(stats.paiementsReussis)} paiements réussis`
                    }
                  />
                </div>
              </section>

              {stats.periodes.length > 0 && (
                <section className="velours p-5 sm:p-6" aria-labelledby="titre-periodes">
                  <h2 id="titre-periodes" className="sur-titre text-encre-300">
                    Caractères traduits par mois
                  </h2>
                  <div className="liseret mt-3" />
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[280px] text-sm">
                      <caption className="sr-only">
                        Caractères traduits par mois sur la période sélectionnée.
                      </caption>
                      <thead>
                        <tr className="text-left text-encre-500 text-xs uppercase tracking-wider">
                          <th scope="col" className="py-2 font-normal">Période</th>
                          <th scope="col" className="py-2 font-normal text-right">Caractères</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.periodes.map((p) => (
                          <tr key={p.periode} className="border-t border-nuit-700/50">
                            <th scope="row" className="py-2 text-left font-normal text-encre-300">
                              {formaterPeriode(p.periode)}
                            </th>
                            <td className="py-2 text-encre-100 text-right">
                              {formaterNombre(p.caracteres)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          ) : (
            <p className="text-encre-500 text-sm italic">
              Statistiques indisponibles pour le moment.
            </p>
          )}
        </>
      ),
    },
    {
      // Audience anonyme : comptages seuls (voir lib/tracking.ts).
      id: 'audience',
      libelle: 'Audience',
      pastille: { nombre: visites.totaux.visites, libelle: 'pages vues (30 j)' },
      contenu: (
        <TableauVisites
          stats={visitesErreur ? null : visites}
          erreur={visitesErreur ? visitesErreur.message : null}
          conversions={{
            comptes: stats ? stats.comptes : 0,
            paiements: paiementsEncaisse30,
            volume: agregatsPaiements30.volume,
            devise: 'XOF',
          }}
        />
      ),
    },
    {
      id: 'comptes',
      libelle: 'Comptes',
      pastille: { nombre: resultatComptes.comptes.length, libelle: 'comptes listés' },
      contenu: (
        <section className="velours p-5 sm:p-6" aria-labelledby="titre-comptes">
          <h2 id="titre-comptes" className="sur-titre text-encre-300">
            Comptes et abonnements
          </h2>
          <div className="liseret mt-3" />
          {resultatCourriels.erreur && (
            <p className="text-encre-500 text-xs mt-2">
              Courriels indisponibles (recherche par courriel limitée) : {resultatCourriels.erreur}
            </p>
          )}
          {resultatComptes.erreur && (
            <p className="text-grenat-300 text-sm mt-3">
              Liste indisponible : {resultatComptes.erreur}
            </p>
          )}
          <div className="mt-4">
            <TableauComptes
              comptes={resultatComptes.comptes}
              emails={resultatCourriels.courriels}
              plans={plans}
              abonnementsDisponibles={abonnementsDisponibles}
            />
          </div>
        </section>
      ),
    },
    {
      id: 'abonnements',
      libelle: 'Abonnements',
      pastille:
        anomalies.length > 0
          ? { nombre: anomalies.length, libelle: 'anomalies', alerte: true }
          : undefined,
      contenu: (
        <>
          <RepartitionAbonnements stats={resultatAgr.stats} erreur={resultatAgr.erreur} />
          <RevenusAbonnements stats={statsRevenus} erreur={erreurRevenus} />
          <AnomaliesComptes anomalies={anomalies} plans={plans} />
        </>
      ),
    },
    {
      id: 'paiements',
      libelle: 'Paiements',
      pastille: {
        nombre: resultatPaiements.paiements.length,
        libelle: 'paiements récents',
      },
      contenu: (
        <>
          <PaiementsFiltrables
            paiements={resultatPaiements.paiements}
            erreur={resultatPaiements.erreur}
          />
          <BlocRepliable
            titre="Livraisons de webhook (paiement)"
            resume={
              erreurWebhooks
                ? 'indisponible'
                : `${livraisonsWebhook.length} livraison${livraisonsWebhook.length > 1 ? 's' : ''}`
            }
          >
            <JournalWebhooks livraisons={livraisonsWebhook} erreur={erreurWebhooks} />
          </BlocRepliable>
        </>
      ),
    },
    // AJOUT : panneau de gestion des rôles, monté UNIQUEMENT pour un
    // super-administrateur. Les cinq onglets d'origine gardent leur
    // ordre et leur index pour un administrateur simple.
    ...(superAdmin
      ? [
          {
            id: 'roles',
            libelle: 'Rôles',
            pastille: { nombre: nbAdministrateurs, libelle: 'comptes avec droits' },
            contenu: (
              <>
                <GestionRoles
                  comptes={resultatComptes.comptes}
                  emails={resultatCourriels.courriels}
                  moiId={user?.id ?? ''}
                  roleCourant={roleCourant}
                />
                <SectionsAdministrateurs
                  comptes={resultatComptes.comptes}
                  sectionsInitiales={sectionsParCompte}
                  moiId={user?.id ?? ''}
                />
              </>
            ),
          } satisfies OngletAdmin,
        ]
      : []),
    {
      // Alertes de paiement : reçues dans la cloche, y compris la nuit.
      // Section délégable : le super-admin peut l'ouvrir à un autre admin.
      id: 'notifications',
      libelle: 'Alertes',
      contenu: (
        <AlertesPaiements
          moi={alertesMoi}
          superAdmin={superAdmin}
          administrateurs={administrateursAlertes}
        />
      ),
    },
    {
      id: 'systeme',
      libelle: 'Système',
      contenu: (
        <>
          {sante && <SanteMoteurs sante={sante} />}
          {/* Blocs repliables : l'onglet Système empilait quatre panneaux
              entiers (moteurs, ordre, journal, exports). Replié n'est pas
              muet : chaque résumé affiche son compte. */}
          <BlocRepliable titre="Ordre des moteurs de traduction" resume="modifiable sans redéploiement">
            <OrdreChaine />
          </BlocRepliable>
          <BlocRepliable
            titre="Journal des actions d’administration"
            resume={`${actions.length} entrée${actions.length > 1 ? 's' : ''}`}
          >
            <JournalActions
              actions={actions}
              pseudos={pseudos}
              erreur={actionsErreur ? actionsErreur.message : null}
            />
          </BlocRepliable>
          <BlocRepliable titre="Exports" resume="CSV des comptes et paiements">
            <ExportsAdmin />
          </BlocRepliable>
        </>
      ),
    },
    // Clés d'API : réservoir multi-fournisseurs avec succession —
    // permission admin.fonctionnalites.gerer ET section « cles_api »
    // ouverte (délégable depuis « Sections ouvertes »).
    // La pastille compte les clés actives ; en alerte si aucune clé IA.
    ...(peutGererFonctionnalites && peutVoir('cles_api')
      ? [
          {
            id: 'cles',
            libelle: 'Clés API',
            pastille: clesApi.some((c) => c.actif)
              ? { nombre: clesApi.filter((c) => c.actif).length, libelle: 'clés actives' }
              : { nombre: 0, libelle: 'clés actives', alerte: true },
            contenu: <ClesApi clesInitiales={clesApi} ancienne={ancienneCle} />,
          } satisfies OngletAdmin,
        ]
      : []),
    // Chantier post-lancement : interrupteurs des nouveaux modules, en
    // TANT QU'ONGLET, après « Clés API » — même contenu que la page
    // /admin/fonctionnalites (mapper partagé). La pastille compte les
    // modules actuellement OUVERTS aux lecteurs. (Les clés d'API ont
    // déménagé dans l'onglet « Clés API ».)
    ...(peutGererFonctionnalites && peutVoir('fonctionnalites')
      ? [
          {
            id: 'chantier',
            libelle: 'Fonctionnalités',
            pastille: {
              nombre: compterModulesOuverts(interrupteursChantier),
              libelle: 'modules ouverts',
            },
            contenu: <PanneauFonctionnalites interrupteurs={interrupteursChantier} />,
          } satisfies OngletAdmin,
        ]
      : []),
  ];

  // ------------------------------------------------------------
  // Délimitation par section : chaque onglet porte une section ; un
  // onglet sans section (Vue d'ensemble) reste toujours visible.
  // « Clés API » et « Fonctionnalités » exigent en PLUS la permission
  // admin.fonctionnalites.gerer, déjà exigée à leur montage.
  // ------------------------------------------------------------
  const SECTION_PAR_ONGLET: Record<string, string> = {
    audience: 'audience',
    comptes: 'comptes',
    abonnements: 'abonnements',
    paiements: 'paiements',
    notifications: 'notifications',
    systeme: 'systeme',
    // Nouveaux modules du chantier : désormais délégables comme les
    // autres (la base et la route /api/admin/sections les valident).
    cles: 'cles_api',
    chantier: 'fonctionnalites',
  };
  const ongletsAutorises = onglets.filter((onglet) => {
    const section = SECTION_PAR_ONGLET[onglet.id];
    return section === undefined || peutVoir(section);
  });

  // ------------------------------------------------------------
  // Entrées de la palette Ctrl+K : onglets autorisés, comptes et
  // paiements récents. Plafonnées pour ne pas transporter 5 000 lignes
  // dans le HTML de la page ; la recherche serveur reste le chemin
  // complet (onglet Comptes).
  // ------------------------------------------------------------
  const entreesPalette: EntreePalette[] = [
    ...ongletsAutorises.map((onglet) => ({
      id: `onglet-${onglet.id}`,
      libelle: onglet.libelle,
      groupe: 'Onglets' as const,
      onglet: onglet.id,
    })),
    ...resultatComptes.comptes.slice(0, 400).map((compte) => ({
      id: `compte-${compte.id}`,
      libelle: compte.pseudo,
      detail: `${normaliserRole(compte.role)}${compte.abonnementPlan ? ` · ${compte.abonnementPlan}` : ''}`,
      groupe: 'Comptes' as const,
      onglet: 'comptes',
      recherche: compte.pseudo,
    })),
    ...resultatPaiements.paiements.slice(0, 300).map((paiement) => ({
      id: `paiement-${paiement.reference}`,
      libelle: paiement.reference,
      detail: `${formaterMontant(paiement.montant, paiement.devise)} · ${paiement.pseudo}`,
      groupe: 'Paiements' as const,
      onglet: 'paiements',
      recherche: paiement.reference,
    })),
  ];

  return (
    <>
      <BarreNavigation email={user?.email ?? ''} pseudo={pseudo} role={role} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <header>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="sur-titre text-grenat-400">Administration</p>
              <h1 className="font-display text-3xl text-encre-100 mt-2">Tableau de bord</h1>
            </div>
            <CommandPalette entrees={entreesPalette} />
          </div>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Comptes, usage, abonnements et paiements. Aucun contenu de livre d’autrui n’est
            lisible ici. Les interrupteurs des nouveaux modules sont dans l’onglet
            « Fonctionnalités », les clés d’API dans « Clés API ».
          </p>
        </header>

        {resultatStats.erreur && (
          <p className="text-grenat-300 text-sm rounded-lg border border-grenat-500/40 bg-grenat-500/10 px-3 py-2">
            Statistiques indisponibles : {resultatStats.erreur}
          </p>
        )}

        {/* Voyants d'abord : on veut voir une panne sans ouvrir d'onglet. */}
        <BandeauSante voyants={voyants} />
        <BandeauAujourdhui cartes={cartesKpi} />

        <OngletsAdmin
          libelleBarre="Sections du tableau de bord d’administration"
          onglets={ongletsAutorises}
        />
      </main>
    </>
  );
}

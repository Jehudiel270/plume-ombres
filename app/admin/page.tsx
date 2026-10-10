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
import JournalPaiements from '@/components/admin/JournalPaiements';
import JournalActions from '@/components/admin/JournalActions';
import AnomaliesComptes from '@/components/admin/AnomaliesComptes';
import ExportsAdmin from '@/components/admin/ExportsAdmin';
import { verifierChaine, type SanteChaine } from '@/lib/providers/sante';
import {
  collecterStatsAbonnements,
  collecterStatsAdmin,
  comptesEnAnomalie,
  formaterNombre,
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
import { estAdmin, estSuperAdmin, normaliserRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Administration',
  description: 'Statistiques d’usage, comptes, abonnements et paiements.',
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

  const [
    { data: profil },
    resultatStats,
    resultatComptes,
    resultatCourriels,
    resultatAgr,
    resultatPaiements,
    { data: plansBruts },
    { data: actionsBrutes, error: actionsErreur },
    sante,
  ] = await Promise.all([
    supabase.from('profiles').select('pseudo, role').eq('id', user?.id ?? '').maybeSingle(),
    collecterStatsAdmin(clientRpc),
    listerComptesAdmin(clientRpc),
    listerCourrielsAdmin(clientRpc),
    collecterStatsAbonnements(clientRpc),
    listerPaiementsAdmin(clientRpc, 25),
    // Catalogue public (lecture autorisée à tout compte connecté).
    supabase.from('plans_abonnement').select('code, nom').order('ordre'),
    // Journal des actions : lisible par le SEUL rôle admin (RLS est_admin).
    supabase
      .from('admin_actions')
      .select('id, admin_id, cible_id, action, duree, periode_fin, motif, cree_le')
      .order('cree_le', { ascending: false })
      .limit(20),
    // Contrôle de santé RÉEL des moteurs (sondes courtes mises en cache).
    // En cas d'erreur inattendue, l'admin reste affiché sans ce bloc.
    verifierChaine().catch(() => null as SanteChaine | null),
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

  const stats: StatsAdmin | null = resultatStats.stats;
  const abonnementsDisponibles = stats !== null && stats.abonnementsActifs !== null;

  const plans: PlanAdmin[] = normaliserPlans(plansBruts);
  const actions = normaliserActions(actionsBrutes);
  const pseudos: Record<string, string> = {};
  for (const c of resultatComptes.comptes) pseudos[c.id] = c.pseudo;
  const anomalies = comptesEnAnomalie(resultatComptes.comptes, plans);

  // ------------------------------------------------------------
  // Regroupement en CINQ onglets. Chaque panneau conserve son
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
        <JournalPaiements
          paiements={resultatPaiements.paiements}
          erreur={resultatPaiements.erreur}
        />
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
              <GestionRoles
                comptes={resultatComptes.comptes}
                emails={resultatCourriels.courriels}
                moiId={user?.id ?? ''}
                roleCourant={roleCourant}
              />
            ),
          } satisfies OngletAdmin,
        ]
      : []),
    {
      id: 'systeme',
      libelle: 'Système',
      contenu: (
        <>
          {sante && <SanteMoteurs sante={sante} />}
          {/* AJOUT : réordonnancement des moteurs de traduction depuis
              l'admin (persisté en base, sans redéploiement). Le composant
              existait mais n'était monté nulle part : il est désormais
              accessible dans l'onglet Système. */}
          <OrdreChaine />
          <JournalActions
            actions={actions}
            pseudos={pseudos}
            erreur={actionsErreur ? actionsErreur.message : null}
          />
          <ExportsAdmin />
        </>
      ),
    },
  ];

  return (
    <>
      <BarreNavigation email={user?.email ?? ''} pseudo={pseudo} role={role} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">Administration</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">Tableau de bord</h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Comptes, usage, abonnements et paiements. Aucun contenu de livre d’autrui n’est
            lisible ici.
          </p>
        </header>

        {resultatStats.erreur && (
          <p className="text-grenat-300 text-sm rounded-lg border border-grenat-500/40 bg-grenat-500/10 px-3 py-2">
            Statistiques indisponibles : {resultatStats.erreur}
          </p>
        )}

        <OngletsAdmin
          libelleBarre="Sections du tableau de bord d’administration"
          onglets={onglets}
        />
      </main>
    </>
  );
}

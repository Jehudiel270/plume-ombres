// ============================================================
// app/admin/page.tsx — Tableau de bord administrateur.
//
// GARDE SERVEUR : la permission `admin.tableau_de_bord.voir` est
// vérifiée ici (source de vérité). Un compte connecté non admin est
// renvoyé vers sa bibliothèque ; un visiteur vers la connexion.
//
// L'admin ne voit ICI que des NOMBRES et des métadonnées de comptes
// (pseudo, rôle, dates, abonnement) : jamais le contenu d'un livre
// d'autrui (voir supabase/migrations/..._roles_admin.sql).
// ============================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { creerClientServeur } from '@/lib/supabase/server';
import { exigerPermission } from '@/lib/roles-garde';
import BarreNavigation from '@/components/BarreNavigation';
import TableauComptes from '@/components/admin/TableauComptes';
import {
  collecterStatsAdmin,
  formaterNombre,
  formaterPeriode,
  listerComptesAdmin,
  type StatsAdmin,
} from '@/lib/admin-stats';
import type { ClientRpc } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Administration',
  description: 'Statistiques d’usage et gestion des abonnements.',
};

interface CarteStatProps {
  libelle: string;
  valeur: string;
  detail?: string;
}

function CarteStat({ libelle, valeur, detail }: CarteStatProps) {
  return (
    <div className="velours p-5">
      <p className="sur-titre text-encre-300">{libelle}</p>
      <p className="font-display text-3xl text-encre-100 mt-2">{valeur}</p>
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

  const [{ data: profil }, resultatStats, resultatComptes] = await Promise.all([
    supabase.from('profiles').select('pseudo, role').eq('id', user?.id ?? '').maybeSingle(),
    collecterStatsAdmin(clientRpc),
    listerComptesAdmin(clientRpc),
  ]);

  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (user?.email?.split('@')[0] ?? 'Administrateur');
  const role = (profil as { role?: string } | null)?.role ?? 'admin';

  const stats: StatsAdmin | null = resultatStats.stats;
  const abonnementsDisponibles = stats !== null && stats.abonnementsActifs !== null;

  return (
    <>
      <BarreNavigation email={user?.email ?? ''} pseudo={pseudo} role={role} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <div>
          <p className="sur-titre text-grenat-400">Administration</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            Tableau de bord
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Comptes, usage et abonnements. Aucun contenu de livre d’autrui n’est lisible
            ici.
          </p>
          <p className="text-encre-500 text-xs mt-2">
            <Link href="/admin/sante" className="underline hover:text-encre-300">
              Santé du studio (traductions, moteurs, erreurs) →
            </Link>
          </p>
        </div>

        {resultatStats.erreur && (
          <p className="text-grenat-300 text-sm rounded-lg border border-grenat-500/40 bg-grenat-500/10 px-3 py-2">
            Statistiques indisponibles : {resultatStats.erreur}
          </p>
        )}

        {stats && (
          <>
            <section
              aria-label="Statistiques d’usage"
              className="grid grid-cols-2 lg:grid-cols-3 gap-4"
            >
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
            </section>

            {stats.periodes.length > 0 && (
              <section className="velours p-6" aria-label="Caractères par période">
                <p className="sur-titre text-encre-300">Caractères traduits par mois</p>
                <table className="w-full text-sm mt-4">
                  <thead>
                    <tr className="text-left text-encre-500 text-xs uppercase tracking-wider">
                      <th className="py-2 font-normal">Période</th>
                      <th className="py-2 font-normal text-right">Caractères</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.periodes.map((p) => (
                      <tr key={p.periode} className="border-t border-nuit-700/50">
                        <td className="py-2 text-encre-300">{formaterPeriode(p.periode)}</td>
                        <td className="py-2 text-encre-100 text-right">
                          {formaterNombre(p.caracteres)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}

        <section className="velours p-6" aria-label="Gestion des abonnements">
          <p className="sur-titre text-encre-300">Comptes et abonnements</p>
          {resultatComptes.erreur && (
            <p className="text-grenat-300 text-sm mt-3">
              Liste indisponible : {resultatComptes.erreur}
            </p>
          )}
          <div className="mt-4">
            <TableauComptes
              comptes={resultatComptes.comptes}
              abonnementsDisponibles={abonnementsDisponibles}
            />
          </div>
        </section>
      </main>
    </>
  );
}

// ============================================================
// app/admin/fonctionnalites/page.tsx — Interrupteurs de modules.
//
// Page d'administration du chantier post-lancement : liste des
// interrupteurs du registre (lib/fonctionnalites/registre.ts) avec
// leur état effectif. Page SÉPARÉE du tableau de bord (ajout pur,
// conformément aux règles du chantier) : le tableau de bord existant
// n'est pas modifié, seule une entrée y est ajoutée.
//
// GARDE SERVEUR : la permission `admin.fonctionnalites.gerer` est
// vérifiée ici (source de vérité). Les états sont lus directement
// en base (RLS : lecture authentifiée, écriture admin).
// ============================================================

import type { Metadata } from 'next';
import Link from 'next/link';

import { exigerPermission } from '@/lib/roles-garde';
import { listeAvecEtats } from '@/lib/fonctionnalites/etats';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';
import BarreNavigation from '@/components/BarreNavigation';
import PanneauFonctionnalites, {
  type InterrupteurAdmin,
} from '@/components/admin/PanneauFonctionnalites';

export const metadata: Metadata = {
  title: 'Fonctionnalités — Administration',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function PageAdminFonctionnalites() {
  const { utilisateurId, role } = await exigerPermission(
    'admin.fonctionnalites.gerer',
    '/admin/fonctionnalites'
  );
  // Courriel affiché dans la barre de navigation (même convention que
  // le tableau de bord).
  const user = await utilisateurConnecte();

  // Pseudo affiché dans la barre de navigation (même convention que
  // le tableau de bord).
  const supabase = await creerClientServeur();
  const { data: profil } = utilisateurId
    ? await supabase.from('profiles').select('pseudo').eq('id', utilisateurId).maybeSingle()
    : { data: null };
  const pseudo = (profil as { pseudo?: string | null } | null)?.pseudo ?? '';

  const liste = await listeAvecEtats();

  const interrupteurs: InterrupteurAdmin[] = liste.map(({ def, etat }) => ({
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
  }));

  return (
    <>
      <BarreNavigation email={user?.email ?? ''} pseudo={pseudo} role={role} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <header>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="sur-titre text-grenat-400">Administration</p>
              <h1 className="font-display text-3xl text-encre-100 mt-2">
                Fonctionnalités
              </h1>
            </div>
            <Link href="/admin" className="bouton-fantome min-h-11 text-sm">
              ‹ Tableau de bord
            </Link>
          </div>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Un module n’existe pour les lecteurs que si vous l’avez ouvert ici.
            Fermé, il répond 404 — page et API. Les modules marqués à risque
            juridique restent fermés tant qu’un juriste ne les a pas validés par
            écrit (loi béninoise n° 2005-30).
          </p>
        </header>

        <PanneauFonctionnalites interrupteurs={interrupteurs} />
      </main>
    </>
  );
}

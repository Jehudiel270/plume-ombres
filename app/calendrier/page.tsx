// ============================================================
// app/calendrier/page.tsx — Calendrier de lecture (A19/A20,
// VARIANTE ATELIER).
//
// La maquette prévoyait un calendrier de SORTIES avec comptes à
// rebours : ce scénario suppose que la plateforme PUBLIE des
// chapitres — hors périmètre (risque juridique, interrupteur
// éteint). La variante honnête, câblée sur des données réelles :
// la grille mensuelle de VOTRE lecture (chapitres découverts par
// jour, depuis l'XP posée), votre série de jours avec jours de
// repos, et les échéances de vos défis posées sur le mois.
//
// GARDE SERVEUR : interrupteur `calendrier` évalué ICI — fermé,
// sans confirmation juriste → 404.
// ============================================================

import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  aggregerMois,
  horodatageIlYaUnAn,
  horodatageMaintenant,
  decalerMois,
  libelleMois,
  serieActuelle,
} from '@/lib/calendrier-lecture';
import { LIBELLES_GENRE, type Defi } from '@/lib/defis';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';

export const metadata = prive('Calendrier de lecture');

export const dynamic = 'force-dynamic';

const JOURS_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export default async function PageCalendrier({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const { mois: moisParam } = await searchParams;
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  const moduleVerdict = await verifierAccesModule('calendrier', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert) notFound();

  // Mois affiché (AAAA-MM) : paramètre ou mois courant.
  const aujourdhuiISO = horodatageMaintenant().slice(0, 10);
  const mois = /^\d{4}-\d{2}$/.test(moisParam ?? '')
    ? (moisParam as string)
    : aujourdhuiISO.slice(0, 7);

  // Chapitres découverts (XP posée) dans le mois.
  const { data: xpLignes } = await supabase
    .from('lectures_xp')
    .select('created_at')
    .gte('created_at', `${mois}-01T00:00:00Z`)
    .lt('created_at', `${decalerMois(mois, 1)}-01T00:00:00Z`)
    .limit(2000);

  const horodatagesMois = ((xpLignes ?? []) as unknown as Array<{ created_at: string }>).map(
    (l) => l.created_at
  );
  const jours = aggregerMois(mois, horodatagesMois);
  const totalMois = jours.reduce((s, j) => s + j.chapitres, 0);
  const joursLus = jours.filter((j) => j.chapitres > 0).length;

  // Défis posés sur ce mois (tous, pour la progression réelle).
  const { data: tousDefis } = await supabase
    .from('defis')
    .select('id, titre, genre, cible, livre_id, echeance, termine_le, created_at')
    .limit(30);
  const defis: Defi[] = (tousDefis ?? []).map((d) => {
    const ligne = d as Record<string, unknown>;
    return {
      id: String(ligne.id),
      titre: String(ligne.titre),
      genre: ligne.genre === 'livres' || ligne.genre === 'jours' ? ligne.genre : 'chapitres',
      cible: Number(ligne.cible) || 1,
      livreId: typeof ligne.livre_id === 'string' ? ligne.livre_id : null,
      echeance: typeof ligne.echeance === 'string' ? ligne.echeance : null,
      termineLe: typeof ligne.termine_le === 'string' ? ligne.termine_le : null,
      creeLe: String(ligne.created_at ?? ''),
    };
  });

  // Série : sur l'année écoulée (365 jours).
  const { data: xpAnnee } = await supabase
    .from('lectures_xp')
    .select('created_at')
    .gte('created_at', horodatageIlYaUnAn())
    .limit(5000);
  const serie = serieActuelle(
    ((xpAnnee ?? []) as unknown as Array<{ created_at: string }>).map((l) => l.created_at),
    aujourdhuiISO,
    1
  );

  const { data: profil } = await supabase
    .from('profiles')
    .select('pseudo')
    .eq('id', utilisateur.id)
    .maybeSingle();
  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  // Jour de semaine du 1er du mois (lundi = 0).
  const premierJour = new Date(`${mois}-01T00:00:00Z`).getUTCDay();
  const decalage = (premierJour + 6) % 7;

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">Calendrier de lecture</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            {libelleMois(mois)}
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Ici, pas de comptes à rebours commerciaux : la plateforme ne
            publie pas de chapitres. Le calendrier raconte VOTRE lecture —
            les chapitres découverts chaque jour, votre série, vos échéances.
          </p>
        </header>

        {/* Série et totaux */}
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Résumé du mois">
          <div className="velours p-4 rounded-2xl">
            <p className="text-2xl font-display text-encre-100">{serie}</p>
            <p className="text-xs text-encre-500">jours de série (1 jour de repos toléré par semaine)</p>
          </div>
          <div className="velours p-4 rounded-2xl">
            <p className="text-2xl font-display text-encre-100">{totalMois}</p>
            <p className="text-xs text-encre-500">chapitres découverts ce mois</p>
          </div>
          <div className="velours p-4 rounded-2xl">
            <p className="text-2xl font-display text-encre-100">{joursLus}</p>
            <p className="text-xs text-encre-500">jours de lecture ce mois</p>
          </div>
        </section>

        {/* Navigation de mois */}
        <nav className="flex items-center gap-2" aria-label="Changer de mois">
          <a
            href={`/calendrier?mois=${decalerMois(mois, -1)}`}
            className="bouton-fantome !min-h-9 !px-3 text-xs"
          >
            Mois précédent
          </a>
          <a
            href={`/calendrier?mois=${decalerMois(mois, 1)}`}
            className="bouton-fantome !min-h-9 !px-3 text-xs"
          >
            Mois suivant
          </a>
        </nav>

        {/* Grille du mois */}
        <section aria-label={`Grille de ${libelleMois(mois)}`}>
          <div className="grid grid-cols-7 gap-1.5">
            {JOURS_SEMAINE.map((j, i) => (
              <div
                key={`${j}-${i}`}
                className="text-center text-[10px] uppercase tracking-wider text-encre-500 pb-1"
                aria-hidden="true"
              >
                {j}
              </div>
            ))}
            {Array.from({ length: decalage }).map((_, i) => (
              <div key={`vide-${i}`} aria-hidden="true" />
            ))}
            {jours.map((j) => {
              const estAujourdhui = j.jour === aujourdhuiISO;
              const lu = j.chapitres > 0;
              return (
                <div
                  key={j.jour}
                  className={`rounded-lg border p-2 text-center ${
                    estAujourdhui
                      ? 'border-grenat-500'
                      : lu
                        ? 'border-nuit-600 bg-nuit-850'
                        : 'border-nuit-800'
                  }`}
                >
                  <p className={`text-xs ${lu ? 'text-encre-200' : 'text-encre-500'}`}>
                    {Number(j.jour.slice(8))}
                  </p>
                  {lu && (
                    <p className="mt-0.5 text-[10px] text-grenat-300" title={`${j.chapitres} chapitre(s) découvert(s)`}>
                      {j.chapitres} ch.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Échéances de défis posées sur ce mois */}
        {defis.filter((d) => d.echeance?.startsWith(mois)).length > 0 && (
          <section aria-label="Échéances du mois">
            <h2 className="sur-titre text-encre-300">Échéances posées ce mois</h2>
            <ul className="mt-2 space-y-2">
              {defis
                .filter((d) => d.echeance?.startsWith(mois))
                .map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between rounded-xl border border-nuit-700/70 px-4 py-2.5 text-sm text-encre-200"
                  >
                    <span>
                      {d.titre}{' '}
                      <span className="text-xs text-encre-500">
                        · {LIBELLES_GENRE[d.genre]}, cible {d.cible}
                      </span>
                    </span>
                    <span className="text-xs text-encre-500">
                      échéance le {d.echeance}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

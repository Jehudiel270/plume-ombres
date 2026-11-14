// ============================================================
// app/univers/[id]/page.tsx — Détail d'un univers multi-tomes (F17),
// portage fidèle de la maquette pages/univers/[id].vue :
//
//   • LA SAGA EN UN REGARD : frise arborée des tomes (liens entre
//     tomes = personnages communs, racines = personnages visibles) ;
//   • LE DÉTAIL DU TOME : personnages, relations (mini-graphe),
//     événements — filtrés par le chapitre lu de CE tome ;
//   • LA SAGA, TOMES CONFONDUS : matrice personnage × tome,
//     chronologie inter-tomes, évolutions de relations.
//
// ANTI-SPOILERS PAR CONSTRUCTION : chaque graphe de tome passe par
// `chargerGraphe` (filtrage serveur par le chapitre découvert) ; la
// saga agrège ensuite uniquement du visible.
//
// GARDE SERVEUR : session, interrupteur `univers` (Illimité),
// PROPRIÉTAIRE. Un univers d'autrui → 404.
// ============================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import MiniGrapheTome from '@/components/univers/MiniGrapheTome';
import FriseSaga, { type TomeFrise } from '@/components/univers/FriseSaga';
import OngletsSaga from '@/components/univers/OngletsSaga';
import { chargerGraphe, TYPES_RELATION } from '@/lib/graphe';
import {
  agregerSaga,
  evenementsDuTome,
  personnagesDuTome,
  type SagaTomeSource,
} from '@/lib/univers-saga';

export const metadata = prive('Univers');

export const dynamic = 'force-dynamic';

/** Vue saga : plafond raisonnable (une saga de lecteur reste modeste). */
const PLAFOND_TOMES = 20;

type ClientServeur = Awaited<ReturnType<typeof creerClientServeur>>;

type LigneTome = {
  position: number;
  livres: {
    id: string;
    titre: string;
    auteur: string | null;
    chapitres: Array<{ id: string }> | null;
  } | null;
};

/** Positions des chapitres de PLUSIEURS livres, en une requête. */
async function positionsParLivre(
  client: ClientServeur,
  idsLivres: string[]
): Promise<Map<string, Map<string, number>>> {
  const { data } = await client
    .from('chapitres')
    .select('id, position, livre_id')
    .in('livre_id', idsLivres)
    .order('position', { ascending: true })
    .limit(4000);
  const resultat = new Map<string, Map<string, number>>();
  for (const c of ((data ?? []) as unknown as Array<{
    id: string;
    position: number;
    livre_id: string;
  }>)) {
    const carte = resultat.get(c.livre_id) ?? new Map<string, number>();
    carte.set(c.id, c.position);
    resultat.set(c.livre_id, carte);
  }
  return resultat;
}

/** Chapitres DÉCOUVERTS (lectures_xp) → position la plus avancée. */
async function positionsLuesParLivre(
  client: ClientServeur,
  idsLivres: string[],
  positionsChapitres: Map<string, Map<string, number>>
): Promise<Map<string, number>> {
  const { data } = await client
    .from('lectures_xp')
    .select('livre_id, chapitre_id')
    .in('livre_id', idsLivres)
    .limit(5000);
  const resultat = new Map<string, number>();
  for (const l of ((data ?? []) as unknown as Array<{
    livre_id: string;
    chapitre_id: string;
  }>)) {
    const position =
      positionsChapitres.get(l.livre_id)?.get(l.chapitre_id) ?? null;
    if (position !== null) {
      const courant = resultat.get(l.livre_id) ?? 0;
      if (position > courant) resultat.set(l.livre_id, position);
    }
  }
  return resultat;
}

/** Total de personnages RÉFÉRENCÉS par livre (visibles ou non). */
async function totalPersonnagesParLivre(
  client: ClientServeur,
  idsLivres: string[]
): Promise<Map<string, number>> {
  const { data } = await client
    .from('graphe_personnages')
    .select('livre_id')
    .in('livre_id', idsLivres)
    .limit(2000);
  const comptes = new Map<string, number>();
  for (const l of ((data ?? []) as unknown as Array<{ livre_id: string }>)) {
    comptes.set(l.livre_id, (comptes.get(l.livre_id) ?? 0) + 1);
  }
  return comptes;
}

export default async function PageUniversDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tome?: string | string[] }>;
}) {
  const { id } = await params;
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  const moduleVerdict = await verifierAccesModule('univers', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert) notFound();

  const [universLigne, tomes] = await Promise.all([
    supabase
      .from('univers')
      .select('id, titre, description, created_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('univers_livres')
      .select(
        'position, livres ( id, titre, auteur, chapitres ( id ) )'
      )
      .eq('univers_id', id)
      .order('position', { ascending: true })
      .limit(PLAFOND_TOMES),
  ]);

  const univers = universLigne.data as {
    id: string;
    titre: string;
    description: string | null;
  } | null;
  if (!univers) notFound();

  const lignesTomes = ((tomes.data ?? []) as unknown as LigneTome[]).filter(
    (t) => t.livres
  );
  const idsLivres = lignesTomes.map((t) => t.livres!.id);

  const positionsChapitres = idsLivres.length
    ? await positionsParLivre(supabase, idsLivres)
    : new Map<string, Map<string, number>>();
  const [positionsLues, totalsPersonnages] = idsLivres.length
    ? await Promise.all([
        positionsLuesParLivre(supabase, idsLivres, positionsChapitres),
        totalPersonnagesParLivre(supabase, idsLivres),
      ])
    : [new Map<string, number>(), new Map<string, number>()];

  // Graphe DÉJÀ FILTRÉ de chaque tome (anti-spoilers par tome).
  const tomesSources: SagaTomeSource[] = await Promise.all(
    lignesTomes.map(async (t) => {
      const livre = t.livres!;
      const positions = positionsChapitres.get(livre.id) ?? new Map();
      const chapitresLus = positionsLues.get(livre.id) ?? 0;
      const graphe = await chargerGraphe(
        supabase,
        livre.id,
        positions,
        chapitresLus
      );
      return {
        id: livre.id,
        titre: livre.titre,
        auteur: livre.auteur,
        rang: t.position,
        totalChapitres: (livre.chapitres ?? []).length,
        chapitresLus,
        totalPersonnages: totalsPersonnages.get(livre.id) ?? 0,
        graphe,
      };
    })
  );

  const saga = agregerSaga(tomesSources);

  // Tome sélectionné : ?tome=N (lien partageable), sinon le premier.
  const paramTome = await searchParams;
  const brut = Array.isArray(paramTome.tome)
    ? paramTome.tome[0]
    : paramTome.tome;
  const rangDemande = /^\d+$/.test(brut ?? '') ? Number(brut) : null;
  const tomeActif =
    tomesSources.find((t) => t.rang === rangDemande) ?? tomesSources[0] ?? null;

  const { data: profil } = await supabase
    .from('profiles')
    .select('pseudo')
    .eq('id', utilisateur.id)
    .maybeSingle();
  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  // ---------- Données de la frise ----------
  const frise: TomeFrise[] = tomesSources.map((t) => ({
    rang: t.rang,
    id: t.id,
    titre: t.titre,
    auteur: t.auteur,
    totalChapitres: t.totalChapitres,
    chapitresLus: t.chapitresLus,
    etat:
      t.totalChapitres > 0 && t.chapitresLus >= t.totalChapitres
        ? 'lu'
        : t.chapitresLus > 0
          ? 'en_cours'
          : 'non_commence',
    racines: personnagesDuTome(saga, t.rang).map((p) => p.nom),
  }));

  const titresParRang: Record<number, string> = Object.fromEntries(
    tomesSources.map((t) => [t.rang, t.titre])
  );

  // ---------- Données du détail du tome actif ----------
  const persoActifs = tomeActif ? personnagesDuTome(saga, tomeActif.rang) : [];
  const evenementsActifs = tomeActif
    ? evenementsDuTome(saga, tomeActif.rang)
    : [];

  // ---------- Statistiques de saga ----------
  const chapitresLus = tomesSources.reduce((n, t) => n + t.chapitresLus, 0);
  const chapitresTotal = tomesSources.reduce((n, t) => n + t.totalChapitres, 0);
  const relationsVisibles = tomesSources.reduce(
    (n, t) => n + t.graphe.aretes.length,
    0
  );
  const evenementsVisibles = saga.evenements.length;

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">
            <Link href="/univers" className="hover:text-grenat-300">
              Univers
            </Link>
          </p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            {univers.titre}
          </h1>
          {univers.description && (
            <p className="text-encre-500 text-sm mt-2">{univers.description}</p>
          )}
          <div className="liseret mt-3" />
        </header>

        {/* Statistiques de la saga */}
        {tomesSources.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                libelle: 'Lecture de la saga',
                valeur: `${chapitresLus} / ${chapitresTotal}`,
                note: 'chapitres découverts, tous tomes',
              },
              {
                libelle: 'Personnages visibles',
                valeur: String(saga.personnages.length),
                note: 'selon votre lecture',
              },
              {
                libelle: 'Événements visibles',
                valeur: String(evenementsVisibles),
                note: 'chronologie inter-tomes',
              },
              {
                libelle: 'Relations documentées',
                valeur: String(relationsVisibles),
                note: 'tous tomes confondus',
              },
            ].map((stat) => (
              <div key={stat.libelle} className="velours rounded-xl p-4">
                <div className="sur-titre text-encre-500">{stat.libelle}</div>
                <div className="mt-1 font-display text-2xl text-encre-100">
                  {stat.valeur}
                </div>
                <div className="mt-0.5 text-[11px] text-encre-500">
                  {stat.note}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* La saga en un regard : frise arborée des tomes */}
        {tomesSources.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-nuit-700 p-6 text-center text-sm text-encre-500">
            Aucun tome rangé pour l'instant.{' '}
            <Link href="/univers" className="underline">
              Organisez la saga
            </Link>{' '}
            depuis la liste des univers.
          </p>
        ) : (
          <>
            <section aria-labelledby="titre-frise">
              <h2 id="titre-frise" className="font-display text-xl text-encre-100 mb-3">
                La saga en un regard
              </h2>
              <FriseSaga
                universId={univers.id}
                tomes={frise}
                liens={saga.liens}
                tomeActif={tomeActif?.rang ?? 0}
              />
            </section>

            {/* Détail du tome sélectionné */}
            {tomeActif && (
              <section
                aria-labelledby="titre-detail-tome"
                className="velours rounded-2xl p-5 sm:p-6 scroll-mt-20"
                id="tome"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2
                    id="titre-detail-tome"
                    className="font-display text-2xl text-encre-100"
                  >
                    Tome {tomeActif.rang} · {tomeActif.titre}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/livres/${tomeActif.id}`}
                      className="bouton-principal min-h-9 px-4 text-sm"
                    >
                      {tomeActif.chapitresLus > 0
                        ? `Reprendre (chapitre ${Math.min(
                            tomeActif.chapitresLus + 1,
                            Math.max(1, tomeActif.totalChapitres)
                          )})`
                        : 'Ouvrir le livre'}
                    </Link>
                    <Link
                      href={`/livres/${tomeActif.id}/graphe`}
                      className="bouton-fantome min-h-9 px-4 text-sm border border-nuit-700"
                    >
                      Graphe du tome
                    </Link>
                  </div>
                </div>
                <p className="mt-1 text-xs text-encre-500">
                  {tomeActif.auteur && <>de {tomeActif.auteur} · </>}
                  {tomeActif.totalChapitres} chapitre
                  {tomeActif.totalChapitres > 1 ? 's' : ''} · contenu filtré
                  jusqu'au chapitre {tomeActif.chapitresLus}
                </p>

                <div className="mt-5 grid gap-7 lg:grid-cols-2">
                  {/* Personnages du tome */}
                  <div>
                    <h3 className="font-display text-lg text-encre-100">
                      Personnages du tome
                    </h3>
                    {persoActifs.length === 0 ? (
                      <p className="mt-3 text-sm text-encre-500 italic">
                        Aucun personnage documenté à ce stade : enrichissez le
                        graphe du tome au fil de votre lecture.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {persoActifs.slice(0, 8).map((personnage) => (
                          <li
                            key={personnage.cle}
                            className="flex items-start gap-3 rounded-lg border border-nuit-700 bg-nuit-850 p-3"
                          >
                            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-grenat-700 text-[11px] font-semibold text-encre-100">
                              {personnage.nom.slice(0, 2).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-encre-100">
                                {personnage.nom}
                              </div>
                              {personnage.description && (
                                <div className="mt-0.5 text-[13px] leading-snug text-encre-300">
                                  {personnage.description}
                                </div>
                              )}
                              <div className="mt-1 text-[11px] text-encre-500">
                                {(personnage.apparitions[tomeActif.rang] ?? 0) > 0 ||
                                (personnage.liens[tomeActif.rang] ?? 0) > 0
                                  ? `${personnage.apparitions[tomeActif.rang] ?? 0} événement${
                                      (personnage.apparitions[tomeActif.rang] ?? 0) > 1
                                        ? 's'
                                        : ''
                                    } · ${
                                      personnage.liens[tomeActif.rang] ?? 0
                                    } relation${
                                      (personnage.liens[tomeActif.rang] ?? 0) > 1
                                        ? 's'
                                        : ''
                                    }`
                                  : 'Présent dès le début'}
                              </div>
                            </div>
                          </li>
                        ))}
                        {persoActifs.length > 8 && (
                          <li className="text-[12px] text-encre-500">
                            et {persoActifs.length - 8} autre
                            {persoActifs.length - 8 > 1 ? 's' : ''}…
                          </li>
                        )}
                      </ul>
                    )}
                    {saga.personnagesMasquesParTome[tomeActif.rang] > 0 && (
                      <p className="mt-2 text-[12px] text-encre-500">
                        {saga.personnagesMasquesParTome[tomeActif.rang]}{' '}
                        personnage
                        {saga.personnagesMasquesParTome[tomeActif.rang] > 1
                          ? 's'
                          : ''}{' '}
                        encore masqué
                        {saga.personnagesMasquesParTome[tomeActif.rang] > 1
                          ? 's'
                          : ''}{' '}
                        par votre progression.
                      </p>
                    )}
                  </div>

                  {/* Relations du tome (mini-graphe) */}
                  <div>
                    <h3 className="font-display text-lg text-encre-100">
                      Relations du tome
                    </h3>
                    {tomeActif.graphe.aretes.length === 0 ? (
                      <p className="mt-3 text-sm text-encre-500 italic">
                        Aucune relation documentée jusqu'ici.
                      </p>
                    ) : (
                      <div className="mt-3">
                        <MiniGrapheTome
                          noeuds={tomeActif.graphe.noeuds}
                          aretes={tomeActif.graphe.aretes}
                        />
                        <ul className="mt-3 space-y-1.5 text-[13px] text-encre-300">
                          {tomeActif.graphe.aretes.slice(0, 6).map((arete) => {
                            const nom = new Map(
                              tomeActif.graphe.noeuds.map(
                                (n) => [n.id, n.nom] as const
                              )
                            );
                            return (
                              <li key={arete.id}>
                                <span
                                  className="rounded-full px-2 py-0.5 text-[11px]"
                                  style={{
                                    background: `${TYPES_RELATION[arete.type].couleur}22`,
                                    color: TYPES_RELATION[arete.type].couleur,
                                  }}
                                >
                                  {TYPES_RELATION[arete.type].libelle}
                                </span>{' '}
                                <span className="text-encre-100">
                                  {nom.get(arete.origineId)} → {nom.get(arete.destinationId)}
                                </span>{' '}
                                · {arete.libelle}
                                {arete.etat && (
                                  <span className="text-encre-500"> · {arete.etat}</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Événements du tome */}
                {evenementsActifs.length > 0 && (
                  <div className="mt-7">
                    <h3 className="font-display text-lg text-encre-100">
                      Événements du tome
                    </h3>
                    <ol className="mt-3 space-y-2">
                      {evenementsActifs.map((evenement) => (
                        <li
                          key={`${evenement.tome}-${evenement.chapitre}-${evenement.titre}`}
                          className="rounded-lg border border-nuit-700 bg-nuit-850 p-3"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-encre-100">
                              {evenement.titre}
                            </span>
                            <span className="text-[11px] text-encre-500">
                              Chapitre {evenement.chapitre}
                            </span>
                          </div>
                          {evenement.texte && (
                            <p className="mt-0.5 text-[13px] text-encre-300">
                              {evenement.texte}
                            </p>
                          )}
                          {evenement.personnages.length > 0 && (
                            <p className="mt-1 text-[11px] text-encre-500">
                              {evenement.personnages.join(', ')}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </section>
            )}

            {/* La saga, tomes confondus */}
            <section aria-labelledby="titre-tomes-confondus">
              <h2
                id="titre-tomes-confondus"
                className="font-display text-xl text-encre-100 mb-1"
              >
                La saga, tomes confondus
              </h2>
              <p className="mb-4 text-sm text-encre-500">
                Personnages, chronologie et relations qui traversent les tomes —
                chaque information reste filtrée par le chapitre lu de son tome.
              </p>
              <OngletsSaga saga={saga} titresParRang={titresParRang} />
            </section>

            <p className="text-xs text-encre-500">
              L'ordre des tomes est le vôtre : la saga se lit comme vous l'avez
              rangée. Aucun contenu ne débordera du tome où vous en êtes.
            </p>
          </>
        )}
      </main>
    </>
  );
}

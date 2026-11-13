// ============================================================
// app/progression/page.tsx — XP, rangs et badges (A17).
//
// Progression NON PUNITIVE : rangs franchis, jauge discrète,
// badges-souvenirs d'usage. Aucun classement entre comptes, aucune
// relance, rien ne baisse jamais.
//
// GARDE SERVEUR : interrupteur `progression` évalué ICI — module
// fermé → 404. Les données viennent du compte (RLS « own »).
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { niveauPlanDepuisCode } from '@/lib/fonctionnalites/registre';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  BADGES,
  RANGS,
  badgesPour,
  progressionRang,
  rangDepuisXp,
} from '@/lib/xp';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';

export const metadata = prive('Progression de lecture');

export const dynamic = 'force-dynamic';

export default async function PageProgression() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  // Barrière fine : module fermé ou plan insuffisant → 404.
  const module = await verifierAccesModule('progression', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!module.ouvert) notFound();

  const abonne = niveauPlanDepuisCode(
    planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT
  ) !== 'gratuit';

  // Compteurs du compte (RLS « own »), puis règles pures.
  const [xpLues, carnet, theories, personnages, traduits] = await Promise.all([
    supabase.from('lectures_xp').select('xp').limit(5000),
    supabase.from('carnet_notes').select('id', { count: 'exact', head: true }),
    supabase.from('theories').select('id', { count: 'exact', head: true }),
    supabase.from('graphe_personnages').select('id', { count: 'exact', head: true }),
    supabase.from('livres').select('id', { count: 'exact', head: true }).eq('statut', 'traduit'),
  ]);
  const xp = (xpLues.data ?? []).reduce(
    (somme, l) => somme + ((l as { xp: number }).xp || 0),
    0
  );
  const rang = rangDepuisXp(xp);
  const jauge = progressionRang(xp);
  const codes = badgesPour({
    chapitres: xpLues.data?.length ?? 0,
    carnet: carnet.count ?? 0,
    theories: theories.count ?? 0,
    personnages: personnages.count ?? 0,
    livresTraduits: traduits.count ?? 0,
    abonne,
  });
  const obtenus = new Set(codes);

  const { data: profil } = await supabase
    .from('profiles')
    .select('pseudo')
    .eq('id', utilisateur.id)
    .maybeSingle();
  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">Progression</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">Votre chemin de lecture</h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Une progression d’atelier : rien ne baisse jamais, rien ne se
            compare entre comptes. Chaque chapitre découvert pour la première
            fois fait avancer — relire reste libre, sans récompense ni punition.
          </p>
        </header>

        {/* Rang courant */}
        <section className="velours p-6 rounded-2xl space-y-4" aria-labelledby="titre-rang">
          <h2 id="titre-rang" className="sur-titre text-encre-300">
            Rang {rang.niveau} — <span className="text-encre-100">{rang.nom}</span>
          </h2>
          <div className="h-2.5 rounded-full bg-nuit-800 overflow-hidden" role="presentation">
            <div
              className="h-full bg-grenat-600 rounded-full transition-all"
              style={{ width: `${Math.round(jauge * 100)}%` }}
            />
          </div>
          <p className="text-xs text-encre-500">
            {xp} XP · {xpLues.data?.length ?? 0} chapitre
            {(xpLues.data?.length ?? 0) > 1 ? 's' : ''} découvert
            {(xpLues.data?.length ?? 0) > 1 ? 's' : ''}
            {rang.niveau < RANGS.length &&
              ` — prochain rang à ${RANGS[rang.niveau].seuil} XP`}
          </p>
        </section>

        {/* Badges */}
        <section className="space-y-4" aria-labelledby="titre-badges">
          <h2 id="titre-badges" className="sur-titre text-encre-300">
            Badges-souvenirs
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BADGES.map((b) => {
              const eu = obtenus.has(b.code);
              return (
                <li
                  key={b.code}
                  className={`p-4 rounded-2xl border ${
                    eu
                      ? 'velours border-grenat-700/60'
                      : 'border-nuit-700/60 opacity-55'
                  }`}
                >
                  <p className="text-sm text-encre-100">
                    {b.nom} {eu && <span className="text-grenat-400 text-xs">· obtenu</span>}
                  </p>
                  <p className="text-xs text-encre-500 mt-1">{b.description}</p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Les 12 rangs */}
        <section className="space-y-3" aria-labelledby="titre-rangs">
          <h2 id="titre-rangs" className="sur-titre text-encre-300">
            Les douze rangs
          </h2>
          <ol className="grid gap-2 sm:grid-cols-2">
            {RANGS.map((r) => (
              <li
                key={r.niveau}
                className={`text-sm flex items-center gap-2 rounded-xl px-4 py-2 border ${
                  r.niveau === rang.niveau
                    ? 'border-grenat-600 text-encre-100 velours'
                    : 'border-nuit-700/60 text-encre-400'
                }`}
              >
                <span className="text-xs text-encre-500 w-6">{r.niveau}</span>
                <span>{r.nom}</span>
                <span className="ml-auto text-xs text-encre-500">{r.seuil} XP</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}

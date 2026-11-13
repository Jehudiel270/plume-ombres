// ============================================================
// app/progression/plume/page.tsx — La plume et ses familiers (A17).
//
// La plume du lecteur change d'apparence à chaque rang franchi
// (douze apparences, une par rang) et chaque rang débloque un
// FAMILIER compagnon — purement cosmétique, jamais conditionnant :
// aucun achat, aucune loterie, rien ne se perd. Le familier choisi
// est une préférence d'affichage locale (aucune donnée personnelle
// ne quitte le compte).
//
// GARDE SERVEUR : interrupteur `progression` (sous-chemin couvert).
// ============================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { progressionRang, rangDepuisXp } from '@/lib/xp';
import {
  APPARENCES_PLUME,
  apparencePourNiveau,
  FAMILIERS,
  familiersDebloques,
} from '@/lib/plume';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import ChoixFamilier from '@/components/progression/ChoixFamilier';

export const metadata = prive('Votre plume');

export const dynamic = 'force-dynamic';

export default async function PagePlume() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  const moduleVerdict = await verifierAccesModule('progression', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert) notFound();

  const { data: xpLignes } = await supabase
    .from('lectures_xp')
    .select('xp')
    .limit(5000);
  const xp = ((xpLignes ?? []) as unknown as Array<{ xp: number }>).reduce(
    (somme, l) => somme + (l.xp || 0),
    0
  );
  const rang = rangDepuisXp(xp);
  const jauge = progressionRang(xp);
  const apparence = apparencePourNiveau(rang.niveau);
  const debloques = familiersDebloques(rang.niveau);

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
          <p className="sur-titre text-grenat-400">
            <Link href="/progression" className="hover:text-grenat-300">
              Progression
            </Link>
          </p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            Votre plume, vos compagnons
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Tout ici est purement décoratif : la plume change avec le rang,
            les familiers se débloquent en lisant. Aucun achat, aucune
            loterie, rien ne se perd jamais.
          </p>
        </header>

        {/* La plume du rang courant */}
        <section className="velours p-6 rounded-2xl" aria-labelledby="titre-plume">
          <h2 id="titre-plume" className="sur-titre text-encre-300">
            Rang {rang.niveau} — {rang.nom}
          </h2>
          <div className="mt-4 flex flex-col sm:flex-row items-start gap-6">
            <div
              className="shrink-0 grid place-items-center h-28 w-28 rounded-full border"
              style={{
                borderColor: apparence.lueur,
                boxShadow: `0 0 32px ${apparence.lueur}`,
                background: `radial-gradient(circle at 35% 30%, ${apparence.vers}, ${apparence.du})`,
              }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="rgba(10,10,14,.55)" strokeWidth="1.4">
                <path d="M20 4c-5 0-11 3-13.5 8.5L4 20l7.5-2.5C17 15 20 9 20 4Z" fill="rgba(10,10,14,.25)" />
                <path d="M4 20 14 10" />
                <path d="M11 13c1.5-1 4-1.2 6 0-2 .3-4 1-6 0Z" fill="rgba(10,10,14,.35)" stroke="none" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-display text-xl text-encre-100">
                Plume « {apparence.nom} »
              </p>
              <p className="mt-1 text-sm text-encre-400 italic">{apparence.legende}</p>
              <div
                className="mt-3 h-2.5 rounded-full bg-nuit-800 overflow-hidden max-w-xs"
                role="presentation"
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round(jauge * 100)}%`,
                    background: `linear-gradient(90deg, ${apparence.du}, ${apparence.vers})`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-xs text-encre-500">
                {xp} XP — la plume se teinte encore au prochain rang.
              </p>
            </div>
          </div>
        </section>

        {/* Les douze apparences */}
        <section className="space-y-3" aria-labelledby="titre-apparences">
          <h2 id="titre-apparences" className="sur-titre text-encre-300">
            Les douze apparences
          </h2>
          <ol className="grid gap-2 sm:grid-cols-2">
            {APPARENCES_PLUME.map((a) => {
              const eu = a.niveau <= rang.niveau;
              return (
                <li
                  key={a.niveau}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${
                    eu ? 'border-nuit-600' : 'border-nuit-800 opacity-50'
                  }`}
                >
                  <span
                    className="h-6 w-6 shrink-0 rounded-full border"
                    style={{
                      background: `linear-gradient(135deg, ${a.vers}, ${a.du})`,
                      borderColor: a.lueur,
                    }}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-encre-200">{a.nom}</span>
                  <span className="ml-auto text-[11px] text-encre-500">
                    {eu ? 'atteint' : `rang ${a.niveau}`}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Familiers */}
        <section className="space-y-3" aria-labelledby="titre-familiers">
          <h2 id="titre-familiers" className="sur-titre text-encre-300">
            Compagnons de lecture
          </h2>
          <ChoixFamilier familiers={FAMILIERS} debloques={debloques.map((f) => f.code)} />
        </section>
      </main>
    </>
  );
}

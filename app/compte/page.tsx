// Compte (C6) — le vrai profil : identité (pseudo modifiable), apparence,
// favoris, déconnexion et suppression de compte.
// Page privée : renvoie vers /connexion si la session est absente.
//
// Les parties interactives vivent dans components/profil/ (client) ;
// cette page reste un composant serveur : elle lit la session et les
// données, puis rend la coquille. L'adresse e-mail reste en lecture seule
// (son changement exige une confirmation par courriel, hors périmètre).

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';
import { lireQuotaRestant, quotaMensuel, MagasinQuotaSupabase } from '@/lib/quota';
import { libelleCaracteres } from '@/lib/abonnement';
import BarreNavigation from '@/components/BarreNavigation';
import CarteIdentite from '@/components/profil/CarteIdentite';
import ReglagesApparence from '@/components/profil/ReglagesApparence';
import ActionsCompte from '@/components/profil/ActionsCompte';
import type { Livre, StatutLivre } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Mon compte',
  description:
    'Identité, apparence, favoris, déconnexion et suppression de votre compte.',
};

const ETIQUETTES_STATUT: Record<StatutLivre, string> = {
  importe: 'Importé',
  pret: 'Prêt à traduire',
  en_traduction: 'En traduction',
  traduit: 'Traduit',
  erreur: 'Erreurs à reprendre',
};

const COULEURS_STATUT: Record<StatutLivre, string> = {
  importe: 'bg-encre-500/15 text-encre-300',
  pret: 'bg-violet-rom-500/15 text-violet-rom-300',
  en_traduction: 'bg-grenat-500/15 text-grenat-300',
  traduit: 'bg-emerald-500/15 text-emerald-300',
  erreur: 'bg-amber-500/15 text-amber-300',
};

interface LigneFavori {
  id: string;
  livre_id: string;
  created_at: string;
}

export default async function PageCompte() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) redirect('/connexion?suivant=/compte');

  const supabase = await creerClientServeur();

  const [
    { data: profil },
    { count: nbLivres },
    { count: nbFavoris },
    { data: favoris },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('pseudo, created_at')
      .eq('id', utilisateur.id)
      .maybeSingle(),
    supabase
      .from('livres')
      .select('id', { count: 'exact', head: true })
      .eq('proprietaire_id', utilisateur.id),
    supabase
      .from('favorites')
      .select('id', { count: 'exact', head: true })
      .eq('proprietaire_id', utilisateur.id),
    supabase
      .from('favorites')
      .select('id, livre_id, created_at')
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');
  const depuis =
    (profil as { created_at?: string } | null)?.created_at ??
    utilisateur.created_at;

  // Favoris : les titres viennent d'une seconde requête (les livres et les
  // favoris sont tous deux filtrés par RLS sur le propriétaire).
  const lignes = (favoris ?? []) as LigneFavori[];
  const ids = lignes.map((l) => l.livre_id);
  const { data: livres } = ids.length
    ? await supabase
        .from('livres')
        .select('id, titre, auteur, statut, langue_source, langue_cible')
        .in('id', ids)
    : { data: [] as Livre[] };

  const parId = new Map((livres ?? []).map((l) => [l.id, l as Livre]));
  const favorisVisibles = lignes
    .map((l) => parId.get(l.livre_id))
    .filter((l): l is Livre => Boolean(l));

  // Quota mensuel RÉEL : cette page affirmait « aucun plafond de
  // traduction n'est appliqué » alors que public.usage_mensuel est bien
  // décompté et que le plafond est refusé au-delà (402 QUOTA_DEPASSE).
  const usageQuota = await lireQuotaRestant(
    new MagasinQuotaSupabase(supabase),
    utilisateur.id,
    new Date(),
    quotaMensuel()
  ).catch(() => null);

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 animate-fondu-monte">
        <div>
          <p className="sur-titre text-grenat-400">Mon compte</p>
          <h1 className="font-display text-3xl sm:text-4xl text-encre-100 mt-2">
            {pseudo}
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Votre atelier, vos textes, vos droits.
          </p>
        </div>

        <div className="space-y-4 mt-8">
          {/* ---------------- Identité ---------------- */}
          <CarteIdentite
            pseudoInitial={pseudo}
            email={utilisateur.email ?? ''}
            depuis={depuis ?? null}
            nbLivres={nbLivres ?? 0}
            nbFavoris={nbFavoris ?? 0}
          />

          {/* ---------------- Apparence ---------------- */}
          <ReglagesApparence />

          {/* ---------------- Favoris ---------------- */}
          <section className="velours p-6" aria-label="Favoris">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="sur-titre text-encre-300">
                Favoris{' '}
                <span className="text-encre-500 normal-case tracking-normal">
                  ({nbFavoris ?? 0})
                </span>
              </p>
              <Link href="/favoris" className="lien-discret text-sm underline">
                Tout voir
              </Link>
            </div>

            {favorisVisibles.length === 0 ? (
              <p className="text-encre-500 text-sm mt-4 leading-relaxed italic">
                Aucun livre sous l’étoile pour l’instant. Depuis la bibliothèque,
                touchez l’étoile d’une carte pour l’épingler ici.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {favorisVisibles.map((livre) => (
                  <li key={livre.id}>
                    <Link
                      href={`/livres/${livre.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-nuit-700/60 px-3 py-2.5 hover:border-grenat-600/70 transition-colors !no-underline"
                    >
                      <span className="min-w-0">
                        <span className="block text-encre-100 text-sm leading-snug truncate">
                          {livre.titre}
                        </span>
                        <span className="block text-encre-500 text-[11px] truncate">
                          {livre.auteur ? `${livre.auteur} · ` : ''}
                          {livre.langue_source.toUpperCase()} →{' '}
                          {livre.langue_cible.toUpperCase()}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-[10px] uppercase tracking-wider rounded-full px-2.5 py-1 ${COULEURS_STATUT[livre.statut]}`}
                      >
                        {ETIQUETTES_STATUT[livre.statut]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------------- Offre en cours ---------------- */}
          <section className="velours p-6" aria-label="Offre en cours">
            <p className="sur-titre text-encre-300">Offre en cours</p>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <span className="rounded-full px-3 py-1 text-[11px] uppercase tracking-wider bg-grenat-500/15 text-grenat-300">
                offre de lancement
              </span>
              <span className="font-display text-2xl text-encre-100">0 €</span>
              <span className="text-encre-500 text-xs">
                aucun moyen de paiement demandé
              </span>
            </div>
            <p className="text-encre-300 text-sm mt-4 leading-relaxed">
              {usageQuota ? (
                <>
                  Il vous reste{' '}
                  <strong className="text-encre-100">
                    {libelleCaracteres(usageQuota.restant)}
                  </strong>{' '}
                  sur les {usageQuota.limite.toLocaleString('fr-FR')} de ce
                  mois ({usageQuota.utilise.toLocaleString('fr-FR')}{' '}
                  consommés). Le compteur est remis à zéro le 1
                  <sup>er</sup> de chaque mois, et vos crédits prépayés
                  prennent le relais sans jamais interrompre un livre.{' '}
                  <Link href="/abonnement" className="lien-discret underline">
                    Voir le détail sur ma page d’abonnement
                  </Link>
                  .
                </>
              ) : (
                <>
                  Votre compteur de traduction n’a pas pu être lu à
                  l’instant.{' '}
                  <Link href="/abonnement" className="lien-discret underline">
                    Ouvrir ma page d’abonnement
                  </Link>
                  .
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-5">
              <span className="rounded-full border border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300 text-[10px] uppercase tracking-wider px-2.5 py-1">
                premium — bientôt disponible
              </span>
              <Link href="/tarifs" className="lien-discret text-sm underline">
                Voir ce que le Premium contiendra
              </Link>
            </div>
          </section>

          {/* ---------------- Compte & données ---------------- */}
          <ActionsCompte email={utilisateur.email ?? ''} />

          <section className="velours p-6" aria-label="Vos livres">
            <p className="sur-titre text-encre-300">Vos livres</p>
            <ul className="mt-4 space-y-3 text-sm text-encre-300 leading-relaxed">
              <li>
                <strong className="text-encre-100">Supprimer un livre</strong> :
                depuis la bibliothèque (« Supprimer »). Le livre, ses chapitres,
                ses segments et ses traductions sont effacés.{' '}
                <Link href="/bibliotheque" className="lien-discret underline">
                  Ouvrir ma bibliothèque
                </Link>
              </li>
              <li>
                <strong className="text-encre-100">
                  Qui voit mon texte
                </strong>{' '}
                : le détail des moteurs de traduction est dans la{' '}
                <Link href="/confidentialite" className="lien-discret underline">
                  politique de confidentialité
                </Link>
                .
              </li>
            </ul>
          </section>

          {/* ---------------- Textes du cadre légal ---------------- */}
          <section className="velours p-6" aria-label="Textes légaux">
            <p className="sur-titre text-encre-300">Documents</p>
            <div className="flex flex-wrap gap-3 mt-4 text-sm">
              <Link href="/conditions" className="lien-discret underline">
                Conditions générales
              </Link>
              <Link href="/confidentialite" className="lien-discret underline">
                Confidentialité
              </Link>
              <Link href="/mentions-legales" className="lien-discret underline">
                Mentions légales
              </Link>
              <Link href="/faq" className="lien-discret underline">
                FAQ
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

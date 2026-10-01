// Compte (C6) — profil, offre en cours, usage et droits sur les données.
// Page privée : renvoie vers /connexion si la session est absente.
// Aucun bouton de paiement, aucun bouton de suppression fictif : la
// suppression définitive se demande (elle n'a pas encore de route dédiée).

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { creerClientServeur, utilisateurConnecte } from '@/lib/supabase/server';
import BarreNavigation from '@/components/BarreNavigation';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mon compte',
  description: 'Profil, offre en cours, usage et droits sur vos données.',
};

export default async function PageCompte() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) redirect('/connexion?suivant=/compte');

  const supabase = await creerClientServeur();

  const [{ data: profil }, { count: nbLivres }, { count: nbFavoris }] =
    await Promise.all([
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
    ]);

  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');
  const depuis =
    (profil as { created_at?: string } | null)?.created_at ?? utilisateur.created_at;

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
          <section className="velours p-6" aria-label="Profil">
            <p className="sur-titre text-encre-300">Profil</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex flex-wrap gap-x-3">
                <dt className="text-encre-500 w-36">Pseudo</dt>
                <dd className="text-encre-100">{pseudo}</dd>
              </div>
              <div className="flex flex-wrap gap-x-3">
                <dt className="text-encre-500 w-36">Adresse e-mail</dt>
                <dd className="text-encre-100 break-all">
                  {utilisateur.email ?? '—'}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-3">
                <dt className="text-encre-500 w-36">Compte créé le</dt>
                <dd className="text-encre-100">
                  {depuis
                    ? new Date(depuis).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : '—'}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-3">
                <dt className="text-encre-500 w-36">Livres</dt>
                <dd className="text-encre-100">{nbLivres ?? 0}</dd>
              </div>
              <div className="flex flex-wrap gap-x-3">
                <dt className="text-encre-500 w-36">Favoris</dt>
                <dd className="text-encre-100">{nbFavoris ?? 0}</dd>
              </div>
            </dl>
            <p className="text-encre-500 text-xs mt-4 leading-relaxed italic">
              Le pseudo et l’adresse e-mail ne se modifient pas encore depuis cette page
              (chantier prévu). En attendant, toute correction passe par la page Contact.
            </p>
          </section>

          {/* ---------------- Offre en cours ---------------- */}
          <section className="velours p-6" aria-label="Offre en cours">
            <p className="sur-titre text-encre-300">Offre en cours</p>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <span className="rounded-full px-3 py-1 text-[11px] uppercase tracking-wider bg-grenat-500/15 text-grenat-300">
                offre de lancement
              </span>
              <span className="font-display text-2xl text-encre-100">0 €</span>
              <span className="text-encre-500 text-xs">aucun moyen de paiement demandé</span>
            </div>
            <p className="text-encre-300 text-sm mt-4 leading-relaxed">
              Aucun plafond de traduction n’est appliqué pour l’instant. L’offre de
              lancement prévoit un garde-fou (un livre complet par mois, jamais interrompu
              au milieu) : il n’est pas encore activé et vous serez prévenu avant qu’il ne
              le soit.
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

          {/* ---------------- Données ---------------- */}
          <section className="velours p-6" aria-label="Vos données">
            <p className="sur-titre text-encre-300">Vos données</p>
            <ul className="mt-4 space-y-3 text-sm text-encre-300 leading-relaxed">
              <li>
                <strong className="text-encre-100">Supprimer un livre</strong> : depuis la
                bibliothèque (« Supprimer »). Le livre, ses chapitres, ses segments et ses
                traductions sont effacés.{' '}
                <Link href="/bibliotheque" className="lien-discret underline">
                  Ouvrir ma bibliothèque
                </Link>
              </li>
              <li>
                <strong className="text-encre-100">Effacement du compte et des données</strong>{' '}
                : la demande se fait par écrit (page{' '}
                <Link href="/contact" className="lien-discret underline">
                  Contact
                </Link>
                ). Il n’existe pas encore de bouton automatisé — annoncé, pas encore livré ;
                nous préférons vous le dire plutôt que d’afficher un bouton qui ne fait
                rien.
              </li>
              <li>
                <strong className="text-encre-100">Qui voit mon texte</strong> : le détail
                des moteurs de traduction est dans la{' '}
                <Link href="/confidentialite" className="lien-discret underline">
                  politique de confidentialité
                </Link>
                .
              </li>
              <li>
                <strong className="text-encre-100">Préférences de lecture</strong> : police,
                taille, thème et position de lecture restent dans votre navigateur.
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

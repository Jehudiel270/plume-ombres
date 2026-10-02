// Pied de page commun à TOUTES les pages publiques (accueil, tarifs,
// FAQ, contact et pages légales).
//
// Composant volontairement autonome : aucun état, aucune session, aucun
// « use client ». Il doit rester lisible AVANT toute inscription — c'est
// même sa raison d'être : les pages légales (conditions, confidentialité,
// mentions légales) ne sont atteignables que par lui, et une page qu'on
// ne peut pas ouvrir n'existe pas.
//
// Charte : uniquement les jetons du design system (--color-*, font-display,
// .velours, .lien-discret, .sur-titre, .liseret, .texte-douche).

import Link from 'next/link';

type Lien = { href: string; libelle: string };

const LE_STUDIO: Lien[] = [
  { href: '/', libelle: 'Accueil' },
  { href: '/tarifs', libelle: 'Tarifs' },
  { href: '/faq', libelle: 'Questions fréquentes' },
  { href: '/contact', libelle: 'Nous écrire' },
];

const CADRE_LEGAL: Lien[] = [
  { href: '/conditions', libelle: 'Conditions générales (CGU/CGV)' },
  { href: '/confidentialite', libelle: 'Politique de confidentialité' },
  { href: '/mentions-legales', libelle: 'Mentions légales' },
];

const MON_ESPACE: Lien[] = [
  { href: '/bibliotheque', libelle: 'Ma bibliothèque' },
  { href: '/favoris', libelle: 'Mes favoris' },
  { href: '/compte', libelle: 'Mon compte' },
  { href: '/connexion', libelle: 'Se connecter ou créer un compte' },
];

const COLONNES: { titre: string; liens: Lien[] }[] = [
  { titre: 'Le studio', liens: LE_STUDIO },
  { titre: 'Cadre légal', liens: CADRE_LEGAL },
  { titre: 'Mon espace', liens: MON_ESPACE },
];

export default function PiedDePage() {
  return (
    <footer
      className="mt-20 border-t border-nuit-700/60"
      aria-label="Pied de page"
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {/* Marque + rappel honnête du positionnement produit. */}
        <div className="lg:pr-6">
          <p className="font-display text-xl text-encre-100">
            Plume <span className="texte-douche italic">d’Ombres</span>
          </p>
          <div className="liseret mt-3 !w-16" />
          <p className="mt-3 text-note italic leading-relaxed text-encre-500">
            Studio personnel de traduction littéraire pour la dark romance. Vos
            textes restent les vôtres — chaque compte ne voit que ses propres
            livres.
          </p>
          <p className="mt-3 text-micro uppercase tracking-[0.14em] text-encre-500">
            Contenu adulte — public majeur
          </p>
        </div>

        {COLONNES.map((colonne) => (
          <nav key={colonne.titre} aria-label={colonne.titre}>
            <h2 className="sur-titre text-encre-300">{colonne.titre}</h2>
            <ul className="mt-4 space-y-2.5">
              {colonne.liens.map((lien) => (
                <li key={lien.href}>
                  <Link href={lien.href} className="lien-discret text-note">
                    {lien.libelle}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-nuit-700/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-micro text-encre-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © 2026 Plume d’Ombres — projet indépendant, sans lien
            d’affiliation avec les ayants droit des œuvres importées.
          </p>
          <p>
            Offre payante{' '}
            <span className="text-grenat-300">bientôt disponible</span> — le
            studio est entièrement gratuit pendant le lancement.
          </p>
        </div>

        {/* Rappel : le cadre légal est lisible sans créer de compte. */}
        <div className="mx-auto max-w-6xl px-4 pb-6 text-micro leading-relaxed text-encre-500 sm:px-6">
          Pages légales lisibles{' '}
          <strong className="font-semibold text-encre-300">
            sans compte
          </strong>{' '}
          :{' '}
          {CADRE_LEGAL.map((lien, i) => (
            <span key={lien.href}>
              {i > 0 && ' · '}
              <Link href={lien.href} className="lien-discret underline">
                {lien.libelle}
              </Link>
            </span>
          ))}
          .
        </div>
      </div>
    </footer>
  );
}

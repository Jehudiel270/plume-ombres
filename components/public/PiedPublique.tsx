// Pied de page commun aux pages publiques : plan du site + rappel
// honnête (l'offre payante n'est pas encore ouverte) + renvoi vers les
// pages légales rédigées en gabarit.

import Link from 'next/link';

const COLONNES: { titre: string; liens: { href: string; libelle: string }[] }[] = [
  {
    titre: 'Le studio',
    liens: [
      { href: '/tarifs', libelle: 'Tarifs' },
      { href: '/faq', libelle: 'Questions fréquentes' },
      { href: '/contact', libelle: 'Nous écrire' },
    ],
  },
  {
    titre: 'Cadre légal',
    liens: [
      { href: '/conditions', libelle: 'Conditions générales (CGU/CGV)' },
      { href: '/confidentialite', libelle: 'Confidentialité' },
      { href: '/mentions-legales', libelle: 'Mentions légales' },
    ],
  },
  {
    titre: 'Mon espace',
    liens: [
      { href: '/bibliotheque', libelle: 'Ma bibliothèque' },
      { href: '/favoris', libelle: 'Mes favoris' },
      { href: '/compte', libelle: 'Mon compte' },
    ],
  },
];

export default function PiedPublique() {
  return (
    <footer className="border-t border-nuit-700/60 mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-xl text-encre-100">
            Plume <span className="texte-douche italic">d’Ombres</span>
          </p>
          <div className="liseret mt-3 !w-16" />
          <p className="text-encre-500 text-[13px] mt-3 leading-relaxed italic">
            Studio personnel de traduction littéraire pour la dark romance.
            Vos textes restent les vôtres.
          </p>
        </div>

        {COLONNES.map((colonne) => (
          <nav key={colonne.titre} aria-label={colonne.titre}>
            <p className="sur-titre text-encre-300">{colonne.titre}</p>
            <ul className="mt-3 space-y-2">
              {colonne.liens.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="lien-discret text-sm">
                    {l.libelle}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-nuit-700/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-encre-500">
          <p>© 2026 Plume d’Ombres — projet indépendant, sans lien d’affiliation.</p>
          <p>
            Offre payante <span className="text-grenat-300">bientôt disponible</span> — le
            studio est entièrement gratuit pendant le lancement.
          </p>
        </div>
      </div>
    </footer>
  );
}

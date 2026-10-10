// Sommaire des pages légales : le même bloc en tête (et en pied) des pages
// du cadre légal — conditions, confidentialité, remboursement, cookies,
// mentions légales — pour qu'elles se lisent comme un ensemble cohérent et
// qu'on passe de l'une à l'autre sans repasser par le menu. Composant
// serveur, sans état : la page active est passée en prop, la mise en
// évidence utilise aria-current.

import Link from 'next/link';

export type PageLegale =
  | 'conditions'
  | 'confidentialite'
  | 'remboursement'
  | 'cookies'
  | 'mentions-legales';

const PAGES: { id: PageLegale; href: string; libelle: string }[] = [
  { id: 'conditions', href: '/conditions', libelle: 'Conditions générales' },
  { id: 'confidentialite', href: '/confidentialite', libelle: 'Confidentialité' },
  { id: 'remboursement', href: '/remboursement', libelle: 'Remboursement' },
  { id: 'cookies', href: '/cookies', libelle: 'Cookies' },
  { id: 'mentions-legales', href: '/mentions-legales', libelle: 'Mentions légales' },
];

interface Props {
  /** Page courante : elle est annoncée « aria-current="page" ». */
  actif: PageLegale;
}

export default function SommaireLegal({ actif }: Props) {
  return (
    <nav aria-label="Pages légales" className="velours p-4 sm:p-5">
      <p className="sur-titre text-grenat-400">Cadre légal</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {PAGES.map((page) => {
          const courant = page.id === actif;
          return (
            <li key={page.id}>
              <Link
                href={page.href}
                aria-current={courant ? 'page' : undefined}
                className={`bouton-fantome !px-4 !py-1.5 text-note ${
                  courant ? '!border-grenat-500/70 !text-encre-100' : ''
                }`}
              >
                {page.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

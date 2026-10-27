// Politique de cookies (C6) — page publique de travail. Décrit, sans
// jargon, les seuls cookies et stockages locaux réellement utilisés par le
// studio. Lisible SANS compte, cohérente avec la politique de confidentialité.
// L'éditeur (VICE LYNX) est identifié sur la page Mentions légales : cette page
// n'en donne pas un second jeu de coordonnées, elle y renvoie.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import SommaireLegal from '@/components/public/SommaireLegal';

export const metadata: Metadata = {
  title: 'Cookies',
  description:
    'Quels cookies et stockages locaux Plume d’Ombres (VICE LYNX) utilise : le cookie de session nécessaire à l’authentification, les préférences de lecture gardées dans le navigateur, et l’absence de traceur publicitaire.',
};

export default function PageCookies() {
  return (
    <>
      <SectionPublique
        niveau={1}
        gabarit="etroit"
        surTitre="Cadre juridique"
        titre="Politique de cookies"
        intro="Dernière mise à jour : 15 octobre 2026. Le studio n’utilise ni traceur publicitaire, ni mesure d’audience tierce : uniquement ce qui est nécessaire à la connexion et au confort de lecture. Lisible sans compte."
      >
        <SommaireLegal actif="cookies" />

      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="1" titre="Ce que nous utilisons">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            Responsable : VICE LYNX, exploitant du studio Plume d’Ombres — identité
            et coordonnées complètes dans les{' '}
            <Link href="/mentions-legales" className="lien-discret underline">
              mentions légales
            </Link>
            .
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-encre-100">
                Cookie de session (nécessaire)
              </strong>{' '}
              : nommé d’après le projet Supabase (
              <code className="text-encre-100">sb-…-auth-token</code>), il
              maintient votre connexion d’une page à l’autre. Il ne sert qu’à
              l’authentification et n’est pas utilisé pour vous suivre sur
              d’autres sites.
            </li>
            <li>
              <strong className="text-encre-100">
                Stockage local du navigateur
              </strong>{' '}
              : vos préférences de lecture (police, taille, thème) et votre
              dernière position de lecture sont conservées dans votre navigateur,
              pas sur nos serveurs.
            </li>
            <li>
              <strong className="text-encre-100">Aucun traceur publicitaire</strong>{' '}
              et <strong className="text-encre-100">aucune mesure d’audience
              tierce</strong> ne sont déposés. Aucun consentement à des cookies
              non essentiels n’est donc requis.
            </li>
          </ul>
          <p className="text-encre-500 italic">
            Aucun outil de mesure d’audience n’est retenu à ce jour. Si un tel
            outil était ajouté plus tard, il ferait l’objet d’un bandeau de
            consentement dédié avant tout dépôt. En l’état, seuls des cookies
            strictement nécessaires étant utilisés, aucun bandeau de consentement
            n’est requis : le visiteur est informé par la présente page,
            conformément au régime béninois (code du numérique, article 406, et
            formulaire APDP « site web »).
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="2" titre="Comment les gérer">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            Vous pouvez supprimer à tout moment le cookie de session et le
            stockage local depuis les réglages de votre navigateur ; vous serez
            alors déconnecté et vos préférences de lecture seront réinitialisées.
            Les pages publiques et légales restent lisibles sans aucun cookie.
          </p>
          <p>
            Le détail du traitement des données (finalités, durées, droits) figure
            dans la{' '}
            <Link href="/confidentialite" className="lien-discret underline">
              politique de confidentialité
            </Link>
            . Une question ? Passez par la page{' '}
            <Link href="/contact" className="lien-discret underline">
              Contact
            </Link>
            .
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="3" titre="Voir aussi">
        <SommaireLegal actif="cookies" />
      </SectionPublique>
    </>
  );
}

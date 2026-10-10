// Politique de cookies (C6) — page publique de travail. Décrit, sans
// jargon, les seuls cookies et stockages locaux réellement utilisés par le
// studio. Lisible SANS compte, cohérente avec la politique de confidentialité.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import BandeauGabarit from '@/components/public/BandeauGabarit';
import SommaireLegal from '@/components/public/SommaireLegal';

export const metadata: Metadata = {
  title: 'Cookies',
  description:
    'Quels cookies et stockages locaux Plume d’Ombres utilise : le cookie de session nécessaire à l’authentification, les préférences de lecture gardées dans le navigateur, et l’absence de traceur publicitaire.',
};

export default function PageCookies() {
  return (
    <>
      <SectionPublique
        niveau={1}
        gabarit="etroit"
        surTitre="Cadre juridique"
        titre="Politique de cookies"
        intro="Version de travail. Le studio n’utilise ni traceur publicitaire, ni mesure d’audience tierce : uniquement ce qui est nécessaire à la connexion et au confort de lecture. Lisible sans compte."
      >
        <SommaireLegal actif="cookies" />

        <div className="mt-4">
          <BandeauGabarit>
            Ce texte est une <strong>rédaction de travail</strong>. La liste des
            cookies doit être revérifiée au moment de la mise en ligne (elle
            dépend des prestataires réellement déployés) et l’ensemble relu par un
            juriste avant l’ouverture commerciale.
          </BandeauGabarit>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="1" titre="Ce que nous utilisons">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
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
            Si un outil de mesure d’audience était ajouté plus tard, il ferait
            l’objet d’un bandeau de consentement dédié. [À REMPLIR : outil de
            mesure d’audience retenu, le cas échéant.]
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

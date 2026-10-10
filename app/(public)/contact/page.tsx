// Contact (C6). Pas de formulaire branché : aucun envoi ne doit être
// simulé. On donne donc une adresse (provisoire, marquée comme telle) et
// on oriente vers la FAQ pour ce qui y est déjà répondu.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Écrire au studio Plume d’Ombres : question, bug, demande d’effacement de données ou signalement d’un contenu.',
};

/**
 * Adresse de contact officielle du studio (communiquée par l'éditeur).
 * Elle est reprise dans les mentions légales et la politique de
 * confidentialité, ainsi que dans les conditions générales.
 */
const ADRESSE_CONTACT = 'carreldossou7@gmail.com';

const MOTIFS: { titre: string; texte: React.ReactNode }[] = [
  {
    titre: 'Une question sur le fonctionnement',
    texte: (
      <>
        Formats, qualité d’un PDF, temps de traduction, exports : la{' '}
        <Link href="/faq" className="lien-discret underline">
          FAQ
        </Link>{' '}
        y répond déjà. Si votre cas n’y est pas, écrivez-nous.
      </>
    ),
  },
  {
    titre: 'Un bug, un blocage',
    texte: (
      <>
        Précisez le titre du livre concerné, le format du fichier, l’écran et ce que vous
        attendiez. Ne joignez pas le texte intégral du livre : il n’est pas nécessaire
        pour diagnostiquer.
      </>
    ),
  },
  {
    titre: 'Vos droits sur vos données (accès, effacement)',
    texte: (
      <>
        Demande recevable depuis la page{' '}
        <Link href="/compte" className="lien-discret underline">
          Mon compte
        </Link>{' '}
        : suppression d’un livre, ou de la totalité du compte et des données associées.
        Une demande par écrit suffit.
      </>
    ),
  },
  {
    titre: 'Un contenu illicite ou un droit d’auteur',
    texte: (
      <>
        Indiquez le contenu visé, la nature du problème et votre qualité (
        <em>ayant droit, mandataire…</em>). Les demandes relatives à des œuvres protégées
        sont traitées en priorité.
      </>
    ),
  },
];

export default function PageContact() {
  return (
    <>
      <SectionPublique
        gabarit="etroit"
        niveau={1}
        surTitre="Contact"
        titre="Écrire au studio"
        intro="Un projet indépendant, tenu par peu de mains : réponses dans un délai de quelques jours ouvrés, sans promesse de permanence téléphonique."
      >
        <div className="velours p-4 sm:p-5">
          <p className="text-encre-300 text-[13px] leading-relaxed">
            Adresse officielle du studio. Elle est également reprise dans les{' '}
            <Link href="/mentions-legales" className="lien-discret underline">
              mentions légales
            </Link>{' '}
            et la{' '}
            <Link href="/confidentialite" className="lien-discret underline">
              politique de confidentialité
            </Link>
            . Le studio n’exploite ni formulaire de contact automatisé ni
            permanence téléphonique : les réponses se font par écrit, en quelques
            jours ouvrés.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="Adresse" titre="Par écrit">
        <div className="velours p-6">
          <p className="text-encre-500 text-sm">
            Point d’entrée unique pour toutes les demandes :
          </p>
          <p className="font-display text-xl sm:text-2xl mt-3 break-all">
            <a
              href={`mailto:${ADRESSE_CONTACT}`}
              className="text-grenat-300 lien-discret underline"
            >
              {ADRESSE_CONTACT}
            </a>
          </p>
          <p className="text-encre-500 text-xs mt-4 leading-relaxed italic">
            Question, bug, exercice de vos droits sur vos données, signalement
            d’un contenu ou réclamation : tout passe par cette adresse. Indiquez
            si possible l’adresse e-mail de votre compte, pour que la demande
            soit retrouvée plus vite.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 mt-4">
          {MOTIFS.map((m) => (
            <div key={m.titre} className="velours p-5">
              <h3 className="font-display text-lg text-encre-100">{m.titre}</h3>
              <p className="text-encre-500 text-sm mt-2 leading-relaxed">{m.texte}</p>
            </div>
          ))}
        </div>

        <div className="velours p-5 mt-4">
          <p className="sur-titre text-encre-300">Ce qu’il ne faut pas nous envoyer</p>
          <p className="text-encre-500 text-sm mt-3 leading-relaxed">
            Jamais de mot de passe, jamais de moyen de paiement (le studio n’en demande
            aucun), et jamais le texte intégral d’une œuvre protégée par courriel : pour un
            diagnostic, le titre et la description suffisent.
          </p>
        </div>
      </SectionPublique>
    </>
  );
}

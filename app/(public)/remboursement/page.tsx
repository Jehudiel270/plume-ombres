// Politique de remboursement (C6) — page publique de travail. Traite le
// cas d'un contenu numérique à accès immédiat, payé par Mobile Money.
// Lisible SANS compte, cohérente avec les conditions générales.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import BandeauGabarit from '@/components/public/BandeauGabarit';
import SommaireLegal from '@/components/public/SommaireLegal';

export const metadata: Metadata = {
  title: 'Remboursement',
  description:
    'Conditions de remboursement et droit de rétractation des formules payantes Plume d’Ombres : contenu numérique à accès immédiat, paiement par Mobile Money, demande via la page Contact.',
};

export default function PageRemboursement() {
  return (
    <>
      <SectionPublique
        niveau={1}
        gabarit="etroit"
        surTitre="Cadre juridique"
        titre="Politique de remboursement"
        intro="Comment fonctionne le remboursement des formules payantes, et ce que devient le droit de rétractation sur un contenu numérique délivré immédiatement. Version de travail, lisible sans compte."
      >
        <SommaireLegal actif="remboursement" />

        <div className="mt-4">
          <BandeauGabarit>
            Ce texte est une <strong>rédaction de travail</strong>. Il doit être
            relu et adapté par un juriste, notamment sur le point délicat du{' '}
            <em>droit de rétractation du contenu numérique</em> et sur le droit
            national applicable au consommateur.
          </BandeauGabarit>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="1" titre="Nature du contenu">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            Les formules Plume d’Ombres donnent accès à un{' '}
            <strong className="text-encre-100">contenu numérique</strong>
            (traduction, lecture, exports) dont l’usage commence immédiatement
            après le paiement accepté. Le règlement s’effectue par{' '}
            <strong className="text-encre-100">Mobile Money</strong> via un
            agrégateur de paiement.
          </p>
          <p>
            Parce que le service est fourni sans délai, et sous réserve du
            consentement exprès décrit ci-dessous, la consommation du service peut
            entraîner une renonciation au droit de rétractation de quatorze (14)
            jours prévu pour les contrats à distance.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="2"
        titre="Droit de rétractation sur le contenu numérique"
        intro="Le droit de rétractation protège d’ordinaire l’acheteur à distance. Il connaît une limite pour les contenus délivrés immédiatement."
      >
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            Avant la commande, il vous est demandé de{' '}
            <strong className="text-encre-100">
              consentir expressément à l’exécution immédiate
            </strong>{' '}
            et de reconnaître que vous perdez ainsi votre droit de rétractation
            dès que l’accès au contenu est ouvert. Tant que ce consentement n’a
            pas été donné, l’accès immédiat n’est pas déclenché.
          </p>
          <p>
            Le pays et le texte de référence encadrant ce consentement doivent
            être précisés par l’éditeur.{' '}
            <strong className="text-amber-300">
              [À REMPLIR : pays et droit applicable au consommateur — ex. Bénin /
              zone CEDEAO / France — ainsi que le texte de référence.]
            </strong>
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="3" titre="Quand un remboursement est accordé">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            En dehors du cas de rétractation, un remboursement est accordé de
            bonne foi lorsque le service payé n’a pas été fourni. Notamment :
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-encre-100">Paiement sans service</strong> :
              vous avez été débité mais l’abonnement n’a pas été activé et le
              restera pas.
            </li>
            <li>
              <strong className="text-encre-100">Double débit</strong> : le même
              achat a été prélevé deux fois.
            </li>
            <li>
              <strong className="text-encre-100">Défaut technique bloquant</strong>{' '}
              : une panne du studio vous a empêché d’utiliser l’offre pendant une
              part significative de sa durée, sans solution de contournement.
            </li>
          </ul>
          <p>
            Le simple regret, ou le changement d’avis après avoir utilisé le
            service, n’ouvre pas automatiquement droit à remboursement une fois le
            contenu consommé.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="4" titre="Comment demander">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            Adressez votre demande par écrit via la page{' '}
            <Link href="/contact" className="lien-discret underline">
              Contact
            </Link>
            , en précisant la référence du paiement (elle figure dans l’historique
            de votre compte), la date et le motif. La demande est traitée dans un
            délai indicatif de{' '}
            <strong className="text-amber-300">
              [À REMPLIR : délai de traitement — ex. 14 jours ouvrés]
            </strong>
            . Le remboursement, lorsqu’il est accordé, est réexpédié par le même
            canal Mobile Money que le paiement d’origine.
          </p>
          <p className="text-encre-500 italic">
            Le délai d’un remboursement Mobile Money peut dépendre de l’opérateur
            et n’est pas entièrement sous notre contrôle.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="5" titre="Médiation et réclamation">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            En cas de désaccord persistant, le consommateur peut recourir à un
            médiateur de la consommation.{' '}
            <strong className="text-amber-300">
              [À REMPLIR : coordonnées du médiateur de la consommation compétent —
              à indiquer avant toute vente.]
            </strong>
          </p>
          <p>
            Les modalités générales d’achat, de durée et de résiliation figurent
            dans les{' '}
            <Link href="/conditions" className="lien-discret underline">
              conditions générales
            </Link>
            .
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="6" titre="Voir aussi">
        <SommaireLegal actif="remboursement" />
      </SectionPublique>
    </>
  );
}

// Politique de remboursement (C6) — page publique de travail. Traite le
// cas d'un contenu numérique à accès immédiat, payé par Mobile Money.
// Lisible SANS compte, cohérente avec les conditions générales.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
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
        intro="Comment fonctionne le remboursement des formules payantes, et ce que devient le droit de rétractation sur un contenu numérique délivré immédiatement. Dernière mise à jour : 15 octobre 2026, lisible sans compte."
      >
        <SommaireLegal actif="remboursement" />

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
            consentement exprès décrit ci-dessous, la consommation du service
            entraîne une renonciation au droit de rétractation de quinze (15)
            jours ouvrables prévu pour les contrats à distance en droit béninois
            et dans l’espace CEDEAO.
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
            Le droit applicable au consommateur est le{' '}
            <strong className="text-encre-100">droit béninois</strong> — loi
            n° 2007-21 portant protection des consommateurs, complétée par
            l’<strong className="text-encre-100">Acte additionnel CEDEAO
            A/SA.1/01/10</strong>. Le délai de rétractation est de quinze (15)
            jours ouvrables à compter de la conclusion du contrat à distance ; il
            est porté à quatre-vingt-dix (90) jours lorsque l’information
            préalable n’a pas été donnée. Il est perdu lorsque vous consentez
            expressément à l’exécution immédiate et reconnaissez renoncer à ce
            droit, ce qui est le cas à l’ouverture de l’accès.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="3" titre="Remboursement : principe de non-remboursement">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            Le studio, tel qu’il fonctionne aujourd’hui, n’accorde{' '}
            <strong className="text-encre-100">aucun remboursement</strong> : ni
            pour un changement d’avis, ni pour le regret d’un achat, ni pour
            l’usage effectif ou non du contenu, ni pour l’expiration d’une
            période. L’accès étant ouvert immédiatement après confirmation du
            paiement, le droit de rétractation est perdu par le consentement
            exprès donné avant la commande (section 2).
          </p>
          <p>
            Seules les{' '}
            <strong className="text-encre-100">
              erreurs manifestes de paiement
            </strong>{' '}
            sont corrigées, sur demande écrite. Il ne s’agit pas d’une politique
            de remboursement commerciale, mais de la réparation d’un débit
            erroné :
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-encre-100">Double débit</strong> : le même
              achat a été débité deux fois ; le montant en trop est restitué.
            </li>
            <li>
              <strong className="text-encre-100">Débit sans activation</strong> :
              vous avez été débité alors que la formule n’a jamais été activée ;
              le montant est restitué, ou la formule est activée, au choix.
            </li>
          </ul>
          <p className="text-encre-500 italic">
            La politique du studio est, en l’état, l’absence de remboursement hors
            erreurs de paiement. Elle reste à confirmer par un juriste : une clause
            « aucun remboursement » peut, dans certains cas, être écartée par le
            droit de la consommation.
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
            de votre compte), la date et le motif. Un accusé de réception est
            apporté dans un délai indicatif de{' '}
            <strong className="text-encre-100">sept (7) jours ouvrés</strong>.
            Lorsqu’une erreur de paiement manifeste est confirmée, la correction
            est réexpédiée par le même canal Mobile Money que le paiement
            d’origine.
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
            Les formules sont vendues par l’éditeur{' '}
            <strong className="text-encre-100">VICE LYNX</strong> (sigle VLYNX), nom
            commercial de{' '}
            <strong className="text-encre-100">DOSSOU Sègla Carrel Jéhudiel</strong>,
            établissement (personne physique) dont le siège est situé à Ouidah,
            Atlantique, Bénin (adresse postale exacte sur demande écrite) ;
            identité complète dans les{' '}
            <Link href="/mentions-legales" className="lien-discret underline">
              mentions légales
            </Link>
            .
          </p>
          <p>
            <strong className="text-encre-100">
              Aucun médiateur de la consommation n’est désigné à ce jour.
            </strong>{' '}
            Votre réclamation est à adresser par écrit via la page{' '}
            <Link href="/contact" className="lien-discret underline">
              Contact
            </Link>{' '}
            (dossoucarrel@gmail.com, +229 01 53 17 23 61) ; un accusé de réception
            est apporté dans un délai indicatif de sept (7) jours ouvrés.
          </p>
          <p>
            À défaut de solution amiable, les juridictions compétentes du{' '}
            <strong className="text-encre-100">Bénin</strong> — et plus
            précisément celles de <strong className="text-encre-100">Cotonou</strong>
            {' '}— sont seules saisies. Pour les données personnelles, l’autorité de
            contrôle est l’<strong className="text-encre-100">APDP</strong> (Bénin) —
            apdp.bj, contact@apdp.bj, tél. +229 21 32 57 88 / +229 69 55 00 00,
            01 BP 04837, Aïdjèdo rue 6.076 « Immeuble El MARZOUK Joël », Cotonou.
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

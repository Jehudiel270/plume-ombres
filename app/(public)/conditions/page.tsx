// Conditions générales d'utilisation et de vente (C6) — remise à niveau
// vague 5, complétée par le lot « offres visibles ».
//
// Rédigé en français, structuré comme un vrai contrat, cohérent avec la
// politique de confidentialité, la politique de remboursement et les
// mentions légales. La partie VENTE (prix, Mobile Money, durée,
// résiliation, rétractation) a été AJOUTÉE parce que des formules
// payantes sont désormais affichées et achetables. Chaque article
// sensible doit être arbitré par un juriste avant mise en ligne.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import SommaireLegal from '@/components/public/SommaireLegal';

export const metadata: Metadata = {
  title: 'Conditions générales (CGU/CGV)',
  description:
    'Conditions générales d’utilisation et de vente du studio Plume d’Ombres : compte, âge minimum, usages, droits sur les textes, offres payantes, paiement Mobile Money, durée, résiliation, rétractation, responsabilité et litiges.',
};

const ARTICLES: { titre: string; corps: React.ReactNode }[] = [
  {
    titre: '1. Objet et éditeur',
    corps: (
      <>
        <p>
          Les présentes conditions encadrent l’accès et l’usage de Plume d’Ombres,
          studio personnel de traduction littéraire accessible en ligne, qui permet
          d’importer un texte, de le faire traduire automatiquement et de le lire ou
          de l’exporter. La version applicable est celle publiée au jour de la
          connexion.
        </p>
        <p className="mt-3">
          Le service est édité par <strong className="text-encre-100">VICE LYNX</strong>{' '}
          (sigle VLYNX), nom commercial de{' '}
          <strong className="text-encre-100">DOSSOU Sègla Carrel Jéhudiel</strong>,
          établissement (personne physique) — entreprise individuelle — dont le
          siège est situé à Ouidah, Atlantique, Bénin — adresse postale exacte
          communiquée sur demande écrite. Contact :{' '}
          <a href="mailto:dossoucarrel@gmail.com" className="lien-discret underline">
            dossoucarrel@gmail.com
          </a>{' '}
          — téléphone :{' '}
          <a href="tel:+2290153172361" className="lien-discret underline">
            +229 01 53 17 23 61
          </a>
          . Immatriculation RCCM RB/ABC/26 A 147397 (greffe du tribunal de commerce
          de Cotonou), IFU 0202683356150. Identité et coordonnées complètes dans les{' '}
          <Link href="/mentions-legales" className="lien-discret underline">
            mentions légales
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    titre: '2. Définitions',
    corps: (
      <>
        <strong className="text-encre-100">Studio</strong> : le service Plume
        d’Ombres. <strong className="text-encre-100">Compte</strong> : l’espace
        personnel identifié par une adresse e-mail.{' '}
        <strong className="text-encre-100">Contenus</strong> : les fichiers
        importés, le texte extrait et les traductions produites.{' '}
        <strong className="text-encre-100">Moteurs</strong> : les services de
        traduction automatique décrits dans la{' '}
        <Link href="/confidentialite" className="lien-discret underline">
          politique de confidentialité
        </Link>
        . <strong className="text-encre-100">Formule</strong> : une offre
        d’abonnement payante du catalogue (par exemple Lecteur ou Passionné,
        mensuelle ou annuelle).{' '}
        <strong className="text-encre-100">Catalogue</strong> : la liste des
        formules et de leurs prix, publiée sur la page{' '}
        <Link href="/tarifs" className="lien-discret underline">
          Tarifs
        </Link>
        .
      </>
    ),
  },
  {
    titre: '3. Accès au service et compte',
    corps: (
      <>
        L’accès aux fonctions de traduction nécessite un compte. Vous vous engagez
        à fournir une adresse e-mail exacte et à préserver la confidentialité de
        vos identifiants. Un compte est personnel ; vous êtes responsable de ce qui
        est fait depuis votre session. Le studio peut suspendre un compte en cas
        d’usage manifestement abusif (voir article 6). Les pages publiques, la FAQ,
        la page de contact et l’ensemble des pages légales restent en revanche
        lisibles <strong className="text-encre-100">sans compte</strong>.
      </>
    ),
  },
  {
    titre: '4. Usages autorisés',
    corps: (
      <>
        <p>
          Vous devez disposer des droits nécessaires sur les textes que vous
          importez : œuvre dont vous êtes l’auteur, œuvre libre de droits, œuvre
          légalement acquise pour un usage privé, ou autorisation expresse de
          l’ayant droit.
        </p>
        <p className="mt-3">
          La traduction produite est destinée à votre{' '}
          <strong>usage personnel de lecture</strong>. Toute diffusion publique,
          commercialisation ou mise à disposition de tiers d’une œuvre traduite
          sans droit relève de votre seule responsabilité.
        </p>
      </>
    ),
  },
  {
    titre: '5. Âge minimum et avertissement de contenu',
    corps: (
      <>
        <p>
          Le studio est consacré à la{' '}
          <strong className="text-encre-100">dark romance</strong> et aux textes
          qui peuvent comporter des scènes violentes, explicites ou sensibles. Le
          service est réservé aux personnes{' '}
          <strong className="text-encre-100">majeures (18 ans et plus)</strong>.
          En utilisant le studio, vous déclarez avoir l’âge requis.
        </p>
        <p className="mt-3 text-encre-500 italic">
          Les avertissements de contenu par livre (content warnings) sont en cours
          de chantier et ne sont pas encore systématiques.{' '}
          <Link href="/confidentialite" className="lien-discret underline">
            Voir aussi « Mineurs et contenu adulte »
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    titre: '6. Usages interdits',
    corps: (
      <>
        Sont interdits : la mise en place d’un accès automatisé massif (aspiration,
        contournement des protections), la revente du service, l’import de
        contenus illicites ou dont vous ne détenez pas les droits, la tentative
        d’accéder aux données d’un autre compte, et toute action visant à dégrader
        ou saturer le service. Un usage abusif peut entraîner une limitation
        technique (débit, quota) ou la suspension du compte.
      </>
    ),
  },
  {
    titre: '7. Propriété intellectuelle',
    corps: (
      <>
        Le studio (nom, interface, code, éléments visuels) appartient à l’éditeur.
        Vous conservez vos droits sur vos contenus. Vous accordez à l’éditeur
        uniquement les autorisations techniques nécessaires : stocker le texte
        extrait, le transmettre au moteur de traduction, enregistrer et afficher
        le résultat pour votre compte.
      </>
    ),
  },
  {
    titre: '8. Offres payantes, prix et catalogue',
    corps: (
      <>
        <p>
          À côté de l’offre gratuite, des <strong>formules payantes</strong> sont
          proposées (notamment Lecteur et Passionné, en formule mensuelle ou
          annuelle). Les formules réellement commercialisées et leurs prix en
          francs CFA (XOF) sont affichés sur la page{' '}
          <Link href="/tarifs" className="lien-discret underline">
            Tarifs
          </Link>
          , qui reflète le catalogue. Le prix applicable est celui affiché au
          moment de la commande.
        </p>
        <p className="mt-3">
          Les formules annuelles couvrent douze (12) mois et offrent, par rapport
          au paiement mensuel cumulé, une réduction indiquée sur la carte
          correspondante. Les prix peuvent évoluer ; toute modification
          n’affecte pas une période déjà payée.
        </p>
      </>
    ),
  },
  {
    titre: '9. Paiement (Mobile Money)',
    corps: (
      <>
        <p>
          Le règlement s’effectue par{' '}
          <strong className="text-encre-100">Mobile Money</strong>, via un
          prestataire agrégateur de paiement. Le débit est unique, du montant de
          la formule choisie, au moment de la commande. Aucun numéro de carte
          bancaire n’est demandé.
        </p>
        <p className="mt-3">
          Une formule n’est considérée comme souscrite, et la période
          correspondante ne commence, qu’après{' '}
          <strong className="text-encre-100">confirmation du paiement</strong>.
          Tant que le prestataire n’a pas confirmé l’opération, aucune somme n’est
          due et aucun droit n’est ouvert. En cas d’échec, aucun montant n’est
          prélevé et l’opération peut être reprise.
        </p>
        <p className="mt-3">
          Prestataire de paiement mobile :{' '}
          <strong className="text-encre-100">FedaPay</strong>, agrégateur de
          paiement <strong className="text-encre-100">Mobile Money</strong>{' '}
          couvrant la zone UEMOA (Bénin et pays voisins). Les opérateurs pris en
          charge sont précisés au moment du paiement.
        </p>
      </>
    ),
  },
  {
    titre: '10. Durée, reconduction et résiliation',
    corps: (
      <>
        <p>
          Une formule mensuelle couvre trente (30) jours ; une formule annuelle
          couvre douze (12) mois. Le paiement se fait{' '}
          <strong className="text-encre-100">à l’acte</strong> : l’abonnement
          n’est <strong>pas</strong> reconduit automatiquement. À l’échéance de la
          période payée, l’accès aux avantages de la formule s’arrête, sans
          nouveau prélèvement, et le compte revient à l’offre gratuite.
        </p>
        <p className="mt-3">
          Aucune résiliation n’est donc nécessaire pour éviter un renouvellement :
          il suffit de ne pas repayer. Vous pouvez par ailleurs demander la
          fermeture de votre compte à tout moment (article 14).
        </p>
      </>
    ),
  },
  {
    titre: '11. Droit de rétractation et remboursement',
    corps: (
      <>
        <p>
          Le service payant est un <strong>contenu numérique</strong> à accès
          immédiat. Avant la commande, il vous est demandé de consentir
          expressément à l’exécution immédiate et de reconnaître perdre ainsi le
          droit de rétractation dès l’ouverture de l’accès. Les conditions
          détaillées figurent sur la page{' '}
          <Link href="/remboursement" className="lien-discret underline">
            Remboursement
          </Link>
          .
        </p>
        <p className="mt-3">
          Le droit applicable au consommateur est le{' '}
          <strong className="text-encre-100">droit béninois</strong> — loi
          n° 2007-21 portant protection des consommateurs — complété par l’
          <strong className="text-encre-100">Acte additionnel CEDEAO
          A/SA.1/01/10</strong> relatif à la protection des consommateurs dans
          l’espace CEDEAO. Le droit de rétractation est de quinze (15) jours
          ouvrables à compter de la conclusion du contrat à distance, porté à
          quatre-vingt-dix (90) jours à défaut d’information préalable ; il est
          perdu lorsque vous consentez expressément à l’exécution immédiate et
          reconnaissez renoncer à ce droit. En dehors de ces cas, la politique du
          studio est{' '}
          <strong className="text-encre-100">l’absence de remboursement</strong>,
          telle que décrite sur la page Remboursement.
        </p>
      </>
    ),
  },
  {
    titre: '12. Disponibilité et évolutions',
    corps: (
      <>
        Le service est fourni « en l’état », sans garantie de disponibilité
        continue ni de résultat de traduction exempt d’erreur. Il peut être
        interrompu pour maintenance ou évolution. La qualité de la traduction
        automatique est variable : une relecture humaine reste nécessaire avant
        tout usage important.
      </>
    ),
  },
  {
    titre: '13. Responsabilité',
    corps: (
      <>
        <p>
          L’éditeur ne peut être tenu responsable des conséquences d’un usage non
          conforme (notamment d’un import sans droits), d’une interruption de
          service, ni d’une utilisation de la traduction dans un cadre
          professionnel ou commercial sans relecture.
        </p>
        <p className="mt-3">
          Pour les formules payantes, la responsabilité de l’éditeur est, dans la
          mesure permise par le droit applicable, limitée au montant payé pour la
          période en cours. Ces limitations s’entendent sans priver le
          consommateur des garanties et protections impératives de la{' '}
          <strong className="text-encre-100">loi béninoise n° 2007-21 portant
          protection des consommateurs</strong> et de l’Acte additionnel CEDEAO
          A/SA.1/01/10, auxquelles il ne peut être dérogé.
        </p>
      </>
    ),
  },
  {
    titre: '14. Suppression, résiliation du compte',
    corps: (
      <>
        Vous pouvez supprimer un livre à tout moment depuis la bibliothèque, et
        demander la suppression de votre compte (voir la page{' '}
        <Link href="/compte" className="lien-discret underline">
          Mon compte
        </Link>
        ). La suppression d’un livre efface ses chapitres, ses segments et ses
        traductions. L’éditeur peut fermer un compte en cas de manquement grave,
        après information lorsque la situation le permet.
      </>
    ),
  },
  {
    titre: '15. Données personnelles',
    corps: (
      <>
        Le traitement des données est décrit dans la{' '}
        <Link href="/confidentialite" className="lien-discret underline">
          politique de confidentialité
        </Link>{' '}
        et la page{' '}
        <Link href="/cookies" className="lien-discret underline">
          Cookies
        </Link>
        . En résumé : vos livres sont privés, mais le texte est transmis au moteur
        de traduction actif (voir la section « Quel moteur voit votre texte »).
      </>
    ),
  },
  {
    titre: '16. Droit applicable et litiges',
    corps: (
      <>
        <p>
          Les présentes conditions sont soumises au{' '}
          <strong className="text-encre-100">droit béninois</strong>, notamment à
          la loi n° 2017-20 du 20 avril 2018 portant code du numérique (modifiée
          par la loi n° 2020-35 du 6 janvier 2021), à la loi n° 2007-21 portant
          protection des consommateurs et à l’Acte additionnel CEDEAO A/SA.1/01/10.
          En cas de litige, une solution amiable sera recherchée en priorité via
          la page{' '}
          <Link href="/contact" className="lien-discret underline">
            Contact
          </Link>
          ; une réponse est apportée dans un délai indicatif de sept (7) jours
          ouvrés.
        </p>
        <p className="mt-3">
          <strong className="text-encre-100">
            Aucun médiateur de la consommation n’est désigné à ce jour.
          </strong>{' '}
          À défaut de solution amiable, et sans priver le consommateur des
          protections de sa juridiction, les{' '}
          <strong className="text-encre-100">tribunaux compétents de Cotonou
          (Bénin)</strong> sont seuls saisis. Pour les données personnelles,
          l’autorité de contrôle est l’<strong className="text-encre-100">APDP</strong>{' '}
          (Autorité de Protection des Données Personnelles du Bénin).
        </p>
      </>
    ),
  },
  {
    titre: '17. Modifications des conditions',
    corps: (
      <>
        Toute modification substantielle est annoncée dans l’application avant son
        entrée en vigueur. Poursuivre l’usage après cette date vaut acceptation ;
        à défaut, vous pouvez supprimer votre compte.
      </>
    ),
  },
];

export default function PageConditions() {
  return (
    <>
      <SectionPublique
        niveau={1}
        gabarit="etroit"
        surTitre="Cadre juridique"
        titre="Conditions générales d’utilisation et de vente"
        intro="Dernière mise à jour : 15 octobre 2026. Elle s’applique à l’usage du studio et couvre la vente des formules payantes (prix, Mobile Money, durée, résiliation, rétractation). Lisible sans compte."
      >
        <SommaireLegal actif="conditions" />

      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="Articles" titre="Le texte">
        <div className="space-y-3">
          {ARTICLES.map((article) => (
            <details
              key={article.titre}
              className="velours p-5 group"
              open={article === ARTICLES[0]}
            >
              <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-encre-100 font-display text-lg leading-snug focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grenat-400 rounded-md">
                {article.titre}
                <span
                  aria-hidden
                  className="text-grenat-400 shrink-0 transition-transform duration-200 group-open:rotate-45"
                >
                  ＋
                </span>
              </summary>
              <div className="text-encre-500 text-sm leading-relaxed mt-3 space-y-2">
                {article.corps}
              </div>
            </details>
          ))}
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="Voir aussi" titre="Le reste du cadre légal">
        <SommaireLegal actif="conditions" />
      </SectionPublique>
    </>
  );
}

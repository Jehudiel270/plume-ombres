// Conditions générales d'utilisation et de vente (C6) — GABARIT.
// Rédigé en français, structuré comme un vrai contrat, mais chaque
// article sensible (prix, rétractation, responsabilité, résiliation,
// litiges) doit être arbitré par un juriste avant mise en ligne.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import BandeauGabarit from '@/components/public/BandeauGabarit';

export const metadata: Metadata = {
  title: 'Conditions générales (CGU/CGV)',
  description:
    'Conditions générales d’utilisation et de vente du studio Plume d’Ombres : compte, usages autorisés, droits sur les textes, services payants à venir et responsabilité.',
};

const ARTICLES: { titre: string; corps: React.ReactNode }[] = [
  {
    titre: '1. Objet',
    corps: (
      <>
        Les présentes conditions encadrent l’accès et l’usage de Plume d’Ombres, studio
        personnel de traduction littéraire accessible en ligne, qui permet d’importer un
        texte, de le faire traduire automatiquement et de le lire ou de l’exporter. La
        version applicable est celle publiée au jour de la connexion.
      </>
    ),
  },
  {
    titre: '2. Définitions',
    corps: (
      <>
        <strong className="text-encre-100">Studio</strong> : le service Plume d’Ombres.{' '}
        <strong className="text-encre-100">Compte</strong> : l’espace personnel identifié
        par une adresse e-mail. <strong className="text-encre-100">Contenus</strong> : les
        fichiers importés, le texte extrait et les traductions produites.{' '}
        <strong className="text-encre-100">Moteurs</strong> : les services de traduction
        automatique décrits dans la{' '}
        <Link href="/confidentialite" className="lien-discret underline">
          politique de confidentialité
        </Link>
        .
      </>
    ),
  },
  {
    titre: '3. Accès au service et compte',
    corps: (
      <>
        L’accès aux fonctions de traduction nécessite un compte. Vous vous engagez à
        fournir une adresse e-mail exacte et à préserver la confidentialité de vos
        identifiants. Un compte est personnel ; vous êtes responsable de ce qui est fait
        depuis votre session. Le studio peut suspendre un compte en cas d’usage manifestement
        abusif (voir article 5).
      </>
    ),
  },
  {
    titre: '4. Usages autorisés',
    corps: (
      <>
        <p>
          Vous devez disposer des droits nécessaires sur les textes que vous importez :
          œuvre dont vous êtes l’auteur, œuvre libre de droits, œuvre légalement acquise
          pour un usage privé, ou autorisation expresse de l’ayant droit.
        </p>
        <p className="mt-3">
          La traduction produite est destinée à votre <strong>usage personnel de lecture</strong>.
          Toute diffusion publique, commercialisation ou mise à disposition de tiers d’une
          œuvre traduite sans droit relève de votre seule responsabilité.
        </p>
      </>
    ),
  },
  {
    titre: '5. Usages interdits',
    corps: (
      <>
        Sont interdits : la mise en place d’un accès automatisé massif (aspiration,
        contournement des protections), la revente du service, l’import de contenus
        illicites ou dont vous ne détenez pas les droits, la tentative d’accéder aux
        données d’un autre compte, et toute action visant à dégrader ou saturer le
        service. Un usage abusif peut entraîner une limitation technique (débit, quota) ou
        la suspension du compte.
      </>
    ),
  },
  {
    titre: '6. Propriété intellectuelle',
    corps: (
      <>
        Le studio (nom, interface, code, éléments visuels) appartient à l’éditeur. Vous
        conservez vos droits sur vos contenus. Vous accordez à l’éditeur uniquement les
        autorisations techniques nécessaires : stocker le texte extrait, le transmettre au
        moteur de traduction, enregistrer et afficher le résultat pour votre compte.
      </>
    ),
  },
  {
    titre: '7. Services payants (à venir)',
    corps: (
      <>
        <p>
          <span className="rounded-full border border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300 text-[10px] uppercase tracking-wider px-2.5 py-1">
            bientôt disponible
          </span>
        </p>
        <p className="mt-3">
          Aucun paiement n’est accepté aujourd’hui : aucune offre payante n’est ouverte,
          aucune carte bancaire n’est demandée, aucun prélèvement n’est possible. Les
          modalités de l’offre payante (prix, durée, résiliation, droit de rétractation,
          facturation) seront publiées et acceptées séparément <em>avant</em> toute mise en
          vente. En Europe, un contenu numérique fourni immédiatement peut faire perdre le
          droit de rétractation si l’acheteur y consent expressément — ce point doit être
          rédigé par un juriste.
        </p>
      </>
    ),
  },
  {
    titre: '8. Disponibilité et évolutions',
    corps: (
      <>
        Le service est fourni « en l’état », sans garantie de disponibilité continue ni de
        résultat de traduction exempt d’erreur. Il peut être interrompu pour maintenance
        ou évolution. La qualité de la traduction automatique est variable : une relecture
        humaine reste nécessaire avant tout usage important.
      </>
    ),
  },
  {
    titre: '9. Responsabilité',
    corps: (
      <>
        L’éditeur ne peut être tenu responsable des conséquences d’un usage non conforme
        (notamment d’un import sans droits), d’une interruption de service, ni d’une
        utilisation de la traduction dans un cadre professionnel ou commercial sans
        relecture. [Limitation de responsabilité à rédiger précisément — plafonds,
        exclusions et conformité au droit de la consommation.]
      </>
    ),
  },
  {
    titre: '10. Suppression, résiliation',
    corps: (
      <>
        Vous pouvez supprimer un livre à tout moment depuis la bibliothèque, et demander la
        suppression de votre compte (voir la page{' '}
        <Link href="/compte" className="lien-discret underline">
          Mon compte
        </Link>
        ). La suppression d’un livre efface ses chapitres, ses segments et ses traductions.
        L’éditeur peut fermer un compte en cas de manquement grave, après information
        lorsque la situation le permet.
      </>
    ),
  },
  {
    titre: '11. Données personnelles',
    corps: (
      <>
        Le traitement des données est décrit dans la{' '}
        <Link href="/confidentialite" className="lien-discret underline">
          politique de confidentialité
        </Link>
        . En résumé : vos livres sont privés, mais le texte est transmis au moteur de
        traduction actif (voir la section « Quel moteur voit votre texte »).
      </>
    ),
  },
  {
    titre: '12. Droit applicable et litiges',
    corps: (
      <>
        Les présentes conditions sont soumises au droit [français / belge — à préciser].
        En cas de litige, une solution amiable sera recherchée en priorité via la page{' '}
        <Link href="/contact" className="lien-discret underline">
          Contact
        </Link>
        . Le consommateur peut recourir gratuitement à un médiateur de la consommation
        [coordonnées du médiateur à indiquer obligatoirement avant toute vente]. À défaut
        d’accord, les tribunaux compétents seront ceux du ressort de l’éditeur, sans
        priver le consommateur des protections de sa juridiction.
      </>
    ),
  },
  {
    titre: '13. Modifications des conditions',
    corps: (
      <>
        Toute modification substantielle est annoncée dans l’application avant son entrée
        en vigueur. Poursuivre l’usage après cette date vaut acceptation ; à défaut, vous
        pouvez supprimer votre compte.
      </>
    ),
  },
];

export default function PageConditions() {
  return (
    <>
      <SectionPublique
        gabarit="etroit"
        surTitre="Cadre juridique"
        titre="Conditions générales d’utilisation et de vente"
        intro="Version de travail du 1er octobre 2026. Elle s’applique à l’usage du studio ; la partie « vente » n’entrera en vigueur qu’à l’ouverture du paiement."
      >
        <BandeauGabarit>
          Ce document est un <strong>gabarit rédactionnel</strong>. Il doit être relu et
          adapté par un juriste (<em>a fortiori</em> avant toute vente), notamment sur les
          prix, le droit de rétractation, la garantie de conformité, la médiation de la
          consommation et la loi applicable.
        </BandeauGabarit>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="Articles" titre="Le texte">
        <div className="space-y-3">
          {ARTICLES.map((article) => (
            <details key={article.titre} className="velours p-5 group" open={article === ARTICLES[0]}>
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
    </>
  );
}

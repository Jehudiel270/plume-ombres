// Politique de confidentialité (C6, chantier B20) — remise à niveau vague 5,
// puis vague 6 : plus AUCUN nom de prestataire de traduction dans la page
// publique. On garde l'information légale (le texte est transmis à des
// prestataires de traduction automatique, certains hors du Bénin, dont
// certains peuvent réutiliser les contenus), on retire les noms.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import BandeauGabarit from '@/components/public/BandeauGabarit';
import SommaireLegal from '@/components/public/SommaireLegal';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Quelles données Plume d’Ombres conserve, à quels destinataires votre texte est transmis pendant la traduction (catégories, sans nom de prestataire), ce qui est journalisé, quels sous-traitants interviennent et comment exercer vos droits (accès, effacement).',
};

const SOUS_TRAITANTS: { nom: string; role: string; lieu: string }[] = [
  {
    nom: 'Vercel Inc.',
    role: 'Hébergement de l’application et rendu des pages.',
    lieu: 'Hors Union européenne selon la configuration (à confirmer).',
  },
  {
    nom: 'Supabase Inc.',
    role: 'Base de données, authentification, stockage éventuel.',
    lieu: 'Base hébergée en eu-west-1 — Union européenne.',
  },
  {
    nom: 'Prestataires de traduction automatique',
    role:
      'Traitement des segments à traduire (catégories de destinataires décrites en section 3).',
    lieu: 'Certains hors du Bénin et hors Union européenne.',
  },
];

export default function PageConfidentialite() {
  return (
    <>
      <SectionPublique
        niveau={1}
        gabarit="etroit"
        surTitre="Confidentialité"
        titre="Politique de confidentialité"
        intro="Version de travail — 2 octobre 2026. Lisible sans compte. Résumé en une phrase : vos livres sont privés dans la base, mais pour les traduire, le texte passe par des prestataires externes, et nous vous disons ce qu’il en est."
      >
        <SommaireLegal actif="confidentialite" />

        <div className="mt-4">
          <BandeauGabarit>
            Texte rédigé pour être <strong>vérifiable et relu</strong>, pas pour
            être définitif. Les champs entre crochets, les durées de conservation
            et la qualification exacte des transferts hors Union européenne
            doivent être validés par un juriste (et un délégué à la protection des
            données si l’activité le justifie) avant la mise en ligne.
          </BandeauGabarit>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="1"
        titre="Qui traite vos données"
      >
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            Responsable du traitement :{' '}
            <strong className="text-encre-100">
              [à compléter — nom ou raison sociale]
            </strong>
            , [adresse], [SIREN / numéro d’identification], joignable via la page{' '}
            <Link href="/contact" className="lien-discret underline">
              Contact
            </Link>{' '}
            (voir aussi les{' '}
            <Link href="/mentions-legales" className="lien-discret underline">
              mentions légales
            </Link>
            ).
          </p>
          <p>
            Le studio est un outil personnel de traduction : les données traitées
            le sont pour votre seul compte, jamais pour un usage communautaire.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="2"
        titre="Quelles données, et pourquoi"
      >
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-encre-100">Compte</strong> : adresse e-mail,
              mot de passe (stocké sous forme de condensat par le service
              d’authentification), pseudo. Finalité : créer et protéger votre
              espace.
            </li>
            <li>
              <strong className="text-encre-100">Contenu des livres</strong> : le
              texte extrait de vos fichiers, les chapitres, les segments sources et
              leurs traductions, vos favoris. Finalité : produire et conserver
              votre traduction.
            </li>
            <li>
              <strong className="text-encre-100">Fichier d’origine</strong> : il
              n’est pas conservé durablement — le texte extrait est ce qui est
              enregistré. [à confirmer selon le chantier stockage en cours]
            </li>
            <li>
              <strong className="text-encre-100">
                Préférences de lecture et position
              </strong>{' '}
              (police, taille, thème, où vous en êtes, temps de lecture) :
              conservées dans votre navigateur (stockage local), pas sur nos
              serveurs.
            </li>
            <li>
              <strong className="text-encre-100">Journaux techniques</strong> :
              erreurs et durées des appels de traduction. Aucun fragment du texte
              du livre n’y est écrit (ni entrée, ni traduction, ni corps de
              réponse).
            </li>
          </ul>
          <p>
            Bases légales : exécution du contrat (compte, traduction, lecture) et
            intérêt légitime (sécurité, prévention des abus). [base légale à
            confirmer par un juriste]
          </p>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="3"
        titre="À quels destinataires votre texte est-il transmis"
        intro="La question la plus importante — à laquelle nous répondons sans masquer que le texte sort du studio, ni nommer nos prestataires."
      >
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-4">
          <ul className="list-disc pl-5 space-y-3">
            <li>
              <strong className="text-encre-100">
                Prestataires de traduction automatique
              </strong>{' '}
              : pour traduire, le texte des segments est transmis à un ou
              plusieurs prestataires de traduction automatique. Certains peuvent
              être situés <strong className="text-encre-100">hors du Bénin</strong>{' '}
              et hors Union européenne, et{' '}
              <strong className="text-encre-100">
                certains de ces services peuvent utiliser les contenus transmis
                pour améliorer leurs propres produits
              </strong>
              . Le détail nominatif des sous-traitants n’est pas publié ici ; il
              est communiqué sur demande via la page{' '}
              <Link href="/contact" className="lien-discret underline">
                Contact
              </Link>
              .
            </li>
            <li>
              <strong className="text-encre-100">
                Aucun usage communautaire de notre côté
              </strong>{' '}
              : le studio ne publie pas vos textes, ne les revend pas et ne les
              partage avec aucun autre compte.
            </li>
            <li>
              <strong className="text-encre-100">Journalisation</strong> : seuls
              des indicateurs techniques (erreurs, durées, fournisseurs internes)
              sont conservés — jamais un fragment du texte, ni en entrée ni en
              sortie.
            </li>
          </ul>
          <p className="text-encre-500 text-xs leading-relaxed italic">
            Conséquence à assumer : en l’état, la confidentialité totale n’est
            pas garantie, puisqu’un prestataire externe peut recevoir le texte
            pendant la traduction. Si votre texte ne doit pas sortir, ne
            l’importez pas.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="4"
        titre="Qui héberge, qui voit, combien de temps"
      >
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-encre-100">Hébergement du site</strong> :
              Vercel Inc. (serveurs hors Union européenne selon la configuration
              retenue — [à préciser]). Vercel n’a pas vocation à lire le contenu
              stocké.
            </li>
            <li>
              <strong className="text-encre-100">
                Base de données et authentification
              </strong>{' '}
              : Supabase Inc., région <strong className="text-encre-100">eu-west-1</strong>{' '}
              (Union européenne). Les règles d’accès garantissent qu’un compte ne
              peut lire que ses propres lignes.
            </li>
            <li>
              <strong className="text-encre-100">
                Prestataires de traduction
              </strong>{' '}
              : voir la section 3. Certains sont situés hors du Bénin et hors
              Union européenne.
            </li>
            <li>
              <strong className="text-encre-100">Conservation</strong> : tant que
              votre compte existe. La suppression d’un livre efface ses chapitres,
              segments et traductions. La suppression du compte efface les données
              associées — [durée exacte des sauvegardes techniques à préciser].
            </li>
            <li>
              <strong className="text-encre-100">Cookies</strong> : uniquement le
              cookie de session nécessaire à l’authentification. Aucun traceur
              publicitaire, aucune mesure d’audience tierce.
            </li>
          </ul>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="5"
        titre="Sous-traitants et transferts hors Union européenne"
        intro="Les prestataires qui manipulent techniquement vos données, et là où elles se trouvent."
      >
        <div className="space-y-3">
          {SOUS_TRAITANTS.map((s) => (
            <div
              key={s.nom}
              className="velours p-5 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <p className="font-display text-base text-encre-100 sm:w-56 shrink-0">
                {s.nom}
              </p>
              <p className="text-encre-300 text-sm leading-relaxed flex-1">
                {s.role}{' '}
                <span className="text-encre-500">Localisation : {s.lieu}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="text-encre-500 text-xs mt-4 leading-relaxed italic">
          Les transferts vers des prestataires hors Union européenne doivent être
          encadrés par des garanties appropriées (clauses contractuelles types,
          décision d’adéquation). [modalité et garanties à confirmer par un
          juriste]
        </p>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="6" titre="Vos droits">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            Vous disposez des droits d’accès, de rectification, d’effacement, de
            limitation, d’opposition et de portabilité sur vos données. Ils
            s’exercent <strong className="text-encre-100">sans obligation de
            compte</strong> par la page{' '}
            <Link href="/contact" className="lien-discret underline">
              Contact
            </Link>
            , ou depuis la page{' '}
            <Link href="/compte" className="lien-discret underline">
              Mon compte
            </Link>{' '}
            lorsque vous êtes connecté.
          </p>
          <p>
            Vous pouvez également introduire une réclamation auprès de l’autorité
            de contrôle compétente ([CNIL en France / APD en Belgique — à préciser
            selon le pays d’établissement de l’éditeur]).
          </p>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="7"
        titre="Mineurs et contenu adulte"
      >
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            Le studio est dédié à la <strong className="text-encre-100">dark
            romance</strong>, genre à contenu adulte. L’usage est réservé aux
            personnes <strong className="text-encre-100">majeures (18 ans et
            plus)</strong>. Aucune donnée n’est sciemment collectée auprès d’un
            mineur.
          </p>
          <p className="text-encre-500 italic">
            L’âge minimum opposable et son contrôle relèvent d’un arbitrage
            éditorial et juridique (la majorité numérique est de 15 ans en France
            pour le consentement au traitement, mais le contenu justifie une
            restriction plus stricte). [à valider]
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="8" titre="Modifications">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed">
          <p>
            Toute modification substantielle sera annoncée dans l’application
            avant son entrée en vigueur. La date de dernière mise à jour figure en
            tête de cette page.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="9" titre="Voir aussi">
        <SommaireLegal actif="confidentialite" />
      </SectionPublique>
    </>
  );
}

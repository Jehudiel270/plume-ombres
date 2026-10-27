// Politique de confidentialité (C6, chantier B20) — remise à niveau vague 5.
// Contenu de travail, honnête sur le point le plus sensible : QUEL moteur
// voit le texte. Les faits viennent du code (lib/providers/fallback.ts :
// LibreTranslate → Gemini → Google → MyMemory) et de l'audit interne.
// Lisible SANS compte, cohérente avec les conditions et les mentions légales.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import BandeauGabarit from '@/components/public/BandeauGabarit';
import SommaireLegal from '@/components/public/SommaireLegal';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Quelles données Plume d’Ombres conserve, quel moteur de traduction voit votre texte, ce qui est journalisé, quels sous-traitants interviennent et comment exercer vos droits (accès, effacement).',
};

const MOTEURS: { nom: string; prive: string; role: string }[] = [
  {
    nom: 'LibreTranslate (auto-hébergé)',
    prive: 'Privé — le texte reste chez l’éditeur',
    role: 'Moteur essayé en premier. Aucun tiers ne voit le contenu.',
  },
  {
    nom: 'Gemini (Google)',
    prive: 'Tiers — hors UE',
    role:
      'Moteur de secours rapide. L’offre gratuite de Google prévoit que les contenus peuvent servir à améliorer ses produits (voir la page de confidentialité de Google pour la version en vigueur).',
  },
  {
    nom: 'Google Traduction (point d’accès public)',
    prive: 'Tiers — hors UE',
    role:
      'Point d’accès grand public, sans contrat de sous-traitance ni garantie de non-exploitation. Utilisé seulement si les moteurs précédents échouent.',
  },
  {
    nom: 'MyMemory',
    prive: 'Tiers',
    role: 'Dernier recours. Service communautaire de mémoires de traduction.',
  },
];

const SOUS_TRAITANTS: { nom: string; role: string; lieu: string }[] = [
  {
    nom: 'Vercel Inc.',
    role: 'Hébergement de l’application et rendu des pages.',
    lieu:
      'Région d’exécution non figée (configuration du projet Vercel) ; peut être hors Union européenne.',
  },
  {
    nom: 'Supabase Inc.',
    role: 'Base de données, authentification, stockage éventuel.',
    lieu: 'Base hébergée en eu-west-1 — Union européenne.',
  },
  {
    nom: 'FedaPay',
    role: 'Paiement des abonnements (agrégateur Mobile Money, zone UEMOA).',
    lieu: 'Bénin (zone UEMOA).',
  },
  {
    nom: 'Google (Gemini, Google Traduction)',
    role: 'Moteurs de traduction de secours (voir section 3).',
    lieu: 'Hors Union européenne.',
  },
  {
    nom: 'MyMemory',
    role: 'Moteur de traduction de dernier recours.',
    lieu: 'Hors Union européenne.',
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
        intro="Dernière mise à jour : 15 octobre 2026. Lisible sans compte. Résumé en une phrase : vos livres sont privés dans la base, mais pour les traduire, le texte passe par un moteur externe, et nous vous disons lequel."
      >
        <SommaireLegal actif="confidentialite" />

        <div className="mt-4">
          <BandeauGabarit>
            L’identité du responsable de traitement (VICE LYNX), son siège, ses
            coordonnées, l’autorité de contrôle et les dates ci-dessous sont
            complètes : aucun champ n’est laissé en blanc. L’ensemble reste à relire
            par un juriste (et, si l’activité le justifie, un délégué à la
            protection des données) avant la mise en ligne, en particulier les
            durées de conservation et les transferts hors Union européenne.
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
            Responsable du traitement : <strong className="text-encre-100">VICE
            LYNX</strong> (sigle VLYNX), nom commercial de{' '}
            <strong className="text-encre-100">DOSSOU Sègla Carrel Jéhudiel</strong>,
            établissement (personne physique) — entreprise individuelle — établi au
            Bénin, dont le siège est situé à Ouidah, Atlantique, Bénin — adresse
            postale exacte communiquée sur demande écrite. Il est
            joignable à l’adresse{' '}
            <a
              href="mailto:dossoucarrel@gmail.com"
              className="lien-discret underline"
            >
              dossoucarrel@gmail.com
            </a>{' '}
            et au{' '}
            <a href="tel:+2290153172361" className="lien-discret underline">
              +229 01 53 17 23 61
            </a>{' '}
            (voir aussi les{' '}
            <Link href="/mentions-legales" className="lien-discret underline">
              mentions légales
            </Link>
            ).
          </p>
          <p>
            Contact pour la protection des données :{' '}
            <strong className="text-encre-100">dossoucarrel@gmail.com</strong>. Aucun
            délégué à la protection des données n’est désigné : le volume et la
            nature des traitements ne le rendent pas obligatoire à ce stade.
          </p>
          <p className="text-encre-500">
            Toute demande relative à vos données se fait par écrit, à l’adresse de
            contact ci-dessus. Le siège de l’éditeur, où le responsable de
            traitement peut être joint, est celui indiqué ci-dessus et dans les{' '}
            <Link href="/mentions-legales" className="lien-discret underline">
              mentions légales
            </Link>
            .
          </p>
          <p>
            Le studio est un outil personnel de traduction : les données traitées le
            sont pour votre seul compte, jamais pour un usage communautaire.
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
              est conservé dans un espace de stockage privé rattaché à votre
              compte, puis supprimé en même temps que le livre.
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
            Bases légales : votre consentement (le régime béninois de protection des
            données repose sur le consentement — articles 383 à 390 du code du
            numérique), l’exécution du contrat (compte, traduction, lecture) et
            notre intérêt légitime (sécurité, prévention des abus).
          </p>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="3"
        titre="Quel moteur voit votre texte"
        intro="C’est la question à laquelle nous répondons le plus précisément. Le studio essaie les moteurs dans cet ordre et bascule sur le suivant dès que l’un échoue (réseau, quota, réponse vide)."
      >
        <div className="space-y-3">
          {MOTEURS.map((m, i) => (
            <div key={m.nom} className="velours p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] uppercase tracking-[0.2em] text-encre-500">
                  Moteur {i + 1}
                </span>
                <p className="font-display text-lg text-encre-100">{m.nom}</p>
                <span
                  className={`ml-auto rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider ${
                    m.prive.startsWith('Privé')
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {m.prive}
                </span>
              </div>
              <p className="text-encre-500 text-sm mt-3 leading-relaxed">
                {m.role}
              </p>
            </div>
          ))}
        </div>
        <p className="text-encre-500 text-xs mt-4 leading-relaxed italic">
          Conséquence à assumer : en l’état, la confidentialité totale n’est
          garantie que par le moteur auto-hébergé. Tant que les autres moteurs
          peuvent répondre, le texte d’un livre peut être transmis à un service
          tiers. Si votre texte ne doit pas sortir, ne l’importez pas avant que le
          moteur privé soit le seul actif — cette bascule est en cours de
          chantier.
        </p>
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
              Vercel Inc. La région d’exécution n’est pas figée (déterminée par la
              configuration du projet Vercel) et peut être hors Union européenne.
              Vercel n’a pas vocation à lire le contenu stocké.
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
              <strong className="text-encre-100">Moteurs de traduction</strong> :
              voir la section 3. Certains sont des prestataires tiers, hors Union
              européenne.
            </li>
            <li>
              <strong className="text-encre-100">Conservation</strong> : tant que
              votre compte existe. La suppression d’un livre efface ses chapitres,
              segments et traductions. La suppression du compte efface les données
              associées. L’hébergeur peut conserver des copies de sauvegarde
              techniques temporaires, remplacées au fil de l’eau ; aucune copie
              permanente n’est conservée en dehors de votre compte.
            </li>
            <li>
              <strong className="text-encre-100">Cookies</strong> : uniquement le
              cookie de session nécessaire à l’authentification. Aucun traceur
              publicitaire, aucune mesure d’audience tierce. Détail sur la page{' '}
              <Link href="/cookies" className="lien-discret underline">
                Cookies
              </Link>
              .
            </li>
            <li>
              <strong className="text-encre-100">Sécurité</strong> : l’accès aux
              données est cloisonné par compte, les échanges sont chiffrés et les
              traitements consignés dans un registre, conformément aux articles
              425-426 et 435 du code du numérique béninois.
            </li>
          </ul>
          <p className="text-encre-500 text-xs mt-3 leading-relaxed italic">
            Le code du numérique béninois soumet certains traitements à déclaration
            préalable (articles 405 et 407), sous réserve des dispenses prévues
            (article 410). La formalité correspondante auprès de l’APDP (Autorité de
            Protection des Données Personnelles du Bénin) reste à accomplir avant
            l’ouverture commerciale ; le registre des traitements est tenu.
          </p>
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
          Certains de ces prestataires (Google, MyMemory, et selon la configuration
          l’hébergement applicatif) peuvent impliquer des transferts de données
          hors Union européenne ; vous en êtes informé sur cette page. Les
          modalités et garanties exactes de ces transferts restent à confirmer par
          un juriste.
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
            lorsque vous êtes connecté. Ces droits correspondent à ceux prévus par
            le livre 5 du code du numérique béninois (information, accès,
            opposition, rectification, suppression, portabilité).
          </p>
          <p>
            Vous pouvez également introduire une réclamation auprès de l’autorité de
            contrôle compétente : l’<strong className="text-encre-100">Autorité de
            Protection des Données Personnelles (APDP)</strong> du Bénin — apdp.bj,
            contact@apdp.bj, tél. +229 21 32 57 88 ou +229 69 55 00 00, 01 BP 04837,
            Aïdjèdo rue 6.076 « Immeuble El MARZOUK Joël », Cotonou ; elle répond
            sous un délai d’un mois. Si vous résidez dans l’Union européenne, vous
            pouvez également saisir l’autorité nationale de protection des données
            de votre pays de résidence.
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
            L’âge minimum opposable est fixé à 18 ans. Ce seuil, plus strict que la
            majorité numérique de 15 ans retenue en France pour le consentement au
            traitement des données, est imposé par la nature adulte du contenu.
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

// Politique de confidentialité (C6, chantier B20).
// Contenu de travail, honnête sur le point le plus sensible : QUEL moteur
// voit le texte. Les faits viennent du code (lib/providers/fallback.ts :
// LibreTranslate → Gemini → Google → MyMemory) et de l'audit interne.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import BandeauGabarit from '@/components/public/BandeauGabarit';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Quelles données Plume d’Ombres conserve, quel moteur de traduction voit votre texte, ce qui est journalisé, et comment exercer vos droits (accès, effacement).',
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

export default function PageConfidentialite() {
  return (
    <>
      <SectionPublique
        gabarit="etroit"
        surTitre="Confidentialité"
        titre="Politique de confidentialité"
        intro="Version de travail — 1er octobre 2026. Résumé en une phrase : vos livres sont privés dans la base, mais pour les traduire, le texte passe par un moteur externe, et nous vous disons lequel."
      >
        <BandeauGabarit>
          Texte rédigé pour être <strong>vérifiable et relu</strong>, pas pour être
          définitif. Les champs entre crochets, les durées de conservation et les
          transferts hors Union européenne doivent être complétés et validés par un
          juriste (et un délégué à la protection des données si l’activité le justifie)
          avant la mise en ligne.
        </BandeauGabarit>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="1"
        titre="Qui traite vos données"
      >
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            Responsable du traitement : <strong className="text-encre-100">[nom ou
            raison sociale à compléter]</strong>, [adresse], [SIREN / numéro
            d’identification], joignable via la page{' '}
            <Link href="/contact" className="lien-discret underline">
              Contact
            </Link>
            .
          </p>
          <p>
            Le studio est un outil personnel de traduction : les données traitées le sont
            pour votre seul compte, jamais pour un usage communautaire.
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
              <strong className="text-encre-100">Compte</strong> : adresse e-mail, mot de
              passe (stocké sous forme de condensat par le service d’authentification),
              pseudo. Finalité : créer et protéger votre espace.
            </li>
            <li>
              <strong className="text-encre-100">Contenu des livres</strong> : le texte
              extrait de vos fichiers, les chapitres, les segments sources et leurs
              traductions, vos favoris. Finalité : produire et conserver votre
              traduction.
            </li>
            <li>
              <strong className="text-encre-100">Fichier d’origine</strong> : il n’est pas
              conservé durablement — le texte extrait est ce qui est enregistré. [à
              confirmer selon le chantier stockage en cours]
            </li>
            <li>
              <strong className="text-encre-100">Préférences de lecture et position</strong>{' '}
              (police, taille, thème, où vous en êtes, temps de lecture) : conservées
              dans votre navigateur (stockage local), pas sur nos serveurs.
            </li>
            <li>
              <strong className="text-encre-100">Journaux techniques</strong> : erreurs et
              durées des appels de traduction. Aucun fragment du texte du livre n’y est
              écrit (ni entrée, ni traduction, ni corps de réponse).
            </li>
          </ul>
          <p>
            Bases légales : exécution du contrat (compte, traduction, lecture) et intérêt
            légitime (sécurité, prévention des abus). [base légale à confirmer par
            juriste]
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
              <p className="text-encre-500 text-sm mt-3 leading-relaxed">{m.role}</p>
            </div>
          ))}
        </div>
        <p className="text-encre-500 text-xs mt-4 leading-relaxed italic">
          Conséquence à assumer : en l’état, la confidentialité totale n’est garantie que
          par le moteur auto-hébergé. Tant que les autres moteurs peuvent répondre, le
          texte d’un livre peut être transmis à un service tiers. Si votre texte ne doit
          pas sortir, ne l’importez pas avant que le moteur privé soit le seul actif —
          cette bascule est en cours de chantier.
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
              <strong className="text-encre-100">Hébergement du site</strong> : Vercel
              (prestataire d’hébergement, serveurs hors Union européenne selon la
              configuration retenue — [à préciser]). Vercel n’a pas vocation à lire le
              contenu stocké.
            </li>
            <li>
              <strong className="text-encre-100">Base de données et authentification</strong>{' '}
              : Supabase (base hébergée, [région à préciser]). Les règles d’accès
              garantissent qu’un compte ne peut lire que ses propres lignes.
            </li>
            <li>
              <strong className="text-encre-100">Moteurs de traduction</strong> : voir la
              section 3. Certains sont des prestataires tiers, hors Union européenne.
            </li>
            <li>
              <strong className="text-encre-100">Conservation</strong> : tant que votre
              compte existe. La suppression d’un livre efface ses chapitres, segments et
              traductions. La suppression du compte efface les données associées — [durée
              exacte des sauvegardes techniques à préciser].
            </li>
            <li>
              <strong className="text-encre-100">Cookies</strong> : uniquement le cookie de
              session nécessaire à l’authentification. Aucun traceur publicitaire, aucune
              mesure d’audience tierce.
            </li>
          </ul>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="5"
        titre="Vos droits"
      >
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            Vous disposez des droits d’accès, de rectification, d’effacement, de
            limitation, d’opposition et de portabilité sur vos données. Ils s’exercent
            depuis la page{' '}
            <Link href="/compte" className="lien-discret underline">
              Mon compte
            </Link>{' '}
            ou par la page{' '}
            <Link href="/contact" className="lien-discret underline">
              Contact
            </Link>
            .
          </p>
          <p>
            Vous pouvez également introduire une réclamation auprès de l’autorité de
            contrôle compétente ([CNIL en France / APD en Belgique — à préciser selon le
            pays d’établissement de l’éditeur]).
          </p>
          <p>
            Le service ne s’adresse pas aux mineurs : [âge minimum à fixer — la majorité
            numérique est de 15 ans en France pour le consentement au traitement, mais le
            contenu dark romance justifie une restriction plus stricte].
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="6" titre="Modifications">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed">
          <p>
            Toute modification substantielle sera annoncée dans l’application avant son
            entrée en vigueur. La date de dernière mise à jour figure en tête de cette
            page.
          </p>
        </div>
      </SectionPublique>
    </>
  );
}

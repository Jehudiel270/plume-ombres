// Mentions légales (C6) — remise à niveau vague 5.
// Objectif : page complète, cohérente avec les conditions et la politique de
// confidentialité, lisible SANS compte. Les seules cases réellement vides
// sont celles que l'éditeur seul peut remplir (identité, adresse,
// immatriculation) : elles restent entre crochets, jamais inventées.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import BandeauGabarit from '@/components/public/BandeauGabarit';
import SommaireLegal from '@/components/public/SommaireLegal';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description:
    'Éditeur, responsable de la publication, hébergeurs (Vercel, Supabase), propriété intellectuelle, signalement et accessibilité du studio de traduction Plume d’Ombres.',
};

export default function PageMentionsLegales() {
  return (
    <>
      <SectionPublique
        niveau={1}
        gabarit="etroit"
        surTitre="Informations légales"
        titre="Mentions légales"
        intro="Ce que la loi impose de rendre lisible : qui édite le site, qui l’héberge, à qui appartiennent les textes, et comment signaler un contenu. Dernière mise à jour : 2 octobre 2026."
      >
        <SommaireLegal actif="mentions-legales" />

        <div className="mt-4">
          <BandeauGabarit>
            Les identités, adresses et numéros ci-dessous sont les{' '}
            <strong>seules données que l’éditeur doit encore renseigner</strong> :
            elles figurent entre crochets et n’ont volontairement pas été
            inventées. Tant qu’elles restent vides, la page n’est pas conforme et
            doit être complétée puis relue avant la mise en ligne publique. Le
            reste de la page (hébergeurs, propriété intellectuelle, signalement)
            est complet.
          </BandeauGabarit>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="1" titre="Éditeur du site">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <ul className="space-y-2">
            <li>
              <strong className="text-encre-100">Dénomination</strong> : [À
              REMPLIR : nom ou raison sociale de l’éditeur]
            </li>
            <li>
              <strong className="text-encre-100">Statut juridique</strong> : [À
              REMPLIR : micro-entreprise / société / association]
            </li>
            <li>
              <strong className="text-encre-100">Adresse</strong> : [À REMPLIR :
              adresse complète]
            </li>
            <li>
              <strong className="text-encre-100">Immatriculation</strong> : [À
              REMPLIR : SIREN / SIRET ou registre équivalent]
            </li>
            <li>
              <strong className="text-encre-100">Numéro de TVA</strong> : [À
              REMPLIR : numéro de TVA le cas échéant]
            </li>
            <li>
              <strong className="text-encre-100">Téléphone</strong> : [À REMPLIR :
              numéro de téléphone joignable]
            </li>
            <li>
              <strong className="text-encre-100">Contact</strong> : voir la page{' '}
              <Link href="/contact" className="lien-discret underline">
                Contact
              </Link>
            </li>
          </ul>
          <p className="text-encre-500 italic">
            Le nom commercial « Plume d’Ombres » désigne le studio en ligne ;
            l’éditeur est la personne ou la structure qui l’exploite.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="2"
        titre="Responsable de la publication"
      >
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed">
          <p>
            [À REMPLIR : nom et qualité du responsable de la publication]. Pour
            toute question relative au contenu du site, passez par la page{' '}
            <Link href="/contact" className="lien-discret underline">
              Contact
            </Link>
            .
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="3" titre="Hébergeurs">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-4">
          <p>
            <strong className="text-encre-100">Vercel Inc.</strong> — hébergement
            de l’application (rendu des pages et routes serveur). Coordonnées
            officielles à recopier depuis la page « legal » de Vercel au moment de
            la mise en ligne. Région d’exécution : [À REMPLIR : région d’exécution
            Vercel en production].
          </p>
          <p>
            <strong className="text-encre-100">Supabase Inc.</strong> — base de
            données (livres, chapitres, traductions), authentification et, le cas
            échéant, stockage. La base du studio est hébergée dans la région{' '}
            <strong className="text-encre-100">eu-west-1 (Union européenne)</strong>.
            Coordonnées officielles à recopier depuis les mentions légales de
            Supabase.
          </p>
          <p className="text-encre-500">
            Le projet prépare aussi un second hébergeur (Netlify) qui n’est pas
            encore déployé ; cette page sera mise à jour le jour de la bascule.
          </p>
          <p className="text-encre-500 italic">
            Conseil : recopier les coordonnées depuis les pages légales
            officielles des prestataires au moment de la mise en ligne, puis les
            relire.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="4"
        titre="Propriété intellectuelle"
      >
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            <strong className="text-encre-100">Le studio</strong> — nom, identité
            visuelle, interface, code — appartient à l’éditeur. Toute reproduction
            non autorisée est interdite.
          </p>
          <p>
            <strong className="text-encre-100">Vos textes</strong> — vous restez
            titulaire des droits sur les fichiers que vous importez et sur les
            traductions issues de votre compte. Nous ne les exploitons pas, ne les
            publions pas et ne les partageons pas. Vous garantissez disposer des
            droits nécessaires sur ce que vous importez (voir les{' '}
            <Link href="/conditions" className="lien-discret underline">
              conditions générales
            </Link>
            ).
          </p>
          <p>
            <strong className="text-encre-100">Traductions automatiques</strong> —
            la traduction produite est un outil de lecture ; sa qualité peut
            nécessiter une relecture humaine, notamment pour une diffusion
            publique.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="5" titre="Données personnelles">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed">
          <p>
            Le traitement des données (compte, livres, moteurs de traduction) est
            décrit en détail dans la{' '}
            <Link href="/confidentialite" className="lien-discret underline">
              politique de confidentialité
            </Link>
            , y compris le moteur qui voit le texte lors d’une traduction.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="6"
        titre="Signalement d’un contenu illicite"
      >
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            Vous pouvez signaler tout contenu manifestement illicite (notamment
            une atteinte au droit d’auteur) via la page{' '}
            <Link href="/contact" className="lien-discret underline">
              Contact
            </Link>
            . Précisez le contenu visé, la date, votre qualité et, s’il s’agit
            d’une œuvre protégée, les éléments permettant d’identifier l’ayant
            droit.
          </p>
          <p className="text-encre-500 italic">
            Base : article 6 de la loi française pour la confiance dans
            l’économie numérique (LCEN). La procédure de traitement des
            signalements reste à valider par un juriste.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="7" titre="Accessibilité">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            Le studio vise le niveau d’accessibilité <strong className="text-encre-100">WCAG 2.1 AA</strong> :
            contraste des textes, navigation au clavier, cibles tactiles,
            respect de la préférence « mouvement réduit ». Les pages publiques et
            légales sont lisibles sans compte et sans JavaScript.
          </p>
          <p>
            Un obstacle vous gêne ? Signalez-le via la page{' '}
            <Link href="/contact" className="lien-discret underline">
              Contact
            </Link>
            .
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="8" titre="Voir aussi">
        <SommaireLegal actif="mentions-legales" />
      </SectionPublique>
    </>
  );
}

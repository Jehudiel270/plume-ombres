// Mentions légales (C6). Gabarit : identité de l'éditeur et coordonnées
// de l'hébergeur restent à compléter et à valider par un juriste.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import BandeauGabarit from '@/components/public/BandeauGabarit';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description:
    'Éditeur, responsable de la publication, hébergeur et propriété intellectuelle du studio de traduction Plume d’Ombres.',
};

export default function PageMentionsLegales() {
  return (
    <>
      <SectionPublique
        gabarit="etroit"
        surTitre="Informations légales"
        titre="Mentions légales"
        intro="Ce que la loi impose de rendre lisible : qui édite le site, qui l’héberge, et à qui appartiennent les textes."
      >
        <BandeauGabarit>
          Les identités, adresses et numéros ci-dessous sont des{' '}
          <strong>champs à compléter</strong>. Tant qu’ils restent entre crochets, la page
          n’est pas conforme : elle doit être finalisée et relue avant la mise en ligne
          publique.
        </BandeauGabarit>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="1" titre="Éditeur du site">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <ul className="space-y-2">
            <li>
              <strong className="text-encre-100">Dénomination</strong> : [nom ou raison
              sociale]
            </li>
            <li>
              <strong className="text-encre-100">Statut juridique</strong> : [micro-entreprise
              / société / association]
            </li>
            <li>
              <strong className="text-encre-100">Adresse</strong> : [adresse complète]
            </li>
            <li>
              <strong className="text-encre-100">Immatriculation</strong> : [SIREN / SIRET ou
              registre équivalent]
            </li>
            <li>
              <strong className="text-encre-100">Numéro de TVA</strong> : [le cas échéant]
            </li>
            <li>
              <strong className="text-encre-100">Contact</strong> : voir la page{' '}
              <Link href="/contact" className="lien-discret underline">
                Contact
              </Link>
            </li>
          </ul>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="2"
        titre="Responsable de la publication"
      >
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed">
          <p>
            [nom et qualité du responsable de la publication]. Pour toute question
            relative au contenu du site, passez par la page{' '}
            <Link href="/contact" className="lien-discret underline">
              Contact
            </Link>
            .
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="3" titre="Hébergeur">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <p>
            <strong className="text-encre-100">Vercel Inc.</strong> — hébergement de
            l’application. Coordonnées : [adresse de l’hébergeur à recopier depuis ses
            propres mentions légales, avec sa page « legal » comme source].
          </p>
          <p>
            <strong className="text-encre-100">Supabase Inc.</strong> — base de données,
            authentification et stockage. Coordonnées : [idem, à recopier depuis les
            mentions légales de Supabase]. Région d’hébergement retenue : [à préciser].
          </p>
          <p className="text-encre-500 italic">
            Conseil : recopier ces coordonnées depuis les pages légales officielles des
            prestataires au moment de la mise en ligne, puis les relire.
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
            <strong className="text-encre-100">Le studio</strong> — nom, identité visuelle,
            interface, code — appartient à l’éditeur. Toute reproduction non autorisée est
            interdite.
          </p>
          <p>
            <strong className="text-encre-100">Vos textes</strong> — vous restez titulaire
            des droits sur les fichiers que vous importez et sur les traductions issues de
            votre compte. Nous ne les exploitons pas, ne les publions pas et ne les
            partageons pas. Vous garantissez disposer des droits nécessaires sur ce que
            vous importez.
          </p>
          <p>
            <strong className="text-encre-100">Traductions automatiques</strong> — la
            traduction produite est un outil de lecture ; sa qualité peut nécessiter une
            relecture humaine, notamment pour une diffusion publique.
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="5" titre="Données personnelles">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed">
          <p>
            Le traitement des données (compte, livres, moteurs de traduction) est décrit
            en détail dans la{' '}
            <Link href="/confidentialite" className="lien-discret underline">
              politique de confidentialité
            </Link>
            .
          </p>
        </div>
      </SectionPublique>
    </>
  );
}

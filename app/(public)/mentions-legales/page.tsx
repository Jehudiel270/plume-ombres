// Mentions légales (C6) — remise à niveau vague 5.
// Objectif : page complète, cohérente avec les conditions et la politique de
// confidentialité, lisible SANS compte. Les seules cases encore vides sont
// celles que l’éditeur seul peut renseigner (adresse postale, n° d’identification,
// téléphone) : elles sont regroupées dans un bloc ambre, jamais inventées.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import BandeauGabarit from '@/components/public/BandeauGabarit';
import SommaireLegal from '@/components/public/SommaireLegal';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description:
    'Éditeur, responsable de la publication, hébergeurs (Vercel, Supabase), traitement des paiements (FedaPay), propriété intellectuelle, signalement et accessibilité du studio de traduction Plume d’Ombres.',
};

export default function PageMentionsLegales() {
  return (
    <>
      <SectionPublique
        niveau={1}
        gabarit="etroit"
        surTitre="Informations légales"
        titre="Mentions légales"
        intro="Ce que la loi impose de rendre lisible : qui édite le site, qui l’héberge, à qui appartiennent les textes, et comment signaler un contenu. Dernière mise à jour : 10 octobre 2026."
      >
        <SommaireLegal actif="mentions-legales" />

        <div className="mt-4">
          <BandeauGabarit>
            Les identités, les hébergeurs et les dates ci-dessous sont désormais
            complètes. Seuls restent à renseigner l’<strong>adresse postale</strong>,
            le <strong>numéro d’identification</strong> de l’éditeur et un éventuel
            numéro de téléphone, regroupés dans le bloc ambre : ces faits ne sont
            pas connus et n’ont volontairement pas été inventés. L’ensemble de la
            page reste à relire par un juriste avant l’ouverture commerciale.
          </BandeauGabarit>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="1" titre="Éditeur du site">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-3">
          <ul className="space-y-2">
            <li>
              <strong className="text-encre-100">Dénomination</strong> : Carrel
              DOSSOU, éditeur individuel (personne physique), exerçant sous le nom
              commercial « Plume d’Ombres ».
            </li>
            <li>
              <strong className="text-encre-100">Statut juridique</strong> : éditeur
              individuel (personne physique), établi au Bénin.
            </li>
            <li>
              <strong className="text-encre-100">Contact</strong> :{' '}
              <a
                href="mailto:carreldossou7@gmail.com"
                className="lien-discret underline"
              >
                carreldossou7@gmail.com
              </a>{' '}
              — voir aussi la page{' '}
              <Link href="/contact" className="lien-discret underline">
                Contact
              </Link>
            </li>
          </ul>
          <ul className="space-y-2">
            <li>
              <strong className="text-encre-100">Adresse</strong> : Cotonou, Bénin.
              L’adresse postale exacte est communiquée sur demande écrite, à
              l’adresse de contact ci-dessus.
            </li>
            <li>
              <strong className="text-encre-100">Immatriculation</strong> : aucune à
              ce jour (éditeur individuel, personne physique). Le numéro RCCM et
              l’identifiant fiscal unique (IFU) seront ajoutés si l’activité est
              immatriculée. Le numéro personnel d’identification (NPI) n’est jamais
              publié.
            </li>
            <li>
              <strong className="text-encre-100">Téléphone</strong> : non communiqué
              — le contact se fait par écrit.
            </li>
          </ul>
          <p className="text-encre-500 italic">
            Le nom commercial « Plume d’Ombres » désigne le studio en ligne ;
            l’éditeur est la personne physique qui l’exploite.
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
            <strong className="text-encre-100">Carrel DOSSOU</strong>, éditeur du
            site, est responsable de la publication. Pour toute question relative
            au contenu du site, passez par la page{' '}
            <Link href="/contact" className="lien-discret underline">
              Contact
            </Link>
            .
          </p>
        </div>
      </SectionPublique>

      <SectionPublique gabarit="etroit" surTitre="3" titre="Hébergeurs et traitement des paiements">
        <div className="velours p-6 text-sm text-encre-300 leading-relaxed space-y-4">
          <p>
            <strong className="text-encre-100">Vercel Inc.</strong> — hébergement de
            l’application (rendu des pages et routes serveur). La région d’exécution
            n’est pas figée (déterminée par la configuration du projet Vercel).
            Vercel n’a pas vocation à lire le contenu stocké.
          </p>
          <p>
            <strong className="text-encre-100">Supabase Inc.</strong> — base de
            données (livres, chapitres, traductions), authentification et, le cas
            échéant, stockage. La base du studio est hébergée dans la région{' '}
            <strong className="text-encre-100">eu-west-1 (Union européenne)</strong>.
          </p>
          <p>
            <strong className="text-encre-100">FedaPay</strong> — agrégateur de
            paiement Mobile Money pour la zone UEMOA (Bénin). Il traite le paiement
            des abonnements ; aucun numéro de carte bancaire n’est saisi sur le
            site.
          </p>
          <p className="text-encre-500">
            Le projet prépare aussi un second hébergeur (Netlify) qui n’est pas
            encore déployé ; cette page sera mise à jour le jour de la bascule.
          </p>
          <p className="text-encre-500 italic">
            Les coordonnées officielles de Vercel, de Supabase et de FedaPay seront
            recopiées depuis leurs pages légales au moment de la mise en ligne, puis
            relues.
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
            Base : code du numérique en République du Bénin et cadre CEDEAO sur les
            transactions électroniques. La procédure de traitement des signalements
            reste à valider par un juriste.
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

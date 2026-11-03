// FAQ (C6) — questions fréquentes, réponses vérifiées dans le code.
// Les <details>/<summary> natifs font l'accordéon : aucun JavaScript,
// donc rien qui casse au clavier ni au lecteur d'écran.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';

export const metadata: Metadata = {
  alternates: { canonical: '/faq' },
  title: 'Questions fréquentes',
  description:
    'Formats acceptés, qualité des PDF, confidentialité des textes, moteurs de traduction, exports, prix : les réponses franches sur Plume d’Ombres.',
};

const QUESTIONS: { q: string; r: React.ReactNode }[] = [
  {
    q: 'Quels formats de fichiers puis-je importer ?',
    r: (
      <>
        Quatre familles : <strong>.txt</strong>, <strong>.md / .markdown</strong>,{' '}
        <strong>.pdf</strong> et <strong>.epub</strong>. Le texte brut et le Markdown
        donnent les meilleurs résultats ; l’EPUB conserve les chapitres ; le PDF n’est
        lisible que si son texte est sélectionnable.
      </>
    ),
  },
  {
    q: 'Mon PDF est une photocopie, ça marche ?',
    r: (
      <>
        Non. Un PDF scanné n’est qu’une image : le studio n’a pas d’OCR et vous le dira
        clairement (« le texte du PDF semble vide ou illisible »). Repartez d’un PDF dont
        vous pouvez sélectionner le texte, ou d’un .txt / .md.
      </>
    ),
  },
  {
    q: 'Mes textes sont-ils privés ?',
    r: (
      <>
        Oui : chaque compte ne voit que ses propres livres, au niveau de la base de
        données (règles d’accès par utilisateur). Il n’existe aucune bibliothèque
        publique ni partage entre comptes. Le détail est dans notre{' '}
        <Link href="/confidentialite" className="lien-discret underline">
          politique de confidentialité
        </Link>
        .
      </>
    ),
  },
  {
    q: 'Qui voit mon texte pendant la traduction ?',
    r: (
      <>
        C’est la question la plus importante, et la réponse dépend du moteur qui
        répond. Le studio privilégie un moteur de traduction <strong>auto-hébergé</strong>,
        qui ne fait pas sortir le texte de nos serveurs. Quand il ne sait pas faire — une
        langue rare, un passage qu’il refuse — la traduction bascule sur des services
        tiers, qui reçoivent alors le segment concerné, jamais le livre entier, et ne le
        conservent pas. Le détail des sous-traitants et des durées figure dans la{' '}
        <Link href="/confidentialite" className="lien-discret underline">
          politique de confidentialité
        </Link>
        .
      </>
    ),
  },
  {
    q: 'La traduction s’arrête-t-elle au milieu du livre ?',
    r: (
      <>
        Non, c’est le point non négociable du studio. Chaque segment est suivi
        individuellement : un segment en échec est signalé et repris, un chapitre n’est
        jamais marqué « traduit » s’il reste un trou.
      </>
    ),
  },
  {
    q: 'Quelles langues sont disponibles ?',
    r: (
      <>
        Français, anglais, espagnol, italien, portugais et allemand, dans les deux sens.
        Utilisez une police et une taille que vous aimez : la lecture reste la vôtre.
      </>
    ),
  },
  {
    q: 'Que puis-je exporter ?',
    r: (
      <>
        Markdown, Word (<strong>.docx</strong>) et PDF — dont un export « fidèle » qui
        reprend la mise en page du PDF d’origine (marges, largeur de colonne) quand le
        livre a été importé depuis un PDF.
      </>
    ),
  },
  {
    q: 'Je perds ma place si je ferme l’onglet ?',
    r: (
      <>
        Non : la bibliothèque mémorise votre dernière position et vous propose
        « Reprendre ». Le sommaire et la recherche dans le chapitre restent
        accessibles à tout moment.
      </>
    ),
  },
  {
    q: 'Combien ça coûte ?',
    r: (
      <>
        <strong>Importer, traduire, lire et exporter restent gratuits.</strong> Des
        formules payantes (Lecteur à partir de 1 500 F CFA par mois, Passionné, et
        leurs versions annuelles avec 2 mois offerts) financent le volume et la
        qualité supérieure. Les prix exacts, la durée et le paiement par Mobile
        Money sont détaillés sur la page{' '}
        <Link href="/tarifs" className="lien-discret underline">
          Tarifs
        </Link>
        .
      </>
    ),
  },
  {
    q: 'Puis-je supprimer mes livres et mon compte ?',
    r: (
      <>
        Oui. Un livre se supprime depuis la bibliothèque, avec sa traduction. Pour
        l’effacement complet du compte et des données, la marche à suivre est décrite
        sur la page{' '}
        <Link href="/compte" className="lien-discret underline">
          Mon compte
        </Link>{' '}
        et la demande passe par{' '}
        <Link href="/contact" className="lien-discret underline">
          Contact
        </Link>
        .
      </>
    ),
  },
  {
    q: 'Puis-je traduire un texte qui n’est pas le mien ?',
    r: (
      <>
        Le studio est un outil personnel : vous devez disposer des droits sur les textes
        que vous importez (usage privé, œuvre libre, ou autorisation de l’ayant droit).
        Les{' '}
        <Link href="/conditions" className="lien-discret underline">
          conditions générales
        </Link>{' '}
        le rappellent — c’est aussi ce qui protège votre propre travail.
      </>
    ),
  },
];

export default function PageFaq() {
  return (
    <SectionPublique
      gabarit="etroit"
      niveau={1}
      surTitre="FAQ"
      titre="Les questions qu’on nous pose vraiment"
      intro="Réponses courtes, vérifiées dans le comportement réel du studio — y compris quand la réponse n’est pas flatteuse."
    >
      <div className="space-y-3">
        {QUESTIONS.map((item) => (
          <details key={item.q} className="velours p-5 group">
            <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-encre-100 font-display text-lg leading-snug focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grenat-400 rounded-md">
              {item.q}
              <span
                aria-hidden
                className="text-grenat-400 shrink-0 transition-transform duration-200 group-open:rotate-45"
              >
                ＋
              </span>
            </summary>
            <div className="text-encre-500 text-sm leading-relaxed mt-3">{item.r}</div>
          </details>
        ))}
      </div>

      <p className="text-encre-500 text-sm mt-8 italic">
        Une question qui n’est pas là ?{' '}
        <Link href="/contact" className="lien-discret underline">
          Écrivez-nous
        </Link>
        .
      </p>
    </SectionPublique>
  );
}

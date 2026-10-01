// Tarifs (C6). Page publique : l'offre gratuite du lancement, l'offre
// premium annoncée mais NON ouverte, et le détail de ce qui est inclus.
// Aucun prix ne doit laisser croire qu'un paiement est possible.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import BandeauGabarit from '@/components/public/BandeauGabarit';

export const metadata: Metadata = {
  title: 'Tarifs',
  description:
    'Plume d’Ombres est gratuit pendant le lancement : import, traduction, lecture et exports sans frais. L’offre Premium (3–5 €/mois) est annoncée mais pas encore ouverte.',
};

const GRATUIT = [
  'Import de vos fichiers .txt, .md, .pdf (texte) et .epub',
  'Découpage automatique en chapitres et segments',
  'Traduction vers le français depuis cinq autres langues',
  'Lecture complète avec réglages de confort (police, taille, thème)',
  'Reprise de lecture, favoris, recherche dans le chapitre',
  'Exports Markdown, Word (.docx) et PDF',
];

const PREMIUM = [
  'Quota de traduction élargi (plusieurs livres par mois)',
  'Plusieurs traductions menées en parallèle',
  'Qualité littéraire supérieure (moteur payant, traitement des données expliqué)',
  'Traduction en file prioritaire',
  'Export EPUB, mode bilingue, marque-pages synchronisés',
  'Glossaire de personnages pour les sagas',
];

export default function PageTarifs() {
  return (
    <>
      <SectionPublique
        surTitre="Tarifs"
        titre="Gratuit pour de vrai, premium plus tard"
        intro="Pendant le lancement, tout le studio est ouvert et gratuit. L’offre payante est dessinée mais pas branchée : aucun moyen de paiement n’est demandé, aucune somme ne peut être prélevée."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {/* --- Offre de lancement --- */}
          <div className="velours p-6 flex flex-col">
            <p className="sur-titre text-grenat-300">Offre de lancement</p>
            <p className="font-display text-5xl text-encre-100 mt-3">0 €</p>
            <p className="text-encre-500 text-xs mt-1">
              sans engagement, sans carte bancaire
            </p>
            <ul className="mt-6 space-y-2 text-sm text-encre-300 leading-relaxed list-disc pl-5 flex-1">
              {GRATUIT.map((ligne) => (
                <li key={ligne}>{ligne}</li>
              ))}
            </ul>
            <Link
              href="/connexion?mode=inscription"
              className="bouton-principal mt-6 justify-center"
            >
              Créer mon compte
            </Link>
          </div>

          {/* --- Premium annoncé --- */}
          <div className="velours p-6 flex flex-col relative overflow-hidden">
            <div className="absolute top-5 right-5">
              <span className="rounded-full border border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300 text-[10px] uppercase tracking-wider px-2.5 py-1">
                bientôt disponible
              </span>
            </div>
            <p className="sur-titre text-violet-rom-300">Premium — annoncé</p>
            <p className="font-display text-5xl text-encre-100 mt-3">
              3–5 €<span className="text-lg text-encre-500"> / mois</span>
            </p>
            <p className="text-encre-500 text-xs mt-1">
              fourchette indicative — le prix définitif n’est pas fixé
            </p>
            <ul className="mt-6 space-y-2 text-sm text-encre-500 leading-relaxed list-disc pl-5 flex-1">
              {PREMIUM.map((ligne) => (
                <li key={ligne}>{ligne}</li>
              ))}
            </ul>
            <p className="text-encre-500 text-xs mt-6 italic">
              Aucun abonnement n’est vendu aujourd’hui. Vous serez prévenu avant
              l’ouverture, et rien ne changera sans votre accord.
            </p>
          </div>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="Transparence"
        titre="Ce qu’il faut savoir sur le gratuit"
      >
        <div className="velours p-6 space-y-4 text-sm text-encre-300 leading-relaxed">
          <p>
            <strong className="text-encre-100">Aucune limite n’est appliquée aujourd’hui.</strong>{' '}
            L’offre de lancement prévoit un plafond généreux — un livre complet par mois
            (≈ 400 000 caractères) — mais ce plafond <em>n’est pas encore activé</em> dans
            le studio. Il servira de garde-fou anti-abus le jour où le trafic le
            justifiera.
          </p>
          <p>
            <strong className="text-encre-100">Un livre ne restera jamais à moitié</strong>{' '}
            par manque de quota : c’est la règle qui prime sur toute autre.
          </p>
          <p>
            <strong className="text-encre-100">Aucune fonctionnalité essentielle ne sera payante.</strong>{' '}
            Importer, traduire, lire et exporter resteront accessibles. Le Premium doit
            financer le <em>volume</em> et la <em>qualité supérieure</em>, jamais l’accès de
            base.
          </p>
        </div>

        <div className="mt-4">
          <BandeauGabarit>
            La grille ci-dessus est une <strong>rédaction de travail</strong>. Prix,
            paliers et conditions de facturation doivent être arrêtés puis relus par un
            juriste (et par un comptable) avant l’ouverture du paiement.
          </BandeauGabarit>
        </div>
      </SectionPublique>
    </>
  );
}

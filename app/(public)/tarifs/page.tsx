// Tarifs (C6, corrigé w6) — page publique : les plans RÉELS du
// catalogue (`lib/abonnement.ts`, prix en francs CFA), l'offre de
// lancement gratuite, l'essai « 7 jours offerts sans carte » et l'usage
// raisonnable du plan à quota élargi.
//
// Honnêteté : tant que le paiement n'est pas ouvert, les prix sont
// affichés comme INDICATIFS et aucun prélèvement n'est possible. Le
// catalogue est lu, jamais recopié : si un plan est absent ou si le
// module évolue, la page retombe proprement sur sa description statique.

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import BandeauGabarit from '@/components/public/BandeauGabarit';
import {
  libellePeriodicite,
  libellePrix,
  tousLesPlans,
  type PlanAbonnement,
} from '@/lib/abonnement';

export const metadata: Metadata = {
  title: 'Tarifs',
  description:
    'Les offres de Plume d’Ombres : gratuit pendant le lancement, puis Premium mensuel et annuel en francs CFA (Mobile Money). 7 jours offerts sans carte bancaire. Paiement non encore ouvert.',
};

/**
 * Champs optionnels du catalogue (consolidation en cours) : on les lit
 * s'ils existent, sinon on retombe sur les valeurs par défaut ci-dessous.
 * Aucun plan « absent » ne casse la page.
 */
type PlanEtendu = PlanAbonnement & {
  essaiJours?: number;
  illimite?: boolean;
  usageRaisonnable?: string;
};

/** Essai commun aux plans payants : 7 jours, sans carte bancaire. */
const ESSAI_JOURS_DEFAUT = 7;

/** Règle d'usage loyal du plan à quota élargi (dit « illimité »). */
const USAGE_RAISONNABLE_DEFAUT =
  'Usage raisonnable : le plan à quota élargi reste destiné à un usage personnel. Pas de revente, pas de compte partagé, pas de trafic automatisé — un usage anormal est limité, pas facturé en surprise.';

/** Caractéristiques de l'offre gratuite si le catalogue ne la détaille pas. */
const GRATUIT_INCLUS_DEFAUT = [
  'Import de vos fichiers .txt, .md, .pdf (texte) et .epub',
  'Découpage automatique en chapitres et segments',
  'Traduction vers le français depuis cinq autres langues',
  'Lecture complète avec réglages de confort (police, taille, thème)',
  'Reprise de lecture, favoris, recherche dans le chapitre',
  'Exports Markdown, Word (.docx), PDF et EPUB',
];

function plansDuCatalogue(): readonly PlanAbonnement[] {
  try {
    return tousLesPlans();
  } catch {
    return [];
  }
}

/** Nombre de jours d'essai d'un plan payant (défaut : 7). */
function essaiJours(plan: PlanAbonnement): number {
  const valeur = (plan as PlanEtendu).essaiJours;
  return typeof valeur === 'number' && valeur > 0 ? valeur : ESSAI_JOURS_DEFAUT;
}

/** Vrai si le plan est celui à quota le plus large (« illimité »). */
function estIllimite(plan: PlanAbonnement): boolean {
  const etendu = plan as PlanEtendu;
  if (etendu.illimite === true) return true;
  return (
    typeof etendu.usageRaisonnable === 'string' ||
    !Number.isFinite(plan.quotaMensuelCaracteres)
  );
}

const AVANTAGES_PREMIUM_DEFAUT = [
  'Quota de traduction élargi (plusieurs livres par mois)',
  'Qualité littéraire supérieure (moteur payant)',
  'Traductions menées en parallèle et file prioritaire',
  'Glossaire de personnages pour les sagas',
];

export default function PageTarifs() {
  const plans = plansDuCatalogue();
  const gratuit = plans.find((p) => p.prixXof <= 0) ?? null;
  const payants = plans.filter((p) => p.prixXof > 0);
  const catalogueLisible = plans.length > 0;

  return (
    <>
      <SectionPublique
        niveau={1}
        surTitre="Tarifs"
        titre="Gratuit pour de vrai, un Premium clair"
        intro="Pendant le lancement, tout le studio est ouvert et gratuit. Le Premium est désormais chiffré (francs CFA, Mobile Money) et s'essaie 7 jours sans carte — mais le paiement n'est pas encore branché : aucune somme ne peut être prélevée aujourd'hui."
      >
        {!catalogueLisible ? (
          <BandeauGabarit>
            Le catalogue de prix est en cours de consolidation : les montants
            ci-dessous seront affichés dès qu’ils seront publiés. L’offre de
            lancement reste entièrement gratuite, sans carte bancaire.
          </BandeauGabarit>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* --- Offre de lancement (plan gratuit du catalogue) --- */}
            <div className="velours p-6 flex flex-col">
              <p className="sur-titre text-grenat-300">Offre de lancement</p>
              <p className="font-display text-5xl text-encre-100 mt-3">
                {gratuit ? libellePrix(gratuit) : '0 F CFA'}
              </p>
              <p className="text-encre-500 text-xs mt-1">
                sans engagement, sans carte bancaire
              </p>
              <ul className="mt-6 space-y-2 text-sm text-encre-300 leading-relaxed list-disc pl-5 flex-1">
                {(gratuit?.avantages ?? GRATUIT_INCLUS_DEFAUT).map((ligne) => (
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

            {/* --- Plans payants du catalogue --- */}
            {payants.map((plan) => {
              const essai = essaiJours(plan);
              const fairUse = estIllimite(plan);
              return (
                <div
                  key={plan.code}
                  data-plan={plan.code}
                  className="velours p-6 flex flex-col"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="sur-titre text-violet-rom-300 min-w-0">
                      {plan.nom}
                    </p>
                    <span className="shrink-0 rounded-full border border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300 text-[10px] uppercase tracking-wider px-2.5 py-1">
                      bientôt disponible
                    </span>
                  </div>
                  <p className="font-display text-4xl text-encre-100 mt-3">
                    {libellePrix(plan)}
                    <span className="text-base text-encre-500">
                      {' '}
                      {libellePeriodicite(plan)}
                    </span>
                  </p>
                  <p className="text-encre-500 text-xs mt-1">
                    prix indicatif — à confirmer avant l’ouverture du paiement
                  </p>

                  {plan.resume && (
                    <p className="text-encre-300 text-sm mt-4 leading-relaxed">
                      {plan.resume}
                    </p>
                  )}

                  <ul className="mt-5 space-y-2 text-sm text-encre-300 leading-relaxed list-disc pl-5 flex-1">
                    {(plan.avantages.length > 0
                      ? plan.avantages
                      : AVANTAGES_PREMIUM_DEFAUT
                    ).map((ligne) => (
                      <li key={ligne}>{ligne}</li>
                    ))}
                  </ul>

                  <p className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    <strong className="text-emerald-100">
                      {essai} jours offerts sans carte bancaire
                    </strong>{' '}
                    — l’essai démarre sans moyen de paiement.
                  </p>
                  {fairUse && (
                    <p className="mt-3 text-encre-500 text-xs leading-relaxed">
                      {(plan as PlanEtendu).usageRaisonnable ??
                        USAGE_RAISONNABLE_DEFAUT}
                    </p>
                  )}

                  <p className="text-encre-500 text-xs mt-4 italic">
                    Aucun abonnement n’est vendu aujourd’hui : le paiement
                    n’est pas encore branché, rien ne peut être prélevé.
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {catalogueLisible && payants.length === 0 && (
          <div className="mt-4">
            <BandeauGabarit>
              Les offres payantes sont en cours de publication. L’offre de
              lancement reste gratuite et complète.
            </BandeauGabarit>
          </div>
        )}
      </SectionPublique>

      {/* --- L'essai et l'usage raisonnable, expliqués --- */}
      <SectionPublique
        gabarit="etroit"
        surTitre="L’essai"
        titre="7 jours offerts, sans carte"
      >
        <div className="velours p-6 space-y-4 text-sm text-encre-300 leading-relaxed">
          <p>
            Chaque offre Premium s’essaie{' '}
            <strong className="text-encre-100">
              {ESSAI_JOURS_DEFAUT} jours offerts, sans carte bancaire
            </strong>{' '}
            : aucune empreinte, aucun prélèvement automatique à la fin de
            l’essai. Vous décidez de poursuivre ou non, en Mobile Money (zone
            UEMOA).
          </p>
          <p>
            <strong className="text-encre-100">Usage raisonnable.</strong>{' '}
            {USAGE_RAISONNABLE_DEFAUT}
          </p>
        </div>
      </SectionPublique>

      <SectionPublique
        gabarit="etroit"
        surTitre="Transparence"
        titre="Ce qu’il faut savoir sur le gratuit"
      >
        <div className="velours p-6 space-y-4 text-sm text-encre-300 leading-relaxed">
          <p>
            <strong className="text-encre-100">
              Un livre complet par mois, sans blocage.
            </strong>{' '}
            L’offre gratuite prévoit un plafond généreux (≈ 400 000 caractères,
            l’équivalent d’un livre) pour servir de garde-fou anti-abus. Il
            n’est pas activé aujourd’hui : le studio est entièrement ouvert
            pendant le lancement.
          </p>
          <p>
            <strong className="text-encre-100">
              Un livre ne restera jamais à moitié
            </strong>{' '}
            par manque de quota : c’est la règle qui prime sur toute autre.
          </p>
          <p>
            <strong className="text-encre-100">
              Aucune fonctionnalité essentielle ne sera payante.
            </strong>{' '}
            Importer, traduire, lire et exporter resteront accessibles. Le
            Premium finance le <em>volume</em> et la <em>qualité supérieure</em>,
            jamais l’accès de base.
          </p>
        </div>

        <div className="mt-4">
          <BandeauGabarit>
            La grille ci-dessus reflète le catalogue de travail. Prix, paliers
            et conditions de facturation doivent être arrêtés puis relus par un
            juriste (et par un comptable) avant l’ouverture du paiement.
          </BandeauGabarit>
        </div>
      </SectionPublique>
    </>
  );
}

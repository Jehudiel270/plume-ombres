// ============================================================
// Tarifs (pages publiques) — la GRILLE PUBLIQUE des formules réellement
// achetables, lue dans public.plans_abonnement (source de vérité).
//
// POURQUOI CETTE RÉÉCRITURE
// L'ancienne page affichait un gabarit statique (« Gratuit pour de vrai,
// premium plus tard », prix affiché comme non fixé) alors que la base
// contient des formules ACHETABLES — dont deux ANNUELLES
// (`lecteur_annuel` 14 400 F, `passionne_annuel` 33 600 F) qui étaient
// achetables par URL directe mais absentes de la grille (la fonction
// `offresPubliquesDe` filtrait `dureeJours < 360`). Incohérence produit :
// un visiteur ne voyait pas ce qu'il pouvait acheter.
//
// ICI : la grille rend EXACTEMENT les formules achetables de la base,
// chaque mensuelle portant sa variante annuelle (prix, durée 12 mois,
// économie calculée) et un bouton menant au MÊME tunnel de paiement que
// les autres (`/paiement/<code>`). La dérivation vit dans `grillePubliqueDepuis`
// (lib/plans-catalogue.ts), prouvée par scripts/test-offres-publiques.ts.
// ============================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import SectionPublique from '@/components/public/SectionPublique';
import BandeauGabarit from '@/components/public/BandeauGabarit';
import AbonnementTarifs from '@/components/AbonnementTarifs';
import {
  grillePubliqueCourante,
  grillePubliqueDepuis,
  lireCatalogue,
  type GrillePublique,
} from '@/lib/plans-catalogue';
import { modePaiementAffiche } from '@/lib/paiement/mode';
import { libelleCaracteres } from '@/lib/abonnement';
import { creerClientServeur } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tarifs',
  description:
    'Les formules Plume d’Ombres et leurs prix en francs CFA : offre gratuite, abonnements Lecteur et Passionné (mensuels et annuels), paiement par Mobile Money.',
};

async function grille(): Promise<{ grille: GrillePublique; source: 'base' | 'repli' }> {
  try {
    const supabase = await creerClientServeur();
    const catalogue = await lireCatalogue(supabase);
    return { grille: grillePubliqueDepuis(catalogue), source: 'base' };
  } catch {
    // Base injoignable : on retombe sur le snapshot généré (même code,
    // même tri) pour que la page publique reste lisible.
    return { grille: grillePubliqueCourante(), source: 'repli' };
  }
}

export default async function PageTarifs() {
  const { grille: g, source } = await grille();
  const paiement = modePaiementAffiche();
  const simulation = paiement.mode === 'simulation';
  const sandbox = paiement.mode === 'sandbox';

  return (
    <>
      <SectionPublique
        id="tarifs-offres"
        niveau={1}
        surTitre="Tarifs"
        titre="Ce que vous pouvez souscrire aujourd’hui"
        intro="Voici les formules réellement commercialisées, aux prix du catalogue. Importer, traduire, lire et exporter restent possibles avec l’offre gratuite : le paiement finance le volume et la qualité, jamais l’accès de base."
      >
        <AbonnementTarifs
          plans={g.offres}
          planActuel=""
          premium={false}
          simulation={simulation}
        />

        <div className="velours p-5 mt-6 text-sm text-encre-300 leading-relaxed">
          {simulation ? (
            <p>
              <strong className="text-encre-100">Paiement en simulation.</strong>{' '}
              Le tunnel d’achat est exerçable de bout en bout, sans débit réel :
              aucun moyen de paiement ne peut être prélevé aujourd’hui.
            </p>
          ) : sandbox ? (
            <p>
              <strong className="text-encre-100">Paiement par Mobile Money.</strong>{' '}
              Le règlement s’effectue via FedaPay (agrégateur Mobile Money), en
              environnement de test (sandbox) : aucun débit réel n’est effectué
              tant que l’ouverture au public n’est pas annoncée.
            </p>
          ) : (
            <p>
              <strong className="text-encre-100">Paiement par Mobile Money.</strong>{' '}
              Le règlement s’effectue via FedaPay (agrégateur Mobile Money). Le
              prix affiché est celui du catalogue au moment de la commande ; les
              modalités complètes figurent dans les conditions générales.
            </p>
          )}
          <p className="mt-3">
            Droits sur le contenu numérique, durée, résiliation et{' '}
            <Link href="/remboursement" className="lien-discret underline">
              remboursement
            </Link>{' '}
            : voir les{' '}
            <Link href="/conditions" className="lien-discret underline">
              conditions générales
            </Link>
            . Vos données sont décrites dans la{' '}
            <Link href="/confidentialite" className="lien-discret underline">
              politique de confidentialité
            </Link>{' '}
            et la page{' '}
            <Link href="/cookies" className="lien-discret underline">
              cookies
            </Link>
            .
          </p>
        </div>
      </SectionPublique>

      {g.packs.length > 0 && (
        <SectionPublique
          gabarit="etroit"
          surTitre="Sans abonnement"
          titre="Compléter vos caractères"
          intro="Un pack prépayé ajoute des caractères à votre compte, sans engagement ni reconduction. Utile quand votre solde restant tombe juste en dessous de la taille du livre que vous voulez traduire : vous complétez le manque au lieu de perdre ce qui vous reste."
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 list-none p-0 m-0">
            {g.packs.map((pack) => (
              <li key={pack.code} className="flex">
                <article className="velours p-5 flex flex-col w-full">
                  <h3 className="font-display text-lg text-encre-100">{pack.nom}</h3>
                  <p className="text-sm text-encre-300 leading-relaxed mt-2">{pack.resume}</p>
                  <p className="font-display text-xl text-encre-100 mt-3">
                    {pack.prixXof.toLocaleString('fr-FR')} F CFA
                  </p>
                  <p className="text-encre-300 text-sm mt-2 font-semibold">
                    {libelleCaracteres(pack.caracteres)}
                  </p>
                  <Link
                    href={`/paiement/${pack.code}`}
                    className="bouton-fantome mt-6 w-full justify-center"
                    aria-label={`Acheter le ${pack.nom} — ${libelleCaracteres(pack.caracteres)} pour ${pack.prixXof.toLocaleString('fr-FR')} F CFA`}
                  >
                    Acheter ce pack
                  </Link>
                </article>
              </li>
            ))}
          </ul>
          <p className="text-encre-500 text-xs mt-4 leading-relaxed">
            Les packs s’ajoutent à votre quota et restent acquis jusqu’à
            utilisation : ils ne sont pas perdus à la fin du mois.
          </p>
        </SectionPublique>
      )}

      {g.horsLigne.length > 0 && (
        <SectionPublique
          gabarit="etroit"
          surTitre="Autres offres"
          titre="Offres sur devis"
          intro="Ces formules ne s’achètent pas en ligne : tarif étudiant sur justificatif de scolarité, ou devis au nom d’un groupe ou d’un établissement. Elles sont établies sur demande."
        >
          <ul className="grid gap-4 sm:grid-cols-3 list-none p-0 m-0">
            {g.horsLigne.map((offre) => (
              <li key={offre.code} className="flex">
                <article className="velours p-5 flex flex-col w-full">
                  <h3 className="font-display text-lg text-encre-100">{offre.nom}</h3>
                  <p className="text-sm text-encre-300 leading-relaxed mt-2">{offre.resume}</p>
                  <p className="font-display text-xl text-encre-100 mt-3">
                    {offre.prixXof.toLocaleString('fr-FR')} F CFA
                    {offre.parPersonne ? ' / personne' : ''}
                    {offre.dureeJours >= 360 ? ' / an' : ''}
                  </p>
                  <p className="text-note text-amber-300 mt-2 leading-relaxed">{offre.note}</p>
                  <Link
                    href="/contact"
                    className="bouton-fantome !px-4 !py-1.5 text-note mt-4 self-start"
                  >
                    Demander un devis
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        </SectionPublique>
      )}

      <SectionPublique
        gabarit="etroit"
        surTitre="Transparence"
        titre="Des prix lisibles et un catalogue vérifiable"
      >
        <div className="velours p-6 space-y-4 text-sm text-encre-300 leading-relaxed">
          <p>
            <strong className="text-encre-100">Un seul catalogue fait foi.</strong>{' '}
            Les prix, les durées et les quotas affichés ici proviennent de la base
            du studio. Ce qui est visible est exactement ce qui est achetable :
            aucune formule vendable n’est tenue cachée, aucune formule affichée
            n’est hors d’atteinte.
          </p>
          <p>
            <strong className="text-encre-100">Un livre ne restera jamais à moitié.</strong>{' '}
            Chaque segment de traduction est suivi : un échec est signalé et repris
            plutôt que laissé en trou. C’est la règle qui prime sur toute autre.
          </p>
          <p>
            <strong className="text-encre-100">Aucune fonctionnalité essentielle n’est payante.</strong>{' '}
            Importer, traduire, lire et exporter restent accessibles. Les
            abonnements financent le <em>volume</em> (plus de livres par mois) et la
            <em> qualité supérieure</em>, jamais l’accès de base.
          </p>
          <p>
            <strong className="text-encre-100">Payer à l’année coûte moins cher.</strong>{' '}
            Les formules annuelles offrent deux mois par rapport au mensuel (soit
            une économie de 20 %). Le détail est indiqué sur chaque carte.
          </p>
        </div>

        <div className="mt-4">
          <BandeauGabarit>
            Les prix et les conditions de facturation restent à confirmer par le
            propriétaire (et à relire par un juriste et un comptable) avant
            l’ouverture du paiement au grand public.
            {source === 'repli'
              ? ' Catalogue affiché en repli : la base n’a pas pu être lue à l’instant du rendu.'
              : ''}
          </BandeauGabarit>
        </div>
      </SectionPublique>
    </>
  );
}

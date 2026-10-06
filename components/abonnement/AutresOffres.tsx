// ============================================================
// components/abonnement/AutresOffres.tsx — « Autres offres » (Lot C).
//
// Affiche les formules HORS grille publique : Étudiant, Groupe,
// École. Elles sont MONTRÉES mais NON ACHETABLES EN LIGNE dans ce
// lot — aucune ne rend de lien /paiement ni de bouton d'achat :
//   · Étudiant exige une vérification de statut ;
//   · Groupe et École ont un prix PAR PERSONNE et un minimum de
//     participants (3 et 11) : cela ne tient pas dans un bouton.
//
// Composant serveur, sans état. Comme la grille, il ne lit aucun
// prix ni quota en dur : tout vient des props.
//
// Charte : velours, sur-titre, text-encre-*, text-or-ros-*,
// text-grenat-*. Titres h3/h4 sous le h2 de la page.
// ============================================================

import type { OffreAutre } from './types';

interface Props {
  offres: readonly OffreAutre[];
}

/** « 2 400 F CFA » / « Gratuit » / « Sur dossier » (0 ou absent). */
function formaterPrix(prixXof: number | undefined): string {
  if (typeof prixXof !== 'number' || !Number.isFinite(prixXof) || prixXof <= 0) {
    return 'Sur dossier';
  }
  return `${prixXof.toLocaleString('fr-FR')} F CFA`;
}

/** Rythme de facturation : « / mois », « / an », ''. */
function rythme(dureeJours: number | undefined): string {
  if (typeof dureeJours !== 'number' || dureeJours <= 0) return '';
  if (dureeJours >= 360) return ' / an';
  if (dureeJours >= 28) return ' / mois';
  return ` / ${dureeJours} jours`;
}

export default function AutresOffres({ offres }: Props) {
  if (!offres || offres.length === 0) return null;

  return (
    <section className="mt-10" aria-labelledby="autres-offres-titre">
      <p className="sur-titre text-or-ros-300">Autres offres</p>
      <h3
        id="autres-offres-titre"
        className="font-display text-2xl text-encre-100 mt-2"
      >
        Sur dossier, hors achat en ligne
      </h3>
      <p className="text-encre-500 text-sm mt-2 italic leading-relaxed max-w-2xl">
        Ces formules ne passent pas par le bouton d’achat : elles
        demandent une vérification de statut, ou bien un effectif
        minimum et un devis au nom de la structure.
      </p>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4 list-none p-0">
        {offres.map((offre) => {
          const prix = formaterPrix(offre.prixXof);
          const parPers = offre.parPersonne
            ? ' / personne'
            : '';
          const minimum =
            typeof offre.minPersonnes === 'number' && offre.minPersonnes > 1
              ? `À partir de ${offre.minPersonnes} personnes`
              : null;

          return (
            <li key={offre.code} className="flex">
              <article
                className="velours p-5 flex flex-col w-full"
                aria-label={`Offre ${offre.nom} — non disponible à l’achat en ligne`}
              >
                <h4 className="sur-titre text-encre-300 m-0">{offre.nom}</h4>

                <p className="font-display text-2xl text-encre-100 mt-3">
                  {prix}
                  <span className="text-sm text-encre-500">
                    {parPers}
                    {rythme(offre.dureeJours)}
                  </span>
                </p>

                {minimum && (
                  <p className="text-or-ros-300 text-xs mt-1 uppercase tracking-wider">
                    {minimum}
                  </p>
                )}

                {offre.verificationRequise && (
                  <p className="mt-2">
                    <span className="rounded-full border border-or-ros-300/50 bg-or-ros-300/10 text-or-ros-300 text-[10px] uppercase tracking-wider px-2.5 py-1">
                      Vérification de statut requise
                    </span>
                  </p>
                )}

                {offre.resume && (
                  <p className="text-encre-500 text-sm mt-3 italic leading-relaxed">
                    {offre.resume}
                  </p>
                )}

                {(offre.avantages ?? []).length > 0 && (
                  <ul className="mt-4 space-y-1.5 text-[13px] text-encre-300 leading-relaxed list-disc pl-5 flex-1">
                    {(offre.avantages ?? []).map((ligne) => (
                      <li key={ligne}>{ligne}</li>
                    ))}
                  </ul>
                )}

                {offre.note && (
                  <p className="text-encre-500 text-xs mt-4 leading-relaxed">
                    {offre.note}
                  </p>
                )}

                {/* Verrou explicite, non interactif : pas de bouton,
                    pas de lien /paiement pour ces offres. */}
                <p className="mt-4 pt-3 border-t border-nuit-700 text-encre-500 text-xs italic">
                  Non disponible à l’achat en ligne pour l’instant.
                </p>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

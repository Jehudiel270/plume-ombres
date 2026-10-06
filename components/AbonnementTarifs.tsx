// ============================================================
// components/AbonnementTarifs.tsx — Grille d'abonnement (Lot C).
//
// Refonte : la grille PUBLIQUE = 4 offres (Gratuit, Lecteur mensuel,
// Passionné mensuel, Illimité mensuel) ; chaque mensuel payant porte
// sa variante ANNUELLE « 2 mois offerts » SUR SA CARTE ; en dessous,
// la section « autres offres » (Étudiant / Groupe / École) affichée
// mais NON achetable en ligne.
//
// Les packs de crédits restent rendus par components/AbonnementCredits.tsx
// (hors de ce composant, non modifié).
//
// CE COMPOSANT NE LIT AUCUN PRIX NI QUOTA : tout lui arrive par props,
// sous forme d'objets déjà résolus par la source de vérité
// (public.plans_abonnement). Le nom de prop `plans` est conservé pour
// ne pas casser l'appel existant ; le type est volontairement
// structurel (voir components/abonnement/types.ts) pour qu'un tableau
// de plans plus riche reste assignable.
//
// Charte : velours, sur-titre, bouton-principal, bouton-fantome,
// liseret, texte-douche, text-encre-*, text-grenat-*, text-violet-rom-*.
// ============================================================

import CarteOffre from './abonnement/CarteOffre';
import AutresOffres from './abonnement/AutresOffres';
import type { GrilleTarifsProps } from './abonnement/types';

export type {
  VarianteAnnuelle,
  OffrePublique,
  OffreAutre,
  GrilleTarifsProps,
} from './abonnement/types';

export default function AbonnementTarifs({
  plans,
  autresOffres = [],
  planActuel,
  premium,
  simulation,
}: GrilleTarifsProps) {
  return (
    <div>
      {plans && plans.length > 0 ? (
        <ul
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 list-none p-0 m-0"
          aria-label="Offres d’abonnement"
        >
          {plans.map((offre) => (
            <li key={offre.code} className="flex">
              <div className="w-full">
                <CarteOffre
                  offre={offre}
                  planActuel={planActuel}
                  premium={premium}
                  simulation={simulation}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-encre-500 text-sm italic">
          Les offres seront affichées dès que le catalogue sera disponible.
        </p>
      )}

      <AutresOffres offres={autresOffres} />
    </div>
  );
}

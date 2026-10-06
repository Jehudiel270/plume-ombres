// ============================================================
// components/abonnement/CarteOffre.tsx — Carte d'une offre PUBLIQUE.
//
// Composant serveur, sans état. Reçoit une offre déjà résolue et
// affiche :
//   · le prix de la période et le quota mensuel ;
//   · ses avantages ;
//   · le bouton d'achat de la formule de base (sauf gratuit / offre
//     déjà active sur le compte) ;
//   · la variante ANNUELLE « 2 mois offerts » rattachée à la même
//     carte — jamais une carte séparée.
//
// Aucune valeur de prix, de quota ou de durée n'est écrite ici : la
// remise et le nombre de mois offerts sont CALCULÉS à partir des
// montants reçus en props.
//
// Charte : classes du projet (velours, sur-titre, bouton-principal,
// bouton-fantome, text-encre-*, text-violet-rom-*, text-or-ros-*).
// Accessibilité : titre de niveau h3 cohérent sous le h2 de la page,
// aria-label explicites, cibles ≥ 44 px (garanti par les classes
// bouton-* dans globals.css), focus visible (idem).
// ============================================================

import Link from 'next/link';
import type { OffrePublique } from './types';

interface Props {
  offre: OffrePublique;
  planActuel: string;
  premium: boolean;
  simulation: boolean;
}

/** « 1 500 F CFA » / « Gratuit ». */
function formaterPrix(prixXof: number): string {
  if (!Number.isFinite(prixXof) || prixXof <= 0) return 'Gratuit';
  return `${prixXof.toLocaleString('fr-FR')} F CFA`;
}

/** « 1 200 000 caractères / mois », ou null si non renseigné. */
function formaterQuota(quota: number | undefined): string | null {
  if (typeof quota !== 'number' || !Number.isFinite(quota) || quota <= 0) {
    return null;
  }
  return `${quota.toLocaleString('fr-FR')} caractères / mois`;
}

/**
 * Remise réelle de la formule annuelle, en pour cent entier :
 * 1 − prixAnnuel / (prixMensuel × 12). Renvoie null si non calculable
 * ou si elle n'est pas strictement positive.
 */
function remiseCalculee(prixMensuel: number, prixAnnuel: number): number | null {
  if (
    !Number.isFinite(prixMensuel) ||
    !Number.isFinite(prixAnnuel) ||
    prixMensuel <= 0 ||
    prixAnnuel <= 0
  ) {
    return null;
  }
  const remise = Math.round((1 - prixAnnuel / (prixMensuel * 12)) * 100);
  return remise > 0 ? remise : null;
}

/** Équivalent en mois offerts : 12 − prixAnnuel / prixMensuel (arrondi). */
function moisOfferts(prixMensuel: number, prixAnnuel: number): number | null {
  if (prixMensuel <= 0 || prixAnnuel <= 0) return null;
  const mois = Math.round(12 - prixAnnuel / prixMensuel);
  return mois > 0 ? mois : null;
}

export default function CarteOffre({
  offre,
  planActuel,
  premium,
  simulation,
}: Props) {
  const payant = offre.prixXof > 0;
  const courant = offre.code === planActuel;
  const actifCompte = payant && courant && premium;

  const quota = formaterQuota(offre.quotaMensuelCaracteres);
  const avantages = offre.avantages ?? [];

  const annuel = offre.annuel ?? null;
  const remise =
    annuel &&
    (annuel.remisePourcent ??
      remiseCalculee(offre.prixXof, annuel.prixXof) ??
      undefined);
  const mois =
    annuel && (moisOfferts(offre.prixXof, annuel.prixXof) ?? undefined);
  const annuelCourant = !!annuel && annuel.code === planActuel && premium;

  return (
    <article
      className={`velours p-6 flex flex-col relative overflow-hidden ${
        courant ? 'border border-violet-rom-500/50' : ''
      }`}
      aria-label={`Offre ${offre.nom} — ${formaterPrix(offre.prixXof)}`}
    >
      {courant && (
        <div className="absolute top-5 right-5">
          <span className="rounded-full border border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300 text-[10px] uppercase tracking-wider px-2.5 py-1">
            votre offre
          </span>
        </div>
      )}

      <h3 className="sur-titre text-violet-rom-300 m-0">{offre.nom}</h3>

      <p className="font-display text-4xl text-encre-100 mt-3">
        {formaterPrix(offre.prixXof)}
        {payant && (
          <span className="text-base text-encre-500">
            {' '}
            {offre.dureeJours && offre.dureeJours >= 360 ? '/ an' : '/ mois'}
          </span>
        )}
      </p>

      {offre.resume && (
        <p className="text-encre-500 text-sm mt-2 italic leading-relaxed">
          {offre.resume}
        </p>
      )}

      {quota && (
        <p className="text-encre-300 text-sm mt-3 font-semibold">{quota}</p>
      )}

      <ul className="mt-5 space-y-2 text-sm text-encre-300 leading-relaxed list-disc pl-5 flex-1">
        {avantages.map((ligne) => (
          <li key={ligne}>{ligne}</li>
        ))}
      </ul>

      {/* ---------- Formule de base ---------- */}
      {!payant && (
        <span className="mt-6 text-encre-500 text-sm italic">
          {courant ? 'Inclus par défaut' : 'Toujours inclus'}
        </span>
      )}

      {actifCompte && (
        <span className="mt-6 text-violet-rom-300 text-sm">
          Actif sur votre compte
        </span>
      )}

      {payant && !actifCompte && (
        <Link
          href={`/paiement/${offre.code}`}
          className="bouton-principal mt-6 justify-center"
          aria-label={
            simulation
              ? `Tester l’offre ${offre.nom} en simulation`
              : `Souscrire à l’offre ${offre.nom}, ${formaterPrix(offre.prixXof)} par mois`
          }
        >
          {simulation
            ? `Tester ${offre.nom} (simulation)`
            : `Souscrire — ${offre.nom}`}
        </Link>
      )}

      {/* ---------- Variante annuelle (−X %, N mois offerts) ---------- */}
      {annuel && (
        <div className="mt-4 pt-4 border-t border-nuit-700">
          <p className="text-[11px] uppercase tracking-wider text-or-ros-300">
            Ou à l’année
            {mois ? ` — ${mois} mois offerts` : ''}
            {remise ? ` (−${remise} %)` : ''}
          </p>

          {annuelCourant ? (
            <span className="mt-2 block text-or-ros-300 text-sm">
              Formule annuelle active sur votre compte
            </span>
          ) : (
            <Link
              href={`/paiement/${annuel.code}`}
              className="bouton-fantome mt-2 w-full justify-center"
              aria-label={
                simulation
                  ? `Tester la formule annuelle ${offre.nom} en simulation`
                  : `Souscrire à la formule annuelle ${offre.nom}, ${formaterPrix(annuel.prixXof)} par an`
              }
            >
              {formaterPrix(annuel.prixXof)} / an
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

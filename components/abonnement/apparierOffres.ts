// ============================================================
// components/abonnement/apparierOffres.ts — Adaptateur d'AFFICHAGE (Lot C).
//
// Fonction PURE (aucun import de '@/lib', aucune valeur en dur) qui
// transforme une liste de plans DÉJÀ RÉSOLUS — la sortie de
// lib/plans-catalogue.ts, avec ses 13 lignes — en deux jeux prêts
// pour la grille :
//   · `offres` : les 4 offres PUBLIQUES, chacune portant sa variante
//     annuelle « 2 mois offerts » (jamais une carte séparée) ;
//   · `autres` : Étudiant / Groupe / École, non achetables en ligne.
//
// L'appariement mensuel ↔ annuel suit la convention de codes de la
// base : `X_mensuel` ↔ `X_annuel`. Les plans masqués, legacy, aliasés,
// inactifs, l'essai et ceux d'une catégorie hors ligne sont EXCLUS de
// la grille publique (la base est la source de vérité).
//
// NOTE D'INTÉGRATION : ce module est fourni pour la page ; il peut
// être ignoré si l'appelant construit lui-même le champ `annuel`.
// ============================================================

import type { OffreAutre, OffrePublique, VarianteAnnuelle } from './types';

/** Forme MINIMALE d'un plan résolu, compatible avec PlanAbonnement. */
export interface PlanLike {
  code: string;
  nom: string;
  resume?: string;
  prixXof: number;
  dureeJours?: number;
  quotaMensuelCaracteres?: number;
  categorie?: string;
  actif?: boolean;
  masque?: boolean;
  aliasDe?: string | null;
  avantages?: readonly string[];
  parPersonne?: boolean;
  minPersonnes?: number;
  verificationRequise?: boolean;
}

const CATEGORIES_HORS_LIGNE = ['etudiant', 'groupe', 'ecole'];

/** Vrai si le plan est une variante annuelle (durée ≥ 360 jours). */
function estAnnuel(p: PlanLike): boolean {
  return typeof p.dureeJours === 'number' && p.dureeJours >= 360;
}

/** Un plan est RETENU s'il est actif, non masqué, non legacy, non aliasé. */
function retenu(p: PlanLike): boolean {
  return (
    p.actif !== false &&
    p.masque !== true &&
    !p.aliasDe &&
    p.categorie !== 'legacy' &&
    p.categorie !== 'essai' &&
    p.categorie !== 'pack'
  );
}

/** Code annuel associé à un code mensuel, par convention de la base. */
function codeAnnuelDepuis(codeMensuel: string): string | null {
  if (codeMensuel.endsWith('_mensuel')) {
    return `${codeMensuel.slice(0, -'_mensuel'.length)}_annuel`;
  }
  return null;
}

/** Découpe une liste de plans en { offres publiques, autres offres }. */
export function apparierOffres(plans: readonly PlanLike[]): {
  offres: OffrePublique[];
  autres: OffreAutre[];
} {
  const retenus = plans.filter(retenu);
  const parCode = new Map(retenus.map((p) => [p.code, p]));

  const offres: OffrePublique[] = [];
  for (const p of retenus) {
    if (p.categorie === 'gratuit') {
      offres.push({
        code: p.code,
        nom: p.nom,
        resume: p.resume,
        prixXof: p.prixXof,
        dureeJours: p.dureeJours,
        quotaMensuelCaracteres: p.quotaMensuelCaracteres,
        avantages: p.avantages,
      });
      continue;
    }
    // Offres individuelles MENSUELLES uniquement (l'annuel devient
    // une variante, pas une carte).
    if (p.categorie === 'individuel' && !estAnnuel(p)) {
      const codeAnnuel = codeAnnuelDepuis(p.code);
      const annuelPlan = codeAnnuel ? parCode.get(codeAnnuel) : undefined;
      const annuel: VarianteAnnuelle | null = annuelPlan
        ? {
            code: annuelPlan.code,
            prixXof: annuelPlan.prixXof,
            dureeJours: annuelPlan.dureeJours,
          }
        : null;
      offres.push({
        code: p.code,
        nom: p.nom,
        resume: p.resume,
        prixXof: p.prixXof,
        dureeJours: p.dureeJours,
        quotaMensuelCaracteres: p.quotaMensuelCaracteres,
        avantages: p.avantages,
        annuel,
      });
    }
  }

  const autres: OffreAutre[] = retenus
    .filter(
      (p) =>
        typeof p.categorie === 'string' &&
        CATEGORIES_HORS_LIGNE.includes(p.categorie)
    )
    .map((p) => ({
      code: p.code,
      nom: p.nom,
      resume: p.resume,
      prixXof: p.prixXof,
      parPersonne: p.parPersonne,
      minPersonnes: p.minPersonnes,
      dureeJours: p.dureeJours,
      verificationRequise: p.verificationRequise,
      quotaMensuelCaracteres: p.quotaMensuelCaracteres,
      avantages: p.avantages,
    }));

  return { offres, autres };
}

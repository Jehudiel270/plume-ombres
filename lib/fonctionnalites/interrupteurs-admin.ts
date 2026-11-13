// ============================================================
// lib/fonctionnalites/interrupteurs-admin.ts — Mapper partagé.
//
// Met en forme les interrupteurs (définition du registre + état
// effectif) pour LES DEUX écrans d'administration qui montrent le
// même contenu :
//   * la page dédiée /admin/fonctionnalites ;
//   * l'onglet « Fonctionnalités » du tableau de bord (/admin).
// Une seule mise en forme, deux chemins d'accès : toute évolution
// du modèle passe ICI.
//
// Fichier PUR côté données (normalisation défensive) : il ne parle
// ni à Supabase ni au réseau — il transforme ce qu'on lui donne.
// ============================================================

import type { DefInterrupteur, NiveauPlan } from './registre';
import type { EtatInterrupteur } from './registre';

/** Interrupteur tel que l'affiche l'administration. */
export interface InterrupteurAdmin {
  cle: string;
  code: string;
  libelle: string;
  groupe: string;
  description: string;
  itineraires: string[];
  api: string[];
  risqueJuridique: boolean;
  noteJuridique: string | null;
  sansItineraire: string | null;
  etat: {
    actif: boolean;
    planMinimal: NiveauPlan | null;
    deploiement: number;
    juristeOk: boolean;
    majLe: string | null;
    majPar: string | null;
  };
}

/** Normalise une définition + son état en ligne d'affichage. */
function versInterrupteur(def: DefInterrupteur, etat: EtatInterrupteur): InterrupteurAdmin {
  const deploiementBrut = (etat as { deploiement?: unknown }).deploiement;
  return {
    cle: def.cle,
    code: def.code,
    libelle: def.libelle,
    groupe: def.groupe,
    description: def.description,
    itineraires: [...(def.itineraires ?? [])],
    api: [...(def.api ?? [])],
    risqueJuridique: def.risqueJuridique === true,
    noteJuridique: def.noteJuridique ?? null,
    sansItineraire: def.sansItineraire ?? null,
    etat: {
      actif: etat.actif === true,
      planMinimal: (etat.planMinimal ?? null) as NiveauPlan | null,
      deploiement:
        typeof deploiementBrut === 'number' && Number.isFinite(deploiementBrut)
          ? Math.max(0, Math.min(100, Math.round(deploiementBrut)))
          : 0,
      juristeOk: etat.juristeOk === true,
      majLe: etat.majLe ?? null,
      majPar: etat.majPar ?? null,
    },
  };
}

/** Liste mise en forme pour l'administration. */
export function versInterrupteursAdmin(
  liste: ReadonlyArray<{ def: DefInterrupteur; etat: EtatInterrupteur }>
): InterrupteurAdmin[] {
  return liste.map(({ def, etat }) => versInterrupteur(def, etat));
}

/** Nombre de modules actuellement OUVERTS (pastille de l'onglet). */
export function compterModulesOuverts(interrupteurs: readonly InterrupteurAdmin[]): number {
  return interrupteurs.filter((i) => i.etat.actif).length;
}

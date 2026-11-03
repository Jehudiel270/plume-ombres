// ============================================================
// lib/admin-paiements.ts — Logique PURE du suivi des paiements.
//
// Aucune dépendance à React ni à Supabase : on reçoit les lignes déjà
// chargées par la RPC `admin_lister_paiements` (voir lib/admin-stats.ts)
// et on rend des filtres, des agrégats et une série quotidienne.
// C'est ce qui rend l'écran testable et identique entre le tableau et
// l'export CSV.
// ============================================================

import type { PaiementAdmin } from '@/lib/admin-stats';

export type PeriodePaiements = 'aujourd_hui' | 'sept_jours' | 'trente_jours' | 'tout';

export interface FiltresPaiements {
  /** Texte libre : référence, pseudonyme, plan, opérateur, montant. */
  recherche: string;
  /** Statut technique ('reussi', 'echoue', …) ou 'tous'. */
  statut: string;
  /** Fournisseur ('fedapay', 'simulation', …) ou 'tous'. */
  fournisseur: string;
  periode: PeriodePaiements;
}

export const FILTRES_VIDES: FiltresPaiements = {
  recherche: '',
  statut: 'tous',
  fournisseur: 'tous',
  periode: 'tout',
};

/** Libellés lisibles — l'interface n'affiche jamais l'énumération brute. */
const LIBELLES_STATUT: Record<string, string> = {
  reussi: 'Réussi',
  en_attente: 'En attente',
  echoue: 'Échoué',
  annule: 'Annulé',
  rembourse: 'Remboursé',
};

export function libelleStatut(statut: string): string {
  return LIBELLES_STATUT[statut] ?? statut;
}

/** Un paiement compte-t-il comme encaissé ? */
export function estEncaisse(paiement: PaiementAdmin): boolean {
  return paiement.statut === 'reussi';
}

const JOUR_MS = 24 * 60 * 60 * 1000;

/**
 * Borne basse de la période demandée, en millisecondes.
 * `null` = aucune borne (période « tout »).
 */
export function debutPeriode(
  periode: PeriodePaiements,
  maintenant: Date
): number | null {
  const debutJour = new Date(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    maintenant.getDate()
  ).getTime();

  switch (periode) {
    case 'aujourd_hui':
      return debutJour;
    case 'sept_jours':
      return debutJour - 6 * JOUR_MS;
    case 'trente_jours':
      return debutJour - 29 * JOUR_MS;
    default:
      return null;
  }
}

function texteNormalise(valeur: string | null | undefined): string {
  return (valeur ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Le paiement satisfait-il la recherche libre ? */
function correspondRecherche(paiement: PaiementAdmin, recherche: string): boolean {
  const terme = texteNormalise(recherche.trim());
  if (!terme) return true;
  const foin = texteNormalise(
    [
      paiement.reference,
      paiement.pseudo,
      paiement.plan ?? '',
      paiement.fournisseur ?? '',
      paiement.operateur ?? '',
      paiement.referenceFournisseur ?? '',
      String(paiement.montant),
    ].join(' ')
  );
  return terme.split(/\s+/).every((mot) => foin.includes(mot));
}

/** Applique les filtres de l'écran. Ne modifie jamais l'entrée. */
export function filtrerPaiements(
  paiements: readonly PaiementAdmin[],
  filtres: FiltresPaiements,
  maintenant: Date = new Date()
): PaiementAdmin[] {
  const borne = debutPeriode(filtres.periode, maintenant);
  return paiements.filter((paiement) => {
    if (filtres.statut !== 'tous' && paiement.statut !== filtres.statut) return false;
    if (filtres.fournisseur !== 'tous' && paiement.fournisseur !== filtres.fournisseur) {
      return false;
    }
    if (borne !== null) {
      const date = paiement.creeLe ? Date.parse(paiement.creeLe) : Number.NaN;
      // Une date illisible n'entre pas dans une période bornée : mieux vaut
      // la cacher que de la faire passer pour récente.
      if (!Number.isFinite(date) || date < borne) return false;
    }
    return correspondRecherche(paiement, filtres.recherche);
  });
}

export interface PointSerie {
  /** Jour au format AAAA-MM-JJ. */
  jour: string;
  encaisse: number;
  nombre: number;
}

export interface AgregatsPaiements {
  nombre: number;
  volume: number;
  panierMoyen: number;
  tauxSucces: number;
  parStatut: { statut: string; libelle: string; nombre: number; montant: number }[];
  parFournisseur: { fournisseur: string; nombre: number; montant: number }[];
  serie: PointSerie[];
}

/** Agrège un jeu de paiements déjà filtré. */
export function agregerPaiements(
  paiements: readonly PaiementAdmin[],
  nombreDeJours = 30
): AgregatsPaiements {
  const parStatut = new Map<string, { nombre: number; montant: number }>();
  const parFournisseur = new Map<string, { nombre: number; montant: number }>();
  const parJour = new Map<string, { encaisse: number; nombre: number }>();

  let volume = 0;
  let encaisses = 0;

  for (const paiement of paiements) {
    const montant = Number.isFinite(paiement.montant) ? paiement.montant : 0;

    const statut = parStatut.get(paiement.statut) ?? { nombre: 0, montant: 0 };
    statut.nombre += 1;
    statut.montant += montant;
    parStatut.set(paiement.statut, statut);

    const fournisseur = paiement.fournisseur ?? 'inconnu';
    const f = parFournisseur.get(fournisseur) ?? { nombre: 0, montant: 0 };
    f.nombre += 1;
    f.montant += montant;
    parFournisseur.set(fournisseur, f);

    if (estEncaisse(paiement)) {
      volume += montant;
      encaisses += 1;
      if (paiement.creeLe) {
        const jour = paiement.creeLe.slice(0, 10);
        const point = parJour.get(jour) ?? { encaisse: 0, nombre: 0 };
        point.encaisse += montant;
        point.nombre += 1;
        parJour.set(jour, point);
      }
    }
  }

  return {
    nombre: paiements.length,
    volume,
    panierMoyen: encaisses === 0 ? 0 : Math.round(volume / encaisses),
    tauxSucces: paiements.length === 0 ? 0 : encaisses / paiements.length,
    parStatut: [...parStatut.entries()]
      .map(([statut, valeur]) => ({
        statut,
        libelle: libelleStatut(statut),
        nombre: valeur.nombre,
        montant: valeur.montant,
      }))
      .sort((a, b) => b.nombre - a.nombre),
    parFournisseur: [...parFournisseur.entries()]
      .map(([fournisseur, valeur]) => ({ fournisseur, ...valeur }))
      .sort((a, b) => b.montant - a.montant),
    serie: serieQuotidienne(parJour, nombreDeJours),
  };
}

/**
 * Série continue sur `nombreDeJours`, jours sans paiement inclus : un
 * graphique à trous se lit mal.
 */
function serieQuotidienne(
  parJour: Map<string, { encaisse: number; nombre: number }>,
  nombreDeJours: number
): PointSerie[] {
  const points: PointSerie[] = [];
  const aujourdHui = new Date();
  const base = Date.UTC(
    aujourdHui.getFullYear(),
    aujourdHui.getMonth(),
    aujourdHui.getDate()
  );

  for (let i = nombreDeJours - 1; i >= 0; i -= 1) {
    const jour = new Date(base - i * JOUR_MS).toISOString().slice(0, 10);
    const valeur = parJour.get(jour);
    points.push({
      jour,
      encaisse: valeur?.encaisse ?? 0,
      nombre: valeur?.nombre ?? 0,
    });
  }
  return points;
}

/** Valeurs présentes, pour alimenter les menus déroulants. */
export function valeursDisponibles(paiements: readonly PaiementAdmin[]): {
  statuts: { valeur: string; libelle: string }[];
  fournisseurs: string[];
} {
  const statuts = new Set<string>();
  const fournisseurs = new Set<string>();
  for (const paiement of paiements) {
    statuts.add(paiement.statut);
    if (paiement.fournisseur) fournisseurs.add(paiement.fournisseur);
  }
  return {
    statuts: [...statuts].map((valeur) => ({ valeur, libelle: libelleStatut(valeur) })),
    fournisseurs: [...fournisseurs],
  };
}

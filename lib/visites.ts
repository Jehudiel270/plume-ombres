// ============================================================
// lib/visites.ts — Lecture défensive des agrégats d'audience.
//
// La fonction SQL public.admin_stats_visites() renvoie un jsonb ; on ne
// lui fait pas confiance aveuglément : si une clé manque (base plus
// ancienne, migration partielle), l'écran doit s'afficher vide plutôt
// que planter.
// ============================================================

export interface PointJour {
  jour: string;
  visites: number;
  uniques: number;
}

export interface LigneComptage {
  libelle: string;
  visites: number;
}

export interface StatsVisites {
  jours: number;
  totaux: { visites: number; uniques: number; aujourdhui: number; hier: number };
  parJour: PointJour[];
  pages: LigneComptage[];
  sources: LigneComptage[];
  appareils: LigneComptage[];
}

const VIDE: StatsVisites = {
  jours: 0,
  totaux: { visites: 0, uniques: 0, aujourdhui: 0, hier: 0 },
  parJour: [],
  pages: [],
  sources: [],
  appareils: [],
};

function entier(valeur: unknown): number {
  const nombre = typeof valeur === 'number' ? valeur : Number(valeur);
  return Number.isFinite(nombre) && nombre >= 0 ? Math.round(nombre) : 0;
}

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur : '';
}

function liste(brut: unknown, cleLibelle: string): LigneComptage[] {
  if (!Array.isArray(brut)) return [];
  const lignes: LigneComptage[] = [];
  for (const element of brut) {
    if (typeof element !== 'object' || element === null) continue;
    const objet = element as Record<string, unknown>;
    const libelle = texte(objet[cleLibelle]);
    if (!libelle) continue;
    lignes.push({ libelle, visites: entier(objet.visites) });
  }
  return lignes;
}

/** Normalise le jsonb renvoyé par la base. Ne lève jamais. */
export function normaliserVisites(brut: unknown): StatsVisites {
  if (typeof brut !== 'object' || brut === null) return VIDE;
  const objet = brut as Record<string, unknown>;
  const totaux = (typeof objet.totaux === 'object' && objet.totaux !== null
    ? objet.totaux
    : {}) as Record<string, unknown>;

  const parJourBrut = Array.isArray(objet.parJour) ? objet.parJour : [];
  const parJour: PointJour[] = [];
  for (const element of parJourBrut) {
    if (typeof element !== 'object' || element === null) continue;
    const ligne = element as Record<string, unknown>;
    const jour = texte(ligne.jour).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) continue;
    parJour.push({
      jour,
      visites: entier(ligne.visites),
      uniques: entier(ligne.uniques),
    });
  }

  return {
    jours: entier(objet.jours),
    totaux: {
      visites: entier(totaux.visites),
      uniques: entier(totaux.uniques),
      aujourdhui: entier(totaux.aujourdhui),
      hier: entier(totaux.hier),
    },
    parJour,
    pages: liste(objet.pages, 'chemin'),
    sources: liste(objet.sources, 'source'),
    appareils: liste(objet.appareils, 'appareil'),
  };
}

/** Écart relatif entre deux jours, en points de pourcentage arrondis. */
export function evolution(aujourdhui: number, hier: number): number | null {
  if (hier <= 0) return null;
  return Math.round(((aujourdhui - hier) / hier) * 100);
}

// ============================================================
// lib/calendrier-lecture.ts — Calendrier de lecture (A19/A20,
// variante atelier) : règles pures.
//
// La maquette prévoyait un calendrier de SORTIES (chapitres mis à
// disposition par la plateforme). Ici, la plateforme ne publie pas
// de chapitres : l'atelier importe et traduit des fichiers privés.
// La variante honnête est donc un calendrier de VOTRE lecture :
//   * une grille mensuelle des chapitres découverts (XP posée) ;
//   * une série de jours consécutifs (avec « jours de repos »
//     volontaires, jamais punitive) ;
//   * les échéances des défis personnels posées sur le mois.
// Aucune donnée publique, aucun compte à rebours fictif.
// ============================================================

export interface JourLecture {
  /** Date ISO AAAA-MM-JJ. */
  jour: string;
  chapitres: number;
}

/** Nombre de jours d'un mois AAAA-MM. */
export function joursDansMois(mois: 'AAAA-MM' | string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(mois);
  if (!m) return 30;
  const annee = Number(m[1]);
  const moisNum = Number(m[2]);
  if (moisNum < 1 || moisNum > 12) return 30;
  return new Date(Date.UTC(annee, moisNum, 0)).getUTCDate();
}

/** Agrège des horodatages ISO en compte par jour d'un mois donné. */
export function aggregerMois(
  mois: string,
  horodatages: readonly string[]
): JourLecture[] {
  const total = joursDansMois(mois);
  const compte = new Map<string, number>();
  for (const h of horodatages) {
    if (typeof h !== 'string' || h.length < 10) continue;
    const jour = h.slice(0, 10);
    if (!jour.startsWith(mois)) continue;
    compte.set(jour, (compte.get(jour) ?? 0) + 1);
  }
  const jours: JourLecture[] = [];
  for (let j = 1; j <= total; j += 1) {
    const cle = `${mois}-${String(j).padStart(2, '0')}`;
    jours.push({ jour: cle, chapitres: compte.get(cle) ?? 0 });
  }
  return jours;
}

/**
 * Série de jours consécutifs (PUR). Les « jours de repos »
 * (`reposSemaine`, 0 = strict) pardonnent autant d'interruptions par
 * semaine civile sans casser la série : une lecture régulière sans
 * punition. Une série ne compte que les jours LUS.
 */
export function serieActuelle(
  horodatages: readonly string[],
  aujourdHuiISO: string,
  reposSemaine = 1
): number {
  const jours = new Set<string>();
  for (const h of horodatages) {
    if (typeof h === 'string' && h.length >= 10) jours.add(h.slice(0, 10));
  }
  if (jours.size === 0) return 0;

  const aujourdhui = new Date(`${aujourdHuiISO}T00:00:00Z`);
  if (Number.isNaN(aujourdhui.getTime())) return 0;

  // On remonte jour par jour depuis aujourd'hui (aujourd'hui lu ou
  // pas : la série compte depuis le dernier jour lu).
  let serie = 0;
  let reposRestants = reposSemaine;
  const curseur = new Date(aujourdhui);
  // Si aujourd'hui n'est pas lu, on tolère : la série continue à
  // partir d'hier (la journée n'est pas finie).
  if (!jours.has(aujourdHuiISO)) curseur.setUTCDate(curseur.getUTCDate() - 1);

  for (let i = 0; i < 366; i += 1) {
    const cle = curseur.toISOString().slice(0, 10);
    if (jours.has(cle)) {
      serie += 1;
      reposRestants = reposSemaine; // jour lu : le pardon repart
    } else {
      if (reposRestants <= 0) break;
      reposRestants -= 1;
    }
    curseur.setUTCDate(curseur.getUTCDate() - 1);
  }
  return serie;
}

/** Mois au format AAAA-MM (UTC) d'une date ISO quelconque. */
export function moisDe(jourISO: string): string {
  return (jourISO || '').slice(0, 7);
}

/** Décale un mois AAAA-MM de n mois (n négatif = en arrière). */
export function decalerMois(mois: string, n: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mois);
  if (!m) return mois;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Libellé français d'un mois AAAA-MM. */
const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function libelleMois(mois: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mois);
  if (!m) return mois;
  const idx = Number(m[2]) - 1;
  return `${MOIS_FR[idx] ?? mois} ${m[1]}`;
}

// ---------- Horodatages (pour les pages serveur) ----------
// Le rendu SSR ne doit pas appeler `Date.now()` ni `new Date()` en
// direct (conventions du projet) : ces enrobages concentrent l'appel
// impur en un point unique, documenté et testé une fois pour toutes.

/** Horodatage ISO du moment présent (appel impure assumé). */
export function horodatageMaintenant(): string {
  return new Date().toISOString();
}

/** Horodatage ISO d'il y a exactement un an. */
export function horodatageIlYaUnAn(): string {
  return new Date(Date.now() - 365 * 86_400_000).toISOString();
}

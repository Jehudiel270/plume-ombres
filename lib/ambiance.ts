// ============================================================
// lib/ambiance.ts — Fiches d'ambiance (F5) : règles pures.
//
// L'ambiance complète les avertissements de contenu existants
// (socle) : genres, tropes, intensité 1 → 5. Listes posées par le
// propriétaire du livre, plafonnées ici (pures, testées).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_GENRES = 5;
export const MAX_TROPES = 8;
export const MAX_MOT = 40;

export const INTENSITES = [1, 2, 3, 4, 5] as const;
export type Intensite = (typeof INTENSITES)[number];

export function estIntensite(valeur: unknown): valeur is Intensite {
  return (
    typeof valeur === 'number' &&
    Number.isInteger(valeur) &&
    (INTENSITES as readonly number[]).includes(valeur)
  );
}

export function libelleIntensite(intensite: Intensite): string {
  switch (intensite) {
    case 1:
      return 'Discret';
    case 2:
      return 'Voilé';
    case 3:
      return 'Affirmé';
    case 4:
      return 'Sombre';
    default:
      return 'Très sombre';
  }
}

/** Analyse une ligne « gothique, ennemis à amants » : plafonnée, propre. */
export function analyserListe(ligne: string, maximum: number): string[] {
  return ligne
    .split(',')
    .map((t) => t.trim().slice(0, MAX_MOT))
    .filter(Boolean)
    .slice(0, maximum);
}

export interface FicheAmbiance extends FicheRiche {
  livre_id: string;
  genres: string[];
  tropes: string[];
  intensite: Intensite;
}

/** Fiche vide (livre sans richesse encore saisie). */
export function ficheVide(livreId: string, base?: Partial<FicheAmbiance>): FicheAmbiance {
  return {
    livre_id: livreId,
    genres: base?.genres ?? [],
    tropes: base?.tropes ?? [],
    intensite: base?.intensite ?? 3,
    palette: base?.palette ?? [],
    atmosphere: base?.atmosphere ?? null,
    ton: base?.ton ?? null,
    rythmeNiveau: base?.rythmeNiveau ?? null,
    rythmeLabel: base?.rythmeLabel ?? null,
    promesses: base?.promesses ?? [],
    playlistNom: base?.playlistNom ?? null,
    playlist: base?.playlist ?? [],
    citationOuverture: base?.citationOuverture ?? null,
    motsCles: base?.motsCles ?? [],
  };
}

/** Charge (ou initialise) les fiches des livres du compte. */
export async function chargerAmbiances(
  client: SupabaseClient
): Promise<Map<string, FicheAmbiance>> {
  const { data, error } = await client
    .from('ambiance_livres')
    .select(
      'livre_id, genres, tropes, intensite, palette, atmosphere, ton, rythme_niveau, rythme_label, promesses, playlist_nom, playlist, citation_ouverture, mots_cles'
    )
    .limit(200);
  if (error) throw new Error(error.message);
  const fiches = new Map<string, FicheAmbiance>();
  for (const ligne of (data ?? []) as Array<Record<string, unknown>>) {
    const livreId = ligne.livre_id as string;
    const intensiteBrute = Number(ligne.intensite);
    const paletteBrute = ligne.palette as unknown;
    const playlistBrute = ligne.playlist as unknown;
    fiches.set(
      livreId,
      ficheVide(livreId, {
        genres: Array.isArray(ligne.genres) ? (ligne.genres as string[]) : [],
        tropes: Array.isArray(ligne.tropes) ? (ligne.tropes as string[]) : [],
        intensite: estIntensite(intensiteBrute) ? intensiteBrute : 3,
        palette: Array.isArray(paletteBrute)
          ? (paletteBrute as unknown[]).flatMap((c) =>
              c && typeof c === 'object' &&
              typeof (c as { nom?: unknown }).nom === 'string' &&
              estHexCouleur((c as { hex?: unknown }).hex)
                ? [
                    {
                      nom: (c as { nom: string }).nom,
                      hex: (c as { hex: string }).hex.toLowerCase(),
                    },
                  ]
                : []
            )
          : [],
        atmosphere: (ligne.atmosphere as string | null) ?? null,
        ton: (ligne.ton as string | null) ?? null,
        rythmeNiveau: estIntensite(ligne.rythme_niveau) ? ligne.rythme_niveau : null,
        rythmeLabel: (ligne.rythme_label as string | null) ?? null,
        promesses: Array.isArray(ligne.promesses) ? (ligne.promesses as string[]) : [],
        playlistNom: (ligne.playlist_nom as string | null) ?? null,
        playlist: Array.isArray(playlistBrute)
          ? (playlistBrute as unknown[]).flatMap((p) => {
              const e = p as { titre?: unknown; humeur?: unknown; minutes?: unknown } | null;
              if (!e || typeof e.titre !== 'string' || !e.titre.trim()) return [];
              const minutes = Math.round(Number(e.minutes));
              return [
                {
                  titre: e.titre,
                  humeur: typeof e.humeur === 'string' ? e.humeur : '',
                  minutes: Number.isFinite(minutes)
                    ? Math.min(30, Math.max(1, minutes))
                    : 3,
                },
              ];
            })
          : [],
        citationOuverture: (ligne.citation_ouverture as string | null) ?? null,
        motsCles: Array.isArray(ligne.mots_cles) ? (ligne.mots_cles as string[]) : [],
      })
    );
  }
  return fiches;
}

/** Crée ou met à jour la fiche d'un livre (upsert, RLS « own ») :
 *  socle (genres, tropes, intensité) ET richesse (palette,
 *  atmosphère, ton, rythme, promesses, playlist, citation,
 *  mots-clés). */
export async function enregistrerAmbiance(
  client: SupabaseClient,
  donnees: {
    livreId: string;
    genres: string[];
    tropes: string[];
    intensite: Intensite;
    riche: FicheRiche;
  }
): Promise<void> {
  const { error } = await client
    .from('ambiance_livres')
    .upsert({
      livre_id: donnees.livreId,
      genres: donnees.genres,
      tropes: donnees.tropes,
      intensite: donnees.intensite,
      palette: donnees.riche.palette,
      atmosphere: donnees.riche.atmosphere,
      ton: donnees.riche.ton,
      rythme_niveau: donnees.riche.rythmeNiveau,
      rythme_label: donnees.riche.rythmeLabel,
      promesses: donnees.riche.promesses,
      playlist_nom: donnees.riche.playlistNom,
      playlist: donnees.riche.playlist,
      citation_ouverture: donnees.riche.citationOuverture,
      mots_cles: donnees.riche.motsCles,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

// ============================================================
// FICHE RICHE (F5 v2) — reprise complète du cahier initial :
// palette de 5 couleurs nommées, atmosphère, ton, rythme (niveau
// 1 → 5 + libellé), promesses sans spoiler, playlist nommée
// (pistes : titre, humeur, minutes), citation d'ouverture du
// chapitre 1, mots-clés. Objectif : se remettre dans le ton d'une
// œuvre avant de la reprendre.
// ============================================================

export const MAX_COULEURS = 5;
export const MAX_PROMESSES = 6;
export const MAX_PISTES = 8;
export const MAX_MOTS_CLES = 8;
export const MAX_ATMOSPHERE = 280;
export const MAX_TON = 120;
export const MAX_RYTHME_LABEL = 80;
export const MAX_PLAYLIST_NOM = 120;
export const MAX_CITATION = 300;
export const MAX_NOM_COULEUR = 30;
export const MAX_TITRE_PISTE = 60;
export const MAX_HUMEUR = 60;

export interface CouleurPalette {
  nom: string;
  hex: string;
}

export interface PistePlaylist {
  titre: string;
  humeur: string;
  minutes: number;
}

export interface FicheRiche {
  palette: CouleurPalette[];
  atmosphere: string | null;
  ton: string | null;
  rythmeNiveau: Intensite | null;
  rythmeLabel: string | null;
  promesses: string[];
  playlistNom: string | null;
  playlist: PistePlaylist[];
  citationOuverture: string | null;
  motsCles: string[];
}

const REGEX_HEX = /^#[0-9a-f]{6}$/i;

/** Un code couleur est-il un hex #rrggbb ? */
export function estHexCouleur(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && REGEX_HEX.test(valeur.trim());
}

/** Palette saisie (JSON de la fiche) → palette propre, plafonnée à 5
 *  couleurs nommées. Les entrées invalides sont ignorées. */
export function nettoyerPalette(brut: unknown): CouleurPalette[] {
  if (!Array.isArray(brut)) return [];
  const palette: CouleurPalette[] = [];
  for (const element of brut) {
    if (palette.length >= MAX_COULEURS) break;
    if (!element || typeof element !== 'object') continue;
    const e = element as { nom?: unknown; hex?: unknown };
    const nom = typeof e.nom === 'string' ? e.nom.trim().slice(0, MAX_NOM_COULEUR) : '';
    const hex = typeof e.hex === 'string' ? e.hex.trim() : '';
    if (!nom || !estHexCouleur(hex)) continue;
    palette.push({ nom, hex: hex.toLowerCase() });
  }
  return palette;
}

/** Playlist saisie (JSON) → pistes propres : titre, humeur, minutes
 *  (1 → 30), plafonnées à 8. */
export function nettoyerPlaylist(brut: unknown): PistePlaylist[] {
  if (!Array.isArray(brut)) return [];
  const pistes: PistePlaylist[] = [];
  for (const element of brut) {
    if (pistes.length >= MAX_PISTES) break;
    if (!element || typeof element !== 'object') continue;
    const e = element as { titre?: unknown; humeur?: unknown; minutes?: unknown };
    const titre =
      typeof e.titre === 'string' ? e.titre.trim().slice(0, MAX_TITRE_PISTE) : '';
    const humeur =
      typeof e.humeur === 'string' ? e.humeur.trim().slice(0, MAX_HUMEUR) : '';
    const minutes = Math.round(Number(e.minutes));
    if (!titre) continue;
    pistes.push({
      titre,
      humeur,
      minutes: Number.isFinite(minutes) ? Math.min(30, Math.max(1, minutes)) : 3,
    });
  }
  return pistes;
}

/** Texte court optionnel (atmosphère, ton, libellé…). */
export function propreTexteRiche(brut: unknown, maximum: number): string | null {
  if (typeof brut !== 'string') return null;
  const propre = brut.trim().replace(/\s+/g, ' ').slice(0, maximum);
  return propre || null;
}

/** Lignes libres (promesses : une par ligne), plafonnées. */
export function lignesListe(brut: unknown, maximum: number): string[] {
  if (typeof brut !== 'string') return [];
  return brut
    .split('\n')
    .map((t) => t.trim().slice(0, MAX_MOT))
    .filter(Boolean)
    .slice(0, maximum);
}

/** Durée totale de la playlist, en minutes (PURE). */
export function dureePlaylist(pistes: PistePlaylist[]): number {
  return pistes.reduce((total, p) => total + p.minutes, 0);
}

/**
 * Score de recommandation entre deux fiches (PUR, testé) : genres
 * partagés (poids 2) + tropes partagés (poids 1). Zéro → rien à
 * recommander ; l'API ne propose jamais un livre sans lien.
 */
export function scoreRecommandation(
  source: { genres: string[]; tropes: string[] },
  candidate: { genres: string[]; tropes: string[] }
): { genres: string[]; tropes: string[]; score: number } {
  const genres = candidate.genres.filter((g) => source.genres.includes(g));
  const tropes = candidate.tropes.filter((t) => source.tropes.includes(t));
  return { genres, tropes, score: genres.length * 2 + tropes.length };
}

/** Libellés de l'échelle de rythme (1 → 5), du cahier initial. */
export const LIBELLES_RYTHME: readonly string[] = [
  '',
  'Très posé',
  'Posé',
  'Mesuré',
  'Soutenu',
  'Très rapide',
];

export function libelleRythme(niveau: number): string {
  return LIBELLES_RYTHME[Math.max(0, Math.min(5, Math.round(niveau)))] ?? '';
}

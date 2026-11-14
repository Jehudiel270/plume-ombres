// ============================================================
// lib/graphe.ts — Graphe narratif anti-spoilers (F25), portage
// fidèle de la maquette (components/narrative) : « l'arbre de
// l'histoire » — personnages d'importance variable, relations
// TYPÉES avec sens, intensité, état et fiabilité, et ÉVÉNEMENTS
// datés qui alimentent la chronologie.
//
// LE SERVEUR FILTRE : rien au-delà du chapitre lu ne quitte la
// base (ni nœud caché, ni relation floutée, ni événement futur).
// Helpers purs testés + accès DB via client serveur Supabase et
// RLS « own ».
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------- Rôles ----------
export type RoleGraphe =
  | 'protagoniste'
  | 'antagoniste'
  | 'allie'
  | 'secondaire'
  | 'autre';

const ROLES: readonly RoleGraphe[] = [
  'protagoniste',
  'antagoniste',
  'allie',
  'secondaire',
  'autre',
];

export function estRole(valeur: unknown): valeur is RoleGraphe {
  return typeof valeur === 'string' && (ROLES as readonly string[]).includes(valeur);
}

export function libelleRole(role: RoleGraphe): string {
  switch (role) {
    case 'protagoniste':
      return 'Protagoniste';
    case 'antagoniste':
      return 'Antagoniste';
    case 'allie':
      return 'Allié';
    case 'secondaire':
      return 'Secondaire';
    default:
      return 'Autre';
  }
}

// ---------- Types de relations (couleur de l'arête + légende) ----------
export type TypeRelation =
  | 'famille'
  | 'amitie'
  | 'alliance'
  | 'rivalite'
  | 'amour'
  | 'hierarchie'
  | 'dette'
  | 'mefiance'
  | 'trahison'
  | 'secret'
  | 'autre';

export interface DefTypeRelation {
  libelle: string;
  couleur: string;
  /** Vrai = le lien a un sens (« A aime B ») ; faux = symétrique (« A et B »). */
  oriente: boolean;
}

/** Palette cohérente avec le thème sombre du site. */
export const TYPES_RELATION: Record<TypeRelation, DefTypeRelation> = {
  famille: { libelle: 'Famille', couleur: '#7fb3ff', oriente: false },
  amitie: { libelle: 'Amitié', couleur: '#5fd1a5', oriente: false },
  alliance: { libelle: 'Alliance', couleur: '#58c4c9', oriente: false },
  rivalite: { libelle: 'Rivalité', couleur: '#ff7a8c', oriente: false },
  amour: { libelle: 'Amour', couleur: '#ff5a73', oriente: true },
  hierarchie: { libelle: 'Autorité', couleur: '#f0c36d', oriente: true },
  dette: { libelle: 'Dette', couleur: '#e0a458', oriente: true },
  mefiance: { libelle: 'Méfiance', couleur: '#a9a2b3', oriente: true },
  trahison: { libelle: 'Trahison', couleur: '#c95f8f', oriente: true },
  secret: { libelle: 'Secret', couleur: '#b98cff', oriente: false },
  autre: { libelle: 'Autre', couleur: '#8a8391', oriente: false },
};

const TYPES: readonly TypeRelation[] = [
  'famille',
  'amitie',
  'alliance',
  'rivalite',
  'amour',
  'hierarchie',
  'dette',
  'mefiance',
  'trahison',
  'secret',
  'autre',
];

export function estTypeRelation(valeur: unknown): valeur is TypeRelation {
  return typeof valeur === 'string' && (TYPES as readonly string[]).includes(valeur);
}

// ---------- Sens (orientation de la flèche) ----------
export type SensRelation = 'ab' | 'ba' | 'both' | 'none';

export function estSens(valeur: unknown): valeur is SensRelation {
  return (
    typeof valeur === 'string' &&
    (['ab', 'ba', 'both', 'none'] as const).includes(valeur as SensRelation)
  );
}

// ---------- Fiabilité (trait plein / tirets / pointillé) ----------
export type Fiabilite = 'fait' | 'deduction' | 'hypothese' | 'incertain';

export interface DefFiabilite {
  libelle: string;
  description: string;
  /** Motif de trait SVG ('none' = plein). */
  tirets: string;
  couleur: string;
}

export const FIABILITES: Record<Fiabilite, DefFiabilite> = {
  fait: {
    libelle: 'Fait',
    description: 'établi explicitement par le récit',
    tirets: 'none',
    couleur: '#5fd1a5',
  },
  deduction: {
    libelle: 'Déduction',
    description: 'conclusion tirée d’éléments déjà lus',
    tirets: '10 5',
    couleur: '#5fa8ff',
  },
  hypothese: {
    libelle: 'Hypothèse',
    description: 'interprétation non confirmée',
    tirets: '3 6',
    couleur: '#f0c36d',
  },
  incertain: {
    libelle: 'Incertain',
    description: 'ambigu ou insuffisamment étayé',
    tirets: '1 7',
    couleur: '#a9a2b3',
  },
};

const FIABILITES_CLES: readonly Fiabilite[] = ['fait', 'deduction', 'hypothese', 'incertain'];

export function estFiabilite(valeur: unknown): valeur is Fiabilite {
  return (
    typeof valeur === 'string' && (FIABILITES_CLES as readonly string[]).includes(valeur)
  );
}

// ---------- Genres d'événements (chronologie) ----------
export type GenreEvenement =
  | 'rencontre'
  | 'alliance'
  | 'rupture'
  | 'confiance'
  | 'revelation'
  | 'etat';

export const GENRES_EVENEMENT: Record<GenreEvenement, { libelle: string; couleur: string }> = {
  rencontre: { libelle: 'Rencontre', couleur: '#5fd1a5' },
  alliance: { libelle: 'Alliance', couleur: '#5fa8ff' },
  rupture: { libelle: 'Rupture', couleur: '#ff7a8c' },
  confiance: { libelle: 'Changement de confiance', couleur: '#f0c36d' },
  revelation: { libelle: 'Révélation', couleur: '#b98cff' },
  etat: { libelle: 'Changement d’état', couleur: '#b8b8c6' },
};

const GENRES: readonly GenreEvenement[] = [
  'rencontre',
  'alliance',
  'rupture',
  'confiance',
  'revelation',
  'etat',
];

export function estGenreEvenement(valeur: unknown): valeur is GenreEvenement {
  return typeof valeur === 'string' && (GENRES as readonly string[]).includes(valeur);
}

export function libelleGenre(genre: GenreEvenement): string {
  return GENRES_EVENEMENT[genre].libelle;
}

// ---------- Structures échangées (déjà filtrées par le serveur) ----------
export interface NoeudGraphe {
  id: string;
  nom: string;
  role: RoleGraphe;
  /** 1 = secondaire, 2 = notable, 3 = principal. */
  importance: 1 | 2 | 3;
  description: string | null;
  /** Position (1 → n) du chapitre de première apparition ; null = dès le début. */
  premierePosition: number | null;
}

export interface AreteGraphe {
  id: string;
  origineId: string;
  destinationId: string;
  libelle: string;
  type: TypeRelation;
  sens: SensRelation;
  /** 1 à 5 : épaisseur du trait. */
  intensite: number;
  /** État lisible au chapitre lu (« cordiale », « rompue »…), facultatif. */
  etat: string | null;
  fiabilite: Fiabilite;
  premierePosition: number | null;
}

export interface EvenementGraphe {
  id: string;
  /** Position (1 → n) du chapitre de l'événement. */
  position: number;
  genre: GenreEvenement;
  titre: string;
  texte: string | null;
  relationId: string | null;
  /** Personnages concernés (ids couverts à ce palier uniquement). */
  personnageIds: string[];
}

export interface GrapheFiltre {
  noeuds: NoeudGraphe[];
  aretes: AreteGraphe[];
  evenements: EvenementGraphe[];
  /** Combien d'éléments restent couverts (aucun détail renvoyé). */
  masquees: number;
}

/**
 * FILTRAGE ANTI-SPOILERS (pur, testé) : un nœud ou une arête est
 * couvert si sa première apparition est null (présent dès le début)
 * ou ≤ position lue ; un événement est couvert par le chapitre qu'il
 * relate. `positionLue = null` (rien lu / inconnu) ne laisse voir
 * que ce qui est présent dès le début.
 */
export function filtrerGraphe(
  noeuds: readonly NoeudGraphe[],
  aretes: readonly AreteGraphe[],
  positionLue: number | null,
  evenements: readonly EvenementGraphe[] = []
): GrapheFiltre {
  const couvert = (position: number | null): boolean =>
    position === null || (positionLue !== null && position <= positionLue);

  const noeudsVisibles = noeuds.filter((n) => couvert(n.premierePosition));
  const idsVisibles = new Set(noeudsVisibles.map((n) => n.id));
  // Une arête n'est visible que si les DEUX extrémités le sont :
  // sinon son simple affichage révèle un personnage non rencontré.
  const aretesVisibles = aretes.filter(
    (a) => couvert(a.premierePosition) && idsVisibles.has(a.origineId) && idsVisibles.has(a.destinationId)
  );
  const evenementsVisibles = evenements.filter(
    (e) => couvert(e.position) && e.personnageIds.every((id) => idsVisibles.has(id))
  );
  return {
    noeuds: noeudsVisibles,
    aretes: aretesVisibles,
    evenements: evenementsVisibles,
    masquees:
      noeuds.length -
      noeudsVisibles.length +
      (aretes.length - aretesVisibles.length) +
      (evenements.length - evenementsVisibles.length),
  };
}

/** Phrase lisible décrivant sens et nature d'une relation. */
export function phraseRelation(
  arete: Pick<AreteGraphe, 'origineId' | 'destinationId' | 'libelle' | 'sens'>,
  nomDe: (id: string) => string
): string {
  const a = nomDe(arete.origineId);
  const b = nomDe(arete.destinationId);
  const libelle = arete.libelle.trim() || 'lié à';
  if (arete.sens === 'ab') return `${a} ${libelle} ${b}`;
  if (arete.sens === 'ba') return `${b} ${libelle} ${a}`;
  // Symétrique ou réciproque : « A et B — libellé ».
  return `${a} et ${b} — ${libelle}`;
}

/**
 * Disposition INITIALE de la toile (pur, testé) : anneaux
 * concentriques par importance — les personnages principaux au
 * centre, les secondaires en périphérie. L'utilisateur peut ensuite
 * glisser chaque nœud (positions locales à la session).
 */
export function positionsToile(
  noeuds: ReadonlyArray<{ id: string; importance: number }>
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  // Une toile d'un seul personnage : centre exact.
  if (noeuds.length === 1) {
    out[noeuds[0].id] = { x: 500, y: 350 };
    return out;
  }
  const RAYONS: Record<number, number> = { 3: 130, 2: 225, 1: 320 };
  // Chaque anneau démarre à un angle décalé pour limiter les
  // chevauchements visuels entre groupes de tailles différentes.
  const DEPART: Record<number, number> = {
    3: -Math.PI / 2,
    2: -Math.PI / 2 + Math.PI / 6,
    1: -Math.PI / 2 + Math.PI / 4,
  };
  const CX = 500;
  const CY = 350;
  for (const importance of [3, 2, 1]) {
    const groupe = noeuds.filter((n) => n.importance === importance);
    const r = RAYONS[importance] ?? 225;
    const depart = DEPART[importance] ?? -Math.PI / 2;
    groupe.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, groupe.length) + depart;
      out[n.id] = { x: CX + Math.cos(angle) * r, y: CY + Math.sin(angle) * r * 0.82 };
    });
  }
  return out;
}

/** Positions en cercle (compatibilité, tests). */
export function positionsCercle(n: number): Array<{ x: number; y: number }> {
  const total = Math.max(0, Math.floor(n));
  if (total === 0) return [];
  if (total === 1) return [{ x: 0, y: 0 }];
  return Array.from({ length: total }, (_, i) => {
    const angle = (2 * Math.PI * i) / total - Math.PI / 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
}

// ---------- Accès DB (serveur, RLS « own ») ----------

interface LignePersonnage {
  id: string;
  nom: string;
  role: string;
  description: string | null;
  importance: number | null;
  premiere_chapitre_id: string | null;
}

interface LigneRelation {
  id: string;
  origine_id: string;
  destination_id: string;
  libelle: string;
  type: string | null;
  sens: string | null;
  intensite: number | null;
  etat: string | null;
  fiabilite: string | null;
  premiere_chapitre_id: string | null;
}

interface LigneEvenement {
  id: string;
  chapitre_id: string;
  genre: string;
  titre: string;
  texte: string | null;
  relation_id: string | null;
  personnages: string[] | null;
}

/** Borne une intensité reçue du client entre 1 et 5 (défaut 2). */
export function borneIntensite(valeur: unknown): number {
  const n = Number(valeur);
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/** Borne une importance reçue du client entre 1 et 3 (défaut 2). */
export function borneImportance(valeur: unknown): 1 | 2 | 3 {
  const n = Number(valeur);
  if (!Number.isFinite(n)) return 2;
  return (Math.max(1, Math.min(3, Math.round(n))) as 1 | 2 | 3);
}

/**
 * Charge le graphe COMPLET d'un livre puis applique le filtrage
 * serveur. `positionLue` vient du chapitre réellement lu (la page
 * transmet la progression du lecteur) ; null → présent dès le début
 * uniquement.
 */
export async function chargerGraphe(
  client: SupabaseClient,
  livreId: string,
  positionsChapitres: Map<string, number>,
  positionLue: number | null
): Promise<GrapheFiltre> {
  const [personnages, relations, evenements] = await Promise.all([
    client
      .from('graphe_personnages')
      .select('id, nom, role, description, importance, premiere_chapitre_id')
      .eq('livre_id', livreId)
      .limit(200),
    client
      .from('graphe_relations')
      .select(
        'id, origine_id, destination_id, libelle, type, sens, intensite, etat, fiabilite, premiere_chapitre_id'
      )
      .eq('livre_id', livreId)
      .limit(500),
    client
      .from('graphe_evenements')
      .select('id, chapitre_id, genre, titre, texte, relation_id, personnages')
      .eq('livre_id', livreId)
      .limit(500),
  ]);
  if (personnages.error) throw new Error(personnages.error.message);
  if (relations.error) throw new Error(relations.error.message);
  if (evenements.error) throw new Error(evenements.error.message);

  const noeuds: NoeudGraphe[] = ((personnages.data ?? []) as LignePersonnage[]).map((p) => ({
    id: p.id,
    nom: p.nom,
    role: estRole(p.role) ? p.role : 'secondaire',
    importance: borneImportance(p.importance),
    description: p.description,
    premierePosition:
      p.premiere_chapitre_id !== null
        ? positionsChapitres.get(p.premiere_chapitre_id) ?? null
        : null,
  }));
  const aretes: AreteGraphe[] = ((relations.data ?? []) as LigneRelation[]).map((r) => ({
    id: r.id,
    origineId: r.origine_id,
    destinationId: r.destination_id,
    libelle: r.libelle,
    type: estTypeRelation(r.type) ? r.type : 'autre',
    sens: estSens(r.sens) ? r.sens : 'none',
    intensite: borneIntensite(r.intensite),
    etat: r.etat,
    fiabilite: estFiabilite(r.fiabilite) ? r.fiabilite : 'fait',
    premierePosition:
      r.premiere_chapitre_id !== null
        ? positionsChapitres.get(r.premiere_chapitre_id) ?? null
        : null,
  }));

  // Événements : position du chapitre relaté + personnages couverts.
  const evenementsBruts = ((evenements.data ?? []) as LigneEvenement[]).map((e) => ({
    id: e.id,
    position: positionsChapitres.get(e.chapitre_id) ?? Number.MAX_SAFE_INTEGER,
    genre: estGenreEvenement(e.genre) ? e.genre : 'etat',
    titre: e.titre,
    texte: e.texte,
    relationId: e.relation_id,
    personnageIds: (e.personnages ?? []).filter((id) =>
      noeuds.some((n) => n.id === id)
    ),
  }));

  return filtrerGraphe(noeuds, aretes, positionLue, evenementsBruts);
}

export async function ajouterPersonnage(
  client: SupabaseClient,
  donnees: {
    livreId: string;
    nom: string;
    role: RoleGraphe;
    importance?: number;
    description?: string | null;
    premiereChapitreId?: string | null;
  }
): Promise<void> {
  const nom = donnees.nom.trim();
  if (!nom) throw new Error('Le nom est requis.');
  const { error } = await client.from('graphe_personnages').insert({
    livre_id: donnees.livreId,
    nom: nom.slice(0, 120),
    role: donnees.role,
    importance: borneImportance(donnees.importance),
    description: donnees.description?.trim().slice(0, 2000) || null,
    premiere_chapitre_id: donnees.premiereChapitreId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function ajouterRelation(
  client: SupabaseClient,
  donnees: {
    livreId: string;
    origineId: string;
    destinationId: string;
    libelle: string;
    type?: TypeRelation;
    sens?: SensRelation;
    intensite?: number;
    etat?: string | null;
    fiabilite?: Fiabilite;
    premiereChapitreId?: string | null;
  }
): Promise<void> {
  const libelle = donnees.libelle.trim();
  if (!libelle) throw new Error('Le libellé de la relation est requis.');
  if (donnees.origineId === donnees.destinationId) {
    throw new Error('Un personnage ne peut pas se relier à lui-même.');
  }
  const { error } = await client.from('graphe_relations').insert({
    livre_id: donnees.livreId,
    origine_id: donnees.origineId,
    destination_id: donnees.destinationId,
    libelle: libelle.slice(0, 160),
    type: estTypeRelation(donnees.type) ? donnees.type : 'autre',
    sens: estSens(donnees.sens) ? donnees.sens : 'none',
    intensite: borneIntensite(donnees.intensite),
    etat: donnees.etat?.trim().slice(0, 160) || null,
    fiabilite: estFiabilite(donnees.fiabilite) ? donnees.fiabilite : 'fait',
    premiere_chapitre_id: donnees.premiereChapitreId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function ajouterEvenement(
  client: SupabaseClient,
  donnees: {
    livreId: string;
    chapitreId: string;
    genre: GenreEvenement;
    titre: string;
    texte?: string | null;
    relationId?: string | null;
    personnageIds?: string[];
  }
): Promise<void> {
  const titre = donnees.titre.trim();
  if (!titre) throw new Error('Le titre de l’événement est requis.');
  const { error } = await client.from('graphe_evenements').insert({
    livre_id: donnees.livreId,
    chapitre_id: donnees.chapitreId,
    genre: estGenreEvenement(donnees.genre) ? donnees.genre : 'rencontre',
    titre: titre.slice(0, 160),
    texte: donnees.texte?.trim().slice(0, 800) || null,
    relation_id: donnees.relationId ?? null,
    personnages: (donnees.personnageIds ?? []).slice(0, 50),
  });
  if (error) throw new Error(error.message);
}

export async function supprimerPersonnage(
  client: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await client.from('graphe_personnages').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function supprimerRelation(
  client: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await client.from('graphe_relations').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function supprimerEvenement(
  client: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await client.from('graphe_evenements').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

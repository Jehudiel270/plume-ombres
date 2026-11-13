// ============================================================
// lib/graphe.ts — Graphe narratif anti-spoilers (F25, manuel).
//
// Nœuds (personnages) et arêtes (relations libellées), chacun
// porté par sa PREMIÈRE APPARITION. LE SERVEUR FILTRE : rien au-delà
// du chapitre lu ne quitte la base (pas de flou CSS, pas de
// masquage d'interface). Helpers purs testés + accès DB via client
// serveur Supabase et RLS « own ».
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

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

export interface NoeudGraphe {
  id: string;
  nom: string;
  role: RoleGraphe;
  description: string | null;
  /** Position (1 → n) du chapitre de première apparition ; null = dès le début. */
  premierePosition: number | null;
}

export interface AreteGraphe {
  id: string;
  origineId: string;
  destinationId: string;
  libelle: string;
  premierePosition: number | null;
}

export interface GrapheFiltre {
  noeuds: NoeudGraphe[];
  aretes: AreteGraphe[];
  /** Combien d'éléments restent couverts (aucun détail renvoyé). */
  masquees: number;
}

/**
 * FILTRAGE ANTI-SPOILERS (pur, testé) : un nœud ou une arête est
 * couvert si sa première apparition est null (présent dès le début)
 * ou ≤ position lue. `positionLue = null` (rien lu / inconnu) ne
 * laisse voir que ce qui est présent dès le début.
 */
export function filtrerGraphe(
  noeuds: readonly NoeudGraphe[],
  aretes: readonly AreteGraphe[],
  positionLue: number | null
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
  return {
    noeuds: noeudsVisibles,
    aretes: aretesVisibles,
    masquees: noeuds.length - noeudsVisibles.length + (aretes.length - aretesVisibles.length),
  };
}

/** Positions en cercle (vue graphe) : réparties uniformément, rayon
 *  relatif 1 — le composant multiplie par son rayon réel. */
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
  premiere_chapitre_id: string | null;
}

interface LigneRelation {
  id: string;
  origine_id: string;
  destination_id: string;
  libelle: string;
  premiere_chapitre_id: string | null;
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
  const [personnages, relations] = await Promise.all([
    client
      .from('graphe_personnages')
      .select('id, nom, role, description, premiere_chapitre_id')
      .eq('livre_id', livreId)
      .limit(200),
    client
      .from('graphe_relations')
      .select('id, origine_id, destination_id, libelle, premiere_chapitre_id')
      .eq('livre_id', livreId)
      .limit(500),
  ]);
  if (personnages.error) throw new Error(personnages.error.message);
  if (relations.error) throw new Error(relations.error.message);

  const noeuds: NoeudGraphe[] = ((personnages.data ?? []) as LignePersonnage[]).map((p) => ({
    id: p.id,
    nom: p.nom,
    role: estRole(p.role) ? p.role : 'secondaire',
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
    premierePosition:
      r.premiere_chapitre_id !== null
        ? positionsChapitres.get(r.premiere_chapitre_id) ?? null
        : null,
  }));
  return filtrerGraphe(noeuds, aretes, positionLue);
}

export async function ajouterPersonnage(
  client: SupabaseClient,
  donnees: {
    livreId: string;
    nom: string;
    role: RoleGraphe;
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
    premiere_chapitre_id: donnees.premiereChapitreId ?? null,
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

// ============================================================
// lib/theories.ts — Théories de lecture personnelles (F8) +
// comparateur de cohérence de traduction (F19).
//
// Les théories sont PRIVÉES (atelier) : statut traçant, étiquettes
// libres. Le comparateur vérifie la COHÉRENCE d'un terme à travers
// la traduction (paires source ↔ traduit où le terme apparaît) —
// c'est l'outil de vérification qui complète la vue bilingue (F7).
// Helpers purs testés ; écritures DB via client serveur + RLS.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type StatutTheorie = 'ouverte' | 'confirmee' | 'infirmee';

const STATUTS: readonly StatutTheorie[] = ['ouverte', 'confirmee', 'infirmee'];

export function estStatut(valeur: unknown): valeur is StatutTheorie {
  return typeof valeur === 'string' && (STATUTS as readonly string[]).includes(valeur);
}

export function libelleStatut(statut: StatutTheorie): string {
  return statut === 'ouverte'
    ? 'Ouverte'
    : statut === 'confirmee'
      ? 'Confirmée'
      : 'Infirmée';
}

export const MAX_ETIQUETTES = 5;
export const MAX_ETIQUETTE = 40;

/** Analyse la ligne d'étiquettes (« lucan, archives ») : au plus 5,
 *  chacune plafonnée, vides retirées. */
export function analyserEtiquettes(ligne: string): string[] {
  return ligne
    .split(',')
    .map((t) => t.trim().slice(0, MAX_ETIQUETTE))
    .filter(Boolean)
    .slice(0, MAX_ETIQUETTES);
}

/** Terme de recherche du comparateur : borné, blancs réduits. */
export function normaliserTerme(valeur: string): string | null {
  const propre = (valeur ?? '').replace(/\s+/g, ' ').trim();
  if (propre.length < 2) return null;
  return propre.slice(0, 80);
}

export interface Theorie {
  id: string;
  livre_id: string;
  chapitre_id: string | null;
  titre: string;
  raisonnement: string;
  etiquettes: string[];
  statut: StatutTheorie;
  created_at: string;
  updated_at: string;
}

export async function listerTheories(
  client: SupabaseClient,
  livreId: string | null = null
): Promise<Theorie[]> {
  let requete = client
    .from('theories')
    .select(
      'id, livre_id, chapitre_id, titre, raisonnement, etiquettes, statut, created_at, updated_at'
    )
    .order('created_at', { ascending: false })
    .limit(300);
  if (livreId) requete = requete.eq('livre_id', livreId);
  const { data, error } = await requete;
  if (error) throw new Error(error.message);
  return (data ?? []) as Theorie[];
}

export async function ajouterTheorie(
  client: SupabaseClient,
  donnees: {
    livreId: string;
    chapitreId?: string | null;
    titre: string;
    raisonnement: string;
    etiquettes?: string[];
  }
): Promise<Theorie> {
  const titre = donnees.titre.trim();
  const raisonnement = donnees.raisonnement.trim();
  if (titre.length < 2 || raisonnement.length < 1) {
    throw new Error('Donnez un titre et un raisonnement.');
  }
  const { data, error } = await client
    .from('theories')
    .insert({
      livre_id: donnees.livreId,
      chapitre_id: donnees.chapitreId ?? null,
      titre: titre.slice(0, 200),
      raisonnement: raisonnement.slice(0, 8000),
      etiquettes: analyserEtiquettes((donnees.etiquettes ?? []).join(',')),
    })
    .select(
      'id, livre_id, chapitre_id, titre, raisonnement, etiquettes, statut, created_at, updated_at'
    )
    .single();
  if (error) throw new Error(error.message);
  return data as Theorie;
}

export async function majTheorie(
  client: SupabaseClient,
  id: string,
  maj: { titre?: string; raisonnement?: string; statut?: StatutTheorie; etiquettes?: string[] }
): Promise<void> {
  const champs: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (maj.titre !== undefined) champs.titre = maj.titre.trim().slice(0, 200);
  if (maj.raisonnement !== undefined) {
    champs.raisonnement = maj.raisonnement.trim().slice(0, 8000);
  }
  if (maj.statut) champs.statut = maj.statut;
  if (maj.etiquettes !== undefined) {
    champs.etiquettes = analyserEtiquettes(maj.etiquettes.join(','));
  }
  const { error } = await client.from('theories').update(champs).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function supprimerTheorie(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('theories').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------- Comparateur (F19) ----------

export interface PaireComparaison {
  chapitreTitre: string;
  source: string;
  traduit: string;
}

/**
 * Cherche les paires source ↔ traduit d'un livre où le terme apparaît
 * (source OU traduit) : le lecteur vérifie d'un coup d'œil comment
 * son terme a été rendu partout. BORNÉ (60 paires), plafonné à des
 * extraits de 300 caractères — jamais de texte intégral.
 *
 * Deux requêtes simples (source, puis traduit) au lieu de filtres
 * imbriqués : la table `segments` est lisible via RLS
 * segments → chapitres → livres ; les titres de chapitres sont
 * repris côté application.
 */
export async function comparerTerme(
  client: SupabaseClient,
  livreId: string,
  terme: string
): Promise<PaireComparaison[]> {
  const termePropre = normaliserTerme(terme);
  if (!termePropre) return [];
  const motif = `%${termePropre.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

  // Chapitres du livre (RLS « own ») : ids → titres.
  const { data: chapitres, error: erreurChapitres } = await client
    .from('chapitres')
    .select('id, titre, position')
    .eq('livre_id', livreId)
    .order('position', { ascending: true });
  if (erreurChapitres) throw new Error(erreurChapitres.message);
  const liste = (chapitres ?? []) as Array<{ id: string; titre: string | null; position: number }>;
  if (liste.length === 0) return [];
  const titres = new Map(liste.map((c) => [c.id, c.titre ?? 'Sans titre']));
  const rangChapitre = new Map(liste.map((c) => [c.id, c.position]));

  const colonnes = 'id, chapitre_id, position, source, traduit';
  const [coteSource, coteTraduit] = await Promise.all([
    client
      .from('segments')
      .select(colonnes)
      .in('chapitre_id', liste.map((c) => c.id))
      .ilike('source', motif)
      .limit(60),
    client
      .from('segments')
      .select(colonnes)
      .in('chapitre_id', liste.map((c) => c.id))
      .ilike('traduit', motif)
      .limit(60),
  ]);
  if (coteSource.error) throw new Error(coteSource.error.message);
  if (coteTraduit.error) throw new Error(coteTraduit.error.message);

  // Fusion dédupliquée, ordre de lecture (chapitre, puis segment).
  const parId = new Map<string, {
    chapitre_id: string;
    position: number;
    source: string | null;
    traduit: string | null;
  }>();
  for (const ligne of [...(coteSource.data ?? []), ...(coteTraduit.data ?? [])]) {
    const l = ligne as {
      id: number;
      chapitre_id: string;
      position: number;
      source: string | null;
      traduit: string | null;
    };
    parId.set(String(l.id), l);
  }
  return [...parId.values()]
    .sort(
      (a, b) =>
        (rangChapitre.get(a.chapitre_id) ?? 0) - (rangChapitre.get(b.chapitre_id) ?? 0) ||
        a.position - b.position
    )
    .slice(0, 60)
    .map((l) => ({
      chapitreTitre: titres.get(l.chapitre_id) ?? 'Sans titre',
      source: (l.source ?? '').slice(0, 300),
      traduit: (l.traduit ?? '').slice(0, 300),
    }));
}

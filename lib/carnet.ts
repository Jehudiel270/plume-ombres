// ============================================================
// lib/carnet.ts — Carnet de lecture (F2).
//
// Le lecteur prend des NOTES, des CITATIONS et des SURLIGNAGES
// pendant la lecture. Règle transversale du chantier : un extrait
// cité est PLAFONNÉ (MAX_EXTRAIT) — jamais de texte intégral dans
// la table, jamais dans un export (F24, réservé aux abonnés).
//
// Les helpers purs (normalisation d'extrait, libellés, export MD)
// sont testés ; les fonctions DB suivent le pattern de
// lib/glossaire.ts (client serveur Supabase + RLS « own »).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type TypeCarnet = 'note' | 'citation' | 'surlignage';

/** Plafond d'un passage cité (caractères). Vaut pour la table ET les exports. */
export const MAX_EXTRAIT = 800;
export const MAX_ANNOTATION = 4000;

const TYPES: readonly TypeCarnet[] = ['note', 'citation', 'surlignage'];

export function estTypeCarnet(valeur: unknown): valeur is TypeCarnet {
  return typeof valeur === 'string' && (TYPES as readonly string[]).includes(valeur);
}

export function libelleType(type: TypeCarnet): string {
  return type === 'note' ? 'Note' : type === 'citation' ? 'Citation' : 'Surlignage';
}

/**
 * Normalise un passage à retenir : blancs réduits, plafonné à
 * MAX_EXTRAIT avec ellipse. Une chaîne vide devient null.
 */
export function normaliserExtrait(texte: string): string | null {
  const propre = (texte ?? '').replace(/\s+/g, ' ').trim();
  if (!propre) return null;
  if (propre.length <= MAX_EXTRAIT) return propre;
  return `${propre.slice(0, MAX_EXTRAIT - 1).trimEnd()}…`;
}

/** Normalise une annotation libre (plafonnée, pas de repli). */
export function normaliserAnnotation(texte: string): string | null {
  const propre = (texte ?? '').trim();
  if (!propre) return null;
  return propre.length <= MAX_ANNOTATION
    ? propre
    : `${propre.slice(0, MAX_ANNOTATION - 1).trimEnd()}…`;
}

export interface EntreeCarnet {
  id: string;
  livre_id: string;
  chapitre_id: string | null;
  type: TypeCarnet;
  extrait: string | null;
  annotation: string | null;
  chapitre_titre: string | null;
  created_at: string;
}

export interface LivreCarnet {
  id: string;
  titre: string;
}

/** Liste les notes du compte (RLS), les plus récentes d'abord. */
export async function listerCarnet(
  client: SupabaseClient,
  options: { livreId?: string | null; type?: TypeCarnet | null } = {}
): Promise<EntreeCarnet[]> {
  let requete = client
    .from('carnet_notes')
    .select(
      'id, livre_id, chapitre_id, type, extrait, annotation, chapitre_titre, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(500);
  if (options.livreId) requete = requete.eq('livre_id', options.livreId);
  if (options.type) requete = requete.eq('type', options.type);
  const { data, error } = await requete;
  if (error) throw new Error(error.message);
  return (data ?? []) as EntreeCarnet[];
}

export async function ajouterNote(
  client: SupabaseClient,
  donnees: {
    livreId: string;
    chapitreId?: string | null;
    type: TypeCarnet;
    extrait?: string | null;
    annotation?: string | null;
    chapitreTitre?: string | null;
  }
): Promise<EntreeCarnet> {
  const extrait = normaliserExtrait(donnees.extrait ?? '');
  const annotation = normaliserAnnotation(donnees.annotation ?? '');
  if (!extrait && !annotation) {
    throw new Error('Écrivez une note ou sélectionnez un passage.');
  }
  const { data, error } = await client
    .from('carnet_notes')
    .insert({
      livre_id: donnees.livreId,
      chapitre_id: donnees.chapitreId ?? null,
      type: donnees.type,
      extrait,
      annotation,
      chapitre_titre: donnees.chapitreTitre ?? null,
    })
    .select(
      'id, livre_id, chapitre_id, type, extrait, annotation, chapitre_titre, created_at'
    )
    .single();
  if (error) throw new Error(error.message);
  return data as EntreeCarnet;
}

export async function majNote(
  client: SupabaseClient,
  id: string,
  maj: { annotation?: string | null; type?: TypeCarnet }
): Promise<void> {
  const champs: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (maj.annotation !== undefined) {
    champs.annotation = normaliserAnnotation(maj.annotation ?? '');
  }
  if (maj.type) champs.type = maj.type;
  const { error } = await client.from('carnet_notes').update(champs).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function supprimerNote(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('carnet_notes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------- Export portable (F24, réservé aux abonnés) ----------

export interface MetaExportCarnet {
  titreLivre?: string | null;
  pseudo?: string | null;
}

/**
 * Export Markdown du carnet : titre du livre, entrées groupées par
 * type, extraits PLAFONNÉS, aucune portion du texte intégral.
 * Pure et testée.
 */
export function exporterMarkdown(
  entrees: readonly EntreeCarnet[],
  meta: MetaExportCarnet = {}
): string {
  const lignes: string[] = [];
  const titre = meta.titreLivre
    ? `# Carnet de lecture — ${meta.titreLivre}`
    : '# Carnet de lecture';
  lignes.push(titre, '');
  lignes.push(
    `Exporté depuis Plume d'Ombres${meta.pseudo ? ` par ${meta.pseudo}` : ''}. ` +
      'Extraits plafonnés à 800 caractères, sans le texte intégral de l’œuvre.',
    ''
  );
  if (entrees.length === 0) {
    lignes.push('_Carnet vide._', '');
    return lignes.join('\n');
  }
  for (const type of TYPES) {
    const duType = entrees.filter((e) => e.type === type);
    if (duType.length === 0) continue;
    lignes.push(`## ${libelleType(type)}s (${duType.length})`, '');
    for (const e of duType) {
      const chapitre = e.chapitre_titre ? ` — ${e.chapitre_titre}` : '';
      lignes.push(`### ${chapitre ? chapitre.replace(/^ — /, '') : 'Sans chapitre'}`, '');
      if (e.extrait) lignes.push(`> ${e.extrait}`, '');
      if (e.annotation) lignes.push(e.annotation, '');
      lignes.push(`_Le ${e.created_at.slice(0, 10)}_`, '');
    }
  }
  return lignes.join('\n');
}

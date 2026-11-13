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

/**
 * Couleurs de surlignage, telles que la maquette du lecteur les
 * propose (zip plume-ombres-ui, data/reader-meta.ts) : cinq teintes,
 * re-rendues dans le texte du chapitre.
 */
export type CouleurCarnet = 'or' | 'rouge' | 'azur' | 'menthe' | 'lilas';

const COULEURS: readonly CouleurCarnet[] = ['or', 'rouge', 'azur', 'menthe', 'lilas'];

export const COULEUR_DEFAUT: CouleurCarnet = 'azur';

export function estCouleurCarnet(valeur: unknown): valeur is CouleurCarnet {
  return typeof valeur === 'string' && (COULEURS as readonly string[]).includes(valeur);
}

export interface CouleurCarnetMeta {
  valeur: CouleurCarnet;
  label: string;
  /** Classe de la marque dans le texte (mark). */
  marque: string;
  /** Classe de la pastille (dot). */
  pastille: string;
}

export const COULEURS_CARNET: readonly CouleurCarnetMeta[] = [
  { valeur: 'or', label: 'Or', marque: 'marque-surlignage-or', pastille: 'pastille-or' },
  { valeur: 'rouge', label: 'Rouge', marque: 'marque-surlignage-rouge', pastille: 'pastille-rouge' },
  { valeur: 'azur', label: 'Azur', marque: 'marque-surlignage-azur', pastille: 'pastille-azur' },
  { valeur: 'menthe', label: 'Menthe', marque: 'marque-surlignage-menthe', pastille: 'pastille-menthe' },
  { valeur: 'lilas', label: 'Lilas', marque: 'marque-surlignage-lilas', pastille: 'pastille-lilas' },
];

export const metaCouleur = (c: CouleurCarnet): CouleurCarnetMeta =>
  COULEURS_CARNET.find((x) => x.valeur === c) ?? COULEURS_CARNET[2]; // azur

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
  couleur: CouleurCarnet | null;
  created_at: string;
}

const CHAMPS_ENTREE =
  'id, livre_id, chapitre_id, type, extrait, annotation, chapitre_titre, couleur, created_at';

export interface LivreCarnet {
  id: string;
  titre: string;
}

/** Liste les notes du compte (RLS), les plus récentes d'abord. */
export async function listerCarnet(
  client: SupabaseClient,
  options: {
    livreId?: string | null;
    chapitreId?: string | null;
    type?: TypeCarnet | null;
  } = {}
): Promise<EntreeCarnet[]> {
  let requete = client
    .from('carnet_notes')
    .select(CHAMPS_ENTREE)
    .order('created_at', { ascending: false })
    .limit(500);
  if (options.livreId) requete = requete.eq('livre_id', options.livreId);
  if (options.chapitreId) requete = requete.eq('chapitre_id', options.chapitreId);
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
    couleur?: CouleurCarnet | null;
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
      couleur: estCouleurCarnet(donnees.couleur) ? donnees.couleur : null,
    })
    .select(CHAMPS_ENTREE)
    .single();
  if (error) throw new Error(error.message);
  return data as EntreeCarnet;
}

export async function majNote(
  client: SupabaseClient,
  id: string,
  maj: { annotation?: string | null; type?: TypeCarnet; couleur?: CouleurCarnet | null }
): Promise<void> {
  const champs: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (maj.annotation !== undefined) {
    champs.annotation = normaliserAnnotation(maj.annotation ?? '');
  }
  if (maj.type) champs.type = maj.type;
  if (maj.couleur !== undefined) {
    champs.couleur = estCouleurCarnet(maj.couleur) ? maj.couleur : null;
  }
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

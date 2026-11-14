// ============================================================
// lib/graphe-ia.ts — GÉNÉRATION IA DU GRAPHE NARRATIF (F25-IA).
//
// L'IA ne devine rien : elle reçoit UNIQUEMENT le texte des
// chapitres déjà lus (même garde structurelle que l'aide à la
// lecture — lib/assistance). La proposition est une SUGGESTION :
// rien n'est écrit en base sans validation du propriétaire.
//
// NIVEAUX DE DÉTAILS : le lecteur choisit la finesse attendue
// (essentiel / détaillé / exhaustif) — plafonds de contexte et de
// sortie, et exigences du prompt, s'ajustent au niveau.
//
// CLÉS : le modèle est appelé via demanderModele (succession :
// variable d'environnement puis réservoir « Clés API » filtré par
// l'abonnement). AUCUNE valeur de clé ne quitte le serveur.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import type { NiveauPlan } from '@/lib/fonctionnalites/registre';
import { chargerContexteLu, demanderModele } from '@/lib/assistance';
import {
  estFiabilite,
  estGenreEvenement,
  estRole,
  estSens,
  estTypeRelation,
  type Fiabilite,
  type GenreEvenement,
  type RoleGraphe,
  type SensRelation,
  type TypeRelation,
} from '@/lib/graphe';

// ---------- Niveaux de détails ----------

export type NiveauDetailIa = 'essentiel' | 'detaille' | 'exhaustif';

export interface DefNiveauDetail {
  id: NiveauDetailIa;
  libelle: string;
  description: string;
  /** Plafond de texte des chapitres envoyés au modèle. */
  maxContexte: number;
  /** Plafond de tokens de la réponse. */
  maxSortie: number;
}

export const NIVEAUX_DETAIL: readonly DefNiveauDetail[] = [
  {
    id: 'essentiel',
    libelle: 'Essentiel',
    description:
      'Le squelette de l’histoire : personnages principaux, liens majeurs, moments clés. Rapide.',
    maxContexte: 40_000,
    maxSortie: 2_000,
  },
  {
    id: 'detaille',
    libelle: 'Détaillé',
    description:
      'Tous les personnages nommés, relations typées, événements par chapitre avec repères.',
    maxContexte: 80_000,
    maxSortie: 4_000,
  },
  {
    id: 'exhaustif',
    libelle: 'Exhaustif',
    description:
      'Toile la plus fine : seconds rôles, nuances d’état, fiabilité des liens, chronologie dense.',
    maxContexte: 150_000,
    maxSortie: 6_000,
  },
] as const;

export function estNiveauDetail(valeur: unknown): valeur is NiveauDetailIa {
  return (
    typeof valeur === 'string' &&
    (['essentiel', 'detaille', 'exhaustif'] as const).includes(valeur as NiveauDetailIa)
  );
}

export function defNiveauDetail(id: NiveauDetailIa): DefNiveauDetail {
  return NIVEAUX_DETAIL.find((n) => n.id === id) ?? NIVEAUX_DETAIL[1]!;
}

// ---------- Propositions ----------

export interface PersonnagePropose {
  nom: string;
  role: RoleGraphe;
  importance: 1 | 2 | 3;
  description: string | null;
  /** Position (1..n) du chapitre de première apparition ; null = début. */
  premierePosition: number | null;
}

export interface RelationProposee {
  nomOrigine: string;
  nomDestination: string;
  libelle: string;
  type: TypeRelation;
  sens: SensRelation;
  intensite: number;
  etat: string | null;
  fiabilite: Fiabilite;
  premierePosition: number | null;
}

export interface EvenementPropose {
  /** Position (1..n) du chapitre relaté. */
  position: number;
  genre: GenreEvenement;
  titre: string;
  texte: string | null;
  /** Noms des personnages concernés (résolus à l'application). */
  personnages: string[];
}

export interface PropositionGraphe {
  personnages: PersonnagePropose[];
  relations: RelationProposee[];
  evenements: EvenementPropose[];
  /** Position de lecture sur laquelle l'analyse s'est arrêtée. */
  jusquPosition: number;
  niveauDetail: NiveauDetailIa;
}

/** Borne un texte à n caractères (null si vide). */
function texte(brut: unknown, max: number): string | null {
  if (typeof brut !== 'string') return null;
  const t = brut.trim();
  return t ? t.slice(0, max) : null;
}

/** Nom de personnage propre (1..120). */
function nomPropre(brut: unknown): string {
  if (typeof brut !== 'string') return '';
  return brut.trim().replace(/\s+/g, ' ').slice(0, 120);
}

/** Position valide (entier ≥ 1), sinon null. */
function positionValide(brut: unknown): number | null {
  const n = Number(brut);
  if (!Number.isInteger(n) || n < 1 || n > 5000) return null;
  return n;
}

/**
 * Analyse la réponse du modèle : extrait le JSON (tolérant aux
 * clôtures markdown), puis VALIDE chaque champ contre les types du
 * graphe — ce qui n'est pas reconnu retombe sur une valeur sûre ou
 * est écarté. Jamais d'exception : un parse raté renvoie null.
 */
export function analyserProposition(
  reponse: string,
  jusquPosition: number,
  niveauDetail: NiveauDetailIa,
  nombreChapitres: number
): PropositionGraphe | null {
  // 1) Extraire le JSON (le modèle peut l'enrober de ```json … ```).
  let brut = reponse.trim();
  const cloture = /```(?:json)?\s*([\s\S]*?)```/i.exec(brut);
  if (cloture) brut = cloture[1]!.trim();
  const debut = brut.indexOf('{');
  const fin = brut.lastIndexOf('}');
  if (debut === -1 || fin <= debut) return null;
  brut = brut.slice(debut, fin + 1);

  let donnees: Record<string, unknown>;
  try {
    donnees = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    return null;
  }

  // 2) Personnages.
  const personnages: PersonnagePropose[] = [];
  const vus = new Set<string>();
  if (Array.isArray(donnees.personnages)) {
    for (const p of donnees.personnages as Record<string, unknown>[]) {
      if (!p || typeof p !== 'object') continue;
      const nom = nomPropre(p.nom);
      if (!nom || vus.has(nom.toLowerCase())) continue;
      vus.add(nom.toLowerCase());
      const importanceBrute = Number(p.importance);
      const importance =
        importanceBrute === 1 || importanceBrute === 2 || importanceBrute === 3
          ? importanceBrute
          : 2;
      personnages.push({
        nom,
        role: estRole(p.role) ? p.role : 'secondaire',
        importance,
        description: texte(p.description, 2000),
        premierePosition: positionValide(p.premierePosition),
      });
    }
  }
  if (personnages.length === 0) return null; // Sans personnage, pas de graphe.
  personnages.sort((a, b) => b.importance - a.importance);

  // 3) Relations (noms résolus plus tard, à l'application).
  const relations: RelationProposee[] = [];
  if (Array.isArray(donnees.relations)) {
    for (const r of donnees.relations as Record<string, unknown>[]) {
      if (!r || typeof r !== 'object') continue;
      const nomOrigine = nomPropre(r.origine);
      const nomDestination = nomPropre(r.destination);
      if (!nomOrigine || !nomDestination) continue;
      if (nomOrigine.toLowerCase() === nomDestination.toLowerCase()) continue;
      if (!vus.has(nomOrigine.toLowerCase()) || !vus.has(nomDestination.toLowerCase())) continue;
      relations.push({
        nomOrigine,
        nomDestination,
        libelle: texte(r.libelle, 160) ?? 'lié à',
        type: estTypeRelation(r.type) ? r.type : 'autre',
        sens: estSens(r.sens) ? r.sens : 'none',
        intensite: Math.max(1, Math.min(5, Math.round(Number(r.intensite)) || 2)),
        etat: texte(r.etat, 160),
        fiabilite: estFiabilite(r.fiabilite) ? r.fiabilite : 'fait',
        premierePosition: positionValide(r.premierePosition),
      });
    }
  }

  // 4) Événements (position bornée aux chapitres existants).
  const evenements: EvenementPropose[] = [];
  if (Array.isArray(donnees.evenements)) {
    for (const e of donnees.evenements as Record<string, unknown>[]) {
      if (!e || typeof e !== 'object') continue;
      const titre = texte(e.titre, 160);
      const position = positionValide(e.position);
      if (!titre || !position || position > nombreChapitres) continue;
      const noms = Array.isArray(e.personnages)
        ? (e.personnages as unknown[])
            .map((n) => nomPropre(n))
            .filter((n) => n && vus.has(n.toLowerCase()))
            .slice(0, 12)
        : [];
      evenements.push({
        position,
        genre: estGenreEvenement(e.genre) ? e.genre : 'etat',
        titre,
        texte: texte(e.texte, 800),
        personnages: [...new Set(noms)],
      });
    }
  }

  const proposition: PropositionGraphe = {
    personnages: personnages.slice(0, 60),
    relations: relations.slice(0, 200),
    evenements: evenements.slice(0, 300),
    jusquPosition,
    niveauDetail,
  };
  return proposition;
}

// ---------- Prompt ----------

const EXIGENCES_COMMUNES = `Tu analyses le texte d'un roman (chapitres déjà lus par le lecteur) pour construire un GRAPHE NARRATIF.
Règles impératives :
1. Appuie-toi UNIQUEMENT sur le texte fourni. N'invente AUCUN personnage, lien ou événement absent du texte. N'anticipe JAMAIS la suite de l'histoire.
2. RÉPONDS UNIQUEMENT avec un objet JSON valide, sans texte autour, sans commentaires. Format exact :
{
  "personnages": [{"nom": "...", "role": "protagoniste|antagoniste|allie|secondaire|autre", "importance": 1|2|3, "description": "...", "premierePosition": <numéro de chapitre ou null>}],
  "relations": [{"origine": "...", "destination": "...", "libelle": "verbe ou syntagme court", "type": "famille|amitie|alliance|rivalite|amour|hierarchie|dette|mefiance|trahison|secret|autre", "sens": "ab|ba|both|none", "intensite": 1..5, "etat": "...", "fiabilite": "fait|deduction|hypothese|incertain", "premierePosition": <numéro ou null>}],
  "evenements": [{"position": <numéro de chapitre>, "genre": "rencontre|alliance|rupture|confiance|revelation|etat", "titre": "...", "texte": "...", "personnages": ["nom", "nom"]}]
}
3. « origine »/« destination » et les noms de « personnages » (événements) doivent être EXACTEMENT les noms listés dans « personnages ».
4. importance : 3 = personnage principal, 2 = notable, 1 = secondaire. premierePosition = chapitre de PREMIÈRE apparition (null si dès le début).
5. fiabilité : « fait » = dit explicitement par le récit ; « deduction » = conclue d'éléments lus ; « hypothese » = interprétation probable ; « incertain » = ambigu.
6. Les descriptions restent courtes (une phrase), en français, sans spoil d'aucune sorte.`;

function exigencesParNiveau(niveau: NiveauDetailIa): string {
  switch (niveau) {
    case 'essentiel':
      return 'Niveau ESSENTIEL : ne retiens que les personnages principaux (importance 3, au besoin 2), leurs liens majeurs, et les moments décisifs de l’intrigue. Vise la sobriété : peu d’éléments, tous solides.';
    case 'exhaustif':
      return 'Niveau EXHAUSTIF : recense TOUS les personnages nommés (y compris secondaires, importance 1), toutes les relations discernables avec leurs nuances (état, fiabilité), et une chronologie dense d’événements chapitre par chapitre (plusieurs événements par chapitre quand le texte s’y prête).';
    default:
      return 'Niveau DÉTAILLÉ : tous les personnages marquants (importance 2-3, seconds rôles si utiles), l’essentiel des relations avec type et fiabilité, et les événements notables de chaque chapitre lu.';
  }
}

export function promptGraphe(niveau: NiveauDetailIa): string {
  return `${EXIGENCES_COMMUNES}\n\n${exigencesParNiveau(niveau)}`;
}

// ---------- Génération (serveur) ----------

export interface ResultatGeneration {
  proposition: PropositionGraphe;
  chapitresAnalyse: number;
}

/**
 * Génère une PROPOSITION de graphe à partir des chapitres lus
 * (anti-spoilers par construction : le contexte ne contient que le
 * texte jusqu'à `positionLue`). Lève une erreur lisible si la lecture
 * n'a pas de texte ou si le modèle n'a rien renvoyé d'exploitable.
 */
export async function genererPropositionGraphe(
  client: SupabaseClient,
  livreId: string,
  positionLue: number,
  niveauDetail: NiveauDetailIa,
  niveauPlan: NiveauPlan | null
): Promise<ResultatGeneration> {
  if (!Number.isInteger(positionLue) || positionLue < 1) {
    throw new Error('Lisez au moins un chapitre avant de générer le graphe.');
  }
  const def = defNiveauDetail(niveauDetail);
  const contexte = await chargerContexteLu(client, livreId, positionLue, def.maxContexte);
  if (!contexte) {
    throw new Error(
      'Aucun texte lisible jusqu’au chapitre indiqué : importez et ouvrez vos chapitres, puis réessayez.'
    );
  }

  const reponse = await demanderModele(
    promptGraphe(niveauDetail),
    `=== Chapitres déjà lus (analyse strictement limitée à ce texte) ===\n\n${contexte.contexte}`,
    def.maxSortie,
    client,
    niveauPlan
  );

  const nombreChapitres = contexte.chapitres.length;
  const proposition = analyserProposition(reponse, positionLue, niveauDetail, nombreChapitres);
  if (!proposition) {
    throw new Error(
      'Le modèle n’a pas renvoyé de proposition exploitable : réessayez (un autre modèle ou niveau peut mieux réussir).'
    );
  }
  return { proposition, chapitresAnalyse: nombreChapitres };
}

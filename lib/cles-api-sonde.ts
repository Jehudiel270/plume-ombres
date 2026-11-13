// ============================================================
// lib/cles-api-sonde.ts — SONDE DE CLÉ D'API (test manuel).
//
// Le bouton « Tester » de l'onglet « Clés API » envoie, côté serveur,
// une requête de CONTRÔLE à chaque fournisseur : la liste des modèles
// (ou l'information de clé pour OpenRouter). Ces appels ne consomment
// AUCUN quota de génération — ils ne servent qu'à vérifier que la clé
// est acceptée.
//
// La réponse est classée :
//   ok          — la clé est acceptée ;
//   attribuable — l'échec vient de la clé (401 / 403 / 429, quota,
//                 accès refusé) → compte dans le système de repos ;
//   sinon       — échec de réseau ou point de contrôle inconnu → le
//                 compteur de la clé n'est PAS touché.
//
// Cette bibliothèque ne dépend d'aucun module serveur : elle est
// testée avec un fetch factice injecté.
// ============================================================

export interface ResultatSonde {
  ok: boolean;
  /** Message lisible par l'administrateur (sans jamais porter la clé). */
  message: string;
  /** L'échec est-il imputable à la clé elle-même ? */
  attribuable: boolean;
}

/**
 * Le chercheur injectable (preuves) : une URL chaîne et les entêtes
 * déjà prêts. Le fetch global du serveur est assignable tel quel
 * (il accepte une entrée plus large).
 */
export type ChercheurSonde = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<Response>;

interface PointControle {
  url: string;
  /** Entêtes d'appel pour ce fournisseur. */
  entetes: (valeur: string) => Record<string, string>;
  /** Extrait une confirmation lisible d'une réponse 2xx. */
  confirmation: (corps: unknown) => string;
}

const DELAI_MS = 10_000;

const POINTS_DE_CONTROLE: Record<string, PointControle> = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    entetes: (valeur) => ({ 'x-goog-api-key': valeur }),
    confirmation: (corps) => {
      const n = Array.isArray((corps as { models?: unknown }).models)
        ? ((corps as { models: unknown[] }).models.length)
        : 0;
      return n > 0 ? `Clé valide : ${n} modèles accessibles.` : 'Clé valide.';
    },
  },
  deepseek: {
    url: 'https://api.deepseek.com/models',
    entetes: (valeur) => ({ Authorization: `Bearer ${valeur}` }),
    confirmation: (corps) => {
      const n = Array.isArray((corps as { data?: unknown }).data)
        ? (corps as { data: unknown[] }).data.length
        : 0;
      return n > 0 ? `Clé valide : ${n} modèles accessibles.` : 'Clé valide.';
    },
  },
  openai: {
    url: 'https://api.openai.com/v1/models',
    entetes: (valeur) => ({ Authorization: `Bearer ${valeur}` }),
    confirmation: () => 'Clé valide.',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/key',
    entetes: (valeur) => ({ Authorization: `Bearer ${valeur}` }),
    confirmation: () => 'Clé valide.',
  },
  mistral: {
    url: 'https://api.mistral.ai/v1/models',
    entetes: (valeur) => ({ Authorization: `Bearer ${valeur}` }),
    confirmation: () => 'Clé valide.',
  },
};

/** Erreurs imputables à la clé elle-même (comme lib/cles-api.ts). */
function echecVautPourCle(message: string): boolean {
  return /40[13]|429|quota|permission|invalid api key|api key/i.test(message);
}

/**
 * Sonde une clé. `chercher` est injectable pour les preuves ; en
 * production c'est le fetch global. Aucune valeur de clé ne figure
 * dans un message.
 */
export async function sonderCle(
  fournisseur: string,
  valeur: string,
  chercher: ChercheurSonde = fetch
): Promise<ResultatSonde> {
  const point = POINTS_DE_CONTROLE[fournisseur];
  if (!point) {
    return {
      ok: false,
      message: 'Aucun point de contrôle défini pour ce fournisseur : la clé est stockée, mais son test manuel n’est pas disponible.',
      attribuable: false,
    };
  }

  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), DELAI_MS);
  try {
    const reponse = await chercher(point.url, {
      headers: point.entetes(valeur),
      signal: controle.signal,
    });
    const texte = await reponse.text().catch(() => '');
    if (reponse.ok) {
      let corps: unknown = null;
      try {
        corps = texte ? JSON.parse(texte) : null;
      } catch {
        corps = null;
      }
      return { ok: true, message: point.confirmation(corps), attribuable: false };
    }
    // Détailler sans jamais répéter la clé ni un extrait de réponse trop long.
    const motif = texte.slice(0, 160).replace(/\s+/g, ' ').trim();
    return {
      ok: false,
      message: `HTTP ${reponse.status}${motif ? ` : ${motif}` : ' : refus du fournisseur.'}`,
      attribuable: echecVautPourCle(`HTTP ${reponse.status} ${motif}`),
    };
  } catch (e) {
    const abandonne = e instanceof Error && e.name === 'AbortError';
    return {
      ok: false,
      message: abandonne
        ? `Aucune réponse du fournisseur en ${Math.round(DELAI_MS / 1000)} s (réseau ou fournisseur surchargé).`
        : 'Requête impossible depuis le serveur (réseau, DNS ou pare-feu).',
      attribuable: false,
    };
  } finally {
    clearTimeout(minuteur);
  }
}

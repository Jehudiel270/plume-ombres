// ============================================================
// providers/gemini.ts — Fournisseur Gemini (Google AI Studio).
//
// QUALITÉ LITTÉRAIRE SUPÉRIEURE + très haut débit par requête.
// Gratuit sans carte (2026 : ~1 500 requêtes/jour, 10-15/min,
// 250k tokens/min — Gemini Flash). Activation : une clé d'API
// AI Studio dans GEMINI_API_KEY (jamais exposée au navigateur :
// tout passe par la route API serveur).
// Les textes trop longs sont découpés en phrases (maxParRequete).
// ============================================================

import type {
  FournisseurTraduction,
  OptionsTraduction,
} from './types';
import { decouperEnFragments, attendre } from './fragments';
import { composerInstructionSysteme } from '@/lib/glossaire';
import { libelleLangue, type IdFournisseur } from '@/lib/types';

const MAX_PAR_REQUETE = 6000;

interface ReponseGemini {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

export function cleGemini(): string {
  return process.env.GEMINI_API_KEY ?? '';
}

/**
 * Modèle Gemini utilisé.
 *
 * Défaut `gemini-flash-latest` (meilleure qualité Flash). La famille
 * 2.5 EXPLICITE est refusée aux nouveaux comptes (« no longer
 * available to new users »), et l'alias principal peut renvoyer 503
 * en cas de forte demande : ces deux cas déclenchent une BASCULE au
 * niveau du MODÈLE (voir modelesGemini) avant d'abandonner Gemini.
 * Surchargeable par GEMINI_MODEL.
 */
export function modeleGemini(): string {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';
}

/**
 * Modèles essayés DANS L'ORDRE pour un même appel Gemini :
 * le modèle configuré d'abord, puis des alias de secours réputés
 * disponibles (vérifiés réellement, cf. scripts/preuve-traduction-aujourdhui.mts).
 * Filet de sécurité borné (pas de boucle) contre les 404 « modèle
 * fermé aux nouveaux comptes », les 503/429 de surcharge ET les
 * requêtes qui « pendent » sans jamais répondre.
 */
const MODELES_SECOURS = [
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
];

export function modelesGemini(): string[] {
  const prefere = modeleGemini();
  return [prefere, ...MODELES_SECOURS.filter((m) => m !== prefere)];
}

/** Statuts qui justifient d'essayer le modèle de secours suivant. */
function modeleIndisponible(statut: number): boolean {
  return statut === 404 || statut === 429 || statut === 503;
}

/** Variable d'env du délai PAR MODÈLE (ms). */
export const VAR_DELAI_MODELE = 'GEMINI_MODEL_TIMEOUT_MS';
const DELAI_MODELE_DEFAUT_MS = 8000;

/**
 * Délai propre à CHAQUE modèle (ms).
 *
 * Indispensable : un alias saturé peut accepter la connexion puis
 * rester SILENCIEUX (503 « high demand » qui pend). Sans délai par
 * modèle, une seule requête figée consommait tout le budget de la
 * chaîne de secours (TRANSLATOR_FALLBACK_TIMEOUT_MS) et faisait
 * perdre Gemini entièrement — alors qu'un alias de secours répond
 * en ~1,5 s. Le budget par défaut (8 s) laisse la place aux modèles
 * suivants dans le budget global de 20 s.
 */
export function delaiModeleMs(): number {
  const n = Number(process.env[VAR_DELAI_MODELE]);
  return Number.isFinite(n) && n > 0 ? n : DELAI_MODELE_DEFAUT_MS;
}

export class FournisseurGemini implements FournisseurTraduction {
  readonly id: IdFournisseur = 'gemini';
  readonly nom = 'Gemini (Flash, qualité littéraire)';
  readonly maxCharsParRequete = MAX_PAR_REQUETE;
  readonly delaiEntreRequetes = 4500; // ~13 requêtes/min max, sous le quota
  readonly qualite = 'haute' as const;

  async traduire(texte: string, options: OptionsTraduction): Promise<string> {
    const cle = cleGemini();
    if (!cle) {
      throw new Error(
        'Gemini n’est pas activé : ajoute GEMINI_API_KEY dans .env.local.'
      );
    }
    if (texte.length <= MAX_PAR_REQUETE) {
      return this.traduireBrut(texte, options, cle);
    }
    const fragments = decouperEnFragments(texte, MAX_PAR_REQUETE);
    const traduits: string[] = [];
    for (let i = 0; i < fragments.length; i++) {
      if (i > 0) await attendre(this.delaiEntreRequetes);
      traduits.push(await this.traduireBrut(fragments[i], options, cle));
    }
    return traduits.join(' ');
  }

  private async traduireBrut(
    texte: string,
    options: OptionsTraduction,
    cle: string
  ): Promise<string> {
    // Libellés issus du CATALOGUE ÉTENDU (71 langues) : le prompt suit
    // automatiquement toute langue ajoutée, sans table à maintenir.
    const cible = libelleLangue(options.cible).toLowerCase();
    const source = libelleLangue(options.source).toLowerCase();

    const corpsRequete = JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: composerInstructionSysteme(
              'Tu es un traducteur littéraire expert spécialisé en dark romance. ' +
                'Traduis le texte fourni depuis ' +
                source +
                ' vers un ' +
                cible +
                ' naturel, fluide et évocateur, en conservant le ton, le registre ' +
                'et les émotions du texte original. Ne traduis jamais les noms ' +
                'propres. Ne renvoie que la traduction, sans commentaire ni note.',
              options
            ),
          },
        ],
      },
      contents: [{ parts: [{ text: texte }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
    });

    // Bascule AU NIVEAU DU MODÈLE : un alias fermé aux nouveaux comptes
    // (404), saturé (503/429) OU SILENCIEUX (requête qui pend sans
    // jamais répondre) ne doit pas faire perdre l'appel — on essaie le
    // modèle suivant avant d'abandonner Gemini. Chaque modèle dispose
    // de son PROPRE délai (delaiModeleMs) : un alias figé ne consomme
    // donc plus tout le budget de la chaîne de secours.
    const modeles = modelesGemini();
    let derniereErreur = '';
    for (let i = 0; i < modeles.length; i++) {
      const dernier = i === modeles.length - 1;
      let reponse: Response;
      const minuterie = new AbortController();
      const id = setTimeout(
        () => minuterie.abort(new DOMException('Modèle Gemini trop lent.', 'TimeoutError')),
        delaiModeleMs()
      );
      const signalModele = options.signal
        ? AbortSignal.any([options.signal, minuterie.signal])
        : minuterie.signal;
      try {
        reponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modeles[i]}:generateContent?key=${cle}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: signalModele,
            body: corpsRequete,
          }
        );
      } catch (e) {
        // Annulation demandée par l'appelant : on ne la masque jamais.
        if (options.signal?.aborted) throw e;
        const cause = e instanceof Error ? e.message : String(e);
        derniereErreur = `Gemini n’a pas répondu (${modeles[i]}) : ${cause}`;
        if (!dernier) continue;
        throw new Error(derniereErreur);
      } finally {
        clearTimeout(id);
      }

      if (!reponse.ok) {
        const corps = (await reponse.text()).slice(0, 300);
        derniereErreur = `Gemini a répondu ${reponse.status} (${modeles[i]}) : ${corps}`;
        if (modeleIndisponible(reponse.status) && !dernier) {
          continue;
        }
        throw new Error(derniereErreur);
      }

      const donnees = (await reponse.json()) as ReponseGemini;
      const traduit = donnees.candidates?.[0]?.content?.parts?.[0]?.text?.trimEnd();
      if (typeof traduit !== 'string' || traduit.length === 0) {
        derniereErreur = `Gemini a renvoyé une réponse vide (${modeles[i]}).`;
        if (!dernier) continue;
        throw new Error(derniereErreur);
      }
      return traduit;
    }

    throw new Error(derniereErreur || 'Gemini : aucun modèle disponible.');
  }
}

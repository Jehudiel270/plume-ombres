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
import type { IdFournisseur } from '@/lib/types';

const MAX_PAR_REQUETE = 6000;

interface ReponseGemini {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

export function cleGemini(): string {
  return process.env.GEMINI_API_KEY ?? '';
}

export function modeleGemini(): string {
  return process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
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
    const nomLangues: Record<string, string> = {
      fr: 'français',
      en: 'anglais',
      es: 'espagnol',
      it: 'italien',
      pt: 'portugais',
      de: 'allemand',
    };
    const cible = nomLangues[options.cible] ?? options.cible;
    const source = nomLangues[options.source] ?? options.source;

    const reponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modeleGemini()}:generateContent?key=${cle}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: options.signal,
        body: JSON.stringify({
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
        }),
      }
    );

    if (!reponse.ok) {
      const corps = (await reponse.text()).slice(0, 300);
      throw new Error(`Gemini a répondu ${reponse.status} : ${corps}`);
    }

    const donnees = (await reponse.json()) as ReponseGemini;
    const traduit = donnees.candidates?.[0]?.content?.parts?.[0]?.text?.trimEnd();
    if (typeof traduit !== 'string' || traduit.length === 0) {
      throw new Error('Gemini a renvoyé une réponse vide.');
    }
    return traduit;
  }
}

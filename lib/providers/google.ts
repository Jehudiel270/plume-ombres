// ============================================================
// providers/google.ts — Fournisseur « Google libre ».
//
// Endpoint public non officiel de Google Traduction (client=gtx).
// GRATUIT, SANS CLÉ, très haut débit — mais EXPÉRIMENTAL :
// pas de contrat de service, Google peut limiter ou bloquer.
// Recommandé pour les gros tirages quand Gemini n'est pas activé.
// Les fragments sont envoyés en parallèle (petits lots) avec
// retry/backoff sur les réponses 429/5xx.
// ============================================================

import type {
  FournisseurTraduction,
  OptionsTraduction,
} from './types';
import { decouperEnFragments } from './fragments';
import type { IdFournisseur } from '@/lib/types';

const TAILLE_FRAGMENT = 1500; // budget d'URL GET (q encodé)
const CONCURRENCE = 6;
const MAX_ESSAIS = 4;

function attendre(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class FournisseurGoogleLibre implements FournisseurTraduction {
  readonly id: IdFournisseur = 'google';
  readonly nom = 'Google libre (endpoint public, expérimental)';
  readonly maxCharsParRequete = 6000;
  readonly delaiEntreRequetes = 0;
  readonly qualite = 'moyenne' as const;

  async traduire(texte: string, options: OptionsTraduction): Promise<string> {
    const fragments = decouperEnFragments(texte, TAILLE_FRAGMENT);
    if (fragments.length === 1) {
      return this.traduireBrut(fragments[0], options);
    }

    // Parallélisme interne : petit lot à la fois (politesse + robustesse).
    const traduits: string[] = new Array(fragments.length);
    let suivant = 0;
    const travailleurs = Array.from({ length: Math.min(CONCURRENCE, fragments.length) }, async () => {
      for (;;) {
        const i = suivant++;
        if (i >= fragments.length) return;
        traduits[i] = await this.traduireBrut(fragments[i], options);
      }
    });
    await Promise.all(travailleurs);
    return traduits.join(' ');
  }

  private async traduireBrut(
    texte: string,
    options: OptionsTraduction
  ): Promise<string> {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: options.source,
      tl: options.cible,
      dt: 't',
      q: texte,
    });
    const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;

    let derniereErreur = '';
    for (let essai = 0; essai < MAX_ESSAIS; essai++) {
      if (essai > 0) await attendre(700 * 2 ** (essai - 1));
      try {
        const reponse = await fetch(url, { signal: options.signal });
        if (!reponse.ok) {
          derniereErreur = `HTTP ${reponse.status}`;
          if (reponse.status === 429 || reponse.status >= 500) continue;
          throw new Error(
            `Google libre a répondu ${reponse.status} (limité ou bloqué).`
          );
        }
        const donnees = (await reponse.json()) as unknown;
        const lignes = (donnees as Array<Array<Array<string>>>)[0];
        if (!Array.isArray(lignes)) {
          throw new Error('Réponse Google illisible.');
        }
        const traduit = lignes
          .map((l) => (Array.isArray(l) && typeof l[0] === 'string' ? l[0] : ''))
          .join('')
          .trimEnd();
        if (traduit.length === 0) {
          throw new Error('Réponse Google vide.');
        }
        return traduit;
      } catch (e) {
        derniereErreur = e instanceof Error ? e.message : String(e);
      }
    }
    throw new Error(`Google libre : échec après ${MAX_ESSAIS} essais (${derniereErreur}).`);
  }
}

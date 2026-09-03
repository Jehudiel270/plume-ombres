// ============================================================
// providers/libretranslate.ts — Fournisseur LibreTranslate.
//
// LibreTranslate est un moteur de traduction neuronal libre,
// auto-hébergé (Argos Translate). Aucun quota, aucune clé
// obligatoire. L'URL est configurable : par défaut l'instance
// Docker locale (http://127.0.0.1:5000) ; en production, on
// pointera vers une VM Always Free Oracle Cloud.
// ============================================================

import type {
  FournisseurTraduction,
  OptionsTraduction,
} from './types';
import type { IdFournisseur } from '@/lib/types';

export const URL_LIBRETRANSLATE_DEFAUT = 'http://127.0.0.1:5000';

export function urlLibretranslate(): string {
  return process.env.LIBRETRANSLATE_URL ?? URL_LIBRETRANSLATE_DEFAUT;
}

export class FournisseurLibreTranslate implements FournisseurTraduction {
  readonly id: IdFournisseur = 'libretranslate';
  readonly nom = 'LibreTranslate (local, gratuit)';
  readonly maxCharsParRequete = 3000;
  readonly delaiEntreRequetes = 150;
  readonly qualite = 'moyenne' as const;

  async traduire(texte: string, options: OptionsTraduction): Promise<string> {
    const reponse = await fetch(`${urlLibretranslate()}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.LIBRETRANSLATE_API_KEY
          ? { Authorization: `Bearer ${process.env.LIBRETRANSLATE_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        q: texte,
        source: options.source,
        target: options.cible,
        format: 'text',
      }),
      signal: options.signal,
    });

    if (!reponse.ok) {
      throw new Error(
        `LibreTranslate a répondu ${reponse.status} : ${(await reponse.text()).slice(0, 200)}`
      );
    }

    const donnees = (await reponse.json()) as { translatedText?: string };
    const traduit = donnees.translatedText?.trimEnd();
    if (typeof traduit !== 'string' || traduit.length === 0) {
      throw new Error('LibreTranslate a renvoyé une traduction vide.');
    }
    return traduit;
  }
}

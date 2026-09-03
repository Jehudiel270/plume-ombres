// ============================================================
// providers/libretranslate.ts — Fournisseur LibreTranslate.
//
// LibreTranslate est un moteur de traduction neuronal libre,
// auto-hébergé (Argos Translate). Aucun quota, aucune clé
// obligatoire. L'URL est configurable : par défaut l'instance
// Docker/native locale (http://127.0.0.1:5000) ; en production,
// on peut pointer vers une VM Always Free Oracle Cloud.
// Les textes plus longs que sa limite sont découpés en phrases.
// ============================================================

import type {
  FournisseurTraduction,
  OptionsTraduction,
} from './types';
import { decouperEnFragments, attendre } from './fragments';
import type { IdFournisseur } from '@/lib/types';

export const URL_LIBRETRANSLATE_DEFAUT = 'http://127.0.0.1:5000';
/** Taille maximale d'un texte par requête HTTP. */
const MAX_PAR_REQUETE = 6000;

export function urlLibretranslate(): string {
  return process.env.LIBRETRANSLATE_URL ?? URL_LIBRETRANSLATE_DEFAUT;
}

export class FournisseurLibreTranslate implements FournisseurTraduction {
  readonly id: IdFournisseur = 'libretranslate';
  readonly nom = 'LibreTranslate (local, gratuit)';
  readonly maxCharsParRequete = MAX_PAR_REQUETE;
  readonly delaiEntreRequetes = 150;
  readonly qualite = 'moyenne' as const;

  async traduire(texte: string, options: OptionsTraduction): Promise<string> {
    if (texte.length <= MAX_PAR_REQUETE) {
      return this.traduireBrut(texte, options);
    }
    // Texte très long : fragments de phrases, séparés par le délai du moteur.
    const fragments = decouperEnFragments(texte, MAX_PAR_REQUETE);
    const traduits: string[] = [];
    for (let i = 0; i < fragments.length; i++) {
      if (i > 0) await attendre(this.delaiEntreRequetes);
      traduits.push(await this.traduireBrut(fragments[i], options));
    }
    return traduits.join(' ');
  }

  private async traduireBrut(
    texte: string,
    options: OptionsTraduction
  ): Promise<string> {
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

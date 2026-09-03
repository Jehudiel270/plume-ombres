// ============================================================
// providers/mymemory.ts — Fournisseur MyMemory (API publique).
//
// Gratuit, sans clé. Avec le paramètre « de » (email) le quota
// passe à ~50 000 caractères/jour. Qualité moyenne assumée :
// ce fournisseur sert de secours quand LibreTranslate est
// indisponible (ex. app déployée sur Vercel sans VM de traduction).
// ============================================================

import type {
  FournisseurTraduction,
  OptionsTraduction,
} from './types';
import type { IdFournisseur } from '@/lib/types';

export class FournisseurMyMemory implements FournisseurTraduction {
  readonly id: IdFournisseur = 'mymemory';
  readonly nom = 'MyMemory (API publique, secours)';
  readonly maxCharsParRequete = 450;
  readonly delaiEntreRequetes = 1200;
  readonly qualite = 'moyenne' as const;

  async traduire(texte: string, options: OptionsTraduction): Promise<string> {
    const params = new URLSearchParams({
      q: texte,
      langpair: `${options.source}|${options.cible}`,
      // Le paramètre « de » (email) débloque le quota supérieur.
      ...(process.env.MYMEMORY_EMAIL ? { de: process.env.MYMEMORY_EMAIL } : {}),
    });

    const reponse = await fetch(
      `https://api.mymemory.translated.net/get?${params.toString()}`,
      { signal: options.signal }
    );

    if (!reponse.ok) {
      throw new Error(
        `MyMemory a répondu ${reponse.status} : ${(await reponse.text()).slice(0, 200)}`
      );
    }

    const donnees = (await reponse.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number | string;
      responseDetails?: string;
    };

    const statut = Number(donnees.responseStatus);
    if (statut !== 200) {
      throw new Error(
        `MyMemory : ${donnees.responseDetails ?? `statut ${statut}`}`
      );
    }

    const traduit = donnees.responseData?.translatedText?.trimEnd();
    if (typeof traduit !== 'string' || traduit.length === 0) {
      throw new Error('MyMemory a renvoyé une traduction vide.');
    }
    return traduit;
  }
}

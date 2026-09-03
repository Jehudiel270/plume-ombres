// ============================================================
// providers/mymemory.ts — Fournisseur MyMemory (API publique).
//
// Gratuit, sans clé. Avec le paramètre « de » (email) le quota
// passe à ~50 000 caractères/jour. Qualité moyenne assumée :
// fournisseur de secours. Chaque requête est plafonnée à 450
// caractères (500 octets côté serveur) : les textes plus longs
// sont découpés en phrases, espacés pour respecter le quota.
// ============================================================

import type {
  FournisseurTraduction,
  OptionsTraduction,
} from './types';
import { decouperEnFragments, attendre } from './fragments';
import type { IdFournisseur } from '@/lib/types';

const MAX_PAR_REQUETE = 450;

export class FournisseurMyMemory implements FournisseurTraduction {
  readonly id: IdFournisseur = 'mymemory';
  readonly nom = 'MyMemory (API publique, secours)';
  readonly maxCharsParRequete = MAX_PAR_REQUETE;
  readonly delaiEntreRequetes = 1200;
  readonly qualite = 'moyenne' as const;

  async traduire(texte: string, options: OptionsTraduction): Promise<string> {
    if (texte.length <= MAX_PAR_REQUETE) {
      return this.traduireBrut(texte, options);
    }
    // Découpage en phrases, espacé d'~1,2 s (respect du quota gratuit).
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

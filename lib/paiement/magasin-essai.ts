// ============================================================
// lib/paiement/magasin-essai.ts — Registre de l'essai gratuit.
//
// Encapsule les RPC SECURITY DEFINER du registre anti-abus :
//   * public.sceller_essai(p_telephone)      → lie un numéro Mobile
//     Money à l'essai, refuse (et révoque) s'il est déjà pris ;
//   * public.basculer_essai_echu(p_compte)   → bascule automatique en
//     gratuit à l'échéance (bibliothèque conservée) ;
//   * lecture de sa propre ligne public.essais_abonnement (RLS).
//
// L'écriture n'est JAMAIS directe : tout passe par les RPC.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** Réponse de sceller_essai(). */
export interface ResultatScellement {
  ok: boolean;
  code: string;
  telephone?: string;
}

/** Ligne du registre lue par le propriétaire. */
export interface LigneRegistreEssai {
  telephone: string | null;
  paye_le: string | null;
  cree_le: string | null;
}

export interface MagasinEssai {
  sceller(telephone: string): Promise<ResultatScellement>;
  basculerSiEchu(proprietaireId: string): Promise<boolean>;
  lireRegistre(proprietaireId: string): Promise<LigneRegistreEssai | null>;
}

/** Implémentation Supabase (session du compte ou service_role). */
export class MagasinEssaiSupabase implements MagasinEssai {
  constructor(private readonly client: SupabaseClient) {}

  async sceller(telephone: string): Promise<ResultatScellement> {
    const { data, error } = await this.client.rpc('sceller_essai', {
      p_telephone: telephone,
    });
    if (error) throw new Error(`essai (Supabase) : ${error.message}`);
    const objet = (data ?? {}) as Record<string, unknown>;
    return {
      ok: Boolean(objet.ok),
      code: String(objet.code ?? 'INCONNU'),
      telephone:
        typeof objet.telephone === 'string' ? objet.telephone : undefined,
    };
  }

  async basculerSiEchu(proprietaireId: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('basculer_essai_echu', {
      p_compte: proprietaireId,
    });
    if (error) throw new Error(`essai (Supabase) : ${error.message}`);
    return Boolean(data);
  }

  async lireRegistre(proprietaireId: string): Promise<LigneRegistreEssai | null> {
    const { data, error } = await this.client
      .from('essais_abonnement')
      .select('telephone, paye_le, cree_le')
      .eq('compte_id', proprietaireId)
      .maybeSingle();
    if (error) throw new Error(`essai (Supabase) : ${error.message}`);
    if (!data) return null;
    const ligne = data as Record<string, unknown>;
    return {
      telephone: (ligne.telephone as string | null) ?? null,
      paye_le: (ligne.paye_le as string | null) ?? null,
      cree_le: (ligne.cree_le as string | null) ?? null,
    };
  }
}

/** Implémentation mémoire (tests, mode sans base). */
export class MagasinEssaiMemoire implements MagasinEssai {
  private readonly registre = new Map<
    string,
    { telephone: string | null; paye_le: string | null; cree_le: string | null }
  >();

  /** Enregistre une ligne (simule le trigger d'inscription). */
  inscrire(compteId: string, email: string, telephone: string | null = null): void {
    this.registre.set(compteId, {
      telephone,
      paye_le: null,
      cree_le: new Date().toISOString(),
    });
    void email;
  }

  async sceller(telephone: string): Promise<ResultatScellement> {
    const chiffres = telephone.replace(/\D/g, '');
    if (chiffres.length < 8) return { ok: false, code: 'TELEPHONE_INVALIDE' };
    const suffixe = chiffres.slice(-8);
    for (const [compte, ligne] of this.registre) {
      if (
        ligne.paye_le === null &&
        ligne.telephone &&
        ligne.telephone.replace(/\D/g, '').slice(-8) === suffixe
      ) {
        void compte;
        return { ok: false, code: 'ESSAI_TELEPHONE_UTILISE' };
      }
    }
    return { ok: true, code: 'OK', telephone: chiffres };
  }

  async basculerSiEchu(): Promise<boolean> {
    return false;
  }

  async lireRegistre(proprietaireId: string): Promise<LigneRegistreEssai | null> {
    return this.registre.get(proprietaireId) ?? null;
  }
}

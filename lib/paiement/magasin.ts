// ============================================================
// lib/paiement/magasin.ts — Persistance des paiements et abonnements.
//
// Deux implémentations par contrat :
//  * ...Memoire    : tests bout-en-bout SANS clé ni base ;
//  * ...Supabase   : tables public.paiements / public.abonnements
//                    (abonnements écrits par public.activer_abonnement,
//                    SECURITY DEFINER).
//
// Le service du tunnel ne dépend que des interfaces : il est donc
// testable de bout en bout en mémoire.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Abonnement,
  CodePlan,
  EvenementAbonnement,
  StatutAbonnement,
} from '../abonnement';
import { caracteresPack, planParCode } from '../abonnement';
import type {
  DemandeCredit,
  MagasinCredits,
  MoyenPaiement,
  MouvementCredit,
  Paiement,
  StatutPaiement,
} from './types';

export interface ChampsMajPaiement {
  url_paiement?: string | null;
  fournisseur?: string;
  operateur?: string | null;
  reference_fournisseur?: string | null;
}

export interface MagasinPaiement {
  creer(paiement: Paiement): Promise<Paiement>;
  lire(reference: string): Promise<Paiement | null>;
  /**
   * Relit un paiement par son identifiant FOURNISSEUR (id de transaction
   * FedaPay). Sert de RATTrapage pour les transactions créées AVANT la
   * correction (sans `merchant_reference` dans leur webhook).
   */
  lireParReferenceFournisseur(
    referenceFournisseur: string
  ): Promise<Paiement | null>;
  majStatut(
    reference: string,
    statut: StatutPaiement,
    champs?: ChampsMajPaiement
  ): Promise<Paiement | null>;
  lister(proprietaireId: string): Promise<Paiement[]>;
}

export interface DemandeActivation {
  proprietaireId: string;
  plan: CodePlan;
  paiementReference: string | null;
  periodeDebut: string;
  periodeFin: string;
  motif?: string;
}

export interface MagasinAbonnement {
  lire(proprietaireId: string): Promise<Abonnement | null>;
  activer(demande: DemandeActivation): Promise<Abonnement>;
  resilier(proprietaireId: string, motif?: string): Promise<Abonnement | null>;
  listerHistorique(proprietaireId: string): Promise<EvenementAbonnement[]>;
}

// ------------------------------------------------------------
// Implémentations MÉMOIRE (tests, mode sans base)
// ------------------------------------------------------------
export class MagasinPaiementMemoire implements MagasinPaiement {
  private readonly paiements = new Map<string, Paiement>();

  async creer(paiement: Paiement): Promise<Paiement> {
    this.paiements.set(paiement.reference, { ...paiement });
    return { ...paiement };
  }

  async lire(reference: string): Promise<Paiement | null> {
    const p = this.paiements.get(reference);
    return p ? { ...p } : null;
  }

  async lireParReferenceFournisseur(
    referenceFournisseur: string
  ): Promise<Paiement | null> {
    if (!referenceFournisseur) return null;
    for (const p of this.paiements.values()) {
      if (p.reference_fournisseur === referenceFournisseur) return { ...p };
    }
    return null;
  }

  async majStatut(
    reference: string,
    statut: StatutPaiement,
    champs: ChampsMajPaiement = {}
  ): Promise<Paiement | null> {
    const p = this.paiements.get(reference);
    if (!p) return null;
    const maj: Paiement = { ...p, statut, updated_at: new Date().toISOString() };
    if (champs.url_paiement !== undefined) maj.url_paiement = champs.url_paiement;
    if (champs.fournisseur !== undefined) maj.fournisseur = champs.fournisseur;
    if (champs.operateur !== undefined) maj.operateur = champs.operateur;
    if (champs.reference_fournisseur !== undefined) {
      maj.reference_fournisseur = champs.reference_fournisseur;
    }
    this.paiements.set(reference, maj);
    return { ...maj };
  }

  async lister(proprietaireId: string): Promise<Paiement[]> {
    return [...this.paiements.values()]
      .filter((p) => p.proprietaire_id === proprietaireId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => ({ ...p }));
  }
}

export class MagasinAbonnementMemoire implements MagasinAbonnement {
  private readonly courants = new Map<string, Abonnement>();
  private readonly historique: EvenementAbonnement[] = [];
  private readonly horloge: () => Date;

  constructor(horloge: () => Date = () => new Date()) {
    this.horloge = horloge;
  }

  async lire(proprietaireId: string): Promise<Abonnement | null> {
    const a = this.courants.get(proprietaireId);
    return a ? { ...a } : null;
  }

  async activer(demande: DemandeActivation): Promise<Abonnement> {
    const iso = this.horloge().toISOString();
    const existant = this.courants.get(demande.proprietaireId);
    const abonnement: Abonnement = {
      proprietaire_id: demande.proprietaireId,
      plan: demande.plan,
      statut: 'actif',
      periode_debut: demande.periodeDebut,
      periode_fin: demande.periodeFin,
      paiement_reference: demande.paiementReference,
      created_at: existant?.created_at ?? iso,
      updated_at: iso,
    };
    this.courants.set(demande.proprietaireId, abonnement);
    this.historique.push({
      id: this.historique.length + 1,
      proprietaire_id: demande.proprietaireId,
      plan: demande.plan,
      statut: 'actif',
      periode_debut: demande.periodeDebut,
      periode_fin: demande.periodeFin,
      paiement_reference: demande.paiementReference,
      motif: demande.motif ?? 'activation',
      cree_le: iso,
    });
    return { ...abonnement };
  }

  async resilier(
    proprietaireId: string,
    motif = 'résiliation demandée'
  ): Promise<Abonnement | null> {
    const a = this.courants.get(proprietaireId);
    if (!a) return null;
    const iso = this.horloge().toISOString();
    const maj: Abonnement = { ...a, statut: 'resilie', updated_at: iso };
    this.courants.set(proprietaireId, maj);
    this.historique.push({
      id: this.historique.length + 1,
      proprietaire_id: proprietaireId,
      plan: maj.plan,
      statut: 'resilie',
      periode_debut: maj.periode_debut,
      periode_fin: maj.periode_fin,
      paiement_reference: maj.paiement_reference,
      motif,
      cree_le: iso,
    });
    return { ...maj };
  }

  async listerHistorique(proprietaireId: string): Promise<EvenementAbonnement[]> {
    return this.historique
      .filter((e) => e.proprietaire_id === proprietaireId)
      .sort((a, b) => b.cree_le.localeCompare(a.cree_le))
      .map((e) => ({ ...e }));
  }
}

// ------------------------------------------------------------
// CRÉDITS PRÉPAYÉS — implémentations
// ------------------------------------------------------------

/**
 * Magasin de crédits en MÉMOIRE : crédit idempotent par
 * `referencePaiement`, comme la contrainte UNIQUE de
 * public.credits_mouvements.
 */
export class MagasinCreditsMemoire implements MagasinCredits {
  private readonly soldes = new Map<string, number>();
  private readonly references = new Set<string>();

  async crediter(demande: DemandeCredit): Promise<number> {
    const courant = this.soldes.get(demande.proprietaireId) ?? 0;
    // Idempotence : une référence déjà vue ne crédite plus rien.
    if (this.references.has(demande.referencePaiement)) return courant;
    const apport = caracteresPack(planParCode(demande.pack));
    if (apport <= 0) throw new Error(`Pack de crédits inconnu : ${demande.pack}`);
    this.references.add(demande.referencePaiement);
    const nouveau = courant + apport;
    this.soldes.set(demande.proprietaireId, nouveau);
    return nouveau;
  }

  async lireSolde(proprietaireId: string): Promise<number> {
    return this.soldes.get(proprietaireId) ?? 0;
  }

  /** (Tests) Fixe directement un solde de départ. */
  definirSolde(proprietaireId: string, solde: number): void {
    this.soldes.set(proprietaireId, Math.max(Math.trunc(solde), 0));
  }
}

// ------------------------------------------------------------
// Implémentations SUPABASE (production)
// ------------------------------------------------------------
function ligneVersPaiement(ligne: Record<string, unknown>): Paiement {
  return {
    reference: String(ligne.reference),
    reference_fournisseur: (ligne.reference_fournisseur as string | null) ?? null,
    proprietaire_id: String(ligne.proprietaire_id),
    plan: ligne.plan as CodePlan,
    montant: Number(ligne.montant),
    devise: String(ligne.devise ?? 'XOF'),
    telephone: (ligne.telephone as string | null) ?? null,
    moyen: (ligne.moyen as MoyenPaiement) ?? 'mobile_money',
    statut: ligne.statut as StatutPaiement,
    fournisseur: String(ligne.fournisseur ?? ''),
    url_paiement: (ligne.url_paiement as string | null) ?? null,
    operateur: (ligne.operateur as string | null) ?? null,
    created_at: String(ligne.created_at),
    updated_at: String(ligne.updated_at),
  };
}

function ligneVersAbonnement(ligne: Record<string, unknown>): Abonnement {
  return {
    proprietaire_id: String(ligne.proprietaire_id),
    plan: ligne.plan as CodePlan,
    statut: ligne.statut as StatutAbonnement,
    periode_debut: (ligne.periode_debut as string | null) ?? null,
    periode_fin: (ligne.periode_fin as string | null) ?? null,
    paiement_reference: (ligne.paiement_reference as string | null) ?? null,
    created_at: String(ligne.created_at),
    updated_at: String(ligne.updated_at),
  };
}

export class MagasinPaiementSupabase implements MagasinPaiement {
  constructor(private readonly client: SupabaseClient) {}

  async creer(paiement: Paiement): Promise<Paiement> {
    const { data, error } = await this.client
      .from('paiements')
      .insert(paiement)
      .select()
      .maybeSingle();
    if (error) throw new Error(`paiement (Supabase) : ${error.message}`);
    if (!data) throw new Error('paiement (Supabase) : création sans retour');
    return ligneVersPaiement(data as Record<string, unknown>);
  }

  async lire(reference: string): Promise<Paiement | null> {
    const { data, error } = await this.client
      .from('paiements')
      .select('*')
      .eq('reference', reference)
      .maybeSingle();
    if (error) throw new Error(`paiement (Supabase) : ${error.message}`);
    return data ? ligneVersPaiement(data as Record<string, unknown>) : null;
  }

  async lireParReferenceFournisseur(
    referenceFournisseur: string
  ): Promise<Paiement | null> {
    if (!referenceFournisseur) return null;
    const { data, error } = await this.client
      .from('paiements')
      .select('*')
      .eq('reference_fournisseur', referenceFournisseur)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`paiement (Supabase) : ${error.message}`);
    return data ? ligneVersPaiement(data as Record<string, unknown>) : null;
  }

  async majStatut(
    reference: string,
    statut: StatutPaiement,
    champs: ChampsMajPaiement = {}
  ): Promise<Paiement | null> {
    const { data, error } = await this.client
      .from('paiements')
      .update({ statut, ...champs, updated_at: new Date().toISOString() })
      .eq('reference', reference)
      .select()
      .maybeSingle();
    if (error) throw new Error(`paiement (Supabase) : ${error.message}`);
    return data ? ligneVersPaiement(data as Record<string, unknown>) : null;
  }

  async lister(proprietaireId: string): Promise<Paiement[]> {
    const { data, error } = await this.client
      .from('paiements')
      .select('*')
      .eq('proprietaire_id', proprietaireId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`paiement (Supabase) : ${error.message}`);
    return (data ?? []).map((l) => ligneVersPaiement(l as Record<string, unknown>));
  }
}

export class MagasinAbonnementSupabase implements MagasinAbonnement {
  constructor(private readonly client: SupabaseClient) {}

  async lire(proprietaireId: string): Promise<Abonnement | null> {
    const { data, error } = await this.client
      .from('abonnements')
      .select('*')
      .eq('proprietaire_id', proprietaireId)
      .maybeSingle();
    if (error) throw new Error(`abonnement (Supabase) : ${error.message}`);
    return data ? ligneVersAbonnement(data as Record<string, unknown>) : null;
  }

  async activer(demande: DemandeActivation): Promise<Abonnement> {
    // Écriture via public.activer_abonnement (SECURITY DEFINER) :
    // aucun droit d'écriture direct sur public.abonnements.
    const { data, error } = await this.client.rpc('activer_abonnement', {
      p_proprietaire: demande.proprietaireId,
      p_plan: demande.plan,
      p_reference: demande.paiementReference,
      p_debut: demande.periodeDebut,
      p_fin: demande.periodeFin,
      p_motif: demande.motif ?? 'activation',
    });
    if (error) throw new Error(`abonnement (Supabase) : ${error.message}`);
    const ligne = (Array.isArray(data) ? data[0] : data) as
      | Record<string, unknown>
      | undefined;
    if (!ligne) throw new Error('abonnement (Supabase) : activation sans retour');
    return ligneVersAbonnement(ligne);
  }

  async resilier(
    proprietaireId: string,
    motif = 'résiliation demandée'
  ): Promise<Abonnement | null> {
    const { data, error } = await this.client.rpc('resilier_abonnement', {
      p_proprietaire: proprietaireId,
      p_motif: motif,
    });
    if (error) throw new Error(`abonnement (Supabase) : ${error.message}`);
    const ligne = (Array.isArray(data) ? data[0] : data) as
      | Record<string, unknown>
      | undefined;
    return ligne ? ligneVersAbonnement(ligne) : null;
  }

  async listerHistorique(proprietaireId: string): Promise<EvenementAbonnement[]> {
    const { data, error } = await this.client
      .from('abonnements_historique')
      .select('*')
      .eq('proprietaire_id', proprietaireId)
      .order('cree_le', { ascending: false });
    if (error) throw new Error(`abonnement (Supabase) : ${error.message}`);
    return (data ?? []).map((l) => {
      const r = l as Record<string, unknown>;
      return {
        id: Number(r.id),
        proprietaire_id: String(r.proprietaire_id),
        plan: r.plan as CodePlan,
        statut: r.statut as StatutAbonnement,
        periode_debut: (r.periode_debut as string | null) ?? null,
        periode_fin: (r.periode_fin as string | null) ?? null,
        paiement_reference: (r.paiement_reference as string | null) ?? null,
        motif: (r.motif as string | null) ?? null,
        cree_le: String(r.cree_le),
      };
    });
  }
}

/**
 * Magasin de crédits SUPABASE : écriture via public.crediter_pack
 * (SECURITY DEFINER, IDEMPOTENTE) et lecture via public.solde_credits.
 * Aucun droit d'écriture direct sur public.credits_traduction.
 */
export class MagasinCreditsSupabase implements MagasinCredits {
  constructor(private readonly client: SupabaseClient) {}

  async crediter(demande: DemandeCredit): Promise<number> {
    const { data, error } = await this.client.rpc('crediter_pack', {
      p_proprietaire: demande.proprietaireId,
      p_pack: demande.pack,
      p_reference_paiement: demande.referencePaiement,
      p_montant: demande.montant,
    });
    if (error) throw new Error(`crédits (Supabase) : ${error.message}`);
    return Number(data ?? 0);
  }

  async lireSolde(proprietaireId: string): Promise<number> {
    const { data, error } = await this.client.rpc('solde_credits', {
      p_proprietaire: proprietaireId,
    });
    if (error) throw new Error(`crédits (Supabase) : ${error.message}`);
    return Number(data ?? 0);
  }
}

/**
 * Journal des crédits d'un compte (lecture seule, borné).
 * La RLS ne laisse voir que ses propres lignes ; on borne en plus le
 * nombre de lignes remontées à l'affichage.
 */
export async function lireMouvementsCredits(
  client: SupabaseClient,
  proprietaireId: string,
  limite = 20
): Promise<MouvementCredit[]> {
  const { data, error } = await client
    .from('credits_mouvements')
    .select('*')
    .eq('proprietaire_id', proprietaireId)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw new Error(`crédits (Supabase) : ${error.message}`);
  return (data ?? []).map((l) => {
    const r = l as Record<string, unknown>;
    return {
      id: Number(r.id),
      pack_code: (r.pack_code as string | null) ?? null,
      caracteres: Number(r.caracteres ?? 0),
      montant: r.montant === null || r.montant === undefined ? null : Number(r.montant),
      devise: (r.devise as string | null) ?? null,
      reference_paiement: (r.reference_paiement as string | null) ?? null,
      created_at: String(r.created_at),
    };
  });
}

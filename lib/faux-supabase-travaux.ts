// ============================================================
// faux-supabase-travaux.ts — Double de test EN MÉMOIRE.
//
// Ne sert QU'AUX PREUVES (lib/travaux-traduction.test.ts et
// scripts/preuve-persistance.mts) : aucun code applicatif ne l'importe.
// Aucun réseau, aucune base réelle.
//
// Ce qu'il imite de PostgREST / Postgres, volontairement et pas plus :
//  - select / insert / update avec les filtres eq, in, is, lt, gte ;
//  - order (date ou nombre), limit, single, maybeSingle, `await` direct ;
//  - les valeurs par défaut de la table (id, statut, compteurs, dates) ;
//  - l'index d'unicité partiel « un seul travail actif par livre »
//    (erreur 23505), y compris en cas de course entre deux INSERT ;
//  - le trigger BEFORE UPDATE qui repose maj_le ;
//  - PGRST116 quand single() ne ramène pas exactement une ligne.
//
// Tout le reste (FK, RLS, CHECK) est hors périmètre : les tests portent
// sur la LOGIQUE de lib/travaux-traduction.ts, pas sur la base.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type StatutFaux = 'en_attente' | 'en_cours' | 'termine' | 'erreur' | 'annule';

export interface LigneTravailFaux {
  id: string;
  livre_id: string;
  proprietaire_id: string;
  statut: StatutFaux;
  traites: number;
  total: number;
  erreurs: number;
  cree_le: string;
  maj_le: string;
  battement_le: string | null;
}

export interface ErreurFaux {
  code: string;
  message: string;
  details?: string;
}

export interface ReponseFaux {
  data: unknown;
  error: ErreurFaux | null;
}

/** Une écriture réellement envoyée par le code testé. */
export interface EcritureFaux {
  table: string;
  operation: 'insert' | 'update';
  /** Payload EXACT reçu (aucun champ ajouté par le double). */
  valeurs: Record<string, unknown>;
  /** Lignes touchées (vide pour un INSERT). */
  ids: string[];
}

interface FiltreFaux {
  colonne: string;
  operation: 'eq' | 'in' | 'is' | 'lt' | 'gte';
  valeur: unknown;
}

export interface RequeteFaux {
  select(colonnes?: string): RequeteFaux;
  eq(colonne: string, valeur: unknown): RequeteFaux;
  in(colonne: string, valeurs: readonly unknown[]): RequeteFaux;
  is(colonne: string, valeur: null | boolean): RequeteFaux;
  lt(colonne: string, valeur: unknown): RequeteFaux;
  gte(colonne: string, valeur: unknown): RequeteFaux;
  order(colonne: string, options?: { ascending?: boolean }): RequeteFaux;
  limit(nombre: number): RequeteFaux;
  insert(valeurs: Record<string, unknown>): RequeteFaux;
  update(valeurs: Record<string, unknown>): RequeteFaux;
  single(): Promise<ReponseFaux>;
  maybeSingle(): Promise<ReponseFaux>;
  then(
    onFulfilled?: ((valeur: ReponseFaux) => unknown) | null,
    onRejected?: ((raison: unknown) => unknown) | null
  ): Promise<unknown>;
}

const STATUTS_ACTIFS_FAUX: readonly StatutFaux[] = ['en_attente', 'en_cours'];

/** Compare deux valeurs comme le ferait Postgres sur timestamptz / int. */
function comparer(a: unknown, b: unknown): number {
  const dateA = typeof a === 'string' ? Date.parse(a) : NaN;
  const dateB = typeof b === 'string' ? Date.parse(b) : NaN;
  if (Number.isFinite(dateA) && Number.isFinite(dateB)) return dateA - dateB;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const texteA = String(a);
  const texteB = String(b);
  if (texteA === texteB) return 0;
  return texteA < texteB ? -1 : 1;
}

function correspond(ligne: LigneTravailFaux, filtre: FiltreFaux): boolean {
  const valeur = (ligne as unknown as Record<string, unknown>)[filtre.colonne];
  switch (filtre.operation) {
    case 'eq':
      return valeur === filtre.valeur;
    case 'in':
      return (filtre.valeur as readonly unknown[]).includes(valeur);
    case 'is':
      // PostgREST : is(null) teste IS NULL.
      return filtre.valeur === null ? valeur === null : valeur === filtre.valeur;
    case 'lt':
      return valeur !== null && comparer(valeur, filtre.valeur) < 0;
    case 'gte':
      return valeur !== null && comparer(valeur, filtre.valeur) >= 0;
    default:
      return false;
  }
}

function copier(ligne: LigneTravailFaux): LigneTravailFaux {
  return { ...ligne };
}

/** Violation de travaux_traduction_actif_livre_idx ? */
function violationUnicite(lignes: LigneTravailFaux[]): boolean {
  const vus = new Set<string>();
  for (const ligne of lignes) {
    if (!STATUTS_ACTIFS_FAUX.includes(ligne.statut)) continue;
    if (vus.has(ligne.livre_id)) return true;
    vus.add(ligne.livre_id);
  }
  return false;
}

export class FauxSupabaseTravaux {
  readonly lignes: LigneTravailFaux[] = [];
  readonly ecritures: EcritureFaux[] = [];
  /** Journal des opérations, dans l'ordre : « select », « insert », « update ». */
  readonly journal: string[] = [];

  private compteur = 0;
  private readonly ordres = new Map<string, number>();
  private course: { livre_id: string; servie: boolean } | null = null;

  /** Insère une ligne directement (mise en place du décor d'un test). */
  inserer(ligne: Partial<LigneTravailFaux> & { livre_id: string }): LigneTravailFaux {
    const maintenant = new Date().toISOString();
    const complete: LigneTravailFaux = {
      id: ligne.id ?? `travail-${++this.compteur}`,
      livre_id: ligne.livre_id,
      proprietaire_id: ligne.proprietaire_id ?? 'proprietaire-faux',
      statut: ligne.statut ?? 'en_attente',
      traites: ligne.traites ?? 0,
      total: ligne.total ?? 0,
      erreurs: ligne.erreurs ?? 0,
      cree_le: ligne.cree_le ?? maintenant,
      maj_le: ligne.maj_le ?? maintenant,
      battement_le: ligne.battement_le ?? null,
    };
    this.ordres.set(complete.id, this.ordres.size);
    this.lignes.push(complete);
    return complete;
  }

  /** Récupère une ligne (assertions et vieillissement du battement). */
  parId(id: string): LigneTravailFaux {
    const ligne = this.lignes.find((l) => l.id === id);
    if (!ligne) throw new Error(`Ligne absente du faux : ${id}`);
    return ligne;
  }

  /** Simule le temps qui passe sur le battement (« l'onglet ne bat plus »). */
  vieillirBattement(id: string, ms: number): void {
    const ligne = this.parId(id);
    const base = ligne.battement_le ? Date.parse(ligne.battement_le) : Date.now();
    ligne.battement_le = new Date(base - ms).toISOString();
  }

  /**
   * Programme une COURSE : au prochain INSERT sur ce livre, un autre
   * client insère d'abord (le gagnant) et le nôtre reçoit 23505.
   */
  programmerCourse(livreId: string): void {
    this.course = { livre_id: livreId, servie: false };
  }

  /** Lignes actives d'un livre (invariant « un seul travail actif »). */
  actifsDuLivre(livreId: string): LigneTravailFaux[] {
    return this.lignes.filter(
      (l) => l.livre_id === livreId && STATUTS_ACTIFS_FAUX.includes(l.statut)
    );
  }

  /** `true` si aucune ligne n'a été modifiée en base. */
  get ecrituresVides(): boolean {
    return this.ecritures.length === 0;
  }

  from(table: string): RequeteFaux {
    let mode: 'select' | 'insert' | 'update' = 'select';
    let valeurs: Record<string, unknown> = {};
    const filtres: FiltreFaux[] = [];
    let tri: { colonne: string; ascendant: boolean } | null = null;
    let borne: number | null = null;

    const selectionner = (): LigneTravailFaux[] => {
      const retenues = this.lignes.filter((ligne) =>
        filtres.every((filtre) => correspond(ligne, filtre))
      );
      if (tri) {
        const { colonne, ascendant } = tri;
        retenues.sort((a, b) => {
          const ordre =
            comparer(
              (a as unknown as Record<string, unknown>)[colonne],
              (b as unknown as Record<string, unknown>)[colonne]
            ) || (this.ordres.get(a.id) ?? 0) - (this.ordres.get(b.id) ?? 0);
          return ascendant ? ordre : -ordre;
        });
      }
      return borne === null ? retenues : retenues.slice(0, borne);
    };

    const executer = (): ReponseFaux => {
      this.journal.push(`${mode}:${table}`);
      if (table !== 'travaux_traduction') {
        return { data: null, error: { code: '42P01', message: `Table inconnue : ${table}` } };
      }

      if (mode === 'insert') {
        return this.executerInsert(valeurs);
      }

      const cibles = selectionner();
      if (mode === 'update') {
        return this.executerUpdate(cibles, valeurs);
      }
      return { data: cibles.map(copier), error: null };
    };

    const requete: RequeteFaux = {
      select() {
        return requete;
      },
      eq(colonne, valeur) {
        filtres.push({ colonne, operation: 'eq', valeur });
        return requete;
      },
      in(colonne, valeursIn) {
        filtres.push({ colonne, operation: 'in', valeur: [...valeursIn] });
        return requete;
      },
      is(colonne, valeur) {
        filtres.push({ colonne, operation: 'is', valeur });
        return requete;
      },
      lt(colonne, valeur) {
        filtres.push({ colonne, operation: 'lt', valeur });
        return requete;
      },
      gte(colonne, valeur) {
        filtres.push({ colonne, operation: 'gte', valeur });
        return requete;
      },
      order(colonne, options) {
        tri = { colonne, ascendant: options?.ascending !== false };
        return requete;
      },
      limit(nombre) {
        borne = nombre;
        return requete;
      },
      insert(nouvelles) {
        mode = 'insert';
        valeurs = nouvelles;
        return requete;
      },
      update(patch) {
        mode = 'update';
        valeurs = patch;
        return requete;
      },
      async single() {
        const reponse = executer();
        if (reponse.error) return reponse;
        const lignes = reponse.data as LigneTravailFaux[];
        if (lignes.length !== 1) {
          return {
            data: null,
            error: {
              code: 'PGRST116',
              message: 'JSON object requested, multiple (or no) rows returned',
            },
          };
        }
        return { data: lignes[0], error: null };
      },
      async maybeSingle() {
        const reponse = executer();
        if (reponse.error) return reponse;
        const lignes = reponse.data as LigneTravailFaux[];
        if (lignes.length > 1) {
          return {
            data: null,
            error: {
              code: 'PGRST116',
              message: 'JSON object requested, multiple (or no) rows returned',
            },
          };
        }
        return { data: lignes[0] ?? null, error: null };
      },
      then(onFulfilled, onRejected) {
        const reponse = executer();
        return Promise.resolve(reponse).then(onFulfilled, onRejected);
      },
    };

    return requete;
  }

  /** INSERT : valeurs par défaut + index d'unicité + course éventuelle. */
  private executerInsert(valeurs: Record<string, unknown>): ReponseFaux {
    const maintenant = new Date().toISOString();
    const livreId = typeof valeurs.livre_id === 'string' ? valeurs.livre_id : '';
    if (!livreId) {
      return { data: null, error: { code: '23502', message: 'livre_id est NOT NULL' } };
    }

    if (this.course && !this.course.servie && this.course.livre_id === livreId) {
      this.course.servie = true;
      // L'autre client a gagné la course.
      this.inserer({ livre_id: livreId, statut: 'en_cours', battement_le: maintenant });
      return {
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "travaux_traduction_actif_livre_idx"',
        },
      };
    }

    const ligne: LigneTravailFaux = {
      id: `travail-${++this.compteur}`,
      livre_id: livreId,
      proprietaire_id:
        typeof valeurs.proprietaire_id === 'string'
          ? valeurs.proprietaire_id
          : 'proprietaire-faux',
      statut:
        valeurs.statut === 'en_cours' ||
        valeurs.statut === 'termine' ||
        valeurs.statut === 'erreur' ||
        valeurs.statut === 'annule'
          ? valeurs.statut
          : 'en_attente',
      traites: typeof valeurs.traites === 'number' ? valeurs.traites : 0,
      total: typeof valeurs.total === 'number' ? valeurs.total : 0,
      erreurs: typeof valeurs.erreurs === 'number' ? valeurs.erreurs : 0,
      cree_le: maintenant,
      maj_le: maintenant,
      battement_le:
        typeof valeurs.battement_le === 'string' ? valeurs.battement_le : null,
    };

    if (violationUnicite([...this.lignes, ligne])) {
      return {
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "travaux_traduction_actif_livre_idx"',
        },
      };
    }

    this.ecritures.push({ table: 'travaux_traduction', operation: 'insert', valeurs, ids: [] });
    this.ordres.set(ligne.id, this.ordres.size);
    this.lignes.push(ligne);
    return { data: [copier(ligne)], error: null };
  }

  /** UPDATE : patch appliqué aux seules lignes filtrées, maj_le reposé. */
  private executerUpdate(
    cibles: LigneTravailFaux[],
    patch: Record<string, unknown>
  ): ReponseFaux {
    const maintenant = new Date().toISOString();
    const idsCibles = new Set(cibles.map((l) => l.id));

    const apres = this.lignes.map((ligne) => {
      if (!idsCibles.has(ligne.id)) return ligne;
      return {
        ...ligne,
        ...(patch as Partial<LigneTravailFaux>),
        // Trigger BEFORE UPDATE.
        maj_le: maintenant,
      };
    });

    if (violationUnicite(apres)) {
      return {
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "travaux_traduction_actif_livre_idx"',
        },
      };
    }

    for (let index = 0; index < this.lignes.length; index += 1) {
      this.lignes[index] = apres[index];
    }

    this.ecritures.push({
      table: 'travaux_traduction',
      operation: 'update',
      valeurs: patch,
      ids: [...idsCibles],
    });

    return { data: cibles.map((ligne) => copier(this.parId(ligne.id))), error: null };
  }
}

/**
 * Vue « SupabaseClient » du double, pour appeler le code de production qui
 * est typé sur le vrai client. Unique conversion de type du montage.
 */
export function clientFaux(faux: FauxSupabaseTravaux): SupabaseClient {
  return faux as unknown as SupabaseClient;
}

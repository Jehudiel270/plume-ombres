// ============================================================
// app/api/glossaire/route.ts — Gestion du glossaire (F16).
//
// La MÉCANIQUE du glossaire existe déjà côté traduction
// (lib/glossaire.ts : injection dans les prompts, budgets, entrées
// verrouillées). Cette route expose la gestion :
//
//   POST   { livreId, source, traduction, categorie?, verrouillee? }
//          → ajoute (ou met à jour) une entrée ;
//   PATCH  { id, source?, traduction?, categorie?, verrouillee? }
//          → met à jour une entrée existante ;
//   DELETE { id }
//          → supprime une entrée.
//
// GARDES (le serveur est l'autorité) :
//   1. interrupteur `glossaire` (verifierModuleApi : éteint → 404,
//      plan insuffisant → 403) ;
//   2. propriété du livre vérifiée par RLS (un livre d'autrui se
//      comporte comme introuvable) ;
//   3. la lib lève sur toute donnée invalide (source/traduction
//      requises, clé normalisée unique).
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { niveauPlanDepuisCode } from '@/lib/fonctionnalites/registre';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  ajouterEntree,
  majEntree,
  supprimerEntree,
} from '@/lib/glossaire';
import type { CategorieGlossaire } from '@/lib/types';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES: readonly CategorieGlossaire[] = [
  'personnage',
  'lieu',
  'terme',
  'autre',
];

function categorieValide(valeur: unknown): valeur is CategorieGlossaire {
  return typeof valeur === 'string' && CATEGORIES.includes(valeur as CategorieGlossaire);
}

/** Contexte complet (utilisateur, plan, module) ou réponse d'erreur. */
async function contexte(): Promise<
  | {
      ok: true;
      utilisateurId: string;
      client: Awaited<ReturnType<typeof creerClientServeur>>;
    }
  | { ok: false; reponse: NextResponse }
> {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    return {
      ok: false,
      reponse: NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 }),
    };
  }
  const client = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(client)
    .lire(utilisateur.id)
    .catch(() => null);
  const module = await verifierModuleApi('glossaire', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!module.ouvert && module.reponseApi) {
    return { ok: false, reponse: module.reponseApi };
  }
  return { ok: true, utilisateurId: utilisateur.id, client };
}

/** Vrai si le livre appartient au compte connecté (RLS « own »). */
async function livreDuCompte(
  client: Awaited<ReturnType<typeof creerClientServeur>>,
  livreId: string
): Promise<boolean> {
  const { data } = await client
    .from('livres')
    .select('id')
    .eq('id', livreId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Vérifie qu'une entrée de glossaire appartient bien à un livre du
 * compte connecté (entrée → glossaire → livre → RLS).
 */
async function entreeDuCompte(
  client: Awaited<ReturnType<typeof creerClientServeur>>,
  id: number
): Promise<boolean> {
  const { data: entree } = await client
    .from('glossaire_entrees')
    .select('glossaire_id')
    .eq('id', id)
    .maybeSingle();
  if (!entree) return false;
  const { data: glossaire } = await client
    .from('glossaires')
    .select('livre_id')
    .eq('id', (entree as { glossaire_id: string }).glossaire_id)
    .maybeSingle();
  if (!glossaire) return false;
  return livreDuCompte(
    client,
    (glossaire as { livre_id: string }).livre_id
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const contexteAppel = await contexte();
  if (!contexteAppel.ok) return contexteAppel.reponse;
  const { client } = contexteAppel;

  let corps: {
    livreId?: unknown;
    source?: unknown;
    traduction?: unknown;
    categorie?: unknown;
    verrouillee?: unknown;
  };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  const livreId = typeof corps.livreId === 'string' ? corps.livreId : '';
  if (!UUID.test(livreId)) {
    return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 400 });
  }
  if (!(await livreDuCompte(client, livreId))) {
    return NextResponse.json({ erreur: 'Livre introuvable.' }, { status: 404 });
  }

  const source = typeof corps.source === 'string' ? corps.source : '';
  const traduction = typeof corps.traduction === 'string' ? corps.traduction : '';
  if (!source.trim() || !traduction.trim()) {
    return NextResponse.json(
      { erreur: 'La source et la traduction sont requises.' },
      { status: 400 }
    );
  }
  if (corps.categorie !== undefined && !categorieValide(corps.categorie)) {
    return NextResponse.json(
      { erreur: 'Catégorie inconnue (personnage, lieu, terme, autre).' },
      { status: 400 }
    );
  }

  const { data: livre } = await client
    .from('livres')
    .select('langue_source, langue_cible')
    .eq('id', livreId)
    .maybeSingle();
  if (!livre) {
    return NextResponse.json({ erreur: 'Livre introuvable.' }, { status: 404 });
  }
  const fiche = livre as { langue_source: string; langue_cible: string };

  try {
    const entree = await ajouterEntree(
      client,
      {
        id: livreId,
        langue_source: fiche.langue_source,
        langue_cible: fiche.langue_cible,
      },
      {
        source,
        traduction,
        categorie: categorieValide(corps.categorie) ? corps.categorie : 'autre',
        verrouillee: corps.verrouillee === true,
      }
    );
    return NextResponse.json({ ok: true, entree });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Échec de l’ajout.' },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const contexteAppel = await contexte();
  if (!contexteAppel.ok) return contexteAppel.reponse;
  const { client } = contexteAppel;

  let corps: {
    id?: unknown;
    source?: unknown;
    traduction?: unknown;
    categorie?: unknown;
    verrouillee?: unknown;
  };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  const id = Number(corps.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ erreur: 'Entrée invalide.' }, { status: 400 });
  }
  if (!(await entreeDuCompte(client, id))) {
    return NextResponse.json({ erreur: 'Entrée introuvable.' }, { status: 404 });
  }
  if (corps.categorie !== undefined && !categorieValide(corps.categorie)) {
    return NextResponse.json(
      { erreur: 'Catégorie inconnue (personnage, lieu, terme, autre).' },
      { status: 400 }
    );
  }

  const maj: {
    source?: string;
    traduction?: string;
    categorie?: CategorieGlossaire;
    verrouillee?: boolean;
  } = {};
  if (typeof corps.source === 'string') {
    if (!corps.source.trim()) {
      return NextResponse.json({ erreur: 'La source ne peut pas être vide.' }, { status: 400 });
    }
    maj.source = corps.source;
  }
  if (typeof corps.traduction === 'string') {
    if (!corps.traduction.trim()) {
      return NextResponse.json(
        { erreur: 'La traduction ne peut pas être vide.' },
        { status: 400 }
      );
    }
    maj.traduction = corps.traduction;
  }
  if (categorieValide(corps.categorie)) maj.categorie = corps.categorie;
  if (typeof corps.verrouillee === 'boolean') maj.verrouillee = corps.verrouillee;
  if (Object.keys(maj).length === 0) {
    return NextResponse.json({ erreur: 'Aucun champ à mettre à jour.' }, { status: 400 });
  }

  try {
    const entree = await majEntree(client, id, maj);
    return NextResponse.json({ ok: true, entree });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Échec de la mise à jour.' },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const contexteAppel = await contexte();
  if (!contexteAppel.ok) return contexteAppel.reponse;
  const { client } = contexteAppel;

  let corps: { id?: unknown };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  const id = Number(corps.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ erreur: 'Entrée invalide.' }, { status: 400 });
  }
  if (!(await entreeDuCompte(client, id))) {
    return NextResponse.json({ erreur: 'Entrée introuvable.' }, { status: 404 });
  }

  try {
    await supprimerEntree(client, id);
    return NextResponse.json({ ok: true });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Échec de la suppression.' },
      { status: 400 }
    );
  }
}

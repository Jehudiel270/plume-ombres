// ============================================================
// app/api/theories/route.ts — Théories de lecture (F8).
//
//   GET    ?livre=<uuid>&terme=<texte> — COMPARATEUR (F19) :
//          paires source ↔ traduit où le terme apparaît, bornées ;
//   POST   { livreId, chapitreId?, titre, raisonnement, etiquettes? }
//   PATCH  { id, titre?, raisonnement?, statut?, etiquettes? }
//   DELETE { id }
//
// GARDES (le serveur est l'autorité) : interrupteur `theories`
// (éteint → 404, plan insuffisant → 403), session, UUID validés,
// RLS « own » (théories d'autrui invisibles et inaccessibles).
// Les théories restent PRIVÉES : aucune route de partage ici.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  ajouterTheorie,
  majTheorie,
  supprimerTheorie,
  estStatut,
  comparerTerme,
} from '@/lib/theories';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function contexte(): Promise<
  | { ok: true; client: Awaited<ReturnType<typeof creerClientServeur>> }
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
  const module = await verifierModuleApi('theories', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!module.ouvert && module.reponseApi) {
    return { ok: false, reponse: module.reponseApi };
  }
  return { ok: true, client };
}

async function corpsValide(
  request: NextRequest
): Promise<Record<string, unknown> | null> {
  try {
    const corps = (await request.json()) as unknown;
    return corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** GET ?livre=<uuid>&terme=<texte> — comparateur (F19). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;

  const params = request.nextUrl.searchParams;
  const livreId = params.get('livre') ?? '';
  const terme = params.get('terme') ?? '';
  if (!UUID.test(livreId)) {
    return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 400 });
  }

  try {
    const paires = await comparerTerme(ctx.client, livreId, terme);
    return NextResponse.json({ ok: true, paires });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Recherche impossible.' },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;

  const corps = await corpsValide(request);
  if (!corps) {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }
  const livreId = typeof corps.livreId === 'string' ? corps.livreId : '';
  if (!UUID.test(livreId)) {
    return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 400 });
  }
  const titre = typeof corps.titre === 'string' ? corps.titre : '';
  const raisonnement = typeof corps.raisonnement === 'string' ? corps.raisonnement : '';
  const etiquettes = Array.isArray(corps.etiquettes)
    ? corps.etiquettes.filter((t): t is string => typeof t === 'string')
    : [];

  try {
    const theorie = await ajouterTheorie(ctx.client, {
      livreId,
      chapitreId:
        typeof corps.chapitreId === 'string' && UUID.test(corps.chapitreId)
          ? corps.chapitreId
          : null,
      titre,
      raisonnement,
      etiquettes,
    });
    return NextResponse.json({ ok: true, theorie });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Échec de l’ajout.' },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;

  const corps = await corpsValide(request);
  if (!corps) {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }
  const id = typeof corps.id === 'string' && UUID.test(corps.id) ? corps.id : '';
  if (!id) {
    return NextResponse.json({ erreur: 'Théorie invalide.' }, { status: 400 });
  }

  const maj: {
    titre?: string;
    raisonnement?: string;
    statut?: Parameters<typeof majTheorie>[2]['statut'];
    etiquettes?: string[];
  } = {};
  if (typeof corps.titre === 'string') maj.titre = corps.titre;
  if (typeof corps.raisonnement === 'string') maj.raisonnement = corps.raisonnement;
  if (estStatut(corps.statut)) maj.statut = corps.statut;
  if (Array.isArray(corps.etiquettes)) {
    maj.etiquettes = corps.etiquettes.filter((t): t is string => typeof t === 'string');
  }
  if (Object.keys(maj).length === 0) {
    return NextResponse.json({ erreur: 'Aucun champ à mettre à jour.' }, { status: 400 });
  }

  try {
    await majTheorie(ctx.client, id, maj);
    return NextResponse.json({ ok: true });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Échec de la mise à jour.' },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;

  const corps = await corpsValide(request);
  if (!corps) {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }
  const id = typeof corps.id === 'string' && UUID.test(corps.id) ? corps.id : '';
  if (!id) {
    return NextResponse.json({ erreur: 'Théorie invalide.' }, { status: 400 });
  }

  try {
    await supprimerTheorie(ctx.client, id);
    return NextResponse.json({ ok: true });
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Échec de la suppression.' },
      { status: 400 }
    );
  }
}

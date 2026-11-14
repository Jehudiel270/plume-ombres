// ============================================================
// app/api/clubs/[id]/etapes/route.ts — Programme de lecture par
// étapes (F11 v4, reprise du cahier initial : 4 chapitres par
// semaine, focus, déverrouillage progressif).
//
//   GET    → les étapes + le plafond ouvert du club (dernier
//            chapitre de la dernière étape DÉBLOQUÉE).
//   POST   → { action: 'generer', totalChapitres, parEtape? } :
//            le STAFF pose le programme (remplace l'existant,
//            première étape ouverte immédiatement).
//   PATCH  → { numero } : le STAFF déverrouille l'étape suivante
//            (contrôle séquentiel — jamais de saut en avant).
//
// GARDES : session 401, module `clubs`, adhésion (404), staff.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { contexteClub, reponseStaff } from '../contexte';
import {
  bornePosition,
  genererEtapes,
  propreTexte,
  MAX_ETAPES,
} from '@/lib/clubs';

export const runtime = 'nodejs';

type LigneEtape = {
  club_id: string;
  numero: number;
  chapitre_de: number;
  chapitre_a: number;
  focus: string | null;
  debloque_le: string | null;
};

export async function GET(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexteClub(id);
  if (!c.ok) return c.reponse;

  const { data } = await c.client
    .from('clubs_etapes')
    .select('club_id, numero, chapitre_de, chapitre_a, focus, debloque_le')
    .eq('club_id', c.clubId)
    .order('numero', { ascending: true })
    .limit(MAX_ETAPES);

  const lignes = ((data ?? []) as unknown as LigneEtape[]).map((l) => ({
    numero: l.numero,
    chapitreDe: l.chapitre_de,
    chapitreA: l.chapitre_a,
    focus: l.focus ?? '',
    debloqueLe: l.debloque_le,
    ouverte: l.debloque_le !== null,
  }));
  const dernierOuvert = lignes.reduce<number | null>(
    (max, l) => (l.ouverte ? Math.max(max ?? 0, l.chapitreA) : max),
    null
  );

  return NextResponse.json({ etapes: lignes, dernierChapitreDebloque: dernierOuvert });
}

export async function POST(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexteClub(id);
  if (!c.ok) return c.reponse;
  if (!c.estStaff) return reponseStaff();

  const corps = (await requete.json().catch(() => ({}))) as Record<string, unknown>;
  if (corps.action !== 'generer') {
    return NextResponse.json({ erreur: 'Action inconnue.' }, { status: 422 });
  }

  const total = bornePosition(corps.totalChapitres);
  if (total < 1) {
    return NextResponse.json(
      { erreur: 'Le livre n’a pas encore de chapitres : impossible de poser le programme.' },
      { status: 422 }
    );
  }
  const parEtape = Math.max(1, Math.min(12, Math.round(Number(corps.parEtape) || 4)));
  const programme = genererEtapes(total, parEtape);

  // Remplacement complet : refaire le programme est un droit du
  // staff ; les étapes repartent du début, la première ouverte.
  const { error: effacement } = await c.client
    .from('clubs_etapes')
    .delete()
    .eq('club_id', c.clubId);
  if (effacement) {
    return NextResponse.json(
      { erreur: 'Pose du programme refusée.' },
      { status: 500 }
    );
  }

  const lignes = programme.map((e) => ({
    club_id: c.clubId,
    numero: e.numero,
    chapitre_de: e.chapitreDe,
    chapitre_a: e.chapitreA,
    focus: propreTexte(e.focus, 160) ?? '',
    debloque_le: e.numero === 1 ? new Date().toISOString() : null,
    cree_par: c.utilisateurId,
  }));
  const { error: insertion } = await c.client
    .from('clubs_etapes')
    .insert(lignes);
  if (insertion) {
    return NextResponse.json(
      { erreur: 'Pose du programme refusée.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, etapes: programme.length });
}

export async function PATCH(
  requete: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const c = await contexteClub(id);
  if (!c.ok) return c.reponse;
  if (!c.estStaff) return reponseStaff();

  const corps = (await requete.json().catch(() => ({}))) as Record<string, unknown>;
  const numero = Math.round(Number(corps.numero));
  if (!Number.isFinite(numero) || numero < 1 || numero > MAX_ETAPES) {
    return NextResponse.json({ erreur: 'Étape invalide.' }, { status: 422 });
  }

  const { data: lignes } = await c.client
    .from('clubs_etapes')
    .select('numero, debloque_le')
    .eq('club_id', c.clubId)
    .order('numero', { ascending: true })
    .limit(MAX_ETAPES);
  const etapes = (lignes ?? []) as Array<{ numero: number; debloque_le: string | null }>;
  const cible = etapes.find((e) => e.numero === numero);
  if (!cible) {
    return NextResponse.json({ erreur: 'Étape inconnue.' }, { status: 404 });
  }
  if (cible.debloque_le) {
    return NextResponse.json({ erreur: 'Étape déjà ouverte.' }, { status: 409 });
  }
  // Contrôle séquentiel : toute étape précédente doit être ouverte.
  const precedenteFerme = etapes.some(
    (e) => e.numero < numero && !e.debloque_le
  );
  if (precedenteFerme) {
    return NextResponse.json(
      { erreur: 'Ouvrez d’abord les étapes précédentes.' },
      { status: 409 }
    );
  }

  const { error } = await c.client
    .from('clubs_etapes')
    .update({ debloque_le: new Date().toISOString() })
    .eq('club_id', c.clubId)
    .eq('numero', numero);
  if (error) {
    return NextResponse.json({ erreur: 'Ouverture refusée.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

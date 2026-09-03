// ============================================================
// app/api/translate/route.ts — Traduction d'un segment.
// Côté serveur uniquement : c'est ici que le fournisseur actif
// est choisi (TRANSLATOR_DEFAULT) et que les clés/URL internes
// restent cachées du navigateur.
// ============================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { fournisseurActif } from '@/lib/providers';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // --- Authentification : on refuse les appels anonymes. ---
  // Session depuis les cookies (navigateur) OU jeton Bearer (clients API).
  const porteur = request.headers.get('authorization');
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {
          /* lecture seule : pas de session à créer ici */
        },
      },
    }
  );
  const {
    data: { user },
  } = porteur?.startsWith('Bearer ')
    ? await supabase.auth.getUser(porteur.slice('Bearer '.length))
    : await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }

  // --- Corps de la requête. ---
  let corps: { texte?: string; source?: string; cible?: string };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  const texte = (corps.texte ?? '').trim();
  const source = corps.source;
  const cible = corps.cible;

  if (!texte || typeof source !== 'string' || typeof cible !== 'string') {
    return NextResponse.json(
      { erreur: 'Paramètres manquants (texte, source, cible).' },
      { status: 400 }
    );
  }

  // --- Traduction via le fournisseur actif. ---
  try {
    const fournisseur = fournisseurActif();
    if (texte.length > fournisseur.maxCharsParRequete) {
      return NextResponse.json(
        { erreur: `Texte trop long (max ${fournisseur.maxCharsParRequete} caractères).` },
        { status: 413 }
      );
    }
    const traduit = await fournisseur.traduire(texte, { source, cible });
    return NextResponse.json({
      traduit,
      fournisseur: fournisseur.id,
    });
  } catch (erreur) {
    const message =
      erreur instanceof Error ? erreur.message : 'Erreur de traduction inconnue.';
    return NextResponse.json({ erreur: message }, { status: 502 });
  }
}

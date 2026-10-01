// ============================================================
// app/api/translate/route.ts — Traduction d'un segment.
// Côté serveur uniquement : c'est ici que le fournisseur actif
// est choisi (TRANSLATOR_DEFAULT) et que les clés/URL internes
// restent cachées du navigateur.
// ============================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { fournisseurActif, traduireAvec } from '@/lib/providers';
import type { OptionsTraduction } from '@/lib/providers';
import { construireDirectives } from '@/lib/glossaire';
import type { PaireGlossaire } from '@/lib/types';

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
  let corps: {
    texte?: string;
    source?: string;
    cible?: string;
    /** P1.1 : bloc de directives (glossaire + contexte glissant). */
    directives?: string;
    /** P1.1 : rappel de contexte glissant (segment précédents). */
    contexte?: string;
    /** P1.1 : paires source → traduction à imposer. */
    glossaire?: Array<{ source?: string; traduction?: string }>;
  };
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
  // Les segments d'import font au plus 6 000 caractères ; chaque
  // fournisseur découpe lui-même en fragments selon sa propre limite.
  const MAX_TEXTE = 6000;
  // P1.1 — garde-fous de budget côté serveur (en plus de ceux du client) :
  // jamais plus de 300 paires ni 4 000 caractères de directives.
  const MAX_DIRECTIVES = 4000;
  const MAX_PAIRES_GLOSSAIRE = 300;
  const MAX_CONTEXTE = 4000;
  try {
    const fournisseur = fournisseurActif();
    if (texte.length > MAX_TEXTE) {
      return NextResponse.json(
        { erreur: `Texte trop long (max ${MAX_TEXTE} caractères).` },
        { status: 413 }
      );
    }

    // Injection additive : les options existantes (source, cible) ne
    // changent pas ; on n'ajoute que les champs P1.1 réellement fournis.
    const options: OptionsTraduction = { source, cible };
    if (Array.isArray(corps.glossaire)) {
      const paires: PaireGlossaire[] = corps.glossaire
        .filter(
          (p): p is { source: string; traduction: string } =>
            typeof p?.source === 'string' &&
            typeof p?.traduction === 'string' &&
            p.source.trim() !== '' &&
            p.traduction.trim() !== ''
        )
        .slice(0, MAX_PAIRES_GLOSSAIRE)
        .map((p) => ({ source: p.source.trim(), traduction: p.traduction.trim() }));
      if (paires.length > 0) options.glossaire = paires;
    }
    const contexte =
      typeof corps.contexte === 'string' ? corps.contexte.slice(0, MAX_CONTEXTE) : '';
    const directivesExplicites =
      typeof corps.directives === 'string' ? corps.directives.slice(0, MAX_DIRECTIVES) : '';
    // Le serveur ASSEMBLE lui-même glossaire + contexte sous un budget
    // STRICT de caractères : le nombre de tokens envoyés au moteur est
    // donc borné quoi que fasse le client.
    const bloc = construireDirectives({
      entrees: options.glossaire ?? [],
      contexte,
    }).directives;
    const directives = [directivesExplicites, bloc]
      .filter((b) => b.trim() !== '')
      .join('\n\n')
      .slice(0, MAX_DIRECTIVES);
    if (directives) options.directives = directives;

    // traduireAvec applique le glossaire imposé après la traduction
    // (les moteurs sans prompt ne lisent pas de directives).
    const traduit = await traduireAvec(fournisseur, texte, options);
    // Un moteur peut renvoyer une chaîne vide / blanche : c'est un échec,
    // pas une traduction. On le signale (502) pour que le client réessaie
    // au lieu d'écrire un segment `fait` vide qui trouerait le chapitre.
    if (typeof traduit !== 'string' || traduit.trim() === '') {
      return NextResponse.json(
        { erreur: 'Le moteur a renvoyé une traduction vide.' },
        { status: 502 }
      );
    }
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

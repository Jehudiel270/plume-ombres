// ============================================================
// app/api/translate/route.ts — Traduction d'un segment.
// Côté serveur uniquement : c'est ici que le fournisseur actif
// est choisi (TRANSLATOR_DEFAULT) et que les clés/URL internes
// restent cachées du navigateur.
//
// Deux garde-fous ajoutés (Vague 2) :
//  * P0.3 — limitation de débit (fenêtre glissante) par COMPTE
//    authentifié, sinon par IP ; réponse 429 + en-têtes standard.
//  * P0.2 — quota mensuel de caractères par compte ; refus avec
//    code dédié QUOTA_DEPASSE (HTTP 402) et libération du quota si
//    la traduction échoue.
// ============================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { fournisseurActif } from '@/lib/providers';
import {
  MagasinRateLimitSupabase,
  limiterRequete,
  entetesRateLimit,
  extraireIp,
  optionsRateLimit,
  CODE_RATE_LIMIT_DEPASSE,
  type ClientRpc,
  type EtatRateLimit,
} from '@/lib/rate-limit';
import {
  MagasinQuotaSupabase,
  reserverQuota,
  libererQuota,
  CODE_QUOTA_DEPASSE,
  type UsageQuota,
} from '@/lib/quota';

export const runtime = 'nodejs';

const MAX_TEXTE = 6000;

export async function POST(request: NextRequest) {
  const ip = extraireIp(request);

  // --- Authentification : session par cookies OU jeton Bearer. ---
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

  // Le client Supabase expose .rpc(nom, args) : on l'adapte à l'interface
  // minimale des magasins (rate-limit / quota).
  const clientRpc: ClientRpc = {
    rpc: (nom, args) => supabase.rpc(nom, args),
  };

  // --- P0.3 : limitation de débit. ---
  // Clé = compte si authentifié, sinon IP. Appliquée AVANT le refus 401
  // pour freiner aussi les appels anonymes.
  let etatDebit: EtatRateLimit | null = null;
  try {
    etatDebit = await limiterRequete(
      new MagasinRateLimitSupabase(clientRpc),
      { userId: user?.id ?? null, ip },
      optionsRateLimit()
    );
  } catch (erreur) {
    // Panne du magasin de débit : on laisse passer (disponibilité) mais
    // on signale l'incident. L'authentification reste la barrière d'accès.
    console.warn(
      '[rate-limit] magasin indisponible, requête laissée passer :',
      erreur instanceof Error ? erreur.message : erreur
    );
  }
  const entetesDebit = etatDebit ? entetesRateLimit(etatDebit) : {};
  if (etatDebit && !etatDebit.autorise) {
    return NextResponse.json(
      {
        erreur: 'Trop de requêtes : réessayez plus tard.',
        code: CODE_RATE_LIMIT_DEPASSE,
        limite: etatDebit.limite,
        reset: etatDebit.reset,
      },
      { status: 429, headers: entetesDebit }
    );
  }

  if (!user) {
    return NextResponse.json(
      { erreur: 'Non autorisé.' },
      { status: 401, headers: entetesDebit }
    );
  }

  // --- Corps de la requête. ---
  let corps: { texte?: string; source?: string; cible?: string };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json(
      { erreur: 'JSON invalide.' },
      { status: 400, headers: entetesDebit }
    );
  }

  const texte = (corps.texte ?? '').trim();
  const source = corps.source;
  const cible = corps.cible;

  if (!texte || typeof source !== 'string' || typeof cible !== 'string') {
    return NextResponse.json(
      { erreur: 'Paramètres manquants (texte, source, cible).' },
      { status: 400, headers: entetesDebit }
    );
  }

  // Les segments d'import font au plus 6 000 caractères ; chaque
  // fournisseur découpe lui-même en fragments selon sa propre limite.
  if (texte.length > MAX_TEXTE) {
    return NextResponse.json(
      { erreur: `Texte trop long (max ${MAX_TEXTE} caractères).` },
      { status: 413, headers: entetesDebit }
    );
  }

  // --- P0.2 : quota mensuel (compté sur les caractères soumis). ---
  const magasinQuota = new MagasinQuotaSupabase(clientRpc);
  let reservation;
  try {
    reservation = await reserverQuota(magasinQuota, user.id, texte.length);
  } catch (erreur) {
    // Intégrité de l'usage : en cas de panne du magasin, on refuse
    // (503) plutôt que d'offrir une traduction non comptée.
    console.warn(
      '[quota] magasin indisponible, requête refusée :',
      erreur instanceof Error ? erreur.message : erreur
    );
    return NextResponse.json(
      {
        erreur: 'Quota momentanément indisponible. Réessayez dans un instant.',
        code: 'QUOTA_INDISPONIBLE',
      },
      { status: 503, headers: entetesDebit }
    );
  }

  const entetesQuota = (usage: UsageQuota): Record<string, string> => ({
    'X-Quota-Utilise': String(usage.utilise),
    'X-Quota-Limite': String(usage.limite),
  });

  if (!reservation.autorise) {
    return NextResponse.json(
      {
        erreur: reservation.message,
        code: CODE_QUOTA_DEPASSE,
        quota: {
          utilise: reservation.utilise,
          limite: reservation.limite,
          periode: reservation.periode,
        },
      },
      {
        status: 402,
        headers: { ...entetesDebit, ...entetesQuota(reservation) },
      }
    );
  }

  // --- Traduction via le fournisseur actif. ---
  try {
    const fournisseur = fournisseurActif();
    const traduit = await fournisseur.traduire(texte, { source, cible });
    // Un moteur peut renvoyer une chaîne vide / blanche : c'est un échec,
    // pas une traduction. On libère le quota réservé et on signale (502)
    // pour que le client réessaie.
    if (typeof traduit !== 'string' || traduit.trim() === '') {
      await libererQuota(magasinQuota, user.id, texte.length).catch(() => undefined);
      return NextResponse.json(
        { erreur: 'Le moteur a renvoyé une traduction vide.' },
        { status: 502, headers: entetesDebit }
      );
    }
    return NextResponse.json(
      {
        traduit,
        fournisseur: fournisseur.id,
        quota: {
          utilise: reservation.utilise,
          limite: reservation.limite,
          periode: reservation.periode,
        },
      },
      {
        headers: { ...entetesDebit, ...entetesQuota(reservation) },
      }
    );
  } catch (erreur) {
    // Échec de traduction : le quota réservé est rendu au compte.
    await libererQuota(magasinQuota, user.id, texte.length).catch(() => undefined);
    const message =
      erreur instanceof Error ? erreur.message : 'Erreur de traduction inconnue.';
    return NextResponse.json(
      { erreur: message },
      { status: 502, headers: entetesDebit }
    );
  }
}

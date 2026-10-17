// ============================================================
// app/api/translate/lot/route.ts — Traduction d'un LOT de segments.
//
// Une requête = un lot (≤ 40 segments, ≤ 20 000 caractères).
// Une authentification, un comptage de débit, une réservation de
// quota pour la somme des caractères — puis 8 traductions en
// parallèle côté serveur (voir lib/traduction/lot.ts).
//
// La route ne renvoie JAMAIS 500 pour un segment en échec : il sort
// dans `echecs` avec une réponse 200 (`statut` = ok | partiel |
// indisponible). `/api/translate` (mono-segment) reste intacte.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  analyserLot,
  ouvrirSession,
  statutLot,
  traiterLotSegments,
  MAX_SEGMENTS_LOT,
  MAX_CARACTERES_LOT,
  MAX_CARACTERES_SEGMENT,
} from '@/lib/traduction/lot';
import {
  MagasinQuotaSupabase,
  reserverQuota,
  libererQuota,
  lireUsageQuota,
  CODE_QUOTA_DEPASSE,
  type UsageQuota,
} from '@/lib/quota';

export const runtime = 'nodejs';

function entetesQuota(usage: UsageQuota): Record<string, string> {
  return {
    'X-Quota-Utilise': String(usage.utilise),
    'X-Quota-Limite': String(usage.limite),
  };
}

export async function POST(request: NextRequest) {
  // --- Session : UNE authentification, UN comptage de débit. ---
  const session = await ouvrirSession(request);
  const entetesDebit = session.entetesDebit;

  if (session.debit && !session.debit.autorise) {
    return NextResponse.json(
      {
        erreur: 'Trop de requêtes : réessayez plus tard.',
        code: 'RATE_LIMIT_DEPASSE',
        limite: session.debit.limite,
        reset: session.debit.reset,
      },
      { status: 429, headers: entetesDebit }
    );
  }

  if (!session.userId) {
    return NextResponse.json(
      { erreur: 'Non autorisé.' },
      { status: 401, headers: entetesDebit }
    );
  }

  // --- Corps et seuils du contrat. ---
  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json(
      { erreur: 'JSON invalide.' },
      { status: 400, headers: entetesDebit }
    );
  }

  const analyse = analyserLot(corps);
  if (!analyse.ok) {
    return NextResponse.json(
      {
        erreur: analyse.erreur,
        seuils: {
          segments: MAX_SEGMENTS_LOT,
          caracteresLot: MAX_CARACTERES_LOT,
          caracteresSegment: MAX_CARACTERES_SEGMENT,
        },
      },
      { status: analyse.statut, headers: entetesDebit }
    );
  }

  // --- Quota : UNE réservation pour la somme des caractères tentés. ---
  const magasin = new MagasinQuotaSupabase(session.clientRpc);
  let usage: UsageQuota;
  let reserve = false;
  try {
    if (analyse.caracteresRetenus === 0) {
      // Aucun segment ne sera tenté (tous vides ou trop longs) :
      // inutile de réserver, une lecture suffit.
      usage = await lireUsageQuota(magasin, session.userId);
    } else {
      const reservation = await reserverQuota(
        magasin,
        session.userId,
        analyse.caracteresRetenus
      );
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
      usage = reservation;
      reserve = true;
    }
  } catch (erreur) {
    console.warn(
      '[quota] magasin indisponible, lot refusé :',
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

  // --- Traduction : 8 segments en parallèle, échecs isolés. ---
  let liberes = 0;
  let resultat: Awaited<ReturnType<typeof traiterLotSegments>>;
  try {
    resultat = await traiterLotSegments(analyse.segments, {
      source: analyse.source,
      cible: analyse.cible,
      glossaire: analyse.glossaire,
      concurrence: 8,
      libererCaracteres: reserve
        ? async (caracteres) => {
            await libererQuota(magasin, session.userId!, caracteres);
            liberes += caracteres;
          }
        : undefined,
    });
  } catch (erreur) {
    // Panne inattendue du lot : on rend TOUT le quota réservé plutôt que
    // de laisser une réservation fantôme, et on répond de façon lisible
    // (le client retentera ; rien n'est écrit côté segments).
    if (reserve) {
      await libererQuota(
        magasin,
        session.userId!,
        analyse.caracteresRetenus - liberes
      ).catch(() => undefined);
    }
    console.warn(
      '[translate/lot] lot interrompu :',
      erreur instanceof Error ? erreur.message : erreur
    );
    return NextResponse.json(
      {
        erreur: 'Traduction momentanément indisponible. Réessayez dans un instant.',
        code: 'LOT_INDISPONIBLE',
      },
      { status: 503, headers: entetesDebit }
    );
  }

  // L'usage affiché tient compte des libérations faites pendant le lot
  // (une seule RPC de libération, cf. lib/traduction/lot.ts).
  const quota: UsageQuota = {
    ...usage,
    utilise: Math.max(usage.utilise - liberes, 0),
  };

  return NextResponse.json(
    {
      statut: statutLot(resultat),
      resultats: resultat.resultats,
      echecs: resultat.echecs,
      quota,
    },
    { status: 200, headers: { ...entetesDebit, ...entetesQuota(quota) } }
  );
}

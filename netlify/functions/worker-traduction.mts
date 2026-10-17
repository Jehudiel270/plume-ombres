// ============================================================
// netlify/functions/worker-traduction.mts — Battement de l'exécutant.
//
// Fonction PLANIFIÉE chaque minute (voir netlify.toml). Elle ne traduit
// rien elle-même : elle réveille POST /api/translate/travail, qui prend
// le travail actif le plus ancien et traite UN lot.
//
// Pourquoi une fonction séparée : la route vit dans l'application
// Next.js (accès aux modules métier, à la clé service role) ; cette
// fonction n'est qu'une horloge authentifiée.
//
// Variables d'environnement attendues sur Netlify :
//   CRON_SECRET                 — secret partagé avec la route
//   URL (fournie par Netlify)   — https://<site>.netlify.app
//   PLUME_BASE_URL              — facultatif, contourne URL si besoin
// ============================================================

/** Marge sous la limite d'exécution synchrone de la route (60 s). */
const DELAI_MAX_MS = 55_000;

/**
 * Planification Netlify : chaque minute. Déclarée ici (source de vérité
 * Netlify) ET dans netlify.toml ; les deux pointent sur la même valeur.
 */
export const config = { schedule: '*/1 * * * *' };

function baseSite(): string {
  const brut =
    process.env.PLUME_BASE_URL?.trim() ||
    process.env.URL?.trim() ||
    process.env.DEPLOY_PRIME_URL?.trim() ||
    '';
  return brut.replace(/\/+$/, '');
}

export default async function worker(): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  const base = baseSite();

  if (!secret) {
    console.error('[worker-traduction] CRON_SECRET absente : passage ignoré.');
    return new Response(
      JSON.stringify({ statut: 'erreur', erreur: 'CRON_SECRET absente.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (!base) {
    console.error('[worker-traduction] URL du site introuvable : passage ignoré.');
    return new Response(
      JSON.stringify({ statut: 'erreur', erreur: 'URL du site introuvable.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const reponse = await fetch(`${base}/api/translate/travail`, {
      method: 'POST',
      headers: { 'x-plume-travail': secret },
      cache: 'no-store',
      signal: AbortSignal.timeout(DELAI_MAX_MS),
    });
    const corps = await reponse.text();

    // La sortie est journalisée telle quelle : c'est la preuve
    // d'exécution dans les journaux Netlify.
    console.log(`[worker-traduction] ${reponse.status} ${corps.slice(0, 500)}`);

    return new Response(corps, {
      status: reponse.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : 'Erreur inconnue.';
    console.error('[worker-traduction] appel impossible :', message);
    return new Response(
      JSON.stringify({ statut: 'erreur', erreur: message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

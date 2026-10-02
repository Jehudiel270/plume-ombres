// ============================================================
// scripts/verifier-sante-prod.mts — Sonde de disponibilité (W10 / A11).
//
// N'affiche QU'UN ÉTAT STABLE : « ok » ou « degrade ». Aucun
// horodatage, aucune latence → la sortie est DÉTERMINISTE, ce qui
// permet de l'utiliser comme DÉTECTEUR DE CHANGEMENT par un cron :
// le veilleur ne réveille l'agent que lorsque l'état bascule.
//
// Aucun nom de fournisseur n'est lu ni affiché : la route publique
// /api/statut ne les expose pas.
//
// Usage : npx tsx scripts/verifier-sante-prod.mts
// Variable : PLUME_BASE_URL (défaut https://plume-ombres.vercel.app)
// ============================================================

const BASE = process.env.PLUME_BASE_URL?.trim() || 'https://plume-ombres.vercel.app';

try {
  const reponse = await fetch(`${BASE}/api/statut`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const corps = (await reponse.json().catch(() => null)) as { statut?: string } | null;
  console.log(corps?.statut === 'ok' && reponse.ok ? 'ok' : 'degrade');
} catch {
  // Service injoignable = dégradé (c'est la vérité, pas un faux positif).
  console.log('degrade');
}

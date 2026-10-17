// ============================================================
// scripts/traiter-travaux.mts — Déclenchement MANUEL de l'exécutant.
//
// Prouve, hors cron Netlify, qu'un travail de traduction avance côté
// serveur : chaque appel traite UN lot du travail actif le plus ancien
// et affiche les compteurs réels renvoyés par la route.
//
// Usage :
//   npx tsx scripts/traiter-travaux.mts              # un passage
//   npx tsx scripts/traiter-travaux.mts --passes 5   # cinq passages
//   npx tsx scripts/traiter-travaux.mts --passes 50 --pause 2000
//
// Variables d'environnement :
//   PLUME_BASE_URL     — base du site (défaut https://plume-ombres.netlify.app)
//   CRON_SECRET        — secret attendu par l'en-tête x-plume-travail
//   PLUME_TRAVAIL_SECRET — prioritaire sur CRON_SECRET si défini
//
// Sortie : une ligne JSON par passage (statut, total, traites, erreurs).
// ============================================================

const BASE = (process.env.PLUME_BASE_URL?.trim() || 'https://plume-ombres.netlify.app')
  .replace(/\/+$/, '');
const SECRET = (
  process.env.PLUME_TRAVAIL_SECRET?.trim() ||
  process.env.CRON_SECRET?.trim() ||
  ''
).trim();

function entier(valeur: string | undefined, defaut: number): number {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaut;
}

const args = process.argv.slice(2);
function argument(nom: string): string | undefined {
  const index = args.indexOf(nom);
  return index >= 0 ? args[index + 1] : undefined;
}

const passes = entier(argument('--passes'), 1);
const pause = entier(argument('--pause'), 1000);
const delai = (ms: number) => new Promise((resoudre) => setTimeout(resoudre, ms));

async function passage(): Promise<{ statut: string; traites?: number; total?: number; erreurs?: number }> {
  const reponse = await fetch(`${BASE}/api/translate/travail`, {
    method: 'POST',
    headers: { 'x-plume-travail': SECRET },
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000),
  });

  const texte = await reponse.text();
  let corps: Record<string, unknown> = {};
  try {
    corps = JSON.parse(texte) as Record<string, unknown>;
  } catch {
    corps = { statut: 'illisible', corps: texte.slice(0, 200) };
  }

  console.log(
    JSON.stringify({
      http: reponse.status,
      statut: corps.statut ?? 'inconnu',
      id: corps.id ?? null,
      livre_id: corps.livre_id ?? null,
      total: corps.total ?? null,
      traites: corps.traites ?? null,
      erreurs: corps.erreurs ?? null,
      ...(corps.lots ? { lots: corps.lots } : {}),
      ...(corps.erreur ? { erreur: corps.erreur } : {}),
    })
  );

  return {
    statut: String(corps.statut ?? 'inconnu'),
    traites: typeof corps.traites === 'number' ? corps.traites : undefined,
    total: typeof corps.total === 'number' ? corps.total : undefined,
    erreurs: typeof corps.erreurs === 'number' ? corps.erreurs : undefined,
  };
}

async function principal(): Promise<void> {
  if (!SECRET) {
    console.error('CRON_SECRET (ou PLUME_TRAVAIL_SECRET) manquante : appel refusé.');
    process.exit(1);
  }

  console.log(`# ${BASE} — ${passes} passage(s)`);
  for (let i = 1; i <= passes; i += 1) {
    try {
      const resultat = await passage();
      // Fin de file ou travail clos : inutile de continuer à marteler.
      if (resultat.statut === 'inactif') {
        console.log('# file vide');
        return;
      }
      if (resultat.statut === 'termine' || resultat.statut === 'erreur') {
        return;
      }
    } catch (erreur) {
      console.error(
        `# passage ${i} impossible :`,
        erreur instanceof Error ? erreur.message : erreur
      );
      process.exitCode = 1;
      return;
    }
    if (i < passes) await delai(pause);
  }
}

await principal();

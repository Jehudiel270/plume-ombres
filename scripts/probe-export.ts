// ============================================================
// probe-export.ts — Pilote navigateur réel (Edge + puppeteer-core)
// pour tester les boutons d'EXPORT de l'espace livre.
//
// Usage :
//   npx tsx scripts/probe-export.ts
//   (« npx next dev -p 3100 » déjà lancé séparément)
//
// Lit %TEMP%\shader-demo.json ({ session, livreId }) créé par
// scripts/probe-session.ts, installe le cookie de session et
// clique CHAQUE bouton d'export d'EspaceLivre (sauf « PDF fidèle »)
// en capturant :
//   - les messages d'erreur de la page (setMessageLangue),
//   - les téléchargements réels (fichiers créés à l'endroit
//     indiqué par CDP Browser.setDownloadBehavior).
//
// Le cookie est auto-diagnostiqué : on essaie le format « prod »
// (@supabase/ssr : base64url du Session auth-js) puis le JSON brut,
// et on retient le premier qui passe la garde de /connexion.
// ============================================================
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer, { type Page } from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const HOST = 'http://localhost:3100';

// --- 1. Session démo -------------------------------------------------------
const demo: { session: { user: unknown; session: Record<string, unknown> }; livreId: string; titre: string } =
  JSON.parse(readFileSync(join(tmpdir(), 'shader-demo.json'), 'utf8'));

// Session auth-js (celle qui contient access_token en tête).
const inner = demo.session.session;
const innerJson = JSON.stringify(inner);

function base64url(entrée: string): string {
  return Buffer.from(entrée, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Formats de cookie à essayer, du plus probable (prod) au plus simple.
const CANDIDATS: Array<{ libelle: string; valeur: string }> = [
  { libelle: 'ssr-base64url(inner)', valeur: 'base64-' + base64url(innerJson) },
  { libelle: 'json-brut(inner)', valeur: innerJson },
];

// --- 2. Destination de téléchargement dédiée + profil temporaire -----------
const dest = join(
  tmpdir(),
  'po-export-test-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
);
mkdirSync(dest, { recursive: true });

// --- 3. Lancement d'Edge headless ------------------------------------------
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  // @ts-expect-error — option obsolète selon version puppeteer ; comportement de téléchargement toléré.
  downloadDefaultBehavior: 'allow',
  args: [
    `--user-data-dir=${join(tmpdir(), 'po-edge-profile-' + Date.now())}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    // Impression silencieuse en headless : « Enregistrer en PDF » déclenche
    // un téléchargement (au lieu d'une boîte de dialogue bloquante).
    '--print-to-pdf-no-header',
  ],
});

const page: Page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });

// Journal des erreurs console + page.
const erreursConsole: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') erreursConsole.push('console: ' + m.text());
});
page.on('pageerror', (e: unknown) => erreursConsole.push('pageerror: ' + String(e)));

// Réponses HTTP non 2xx (charges ESM de /src/…).
const reponsesKo: Array<{ url: string; status: number }> = [];
page.on('response', (r) => {
  if (r.status() >= 400) reponsesKo.push({ url: r.url(), status: r.status() });
});

// Autorise les téléchargements vers `dest`.
// `Browser.setDownloadBehavior` est une commande NIVEAU NAVIGATEUR :
// elle s'envoie sur la cible « browser » (premier target), pas sur une page.
const cibleNavigateur = browser.target();
const sessionBrowser = await cibleNavigateur.createCDPSession();
await sessionBrowser.send('Browser.setDownloadBehavior', {
  behavior: 'allow',
  eventsEnabled: true,
  downloadPath: dest,
});

// --- 4. Navigation + autodiagnostic du cookie --------------------------------
const url = HOST + '/livres/' + demo.livreId;
let cookieChoisi: string | null = null;
let pourquoi: string[] = [];

for (const cand of CANDIDATS) {
  await page.setCookie({
    name: 'sb-imbziizequckeaxuotdz-auth-token',
    value: cand.valeur,
    domain: 'localhost',
    path: '/',
  });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2500));

  const ici = page.url();
  if (!ici.includes('/connexion')) {
    cookieChoisi = cand.libelle;
    console.log(`✓ cookie accepté : ${cand.libelle}`);
    break;
  }
  pourquoi.push(`cookie « ${cand.libelle} » → redirigé /connexion`);
}
if (!cookieChoisi) {
  console.error('❌ SESSION PERDUE (aucun format de cookie validé) :');
  for (const p of pourquoi) console.error('   - ' + p);
  console.error('reponsesKo :', JSON.stringify(reponsesKo, null, 2));
  console.error('erreursConsole :', erreursConsole.slice(0, 10));
  await browser.close();
  process.exit(2);
}
console.log('✓ page livre rendue — cookie =', cookieChoisi);

// --- 5. Outils d'observation -------------------------------------------------
function fichiersDans(destin: string): Array<{ nom: string; octets: number }> {
  return readdirSync(
    destin,
    { withFileTypes: true },
  )
    .filter((e) => {
      const p = join(destin, e.name);
      if (!e.isFile()) return false;
      if (e.name.endsWith('.crdownload') || e.name.endsWith('.tmp')) return false;
      return existsSync(p) && statSync(p).size > 0;
    })
    .map((e) => ({ nom: e.name, octets: statSync(join(destin, e.name)).size }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

async function messageErreur(): Promise<string | null> {
  return (
    await page
      .evaluate(() => {
        const p = document.querySelector('p.text-grenat-300');
        return p ? p.textContent : null;
      })
      .catch(() => null)
  );
}

// --- 6. Scénario : cliquer chaque bouton -------------------------------------
// (sauf « PDF fidèle », validé séparément)
const scenarios: Array<{
  nom: string;
  titre: string; // attribut title du <button>
  attente: number; // ms supplémentaires après le clic (génération longue)
}> = [
  { nom: 'chapitre', titre: 'Exporter le chapitre courant (.md)', attente: 1500 },
  { nom: 'livre-md', titre: 'Exporter le livre entier (.md)', attente: 1500 },
  { nom: 'docx', titre: 'Télécharger le livre mis en forme (Word)', attente: 3000 },
  { nom: 'imprimer', titre: 'Mise en page puis « Enregistrer en PDF »', attente: 4000 },
  { nom: 'pdf-traduit', titre: 'Télécharger le livre TRADUIT, re-paginé, même gabarit que l\u2019original', attente: 20000 },
  { nom: 'original', titre: 'Télécharger le fichier original, inchangé', attente: 2000 },
];

const resultat: Record<
  string,
  { messagePage: string | null; nouveaux: Array<{ nom: string; octets: number }> }
> = {};

for (const sc of scenarios) {
  // Efface un message d'erreur éventuel avant chaque clic (propreté).
  await page
    .evaluate(() =>
      document.querySelectorAll('p.text-grenat-300').forEach((el) => el.remove()),
    )
    .catch(() => undefined);

  const btn = await page.$(`button[title="${sc.titre}"]`);
  if (!btn) {
    resultat[sc.nom] = { messagePage: 'BOUTON ABSENT', nouveaux: [] };
    console.log(`✗ ${sc.nom} : bouton introuvable`);
    continue;
  }
  const avant = new Set(fichiersDans(dest).map((f) => f.nom));
  await btn.click().catch((e) => console.log('clic ko (« ' + sc.nom + ' ») :', e.message));
  await new Promise((r) => setTimeout(r, sc.attente));

  const apres = fichiersDans(dest).filter((f) => !avant.has(f.nom));
  const msg = await messageErreur();
  resultat[sc.nom] = { messagePage: msg, nouveaux: apres };
  console.log(
    `→ ${sc.nom} : fichier=`,
    apres.length > 0
      ? apres.map((f) => `${f.nom} (${f.octets} o)`).join(' | ')
      : 'AUCUN',
    msg ? '  | MSG=' + msg : '',
  );
}

// --- 7. Bilan ------------------------------------------------------------------
console.log('\n===== FICHIERS TÉLÉCHARGÉS =====');
const finaux = fichiersDans(dest);
for (const f of finaux) console.log(`  ${f.nom}  —  ${f.octets} octets`);
if (finaux.length === 0) console.log('  (aucun fichier téléchargé)');

console.log('\n===== MESSAGES D\u2019ERREUR =====');
let aErreur = false;
for (const [k, v] of Object.entries(resultat)) {
  if (v.messagePage) {
    console.log(`  [${k}] ${v.messagePage}`);
    aErreur = true;
  }
}
if (!aErreur) console.log('  (aucun message d\u2019erreur)');

console.log('\n===== RÉPONSES HTTP >= 400 =====');
if (reponsesKo.length > 0)
  for (const r of reponsesKo) console.log(`  ${r.status} ${r.url}`);
else console.log('  (aucune)');

console.log('\n===== ERREURS CONSOLE/PAGE (relevé au départ) =====');
if (erreursConsole.length > 0)
  for (const e of erreursConsole.slice(0, 25)) console.log('  ' + e);
else console.log('  (aucune)');

console.log('\n===== DÉTAIL PAR BOUTON =====');
console.log(JSON.stringify(resultat, null, 2));

// Trace brute (pour dépannage) : cookie retenu + erreurs.
writeFileSync(
  join(dest, '_trace-probe.json'),
  JSON.stringify(
    {
      cookieChoisi,
      erreursConsole: erreursConsole.slice(0, 50),
      reponsesKo: reponsesKo.slice(0, 50),
    },
    null,
    2,
  ),
  'utf8',
);

await browser.close();
process.exit(0);
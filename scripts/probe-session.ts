// Session de démonstration pour le test visuel du fond d'ambiance.
// Usage : npx tsx scripts/probe-session.ts
// Sortie : %TEMP%\shader-demo.json  →  { session, livreId }
// Jetable et idempotent : même email à chaque run, livre unique par propriétaire.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
// @ts-ignore — pg (dépendance dev transitif de test-e2e), typage non requis ici
import { Client as ClientPg } from 'pg';

const LignesEnv = readFileSync('.env.local', 'utf8').split('\n');
const URL_Supabase = 'https://imbziizequckeaxuotdz.supabase.co';
const ANON = LignesEnv.find((l) =>
  l.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
)!
  .split('=')
  .slice(1)
  .join('=')
  .trim();
const MDP_DB = LignesEnv.find((l) =>
  l.startsWith('SUPABASE_DB_PASSWORD'),
)!.split('=')[1].trim();

const EMAIL = 'fond-shader@plume-ombres.local';
const MDP = 'PlumeShader.2026!';
const TITRE_LIVRE = 'Nuit d’Autremonde';
const FICHIER_DEMO = join(tmpdir(), 'shader-demo.json');

function ouvrirPg() {
  return new ClientPg({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: MDP_DB,
    database: 'postgres',
  });
}

// Les tokens vivent dans r.data.session (supabase-js 2.x), pas au niveau r.data.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sessionDe = (r: any) => r?.data?.session?.access_token;

async function principal() {
  const supabase = createClient(URL_Supabase, ANON);

  // 1. Connexion (compte jetable déjà créant au premier run).
  const res = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: MDP,
  });
  const data = res.data;
  if (!data?.user || !sessionDe(res)) {
    console.error(
      'Connexion impossible :',
      res.error?.message ?? 'session vide',
    );
    process.exit(1);
  }
  const userId: string = data.user.id;
  console.log('✓ session obtenue pour', userId.slice(0, 8));

  // 2. Livre de démo (idempotent : un seul exemplaire par propriétaire).
  const pg = ouvrirPg();
  await pg.connect();

  const existant = await pg.query(
    `select id from public.livres
     where proprietaire_id = $1 and titre = $2 limit 1`,
    [userId, TITRE_LIVRE],
  );
  let livreId: string;
  if (existant.rows.length > 0) {
    livreId = existant.rows[0].id;
    console.log('livre de démo déjà présent, réutilisation :', livreId);
  } else {
    const insere = await pg.query(
      `insert into public.livres
         (proprietaire_id, titre, auteur, langue_source, langue_cible,
          nom_fichier, statut)
       values ($1, $2, 'Auteur inconnu', 'en', 'fr',
               'nuit-d-autremonde-ch-1-2.txt', 'traduit')
       returning id`,
      [userId, TITRE_LIVRE],
    );
    livreId = insere.rows[0].id;
  }

  const src1 = `The fog rolled into the alley like a living thing, and Liora pressed her back against the cold stone. Somewhere above, the chandeliers of the manor burned low, amber and trembling.

  She had come for the letter. She had not come for what the letter promised.

  "Turn around," said the voice from the dark. "I know your face, little shadow."`;
  const fr1 = `Le brouillard se glissa dans la ruelle comme une créature vivante, et Liora plaqua son dos contre la pierre froide. Quelque part au-dessus, les lustres du manoir brûlaient bas, ambre et tremblants.

  Elle était venue pour la lettre. Elle n'était pas venue pour ce que la lettre promettait.

  « Tourne-toi », dit la voix qui venait des ténèbres. « Je connais ton visage, petite ombre. »`;
  const src2 = `He stepped into the light and the night held its breath. Pale as moonlight, cruel as winter, and smiling.

  "You always run," he said. "But this house keeps its guests."`;
  const fr2 = `Il s'avança dans la lumière, et la nuit retint son souffle. Pâle comme la clarté lunaire, cruel comme l'hiver, et souriant.

  « Tu cours toujours », dit-il. « Mais cette maison garde ses invités. »`;

  for (const [pos, titre, src, fr] of [
    [1, 'Chapitre 1 — La ruelle', src1, fr1],
    [2, 'Chapitre 2 — Ses invités', src2, fr2],
  ]) {
    await pg.query(
      `delete from public.chapitres where livre_id = $1 and position = $2`,
      [livreId, pos],
    );
    await pg.query(
      `insert into public.chapitres
         (livre_id, position, titre, texte_source, texte_traduit, statut)
       values ($1, $2, $3, $4, $5, 'traduit')`,
      [livreId, pos, titre, src, fr],
    );
  }
  await pg.end();
  console.log('✓ livre de démo prêt :', livreId);

  // 3. Sortie pour le pilote navigateur (le pilote n'a pas besoin des clés).
  writeFileSync(
    FICHIER_DEMO,
    JSON.stringify({ session: data, livreId, titre: TITRE_LIVRE }),
    'utf8',
  );
  console.log('Fichier démo :', FICHIER_DEMO);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
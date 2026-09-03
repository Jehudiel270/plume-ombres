// Applique un fichier SQL au projet Supabase hébergé (via le pooler).
// Usage : npx tsx scripts/appliquer-sql.ts <fichier.sql>
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

function lireEnvLocal(cle: string): string {
  const contenu = readFileSync('.env.local', 'utf8');
  const ligne = contenu.split('\n').find((l) => l.trim().startsWith(`${cle}=`));
  if (!ligne) throw new Error(`Clé ${cle} introuvable dans .env.local`);
  return ligne.split('=').slice(1).join('=').trim();
}

async function principal() {
  const fichier = process.argv[2];
  if (!fichier) throw new Error('Usage : npx tsx scripts/appliquer-sql.ts <fichier.sql>');

  const client = new Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: lireEnvLocal('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('Connecté ✓');
  await client.query('begin');
  try {
    await client.query(readFileSync(fichier, 'utf8'));
    await client.query('commit');
    console.log(`✓ SQL appliqué : ${fichier}`);
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
  await client.end();
}

principal().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});

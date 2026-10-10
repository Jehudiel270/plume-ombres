// Sonde de LECTURE de l'état réel du catalogue en base (plans_abonnement,
// packs_credits). Aucune écriture. Usage : node scripts/_probe-plans.mjs
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const contenu = readFileSync('.env.local', 'utf8');
const ligne = (c) =>
  contenu
    .split('\n')
    .find((l) => l.trim().startsWith(c + '='))
    .split('=')
    .slice(1)
    .join('=')
    .trim();

const pg = new Client({
  host: 'aws-1-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.imbziizequckeaxuotdz',
  password: ligne('SUPABASE_DB_PASSWORD'),
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await pg.connect();

const { rows: plans } = await pg.query(
  `SELECT code, nom, prix_xof, duree_jours, categorie, actif, masque, alias_de,
          ordre, prix_mensuel_xof, quota_mensuel_caracteres, livres_mois
   FROM public.plans_abonnement ORDER BY ordre, code`,
);
console.log(`PLANS_ABONNEMENT (${plans.length}):`);
for (const p of plans) {
  console.log(
    ` - ordre=${String(p.ordre).padStart(2)} ${String(p.code).padEnd(18)} ${String(p.prix_xof).padStart(7)} F  duree=${String(p.duree_jours).padStart(3)}j  cat=${String(p.categorie).padEnd(10)} actif=${p.actif} masque=${p.masque} alias=${p.alias_de ?? '-'} prixMensuel=${p.prix_mensuel_xof ?? '-'}`,
  );
}

const { rows: packs } = await pg.query(
  `SELECT code, nom, prix_xof, caracteres, ordre, actif FROM public.packs_credits ORDER BY ordre, code`,
);
console.log(`\nPACKS_CREDITS (${packs.length}):`);
for (const p of packs) {
  console.log(
    ` - ordre=${String(p.ordre).padStart(2)} ${String(p.code).padEnd(14)} ${String(p.prix_xof).padStart(6)} F  ${String(p.caracteres).padStart(9)} car. actif=${p.actif}`,
  );
}

await pg.end();

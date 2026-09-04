
import { readFileSync } from "node:fs";
import { Client } from "pg";
const contenu = readFileSync(".env.local", "utf8");
const ligne = (c) => contenu.split("\n").find(l => l.trim().startsWith(c + "=")).split("=").slice(1).join("=").trim();
const pg = new Client({ host: "aws-1-eu-west-1.pooler.supabase.com", port: 5432, user: "postgres.imbziizequckeaxuotdz", password: ligne("SUPABASE_DB_PASSWORD"), database: "postgres" });
await pg.connect();
const { rows: users } = await pg.query(`SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC LIMIT 12`);
console.log(`USERS (${users.length}):`);
for (const u of users) console.log(` - ${u.email} | ${u.created_at}`);
const { rows: books } = await pg.query(`SELECT id, proprietaire_id, titre, auteur, langue_source, langue_cible, statut FROM livres ORDER BY created_at DESC LIMIT 10`);
console.log(`LIVRES (${books.length}):`);
for (const b of books) console.log(` - [${b.id.slice(0,8)}] ${b.titre} | ${b.auteur} | ${b.langue_source}→${b.langue_cible} | ${b.statut} | par ${b.proprietaire_id.slice(0,8)}`);
const { rows: agg } = await pg.query(`
  SELECT (SELECT count(*) FROM chapitres) AS ch, (SELECT count(*) FROM segments) AS seg,
         (SELECT count(*) FROM segments WHERE statut='fait') AS faits
`);
console.log(`AGRÉGATS: chapitres=${agg[0].ch} segments=${agg[0].seg} faits=${agg[0].faits}`);
await pg.end();

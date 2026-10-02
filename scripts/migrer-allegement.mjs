// ============================================================
// migrer-allegement.mjs — Migration des DONNÉES (B1 + B10).
//
// Par défaut : MODE PLAN, LECTURE SEULE. N'écrit rien. Vérifie que la
// suppression des colonnes redondantes est sûre et liste les actions.
//
// Modes d'écriture (opt-in explicite, jamais DROP/DELETE) :
//   --apply-source   recrée chapitres.texte_source depuis les segments
//                    pour les chapitres où la colonne est vide
//                    (transition : imports faits après l'arrêt d'écriture).
//   --apply-traduit  recrée chapitres.texte_traduit depuis les segments
//                    quand la colonne est NULL mais des segments sont traduits.
//
// Ne supprime JAMAIS de colonne ni d'objet de stockage : les ordres
// destructifs sont affichés pour être exécutés À LA MAIN, en deux temps.
//
// Usage : PLUME_ENV=…/dark-romance-translator/.env.local \
//         node scripts/migrer-allegement.mjs [--apply-source|--apply-traduit]
// ============================================================

import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const envPath = process.env.PLUME_ENV || '.env.local';
const contenu = readFileSync(envPath, 'utf8');
const ligne = (clef) => {
  const l = contenu.split('\n').find((x) => x.trim().startsWith(clef + '='));
  return l ? l.split('=').slice(1).join('=').trim() : '';
};

const args = new Set(process.argv.slice(2));
const APPLY_SOURCE = args.has('--apply-source');
const APPLY_TRADUIT = args.has('--apply-traduit');
const nf = (n) => Number(n).toLocaleString('fr-FR');

const pg = new Client({
  host: process.env.SUPABASE_DB_POOLER_HOST || 'aws-1-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.imbziizequckeaxuotdz',
  password: ligne('SUPABASE_DB_PASSWORD'),
  database: 'postgres',
});

await pg.connect();
console.log(`\n=== MIGRATION DONNÉES ALLÈGEMENT — ${APPLY_SOURCE || APPLY_TRADUIT ? 'ÉCRITURE' : 'PLAN (lecture seule)'} ===`);

// --- 1. Chapitres SANS segment : blocage dur (texte seulement en colonne) ---
const { rows: bloquants } = await pg.query(`
  select c.id, c.livre_id, l.titre, c.position, octet_length(c.texte_source) as octets
  from public.chapitres c
  join public.livres l on l.id = c.livre_id
  where not exists (select 1 from public.segments s where s.chapitre_id = c.id)
  order by octets desc
`);
console.log(`\n[1] Chapitres SANS aucun segment (blocage avant DROP de texte_source) : ${bloquants.length}`);
for (const b of bloquants) {
  console.log(`    [${String(b.livre_id).slice(0, 8)}] ${String(b.titre).slice(0, 36).padEnd(36)} chap pos=${b.position} = ${nf(b.octets)} o`);
}
if (bloquants.length > 0) {
  console.log('    → ces chapitres doivent être re-segmentés (ou texte_source conservé) avant toute suppression.');
}

// --- 2. Candidats de backfill (transition) ---------------------------------
const { rows: cand } = await pg.query(`
  select
    (select count(*) from public.chapitres c
       where coalesce(length(c.texte_source),0)=0
         and exists (select 1 from public.segments s where s.chapitre_id=c.id))::int as src_vides,
    (select count(*) from public.chapitres c
       where c.texte_traduit is null
         and exists (select 1 from public.segments s
                     where s.chapitre_id=c.id and length(coalesce(s.traduit,''))>0))::int as trad_nuls
`);
console.log(`\n[2] Backfill possible : texte_source vides = ${cand[0].src_vides} ; texte_traduit NULL = ${cand[0].trad_nuls}`);

// --- 3. Écriture opt-in ----------------------------------------------------
if (APPLY_SOURCE) {
  const r = await pg.query(`
    update public.chapitres c
       set texte_source = (
             select coalesce(string_agg(s.source || s.suite, '' order by s.position), '')
             from public.segments s where s.chapitre_id = c.id)
     where coalesce(length(c.texte_source),0)=0
       and exists (select 1 from public.segments s where s.chapitre_id=c.id)
  `);
  console.log(`[apply-source] ${nf(r.rowCount)} chapitre(s) backfillé(s) depuis les segments.`);
}
if (APPLY_TRADUIT) {
  const r = await pg.query(`
    update public.chapitres c
       set texte_traduit = (
             select string_agg(coalesce(s.traduit,'') || s.suite, '' order by s.position)
             from public.segments s where s.chapitre_id = c.id)
     where c.texte_traduit is null
       and exists (select 1 from public.segments s
                   where s.chapitre_id=c.id and length(coalesce(s.traduit,''))>0)
  `);
  console.log(`[apply-traduit] ${nf(r.rowCount)} chapitre(s) backfillé(s) depuis les segments.`);
}

// --- 4. Ordres destructifs (À EXÉCUTER À LA MAIN, jamais ici) ---------------
console.log('\n[4] Suppression en deux temps — À EXÉCUTER À LA MAIN, à la fin :');
console.log('    -- 2a (sûr)  : alter table public.chapitres drop column if exists texte_traduit;');
console.log('    -- 2b (après backfill des chapitres sans segment) :');
console.log('                     alter table public.chapitres drop column if exists texte_source;');
console.log("    -- 2c        : delete from storage.objects where bucket_id='originaux';");
console.log("                     delete from storage.buckets where id='originaux';");
console.log('                     alter table public.livres   drop column if exists fichier_original;');
console.log('\n    AUCUN DROP/DELETE n\'a été exécuté par ce script.\n');

await pg.end();

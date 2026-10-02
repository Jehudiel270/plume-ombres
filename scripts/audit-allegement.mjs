// ============================================================
// audit-allegement.mjs — Audit CHIFFRÉ, LECTURE SEULE (B1 + B10).
//
// Mesure, sur la base de PRODUCTION :
//   - le volume des colonnes redondantes chapitres.texte_source /
//     texte_traduit vs les segments (source + suite + traduit) ;
//   - la reconstruction EXACTE depuis les segments (md5) et l'écart
//     éventuel de normalisation (sauts de ligne « mous ») ;
//   - l'estimation de lecture recalculée depuis les segments vs la
//     valeur calculée aujourd'hui depuis texte_source ;
//   - le bucket de stockage « originaux » (objets + octets) et les
//     livres dont fichier_original est renseigné ;
//   - la taille réelle des tables.
//
// Ne fait AUCUNE écriture (SELECT seulement). Aucun secret affiché.
//
// Usage :  PLUME_ENV=…/dark-romance-translator/.env.local \
//          node scripts/audit-allegement.mjs
// (par défaut lit « .env.local » du dossier courant).
// ============================================================

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Client } from 'pg';

const envPath = process.env.PLUME_ENV || '.env.local';
const contenu = readFileSync(envPath, 'utf8');
const ligne = (clef) => {
  const l = contenu
    .split('\n')
    .find((x) => x.trim().startsWith(clef + '='));
  return l ? l.split('=').slice(1).join('=').trim() : '';
};

const pg = new Client({
  // Pooler (identique à scripts/inspect-db.mjs) : l'hôte direct
  // db.<ref>.supabase.co n'est pas joignable (IPv6-only).
  host: process.env.SUPABASE_DB_POOLER_HOST || 'aws-1-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.imbziizequckeaxuotdz',
  password: ligne('SUPABASE_DB_PASSWORD'),
  database: 'postgres',
});

// Copie fidèle de lib/segmenter.ts → normaliserSouple().
const normaliserSouple = (t) =>
  t
    .replace(/\r\n?/g, '\n')
    .replace(/(?<!\n)\n(?!\n)/g, ' ')
    .replace(/[ \t]+/g, ' ');

const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const nf = (n) => Number(n).toLocaleString('fr-FR');
const mo = (o) => (Number(o) / 1024 / 1024).toFixed(2) + ' Mo';
const estimation = (caracteres) => {
  if (caracteres <= 0) return '0 min';
  const mots = caracteres / 6;
  const sec = Math.max(60, Math.round((mots / 250) * 60));
  return sec >= 3600
    ? `${Math.floor(sec / 3600)} h ${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}`
    : `${Math.round(sec / 60)} min`;
};

await pg.connect();

console.log('\n=== AUDIT ALLÈGEMENT (B1+B10) — base de production, lecture seule ===\n');

// --- 1. Volumétrie globale -----------------------------------------------
const { rows: glob } = await pg.query(`
  select
    (select count(*) from public.livres)      as livres,
    (select count(*) from public.chapitres)   as chapitres,
    (select count(*) from public.segments)    as segments,
    (select count(*) from public.segments where statut='fait') as segments_faits,
    (select count(*) from public.chapitres where coalesce(length(texte_source),0)>0) as chap_src_nonvide,
    (select count(*) from public.chapitres where texte_traduit is not null and length(texte_traduit)>0) as chap_trad_nonvide
`);
const g = glob[0];
console.log('--- VOLUMÉTRIE ---');
console.log(`livres=${nf(g.livres)}  chapitres=${nf(g.chapitres)}  segments=${nf(g.segments)} (faits ${nf(g.segments_faits)})`);
console.log(`chapitres avec texte_source non vide = ${nf(g.chap_src_nonvide)} / ${nf(g.chapitres)}`);
console.log(`chapitres avec texte_traduit non vide = ${nf(g.chap_trad_nonvide)} / ${nf(g.chapitres)}`);

const { rows: segStats } = await pg.query(`
  select min(nb) mini, round(avg(nb),1) moy, max(nb) maxi
  from (select count(*) nb from public.segments group by chapitre_id) t
`);
const ss = segStats[0];
console.log(`segments par chapitre : min=${ss.mini} moy=${ss.moy} max=${ss.maxi}`);

// --- 2. Poids des colonnes redondantes -----------------------------------
const { rows: poids } = await pg.query(`
  select
    coalesce(sum(octet_length(texte_source)),0)  as src_txt,
    coalesce(sum(octet_length(texte_traduit)),0) as trad_txt,
    pg_total_relation_size('public.chapitres')   as table_ch,
    pg_total_relation_size('public.segments')    as table_seg
  from public.chapitres
`);
const { rows: poidsSeg } = await pg.query(`
  select coalesce(sum(octet_length(source)),0) as seg_src,
         coalesce(sum(octet_length(suite)),0)  as seg_suite,
         coalesce(sum(octet_length(traduit)),0) as seg_trad
  from public.segments
`);
const p = poids[0], ps = poidsSeg[0];
console.log('\n--- POIDS RÉEL (octets) ---');
console.log(`chapitres.texte_source  = ${nf(p.src_txt)} o (${mo(p.src_txt)})`);
console.log(`chapitres.texte_traduit = ${nf(p.trad_txt)} o (${mo(p.trad_txt)})`);
console.log(`segments.source + suite = ${nf(+ps.seg_src + +ps.seg_suite)} o (${mo(+ps.seg_src + +ps.seg_suite)})`);
console.log(`segments.traduit        = ${nf(ps.seg_trad)} o (${mo(ps.seg_trad)})`);
console.log(`taille table chapitres   (pg_total_relation_size) = ${nf(p.table_ch)} o (${mo(p.table_ch)})`);
console.log(`taille table segments    (pg_total_relation_size) = ${nf(p.table_seg)} o (${mo(p.table_seg)})`);
console.log(`GAIN POTENTIEL (texte_source + texte_traduit) = ${nf(+p.src_txt + +p.trad_txt)} o (${mo(+p.src_txt + +p.trad_txt)})`);

// --- 3. Reconstruction depuis les segments (égalité exacte) --------------
const { rows: chap } = await pg.query(`
  select c.id, c.livre_id, c.position,
         length(c.texte_source)  as lsrc, md5(c.texte_source) as hsrc, c.texte_source,
         length(c.texte_traduit) as ltrad, md5(coalesce(c.texte_traduit,'')) as htrad,
         s.nb, s.lsrc as seg_lsrc, s.hsrc as seg_hsrc,
         s.ltrad as seg_ltrad, s.htrad as seg_htrad
  from public.chapitres c
  left join (
    select chapitre_id, count(*) nb,
           sum(length(source)+length(suite)) as lsrc,
           md5(string_agg(source||suite,'' order by position)) as hsrc,
           sum(length(coalesce(traduit,''))+length(suite)) as ltrad,
           md5(string_agg(coalesce(traduit,'')||suite,'' order by position)) as htrad
    from public.segments group by chapitre_id
  ) s on s.chapitre_id = c.id
  order by c.livre_id, c.position
`);

let srcExact = 0, srcNormalise = 0, tradExact = 0, tradComparables = 0;
let ecartSrc = 0, ecartTrad = 0;
let avecSeg = 0, srcNormAvecSeg = 0, tradAvecSeg = 0, tradExactAvecSeg = 0;
for (const c of chap) {
  const norm = normaliserSouple(c.texte_source ?? '');
  if (md5(norm) === c.seg_hsrc) srcNormalise += 1;
  if (c.hsrc === c.seg_hsrc) srcExact += 1;
  if (norm.length !== Number(c.seg_lsrc)) ecartSrc += 1;
  if (c.nb) {
    avecSeg += 1;
    if (md5(norm) === c.seg_hsrc) srcNormAvecSeg += 1;
    if (c.ltrad !== null) {
      tradAvecSeg += 1;
      if (c.htrad === c.seg_htrad) tradExactAvecSeg += 1;
    }
  }
  if (c.ltrad !== null) {
    tradComparables += 1;
    if (c.htrad === c.seg_htrad) tradExact += 1;
    if (c.ltrad !== Number(c.seg_ltrad)) ecartTrad += 1;
  }
}
console.log('\n--- RECONSTRUCTION DEPUIS LES SEGMENTS ---');
console.log(`texte_source  == segments (brut, md5)          : ${srcExact}/${chap.length}`);
console.log(`normaliserSouple(texte_source) == segments(md5): ${srcNormalise}/${chap.length}  (écarts de normalisation : ${ecartSrc})`);
console.log(`  dont chapitres AVEC segments                 : ${srcNormAvecSeg}/${avecSeg}`);
console.log(`texte_traduit == concat(traduit+suite) (md5)   : ${tradExact}/${tradComparables} (chapitres traduits)`);
console.log(`  dont chapitres AVEC segments                 : ${tradExactAvecSeg}/${tradAvecSeg}`);
console.log(`écarts de longueur texte_traduit               : ${ecartTrad}`);

// --- 3b. ANTI-PERTE : chapitres sans aucun segment -----------------------
const { rows: sansSeg } = await pg.query(`
  select l.id, l.titre, l.statut,
         count(distinct c.id) as chapitres,
         count(distinct c.id) filter (where s.chapitre_id is null) as chapitres_sans_segment,
         coalesce(sum(octet_length(c.texte_source)),0) as octets_texte_source
  from public.livres l
  join public.chapitres c on c.livre_id = l.id
  left join public.segments s on s.chapitre_id = c.id
  group by l.id, l.titre, l.statut
  having count(distinct c.id) filter (where s.chapitre_id is null) > 0
  order by octets_texte_source desc
`);
console.log('\n--- ANTI-PERTE : chapitres sans segment (texte_source seul) ---');
if (sansSeg.length === 0) console.log('  aucun : tous les chapitres ont des segments.');
for (const r of sansSeg) {
  console.log(`  [${String(r.id).slice(0, 8)}] ${String(r.titre).slice(0, 40).padEnd(40)} statut=${r.statut} chapitres=${r.chapitres} sans_segment=${r.chapitres_sans_segment} texte_source=${nf(r.octets_texte_source)} o`);
}

// --- 4. Estimation de lecture : stockée vs recalculée -------------------
const { rows: est } = await pg.query(`
  select l.id, l.titre,
    coalesce(sum(length(c.texte_source)),0) as car_txt,
    coalesce(sum(s.lsrc),0)                 as car_seg
  from public.livres l
  left join public.chapitres c on c.livre_id = l.id
  left join (
    select chapitre_id, sum(length(source)+length(suite)) lsrc
    from public.segments group by chapitre_id
  ) s on s.chapitre_id = c.id
  group by l.id, l.titre
  order by car_txt desc
`);
console.log('\n--- ESTIMATION DE LECTURE (chapitres.texte_source vs segments) ---');
let totTxt = 0, totSeg = 0;
for (const e of est) {
  const a = Number(e.car_txt), b = Number(e.car_seg);
  totTxt += a; totSeg += b;
  console.log(`  [${String(e.id).slice(0, 8)}] ${String(e.titre).slice(0, 42).padEnd(42)} txt=${nf(a).padStart(9)} seg=${nf(b).padStart(9)} Δ=${nf(b - a).padStart(7)} (${estimation(a)} → ${estimation(b)})`);
}
console.log(`  TOTAL txt=${nf(totTxt)} (${estimation(totTxt)})  seg=${nf(totSeg)} (${estimation(totSeg)})  Δ=${nf(totSeg - totTxt)}`);

// --- 5. Bucket « originaux » (B10) --------------------------------------
let storage = { nb: '0', octets: '0' };
try {
  const { rows } = await pg.query(`
    select count(*)::text nb,
           coalesce(sum((metadata->>'size')::bigint),0)::text octets
    from storage.objects where bucket_id='originaux'
  `);
  storage = rows[0];
} catch (e) {
  storage = { nb: 'n/a', octets: 'n/a', err: e.message };
}
const { rows: orphelins } = await pg.query(`
  select
    (select count(*) from public.livres where fichier_original is not null)::text as livres_avec_original,
    (select count(*) from storage.objects where bucket_id='originaux')::text as objets
`);
console.log('\n--- BUCKET « originaux » (B10) ---');
console.log(`objets dans le bucket      = ${storage.nb} (${mo(storage.octets)})`);
console.log(`livres.fichier_original ≠ null = ${orphelins[0].livres_avec_original}`);
if (storage.err) console.log(`(storage.objects : ${storage.err})`);

console.log('\n=== FIN AUDIT (aucune écriture effectuée) ===\n');
await pg.end();

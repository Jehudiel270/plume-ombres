// ============================================================
// scripts/test-sante.ts — Test exécutable de la supervision (P1.6)
// et de la confidentialité associée.
//
// Usage : npx tsx scripts/test-sante.ts
//
//   A. PUR : normalisation (listes blanches), formatage, seuils.
//   B. STRUCTURE : journal_traduction n'a AUCUNE colonne de contenu ;
//      fonctions SECURITY DEFINER ; privilèges anon/authenticated.
//   C. CONFIDENTIALITÉ : une PHRASE RÉELLE extraite d'un segment de
//      la base n'apparaît NI dans les sorties RPC NI dans la page
//      de suivi. C'est la preuve demandée par le projet.
//   D. ACCÈS : anon et utilisateur simple REFUSÉS sur sante_studio
//      (42501) ; admin servi ; anon servi sur sante_machine.
//   E. COHÉRENCE : les compteurs de sante_studio correspondent aux
//      comptages SQL directs.
// ============================================================

import { readFileSync } from 'node:fs';
import { Client as ClientPg } from 'pg';
import {
  normaliserSanteStudio,
  normaliserSanteMachine,
  etatGlobal,
  formaterNombre,
  formaterTaux,
  formaterSecondes,
  formaterMillisecondes,
  libelleFournisseur,
  SEUIL_ERREURS_24H,
} from '../lib/sante';

let echecs = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

function chargerEnv() {
  let contenu = '';
  try {
    contenu = readFileSync('.env.local', 'utf8');
  } catch {
    return;
  }
  for (const ligne of contenu.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(ligne);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

function ouvrirPg(): ClientPg {
  return new ClientPg({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
}

// ============================================================
// A. Pur
// ============================================================
function partieA() {
  console.log('\n— A. Normalisation et formatage (pur) —');

  // Une charge utile qui tenterait d'injecter du contenu est ignorée :
  // seules les clés de la liste blanche survivent.
  const charge = {
    traductions: { en_cours: 2, termine: '72', erreur: 1, a_traduire: 139, total: 214 },
    segments: { en_cours: 3, fait: 2149, erreur: 11, en_attente: 10346, total: 12509 },
    essais_en_cours: { chapitres: 2, segments: 3 },
    durees: { moyenne_chapitre_s: '25.2', chapitres_mesures: 67, moyenne_livre_s: 351.1, livres_mesures: 8 },
    taille: { caracteres_moyen_chapitre: 20124, caracteres_moyen_livre: 418578, segments_moyen_chapitre: 60.1 },
    fournisseurs: [
      { fournisseur: 'google', succes: 10, echecs: 2, total: 12, taux_echec: 0.1667, duree_moyenne_ms: 800, caracteres: 5000, texte: 'FUITE INTERDITE' },
    ],
    usage_mois: { periode: '2026-10', total: 100, par_plan: [], par_compte: [] },
    erreurs_recentes: [],
    // Champs piégés hors liste blanche : ne doivent PAS ressortir.
    titre_livre: 'Le Secret de la Nuit',
    texte_source: 'Il était une fois',
  };
  const s = normaliserSanteStudio(charge);

  verifier('A : nombre textuel coercé en nombre', s.traductions.termine === 72);
  verifier('A : total chapitres lu', s.traductions.total === 214);
  verifier('A : taux d’échec conservé', s.fournisseurs[0].tauxEchec > 0.16);
  verifier(
    'A : clés hors liste blanche ÉLIMINÉES (anti-fuite)',
    !JSON.stringify(s).includes('FUITE INTERDITE') &&
      !JSON.stringify(s).includes('Le Secret de la Nuit') &&
      !JSON.stringify(s).includes('Il était une fois')
  );
  verifier(
    'A : seules les clés attendues figurent à la racine',
    JSON.stringify(Object.keys(s).sort()) ===
      JSON.stringify(
        ['durees', 'erreursRecentes', 'essaisEnCours', 'fenetreJours', 'fournisseurs', 'genereLe', 'segments', 'taille', 'traductions', 'usageMois'].sort()
      ),
    JSON.stringify(Object.keys(s))
  );

  const m = normaliserSanteMachine({
    version: 1,
    chapitres_en_traduction: 0,
    segments_en_cours: 3,
    bloques_en_cours: 2,
    file_en_retard: true,
    erreurs_traduction_24h: 5,
    verdict: 'FUITE',
  });
  verifier('A : machine — booléens et nombres lus', m.fileEnRetard === true && m.segmentsEnCours === 3);
  verifier('A : machine — charge inconnue ignorée', !JSON.stringify(m).includes('FUITE'));

  verifier(
    'A : etatGlobal — file en retard → dégradé',
    etatGlobal({ ...m, fileEnRetard: true }) === 'degrade'
  );
  verifier(
    'A : etatGlobal — seuil d’erreurs atteint → dégradé',
    etatGlobal({ ...m, fileEnRetard: false, erreurs24h: SEUIL_ERREURS_24H }) === 'degrade'
  );
  verifier(
    'A : etatGlobal — tout va bien → ok',
    etatGlobal({ ...m, fileEnRetard: false, erreurs24h: 0 }) === 'ok'
  );

  verifier(
    'A : formatage nombre (séparateur fr)',
    formaterNombre(20124).replace(/[\s\u202f\u00a0]/g, '') === '20124' &&
      formaterNombre(20124).length === 6
  );
  verifier('A : formatage taux', formaterTaux(0.1667).includes('16,7'));
  verifier('A : formatage secondes < 60', formaterSecondes(25.2).startsWith('25,2'));
  verifier('A : formatage millisecondes', formaterMillisecondes(800) === '800 ms');
  verifier('A : libellé moteur connu', libelleFournisseur('google').includes('Google'));

  // La page de suivi ne doit référencer AUCUNE colonne de contenu.
  const sourcePage = readFileSync('app/admin/sante/page.tsx', 'utf8');
  verifier(
    'A : la page de suivi ne lit aucune colonne de contenu',
    !/texte_source|texte_traduit|segments\.source|segments\.traduit/.test(sourcePage)
  );
}

// ============================================================
// B. Structure en base
// ============================================================
async function partieB(pg: ClientPg) {
  console.log('\n— B. Structure en base —');

  const cols = await pg.query(
    `select column_name, data_type from information_schema.columns
      where table_schema='public' and table_name='journal_traduction'
      order by ordinal_position`
  );
  const noms = cols.rows.map((r: { column_name: string }) => r.column_name);
  const attendues = ['id', 'proprietaire_id', 'fournisseur', 'statut', 'categorie', 'duree_ms', 'caracteres', 'essais', 'cree_le'];
  verifier(
    'B : journal_traduction a EXACTEMENT les colonnes autorisées',
    JSON.stringify(noms.sort()) === JSON.stringify([...attendues].sort()),
    noms.join(',')
  );
  const textuelles = cols.rows.filter((r: { column_name: string; data_type: string }) => r.data_type === 'text').map((r: { column_name: string }) => r.column_name);
  verifier(
    'B : seules 3 colonnes textuelles bornées (fournisseur/statut/categorie)',
    JSON.stringify(textuelles.sort()) === JSON.stringify(['categorie', 'fournisseur', 'statut']),
    textuelles.join(',')
  );

  const ctr = await pg.query(
    `select count(*)::int as n from pg_constraint
      where conname='journal_traduction_enums_courts' and conrelid='public.journal_traduction'::regclass`
  );
  verifier('B : contrainte de longueur des énumérations présente', ctr.rows[0].n === 1);

  const rls = await pg.query(`select relrowsecurity from pg_class where oid='public.journal_traduction'::regclass`);
  verifier('B : RLS active sur journal_traduction', rls.rows[0].relrowsecurity === true);

  const pol = await pg.query(
    `select count(*)::int as n from pg_policies where schemaname='public' and tablename='journal_traduction'`
  );
  verifier('B : aucune politique directe (écriture via fonction seule)', pol.rows[0].n === 0);

  const fns = await pg.query(
    `select proname, prosecdef from pg_proc
      where pronamespace='public'::regnamespace
        and proname in ('sante_studio','sante_machine','journaliser_traduction')`
  );
  verifier(
    'B : les 3 fonctions de supervision sont SECURITY DEFINER',
    fns.rows.length === 3 && fns.rows.every((r: { prosecdef: boolean }) => r.prosecdef === true),
    JSON.stringify(fns.rows)
  );

  const grants = await pg.query(
    `select has_function_privilege('anon','public.sante_studio(integer)','execute') as anon_studio,
            has_function_privilege('authenticated','public.sante_studio(integer)','execute') as auth_studio,
            has_function_privilege('anon','public.sante_machine()','execute') as anon_machine,
            has_function_privilege('anon','public.journaliser_traduction(text,text,text,integer,integer,integer)','execute') as anon_journal`
  );
  const g = grants.rows[0] as Record<string, boolean>;
  verifier(
    'B : sante_studio fermée à anon, ouverte à authenticated',
    g.anon_studio === false && g.auth_studio === true,
    JSON.stringify(g)
  );
  verifier('B : sante_machine ouverte à anon (cron externe)', g.anon_machine === true);
  verifier('B : journaliser_traduction fermée à anon', g.anon_journal === false);
}

// ============================================================
// C. Confidentialité — phrase réelle absente des sorties
// ============================================================
async function partieC(pg: ClientPg) {
  console.log('\n— C. Confidentialité (phrase réelle) —');

  const seg = await pg.query(
    `select id, chapitre_id, substring(source from 1 for 80) as extrait
       from public.segments
      where length(source) > 160 and position(' ' in source) > 8
      order by length(source) desc
      limit 1`
  );
  if (seg.rows.length === 0) {
    verifier('C : segment de référence trouvé', false, 'aucun segment exploitable');
    return;
  }
  const extrait = String(seg.rows[0].extrait).trim();
  verifier(
    'C : extrait de référence non trivial',
    extrait.length >= 40,
    // On n'affiche JAMAIS la phrase : seulement sa taille.
    `${extrait.length} caractères (contenu non journalisé)`
  );

  // Aucune phrase de livre dans le journal (toutes lignes confondues).
  const fuites = await pg.query(
    `select
       (select count(*)::int from public.journal_traduction
         where length(fournisseur) > 40
            or length(coalesce(categorie,'')) > 40
            or fournisseur ilike '%' || $1 || '%'
       ) as journal,
       (select count(*)::int from public.journal_traduction) as total`,
    [extrait]
  );
  verifier(
    'C : le journal ne contient aucune phrase (bornes + absence de l’extrait)',
    fuites.rows[0].journal === 0,
    `journal=${fuites.rows[0].journal}, lignes=${fuites.rows[0].total}`
  );

  const admin = (await pg.query(`select id from public.profiles where role='admin' limit 1`)).rows[0]?.id;
  if (!admin) {
    verifier('C : un administrateur existe pour tester la sortie', false);
    return;
  }

  await pg.query('begin');
  try {
    await pg.query('set local role authenticated');
    await pg.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: admin })]);
    const studio = (await pg.query('select public.sante_studio(30) as j')).rows[0].j;
    await pg.query('rollback');
    await pg.query('begin');
    await pg.query('set local role anon');
    const machine = (await pg.query('select public.sante_machine() as j')).rows[0].j;

    const sortieStudio = JSON.stringify(studio);
    const sortieMachine = JSON.stringify(machine);
    verifier(
      'C : la phrase réelle est ABSENTE de sante_studio()',
      !sortieStudio.includes(extrait)
    );
    verifier(
      'C : la phrase réelle est ABSENTE de sante_machine()',
      !sortieMachine.includes(extrait)
    );
    // Contrôle de forme : aucune chaîne longue (hors dates/périodes).
    const chaines = (valeur: unknown, acc: string[] = []): string[] => {
      if (typeof valeur === 'string') acc.push(valeur);
      else if (Array.isArray(valeur)) valeur.forEach((v) => chaines(v, acc));
      else if (valeur && typeof valeur === 'object') Object.values(valeur).forEach((v) => chaines(v, acc));
      return acc;
    };
    const longues = chaines(studio).filter(
      (v) => v.length > 40 && !/^\d{4}-\d{2}-\d{2}/.test(v) && !/^\d{4}-\d{2}$/.test(v)
    );
    verifier(
      'C : aucune chaîne longue dans la sortie admin (hors dates)',
      longues.length === 0,
      longues.join(' | ')
    );
  } finally {
    await pg.query('rollback').catch(() => undefined);
    await pg.query('reset role').catch(() => undefined);
  }

  // Preuve de source : la page de suivi ne référence aucune colonne de contenu.
  const sourcePage = readFileSync('app/admin/sante/page.tsx', 'utf8');
  verifier(
    'C : la page de suivi ne mentionne ni texte_source ni texte_traduit ni segments.source',
    !/texte_source|texte_traduit|segments\.source|segments\.traduit/.test(sourcePage)
  );
  verifier(
    'C : la route de santé ne mentionne aucun contenu',
    !/texte_source|texte_traduit|\.source\b|\btitre\b/.test(readFileSync('app/api/sante/route.ts', 'utf8'))
  );
}

// ============================================================
// D. Accès
// ============================================================
async function partieD(pg: ClientPg) {
  console.log('\n— D. Accès (impersonation, transaction annulée) —');

  const user = (await pg.query(`select id from public.profiles where role='utilisateur' limit 1`)).rows[0]?.id;
  const admin = (await pg.query(`select id from public.profiles where role='admin' limit 1`)).rows[0]?.id;

  const avecRole = async (role: string, sub: string | null, requete: string) => {
    await pg.query('begin');
    try {
      await pg.query(`set local role ${role}`);
      if (sub) {
        await pg.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub })]);
      } else {
        await pg.query(`select set_config('request.jwt.claims', '', true)`);
      }
      return { ok: true, data: (await pg.query(requete)).rows };
    } catch (e) {
      return { ok: false, code: (e as { code?: string }).code, message: (e as Error).message };
    } finally {
      await pg.query('rollback').catch(() => undefined);
      await pg.query('reset role').catch(() => undefined);
    }
  };

  const anonStudio = await avecRole('anon', null, 'select public.sante_studio(30) as j');
  verifier(
    'D : anon REFUSÉ sur sante_studio',
    !anonStudio.ok && ['42501', '42883'].includes(anonStudio.code ?? ''),
    `code=${anonStudio.code}`
  );

  if (user) {
    const userStudio = await avecRole('authenticated', user, 'select public.sante_studio(30) as j');
    verifier(
      'D : utilisateur simple REFUSÉ sur sante_studio (42501)',
      !userStudio.ok && userStudio.code === '42501',
      `code=${userStudio.code} ${userStudio.message}`
    );
  } else {
    verifier('D : un utilisateur simple existe pour tester', false);
  }

  if (admin) {
    const adminStudio = await avecRole('authenticated', admin, 'select public.sante_studio(30) as j');
    verifier(
      'D : administrateur SERVI sur sante_studio',
      adminStudio.ok && typeof adminStudio.data?.[0]?.j === 'object'
    );
  } else {
    verifier('D : un administrateur existe pour tester', false);
  }

  const anonMachine = await avecRole('anon', null, 'select public.sante_machine() as j');
  verifier(
    'D : anon SERVI sur sante_machine (cron externe)',
    anonMachine.ok && typeof anonMachine.data?.[0]?.j === 'object'
  );

  const anonJournal = await avecRole('anon', null, `select public.journaliser_traduction('google','succes',null,10,5,1)`);
  verifier(
    'D : anon REFUSÉ sur journaliser_traduction',
    !anonJournal.ok && ['42501', '42883'].includes(anonJournal.code ?? ''),
    `code=${anonJournal.code}`
  );
}

// ============================================================
// E. Cohérence des compteurs
// ============================================================
async function partieE(pg: ClientPg) {
  console.log('\n— E. Cohérence des agrégats —');
  const admin = (await pg.query(`select id from public.profiles where role='admin' limit 1`)).rows[0]?.id;
  if (!admin) return;

  await pg.query('begin');
  let studio: Record<string, unknown> | null = null;
  try {
    await pg.query('set local role authenticated');
    await pg.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: admin })]);
    studio = (await pg.query('select public.sante_studio(30) as j')).rows[0].j;
  } finally {
    await pg.query('rollback').catch(() => undefined);
    await pg.query('reset role').catch(() => undefined);
  }
  if (!studio) {
    verifier('E : sortie admin disponible', false);
    return;
  }
  const tra = (studio.traductions ?? {}) as Record<string, number>;
  const direct = (await pg.query(
    `select count(*) filter (where statut='traduit')::int as traduits,
            count(*) filter (where statut='erreur')::int as erreurs,
            count(*)::int as total
       from public.chapitres`
  )).rows[0];
  verifier(
    `E : chapitres traduits cohérents (${tra.termine} = ${direct.traduits})`,
    Number(tra.termine) === direct.traduits
  );
  verifier(
    `E : chapitres en erreur cohérents (${tra.erreur} = ${direct.erreurs})`,
    Number(tra.erreur) === direct.erreurs
  );
  verifier(
    `E : total chapitres cohérent (${tra.total} = ${direct.total})`,
    Number(tra.total) === direct.total
  );

  const seg = (studio.segments ?? {}) as Record<string, number>;
  const segDirect = (await pg.query(
    `select count(*) filter (where statut='fait')::int as faits,
            count(*) filter (where statut='erreur')::int as erreurs
       from public.segments`
  )).rows[0];
  verifier(
    `E : segments faits cohérents (${seg.fait} = ${segDirect.faits})`,
    Number(seg.fait) === segDirect.faits
  );
  verifier(
    `E : segments en erreur cohérents (${seg.erreur} = ${segDirect.erreurs})`,
    Number(seg.erreur) === segDirect.erreurs
  );
}

// ============================================================
async function principal() {
  chargerEnv();
  partieA();

  const pg = ouvrirPg();
  try {
    await pg.connect();
    await partieB(pg);
    await partieC(pg);
    await partieD(pg);
    await partieE(pg);
  } catch (e) {
    console.warn('· Parties base ignorées :', (e as Error).message);
    echecs += 1;
  } finally {
    await pg.end().catch(() => undefined);
  }

  console.log(
    `\n${echecs === 0 ? '✓ Tous les tests passent' : `✗ ${echecs} test(s) en échec`}`
  );
  if (echecs > 0) process.exit(1);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});

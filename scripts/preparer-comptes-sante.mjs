#!/usr/bin/env node
// ============================================================
// preparer-comptes-sante.mjs — Comptes de TEST pour la
// supervision (P1.6) : un administrateur et un lecteur simple.
//
// Idempotent : réexécutable sans casser l'existant (signUp au
// premier run, signIn ensuite ; upsert des profils).
//
// Usage : node scripts/preparer-comptes-sante.mjs
// Sortie : %TEMP%/sante-comptes.json
//   { admin: {email, session}, lecteur: {email, session} }
//
// ⚠ Comptes JETABLES de test, sur la base de développement. Le mot
// de passe par défaut n'est PAS un secret de production (compte
// local de recette) ; il peut être surchargé par PLUME_MDP_TEST.
// Aucun secret n'est écrit dans un fichier suivi par git : les
// sessions partent dans le dossier temporaire du système.
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const env = (cle) => {
  const ligne = readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith(cle + '='));
  return ligne ? ligne.split('=').slice(1).join('=').trim() : null;
};

const URL_SUPABASE = env('NEXT_PUBLIC_SUPABASE_URL');
const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const MDP = process.env.PLUME_MDP_TEST || 'PlumeSante.2026!';

const COMPTES = {
  admin: { email: 'sante-admin@plume-ombres.local', role: 'admin', pseudo: 'Supervision' },
  lecteur: { email: 'sante-lecteur@plume-ombres.local', role: 'utilisateur', pseudo: 'Lecteur test' },
};

const sortie = {};

async function connecter(supabase, email) {
  let r = await supabase.auth.signInWithPassword({ email, password: MDP });
  if (!r.data?.session) {
    const up = await supabase.auth.signUp({ email, password: MDP });
    if (up.error) throw new Error(`signUp ${email} : ${up.error.message}`);
    r = await supabase.auth.signInWithPassword({ email, password: MDP });
  }
  if (!r.data?.session) throw new Error(`session vide pour ${email}`);
  return r.data;
}

async function principal() {
  const supabase = createClient(URL_SUPABASE, ANON);
  const client = new pg.Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: env('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  for (const [cle, compte] of Object.entries(COMPTES)) {
    const data = await connecter(supabase, compte.email);
    // Profil + rôle (connexion SQL directe : auth.uid() nul, le
    // déclencheur proteger_role_profiles autorise la promotion).
    await client.query(
      `insert into public.profiles (id, pseudo, role) values ($1, $2, $3)
       on conflict (id) do update set pseudo = excluded.pseudo, role = excluded.role`,
      [data.user.id, compte.pseudo, compte.role]
    );
    sortie[cle] = { email: compte.email, role: compte.role, session: data.session };
    console.log(`✓ ${cle} : ${compte.email} (${compte.role})`);
  }

  await client.end();
  const chemin = join(tmpdir(), 'sante-comptes.json');
  writeFileSync(chemin, JSON.stringify(sortie, null, 2));
  console.log(`✓ sessions écrites : ${chemin}`);
}

principal().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});

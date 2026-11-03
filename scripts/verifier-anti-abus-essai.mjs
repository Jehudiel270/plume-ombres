#!/usr/bin/env node
// ============================================================
// Épreuve réelle : l'essai gratuit ne peut pas être rejoué avec un
// alias de la même boîte (points Gmail, +suffixe, googlemail).
//
// Crée deux VRAIS comptes en base, vérifie qu'un seul essai est
// accordé, puis supprime tout. Aucun compte de test ne survit.
// ============================================================
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !CLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.');
  process.exit(1);
}

const admin = createClient(URL, CLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const horodatage = Date.now();
const local = `probeabuse${horodatage}`;
const alias = local.split('').join('.') + '+pub';
const premier = `${local}@gmail.com`;
const second = `${alias}@googlemail.com`;

let echecs = 0;
const ok = (m) => console.log(`OK  ${m}`);
const ko = (m) => {
  echecs += 1;
  console.log(`KO  ${m}`);
};

const crees = [];

async function creer(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Probe!${horodatage}Aa`,
    email_confirm: true,
  });
  if (error) throw new Error(`création ${email} : ${error.message}`);
  crees.push(data.user.id);
  return data.user.id;
}

async function essaiDe(id) {
  const { data } = await admin
    .from('essais_abonnement')
    .select('compte_id, email, email_normalise')
    .eq('compte_id', id)
    .maybeSingle();
  const { data: abo } = await admin
    .from('abonnements')
    .select('plan, statut')
    .eq('proprietaire_id', id)
    .maybeSingle();
  return { essai: data, abo };
}

try {
  console.log(`Essais     : ${premier}`);
  console.log(`   puis     : ${second}\n`);

  const a = await creer(premier);
  const etatA = await essaiDe(a);
  etatA.essai ? ok('1er compte : essai accordé') : ko('1er compte : aucun essai (anormal)');
  ok(`e-mail normalisé : ${etatA.essai?.email_normalise ?? '—'}`);

  const b = await creer(second);
  const etatB = await essaiDe(b);
  etatB.essai
    ? ko(`2e compte : essai REJOUÉ malgré l'alias (${etatB.essai.email})`)
    : ok('2e compte (alias de la même boîte) : essai refusé');
  etatB.abo?.plan === 'essai'
    ? ko('2e compte : plan « essai » attribué quand même')
    : ok(`2e compte : plan « ${etatB.abo?.plan ?? 'aucun'} » (pas d'essai)`);

  // Contrôle direct de la normalisation, cas réels.
  const cas = [
    ['Jean.Dupont+promo@GoogleMail.com', 'jeandupont@gmail.com'],
    ['jean@example.com', 'jean@example.com'],
    ['jean.point@example.com', 'jean.point@example.com'],
    ['prenom+news@yahoo.fr', 'prenom@yahoo.fr'],
  ];
  for (const [entree, attendu] of cas) {
    const { data, error } = await admin.rpc('normaliser_email', { p_email: entree });
    if (error) {
      ko(`normaliser_email(${entree}) : ${error.message}`);
    } else if (data === attendu) {
      ok(`normaliser_email(${entree}) = ${attendu}`);
    } else {
      ko(`normaliser_email(${entree}) = ${data} (attendu ${attendu})`);
    }
  }
} catch (e) {
  ko(e.message);
} finally {
  for (const id of crees) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`\ncomptes de test supprimés : ${crees.length}`);
  console.log(echecs === 0 ? 'TOUT EST VERT' : `${echecs} ÉCHEC(S)`);
  process.exit(echecs === 0 ? 0 : 1);
}

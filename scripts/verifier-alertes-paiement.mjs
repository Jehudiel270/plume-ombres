#!/usr/bin/env node
// ============================================================
// Épreuve réelle des alertes de paiement (base de production).
//
// 1. deux administrateurs de test (rôle admin, comme un vrai admin) ;
// 2. l'un s'abonne aux deux alertes, l'autre aux échecs seulement ;
// 3. un paiement de test reste « en attente » depuis 3 h ;
// 4. notifier_paiement('reussi') → 1 notification pour l'acheteur,
//    1 pour l'admin abonné aux succès, 0 pour l'autre ;
// 5. rejouer la même alerte ne crée AUCUN doublon ;
// 6. notifier_paiement('echoue') → 1 de plus pour chacun des 2 admins,
//    l'acheteur n'est pas re-prévenu ;
// 7. surveiller_paiements(0) détecte le paiement bloqué et n'alerte
//    qu'une fois dans la journée ;
// 8. un appel anonyme est refusé.
//
// Les comptages sont faits PAR COMPTE (la base de production contient
// de vrais administrateurs : on ne compare jamais un total global).
// Tout est nettoyé : comptes, paiement, notifications de test.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants.');
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
const horodatage = Date.now();
const reference = `TEST-ALERTE-${horodatage}`;
const crees = [];
let reussies = 0;
let echecs = 0;

function point(ok, libelle, detail = '') {
  if (ok) reussies += 1;
  else echecs += 1;
  console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`);
}

async function creerCompte(suffixe) {
  const email = `alerte.${suffixe}.${horodatage}@exemple-plume.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Test!${horodatage}aA`,
    email_confirm: true,
    user_metadata: { pseudo: `Alerte ${suffixe}` },
  });
  if (error || !data.user) throw new Error(`Création ${suffixe} : ${error?.message}`);
  crees.push(data.user.id);
  return data.user.id;
}

async function compter(compteId) {
  const { count, error } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('proprietaire_id', compteId)
    .like('cle', `%${reference}%`);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function main() {
  const acheteur = await creerCompte('acheteur');
  const suiveur = await creerCompte('suiveur');
  const seulementEchecs = await creerCompte('echecs');

  // Deux vrais administrateurs (rôle admin) parmi les comptes de test.
  const { error: roleErreur } = await admin
    .from('profiles')
    .update({ role: 'admin' })
    .in('id', [suiveur, seulementEchecs]);
  point(!roleErreur, 'comptes de test promus administrateurs', roleErreur?.message ?? '');

  const { error: aboErreur } = await admin.from('admin_alertes').upsert([
    { compte_id: suiveur, paiement_reussi: true, paiement_echoue: true },
    { compte_id: seulementEchecs, paiement_reussi: false, paiement_echoue: true },
  ]);
  point(!aboErreur, 'abonnements d’alertes enregistrés', aboErreur?.message ?? '');

  const ilYa3h = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { error: paieErreur } = await admin.from('paiements').insert({
    reference,
    proprietaire_id: acheteur,
    plan: 'credits_500',
    montant: 500,
    devise: 'XOF',
    statut: 'en_attente',
    operateur: 'test',
    telephone: '+22900000000',
    created_at: ilYa3h,
  });
  point(!paieErreur, 'paiement de test créé', paieErreur?.message ?? '');

  // 1. Alerte de succès.
  const { data: n1, error: e1 } = await admin.rpc('notifier_paiement', {
    p_reference: reference,
    p_statut: 'reussi',
  });
  const a1 = await compter(acheteur);
  const s1 = await compter(suiveur);
  const x1 = await compter(seulementEchecs);
  point(
    !e1 && a1 === 1 && s1 === 1 && x1 === 0,
    'succès → acheteur 1, admin « tout » 1, admin « échecs » 0',
    `acheteur=${a1} tout=${s1} échecs=${x1} (rpc=${n1})`
  );

  // 2. Idempotence.
  const { data: n2 } = await admin.rpc('notifier_paiement', {
    p_reference: reference,
    p_statut: 'reussi',
  });
  const a2 = await compter(acheteur);
  const s2 = await compter(suiveur);
  point(a2 === 1 && s2 === 1 && Number(n2) === 0, 'rejeu identique → aucun doublon', `rpc=${n2}`);

  // 3. Alerte d'échec.
  const { data: n3, error: e3 } = await admin.rpc('notifier_paiement', {
    p_reference: reference,
    p_statut: 'echoue',
  });
  const a3 = await compter(acheteur);
  const s3 = await compter(suiveur);
  const x3 = await compter(seulementEchecs);
  point(
    !e3 && a3 === 1 && s3 === 2 && x3 === 1,
    'échec → les 2 admins alertés, l’acheteur pas re-prévenu',
    `acheteur=${a3} tout=${s3} échecs=${x3} (rpc=${n3})`
  );

  // 4. Surveillance : le paiement bloqué est détecté…
  const { data: v1, error: e5 } = await admin.rpc('surveiller_paiements', { p_heures: 2 });
  const bloques = Array.isArray(v1) ? v1.length : -1;
  point(!e5 && bloques >= 1, 'surveillance détecte le paiement bloqué', `${bloques} bloqué(s)`);

  // 5. …et l'alerte du jour n'est pas répétée.
  const { count: alertesJour1 } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('proprietaire_id', seulementEchecs)
    .like('cle', 'surveillance:%');
  await admin.rpc('surveiller_paiements', { p_heures: 2 });
  const { count: alertesJour2 } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('proprietaire_id', seulementEchecs)
    .like('cle', 'surveillance:%');
  point(
    (alertesJour1 ?? 0) >= 1 && alertesJour2 === alertesJour1,
    'la surveillance n’alerte qu’une fois par jour',
    `${alertesJour1} puis ${alertesJour2}`
  );

  // 6. Appel anonyme refusé.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: e7 } = await anon.rpc('notifier_paiement', {
      p_reference: reference,
      p_statut: 'reussi',
    });
    point(Boolean(e7), 'appel anonyme refusé', e7?.message ?? 'aucune erreur');
  }
}

async function nettoyer() {
  await admin.from('notifications').delete().like('cle', `%${reference}%`);
  for (const id of crees) {
    await admin.from('notifications').delete().eq('proprietaire_id', id);
  }
  await admin.from('paiements').delete().eq('reference', reference);
  await admin.from('admin_alertes').delete().in('compte_id', crees);
  for (const id of crees) {
    await admin.auth.admin.deleteUser(id);
  }
}

try {
  await main();
} catch (erreur) {
  echecs += 1;
  console.log(`ÉCHEC ${erreur.message}`);
} finally {
  await nettoyer();
  console.log(`\n${reussies} réussie(s), ${echecs} échec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
}

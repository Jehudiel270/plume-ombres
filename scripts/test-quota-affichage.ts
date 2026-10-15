// ============================================================
// Tests réels — Affichage de ce qui RESTE (quota mensuel).
// Usage : npx tsx scripts/test-quota-affichage.ts
//
// OFFLINE et sans écriture en base : magasin MÉMOIRE uniquement.
// Ce que l'on prouve : la valeur affichable (restant = limite - utilisé)
// SUIT la consommation — donc elle ne peut pas être un chiffre figé —
// et se recharge au changement de mois civil.
// ============================================================

import {
  MagasinQuotaMemoire,
  lireQuotaRestant,
  restantDe,
  reserverQuota,
  libererQuota,
  periodeMois,
} from '../lib/quota';

let echecs = 0;
function verifier(intitule: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${intitule}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs += 1;
}

async function principal() {
  const magasin = new MagasinQuotaMemoire();
  const oct = new Date('2026-10-15T12:00:00Z');
  const limite = 500_000;
  const compte = 'compte-affichage';

  // 1. Aucune consommation → tout reste disponible.
  const initial = await lireQuotaRestant(magasin, compte, oct, limite);
  verifier(
    '1. compte neuf : restant = limite',
    initial.utilise === 0 && initial.restant === 500_000 && initial.limite === 500_000,
    `utilisé=${initial.utilise} restant=${initial.restant}`
  );

  // 2. Après une traduction de 120 000 caractères, l'affichage DOIT bouger.
  await reserverQuota(magasin, compte, 120_000, oct, limite);
  const apres = await lireQuotaRestant(magasin, compte, oct, limite);
  verifier(
    '2. après traduction : le restant SUIT la consommation',
    apres.utilise === 120_000 && apres.restant === 380_000,
    `utilisé=${apres.utilise} restant=${apres.restant}`
  );
  verifier(
    '2b. la valeur affichée change (jamais figée)',
    apres.restant !== initial.restant && apres.restant === apres.limite - apres.utilise
  );

  // 3. Traduction échouée → quota rendu, affichage restauré.
  await libererQuota(magasin, compte, 120_000, oct);
  const rendu = await lireQuotaRestant(magasin, compte, oct, limite);
  verifier(
    '3. libération : le restant remonte',
    rendu.utilise === 0 && rendu.restant === 500_000
  );

  // 4. Mois suivant : le compteur repart de zéro (ce que voit l’utilisateur
  //    le 1er du mois).
  const novembre = new Date('2026-11-02T00:00:00Z');
  const autreMois = await lireQuotaRestant(magasin, compte, novembre, limite);
  verifier(
    '4. mois civil suivant : restant plein à nouveau',
    autreMois.utilise === 0 && autreMois.restant === 500_000,
    `période ${autreMois.periode.debut} → ${autreMois.periode.fin}`
  );

  // 5. Une limite d'offre (Premium) est bien celle affichée.
  const premium = await lireQuotaRestant(magasin, compte, oct, 4_000_000);
  verifier(
    '5. plafond d’offre respecté dans l’affichage',
    premium.limite === 4_000_000 && premium.restant === 4_000_000
  );

  // 6. Robustesse : jamais de restant négatif (base incohérente).
  const incoherent = restantDe({ utilise: 600_000, limite: 500_000, periode: { debut: '2026-10-01', fin: '2026-10-31' } });
  verifier('6. restant jamais négatif', incoherent.restant === 0, `restant=${incoherent.restant}`);

  // 7. Périodes correctes (fin de mois 31/30/28).
  verifier(
    '7. bornes de période exactes',
    periodeMois(new Date('2026-10-15T00:00:00Z')).fin === '2026-10-31' &&
      periodeMois(new Date('2026-11-15T00:00:00Z')).fin === '2026-11-30' &&
      periodeMois(new Date('2027-02-15T00:00:00Z')).fin === '2027-02-28'
  );

  console.log(
    `\n${echecs === 0 ? '✓ Tous les tests passent' : `✗ ${echecs} test(s) en échec`} (7 groupes, magasin mémoire, aucune écriture en base)`
  );
  if (echecs > 0) process.exit(1);
}

principal().catch((e) => {
  console.error('Échec inattendu :', e);
  process.exit(1);
});

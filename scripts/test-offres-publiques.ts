// ============================================================
// Test — OFFRES PUBLIQUES (lot « offres visibles »).
// Usage : npx tsx scripts/test-offres-publiques.ts
//
// Prouve, en LISANT LA BASE RÉELLE (public.plans_abonnement) ET LE CODE
// (lib/plans-catalogue.ts + app/(public)/tarifs/page.tsx), l'égalité :
//
//   ce qui est AFFICHÉ sur /tarifs
//     == ce qui est ACHETABLE (tunnel /paiement/<code>)
//       == ce qui EXISTE en base (plans_abonnement).
//
// Notamment : les formules ANNUELLES `lecteur_annuel` (14 400 F) et
// `passionne_annuel` (33 600 F) — auparavant achetables par URL directe
// mais absentes de la grille — sont BIEN présentes, avec prix, durée
// (12 mois) et économie.
//
// Aucune écriture. Sortie : verdicts lisibles + code de sortie 1 si échec.
// ============================================================

import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import {
  COLONNES_PLAN,
  diagnostiquerAchat,
  estCodeIllimite,
  grillePubliqueDepuis,
  offresPubliquesDe,
  plansDepuisLignes,
  type CatalogueCatalogue,
  type LignePlanBase,
} from '../lib/plans-catalogue';
import { estPackCredits } from '../lib/abonnement';

// ------------------------------------------------------------
// Petite garde d'assertions
// ------------------------------------------------------------
let echecs = 0;
function verifier(nom: string, condition: boolean, detail = '') {
  if (!condition) {
    echecs += 1;
    console.error(`✗ ${nom}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`✓ ${nom}`);
  }
}

function lireEnvLocal(cle: string): string {
  const contenu = readFileSync('.env.local', 'utf8');
  const ligne = contenu.split('\n').find((l) => l.trim().startsWith(`${cle}=`));
  if (!ligne) throw new Error(`Clé ${cle} introuvable dans .env.local`);
  return ligne.split('=').slice(1).join('=').trim();
}

/** Remise annuelle en pour cent entier — MÊME formule que CarteOffre. */
function remisePourcent(prixMensuel: number, prixAnnuel: number): number {
  return Math.round((1 - prixAnnuel / (prixMensuel * 12)) * 100);
}

async function lireBase(): Promise<LignePlanBase[]> {
  const client = new Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.imbziizequckeaxuotdz',
    password: lireEnvLocal('SUPABASE_DB_PASSWORD'),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const { rows } = await client.query(
    `select ${COLONNES_PLAN} from public.plans_abonnement order by ordre, code`
  );
  await client.end();
  return rows as unknown as LignePlanBase[];
}

async function principal() {
  console.log('=== 0. Lecture de la base réelle (public.plans_abonnement) ===');
  const lignes = await lireBase();
  const catalogue: CatalogueCatalogue = {
    plans: plansDepuisLignes(lignes),
    packs: [],
    packsLus: false,
  };
  console.log(
    `   ${lignes.length} plans lus : ${catalogue.plans.map((p) => p.code).join(', ')}\n`
  );
  verifier('0.1 le catalogue lu contient 13 plans', catalogue.plans.length === 13, String(catalogue.plans.length));

  // ---- A. La grille publique dérivée de la base -------------------------
  console.log('\n=== A. Grille publique dérivée de la base ===');
  const grille = grillePubliqueDepuis(catalogue);
  const grilleCodes = new Set(grille.offres.map((o) => o.code));
  console.log(
    `   cartes affichées : ${grille.offres
      .map((o) => `${o.code}${o.annuel ? ` (+${o.annuel.code})` : ''}`)
      .join(', ')}`
  );

  // Every displayed card is free or purchasable.
  for (const o of grille.offres) {
    const plan = catalogue.plans.find((p) => p.code === o.code)!;
    const achetable = diagnostiquerAchat(o.code, catalogue).achetable;
    verifier(
      `A.1 ${o.code} : affichée ET (gratuite ou achetable)`,
      plan.prixXof === 0 || achetable,
      achetable ? '' : 'affichée mais NON achetable'
    );
    verifier(
      `A.2 ${o.code} : prix affiché == prix en base (${o.prixXof} F)`,
      o.prixXof === plan.prixXof && o.dureeJours === plan.dureeJours
    );
  }

  // ---- B. Toute formule achetable est affichée --------------------------
  console.log('\n=== B. Aucune formule achetable absente de la grille ===');
  const abonnements = catalogue.plans.filter((p) => !estPackCredits(p));
  const achetables = abonnements.filter(
    (p) => diagnostiquerAchat(p.code, catalogue).achetable
  );
  for (const p of achetables) {
    const affichee =
      grilleCodes.has(p.code) ||
      grille.offres.some((o) => o.annuel?.code === p.code);
    verifier(`B.1 ${p.code} (achetable) est présente dans la grille`, affichee);
  }
  // Symétrique : aucune formule payante NON achetable n'est affichée.
  for (const o of grille.offres) {
    const plan = catalogue.plans.find((p) => p.code === o.code)!;
    if (plan.prixXof > 0) {
      verifier(
        `B.2 ${o.code} : affichée payante ⇒ achetable`,
        diagnostiquerAchat(o.code, catalogue).achetable
      );
    }
  }

  // ---- C. Les deux formules ANNUELLES (cœur du lot) ---------------------
  console.log('\n=== C. Formules annuelles visibles (lecteur_annuel / passionne_annuel) ===');
  const lecteur = grille.offres.find((o) => o.code === 'lecteur_mensuel');
  const passionne = grille.offres.find((o) => o.code === 'passionne_mensuel');

  verifier('C.1 la carte Lecteur existe', !!lecteur);
  verifier('C.2 la carte Passionné existe', !!passionne);

  const cas: [string, typeof lecteur, number][] = [
    ['lecteur_annuel', lecteur, 14400],
    ['passionne_annuel', passionne, 33600],
  ];
  for (const [codeAnnuel, carte, prixAttendu] of cas) {
    const an = carte?.annuel;
    verifier(`C.3 ${codeAnnuel} : variante annuelle rattachée à sa carte mensuelle`, !!an && an.code === codeAnnuel);
    verifier(`C.4 ${codeAnnuel} : prix affiché = ${prixAttendu} F (base)`, an?.prixXof === prixAttendu, String(an?.prixXof));
    verifier(`C.5 ${codeAnnuel} : durée ≥ 360 j (12 mois)`, (an?.dureeJours ?? 0) >= 360, String(an?.dureeJours));
    verifier(`C.6 ${codeAnnuel} : achetable (tunnel /paiement/${codeAnnuel})`, diagnostiquerAchat(codeAnnuel, catalogue).achetable);
    const remise = carte && an ? remisePourcent(carte.prixXof, an.prixXof) : 0;
    verifier(`C.7 ${codeAnnuel} : économie calculée ≥ 10 %`, remise >= 10, `${remise} %`);
    // Cohérence période : prix annuel == prix mensuel équivalent × 12 (base).
    const ligne = lignes.find((l) => l.code === codeAnnuel)!;
    if (ligne.prix_mensuel_xof != null) {
      verifier(
        `C.8 ${codeAnnuel} : prix annuel == prix mensuel équivalent × 12`,
        ligne.prix_xof === ligne.prix_mensuel_xof * 12,
        `${ligne.prix_xof} vs ${ligne.prix_mensuel_xof}×12`
      );
    }
  }

  // ---- D. Non-régression : offresPubliquesDe inclut les annuelles -------
  console.log('\n=== D. offresPubliquesDe (l’incohérence corrigée) ===');
  const publiquesCodes = new Set(offresPubliquesDe(catalogue).map((p) => p.code));
  verifier('D.1 offresPubliquesDe inclut lecteur_annuel', publiquesCodes.has('lecteur_annuel'));
  verifier('D.2 offresPubliquesDe inclut passionne_annuel', publiquesCodes.has('passionne_annuel'));
  // Tri par ordre d'affichage conservé.
  const ordres = offresPubliquesDe(catalogue).map((p) => p.ordre);
  verifier(
    'D.3 tri par ordre d’affichage préservé',
    ordres.every((o, i) => i === 0 || ordres[i - 1] <= o),
    ordres.join(',')
  );
  // Les offres non achetables en ligne restent hors de la grille.
  for (const code of ['illimite_mensuel', 'illimite_annuel', 'etudiant_mensuel', 'groupe_mensuel', 'ecole_annuel', 'premium_mensuel', 'essai']) {
    const ligne = lignes.find((l) => l.code === code);
    if (!ligne) continue;
    const achetable = diagnostiquerAchat(code, catalogue).achetable;
    verifier(
      `D.4 ${code} : ${achetable ? 'achetable' : 'non achetable'} ⇒ ${achetable ? 'présente' : 'absente'} de la grille`,
      achetable ? grilleCodes.has(code) : !grilleCodes.has(code)
    );
  }
  verifier('D.5 aucun code Illimité ne figure dans la grille', ![...grilleCodes].some(estCodeIllimite));

  // ---- E. Le CODE de la page /tarifs rend bien cette grille -------------
  console.log('\n=== E. Le code de /tarifs câble la grille et le tunnel ===');
  const pageTarifs = readFileSync('app/(public)/tarifs/page.tsx', 'utf8');
  verifier('E.1 /tarifs importe grillePubliqueDepuis/grillePubliqueCourante', /grillePubliqueDepuis|grillePubliqueCourante/.test(pageTarifs));
  verifier('E.2 /tarifs rend <AbonnementTarifs', pageTarifs.includes('<AbonnementTarifs'));
  verifier('E.3 /tarifs ne contient plus le gabarit « Prix non encore fixé »', !pageTarifs.includes('Prix non encore fixé'));
  const carte = readFileSync('components/abonnement/CarteOffre.tsx', 'utf8');
  verifier('E.4 CarteOffre pointe le tunnel /paiement/<code>', carte.includes('`/paiement/${offre.code}`'));
  verifier('E.5 CarteOffre pointe la variante annuelle /paiement/<annuel.code>', carte.includes('`/paiement/${annuel.code}`'));
  const tunnel = readFileSync('app/paiement/[plan]/page.tsx', 'utf8');
  verifier('E.6 le tunnel lit la base et diagnostique l’achat', tunnel.includes('lireCatalogue') && tunnel.includes('diagnostiquerAchat'));

  // ---- F. Cohérence grille ↔ tunnel ↔ base (récapitulatif) --------------
  console.log('\n=== F. Récapitulatif : grille == achetable == base ===');
  const codesBase = new Set<string>(abonnements.map((p) => String(p.code)));
  for (const o of grille.offres) {
    verifier(`F.1 ${o.code} existe en base`, codesBase.has(o.code));
    if (o.annuel) verifier(`F.2 ${o.annuel.code} existe en base`, codesBase.has(o.annuel.code));
  }
  const tousAchetablablesAffiches = achetables.every(
    (p) => grilleCodes.has(p.code) || grille.offres.some((o) => o.annuel?.code === p.code)
  );
  verifier('F.3 chaque formule achetable de la base est affichée', tousAchetablablesAffiches);
  verifier(
    'F.4 toute carte payante affichée est achetable',
    grille.offres
      .filter((o) => o.prixXof > 0)
      .every((o) => diagnostiquerAchat(o.code, catalogue).achetable)
  );

  console.log(
    `\n${echecs === 0 ? '✓ Tous les verdicts passent' : `✗ ${echecs} verdict(s) en échec`}`
  );
  if (echecs > 0) process.exit(1);
}

principal().catch((e) => {
  console.error('ÉCHEC DU TEST :', e);
  process.exit(2);
});

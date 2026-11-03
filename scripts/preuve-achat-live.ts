// Preuve d'ACHAT LIVE, au plus près de ce que fait un client qui clique « Payer ».
// Reproduit exactement le corps de app/api/paiement/route.ts — mêmes classes,
// mêmes magasins Supabase, même fournisseur live — en sautant seulement la
// couche d'authentification Next (un cookie de session).
//
// Écrit une trace `en_attente` RÉELLE en base, crée une transaction RÉELLE chez
// FedaPay, puis SUPPRIME la trace de test (aucun franc débité : la transaction
// reste non payée et expire d'elle-même).
import { createClient } from '@supabase/supabase-js';

import { initierPaiement } from '../lib/paiement/service';
import {
  MagasinAbonnementSupabase,
  MagasinCreditsSupabase,
  MagasinPaiementSupabase,
} from '../lib/paiement/magasin';
import { fournisseurActif } from '../lib/paiement/fournisseur';

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const CLE = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE)!;
const BASE = process.env.SITE_URL ?? 'https://plumedombres.kodelyza.com';

// Compte de test (abonnement « essai » expiré) — jamais le compte de l'exploitant.
const PROPRIETAIRE = process.argv[2] ?? '04096074-3310-444f-9a64-0fb3841e3a88';

async function main() {
  const supabase = createClient(URL_SB, CLE, { auth: { persistSession: false } });
  const ctx = {
    magasinPaiement: new MagasinPaiementSupabase(supabase),
    magasinAbonnement: new MagasinAbonnementSupabase(supabase),
    magasinCredits: new MagasinCreditsSupabase(supabase),
    fournisseur: fournisseurActif(BASE),
    baseUrl: BASE,
  };

  console.log(`mode paiement : ${process.env.FEDAPAY_ENV} · fournisseur : ${ctx.fournisseur.nom}`);

  const resultat = await initierPaiement(ctx, {
    proprietaireId: PROPRIETAIRE,
    plan: 'credits_250', // 500 XOF — plus petit pack, montant minimum constatable
    telephone: '97000000',
    pays: 'bj',
    prenom: 'Preuve',
    nom: 'Lancement',
    email: 'preuve@plume-ombres.test',
  });

  const ligne = await ctx.magasinPaiement.lire(resultat.paiement.reference);
  const urlOk = /^https:\/\/process\.fedapay\.com\//.test(resultat.url);

  console.log(`reference interne : ${resultat.paiement.reference}`);
  console.log(`reference FedaPay  : ${resultat.paiement.reference_fournisseur ?? 'ABSENTE'}`);
  console.log(`trace en base     : ${ligne ? ligne.statut : 'AUCUNE'}`);
  console.log(`montant trace     : ${ligne?.montant} ${ligne?.devise}`);
  console.log(`url guichet       : ${urlOk ? 'process.fedapay.com OK' : resultat.url.slice(0, 40)}`);

  const toutBon =
    !!ligne &&
    ligne.statut === 'en_attente' &&
    !!ligne.reference_fournisseur &&
    !!ligne.url_paiement &&
    urlOk;

  // Nettoyage : la trace de test ne doit pas rester dans les paiements du site.
  const { error } = await supabase
    .from('paiements')
    .delete()
    .eq('reference', resultat.paiement.reference);
  console.log(`nettoyage        : ${error ? `ECHEC ${error.message}` : 'trace de test supprimee'}`);

  console.log(`\nACHAT_INITIABLE=${toutBon ? 'OUI' : 'NON'}`);
  process.exitCode = toutBon ? 0 : 1;
}

main().catch((erreur) => {
  console.error('ECHEC :', erreur instanceof Error ? erreur.message : erreur);
  process.exitCode = 1;
});

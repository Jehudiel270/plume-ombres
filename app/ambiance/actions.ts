'use server';

// ============================================================
// app/ambiance/actions.ts — Server action d'enregistrement de la
// fiche d'ambiance (F5). GARDES : session, module `ambiance`
// (verifierModuleApi — fermé → refus), propriété du livre par RLS.
// ============================================================

import { revalidatePath } from 'next/cache';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  analyserListe,
  enregistrerAmbiance,
  estIntensite,
  MAX_GENRES,
  MAX_TROPES,
} from '@/lib/ambiance';

export async function enregistrerFiche(
  formData: FormData
): Promise<{ ok: boolean; erreur?: string }> {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) return { ok: false, erreur: 'Non connecté.' };

  const client = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(client)
    .lire(utilisateur.id)
    .catch(() => null);
  const module = await verifierModuleApi('ambiance', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!module.ouvert) return { ok: false, erreur: 'Module fermé.' };

  const livreId = String(formData.get('livreId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(livreId)) {
    return { ok: false, erreur: 'Livre invalide.' };
  }

  const intensiteBrute = Number(formData.get('intensite'));
  const intensite = estIntensite(intensiteBrute) ? intensiteBrute : 3;

  try {
    await enregistrerAmbiance(client, {
      livreId,
      genres: analyserListe(String(formData.get('genres') ?? ''), MAX_GENRES),
      tropes: analyserListe(String(formData.get('tropes') ?? ''), MAX_TROPES),
      intensite,
    });
    revalidatePath('/ambiance');
    return { ok: true };
  } catch (erreur) {
    return {
      ok: false,
      erreur: erreur instanceof Error ? erreur.message : 'Enregistrement impossible.',
    };
  }
}

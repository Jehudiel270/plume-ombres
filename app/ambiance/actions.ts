'use server';

// ============================================================
// app/ambiance/actions.ts — Server action d'enregistrement de la
// fiche d'ambiance (F5 v2, fiche RICHE). GARDES : session, module
// `ambiance` (verifierModuleApi — fermé → refus), propriété du
// livre par RLS.
//
// Champs du cahier initial, tous plafonnés côté serveur :
//   socle  : genres, tropes, intensité (1 → 5) ;
//   riche  : palette de 5 couleurs nommées, atmosphère, ton,
//            rythme (niveau + libellé), promesses (une par ligne),
//            playlist nommée (pistes titre/humeur/minutes),
//            citation d'ouverture du chapitre 1, mots-clés.
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
  lignesListe,
  MAX_ATMOSPHERE,
  MAX_CITATION,
  MAX_GENRES,
  MAX_MOTS_CLES,
  MAX_PLAYLIST_NOM,
  MAX_PROMESSES,
  MAX_RYTHME_LABEL,
  MAX_TON,
  MAX_TROPES,
  nettoyerPalette,
  nettoyerPlaylist,
  propreTexteRiche,
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

  // Rythme : niveau 1 → 5 (ou vide = pas encore posé).
  const rythmeBrut = Number(formData.get('rythmeNiveau'));
  const rythmeNiveau = estIntensite(rythmeBrut) ? rythmeBrut : null;

  // Palette : JSON saisie par l'éditeur client ([{nom, hex}…]).
  let paletteBrute: unknown = [];
  try {
    paletteBrute = JSON.parse(String(formData.get('palette') ?? '[]'));
  } catch {
    paletteBrute = [];
  }

  // Playlist : JSON saisie par l'éditeur client ([{titre, humeur,
  // minutes}…]) ; le NOM de la playlist reste un texte à part.
  let playlistBrute: unknown = [];
  try {
    playlistBrute = JSON.parse(String(formData.get('playlist') ?? '[]'));
  } catch {
    playlistBrute = [];
  }

  try {
    await enregistrerAmbiance(client, {
      livreId,
      genres: analyserListe(String(formData.get('genres') ?? ''), MAX_GENRES),
      tropes: analyserListe(String(formData.get('tropes') ?? ''), MAX_TROPES),
      intensite,
      riche: {
        palette: nettoyerPalette(paletteBrute),
        atmosphere: propreTexteRiche(formData.get('atmosphere'), MAX_ATMOSPHERE),
        ton: propreTexteRiche(formData.get('ton'), MAX_TON),
        rythmeNiveau,
        rythmeLabel: propreTexteRiche(formData.get('rythmeLabel'), MAX_RYTHME_LABEL),
        promesses: lignesListe(formData.get('promesses'), MAX_PROMESSES),
        playlistNom: propreTexteRiche(formData.get('playlistNom'), MAX_PLAYLIST_NOM),
        playlist: nettoyerPlaylist(playlistBrute),
        citationOuverture: formData.get('citationOuverture') === null
          ? null
          : String(formData.get('citationOuverture'))
              .trim()
              .slice(0, MAX_CITATION) || null,
        motsCles: analyserListe(String(formData.get('motsCles') ?? ''), MAX_MOTS_CLES),
      },
    });
    revalidatePath('/ambiance');
    revalidatePath(`/ambiance/${livreId}`);
    return { ok: true };
  } catch (erreur) {
    return {
      ok: false,
      erreur: erreur instanceof Error ? erreur.message : 'Enregistrement impossible.',
    };
  }
}

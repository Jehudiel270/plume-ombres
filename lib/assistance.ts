// ============================================================
// lib/assistance.ts — Aide à la reprise (F10) et questions sur la
// lecture (F6). PANNEAU DU LECTEUR, réservé aux abonnés
// (interrupteur `reprise`, plan Passionné et au-delà).
//
// ANTI-SPOILERS PAR CONSTRUCTION : le contexte envoyé au modèle est
// construit ICI, côté serveur, avec les SEULS chapitres couverts par
// la position lue — le modèle ne reçoit jamais la suite, donc ne
// peut pas la révéler. Les questions ne sont pas conservées.
//
// Appel modèle : même clé, mêmes modèles et même délai que la
// traduction (lib/providers/gemini.ts), avec bascule de modèle sur
// indisponibilité. Résumé mis en cache par livre (resume_lectures).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  cleGemini,
  delaiModeleMs,
  modelesGemini,
} from '@/lib/providers/gemini';

/** Plafond de contexte envoyé au modèle (caractères) : les derniers
 *  chapitres lus priment (le début est résumé de mémoire du texte
 *  fourni — on garde la FIN, là où la lecture s'arrête). */
export const MAX_CONTEXTE_RESUME = 60_000;
export const MAX_CONTEXTE_QUESTION = 40_000;
export const MAX_QUESTION = 500;

/** Statuts de modèle qui déclenchent la bascule sur le suivant. */
function indisponible(statut: number): boolean {
  return statut === 404 || statut === 429 || statut === 503;
}

/**
 * Appel MODELE unique (one-shot) : instruction système + contenu.
 * Retourne le texte du modèle, bascule de modèle en cas d'erreur
 * 404/429/503 ou de silence (même logique que la traduction).
 */
export async function demanderModele(
  systeme: string,
  contenu: string,
  maxSortie = 1200
): Promise<string> {
  const cle = cleGemini();
  if (!cle) {
    throw new Error('Le modèle d’aide à la lecture n’est pas configuré.');
  }
  const corps = JSON.stringify({
    systemInstruction: { parts: [{ text: systeme }] },
    contents: [{ parts: [{ text: contenu }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: maxSortie },
  });

  const modeles = modelesGemini();
  let derniereErreur = '';
  for (let i = 0; i < modeles.length; i++) {
    const dernier = i === modeles.length - 1;
    let reponse: Response;
    const minuterie = new AbortController();
    const id = setTimeout(
      () => minuterie.abort(new DOMException('Modèle trop lent.', 'TimeoutError')),
      delaiModeleMs()
    );
    try {
      reponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modeles[i]}:generateContent?key=${cle}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: minuterie.signal, body: corps }
      );
    } catch (e) {
      const cause = e instanceof Error ? e.message : String(e);
      derniereErreur = `Le modèle n’a pas répondu (${modeles[i]}) : ${cause}`;
      if (!dernier) continue;
      throw new Error(derniereErreur);
    } finally {
      clearTimeout(id);
    }
    if (!reponse.ok) {
      const detail = (await reponse.text()).slice(0, 300);
      derniereErreur = `Le modèle a répondu ${reponse.status} (${modeles[i]}).`;
      if (indisponible(reponse.status) && !dernier) continue;
      throw new Error(derniereErreur);
    }
    const donnees = (await reponse.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const texte = donnees.candidates?.[0]?.content?.parts?.[0]?.text?.trimEnd();
    if (!texte) {
      derniereErreur = `Le modèle a renvoyé une réponse vide (${modeles[i]}).`;
      if (!dernier) continue;
      throw new Error(derniereErreur);
    }
    return texte;
  }
  throw new Error(derniereErreur || 'Le modèle est indisponible.');
}

/**
 * CONTEXTE LU (anti-spoilers) : texte traduit (repli : source) des
 * chapitres de position ≤ positionLue, plafonné — on garde la FIN
 * (la lecture s'arrête là). Retourne null si rien n'est lisible.
 */
export async function chargerContexteLu(
  client: SupabaseClient,
  livreId: string,
  positionLue: number | null,
  maxCaracteres: number
): Promise<{ contexte: string; chapitres: string[] } | null> {
  let requete = client
    .from('chapitres')
    .select('titre, position, texte_traduit, texte_source')
    .eq('livre_id', livreId)
    .order('position', { ascending: true })
    .limit(500);
  if (positionLue !== null) requete = requete.lte('position', positionLue);
  const { data, error } = await requete;
  if (error) throw new Error(error.message);

  const lignes = (data ?? []) as Array<{
    titre: string | null;
    position: number;
    texte_traduit: string | null;
    texte_source: string | null;
  }>;
  if (lignes.length === 0) return null;

  // De la fin vers le début : les derniers chapitres lus priment.
  const morceaux: string[] = [];
  const titres: string[] = [];
  let restant = maxCaracteres;
  for (let i = lignes.length - 1; i >= 0 && restant > 0; i--) {
    const c = lignes[i];
    const texte = (c.texte_traduit || c.texte_source || '').trim();
    if (!texte) continue;
    const tranche = texte.slice(0, restant);
    morceaux.unshift(`=== Chapitre ${c.position} — ${c.titre ?? 'sans titre'} ===\n${tranche}`);
    titres.unshift(`Chapitre ${c.position} — ${c.titre ?? 'sans titre'}`);
    restant -= tranche.length;
  }
  if (morceaux.length === 0) return null;
  return { contexte: morceaux.join('\n\n'), chapitres: titres };
}

export interface ResumeReprise {
  contenu: string;
  jusquPosition: number;
  enCache: boolean;
}

/**
 * RÉSUMÉ (F10) : cache lu d'abord — régénéré seulement si la lecture
 * a avancé. Le prompt interdit tout contenu au-delà du texte fourni
 * (double garde : le contexte NE CONTIENT déjà que le lu).
 */
export async function resumerReprise(
  client: SupabaseClient,
  livreId: string,
  positionLue: number | null
): Promise<ResumeReprise | null> {
  if (positionLue === null || positionLue <= 0) return null;

  const { data: cache } = await client
    .from('resume_lectures')
    .select('contenu, jusqu_position, titre_chapitre')
    .eq('livre_id', livreId)
    .maybeSingle();
  const existant = cache as {
    contenu: string;
    jusqu_position: number;
    titre_chapitre: string | null;
  } | null;
  if (existant && existant.jusqu_position >= positionLue) {
    return { contenu: existant.contenu, jusquPosition: existant.jusqu_position, enCache: true };
  }

  const contexte = await chargerContexteLu(client, livreId, positionLue, MAX_CONTEXTE_RESUME);
  if (!contexte) return null;

  const contenu = await demanderModele(
    'Tu résumes l’intrigue d’un roman pour un lecteur qui reprend sa lecture. ' +
      'Appuie-toi UNIQUEMENT sur le texte fourni : il ne couvre que ce que le ' +
      'lecteur a déjà lu — ne devine, n’ajoute et ne dévoile jamais la suite. ' +
      'Style : français précis, sobre, sans spoil, 150 mots au maximum, ' +
      'termine par une phrase « Vous en êtes à … » qui rappelle où la lecture ' +
      's’est arrêtée.',
    contexte.contexte,
    800
  );

  const dernierTitre = contexte.chapitres[contexte.chapitres.length - 1] ?? null;
  const { error } = await client.from('resume_lectures').upsert({
    livre_id: livreId,
    jusqu_position: positionLue,
    titre_chapitre: dernierTitre,
    contenu: contenu.slice(0, 8000),
    moteur: 'modele',
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return { contenu, jusquPosition: positionLue, enCache: false };
}

/**
 * QUESTION (F6) : répond en s'appuyant UNIQUEMENT sur les chapitres
 * lus. La garde est structurelle (contexte = lu) ; le prompt la
 * répète et impose la réponse « pas encore révélé » si besoin.
 */
export async function questionnerIntrigue(
  client: SupabaseClient,
  livreId: string,
  positionLue: number | null,
  question: string
): Promise<string> {
  const propre = (question ?? '').trim().slice(0, MAX_QUESTION);
  if (propre.length < 3) {
    throw new Error('Posez votre question en quelques mots.');
  }
  const contexte = await chargerContexteLu(
    client,
    livreId,
    positionLue,
    MAX_CONTEXTE_QUESTION
  );
  if (!contexte) {
    return 'Votre lecture n’a pas encore de texte à examiner : ouvrez et traduisez un chapitre, puis revenez.';
  }
  return demanderModele(
    'Tu réponds aux questions d’un lecteur sur un roman qu’il est en train de ' +
      'lire. Appuie-toi UNIQUEMENT sur le texte fourni : il ne couvre que ce ' +
      'que le lecteur a déjà lu. Si la réponse ne s’y trouve pas, réponds ' +
      'exactement : « Votre lecture ne l’a pas encore révélé. » — sans deviner, ' +
      'sans anticiper la suite, sans spoil. Réponds en français, en 3 phrases ' +
      'au maximum.',
    `${contexte.contexte}\n\n=== Question du lecteur ===\n${propre}`,
    600
  );
}

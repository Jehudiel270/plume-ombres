// ============================================================
// app/api/admin/chaine/route.ts — Ordre de la chaîne de traduction.
//
//   GET  → { priveStrict, ordreEffectif, ordreEditable, source,
//            catalogue, moteurs, moteurActif, … }
//   PUT  → { ordre: string[] } : enregistre un NOUVEL ordre persisté
//   POST → idem PUT (alias)
//
// GARDE SERVEUR : chaque méthode vérifie la permission
// `admin.tableau_de_bord.voir` via lib/roles-garde. L'interface ne
// fait que cacher/disable les commandes — la décision d'accès est
// prise ICI. (Une permission dédiée `admin.chaine.gerer` serait plus
// fine ; elle n'est pas introduite pour rester dans le périmètre de
// la migration/lot.)
//
// SOURCE DE VÉRITÉ de l'ordre : public.chaine_traduction_ordre
// (migration 20261006000001). Lecture via la lib lib/chaine-ordre
// (cache court), écriture via la RPC admin definir_ordre_chaine.
//
// MODE PRIVÉ STRICT : s'il est actif, l'ordre persisté est IGNORÉ au
// profit de la seule file auto-hébergée (verrou dans ordreSecours).
// La route le renvoie explicitement (priveStrict + ordreEffectif) et
// l'écriture est refusée côté serveur pour ne pas laisser croire à
// une prise d'effet trompeuse.
//
// Aucun nom de moteur n'est jamais renvoyé aux pages UTILISATEUR :
// cette route est réservée à l'espace admin.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { creerClientServeur } from '@/lib/supabase/server';
import { verifierPermission } from '@/lib/roles-garde';
import { verifierChaine } from '@/lib/providers/sante';
import {
  ordreSecours,
  modePriveStrict,
  nomFournisseurParId,
  fournisseurEstPrive,
  VAR_ORDRE,
} from '@/lib/providers/fallback';
import {
  chargerOrdrePersistant,
  ecrireOrdrePersistant,
  normaliserOrdre,
  IDS_CHAINE,
} from '@/lib/chaine-ordre';
import type { IdFournisseur } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Permission admin qui garde cette route (lecture ET écriture). */
const PERMISSION_CHAINE = 'admin.tableau_de_bord.voir' as const;

function reponseRefus(statut: number) {
  if (statut === 401) {
    return NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 });
  }
  return NextResponse.json(
    { erreur: 'Accès refusé : permission administrateur requise.' },
    { status: 403 }
  );
}

/** Complète un ordre partiel avec les moteurs manquants (ordre par défaut). */
function completerOrdre(ordre: readonly IdFournisseur[]): IdFournisseur[] {
  const complet = [...ordre];
  for (const id of IDS_CHAINE) {
    if (!complet.includes(id)) complet.push(id);
  }
  return complet;
}

/**
 * État complet de la chaîne : ordre persisté + ordre effectif réel +
 * santé sondée par moteur. Sert GET et la réponse après écriture.
 */
async function etatChaine() {
  // Lecture PERSISTÉE forcée (cache rafraîchi) : c'est l'ordre que
  // l'admin édite. `null` = aucun ordre enregistré en base.
  const persistant = await chargerOrdrePersistant(true);
  // Ordre EFFECTIF réel (privé strict > base > env > défaut).
  const ordreEffectif = ordreSecours();
  // Catalogue de TOUS les moteurs connus (pour l'éditeur, même hors
  // ordre effectif en mode privé strict).
  const catalogue = IDS_CHAINE.map((id) => ({
    id,
    nom: nomFournisseurParId(id),
    prive: fournisseurEstPrive(id),
  }));
  const source: 'base' | 'env' | 'defaut' = persistant
    ? 'base'
    : process.env[VAR_ORDRE]?.trim()
      ? 'env'
      : 'defaut';
  const ordreEditable = completerOrdre(
    persistant ?? (ordreEffectif.length > 0 ? ordreEffectif : [...IDS_CHAINE])
  );

  const sante = await verifierChaine();

  return {
    ok: true as const,
    priveStrict: sante.priveStrict,
    source,
    ordreEffectif,
    ordreEditable,
    catalogue,
    moteurs: sante.moteurs,
    moteurActif: sante.moteurActif,
    cacheMs: sante.cacheMs,
    horodatage: sante.horodatage,
  };
}

export async function GET() {
  const decision = await verifierPermission(PERMISSION_CHAINE);
  if (decision.statut !== 200) return reponseRefus(decision.statut);
  return NextResponse.json(await etatChaine());
}

/** Cœur commun de PUT/POST : valider puis persister le nouvel ordre. */
async function enregistrerOrdre(request: NextRequest) {
  const decision = await verifierPermission(PERMISSION_CHAINE);
  if (decision.statut !== 200) return reponseRefus(decision.statut);

  let corps: { ordre?: unknown };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }

  if (!Array.isArray(corps.ordre)) {
    return NextResponse.json(
      { erreur: 'Champ « ordre » attendu : un tableau d’identifiants de moteurs.' },
      { status: 400 }
    );
  }

  const normalise = normaliserOrdre(corps.ordre as unknown[]);
  if (normalise.length === 0) {
    return NextResponse.json(
      {
        erreur:
          'Ordre vide ou invalide : aucun moteur reconnu (attendu : libretranslate, gemini, google, mymemory).',
      },
      { status: 400 }
    );
  }

  // En mode privé strict, un ordre persisté n'a AUCUN effet (le verrou
  // prime). On refuse l'écriture pour ne pas tromper l'admin.
  if (modePriveStrict()) {
    return NextResponse.json(
      {
        erreur:
          'Mode privé strict actif : l’ordre de la chaîne ne peut pas être modifié (seule la file auto-hébergée est autorisée).',
        priveStrict: true,
      },
      { status: 409 }
    );
  }

  const supabase = await creerClientServeur();
  try {
    await ecrireOrdrePersistant(corps.ordre as unknown[], supabase);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue.';
    return NextResponse.json(
      { erreur: `Ordre non enregistré : ${message}` },
      { status: 502 }
    );
  }

  // Répond avec l'état à jour (ordre effectif inclus).
  return NextResponse.json(await etatChaine());
}

export async function PUT(request: NextRequest) {
  return enregistrerOrdre(request);
}

export async function POST(request: NextRequest) {
  return enregistrerOrdre(request);
}

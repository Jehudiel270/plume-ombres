// ============================================================
// app/api/livres/[id]/graphe/ia/route.ts — GÉNÉRATION IA DU
// GRAPHE NARRATIF (F25-IA).
//
//   POST { action: 'proposer', niveauDetail, chapitreLu }
//        → PROPOSITION (personnages, relations, événements)
//          calculée UNIQUEMENT sur les chapitres lus. Aucune écriture.
//   POST { action: 'appliquer', proposition }
//        → insertion VALIDÉE des éléments cochés par le propriétaire
//          (personnages d'abord, relations ensuite, événements enfin ;
//          les noms sont résolus vers les identifiants créés/connus).
//
// GARDES : session 401, interrupteur `graphe`, livre possédé (404).
// Le propriétaire seul génère et applique. Les CLÉS restent sur le
// serveur (réservoir « Clés API ») : le client n'en voit jamais la
// valeur, seulement le résultat.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierModuleApi } from '@/lib/fonctionnalites/etats';
import {
  planEnVigueur,
  CODE_PLAN_GRATUIT,
} from '@/lib/abonnement';
import { niveauPlanDepuisCode } from '@/lib/fonctionnalites/registre';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  ajouterEvenement,
  ajouterPersonnage,
  ajouterRelation,
  type GenreEvenement,
  type RoleGraphe,
  type SensRelation,
  type TypeRelation,
  type Fiabilite,
} from '@/lib/graphe';
import {
  analyserProposition,
  estNiveauDetail,
  genererPropositionGraphe,
  type NiveauDetailIa,
  type PropositionGraphe,
} from '@/lib/graphe-ia';

export const runtime = 'nodejs';
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function contexte() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) {
    return {
      ok: false as const,
      reponse: NextResponse.json({ erreur: 'Non connecté.' }, { status: 401 }),
    };
  }
  const client = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(client)
    .lire(utilisateur.id)
    .catch(() => null);
  const garde = await verifierModuleApi('graphe', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!garde.ouvert && garde.reponseApi) {
    return { ok: false as const, reponse: garde.reponseApi };
  }
  return {
    ok: true as const,
    client,
    utilisateurId: utilisateur.id,
    plan: planEnVigueur(abonnement),
  };
}

/** Renumérote un rôle reçu du client vers une valeur sûre. */
function roleSur(v: unknown): RoleGraphe {
  return typeof v === 'string' &&
    ['protagoniste', 'antagoniste', 'allie', 'secondaire', 'autre'].includes(v)
    ? (v as RoleGraphe)
    : 'secondaire';
}
function typeSur(v: unknown): TypeRelation {
  const ok = [
    'famille', 'amitie', 'alliance', 'rivalite', 'amour',
    'hierarchie', 'dette', 'mefiance', 'trahison', 'secret', 'autre',
  ];
  return typeof v === 'string' && ok.includes(v) ? (v as TypeRelation) : 'autre';
}
function sensSur(v: unknown): SensRelation {
  return typeof v === 'string' && ['ab', 'ba', 'both', 'none'].includes(v)
    ? (v as SensRelation)
    : 'none';
}
function fiabiliteSure(v: unknown): Fiabilite {
  return typeof v === 'string' && ['fait', 'deduction', 'hypothese', 'incertain'].includes(v)
    ? (v as Fiabilite)
    : 'fait';
}
function genreSur(v: unknown): GenreEvenement {
  const ok = ['rencontre', 'alliance', 'rupture', 'confiance', 'revelation', 'etat'];
  return typeof v === 'string' && ok.includes(v) ? (v as GenreEvenement) : 'etat';
}

/** Texte propre et borné (null si vide). */
function texte(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Position entière bornée (1..5000), sinon null. */
function position(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 5000) return null;
  return n;
}

/** Normalise une proposition reçue du client (défense en profondeur). */
function propositionBrute(brut: unknown): PropositionGraphe | null {
  if (!brut || typeof brut !== 'object') return null;
  const p = brut as Record<string, unknown>;
  const personnages: PropositionGraphe['personnages'] = [];
  const vus = new Set<string>();
  if (Array.isArray(p.personnages)) {
    for (const x of p.personnages as Record<string, unknown>[]) {
      if (!x || typeof x !== 'object') continue;
      const nom = texte(x.nom, 120);
      if (!nom || vus.has(nom.toLowerCase())) continue;
      vus.add(nom.toLowerCase());
      const importance = Number(x.importance);
      personnages.push({
        nom,
        role: roleSur(x.role),
        importance:
          importance === 1 || importance === 2 || importance === 3 ? importance : 2,
        description: texte(x.description, 2000),
        premierePosition: position(x.premierePosition),
      });
    }
  }
  if (personnages.length === 0) return null;
  const relations: PropositionGraphe['relations'] = [];
  if (Array.isArray(p.relations)) {
    for (const r of p.relations as Record<string, unknown>[]) {
      if (!r || typeof r !== 'object') continue;
      const nomOrigine = texte(r.nomOrigine, 120);
      const nomDestination = texte(r.nomDestination, 120);
      if (!nomOrigine || !nomDestination) continue;
      if (nomOrigine.toLowerCase() === nomDestination.toLowerCase()) continue;
      if (!vus.has(nomOrigine.toLowerCase()) || !vus.has(nomDestination.toLowerCase())) continue;
      relations.push({
        nomOrigine,
        nomDestination,
        libelle: texte(r.libelle, 160) ?? 'lié à',
        type: typeSur(r.type),
        sens: sensSur(r.sens),
        intensite: Math.max(1, Math.min(5, Math.round(Number(r.intensite)) || 2)),
        etat: texte(r.etat, 160),
        fiabilite: fiabiliteSure(r.fiabilite),
        premierePosition: position(r.premierePosition),
      });
    }
  }
  const evenements: PropositionGraphe['evenements'] = [];
  if (Array.isArray(p.evenements)) {
    for (const e of p.evenements as Record<string, unknown>[]) {
      if (!e || typeof e !== 'object') continue;
      const titre = texte(e.titre, 160);
      const pos = position(e.position);
      if (!titre || !pos) continue;
      const noms = Array.isArray(e.personnages)
        ? (e.personnages as unknown[])
            .map((n) => texte(n, 120))
            .filter((n): n is string => !!n && vus.has(n.toLowerCase()))
            .slice(0, 12)
        : [];
      evenements.push({
        position: pos,
        genre: genreSur(e.genre),
        titre,
        texte: texte(e.texte, 800),
        personnages: [...new Set(noms)],
      });
    }
  }
  return {
    personnages,
    relations,
    evenements,
    jusquPosition: Math.max(1, Number(p.jusquPosition) || 1),
    niveauDetail: estNiveauDetail(p.niveauDetail) ? p.niveauDetail : 'detaille',
  };
}

/** Chapitre id par position (pour les événements et apparitions). */
async function chapitreParPosition(
  client: Awaited<ReturnType<typeof creerClientServeur>>,
  livreId: string
): Promise<Map<number, string>> {
  const { data } = await client
    .from('chapitres')
    .select('id, position')
    .eq('livre_id', livreId)
    .order('position', { ascending: true });
  const liste = (data ?? []) as Array<{ id: string; position: number }>;
  return new Map(liste.map((c) => [c.position, c.id]));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const ctx = await contexte();
  if (!ctx.ok) return ctx.reponse;
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ erreur: 'Livre invalide.' }, { status: 400 });
  }

  // Le livre doit appartenir au compte (génération + application).
  const { data: livre } = await ctx.client
    .from('livres')
    .select('id, proprietaire_id')
    .eq('id', id)
    .maybeSingle();
  if (!livre || (livre as { proprietaire_id: string }).proprietaire_id !== ctx.utilisateurId) {
    return NextResponse.json({ erreur: 'Livre introuvable.' }, { status: 404 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erreur: 'JSON invalide.' }, { status: 400 });
  }
  const action = typeof corps.action === 'string' ? corps.action : '';

  // ---------- 1) PROPOSER ----------
  if (action === 'proposer') {
    const niveauDetail: NiveauDetailIa = estNiveauDetail(corps.niveauDetail)
      ? corps.niveauDetail
      : 'detaille';
    const chapitreLuBrut = Number(corps.chapitreLu);
    const chapitreLu =
      Number.isInteger(chapitreLuBrut) && chapitreLuBrut >= 1 ? chapitreLuBrut : 0;
    if (chapitreLu < 1) {
      return NextResponse.json(
        { erreur: 'Indiquez le chapitre jusqu’auquel analyser (au moins 1).' },
        { status: 422 }
      );
    }
    try {
      const { proposition, chapitresAnalyse } = await genererPropositionGraphe(
        ctx.client,
        id,
        chapitreLu,
        niveauDetail,
        ctx.plan ? niveauPlanDepuisCode(ctx.plan) : null
      );
      return NextResponse.json({
        ok: true,
        proposition,
        chapitresAnalyse,
      });
    } catch (erreur) {
      const message =
        erreur instanceof Error ? erreur.message : 'La génération a échoué.';
      const statut = /n’est pas configuré|aucune clé/i.test(message) ? 503 : 400;
      return NextResponse.json({ erreur: message }, { status: statut });
    }
  }

  // ---------- 2) APPLIQUER ----------
  if (action === 'appliquer') {
    const proposition = propositionBrute(corps.proposition);
    if (!proposition) {
      return NextResponse.json({ erreur: 'Proposition vide ou invalide.' }, { status: 422 });
    }

    // Cohérence anti-spoilers : aucun événement d'un chapitre non lu.
    const plafond = proposition.jusquPosition;
    for (const e of proposition.evenements) {
      if (e.position > plafond) {
        return NextResponse.json(
          { erreur: 'La proposition cite un chapitre non lu : refusez-la et régénérez-la.' },
          { status: 422 }
        );
      }
    }

    const positions = await chapitreParPosition(ctx.client, id);

    // Personnages existants (éviter les doublons de noms).
    const { data: existants } = await ctx.client
      .from('graphe_personnages')
      .select('id, nom')
      .eq('livre_id', id);
    const connus = new Map<string, string>();
    for (const p of (existants ?? []) as Array<{ id: string; nom: string }>) {
      connus.set(p.nom.trim().toLowerCase(), p.id);
    }

    let personnagesAjoutes = 0;
    let relationsAjoutees = 0;
    let evenementsAjoutes = 0;
    const idParNom = new Map<string, string>(connus);

    try {
      // a) Personnages (création ou réutilisation d'un homonyme).
      for (const p of proposition.personnages) {
        const cle = p.nom.toLowerCase();
        if (idParNom.has(cle)) continue;
        const chapitreId =
          p.premierePosition !== null ? positions.get(p.premierePosition) ?? null : null;
        await ajouterPersonnage(ctx.client, {
          livreId: id,
          nom: p.nom,
          role: p.role,
          importance: p.importance,
          description: p.description,
          premiereChapitreId: chapitreId,
        });
        // Retrouver l'id créé (par nom — le graphe du livre est petit).
        const { data: cree } = await ctx.client
          .from('graphe_personnages')
          .select('id')
          .eq('livre_id', id)
          .ilike('nom', p.nom)
          .limit(1)
          .maybeSingle();
        const nouvelId = (cree as { id: string } | null)?.id;
        if (nouvelId) {
          idParNom.set(cle, nouvelId);
          personnagesAjoutes += 1;
        }
      }

      // b) Relations (les deux extrémités doivent exister).
      for (const r of proposition.relations) {
        const origineId = idParNom.get(r.nomOrigine.toLowerCase());
        const destinationId = idParNom.get(r.nomDestination.toLowerCase());
        if (!origineId || !destinationId || origineId === destinationId) continue;
        const chapitreId =
          r.premierePosition !== null ? positions.get(r.premierePosition) ?? null : null;
        try {
          await ajouterRelation(ctx.client, {
            livreId: id,
            origineId,
            destinationId,
            libelle: r.libelle,
            type: r.type,
            sens: r.sens,
            intensite: r.intensite,
            etat: r.etat,
            fiabilite: r.fiabilite,
            premiereChapitreId: chapitreId,
          });
          relationsAjoutees += 1;
        } catch {
          // Une relation dupliquée ou refusée ne bloque pas le lot.
        }
      }

      // c) Événements (chapitre résolu + personnages connus).
      for (const e of proposition.evenements) {
        const chapitreId = positions.get(e.position);
        if (!chapitreId) continue;
        const ids = e.personnages
          .map((n) => idParNom.get(n.toLowerCase()))
          .filter((x): x is string => !!x);
        try {
          await ajouterEvenement(ctx.client, {
            livreId: id,
            chapitreId,
            genre: e.genre,
            titre: e.titre,
            texte: e.texte,
            relationId: null,
            personnageIds: ids,
          });
          evenementsAjoutes += 1;
        } catch {
          // Idem : un événement raté ne bloque pas le lot.
        }
      }

      return NextResponse.json({
        ok: true,
        personnagesAjoutes,
        relationsAjoutees,
        evenementsAjoutes,
      });
    } catch (erreur) {
      return NextResponse.json(
        {
          erreur:
            erreur instanceof Error
              ? `Application interrompue : ${erreur.message}`
              : 'Application interrompue.',
        },
        { status: 400 }
      );
    }
  }

  // ---------- 3) ANALYSER (parse d'une réponse modèle, sans réseau) ----------
  if (action === 'analyser') {
    const reponse = typeof corps.reponse === 'string' ? corps.reponse : '';
    const jusqu = Math.max(1, Number(corps.jusquPosition) || 1);
    const niveau: NiveauDetailIa = estNiveauDetail(corps.niveauDetail)
      ? corps.niveauDetail
      : 'detaille';
    const proposition = analyserProposition(reponse, jusqu, niveau, 500);
    if (!proposition) {
      return NextResponse.json({ erreur: 'Réponse non exploitable.' }, { status: 422 });
    }
    return NextResponse.json({ ok: true, proposition });
  }

  return NextResponse.json({ erreur: 'Action inconnue.' }, { status: 422 });
}

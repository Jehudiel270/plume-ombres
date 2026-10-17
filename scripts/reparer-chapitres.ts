// ============================================================
// reparer-chapitres.ts — Répare le découpage d'un livre DÉJÀ importé.
//
// Un livre importé avant la correction du détecteur peut contenir deux
// séries de chapitres entremêlées (vrais chapitres + fragments parasites
// de 21 à 215 caractères créés par les pages de filigrane / numéros).
// Ce script fusionne les chapitres parasites dans leur voisin et
// renumérote les positions (chapitres ET segments) dans l'ordre.
//
// MODE LECTURE PAR DÉFAUT : sans --appliquer, RIEN n'est écrit ; le
// script affiche exactement ce qu'il ferait (avant / après).
//
// Refus d'écriture : si un chapitre à fusionner contient des segments
// déjà traduits (statut 'fait') ou un texte traduit, le script s'arrête.
// Relancer avec --autoriser-traduits pour passer outre (les segments
// sont DÉPLACÉS, pas supprimés : aucune traduction n'est perdue).
//
// Usage :
//   npx tsx scripts/reparer-chapitres.ts <id-du-livre> [--appliquer]
//                                        [--autoriser-traduits] [--aide]
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { Client } from 'pg';
import {
  estContenuDeChapitre,
  longueurUtile,
  MIN_CARACTERES_CHAPITRE,
  seuilContenuChapitre,
} from '../lib/segmenter';

// ------------------------------------------------------------
// Connexion (mêmes variables que les scripts d'inspection)
// ------------------------------------------------------------

function lireEnv(cle: string): string {
  if (process.env[cle]) return process.env[cle] as string;
  try {
    const contenu = readFileSync('.env.local', 'utf8');
    const ligne = contenu
      .split('\n')
      .find((l) => l.trim().startsWith(`${cle}=`));
    if (!ligne) return '';
    return ligne.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  } catch {
    return '';
  }
}

function creerClient(): Client {
  const ref = lireEnv('SUPABASE_PROJECT_REF') || extraireRef(lireEnv('SUPABASE_DB_HOST'));
  const motDePasse = lireEnv('SUPABASE_DB_PASSWORD');
  if (!motDePasse) {
    throw new Error(
      'SUPABASE_DB_PASSWORD introuvable (variables d’environnement ou .env.local).'
    );
  }
  const port = Number(lireEnv('SUPABASE_DB_PORT') || 5432);
  const base = lireEnv('SUPABASE_DB_NAME') || 'postgres';
  const utilisateur = lireEnv('SUPABASE_DB_USER') || (ref ? `postgres.${ref}` : 'postgres');
  const hote = lireEnv('SUPABASE_DB_POOLER_HOST') || 'aws-1-eu-west-1.pooler.supabase.com';
  // `db.<ref>.supabase.co` n'est joignable qu'en IPv6 : on passe par le
  // pooler (mêmes identifiants, utilisateur `postgres.<ref>`).
  const direct = lireEnv('SUPABASE_DB_DIRECT') === '1' ? lireEnv('SUPABASE_DB_HOST') : '';
  return new Client({
    host: direct || hote,
    port,
    user: utilisateur,
    password: motDePasse,
    database: base,
    ssl: { rejectUnauthorized: false },
  });
}

/** Référence du projet déduite de l'hôte (db.<ref>.supabase.co). */
function extraireRef(hote: string): string {
  const m = hote.match(/^(?:db\.)?([a-z0-9]{20})\.supabase\.co$/i);
  if (m) return m[1];
  const p = hote.match(/postgres\.([a-z0-9]{20})$/i);
  return p ? p[1] : '';
}

// ------------------------------------------------------------
// Modèle lu en base
// ------------------------------------------------------------

interface SegmentDb {
  id: string;
  position: number;
  source: string;
  statut: string;
}

interface ChapitreDb {
  id: string;
  position: number;
  titre: string;
  statut: string;
  texte_traduit: string | null;
  segments: SegmentDb[];
  /** Somme des longueurs de segments (≈ taille du chapitre). */
  caracteres: number;
  /** Texte utile pour la décision (sources concaténées). */
  texte: string;
}

interface Groupe {
  /** Chapitre conservé (celui qui porte le titre). */
  cible: ChapitreDb;
  /** Chapitres parasites rattachés à la cible. */
  absorbes: ChapitreDb[];
}

/** Titre de secours attribué quand le fichier ne fournissait aucun titre. */
const TITRE_PLACEHOLDER = /^Chapitre \d+$/;

interface LigneChapitre {
  id: string;
  position: number;
  titre: string;
  statut: string;
  texte_traduit: string | null;
}

interface LigneSegment {
  id: string;
  chapitre_id: string;
  position: number;
  source: string;
  statut: string;
}

async function lireLivre(pg: Client, id: string) {
  const livre = await pg.query<{ id: string; titre: string; nom_fichier: string | null }>(
    'select id, titre, nom_fichier from livres where id = $1',
    [id]
  );
  if (livre.rows.length === 0) throw new Error(`Aucun livre avec l’id ${id}.`);

  const chapitres = await pg.query<LigneChapitre>(
    `select id, position, titre, statut, texte_traduit
       from chapitres where livre_id = $1 order by position asc`,
    [id]
  );
  const segments = await pg.query<LigneSegment>(
    `select s.id, s.chapitre_id, s.position, s.source, s.statut
       from segments s
       join chapitres c on c.id = s.chapitre_id
      where c.livre_id = $1
      order by c.position asc, s.position asc`,
    [id]
  );

  const parChapitre = new Map<string, SegmentDb[]>();
  for (const s of segments.rows) {
    const liste = parChapitre.get(s.chapitre_id) ?? [];
    liste.push({ id: s.id, position: s.position, source: s.source, statut: s.statut });
    parChapitre.set(s.chapitre_id, liste);
  }

  const modeles: ChapitreDb[] = chapitres.rows.map((c) => {
    const segs = parChapitre.get(c.id) ?? [];
    return {
      id: c.id,
      position: c.position,
      titre: c.titre,
      statut: c.statut,
      texte_traduit: c.texte_traduit,
      segments: segs,
      caracteres: segs.reduce((n, s) => n + s.source.length, 0),
      texte: segs.map((s) => s.source).join('\n\n'),
    };
  });

  return { livre: livre.rows[0], chapitres: modeles };
}

// ------------------------------------------------------------
// Plan de fusion
// ------------------------------------------------------------

function construirePlan(chapitres: ChapitreDb[]): { groupes: Groupe[]; seuil: number } {
  const seuil = seuilContenuChapitre(chapitres.map((c) => longueurUtile(c.texte)));
  const groupes: Groupe[] = [];
  let enAttente: ChapitreDb[] = [];

  const estParasite = (c: ChapitreDb): boolean => {
    if (!estContenuDeChapitre(c.texte, seuil)) return true;
    // Titre de secours (« Chapitre N » faute de titre dans le fichier) ET
    // contenu sous le seuil : c'est une page de garde / de service.
    return (
      TITRE_PLACEHOLDER.test(c.titre.trim()) && longueurUtile(c.texte) < MIN_CARACTERES_CHAPITRE
    );
  };

  for (const chapitre of chapitres) {
    if (!estParasite(chapitre)) {
      const groupe: Groupe = { cible: chapitre, absorbes: [...enAttente] };
      enAttente = [];
      groupes.push(groupe);
    } else if (groupes.length > 0) {
      groupes[groupes.length - 1].absorbes.push(chapitre);
    } else {
      // En tête de livre : on attend le premier chapitre valide pour
      // rattacher la page de garde au SUIVANT (rien en arrière).
      enAttente.push(chapitre);
    }
  }

  if (enAttente.length > 0 && groupes.length > 0) {
    groupes[groupes.length - 1].absorbes.push(...enAttente);
  }

  return { groupes, seuil };
}

function resume(groupes: Groupe[]): { chapitres: number; caracteres: number } {
  return {
    chapitres: groupes.length,
    // Les segments des chapitres absorbés sont DÉPLACÉS, pas supprimés :
    // le total doit rester identique avant / après.
    caracteres: groupes.reduce(
      (n, g) => n + g.cible.caracteres + g.absorbes.reduce((m, a) => m + a.caracteres, 0),
      0
    ),
  };
}

function formater(n: number): string {
  return n.toLocaleString('fr-FR');
}

// ------------------------------------------------------------
// Écriture (transaction)
// ------------------------------------------------------------

async function appliquer(pg: Client, livreId: string, groupes: Groupe[]): Promise<void> {
  const absorbes = groupes.flatMap((g) => g.absorbes);
  // Correspondance chapitre parasite → chapitre conservé, passée en JSONB
  // (une seule requête, pas 6 000 aller-retours vers le pooler).
  const correspondance = JSON.stringify(
    groupes.flatMap((g) => g.absorbes.map((a) => ({ old: a.id, new: g.cible.id })))
  );

  await pg.query('begin');
  try {
    // Échoue vite si une traduction en cours verrouille les segments.
    await pg.query("set local lock_timeout = '10s'");

    // 1. Déplacement des segments ET renumérotation en un seul passage.
    //    Ordre de lecture = position du chapitre d'origine, puis position
    //    du segment. Les positions finales sont d'abord posées en négatif
    //    (contrainte unique (chapitre_id, position)), puis remises à 0..n.
    const deplace = await pg.query(
      `with f as (
         select (j->>'old')::uuid as old_id, (j->>'new')::uuid as new_id
           from jsonb_array_elements($2::jsonb) j
       ), base as (
         select s.id,
                coalesce(f.new_id, s.chapitre_id) as cible,
                c.position as ordre_chapitre,
                s.position as ordre_segment
           from segments s
           join chapitres c on c.id = s.chapitre_id
           left join f on f.old_id = s.chapitre_id
          where c.livre_id = $1
       ), rangs as (
         select id, cible,
                row_number() over (
                  partition by cible
                  order by ordre_chapitre asc, ordre_segment asc
                ) - 1 as rang
           from base
       )
       update segments s
          set chapitre_id = r.cible,
              position = -(r.rang + 1)
         from rangs r
        where s.id = r.id`,
      [livreId, correspondance]
    );
    await pg.query(
      `update segments set position = -position - 1
        where chapitre_id in (select id from chapitres where livre_id = $1)`,
      [livreId]
    );
    await pg.query(
      `delete from chapitres
        where id in (select (j->>'old')::uuid from jsonb_array_elements($1::jsonb) j)`,
      [correspondance]
    );

    // 2. Renumérotation des chapitres (positions négatives puis 0..n).
    await pg.query('update chapitres set position = -(position + 1) where livre_id = $1', [livreId]);
    await pg.query(
      `update chapitres c
          set position = o.rang, updated_at = now()
         from (
           select id, row_number() over (order by position desc) - 1 as rang
             from chapitres where livre_id = $1
         ) o
        where c.id = o.id`,
      [livreId]
    );

    // 3. Statut de chaque chapitre recalculé sur ses segments.
    await pg.query(
      `update chapitres c
          set statut = case
                when a.total = a.faits then 'traduit'
                when a.faits > 0 or a.encours > 0 then 'en_traduction'
                else 'a_traduire'
              end
         from (
           select chapitre_id,
                  count(*) as total,
                  count(*) filter (where statut = 'fait') as faits,
                  count(*) filter (where statut = 'en_cours') as encours
             from segments
            group by chapitre_id
         ) a
        where c.id = a.chapitre_id and c.livre_id = $1`,
      [livreId]
    );

    if (deplace.rowCount === 0 && absorbes.length > 0) {
      throw new Error('Aucun segment déplacé : structure inattendue, rien n’a été écrit.');
    }

    await pg.query('commit');
  } catch (erreur) {
    await pg.query('rollback');
    throw erreur;
  }
}

// ------------------------------------------------------------
// Programme
// ------------------------------------------------------------

function aide(): void {
  console.log(
    [
      'Réparation du découpage en chapitres d’un livre importé.',
      '',
      'Usage : npx tsx scripts/reparer-chapitres.ts <id-du-livre> [options]',
      '',
      '  (défaut)             mode LECTURE : aucune écriture, plan affiché',
      '  --appliquer          applique le plan (transactionnel)',
      '  --autoriser-traduits passe outre le refus si des segments déjà',
      '                       traduits (statut « fait ») sont concernés',
      '  --aide               affiche cette aide',
      '',
      `Seuil de contenu d’un chapitre : ${MIN_CARACTERES_CHAPITRE} caractères`,
      '(abaissé à la moitié de la médiane pour un livre de chapitres courts).',
    ].join('\n')
  );
}

async function principal(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--aide') || args.length === 0) {
    aide();
    return;
  }
  const id = args.find((a) => !a.startsWith('--'));
  if (!id) {
    aide();
    process.exitCode = 1;
    return;
  }
  const appliquerDemande = args.includes('--appliquer');
  const autoriserTraduits = args.includes('--autoriser-traduits');

  const pg = creerClient();
  await pg.connect();
  try {
    const { livre, chapitres } = await lireLivre(pg, id);
    if (chapitres.length === 0) {
      console.log('Ce livre n’a aucun chapitre : rien à réparer.');
      return;
    }

    const { groupes, seuil } = construirePlan(chapitres);
    const avant = {
      chapitres: chapitres.length,
      caracteres: chapitres.reduce((n, c) => n + c.caracteres, 0),
    };
    const apres = resume(groupes);

    console.log(`Livre      : ${livre.titre}`);
    if (livre.nom_fichier) console.log(`Fichier    : ${livre.nom_fichier}`);
    console.log(`Identifiant: ${livre.id}`);
    console.log(
      `Seuil      : ${seuil} car. (médiane des chapitres ${formater(
        Math.round(chapitres.reduce((n, c) => n + c.caracteres, 0) / chapitres.length)
      )} car.)`
    );
    console.log('');
    console.log(
      `AVANT : ${formater(avant.chapitres)} chapitres | ${formater(avant.caracteres)} caractères`
    );
    console.log(
      `APRÈS : ${formater(apres.chapitres)} chapitres | ${formater(apres.caracteres)} caractères` +
        ` (${formater(avant.chapitres - apres.chapitres)} fusion(s))`
    );

    const absorbes = groupes.flatMap((g) => g.absorbes);
    if (absorbes.length === 0) {
      console.log('\nAucun chapitre parasite : rien à faire.');
      console.log(appliquerDemande ? '(rien n’a été écrit)' : '(mode lecture : rien n’a été écrit)');
      return;
    }

    console.log('\nFusions prévues (chapitre parasite → chapitre conservé) :');
    for (const groupe of groupes) {
      for (const absorbé of groupe.absorbes) {
        console.log(
          `  pos ${String(absorbé.position).padStart(3)} « ${absorbé.titre.slice(0, 32).padEnd(32)} »` +
            ` ${String(formater(absorbé.caracteres)).padStart(7)} car.` +
            ` → pos ${String(groupe.cible.position).padStart(3)} « ${groupe.cible.titre.slice(0, 40)} »`
        );
      }
    }

    // Garde-fou : traductions déjà faites dans les chapitres supprimés.
    const traduits = absorbes.filter(
      (c) =>
        (c.texte_traduit ?? '').trim().length > 0 ||
        c.segments.some((s) => s.statut === 'fait')
    );

    if (traduits.length > 0) {
      console.log(
        `\n⚠ ${traduits.length} chapitre(s) à fusionner contiennent des traductions ` +
          `(statut « fait » ou texte traduit) :`
      );
      for (const c of traduits.slice(0, 10)) {
        const faits = c.segments.filter((s) => s.statut === 'fait').length;
        console.log(
          `  · « ${c.titre.slice(0, 40)} » (pos ${c.position}) — ${faits}/${c.segments.length} segment(s) traduit(s)`
        );
      }
      if (!autoriserTraduits) {
        console.log(
          '\nÉCRITURE REFUSÉE : les segments seraient déplacés (aucune traduction perdue),\n' +
            'mais les lignes de chapitres supprimées emportent leur texte traduit.\n' +
            'Relancer avec --autoriser-traduits pour confirmer explicitement.'
        );
        process.exitCode = appliquerDemande ? 2 : 0;
        return;
      }
      console.log(
        '\n--autoriser-traduits fourni : les segments traduits seront déplacés, pas supprimés.'
      );
    }

    if (!appliquerDemande) {
      console.log(
        '\nMODE LECTURE : aucune écriture. Relancer avec --appliquer pour exécuter ce plan.'
      );
      return;
    }

    // Sauvegarde de la structure avant écriture (réversible).
    const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
    const sauvegarde = `${process.env.TEMP ?? process.env.TMP ?? '.'}/reparation-chapitres-${livre.id}-${horodatage}.json`;
    writeFileSync(
      sauvegarde,
      JSON.stringify(
        {
          livre: { id: livre.id, titre: livre.titre },
          chapitres: chapitres.map((c) => ({
            id: c.id,
            position: c.position,
            titre: c.titre,
            statut: c.statut,
          })),
          segments: chapitres.flatMap((c) =>
            c.segments.map((s) => ({ id: s.id, chapitre_id: c.id, position: s.position }))
          ),
          plan: groupes.map((g) => ({
            cible: g.cible.id,
            absorbes: g.absorbes.map((a) => a.id),
          })),
        },
        null,
        2
      ),
      'utf8'
    );
    console.log(`\nSauvegarde de la structure : ${sauvegarde}`);

    await appliquer(pg, livre.id, groupes);

    // Vérification après écriture (relecture réelle de la base).
    const relu = await lireLivre(pg, livre.id);
    const apresReel = {
      chapitres: relu.chapitres.length,
      caracteres: relu.chapitres.reduce((n, c) => n + c.caracteres, 0),
      positions: relu.chapitres.every((c, i) => c.position === i),
      segmentsOrphelins: 0,
    };
    console.log(
      `\nAPPLIQUÉ : ${formater(apresReel.chapitres)} chapitres | ${formater(apresReel.caracteres)} caractères` +
        ` | positions renumérotées 0..${apresReel.chapitres - 1} : ${apresReel.positions ? 'oui' : 'NON'}`
    );
    console.log(
      apresReel.caracteres === avant.caracteres
        ? 'Caractères : aucun segment perdu.'
        : `Caractères : ÉCART de ${formater(apresReel.caracteres - avant.caracteres)} (à vérifier).`
    );
  } finally {
    await pg.end();
  }
}

principal().catch((erreur) => {
  console.error('Erreur fatale :', erreur instanceof Error ? erreur.message : erreur);
  process.exit(1);
});

import { notFound, redirect } from 'next/navigation';
import {
  utilisateurConnecte,
  creerClientServeur,
} from '@/lib/supabase/server';
import EspaceLivre from '@/components/EspaceLivre';
import AvertissementsLivre from '@/components/AvertissementsLivre';
import BarreNavigation from '@/components/BarreNavigation';
import ComplementCreditsBandeau from '@/components/ComplementCredits';
import {
  CODE_PLAN_GRATUIT,
  packsCredits,
  planEnVigueur,
  planParCode,
  quotaPourPlan,
} from '@/lib/abonnement';
import { calculerComplement } from '@/lib/credits-manquants';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import {
  MagasinAbonnementSupabase,
  MagasinCreditsSupabase,
} from '@/lib/paiement/magasin';
import {
  MagasinQuotaSupabase,
  periodeMois,
  quotaMensuel,
} from '@/lib/quota';
import type { ClientRpc } from '@/lib/rate-limit';
import {
  cleRepere,
  detecterReperes,
  type Avertissement,
  type Chapitre,
  type ClassificationAge,
  type Livre,
  type PropositionRepere,
} from '@/lib/types';
import { prive } from '@/lib/metadata';

export const metadata = prive('Lecture');

export const dynamic = 'force-dynamic';

type ClientServeur = Awaited<ReturnType<typeof creerClientServeur>>;

/**
 * Nombre de caractères d'un livre, recalculé depuis ses segments via le
 * RPC `public.metriques_chapitres` (migration
 * 20261002000003_allegement_chapitres.sql). Sert de REPLI quand
 * `chapitres.texte_source` est vide : les imports postérieurs au
 * 2 oct. 2026 avaient cessé de réécrire la colonne (défaut SQL ''), d'où
 * un total à 0, un bandeau de crédits muet et un « ~1 min » inventé.
 *
 * TOLÉRANT : un RPC en panne rend 0, jamais une exception — l'ouverture
 * du livre ne doit pas dépendre de ce comptage.
 */
async function totalCaracteresDepuisMetriques(
  client: ClientServeur,
  livreId: string
): Promise<number> {
  try {
    const { data, error } = await client.rpc('metriques_chapitres', {
      p_livre: livreId,
    });
    if (error || !Array.isArray(data)) return 0;
    return (data as Array<{ caracteres_source?: number | string | null }>).reduce(
      (somme, metrique) => somme + Number(metrique.caracteres_source ?? 0),
      0
    );
  } catch {
    return 0;
  }
}

/**
 * Texte source d'un livre reconstitué depuis ses segments — repli du même
 * trou que `totalCaracteresDepuisMetriques`, pour la détection des repères.
 *
 * UNE SEULE requête (pas de N+1) : les segments des chapitres du livre sont
 * lus d'un bloc, triés par chapitre puis par position, et concaténés dans
 * l'ordre de `idsChapitres`. TOLÉRANT : chaîne vide en cas d'échec.
 */
async function corpusDepuisSegments(
  client: ClientServeur,
  idsChapitres: string[]
): Promise<string> {
  if (idsChapitres.length === 0) return '';
  try {
    const parChapitre = new Map<string, string>();
    // PostgREST plafonne une réponse à 1 000 lignes : sans pagination, un
    // livre de plus de 1 000 segments verrait son corpus tronqué et les
    // repères des derniers chapitres passeraient inaperçus. On lit donc
    // par pages de 1 000, en s'arrêtant à la première page incomplète.
    const TAILLE_PAGE = 1000;
    for (let debut = 0; debut < 500_000; debut += TAILLE_PAGE) {
      const { data, error } = await client
        .from('segments')
        .select('chapitre_id, position, source, suite')
        .in('chapitre_id', idsChapitres)
        .order('chapitre_id', { ascending: true })
        .order('position', { ascending: true })
        .range(debut, debut + TAILLE_PAGE - 1);
      if (error) return '';
      const page = (data ?? []) as Array<{
        chapitre_id: string;
        source: string | null;
        suite: string | null;
      }>;
      for (const segment of page) {
        parChapitre.set(
          segment.chapitre_id,
          (parChapitre.get(segment.chapitre_id) ?? '') +
            (segment.source ?? '') +
            (segment.suite ?? '')
        );
      }
      if (page.length < TAILLE_PAGE) break;
    }
    return idsChapitres.map((idChapitre) => parChapitre.get(idChapitre) ?? '').join('\n');
  } catch {
    return '';
  }
}

export default async function PageLivre({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) redirect('/connexion');

  const supabase = await creerClientServeur();

  // RLS : renvoie null si le livre n'appartient pas à l'utilisateur.
  const { data: livre } = await supabase
    .from('livres')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!livre) notFound();

  // texte_source est nécessaire pour estimer le temps de lecture et pour
  // la détection des repères — on le compte côté serveur puis on le RETIRE
  // avant de passer les chapitres au client (payload SSR mince).
  const { data: chapitres } = await supabase
    .from('chapitres')
    .select('id, position, titre, statut, texte_source')
    .eq('livre_id', id)
    .order('position', { ascending: true });

  const listeChapitres = chapitres ?? [];
  const textesChapitres = listeChapitres.map(
    (chapitre) =>
      (chapitre as { texte_source?: string | null }).texte_source ?? ''
  );
  // Colonne muette = import antérieur au correctif d'écriture de
  // `chapitres.texte_source` (défaut SQL '') : les compteurs et les repères
  // doivent alors se rabattre sur les segments. Détecté une seule fois.
  const colonneTexteVide =
    listeChapitres.length > 0 &&
    textesChapitres.every((texte) => texte.length === 0);

  let totalCaracteres = textesChapitres.reduce(
    (somme, texte) => somme + texte.length,
    0
  );
  // Garde-fou : sans ce repli, un livre importé avec la colonne vide affiche
  // `totalCaracteres = 0` → bandeau de crédits muet (ComplementCredits rend
  // null) et « ~1 min » de lecture inventé. TOLÉRANT : RPC en panne → 0.
  if (colonneTexteVide) {
    totalCaracteres = await totalCaracteresDepuisMetriques(supabase, id);
  }

  const chapitresLegers = listeChapitres.map((chapitre) => {
    // texte_source ne sert qu'au comptage ci-dessus (payload SSR mince
    // côté client) : on l'écarte au passage.
    const { texte_source: _echappee, ...leger } = chapitre;
    void _echappee;
    return leger;
  });

  const { data: profil } = await supabase
    .from('profiles')
    .select('pseudo')
    .eq('id', utilisateur.id)
    .maybeSingle();

  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  // ---------- Repères de contenu (avertissements / tropes) ----------
  // Requête tolérante : si la migration n'est pas encore appliquée, la
  // fiche reste utilisable (liste vide) au lieu de planter.
  const { data: avertissementsBruts } = await supabase
    .from('avertissements')
    .select('id, livre_id, categorie, libelle, spoiler, grave, origine, created_at')
    .eq('livre_id', id)
    .order('created_at', { ascending: true });
  const avertissements = (avertissementsBruts ?? []) as Avertissement[];

  const proprietaire = (livre as { proprietaire_id?: string }).proprietaire_id;
  const estProprietaire = proprietaire === utilisateur.id;
  const classification = ((livre as { classification_age?: ClassificationAge })
    .classification_age ?? 'non_classee') as ClassificationAge;

  // Propositions automatiques : détection par mots-clés sur le texte
  // source DÉJÀ en base. Jamais enregistrées sans validation explicite
  // (calculées uniquement pour le propriétaire).
  // Même trou que le comptage ci-dessus : si `texte_source` est muet, le
  // corpus est reconstitué depuis les segments — UNE requête, et seulement
  // dans ce cas (aucune requête de plus pour un livre à colonne remplie).
  const corpus =
    colonneTexteVide && estProprietaire
      ? await corpusDepuisSegments(
          supabase,
          listeChapitres.map((chapitre) => (chapitre as { id: string }).id)
        )
      : textesChapitres.join('\n');
  const dejaPresents = new Set(avertissements.map((a) => cleRepere(a.libelle)));
  const propositions: PropositionRepere[] = estProprietaire
    ? detecterReperes(corpus).filter((p) => !dejaPresents.has(cleRepere(p.libelle)))
    : [];

  // ---------- Solde restant + complément de crédits (prorata) ----------
  // Solde restant = quota du mois non consommé + crédits prépayés. On le
  // lit AVANT toute traduction pour proposer, si le solde tombe JUSTE SOUS
  // la taille du livre, le pack le plus juste au prorata (lib/credits-manquants.ts).
  // Tout est TOLÉRANT : une table absente ou un RPC en panne ne doit
  // jamais casser l'ouverture d'un livre (solde considéré nul).
  const magasinAbonnement = new MagasinAbonnementSupabase(supabase);
  const magasinCredits = new MagasinCreditsSupabase(supabase);
  const [abonnement, soldeCredits] = await Promise.all([
    magasinAbonnement.lire(utilisateur.id).catch(() => null),
    magasinCredits.lireSolde(utilisateur.id).catch(() => 0),
  ]);

  const planQuota =
    planParCode(planEnVigueur(abonnement)) ?? planParCode(CODE_PLAN_GRATUIT)!;
  const limiteQuota = quotaPourPlan(planQuota, quotaMensuel());
  const clientRpc: ClientRpc = { rpc: (nom, args) => supabase.rpc(nom, args) };
  const utiliseQuota = await new MagasinQuotaSupabase(clientRpc)
    .lire(utilisateur.id, periodeMois().cle)
    .catch(() => 0);

  const complement = calculerComplement(
    totalCaracteres,
    { quotaRestant: Math.max(limiteQuota - utiliseQuota, 0), credits: soldeCredits },
    packsCredits()
  );

  // ---------- Interrupteur lecture_vocale (F9) ----------
  // Barrière fine côté serveur : registre + plan effectif du compte.
  // Un module fermé = composant jamais monté (le serveur est l'autorité).
  const lectureVocale = await verifierAccesModule('lecture_vocale', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 animate-fondu-monte">
        <AvertissementsLivre
          livreId={id}
          titre={(livre as Livre).titre}
          classificationInitiale={classification}
          avertissementsInitiaux={avertissements}
          propositions={propositions}
          estProprietaire={estProprietaire}
        />
        {/* AVANT de lancer la traduction : taille du livre, déficit et,
            s'il y a lieu, le complément de crédits au prorata. */}
        <ComplementCreditsBandeau complement={complement} />
        <EspaceLivre
          livreInitial={livre as Livre}
          chapitresInitiaux={chapitresLegers as Chapitre[]}
          totalCaracteres={totalCaracteres}
          lectureVocaleOuverte={lectureVocale.ouvert}
        />
      </main>
    </>
  );
}

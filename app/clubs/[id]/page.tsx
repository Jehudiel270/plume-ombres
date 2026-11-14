// ============================================================
// app/clubs/[id]/page.tsx — Salon d'un club privé (F11 v4).
//
// GARDE SERVEUR : session, interrupteur `clubs`, ADHÉSION. Sans
// adhésion à CE club : 404 (le salon n'existe pour personne d'autre).
//
// Le club COMPLET, comme le cahier initial : discussion (salon
// vivant), programme de lecture par étapes, sondages, membres avec
// rôles, rencontres. Le plafond de discussion croise la position de
// lecture déclarée et la dernière étape DÉBLOQUÉE du programme —
// le filtrage reste CÔTÉ SERVEUR, rien au-delà du chapitre lu.
// ============================================================

import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { plafondEffectif, MAX_ETAPES, type RoleClub } from '@/lib/clubs';
import {
  agregerReactions,
  triFil,
  versMessageSalon,
  type LigneMessageBrute,
  type LigneReactionBrute,
} from '@/lib/salon';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import OngletsSalon from '@/components/clubs/OngletsSalon';

export const metadata = prive('Salon de club');

export const dynamic = 'force-dynamic';

const PAGE_MESSAGES = 60;

type MembreLigne = {
  utilisateur_id: string;
  position_lecture: number;
  role: string | null;
  profiles: { pseudo: string | null } | null;
};

type EtapeLigne = {
  club_id: string;
  numero: number;
  chapitre_de: number;
  chapitre_a: number;
  focus: string | null;
  debloque_le: string | null;
};

export default async function PageSalonClub({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  const moduleVerdict = await verifierAccesModule('clubs', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert) notFound();

  // Le club et MON adhésion (RLS : un non-membre ne lit rien).
  const [monAdhesion, clubLigne] = await Promise.all([
    supabase
      .from('clubs_membres')
      .select('position_lecture, role')
      .eq('club_id', id)
      .eq('utilisateur_id', utilisateur.id)
      .maybeSingle(),
    supabase
      .from('clubs')
      .select('id, titre, description, code_invitation, createur_id, livre_id, livres ( titre )')
      .eq('id', id)
      .maybeSingle(),
  ]);

  const club = clubLigne.data as unknown as {
    id: string;
    titre: string;
    description: string | null;
    code_invitation: string;
    createur_id: string;
    livre_id: string | null;
    livres: { titre: string } | null;
  } | null;
  const monAdhesionLigne = monAdhesion.data as
    | { position_lecture: number; role: string | null }
    | null;
  if (!club || !monAdhesionLigne) notFound();

  const maPosition: number = monAdhesionLigne.position_lecture;
  const estCreateur = club.createur_id === utilisateur.id;
  const monRole: RoleClub =
    monAdhesionLigne.role === 'admin' || monAdhesionLigne.role === 'moderateur'
      ? monAdhesionLigne.role
      : estCreateur
        ? 'admin'
        : 'membre';
  const estStaff = monRole === 'admin' || monRole === 'moderateur';

  // Membres, messages, étapes du programme, chapitres du livre,
  // (et ses livres pour les réglages du créateur).
  const [membres, messagesLignes, etapesLignes, nbChapitres, mesLivres] =
    await Promise.all([
      supabase
        .from('clubs_membres')
        .select('utilisateur_id, position_lecture, role, profiles ( pseudo )')
        .eq('club_id', id)
        .order('rejoins_le', { ascending: true })
        .limit(24),
      supabase
        .from('clubs_messages')
        .select(
          'id, auteur_id, contenu, chapitre_max, created_at, modifie_le, epingle, reponse_a, signale, prive, destinataire_id, profiles ( pseudo )'
        )
        .eq('club_id', id)
        .order('created_at', { ascending: false })
        .limit(PAGE_MESSAGES + 1),
      supabase
        .from('clubs_etapes')
        .select('club_id, numero, chapitre_de, chapitre_a, focus, debloque_le')
        .eq('club_id', id)
        .order('numero', { ascending: true })
        .limit(MAX_ETAPES),
      club.livre_id
        ? supabase
            .from('chapitres')
            .select('id', { count: 'exact', head: true })
            .eq('livre_id', club.livre_id)
        : Promise.resolve({ count: null as number | null }),
      estCreateur
        ? supabase
            .from('livres')
            .select('id, titre')
            .order('updated_at', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: null as Array<{ id: string; titre: string }> | null }),
    ]);

  const membresListe = ((membres.data ?? []) as unknown as MembreLigne[]).map((m) => ({
    utilisateurId: m.utilisateur_id,
    pseudo: m.profiles?.pseudo ?? 'Lecteur',
    moi: m.utilisateur_id === utilisateur.id,
    createur: m.utilisateur_id === club.createur_id,
    position: m.position_lecture,
    role: (m.role === 'admin' || m.role === 'moderateur'
      ? m.role
      : m.utilisateur_id === club.createur_id
        ? 'admin'
        : 'membre') as RoleClub,
  }));

  // PLAFOND DE DISCUSSION : le programme décide avec moi.
  const etapes = ((etapesLignes.data ?? []) as unknown as EtapeLigne[]).map((l) => ({
    numero: l.numero,
    chapitreDe: l.chapitre_de,
    chapitreA: l.chapitre_a,
    focus: l.focus ?? '',
    debloqueLe: l.debloque_le,
    ouverte: l.debloque_le !== null,
  }));
  const dernierChapitreDebloque = etapes.reduce<number | null>(
    (max, e) => (e.ouverte ? Math.max(max ?? 0, e.chapitreA) : max),
    null
  );
  const plafond = plafondEffectif(maPosition, dernierChapitreDebloque);

  const lignes = (messagesLignes.data ?? []) as unknown as LigneMessageBrute[];
  const plusAnciens = lignes.length > PAGE_MESSAGES;
  const page = plusAnciens ? lignes.slice(0, PAGE_MESSAGES) : lignes;

  // Pseudos des membres : pour nommer le destinataire d'un MP.
  const pseudosMembres = new Map(
    membresListe.map((m) => [m.utilisateurId, m.pseudo])
  );

  // FILTRAGE ANTI-SPOILERS côté serveur : au-delà du plafond
  // (ma position ET l'étape ouverte), le contenu n'est pas rendu —
  // un compteur le dit, sans le trahir.
  const messages = [];
  let masques = 0;
  for (const m of page) {
    const salon = versMessageSalon(m, {
      monId: utilisateur.id,
      maPosition: plafond,
      estCreateur,
      pseudosMembres,
    });
    if (!salon) {
      masques += 1;
      continue;
    }
    messages.push(salon);
  }

  // Réactions des messages de CETTE page, agrégées (la RLS n'envoie
  // que celles des messages que je peux lire).
  const idsPage = page.map((m) => m.id);
  if (idsPage.length > 0) {
    const { data: reactionsLignes } = await supabase
      .from('clubs_reactions')
      .select('message_id, utilisateur_id, emoji')
      .eq('club_id', id)
      .in('message_id', idsPage)
      .limit(3000);
    const agregees = agregerReactions(
      ((reactionsLignes ?? []) as unknown as LigneReactionBrute[]),
      utilisateur.id
    );
    for (const m of messages) {
      m.reactions = agregees.get(m.id) ?? [];
    }
  }

  // Les épinglés remontent en tête, le fil garde son ordre.
  messages.sort(triFil);

  // ---------- Sondages, rencontres, signalements ----------
  const [sondagesLignes, optionsLignes, votesLignes, rencontresLignes, participantsLignes, signalementsLignes] =
    await Promise.all([
      supabase
        .from('clubs_sondages')
        .select('id, club_id, auteur_id, question, ferme_le, created_at')
        .eq('club_id', id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('clubs_sondages_options')
        .select('id, sondage_id, label, position')
        .order('position', { ascending: true })
        .limit(120),
      supabase
        .from('clubs_sondages_votes')
        .select('sondage_id, option_id, utilisateur_id')
        .limit(5000),
      supabase
        .from('clubs_rencontres')
        .select('id, club_id, auteur_id, titre, prevu_le, mode, note_chapitres, created_at')
        .eq('club_id', id)
        .order('prevu_le', { ascending: true })
        .limit(60),
      supabase
        .from('clubs_rencontres_participants')
        .select('rencontre_id, utilisateur_id')
        .limit(3000),
      estStaff
        ? supabase
            .from('clubs_signalements')
            .select(
              'id, club_id, message_id, signalant_id, motif, statut, traite_par, traite_le, created_at'
            )
            .eq('club_id', id)
            .order('created_at', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: null as unknown[] | null }),
    ]);

  type SondageLigne = {
    id: string;
    auteur_id: string;
    question: string;
    ferme_le: string;
  };
  type OptionLigne = { id: string; sondage_id: string; label: string; position: number };
  type VoteLigne = { sondage_id: string; option_id: string; utilisateur_id: string };

  const listeSondages = (sondagesLignes.data ?? []) as unknown as SondageLigne[];
  const idsSondages = new Set(listeSondages.map((s) => s.id));
  const listeOptions = ((optionsLignes.data ?? []) as unknown as OptionLigne[]).filter(
    (o) => idsSondages.has(o.sondage_id)
  );
  const listeVotes = ((votesLignes.data ?? []) as unknown as VoteLigne[]).filter((v) =>
    idsSondages.has(v.sondage_id)
  );
  const maintenant = Date.now();
  const sondages = listeSondages.map((s) => {
    const sesOptions = listeOptions
      .filter((o) => o.sondage_id === s.id)
      .map((o) => ({ id: o.id, label: o.label, position: o.position }));
    const votesSondage = listeVotes.filter((v) => v.sondage_id === s.id);
    const monVote = votesSondage.find((v) => v.utilisateur_id === utilisateur.id) ?? null;
    const ouvert = new Date(s.ferme_le).getTime() > maintenant;
    const repartition: Record<string, number> = {};
    if ((monVote || !ouvert) && sesOptions.length > 0) {
      for (const o of sesOptions) repartition[o.id] = 0;
      for (const v of votesSondage) {
        repartition[v.option_id] = (repartition[v.option_id] ?? 0) + 1;
      }
    }
    return {
      id: s.id,
      question: s.question,
      fermeLe: s.ferme_le,
      ouvert,
      mien: s.auteur_id === utilisateur.id,
      parMoi: monVote !== null,
      monOption: monVote?.option_id ?? null,
      total: votesSondage.length,
      options: sesOptions,
      repartition,
    };
  });

  type RencontreLigne = {
    id: string;
    auteur_id: string;
    titre: string;
    prevu_le: string;
    mode: string;
    note_chapitres: string | null;
  };
  const listeRencontres = (rencontresLignes.data ?? []) as unknown as RencontreLigne[];
  const lignesParticipants = (participantsLignes.data ?? []) as unknown as Array<{
    rencontre_id: string;
    utilisateur_id: string;
  }>;
  const rencontresToutes = listeRencontres.map((r) => {
    const ses = lignesParticipants.filter((p) => p.rencontre_id === r.id);
    return {
      id: r.id,
      titre: r.titre,
      prevuLe: r.prevu_le,
      mode: r.mode,
      chapitres: r.note_chapitres,
      passee: new Date(r.prevu_le).getTime() < maintenant,
      mienne: r.auteur_id === utilisateur.id,
      participants: ses.length,
      jeParticipe: ses.some((p) => p.utilisateur_id === utilisateur.id),
    };
  });

  type SignalementLigne = {
    id: string;
    message_id: number;
    motif: string;
    statut: string;
    traite_par: string | null;
    traite_le: string | null;
    created_at: string;
  };
  const lignesSignalements = (signalementsLignes.data ?? []) as unknown as SignalementLigne[];
  const extraits = new Map<number, { contenu: string; auteur: string; masque: boolean }>();
  const idsSignales = Array.from(new Set(lignesSignalements.map((l) => l.message_id)));
  if (idsSignales.length > 0) {
    const { data: msgsSignales } = await supabase
      .from('clubs_messages')
      .select('id, contenu, auteur_id, masque, profiles ( pseudo )')
      .in('id', idsSignales)
      .limit(100);
    for (const m of (msgsSignales ?? []) as unknown as Array<{
      id: number;
      contenu: string;
      auteur_id: string;
      masque: boolean;
      profiles: { pseudo: string | null } | null;
    }>) {
      extraits.set(m.id, {
        contenu: m.contenu.slice(0, 280),
        auteur: m.profiles?.pseudo ?? 'Lecteur',
        masque: m.masque,
      });
    }
  }
  const signalements = lignesSignalements.map((l) => {
    const e = extraits.get(l.message_id);
    return {
      id: l.id,
      messageId: l.message_id,
      motif: l.motif,
      statut: l.statut,
      traiteLe: l.traite_le,
      le: l.created_at,
      extrait: e?.contenu ?? null,
      auteur: e?.auteur ?? null,
      messageMasque: e?.masque ?? false,
    };
  });

  const { data: profil } = await supabase
    .from('profiles')
    .select('pseudo')
    .eq('id', utilisateur.id)
    .maybeSingle();
  const pseudo =
    (profil as { pseudo?: string } | null)?.pseudo ||
    (utilisateur.email?.split('@')[0] ?? 'Lecteur');

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-fondu-monte">
        <OngletsSalon
          salon={{
            clubId: club.id,
            monId: utilisateur.id,
            club: {
              titre: club.titre,
              description: club.description,
              codeInvitation: club.code_invitation,
              estCreateur,
              livreId: club.livre_id,
              livreTitre: club.livres?.titre ?? null,
            },
            mesLivres:
              (mesLivres.data as Array<{ id: string; titre: string }> | null) ?? [],
            maPosition,
            membresSalon: membresListe,
            messages,
            masques,
            plusAnciens,
            curseur: page.length > 0 ? page[page.length - 1].id : null,
          }}
          programme={{
            etapes,
            dernierChapitreDebloque,
            totalChapitres: (nbChapitres as { count: number | null }).count ?? 0,
            estStaff,
          }}
          sondages={sondages}
          membres={{
            membres: membresListe,
            signalements,
            monRole,
            estCreateur,
          }}
          rencontres={{
            aVenir: rencontresToutes.filter((r) => !r.passee),
            passees: rencontresToutes
              .filter((r) => r.passee)
              .sort((a, b) => b.prevuLe.localeCompare(a.prevuLe)),
          }}
        />
      </main>
    </>
  );
}

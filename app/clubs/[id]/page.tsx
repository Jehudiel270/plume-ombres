// ============================================================
// app/clubs/[id]/page.tsx — Salon d'un club privé (F11 v2).
//
// GARDE SERVEUR : session, interrupteur `clubs`, ADHÉSION. Sans
// adhésion à CE club : 404 (le salon n'existe pour personne d'autre).
// Les messages sont filtrés ICI, côté serveur, selon la position de
// lecture déclarée du membre — rien au-delà du chapitre lu.
// ============================================================

import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { editionPossible, messageVisiblePour } from '@/lib/clubs';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import SalonClub from '@/components/clubs/SalonClub';

export const metadata = prive('Salon de club');

export const dynamic = 'force-dynamic';

const PAGE_MESSAGES = 60;

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
      .select('position_lecture')
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
  const maPosition =
    (monAdhesion.data as { position_lecture: number } | null)?.position_lecture;
  if (!club || maPosition === undefined || maPosition === null) notFound();

  const estCreateur = club.createur_id === utilisateur.id;

  // Membres, messages et (pour le créateur) ses livres pour les
  // réglages du club.
  const [membres, messagesLignes, mesLivres] = await Promise.all([
    supabase
      .from('clubs_membres')
      .select('utilisateur_id, position_lecture, profiles ( pseudo )')
      .eq('club_id', id)
      .order('rejoins_le', { ascending: true })
      .limit(24),
    supabase
      .from('clubs_messages')
      .select(
        'id, auteur_id, contenu, chapitre_max, created_at, modifie_le, epingle, reponse_a, signale, profiles ( pseudo )'
      )
      .eq('club_id', id)
      .order('created_at', { ascending: false })
      .limit(PAGE_MESSAGES + 1),
    estCreateur
      ? supabase
          .from('livres')
          .select('id, titre')
          .order('updated_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: null as Array<{ id: string; titre: string }> | null }),
  ]);

  type MembreLigne = {
    utilisateur_id: string;
    position_lecture: number;
    profiles: { pseudo: string | null } | null;
  };
  type MessageLigne = {
    id: number;
    auteur_id: string;
    contenu: string;
    chapitre_max: number;
    created_at: string;
    modifie_le: string | null;
    epingle: boolean;
    reponse_a: number | null;
    signale: boolean;
    profiles: { pseudo: string | null } | null;
  };

  const lignes = (messagesLignes.data ?? []) as unknown as MessageLigne[];
  const plusAnciens = lignes.length > PAGE_MESSAGES;
  const page = plusAnciens ? lignes.slice(0, PAGE_MESSAGES) : lignes;

  // FILTRAGE ANTI-SPOILERS côté serveur : au-delà de ma lecture, le
  // contenu n'est pas rendu — un compteur le dit, sans le trahir.
  type MessageSalon = {
    id: number;
    auteur: string;
    auteurId: string;
    mien: boolean;
    contenu: string;
    plafond: number;
    le: string;
    modifieLe: string | null;
    epingle: boolean;
    reponseA: number | null;
    editionPossible: boolean;
    signale: boolean;
  };
  const messages: MessageSalon[] = [];
  let masques = 0;
  for (const m of page) {
    if (!messageVisiblePour(m.chapitre_max, maPosition)) {
      masques += 1;
      continue;
    }
    messages.push({
      id: m.id,
      auteur: m.profiles?.pseudo ?? 'Lecteur',
      auteurId: m.auteur_id,
      mien: m.auteur_id === utilisateur.id,
      contenu: m.contenu,
      plafond: m.chapitre_max,
      le: m.created_at,
      modifieLe: m.modifie_le,
      epingle: m.epingle,
      reponseA: m.reponse_a,
      editionPossible: editionPossible(m.created_at, m.modifie_le),
      signale: m.signale === true && estCreateur,
    });
  }

  // Les épinglés remontent en tête, le fil garde son ordre.
  messages.sort((a, b) => {
    if (a.epingle !== b.epingle) return a.epingle ? -1 : 1;
    return b.le.localeCompare(a.le);
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
        <SalonClub
          clubId={club.id}
          monId={utilisateur.id}
          club={{
            titre: club.titre,
            description: club.description,
            codeInvitation: club.code_invitation,
            estCreateur,
            livreId: club.livre_id,
            livreTitre: club.livres?.titre ?? null,
          }}
          mesLivres={
            (mesLivres.data as Array<{ id: string; titre: string }> | null) ?? []
          }
          maPosition={maPosition}
          membres={((membres.data ?? []) as unknown as MembreLigne[]).map((m) => ({
            utilisateurId: m.utilisateur_id,
            pseudo: m.profiles?.pseudo ?? 'Lecteur',
            moi: m.utilisateur_id === utilisateur.id,
            createur: m.utilisateur_id === club.createur_id,
            position: m.position_lecture,
          }))}
          messages={messages}
          masques={masques}
          plusAnciens={plusAnciens}
          curseur={page.length > 0 ? page[page.length - 1].id : null}
        />
      </main>
    </>
  );
}

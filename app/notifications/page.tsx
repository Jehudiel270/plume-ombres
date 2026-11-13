// ============================================================
// app/notifications/page.tsx — Centre de notifications (A18/F23).
//
// Historique COMPLET du compte (au-delà des 20 dernières de la
// cloche), filtres par type, tout marquer comme lu. Les
// notifications naissent du travail du compte (traduction,
// paiement, alertes) : aucune publicité, aucun digest marketing,
// et AUCUN spoiler — elles ne contiennent jamais d'intrigue.
// Page du SOCLE (FEATURE-FLAGS.md de la maquette) : pas
// d'interrupteur, la session suffit.
// ============================================================

import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import {
  assainirNotifications,
  LIMITE_MAX,
  marquerNotificationsLues,
} from '@/lib/notifications';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import PanneauNotifications from '@/components/notifications/PanneauNotifications';

export const metadata = prive('Notifications');

export const dynamic = 'force-dynamic';

export default async function PageNotifications({
  searchParams,
}: {
  searchParams: Promise<{ tout?: string }>;
}) {
  const { tout } = await searchParams;
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();

  // Action : tout marquer comme lu (form GET, garde serveur ; la
  // fonction RPC s'appuie sur la session — aucune valeur passée).
  if (tout === 'lu') {
    await marquerNotificationsLues(supabase).catch(() => null);
  }

  const notifications = await supabase
    .from('notifications')
    .select('id, proprietaire_id, type, titre, corps, lien, lu, cree_le')
    .order('cree_le', { ascending: false })
    .limit(LIMITE_MAX)
    .then((r) => assainirNotifications(r.data) ?? []);
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
        <header>
          <p className="sur-titre text-grenat-400">Notifications</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            L’activité de votre atelier
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Traductions terminées, paiements, alertes techniques : tout ce que
            votre atelier veut vous dire, sans publicité et sans jamais rien
            révéler de vos lectures.
          </p>
        </header>

        <PanneauNotifications notifications={notifications} />
      </main>
    </>
  );
}

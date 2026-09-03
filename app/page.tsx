// Page d'accueil : simple aiguillage selon l'état de session.
import { redirect } from 'next/navigation';
import { utilisateurConnecte } from '@/lib/supabase/server';

export default async function Accueil() {
  const utilisateur = await utilisateurConnecte();
  redirect(utilisateur ? '/bibliotheque' : '/connexion');
}

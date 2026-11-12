// ============================================================
// app/glossaire/page.tsx — Écran de gestion du glossaire (F16).
//
// La mécanique d'INJECTION existe déjà (lib/glossaire.ts, branchée
// dans tous les moteurs de traduction) : cet écran donne au lecteur
// la GESTION — ajouter, corriger, verrouiller, supprimer un terme, et
// valider les candidats détectés automatiquement dans son texte.
//
// GARDE SERVEUR : interrupteur `glossaire` évalué ICI
// (verifierAccesModule) — module fermé → 404, comme si la page
// n'existait pas. Le panneau n'est jamais rendu autrement.
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { chargerGlossaire, proposerCandidats } from '@/lib/glossaire';
import type { CandidatGlossaire, EntreeGlossaire } from '@/lib/types';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';
import PanneauGlossaire, {
  type LivreGlossaire,
} from '@/components/glossaire/PanneauGlossaire';

export const metadata = prive('Glossaire');

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PageGlossaire({
  searchParams,
}: {
  searchParams: Promise<{ livre?: string }>;
}) {
  const { livre: paramLivre } = await searchParams;
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  // Barrière fine : module fermé ou plan insuffisant → 404.
  const module = await verifierAccesModule('glossaire', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!module.ouvert) notFound();

  // Livres du compte (RLS « own »), du plus récemment modifié.
  const { data: livresBruts } = await supabase
    .from('livres')
    .select('id, titre, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);
  const livres: LivreGlossaire[] = (livresBruts ?? []) as LivreGlossaire[];

  // Livre sélectionné (paramètre validé + propriété vérifiée par RLS).
  const livreId = paramLivre && UUID.test(paramLivre) ? paramLivre : null;
  const livreChoisi = livreId ? livres.find((l) => l.id === livreId) ?? null : null;

  let entrees: EntreeGlossaire[] = [];
  let candidats: CandidatGlossaire[] = [];
  if (livreChoisi) {
    entrees = await chargerGlossaire(supabase, livreChoisi.id).catch(() => []);
    // Détection tolérante : un échec laisse simplement la liste vide.
    candidats = await proposerCandidats(supabase, livreChoisi.id).catch(() => []);
  }

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
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">Atelier</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">Glossaire</h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Les termes que vous fixez ici sont imposés au moteur de traduction :
            noms de personnages, lieux, tournures. Une entrée verrouillée n’est
            jamais remplacée par une suggestion.
          </p>
        </header>

        <PanneauGlossaire
          livres={livres}
          livreId={livreChoisi?.id ?? null}
          entrees={entrees}
          candidats={candidats}
        />
      </main>
    </>
  );
}

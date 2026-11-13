// ============================================================
// app/univers/[id]/page.tsx — Détail d'un univers multi-tomes (F17).
//
// La saga en lecture : carte des tomes ORDONNÉS, progression de
// chaque tome, ANTI-SPOILERS PAR TOME (l'ordre des tomes suit la
// lecture ; chaque tome révèle seulement ce que vous y avez lu).
// GARDE SERVEUR : session, interrupteur `univers` (Illimité),
// PROPRIÉTAIRE. Un univers d'autrui → 404.
// ============================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';

export const metadata = prive('Univers');

export const dynamic = 'force-dynamic';

export default async function PageUniversDetail({
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

  const moduleVerdict = await verifierAccesModule('univers', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert) notFound();

  // L'univers (RLS « own ») et ses tomes ordonnés, avec les
  // chapitres DÉCOUVERTS de chaque livre (XP posée = vérité
  // serveur de la lecture : une ligne par chapitre ouvert).
  const [universLigne, tomes] = await Promise.all([
    supabase
      .from('univers')
      .select('id, titre, description, created_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('univers_livres')
      .select('position, livres ( id, titre, auteur, chapitres ( id ) )')
      .eq('univers_id', id)
      .order('position', { ascending: true })
      .limit(100),
  ]);

  const univers = universLigne.data as {
    id: string;
    titre: string;
    description: string | null;
  } | null;
  if (!univers) notFound();

  type LigneTome = {
    position: number;
    livres: {
      id: string;
      titre: string;
      auteur: string | null;
      chapitres: Array<{ id: string }> | null;
    } | null;
  };

  const lignesTomes = ((tomes.data ?? []) as unknown as LigneTome[]).filter((t) => t.livres);

  // Chapitres découverts, par livre (une requête, regroupée ici).
  const idsLivres = lignesTomes.map((t) => t.livres!.id);
  const decouvertsParLivre = new Map<string, number>();
  if (idsLivres.length > 0) {
    const { data: xpLignes } = await supabase
      .from('lectures_xp')
      .select('livre_id')
      .in('livre_id', idsLivres)
      .limit(5000);
    for (const l of ((xpLignes ?? []) as unknown as Array<{ livre_id: string }>)) {
      decouvertsParLivre.set(
        l.livre_id,
        (decouvertsParLivre.get(l.livre_id) ?? 0) + 1
      );
    }
  }

  const liste = lignesTomes.map((t) => {
    const livre = t.livres!;
    const total = (livre.chapitres ?? []).length;
    const lu = Math.min(total, decouvertsParLivre.get(livre.id) ?? 0);
    return {
      position: t.position,
      id: livre.id,
      titre: livre.titre,
      auteur: livre.auteur,
      total,
      lu,
      part: total > 0 ? Math.min(1, lu / total) : 0,
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

  const tomesCommences = liste.filter((t) => t.lu > 0).length;
  const tomesFinis = liste.filter((t) => t.total > 0 && t.lu >= t.total).length;

  return (
    <>
      <BarreNavigation email={utilisateur.email ?? ''} pseudo={pseudo} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">
            <Link href="/univers" className="hover:text-grenat-300">
              Univers
            </Link>
          </p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">{univers.titre}</h1>
          {univers.description && (
            <p className="text-encre-500 text-sm mt-2">{univers.description}</p>
          )}
          <div className="liseret mt-3" />
          <p className="text-xs text-encre-500 mt-2">
            {liste.length} tome{liste.length > 1 ? 's' : ''} · {tomesCommences} commencé
            {tomesCommences > 1 ? 's' : ''} · {tomesFinis} terminé
            {tomesFinis > 1 ? 's' : ''}
          </p>
        </header>

        {/* Carte des tomes, dans l'ordre de la saga */}
        {liste.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-nuit-700 p-6 text-center text-sm text-encre-500">
            Aucun tome rangé pour l’instant.{' '}
            <Link href="/univers" className="underline">
              Organisez la saga
            </Link>{' '}
            depuis la liste des univers.
          </p>
        ) : (
          <ol className="space-y-3">
            {liste.map((t) => (
              <li key={t.id} className="velours p-4 rounded-2xl">
                <div className="flex items-start gap-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-grenat-700/60 font-display text-encre-100"
                    aria-hidden="true"
                  >
                    {t.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg text-encre-100">
                      <Link href={`/livres/${t.id}`} className="hover:text-grenat-300">
                        {t.titre}
                      </Link>
                    </h2>
                    {t.auteur && <p className="text-xs text-encre-500">{t.auteur}</p>}
                    <p className="mt-1 text-xs text-encre-500">
                      {t.lu > 0
                        ? `${t.lu} chapitre${t.lu > 1 ? 's' : ''} découvert${t.lu > 1 ? 's' : ''} sur ${t.total || '?'}`
                        : t.total > 0
                          ? `${t.total} chapitre${t.total > 1 ? 's' : ''} — pas encore entamé`
                          : 'Chapitres non importés'}
                    </p>
                    {t.total > 0 && (
                      <div
                        className="mt-2 h-2 rounded-full bg-nuit-800 overflow-hidden max-w-sm"
                        role="presentation"
                      >
                        <div
                          className="h-full rounded-full bg-grenat-600"
                          style={{ width: `${Math.round(t.part * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className="text-xs text-encre-500">
          L’ordre des tomes est le vôtre : la saga se lit comme vous l’avez
          rangée. Aucun résumé ni graphe ne débordera du tome où vous en êtes.
        </p>
      </main>
    </>
  );
}

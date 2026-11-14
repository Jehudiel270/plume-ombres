// ============================================================
// app/suivis/page.tsx — Suivis des œuvres & agenda des sorties
// (A7/A22, VARIANTE ATELIER du cahier initial).
//
// Décision de l'administrateur (15/11/2026) : le « calendrier des
// sorties » du cahier supposait que la plateforme PUBLIE des
// chapitres (accès anticipé abonnés, comptes à rebours) — panneau à
// risque juridique, laissé de côté avec l'interrupteur `calendrier`.
// La variante honnête, câblée sur des données réelles : les sorties
// de VOTRE atelier — rencontres à venir des clubs où vous êtes
// membre, échéances de vos défis, traductions terminées — nourries
// par les œuvres que vous suivez.
//
// GARDE SERVEUR : interrupteur `suivis` évalué ICI — fermé → 404.
// ============================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, BookmarkCheck, Sparkles } from 'lucide-react';

import { utilisateurConnecte, creerClientServeur } from '@/lib/supabase/server';
import { verifierAccesModule } from '@/lib/fonctionnalites/etats';
import { planEnVigueur, CODE_PLAN_GRATUIT } from '@/lib/abonnement';
import { MagasinAbonnementSupabase } from '@/lib/paiement/magasin';
import {
  fusionnerAgenda,
  libelleDateAgenda,
  libelleDelai,
  type BruteEcheance,
  type BruteRencontre,
  type OeuvreSuivie,
} from '@/lib/suivis';
import { prive } from '@/lib/metadata';
import BarreNavigation from '@/components/BarreNavigation';

export const metadata = prive('Suivis & sorties');

export const dynamic = 'force-dynamic';

const LIBELLES_STATUT: Record<string, string> = {
  importe: 'Importé',
  pret: 'Prêt à traduire',
  en_traduction: 'En traduction',
  traduit: 'Traduit',
  erreur: 'En erreur',
};

export default async function PageSuivis() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) notFound();

  const supabase = await creerClientServeur();
  const abonnement = await new MagasinAbonnementSupabase(supabase)
    .lire(utilisateur.id)
    .catch(() => null);

  const moduleVerdict = await verifierAccesModule('suivis', {
    utilisateurId: utilisateur.id,
    codePlan: planEnVigueur(abonnement) ?? CODE_PLAN_GRATUIT,
  });
  if (!moduleVerdict.ouvert) notFound();

  const maintenant = new Date();
  const aujourdhui = maintenant.toISOString().slice(0, 10);

  // Œuvres suivies (RLS : les miennes, mes livres seulement).
  const { data: suivisLus } = await supabase
    .from('suivis_oeuvres')
    .select('livre_id, cree_le, livres ( titre, auteur, statut )')
    .order('cree_le', { ascending: false })
    .limit(60);

  type LigneSuivi = {
    livre_id: string;
    cree_le: string;
    livres: { titre: string; auteur: string | null; statut: string } | null;
  };
  const lignes = ((suivisLus ?? []) as unknown as LigneSuivi[]).filter((l) => l.livres);
  const ids = [...new Set(lignes.map((l) => l.livre_id))];

  // Comptes de chapitres des œuvres suivies (une requête groupée).
  const compte = new Map<string, { total: number; traduits: number }>();
  if (ids.length) {
    const { data: chapitres } = await supabase
      .from('chapitres')
      .select('livre_id, statut')
      .in('livre_id', ids)
      .limit(4000);
    for (const c of (chapitres ?? []) as unknown as Array<{ livre_id: string; statut: string }>) {
      const entree = compte.get(c.livre_id) ?? { total: 0, traduits: 0 };
      entree.total += 1;
      if (c.statut === 'traduit') entree.traduits += 1;
      compte.set(c.livre_id, entree);
    }
  }

  const suivis: OeuvreSuivie[] = lignes.map((l) => {
    const n = compte.get(l.livre_id) ?? { total: 0, traduits: 0 };
    return {
      livreId: l.livre_id,
      titre: l.livres!.titre,
      auteur: l.livres!.auteur,
      statut: l.livres!.statut,
      chapitresTotal: n.total,
      chapitresTraduits: n.traduits,
      suivieDepuis: l.cree_le,
    };
  });

  // Agenda des sorties réelles : rencontres à venir de MES clubs +
  // échéances de MES défis non terminés.
  const [{ data: mesClubs }, { data: defisLus }] = await Promise.all([
    supabase.from('clubs_membres').select('club_id').limit(50),
    supabase
      .from('defis')
      .select('id, titre, genre, cible, echeance')
      .not('echeance', 'is', null)
      .is('termine_le', null)
      .gte('echeance', aujourdhui)
      .order('echeance', { ascending: true })
      .limit(20),
  ]);

  type LigneRencontre = {
    id: string;
    titre: string;
    prevu_le: string;
    mode: string;
    note_chapitres: string | null;
    clubs: { titre: string } | null;
  };
  const clubIds = [
    ...new Set(((mesClubs ?? []) as { club_id: string }[]).map((m) => m.club_id)),
  ];
  const brutesRencontres: BruteRencontre[] = [];
  if (clubIds.length) {
    const { data: rencontres } = await supabase
      .from('clubs_rencontres')
      .select('id, titre, prevu_le, mode, note_chapitres, clubs ( titre )')
      .in('club_id', clubIds)
      .gte('prevu_le', maintenant.toISOString())
      .order('prevu_le', { ascending: true })
      .limit(30);
    for (const r of (rencontres ?? []) as unknown as LigneRencontre[]) {
      brutesRencontres.push({
        cle: `rencontre-${r.id}`,
        prevuLe: r.prevu_le,
        titre: r.titre,
        clubTitre: r.clubs?.titre ?? 'Club',
        mode: r.mode,
        noteChapitres: r.note_chapitres,
        lien: '/clubs',
      });
    }
  }

  const brutesEcheances: BruteEcheance[] = (
    (defisLus ?? []) as unknown as Array<{
      id: string;
      titre: string;
      cible: number;
      echeance: string | null;
    }>
  ).map((d) => ({
    cle: `defi-${d.id}`,
    echeance: `${d.echeance}T23:59:00Z`,
    titre: d.titre,
    detail: `Défi de lecture · cible ${d.cible}`,
    lien: '/defis',
  }));

  const agenda = fusionnerAgenda(brutesRencontres, brutesEcheances, maintenant);

  // Sorties passées : traductions terminées récentes de l'atelier.
  const { data: sortiesLues } = await supabase
    .from('livres')
    .select('id, titre, updated_at')
    .eq('statut', 'traduit')
    .order('updated_at', { ascending: false })
    .limit(6);
  const sorties = (sortiesLues ?? []) as Array<{ id: string; titre: string; updated_at: string }>;

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
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fondu-monte">
        <header>
          <p className="sur-titre text-grenat-400">Suivis &amp; sorties</p>
          <h1 className="font-display text-3xl text-encre-100 mt-2">
            Vos œuvres suivies, leurs sorties
          </h1>
          <div className="liseret mt-3" />
          <p className="text-encre-500 text-sm mt-3 italic">
            Suivez les œuvres de votre atelier : leur agenda et leurs
            échéances se rassemblent ici. La plateforme ne publie pas de
            chapitres — les « sorties » sont les vôtres : rencontres des
            clubs, défis à échéance, traductions qui s'achèvent.
          </p>
        </header>

        {/* ---------- Agenda des sorties réelles ---------- */}
        <section aria-label="Agenda des sorties">
          <h2 className="sur-titre text-encre-300 flex items-center gap-2">
            <CalendarDays className="size-4" aria-hidden /> À venir
          </h2>
          {agenda.length === 0 ? (
            <p className="velours p-4 rounded-2xl text-sm text-encre-500 mt-2">
              Rien de prévu pour l'instant : une rencontre de club ou une
              échéance de défi apparaîtra ici dès qu'elle est posée — et
              vous serez prévenu par notification.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {agenda.map((e) => (
                <li key={e.cle} className="velours p-4 rounded-2xl">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={e.lien} className="text-sm text-encre-100 hover:text-grenat-300">
                      {e.titre}
                    </Link>
                    <span className="text-xs text-grenat-300">
                      {libelleDateAgenda(e.date)} · {libelleDelai(e.date, maintenant)}
                    </span>
                  </div>
                  <p className="text-xs text-encre-500 mt-1">
                    {e.genre === 'rencontre' ? 'Rencontre de club · ' : ''}
                    {e.detail}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- Œuvres suivies ---------- */}
        <section aria-label="Œuvres suivies">
          <h2 className="sur-titre text-encre-300 flex items-center gap-2">
            <BookmarkCheck className="size-4" aria-hidden /> Œuvres suivies
          </h2>
          {suivis.length === 0 ? (
            <p className="velours p-4 rounded-2xl text-sm text-encre-500 mt-2">
              Aucune œuvre suivie : le bouton « Suivre cette œuvre » se
              trouve sur la fiche de chaque livre et sur sa fiche
              d'ambiance.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {suivis.map((s) => {
                const avance =
                  s.chapitresTotal > 0
                    ? Math.round((s.chapitresTraduits / s.chapitresTotal) * 100)
                    : 0;
                return (
                  <li key={s.livreId} className="velours p-4 rounded-2xl">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link
                        href={`/livres/${s.livreId}`}
                        className="text-sm text-encre-100 hover:text-grenat-300"
                      >
                        {s.titre}
                      </Link>
                      <span className="text-xs text-encre-500">
                        {LIBELLES_STATUT[s.statut] ?? s.statut}
                        {s.chapitresTotal > 0 && (
                          <>
                            {' '}
                            · {s.chapitresTraduits}/{s.chapitresTotal} chapitres traduits
                          </>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-encre-500 mt-1">
                      {s.auteur && <span>{s.auteur} · </span>}
                      <Link href={`/ambiance/${s.livreId}`} className="hover:text-grenat-300">
                        Se remettre dans le ton avant de reprendre (fiche d'ambiance)
                      </Link>
                    </p>
                    {s.chapitresTotal > 0 && (
                      <div
                        className="mt-2 h-1.5 rounded-full bg-nuit-800 overflow-hidden"
                        role="img"
                        aria-label={`Traduction : ${avance} %`}
                      >
                        <div className="h-full bg-grenat-600" style={{ width: `${avance}%` }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---------- Sorties passées : traductions terminées ---------- */}
        {sorties.length > 0 && (
          <section aria-label="Traductions terminées récemment">
            <h2 className="sur-titre text-encre-300 flex items-center gap-2">
              <Sparkles className="size-4" aria-hidden /> Œuvres complètes
            </h2>
            <ul className="mt-2 space-y-2">
              {sorties.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-nuit-700/70 px-4 py-2.5 text-sm text-encre-200"
                >
                  <Link href={`/livres/${s.id}`} className="hover:text-grenat-300">
                    {s.titre}
                  </Link>
                  <span className="text-xs text-encre-500">
                    traduction achevée le {s.updated_at.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

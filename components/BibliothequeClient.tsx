'use client';

// Bibliothèque : grille des livres + zone d'import + suppression.
//
// - Tri (récents / titre / statut) + filtre par statut : logique
//   entièrement déléguée aux helpers pures de lib/tri-livres.ts
//   (testables, voir scripts/test-tri-livres.ts).
// - Accessibilité : barre d'outils regroupée (role=group), pastilles
//   ARIA (aria-pressed), select étiqueté, compte rendu en direct
//   (aria-live), grille déclarée en liste (role=list/listitem) —
//   les cartes restent ouvrables au clavier (Entrée / Espace) et
//   au clic, avec un focus visible (cf. .carte-livre:focus-visible
//   dans globals.css).
// - Persistance / Supabase : inchangée (l'agent « Autres » gère la
//   reprise côté serveur). Depuis P1.3/w6, la carte expose en plus les
//   chapitres en erreur AVEC une relance réelle, et un export EPUB
//   (lib/export-livre-epub.ts).

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { Livre } from '@/lib/types';
import type { StatutLivre } from '@/lib/types';
import { assainirProgression } from '@/lib/progression';
import type { ProgressionLecture } from '@/lib/progression';
import { CLEF_PROGRESSION } from '@/lib/progression';
import { creerClientNavigateur } from '@/lib/supabase/client';
import { useMoteurTraduction } from '@/lib/useMoteurTraduction';
import { chargerChapitresEnErreur } from '@/lib/relance-traduction';
import { exporterEpubLivre, telechargerEpub } from '@/lib/export-livre-epub';
import ZoneImport from './ZoneImport';
import BoutonFavori from './BoutonFavori';
import { useFavorites } from '@/lib/useFavorites';
import {
  compterParStatut,
  filtrerParStatut,
  STATUTS_LIVRES,
  trierLivres,
  type CritereTriLivres,
  type FiltreStatut,
} from '@/lib/tri-livres';

const ETIQUETTES_STATUT: Record<StatutLivre, string> = {
  importe: 'Importé',
  pret: 'Prêt à traduire',
  en_traduction: 'En traduction',
  traduit: 'Traduit',
  erreur: 'Erreurs à reprendre',
};

const COULEURS_STATUT: Record<StatutLivre, string> = {
  importe: 'bg-encre-500/15 text-encre-300',
  pret: 'bg-violet-rom-500/15 text-violet-rom-300',
  en_traduction: 'bg-grenat-500/15 text-grenat-300 animate-pouls-doux',
  traduit: 'bg-emerald-500/15 text-emerald-300',
  erreur: 'bg-amber-500/15 text-amber-300',
};

/** Options du tri (valeur = CritereTriLivres, libellé lisible). */
const OPTIONS_TRI: { valeur: CritereTriLivres; libelle: string }[] = [
  { valeur: 'recents', libelle: 'Modifiés récemment' },
  { valeur: 'titre', libelle: 'Titre (A → Z)' },
  { valeur: 'statut', libelle: 'Statut (à reprendre d’abord)' },
];

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface Props {
  livresInitiaux: Livre[];
  /**
   * Nombre de chapitres en erreur, par identifiant de livre
   * (calculé côté serveur — C5 : « chapitres en erreur visibles »).
   * Un livre absent de la table n'a aucun chapitre en erreur.
   */
  chapitresEnErreur?: Record<string, number>;
}

export default function BibliothequeClient({
  livresInitiaux,
  chapitresEnErreur = {},
}: Props) {
  const routeur = useRouter();
  const [livres, setLivres] = useState<Livre[]>(livresInitiaux);
  const [suppression, setSuppression] = useState<string | null>(null);
  // Points de lecture mémorisés (localStorage) — initialisation paresseuse
  // (un seul coup au rendu initial, sans état intermédiaire).
  const [progressions] = useState<
    Record<string, ProgressionLecture>
  >(() => {
    try {
      const brut = window.localStorage.getItem(CLEF_PROGRESSION);
      if (brut) {
        const p = assainirProgression(JSON.parse(brut));
        if (p) return { [p.livreId]: p };
      }
    } catch {
      /* stockage indisponible : pas de badge */
    }
    return {};
  });

  // ---------------- Favoris (hook unique, partagé par toutes les cartes) ----------------
  // Une seule requête Supabase par visite de la page : le résultat du
  // hook est passé à chaque BoutonFavori (sinon N cartes = N requêtes).
  const favoris = useFavorites();

  // ---------------- Chapitres en erreur + relance (P1.3) ----------------
  // Le compte initial vient du serveur ; il est ensuite tenu à jour
  // localement (mise à jour optimiste après une relance réussie).
  const [erreurs, setErreurs] =
    useState<Record<string, number>>(chapitresEnErreur);
  const [relanceEnCours, setRelanceEnCours] = useState<string | null>(null);
  const { actif: traductionActive, lancer } = useMoteurTraduction();

  // ---------------- Export EPUB (w6) ----------------
  const [epubEnCours, setEpubEnCours] = useState<string | null>(null);
  const [epubMessage, setEpubMessage] = useState<{
    id: string;
    texte: string;
    ok: boolean;
  } | null>(null);

  // ---------------- Tri + filtre (état local, purement visuel) ----------------
  const [critereTri, setCritereTri] = useState<CritereTriLivres>('recents');
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>(null);

  // Helpers pures : filtre d'abord, tri ensuite (ordres cohérents).
  const compteurs = compterParStatut(livres);
  const livresAffiches = trierLivres(
    filtrerParStatut(livres, filtreStatut),
    critereTri
  );

  function ouvrirLivre(livre: Livre) {
    routeur.push(`/livres/${livre.id}`);
  }

  async function supprimer(livre: Livre) {
    if (
      !window.confirm(
        `Définitivement ? « ${livre.titre} » quittera votre bibliothèque, avec sa traduction.`
      )
    ) {
      return;
    }
    setSuppression(livre.id);
    const supabase = creerClientNavigateur();
    const { error } = await supabase.from('livres').delete().eq('id', livre.id);
    setSuppression(null);
    if (error) {
      window.alert(`Suppression impossible : ${error.message}`);
      return;
    }
    setLivres((l) => l.filter((x) => x.id !== livre.id));
    routeur.refresh();
  }

  /** Recharge depuis la base le nombre de chapitres en erreur d'un livre. */
  const rafraichirErreurs = useCallback(async (livreId: string) => {
    const supabase = creerClientNavigateur();
    const { count } = await supabase
      .from('chapitres')
      .select('id', { count: 'exact', head: true })
      .eq('livre_id', livreId)
      .eq('statut', 'erreur');
    setErreurs((e) => ({ ...e, [livreId]: count ?? 0 }));
  }, []);

  /**
   * Relance la traduction des chapitres en erreur d'un livre (P1.3).
   * Reprend le MÊME moteur que l'espace de lecture : les segments
   * abandonnés sont remis dans la file, les chapitres repassent
   * « traduit » dès qu'ils sont complets. Le compte affiché est ensuite
   * relu en base (jamais supposé).
   */
  const relancerErreurs = useCallback(
    async (livre: Livre) => {
      if (traductionActive || relanceEnCours) return;
      setRelanceEnCours(livre.id);
      try {
        const supabase = creerClientNavigateur();
        const chapitres = await chargerChapitresEnErreur(supabase, livre.id);
        if (chapitres.length === 0) {
          setErreurs((e) => ({ ...e, [livre.id]: 0 }));
          return;
        }
        await lancer(supabase, chapitres, livre, () => {
          /* l'état local est rechargé depuis la base juste après */
        });
        await rafraichirErreurs(livre.id);
        routeur.refresh();
      } catch (e) {
        window.alert(
          `Relance impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`
        );
      } finally {
        setRelanceEnCours(null);
      }
    },
    [traductionActive, relanceEnCours, lancer, rafraichirErreurs, routeur]
  );

  /**
   * Export EPUB du livre (w6) : titre, auteur, table des matières par
   * chapitre, texte traduit, métadonnée de langue FR. L'archive est
   * auto-vérifiée (OCF) avant d'être remise à l'utilisateur.
   */
  const exporterEpub = useCallback(
    async (livre: Livre) => {
      if (epubEnCours) return;
      setEpubEnCours(livre.id);
      setEpubMessage(null);
      try {
        const supabase = creerClientNavigateur();
        const resultat = await exporterEpubLivre(supabase, livre);
        if (!resultat.ocf.ok) {
          throw new Error(
            `EPUB non conforme (${resultat.ocf.problemes.join(' ; ')})`
          );
        }
        telechargerEpub(resultat.octets, resultat.nomFichier);
        setEpubMessage({
          id: livre.id,
          ok: true,
          texte:
            `EPUB prêt — ${resultat.nbChapitres} chapitre` +
            `${resultat.nbChapitres > 1 ? 's' : ''} ` +
            `(${(resultat.octets.length / 1024).toFixed(0)} Kio)` +
            (resultat.chapitresSources > 0
              ? ` ; ${resultat.chapitresSources} encore en langue source.`
              : ' ; texte entièrement traduit.'),
        });
      } catch (e) {
        setEpubMessage({
          id: livre.id,
          ok: false,
          texte: `Export EPUB impossible : ${
            e instanceof Error ? e.message : 'erreur inconnue'
          }`,
        });
      } finally {
        setEpubEnCours(null);
      }
    },
    [epubEnCours]
  );

  // Pastille de filtre : base commune (pilule discrète) + état actif.
  function pastilleFiltre(
    libelle: string,
    compte: number,
    actif: boolean,
    action: () => void
  ) {
    return (
      <button
        key={libelle}
        type="button"
        onClick={action}
        aria-pressed={actif}
        className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider transition-colors cursor-pointer border focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grenat-400 ${
          actif
            ? 'bg-grenat-500/20 text-grenat-300 border-grenat-500/60'
            : 'bg-white/[0.03] text-encre-500 border-transparent hover:text-encre-300 hover:bg-white/[0.07]'
        }`}
      >
        {libelle}
        <span className="ml-1.5 opacity-70" aria-hidden>
          {compte}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-8">
      {/* id : ancre du CTA d'import (état vide « premier livre ») */}
      <div id="zone-import" tabIndex={-1} className="focus:outline-none">
        <ZoneImport />
      </div>

      {/* ---------------- Barre d'outils : filtre statut + tri ---------------- */}
      {livres.length > 0 && (
        <section
          className="velours p-3 sm:p-4"
          aria-label="Filtres et tri de la bibliothèque"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Filtrer les livres par statut"
            >
              {pastilleFiltre('Tous', livres.length, filtreStatut === null, () =>
                setFiltreStatut(null)
              )}
              {STATUTS_LIVRES.map((statut) =>
                pastilleFiltre(
                  ETIQUETTES_STATUT[statut],
                  compteurs[statut],
                  filtreStatut === statut,
                  () =>
                    setFiltreStatut((actuel) => (actuel === statut ? null : statut))
                )
              )}
            </div>

            {/* Tri : select compact aligné à droite (responsive : bascule sous les pastilles) */}
            <div className="ml-auto">
              <label
                htmlFor="tri-bibliotheque"
                className="sr-only"
              >
                Trier les livres
              </label>
              <select
                id="tri-bibliotheque"
                className="select-sombre text-[13px] py-1.5"
                value={critereTri}
                onChange={(e) =>
                  setCritereTri(e.target.value as CritereTriLivres)
                }
              >
                {OPTIONS_TRI.map((o) => (
                  <option key={o.valeur} value={o.valeur}>
                    {o.libelle}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Compteur « visibles / total » — lu par les lecteurs d'écran
              à chaque changement de filtre ou de tri (aria-live). */}
          <p aria-live="polite" className="sr-only">
            {livresAffiches.length} livre
            {livresAffiches.length > 1 ? 's' : ''} affiché
            {livresAffiches.length > 1 ? 's' : ''}
            {filtreStatut !== null
              ? ` sur ${livres.length} (statut : ${ETIQUETTES_STATUT[filtreStatut]})`
              : ''}
          </p>
        </section>
      )}

      {/* ---------------- État vide : bibliothèque vide ---------------- */}
      {livres.length === 0 ? (
        <div className="velours p-10 sm:p-12 text-center animate-fondu-monte">
          <p className="text-5xl mb-4 opacity-80" aria-hidden>
            🖋️
          </p>
          <p className="text-encre-100 font-display text-2xl">
            Une page blanche vous tend les bras.
          </p>
          <div className="liseret mx-auto mt-4" />
          <p className="text-encre-500 text-sm mt-5 max-w-lg mx-auto leading-relaxed italic">
            Déposez un premier manuscrit dans la zone ci-dessus : l’extraction du
            texte, le découpage en chapitres, la traduction et la reprise sont
            automatiques. Vous n’avez rien à préparer.
          </p>

          {/* Formats acceptés — le rappel utile au tout premier import */}
          <ul className="flex flex-wrap items-center justify-center gap-2 mt-6">
            {[
              { ext: '.txt', conseil: 'le plus fiable' },
              { ext: '.md', conseil: 'titres reconnus' },
              { ext: '.epub', conseil: 'chapitres repris' },
              { ext: '.pdf', conseil: 'texte sélectionnable' },
            ].map((f) => (
              <li
                key={f.ext}
                className="rounded-full border border-nuit-700 bg-white/[0.03] px-3 py-1.5 text-[11px] text-encre-300"
              >
                <span className="font-display text-grenat-300">{f.ext}</span>
                <span className="text-encre-500"> — {f.conseil}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-7">
            {/* CTA d'import : ancre la zone de dépôt déjà présente plus
                haut (l'URL d'import « réelle » est bien /bibliotheque). */}
            <a href="#zone-import" className="bouton-principal">
              <span aria-hidden>🕯️</span>
              Importer votre premier livre
            </a>
            <a href="/faq" className="bouton-fantome">
              Voir la FAQ
            </a>
          </div>

          <p className="text-encre-500/80 text-[11px] mt-6 italic">
            Un PDF scanné (photocopie) ne contient pas de texte : préférez .txt, .md
            ou .epub.
          </p>
        </div>
      ) : (
        <>
          {/* ---------------- Grille des livres ---------------- */}
          {livresAffiches.length === 0 ? (
            /* Filtrés à sec : aucun livre ne porte ce statut.
               (le message n'est pas « bibliothèque vide » : il y
               a des livres, juste pas sous ce filtre.) */
            <div className="velours p-10 text-center animate-fondu-monte">
              <p className="text-3xl mb-3 opacity-70" aria-hidden>
                🌒
              </p>
              <p className="text-encre-300 font-display text-lg">
                Aucun livre ne porte ce badge pour l’instant.
              </p>
              <button
                type="button"
                onClick={() => setFiltreStatut(null)}
                className="bouton-fantome mt-5"
              >
                Tout afficher
              </button>
            </div>
          ) : (
            <div
              role="list"
              aria-label={`Livres (${livresAffiches.length})`}
              className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {livresAffiches.map((livre, i) => (
                <article
                  key={livre.id}
                  role="listitem"
                  className="carte-livre animate-fondu-monte group cursor-pointer"
                  style={{ animationDelay: `${i * 60}ms` }}
                  tabIndex={0}
                  aria-label={`Ouvrir « ${livre.titre} » (${ETIQUETTES_STATUT[livre.statut]})`}
                  onClick={() => ouvrirLivre(livre)}
                  onKeyDown={(e) => {
                    // Clavier : Entrée ou Espace ouvre le livre (comme le clic).
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      ouvrirLivre(livre);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg text-encre-100 leading-snug group-hover:text-grenat-300 transition-colors line-clamp-2">
                        {livre.titre}
                      </h3>
                      {livre.auteur && (
                        <p className="text-encre-500 text-xs mt-0.5 italic truncate">
                          {livre.auteur}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 text-[10px] uppercase tracking-wider rounded-full px-2.5 py-1 ${COULEURS_STATUT[livre.statut]}`}
                    >
                      {ETIQUETTES_STATUT[livre.statut]}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <p className="text-[11px] text-encre-500 break-all min-w-0">
                      {livre.langue_source.toUpperCase()} →{' '}
                      {livre.langue_cible.toUpperCase()} · {livre.nom_fichier}
                    </p>
                    <span
                      aria-hidden
                      className="shrink-0 text-[11px] text-encre-500 group-hover:text-grenat-300 transition-colors"
                    >
                      Ouvrir →
                    </span>
                  </div>

                  {progressions[livre.id] && (
                    <div className="min-w-0">
                      <p
                        className="text-[11px] text-grenat-300/90 flex items-center gap-1.5"
                        title="Où vous en étiez la dernière fois"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-grenat-400 animate-pouls-doux shrink-0" />
                        Reprendre :{' '}
                        <span className="truncate">
                          {progressions[livre.id].libelle || 'lecture'}
                        </span>{' '}
                        · {Math.round(progressions[livre.id].ratio * 100)} %
                      </p>
                      {/* Barre de reprise : lecture d'un coup d'œil, mobile inclus */}
                      <div
                        className="mt-1.5 h-1 rounded-full bg-nuit-700/70 overflow-hidden"
                        aria-hidden
                      >
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-grenat-600 to-grenat-400"
                          style={{
                            width: `${Math.round(
                              progressions[livre.id].ratio * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Chapitres en erreur (P1.3) : un livre peut être
                      marqué « traduit » avec des chapitres à reprendre —
                      on le montre sur la carte ET on propose une relance,
                      au lieu de laisser une page vide incompréhensible. */}
                  {(erreurs[livre.id] ?? 0) > 0 && (
                    <div
                      data-alerte-chapitres={livre.id}
                      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2"
                    >
                      <p className="text-[11px] text-amber-200 flex items-center gap-1.5 min-w-0">
                        <span aria-hidden>⚠</span>
                        <span className="truncate">
                          {erreurs[livre.id] === 1
                            ? 'Traduction en échec : 1 chapitre à reprendre'
                            : `Traduction en échec : ${erreurs[livre.id]} chapitres à reprendre`}
                        </span>
                      </p>
                      <button
                        type="button"
                        title="Relancer la traduction des chapitres en erreur"
                        disabled={
                          relanceEnCours === livre.id || traductionActive
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          relancerErreurs(livre);
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            relancerErreurs(livre);
                          }
                        }}
                        className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-300"
                      >
                        <span aria-hidden>↻</span>
                        {relanceEnCours === livre.id
                          ? 'Relance en cours…'
                          : 'Relancer la traduction'}
                      </button>
                    </div>
                  )}

                  {/* Message d'export EPUB (succès chiffré ou erreur). */}
                  {epubMessage?.id === livre.id && (
                    <p
                      role="status"
                      className={`text-[11px] leading-snug ${
                        epubMessage.ok ? 'text-emerald-300' : 'text-grenat-300'
                      }`}
                    >
                      {epubMessage.texte}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 text-[11px] text-encre-500 mt-auto pt-2 border-t border-nuit-700/60">
                    <span className="truncate min-w-0">
                      Ajouté le {dateCourte(livre.created_at)}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <BoutonFavori
                        livreId={livre.id}
                        titre={livre.titre}
                        hook={favoris}
                      />
                      <button
                        type="button"
                        title="Télécharger l’EPUB (titre, sommaire par chapitre, texte traduit, langue FR)"
                        disabled={epubEnCours === livre.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          exporterEpub(livre);
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            exporterEpub(livre);
                          }
                        }}
                        className="text-encre-500 hover:text-grenat-400 transition-colors cursor-pointer disabled:opacity-40 shrink-0 px-2 py-1 rounded-md hover:bg-grenat-500/10 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-grenat-400"
                        aria-label={`Télécharger le livre « ${livre.titre} » en EPUB`}
                      >
                        {epubEnCours === livre.id ? '…' : 'EPUB'}
                      </button>
                      <button
                      type="button"
                      onClick={(e) => {
                        // Le clic sur « Supprimer » ne doit pas ouvrir
                        // le livre (la carte parente écoute aussi le clic).
                        e.stopPropagation();
                        supprimer(livre);
                      }}
                      onKeyDown={(e) => {
                        // Idem au clavier : pas d'ouverture quand le
                        // focus est sur le bouton de suppression.
                        e.stopPropagation();
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          supprimer(livre);
                        }
                      }}
                      disabled={suppression === livre.id}
                      className="text-encre-500 hover:text-grenat-400 transition-colors cursor-pointer disabled:opacity-40 shrink-0 px-2 py-1 rounded-md hover:bg-grenat-500/10 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-grenat-400"
                      title="Supprimer le livre"
                      aria-label={`Supprimer « ${livre.titre} »`}
                    >
                      {suppression === livre.id ? '…' : 'Supprimer'}
                    </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
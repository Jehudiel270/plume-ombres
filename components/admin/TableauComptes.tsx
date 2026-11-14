'use client';

// ============================================================
// components/admin/TableauComptes.tsx — Comptes + gestion des
// abonnements par un administrateur (vague W8/W9).
//
// AJOUTS : recherche (pseudo / courriel / plan), filtres (rôle, plan,
// statut, anomalies), tri, pagination, mise en évidence des anomalies
// et CONFIRMATION explicite avant l'action destructrice « retirer ».
//
// L'interface CACHE les boutons pour qui n'a pas la permission, mais
// elle ne décide rien : chaque appel part vers /api/admin/abonnement,
// dont le GARDE SERVEUR (lib/roles-garde) tranche réellement et
// journalise l'action dans public.admin_actions.
//
// SÉCURITÉ : aucune donnée de contenu de livre n'est manipulée ni
// affichée ici — pseudo, courriel, rôle, dates et abonnement.
//
// RESPONSIVE : un seul DOM. Sous 768 px, chaque compte devient une
// carte empilée (libellés visibles) ; au-delà, une grille de colonnes
// alignée sur un en-tête masqué pour les petits écrans.
// ============================================================

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import {
  DUREES_ADMIN,
  JOURS_PAR_DUREE,
  estDureeAdmin,
  type DureeAdmin,
} from '@/lib/admin-abonnements';
import {
  abonnementActif,
  detecterAnomalies,
  LIBELLES_ANOMALIE,
  nomPlan,
  type CompteAdmin,
  type PlanAdmin,
} from '@/lib/admin-stats';
import ModaleConfirmation from './ModaleConfirmation';
import Pagination from './Pagination';
import { LIBELLES_ROLES, normaliserRole } from '@/lib/roles';

interface Props {
  comptes: CompteAdmin[];
  /** id de compte → courriel (RPC admin_courriels_comptes). */
  emails: Record<string, string>;
  /** Catalogue des plans (plans_abonnement) pour nommer les formules. */
  plans: PlanAdmin[];
  /** Faux quand le schéma d'abonnement n'est pas encore fusionné. */
  abonnementsDisponibles: boolean;
}

const LIBELLES_DUREE: Record<DureeAdmin, string> = {
  '1_mois': '1 mois',
  '3_mois': '3 mois',
  '12_mois': '12 mois',
  vie: 'à vie',
};

const TAILLES_PAGE = [5, 10, 25, 50] as const;

type Tri = 'inscription_desc' | 'inscription_asc' | 'pseudo_asc' | 'pseudo_desc' | 'plan_asc';
type FiltreStatut = 'tous' | 'actif' | 'inactif' | 'aucun';

/** Normalise pour comparer sans casse ni accents. */
function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function dateCourte(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

/** Cellule étiquetée : le libellé n'est visible que sur mobile. */
function Champ({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="md:sr-only block text-encre-500 text-[11px] uppercase tracking-wider">
        {libelle}
      </span>
      {children}
    </div>
  );
}

export default function TableauComptes({
  comptes,
  emails,
  plans,
  abonnementsDisponibles,
}: Props) {
  const routeur = useRouter();
  const [dureeParCompte, setDureeParCompte] = useState<Record<string, string>>({});
  const [dateParCompte, setDateParCompte] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; texte: string; ok: boolean } | null>(null);

  // --- recherche / filtres / tri / pagination ---
  const [recherche, setRecherche] = useState('');
  const [filtreRole, setFiltreRole] = useState('tous');
  const [filtrePlan, setFiltrePlan] = useState('tous');
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>('tous');
  const [anomaliesSeules, setAnomaliesSeules] = useState(false);
  const [tri, setTri] = useState<Tri>('inscription_desc');
  const [page, setPage] = useState(1);
  const [taillePage, setTaillePage] = useState<number>(10);

  // --- confirmation d'action destructrice ---
  const [aRetirer, setARetirer] = useState<CompteAdmin | null>(null);

  // Recherche déposée par la palette Ctrl+K (onglet « Comptes »).
  useEffect(() => {
    function surRecherche(evenement: Event) {
      const detail = (evenement as CustomEvent<{ onglet?: string; texte?: string }>).detail;
      if (!detail || detail.onglet !== 'comptes' || typeof detail.texte !== 'string') return;
      setRecherche(detail.texte as string);
      setPage(1);
    }
    window.addEventListener('plume:recherche', surRecherche);
    return () => window.removeEventListener('plume:recherche', surRecherche);
  }, []);

  /** Liste enrichie (courriel + anomalies) puis filtrée et triée. */
  const comptesFiltres = useMemo(() => {
    const requete = normaliser(recherche.trim());
    const enrichis = comptes.map((compte) => {
      const courriel = emails[compte.id] ?? '';
      return {
        compte,
        courriel,
        codes: detecterAnomalies(compte, plans),
      };
    });

    const filtres = enrichis.filter(({ compte, courriel, codes }) => {
      if (filtreRole !== 'tous' && compte.role !== filtreRole) return false;
      if (filtrePlan !== 'tous' && compte.abonnementPlan !== filtrePlan) return false;
      if (filtreStatut !== 'tous') {
        const actif = abonnementActif(compte);
        if (filtreStatut === 'actif' && !actif) return false;
        if (filtreStatut === 'inactif' && (actif || !compte.abonnementStatut)) return false;
        if (filtreStatut === 'aucun' && compte.abonnementStatut) return false;
      }
      if (anomaliesSeules && codes.length === 0) return false;
      if (requete) {
        const moisson = normaliser(
          [compte.pseudo, courriel, compte.abonnementPlan ?? '', nomPlan(compte.abonnementPlan, plans)].join(' ')
        );
        if (!moisson.includes(requete)) return false;
      }
      return true;
    });

    const trie = [...filtres].sort((a, b) => {
      switch (tri) {
        case 'pseudo_asc':
          return a.compte.pseudo.localeCompare(b.compte.pseudo, 'fr');
        case 'pseudo_desc':
          return b.compte.pseudo.localeCompare(a.compte.pseudo, 'fr');
        case 'plan_asc':
          return nomPlan(a.compte.abonnementPlan, plans).localeCompare(
            nomPlan(b.compte.abonnementPlan, plans),
            'fr'
          );
        case 'inscription_asc':
          return (
            new Date(a.compte.creeLe ?? 0).getTime() - new Date(b.compte.creeLe ?? 0).getTime()
          );
        default:
          return (
            new Date(b.compte.creeLe ?? 0).getTime() - new Date(a.compte.creeLe ?? 0).getTime()
          );
      }
    });

    return trie;
  }, [comptes, emails, plans, recherche, filtreRole, filtrePlan, filtreStatut, anomaliesSeules, tri]);

  const nbPages = Math.max(1, Math.ceil(comptesFiltres.length / taillePage));
  // Toute modification de filtre/taille ramène en page 1 (dans les
  // gestionnaires) ; on borne ici le cas résiduel où la liste rétrécit
  // après un rafraîchissement serveur (aucun setState dans un effet).
  const pageSure = Math.min(page, nbPages);
  const debut = (pageSure - 1) * taillePage;
  const pageCourante = comptesFiltres.slice(debut, debut + taillePage);

  /** Plans présents dans les comptes (pour le filtre). */
  const plansPresents = useMemo(() => {
    const codes = new Set<string>();
    for (const c of comptes) if (c.abonnementPlan) codes.add(c.abonnementPlan);
    return [...codes].sort();
  }, [comptes]);

  function dureeChoisie(id: string): string {
    return dureeParCompte[id] ?? '1_mois';
  }

  function reinitialiser() {
    setRecherche('');
    setFiltreRole('tous');
    setFiltrePlan('tous');
    setFiltreStatut('tous');
    setAnomaliesSeules(false);
    setTri('inscription_desc');
    setPage(1);
  }

  async function appeler(
    id: string,
    methode: 'POST' | 'DELETE',
    duree?: string
  ): Promise<void> {
    setEnCours(`${methode}:${id}`);
    setMessage(null);
    try {
      const reponse = await fetch('/api/admin/abonnement', {
        method: methode,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          methode === 'POST' ? { utilisateurId: id, duree } : { utilisateurId: id }
        ),
      });
      const corps = (await reponse.json().catch(() => ({}))) as { erreur?: string; duree?: string };
      if (!reponse.ok) {
        setMessage({ id, texte: corps.erreur ?? `Échec (${reponse.status}).`, ok: false });
      } else {
        setMessage({
          id,
          texte:
            methode === 'POST'
              ? `Abonnement accordé (${corps.duree ?? duree}). Action journalisée.`
              : 'Abonnement retiré. Action journalisée.',
          ok: true,
        });
        routeur.refresh();
      }
    } catch {
      setMessage({ id, texte: 'Réseau indisponible.', ok: false });
    } finally {
      setEnCours(null);
      setARetirer(null);
    }
  }

  const actifFiltre =
    recherche.trim() !== '' ||
    filtreRole !== 'tous' ||
    filtrePlan !== 'tous' ||
    filtreStatut !== 'tous' ||
    anomaliesSeules;

  return (
    <div className="space-y-4">
      {!abonnementsDisponibles && (
        <p className="text-violet-rom-300 text-xs leading-relaxed rounded-lg border border-violet-rom-500/40 bg-violet-rom-500/10 px-3 py-2">
          Le schéma d’abonnement n’est pas encore fusionné : la colonne « Abonnement »
          restera vide et l’attribution renverra une erreur tant que la branche paiement
          n’est pas déployée.
        </p>
      )}

      {/* ----- Barre de recherche / filtres / tri ----- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block min-w-0 sm:col-span-2">
          <span className="text-encre-500 text-[11px] uppercase tracking-wider">Recherche</span>
          <input
            type="search"
            value={recherche}
            onChange={(e) => {
              setRecherche(e.target.value);
              setPage(1);
            }}
            placeholder="Pseudo, courriel ou plan…"
            aria-label="Rechercher un compte par pseudo, courriel ou plan"
            className="champ-sombre mt-1"
          />
        </label>

        <label className="block min-w-0">
          <span className="text-encre-500 text-[11px] uppercase tracking-wider">Rôle</span>
          <select
            value={filtreRole}
            onChange={(e) => {
              setFiltreRole(e.target.value);
              setPage(1);
            }}
            aria-label="Filtrer par rôle"
            className="select-sombre mt-1 w-full"
          >
            <option value="tous">Tous les rôles</option>
            <option value="super_admin">Super-administrateurs</option>
            <option value="admin">Administrateurs</option>
            <option value="utilisateur">Utilisateurs</option>
          </select>
        </label>

        <label className="block min-w-0">
          <span className="text-encre-500 text-[11px] uppercase tracking-wider">Statut</span>
          <select
            value={filtreStatut}
            onChange={(e) => {
              setFiltreStatut(e.target.value as FiltreStatut);
              setPage(1);
            }}
            aria-label="Filtrer par statut d’abonnement"
            className="select-sombre mt-1 w-full"
          >
            <option value="tous">Tous les statuts</option>
            <option value="actif">Abonnement actif</option>
            <option value="inactif">Abonnement inactif</option>
            <option value="aucun">Aucun abonnement</option>
          </select>
        </label>

        <label className="block min-w-0">
          <span className="text-encre-500 text-[11px] uppercase tracking-wider">Plan</span>
          <select
            value={filtrePlan}
            onChange={(e) => {
              setFiltrePlan(e.target.value);
              setPage(1);
            }}
            aria-label="Filtrer par plan"
            className="select-sombre mt-1 w-full"
            disabled={plansPresents.length === 0}
          >
            <option value="tous">Tous les plans</option>
            {plansPresents.map((code) => (
              <option key={code} value={code}>
                {nomPlan(code, plans)}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="text-encre-500 text-[11px] uppercase tracking-wider">Tri</span>
          <select
            value={tri}
            onChange={(e) => {
              setTri(e.target.value as Tri);
              setPage(1);
            }}
            aria-label="Trier les comptes"
            className="select-sombre mt-1 w-full"
          >
            <option value="inscription_desc">Inscription — plus récents</option>
            <option value="inscription_asc">Inscription — plus anciens</option>
            <option value="pseudo_asc">Pseudo (A → Z)</option>
            <option value="pseudo_desc">Pseudo (Z → A)</option>
            <option value="plan_asc">Plan (A → Z)</option>
          </select>
        </label>

        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-2">
          <button
            type="button"
            onClick={() => {
              setAnomaliesSeules((v) => !v);
              setPage(1);
            }}
            aria-pressed={anomaliesSeules}
            className={anomaliesSeules ? 'bouton-principal' : 'bouton-fantome'}
          >
            <TriangleAlert className="w-4 h-4" aria-hidden="true" />
            Anomalies seules
          </button>
          {actifFiltre && (
            <button type="button" onClick={reinitialiser} className="bouton-fantome">
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {comptes.length === 0 ? (
        <p className="text-encre-500 text-sm italic">Aucun compte à afficher.</p>
      ) : comptesFiltres.length === 0 ? (
        <p className="text-encre-500 text-sm italic">
          Aucun compte ne correspond à ces critères.
        </p>
      ) : (
        <>
          {/* ----- En-tête (masqué sous 768 px : les libellés sont dans chaque carte) ----- */}
          <div
            aria-hidden="true"
            className="hidden md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,2.4fr)] gap-x-4 text-encre-500 text-xs uppercase tracking-wider px-1"
          >
            <span>Compte</span>
            <span>Rôle</span>
            <span>Abonnement</span>
            <span>Accorder / retirer</span>
          </div>

          <ul id="liste-comptes" role="list" className="border-t border-nuit-700/50">
            {pageCourante.map(({ compte, courriel, codes }) => {
              const actif = abonnementActif(compte);
              const choix = dureeChoisie(compte.id);
              const surDate = choix === 'date';
              const aAnomalie = codes.length > 0;
              return (
                <li
                  key={compte.id}
                  className={`grid gap-3 md:gap-x-4 py-4 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,2.4fr)] md:items-start border-t border-nuit-700/50 ${
                    aAnomalie ? 'md:border-l-2 md:border-l-grenat-500/70 md:pl-3' : ''
                  }`}
                >
                  <Champ libelle="Compte">
                    <p className="text-encre-100 break-words">{compte.pseudo}</p>
                    {courriel && (
                      <p className="text-encre-500 text-[11px] break-all">{courriel}</p>
                    )}
                    <p className="text-encre-500 text-[11px]">
                      inscrit le {dateCourte(compte.creeLe)}
                    </p>
                  </Champ>

                  <Champ libelle="Rôle">
                    <span
                      className={
                        normaliserRole(compte.role) === 'super_admin'
                          ? 'inline-block rounded-full px-2 py-0.5 text-[11px] bg-violet-rom-500/25 text-violet-rom-200 border border-violet-rom-500/50'
                          : normaliserRole(compte.role) === 'admin'
                            ? 'inline-block rounded-full px-2 py-0.5 text-[11px] bg-grenat-500/20 text-grenat-300 border border-grenat-500/40'
                            : 'inline-block rounded-full px-2 py-0.5 text-[11px] bg-nuit-700/40 text-encre-300 border border-nuit-700'
                      }
                    >
                      {LIBELLES_ROLES[normaliserRole(compte.role)]}
                    </span>
                  </Champ>

                  <Champ libelle="Abonnement">
                    {actif ? (
                      <span className="text-violet-rom-300 text-xs">
                        actif jusqu’au {dateCourte(compte.abonnementFin)}
                      </span>
                    ) : (
                      <span className="text-encre-500 text-xs">
                        {compte.abonnementStatut ?? 'aucun'}
                      </span>
                    )}
                    {compte.abonnementPlan && (
                      <span className="block text-encre-500 text-[11px]">
                        {nomPlan(compte.abonnementPlan, plans)}
                      </span>
                    )}
                    {aAnomalie && (
                      <ul className="mt-1 flex flex-wrap gap-1">
                        {codes.map((code) => (
                          <li
                            key={code}
                            title={LIBELLES_ANOMALIE[code]}
                            className="rounded-full border border-grenat-500/50 bg-grenat-500/15 text-grenat-300 px-2 py-0.5 text-[11px]"
                          >
                            {LIBELLES_ANOMALIE[code]}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Champ>

                  <Champ libelle="Accorder / retirer">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Durée pour ${compte.pseudo}`}
                        value={choix}
                        onChange={(e) =>
                          setDureeParCompte((m) => ({ ...m, [compte.id]: e.target.value }))
                        }
                        className="select-sombre"
                      >
                        {DUREES_ADMIN.map((d) => (
                          <option key={d} value={d}>
                            {LIBELLES_DUREE[d]}
                          </option>
                        ))}
                        <option value="date">jusqu’à une date…</option>
                      </select>
                      {surDate && (
                        <span className="inline-block w-full sm:w-40">
                          <input
                            type="date"
                            aria-label={`Date de fin pour ${compte.pseudo}`}
                            value={dateParCompte[compte.id] ?? ''}
                            onChange={(e) =>
                              setDateParCompte((m) => ({ ...m, [compte.id]: e.target.value }))
                            }
                            className="champ-sombre"
                          />
                        </span>
                      )}
                      <button
                        onClick={() =>
                          appeler(
                            compte.id,
                            'POST',
                            surDate ? dateParCompte[compte.id] : choix
                          )
                        }
                        disabled={
                          enCours !== null ||
                          (surDate && !dateParCompte[compte.id]) ||
                          (surDate ? false : !estDureeAdmin(choix))
                        }
                        className="bouton-fantome !px-3 text-xs"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        Accorder
                      </button>
                      <button
                        onClick={() => setARetirer(compte)}
                        disabled={enCours !== null || !actif}
                        className="bouton-fantome !px-3 text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Retirer
                      </button>
                    </div>
                    {message?.id === compte.id && (
                      <p
                        role="status"
                        className={
                          message.ok
                            ? 'text-violet-rom-300 text-[11px] mt-1'
                            : 'text-grenat-300 text-[11px] mt-1'
                        }
                      >
                        {message.texte}
                      </p>
                    )}
                  </Champ>
                </li>
              );
            })}
          </ul>

          <Pagination
            page={pageSure}
            nbPages={nbPages}
            total={comptesFiltres.length}
            debut={debut}
            affiches={pageCourante.length}
            taillePage={taillePage}
            onPage={setPage}
            onTaillePage={(t) => {
              setTaillePage(t);
              setPage(1);
            }}
            taillesPage={TAILLES_PAGE}
          />
        </>
      )}

      <p className="text-encre-500 text-[11px] italic">
        « à vie » accorde {JOURS_PAR_DUREE.vie} jours (aucun plan « vie » en base). Chaque
        action est journalisée (qui, quoi, quand) dans <code>admin_actions</code> et reprise
        dans le journal ci-dessous.
      </p>

      <ModaleConfirmation
        ouvert={aRetirer !== null}
        titre="Retirer cet abonnement ?"
        description={
          aRetirer
            ? `L’abonnement de ${aRetirer.pseudo} sera résilié immédiatement. L’action est journalisée et réversible (vous pouvez réaccorder un abonnement ensuite).`
            : ''
        }
        libelleConfirmer="Retirer l’abonnement"
        enCours={enCours !== null}
        onConfirmer={() => {
          if (aRetirer) appeler(aRetirer.id, 'DELETE');
        }}
        onAnnuler={() => setARetirer(null)}
      />
    </div>
  );
}

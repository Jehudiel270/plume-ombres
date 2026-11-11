'use client';

// ============================================================
// components/admin/GestionRoles.tsx — Nommer / rétrograder des
// administrateurs (onglet « Rôles », réservé au SUPER-administrateur).
//
// AJOUT de la vague « super_admin » : aucun bloc existant n'est
// modifié, ce panneau vient s'AJOUTER aux cinq onglets livrés.
//
// RÔLES GÉRÉS : utilisateur · admin · super_admin
//   * `admin`        — tableau de bord d'exploitation (comptes,
//                      abonnements, paiements) ;
//   * `super_admin`  — tout ce qui précède, PLUS la nomination et la
//                      révocation des rôles (ce panneau).
//
// RÈGLES DE SÉCURITÉ (elles sont RÉAPPLIQUÉES côté serveur, ici ce
// n'est qu'un confort d'interface) :
//   * un super-administrateur ne peut pas modifier SON PROPRE rôle —
//     la ligne est désactivée et expliquée ;
//   * la promotion au rang de super-administrateur demande une
//     CONFIRMATION explicite (action sensible) ;
//   * chaque changement part vers /api/admin/roles, dont le garde
//     serveur tranche réellement, puis la RPC `admin_changer_role`
//     re-vérifie le rôle DANS la base et journalise l'action.
//
// SÉCURITÉ DES DONNÉES : pseudo, courriel et rôle uniquement — aucun
// contenu de livre.
//
// RESPONSIVE : un seul DOM. Sous 768 px chaque compte devient une
// carte empilée avec libellés visibles ; au-delà, colonnes alignées.
// ============================================================

import { useMemo, useState, type ReactNode } from 'react';
import {
  LIBELLES_ROLES,
  ROLES,
  aLaPermission,
  estSuperAdmin,
  normaliserRole,
  permissionPourSupprimerCompte,
  type Role,
} from '@/lib/roles';
import type { CompteAdmin } from '@/lib/admin-stats';
import ModaleConfirmation from './ModaleConfirmation';

interface Props {
  comptes: CompteAdmin[];
  /** id de compte → courriel (RPC admin_courriels_comptes). */
  emails: Record<string, string>;
  /** Identifiant du super-administrateur connecté (sa ligne est verrouillée). */
  moiId: string;
  /** Rôle réel de l'appelant (le serveur l'a déjà validé). */
  roleCourant: Role;
}

/** Normalise pour comparer sans casse ni accents. */
function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
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

/** Pastille de rôle (teinte dédiée au super-admin, aucune couleur en dur). */
function PastilleRole({ role }: { role: Role }) {
  const classes =
    role === 'super_admin'
      ? 'bg-violet-rom-500/25 text-violet-rom-200 border border-violet-rom-500/50'
      : role === 'admin'
        ? 'bg-grenat-500/20 text-grenat-300 border border-grenat-500/40'
        : 'bg-nuit-700/40 text-encre-300 border border-nuit-700';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${classes}`}>
      {LIBELLES_ROLES[role]}
    </span>
  );
}

export default function GestionRoles({ comptes, emails, moiId, roleCourant }: Props) {
  const [recherche, setRecherche] = useState('');
  const [filtreRole, setFiltreRole] = useState<'tous' | Role>('tous');
  const [roleVise, setRoleVise] = useState<Record<string, Role>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; texte: string; ok: boolean } | null>(null);
  /** Cible en attente de confirmation (promotion super_admin). */
  const [aConfirmer, setAConfirmer] = useState<{ compte: CompteAdmin; role: Role } | null>(null);
  /**
   * Rôles DÉJÀ APPLIQUÉS dans cette session d'écran, pour refléter le
   * changement immédiatement.
   *
   * Pourquoi pas `router.refresh()` : enchaîner les rafraîchissements RSC sur
   * cette page finit par faire lever au routeur client de Next 16 une erreur
   * interne (« Cannot read properties of null (reading 'enqueueModel') ») qui
   * bascule toute la page dans son écran d'erreur. Le seul champ modifiable de
   * ce panneau est le rôle : un état local suffit donc à afficher la vérité,
   * sans rafraîchir le serveur. La pastille de l'onglet, elle, se remet à jour
   * à la prochaine navigation.
   */
  const [roleApplique, setRoleApplique] = useState<Record<string, Role>>({});
  /** Comptes SUPPRIMÉS pendant cette session : masqués immédiatement, sans RSC. */
  const [supprimes, setSupprimes] = useState<string[]>([]);
  /** Cible en attente de confirmation de SUPPRESSION DÉFINITIVE. */
  const [aSupprimer, setASupprimer] = useState<CompteAdmin | null>(null);
  /** Bilan d'une suppression réussie (la ligne concernée a disparu). */
  const [bilan, setBilan] = useState<string | null>(null);

  const autorise = estSuperAdmin(roleCourant);

  const lignes = useMemo(() => {
    const requete = normaliser(recherche.trim());
    return comptes
      .map((compte) => ({
        compte,
        roleActuel: roleApplique[compte.id] ?? normaliserRole(compte.role),
        courriel: emails[compte.id] ?? '',
      }))
      .filter(({ compte, roleActuel, courriel }) => {
        if (supprimes.includes(compte.id)) return false;
        if (filtreRole !== 'tous' && roleActuel !== filtreRole) return false;
        if (requete) {
          const moisson = normaliser(`${compte.pseudo} ${courriel} ${roleActuel}`);
          if (!moisson.includes(requete)) return false;
        }
        return true;
      });
  }, [comptes, emails, recherche, filtreRole, roleApplique, supprimes]);

  const nbAdmins = comptes.filter(
    (c) => (roleApplique[c.id] ?? normaliserRole(c.role)) !== 'utilisateur'
  ).length;

  function vise(id: string, actuel: Role): Role {
    return roleVise[id] ?? actuel;
  }

  async function appliquer(id: string, role: Role): Promise<void> {
    setEnCours(id);
    setMessage(null);
    try {
      const reponse = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ utilisateurId: id, role }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as {
        erreur?: string;
        resultat?: { change?: boolean; role_nouveau?: string };
      };
      if (!reponse.ok) {
        setMessage({ id, texte: corps.erreur ?? `Échec (${reponse.status}).`, ok: false });
      } else {
        setMessage({
          id,
          texte: corps.resultat?.change
            ? `Rôle mis à jour : ${LIBELLES_ROLES[normaliserRole(corps.resultat?.role_nouveau)]}. Action journalisée.`
            : 'Aucun changement (le compte avait déjà ce rôle).',
          ok: true,
        });
        const nouveau = normaliserRole(corps.resultat?.role_nouveau);
        // Ferme la modale et applique le nouveau rôle dans l'état LOCAL :
        // aucun rafraîchissement RSC (voir le commentaire de `roleApplique`).
        setAConfirmer(null);
        setRoleApplique((m) => ({ ...m, [id]: nouveau }));
        setRoleVise((m) => ({ ...m, [id]: nouveau }));
      }
    } catch {
      setMessage({ id, texte: 'Réseau indisponible.', ok: false });
    } finally {
      setEnCours(null);
      setAConfirmer(null);
    }
  }

  async function supprimer(compte: CompteAdmin): Promise<void> {
    setEnCours(compte.id);
    setMessage(null);
    setBilan(null);
    try {
      const reponse = await fetch('/api/admin/comptes/supprimer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ utilisateurId: compte.id }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as { erreur?: string };
      if (!reponse.ok) {
        setMessage({
          id: compte.id,
          texte: corps.erreur ?? `Échec (${reponse.status}).`,
          ok: false,
        });
      } else {
        setSupprimes((liste) => [...liste, compte.id]);
        setBilan(
          `Compte « ${compte.pseudo} » supprimé définitivement, avec ses livres, ` +
            'traductions, favoris, abonnements, crédits et paiements. Action journalisée.'
        );
      }
    } catch {
      setMessage({ id: compte.id, texte: 'Réseau indisponible.', ok: false });
    } finally {
      setEnCours(null);
      setASupprimer(null);
    }
  }

  // Un simple administrateur voit ce panneau pour pouvoir SUPPRIMER un
  // compte utilisateur ; la nomination des rôles reste réservée au
  // super-administrateur (contrôlée par `autorise`, ligne par ligne).
  return (
    <section className="velours p-5 sm:p-6" aria-labelledby="titre-roles">
      <h2 id="titre-roles" className="sur-titre text-encre-300">
        Rôles et permissions
      </h2>
      <div className="liseret mt-3" />
      <p className="text-encre-500 text-sm mt-3 leading-relaxed">
        Nommez ou rétrogradez les comptes. Un <strong>administrateur</strong> accède au tableau de
        bord d’exploitation (comptes, abonnements, paiements) ; un{' '}
        <strong>super-administrateur</strong> a, en plus, ce pouvoir de nomination. Chaque
        changement est journalisé dans <code>admin_actions</code>.
      </p>

      {bilan && (
        <p role="status" className="text-violet-rom-300 text-xs mt-3">
          {bilan}
        </p>
      )}

      {/* ----- Recherche / filtre ----- */}
      <div className="grid gap-3 sm:grid-cols-2 mt-5">
        <label className="block min-w-0">
          <span className="text-encre-500 text-[11px] uppercase tracking-wider">Recherche</span>
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Pseudo, courriel ou rôle…"
            aria-label="Rechercher un compte à qui attribuer un rôle"
            className="champ-sombre mt-1"
          />
        </label>
        <label className="block min-w-0">
          <span className="text-encre-500 text-[11px] uppercase tracking-wider">Rôle affiché</span>
          <select
            value={filtreRole}
            onChange={(e) => setFiltreRole(e.target.value as 'tous' | Role)}
            aria-label="Filtrer les comptes par rôle"
            className="select-sombre mt-1 w-full"
          >
            <option value="tous">Tous les rôles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {LIBELLES_ROLES[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-encre-500 text-[11px] mt-3">
        {lignes.length} compte{lignes.length > 1 ? 's' : ''} affiché
        {lignes.length > 1 ? 's' : ''} · {nbAdmins} compte{nbAdmins > 1 ? 's' : ''} avec des droits
        d’administration.
      </p>

      {lignes.length === 0 ? (
        <p className="text-encre-500 text-sm italic mt-4">
          Aucun compte ne correspond à ces critères.
        </p>
      ) : (
        <div className="mt-4">
          {/* En-tête masqué sous 768 px : les libellés sont dans chaque carte. */}
          <div
            aria-hidden="true"
            className="hidden md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,2.4fr)] gap-x-4 text-encre-500 text-xs uppercase tracking-wider px-1"
          >
            <span>Compte</span>
            <span>Rôle actuel</span>
            <span>Nommer / rétrograder</span>
          </div>

          <ul role="list" className="border-t border-nuit-700/50">
            {lignes.map(({ compte, roleActuel, courriel }) => {
              const soiMeme = compte.id === moiId;
              const choix = vise(compte.id, roleActuel);
              const inchange = choix === roleActuel;
              const promotionSuper = choix === 'super_admin';
              // Suppression : soi-même exclu ; un admin ne peut pas
              // supprimer un autre administrateur (permission forte).
              const peutSupprimer =
                !soiMeme && aLaPermission(roleCourant, permissionPourSupprimerCompte(roleActuel));
              return (
                <li
                  key={compte.id}
                  className="grid gap-3 md:gap-x-4 py-4 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,2.4fr)] md:items-start border-t border-nuit-700/50"
                >
                  <Champ libelle="Compte">
                    <p className="text-encre-100 break-words">{compte.pseudo}</p>
                    {courriel && <p className="text-encre-500 text-[11px] break-all">{courriel}</p>}
                    {soiMeme && (
                      <p className="text-encre-500 text-[11px] italic">c’est votre compte</p>
                    )}
                  </Champ>

                  <Champ libelle="Rôle actuel">
                    <PastilleRole role={roleActuel} />
                  </Champ>

                  <Champ libelle={autorise ? 'Nommer / rétrograder' : 'Rôle'}>
                    {!autorise ? (
                      <p className="text-encre-500 text-xs italic">
                        La nomination et la rétrogradation sont réservées au
                        super-administrateur.
                      </p>
                    ) : soiMeme ? (
                      <p className="text-encre-500 text-xs italic">
                        Vous ne pouvez pas modifier votre propre rôle (garde anti-verrouillage :
                        il reste toujours au moins un super-administrateur).
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Nouveau rôle pour ${compte.pseudo}`}
                          value={choix}
                          onChange={(e) =>
                            setRoleVise((m) => ({ ...m, [compte.id]: e.target.value as Role }))
                          }
                          className="select-sombre"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {LIBELLES_ROLES[r]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (promotionSuper) setAConfirmer({ compte, role: choix });
                            else void appliquer(compte.id, choix);
                          }}
                          disabled={enCours !== null || inchange}
                          className="bouton-fantome !px-3 text-xs"
                        >
                          {promotionSuper ? 'Nommer…' : 'Appliquer'}
                        </button>
                      </div>
                    )}
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

                  {peutSupprimer && (
                    <div className="md:col-start-3">
                      <button
                        type="button"
                        onClick={() => {
                          setMessage(null);
                          setASupprimer(compte);
                        }}
                        disabled={enCours !== null}
                        className="text-grenat-300 hover:text-grenat-200 text-[11px] underline underline-offset-4 decoration-grenat-400/40 disabled:opacity-50"
                      >
                        Supprimer ce compte…
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-encre-500 text-[11px] italic mt-5">
        Retirer un rôle (revenir à « Utilisateur ») révoque immédiatement l’accès au tableau de
        bord. Aucun contenu de livre n’est lisible par un administrateur, quel que soit son rang :
        les statistiques passent par des fonctions agrégées.
      </p>

      <ModaleConfirmation
        ouvert={aConfirmer !== null}
        titre="Nommer un super-administrateur ?"
        description={
          aConfirmer
            ? `${aConfirmer.compte.pseudo} pourra nommer et rétrograder d’autres administrateurs, y compris vous-même. L’action est journalisée et réversible.`
            : ''
        }
        libelleConfirmer="Nommer super-administrateur"
        enCours={enCours !== null}
        onConfirmer={() => {
          if (aConfirmer) void appliquer(aConfirmer.compte.id, aConfirmer.role);
        }}
        onAnnuler={() => setAConfirmer(null)}
      />

      <ModaleConfirmation
        ouvert={aSupprimer !== null}
        titre="Supprimer définitivement ce compte ?"
        description={
          aSupprimer
            ? `« ${aSupprimer.pseudo} » et toutes ses données seront effacés : livres, chapitres, traductions, favoris, abonnements, crédits et paiements. Cette action est IRRÉVERSIBLE ; seule la trace dans le journal d’administration subsiste.`
            : ''
        }
        libelleConfirmer="Supprimer définitivement"
        enCours={enCours !== null}
        onConfirmer={() => {
          if (aSupprimer) void supprimer(aSupprimer);
        }}
        onAnnuler={() => setASupprimer(null)}
      />
    </section>
  );
}

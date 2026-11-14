'use client';

// ============================================================
// PanneauMembres.tsx — Membres du club : rôles (admin /
// moderateur / membre) et file de modération (F11 v4).
//
//   • L'ADMIN change les rôles (jamais le sien, jamais le créateur).
//   • L'ADMIN exclut un membre (confirmation à deux temps).
//   • LE STAFF voit la file des signalements et tranche :
//     « Conserver » ou « Masquer » (le message masqué disparaît
//     pour les membres, reste visible du staff et de l'auteur).
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  libelleRole,
  MOTIFS_SIGNALEMENT,
  type RoleClub,
} from '@/lib/clubs';

export interface MembreClub {
  utilisateurId: string;
  pseudo: string;
  moi: boolean;
  createur: boolean;
  role: RoleClub;
  position: number;
}

export interface SignalementClub {
  id: string;
  messageId: number;
  motif: string;
  statut: string;
  traiteLe: string | null;
  le: string;
  extrait: string | null;
  auteur: string | null;
  messageMasque: boolean;
}

const dateCourte = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

export default function PanneauMembres({
  clubId,
  membres,
  signalements,
  monRole,
  estCreateur,
}: {
  clubId: string;
  membres: MembreClub[];
  signalements: SignalementClub[];
  monRole: RoleClub;
  estCreateur: boolean;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [notification, setNotification] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );
  const [arme, setArme] = useState<string | null>(null);
  const suisJeAdmin = monRole === 'admin' || estCreateur;
  const suisJeStaff = suisJeAdmin || monRole === 'moderateur';

  const appeler = async (url: string, options: RequestInit) => {
    try {
      const reponse = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: reponse.ok, donnees };
    } catch {
      return { ok: false, donnees: { erreur: 'Réseau indisponible : réessayez.' } };
    }
  };

  const changerRole = async (utilisateurId: string, role: RoleClub) => {
    setEnCours(true);
    const { ok, donnees } = await appeler(
      `/api/clubs/${encodeURIComponent(clubId)}/membres`,
      { method: 'PATCH', body: JSON.stringify({ utilisateurId, role }) }
    );
    setEnCours(false);
    if (!ok) {
      setNotification({
        ton: 'erreur',
        texte: (donnees.erreur as string) ?? 'Changement refusé.',
      });
      return;
    }
    setNotification({ ton: 'ok', texte: 'Rôle mis à jour.' });
    router.refresh();
  };

  const exclure = async (m: MembreClub) => {
    if (arme !== `membre-${m.utilisateurId}`) {
      setArme(`membre-${m.utilisateurId}`);
      return;
    }
    setEnCours(true);
    const { ok, donnees } = await appeler(
      `/api/clubs/${encodeURIComponent(
        clubId
      )}/membres?utilisateurId=${encodeURIComponent(m.utilisateurId)}`,
      { method: 'DELETE' }
    );
    setEnCours(false);
    setArme(null);
    if (!ok) {
      setNotification({
        ton: 'erreur',
        texte: (donnees.erreur as string) ?? 'Retrait refusé.',
      });
      return;
    }
    setNotification({ ton: 'ok', texte: `${m.pseudo} n’est plus membre du club.` });
    router.refresh();
  };

  const traiter = async (signalementId: string, action: 'conserver' | 'masquer') => {
    setEnCours(true);
    const { ok, donnees } = await appeler(
      `/api/clubs/${encodeURIComponent(clubId)}/signalements`,
      { method: 'PATCH', body: JSON.stringify({ id: signalementId, action }) }
    );
    setEnCours(false);
    if (!ok) {
      setNotification({
        ton: 'erreur',
        texte: (donnees.erreur as string) ?? 'Traitement refusé.',
      });
      return;
    }
    setNotification({
      ton: 'ok',
      texte: action === 'masquer' ? 'Message masqué.' : 'Message conservé, signalement clos.',
    });
    router.refresh();
  };

  const enAttente = signalements.filter((s) => s.statut === 'en_attente');
  const traites = signalements.filter((s) => s.statut !== 'en_attente');

  return (
    <section aria-labelledby="titre-membres" className="space-y-6">
      <div className="space-y-3">
        <h2 id="titre-membres" className="font-display text-xl text-encre-100">
          Membres du club
        </h2>
        {notification && (
          <p
            role="status"
            className={`text-xs ${notification.ton === 'ok' ? 'text-encre-300' : 'text-grenat-400'}`}
          >
            {notification.texte}
          </p>
        )}
        <ul className="velours rounded-xl divide-y divide-nuit-700/70 overflow-hidden">
          {membres.map((m) => (
            <li key={m.utilisateurId} className="flex flex-wrap items-center gap-3 p-3.5">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-nuit-700/60 text-sm font-display text-encre-100"
              >
                {(m.pseudo || 'L').slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-encre-100 truncate">
                  {m.pseudo}
                  {m.moi && <span className="text-encre-500"> (vous)</span>}
                </div>
                <div className="text-xs text-encre-500">Chapitre {m.position}</div>
              </div>
              {suisJeAdmin && !m.moi && !m.createur ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  {(['membre', 'moderateur', 'admin'] as RoleClub[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={enCours || m.role === r}
                      onClick={() => changerRole(m.utilisateurId, r)}
                      aria-pressed={m.role === r}
                      className={`!min-h-8 !px-2 text-[11px] ${
                        m.role === r ? 'bouton-principal' : 'bouton-fantome'
                      } disabled:opacity-60 cursor-pointer`}
                      title={`Rendre ${libelleRole(r).toLowerCase()}`}
                    >
                      {libelleRole(r)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => exclure(m)}
                    disabled={enCours}
                    className={`!min-h-8 !px-2 text-[11px] ${
                      arme === `membre-${m.utilisateurId}`
                        ? 'bouton-principal !bg-grenat-500'
                        : 'bouton-fantome'
                    } disabled:opacity-40 cursor-pointer`}
                    title="Retirer du club"
                  >
                    {arme === `membre-${m.utilisateurId}` ? 'Confirmer ?' : 'Retirer'}
                  </button>
                </span>
              ) : (
                <span className="rounded-full border border-nuit-700 px-2.5 py-0.5 text-[11px] text-encre-300">
                  {m.createur ? 'Administrateur' : libelleRole(m.role)}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-encre-500">
          Seul l’administrateur change les rôles ou retire un membre. Le chapitre
          de chaque membre n’est affiché que pour caler les discussions, jamais
          pour mesurer personne.
        </p>
      </div>

      {suisJeStaff && (
        <div className="space-y-2" aria-label="File de modération">
          <h3 className="font-display text-lg text-encre-100">File de modération</h3>
          {enAttente.length === 0 ? (
            <p className="velours p-5 rounded-2xl text-sm text-encre-300 italic">
              Aucun signalement en attente. Les messages signalés par les membres
              apparaissent ici.
            </p>
          ) : (
            <ul className="space-y-2">
              {enAttente.map((s) => (
                <li key={s.id} className="velours flex flex-wrap items-center gap-3 rounded-xl p-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-or-ros-300/40 bg-or-ros-300/10 px-2 py-0.5 text-[11px] text-or-ros-300">
                        {s.motif}
                      </span>
                      <span className="text-encre-400 text-xs">
                        Signalé le {dateCourte(s.le)}
                      </span>
                    </div>
                    {s.extrait && (
                      <p className="mt-1.5 text-sm text-encre-300 line-clamp-3">
                        « {s.extrait} »{s.auteur ? ` — ${s.auteur}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => traiter(s.id, 'conserver')}
                      disabled={enCours}
                      className="bouton-fantome !min-h-9 text-xs disabled:opacity-40 cursor-pointer"
                    >
                      Conserver
                    </button>
                    <button
                      type="button"
                      onClick={() => traiter(s.id, 'masquer')}
                      disabled={enCours}
                      className="bouton-principal !bg-grenat-500 !min-h-9 text-xs disabled:opacity-40 cursor-pointer"
                    >
                      Masquer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {traites.length > 0 && (
            <details className="text-sm text-encre-400">
              <summary className="cursor-pointer text-xs text-encre-500">
                {traites.length} signalement{traites.length > 1 ? 's' : ''} traité
                {traites.length > 1 ? 's' : ''}
              </summary>
              <ul className="mt-2 space-y-1.5">
                {traites.map((s) => (
                  <li key={s.id} className="text-xs text-encre-500">
                    {dateCourte(s.traiteLe ?? s.le)} · {s.motif} ·{' '}
                    {s.statut === 'masque' ? 'message masqué' : 'conservé'}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

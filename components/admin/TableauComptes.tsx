'use client';

// ============================================================
// components/admin/TableauComptes.tsx — Comptes + gestion des
// abonnements par un administrateur.
//
// L'interface CACHE les boutons pour qui n'a pas la permission, mais
// elle ne décide rien : chaque appel part vers /api/admin/abonnement,
// dont le GARDE SERVEUR (lib/roles-garde) tranche réellement.
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DUREES_ADMIN,
  JOURS_PAR_DUREE,
  estDureeAdmin,
  type DureeAdmin,
} from '@/lib/admin-abonnements';
import { abonnementActif, type CompteAdmin } from '@/lib/admin-stats';

interface Props {
  comptes: CompteAdmin[];
  /** Faux quand le schéma d'abonnement n'est pas encore fusionné. */
  abonnementsDisponibles: boolean;
}

const LIBELLES_DUREE: Record<DureeAdmin, string> = {
  '1_mois': '1 mois',
  '3_mois': '3 mois',
  '12_mois': '12 mois',
  vie: 'à vie',
};

function dateCourte(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

export default function TableauComptes({ comptes, abonnementsDisponibles }: Props) {
  const routeur = useRouter();
  const [dureeParCompte, setDureeParCompte] = useState<Record<string, string>>({});
  const [dateParCompte, setDateParCompte] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; texte: string; ok: boolean } | null>(
    null
  );

  function dureeChoisie(id: string): string {
    return dureeParCompte[id] ?? '1_mois';
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
              ? `Abonnement accordé (${corps.duree ?? duree}).`
              : 'Abonnement retiré.',
          ok: true,
        });
        routeur.refresh();
      }
    } catch {
      setMessage({ id, texte: 'Réseau indisponible.', ok: false });
    } finally {
      setEnCours(null);
    }
  }

  if (comptes.length === 0) {
    return <p className="text-encre-500 text-sm italic">Aucun compte à afficher.</p>;
  }

  return (
    <div className="space-y-3">
      {!abonnementsDisponibles && (
        <p className="text-violet-rom-300 text-xs leading-relaxed rounded-lg border border-violet-rom-500/40 bg-violet-rom-500/10 px-3 py-2">
          Le schéma d’abonnement n’est pas encore fusionné : la colonne « Abonnement »
          restera vide et l’attribution renverra une erreur tant que la branche paiement
          n’est pas déployée.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-encre-500 text-xs uppercase tracking-wider">
              <th className="py-2 pr-4 font-normal">Compte</th>
              <th className="py-2 pr-4 font-normal">Rôle</th>
              <th className="py-2 pr-4 font-normal">Abonnement</th>
              <th className="py-2 pr-4 font-normal">Accorder / retirer</th>
            </tr>
          </thead>
          <tbody>
            {comptes.map((compte) => {
              const actif = abonnementActif(compte);
              const choix = dureeChoisie(compte.id);
              const surDate = choix === 'date';
              return (
                <tr key={compte.id} className="border-t border-nuit-700/50 align-top">
                  <td className="py-3 pr-4">
                    <p className="text-encre-100">{compte.pseudo}</p>
                    <p className="text-encre-500 text-[11px]">
                      inscrit le {dateCourte(compte.creeLe)}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={
                        compte.role === 'admin'
                          ? 'rounded-full px-2 py-0.5 text-[11px] bg-grenat-500/20 text-grenat-300'
                          : 'rounded-full px-2 py-0.5 text-[11px] bg-nuit-700/40 text-encre-300'
                      }
                    >
                      {compte.role}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {actif ? (
                      <span className="text-violet-rom-300 text-xs">
                        actif jusqu’au {dateCourte(compte.abonnementFin)}
                      </span>
                    ) : (
                      <span className="text-encre-500 text-xs">
                        {compte.abonnementStatut ?? 'aucun'}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Durée pour ${compte.pseudo}`}
                        value={choix}
                        onChange={(e) =>
                          setDureeParCompte((m) => ({ ...m, [compte.id]: e.target.value }))
                        }
                        className="bg-nuit-800 border border-nuit-700/60 rounded px-2 py-1 text-xs text-encre-100"
                      >
                        {DUREES_ADMIN.map((d) => (
                          <option key={d} value={d}>
                            {LIBELLES_DUREE[d]}
                          </option>
                        ))}
                        <option value="date">jusqu’à une date…</option>
                      </select>
                      {surDate && (
                        <input
                          type="date"
                          aria-label={`Date de fin pour ${compte.pseudo}`}
                          value={dateParCompte[compte.id] ?? ''}
                          onChange={(e) =>
                            setDateParCompte((m) => ({ ...m, [compte.id]: e.target.value }))
                          }
                          className="bg-nuit-800 border border-nuit-700/60 rounded px-2 py-1 text-xs text-encre-100"
                        />
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
                        className="bouton-fantome !px-3 !py-1 text-xs"
                      >
                        Accorder
                      </button>
                      <button
                        onClick={() => appeler(compte.id, 'DELETE')}
                        disabled={enCours !== null || !actif}
                        className="bouton-fantome !px-3 !py-1 text-xs"
                      >
                        Retirer
                      </button>
                    </div>
                    {message?.id === compte.id && (
                      <p
                        className={
                          message.ok
                            ? 'text-violet-rom-300 text-[11px] mt-1'
                            : 'text-grenat-300 text-[11px] mt-1'
                        }
                      >
                        {message.texte}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-encre-500 text-[11px] italic">
        « à vie » accorde {JOURS_PAR_DUREE.vie} jours (aucun plan « vie » en base). Chaque
        action est journalisée (qui, quoi, quand) dans <code>admin_actions</code>.
      </p>
    </div>
  );
}

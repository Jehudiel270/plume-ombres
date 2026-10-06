// ============================================================
// components/admin/JournalActions.tsx — Journal des actions admin
// (serveur, espace ADMIN).
//
// Source : table public.admin_actions, lisible par le seul rôle admin
// (politique RLS admin_actions_select_admin / est_admin). Chaque ligne
// attribue/retire un abonnement : l'action destructrice (retrait) est
// donc TOUJOURS traçable « qui, quoi, quand ».
// ============================================================

import { formaterDateHeure, formaterDateCourte, type ActionAdmin } from '@/lib/admin-stats';

interface Props {
  actions: ActionAdmin[];
  /** id de compte → pseudo, pour nommer la cible et l'auteur. */
  pseudos: Record<string, string>;
  erreur: string | null;
}

const LIBELLES_ACTION: Record<string, string> = {
  attribuer: 'Abonnement accordé',
  revoquer: 'Abonnement retiré',
};

function nommer(id: string, pseudos: Record<string, string>): string {
  if (!id) return 'inconnu';
  return pseudos[id] ?? `${id.slice(0, 8)}…`;
}

export default function JournalActions({ actions, pseudos, erreur }: Props) {
  return (
    <section className="velours p-5 sm:p-6" aria-labelledby="titre-journal-actions">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titre-journal-actions" className="sur-titre text-encre-300">
          Journal des actions
        </h2>
        <p className="text-encre-500 text-xs">
          {actions.length} action{actions.length > 1 ? 's' : ''} récente
          {actions.length > 1 ? 's' : ''}
        </p>
      </div>
      <div className="liseret mt-3" />

      {erreur ? (
        <p className="text-grenat-300 text-sm mt-3">Journal indisponible : {erreur}</p>
      ) : actions.length === 0 ? (
        <p className="text-encre-500 text-sm italic mt-3">
          Aucune action d’administration enregistrée pour le moment.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {actions.map((a) => (
            <li
              key={a.id}
              className="rounded-[12px] border border-nuit-700/60 bg-nuit-800/40 p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-encre-100 text-sm">
                  <span className="font-semibold">
                    {LIBELLES_ACTION[a.action] ?? a.action}
                  </span>{' '}
                  <span className="text-encre-300">pour {nommer(a.cibleId, pseudos)}</span>
                </p>
                <time className="text-encre-500 text-xs" dateTime={a.creeLe ?? undefined}>
                  {formaterDateHeure(a.creeLe)}
                </time>
              </div>
              <p className="text-encre-500 text-[11px] mt-1">
                Par {nommer(a.adminId, pseudos)}
                {a.duree ? ` · durée ${a.duree}` : ''}
                {a.periodeFin ? ` · fin ${formaterDateCourte(a.periodeFin)}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

'use client';

// ============================================================
// components/notifications/PanneauNotifications.tsx — Centre de
// notifications (A18/F23) : filtres par type, lues / non lues,
// liens sûrs (internes uniquement), tout marquer comme lu.
// ============================================================

import { useMemo, useState } from 'react';

import type { Notification, TypeNotification } from '@/lib/notifications';

const LIBELLES_TYPE: Record<TypeNotification, string> = {
  info: 'Information',
  traduction: 'Traduction',
  paiement: 'Paiement',
  erreur: 'Alerte',
};

const COULEURS_TYPE: Record<TypeNotification, string> = {
  info: 'border-nuit-700',
  traduction: 'border-emerald-700/50',
  paiement: 'border-nuit-600',
  erreur: 'border-grenat-700/60',
};

/** Seul un lien INTERNE (commençant par /) est suiviable — un lien
 *  externe ne se rend jamais cliquable (prudence par défaut). */
function lienSur(lien: string | null): string | null {
  if (!lien || !lien.startsWith('/') || lien.startsWith('//')) return null;
  return lien;
}

const dateCourte = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

export default function PanneauNotifications({
  notifications,
}: {
  notifications: Notification[];
}) {
  const [filtre, setFiltre] = useState<'toutes' | 'non_lues' | TypeNotification>(
    'toutes'
  );

  const visibles = useMemo(
    () =>
      notifications.filter((n) =>
        filtre === 'toutes'
          ? true
          : filtre === 'non_lues'
            ? !n.lu
            : n.type === filtre
      ),
    [notifications, filtre]
  );

  const nonLues = notifications.filter((n) => !n.lu).length;
  const compteurs = useMemo(() => {
    const compte: Record<string, number> = {};
    for (const n of notifications) {
      compte[n.type] = (compte[n.type] ?? 0) + 1;
    }
    return compte;
  }, [notifications]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['toutes', `Toutes (${notifications.length})`],
            ['non_lues', `Non lues (${nonLues})`],
            ['traduction', `Traduction (${compteurs.traduction ?? 0})`],
            ['paiement', `Paiement (${compteurs.paiement ?? 0})`],
            ['info', `Information (${compteurs.info ?? 0})`],
            ['erreur', `Alerte (${compteurs.erreur ?? 0})`],
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            type="button"
            onClick={() => setFiltre(cle)}
            aria-pressed={filtre === cle}
            className={`min-h-9 rounded-full border px-3 text-xs cursor-pointer transition-colors ${
              filtre === cle
                ? 'border-grenat-600 bg-nuit-700/60 text-encre-100'
                : 'border-nuit-700 text-encre-500 hover:text-encre-300'
            }`}
          >
            {libelle}
          </button>
        ))}
        {nonLues > 0 && (
          <form method="get" action="/notifications" className="ml-auto">
            <input type="hidden" name="tout" value="lu" />
            <button type="submit" className="bouton-fantome !min-h-9 !px-3 text-xs cursor-pointer">
              Tout marquer comme lu
            </button>
          </form>
        )}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-nuit-700 p-6 text-center text-sm text-encre-500">
          Rien dans cette boîte. Le calme aussi, c’est une bonne nouvelle.
        </p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((n) => {
            const lien = lienSur(n.lien);
            const corps = (
              <>
                <p className="text-xs text-encre-500">
                  <span className={n.lu ? '' : 'text-grenat-300'}>
                    {LIBELLES_TYPE[n.type]}
                    {!n.lu && ' · non lue'}
                  </span>{' '}
                  · {dateCourte(n.cree_le)}
                </p>
                <p className={`mt-1 text-sm ${n.lu ? 'text-encre-300' : 'text-encre-100'}`}>
                  {n.titre}
                </p>
                {n.corps && (
                  <p className="mt-0.5 text-xs text-encre-500 whitespace-pre-line">{n.corps}</p>
                )}
              </>
            );
            return (
              <li
                key={n.id}
                className={`rounded-2xl border px-4 py-3 ${
                  n.lu ? COULEURS_TYPE[n.type] : 'velours ' + COULEURS_TYPE[n.type]
                }`}
              >
                {lien ? (
                  <a href={lien} className="block hover:text-grenat-200">
                    {corps}
                  </a>
                ) : (
                  corps
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

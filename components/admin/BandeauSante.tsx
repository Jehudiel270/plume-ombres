// ============================================================
// components/admin/BandeauSante.tsx — Voyants d'exploitation en tête
// du tableau de bord.
//
// Objectif : ne plus découvrir une panne en ouvrant l'onglet
// « Système ». Trois voyants, calculés à partir de données déjà
// chargées :
//   · Base de données — une lecture a-t-elle échoué (stats, comptes,
//     paiements) ?
//   · Encaissements — date du dernier paiement réussi.
//   · Traduction — des chapitres ont-ils été produits ?
//
// Si tout est vert, le bandeau reste discret (une ligne). S'il y a une
// alerte, il passe en tête et propose le raccourci vers l'onglet
// concerné (événement plume:onglet, écouté par OngletsAdmin).
// ============================================================

'use client';

export interface VoyantSante {
  cle: string;
  libelle: string;
  etat: 'ok' | 'attention' | 'panne';
  detail: string;
  /** Onglet à ouvrir depuis le bandeau (facultatif). */
  onglet?: string;
}

const STYLES: Record<VoyantSante['etat'], { point: string; texte: string; mot: string }> = {
  ok: { point: 'bg-grenat-400', texte: 'text-encre-300', mot: 'OK' },
  attention: { point: 'bg-or-ros-300', texte: 'text-or-ros-300', mot: 'À surveiller' },
  panne: { point: 'bg-grenat-500', texte: 'text-grenat-300', mot: 'Panne' },
};

export default function BandeauSante({ voyants }: { voyants: readonly VoyantSante[] }) {
  if (voyants.length === 0) return null;
  const enAlerte = voyants.some((v) => v.etat !== 'ok');

  function ouvrir(onglet: string) {
    window.dispatchEvent(new CustomEvent('plume:onglet', { detail: onglet }));
  }

  return (
    <section
      aria-label="État des services"
      data-reveler="haut"
      className={`rounded-[12px] border px-3 py-2.5 sm:px-4 ${
        enAlerte ? 'border-grenat-700/70 bg-grenat-700/10' : 'border-nuit-700 bg-nuit-800/40'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="sur-titre text-encre-500 text-[10px]">État des services</span>
        {voyants.map((voyant) => (
          <span key={voyant.cle} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden="true"
              className={`inline-block h-1.5 w-1.5 rounded-full ${STYLES[voyant.etat].point}`}
            />
            <span className={`font-medium ${STYLES[voyant.etat].texte}`}>{voyant.libelle}</span>
            <span className="text-encre-500">
              <span className="sr-only">{STYLES[voyant.etat].mot} — </span>
              {voyant.detail}
            </span>
            {voyant.etat !== 'ok' && voyant.onglet ? (
              <button
                type="button"
                onClick={() => ouvrir(voyant.onglet as string)}
                className="underline decoration-dotted underline-offset-2 text-encre-300 hover:text-encre-100 cursor-pointer"
              >
                voir
              </button>
            ) : null}
          </span>
        ))}
      </div>
    </section>
  );
}

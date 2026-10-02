// ============================================================
// components/AbonnementStatut.tsx — Badge d'état d'abonnement (P0.9).
// Composant serveur (aucun état, aucun hook).
// ============================================================

import {
  libelleStatut,
  libellePrix,
  planParCode,
  type StatutAbonnement,
} from '@/lib/abonnement';

interface Props {
  statut: StatutAbonnement;
  plan: string;
  periodeFin?: string | null;
  premium?: boolean;
  /** Essai gratuit : précise « Essai » plutôt que « Premium ». */
  essai?: boolean;
}

const COULEURS: Record<StatutAbonnement, string> = {
  actif: 'border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300',
  en_attente: 'border-or-ros-300/60 bg-or-ros-300/10 text-or-ros-300',
  expire: 'border-nuit-700 bg-nuit-800 text-encre-500',
  resilie: 'border-nuit-700 bg-nuit-800 text-encre-500',
  echec: 'border-grenat-500/60 bg-grenat-500/15 text-grenat-300',
  inactif: 'border-nuit-700 bg-nuit-800 text-encre-500',
};

export default function AbonnementStatut({
  statut,
  plan,
  periodeFin,
  premium = false,
  essai = false,
}: Props) {
  const planObj = planParCode(plan);
  const estEssai = essai || planObj?.categorie === 'essai';
  const classe = COULEURS[statut] ?? COULEURS.inactif;
  const famille = estEssai ? 'Essai' : premium ? 'Premium' : 'Gratuit';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={`rounded-full border text-[11px] uppercase tracking-wider px-3 py-1 ${classe}`}
      >
        {famille} — {libelleStatut(statut)}
      </span>
      {planObj && (
        <span className="text-encre-300 text-sm">
          {planObj.nom} · {libellePrix(planObj)}
        </span>
      )}
      {statut === 'actif' && periodeFin && (
        <span className="text-encre-500 text-xs">
          jusqu’au{' '}
          {new Date(periodeFin).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>
      )}
    </div>
  );
}

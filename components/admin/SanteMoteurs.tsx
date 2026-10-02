// ============================================================
// components/admin/SanteMoteurs.tsx — État RÉEL des moteurs.
//
// Composant SERVEUR, réservé à l'espace ADMIN. Il nomme les
// fournisseurs et l'ordre de la chaîne : ces informations ne
// doivent JAMAIS être affichées côté utilisateur (promesse
// produit « texte privé »).
// ============================================================

import type { SanteChaine, EtatMoteur } from '@/lib/providers/sante';

const LIBELLES: Record<EtatMoteur, string> = {
  ok: 'Disponible',
  indisponible: 'Indisponible',
  non_configure: 'Non configuré',
  desactive: 'Désactivé (privé strict)',
};

const COULEURS: Record<EtatMoteur, string> = {
  ok: 'border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300',
  indisponible: 'border-grenat-500/60 bg-grenat-500/15 text-grenat-300',
  non_configure: 'border-nuit-700 bg-nuit-800 text-encre-500',
  desactive: 'border-nuit-700 bg-nuit-800 text-encre-500',
};

interface Props {
  sante: SanteChaine;
}

export default function SanteMoteurs({ sante }: Props) {
  return (
    <section className="velours p-6" aria-label="Santé des moteurs de traduction">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="sur-titre text-encre-300">Moteurs de traduction</p>
        <p className="text-encre-500 text-xs">
          contrôle réel · cache {Math.round(sante.cacheMs / 1000)} s ·{' '}
          {new Date(sante.horodatage).toLocaleTimeString('fr-FR')}
        </p>
      </div>

      <p className="text-encre-100 text-sm mt-3">
        Moteur actif :{' '}
        <strong>
          {sante.moteurActif
            ? `${sante.moteurActif.nom}${sante.moteurActif.prive ? ' — texte privé' : ' — le texte est transmis à un tiers'}`
            : 'aucun moteur disponible'}
        </strong>
      </p>

      {sante.priveStrict && (
        <p className="text-grenat-300 text-xs mt-2 rounded-lg border border-grenat-500/40 bg-grenat-500/10 px-3 py-2">
          Mode privé strict actif : seule la file auto-hébergée est autorisée ; les
          moteurs tiers sont désactivés pour tout le processus (routes API et tâches
          d’arrière-plan).
        </p>
      )}

      <p className="text-encre-500 text-xs mt-3">
        Ordre de la chaîne : {sante.ordre.join(' → ')}
      </p>

      <table className="w-full text-sm mt-4">
        <thead>
          <tr className="text-left text-encre-500 text-xs uppercase tracking-wider">
            <th className="py-2 font-normal">Moteur</th>
            <th className="py-2 font-normal">Confidentialité</th>
            <th className="py-2 font-normal">État</th>
            <th className="py-2 font-normal text-right">Latence</th>
          </tr>
        </thead>
        <tbody>
          {sante.moteurs.map((m) => (
            <tr key={m.id} className="border-t border-nuit-700/50">
              <td className="py-2 text-encre-100">{m.nom}</td>
              <td className="py-2 text-encre-300">
                {m.prive ? 'Auto-hébergé (privé)' : 'Tiers (hors contrôle)'}
              </td>
              <td className="py-2">
                <span
                  className={`rounded-full border text-[11px] uppercase tracking-wider px-2 py-0.5 ${COULEURS[m.etat]}`}
                >
                  {LIBELLES[m.etat]}
                </span>
                {m.cause && (
                  <span className="text-encre-500 text-xs ml-2">({m.cause})</span>
                )}
              </td>
              <td className="py-2 text-encre-300 text-right">
                {m.latenceMs === null ? '—' : `${m.latenceMs} ms`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

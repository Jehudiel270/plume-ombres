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
    <section className="velours p-5 sm:p-6" aria-labelledby="titre-moteurs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titre-moteurs" className="sur-titre text-encre-300">Moteurs de traduction</h2>
        <p className="text-encre-500 text-xs">
          contrôle réel · cache {Math.round(sante.cacheMs / 1000)} s ·{' '}
          {new Date(sante.horodatage).toLocaleTimeString('fr-FR')}
        </p>
      </div>
      <div className="liseret mt-3" />

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

      {sante.ordre.length > 0 && (
        <p className="text-encre-500 text-xs mt-3 break-words">
          Ordre de la chaîne : {sante.ordre.join(' → ')}
        </p>
      )}

      <ul role="list" className="mt-4 space-y-2">
        {sante.moteurs.map((m) => (
          <li
            key={m.id}
            className="rounded-[12px] border border-nuit-700/60 bg-nuit-800/40 p-3 sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_auto] sm:items-center sm:gap-x-4"
          >
            <p className="text-encre-100 text-sm break-words">{m.nom}</p>
            <p className="text-encre-300 text-xs mt-1 sm:mt-0">
              {m.prive ? 'Auto-hébergé (privé)' : 'Tiers (hors contrôle)'}
            </p>
            <p className="mt-1 sm:mt-0">
              <span
                className={`inline-block rounded-full border text-[11px] uppercase tracking-wider px-2 py-0.5 ${COULEURS[m.etat]}`}
              >
                {LIBELLES[m.etat]}
              </span>
              {m.cause && <span className="text-encre-500 text-xs ml-2">({m.cause})</span>}
            </p>
            <p className="text-encre-300 text-xs mt-1 sm:mt-0 sm:text-right whitespace-nowrap">
              {m.latenceMs === null ? '—' : `${m.latenceMs} ms`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

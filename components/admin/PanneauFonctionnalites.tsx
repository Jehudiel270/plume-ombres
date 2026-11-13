'use client';

// ============================================================
// components/admin/PanneauFonctionnalites.tsx — Interrupteurs.
//
// Portage React de la page d'administration des interrupteurs de la
// maquette (/admin/fonctionnalites), habillé des classes du projet
// réel. FORMAT COMPACT façon FAQ : chaque module est UNE LIGNE
// dépliable (<details>/<summary> natifs — aucun JavaScript pour
// l'accessibilité), avec les badges essentiels visibles d'un coup
// d'œil (ouvert/fermé, abonnement, déploiement) et les réglages
// complets à l'ouverture.
//
// Réglages par module : actif, abonnement minimal, déploiement
// progressif (aperçu sur 20 lecteurs de test), et, pour les modules
// à risque, la case « validé par un juriste » — que le serveur
// refuse de voir posée ailleurs ou d'activer sans elle.
//
// Le serveur reste l'autorité : tout changement passe par
// PATCH /api/admin/fonctionnalites, qui revalide tout (rôles,
// transitions à risque) et journalise côté base.
// ============================================================

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { apercuDeploiement } from '@/lib/fonctionnalites/registre';

export interface InterrupteurAdmin {
  cle: string;
  code: string;
  libelle: string;
  groupe: string;
  description: string;
  itineraires: string[];
  api: string[];
  risqueJuridique: boolean;
  noteJuridique: string | null;
  sansItineraire: string | null;
  etat: {
    actif: boolean;
    planMinimal: 'gratuit' | 'lecteur' | 'passionne' | 'illimite' | null;
    deploiement: number;
    juristeOk: boolean;
    majLe: string | null;
    majPar: string | null;
  };
}

const LIBELLES_PLAN: Record<string, string> = {
  gratuit: 'Gratuit',
  lecteur: 'Lecteur et plus',
  passionne: 'Passionné et plus',
  illimite: 'Illimité',
};

function LigneInterrupteur({ interrupteur }: { interrupteur: InterrupteurAdmin }) {
  const router = useRouter();
  const [etat, setEtat] = useState(interrupteur.etat);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );

  const apercu = useMemo(
    () => apercuDeploiement(interrupteur.cle, etat.deploiement),
    [interrupteur.cle, etat.deploiement]
  );

  async function envoyer(patch: Record<string, unknown>) {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/admin/fonctionnalites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cle: interrupteur.cle, ...patch }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as { erreur?: string };
      if (!reponse.ok) {
        setMessage({ ton: 'erreur', texte: corps.erreur ?? 'Échec de l’enregistrement.' });
        return;
      }
      setEtat((e) => ({
        ...e,
        ...(patch.actif !== undefined ? { actif: patch.actif as boolean } : null),
        ...(patch.planMinimal !== undefined
          ? { planMinimal: patch.planMinimal as InterrupteurAdmin['etat']['planMinimal'] }
          : null),
        ...(patch.deploiement !== undefined
          ? { deploiement: patch.deploiement as number }
          : null),
        ...(patch.juristeOk !== undefined ? { juristeOk: patch.juristeOk as boolean } : null),
        // Fermer retire la confirmation juridique (règle serveur).
        ...(patch.actif === false ? { juristeOk: false } : null),
      }));
      setMessage({ ton: 'ok', texte: 'Enregistré.' });
      router.refresh();
    } catch {
      setMessage({ ton: 'erreur', texte: 'Réseau indisponible.' });
    } finally {
      setEnCours(false);
    }
  }

  const ouvert = etat.actif;
  const planLabel = etat.planMinimal ? LIBELLES_PLAN[etat.planMinimal] : 'Tous';

  return (
    <details
      className="velours px-4 py-3 group rounded-[12px] border border-nuit-700"
      aria-labelledby={`titre-int-${interrupteur.cle}`}
    >
      <summary className="cursor-pointer list-none flex flex-wrap items-center gap-x-3 gap-y-1.5 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grenat-400 rounded-md">
        <span
          aria-hidden="true"
          className="text-grenat-400 shrink-0 transition-transform duration-200 group-open:rotate-45"
        >
          ＋
        </span>
        <span
          id={`titre-int-${interrupteur.cle}`}
          className="font-display text-base text-encre-100"
        >
          {interrupteur.libelle}
          <span className="text-xs text-encre-500 font-sans ml-1">({interrupteur.code})</span>
        </span>
        {/* Badges d'un coup d'œil, sans déplier. */}
        <span
          className={
            'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium border ' +
            (ouvert
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
              : 'bg-nuit-800 text-encre-500 border-nuit-700')
          }
        >
          {ouvert ? 'Ouvert' : 'Fermé'}
        </span>
        <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium border bg-nuit-800 text-encre-300 border-nuit-700">
          {planLabel}
        </span>
        <span className="shrink-0 text-[11px] text-encre-500 chiffres-tabulaires">
          {etat.deploiement} %
        </span>
      </summary>

      <div className="mt-3 space-y-4">
        <p className="text-sm text-encre-300">{interrupteur.description}</p>
        <p className="text-xs text-encre-500">
          {interrupteur.itineraires.length > 0 || interrupteur.api.length > 0 ? (
            <>
              Pages : {interrupteur.itineraires.join(', ') || '—'} · API :{' '}
              {interrupteur.api.join(', ') || '—'}
            </>
          ) : (
            interrupteur.sansItineraire
          )}
        </p>

        {interrupteur.risqueJuridique && (
          <p className="text-xs text-grenat-300 rounded-lg border border-grenat-500/40 bg-grenat-500/10 px-3 py-2">
            {interrupteur.noteJuridique}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={enCours}
              onClick={() => envoyer({ actif: !ouvert })}
              className={(ouvert ? 'bouton-fantome' : 'bouton-principal') + ' min-h-11 text-sm'}
              aria-pressed={ouvert}
            >
              {ouvert ? 'Fermer le module' : 'Ouvrir le module'}
            </button>
            {interrupteur.risqueJuridique && (
              <label className="flex items-start gap-2 text-xs text-encre-300 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-[var(--color-grenat-500,oklch(0.55_0.18_20))] size-4"
                  checked={etat.juristeOk}
                  disabled={enCours}
                  onChange={(e) => envoyer({ juristeOk: e.target.checked })}
                />
                <span>
                  Validé par un juriste
                  <br />
                  <span className="text-encre-500">
                    (obligatoire pour ouvrir ce module)
                  </span>
                </span>
              </label>
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-xs text-encre-500">
              Abonnement minimal
              <select
                className="select-sombre champ-sombre mt-1 w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
                value={etat.planMinimal ?? ''}
                disabled={enCours}
                onChange={(e) =>
                  envoyer({ planMinimal: e.target.value === '' ? null : e.target.value })
                }
              >
                <option value="">Aucun (tous les comptes)</option>
                {Object.entries(LIBELLES_PLAN).map(([valeur, libelle]) => (
                  <option key={valeur} value={valeur}>
                    {libelle}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-encre-500">
              Déploiement progressif : {etat.deploiement} %
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={etat.deploiement}
                disabled={enCours}
                onChange={(e) => setEtat((s) => ({ ...s, deploiement: Number(e.target.value) }))}
                onMouseUp={(e) =>
                  envoyer({ deploiement: Number((e.target as HTMLInputElement).value) })
                }
                onTouchEnd={(e) =>
                  envoyer({ deploiement: Number((e.target as HTMLInputElement).value) })
                }
                onKeyUp={(e) =>
                  envoyer({ deploiement: Number((e.target as HTMLInputElement).value) })
                }
                className="w-full mt-2 accent-[var(--color-grenat-500,oklch(0.55_0.18_20))]"
              />
              <span className="text-encre-500">
                Aperçu : {apercu} lecteur{apercu > 1 ? 's' : ''} sur 20 de test
                {etat.deploiement === 100 ? ' (tout le monde)' : ''}
                {etat.deploiement === 0 ? ' (personne)' : ''}
              </span>
            </label>
          </div>
        </div>

        {message && (
          <p
            role="status"
            className={
              'text-sm px-3 py-2 rounded-lg border ' +
              (message.ton === 'ok'
                ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                : 'text-grenat-300 border-grenat-500/40 bg-grenat-500/10')
            }
          >
            {message.texte}
          </p>
        )}
      </div>
    </details>
  );
}

export default function PanneauFonctionnalites({
  interrupteurs,
}: {
  interrupteurs: InterrupteurAdmin[];
}) {
  const groupes = useMemo(() => {
    const carte = new Map<string, InterrupteurAdmin[]>();
    for (const i of interrupteurs) {
      const liste = carte.get(i.groupe) ?? [];
      liste.push(i);
      carte.set(i.groupe, liste);
    }
    return [...carte.entries()];
  }, [interrupteurs]);

  const ouverts = interrupteurs.filter((i) => i.etat.actif).length;

  return (
    <div className="space-y-8">
      <p className="text-encre-500 text-sm italic">
        {interrupteurs.length} interrupteurs, {ouverts} ouvert
        {ouverts > 1 ? 's' : ''}. Un module fermé renvoie 404 — comme si la route
        n’existait pas. Tout changement est journalisé. Cliquez sur un module
        pour déplier ses réglages.
      </p>

      {groupes.map(([groupe, liste]) => (
        <section key={groupe} className="space-y-3" aria-labelledby={`titre-groupe-${groupe}`}>
          <h2
            id={`titre-groupe-${groupe}`}
            className="sur-titre text-encre-300"
          >
            {groupe}
          </h2>
          <div className="liseret" />
          <div className="space-y-2">
            {liste.map((interrupteur) => (
              <LigneInterrupteur key={interrupteur.cle} interrupteur={interrupteur} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

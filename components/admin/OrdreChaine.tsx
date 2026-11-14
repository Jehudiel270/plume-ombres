// ============================================================
// components/admin/OrdreChaine.tsx — Réordonner la chaîne de
// traduction depuis l'admin (persistance en base, sans redéploiement).
//
// Composant CLIENT AUTONOME : il charge l'état via GET
// /api/admin/chaine au montage et enregistre via PUT. Aucune prop
// requise — il suffit de l'insérer dans une page admin.
//
// Accessibilité : réordonnancement par BOUTONS Monter/Descendre
// (pas de glisser-déposer) — chaque commande est un <button>
// focusable au clavier, avec un aria-label explicite. Les
// changements portent sur une liste locale, enregistrée par le
// bouton « Enregistrer ».
//
// La route est réservée aux administrateurs (garde serveur) : si
// l'appel échoue (401/403), un message clair est affiché.
//
// MODE PRIVÉ STRICT : un encart rappelle que, s'il est actif, il
// PRIME sur tout ordre enregistré (seule la file auto-hébergée est
// autorisée) — et l'enregistrement est alors désactivé.
// ============================================================

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Save } from 'lucide-react';

type IdFournisseur = 'libretranslate' | 'gemini' | 'google' | 'mymemory';
type EtatMoteur = 'ok' | 'indisponible' | 'non_configure' | 'desactive';

interface MoteurCatalogue {
  id: IdFournisseur;
  nom: string;
  prive: boolean;
}

interface SanteMoteur {
  id: IdFournisseur;
  nom: string;
  prive: boolean;
  etat: EtatMoteur;
  latenceMs: number | null;
  cause: string | null;
}

interface EtatChaine {
  priveStrict: boolean;
  source: 'base' | 'env' | 'defaut';
  ordreEffectif: IdFournisseur[];
  ordreEditable: IdFournisseur[];
  catalogue: MoteurCatalogue[];
  moteurs: SanteMoteur[];
  moteurActif: { id: IdFournisseur; nom: string; prive: boolean } | null;
}

// Résultat brut du chargement de la chaîne : l'état React n'est écrit
// qu'après résolution de la promesse (voir `appliquer`).
type ResultatChaine =
  | { ok: true; donnees: EtatChaine }
  | { ok: false; erreur: string };

const LIBELLES_ETAT: Record<EtatMoteur, string> = {
  ok: 'Disponible',
  indisponible: 'Indisponible',
  non_configure: 'Non configuré',
  desactive: 'Désactivé (privé strict)',
};

const COULEURS_ETAT: Record<EtatMoteur, string> = {
  ok: 'border-violet-rom-500/60 bg-violet-rom-500/15 text-violet-rom-300',
  indisponible: 'border-grenat-500/60 bg-grenat-500/15 text-grenat-300',
  non_configure: 'border-nuit-700 bg-nuit-800 text-encre-500',
  desactive: 'border-nuit-700 bg-nuit-800 text-encre-500',
};

const LIBELLE_SOURCE: Record<EtatChaine['source'], string> = {
  base: 'enregistré en base (admin)',
  env: 'variable d’environnement (TRANSLATOR_FALLBACK_ORDER)',
  defaut: 'ordre par défaut',
};

export default function OrdreChaine() {
  const [etat, setEtat] = useState<EtatChaine | null>(null);
  const [ordre, setOrdre] = useState<IdFournisseur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  // `charger` ne touche à aucun état : elle rend le résultat du réseau et
  // c'est `appliquer` qui écrit l'état, appelé depuis une promesse (jamais
  // synchronement dans l'effet — règle react-hooks/set-state-in-effect).
  const charger = useCallback(async (): Promise<ResultatChaine> => {
    try {
      const r = await fetch('/api/admin/chaine', { cache: 'no-store' });
      if (!r.ok) {
        const corps = (await r.json().catch(() => ({}))) as { erreur?: string };
        return {
          ok: false,
          erreur: corps.erreur ?? `Chargement impossible (HTTP ${r.status}).`,
        };
      }
      return { ok: true, donnees: (await r.json()) as EtatChaine };
    } catch (e) {
      return { ok: false, erreur: e instanceof Error ? e.message : 'Chargement impossible.' };
    }
  }, []);

  const appliquer = useCallback((resultat: ResultatChaine) => {
    if (resultat.ok) {
      setEtat(resultat.donnees);
      setOrdre(resultat.donnees.ordreEditable);
      setErreur(null);
    } else {
      setErreur(resultat.erreur);
      setEtat(null);
    }
    setChargement(false);
  }, []);

  useEffect(() => {
    let vivant = true;
    void charger().then((resultat) => {
      if (vivant) appliquer(resultat);
    });
    return () => {
      vivant = false;
    };
  }, [charger, appliquer]);

  const recharger = useCallback(() => {
    setChargement(true);
    setErreur(null);
    setSucces(null);
    void charger().then(appliquer);
  }, [charger, appliquer]);

  const deplacer = (index: number, delta: number) => {
    setSucces(null);
    setOrdre((precedent) => {
      const cible = index + delta;
      if (cible < 0 || cible >= precedent.length) return precedent;
      const copie = [...precedent];
      const [element] = copie.splice(index, 1);
      copie.splice(cible, 0, element);
      return copie;
    });
  };

  const enregistrer = async () => {
    setEnregistrement(true);
    setErreur(null);
    setSucces(null);
    try {
      const r = await fetch('/api/admin/chaine', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordre }),
      });
      const corps = (await r.json().catch(() => ({}))) as EtatChaine & {
        erreur?: string;
      };
      if (!r.ok) {
        setErreur(corps.erreur ?? `Enregistrement refusé (HTTP ${r.status}).`);
        return;
      }
      setEtat(corps);
      setOrdre(corps.ordreEditable);
      setSucces(
        `Nouvel ordre enregistré : ${corps.ordreEditable.join(' → ')}. Il prend effet sans redéploiement.`
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setEnregistrement(false);
    }
  };

  const nomDe = (id: IdFournisseur): string =>
    etat?.catalogue.find((m) => m.id === id)?.nom ??
    etat?.moteurs.find((m) => m.id === id)?.nom ??
    id;

  const priveDe = (id: IdFournisseur): boolean =>
    etat?.catalogue.find((m) => m.id === id)?.prive ?? false;

  const santeDe = (id: IdFournisseur): SanteMoteur | undefined =>
    etat?.moteurs.find((m) => m.id === id);

  const verrouille = etat?.priveStrict === true;

  if (chargement) {
    return (
      <section className="velours p-6" aria-label="Ordre de la chaîne de traduction">
        <p className="sur-titre text-encre-300">Ordre de la chaîne de traduction</p>
        <p className="text-encre-500 text-sm mt-3">Chargement…</p>
      </section>
    );
  }

  return (
    <section
      className="velours p-6"
      aria-label="Ordre de la chaîne de traduction"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="sur-titre text-encre-300">Ordre de la chaîne de traduction</p>
        {etat && (
          <p className="text-encre-500 text-xs">
            source actuelle : {LIBELLE_SOURCE[etat.source]}
          </p>
        )}
      </div>

      <p className="text-encre-100 text-sm mt-3">
        Réordonnez les moteurs d’essai. L’ordre s’applique au prochain appel,
        sans redéploiement.
      </p>
      {etat && (
        <p className="text-encre-500 text-xs mt-1">
          Ordre effectif :{' '}
          <span className="text-encre-300">{etat.ordreEffectif.join(' → ')}</span>
        </p>
      )}

      {/* Encart mode privé strict : PRIORITAIRE sur tout ordre. */}
      <p
        className={`text-xs mt-3 rounded-lg border px-3 py-2 ${
          verrouille
            ? 'border-grenat-500/50 bg-grenat-500/10 text-grenat-300'
            : 'border-nuit-700 bg-nuit-800/60 text-encre-500'
        }`}
      >
        <strong>Mode privé strict :</strong> lorsqu’il est actif, il PRIME sur
        l’ordre ci-dessous — seule la file auto-hébergée (LibreTranslate) est
        autorisée, les moteurs tiers sont ignorés. L’ordre enregistré reprend
        effet dès que le mode est désactivé.
      </p>

      {erreur && (
        <p
          role="alert"
          className="text-grenat-300 text-sm mt-3 rounded-lg border border-grenat-500/40 bg-grenat-500/10 px-3 py-2"
        >
          {erreur}
        </p>
      )}
      {succes && (
        <p
          role="status"
          className="text-violet-rom-200 text-sm mt-3 rounded-lg border border-violet-rom-500/40 bg-violet-rom-500/10 px-3 py-2"
        >
          {succes}
        </p>
      )}

      <ul className="mt-4 space-y-2 list-none p-0" aria-label="Ordre des moteurs">
        {ordre.map((id, index) => {
          const sante = santeDe(id);
          const estPrive = priveDe(id);
          return (
            <li
              key={id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-nuit-700/60 bg-nuit-800/40 px-3 py-2"
            >
              <span className="text-encre-500 font-mono text-xs w-6">
                {index + 1}.
              </span>
              <span className="text-encre-100 text-sm flex-1 min-w-[12rem]">
                {nomDe(id)}
                <span className="text-encre-500 text-xs block">
                  {estPrive
                    ? 'Auto-hébergé (texte privé)'
                    : 'Tiers (le texte est transmis à un service externe)'}
                </span>
              </span>

              {sante && (
                <span
                  className={`rounded-full border text-[11px] uppercase tracking-wider px-2 py-0.5 ${COULEURS_ETAT[sante.etat]}`}
                  title={sante.cause ?? undefined}
                >
                  {LIBELLES_ETAT[sante.etat]}
                  {sante.latenceMs !== null ? ` · ${sante.latenceMs} ms` : ''}
                </span>
              )}

              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => deplacer(index, -1)}
                  disabled={index === 0}
                  aria-label={`Monter ${nomDe(id)}`}
                  className="rounded-md border border-nuit-700 px-2 py-1 text-encre-200 text-xs hover:border-violet-rom-500/60 hover:text-violet-rom-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronUp className="w-3.5 h-3.5 inline -mt-0.5" aria-hidden="true" />
                  Monter
                </button>
                <button
                  type="button"
                  onClick={() => deplacer(index, 1)}
                  disabled={index === ordre.length - 1}
                  aria-label={`Descendre ${nomDe(id)}`}
                  className="rounded-md border border-nuit-700 px-2 py-1 text-encre-200 text-xs hover:border-violet-rom-500/60 hover:text-violet-rom-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="w-3.5 h-3.5 inline -mt-0.5" aria-hidden="true" />
                  Descendre
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button
          type="button"
          onClick={enregistrer}
          disabled={enregistrement || verrouille}
          aria-label="Enregistrer le nouvel ordre de la chaîne"
          className="rounded-lg border border-violet-rom-500/60 bg-violet-rom-500/20 px-4 py-2 text-violet-rom-200 text-sm hover:bg-violet-rom-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4 inline -mt-0.5" aria-hidden="true" />
          {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          type="button"
          onClick={recharger}
          disabled={enregistrement}
          className="rounded-lg border border-nuit-700 px-4 py-2 text-encre-300 text-sm hover:border-violet-rom-500/60 disabled:opacity-40"
        >
          <RefreshCw className="w-4 h-4 inline -mt-0.5" aria-hidden="true" />
          Recharger
        </button>
        {verrouille && (
          <span className="text-grenat-300 text-xs">
            Enregistrement désactivé : mode privé strict actif.
          </span>
        )}
      </div>
    </section>
  );
}

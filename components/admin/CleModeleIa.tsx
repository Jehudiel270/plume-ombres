'use client';

// ============================================================
// components/admin/CleModeleIa.tsx — Clé du modèle d'IA.
//
// Formulaire du panneau d'administration (/admin/fonctionnalites) :
// l'administrateur colle sa clé d'API Gemini (AI Studio) pour
// essayer l'aide à la lecture (résumé F10, questions F6) sans
// toucher aux variables d'environnement.
//
// SÉCURITÉ : la clé complète n'est JAMAIS renvoyée au navigateur.
// Le serveur n'expose qu'un aperçu masqué (AIza…x9Qz) ; l'écriture
// passe par PUT /api/admin/parametres (garde admin + RLS
// `public.est_admin()`), qui journalise le changement sans jamais
// écrire la valeur. Pour ouvrir le module à TOUS les abonnés, la
// variable d'environnement GEMINI_API_KEY reste la voie officielle.
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Save, Trash2 } from 'lucide-react';

export interface EtatCleIa {
  defini: boolean;
  apercu: string | null;
  majLe: string | null;
}

function dateCourte(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function CleModeleIa({ etatInitial }: { etatInitial: EtatCleIa }) {
  const router = useRouter();
  const [champ, setChamp] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );
  const [afficher, setAfficher] = useState(false);

  async function enregistrer() {
    const valeur = champ.trim();
    if (valeur.length < 20) {
      setMessage({
        ton: 'erreur',
        texte: 'Cette clé est trop courte : collez la clé complète (au moins 20 caractères).',
      });
      return;
    }
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/admin/parametres', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valeur }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as { erreur?: string };
      if (!reponse.ok) {
        setMessage({ ton: 'erreur', texte: corps.erreur ?? 'Échec de l’enregistrement.' });
        return;
      }
      setChamp('');
      setMessage({ ton: 'ok', texte: 'Clé enregistrée : l’aide à la lecture peut être essayée.' });
      router.refresh();
    } catch {
      setMessage({ ton: 'erreur', texte: 'Réseau indisponible.' });
    } finally {
      setEnCours(false);
    }
  }

  async function retirer() {
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/admin/parametres', { method: 'DELETE' });
      const corps = (await reponse.json().catch(() => ({}))) as { erreur?: string };
      if (!reponse.ok) {
        setMessage({ ton: 'erreur', texte: corps.erreur ?? 'Échec de la suppression.' });
        return;
      }
      setMessage({ ton: 'ok', texte: 'Clé retirée.' });
      router.refresh();
    } catch {
      setMessage({ ton: 'erreur', texte: 'Réseau indisponible.' });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section
      className="velours p-5 space-y-4 rounded-2xl border border-nuit-700"
      aria-labelledby="titre-cle-modele"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="titre-cle-modele" className="font-display text-lg text-encre-100">
            Clé du modèle d’aide à la lecture
          </h2>
          <p className="text-sm text-encre-300 mt-1">
            Collez ici une clé d’API Gemini (AI Studio, gratuite) pour essayer le
            résumé à la reprise (F10) et les questions sur la lecture (F6) sur
            VOTRE compte, sans toucher au déploiement.
          </p>
        </div>
        <span
          className={
            'shrink-0 rounded-full px-3 py-1 text-xs font-medium border ' +
            (etatInitial.defini
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
              : 'bg-nuit-800 text-encre-500 border-nuit-700')
          }
        >
          {etatInitial.defini ? `Enregistrée (${etatInitial.apercu})` : 'Non configurée'}
        </span>
      </div>

      {etatInitial.defini && (
        <p className="text-xs text-encre-500">
          Dernière mise à jour : {dateCourte(etatInitial.majLe)}. La valeur
          complète n’est jamais réaffichée : pour la remplacer, collez la
          nouvelle ci-dessous.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block text-xs text-encre-500">
          Clé d’API {afficher ? '(visible)' : '(masquée à la saisie)'}
          <div className="flex gap-2 mt-1">
            <input
              type={afficher ? 'text' : 'password'}
              className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100"
              value={champ}
              disabled={enCours}
              autoComplete="off"
              spellCheck={false}
              placeholder="AIza…"
              onChange={(e) => setChamp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  enregistrer();
                }
              }}
            />
            <button
              type="button"
              className="bouton-fantome min-h-11 text-sm shrink-0"
              onClick={() => setAfficher((a) => !a)}
            >
              {afficher ? (
                <EyeOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Eye className="w-4 h-4" aria-hidden="true" />
              )}
              {afficher ? 'Masquer' : 'Afficher'}
            </button>
          </div>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            className="bouton-principal min-h-11 text-sm"
            disabled={enCours || champ.trim().length === 0}
            onClick={enregistrer}
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            Enregistrer la clé
          </button>
          {etatInitial.defini && (
            <button
              type="button"
              className="bouton-fantome min-h-11 text-sm"
              disabled={enCours}
              onClick={retirer}
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              Retirer
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-encre-500">
        La clé est stockée côté serveur, lisible uniquement par les
        administrateurs, et jamais renvoyée en clair au navigateur. Elle est
        utilisée quand VOUS demandez un résumé ou posez une question depuis le
        lecteur. Pour ouvrir le module à tous les abonnés Passionné, définissez
        aussi la variable d’environnement <code>GEMINI_API_KEY</code> chez
        l’hébergeur (Production et Preview).
      </p>

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
    </section>
  );
}

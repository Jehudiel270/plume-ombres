'use client';

// ============================================================
// components/lecteur/PanneauCarnetExpress.tsx — Nouvelle entrée de
// carnet depuis le lecteur (F2), portage du NotebookComposer de la
// maquette, adapté à l'atelier réel :
//   * le livre et le chapitre sont déjà connus (on est DANS le
//     lecteur) : pas de sélecteurs, l'entrée est rattachée au
//     chapitre affiché ;
//   * type Note / Citation, couleur parmi les cinq teintes de la
//     maquette (or, rouge, azur, menthe, lilas) ;
//   * écriture par /api/carnet (interrupteur, plan et plafonds
//     revérifiés côté serveur) — jamais d'écriture directe.
// ============================================================

import { useState } from 'react';

import {
  COULEURS_CARNET,
  COULEUR_DEFAUT,
  type CouleurCarnet,
  type TypeCarnet,
} from '@/lib/carnet';

interface Props {
  livreId: string;
  chapitreId: string | null;
  chapitreTitre: string | null;
  /** Passage sélectionné, repris tel quel (facultatif). */
  extraitInitial?: string;
  /** Annotation existante (mode modification d'une entrée). */
  annotationInitiale?: string;
  /** Entrée à modifier (PATCH) — absent : création (POST). */
  entreeId?: string;
  /** Type présélectionné (la sélection de texte propose « citation »). */
  typeInitial?: TypeCarnet;
  surEnregistre: () => void;
}

export default function PanneauCarnetExpress({
  livreId,
  chapitreId,
  chapitreTitre,
  extraitInitial = '',
  annotationInitiale = '',
  entreeId,
  typeInitial,
  surEnregistre,
}: Props) {
  const [type, setType] = useState<TypeCarnet>(typeInitial ?? (extraitInitial ? 'citation' : 'note'));
  const [annotation, setAnnotation] = useState(annotationInitiale);
  const [couleur, setCouleur] = useState<CouleurCarnet>(COULEUR_DEFAUT);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const changerType = (t: TypeCarnet) => {
    setType(t);
  };

  const enregistrer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      // Modification d'une entrée existante (bulle d'un surlignage)
      // ou création — le serveur revérifie module, plan et plafonds.
      const reponse = await fetch('/api/carnet', {
        method: entreeId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          entreeId
            ? { id: entreeId, annotation, couleur }
            : {
                livreId,
                chapitreId,
                type,
                extrait: extraitInitial,
                annotation,
                chapitreTitre,
                couleur,
              }
        ),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as { erreur?: string };
      if (!reponse.ok) {
        setErreur(donnees.erreur ?? 'Échec de l’enregistrement.');
        return;
      }
      surEnregistre();
    } catch {
      setErreur('Réseau indisponible.');
    } finally {
      setEnCours(false);
    }
  };

  const valide = entreeId
    ? true // une entrée existante a déjà un contenu : la modification est toujours possible
    : extraitInitial.trim().length > 0 || annotation.trim().length > 0;

  return (
    <div className="space-y-4">
      {extraitInitial.trim() && (
        <p className="line-clamp-3 border-l-2 border-grenat-700 pl-2 text-[12px] italic text-encre-400">
          « {extraitInitial.slice(0, 240)}
          {extraitInitial.length > 240 ? '…' : ''} »
        </p>
      )}

      <div>
        <p className="mb-1.5 text-[13px] text-encre-400">Type</p>
        <div
          role="radiogroup"
          aria-label="Type d’entrée"
          className="flex gap-1"
        >
          {(['note', 'citation'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              disabled={!!entreeId}
              onClick={() => changerType(t)}
              className={`min-h-10 flex-1 rounded-lg border px-2 text-xs transition-colors cursor-pointer disabled:opacity-50 ${
                type === t
                  ? 'border-grenat-600 bg-nuit-700/60 text-encre-100'
                  : 'border-nuit-700 text-encre-500 hover:text-encre-300'
              }`}
            >
              {t === 'note' ? 'Note' : 'Citation'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="carnet-express-texte" className="mb-1.5 block text-[13px] text-encre-400">
          {type === 'citation' ? 'Votre commentaire (facultatif)' : 'Votre note'}
        </label>
        <textarea
          id="carnet-express-texte"
          value={annotation}
          onChange={(e) => setAnnotation(e.target.value)}
          rows={4}
          placeholder={
            type === 'citation'
              ? 'Ce que ce passage vous fait…'
              : 'Votre pensée du moment, une question, un doute…'
          }
          className="champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100"
        />
      </div>

      <div>
        <p className="mb-1.5 text-[13px] text-encre-400">Couleur</p>
        <div className="flex gap-2" role="radiogroup" aria-label="Couleur">
          {COULEURS_CARNET.map((c) => (
            <button
              key={c.valeur}
              type="button"
              role="radio"
              aria-checked={couleur === c.valeur}
              aria-label={c.label}
              title={c.label}
              onClick={() => setCouleur(c.valeur)}
              className={`grid h-9 w-9 place-items-center rounded-full border transition-colors cursor-pointer ${
                couleur === c.valeur ? 'border-encre-200' : 'border-transparent'
              }`}
            >
              <span className={`h-4 w-4 rounded-full ${c.pastille}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      {erreur && <p className="text-xs text-grenat-300">{erreur}</p>}

      <button
        type="button"
        onClick={enregistrer}
        disabled={!valide || enCours}
        className="bouton-principal w-full min-h-11 text-sm disabled:opacity-40"
      >
        {enCours ? 'Enregistrement…' : 'Enregistrer dans le carnet'}
      </button>
      <p className="text-[11px] text-encre-500 text-center">
        Privé par défaut : une entrée de carnet n’est visible que de vous.
      </p>
    </div>
  );
}

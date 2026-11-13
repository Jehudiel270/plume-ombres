'use client';

// ============================================================
// PanneauPartage.tsx — Contenu reçu par le partage système (PWA)
// et ses deux destinations. Portage de la maquette
// (zip plume-ombres-ui, ShareImport.vue) adapté au réel :
//   * « Ajouter au carnet » → POST /api/carnet (F2) : note ou
//     citation plafonnée à 40 mots, rattachée à un livre du compte ;
//   * « Importer une source » → pas de faux formulaire : le site
//     traduit depuis des fichiers importés dans la bibliothèque ;
//     le lien est copié et la route d'import rappelée.
//
// Le lecteur garde la main : les champs reçus sont éditables, rien
// ne part sans confirmation. Le lien est vérifié (http/https).
// ============================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { COULEUR_DEFAUT } from '@/lib/carnet';

/** Plafond d'une citation partagée : 40 mots, comme dans la maquette. */
const MAX_MOTS_CITATION = 40;

interface Props {
  titreRecu: string;
  texteRecu: string;
  lienRecu: string;
  livres: { id: string; titre: string }[];
}

function urlSûre(brut: string): URL | null {
  const texte = brut.trim();
  if (!texte) return null;
  try {
    const u = new URL(texte);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

function plafonnerMots(texte: string, max: number): string {
  const mots = texte.trim().split(/\s+/).filter(Boolean);
  return mots.length <= max ? texte.trim() : mots.slice(0, max).join(' ');
}

export default function PanneauPartage({
  titreRecu,
  texteRecu,
  lienRecu,
  livres,
}: Props) {
  const [titre, setTitre] = useState(titreRecu);
  const [texte, setTexte] = useState(texteRecu);
  const [lien, setLien] = useState(lienRecu);
  const [destination, setDestination] = useState<'carnet' | 'source'>('carnet');
  const [type, setType] = useState<'note' | 'citation'>('note');
  const [livreId, setLivreId] = useState(livres[0]?.id ?? '');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(
    null
  );

  const adresse = useMemo(() => urlSûre(lien), [lien]);
  const lienInvalide = lien.trim() !== '' && !adresse;
  const aDuContenu = !!(titre.trim() || texte.trim() || lien.trim());

  // Carnet : la note porte le tout ; la citation ne porte que le
  // passage plafonné (l'annotation conserve le titre et le lien).
  const annotationNote = useMemo(
    () => [titre.trim(), texte.trim(), adresse ? adresse.href : '']
      .filter(Boolean)
      .join('\n'),
    [titre, texte, adresse]
  );
  const citation = useMemo(
    () => plafonnerMots(texte, MAX_MOTS_CITATION),
    [texte]
  );
  const peutAjouter =
    destination === 'carnet' &&
    livreId !== '' &&
    (type === 'citation' ? citation !== '' : annotationNote.trim() !== '');

  const ajouterAuCarnet = async () => {
    if (!peutAjouter || enCours) return;
    setEnCours(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/carnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          livreId,
          type,
          extrait: type === 'citation' ? citation : '',
          annotation: annotationNote,
          couleur: COULEUR_DEFAUT,
        }),
      });
      const donnees = (await reponse.json().catch(() => ({}))) as {
        erreur?: string;
      };
      if (!reponse.ok) {
        setMessage({
          ok: false,
          texte: donnees.erreur ?? 'Échec de l’ajout au carnet.',
        });
        return;
      }
      setMessage({
        ok: true,
        texte:
          type === 'citation'
            ? 'Citation posée dans votre carnet, ce passage y est plafonné comme l’exige l’atelier.'
            : 'Note posée dans votre carnet.',
      });
    } catch {
      setMessage({ ok: false, texte: 'Réseau indisponible.' });
    } finally {
      setEnCours(false);
    }
  };

  const copierLien = async () => {
    if (!adresse) return;
    try {
      await navigator.clipboard.writeText(adresse.href);
      setMessage({ ok: true, texte: 'Lien copié : collez-le où vous voulez.' });
    } catch {
      setMessage({
        ok: false,
        texte: 'La copie automatique est bloquée par votre navigateur : sélectionnez le lien à la main.',
      });
    }
  };

  const champ =
    'champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2 text-sm text-encre-100';

  return (
    <div className="space-y-6">
      {/* Contenu reçu */}
      <section className="velours p-5 rounded-2xl space-y-4" aria-labelledby="partage-recu">
        <h2 id="partage-recu" className="font-display text-xl text-encre-100">
          Contenu reçu
        </h2>
        <p className="text-sm text-encre-400">
          Vérifiez et corrigez avant de continuer : rien n’est enregistré sans votre
          confirmation.
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="sur-titre text-encre-300">Titre</span>
            <input
              className={`${champ} mt-1.5`}
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              maxLength={200}
              placeholder="Titre du contenu partagé"
            />
          </label>
          <label className="block">
            <span className="sur-titre text-encre-300">Texte</span>
            <textarea
              className={`${champ} mt-1.5 min-h-24`}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Passage ou message partagé"
            />
          </label>
          <label className="block">
            <span className="sur-titre text-encre-300">Lien</span>
            <input
              className={`${champ} mt-1.5`}
              value={lien}
              onChange={(e) => setLien(e.target.value)}
              maxLength={500}
              type="url"
              inputMode="url"
              placeholder="https://"
            />
          </label>
          {lienInvalide && (
            <p className="text-xs text-grenat-400" role="alert">
              Ce lien n’est pas valide : seules les adresses http et https sont acceptées.
            </p>
          )}
          {adresse && (
            <p className="text-xs text-encre-500">
              Site : {adresse.hostname}
            </p>
          )}
        </div>
        {!aDuContenu && (
          <p className="text-sm text-encre-400 velours p-4 rounded-xl border border-nuit-700">
            Aucun contenu reçu pour le moment. Depuis votre téléphone, installez
            l’application puis utilisez le menu « Partager » d’une autre application et
            choisissez Plume d’Ombres. Vous pouvez aussi remplir les champs ci-dessus à
            la main.
          </p>
        )}
      </section>

      {/* Destination */}
      <section className="velours p-5 rounded-2xl space-y-4" aria-labelledby="partage-dest">
        <h2 id="partage-dest" className="font-display text-xl text-encre-100">
          Que souhaitez-vous en faire ?
        </h2>
        <div className="flex gap-1" role="group" aria-label="Destination">
          <button
            type="button"
            onClick={() => setDestination('carnet')}
            aria-pressed={destination === 'carnet'}
            className={`min-h-10 text-xs px-3 ${destination === 'carnet' ? 'bouton-principal' : 'bouton-fantome'}`}
          >
            Ajouter au carnet
          </button>
          <button
            type="button"
            onClick={() => setDestination('source')}
            aria-pressed={destination === 'source'}
            className={`min-h-10 text-xs px-3 ${destination === 'source' ? 'bouton-principal' : 'bouton-fantome'}`}
          >
            Importer une source
          </button>
        </div>

        {destination === 'carnet' && (
          <div className="space-y-3">
            {livres.length === 0 ? (
              <p className="text-sm text-encre-400">
                Importez d’abord un livre : votre carnet accompagne vos lectures.{' '}
                <Link href="/bibliotheque" className="lien-discret underline">
                  Aller à la bibliothèque
                </Link>
              </p>
            ) : (
              <label className="block">
                <span className="sur-titre text-encre-300">Livre concerné</span>
                <select
                  className={`${champ} select-sombre mt-1.5`}
                  value={livreId}
                  onChange={(e) => setLivreId(e.target.value)}
                >
                  {livres.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.titre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex gap-1" role="group" aria-label="Type d’entrée">
              <button
                type="button"
                onClick={() => setType('note')}
                aria-pressed={type === 'note'}
                className={`min-h-10 text-xs px-3 ${type === 'note' ? 'bouton-principal' : 'bouton-fantome'}`}
              >
                Note
              </button>
              <button
                type="button"
                onClick={() => setType('citation')}
                aria-pressed={type === 'citation'}
                className={`min-h-10 text-xs px-3 ${type === 'citation' ? 'bouton-principal' : 'bouton-fantome'}`}
              >
                Citation
              </button>
            </div>
            {type === 'citation' && (
              <p className="text-xs text-encre-500">
                Une citation est plafonnée à {MAX_MOTS_CITATION} mots, comme tout
                passage cité de l’atelier.
              </p>
            )}
            <button
              type="button"
              onClick={ajouterAuCarnet}
              disabled={!peutAjouter || enCours}
              className="bouton-principal min-h-10 text-sm px-4"
            >
              {enCours ? 'Ajout en cours…' : 'Ajouter au carnet'}
            </button>
          </div>
        )}

        {destination === 'source' && (
          <div className="space-y-3">
            <p className="text-sm text-encre-400">
              Le studio traduit ce que vous importez chez vous : des fichiers{' '}
              .txt, .md ou .epub déposés dans votre bibliothèque. Il n’y a pas de
              bibliothèque partagée : un simple lien de page ne peut pas devenir un
              livre, sans les droits sur le texte.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copierLien}
                disabled={!adresse}
                className="bouton-principal min-h-10 text-sm px-4"
              >
                Copier le lien
              </button>
              <Link
                href="/bibliotheque"
                className="bouton-fantome min-h-10 text-sm px-4 inline-flex items-center"
              >
                Ouvrir la bibliothèque
              </Link>
            </div>
          </div>
        )}

        {message && (
          <p
            className={`text-xs ${message.ok ? 'text-encre-300' : 'text-grenat-400'}`}
            role="status"
          >
            {message.texte}
          </p>
        )}
      </section>
    </div>
  );
}

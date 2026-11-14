'use client';

// ============================================================
// FicheLivreAmbiance.tsx — Édition en place de la fiche d'ambiance
// d'un livre (F5 v2, fiche RICHE). Écriture via server action
// (module revérifié côté serveur), retour d'état local immédiat.
//
// Reprend le cahier initial EN ENTIER : socle (genres, tropes,
// intensité) ET richesse — palette de 5 couleurs nommées,
// atmosphère, ton, rythme 1 → 5 avec libellé, promesses sans
// spoiler, playlist nommée avec pistes (titre, humeur, minutes),
// citation d'ouverture du chapitre 1, mots-clés.
// ============================================================

import { useState, useTransition } from 'react';

// Les helpers purs (INTENSITES, libelleIntensite, libelleRythme)
// sont importés ICI, dans le monde client : une fonction ne peut
// PAS traverser la frontière serveur → client en prop (erreur de
// sérialisation RSC, cause du crash « Le fil s'est rompu » avec au
// moins un livre).
import {
  INTENSITES,
  libelleIntensite,
  libelleRythme,
  MAX_COULEURS,
  MAX_PISTES,
  type CouleurPalette,
  type Intensite,
  type PistePlaylist,
} from '@/lib/ambiance';
import { enregistrerFiche } from '@/app/ambiance/actions';

interface Props {
  livre: { id: string; titre: string };
  genresInitiaux: string[];
  tropesInitiaux: string[];
  intensiteInitiale: Intensite;
  paletteInitiale: CouleurPalette[];
  atmosphereInitiale: string | null;
  tonInitial: string | null;
  rythmeNiveauInitial: Intensite | null;
  rythmeLabelInitial: string | null;
  promessesInitiales: string[];
  playlistNomInitial: string | null;
  playlistInitiale: PistePlaylist[];
  citationInitiale: string | null;
  motsClesInitiaux: string[];
}

const champClasse =
  'champ-sombre w-full rounded-lg border border-nuit-700 bg-nuit-850 px-3 py-2.5 text-sm text-encre-100';

export default function FicheLivreAmbiance({
  livre,
  genresInitiaux,
  tropesInitiaux,
  intensiteInitiale,
  paletteInitiale,
  atmosphereInitiale,
  tonInitial,
  rythmeNiveauInitial,
  rythmeLabelInitial,
  promessesInitiales,
  playlistNomInitial,
  playlistInitiale,
  citationInitiale,
  motsClesInitiaux,
}: Props) {
  // Échelle locale (1 → 5) : copie défensive pour la boucle de rendu.
  const intensites: readonly Intensite[] = INTENSITES;
  const [enAttente, demarrer] = useTransition();
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(
    null
  );
  const [intensite, setIntensite] = useState<Intensite>(intensiteInitiale);
  const [rythmeNiveau, setRythmeNiveau] = useState<Intensite | null>(
    rythmeNiveauInitial
  );

  // Palette : 5 emplacements nommés, couleur à la pipette.
  const [palette, setPalette] = useState<CouleurPalette[]>(() => {
    const base: CouleurPalette[] = paletteInitiale.slice(0, MAX_COULEURS);
    while (base.length < MAX_COULEURS) base.push({ nom: '', hex: '#2e1f27' });
    return base;
  });
  const majCouleur = (index: number, champ: 'nom' | 'hex', valeur: string) =>
    setPalette((prev) => prev.map((c, i) => (i === index ? { ...c, [champ]: valeur } : c)));

  // Playlist : pistes (titre, humeur, minutes).
  const [playlist, setPlaylist] = useState<PistePlaylist[]>(playlistInitiale);
  const majPiste = (index: number, champ: keyof PistePlaylist, valeur: string) =>
    setPlaylist((prev) =>
      prev.map((p, i) =>
        i === index
          ? {
              ...p,
              [champ]: champ === 'minutes' ? Number(valeur) || 1 : valeur,
            }
          : p
      )
    );

  const action = (formData: FormData) => {
    formData.set(
      'palette',
      JSON.stringify(palette.filter((c) => c.nom.trim()))
    );
    formData.set(
      'playlist',
      JSON.stringify(playlist.filter((p) => p.titre.trim()))
    );
    demarrer(async () => {
      const resultat = await enregistrerFiche(formData);
      setMessage(
        resultat.ok
          ? { ton: 'ok', texte: 'Fiche d’ambiance enregistrée.' }
          : { ton: 'erreur', texte: resultat.erreur ?? 'Enregistrement impossible.' }
      );
    });
  };

  const rythmeLabels = ['', 'Très posé', 'Posé', 'Mesuré', 'Soutenu', 'Très rapide'];

  return (
    <li className="velours p-5 rounded-2xl">
      <form action={action} className="space-y-3">
        <input type="hidden" name="livreId" value={livre.id} />
        <input type="hidden" name="intensite" value={intensite} />
        {rythmeNiveau !== null && (
          <input type="hidden" name="rythmeNiveau" value={rythmeNiveau} />
        )}
        <input type="hidden" name="palette" value="[]" />
        <input type="hidden" name="playlist" value="[]" />

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-encre-100">{livre.titre}</span>
          <span className="text-xs text-encre-500 ml-auto">
            Intensité : {libelleIntensite(intensite)}
          </span>
        </div>

        <div className="flex gap-1" role="group" aria-label={`Intensité de ${livre.titre}`}>
          {intensites.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIntensite(i)}
              aria-pressed={intensite === i}
              title={libelleIntensite(i)}
              className={`flex-1 min-h-9 text-xs ${intensite === i ? 'bouton-principal' : 'bouton-fantome'} cursor-pointer`}
            >
              {i}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            name="genres"
            defaultValue={genresInitiaux.join(', ')}
            placeholder="Genres, séparés par des virgules (gothique, dark academia…)"
            className={champClasse}
          />
          <input
            type="text"
            name="tropes"
            defaultValue={tropesInitiaux.join(', ')}
            placeholder="Tropes (ennemis à amants, château hanté…)"
            className={champClasse}
          />
        </div>

        {/* ---------- RICHESSE : le cahier initial, en entier ---------- */}
        <details className="rounded-xl border border-nuit-700/70 px-4 py-3">
          <summary className="cursor-pointer text-sm text-encre-300 select-none">
            La fiche complète — palette, atmosphère, rythme, promesses,
            playlist, citation d’ouverture, mots-clés
          </summary>

          <div className="mt-4 space-y-4">
            {/* Palette de 5 couleurs nommées */}
            <fieldset>
              <legend className="text-[11px] uppercase tracking-wider text-encre-500 mb-2">
                Palette ({MAX_COULEURS} couleurs nommées)
              </legend>
              <div className="grid gap-2 sm:grid-cols-5">
                {palette.map((c, i) => (
                  <div key={i} className="rounded-lg border border-nuit-700 overflow-hidden">
                    <input
                      type="color"
                      value={c.hex}
                      onChange={(e) => majCouleur(i, 'hex', e.target.value)}
                      aria-label={`Couleur ${i + 1} de ${livre.titre}`}
                      className="h-10 w-full cursor-pointer bg-transparent"
                    />
                    <div className="p-1.5">
                      <input
                        type="text"
                        value={c.nom}
                        onChange={(e) => majCouleur(i, 'nom', e.target.value)}
                        placeholder={`Nom ${i + 1}`}
                        maxLength={30}
                        className="champ-sombre w-full rounded border border-nuit-700 bg-nuit-850 px-2 py-1.5 text-xs text-encre-100"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>

            {/* Atmosphère + ton */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-encre-500">
                  Atmosphère (texte)
                </span>
                <textarea
                  name="atmosphere"
                  defaultValue={atmosphereInitiale ?? ''}
                  maxLength={280}
                  rows={3}
                  placeholder="Une cour aux couloirs froids, des archives qui sentent la cire…"
                  className={`${champClasse} mt-1`}
                />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-encre-500">
                  Ton
                </span>
                <input
                  type="text"
                  name="ton"
                  defaultValue={tonInitial ?? ''}
                  maxLength={120}
                  placeholder="Sombre, élégant, tendu sous la courtoisie"
                  className={`${champClasse} mt-1`}
                />
              </label>
            </div>

            {/* Rythme : niveau 1 → 5 + libellé */}
            <fieldset>
              <legend className="text-[11px] uppercase tracking-wider text-encre-500 mb-2">
                Rythme
              </legend>
              <div className="flex flex-wrap items-center gap-1.5">
                {intensites.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setRythmeNiveau(rythmeNiveau === i ? null : i)}
                    aria-pressed={rythmeNiveau === i}
                    title={rythmeLabels[i]}
                    className={`min-h-9 min-w-9 text-xs ${rythmeNiveau === i ? 'bouton-principal' : 'bouton-fantome'} cursor-pointer`}
                  >
                    {i}
                  </button>
                ))}
                {rythmeNiveau !== null && (
                  <span className="text-xs text-encre-400 ml-1">{libelleRythme(rythmeNiveau)}</span>
                )}
              </div>
              <input
                type="text"
                name="rythmeLabel"
                defaultValue={rythmeLabelInitial ?? ''}
                maxLength={80}
                placeholder="Lent au début, puis de plus en plus serré"
                className={`${champClasse} mt-2`}
              />
            </fieldset>

            {/* Promesses du livre, sans spoiler */}
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-encre-500">
                Ce que le livre promet (une ligne par promesse, sans spoiler)
              </span>
              <textarea
                name="promesses"
                defaultValue={promessesInitiales.join('\n')}
                rows={3}
                maxLength={600}
                placeholder={'Une lente montée de tension entre deux adversaires\nDes intrigues de palais à décoder'}
                className={`${champClasse} mt-1`}
              />
            </label>

            {/* Playlist nommée + pistes */}
            <fieldset>
              <legend className="text-[11px] uppercase tracking-wider text-encre-500 mb-2">
                Playlist d’ambiance
              </legend>
              <input
                type="text"
                name="playlistNom"
                defaultValue={playlistNomInitial ?? ''}
                maxLength={120}
                placeholder="Nom de la playlist (Veillée aux archives…)"
                className={champClasse}
              />
              <ul className="mt-2 space-y-2">
                {playlist.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <span className="w-4 text-xs text-encre-500 tnum">{i + 1}</span>
                    <input
                      type="text"
                      value={p.titre}
                      onChange={(e) => majPiste(i, 'titre', e.target.value)}
                      placeholder="Titre de la piste"
                      maxLength={60}
                      className={`${champClasse} flex-1 min-w-40`}
                    />
                    <input
                      type="text"
                      value={p.humeur}
                      onChange={(e) => majPiste(i, 'humeur', e.target.value)}
                      placeholder="Humeur"
                      maxLength={60}
                      className={`${champClasse} flex-1 min-w-36`}
                    />
                    <input
                      type="number"
                      value={p.minutes}
                      onChange={(e) => majPiste(i, 'minutes', e.target.value)}
                      min={1}
                      max={30}
                      aria-label={`Minutes de la piste ${i + 1}`}
                      className={`${champClasse} w-20`}
                    />
                    <button
                      type="button"
                      onClick={() => setPlaylist((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Retirer la piste ${i + 1}`}
                      className="text-encre-500 hover:text-grenat-400 cursor-pointer"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              {playlist.length < MAX_PISTES && (
                <button
                  type="button"
                  onClick={() => setPlaylist((prev) => [...prev, { titre: '', humeur: '', minutes: 3 }])}
                  className="bouton-fantome !min-h-9 text-xs mt-2 cursor-pointer"
                >
                  Ajouter une piste
                </button>
              )}
            </fieldset>

            {/* Citation d'ouverture + mots-clés */}
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-encre-500">
                Citation d’ouverture (chapitre 1, sans révélation)
              </span>
              <textarea
                name="citationOuverture"
                defaultValue={citationInitiale ?? ''}
                rows={2}
                maxLength={300}
                placeholder="« À Vaelmont, on apprend très tôt que le silence est une langue… »"
                className={`${champClasse} mt-1`}
              />
            </label>
            <input
              type="text"
              name="motsCles"
              defaultValue={motsClesInitiaux.join(', ')}
              maxLength={200}
              placeholder="Mots-clés, séparés par des virgules (Archives, Cour, Hiver…)"
              className={champClasse}
            />
          </div>
        </details>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={enAttente}
            className="bouton-principal min-h-10 text-sm disabled:opacity-40 cursor-pointer"
          >
            {enAttente ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {message && (
            <p
              role="status"
              className={`text-xs ${message.ton === 'ok' ? 'text-encre-300' : 'text-grenat-400'}`}
            >
              {message.texte}
            </p>
          )}
        </div>
      </form>
    </li>
  );
}

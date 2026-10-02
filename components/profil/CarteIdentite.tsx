'use client';

// Carte « Identité » du profil (/compte).
//
// Le pseudo se modifie réellement (public.profiles) : la valeur affichée
// après enregistrement vient de la ligne RENVOYÉE par la base, pas de la
// saisie locale — ce qui prouve l'aller-retour. L'adresse e-mail reste en
// lecture seule : elle identifie la connexion et son changement exige une
// double confirmation que cette page n'implémente pas encore.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { creerClientNavigateur } from '@/lib/supabase/client';

interface Props {
  pseudoInitial: string;
  email: string;
  /** Date ISO de création du compte (profil ou auth), ou null. */
  depuis: string | null;
  nbLivres: number;
  nbFavoris: number;
}

const LONGUEUR_MIN = 2;
const LONGUEUR_MAX = 40;

function formaterDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function CarteIdentite({
  pseudoInitial,
  email,
  depuis,
  nbLivres,
  nbFavoris,
}: Props) {
  const routeur = useRouter();
  const [pseudo, setPseudo] = useState(pseudoInitial);
  // Dernière valeur confirmée par la base (null tant qu'aucune écriture).
  const [enregistre, setEnregistre] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const valeur = pseudo.trim();
  const reference = enregistre ?? pseudoInitial;
  const invalide = valeur.length < LONGUEUR_MIN || valeur.length > LONGUEUR_MAX;
  const inchange = valeur === reference;

  async function enregistrer(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (invalide || envoi || inchange) return;

    setEnvoi(true);
    setErreur(null);
    setSucces(null);
    const supabase = creerClientNavigateur();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expirée : reconnectez-vous.');

      // Upsert : couvre le cas (rare) où la ligne profil manquerait.
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, pseudo: valeur }, { onConflict: 'id' })
        .select('pseudo')
        .single();
      if (error) throw error;

      // La valeur retenue est celle RELUE en base.
      const relu = (data as { pseudo?: string } | null)?.pseudo ?? valeur;
      setPseudo(relu);
      setEnregistre(relu);
      setSucces(`Pseudo enregistré : « ${relu} ».`);
      // La barre de navigation (rendue côté serveur) reprend le nouveau pseudo.
      routeur.refresh();
    } catch (e) {
      setErreur(
        e instanceof Error
          ? `Enregistrement impossible : ${e.message}`
          : 'Enregistrement impossible.'
      );
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="velours p-6" aria-label="Identité">
      <p className="sur-titre text-encre-300">Identité</p>

      <div className="flex items-center gap-4 mt-4">
        <div
          aria-hidden="true"
          className="w-12 h-12 shrink-0 rounded-full grid place-items-center text-lg font-display italic bg-gradient-to-br from-grenat-600 to-violet-rom-600 text-white shadow"
        >
          {reference.slice(0, 1).toUpperCase() || '·'}
        </div>
        <div className="min-w-0">
          <p className="text-encre-100 font-display text-xl leading-tight truncate">
            {reference}
          </p>
          <p className="text-encre-500 text-xs break-all">{email || '—'}</p>
        </div>
      </div>

      <form onSubmit={enregistrer} className="mt-5">
        <label
          htmlFor="profil-pseudo"
          className="text-xs text-encre-500 uppercase tracking-wider block mb-1.5"
        >
          Pseudo
        </label>
        <div className="flex flex-wrap items-start gap-2">
          <input
            id="profil-pseudo"
            name="pseudo"
            className="champ-sombre flex-1 min-w-[12rem]"
            value={pseudo}
            maxLength={LONGUEUR_MAX}
            autoComplete="nickname"
            onChange={(e) => {
              setPseudo(e.target.value);
              setSucces(null);
              setErreur(null);
            }}
            aria-invalid={invalide}
            aria-describedby="profil-pseudo-aide"
          />
          <button
            type="submit"
            className="bouton-principal"
            disabled={invalide || inchange || envoi}
          >
            {envoi ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
        <p
          id="profil-pseudo-aide"
          className="text-[11px] text-encre-500 mt-1.5"
        >
          Entre {LONGUEUR_MIN} et {LONGUEUR_MAX} caractères. C’est le nom affiché
          partout dans le studio.
        </p>

        <p role="status" aria-live="polite" className="min-h-[1.25rem] mt-2">
          {succes && <span className="text-[13px] text-emerald-300">{succes}</span>}
          {erreur && <span className="text-[13px] text-grenat-300">{erreur}</span>}
        </p>
      </form>

      <dl className="mt-2 pt-4 border-t border-nuit-700/60 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <dt className="text-encre-500 text-[11px] uppercase tracking-wider">
            E-mail
          </dt>
          <dd className="text-encre-100 text-xs break-all mt-1">{email || '—'}</dd>
        </div>
        <div>
          <dt className="text-encre-500 text-[11px] uppercase tracking-wider">
            Membre depuis
          </dt>
          <dd className="text-encre-100 text-xs mt-1">{formaterDate(depuis)}</dd>
        </div>
        <div>
          <dt className="text-encre-500 text-[11px] uppercase tracking-wider">
            Livres
          </dt>
          <dd className="text-encre-100 text-xs mt-1">{nbLivres}</dd>
        </div>
        <div>
          <dt className="text-encre-500 text-[11px] uppercase tracking-wider">
            Favoris
          </dt>
          <dd className="text-encre-100 text-xs mt-1">{nbFavoris}</dd>
        </div>
      </dl>

      <p className="text-encre-500 text-[11px] mt-4 leading-relaxed italic">
        L’adresse e-mail (identifiant de connexion) ne se modifie pas depuis cette
        page : son changement exige une confirmation par courriel, chantier à
        venir.
      </p>
    </section>
  );
}

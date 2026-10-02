'use client';

// Carte « Compte & données » du profil (/compte).
//
// · Déconnexion : met fin à la session Supabase et renvoie vers /connexion.
// · Suppression du compte : action RÉELLE et définitive. Elle appelle la
//   fonction Postgres public.supprimer_mon_compte() (security definer,
//   20261002000003_suppression_compte.sql) qui efface la ligne auth.users
//   de l'utilisateur ; profil, livres, chapitres, segments et favoris
//   tombent par cascade. Une saisie de confirmation (« SUPPRIMER ») évite
//   le clic malheureux.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { creerClientNavigateur } from '@/lib/supabase/client';

const MOT_CLE = 'SUPPRIMER';

export default function ActionsCompte({ email }: { email: string }) {
  const routeur = useRouter();
  const [deconnexionEnCours, setDeconnexionEnCours] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const refSaisie = useRef<HTMLInputElement>(null);

  // Le champ de confirmation prend le focus à l'ouverture ; Échap referme.
  useEffect(() => {
    if (!confirmation) return;
    refSaisie.current?.focus();
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConfirmation(false);
        setErreur(null);
      }
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [confirmation]);

  async function seDeconnecter() {
    if (deconnexionEnCours) return;
    setDeconnexionEnCours(true);
    const supabase = creerClientNavigateur();
    await supabase.auth.signOut().catch(() => undefined);
    routeur.push('/connexion');
    routeur.refresh();
  }

  async function supprimerCompte() {
    if (suppressionEnCours || saisie.trim().toUpperCase() !== MOT_CLE) return;
    setSuppressionEnCours(true);
    setErreur(null);
    const supabase = creerClientNavigateur();

    const { error } = await supabase.rpc('supprimer_mon_compte');
    if (error) {
      setErreur(`La suppression n’a pas abouti : ${error.message}`);
      setSuppressionEnCours(false);
      return;
    }

    // Le compte n'existe plus : la session est caduque, on la referme
    // (sans bloquer si l'appel échoue) puis on revient à l'accueil.
    await supabase.auth.signOut().catch(() => undefined);
    routeur.push('/');
    routeur.refresh();
  }

  const pretASupprimer = saisie.trim().toUpperCase() === MOT_CLE;

  return (
    <section className="velours p-6" aria-label="Compte et données">
      <p className="sur-titre text-encre-300">Compte &amp; données</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-encre-100 text-sm">Session ouverte</p>
          <p className="text-encre-500 text-xs break-all">{email || '—'}</p>
        </div>
        <button
          type="button"
          onClick={seDeconnecter}
          disabled={deconnexionEnCours}
          className="bouton-fantome"
        >
          {deconnexionEnCours ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </div>

      <div className="mt-5 pt-5 border-t border-nuit-700/60">
        <p className="text-encre-100 text-sm">Suppression définitive du compte</p>
        <p className="text-encre-500 text-xs mt-1.5 leading-relaxed">
          Efface votre compte et, en cascade, votre profil, vos livres, leurs
          chapitres, leurs segments et vos favoris. Action irréversible : aucun
          retour en arrière n’est possible.
        </p>

        {!confirmation ? (
          <button
            type="button"
            onClick={() => setConfirmation(true)}
            className="bouton-fantome !border-grenat-700/70 text-grenat-300 hover:!border-grenat-500 mt-4"
          >
            Supprimer mon compte
          </button>
        ) : (
          <div
            role="group"
            aria-label="Confirmer la suppression du compte"
            className="mt-4 rounded-xl border border-grenat-700/60 bg-grenat-700/10 p-4 animate-fondu-monte"
          >
            <label
              htmlFor="suppression-confirmation"
              className="text-xs text-encre-300 block leading-relaxed"
            >
              Pour confirmer, tapez <strong className="text-grenat-300">SUPPRIMER</strong>{' '}
              ci-dessous :
            </label>
            <input
              id="suppression-confirmation"
              ref={refSaisie}
              className="champ-sombre mt-2"
              value={saisie}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setSaisie(e.target.value);
                setErreur(null);
              }}
              aria-describedby="suppression-aide"
            />
            <p id="suppression-aide" className="sr-only">
              Saisissez le mot SUPPRIMER pour activer le bouton de confirmation.
            </p>

            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={supprimerCompte}
                disabled={!pretASupprimer || suppressionEnCours}
                className="bouton-principal"
              >
                {suppressionEnCours
                  ? 'Suppression en cours…'
                  : 'Confirmer la suppression définitive'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmation(false);
                  setSaisie('');
                  setErreur(null);
                }}
                disabled={suppressionEnCours}
                className="bouton-fantome"
              >
                Annuler
              </button>
            </div>

            <p role="alert" aria-live="assertive" className="min-h-[1.25rem] mt-2">
              {erreur && (
                <span className="text-[13px] text-grenat-300">{erreur}</span>
              )}
            </p>
          </div>
        )}

        <p className="text-encre-500 text-[11px] mt-4 leading-relaxed italic">
          Vous préférez conserver vos textes ? Exportez-les d’abord depuis chaque
          livre : la suppression, elle, n’attend pas.
        </p>
      </div>
    </section>
  );
}

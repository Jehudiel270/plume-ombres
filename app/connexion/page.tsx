'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { creerClientNavigateur } from '@/lib/supabase/client';

/** Longueur maximale du pseudo (alignée sur la contrainte SQL profiles.pseudo). */
const PSEUDO_MAX = 32;
const PSEUDO_MIN = 2;
const MOT_DE_PASSE_MIN = 8;

/** Force d'un mot de passe : 0 à 4 critères remplis. */
function forceMotDePasse(valeur: string): { score: number; libelle: string } {
  let score = 0;
  if (valeur.length >= MOT_DE_PASSE_MIN) score += 1;
  if (/[a-z]/.test(valeur) && /[A-Z]/.test(valeur)) score += 1;
  if (/\d/.test(valeur)) score += 1;
  if (/[^A-Za-z0-9]/.test(valeur)) score += 1;
  const libelle =
    valeur.length === 0
      ? ''
      : score <= 1
        ? 'Faible'
        : score === 2
          ? 'Moyen'
          : score === 3
            ? 'Bon'
            : 'Excellent';
  return { score, libelle };
}

/** Icône œil — affichage/masquage d'un mot de passe. */
function IconeOeil({ barre }: { barre: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.2 12S5.6 5.9 12 5.9 21.8 12 21.8 12 18.4 18.1 12 18.1 2.2 12 2.2 12Z" />
      <circle cx="12" cy="12" r="3.1" />
      {barre && <path d="M4 20 20 4" />}
    </svg>
  );
}

/** Bouton œil posé dans un champ de mot de passe (aucun libellé texte). */
function BoutonOeil({
  visible,
  basculer,
  champ,
}: {
  visible: boolean;
  basculer: () => void;
  champ: string;
}) {
  return (
    <button
      type="button"
      onClick={basculer}
      aria-label={visible ? `Masquer ${champ}` : `Afficher ${champ}`}
      aria-pressed={visible}
      title={visible ? 'Masquer' : 'Afficher'}
      className="absolute right-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full text-encre-500 hover:text-encre-200 hover:bg-nuit-800/70 transition-colors cursor-pointer"
    >
      <IconeOeil barre={visible} />
    </button>
  );
}

export default function Connexion() {
  return (
    <Suspense>
      <PageConnexion />
    </Suspense>
  );
}

function PageConnexion() {
  const routeur = useRouter();
  const paramsRecherche = useSearchParams();
  const suivant = paramsRecherche.get('suivant') ?? '/bibliotheque';

  // Arrivée depuis la landing page avec ?mode=inscription : on ouvre
  // directement l'onglet Inscription (le formulaire reste le même).
  const [mode, setMode] = useState<'connexion' | 'inscription'>(
    paramsRecherche.get('mode') === 'inscription' ? 'inscription' : 'connexion'
  );
  const [email, setEmail] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [voirMotDePasse, setVoirMotDePasse] = useState(false);
  const [voirConfirmation, setVoirConfirmation] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  // Message d'erreur éventuel transmis par /auth/confirmer (lien expiré).
  const [erreur, setErreur] = useState<string | null>(() => {
    const code = paramsRecherche.get('erreur');
    if (code === 'lien-expire') {
      return 'Ce lien a expiré. Demande un nouveau lien de réinitialisation.';
    }
    if (code === 'lien-invalide') {
      return 'Lien invalide. Demande un nouveau lien de réinitialisation.';
    }
    return null;
  });

  const force = forceMotDePasse(motDePasse);
  const pseudoPropre = pseudo.trim();
  const pseudoValide =
    mode === 'connexion' ||
    (pseudoPropre.length >= PSEUDO_MIN && pseudoPropre.length <= PSEUDO_MAX);
  const confirmationValide =
    mode === 'connexion' || (confirmation.length > 0 && confirmation === motDePasse);
  const motDePasseValide =
    mode === 'connexion' || (motDePasse.length >= MOT_DE_PASSE_MIN && force.score >= 2);

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    setErreur(null);

    if (mode === 'inscription') {
      if (!pseudoValide) {
        setErreur(`Le pseudo doit contenir entre ${PSEUDO_MIN} et ${PSEUDO_MAX} caractères.`);
        return;
      }
      if (motDePasse.length < MOT_DE_PASSE_MIN) {
        setErreur(`Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères.`);
        return;
      }
      if (force.score < 2) {
        setErreur(
          'Mot de passe trop faible : ajoute une majuscule, une minuscule, un chiffre ou un symbole.'
        );
        return;
      }
      if (confirmation !== motDePasse) {
        setErreur('Les deux mots de passe ne correspondent pas.');
        return;
      }
    }

    setEnvoi(true);
    const supabase = creerClientNavigateur();

    try {
      if (mode === 'inscription') {
        const pseudoFinal = pseudoPropre || email.split('@')[0].slice(0, PSEUDO_MAX);
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: motDePasse,
          options: { data: { pseudo: pseudoFinal } },
        });
        if (error) throw error;

        // Création du profil (si l'email n'exige pas de confirmation,
        // data.user est présent immédiatement).
        if (data.user) {
          const { error: errProfil } = await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              pseudo: pseudoFinal,
            });
          if (errProfil && !errProfil.message.includes('duplicate')) {
            console.warn('Profil non créé :', errProfil.message);
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: motDePasse,
        });
        if (error) throw error;
      }
      routeur.push(suivant);
      routeur.refresh();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Une erreur est survenue.';
      // Traductions usuelles des messages Supabase
      if (message.includes('Invalid login credentials')) {
        setErreur('Email ou mot de passe incorrect.');
      } else if (message.includes('already registered')) {
        setErreur('Un compte existe déjà avec cet email. Connecte-toi.');
      } else if (message.includes('Password should be at least')) {
        setErreur(`Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères.`);
      } else {
        setErreur(message);
      }
    } finally {
      setEnvoi(false);
    }
  }

  function basculer(m: 'connexion' | 'inscription') {
    setMode(m);
    setErreur(null);
    setConfirmation('');
  }

  const barresForce = ['bg-grenat-500', 'bg-grenat-400', 'bg-or-ros-400', 'bg-or-ros-300'];

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fondu-monte">
        {/* Emblème */}
        <div className="text-center mb-10">
          <Image
            src="/logo.png"
            alt="Plume d’Ombres"
            width={200}
            height={200}
            className="mx-auto h-28 w-28 md:h-32 md:w-32 object-contain mb-5 animate-fondu-monte"
          />
          <p className="text-grenat-400 tracking-[0.45em] text-xs uppercase mb-3 animate-lueur-lente">
            ✦ votre nuit vous attend ✦
          </p>
          <h1 className="font-display text-5xl md:text-6xl text-encre-100">
            Plume <span className="texte-douche italic">d’Ombres</span>
          </h1>
          <div className="liseret mx-auto mt-5" />
          <p className="text-encre-500 text-sm mt-4 font-lecture italic">
            Vos traductions sommeillent dans l’ombre.
          </p>
        </div>

        {/* Carte */}
        <div data-reveler="zoom" className="velours p-7 md:p-8">
          <div className="flex rounded-full bg-nuit-900 p-1 mb-7">
            {(['connexion', 'inscription'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => basculer(m)}
                className={`flex-1 rounded-full py-2 text-sm transition-all duration-300 cursor-pointer ${
                  mode === m
                    ? 'bg-nuit-700 text-encre-100 shadow'
                    : 'text-encre-500 hover:text-encre-300'
                }`}
              >
                {m === 'connexion' ? 'Connexion' : 'Inscription'}
              </button>
            ))}
          </div>

          <form onSubmit={soumettre} className="space-y-4">
            {mode === 'inscription' && (
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label
                    className="text-xs text-encre-500 uppercase tracking-wider"
                    htmlFor="pseudo"
                  >
                    Pseudo
                  </label>
                  <span
                    className={`text-[11px] tabular-nums ${
                      pseudoPropre.length > PSEUDO_MAX
                        ? 'text-grenat-300'
                        : 'text-encre-500'
                    }`}
                  >
                    {pseudo.length}/{PSEUDO_MAX}
                  </span>
                </div>
                <input
                  id="pseudo"
                  className="champ-sombre"
                  placeholder="Ex. Lectrice de minuit"
                  maxLength={PSEUDO_MAX}
                  required
                  autoComplete="nickname"
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value)}
                />
                <p className="text-[11px] text-encre-500 mt-1">
                  {PSEUDO_MIN} à {PSEUDO_MAX} caractères.
                </p>
              </div>
            )}
            <div>
              <label
                className="text-xs text-encre-500 uppercase tracking-wider block mb-1.5"
                htmlFor="email"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                className="champ-sombre"
                placeholder="vous@exemple.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label
                className="text-xs text-encre-500 uppercase tracking-wider block mb-1.5"
                htmlFor="mot-de-passe"
              >
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="mot-de-passe"
                  type={voirMotDePasse ? 'text' : 'password'}
                  required
                  minLength={mode === 'inscription' ? MOT_DE_PASSE_MIN : 6}
                  className="champ-sombre pr-12"
                  placeholder="••••••••"
                  autoComplete={mode === 'inscription' ? 'new-password' : 'current-password'}
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                />
                <BoutonOeil
                  visible={voirMotDePasse}
                  basculer={() => setVoirMotDePasse((v) => !v)}
                  champ="le mot de passe"
                />
              </div>

              {mode === 'inscription' && (
                <div className="mt-2">
                  <div className="flex gap-1" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                          i < force.score ? barresForce[Math.max(force.score - 1, 0)] : 'bg-nuit-700'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-encre-500 mt-1">
                    {motDePasse.length === 0
                      ? `Au moins ${MOT_DE_PASSE_MIN} caractères, avec majuscule, chiffre ou symbole.`
                      : `Force : ${force.libelle}`}
                  </p>
                </div>
              )}
            </div>

            {mode === 'inscription' && (
              <div>
                <label
                  className="text-xs text-encre-500 uppercase tracking-wider block mb-1.5"
                  htmlFor="confirmation"
                >
                  Confirmer le mot de passe
                </label>
                <div className="relative">
                  <input
                    id="confirmation"
                    type={voirConfirmation ? 'text' : 'password'}
                    required
                    className="champ-sombre pr-12"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                  <BoutonOeil
                    visible={voirConfirmation}
                    basculer={() => setVoirConfirmation((v) => !v)}
                    champ="la confirmation"
                  />
                </div>
                {confirmation.length > 0 && confirmation !== motDePasse && (
                  <p className="text-[11px] text-grenat-300 mt-1">
                    Les deux mots de passe ne correspondent pas.
                  </p>
                )}
              </div>
            )}

            {mode === 'connexion' && (
              <p className="text-right">
                <Link
                  href="/mot-de-passe-oublie"
                  className="text-xs text-encre-500 hover:text-encre-300 transition-colors"
                >
                  Mot de passe oublié ?
                </Link>
              </p>
            )}

            {erreur && (
              <p className="text-sm text-grenat-300 bg-grenat-700/20 border border-grenat-700/50 rounded-xl px-4 py-2.5 animate-fondu-monte">
                {erreur}
              </p>
            )}

            <button
              type="submit"
              disabled={
                envoi ||
                (mode === 'inscription' &&
                  (!pseudoValide ||
                    !motDePasseValide ||
                    !confirmationValide))
              }
              className="bouton-principal w-full !py-3"
            >
              {envoi
                ? 'Un instant…'
                : mode === 'inscription'
                  ? 'Créer mon compte'
                  : 'Entrer'}
            </button>
          </form>

          <p className="text-center text-xs text-encre-500 mt-6 leading-relaxed">
            {mode === 'connexion'
              ? 'Pas encore de compte ? '
              : 'Déjà un compte ? '}
            <button
              type="button"
              className="lien-discret cursor-pointer"
              onClick={() =>
                basculer(mode === 'connexion' ? 'inscription' : 'connexion')
              }
            >
              {mode === 'connexion' ? 'Inscris-toi' : 'Connecte-toi'}
            </button>{' '}
            — c’est gratuit.
          </p>
        </div>

        <p className="text-center text-[11px] text-encre-500 mt-6 font-lecture italic">
          Vos textes restent privés : chaque compte ne voit que ses propres
          livres.
        </p>
      </div>
    </main>
  );
}

'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { creerClientNavigateur } from '@/lib/supabase/client';

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

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    setEnvoi(true);
    setErreur(null);
    const supabase = creerClientNavigateur();

    try {
      if (mode === 'inscription') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: motDePasse,
          options: { data: { pseudo: pseudo || email.split('@')[0] } },
        });
        if (error) throw error;

        // Création du profil (si l'email n'exige pas de confirmation,
        // data.user est présent immédiatement).
        if (data.user) {
          const { error: errProfil } = await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              pseudo: pseudo || email.split('@')[0],
            });
          if (errProfil && !errProfil.message.includes('duplicate')) {
            console.warn('Profil non créé :', errProfil.message);
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
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
        setErreur('Le mot de passe doit contenir au moins 6 caractères.');
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
  }

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
        <div className="velours p-7 md:p-8">
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
                <label className="text-xs text-encre-500 uppercase tracking-wider block mb-1.5">
                  Pseudo
                </label>
                <input
                  className="champ-sombre"
                  placeholder="Ex. Lectrice de minuit"
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="text-xs text-encre-500 uppercase tracking-wider block mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                className="champ-sombre"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-encre-500 uppercase tracking-wider block mb-1.5">
                Mot de passe
              </label>
              <input
                type="password"
                required
                minLength={6}
                className="champ-sombre"
                placeholder="••••••••"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
              />
            </div>

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
              disabled={envoi}
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
